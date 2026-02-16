import fs from 'node:fs';
import path from 'node:path';

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function getPath(obj, dotted) {
  const parts = String(dotted).split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in cur) cur = cur[part];
    else return { ok: false, value: null };
  }
  return { ok: true, value: cur };
}

function pickFirstNumber(report, candidates) {
  for (const candidate of candidates ?? []) {
    const { ok, value } = getPath(report, candidate);
    if (ok && typeof value === 'number' && Number.isFinite(value)) {
      return { path: candidate, value };
    }
  }
  return null;
}

function tryReadJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return readJson(filePath);
  } catch {
    return null;
  }
}

const reportPath = process.argv[2] ?? 'artifacts/headless/report.json';
const outPath = process.argv[3] ?? 'artifacts/headless/schema-check.json';
const requireSchemaVersion = process.env.REQUIRE_SCHEMA_VERSION === '1';

try {
  const report = readJson(reportPath);
  const priorityPath = 'scripts/metrics/report-field-priority.json';
  const priority = fs.existsSync(priorityPath) ? readJson(priorityPath) : null;
  const rules = priority?.rules ?? {};
  const errors = [];
  const warnings = [];

  if (!report || typeof report !== 'object') errors.push('report.json is not an object');

  if (!('schemaVersion' in report)) {
    const msg = 'schemaVersion missing';
    if (requireSchemaVersion) errors.push(msg);
    else warnings.push(msg);
  }

  // Minimal numeric metrics: must be able to read p95 and jitter.
  // Prefer report.json paths; fallback to artifacts/headless/frame-time.json which is already produced by headless verification.
  let p95 = pickFirstNumber(report, rules.p95_frame_ms);
  let jitter = pickFirstNumber(report, rules.jitter_p95_ms);
  if (!p95 || !jitter) {
    const ft = tryReadJsonIfExists('artifacts/headless/frame-time.json');
    const ftP95 = typeof ft?.p95Ms === 'number' && Number.isFinite(ft.p95Ms) ? ft.p95Ms : null;
    const ftP50 = typeof ft?.p50Ms === 'number' && Number.isFinite(ft.p50Ms) ? ft.p50Ms : null;
    if (!p95 && ftP95 != null) {
      p95 = { path: 'derived.frame-time.p95Ms', value: ftP95 };
      warnings.push('p95_frame_ms derived from artifacts/headless/frame-time.json');
    }
    if (!jitter && ftP95 != null && ftP50 != null) {
      jitter = { path: 'derived.frame-time.(p95Ms-p50Ms)', value: ftP95 - ftP50 };
      warnings.push('jitter_p95_ms derived from artifacts/headless/frame-time.json');
    }
  }
  if (!p95) errors.push('missing numeric p95_frame_ms (report.json paths and frame-time.json fallback failed)');
  if (!jitter) errors.push('missing numeric jitter_p95_ms (report.json paths and frame-time.json fallback failed)');

  // Minimal evidence: headless logs should exist after verify:dev
  const hasReport = fs.existsSync(reportPath);
  const hasConsole = fs.existsSync('artifacts/headless/browser-console.log');
  const hasPageErrors = fs.existsSync('artifacts/headless/page-errors.log');

  if (!hasReport) errors.push('missing artifacts/headless/report.json');
  if (!hasConsole) warnings.push('missing artifacts/headless/browser-console.log');
  if (!hasPageErrors) warnings.push('missing artifacts/headless/page-errors.log');

  const result = {
    ok: errors.length === 0,
    reportPath,
    requireSchemaVersion,
    selected: {
      p95_frame_ms: p95,
      jitter_p95_ms: jitter,
    },
    errors,
    warnings,
  };

  ensureDir(outPath);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  process.stdout.write(JSON.stringify(result) + '\n');

  process.exit(errors.length === 0 ? 0 : 1);
} catch (err) {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
}
