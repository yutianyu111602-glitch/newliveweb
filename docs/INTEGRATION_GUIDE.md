# 新功能集成指南

> 如何在现有代码中使用新模块

---

## 1. 快速启用 Bandit 推荐

### 1.1 在 bootstrap.ts 中添加反馈记录

```typescript
// 在文件顶部导入
import { 
  getBanditRecommender, 
  createBanditContext 
} from "../features/presets";

// 在反馈记录处（搜索 recordFeedbackLike）
// 原始代码：
recordFeedbackLike(currentPresetId);

// 添加 Bandit 反馈：
const bandit = getBanditRecommender();
const audioFrame = audioBus.getSnapshot(); // 或从某处获取
bandit.recordFeedback({
  armId: getClusterForPreset(currentPresetId), // 需要映射函数
  action: "favorite",
  durationMs: 10000,
  context: createBanditContext(audioFrame, "peak"),
});
```

### 1.2 在预设选择时使用 Bandit 推荐

```typescript
// 在 AIVJ Controller 或选择逻辑中
import { getBanditRecommender } from "../features/presets";

function selectNextPreset(
  availablePresets: string[], 
  audioFrame: AudioFrame
): string {
  const bandit = getBanditRecommender();
  
  // 将 preset ID 映射到 cluster ID
  const armIds = availablePresets.map(p => getClusterForPreset(p));
  
  // 获取推荐
  const rec = bandit.recommend(
    armIds,
    createBanditContext(audioFrame)
  );
  
  // 将 cluster ID 映射回 preset ID
  return getPresetForCluster(rec.armId, availablePresets);
}
```

---

## 2. 启用反应式自动切换

### 2.1 在 bootstrap.ts 中初始化

```typescript
// 文件顶部导入
import { getReactivePresetSwitcher } from "../features/presets";

// 在初始化代码中
const switcher = getReactivePresetSwitcher();

// 设置候选预设
switcher.setCandidatePresets(allPresetIds);

// 监听切换事件
switcher.onSwitch((event) => {
  console.log(`Auto switch: ${event.type}`);
  
  // 调用现有的预设加载逻辑
  loadPreset(event.nextPresetId);
});

// 在音频帧回调中
audioBus.onFrame((frame) => {
  // 原有处理...
  
  // 添加反应式切换
  switcher.onAudioFrame(frame);
});
```

### 2.2 配置切换参数

```typescript
import { getReactivePresetSwitcher } from "../features/presets";

const switcher = getReactivePresetSwitcher();
switcher.updateConfig({
  energySpikeThreshold: 0.3,    // 能量突增 30% 触发
  beatDropThreshold: 0.8,       // 节拍强度阈值
  minSwitchIntervalMs: 5000,    // 最小切换间隔 5 秒
});
```

---

## 3. 启用相似预设搜索

### 3.1 加载 Embedding 索引

```typescript
import { 
  loadEmbeddingIndex,
  findSimilarPresets 
} from "../features/presets";

// 在初始化时加载
async function initSimilaritySearch() {
  await loadEmbeddingIndex(
    "/embeddings/pack/embeddings.npy",
    "/embeddings/pack/ids.txt"
  );
}

// 搜索相似预设
function onFindSimilar(currentPresetId: string) {
  const similar = findSimilarPresets(currentPresetId, {
    topK: 5,
    minSimilarity: 0.7,
  });
  
  console.log("Similar presets:", similar);
  // 显示在 UI 上
}
```

### 3.2 使用分块索引（大规模数据集）

```typescript
import { getChunkedEmbeddingIndex } from "../features/presets";

const index = getChunkedEmbeddingIndex();
await index.loadAndChunk(
  "/embeddings/large/embeddings.npy",
  "/embeddings/large/ids.txt"
);

// 监控内存使用
const stats = index.getStats();
console.log(`Memory: ${stats.memoryUsageMB} MB`);
```

---

## 4. 启用性能监控

### 4.1 在 bootstrap.ts 中添加监控

```typescript
import { 
  getPerformanceMonitor,
  getErrorBoundary 
} from "../utils";

// 初始化性能监控
const monitor = getPerformanceMonitor();

monitor.onWarning((metric, value, threshold) => {
  console.warn(`Performance: ${metric} = ${value} (threshold: ${threshold})`);
  
  // 可以发送到分析服务
  analytics.track("performance_warning", { metric, value, threshold });
});

// 在动画循环中
function onFrame(deltaTime: number) {
  monitor.recordFrameTime(deltaTime);
}

// 启动内存监控
const stopMemoryMonitor = monitor.startMemoryMonitoring(5000);
// 停止时调用 stopMemoryMonitor()
```

### 4.2 错误边界处理

```typescript
import { 
  getErrorBoundary, 
  WasmErrorHandler 
} from "../utils";

const boundary = getErrorBoundary();

// 注册 Wasm 错误处理器
boundary.registerHandler("wasm", new WasmErrorHandler(() => {
  console.log("Wasm failed, falling back to JS");
  useJsFallback();
}));

// 捕获错误
try {
  await loadWasmModule();
} catch (err) {
  boundary.capture(err, { context: "wasm_loading" });
}
```

---

## 5. 特性开关控制

### 5.1 在代码中检查特性开关

