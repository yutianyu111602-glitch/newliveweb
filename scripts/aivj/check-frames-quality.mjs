#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const HARD_TIMEOUT_MS = Number(process.env.AIVJ_SCRIPT_TIMEOUT_MS ?? 180000);

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

if (!indexPath) {
  console.error("[quality] Missing --index");
  process.exit(2);
}

const lumaMin = toNumber(args.get("lumaMin", "0.01"), 0.01);
const motionMin = toNumber(args.get("motionMin", "0.005"), 0.005);
const minOkRatio = toNumber(args.get("minOkRatio", "0.85"), 0.85);
const maxLowBothRatio = toNumber(args.get("maxLowBothRatio", "0.25"), 0.25);
const maxFailRatio = toNumber(args.get("maxFailRatio", "0.15"), 0.15);
const maxMissingMetricsRatio = toNumber(args.get("maxMissingMetricsRatio", "0.15"), 0.15);
const maxMissingFramesRatio = toNumber(args.get("maxMissingFramesRatio", "0.15"), 0.15);

if (!fs.existsSync(indexPath)) {
  console.error(`[quality] Missing index: ${indexPath}`);
  process.exit(2);
}

let total = 0;
let ok = 0;
let failed = 0;
let skipped = 0;
let minL = Infinity;
let maxL = -Infinity;
let minM = Infinity;
let maxM = -Infinity;
let lowL = 0;
let lowM = 0;
let lowBoth = 0;
let missingMetrics = 0;
let missingFrames = 0;
let earliest = "";
let latest = "";

const presetSet = new Set();
const okHashSet = new Set();

const stream = fs.createReadStream(indexPath);
const rl = readline.createInterface({
  input: stream,
  crlfDelay: Infinity,
});

const timeoutId = Number.isFinite(HARD_TIMEOUT_MS) && HARD_TIMEOUT_MS > 0
  ? setTimeout(() => {
      console.error(`[quality] timeout after ${HARD_TIMEOUT_MS}ms`);
      try {
        rl.close();
        stream.close();
      } catch {
        // ignore
      }
      process.exit(2);
    }, HARD_TIMEOUT_MS)
  : null;

stream.on("error", (err) => {
  console.error(`[quality] stream error: ${String(err?.message ?? err)}`);
  process.exit(2);
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

  if (obj.presetId) presetSet.add(obj.presetId);
  if (status === "ok" && obj.idHash) okHashSet.add(obj.idHash);

  const at = String(obj.at || "");
  if (at) {
    if (!earliest || at < earliest) earliest = at;
    if (!latest || at > latest) latest = at;
  }

  const metrics = obj.metrics;
  if (metrics && typeof metrics.avgLuma === "number" && typeof metrics.motion === "number") {
    const l = metrics.avgLuma;
    const m = metrics.motion;
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
    if (m < minM) minM = m;
    if (m > maxM) maxM = m;
    if (l <= lumaMin) lowL += 1;
    if (m <= motionMin) lowM += 1;
    if (l <= lumaMin && m <= motionMin) lowBoth += 1;
  } else {
    missingMetrics += 1;
  }

  if (!obj.frames || !Array.isArray(obj.frames) || obj.frames.length === 0) {
    missingFrames += 1;
  }
});

rl.on("close", () => {
  const ratio = (n) => (total ? n / total : 0);
  const summary = {
    version: "v0",
    generatedAt: new Date().toISOString(),
    indexPath: path.resolve(indexPath),
    counts: {
      total,
      ok,
      failed,
      skipped,
      uniquePresets: presetSet.size,
      uniqueOkHashes: okHashSet.size,
    },
    ranges: {
      lumaMin: Number.isFinite(minL) ? minL : null,
      lumaMax: Number.isFinite(maxL) ? maxL : null,
      motionMin: Number.isFinite(minM) ? minM : null,
      motionMax: Number.isFinite(maxM) ? maxM : null,
    },
    ratios: {
      okRatio: ratio(ok),
      failRatio: ratio(failed),
      lowLumaRatio: ratio(lowL),
      lowMotionRatio: ratio(lowM),
      lowBothRatio: ratio(lowBoth),
      missingMetricsRatio: ratio(missingMetrics),
      missingFramesRatio: ratio(missingFrames),
    },
    time: { earliest, latest },
    thresholds: {
      minOkRatio,
      maxFailRatio,
      maxLowBothRatio,
      maxMissingMetricsRatio,
      maxMissingFramesRatio,
      lumaMin,
      motionMin,
    },
  };

  const reasons = [];
  if (summary.ratios.okRatio < minOkRatio) reasons.push("okRatio");
  if (summary.ratios.failRatio > maxFailRatio) reasons.push("failRatio");
  if (summary.ratios.lowBothRatio > maxLowBothRatio) reasons.push("lowBothRatio");
  if (summary.ratios.missingMetricsRatio > maxMissingMetricsRatio) reasons.push("missingMetricsRatio");
  if (summary.ratios.missingFramesRatio > maxMissingFramesRatio) reasons.push("missingFramesRatio");

  summary.verdict = { ok: reasons.length === 0, reasons };

  if (outPath) {
    const dir = path.dirname(outPath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }

  console.log(
    `[quality] total=${total} ok=${ok} failed=${failed} okRatio=${summary.ratios.okRatio.toFixed(3)} ` +
      `lowBoth=${summary.ratios.lowBothRatio.toFixed(3)} missing=${summary.ratios.missingMetricsRatio.toFixed(3)}`
  );
  if (summary.verdict.ok) {
    console.log("[quality] verdict=ok");
    if (timeoutId) clearTimeout(timeoutId);
    process.exit(0);
  }

  console.log(`[quality] verdict=fail reasons=${summary.verdict.reasons.join(",")}`);
  if (timeoutId) clearTimeout(timeoutId);
  process.exit(3);
});
