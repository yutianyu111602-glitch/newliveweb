import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const out = { log: 'logs/preload.log', json: '' };
  for (const raw of argv.slice(2)) {
    const a = String(raw);
    if (a.startsWith('--log=')) out.log = a.slice('--log='.length);
    else if (a.startsWith('--json=')) out.json = a.slice('--json='.length);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function quantile(sorted, p) {
  const n = sorted.length;
  if (!n) return null;
  const x = (n - 1) * p;
  const lo = Math.floor(x);
  const hi = Math.ceil(x);
  const w = x - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function buildHistogram(values, edges) {
  const hist = {};
  for (let i = 0; i < edges.length - 1; i++) {
    hist[`[${edges[i]},${edges[i + 1]})`] = 0;
  }
  hist[`[${edges[edges.length - 1]},+)`] = 0;

  for (const v of values) {
    let placed = false;
    for (let i = 0; i < edges.length - 1; i++) {
      if (v >= edges[i] && v < edges[i + 1]) {
        hist[`[${edges[i]},${edges[i + 1]})`]++;
        placed = true;
        break;
      }
    }
    if (!placed) hist[`[${edges[edges.length - 1]},+)`]++;
  }
  return hist;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('=== frame-time 统计 ===');
    console.log('用法:');
    console.log('  node scripts/aivj/stat-frame-time.mjs --log=logs/preload.log');
    console.log('  node scripts/aivj/stat-frame-time.mjs --log=... --json=artifacts/headless/frame-time.json');
    process.exitCode = 0;
    return;
  }

  const logPath = path.resolve(args.log);
  const text = await fs.readFile(logPath, 'utf8');

  const values = [];
  for (const m of text.matchAll(/frame-time\s+(\d+(?:\.\d+)?)ms/g)) {
    const v = Number(m[1]);
    if (Number.isFinite(v)) values.push(v);
  }

  values.sort((a, b) => a - b);
  const n = values.length;

  const result = {
    log: args.log,
    n,
    minMs: n ? values[0] : null,
    maxMs: n ? values[n - 1] : null,
    p50Ms: quantile(values, 0.5),
    p90Ms: quantile(values, 0.9),
    p95Ms: quantile(values, 0.95),
    p99Ms: quantile(values, 0.99),
    histogram: buildHistogram(values, [0, 16, 33, 50, 66, 83, 100, 117, 133, 150, 200, 300, 500, 1000]),
  };

  console.log('=== frame-time 统计 ===');
  console.log(`[INFO] log=${args.log} samples=${result.n}`);
  console.log(`min=${result.minMs}ms p50=${result.p50Ms?.toFixed?.(1) ?? result.p50Ms}ms p90=${result.p90Ms?.toFixed?.(1) ?? result.p90Ms}ms p95=${result.p95Ms?.toFixed?.(1) ?? result.p95Ms}ms p99=${result.p99Ms?.toFixed?.(1) ?? result.p99Ms}ms max=${result.maxMs}ms`);
  console.log('histogram (ms buckets -> count):');
  for (const [k, v] of Object.entries(result.histogram)) {
    if (v) console.log(`  ${k}: ${v}`);
  }

  if (args.json) {
    const outPath = path.resolve(args.json);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    console.log(`[OK] wrote ${args.json}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
