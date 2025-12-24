# newliveweb 总规格（Canonical · UTF-8）

> 本文档是 `newliveweb/` 目录下所有规格/计划/接口文档的**唯一权威入口**（single source of truth）。
> 其他文档保留为历史记录与补充材料，但后续协作应优先更新本文档，然后按需同步到分项文档（只追加，不覆盖/不删除）。

---

## 1. 项目定位（产品视角）

`newliveweb` 是面向 **OBS/直播间、DJ/VJ、线下大屏** 的前端可视化引擎：以可插拔的背景层（默认 LiquidMetal）叠加 ProjectM 预设（MilkDrop），并通过统一音频总线驱动两层联动。目标是“稳定、可控、好看、可复现（random/favorite）”。

**快速入口（先看这些）**

- 入门与运行：`README.md`、`LOCAL_DEV_GUIDE.md`
- 数据契约：`DATA_INTERFACES.zh.md`
- 下一阶段基础设施：`INFRASTRUCTURE_PLAN.zh.md`
- ProjectM 专题（历史参考）：`docs/reference/PROJECTM_INTEGRATION.md`、`docs/reference/PROJECTM_WASM_SOLUTION.md`、`docs/reference/PROJECTM_FIX_ANALYSIS.md`

---

## 2. 不变约束（工程硬规则）

这些约束来自 `docs/reference/REFRACTOR_SPEC_FOR_AI.zh.md`，所有后续功能必须遵守：

1. 单一音频源：所有分析/分发只来自 `AudioBus` 的 `AudioFrame`，严禁第二套平滑/增益/energy 计算。
2. 层边界：`layers/*` 不碰 DOM/localStorage，不互相 import；UI/业务逻辑在 `app/*` 或 `features/*`。
3. BlendParams 语义冻结：
   - `opacity` 永远是 ProjectM overlay 的基础强度（base）。
   - `audioDrivenOpacity` 开启后使用 `base + energy * amount`（不允许“直接覆盖 base”）。
4. 颜色管理统一：renderer `outputColorSpace`/`toneMapping` 显式设置并可诊断，禁止各层各自做 gamma。
5. 可观测验收：Diagnostics + headless verify 是“真相源”，用于把“没音频/没动/色偏”分流为可定位问题。

---

## 3. 当前代码现状（真实落地能力）

### 3.1 运行骨架

- 入口：`src/main.ts` → `src/app/bootstrap.ts`
- DOM：`src/app/renderShell.ts`（集中生成 UI，并返回 `DomRefs`）
- 渲染：`src/SceneManager.ts`（持有 Three renderer/camera，驱动 `Layer[]`）

### 3.1.1 运行时数据流（高层）

```
AudioBus.onFrame(AudioFrame)
  ├─> LiquidMetalLayerV2.setAudioFrame(frame)   // 背景响应 bands/energy
  ├─> ProjectMLayer.setAudioFrame(frame)        // ProjectM 喂 PCM
  └─> DiagnosticsPanel.update*(...)             // 节流刷新可观测信号

Preset UI -> PresetsController -> ProjectMLayer.loadPresetFromUrl(...)
Favorite UI -> 保存 VisualState -> FavoritesPanel -> applyFavoriteVisualState(...)
```

### 3.2 Layer 管线（渲染模块）

- Layer 接口：`src/layers/Layer.ts`
- 背景层（默认）：`src/layers/LiquidMetalLayerV2.ts`
- ProjectM 叠加层：`src/layers/ProjectMLayer.ts`
- Camera（可选）：`src/layers/CameraLayer.ts`（通过 `config/cameraSources.ts` 控制开关）

### 3.3 音频总线（单一源）

- `src/audio/AudioBus.ts`：提供 `loadFile/loadUrl/play/pause/toggle/volume/loop/onFrame/getSnapshot/audioContextState`
- `src/types/audioFrame.ts`：稳定输出 `AudioFrame`（包含 `energy/rms/peak/bands/pcm*`）

### 3.4 预设与预设库

- 预设描述：`src/config/presets.ts`（`PresetDescriptor {id,label,url}`）
- 预设库源：`src/config/presetLibraries.ts`（full/curated + safe 版本）
- 控制器：`src/features/presets/PresetsController.ts`（处理 manifest 加载、auto-cycle、坏预设隔离、librarySource 存储）

### 3.5 状态/收藏/随机（可复现基础）

> 2025-12 对齐补充：当前运行态已升级为 `VisualStateV2`（含 `global.macros` 与 `global.macroSlots`，以及 `background.type/params`）。旧的 V1 仍可读并在加载收藏时迁移。

### 3.6 Diagnostics 与验收

- `newliveweb:favorites:v2`：收藏列表（当前写入 key；首次启动会从 v1 自动迁移并写入 v2）
- ProjectM 诊断信号：`globalThis.__projectm_verify`（由 `src/projectm/ProjectMEngine.ts` 维护）

### 2025-12-15

