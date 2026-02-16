# 炼丹产物利用计划

> 生成时间：2026-01-28
> 产物来源：D:\aidata\
> 模型：MiniMax-M2.1

---

## 1. 产物分析

### 1.1 产物列表

| 产物目录 | 类型 | 用途 | tier |
|---------|------|------|------|
| `long7d-techno-fusion-v4-dark` | MilkDrop 预设集 | Techno Fusion 暗黑风格 | dark |
| `long7d-techno-fusion-v4-relaxed` | MilkDrop 预设集 | Techno Fusion 放松风格 | relaxed |
| `long7d-techno-fusion-v4-relaxed-dark` | MilkDrop 预设集 | Techno Fusion 暗黑放松风格 | relaxed-dark |
| `long7d-techno-fusion-v4-strict` | MilkDrop 预设集 | Techno Fusion 严格风格 | strict |
| `lora-techno-parallel-v2-dark` | LoRA 模型 + 预设 | LoRA 风格迁移 v2 | dark |
| `lora-techno-rerun-v1-dark` | LoRA 模型 + 预设 | LoRA 重新训练 v1 | dark |
| `phase1-baseline-supplement-v6-dark` | MilkDrop 预设集 | Phase 1 基线补充 v6 | dark |
| `phase1-baseline-supplement-v6-strict` | MilkDrop 预设集 | Phase 1 基线补充 v6 | strict |
| `phase3-slow-curated-v4-dark` | MilkDrop 预设集 | Phase 3 慢速精选 | dark |
| `phase3-slow-curated-v4-strict` | MilkDrop 预设集 | Phase 3 慢速精选 | strict |
| `band-targets-*.txt` | 目标文件 | 频段响应目标数据 | - |
| `lora-targets-*.txt` | 目标文件 | LoRA 训练目标 | - |
| `slow-presets-*.txt` | 预设列表 | 慢速预设索引 | - |

### 1.2 产物结构

```
产物目录结构：
├── run-manifest.jsonl     # 预设索引（JSONL格式）
├── frames/                # 帧预览图
│   └── [hash]/            # 按hash分组的帧目录
│       ├── frame-000.webp
│       └── ...
├── [runX-crashsafe-XXXX]/ # 原始预设来源
│   └── presets/
│       └── *.milk         # MilkDrop 预设文件
└── quality/               # 质量分析数据
```

**run-manifest.jsonl 条目示例**：
```json
{
  "presetId": "unique-id",
  "relPath": "path/to/preset.milk",
  "filePath": "full/path/to/preset.milk",
  "status": "ok",
  "tier": "dark|relaxed|strict",
  "idHash": "hash-id",
  "frames": ["frame-000.webp", ...],
  "bestFrame": "frames/xx/xx/xxx/frame-000.webp",
  "metrics": {
    "avgLuma": 0.0-1.0,
    "motion": 0.0-1.0,
    "bandResponse": {"low":, "mid":, "high":},
    "bandClass": "flat|low|mid|high|balanced"
  },
  "reasons": ["quality-filter", "luma<0.02", ...],
  "score": 0.0-1.0
}
```

### 1.3 关键数据字段

| 字段 | 含义 | 利用方式 |
|-----|------|---------|
| `tier` | 风格分类 | 按场景自动切换预设 |
| `metrics.avgLuma` | 平均亮度 | 夜间/暗光环境筛选 |
| `metrics.motion` | 运动强度 | 节奏匹配筛选 |
| `metrics.bandClass` | 频段类型 | 低音/中音/高音响应预设 |
| `score` | 综合评分 | 高分预设优先推荐 |
| `reasons` | 筛选标签 | 排除低质量预设 |

---

## 2. 技术可行性分析

### 2.1 当前技术栈

| 组件 | 能力 |
|-----|------|
| **ProjectMLayer** | 加载/渲染 MilkDrop 预设 |
| **AudioBus** | 音频频段分析（low/mid/high） |
| **PresetsController** | 预设管理、收藏、轮播 |
| **LiquidMetalLayer** | 背景 Shader 特效 |
| **UI 工具栏** | 预设下拉、导入、URL加载 |

