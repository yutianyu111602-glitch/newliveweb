# 双层 ProjectM 3D 耦合干涉系统 - 技术方案文档

> 生成时间: 2026-01-29 01:50
> 版本: v1.0

## 执行摘要

本文档描述了一个创新性的双层 ProjectM 3D 耦合干涉系统设计方案。该系统通过**时空混合耦合算法**，在不使用闭源 WASM 修改的情况下，实现两层可视化效果之间的动态干涉和深度感。系统整合了约 24,000 个现有炼丹产物，并生成了 3,000 对高质量耦合预设用于项目集成。

**核心指标:**
- 现有产物整合: 24,000+ 预设
- 新增耦合预设: 3,000 对 (FG/BG)
- 平均 warp 差异: 0.040
- 平均空间偏移: 0.057
- 生成耗时: ~15秒

---

## 一、现状分析

### 1.1 现有产物汇总

| 产物目录 | 数量 | 质量等级 | 特点 |
|---------|------|---------|------|
| `ai_generated/` | 6,800 | 低 | 17行基础参数 |
| `ai_generated_quality/` | 1,000 | 中 | 77行完整模板 |
| `ai_generated_premium/` | 10,000 | 高 | 200行+shapecode |
| `ai_generated_v2/` | 5,000 | 高 | 200行优化参数 |
| `ai_generated_coupled/` | 500 对 | 高 | 3D耦合初版 |
| **`ai_generated_coupled_final/`** | **3,000 对** | **最高** | **时空混合耦合** |

### 1.2 项目代码分析

#### 1.2.1 双层 ProjectM 初始化 (bootstrap.ts)

```typescript
// 前景层 FG
const projectLayer = new ProjectMLayer({
  opacity: 0.7,
  audioProfile: "flat",
  compositorLayer: 1,
});

// 背景层 BG
const projectLayerBg = new ProjectMLayer({
  opacity: 0.4,
  audioProfile: "bg",
  compositorLayer: 2,
});

// 混合模式配置
projectLayer.setUseCompositor(true);
projectLayerBg.setUseCompositor(false);
projectLayerBg.setBlendParams({
  opacity: 0.4,
  blendMode: "normal",  // 默认 normal，可切换 add/overlay 等
  energyToOpacityAmount: 0.12,
  audioDrivenOpacity: true,
});
```

#### 1.2.2 当前耦合机制 (bootstrap.ts)

现有系统通过 `setExternalOpacityDrive01()` 实现基础的耦合：

```typescript
// 状态变量
let couplingFgDrive = 0;
let couplingBgDrive = 0;
let couplingLastOutput = 0;
let couplingLumaFg = 0;
let couplingLumaBg = 0;
let couplingLumaDelta = 0;
let couplingFlipTimes: number[] = [];

// 耦合计算
const fgDrive = audioDrive * edgeBias * presetBias;
const bgDrive = audioDrive * (1 - presetBias);

projectLayer.setExternalOpacityDrive01(fgDrive);
projectLayerBg.setExternalOpacityDrive01(bgDrive);
```

**当前机制的局限性:**
1. 仅控制不透明度驱动
2. 无参数层面的干涉
3. 无空间耦合（视差）
4. 无时间域干涉（相位差）

#### 1.2.3 ProjectMLayer API 分析

关键可用 API:
- `loadPresetFromUrl(url)` - 加载预设
- `loadPresetFromData(data)` - 加载预设数据
- `setExternalOpacityDrive01(value)` - 设置不透明度驱动
- `setBlendMode(mode)` - 设置混合模式
- `setUseCompositor(bool)` - 启用合成器

**不可用（闭源 WASM）:**
- 直接修改 warp/zoom/rot 参数
- 访问内部渲染管线
- 修改 shader 代码

### 1.3 技术约束

| 约束类型 | 描述 | 影响 |
|---------|------|------|
| projectM WASM | 闭源，无法修改内部 | 无法实现真正的 3D 空间干涉 |
| 预设格式 | MilkDrop 标准格式 | 需在预设生成时预耦合 |
| 前端性能 | 60fps 实时渲染 | 耦合算法需低开销 |

---

## 二、技术方案：时空混合耦合

### 2.1 核心原理

由于无法修改 projectM 内部，我们采用**参数预耦合**策略：
在预设生成阶段，为 FG 和 BG 生成互补的参数对，使其在渲染时自然产生干涉效果。

**时空混合耦合 =**
- **空间耦合** → cx/cy 偏移产生视差
- **时间耦合** → rot/zoom 周期性干涉
- **warp 耦合** → 扭曲强度互相影响
- **运动耦合** → mv_dx/mv_dy 动态关联
- **RGB 耦合** → 色散分离产生深度感

### 2.2 数学模型

#### 2.2.1 空间耦合（视差）

