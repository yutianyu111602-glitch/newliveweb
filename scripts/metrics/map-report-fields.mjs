import fs from 'node:fs';
import path from 'node:path';

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function getPath(obj, dotted) {
  const parts = dotted.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in cur) cur = cur[part];
    else return { ok: false, value: null };
  }
  return { ok: true, value: cur };
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function tryReadJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return readJson(filePath);
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
const reportPath = args[0] ?? 'artifacts/headless/report.json';
const outPath = args[1] ?? 'artifacts/headless/report-field-map.json';
const priorityPath = 'scripts/metrics/report-field-priority.json';

try {
  const report = readJson(reportPath);
  const priority = readJson(priorityPath);
  const rules = priority.rules ?? {};

  const selected = {};
  const missing = [];

  for (const [metric, candidates] of Object.entries(rules)) {
    let picked = null;
    for (const candidate of candidates) {
      const { ok, value } = getPath(report, candidate);
      if (ok && typeof value === 'number' && Number.isFinite(value)) {
        picked = { path: candidate, value };
        break;
      }
    }

    // Fallback: derive from artifacts/headless/frame-time.json when report.json doesn't expose perf percentiles.
    if (!picked && (metric === 'p95_frame_ms' || metric === 'jitter_p95_ms')) {
      const ft = tryReadJsonIfExists('artifacts/headless/frame-time.json');
      const p95 = typeof ft?.p95Ms === 'number' ? ft.p95Ms : null;
      const p50 = typeof ft?.p50Ms === 'number' ? ft.p50Ms : null;
      if (metric === 'p95_frame_ms' && p95 != null) {
        picked = { path: 'derived.frame-time.p95Ms', value: p95 };
      }
      if (metric === 'jitter_p95_ms' && p95 != null && p50 != null) {
        picked = { path: 'derived.frame-time.(p95Ms-p50Ms)', value: p95 - p50 };
      }
    }

    if (picked) selected[metric] = picked;
    else missing.push(metric);
  }

  const payload = {
    version: priority.version ?? 'unknown',
    reportPath,
    selected,
    missing,
  };

  ensureDir(outPath);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

  for (const [k, v] of Object.entries(selected)) {
    process.stdout.write(`${k}: ${v.path} = ${v.value}\n`);
  }
  if (missing.length) process.stdout.write(`missing: ${missing.join(', ')}\n`);

  process.exit(0);
} catch (err) {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
}
