#!/usr/bin/env node
/**
 * Attempt to "repair" crashy MilkDrop presets by disabling custom wave/shape code:
 *   wavecode_*_enabled=0
 *   shapecode_*_enabled=0
 *
 * This is a pragmatic stability hack: it can turn some `wasm-abort` presets into
 * non-crashing (often darker/less dynamic) presets, suitable for building a larger
 * crash-safe pool for live use.
 *
 * Designed for huge libraries:
 * - Reads a blacklist (quality-blacklist.json) and processes only selected relPaths
 * - Streams work, supports resume via a progress file
 * - Emits a pack-style `library-manifest.json` (when output is under public/presets)
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const argMap = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (token === "-h" || token === "--help") argMap.set("help", "true");
    if (!token.startsWith("--")) continue;
    const body = token.slice(2);
    if (!body) continue;
    if (body.includes("=")) {
      const [key, rawValue] = body.split("=");
      if (key) argMap.set(key, rawValue ?? "true");
      continue;
    }
    const key = body;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      argMap.set(key, next);
      i += 1;
    } else {
      argMap.set(key, "true");
    }
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
  if (!s) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
};

const help = parseBool(resolveArg("help", "false"));

const blacklistRaw = String(resolveArg("blacklist", "")).trim();
const blacklistPath = blacklistRaw ? path.resolve(blacklistRaw) : "";

const relPathsRaw = String(resolveArg("relPathsFile", "")).trim();
const relPathsFile = relPathsRaw ? path.resolve(relPathsRaw) : "";
const sourceRoot = path.resolve(String(resolveArg("sourceRoot", "")).trim());
const outDir = path.resolve(
  String(
    resolveArg(
      "outDir",
      path.join("artifacts", "presets", "repair-nowavesnoshapes")
    )
  ).trim()
);

const mode = String(resolveArg("mode", "wasm-abort-only")).trim().toLowerCase();
const limitValue = Number(resolveArg("limit", "200"));
const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.floor(limitValue) : 0;

const resume = parseBool(resolveArg("resume", "true"), true);
const overwrite = parseBool(resolveArg("overwrite", "false"), false);
const dryRun = parseBool(resolveArg("dryRun", "false"), false);
const quiet = parseBool(resolveArg("quiet", "false"), false);
const forceInvert = parseBool(resolveArg("forceInvert", "false"), false);

const checkpointEveryValue = Number(resolveArg("checkpointEvery", "50"));
const checkpointEvery =
  Number.isFinite(checkpointEveryValue) && checkpointEveryValue > 0
    ? Math.floor(checkpointEveryValue)
    : 50;

const progressPath = path.join(outDir, "repair-nowavesnoshapes.progress.json");
const reportPath = path.join(outDir, "repair-nowavesnoshapes.report.json");

const usage = () => {
  console.log("Repair crashy presets by disabling wave/shape code (NoWavesNoShapes)");
  console.log(
    "Usage: node scripts/repair-crash-presets-nowavesnoshapes.mjs \\\n" +
      "  (--blacklist <quality-blacklist.json> | --relPathsFile <relpaths.txt>) \\\n" +
      "  --sourceRoot <original preset root> \\\n" +
      "  --outDir <output pack dir> \\\n" +
      "  [--mode wasm-abort-only|hard-fail] [--limit 200] [--resume true] [--overwrite false] [--dryRun false]\n"
  );
  console.log("");
  console.log("Modes:");
  console.log("  wasm-abort-only  Only entries with reason 'wasm-abort' and WITHOUT any 'Aborted(...)' text");
  console.log("  hard-fail        Any entry that has wasm-abort/render-failed/probe-timeout/Aborted(...)");
  console.log("");
  console.log("Selection:");
  console.log("  --blacklist      Use badSourceRelPaths + badReasonsByRelPath from snapshot-preset-audit.mjs");
  console.log("  --relPathsFile   One relPath per line (relative to sourceRoot). Useful with SQLite exports.");
  console.log("");
  console.log("Notes:");
  console.log("- This does NOT guarantee 'quality.ok'. It only aims to avoid hard crashes.");
  console.log("- Re-audit the output dir with preset-audit.mjs to measure success rate.");
};

if (
  help ||
  (!blacklistPath && !relPathsFile) ||
  !sourceRoot ||
  !["wasm-abort-only", "hard-fail"].includes(mode)
) {
  usage();
  process.exit(help ? 0 : 2);
}

const isAbortedText = (r) => /^Aborted\(/.test(String(r ?? ""));
const HARD_SET = new Set(["wasm-abort", "render-failed", "probe-timeout"]);

const shouldSelect = (reasons) => {
  const rs = Array.isArray(reasons) ? reasons.map(String) : [];
  const hasWasmAbort = rs.includes("wasm-abort");
  const hasHard = rs.some((r) => HARD_SET.has(r) || isAbortedText(r));
  const hasAborted = rs.some(isAbortedText);
  if (mode === "hard-fail") return hasHard;
  return hasWasmAbort && !hasAborted;
};

const decodePresetText = (buf) => {
  const fixes = [];
  let text = "";
  let decoded = "utf8";
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    text = decoder.decode(buf);
  } catch {
    text = buf.toString("latin1");
    decoded = "latin1";
    fixes.push("decoded-latin1");
  }
  if (text.startsWith("\ufeff")) {
    text = text.slice(1);
    fixes.push("removed-bom");
  }
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized !== text) {
    text = normalized;
    fixes.push("normalized-line-endings");
  }
  const stripped = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  if (stripped !== text) {
    text = stripped;
    fixes.push("stripped-control-chars");
  }
  if (!text.endsWith("\n")) {
    text += "\n";
    fixes.push("ensure-trailing-newline");
  }
  return { text, decoded, fixes };
};

const patchNoWavesNoShapes = (text) => {
  const lines = text.split("\n");
  let wavecodeDisabled = 0;
  let shapecodeDisabled = 0;
  let shaderLinesStripped = 0;

  const firstKeyIndex = new Map();
  const seenKeys = new Set();
  const trackKey = (key, idx) => {
    if (!key) return;
    seenKeys.add(key);
    if (!firstKeyIndex.has(key)) firstKeyIndex.set(key, idx);
  };

  let nWaves = null;
  let nShapes = null;
  let anyWaveEnabled = false;
  let anyShapeEnabled = false;

  const out = lines.map((line) => {
    const mKV = line.match(/^\s*([a-z0-9_]+)\s*=\s*([^;\n]+)\s*$/i);
    if (mKV) {
      const k = String(mKV[1] ?? "").trim();
      const vRaw = String(mKV[2] ?? "").trim();
      trackKey(k, 0);
      if (/^n_waves$/i.test(k)) {
        const n = Number(vRaw);
        if (Number.isFinite(n)) nWaves = Math.floor(n);
      }
      if (/^n_shapes$/i.test(k)) {
        const n = Number(vRaw);
        if (Number.isFinite(n)) nShapes = Math.floor(n);
      }
      if (/^wave_\d+_enabled$/i.test(k)) {
        const n = Number(vRaw);
        if (Number.isFinite(n) && n !== 0) anyWaveEnabled = true;
      }
      if (/^shape_\d+_enabled$/i.test(k)) {
        const n = Number(vRaw);
        if (Number.isFinite(n) && n !== 0) anyShapeEnabled = true;
      }
    }

    const mWave = line.match(/^(wavecode_\d+_enabled)\s*=\s*([-+0-9.eE]+)\s*$/i);
    if (mWave) {
      const key = mWave[1];
      const prev = Number(mWave[2]);
      if (Number.isFinite(prev) && prev !== 0) {
        wavecodeDisabled += 1;
        return `${key}=0`;
      }
      return `${key}=0`;
    }
    const mShape = line.match(/^(shapecode_\d+_enabled)\s*=\s*([-+0-9.eE]+)\s*$/i);
    if (mShape) {
      const key = mShape[1];
      const prev = Number(mShape[2]);
      if (Number.isFinite(prev) && prev !== 0) {
        shapecodeDisabled += 1;
        return `${key}=0`;
      }
      return `${key}=0`;
    }
    return line;
  });

  // Some presets become permanently black because custom warp/comp shaders only
  // sample the previous frame (feedback) and never incorporate overlay geometry.
  // When we repair a preset, strip these shader blocks to restore visibility.
  const didDisableAnyCode = wavecodeDisabled + shapecodeDisabled > 0;
  if (didDisableAnyCode) {
    for (let i = out.length - 1; i >= 0; i--) {
      const line = out[i] ?? "";
      if (/^\s*(warp_\d+|comp_\d+)\s*=/.test(String(line))) {
        out.splice(i, 1);
        shaderLinesStripped += 1;
      }
    }
  }

  // If disabling custom code leaves no visible waves/shapes enabled, add a minimal
  // emergency wave+shape to avoid "too-dark" outcomes.
  const needsEmergencyVisuals = (() => {
    const wavesZero = nWaves != null ? nWaves <= 0 : false;
    const shapesZero = nShapes != null ? nShapes <= 0 : false;

    // If the preset explicitly says it has zero waves/shapes, or none are enabled,
    // inject a small bright overlay.
    if (wavesZero && shapesZero) return true;
    if (!anyWaveEnabled && !anyShapeEnabled) return true;
    return false;
  })();

  let visualsAdded = false;

  const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const setOrAppend = (key, value) => {
    // Replace ALL occurrences of the key (some presets repeat keys and the last one wins).
    const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`, "i");
    let replaced = 0;
    for (let i = 0; i < out.length; i++) {
      if (re.test(out[i])) {
        out[i] = `${key}=${value}`;
        replaced += 1;
      }
    }
    if (!replaced) out.push(`${key}=${value}`);
  };

  // Brighten strategy:
  // - If we disabled any code, these presets tend to become too-dark.
  // - Always add a bright overlay wave+shape (low-risk) when we actually changed the preset.
  // - If the preset had no waves/shapes enabled, also ensure counts are at least 1.
  if (didDisableAnyCode) {
    visualsAdded = true;

    // Global brighten knobs (more reliable than custom wave/shape slots across engines).
    // Many crashy presets were already tuned to be very dark; after disabling code they
    // can become effectively black unless we force some baseline output.
    setOrAppend("bBrighten", "1");
    setOrAppend("bDarken", "0");
    if (forceInvert) setOrAppend("bInvert", "1");
    setOrAppend("bAdditiveWaves", "1");
    setOrAppend("bWaveDots", "0");
    setOrAppend("bWaveThick", "1");
    setOrAppend("bMaximizeWaveColor", "1");
    setOrAppend("nWaveMode", "0");
    setOrAppend("fWaveAlpha", "0.90");
    setOrAppend("fWaveScale", "0.75");
    setOrAppend("wave_r", "1.000");
    setOrAppend("wave_g", "1.000");
    setOrAppend("wave_b", "1.000");

    // Ensure counts are at least 1 so overlay wave/shape can render.
    if (nWaves == null || nWaves <= 0) setOrAppend("n_waves", "1");
    if (nShapes == null || nShapes <= 0) setOrAppend("n_shapes", "1");

    // A bright, low-risk waveform overlay.
    setOrAppend("wave_0_enabled", "1");
    setOrAppend("wave_0_mode", "0");
    setOrAppend("wave_0_bSpectrum", "1");
    setOrAppend("wave_0_bDrawThick", "1");
    setOrAppend("wave_0_additive", "1");
    setOrAppend("wave_0_samples", "512");
    setOrAppend("wave_0_scaling", "1.0");
    setOrAppend("wave_0_smoothing", "0.75");
    setOrAppend("wave_0_r", "1.0");
    setOrAppend("wave_0_g", "1.0");
    setOrAppend("wave_0_b", "1.0");
    setOrAppend("wave_0_a", "1.0");

    // A subtle center shape to lift average luma without blowing out.
    setOrAppend("shape_0_enabled", "1");
    setOrAppend("shape_0_sides", "4");
    setOrAppend("shape_0_additive", "1");
    setOrAppend("shape_0_textured", "0");
    setOrAppend("shape_0_thickoutline", "0");
    setOrAppend("shape_0_x", "0.5");
    setOrAppend("shape_0_y", "0.5");
    // Large shape to lift average luma (thin waves often don't move avgLuma enough).
    setOrAppend("shape_0_rad", "1.25");
    setOrAppend("shape_0_ang", "0");
    setOrAppend("shape_0_r", "1.0");
    setOrAppend("shape_0_g", "1.0");
    setOrAppend("shape_0_b", "1.0");
    setOrAppend("shape_0_a", "0.38");
  }

  return {
    text: out.join("\n"),
    patch: { wavecodeDisabled, shapecodeDisabled, shaderLinesStripped, visualsAdded },
  };
};

const slugify = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const atomicWriteJson = async (filePath, data) => {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(tmp, filePath);
};

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const loadProgress = async () => {
  if (!resume) return null;
  try {
    const raw = await fs.readFile(progressPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const loadRelPathsFile = async () => {
  if (!relPathsFile) return null;
  try {
    const raw = await fs.readFile(relPathsFile, "utf8");
    const lines = raw
      .split(/\r?\n/g)
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    return lines;
  } catch (e) {
    throw new Error(`Failed to read relPathsFile: ${relPathsFile} :: ${String(e?.message ?? e)}`);
  }
};

const main = async () => {
  const startedAt = Date.now();
  const relPathsFromFile = await loadRelPathsFile();
  const blacklist = relPathsFromFile
    ? null
    : JSON.parse(await fs.readFile(blacklistPath, "utf8"));

  const badRelPaths = relPathsFromFile
    ? relPathsFromFile.map(String)
    : Array.isArray(blacklist?.badSourceRelPaths)
      ? blacklist.badSourceRelPaths.map(String)
      : [];

  const reasonsByRelPath = relPathsFromFile
    ? {}
    : blacklist && typeof blacklist === "object"
      ? blacklist.badReasonsByRelPath ?? {}
      : {};

  const progress0 = await loadProgress();
  const doneSet = new Set(
    Array.isArray(progress0?.items)
      ? progress0.items.map((x) => String(x?.relPath ?? "")).filter(Boolean)
      : []
  );

  await ensureDir(outDir);

  const selected = [];
  for (const rel of badRelPaths) {
    const reasons = reasonsByRelPath?.[rel] ?? [];
    if (relPathsFromFile) {
      selected.push(rel);
    } else {
      if (shouldSelect(reasons)) selected.push(rel);
    }
    if (limit && selected.length >= limit) break;
  }

  if (!selected.length) {
    console.log(
      `[repair-nowavesnoshapes] No matching presets (mode=${mode}) in ${blacklistPath}`
    );
    return;
  }

  const packName = path.basename(outDir);
  const items = Array.isArray(progress0?.items) ? [...progress0.items] : [];
  let processed = items.length;
  let written = items.filter((x) => x?.status === "ok").length;
  let patched = items.filter((x) => x?.status === "ok" && x?.patched).length;
  let errors = items.filter((x) => x?.status === "error").length;
  let wavecodeDisabledTotal = 0;
  let shapecodeDisabledTotal = 0;

  const log = (msg) => {
    if (quiet) return;
    console.log(msg);
  };

  log(`[repair-nowavesnoshapes] mode=${mode} limit=${limit || "ALL"}`);
  log(`[repair-nowavesnoshapes] blacklist=${blacklistPath}`);
  log(`[repair-nowavesnoshapes] sourceRoot=${sourceRoot}`);
  log(`[repair-nowavesnoshapes] outDir=${outDir}`);
  log(`[repair-nowavesnoshapes] selected=${selected.length} (resumeDone=${doneSet.size})`);

  for (const relPath of selected) {
    if (doneSet.has(relPath)) continue;

    const inPath = path.join(sourceRoot, relPath.split("/").join(path.sep));
    const outRelPath = relPath; // preserve tree
    const outPath = path.join(outDir, outRelPath.split("/").join(path.sep));

    processed += 1;

    try {
      if (!overwrite) {
        try {
          await fs.access(outPath);
          doneSet.add(relPath);
          items.push({
            relPath,
            outRelPath,
            status: "ok",
            note: "exists",
          });
          written += 1;
          continue;
        } catch {
          // continue
        }
      }

      const buf = await fs.readFile(inPath);
      const { text: decodedText, decoded, fixes } = decodePresetText(buf);
      const { text: patchedText, patch } = patchNoWavesNoShapes(decodedText);

      const outDirName = path.dirname(outPath);
      if (!dryRun) {
        await ensureDir(outDirName);
        await fs.writeFile(outPath, patchedText, "utf8");
      }

      doneSet.add(relPath);
      items.push({
        relPath,
        outRelPath,
        status: "ok",
        decoded,
        fixes,
        patched: patch,
      });
      written += 1;
      if ((patch?.wavecodeDisabled ?? 0) + (patch?.shapecodeDisabled ?? 0) > 0) {
        patched += 1;
      }
      wavecodeDisabledTotal += Number(patch?.wavecodeDisabled ?? 0) || 0;
      shapecodeDisabledTotal += Number(patch?.shapecodeDisabled ?? 0) || 0;
    } catch (error) {
      doneSet.add(relPath);
      items.push({
        relPath,
        outRelPath,
        status: "error",
        errorText: String(error?.message ?? error),
      });
      errors += 1;
    }

    if (!quiet && processed % 50 === 0) {
      const elapsedSec = Math.max(1, (Date.now() - startedAt) / 1000);
      const rate = (processed / elapsedSec).toFixed(2);
      log(
        `[repair-nowavesnoshapes] processed=${processed} written=${written} patched=${patched} errors=${errors} rate=${rate}/s`
      );
    }

    if (!dryRun && checkpointEvery && processed % checkpointEvery === 0) {
      await atomicWriteJson(progressPath, {
        version: "v0",
        generatedAt: new Date().toISOString(),
        mode,
        blacklistPath,
        sourceRoot,
        outDir,
        counts: { processed, written, patched, errors },
        items,
      });
    }
  }

  if (!dryRun) {
    await atomicWriteJson(progressPath, {
      version: "v0",
      generatedAt: new Date().toISOString(),
      mode,
      blacklistPath: relPathsFromFile ? null : blacklistPath,
      relPathsFile: relPathsFromFile ? relPathsFile : null,
      sourceRoot,
      outDir,
      counts: { processed, written, patched, errors },
      items,
    });
  }

  // If this looks like a public pack, emit a library-manifest.json for UI use.
  const publicPresetsDir = path.resolve("public", "presets");
  const isPublicPack =
    outDir.toLowerCase().startsWith(publicPresetsDir.toLowerCase() + path.sep);
  const manifestPath = path.join(outDir, "library-manifest.json");

  if (!dryRun && isPublicPack) {
    const manifestPresets = [];
    for (const it of items) {
      if (it.status !== "ok") continue;
      const rel = String(it.outRelPath ?? "");
      if (!rel) continue;

      const fileName = path.basename(rel);
      const label = fileName.toLowerCase().endsWith(".milk")
        ? fileName.slice(0, -5)
        : fileName;
      const relPath = `${packName}/${rel.split(path.sep).join("/")}`.replace(/\\/g, "/");
      const url = `/presets/${relPath}`;
      const digest = crypto.createHash("sha1").update(relPath).digest("hex").slice(0, 6);
      const id = `${packName}-${slugify(label) || "preset"}-${digest}`;
      let fileSize = undefined;
      try {
        const stat = await fs.stat(path.join(outDir, rel.split("/").join(path.sep)));
        fileSize = stat.size;
      } catch {
        // ignore
      }
      manifestPresets.push({
        id,
        label,
        relPath,
        url,
        pack: packName,
        fileName,
        fileSize,
        meta: {
          repair: "NoWavesNoShapes",
          patched: it.patched ?? null,
        },
      });
    }

    await atomicWriteJson(manifestPath, {
      version: "v0",
      generatedAt: new Date().toISOString(),
      sourceRoot: publicPresetsDir,
      totalFilesScanned: badRelPaths.length,
      totalEligibleScanned: selected.length,
      totalPresetsIncluded: manifestPresets.length,
      presets: manifestPresets,
    });

    log(`[repair-nowavesnoshapes] wrote manifest: ${manifestPath}`);
  } else if (!dryRun) {
    log(
      `[repair-nowavesnoshapes] (skip manifest) outDir is not under ${publicPresetsDir}`
    );
  }

  const elapsedSec = Math.max(1, (Date.now() - startedAt) / 1000);

  if (!dryRun) {
    await atomicWriteJson(reportPath, {
      version: "v0",
      generatedAt: new Date().toISOString(),
      mode,
      blacklistPath: relPathsFromFile ? null : blacklistPath,
      relPathsFile: relPathsFromFile ? relPathsFile : null,
      sourceRoot,
      outDir,
      packName,
      paths: {
        progressPath,
        reportPath,
        ...(isPublicPack ? { manifestPath } : {}),
      },
      selection: {
        selected: selected.length,
        limit: limit || null,
        resume: !!resume,
        overwrite: !!overwrite,
      },
      counts: { processed, written, patched, errors },
      patchTotals: {
        wavecodeDisabledTotal,
        shapecodeDisabledTotal,
      },
      elapsedSec: Math.round(elapsedSec),
    });
  }

  log(
    `[repair-nowavesnoshapes] DONE processed=${processed} written=${written} patched=${patched} errors=${errors} elapsed=${Math.round(
      elapsedSec
    )}s`
  );
};

await main();

