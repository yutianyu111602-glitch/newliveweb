#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const repoRoot = process.cwd();

const getNpmForwardedArgs = () => {
  const raw = process.env.npm_config_argv;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const remain = Array.isArray(parsed?.remain) ? parsed.remain : [];
    return remain.filter((x) => typeof x === 'string');
  } catch {
    return [];
  }
};

const parseArgs = (args) => {
  const flags = new Map();
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (typeof token !== 'string') continue;
    if (token.startsWith('--')) {
      const name = token.slice(2);
      const next = args[i + 1];
      if (typeof next === 'string' && !next.startsWith('--')) {
        flags.set(name, next);
        i += 1;
      } else {
        flags.set(name, '');
      }
      continue;
    }
    if (token.startsWith('-')) continue;
    positionals.push(token);
  }

  return { flags, positionals };
};

const resolveArg = (parsed, name, fallback = undefined) => {
  if (parsed.flags.has(name)) return parsed.flags.get(name);
  return fallback;
};

const resolveBool = (parsed, name, fallback = false) => {
  const v = resolveArg(parsed, name, undefined);
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (!s) return true;
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  return fallback;
};

const splitCsv = (value) =>
  String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const normalizeSlashes = (p) => String(p).replace(/\\/g, '/');

const wslToWindowsPath = (wslPath) => {
  const s = String(wslPath ?? '').trim();
  const m = s.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (!m) return s;
  const drive = String(m[1]).toUpperCase();
  const rest = String(m[2]).replace(/\//g, '\\');
  return `${drive}:\\${rest}`;
};

const isMilkFileName = (name) => String(name).toLowerCase().endsWith('.milk');

const stableId = (packIdPrefix, rel) => {
  const digest = crypto.createHash('md5').update(String(rel)).digest('hex').slice(0, 8);
  const slug = String(rel)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${packIdPrefix}-${slug || 'preset'}-${digest}`;
};

async function listTopLevelMilkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && isMilkFileName(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
  return files;
}

async function buildFlatManifest({ packName, destDir, filesCopied }) {
  const packRel = normalizeSlashes(packName).replace(/^\/+|\/+$/g, '');
  const packIdPrefix =
    packRel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'pack';

  const presets = [];
  for (const fileName of filesCopied) {
    const relPath = `${packRel}/${fileName}`;
    const url = `/presets/${relPath}`;
    const abs = path.join(destDir, fileName);
    const st = await fs.stat(abs);
    presets.push({
      id: stableId(packIdPrefix, relPath),
      label: fileName,
      relPath,
      url,
      pack: packRel,
      fileName,
      fileSize: st.size,
    });
  }

  presets.sort((a, b) => String(a.relPath).localeCompare(String(b.relPath)));

  return {
    version: 'v0',
    generatedAt: new Date().toISOString(),
    sourceRoot: '(sync-aidata-packs flat copy)',
    totalFilesScanned: presets.length,
    totalEligibleScanned: presets.length,
    totalPresetsIncluded: presets.length,
    presets,
    target: packRel,
    scanMode: 'flat',
  };
}

async function syncFlatPack({ srcDir, packName, destBase, cleanDest, limit, dryRun }) {
  const destDir = path.join(destBase, packName);

  const srcStat = await fs.stat(srcDir).catch(() => null);
  if (!srcStat?.isDirectory()) {
    throw new Error(`Source directory not found: ${srcDir}`);
  }

  if (cleanDest && !dryRun) {
    await fs.rm(destDir, { recursive: true, force: true }).catch(() => undefined);
  }
  if (!dryRun) await ensureDir(destDir);

  const all = await listTopLevelMilkFiles(srcDir);
  const picked = limit > 0 ? all.slice(0, limit) : all;

  const copied = [];
  for (const fileName of picked) {
    const from = path.join(srcDir, fileName);
    const to = path.join(destDir, fileName);
    if (!dryRun) {
      await fs.copyFile(from, to);
    }
    copied.push(fileName);
  }

  if (!dryRun) {
    const manifest = await buildFlatManifest({ packName, destDir, filesCopied: copied });
    await fs.writeFile(path.join(destDir, 'library-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  return { packName, mode: 'flat', copied: copied.length, destDir };
}

async function syncCoupledPack({ srcDir, packName, destBase, cleanDest, dryRun }) {
  const destDir = path.join(destBase, packName);

  const srcStat = await fs.stat(srcDir).catch(() => null);
  if (!srcStat?.isDirectory()) {
    throw new Error(`Source directory not found: ${srcDir}`);
  }

  const manifestPath = path.join(srcDir, 'manifest.jsonl');
  const manifestStat = await fs.stat(manifestPath).catch(() => null);
  if (!manifestStat?.isFile()) {
    throw new Error(`Coupled pack missing manifest.jsonl: ${manifestPath}`);
  }

  if (cleanDest && !dryRun) {
    await fs.rm(destDir, { recursive: true, force: true }).catch(() => undefined);
  }
  if (!dryRun) await ensureDir(destDir);

  const raw = await fs.readFile(manifestPath, 'utf8');
  const lines = raw.split(/\r?\n/g).filter(Boolean);

  const urlManifest = [];
  let copied = 0;

  const packRootToken = `/${String(packName).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}/`;

  const resolveRelFromWsl = (wslPath, fallbackSubdir) => {
    const s = normalizeSlashes(wslPath);
    const idx = s.toLowerCase().indexOf(packRootToken.toLowerCase());
    if (idx >= 0) {
      return s.slice(idx + packRootToken.length);
    }
    return `${fallbackSubdir}/${path.posix.basename(s)}`;
  };

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const fgWsl = entry?.fg;
    const bgWsl = entry?.bg;
    if (!fgWsl || !bgWsl) continue;

    const fgRel = resolveRelFromWsl(fgWsl, 'fg');
    const bgRel = resolveRelFromWsl(bgWsl, 'bg');

    const fgFrom = wslToWindowsPath(fgWsl);
    const bgFrom = wslToWindowsPath(bgWsl);

    const fgTo = path.join(destDir, ...fgRel.split('/'));
    const bgTo = path.join(destDir, ...bgRel.split('/'));

    if (!dryRun) {
      await ensureDir(path.dirname(fgTo));
      await ensureDir(path.dirname(bgTo));
      await fs.copyFile(fgFrom, fgTo);
      await fs.copyFile(bgFrom, bgTo);
    }

    copied += 2;

    urlManifest.push({
      pair: entry.pair,
      fgUrl: `/presets/${packName}/${normalizeSlashes(fgRel)}`,
      bgUrl: `/presets/${packName}/${normalizeSlashes(bgRel)}`,
      ...(typeof entry.warp_diff === 'number' ? { warp_diff: entry.warp_diff } : {}),
      ...(typeof entry.cx_diff === 'number' ? { cx_diff: entry.cx_diff } : {}),
    });
  }

  if (!dryRun) {
    await fs.writeFile(path.join(destDir, 'manifest.source.jsonl'), raw, 'utf8');
    await fs.writeFile(
      path.join(destDir, 'pairs-manifest.v0.json'),
      `${JSON.stringify({ version: 'v0', generatedAt: new Date().toISOString(), pack: packName, pairs: urlManifest }, null, 2)}\n`,
      'utf8'
    );
  }

  return { packName, mode: 'coupled', copied, pairs: urlManifest.length, destDir };
}

async function main() {
  const argv = [...process.argv.slice(2), ...getNpmForwardedArgs()];
  const parsed = parseArgs(argv);

  const srcBase = path.resolve(resolveArg(parsed, 'srcBase', 'D:/aidata'));
  const destBase = path.resolve(resolveArg(parsed, 'destBase', 'public/presets'));

  const packsArg = resolveArg(parsed, 'packs', '');
  const packArg = resolveArg(parsed, 'pack', '');
  const wanted = new Set([...splitCsv(packsArg), ...splitCsv(packArg), ...parsed.positionals]);

  const cleanDest = resolveBool(parsed, 'cleanDest', false);
  const dryRun = resolveBool(parsed, 'dryRun', false);

  const limitRaw = resolveArg(parsed, 'limit', '0');
  const limitValue = Number(limitRaw);
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.floor(limitValue) : 0;

  const defaults = [
    { name: 'ai_generated_v2', mode: 'flat' },
    { name: 'ai_generated_quality', mode: 'flat' },
    { name: 'ai_generated_premium', mode: 'flat' },
    { name: 'ai_generated_coupled', mode: 'coupled' },
    { name: 'ai_generated_coupled_final', mode: 'coupled' },
  ];

  const plans = defaults.filter((p) => wanted.size === 0 || wanted.has(p.name));
  if (!plans.length) {
    throw new Error(
      'No packs selected. Use --packs ai_generated_v2,ai_generated_quality,... or omit to run defaults.'
    );
  }

  const results = [];
  for (const plan of plans) {
    const srcDir = path.join(srcBase, plan.name);

    if (plan.mode === 'flat') {
      results.push(
        await syncFlatPack({
          srcDir,
          packName: plan.name,
          destBase,
          cleanDest,
          limit,
          dryRun,
        })
      );
    } else {
      results.push(
        await syncCoupledPack({
          srcDir,
          packName: plan.name,
          destBase,
          cleanDest,
          dryRun,
        })
      );
    }
  }

  process.stderr.write(`${JSON.stringify({ ok: true, dryRun, results }, null, 2)}\n`);
}

main().catch((error) => {
  console.error('[sync-aidata-packs] Failed:', error);
  process.exitCode = 1;
});