```
cx_fg(t) = cx_base + k_spatial × A_s × sin(ω_s × t + φ_s + pair_id)
cx_bg(t) = cx_base - k_spatial × A_s × sin(ω_s × t + φ_s + pair_id)

其中:
- k_spatial = 0.3 (空间耦合强度)
- A_s = 0.03 (振幅)
- ω_s = 1.0 (角频率)
- φ_s = 0.5 (相位偏移)
```

效果：FG 和 BG 在水平方向上产生周期性偏移差，模拟3D视差。

#### 2.2.2 时间耦合（旋转干涉）

```
rot_fg(t) = rot_base + k_temporal × A_t × sin(ω_t × t + φ_t + pair_id × 0.5)
rot_bg(t) = rot_base - k_temporal × A_t × sin(ω_t × t + φ_t + pair_id × 0.5)

zoom_fg(t) = zoom_base + k_temporal × A_z × sin(ω_z × t + pair_id × 0.3)
zoom_bg(t) = zoom_base - k_temporal × A_z × sin(ω_z × t + pair_id × 0.3)

其中:
- k_temporal = 0.4 (时间耦合强度)
- A_t = 0.15 (旋转振幅)
- A_z = 0.01 (缩放振幅)
```

效果：FG 和 BG 产生相反方向的旋转和缩放，形成"呼吸"干涉效果。

#### 2.2.3 warp 耦合（扭曲干涉）

```
warp_fg(t) = warp_base + k_warp × A_w × cos(ω_w × t + pair_id × 0.7) × warp_bg
warp_bg(t) = warp_bg_base - k_warp × A_w × cos(ω_w × t + pair_id × 0.7) × warp_fg × 0.5

其中:
- k_warp = 0.25 (warp耦合强度)
- A_w = 0.1 (振幅因子)
```

效果：FG 的 warp 受 BG warp 调制，产生复杂的扭曲干涉。

#### 2.2.4 运动耦合（动态关联）

```
mv_dx_fg(t) = mv_dx_base + k_motion × A_m × sin(ω_m × t + pair_id)
mv_dx_bg(t) = mv_dx_base - k_motion × A_m × sin(ω_m × t + pair_id)

其中:
- k_motion = 0.2 (运动耦合强度)
- A_m = 0.005 (振幅)
```

效果：FG 和 BG 的运动向量产生关联，形成"跟随"或"对抗"效果。

#### 2.2.5 RGB 耦合（色散分离）

```
rgb_shift_fg(t) = 0.3 + k_rgb × A_r × sin(ω_w × t + pair_id × 0.3)
rgb_shift_bg(t) = 0.3 - k_rgb × A_r × sin(ω_w × t + pair_id × 0.3)

其中:
- k_rgb = 0.15 (RGB耦合强度)
- A_r = 0.1 (振幅)
```

效果：FG 和 BG 产生相反的 RGB 分离，模拟色散深度感。

### 2.3 参数配置

```python
COUPLING_CONFIG = {
    # 耦合强度 (0-1)
    'k_spatial': 0.3,      # 空间耦合
    'k_temporal': 0.4,     # 时间耦合
    'k_warp': 0.25,        # warp耦合
    'k_motion': 0.2,       # 运动耦合
    'k_rgb': 0.15,         # RGB耦合
    
    # 相位偏移
    'phase_spatial': 0.5,
    'phase_temporal': 0.7,
    'phase_warp': 0.3,
    
    # 噪声（有机感）
    'noise_scale': 0.02,
}
```

---

## 三、产物整合计划

### 3.1 数据源分析

| 数据源 | 数量 | 特点 | 用途 |
|-------|------|------|------|
| `curated_v5_dark` | 500 | fRating=5.0, 暗黑风格 | 学习高评分参数 |
| `curated_v5_relaxed` | 353 | fRating=5.0, 放松风格 | 学习多样性 |
| `ai_generated_premium` | 10,000 | 200行完整模板 | 基础学习 |
| `ai_generated_v2` | 5,000 | 优化参数范围 | 基础学习 |

### 3.2 参数学习流程

```
1. 扫描所有数据源 (.milk 文件)
2. 提取参数 (warp/zoom/rot/fDecay 等)
3. 计算统计分布 (mean/std/min/max/median/q25/q75)
4. 生成时从学习到的分布采样
```

### 3.3 产物目录结构

```
ai_generated_coupled_final/
├── fg/                          # 前景预设 (3000个)
│   ├── coupled_00000_xxx_fg.milk
│   ├── coupled_00001_xxx_fg.milk
│   └── ...
├── bg/                          # 背景预设 (3000个)
│   ├── coupled_00000_xxx_bg.milk
│   ├── coupled_00001_xxx_bg.milk
│   └── ...
├── manifest.jsonl               # 配对清单
├── stats.json                   # 统计信息
└── coupling_config.json         # 耦合配置
```

