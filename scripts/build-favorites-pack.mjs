#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(__filename, '..', '..');
const workspaceRoot = path.resolve(projectRoot, '..');

const publicDir = path.join(projectRoot, 'public');
const presetsDir = path.join(publicDir, 'presets');

const DEFAULT_SOURCE_CANDIDATES = [
  process.env.PRESET_SOURCE,
  path.join(workspaceRoot, 'MilkDrop 130k+ Presets MegaPack 2025'),
  path.join(workspaceRoot, 'MilkDrop 130k+ Presets MegaPack 2025 2'),
].filter(Boolean);

const argMap = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token || !token.startsWith('--')) continue;
    const body = token.slice(2);
    if (!body) continue;

    if (body.includes('=')) {
      const [key, rawValue] = body.split('=');
      if (key) argMap.set(key, rawValue ?? 'true');
      continue;
    }

    const key = body;
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      argMap.set(key, next);
      i += 1;
    } else {
      argMap.set(key, 'true');
    }
  }
}

const resolveArg = (key, fallback) => {
  if (!argMap.has(key)) return fallback;
  const value = argMap.get(key);
  return value ?? fallback;
};

const defaultSource = DEFAULT_SOURCE_CANDIDATES[0] ?? projectRoot;
const sourceDir = path.resolve(resolveArg('source', defaultSource));

const limitValue = Number(resolveArg('limit', process.env.FAVORITES_LIMIT ?? '60'));
const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.floor(limitValue) : 60;

const scanLimitValue = Number(resolveArg('scanLimit', process.env.FAVORITES_SCAN_LIMIT ?? '0'));
const scanLimit = Number.isFinite(scanLimitValue) && scanLimitValue > 0 ? Math.floor(scanLimitValue) : 0;

const seedValue = Number(resolveArg('seed', process.env.FAVORITES_SEED ?? String(Date.now())));
const seed = Number.isFinite(seedValue) ? Math.floor(seedValue) : Date.now();

const destPack = String(resolveArg('pack', 'favorites')).trim() || 'favorites';
const destDir = path.join(presetsDir, destPack);
const manifestPath = path.join(destDir, 'library-manifest.json');
const favoritesPath = path.join(destDir, 'favorites.v2.json');

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const mulberry32 = (a) => {
  let t = (a >>> 0) || 1;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const rng = mulberry32(seed >>> 0);

const shuffleInPlace = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
};

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(resolved);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.milk')) {
      yield resolved;
    }
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function buildDefaultVisualStateV2() {
  return {
    version: 2,
    global: {
      seed: 0,
      macros: { fusion: 0.5, motion: 0.5, sparkle: 0.5 },
      macroSlots: [],
    },
    background: {
      type: 'liquid',
      params: {},
      layers: {
        liquid: { enabled: false, opacity: 0.7 },
        basic: { enabled: false, opacity: 1 },
        camera: { enabled: false, deviceId: '', opacity: 1 },
        video: { enabled: false, src: '', opacity: 1 },
        depth: { enabled: false, opacity: 1 },
      },
    },
    projectm: {
      presetId: null,
      presetUrl: null,
      presetIdBg: null,
      presetUrlBg: null,
      opacity: 0.7,
      blendMode: 'normal',
      audioDrivenOpacity: true,
      energyToOpacityAmount: 0.25,
    },
  };
}

async function main() {
  console.log(`[build-favorites] Source: ${sourceDir}`);
  console.log(`[build-favorites] Dest: ${destDir}`);
  console.log(`[build-favorites] Limit: ${limit}`);
  console.log(`[build-favorites] Seed: ${seed}${scanLimit ? ` scanLimit=${scanLimit}` : ''}`);

  await ensureDir(destDir);

  // Reservoir sample from the whole tree for diversity.
  const picked = [];
  let scanned = 0;
  for await (const filePath of walk(sourceDir)) {
    scanned += 1;
    if (scanLimit && scanned > scanLimit) break;

    if (picked.length < limit) {
      picked.push(filePath);
      continue;
    }

    const j = Math.floor(rng() * scanned);
    if (j < limit) {
      picked[j] = filePath;
    }
  }

  if (!picked.length) {
    console.warn('[build-favorites] No presets found.');
    return;
  }

  shuffleInPlace(picked);

  const presets = [];
  const favorites = [];
  const nowIso = new Date().toISOString();

  for (const absolute of picked) {
    const relFromSource = path.relative(sourceDir, absolute);
    const normalizedRel = relFromSource.split(path.sep).join('/');

    const digest = crypto.createHash('md5').update(normalizedRel).digest('hex').slice(0, 10);
    const shortName = `fav-${digest}.milk`;
    const destPath = path.join(destDir, shortName);

    await fs.copyFile(absolute, destPath);
    const stat = await fs.stat(destPath);

    const relPath = `${destPack}/${shortName}`;
    const url = `/presets/${relPath}`;

    const slug = slugify(normalizedRel) || `preset-${presets.length}`;
    const id = `${destPack}-${slug}-${digest}`;

    presets.push({
      id,
      label: normalizedRel,
      relPath,
      url,
      pack: destPack,
      fileName: shortName,
      fileSize: stat.size,
      meta: { sourceRelPath: normalizedRel },
    });

    const state = buildDefaultVisualStateV2();
    state.global.seed = 0;
    state.projectm.presetId = id;
    state.projectm.presetUrl = url;

    favorites.push({
      id: `fav-${id}`,
      createdAt: nowIso,
      label: normalizedRel,
      state,
    });
  }

  const manifest = {
    version: 'v0',
    generatedAt: nowIso,
    sourceRoot: sourceDir,
    totalFilesScanned: scanned,
    totalPresetsIncluded: presets.length,
    presets,
    sampleMode: 'reservoir',
    seed,
    scanLimit: scanLimit || undefined,
    target: destPack,
  };

  const favoritesBundle = {
    version: 1,
    generatedAt: nowIso,
    sourceRoot: sourceDir,
    totalFilesScanned: scanned,
    totalFavoritesIncluded: favorites.length,
    favorites,
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.writeFile(favoritesPath, `${JSON.stringify(favoritesBundle, null, 2)}\n`, 'utf8');

  console.log(`[build-favorites] Wrote manifest: ${manifestPath}`);
  console.log(`[build-favorites] Wrote favorites: ${favoritesPath}`);
  console.log('[build-favorites] Reminder: respect original preset licenses (see PRESET LICENSE.txt).');
}

main().catch((error) => {
  console.error('[build-favorites] Failed:', error);
  process.exitCode = 1;
});
