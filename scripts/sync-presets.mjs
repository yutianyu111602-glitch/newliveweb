#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEFAULT_SOURCE = '/Users/masher/code/MilkDrop 130k+ Presets MegaPack 2025 2';
const DEFAULT_LIMIT = Number(process.env.PRESET_LIMIT ?? '120');
const DEFAULT_TARGET = 'mega';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(__filename, '..', '..');
const publicDir = path.join(projectRoot, 'public');
const presetsDir = path.join(publicDir, 'presets');

const argMap = process.argv.slice(2).reduce((acc, token) => {
  if (!token.startsWith('--')) return acc;
  const [key, rawValue] = token.slice(2).split('=');
  acc.set(key, rawValue ?? 'true');
  return acc;
}, new Map());

const resolveArg = (key, fallback) => {
  if (!argMap.has(key)) return fallback;
  const value = argMap.get(key);
  return value ?? fallback;
};

const sourceDir = path.resolve(resolveArg('source', DEFAULT_SOURCE));
const limitValue = Number(resolveArg('limit', DEFAULT_LIMIT));
const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : DEFAULT_LIMIT;
const targetName = resolveArg('target', DEFAULT_TARGET);
const destDir = path.join(presetsDir, targetName);
const manifestPath = path.join(presetsDir, 'library-manifest.json');

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function *walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield * walk(resolved);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.milk')) {
      yield resolved;
    }
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  console.log(`[sync-presets] Source: ${sourceDir}`);
  console.log(`[sync-presets] Dest: ${destDir}`);
  console.log(`[sync-presets] Limit: ${limit}`);

  await ensureDir(destDir);

  const picked = [];
  for await (const filePath of walk(sourceDir)) {
    picked.push(filePath);
    if (picked.length >= limit) break;
  }

  if (!picked.length) {
    console.warn('[sync-presets] No presets found.');
    return;
  }

  const manifestPresets = [];
  for (const absolute of picked) {
    const relativeFromSource = path.relative(sourceDir, absolute);
    const normalizedRelative = relativeFromSource.split(path.sep).join('/');
    const destPath = path.join(destDir, relativeFromSource);
    await ensureDir(path.dirname(destPath));
    await fs.copyFile(absolute, destPath);

    const slug = slugify(normalizedRelative) || `preset-${manifestPresets.length}`;
    const digest = crypto.createHash('md5').update(normalizedRelative).digest('hex').slice(0, 6);
    const id = `${targetName}-${slug}-${digest}`;
    manifestPresets.push({
      id,
      label: normalizedRelative,
      url: `/presets/${targetName}/${normalizedRelative}`
    });
  }

  const manifest = {
    sourcePath: sourceDir,
    generatedAt: new Date().toISOString(),
    presetCount: manifestPresets.length,
    presets: manifestPresets
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`[sync-presets] Copied ${manifest.presetCount} presets.`);
  console.log('[sync-presets] Manifest updated:', manifestPath);
  console.log('[sync-presets] Reminder: respect original preset licenses (see PRESET LICENSE.txt).');
}

main().catch((error) => {
  console.error('[sync-presets] Failed:', error);
  process.exitCode = 1;
});
