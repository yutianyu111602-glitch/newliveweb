### ✅ P1-Next：收藏夹（Favorites）逻辑收敛到 Controller（bootstrap 去重）

- 目标：把 `bootstrap.ts` 内部的收藏夹加载/保存/面板控制逻辑迁移到 `initFavoritesController`，减少启动文件内的状态分叉与重复 UI wiring，同时保持原有 UX（“收藏:X”“点击打开收藏夹”、点击收藏后自动弹出面板）。
- 实现：

  - `bootstrap.ts`：移除 `loadFavoritesFromStorage/saveFavoritesToStorage/createFavoritesPanel` 的直接使用，改为创建 `favoritesController` 统一负责：
    - storage key（v1/v2）
    - favorites 列表增删持久化
    - 面板 show/hide/toggle
    - 收藏数量 label 刷新（通过 formatter 保持中文）
  - `favoritesController.ts`：支持 `showPanel/hidePanel`，并支持 `countLabelFormatter/countLabelTitle` 用于保持既有 UI 文案。

- 证明（本地可复现）：
  - `npm --prefix newliveweb run verify:check`
  - 结果：`OK: artifacts look good (framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true)`

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

## P0+：决策可观测性（AIVJ Topology Overlay ｜高优先级独立图层）

目标：在演出/调参时，实时回答一句话——**“AIVJ/音频/层混合到底在驱动哪些东西？”**
形式：一个**永远在最顶层**的独立覆盖层窗口（可拖拽、可缩放、可折叠/隐藏），显示“信号 → 决策 → 写入”的拓扑图。

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

### 2025-12-19

- ProjectM avgLuma 采样默认开启（downsample 8×8 / 500ms），并在 Diagnostics 的 ProjectM 行显示 `luma=...`。
- 新增“闭环可见性 PI（默认关闭）”：基于 `avgLuma` 生成 ProjectM 的 runtime-only `externalOpacity` 偏置（带积分限幅 + 输出限幅 + 变化率限幅）。
- 闭环参数接入 schema-driven Inspector：`Audio/Controls/ProjectMClosedLoop/*`（可直接在 Inspector 调参）。
- ProjectM avgColor 采样默认开启（downsample 8×8 / 500ms），并在 Diagnostics 的 ProjectM 行显示 `rgb=...`。
- 新增“色偏治理 color-loop（默认关闭）”：基于 `avgColor` 运行时调制 LiquidMetal 的 tintHue/tintStrength/contrast（runtime-only，不写入收藏/持久化状态）。
- color-loop 参数接入 schema-driven Inspector：`Audio/Controls/ProjectMColorLoop/*`。
- P0+：AIVJ Topology Overlay（顶层覆盖层）已接入：实时显示 Audio/BeatTempo/AudioControls/AIVJ/Macro/overlayBudget/PM sampler/闭环 → 层参数写入的拓扑与强度；支持点击节点查看关键数值（与 Diagnostics 同源），UI 状态持久化到 localStorage。
- 验收：`npm run verify:check` 通过（framesRendered=286, finalOutputChanges=true, pmCanvasChanges=true）。