### 2.2 产物集成方式

**集成路径**：
1. **预设文件** → `public/presets/curated/[tier]/` 
2. **索引文件** → `public/presets/library-manifest.json`（扩展字段）
3. **预览帧** → `public/presets/thumbnails/`（用于 UI 预览）
4. **Metrics 数据** → 内置到预设元数据，供智能推荐使用

**集成架构**：
```
newliveweb/
├── public/
│   └── presets/
│       ├── curated/           # 炼丹产物预设
│       │   ├── dark/          # dark tier
│       │   ├── relaxed/       # relaxed tier
│       │   └── strict/        # strict tier
│       ├── thumbnails/        # 预览帧
│       └── curated-manifest.json  # 产物索引（含metrics）
└── src/
    └── features/
        └── presets/
            ├── CuratedPresetsController.ts  # 新增
            └── SmartSelector.ts              # 智能推荐
```

---

## 3. 利用计划

### 3.1 短期计划（1-2周）

1. **预设文件复制**
   - 将 `long7d-techno-fusion-v4-*` 的 .milk 文件复制到 `public/presets/curated/`
   - 按 tier 组织目录结构

2. **索引文件生成**
   - 编写脚本从 `run-manifest.jsonl` 生成 `curated-manifest.json`
   - 提取 tier、metrics、score 等关键字段

3. **UI 集成**
   - 工具栏添加 "Curated" 预设分类下拉
   - 显示预设预览图（鼠标悬停时）

4. **基本筛选功能**
   - 按 tier 筛选（dark/relaxed/strict）
   - 按 bandClass 筛选（low/mid/high/balanced）

### 3.2 中期计划（1个月）

1. **智能推荐系统**
   - 基于 `AudioBus` 实时频段分析
   - 自动匹配 `bandClass` 与当前音乐频段
   - 示例：检测到强低音 → 推荐 `bandClass: low` 的预设

2. **动态 tier 切换**
   - 根据时间自动切换 tier（如夜间 22:00 后默认 dark）
   - 根据环境亮度自动调整（需用户授权摄像头或手动切换）

3. **收藏与评分系统**
   - 利用 `score` 字段排序
   - 用户收藏 + 评分 → 个性化推荐

4. **预设对比工具**
   - 网格视图显示多个预设的预览帧
   - 并排对比选择

### 3.3 长期计划（3个月）

1. **AIVJ 自动化模式**
   - 基于当前音乐情绪自动切换预设风格
   - 集成简单规则引擎（如：bpm>128 + loudness>阈值 → techno）
   - 预留 ML 模型接口（未来可接入训练好的模型）

2. **LoRA 预设生成（探索）**
   - 尝试用 LoRA 权重微调现有预设参数
   - 生成风格一致的预设集合

3. **实时渲染优化**
   - 利用 `frames/` 数据预加载热点预设
   - WebP 缩略图缓存策略

4. **跨设备同步**
   - 收藏/评分数据云同步
   - 预设元数据共享

---

## 4. 实施步骤

### 4.1 前置检查

- [ ] 确认 D 盘 `aidata/` 可访问
- [ ] 检查 `public/presets/` 目录权限
- [ ] 确认 `npm run sync:presets` 脚本可用
- [ ] 备份现有 `public/presets/` 内容

### 4.2 具体步骤

**Step 1: 预设文件迁移**
```bash
# 创建目录结构
mkdir -p public/presets/curated/{dark,relaxed,strict}
mkdir -p public/presets/thumbnails

# 复制预设文件（示例）
cp -r /mnt/d/aidata/long7d-techno-fusion-v4-dark/run3-crashsafe-15000/presets/*.milk \
  public/presets/curated/dark/
# 重复其他 tier...
```

