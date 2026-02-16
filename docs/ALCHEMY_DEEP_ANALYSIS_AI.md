# 炼丹数据深度分析报告（AI 详细版）

> 生成时间：2026-01-28
> 数据源：
> - 原始数据包：`MilkDrop 130k+ Presets MegaPack 2025`（136,102 预设，~1.3GB）
> - 产物目录：`D:\aidata\`（long7d-techno-fusion-v4、phase1/3 系列）
> - Target 文件：band-targets-high/low/mid.txt、lora-targets-techno.txt

---

## 1. 数据概况

### 1.1 原始数据包分析

| 属性 | 值 |
|-----|-----|
| 预设总数 | 136,102 |
| 数据量 | ~1.3GB |
| 平均文件大小 | ~10KB |
| 目录结构 | 扁平（仅 2 个子目录） |
| 数据来源 | Winamp Forum、DeviantArt、Discord、Reddit |

**来源说明**：
- Winamp Forum（48k+ 预设）：经典高质量预设
- DeviantArt、Discord、Twitter、Reddit：社区贡献
- 作者包括：Eo.S.、Martin (Nitorami)、Flexi、Krash、Geiss、stahlregen、MilkDrop2077 等

### 1.2 现有炼丹产物

| 产物目录 | 预设数 | tier | 来源 |
|---------|-------|------|------|
| phase3-slow-curated-v4-dark | 9,627 (4,915 唯一) | dark | run3-crashsafe-15000 |
| phase1-baseline-supplement-v6-dark | 6,xxx | dark | run3-crashsafe-15000 |
| long7d-techno-fusion-v4-dark | 5,xxx | dark | run3-crashsafe-15000 |
| long7d-techno-fusion-v4-strict | 5,xxx | strict | run3-crashsafe-15000 |
| lora-techno-parallel-v2-dark | 3,xxx | dark | LoRA 训练 |
| lora-techno-rerun-v1-dark | 3,xxx | dark | LoRA 重新训练 |

### 1.3 Target 文件

| 文件 | 条目数 | 用途 |
|-----|-------|------|
| band-targets-high.txt | 6,527 | 高频段响应强的预设 |
| band-targets-low.txt | 6,263 | 低频段响应强的预设 |
| band-targets-mid.txt | 765 | 中频段响应强的预设 |
| phase1-baseline-targets.txt | 5,673 | Phase 1 基线预设 |
| lora-targets-techno.txt | 3,201 | LoRA 训练目标 |
| slow-presets-slow2.txt | 1,609 | 慢速预设 |

---

## 2. 问题诊断

### 2.1 Target 分类冗余

**问题**：high 和 low 列表大量重叠

**分析**：
- high: 6,527 条目
- low: 6,263 条目
- 预计重叠率 > 50%

**根因**：当前分类仅基于 dominant band，未考虑预设的多频段响应特性

**改进建议**：
```typescript
// 新的多维分类
interface PresetBandProfile {
  bassStrength: number;      // 0-1
  midStrength: number;       // 0-1
  highStrength: number;      // 0-1
  overallMotion: number;     // 0-1
  primaryBand: 'low'|'mid'|'high'|'balanced';
  secondaryBand?: string;    // 次要频段
}

