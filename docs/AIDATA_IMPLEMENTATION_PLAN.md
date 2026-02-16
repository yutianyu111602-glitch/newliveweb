# AI 炼丹产物利用实施计划

> 目标: 充分利用 D:\aidata 中的 32,000+ AI 生成预设

---

## Phase 1: 快速导入 (今天完成)

### 任务 1.1: 复制 Curated 预设到项目

**预计时间**: 30 分钟

```powershell
# 创建目录
mkdir -p newliveweb/public/presets/ai-curated-dark
mkdir -p newliveweb/public/presets/ai-curated-relaxed

# 复制预设
cp D:/aidata/curated_v5_dark/presets/*.milk newliveweb/public/presets/ai-curated-dark/
cp D:/aidata/curated_v5_relaxed/presets/*.milk newliveweb/public/presets/ai-curated-relaxed/

# 验证数量
(Get-ChildItem newliveweb/public/presets/ai-curated-dark/*.milk).Count  # 应该 = 500
(Get-ChildItem newliveweb/public/presets/ai-curated-relaxed/*.milk).Count  # 应该 = 353
```

**成功标准**: 
- [ ] 853 个预设文件已复制
- [ ] 文件大小正常（5KB-20KB）

### 任务 1.2: 生成 Manifest

**预计时间**: 15 分钟

```bash
cd newliveweb

# 生成 curated dark manifest
node scripts/build-curated-from-full-safe.mjs \
  --source public/presets/ai-curated-dark \
  --out public/presets/ai-curated-dark/library-manifest.json

# 生成 curated relaxed manifest
node scripts/build-curated-from-full-safe.mjs \
  --source public/presets/ai-curated-relaxed \
  --out public/presets/ai-curated-relaxed/library-manifest.json
```

**成功标准**:
- [ ] 生成 library-manifest.json
- [ ] 验证 JSON 格式正确

### 任务 1.3: 配置预设库

**预计时间**: 15 分钟

编辑 `src/config/presetLibraries.ts`:

```typescript
export const presetLibraries: Record<string, PresetLibraryConfig> = {
  // 现有库...
  
  // AI 精选库
  'ai-curated-dark': {
    id: 'ai-curated-dark',
    name: 'AI Curated (Dark)',
    description: '853 AI-generated dark-themed presets',
    manifestUrl: '/presets/ai-curated-dark/library-manifest.json',
    version: '1.0.0',
    estimatedCount: 853
  },
  
  'ai-curated-relaxed': {
    id: 'ai-curated-relaxed',
    name: 'AI Curated (Relaxed)',
    description: '353 AI-generated relaxed-themed presets',
    manifestUrl: '/presets/ai-curated-relaxed/library-manifest.json',
    version: '1.0.0',
    estimatedCount: 353
  }
};
```

**成功标准**:
- [ ] TypeScript 编译通过
- [ ] 新库出现在 UI 下拉框中

---

## Phase 2: 3D 耦合集成 (明天)

### 任务 2.1: 复制 Coupled 预设

**预计时间**: 30 分钟

```powershell
# 创建目录
mkdir -p newliveweb/public/presets/ai-coupled/bg
mkdir -p newliveweb/public/presets/ai-coupled/fg

# 复制（限制 2000 对用于测试，避免文件过多）
Get-ChildItem D:/aidata/ai_generated_coupled_final/bg/*.milk | 
  Select-Object -First 2000 | 
  Copy-Item -Destination newliveweb/public/presets/ai-coupled/bg/

Get-ChildItem D:/aidata/ai_generated_coupled_final/fg/*.milk | 
  Select-Object -First 2000 | 
  Copy-Item -Destination newliveweb/public/presets/ai-coupled/fg/
```

### 任务 2.2: 生成配对清单

**预计时间**: 1 小时

创建脚本 `scripts/build-coupled-manifest.mjs`:

```javascript
import fs from 'node:fs/promises';
import path from 'node:path';

const BG_DIR = 'public/presets/ai-coupled/bg';
const FG_DIR = 'public/presets/ai-coupled/fg';
const OUTPUT = 'public/presets/ai-coupled/coupled-manifest.json';

async function buildManifest() {
  const bgFiles = await fs.readdir(BG_DIR);
  const fgFiles = await fs.readdir(FG_DIR);
  
  // 提取编号
  const getId = (filename) => {
    const match = filename.match(/coupled_(\d+)_/);
    return match ? match[1] : null;
  };
  
  const bgMap = new Map();
  const fgMap = new Map();
  
  for (const file of bgFiles) {
    const id = getId(file);
    if (id) bgMap.set(id, file);
  }
  
  for (const file of fgFiles) {
    const id = getId(file);
    if (id) fgMap.set(id, file);
  }
  
  // 配对
  const pairs = [];
  for (const [id, bgFile] of bgMap) {
    const fgFile = fgMap.get(id);
    if (fgFile) {
      pairs.push({
        id: `coupled_${id}`,
        bg: { path: `bg/${bgFile}`, id: `${id}_bg` },
        fg: { path: `fg/${fgFile}`, id: `${id}_fg` }
      });
    }
  }
  
  const manifest = {
    version: '1.0.0',
    type: 'coupled',
    count: pairs.length,
    pairs: pairs
  };
  
  await fs.writeFile(OUTPUT, JSON.stringify(manifest, null, 2));
  console.log(`Generated manifest with ${pairs.length} pairs`);
}

buildManifest();
```

运行:
```bash
node scripts/build-coupled-manifest.mjs
```

