# 附录：D:\aidata 炼丹产物总结

> 生成时间: 2026-01-29
> 来源: AI Agent 整理

---

## 项目定位

**newliveweb** 是一个面向 **OBS/直播间、DJ/VJ、线下大屏** 的前端可视化引擎，核心功能是：
- **LiquidMetal 背景层** + **ProjectM (MilkDrop)** 图层叠加
- 统一音频总线驱动两层联动
- 支持 **13万+ MilkDrop 预设**
- **AIVJ (AI VJ)** 自动视觉编排系统

---

## 技术栈

- **Vite + TypeScript**
- **Three.js** (Layer 管线 + ShaderMaterial)
- **Web Audio API** (AudioBus + StreamAudioProcessor)
- **ProjectM WASM** (音乐可视化核心)

---

## 炼丹产物全景

| 目录 | 数量 | 质量等级 | 说明 |
|------|------|----------|------|
| `ai_generated/` | 6,800+ | 低 | 17行基础参数，快速生成 |
| `ai_generated_quality/` | 1,000 | 中 | 77行完整模板 |
| `ai_generated_premium/` | 10,000 | **高** | 200行+完整参数 |
| `ai_generated_v2/` | 5,000 | **高** | 优化参数范围 |
| `ai_generated_coupled_final/` | **3,000 对** | **最高** | 3D耦合预设 (FG+BG) |
| `curated_v5_dark/` | 853 | 最高 | fRating=5.0 暗黑精选 |
| `curated_v5_relaxed/` | 353 | 最高 | fRating=5.0 放松精选 |
| `analysis/` | - | - | 分析和配置文件 |

**总计预设：约 28,000+**

---

## 3D耦合预设系统（当前项目）

**产物位置**: `D:\aidata\ai_generated_coupled_final\`

**结构**:
```
ai_generated_coupled_final/
├── fg/                    # 前景预设 (3000个)
├── bg/                    # 背景预设 (3000个)
├── manifest.jsonl         # 配对清单
└── stats.json             # 统计数据
```

**关键指标**:
- 总对数: **3,000 对**
- 平均 warp 差异: **0.040** (目标 >0.03)
- 平均 cx 差异: **0.057** (目标 >0.04)
- 生成耗时: **15.5 秒**

**配对格式** (manifest.jsonl):
```json
{"pair": 0, "fg": "...", "bg": "...", "warp_diff": 0.015, "cx_diff": 0.106}
```

---

## 耦合算法配置

```json
{
  "k_spatial": 0.3,     // 空间耦合强度 (cx/cy 视差)
  "k_temporal": 0.4,    // 时间耦合强度 (rot/zoom 呼吸)
  "k_warp": 0.25,       // warp耦合强度 (扭曲干涉)
  "k_motion": 0.2,      // 运动耦合强度 (mv_dx/mv_dy)
  "k_rgb": 0.15,        // RGB耦合强度 (色散深度)
  "phase_spatial": 0.5,
  "phase_temporal": 0.7,
  "phase_warp": 0.3,
  "noise_scale": 0.02
}
```

---

## 炼丹流程

```
阶段1 (phase1-baseline-supplement-v*) → 基线生成
    ↓
阶段2 (long7d-techno-baseline/fusion-v*) → 7天长时间生成
    ↓
阶段3 (phase3-slow-curated-v*) → 慢速精选
    ↓
Lora优化 (lora-techno-parallel/rerun-v*) → 参数微调
    ↓
验证 (validate-techno-*-10h-v*) → 10小时验证渲染
    ↓
最终耦合产物 (ai_generated_coupled_final/) → FG/BG 3D耦合
```

---

## 预设文件格式 (.milk)

```
MILKDROP_PRESET_VERSION=201
PSVERSION=2
[preset00]
fRating=5.000
fGammaAdj=1.686
fDecay=0.740
zoom=0.89512
rot=-0.04033
cx=0.473
cy=0.476
warp=0.07792
...
```

---

## 与 newliveweb 集成状态

- ✅ 已生成 3,000 对耦合预设
- ✅ manifest.jsonl 格式就绪
- ⏳ 等待前端集成（阶段4）

**下一步**:
1. 将 `ai_generated_coupled_final/` 复制到 newliveweb 的 public 目录
2. 实现 `CoupledPresetLoader` 加载器
3. 实现动态切换逻辑
4. 根据耦合指标自动调整混合模式

---

## 关键文件位置

| 文件 | 路径 |
|------|------|
| 实施计划 | `newliveweb/docs/3D_COUPLED_IMPLEMENTATION_PLAN.md` |
| 技术方案 | `newliveweb/docs/3D_COUPLED_ALCHEMY_PLAN.md` |
| 阶段1报告 | `newliveweb/docs/PHASE1_COMPLETE.md` |
| 耦合预设 | `D:/aidata/ai_generated_coupled_final/` |
| 源预设库 | `D:/aidata/ai_generated_premium/` (10,000) |
| 精选预设 | `D:/aidata/curated_v5_dark/` (853) |

---

*此文件为独立附录，可追加到主计划文档末尾*
