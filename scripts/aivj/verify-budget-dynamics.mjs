import fs from "node:fs";
import path from "node:path";

const HARD_TIMEOUT_MS = Number(process.env.AIVJ_SCRIPT_TIMEOUT_MS ?? 120000);

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function readJsonIfExists(filePath) {
  const raw = readTextIfExists(filePath);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function uniq(nums) {
  return [...new Set(nums.map((n) => String(n)))].map((s) => Number(s)).filter((n) => Number.isFinite(n));
}

function parseAggressivenessSamples(logText) {
  if (!logText) return [];
  const samples = [...logText.matchAll(/\baggr=([0-9]+(?:\.[0-9]+)?)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  return uniq(samples);
}

function parseBatchSamples(logText) {
  if (!logText) return [];
  const samples = [...logText.matchAll(/\bbatch=(\d+)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  return uniq(samples);
}

function main() {
  const repoRoot = process.cwd();
  const reportPath = path.resolve(repoRoot, "artifacts", "headless", "report.json");
  const outPath = path.resolve(repoRoot, "artifacts", "headless", "budget-dynamics.json");

  const preloadLogPath = path.resolve(repoRoot, "logs", "preload.log");
  const fallbackConsoleLogPath = path.resolve(repoRoot, "artifacts", "headless", "browser-console.log");

  const result = {
    startedAt: new Date().toISOString(),
    ok: false,
    inputs: {
      reportPath,
      preloadLogPath,
      fallbackConsoleLogPath,
    },
    checks: {
      budgetDynamics: null,
      prefetchAggressivenessChanged: false,
      prefetchAggressivenessSamples: [],
      prefetchBatchSamples: [],
      levelChanged: false,
    },
    error: null,
  };

  const report = readJsonIfExists(reportPath);
  if (!report) {
    result.error = `Missing or invalid report.json at: ${reportPath} (run npm run verify:dev first)`;
  } else {
    const budgetDynamics = report?.checks?.budgetDynamics;
    result.checks.budgetDynamics = budgetDynamics ?? null;

    const preloadText = readTextIfExists(preloadLogPath) ?? readTextIfExists(fallbackConsoleLogPath);
    const aggrSamples = parseAggressivenessSamples(preloadText);
    const batchSamples = parseBatchSamples(preloadText);
    result.checks.prefetchAggressivenessSamples = aggrSamples;
    result.checks.prefetchBatchSamples = batchSamples;
    result.checks.prefetchAggressivenessChanged = aggrSamples.length >= 2;

    // Detect level changes from decisionLog (if present)
    const decisionLog = budgetDynamics?.before?.stats?.decisionLog;
    if (Array.isArray(decisionLog)) {
      result.checks.levelChanged = decisionLog.some((e) => String(e?.from ?? "") && String(e?.to ?? "") && e.from !== e.to);
    }

    const budgetOk = budgetDynamics?.ok === true;
    const prefetchOk = result.checks.prefetchAggressivenessChanged;
    result.ok = Boolean(budgetOk && prefetchOk);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");

  console.log(`[budget-dynamics] report written: ${outPath}`);
  console.log(
    `[budget-dynamics] budgetOk=${String(result?.checks?.budgetDynamics?.ok === true)} ` +
      `prefetchAggressivenessChanged=${String(result.checks.prefetchAggressivenessChanged)} ` +
      `aggrSamples=${JSON.stringify(result.checks.prefetchAggressivenessSamples)}`
  );

  if (!result.ok) {
    console.error(`[budget-dynamics] FAIL: ${result.error || "checks not satisfied"}`);
    process.exitCode = 2;
  } else {
    console.log(`[budget-dynamics] OK`);
    process.exitCode = 0;
  }
}

const timeoutId = Number.isFinite(HARD_TIMEOUT_MS) && HARD_TIMEOUT_MS > 0
  ? setTimeout(() => {
      console.error(`[budget-dynamics] timeout after ${HARD_TIMEOUT_MS}ms`);
      process.exit(2);
    }, HARD_TIMEOUT_MS)
  : null;

try {
  main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  if (timeoutId) clearTimeout(timeoutId);
  setTimeout(() => process.exit(process.exitCode ?? 0), 0);
}