- VisualState 已以 V2 为主：引入 `global.macros` + `macroSlots` + `background.type/params`（V1 仍可迁移读取）。
- 收藏存储 key 升级为 `newliveweb:favorites:v2`，并提供 v1 → v2 自动迁移（避免“state 是 V2 但 key 还是 v1”的口径漂移）。
- ParamSchema 开始可枚举化：`src/state/paramSchema.ts` 产出带 `group/advanced/random` 元信息的 schema，为下一步 InspectorPanel 与“Random 只依赖 schema”做准备。
- Advanced Inspector（展开态）开始落地：工具栏新增 Inspector 区（搜索/显示 advanced/重置默认），并基于 schema 生成 LiquidMetal 参数控件（仍保持现有 PM blend 控件不变）。
- Advanced Inspector 覆盖范围扩展：在同一面板内新增 `ProjectM/Blend` 组（number/enum/bool），修改会同步到 layer 与既有 toolbar blend 控件。
- ProjectM blend 的修改入口开始收敛：既有 toolbar 控件与 Inspector 共用同一套 patch 应用逻辑，减少“双入口语义漂移”。
- LiquidMetalControlPanel 的修改入口开始收敛：浮动面板不再直接写 layer.params（由 bootstrap 统一写 state+layer），避免与 Inspector/收藏/随机产生不一致。
- 宏旋钮与 MacroSlot 的修改入口开始收敛：UI 事件通过统一的 global patch helper 更新 state，并重建 VisualState 快照，减少散落写入。
- Controller 开始落地：新增 `applyPatch` 单一入口（集中处理 state→layer 应用，并在更新后重建 VisualState 快照），为 Phase B“面板与随机收敛到 schema”提供可扩展落点。
- Random/收藏恢复路径继续收敛：Random 与 Favorite apply 不再直接写 layer（改为统一走 controller-backed patch），减少“看起来改了但收藏/面板没同步”的风险。
- Random 的“作用范围”开始彻底收敛到 schema：只随机 `random:true` 字段；`random:false` 字段（例如 `audioReactive`、`audioDrivenOpacity`）保持当前值不被覆盖。
- 验收脚本：
  - `scripts/verify-dev.mjs`：启动/复用 Vite 后跑 headless verify
  - `scripts/headless-verify.mjs`：检查 frames/hash/最终输出变化，并输出 Summary

---

## 4. “后端数据层”接口梳理（内部契约）

本项目没有服务端；“后端”定义为应用内部的数据接口与契约。完整详表见：`DATA_INTERFACES.zh.md`。

### 4.1 AudioFrame（唯一音频协议）

- 文件：`src/types/audioFrame.ts`
- 关键字段：
  - `energy`：0..1，统一控制信号（禁止重复计算）
  - `bands.low/mid/high`：背景层主要驱动源
  - `pcm2048Mono`：当前喂 ProjectM 的 PCM

### 4.2 ProjectM 融合参数（跨 preset 一致）

- 文件：`src/layers/ProjectMLayer.ts`
- 可控：`opacity` / `blendMode` / `audioDrivenOpacity` / `energyToOpacityAmount`

### 4.3 LiquidMetal 背景参数（当前真实存在）

- 文件：`src/layers/LiquidMetalLayerV2.ts`
- 可控：`timeScale/iterations/waveAmplitude/mouseInfluence/metallicAmount/metallicSpeed/brightness/audioReactive/audioSensitivity`

### 4.4 收藏/恢复（VisualStateV1）

- 文件：`src/features/visualState/visualStateStore.ts`
- 存储 key：`newliveweb:favorites:v1`（`src/app/bootstrap.ts`）
- 语义：收藏保存完整 `VisualState`，恢复只依赖 state（避免 UI 状态漂移）

---

## 5. UI 规划（默认简单 + 可展开全参数）

### 5.1 默认态（Simple）

目标：用户只需要 3 个宏观旋钮 + Random + Favorite。

- 三个宏观旋钮（0..1）：`fusion / motion / sparkle`
- 旁边的 `+`：新增“宏变量（MacroSlot）”，默认参与全局随机且可保存
- 一键 Random：影响 seed、三主旋钮、以及 `randomize=true` 的 MacroSlot
- Favorite：保存完整 VisualState（含 seed/macros/macroSlots）

### 5.2 展开态（Advanced Inspector）

目标：显示“全部详细参数”，但不增加工程复杂度。

- 面板由 schema 自动生成（分组/搜索/重置/是否参与随机/锁定）
- UI 不直接改 layer 参数：所有修改通过 store → controller 应用
- 保留现有 toolbar 的 PM blend 控件；后续可由 inspector 接管，或两者合并为同一 state 入口

---

## 6. 基础设施引入计划（下一阶段工程改造的路线图）

详细方案见：`INFRASTRUCTURE_PLAN.zh.md`。核心思想是把复杂度收敛在 4 个基础设施里：

1. VisualState（V2）：引入 `global.macros` 与 `global.macroSlots[]`，并抽象 `background.type + params` 以支持可插拔背景。
2. ParamSchema（可枚举）：既驱动 Inspector UI，也驱动 Random（避免“写两套逻辑”）。
3. Controller：单一入口 applyPatch/applyState，隔离 UI 与 layer 实现。
4. Background Plugin：Liquid/Camera/Video 等背景模块统一接口（未来扩展不推倒重来）。

**未来 MIDI（增强，不阻塞）**

- MIDI 映射建议优先绑定宏观旋钮与 MacroSlot（设备相关放 SettingsStore，不进入收藏）。

---

