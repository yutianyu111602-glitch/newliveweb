#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const resolveArg = (name, fallback = undefined) => {
  const idx = process.argv.findIndex((v) => v === `--${name}`);
  if (idx >= 0) {
    const next = process.argv[idx + 1];
    if (next && !next.startsWith('--')) return next;
    return '';
  }
  return fallback;
};

const normalizeKey = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .toLowerCase();

async function loadBandTargetsMap(bandTargetsPath) {
  if (!bandTargetsPath) return null;
  const raw = await fs.readFile(bandTargetsPath, 'utf8');
  const json = JSON.parse(raw);
  const categorized = json?.categorized ?? {};
  const map = new Map();
  for (const [bandClass, items] of Object.entries(categorized)) {
    if (!Array.isArray(items)) continue;
    for (const entry of items) {
      const key = normalizeKey(entry);
      if (!key) continue;
      map.set(key, String(bandClass));
    }
  }
  return map;
}

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function* walkMilkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMilkFiles(resolved);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.milk')) {
      yield resolved;
    }
  }
}

async function main() {
  const pack = String(resolveArg('pack', '')).trim();
  const packDirArg = resolveArg('packDir', undefined);

  if (!pack && !packDirArg) {
    throw new Error('Usage: node scripts/build-library-manifest-from-pack-dir.mjs --pack <packName> OR --packDir <absoluteOrRelativePath> [--bandTargets <merged_targets.json>]');
  }

  const bandTargetsArg = resolveArg('bandTargets', '');
  const bandTargetsPath = bandTargetsArg
    ? path.resolve(process.cwd(), bandTargetsArg)
    : '';
  const bandTargetsMap = bandTargetsPath
    ? await loadBandTargetsMap(bandTargetsPath)
    : null;

  const repoRoot = process.cwd();
  const presetsRoot = path.resolve(repoRoot, 'public', 'presets');
  const packDir = packDirArg
    ? path.resolve(repoRoot, packDirArg)
    : path.resolve(presetsRoot, pack);

  const inferredPackName = pack || path.basename(packDir);
  const relativeToPresetsRoot = (() => {
    try {
      const rel = path.relative(presetsRoot, packDir);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
      return rel.split(path.sep).join('/');
    } catch {
      return null;
    }
  })();
  const packRel = (pack || relativeToPresetsRoot || inferredPackName)
    .split(path.sep)
    .join('/')
    .replace(/^\/+|\/+$/g, '');
  const packIdPrefix = slugify(packRel) || slugify(inferredPackName) || 'pack';

  const stat = await fs.stat(packDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Pack directory not found: ${packDir}`);
  }

  const presets = [];
  let scanned = 0;

  for await (const filePath of walkMilkFiles(packDir)) {
    scanned += 1;
    const relWithinPack = path
      .relative(packDir, filePath)
      .split(path.sep)
      .join('/');

    // Match sync-presets semantics as closely as possible.
    const normalizedRelative = relWithinPack;
    const relPath = `${packRel}/${normalizedRelative}`;
    const url = `/presets/${relPath}`;

    const fileName = path.basename(filePath);
    const st = await fs.stat(filePath);

    const slug = slugify(normalizedRelative) || `preset-${presets.length}`;
    const digest = crypto
      .createHash('md5')
      .update(`${packRel}/${normalizedRelative}`)
      .digest('hex')
      .slice(0, 6);
    const id = `${packIdPrefix}-${slug}-${digest}`;

    const bandClass = bandTargetsMap
      ? bandTargetsMap.get(normalizeKey(relPath)) ||
        bandTargetsMap.get(normalizeKey(normalizedRelative)) ||
        bandTargetsMap.get(normalizeKey(fileName)) ||
        null
      : null;

    presets.push({
      id,
      label: normalizedRelative,
      relPath,
      url,
      pack: packRel,
      fileName,
      fileSize: st.size,
      ...(bandClass ? { bandClass } : {}),
    });
  }

  // Deterministic output helps debugging/repro.
  presets.sort((a, b) => String(a.relPath).localeCompare(String(b.relPath)));

  const manifest = {
    version: 'v0',
    generatedAt: new Date().toISOString(),
    sourceRoot: `${packDir} (from pack dir scan)`,
    totalFilesScanned: scanned,
    totalEligibleScanned: scanned,
    totalPresetsIncluded: presets.length,
    presets,
    target: packRel,
    scanMode: 'pack-dir',
    bandTargets: bandTargetsPath || null,
  };

  const outPath = path.join(packDir, 'library-manifest.json');
  await fs.writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  process.stderr.write(
    `DONE: wrote ${presets.length} presets to ${outPath} (scanned=${scanned})\n`
  );
}

main().catch((error) => {
  console.error('[build-library-manifest-from-pack-dir] Failed:', error);
  process.exitCode = 1;
});
