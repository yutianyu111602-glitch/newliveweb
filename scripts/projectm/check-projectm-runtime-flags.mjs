#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function boolToText(v) {
  return v ? "yes" : "no";
}

async function main() {
  const root = path.resolve(process.cwd());
  const jsPath = path.join(root, "public", "projectm-runtime", "projectm.js");
  const wasmPath = path.join(root, "public", "projectm-runtime", "projectm.wasm");

  const jsExists = await fs
    .access(jsPath)
    .then(() => true)
    .catch(() => false);
  const wasmExists = await fs
    .access(wasmPath)
    .then(() => true)
    .catch(() => false);

  console.log(`[projectm-runtime] root=${root}`);
  console.log(`[projectm-runtime] js=${jsPath} exists=${boolToText(jsExists)}`);
  console.log(`[projectm-runtime] wasm=${wasmPath} exists=${boolToText(wasmExists)}`);

  if (!jsExists) process.exit(2);

  const jsText = await fs.readFile(jsPath, "utf8");

  const hasCreate = jsText.includes("createProjectMModule");
  const hasDisable = jsText.includes("DISABLE_EXCEPTION_CATCHING");
  const hasNoDisable =
    jsText.includes("NO_DISABLE_EXCEPTION_CATCHING") ||
    jsText.includes("-sNO_DISABLE_EXCEPTION_CATCHING") ||
    jsText.includes("NO_DISABLE_EXCEPTION_CATCHING=1");
  const hasAllowed =
    jsText.includes("EXCEPTION_CATCHING_ALLOWED") ||
    jsText.includes("-sEXCEPTION_CATCHING_ALLOWED");
  const mentionsWebGL2 =
    jsText.toLowerCase().includes("webgl2") ||
    jsText.toLowerCase().includes("opengles");

  console.log(`[projectm-runtime] has createProjectMModule=${boolToText(hasCreate)}`);
  console.log(`[projectm-runtime] mentions DISABLE_EXCEPTION_CATCHING=${boolToText(hasDisable)}`);
  console.log(`[projectm-runtime] mentions NO_DISABLE_EXCEPTION_CATCHING=${boolToText(hasNoDisable)}`);
  console.log(`[projectm-runtime] mentions EXCEPTION_CATCHING_ALLOWED=${boolToText(hasAllowed)}`);
  console.log(`[projectm-runtime] mentions WebGL2/OpenGLES=${boolToText(mentionsWebGL2)}`);

  if (wasmExists) {
    const st = await fs.stat(wasmPath);
    console.log(
      `[projectm-runtime] wasm sizeMB=${(st.size / (1024 * 1024)).toFixed(2)} mtime=${st.mtime.toISOString()}`
    );
  }
}

main().catch((err) => {
  console.error("[projectm-runtime] failed:", err);
  process.exit(1);
});

