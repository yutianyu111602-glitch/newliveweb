# AI 炼丹产物分析报告

> 分析时间: 2026-01-30  
> 分析对象: D:\aidata 目录下的 AI 生成预设

---

## 执行摘要

### 炼丹产物规模

| 类别 | 数量 | 说明 |
|------|------|------|
| **AI Generated Premium** | 10,000 | fRating=5.0 的高质量预设 |
| **AI Generated V2** | 5,000 | 第二批生成 |
| **Coupled BG** | 8,040 | 3D 耦合背景预设 |
| **Coupled FG** | 8,041 | 3D 耦合前景预设 |
| **Curated Dark** | 500 | 人工精选暗色调 |
| **Curated Relaxed** | 353 | 人工精选轻松风格 |
| **总计** | **~32,000** | 不包括 130k MegaPack |

### 关键发现

1. ✅ **数量庞大**: 生成了约 32,000 个 AI 预设
2. ✅ **质量筛选**: 有 fRating=5.0 的高质量预设
3. ✅ **3D 耦合**: 8,000+ 对 bg/fg 配对的预设
4. ⚠️ **结构复杂**: 多个版本、批次、分类混杂
5. ⚠️ **缺乏索引**: 缺少统一的搜索和推荐系统

---

## 1. 炼丹产物详解

### 1.1 预设生成器输出

你的预设生成器生成了 **标准 MilkDrop 预设文件** (.milk)，包含：

```
MILKDROP_PRESET_VERSION=201
PSVERSION=2
[preset00]
fRating=5.000          ← AI 设置的高质量评分
fGammaAdj=1.686
fDecay=0.740
...
warp=0.07792          ← 有 warp 参数统计
...
[shapecode_0]         ← 包含形状定义
...
[comp]                ← 包含合成设置
```

**生成速度**: 
- 5,000 个预设 / 12 秒 = ~400 预设/秒
- 7,000 个预设 / 17.5 秒 = ~400 预设/秒

### 1.2 产物类型分析

#### Type A: Premium 高质量预设 (10,000)
- 位置: `ai_generated_premium/`
- 特征: fRating=5.0
- 用途: 直接用于演出，质量保证

#### Type B: Coupled 3D 耦合预设 (8,000 对)
- 位置: `ai_generated_coupled_final/{bg,fg}/`
- 特征: 成对的背景/前景预设
- 用途: 3D 耦合系统，bg+fg 组合使用
- 注意: 同一个编号可能有多版本（不同时间戳）

#### Type C: Curated 人工精选 (853)
- 位置: `curated_v5_{dark,relaxed}/`
- 特征: 有 metadata（avgLuma, motion, score）
- 用途: 精选演出集，有风格标签

#### Type D: 验证集 (多版本)
- 位置: `validate-techno-*/`
- 特征: 用于验证生成质量
- 用途: 评估不同参数的效果

### 1.3 与 130k MegaPack 的关系

```
130k MegaPack (基础库)
    ↓
AI 预设生成器 (学习/采样)
    ↓
ai_generated_* (新生成)
    ↓
验证/筛选
    ↓
curated_v5_* (精选集)
```

**重要**: AI 生成的预设是基于 130k MegaPack 学习的，但生成了**新的参数组合**。

---

## 2. 这些预设有用吗？

### 2.1 ✅ 有用的情况

1. **数量优势**
   - 32,000 个 AI 预设 vs 人工挑选的 500-1000 个
   - 可以覆盖更多的参数空间

2. **质量保证**
   - fRating=5.0 的预设经过筛选
   - Curated 集有人工验证

3. **3D 耦合**
   - bg/fg 配对是人工难以大量制作的
   - 8,000 对可以用于 3D 耦合系统

4. **快速原型**
   - 每秒 400 个的生成速度
   - 可以快速迭代不同风格

### 2.2 ⚠️ 潜在问题

1. **同质化风险**
   - AI 生成的预设可能在某些参数上过于相似
   - 缺乏人类艺术家的"意外创意"

2. **缺少 Shader**
   - 当前生成的是参数型预设
   - 没有 warp/comp shader 代码（创意核心）

