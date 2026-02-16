#!/usr/bin/env node
/**
 * 构建 AI 预设元数据索引
 * 
 * 为 AI 预设创建丰富的元数据，用于推荐和搜索
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const CONFIG = {
  presetsDir: path.join(ROOT_DIR, 'public', 'presets'),
  outputDir: path.join(ROOT_DIR, 'public', 'presets', 'ai-metadata'),
};

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// 解析 milk 文件获取基本参数
async function parseMilkFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    
    const params = {};
    for (const line of lines) {
      // 提取 fRating
      if (line.startsWith('fRating=')) {
        params.fRating = parseFloat(line.split('=')[1]);
      }
      // 提取 warp
      else if (line.startsWith('warp=')) {
        params.warp = parseFloat(line.split('=')[1]);
      }
      // 提取 decay
      else if (line.startsWith('fDecay=')) {
        params.decay = parseFloat(line.split('=')[1]);
      }
      // 提取 gamma
      else if (line.startsWith('fGammaAdj=')) {
        params.gamma = parseFloat(line.split('=')[1]);
      }
      // 提取 wave 模式
      else if (line.startsWith('nWaveMode=')) {
        params.waveMode = parseInt(line.split('=')[1]);
      }
      // 提取 wave 缩放
      else if (line.startsWith('fWaveScale=')) {
        params.waveScale = parseFloat(line.split('=')[1]);
      }
    }
    
    // 计算特征标签
    const tags = [];
    if (params.fRating >= 4.5) tags.push('high-quality');
    if (params.fRating >= 3.0 && params.fRating < 4.5) tags.push('medium-quality');
    if (params.warp > 0.5) tags.push('high-warp');
    if (params.warp < 0.2) tags.push('low-warp');
    if (params.decay > 0.9) tags.push('long-trail');
    if (params.decay < 0.5) tags.push('short-trail');
    if (params.waveMode === 0) tags.push('no-wave');
    if (params.waveMode >= 1 && params.waveMode <= 3) tags.push('simple-wave');
    if (params.waveMode >= 4) tags.push('complex-wave');
    
    return { params, tags };
  } catch (err) {
    return { params: {}, tags: [], error: err.message };
  }
}

// 生成模拟的 embedding（基于参数）
function generatePseudoEmbedding(metadata) {
  // 使用参数生成确定性的伪 embedding
  // 这样相似的预设会有相似的 embedding
  const seed = metadata.params.fRating * 1000 + 
               metadata.params.warp * 100 + 
               metadata.params.decay * 100;
  
  const embedding = [];
  for (let i = 0; i < 512; i++) {
    // 简单的伪随机数生成
    const x = Math.sin(seed + i * 0.1) * 1000;
    embedding.push(x - Math.floor(x));
  }
  
  // 归一化
  const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
  return embedding.map(x => x / norm);
}

async function main() {
  console.log('Building AI preset metadata index...\n');
  
  await ensureDir(CONFIG.outputDir);
  
  const libraries = [
    { name: 'ai-curated-dark', path: path.join(CONFIG.presetsDir, 'ai-curated-dark') },
    { name: 'ai-curated-relaxed', path: path.join(CONFIG.presetsDir, 'ai-curated-relaxed') },
  ];
  
  const allMetadata = [];
  const allEmbeddings = [];
  const allIds = [];
  
  for (const lib of libraries) {
    console.log(`Processing ${lib.name}...`);
    
    try {
      const files = await fs.readdir(lib.path);
      const milkFiles = files.filter(f => f.endsWith('.milk'));
      
      for (const file of milkFiles) {
        const filePath = path.join(lib.path, file);
        const presetId = `${lib.name}-${path.basename(file, '.milk')}`;
        
        const metadata = await parseMilkFile(filePath);
        
        const entry = {
          id: presetId,
          library: lib.name,
          file: file,
          filePath: path.relative(ROOT_DIR, filePath),
          ...metadata,
          generatedAt: new Date().toISOString(),
        };
        
        allMetadata.push(entry);
        
        // 生成伪 embedding
        const embedding = generatePseudoEmbedding(metadata);
        allEmbeddings.push(embedding);
        allIds.push(presetId);
        
        process.stdout.write('.');
      }
      
      console.log(` ${milkFiles.length} presets`);
    } catch (err) {
      console.warn(`Warning: Could not process ${lib.name}: ${err.message}`);
    }
  }
  
  // 保存元数据索引
  const metadataPath = path.join(CONFIG.outputDir, 'metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify({
    version: '1.0.0',
    count: allMetadata.length,
    createdAt: new Date().toISOString(),
    presets: allMetadata,
  }, null, 2));
  
  // 保存 embeddings（Float32Array 格式）
  const embeddingsPath = path.join(CONFIG.outputDir, 'embeddings.npy');
  const embeddingsBuffer = Buffer.alloc(allEmbeddings.length * allEmbeddings[0].length * 4);
  for (let i = 0; i < allEmbeddings.length; i++) {
    for (let j = 0; j < allEmbeddings[i].length; j++) {
      embeddingsBuffer.writeFloatLE(allEmbeddings[i][j], (i * 512 + j) * 4);
    }
  }
  await fs.writeFile(embeddingsPath, embeddingsBuffer);
  
  // 保存 IDs
  const idsPath = path.join(CONFIG.outputDir, 'ids.txt');
  await fs.writeFile(idsPath, allIds.join('\n'));
  
  // 创建简化的搜索索引
  const searchIndex = allMetadata.map(m => ({
    id: m.id,
    library: m.library,
    fRating: m.params.fRating,
    tags: m.tags,
  }));
  
  const searchIndexPath = path.join(CONFIG.outputDir, 'search-index.json');
  await fs.writeFile(searchIndexPath, JSON.stringify(searchIndex, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log('Metadata index built:');
  console.log(`  Total presets: ${allMetadata.length}`);
  console.log(`  Metadata: ${metadataPath}`);
  console.log(`  Embeddings: ${embeddingsPath}`);
  console.log(`  IDs: ${idsPath}`);
  console.log(`  Search index: ${searchIndexPath}`);
  
  // 统计标签
  const tagCounts = {};
  for (const m of allMetadata) {
    for (const tag of m.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  
  console.log('\nTag distribution:');
  for (const [tag, count] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tag}: ${count}`);
  }
  
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
