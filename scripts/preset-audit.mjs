#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_SAMPLE_MODE = "reservoir";
const DEFAULT_OUT_DIR = path.resolve("artifacts", "presets", "audit");
const DEFAULT_DEV_URL =
  process.env.PRESET_PROBE_URL ?? "http://127.0.0.1:5174/preset-probe.html";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(__filename, "..", "..");
const workspaceRoot = path.resolve(projectRoot, "..");

const DEFAULT_SOURCE_CANDIDATES = [
  process.env.PRESET_SOURCE,
  path.join(workspaceRoot, "MilkDrop 130k+ Presets MegaPack 2025"),
  path.join(workspaceRoot, "MilkDrop 130k+ Presets MegaPack 2025 2"),
].filter(Boolean);

const argMap = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token || !token.startsWith("--")) continue;
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
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
};

const argvTokens = process.argv.slice(2);
const positionalLimit =
  argvTokens[0] && !String(argvTokens[0]).startsWith("--")
    ? String(argvTokens[0])
    : undefined;

const sampleMode = String(
  resolveArg("sample", resolveArg("mode", DEFAULT_SAMPLE_MODE))
).trim();

const defaultSource = DEFAULT_SOURCE_CANDIDATES[0] ?? projectRoot;
const sourceDir = path.resolve(resolveArg("source", defaultSource));

const manifestPathArg = resolveArg("manifest", resolveArg("manifestPath", ""));
const manifestPath = manifestPathArg ? path.resolve(String(manifestPathArg)) : "";

const outDir = path.resolve(
  resolveArg("out", process.env.PRESET_AUDIT_OUT ?? DEFAULT_OUT_DIR)
);
const reportPath = path.join(outDir, "preset-audit.json");
const summaryPath = path.join(outDir, "audit-summary.json");
const blacklistPath = path.join(outDir, "quality-blacklist.json");

const limitValue = Number(resolveArg("limit", positionalLimit ?? "0"));
const limit =
  Number.isFinite(limitValue) && limitValue > 0 ? Math.floor(limitValue) : 0;

const scanLimitValue = Number(resolveArg("scanLimit", "0"));
const scanLimit =
  Number.isFinite(scanLimitValue) && scanLimitValue > 0
    ? Math.floor(scanLimitValue)
    : 0;

const seedRaw = resolveArg("seed", String(Date.now()));
const seedValue = Number(seedRaw);
const seed = Number.isFinite(seedValue) ? Math.floor(seedValue) : Date.now();

const resume = parseBool(resolveArg("resume", undefined), false);
const checkpointEveryValue = Number(resolveArg("checkpointEvery", "200"));
let checkpointEvery =
  Number.isFinite(checkpointEveryValue) && checkpointEveryValue > 0
    ? Math.floor(checkpointEveryValue)
    : 200;
if (!argMap.has("checkpointEvery") && limit === 0 && checkpointEvery < 1000) {
  checkpointEvery = 5000;
}

const repairEnabled = parseBool(
  resolveArg("repair", resolveArg("fix", undefined)),
  false
);
const repairOutDir = path.resolve(
  resolveArg("repairOut", path.join(outDir, "fixed"))
);

let probeEnabled = (() => {
  if (argMap.has("no-probe")) return false;
  return parseBool(resolveArg("probe", "true"), true);
})();

const probeMissing = parseBool(
  resolveArg("probeMissing", probeEnabled ? "true" : "false"),
  probeEnabled
);
const refreshStatic = parseBool(resolveArg("refreshStatic", "false"), false);
const force = parseBool(resolveArg("force", "false"), false);

const devUrl = String(resolveArg("devUrl", DEFAULT_DEV_URL)).trim();
const headless = parseBool(resolveArg("headless", "true"), true);

const logEveryValue = Number(resolveArg("logEvery", "2000"));
const logEvery =
  Number.isFinite(logEveryValue) && logEveryValue > 0
    ? Math.floor(logEveryValue)
    : 2000;

const statusEverySecValue = Number(resolveArg("statusEverySec", "60"));
const statusEverySec =
  Number.isFinite(statusEverySecValue) && statusEverySecValue > 0
    ? Math.floor(statusEverySecValue)
    : 60;

const maxConsecutiveProbeFailuresValue = Number(
  resolveArg("maxProbeFailures", "20")
);
const maxConsecutiveProbeFailures =
  Number.isFinite(maxConsecutiveProbeFailuresValue) &&
  maxConsecutiveProbeFailuresValue > 0
    ? Math.floor(maxConsecutiveProbeFailuresValue)
    : 20;

const probeRetryTimesValue = Number(resolveArg("probeRetryTimes", "2"));
const probeRetryTimes =
  Number.isFinite(probeRetryTimesValue) && probeRetryTimesValue >= 0
    ? Math.floor(probeRetryTimesValue)
    : 2;

const probeRetryDelayMsValue = Number(resolveArg("probeRetryDelayMs", "400"));
const probeRetryDelayMs =
  Number.isFinite(probeRetryDelayMsValue) && probeRetryDelayMsValue >= 0
    ? Math.floor(probeRetryDelayMsValue)
    : 400;

const probeSuspendMsValue = Number(resolveArg("probeSuspendMs", "30000"));
const probeSuspendMs =
  Number.isFinite(probeSuspendMsValue) && probeSuspendMsValue >= 0
    ? Math.floor(probeSuspendMsValue)
    : 30000;

const probeRefreshEveryValue = Number(resolveArg("probeRefreshEvery", "300"));
const probeRefreshEvery =
  Number.isFinite(probeRefreshEveryValue) && probeRefreshEveryValue > 0
    ? Math.floor(probeRefreshEveryValue)
    : 300;