3. **质量波动**
   - 虽然有 fRating=5.0，但实际视觉效果需要人工验证
   - 可能存在"参数合理但效果平淡"的预设

4. **管理困难**
   - 32,000 个预设难以手动管理
   - 缺少有效的搜索和推荐系统

---

## 3. 如何利用这些预设？

### 3.1 立即使用策略

#### 策略 A: 导入 ProjectM 库

```bash
# 1. 将 curated 集复制到项目
mkdir -p public/presets/ai-curated
cp D:/aidata/curated_v5_dark/presets/* public/presets/ai-curated/
cp D:/aidata/curated_v5_relaxed/presets/* public/presets/ai-curated/

# 2. 生成 manifest
node scripts/build-curated-from-full-safe.mjs
```

**优点**: 853 个精选预设，质量保证
**缺点**: 数量较少

#### 策略 B: 使用 Coupled 3D 预设

```typescript
// 在 ProjectM3DCoupling 中使用
const bgPresets = loadPresetsFromDir('ai_generated_coupled_final/bg');
const fgPresets = loadPresetsFromDir('ai_generated_coupled_final/fg');

// 配对使用
const coupled = bgPresets.map((bg, i) => ({
  bg: bg,
  fg: fgPresets[i]
}));
```

**优点**: 专为 3D 耦合系统设计
**缺点**: 需要配对管理

#### 策略 C: 随机采样 AI Premium

```typescript
// 从 10,000 个 premium 中随机选择
const allPresets = loadPresetsFromDir('ai_generated_premium');
const selected = shuffle(allPresets).slice(0, 1000);
```

**优点**: 快速获得大量高质量预设
**缺点**: 可能重复或相似

### 3.2 中期优化策略

#### 策略 D: 建立预设评分系统

利用已有的 AIVJ 基础设施：

```typescript
// 使用 Bandit 推荐系统学习用户偏好
const bandit = new BanditRecommender();

// 将 AI 预设作为 "臂"
aiPresets.forEach(preset => {
  bandit.addArm(preset.id);
});

// 用户反馈驱动推荐
bandit.recordFeedback({
  armId: presetId,
  action: 'favorite', // 或 'skip'
  context: audioFeatures
});
```

#### 策略 E: 相似预设搜索

使用已有的相似搜索功能：

```typescript
// 生成 AI 预设的 embeddings
// (需要运行 Python 脚本)
python scripts/aivj/embed_clip.py \
  --frames-dir artifacts/ai-presets/frames \
  --output ai_embeddings.npy

// 前端加载索引
await loadEmbeddingIndex('ai_embeddings.npy', 'ai_ids.txt');

// 搜索相似预设
const similar = findSimilarPresets(currentPresetId, { topK: 10 });
```

#### 策略 F: 分类和标签

```python
# 使用 HDBSCAN 聚类
python scripts/aivj/cluster_embeddings_advanced.py \
  --embeddings ai_embeddings.npy \
  --ids ai_ids.txt \
  --algorithm hdbscan
```

### 3.3 长期演进策略

#### 策略 G: AI 预设生成器集成

将生成器集成到 NewLiveWeb：

```typescript
// 用户界面
const PresetGenerator = () => {
  const [params, setParams] = useState({
    style: 'techno',
    mood: 'dark',
    complexity: 0.7
  });
  
  const generate = async () => {
    // 调用后端生成 API
    const response = await fetch('/api/generate-preset', {
      method: 'POST',
      body: JSON.stringify(params)
    });
    
    const newPreset = await response.json();
    addToLibrary(newPreset);
  };
};
```

#### 策略 H: 混合人工+AI 工作流

```
1. AI 生成 1000 个候选预设
2. 快速预览/评分
3. 人工精选 50 个
4. 加入演出库
5. 收集观众反馈
6. 训练更好的 AI 模型
```

---

## 4. 推荐实施方案

### Phase 1: 快速利用 (本周)

1. **导入 Curated 集**
   - 853 个预设，安全可靠
   - 添加到现有库中

2. **测试 Coupled 3D 预设**
   - 选择 100-200 对进行测试
   - 验证 3D 耦合效果

### Phase 2: 建立系统 (本月)

