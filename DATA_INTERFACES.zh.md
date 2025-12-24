# newliveweb 数据接口梳理（“后端数据层”规范，用于驱动 UI 与后续扩展）

> 归档提示：最新权威入口请看 `MASTER_SPEC.zh.md`（本文作为“数据接口专题”保留，后续只追加变更记录）。
> 阅读/写作路由：接口与字段细节写本文；计划写 `INFRASTRUCTURE_PLAN.zh.md`；可执行任务写 `TODOS.zh.md`；全局事实口径以 `DOCS_INDEX.zh.md` → `MASTER_SPEC.zh.md` 为准。

> 目的：在不改动渲染层实现细节的前提下，把“数据接口/总线/存储/状态版本”理顺，让后续 UI（宏观旋钮 + 展开全参数）与功能扩展（可插拔背景、MIDI）都有稳定依赖点。
>
> 说明：本项目目前是前端应用，没有传统意义的服务端后端；本文将“后端”定义为**应用内部的数据层与接口契约**（AudioBus / VisualState / ParamSchema / Presets / Diagnostics / Verify）。

---

## 1. 不变约束（全局工程契约）

- 单一音频源：所有分析/分发只能来自 `AudioBus` 输出的 `AudioFrame`（禁止第二套平滑/增益/能量计算）。
- Layer 边界：`layers/*` 不碰 DOM/localStorage；UI/收藏/随机只通过公开 API 或 store/controller。
- BlendParams 语义冻结：
  - `opacity`：ProjectM overlay 基础强度（base）
  - `audioDrivenOpacity`：是否开启 `base + energy * amount`
  - `energyToOpacityAmount`：能量调制系数
- 颜色管理统一：renderer `outputColorSpace`/`toneMapping` 必须显式化并可诊断。
- 可观测验收：Diagnostics + headless verify 是“真相源”，用于定位“没音频/没动/色偏”。

---

## 2. 音频数据层：AudioBus / AudioFrame

### 2.1 AudioData（内部分析数据）

文件：`src/audio/types.ts`

```ts
export interface AudioData {
  pcm: Float32Array; // analyser 原始 PCM（通常 2048）
  frequency: Uint8Array;
  bands: { low: number; mid: number; high: number };
  peak: number;
  rms: number;
  time: number;
}
```

### 2.2 AudioFrame（对外稳定输出）

文件：`src/types/audioFrame.ts`

```ts
export type AudioFrame = {
  version: 1;
  timeSec: number;
  sampleRate: number;
  pcm2048Mono: Float32Array;
  pcm512Mono: Float32Array;
  pcm512StereoLR: { left: Float32Array; right: Float32Array };
  bands: { low: number; mid: number; high: number };
  rms: number;
  peak: number;
  energyRaw?: number; // optional raw value for diagnostics/debug; may be omitted
  energy: number; // 0..1 clamped, unified control signal
  isSilent: boolean;
};
```

### 2.3 AudioBus 对外接口（“唯一分发源”）

文件：`src/audio/AudioBus.ts`

- 控制：`loadFile/loadUrl/loadInputDevice/play/pause/toggle/setVolume/setLoop/resumeContext/dispose`
- 分发：
  - `onFrame((frame) => void): () => void`
  - `subscribe((frame) => void): () => void`（同义别名）
  - `getSnapshot(): AudioFrame | null`
- 诊断：`audioContextState: AudioContextState | 'uninitialized'`

**稳定性要求**

- `AudioFrame.energy` 的定义必须全局唯一（禁止 UI/Layer 各自再算 energy）。
- 层消费 `AudioFrame`，不得再读 `StreamAudioProcessor`。

---

### 2.4 2025-12-16 补充：本地音频输入（MediaStream）（已落地）

> 目的：让现场可以选择系统音频输入设备（USB mixer / 音频接口等）驱动 `AudioBus`，而不是依赖测试音轨。

- 新增入口：`AudioBus.loadInputDevice(deviceId?)`
  - 内部使用 `navigator.mediaDevices.getUserMedia({ audio })` 获取 `MediaStream`
  - 接入统一分析链路，继续产出稳定 `AudioFrame`（`energyRaw/energy/rms/peak/bands/pcm...`）
- Processor 扩展：`StreamAudioProcessor.loadFromStream(stream, { monitor?: boolean })`
  - 默认 `monitor=false`（避免现场反馈）
  - 切换音源时会 teardown 上一个 stream/source，避免泄漏与重复采集
