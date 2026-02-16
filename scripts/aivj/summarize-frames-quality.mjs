#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const parseArgs = (argv) => {
  const map = new Map();
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token || !token.startsWith("--")) continue;
    const body = token.slice(2);
    if (!body) continue;
    if (body.includes("=")) {
      const [k, v] = body.split("=");
      if (k) map.set(k, v ?? "true");
      continue;
    }
    const k = body;
    const next = tokens[i + 1];
    if (next && !next.startsWith("--")) {
      map.set(k, next);
      i += 1;
    } else {
      map.set(k, "true");
    }
  }
  return {
    get: (k, fallback) => (map.has(k) ? map.get(k) : fallback),
    has: (k) => map.has(k),
  };
};

const args = parseArgs(process.argv);
const root = String(args.get("root", "")).trim();
const dirsRaw = String(args.get("dirs", "")).trim();
const indexName = String(args.get("indexName", "frames-index.jsonl")).trim();
const maxDepth = Math.max(0, Number(args.get("maxDepth", "3")) || 0);
const outArg = String(args.get("out", "")).trim();
const verbose = args.has("verbose");

const normalizePath = (value) => value.replace(/[\\/]+/g, path.sep);

const collectDirs = () => {
  if (dirsRaw) {
    return dirsRaw
      .split(",")
      .map((v) => normalizePath(v.trim()))
      .filter(Boolean);
  }
  if (root) return [normalizePath(root)];
  return [];
};

const baseDirs = collectDirs();
if (!baseDirs.length) {
  console.error(
    "[quality-summary] Missing --root or --dirs (comma-separated)"
  );
  process.exit(2);
}

const shouldIgnoreDir = (name) =>
  name === "node_modules" ||
  name === ".git" ||
  name === "frames" ||
  name === "quality" ||
  name === ".cache";

const findIndices = (startDir, depthLimit) => {
  const out = [];
  const queue = [{ dir: startDir, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const name = entry.name;
      const full = path.join(dir, name);
      if (entry.isFile() && name === indexName) {
        out.push(full);
        continue;
      }
      if (entry.isDirectory()) {
        if (shouldIgnoreDir(name)) continue;
        if (depth < depthLimit) {
          queue.push({ dir: full, depth: depth + 1 });
        }
      }
    }
  }
  return out;
};

const indices = [];
for (const dir of baseDirs) {
  indices.push(...findIndices(dir, maxDepth));
}

