# newliveweb 代码分割 + 音频/融合改造（代码级详细计划）

> 目标：在不牺牲迭代速度的前提下，把当前“main.ts 巨石编排 + 局部直接耦合”的实现，升级为“模块化可扩展 + 全参数可控 + 统一音频数据链路 + 可组合融合”的结构。
>
> 本文既是分割计划，也是对你提到的 3 类症状的回答与落地路径。

---

## 0. 现状快速定位（结合现有代码）

### 0.1 当前关键入口与模块边界

- 入口/编排：`src/main.ts`
  - 同时承担：DOM 构建、事件绑定、preset 逻辑、收藏/随机、audio wiring、layer wiring、状态机。
- 渲染核心：
  - `src/SceneManager.ts`：驱动渲染与 resize，管理 `Layer[]`。
  - `src/layers/Layer.ts`：`init(scene, renderer)` / `update(dt)` / `dispose()`。
  - `src/layers/LiquidMetalLayerV2.ts`：背景 shader + 音频 bands 输入。
  - `src/layers/ProjectMLayer.ts`：ProjectM canvas → `THREE.CanvasTexture` → overlay mesh。
- 音频：
  - `src/audio/StreamAudioProcessor.ts`：MediaElement + AnalyserNode，输出 `pcm/frequency/bands/peak/rms`。
  - `src/audio/AudioController.ts`：封装 load/play/pause + RAF loop 分发。
- preset/manifest：
  - `src/config/presets.ts`：全局可变集合（runtimePresets/badPresetIds）。
  - `src/lib/loadManifest.ts` + `src/config/presetManifest.ts` + `src/config/presetLibraries.ts`。

### 0.2 你提到的症状与“最可能的根因”

#### 症状 1：ProjectM 吃不到音频（格式或链路问题）

现有链路是：

1) `StreamAudioProcessor.getAnalysisData()` → `pcm: Float32Array`（长度=fftSize，默认 2048，单声道混合）。
2) `AudioController.onFrame` 回调里：`projectLayer.addAudioData(data.pcm)`（`src/main.ts`）。
3) `ProjectMLayer.addAudioData` → `ProjectMEngine.addAudioData(pcmData)`。
4) `ProjectMEngine.render()` 每帧将 `audioBuffer` 写入 WASM heap，再调用 `pm_render_frame(...)`。

这条链路理论上是 OK 的；但在“看起来吃不到”的情况下，最常见的不是“格式”，而是：

- **音频实际上没播放**（autoplay policy / AudioContext suspended / audioElement.play() 被拒绝但你当前代码忽略了 promise rejection）。
- **分析节点输出接近 0**（音量太低/数据被平滑/被浏览器策略限制），导致你认为“没反应”。
- **ProjectM 的音频注入并未稳定可观测**：现在没有 UI 级别的“音频是否进入 ProjectM”的诊断面板，你只能凭视觉判断。

> 结论：先加“可观测性”（diagnostics），再做链路统一与格式适配；不要一上来重写引擎。

#### 症状 2：背景与可视化图层完全不融合（色调/融合度差）

当前是：背景 `LiquidMetalLayerV2` 输出银色系；ProjectM 直接 `AdditiveBlending` 叠加（`ProjectMLayer`），没有统一的色彩空间、palette、混合策略，也没有共同的全局参数（比如同一个 energy/beat/色相）。

> 结论：你需要一个 **统一的全局视觉状态（Global Visual State）**，而不是让每层“各自调参”。

你提出“互相影响”，可拆成两个层次：

1) **弱耦合互相影响**（推荐先做）：共享同一套 `audio features + palette + energy`，并用这些参数同时驱动两层。
2) **强耦合互相影响**（后续做）：引入合成/后处理（compositor），甚至采样 ProjectM 输出（颜色/亮度）反哺背景 shader。

#### 症状 3：背景/ProjectM 的音频响应很奇怪

这通常来自：

- 两层吃到的“音频特征不一致”（一个用 bands，一个用 PCM 的瞬态/包络；或者归一化策略不同）。
- 没有统一的动态范围/增益策略（gain/pumping/smoothing 不一致）。
- 缺少 beat/onset 等更“音乐性”的特征，只用简单 RMS/low-mid-high 很容易“怪”。

> 结论：你不一定立刻需要“自研一个音频分析引擎”，但你**需要一个统一的 AudioBus**，集中做：降采样、归一化、平滑、节拍/瞬态特征，然后给各层订阅。

---

## 1. 改造目标（你提出的命令逐条落地）

### 1.1 全参数暴露 + 一键随机 + 一键收藏

目标是：

- 背景算法参数（LiquidMetal）全部可见/可编辑（你现在已经做了一部分）。
- ProjectM 相关参数可控：opacity、blend mode、色彩映射/校色（可选）、preset、自动轮播等。
- 全局参数可控：palette、全局强度（energy scale）、随机种子等。
- `Randomize All`：对“参数集合”做随机（而不是到处手写 randomInRange）。
- `Favorite All`：把“完整视觉状态 JSON”存入 localStorage（包含：preset、blend、两层参数、全局参数、以及未来扩展字段）。

### 1.2 图层融合（从易到难）

阶段化目标：

- **阶段 A（本周能完成）**：建立统一 palette + blend 参数；ProjectM 叠加方式可切换（add/screen/softlight-like 的近似）并可调 mix；背景支持 tint/对比度；两者由同一 audio energy 驱动。
- **阶段 B（后续）**：加入 compositor（渲染到纹理再 shader 合成），支持更精确的融合与互相影响。
- **阶段 C（探索）**：从 ProjectM 输出提取低分辨率颜色统计（平均色/主色），回灌给背景 shader（实现“互相影响”的体感）。

### 1.3 统一音频数据链路（AudioBus）

目标：

- 单一来源：全局只有一个“音频帧”数据源（AudioBus），任何层/控制台都订阅它。
- 同一套归一化/平滑：bands、envelope、beat/onset 的计算在 bus 内完成。
- 输出分层：
  - 给背景：`bands`、`energy`、`beatPhase` 等“低频控制信号”。
  - 给 ProjectM：`pcm512StereoLR`（严格 512/chan 的 left/right Float32Array）+ `rms/peak` 做诊断。

---

## 2. 新的“模块化规则”（长期可扩展）

### 2.1 目录与职责（建议）

```
src/
  app/                # 启动与装配（入口只调用这里）
    bootstrap.ts
    renderShell.ts
  audio/              # 音频底层（processor）+ bus
    StreamAudioProcessor.ts
    AudioBus.ts
  layers/             # 纯渲染层（不直接操作 DOM / localStorage）
  features/           # 业务特性（presets/favorites/console）
    presets/
    favorites/
    console/
  state/              # 全局状态与 schema（可序列化）
    VisualStateStore.ts
    paramSchema.ts
  types/              # 共享类型（AudioFrame/VisualState）
```

### 2.2 依赖方向（强约束）

- `layers/*` **不能** import `features/*`、不能直接操作 DOM/localStorage。
- `features/*` 可以依赖 `layers/*`（通过稳定接口），但不应直接改层内部字段（例如不直接改 `layer.params`）。
- `app/*` 只负责装配与生命周期（create/bind/dispose），不写业务细节。
- `state/*` 只能是纯数据/纯函数（可序列化、可测试），不触发副作用。

### 2.3 命名与数据链路约定（保留更新空间）

- 事件/总线：`Bus`、`Store`、`Controller` 三类角色清晰：
  - `*Bus`：只做数据生产/分发（带 `subscribe()` / `getSnapshot()`）。
  - `*Store`：只做状态持久化/序列化（带 `toJSON()` / `fromJSON()`）。
  - `*Controller`：连接 UI 与 Store/Bus，负责交互状态机（可 dispose）。
- 参数结构统一叫 `*Params`，schema 统一叫 `*ParamSchema`（用于 UI 自动生成与随机策略）。
- “一键随机/收藏”针对的是 `VisualState`（完整状态），不是散落在 main.ts 的临时变量。

---

## 3. 解决 3 个症状的“工程化打法”

### 3.1 先把问题变“可观测”（Diagnostics）

