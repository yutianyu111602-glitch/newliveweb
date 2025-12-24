import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`[verify-check] FAIL: ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`[verify-check] OK: ${message}`);
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

const artifactsDir = process.env.HEADLESS_ARTIFACTS_DIR
  ? path.resolve(process.env.HEADLESS_ARTIFACTS_DIR)
  : path.resolve("artifacts", "headless");

const reportPath = path.join(artifactsDir, "report.json");
const pageErrorsPath = path.join(artifactsDir, "page-errors.log");
const consoleLogPath = path.join(artifactsDir, "browser-console.log");

if (!fs.existsSync(reportPath)) {
  fail(`Missing report.json at: ${reportPath} (run npm run verify:dev first)`);
  process.exit(1);
}

let report;
try {
  report = readJson(reportPath);
} catch (e) {
  fail(`Failed to parse report.json: ${String(e)}`);
  process.exit(1);
}

const checks = report?.checks;
if (!checks || typeof checks !== "object") {
  fail(`report.json missing .checks object`);
  process.exit(1);
}

const framesRendered = Number(
  checks?.projectMFramesRendered?.framesRendered ?? NaN
);
const pmInitialized = Boolean(checks?.projectMFramesRendered?.initialized);
const finalOutputNonEmpty = Boolean(checks?.finalOutputNonEmpty);
const finalOutputChanges = Boolean(checks?.finalOutputChanges);
const pmCanvasNonEmpty = checks?.projectMCanvasNonEmpty;
const pmCanvasChanges = checks?.projectMCanvasChanges;
const perfCapsOk = checks?.perfCaps?.ok;
const aivjAccentOk = checks?.aivjAccent?.ok;
const audioDrivePresetsOk = checks?.audioDrivePresets?.ok;
const presetLoadSheddingOk = checks?.presetLoadShedding?.ok;

if (!pmInitialized) fail(`ProjectM not initialized (checks.projectMFramesRendered.initialized=false)`);
if (!Number.isFinite(framesRendered) || framesRendered <= 0) {
  fail(`framesRendered must be > 0 (got ${String(framesRendered)})`);
}
if (!finalOutputNonEmpty) fail(`finalOutputNonEmpty=false`);
if (!finalOutputChanges) fail(`finalOutputChanges=false`);
// These can legitimately be null when the headless verifier cannot reliably sample
// the ProjectM canvas (e.g., platform/driver limitations). Treat null as N/A.
if (pmCanvasNonEmpty === false) fail(`projectMCanvasNonEmpty=false`);
if (pmCanvasChanges === false) fail(`projectMCanvasChanges=false`);
if (perfCapsOk !== true) {
  fail(
    `perfCaps.ok=${String(perfCapsOk)} (${checks?.perfCaps?.error ?? "no error"})`
  );
}
if (aivjAccentOk !== true) {
  fail(
    `aivjAccent.ok=${String(aivjAccentOk)} (${checks?.aivjAccent?.error ?? "no error"})`
  );
}
if (audioDrivePresetsOk !== true) {
  fail(
    `audioDrivePresets.ok=${String(audioDrivePresetsOk)} (${checks?.audioDrivePresets?.error ?? "no error"})`
  );
}
if (presetLoadSheddingOk !== true) {
  fail(
    `presetLoadShedding.ok=${String(presetLoadSheddingOk)} (${checks?.presetLoadShedding?.error ?? "no error"})`
  );
}

// page-errors.log should be empty.
const pageErrors = readTextIfExists(pageErrorsPath);
if (pageErrors == null) {
  ok(`page-errors.log missing (treated as OK): ${pageErrorsPath}`);
} else if (pageErrors.trim().length > 0) {
  fail(`page-errors.log is not empty (see ${pageErrorsPath})`);
}

// Fail on explicit [error] lines in browser console log.
const consoleLog = readTextIfExists(consoleLogPath);
if (consoleLog != null) {
  const errorLines = consoleLog
    .split(/\r?\n/)
    .filter((line) => /^\[error\]/i.test(line.trim()))
    .slice(0, 20);

  if (errorLines.length) {
    fail(`browser-console.log contains [error] lines (first ${errorLines.length} shown)`);
    for (const line of errorLines) console.error(`  ${line}`);
  }
}

if (!process.exitCode) {
  ok(
    `artifacts look good (framesRendered=${framesRendered}, finalOutputChanges=${finalOutputChanges}, pmCanvasChanges=${pmCanvasChanges})`
  );
}
