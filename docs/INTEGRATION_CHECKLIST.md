# 新模块集成检查清单

## 编译状态
- [x] TypeScript 编译通过 (`npm run lint`)

## 模块入口

### Presets 模块
```typescript
import {
  // 相似搜索
  loadEmbeddingIndex,
  findSimilarPresets,
  
  // Bandit 推荐
  BanditRecommender,
  getBanditRecommender,
  
  // 反应式切换
  ReactivePresetSwitcher,
  getReactivePresetSwitcher,
  
  // 分块索引
  ChunkedEmbeddingIndex,
  getChunkedEmbeddingIndex,
  
  // 能量过滤
  filterByEnergy,
  inferEnergyFromAudio,
  SmoothEnergy,
  
  // Wasm HNSW
  HnswWasmIndex,
  getHnswWasmIndex,
} from "./features/presets";
```

### Utils 模块
```typescript
import {
  // 对象池
  ObjectPool,
  globalFloat32Pool,
  
  // 压缩
  compressToFloat16,
  compressToUint8,
  
  // 错误处理
  ErrorBoundary,
  getErrorBoundary,
  WasmErrorHandler,
  
  // 性能监控
  PerformanceMonitor,
  getPerformanceMonitor,
} from "./utils";
```

### Analytics 模块
```typescript
import {
  UserAnalyticsCollector,
  getUserAnalyticsCollector,
} from "./features/analytics";
```

### Config 模块
```typescript
import {
  getFeatureFlags,
  isFeatureEnabled,
  withFeatureFallback,
} from "./config";
```

### Audio 模块
```typescript
import {
  AudioBus,
  MeydaAudioAnalyzer,
  getAudioAnalyzerWorker,
} from "./audio";
```

## 功能验证

### 1. BanditRecommender
```typescript
const bandit = getBanditRecommender();
bandit.addArm("techno");
bandit.addArm("ambient");

const context = createBanditContext(audioFrame, "peak");
const rec = bandit.recommend(["techno", "ambient"], context);

bandit.recordFeedback({
  armId: rec.armId,
  action: "favorite",
  durationMs: 10000,
  context,
});

// 序列化
const state = bandit.serialize();
bandit.deserialize(state);
```

### 2. ReactivePresetSwitcher
```typescript
const switcher = getReactivePresetSwitcher();
switcher.setCandidatePresets(["preset1", "preset2", "preset3"]);

switcher.onSwitch((event) => {
  console.log(`Switched: ${event.previousPresetId} -> ${event.nextPresetId}`);
  loadPreset(event.nextPresetId);
});

// 在音频帧回调中
audioBus.onFrame((frame) => {
  switcher.onAudioFrame(frame);
});
```

### 3. ChunkedEmbeddingIndex
```typescript
const index = getChunkedEmbeddingIndex();
await index.loadAndChunk(
  "/embeddings/embeddings.npy",
  "/embeddings/ids.txt"
);

const stats = index.getStats();
console.log(`Memory: ${stats.memoryUsageMB} MB`);
```

### 4. ErrorBoundary
```typescript
const boundary = getErrorBoundary();

boundary.registerHandler("wasm", new WasmErrorHandler(() => {
  console.log("Wasm failed, using JS fallback");
  useJsIndex();
}));

boundary.capture(error, { context: "audio" });
```

### 5. PerformanceMonitor
```typescript
const monitor = getPerformanceMonitor();

monitor.onWarning((metric, value, threshold) => {
  console.warn(`${metric}: ${value} > ${threshold}`);
});

// 在动画循环中
monitor.recordFrameTime(deltaTime);
```

## 特性开关集成

```typescript
if (isFeatureEnabled("useWasmIndex")) {
  const index = getHnswWasmIndex();
  await index.initialize(512, 100000);
}

if (isFeatureEnabled("useWorker")) {
  const worker = getAudioAnalyzerWorker();
  await worker.initialize();
}

if (isFeatureEnabled("useReactiveSwitch")) {
  const switcher = getReactivePresetSwitcher();
}
```

## 构建前检查

1. [x] 所有类型导出正确
2. [x] 单例模式实现完整
3. [x] 无循环依赖
4. [x] 编译通过
5. [ ] Wasm 模块已构建 (`cd wasm && .\build.ps1`)
6. [ ] 单元测试通过
7. [ ] 集成测试通过

## 已知限制

1. **Wasm HNSW**: 需要先运行构建脚本才能使用
2. **能量过滤**: `getSmartRecommendations` 需要与实际的相似搜索集成
3. **Worker**: 开发环境可能需要在浏览器中测试

## 下一步

1. 运行 `cd wasm && .\build.ps1` 生成 Wasm 模块
2. 运行 `npm test` 执行单元测试
3. 在浏览器中测试功能集成
