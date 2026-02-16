# AUDIO_PIPELINE_AUDIT_2025-12-25

目标：梳理「音频输入 → AudioFrame → ProjectM 喂入 → 宏参数链」的数据语义、节流点与热路径分配，并给出可执行的修复/优化 TODO（含验收信号）。

## 1) 音频输入 → AudioFrame（AudioBus / StreamAudioProcessor）

### 1.1 节流策略（决定字段更新频率）

- analysis 节流：AudioBus 默认 60fps（`analysisIntervalMs = 1000/60`）。如果距离上次分析不足阈值，会直接跳过本帧分析。
- frequency 节流：AudioBus 额外对频域上限 30fps（`FREQUENCY_FPS_CAP = 30`），通过 `getAnalysisData({ skipFrequency })` 控制 `AnaylserNode.getByteFrequencyData` 的调用频率。
  - 结果：`frequency/bands/bandsRaw` 可能在某些帧沿用上一份值；PCM 时域仍然可以 60fps 更新。

### 1.2 raw vs processed 的语义

- processed：`StreamAudioProcessor.analyser/leftAnalyser/rightAnalyser` 的输出，可能包含 inputGain/adaptiveGain 等链路影响。
- raw：best-effort 预增益（注释语义为 pre-input-gain / pre-adaptive-gain），来自 `rawAnalyser/rawLeftAnalyser/rawRightAnalyser`。
  - 注意：raw 是否真的“完全前置增益”，取决于节点接线位置；当前代码保证 raw 是“尽力而为”。

### 1.3 AudioFrame 字段落地（关键字段）

- `pcm2048Mono`：来自 `AudioData.pcm`（立体声时 L/R 平均成 mono）。
- `pcm2048MonoRaw?`：来自 `AudioData.pcmRaw`。
- `pcm512Mono`：`pcm` 重采样到 512（AudioBus 内 `resampleTo512`）。
- `pcm512MonoRaw?`：raw 重采样到 512。
- `bands`：processed 三段（立体声时取左右每段 max）。
- `bandsRaw?`：raw 三段（如有）。
- `energy`：不是简单 rms/peak，而是 `energyBase` 经 `energyAvg + energyGain` 自适应归一，用于“统一驱动信号”。
- `features`：从频域 bins 派生 techno-oriented 子带（kick/bass/clap/synth/hihat）与长尾包络、flux。

### 1.4 热路径分配点（已处理/待处理）

- 已处理：
  - `pcm512StereoLR` 在 mono 模式下不再每帧创建新对象，改为复用同一个对象并更新 left/right 引用。
  - `cloneFrame()` 若 stereo 实际为 mono（left === right），快照只 slice 一次，左右共享同一份克隆，减半分配。
- 待观察：
  - `getSnapshot()` 目前是“按 produced frame 序号缓存深拷贝”的惰性策略；如果未来要做 Route A（更强的 lazy snapshot），需要确认调用者是否依赖“每 tick 必深拷贝”。

## 2) AudioFrame → ProjectM（ProjectMLayer / ProjectMEngine）

### 2.1 PCM 选择与送入频率

- `ProjectMLayer.setAudioFrame(frame)`：默认送 `frame.pcm2048Mono`。
- 送入节流：`audioFeedIntervalMs` 控制喂入频率；0 表示每次 setAudioFrame 都喂。
- 静音 fallback：若静音（优先 `isSilentRaw`），会合成一个很小幅的 sin 波形避免 ProjectM 完全无驱动。

### 2.2 ProjectM 音频 API 的风险点（pm_pcm_add_float）

- 现象：如果错误调用未导出的 `pm_pcm_add_float`，Emscripten 会触发 WASM abort（错误信息类似："Cannot call unknown function pm_pcm_add_float, make sure it is exported"）。
- 关键事实：`cwrap()` 对缺失导出不会抛异常；“能拿到函数”不代表“可安全调用”。

### 2.3 已落地修复（正确性优先）

