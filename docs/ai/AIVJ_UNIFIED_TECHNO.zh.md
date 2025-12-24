---

## 当前代码状态（2025-12-18 快照）

在阅读本设计文档前，先了解实际代码的现状和最近修复：

### 已就绪的能力

✅ **BeatTempo 信号完整**：`beatPhase/beatPulse/beatConfidence/beatStability` 已注入 `AudioFrame.features`（`bootstrap.ts:3210-3228`），可直接用于 beat-aligned 触发。

✅ **Techno 子带特征**：`kick/bass/clap/synth/hihat` 的 `raw/long` 变体已计算并注入（`AudioBus.ts` → `frame.features`），可用于 accent 层设计。

✅ **Manual hold 机制**：用户手动拧宏时会设置 `aivjManualHoldUntilMs = nowMs + 5000`（`bootstrap.ts:728-740`），AIVJ 在窗口内暂停，避免覆盖用户操作。

✅ **AudioControls 接入**（刚修复）：`audioControls.onAudioFrame()` 已在 `audioBus.onFrame` 内调用，`mixToMacros` 可真实影响 ProjectM/Liquid runtime 参数。

### 当前架构问题

⚠️ **多源写参数冲突**：每帧内有 2 个源会写 ProjectM/Liquid 参数（AudioControls 先，AIVJ 后），AIVJ 会覆盖 AudioControls 的效果。

⚠️ **AIVJ 写回 state**：`applyAivjBankToLayers` 会修改 `lastVisualState.global.macros/macroSlots`（`bootstrap.ts:656-693`），导致 AIVJ 的随机效果被保存到 Favorites/Show（可能不符合预期）。

⚠️ **触发条件简单**：AIVJ 当前只按固定时间触发（`nowMs - lastTriggerMs > 4000`），未利用 beat 信号做 bar-aligned。

⚠️ **overlayBudget 未生效**：10 个 `overlayBudget*` 参数可被 Inspector/MIDI 修改，但没有任何渲染管线消费这些值。

### 优先级链（当前实现）

每帧路由顺序（`audioBus.onFrame` 内）：

```
1. BeatTempo 注入 features
2. 计算 audioReactiveMul（影响 ProjectM/Liquid 乘子）
3. AudioControls 调制（如果 enabled && 允许宏混合）
   └─ 写 ProjectM blend + Liquid params（runtime-only，33ms 节流）
4. 3D/空间管线（camera/depth → ProjectM externalOpacityDrive + depth runtime）
5. AIVJ morph（如果 enabled && !midiLock && 过了hold）
   └─ applyAivjBankToLayers → 写 lastVisualState + applyMacroBankToRuntime
      ├─ 写 ProjectM blend params
      └─ 写 Liquid params
6. 喂层 setAudioFrame（ProjectM/Liquid）
```

**问题**：步骤 3 和步骤 5 写同一批参数，AIVJ 会覆盖 AudioControls。如果两者同时开启，AudioControls 只在 AIVJ 两次触发之间（4s）短暂生效。

---

## 设计目标与架构草案

以下是"统一 AIVJ"的设计方向（部分概念性，需结合实际落地）：

```typescript
type UnifiedAivjOutput = {
  // 写到 runtime 的“宏库”，再由 mapping 统一写到 ProjectM/Liquid/背景层/overlayBudget
  macroBank: MacroBank;
  // 可选：额外的 runtime patch（例如 overlayBudget、PM retreat、depth 参数微调）
  runtimePatch?: {
    projectmBlend?: Partial<{
      opacity: number;
      energyToOpacityAmount: number;
      audioDrivenOpacity: boolean;
      blendMode: string;
    }>;
    liquid?: Partial<Record<string, unknown>>;
    background?: Partial<Record<string, unknown>>; // 例如 depth fog/edge/blur 的 runtime-only
    overlayBudget?: Partial<Record<string, number>>;
  };
  // 用于诊断/显示
  debug: {
    mode: "off" | "hold" | "midi" | "ai";
    section: string;
    mix01: number;
    targetAgeMs: number;
  };
};

// Manual hold 机制（已实现）：
// 当用户手动拧宏/slot 时，bootstrap 会调用 noteUserMacroInteraction()，
// 设置 aivjManualHoldUntilMs = nowMs + 5000，controller 在此窗口内应暂停 AIVJ 输出。
```

**关键点**：bootstrap 不再直接写“宏库映射/随机/过渡”；它只调用 `controller.onFrame(...)` 得到 `UnifiedAivjOutput`，再统一应用。

### 4.3 AIVJ 配置（Techno 优先的旋钮）

建议把 AIVJ 的“核心可调项”压缩为 8–12 个（过多会不可控）：