新增一个轻量面板（后续会被你更集成的控制台替代），显示：

- AudioContext 状态：`running/suspended`
- audioElement 播放状态：`paused/currentTime/duration`
- bus 输出：`rms/peak/bands/energy/isSilent`
- ProjectM 注入：`__projectm_verify.lastAudioRms/Peak/Gain`（你现在已经在 `ProjectMEngine.addAudioData` 写了）

**为什么必须先做：**
你现在靠“看画面”判断音频链路是否正常，误判概率很高；加 diagnostics 后你会很快定位到底是“没播放”还是“数据格式”。

### 3.2 AudioBus：先统一，再谈“自研分析引擎”

建议先做轻量 AudioBus（基于你现有 `StreamAudioProcessor`），把“输出协议”稳定下来：

```ts
export type AudioFrame = {
  timeSec: number;
  sampleRate: number;
  pcm2048Mono: Float32Array;              // 直接来自 analyser（复用缓冲区）
  pcm512Mono: Float32Array;               // 重采样后的稳定缓冲（固定 512）
  pcm512StereoLR: { left: Float32Array; right: Float32Array }; // 给 ProjectM 的最终输入
  bands: { low: number; mid: number; high: number };
  rms: number;
  peak: number;
  energy: number;   // 统一归一化后的 0..1
  isSilent: boolean;
};
```

然后让：

- 背景层只吃 `bands/energy`（以及未来的 beat/onset）。
- ProjectM 只吃 `pcm512StereoLR`。

当你发现 analyser 的稳定性/延迟确实不够，再升级到 AudioWorklet（那时你只是替换 bus 的实现，层和 UI 都不用改）。

### 3.3 融合：用“统一 palette + blend 参数”作为第一阶段答案

你想要的“互相配合”，第一阶段可以用以下最划算的方案实现：

- 引入 `GlobalColorParams`：
  - `baseHue/baseSat/baseLum`（或 palette id）
  - `toneMapStrength` / `contrast`
- 引入 `BlendParams`（作用于 ProjectM overlay）：
  - `opacity`
  - `blendMode`（枚举：add/screen/multiply/normal…）
  - `audioDrivenMix`（是否用 energy 驱动 opacity 或 mix）
- LiquidMetal 支持接受一个 tint/hue 偏移（把“银色背景”变成可以跟 ProjectM 色调靠近）。

第二阶段再做 compositor（真正的 shader 合成），第三阶段再做采样 ProjectM 输出反哺背景。

---

## 4. 代码分割与优化：逐步任务清单（代码级）

> 原则：每一步都能保持现有功能可跑；每步结束用 `npm run verify:dev` 复验（项目里已有脚本）。

### 执行格式约定（你要求的“更细 + 最小 TODO”）

- 每个 Step 都包含两块：
  - **已阅读的相关代码**：列出我已经读过、并且本 Step 会改动/依赖的文件与关键点。
  - **最小 TODO**：只写“最小可落地”的改动清单（checkbox），保证每一步都能独立完成、易验证、可回滚。

### Step 1：抽离 DOM 壳与元素引用（把 main.ts 变薄）

**新增**
- `src/app/renderShell.ts`

**已阅读的相关代码**
- `src/main.ts`：包含 `app.innerHTML = ...`、所有 `document.querySelector(...)`、以及 audio/preset/favorites 的事件绑定（这些都要被拆出去但保持 id 不变）。
- `src/style.css`：依赖 `#viz-canvas`、`.toolbar*`、`.canvas-root` 等 class/id（新壳必须保持 DOM 结构与命名兼容）。

**做什么**
- 把 `app.innerHTML = ...` 与所有 `document.querySelector(...)` 搬到 `renderShell()` 内。
- `renderShell()` 返回一个 `DomRefs` 对象（强类型），后续模块都拿这个引用，不再自己 query。

**最小 TODO**
- [ ] 新增 `src/app/renderShell.ts`：`export type DomRefs = {...}` + `export function renderShell(app: HTMLElement): DomRefs`
- [ ] 把 `src/main.ts` 的 HTML 模板搬到 `renderShell()`，并确保保留现有 id/class（例如 `#viz-canvas`、`#audio-toggle`、`#preset-select`）
- [ ] 把 `src/main.ts` 的所有 query 迁移为 `const dom = renderShell(app)` 的字段引用（不改变现有逻辑顺序）

**结果**
- `main.ts` 不再包含大片 HTML 字符串与 query 代码。

---

### Step 2：建立可序列化的全局视觉状态模型（VisualState）

**新增**
- `src/types/visualState.ts`
- `src/state/VisualStateStore.ts`

**已阅读的相关代码**
- `src/main.ts`：`FavoriteVisualState`（收藏结构）、`applyRandomVisualState()`（随机逻辑）、`computeEnergyCoefficient()`（能量系数）、localStorage 读写与 favorites 面板。
- `src/layers/ProjectMLayer.ts`：目前可控参数主要是 `opacity` 与 preset 切换（后续会扩展到 blend/color 统一）。
- `src/layers/LiquidMetalLayerV2.ts`：目前参数入口是 `params + updateParams()`（这是 state 应用的关键落点）。
- `src/ui/LiquidMetalControlPanel.ts`：直接读写 `layer.params`（后续需要改成走“稳定 API/Store”以支持全局收藏/随机）。

**核心结构（示例）**
- `VisualState`（可 JSON）：
  - `global`: `seed`, `palette`, `energyScale`
  - `liquidMetal`: `LiquidMetalParams`
  - `projectm`: `{ presetId|null, presetUrl|null, opacity, blendMode, colorize? }`

**迁移**
- 把 `FavoriteVisualState`（目前在 `main.ts`）升级为 `VisualState`。
- 收藏/随机都围绕 `VisualStateStore` 做：`randomize()` / `serialize()` / `apply(state)`。

**最小 TODO**
- [ ] 新增 `src/types/visualState.ts`：定义 `VisualStateV1`（必须 JSON-safe）+ `type VisualState = VisualStateV1`
- [ ] 新增 `src/state/VisualStateStore.ts`：实现 `getSnapshot()` / `applyPartial(patch)` / `replace(next)`（不直接依赖 DOM/three）
- [ ] 把 `src/main.ts` 的 favorites 存储从 `FavoriteVisualState` 迁移到 `VisualStateV1`（保留兼容：读取旧结构时转换）
- [ ] 定义“状态应用的单一入口”：`applyVisualState(state)`（暂时仍在 main/boot 内，后续会进 controller）

---

### Step 3：参数 Schema（为“全参数 UI + 随机策略”打底）

**新增**
- `src/state/paramSchema.ts`

**已阅读的相关代码**
- `src/layers/LiquidMetalLayerV2.ts`：参数全集与 `updateParams()`（参数→uniform 的唯一落点）。
- `src/main.ts`：随机逻辑目前是 `randomInRange()` + `applyRandomVisualState()`（散落，难扩展/复现）。
- `src/ui/LiquidMetalControlPanel.ts`：目前是手写 UI 控件，无法自动扩展到 ProjectM/blend/global。

**提供能力**
- `ParamSchema<T>`：为每个参数定义 `min/max/step/default/label/group/random()`。
- `randomizeBySchema(schema, state, rng)`：统一随机，不再在 `main.ts` 里手写 `randomInRange`。

**落地**
- 给 `LiquidMetalParams` 建 schema（你现有参数先全覆盖）。
- 给 `BlendParams/ProjectMParams` 建 schema。

**最小 TODO**
- [ ] 新增 `src/state/paramSchema.ts`：定义 `NumberParam/BoolParam/EnumParam` 与 `applyRandom(schema, state, rng)`
- [ ] 设计可复现随机：`VisualState.global.seed` + `SeededRng`（让“一键随机”可复现/可收藏）
- [ ] 新增 `LiquidMetalParamSchema`（覆盖所有 `LiquidMetalParams` 字段；随机范围可先按你 UI slider 的 min/max）
- [ ] 新增 `ProjectMBlendSchema`（至少：`opacity`、`blendMode`、`audioDrivenMix`）

---

### Step 4：实现 AudioBus（统一音频数据链路，解决“响应怪/ProjectM 吃不到”）