## 7. 验收与守门（每次迭代都要跑）

### 7.1 人工验收（开发时）

- `npm run dev`：Diagnostics 面板必须能看到：
  - AudioContext.state
  - AudioFrame.energy/rms/peak
  - `__projectm_verify.framesRendered/lastAudioRms`
  - renderer pixelRatio/outputColorSpace/toneMapping

### 7.2 自动验收（本地/CI）

- `npm run verify:dev`：应输出 Summary（framesRendered 增长 + output changed）
- `npm run verify:ci`：guardrails + tsc + verify-dev/headless

---

## 8. 文档收敛与维护规则（防止“文档爆炸”）

### 8.1 文档分层（建议）

- Canonical（只维护一份）：`MASTER_SPEC.zh.md`（本文）
- 写作路由（避免重复口径）：`DOCS_INDEX.zh.md`（每类信息应该写到哪里）
- 专项细则（只追加）：
  - `DATA_INTERFACES.zh.md`（数据接口契约表）
  - `INFRASTRUCTURE_PLAN.zh.md`（宏观旋钮/全参数/背景插件/MIDI 预留的引入路线）
- 历史/参考（不再作为权威入口）：
  - `docs/reference/REFRACTOR_SPEC_FOR_AI.zh.md`（执行规范与补丁日志，保留）
  - `docs/reference/REFRACTOR_PLAN.zh.md`（历史原文，可能含早期乱码）
  - `docs/reference/REFRACTOR_PLAN_CLEAN.zh.md`（旧的“干净计划”，后续可逐步迁移要点到本文后归档）
  - `docs/reference/ARCHITECTURE.md`、`README.md`（入门与概览）

### 8.2 更新纪律

- 所有文档 UTF-8（Windows 友好）。
- **只追加，不覆盖/不删除**：新增内容写在文末“变更记录”或新小节。
- 代码大改与文档大改不要混在同一提交/同一轮变更里（避免误删/覆盖）。

---

## 9. 变更记录（只追加）

### 2025-12-15（Phase C 继续推进）

- 引入最小 Background Plugin/Registry：将 Liquid/Camera 背景切换与参数应用收敛到统一抽象，controller 通过 registry 驱动启用/禁用与 params 应用。
- `background.type` 从 bootstrap 临时定义收敛进 `ParamSchema`，Inspector 通过 schema 枚举生成（Background/Type）。

### 2025-12-15（Phase C-3）

- Background Plugin 增强：BackgroundRegistry 暴露每个 background module 的 schema slice（paramDefs），Inspector/Random 根据当前 `background.type` 动态取 schema。
- 当前 camera 的 params schema 为空（预留扩展点），切换到 camera 时 Inspector 不展示多余参数且 Random 不会写入背景 params。

### 2025-12-15（Phase C-4）

- Camera 背景加入最小可控参数：`Background/Camera/opacity`（Inspector 自动出现）。
- CameraLayer 支持 schema-driven `applyParams`，并在启用/禁用与流启动时保持 opacity 一致。

### 2025-12-15（Phase C-5）

- 收藏恢复路径补齐：加载 Favorite 时会应用 `background.type`（并触发对应背景启用/禁用与 params 应用）。
- LiquidMetalControlPanel 与背景模式对齐：当 `background.type !== 'liquid'` 时自动隐藏并禁用快捷键 `L`，避免在 camera 模式下误调液态参数。

### 2025-12-15（Phase C-6）

- Random 路径接入 `background.type` 的 schema：随机流程会先尝试根据 schema 生成 background.type patch，再对当前激活的 background module schema slice 生成 params patch。
- 默认安全策略：`Background/Type/type` 的 `random` 仍为 false（不会随机切到 camera，避免权限弹窗/影响 headless verify）。

### 2025-12-15（Phase C-7 预埋）

- VisualStateV2 的 `background.type` 预留加入 `video`（迁移器可保留该值），但暂不在 schema/UI 中暴露（避免无实现的类型被误选）。
- BackgroundRegistry 已可识别 `video` 并在激活时禁用 liquid/camera（Video layer 将在后续 Phase C 完整实现）。

### 2025-12-16

- P0 验收通过：`npm run verify:dev` Summary 显示 framesRendered 增长且输出变化。

### 2025-12-16（全局计划刷新：后端优先 → UI，其余不阻塞）

本节将“项目全貌/优化建议”合并进现有 Phase B/C 计划，并把后续工作收敛成可验收里程碑。

#### A. 核心不变形（继续锁死）

1. 单一音频源：所有图层/诊断/随机只消费 AudioBus 输出的 AudioFrame；禁止任何新增层自行计算 energy 或重复平滑。
2. BlendParams 语义冻结：ProjectM overlay 的 `opacity` 永远是 base；开启 `audioDrivenOpacity` 时只允许 `base + energy * amount`，禁止直改 base。
3. 颜色空间/色调映射必须显式与可诊断：以 SceneManager.getRendererInfo() 为准，新增 renderer/后处理必须同步进 Diagnostics。
4. 观测与验收是真相源：Diagnostics 面板 + headless verify（verify:dev/verify:ci）是定位与回归的唯一裁判。

#### B. 近期交付（后端数据层优先）

里程碑顺序（建议）：

