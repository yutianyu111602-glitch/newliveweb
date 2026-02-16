#!/usr/bin/env node
/**
 * report-coupled-pack-style:
 * Quick stats to explain why a coupled pack looks visually "same-ish".
 *
 * This intentionally avoids any WebGL/headless work. It only reads `.milk` text
 * and computes simple feature counts (per_frame/per_pixel, wave rgb, shapes).
 *
 * Usage:
 *   node scripts/report-coupled-pack-style.mjs --pack ai_generated_coupled_final --sampleN 200
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

function parseArgs(argv) {
  const out = { pack: 'ai_generated_coupled_final', sampleN: 200, out: '', positionals: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--pack') {
      out.pack = String(argv[i + 1] ?? out.pack).trim() || out.pack;
      i += 1;
      continue;
    }
    if (a === '--sampleN') {
      out.sampleN = Math.max(10, Math.floor(Number(argv[i + 1] ?? out.sampleN)));
      i += 1;
      continue;
    }
    if (a === '--out') {
      out.out = String(argv[i + 1] ?? '').trim();
      i += 1;
      continue;
    }
    if (a === '--help' || a === '-h') {
      out.help = true;
      continue;
    }
    out.positionals.push(a);
  }
  return out;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function sampleArray(arr, n) {
  if (arr.length <= n) return arr.slice();
  const out = [];
  const used = new Set();
  while (out.length < n) {
    const idx = Math.floor(Math.random() * arr.length);
    if (used.has(idx)) continue;
    used.add(idx);
    out.push(arr[idx]);
  }
  return out;
}

function analyzeMilkText(text) {
  const hasPerFrame = /\bper_frame\s*=/i.test(text);
  const hasPerPixel = /\bper_pixel\s*=/i.test(text);
  const hasShape0Enabled1 = /\bshapecode_0_enabled\s*=\s*1\b/i.test(text);

  let waveMatches = 0;
  let waveNonZero = 0;
  const reWave = /\bwave_(r|g|b)\s*=\s*([+-]?\d+(?:\.\d+)?)/gi;
  for (;;) {
    const m = reWave.exec(text);
    if (!m) break;
    const v = Number(m[2]);
    if (!Number.isFinite(v)) continue;
    waveMatches += 1;
    if (Math.abs(v) > 1e-6) waveNonZero += 1;
  }

  return {
    hasPerFrame,
    hasPerPixel,
    hasShape0Enabled1,
    waveMatches,
    waveNonZero,
    waveAnyNonZero: waveNonZero > 0,
  };
}

async function listMilkFiles(dir) {
  const ents = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const ent of ents) {
    if (!ent.isFile()) continue;
    if (!ent.name.toLowerCase().endsWith('.milk')) continue;
    out.push(path.join(dir, ent.name));
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help) {
    console.log('report-coupled-pack-style: quick `.milk` feature stats for a coupled pack.');
    console.log('Usage: node scripts/report-coupled-pack-style.mjs --pack <packName> --sampleN 200');
    console.log('Flags: --out <path>');
    process.exitCode = 0;
    return;
  }

  const pack = args.pack;
  const packDir = path.join(PROJECT_ROOT, 'public', 'presets', pack);
  const fgDir = path.join(packDir, 'fg');
  const bgDir = path.join(packDir, 'bg');

  const hasFg = await fs
    .stat(fgDir)
    .then((s) => s.isDirectory())
    .catch(() => false);
  const hasBg = await fs
    .stat(bgDir)
    .then((s) => s.isDirectory())
    .catch(() => false);

  if (!hasFg || !hasBg) {
    throw new Error(`Missing fg/bg dirs for pack '${pack}': ${fgDir} / ${bgDir}`);
  }

  const allFg = await listMilkFiles(fgDir);
  const allBg = await listMilkFiles(bgDir);
  const sampleN = clamp(args.sampleN, 10, Math.max(allFg.length, allBg.length));

  const fgSample = sampleArray(allFg, Math.min(sampleN, allFg.length));
  const bgSample = sampleArray(allBg, Math.min(sampleN, allBg.length));

  async function analyzeFiles(files) {
    const stats = {
      count: files.length,
      perFrameCount: 0,
      perPixelCount: 0,
      shape0Enabled1Count: 0,
      waveAnyNonZeroCount: 0,
      waveNonZeroTotal: 0,
      waveMatchesTotal: 0,
      examples: {
        perFrame: [],
        perPixel: [],
      },
    };

    for (const file of files) {
      const text = await fs.readFile(file, 'utf8');
      const a = analyzeMilkText(text);
      if (a.hasPerFrame) {
        stats.perFrameCount += 1;
        if (stats.examples.perFrame.length < 12) stats.examples.perFrame.push(path.basename(file));
      }
      if (a.hasPerPixel) {
        stats.perPixelCount += 1;
        if (stats.examples.perPixel.length < 12) stats.examples.perPixel.push(path.basename(file));
      }
      if (a.hasShape0Enabled1) stats.shape0Enabled1Count += 1;
      if (a.waveAnyNonZero) stats.waveAnyNonZeroCount += 1;
      stats.waveNonZeroTotal += a.waveNonZero;
      stats.waveMatchesTotal += a.waveMatches;
    }

    return stats;
  }

  const fg = await analyzeFiles(fgSample);
  const bg = await analyzeFiles(bgSample);

  const outPath = args.out
    ? path.resolve(PROJECT_ROOT, args.out)
    : path.resolve(PROJECT_ROOT, 'artifacts', 'reports', `coupled_pack_style_stats.${pack}.json`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const report = {
    pack,
    generatedAt: new Date().toISOString(),
    sampleNRequested: args.sampleN,
    sampleNActual: { fg: fg.count, bg: bg.count },
    dirs: { packDir, fgDir, bgDir },
    fg,
    bg,
    notes: [
      'This is a heuristic text-based analysis; it does not evaluate visuals.',
      'Low per_frame/per_pixel counts often correlate with "parameter-only" presets.',
      'wave_* values being 0 across many files often correlates with "dark line" visuals.',
    ],
  };

  await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[report-coupled-pack-style] wrote ${outPath}`);
  console.log(JSON.stringify({ pack, outPath, fg, bg }, null, 2));
}

main().catch((err) => {
  console.error(`[report-coupled-pack-style] ERROR: ${err?.stack || err?.message || String(err)}`);
  process.exitCode = 1;
});
