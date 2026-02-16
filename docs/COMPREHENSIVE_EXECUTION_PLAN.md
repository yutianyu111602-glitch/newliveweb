# NewLiveWeb 开源库替换 - 综合执行计划

> **计划版本**: v1.0  
> **创建日期**: 2026-01-30  
> **目标**: 完成所有 TODO + 测试验证 + 性能优化 + 生产化  
> **预计工期**: 5-7 天  

---

## 执行阶段总览

```
Phase 1 (Day 1-2):  完成技术债务 + 核心测试
Phase 2 (Day 2-3):  性能优化 + Wasm 实现
Phase 3 (Day 3-4):  新功能开发
Phase 4 (Day 4-5):  生产化准备
Phase 5 (Day 6-7):  文档 + 示例 + 验收
```

---

## Phase 1: 技术债务清理 + 核心测试 (Day 1-2)

### 1.1 完成剩余 TODO

#### TODO-1: Embeddings 分块加载
**文件**: `src/features/presets/presetSimilaritySearch.ts`

**当前问题**: 
- 50k 预设 = 100MB 内存 (512维 Float32)
- 130k 预设 = 260MB 内存
- 大内存占用导致浏览器卡顿

**解决方案**:
```typescript
// 分块加载策略
interface ChunkedIndex {
  totalCount: number;
  dim: number;
  chunks: {
    startIdx: number;
    endIdx: number;
    url: string;  // 分片文件 URL
    loaded: boolean;
    embeddings?: Float32Array;
  }[];
}

// 按需加载 (LRU 缓存)
class ChunkedEmbeddingIndex {
  private maxMemoryMB = 50;  // 限制 50MB
  private loadedChunks = new Map<number, Float32Array>();
  
  async getEmbedding(idx: number): Promise<Float32Array> {
    const chunkId = Math.floor(idx / CHUNK_SIZE);
    if (!this.loadedChunks.has(chunkId)) {
      await this.loadChunk(chunkId);
    }
    return this.loadedChunks.get(chunkId)!.subarray(
      (idx % CHUNK_SIZE) * this.dim,
      ((idx % CHUNK_SIZE) + 1) * this.dim
    );
  }
}
```

**产出**:
- `src/features/presets/chunkedEmbeddingIndex.ts`
- Python 分片脚本 `scripts/aivj/split_embeddings.py`

---

#### TODO-2: 相似预设能量过滤
**文件**: `src/features/presets/presetSimilaritySearch.ts:424`

**需求**: 根据当前音频能量过滤推荐预设

**实现**:
```typescript
function filterByEnergy(
  similarPresets: SimilarPresetResult[],
  currentEnergy: number,
  styleIndex: AivjStyleIndexV0
): SimilarPresetResult[] {
  // 能量匹配策略
  // currentEnergy < 0.3 -> 优先 calm
  // currentEnergy 0.3-0.7 -> 优先 groove
  // currentEnergy > 0.7 -> 优先 peak
  
  return similarPresets.filter(p => {
    const entry = styleIndex.entries.find(e => e.presetId === p.presetId);
    if (!entry) return true;
    
    const energyMatch = 
      (currentEnergy < 0.3 && entry.energy === 'calm') ||
      (currentEnergy > 0.7 && entry.energy === 'peak') ||
      (currentEnergy >= 0.3 && currentEnergy <= 0.7);
    
    return energyMatch || p.similarity > 0.9;  // 高相似度保留
  });
}
```

---

### 1.2 核心单元测试

#### 测试覆盖清单

| 模块 | 测试项 | 优先级 |
|------|--------|--------|
| **MeydaAudioAnalyzer** | 特征提取准确性 | P0 |
| | Techno bands 范围 | P0 |
| | 性能 < 1ms | P0 |
| **AudioBusOptimized** | API 兼容性 | P0 |
| | 特征值范围 | P0 |
| | 内存无泄漏 | P1 |
| **BanditRecommender** | Thompson Sampling 正确性 | P0 |
| | 反馈更新 | P0 |
| | 时间衰减 | P1 |
| **SimilaritySearch** | 余弦相似度准确性 | P0 |
| | Top-K 正确性 | P0 |
| | 缓存机制 | P1 |

