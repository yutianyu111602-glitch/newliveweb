import fs from "node:fs/promises";
import path from "node:path";

const SRC_DIR = path.resolve("node_modules", "essentia.js", "dist");
const OUT_DIR = path.resolve("public", "vendor", "essentia");

const FILES = ["essentia-wasm.web.js", "essentia-wasm.web.wasm"];

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
    console.error(`[sync-essentia-assets] missing: ${SRC_DIR}`);
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  for (const file of FILES) {
    const src = path.join(SRC_DIR, file);
    const dst = path.join(OUT_DIR, file);
    if (!(await exists(src))) {
      console.warn(`[sync-essentia-assets] skip missing: ${src}`);
      continue;
    }
    await fs.copyFile(src, dst);
    console.log(`[sync-essentia-assets] copied: ${file}`);
  }

  console.log(`[sync-essentia-assets] done: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("[sync-essentia-assets] failed:", err);
  process.exitCode = 1;
});

