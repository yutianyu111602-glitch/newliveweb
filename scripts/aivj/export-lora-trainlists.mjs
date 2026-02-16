#!/usr/bin/env node
/**
 * Export LoRA training lists from a pack's AIVJ style index.
 *
 * Output: one text file per bucket containing preset relPaths.
 *
 * Usage:
 *   node scripts/aivj/export-lora-trainlists.mjs --pack run3-okonly
 *   node scripts/aivj/export-lora-trainlists.mjs --pack run3-okonly --outDir artifacts/aivj/run3-okonly/lora-trainlists
 *
 * Resolution rules:
 * - Style index path: prefer public/presets/<pack>/aivj-style-index.v1.json, fallback to v0.
 * - Manifest path: public/presets/<pack>/library-manifest.json
 */

import fs from "node:fs";
import path from "node:path";

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

const readJson = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const sanitizeFileStem = (s) => {
  const base = String(s ?? "").trim();
  const cleaned = base
    .replace(/\s+/g, " ")
    .replace(/[:\\/\\?<>|\"\*]/g, "_")
    .replace(/\.+/g, ".")
    .replace(/\s/g, "_")
    .slice(0, 120);
  return cleaned.length ? cleaned : "unknown";
};

const pickClusterBucketKey = (entry) => {
  if (!entry || typeof entry !== "object") return null;

  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  for (const t of tags) {
    if (!isNonEmptyString(t)) continue;
    if (t.startsWith("cluster:")) {
      const key = t.slice("cluster:".length).trim();
      if (key) return key;
    }
  }

  // Fallback: newer cluster-based indexes use authorKey=cNN
  if (isNonEmptyString(entry.authorKey)) {
    const k = String(entry.authorKey).trim();
    if (/^c\d+$/i.test(k)) return k;
  }
  return null;
};

function main() {
  const args = parseArgs(process.argv);
  const help = args.has("help") || args.has("h");

  const pack = String(args.get("pack", "")).trim();
  const clusterOnly = String(args.get("clusterOnly", "true")).trim().toLowerCase() !== "false";
  const projectRoot = path.resolve(String(args.get("projectRoot", path.join(import.meta.dirname, "..", ".."))));

  if (help || !pack) {
    console.log("Export LoRA training lists from AIVJ style index");
    console.log("Usage: node scripts/aivj/export-lora-trainlists.mjs --pack <pack> [--outDir <dir>] [--projectRoot <dir>]");
    process.exit(pack ? 0 : 2);
  }

  const packDir = path.join(projectRoot, "public", "presets", pack);
  const manifestPath = path.resolve(String(args.get("manifestPath", path.join(packDir, "library-manifest.json"))));

  const styleIndexPathArg = String(args.get("styleIndexPath", "")).trim();
  const v1Candidate = path.join(packDir, "aivj-style-index.v1.json");
  const v0Candidate = path.join(packDir, "aivj-style-index.v0.json");
  const styleIndexPath = styleIndexPathArg
    ? path.resolve(styleIndexPathArg)
    : fs.existsSync(v1Candidate)
      ? v1Candidate
      : v0Candidate;

  const outDirArg = String(args.get("outDir", "")).trim();
  const outDir = path.resolve(
    outDirArg || path.join(projectRoot, "artifacts", "aivj", pack, "lora-trainlists")
  );

  if (!fs.existsSync(manifestPath)) {
    console.error(`[lora-export] FATAL: manifest not found: ${manifestPath}`);
    process.exit(2);
  }
  if (!fs.existsSync(styleIndexPath)) {
    console.error(`[lora-export] FATAL: style index not found: ${styleIndexPath}`);
    process.exit(2);
  }

  if (clusterOnly && path.basename(styleIndexPath) === "aivj-style-index.v0.json" && !styleIndexPathArg) {
    console.error(
      `[lora-export] FATAL: clusterOnly=true requires v1 style index (missing: ${v1Candidate})`
    );
    process.exit(2);
  }

  const manifest = readJson(manifestPath);
  const presets = Array.isArray(manifest?.presets)
    ? manifest.presets
    : Array.isArray(manifest?.entries)
      ? manifest.entries
      : Array.isArray(manifest?.items)
        ? manifest.items
        : [];

  const relPathById = new Map();
  for (const p of presets) {
    if (!p || typeof p !== "object") continue;
    const id = String(p.id ?? p.presetId ?? "").trim();
    const relPath = String(p.relPath ?? "").trim();
    if (!id || !relPath) continue;
    relPathById.set(id, relPath);
  }

  const styleIndex = readJson(styleIndexPath);
  const entries = Array.isArray(styleIndex?.entries) ? styleIndex.entries : [];

  const buckets = new Map();
  let missingRelPath = 0;
  let missingClusterKey = 0;
  for (const e of entries) {
    const presetId = String(e?.presetId ?? "").trim();
    if (!presetId) continue;
    const relPath = relPathById.get(presetId);
    if (!relPath) {
      missingRelPath += 1;
      continue;
    }
    const bucket = pickClusterBucketKey(e);
    if (!bucket) {
      missingClusterKey += 1;
      continue;
    }
    const key = sanitizeFileStem(bucket);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(relPath);
  }

  ensureDir(outDir);

  // Write per-bucket lists.
  const summaryBuckets = [];
  const keys = Array.from(buckets.keys()).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    const lines = buckets.get(key);
    // Dedupe while preserving order.
    const seen = new Set();
    const uniq = [];
    for (const rp of lines) {
      if (seen.has(rp)) continue;
      seen.add(rp);
      uniq.push(rp);
    }

    const fileName = `bucket-${key}.txt`;
    const filePath = path.join(outDir, fileName);
    fs.writeFileSync(filePath, uniq.join("\n") + "\n", "utf8");
    summaryBuckets.push({ key, fileName, count: uniq.length });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    pack,
    clusterOnly,
    manifestPath,
    styleIndexPath,
    styleIndexVersion: String(styleIndex?.version ?? ""),
    totalStyleEntries: entries.length,
    totalBuckets: summaryBuckets.length,
    missingRelPath,
    missingClusterKey,
    buckets: summaryBuckets,
  };

  const summaryPath = path.join(outDir, "lora-trainlists.summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");

  console.log(`[lora-export] OK: wrote ${summaryBuckets.length} buckets -> ${outDir}`);
  console.log(`[lora-export] summary -> ${summaryPath}`);
  console.log(
    `[lora-export] styleIndex=${path.basename(styleIndexPath)} entries=${entries.length} missingRelPath=${missingRelPath} missingClusterKey=${missingClusterKey}`
  );
}

main();
