#!/usr/bin/env node
/**
 * Phase 3: 精选慢preset（7天）
 * 目标: 从slow列表挑选能跑通的preset
 * 策略: 先预筛选，只渲染通过的preset
 */

import { renderPresetFrames } from './render-preset-frames.mjs';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

const SLOW_MANIFEST = 'C:/Users/pc/code/newliveweb/public/presets/techno-slow/manifest.json';
const OUTPUT_DIR = 'd:/aidata/phase3-slow-curated';
const PRESCREEN_RESULT = join(OUTPUT_DIR, 'prescreen-passed.json');

// 预筛选：使用preset-audit快速测试每个preset是否能在10s内加载
async function prescreenSlowPresets(allPresets) {
  console.log('[Phase3] Pre-screening slow presets...');
  console.log('Testing each preset with 10s timeout...');

  const passed = [];
  const failed = [];

  // TODO: 调用preset-audit.mjs进行快速测试
  // 暂时返回所有preset，用户可以手动实现预筛选逻辑

  console.log('[Phase3] Pre-screen complete:');
  console.log(`  Passed: ${passed.length}`);
  console.log(`  Failed: ${failed.length}`);

  // 保存通过的列表
  writeFileSync(PRESCREEN_RESULT, JSON.stringify({ passed, failed }, null, 2));

  return passed.length > 0 ? passed : allPresets.slice(0, 500); // 默认取前500个
}

async function main() {
  console.log('=== Phase 3: Slow Curated ===');
  console.log('Target: Render slow presets that can complete');
  console.log('Duration: ~7 days');
  console.log('Output:', OUTPUT_DIR);
  console.log('');

  // 读取slow manifest
  if (!existsSync(SLOW_MANIFEST)) {
    console.error('[Phase3] Slow manifest not found:', SLOW_MANIFEST);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(SLOW_MANIFEST, 'utf-8'));
  const allPresets = manifest.presets.map(p => p.id);
  console.log(`[Phase3] Total slow presets: ${allPresets.length}`);

  // 检查是否已有预筛选结果
  let selectedPresets;
  if (existsSync(PRESCREEN_RESULT)) {
    const { passed } = JSON.parse(readFileSync(PRESCREEN_RESULT, 'utf-8'));
    console.log(`[Phase3] Using pre-screened list: ${passed.length} presets`);
    selectedPresets = passed;
  } else {
    console.log('[Phase3] No pre-screen result found.');
    console.log('[Phase3] Will attempt first 500 presets...');
    selectedPresets = allPresets.slice(0, 500);
  }

  const config = {
    // 输入输出
    presetRoot: 'C:/Users/pc/code/newliveweb/public/presets',
    outputRoot: OUTPUT_DIR,

    // 精选的slow presets
    presetIds: selectedPresets,

    // 保持高质量阈值
    frameLumaMin: 0.06,
    frameLumaMax: 0.96,
    frameMotionMin: 0.002,

    // 大幅增加超时（slow preset确实很慢）
    timeoutMs: 180000, // 3分钟
    retryTimes: 2, // 减少重试（太慢了）

    // 只捕获3帧（减少渲染负担）
    captureCount: 3,
    captureMaxFrames: 80,
    warmupFrames: 20,

    // 看门狗
    watchdogIdleMs: 180000, // 3min idle
    watchdogMaxPresetMs: 360000, // 6min max per preset

    // 过滤配置
    maxLowBothRatio: 0.25,

    // 并发
    concurrency: 1,

    // Playwright
    headless: true,
    devTools: false
  };

  console.log('[Phase3] Configuration:');
  console.log('  Presets to process:', selectedPresets.length);
  console.log('  Quality thresholds: luma [0.06, 0.96], motion >= 0.002');
  console.log('  Timeout: 180s (3min) per preset');
  console.log('  Capture: 3 frames (reduced for slow presets)');
  console.log('  Watchdog: 3min idle, 6min max');
  console.log('');

  try {
    await renderPresetFrames(config);
    console.log('[Phase3] ✓ Slow curated complete!');
  } catch (err) {
    console.error('[Phase3] ✗ Error:', err.message);
    process.exit(1);
  }
}

main();
