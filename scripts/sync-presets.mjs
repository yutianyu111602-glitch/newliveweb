#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEFAULT_LIMIT_FALLBACK = Number(
  process.env.PRESET_LIMIT ?? process.env.npm_config_limit ?? '0'
);
const DEFAULT_TARGET = 'mega';
const DEFAULT_SAMPLE_MODE = 'reservoir';

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

// NPM on Windows can sometimes fail to forward `-- ...` args as process.argv.
// Best-effort fallback: parse npm_config_argv (JSON string) to recover them.
if (process.env.npm_config_argv) {
  try {
    const meta = JSON.parse(process.env.npm_config_argv);
    const raw =
      (Array.isArray(meta?.remain) && meta.remain) ||
      (Array.isArray(meta?.original) && meta.original) ||
      (Array.isArray(meta?.cooked) && meta.cooked) ||
      [];
    const tokens = raw.filter((t) => typeof t === 'string');
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token || !token.startsWith('--')) continue;
      const body = token.slice(2);
      if (!body) continue;
      if (body.includes('=')) {
        const [key, rawValue] = body.split('=');
        if (key && !argMap.has(key)) argMap.set(key, rawValue ?? 'true');
        continue;
      }
      const key = body;
      const next = tokens[i + 1];
      if (next && !next.startsWith('--')) {
        if (!argMap.has(key)) argMap.set(key, next);
        i += 1;
      } else {
        if (!argMap.has(key)) argMap.set(key, 'true');
      }
    }
  } catch {
    // ignore
  }
}

const resolveArg = (key, fallback) => {
  if (!argMap.has(key)) return fallback;
  const value = argMap.get(key);
  return value ?? fallback;
};

const normalizeValueArg = (value) => {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  // When a value-typed arg is passed without a value, our parsers may record "true".
  // Treat that as "missing" so we fall back to positional/default values.
  if (s === 'true') return undefined;
  return s;
};

const argvTokens = process.argv.slice(2);
const positionalTarget = argvTokens[0] && !String(argvTokens[0]).startsWith('--') ? String(argvTokens[0]) : undefined;
const positionalLimit = argvTokens[1] && !String(argvTokens[1]).startsWith('--') ? String(argvTokens[1]) : undefined;
const positionalThird = argvTokens[2] && !String(argvTokens[2]).startsWith('--') ? String(argvTokens[2]) : undefined;
const positionalFourth = argvTokens[3] && !String(argvTokens[3]).startsWith('--') ? String(argvTokens[3]) : undefined;
const envTarget = normalizeValueArg(process.env.npm_config_target);
const envLimit = normalizeValueArg(process.env.npm_config_limit);

const isLikelyJsonFile = (value) => String(value ?? '').trim().toLowerCase().endsWith('.json');
const isLikelyRelPathsFile = (value) => {
  const v = String(value ?? '').trim().toLowerCase();
  return v.endsWith('.txt') || v.endsWith('.tsv') || v.endsWith('.csv');
};

const positionalSeedCandidate = (() => {
  if (!positionalThird) return undefined;
  const n = Number(positionalThird);
  if (!Number.isFinite(n)) return undefined;
  return String(Math.floor(n));
})();

const positionalFileCandidates = positionalSeedCandidate
  ? [positionalFourth]
  : [positionalThird, positionalFourth];

const positionalQualityBlacklistFile = positionalFileCandidates.find((v) => isLikelyJsonFile(v));
const positionalRelPathsFile = positionalFileCandidates.find((v) => isLikelyRelPathsFile(v));

const qualityBlacklistFile =
  normalizeValueArg(resolveArg('qualityBlacklistFile', undefined)) ??
  normalizeValueArg(process.env.PRESET_QUALITY_BLACKLIST_FILE) ??
  normalizeValueArg(positionalQualityBlacklistFile);
const relPathsFile =
  normalizeValueArg(resolveArg('relPathsFile', undefined)) ??
  normalizeValueArg(process.env.PRESET_RELPATHS_FILE) ??
  normalizeValueArg(positionalRelPathsFile);
