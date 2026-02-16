#!/usr/bin/env node
// Quick test: Verify motion fix with 100 presets

import { spawn } from "node:child_process";

const args = [
  "c:/Users/pc/code/newliveweb/scripts/aivj/render-preset-frames.mjs",
  "--out", "d:/aidata/motion-fix-test",
  "--manifest", "C:/Users/pc/code/newliveweb/public/presets/run3-crashsafe-15000/library-manifest.json",
  "--width", "256",
  "--height", "144",
  "--out-size", "224",
  "--warmup-frames", "60",
  "--capture-count", "5",
  "--capture-every", "30",
  "--capture-max-frames", "100",
  "--frame-luma-min", "0.01",
  "--frame-luma-max", "0.99",
  "--frame-motion-min", "0.0005",
  "--timeout-ms", "30000",
  "--retry-times", "3",
  "--limit", "100",  // Only 100 presets for quick test
  "--log-every", "5",
  "--format", "webp",
  "--webpQuality", "0.92",
  "--time-mode", "fixedStep",
  "--fixed-step-fps", "30",
  "--prewarm",
  "--headless",
  "--sample-mode", "reservoir",
];

console.log("=== Motion Fix Test (100 presets) ===");
console.log("Output: d:/aidata/motion-fix-test");
console.log("Starting...\n");

const proc = spawn("node", args, { stdio: "inherit" });

proc.on("exit", (code) => {
  console.log(`\nTest completed with exit code ${code}`);
  process.exit(code ?? 0);
});
