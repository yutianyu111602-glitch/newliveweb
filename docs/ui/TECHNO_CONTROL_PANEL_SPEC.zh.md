Techno 控制面板 UI 方案（中文详细版，结合代码）

目标
- 保留大量参数，但用 Ableton 插件风格的“模块化 + 可折叠”组织。
- 让演出时最重要的控制在最上层；高级/系统参数默认折叠。
- 与现有代码结构兼容，尽量复用现有 Inspector/宏控制/Audio 控制逻辑。

非目标
- 不改 AIVJ/音频分析/渲染算法本身。
- 不改变现有参数语义与路由（只调整 UI 结构与呈现）。

代码基线（必须遵循）
- Inspector 渲染/路由：`newliveweb/src/app/controllers/inspectorController.ts`
  - 组来源于 `paramSchema` 的 `group` 字段。
  - advanced 参数由 `showAdvanced` 控制显示。
- 参数定义与默认值：`newliveweb/src/state/paramSchema.ts`
- 视觉状态与宏槽：`newliveweb/src/features/visualState/visualStateStore.ts`
- 宏槽 UI：`newliveweb/src/app/controllers/macroSlotsController.ts`
- Toolbar 与主要 UI DOM：`newliveweb/src/app/renderShell.ts`
- Inspector 组样式：`newliveweb/src/style.css`（`.toolbar__inspector-group` 等）
- 音频驱动逻辑：`newliveweb/src/audio/audioControls/audioControls.ts`

交互总览
- 顶部固定 8 个宏旋钮（Macro 1–8），可手动调节或 MIDI 绑定。
- 下方按模块分区（折叠/展开），默认展开 2–3 个关键区：
  - Performance（核心）
  - Audio Reactivity（核心）
  - 其它默认折叠
- 每个模块标题可点击折叠，模块内保持统一控件节奏（knob/slider + value）。
- Shift 拖动细调、Alt 拖动粗调；双击重置默认值。

分区草图（ASCII）
+----------------------------------------------------------------------------------+
| Macro 1  Macro 2  Macro 3  Macro 4  Macro 5  Macro 6  Macro 7  Macro 8            |
| [value]  [value]  [value]  [value]  [value]  [value]  [value]  [value]           |
+----------------------------------------------------------------------------------+
| [v] Performance        | [v] Audio Reactivity   | [>] FFT / Spectrum             |
| [v] Fusion / Overlay   | [>] Capture / Render   | [>] Reliability                |
| [>] Input / Output     | [>] Background Layers  | [>] Advanced / Debug           |
| [>] UI / Layout                                                                  |
+----------------------------------------------------------------------------------+
| Panel content (Ableton-style modules: header + knob row + value readouts)        |
+----------------------------------------------------------------------------------+

参数清单与分组规则（详细）
说明：本清单的结构化版本保存在 `newliveweb/docs/ui/techno-control-params.json`。

1) Performance（默认展开，演出核心）
- Mode（Techno | Fusion | Capture）
  - UI: 下拉
  - 数据源：UI 逻辑层（不改变现有 state，作为模式标记）
- Reactivity（0.5–2.0，默认 1.2）
  - UI: 旋钮
  - 映射：audioKickBoost + audioBassBoost（渲染/炼丹参数）
- Motion（0.8–1.6，默认 1.1）
  - UI: 旋钮
  - 映射：timeScale（离线渲染参数）
- Brightness Clamp Min/Max（0..1，默认 0.02 / 0.90）
  - UI: 双滑杆或两个旋钮
  - 映射：frameLumaMin / frameLumaMax（离线渲染）
- Capture Density（1–6，默认 4）
  - UI: 旋钮
  - 映射：captureCount（离线渲染）

2) Audio Reactivity（默认展开）
- BPM Mode（Fixed | Range）
- BPM（60–200，默认 132）
- BPM Min/Max（90–200，默认 122 / 145）
- Swing（0–0.25，默认 0.08）
- Kick Boost（0.6–2.5，默认 1.6）
- Bass Boost（0.5–2.0，默认 1.4）
- Hat Boost（0.4–2.0，默认 1.2）
- Clap Boost（0.4–2.0，默认 1.0）
- Audio Seed（整数，默认 presetSeed）
说明：
- 这些参数直接对应离线渲染脚本：
  - `render-preset-frames.mjs` 中的 `audioBpm* / audioSwing / audio*Boost / audioSeed`
  - `run-queue-*.json` -> `run-overnight.ps1` -> `render-preset-frames.mjs`

3) FFT / Spectrum（默认折叠）
- FFT Enable（默认 off）
- FFT Smooth（0..1，默认 0.6）
- Band Weights：Low/Mid/High（0..2，默认 1/0.8/0.6）
- FFT -> Overlay Depth（0..1，默认 0.7）
- FFT -> Overlay Mix（0..1，默认 0.5）
- FFT -> Frame Pick Bias（0..1，默认 0.5）
说明：
- 这是新增计划模块，落地时建议用 AudioContext AnalyserNode 或内部 FFT。
- 若 FFT 不可用，回退到合成音频驱动（见计划文档 Phase 3）。