- P0+ V1（最小可解释闭环）：引入 `DecisionTrace`（ring-buffer）并在关键写入点打点；Topology Overlay details 面板可按模块/参数前缀查看最近 trace（writer/target/value/reason）。
- P2 Compositor v1（资源策略落地）：SceneManager 新增 fixed-size compositor 目标模式 + RT 池化（LRU，MAX_POOL=3），并对外暴露配置 API；Inspector 新增 `Renderer/Compositor` scope 可调 targetMode 与 fixedW/H。
- P2 Compositor v1（色彩空间统一）：compositor 中间 RT 改为 linear（`LinearSRGBColorSpace`），确保 blend 发生在 linear space，最终由 `renderer.outputColorSpace` 统一输出到显示色彩空间。
- P2（可验证可观测）：Diagnostics 的 Renderer 行与 Topology Overlay(ProjectM 节点) 增加 compositor 只读字段（enabled/blendMode/targetMode/fixedW/H/poolSize），便于 headless 与现场确认实际工作模式。
- P2（统一 blend 策略可证明）：compositor blend shader 显式使用 `linearToOutputTexel` 做 linear→output 转换，并在 compositor config 暴露 `shaderVersion`（Diagnostics/Overlay 可见）。
- P2（RT 色彩空间可证明）：compositor config 暴露 `rtColorSpace=LinearSRGBColorSpace`（Diagnostics/Overlay 可见），与 shaderVersion 一起形成“RT 线性 + 输出转换”的证据链。
- ProjectM per-preset “内部可调入口”（最小可用版）：新增 per-preset runtime tuning registry（localStorage，按 presetUrl 生效），并通过 Inspector `ProjectM/PresetTuning` scope 暴露 `externalOpacityBiasSigned` / `audioReactiveMultiplier`。
- 验收：`npm run verify:dev` 通过（Summary: dsf=1.5 framesRendered=270 fps=4.88 tMs=55272.7 finalOutputChanged=true projectMCanvasChanged=true；产物：`artifacts/headless/report.json`、`diff.png`、`trace.zip`、`dev-server.log`）。

- P0+ V1（Top-N contributors 最小版）：details 面板对 `DecisionTrace` 做聚合，按模块前缀展示 Top targets / Top writers（按 weightSum+count 排序）并附带 last age 与数值范围（若可解析）。
- 验收：`npm run verify:check` 通过（framesRendered=270, finalOutputChanges=true, pmCanvasChanges=true；产物：`artifacts/headless/report.json`、`diff.png`）。

- P0+ V2（过滤器 + 动态参数子图 最小版）：Topology Overlay details 增加 trace 过滤器（scope 前缀 / writer contains / minDelta），并支持对可展开模块节点一键展开 Top targets 为“参数子节点”（动态边/节点）。DecisionTrace 事件补充 `delta` 字段以支持 minDelta 过滤。
- 验收：`npm run verify:check` 通过（framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true；产物：`artifacts/headless/report.json`、`diff.png`）。

- P0+ V2（过滤器作用到拓扑图）：filters 会直接对拓扑图节点/边做变暗（不匹配 scope/writer/minDelta 的写入相关节点自动 dim），并且 node hotness 也基于过滤后的 trace 计算（现场更容易聚焦）。
- 验收：`npm run verify:check` 通过（framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true；产物：`artifacts/headless/report.json`、`diff.png`）。

- P1（VisualState apply 路径收敛：背景层）：`applyVisualStateSnapshot` 的背景层应用逻辑改为复用同一入口 `applyBackgroundLayerPatch`（与 Inspector/toolbar 同源），降低 bootstrap 分叉风险，同时保留 UI 控件同步行为。
- 验收：`npm run verify:check` 通过（framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true；产物：`artifacts/headless/report.json`、`diff.png`）。

- P1（Favorites 收敛补强）：legacy `favorites:v1` 的清理逻辑从 `bootstrap.ts` 下放到 `initFavoritesController` 内部（bootstrap 不再直接 `removeItem`），进一步减少启动文件分叉点。
- 验收：`npm --prefix newliveweb run verify:check` 通过（framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true）。

- P1（renderShell DOM refs 收敛）：将 `#macro-fusion-value/#macro-motion-value/#macro-sparkle-value` 三个 DOM 引用纳入 `renderShell.ts` 的 `DomRefs`，并移除 `bootstrap.ts` 中对应的 `document.querySelector`（改用 `dom.macro*ValueText`），降低启动文件对 DOM 结构的隐式依赖。
- 验收：`npm --prefix newliveweb run verify:check` 通过（framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true）。

- P1（VisualStateStore 统一入口：Inspector/MIDI/Background patches 收敛）：在 `bootstrap.ts` 内引入 `BackgroundRegistry + createVisualStateController`，并将 `projectm.blend` 与 `background.layer.*` 的 patch 应用路径统一改为走 `visualStateController.applyPatch(...)`（避免多处手写 apply + 手动拼 lastVisualState 的分叉）。
- 验收：`npm --prefix newliveweb run verify:check` 通过（framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true）。