const qualityReportOutArg = normalizeValueArg(resolveArg('qualityReportOut', undefined));
const excludeHygieneBad = String(resolveArg('excludeHygieneBad', 'false')).trim().toLowerCase() === 'true';
const cleanDest = String(resolveArg('cleanDest', 'false')).trim().toLowerCase() === 'true';
const prefilterBlacklist =
  String(resolveArg('prefilterBlacklist', qualityBlacklistFile ? 'true' : 'false'))
    .trim()
    .toLowerCase() === 'true';

const defaultSource = DEFAULT_SOURCE_CANDIDATES[0] ?? projectRoot;
const sourceDir = path.resolve(resolveArg('source', defaultSource));
const targetName = resolveArg('target', positionalTarget ?? envTarget ?? DEFAULT_TARGET);
const defaultLimit = (() => {
  // Reasonable defaults: mega is meant to be a useful subset (not tiny).
  // Other targets keep a smaller default to avoid long copy times.
  if (Number.isFinite(DEFAULT_LIMIT_FALLBACK) && DEFAULT_LIMIT_FALLBACK > 0) {
    return Math.floor(DEFAULT_LIMIT_FALLBACK);
  }
  return String(targetName).trim() === 'mega' ? 1000 : 200;
})();

const limitValue = Number(resolveArg('limit', positionalLimit ?? envLimit ?? defaultLimit));
const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.floor(limitValue) : defaultLimit;
const destDir = path.join(presetsDir, targetName);
// Write manifest into the target folder to avoid overwriting the main full-library manifest.
const manifestPath = path.join(destDir, 'library-manifest.json');

const defaultQualityReportPath = path.join(
  projectRoot,
  'artifacts',
  'presets',
  targetName,
  'quality-report.json'
);
const qualityReportPath = qualityReportOutArg
  ? path.resolve(qualityReportOutArg)
  : defaultQualityReportPath;

const sampleMode = String(
  resolveArg('sample', resolveArg('mode', process.env.PRESET_SAMPLE ?? DEFAULT_SAMPLE_MODE))
).trim();

const scanLimitRaw = resolveArg('scanLimit', process.env.PRESET_SCAN_LIMIT ?? '0');
const scanLimitValue = Number(scanLimitRaw);
const scanLimit = Number.isFinite(scanLimitValue) && scanLimitValue > 0 ? Math.floor(scanLimitValue) : 0;

const seedRaw =
  normalizeValueArg(resolveArg('seed', undefined)) ??
  normalizeValueArg(process.env.PRESET_SEED) ??
  normalizeValueArg(positionalSeedCandidate) ??
  String(Date.now());
const seedValue = Number(seedRaw);
const seed = Number.isFinite(seedValue) ? Math.floor(seedValue) : Date.now();

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

async function loadQualityBlacklist(filePath) {
  if (!filePath) {
    return {
      badIds: new Set(),
      badUrls: new Set(),
      badSourceRelPaths: new Set()
    };
  }
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const toSet = (v) =>
      new Set(Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
    return {
      badIds: toSet(parsed?.badIds),
      badUrls: toSet(parsed?.badUrls),
      badSourceRelPaths: toSet(
        parsed?.badSourceRelPaths ?? parsed?.badRelPaths ?? parsed?.badRelatives
      )
    };
  } catch (error) {
    console.warn('[sync-presets] Failed to load qualityBlacklistFile:', filePath, error);
    return {
      badIds: new Set(),
      badUrls: new Set(),
      badSourceRelPaths: new Set()
    };
  }
}

async function loadRelPathsFile(filePath) {
  if (!filePath) return [];
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw
      .split(/\r?\n/g)
      .map((s) => String(s).trim())
      .filter((s) => s && !s.startsWith('#'));
  } catch (error) {
    console.warn('[sync-presets] Failed to load relPathsFile:', filePath, error);
    return [];
  }
}

async function hygieneCheckMilkFile(filePath) {
  const warnings = [];
  try {
    const stat = await fs.stat(filePath);
    if (!stat.size) warnings.push('empty');
    if (stat.size > 256 * 1024) warnings.push('large');
  } catch {
    warnings.push('stat-failed');
    return { warnings, fatal: true };
  }

  // Read a small prefix to detect obvious binary / NULs without loading huge files.
  try {
    const handle = await fs.open(filePath, 'r');
    try {
      const buf = Buffer.allocUnsafe(8192);
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
      for (let i = 0; i < bytesRead; i++) {
        if (buf[i] === 0) {
          warnings.push('binary-nul');
          break;
        }
      }
    } finally {
      await handle.close();
    }
  } catch {
    warnings.push('read-failed');
  }

  const fatal = warnings.includes('binary-nul') || warnings.includes('stat-failed');
  return { warnings, fatal };
}