function classifyPresetBand(profile: PresetBandProfile): string {
  if (profile.bassStrength > 0.6 && profile.midStrength < 0.3) return 'bass-heavy';
  if (profile.highStrength > 0.6 && profile.midStrength < 0.3) return 'treble-heavy';
  if (profile.balanced()) return 'balanced';
  // ...
}
```

### 2.2 过滤阈值过严

**问题**：motion<0.01 过滤过严

**当前标准**：
- 普通版本：motion < 0.01 过滤
- slow 版本：motion < 0.006 过滤（更严格）

**影响**：
- 截断大量有动态变化的预设
- 慢速预设数量过少（仅 1,609 条目）

**建议标准**：
| tier | 建议 motion 阈值 | 说明 |
|------|-----------------|------|
| dark | < 0.008 | 适合暗光环境 |
| relaxed | < 0.015 | 适合放松氛围 |
| strict | < 0.025 | 适合高能场景 |
| slow | < 0.004 | 极低动态（当前 0.006 可放宽） |

### 2.3 质量指标缺失

**当前缺失的关键指标**：

| 缺失指标 | 业界标准 | 用途 |
|---------|---------|------|
| fRating | 0-5 分 | MilkDrop 内置用户评分 |
| Shader 复杂度 | SM2/SM3 | 性能影响 |
| Mesh Size | 8-128 | CPU 计算量 |
| 纹理质量 | blur1-3 | 视觉质量 |
| 作者信誉 | 已知作者列表 | 质量保证 |

**fRating 参考**：
- Cream of the Crop 精选 9,854 个 fRating=5.0 预设
- 建议筛选标准：fRating ≥ 4.0

### 2.4 数据覆盖不完整

**问题**：产物仅利用了 run3-crashsafe-15000 的子集

**未被利用的数据**：
- 130k 中的 100k+ 预设未被筛选
- 其他来源（DeviantArt、Discord 等）的预设未被处理
- bltc201 集合的部分预设未被利用

---

## 3. MilkDrop 质量评估体系

### 3.1 视觉质量指标

```typescript
interface VisualQualityMetrics {
  // 基础评分
  fRating: number;           // 0-5，用户评分
  
  // Shader 相关
  shaderModel: 'SM2' | 'SM3'; // Shader Model 版本
  warpComplexity: number;    // warp 着色器复杂度
  compComplexity: number;    // composite 着色器复杂度
  
  // 纹理质量
  textureQuality: number;    // 纹理采样质量
  blurLevel: 0 | 1 | 2 | 3;  // blur1-3 使用
  
  // 色彩表现
  colorSaturation: number;   // 颜色饱和度
  colorVariety: number;      // 色彩多样性
  
  // 动态表现
  motionVariety: number;     // 运动变化丰富度
  audioReactivity: number;   // 音频响应程度
}
```

### 3.2 音频响应指标

```typescript
interface AudioResponseMetrics {
  // 频段响应
  bassResponse: number;      // 低音响应强度
  midResponse: number;       // 中音响应强度
  trebleResponse: number;    // 高音响应强度
  
  // 衰减读数（平滑值）
  bassAtt: number;           // bass 衰减读数
  midAtt: number;            // mid 衰减读数
  trebAtt: number;           // treb 衰减读数
  
  // 波形
  waveMode: number;          // 波形模式 (0-7)
  waveAudioReactivity: number; // 波形音频响应
  
  // Custom shapes/waves
  customShapeCount: number;  // 自定义形状数量
  customWaveCount: number;   // 自定义波形数量
}
```

### 3.3 性能指标

```typescript
interface PerformanceMetrics {
  // 帧率
  targetFps: number;         // 目标帧率（30/60）
  actualFps: number;         // 实际帧率
  
  // 资源消耗
  shaderInstructions: number; // 着色器指令数
  meshSize: number;          // meshx * meshy
  
  // 兼容性
  gpuCompatibility: 'low' | 'mid' | 'high'; // GPU 兼容等级
  crashRisk: number;         // 崩溃风险 (0-1)
}
```

---

## 4. 优化算法设计

### 4.1 多维质量评分

```typescript
interface PresetScore {
  overall: number;           // 综合评分 (0-1)
  visual: number;            // 视觉评分
  audio: number;             // 音频响应评分
  performance: number;       // 性能评分
  
  // 各维度权重
  weights: {
    visual: 0.35;
    audio: 0.35;
    performance: 0.20;
    popularity: 0.10;        // fRating 权重
  };
}