- `enabled`
- `profile`（你已有：ambient/peakRave/dub/drone/videoVj/custom）
- `mode`：`off|ai|midi|hold`（你 UI pill 已有概念）
- `mixToMacros`（你已有同名：但要真正在 onFrame 路由里用）
- `targetUpdate`: `{ align: 'beat'|'bar'|'free', everyBars: 2|4|8, minMs, maxMs }`
- `transition`: `{ baseMs, minMs, maxMs, maxMacroDeltaPerSec, maxSlotDeltaPerSec }`
- `accent`: `{ kickToSparkle, hihatToSparkle, clapToSparkle, beatPulseToMotion }`
- `phrase`: `{ energyToFusion, fluxToMotion, bassToFusion, stabilityGate }`
- `safety`: `{ clampCenterPull, noAudioFallbackMs, silenceFreeze }`
- `overlayBudget`: 10 个参数已存在（maxEnergy/minScale/depthWeight/smoothBaseMs/priority*/pmRetreat*），但**当前未被渲染管线消费**。如需生效，需在 SceneManager 或 bootstrap render loop 内补充逻辑。

---

## 5) Techno 效果“最好”的具体做法（基于你现有能力）

### 5.1 对齐节拍/小节触发（核心提升）

✅ **基础已就绪**：`beatPhase/beatPulse/confidence/stability` 已注入 `AudioFrame.features`（`src/app/bootstrap.ts:3210-3228`），信号质量良好。

**当前触发条件**：`nowMs - lastTriggerMs > 4000`（固定时间）

**建议改进**：只在满足条件时更新 target：

- `beatConfidence > 阈值 && beatStability > 阈值` 才进入 beat-aligned 模式
- 通过 `beatPhase` 从 1→0 的回绕检测“新拍”，累计 beatCount
- 每 `N` 拍（例如 16 拍 = 4 小节）才生成一次 `randomMacroBankTarget`

这样 Techno 会立刻从“随机抖动”变成“有段落感的推进”。

### 5.2 两层驱动：慢变（section）+ 快变（accent）

把输出拆成两部分再合成：

- `macroBankSlow`：来自 `randomMacroBankTarget` / phrase 状态机（2–8 秒）
- `macroBankAccent`：只对 `sparkle`、少量 `motion` 做短促增量（30–200ms），受 `kick/clap/hihat` 驱动且限幅
- 合成：`macroBank = clamp( lerp(slow, accent, accentMix) )`

这比“直接把所有输入塞进随机”更可控，也更像 Techno。

### 5.3 统一 mapping：宏库 → 真实参数（别写两套）

你当前的 `applyMacroBankToRuntime` 已经把三宏映射到：

- `ProjectM`：`opacity`、`energyToOpacityAmount`
- `LiquidMetal`：`timeScale/waveAmplitude/metallic/brightness/contrast/tint/palette`

建议把这块搬到统一 controller 内，并把“写 Layer 参数”统一走一个函数：

- `applyMacroBankToLayers(bank, { source:'aivj', runtimeOnly:true })`
- 严格做到：同一帧内只有一个源能写同一参数（避免抖动）

### 5.4 更 Techno 的“视觉语法”（建议映射）

按 Techno 的听感，推荐将宏语义固定下来，方便你手动也能理解：

- `fusion`：**存在感/厚度**（ProjectM 更“站前面”或退后）
  - 强相关：`projectm.opacity`、`pmRetreatFloor/Strength`（当背景层很强时 PM 退让）
- `motion`：**流动/速度/形变**
  - 强相关：`liquid.timeScale`、`liquid.waveAmplitude`
  - 次相关：`depth.layers/blur`（如果你想做“空间感”）
- `sparkle`：**金属/闪耀/尖锐瞬态**
  - 强相关：`liquid.metallicAmount/metallicSpeed/contrast`
  - accent：`sparkle += k*kick + h*hihat + c*clap`（短促）

slot（M4..M8）建议固定“用途”，否则很难调：

- `M4`：kick emphasis（更硬）
- `M5`：flux/synth movement（更花）
- `M6`：hihat sparkle（更亮）
- `M7`：bass weight（更厚）
- `M8`：color/tint/palette（更彩）

---

## 6) 基于现状的“最小改造路径”（效果/风险比最好）

你说“不满意现在的 AIVJ”，但要注意：你现在已经有不少可用模块了，最省风险的路径是 **“抽离 + 对齐节拍 + 两层驱动”**，而不是推倒重写。

建议分 3 步落地（每步都可验证）：

1. **把 AIVJ 从 `bootstrap.ts` 抽成 controller（不改算法）**
   - 把 `applyMacroBankToRuntime`、transition、midiLock/mode 决策迁移到 `UnifiedAivjController`
   - bootstrap 只保留：`controller.onFrame(frame)` → `applyOutput(output)`
2. **加 beat-aligned target update（Techno 质变点）**
   - 稳定时按 bar 更新目标；不稳定时退回“free 模式 + 更长时间常数”
3. **做 accent 层（kick/clap/hihat 瞬态点缀）**
   - 只影响少数参数且限幅，避免“抖”

