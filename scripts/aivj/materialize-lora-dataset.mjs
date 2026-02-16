#!/usr/bin/env node
/**
 * Materialize LoRA dataset from cluster bucket relPath lists.
 *
 * Reads artifacts/aivj/<pack>/lora-trainlists/bucket-cXX.txt (one relPath per line)
 * and creates artifacts/aivj/<pack>/dataset/cluster-cXX/*.{webp,txt}
 *
 * By default: copies frame-001.webp for each preset (if exists).
 *
 * Usage:
 *   node scripts/aivj/materialize-lora-dataset.mjs --pack run3-okonly
 *   node scripts/aivj/materialize-lora-dataset.mjs --pack run3-okonly --mode hardlink
 *   node scripts/aivj/materialize-lora-dataset.mjs --pack run3-okonly --frameIndex 1 --withCaptions true
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const parseArgs = (argv) => {
  const map = new Map();
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token || !String(token).startsWith("--")) continue;
    const body = String(token).slice(2);
    if (!body) continue;

    if (body.includes("=")) {
      const [key, raw] = body.split("=");
      if (key) map.set(key, raw ?? "true");
      continue;
    }

    const key = body;
    const next = tokens[i + 1];
    if (next && !String(next).startsWith("--")) {
      map.set(key, next);
      i += 1;
    } else {
      map.set(key, "true");
    }
  }

  const get = (key, fallback) => (map.has(key) ? map.get(key) : fallback);
  const has = (key) => map.has(key);
  return { get, has };
};

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });
const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const stableHash8 = (s) => crypto.createHash("sha1").update(String(s ?? "")).digest("hex").slice(0, 8);
const sanitizeStem = (s) =>
  String(s ?? "")
    .replace(/\s+/g, "_")
    .replace(/[:\\/\\?<>|\"\*]/g, "_")
    .slice(0, 140);

const readLines = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
};

function* iterJsonl(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    try {
      yield JSON.parse(s);
    } catch {
      // ignore
    }
  }
}

function tryHardlink(src, dest) {
  try {
    fs.linkSync(src, dest);
    return true;
  } catch {
    return false;
  }
}

function main() {
  const args = parseArgs(process.argv);
  const pack = String(args.get("pack", "")).trim();
  const help = args.has("help") || args.has("h");

  if (help || !pack) {
    console.log("Materialize LoRA dataset from lora-trainlists");
    console.log("Usage: node scripts/aivj/materialize-lora-dataset.mjs --pack <pack> [--mode copy|hardlink] [--frameIndex 1] [--withCaptions true]");
    process.exit(pack ? 0 : 2);
  }

  const mode = String(args.get("mode", "copy")).trim();
  const frameIndex = Math.max(0, Number(args.get("frameIndex", "1")) | 0);
  const withCaptions = String(args.get("withCaptions", "true")).trim().toLowerCase() !== "false";
  const captionTemplate = String(args.get("captionTemplate", "cluster:{cluster} energy:{energy}")).trim();

  const projectRoot = path.resolve(path.join(import.meta.dirname, "..", ".."));
  const outRoot = path.join(projectRoot, "artifacts", "aivj", pack);
  const styleIndexPath = path.join(projectRoot, "public", "presets", pack, "aivj-style-index.v1.json");
  const manifestPath = path.join(projectRoot, "public", "presets", pack, "library-manifest.json");
  const loraDir = path.join(outRoot, "lora-trainlists");
  const framesDir = path.join(outRoot, "frames");
  const framesIndexPath = path.join(outRoot, "frames-index.jsonl");

  if (!fs.existsSync(loraDir)) {
    console.error(`[dataset] FATAL: missing lora-trainlists dir: ${loraDir}`);
    process.exit(2);
  }
  if (!fs.existsSync(framesDir)) {
    console.error(`[dataset] FATAL: missing frames dir: ${framesDir}`);
    process.exit(2);
  }

  const presetToFrameRel = new Map();
  if (fs.existsSync(framesIndexPath)) {
    for (const obj of iterJsonl(framesIndexPath)) {
      if (obj?.status !== "ok") continue;
      const presetId = String(obj?.presetId ?? obj?.id ?? "").trim();
      if (!presetId) continue;
      const frames = Array.isArray(obj?.frames) ? obj.frames : [];
      if (frames.length === 0) continue;
      const idx = Math.max(0, Math.min(frames.length - 1, frameIndex));
      const rel = frames[idx] ?? frames[0] ?? null;
      if (!isNonEmptyString(rel)) continue;
      presetToFrameRel.set(presetId, rel);
    }
  }

  const relPathToPresetId = new Map();
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const presets = Array.isArray(manifest?.presets) ? manifest.presets : [];
      for (const p of presets) {
        const relPath = String(p?.relPath ?? "").trim();
        const id = String(p?.id ?? "").trim();
        if (relPath && id) relPathToPresetId.set(relPath, id);
      }
    } catch {
      // ignore
    }
  }

  // optional style-index for captions
  const presetToEnergy = new Map();
  if (fs.existsSync(styleIndexPath)) {
    try {
      const style = JSON.parse(fs.readFileSync(styleIndexPath, "utf8"));
      const entries = Array.isArray(style?.entries) ? style.entries : [];
      for (const e of entries) {
        const presetId = String(e?.presetId ?? "").trim();
        if (!presetId) continue;
        const energy = String(e?.energy ?? "").trim();
        if (energy) presetToEnergy.set(presetId, energy);
      }
    } catch {
      // ignore
    }
  }

  const datasetDir = path.join(outRoot, "dataset");
  ensureDir(datasetDir);

  const bucketFiles = fs
    .readdirSync(loraDir)
    .filter((f) => /^bucket-c\d+\.txt$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  if (bucketFiles.length === 0) {
    console.error(`[dataset] FATAL: no bucket files in ${loraDir}`);
    process.exit(2);
  }

  let totalItems = 0;
  let copiedItems = 0;
  let missingFrames = 0;
  let linkFallbacks = 0;

  for (const bf of bucketFiles) {
    const cluster = bf.replace(/^bucket-/, "").replace(/\.txt$/i, "");
    const destDir = path.join(datasetDir, `cluster-${sanitizeStem(cluster)}`);
    ensureDir(destDir);

    const listPath = path.join(loraDir, bf);
    const relPaths = readLines(listPath);

    for (const relPath of relPaths) {
      totalItems += 1;
      const presetId = relPathToPresetId.get(relPath) ?? relPath;

      const frameRel = presetToFrameRel.get(presetId) ?? presetToFrameRel.get(relPath);
      let src = null;
      if (isNonEmptyString(frameRel)) {
        src = path.join(outRoot, frameRel);
      } else {
        // Fallback: best-effort mapping for older outputs.
        const idHash = stableHash8(presetId);
        const frameName = `frame-${String(frameIndex).padStart(3, "0")}.webp`;
        src = path.join(framesDir, idHash, frameName);
      }
      if (!src || !fs.existsSync(src)) {
        missingFrames += 1;
        continue;
      }

      const idHash = isNonEmptyString(frameRel)
        ? path.basename(path.dirname(frameRel))
        : stableHash8(presetId);

      const stem = sanitizeStem(path.basename(presetId));
      const destBase = `${cluster}__${idHash}__${stem}`;
      const destImg = path.join(destDir, `${destBase}.webp`);

      if (!fs.existsSync(destImg)) {
        if (mode === "hardlink") {
          const ok = tryHardlink(src, destImg);
          if (!ok) {
            linkFallbacks += 1;
            fs.copyFileSync(src, destImg);
          }
        } else {
          fs.copyFileSync(src, destImg);
        }
        copiedItems += 1;
      }

      if (withCaptions) {
        const energy = presetToEnergy.get(presetId) ?? "";
        const caption = captionTemplate
          .replaceAll("{cluster}", cluster)
          .replaceAll("{energy}", energy || "unknown");
        const destTxt = path.join(destDir, `${destBase}.txt`);
        if (!fs.existsSync(destTxt)) {
          fs.writeFileSync(destTxt, caption + "\n", "utf8");
        }
      }
    }
  }

  fs.writeFileSync(
    path.join(datasetDir, "dataset.summary.json"),
    JSON.stringify(
      {
        pack,
        mode,
        frameIndex,
        withCaptions,
        buckets: bucketFiles.length,
        totalItems,
        copiedItems,
        missingFrames,
        linkFallbacks,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log(`[dataset] OK: dataset -> ${datasetDir}`);
  console.log(`[dataset] buckets=${bucketFiles.length} total=${totalItems} copied=${copiedItems} missingFrames=${missingFrames} linkFallbacks=${linkFallbacks}`);
}

main();