4) Fusion / Overlay（默认折叠）
- Overlay Mode（none | parallax，默认 none）
- Overlay Blend（screen/add/overlay/multiply，默认 screen）
- Overlay Mix（0..1，默认 0.55）
- Overlay Depth Px（0..128，默认 14）
- Overlay Scale（0..0.25，默认 0.06）
- Overlay Seed（整数，默认 202501）
- Overlay Source（manifest/path，默认 same pack）
说明：
- 对应 `render-preset-frames.mjs` 的 overlay 参数与 `presetFrameDump.ts` 的叠加逻辑。

5) Capture / Render（默认折叠）
- Warmup Frames（0–300，默认 120）
- Capture Every（10–120，默认 60）
- Capture Max Frames（3–12，默认 8）
- Out Size（128–512，默认 224）
- Format（webp | png，默认 webp）
- WebP Quality（0.6–1.0，默认 0.92）
说明：
- 该模块直接映射离线渲染参数，适合炼丹/批处理。

6) Reliability（默认折叠）
- Timeout Ms（5000–90000，默认 45000）
- Prewarm Timeout Ms（30000–180000，默认 120000）
- Retry Times（0–6，默认 3）
- Refresh Every（20–150，默认 90）
说明：
- 对应 `run-overnight.ps1` 与 `render-preset-frames.mjs`。

7) Input / Output（默认折叠）
- 输入（复用 `renderShell.ts` 的音频输入控件）
  - File：`#audio-file`
  - URL：`#audio-url` + `#audio-url-load`
  - System Out：`#audio-system-use`
- 输出/存储（炼丹）
  - OutDir（默认 `D:\aidata\...`）
  - Upload Root（默认 `Z:\code\aidata`）
  - Upload After Job（默认 on）
  - Skip Post（默认 off）
说明：
- 该分区可以是“运行控制”与“炼丹控制”共用的输出页签。

8) Background Layers（默认折叠）
说明：
- 使用 Inspector 现有分组，不改参数语义，仅重新排布。
- Group 映射（来自 `paramSchema.ts` 的 group 前缀）：
  - `Background/Type` -> 当前背景类型选择
  - `Background/Liquid` -> 液态层参数
  - `Background/Basic` -> 纯色/简单层
  - `Background/Camera` -> 摄像头层（含 deviceId）
  - `Background/Video` -> 视频层（含 src/loop/fit）
  - `Background/Depth` -> 深度层

9) Advanced / Debug（默认折叠）
- timeMode（fixedStep | realtime）
- fixedStepFps（1–120，默认 30）
- forceNewWasmModule（默认 off）
- headless（默认 on）
- logEvery（10–50，默认 25）
说明：
- 对应离线渲染脚本；不建议普通用户频繁调整。

10) UI / Layout（默认折叠）
- Collapse All / Expand All
- Show Advanced By Default（默认 off）
- Macro Row Height（small/medium/large，默认 medium）

与现有代码的对接策略
1) 宏区（Macro 1–8）
- 复用 `macroSlotsController` 渲染逻辑（`#macro-slots` 容器）。
- 每个宏槽对应 `VisualStateV2.global.macroSlots` 的 value/label。
- 若宏槽不足 8 个，可显示空槽占位，点击自动创建。

2) Inspector 分组折叠
- `inspectorController.ts` 已基于 `def.group` 渲染。
- 可在 UI 层引入“分组排序表”，对相同 group 前缀进行重排与折叠控制。
- `def.advanced` 与 “Show Advanced” 直接复用现有逻辑。

3) AIVJ / Audio Controls
- AIVJ 开关与风格选择仍使用 `renderShell.ts` 里现有控件：
  - `#auto-techno-toggle`, `#techno-profile-select`, `#audio-controls-toggle`
- AudioControls 参数源于 `audioControls.ts` 的 config（mixToMacros、weights 等），可在 Audio Reactivity 的“高级子面板”中呈现。

4) 离线参数（炼丹）
- UI 只负责保存到队列/配置文件（如 `run-queue-*.json`）。
- `run-batch.ps1` 和 `run-overnight.ps1` 直接读取队列字段。
- 参数的权威定义见：
  - `newliveweb/docs/ui/techno-control-params.json`
  - `newliveweb/scripts/aivj/render-preset-frames.mjs`

最小实现路径（建议）
1) 新增一个“Techno 控制面板”容器（复用现有 toolbar 样式）。
2) 将宏区、AIVJ 控制、Inspector 分区统一到一个折叠式面板。
3) 不改 paramSchema，仅调整 UI 分组顺序与折叠行为。
4) 离线参数以 JSON 配置保存，不影响运行时逻辑。
