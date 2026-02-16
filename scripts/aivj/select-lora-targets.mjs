import fs from "fs";
import path from "path";

function parseArgs(argv) {
  const args = new Map();
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      args.set(key.slice(2), value);
      i += 1;
    } else {
      args.set(key.slice(2), "true");
    }
  }
  return args;
}

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

const args = parseArgs(process.argv);
const indexPath = args.get("index");
const outPath = args.get("out");

if (!indexPath || !outPath) {
  console.error("Usage: node scripts/aivj/select-lora-targets.mjs --index <frames-index.jsonl> --out <targets.txt>");
  process.exit(1);
}

const minLuma = toNumber(args.get("minLuma"), 0.05);
const maxLuma = toNumber(args.get("maxLuma"), 0.92);
const minMotion = toNumber(args.get("minMotion"), 0.03);
const minBandMax = toNumber(args.get("minBandMax"), 0.08);
const minBandDominance = toNumber(args.get("minBandDominance"), 0);
const bandFocus = String(args.get("bandFocus") || "").trim();
const bandFocusRatio = toNumber(args.get("bandFocusRatio"), 0.9);
const allowBand = String(args.get("allowBand") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const excludeBand = String(args.get("excludeBand") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const raw = fs.readFileSync(indexPath, "utf8");
const lines = raw.split(/\r?\n/);
const seen = new Set();
let total = 0;
let selected = 0;

for (const line of lines) {
  if (!line.trim()) continue;
  total += 1;
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }
  if (obj.status !== "ok") continue;
  const metrics = obj.metrics || {};
  const luma = metrics.avgLuma;
  const motion = metrics.motion;
  const band = metrics.bandResponse || {};
  const bandClass = metrics.bandClass || "";
  if (excludeBand.length && excludeBand.includes(bandClass)) continue;
  if (allowBand.length && !allowBand.includes(bandClass)) continue;
  if (bandClass === "flat") continue;
  if (!Number.isFinite(luma) || !Number.isFinite(motion)) continue;
  if (luma < minLuma || luma > maxLuma) continue;
  if (motion < minMotion) continue;
  const bandVals = [band.low, band.mid, band.high].map((v) =>
    Number.isFinite(v) ? v : 0
  );
  const sorted = [...bandVals].sort((a, b) => b - a);
  const max = sorted[0] ?? 0;
  const second = sorted[1] ?? 0;
  if (max < minBandMax) continue;
  if (minBandDominance > 0 && second > 0 && max / second < minBandDominance) {
    continue;
  }
  if (bandFocus) {
    const focus = Number(band[bandFocus]);
    const lowVal = Number.isFinite(band.low) ? band.low : 0;
    const midVal = Number.isFinite(band.mid) ? band.mid : 0;
    const highVal = Number.isFinite(band.high) ? band.high : 0;
    const others =
      bandFocus === "low" ? [midVal, highVal] : bandFocus === "mid" ? [lowVal, highVal] : [lowVal, midVal];
    const maxOther = Math.max(...others);
    if (!Number.isFinite(focus) || focus < maxOther * bandFocusRatio) {
      continue;
    }
  }
  const relPath = obj.relPath;
  if (!relPath || seen.has(relPath)) continue;
  seen.add(relPath);
  selected += 1;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Array.from(seen).join("\n") + "\n");

console.log(
  `[lora-targets] total=${total} selected=${selected} out=${outPath}`
);