**新增**
- `src/audio/AudioBus.ts`

**已阅读的相关代码**
- `src/audio/StreamAudioProcessor.ts`：`getAnalysisData()`、`calculateBands()`、AudioContext/MediaElement 生命周期与 autoplay 相关处理。
- `src/audio/AudioController.ts`：当前 RAF 分发模型（AudioBus 要么替代它、要么包裹它）。
- `src/main.ts`：`audioController.onFrame((data) => { projectLayer.addAudioData(data.pcm); liquidLayer.setAudioBands(data.bands); currentEnergyLevel = computeEnergyCoefficient(...) })`
- `src/layers/LiquidMetalLayerV2.ts`：只吃 `AudioBands`（直接写 uniforms，无平滑）。
- `src/layers/ProjectMLayer.ts`：`addAudioData(pcm)` 只是转发给 engine。
- `src/projectm/ProjectMEngine.ts`：音频注入核心在 `addAudioData()`（重采样+增益+clip），render 时写 `audioLeft/audioRight` 到 heap，再 `pm_render_frame(instance,left,right,samples,time)`。
- `scripts/wasm-sig.cjs`：可以在本地直接读取 `projectm.wasm` 的 exports+type section，打印函数签名（用于确认 `pm_render_frame` 的真实参数类型）。

**做什么**
- 内部持有一个 `StreamAudioProcessor`（复用你现有实现）。
- 在 RAF 或 `setInterval` 内拉取 `getAnalysisData()`，产出 `AudioFrame`：
  - 计算统一 `energy`（把你现在 `computeEnergyCoefficient` 合并进来）
  - 生成 `pcm512Mono` + `pcm512StereoLR`（重采样 + 归一化策略集中在这里）
- API：
  - `subscribe((frame) => void): () => void`
  - `getSnapshot(): AudioFrame | null`
  - `loadFile/loadUrl/play/pause/toggle/setVolume...`（或通过组合把现有 AudioController 融入）

#### 4.0 先“确认事实”：WASM 导出/签名要用工具跑一遍（避免盲改）

你现在的 `ProjectMEngine` 已经写了 “signature from wasm exports” 的注释，但长期看必须把它变成可重复的校验步骤（否则后续换 wasm 版本会踩雷）。

**最小 TODO**
- [ ] 运行签名检查：`node scripts/wasm-sig.cjs public/projectm-runtime/projectm.wasm`
- [ ] 记录输出到文档/注释里（至少 `pm_render_frame/pm_resize/pm_create_default/pm_load_preset`）
- [ ] 如果签名与 `ProjectMEngine` 中的 `cwrap(...argTypes)` 不一致：先修正 `ProjectMEngine` 的 `cwrap` 类型映射，再做 AudioBus（避免“你以为喂进去了，其实 wasm 当成垃圾读了”）

**已确认的签名（来自 `scripts/wasm-sig.cjs` 的实际输出）**

> 这份输出建议贴到 `src/projectm/ProjectMEngine.ts` 顶部注释里，作为“WASM 协议锁定”的依据。

```txt
pm_create_default: (i32, i32) -> (i32)
pm_destroy:        (i32) -> ()
pm_resize:         (i32, i32, i32) -> ()
pm_render_frame:   (i32, i32, i32, i32, f64) -> ()
pm_load_preset:    (i32, i32, i32) -> (i32)
pm_update_params:  (i32, i32) -> ()
```

**与当前 `ProjectMEngine` 的对应关系（已读 `src/projectm/ProjectMEngine.ts`）**

- `createFn = cwrap('pm_create_default', 'number', ['number','number'])`：匹配 `(i32,i32)->i32`
- `destroyFn = cwrap('pm_destroy', null, ['number'])`：匹配 `(i32)->()`
- `resizeFn = cwrap('pm_resize', null, ['number','number','number'])`：匹配 `(i32,i32,i32)->()`
- `renderFn = cwrap('pm_render_frame', null, ['number','number','number','number','number'])`
  - 最后一个参数在 wasm 里是 `f64`，但在 Emscripten 的 `cwrap` 里仍用 `number` 传入 JS number（关键是 **传入的是“秒（float）”**，不要误传毫秒或被隐式取整）
- `loadPresetFn = cwrap('pm_load_preset', 'number', ['number','number','number'])`：匹配 `(i32,i32,i32)->i32`

#### 4.1 AudioBus 输出协议（AudioFrame v1：只增不减）

AudioBus 的第一要务不是“算法多”，而是“**协议稳定**”：未来你升级 AudioWorklet 或加 beat/onset，不要逼着所有 layer/UI 都改。

建议 v1 先定这些字段（后续新增字段即可）：

```ts
export type AudioFrame = {
  version: 1;
  timeSec: number;
  sampleRate: number;

  pcm2048Mono: Float32Array;             // 来自 analyser（复用缓冲）
  pcm512Mono: Float32Array;              // 统一长度（为了 ProjectM / 统一特征）
  pcm512StereoLR: { left: Float32Array; right: Float32Array }; // 给 ProjectM 的最终输入（与当前 engine 形态一致）

  bands: { low: number; mid: number; high: number };
  rms: number;
  peak: number;
  energy: number; // 统一的 0..1 控制信号（跨算法协同的核心）
  isSilent: boolean;
};
```

关键点：
- `pcm512Mono` 是“统一采样点”的中间层（便于后续做 beat/flux 等）。
- `pcm512StereoLR` 是给 ProjectM 的最终形态（与 `ProjectMEngine.render(leftPtr,rightPtr,...)` 对齐）。

#### 4.2 AudioBus 内部 pipeline（让“响应不怪”）

把音频特征拆成两类，并在 bus 内统一它们的归一化/平滑：

1) **控制信号**（驱动背景/融合/全局状态）
   - `bands/energy` 必须做 attack/release 平滑，否则视觉抖动很明显。
   - 需要慢速自适应增益（不同曲子差异巨大，不统一就会“这首爆炸那首没反应”）。
2) **ProjectM PCM**（驱动 ProjectM）
   - 需要固定长度与幅度稳定，但不宜过度失真（你当前 engine 的 `tanh + auto-gain` 可能会让某些曲子“怪”）。

建议 AudioBus 支持两套 profile（暴露到控制台里，方便你调出“好看的那套”）：
- `clean`：轻微归一化 + 平滑（尽量不失真）
- `punchy`：pre-emphasis + 更强的 transient（保留 softclip，但强度可调）

**最小 TODO**
- [ ] 在 `AudioBus` 内实现 `resampleTo512(pcm2048Mono) -> Float32Array(512)`
- [ ] 在 `AudioBus` 内实现 `computeBands(frequencyBuffer) -> low/mid/high` 并对 band 做 `attack/release smoothing`
- [ ] 在 `AudioBus` 内实现 `computeEnergy({peak,rms,bands}) -> 0..1` 并做平滑（取代 `main.ts computeEnergyCoefficient`）
- [ ] 在 `AudioBus` 内实现 `makeStereoLR(pcm512Mono, profile) -> {left,right}`（先简单 L=R）
- [ ] 输出 `AudioFrame` 并支持 `getSnapshot()`（给 Diagnostics/控制台）

#### 4.2.1（关键）把“音频预处理参数”纳入可控参数体系（为你后续控制台/一键随机收藏服务）

你当前的音频预处理（pre-emphasis/auto-gain/softclip）在 `src/projectm/ProjectMEngine.ts:addAudioData()` 内部是“硬编码常量”：

- `a = 0.97`（pre-emphasis）
- `targetRms = 0.22`（auto-gain 目标）
- `gain clamp: 0.8..6.0`
- `drive = peak < 0.2 ? 1.8 : 1.2`（softclip 驱动）

这会直接导致两个问题：

1) 你很难判断“ProjectM 响应怪”到底是**算法本身**还是**预处理参数不合适**。
2) 你想要“所有算法变量参数都暴露在前端 + 一键随机/收藏”，这类预处理参数必须也进入 `ParamSchema/VisualState`，否则你永远缺一块。

建议把这些参数迁移到 AudioBus，并纳入 `VisualState.audio`：

