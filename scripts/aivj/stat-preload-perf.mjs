#!/usr/bin/env node
/**
 * 统计预取队列性能和卡顿
 * 用法：node scripts/aivj/stat-preload-perf.mjs --log <path>
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = process.argv.find(a => a.startsWith('--log='))?.split('=')[1] || join(__dirname, '../../logs/preload.log');
const FALLBACK_LOG = join(__dirname, '../../artifacts/headless/browser-console.log');

function getArgNumber(name, defaultValue) {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  if (raw == null) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

function main() {
  console.log('=== 预取/卡顿统计 ===\n');

  const frameThresholdMs = getArgNumber('frameThresholdMs', 33);
  const maxLagRatePct = getArgNumber('maxLagRatePct', 5);
  const gate = getArgNumber('gate', 1) !== 0;

  let log = '';
  let usedLog = LOG_PATH;
  if (existsSync(LOG_PATH)) {
    try {
      log = readFileSync(LOG_PATH, 'utf-8');
      console.log(`[INFO] 加载日志: ${log.length} bytes`);
    } catch (e) {
      console.warn(`[WARN] 日志读取失败: ${e.message}`);
    }
  } else if (existsSync(FALLBACK_LOG)) {
    try {
      log = readFileSync(FALLBACK_LOG, 'utf-8');
      usedLog = FALLBACK_LOG;
      console.log(`[INFO] 使用 fallback 日志: ${FALLBACK_LOG}`);
    } catch (e) {
      console.warn(`[WARN] fallback 日志读取失败: ${e.message}`);
    }
  } else {
    console.error(`[ERROR] 日志文件不存在: ${LOG_PATH}`);
    process.exitCode = 2;
    return { skipCount: 0, lagRate: 0, avgTime: 0, batchDist: {}, passLag: false, passSkip: false };
  }

  // 1. 统计预取跳过
  const skipMatches = log.matchAll(/\[Preload\] Skip (\S+)/g);
  const skipCount = [...skipMatches].length;

  // 2. 统计卡顿（frame-time > threshold）
  const extractFrameTimes = (text) =>
    [...text.matchAll(/frame-time (\d+)ms/g)].map((m) => parseInt(m[1]));
  let frameTimes = extractFrameTimes(log);
  if (frameTimes.length === 0 && usedLog !== FALLBACK_LOG && existsSync(FALLBACK_LOG)) {
    try {
      const fallbackText = readFileSync(FALLBACK_LOG, 'utf-8');
      const fallbackFrames = extractFrameTimes(fallbackText);
      if (fallbackFrames.length > 0) {
        console.log(`[INFO] 使用 fallback 的 frame-time 采样: ${FALLBACK_LOG}`);
        frameTimes = fallbackFrames;
      }
    } catch (e) {
      console.warn(`[WARN] fallback 日志读取失败: ${e.message}`);
    }
  }
  const lagFrames = frameTimes.filter((t) => t > frameThresholdMs).length;
  const totalFrames = frameTimes.length;

  // 3. 统计 batchSize 变化
  const batchMatches = log.matchAll(/batchSize (\d+)|batch=(\d+)/g);
  const batchSizes = [...batchMatches]
    .map(m => parseInt(m[1] || m[2]))
    .filter(n => Number.isFinite(n));
  const batchDist = batchSizes.reduce((a, b) => { a[b] = (a[b]||0)+1; return a; }, {});

  // 4. 统计预取耗时
  const timeMatches = log.matchAll(/\[Preload\] batch done in (\d+)ms/g);
  const times = [...timeMatches].map(m => parseInt(m[1]));
  const avgTime = times.length > 0 ? (times.reduce((a,b) => a+b, 0) / times.length).toFixed(1) : 0;
  const maxTime = times.length > 0 ? Math.max(...times) : 0;

  // 5. 统计失败原因
  const failMatches = log.matchAll(/\[Preload\] Failed: (\S+) \((.+)\)/g);
  const failReasons = {};
  for (const m of failMatches) {
    const type = m[1];
    const reason = m[2];
    failReasons[type] = (failReasons[type] || 0) + 1;
  }

  // 验收判断
  const lagRate = totalFrames > 0 ? (lagFrames / totalFrames * 100) : 0;
  const passLag = totalFrames > 0 && lagRate < maxLagRatePct;
  const passSkip = skipCount > 0;

  // 输出
  console.log('--- 预取统计 ---');
  console.log(`预取跳过次数：${skipCount}`);
  console.log(`预取平均耗时：${avgTime}ms (max: ${maxTime}ms)`);

  console.log('\n--- 性能统计 ---');
  console.log(`总帧数：${totalFrames}`);
  console.log(`阈值：frame-time > ${frameThresholdMs}ms`);
  console.log(`卡顿样本数：${lagFrames}`);
  console.log(`卡顿率：${lagRate.toFixed(2)}%`);
  console.log(`batchSize 分布：${JSON.stringify(batchDist)}`);

  if (Object.keys(failReasons).length > 0) {
    console.log('\n--- 失败原因分布 ---');
    for (const [reason, count] of Object.entries(failReasons)) {
      console.log(`  ${reason}: ${count}`);
    }
  }

  console.log('\n--- 验收结果 ---');
  console.log(`预取跳过生效：${passSkip ? '✅' : '❌'} (skipCount: ${skipCount})`);
  console.log(`卡顿率 < ${maxLagRatePct}%：${passLag ? '✅' : '❌'} (${lagRate.toFixed(2)}%)`);
  if (totalFrames === 0) {
    console.log(`[WARN] 未找到 frame-time 采样，请确认 verify 期间启用了性能采样输出。`);
    console.log(`[WARN] 日志路径: ${usedLog}`);
    if (gate) process.exitCode = 2;
  }
  if (totalFrames > 0 && !passLag) {
    if (gate) process.exitCode = 2;
  }

  console.log('\n--- 用法 ---');
  console.log(`  # 基础统计`);
  console.log(`  node scripts/aivj/stat-preload-perf.mjs`);
  console.log(`  # 指定日志文件`);
  console.log(`  node scripts/aivj/stat-preload-perf.mjs --log=logs/preload.log`);
  console.log(`  # 自定义阈值与验收线`);
  console.log(`  node scripts/aivj/stat-preload-perf.mjs --frameThresholdMs=120 --maxLagRatePct=50`);
  console.log(`  # 仅统计（不作为门禁，永远 exit 0）`);
  console.log(`  node scripts/aivj/stat-preload-perf.mjs --gate=0`);

  return { skipCount, lagRate, avgTime, batchDist, passLag, passSkip };
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
