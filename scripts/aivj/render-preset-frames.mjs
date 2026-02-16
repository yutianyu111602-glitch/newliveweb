#!/usr/bin/env node
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import util from "node:util";

function parseArgs(argv) {
  const argMap = new Map();
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token || !String(token).startsWith("--")) continue;
    const body = String(token).slice(2);
    if (!body) continue;
    if (body.includes("=")) {
      const [key, rawValue] = body.split("=");
      if (key) argMap.set(key, rawValue ?? "true");
      continue;
    }
    const key = body;
    const next = tokens[i + 1];
    if (next && !String(next).startsWith("--")) {
      argMap.set(key, next);
      i += 1;
    } else {
      argMap.set(key, "true");
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
    if (["1", "true", "yes", "y", "on"].includes(s)) return true;
    if (["0", "false", "no", "n", "off"].includes(s)) return false;
    return fallback;
  };

  const manifestPath = String(resolveArg("manifest", "")).trim();
  const sourceRoot = String(resolveArg("sourceRoot", resolveArg("source", ""))).trim();
  const relPathsFile = String(resolveArg("relPathsFile", "")).trim();

  const outDir = String(resolveArg("outDir", resolveArg("out", ""))).trim();
  const tier2OutDir = String(resolveArg("tier2OutDir", "")).trim();
  const devUrl = String(
    resolveArg(
      "devUrl",
      process.env.PRESET_PROBE_URL ?? "http://127.0.0.1:5174/preset-probe.html"
    )
  ).trim();
  const logFile = String(resolveArg("logFile", "")).trim();

  const headless = parseBool(resolveArg("headless", undefined), true);
  const resume = parseBool(resolveArg("resume", undefined), true);

  const limitValue = Number(resolveArg("limit", "0"));
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.floor(limitValue) : 0;

  const widthValue = Number(resolveArg("width", "256"));
  const heightValue = Number(resolveArg("height", "144"));
  const outSizeValue = Number(resolveArg("outSize", "224"));
  const warmupFramesValue = Number(resolveArg("warmupFrames", "60"));
  const captureCountValue = Number(resolveArg("captureCount", "3"));
  const captureEveryValue = Number(resolveArg("captureEvery", "30"));
  const captureMaxFramesValue = Number(resolveArg("captureMaxFrames", ""));
  const frameLumaMinValue = Number(resolveArg("frameLumaMin", ""));
  const frameLumaMaxValue = Number(resolveArg("frameLumaMax", ""));
  const frameLumaTargetValue = Number(resolveArg("frameLumaTarget", ""));
  const frameMotionMinValue = Number(resolveArg("frameMotionMin", ""));
  const frameMotionTargetValue = Number(resolveArg("frameMotionTarget", ""));
  const strictFrameFilter = parseBool(resolveArg("strictFrameFilter", undefined), false);
  const bandSweep = parseBool(resolveArg("bandSweep", undefined), false);
  const bandSweepFramesValue = Number(resolveArg("bandSweepFrames", ""));
  const bandSweepWarmupFramesValue = Number(resolveArg("bandSweepWarmupFrames", ""));
  const timeScaleValue = Number(resolveArg("timeScale", ""));
  const audioBpmValue = Number(resolveArg("audioBpm", ""));
  const audioBpmMinValue = Number(resolveArg("audioBpmMin", ""));
  const audioBpmMaxValue = Number(resolveArg("audioBpmMax", ""));
  const audioSwingValue = Number(resolveArg("audioSwing", ""));
  const audioKickBoostValue = Number(resolveArg("audioKickBoost", ""));
  const audioHatBoostValue = Number(resolveArg("audioHatBoost", ""));
  const audioClapBoostValue = Number(resolveArg("audioClapBoost", ""));
  const audioBassBoostValue = Number(resolveArg("audioBassBoost", ""));
  const audioSeedValue = Number(resolveArg("audioSeed", ""));
  const timeoutMsValue = Number(resolveArg("timeoutMs", "20000"));
  const stopAfterSecValue = Number(resolveArg("stopAfterSec", resolveArg("maxSeconds", "0")));
  const refreshEveryValue = Number(resolveArg("refreshEvery", "100"));
  const logEveryValue = Number(resolveArg("logEvery", "25")); // Reduced from 50 to 25 (more frequent progress logs)
  const retryTimesValue = Number(resolveArg("retryTimes", "2")); // Increased from 1 to 2 retries
  const presetDelayMsValue = Number(resolveArg("presetDelayMs", "200"));
  const skipRelPathsFile = String(resolveArg("skipRelPathsFile", "")).trim();
  const skipRelPathContainsRaw = String(resolveArg("skipRelPathContains", "")).trim();
  const slowListOut = String(resolveArg("slowListOut", "")).trim();
  const slowPresetMsRaw = resolveArg("slowPresetMs", "");
  const slowPresetMsValue =
    slowPresetMsRaw === "" || slowPresetMsRaw == null ? NaN : Number(slowPresetMsRaw);
  const watchdogIdleMsRaw = resolveArg("watchdogIdleMs", "");
  const watchdogMaxPresetMsRaw = resolveArg("watchdogMaxPresetMs", "");
  const watchdogIdleMsValue =
    watchdogIdleMsRaw === "" || watchdogIdleMsRaw == null ? NaN : Number(watchdogIdleMsRaw);
  const watchdogMaxPresetMsValue =
    watchdogMaxPresetMsRaw === "" || watchdogMaxPresetMsRaw == null
      ? NaN
      : Number(watchdogMaxPresetMsRaw);
  const overlayManifest = String(resolveArg("overlayManifest", "")).trim();
  const overlaySourceRoot = String(
    resolveArg("overlaySourceRoot", resolveArg("overlaySource", ""))
  ).trim();
  const overlayRelPathsFile = String(resolveArg("overlayRelPathsFile", "")).trim();
  const overlayModeRaw = String(resolveArg("overlayMode", "none")).trim().toLowerCase();
  const overlayBlendRaw = String(resolveArg("overlayBlend", "screen")).trim().toLowerCase();
  const overlayMixValue = Number(resolveArg("overlayMix", ""));
  const overlayDepthPxValue = Number(resolveArg("overlayDepthPx", ""));
  const overlayScaleValue = Number(resolveArg("overlayScale", ""));
  const overlaySeedValue = Number(resolveArg("overlaySeed", ""));
  const overlayMode = overlayModeRaw === "parallax" ? "parallax" : "none";
  const overlayBlendModes = new Set([
    "normal",
    "add",
    "screen",
    "overlay",
    "multiply",
    "difference",
    "exclusion",
  ]);
  const overlayBlend = overlayBlendModes.has(overlayBlendRaw) ? overlayBlendRaw : "screen";

  const format = String(resolveArg("format", "webp")).trim().toLowerCase();
  const webpQualityValue = Number(resolveArg("webpQuality", "0.92"));

  const timeModeRaw = String(resolveArg("timeMode", "fixedStep")).trim().toLowerCase();
  const timeMode = timeModeRaw === "realtime" ? "realtime" : "fixedStep";
  const fixedStepFpsValue = Number(resolveArg("fixedStepFps", resolveArg("fixedFps", "30")));
  const forceNewWasmModule = parseBool(resolveArg("forceNewWasmModule", undefined), false);
  const debugPreset = parseBool(resolveArg("debugPreset", undefined), false);

  const prewarm = parseBool(resolveArg("prewarm", undefined), true);
  const prewarmTimeoutMsValue = Number(resolveArg("prewarmTimeoutMs", "60000"));

  const help = argMap.has("help") || argMap.has("h");

  return {
    manifestPath,
    sourceRoot,
    relPathsFile,
    outDir,
    tier2OutDir,
    devUrl,
    logFile,
    headless,
    resume,
    limit,
    width: Number.isFinite(widthValue) ? Math.max(64, Math.floor(widthValue)) : 256,
    height: Number.isFinite(heightValue) ? Math.max(64, Math.floor(heightValue)) : 144,
    outSize: Number.isFinite(outSizeValue) ? Math.max(32, Math.floor(outSizeValue)) : 224,
    warmupFrames: Number.isFinite(warmupFramesValue) ? Math.max(0, Math.floor(warmupFramesValue)) : 60,
    captureCount:
      Number.isFinite(captureCountValue) && captureCountValue >= 0
        ? Math.floor(captureCountValue)
        : 3,
    captureEvery:
      Number.isFinite(captureEveryValue) && captureEveryValue > 0
        ? Math.floor(captureEveryValue)
        : 30,
    captureMaxFrames:
      Number.isFinite(captureMaxFramesValue) && captureMaxFramesValue > 0
        ? Math.floor(captureMaxFramesValue)
        : 0,
    timeScale: Number.isFinite(timeScaleValue) ? timeScaleValue : null,
    audioBpm: Number.isFinite(audioBpmValue) ? audioBpmValue : null,
    audioBpmMin: Number.isFinite(audioBpmMinValue) ? audioBpmMinValue : null,
    audioBpmMax: Number.isFinite(audioBpmMaxValue) ? audioBpmMaxValue : null,
    audioSwing: Number.isFinite(audioSwingValue) ? audioSwingValue : null,
    audioKickBoost: Number.isFinite(audioKickBoostValue) ? audioKickBoostValue : null,
    audioHatBoost: Number.isFinite(audioHatBoostValue) ? audioHatBoostValue : null,
    audioClapBoost: Number.isFinite(audioClapBoostValue) ? audioClapBoostValue : null,
    audioBassBoost: Number.isFinite(audioBassBoostValue) ? audioBassBoostValue : null,
    audioSeed: Number.isFinite(audioSeedValue) ? Math.floor(audioSeedValue) : null,
    timeoutMs:
      Number.isFinite(timeoutMsValue) ? Math.max(500, Math.floor(timeoutMsValue)) : 20000,
    stopAfterSec:
      Number.isFinite(stopAfterSecValue) && stopAfterSecValue > 0
        ? Math.floor(stopAfterSecValue)
        : 0,
    refreshEvery:
      Number.isFinite(refreshEveryValue) && refreshEveryValue > 0
        ? Math.floor(refreshEveryValue)
        : 100,
    logEvery: Number.isFinite(logEveryValue) && logEveryValue > 0 ? Math.floor(logEveryValue) : 25,
    retryTimes:
      Number.isFinite(retryTimesValue) && retryTimesValue >= 0 ? Math.floor(retryTimesValue) : 2,
    presetDelayMs:
      Number.isFinite(presetDelayMsValue) && presetDelayMsValue >= 0
        ? Math.floor(presetDelayMsValue)
        : 200,
    skipRelPathsFile,
    skipRelPathContains: skipRelPathContainsRaw,
    slowListOut,
    slowPresetMs: Number.isFinite(slowPresetMsValue) ? slowPresetMsValue : null,
    frameLumaMin: Number.isFinite(frameLumaMinValue)
      ? Math.max(0, Math.min(1, frameLumaMinValue))
      : null,
    frameLumaMax: Number.isFinite(frameLumaMaxValue)
      ? Math.max(0, Math.min(1, frameLumaMaxValue))
      : null,
    frameLumaTarget: Number.isFinite(frameLumaTargetValue)
      ? Math.max(0, Math.min(1, frameLumaTargetValue))
      : null,
    frameMotionMin: Number.isFinite(frameMotionMinValue)
      ? Math.max(0, Math.min(1, frameMotionMinValue))
      : null,
    frameMotionTarget: Number.isFinite(frameMotionTargetValue)
      ? Math.max(0, Math.min(1, frameMotionTargetValue))
      : null,
    strictFrameFilter,
    bandSweep,
    bandSweepFrames:
      Number.isFinite(bandSweepFramesValue) && bandSweepFramesValue > 0
        ? Math.floor(bandSweepFramesValue)
        : null,
    bandSweepWarmupFrames:
      Number.isFinite(bandSweepWarmupFramesValue) && bandSweepWarmupFramesValue >= 0
        ? Math.floor(bandSweepWarmupFramesValue)
        : null,
    overlayManifest,
    overlaySourceRoot,
    overlayRelPathsFile,
    overlayMode,
    overlayBlend,
    overlayMix: Number.isFinite(overlayMixValue) ? overlayMixValue : null,
    overlayDepthPx:
      Number.isFinite(overlayDepthPxValue) ? Math.max(0, Math.floor(overlayDepthPxValue)) : null,
    overlayScale: Number.isFinite(overlayScaleValue) ? overlayScaleValue : null,
    overlaySeed: Number.isFinite(overlaySeedValue) ? Math.floor(overlaySeedValue) : null,
    format: format === "png" ? "png" : "webp",
    webpQuality:
      Number.isFinite(webpQualityValue) ? Math.max(0, Math.min(1, webpQualityValue)) : 0.92,
    timeMode,
    fixedStepFps:
      Number.isFinite(fixedStepFpsValue) && fixedStepFpsValue > 0
        ? Math.min(240, Math.max(1, Math.floor(fixedStepFpsValue)))
        : 30,
    forceNewWasmModule,
    debugPreset,
    prewarm,
    prewarmTimeoutMs:
      Number.isFinite(prewarmTimeoutMsValue) ? Math.max(5_000, Math.floor(prewarmTimeoutMsValue)) : 60_000,
    watchdogIdleMs:
      Number.isFinite(watchdogIdleMsValue) ? Math.max(10_000, Math.floor(watchdogIdleMsValue)) : null,
    watchdogMaxPresetMs:
      Number.isFinite(watchdogMaxPresetMsValue) ? Math.max(30_000, Math.floor(watchdogMaxPresetMsValue)) : null,
    help,
  };
}

