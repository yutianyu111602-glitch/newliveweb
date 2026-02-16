#!/usr/bin/env node
/**
 * Phase 2: Fusion完成计划（5天）
 * 目标: 完成fusion剩余10723个preset
 * 特点: 90s超时，适配parallax渲染
 */

import { renderPresetFrames } from './render-preset-frames.mjs';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const FUSION_DIR = 'd:/aidata/long7d-techno-fusion-v1';
const OUTPUT_DIR = 'd:/aidata/phase2-fusion-complete';
const FUSION_MANIFEST = 'C:/Users/pc/code/newliveweb/public/presets/techno-fusion-overlay/manifest.json';

// 读取fusion完整列表，排除已完成的
function getRemainingPresets() {
  // 读取fusion manifest
  if (!existsSync(FUSION_MANIFEST)) {
    console.error('[Phase2] Fusion manifest not found:', FUSION_MANIFEST);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(FUSION_MANIFEST, 'utf-8'));
  const allPresets = manifest.presets.map(p => p.id);
  console.log(`[Phase2] Total fusion presets in manifest: ${allPresets.length}`);

  // 读取已完成的
  const indexFile = join(FUSION_DIR, 'frames-index.jsonl');
  const completed = new Set();

  if (existsSync(indexFile)) {
    const lines = readFileSync(indexFile, 'utf-8').trim().split('\n');
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.status === 'ok') {
          completed.add(entry.presetId);
        }
      } catch (err) {}
    }
  }

  console.log(`[Phase2] Already completed: ${completed.size}`);

  const remaining = allPresets.filter(id => !completed.has(id));
  console.log(`[Phase2] Remaining to process: ${remaining.length}`);

  return remaining;
}

async function main() {
  console.log('=== Phase 2: Fusion Complete ===');
  console.log('Target: Complete remaining fusion presets');
  console.log('Duration: ~5 days');
  console.log('Output:', OUTPUT_DIR);
  console.log('');

  const remainingPresets = getRemainingPresets();

  if (remainingPresets.length === 0) {
    console.log('[Phase2] No remaining presets. Fusion is already complete!');
    process.exit(0);
  }

  const config = {
    // 输入输出
    presetRoot: 'C:/Users/pc/code/newliveweb/public/presets',
    outputRoot: OUTPUT_DIR,

    // 剩余的fusion presets
    presetIds: remainingPresets,

    // Fusion需要parallax overlay
    overlayMode: 'parallax',
    overlayBlend: 0.5,

    // 保持高质量阈值
    frameLumaMin: 0.06,
    frameLumaMax: 0.96,
    frameMotionMin: 0.005, // 稍微提高motion要求（parallax应该有更多动态）

    // 增加超时以应对parallax双倍渲染
    timeoutMs: 90000, // 90s for parallax
    retryTimes: 3,

    // 捕获5帧
    captureCount: 5,
    captureMaxFrames: 100,
    warmupFrames: 30,

    // 看门狗
    watchdogIdleMs: 120000, // 2min idle
    watchdogMaxPresetMs: 240000, // 4min max per preset

    // 过滤配置
    maxLowBothRatio: 0.25,

    // 并发
    concurrency: 1,

    // Playwright
    headless: true,
    devTools: false
  };

  console.log('[Phase2] Configuration:');
  console.log('  Presets to process:', remainingPresets.length);
  console.log('  Overlay: parallax (blend 0.5)');
  console.log('  Quality thresholds: luma [0.06, 0.96], motion >= 0.005');
  console.log('  Timeout: 90s per preset (for parallax)');
  console.log('  Watchdog: 2min idle, 4min max');
  console.log('');

  try {
    await renderPresetFrames(config);
    console.log('[Phase2] ✓ Fusion complete!');
  } catch (err) {
    console.error('[Phase2] ✗ Error:', err.message);
    process.exit(1);
  }
}

main();
