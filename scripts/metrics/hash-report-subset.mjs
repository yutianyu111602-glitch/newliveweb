import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, stableSort(value[k])]));
  }
  return value;
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

const reportPath = process.argv[2] ?? 'artifacts/headless/report.json';
const mapPath = process.argv[3] ?? 'artifacts/headless/report-field-map.json';
const outPath = process.argv[4] ?? 'artifacts/headless/hash-report-subset.json';

try {
  const report = readJson(reportPath);

  let selected = {};
  if (fs.existsSync(mapPath)) {
    const mapped = readJson(mapPath);
    selected = mapped.selected ?? {};
  }

  const subset = {
    reportPath,
    selected,
    guards: {
      hasPageErrorsLog: fs.existsSync('artifacts/headless/page-errors.log'),
      hasConsoleLog: fs.existsSync('artifacts/headless/browser-console.log'),
      hasSelectionLog: fs.existsSync('logs/aivj-selection.log'),
    },
    reportKeysTop: Object.keys(report).sort().slice(0, 50),
  };

  const stable = stableSort(subset);
  const stableJson = JSON.stringify(stable);
  const digest = sha256(stableJson);

  const payload = { sha256: digest, subset: stable };
  ensureDir(outPath);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  process.stdout.write(digest + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
}
