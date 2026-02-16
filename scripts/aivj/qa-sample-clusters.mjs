#!/usr/bin/env node
/**
 * QA sampler: for each cluster bucket, copy N representative frames into
 * artifacts/aivj/<pack>/qa-samples/cluster-cXX/ and generate a simple index.html.
 *
 * Usage:
 *   node scripts/aivj/qa-sample-clusters.mjs --pack run3-okonly
 *   node scripts/aivj/qa-sample-clusters.mjs --pack run3-okonly --perCluster 12 --frameIndex 1
 *   node scripts/aivj/qa-sample-clusters.mjs --pack run3-okonly --outDir artifacts/aivj/test-30
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

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const stableHash8 = (s) => crypto.createHash("sha1").update(String(s ?? "")).digest("hex").slice(0, 8);

const sanitizeStem = (s) =>
  String(s ?? "")
    .replace(/\s+/g, "_")
    .replace(/[:\\/\\?<>|\"\*]/g, "_")
    .slice(0, 140);

const pickClusterKey = (entry) => {
  const tags = Array.isArray(entry?.tags) ? entry.tags : [];
  for (const t of tags) {
    if (!isNonEmptyString(t)) continue;
    if (t.startsWith("cluster:")) {
      const k = t.slice("cluster:".length).trim();
      if (k) return k;
    }
  }
  const ak = String(entry?.authorKey ?? "").trim();
  if (/^c\d+$/i.test(ak)) return ak;
  return null;
};

const pickFrameRel = (frames, frameIndex) => {
  if (!Array.isArray(frames) || frames.length === 0) return null;
  const idx = Math.max(0, Math.min(frames.length - 1, Number(frameIndex) | 0));
  return frames[idx] ?? frames[0] ?? null;
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

function main() {
  const args = parseArgs(process.argv);
  const help = args.has("help") || args.has("h");
  const pack = String(args.get("pack", "")).trim();
  const outDirArg = String(args.get("outDir", "")).trim();

  if (help || !pack) {
    console.log("QA sampler: sample frames per cluster bucket");
    console.log(
      "Usage: node scripts/aivj/qa-sample-clusters.mjs --pack <pack> [--outDir <dir>] [--perCluster 12] [--frameIndex 1] [--random]"
    );
    process.exit(pack ? 0 : 2);
  }

  const perCluster = Math.max(1, Number(args.get("perCluster", "12")) | 0);
  const frameIndex = Math.max(0, Number(args.get("frameIndex", "1")) | 0);
  const random = args.has("random");

  const projectRoot = path.resolve(path.join(import.meta.dirname, "..", ".."));
  const packDir = path.join(projectRoot, "public", "presets", pack);
  const outRoot = outDirArg
    ? path.resolve(projectRoot, outDirArg)
    : path.join(projectRoot, "artifacts", "aivj", pack);
  const framesIndexPath = path.join(outRoot, "frames-index.jsonl");
  const styleIndexPath = path.join(packDir, "aivj-style-index.v1.json");

  if (!fs.existsSync(styleIndexPath)) {
    console.error(`[qa] FATAL: missing style index v1: ${styleIndexPath}`);
    process.exit(2);
  }
  if (!fs.existsSync(framesIndexPath)) {
    console.error(`[qa] FATAL: missing frames index: ${framesIndexPath}`);
    process.exit(2);
  }

  const styleIndex = readJson(styleIndexPath);
  const entries = Array.isArray(styleIndex?.entries) ? styleIndex.entries : [];

  const clusterToPresetIds = new Map();
  const presetMeta = new Map();
  for (const e of entries) {
    const presetId = String(e?.presetId ?? "").trim();
    if (!presetId) continue;
    const cluster = pickClusterKey(e);
    if (!cluster) continue;
    if (!clusterToPresetIds.has(cluster)) clusterToPresetIds.set(cluster, []);
    clusterToPresetIds.get(cluster).push(presetId);
    presetMeta.set(presetId, { cluster, energy: String(e?.energy ?? "").trim() });
  }

  // Map presetId -> representative frame file (absolute) + idHash
  const presetToFrame = new Map();
  for (const obj of iterJsonl(framesIndexPath)) {
    if (obj?.status !== "ok") continue;
    const presetId = String(obj?.presetId ?? obj?.id ?? "").trim();
    if (!presetId) continue;
    const frameRel = pickFrameRel(obj?.frames, frameIndex);
    if (!frameRel) continue;
    const abs = path.join(outRoot, String(frameRel));
    if (!fs.existsSync(abs)) continue;
    presetToFrame.set(presetId, {
      abs,
      rel: String(frameRel),
      idHash: String(obj?.idHash ?? "").trim() || stableHash8(presetId),
      metrics: obj?.metrics ?? null,
    });
  }

  const qaDir = path.join(outRoot, "qa-samples");
  ensureDir(qaDir);

  const clusters = Array.from(clusterToPresetIds.keys()).sort((a, b) => a.localeCompare(b));
  const copied = [];

  for (const cluster of clusters) {
    const presetIds = clusterToPresetIds.get(cluster) ?? [];
    const destDir = path.join(qaDir, `cluster-${sanitizeStem(cluster)}`);
    ensureDir(destDir);

    // Randomly shuffle or take first N
    let selectedPresetIds = presetIds;
    if (random && presetIds.length > perCluster) {
      // Fisher-Yates shuffle and take first perCluster
      const shuffled = [...presetIds];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      selectedPresetIds = shuffled.slice(0, perCluster);
    } else {
      // Take first perCluster (original behavior)
      selectedPresetIds = presetIds.slice(0, perCluster);
    }

    for (const presetId of selectedPresetIds) {
      const frame = presetToFrame.get(presetId);
      if (!frame) continue;

      const meta = presetMeta.get(presetId) ?? { cluster, energy: "" };
      const stem = sanitizeStem(presetId.slice(0, 60));
      const fileName = `${cluster}__${meta.energy || ""}__${frame.idHash}__${stem}.webp`;
      const dest = path.join(destDir, fileName);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(frame.abs, dest);
      }
      copied.push({ cluster, presetId, rel: frame.rel, dest: path.relative(qaDir, dest).replace(/\\/g, "/") });
    }
  }

  // index.html
  const htmlParts = [];
  htmlParts.push(`<!doctype html><html><head><meta charset="utf-8"/>`);
  htmlParts.push(`<title>QA samples: ${pack}</title>`);
  htmlParts.push(`<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:16px} .cluster{margin:18px 0} .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px} img{width:100%;height:auto;display:block;border:1px solid #333} .hdr{font-weight:700;margin:8px 0}</style>`);
  htmlParts.push(`</head><body>`);
  htmlParts.push(`<h2>QA samples: ${pack}</h2>`);
  htmlParts.push(`<p>perCluster=${perCluster} frameIndex=${frameIndex} random=${random} copied=${copied.length}</p>`);

  for (const cluster of clusters) {
    const rows = copied.filter((r) => r.cluster === cluster);
    htmlParts.push(`<div class="cluster">`);
    htmlParts.push(`<div class="hdr">${cluster} (${rows.length})</div>`);
    htmlParts.push(`<div class="grid">`);
    for (const r of rows) {
      htmlParts.push(`<a href="${r.dest}"><img loading="lazy" src="${r.dest}"/></a>`);
    }
    htmlParts.push(`</div></div>`);
  }

  htmlParts.push(`</body></html>`);
  fs.writeFileSync(path.join(qaDir, "index.html"), htmlParts.join("\n"), "utf8");
  fs.writeFileSync(path.join(qaDir, "index.json"), JSON.stringify({ pack, perCluster, frameIndex, copied }, null, 2) + "\n", "utf8");

  console.log(`[qa] OK: wrote ${copied.length} images -> ${qaDir}`);
  console.log(`[qa] index -> ${path.join(qaDir, "index.html")}`);
}

main();