- 改为严格导出探测：只有在能拿到 `WebAssembly.Module.exports()` 且确认存在 `pm_pcm_add_float`（或 `_pm_pcm_add_float`）时，才启用音频 API 路径。
  - 拿不到 wasm exports 时，保守禁用 API，走 render-frame 音频（避免 abort 循环）。
- 在 `__projectm_verify` 里增加 `hasAudioApi`，便于 headless/诊断定位。

## 3) 下一步 TODO（按优先级，带验收信号）

### P0 正确性（阻断 abort / 保障 headless 契约）

1. 校验 ProjectMEngine 的 audio API 路径在“无导出”时绝不会调用（包括任何间接调用/别名）。
   - 验收：`browser-console.log` 不再出现 pm_pcm_add_float abort；`framesRendered > 0`。
2. 审计 ProjectMLayer → ProjectMEngine 的 PCM 选择：是否应优先 512/2048、是否应选择 raw（以及其语义是否可靠）。
   - 验收：在静音/低音量输入下，ProjectM 仍有稳定渲染与可观测的 `lastAudioRms/Peak`。

### P1 体验（可视化驱动一致性）

3. 对齐 `bandsStage` 的生产者：目前 AudioBus 不生成，消费侧（AudioControls/Diagnostics）会 fallback 到 bands。
   - 验收：诊断面板能解释“stage vs raw vs processed”的来源与更新频率。

### P2 性能（热路径 alloc & copy）

4. 评估 `ProjectMLayer.setAudioFrame` 里 `buildAudioPcmView` 是否做了额外分配；可考虑复用 buffer。
   - 验收：稳定运行时 JS heap 分配速率下降（可用 Performance/Memory 观察）。
5. 若要推进 Route A（更强 lazy snapshot）：确认所有 snapshot consumers（诊断/overlay/verify）对时序与深拷贝边界的假设。
   - 验收：在高频调用 `getSnapshot()` 场景下无 GC 峰值；功能不回归。

结论（本轮复盘）：

- 代码内目前未发现 `AudioBus.getSnapshot()` 的实际调用点（主要链路使用 `AudioBus.onFrame()` 直接推送池化 `AudioFrame`）。
- 因此 Route A 本轮不做进一步“更强 lazy”改造：保留 `getSnapshot()` 的“同一帧只 clone 一次”的缓存策略即可。
- 若未来加入 snapshot 调用（例如 overlay/诊断需要跨帧保存），再基于真实调用频率决定是否做更细粒度的 clone（按字段/按需求）或结构共享。

---

变更落点：

- `src/projectm/ProjectMEngine.ts`：严格导出探测 + verify diagnostics。
- `src/audio/AudioBus.ts`：复用 `pcm512StereoLR` 对象 + mono clone 优化。

## 4) 全局耦合网络（采纳 + 校正）

采纳你给出的“全局耦合网络”视角，但以代码为准落到实际消费者：

- `AudioBus` 作为单一音频源：统一产出 `AudioFrame`（PCM/energy/bands/features）。
- 并行消费者（同一帧同步消费）：
  - `ProjectMLayer.setAudioFrame(frame)`：喂 PCM 给 `ProjectMEngine`；并用 `frame.energy + techno transient` 组合成 `currentEnergy`（用于本层 opacity/驱动）。
  - `LiquidMetalLayerV2.setAudioFrame(frame)`：用 `frame.bands + features` 推导 low/mid/high，再由 `frame.energy` 形成 `currentAudioEnergy`。
  - 宏系统：`AudioControls` / `ExpressiveAudioDriver` 用 `bandsStage ?? bands` + `energy/flux/beatPulse` 生成宏驱动信号。

## 5) 风险点扫描（结合代码）

### 5.1 WASM 音频 API 安全调用（P0）

- 事实：`cwrap()` 对缺失导出不报错；错误调用会触发 WASM abort（headless 会失败/卡住）。
- 关键规则：只有在 `WebAssembly.Module.exports()` 里确认导出存在且 `kind === "function"` 时才启用 `pm_pcm_add_float`。
- 降级策略：如果拿不到安全 heap view（部分 runtime 访问 HEAP\* 会 abort），自动禁用 audio API，回退到 render-frame 音频路径（`pm_render_frame(leftPtr,rightPtr,...)`）。