**Step 2: 生成索引脚本**
```typescript
// scripts/generate-curated-manifest.ts
import { readFileSync, writeFileSync } from 'fs';

const sourceDir = '/mnt/d/aidata';
const tiers = ['dark', 'relaxed', 'strict'];

for (const tier of tiers) {
  const manifestPath = `${sourceDir}/long7d-techno-fusion-v4-${tier}/run-manifest.jsonl`;
  const lines = readFileSync(manifestPath, 'utf-8').split('\n').filter(Boolean);
  
  const curated = lines.map(line => {
    const entry = JSON.parse(line);
    return {
      id: entry.presetId,
      name: entry.relPath.split('/').pop(),
      tier: entry.tier,
      score: entry.score,
      metrics: entry.metrics,
      bestFrame: entry.bestFrame,
      path: `presets/curated/${tier}/${entry.relPath.split('/').pop()}`
    };
  });
  
  writeFileSync(`public/presets/curated-${tier}.json`, JSON.stringify(curated, null, 2));
}
```

**Step 3: UI 集成**
```typescript
// src/features/presets/CuratedPanel.ts (新建)
// - 添加 tier 选择器
// - 显示预设网格预览
// - 实时筛选（metrics/bandClass）
```

**Step 4: 智能推荐集成**
```typescript
// src/features/presets/SmartSelector.ts (新建)
class SmartSelector {
  constructor(private audioBus: AudioBus) {}
  
  suggest(): string {
    const bands = this.audioBus.getBandResponse();
    const dominant = bands.low > bands.mid ? 'low' : 
                     bands.high > bands.mid ? 'high' : 'mid';
    
    return this.findPresetByBandClass(dominant);
  }
}
```

---

## 5. 预期效果

| 维度 | 效果 |
|-----|------|
| **预设质量** | 通过 `score` 字段自动过滤低质量预设 |
| **场景适配** | tier 系统支持 dark（夜间）、relaxed（氛围）、strict（高能） |
| **节奏同步** | bandClass 匹配实现更好的音画同步 |
| **用户体验** | 预览帧 + 评分排序降低选择成本 |
| **可扩展性** | 架构支持新增产物目录和未来 ML 模型 |

---

## 6. 风险和注意事项

| 风险 | 缓解措施 |
|-----|---------|
| **预设兼容性** | MilkDrop 预设可能在 ProjectM WASM 中表现不同，建议先小范围测试 |
| **性能问题** | 预览帧较多时延迟加载，只加载可见区域 |
| **存储空间** | 预设 + 预览帧约 1-2GB，考虑 CDN 方案 |
| **授权问题** | 检查预设原始授权（大部分 CC-BY-NC-SA 3.0） |
| **索引构建耗时** | 脚本运行可能需要几分钟，添加进度显示 |

---

## 7. 快速开始

### 告诉 AI 的话

**复制预设文件**：
> "从 D 盘 `aidata/` 目录复制炼丹产物到 `public/presets/curated/`：
> - `long7d-techno-fusion-v4-dark` → `public/presets/curated/dark/`
> - `long7d-techno-fusion-v4-relaxed` → `public/presets/curated/relaxed/`
> - `long7d-techno-fusion-v4-strict` → `public/presets/curated/strict/`"

**生成索引**：
> "创建一个脚本 `scripts/generate-curated-manifest.ts`，从 `run-manifest.jsonl` 生成 `curated-manifest.json`，提取 tier、metrics、score 等字段。"

**添加 UI**：
> "在工具栏添加 'Curated' 预设分类，显示 tier 筛选器和预设预览图。"

**实现智能推荐**：
> "创建 `SmartSelector.ts`，根据 AudioBus 的实时频段分析自动推荐 bandClass 匹配的预设。"

---

## 8. 产物来源速查

| 来源目录 | 包含内容 |
|---------|---------|
| `/mnt/d/aidata/long7d-techno-fusion-v4-*/` | Techno Fusion v4 系列预设 |
| `/mnt/d/aidata/lora-techno-*-v*/` | LoRA 模型和预设 |
| `/mnt/d/aidata/phase1-baseline-supplement-v*/` | Phase 1 基线补充 |
| `/mnt/d/aidata/phase3-slow-curated-v*/` | Phase 3 慢速精选 |
| `/mnt/d/aidata/band-targets-*.txt` | 频段目标数据 |
| `/mnt/d/aidata/lora-targets-*.txt` | LoRA 目标数据 |

---

*计划生成：Clawdbot AI Team*
*模型：MiniMax-M2.1*
