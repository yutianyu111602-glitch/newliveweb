# Debug UI 对接文档（开发交接 + 数据链路梳理）

> 本文面向：前端/图形/交互同学，以及要用 FigmaAI 产出“纯样式”的同学。
> 目标：把“后端逻辑/数据链路”说清楚，同时给出 Debug UI 的可扩展接口约定（不改逻辑前提下，先把样式做对）。

---

## 0. 项目现状速览（事实口径）

- 工程类型：Vite + TypeScript + Three.js + ProjectM WASM
- UI 方式：纯 DOM 字符串模板（`src/app/renderShell.ts`）+ 运行时动态生成 inspector（`src/app/bootstrap.ts`）+ 全局 CSS（`src/style.css`）
- “后端/数据层”含义：不是传统 server；指应用内部的音频、状态、参数、渲染层、诊断契约。

---

## 1. 运行时总链路（从输入到画面）

### 1.1 音频链路

入口行为在 `src/app/bootstrap.ts`：

- Track（文件/URL/测试曲目）：`audioBus.loadFile()` / `audioBus.loadUrl()`，再 `audioBus.play()/toggle()`
- Input（麦克风/调音台/虚拟声卡）：`audioBus.loadInputDevice(deviceId)`
- 系统音频捕获：`navigator.mediaDevices.getDisplayMedia({ video:true, audio:true })` -> `audioBus.loadMediaStream(stream)`

核心数据对象：`AudioFrame`

- 来源：`AudioBus` 内部（分析器/播放器/流媒体）
- 消费：各个视觉层（ProjectM / LiquidMetal）+ Diagnostics

订阅点（关键）：`src/app/bootstrap.ts` 内 `audioBus.onFrame((frame) => ...)`

- `projectLayer.setAudioFrame(frame)`
- `liquidLayer.setAudioFrame(frame)`
- `diagnosticsTicker.maybeUpdate(frame)`
- 同时更新 UI 电平条 `#audio-level-bar`

### 1.2 视觉链路

- 渲染循环：`SceneManager.start()`
- 背景层（Background）是“互斥”的：由 `backgroundRegistry` + `visualStateController.syncBackground()` 控制
- 叠加层：ProjectM 作为一层渲染，可与背景 blend

主要 Layer：

- `src/layers/LiquidMetalLayerV2.ts`：Shader 背景（多 variant）+ 音频驱动 uniforms
- `src/layers/CameraLayer.ts`：摄像头输入纹理（需要权限）
- `src/layers/VideoLayer.ts`：视频纹理（可能受 autoplay 限制）
- `src/layers/ProjectMLayer.ts`：ProjectM WASM 渲染（喂 PCM 音频）

### 1.3 状态与参数链路（VisualState）

- 状态快照：`VisualStateV2`（全局 seed/macros/slots + background + projectm blend）
- 单一写入口：`createVisualStateController().applyPatch(...)`（在 `src/app/visualStateController.ts`）
- 背景参数定义：
  - 全局 schema：`src/state/paramSchema.ts`
  - 当前 background 类型的 schema：`src/background/backgroundRegistry.ts` + `backgroundRegistry.getParamDefs(type)`

数据流总结：

1. UI 事件 -> patch
2. patch 进 `visualStateController.applyPatch()` -> 得到新的 `lastVisualState`
3. controller 同步到 layer（切背景、更新 layer params、更新 projectm blend）
4. render loop 使用 layer 当前状态渲染

---

## 2. Debug UI 结构（现有 DOM/选择器 = 样式落点）

### 2.1 DOM 入口

- Toolbar + Canvas 的 DOM 模板：`src/app/renderShell.ts`
- 关键节点 ID（节选）：
  - 音频：`#audio-toggle #audio-status #audio-input-device #audio-input-use #audio-system-use #audio-level-bar #audio-level-text ...`
  - 预设：`#preset-select #preset-status #preset-next ...`
  - 视觉：`#visual-random #visual-favorite #visual-favorite-count ...`
  - 背景快捷开关：`#bg-liquid-toggle #bg-camera-toggle`
  - Inspector：`#inspector-toggle #inspector-search #inspector-reset #inspector-container`
  - MIDI：`#midi-connect #midi-target ...`

### 2.2 Inspector 的动态 HTML（非常重要）

生成位置：`src/app/bootstrap.ts` -> `renderInspector()`

结构规律：

- `#inspector-container.toolbar__inspector-container` 内是多个“组”
- 每个组外层是一个 `.toolbar__row`（但带 inline flex-direction:column）
- 组标题：`.toolbar__subtitle`
- 组内每个参数行：`.toolbar__row[data-scope][data-key]`
- 控件通过 `data-role` 标记类型：
  - number：`data-role="number-range"` + `data-role="number-input"`
  - enum：`data-role="enum-select"`
  - bool：`data-role="bool-toggle"`
  - string：`data-role="string-input"`
  - reset：`data-role="reset-param"`

样式建议：优先用这些 attribute selector 来做“高级但不改 DOM”的排版。

### 2.3 Favorites / Diagnostics 浮层

