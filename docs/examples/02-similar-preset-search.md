# 示例 2: 相似预设搜索

基于 CLIP 嵌入向量搜索相似预设

## 基础用法

```typescript
import { 
  loadEmbeddingIndex, 
  findSimilarPresets 
} from 'newliveweb/features/presets';

// 加载索引
await loadEmbeddingIndex(
  '/embeddings/embeddings.npy',
  '/embeddings/ids.txt'
);

// 搜索相似预设
const similar = findSimilarPresets('current-preset.milk', {
  topK: 5,
  minSimilarity: 0.7
});

console.log(similar);
// [{ presetId: '...', similarity: 0.92, rank: 1 }, ...]
```

## 分块加载（大规模数据集）

```typescript
import { getChunkedEmbeddingIndex } from 'newliveweb/features/presets';

const index = getChunkedEmbeddingIndex();

// 加载并分块（内存优化）
await index.loadAndChunk(
  '/embeddings/embeddings.npy',
  '/embeddings/ids.txt',
  (loaded, total) => {
    console.log(`Loading: ${loaded}/${total}`);
  }
);

// 获取统计
const stats = index.getStats();
console.log(`Memory usage: ${stats.memoryUsageMB} MB`);
```

## Wasm 加速搜索

```typescript
import { getHnswWasmIndex } from 'newliveweb/features/presets';

const index = getHnswWasmIndex();
await index.initialize(512, 100000, presetIds);

// 批量添加向量
index.addItems(presetIds, embeddings);

// 搜索
const results = await index.search(queryVector, 10);
// [{ id, distance, similarity, presetId }, ...]
```

## 能量感知推荐

```typescript
import { getSmartRecommendations } from 'newliveweb/features/presets';

const recommendations = getSmartRecommendations(
  'current-preset.milk',
  { energy: 0.8, brightness: 0.7 },
  10
);
```