1. ParamSchema 补齐与 Random 约束（护栏优先）

- 目标：Random/Inspector/Favorites 的字段来源统一由 schema 驱动。
- 规则：Random 只作用 `random:true` 字段；`random:false`（例如 audioDrivenOpacity、contrast）保持当前值。
- 验收：Random/收藏恢复/Inspector 调参三者结果一致；headless verify 继续 pass。

2. Controller 单入口强化（applyPatch 作为唯一写入口）

- 目标：所有 UI 变更（Random/Favorite/Inspector/快捷键）仅通过 controller patch；不允许直写 layer.params。
- 验收：任意路径改参后保存收藏再恢复，VisualState 与运行态一致；Diagnostics 仍稳定。

3. BackgroundRegistry 插件化闭环（Liquid/Camera/Video）

- 目标：仅允许一个背景 active；切换 background.type 时同步启用/禁用与 params 应用。
- 策略：Video 类型可以在迁移/状态里保留，但 UI 暴露与否以 schema 的 `random=false`/可见性策略为准（避免误触发权限/不可用类型）。
- 验收：背景切换 + Random + Favorite 恢复三条路径都能正确同步 background.type 与 params。

4. 音频链路健壮化（可诊断、可复现，不改语义）

- 目标：AudioBus 支持可选 smoothing（默认关），并在 Diagnostics 同时展示 energy 与 energyRaw；静音/未运行状态清晰。
- 验收：开启/关闭 smoothing 时，Diagnostics 可辨；新增图层仍不允许自算 energy。

5. ProjectM 可靠性与 headless 校验稳定

- 目标：稳定 \_\_projectm_verify 字段命名（至少包含 initialized/framesRendered/lastAudioRms/lastAudioPeak），并在 headless verify 校验 frames 增长与 output changes。
- 验收：遇到 WASM abort 时有可追踪日志与降级行为；verify:ci 不因偶发 abort 误失败。

#### C. UI（后续）

- Advanced Inspector 体验：搜索/重置/advanced 开关；动态读取当前 background schema。
- Random/Favorite 显示“可复现信息”：seed、storage 版本（v2）、当前 background.type；所有应用/保存仅经 controller。

#### D. 后端优先任务与验收标准（详细版）

> 本小节用于把“要做什么/怎么验收”写死，避免阶段性完成但不可验证。

1. ParamSchema 补全与 Random 约束

- 子任务：
  - 补全 LiquidMetal/Camera/ProjectM 参数的 `group/advanced/random` 标注（以 `src/state/paramSchema.ts` 为唯一来源）。
  - Camera `opacity` schema 必须存在（允许 `random=false`，并可为空背景时不展示其他字段）。
  - LiquidMetal `contrast` 必须为 `random=false`（Random 不允许覆盖该字段）。
  - Random 逻辑只作用 `random=true` 字段（包括 background.type 的随机默认关闭）。
- 验收：
  - schema 含完整 defs；Random/Inspector 的参数集与 schema 一致且只随机 `random=true`。
  - Camera schema 在 Inspector 中可见（至少包含 opacity）；Random 不会触发未标注字段。

2. Controller 单入口改造

- 子任务：
  - 扩展 `VisualStateController.applyPatch` 覆盖 `background.type` 切换与 params 同步。
  - Random/Favorite/Inspector/快捷键调用统一入口（只产生 patch → controller 应用 → 重建 VisualState 快照）。
  - 移除对 `layer.params` 的直接写入（包括遗留 UI 面板路径）。
- 验收：
  - 所有入口调用 trace 指向 controller；切换背景时 layer 状态与 store 一致。
  - 代码搜索“直写 layer”路径清零（无残留）。

3. BackgroundRegistry 插件化（Liquid/Camera）

- 子任务：
  - 为 Liquid/Camera 实现 `getSchema/getDefaultParams/applyParams/setAudioFrame?` 形态的模块接口（registry 持有 active 背景并可切换）。
  - UI/Random/Inspector 按当前背景 schema 工作。
  - Video 类型仅占位：允许 state/迁移保留，但不暴露 UI/随机入口。
- 验收：
  - 切换 liquid↔camera 时 params 持久、Random/Inspector 生效且不越权。
  - Video 不出现在 UI/随机；切换后 render 正常且无异常日志。

4. 音频链路与 Diagnostics 增强

- 子任务：
  - AudioBus 保持能量唯一；平滑策略参数化（如 none/ema），默认关闭，显式 opt-in。
  - Diagnostics 展示 `energy/energyRaw/平滑配置`；静音/未运行状态提示。
- 验收：
  - Diagnostics 面板可见 energy/energyRaw/平滑模式；切换平滑参数影响 energy 但保持 0..1。
  - 静音时提示可见，恢复后自动更新。

5. ProjectM 健壮性与 headless 校验

- 子任务：
  - 锁定 `__projectm_verify` 字段名：`initialized/framesRendered/lastAudioRms/lastAudioPeak`。
  - WASM abort 增加日志钩子；headless verify 校验 frames 增长 + `finalOutputChanged`。
- 验收：
  - Diagnostics 显示固定字段；异常日志包含 abort 线索。
  - `npm run verify:dev/ci` 报告 frames 增长且 `finalOutputChanged=true`。

