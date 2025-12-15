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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  const consoleLogPath = path.join(OUT_DIR, 'browser-console.log');
  const pageErrorPath = path.join(OUT_DIR, 'page-errors.log');
  const screenshotPath = path.join(OUT_DIR, 'screenshot.png');
  const toolbarScreenshotPath = path.join(OUT_DIR, 'toolbar.png');
  const vizCanvasAPath = path.join(OUT_DIR, 'viz-canvas-a.png');
  const vizCanvasBPath = path.join(OUT_DIR, 'viz-canvas-b.png');
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

  const resetForAttempt = (attempt) => {
    consoleLines.length = 0;
    pageErrors.length = 0;
    exitCode = 0;
    report.counts.console = 0;
    report.counts.pageErrors = 0;
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
    report.checks.projectMCanvasNonEmpty = null;
    report.checks.projectMCanvasChanges = null;
    report.checks.projectMCanvasSample = null;
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
      projectMCanvasNonEmpty: null,
      projectMCanvasChanges: null,
      projectMCanvasSample: null,
    },
    counts: {
      console: 0,
      pageErrors: 0,
    },
    artifacts: {
      screenshotPath,
      toolbarScreenshotPath,
      vizCanvasAPath,
      vizCanvasBPath,
      projectmCanvasAPath,
      projectmCanvasBPath,
      consoleLogPath,
      pageErrorPath,
      tracePath,
      reportPath,
    },
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

  const browser = await chromium.launch({ headless: true });
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
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 10_000 });
      if (resp && resp.ok()) break;
      lastError = new Error(`Non-OK response: ${resp?.status()} ${resp?.statusText()}`);
    } catch (err) {
      lastError = err;
    }
    if (pageClosed) break;
    await sleep(500);
  }
  if (lastError) {
    consoleLines.push(`[verify] navigate failed: ${String(lastError)}`);
  }

  let attemptSucceeded = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    resetForAttempt(attempt);
    try {
      // Wait for the app to at least attach the main canvas.
      // Use 'attached' instead of 'visible' to avoid false negatives if CSS/size is 0.
      await page.waitForSelector('#viz-canvas', { timeout: 30_000, state: 'attached' });
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

      // Validate the *final visible output* has content (not just ProjectM internals).
      // Use screenshot analysis of #viz-canvas, which is robust across WebGL backbuffers.
      try {
        const viz = page.locator('#viz-canvas');
        const bufA = await viz.screenshot({ path: vizCanvasAPath });
        await sleep(600);
        const bufB = await viz.screenshot({ path: vizCanvasBPath });

        const a = analyzePngForContent(bufA, { background: { r: 1, g: 2, b: 3 }, threshold: 12, grid: 64 });
        const b = analyzePngForContent(bufB, { background: { r: 1, g: 2, b: 3 }, threshold: 12, grid: 64 });

        report.checks.finalOutputSample = { a, b };

        // A small amount of non-background pixels is enough to prove “有内容”.
        // Keep this lenient to avoid false negatives on very dark presets.
        const nonEmpty = (a.nonBackgroundCount + b.nonBackgroundCount) >= 20;
        const changed = a.hash !== b.hash;

        report.checks.finalOutputNonEmpty = Boolean(nonEmpty);
        report.checks.finalOutputChanges = Boolean(changed);

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

      // Validate the ProjectM layer itself is animating by sampling the offscreen canvas.
      // The engine canvas is positioned off-screen, so temporarily move it on-screen for screenshotting.
      try {
        await page.evaluate(() => {
          const el = document.querySelector('#canvas');
          if (el instanceof HTMLCanvasElement) {
            (window).__verify_prev_projectm_style = el.getAttribute('style') || '';
            el.style.position = 'fixed';
            el.style.left = '0px';
            el.style.top = '0px';
            el.style.width = '320px';
            el.style.height = '180px';
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            el.style.zIndex = '9999';
          }
        });

        const pm = page.locator('#canvas');
        const pmA = await pm.screenshot({ path: projectmCanvasAPath });
        await sleep(600);
        const pmB = await pm.screenshot({ path: projectmCanvasBPath });

        const a = analyzePngForContent(pmA, { background: { r: 0, g: 0, b: 0 }, threshold: 18, grid: 64 });
        const b = analyzePngForContent(pmB, { background: { r: 0, g: 0, b: 0 }, threshold: 18, grid: 64 });
        report.checks.projectMCanvasSample = { a, b };

        const nonEmpty = (a.nonBackgroundCount + b.nonBackgroundCount) >= 10;
        const changed = a.hash !== b.hash;
        report.checks.projectMCanvasNonEmpty = Boolean(nonEmpty);
        report.checks.projectMCanvasChanges = Boolean(changed);

        if (!nonEmpty) {
          pageErrors.push(`[verify] ProjectM canvas appears empty: ${JSON.stringify({ a, b })}`);
          report.counts.pageErrors++;
          exitCode = 2;
        }
        if (!changed) {
          pageErrors.push(`[verify] ProjectM canvas did not change between samples: ${JSON.stringify({ a, b })}`);
          report.counts.pageErrors++;
          exitCode = 2;
        }
      } catch (err) {
        pageErrors.push(`[verify] ProjectM canvas screenshot analysis failed: ${String(err)}`);
        report.counts.pageErrors++;
        exitCode = 2;
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
      const anyNonEmpty = okSamples.some((s) => (s.nonZeroCount | 0) > 0);
      const anyChange = okSamples.some((s, idx) => idx > 0 && s.hash !== okSamples[idx - 1].hash);
      report.checks.canvasNonEmpty = Boolean(anyNonEmpty);
      report.checks.canvasChanges = Boolean(anyChange);

      const framesOk =
        Boolean(report.checks.projectMFramesRendered?.initialized) &&
        typeof report.checks.projectMFramesRendered?.framesRendered === 'number' &&
        report.checks.projectMFramesRendered.framesRendered >= 3;

      if (!framesOk) {
        pageErrors.push(`[verify] ProjectM engine not rendering frames: ${JSON.stringify(report.checks.projectMFramesRendered)}`);
        report.counts.pageErrors++;
        exitCode = 2;
      }

      if (!report.checks.canvasNonEmpty) {
        const msg = `[verify] canvas appears blank or unreadable: ${JSON.stringify(okSamples[0] ?? samples[0])}`;
        if (!framesOk) {
          pageErrors.push(msg);
          report.counts.pageErrors++;
          exitCode = 2;
        } else {
          consoleLines.push(`[warning] ${msg}`);
        }
      }
      if (!report.checks.canvasChanges) {
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
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch (err) {
      pageErrors.push(`[verify] screenshot failed: ${String(err)}`);
      report.counts.pageErrors++;
      exitCode = 1;
    }

    try {
      await page.locator('#toolbar').screenshot({ path: toolbarScreenshotPath });
    } catch (err) {
      pageErrors.push(`[verify] toolbar screenshot failed: ${String(err)}`);
      report.counts.pageErrors++;
      exitCode = 1;
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
  console.log(`Headless verify URL: ${BASE_URL}`);
  console.log(`Screenshot: ${screenshotPath}`);
  console.log(`Console log: ${consoleLogPath}`);
  console.log(`Page errors: ${pageErrorPath}`);
  console.log(`Trace: ${tracePath}`);
  console.log(`Report: ${reportPath}`);
  console.log(
    `Summary: framesRendered=${report.checks.projectMFramesRendered?.framesRendered ?? 'N/A'} ` +
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
  process.exitCode = exitCode;
}

main().catch((err) => {
  console.error('headless-verify failed:', err);
  process.exitCode = 1;
});