### 3.4 预设质量指标

| 指标 | 目标值 | 实测值 |
|-----|-------|-------|
| warp 差异 | >0.03 | 0.040 |
| cx 差异 | >0.04 | 0.057 |
| rot 差异 | >0.05 | - |
| nWaveMode 范围 | 0-5 | 0-5 |
| 文件完整性 | 100% | 100% |

---

## 四、前端集成方案

### 4.1 预设加载策略

```typescript
interface CoupledPresetPair {
  fg: string;  // 前景预设 URL
  bg: string;  // 背景预设 URL
  id: string;  // 配对 ID
}

class CoupledPresetManager {
  private pairs: CoupledPresetPair[] = [];
  private currentIndex: number = 0;
  
  async loadNextPair(): Promise<void> {
    const pair = this.pairs[this.currentIndex];
    
    // 并行加载 FG 和 BG
    await Promise.all([
      projectLayer.loadPresetFromUrl(pair.fg),
      projectLayerBg.loadPresetFromUrl(pair.bg),
    ]);
    
    this.currentIndex = (this.currentIndex + 1) % this.pairs.length;
  }
}
```

### 4.2 动态切换策略

```typescript
async function switchCoupledPreset() {
  const manifest = await fetch('/ai_generated_coupled_final/manifest.jsonl');
  const lines = manifest.split('\n');
  const pair = JSON.parse(lines[currentIndex]);
  
  // 先切换 BG，再切换 FG（避免视觉跳变）
  await projectLayerBg.loadPresetFromUrl(pair.bg);
  await projectLayer.loadPresetFromUrl(pair.fg);
  
  currentIndex = (currentIndex + 1) % lines.length;
}
```

### 4.3 运行时参数微调（可选）

虽然无法直接修改 projectM 参数，但可以通过调整混合模式增强耦合效果：

```typescript
function enhanceCoupling(fgParams: CoupledMetrics, bgParams: CoupledMetrics) {
  // 根据参数差异调整混合模式
  if (fgParams.warp_diff > 0.1) {
    projectLayer.setBlendMode('add');  // 增强扭曲效果
  }
  
  if (fgParams.cx_diff > 0.08) {
    projectLayer.setExternalOpacityDrive01(0.8);  // 增强视差效果
  }
}
```

---

## 五、实施路线图

### 阶段 1: 基础架构 (DONE ✅)

- [x] 扫描现有产物
- [x] 实现参数学习
- [x] 实现时空混合耦合算法
- [x] 生成 3,000 对耦合预设

**产出:**
- `scripts/alchemy/generate_coupled_v2.py`
- `ai_generated_coupled_final/` (3000 对)

### 阶段 2: 集成开发 (TODO)

- [ ] 前端预设加载器
- [ ] 配对 manifest 解析
- [ ] 动态切换逻辑
- [ ] 混合模式自动调整

### 阶段 3: 优化增强 (TODO)

- [ ] 根据音频能量动态调整混合模式
- [ ] 实现预设对自动评分
- [ ] 生成更大规模的耦合数据集

### 阶段 4: 高级特性 (TODO)

- [ ] 实时参数微调（如果 projectM 暴露 API）
- [ ] 运行时耦合强度可调
- [ ] 用户自定义耦合参数

---

## 六、风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|-----|-------|------|---------|
| 预设不兼容 | 低 | 中 | 使用项目兼容的参数范围 |
| 性能问题 | 低 | 低 | 预设预生成，无运行时开销 |
| 视觉一致性 | 中 | 中 | 增加质量筛选流程 |
| 存储空间 | 低 | 低 | 约 100MB 可接受 |

---

## 七、附录

### A. 生成命令

```bash
# 生成 3000 对耦合预设
python3 scripts/alchemy/generate_coupled_v2.py --count 3000

# 自定义参数
python3 scripts/alchemy/generate_coupled_v2.py \
  --count 5000 \
  --k_spatial 0.4 \
  --k_temporal 0.5 \
  --k_warp 0.3 \
  --seed 123
```

### B. 关键文件

| 文件 | 描述 |
|-----|------|
| `scripts/alchemy/generate_coupled_v2.py` | 耦合预设生成器 |
| `docs/3D_COUPLED_ALCHEMY_PLAN.md` | 本文档 |
| `ai_generated_coupled_final/manifest.jsonl` | 配对清单 |
| `ai_generated_coupled_final/stats.json` | 统计信息 |

### C. 参考资料

- [MilkDrop Preset Format](https://github.com/michaelhou09/MilkDrop-Preset-Format)
- [projectM Documentation](https://github.com/projectM-visualizer/projectm)
- newliveweb `src/layers/ProjectMLayer.ts`
- newliveweb `src/app/bootstrap.ts`

---

*文档生成时间: 2026-01-29 01:50*
*版本: v1.0*