if (!indices.length) {
  console.error("[quality-summary] No frames-index.jsonl found");
  process.exit(2);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const checkScript = path.join(__dirname, "check-frames-quality.mjs");

const passThroughArgs = [
  "lumaMin",
  "motionMin",
  "minOkRatio",
  "maxFailRatio",
  "maxLowBothRatio",
  "maxMissingMetricsRatio",
  "maxMissingFramesRatio",
];

const runCheck = (indexPath, outPath) => {
  const cmdArgs = [checkScript, "--index", indexPath, "--out", outPath];
  for (const key of passThroughArgs) {
    if (args.has(key)) {
      cmdArgs.push(`--${key}`, String(args.get(key)));
    }
  }
  const result = spawnSync(process.execPath, cmdArgs, {
    stdio: verbose ? "inherit" : "pipe",
    encoding: "utf8",
  });
  return result;
};

const loadJson = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

const runs = [];
for (const indexPath of indices) {
  const outDir = path.dirname(indexPath);
  const qualityDir = path.join(outDir, "quality");
  const outPath = path.join(qualityDir, "quality-auto.json");
  const result = runCheck(indexPath, outPath);
  let summary = null;
  let error = null;
  try {
    summary = loadJson(outPath);
  } catch (err) {
    error = `read-summary-failed: ${String(err)}`;
  }
  if (!summary && result.status !== 0) {
    if (!error) error = `check-exit:${result.status ?? "unknown"}`;
  }
  runs.push({
    indexPath,
    outDir,
    summary,
    error,
  });
}

const aggregate = {
  totalRuns: runs.length,
  okRuns: 0,
  failRuns: 0,
  errorRuns: 0,
  counts: {
    total: 0,
    ok: 0,
    failed: 0,
    skipped: 0,
  },
  ratios: {
    okRatio: 0,
    failRatio: 0,
    lowBothRatio: 0,
    missingMetricsRatio: 0,
    missingFramesRatio: 0,
  },
  ranges: {
    lumaMin: null,
    lumaMax: null,
    motionMin: null,
    motionMax: null,
  },
};

let weightedTotal = 0;
let weightedLowBoth = 0;
let weightedMissingMetrics = 0;
let weightedMissingFrames = 0;

for (const run of runs) {
  const summary = run.summary;
  if (!summary) {
    aggregate.errorRuns += 1;
    continue;
  }
  const verdictOk = Boolean(summary.verdict?.ok);
  if (verdictOk) aggregate.okRuns += 1;
  else aggregate.failRuns += 1;

  const counts = summary.counts ?? {};
  const total = Number(counts.total ?? 0);
  const ok = Number(counts.ok ?? 0);
  const failed = Number(counts.failed ?? 0);
  const skipped = Number(counts.skipped ?? 0);
  aggregate.counts.total += total;
  aggregate.counts.ok += ok;
  aggregate.counts.failed += failed;
  aggregate.counts.skipped += skipped;
  weightedTotal += total;

  const ratios = summary.ratios ?? {};
  weightedLowBoth += Number(ratios.lowBothRatio ?? 0) * total;
  weightedMissingMetrics += Number(ratios.missingMetricsRatio ?? 0) * total;
  weightedMissingFrames += Number(ratios.missingFramesRatio ?? 0) * total;

  const ranges = summary.ranges ?? {};
  const lMin = Number(ranges.lumaMin);
  const lMax = Number(ranges.lumaMax);
  const mMin = Number(ranges.motionMin);
  const mMax = Number(ranges.motionMax);
  if (Number.isFinite(lMin)) {
    aggregate.ranges.lumaMin =
      aggregate.ranges.lumaMin == null
        ? lMin
        : Math.min(aggregate.ranges.lumaMin, lMin);
  }
  if (Number.isFinite(lMax)) {
    aggregate.ranges.lumaMax =
      aggregate.ranges.lumaMax == null
        ? lMax
        : Math.max(aggregate.ranges.lumaMax, lMax);
  }
  if (Number.isFinite(mMin)) {
    aggregate.ranges.motionMin =
      aggregate.ranges.motionMin == null
        ? mMin
        : Math.min(aggregate.ranges.motionMin, mMin);
  }
  if (Number.isFinite(mMax)) {
    aggregate.ranges.motionMax =
      aggregate.ranges.motionMax == null
        ? mMax
        : Math.max(aggregate.ranges.motionMax, mMax);
  }
}

if (aggregate.counts.total > 0) {
  aggregate.ratios.okRatio = aggregate.counts.ok / aggregate.counts.total;
  aggregate.ratios.failRatio =
    aggregate.counts.failed / aggregate.counts.total;
}
if (weightedTotal > 0) {
  aggregate.ratios.lowBothRatio = weightedLowBoth / weightedTotal;
  aggregate.ratios.missingMetricsRatio = weightedMissingMetrics / weightedTotal;
  aggregate.ratios.missingFramesRatio = weightedMissingFrames / weightedTotal;
}

const output = {
  version: "v0",
  generatedAt: new Date().toISOString(),
  roots: baseDirs,
  indexName,
  runs: runs.map((run) => ({
    indexPath: path.resolve(run.indexPath),
    outDir: path.resolve(run.outDir),
    verdict: run.summary?.verdict ?? null,
    counts: run.summary?.counts ?? null,
    ratios: run.summary?.ratios ?? null,
    ranges: run.summary?.ranges ?? null,
    error: run.error ?? null,
  })),
  aggregate,
};

const resolveDefaultOut = () => {
  if (outArg) return outArg;
  if (root) return path.join(root, "quality", "quality-batch-summary.json");
  const first = baseDirs[0];
  return path.join(first, "quality", "quality-batch-summary.json");
};

const outPath = resolveDefaultOut();
const outDir = path.dirname(outPath);
if (outDir && !fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf8");

console.log(
  `[quality-summary] runs=${aggregate.totalRuns} ok=${aggregate.okRuns} fail=${aggregate.failRuns} error=${aggregate.errorRuns}`
);
console.log(`[quality-summary] out=${path.resolve(outPath)}`);