```ts
type AudioProcessingProfile = 'clean' | 'punchy';

type AudioProcessingParams = {
  profile: AudioProcessingProfile;
  preEmphasis: number;      // 0..0.99
  targetRms: number;        // 0..0.5
  gainMin: number;          // 0..2
  gainMax: number;          // 1..12
  softClipDrive: number;    // 0.5..3
  bandAttack: number;       // 0..1
  bandRelease: number;      // 0..1
  energyAttack: number;     // 0..1
  energyRelease: number;    // 0..1
};
```

**最小 TODO**
- [ ] `VisualState` 新增 `audio: AudioProcessingParams`（先只做 profile + 3~4 个关键参数也可以）
- [ ] `ParamSchema` 添加 `AudioProcessingSchema`（让 random/收藏覆盖音频预处理）
- [ ] `ProjectMEngine` 逐步“瘦身”：由 `AudioBus` 输出 `pcm512StereoLR` 后，engine 只负责“写 heap + 调 wasm”，不再做重采样/增益/clip

#### 4.3 把“ProjectM 喂音频是否成功”变成可观测

当前 `ProjectMEngine.addAudioData()` 已写入 `globalThis.__projectm_verify.lastAudioRms/Peak/Gain`，但链路仍是“分散各处”。AudioBus 做完后应该把这些诊断集中到控制台面板里，快速判断：

- audio 是否在播放
- energy/bands 是否合理
- ProjectM 是否收到非零 audio（lastAudioRms/Peak 是否变化）

**最小 TODO**
- [ ] 约定 `ProjectMLayer.setAudioFrame(frame)` 只吃 `frame.pcm512StereoLR`
- [ ] 将 `ProjectMEngine.addAudioData(pcm2048Mono)` 逐步改为 `setAudioPcm512StereoLR(left,right)`（或 `setAudioFrame(frame)`）
- [ ] Diagnostics 面板显示：`AudioFrame.rms/peak/energy` + `__projectm_verify.lastAudioRms/Peak/Gain/framesRendered`

**迁移**
- `main.ts` 不再直接 `audioController.onFrame(...)` 分发给各层，而是：
  - `audioBus.subscribe(frame => liquidLayer.setAudio(frame))`
  - `audioBus.subscribe(frame => projectLayer.setAudio(frame))`

#### 4.4（你要的“统一全局 bus”形态）AudioBus 不只是音频：它要成为“视觉控制信号总线”

你说“是不是应该自己做一个音频分析引擎来喂这个程序所需要的所有参数？做一个统一的全局 bus？”

答案是：**先把“全局 bus 的输出协议”设计成“可扩展的控制信号集合”，你就已经在做这个事情了**。AudioBus v1 可以先只做：

- `bands/energy`
- `pcm512StereoLR`

但接口层面要为后续留钩子（不破坏订阅者）：

```ts
type AudioFeatures = {
  bands: { low: number; mid: number; high: number };
  energy: number;
  beat?: { confidence: number; bpm?: number; phase?: number }; // 预留
  onset?: number;                                              // 预留
};
```

后续你升级到 AudioWorklet 或加 beat tracker，只需要：

- AudioBus 内部新增 feature
- layer/控制台“选择性消费”新字段

而不是全项目大改。

---

### Step 5：让 Layer 只吃“稳定输入”，不吃临时变量

**修改**
- `src/layers/LiquidMetalLayerV2.ts`
  - 提供 `setAudio(frameOrBands)`：建议直接吃 `AudioFrame`（只用它的 bands/energy）。
  - 增加 `setColorParams(globalColor)`：接入 palette/tint。
- `src/layers/ProjectMLayer.ts`
  - 提供 `setAudio(frame)`：只用 `frame.pcm512StereoLR`。
  - 提供 `setBlendParams(params)`：blendMode/opacity/audioDrivenMix。

**已阅读的相关代码**
- `src/layers/LiquidMetalLayerV2.ts`：当前 `setAudioBands(bands)` + `update()` 直接写 `uAudioBass/Mid/High`，缺少平滑与统一归一化；同时 fragment shader 中 palette 固定为银色系（后续要能接入全局色彩）。
- `src/layers/ProjectMLayer.ts`：当前 `MeshBasicMaterial + AdditiveBlending`，只支持 `opacity`；`addAudioData()` 直接转发给 engine。
- `src/projectm/ProjectMEngine.ts`：当前最终喂给 wasm 的是 `audioLeft/audioRight` + `samplesPerChannel=512`。

**目标**
- `main.ts` 不再拼装“audio bands → layer”，而是传 `AudioFrame`/`VisualState`。

**最小 TODO**
- [ ] `LiquidMetalLayerV2` 新增 `setAudioFrame(frame: AudioFrame)`（内部只保存/消费 `frame.bands/energy`）
- [ ] `LiquidMetalLayerV2` 新增 `setGlobalColor(state: GlobalColorState)`（先做 `uTintColor/uTintStrength` 最小闭环）
- [ ] `ProjectMLayer` 新增 `setAudioFrame(frame: AudioFrame)`（内部调用 engine 的新 audio API）
- [ ] `ProjectMLayer` 新增 `setBlendParams(blend)`（先支持 opacity + blendMode 枚举；后续可升级 shader 合成）

---

### Step 6：收藏/随机从 main.ts 拆成 Favorites Feature

**新增**
- `src/features/favorites/FavoritesStore.ts`：只管 localStorage（key、JSON、版本迁移）。
- `src/features/favorites/FavoritesPanel.ts`：只管 DOM 面板渲染与交互。

**已阅读的相关代码**
- `src/main.ts`：favorites 的 localStorage key（`newliveweb:favorites:v1`）、面板 DOM 构造、apply 逻辑目前直接改 `liquidLayer.params` + `projectLayer.setOpacity()`。

**迁移**
- 把 `ensureFavoritesPanel/refreshFavoritesPanel/applyFavoriteVisualState` 从 `main.ts` 搬走。
- Favorites 存储对象统一为 `VisualState`（而不是“局部字段拼接”）。

**最小 TODO**
- [ ] 新增 `FavoritesStore`：`list()/add(state)/remove(id)/clear()`（内部做 JSON 版本迁移）
- [ ] 新增 `FavoritesPanel`：只依赖 `FavoritesStore` + `onApply(state)` 回调；不直接 import three/layer
- [ ] 把 `main.ts` 中 “收藏当前状态” 改为：从 `VisualStateStore.getSnapshot()` 获取完整状态并存储
- [ ] 把 “应用收藏” 改为：调用单一入口 `applyVisualState(state)`（不要在 UI 层直接改 layer 字段）

---

### Step 7：预设（preset/library/auto-cycle）从 main.ts 拆成 Presets Feature

**新增**
- `src/features/presets/PresetRegistry.ts`：把 `config/presets.ts` 的全局可变集合改成实例。
- `src/features/presets/PresetController.ts`：管理当前 preset、auto-cycle、错误处理、broken 标记。

**已阅读的相关代码**
- `src/main.ts`：library select、`loadLibraryManifest`、auto-cycle timer、broken preset 刷新 UI 等逻辑。
- `src/config/presets.ts`：`runtimePresets` 与 `badPresetIds` 为模块级状态（不利于测试/复用）。
- `src/lib/loadManifest.ts` / `src/config/presetManifest.ts` / `src/config/presetLibraries.ts`：manifest 加载与过滤 `requireWasmSafe`。

**迁移**
- `main.ts` 只负责把 UI 事件交给 controller（controller 再调用 `ProjectMLayer`）。

**最小 TODO**
- [ ] 新增 `PresetRegistry` 类：替代 `config/presets.ts` 的模块级状态（先保留旧函数作为 wrapper，逐步迁移）
- [ ] 新增 `PresetController`：封装 `reloadLibraryPresets/cycleToNextPreset/scheduleAutoCycle/markBroken` 等
- [ ] Controller 对外只暴露：`attach(domRefs)` / `dispose()` / `setProjectmLayer(layer)`（减少 main.ts 直接操作）

---

### Step 8：做一个“临时 Diagnostics 面板”（为排 bug 提速）

