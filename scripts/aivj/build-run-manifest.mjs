#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

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

const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const args = parseArgs(process.argv);
const indexPath = String(args.get("index", "")).trim();
const outPath = String(args.get("out", "")).trim();
const runName = String(args.get("runName", "")).trim();
const maxPresets = Math.max(0, Math.floor(toNumber(args.get("maxPresets", "0"), 0)));
const includeFailed = String(args.get("includeFailed", "true")).trim().toLowerCase() !== "false";

if (!indexPath) {
  console.error("[manifest] Missing --index");
  process.exit(2);
}
if (!outPath) {
  console.error("[manifest] Missing --out");
  process.exit(2);
}
if (!fs.existsSync(indexPath)) {
  console.error(`[manifest] Missing index: ${indexPath}`);
  process.exit(2);
}

const absIndex = path.resolve(indexPath);
const outDir = path.dirname(absIndex);

const pickScore = (entry) => {
  const l = Number.isFinite(entry?.metrics?.avgLuma) ? entry.metrics.avgLuma : 0;
  const m = Number.isFinite(entry?.metrics?.motion) ? entry.metrics.motion : 0;
  return l * 0.4 + m * 0.6;
};

const chooseBetter = (prev, next) => {
  if (!prev) return next;
  if (!next) return prev;
  const prevOk = prev.status === "ok";
  const nextOk = next.status === "ok";
  if (prevOk !== nextOk) return nextOk ? next : prev;
  const prevTier = prev.tier === "dark" ? 2 : 1;
  const nextTier = next.tier === "dark" ? 2 : 1;
  if (prevTier !== nextTier) return prevTier < nextTier ? prev : next;
  const prevScore = prev.score ?? 0;
  const nextScore = next.score ?? 0;
  if (prevScore !== nextScore) return nextScore > prevScore ? next : prev;
  const prevFrames = Array.isArray(prev.frames) ? prev.frames.length : 0;
  const nextFrames = Array.isArray(next.frames) ? next.frames.length : 0;
  if (prevFrames !== nextFrames) return nextFrames > prevFrames ? next : prev;
  return prev;
};

let total = 0;
let ok = 0;
let failed = 0;
let skipped = 0;
let tier1Ok = 0;
let tier2Ok = 0;
let earliest = "";
let latest = "";

const presets = new Map();

const rl = readline.createInterface({
  input: fs.createReadStream(absIndex),
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  if (!line.trim()) return;
  total += 1;
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return;
  }

  const status = String(obj.status || "");
  if (status === "ok") ok += 1;
  else if (status === "failed") failed += 1;
  else if (status === "skipped") skipped += 1;

  if (status === "ok") {
    if (obj.tier === "dark") tier2Ok += 1;
    else tier1Ok += 1;
  }

  const at = String(obj.at || "");
  if (at) {
    if (!earliest || at < earliest) earliest = at;
    if (!latest || at > latest) latest = at;
  }

  const presetId = String(obj.presetId || "").trim();
  if (!presetId) return;

  if (!includeFailed && status !== "ok") return;

  const entry = {
    presetId,
    relPath: obj.relPath ? String(obj.relPath) : "",
    filePath: obj.filePath ? String(obj.filePath) : "",
    status,
    tier: obj.tier === "dark" ? "dark" : "strict",
    idHash: obj.idHash ? String(obj.idHash) : "",
    frames: Array.isArray(obj.frames) ? obj.frames : [],
    bestFrame: Array.isArray(obj.frames) && obj.frames.length ? obj.frames[0] : "",
    metrics: obj.metrics && typeof obj.metrics === "object" ? obj.metrics : undefined,
    reasons: Array.isArray(obj.reasons) ? obj.reasons : [],
    at,
  };

  entry.score = pickScore(entry);

  const prev = presets.get(presetId);
  const next = chooseBetter(prev, entry);
  presets.set(presetId, next);
});

rl.on("close", () => {
  let presetList = Array.from(presets.values());
  if (maxPresets > 0 && presetList.length > maxPresets) {
    presetList = presetList
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, maxPresets);
  }

  const manifest = {
    version: "v0",
    generatedAt: new Date().toISOString(),
    runName: runName || path.basename(outDir),
    indexPath: absIndex,
    outDir,
    counts: {
      total,
      ok,
      failed,
      skipped,
      tier1Ok,
      tier2Ok,
      uniquePresets: presets.size,
    },
    time: { earliest, latest },
    presets: presetList,
  };

  const dir = path.dirname(outPath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(
    `[manifest] presets=${manifest.counts.uniquePresets} ok=${ok} failed=${failed} ` +
      `tier1Ok=${tier1Ok} tier2Ok=${tier2Ok} out=${outPath}`
  );
});
