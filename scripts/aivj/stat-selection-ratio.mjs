#!/usr/bin/env node
/**
 * 统计 AIVJ 选择比例
 * 用法：node scripts/aivj/stat-selection-ratio.mjs --manifest <path> --log <path>
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 配置
const DEFAULT_LOG = join(__dirname, '../../logs/aivj-selection.log');
const FALLBACK_LOG = join(__dirname, '../../artifacts/headless/browser-console.log');
const DEFAULT_MANIFEST = join(__dirname, '../../public/run-manifest.json');

// 解析参数
const args = process.argv.slice(2);
const manifestPath = args.find(a => a.startsWith('--manifest='))?.split('=')[1] || DEFAULT_MANIFEST;
const logPath = args.find(a => a.startsWith('--log='))?.split('=')[1] || DEFAULT_LOG;

function parseManifest(manifestPath) {
  if (!existsSync(manifestPath)) return [];
  const raw = readFileSync(manifestPath, 'utf-8');
  if (manifestPath.endsWith('.jsonl')) {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.presets)) return parsed.presets;
    if (Array.isArray(parsed?.entries)) return parsed.entries;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeKey(value) {
  return String(value ?? '').trim().replace(/\\/g, '/').toLowerCase();
}

function buildManifestLookup(presets) {
  const byPresetId = new Map();
  const byRelPath = new Map();
  const byFilePath = new Map();
  const byPresetSuffix = new Map();
  const fileNameCounts = new Map();

  const presetSuffixOf = (value) => {
    const raw = normalizeKey(value);
    const idx = raw.lastIndexOf('/presets/');
    if (idx < 0) return '';
    return raw.slice(idx + 1);
  };

  for (const entry of presets) {
    const presetId = normalizeKey(entry?.presetId ?? entry?.id ?? '');
    const relPath = normalizeKey(entry?.relPath ?? '');
    const filePath = normalizeKey(entry?.filePath ?? '');
    const relSuffix = presetSuffixOf(entry?.relPath ?? '');
    const fileSuffix = presetSuffixOf(entry?.filePath ?? '');
    if (presetId) byPresetId.set(presetId, entry);
    if (relPath) byRelPath.set(relPath, entry);
    if (filePath) byFilePath.set(filePath, entry);
    if (relSuffix) byPresetSuffix.set(relSuffix, entry);
    if (fileSuffix) byPresetSuffix.set(fileSuffix, entry);
    const fileName = filePath ? basename(filePath) : relPath ? basename(relPath) : '';
    if (fileName) fileNameCounts.set(fileName, (fileNameCounts.get(fileName) || 0) + 1);
  }

  const byFileName = new Map();
  for (const entry of presets) {
    const filePath = normalizeKey(entry?.filePath ?? '');
    const relPath = normalizeKey(entry?.relPath ?? '');
    const fileName = filePath ? basename(filePath) : relPath ? basename(relPath) : '';
    if (!fileName) continue;
    if (fileNameCounts.get(fileName) === 1) {
      byFileName.set(fileName, entry);
    }
  }

  return { byPresetId, byRelPath, byFilePath, byPresetSuffix, byFileName };
}

function findManifestEntry(lookup, presetId) {
  const key = normalizeKey(presetId);
  if (!key) return null;
  if (lookup.byPresetId.has(key)) return lookup.byPresetId.get(key);
  if (lookup.byRelPath.has(key)) return lookup.byRelPath.get(key);
  if (lookup.byFilePath.has(key)) return lookup.byFilePath.get(key);
  if (lookup.byPresetSuffix?.has(key)) return lookup.byPresetSuffix.get(key);
  const fileName = basename(key);
  if (lookup.byFileName.has(fileName)) return lookup.byFileName.get(fileName);
  return null;
}

function parseLogLines(logText) {
  const lines = logText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const picks = [];
  for (const line of lines) {
    const hit = line.match(/selected preset (.+)$/i);
    if (!hit) continue;
    const raw = hit[1];
    const idTokenMatch = String(raw)
      .trim()
      .match(/^([^\s\(\|]+)(?:\s|\(|\||$)/);
    const presetId = String(idTokenMatch?.[1] ?? '').trim();
    if (!presetId) continue;
    const motionMatch = raw.match(/\bm=([0-9.]+)\b/);
    const tierMatch = raw.match(/\btier=([^\s]+)\b/);
    const motion = motionMatch ? Number(motionMatch[1]) : null;
    const tier = tierMatch ? String(tierMatch[1]) : null;
    picks.push({ presetId, motion: Number.isFinite(motion) ? motion : null, tier });
  }
  return picks;
}

async function main() {
  console.log('=== AIVJ 选择比例统计 ===\n');

  // 1. 加载 manifest
  const presets = parseManifest(manifestPath);
  if (presets.length) {
    console.log(`[INFO] 加载 manifest: ${presets.length} presets`);
  } else if (existsSync(manifestPath)) {
    console.warn('[WARN] manifest 解析失败或为空');
  } else {
    console.warn(`[WARN] manifest 文件不存在: ${manifestPath}`);
  }
  const lookup = buildManifestLookup(presets);

  // 2. 统计选中次数（从日志）
  let logText = '';
  let usedLog = logPath;
  if (existsSync(logPath)) {
    try {
      logText = readFileSync(logPath, 'utf-8');
    } catch (e) {
      console.warn(`[WARN] 日志读取失败: ${e.message}`);
    }
  } else if (existsSync(FALLBACK_LOG)) {
    try {
      logText = readFileSync(FALLBACK_LOG, 'utf-8');
      usedLog = FALLBACK_LOG;
      console.log(`[INFO] 使用 fallback 日志: ${FALLBACK_LOG}`);
    } catch (e) {
      console.warn(`[WARN] fallback 日志读取失败: ${e.message}`);
    }
  } else {
    console.warn(`[WARN] 日志文件不存在: ${logPath}`);
  }

  const picks = parseLogLines(logText);
  const selectedCounts = {};
  const selectionMeta = {};
  for (const pick of picks) {
    selectedCounts[pick.presetId] = (selectedCounts[pick.presetId] || 0) + 1;
    if (!selectionMeta[pick.presetId]) {
      selectionMeta[pick.presetId] = { motion: pick.motion, tier: pick.tier };
    }
  }

  if (!Object.keys(selectedCounts).length) {
    console.error('[ERROR] 未从日志读取到任何选择记录');
    console.error(`[ERROR] 日志路径: ${usedLog}`);
    process.exitCode = 2;
    return { ratio: 0, pass: false, totalSelected: 0, motionOkSelected: 0 };
  }
  console.log(`[INFO] 从日志读取选择记录: ${Object.keys(selectedCounts).length} unique presets`);

  // 3. 计算 motion > 0.05 占比
  let totalSelected = 0;
  let motionOkSelected = 0;
  let matchedSelected = 0;
  const details = [];
  const unmatched = [];

  for (const [id, count] of Object.entries(selectedCounts)) {
    const meta = selectionMeta[id] || {};
    const entry = findManifestEntry(lookup, id);
    const motion =
      meta.motion != null
        ? meta.motion
        : entry?.metrics?.motion != null
        ? Number(entry.metrics.motion)
        : null;
    const tier =
      meta.tier != null
        ? meta.tier
        : entry?.tier != null
        ? String(entry.tier)
        : 'unknown';
    totalSelected += count;
    if (Number.isFinite(motion)) {
      matchedSelected += count;
      const isMotionOk = motion > 0.05;
      if (isMotionOk) motionOkSelected += count;
      details.push({
        presetId: id,
        count,
        motion: Number(motion).toFixed(4),
        tier,
        motionOk: isMotionOk,
      });
    } else {
      unmatched.push({ presetId: id, count, tier });
    }
  }

  const ratio = matchedSelected > 0 ? (motionOkSelected / matchedSelected * 100).toFixed(1) : 0;
  const pass = parseFloat(ratio) >= 80 && matchedSelected > 0;

  // 4. 输出结果
  console.log('\n--- 统计结果 ---');
  console.log(`总选择次数：${totalSelected}`);
  console.log(`可匹配 motion 的次数：${matchedSelected}`);
  console.log(`motion > 0.05 选择次数：${motionOkSelected}`);
  console.log(`达标占比：${ratio}%`);
  console.log(`\n验收标准：motion > 0.05 的 preset 占比 > 80%`);
  console.log(`结果：${pass ? '✅ 通过' : '❌ 未通过'}`);

  // 5. 详细输出（前10）
  if (details.length > 0) {
    console.log('\n--- Top 10 详情 ---');
    details.sort((a, b) => b.count - a.count).slice(0, 10).forEach(d => {
      console.log(`  ${d.motionOk ? '✅' : '❌'} ${d.presetId}: ${d.count}次, motion=${d.motion}, tier=${d.tier}`);
    });
  }

  if (unmatched.length > 0) {
    console.log('\n--- 未匹配到 motion 的 Top 10 ---');
    unmatched
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .forEach((d) => {
        console.log(`  ⚠️ ${d.presetId}: ${d.count}次, tier=${d.tier}`);
      });
  }

  console.log('\n--- 用法 ---');
  console.log(`  # 基础统计`);
  console.log(`  node scripts/aivj/stat-selection-ratio.mjs`);
  console.log(`  # 指定 manifest 和日志`);
  console.log(`  node scripts/aivj/stat-selection-ratio.mjs --manifest=public/run-manifest.json --log=logs/aivj-selection.log`);

  if (!pass) {
    process.exitCode = 2;
  }

  return { ratio, pass, totalSelected, motionOkSelected, matchedSelected };
}

Promise.resolve()
  .then(() => main())
  .then(() => {
    if (process.exitCode == null) process.exitCode = 0;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode ?? 0), 0);
  });