function calculatePresetScore(metrics: PresetMetrics): PresetScore {
  return {
    visual: calculateVisualScore(metrics),
    audio: calculateAudioScore(metrics),
    performance: calculatePerformanceScore(metrics),
    popularity: metrics.fRating / 5,
    // ...
  };
}
```

### 4.2 智能筛选流程

```typescript
async function smartFilter(
  presets: string[],
  config: FilterConfig
): Promise<FilteredResult> {
  // Step 1: 粗筛 - 基础质量
  const passedBasic = await basicQualityFilter(presets, {
    minFRating: config.minFRating ?? 3.5,
    maxShaderComplexity: config.maxComplexity ?? 100,
  });
  
  // Step 2: 精筛 - 音频响应
  const audioScored = await scoreAudioResponse(passedBasic);
  
  // Step 3: 聚类 - 多样性保证
  const clustered = await clusterByStyle(audioScored, {
    maxPerCluster: 50,
    minClusters: config.minVariety ?? 5,
  });
  
  // Step 4: 最终排序
  const ranked = await rankByScore(clustered, {
    primaryMetric: 'audio',
    secondaryMetric: 'visual',
  });
  
  return {
    presets: ranked,
    stats: {
      inputCount: presets.length,
      outputCount: ranked.length,
      filterRate: (presets.length - ranked.length) / presets.length,
      clusterCount: clustered.length,
    },
  };
}
```

### 4.3 130k 数据包利用策略

**策略：分层抽样 + 定向筛选**

```bash
# 1. 随机抽样 1%（~1,360 预设）
python scripts/sample_presets.py \
  --input "/mnt/c/Users/pc/code/MilkDrop 130k+ Presets MegaPack 2025/presets" \
  --output /mnt/d/aidata/sample_1pct/ \
  --ratio 0.01

# 2. 定向筛选优质作者
python scripts/filter_by_author.py \
  --input /mnt/d/aidata/sample_1pct/ \
  --output /mnt/d/aidata/high_quality/ \
  --authors "Geiss,Flexi,Krash,Martin,Eo.S,MilkDrop2077,stahlregen"

# 3. 基于 fRating 筛选（如果有数据）
python scripts/filter_by_rating.py \
  --input /mnt/d/aidata/high_quality/ \
  --output /mnt/d/aidata/final_curated/ \
  --min_rating 4.0
```

---

## 5. 实施路线图

### 5.1 短期（1-2 周）

1. **修复现有**
   - [产物问题 ] 补充缺失的 run-manifest.json
   - [ ] 合并去重 Target 文件
   - [ ] 调整 motion 过滤阈值

2. **建立评估指标**
   - [ ] 实现 fRating 解析（如果数据中有）
   - [ ] 实现 Shader 复杂度检测
   - [ ] 实现 Mesh Size 检测

3. **产物目录整理**
   - [ ] 统一产物目录结构
   - [ ] 生成完整的 curated-manifest.json
   - [ ] 备份现有产物

### 5.2 中期（1 个月）

1. **130k 数据包处理**
   - [ ] 完成 1% 抽样分析
   - [ ] 建立优质作者库
   - [ ] 筛选首批新产物（~5,000 预设）

2. **智能筛选系统**
   - [ ] 实现多维质量评分
   - [ ] 实现多样性聚类
   - [ ] 实现自动分类（dark/relaxed/strict）

3. **newliveweb 集成**
   - [ ] 集成新产物到预设系统
   - [ ] 实现智能推荐（基于 AudioBus 频段分析）
   - [ ] 实现 tier 自动切换

### 5.3 长期（3 个月）

1. **LoRA 训练探索**
   - [ ] 基于高质量预设训练 LoRA
   - [ ] 生成新风格预设
   - [ ] A/B 测试效果

2. **持续优化**
   - [ ] 建立自动化炼丹 pipeline
   - [ ] 集成用户反馈（收藏/评分）
   - [ ] 定期更新产物

---

## 6. 附录：关键文件位置

| 文件/目录 | 路径 |
|----------|------|
| 原始数据包 | `C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets` |
| 产物目录 | `D:\aidata\` |
| Target 文件 | `D:\aidata\band-targets-*.txt` |
| 产物索引 | `D:\aidata\*/run-manifest.jsonl` |
| newliveweb 预设目录 | `public/presets/` |

---

## 7. 多轮讨论记录

### 讨论 1：炼丹流程问题诊断

**参与**：AI-2（产物分析）、AI-3（优化方法）

**结论**：
1. Target 分类需要从单维度（dominant band）改为多维分类
2. motion 过滤阈值需要放宽，建议根据 tier 分级
3. 需要补充 fRating、Shader 复杂度等关键指标
4. 130k 数据包需要分层抽样 + 定向筛选策略

### 讨论 2：130k 数据包利用策略（进行中）

**待讨论**：
1. 抽样比例选择（1% vs 5%）
2. 优质作者库建立方法
3. 与现有产物的差异化

---

*报告生成：Clawdbot AI Team*
*模型：MiniMax-M2.1*