1. **为 AI 预设生成 Embeddings**
   - 运行 CLIP 嵌入生成
   - 建立相似搜索索引

2. **集成 Bandit 推荐**
   - 将 AI 预设纳入推荐系统
   - 学习用户偏好

3. **建立质量反馈循环**
   - 收集用户使用数据
   - 筛选出真正好用的预设

### Phase 3: 高级功能 (下月)

1. **实时生成**
   - 根据当前音乐/场景实时生成预设
   - 类似 "AI DJ" 的概念

2. **个性化模型**
   - 为每个用户训练个性化生成模型
   - 越用越懂用户口味

---

## 5. 具体操作建议

### 5.1 立即可执行的命令

```bash
# 1. 复制 curated 预设到项目
cp -r D:/aidata/curated_v5_dark/presets/* newliveweb/public/presets/ai-curated-dark/
cp -r D:/aidata/curated_v5_relaxed/presets/* newliveweb/public/presets/ai-curated-relaxed/

# 2. 生成库 manifest
node scripts/build-curated-from-full-safe.mjs \
  --source public/presets/ai-curated-dark \
  --out public/presets/ai-curated-dark/library-manifest.json

# 3. 测试 3D 耦合预设
cp -r D:/aidata/ai_generated_coupled_final newliveweb/public/coupled-presets/

# 4. 生成 embeddings（如果需要相似搜索）
cd newliveweb/python/preset_analyzer
python batch_analyze.py \
  D:/aidata/ai_generated_premium \
  --output artifacts/ai-premium-features/
```

### 5.2 推荐的预设库结构

```
public/presets/
├── library-manifest.v1.json      # 主库 (130k)
├── run3-crashsafe/               # 安全子集
├── ai-curated-dark/              # 853 AI 精选 (暗)
│   ├── library-manifest.json
│   └── *.milk
├── ai-curated-relaxed/           # 353 AI 精选 (轻松)
│   ├── library-manifest.json
│   └── *.milk
└── ai-coupled/                   # 3D 耦合预设
    ├── bg/
    ├── fg/
    └── pairs-manifest.json       # 配对清单
```

### 5.3 配置更新

```typescript
// src/config/presetLibraries.ts
export const presetLibraries = {
  // 现有库
  'run3-crashsafe-15000': { ... },
  
  // AI 精选库
  'ai-curated-dark': {
    name: 'AI 精选 (暗色调)',
    manifestUrl: '/presets/ai-curated-dark/library-manifest.json',
    count: 853
  },
  
  'ai-curated-relaxed': {
    name: 'AI 精选 (轻松)',
    manifestUrl: '/presets/ai-curated-relaxed/library-manifest.json',
    count: 353
  },
  
  // 3D 耦合库
  'ai-coupled-3d': {
    name: 'AI 3D 耦合',
    type: 'coupled',
    pairsManifestUrl: '/presets/ai-coupled/pairs-manifest.json',
    count: 8000
  }
};
```

---

## 6. 总结

### 这些预设有用吗？

**是的，但需要正确使用。**

- ✅ 数量庞大，可以丰富库
- ✅ 有质量筛选（fRating=5.0）
- ✅ 3D 耦合预设是独特价值
- ⚠️ 需要建立管理和推荐系统
- ⚠️ 需要人工验证实际效果

### 关键建议

1. **不要直接用全部 32,000 个** - 太多难以管理
2. **从 curated 集开始** - 853 个是安全的选择
3. **利用 3D 耦合预设** - 这是 AI 的独特优势
4. **建立反馈循环** - 让用户反馈驱动筛选
5. **逐步集成** - Phase 1 → Phase 2 → Phase 3

### 下一步行动

1. 复制 curated 预设到项目 (30 分钟)
2. 测试 3D 耦合效果 (1 小时)
3. 为用户开放 "AI 精选" 库 (1 小时)
4. 收集反馈数据 (持续)
5. 优化推荐算法 (下周)

---

**结论**: 你的 AI 炼丹产物是**有价值的资产**，特别是 curated 集和 3D 耦合预设。关键是要建立有效的管理和推荐系统，让用户能发现和使用这些预设。