### 任务 2.3: 集成到 3D 耦合系统

**预计时间**: 2 小时

修改 `src/layers/ProjectM3DCoupling.ts`:

```typescript
// 添加 AI coupled 库支持
const loadAICoupledPairs = async () => {
  const response = await fetch('/presets/ai-coupled/coupled-manifest.json');
  const manifest = await response.json();
  return manifest.pairs;
};

// 在切换预设时使用
const switchToAIPair = async (pairId: string) => {
  const pair = await getAICoupledPair(pairId);
  
  // 加载 BG 到背景层
  await loadPresetToLayer(pair.bg.path, 'background');
  
  // 加载 FG 到前景层
  await loadPresetToLayer(pair.fg.path, 'foreground');
};
```

---

## Phase 3: 智能推荐 (本周)

### 任务 3.1: 为 AI 预设生成 Embeddings

**预计时间**: 2 小时（运行时间）

```bash
# 生成帧预览（如果需要）
cd newliveweb/scripts/aivj
node render-preset-frames.mjs \
  --source D:/aidata/ai_generated_premium \
  --output artifacts/ai-premium-frames \
  --limit 1000

# 生成 CLIP embeddings
cd newliveweb/python/preset_analyzer
python embed_clip.py \
  --frames artifacts/ai-premium-frames \
  --output embeddings/ai-premium.npy
```

### 任务 3.2: 建立相似搜索索引

**预计时间**: 30 分钟

```bash
# 复制 embeddings 到项目
cp embeddings/ai-premium.npy newliveweb/public/presets/embeddings/
cp embeddings/ai-premium-ids.txt newliveweb/public/presets/embeddings/

# 加载索引
await loadEmbeddingIndex(
  '/presets/embeddings/ai-premium.npy',
  '/presets/embeddings/ai-premium-ids.txt'
);
```

### 任务 3.3: 集成 Bandit 推荐

**预计时间**: 2 小时

```typescript
// 初始化 Bandit，添加 AI 预设作为臂
const initAIBandit = async () => {
  const manifest = await loadManifest('ai-curated-dark');
  
  manifest.presets.forEach(preset => {
    banditRecommender.addArm(preset.id, {
      // 初始先验：fRating 越高，初始 alpha 越大
      initialAlpha: preset.fRating / 5.0,
      initialBeta: 1.0
    });
  });
};
```

---

## Phase 4: 用户反馈循环 (下周)

### 任务 4.1: 收集使用数据

**预计时间**: 1 小时

```typescript
// 在 preset switch 时记录
const onPresetSwitch = (presetId: string) => {
  analytics.record({
    event: 'preset_switch',
    presetId,
    source: 'ai-curated', // 标记来源
    timestamp: Date.now(),
    audioFeatures: getCurrentAudioFeatures()
  });
};

// 在用户收藏时记录
const onPresetFavorite = (presetId: string) => {
  banditRecommender.recordFeedback({
    armId: presetId,
    action: 'favorite',
    context: getCurrentContext()
  });
};
```

### 任务 4.2: 生成质量报告

**预计时间**: 2 小时

创建脚本 `scripts/analyze-ai-preset-usage.mjs`:

```javascript
// 分析哪些 AI 预设最受欢迎
// 生成 "最佳 AI 预设" 列表
// 识别需要淘汰的低质量预设
```

### 任务 4.3: 迭代优化

**预计时间**: 持续

- 每周审查使用率报告
- 淘汰使用率 < 1% 的预设
- 增加新的 AI 生成预设填补空缺

---

## 快速启动清单

### 今天必须完成

- [ ] 复制 curated 预设到项目
- [ ] 生成 manifest
- [ ] 配置预设库
- [ ] 测试新库可以加载

### 明天完成

- [ ] 复制 coupled 预设
- [ ] 生成配对清单
- [ ] 测试 3D 耦合效果

### 本周完成

- [ ] 生成 embeddings
- [ ] 集成相似搜索
- [ ] 集成 Bandit 推荐

---

## 预期效果

### 短期 (1 周)

- ✅ 用户可以使用 853 个新的高质量预设
- ✅ 3D 耦合系统有更多配对选择
- ✅ 预设库多样性增加

### 中期 (1 月)

- ✅ 推荐系统学会用户偏好
- ✅ 相似搜索帮助发现相关预设
- ✅ 淘汰低质量预设，保持库质量

### 长期 (3 月)

- ✅ AI 预设成为主要资产
- ✅ 个性化推荐精准度提高
- ✅ 形成 "生成-筛选-推荐" 的闭环

---

## 风险控制

### 问题 1: 文件过多导致构建慢

**解决方案**: 
- 只导入 curated 集 (853) 到主库
- coupled 集按需加载
- 使用动态导入而非打包

### 问题 2: 用户觉得 AI 预设质量不如人工

**解决方案**:
- 明确标注 "AI Generated"
- 设置不同的质量门槛
- 让用户选择使用/不使用 AI 预设

### 问题 3: 相似预设太多

**解决方案**:
- 使用相似搜索去重
- 聚类后每个 cluster 只保留 best
- 定期清理重复预设

---

## 成功指标

| 指标 | 当前 | 目标 (1月后) |
|------|------|--------------|
| 可用预设数 | 15,000 | 16,000+ |
| AI 预设使用率 | 0% | > 20% |
| 用户收藏率 | ? | > 5% |
| 3D 耦合对数 | ? | > 1000 |

---

**下一步**: 开始 Phase 1 任务 1.1
