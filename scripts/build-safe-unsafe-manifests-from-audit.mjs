#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function canonicalizeRelPath(rawRel) {
  if (typeof rawRel !== "string") return "";
  let s = rawRel.trim();
  if (!s) return "";
  s = s.replace(/\\/g, "/");
  s = s.replace(/^\.(\/)+/, "");
  s = s.replace(/^\//, "");
  // Our shipped manifests usually prefix relPath with "presets/".
  if (s.toLowerCase().startsWith("presets/")) s = s.slice("presets/".length);
  return s;
}

function parseArgs(argv) {
  const args = {
    fullIn: "public/presets/library-manifest.v1.json",
    auditIn: "artifacts/presets/audit/preset-audit.json",
    outSafe: "public/presets/library-manifest.v1.safe.json",
    outUnsafe: "public/presets/library-manifest.v1.unsafe.json",
    reportOut: "artifacts/presets/audit/safe-unsafe.report.json",

    // If an audit entry has no quality (e.g. probe disabled), decide where it goes.
    // - unsafe: default safest
    // - drop: exclude from both manifests
    // - safe: include in safe (NOT recommended)
    missingQuality: "unsafe",

    // If quality exists but is not ok, you can still choose to keep it in safe.
    // This is mainly for experimentation.
    allowBadInSafe: false,

    // Optional: also enforce wasmCompat.ok !== false for safe
    requireWasmCompatOk: false,

    help: false,
  };

  const argMap = new Map();
  {
    const tokens = argv.slice(2);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token || !String(token).startsWith("--")) continue;
      const body = String(token).slice(2);
      if (!body) continue;

      if (body.includes("=")) {
        const [key, rawValue] = body.split("=");
        if (key) argMap.set(key, rawValue ?? "true");
        continue;
      }

      const key = body;
      const next = tokens[i + 1];
      if (next && !String(next).startsWith("--")) {
        argMap.set(key, next);
        i += 1;
      } else {
        argMap.set(key, "true");
      }
    }
  }

  // NPM on Windows can sometimes fail to forward `-- ...` args as process.argv.
  // Best-effort fallback: parse npm_config_argv (JSON string) to recover them.
  if (process.env.npm_config_argv) {
    try {
      const meta = JSON.parse(process.env.npm_config_argv);
      const raw =
        (Array.isArray(meta?.remain) && meta.remain) ||
        (Array.isArray(meta?.original) && meta.original) ||
        (Array.isArray(meta?.cooked) && meta.cooked) ||
        [];
      const tokens = raw.filter((t) => typeof t === "string");
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (!token || !token.startsWith("--")) continue;
        const body = token.slice(2);
        if (!body) continue;
        if (body.includes("=")) {
          const [key, rawValue] = body.split("=");
          if (key && !argMap.has(key)) argMap.set(key, rawValue ?? "true");
          continue;
        }
        const key = body;
        const next = tokens[i + 1];
        if (next && !next.startsWith("--")) {
          if (!argMap.has(key)) argMap.set(key, next);
          i += 1;
        } else {
          if (!argMap.has(key)) argMap.set(key, "true");
        }
      }
    } catch {
      // ignore
    }
  }

  const resolveArg = (key, fallback) => {
    if (!argMap.has(key)) return fallback;
    const value = argMap.get(key);
    return value ?? fallback;
  };

  // Also support positional args (useful when npm eats flags):
  //   node script <auditIn> <fullIn> <outSafe> <outUnsafe> <reportOut> [missingQuality]
  const tokens = argv.slice(2).map(String);
  const positionals = tokens.filter((t) => t && !t.startsWith("--"));
  const positionalAuditIn = positionals[0];
  const positionalFullIn = positionals[1];
  const positionalOutSafe = positionals[2];
  const positionalOutUnsafe = positionals[3];
  const positionalReportOut = positionals[4];
  const positionalMissingQuality = positionals[5];

  const fullIn = resolveArg("fullIn", positionalFullIn ?? args.fullIn);
  const auditIn = resolveArg("auditIn", positionalAuditIn ?? args.auditIn);
  const outSafe = resolveArg("outSafe", positionalOutSafe ?? args.outSafe);
  const outUnsafe = resolveArg("outUnsafe", positionalOutUnsafe ?? args.outUnsafe);
  const reportOut = resolveArg("reportOut", positionalReportOut ?? args.reportOut);

  args.fullIn = String(fullIn);
  args.auditIn = String(auditIn);
  args.outSafe = String(outSafe);
  args.outUnsafe = String(outUnsafe);
  args.reportOut = String(reportOut);

  args.missingQuality = String(
    resolveArg("missingQuality", positionalMissingQuality ?? args.missingQuality)
  )
    .trim()
    .toLowerCase();

  if (resolveArg("allowBadInSafe", null) != null) {
    args.allowBadInSafe = String(resolveArg("allowBadInSafe", "false"))
      .trim()
      .toLowerCase() !== "false";
  }

  if (resolveArg("requireWasmCompatOk", null) != null) {
    args.requireWasmCompatOk = String(resolveArg("requireWasmCompatOk", "false"))
      .trim()
      .toLowerCase() !== "false";
  }

  if (argMap.has("help") || argMap.has("h")) args.help = true;

  if (!['unsafe','drop','safe'].includes(args.missingQuality)) {
    throw new Error(`Invalid --missingQuality: ${args.missingQuality} (expected unsafe|drop|safe)`);
  }

  return args;
}