- UI/诊断：Diagnostics 可显示当前 source 与 input label/deviceId；拒权/无设备时应给出明确提示且不崩溃。

---

## 3. 渲染层数据接口：Layer / SceneManager / RendererInfo

### 3.1 Layer（渲染模块最小接口）

文件：`src/layers/Layer.ts`

```ts
export interface Layer {
  init(scene, renderer): void | Promise<void>;
  update(dt): void;
  dispose(): void;
  onResize?(width, height): void;
}
```

#### 2025-12-23 补充：Layer 运行态读数（只读）

为便于 Diagnostics 展示“运行态 opacity”，补充可选读取接口（不要求所有层实现）：

```ts
export interface Layer {
  getOpacity?(): number; // runtime opacity (after overlay budget)
}
```

### 3.2 SceneManager（renderer 可诊断信息）

文件：`src/SceneManager.ts`

- `getRendererInfo(): { pixelRatio, outputColorSpace, toneMapping }`

**约束**

- `renderer.outputColorSpace` 与 `toneMapping` 必须是显式设置（避免“色偏争论”）。

---

## 4. ProjectM 数据接口（跨所有 preset 一致可控）

### 4.1 ProjectMLayer：音频输入与融合参数

文件：`src/layers/ProjectMLayer.ts`

- 音频输入：`setAudioFrame(frame: AudioFrame)`（目前喂 `pcm2048Mono`）
- 融合：`setBlendParams({ opacity?, blendMode?, audioDrivenOpacity?, energyToOpacityAmount? })`
- 读取快照：`getBlendParams(): { opacity, blendMode, audioDrivenOpacity, energyToOpacityAmount }`

### 4.2 preset 选择（跨引擎一致的“外部接口”）

- `loadPresetFromUrl(url: string)`
- `loadPresetFromData(text: string)`（导入 .milk 文本）

**注意**

- “每个 preset 内部参数（milk per-frame/per-pixel）”目前未做成可控入口；若未来要做，需要解析/参数化/注入或转由 compositor/后处理统一实现。

---

## 5. 背景层数据接口（当前：LiquidMetal；未来：Camera/Video）

### 5.1 LiquidMetalLayerV2：可调参数（当前真实存在）

文件：`src/layers/LiquidMetalLayerV2.ts`

- `LiquidMetalParams`：
  - 动画：`timeScale`、`iterations`、`waveAmplitude`
  - 交互：`mouseInfluence`
  - 质感：`metallicAmount`、`metallicSpeed`
  - 亮度：`brightness`
  - 音频响应：`audioReactive`、`audioSensitivity`
- 音频输入：`setAudioFrame(frame: AudioFrame)`（消费 `bands/energy`）
- 应用参数：`updateParams()`（把 params 写入 uniforms）

### 5.2 背景可插拔（规划接口，后续实现用）

> 这是“后续 UI 与功能升级的基础”。先定接口，不改代码。

```ts
export type BackgroundKind = "liquid" | "camera" | "video";

export type BackgroundModule = {
  kind: BackgroundKind;
  getSchema: () => ParamSchema; // 面板/随机统一来源
  getDefaultParams: () => Record<string, unknown>;
  applyParams: (params: Record<string, unknown>) => void;
  setAudioFrame?: (frame: AudioFrame) => void; // 可选：仅背景需要音频时实现
  dispose: () => void;
};
```

---

## 6. 预设数据层：Presets / Library / Manifest

### 6.1 PresetDescriptor（对 UI 与收藏的稳定格式）

文件：`src/config/presets.ts`

```ts
export type PresetDescriptor = {
  id: string;
  label: string;
  url: string;
  wasmCompat?: WasmCompatInfo;
};
```

### 6.2 preset library 选择（存储与来源）

文件：`src/config/presetLibraries.ts`、`src/features/presets/PresetsController.ts`

- `PresetLibrarySource`: `'full' | 'full-safe' | 'curated' | 'curated-safe'`
- LocalStorage key：`presetLibrarySource`
- manifest：`/presets/**/library-manifest*.json`（由脚本生成）

---

## 7. 状态与持久化：VisualState / Favorites（当前 V1）

> 对齐说明（以代码为准）：当前运行态/收藏态已升级为 `VisualStateV2`（含 `global.macros`、`macroSlots`、`background.type/params`），并在收藏加载时从 V1 自动迁移；本节保留 V1 结构用于历史兼容与迁移参考。V2 的真实定义见 `src/features/visualState/visualStateStore.ts`。