**新增**
- `src/features/console/DiagnosticsPanel.ts`

**已阅读的相关代码**
- `src/projectm/ProjectMEngine.ts`：写入了 `globalThis.__projectm_verify`（framesRendered/lastAudioRms/Peak/Gain 等）。
- `src/audio/StreamAudioProcessor.ts`：可提供 AudioContext 状态、rms/peak、currentTime 等诊断数据基础。
- `src/main.ts`：目前没有统一 diagnostics UI，导致“ProjectM 吃不到音频”只能靠目测误判。

**内容**
- 显示 AudioBus snapshot（rms/peak/bands/energy/isSilent）
- 显示 `__projectm_verify.*`（lastAudioRms/Peak/Gain/framesRendered）
- 显示当前 VisualState（简版 JSON 预览）

> 这个面板之后会被你“更集成化控制台界面”替换，但现在它能极大提升调参/排错效率。

**最小 TODO**
- [ ] 新增 `DiagnosticsPanel`：只读展示 + 可折叠（默认不遮挡画面）
- [ ] 接入 `audioBus.getSnapshot()`（显示 rms/peak/energy/bands 与 profile）
- [ ] 接入 `globalThis.__projectm_verify`（容错：不存在不报错）
- [ ] 显示 AudioContext 状态（running/suspended）与当前音频源信息（file/url/element）

---

### Step 9：融合策略第一版（可调 blend）

**已阅读的相关代码**
- `src/SceneManager.ts`：renderer 未显式设置 `outputColorSpace/toneMapping`（层之间色彩体系可能不一致，影响“融合观感”）。
- `src/layers/ProjectMLayer.ts`：目前固定 `THREE.AdditiveBlending`；texture 已设置 `SRGBColorSpace`。
- `src/layers/LiquidMetalLayerV2.ts`：shader 内部 palette 写死为银色系，且没有全局 tint/色相/对比度入口。
- 参考实现：`src/layers/LiquidMetalLayer.ts`（未在入口使用）已经有 palette uniforms + audio 平滑思路，可复用设计但不直接复用文件。

**修改**
- `src/layers/ProjectMLayer.ts`：
  - 把 `MeshBasicMaterial` 的 blending 从固定 `AdditiveBlending` 改为“可配置”：
    - `normal/add/screen/multiply`（Three 的 blending 或 CustomBlending 的组合）
  - 增加 `mix`/`opacity` 与 `energy->opacity` 的映射（用 AudioFrame.energy）。

**修改**
- `src/layers/LiquidMetalLayerV2.ts`：
  - 增加 `uTint/uHueShift/uContrast`（或更简单：`uTintColor`）让背景能“往 ProjectM 色调靠”。

**UI**
- 在控制台面板先加几个 slider（后续再统一为 schema 自动生成）。

#### 9.0 统一色彩空间（先把“底层一致”打齐）

这一步是“融合看起来对不对”的基础：如果 renderer 输出色彩空间与纹理输入色彩空间不一致，你再怎么调 blend 都会显得脏/灰/割裂。

**最小 TODO**
- [ ] 在 `SceneManager` 明确设置 renderer color management（例如 `renderer.outputColorSpace = THREE.SRGBColorSpace`，tone mapping 先固定一种策略）
- [ ] 明确 ProjectM texture 的 `colorSpace`（目前已是 `SRGBColorSpace`，保持一致）
- [ ] 在 Diagnostics 中显示这些关键配置（输出色彩空间/tonemapping），避免以后改回去不自知

#### 9.1 统一色彩：GlobalColorState（让两层“共享一套调色逻辑”）

定义一个全局色彩状态（挂在 `VisualState.global` 或单独 `ColorBus`），最小字段建议：

- `paletteId`（内置几套：silver/neon/amber/ice 等）
- `hueShift`（-180..180）
- `saturation`（0..2）
- `contrast`（0..2）
- `backgroundTintStrength`（0..1）
- `projectmTintStrength`（0..1）

消费方式（第一版只做“低成本 + 高收益”）：
- LiquidMetal：增加 `uTintColor/uTintStrength/uContrast`，用简单的颜色混合/对比度调整即可
- ProjectM：先在 three 侧做 tint（必要时从 `MeshBasicMaterial` 升级为 `ShaderMaterial` 做更可控的 color grading）

#### 9.2 融合策略：从“纯加法叠加”升级到“可控混合”

第一版只追求 3 件事：
1) blendMode 可切换（add/screen/multiply/normal）
2) opacity/mix 可调（并可用 `AudioFrame.energy` 驱动）
3) 颜色能同向变化（统一 palette/tint），让“互相配合”立刻可见

**最小 TODO**
- [ ] 为 ProjectM overlay 增加 `BlendParams`（至少：`blendMode` + `opacity` + `audioDrivenOpacity`）
- [ ] 在 ProjectMLayer 提供 `setBlendParams()`，并在 `update()` 中用 `AudioFrame.energy` 做可控映射（例如 `opacity = base + energy * amount`）
- [ ] 在 LiquidMetal 增加 `setGlobalColor()` 与 shader uniforms（先不动算法主体）
- [ ] 把这些参数接入 `ParamSchema`（让“一键随机/收藏”覆盖它们）

#### 9.3 “互相影响”的最小闭环：采样 ProjectM 输出 → 反哺背景（可选，但很像你想要的效果）

不把 ProjectM 算法硬塞进背景，而是做一个低频率的统计反馈（风险小、效果强）：

- 每秒 2~10 次从 ProjectM canvas 取样少量点（例如 9 点）
- 算 `avgColor/avgLuma`（或简单的亮度/饱和度）
- 反哺到 LiquidMetal 的 tint/brightness/contrast（或 palette 选择）

**最小 TODO**
- [ ] 新增 `ProjectMColorSampler`（或放进 `ProjectMLayer` 内部，先做最小实现）：输出 `avgColor/avgLuma`
- [ ] 在 VisualState 或 ColorBus 中记录这些统计值（只读字段，不参与收藏也行）
- [ ] 将统计值作为调制量叠加到 LiquidMetal 的 `tintStrength/brightness`（强度可调、可一键关）

#### 9.4（关键升级点）为什么“真正的融合（softlight/自定义合成）”需要 Compositor

你现在的结构是“两个 mesh 先后绘制 + blending”。这种方式的限制是：

- 混合公式只受 GPU blending 因子限制，无法实现“softlight/overlay”这类需要同时读取 `src` 和 `dst` 的逐像素公式。
- 你也无法在 ProjectM 的 fragment 中“看到背景颜色”，因此做不到真正的“互相影响”。

所以从工程角度，想要“算法融合/互相影响”最终一定会走到 Compositor：

1) 背景渲染到 `WebGLRenderTarget`（texture A）
2) ProjectM 作为纹理输入（texture B：来自 CanvasTexture）
3) 用一个全屏 `CompositorLayer` 的 `ShaderMaterial` 采样 A/B，执行你想要的合成公式（screen/overlay/softlight/色彩映射/遮罩等）

**最小 TODO（Compositor v1：只做必要最小闭环）**
- [ ] 新增 `src/layers/CompositorLayer.ts`：实现 `Layer`，内部维护 `renderTargetBackground`
- [ ] `SceneManager` 增加“分阶段渲染”能力：先 render 背景到 target，再 render compositor 到屏幕（不需要引入 postprocessing 框架也能做）
- [ ] Compositor shader v1 实现 2~3 种合成模式：`screen`、`add`、`overlay`（并暴露 `mix`）
- [ ] 把 Compositor 的参数挂入 `VisualState` + `ParamSchema`（让“一键随机/收藏”覆盖合成策略）

#### 9.5（落地到你想要的控制台）全参数暴露的最小可维护方式：Schema 驱动 UI

你已经手写了 `LiquidMetalControlPanel`，但未来参数会爆炸增长（背景、ProjectM、融合、音频预处理、palette、seed…）。
继续手写 UI 会变成“改一个参数要改三处（类型、UI、随机/收藏）”。

建议最终让控制台 UI 由 `ParamSchema` 驱动生成：