```typescript
import { isFeatureEnabled } from "../config";

// 条件启用新功能
if (isFeatureEnabled("useBanditRecommendation")) {
  const bandit = getBanditRecommender();
  // ...
}

if (isFeatureEnabled("useReactiveSwitch")) {
  const switcher = getReactivePresetSwitcher();
  // ...
}

if (isFeatureEnabled("useWasmIndex")) {
  const index = getHnswWasmIndex();
  // ...
}
```

### 5.2 运行时切换特性

```typescript
import { overrideFeature } from "../config";

// 临时启用/禁用（用于测试）
const restore = overrideFeature("useReactiveSwitch", false);

// 测试代码...

// 恢复原始值
restore();
```

---

## 6. 与现有 AIVJ 系统集成

### 6.1 扩展现有 AIVJ Controller

```typescript
// 在 UnifiedAivjController 或相关代码中
import { 
  getBanditRecommender,
  getReactivePresetSwitcher 
} from "../features/presets";

class EnhancedAivjController {
  private bandit = getBanditRecommender();
  private switcher = getReactivePresetSwitcher();
  
  constructor() {
    // 监听自动切换
    this.switcher.onSwitch((event) => {
      if (event.type === "energy_spike") {
        // 高能量突变，使用 peak 预设
        this.switchToPeakPreset();
      }
    });
  }
  
  selectPreset(audioFrame: AudioFrame, candidates: string[]) {
    // 结合原有逻辑和 Bandit 推荐
    const baseSelection = this.originalSelectLogic(audioFrame, candidates);
    
    if (isFeatureEnabled("useBanditRecommendation")) {
      const banditRec = this.bandit.recommend(
        candidates.map(c => getClusterForPreset(c)),
        createBanditContext(audioFrame)
      );
      
      // 可以结合两者结果
      return this.combineSelections(baseSelection, banditRec);
    }
    
    return baseSelection;
  }
}
```

---

## 7. 测试 checklist

### 7.1 单元测试

```bash
# 运行所有测试
npm test

# 运行特定模块测试
npm test -- banditRecommender
npm test -- energyFilter
```

### 7.2 集成测试

```typescript
// 在浏览器控制台测试
const bandit = getBanditRecommender();
bandit.addArm("test-cluster");
const rec = bandit.recommend(["test-cluster"], {
  audioFeatures: { energy: 0.8, brightness: 0.7, noisiness: 0.3 },
  sceneLabel: "techno",
  timeOfDay: 20,
});
console.log(rec);
```

### 7.3 性能测试

```typescript
const monitor = getPerformanceMonitor();

// 检查统计
setInterval(() => {
  console.table(monitor.getStats());
}, 10000);
```

---

## 8. 故障排除

### 8.1 Wasm 加载失败

```typescript
if (!isWasmSupported()) {
  console.warn("Wasm not supported, using JS fallback");
  // 使用纯 JS 实现
}
```

### 8.2 存储空间不足

```typescript
// Bandit 和反馈系统会自动清理旧数据
// 如需手动清理：
import { resetBanditRecommender } from "../features/presets";
resetBanditRecommender();
```

### 8.3 调试日志

```typescript
import { getFeatureFlags } from "../config";

// 检查当前配置
console.log(getFeatureFlags());

// 启用详细日志
localStorage.setItem("debug", "true");
```

---

## 9. 完整示例

```typescript
// bootstrap.ts 中的完整集成示例

import { AudioBus } from "../audio/AudioBus"; // 原始
import { 
  getBanditRecommender,
  getReactivePresetSwitcher,
  createBanditContext
} from "../features/presets";
import { 
  getPerformanceMonitor,
  getErrorBoundary 
} from "../utils";
import { isFeatureEnabled } from "../config";

export async function bootstrap() {
  // 1. 初始化音频
  const audioBus = new AudioBus();
  await audioBus.loadUrl("/music/track.mp3");
  
  // 2. 初始化性能监控
  const monitor = getPerformanceMonitor();
  monitor.startMemoryMonitoring(5000);
  
  // 3. 初始化 Bandit 推荐（如果启用）
  if (isFeatureEnabled("useBanditRecommendation")) {
    const bandit = getBanditRecommender();
    
    // 添加所有预设簇
    allClusters.forEach(c => bandit.addArm(c.id));
    
    // 在反馈时记录
    originalRecordFeedback = recordFeedbackLike;
    recordFeedbackLike = (presetId: string) => {
      originalRecordFeedback(presetId);
      
      const clusterId = getClusterForPreset(presetId);
      bandit.recordFeedback({
        armId: clusterId,
        action: "favorite",
        durationMs: 10000,
        context: createBanditContext(audioBus.getSnapshot()),
      });
    };
  }
  
  // 4. 初始化反应式切换（如果启用）
  if (isFeatureEnabled("useReactiveSwitch")) {
    const switcher = getReactivePresetSwitcher();
    switcher.setCandidatePresets(allPresetIds);
    switcher.onSwitch((event) => {
      loadPreset(event.nextPresetId);
    });
    
    audioBus.onFrame((frame) => {
      switcher.onAudioFrame(frame);
    });
  }
  
  // 5. 启动播放
  audioBus.play();
}
```

---

*更多示例见 docs/examples/*