### 7.1 VisualStateV1（当前稳定，已用于收藏/随机/恢复）

文件：`src/features/visualState/visualStateStore.ts`

```ts
export type VisualStateV1 = {
  version: 1;
  global?: { seed: number };
  projectm: {
    presetId: string | null;
    presetUrl: string | null;
    opacity: number;
    blendMode: "normal" | "add" | "screen" | "multiply";
    audioDrivenOpacity: boolean;
    energyToOpacityAmount: number;
  };
  liquidMetal: LiquidMetalParams;
};
```

### 7.2 FavoriteVisualState（收藏条目）

```ts
export type FavoriteVisualState = {
  id: string;
  createdAt: string;
  label: string | null;
  state: VisualStateV1;
};
```

### 7.3 LocalStorage 合约

- Favorites key：`newliveweb:favorites:v1`（见 `src/app/bootstrap.ts`）
- 兼容迁移：`migrateFavorite(raw)` 将旧结构升级为 V1。

**硬约束**

- 收藏与恢复必须只依赖 VisualState（避免“UI 状态 ≠ 收藏状态”）。

---

## 8. 参数定义与随机：ParamSchema / SeededRng（当前实现 + 后续规划）

### 8.1 当前实现（已存在）

文件：`src/state/paramSchema.ts`、`src/state/seededRng.ts`

- `randomizeBlendParams(energy, rng?)`
- `randomizeLiquidMetalParams(energy, rng?)`
- `createSeededRng(seed)`、`createRandomSeed()`

### 8.2 规划：ParamSchema 作为“面板生成 + 随机生成”的唯一来源

当前 `paramSchema.ts` 更像“随机函数集合”。要支持“展开全参数面板”，需要把 schema 变成可枚举结构：

```ts
type ParamId = string; // e.g. "projectm.opacity", "liquid.brightness"

type ParamDef =
  | {
      id: ParamId;
      type: "number";
      min: number;
      max: number;
      step: number;
      default: number;
      group: string;
      advanced?: boolean;
      random?: boolean;
    }
  | {
      id: ParamId;
      type: "bool";
      default: boolean;
      group: string;
      advanced?: boolean;
      random?: boolean;
    }
  | {
      id: ParamId;
      type: "enum";
      values: string[];
      default: string;
      group: string;
      advanced?: boolean;
      random?: boolean;
    };

type ParamSchema = { params: ParamDef[] };
```

---

## 9. 宏观旋钮与“+宏变量”（只做接口规划，后续实现 UI）

### 9.1 需求定义

- 默认 3 个宏观旋钮：`fusion/motion/sparkle`（0..1）
- 在旋钮旁提供 `+`：生成“宏变量”（MacroSlot），其 value 也是 0..1，且：
  - 会被全局 Random 影响（可关闭 randomize/pin）
  - 会被收藏/恢复保存

### 9.2 推荐数据接口（规划：VisualStateV2）

参见 `INFRASTRUCTURE_PLAN.zh.md`。核心是让“宏变量”成为第一等公民：

- `global.seed`：随机根种子
- `global.macros`：3 个主旋钮
- `global.macroSlots[]`：`{id,label,value,randomize,pinned?}`

### 9.3 宏映射接口（后续可升级，不必一次到位）

```ts
type MacroInputs = {
  macros: Record<"fusion" | "motion" | "sparkle", number>;
  slots: Array<{
    id: string;
    value: number;
    randomize: boolean;
    pinned?: boolean;
  }>;
  audio: { energy: number; bands: { low: number; mid: number; high: number } };
};

type MacroPatch = {
  projectm?: Partial<VisualStateV2["projectm"]>;
  background?: { params?: Record<string, unknown> };
};

function computeMacroPatch(input: MacroInputs): MacroPatch;
```

---

## 10. Diagnostics 与 Verify（验收数据接口）

### 10.1 DiagnosticsPanel（UI 侧必须显示的字段）

文件：`src/features/console/DiagnosticsPanel.ts`

- AudioContext：`AudioBus.audioContextState`
- AudioFrame：`energy/rms/peak`
- ProjectM：读取 `globalThis.__projectm_verify` 的 `framesRendered/lastAudioRms`
- Renderer：`SceneManager.getRendererInfo()` 的 pixelRatio/outputColorSpace/toneMapping

#### 2025-12-23 补充：Layers 行（运行态图层监视）

- Layers：运行态 opacity 与 PM coupling drive（FG/BG）

