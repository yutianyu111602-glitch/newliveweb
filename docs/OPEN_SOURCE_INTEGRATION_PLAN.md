# 开源库实际应用计划

> 目标：将 P0-P3 开源库实际应用到项目中，渐进式启用

---

## 应用策略

### 原则
1. **渐进式启用**：每个库独立开关，可单独开启/关闭
2. **向后兼容**：不影响现有功能
3. **可回滚**：任何问题可立即恢复

### 启用顺序（推荐）
```
P1: Meyda 音频分析 → 立即收益，风险低
P2: Bandit 推荐 → 需要积累数据
P3: 相似预设搜索 → 需要 embedding 数据
P4: Essentia 瞬态检测 → WASM 依赖
P5: Wasm HNSW → 需要编译环境
```

---

## P1: Meyda 音频分析（立即启用）

### 当前状态
- ✅ 代码已编写
- ✅ 特性开关已配置
- ⚠️ 需要实际启用

### 启用步骤

#### 步骤 1：在 AudioBus 中暴露 Meyda 特征
```typescript
// src/audio/AudioBus.ts
// 在 buildFrame 方法中，如果启用了 Meyda，添加特征到 frame
```

#### 步骤 2：创建 Meyda 特征处理器
```typescript
// src/audio/MeydaFeatureProcessor.ts
export class MeydaFeatureProcessor {
  private analyzer: Meyda.MeydaAnalyzer | null = null;
  
  async init(audioContext: AudioContext, source: AudioNode) {
    const Meyda = await import('meyda');
    this.analyzer = Meyda.createMeydaAnalyzer({
      audioContext,
      source,
      bufferSize: 512,
      featureExtractors: [
        'rms', 'spectralCentroid', 'spectralRolloff', 
        'spectralFlatness', 'zcr', 'chroma'
      ]
    });
  }
  
  getFeatures() {
    return this.analyzer?.get([
      'spectralCentroid', 'spectralFlatness', 'zcr'
    ]);
  }
}
```

#### 步骤 3：在 AIVJ Controller 中使用
```typescript
// 在场景分类时，使用 Meyda 的 chroma 和 spectral 特征
// 提高场景识别准确率
```

---

## P2: Bandit 推荐系统（数据驱动）

### 当前状态
- ✅ 代码已编写
- ✅ 集成到 bootstrap.ts
- ⚠️ 需要用户反馈数据积累

### 应用策略

#### 阶段 1：数据收集（2周）
- 开启 Bandit，但只记录，不影响决策
- 观察数据积累情况

#### 阶段 2：辅助决策（2周）
- Bandit 推荐作为参考
- AIVJ Controller 综合原始逻辑 + Bandit 建议

#### 阶段 3：主导决策（稳定后）
- Bandit 推荐作为主要依据

### 启用代码
```typescript
// 在 bootstrap.ts 中已集成
// 只需开启特性开关
```

---

## P3: 相似预设搜索（需要数据准备）

### 前置条件
- 需要 preset embeddings（通过 Python 脚本生成）
- 需要 ids.txt 映射文件

### 应用步骤

#### 步骤 1：生成 Embeddings
```bash
# 使用 Python 脚本
python scripts/aivj/embed_preset.py \
  --preset-dir ./public/presets \
  --output ./public/embeddings/
```

#### 步骤 2：分块（如果 preset > 10k）
```bash
python scripts/aivj/split_embeddings.py \
  ./public/embeddings/embeddings.npy \
  ./public/embeddings/ids.txt \
  --output-dir ./public/embeddings/chunks/
```

#### 步骤 3：在 UI 中集成 SimilarPresetPanel
```typescript
// 在 renderShell 或 bootstrap 中添加面板
import { SimilarPresetPanel } from './features/presets/SimilarPresetPanel';

const similarPanel = new SimilarPresetPanel({
  container: document.getElementById('similar-presets')!,
  onSelectPreset: (id) => loadPresetById(id, 'similar-search'),
  embeddingsUrl: '/embeddings/chunks/',
  idsUrl: '/embeddings/ids.txt'
});
```

---

## P4: Essentia 瞬态检测（高级功能）

### 当前状态
- ✅ 代码已编写
- ⚠️ 需要 WASM 支持

### 应用策略
```typescript
// 在音频能量突变检测时使用 Essentia
// 替代简单的阈值判断
```

---

## P5: Wasm HNSW（性能优化）

### 前置条件
- 安装 Rust + wasm-pack
- 编译 Wasm 模块

### 编译步骤
```bash
cd wasm
wasm-pack build --release --target web
```

### 应用
```typescript
// 大规模 preset 搜索时使用
if (presetCount > 10000 && isWasmSupported()) {
  useHnswWasmIndex();
}
```

---

## 立即执行清单

### 今天可以做的（低风险）
1. ✅ 启用 Meyda 特征提取
2. ✅ 开启 Bandit 数据收集
3. ✅ 检查 SimilarPresetPanel UI

### 本周可以做的（需要准备）
1. 📝 生成 preset embeddings
2. 📝 测试 SimilarPresetPanel 集成
3. 📝 验证 Bandit 数据积累

### 本月可以做的（需要环境）
1. 🔧 编译 Wasm HNSW
2. 🔧 集成 Essentia WASM
3. 🔧 性能基准测试

---

## 验证命令

```bash
# 1. 编译检查
npm run lint

# 2. 功能测试（需要 acceptance tests）
node scripts/aivj/run-acceptance-tests.mjs

# 3. 性能测试
npm run test:performance
```
