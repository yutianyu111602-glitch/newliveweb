import fs from 'node:fs';

const planPath = 'docs/PLAN_V3_2026-02-15.md';
const indexPath = 'DOCS_INDEX.zh.md';

function mustContain(filePath, needle, errors) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.includes(needle)) errors.push(`${filePath} missing: ${needle}`);
}

try {
  const errors = [];
  if (!fs.existsSync(planPath)) errors.push(`missing ${planPath}`);
  if (!fs.existsSync(indexPath)) errors.push(`missing ${indexPath}`);

  if (errors.length === 0) {
    mustContain(planPath, 'Release 硬门禁（唯一发布阻断）', errors);
    mustContain(planPath, 'npm run verify:check', errors);
    mustContain(indexPath, 'docs/PLAN_V3_2026-02-15.md', errors);
  }

  const ok = errors.length === 0;
  const payload = { ok, errors };
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(ok ? 0 : 1);
} catch (err) {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
}