### 10.2 `__projectm_verify`（轻量可观测信号）

文件：`src/projectm/ProjectMEngine.ts`
建议视为“非强类型的诊断对象”，但字段名需稳定：

- `initialized`
- `framesRendered`
- `lastAudioRms`（以及可选的 peak/gain）

### 10.3 headless verify 输出（CI/本地对齐）

脚本：`scripts/headless-verify.mjs`
关键验收字段（必须可观测）：

- `framesRendered` 增长
- `finalOutputChanged === true`
- `projectMCanvasChanged === true`
- 产物：`artifacts/headless/report.json`、`trace.zip`、`screenshot.png`

---

## 11. “先做文档 → 再做 UI”落地顺序（不改代码的计划）

1. **定 V2 数据模型（文档先行）**
   - VisualStateV2（宏旋钮 + macroSlots + background.type/params）
   - 迁移策略：V1 → V2 的默认值
2. **把 schema 升级为可枚举**
   - 每个模块都能 `getSchema()`，UI 从 schema 生成
3. **Controller 规范**
   - UI 只写 store；controller 负责 apply state → layers
4. **UI 规划**
   - 默认：3 个宏旋钮 + `+`（macroSlots）+ Random/Favorite
   - 展开：Inspector（分组/搜索/重置/随机参与开关）
5. **未来扩展接口预留**
   - Background plugin：liquid/camera/video 统一接口
   - MIDI mapping：绑定到宏旋钮或 macroSlots（设备映射不进入收藏，放 SettingsStore）

---

## 12. 非目标（为了控制复杂度）

- 不在本阶段解析 `.milk` 并暴露每个 preset 内部参数（成本高且差异巨大）。
- 不在本阶段引入 compositor/RT 池化/像素回读（那是 P2 的范畴）。
- 不在本阶段把所有 UI 重写为组件框架（保持现有 Vite/TS/DOM 方案）。

---

## 13. 2025-12-16 真实接口总表（以代码为准）

> 说明：本节是“深度整理后的接口表”，用于驱动 UI 重整与后续扩展；不引入新功能，只把已有能力按稳定契约写清楚。

### 13.1 内部接口表（核心）

