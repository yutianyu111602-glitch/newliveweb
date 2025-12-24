import fs from "node:fs/promises";
import path from "node:path";

const SRC_DIR = path.resolve("node_modules", "@mediapipe", "selfie_segmentation");
const OUT_DIR = path.resolve("public", "vendor", "mediapipe", "selfie_segmentation");

const FILES = [
  "selfie_segmentation.js",
  "selfie_segmentation.tflite",
  "selfie_segmentation_landscape.tflite",
  "selfie_segmentation_solution_simd_wasm_bin.js",
  "selfie_segmentation_solution_simd_wasm_bin.wasm",
  "selfie_segmentation_solution_wasm_bin.js",
  "selfie_segmentation_solution_wasm_bin.wasm",
];

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(SRC_DIR))) {
    console.error(`[sync-mediapipe-assets] missing: ${SRC_DIR}`);
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  for (const file of FILES) {
    const src = path.join(SRC_DIR, file);
    const dst = path.join(OUT_DIR, file);
    if (!(await exists(src))) {
      console.warn(`[sync-mediapipe-assets] skip missing: ${src}`);
      continue;
    }
    await fs.copyFile(src, dst);
    console.log(`[sync-mediapipe-assets] copied: ${file}`);
  }

  console.log(`[sync-mediapipe-assets] done: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("[sync-mediapipe-assets] failed:", err);
  process.exitCode = 1;
});