function hashId(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 16);
}

function hashToInt32(value) {
  const hex = crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 8);
  return parseInt(hex, 16) >>> 0;
}

function pickOverlayTarget(targets, baseId, baseRelPath, overlaySeed) {
  if (!targets.length) return null;
  const seed = Number.isFinite(overlaySeed) ? overlaySeed : 0;
  const idx = hashToInt32(`${seed}|${baseId}`) % targets.length;
  let chosen = targets[idx];
  if (targets.length > 1 && chosen?.relPath === baseRelPath) {
    chosen = targets[(idx + 1) % targets.length];
  }
  return chosen ?? null;
}

async function getCachedPresetText(cache, filePath) {
  if (cache.has(filePath)) return cache.get(filePath);
  const text = await readPresetFileText(filePath);
  cache.set(filePath, text);
  return text;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function normalizeRelPath(relPath) {
  return String(relPath ?? "").split("\\").join("/").replace(/^\/+/, "");
}

function isLikelyUtf8(buf) {
  // Quick UTF-8 sanity: reject if it contains lots of 0xFFFD replacement chars after decode.
  // This is a heuristic; we still allow fallback to latin1.
  try {
    const s = buf.toString("utf8");
    const bad = (s.match(/\uFFFD/g) ?? []).length;
    return bad <= 2;
  } catch {
    return false;
  }
}

function sanitizePresetText(text) {
  let out = String(text ?? "");
  // Remove BOM.
  out = out.replace(/^\uFEFF/, "");
  // Normalize line endings.
  out = out.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Strip control chars except TAB + LF.
  out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  // Ensure trailing newline (ProjectM/MilkDrop parsers can be picky).
  if (!out.endsWith("\n")) out += "\n";
  return out;
}

async function readPresetFileText(filePath) {
  const buf = await fs.readFile(filePath);
  // Fail fast on NULs: often indicates a binary file.
  if (buf.includes(0)) {
    const err = new Error("binary-nul");
    err.code = "binary-nul";
    throw err;
  }
  if (!buf.length) {
    const err = new Error("empty");
    err.code = "empty";
    throw err;
  }
  const text = isLikelyUtf8(buf) ? buf.toString("utf8") : buf.toString("latin1");
  return sanitizePresetText(text);
}

async function loadManifestTargets(manifestPath) {
  const abs = path.resolve(manifestPath);
  const packDir = path.dirname(abs);
  // All manifests in this repo use `relPath` relative to `public/presets`.
  // - For overlay manifests (e.g. run3-crashsafe), relPath may point into another pack.
  // - For sync-presets packs, relPath includes the pack name prefix.
  // Therefore: resolve file paths from the `public/presets` root, not from `packDir`.
  const presetsRoot = path.dirname(packDir);
  const raw = await fs.readFile(abs, "utf8");
  const manifest = JSON.parse(raw);
  const presets = Array.isArray(manifest?.presets) ? manifest.presets : [];
  const out = [];
  for (const p of presets) {
    const presetId = String(p?.id ?? "").trim();
    const relPath = String(p?.relPath ?? "").trim();
    if (!presetId || !relPath) continue;
    const normalizedRel = normalizeRelPath(relPath);
    const filePath = path.join(presetsRoot, normalizedRel);
    out.push({
      presetId,
      relPath: normalizedRel,
      filePath,
      label: String(p?.label ?? ""),
    });
  }
  return { packDir, targets: out };
}

async function loadRelPathsTargets(sourceRoot, relPathsFile) {
  const absRoot = path.resolve(sourceRoot);
  const absList = path.resolve(relPathsFile);
  const raw = await fs.readFile(absList, "utf8");
  const relPaths = raw
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
  const targets = relPaths.map((rel) => {
    const normalizedRel = normalizeRelPath(rel);
    return {
      presetId: normalizedRel,
      relPath: normalizedRel,
      filePath: path.join(absRoot, normalizedRel),
      label: path.basename(normalizedRel),
    };
  });
  return { packDir: absRoot, targets };
}

async function readJsonlIds(indexPath) {
  const seen = new Set();
  if (!indexPath) return seen;
  if (!fssync.existsSync(indexPath)) return seen;
  const input = fssync.createReadStream(indexPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = String(line ?? "").trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      const status = String(obj?.status ?? "").trim();
      if (status && status !== "ok") {
        continue;
      }
      const id = String(obj?.presetId ?? obj?.id ?? "").trim();
      if (id) seen.add(id);
    } catch {
      // ignore
    }
  }
  return seen;
}