**产出**:
- `src/audio/__tests__/MeydaAudioAnalyzer.test.ts`
- `src/audio/__tests__/AudioBusOptimized.test.ts`
- `src/features/presets/__tests__/banditRecommender.test.ts`
- `src/features/presets/__tests__/presetSimilaritySearch.test.ts`

---

## Phase 2: 性能优化 (Day 2-3)

### 2.1 WebAssembly 向量检索

**动机**: 纯 JS 100k+ 预设搜索太慢 (~500ms)

**方案**: Rust + Wasm HNSW 实现

**文件结构**:
```
newliveweb/
├── wasm/
│   ├── Cargo.toml              # Rust 配置
│   ├── src/
│   │   └── lib.rs              # HNSW 实现
│   ├── pkg/                    # Wasm 输出
│   └── build.sh                # 构建脚本
└── src/features/presets/
    └── hnswWasmIndex.ts        # JS 封装
```

**API 设计**:
```typescript
// wasm/pkg/hnsw.d.ts
export class HNSWIndex {
  constructor(dim: number, maxElements: number);
  addItem(id: number, vector: Float32Array): void;
  search(query: Float32Array, k: number): Uint32Array;
}

// 使用
import { HNSWIndex } from '../../../wasm/pkg';
const index = new HNSWIndex(512, 100000);
```

**性能目标**:
| 规模 | JS 版本 | Wasm 版本 | 提升 |
|------|---------|-----------|------|
| 10k | 20ms | 2ms | 10x |
| 50k | 100ms | 8ms | 12x |
| 100k | 500ms | 15ms | 33x |

---

### 2.2 音频 Worker 多线程

**当前问题**: 音频分析在主线程，影响渲染

**方案**: Web Worker 处理音频特征

**文件**:
- `src/audio/workers/audioAnalyzerWorker.ts`
- `src/audio/AudioAnalyzerWorkerProxy.ts`

**架构**:
```
Main Thread          Worker Thread
     |                      |
  onFrame()  -------->  processAudio()
     |                      |
  render()    <--------  postMessage(features)
```

---

### 2.3 内存优化

#### 音频帧对象池
```typescript
class AudioFramePool {
  private pool: AudioFrame[] = [];
  private maxSize = 10;  // 只保留 10 帧
  
  acquire(): AudioFrame {
    return this.pool.pop() || createNewFrame();
  }
  
  release(frame: AudioFrame): void {
    if (this.pool.length < this.maxSize) {
      this.pool.push(frame);
    }
  }
}
```

#### Embedding 压缩
```typescript
// Float32 (4 bytes) -> Float16 (2 bytes)
function compressEmbedding(emb: Float32Array): Uint16Array {
  const compressed = new Uint16Array(emb.length);
  for (let i = 0; i < emb.length; i++) {
    // FP32 -> FP16 转换
    compressed[i] = float32ToFloat16(emb[i]);
  }
  return compressed;
}
```

---

## Phase 3: 新功能开发 (Day 3-4)

### 3.1 实时音频反应式预设切换

**功能**: 根据音频特征实时自动切换预设

**触发条件**:
```typescript
interface AutoSwitchConfig {
  // 能量突变检测
  energySpikeThreshold: 0.3;      // 能量突增 30%
  
  // 节拍检测
  beatDropThreshold: 0.8;         // 节拍强度
  
  // 场景变化
  sceneChangeThreshold: 0.5;      // 场景置信度变化
  
  // 最小切换间隔
  minSwitchIntervalMs: 5000;      // 5秒内不重复切换
}
```

**实现**:
```typescript
class ReactivePresetSwitcher {
  private lastSwitchTime = 0;
  private currentScene = '';
  
  onAudioFrame(frame: AudioFrame): void {
    const now = Date.now();
    if (now - this.lastSwitchTime < this.config.minSwitchIntervalMs) {
      return;
    }
    
    // 检测能量突变
    if (this.detectEnergySpike(frame)) {
      this.switchToHighEnergyPreset();
      this.lastSwitchTime = now;
      return;
    }
    
    // 检测节拍落下
    if (this.detectBeatDrop(frame)) {
      this.switchOnBeat();
      this.lastSwitchTime = now;
    }
  }
}
```