const probeFailMode = String(resolveArg("probeFailMode", "abort"))
  .trim()
  .toLowerCase();

const probeWidth = Number(resolveArg("probeWidth", "256"));
const probeHeight = Number(resolveArg("probeHeight", "144"));
const warmupFrames = Number(resolveArg("warmupFrames", "8"));
const sampleFrames = Number(resolveArg("sampleFrames", "24"));
const probeTimeoutMs = Number(resolveArg("probeTimeoutMs", "4500"));
const readTimeoutMsValue = Number(resolveArg("readTimeoutMs", "30000"));
const readTimeoutMs =
  Number.isFinite(readTimeoutMsValue) && readTimeoutMsValue > 0
    ? Math.floor(readTimeoutMsValue)
    : 30000;
const minAvgLuma = Number(resolveArg("minAvgLuma", "0.06"));
const maxAvgLuma = Number(resolveArg("maxAvgLuma", "0.96"));
const minAvgFrameDelta = Number(resolveArg("minAvgFrameDelta", "0.002"));
const maxAvgRenderMsRaw = resolveArg("maxAvgRenderMs", "");
const maxP95RenderMsRaw = resolveArg("maxP95RenderMs", "");
const maxAvgRenderMs = maxAvgRenderMsRaw !== "" ? Number(maxAvgRenderMsRaw) : NaN;
const maxP95RenderMs = maxP95RenderMsRaw !== "" ? Number(maxP95RenderMsRaw) : NaN;

const stopAfterValue = Number(resolveArg("stopAfter", resolveArg("maxProcessed", "0")));
const stopAfter =
  Number.isFinite(stopAfterValue) && stopAfterValue > 0 ? Math.floor(stopAfterValue) : 0;

const stopAfterSecValue = Number(resolveArg("stopAfterSec", resolveArg("maxSeconds", "0")));
const stopAfterSec =
  Number.isFinite(stopAfterSecValue) && stopAfterSecValue > 0 ? Math.floor(stopAfterSecValue) : 0;

const mulberry32 = (a) => {
  let t = (a >>> 0) || 1;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const rng = mulberry32(seed >>> 0);

const readFileWithTimeout = async (filePath, timeoutMs) => {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
  // Node supports AbortSignal for fs.promises.readFile; if not, we'll fall back.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  timer.unref?.();
  try {
    return await fs.readFile(filePath, { signal: controller.signal });
  } catch (error) {
    // Fallback path for older Node or environments where 'signal' isn't supported.
    const msg = String(error?.message ?? error);
    if (msg.includes("signal") || msg.includes("AbortSignal")) {
      return await fs.readFile(filePath);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(resolved);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".milk")) {
      yield resolved;
    }
  }
}

const readManifestTargets = async () => {
  if (!manifestPath) return null;
  let raw;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read manifest: ${manifestPath} (${String(error)})`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse manifest JSON: ${manifestPath} (${String(error)})`);
  }

  const presets = Array.isArray(parsed?.presets) ? parsed.presets : [];
  const manifestSourceRoot =
    typeof parsed?.sourceRoot === "string" && parsed.sourceRoot
      ? String(parsed.sourceRoot)
      : "";

  const root = manifestSourceRoot ? path.resolve(manifestSourceRoot) : sourceDir;
  const targets = [];
  for (const p of presets) {
    const rel = typeof p?.relPath === "string" ? String(p.relPath) : "";
    if (!rel) continue;
    const full = path.join(root, rel.split("/").join(path.sep));
    targets.push({ relPath: rel, fullPath: full });
  }

  return {
    manifestSourceRoot: root,
    targets,
  };
};

const normalizeRel = (root, full) =>
  path.relative(root, full).split(path.sep).join("/");

const extractPack = (relPath) => {
  const parts = relPath.split("/").filter(Boolean);
  return parts.length ? parts[0] : "";
};