| 接口/对象                | 文件                                           | 提供方 → 消费方                                         | 主要方法/事件                                                                                                    | 关键数据类型                                        | 失败/边界与约束                                                                                                                         |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `AudioBus`               | `src/audio/AudioBus.ts`                        | `StreamAudioProcessor` → `bootstrap`/layers/Diagnostics | `loadFile/loadUrl/play/pause/toggle/setVolume/setLoop/resumeContext/dispose`；`onFrame/subscribe`；`getSnapshot` | `AudioFrame`                                        | **单一音频源**：禁止第二套 energy；`energySmoothing` 仅允许在 AudioBus 内实现（目前支持 `none/ema`，默认 `none`）                       |
| `AudioFrame`             | `src/types/audioFrame.ts`                      | `AudioBus` → layers/Diagnostics/Random                  | 结构体（每帧分发）                                                                                               | `energy`、`energyRaw?`、`rms/peak`、`bands`、`pcm*` | `energy` 是“统一控制信号”；`energyRaw` 仅用于诊断/对比                                                                                  |
| `ProjectMLayer`          | `src/layers/ProjectMLayer.ts`                  | layer → SceneManager 渲染链路                           | `setAudioFrame`；`setBlendParams/getBlendParams`；`loadPresetFromUrl/loadPresetFromData`；`isReady`              | `BlendParamsSnapshot`                               | BlendParams 语义冻结：`base + energy*amount`（不可覆盖 base）；部分预设可能导致 WASM abort，会触发 engine rebuild                       |
| `ProjectMEngine`         | `src/projectm/ProjectMEngine.ts`               | WASM runtime → `ProjectMLayer`/verify                   | `init/loadPresetFromUrl/loadPresetData/addAudioData/render/setWindowSize/dispose`                                | `globalThis.__projectm_verify`                      | `__projectm_verify` 作为诊断对象：`initialized/framesRendered/lastRenderTimeMs` 等字段名需稳定；WASM 不导出 HEAP 视图（避免触碰）       |
| `PresetsController`      | `src/features/presets/PresetsController.ts`    | UI 控件 → `ProjectMLayer`                               | `loadPresetFromUrl/loadPresetFromDescriptor`；`refresh/markBrokenAndRefresh`；`init/dispose`；auto-cycle 管理    | `PresetDescriptor`                                  | 存储 key：`presetLibrarySource`；坏预设隔离：`markPresetAsBroken`；无预设时会禁用相关控件                                               |
| `VisualStateV2`          | `src/features/visualState/visualStateStore.ts` | 运行态/收藏态统一模型                                   | `version=2`；`global.seed/macros/macroSlots`；`background.type/params`；`projectm.*`                             | `MacroSlot`、`BlendParamsSnapshot`                  | 收藏/恢复必须只依赖 VisualState（避免 UI 漂移）；V1/legacy 输入需迁移到 V2                                                              |
| `VisualStateController`  | `src/app/visualStateController.ts`             | UI/store → layers                                       | `applyPatch(state, patch) -> nextState`；`syncBackground(background)`                                            | `VisualStatePatch`                                  | **单一 apply 入口**：patch 应同时同步 layer + 重建快照；背景 params：liquid 以 runtime snapshot 为准，camera/video 以 state params 为准 |
| `BackgroundRegistry`     | `src/background/backgroundRegistry.ts`         | controller → 各背景 layer                               | `setActive`；`applyParams`；`getParamDefs/getActiveParamDefs`                                                    | `BackgroundType/BackgroundParams`                   | 只允许一个背景 enabled；paramDefs 由 schema 提供给 Inspector/Random                                                                     |
| `ParamSchema`/`ParamDef` | `src/state/paramSchema.ts`                     | schema → Random/Inspector                               | `paramSchema`（可枚举 defs）；`randomPatchForSchema`；兼容 `randomizeBlendParams`                                | `ParamDef`                                          | Random 必须只作用于 `random:true` 字段；`random:false` 字段保持当前值                                                                   |
| `FavoritesPanel`         | `src/features/favorites/FavoritesPanel.ts`     | UI 浮层 → bootstrap                                     | `refresh/show/hide/toggle/dispose`                                                                               | `FavoriteVisualState[]`                             | 仅负责展示与触发回调；存储与迁移由 bootstrap/store 管理                                                                                 |
| Favorites storage        | `src/app/bootstrap.ts` + store                 | localStorage ↔ UI                                       | `loadFavoritesFromStorage/saveFavoritesToStorage`                                                                | `FavoriteVisualState`                               | 当前写入 key：`newliveweb:favorites:v2`；若 v2 不存在会从 v1 迁移写入 v2（v1 保留）                                                     |
| Headless verify          | `scripts/headless-verify.mjs`                  | Playwright → artifacts                                  | `report.json`/`trace.zip`/`diff.png`/`viz-canvas-a/b.png`                                                        | `report.checks.*`                                   | 以 `viz-canvas` 截图变化作为**最终输出真相源**；当最终输出已证明变化时，ProjectM offscreen canvas 检测可标记 `null`（unknown）避免误报  |

### 13.2 LocalStorage keys（当前口径）

> 2025-12-16 补充：LiquidMetal 新增参数 `contrast`（默认 1.0），通过 ParamSchema 暴露给 Inspector。
> Random 口径：该字段默认 `random=false`，Random 时保持当前值不变。

| Key                           | 用途             | 读写位置                               | 备注                                                     |
| ----------------------------- | ---------------- | -------------------------------------- | -------------------------------------------------------- |
| `newliveweb:favorites:v2`     | 收藏列表         | `bootstrap.ts` / `visualStateStore.ts` | v1→v2 自动迁移（v1 保留）                                |
| `newliveweb:favorites:v1`     | 历史收藏列表     | 同上                                   | 仅兼容读取                                               |
| `newliveweb:settings:v1`      | Settings（MIDI） | `settingsStore.ts` / `bootstrap.ts`    | `SettingsV1`：仅包含 `midi.bindings`（不进入 Favorites） |
| `newliveweb:audio:preferredSource` | 音频偏好来源 | `bootstrap.ts`                         | `input` 表示偏好输入设备；避免首次手势自动加载测试音轨    |
| `newliveweb:audio:inputDeviceId`   | 输入设备记忆 | `bootstrap.ts`                         | 上次选择的 audioinput `deviceId`（空表示系统默认）        |
| `newliveweb:showConfig:v1`    | 演出配置一键存档 | `bootstrap.ts`                         | `{ audio:{...}, visual: VisualStateV2 }`                 |
| `presetLibrarySource`         | 预设库选择       | `PresetsController.ts`                 | `'full' | 'full-safe' | 'curated' | 'curated-safe'`     |

---

