# 参数接口/嵌套结构/数据路由报告（newliveweb）

本文把项目里“所有参数接口（嵌套）”与“数据从哪里来、如何路由到哪里去”梳理成一张可落地的地图，方便你之后做 UI/Inspector/MIDI/AIVJ 的统一改造与排错。

---

## 1. 核心数据结构（可保存 vs 运行时）

### 1.1 可保存/可复现：`VisualStateV2`

定义：`src/features/visualState/visualStateStore.ts:43`

`VisualStateV2` 是“收藏夹 / Show 保存 / URL 导入”一类功能的权威持久化状态，结构如下：

- `global`
  - `seed`: number（随机种子）
  - `macros`: `{ fusion, motion, sparkle }`（0..1）
  - `macroSlots`: `MacroSlot[]`（用于宏槽位 + AIVJ macro bank + MIDI auto-map）
- `background`
  - `type`: `"liquid" | "camera" | "video" | "basic" | "depth"`（当前 focus layer）
  - `params`: `Record<string, unknown>`（**兼容字段**：镜像 focus layer 的参数，避免旧存档失效）
  - `layers?`: `{ liquid, basic, camera, video, depth }`（**mixer 结构**：每层独立参数）
  - `underlayLiquidParams?`: 旧字段（逻辑上迁移到 `layers.liquid`）
- `projectm`
  - `presetId/presetUrl`
  - `opacity/blendMode/audioDrivenOpacity/energyToOpacityAmount`（见 `BlendParamsSnapshot`）

### 1.2 运行时（不建议直接持久化）：`AudioFrame`

定义：`src/types/audioFrame.ts:1`

`AudioFrame` 是 AudioBus 每帧广播的实时信号总线，典型字段：

- PCM：`pcm2048Mono` / `pcm512Mono`（可选 raw：`pcm2048MonoRaw` / `pcm512MonoRaw`）
- 能量/频段：`energy`、`bands{low,mid,high}`（可选 `bandsRaw/bandsStage`）
- `features?`：techno 子带（kick/bass/clap/hihat/synth 的 raw/long）+ BeatTempo 注入（bpm/phase/pulse/confidence…）
- `isSilent` / `isSilentRaw?`

这些字段用于：AIVJ、ProjectM 音频注入、LiquidMetal 音频响应、BeatTempo 推断、Diagnostics 展示等。

---

## 2. “所有参数接口”（`paramSchema`）

定义：`src/state/paramSchema.ts:117`

`paramSchema` 是 Inspector/MIDI/随机化等功能的参数字典，按 `group` 组织、按 `key` 路由。下面是“组 → keys”的完整列表（以代码为准）：

### 2.1 `Global/Macros`

- `fusion`, `motion`, `sparkle`

### 2.2 `ProjectM/Blend`

- `opacity`, `energyToOpacityAmount`, `blendMode`, `audioDrivenOpacity`

### 2.3 `Audio/BeatTempo`

- `enabled`, `method`, `windowSec`, `updateIntervalMs`, `inputFps`, `minTempo`, `maxTempo`

### 2.4 `Audio/Controls`

- `technoProfile`, `enabled`, `mixToMacros`, `attackMs`, `releaseMs`, `maxDeltaPerSec`
- `amountProjectM`, `amountLiquid`, `amountBasic`, `amountCamera`, `amountVideo`, `amountDepth`
- `wFusionEnergy`, `wFusionBass`, `wFusionFlux`, `wFusionBeat`
- `wMotionEnergy`, `wMotionBass`, `wMotionFlux`, `wMotionBeat`
- `wSparkleEnergy`, `wSparkleBass`, `wSparkleFlux`, `wSparkleBeat`
- `overlayBudgetMaxEnergy`, `overlayBudgetMinScale`, `overlayBudgetDepthWeight`, `overlayBudgetSmoothBaseMs`
- `overlayBudgetPriorityBasic`, `overlayBudgetPriorityCamera`, `overlayBudgetPriorityVideo`, `overlayBudgetPriorityDepth`
- `overlayBudgetPmRetreatStrength`, `overlayBudgetPmRetreatFloor`