const readExistingReport = async () => {
  if (!resume) return { entries: [], seen: new Set(), meta: {} };
  if (!fsSync.existsSync(reportPath))
    return { entries: [], seen: new Set(), meta: {} };
  try {
    const raw = await fs.readFile(reportPath, "utf8");
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const seen = new Set(entries.map((e) => String(e?.relPath ?? "")));
    const meta = parsed && typeof parsed === "object" ? parsed : {};
    return { entries, seen, meta };
  } catch {
    return { entries: [], seen: new Set(), meta: {} };
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isTransientProbeFailure = (quality) => {
  if (!quality || typeof quality !== "object") return false;
  if (quality.ok === true) return false;
  const reasons = Array.isArray(quality.reasons) ? quality.reasons.map(String) : [];
  return reasons.some((r) =>
    [
      "probe-timeout",
      "probe-error",
      "probe-unavailable",
      "Execution context was destroyed",
      "Target closed",
    ].some((needle) => String(r).includes(needle))
  );
};

const isProbeTimeoutFailure = (quality) => {
  if (!quality || typeof quality !== "object") return false;
  if (quality.ok === true) return false;
  const reasons = Array.isArray(quality.reasons) ? quality.reasons.map(String) : [];
  return reasons.some((r) => String(r).includes("probe-timeout"));
};

// Infra failures = probe mechanism is unhealthy (not "this preset is bad").
// IMPORTANT: do NOT include probe-timeout here; timeouts are usually preset-specific and
// shouldn't abort long runs.
const isInfraProbeFailure = (quality) => {
  if (!quality || typeof quality !== "object") return false;
  if (quality.ok === true) return false;
  const reasons = Array.isArray(quality.reasons) ? quality.reasons.map(String) : [];
  const errorText = String(quality.errorText ?? "");
  const needles = [
    "probe-error",
    "probe-unavailable",
    "Execution context was destroyed",
    "Target closed",
    "net::",
    "Navigation failed",
    "ERR_CONNECTION",
    "ECONNREFUSED",
  ];
  return (
    reasons.some((r) => needles.some((needle) => String(r).includes(needle))) ||
    needles.some((needle) => errorText.includes(needle))
  );
};

const isDevServerDownError = (message) => {
  const s = String(message ?? "").toLowerCase();
  return (
    s.includes("err_connection_refused") ||
    s.includes("econnrefused") ||
    s.includes("err_connection_reset") ||
    s.includes("net::err_connection") ||
    s.includes("probe page not reachable") ||
    s.includes("navigation failed")
  );
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

  return { text, fixes, decoded };
};

const sanitizePreset = async (filePath) => {
  const warnings = [];
  let buf;
  try {
    buf = await readFileWithTimeout(filePath, readTimeoutMs);
  } catch (error) {
    return {
      ok: false,
      fatal: true,
      warnings: ["read-failed"],
      errorText: String(error),
      text: "",
      fixes: [],
      decoded: "utf8",
      fileSize: 0,
    };
  }

  const fileSize = buf.length;
  if (fileSize === 0) warnings.push("empty");
  if (fileSize > 256 * 1024) warnings.push("large");
  if (buf.includes(0)) warnings.push("binary-nul");

  const { text, fixes, decoded } = decodePresetText(buf);
  const fatal = warnings.includes("binary-nul") || warnings.includes("read-failed");

  return {
    ok: true,
    fatal,
    warnings,
    fixes,
    decoded,
    text,
    fileSize,
  };
};

const PARAM_KEYS = new Set([
  "nWaveMode",
  "bWaveDots",
  "bWaveThick",
  "bModWaveAlphaByVolume",
  "fWaveAlpha",
  "fWaveScale",
  "fWarpScale",
  "fWarpAnimSpeed",
  "warp",
  "zoom",
  "fDecay",
  "fVideoEchoZoom",
  "fVideoEchoAlpha",
  "nMotionVectorsX",
  "nMotionVectorsY",
  "shapecount",
]);

const parseParams = (text) => {
  const params = {};
  const counts = {
    perFrame: 0,
    perPixel: 0,
    shape: 0,
    waveLine: 0,
  };

  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("//") || trimmed.startsWith(";")) continue;

    if (/^per_frame_\d+/i.test(trimmed)) counts.perFrame += 1;
    if (/^per_pixel_\d+/i.test(trimmed)) counts.perPixel += 1;
    if (/^shape\d+/i.test(trimmed)) counts.shape += 1;
    if (/^wave_/i.test(trimmed)) counts.waveLine += 1;

    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*([-+0-9.eE]+)/);
    if (!match) continue;
    const key = match[1];
    if (!PARAM_KEYS.has(key)) continue;
    const value = Number(match[2]);
    if (!Number.isFinite(value)) continue;
    if (!(key in params)) params[key] = value;
  }

  return { params, counts, lineCount: lines.length };
};

const inferTags = ({ params, counts, quality }) => {
  const tags = new Set();

  const waveMode = params.nWaveMode;
  const waveScale = params.fWaveScale;
  if (
    (Number.isFinite(waveMode) && waveMode > 0) ||
    (Number.isFinite(waveScale) && waveScale > 0.08) ||
    counts.waveLine > 0
  ) {
    tags.add("wave");
  }

  if (params.bWaveDots === 1) tags.add("dots");

  if (
    params.bWaveThick === 1 &&
    !tags.has("dots") &&
    (Number.isFinite(waveScale) ? waveScale : 0) > 0.08
  ) {
    tags.add("line");
  }

  const warpScale = params.fWarpScale;
  const warpSpeed = params.fWarpAnimSpeed;
  const warp = params.warp;
  if (
    (Number.isFinite(warpScale) && warpScale >= 1.3) ||
    (Number.isFinite(warpSpeed) && warpSpeed >= 1.2) ||
    (Number.isFinite(warp) && warp >= 0.08)
  ) {
    tags.add("liquid");
  }

  if (counts.perPixel > 0 || counts.perFrame >= 24) {
    tags.add("abstract");
  }

  if (counts.shape > 0 || (params.shapecount ?? 0) > 0) {
    tags.add("geometric");
  }

  if (
    (params.nMotionVectorsX ?? 0) > 0 ||
    (params.nMotionVectorsY ?? 0) > 0
  ) {
    tags.add("vectors");
  }

  if (quality?.avgLuma != null && Number.isFinite(quality.avgLuma)) {
    if (quality.avgLuma <= minAvgLuma) tags.add("dark");
    if (quality.avgLuma >= maxAvgLuma) tags.add("bright");
  }

  if (
    quality?.avgFrameDelta != null &&
    Number.isFinite(quality.avgFrameDelta)
  ) {
    if (quality.avgFrameDelta < minAvgFrameDelta) tags.add("low-motion");
  }

  return tags;
};

const pickPrimaryCategory = (tags) => {
  const order = [
    "liquid",
    "line",
    "wave",
    "abstract",
    "geometric",
    "dots",
    "vectors",
  ];
  for (const tag of order) {
    if (tags.has(tag)) return tag;
  }
  return "other";
};

let lastKnownProbeContext = null;
let lastKnownStatusTimer = null;

