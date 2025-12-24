# newliveweb 重构计划（UTF-8 干净版 / 归档）

> 最新权威入口：`MASTER_SPEC.zh.md`（本文件保留为历史“干净计划”，后续只追加）。
> 本文件是 `REFRACTOR_PLAN.zh.md` 的 **UTF-8 可读版**（用于 Windows/跨编辑器协作）。
> `REFRACTOR_PLAN.zh.md` 保留为历史原文（其中包含早期乱码片段），不删除、不覆盖。

---

## P0：最小闭环（可测 + 可调 + 可同步协同）

**成功定义（可观测信号写死）**

- Diagnostics 至少包含：`AudioContext.state`、`AudioFrame.energy/rms/peak`、`__projectm_verify.framesRendered/lastAudioRms`、`renderer.getPixelRatio/outputColorSpace/toneMapping`。
- 音频分析/分发只有一个源：`AudioBus`（禁止两套平滑/增益）。
- BlendParams 语义冻结：`opacity` 永远代表 ProjectM overlay 强度；`audioDrivenOpacity = base + energy*amount`。
- Headless 验收：`projectMFramesRendered` 必须增长；输出画面 hash 必须变化。

**最小 TODO（按优先级）**

1. Diagnostics 节流与字段真实化（0.5~1s 更新策略）
2. Favorites/Random 存取统一为 `VisualStateV1`
3. BlendParams UI 可调（opacity / blendMode / audioDrivenOpacity / energyToOpacityAmount）
4. Schema 驱动随机（至少覆盖“容易反馈噪音”的参数：blendMode/opacity/energyToOpacityAmount + LM brightness/timeScale/energyScale）
5. Headless verify 输出关键摘要（frames/hash/最终输出变化）

---

## P0+：决策可观测性（AIVJ Topology Overlay｜高优先级独立图层）

目标：在演出/调参时，实时回答一句话——**“AIVJ/音频/层混合到底在驱动哪些东西？”**  
形式：一个**永远在最顶层**的独立覆盖层窗口（可拖拽、可缩放、可折叠/隐藏），显示“信号→决策→写入”的拓扑图。

### 交付物（分阶段）

**V0（先做能用的）**

- 只画“宏级/模块级拓扑”：Audio → BeatTempo → AIVJ/AudioControls → MacroBank → ProjectM/Liquid；overlayBudget → ProjectM/Camera
- 每条边显示强度（线粗/透明度）与关键数值（能量/节拍置信度/overlay mul 等）
- 数据来源只用现有 runtime 信号（与 Diagnostics 同源），不侵入参数写入逻辑

**V1（你想要的“每个参数的决策”）**

- 引入 `DecisionTrace`：对“写入参数”的路径统一打点（谁写、写了什么、为什么、权重是多少）
- 每帧聚合成 `DecisionTopologySnapshot`：
  - “全局模块层” + “选中参数的贡献列表（Top-N contributors）”
- UI 支持：点击节点/边 → 展开该模块/参数的决策解释与最近 N 帧趋势

**V2（更像视频里看到的“神经网络连线”）**

- 从“固定拓扑”升级到“动态可展开拓扑”：默认宏级，展开后自动生成“参数子图”
- 提供过滤器：只看某个 scope（ProjectM/Liquid/overlayBudget…）、只看 AI 写入、只看 delta>阈值

### 打点位置（建议）

- 宏写入：`applyMacroBankToRuntime(...)`（MacroBank → 具体 runtime params）
- 运行时混合：overlayBudget（层 multiplier/PM retreat target）
- 闭环/安全：曝光/色偏/PI controller（runtime-only 偏置）
- 人类输入：UI/Inspector/MIDI 的 patch 应用点（明确 writer=human/midi）

## P1：结构化拆分（降低 main.ts 风险）

- `renderShell`：抽离 HTML 模板与 DOM refs，避免编码破损再次发生。
- `VisualStateStore`：集中管理 apply/replace/serialize（favorites/random/restore 都走同一入口）。
- `ParamSchema + SeededRng`：随机策略可复现，收藏/回滚语义一致。
- 基础设施建设文档：`INFRASTRUCTURE_PLAN.zh.md`（宏观旋钮 + 展开全参数 + 可插拔背景 + “+”生成宏变量 + MIDI 预留）。

---

## P2：强互相影响（可开关，默认关闭）

- 低频统计反馈：ProjectM 输出低频采样（avgLuma/avgColor）→ 调制背景 tint/contrast（可关）。
- Compositor v1：RT 池化 + 固定分辨率，统一 blend/色彩空间处理。

---

## 进度记录（只追加）

### 2025-12-15

- AudioBus v1、DiagnosticsPanel、SceneManager color 管理、ProjectM BlendParams 已落地。

### 2025-12-16