---

### 3.2 用户行为分析仪表板

**文件**: `src/features/analytics/UserAnalyticsDashboard.ts`

**功能**:
- 播放时长统计
- 最喜欢的预设簇
- 跳过率分析
- 学习曲线可视化

**数据收集**:
```typescript
interface AnalyticsEvent {
  type: 'play' | 'skip' | 'favorite' | 'complete';
  presetId: string;
  clusterId: string;
  durationMs: number;
  timestamp: number;
  audioFeatures: AudioFeatures;
}
```

**可视化**:
- 每日播放统计图表
- 风格偏好饼图
- 学习进度曲线
- 热力图（时间段 vs 风格）

---

### 3.3 云端模型同步

**架构**:
```
Device A          Cloud Server          Device B
   |                   |                    |
   |-- upload model -->|                    |
   |                   |-- broadcast ----->|
   |                   |                    |
   |<-- download -----|<-- upload model ---|
```

**API**:
```typescript
interface CloudSyncService {
  uploadModel(userId: string, model: BanditModel): Promise<void>;
  downloadModel(userId: string): Promise<BanditModel>;
  mergeModels(models: BanditModel[]): BanditModel;  // 联邦学习
}
```

---

## Phase 4: 生产化准备 (Day 4-5)

### 4.1 错误处理和边界情况

#### 错误分类
| 级别 | 类型 | 处理策略 |
|------|------|----------|
| Fatal | WASM 加载失败 | 回退到 JS 实现 |
| Error | 网络超时 | 重试 3 次，然后降级 |
| Warning | 特征值异常 | 记录日志，使用默认值 |
| Info | 缓存未命中 | 记录统计 |

#### 实现
```typescript
class ErrorBoundary {
  private handlers = new Map<ErrorType, ErrorHandler>();
  
  handle(error: Error): void {
    const type = this.classifyError(error);
    const handler = this.handlers.get(type);
    
    if (handler) {
      handler.handle(error);
    } else {
      this.fallbackHandler(error);
    }
  }
}
```

---

### 4.2 配置管理

**文件**: `src/config/featureFlags.ts`

```typescript
interface FeatureConfig {
  // 开发环境
  dev: {
    useMeyda: true;
    useEssentia: false;  // 开发时禁用（加载慢）
    useWasmIndex: false;
    logLevel: 'debug';
  };
  
  // 测试环境
  test: {
    useMeyda: true;
    useEssentia: true;
    useWasmIndex: false;
    logLevel: 'info';
  };
  
  // 生产环境
  prod: {
    useMeyda: true;
    useEssentia: true;
    useWasmIndex: true;
    logLevel: 'error';
  };
}
```

---

### 4.3 监控和日志

#### 性能监控
```typescript
class PerformanceMonitor {
  private metrics = {
    frameTime: new Histogram(),
    audioLatency: new Histogram(),
    memoryUsage: new Gauge(),
  };
  
  recordFrameTime(ms: number): void {
    this.metrics.frameTime.observe(ms);
    
    if (ms > 16.67) {  // 超过 60fps 预算
      this.reportWarning('frame_time_exceeded', { value: ms });
    }
  }
}
```

#### 错误日志
```typescript
class Logger {
  private buffer: LogEntry[] = [];
  
  error(msg: string, context?: object): void {
    this.buffer.push({
      level: 'error',
      msg,
      context,
      timestamp: Date.now(),
    });
    
    if (this.buffer.length > 100) {
      this.flush();
    }
  }
}
```

---

## Phase 5: 文档和示例 (Day 6-7)

### 5.1 API 使用示例

**文件**: `docs/examples/`

```
docs/examples/
├── 01-basic-audio-analysis.md
├── 02-transient-detection.md
├── 03-similar-preset-search.md
├── 04-bandit-recommendation.md
├── 05-reactive-switching.md
└── 06-custom-integration.md
```