const writeUtf8FileChunked = async (filePath, content) => {
  const encoder = new TextEncoder();
  const chunkChars = 256 * 1024;
  const fh = await fs.open(filePath, "w");
  try {
    for (let i = 0; i < content.length; ) {
      let end = Math.min(content.length, i + chunkChars);
      // Avoid splitting surrogate pairs.
      if (end < content.length) {
        const c = content.charCodeAt(end - 1);
        if (c >= 0xd800 && c <= 0xdbff) end -= 1;
      }
      const buf = encoder.encode(content.slice(i, end));
      await fh.write(buf, 0, buf.length);
      i = end;
    }
    await fh.sync().catch(() => {});
  } finally {
    await fh.close().catch(() => {});
  }
};

const atomicWriteTextWithRetries = async (filePath, content, label) => {
  const dir = path.dirname(filePath);
  try {
    await ensureDir(dir);
  } catch (e) {
    console.warn(
      `[preset-audit] WARN: ${label} ensureDir failed for ${dir}: ${String(
        e?.message ?? e
      )}`
    );
    return { ok: false, error: e };
  }

  const tmp = `${filePath}.tmp`;
  const backup = `${filePath}.bak`;

  const tryRename = async (from, to) => {
    try {
      await fs.rename(from, to);
      return true;
    } catch {
      return false;
    }
  };

  const safeReplace = async () => {
    // Write temp file first.
    await writeUtf8FileChunked(tmp, content);

    // Best-effort: move existing to backup to avoid partial overwrite.
    try {
      if (
        await fs
          .stat(filePath)
          .then(() => true)
          .catch(() => false)
      ) {
        await fs.rm(backup, { force: true }).catch(() => {});
        await tryRename(filePath, backup);
      }
    } catch {
      // ignore
    }

    // Replace.
    if (await tryRename(tmp, filePath)) {
      await fs.rm(backup, { force: true }).catch(() => {});
      return;
    }

    // Windows can fail rename if target is in use; fallback to copy+unlink.
    await fs.copyFile(tmp, filePath);
    await fs.rm(tmp, { force: true }).catch(() => {});
    await fs.rm(backup, { force: true }).catch(() => {});
  };

  // Retry on transient Windows/AV file system issues.
  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(10_000, 250 * 2 ** (attempt - 1));
        await sleep(delay);
      }
      await safeReplace();
      return { ok: true };
    } catch (e) {
      lastErr = e;
    }
  }

  // Last resort: write a timestamped checkpoint so progress isn't lost.
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const alt = `${filePath}.${ts}.partial.json`;
    await writeUtf8FileChunked(alt, content);
    console.warn(
      `[preset-audit] WARN: ${label} write failed; wrote fallback: ${alt}`
    );
    return { ok: false, fallbackPath: alt, error: lastErr };
  } catch {
    // ignore
  }

  console.warn(
    `[preset-audit] WARN: ${label} write failed (no fallback): ${String(
      lastErr?.message ?? lastErr
    )}`
  );
  return { ok: false, error: lastErr ?? new Error(`${label} write failed`) };
};

const writeReport = async (payload) => {
  try {
    await ensureDir(outDir);
    const content = JSON.stringify(payload, null, 2) + "\n";
    return await atomicWriteTextWithRetries(reportPath, content, "report");
  } catch (e) {
    console.warn(
      `[preset-audit] WARN: report write failed (non-fatal): ${String(
        e?.message ?? e
      )}`
    );
    return { ok: false, error: e };
  }
};