### 5.2 频域 30fps 节流语义（P1）

- `bands/flux/kick...` 可能在某些帧不更新（30fps cap），但 PCM 仍可 60fps 更新。
- 结论：消费侧要能容忍“频域不每帧更新”；不要把 `bands` 的帧间连续性当作强契约。

### 5.3 raw vs processed 的一致性（P1）

- raw 是 best-effort：只有当 raw analyzers 确实在增益前取样，`pcmRaw/frequencyRaw/bandsRaw` 才能视作“前置增益”。
- 结论：raw 更适合作为诊断/对比信号；主驱动仍以 `energy`（已归一）为准。

## 6) TODO（执行队列 / 验收信号）

### P0 正确性

1. ProjectM audio API “严格导出探测 + 自动降级”（已加固）

- 位置：`src/projectm/ProjectMEngine.ts`
- 验收：`browser-console.log` 不再出现 `pm_pcm_add_float` abort；`__projectm_verify.hasAudioApi` 与实际行为一致。

2. ProjectM audio API 路径去除每次分配（已落地）

- 位置：`src/projectm/ProjectMEngine.ts`
- 内容：复用 interleaved stereo buffer + WASM ptr，避免每次 `new Float32Array` + `_malloc/_free`。
- 验收：长时间运行不出现“喂音频导致的 GC 峰值”；headless 不再卡死。

3. PCM 选择审计：2048 vs 512、raw 是否应进入 ProjectM

- 位置：`src/layers/ProjectMLayer.ts`（`setAudioFrame`）
- 验收：静音/低音量下 `framesRendered > 0`，并且 `lastAudioRms/Peak` 有合理数值。

结论（已落地）：

- 默认喂给 ProjectM 的 PCM 选择 **512**（`pcm512Mono`），避免 2048→512 时的“取样点下采样”带来的潜在 aliasing/瞬态丢失；同时也降低 `buildAudioPcmView` 与静音 `idlePcm` 的开销。
- 当 raw（pre-gain）存在时优先喂 **raw 512**（`pcm512MonoRaw`，否则回退 `pcm2048MonoRaw`），用更稳定的输入信号驱动 ProjectM。
- 静音判定仍保持 `isSilentRaw ?? isSilent` 优先级（raw 为 best-effort，但一旦存在，优先用它作为“是否静音”的契约）。
- 新增诊断字段（写入 `__projectm_verify.perPm[statsKey]`）：`audioPcmLen`、`audioPcmSource`，便于 headless/面板定位“到底喂了什么”。

### P1 体验一致性

4. `bandsStage` 生产者对齐（让“stage vs raw vs processed”可解释）

- 位置候选：`src/audio/stageBands.ts`（已有 StageBandsProcessor）
- 现状：`AudioControls` / `ExpressiveAudioDriver` 使用 `bandsStage ?? bands` fallback；`LiquidMetalLayerV2` 只用 `bands`。
- 验收：诊断信息能明确展示 stage/raw/processed 的来源与更新频率。

结论（已落地）：

- **唯一生产者：`AudioBus`**。在 `AudioBus.buildFrame()` 内以频域更新节流（30fps）为边界生成 `frame.bandsStage`。
- 输入选择：优先 `data.bandsRaw`，否则回退 `data.bands`。
- 生成算法：`StageBandsProcessor(profile=punchy)`；并支持 `process(..., out)` 以避免热路径对象分配。
- 诊断呈现：DiagnosticsPanel 增加 `Bands` 行，显示 `P(processed) / R(raw) / S(stage)` 三套 low/mid/high（百分比）。

### P2 性能

5. ExpressiveAudioDriver 避免每帧 `{ ...snapshot }` 分配

- 位置：`src/audio/audioControls/expressiveAudioDriver.ts`
- 方案：新增 `getSnapshotRef()` / `onFrameRef()`（返回只读引用），保留现有 API 兼容。
- 验收：热路径分配下降；功能不回归。
