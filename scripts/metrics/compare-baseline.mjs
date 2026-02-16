import fs from 'node:fs';

function readJson(p) {
  let text = fs.readFileSync(p, 'utf8');
  // PowerShell 5.1 `Set-Content -Encoding UTF8` writes BOM; JSON.parse can't handle it.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

function pctChange(baseline, current) {
  if (baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

const baselinePath = process.argv[2] ?? 'artifacts/headless/baseline-summary.json';
const mapPath = process.argv[3] ?? 'artifacts/headless/report-field-map.json';

try {
  const base = readJson(baselinePath);
  const mapped = readJson(mapPath);

  const bP95 = base?.median?.p95_frame_ms;
  const bJit = base?.median?.jitter_p95_ms;
  const cP95 = mapped?.selected?.p95_frame_ms?.value;
  const cJit = mapped?.selected?.jitter_p95_ms?.value;

  const payload = {
    baseline: { p95_frame_ms: bP95, jitter_p95_ms: bJit },
    current: { p95_frame_ms: cP95, jitter_p95_ms: cJit },
    pct: {
      p95_frame_ms: (typeof bP95 === 'number' && typeof cP95 === 'number') ? pctChange(bP95, cP95) : null,
      jitter_p95_ms: (typeof bJit === 'number' && typeof cJit === 'number') ? pctChange(bJit, cJit) : null,
    },
  };

  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
}