## 14. 2025-12-16 对齐补充（以代码为准：演出输入设备/摄像头/视频）

> 本节用于把“想做的”与“已落地的”分开写清楚，避免接口文档被误当成已实现功能清单。

### 14.1 音频：当前可用与缺口

- 注：本地音频输入（MediaStream）现已落地；本节中的“未落地”段落保留为历史口径，真实现状以 14.4 勘误为准。

- 已落地（可直接用）

  - `AudioFrame` 已包含 `energyRaw?: number`（仅用于 Diagnostics/debug）与 `energy: number`（统一控制信号）。
  - `AudioBus` 支持可选能量平滑（EMA）：由 `AudioBusOptions.energySmoothing` 控制；当前 UI 通过 URL 参数 opt-in（见 `src/app/bootstrap.ts`）。
  - 本地输入设备捕获：`AudioBus.loadInputDevice(deviceId?)` 可通过 `getUserMedia({ audio })` 捕获系统/外置声卡输入并驱动统一分析链路。

- 历史口径（已过时，见 14.4 勘误）

  - 目前主链路不支持 `MediaStreamAudioSourceNode`（即：不能通过 `getUserMedia({ audio })` 捕获系统/外置声卡输入）。
  - 因此：仅在系统设置里把输入设备切到 DJM-900… 并不会自动让应用使用该输入；需要新增 AudioBus/processor 的 stream 接口。

- 规划接口（建议写入代码后再当“真实接口”）
  - `AudioBus.loadInputDevice(deviceId?: string): Promise<void>`
  - `AudioBus.getInputDeviceInfo(): { deviceId?: string; label?: string; kind: 'default' | 'device' } | null`

### 14.2 背景：camera/video 的真实状态

- `background.type` 已支持：`'liquid' | 'camera' | 'video'`（见 `src/features/visualState/visualStateStore.ts`）。
- `BackgroundRegistry` 已支持三类背景的 enabled 互斥与参数过滤（见 `src/background/backgroundRegistry.ts`）。
- Camera
  - `CameraLayer` 已实现 `applyParams({ opacity })` 与 `setEnabled`（启用时才触发权限/启流）。
  - 约束：Random 默认不应切到 camera（避免权限弹窗影响验收）。
- Video
  - `VideoLayer` 已实现 `applyParams({ src, opacity, loop, muted, fitMode, playbackRate })` 与 `setEnabled`。
  - 约束：自动播放可能被拒绝（实现上会 warning 且不中断）；UI 必须提供“为什么没画面”的提示（例如 src 为空/播放被拒绝）。

### 14.3 Diagnostics/Verify：建议新增的观测点

- DiagnosticsPanel 建议新增展示：
  - 当前输入源：`default/deviceId/label`（用于演出现场快速确认“是否在吃 DJM 输入”）
  - 当前背景：`background.type`（用于确认 camera/video 是否真的启用）
  - 音频平滑配置：`audioSmoothing.mode/alpha`（用于解释能量响应差异）

### 14.4 2025-12-16 勘误：本地音频输入（MediaStream）已落地（以代码为准）

> 勘误原因：本文 2.4 与 14.1 中存在“MediaStream 尚未落地/主链路不支持”的历史描述；当前代码已实现输入设备捕获与接入 AudioBus。

- 已实现能力

  - `AudioBus.loadInputDevice(deviceId?: string)`：内部使用 `navigator.mediaDevices.getUserMedia({ audio })` 获取 `MediaStream` 并接入统一分析链路。
  - `StreamAudioProcessor.loadFromStream(stream, { monitor?: boolean })`：以 `MediaStreamAudioSourceNode` 作为输入源；默认 `monitor=false`（避免现场反馈）。
  - UI：顶部工具栏包含 `#audio-input-device`（设备下拉）与 `#audio-input-use`（Use input）用于切换到输入源。
  - 持久化：localStorage 记忆 `newliveweb:audio:preferredSource` 与 `newliveweb:audio:inputDeviceId`。

- 最小验收信号
  - 点击 “Use input” 后，Diagnostics 中 `energyRaw/energy/rms/peak` 持续跳动；拒权/无设备时有明确提示且不崩溃。
  - `npm run verify:dev` 仍通过（输入设备不可用时不应导致 verify 失败）。

### 14.5 2025-12-16 补充：Mixer 输入 → ProjectM 的数据格式（以代码为准）

