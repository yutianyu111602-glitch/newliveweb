#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const argMap = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token || !token.startsWith("--")) continue;
    const body = token.slice(2);
    if (!body) continue;
    if (body.includes("=")) {
      const [k, v] = body.split("=");
      if (k) argMap.set(k, v ?? "true");
      continue;
    }
    const k = body;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      argMap.set(k, next);
      i += 1;
    } else {
      argMap.set(k, "true");
    }
  }
}

const resolveArg = (key, fallback) => {
  if (!argMap.has(key)) return fallback;
  const v = argMap.get(key);
  return v ?? fallback;
};

const slugify = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const manifestPath = String(resolveArg("manifest", "")).trim();
if (!manifestPath) {
  console.error(
    "Usage: node scripts/build-aivj-style-index-v0.mjs --manifest <path/to/library-manifest.json> [--out <path/to/aivj-style-index.v0.json>]"
  );
  process.exit(2);
}

const absManifestPath = path.resolve(manifestPath);
const outPathArg = String(resolveArg("out", "")).trim();
const absOutPath = outPathArg
  ? path.resolve(outPathArg)
  : path.join(path.dirname(absManifestPath), "aivj-style-index.v0.json");

const CALM_KEYWORDS = [
  "calm",
  "ambient",
  "drone",
  "soft",
  "slow",
  "chill",
  "mellow",
  "mist",
  "rain",
  "ocean",
  "sunset",
  "dawn",
  "dream",
  "nebula",
  "quiet",
  "silence",
];

const PEAK_KEYWORDS = [
  "rave",
  "hardcore",
  "acid",
  "bass",
  "laser",
  "lazer",
  "warp",
  "fast",
  "speed",
  "vip",
  "storm",
  "explosion",
  "fury",
  "fire",
  "toxic",
  "voosh",
  "techno",
];

const LOW_BAND_KEYWORDS = [
  "bass",
  "sub",
  "kick",
  "low",
  "808",
  "drum",
  "boom",
  "thump",
];

const MID_BAND_KEYWORDS = [
  "mid",
  "synth",
  "lead",
  "pad",
  "texture",
  "vocal",
  "organ",
  "string",
];

const HIGH_BAND_KEYWORDS = [
  "hat",
  "hihat",
  "hi-hat",
  "clap",
  "snare",
  "spark",
  "glitch",
  "noise",
  "air",
];

const detectEnergy = (label) => {
  const s = String(label ?? "").toLowerCase();
  if (PEAK_KEYWORDS.some((k) => s.includes(k))) return "peak";
  if (CALM_KEYWORDS.some((k) => s.includes(k))) return "calm";
  return "groove";
};

const detectAuthorKey = (label) => {
  const s = String(label ?? "");
  const dash = s.indexOf(" - ");
  const raw = dash >= 1 ? s.slice(0, dash) : s;
  const key = slugify(raw);
  return key || "unknown";
};

const countKeywordHits = (label, list) => {
  const s = String(label ?? "").toLowerCase();
  let count = 0;
  for (const k of list) {
    if (k && s.includes(k)) count += 1;
  }
  return count;
};

const detectBandClass = (label) => {
  const low = countKeywordHits(label, LOW_BAND_KEYWORDS);
  const mid = countKeywordHits(label, MID_BAND_KEYWORDS);
  const high = countKeywordHits(label, HIGH_BAND_KEYWORDS);
  const max = Math.max(low, mid, high);
  if (!max) return null;
  if (max === low && low > mid && low > high) return "low";
  if (max === mid && mid > low && mid > high) return "mid";
  if (max === high && high > low && high > mid) return "high";
  // Tie-breaker: prefer mid for balanced content.
  if (max === mid) return "mid";
  if (max === low) return "low";
  return "high";
};

const main = async () => {
  const raw = await fs.readFile(absManifestPath, "utf8");
  const manifest = JSON.parse(raw);
  const presets = Array.isArray(manifest?.presets) ? manifest.presets : [];
  const pack = String(presets?.[0]?.pack ?? manifest?.pack ?? "").trim();

  const entries = [];
  for (const p of presets) {
    const presetId = String(p?.id ?? "").trim();
    if (!presetId) continue;
    const label = String(p?.label ?? p?.fileName ?? "");
    const authorKey = detectAuthorKey(label);
    const energy = detectEnergy(label);
    const bandClass = detectBandClass(label);
    const tags = [];
    tags.push(`energy:${energy}`);
    if (authorKey && authorKey !== "unknown") tags.push(`author:${authorKey}`);
    if (bandClass) tags.push(`band:${bandClass}`);
    entries.push({ presetId, authorKey, energy, tags });
  }

  const out = {
    version: "v0",
    generatedAt: new Date().toISOString(),
    pack: pack || undefined,
    entries,
  };

  await fs.mkdir(path.dirname(absOutPath), { recursive: true });
  await fs.writeFile(absOutPath, JSON.stringify(out, null, 2), "utf8");
  console.log(
    `[aivj-style-index:v0] wrote ${entries.length} entries -> ${absOutPath}`
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