⚠️ **注意**：`overlayBudget*` 参数目前是**配置预留**，`applyAudioControlsPatch` 可修改这些值（`src/app/bootstrap.ts:1471-1531`），但尚未被任何 render loop 或层消费。如果设计意图是"多层动态透明度/优先级调度"，需在 SceneManager 或 bootstrap 的渲染管线中补充消费逻辑。

### 2.5 `Background/Type`

- `type`

### 2.6 `Background/Liquid`

- `enabled`, `opacity`, `variant`
- `timeScale`, `iterations`, `waveAmplitude`, `mouseInfluence`
- `metallicAmount`, `metallicSpeed`, `brightness`, `contrast`
- `tintHue`, `tintStrength`, `paletteStrength`
- `audioReactive`, `audioSensitivity`

### 2.7 `Background/Basic`

- `enabled`, `speed`, `opacity`

### 2.8 `Background/Camera`

- `enabled`, `deviceId`, `opacity`
- `segmentPerson`, `segmentQuality`, `segmentFps`, `segmentEdgeBlurPx`

### 2.9 `Background/Video`

- `enabled`, `src`, `opacity`
- `loop`, `muted`, `fitMode`, `playbackRate`

### 2.10 `Background/Depth`

- `enabled`, `source`, `deviceId`, `opacity`
- `near`, `far`, `invert`, `showDepth`
- `layers`, `fog`, `edge`, `blur`, `scale`, `noise`, `bw`, `fall`, `fps`

---

## 3. 数据路由（UI / Inspector / MIDI / Audio）到哪里

### 3.1 UI（Toolbar）→ bootstrap → Layer

- UI DOM：`src/app/renderShell.ts`
- 绑定与落地：`src/app/bootstrap.ts`（例如背景层 toggle/opacity/src 等）
  - 背景层 UI 绑定区：`src/app/bootstrap.ts:3011`
  - `Show/Save/Fullscreen/Retry` 等按钮：同文件内有明确的 `addEventListener`

### 3.2 Inspector →（scope + patch）→ bootstrap.applyInspectorPatch → Layer/Config

- Inspector scope 枚举与 group→scope 映射：`src/app/controllers/inspectorController.ts:5`、`src/app/controllers/inspectorController.ts:110`
- Inspector 的 patch 落地由 bootstrap 提供：`src/app/bootstrap.ts:1670`
  - `audio.beatTempo` → `beatTempo.setConfig(...)`
  - `audio.controls` → `applyAudioControlsPatch(...)`
  - `projectm.blend` → `projectLayer.setBlendParams(...)` + `sceneManager.setCompositorBlendMode(...)`
  - `background.type` → `applyBackgroundTypePatch(...)`
  - `background.layer.*` → `applyBackgroundLayerPatch(...)`（最终写各层 `applyParams/setEnabled`）

### 3.3 MIDI →（binding target）→ midiController → bootstrap hooks → Layer/State

- 存储：`newliveweb:settings:v1`（`src/features/settings/settingsStore.ts:25`）
- MIDI Learn/AutoMap/绑定路由：`src/app/controllers/midiController.ts:244`
  - `macro:*` → `setMacroValue01(...)`（写 `VisualStateV2.global.macros`）
  - `slot:*` → `setSlotValue01(...)`（写 `VisualStateV2.global.macroSlots`）
  - `param:*` → 按字符串前缀路由：
    - `projectm.*` → `applyProjectMBlendPatch`
    - `audio.controls.*` → `applyAudioControlsPatch`
    - `audio.beatTempo.*` → `applyBeatTempoPatch`
    - `liquid.*|basic.*|camera.*|video.*` → `applyBackgroundLayerPatch(bgType,{key:value})`

### 3.4 AudioBus（实时）→ bootstrap.onFrame → Layer

- AudioBus 帧广播：`src/audio/AudioBus.ts:214`
- bootstrap 主消费：`src/app/bootstrap.ts:3207+`
  - 将 BeatTempo snapshot 注入到 `frame.features`
  - 计算 `audioReactiveMul` 并喂给 ProjectM/LiquidMetal（运行时乘子）
  - 运行 "3D coupling / AIVJ morph" 等 runtime-only 管线
  - 最终喂层：`src/app/bootstrap.ts:3600+`

Layer 消费点：

- ProjectM：`src/layers/ProjectMLayer.ts:96`（`engine.addAudioData(pcm2048Mono)`）
- LiquidMetal：`src/layers/LiquidMetalLayerV2.ts:287`（从 techno 子带 + bands 计算内部音频能量/频段）

