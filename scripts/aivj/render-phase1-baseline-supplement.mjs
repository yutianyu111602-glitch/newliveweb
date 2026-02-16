#!/usr/bin/env node
/**
 * Phase 1: Baseline补充计划（2天）
 * 目标: 补齐baseline中超时/失败的preset
 * 特点: 保持原质量阈值，确保高质量数据
 */

import { renderPresetFrames } from './render-preset-frames.mjs';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const BASELINE_DIR = 'd:/aidata/long7d-techno-baseline-v1';
const OUTPUT_DIR = 'd:/aidata/phase1-baseline-supplement';

// 读取baseline的frames-index.jsonl，找出失败的preset
function getFailedPresets() {
  const indexFile = join(BASELINE_DIR, 'frames-index.jsonl');
  if (!existsSync(indexFile)) {
    console.error('[Phase1] Baseline index not found:', indexFile);
    process.exit(1);
  }

  const lines = readFileSync(indexFile, 'utf-8').trim().split('\n');
  const failedIds = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.status !== 'ok') {
        failedIds.push(entry.presetId);
      }
    } catch (err) {
      // skip invalid lines
    }
  }

  console.log(`[Phase1] Found ${failedIds.length} failed presets from baseline`);
  return failedIds;
}

async function main() {
  console.log('=== Phase 1: Baseline Supplement ===');
  console.log('Target: Retry failed presets from baseline');
  console.log('Duration: ~2 days');
  console.log('Output:', OUTPUT_DIR);
  console.log('');

  const failedPresets = getFailedPresets();

  if (failedPresets.length === 0) {
    console.log('[Phase1] No failed presets to retry. Baseline is already complete!');
    process.exit(0);
  }

  const config = {
    // 输入输出
    presetRoot: 'C:/Users/pc/code/newliveweb/public/presets',
    outputRoot: OUTPUT_DIR,

    // 只渲染失败的preset
    presetIds: failedPresets,

    // 保持baseline的高质量阈值
    frameLumaMin: 0.06,
    frameLumaMax: 0.96,
    frameMotionMin: 0.002,

    // 增加超时以应对慢preset
    timeoutMs: 60000, // 60s
    retryTimes: 3,

    // 捕获5帧
    captureCount: 5,
    captureMaxFrames: 100,
    warmupFrames: 30,

    // 看门狗
    watchdogIdleMs: 90000, // 90s idle
    watchdogMaxPresetMs: 180000, // 3min max per preset

    // 过滤配置
    maxLowBothRatio: 0.25,

    // 并发
    concurrency: 1,

    // Playwright
    headless: true,
    devTools: false
  };

  console.log('[Phase1] Configuration:');
  console.log('  Presets to retry:', failedPresets.length);
  console.log('  Quality thresholds: luma [0.06, 0.96], motion >= 0.002');
  console.log('  Timeout: 60s per preset');
  console.log('  Watchdog: 90s idle, 180s max');
  console.log('');

  try {
    await renderPresetFrames(config);
    console.log('[Phase1] ✓ Baseline supplement complete!');
  } catch (err) {
    console.error('[Phase1] ✗ Error:', err.message);
    process.exit(1);
  }
}

main();
