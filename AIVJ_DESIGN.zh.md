# AIVJ（AI VJ）设计稿（基于现有 newliveweb 结构）

> 范围声明：本文件仅做“设计/文档/验收口径”，不改任何业务代码。
>
> 目标：在不破坏现有架构的前提下，把当前已经存在的“自动 VJ”能力（Techno Auto + Audio Controls + 宏映射）收敛为一个明确的 **AIVJ 方案**，并补齐：
>
> - 自动启动策略（无外部 MIDI 时）
> - MIDI 与 AI 的互斥/仲裁（避免抢旋钮）
> - 8 个宏旋钮的自动映射策略（尽量不需要用户手动增删映射参数）
> - 持续保持 **fade 平滑**（projectm + 图层融合）

---

## 1. 现状盘点：AIVJ 是否已“实装”？UI 是否体现？

### 1.1 代码层面结论（以事实为准）

- 代码中没有发现显式命名为 `aivj` / `AIVJ` 的模块或入口（全仓库搜索无匹配）。
- 但“自动 VJ”能力事实上已存在，主要由以下三段组成：
  1. **Techno Auto（按小节量化触发）**：在音频回调中，按 `barBoundary` 触发宏目标与预设切换。
     - 实现位置：[src/app/bootstrap.ts](src/app/bootstrap.ts#L2988-L3076)
  2. **宏过渡（fade 平滑）**：`startMacroTransition()` + `applyMacroTransition()` 用 `smoothstep01()` 进行 2–8 秒的平滑形变。
     - 实现位置：[src/app/bootstrap.ts](src/app/bootstrap.ts#L2342-L2445)
  3. **宏映射（宏 → ProjectM/各图层参数）**：`computeMacroPatch()` 把 `macros + macroSlots` 映射到 projectm blend、LiquidMetal、Basic、Camera、Video 的参数范围内。
     - 实现位置：[src/app/bootstrap.ts](src/app/bootstrap.ts#L1547-L1606) + [src/features/macros/computeMacroPatch.ts](src/features/macros/computeMacroPatch.ts)

### 1.2 UI 层面结论（可见且可操作）

- UI 已经有“自动 VJ”的入口：
  - `Techno Auto`（开关）：[src/app/renderShell.ts](src/app/renderShell.ts#L309-L324)
  - `Techno Style`（风格选择，包含 `Video VJ`）：[src/app/renderShell.ts](src/app/renderShell.ts#L325-L348)
  - `AudioCtl`（音频控制层）：[src/app/renderShell.ts](src/app/renderShell.ts#L350-L358)
  - `Beat/Tempo`（Essentia worker）：[src/app/renderShell.ts](src/app/renderShell.ts#L360-L370)
- UI 已经能体现“宏旋钮跟随变化”：
  - 3 个宏旋钮（fusion/motion/sparkle）：[src/app/renderShell.ts](src/app/renderShell.ts#L392-L458)
  - 宏槽位（Macro Slots）可动态添加：`+ Slot` + `#macro-slots` 容器。

**因此：**“AIVJ（作为功能）已部分实装且在 UI 可见”，只是尚未统一命名与统一仲裁规则。

---

## 2. 现有可输出/可用数据结构（AIVJ 可用输入）

AIVJ 的设计应以“现有 already-wired 数据结构”为边界：

### 2.1 音频帧（核心输入）

- `AudioFrame`（每帧回调）：在 `audioBus.onFrame(frame)` 中流过。
  - 可用字段（根据现状用法）：
    - `frame.energy` / `frame.energyRaw`
    - `frame.rms` / `frame.peak`
    - `frame.bands.low/mid/high` 与 `bandsRaw` / `bandsStage`
    - `frame.features.flux`、`beatPulse`、`tempoBpm`、`beatPhase`、`beatConfidence`
  - 写入到 UI 的实时指标与 CSS variables：
    - [src/app/bootstrap.ts](src/app/bootstrap.ts#L2710-L2792)

### 2.2 Beat/Tempo 分析快照

- `beatTempoAnalyzer.getSnapshot()` 与 `getConfig()`
- 在音频帧路径中，将 beat 信息合并回 `frame.features.*`：
  - [src/app/bootstrap.ts](src/app/bootstrap.ts#L2988-L3014)

### 2.3 可控输出：VisualStateV2（宏与图层融合）

- 宏与宏槽：
  - `lastVisualState.global.macros`：fusion/motion/sparkle
  - `lastVisualState.global.macroSlots`：数组（可扩展），每个 slot 有 `id/label/value/randomize` 等
- AIVJ 最重要的“最低阶输出”就是：
  - 更新 `global.macros` 与 `global.macroSlots`（再由宏映射生成对各图层的 patch）

### 2.4 宏映射结构（宏 → 各图层的参数 patch）

- 计算函数：`computeMacroPatch({macros, slots}, base, ranges)`
- 映射行为（关键事实）：
  - 融合：projectm opacity / energyToOpacityAmount
  - LiquidMetal：opacity/brightness/contrast/timeScale/waveAmplitude/metallicAmount/metallicSpeed
  - Basic：opacity/speed
  - Camera：opacity
  - Video：opacity/playbackRate
- 详见：[src/features/macros/computeMacroPatch.ts](src/features/macros/computeMacroPatch.ts)

---

## 3. 现有“自动 VJ”算法的行为描述（作为 AIVJ v0）

把现状明确成 v0，有利于 vNext 在不破坏体验的前提下迭代。

### 3.1 Techno Auto（bar 量化）

- `updateTechnoBeatClock()`
  - 优先用 BeatTempo 分析（置信度阈值）
  - 否则用 `flux` 峰值做 fallback beat
- 当 `technoAuto.enabled` 且到 `barBoundary`：
  - 每 8 小节切换一次 preset（Techno phrasing）
  - 若当前无宏过渡，则启动新的宏过渡（2–8 秒）

参考实现：[src/app/bootstrap.ts](src/app/bootstrap.ts#L2446-L3076)

### 3.2 宏过渡（fade 平滑）

- `macroTransition` 保存 from/to + duration
- `applyMacroTransition()` 每 ~33ms 应用一次：
  - `smoothstep01(t)` 生成 easing
  - `lerp()` 插值得到 next.fusion/motion/sparkle
  - 写回 `global.macros`，并刷新 UI，随后 `applyMacroMapping()` 驱动 projectm/layers

参考实现：[src/app/bootstrap.ts](src/app/bootstrap.ts#L2368-L2445)

### 3.3 Audio Controls（连续驱动宏）

- `Techno Style`（ambient/peakRave/dub/drone/videoVj/custom）会写入一组权重：
  - `wFusionEnergy/wFusionBass/wFusionFlux/wFusionBeat` 等
  - attack/release/maxDeltaPerSec
  - 每个图层 amount：amountProjectM/amountLiquid/amountBasic/amountCamera/amountVideo
  - 对 beatTempoAnalyzer 的开关/窗口也会一并配置（例如 `videoVj` 开启 beatTempo 与 technoAuto）

参考实现：[src/app/bootstrap.ts](src/app/bootstrap.ts#L735-L940)

---

## 4. AIVJ vNext：在现有结构上继续优化的方向

> 关键原则：**不引入新的“深层控制面”**，优先利用现有 `macros + macroSlots + computeMacroPatch`。

### 4.1 目标：从“随机目标 + 平滑”升级为“可解释的编排”

现状 `randomMacroTarget()` 基于 `energy01` 调整 spread，属于“随机但稳定”。vNext 建议加入一个轻量状态机：

- 状态（示例）：`idle` / `build` / `peak` / `break` / `transition`
- 状态切换触发：
  - beat/bar 边界
  - energy/flux 的趋势（上升/下降）
  - `beatConfidence` 稳定性

输出仍然只写：

- `targetMacros: { fusion, motion, sparkle }`
- `targetSlots: number[]`（可选）
  并仍然走 `startMacroTransition()` 的平滑通道。

### 4.2 目标生成策略（伪代码）

```text
inputs:
  energy01, bass01, mid01, treble01
  flux01, beatPulse01
  bpm, beatOk, barBoundary
  currentMacros, currentSlots

state:
  aivjMode (enabled)
  phraseCounter (barCount mod 8/16)
  sectionState (build/peak/break)

on barBoundary:
  sectionState <- updateState(sectionState, energyTrend, fluxTrend, phraseCounter)
  targetMacros <- generateMacros(sectionState, energy01, flux01, beatPulse01)
  targetSlots  <- generateSlots(sectionState, bands, rngSeed=barCount)
  startMacroTransition(to=targetMacros, durationMs = pick(2000..8000))

always:
  applyMacroTransition(nowMs)  // existing
  applyMacroMapping()          // existing

```

### 4.3 约束与护栏

- 约束 1：**稳定优先**。所有输出必须 clamp 到 [0,1] 再映射到 ranges。
- 约束 2：**避免频繁反转**。对目标生成加入“惯性”：
  - 若上一个 sectionState 是 `break`，至少维持 N 个 bar 才允许切回 `peak`。
- 约束 3：**避免过度闪烁**。
  - sparkle 建议更多挂钩于 `flux/treble/beatPulse`，并限制瞬态上升速度（maxDeltaPerSec）。

### 4.4 Techno 取向的 AIVJ/AIDJ 详细规格（文档即实现标准）

本节把“Techno Auto + AudioCtl + 宏过渡/宏映射”重新写成更可解释、更可复现的编排算法。

参考事实来源：

- Techno Auto 的实现与口径总结：[docs/reference/UPDATE_REPORT_2025-12-17.zh.md](docs/reference/UPDATE_REPORT_2025-12-17.zh.md)
- 宏/宏槽 → 图层参数耦合（slots 的真实影响很重要）：[src/features/macros/computeMacroPatch.ts](src/features/macros/computeMacroPatch.ts)

#### 4.4.1 输入信号（统一归一化与抗噪）

定义（全部 clamp 到 $[0,1]$，NaN 用 0.5 回退）：

- $E$：`energy01`（来自 `frame.energy`）
- $B$：`bass01`（来自 `frame.bands.low`）
- $M$：`mid01`（来自 `frame.bands.mid`）
- $T$：`treble01`（来自 `frame.bands.high`）
- $F$：`flux01`（来自 `frame.features.flux`）
- $P$：`beatPulse01`（来自 `frame.features.beatPulse`，若无则 0）

趋势（建议用 EMA 或已有 AudioCtl 的 attack/release 口径做同等效果；实现细节以代码为准）：

- $\Delta E$：能量上升趋势（用于 build/peak 判断）
- $\Delta F$：变化量趋势（用于 break/transition 判断）

#### 4.4.2 Beat/Bar 时钟（Techno 的“量化骨架”）

目标：稳定地产生 `barBoundary`（每小节边界）与 `phraseCounter`（8 小节分段）。

- 优先使用 BeatTempo 分析：当 `beatConfidence` 足够稳定时，使用其 `beatPhase`、`tempoBpm`。
- fallback：当 beat 不可靠时，使用 $F$（flux）峰值近似 beat（这是现有 Techno Auto 的核心 fallback 思路）。

约束：

- 量化应偏向“少触发、不错触发”：宁可延后 1–2 beat，也不要在 1 bar 内多次误触发。
- 若 `tempoBpm` 无效，维持上一帧的 bpm（直到恢复），避免 bar 时钟抖动。

#### 4.4.3 8-bar 句法（Techno 编排状态机）

定义：一个 phrase = 8 bars（与现状一致）。`phraseBar = (barCount % 8) + 1`。

状态：

- `build`：逐步上升（控制更“收”、对比更强、融合更厚）
- `peak`：高能量（融合更满、闪烁更强、运动更快）
- `break`：空间释放（融合下降、motion 下降或反向、对比拉开）
- `transition`：预设切换窗口（仍保持平滑，不要跳变）

默认句法（可解释且容易验收）：

- bar 1–2：`build`
- bar 3–4：`peak`
- bar 5：`break`
- bar 6：`build`
- bar 7：`peak`
- bar 8：`transition`（触发 preset change + 新一轮宏过渡）

自适应（只做轻量修正，避免复杂化）：

- 若 $E$ 长期偏低（例如持续 < 0.35）：`peak` 降级为 `build`（避免“空场还疯狂闪”）
- 若 $\Delta E$ 持续上升且 $B$ 较强：允许提早进入 `peak`
- 若 $F$ 激增但 $E$ 不高：倾向 `break`（更像“切、抽、空”的 techno 过门）

#### 4.4.4 目标宏生成（只输出 macros + 5 slots）

所有目标均为 $[0,1]$，且必须通过现有 `startMacroTransition()` 进入平滑通道。

1. Beat accent（用于 techno 的“踢点感”，不要求新增渲染层）：

- 若 beat 可信：设 `beatPhase` 为 $[0,1)$，0 表示 beat 开始。
- 生成一个“只在 beat 附近为正”的脉冲（宽度 $w$ 建议在 0.06–0.12 区间，具体可调）：

$$
accent = \max\left(0, 1 - \frac{|beatPhase - 0|}{w}\right)
$$

若 beat 不可信：`accent = 0`。

2. 状态系数（建议取值，便于调参时直觉一致）：

- `kBuild`：build 时为 1，否则 0
- `kPeak`：peak 时为 1，否则 0
- `kBreak`：break 时为 1，否则 0
- `kTrans`：transition 时为 1，否则 0

3. 目标宏（示例为“techno 默认曲线”，实现时可被 profile 覆盖，但不要随意换语义）：

- `fusionTarget`：主融合厚度（peak 更满、break 更空）

$$
fusionTarget = clamp01(0.18 + 0.55E + 0.22B + 0.12kPeak - 0.18kBreak)
$$

- `motionTarget`：运动速度/扭动（对 flux 敏感，beat 附近略增）

$$
motionTarget = clamp01(0.12 + 0.40F + 0.20M + 0.15accent + 0.10kPeak - 0.10kBreak)
$$

- `sparkleTarget`：金属/对比/高频闪烁（对 treble/beatPulse 敏感，peak 增强，break 抑制）

$$
sparkleTarget = clamp01(0.08 + 0.40T + 0.22P + 0.18accent + 0.12kPeak - 0.14kBreak)
$$

4. 目标 slots（与 `computeMacroPatch` 的真实耦合对齐）

注意：代码里 slots 是“偏移通道”（以 0.5 为中心的 dev），并会影响多处映射；因此 slot 语义应尽量稳定。

建议定义 5 个 slot 的默认语义（“概念 Slot1..Slot5”对应的是 **macroSlots 数组的前 5 个**；真实绑定 target 使用 `slotId`）：

| 概念槽位    | 在映射中的主要影响（以实现为准）                         | Techno 语义（建议）     |
| ----------- | -------------------------------------------------------- | ----------------------- |
| Slot1（s0） | projectm opacity、energyToOpacityAmount；也会轻推 fusion | Kick/主强度（更“顶”）   |
| Slot2（s1） | liquid opacity/brightness                                | 场景亮度/烟雾厚度       |
| Slot3（s2） | metallicAmount/speed、contrast；也会轻推 sparkle         | Hat/金属闪、边缘对比    |
| Slot4（s3） | liquid timeScale/waveAmplitude、basic speed              | Groove/运动速度         |
| Slot5（s4） | basic/camera/video opacity、video playbackRate           | 镜头/视频的存在感与速率 |

建议目标（示例）：

- `slot1 = clamp01(0.50 + 0.30B + 0.20E + 0.10kPeak - 0.15kBreak)`
- `slot2 = clamp01(0.50 + 0.25E - 0.15kBreak + 0.10kBuild)`
- `slot3 = clamp01(0.50 + 0.25T + 0.20accent + 0.15kPeak - 0.10kBreak)`
- `slot4 = clamp01(0.50 + 0.25F + 0.10M + 0.10kPeak - 0.10kBreak)`
- `slot5 = clamp01(0.50 + 0.20E + 0.10F + 0.10kTrans)`

（解释：slots 以 0.5 为“中性”，大多数情况下在 0.35–0.65 内微调更稳定；除非 peak 时短时间拉到更极端。）

#### 4.4.5 触发与持续时间（避免“每 bar 都像抽搐”）

- `barBoundary`：只在 bar 边界更新目标（触发 `startMacroTransition`）。
- 过渡时长：建议遵循现状 2–8s 的区间。
  - build：较长（例如 5–8s）
  - peak：中等（例如 3–5s）
  - break：较短（例如 2–4s）
  - transition：中等（例如 3–6s），确保切预设时视觉仍连续

#### 4.4.6 边界条件（Techno 现场常见坑）

- beat 不稳定：不输出 `accent`，并降低 sparkle 的 beat 依赖（避免乱闪）。
- 输入音量很低/空场：限制 `sparkleTarget` 上限（例如不超过 0.55）以避免“黑场高闪”。
- flux 假峰（例如噪声/麦克风摩擦）：对 $F$ 做限速或最小间隔（至少 N ms 才能再次触发 fallback beat）。

---

## 5. “无 MIDI 自动启动”方案（仅设计口径）

需求：如果没有外部 MIDI 设备，AIVJ 自动启动且宏旋钮跟随 AI 决策自动转动。

### 5.1 建议的“自动启动”判定

- 若没有 MIDI 支持或未连接：
  - 默认启用 `AudioCtl`（音频控制层）
  - 选择默认 `Techno Style = videoVj`（或由 URL/query 决定）
  - `Techno Auto` 可默认开（因为它会量化触发宏过渡与 preset 变化）

### 5.2 UI 体现（不新增页面）

- 最小：复用 `#techno-profile-summary` 的状态行展示：
  - `AIVJ:on`（等价于 technoAuto/audioCtl 的组合）
  - `MIDI:off`（或 `MIDI:connected`）

---

## 6. “有 MIDI 不抢旋钮”方案（仲裁设计）

你提出的规则很合理：

- 有 MIDI 并且映射好了之后，自动识别，AI 就不动这 8 个宏旋钮。
- 但 AI 仍然保持 fade 平滑处理 projectm 特效与图层融合。

### 6.1 术语：什么是“8 个宏旋钮”？

现状 UI：

- 固定 3 个 macro（fusion/motion/sparkle）
- 可扩展 N 个 macro slots（用户可加）

因此“8 个宏旋钮”建议定义为：

- `macro:fusion`、`macro:motion`、`macro:sparkle`（3 个）
- `slot:<macroSlots[0..4].id>`（5 个：宏槽数组前 5 个，真实 target 是 slotId）
  合计 8 个连续可控目标。

### 6.2 仲裁原则（建议）

- 原则 A：**绑定存在即锁定**

  - 若 Settings 中存在同一 MIDI 设备对上述 8 targets 的 bindings（或至少存在其中任意一个），则这些 targets 视为 **MIDI-owned**。
  - AI 不再写 `global.macros`/对应 `macroSlots`。

- 原则 B：**最近活动优先（防抖）**

  - 即使未完成全套绑定，只要检测到最近 X 秒内有 MIDI CC 事件落在 macro/slot targets 上，AI 对这些 targets 进入短期 lockout。

- 原则 C：**AI 仍可输出“非抢旋钮”的融合**
  - 当前架构中，宏映射最终驱动 projectm 与各 layer 参数。
  - 当宏/slot 被 MIDI-owned 时，AI 可继续：
    - 做 preset 编排（可选，取决于演出习惯）
    - 调整非宏路径的融合（例如 audioControls 的 layer amounts、或其它不与那 8 个 target 复用的参数）
  - 但必须保持“fade 平滑”的语义（继续使用现有 smoothstep/attack-release）。

#### 6.2.1 2025-12-17 实装口径（与代码一致）

- 仲裁粒度采用 **macro bank 全套锁定**：当 8 个 targets（fusion/motion/sparkle + aivj-m4..m8）都已存在 MIDI binding 时进入 `MIDI lock`。
- `MIDI lock` 时 AIVJ 不再回写 `global.macros/macroSlots`（因此 UI 宏旋钮不会被 AI 推走），改为只对 runtime 应用宏映射后的 patch（ProjectM blend + Background layer params），并与用户/MIDI 当前值做混合避免打架。
- 目前未实现“最近活动优先（防抖）”的短期 lockout（如需再加，应作为单独增强项，并给出可观测验收信号）。

### 6.3 验收信号（设计）

- 连接 MIDI 并有 bindings 后：
  - UI 宏旋钮不会被 AI 自动推走
  - 手动旋钮输入（MIDI）能稳定控制
  - AI 仍可在背景融合/预设切换层面产生平滑变化（例如 projectm blend 或 layer opacity 平滑变化）

---

## 7. “宏旋钮自动映射”方案（不让你手动增删映射参数）

现状 MIDI 绑定依赖：Target 下拉 + Learn。vNext 设计目标：**尽量一次 Learn 就完成 8 knob 的映射**。

### 7.0 2025-12-17 实装：Connect 后 AutoMap（推荐的最小可用路径）

- 触发：当 `SettingsV1.midi.bindings.length===0` 时，用户点击 `MIDI/Connect` 成功后进入 AutoMap。
- 行为：系统按顺序捕获“前 8 个唯一 CC 事件”（deviceId+channel+cc 去重），依次绑定到：
  - `macro:fusion`、`macro:motion`、`macro:sparkle`
  - `slot:aivj-m4..aivj-m8`
- 目标：完全不要求用户逐个选择 target / 增删映射参数；用户只需要“连接一次 + 动 8 个旋钮/推子”。

### 7.1 方案 A：一次 Learn 推断 8 个 CC（推荐，通用）

- 用户只做一步：
  - 在 UI 里选择 `macro:fusion`，点击 `Learn`，转动硬件第 1 个旋钮。
- 系统记录到 `cc0` 后自动生成：
  - `macro:fusion` ← cc0
  - `macro:motion` ← cc0+1
  - `macro:sparkle` ← cc0+2
  - `slot:<macroSlots[0..4].id>` ← cc0+3..cc0+7（若不足 5 个 slot 先准备/补齐）

优势：不需要知道具体设备型号，也不需要用户手动加减参数。

### 7.2 方案 B：设备模板（可选）

- 对常见控制器（LaunchControl / NanoKontrol 等）可提供 cc 列表模板。
- 但此方案需要维护“设备型号 → 默认 cc”，优先级低于方案 A。

### 7.3 Slot 自动准备

- 若当前没有足够 slot：
  - 自动补齐到 5 个 slot
  - 默认 label：`Macro 1..5`（或设备名 + index）
  - 默认 `randomize=false`（因为这些将被 MIDI-owned）
  - 建议 slot.id 采用稳定规则（例如 `midi-slot-1..5` 或 `aivj-slot-1..5`），避免 bindings 因 slotId 变化而失效

---

## 8. 与现有文档/命令的对齐（你要求的“所有命令/验收”）

### 8.1 关键命令

- 类型检查：`npm run lint`
- 端到端可视回归：`npm run verify:dev`
- Essentia 同步：`npm run sync:essentia`

### 8.2 建议的 AIVJ 验收（未来实现时）

- Case 1：无 MIDI
  - 打开页面后 AIVJ 默认启用（Techno Auto + AudioCtl + videoVj profile）
  - 宏旋钮持续平滑变化（可观察 knob 位置与 percent 文案）
- Case 2：有 MIDI + 已映射
  - 映射完成后，AI 不再更新 8 targets
  - 旋钮由 MIDI 控制，不抖动、不被回拉
  - AI 仍可在 projectm/layers 的非抢旋钮路径继续输出 fade
  - 可观测信号：`#techno-profile-summary` 状态行会显示 `MacroBank:MIDI lock`（或中文 `宏控:MIDI锁`）
  - Debug 信号：toolbar data-attributes 会同步 `data-aivj-enabled` 与 `data-aivj-macro-bank`（`ai|midi`）：[src/app/bootstrap.ts](src/app/bootstrap.ts#L775-L856)

---

### 8.3 建议的 Techno 专项验收（按可解释编排验证）

- 句法一致性（8-bar）
  - 观察 2–3 个 phrase：bar 8 会进入 `transition`（触发 preset change + 新宏过渡），且整个过程无跳变。
- beat 不可靠的退化路径
  - 暂时关闭 BeatTempo 或让输入信号变得不稳定时：系统应退化为 flux-based（少触发），并且不会在 1 bar 内多次误触发。
- profile 差异可见
  - `ambient/dub/drone`：变化应更慢、更少闪；`peakRave/videoVj`：更强的动与闪、过渡更短。

---

## 9. 待办（对齐 newliveweb/TODOS.zh.md）

本文件只定义方案与验收口径；具体可执行 TODO 已在 [TODOS.zh.md](TODOS.zh.md) 维护。

---

## 10. 2025-12-17 实装对齐（以代码为准：AIVJ macro bank / AutoMap / MIDI lock）

> 勘误：本文件顶部曾声明不改业务代码。截至 2025-12-17，AIVJ 的 macro bank 与 MIDI 仲裁已在代码中落地；本节用于把真实实现同步回文档。

### 10.1 8-knob macro bank 的真实定义

- 3 个宏：`macro:fusion/motion/sparkle`
- 5 个 slots：固定 ID（稳定，便于 bindings 持久化）：`aivj-m4..aivj-m8`
  - 代码入口：[AIVJ_MACRO_BANK](src/app/bootstrap.ts#L92)
  - 启动时会确保这些 slots 存在且位于 `macroSlots` 的前 5 个：[ensureAivjMacroBankSlots](src/app/bootstrap.ts#L1160)

### 10.2 AIVJ 过渡与抢旋钮规避的真实行为

- AIVJ 过渡（独立于旧 `macroTransition`，但复用同样的 smoothstep 插值语义）：

  - [startAivjTransition](src/app/bootstrap.ts#L2557)
  - [applyAivjTransition](src/app/bootstrap.ts#L2632)

- MIDI lock（宏 bank 粒度）：
  - 当 8-knob bank 的所有 targets 都已有 MIDI bindings 时，进入 `MIDI lock`：AIVJ 不再回写 `global.macros/macroSlots`。
  - 在 lock 下，AIVJ 改为把 AI 的 bank 与用户 bank 做 runtime 混合，避免 UI/状态被回拉。

### 10.3 AutoMap（一次 Learn 推断 8 个旋钮）的真实落点

- AIVJ AutoMap 已在 `bootstrap.ts` 的 MIDI 控制器初始化中具备状态位与入口：
  - 相关配置块：`autoMap`（见 [src/app/bootstrap.ts](src/app/bootstrap.ts#L2809) 附近）。

---

## 11. Techno Profiles：把 `Techno Style` 的意图映射到 AIVJ（文档口径）

> profile 的参数意图与开关策略，详见 [docs/reference/UPDATE_REPORT_2025-12-17.zh.md](docs/reference/UPDATE_REPORT_2025-12-17.zh.md) 的 4.5/4.7。

### 11.1 Profile -> 时钟/开关（Techno Auto / BeatTempo）

- `ambient`：默认关闭 Techno Auto & BeatTempo（更平滑、少量化）
- `peakRave`：默认开启 Techno Auto + BeatTempo（强拍、强组织）
- `dub`：默认关闭 Techno Auto & BeatTempo（更鼓励手动推进）
- `drone`：默认关闭 Techno Auto & BeatTempo（极慢，几乎无突变）
- `videoVj`：默认开启 Techno Auto + BeatTempo（强调 cut/闪/视频速率）
- `custom`：不覆盖用户手动调参（只切换标记）

### 11.2 Profile -> AIVJ 输出风格（最小差异化建议）

- `ambient`：弱 `accent`，限制 `sparkle` 上限，过渡更长，slots 更接近 0.5
- `peakRave`：强 `accent`，允许更高 `sparkle`（仍需限速），过渡更短，Slot3/Slot4 可更激进
- `dub`：更偏 `bass/energy` 驱动 fusion，sparkle 更低，Slot2/Slot4 为主，Slot5 更保守
- `drone`：忽略 beat，完全以长趋势驱动，过渡极长，slots 变化幅度极小
- `videoVj`：强依赖 `flux + accent`，Slot5（video opacity/playbackRate）变化更明显

---

## 12. 继续执行（执行清单 / 不遗漏验收）

- 文档同步

  - 若后续再改实现：先在 [MASTER_SPEC.zh.md](MASTER_SPEC.zh.md) 追加变更记录，再同步本文件与 [DATA_INTERFACES.zh.md](DATA_INTERFACES.zh.md)。

- 本地验收命令

  - `npm run lint`
  - `npm run verify:dev`

- 手动场景验收（建议顺序）
  - 无 MIDI：打开页面后开启 `Techno Auto` + profile（如 `videoVj`），观察 AIVJ macro bank（M4–M8）随音乐平滑变化
  - 有 MIDI：完成 8 个 targets 的绑定，确认进入 `MIDI lock`（AI 不回拉旋钮/slot 值）
  - beat 不可靠：关闭 BeatTempo 或弱输入，观察系统退化为 flux-based 且不会过触发

---

## 13. 摄像头人像边缘 → ProjectM 耦合（以代码为准）

> 对应 TODO：`4.2 AIVJ 运行态可观测 + 人像边缘驱动 ProjectM` 的“参数/文档调优”部分。

### 13.1 输入信号：portraitEdge01 / portraitArea01

- 来源：`CameraLayer` + MediaPipe Selfie Segmentation。
  - 当背景类型为 `camera` 且 `segmentPerson=true` 时，`CameraLayer` 会：
    - 把 segmentation mask 下采样到较低分辨率（默认宽度 ~160 像素），压缩为灰度图。
    - 统计 mask 面积占比（area）与边缘密度（edge）。
  - 输出信号（通过 `CameraLayer.getStatus()` 暴露）：
    - `portraitArea01: number`：0..1，表示人像在画面中的大致占比。
    - `portraitEdge01: number`：0..1，表示人像轮廓边缘的“密度”/复杂度。
  - 两个信号都经过轻量 EMA 平滑（α≈0.25），避免细小抖动。
- 在 `bootstrap.ts` 中，AIVJ 运行态通过 `getPortraitSignals()` 读取：
  - `active: boolean`：camera 已启用且处于 streaming 状态。
  - `edge01/area01`：上述两个归一化信号。

### 13.2 UI 控件：人像边缘→PM（Edge→PM）

- 位置：画面（Visual）工具栏区域，紧挨着 Camera 相关控件。
  - 前景层选择：`FG Layer = Camera`
  - 分割开关：`AIVJ 画面 / 摄像头 / 人像`（`#camera-seg-toggle`）
  - 新增滑块：`人像边缘→PM / Edge→PM`（`#camera-edge-pm` + `#camera-edge-pm-text`）
- 行为：
  - 范围：0..100%，内部转换为 `amount01 ∈ [0,1]`。
  - 持久化：`newliveweb:camera:edgeToPm:v1`（localStorage，默认约 0.45）。
  - 只有当 **前景层为 Camera 且分割开启** 时才启用滑块，否则 UI 置灰。

### 13.3 算法：portraitEdge01 → ProjectM blend（runtime 耦合）

实现入口：`src/app/bootstrap.ts` 中的：

- `getPortraitSignals()`
- `applyPortraitEdgeCouplingRuntime(nowMs, portrait, amount01)`

核心逻辑（口径级描述）：

1. 触发条件
   - `portrait.active === true`（CameraLayer 处于 streaming 且 segmentPerson=true）。
   - `amount01 > 0`（人像边缘→PM 滑块非零）。
   - `portrait.edge01 > 0.05`（过滤掉极小噪声）。
   - 更新频率约为 ~15 FPS（`PORTRAIT_COUPLING_MIN_INTERVAL_MS ≈ 66ms`），避免过密写入。

2. 基线值
   - 从 `lastVisualState.projectm` 读取：
     - `baseOpacity`：用户当前的 ProjectM 不透明度（0..1）。
     - `baseEnergyToOpacityAmount`：当前音频驱动强度。
   - 注意：AIVJ 宏映射、AudioCtl、MIDI lock 等都可能在此之前调整这两个“基线”。

3. 目标值（target）
   - 将 `edge01` 归一化为 `boost ∈ [0,1]`，只在边缘明显变化时产生效果。
   - 根据 `amount01`（人像边缘→PM 强度）与 `boost` 计算目标：
     - `targetAmt`：在 `[0.05, 0.8]` 区间内，把 `baseEnergyToOpacityAmount` 向上推一点（最多 +0.45 * amount01 * boost）。
     - `targetOpacity`：在 `[0.2, 1.0]` 区间内，把 `baseOpacity` 向上推一点（最多 +0.18 * amount01 * boost）。
   - 设计原则：**不替代音频驱动，只叠加一层“随人动”的额外激活**。

4. 平滑应用（runtime）
   - 读取当前 `projectLayer.getBlendParams()`（包含 runtime 中已经生效的 opacity/amount）。
   - 使用一次 EMA 进行平滑过渡：
     - `next = (1 - α) * current + α * target`，其中 α≈0.35。
   - 将 `nextOpacity/nextAmt` 通过 `projectLayer.setBlendParams({ ...cur, opacity, energyToOpacityAmount })` 写回。
   - 不改动 `audioDrivenOpacity`（仍由 AudioCtl/用户控制）。

5. 关闭方式
   - 把滑块调为 0%：`amount01 = 0`，算法完全停止（不会再写 ProjectM）。
   - 关闭分割或切换前景层（Camera → 其它）：`portrait.active=false`，同样停用耦合。

### 13.4 与 AudioCtl / AIVJ 宏 / MIDI lock 的关系

- AudioCtl：
  - 依旧通过 `energy` 驱动 ProjectM（`base + energy * energyToOpacityAmount`）。
  - 人像边缘耦合只是动态调整 `base` 与 `amount` 的目标值，保持“音频是第一驱动力”的语义。
- AIVJ 宏银行：
  - 在非 MIDI lock 模式下，AIVJ 会通过宏映射调整 ProjectM 的基线；portraitEdge 耦合在此基础之上做 **小幅偏移**。
  - 在 MIDI lock 模式下，AIVJ 只在 runtime 应用宏映射后的 patch；portraitEdge 耦合依旧生效，因此“手控宏 + 人像边缘”可以叠加使用。
- MIDI：
  - portraitEdge 耦合不会改写 `global.macros` 或 `macroSlots` 值，因此不会与 MIDI 旋钮打架。
  - 只要用户觉得 ProjectM 对人像响应过强/过弱，可以通过：
    - 调整滑块（Edge→PM 强度）。
    - 调整 ProjectM 自身的 opacity/energy amount（Inspector/宏映射路径）。

---

## 14. 2025-12-24 实装对齐：连续轨迹 + beatQuality gating + morph hold

- 目标生成升级为“连续轨迹”：
  - 使用 `computeMacroBankIdeal(...)` 作为可解释的理想目标，并叠加低频噪声；
  - 通过指数平滑形成连续轨迹，替代“每次随机重采样”的突变式目标。
- beatQuality（confidence/stability）连续参与节奏决策：
  - 低置信度 → 触发间隔更长、目标变化更小、过渡更慢；
  - 高置信度 → 更贴拍、更频繁但仍保持限幅。
- preset 切换与 morph 解耦：
  - 预设切换时写入短暂 `morphHold` 窗口；
  - hold 期间不触发新的 AIVJ morph，并会冻结在当前采样值，避免同刻“换 preset + 大幅 morph”。

---

## 15. 2025-12-23 实装对齐：音频驱动表现力增强

- accent 对宏幅度/时长引入 profile 差异化：
  - `peakRave` 更强、更短；
  - `ambient/drone` 更稳、更慢；
  - 其余 profile 维持中间态。
- accent 叠加“slot 脉冲层”，提升细节律动（轻量、受 tone guard 约束）。
- AudioControls 预设调参：更快 attack、更长 release、更强调 beat/bass 质感，但避免过亮/过暗。

---

## 16. 2025-12-23 实装对齐：AIVJ accent 可观测

- UnifiedAivjController 输出 debug 追加：
  - `accent01`：当前 accent 驱动强度（0..1）。
  - `slotPulse01`：slot 脉冲层的单槽增量（0..1，小幅值）。
  - `accentSource`：`expressive`（驱动器）/`raw`（原始特征）/`none`。
- DiagnosticsPanel 的 AIVJ 行显示 `acc/pulse/src`，便于现场确认音频驱动是否生效。
- DecisionTrace 记录 `aivj.accent01` 与 `aivj.slotPulse01`，Topology details 支持 `aivj.*` 追踪。
