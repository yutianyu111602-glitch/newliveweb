import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const BASE_URL = process.env.BASELINE_URL ?? process.env.VERIFY_URL ?? "http://127.0.0.1:5174/";
const OUT_ROOT =
  process.env.BASELINE_OUT_DIR ??
  process.env.VERIFY_OUT_DIR ??
  path.resolve("artifacts", "baseline-a0");

const CAPTURE_MODE = String(process.env.BASELINE_CAPTURE_MODE ?? "direct").trim();
const DURATION_SEC = Math.max(5, Number(process.env.BASELINE_DURATION_SEC ?? 60) || 60);
const WARMUP_SEC = Math.max(0, Number(process.env.BASELINE_WARMUP_SEC ?? 6) || 6);
const SAMPLE_INTERVAL_MS = Math.max(250, Number(process.env.BASELINE_SAMPLE_INTERVAL_MS ?? 1000) || 1000);

const OVERRIDE_RUN_ID = String(process.env.BASELINE_RUN_ID ?? "").trim();
const SCENARIO_FILTER_RAW = String(process.env.BASELINE_SCENARIOS ?? "").trim();
const SKIP_EXISTING = String(process.env.BASELINE_SKIP_EXISTING ?? "").trim() === "1";

const VIDEO_SRC = String(process.env.BASELINE_VIDEO_SRC ?? "").trim();
const DEPTH_S5_SOURCE = String(process.env.BASELINE_S5_DEPTH_SOURCE ?? "ws").trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function isoId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function parseScenarioFilter(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const parts = s
    .split(/[\s,;]+/g)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  return new Set(parts);
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function summarizeSamples(samples) {
  const xs = samples.filter((n) => Number.isFinite(n) && n > 0).slice();
  xs.sort((a, b) => a - b);
  if (xs.length === 0) {
    return { count: 0, min: 0, max: 0, p50: 0, p95: 0, mean: 0 };
  }
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const pick = (p) => xs[Math.min(xs.length - 1, Math.floor(p * (xs.length - 1)))];
  return {
    count: xs.length,
    min: xs[0],
    max: xs[xs.length - 1],
    p50: pick(0.5),
    p95: pick(0.95),
    mean,
  };
}

async function setChecked(page, selector, checked) {
  const loc = page.locator(selector);
  await loc.waitFor({ state: "attached", timeout: 15_000 });
  await loc.setChecked(Boolean(checked));
}

async function setSelect(page, selector, value) {
  const loc = page.locator(selector);
  await loc.waitFor({ state: "attached", timeout: 15_000 });
  await loc.selectOption(String(value));
}

async function click(page, selector) {
  const loc = page.locator(selector);
  await loc.waitFor({ state: "attached", timeout: 15_000 });
  await loc.click();
}

async function fill(page, selector, text) {
  const loc = page.locator(selector);
  await loc.waitFor({ state: "attached", timeout: 15_000 });
  await loc.fill(String(text));
}

async function callVerify(page, fnName, ...args) {
  return page.evaluate(
    ({ fnName, args }) => {
      const root = globalThis.__nw_verify;
      if (!root) throw new Error("__nw_verify missing");
      const fn = root[fnName];
      if (typeof fn !== "function") throw new Error(`__nw_verify.${fnName} missing`);
      return fn(...args);
    },
    { fnName, args }
  );
}

async function getPerfCaps(page) {
  return callVerify(page, "getPerfCaps");
}

async function sampleFrameTimeP95(page) {
  const v = await callVerify(page, "getFrameTimeP95Ms");
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function configureScenario(page, scenario) {
  // Hide topology overlay to avoid blocking UI controls.
  try {
    await callVerify(page, "hideTopologyOverlay");
  } catch (e) {
    console.warn("[baseline] failed to hide topology overlay:", e.message);
  }

  // compositor + PM-BG toggles are not in toolbar; use verify hooks.
  await callVerify(page, "setBaselineCompositorEnabled", Boolean(scenario.compositorEnabled));
  await callVerify(page, "setBaselineProjectmBgEnabled", Boolean(scenario.pmBgEnabled));

  // Background layers
  await setChecked(page, "#layer-liquid-enabled", Boolean(scenario.liquid));
  await setChecked(page, "#layer-basic-enabled", Boolean(scenario.basic));
  await setChecked(page, "#layer-camera-enabled", Boolean(scenario.camera));
  await setChecked(page, "#layer-video-enabled", Boolean(scenario.video));
  await setChecked(page, "#layer-depth-enabled", Boolean(scenario.depth));

  // Depth
  if (scenario.depth) {
    await setSelect(page, "#depth-source", scenario.depthSource);
  }

  // Camera
  if (scenario.camera) {
    await setChecked(page, "#camera-seg-toggle", Boolean(scenario.cameraSegmentation));
  }

  // Video
  if (scenario.video) {
    if (!VIDEO_SRC) {
      throw new Error(
        "S7 requires BASELINE_VIDEO_SRC (e.g. https://.../video.mp4 or /assets/foo.webm)"
      );
    }
    await fill(page, "#video-src", VIDEO_SRC);
    await click(page, "#video-src-apply");
    // Let the player attempt to load.
    await sleep(800);
  }
}

async function downloadSnapshot(page, outDir, label) {
  const safe = String(label).replace(/[^a-zA-Z0-9_-]+/g, "-");

  // Show debug section to make #snapshot-export visible.
  await page.evaluate(() => {
    const toolbarBody = document.querySelector('.toolbar__body');
    if (toolbarBody) {
      toolbarBody.setAttribute('data-show-debug', '1');
    }
  });
  await sleep(300);

  // Ensure button is visible and ready.
  await page.waitForSelector("#snapshot-export", { state: "visible", timeout: 10_000 });
  await sleep(500);

  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await click(page, "#snapshot-export");
  console.log(`[baseline] ${label}: triggered snapshot download, waiting...`);

  const dl = await downloadPromise;
  const suggested = dl.suggestedFilename();
  const fileName = suggested && suggested.endsWith(".json") ? suggested : `${safe}-snapshot.json`;
  const targetPath = path.join(outDir, fileName);
  await dl.saveAs(targetPath);
  console.log(`[baseline] ${label}: saved ${fileName}`);
  return { fileName, targetPath };
}

function scenarioList() {
  return [
    {
      id: "S1",
      title: "Liquid + 单 PM（最轻）",
      compositorEnabled: false,
      pmBgEnabled: false,
      liquid: true,
      basic: false,
      camera: false,
      video: false,
      depth: false,
    },
    {
      id: "S2",
      title: "S1 + compositor on",
      compositorEnabled: true,
      pmBgEnabled: false,
      liquid: true,
      basic: false,
      camera: false,
      video: false,
      depth: false,
    },
    {
      id: "S3",
      title: "双 PM（目标形态）",
      compositorEnabled: true,
      pmBgEnabled: true,
      liquid: true,
      basic: false,
      camera: false,
      video: false,
      depth: false,
    },
    {
      id: "S4",
      title: "S3 + Depth（webcam）",
      compositorEnabled: true,
      pmBgEnabled: true,
      liquid: true,
      basic: false,
      camera: false,
      video: false,
      depth: true,
      depthSource: "webcam",
    },
    {
      id: "S5",
      title: "S3 + Depth（ws/idepth）",
      compositorEnabled: true,
      pmBgEnabled: true,
      liquid: true,
      basic: false,
      camera: false,
      video: false,
      depth: true,
      depthSource: DEPTH_S5_SOURCE === "idepth" ? "idepth" : "ws",
    },
    {
      id: "S6",
      title: "S3 + Camera 分割",
      compositorEnabled: true,
      pmBgEnabled: true,
      liquid: true,
      basic: false,
      camera: true,
      cameraSegmentation: true,
      video: false,
      depth: false,
    },
    {
      id: "S7",
      title: "S3 + Video 背景",
      compositorEnabled: true,
      pmBgEnabled: true,
      liquid: true,
      basic: false,
      camera: false,
      video: true,
      depth: false,
    },
  ];
}

function formatMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "--";
  return n >= 10 ? n.toFixed(1) : n.toFixed(2);
}

function fpsFromMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return 1000 / n;
}