- 捕获：`getUserMedia({ audio })` → `MediaStreamAudioSourceNode`（见 `AudioBus.loadInputDevice` / `StreamAudioProcessor.loadFromStream`）
- 统一输出：`AudioFrame.pcm2048Mono: Float32Array`（2048 点 PCM，来自 `AnalyserNode.getFloatTimeDomainData`；作为统一驱动输入）
- ProjectM 消费：`ProjectMLayer.setAudioFrame(frame)` → `ProjectMEngine.addAudioData(frame.pcm2048Mono)`
  - `ProjectMEngine.addAudioData` 内部会重采样到 512，并写入 WASM 的 L/R float32 buffers（双声道同值），由 `pm_render_frame(...)` 消费
- 约束：AudioBus 仍是唯一音频分发源；任何平滑/增益/能量计算不得在下游重复实现（避免演出现场“同信号不同响应”）
- 监控输出（防反馈）：输入模式默认不把音频送到扬声器（monitor=false）；除非显式开启 monitor（当前 UI 不提供 monitor 开关）

## 15. 2025-12-17 补充：AIVJ（自动 VJ）与 MIDI-owned 仲裁（数据契约口径）

> 本节用于文档同步：把 AIVJ/Techno Auto/AudioCtl 的可用输入输出与仲裁规则写成数据口径。
> 其中部分为建议接口（尚未写入代码前不应被当作已实现功能）。

### 15.1 AIVJ 的输入（以现有结构为准）

- 音频帧：`AudioFrame`（`AudioBus.onFrame(frame)` 分发）
- Beat/Tempo：合并写入 `frame.features.*` 的快照字段（例如 `tempoBpm/beatPhase/beatConfidence/flux/beatPulse`）
- 视觉状态：`VisualStateV2.global.macros` + `VisualStateV2.global.macroSlots[]`
- MIDI 设置：`SettingsV1.midi.bindings[]`
  - Target 结构（以代码为准）：
    - `{ kind: 'macro', key: 'fusion' | 'motion' | 'sparkle' }`
    - `{ kind: 'slot', slotId: string }`
    - `{ kind: 'param', key: string }`
- 编排节流信号（运行态）：
  - `manualHoldUntilMs`：用户手动调整宏/槽后暂时冻结 AIVJ。
  - `morphHoldUntilMs`：预设切换时短暂冻结 AIVJ morph（解耦 preset 与 morph）。

### 15.2 AIVJ 的输出（最小可行口径）

- 仅通过 VisualState 输出：
  - 回写 `global.macros`（fusion/motion/sparkle）
  - 回写 `global.macroSlots[i].value`（建议只使用数组前 5 个作为默认8-knob bank）

说明：宏/槽最终会通过既有宏映射函数产生 layer patch；因此 AIVJ 不需要直接写入 layer 参数。

### 15.3 8-knob bank 的 target 身份（避免文档与实现对不上）

8 个宏旋钮在数据层面的等价定义：

- 3 个宏 targets：`macro:fusion`、`macro:motion`、`macro:sparkle`
- 5 个 slot targets：`slot:<macroSlots[0..4].id>`

注意：slot 的真实身份是 `MacroSlot.id: string`；文档中的Slot1..Slot5仅表示数组前 5 个槽位的概念序号。

### 15.4 MIDI-owned 仲裁规则（建议口径）

- 绑定存在即 owned：若 `SettingsV1.midi.bindings` 中存在 target 匹配，则该 target 视为 MIDI-owned
- owned target 上禁止 AI 回写：当一个 macro/slot 被 owned 时，AIVJ 不得写入对应值（避免回拉/打架）
- 非 owned target 可继续由 AI 输出：例如 preset 编排、非这 8 个 target 的其它路径（需保持现有平滑语义）

### 15.4.1 2025-12-17 实装补充（与代码为准）

- 8-knob bank 的 5 个 slots 使用保留 ID：`aivj-m4..aivj-m8`，启动时自动确保存在，并保持在 `macroSlots` 前 5 个位置。
- MIDI AutoMap：当 `SettingsV1.midi.bindings.length===0` 时，用户点击 `MIDI/Connect` 后进入 AutoMap，依次把“前 8 个 CC 事件”绑定到 8-knob bank（fusion/motion/sparkle + aivj-m4..m8）。
- MIDI lock（宏 bank 粒度）：当上述 8 个 targets 都已存在 MIDI binding 时，AIVJ 不再回写 `global.macros/macroSlots`（避免抢旋钮）；AIVJ 会改为对 runtime 做平滑淡入淡出驱动（ProjectM blend + Background layer params），并以混合方式避免与用户/MIDI 的操控打架。