6. UI 后续任务及验收标准（排期在后）

- Advanced Inspector：
  - 子任务：搜索、重置、显示 advanced 开关；动态读取当前背景 schema；Blend Inspector 与 toolbar 同源。
  - 验收：可过滤/重置；切换背景字段同步；Blend 在 Inspector 与 toolbar 互相反映且无漂移。
- Random/Favorite 复现信息：
  - 子任务：显示 seed、storage 版本（v2）、当前背景类型；应用/保存仅经 controller。
  - 验收：面板可见 seed/版本/背景；保存/应用后与 VisualState 一致；无直写 layer。
- Diagnostics UI：
  - 子任务：展示 renderer outputColorSpace/toneMapping、音频平滑配置、\_\_projectm_verify 字段。
  - 验收：字段齐全且更新及时；与 headless 报告数据一致或可解释。
- 交互提示与防误操作：

  - 子任务：Random/背景切换提示作用范围；屏蔽不可用类型（Video）；静音/未运行提示。
  - 验收：UI 不出现 Video 入口；提示可见且不挡操作；静音提示会随恢复消失。

- 引入 ParamSchema + SeededRng，Random 已具备可复现基础（seed）。
- 新增 `INFRASTRUCTURE_PLAN.zh.md` 与 `DATA_INTERFACES.zh.md`，准备进入“宏观旋钮 + 展开全参数 + 背景可插拔 + MIDI 预留”的下一阶段。

---

## 10. 存储与版本（实战对齐）

### 10.1 LocalStorage keys（当前代码已使用）

- `newliveweb:favorites:v1`：收藏列表（`FavoriteVisualState[]`）
- `presetLibrarySource`：预设库源选择（`full/full-safe/curated/curated-safe`）

### 10.2 版本策略（推荐）

- VisualState：采用 `version: number` + 迁移器（读旧写新）
- Storage key：带版本后缀（如 `...:v2`），避免线上用户历史数据被破坏

---

## 11. 常见问题的“可定位分流”（靠 Diagnostics，不靠观感）

### 11.1 “没音频/不动/色偏”快速判定

- AudioContext 不是 `running`：优先排查用户手势/自动播放策略（点击 Play、或触发 resume）。
- `AudioFrame.energy/rms/peak` 长期接近 0：排查音量、URL 是否可播、跨域、音源是否真在播放。
- `__projectm_verify.framesRendered` 不增长：ProjectM 初始化/预设崩溃/画布尺寸问题，优先看 `page-errors.log` 与 `browser-console.log`。
- renderer 信息异常（DPR/色彩空间）：优先回归 `SceneManager` 的显式设置是否被改回。

### 11.2 verify 产物与定位路径

- `artifacts/headless/report.json`：验收布尔项与 framesRendered
- `artifacts/headless/page-errors.log`：硬失败原因
- `artifacts/headless/browser-console.log`：运行期 console 记录
- `artifacts/headless/diff.png`：最终输出 A/B 差异可视化（人眼快速确认“确实在变”）
- `artifacts/headless/trace.zip`：Playwright trace（复盘）

---

## 12. 兼容/遗留说明（避免误用）

- `src/audio/AudioController.ts` 仍存在，但当前主链路以 `AudioBus` 为唯一分发源；后续新增功能请不要再接第二套 onFrame。
- `LiquidMetalControlPanel` 当前会直接写 `layer.params`；在引入“展开全参数面板”前，会逐步收敛到 store/controller（详见 `INFRASTRUCTURE_PLAN.zh.md`）。

---

## 13. 2025-12-16 对齐补充（Phase B 收尾 + 勘误）

### 13.1 计划完成状态

- Phase B-1（ParamSchema 可枚举化）：已落地
- Phase B-2（Advanced Inspector 最小版）：已落地（含 `ProjectM/Blend` 与背景参数）
- Phase B-3（Random 收敛到 schema）：已落地（Random 仅作用于 `random:true` 字段；`random:false` 字段保持当前值）
- 守门：`npm run verify:dev` 与 `npm run lint` 均已通过（作为“做完”的验收口径）

### 13.2 Headless verify 的稳定性口径

- 产物：除 `viz-canvas-a/b.png` 外还会生成 `diff.png`，用于直观看最终输出变化
- 口径：当“最终可见输出”已证明非空且在变化时，ProjectM offscreen canvas 的变化检测若在 headless 下不可靠，会标记为 `null`（unknown）并记录 warning，而不是硬失败

### 13.3 收藏存储 key 勘误

- 当前写入 key：`newliveweb:favorites:v2`
- 兼容：首次启动若发现 v2 不存在，会从 `newliveweb:favorites:v1` 自动迁移并写入 v2（v1 保留不删除）
- 因此：第 10.1 节中 `...:v1` 仅代表“历史读取兼容”，不再是当前写入口径

### 13.4 音频能量平滑（可选，默认关闭）

- `AudioBus` 输出同时包含 `energyRaw`（原始）与 `energy`（统一控制信号）
- 默认：不启用平滑（避免改变既有观感/随机强度）
- 显式启用（URL opt-in）：`?audioSmoothing=ema&audioSmoothingAlpha=0.2`

### 13.5 2025-12-16 补充：LiquidMetal `contrast`