async function main() {
  const runId = OVERRIDE_RUN_ID || `${isoId()}-${CAPTURE_MODE}`;
  const outDir = path.join(OUT_ROOT, runId);
  await ensureDir(outDir);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
    deviceScaleFactor: 1.5,
  });
  const page = await context.newPage();

  const consoleLines = [];
  page.on("console", (msg) => {
    const line = `[${msg.type()}] ${msg.text()}`;
    consoleLines.push(line);
  });

  const startedAtIso = new Date().toISOString();

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("#toolbar", { timeout: 60_000 });
  await page.waitForTimeout(1200);

  // Ensure audio controls don’t perturb perf unless you explicitly want them.
  // Baseline is still meaningful either way, but this keeps runs more comparable.
  try {
    await setChecked(page, "#audio-controls-toggle", false);
  } catch {
    // ignore if not present
  }

  const filter = parseScenarioFilter(SCENARIO_FILTER_RAW);
  const scenarios = scenarioList().filter((s) => {
    if (!filter) return true;
    return filter.has(String(s.id).toUpperCase());
  });
  const results = [];

  if (filter && scenarios.length === 0) {
    throw new Error(
      `No scenarios matched BASELINE_SCENARIOS="${SCENARIO_FILTER_RAW}". Valid ids: ${scenarioList()
        .map((x) => x.id)
        .join(", ")}`
    );
  }

  for (const s of scenarios) {
    const sceneDir = path.join(outDir, s.id);
    await ensureDir(sceneDir);

    if (SKIP_EXISTING) {
      try {
        const existing = await fs.readdir(sceneDir);
        if (existing.some((n) => String(n).toLowerCase().endsWith(".json"))) {
          console.log(`[baseline] ${s.id}: skipping (existing .json found)`);
          continue;
        }
      } catch {
        // ignore
      }
    }

    console.log(`[baseline] ${s.id}: configuring...`);
    await configureScenario(page, s);
    await page.waitForTimeout(WARMUP_SEC * 1000);

    console.log(`[baseline] ${s.id}: sampling for ${DURATION_SEC}s...`);
    const samples = [];
    const tEnd = Date.now() + DURATION_SEC * 1000;
    while (Date.now() < tEnd) {
      samples.push(await sampleFrameTimeP95(page));
      await sleep(SAMPLE_INTERVAL_MS);
    }

    const perfCaps = await getPerfCaps(page);

    console.log(`[baseline] ${s.id}: snapshot export...`);
    const snapshot = await downloadSnapshot(page, sceneDir, s.id);

    const summary = summarizeSamples(samples);
    const ftP95Ms = summary.p95;
    const fpsP95 = fpsFromMs(ftP95Ms);

    results.push({
      id: s.id,
      title: s.title,
      captureMode: CAPTURE_MODE,
      url: BASE_URL,
      durationSec: DURATION_SEC,
      warmupSec: WARMUP_SEC,
      compositorEnabled: Boolean(s.compositorEnabled),
      pmBgEnabled: Boolean(s.pmBgEnabled),
      layers: {
        liquid: Boolean(s.liquid),
        basic: Boolean(s.basic),
        camera: Boolean(s.camera),
        video: Boolean(s.video),
        depth: Boolean(s.depth),
      },
      depthSource: s.depth ? s.depthSource : null,
      videoSrc: s.video ? VIDEO_SRC : null,
      frameTimeP95SamplesMs: summary,
      frameTimeP95Ms: ftP95Ms,
      fpsFromFrameTimeP95: fpsP95,
      perfCaps,
      snapshot: {
        fileName: snapshot.fileName,
        relativePath: path.relative(outDir, snapshot.targetPath),
      },
    });
  }

  await browser.close();

  const report = {
    version: "nw-baseline-a0-v1",
    startedAtIso,
    finishedAtIso: new Date().toISOString(),
    url: BASE_URL,
    captureMode: CAPTURE_MODE,
    durationSec: DURATION_SEC,
    warmupSec: WARMUP_SEC,
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
    baselineVideoSrc: VIDEO_SRC || null,
    depthS5Source: DEPTH_S5_SOURCE,
    results,
  };

  await fs.writeFile(path.join(outDir, "baseline.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(outDir, "browser-console.log"), consoleLines.join("\n") + "\n", "utf8");

  // Lightweight Markdown summary you can paste into BASELINE_S1_S7_LOG.
  const mdLines = [];
  mdLines.push(`# A0 Baseline run ${runId}`);
  mdLines.push("");
  mdLines.push(`- URL: ${BASE_URL}`);
  mdLines.push(`- captureMode: ${CAPTURE_MODE}`);
  mdLines.push(`- durationSec: ${DURATION_SEC} (warmup ${WARMUP_SEC}s)`);
  if (VIDEO_SRC) mdLines.push(`- videoSrc: ${VIDEO_SRC}`);
  mdLines.push("");
  for (const r of results) {
    mdLines.push(`## ${r.id}: ${r.title}`);
    mdLines.push("");
    mdLines.push(`- compositorEnabled: ${r.compositorEnabled ? "on" : "off"}`);
    mdLines.push(`- pmBgEnabled: ${r.pmBgEnabled ? "on" : "off"}`);
    if (r.depthSource) mdLines.push(`- depthSource: ${r.depthSource}`);
    if (r.videoSrc) mdLines.push(`- videoSrc: ${r.videoSrc}`);
    mdLines.push(
      `- frameTimeP95 (rolling-window samples): p95=${formatMs(r.frameTimeP95Ms)}ms (fps~${Math.round(
        r.fpsFromFrameTimeP95
      )}) mean=${formatMs(r.frameTimeP95SamplesMs.mean)}ms`);
    mdLines.push(`- snapshot: ${r.snapshot.relativePath}`);
    mdLines.push("");
  }
  await fs.writeFile(path.join(outDir, "baseline.md"), mdLines.join("\n"), "utf8");

  console.log(`[baseline] wrote ${path.join(outDir, "baseline.json")}`);
  console.log(`[baseline] wrote ${path.join(outDir, "baseline.md")}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
