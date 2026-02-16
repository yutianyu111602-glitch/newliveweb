/**
 * Diagnostic script to verify preset switching is working correctly
 *
 * This script:
 * 1. Loads 3 different preset files
 * 2. Renders each one independently
 * 3. Logs preset content hash and rendering results
 * 4. Saves output to separate directories for visual comparison
 */

import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";

const PRESETS_TO_TEST = [
  {
    name: "preset1-mstress",
    path: "public/presets/run3-crashsafe-2000/Mstress - Flyin' In fireworks 3.24.milk"
  },
  {
    name: "preset2-aztro",
    path: "public/presets/run3-crashsafe-2000/AZTRO dirty eye.milk"
  },
  {
    name: "preset3-beta106",
    path: "public/presets/run3-crashsafe-2000/beta106i - Straight Tropical Coal (Amber).milk"
  }
];

const DEV_URL = "http://127.0.0.1:5174/preset-probe.html";
const OUT_DIR = "artifacts/aivj/diagnose-preset-switching";
const IMAGE_FORMAT = "png"; // Use PNG for easy local inspection (webp may not preview everywhere)
const HARD_TIMEOUT_MS = Number(process.env.AIVJ_SCRIPT_TIMEOUT_MS ?? 240000);

async function main() {
  console.log("==============================================");
  console.log("  PRESET SWITCHING DIAGNOSTIC TEST");
  console.log("==============================================\n");

  // Create output directory
  await fs.mkdir(OUT_DIR, { recursive: true });

  // Launch browser ONCE
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const results = [];

  for (let i = 0; i < PRESETS_TO_TEST.length; i++) {
    const preset = PRESETS_TO_TEST[i];
    console.log(`\n[${i + 1}/${PRESETS_TO_TEST.length}] Testing: ${preset.name}`);
    console.log("=".repeat(50));

    // Create NEW PAGE for each preset (fresh environment)
    const page = await context.newPage();

    // Capture console logs for debugging
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      // Print important debug messages
      if (text.includes('[ProjectMEngine]') || text.includes('[presetFrameDump]')) {
        console.log(`    BROWSER: ${text}`);
      }
    });

    try {
      // Navigate to probe page
      await page.goto(DEV_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Load preset content
      const presetPath = path.resolve(preset.path);
      const presetContent = await fs.readFile(presetPath, "utf8");

      // Log preset info
      const contentHash = hashString(presetContent).slice(0, 16);
      const firstLine = presetContent.split('\n')[0].slice(0, 50);
      console.log(`  Content hash: ${contentHash}`);
      console.log(`  First line: ${firstLine}...`);
      console.log(`  Content length: ${presetContent.length} chars`);

      // Inject dump function
      await page.evaluate(async () => {
        if (typeof globalThis.__nw_dumpPresetFrames !== "function") {
          const mod = await import("/src/features/presets/presetFrameDump.ts");
          globalThis.__nw_dumpPresetFrames = mod.dumpPresetFrames;
        }
      });

      // Call dump function with preset data
      console.log(`  Rendering...`);
      const result = await page.evaluate(async (data) => {
        const fn = globalThis.__nw_dumpPresetFrames;
        if (typeof fn !== "function") {
          return { ok: false, error: "dump function not available" };
        }
        return await fn(data);
      }, {
        presetData: presetContent,
        width: 256,
        height: 144,
        warmupFrames: 60,
        captureCount: 3,
        captureEvery: 30,
        timeoutMs: 30000,
        outSize: 224,
        format: IMAGE_FORMAT,
        timeMode: "fixedStep",
        fixedStepFps: 30,
        forceNewWasmModule: false,
        audio: "synthetic"
      });

      if (!result.ok) {
        console.log(`  ❌ FAILED: ${result.reasons?.join(", ") || "unknown"}`);
        results.push({ preset: preset.name, status: "failed", error: result.reasons });
        continue;
      }

      const metrics = result.metrics || {};
      console.log(`  ✅ SUCCESS`);
      console.log(`    Frames captured: ${result.frames?.length || 0}`);
      console.log(`    avgLuma: ${metrics.avgLuma?.toFixed(3) || "N/A"}`);
      console.log(`    motion: ${metrics.motion?.toFixed(4) || "N/A"}`);

      // Save frames to disk
      const presetOutDir = path.join(OUT_DIR, preset.name);
      await fs.mkdir(presetOutDir, { recursive: true });

      if (result.frames && Array.isArray(result.frames)) {
        for (let j = 0; j < result.frames.length; j++) {
          const frame = result.frames[j];
          const mime = frame?.mime || "";
          const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "bin";
          const framePath = path.join(presetOutDir, `frame-${j}.${ext}`);
          const b64Data = frame?.b64;
          const buffer = Buffer.from(b64Data, 'base64');
          await fs.writeFile(framePath, buffer);
        }
        console.log(`    Saved to: ${presetOutDir}`);
      }

      results.push({
        preset: preset.name,
        status: "success",
        contentHash,
        metrics
      });

    } catch (error) {
      console.log(`  ❌ ERROR: ${error?.message || String(error)}`);
      results.push({ preset: preset.name, status: "error", error: error?.message || String(error) });
    } finally {
      // Close page after each preset
      await page.close();
    }
  }

  await browser.close();

  // Print summary
  console.log("\n==============================================");
  console.log("  SUMMARY");
  console.log("==============================================\n");

  const successful = results.filter(r => r.status === "success");
  console.log(`Total presets tested: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${results.length - successful.length}\n`);

  if (successful.length >= 2) {
    console.log("Metrics comparison:");
    successful.forEach(r => {
      console.log(`  ${r.preset}:`);
      console.log(`    contentHash: ${r.contentHash}`);
      console.log(`    avgLuma: ${r.metrics?.avgLuma?.toFixed(3)}`);
      console.log(`    motion: ${r.metrics?.motion?.toFixed(4)}`);
    });

    // Check if metrics are too similar (indicating preset didn't switch)
    const lumas = successful.map(r => r.metrics?.avgLuma).filter(Boolean);
    const motions = successful.map(r => r.metrics?.motion).filter(Boolean);

    if (lumas.length >= 2) {
      const lumaRange = Math.max(...lumas) - Math.min(...lumas);
      const motionRange = Math.max(...motions) - Math.min(...motions);

      console.log(`\nMetric ranges:`);
      console.log(`  avgLuma range: ${lumaRange.toFixed(3)} ${lumaRange > 0.1 ? "✅" : "⚠️"}`);
      console.log(`  motion range: ${motionRange.toFixed(4)} ${motionRange > 0.01 ? "✅" : "⚠️"}`);

      if (lumaRange < 0.1 && motionRange < 0.01) {
        console.log(`\n❌ WARNING: Metrics are too similar! Presets may not be switching correctly.`);
      } else {
        console.log(`\n✅ Metrics show variation - presets appear to be switching.`);
      }
    }
  }

  console.log(`\nOutput saved to: ${path.resolve(OUT_DIR)}`);
  console.log("Visually inspect the frames in each subdirectory to confirm differences.\n");
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

const timeoutId = Number.isFinite(HARD_TIMEOUT_MS) && HARD_TIMEOUT_MS > 0
  ? setTimeout(() => {
      console.error(`[diagnose] timeout after ${HARD_TIMEOUT_MS}ms`);
      process.exit(2);
    }, HARD_TIMEOUT_MS)
  : null;

Promise.resolve()
  .then(() => main())
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
    setTimeout(() => process.exit(process.exitCode ?? 0), 0);
  });
