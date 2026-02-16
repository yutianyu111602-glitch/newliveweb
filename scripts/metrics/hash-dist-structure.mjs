import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const distDir = process.argv[2] ?? 'dist';
const outPath = process.argv[3] ?? 'artifacts/headless/hash-dist-structure.json';

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function walk(dir) {
  const entries = [];
  if (!fs.existsSync(dir)) return entries;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of fs.readdirSync(cur)) {
      const full = path.join(cur, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) stack.push(full);
      else if (st.isFile()) {
        const rel = path.relative(distDir, full).split(path.sep).join('/');
        entries.push({ path: rel, size: st.size });
      }
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

try {
  const files = walk(distDir);
  const stable = JSON.stringify(files);
  const sha256 = crypto.createHash('sha256').update(stable).digest('hex');

  const payload = { distDir, sha256, filesCount: files.length, files };
  ensureDir(outPath);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  process.stdout.write(sha256 + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
}