- schema 是单一事实来源：label/min/max/step/default/random
- UI 只负责把 `onChange` 转成 `VisualStateStore.applyPartial({ ... })`

**最小 TODO**
- [ ] 先为 `AudioProcessingParams`、`BlendParams`、`GlobalColorState` 建 schema（哪怕 UI 先不自动生成，也先把事实集中）
- [ ] 控制台 v1：手写 UI，但所有范围/默认值从 schema 读取（避免重复）
- [ ] 控制台 v2：把 slider/checkbox/select 渲染逻辑抽成 `renderControlsFromSchema(schema, state, onPatch)`

---

### Step 10：入口清理（main.ts → bootstrap）

**新增**
- `src/app/bootstrap.ts`：创建 SceneManager、layers、bus、controllers，统一 dispose。

**已阅读的相关代码**
- `src/main.ts`：当前既负责 DOM 构建又负责 wiring/事件，导致后续做 AudioBus/VisualState/Console 时会越改越乱。
- `src/SceneManager.ts`：已经有明确的生命周期：`addLayer/start/stop/dispose`，适合作为 bootstrap 的核心支点。

**修改**
- `src/main.ts`：只做 `renderShell()` + `bootstrap(domRefs)`。

**最小 TODO**
- [ ] 新增 `src/app/bootstrap.ts`：集中创建 `SceneManager`、`LiquidMetalLayerV2`、`ProjectMLayer`、`AudioBus`、各 controller/panel
- [ ] 在 bootstrap 内集中管理 dispose（`beforeunload`/HMR dispose 都在这里统一）
- [ ] `src/main.ts` 改为：render shell → bootstrap（不再直接 new layer/new controller）

---

## 8.（补充）AudioBus + 统一色彩/融合：关键设计取舍（避免以后返工）

### 8.1 为什么必须先做 AudioBus（而不是继续在各层“各吃各的”）

你要的“互相影响/统一控制台/一键随机收藏”，本质上依赖两条“总线级能力”：

- **统一音频特征**：同一套 `energy/bands/(future beat)` 驱动所有算法，否则永远会出现“背景抖、ProjectM 不跟拍”的分裂体验。
- **统一参数归属**：随机/收藏必须对“全局状态”生效，而不是散在 `main.ts` 的临时变量里。

### 8.2 你的项目里 AudioBus 的最小正确形态

- 单一生产者：基于 `StreamAudioProcessor` 产出 `AudioFrame`
- 多订阅者：LiquidMetal、ProjectM、控制台面板都订阅（或读取 snapshot）
- profile 可切换：至少 `clean/punchy` 两种（让你能快速找到“看起来对”的那一套）
- 指标可见：rms/peak/energy/gain 都能在面板里看到（否则调参靠猜）

### 8.3 为什么“算法融合”先做“合成/颜色/统计反馈”，不要急着“把 ProjectM 算法搬进背景”

- ProjectM 是 WASM 黑盒 + 复杂状态机，把它直接融进背景 shader 的成本极高、且可控性很差。
- 你真正想要的是“风格统一 + 互相影响的体感”，最划算路径是：
  1) 统一音频特征（AudioBus）
  2) 统一色彩体系（GlobalColorState）
  3) 统一合成策略（blend 可调）
  4) 再加“统计反馈”（ProjectM → 背景）实现互相影响


## 5. 你问的“更高阶思考”：要不要把 ProjectM 算法应用进背景？

建议分两层回答：

1) **短期（推荐）**：不要把 ProjectM 的“算法”直接搬进背景（WASM 内部难以复用、参数体系也完全不同）。
   - 先统一：音频特征、palette、融合策略、能量/节拍驱动。
   - 你会立刻得到“互相配合”的体感提升，而且工程风险低。

2) **中期（可行）**：可以做“ProjectM 输出 → 背景输入”的桥接，而不是“算法合并”：
   - 低频率（比如 2~10Hz）从 ProjectM canvas 采样少量像素，算出 `avgColor/brightness/contrast`。
   - 把这些统计值作为 `LiquidMetal` 的 tint/brightness 的调制信号。
   - 这会让两层颜色与节奏更像“同一个系统”。

---

## 6. 你问的“要不要自研音频分析引擎（统一全局 bus）？”

建议路线：

- **先做统一 AudioBus（基于现有 AnalyserNode）**：把“数据协议与归一化策略”稳定下来。
- 只有当你明确遇到这些问题时，才升级 AudioWorklet：
  - 需要更低延迟、更稳定的 beat/onset
  - 需要真实立体声分离（L/R 独立特征）
  - 需要更复杂特征（谱通量、节拍跟踪、调性/和弦估计等）

换句话说：**先定义总线输出协议，再决定总线内部实现**。这才是“保留更新空间”的工程化做法。

---

## 7. 验证与回归（每步怎么确认没把东西搞坏）

- 开发验证：`npm run dev` 后看 Diagnostics：
  - AudioContext 是否 running
  - rms/peak/energy 是否随音乐变化
  - `__projectm_verify.lastAudioRms` 是否非 0
- 自动验证：用项目现有脚本 `npm run verify:dev` 生成 `artifacts/headless/*`。
  - 注意：headless 环境可能因为 autoplay/权限导致音频不播放，不能把“无音频响应”当成必失败条件；更应该看“渲染是否稳定 + ProjectM 是否初始化”。

---

## 9. 最小 TODO 总表（逐步可提交 / 每步可回滚）

> 目的：把上面的 Step 1~10（以及“互相影响/融合”的新增全局约束）拆成**最小可验证**的 TODO。
>
> 原则：
> - 每个小 TODO 都应该能独立提交，失败可回滚。
> - 每个小 TODO 都对应一个可观察的结果（UI/日志/Headless artifacts）。

### 9.0 全局约束（互相影响/融合必须遵守）

**数据流（硬约束）**
- [ ] 约定所有“跨层共享信号”只来自 `AudioBus` 与 `VisualStateStore`（Layer 之间不互相 import，不直接调用彼此方法）
- [ ] 约定 Layer 对外只暴露“稳定输入口”：`setAudioFrame()` / `setGlobalColor()` / `setBlendParams()`（不暴露可变内部对象引用）
- [ ] 约定“互相影响”分 3 层推进：共享控制信号 → 参数耦合 → 像素级反馈（Compositor/采样统计），并在 README/计划中明确这是阶段性路线

**融合语义（硬约束）**
- [ ] 固定合成顺序：背景先画（dst），ProjectM 作为 overlay（src）后画；`blendMode` 的定义必须以此为准
- [ ] 明确 `opacity/mix` 的语义：`opacity` 永远是 ProjectM overlay 的强度；后续引入 Compositor 时保持语义不变

**色彩空间（硬约束）**
- [ ] `SceneManager` 明确设置 renderer 的 color management（outputColorSpace / toneMapping）并在 Diagnostics 显示这些值
- [ ] ProjectM texture 颜色空间保持一致（当前已设置 SRGBColorSpace；后续如引入 Compositor，需要明确 A/B 两个输入的颜色空间）

---

### Step 1：抽离 DOM 壳与元素引用（把 main.ts 变薄）

**最小 TODO（更细拆分）**
- [ ] 新增 `src/app/renderShell.ts`：只包含 `renderShell(app)` 与 `DomRefs` 类型（先不引入任何业务逻辑）
- [ ] 将 `main.ts` 的 HTML 模板整体搬迁到 `renderShell()`（不改 id/class，不改层级结构）
- [ ] 在 `renderShell()` 内只做 query：把所有 `document.querySelector` 迁移到 `DomRefs` 字段（先不改事件逻辑）
- [ ] `main.ts` 替换为：`const dom = renderShell(app)`，并用 `dom.xxx` 替代原本的 query（保持行为不变）
- [ ] 验证：`npm run dev` 页面能正常打开、按钮/选择框仍可用；`node scripts/headless-verify.mjs` 仍能找到 `#viz-canvas`

---

### Step 2：建立可序列化的全局视觉状态模型（VisualState）

