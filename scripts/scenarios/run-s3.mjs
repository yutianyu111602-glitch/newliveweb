import fs from 'node:fs';
import path from 'node:path';

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function countNonEmptyLines(p) {
  if (!fs.existsSync(p)) return 0;
  const text = fs.readFileSync(p, 'utf8');
  return text.split(/\r?\n/).filter(l => l.trim().length > 0).length;
}

function readMappedJitter() {
  const mapPath = 'artifacts/headless/report-field-map.json';
  if (!fs.existsSync(mapPath)) return null;
  try {
    const mapped = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const jitter = mapped.selected?.jitter_p95_ms?.value;
    return typeof jitter === 'number' ? jitter : null;
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
let seconds = 600;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seconds') seconds = Number(args[i + 1] ?? '600');
}

const outPath = 'artifacts/headless/scenario-s3.json';

try {
  const pageErrors = countNonEmptyLines('artifacts/headless/page-errors.log');
  const consoleErrors = (() => {
    const p = 'artifacts/headless/browser-console.log';
    if (!fs.existsSync(p)) return 0;
    const text = fs.readFileSync(p, 'utf8');
    return text.split(/\r?\n/).filter(l => l.includes('ERROR')).length;
  })();

  const payload = {
    scenario: 'S3',
    seconds,
    pageErrors,
    consoleErrors,
    jitter_p95_ms: readMappedJitter(),
    notes: [],
  };

  ensureDir(outPath);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
}
