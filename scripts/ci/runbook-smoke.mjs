import fs from 'node:fs';

const mustExist = [
  'docs/PLAN_V3_2026-02-15.md',
  'DOCS_INDEX.zh.md',
  'scripts/metrics/report-field-priority.json',
  'scripts/metrics/map-report-fields.mjs',
  'scripts/ci/validate-artifact-schema.mjs',
  'scripts/scenarios/run-s1.mjs',
  'scripts/scenarios/run-s2.mjs',
  'scripts/scenarios/run-s3.mjs',
  'scripts/rollback/create-snapshot.ps1',
  'scripts/rollback/restore-from-snapshot.ps1',
];

try {
  const missing = mustExist.filter(p => !fs.existsSync(p));
  const ok = missing.length === 0;
  process.stdout.write(JSON.stringify({ ok, missing }) + '\n');
  process.exit(ok ? 0 : 1);
} catch (err) {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
}
