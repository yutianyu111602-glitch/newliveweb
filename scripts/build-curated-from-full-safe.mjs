import fs from "node:fs/promises";
import path from "node:path";

function asBool(v, defaultValue = true) {
  if (v == null) return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (!s) return defaultValue;
  if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
  if (s === "false" || s === "0" || s === "no" || s === "n") return false;
  return defaultValue;
}

function parseLimit(value, flagName) {
  if (value == null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid ${flagName}: ${value}`);
  }
  return Math.floor(n);
}

function parseArgs(argv) {
  const args = {
    // Inputs
    safeIn: "public/presets/library-manifest.v1.safe.json",
    fullIn: "public/presets/library-manifest.v1.json",

    // Outputs
    outSafe: "public/presets-curated/library-manifest.v1.safe.json",
    outAll: "public/presets-curated/library-manifest.v1.json",
    reportOut: "artifacts/preset-curation/curated-from-full-safe.report.json",

    // Optional external audit file (from scripts/preset-audit.mjs)
    auditIn: "",

    // Limits
    // - limitSafe: selection size from safeIn (defaults to all safe presets)
    // - limitAll: total selection size for outAll (defaults to all safe + extra)
    limitSafe: undefined,
    limitAll: undefined,

    seed: "curated-from-full-safe",
    buckets: 12,
    excludeDark: true,
    excludeBright: true,
    excludeLowMotion: true,
    excludeProbeAborts: false,

    tier: "",
    motionMin: undefined,
    bandTargets: "",

    // Rule scan knobs (used for fullIn candidates when filling outAll)
    // Keep conservative defaults; this is for "curated", not "full".
    maxLineCount: 2200,
    maxShader: 10,
    maxPerPixel: 25,
    maxCharCount: 120000,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    // Backwards compat flags
    if (a === "--in" && next) {
      args.safeIn = next;
      i++;
    } else if (a === "--out" && next) {
      args.outSafe = next;
      i++;
    } else if (a === "--safeIn" && next) {
      args.safeIn = next;
      i++;
    } else if (a === "--fullIn" && next) {
      args.fullIn = next;
      i++;
    } else if (a === "--outSafe" && next) {
      args.outSafe = next;
      i++;
    } else if (a === "--outAll" && next) {
      args.outAll = next;
      i++;
    } else if (a === "--reportOut" && next) {
      args.reportOut = next;
      i++;
    } else if (a === "--auditIn" && next) {
      args.auditIn = next;
      i++;
    } else if (a === "--limit" && next) {
      // Backwards compat: treat --limit as safe limit (original script only produced safe)
      args.limitSafe = parseLimit(next, "--limit");
      i++;
    } else if (a === "--limitSafe" && next) {
      args.limitSafe = parseLimit(next, "--limitSafe");
      i++;
    } else if (a === "--limitAll" && next) {
      args.limitAll = parseLimit(next, "--limitAll");
      i++;
    } else if (a === "--seed" && next) {
      args.seed = next;
      i++;
    } else if (a === "--buckets" && next) {
      const n = Number(next);
      if (!Number.isFinite(n) || n < 2 || n > 64) {
        throw new Error(`Invalid --buckets: ${next} (expected 2..64)`);
      }
      args.buckets = Math.floor(n);
      i++;
    } else if (a === "--excludeDark" && next) {
      args.excludeDark = asBool(next, true);
      i++;
    } else if (a === "--excludeBright" && next) {
      args.excludeBright = asBool(next, true);
      i++;
    } else if (a === "--excludeLowMotion" && next) {
      args.excludeLowMotion = asBool(next, true);
      i++;
    } else if (a === "--excludeProbeAborts" && next) {
      args.excludeProbeAborts = asBool(next, false);
      i++;
    } else if (a === "--tier" && next) {
      args.tier = String(next || "").trim();
      i++;
    } else if (a === "--motionMin" && next) {
      const n = Number(next);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`Invalid --motionMin: ${next}`);
      }
      args.motionMin = n;
      i++;
    } else if (a === "--bandTargets" && next) {
      args.bandTargets = next;
      i++;
    } else if (a === "--maxLineCount" && next) {
      const n = Number(next);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --maxLineCount: ${next}`);
      args.maxLineCount = Math.floor(n);
      i++;
    } else if (a === "--maxCharCount" && next) {
      const n = Number(next);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --maxCharCount: ${next}`);
      args.maxCharCount = Math.floor(n);
      i++;
    } else if (a === "--maxShader" && next) {
      const n = Number(next);
      if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid --maxShader: ${next}`);
      args.maxShader = Math.floor(n);
      i++;
    } else if (a === "--maxPerPixel" && next) {
      const n = Number(next);
      if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid --maxPerPixel: ${next}`);
      args.maxPerPixel = Math.floor(n);
      i++;
    } else if (a === "-h" || a === "--help") {
      return { ...args, help: true };
    } else {
      throw new Error(`Unknown arg: ${a}`);
    }
  }

  return args;
}

function getMotionMinForTier(tier) {
  const t = String(tier || "").trim().toLowerCase();
  if (!t) return undefined;
  if (t === "dark") return 0.008;
  if (t === "relaxed") return 0.015;
  if (t === "strict") return 0.025;
  if (t === "slow") return 0.004;
  return undefined;
}

function stableHash32(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function numberPercentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function isWasmCompatOk(entry) {
  // Treat missing wasmCompat as "unknown" (allowed), but explicit ok=false is excluded.
  return entry?.wasmCompat?.ok !== false;
}

function getNumberField(entry, path, fallback = 0) {
  let cur = entry;
  for (const k of path) {
    if (!cur || typeof cur !== "object") return fallback;
    cur = cur[k];
  }
  const n = Number(cur);
  return Number.isFinite(n) ? n : fallback;
}

function complexityScore(entry) {
  const lineCount = entry?.stats?.lineCount ?? 0;
  const charCount = entry?.stats?.charCount ?? 0;
  const k = entry?.keywords ?? {};

  // Heuristic: prefer moderate complexity; penalize very high per_pixel/shader usage.
  const perPixel = Number(k.per_pixel ?? 0);
  const shader = Number(k.shader ?? 0);
  const warp = Number(k.warp ?? 0);
  const wave = Number(k.wave ?? 0);

  // Normalize a bit; keep it simple and stable.
  const score =
    lineCount * 0.6 +
    charCount * 0.0005 +
    perPixel * 80 +
    shader * 40 +
    warp * 3 +
    wave * 0.02;

  return score;
}

function bucketIndex(score, min, max, buckets) {
  if (!Number.isFinite(score) || buckets <= 1) return 0;
  const span = Math.max(1e-9, max - min);
  const t = Math.min(0.999999, Math.max(0, (score - min) / span));
  return Math.floor(t * buckets);
}

function validateManifestVersion(manifest, label) {
  const v = String(manifest?.version ?? "");
  if (v !== "v0" && v !== "v1" && v !== "v2" && v !== "v3") {
    throw new Error(`${label} manifest has unsupported version: ${v}`);
  }
}

function normalizePresetId(entry) {
  return entry?.id ?? entry?.relPath ?? null;
}

function scanRisk(entry, args) {
  const flags = [];
  const lineCount = getNumberField(entry, ["stats", "lineCount"], 0);
  const charCount = getNumberField(entry, ["stats", "charCount"], 0);
  const fileSize = getNumberField(entry, ["fileSize"], 0);
  const k = entry?.keywords ?? null;
  const shader = k ? Number(k.shader ?? 0) : null;
  const perPixel = k ? Number(k.per_pixel ?? 0) : null;

  if (!entry?.stats) flags.push("missing:stats");
  if (!entry?.keywords) flags.push("missing:keywords");

  if (lineCount > args.maxLineCount) flags.push("limit:lineCount");
  if (charCount > args.maxCharCount) flags.push("limit:charCount");
  if (fileSize > 256 * 1024) flags.push("limit:fileSize");
  if (Number.isFinite(shader) && shader > args.maxShader) flags.push("limit:shader");
  if (Number.isFinite(perPixel) && perPixel > args.maxPerPixel) flags.push("limit:per_pixel");

  // A simple severity score to help report distribution.
  const severity =
    (flags.includes("limit:lineCount") ? 3 : 0) +
    (flags.includes("limit:charCount") ? 3 : 0) +
    (flags.includes("limit:fileSize") ? 2 : 0) +
    (flags.includes("limit:shader") ? 2 : 0) +
    (flags.includes("limit:per_pixel") ? 2 : 0) +
    (flags.includes("missing:stats") ? 1 : 0) +
    (flags.includes("missing:keywords") ? 1 : 0);

  const okForCurated =
    !flags.some((f) => f.startsWith("limit:"));

  return {
    okForCurated,
    severity,
    flags,
  };
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function loadAuditMap(auditInPath) {
  if (!auditInPath) return null;
  try {
    const auditRaw = await fs.readFile(auditInPath, "utf8");
    const audit = JSON.parse(auditRaw);
    const entries = Array.isArray(audit?.entries) ? audit.entries : [];
    const map = new Map();
    for (const e of entries) {
      const relPath = typeof e?.relPath === "string" ? e.relPath : "";
      if (!relPath) continue;
      map.set(relPath, {
        tags: Array.isArray(e?.tags) ? e.tags.map(String) : [],
        primaryCategory:
          typeof e?.primaryCategory === "string" ? e.primaryCategory : "other",
        quality: e?.quality ?? null,
      });
    }
    return map;
  } catch (err) {
    throw new Error(`Failed to read audit file: ${auditInPath} (${String(err)})`);
  }
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .toLowerCase();
}

async function loadBandTargetsMap(bandTargetsPath) {
  if (!bandTargetsPath) return null;
  try {
    const raw = await fs.readFile(bandTargetsPath, "utf8");
    const json = JSON.parse(raw);
    const categorized = json?.categorized ?? {};
    const map = new Map();
    for (const [bandClass, items] of Object.entries(categorized)) {
      if (!Array.isArray(items)) continue;
      for (const entry of items) {
        const key = normalizeKey(entry);
        if (!key) continue;
        map.set(key, String(bandClass));
      }
    }
    return map;
  } catch (err) {
    throw new Error(`Failed to read bandTargets: ${bandTargetsPath} (${String(err)})`);
  }
}

function applyAuditFilters(p, auditByRelPath, args, counters) {
  if (!auditByRelPath) return true;
  const relPath = typeof p?.relPath === "string" ? p.relPath : "";
  const audit = relPath ? auditByRelPath.get(relPath) : null;
  if (!audit) {
    counters.missingAudit++;
    return true;
  }
  const tags = new Set(audit.tags ?? []);
  const reasons = Array.isArray(audit?.quality?.reasons)
    ? audit.quality.reasons.map(String)
    : [];

  if (args.excludeDark && tags.has("dark")) {
    counters.filteredOutByAuditDark++;
    return false;
  }
  if (args.excludeBright && tags.has("bright")) {
    counters.filteredOutByAuditBright++;
    return false;
  }
  if (
    args.excludeLowMotion &&
    (tags.has("low-motion") || reasons.includes("no-motion-sample"))
  ) {
    counters.filteredOutByAuditLowMotion++;
    return false;
  }
  if (args.excludeLowMotion && args.motionMin != null) {
    const motion = Number(audit?.quality?.avgFrameDelta);
    if (Number.isFinite(motion) && motion < args.motionMin) {
      counters.filteredOutByAuditLowMotion++;
      return false;
    }
  }
  if (
    args.excludeProbeAborts &&
    (audit?.quality?.aborted === true || reasons.includes("wasm-abort"))
  ) {
    counters.filteredOutByAuditAborts++;
    return false;
  }

  return true;
}

function getBandClassForEntry(entry, bandTargetsMap) {
  if (!bandTargetsMap) return null;
  const candidates = [entry?.id, entry?.relPath, entry?.fileName];
  for (const raw of candidates) {
    const key = normalizeKey(raw);
    if (!key) continue;
    const band = bandTargetsMap.get(key);
    if (band) return band;
  }
  return null;
}

function applyBandClass(entry, bandTargetsMap) {
  const bandClass = getBandClassForEntry(entry, bandTargetsMap);
  if (!bandClass) return entry;
  return { ...entry, bandClass };
}

function computeCoverage(presets) {
  let missingStats = 0;
  let missingKeywords = 0;
  for (const p of presets) {
    if (!p?.stats) missingStats++;
    if (!p?.keywords) missingKeywords++;
  }
  return { missingStats, missingKeywords };
}

function selectWithDiversity({ presets, manifestGeneratedAt, seedLabel, limit, buckets, auditByRelPath }) {
  const scores = presets
    .map((p) => complexityScore(p))
    .filter((n) => Number.isFinite(n));
  scores.sort((a, b) => a - b);
  const minScore = scores[0] ?? 0;
  const maxScore = scores[scores.length - 1] ?? 0;

  const actualLimit = limit ?? presets.length;
  const seed = stableHash32(`${seedLabel}|${presets.length}|${manifestGeneratedAt ?? ""}`);
  const rng = mulberry32(seed);

  const groups = new Map();
  const groupOrder = [];

  const getGroupKey = (p) => {
    const s = complexityScore(p);
    const bi = bucketIndex(s, minScore, maxScore, buckets);
    if (!auditByRelPath) return `b${bi}`;
    const relPath = typeof p?.relPath === "string" ? p.relPath : "";
    const audit = relPath ? auditByRelPath.get(relPath) : null;
    const cat = audit?.primaryCategory ?? "other";
    return `${cat}|b${bi}`;
  };

  for (const p of presets) {
    const key = getGroupKey(p);
    if (!groups.has(key)) {
      groups.set(key, []);
      groupOrder.push(key);
    }
    groups.get(key).push(p);
  }

  for (const key of groupOrder) {
    const b = groups.get(key);
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
  }

  const selected = [];
  const selectedIds = new Set();
  const pushUnique = (p) => {
    const id = normalizePresetId(p);
    if (!id) return false;
    if (selectedIds.has(id)) return false;
    selectedIds.add(id);
    selected.push(p);
    return true;
  };

  if (actualLimit >= presets.length) {
    for (const p of presets) pushUnique(p);
  } else {
    const groupKeys = groupOrder.filter((k) => (groups.get(k)?.length ?? 0) > 0);
    const groupCount = groupKeys.length;
    const base = Math.floor(actualLimit / Math.max(1, groupCount));
    let remainder = actualLimit - base * groupCount;

    const quotas = new Map();
    for (const k of groupKeys) quotas.set(k, base);

    const bySize = [...groupKeys].sort((a, b) => {
      const da = groups.get(a).length;
      const db = groups.get(b).length;
      if (db !== da) return db - da;
      return a.localeCompare(b);
    });
    for (const k of bySize) {
      if (remainder <= 0) break;
      quotas.set(k, (quotas.get(k) ?? 0) + 1);
      remainder--;
    }

    const cursors = new Map();
    for (const k of groupKeys) cursors.set(k, 0);

    for (const k of groupKeys) {
      const b = groups.get(k);
      const want = quotas.get(k) ?? 0;
      let c = cursors.get(k) ?? 0;
      for (let i = 0; i < want && c < b.length && selected.length < actualLimit; i++) {
        pushUnique(b[c++]);
      }
      cursors.set(k, c);
    }

    let progressed = true;
    while (selected.length < actualLimit && progressed) {
      progressed = false;
      for (const k of groupKeys) {
        if (selected.length >= actualLimit) break;
        const b = groups.get(k);
        let c = cursors.get(k) ?? 0;
        while (c < b.length && selected.length < actualLimit) {
          const ok = pushUnique(b[c++]);
          if (ok) {
            progressed = true;
            break;
          }
        }
        cursors.set(k, c);
      }
    }
  }

  return { selected, selectedIds, minScore, maxScore, scores };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(
      `Usage: node scripts/build-curated-from-full-safe.mjs [--safeIn PATH] [--fullIn PATH] [--outSafe PATH] [--outAll PATH] [--reportOut PATH] [--auditIn PATH] [--bandTargets PATH] [--tier NAME] [--motionMin N] [--limitSafe N] [--limitAll N] [--seed STR] [--buckets N]\n\nBack-compat flags:\n  --in PATH        (alias for --safeIn)\n  --out PATH       (alias for --outSafe)\n  --limit N        (alias for --limitSafe)\n\nFiltering (requires --auditIn):\n  --excludeDark true|false\n  --excludeBright true|false\n  --excludeLowMotion true|false\n  --excludeProbeAborts true|false\n  --tier NAME               (dark|relaxed|strict|slow)\n  --motionMin N             (override motion threshold)\n\nBand classification:\n  --bandTargets PATH        (merged_targets.json)\n\nRule scan thresholds (applies to --fullIn candidates for outAll):\n  --maxLineCount N\n  --maxCharCount N\n  --maxShader N\n  --maxPerPixel N\n\nDefaults:\n  --safeIn    ${args.safeIn}\n  --fullIn    ${args.fullIn}\n  --outSafe   ${args.outSafe}\n  --outAll    ${args.outAll}\n  --reportOut ${args.reportOut}\n  --auditIn   ${args.auditIn || "(none)"}\n  --bandTargets ${args.bandTargets || "(none)"}\n  --tier      ${args.tier || "(none)"}\n  --motionMin ${args.motionMin ?? "(auto)"}\n  --seed      ${args.seed}\n  --buckets   ${args.buckets}`
    );
    return;
  }

  const repoRoot = path.resolve(process.cwd());
  const safeInPath = path.resolve(repoRoot, args.safeIn);
  const fullInPath = path.resolve(repoRoot, args.fullIn);
  const outSafePath = path.resolve(repoRoot, args.outSafe);
  const outAllPath = path.resolve(repoRoot, args.outAll);
  const reportOutPath = path.resolve(repoRoot, args.reportOut);
  const auditInPath = args.auditIn
    ? path.resolve(repoRoot, String(args.auditIn))
    : "";
  const bandTargetsPath = args.bandTargets
    ? path.resolve(repoRoot, String(args.bandTargets))
    : "";

  if (args.motionMin == null && args.tier) {
    args.motionMin = getMotionMinForTier(args.tier);
  }

  const auditByRelPath = await loadAuditMap(auditInPath);
  const bandTargetsMap = await loadBandTargetsMap(bandTargetsPath);

  const safeManifest = await loadJson(safeInPath);
  const fullManifest = await loadJson(fullInPath);
  validateManifestVersion(safeManifest, "safeIn");
  validateManifestVersion(fullManifest, "fullIn");

  const safeAll = Array.isArray(safeManifest.presets) ? safeManifest.presets : [];
  const fullAll = Array.isArray(fullManifest.presets) ? fullManifest.presets : [];

  const auditCountersSafe = {
    filteredOutByAuditDark: 0,
    filteredOutByAuditBright: 0,
    filteredOutByAuditLowMotion: 0,
    filteredOutByAuditAborts: 0,
    missingAudit: 0,
  };
  const safeFiltered = safeAll
    .filter((p) => {
      const ok = isWasmCompatOk(p);
      return ok;
    })
    .filter((p) => applyAuditFilters(p, auditByRelPath, args, auditCountersSafe));

  const safeCoverage = computeCoverage(safeFiltered);
  const safeSelection = selectWithDiversity({
    presets: safeFiltered,
    manifestGeneratedAt: safeManifest.generatedAt,
    seedLabel: `${args.seed}|safe`,
    limit: args.limitSafe,
    buckets: args.buckets,
    auditByRelPath,
  });
  const safeSelected = safeSelection.selected;
  const safeSelectedIds = safeSelection.selectedIds;
  const safeSelectedWithBand = bandTargetsMap
    ? safeSelected.map((p) => applyBandClass(p, bandTargetsMap))
    : safeSelected;

  const defaultLimitAll = Math.min(fullAll.length, safeSelected.length + 4000);
  const limitAll = args.limitAll ?? defaultLimitAll;

  const auditCountersFull = {
    filteredOutByAuditDark: 0,
    filteredOutByAuditBright: 0,
    filteredOutByAuditLowMotion: 0,
    filteredOutByAuditAborts: 0,
    missingAudit: 0,
  };

  const scanCounters = {
    ok: 0,
    excluded: 0,
    byFlag: {},
  };

  // Base: start from safe selection, then top up from full manifest.
  const allCandidates = [];
  let skippedAlreadyInSafe = 0;
  let skippedByScan = 0;

  for (const p of fullAll) {
    const id = normalizePresetId(p);
    if (!id) continue;
    if (safeSelectedIds.has(id)) {
      skippedAlreadyInSafe++;
      continue;
    }

    // Apply audit filters first (same behavior as safe path).
    if (!applyAuditFilters(p, auditByRelPath, args, auditCountersFull)) {
      continue;
    }

    const scan = scanRisk(p, args);
    if (!scan.okForCurated) {
      skippedByScan++;
      scanCounters.excluded++;
      for (const f of scan.flags) {
        scanCounters.byFlag[f] = (scanCounters.byFlag[f] ?? 0) + 1;
      }
      continue;
    }

    scanCounters.ok++;
    for (const f of scan.flags) {
      scanCounters.byFlag[f] = (scanCounters.byFlag[f] ?? 0) + 1;
    }

    allCandidates.push(p);
  }

  const allNeedFromFull = Math.max(0, limitAll - safeSelected.length);
  const fullCoverage = computeCoverage(fullAll);
  const candidatesCoverage = computeCoverage(allCandidates);

  const fullTopUpSelection = selectWithDiversity({
    presets: allCandidates,
    manifestGeneratedAt: fullManifest.generatedAt,
    seedLabel: `${args.seed}|fullTopUp`,
    limit: allNeedFromFull,
    buckets: args.buckets,
    auditByRelPath,
  });

  const allSelected = [
    ...safeSelectedWithBand,
    ...fullTopUpSelection.selected.map((p) => applyBandClass(p, bandTargetsMap)),
  ];

  const outSafeManifest = {
    ...safeManifest,
    generatedAt: new Date().toISOString(),
    sourceRoot: `${safeManifest.sourceRoot} (curated.safe)` ,
    totalPresetsIncluded: safeSelectedWithBand.length,
    presets: safeSelectedWithBand,
  };
  const outAllManifest = {
    ...fullManifest,
    generatedAt: new Date().toISOString(),
    sourceRoot: `${fullManifest.sourceRoot} (curated.all)` ,
    totalPresetsIncluded: allSelected.length,
    presets: allSelected,
  };

  await fs.mkdir(path.dirname(outSafePath), { recursive: true });
  await fs.writeFile(outSafePath, JSON.stringify(outSafeManifest, null, 2) + "\n", "utf8");
  await fs.mkdir(path.dirname(outAllPath), { recursive: true });
  await fs.writeFile(outAllPath, JSON.stringify(outAllManifest, null, 2) + "\n", "utf8");

  const report = {
    generatedAt: new Date().toISOString(),
    args: {
      safeIn: args.safeIn,
      fullIn: args.fullIn,
      outSafe: args.outSafe,
      outAll: args.outAll,
      reportOut: args.reportOut,
      auditIn: args.auditIn || null,
      bandTargets: args.bandTargets || null,
      tier: args.tier || null,
      motionMin: args.motionMin ?? null,
      limitSafe: args.limitSafe ?? null,
      limitAll: limitAll ?? null,
      seed: args.seed,
      buckets: args.buckets,
      auditFilters: {
        excludeDark: args.excludeDark,
        excludeBright: args.excludeBright,
        excludeLowMotion: args.excludeLowMotion,
        excludeProbeAborts: args.excludeProbeAborts,
        motionMin: args.motionMin ?? null,
      },
      scanThresholds: {
        maxLineCount: args.maxLineCount,
        maxCharCount: args.maxCharCount,
        maxShader: args.maxShader,
        maxPerPixel: args.maxPerPixel,
      },
    },
    input: {
      safe: {
        totalPresets: safeAll.length,
        afterAuditFilter: safeFiltered.length,
        version: safeManifest.version,
        generatedAt: safeManifest.generatedAt,
        sourceRoot: safeManifest.sourceRoot,
        audit: auditByRelPath
          ? {
              missingAudit: auditCountersSafe.missingAudit,
              filteredOutByAudit: {
                dark: auditCountersSafe.filteredOutByAuditDark,
                bright: auditCountersSafe.filteredOutByAuditBright,
                lowMotion: auditCountersSafe.filteredOutByAuditLowMotion,
                aborts: auditCountersSafe.filteredOutByAuditAborts,
              },
            }
          : null,
        dataCoverage: safeCoverage,
      },
      full: {
        totalPresets: fullAll.length,
        version: fullManifest.version,
        generatedAt: fullManifest.generatedAt,
        sourceRoot: fullManifest.sourceRoot,
        skippedAlreadyInSafe,
        skippedByScan,
        audit: auditByRelPath
          ? {
              missingAudit: auditCountersFull.missingAudit,
              filteredOutByAudit: {
                dark: auditCountersFull.filteredOutByAuditDark,
                bright: auditCountersFull.filteredOutByAuditBright,
                lowMotion: auditCountersFull.filteredOutByAuditLowMotion,
                aborts: auditCountersFull.filteredOutByAuditAborts,
              },
            }
          : null,
        dataCoverage: fullCoverage,
      },
      candidatesForTopUp: {
        totalCandidates: allCandidates.length,
        scanCounters,
        dataCoverage: candidatesCoverage,
      },
    },
    output: {
      safe: {
        selectedPresets: safeSelectedWithBand.length,
        path: args.outSafe,
      },
      all: {
        selectedPresets: allSelected.length,
        path: args.outAll,
        addedFromFull: allSelected.length - safeSelectedWithBand.length,
      },
    },
  };

  await fs.mkdir(path.dirname(reportOutPath), { recursive: true });
  await fs.writeFile(reportOutPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(`Wrote curated safe manifest: ${path.relative(repoRoot, outSafePath)} (${safeSelectedWithBand.length} presets)`);
  console.log(`Wrote curated all manifest:  ${path.relative(repoRoot, outAllPath)} (${allSelected.length} presets)`);
  console.log(`Wrote report: ${path.relative(repoRoot, reportOutPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