- 背景 `liquid` 新增参数 `contrast`（默认 1.0）。
- ParamSchema 口径：该字段默认 `random=false`（Random 不改变它），避免 Random 把整体对比度拉得过激。

### 13.6 2025-12-16 补充：本地音频输入（MediaStream / 输入设备）（已落地）

- 目标：支持现场使用系统音频输入设备（例如 USB mixer / DJM-900）驱动能量与频谱，不依赖测试音轨。
- 后端落点：
  - `AudioBus.loadInputDevice(deviceId?)` 使用 `navigator.mediaDevices.getUserMedia({ audio })` 获取 `MediaStream` 并接入统一分析链路。
  - `StreamAudioProcessor.loadFromStream(stream, { monitor?: boolean })` 支持 `MediaStreamAudioSourceNode`，切换音源时会 teardown 上一个 stream/source。
- 前端落点：顶部工具栏新增输入设备选择（`#audio-input-device`）与“Use input”（`#audio-input-use`）。
- 防反馈默认：切到输入源后会把音量默认设为 0；Play/Pause 语义在输入模式下不适用，当前实现将按钮显示为 “Track” 用于快速切回测试音轨。
- 记忆策略（localStorage）：
  - `newliveweb:audio:preferredSource`：`input` 时表示用户偏好输入模式（不自动加载测试音轨）。
  - `newliveweb:audio:inputDeviceId`：记忆上次选择的 deviceId（可为空表示系统默认）。
- 可观测验收：Diagnostics 能显示当前 source 与 input label/deviceId，且 `energyRaw/energy/rms/peak` 会随输入持续跳动；拒权/无设备时有提示且不崩溃。

### 13.7 2025-12-16 补充：演出输入设备与背景现状（以代码为准）

> 目的：对齐“想在演出现场用 DJM-900（或同类 USB 声卡）输入驱动网页渲染 + 摄像头做背景”的真实可用性，避免口径漂移。

- 事实（已实现）

  - 音频：`AudioBus` 支持 file/url/element 三类来源；输出 `AudioFrame` 含 `energy`（统一控制信号）与可选 `energyRaw?`（诊断）；支持 URL opt-in 的能量 EMA 平滑（见 13.4）。
  - 背景：存在 `liquid/camera/video` 三类背景类型；`BackgroundRegistry` 负责“同一时间仅一个背景 enabled”与 `applyParams` 过滤。
  - Camera：`CameraLayer` 存在且默认禁用；切换到 camera 背景时才会触发权限与启流（避免误弹权限）。
  - Video：`VideoLayer` 存在；当前可通过 Advanced Inspector 切换 `background.type=video` 并编辑 `Background/Video/*` 参数（主工具栏默认不暴露入口）。
  - Random：`Background/Type/type` 默认 `random=false`，Random 不会意外切到 camera/video（避免权限/自动播放影响验收）。

- 需注意（演出现场的真实约束）

  - 本地输入设备捕获依赖浏览器权限与用户手势：首次点击 “Use input” 会触发授权；无权限/无设备时会给出提示但不会崩溃。
  - 设备列表与 label：未授权前 `enumerateDevices()` 可能返回空 label；授权后会刷新下拉列表补全 label（正常现象）。
  - Video 播放：即使 `muted=true`，浏览器仍可能因自动播放策略拒绝 `video.play()`；实现上会降级为 warning，但现场需要明确 UI 提示与手动触发路径。
  - Dev-only 测试音轨：`bootstrap.ts` 里存在 Windows 本地文件路径示例，仅用于开发自测；跨平台/演出不应依赖该路径。

- 计划（对应可验收 TODO）
  - 见 `TODOS.zh.md`：
    - “本地音频输入（MediaStream）打通”（新增 `AudioBus.loadInputDevice(deviceId?)` + UI 设备选择 + Diagnostics 输入源展示）
    - “Camera 背景体验护栏”（权限提示/拒权回退/状态可见）

### 13.8 2025-12-16 勘误：本地音频输入（MediaStream / 输入设备）已实现

> 勘误原因：13.6/13.7 中“未接入 `MediaStreamAudioSourceNode`”属于历史口径；当前代码已实现并接入主链路。

- 已实现（以代码为准）

  - `AudioBus.loadInputDevice(deviceId?: string)`：通过 `getUserMedia({ audio })` 获取 `MediaStream` 并接入统一分析/分发（`AudioFrame`）。
  - `StreamAudioProcessor.loadFromStream(stream, { monitor?: boolean })`：支持 `MediaStreamAudioSourceNode`；默认 `monitor=false`。
  - UI：工具栏提供 `#audio-input-device` + `#audio-input-use`。
  - 记忆：`newliveweb:audio:preferredSource`、`newliveweb:audio:inputDeviceId`。

- 仍需注意
  - 浏览器权限/设备枚举受环境影响（拒权/无设备必须给出提示且不中断渲染）。

### 13.9 2025-12-16 补充：演出模式一键配置（Show config）+ 最小 UX 闭环