- Favorites：`src/features/favorites/FavoritesPanel.ts`（DOM 节点运行时创建）
  - 根：`#favorites-panel.nw-panel.nw-panel--favorites`
  - 条目：`.nw-fav-item` + `.nw-btn`（load/delete）
- Diagnostics：`src/features/console/DiagnosticsPanel.ts`
  - 根：`#diagnostics-panel.nw-panel.nw-panel--diagnostics`
  - 当前内部 label/value 用了 inline style（margin/fontWeight），后续若要更“设计化”，建议在不改逻辑前提下：用更具体选择器覆盖根节点下的 `div` 文本样式。

---

## 3. UI 可扩展接口约定（不重构前提下）

### 3.1 参数定义接口（扩展控件的根源）

现有 inspector 支持的 `def.kind`：`number | enum | bool | string`

- 定义来源：`paramSchema.ts`（全局/ProjectM blend/Background type） + `backgroundRegistry.getParamDefs(type)`（背景 params）

扩展规则：

- 新增参数：优先通过 schema 增加 def（不手写 UI）
- UI 会自动出现（因为 `renderInspector()` schema-driven）

如果未来要增加新的控件类型（例如 color、vec2、button action）：

- 需要同时扩展：
  1. schema def.kind
  2. `renderInspector()` 的 HTML 输出分支
  3. `inspectorContainer` 的事件处理（input/change/click）

### 3.2 背景类型扩展（新增背景/图层的标准路径）

当前背景类型（来自 schema + registry）：

- `liquid`（LiquidMetalLayerV2）
- `camera`（CameraLayer）
- `video`（VideoLayer）

新增一个背景类型（例如 `shaderReminderEther`）推荐步骤：

1. 新增 Layer（实现 `Layer` 接口）
2. 在 `backgroundRegistry` 注册 type -> paramDefs
3. 在 `paramSchema.background.type` enum 增加该 type
4. 在 `visualStateController.syncBackground()` 增加该 type 的切换逻辑
5. 在 `bootstrap.ts` 的初始化阶段 `sceneManager.addLayer(...)` 确保 layer 存在

### 3.3 “纯样式”改造的接口边界

本轮样式改造允许：

- 追加 CSS 覆盖（推荐追加到 `src/style.css` 末尾）
- 通过现有 class/ID/data-role 选择器实现布局优化

本轮不允许：

- 改 `renderShell.ts` 的 DOM 结构
- 改 `bootstrap.ts` 的 inspector HTML 结构
- 改控件文案/交互语义（除非明确要做产品改动）

### 3.4 AI/自动化的“样式接口层”（可选）

如果你希望“后端 AI / 自动化脚本”在**不改 DOM 结构**的前提下，能通过声明式方式控制 UI 视觉反馈（主题/密度/状态/警告），请看：

- `DEBUG_UI_AI_INTERFACE.zh.md`（CSS 变量 / 状态类 / data-attributes 的约定 + 推荐挂载点）

---

## 4. 新增背景素材（Shader Reminder 目录）

你给的“新增图层/背景原文件”在：`Shader Reminder (Community)`。
其中包含一组可复用的 fragment shader 字符串集合：

- `Shader Reminder (Community)/src/components/util/shaders.ts`
  - `flowingWavesShader`
  - `etherShader`
  - `shootingStarsShader`
  - （文件内还有更多 shader，后续可继续盘点）

集成建议（不在本轮做）：

- 作为 `LiquidMetalVariant` 的新 variant（最省事：复用当前 full-screen quad 管线）
- 或作为新的独立 Layer（若需要特殊 uniform/mask/viewport）

注意：Shader Reminder 项目内使用了 Tailwind + Radix 等；这里仅作为视觉/算法参考，不建议直接搬 UI 代码。

---

## 5. Debug UI 改造落地清单（给开发同学）

### 5.1 本轮（样式-only）

- 根据 [DEBUG_UI_FIGMAAI_BRIEF.zh.md](DEBUG_UI_FIGMAAI_BRIEF.zh.md) 产出 CSS
- 把 CSS 以“只追加”的形式加到 `src/style.css` 尾部
- 验收信号：
  - toolbar 每个 section 信息层级清晰
  - inspector 分组/行对齐，reset 不抢眼
  - favorites/diagnostics 浮层可读且不遮挡

### 5.2 下轮（若允许小幅结构改动，才做）

- 逐步移除 inspector/macro 的 inline style（改为 class 或 data-attribute）
- DiagnosticsPanel 内部从 inline style 迁移到 class（更利于设计化）

---

## 6. 关键文件索引

- UI 模板：`src/app/renderShell.ts`
- Inspector 生成：`src/app/bootstrap.ts`（`renderInspector()` + 事件委托）
- 样式：`src/style.css`
- 诊断：`src/features/console/DiagnosticsPanel.ts` + `src/app/bindings/diagnosticsTicker.ts`
- 收藏夹：`src/features/favorites/FavoritesPanel.ts`
- 状态控制器：`src/app/visualStateController.ts`
- 参数 schema：`src/state/paramSchema.ts`
- 背景注册表：`src/background/backgroundRegistry.ts`
- 新增背景参考：`Shader Reminder (Community)/src/components/util/shaders.ts`