**最小 TODO（更细拆分）**
- [ ] 新增 `src/types/visualState.ts`：定义 `VisualStateV1`（JSON-safe：不包含函数/类/Float32Array/THREE 对象）
- [ ] 定义 `VisualStateV1` 的最小字段集（先能覆盖当前已存在的“收藏/随机/层参数/preset”即可）
- [ ] 新增 `src/state/VisualStateStore.ts`：实现 `getSnapshot()`（只读）、`replace(next)`、`applyPartial(patch)`
- [ ] `main.ts` 增加一个临时函数 `applyVisualState(state)`：集中把 state 应用到现有 layer/controller（先放在 main，后续进 bootstrap/controller）
- [ ] 兼容迁移：读取旧 favorites 结构时做转换到 `VisualStateV1`（写回时统一写新版本）
- [ ] 验证：收藏/应用收藏仍工作；刷新页面后 state 可恢复（至少 favorites 能恢复）

---

### Step 3：参数 Schema（为“全参数 UI + 随机策略”打底）

**最小 TODO（更细拆分）**
- [ ] 新增 `src/state/paramSchema.ts`：定义最小 `NumberParam/BoolParam/EnumParam`
- [ ] 新增 `src/state/seededRng.ts`（或同文件）：实现可复现 RNG（仅需 `nextFloat()`）
- [ ] 为 `LiquidMetalParams` 建立 schema（先覆盖现有 UI 已暴露的字段；未暴露字段可以先填 default，不做随机）
- [ ] 为 `ProjectM` 最小参数建 schema：`opacity`、`blendMode`、`audioDrivenOpacity`（先占位，后续扩展）
- [ ] 写一个纯函数：`randomizeVisualStateBySchema(state, seed)`（返回新 state，不直接改 layer）
- [ ] 验证：点击“一键随机”能产生可复现结果（相同 seed → 相同 state）

---

### Step 4：实现 AudioBus（统一音频数据链路）

**4.0（先确认事实）WASM 协议锁定**
- [ ] 运行 `node scripts/wasm-sig.cjs public/projectm-runtime/projectm.wasm` 并把输出复制到 `ProjectMEngine.ts` 顶部注释
- [ ] 校验 `pm_render_frame/pm_resize/pm_create_default/pm_load_preset` 的 `cwrap` argTypes 与签名一致（尤其最后一个 `f64 timeSeconds`）
- [ ] 验证：加载 preset、渲染不回退、不出现异常 abort

**4.1 定义 AudioFrame v1（协议先稳定）**
- [ ] 新增 `src/types/audioFrame.ts`：定义 `AudioFrame`（version=1，字段只增不减）
- [ ] 明确内存复用策略：`pcm2048Mono` 可复用内部缓冲；`pcm512Mono/pcm512StereoLR` 建议复用并只在 bus 内更新内容

**4.2 AudioBus 最小实现（复用现有 StreamAudioProcessor）**
- [ ] 新增 `src/audio/AudioBus.ts`：内部持有 `StreamAudioProcessor`
- [ ] 实现 `subscribe(cb): unsubscribe` + `getSnapshot()`
- [ ] 实现 `tick()`：读取 `getAnalysisData()`，计算 `rms/peak/bands/energy`（先用简单平滑，参数后续进 schema）
- [ ] 实现 `resampleTo512(pcm2048Mono)`（最小可用：线性采样/步进采样均可，要求稳定输出 512）
- [ ] 生成 `pcm512StereoLR`（最小：L=R=pcm512Mono；先不做复杂 punchy profile）
- [ ] 决定驱动方式：先用 RAF（与现有渲染帧同步），后续再考虑 setInterval/AudioWorklet

**4.3 把“喂 ProjectM 是否成功”变可观测**
- [ ] 约定 `ProjectMLayer.setAudioFrame(frame)` 只吃 `frame.pcm512StereoLR`
- [ ] 逐步瘦身 `ProjectMEngine.addAudioData()`：最终变成 `setAudioPcm512Stereo(left,right)`（engine 不再做重采样/AGC）
- [ ] 在 `globalThis.__projectm_verify` 里记录 `lastAudioRms/Peak` 与 `framesRendered`（已存在则确认字段一致）

**4.4 验证**
- [ ] Dev：点击页面后 AudioContext=running；AudioBus snapshot 的 `rms/energy` 变化
- [ ] ProjectM：`__projectm_verify.lastAudioRms` 非 0 且随音乐变化
- [ ] Headless：`node scripts/headless-verify.mjs` 产出稳定 screenshot + 无 pageerror

---

### Step 5：让 Layer 只吃“稳定输入”，不吃临时变量

**最小 TODO（更细拆分）**
- [ ] `LiquidMetalLayerV2` 新增 `setAudioFrame(frame)`（内部只保存 `bands/energy`，不再从 main 传散变量）
- [ ] `ProjectMLayer` 新增 `setAudioFrame(frame)`（内部只使用 `pcm512StereoLR`）
- [ ] 在 `main.ts`（或临时 bootstrap）把分发改为：`audioBus.subscribe(frame => liquidLayer.setAudioFrame(frame))` 与 `audioBus.subscribe(frame => projectLayer.setAudioFrame(frame))`
- [ ] 删除/弃用：`main.ts` 直接 `projectLayer.addAudioData(data.pcm)` 的路径（保留一段时间也行，但要只保留一个入口在跑）
- [ ] 验证：两层仍能跟随音乐变化（至少 energy 驱动的参数变化可见）

---

### Step 6：Favorites Feature（收藏/随机从 main.ts 拆出去）

**最小 TODO（更细拆分）**
- [ ] 新增 `src/features/favorites/FavoritesStore.ts`：只负责 localStorage + 版本迁移
- [ ] 新增 `src/features/favorites/FavoritesPanel.ts`：只负责 DOM 渲染与交互（通过回调 `onApply(state)` 影响外部）
- [ ] 让 Favorites 只存 `VisualStateV1`（不要存 layer 实例/函数）
- [ ] `main.ts` 改为：收藏来自 `visualStateStore.getSnapshot()`；应用收藏调用 `applyVisualState(state)`
- [ ] 验证：收藏/删除/清空/应用仍可用；刷新后仍存在

---

### Step 7：Presets Feature（preset/library/auto-cycle）

**最小 TODO（更细拆分）**
- [ ] 新增 `src/features/presets/PresetRegistry.ts`：把 runtimePresets/badPresetIds 从模块级状态迁移成实例状态
- [ ] 新增 `src/features/presets/PresetController.ts`：封装“切换 preset / auto-cycle / broken 标记 / UI 刷新”
- [ ] Controller 只对外暴露：`attach(domRefs)`、`setProjectmLayer(layer)`、`dispose()`
- [ ] `main.ts` 删除对 `config/presets.ts` 模块级可变集合的直接操作（先做 wrapper 兼容也行）
- [ ] 验证：手动切换 preset + auto-cycle 都正常；坏 preset 能被标记并跳过

---

### Step 8：Diagnostics 面板（为排 bug 提速）

**最小 TODO（更细拆分）**
- [ ] 新增 `src/features/console/DiagnosticsPanel.ts`：只读 UI（可折叠），不改变任何业务状态
- [ ] 展示 AudioBus snapshot：`rms/peak/energy/bands/isSilent` + AudioContext state
- [ ] 展示 ProjectM 注入状态：`globalThis.__projectm_verify.*`（容错：不存在不报错）
- [ ] 展示渲染关键配置：renderer pixelRatio、outputColorSpace、toneMapping（至少把“融合会受影响的配置”变可见）
- [ ] 验证：Diagnostics 不影响帧率（默认折叠），并能稳定显示数据

---

### Step 9：融合策略第一版（可调 blend + 统一色彩）

**9.0 统一底层色彩管理（先把“底层一致”打齐）**
- [ ] `SceneManager` 明确设置 `renderer.outputColorSpace` 与 toneMapping（并在 Diagnostics 显示）
- [ ] 明确 ProjectM texture colorSpace（保持一致）

**9.1 BlendParams（只做最小闭环）**
- [ ] 定义 `BlendParams`（进入 `VisualStateV1.projectm`）：`blendMode` + `opacity` + `audioDrivenOpacity` + `energyToOpacityAmount`
- [ ] `ProjectMLayer.setBlendParams(params)`：把枚举映射到 Three.js blending（normal/add/screen/multiply 先够用）
- [ ] 在 `ProjectMLayer.update()` 中用 `AudioFrame.energy` 调制 overlay opacity（保持可关、可调强度）

