import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

function sha256File(p) {
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

const outPath = process.argv[2] ?? 'artifacts/headless/snapshot-points.json';

try {
  const payload = {
    timestamp: new Date().toISOString(),
    evidence: {
      report: sha256File('artifacts/headless/report.json'),
      reportSubset: sha256File('artifacts/headless/hash-report-subset.json'),
      pageErrors: sha256File('artifacts/headless/page-errors.log'),
      consoleLog: sha256File('artifacts/headless/browser-console.log'),
      selectionLog: sha256File('logs/aivj-selection.log'),
    },
  };

  ensureDir(outPath);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
}