- 演出模式一键配置（Show/Save show）

  - UI：工具栏新增 `Show`（应用）与 `Save show`（保存）。
  - 存储：`newliveweb:showConfig:v1`（localStorage）。
  - 内容：保存 `VisualStateV2` + 音频偏好（`preferredSource`/`inputDeviceId`/`volume`），用于现场一键恢复。
  - 默认：若未保存 show config，则 `Show` 走“input + camera（若可用）”的最小路径。
  - 验收：保存后刷新页面，点击 `Show` 可恢复（含背景状态与音频偏好）；拒权/无设备不崩溃且提示可见。

- Video 背景重试（需要用户手势）

  - UI：工具栏新增 `Retry video`（仅当 `background.type=video` 且 `video.play()` 被拒绝进入 error 时启用）。
  - 行为：点击会调用 `VideoLayer.retryPlayback()` 并通过 Inspector status 给出成功/失败短提示。
  - 验收：将背景设为 video 且触发 autoplay blocked 时，按钮可用；点击后可恢复播放（或明确失败提示）。

- MIDI bindings 最小可用性增强
  - UI：显示 `Bindings: N`，新增 `Clear` 清空全部 bindings；无绑定时 `Unbind/Clear` 自动禁用。
  - 存储：`newliveweb:settings:v1`（localStorage），仅持久化 `midi.bindings`（不进入 Favorites）。
  - 验收：Learn 绑定后计数变化；Clear 后计数归零且不会影响其他状态；刷新后 bindings 仍在。

### 13.10 2025-12-16 补充：`mode=show`（演出 input-only）+ Mixer→ProjectM 数据格式对齐

- `mode=show`（URL 参数）

  - 目的：演出现场只使用 USB mixer / 声卡输入驱动渲染（不依赖 Track 测试音轨/本地路径）。
  - 行为：禁用文件/URL/Play 等 Track 入口；不再绑定“首个手势自动加载测试音轨”；`Show/Save show` 按 input-only 语义保存/恢复。
  - 验收：打开 `?mode=show` 后，UI 不存在可触发 Track 的路径；`Use input` 成功后 Diagnostics 显示 `source=stream` 且能量持续跳动。

- Mixer → WebAudio → `AudioFrame` → ProjectM（格式约束）

  - Mixer 输入：浏览器通过 `getUserMedia({ audio })` 捕获 `MediaStream`；约束偏好为 **raw 输入**（`echoCancellation/noiseSuppression/autoGainControl=false`，`channelCount` 仅作 ideal）。
  - `AudioFrame.pcm2048Mono`：来自 `AnalyserNode.getFloatTimeDomainData()` 的 `Float32Array`（范围约 `[-1, 1]`，长度 2048，单通道/混合单声道）。
  - ProjectM 接口：`ProjectMLayer.setAudioFrame(frame)` 将 `pcm2048Mono: Float32Array` 传入 `ProjectMEngine.addAudioData()`；engine 内部会重采样到 512 并写入 WASM L/R float32 buffer，再由 `pm_render_frame(...)` 消费。
  - 监控输出（防反馈）：输入模式默认不把音频送到扬声器；除非显式开启 monitor（当前 UI 不提供 monitor 开关）。

  ### 13.11 2025-12-17 同步：AIVJ（自动 VJ）命名收敛 + Techno 取向算法规格（文档先行）

  > 本节是“文档同步”，不代表新增代码功能；其目的是把已存在的能力用统一术语写清楚，并给出可实现、可验收的 Techno 取向编排规格。

  - AIVJ（自动 VJ）在当前代码中的事实构成

    - Techno Auto（按 bar/phrase 量化触发）
    - AudioCtl（连续音频驱动宏/层权重）
    - 宏过渡（smoothstep 2–8s）
    - 宏映射（macros + macroSlots → ProjectM/Liquid/Basic/Camera/Video patch）

  - Techno 取向算法规格（可解释、可复现）

    - 统一写在：[AIVJ_DESIGN.zh.md](AIVJ_DESIGN.zh.md) 的 “4.4 Techno 取向详细规格”
    - 以 8-bar phrase 为骨架，输出仍然只写 `global.macros` 与前 5 个 `macroSlots`（通过现有过渡/映射链路生效）

  - MIDI 与 AI 的仲裁（避免抢旋钮）

    - 若 SettingsV1 中存在对 `macro(fusion/motion/sparkle)` 或 `slot(slotId)` 的 bindings，则对应 targets 视为 MIDI-owned
    - MIDI-owned targets 上，AI 不得回写这些 macros/slots（但仍可继续做非抢旋钮路径的平滑融合与编排）

  - 8-knob 口径（与现有数据模型对齐）

    - 3 个宏：fusion/motion/sparkle
    - 5 个槽：`macroSlots[0..4]`（真实 binding target 使用各自 `slotId`）

  - 8-knob 的“可用化实现细则”（与 2025-12-17 实装对齐）

    - 5 个槽位使用保留 ID：`aivj-m4..aivj-m8`，启动时自动确保存在，并保持在 `macroSlots` 前 5 个位置（其后仍保留用户自建 slots）。
    - MIDI AutoMap：当 SettingsV1 中 **没有任何** MIDI bindings 时，用户点击 `Connect` 后进入 AutoMap：依次把“前 8 个 CC 事件”绑定到 8-knob（fusion/motion/sparkle + aivj-m4..m8），不要求用户手动逐个 Learn/选择 target。
    - MIDI lock（避免抢旋钮）：当上述 8 个 targets 均已存在 MIDI binding 时，AIVJ 不再回写宏旋钮（不再 `applyGlobalPatch` 写 macros/slots），改为仅对 runtime 做平滑淡入淡出驱动（ProjectM/背景融合仍变化）。

