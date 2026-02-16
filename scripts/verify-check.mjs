import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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

function readNumberEnv(name, fallback) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

const artifactsDir = process.env.HEADLESS_ARTIFACTS_DIR
  ? path.resolve(process.env.HEADLESS_ARTIFACTS_DIR)
  : path.resolve("artifacts", "headless");

const projectRoot = path
  .dirname(fileURLToPath(import.meta.url))
  .replace(/\\/g, "/")
  .replace(/\/scripts$/, "");

const reportPath = path.join(artifactsDir, "report.json");
const pageErrorsPath = path.join(artifactsDir, "page-errors.log");
const consoleLogPath = path.join(artifactsDir, "browser-console.log");
const selectionLogPath = path.join(projectRoot, "logs", "aivj-selection.log");

// Schema/contract gate: validates minimal artifact shape and perf metrics.
// This is part of the Release hard gate.
const schemaScriptPath = path.join(projectRoot, "scripts", "ci", "validate-artifact-schema.mjs");
const schemaOutPath = path.join(artifactsDir, "schema-check.json");

if (!fs.existsSync(reportPath)) {
  fail(`Missing report.json at: ${reportPath} (run npm run verify:dev first)`);
  process.exit(1);
}

// Validate artifacts schema first so failures show up early.
try {
  const res = spawnSync(process.execPath, [schemaScriptPath, reportPath, schemaOutPath], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
    shell: false,
  });
  if (res.status !== 0) {
    fail(`artifact schema validation failed (see ${schemaOutPath})`);
  } else {
    ok(`artifact schema validation passed (see ${schemaOutPath})`);
  }
} catch (e) {
  fail(`failed to run artifact schema validation: ${String(e)}`);
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

// Verify selection IDs can be matched against run-manifest (prevents "matchedSelected=0" regressions).
try {
  const url = String(report?.url ?? "");
  if (url) {
    const parsedUrl = new URL(url);
    const runManifestUrl = String(parsedUrl.searchParams.get("runManifestUrl") ?? "").trim();
    const presetLibrarySource = String(
      parsedUrl.searchParams.get("presetLibrarySource") ?? ""
    ).trim();
    const shouldCheck = Boolean(runManifestUrl);
    if (shouldCheck) {
      // We only support local run-manifest for this gate.
      const looksLocal = runManifestUrl === "/run-manifest.json" || runManifestUrl.endsWith("/run-manifest.json");
      if (!looksLocal) {
        ok(`runManifestUrl is non-local (skipped selection match): ${runManifestUrl}`);
      } else {
        const selectionLog = readTextIfExists(selectionLogPath);
        if (selectionLog == null || !selectionLog.trim()) {
          fail(`Missing selection log at: ${selectionLogPath}`);
        } else {
          const manifestPath = path.join(projectRoot, "public", "run-manifest.json");
          const runManifest = readJson(manifestPath);
          const haveIds = new Set(
            Array.isArray(runManifest?.presets)
              ? runManifest.presets.map((p) => String(p?.presetId ?? "").trim()).filter(Boolean)
              : []
          );
          const selectedIds = selectionLog
            .split(/\r?\n/)
            .map((line) => {
              const m = String(line).match(/selected preset\s+([^\s\(]+)/i);
              return m ? String(m[1]).trim() : "";
            })
            .filter(Boolean);

          const uniqueSelected = new Set(selectedIds);
          const uniqueMatched = new Set(
            [...uniqueSelected].filter((id) => haveIds.has(id))
          );
          const selectedUniqueCount = uniqueSelected.size;
          const matchedUniqueCount = uniqueMatched.size;

          const minSelectedUnique = Math.max(
            1,
            Math.floor(readNumberEnv("VERIFY_SELECTION_MIN_SELECTED", 6))
          );
          const minSelectedUniquePrefix = Math.max(
            0,
            Math.floor(readNumberEnv("VERIFY_SELECTION_MIN_SELECTED_PREFIX", 5))
          );
          const minMatchedUnique = Math.max(
            0,
            Math.floor(readNumberEnv("VERIFY_SELECTION_MIN_MATCHED", 3))
          );
          const minMatchRatio = Math.max(
            0,
            Math.min(1, readNumberEnv("VERIFY_SELECTION_MIN_RATIO", 0.1))
          );

          const ratio =
            selectedUniqueCount > 0 ? matchedUniqueCount / selectedUniqueCount : 0;

          // If verify forces a specific run3 library, ensure we actually selected some presets
          // from that namespace (prevents silent fallback to built-ins/full-safe).
          let expectedPrefix = "";
          if (presetLibrarySource === "run3-crashsafe-15000") {
            expectedPrefix = "run3-crashsafe-15000-";
          }
          const selectedWithExpectedPrefix = expectedPrefix
            ? [...uniqueSelected].filter((id) => id.startsWith(expectedPrefix)).length
            : null;
          const matchedWithExpectedPrefix = expectedPrefix
            ? [...uniqueMatched].filter((id) => id.startsWith(expectedPrefix)).length
            : null;
          const minMatchedExpectedPrefix = expectedPrefix
            ? Math.max(
                0,
                Math.floor(readNumberEnv("VERIFY_SELECTION_MIN_MATCHED_PREFIX", 2))
              )
            : null;

          // When we expect a prefix, compute the ratio within that namespace.
          // Otherwise, the ratio can be diluted by built-ins (default/starfish/etc) and become noisy.
          const ratioWithinExpectedPrefix =
            expectedPrefix && typeof selectedWithExpectedPrefix === "number"
              ? selectedWithExpectedPrefix > 0
                ? (matchedWithExpectedPrefix ?? 0) / selectedWithExpectedPrefix
                : 0
              : null;
          const minMatchRatioWithinPrefix = expectedPrefix
            ? Math.max(
                0,
                Math.min(1, readNumberEnv("VERIFY_SELECTION_MIN_RATIO_PREFIX", 0.6))
              )
            : null;
          const nonPrefixSelectedCount = expectedPrefix
            ? [...uniqueSelected].filter((id) => !id.startsWith(expectedPrefix)).length
            : null;
          const maxNonPrefixSelected = expectedPrefix
            ? Math.max(
                0,
                Math.floor(readNumberEnv("VERIFY_SELECTION_MAX_NON_PREFIX", 6))
              )
            : null;

          if (selectedUniqueCount < minSelectedUnique) {
            const scope = expectedPrefix ? ` (expectedPrefix='${expectedPrefix}')` : "";
            fail(
              `Selection sample too small${scope} (uniqueSelected=${selectedUniqueCount}, min=${minSelectedUnique})`
            );
          } else if (
            expectedPrefix &&
            typeof selectedWithExpectedPrefix === "number" &&
            selectedWithExpectedPrefix < minSelectedUniquePrefix
          ) {
            fail(
              `Selection sample too small for expected prefix '${expectedPrefix}' (uniqueSelectedWithPrefix=${selectedWithExpectedPrefix}, min=${minSelectedUniquePrefix})`
            );
          } else if (!expectedPrefix && matchedUniqueCount < minMatchedUnique) {
            fail(
              `Selection IDs did not match run-manifest enough (uniqueMatched=${matchedUniqueCount}, min=${minMatchedUnique}, ratio=${ratio.toFixed(
                3
              )}, minRatio=${minMatchRatio})`
            );
          } else if (!expectedPrefix && ratio < minMatchRatio) {
            fail(
              `Selection match ratio too low (ratio=${ratio.toFixed(
                3
              )}, minRatio=${minMatchRatio}, uniqueMatched=${matchedUniqueCount}, uniqueSelected=${selectedUniqueCount})`
            );
          } else if (
            expectedPrefix &&
            typeof matchedWithExpectedPrefix === "number" &&
            typeof minMatchedExpectedPrefix === "number" &&
            matchedWithExpectedPrefix < minMatchedExpectedPrefix
          ) {
            fail(
              `Selection did not include enough '${expectedPrefix}*' presets (matchedWithPrefix=${matchedWithExpectedPrefix}, min=${minMatchedExpectedPrefix})`
            );
          } else if (
            expectedPrefix &&
            typeof ratioWithinExpectedPrefix === "number" &&
            typeof minMatchRatioWithinPrefix === "number" &&
            ratioWithinExpectedPrefix < minMatchRatioWithinPrefix
          ) {
            fail(
              `Selection match ratio within '${expectedPrefix}*' too low (ratio=${ratioWithinExpectedPrefix.toFixed(
                3
              )}, min=${minMatchRatioWithinPrefix})`
            );
          } else if (
            expectedPrefix &&
            typeof nonPrefixSelectedCount === "number" &&
            typeof maxNonPrefixSelected === "number" &&
            nonPrefixSelectedCount > maxNonPrefixSelected
          ) {
            fail(
              `Too many non-'${expectedPrefix}*' selections (nonPrefixUniqueSelected=${nonPrefixSelectedCount}, max=${maxNonPrefixSelected})`
            );
          } else {
            const extra = expectedPrefix
              ? `, uniqueSelectedWithPrefix=${selectedWithExpectedPrefix}, matchedWithPrefix=${matchedWithExpectedPrefix}, ratioWithinPrefix=${ratioWithinExpectedPrefix?.toFixed?.(3) ?? ratioWithinExpectedPrefix}, nonPrefixUniqueSelected=${nonPrefixSelectedCount}`
              : "";
            ok(
              `selection match OK (uniqueMatched=${matchedUniqueCount}, uniqueSelected=${selectedUniqueCount}, ratio=${ratio.toFixed(
                3
              )}${extra})`
            );
          }
        }
      }
    }
  }
} catch (e) {
  fail(`selection match check crashed: ${String(e)}`);
}

// ── Coupled A/B gate (opt-in) ─────────────────────────────────────────────
// When VERIFY_RUN_COUPLED_AB=1, run the coupled-pair quality A/B gate.
// This spawns two headless sessions (shuffle + weighted), collects [sel] logs,
// and calls ab-gate-coupled.ps1 to check lift thresholds.
const runCoupledAB = String(process.env.VERIFY_RUN_COUPLED_AB ?? "").trim() === "1";
if (runCoupledAB) {
  console.log("\n[verify-check] Coupled A/B gate enabled (VERIFY_RUN_COUPLED_AB=1)");

  const coupledPack = String(process.env.VERIFY_COUPLED_PACK ?? "ai_generated_coupled_final").trim();
  const selIters = String(process.env.VERIFY_SEL_ITERS ?? "120");
  const selDelay = String(process.env.VERIFY_SEL_DELAY_MS ?? "200");
  const hardTimeout = String(process.env.VERIFY_HARD_TIMEOUT_MS ?? "900000");

  const headlessScript = path.join(projectRoot, "scripts", "headless-verify.mjs");
  const shuffleLog = path.join(artifactsDir, "sel.shuffle.browser-console.log");
  const weightedLog = path.join(artifactsDir, "sel.weighted.browser-console.log");
  const gateScript = path.join(projectRoot, "scripts", "metrics", "ab-gate-coupled.ps1");

  const runArm = (pickMode, outLog) => {
    console.log(`[verify-check] Running coupled ${pickMode} arm ...`);
    const env = {
      ...process.env,
      VERIFY_SEL_ITERS: selIters,
      VERIFY_SEL_DELAY_MS: selDelay,
      VERIFY_HARD_TIMEOUT_MS: hardTimeout,
      HEADLESS_ARTIFACTS_DIR: artifactsDir,
    };
    const url = `http://localhost:5174/?coupled=1&coupledPack=${coupledPack}&coupledPick=${pickMode}`;
    const res = spawnSync(process.execPath, [headlessScript, url], {
      cwd: projectRoot,
      env,
      stdio: "inherit",
      windowsHide: true,
      shell: false,
      timeout: 1_200_000, // 20 min hard kill
    });
    // Copy the console log to the named output file for the gate.
    const srcLog = path.join(artifactsDir, "browser-console.log");
    if (fs.existsSync(srcLog)) {
      fs.copyFileSync(srcLog, outLog);
      console.log(`[verify-check] Saved ${pickMode} console log → ${path.basename(outLog)}`);
    } else {
      console.error(`[verify-check] WARN: browser-console.log missing after ${pickMode} run`);
    }
    return res.status === 0;
  };

  let armOk = true;
  armOk = runArm("shuffle", shuffleLog) && armOk;
  armOk = runArm("weighted", weightedLog) && armOk;

  if (!armOk) {
    fail("One or both coupled A/B headless arms failed (non-zero exit)");
  }

  // Run the gate script (PowerShell 5.1)
  if (fs.existsSync(shuffleLog) && fs.existsSync(weightedLog)) {
    console.log("[verify-check] Running ab-gate-coupled.ps1 ...");
    const gateRes = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", gateScript,
        "-Pack", coupledPack,
        "-ShuffleLog", shuffleLog,
        "-WeightedLog", weightedLog,
      ],
      {
        cwd: projectRoot,
        stdio: "inherit",
        windowsHide: true,
        shell: false,
        timeout: 120_000,
      }
    );
    if (gateRes.status !== 0) {
      fail("Coupled A/B gate FAILED (ab-gate-coupled.ps1 exited non-zero)");
    } else {
      ok("Coupled A/B gate PASSED");
    }
  } else {
    fail("Coupled A/B gate skipped — missing shuffle/weighted console logs");
  }
}

if (!process.exitCode) {
  ok(
    `artifacts look good (framesRendered=${framesRendered}, finalOutputChanges=${finalOutputChanges}, pmCanvasChanges=${pmCanvasChanges})`
  );
}
