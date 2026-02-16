#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const argMap = new Map();
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

  const resolveArg = (key, fallback) => {
    if (!argMap.has(key)) return fallback;
    const value = argMap.get(key);
    return value ?? fallback;
  };

  const parseBool = (value, fallback = false) => {
    if (value == null) return fallback;
    const s = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(s)) return true;
    if (["0", "false", "no", "n", "off"].includes(s)) return false;
    return fallback;
  };

  const inPath = String(resolveArg("in", resolveArg("input", ""))).trim();
  const outPath = String(resolveArg("out", resolveArg("output", ""))).trim();
  const inplace = parseBool(resolveArg("inplace", undefined), false);
  const dryRun = parseBool(resolveArg("dryRun", undefined), false);

  const reasonsRaw = String(resolveArg("reasons", resolveArg("reason", ""))).trim();
  const reasons = reasonsRaw
    ? reasonsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const maxEditsValue = Number(resolveArg("maxEdits", resolveArg("limit", "0")));
  const maxEdits =
    Number.isFinite(maxEditsValue) && maxEditsValue > 0
      ? Math.floor(maxEditsValue)
      : 0;

  const help = argMap.has("help") || argMap.has("h");

  return {
    inPath,
    outPath,
    inplace,
    dryRun,
    reasons,
    maxEdits,
    help,
  };
}

async function atomicWriteText(filePath, content) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, filePath);
}

function isFatalEntry(entry) {
  const warnings = Array.isArray(entry?.warnings) ? entry.warnings.map(String) : [];
  return warnings.includes("binary-nul") || warnings.includes("read-failed");
}

function matchesReasons(quality, needles) {
  if (!needles.length) return false;
  const reasons = Array.isArray(quality?.reasons) ? quality.reasons.map(String) : [];
  const errorText = String(quality?.errorText ?? "");
  for (const needle of needles) {
    if (!needle) continue;
    if (reasons.some((r) => r.includes(needle))) return true;
    if (errorText.includes(needle)) return true;
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.inPath) {
    console.log("Prepare preset-audit.json for selective re-probe");
    console.log(
      "Usage: node scripts/prepare-audit-for-reprobe.mjs --in <preset-audit.json> --reasons <comma,separated,needles> [--inplace true] [--out <path>] [--dryRun true] [--maxEdits N]"
    );
    console.log("");
    console.log("Notes:");
    console.log(
      "- This tool removes `entry.quality` (+ sets `probedAt=null`) when any reason contains any needle."
    );
    console.log(
      "- After that, run `node scripts/preset-audit.mjs --resume true --probeMissing true` to backfill quality."
    );
    process.exitCode = args.help ? 0 : 2;
    return;
  }

  if (!args.reasons.length) {
    console.error("[prepare-audit-for-reprobe] Missing --reasons");
    process.exit(2);
  }

  const inputPath = path.resolve(process.cwd(), args.inPath);
  const outputPath = args.inplace
    ? inputPath
    : path.resolve(process.cwd(), args.outPath || inputPath.replace(/\.json$/i, ".reprobe.json"));

  const raw = await fs.readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];

  let edited = 0;
  let skippedFatal = 0;
  let skippedNoQuality = 0;

  for (const entry of entries) {
    if (maxEdits && edited >= maxEdits) break;
    if (!entry || typeof entry !== "object") continue;
    if (isFatalEntry(entry)) {
      skippedFatal += 1;
      continue;
    }
    const quality = entry.quality ?? null;
    if (!quality) {
      skippedNoQuality += 1;
      continue;
    }
    if (!matchesReasons(quality, args.reasons)) continue;

    delete entry.quality;
    entry.probedAt = null;
    edited += 1;
  }

  const summary = {
    input: inputPath,
    output: outputPath,
    inplace: args.inplace,
    dryRun: args.dryRun,
    reasonsNeedles: args.reasons,
    maxEdits: args.maxEdits || null,
    stats: {
      totalEntries: entries.length,
      edited,
      skippedFatal,
      skippedNoQuality,
    },
  };

  console.log("[prepare-audit-for-reprobe] Summary:", JSON.stringify(summary, null, 2));

  if (args.dryRun) return;

  if (args.inplace) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${inputPath}.${ts}.bak`;
    await fs.copyFile(inputPath, backupPath);
    console.log(`[prepare-audit-for-reprobe] Backup: ${backupPath}`);
  }

  parsed.updatedAt = new Date().toISOString();
  parsed.reprobePreparedAt = new Date().toISOString();
  parsed.reprobePolicy = {
    reasonsNeedles: args.reasons,
    edited,
  };
  const outText = JSON.stringify(parsed, null, 2) + "\n";

  await atomicWriteText(outputPath, outText);
  console.log(`[prepare-audit-for-reprobe] Wrote: ${outputPath}`);
}

main().catch((err) => {
  console.error("[prepare-audit-for-reprobe] Failed:", err);
  process.exit(1);
});

