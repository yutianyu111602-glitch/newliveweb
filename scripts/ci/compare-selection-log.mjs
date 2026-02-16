import fs from 'node:fs';
import crypto from 'node:crypto';

const filePath = process.argv[2] ?? 'logs/aivj-selection.log';

function sha256File(p) {
  const h = crypto.createHash('sha256');
  const buf = fs.readFileSync(p);
  h.update(buf);
  return h.digest('hex');
}

try {
  if (!fs.existsSync(filePath)) {
    process.stdout.write(JSON.stringify({ ok: false, error: `missing ${filePath}` }) + '\n');
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(Boolean).length;
  const digest = sha256File(filePath);

  process.stdout.write(JSON.stringify({ ok: true, path: filePath, lines, sha256: digest }) + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
}
