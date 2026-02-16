# NewLiveWeb 开发者指南

> 开源库替换后的开发文档

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行测试
npm test
```

## 架构概览

```
src/
├── audio/              # 音频分析模块
│   ├── MeydaAudioAnalyzer.ts
│   ├── AudioBusOptimized.ts
│   └── workers/        # Web Worker
├── features/
│   ├── presets/        # 预设管理
│   │   ├── presetSimilaritySearch.ts
│   │   ├── banditRecommender.ts
│   │   ├── reactivePresetSwitcher.ts
│   │   └── chunkedEmbeddingIndex.ts
│   └── analytics/      # 用户分析
├── utils/              # 工具函数
│   ├── objectPool.ts
│   ├── embeddingCompression.ts
│   └── errorBoundary.ts
├── config/             # 配置
│   └── featureFlags.ts
└── wasm/               # Rust/Wasm
    └── src/
```

## 模块详解

### 音频分析

- **MeydaAudioAnalyzer**: 基于 Meyda 的实时特征提取
- **AudioBusOptimized**: 兼容原 AudioBus 的优化实现
- **音频 Worker**: 在独立线程中处理音频

### 预设推荐

- **相似搜索**: 基于 CLIP 嵌入向量
- **Bandit**: Thompson Sampling 在线学习
- **反应式切换**: 基于音频特征的自动切换

### 性能优化

- **分块加载**: 100k+ 预设的内存优化
- **Wasm HNSW**: 快速向量检索
- **对象池**: 减少 GC 压力
- **Embedding 压缩**: Float32 -> Float16

## 特性开关

```typescript
import { isFeatureEnabled, overrideFeature } from './config/featureFlags';

// 检查特性
if (isFeatureEnabled('useWasmIndex')) {
  // 使用 Wasm 索引
}

// 临时覆盖（测试用）
const restore = overrideFeature('useWasmIndex', false);
// ... 测试代码
restore();
```

## 错误处理

```typescript
import { getErrorBoundary, WasmErrorHandler } from './utils/errorBoundary';

const boundary = getErrorBoundary();

// 注册处理器
boundary.registerHandler('wasm', new WasmErrorHandler(() => {
  console.log('Wasm failed, using JS fallback');
}));

// 捕获错误
boundary.capture(new Error('Something went wrong'), { context: 'audio' });
```

## 性能监控

```typescript
import { getPerformanceMonitor } from './utils/performanceMonitor';

const monitor = getPerformanceMonitor();

// 记录帧时间
monitor.recordFrameTime(16);

// 监听警告
monitor.onWarning((metric, value, threshold) => {
  console.warn(`${metric} exceeded: ${value} > ${threshold}`);
});

// 获取统计
const stats = monitor.getStats();
console.log(`Avg frame time: ${stats.avgFrameTime}ms`);
```

## 调试技巧

### 启用详细日志

```typescript
import { overrideFeature } from './config/featureFlags';

overrideFeature('logLevel', 'debug');
```

### 性能分析

```typescript
// 开始性能记录
const stopMonitoring = monitor.startMemoryMonitoring(1000);

// ... 运行一段时间后
stopMonitoring();

// 导出结果
console.table(monitor.getStats());
```

### Wasm 调试

```bash
# 构建调试版本
cd wasm
wasm-pack build --dev --target web
```

## 常见问题

### Q: Wasm 加载失败？

A: 检查浏览器兼容性，并确保有 JS 回退：

```typescript
const useWasm = isFeatureEnabled('useWasmIndex') && isWasmSupported();
```

### Q: 内存占用过高？

A: 使用分块加载：

```typescript
const index = getChunkedEmbeddingIndex();
await index.loadAndChunk(embeddingsUrl, idsUrl);
```

### Q: 音频延迟？

A: 启用 Worker：

```typescript
const worker = getAudioAnalyzerWorker();
await worker.initialize();
```

## 扩展开发

### 添加新的特征提取器

```typescript
// 在 MeydaAudioAnalyzer.ts 中添加
extractCustomFeatures(pcm: Float32Array): CustomFeatures {
  // 实现
}
```

### 自定义推荐策略

```typescript
class CustomRecommender extends BanditRecommender {
  recommend(arms, context) {
    // 自定义逻辑
    return super.recommend(arms, context);
  }
}
```

## 贡献指南

1. 遵循现有代码风格
2. 添加单元测试
3. 更新文档
4. 提交 PR

## 参考

- [Meyda Documentation](https://meyda.js.org/)
- [Essentia.js Docs](https://mtg.github.io/essentia.js/)
- [HNSW Paper](https://arxiv.org/abs/1603.09320)
