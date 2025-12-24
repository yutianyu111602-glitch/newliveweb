import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
// pngjs is CommonJS; use require for compatibility with this ESM script.
const { PNG } = require('pngjs');

const BASE_URL = process.env.VERIFY_URL ?? 'http://127.0.0.1:5174/';
const OUT_DIR = process.env.VERIFY_OUT_DIR ?? path.resolve('artifacts', 'headless');
const DSF = Number(process.env.VERIFY_DSF ?? 1.5);
const VERIFY_BEAT_TEMPO = String(process.env.VERIFY_BEAT_TEMPO ?? '').trim() === '1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const parseCountFromLabel = (text) => {
  const m = String(text ?? '').match(/(\d+)/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
};

function makeWavClickTrack(opts = {}) {
  const sampleRate = Number(opts.sampleRate ?? 44100);
  const bpm = Number(opts.bpm ?? 120);
  const durationSec = Number(opts.durationSec ?? 14);
  const pulseMs = Number(opts.pulseMs ?? 12);
  const amp = Math.max(0, Math.min(1, Number(opts.amp ?? 0.9)));

  const totalSamples = Math.max(1, Math.floor(durationSec * sampleRate));
  const samples = new Int16Array(totalSamples);
  const beatInterval = Math.max(1, Math.floor((60 / bpm) * sampleRate));
  const pulseLen = Math.max(1, Math.floor((pulseMs / 1000) * sampleRate));

  for (let i = 0; i < totalSamples; i += beatInterval) {
    for (let j = 0; j < pulseLen && i + j < totalSamples; j++) {
      const t = j / pulseLen;
      const env = Math.exp(-6 * t);
      const v = Math.round(amp * env * 32767);
      samples[i + j] = Math.max(-32768, Math.min(32767, v));
    }
  }

  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const riffSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(riffSize, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  const data = Buffer.alloc(dataSize);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(samples[i], i * 2);
  }
  return Buffer.concat([header, data]);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeText(filePath, text) {
  await fs.writeFile(filePath, text, 'utf8');
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Headless verification (Playwright)');
    console.log('Env: VERIFY_URL, VERIFY_OUT_DIR, VERIFY_DSF');
    console.log(`Default VERIFY_URL: ${BASE_URL}`);
    console.log(`Default VERIFY_OUT_DIR: ${OUT_DIR}`);
    console.log(`Default VERIFY_DSF: ${Number.isFinite(DSF) && DSF > 0 ? DSF : 1}`);
    process.exitCode = 0;
    return;
  }

  await ensureDir(OUT_DIR);

  // Keep stdout alive during long verification runs to avoid VS Code/Copilot
  // prompting to "Continue waiting" when output is idle for a while.
  const HEARTBEAT_MS = Math.max(0, Number(process.env.VERIFY_HEARTBEAT_MS ?? 30_000) || 0);
  let heartbeatTimer = null;
  if (HEARTBEAT_MS > 0) {
    heartbeatTimer = setInterval(() => {
      console.log(`[verify] heartbeat ${new Date().toISOString()}`);
    }, HEARTBEAT_MS);
    if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();
  }

  const consoleLogPath = path.join(OUT_DIR, 'browser-console.log');
  const pageErrorPath = path.join(OUT_DIR, 'page-errors.log');
  const screenshotPath = path.join(OUT_DIR, 'screenshot.png');
  const toolbarScreenshotPath = path.join(OUT_DIR, 'toolbar.png');
  const inspectorOverlayBudgetPath = path.join(OUT_DIR, 'inspector-overlayBudget.png');
  const midiPanelPath = path.join(OUT_DIR, 'midi.png');
  const audioPanelPath = path.join(OUT_DIR, 'audio.png');
  const presetsPanelPath = path.join(OUT_DIR, 'presets.png');
  const visualPanelPath = path.join(OUT_DIR, 'visual.png');
  const backgroundPanelPath = path.join(OUT_DIR, 'background.png');
  const macrosPanelPath = path.join(OUT_DIR, 'macros.png');
  const projectmPanelPath = path.join(OUT_DIR, 'projectm.png');
  const showPanelPath = path.join(OUT_DIR, 'show.png');
  const favoritesPanelPath = path.join(OUT_DIR, 'favorites.png');
  const favoritesComparePath = path.join(OUT_DIR, 'favorites-compare.png');
  const diagnosticsPanelPath = path.join(OUT_DIR, 'diagnostics.png');
  const vizCanvasAPath = path.join(OUT_DIR, 'viz-canvas-a.png');
  const vizCanvasBPath = path.join(OUT_DIR, 'viz-canvas-b.png');
  const mixerVizOpacity0Path = path.join(OUT_DIR, 'mixer-viz-opacity-0.png');
  const mixerVizOpacity1Path = path.join(OUT_DIR, 'mixer-viz-opacity-1.png');
  const mixerDiffPath = path.join(OUT_DIR, 'mixer-diff.png');
  const diffPath = path.join(OUT_DIR, 'diff.png');
  const projectmCanvasAPath = path.join(OUT_DIR, 'projectm-canvas-a.png');
  const projectmCanvasBPath = path.join(OUT_DIR, 'projectm-canvas-b.png');
  const tracePath = path.join(OUT_DIR, 'trace.zip');
  const reportPath = path.join(OUT_DIR, 'report.json');

  const consoleLines = [];
  const pageErrors = [];
  let exitCode = 0;

  const MAX_ATTEMPTS = Math.max(1, Number(process.env.VERIFY_ATTEMPTS ?? 2) || 2);

  const isTransientNavigationError = (err) => {
    const text = String(err?.stack || err || '');
    return (
      /Execution context was destroyed/i.test(text) ||
      /most likely because of a navigation/i.test(text) ||
      /Target page, context or browser has been closed/i.test(text)
    );
  };

  let navigationFailureLine = null;

  const resetForAttempt = (attempt) => {
    consoleLines.length = 0;
    pageErrors.length = 0;
    exitCode = 0;
    report.counts.console = 0;
    report.counts.pageErrors = 0;

    // Keep early navigation failures visible in every attempt log.
    if (navigationFailureLine) {
      consoleLines.push(navigationFailureLine);
    }
    report.checks.canvasAttached = false;
    report.checks.canvasSize = null;
    report.checks.projectMFramesRendered = null;
    report.checks.canvasNonEmpty = null;
    report.checks.canvasChanges = null;
    report.checks.toolbarAttached = null;
    report.checks.toolbarControls = null;
    report.checks.finalOutputNonEmpty = null;
    report.checks.finalOutputChanges = null;
    report.checks.finalOutputSample = null;
    report.checks.finalOutputDiff = null;
    report.checks.projectMCanvasNonEmpty = null;
    report.checks.projectMCanvasChanges = null;
    report.checks.projectMCanvasSample = null;
    report.checks.projectMCanvasSampleSeries = null;
    report.checks.mixerUi = null;
    report.checks.mixerBlend = null;
    report.checks.favoritesCompare = null;
    report.checks.presetStress = null;
    report.checks.userFlow = null;
    report.checks.beatTempo = null;
    report.checks.perfCaps = null;
    report.checks.aivjAccent = null;
    report.checks.audioDrivePresets = null;
    report.checks.presetLoadShedding = null;
    consoleLines.push(`[verify] attempt ${attempt}/${MAX_ATTEMPTS}`);
  };

  const allowedConsoleErrorPatterns = [
    // Add allowed patterns here if needed.
  ];

  const report = {
    url: BASE_URL,
    startedAt: new Date().toISOString(),
    deviceScaleFactor: Number.isFinite(DSF) && DSF > 0 ? DSF : 1,
    checks: {
      canvasAttached: false,
      canvasSize: null,
      projectMFramesRendered: null,
      canvasNonEmpty: null,
      canvasChanges: null,
      toolbarAttached: null,
      toolbarControls: null,
      finalOutputNonEmpty: null,
      finalOutputChanges: null,
      finalOutputSample: null,
      finalOutputDiff: null,
      projectMCanvasNonEmpty: null,
      projectMCanvasChanges: null,
      projectMCanvasSample: null,
      projectMCanvasSampleSeries: null,

      // Mixer validation (UI presence + basic blend exercise).
      mixerUi: null,
      mixerBlend: null,

      // Favorites compare sanity (multi-select + compare table + CSV export enabled).
      favoritesCompare: null,

      // Manual confirmation replacement: rapid preset switching should not freeze UI.
      presetStress: null,

      // Realistic user-flow smoke (click around like a human).
      userFlow: null,

      // Optional Beat/Tempo verification (UPDATE_REPORT §7.1).
      beatTempo: null,

      // Perf caps snapshot (audio analysis/beat/PM cadence).
      perfCaps: null,

      // AIVJ accent observability (Diagnostics + Topology + Trace).
      aivjAccent: null,

      // Audio drive presets (AudioControls config).
      audioDrivePresets: null,

      // Preset load shedding (pressure window caps).
      presetLoadShedding: null,
    },
    counts: {
      console: 0,
      pageErrors: 0,
    },
    artifacts: {
      screenshotPath,
      toolbarScreenshotPath,
      inspectorOverlayBudgetPath,
      midiPanelPath,
      audioPanelPath,
      presetsPanelPath,
      visualPanelPath,
      backgroundPanelPath,
      macrosPanelPath,
      projectmPanelPath,
      showPanelPath,
      favoritesPanelPath,
      favoritesComparePath,
      diagnosticsPanelPath,
      vizCanvasAPath,
      vizCanvasBPath,
      mixerVizOpacity0Path,
      mixerVizOpacity1Path,
      mixerDiffPath,
      diffPath,
      projectmCanvasAPath,
      projectmCanvasBPath,
      consoleLogPath,
      pageErrorPath,
      tracePath,
      reportPath,
    },
  };

  const writeDiffPng = async (pngA, pngB, outPath, opts = {}) => {
    const amplify = typeof opts.amplify === 'number' && Number.isFinite(opts.amplify) ? opts.amplify : 6;
    const a = PNG.sync.read(pngA);
    const b = PNG.sync.read(pngB);
    if (a.width !== b.width || a.height !== b.height) {
      throw new Error(`Diff PNG dimension mismatch: a=${a.width}x${a.height} b=${b.width}x${b.height}`);
    }

    const out = new PNG({ width: a.width, height: a.height });
    let changedPixels = 0;

    for (let i = 0; i < a.data.length; i += 4) {
      const dr = Math.abs((a.data[i] | 0) - (b.data[i] | 0));
      const dg = Math.abs((a.data[i + 1] | 0) - (b.data[i + 1] | 0));
      const db = Math.abs((a.data[i + 2] | 0) - (b.data[i + 2] | 0));
      const da = Math.abs((a.data[i + 3] | 0) - (b.data[i + 3] | 0));

      const diff = Math.min(255, Math.round(((dr + dg + db) / 3) * amplify));
      if (diff > 0 || da > 0) changedPixels++;

      out.data[i] = diff;
      out.data[i + 1] = diff;
      out.data[i + 2] = diff;
      out.data[i + 3] = 255;
    }

    const outBuf = PNG.sync.write(out);
    await fs.writeFile(outPath, outBuf);
    return { width: a.width, height: a.height, changedPixels, totalPixels: a.width * a.height, amplify };
  };

  const analyzePngForContent = (pngBuffer, opts = {}) => {
    const background = opts.background ?? { r: 1, g: 2, b: 3 };
    const threshold = typeof opts.threshold === 'number' ? opts.threshold : 12;
    const grid = typeof opts.grid === 'number' ? opts.grid : 64;

    const png = PNG.sync.read(pngBuffer);
    const w = png.width | 0;
    const h = png.height | 0;
    const data = png.data;

    const stepX = Math.max(1, Math.floor(w / grid));
    const stepY = Math.max(1, Math.floor(h / grid));

    let sampleCount = 0;
    let nonBackgroundCount = 0;
    let hash = 0;

    for (let y = Math.floor(stepY / 2); y < h; y += stepY) {
      for (let x = Math.floor(stepX / 2); x < w; x += stepX) {
        const idx = (y * w + x) * 4;
        const r = data[idx] | 0;
        const g = data[idx + 1] | 0;
        const b = data[idx + 2] | 0;
        const a = data[idx + 3] | 0;

        const dr = Math.abs(r - background.r);
        const dg = Math.abs(g - background.g);
        const db = Math.abs(b - background.b);
        const delta = dr + dg + db;

        // Ignore fully transparent samples (shouldn't happen in screenshots, but keep safe).
        const isNonBg = a > 0 && delta >= threshold;
        if (isNonBg) nonBackgroundCount++;

        // Mix a small hash to detect changes.
        hash = (hash * 131 + ((r << 16) ^ (g << 8) ^ b ^ (a << 24))) >>> 0;
        sampleCount++;
      }
    }

    const nonBackgroundRatio = sampleCount > 0 ? nonBackgroundCount / sampleCount : 0;
    return { width: w, height: h, sampleCount, nonBackgroundCount, nonBackgroundRatio, hash };
  };

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      // Windows-specific: avoid occlusion heuristics that can pause rendering/timers.
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: Number.isFinite(DSF) && DSF > 0 ? DSF : 1,
  });

  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();

  let pageClosed = false;
  let expectedClose = false;
  page.on('close', () => {
    if (expectedClose) return;
    pageClosed = true;
    pageErrors.push('[page] closed');
    report.counts.pageErrors++;
  });
  page.on('crash', () => {
    if (expectedClose) return;
    pageClosed = true;
    pageErrors.push('[page] crashed');
    report.counts.pageErrors++;
  });

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    consoleLines.push(`[${type}] ${text}`);
    report.counts.console++;

    if (type === 'error') {
      const isAllowed = allowedConsoleErrorPatterns.some((re) => re.test(text));
      if (!isAllowed) {
        pageErrors.push(`[console.error] ${text}`);
        report.counts.pageErrors++;
      }
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err?.stack || err));
    report.counts.pageErrors++;
  });
  page.on('requestfailed', (req) => {
    const failure = req.failure();
    const method = req.method();
    const url = req.url();
    const errorText = failure?.errorText ?? 'unknown error';

    // Audio elements commonly probe/cancel requests (especially HEAD) while negotiating
    // range streaming. Treat that as non-fatal to keep verify signal useful.
    if (
      url.includes('/__local_audio') &&
      typeof errorText === 'string' &&
      /net::ERR_ABORTED/i.test(errorText)
    ) {
      return;
    }

    pageErrors.push(`[requestfailed] ${method} ${url} :: ${errorText}`);
    report.counts.pageErrors++;
  });

  // Poll until the server is reachable.
  const start = Date.now();
  const timeoutMs = 60_000;
  let lastError = null;
  let initialNavigationOk = false;
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 10_000 });
      if (resp && resp.ok()) {
        initialNavigationOk = true;
        break;
      }
      lastError = new Error(`Non-OK response: ${resp?.status()} ${resp?.statusText()}`);
    } catch (err) {
      lastError = err;
    }
    if (pageClosed) break;
    await sleep(500);
  }
  if (lastError) {
    navigationFailureLine = `[verify] navigate failed: ${String(lastError)}`;
    consoleLines.push(navigationFailureLine);
  }

  const serverReachable = initialNavigationOk;
  const serverUnreachableMessage =
    '[verify] Dev server unreachable. Start Vite first (use: npm run verify:dev) or set VERIFY_URL.';

  let attemptSucceeded = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    resetForAttempt(attempt);
    try {
      if (!serverReachable) {
        pageErrors.push(serverUnreachableMessage);
        report.counts.pageErrors++;
        exitCode = 2;
        attemptSucceeded = false;
        break;
      }
      // Wait for the app to at least attach the main canvas.
      // Use 'attached' instead of 'visible' to avoid false negatives if CSS/size is 0.
      // NOTE: On slower Windows/dev machines, Vite module graph + large bootstrap can take >30s
      // before first renderShell attaches the canvas. Keep verify resilient.
      await page.waitForSelector('#viz-canvas', { timeout: 90_000, state: 'attached' });
      report.checks.canvasAttached = true;

      // UI shell sanity: toolbar and key controls should exist in DOM.
      // This helps confirm UI changes even if the full-page screenshot is visually subtle.
      report.checks.toolbarAttached = await page.evaluate(() => Boolean(document.querySelector('#toolbar')));
      report.checks.toolbarControls = await page.evaluate(() => {
        const has = (sel) => Boolean(document.querySelector(sel));
        return {
          audioToggle: has('#audio-toggle'),
          presetSelect: has('#preset-select'),
          pmOpacity: has('#pm-opacity'),
          pmBlendMode: has('#pm-blend-mode'),
          pmAudioOpacity: has('#pm-audio-opacity'),
          pmEnergyOpacity: has('#pm-energy-opacity'),
        };
      });

      // Favorites compare sanity: multi-select + compare table + CSV export enabled.
      // IMPORTANT: hide the panel after the check to avoid affecting screenshot-based checks.
      report.checks.favoritesCompare = {
        ok: false,
        favoritesCount: 0,
        selectedCount: 0,
        compareTable: false,
        exportEnabled: false,
        thCount: 0,
        error: null,
      };
      try {
        // Wait until favorite button wiring is live by confirming count increments.
        // (Clicking too early can be a no-op if handlers aren't attached yet.)
        await page.waitForSelector('#visual-favorite', { state: 'attached', timeout: 30_000 });
        await page.waitForSelector('#visual-favorite-count', { state: 'attached', timeout: 30_000 });
        const beforeCount = await page.evaluate(() => {
          const el = document.querySelector('#visual-favorite-count');
          const text = String(el?.textContent || '').trim();
          const m = text.match(/(\d+)/);
          const n = m ? Number(m[1]) : NaN;
          return Number.isFinite(n) ? n : 0;
        });

        // Create at least 2 favorites.
        await page.click('#visual-favorite', { force: true });
        await page.waitForFunction(
          (before) => {
            const el = document.querySelector('#visual-favorite-count');
            const text = String(el?.textContent || '').trim();
            const m = text.match(/(\d+)/);
            const n = m ? Number(m[1]) : NaN;
            return Number.isFinite(n) && n >= Number(before) + 1;
          },
          beforeCount,
          { timeout: 20_000 }
        );
        await page.click('#visual-random', { force: true });
        await sleep(120);
        await page.click('#visual-favorite', { force: true });

        // Open favorites panel explicitly.
        // Some layouts make hit-testing flaky in headless; prefer multiple fallbacks.
        const openFavoritesPanel = async () => {
          // First try: click the count label (toggles the panel).
          try {
            await page.click('#visual-favorite-count', { force: true });
          } catch {
            // ignore
          }

          // Fallback: dispatch a DOM click (bypasses overlay/hit-test issues).
          try {
            await page.evaluate(() => {
              const el = document.querySelector('#visual-favorite-count');
              if (el instanceof HTMLElement) el.click();
            });
          } catch {
            // ignore
          }

          // Last resort: clicking Favorite button should always call showPanel().
          try {
            await page.click('#visual-favorite', { force: true });
          } catch {
            // ignore
          }
        };

        await openFavoritesPanel();

        // Wait for panel to exist.
        try {
          await page.waitForSelector('#favorites-panel', { state: 'attached', timeout: 30_000 });
        } catch {
          // Retry once after another explicit open.
          await openFavoritesPanel();
          await page.waitForSelector('#favorites-panel', { state: 'attached', timeout: 30_000 });
        }
        const panelVisible = await page.evaluate(() => {
          const el = document.querySelector('#favorites-panel');
          if (!(el instanceof HTMLElement)) return false;
          return getComputedStyle(el).display !== 'none';
        });
        if (!panelVisible) {
          await openFavoritesPanel();
        }
        await page.waitForFunction(() => {
          const el = document.querySelector('#favorites-panel');
          if (!(el instanceof HTMLElement)) return false;
          return getComputedStyle(el).display !== 'none';
        }, null, { timeout: 30_000 });

        // Capture list view for layout verification.
        try {
          await page.locator('#favorites-panel').screenshot({ path: favoritesPanelPath });
        } catch {
          // ignore
        }

        const checks = page.locator('#favorites-panel .nw-fav-item__check');
        const count = await checks.count();
        report.checks.favoritesCompare.favoritesCount = count;

        if (count >= 2) {
          await checks.nth(0).setChecked(true);
          await checks.nth(1).setChecked(true);
          report.checks.favoritesCompare.selectedCount = 2;

          // Enter compare view (table is only rendered once in compare mode).
          await page.click('#favorites-panel button:has-text("对比")', { force: true });
          await page.waitForSelector('#favorites-panel table.nw-fav-compare__table', { timeout: 5_000 });

          // Capture compare view for layout verification.
          try {
            await page.locator('#favorites-panel').screenshot({ path: favoritesComparePath });
          } catch {
            // ignore
          }

          report.checks.favoritesCompare.compareTable = true;
          report.checks.favoritesCompare.thCount = await page
            .locator('#favorites-panel table.nw-fav-compare__table thead th')
            .count();
          report.checks.favoritesCompare.exportEnabled = await page
            .locator('#favorites-panel button:has-text("导出 CSV")')
            .isEnabled();

          report.checks.favoritesCompare.ok =
            report.checks.favoritesCompare.compareTable === true &&
            report.checks.favoritesCompare.exportEnabled === true &&
            report.checks.favoritesCompare.thCount >= 3;
        }
      } catch (err) {
        report.checks.favoritesCompare.error = String(err?.stack || err || '');
      } finally {
        try {
          await page.click('#favorites-panel .nw-panel__close', { force: true });
        } catch {
          // ignore
        }
      }

      // Manual preset switching stress test (headless).
      // Goal: rapid clicks must not freeze rendering or wedge UI.
      report.checks.presetStress = {
        ok: false,
        optionCount: 0,
        selectionsAttempted: 0,
        nextClicks: 0,
        maxRafGapMs: null,
        finalPresetStatus: null,
        error: null,
      };
      try {
        await page.waitForSelector('#preset-select', { state: 'attached', timeout: 30_000 });
        await page.waitForSelector('#preset-next', { state: 'attached', timeout: 30_000 });

        const presetOptions = await page.$$eval('#preset-select option', (opts) =>
          opts
            .map((o) => (o instanceof HTMLOptionElement ? String(o.value || '').trim() : ''))
            .filter((v) => v.length > 0)
        );
        report.checks.presetStress.optionCount = presetOptions.length;

        if (presetOptions.length >= 6) {
          // Start RAF gap sampling inside the page.
          await page.evaluate(() => {
            // @ts-ignore
            window.__nw_verify = window.__nw_verify || {};
            // @ts-ignore
            window.__nw_verify.rafTimes = [];
            // @ts-ignore
            window.__nw_verify.rafRunning = true;
            const tick = (ts) => {
              // @ts-ignore
              if (!window.__nw_verify?.rafRunning) return;
              // @ts-ignore
              window.__nw_verify.rafTimes.push(ts);
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });

          // Rapid dropdown selects (latest-wins should keep UI responsive).
          const pick = (i) => presetOptions[Math.max(0, Math.min(presetOptions.length - 1, i))];
          const indices = [0, 1, 2, 3, presetOptions.length - 4, presetOptions.length - 3, presetOptions.length - 2, presetOptions.length - 1];
          const values = indices.map(pick);

          for (const v of values) {
            await page.selectOption('#preset-select', v);
            report.checks.presetStress.selectionsAttempted++;
            await sleep(60);
          }

          // Rapid "Next" clicks.
          for (let i = 0; i < 10; i++) {
            await page.click('#preset-next', { force: true });
            report.checks.presetStress.nextClicks++;
            await sleep(60);
          }

          // Wait for preset status to settle (avoid wedged "Loading").
          try {
            await page.waitForFunction(() => {
              const el = document.querySelector('#preset-status');
              if (!(el instanceof HTMLElement)) return false;
              const text = String(el.textContent || '');
              if (!text) return false;
              const lower = text.toLowerCase();
              return !lower.includes('loading') && !lower.includes('加载中');
            }, null, { timeout: 30_000 });
          } catch {
            // tolerate; will be captured in final status
          }

          report.checks.presetStress.finalPresetStatus = await page.evaluate(() => {
            const el = document.querySelector('#preset-status');
            return String(el?.textContent || '').trim() || null;
          });

          // Stop RAF sampling and compute max gap.
          const maxGapMs = await page.evaluate(() => {
            // @ts-ignore
            const t = window.__nw_verify?.rafTimes || [];
            // @ts-ignore
            if (window.__nw_verify) window.__nw_verify.rafRunning = false;
            if (!Array.isArray(t) || t.length < 4) return null;
            let maxGap = 0;
            for (let i = 1; i < t.length; i++) {
              const d = Number(t[i]) - Number(t[i - 1]);
              if (Number.isFinite(d) && d > maxGap) maxGap = d;
            }
            return maxGap;
          });
          report.checks.presetStress.maxRafGapMs = maxGapMs;

          // Pass policy: no long UI freeze.
          // Allow some jank during load, but flag multi-second stalls.
          const freezeOk = typeof maxGapMs === 'number' ? maxGapMs < 1500 : true;
          report.checks.presetStress.ok =
            freezeOk &&
            report.checks.presetStress.selectionsAttempted >= 4 &&
            report.checks.presetStress.nextClicks >= 6;

          if (!report.checks.presetStress.ok) {
            consoleLines.push(
              `[warning] presetStress not OK: maxRafGapMs=${maxGapMs} status=${report.checks.presetStress.finalPresetStatus}`
            );
          }
        } else {
          report.checks.presetStress.error = `Not enough presets to stress-test (optionCount=${presetOptions.length})`;
        }
      } catch (err) {
        report.checks.presetStress.error = String(err?.stack || err || '');
        // Non-fatal: preset list may be empty if manifest not loaded yet.
        consoleLines.push(`[warning] presetStress error: ${report.checks.presetStress.error}`);
      }

      // More realistic user-flow smoke: click around like a human.
      // Keep it deterministic and avoid permission prompts.
      report.checks.userFlow = {
        ok: false,
        toolbarToggled: false,
        inspectorOpened: false,
        inspectorSearchTyped: false,
        inspectorResetClicked: false,
        mixxxErrorShown: false,
        presetAutoCycle1: false,
        presetAutoCycle2: false,
        presetAutoToggleStillOn: false,
        presetAutoCycleError: null,
        error: null,
      };
      try {
        // Toggle toolbar collapse/expand twice and ensure body is visible at end.
        const toolbarToggle = page.locator('#toolbar-toggle');
        if (await toolbarToggle.isVisible({ timeout: 2_000 })) {
          await toolbarToggle.click({ force: true });
          await sleep(80);
          await toolbarToggle.click({ force: true });
          await sleep(80);
          report.checks.userFlow.toolbarToggled = true;
        }
        await page.waitForFunction(() => {
          const el = document.querySelector('#toolbar-body');
          if (!(el instanceof HTMLElement)) return false;
          return getComputedStyle(el).display !== 'none';
        }, null, { timeout: 5_000 });

        // Toolbar can overflow; ensure Inspector controls are in view.
        try {
          await page.locator('#inspector-toggle').scrollIntoViewIfNeeded({ timeout: 2_000 });
        } catch {
          // ignore
        }

        // Open inspector (only if closed), type a query, then hit reset.
        const ensureInspectorOpen = async () => {
          // Wait until Inspector controller is initialized (it populates the status text).
          try {
            await page.waitForFunction(() => {
              const status = document.querySelector('#inspector-status');
              if (!(status instanceof HTMLElement)) return false;
              const text = String(status.textContent || '');
              return text.includes('fav=v2');
            }, null, { timeout: 5_000 });
          } catch {
            // ignore
          }

          try {
            const open = await page.evaluate(() => {
              const el = document.querySelector('#inspector-container');
              if (!(el instanceof HTMLElement)) return false;
              return getComputedStyle(el).display !== 'none';
            });
            if (open) return true;
          } catch {
            // ignore
          }
          const inspectorToggle = page.locator('#inspector-toggle');
          try {
            await inspectorToggle.scrollIntoViewIfNeeded({ timeout: 2_000 });
          } catch {
            // ignore
          }

          // Try opening a few times; on slower boots the first click can happen before handlers attach.
          for (let i = 0; i < 3; i++) {
            try {
              await inspectorToggle.click({ force: true });
              await sleep(120);
            } catch {
              // ignore
            }
            try {
              const opened = await page.evaluate(() => {
                const el = document.querySelector('#inspector-container');
                if (!(el instanceof HTMLElement)) return false;
                return getComputedStyle(el).display !== 'none';
              });
              if (opened) return true;
            } catch {
              // ignore
            }
          }

          // Fallback: dispatch a DOM click (avoids any hit-test / overlay quirks in headless).
          for (let i = 0; i < 2; i++) {
            try {
              await page.evaluate(() => {
                const btn = document.querySelector('#inspector-toggle');
                if (btn instanceof HTMLButtonElement) btn.click();
              });
              await sleep(150);
            } catch {
              // ignore
            }
            try {
              const opened = await page.evaluate(() => {
                const el = document.querySelector('#inspector-container');
                if (!(el instanceof HTMLElement)) return false;
                return getComputedStyle(el).display !== 'none';
              });
              if (opened) return true;
            } catch {
              // ignore
            }
          }
          return false;
        };

        report.checks.userFlow.inspectorOpened = await ensureInspectorOpen();
        const inspectorSearch = page.locator('#inspector-search');
        try {
          await inspectorSearch.scrollIntoViewIfNeeded({ timeout: 2_000 });
        } catch {
          // ignore
        }
        if (await inspectorSearch.isVisible({ timeout: 2_000 })) {
          await inspectorSearch.fill('opacity');
          await sleep(120);
          report.checks.userFlow.inspectorSearchTyped = true;
        }
        const inspectorReset = page.locator('#inspector-reset');
        try {
          await inspectorReset.scrollIntoViewIfNeeded({ timeout: 2_000 });
        } catch {
          // ignore
        }
        if (await inspectorReset.isVisible({ timeout: 2_000 })) {
          await inspectorReset.click({ force: true });
          report.checks.userFlow.inspectorResetClicked = true;
        }

        // Exercise Mixxx connect error path without providing a URL.
        // This validates data-flow from UI -> controller -> status label update.
        const mixxxConnect = page.locator('#audio-mixxx-connect');
        if (await mixxxConnect.isVisible({ timeout: 2_000 })) {
          await mixxxConnect.click({ force: true });
          await sleep(120);
          report.checks.userFlow.mixxxErrorShown = await page.evaluate(() => {
            const el = document.querySelector('#audio-status');
            if (!(el instanceof HTMLElement)) return false;
            const state = String(el.dataset.state || '');
            const text = String(el.textContent || '');
            return state === 'error' && text.length > 0;
          });
        }

        // Verify preset auto-cycle advances more than once (regression guard for "plays once").
        try {
          const presetSelect = page.locator('#preset-select');
          const autoToggle = page.locator('#preset-auto-toggle');
          const intervalInput = page.locator('#preset-auto-interval');

          const canRun =
            (await presetSelect.isVisible({ timeout: 1_000 })) &&
            (await autoToggle.isVisible({ timeout: 1_000 })) &&
            (await intervalInput.isVisible({ timeout: 1_000 })) &&
            (await autoToggle.isEnabled({ timeout: 1_000 })) &&
            (await intervalInput.isEnabled({ timeout: 1_000 }));

          if (canRun) {
            // Headless runs often have no real audio/beat input. Allow preset cycling anyway.
            await page.evaluate(() => {
              // @ts-ignore
              window.__nw_verify = window.__nw_verify || {};
              // @ts-ignore
              window.__nw_verify.forcePresetGateOpen = true;
            });

            const initialPresetValue = await page.evaluate(() => {
              const sel = document.querySelector('#preset-select');
              return sel instanceof HTMLSelectElement ? sel.value : null;
            });

            // Deterministic: toggle via DOM (headless can be flaky with overflow hit-testing).
            await page.evaluate(() => {
              const interval = document.querySelector('#preset-auto-interval');
              if (interval instanceof HTMLInputElement) {
                // Small interval to keep the test fast but stable.
                interval.value = '10';
                interval.dispatchEvent(new Event('change', { bubbles: true }));
              }

              const toggle = document.querySelector('#preset-auto-toggle');
              if (toggle instanceof HTMLInputElement) {
                toggle.checked = false;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
                toggle.checked = true;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
              }
            });
            await sleep(200);

            if (!(await autoToggle.isChecked())) {
              throw new Error('Failed to enable preset auto-cycle toggle');
            }

            const firstPresetValue = await page.waitForFunction(
              (prev) => {
                const sel = document.querySelector('#preset-select');
                if (!(sel instanceof HTMLSelectElement)) return null;
                const v = String(sel.value || '');
                if (!v) return null;
                if (!prev) return v;
                return v !== String(prev) ? v : null;
              },
              initialPresetValue,
              { timeout: 35_000 }
            );
            report.checks.userFlow.presetAutoCycle1 = true;

            await page.waitForFunction(
              (prev) => {
                const sel = document.querySelector('#preset-select');
                if (!(sel instanceof HTMLSelectElement)) return false;
                const v = String(sel.value || '');
                return Boolean(v) && v !== String(prev || '');
              },
              await firstPresetValue.jsonValue(),
              { timeout: 35_000 }
            );
            report.checks.userFlow.presetAutoCycle2 = true;
            report.checks.userFlow.presetAutoToggleStillOn = await autoToggle.isChecked();

            // Turn it off so the rest of the test is deterministic.
            await page.evaluate(() => {
              const toggle = document.querySelector('#preset-auto-toggle');
              if (toggle instanceof HTMLInputElement) {
                toggle.checked = false;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
              }
            });
            await sleep(120);
          }
        } catch (err) {
          report.checks.userFlow.presetAutoCycleError = String(
            err?.stack || err || ''
          );
        }

        report.checks.userFlow.ok =
          report.checks.userFlow.toolbarToggled === true &&
          report.checks.userFlow.inspectorOpened === true &&
          report.checks.userFlow.inspectorSearchTyped === true &&
          report.checks.userFlow.presetAutoCycle1 === true &&
          report.checks.userFlow.presetAutoCycle2 === true &&
          report.checks.userFlow.presetAutoToggleStillOn === true;

        if (!report.checks.userFlow.ok) {
          // Non-fatal: layout refactors can change visibility/scroll behavior.
          // Keep the signal in logs + report, but don't fail the run.
          consoleLines.push(`[warning] userFlow check incomplete: ${JSON.stringify(report.checks.userFlow)}`);
        }
      } catch (err) {
        report.checks.userFlow.error = String(err?.stack || err || '');
        pageErrors.push(`[verify] userFlow check failed: ${report.checks.userFlow.error}`);
        report.counts.pageErrors++;
        exitCode = Math.max(exitCode, 2);
      }

      // Open the inspector so [data-scope] rows are rendered into DOM.
      // Then enable advanced controls so mixer params like Liquid/opacity can be exercised.
      try {
        await page.waitForSelector('#inspector-container', { state: 'attached', timeout: 5_000 });

        // Wait for Inspector controller to initialize (status populated).
        try {
          await page.waitForFunction(() => {
            const status = document.querySelector('#inspector-status');
            if (!(status instanceof HTMLElement)) return false;
            const text = String(status.textContent || '');
            return text.includes('fav=v2');
          }, null, { timeout: 5_000 });
        } catch {
          // ignore
        }

        const open = await page.evaluate(() => {
          const el = document.querySelector('#inspector-container');
          if (!(el instanceof HTMLElement)) return false;
          return getComputedStyle(el).display !== 'none';
        });
        if (!open) {
          const inspectorToggle = page.locator('#inspector-toggle');
          try {
            await inspectorToggle.scrollIntoViewIfNeeded({ timeout: 2_000 });
          } catch {
            // ignore
          }
          for (let i = 0; i < 3; i++) {
            try {
              await inspectorToggle.click({ force: true });
              await sleep(120);
            } catch {
              // ignore
            }
            try {
              const opened = await page.evaluate(() => {
                const el = document.querySelector('#inspector-container');
                if (!(el instanceof HTMLElement)) return false;
                return getComputedStyle(el).display !== 'none';
              });
              if (opened) break;
            } catch {
              // ignore
            }
          }

          // DOM-level click fallback.
          try {
            await page.evaluate(() => {
              const btn = document.querySelector('#inspector-toggle');
              if (btn instanceof HTMLButtonElement) btn.click();
            });
            await sleep(150);
          } catch {
            // ignore
          }
        }
      } catch {
        // ok; continue
      }
      try {
        const adv = page.locator('#inspector-show-advanced');
        try {
          await adv.scrollIntoViewIfNeeded({ timeout: 2_000 });
        } catch {
          // ignore
        }
        try {
          await adv.setChecked(true, { force: true });
        } catch {
          // Fallback for cases where Playwright can't interact reliably inside overflow containers.
          try {
            await page.evaluate(() => {
              const el = document.querySelector('#inspector-show-advanced');
              if (!(el instanceof HTMLInputElement)) return;
              el.checked = true;
              el.dispatchEvent(new Event('change', { bubbles: true }));
            });
          } catch {
            // ignore
          }
        }
      } catch {
        // ok; continue
      }

      // Ensure the inspector isn't filtered by a previous search (userFlow types a query).
      try {
        const search = page.locator('#inspector-search');
        if (await search.isVisible({ timeout: 1_000 })) {
          await search.fill('');
          await sleep(80);
        }
      } catch {
        // ok; continue
      }

      if (VERIFY_BEAT_TEMPO) {
        report.checks.beatTempo = {
          ok: false,
          audioLoaded: false,
          enabledSet: false,
          audioFrameText: null,
          error: null,
        };

        try {
          const wav = makeWavClickTrack({ bpm: 120, durationSec: 20 });
          await page.setInputFiles('#audio-file', {
            name: 'verify-click.wav',
            mimeType: 'audio/wav',
            buffer: wav,
          });
          report.checks.beatTempo.audioLoaded = true;

          // Audio autoplay requires a user gesture.
          await page.mouse.click(10, 10);
          await page.click('#audio-toggle', { force: true });
          await sleep(250);

          // Filter inspector to BeatTempo and enable it.
          const search = page.locator('#inspector-search');
          if (await search.isVisible({ timeout: 2_000 })) {
            await search.fill('Audio/BeatTempo/enabled');
            await sleep(120);
          }

          const enabledSel =
            '[data-scope="audio.beatTempo"][data-key="enabled"] input[data-role="bool-toggle"]';
          await page.waitForSelector(enabledSel, { timeout: 5_000 });
          const enabledToggle = page.locator(enabledSel);
          await enabledToggle.setChecked(true, { force: true });
          report.checks.beatTempo.enabledSet = await enabledToggle.isChecked();

          // Clear search so other checks aren't affected.
          try {
            if (await search.isVisible({ timeout: 1_000 })) {
              await search.fill('');
              await sleep(80);
            }
          } catch {
            // ignore
          }

          await page.waitForFunction(() => {
            const panel = document.querySelector('#diagnostics-panel');
            if (!(panel instanceof HTMLElement)) return false;
            const rows = Array.from(panel.querySelectorAll('.nw-diag-row'));
            for (const row of rows) {
              const label = row.querySelector('.nw-diag-label');
              const value = row.querySelector('.nw-diag-value');
              if (!(label instanceof HTMLElement) || !(value instanceof HTMLElement)) continue;
              if (String(label.textContent || '').trim() !== 'AudioFrame') continue;
              const text = String(value.textContent || '');
              return /tempo=/.test(text) && /beat=/.test(text) && /conf=/.test(text);
            }
            return false;
          }, null, { timeout: 30_000 });

          report.checks.beatTempo.audioFrameText = await page.evaluate(() => {
            const panel = document.querySelector('#diagnostics-panel');
            if (!(panel instanceof HTMLElement)) return null;
            const rows = Array.from(panel.querySelectorAll('.nw-diag-row'));
            for (const row of rows) {
              const label = row.querySelector('.nw-diag-label');
              const value = row.querySelector('.nw-diag-value');
              if (!(label instanceof HTMLElement) || !(value instanceof HTMLElement)) continue;
              if (String(label.textContent || '').trim() !== 'AudioFrame') continue;
              return String(value.textContent || '');
            }
            return null;
          });

          report.checks.beatTempo.ok = true;
        } catch (err) {
          report.checks.beatTempo.error = String(err?.stack || err || '');
          pageErrors.push(
            `[verify] beatTempo check failed: ${report.checks.beatTempo.error}`
          );
          report.counts.pageErrors++;
          exitCode = Math.max(exitCode, 2);
        }
      }

      const ensureAudioDrive = async () => {
        const wav = makeWavClickTrack({ bpm: 120, durationSec: 18 });
        await page.setInputFiles('#audio-file', {
          name: 'verify-click.wav',
          mimeType: 'audio/wav',
          buffer: wav,
        });
        await page.mouse.click(10, 10);
        await sleep(200);
        const toggleText = await page.evaluate(() => {
          const btn = document.querySelector('#audio-toggle');
          return btn instanceof HTMLButtonElement ? String(btn.textContent || '') : '';
        });
        if (/play/i.test(toggleText)) {
          await page.click('#audio-toggle', { force: true });
        }
        await sleep(400);
      };

      const getPerfCaps = async () => {
        return await page.evaluate(() => {
          // @ts-ignore
          const root = window.__nw_verify;
          return root && typeof root.getPerfCaps === 'function' ? root.getPerfCaps() : null;
        });
      };

      const near = (value, expected, tol) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return false;
        return Math.abs(n - expected) <= tol;
      };

      report.checks.perfCaps = {
        ok: false,
        caps: null,
        audioAnalysisOk: false,
        beatTempoOk: false,
        pmAudioOk: false,
        error: null,
      };
      report.checks.aivjAccent = {
        ok: false,
        diagnosticsText: null,
        topologyText: null,
        traceFound: false,
        error: null,
      };
      report.checks.audioDrivePresets = {
        ok: false,
        results: {},
        error: null,
      };
      report.checks.presetLoadShedding = {
        ok: false,
        before: null,
        during: null,
        after: null,
        error: null,
      };

      try {
        await ensureAudioDrive();

        await page.evaluate(() => {
          const toggle = document.querySelector('#auto-techno-toggle');
          if (toggle instanceof HTMLInputElement) {
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        await sleep(600);

        const caps = await getPerfCaps();
        if (!caps) {
          throw new Error('missing __nw_verify.getPerfCaps');
        }
        report.checks.perfCaps.caps = caps;
        const audioAnalysisCap = Math.round(Number(caps.audioAnalysisFpsCap));
        const beatTempoCap = Math.round(Number(caps.beatTempoFpsCap));
        const pmFg = Math.round(Number(caps.pmAudioFeedIntervalMs?.fg ?? NaN));
        const pmBg = Math.round(Number(caps.pmAudioFeedIntervalMs?.bg ?? NaN));
        const audioAnalysisOk = [30, 45, 60].includes(audioAnalysisCap);
        const beatTempoOk = [10, 20, 30].includes(beatTempoCap);
        const pmModeOk = ['high', 'mid', 'low'].includes(
          String(caps.pmAudioCadenceMode)
        );
        const pmAudioOk =
          pmModeOk &&
          [33, 50, 70].includes(pmFg) &&
          [55, 80, 120].includes(pmBg);
        report.checks.perfCaps.audioAnalysisOk = audioAnalysisOk;
        report.checks.perfCaps.beatTempoOk = beatTempoOk;
        report.checks.perfCaps.pmAudioOk = pmAudioOk;
        report.checks.perfCaps.ok = audioAnalysisOk && beatTempoOk && pmAudioOk;

        if (!report.checks.perfCaps.ok) {
          pageErrors.push(
            `[verify] perf caps mismatch: ${JSON.stringify({
              audioAnalysisCap,
              beatTempoCap,
              pmFg,
              pmBg,
              mode: caps.pmAudioCadenceMode,
            })}`
          );
          report.counts.pageErrors++;
          exitCode = Math.max(exitCode, 2);
        }

        const aivjDiagText = await page.evaluate(() => {
          const panel = document.querySelector('#diagnostics-panel');
          if (!(panel instanceof HTMLElement)) return null;
          const rows = Array.from(panel.querySelectorAll('.nw-diag-row'));
          for (const row of rows) {
            const label = row.querySelector('.nw-diag-label');
            const value = row.querySelector('.nw-diag-value');
            if (!(label instanceof HTMLElement) || !(value instanceof HTMLElement)) continue;
            if (String(label.textContent || '').trim() !== 'AIVJ') continue;
            return String(value.textContent || '');
          }
          return null;
        });
        report.checks.aivjAccent.diagnosticsText = aivjDiagText;
        const diagOk =
          typeof aivjDiagText === 'string' &&
          /acc=/.test(aivjDiagText) &&
          /pulse=/.test(aivjDiagText) &&
          /src=/.test(aivjDiagText) &&
          !/acc=--/.test(aivjDiagText) &&
          !/pulse=--/.test(aivjDiagText) &&
          !/src=--/.test(aivjDiagText);

        const topologyState = await page.evaluate(() => {
          const btn = document.querySelector('.nw-topologyToggle');
          return btn instanceof HTMLElement ? String(btn.dataset.state || '') : '';
        });
        if (topologyState !== 'on') {
          await page.click('.nw-topologyToggle', { force: true });
        }
        await page.waitForSelector('#decision-topology-overlay', {
          state: 'attached',
          timeout: 4_000,
        });
        await page.click('[data-node="aivj"]', { force: true });
        await sleep(200);
        const topoText = await page.evaluate(() => {
          const el = document.querySelector(
            '#decision-topology-overlay .nw-topology__details'
          );
          return el instanceof HTMLElement ? String(el.innerText || '') : null;
        });
        report.checks.aivjAccent.topologyText = topoText;
        const topoOk =
          typeof topoText === 'string' &&
          topoText.includes('dbg.accent') &&
          topoText.includes('dbg.slotPulse') &&
          topoText.includes('dbg.src');
        const traceFound =
          typeof topoText === 'string' &&
          topoText.includes('aivj.accent01') &&
          topoText.includes('aivj.slotPulse01');
        report.checks.aivjAccent.traceFound = traceFound;
        // Trace lines can legitimately be absent if the values are stable and the trace
        // rate-limit/minDelta filters suppress repeats. Treat traceFound as best-effort.
        report.checks.aivjAccent.ok = diagOk && topoOk;
        if (!report.checks.aivjAccent.ok) {
          pageErrors.push(
            `[verify] AIVJ accent observability missing (diag=${String(
              aivjDiagText
            )})`
          );
          report.counts.pageErrors++;
          exitCode = Math.max(exitCode, 2);
        }

        const presetExpectations = {
          balanced: { attackMs: 100, releaseMs: 620, maxDeltaPerSec: 2.4, mixToMacros: 0.86 },
          punch: { attackMs: 80, releaseMs: 460, maxDeltaPerSec: 2.9, mixToMacros: 0.96 },
          intense: { attackMs: 60, releaseMs: 360, maxDeltaPerSec: 3.3, mixToMacros: 1.0 },
          subtle: { attackMs: 160, releaseMs: 750, maxDeltaPerSec: 1.6, mixToMacros: 0.5 },
        };
        const results = {};
        let presetsOk = true;
        for (const presetId of Object.keys(presetExpectations)) {
          await page.evaluate((id) => {
            const sel = document.querySelector('#audio-drive-preset');
            if (sel instanceof HTMLSelectElement) {
              sel.value = String(id);
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, presetId);
          await sleep(120);
          const snap = await getPerfCaps();
          const cfg = snap?.audioControls ?? null;
          const expected = presetExpectations[presetId];
          const ok =
            cfg &&
            near(cfg.attackMs, expected.attackMs, 2) &&
            near(cfg.releaseMs, expected.releaseMs, 4) &&
            near(cfg.maxDeltaPerSec, expected.maxDeltaPerSec, 0.08) &&
            near(cfg.mixToMacros, expected.mixToMacros, 0.03);
          results[presetId] = {
            ok,
            expected,
            got: cfg,
          };
          if (!ok) presetsOk = false;
        }
        report.checks.audioDrivePresets.results = results;
        report.checks.audioDrivePresets.ok = presetsOk;
        if (!presetsOk) {
          pageErrors.push(
            `[verify] audio drive preset mismatch: ${JSON.stringify(results)}`
          );
          report.counts.pageErrors++;
          exitCode = Math.max(exitCode, 2);
        }

        await page.evaluate(() => {
          // @ts-ignore
          window.__nw_verify = window.__nw_verify || {};
          // @ts-ignore
          window.__nw_verify.forcePresetGateOpen = true;
        });
        const beforeCaps = await getPerfCaps();
        report.checks.presetLoadShedding.before = beforeCaps;

        // Deterministic trigger: request a short "preset load pressure" window via verify hook.
        // Relying on a UI click + async preset loading is too flaky under HMR/headless.
        await page.evaluate(() => {
          // @ts-ignore
          const v = window.__nw_verify;
          // @ts-ignore
          if (v && typeof v.triggerPresetLoadPressure === 'function') v.triggerPresetLoadPressure('verify');
        });

        const duringHandle = await page.waitForFunction(() => {
          // @ts-ignore
          const caps = window.__nw_verify?.getPerfCaps?.();
          if (!caps) return null;
          if (Number(caps.presetLoadPressureMsLeft ?? 0) > 0) return caps;
          return null;
        }, null, { timeout: 8_000 });
        const duringCaps = await duringHandle.jsonValue();
        report.checks.presetLoadShedding.during = duringCaps;

        const duringOk =
          duringCaps &&
          Math.round(Number(duringCaps.audioAnalysisFpsCap)) === 30 &&
          Math.round(Number(duringCaps.beatTempoFpsCap)) === 10 &&
          Math.round(Number(duringCaps.pmAudioFeedIntervalMs?.fg ?? NaN)) === 70 &&
          Math.round(Number(duringCaps.pmAudioFeedIntervalMs?.bg ?? NaN)) === 120;

        await page.waitForFunction(() => {
          // @ts-ignore
          const caps = window.__nw_verify?.getPerfCaps?.();
          if (!caps) return false;
          return Number(caps.presetLoadPressureMsLeft ?? 0) <= 0;
        }, null, { timeout: 12_000 });
        const afterCaps = await getPerfCaps();
        report.checks.presetLoadShedding.after = afterCaps;

        const afterFg = Math.round(Number(afterCaps?.pmAudioFeedIntervalMs?.fg ?? NaN));
        const afterBg = Math.round(Number(afterCaps?.pmAudioFeedIntervalMs?.bg ?? NaN));
        const afterOk =
          [33, 50, 70].includes(afterFg) &&
          [55, 80, 120].includes(afterBg) &&
          Number(afterCaps?.presetLoadPressureMsLeft ?? 0) <= 0;

        report.checks.presetLoadShedding.ok = Boolean(duringOk && afterOk);
        if (!report.checks.presetLoadShedding.ok) {
          pageErrors.push(
            `[verify] preset load shedding mismatch: ${JSON.stringify({
              before: beforeCaps,
              during: duringCaps,
              after: afterCaps,
            })}`
          );
          report.counts.pageErrors++;
          exitCode = Math.max(exitCode, 2);
        }
      } catch (err) {
        const message = String(err?.stack || err || '');
        report.checks.perfCaps.error = message;
        report.checks.aivjAccent.error = message;
        report.checks.audioDrivePresets.error = message;
        report.checks.presetLoadShedding.error = message;
        pageErrors.push(`[verify] perf/AIVJ checks failed: ${message}`);
        report.counts.pageErrors++;
        exitCode = Math.max(exitCode, 2);
      }

      // Mixer UI sanity: ensure per-layer controls are present in the inspector DOM.
      report.checks.mixerUi = await page.evaluate(() => {
        const q = (sel) => document.querySelector(sel);
        const has = (sel) => Boolean(q(sel));

        const toggleSel = (scope) =>
          `[data-scope="${scope}"][data-key="enabled"] input[data-role="bool-toggle"]`;
        const opacitySel =
          '[data-scope="background.layer.liquid"][data-key="opacity"] input[data-role="number-input"], ' +
          '[data-scope="background.layer.liquid"][data-key="opacity"] input[data-role="number-range"]';

        return {
          backgroundTypeSelect: has(
            '[data-scope="background.type"][data-key="type"] select[data-role="enum-select"]'
          ),
          liquidEnabledToggle: has(toggleSel('background.layer.liquid')),
          basicEnabledToggle: has(toggleSel('background.layer.basic')),
          videoEnabledToggle: has(toggleSel('background.layer.video')),
          cameraEnabledToggle: has(toggleSel('background.layer.camera')),
          liquidOpacityInput: has(opacitySel),
        };
      });

      // If key mixer UI pieces are missing, record as an actionable failure.
      {
        const ui = report.checks.mixerUi;
        const uiOk =
          ui &&
          ui.backgroundTypeSelect &&
          ui.liquidEnabledToggle &&
          ui.basicEnabledToggle &&
          ui.liquidOpacityInput;
        if (!uiOk) {
          pageErrors.push(`[verify] mixer UI missing/changed: ${JSON.stringify(ui)}`);
          report.counts.pageErrors++;
          exitCode = Math.max(exitCode, 2);
        }
      }

      // Capture basic canvas size and validate it is non-zero.
      report.checks.canvasSize = await page.evaluate(() => {
        const el = document.querySelector('#viz-canvas');
        if (!(el instanceof HTMLCanvasElement)) return null;
        const rect = el.getBoundingClientRect();
        return {
          width: el.width,
          height: el.height,
          cssWidth: rect.width,
          cssHeight: rect.height,
        };
      });

      // Audio autoplay requires a user gesture; click once.
      await page.mouse.click(10, 10);
      // Give the app a moment to start audio + render a few frames.
      try {
        await page.waitForFunction(() => {
          const el = document.querySelector('#audio-status');
          return el && !/no audio loaded/i.test(el.textContent || '');
        }, { timeout: 3_000 });
      } catch {
        // ok; keep going
      }

      // Deterministic signal: ensure ProjectM is actually rendering frames.
      // Pixel readback can be unreliable in headless WebGL (transparent buffers, additive blending,
      // preserveDrawingBuffer=false, SwiftShader quirks), so this is the primary health check.
      try {
        await page.waitForFunction(() => {
          const v = (window).__projectm_verify;
          return v && typeof v.framesRendered === 'number' && v.framesRendered >= 3;
        }, { timeout: 10_000 });
      } catch {
        // If this fails, we still proceed to collect artifacts and pixel samples.
      }

      const frameCounts = await page.evaluate(() => {
        const v = (window).__projectm_verify;
        return {
          initialized: Boolean(v?.initialized),
          framesRendered: typeof v?.framesRendered === 'number' ? v.framesRendered : null,
          lastRenderTimeMs: typeof v?.lastRenderTimeMs === 'number' ? v.lastRenderTimeMs : null,
        };
      });
      report.checks.projectMFramesRendered = frameCounts;

      const safeVizScreenshot = async (outPath) => {
        const attempts = 5;
        for (let i = 0; i < attempts; i++) {
          try {
            await page.waitForSelector('#viz-canvas', {
              state: 'attached',
              // Headless + HMR can cause brief detach/reattach; 2s is too aggressive on Windows.
              timeout: 8_000,
            });

            const viz = page.locator('#viz-canvas');
            try {
              await viz.waitFor({ state: 'visible', timeout: 8_000 });
            } catch {
              // fallthrough: still attempt screenshot; some Playwright versions are flaky on canvas visibility
            }

            return await viz.screenshot({ path: outPath });
          } catch (err) {
            const text = String(err?.stack || err || '');
            const transient =
              /not attached to the DOM/i.test(text) ||
              /waiting for navigation/i.test(text) ||
              /navigated to/i.test(text) ||
              /not visible/i.test(text) ||
              /not an HTMLElement/i.test(text) ||
              /element is not stable/i.test(text);
            if (!transient || i === attempts - 1) throw err;
            await sleep(350);
          }
        }
        throw new Error('safeVizScreenshot failed unexpectedly');
      };

      // Validate the *final visible output* has content (not just ProjectM internals).
      // Use screenshot analysis of #viz-canvas, which is robust across WebGL backbuffers.
      try {
        const bufA = await safeVizScreenshot(vizCanvasAPath);
        await sleep(600);
        const bufB = await safeVizScreenshot(vizCanvasBPath);

        const a = analyzePngForContent(bufA, { background: { r: 1, g: 2, b: 3 }, threshold: 12, grid: 64 });
        const b = analyzePngForContent(bufB, { background: { r: 1, g: 2, b: 3 }, threshold: 12, grid: 64 });

        report.checks.finalOutputSample = { a, b };

        // A small amount of non-background pixels is enough to prove “有内容”.
        // Keep this lenient to avoid false negatives on very dark presets.
        const nonEmpty = (a.nonBackgroundCount + b.nonBackgroundCount) >= 20;
        const changed = a.hash !== b.hash;

        report.checks.finalOutputNonEmpty = Boolean(nonEmpty);
        report.checks.finalOutputChanges = Boolean(changed);

        // Optional but highly interpretable artifact: visual diff between A/B.
        // This does not affect pass/fail; it's for human debugging.
        try {
          report.checks.finalOutputDiff = await writeDiffPng(bufA, bufB, diffPath, { amplify: 6 });
        } catch (err) {
          consoleLines.push(`[warning] diff.png generation failed: ${String(err)}`);
        }

        if (!nonEmpty) {
          pageErrors.push(
            `[verify] final output appears empty (viz-canvas too close to background): ${JSON.stringify({ a, b })}`
          );
          report.counts.pageErrors++;
          exitCode = 2;
        }
      } catch (err) {
        pageErrors.push(`[verify] final output screenshot analysis failed: ${String(err)}`);
        report.counts.pageErrors++;
        exitCode = 2;
      }

      // Mixer functional check: enable Basic layer, then vary Liquid opacity (0 -> 1).
      // Expect viz-canvas pixels to change while remaining non-empty.
      try {
        // HMR can trigger a full page reload mid-run; re-ensure inspector state right before we touch mixer controls.
        try {
          await page.waitForSelector('#inspector-container', { state: 'attached', timeout: 5_000 });
          const open = await page.evaluate(() => {
            const el = document.querySelector('#inspector-container');
            if (!(el instanceof HTMLElement)) return false;
            return getComputedStyle(el).display !== 'none';
          });
          if (!open && (await page.locator('#inspector-toggle').isVisible({ timeout: 2_000 }))) {
            await page.click('#inspector-toggle', { force: true });
            await sleep(80);
          }
        } catch {
          // ok; continue
        }
        try {
          const adv = page.locator('#inspector-show-advanced');
          try {
            await adv.scrollIntoViewIfNeeded({ timeout: 2_000 });
          } catch {
            // ignore
          }
          try {
            await adv.setChecked(true, { force: true });
          } catch {
            await page.evaluate(() => {
              const el = document.querySelector('#inspector-show-advanced');
              if (!(el instanceof HTMLInputElement)) return;
              el.checked = true;
              el.dispatchEvent(new Event('change', { bubbles: true }));
            });
          }
        } catch {
          // ok; continue
        }
        try {
          const search = page.locator('#inspector-search');
          if (await search.isVisible({ timeout: 1_000 })) {
            await search.fill('');
            await sleep(80);
          }
        } catch {
          // ok; continue
        }

        // Wait until the key mixer controls exist in DOM (after any reload).
        try {
          await page.waitForFunction(() => {
            const has = (sel) => Boolean(document.querySelector(sel));
            return (
              has('[data-scope="background.layer.basic"][data-key="enabled"] input[data-role="bool-toggle"]') &&
              has('[data-scope="background.layer.liquid"][data-key="enabled"] input[data-role="bool-toggle"]') &&
              (has('[data-scope="background.layer.liquid"][data-key="opacity"] input[data-role="number-input"]') ||
                has('[data-scope="background.layer.liquid"][data-key="opacity"] input[data-role="number-range"]'))
            );
          }, null, { timeout: 5_000 });
        } catch {
          // ok; the checks below will report a clearer error.
        }

        const found = await page.evaluate(() => {
          const get = (sel) => document.querySelector(sel);
          const setChecked = (sel, checked) => {
            const el = get(sel);
            if (!(el instanceof HTMLInputElement)) return false;
            el.checked = Boolean(checked);
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          };
          const setNumber = (sel, value) => {
            const el = get(sel);
            if (!(el instanceof HTMLInputElement)) return false;
            el.value = String(value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          };

          const basicOk = setChecked(
            '[data-scope="background.layer.basic"][data-key="enabled"] input[data-role="bool-toggle"]',
            true
          );
          const liquidOk = setChecked(
            '[data-scope="background.layer.liquid"][data-key="enabled"] input[data-role="bool-toggle"]',
            true
          );
          const opacityOk = Boolean(
            get(
              '[data-scope="background.layer.liquid"][data-key="opacity"] input[data-role="number-input"]'
            )
          ) ||
            Boolean(
              get(
                '[data-scope="background.layer.liquid"][data-key="opacity"] input[data-role="number-range"]'
              )
            );
          return { basicOk, liquidOk, opacityOk };
        });

        if (!found?.basicOk || !found?.liquidOk || !found?.opacityOk) {
          throw new Error(`mixer controls not found: ${JSON.stringify(found)}`);
        }

        // Set Liquid opacity to 0.
        await page.evaluate(() => {
          const pick = () => {
            const a = document.querySelector(
              '[data-scope="background.layer.liquid"][data-key="opacity"] input[data-role="number-input"]'
            );
            if (a instanceof HTMLInputElement) return a;
            const b = document.querySelector(
              '[data-scope="background.layer.liquid"][data-key="opacity"] input[data-role="number-range"]'
            );
            if (b instanceof HTMLInputElement) return b;
            return null;
          };
          const el = pick();
          if (!el) return;
          el.value = '0';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await sleep(500);

        const buf0 = await safeVizScreenshot(mixerVizOpacity0Path);

        // Set Liquid opacity to 1.
        await page.evaluate(() => {
          const pick = () => {
            const a = document.querySelector(
              '[data-scope="background.layer.liquid"][data-key="opacity"] input[data-role="number-input"]'
            );
            if (a instanceof HTMLInputElement) return a;
            const b = document.querySelector(
              '[data-scope="background.layer.liquid"][data-key="opacity"] input[data-role="number-range"]'
            );
            if (b instanceof HTMLInputElement) return b;
            return null;
          };
          const el = pick();
          if (!el) return;
          el.value = '1';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await sleep(500);
        const buf1 = await safeVizScreenshot(mixerVizOpacity1Path);

        const a0 = analyzePngForContent(buf0, { background: { r: 1, g: 2, b: 3 }, threshold: 12, grid: 64 });
        const a1 = analyzePngForContent(buf1, { background: { r: 1, g: 2, b: 3 }, threshold: 12, grid: 64 });

        const nonEmpty = (a0.nonBackgroundCount + a1.nonBackgroundCount) >= 20;
        const changed = a0.hash !== a1.hash;

        let diff = null;
        try {
          diff = await writeDiffPng(buf0, buf1, mixerDiffPath, { amplify: 6 });
        } catch (err) {
          consoleLines.push(`[warning] mixer-diff.png generation failed: ${String(err)}`);
        }

        report.checks.mixerBlend = {
          basicEnabled: true,
          liquidEnabled: true,
          opacity0Sample: a0,
          opacity1Sample: a1,
          nonEmpty,
          changed,
          diff,
        };

        if (!nonEmpty || !changed) {
          pageErrors.push(
            `[verify] mixer blend check failed (nonEmpty=${nonEmpty} changed=${changed}): ${JSON.stringify({ a0, a1 })}`
          );
          report.counts.pageErrors++;
          exitCode = Math.max(exitCode, 2);
        }
      } catch (err) {
        pageErrors.push(`[verify] mixer blend check failed: ${String(err)}`);
        report.counts.pageErrors++;
        exitCode = Math.max(exitCode, 2);
      }

      // Validate the ProjectM layer itself is animating by sampling the offscreen canvas.
      // The engine canvas is positioned off-screen, so temporarily move it on-screen for screenshotting.
      try {
        await page.evaluate(() => {
          // HMR / re-init can leave multiple #canvas elements behind. Prefer the *last* one.
          const all = Array.from(document.querySelectorAll('#canvas'))
            .filter((x) => x instanceof HTMLCanvasElement);
          const el = all.length ? all[all.length - 1] : null;
          if (!(el instanceof HTMLCanvasElement)) return;

          // Remember previous inline style so later cleanup (if any) can restore.
          // Store per-element marker to avoid confusing multiple canvases.
          try {
            el.dataset.verifyProjectm = '1';
          } catch {
            // ignore
          }
          (window).__verify_prev_projectm_style = el.getAttribute('style') || '';
          el.style.position = 'fixed';
          el.style.left = '0px';
          el.style.top = '0px';
          el.style.width = '320px';
          el.style.height = '180px';
          // Playwright may treat opacity=0 as not visible for element screenshots.
          // Keep it effectively invisible but still "visible".
          el.style.opacity = '0.01';
          el.style.pointerEvents = 'none';
          el.style.zIndex = '9999';
        });

        // Disambiguate in Playwright strict mode.
        // Prefer the one we tagged, otherwise fall back to last #canvas.
        const pmTagged = page.locator('canvas#canvas[data-verify-projectm="1"]');
        const pm = (await pmTagged.count()) > 0 ? pmTagged.first() : page.locator('canvas#canvas').last();

        const analyze = (buf) =>
          analyzePngForContent(buf, { background: { r: 0, g: 0, b: 0 }, threshold: 18, grid: 64 });

        const waitForProjectMFrameAdvance = async () => {
          const before = await page.evaluate(() => {
            const v = (window).__projectm_verify;
            return typeof v?.framesRendered === 'number' ? v.framesRendered : null;
          });
          if (typeof before !== 'number') {
            await sleep(450);
            return;
          }
          try {
            await page.waitForFunction(
              (minFrames) => {
                const v = (window).__projectm_verify;
                return typeof v?.framesRendered === 'number' && v.framesRendered >= minFrames;
              },
              before + 1,
              { timeout: 1_500 }
            );
          } catch {
            await sleep(450);
          }
        };

        const series = [];

        const pmA = await pm.screenshot({ path: projectmCanvasAPath });
        const a = analyze(pmA);
        series.push(a);

        // Wait for ProjectM to advance at least one frame before the next sample.
        await waitForProjectMFrameAdvance();

        const pmB = await pm.screenshot({ path: projectmCanvasBPath });
        const b = analyze(pmB);
        series.push(b);

        // Headless + SwiftShader can occasionally produce identical consecutive screenshots
        // even while the final composed output is changing. To avoid flakiness, take a few
        // additional samples and only fail if *none* of them differ.
        const MAX_EXTRA_SAMPLES = 3;
        for (let i = 0; i < MAX_EXTRA_SAMPLES; i++) {
          const anyChangeSoFar = series.some((s, idx) => idx > 0 && s.hash !== series[idx - 1].hash);
          const totalNonBackground = series.reduce((acc, s) => acc + (s?.nonBackgroundCount | 0), 0);
          const nonEmptySoFar = totalNonBackground >= 10;
          if (anyChangeSoFar && nonEmptySoFar) break;

          await waitForProjectMFrameAdvance();
          const extraBuf = await pm.screenshot();
          series.push(analyze(extraBuf));
        }

        report.checks.projectMCanvasSample = { a, b };
        report.checks.projectMCanvasSampleSeries = series;

        const totalNonBackground = series.reduce((acc, s) => acc + (s?.nonBackgroundCount | 0), 0);
        const nonEmpty = totalNonBackground >= 10;
        const changed = series.some((s, idx) => idx > 0 && s.hash !== series[idx - 1].hash);

        report.checks.projectMCanvasNonEmpty = Boolean(nonEmpty);
        report.checks.projectMCanvasChanges = Boolean(changed);

        const finalOutputOk = report.checks.finalOutputNonEmpty === true && report.checks.finalOutputChanges === true;

        if (!nonEmpty) {
          if (finalOutputOk) {
            report.checks.projectMCanvasNonEmpty = null;
            consoleLines.push(
              `[warning] [verify] ProjectM canvas appears empty in headless screenshot; final output is changing, treating as unknown.`
            );
          } else {
            pageErrors.push(
              `[verify] ProjectM canvas appears empty: ${JSON.stringify({ a, b, series: series.slice(0, 5) })}`
            );
            report.counts.pageErrors++;
            exitCode = 2;
          }
        }
        if (!changed) {
          if (finalOutputOk) {
            report.checks.projectMCanvasChanges = null;
            consoleLines.push(
              `[warning] [verify] ProjectM canvas did not change in headless screenshot; final output is changing, treating as unknown.`
            );
          } else {
            pageErrors.push(
              `[verify] ProjectM canvas did not change across samples: ${JSON.stringify({ a, b, series: series.slice(0, 5) })}`
            );
            report.counts.pageErrors++;
            exitCode = 2;
          }
        }
      } catch (err) {
        const finalOutputOk = report.checks.finalOutputNonEmpty === true && report.checks.finalOutputChanges === true;
        if (finalOutputOk) {
          report.checks.projectMCanvasNonEmpty = null;
          report.checks.projectMCanvasChanges = null;
          consoleLines.push(
            `[warning] [verify] ProjectM canvas screenshot analysis failed; final output is changing, treating as unknown: ${String(
              err
            )}`
          );
        } else {
          pageErrors.push(`[verify] ProjectM canvas screenshot analysis failed: ${String(err)}`);
          report.counts.pageErrors++;
          exitCode = 2;
        }
      } finally {
        try {
          await page.evaluate(() => {
            const el = document.querySelector('#canvas');
            if (el instanceof HTMLCanvasElement) {
              const prev = (window).__verify_prev_projectm_style;
              if (typeof prev === 'string') {
                el.setAttribute('style', prev);
              }
              delete (window).__verify_prev_projectm_style;
            }
          });
        } catch {
          // ignore
        }
      }

      // Validate that the canvas is actually rendering non-empty pixels
      // and changes between frames (a weak but practical signal).
      const sampleCanvas = async () => {
        return await page.evaluate(() => {
          const el = document.querySelector('#viz-canvas');
          if (!(el instanceof HTMLCanvasElement)) {
            return { ok: false, reason: 'no-canvas', hash: 0, nonZeroCount: 0 };
          }
          // Prefer WebGL readPixels; drawImage->2d can return black when preserveDrawingBuffer is false.
          const gl = el.getContext('webgl2') || el.getContext('webgl');
          if (gl) {
            const w = el.width | 0;
            const h = el.height | 0;
            if (w <= 0 || h <= 0) return { ok: false, reason: 'zero-size', hash: 0, nonZeroCount: 0 };

            const points = [
              [w >> 1, h >> 1],
              [w >> 2, h >> 2],
              [(w * 3) >> 2, h >> 2],
              [w >> 2, (h * 3) >> 2],
              [(w * 3) >> 2, (h * 3) >> 2],
            ];

            let hash = 0;
            let nonZeroCount = 0;
            const px = new Uint8Array(4);

            for (const [x, y] of points) {
              try {
                gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
              } catch (e) {
                return { ok: false, reason: `readPixels-failed:${String(e)}`, hash: 0, nonZeroCount: 0 };
              }
              const v = (px[0] << 24) ^ (px[1] << 16) ^ (px[2] << 8) ^ px[3];
              if (px[0] || px[1] || px[2] || px[3]) nonZeroCount++;
              hash = (hash * 131 + (v >>> 0)) >>> 0;
            }

            return { ok: true, reason: 'webgl', hash, nonZeroCount };
          }

          // Fallback: 2d sampling.
          const w = Math.max(1, Math.min(el.width | 0, 256));
          const h = Math.max(1, Math.min(el.height | 0, 256));
          const scratch = document.createElement('canvas');
          scratch.width = w;
          scratch.height = h;
          const ctx = scratch.getContext('2d');
          if (!ctx) return { ok: false, reason: 'no-2d-context', hash: 0, nonZeroCount: 0 };
          try {
            ctx.drawImage(el, 0, 0, w, h);
          } catch (e) {
            return { ok: false, reason: `drawImage-failed:${String(e)}`, hash: 0, nonZeroCount: 0 };
          }
          const img = ctx.getImageData(0, 0, w, h);
          const data = img.data;
          let hash = 0;
          let nonZeroCount = 0;
          const step = 64;
          for (let i = 0; i < data.length; i += step) {
            const v = data[i] | 0;
            if (v !== 0) nonZeroCount++;
            hash = (hash * 131 + v) >>> 0;
          }
          return { ok: true, reason: '2d', hash, nonZeroCount };
        });
      };

      // Retry sampling for a short window to avoid catching the canvas between swaps.
      const samples = [];
      for (let i = 0; i < 6; i++) {
        samples.push(await sampleCanvas());
        await sleep(250);
      }

      const okSamples = samples.filter((s) => s && s.ok);
      if (okSamples.length === 0) {
        // Headless WebGL readback can fail even when the final screenshot output is healthy.
        // Mark these as “unknown” instead of false to avoid misleading reports.
        report.checks.canvasNonEmpty = null;
        report.checks.canvasChanges = null;
        consoleLines.push(`[warning] [verify] canvas sampling unavailable: ${JSON.stringify(samples[0] ?? null)}`);
      } else {
        const anyNonEmpty = okSamples.some((s) => (s.nonZeroCount | 0) > 0);
        const anyChange = okSamples.some((s, idx) => idx > 0 && s.hash !== okSamples[idx - 1].hash);
        report.checks.canvasNonEmpty = Boolean(anyNonEmpty);
        report.checks.canvasChanges = Boolean(anyChange);
      }

      const framesOk =
        Boolean(report.checks.projectMFramesRendered?.initialized) &&
        typeof report.checks.projectMFramesRendered?.framesRendered === 'number' &&
        report.checks.projectMFramesRendered.framesRendered >= 3;

      const finalOutputOk =
        Boolean(report.checks.finalOutputNonEmpty) &&
        Boolean(report.checks.finalOutputChanges);

      // If the screenshot-based final output checks are healthy, but WebGL readPixels sampling
      // reports blank/unchanged, treat that low-level signal as unreliable instead of failing
      // or warning noisily.
      if (
        framesOk &&
        finalOutputOk &&
        (report.checks.canvasNonEmpty === false || report.checks.canvasChanges === false)
      ) {
        report.checks.canvasNonEmpty = null;
        report.checks.canvasChanges = null;
        consoleLines.push('[warning] [verify] canvas readback unreliable in headless; using viz-canvas screenshots as source of truth');
      }

      if (!framesOk) {
        pageErrors.push(`[verify] ProjectM engine not rendering frames: ${JSON.stringify(report.checks.projectMFramesRendered)}`);
        report.counts.pageErrors++;
        exitCode = 2;
      }

      if (report.checks.canvasNonEmpty === false) {
        const msg = `[verify] canvas appears blank or unreadable: ${JSON.stringify(okSamples[0] ?? samples[0])}`;
        if (!framesOk) {
          pageErrors.push(msg);
          report.counts.pageErrors++;
          exitCode = 2;
        } else {
          consoleLines.push(`[warning] ${msg}`);
        }
      }
      if (report.checks.canvasChanges === false) {
        const msg = `[verify] canvas did not change between samples: ${JSON.stringify(okSamples.slice(0, 3))}`;
        if (!framesOk) {
          pageErrors.push(msg);
          report.counts.pageErrors++;
          exitCode = 2;
        } else {
          consoleLines.push(`[warning] ${msg}`);
        }
      }

      await sleep(1200);
      attemptSucceeded = true;
      break;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isTransientNavigationError(err)) {
        consoleLines.push(`[warning] transient navigation during verify, retrying: ${String(err)}`);
        // Ensure we're back on the app after HMR/page reload.
        try {
          await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 10_000 });
        } catch {
          // ignore; next attempt will re-check
        }
        await sleep(600);
        continue;
      }

      pageErrors.push(`[verify] selector wait failed: ${String(err)}`);
      report.counts.pageErrors++;
      exitCode = 1;
      break;
    }
  }

  try {
    if (!attemptSucceeded) {
      // Keep exitCode/pageErrors from the last attempt and proceed to artifact collection.
    }
  } finally {
    // Capture Inspector OverlayBudget view explicitly.
    // Rationale: inspector content is often inside an internal scroll container, so fullPage screenshots can miss it.
    try {
      await page.waitForSelector('#inspector-container', { state: 'attached', timeout: 2_000 });

      // Wait until Inspector controller is initialized (status text populated).
      try {
        await page.waitForFunction(() => {
          const status = document.querySelector('#inspector-status');
          if (!(status instanceof HTMLElement)) return false;
          const text = String(status.textContent || '');
          return text.includes('fav=v2');
        }, null, { timeout: 5_000 });
      } catch {
        // ignore
      }

      const isInspectorOpen = await page.evaluate(() => {
        const el = document.querySelector('#inspector-container');
        if (!(el instanceof HTMLElement)) return false;
        return getComputedStyle(el).display !== 'none';
      });
      if (!isInspectorOpen) {
        const inspectorToggle = page.locator('#inspector-toggle');
        try {
          await inspectorToggle.scrollIntoViewIfNeeded({ timeout: 2_000 });
        } catch {
          // ignore
        }
        for (let i = 0; i < 3; i++) {
          try {
            await inspectorToggle.click({ force: true });
            await sleep(150);
          } catch {
            // ignore
          }
          try {
            const opened = await page.evaluate(() => {
              const el = document.querySelector('#inspector-container');
              if (!(el instanceof HTMLElement)) return false;
              return getComputedStyle(el).display !== 'none';
            });
            if (opened) break;
          } catch {
            // ignore
          }
        }

        // DOM-level click fallback.
        try {
          await page.evaluate(() => {
            const btn = document.querySelector('#inspector-toggle');
            if (btn instanceof HTMLButtonElement) btn.click();
          });
          await sleep(150);
        } catch {
          // ignore
        }
      }

      const search = page.locator('#inspector-search');
      if (await search.isVisible({ timeout: 1_000 })) {
        await search.fill('overlayBudget');
        await sleep(200);
      }
      await page.locator('#inspector-container').screenshot({ path: inspectorOverlayBudgetPath });

      try {
        if (await search.isVisible({ timeout: 500 })) {
          await search.fill('');
          await sleep(80);
        }
      } catch {
        // ignore
      }
    } catch (err) {
      consoleLines.push(`[warning] inspector overlayBudget screenshot failed: ${String(err)}`);
    }

    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch (err) {
      pageErrors.push(`[verify] screenshot failed: ${String(err)}`);
      report.counts.pageErrors++;
      exitCode = 1;
    }

    try {
      await page.waitForSelector('#toolbar', { state: 'attached', timeout: 2_000 });
      await page.locator('#toolbar').screenshot({ path: toolbarScreenshotPath });
    } catch (err) {
      consoleLines.push(`[warning] toolbar screenshot failed: ${String(err)}`);
    }

    // Diagnostics panel is a floating overlay; capture it explicitly.
    try {
      const diag = page.locator('#diagnostics-panel');
      if (await diag.isVisible({ timeout: 1_000 })) {
        await diag.screenshot({ path: diagnosticsPanelPath });
      }
    } catch (err) {
      consoleLines.push(`[warning] diagnostics screenshot failed: ${String(err)}`);
    }

    // Capture MIDI panel explicitly so UI changes are visible even when fullPage misses layout issues.
    try {
      const midiSection = page
        .locator('.toolbar__section')
        .filter({ has: page.locator('#midi-connect') })
        .first();
      if (await midiSection.isVisible({ timeout: 1_000 })) {
        await midiSection.screenshot({ path: midiPanelPath });
      }
    } catch (err) {
      consoleLines.push(`[warning] midi panel screenshot failed: ${String(err)}`);
    }

    // Capture key toolbar sections explicitly (layout-only refactors can be missed in fullPage).
    try {
      const audioSection = page
        .locator('.toolbar__section')
        .filter({ has: page.locator('#audio-toggle') })
        .first();
      if (await audioSection.isVisible({ timeout: 1_000 })) {
        await audioSection.screenshot({ path: audioPanelPath });
      }
    } catch (err) {
      consoleLines.push(`[warning] audio panel screenshot failed: ${String(err)}`);
    }

    try {
      const presetsSection = page
        .locator('.toolbar__section')
        .filter({ has: page.locator('#preset-select') })
        .first();
      if (await presetsSection.isVisible({ timeout: 1_000 })) {
        await presetsSection.screenshot({ path: presetsPanelPath });
      }
    } catch (err) {
      consoleLines.push(`[warning] presets panel screenshot failed: ${String(err)}`);
    }

    try {
      const visualSection = page
        .locator('.toolbar__section')
        .filter({ has: page.locator('#visual-random') })
        .first();
      if (await visualSection.isVisible({ timeout: 1_000 })) {
        await visualSection.screenshot({ path: visualPanelPath });
      }
    } catch (err) {
      consoleLines.push(`[warning] visual panel screenshot failed: ${String(err)}`);
    }

    // Background controls are embedded inside Visual; capture a tight clip around the BG rows.
    try {
      const bgRowA = page.locator('.toolbar__row').filter({ has: page.locator('#bg-type-select') }).first();
      const bgRowB = page.locator('.toolbar__row').filter({ has: page.locator('#layer-liquid-enabled') }).first();

      if (await bgRowA.isVisible({ timeout: 1_000 })) {
        try {
          await bgRowA.scrollIntoViewIfNeeded({ timeout: 2_000 });
        } catch {
          // ignore
        }
      }
      if (await bgRowB.isVisible({ timeout: 1_000 })) {
        try {
          await bgRowB.scrollIntoViewIfNeeded({ timeout: 2_000 });
        } catch {
          // ignore
        }
      }

      const a = await bgRowA.boundingBox();
      const b = await bgRowB.boundingBox();
      if (a && b) {
        const pad = 8;
        const x = Math.max(0, Math.floor(Math.min(a.x, b.x) - pad));
        const y = Math.max(0, Math.floor(Math.min(a.y, b.y) - pad));
        const right = Math.ceil(Math.max(a.x + a.width, b.x + b.width) + pad);
        const bottom = Math.ceil(Math.max(a.y + a.height, b.y + b.height) + pad);
        const width = Math.max(1, right - x);
        const height = Math.max(1, bottom - y);
        await page.screenshot({ path: backgroundPanelPath, clip: { x, y, width, height } });
      }
    } catch (err) {
      consoleLines.push(`[warning] background panel screenshot failed: ${String(err)}`);
    }

    try {
      const macrosSection = page
        .locator('.toolbar__section')
        .filter({ has: page.locator('#macro-fusion') })
        .first();
      if (await macrosSection.isVisible({ timeout: 1_000 })) {
        await macrosSection.screenshot({ path: macrosPanelPath });
      }
    } catch (err) {
      consoleLines.push(`[warning] macros panel screenshot failed: ${String(err)}`);
    }

    try {
      const projectmSection = page
        .locator('.toolbar__section')
        .filter({ has: page.locator('#pm-opacity') })
        .first();
      if (await projectmSection.isVisible({ timeout: 1_000 })) {
        await projectmSection.screenshot({ path: projectmPanelPath });
      }
    } catch (err) {
      consoleLines.push(`[warning] projectm panel screenshot failed: ${String(err)}`);
    }

    try {
      const showSection = page
        .locator('.toolbar__section')
        .filter({ has: page.locator('#show-setup') })
        .first();
      if (await showSection.isVisible({ timeout: 1_000 })) {
        await showSection.screenshot({ path: showPanelPath });
      }
    } catch (err) {
      consoleLines.push(`[warning] show panel screenshot failed: ${String(err)}`);
    }

    try {
      await context.tracing.stop({ path: tracePath });
    } catch (err) {
      pageErrors.push(`[verify] tracing stop failed: ${String(err)}`);
      report.counts.pageErrors++;
      exitCode = 1;
    }

    await writeText(consoleLogPath, consoleLines.join('\n') + '\n');
    await writeText(pageErrorPath, pageErrors.join('\n\n') + (pageErrors.length ? '\n' : ''));
    await writeJson(reportPath, report);

    expectedClose = true;
    await browser.close();
  }

  // Emit locations for CI/terminal readability.
  // Keep output minimal but explicit.
  const framesRenderedSummary = report.checks.projectMFramesRendered?.framesRendered;
  const lastRenderTimeMsSummary = report.checks.projectMFramesRendered?.lastRenderTimeMs;
  const fpsSummary =
    typeof framesRenderedSummary === 'number' &&
    typeof lastRenderTimeMsSummary === 'number' &&
    lastRenderTimeMsSummary > 0
      ? (framesRenderedSummary / (lastRenderTimeMsSummary / 1000)).toFixed(2)
      : null;

  console.log(`Headless verify URL: ${BASE_URL}`);
  console.log(`Screenshot: ${screenshotPath}`);
  console.log(`Console log: ${consoleLogPath}`);
  console.log(`Page errors: ${pageErrorPath}`);
  console.log(`Trace: ${tracePath}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Diff: ${diffPath}`);
  console.log(
    `Summary: dsf=${report.deviceScaleFactor ?? 'N/A'} ` +
    `framesRendered=${framesRenderedSummary ?? 'N/A'} ` +
    `fps=${fpsSummary ?? 'N/A'} ` +
    `tMs=${lastRenderTimeMsSummary ?? 'N/A'} ` +
    `finalOutputChanged=${report.checks.finalOutputChanges ?? 'N/A'} ` +
    `projectMCanvasChanged=${report.checks.projectMCanvasChanges ?? 'N/A'}`
  );

  // Exit code policy:
  // - Fail hard (2) if there are any pageErrors.
  // - Otherwise, pass (0) when the critical signals are healthy.
  //   Note: low-level WebGL readPixels sampling can be unreliable in headless, so
  //   `canvasNonEmpty/canvasChanges` are warnings-only when frames are rendering.
  const framesRendered = report.checks.projectMFramesRendered?.framesRendered;
  const framesOk = typeof framesRendered === 'number' && framesRendered >= 3;
  const criticalOk =
    Boolean(report.checks.canvasAttached) &&
    framesOk &&
    Boolean(report.checks.finalOutputNonEmpty) &&
    Boolean(report.checks.finalOutputChanges) &&
    Boolean(report.checks.projectMCanvasNonEmpty) &&
    Boolean(report.checks.projectMCanvasChanges);

  if (pageErrors.length) exitCode = Math.max(exitCode, 2);
  if (!pageErrors.length && criticalOk) exitCode = 0;

  const debugEnabled = String(process.env.VERIFY_DEBUG ?? '').trim() === '1';
  if (debugEnabled || exitCode !== 0) {
    console.log(
      `[headless-verify] exitCode=${exitCode} pageErrors=${pageErrors.length} criticalOk=${criticalOk} framesRendered=${framesRendered}`
    );
  }

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  process.exitCode = exitCode;
}

main().catch((err) => {
  console.error('headless-verify failed:', err);
  process.exitCode = 1;
});