async function main() {
  console.log(`[sync-presets] Source: ${sourceDir}`);
  console.log(`[sync-presets] Dest: ${destDir}`);
  console.log(`[sync-presets] Limit: ${limit}`);
  if (cleanDest) {
    console.log('[sync-presets] cleanDest: true');
  }
  if (relPathsFile) {
    console.log(`[sync-presets] relPathsFile: ${relPathsFile}`);
  }
  console.log(
    `[sync-presets] Sample: ${relPathsFile ? 'relpaths' : sampleMode} (seed=${seed}${scanLimit ? ` scanLimit=${scanLimit}` : ''})`
  );
  if (qualityBlacklistFile) {
    console.log(`[sync-presets] Quality blacklist: ${qualityBlacklistFile}`);
    console.log(`[sync-presets] Prefilter blacklist during sampling: ${prefilterBlacklist}`);
  }
  console.log(`[sync-presets] Quality report: ${qualityReportPath}${excludeHygieneBad ? ' (excluding hygiene-bad)' : ''}`);

  if (cleanDest) {
    try {
      await fs.rm(destDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  await ensureDir(destDir);

  await ensureDir(path.dirname(qualityReportPath));

  const qualityBlacklist = await loadQualityBlacklist(qualityBlacklistFile);
  const relPaths = await loadRelPathsFile(relPathsFile);
  const qualityReport = {
    version: 'v0',
    generatedAt: new Date().toISOString(),
    sourceRoot: sourceDir,
    target: targetName,
    sampleMode: relPathsFile ? 'relpaths' : sampleMode,
    seed,
    scanLimit: scanLimit || undefined,
    relPathsFile: relPathsFile || undefined,
    excludeHygieneBad,
    counts: {
      scanned: 0,
      considered: 0,
      included: 0,
      excluded: 0,
      excludedByBlacklist: 0,
      excludedByBlacklistPrefilter: 0,
      excludedByHygiene: 0,
      warnings: 0
    },
    excluded: [],
    warnings: []
  };

  const picked = [];
  let scanned = 0;
  let scannedEligible = 0;
  const maxItems = Math.max(1, limit);

  const shouldSkipByPrefilter = (filePath) => {
    if (!prefilterBlacklist) return false;
    if (!qualityBlacklistFile) return false;
    const relativeFromSource = path.relative(sourceDir, filePath);
    const normalizedRelative = relativeFromSource.split(path.sep).join('/');
    if (qualityBlacklist.badSourceRelPaths.has(normalizedRelative)) {
      qualityReport.counts.excludedByBlacklistPrefilter += 1;
      return true;
    }
    return false;
  };

  if (relPathsFile) {
    for (const rel of relPaths) {
      scanned += 1;
      if (picked.length >= maxItems) break;
      const normalizedRel = String(rel).split('\\').join('/');
      const absolute = path.resolve(sourceDir, normalizedRel);
      // Keep counts consistent with sampling mode.
      scannedEligible += 1;
      picked.push(absolute);
    }
  } else if (sampleMode === 'first' || sampleMode === 'head') {
    for await (const filePath of walk(sourceDir)) {
      scanned += 1;
      if (scanLimit && scanned >= scanLimit) break;
      if (shouldSkipByPrefilter(filePath)) continue;
      scannedEligible += 1;
      picked.push(filePath);
      if (picked.length >= maxItems) break;
    }
  } else {
    // Reservoir sampling: diverse subset across the whole tree.
    // Note: requires scanning all files for best distribution.
    for await (const filePath of walk(sourceDir)) {
      scanned += 1;
      if (scanLimit && scanned > scanLimit) break;
      if (shouldSkipByPrefilter(filePath)) continue;
      scannedEligible += 1;

      if (picked.length < maxItems) {
        picked.push(filePath);
        continue;
      }

      // Replace an existing element with probability maxItems/scanned.
      const j = Math.floor(rng() * scannedEligible);
      if (j < maxItems) {
        picked[j] = filePath;
      }
    }
  }

  // Shuffle output so UI isn't clustered by folder order.
  shuffleInPlace(picked);

  if (!picked.length) {
    console.warn('[sync-presets] No presets found.');
    return;
  }

  const manifestPresets = [];
  for (const absolute of picked) {
    // In relPathsFile mode, allow missing files but record them.
    try {
      await fs.access(absolute);
    } catch {
      qualityReport.counts.excluded += 1;
      qualityReport.excluded.push({ rel: String(absolute), reason: 'missing-source-file' });
      continue;
    }

    const relativeFromSource = path.relative(sourceDir, absolute);
    const normalizedRelative = relativeFromSource.split(path.sep).join('/');
    const destPath = path.join(destDir, relativeFromSource);

    qualityReport.counts.considered += 1;

    const relPath = `${targetName}/${normalizedRelative}`;
    const url = `/presets/${relPath}`;

    // Optional: exclude by provided quality blacklist.
    if (qualityBlacklist.badSourceRelPaths.has(normalizedRelative) || qualityBlacklist.badUrls.has(url)) {
      qualityReport.counts.excluded += 1;
      qualityReport.counts.excludedByBlacklist += 1;
      qualityReport.excluded.push({ rel: normalizedRelative, url, reason: 'blacklist' });
      continue;
    }

    const hygiene = await hygieneCheckMilkFile(absolute);
    if (hygiene.warnings?.length) {
      qualityReport.counts.warnings += 1;
      qualityReport.warnings.push({ rel: normalizedRelative, url, warnings: hygiene.warnings });
    }
    if (excludeHygieneBad && hygiene.fatal) {
      qualityReport.counts.excluded += 1;
      qualityReport.counts.excludedByHygiene += 1;
      qualityReport.excluded.push({ rel: normalizedRelative, url, reason: 'hygiene' });
      continue;
    }

    await ensureDir(path.dirname(destPath));
    await fs.copyFile(absolute, destPath);

    const stat = await fs.stat(destPath);
    const fileName = path.basename(destPath);
    const slug = slugify(normalizedRelative) || `preset-${manifestPresets.length}`;
    const digest = crypto.createHash('md5').update(normalizedRelative).digest('hex').slice(0, 6);
    const id = `${targetName}-${slug}-${digest}`;
    if (qualityBlacklist.badIds.has(id)) {
      // If user supplied bad IDs for this exact target, honor it too.
      qualityReport.counts.excluded += 1;
      qualityReport.counts.excludedByBlacklist += 1;
      qualityReport.excluded.push({ rel: normalizedRelative, url, id, reason: 'blacklist-id' });
      try {
        await fs.unlink(destPath);
      } catch {
        // ignore
      }
      continue;
    }
    manifestPresets.push({
      id,
      label: normalizedRelative,
      relPath,
      url,
      pack: targetName,
      fileName,
      fileSize: stat.size
    });
    qualityReport.counts.included += 1;
  }

  const manifest = {
    version: 'v0',
    generatedAt: new Date().toISOString(),
    sourceRoot: sourceDir,
    totalFilesScanned: scanned,
    totalEligibleScanned: scannedEligible,
    totalPresetsIncluded: manifestPresets.length,
    presets: manifestPresets,
    // Extra fields are allowed (forward compatible).
    sampleMode,
    seed,
    scanLimit: scanLimit || undefined,
    target: targetName
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  qualityReport.counts.scanned = scanned;
  await fs.writeFile(qualityReportPath, `${JSON.stringify(qualityReport, null, 2)}\n`, 'utf8');

  console.log(
    `[sync-presets] Copied ${manifest.totalPresetsIncluded ?? manifest.presets?.length ?? 0} presets.`
  );
  console.log('[sync-presets] Manifest updated:', manifestPath);
  console.log('[sync-presets] Quality report updated:', qualityReportPath);
  console.log('[sync-presets] Reminder: respect original preset licenses (see PRESET LICENSE.txt).');
}

main().catch((error) => {
  console.error('[sync-presets] Failed:', error);
  process.exitCode = 1;
});