function readRelPathList(filePath) {
  const set = new Set();
  if (!filePath || !fssync.existsSync(filePath)) return set;
  const raw = fssync.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/g)) {
    const trimmed = String(line ?? "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const normalized = normalizeRelPath(trimmed.split("#")[0].trim());
    if (normalized) set.add(normalized);
  }
  return set;
}

function parseContainsList(raw) {
  if (!raw) return [];
  return raw
    .split(/[|,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

const progressState = {
  lastAt: 0,
  lastStage: "",
  lastUrl: "",
};

const updateProgressState = (payload) => {
  progressState.lastAt = Date.now();
  if (payload && typeof payload === "object") {
    if (payload.stage) progressState.lastStage = String(payload.stage);
    if (payload.url) progressState.lastUrl = String(payload.url);
  }
};

const installProgressBinding = async (page) => {
  try {
    await page.exposeBinding("__nw_reportProgress", (_source, payload) => {
      updateProgressState(payload);
    });
  } catch {
    // ignore
  }
};

async function createProbeContext({ devUrl, headless }) {
  const { chromium } = await import("playwright");
  const hwAccelArgs = [
    "--use-gl=angle",
    "--use-angle=d3d11",
    "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization",
    "--enable-zero-copy",
    "--disable-software-rasterizer",
  ];

  const browser = await chromium.launch({
    headless,
    args: [
      ...hwAccelArgs,
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=CalculateNativeWinOcclusion",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await installProgressBinding(page);
  const resp = await page.goto(devUrl, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  if (!resp || !resp.ok()) {
    throw new Error(
      `Probe page not reachable: ${devUrl} (${resp?.status()} ${resp?.statusText()})`
    );
  }

  const ensureLoaded = async () => {
    await page.evaluate(async () => {
      if (typeof globalThis.__nw_dumpPresetFrames !== "function") {
        const mod = await import("/src/features/presets/presetFrameDump.ts");
        globalThis.__nw_dumpPresetFrames = mod.dumpPresetFrames;
      }
    });
  };
  await ensureLoaded();

  return { browser, context, page, ensureLoaded };
}

async function closeProbeContext(ctx) {
  if (!ctx) return;
  const safeClose = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      console.warn(`[render-frames] WARN: failed to close ${name}:`, String(e?.message ?? e));
    }
  };

  // Close in leaf->root order.
  if (ctx.page) await safeClose("page", () => ctx.page.close?.({ runBeforeUnload: false }));
  if (ctx.context) await safeClose("context", () => ctx.context.close?.());
  if (ctx.browser) {
    await safeClose("browser", () => ctx.browser.close?.());
    try {
      const proc = typeof ctx.browser.process === "function" ? ctx.browser.process() : null;
      const pid = proc?.pid;
      if (pid) {
        try {
          process.kill(pid);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }
}

async function runDumpWithHardTimeout(ctx, payload, hardTimeoutMs) {
  const p = ctx.page.evaluate(async (data) => {
    const fn = globalThis.__nw_dumpPresetFrames;
    if (typeof fn !== "function") {
      return { ok: false, reasons: ["probe-unavailable"], errorText: "dump function missing" };
    }
    return await fn(data);
  }, payload);

  return await Promise.race([
    p,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`probe-timeout>${hardTimeoutMs}ms`)), hardTimeoutMs)
    ),
  ]);
}

async function runDumpWithWatchdog(ctx, payload, hardTimeoutMs, watchdog) {
  const idleMs = Number.isFinite(watchdog?.idleMs) ? watchdog.idleMs : 0;
  const maxPresetMs = Number.isFinite(watchdog?.maxPresetMs) ? watchdog.maxPresetMs : 0;
  updateProgressState({ stage: "start", url: payload?.url });
  const startedAt = Date.now();
  if (!idleMs && !maxPresetMs) {
    return await runDumpWithHardTimeout(ctx, payload, hardTimeoutMs);
  }

  let done = false;
  let timer = null;
  const guard = new Promise((_, reject) => {
    timer = setInterval(() => {
      if (done) return;
      const now = Date.now();
      if (idleMs && now - progressState.lastAt > idleMs) {
        done = true;
        reject(new Error(`watchdog-idle>${idleMs}ms stage=${progressState.lastStage}`));
        return;
      }
      if (maxPresetMs && now - startedAt > maxPresetMs) {
        done = true;
        reject(new Error(`watchdog-max>${maxPresetMs}ms stage=${progressState.lastStage}`));
      }
    }, 1000);
  });

  try {
    const result = await Promise.race([runDumpWithHardTimeout(ctx, payload, hardTimeoutMs), guard]);
    done = true;
    return result;
  } finally {
    done = true;
    if (timer) clearInterval(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const logFile = args.logFile ? path.resolve(args.logFile) : "";
  let logStream = null;
  if (logFile) {
    const logDir = path.dirname(logFile);
    if (logDir && logDir !== "." && !fssync.existsSync(logDir)) {
      fssync.mkdirSync(logDir, { recursive: true });
    }
    logStream = fssync.createWriteStream(logFile, { flags: "a", encoding: "utf8" });
    const format = (...values) => util.format(...values);
    const mirror = (orig) => (...values) => {
      const line = format(...values);
      orig(...values);
      logStream.write(`${line}\n`);
    };
    console.log = mirror(console.log.bind(console));
    console.error = mirror(console.error.bind(console));
    console.warn = mirror(console.warn.bind(console));
    if (console.info) console.info = mirror(console.info.bind(console));
    process.on("exit", () => {
      try {
        logStream.end();
      } catch {
        // ignore
      }
    });
  }
  if (args.help) {
    console.log("Render preset frames for offline AIVJ/CLIP embedding");
    console.log(
      "Usage:\n" +
        "  node scripts/aivj/render-preset-frames.mjs --manifest <pack/library-manifest.json> --outDir <artifacts/aivj/pack>\n" +
        "  node scripts/aivj/render-preset-frames.mjs --sourceRoot <dir> --relPathsFile <crashsafe.txt> --outDir <artifacts/aivj/run>\n"
    );
    console.log("");
    console.log("Key options:");
    console.log("  --devUrl URL            default http://127.0.0.1:5174/preset-probe.html");
    console.log("  --logFile PATH          mirror logs to file (UTF-8)");
    console.log("  --headless true|false   default true");
    console.log("  --resume true|false     default true");
    console.log("  --limit N               0 = all");
    console.log("  --tier2OutDir PATH      optional outDir for quality-filtered frames");
    console.log("  --stopAfterSec N        stop after N seconds (graceful checkpoint)");
    console.log("  --refreshEvery N        restart browser every N presets (default 100)");
    console.log("  --timeoutMs N           per-preset timeout (default 20000)");
    console.log("  --skipRelPathsFile PATH skip relPaths listed in file");
    console.log("  --skipRelPathContains S skip relPaths containing tokens (comma/|)");
    console.log("  --slowListOut PATH      append slow relPaths to this file");
    console.log("  --slowPresetMs N        mark slow if preset exceeds N ms");
    console.log("  --captureMaxFrames N    capture up to N frames for luma selection");
    console.log("  --frameLumaMin V        prefer frames with avg luma >= V (0..1)");
    console.log("  --frameLumaMax V        prefer frames with avg luma <= V (0..1)");
    console.log("  --frameLumaTarget V     tie-break target luma (0..1)");
    console.log("  --frameMotionMin V      prefer frames with motion >= V (0..1)");
    console.log("  --frameMotionTarget V   tie-break target motion (0..1)");
    console.log("  --strictFrameFilter true|false  fail preset if selected frames miss luma/motion thresholds");
    console.log("  --bandSweep true|false  run low/mid/high sweep classification");
    console.log("  --bandSweepFrames N     frames per band (default 12)");
    console.log("  --bandSweepWarmupFrames N warmup frames per band (default 2)");
    console.log("  --timeScale N           speed factor for internal time (0.25..3)");
    console.log("  --audioBpm N            fixed BPM for synthetic techno audio");
    console.log("  --audioBpmMin N         min BPM when randomizing");
    console.log("  --audioBpmMax N         max BPM when randomizing");
    console.log("  --audioSwing N          swing amount (0..0.25)");
    console.log("  --audioKickBoost N      kick gain (0.6..2.5)");
    console.log("  --audioHatBoost N       hat gain (0.4..2.0)");
    console.log("  --audioClapBoost N      clap gain (0.4..2.0)");
    console.log("  --audioBassBoost N      bass gain (0.5..2.0)");
    console.log("  --audioSeed N           seed for audio variation");
    console.log("  --overlayMode none|parallax   default none");
    console.log("  --overlayManifest PATH  overlay pack manifest");
    console.log("  --overlaySourceRoot DIR overlay source root (with --overlayRelPathsFile)");
    console.log("  --overlayRelPathsFile PATH overlay relPaths list");
    console.log("  --overlayBlend MODE     normal|add|screen|overlay|multiply|difference|exclusion");
    console.log("  --overlayMix N          blend strength (0..1)");
    console.log("  --overlayDepthPx N      parallax depth in pixels");
    console.log("  --overlayScale N        overlay scale offset (0..0.25)");
    console.log("  --overlaySeed N         seed for overlay selection/parallax");
    console.log("  --timeMode realtime|fixedStep   default fixedStep");
    console.log("  --fixedStepFps N        default 30");
    console.log("  --forceNewWasmModule true|false default false (slow)");
    console.log("  --debugPreset true|false        log preset debug hashes (default: false)");
    console.log("  --prewarm true|false    default true (avoid first-preset timeouts)");
    console.log("  --prewarmTimeoutMs N    default 60000");
    console.log("  --watchdogIdleMs N      abort if no progress for N ms");
    console.log("  --watchdogMaxPresetMs N abort if preset wall time exceeds N ms");
    process.exitCode = 0;
    return;
  }

  if (!args.outDir) {
    console.error("[render-frames] Missing --outDir");
    process.exit(2);
  }

  if (!args.manifestPath && !(args.sourceRoot && args.relPathsFile)) {
    console.error("[render-frames] Provide either --manifest OR (--sourceRoot + --relPathsFile)");
    process.exit(2);
  }

  const defaultIdleMs = Math.max(
    150_000,
    Math.round(args.timeoutMs * 3),
    Math.round(args.prewarmTimeoutMs * 1.5)
  );
  const defaultMaxPresetMs = Math.max(
    300_000,
    Math.round((args.timeoutMs + 15_000) * (args.retryTimes + 1) + 60_000)
  );
  const watchdog = {
    idleMs: Number.isFinite(args.watchdogIdleMs) ? args.watchdogIdleMs : defaultIdleMs,
    maxPresetMs: Number.isFinite(args.watchdogMaxPresetMs)
      ? args.watchdogMaxPresetMs
      : defaultMaxPresetMs,
  };
  const slowPresetMs = Number.isFinite(args.slowPresetMs)
    ? args.slowPresetMs
    : Math.max(180_000, Math.round((args.timeoutMs + 10_000) * (args.retryTimes + 1)));

  const outDir = path.resolve(args.outDir);
  const framesDir = path.join(outDir, "frames");
  const indexPath = path.join(outDir, "frames-index.jsonl");
  await ensureDir(framesDir);
  const tier2OutDir = args.tier2OutDir ? path.resolve(args.tier2OutDir) : "";
  const tier2FramesDir = tier2OutDir ? path.join(tier2OutDir, "frames") : "";
  const tier2IndexPath = tier2OutDir
    ? path.join(tier2OutDir, "frames-index.jsonl")
    : "";
  if (tier2OutDir) {
    await ensureDir(tier2FramesDir);
  }

  const { packDir, targets: rawTargets } = args.manifestPath
    ? await loadManifestTargets(args.manifestPath)
    : await loadRelPathsTargets(args.sourceRoot, args.relPathsFile);

  const slowListPath = args.slowListOut ? path.resolve(args.slowListOut) : "";
  if (slowListPath) {
    const slowDir = path.dirname(slowListPath);
    if (slowDir && slowDir !== "." && !fssync.existsSync(slowDir)) {
      fssync.mkdirSync(slowDir, { recursive: true });
    }
  }
  const slowRelSet = slowListPath ? readRelPathList(slowListPath) : new Set();
  const skipRelSet = new Set([
    ...readRelPathList(args.skipRelPathsFile),
    ...slowRelSet,
  ]);
  const skipContains = parseContainsList(args.skipRelPathContains).map((s) => s.toLowerCase());

  const recordSlowRelPath = async (relPath, reason, elapsedMs) => {
    if (!slowListPath) return;
    const normalized = normalizeRelPath(relPath);
    if (!normalized || slowRelSet.has(normalized)) return;
    slowRelSet.add(normalized);
    await fs.appendFile(slowListPath, `${normalized}\n`, "utf8");
    const meta = [];
    if (reason) meta.push(reason);
    if (Number.isFinite(elapsedMs)) meta.push(`elapsedMs=${Math.round(elapsedMs)}`);
    const suffix = meta.length ? ` (${meta.join(", ")})` : "";
    console.log(`[render-frames] slow-list add ${normalized}${suffix}`);
  };

  let skippedByFilter = 0;
  const targets = [];
  for (const target of rawTargets) {
    const normalizedRel = normalizeRelPath(target.relPath);
    const lowerRel = normalizedRel.toLowerCase();
    const hitContains = skipContains.some((token) => lowerRel.includes(token));
    const hitList = skipRelSet.has(normalizedRel);
    if (hitList || hitContains) {
      skippedByFilter += 1;
      const reason = hitContains ? "skip-contains" : "skip-list";
      await recordSlowRelPath(normalizedRel, reason);
      continue;
    }
    targets.push({ ...target, relPath: normalizedRel });
  }

  let overlayTargets = [];
  let overlaySourceLabel = "";
  if (args.overlayMode !== "none") {
    try {
      if (args.overlayManifest) {
        const overlay = await loadManifestTargets(args.overlayManifest);
        overlayTargets = overlay.targets;
        overlaySourceLabel = args.overlayManifest;
      } else if (args.overlaySourceRoot && args.overlayRelPathsFile) {
        const overlay = await loadRelPathsTargets(args.overlaySourceRoot, args.overlayRelPathsFile);
        overlayTargets = overlay.targets;
        overlaySourceLabel = args.overlayRelPathsFile;
      } else {
        overlayTargets = targets;
        overlaySourceLabel = "base-pack";
      }
    } catch (e) {
      console.warn("[render-frames] WARN: overlay load failed:", String(e?.message ?? e));
      overlayTargets = [];
    }
  }
  const overlayEnabled = args.overlayMode !== "none" && overlayTargets.length > 0;
  if (args.overlayMode !== "none") {
    console.log(
      `[render-frames] overlay mode=${args.overlayMode} blend=${args.overlayBlend} targets=${overlayTargets.length} source=${overlaySourceLabel || "none"}`
    );
  }
  const overlaySeed = Number.isFinite(args.overlaySeed) ? args.overlaySeed : null;
  const overlayCache = new Map();

  const seen = args.resume ? await readJsonlIds(indexPath) : new Set();
  const total = args.limit ? Math.min(args.limit, targets.length) : targets.length;

  console.log(`[render-frames] devUrl=${args.devUrl} headless=${args.headless}`);
  console.log(`[render-frames] targets=${targets.length} packDir=${packDir}`);
  console.log(`[render-frames] outDir=${outDir}`);
  if (tier2OutDir) {
    console.log(`[render-frames] tier2OutDir=${tier2OutDir}`);
  }
  console.log(`[render-frames] resume=${args.resume} seen=${seen.size}`);
  if (skippedByFilter > 0) {
    console.log(
      `[render-frames] skip-filtered=${skippedByFilter} contains=${skipContains.join("|") || "none"}`
    );
  }
  console.log(`[render-frames] watchdog idleMs=${watchdog.idleMs} maxPresetMs=${watchdog.maxPresetMs}`);
  console.log(`[render-frames] slowPresetMs=${slowPresetMs}`);
    if (args.strictFrameFilter) {
      console.log("[render-frames] strictFrameFilter=true");
    }
    if (args.bandSweep) {
      console.log(
        `[render-frames] bandSweep=true frames=${
          args.bandSweepFrames ?? "default"
        } warmup=${args.bandSweepWarmupFrames ?? "default"}`
      );
    }

  const tStart = Date.now();
  const shouldStop = () => args.stopAfterSec && (Date.now() - tStart) / 1000 > args.stopAfterSec;

  let ctx = null;
  let processed = 0;
  let ok = 0;
  let failed = 0;
  let skipped = 0;

  const appendIndexLineTo = async (targetPath, obj) => {
    if (!targetPath) return;
    const line = JSON.stringify(obj) + "\n";
    await fs.appendFile(targetPath, line, "utf8");
  };
  const appendIndexLine = async (obj) => appendIndexLineTo(indexPath, obj);

  const writeFramesTo = async (targetFramesDir, idHash, frames) => {
    const bucketDir = path.join(
      targetFramesDir,
      idHash.slice(0, 2),
      idHash.slice(2, 4),
      idHash
    );
    await ensureDir(bucketDir);
    const framesOut = [];
    for (let k = 0; k < frames.length; k++) {
      const f = frames[k];
      const mime = String(f?.mime ?? "");
      const b64 = String(f?.b64 ?? "");
      if (!b64) continue;
      const ext = mime.includes("png") ? "png" : "webp";
      const fileName = `frame-${String(k).padStart(3, "0")}.${ext}`;
      const absOut = path.join(bucketDir, fileName);
      await fs.writeFile(absOut, Buffer.from(b64, "base64"));
      framesOut.push(path.relative(path.dirname(targetFramesDir), absOut).split(path.sep).join("/"));
    }
    return framesOut;
  };

  // Prewarm preset text so the very first render after a browser (re)open
  // doesn't time out while wasm/shaders compile.
  let prewarmPresetText = "";
  if (args.prewarm) {
    for (let i = 0; i < Math.min(10, targets.length); i++) {
      try {
        prewarmPresetText = await readPresetFileText(targets[i].filePath);
        if (prewarmPresetText) break;
      } catch {
        // ignore
      }
    }
  }

  const prewarmContext = async () => {
    if (!args.prewarm) return;
    if (!prewarmPresetText) return;
    if (!ctx?.page) return;

    const payload = {
      url: "prewarm",
      presetData: prewarmPresetText,
      width: args.width,
      height: args.height,
      outSize: args.outSize,
      warmupFrames: 2,
      captureCount: 0,
      captureEvery: 1,
      timeScale: args.timeScale ?? undefined,
      audioBpm: args.audioBpm ?? undefined,
      audioBpmMin: args.audioBpmMin ?? undefined,
      audioBpmMax: args.audioBpmMax ?? undefined,
      audioSwing: args.audioSwing ?? undefined,
      audioKickBoost: args.audioKickBoost ?? undefined,
      audioHatBoost: args.audioHatBoost ?? undefined,
      audioClapBoost: args.audioClapBoost ?? undefined,
      audioBassBoost: args.audioBassBoost ?? undefined,
      audioSeed: args.audioSeed ?? undefined,
      timeoutMs: Math.max(args.timeoutMs, args.prewarmTimeoutMs),
      format: args.format,
      webpQuality: args.webpQuality,
      audio: "synthetic",
      statsKey: "aivj",
      timeMode: args.timeMode,
      fixedStepFps: args.fixedStepFps,
      forceNewWasmModule: args.forceNewWasmModule,
    };

    const hardTimeoutMs = Math.max(1000, Math.min(180_000, payload.timeoutMs + 20_000));
    try {
      console.log(`[render-frames] prewarm (timeoutMs=${payload.timeoutMs})...`);
      await runDumpWithWatchdog(ctx, payload, hardTimeoutMs, watchdog);
      console.log("[render-frames] prewarm done");
    } catch (e) {
      console.warn("[render-frames] WARN: prewarm failed:", String(e?.message ?? e));
    }
  };

  const reopenContext = async () => {
    // Preserve verification state across browser refreshes
    const prevVerify = globalThis.__projectm_verify;
    await closeProbeContext(ctx);
    ctx = null;
    ctx = await createProbeContext({ devUrl: args.devUrl, headless: args.headless });
    // Restore verification state
    if (prevVerify) {
      globalThis.__projectm_verify = prevVerify;
    }
    await prewarmContext();
  };

  await reopenContext();

  for (let i = 0; i < targets.length; i++) {
    if (args.limit && processed >= args.limit) break;
    if (shouldStop()) {
      console.log(`[render-frames] stopAfterSec reached; stopping at processed=${processed}`);
      break;
    }

    const target = targets[i];
    const presetId = String(target.presetId);
    if (args.resume && seen.has(presetId)) {
      skipped += 1;
      continue;
    }

    const relPath = normalizeRelPath(target.relPath);
    const filePath = target.filePath;
    if (slowRelSet.has(relPath)) {
      skipped += 1;
      continue;
    }
    const presetStartMs = Date.now();

    if (processed > 0 && args.refreshEvery && processed % args.refreshEvery === 0) {
      console.log(`[render-frames] refresh browser before preset ${i+1} (processed=${processed})`);
      await reopenContext();
    }

    let presetText = "";
    try {
      presetText = await readPresetFileText(filePath);
      if (args.debugPreset) {
        // DEBUG: Log preset content hash to verify it's changing
        const hash = presetText.slice(0, 100).replace(/\s+/g, "").slice(0, 30);
        console.log(`[render-frames] DEBUG preset ${i+1}: hash=${hash}...`);
      }
    } catch (e) {
      const msg = String(e?.message ?? e);
      failed += 1;
      processed += 1;
      await appendIndexLine({
        version: "v0",
        at: new Date().toISOString(),
        presetId,
        relPath,
        filePath,
        status: "failed",
        reasons: [msg || "read-failed"],
      });
      continue;
    }

    let overlayPresetData = "";
    let overlaySeedForPreset = overlaySeed;
    if (overlayEnabled) {
      const overlayTarget = pickOverlayTarget(overlayTargets, presetId, relPath, overlaySeed);
      if (overlayTarget?.filePath) {
        try {
          overlayPresetData = await getCachedPresetText(overlayCache, overlayTarget.filePath);
          if (overlaySeedForPreset == null) {
            overlaySeedForPreset = hashToInt32(overlayTarget.presetId);
          }
        } catch (e) {
          console.warn(
            `[render-frames] WARN: overlay read failed preset=${presetId.slice(0, 60)} overlay=${overlayTarget.relPath}: ${String(e?.message ?? e)}`
          );
          overlayPresetData = "";
        }
      }
    }

    const payload = {
      url: relPath,
      presetData: presetText,
      width: args.width,
      height: args.height,
      outSize: args.outSize,
      warmupFrames: args.warmupFrames,
      captureCount: args.captureCount,
      captureEvery: args.captureEvery,
      captureMaxFrames: args.captureMaxFrames,
      timeScale: args.timeScale ?? undefined,
      audioBpm: args.audioBpm ?? undefined,
      audioBpmMin: args.audioBpmMin ?? undefined,
      audioBpmMax: args.audioBpmMax ?? undefined,
      audioSwing: args.audioSwing ?? undefined,
      audioKickBoost: args.audioKickBoost ?? undefined,
      audioHatBoost: args.audioHatBoost ?? undefined,
      audioClapBoost: args.audioClapBoost ?? undefined,
      audioBassBoost: args.audioBassBoost ?? undefined,
      audioSeed: args.audioSeed ?? undefined,
      timeoutMs: args.timeoutMs,
      format: args.format,
      webpQuality: args.webpQuality,
      audio: "synthetic",
      statsKey: "aivj",
      timeMode: args.timeMode,
      fixedStepFps: args.fixedStepFps,
      forceNewWasmModule: args.forceNewWasmModule,
      frameLumaMin: args.frameLumaMin ?? undefined,
      frameLumaMax: args.frameLumaMax ?? undefined,
      frameLumaTarget: args.frameLumaTarget ?? undefined,
      frameMotionMin: args.frameMotionMin ?? undefined,
      frameMotionTarget: args.frameMotionTarget ?? undefined,
      bandSweep: args.bandSweep,
      bandSweepFrames: args.bandSweepFrames ?? undefined,
      bandSweepWarmupFrames: args.bandSweepWarmupFrames ?? undefined,
      overlayPresetData: overlayPresetData || undefined,
      overlayMode: overlayPresetData ? args.overlayMode : undefined,
      overlayBlend: overlayPresetData ? args.overlayBlend : undefined,
      overlayMix: overlayPresetData ? (args.overlayMix ?? undefined) : undefined,
      overlayDepthPx: overlayPresetData ? (args.overlayDepthPx ?? undefined) : undefined,
      overlayScale: overlayPresetData ? (args.overlayScale ?? undefined) : undefined,
      overlaySeed: overlayPresetData ? (overlaySeedForPreset ?? undefined) : undefined,
    };

    let lastErr = null;
    let result = null;
    let slowFailureReason = "";
    for (let attempt = 0; attempt <= args.retryTimes; attempt++) {
      if (attempt > 0) {
        console.warn(`[render-frames] retry presetId=${presetId} attempt=${attempt}`);
      }
      try {
        if (attempt > 0) await ctx.ensureLoaded?.();
        const hardTimeoutMs = Math.max(1000, Math.min(600_000, args.timeoutMs + 20_000));
        result = await runDumpWithWatchdog(ctx, payload, hardTimeoutMs, watchdog);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        const errMsg = String(e?.message ?? e);
        const isSlowFailure = errMsg.includes("probe-timeout") || errMsg.includes("watchdog-");
        if (isSlowFailure) {
          slowFailureReason = errMsg;
          console.warn(`[render-frames] WARN: ${errMsg}`);
          break;
        }
        try {
          await reopenContext();
        } catch {
          // ignore
        }
      }
    }

    const presetElapsedMs = Date.now() - presetStartMs;
    processed += 1;

    if (lastErr) {
      const msg = String(lastErr?.message ?? lastErr);
      failed += 1;
      const slowReason =
        slowFailureReason ||
        (msg.includes("probe-timeout") ? "probe-timeout" : msg.includes("watchdog-") ? "watchdog" : "");
      if (slowReason || presetElapsedMs >= slowPresetMs) {
        await recordSlowRelPath(relPath, slowReason || "slow-elapsed", presetElapsedMs);
      }
      await appendIndexLine({
        version: "v0",
        at: new Date().toISOString(),
        presetId,
        relPath,
        filePath,
        status: "failed",
        reasons: [msg || "probe-error"],
      });
      if (slowReason) {
        try {
          await reopenContext();
        } catch {
          // ignore
        }
      }
    } else {
      let okFlag = Boolean(result?.ok);
      let reasons = Array.isArray(result?.reasons)
        ? result.reasons.map((r) => String(r)).filter(Boolean)
        : [];
      const metrics = result?.metrics && typeof result.metrics === "object" ? result.metrics : undefined;
      if (okFlag && args.strictFrameFilter) {
        const strictReasons = [];
        const luma = Number.isFinite(metrics?.avgLuma) ? metrics.avgLuma : null;
        const motion = Number.isFinite(metrics?.motion) ? metrics.motion : null;
        let lumaMissing = false;
        let motionMissing = false;
        if (args.frameLumaMin != null || args.frameLumaMax != null) {
          if (luma == null) {
            lumaMissing = true;
            strictReasons.push("luma-missing");
          }
        }
        if (!lumaMissing) {
          if (args.frameLumaMin != null && luma < args.frameLumaMin) {
            strictReasons.push(`luma<${args.frameLumaMin}`);
          }
          if (args.frameLumaMax != null && luma > args.frameLumaMax) {
            strictReasons.push(`luma>${args.frameLumaMax}`);
          }
        }
        if (args.frameMotionMin != null) {
          if (motion == null) {
            motionMissing = true;
            strictReasons.push("motion-missing");
          } else if (motion < args.frameMotionMin) {
            strictReasons.push(`motion<${args.frameMotionMin}`);
          }
        }
        if (strictReasons.length) {
          okFlag = false;
          reasons = reasons.concat(["quality-filter"], strictReasons);
        }
      }

      if (!okFlag) {
        failed += 1;
        const slowReason =
          reasons.find((r) => r.includes("probe-timeout")) ||
          reasons.find((r) => r.includes("watchdog-")) ||
          "";
        if (slowReason || presetElapsedMs >= slowPresetMs) {
          await recordSlowRelPath(relPath, slowReason || "slow-elapsed", presetElapsedMs);
        }
        console.warn(
          `[render-frames] FAILED preset=${presetId.slice(0, 60)} reasons=${reasons.join(", ")}`
        );
        await appendIndexLine({
          version: "v0",
          at: new Date().toISOString(),
          presetId,
          relPath,
          filePath,
          status: "failed",
          reasons: reasons.length ? reasons : ["probe-failed"],
          errorText: result?.errorText ? String(result.errorText) : undefined,
          metrics,
        });
        const canTier2 =
          Boolean(tier2OutDir && tier2FramesDir && tier2IndexPath) &&
          reasons.includes("quality-filter");
        const hardFail = reasons.some((r) =>
          [
            "probe-timeout",
            "watchdog",
            "render-failed",
            "preset-load-failed",
            "overlay-preset-load-failed",
            "wasm-abort",
            "probe-error",
          ].some((token) => r.includes(token))
        );
        const tierFrames = Array.isArray(result?.frames) ? result.frames : [];
        if (canTier2 && !hardFail && tierFrames.length) {
          const idHash = hashId(presetId);
          const framesOut = await writeFramesTo(tier2FramesDir, idHash, tierFrames);
          await appendIndexLineTo(tier2IndexPath, {
            version: "v0",
            at: new Date().toISOString(),
            presetId,
            relPath,
            filePath,
            status: "ok",
            tier: "dark",
            idHash,
            frames: framesOut,
            reasons,
            metrics,
          });
        }
      } else {
        ok += 1;
        // Log successful renders with metrics for verification
        const lumaStr = metrics?.avgLuma != null ? metrics.avgLuma.toFixed(3) : "N/A";
        const motionStr = metrics?.motion != null ? metrics.motion.toFixed(4) : "N/A";
        console.log(
          `[render-frames] OK preset=${presetId.slice(0, 60)} luma=${lumaStr} motion=${motionStr} frames=${result?.frames?.length || 0}`
        );
        if (presetElapsedMs >= slowPresetMs) {
          await recordSlowRelPath(relPath, "slow-elapsed", presetElapsedMs);
        }
        const idHash = hashId(presetId);
        const frames = Array.isArray(result?.frames) ? result.frames : [];
        const framesOut = await writeFramesTo(framesDir, idHash, frames);

        await appendIndexLine({
          version: "v0",
          at: new Date().toISOString(),
          presetId,
          relPath,
          filePath,
          status: "ok",
          idHash,
          frames: framesOut,
          metrics,
        });
      }
    }

    // Add delay between presets to let engine/GPU fully clean up
    if (args.presetDelayMs > 0 && processed < total) {
      await new Promise(resolve => setTimeout(resolve, args.presetDelayMs));
    }

    if (processed % args.logEvery === 0 || processed === total) {
      const elapsed = (Date.now() - tStart) / 1000;
      const rate = elapsed > 0 ? processed / elapsed : 0;
      const remain = total - processed;
      const etaSec = rate > 0 ? remain / rate : 0;
      console.log(
        `[render-frames] PROGRESS: ${processed}/${total} ok=${ok} failed=${failed} skipped=${skipped} rate=${rate.toFixed(
          2
        )}/s ETA=${Math.round(etaSec)}s`
      );
    }
  }

  await closeProbeContext(ctx);

  const elapsed = (Date.now() - tStart) / 1000;
  console.log(
    `[render-frames] done processed=${processed} ok=${ok} failed=${failed} skipped=${skipped} elapsedSec=${elapsed.toFixed(
      1
    )}`
  );
}

main().catch((err) => {
  console.error("[render-frames] Fatal:", err);
  process.exit(1);
});
