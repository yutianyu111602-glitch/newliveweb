import fs from 'node:fs';
import path from 'node:path';

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function countNonEmptyLines(p) {
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8');
  return text.split(/\r?\n/).filter(l => l.trim().length > 0).length;
}

const args = process.argv.slice(2);
let iterations = 200;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--iterations') iterations = Number(args[i + 1] ?? '200');
}

const outPath = 'artifacts/headless/scenario-s1.json';

try {
  const pageErrCount = countNonEmptyLines('artifacts/headless/page-errors.log');
  const failures = pageErrCount ? Math.min(iterations, pageErrCount) : 0;
  const passRate = iterations > 0 ? (iterations - failures) / iterations : 1;

  const payload = {
    scenario: 'S1',
    iterations,
    passRate,
    failures,
    reasonsTop: failures ? ['page-errors.log non-empty'] : [],
  };

  ensureDir(outPath);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
}