- P1（VisualStateStore 统一入口补全：background.type + UI->layer params 收敛）：将 `applyBackgroundTypePatch` 的状态切换也改为走 `visualStateController.applyPatch(...)`，并将 `setBasic/Camera/Video/DepthParamsFromUi` 改为统一调用 `applyBackgroundLayerPatch(...)`（从而经由同一 VisualStateController 入口更新 runtime + lastVisualState）。
- 验收：`npm --prefix newliveweb run verify:check` 通过（framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true）。

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

---

### ✅ P1-Next：Liquid Layer 入口收敛到 VisualStateController（移除 bootstrap 直写 params/updateParams）

- 目标：消除 `bootstrap.ts` 中对 Liquid layer 的“直写 `liquidLayer.params` + `updateParams()` / 直 `setEnabled()`”分叉，让所有 Liquid 参数与 enabled 变更统一走 `applyBackgroundLayerPatch(...) → visualStateController.applyPatch(...)`，保证 state 与 runtime 同源。
- 实现：
  - `applyBackgroundLayerPatch(...)`：不再删除 `enabled`（让 VisualState 能保存 enabled）；UI toggle 同步但不再直接调用 `layer.setEnabled()`（由 BackgroundRegistry/Controller 负责 runtime 应用）。
  - Liquid 相关写入点（macro mapper / ensureVisibleBaseline / random / random current params / liquid toggle change handler）全部改为调用 `applyBackgroundLayerPatch("liquid", ...)`。
- 证明（本地可复现）：
  - `npm --prefix newliveweb run verify:check`
  - 结果：`OK: artifacts look good (framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true)`

---

### ✅ P1-Next：补齐 bootstrap 内残留的 setEnabled 直写（统一走 applyBackgroundLayerPatch）

- 背景：`bootstrap.ts` 在外部格式化/编辑后出现回退片段（重新出现 `layer.setEnabled(...)` 直写），会再次制造 state/runtime 分叉。
- 实现：
  - `applyBackgroundTypePatch(...)` 内的“确保选中层启用/切走 liquid 关闭”改为 `applyBackgroundLayerPatch(...)`。
  - 启动时的初始 background enable 改为 `applyBackgroundLayerPatch(type, { enabled })`（替代直接 `setEnabled`）。
  - UI toggle change handlers（liquid/basic/camera/video/depth）改为统一入口 `applyBackgroundLayerPatch(type, { enabled })`。
- 证明（本地可复现）：
  - `npm --prefix newliveweb run verify:check`
  - 结果：`OK: artifacts look good (framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true)`

---

### ✅ P0 现场验收前置：工具栏 range/number + 旋钮支持鼠标滚轮调参（并阻止页面滚动）

- `npm --prefix newliveweb run verify:check`
- 结果：`OK: artifacts look good (framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true)`

---

### ✅ P0：AIVJ Auto toggle 可开启且状态可观测（验收项已满足）

- 现状确认：
  - AIVJ enabled/profile 默认从 localStorage 读取（默认 enabled=true，但尊重用户持久化关闭）；UI toggle/pill/summary 会同步更新。
  - AIVJ runtime 每帧都会调用 `aivjController.onFrame(...)`，并在允许自动化时对 MacroBank 做写入仲裁；首次启用时会 `requestImmediateTrigger()`，静音也会触发一次 morph（用于“可观测在跑”的快速确认）。
  - 关闭 AIVJ 后会 `resetToBase(...)`，并进入“off”路径，不再继续触发 AI morph（仍允许 AudioControls 走 unified single-writer）。
- 证明（headless）：
  - `npm --prefix newliveweb run verify:check`
  - 结果：`OK: artifacts look good (framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true)`