#### 示例 1: 基础音频分析
```typescript
import { AudioBusOptimized } from 'newliveweb/audio';

const audioBus = new AudioBusOptimized();
await audioBus.loadUrl('/music/track.mp3');

audioBus.onFrame((frame) => {
  console.log('Energy:', frame.energy);
  console.log('Brightness:', frame.features.spectralCentroid);
  console.log('Kick:', frame.features.kick01Raw);
});
```

#### 示例 2: Bandit 推荐
```typescript
import { getBanditRecommender } from 'newliveweb/features/presets';

const bandit = getBanditRecommender();

// 添加可用簇
clusters.forEach(c => bandit.addArm(c.id));

// 获取推荐
const rec = bandit.recommend(clusterIds, audioContext);
loadPreset(rec.armId);

// 记录反馈
bandit.recordFeedback({
  armId: rec.armId,
  action: isSkipped ? 'skip' : 'favorite',
  durationMs: watchDuration,
});
```

---

### 5.2 开发者接入指南

**文件**: `docs/DEVELOPER_GUIDE.md`

内容:
1. 快速开始 (5分钟接入)
2. 架构概览
3. 模块详解
4. 性能优化指南
5. 调试技巧
6. 常见问题

---

### 5.3 演示视频脚本

**文件**: `docs/demo/VIDEO_SCRIPT.md`

**场景 1: 音频响应式可视化** (30秒)
```
1. 播放音乐
2. 展示 AudioBus 实时特征
3. 展示不同音乐风格的特征变化
```

**场景 2: 智能预设推荐** (45秒)
```
1. 选择初始预设
2. 展示相似预设推荐
3. 点击切换，展示实时推荐更新
4. 展示 Bandit 学习效果
```

**场景 3: 跨模态检索** (30秒)
```
1. 输入文本: "dark techno"
2. 展示检索结果
3. 播放音频验证匹配度
```

---

## 执行检查清单

### Phase 1
- [ ] Embeddings 分块加载实现
- [ ] 能量过滤完成
- [ ] MeydaAudioAnalyzer 单元测试
- [ ] AudioBusOptimized 单元测试
- [ ] BanditRecommender 单元测试
- [ ] SimilaritySearch 单元测试

### Phase 2
- [ ] Wasm HNSW 环境搭建
- [ ] Rust HNSW 核心实现
- [ ] JS 封装和集成
- [ ] 音频 Worker 实现
- [ ] 内存优化 (对象池)
- [ ] 性能基准测试

### Phase 3
- [ ] 反应式预设切换实现
- [ ] 音频突变检测算法
- [ ] 分析仪表板 UI
- [ ] 数据收集和可视化
- [ ] 云端同步 API 设计

### Phase 4
- [ ] 错误边界实现
- [ ] 配置管理系统
- [ ] 性能监控仪表板
- [ ] 日志收集系统
- [ ] 生产环境验证

### Phase 5
- [ ] 6 个示例文档
- [ ] 开发者指南
- [ ] 演示视频脚本
- [ ] API 参考文档
- [ ] 最终验收测试

---

## 资源需求

### 开发资源
- **时间**: 5-7 天
- **人力**: 1-2 名开发者
- **设备**: 支持 WebGL 的电脑 (用于测试)

### 依赖安装
```bash
# Rust + Wasm
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# 测试工具
npm install --save-dev vitest @vitest/ui

# 性能分析
npm install --save-dev lighthouse
```

---

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| Wasm 编译失败 | 中 | 高 | 准备纯 JS 回退 |
| 性能未达预期 | 中 | 中 | 提前做 PoC 验证 |
| 浏览器兼容性 | 低 | 高 | 使用 feature detection |
| 内存泄漏 | 中 | 高 | 完善测试覆盖 |

---

## 成功标准

### 技术指标
- [ ] 相似搜索 < 10ms (10k 预设)
- [ ] 音频处理 < 1ms 每帧
- [ ] 内存占用 < 100MB
- [ ] 测试覆盖率 > 80%

### 功能指标
- [ ] 所有 TODO 完成
- [ ] 无阻塞性 Bug
- [ ] 文档完整
- [ ] 示例可运行

---

**计划创建时间**: 2026-01-30  
**计划开始时间**: [待填写]  
**预计完成时间**: [待填写]