**9.2 GlobalColorState（先做“参数耦合”，不做像素级强耦合）**
- [ ] 定义 `GlobalColorState`（进入 `VisualStateV1.global` 或单独字段）：`paletteId/hueShift/sat/contrast`（先选最小子集）
- [ ] `LiquidMetalLayerV2.setGlobalColor(state)`：最小实现只做 `tintColor/tintStrength`（不重写算法）
- [ ] ProjectM 如需 tint：先不改 ProjectM 内部，优先用三侧/Compositor 再做（避免过早复杂化）

**9.3（可选）像素级反馈的最小闭环（强互相影响）**
- [ ] 先做低频统计：每秒 2~5 次从 ProjectM canvas 采样少量像素，计算 `avgLuma/avgColor`
- [ ] 把统计值写入只读状态（不进收藏也行），作为 LiquidMetal 的调制信号（强度可控/可关）

**9.4（后续）Compositor v1（真正融合）**
- [ ] 新增 `CompositorLayer`：背景 renderTarget + ProjectM texture → 合成 shader
- [ ] 合成模式先只做 2~3 个（screen/add/overlay），并保持 `mix/opacity` 语义一致

---

### Step 10：入口清理（main.ts → bootstrap）

**最小 TODO（更细拆分）**
- [ ] 新增 `src/app/bootstrap.ts`：集中创建 SceneManager / layers / AudioBus / controllers / panels
- [ ] `bootstrap()` 返回 `dispose()`，并在 HMR/beforeunload 中统一清理（避免残留 RAF/AudioContext/定时器）
- [ ] `main.ts` 只保留：`renderShell(app)` → `bootstrap(domRefs)`
- [ ] 验证：HMR 不产生重复订阅/重复 RAF；刷新后仍能稳定启动

---

## 10. 执行优先级（P0/P1/P2）与依赖关系（全局视角）

> 目的：从“系统稳定性 + 融合协同 + 可观测性”出发排序。
>
> 关键判断：在你要的“互相影响/融合”里，最容易返工的不是 shader，而是**数据流**与**语义**。
> 所以优先级按“先锁语义/协议/可观测 → 再做融合表现 → 最后拆分与美化”排序。

### 10.1 核心依赖图（先后顺序）

- [ ] 先有“可观测”（Diagnostics）→ 才能判断 AudioBus/ProjectM/融合是否真的生效
- [ ] 先锁定 AudioFrame 协议（AudioBus v1）→ 才能让两层共享同一套控制信号
- [ ] 先锁定 BlendParams 语义（ProjectM overlay 是 src，背景是 dst）→ 才能避免未来上 Compositor 时语义翻车
- [ ] 再做目录/feature 拆分（renderShell/bootstrap/favorites/presets）→ 否则边修 bug 边搬家会拖慢迭代

### 10.2 P0（立刻做，最小闭环：让“融合协同”变成可调 + 可测）

> P0 的定义：做完后你应该能回答三个问题：
> 1) 音频真的在播吗？2) 两层吃到的是同一份控制信号吗？3) 融合强度与模式可控吗？

- [ ] P0-1：Step 8 Diagnostics 面板（至少显示 AudioContext、AudioBus snapshot、__projectm_verify、renderer 色彩关键配置）
- [ ] P0-2：Step 4 AudioBus v1（先稳定协议：bands/energy/pcm512StereoLR；先别追求复杂算法）
- [ ] P0-3：Step 5 输入口统一（两层都吃 `setAudioFrame(frame)`；main 只负责订阅转发，不再散发临时变量）
- [ ] P0-4：Step 9 最小 BlendParams（normal/add/screen/multiply + energy→opacity 可开关/可调强度）
- [ ] P0-5：Step 9 色彩空间底层一致（renderer outputColorSpace/toneMapping 明确化；Diagnostics 显示）

**P0 验收标准（必须满足）**
- [ ] 点击页面后：AudioContext=running；Diagnostics 中 `rms/energy` 会随音乐变化
- [ ] ProjectM：`__projectm_verify.framesRendered` 增长；`lastAudioRms` 非 0 且变化
- [ ] 融合：切换 blendMode/opacity 立刻可见；energy 驱动 opacity 时画面能“跟拍”

### 10.3 P1（结构化拆分：把“可控系统”变成“可维护系统”）

> P1 的定义：在不破坏 P0 行为的前提下，降低 main.ts 的复杂度，并把可变状态集中。

- [ ] P1-1：Step 1 renderShell（先把 DOM/query 从 main.ts 拆出，保证 UI 结构稳定）
- [ ] P1-2：Step 2 VisualState + Store（让“收藏/随机/融合参数/音频参数”有唯一归属）
- [ ] P1-3：Step 3 ParamSchema + SeededRng（让随机/默认值/范围成为单一事实来源）
- [ ] P1-4：Step 6 Favorites Feature（收藏从 main.ts 搬走，但只通过 applyVisualState 影响系统）
- [ ] P1-5：Step 7 Presets Feature（preset/library/auto-cycle 收口成 controller，避免散落状态）

**P1 验收标准**
- [ ] main.ts 不再直接持有“业务状态对象”与大段 DOM 拼装
- [ ] VisualState 是收藏/随机/恢复的唯一对象（JSON-safe）
- [ ] 任何新参数只需要改 schema + state，不需要改三处逻辑

### 10.4 P2（高级互相影响：像素级反馈与真正合成）

> P2 的定义：提升“互相影响”的体感与高级合成能力，但不应影响 P0/P1 的稳定性。

- [ ] P2-1：Step 9.3 低频统计反馈（ProjectM avgColor/avgLuma → 调制背景 tint/contrast；强度可控/可关）
- [ ] P2-2：Step 9.4 Compositor v1（renderTarget + 合成 shader，实现 overlay/softlight-like 等真正融合）
- [ ] P2-3：AudioBus profile 升级（clean/punchy；把预处理参数纳入 VisualState+Schema，便于收藏/随机）

**P2 验收标准**
- [ ] 开启/关闭像素级反馈时，互相影响体感明显但系统稳定（不引入掉帧/闪烁/尺寸错位）
- [ ] 引入 compositor 后 blend 语义不变（opacity/mix 的含义保持一致）


---

## 新添加的全局�ע��（nayer 融合 / 音频链路 / 视觉空间�?

- [ ] **AudioBus �һ化支一本地**：是否：LiquidMetal 只通过 `bands/energy`，ArojectM 只通过 `pcm512StereoLR`；降金排开按照，局层内部无事处�?smooth/gain �?
- [ ] **视觉空间�һ接支**：滟一 `outputColorSpace` + tone mapping；保留当�?PM CanvasTexture �?SRGB，注意外层处理可能出�?double-gamma，则�?Diagnostics 显示关键配置�?
- [ ] **Layer 融合序号/顺序**：压速将背景�?RT 纹理内画，然后再 ProjectM overlay 或者按 compositor shader 采样，否则互相影响不可能完全实现�?
- [ ] **Blend 参数接口全局化。Mchema**：这些参数：`blendMode/opacity/audioDrivenMix/tint/contrast` 拆切�?`VisualState + ParamSchema`，可随机/收藏/回滚�?
- [ ] **PM �� 背景的参考计算化**：洗采样率角 2~10Hz、预览候大小：9-16 点）、降金轮速策略⼌返回值向 LiquidMetal `tint/brightness` 加入一线运动处理，防止用线搭能�?
- [ ] **或供条�：domepositor 开模式开�?**：为 overlay/softlight/色彩映射 展导和通道合并辅助，提前目标：双方；分辆分定运动程序（RT 展）；严�?RT 完成，采用一�?shader 设计；对 RT 分配做标系、箱化外部消息端和采用一侧掩模板生成团乁�?
- [ ] **RNG / 可收藏动�?**：唯一 `seeded RNG` 接口，使随机和蔶藏配璷相同，可退生该值判断是否参与覆盖信息�?
