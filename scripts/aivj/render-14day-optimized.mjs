#!/usr/bin/env node

/**
 * 14-Day Optimized Preset Rendering Pipeline
 *
 * Based on data analysis from baseline run:
 * - 15.36% motion=0 -> Fixed by capturing prevGray in warmup
 * - 12.46% luma=0 -> Filter black screens
 * - 39.48% filtered by strict thresholds -> Relaxed to 0.01/0.0005
 *
 * Target: Maximum quality dataset for LoRA training
 * Duration: Up to 14 days (336 hours)
 * Quality: Prioritize completeness over speed
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  // Output configuration
  outDir: "d:/aidata/14day-techno-optimized-v1",
  logFile: "d:/aidata/14day-techno-optimized-v1/render.log",

  // Source configuration
  manifestPath: "C:/Users/pc/code/newliveweb/public/presets/run3-crashsafe-15000/library-manifest.json",

  // Quality thresholds (relaxed based on data analysis)
  width: 256,
  height: 144,
  outSize: 224,
  warmupFrames: 60,        // Ensure motion calculation has prevGray
  captureCount: 5,         // 5 frames per preset
  captureEvery: 30,        // Every 30 frames (1 second at 30fps)
  captureMaxFrames: 100,   // Max 100 frames to select from (for quality filtering)

  // Relaxed quality thresholds
  frameLumaMin: 0.01,      // Only filter pure black (was 0.06)
  frameLumaMax: 0.99,      // Only filter pure white (was 0.96)
  frameLumaTarget: 0.35,   // Target mid-brightness
  frameMotionMin: 0.0005,  // 5x more lenient (was 0.002)
  frameMotionTarget: 0.05, // Target moderate motion

  // Timeout configuration (generous for complex presets)
  timeoutMs: 30000,        // 30s per preset (was 20s)
  retryTimes: 3,           // 3 retries (was 2)

  // Audio configuration
  audioBpm: 128,
  audioBpmMin: 120,
  audioBpmMax: 140,
  audioSwing: 0.15,
  audioKickBoost: 1.0,
  audioHatBoost: 0.8,
  audioClapBoost: 0.7,
  audioBassBoost: 0.85,

  // Performance configuration
  refreshEvery: 500,       // Refresh browser every 500 presets
  logEvery: 10,            // Log every 10 presets
  checkpointEvery: 1000,   // Checkpoint every 1000 presets

  // Watchdog (very generous limits)
  watchdogIdleMs: 60000,   // 60s idle timeout
  watchdogMaxPresetMs: 120000, // 120s max per preset

  // Other
  format: "webp",
  webpQuality: 0.92,
  timeMode: "fixedStep",
  fixedStepFps: 30,
  prewarm: true,
  prewarmTimeoutMs: 90000,
  headless: true,

  // Sampling
  sampleMode: "reservoir",
  sampleSize: 130000,      // All presets
  limit: null,             // No limit
  stopAfterSec: null,      // No time limit
};

console.log("=== 14-Day Optimized Rendering Configuration ===");
console.log(`Output: ${config.outDir}`);
console.log(`Expected presets: ~130,000`);
console.log(`Expected duration: Up to 14 days`);
console.log(`Quality mode: Maximum (relaxed thresholds, generous timeouts)`);
console.log("\nQuality thresholds:");
console.log(`  Luma: ${config.frameLumaMin} - ${config.frameLumaMax}`);
console.log(`  Motion: >=${config.frameMotionMin}`);
console.log(`  Timeout: ${config.timeoutMs}ms (retry ${config.retryTimes}x)`);
console.log("\nStarting in 5 seconds...\n");

await new Promise(resolve => setTimeout(resolve, 5000));

const scriptPath = path.join(__dirname, "render-preset-frames.mjs");
const args = [
  scriptPath,
  "--out", config.outDir,
  "--manifest", config.manifestPath,
  "--log-file", config.logFile,

  "--width", config.width.toString(),
  "--height", config.height.toString(),
  "--out-size", config.outSize.toString(),

  "--warmup-frames", config.warmupFrames.toString(),
  "--capture-count", config.captureCount.toString(),
  "--capture-every", config.captureEvery.toString(),
  "--capture-max-frames", config.captureMaxFrames.toString(),

  "--frame-luma-min", config.frameLumaMin.toString(),
  "--frame-luma-max", config.frameLumaMax.toString(),
  "--frame-luma-target", config.frameLumaTarget.toString(),
  "--frame-motion-min", config.frameMotionMin.toString(),
  "--frame-motion-target", config.frameMotionTarget.toString(),

  "--timeout-ms", config.timeoutMs.toString(),
  "--retry-times", config.retryTimes.toString(),

  "--audio-bpm", config.audioBpm.toString(),
  "--audio-bpm-min", config.audioBpmMin.toString(),
  "--audio-bpm-max", config.audioBpmMax.toString(),
  "--audio-swing", config.audioSwing.toString(),
  "--audio-kick-boost", config.audioKickBoost.toString(),
  "--audio-hat-boost", config.audioHatBoost.toString(),
  "--audio-clap-boost", config.audioClapBoost.toString(),
  "--audio-bass-boost", config.audioBassBoost.toString(),

  "--refresh-every", config.refreshEvery.toString(),
  "--log-every", config.logEvery.toString(),
  "--checkpoint-every", config.checkpointEvery.toString(),

  "--watchdog-idle-ms", config.watchdogIdleMs.toString(),
  "--watchdog-max-preset-ms", config.watchdogMaxPresetMs.toString(),

  "--format", config.format,
  "--webp-quality", config.webpQuality.toString(),
  "--time-mode", config.timeMode,
  "--fixed-step-fps", config.fixedStepFps.toString(),

  "--prewarm",
  "--prewarm-timeout-ms", config.prewarmTimeoutMs.toString(),

  "--sample-mode", config.sampleMode,
  "--sample-size", config.sampleSize.toString(),
];

if (config.headless) args.push("--headless");

const proc = spawn("node", args, {
  stdio: "inherit",
  cwd: __dirname,
});

proc.on("exit", (code) => {
  console.log(`\n=== Rendering completed with exit code ${code} ===`);
  process.exit(code ?? 0);
});

proc.on("error", (err) => {
  console.error("Failed to start rendering:", err);
  process.exit(1);
});