这三步能把你现有 `aivjTechno.ts` 的优势保留，又把 Techno 的“段落感+瞬态”做出来。

## 7) 已修复问题与剩余架构挑战（2025-12-18 更新）

### 7.1 已修复（2025-12-18）

✅ **Audio/Controls runtime 驱动**：`audioControls.onAudioFrame` 已接入 `audioBus.onFrame`，`mixToMacros/amounts` 现在真实影响 ProjectM/Liquid。

✅ **blendMode 枚举对齐**：`paramSchema` 已扩展到 8 个值，与运行态/toolbar 完全一致。

✅ **MIDI depth 路由**：`BackgroundType` 已包含 `"depth"`，`param:depth.*` 可通过 MIDI 绑定。

### 7.2 需要在"统一 AIVJ"时解决的架构问题

## 8) 建议的实施路径（基于当前代码状态）

### 8.1 优先级 1：解决多源冲突（必须先做）

当前有 5 个源想写宏/参数：

1. **UI knobs**（用户手动）
2. **MIDI CC**（外部控制器）
3. **AudioControls**（音频 → 宏混合，runtime-only）
4. **AIVJ**（AI 生成 target，当前写 state）
5. **Spatial/3D**（camera/depth 信号，runtime-only）

**建议的优先级链**：

```
midiLock 开启 → MIDI 独占宏，屏蔽其他源
  ↓
aivjManualHoldUntil 未过期 → UI 独占，屏蔽 AudioControls/AIVJ
  ↓
否则 → 融合多源：
  • base = lastVisualState.global.macros（UI 设定值）
  • audioControlsMacros = audioControlsSnap.fusion01/motion01/sparkle01
  • aivjMacros = aivjTarget.macros（如果 aivj.enabled）
  • spatialDrives = camera/depth 信号（只影响特定参数，不走宏）
  ↓
  finalMacros = lerp3(
    base,
    audioControlsMacros,
    aivjMacros,
    weights = [1 - mixToMacros - aivjMix, mixToMacros, aivjMix]
  )
```

关键点：不要让 AudioControls 和 AIVJ 各自独立写参数，而是在 UnifiedAivjController 内**统一融合**后再输出。

### 8.2 优先级 2：抽离 AIVJ 为独立 controller

**目标**：把 `bootstrap.ts` 内的 AIVJ 逻辑（transition/target/mapping）收敛到 `src/features/aivj/unifiedAivjController.ts`。

**不改变现有效果**，只做"收敛"：

- `controller.onFrame(frame, audioControlsSnap, timestampMs): UnifiedAivjOutput`
- `bootstrap` 只负责调用并应用输出

### 8.3 优先级 3：beat-aligned 触发 + accent 层

在 controller 内实现：

- beat-aligned target 更新（按 4/8/16 拍，基于 beatPhase 回绕检测）
- accent 层（kick/clap/hihat → sparkle 短促增量，30-200ms）

### 8.4 优先级 4：明确 AIVJ 的 state 语义

决策：

- 方案 A：AIVJ 完全 runtime-only（不写 `lastVisualState`），Favorites 只保存用户手动设定的宏
- 方案 B：AIVJ 的"慢变层"写 state（可保存），"accent 层"runtime-only

**需要你明确选择**，然后我可以调整 `applyAivjBankToLayers` 的行为。

### 8.5 配置决策点（请告知偏好）

1. **AudioControls vs AIVJ 优先级**：你希望 `mixToMacros` 和 AIVJ 的"混合比例"怎么控制？是各占一半，还是 AudioControls 优先？
2. **AIVJ 写 state**：你希望 AIVJ 的随机结果被保存到 Favorites 吗？（当前行为：会保存）
3. **overlayBudget**：这 10 个参数的设计意图是什么？如果是"多层动态调度"，需要在哪个环节消费？
4. **beat-aligned 严格度**：Techno 模式下，是否允许在 beat 不稳定时退回 free 模式？还是强制等待稳定？

---

一旦你明确这些决策，我可以立刻开始实施（预计 3-5 个文件的改动，主要是抽离 controller + 融合逻辑）。ontrollers/midiController.ts:26`

---

## 8) 如果你想让我继续做：我会先做哪 3 个改动

1. 把 AIVJ + 宏库映射从 `src/app/bootstrap.ts` 抽成 `src/features/aivj/unifiedAivjController.ts`（只做“收敛”，不改变效果）
2. 在 controller 内实现 beat-aligned target 更新（按 4/8/16 拍），并把参数做成可调项（Inspector 可见）
3. 把 `audioControls.onAudioFrame` 接入，并让 `mixToMacros` 真正控制“用户宏 vs AIVJ 宏”的混合

你只要告诉我：你希望的优先级是 `Hold > MIDI > UI > AIVJ` 还是别的，我就按你习惯来定最终路由。
