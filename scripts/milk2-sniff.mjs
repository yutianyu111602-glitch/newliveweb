#!/usr/bin/env node
/**
 * milk2-sniff: quick, safe inspection for a single `.milk2` file without guessing the spec.
 *
 * This intentionally does NOT try to parse/convert; it only helps us answer:
 * - Is it text or binary?
 * - Does it reference `.milk` files by path/name?
 * - Does it look like it embeds resources (images/base64)?
 *
 * Usage:
 *   node scripts/milk2-sniff.mjs --file "C:/path/to/preset.milk2"
 */

import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const out = { file: '', maxBytes: 2 * 1024 * 1024, positionals: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--file' || a === '-f') {
      out.file = String(argv[i + 1] ?? '');
      i += 1;
      continue;
    }
    if (a === '--maxBytes') {
      out.maxBytes = Math.max(1024, Math.floor(Number(argv[i + 1] ?? out.maxBytes)));
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

function uniq(arr) {
  return [...new Set(arr)];
}

function toPreviewLines(text, maxLines) {
  const lines = text.split(/\r?\n/);
  return lines.slice(0, Math.max(0, maxLines));
}

function extractCandidatePaths(text) {
  // Intentionally loose; we want hints, not perfect parsing.
  const matches = text.match(/[^\s"'<>]+?\.(?:milk2|milk)\b/gi) ?? [];
  return uniq(matches).slice(0, 200);
}

function extractInterestingLines(text) {
  const lines = text.split(/\r?\n/);
  const hit = [];
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    const lower = l.toLowerCase();
    if (lower.includes('.milk2') || lower.includes('.milk') || lower.includes('preset') || lower.includes('blend') || lower.includes('pattern')) {
      hit.push(l);
      if (hit.length >= 80) break;
    }
  }
  return hit;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const fileArg = args.file || args.positionals[0] || '';

  if (args.help || !fileArg) {
    console.log('milk2-sniff: inspect a single .milk2 file safely (no conversion).');
    console.log('Usage: node scripts/milk2-sniff.mjs --file "<absPathTo.milk2>"');
    console.log('Flags: --maxBytes 2097152');
    process.exitCode = fileArg ? 0 : 2;
    return;
  }

  const absPath = path.resolve(process.cwd(), fileArg);
  const st = await fs.stat(absPath);
  const bytesToRead = Math.min(st.size, Math.max(1024, args.maxBytes));

  const fh = await fs.open(absPath, 'r');
  let buf = Buffer.alloc(bytesToRead);
  try {
    const res = await fh.read(buf, 0, bytesToRead, 0);
    buf = buf.subarray(0, res.bytesRead);
  } finally {
    await fh.close();
  }

  const hasNullByte = buf.includes(0);
  const text = buf.toString('utf8');
  const replacementCount = (text.match(/\uFFFD/g) ?? []).length;

  let printable = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    // allow common whitespace; otherwise require reasonably printable range
    if (code === 9 || code === 10 || code === 13) printable += 1;
    else if (code >= 32 && code !== 127) printable += 1;
  }
  const printableRatio = text.length ? printable / text.length : 0;

  const looksText =
    !hasNullByte &&
    printableRatio >= 0.9 &&
    (text.length === 0 || replacementCount / text.length < 0.01);

  const candidatePaths = looksText ? extractCandidatePaths(text) : [];
  const interestingLines = looksText ? extractInterestingLines(text) : [];

  const summary = {
    file: absPath,
    sizeBytes: st.size,
    bytesRead: buf.length,
    sniff: {
      hasNullByte,
      replacementCount,
      printableRatio: Number(printableRatio.toFixed(4)),
      looksText,
    },
    hints: {
      candidatePaths,
      interestingLines,
      previewHeadLines: looksText ? toPreviewLines(text, 30) : [],
      hasDataImage: looksText ? /data:image\//i.test(text) : false,
      hasBase64Markers: looksText ? /base64/i.test(text) : false,
      hasPngMagicInHead: buf.length >= 8 ? buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' : false,
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(`[milk2-sniff] ERROR: ${err?.stack || err?.message || String(err)}`);
  process.exitCode = 1;
});