function validateManifestVersion(manifest) {
  const v = String(manifest?.version ?? "");
  if (v !== "v0" && v !== "v1" && v !== "v2" && v !== "v3") {
    throw new Error(`Unsupported manifest version: ${v}`);
  }
}

function normalizeId(entry) {
  return entry?.id ?? entry?.relPath ?? null;
}

function isWasmCompatOk(entry) {
  return entry?.wasmCompat?.ok !== false;
}

async function loadJson(p) {
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(
      "Usage: node scripts/build-safe-unsafe-manifests-from-audit.mjs --auditIn <preset-audit.json> [--fullIn <library-manifest.v1.json>] [--outSafe <...>] [--outUnsafe <...>]\n" +
        "\n" +
        "Options:\n" +
        "  --missingQuality unsafe|drop|safe\n" +
        "  --allowBadInSafe true|false\n" +
        "  --requireWasmCompatOk true|false\n"
    );
    return;
  }

  const repoRoot = path.resolve(process.cwd());
  const fullInPath = path.resolve(repoRoot, args.fullIn);
  const auditInPath = path.resolve(repoRoot, args.auditIn);
  const outSafePath = path.resolve(repoRoot, args.outSafe);
  const outUnsafePath = path.resolve(repoRoot, args.outUnsafe);
  const reportOutPath = path.resolve(repoRoot, args.reportOut);

  const manifest = await loadJson(fullInPath);
  validateManifestVersion(manifest);
  const presets = Array.isArray(manifest?.presets) ? manifest.presets : [];

  const audit = await loadJson(auditInPath);
  const auditEntries = Array.isArray(audit?.entries) ? audit.entries : [];

  const auditByRelPath = new Map();
  const auditByBaseName = new Map();
  const baseNameConflicts = new Set();
  for (const e of auditEntries) {
    const rel = typeof e?.relPath === "string" ? e.relPath : "";
    const canon = canonicalizeRelPath(rel);
    if (!canon) continue;

    // Store the canonical form and a common manifest-prefixed form.
    auditByRelPath.set(canon, e);
    auditByRelPath.set(`presets/${canon}`, e);

    // Basename fallback only if unambiguous.
    const base = path.posix.basename(canon);
    if (base) {
      if (baseNameConflicts.has(base)) continue;
      if (auditByBaseName.has(base)) {
        auditByBaseName.delete(base);
        baseNameConflicts.add(base);
      } else {
        auditByBaseName.set(base, e);
      }
    }
  }

  const safe = [];
  const unsafe = [];

  const stats = {
    totalInManifest: presets.length,
    totalWithAuditEntry: 0,
    totalMissingAuditEntry: 0,

    totalWithQuality: 0,
    totalMissingQuality: 0,

    safe: 0,
    unsafe: 0,
    dropped: 0,

    reasons: {},
    tags: {},
  };

  const addCounts = (obj, key) => {
    if (!key) return;
    obj[key] = (obj[key] ?? 0) + 1;
  };

  const classify = (preset) => {
    const relPath = typeof preset?.relPath === "string" ? preset.relPath : "";
    const id = normalizeId(preset);
    if (!relPath || !id) {
      stats.dropped++;
      return;
    }

    const canonPresetRel = canonicalizeRelPath(relPath);
    const auditEntry =
      auditByRelPath.get(relPath) ??
      (canonPresetRel ? auditByRelPath.get(canonPresetRel) : null) ??
      (canonPresetRel ? auditByRelPath.get(`presets/${canonPresetRel}`) : null) ??
      (canonPresetRel ? auditByBaseName.get(path.posix.basename(canonPresetRel)) : null) ??
      null;
    if (!auditEntry) {
      stats.totalMissingAuditEntry++;
      // No audit entry: treat as missing quality.
      if (args.missingQuality === "drop") {
        stats.dropped++;
        return;
      }
      if (args.missingQuality === "safe") {
        if (args.requireWasmCompatOk && !isWasmCompatOk(preset)) {
          unsafe.push(preset);
          stats.unsafe++;
          addCounts(stats.reasons, "wasmCompat:not-ok");
          return;
        }
        safe.push(preset);
        stats.safe++;
        addCounts(stats.reasons, "missing-audit-entry");
        return;
      }

      // default unsafe
      unsafe.push(preset);
      stats.unsafe++;
      addCounts(stats.reasons, "missing-audit-entry");
      return;
    }

    stats.totalWithAuditEntry++;

    const quality = auditEntry?.quality ?? null;
    const tags = Array.isArray(auditEntry?.tags) ? auditEntry.tags.map(String) : [];
    for (const t of tags) addCounts(stats.tags, t);

    if (!quality) {
      stats.totalMissingQuality++;
      if (args.missingQuality === "drop") {
        stats.dropped++;
        addCounts(stats.reasons, "missing-quality");
        return;
      }
      if (args.missingQuality === "safe") {
        if (args.requireWasmCompatOk && !isWasmCompatOk(preset)) {
          unsafe.push(preset);
          stats.unsafe++;
          addCounts(stats.reasons, "wasmCompat:not-ok");
          return;
        }
        safe.push(preset);
        stats.safe++;
        addCounts(stats.reasons, "missing-quality");
        return;
      }

      unsafe.push(preset);
      stats.unsafe++;
      addCounts(stats.reasons, "missing-quality");
      return;
    }

    stats.totalWithQuality++;

    const ok = Boolean(quality.ok);
    if (ok) {
      if (args.requireWasmCompatOk && !isWasmCompatOk(preset)) {
        unsafe.push(preset);
        stats.unsafe++;
        addCounts(stats.reasons, "wasmCompat:not-ok");
        return;
      }
      safe.push(preset);
      stats.safe++;
      return;
    }

    // not ok
    const reasons = Array.isArray(quality?.reasons) ? quality.reasons.map(String) : [];
    for (const r of reasons) addCounts(stats.reasons, r);

    if (args.allowBadInSafe) {
      safe.push(preset);
      stats.safe++;
      addCounts(stats.reasons, "allowBadInSafe:true");
      return;
    }

    unsafe.push(preset);
    stats.unsafe++;
  };

  for (const p of presets) classify(p);

  const outSafeManifest = {
    ...manifest,
    generatedAt: new Date().toISOString(),
    sourceRoot: `${manifest.sourceRoot ?? ""} (safe-from-audit)`.trim(),
    totalPresetsIncluded: safe.length,
    presets: safe,
  };

  const outUnsafeManifest = {
    ...manifest,
    generatedAt: new Date().toISOString(),
    sourceRoot: `${manifest.sourceRoot ?? ""} (unsafe-from-audit)`.trim(),
    totalPresetsIncluded: unsafe.length,
    presets: unsafe,
  };

  await fs.mkdir(path.dirname(outSafePath), { recursive: true });
  await fs.mkdir(path.dirname(outUnsafePath), { recursive: true });
  await fs.writeFile(outSafePath, JSON.stringify(outSafeManifest, null, 2) + "\n", "utf8");
  await fs.writeFile(outUnsafePath, JSON.stringify(outUnsafeManifest, null, 2) + "\n", "utf8");

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      fullIn: args.fullIn,
      auditIn: args.auditIn,
    },
    outputs: {
      outSafe: args.outSafe,
      outUnsafe: args.outUnsafe,
    },
    policy: {
      missingQuality: args.missingQuality,
      allowBadInSafe: args.allowBadInSafe,
      requireWasmCompatOk: args.requireWasmCompatOk,
    },
    stats,
  };

  await fs.mkdir(path.dirname(reportOutPath), { recursive: true });
  await fs.writeFile(reportOutPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(`Wrote safe manifest:   ${path.relative(repoRoot, outSafePath)} (${safe.length})`);
  console.log(`Wrote unsafe manifest: ${path.relative(repoRoot, outUnsafePath)} (${unsafe.length})`);
  console.log(`Wrote report:          ${path.relative(repoRoot, reportOutPath)}`);
}

main().catch((err) => {
  console.error("[build-safe-unsafe] Failed:", err);
  process.exit(1);
});
