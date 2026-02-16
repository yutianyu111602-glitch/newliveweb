// scripts/verify-check-with-ssot.mjs
// Wrapper: SSOT Docs Gate -> verify:check
import { spawnSync } from "node:child_process";
import path from "node:path";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const root = process.cwd();
run(process.execPath, [path.join(root, "scripts", "verify-docs-ssot.mjs")]);
run(process.execPath, [path.join(root, "scripts", "verify-check.mjs")]);
