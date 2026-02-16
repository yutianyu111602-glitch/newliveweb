import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const srcRoot = path.join(projectRoot, "src");

process.chdir(projectRoot);
process.env.NODE_ENV = "test";

const vitestBin = path.join(projectRoot, "node_modules", "vitest", "vitest.mjs");

function collectTestFiles(dirPath, files = []) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function hasTests(filePath) {
  const content = readFileSync(filePath, "utf8");
  return /\b(describe|it|test)\s*\(/.test(content);
}

const testFiles = collectTestFiles(srcRoot);
const runnable = [];
const skipped = [];

for (const file of testFiles) {
  if (hasTests(file)) {
    runnable.push(file);
  } else {
    skipped.push(file);
  }
}

if (!runnable.length) {
  console.error("No runnable test files found.");
  process.exit(1);
}

let failed = false;
for (const file of runnable) {
  console.log(`\n[vitest] ${path.relative(projectRoot, file)}`);
  const childEnv = { ...process.env };
  delete childEnv.NODE_OPTIONS;
  const result = spawnSync(
    process.execPath,
    [
      vitestBin,
      "run",
      "--config",
      path.join(projectRoot, "vitest.config.ts"),
      "--root",
      projectRoot,
      file,
    ],
    { stdio: "inherit", env: childEnv },
  );
  if (result.status !== 0) {
    failed = true;
  }
}

if (skipped.length) {
  console.warn("\nSkipped empty test files:");
  skipped.forEach((file) => console.warn(`- ${path.relative(projectRoot, file)}`));
}

process.exit(failed ? 1 : 0);