const closeProbeContext = async (probeContext) => {
  if (!probeContext) return;
  const page = probeContext.page;
  const context = probeContext.context;
  const browser = probeContext.browser;

  const safeClose = async (label, fn) => {
    try {
      await Promise.race([
        fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${label} close timeout`)), 10_000)
        ),
      ]);
    } catch {
      // ignore
    }
  };

  // Close in leaf->root order.
  if (page) await safeClose("page", () => page.close?.({ runBeforeUnload: false }));
  if (context) await safeClose("context", () => context.close?.());
  if (browser) {
    await safeClose("browser", () => browser.close?.());
    // Last resort: if Chromium is wedged, force-kill its process so we don't leak
    // dozens of orphaned instances during long runs.
    try {
      const proc = typeof browser.process === "function" ? browser.process() : null;
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
};

const createProbeContext = async () => {
  const { chromium } = await import("playwright");
  let browser = null;
  let context = null;
  let page = null;
  try {
    const hwAccelArgs = [
      // Prefer ANGLE+D3D11 on Windows for stable GPU acceleration.
      "--use-gl=angle",
      "--use-angle=d3d11",
      "--ignore-gpu-blocklist",
      "--enable-gpu-rasterization",
      "--enable-zero-copy",
      "--disable-software-rasterizer",
    ];

    browser = await chromium.launch({
      headless,
      args: [
        ...hwAccelArgs,
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=CalculateNativeWinOcclusion",
      ],
    });
    console.log(
      `[preset-audit] Probe Chromium args: ${[
        ...hwAccelArgs,
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=CalculateNativeWinOcclusion",
      ].join(" ")}`
    );
    context = await browser.newContext({
      viewport: { width: 640, height: 360 },
      deviceScaleFactor: 1,
    });
    page = await context.newPage();
    const resp = await page.goto(devUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    if (!resp || !resp.ok()) {
      throw new Error(
        `Probe page not reachable: ${devUrl} (${resp?.status()} ${resp?.statusText()})`
      );
    }

    const ensureProbeLoaded = async () => {
      await page.evaluate(async () => {
        if (typeof globalThis.__nw_probePresetQuality !== "function") {
          const mod = await import("/src/features/presets/presetQuality.ts");
          globalThis.__nw_probePresetQuality = mod.probePresetQuality;
        }
      });
    };

    await ensureProbeLoaded();

    return {
      browser,
      context,
      page,
      ensureProbeLoaded,
    };
  } catch (error) {
    await closeProbeContext({ browser, context, page });
    throw error;
  }
};

const runQualityProbe = async (page, payload) => {
  return await page.evaluate(async (data) => {
    const probe = globalThis.__nw_probePresetQuality;
    if (typeof probe !== "function") {
      return {
        ok: false,
        reasons: ["probe-unavailable"],
        errorText: "probe function missing",
      };
    }
    return await probe(data);
  }, payload);
};

const runQualityProbeWithRetries = async (probeContext, payload) => {
  const hardTimeoutMs = (() => {
    const base = Number(payload?.timeoutMs);
    const ms = Number.isFinite(base) && base > 0 ? base : 4500;
    // Allow some overhead for cross-thread scheduling / WASM warmup, but keep bounded.
    return Math.max(1000, Math.min(120_000, ms + 2500));
  })();

  let last = null;
  for (let attempt = 0; attempt <= probeRetryTimes; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(probeRetryDelayMs);
        try {
          await probeContext.ensureProbeLoaded?.();
        } catch {
          // ignore
        }
      }

      const quality = await Promise.race([
        runQualityProbe(probeContext.page, payload),
        sleep(hardTimeoutMs).then(() => ({
          ok: false,
          reasons: ["probe-timeout"],
          errorText: `probe-timeout>${hardTimeoutMs}ms`,
        })),
      ]);

      last = quality;

      if (isTransientProbeFailure(quality)) {
        const reasons = Array.isArray(quality?.reasons)
          ? quality.reasons.map(String)
          : [];
        const timedOut = reasons.some((r) => String(r).includes("probe-timeout"));

        // If the page is wedged, a context reset is the safest self-heal.
        if (timedOut) {
          try {
            await closeProbeContext(probeContext);
          } catch {
            // ignore
          }
          try {
            const fresh = await createProbeContext();
            probeContext.browser = fresh.browser;
            probeContext.context = fresh.context;
            probeContext.page = fresh.page;
            probeContext.ensureProbeLoaded = fresh.ensureProbeLoaded;
          } catch (e) {
            // keep the timeout as the last result; the caller's failure budget will handle it
            last = {
              ok: false,
              reasons: ["probe-error"],
              errorText: String(e?.message ?? e),
            };
          }
        }
      }

      if (!isTransientProbeFailure(quality)) return quality;
    } catch (error) {
      last = {
        ok: false,
        reasons: ["probe-error"],
        errorText: String(error?.message ?? error),
      };
    }
  }
  return last ?? { ok: false, reasons: ["probe-error"], errorText: "unknown" };
};

const collectTargets = async () => {
  const picked = [];
  let scanned = 0;

  const manifestTargets = await readManifestTargets();
  if (manifestTargets) {
    const all = manifestTargets.targets;
    if (limit <= 0) {
      return { picked: all, scanned: all.length, manifestSourceRoot: manifestTargets.manifestSourceRoot };
    }
    if (sampleMode === "first" || sampleMode === "head") {
      for (const t of all) {
        picked.push(t);
        scanned += 1;
        if (scanLimit && scanned >= scanLimit) break;
        if (picked.length >= limit) break;
      }
      return { picked, scanned, manifestSourceRoot: manifestTargets.manifestSourceRoot };
    }

    for (const t of all) {
      scanned += 1;
      if (scanLimit && scanned > scanLimit) break;

      if (picked.length < limit) {
        picked.push(t);
        continue;
      }

      const j = Math.floor(rng() * scanned);
      if (j < limit) picked[j] = t;
    }
    return { picked, scanned, manifestSourceRoot: manifestTargets.manifestSourceRoot };
  }

  if (limit <= 0) {
    return { picked: null, scanned: 0 };
  }

  if (sampleMode === "first" || sampleMode === "head") {
    for await (const filePath of walk(sourceDir)) {
      picked.push(filePath);
      scanned += 1;
      if (scanLimit && scanned >= scanLimit) break;
      if (picked.length >= limit) break;
    }
    return { picked, scanned };
  }

  for await (const filePath of walk(sourceDir)) {
    scanned += 1;
    if (scanLimit && scanned > scanLimit) break;

    if (picked.length < limit) {
      picked.push(filePath);
      continue;
    }

    const j = Math.floor(rng() * scanned);
    if (j < limit) picked[j] = filePath;
  }
  return { picked, scanned };
};

async function main() {
  if (argMap.has("help") || argMap.has("h")) {
    console.log("Preset audit helper");
    console.log(
      "Usage: node scripts/preset-audit.mjs [--source PATH] [--manifest PATH] [--limit N]"
    );
    console.log("Options:");
    console.log("  --source PATH           Preset root directory");
    console.log("  --manifest PATH         Audit exactly the presets listed in a library-manifest.json");
    console.log("  --out PATH              Output directory (default artifacts/presets/audit)");
    console.log("  --limit N               Limit presets (0 = all)");
    console.log("  --sample first|reservoir");
    console.log("  --scanLimit N           Stop scanning after N files");
    console.log("  --resume true|false      Resume from existing report");
    console.log("  --checkpointEvery N      Save report every N entries");
    console.log("  --probe true|false       Run quality probe in Playwright");
    console.log("  --probeMissing true|false Probe when quality is missing (resume mode)");
    console.log("  --probeFailMode abort|continue|skip  Failure policy for probe infra errors");
    console.log("  --probeRetryTimes N      Retries per preset (transient failures)");
    console.log("  --probeRetryDelayMs N    Delay between retries (ms)");
    console.log("  --probeRefreshEvery N    Refresh browser context every N probes");
    console.log("  --maxProbeFailures N     Abort/disable after N consecutive infra failures");
    console.log("  --statusEverySec N       Heartbeat interval (seconds)");
    console.log("  --logEvery N             Progress log interval (entries)");
    console.log("  --probeWidth N           Probe canvas width");
    console.log("  --probeHeight N          Probe canvas height");
    console.log("  --warmupFrames N         Warmup frames before sampling");
    console.log("  --sampleFrames N         Sample frames collected for metrics");
    console.log("  --probeTimeoutMs N       Timeout per probe (ms)");
    console.log("  --minAvgLuma N           Too-dark threshold (default 0.06)");
    console.log("  --maxAvgLuma N           Too-bright threshold (default 0.96)");
    console.log("  --minAvgFrameDelta N     Low-motion threshold");
    console.log("  --maxAvgRenderMs N       Slow render avg threshold (ms)");
    console.log("  --maxP95RenderMs N       Slow render p95 threshold (ms)");
    console.log("  --devUrl URL             Probe page URL (default preset-probe.html)");
    console.log("  --headless true|false    Playwright headless mode (default true)");
    console.log("  --readTimeoutMs N        File read timeout (ms, default 30000)");
    console.log("  --repair true|false      Write sanitized presets");
    console.log("  --repairOut PATH         Output root for sanitized presets");
    console.log("  --stopAfter N            Stop after N processed entries");
    console.log("  --stopAfterSec N         Stop after N seconds elapsed");
    process.exitCode = 0;
    return;
  }

  await ensureDir(outDir);

  const { entries: existingEntries, seen, meta } = await readExistingReport();
  const entries = [...existingEntries];
  const entryIndexByRelPath = new Map();
  for (let i = 0; i < entries.length; i++) {
    const rel = String(entries[i]?.relPath ?? "");
    if (rel) entryIndexByRelPath.set(rel, i);
  }

  const reportMeta = {
    version: "v0",
    generatedAt:
      typeof meta?.generatedAt === "string" && meta.generatedAt
        ? meta.generatedAt
        : new Date().toISOString(),
    sourceRoot: sourceDir,
    manifestPath: manifestPath || undefined,
    sampleMode,
    seed,
    limit: limit || undefined,
    scanLimit: scanLimit || undefined,
  };

  let probeContext = null;
  let probeSuspendedUntilMs = 0;
  let probeSuspendedReason = null;
  let lastProbeInitAttemptAtMs = 0;

  const suspendProbe = async (reason) => {
    probeSuspendedUntilMs = Date.now() + probeSuspendMs;
    probeSuspendedReason = String(reason ?? "probe-suspended").slice(0, 200);
    try {
      await closeProbeContext(probeContext);
    } catch {
      // ignore
    }
    probeContext = null;
    lastKnownProbeContext = null;
    console.warn(
      `[preset-audit] WARN: probe suspended for ${Math.round(
        probeSuspendMs / 1000
      )}s: ${probeSuspendedReason}`
    );
  };

  const ensureProbeContext = async () => {
    if (!probeEnabled) return null;
    if (probeContext) return probeContext;
    const now = Date.now();
    if (now < probeSuspendedUntilMs) return null;
    // Avoid tight loops when the dev server is down.
    if (now - lastProbeInitAttemptAtMs < 1000) return null;
    lastProbeInitAttemptAtMs = now;
    try {
      const fresh = await createProbeContext();
      probeContext = fresh;
      lastKnownProbeContext = fresh;
      probeSuspendedReason = null;
      console.log(`[preset-audit] Probe ready`);
      return probeContext;
    } catch (error) {
      const msg = String(error?.message ?? error);
      if (probeFailMode === "abort") throw error;
      await suspendProbe(msg);
      return null;
    }
  };

  if (probeEnabled) {
    console.log(`[preset-audit] Probe page: ${devUrl}`);
    console.log(`[preset-audit] Launching Playwright (headless=${headless})`);
    await ensureProbeContext();
  }

  const probeOptions = {
    width: Number.isFinite(probeWidth) ? probeWidth : 256,
    height: Number.isFinite(probeHeight) ? probeHeight : 144,
    warmupFrames: Number.isFinite(warmupFrames) ? warmupFrames : 8,
    sampleFrames: Number.isFinite(sampleFrames) ? sampleFrames : 24,
    timeoutMs: Number.isFinite(probeTimeoutMs) ? probeTimeoutMs : 4500,
    minAvgLuma: Number.isFinite(minAvgLuma) ? minAvgLuma : 0.06,
    maxAvgLuma: Number.isFinite(maxAvgLuma) ? maxAvgLuma : 0.96,
    minAvgFrameDelta: Number.isFinite(minAvgFrameDelta)
      ? minAvgFrameDelta
      : 0.002,
    maxAvgRenderMs: Number.isFinite(maxAvgRenderMs) ? maxAvgRenderMs : undefined,
    maxP95RenderMs: Number.isFinite(maxP95RenderMs) ? maxP95RenderMs : undefined,
    statsKey: "audit",
  };

  const { picked, manifestSourceRoot } = await collectTargets();
  const effectiveSourceRoot = manifestSourceRoot || sourceDir;
  const iterator = picked != null ? picked.values() : walk(sourceDir);

  let processed = 0;
  let skipped = 0;

  let probed = 0;
  let probedOk = 0;
  let probedBad = 0;

  let consecutiveProbeFailures = 0;
  let probesSinceRefresh = 0;
  let lastProbeError = null;
  const startedAt = Date.now();

  let reportWriteBackoffUntilMs = 0;
  let reportWriteFailures = 0;

  const totalTargets = picked != null ? picked.length : null;
  const statusTimer = setInterval(() => {
    try {
      const elapsedSec = Math.max(1, (Date.now() - startedAt) / 1000);
      const rate = processed / elapsedSec;
      const etaSec = totalTargets != null && rate > 0 ? (totalTargets - processed) / rate : null;
      const etaText = etaSec != null ? ` eta=${Math.round(etaSec)}s` : "";
      const lastErr = lastProbeError ? ` lastProbeErr=${String(lastProbeError).slice(0, 120)}` : "";

      const now = Date.now();
      const probeState = !probeEnabled
        ? "disabled"
        : probeContext
          ? "ready"
          : now < probeSuspendedUntilMs
            ? "suspended"
            : "init";
      const probeStateText = probeEnabled ? ` probe=${probeState}` : "";

      console.log(
        `[preset-audit] Status: processed=${processed} skipped=${skipped} probed=${probed} ok=${probedOk} bad=${probedBad} rate=${rate.toFixed(2)}/s${etaText}${probeStateText}${lastErr}`
      );
    } catch {
      // ignore
    }
  }, statusEverySec * 1000);
  statusTimer.unref?.();
  lastKnownStatusTimer = statusTimer;

  for await (const item of iterator) {
    if (stopAfter && processed >= stopAfter) {
      console.log(
        `[preset-audit] stopAfter reached: processed=${processed} >= ${stopAfter}`
      );
      break;
    }
    if (stopAfterSec) {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      if (elapsedSec >= stopAfterSec) {
        console.log(
          `[preset-audit] stopAfterSec reached: elapsed=${Math.floor(
            elapsedSec
          )}s >= ${stopAfterSec}s`
        );
        break;
      }
    }

    const filePath = typeof item === "string" ? item : item?.fullPath;
    const relPath =
      typeof item === "string"
        ? normalizeRel(effectiveSourceRoot, filePath)
        : String(item?.relPath ?? "");
    if (seen.has(relPath)) {
      // Resume mode: optionally fill missing probe data.
      if (probeEnabled && probeMissing) {
        const idx = entryIndexByRelPath.get(relPath);
        const existing = idx != null ? entries[idx] : null;
        const hasQuality = Boolean(existing?.quality);
        const shouldReprobe =
          !hasQuality || (hasQuality && isTransientProbeFailure(existing.quality));

        const warnings = Array.isArray(existing?.warnings)
          ? existing.warnings.map(String)
          : [];
        const fatal = warnings.includes("binary-nul") || warnings.includes("read-failed");

        if (!shouldReprobe || fatal) {
          skipped += 1;
          continue;
        }
        // fallthrough to process (will overwrite entry)
      } else {
        skipped += 1;
        continue;
      }
    }

    const sanitized = await sanitizePreset(filePath);
    const { params, counts, lineCount } = parseParams(sanitized.text);
    let quality = null;

    if (probeEnabled && !sanitized.fatal) {
      const now = Date.now();
      if (now < probeSuspendedUntilMs) {
        // Dev server / probe infra is temporarily down; keep scanning but leave quality missing.
        lastProbeError = probeSuspendedReason ?? "probe-suspended";
      } else {
      const doProbe = async () => {
        const payload = {
          url: relPath,
          presetData: sanitized.text,
          ...probeOptions,
        };
        const ctx = await ensureProbeContext();
        if (!ctx) return null;
        return await runQualityProbeWithRetries(ctx, payload);
      };

      try {
        // Periodic refresh to self-heal long runs.
        if (probeRefreshEvery && probesSinceRefresh >= probeRefreshEvery) {
          await closeProbeContext(probeContext);
          probeContext = null;
          lastKnownProbeContext = null;
          await ensureProbeContext();
          console.log(`[preset-audit] Probe refreshed`);
          probesSinceRefresh = 0;
          consecutiveProbeFailures = 0;
        }

        quality = await doProbe();

        // If we couldn't probe (e.g. suspended or init failed), keep quality missing.
        if (!quality) {
          // no-op
        } else if (isInfraProbeFailure(quality) && isDevServerDownError(quality?.errorText)) {
          // Treat dev server outages as infra issues: suspend probing and keep quality missing
          // so a later `--probeMissing true` run can fill it.
          await suspendProbe(quality?.errorText);
          quality = null;
        } else {
          probed += 1;
          probesSinceRefresh += 1;
        }

        if (quality?.ok) {
          probedOk += 1;
          consecutiveProbeFailures = 0;
          lastProbeError = null;
        } else {
          if (quality) probedBad += 1;
          const timedOut = isProbeTimeoutFailure(quality);
          const infraFail = isInfraProbeFailure(quality);

          // Count only "probe infrastructure" failures towards the consecutive failure budget.
          // (Timeouts are usually preset-specific; we still record them but don't abort the run.)
          if (infraFail) {
            consecutiveProbeFailures += 1;
            lastProbeError = quality?.errorText ?? (quality?.reasons ?? []).join(",");
          } else {
            consecutiveProbeFailures = 0;
            lastProbeError = timedOut
              ? quality?.errorText ?? (quality?.reasons ?? []).join(",")
              : null;
          }
        }

        if (consecutiveProbeFailures >= maxConsecutiveProbeFailures) {
          const msg = `Too many consecutive probe failures (${consecutiveProbeFailures}).`;
          if (probeFailMode === "continue") {
            console.warn(`[preset-audit] ${msg} Disabling probe and continuing.`);
            probeEnabled = false;
            await closeProbeContext(probeContext);
            probeContext = null;
            lastKnownProbeContext = null;
            lastProbeError = "probe-disabled";
          } else if (probeFailMode === "skip") {
            console.warn(`[preset-audit] ${msg} Skipping further probes for now.`);
            consecutiveProbeFailures = 0;
          } else {
            throw new Error(`${msg} probeFailMode=${probeFailMode}`);
          }
        }
      } catch (error) {
        const message = String(error?.message ?? error);
        if (isDevServerDownError(message)) {
          await suspendProbe(message);
          quality = null;
        } else {
        quality = {
          ok: false,
          reasons: ["probe-error"],
          errorText: message,
        };
        probed += 1;
        probedBad += 1;
        consecutiveProbeFailures += 1;
        lastProbeError = message;
        }
      }
      }
    }

    const tags = inferTags({ params, counts, quality });
    const primaryCategory = pickPrimaryCategory(tags);

    if (repairEnabled && sanitized.text) {
      const outPath = path.join(repairOutDir, relPath);
      await ensureDir(path.dirname(outPath));
      await fs.writeFile(outPath, sanitized.text, "utf8");
    }

    const nextEntry = {
      relPath,
      fileName: path.basename(filePath),
      pack: extractPack(relPath),
      fileSize: sanitized.fileSize,
      decodedAs: sanitized.decoded,
      warnings: sanitized.warnings,
      fixes: sanitized.fixes,
      lineCount,
      counts,
      params,
      tags: Array.from(tags),
      primaryCategory,
      quality,
      probedAt: quality ? new Date().toISOString() : null,
      repairWritten: repairEnabled,
    };

    const existingIdx = entryIndexByRelPath.get(relPath);
    if (existingIdx != null) {
      entries[existingIdx] = nextEntry;
    } else {
      entryIndexByRelPath.set(relPath, entries.length);
      entries.push(nextEntry);
    }

    seen.add(relPath);
    processed += 1;

    if (processed % checkpointEvery === 0) {
      const now = Date.now();
      if (now >= reportWriteBackoffUntilMs) {
        const res = await writeReport({
          ...reportMeta,
          entries,
          updatedAt: new Date().toISOString(),
        });
        if (!res.ok) {
          reportWriteFailures += 1;
          reportWriteBackoffUntilMs =
            now + Math.min(10 * 60_000, 30_000 * reportWriteFailures);
        } else {
          reportWriteFailures = 0;
          reportWriteBackoffUntilMs = 0;
        }
      }
      if (processed % logEvery === 0) {
        console.log(
          `[preset-audit] Progress: ${processed} processed (${skipped} skipped) probed=${probed} ok=${probedOk} bad=${probedBad}`
        );
      }
    }
  }

  clearInterval(statusTimer);
  lastKnownStatusTimer = null;
  await closeProbeContext(probeContext);
  lastKnownProbeContext = null;

  const tagCounts = {};
  const categoryCounts = {};
  const reasonCounts = {};
  let totalProbed = 0;
  let totalOk = 0;
  let totalBad = 0;

  const badRelPaths = [];
  const badReasonsByRelPath = {};

  for (const entry of entries) {
    for (const tag of entry.tags ?? []) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
    const cat = entry.primaryCategory ?? "other";
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;

    if (entry.quality) {
      totalProbed += 1;
      if (entry.quality.ok) {
        totalOk += 1;
      } else {
        totalBad += 1;
        if (entry.relPath) {
          badRelPaths.push(entry.relPath);
          badReasonsByRelPath[entry.relPath] = entry.quality.reasons ?? [];
        }
        for (const reason of entry.quality.reasons ?? []) {
          reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
        }
      }
    }
  }

  const summary = {
    version: "v0",
    generatedAt: new Date().toISOString(),
    sourceRoot: sourceDir,
    totals: {
      scanned: entries.length,
      probed: totalProbed,
      ok: totalOk,
      bad: totalBad,
    },
    tags: tagCounts,
    categories: categoryCounts,
    reasons: reasonCounts,
  };

  const blacklist = {
    version: "v0",
    generatedAt: new Date().toISOString(),
    sourceRoot: sourceDir,
    badSourceRelPaths: badRelPaths,
    badReasonsByRelPath,
  };

  await writeReport({ ...reportMeta, entries, updatedAt: new Date().toISOString() });
  await atomicWriteTextWithRetries(
    summaryPath,
    JSON.stringify(summary, null, 2) + "\n",
    "summary"
  );
  await atomicWriteTextWithRetries(
    blacklistPath,
    JSON.stringify(blacklist, null, 2) + "\n",
    "blacklist"
  );

  console.log(`[preset-audit] Report: ${reportPath}`);
  console.log(`[preset-audit] Summary: ${summaryPath}`);
  console.log(`[preset-audit] Blacklist: ${blacklistPath}`);
}

main().catch(async (error) => {
  console.error("[preset-audit] Failed:", error);
  try {
    if (lastKnownStatusTimer) {
      clearInterval(lastKnownStatusTimer);
      lastKnownStatusTimer = null;
    }
    if (lastKnownProbeContext) {
      await closeProbeContext(lastKnownProbeContext);
      lastKnownProbeContext = null;
    }
  } catch {
    // ignore
  }
  try {
    process.exitCode = 1;
  } finally {
    process.exit(1);
  }
});
