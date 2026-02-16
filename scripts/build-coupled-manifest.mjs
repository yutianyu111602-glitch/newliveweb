#!/usr/bin/env node
/**
 * 生成 AI Coupled 3D 预设配对清单
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const BG_DIR = path.join(ROOT_DIR, 'public', 'presets', 'ai-coupled', 'bg');
const FG_DIR = path.join(ROOT_DIR, 'public', 'presets', 'ai-coupled', 'fg');
const OUTPUT = path.join(ROOT_DIR, 'public', 'presets', 'ai-coupled', 'coupled-manifest.json');

async function buildManifest() {
  console.log('Building coupled manifest...');
  console.log(`  BG dir: ${BG_DIR}`);
  console.log(`  FG dir: ${FG_DIR}`);
  
  // 读取所有 BG 文件
  const bgFiles = await fs.readdir(BG_DIR);
  const fgFiles = await fs.readdir(FG_DIR);
  
  // 提取编号和时间戳
  // 格式: coupled_00000_20260129_015409_bg.milk
  const parseFilename = (filename) => {
    const match = filename.match(/coupled_(\d+)_(\d{8}_\d{6})_(bg|fg)/);
    if (!match) {
      // 尝试简化模式
      const simpleMatch = filename.match(/coupled_(\d+)_.*?_(bg|fg)/);
      if (!simpleMatch) return null;
      return {
        id: simpleMatch[1],
        timestamp: 'unknown',
        type: simpleMatch[2],
        filename
      };
    }
    return {
      id: match[1],
      timestamp: match[2],
      type: match[3],
      filename
    };
  };
  
  // 组织 BG 文件（按编号分组）
  const bgMap = new Map();
  for (const file of bgFiles) {
    if (!file.endsWith('.milk')) continue;
    const parsed = parseFilename(file);
    if (!parsed) continue;
    
    if (!bgMap.has(parsed.id)) {
      bgMap.set(parsed.id, []);
    }
    bgMap.get(parsed.id).push(parsed);
  }
  
  // 组织 FG 文件
  const fgMap = new Map();
  for (const file of fgFiles) {
    if (!file.endsWith('.milk')) continue;
    const parsed = parseFilename(file);
    if (!parsed) continue;
    
    if (!fgMap.has(parsed.id)) {
      fgMap.set(parsed.id, []);
    }
    fgMap.get(parsed.id).push(parsed);
  }
  
  // 生成配对
  const pairs = [];
  const pairedIds = new Set();
  
  // 方法：对于每个 BG，找一个匹配的 FG（相同编号，最新时间戳）
  for (const [id, bgList] of bgMap) {
    const fgList = fgMap.get(id);
    if (!fgList || fgList.length === 0) continue;
    
    // 按时间戳排序，取最新的
    const latestBg = bgList.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    const latestFg = fgList.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    
    pairs.push({
      id: `coupled_${id}`,
      bg: {
        path: `bg/${latestBg.filename}`,
        id: `${id}_bg`,
        timestamp: latestBg.timestamp
      },
      fg: {
        path: `fg/${latestFg.filename}`,
        id: `${id}_fg`,
        timestamp: latestFg.timestamp
      }
    });
    
    pairedIds.add(id);
  }
  
  // 生成 manifest
  const manifest = {
    version: '1.0.0',
    type: 'coupled',
    description: 'AI Generated 3D Coupled Presets (BG + FG pairs)',
    generatedAt: new Date().toISOString(),
    stats: {
      totalPairs: pairs.length,
      totalBg: bgFiles.filter(f => f.endsWith('.milk')).length,
      totalFg: fgFiles.filter(f => f.endsWith('.milk')).length,
      pairedIds: pairedIds.size
    },
    pairs: pairs
  };
  
  await fs.writeFile(OUTPUT, JSON.stringify(manifest, null, 2));
  
  console.log(`\n✅ Generated coupled manifest:`);
  console.log(`  - Total pairs: ${pairs.length}`);
  console.log(`  - BG files: ${manifest.stats.totalBg}`);
  console.log(`  - FG files: ${manifest.stats.totalFg}`);
  console.log(`  - Output: ${OUTPUT}`);
}

buildManifest().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