```

---

###  2025-12-19：更像 code review 的逻辑审计（Camera/Depth/WS）资源释放与背压修补

- 问题（潜在风险）：
  - `DepthWsClient` 对每条 WS 消息都 `createImageBitmap()`，无背压控制；如果发送端过快，会堆积解码队列并造成 CPU/内存抖动。
  - `LiDARClient.start()` / `stop()` 存在典型 async 竞态：`stop()` 在权限弹窗期间触发时，`start()` 仍可能在之后成功并复活 stream；并发 `start()` 也可能导致多次 `getUserMedia()`。
  - `CameraLayer.startStream()` 缺少stale completion防护：disable/restart 后仍可能把旧的 video/texture 挂回去。

- 修补（最小、低风险）：
  - `DepthWsClient`：加入只解码一个、只保留最新帧的 backpressure，并用 session token 丢弃/close 掉 stale `ImageBitmap`。
  - `LiDARClient`：加入 start promise 合并 + generation token；`stop()` 会使 in-flight `start()` 变为 abort，并确保获得的 stream 会被 stop。
  - `CameraLayer`：加入 `startNonce`，避免 stale start 结果在 disable/restart 后落地。

- 证明（headless）：
  - `npm --prefix newliveweb run verify:check`
  - 结果：`OK: artifacts look good (framesRendered=280, finalOutputChanges=true, pmCanvasChanges=true)`

---

###  2025-12-20：P0 修复落地（op 滑条/参数随机/收藏夹 preset 强制载入）

- Op 滑条无效：在 overlayBudget 动态乘子逻辑里加入手动调节短暂冻结（`noteOverlayBudgetHold(layer)`），避免每帧预算覆盖导致 UI 调节看不出效果。
- 参数随机：`visualRandomParamsButton` 改为只随机 ProjectM 当前预设的宏旋钮 + 宏槽位并只影响 ProjectM（`applyMacroBankToRuntime(..., { applyLiquid: false })`），同时只随机 ProjectM `blendMode`，不切 preset、不改背景层参数/开关。
- 收藏夹：加载收藏时强制载入 preset（即使 HOLD），并把失败原因拼进提示（`forcePresetLoad: true` + reasonNote）。

- 证明（headless / check）：
  - `npm --prefix newliveweb run verify:check`
  - 结果：`OK: artifacts look good (framesRendered=74, finalOutputChanges=true, pmCanvasChanges=true)`

- 证明（headless / dev server）：
  - `npm --prefix newliveweb run verify:dev`
  - 结果：`Summary: dsf=1.5 framesRendered=246 finalOutputChanged=true projectMCanvasChanged=true`

---

###  2025-12-20：宏接管逻辑 + 交互调整（用户优先、AI/音频暂停）

- 宏接管：当用户触发宏旋钮/宏槽位，立即进入 “用户接管” 持有期（9s），在持有期内暂停 AI + 音频对宏的写入；宏状态栏显示“已由用户接管 / 已由AI接管”。
- 宏映射：保留 Macro Map 配置逻辑，宏旋钮驱动 ProjectM/Liquid 使用映射表，用户调整不会被 AI/音频实时覆盖。
- 交互手感：旋钮拖动加入横向拖拽 + 更快的拖动映射，降低 Windows 鼠标操作的负担。

- 证明（verify:dev / dev-server.log）：
  - 未找到 `dev-server.log`（仅发现 `newliveweb/logs/vite-dev-5174.out.log` / `newliveweb/logs/vite-dev-5174.err.log` / `newliveweb/dev.log`，其中无 `verify:dev` Summary）。

---

###  2025-12-20：verify:dev Summary（来自 headless artifacts）

- dev server：
  - `newliveweb/artifacts/headless/dev-server.log`：`[verify-dev] Reused existing dev server`
- Summary（从 `newliveweb/artifacts/headless/report.json` 提取）：
  - `Summary: dsf=1.5 framesRendered=222 finalOutputChanged=true projectMCanvasChanged=true pageErrors=0 console=74`
- 额外发现：
  - `favoritesCompare.ok=false`（等待 `#favorites-panel` 超时），见 `newliveweb/artifacts/headless/report.json` 与 `newliveweb/artifacts/headless/browser-console.log`