- Favorites/Random 统一为 `VisualStateV1`（含 presetId/presetUrl + BlendParams + LiquidMetal）。
- BlendParams UI 接线：`pm-opacity/pm-blend-mode/pm-audio-opacity/pm-energy-opacity` 可调。
- Diagnostics 500ms 节流；headless verify 输出摘要（framesRendered / outputChanged）。
- ParamSchema v0：BlendParams schema + LiquidMetal schema；Random 已改为 schema 驱动，并引入 `SeededRng` + `global.seed`（可复现随机的基础已就位）。
- 验收：`npm run verify:dev` 通过（Summary: framesRendered=28, finalOutputChanged=true, projectMCanvasChanged=true）。

---

## 当前“真实可控”的参数清单（以代码为准）

### 背景图层：LiquidMetalLayerV2

这些参数**已存在且可调**（见 [src/layers/LiquidMetalLayerV2.ts](src/layers/LiquidMetalLayerV2.ts) 的 `LiquidMetalParams` 与 uniforms 映射）：

- 动画：`timeScale`、`iterations`、`waveAmplitude`
- 交互：`mouseInfluence`
- 金属质感：`metallicAmount`、`metallicSpeed`
- 亮度：`brightness`
- 音频响应：`audioReactive`、`audioSensitivity`

实时音频输入（非 UI 参数，但参与效果）：

- `AudioFrame.bands.low/mid/high`（映射到 `uAudioBass/uAudioMid/uAudioHigh`）
- `AudioFrame.energy`（目前已在层内保存，可用于亮度/闪烁等进一步调制）

### ProjectM：跨所有 preset 一致的“可调项”

这些参数**已存在且可控**（见 [src/layers/ProjectMLayer.ts](src/layers/ProjectMLayer.ts)）：

- 预设选择：`presetId` / `presetUrl`（切换具体 preset）
- Overlay 融合参数（跨所有 preset 一致）：
  - `opacity`
  - `blendMode`（`normal/add/screen/multiply`）
  - `audioDrivenOpacity`
  - `energyToOpacityAmount`

渲染一致性/观感相关（全局而非单 preset）：

- `renderer.outputColorSpace`
- `renderer.toneMapping`
- `renderer.getPixelRatio()`

### ProjectM：理论上“每个 preset 内部可调”的项（当前未做成入口）

这类参数主要写在 `.milk` 的 per-frame / per-pixel 方程里，想做成“可调”通常需要：解析 → 参数化 → 运行时注入（或改走你自己的 Compositor/调色后处理统一做）。

典型类别：

- 几何/运动：`zoom/rot/cx/cy/dx/dy`、warp/motion vectors（不同 preset 写法差异很大）
- 颜色/后处理：`gamma/contrast/saturation`、`decay/echo`、wave 颜色/alpha/模式
- 纹理/采样：网格强度、模糊/辉光类（取决于 preset 公式）

---

## 融合 + 随机：推荐的数学“组合拳”（写入后续计划，默认先不做）

### 1) 统一“潜变量/风格向量”驱动两层（更稳的随机语义）

定义全局 `style ∈ [0,1]^k`（例如 `turbulence/metal/glow/darkness/space`），由音频特征 + seed 生成目标值并做平滑：

- `styleTarget = g(audioFeatures, seed)`
- `style = smooth(style, styleTarget)`（EMA 或二阶弹簧）

再映射到两层参数：

- `liquidParams = fL(style)`
- `blendParams = fP(style)`

好处：随机不是“瞎抖”，落在可解释空间；收藏/回滚语义稳定；并且天然兼容 `VisualState + ParamSchema + SeededRng`。

### 2) 带反馈的融合控制（把“看不见 PM / 过曝 / 色偏”变成可控系统）

从 ProjectM 输出采样低频统计（建议先做 `avgLuma`，再做 `avgColor`）：

- 目标亮度 `L*`（例如 0.35）
- 误差 `e = L* - avgLuma`
- 用 PI/PID 或“限速积分器”调节：
  - `pm.opacity += kP*e + kI*∫e`（保证 PM 永远可见但不过曝）
  - `liquid.brightness += kP2*e`（背景不吞噬前景）

这就是“图层互相影响”的核心：闭环控制，而不是纯主观调参。

### 3) 随机的覆盖率 + 稳定性策略（避免重复、避免抽风）

- 采样：对 schema 做 Sobol/Halton/拉丁超立方（比纯 RNG 覆盖更均匀）
- 时间策略：cooldown（例如 6–12s 不换 preset）、分段平滑（ease in/out）、只在“段落边界”触发随机
- 约束：对每个参数加最大变化率（例如限制 $|dp/dt| < v_{max}$），避免视觉抖动

---

## 下一阶段“最关键缺口”（让融合/随机真正产品化）

按性价比建议顺序：

1. LiquidMetal 增加可控 `tint/hue/paletteStrength/contrast`（否则只能靠 `brightness`，融合很单薄）
2. ProjectM 输出采样（`avgLuma/avgColor`）+ 控制器（PID/限速积分）：闭环“可见性/色偏”治理
3. 继续坚持：`VisualState + ParamSchema + SeededRng` 是唯一随机/收藏语义来源（避免两套逻辑打架）
