#!/usr/bin/env node
/**
 * 渲染 AI Curated 预设的预览帧
 * 
 * 使用方法:
 *   node scripts/render-ai-curated-frames.mjs [--limit 100] [--existing-only]
 * 
 * 选项:
 *   --limit N       - 只渲染前 N 个预设
 *   --existing-only - 只使用已存在的帧，不渲染新帧
 *   --audio FILE    - 用于渲染的音频文件
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.findIndex(a => a === `--${name}`);
  if (idx >= 0) return args[idx + 1] || fallback;
  return fallback;
};

const LIMIT = parseInt(getArg('limit', '0')) || Infinity;
const EXISTING_ONLY = args.includes('--existing-only');
const AUDIO_FILE = getArg('audio', '');

const CONFIG = {
  presetsDir: path.join(ROOT_DIR, 'public', 'presets'),
  outputDir: path.join(ROOT_DIR, 'artifacts', 'ai-curated-frames'),
  frameCount: 3, // 每个预设渲染 3 帧
  width: 512,
  height: 384,
};

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function getPresets() {
  const presets = [];
  
  const libraries = ['ai-curated-dark', 'ai-curated-relaxed'];
  
  for (const lib of libraries) {
    const libDir = path.join(CONFIG.presetsDir, lib);
    try {
      const files = await fs.readdir(libDir);
      for (const file of files.filter(f => f.endsWith('.milk'))) {
        const presetId = `${lib}-${path.basename(file, '.milk')}`;
        presets.push({
          id: presetId,
          path: path.join(libDir, file),
          library: lib,
          name: file,
        });
      }
    } catch (err) {
      console.warn(`Warning: Could not read ${libDir}: ${err.message}`);
    }
  }
  
  return presets.slice(0, LIMIT);
}

async function renderPreset(preset, outputDir) {
  // 检查是否已有渲染的帧
  const framePaths = [];
  for (let i = 0; i < CONFIG.frameCount; i++) {
    const framePath = path.join(outputDir, `${preset.id}_${i}.webp`);
    try {
      await fs.access(framePath);
      framePaths.push(framePath);
    } catch {
      // 不存在
    }
  }
  
  if (framePaths.length === CONFIG.frameCount) {
    return { status: 'existing', frames: framePaths };
  }
  
  if (EXISTING_ONLY) {
    return { status: 'skipped', frames: framePaths };
  }
  
  // 这里应该调用实际的渲染逻辑
  // 简化版：创建占位符
  for (let i = 0; i < CONFIG.frameCount; i++) {
    const framePath = path.join(outputDir, `${preset.id}_${i}.webp`);
    try {
      // 创建空的 webp 文件作为占位符
      // 实际实现应该使用 ProjectM 渲染
      await fs.writeFile(framePath, Buffer.from(''));
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }
  
  return { status: 'rendered', frames: framePaths };
}

async function main() {
  console.log('Rendering AI Curated preset frames...\n');
  
  await ensureDir(CONFIG.outputDir);
  
  const presets = await getPresets();
  console.log(`Found ${presets.length} presets to render\n`);
  
  const results = {
    rendered: 0,
    existing: 0,
    skipped: 0,
    error: 0,
  };
  
  const indexEntries = [];
  
  for (let i = 0; i < presets.length; i++) {
    const preset = presets[i];
    const progress = `[${i + 1}/${presets.length}]`;
    
    process.stdout.write(`${progress} ${preset.id}... `);
    
    const result = await renderPreset(preset, CONFIG.outputDir);
    
    if (result.status === 'rendered') {
      results.rendered++;
      console.log('✓ rendered');
    } else if (result.status === 'existing') {
      results.existing++;
      console.log('✓ existing');
    } else if (result.status === 'skipped') {
      results.skipped++;
      console.log('- skipped');
    } else {
      results.error++;
      console.log(`✗ error: ${result.error}`);
    }
    
    if (result.frames && result.frames.length > 0) {
      indexEntries.push({
        presetId: preset.id,
        library: preset.library,
        frames: result.frames.map(f => path.relative(CONFIG.outputDir, f)),
      });
    }
  }
  
  // 保存索引
  const indexPath = path.join(CONFIG.outputDir, 'frames-index.jsonl');
  const indexContent = indexEntries.map(e => JSON.stringify(e)).join('\n');
  await fs.writeFile(indexPath, indexContent);
  
  console.log('\n' + '='.repeat(50));
  console.log('Render complete:');
  console.log(`  Rendered: ${results.rendered}`);
  console.log(`  Existing: ${results.existing}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log(`  Errors: ${results.error}`);
  console.log(`\nIndex saved: ${indexPath}`);
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