---

## 2025-12-23 对齐补充（UI 反馈 + Diagnostics）

- 宏旋钮反馈：宏旋钮变动触发 strip pulse（标签高亮 + 轻微动效），帮助现场识别“哪些参数受影响”。
- Diagnostics Layers 行：展示运行态 opacity 与 PM coupling drive（FG/BG），用于快速确认联动与退让。
- Layer 只读补充：`Layer.getOpacity?()` 用于读取运行态 opacity（不影响保存态）。

---

## 2025-12-24 对齐补充（AIVJ 连续轨迹 + 预设解耦 + depth 策略）

- AIVJ 目标从“随机重采样”改为连续轨迹：`computeMacroBankIdeal` + 平滑轨迹 + 低频噪声，减少抖动但保留变化感。
- beatConfidence/stability 连续参与触发：低置信度时触发更慢、幅度更小、过渡更长；高置信度更贴拍但仍限幅。
- preset 切换触发短暂 morph hold（解耦 preset/morph），避免同刻大幅变化。
- depth 权重与参数改为策略驱动：结合 profile + portrait 边缘/面积，主体清晰时深度退让、边缘更清晰。

---

## 2025-12-24 对齐补充（Toolbar 分层）

- Toolbar 控件按“演出必需 / 调试 / 高级”分层；调试/高级默认隐藏，避免现场误触。
- Inspector/MIDI 归入高级层；Show 的 Calibration/Snapshot 归入调试层。

---

## 2025-12-24 对齐补充（音频 localStorage key 迁移）

- 现行 key（以代码为准）：
  - `nw.audio.preferredSource`
  - `nw.audio.inputDeviceId`
  - `nw.audio.trackVolume`
  - `nw.audio.mixxxUrl`
- 向后兼容：启动时会读取旧 key `newliveweb:audio:*`，若新 key 为空则迁移写入。
- 备注：`newliveweb:showConfig:v1` 仍作为演出配置入口，不受上述迁移影响。

---

## 2025-12-24 对齐补充（ProjectM 内部渲染尺寸优化）

- ProjectM layer 增加内部渲染尺寸约束：
  - `engineScale`：按比例缩放 ProjectM 渲染（运行态，默认 1）。
  - `maxCssWidth/maxCssHeight`：上限约束，超过时自动降采样。
- 当 compositor 处于 `fixed` 模式时，ProjectM 以 fixed size 作为基准尺寸，避免 4k 画布过度开销。

---

## 2025-12-23 对齐补充（Depth 处理节流与自适应下采样）

- Depth 处理加入节流：低可见度时降低处理频率，减少 CPU 开销。
- Depth 处理分辨率加入动态上限：根据输入尺寸/可见度自动降低处理分辨率。

---

## 2025-12-23 对齐补充（音频分析 FPS 自适应）

- AudioBus 分析频率加入动态 cap（30/45/60Hz），基于渲染帧时间 P95 进行节流并带冷却时间。

---

## 2025-12-23 对齐补充（预设预取让步）

- 预设预取在渲染不稳定或帧时间过高时会延迟执行，避免后台拉取加重卡顿。

---

## 2025-12-23 对齐补充（Compositor 快速路径）

- 当 ProjectM 透明度长期接近 0 时，compositor 走背景直出路径，跳过 ProjectM RT 合成。

---

## 2025-12-23 对齐补充（BeatTempo 输入节流）

- BeatTempo 在渲染压力/音频无效时降低输入帧率上限（10/20/30Hz），减少 worker 压力。

---

## 2025-12-23 对齐补充（ProjectM 音频喂入节流）

- ProjectM FG/BG 音频喂入间隔根据渲染稳定性/音频有效性/P95 动态切换（FG 33/50/70ms，BG 55/80/120ms），高负载时降频。

---

## 2025-12-23 对齐补充（Preset 切换降峰）

- Preset 切换期间进入短暂“压力窗口”，临时下调 AudioBus 分析/BeatTempo 输入/ProjectM 音频喂入频率，并暂停预取队列，降低切换峰值。

---

## 2025-12-23 对齐补充（AIVJ 音频驱动强化）

- AIVJ 的宏变化幅度与过渡时长加入 accent 驱动（拍稳时更敢变化，拍弱时更稳）。
- 运行态 accent 增强增加 bass/body 驱动的 fusion 微增（保持 tone guard，避免过亮/过暗）。

---

## 2025-12-23 对齐补充（音频驱动表现力增强）

- AIVJ accent 影响引入 profile 差异化（peakRave 更强，ambient/drone 更稳），并给 slots 增加轻量脉冲层提升细节律动。
- AudioControls 预设参数更新（attack/release/权重），加强音乐性但避免过亮/过暗。

---

## 2025-12-23 对齐补充（AIVJ accent 可观测）

- Diagnostics AIVJ debug 增加 `accent/slotPulse/source` 便于定位音频驱动强度。
- DecisionTrace 记录 `aivj.accent01` 与 `aivj.slotPulse01`，便于 topology 追踪运行态变化。
