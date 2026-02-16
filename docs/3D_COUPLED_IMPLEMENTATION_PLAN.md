# 双层 ProjectM 3D 耦合干涉系统 - 完整实施计划

> 计划版本: v2.0  
> 生成时间: 2026-01-29 02:08  
> 负责人: AI 炼丹团队 + 前端开发组

---

## 目录

1. [项目概述](#1-项目概述)
2. [目标与成功标准](#2-目标与成功标准)
3. [任务分解](#3-任务分解)
4. [时间线](#4-时间线)
5. [资源需求](#5-资源需求)
6. [详细技术任务](#6-详细技术任务)
7. [风险与应对](#7-风险与应对)
8. [质量标准](#8-质量标准)
9. [验收标准](#9-验收标准)
10. [附录](#10-附录)

---

## 1. 项目概述

### 1.1 背景

newliveweb 项目使用双层 ProjectM 可视化系统（前景 FG + 背景 BG），当前通过 `setExternalOpacityDrive01()` 实现基础的不透明度耦合。为了增强视觉效果，需要实现真正的"3D 耦合干涉"效果。

### 1.2 问题陈述

| 当前状态 | 期望状态 |
|---------|---------|
| 仅不透明度耦合 | 完整的时空混合耦合 |
| 独立渲染两层 | 两层互相干涉产生深度感 |
| 静态参数 | 动态关联的参数变化 |
| 无预设语义关系 | 预设对 (FG/BG) 语义关联 |

### 1.3 解决方案

采用**参数预耦合 + 运行时增强**策略：
1. **生成阶段**: 为 FG/BG 生成互补的参数对
2. **加载阶段**: 并行加载预设对
3. **运行阶段**: 通过混合模式增强耦合效果

---

## 2. 目标与成功标准

### 2.1 主要目标

| 目标 | 指标 | 目标值 |
|-----|------|-------|
| 生成规模 | 耦合预设对数 | 10,000 对 |
| 质量 | 平均 warp 差异 | >0.03 |
| 质量 | 平均 cx 差异 | >0.04 |
| 性能 | 前端加载时间 | <500ms |
| 体验 | 切换流畅度 | 无视觉跳变 |

### 2.2 成功标准

- [ ] 生成 10,000 对高质量耦合预设
- [ ] 预设可通过项目加载并正常渲染
- [ ] FG/BG 叠加产生可感知的 3D 干涉效果
- [ ] 前端集成完成，可动态切换预设对
- [ ] 文档完整，代码可维护

---

## 3. 任务分解

### 3.1 工作分解结构 (WBS)

```
┌─────────────────────────────────────────────────────────────┐
│                    双层 ProjectM 3D 耦合系统                   │
├─────────────────────────────────────────────────────────────┤
│  阶段1: 数据准备 (1周)                                        │
│  ├── 1.1 扫描现有产物                                         │
│  ├── 1.2 参数学习分析                                         │
│  └── 1.3 数据清洗标注                                         │
├─────────────────────────────────────────────────────────────┤
│  阶段2: 算法开发 (2周)                                        │
│  ├── 2.1 空间耦合算法                                         │
│  ├── 2.2 时间耦合算法                                         │
│  ├── 2.3 warp耦合算法                                         │
│  ├── 2.4 运动耦合算法                                         │
│  └── 2.5 RGB耦合算法                                          │
├─────────────────────────────────────────────────────────────┤
│  阶段3: 数据生成 (1周)                                        │
│  ├── 3.1 生成测试数据集 (1000对)                              │
│  ├── 3.2 质量验证                                             │
│  └── 3.3 生成完整数据集 (10000对)                             │
├─────────────────────────────────────────────────────────────┤
│  阶段4: 前端集成 (2周)                                        │
│  ├── 4.1 预设加载器开发                                       │
│  ├── 4.2 manifest 解析器                                      │
│  ├── 4.3 动态切换逻辑                                         │
│  └── 4.4 混合模式自动调整                                     │
├─────────────────────────────────────────────────────────────┤
│  阶段5: 测试优化 (1周)                                        │
│  ├── 5.1 单元测试                                             │
│  ├── 5.2 集成测试                                             │
│  └── 5.3 性能优化                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 任务清单

| 任务ID | 任务名称 | 负责人 | 工期 | 依赖 |
|--------|---------|-------|------|------|
| T1.1 | 扫描现有产物 | AI Agent | 2h | - |
| T1.2 | 参数提取 | AI Agent | 4h | T1.1 |
| T1.3 | 分布学习 | AI Agent | 2h | T1.2 |
| T1.4 | 数据清洗 | AI Agent | 2h | T1.3 |
| T2.1 | 空间耦合算法 | AI Agent | 4h | T1.4 |
| T2.2 | 时间耦合算法 | AI Agent | 4h | T2.1 |
| T2.3 | warp耦合算法 | AI Agent | 4h | T2.1 |
| T2.4 | 运动耦合算法 | AI Agent | 4h | T2.1 |
| T2.5 | RGB耦合算法 | AI Agent | 4h | T2.1 |
| T3.1 | 测试生成 | AI Agent | 2h | T2.5 |
| T3.2 | 质量验证 | AI Agent | 2h | T3.1 |
| T3.3 | 批量生成 | AI Agent | 4h | T3.2 |
| T4.1 | 预设加载器 | 前端开发 | 8h | T3.3 |
| T4.2 | manifest解析器 | 前端开发 | 4h | T4.1 |
| T4.3 | 切换逻辑 | 前端开发 | 8h | T4.2 |
| T4.4 | 混合模式调整 | 前端开发 | 8h | T4.3 |
| T5.1 | 单元测试 | QA | 8h | T4.4 |
| T5.2 | 集成测试 | QA | 8h | T5.1 |
| T5.3 | 性能优化 | 前端开发 | 8h | T5.2 |

**总工期: 7 周 (约 35 个工作日)**

---

## 4. 时间线

### 4.1 甘特图

```
周次    | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
--------|---|---|---|---|---|---|---|
阶段1   |███|   |   |   |   |   |   |
阶段2   |   |███|███|   |   |   |   |
阶段3   |   |   |   |███|   |   |   |
阶段4   |   |   |   |███|███|   |   |
阶段5   |   |   |   |   |   |███|███|
```

### 4.2 里程碑

| 里程碑 | 时间 | 交付物 |
|-------|------|-------|
| M1: 数据就绪 | 第1周末 | 参数分布报告 |
| M2: 算法完成 | 第3周末 | 耦合算法代码 |
| M3: 测试数据 | 第4周中 | 1000对测试预设 |
| M4: 完整数据 | 第4周末 | 10000对完整预设 |
| M5: 前端集成 | 第6周末 | 集成代码 |
| M6: 发布 | 第7周末 | 完整功能 |

---

## 5. 资源需求

### 5.1 人力资源

| 角色 | 数量 | 投入时间 |
|-----|------|---------|
| AI 工程师 (MiniMax) | 1 | 3 周 |
| 前端工程师 | 1 | 3 周 |
| QA 工程师 | 1 | 2 周 |
| 项目经理 | 0.5 | 贯穿全程 |

### 5.2 Kimi AI 集成状态

**⚠️ 状态**: API Key 验证失败

**测试结果**:
```
API Key 格式: ✅ 正确
网络连接: ✅ 可达
认证: ❌ 被拒绝 (Incorrect API key)
```

**后续行动**:
1. 请用户从 [Kimi Code 控制台](https://www.kimi.com/code/console) 获取新 Key
2. 更新环境变量: `export KIMI_API_KEY='sk-kimi-xxx'`
3. 重新运行测试: `python scripts/alchemy/kimi_integration.py <api_key>`

**集成模块已就绪**: `scripts/alchemy/kimi_integration.py`

### 5.2 计算资源

| 资源 | 规格 | 用途 |
|-----|------|------|
| 本地开发机 | 当前配置 | 代码开发 |
| D 盘存储 | 200MB+ | 产物存储 |
| CI/CD | 2核CPU | 自动化测试 |

### 5.3 软件依赖

| 软件 | 版本 | 用途 |
|-----|------|------|
| Python | 3.9+ | 后端生成 |
| Node.js | 18+ | 前端开发 |
| TypeScript | 5.0+ | 类型安全 |
| Jest | 29+ | 单元测试 |

---

## 6. 详细技术任务

### 6.1 数据准备 (阶段1)

#### T1.1 扫描现有产物

```python
# 伪代码
def scan_existing_presets():
    sources = [
        '/mnt/d/aidata/ai_generated/',
        '/mnt/d/aidata/ai_generated_premium/',
        '/mnt/d/aidata/ai_generated_v2/',
        '/mnt/d/aidata/curated_v5_dark/',
        '/mnt/d/aidata/curated_v5_relaxed/',
    ]
    
    for source in sources:
        count = count_files(f'{source}/*.milk')
        print(f'{source}: {count} presets')
    
    return total_count
```

**验收标准:**
- [ ] 所有目录扫描完成
- [ ] 数量统计准确
- [ ] 无重复计数

#### T1.2 参数提取

提取参数列表:
```python
PARAMS_TO_EXTRACT = [
    # 核心参数
    'warp', 'zoom', 'rot', 'fDecay', 'fGammaAdj',
    # 波形参数
    'nWaveMode', 'fWaveAlpha', 'fWaveScale', 'fWaveSmoothing',
    # 运动参数
    'nMotionVectorsX', 'nMotionVectorsY', 'mv_dx', 'mv_dy',
    # 位置参数
    'cx', 'cy', 'dx', 'dy',
    # 形状参数
    'shapecode_0_sides', 'shapecode_0_rad',
]
```

**验收标准:**
- [ ] 每个预设提取 20+ 参数
- [ ] 缺失参数有默认值
- [ ] 异常值已处理

#### T1.3 分布学习

```python
def learn_distributions(presets):
    stats = {}
    for param in PARAMS_TO_EXTRACT:
        values = [p[param] for p in presets if p[param] is not None]
        stats[param] = {
            'mean': np.mean(values),
            'std': np.std(values),
            'min': np.min(values),
            'max': np.max(values),
            'q25': np.percentile(values, 25),
            'q75': np.percentile(values, 75),
        }
    return stats
```

### 6.2 算法开发 (阶段2)

#### T2.1 空间耦合算法

```python
def spatial_coupling(fg, bg, time, pair_id, config):
    """
    空间耦合：cx 偏移产生视差
    
    cx_fg = cx_base + k_spatial × 0.03 × sin(phase_spatial × time + pair_id)
    cx_bg = cx_base - k_spatial × 0.03 × sin(phase_spatial × time + pair_id)
    """
    k = config['k_spatial']
    phase = config['phase_spatial']
    
    offset = k * 0.03 * math.sin(phase * time + pair_id)
    
    fg['cx'] = np.clip(fg['cx'] + offset, 0.4, 0.6)
    bg['cx'] = np.clip(bg['cx'] - offset, 0.4, 0.6)
    
    return fg, bg
```

#### T2.2 时间耦合算法

```python
def temporal_coupling(fg, bg, time, pair_id, config):
    """
    时间耦合：rot/zoom 周期性干涉
    
    rot_fg = rot_base + k_temporal × 0.15 × sin(phase_temporal × time + pair_id × 0.5)
    rot_bg = rot_base - k_temporal × 0.15 × sin(phase_temporal × time + pair_id × 0.5)
    """
    k = config['k_temporal']
    phase = config['phase_temporal']
    
    # 旋转干涉
    rot_offset = k * 0.15 * math.sin(phase * time + pair_id * 0.5)
    fg['rot'] += rot_offset
    bg['rot'] -= rot_offset
    
    # 缩放呼吸
    zoom_offset = k * 0.01 * math.sin(time * 0.3 + pair_id * 0.3)
    fg['zoom'] += zoom_offset
    bg['zoom'] -= zoom_offset
    
    return fg, bg
```

#### T2.3 warp 耦合算法

```python
def warp_coupling(fg, bg, time, pair_id, config):
    """
    warp耦合：扭曲强度互相影响
    
    warp_fg = warp_base + k_warp × 0.1 × cos(phase_warp × time + pair_id × 0.7) × warp_bg
    """
    k = config['k_warp']
    phase = config['phase_warp']
    
    warp_factor = k * 0.1 * math.cos(phase * time + pair_id * 0.7)
    
    fg['warp'] = np.clip(
        fg['warp'] + warp_factor * bg['warp'],
        fg['warp_range'][0], fg['warp_range'][1]
    )
    bg['warp'] = np.clip(
        bg['warp'] - warp_factor * fg['warp'] * 0.5,
        bg['warp_range'][0], bg['warp_range'][1]
    )
    
    return fg, bg
```

#### T2.4 运动耦合算法

```python
def motion_coupling(fg, bg, time, pair_id, config):
    """
    运动耦合：mv_dx/mv_dy 动态关联
    
    mv_fg = mv_base + k_motion × 0.005 × sin(time × 0.5 + pair_id)
    mv_bg = mv_base - k_motion × 0.005 × sin(time × 0.5 + pair_id)
    """
    k = config['k_motion']
    
    mv_offset = k * 0.005 * math.sin(time * 0.5 + pair_id)
    
    fg['mv_dx'] += mv_offset
    bg['mv_dx'] -= mv_offset
    
    return fg, bg
```

#### T2.5 RGB 耦合算法

```python
def rgb_coupling(fg, bg, time, pair_id, config):
    """
    RGB耦合：色散分离产生深度感
    
    rgb_fg = 0.3 + k_rgb × 0.1 × sin(phase_warp × time + pair_id × 0.3)
    rgb_bg = 0.3 - k_rgb × 0.1 × sin(phase_warp × time + pair_id × 0.3)
    """
    k = config['k_rgb']
    phase = config['phase_warp']
    
    rgb_offset = k * 0.1 * math.sin(phase * time + pair_id * 0.3)
    
    fg['rgb_shift'] = 0.3 + rgb_offset
    bg['rgb_shift'] = 0.3 - rgb_offset
    
    return fg, bg
```

### 6.3 前端集成 (阶段4)

#### T4.1 预设加载器

```typescript
// src/presets/CoupledPresetLoader.ts

interface CoupledPresetPair {
  readonly pairId: number;
  readonly fgUrl: string;
  readonly bgUrl: string;
  readonly metrics: {
    readonly warpDiff: number;
    readonly cxDiff: number;
    readonly rotDiff: number;
  };
}

export class CoupledPresetLoader {
  private manifest: CoupledPresetPair[] = [];
  private currentIndex = 0;
  
  async loadManifest(url: string): Promise<void> {
    const response = await fetch(url);
    const lines = await response.text();
    
    this.manifest = lines
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }
  
  async loadPair(index: number): Promise<void> {
    const pair = this.manifest[index];
    
    // 并行加载
    await Promise.all([
      projectLayer.loadPresetFromUrl(pair.fgUrl),
      projectLayerBg.loadPresetFromUrl(pair.bgUrl),
    ]);
  }
  
  async loadNextPair(): Promise<void> {
    this.currentIndex = (this.currentIndex + 1) % this.manifest.length;
    await this.loadPair(this.currentIndex);
  }
}
```

#### T4.3 动态切换逻辑

```typescript
// src/presets/CoupledPresetSwitcher.ts

export class CoupledPresetSwitcher {
  private loader: CoupledPresetLoader;
  private transitionDuration = 500; // ms
  
  async switchWithTransition(direction: 'next' | 'prev'): Promise<void> {
    // 1. 预加载下一对
    const nextIndex = this.calculateNextIndex(direction);
    await this.loader.preloadPair(nextIndex);
    
    // 2. 淡出当前层
    await this.fadeOut(projectLayer, this.transitionDuration / 2);
    
    // 3. 切换预设
    await this.loader.loadPair(nextIndex);
    
    // 4. 淡入新层
    await this.fadeIn(projectLayer, this.transitionDuration / 2);
    
    // 5. 调整混合模式
    await this.adjustBlendMode();
  }
  
  private async adjustBlendMode(): Promise<void> {
    const metrics = this.loader.getCurrentMetrics();
    
    if (metrics.warpDiff > 0.1) {
      projectLayer.setBlendMode('add');
    } else if (metrics.cxDiff > 0.08) {
      projectLayer.setBlendMode('screen');
    } else {
      projectLayer.setBlendMode('normal');
    }
  }
}
```

---

## 7. 风险与应对

### 7.1 风险矩阵

| 风险ID | 风险描述 | 可能性 | 影响 | 风险等级 | 应对措施 |
|--------|---------|-------|------|---------|---------|
| R1 | 预设不兼容导致渲染错误 | 低 | 高 | 🔴 高 | 使用项目兼容参数范围 |
| R2 | 前端性能问题 | 中 | 中 | 🟡 中 | 懒加载 + 预加载 |
| R3 | 存储空间不足 | 低 | 低 | 🟢 低 | 定期清理旧产物 |
| R4 | 耦合效果不明显 | 中 | 中 | 🟡 中 | 增加耦合强度参数 |
| R5 | 集成测试失败 | 低 | 高 | 🔴 高 | 完善测试用例 |

### 7.2 应对计划

#### R1: 预设兼容性

```python
# 参数范围限制
PRESET_RANGES = {
    'warp': (0.005, 0.15),   # 避免过大扭曲
    'zoom': (0.85, 1.3),     # 避免过度缩放
    'rot': (-0.3, 0.3),      # 避免过度旋转
    'fDecay': (0.5, 0.95),   # 合理衰减范围
}
```

#### R4: 耦合效果

```python
# 可调的耦合强度
COUPLING_PARAMS = {
    'k_spatial': 0.3,    # 空间耦合强度
    'k_temporal': 0.4,   # 时间耦合强度
    'k_warp': 0.25,      # warp耦合强度
    'k_motion': 0.2,     # 运动耦合强度
    'k_rgb': 0.15,       # RGB耦合强度
}
```

---

## 8. 质量标准

### 8.1 数据质量

| 指标 | 标准 | 检测方法 |
|-----|------|---------|
| 文件完整性 | 100% | 文件存在性检查 |
| 参数有效性 | 100% | 范围验证 |
| 配对完整性 | 100% | FG/BG 成对检查 |
| 耦合差异 | warp_diff > 0.03 | 差异计算 |

### 8.2 代码质量

| 指标 | 标准 | 工具 |
|-----|------|------|
| 测试覆盖率 | >80% | Jest |
| 类型错误 | 0 | TypeScript |
| 代码规范 | ESLint 0 | ESLint |
| 文档完整性 | 100% | JSDoc |

### 8.3 性能标准

| 指标 | 标准 | 测试方法 |
|-----|------|---------|
| 生成速度 | >200 对/秒 | 时间测量 |
| 加载时间 | <500ms | Chrome DevTools |
| 内存占用 | <100MB | Chrome Memory |

---

## 9. 验收标准

### 9.1 功能验收

- [ ] 生成的预设可在项目中正常加载
- [ ] FG/BG 叠加产生可见的 3D 干涉效果
- [ ] 预设对可按顺序切换
- [ ] 切换过程无视觉跳变

### 9.2 性能验收

- [ ] 10,000 对预设生成完成
- [ ] 单对加载 <500ms
- [ ] 切换过渡 <600ms

### 9.3 文档验收

- [ ] 技术方案文档完整
- [ ] API 文档完整
- [ ] 部署文档完整

---

## 10. 附录

### 10.1 术语表

| 术语 | 定义 |
|-----|------|
| FG (Foreground) | 前景层，可视化主体 |
| BG (Background) | 背景层，环境氛围 |
| 耦合 (Coupling) | 两层参数之间的关联关系 |
| 干涉 (Interference) | 两层叠加产生的视觉效果 |
| 视差 (Parallax) | 空间位置差异产生的深度感 |

### 10.2 参考资料

1. [MilkDrop Preset Format](https://github.com/michaelhou09/MilkDrop-Preset-Format)
2. [projectM Documentation](https://github.com/projectM-visualizer/projectm)
3. [newliveweb ProjectMLayer.ts](/src/layers/ProjectMLayer.ts)
4. [newliveweb bootstrap.ts](/src/app/bootstrap.ts)

### 10.3 变更日志

| 版本 | 日期 | 变更内容 | 作者 |
|-----|------|---------|------|
| v1.0 | 2026-01-29 | 初始版本 | AI Team |
| v2.0 | 2026-01-29 | 完整实施计划 + Kimi 集成 | AI Team |

#### 2026-01-29 v2.0 更新

- ✅ 阶段1 完成: 数据准备 (18,853 预设)
- ⚠️ Kimi API 测试失败 (需新 Key)
- 📄 新增: `scripts/alchemy/kimi_integration.py`
- 📄 新增: `docs/3D_COUPLED_IMPLEMENTATION_PLAN.md`

---

*文档版本: v2.0*  
*最后更新: 2026-01-29 02:08*