### 3.5 AudioControls（实时宏混合）→ bootstrap.onFrame → ProjectM/Liquid runtime

**新增路由（2025-12-18）**：音频信号自动生成宏，runtime-only 调制层参数。

- 触发条件：`audioControls.enabled && !midiLock && (!aivj.enabled || 过了manualHold窗口)`
- 数据流：
  ```
  AudioFrame → audioControls.onAudioFrame(frame, nowMs) → AudioControlsSnapshot
    ↓
    融合 base macros（lastVisualState）+ audio-derived macros（按 mixToMacros 比例）
    ↓
    通过 getMacroBankFromState(mixedMacros) 应用 slot widening
    ↓
    按 amounts.projectm/liquid 调制层参数（runtime-only，33ms 节流）
      • ProjectM: opacity, energyToOpacityAmount
      • Liquid: timeScale, waveAmplitude, metallic*, brightness, contrast, tint*, paletteStrength
  ```
- 关键特性：
  - **不写回** `lastVisualState` 或 UI 控件
  - 与 AIVJ 的优先级：当前代码中 AudioControls 先执行，AIVJ 后执行（可能覆盖）
  - 节流策略：每 33ms 最多应用一次，避免过度刷新

⚠️ **注意**：如果 `audioControls.enabled && aivj.enabled` 同时开启，两者会在同一帧内写同一批参数（ProjectM/Liquid），需要考虑融合策略或优先级。

---

## 4. 状态同步与持久化入口

### 4.1 运行态 → 可保存状态

- `buildCurrentVisualState()`：`src/app/bootstrap.ts:1188`
  - 读取 UI + layer runtime snapshot，生成 `VisualStateV2`

### 4.2 patch 写层的同时，保持 state “基本一致”

- `updateLastVisualStateLayer()`：`src/app/bootstrap.ts:1306`
  - 更新 `background.layers.<layer>`
  - 如果该层是当前 `background.type`，同时更新 `background.params` 镜像（兼容路径）

### 4.3 恢复（Favorite/Show）→ 写回 UI + Layer

- `applyVisualStateSnapshot()`：`src/app/bootstrap.ts:2116`

### 4.4 storage keys

- Favorites：`newliveweb:favorites:v2`（`src/app/bootstrap.ts:1125`）
- Show：`newliveweb:showConfig:v1`（`src/app/bootstrap.ts:2289`）
- MIDI：`newliveweb:settings:v1`（`src/features/settings/settingsStore.ts:25`）

---

## 5. 已修复的路由缺口（2025-12-18 更新）

以下问题在最近的代码更新中已全部修复：

1. ✅ **Audio/Controls runtime 驱动已接入**：`audioControls.onAudioFrame()` 已在 `audioBus.onFrame` 内调用（`src/app/bootstrap.ts:3207+`），并实现了 runtime-only 调制（ProjectM + Liquid 参数），`mixToMacros` 现在可真实影响视觉。
2. ✅ **blendMode 枚举已对齐**：`paramSchema.projectm.blend.blendMode` 已扩展到 8 个值（`add/screen/normal/multiply/overlay/difference/exclusion/color-dodge`），与运行态和 toolbar 完全一致。
3. ✅ **MIDI depth 路由已补全**：`BackgroundType` 已包含 `"depth"`，`param:depth.*` 现在可通过 MIDI 绑定生效。

### 5.1 新增运行时路由（需注意优先级）

修复后引入了新的数据流，需要关注多源写入的优先级问题（见第 3.5 节）。

---

## 6. 给“统一 AIVJ / 统一参数路由”的建议入口

如果要做“统一 AIVJ + 参数路由统一”，建议以 `paramSchema` + `VisualStateV2` 为唯一权威接口：

- 参数“定义层”：`src/state/paramSchema.ts`
- 状态“落盘层”：`src/features/visualState/visualStateStore.ts`
- patch “路由层”：集中收敛到一个 controller（避免 `bootstrap.ts` 继续膨胀）
  - Inspector：`src/app/controllers/inspectorController.ts`
  - MIDI：`src/app/controllers/midiController.ts`
  - AIVJ：建议抽出为单独的 `src/features/aivj/*` controller（见新文档方案）