### 15.5 摄像头人像边缘信号与 ProjectM 耦合（数据契约）

- CameraLayer 运行态状态快照（以 `getStatus()` 为准）：
  - `state?: 'idle' | 'connecting' | 'streaming' | 'error'`
  - `lastErrorName?: string | null`
  - `segmentPerson: boolean`
  - `portraitEdge01: number`：0..1，表示人像轮廓边缘密度（已做下采样与轻量平滑）。
  - `portraitArea01: number`：0..1，表示人像在画面中的大致占比。
- `bootstrap.ts` 中的 AIVJ 运行态会将上述状态映射到：
  - Diagnostics 的 `Audio` 行：`bg=camera/seg edge=NN%`（便于确认分割是否生效）。
  - 内部 portrait 信号：`{ active, edge01, area01 }`，供 AIVJ 与 ProjectM 耦合使用。
- ProjectM 耦合参数（仅 runtime 级别）：
  - 输入：`portrait.edge01` 与用户配置的 `cameraEdgeToPm01 ∈ [0,1]`（来自 localStorage 键 `newliveweb:camera:edgeToPm:v1`）。
  - 输出：在 ProjectM 的 `opacity` 与 `energyToOpacityAmount` 上做平滑偏移（不会改写 VisualState 中的持久化基线）。

### 15.6（建议接口，未实现）Diagnostics 可观测字段

若未来需要把仲裁做成可验收信号，建议在 Diagnostics 中暴露：

- `aivj.enabled: boolean`
- `aivj.technoState: 'build' | 'peak' | 'break' | 'transition'`
- `aivj.ownedTargets: Array<{ kind: 'macro' | 'slot'; key?: string; slotId?: string }>`

---

## 16. 2025-12-24 对齐补充（Audio localStorage key 迁移）

- 现行 key（以代码为准）：
  - `nw.audio.preferredSource`
  - `nw.audio.inputDeviceId`
  - `nw.audio.trackVolume`
  - `nw.audio.mixxxUrl`
- 向后兼容：启动时若新 key 为空，会从旧 key `newliveweb:audio:*` 迁移写入。
- 说明：本节不替换旧段落，仅用于对齐当前实现。

---

## 17. 2025-12-24 对齐补充（ProjectMLayer 渲染尺寸约束）

- 新增运行态约束参数（构造选项）：
  - `engineScale?: number`（0.25..1，按比例缩放 ProjectM 画布）
  - `maxCssWidth?: number` / `maxCssHeight?: number`（CSS 像素上限，超过时自动降采样）
- 当 compositor targetMode 为 `fixed` 时，ProjectM layer 会以 fixed size 作为基准尺寸进行缩放。

---

## 18. 2025-12-23 对齐补充（DepthLayer 处理节流）

- `DepthLayerStatus` 新增：
  - `procIntervalMs`：当前处理节流间隔（毫秒）
  - `procMaxSide`：处理阶段的动态最大边长（像素）

---

## 19. 2025-12-23 对齐补充（BeatTempo 输入节流）

- `BeatTempo.onAudioFrame(frame, { maxFps })` 支持运行态节流上限（非 aubio 时生效）。
- `bootstrap.ts` 根据渲染稳定性/音频有效性/P95 动态设置 `maxFps`（10/20/30）。

---

## 20. 2025-12-23 对齐补充（ProjectMLayer 音频喂入节流）

- `ProjectMLayer.setAudioFeedIntervalMs(intervalMs)` 支持运行态调整音频喂入间隔。
- `bootstrap.ts` 根据渲染稳定性/音频有效性/P95 动态切换 FG/BG 音频喂入间隔。

---

## 21. 2025-12-23 对齐补充（Preset 切换降峰）

- Preset 加载入口会触发短暂“压力窗口”：
  - 暂停 preset 预取队列（不清空缓存）。
  - 将 AudioBus 分析/BeatTempo/ProjectM 音频喂入降到低档。
- 目的：减少 preset 切换时的主线程/音频相关峰值。

---

## 22. 2025-12-23 对齐补充（AIVJ accent 可观测）

- Diagnostics AIVJ debug 补充：
  - `accent01`：当前 accent 强度。
  - `slotPulse01`：slot 脉冲层增量。
  - `accentSource`：`expressive`/`raw`/`none`。
- DecisionTrace 记录：
  - `aivj.accent01`
  - `aivj.slotPulse01`



