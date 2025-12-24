# 更新报告（2025-12-17）

> 口径：以仓库当前代码为准；验收命令可重复执行；新增模块默认“低风险关闭”。

## 1. 验收口径（写死）

- Lint：`npm run lint`
- Dev 端到端验收：`npm run verify:dev`
  - 默认：复用/启动 `http://127.0.0.1:5174/`（与 `vite.config.ts` 的 dev 端口一致）
  - 产物：默认输出到 `artifacts/headless/`（可用 `VERIFY_OUT_DIR` 覆盖）
  - 需改端口时（示例 5176）：
    - bash/zsh：`VERIFY_HOST=127.0.0.1 VERIFY_PORT=5176 npm run verify:dev`
    - PowerShell：`$env:VERIFY_HOST='127.0.0.1'; $env:VERIFY_PORT='5176'; npm run verify:dev`
    - cmd.exe：`set VERIFY_HOST=127.0.0.1&& set VERIFY_PORT=5176&& npm run verify:dev`
- 生产构建：`npm run build`
  - 首次跑 `verify:*` 若缺浏览器：`npx playwright install`

## 2. 关键结论（TL;DR）

- 主链路稳定：外部音频输入 → AudioFrame → 多层渲染（ProjectM + LiquidMetal + 可选 Camera/Video）已可持续出帧，并通过 headless verify。
- `bootstrap.ts` 正在被拆分：UI/状态相关逻辑逐步下沉到 `src/app/controllers/*`，降低耦合、便于后续升级。
- 新增“节拍/速度（tempo）”分析：Essentia.js 放到 Worker 内，Inspector 可开关；默认关闭，避免对演出模式/验收造成风险。
- 修复一个潜在“上线直接挂”的问题：Vite 生产构建对 Worker 的默认格式与 code-splitting 冲突，已修复。

## 3. 变更清单（按模块）

### 3.1 音频输入与特征（更舞台化）

**目的**

- 针对 DJM 等立体声外部输入，让低/中/高频的可视化更“夸张但稳定”，并保留 raw→stage 的对照，便于调参。

**结果**

- AudioFrame 内同时保留：
  - `bandsRaw`：未经舞台化的三频（用于对照/诊断）
  - `bandsStage`：舞台化后的三频（用于驱动 UI/参数）
  - `features`：更高级特征（flux/centroid/loudness/flatness/zcr 等）
- Debug/样式侧：新增 AI CSS 变量（如 `--ai-audio-bass/mid/treble`、`--ai-audio-flux` 等）供纯样式响应。

**主要落点**

- `src/audio/StreamAudioProcessor.ts`
- `src/audio/AudioBus.ts`
- `src/audio/stageBands.ts`
- `src/types/audioFrame.ts`

### 3.2 摄像头/视频背景（可热切换 + 状态可见）

**目的**

- 舞台现场最怕“权限/用户手势/播放策略”导致黑屏；要把状态显性化并有回退护栏。

**结果**

- Camera/Video 作为背景层可用，拒权/错误时有提示与回退。
- Diagnostics 显示 `bg=` 与 `bgStatus=`（便于现场排障）。
- 可选 MediaPipe 人像分割（仅在开启相关参数时加载/使用）。

**主要落点**

- `src/layers/CameraLayer.ts`
- `src/layers/VideoLayer.ts`
- `scripts/sync-mediapipe-assets.mjs`
- `public/vendor/mediapipe/selfie_segmentation/*`

### 3.3 Debug UI：Inspector / Diagnostics / Favorites

**目的**

- Debug UI 要“可扫读、可扩展、可验收”，并且不依赖手工点点点来判断是否回归。

**结果**

- Inspector：schema-driven（基于 `paramSchema`），支持按 scope 分发 patch。
- Diagnostics：语义化 DOM class（便于稳定样式 + headless verify 对齐），展示 raw/stage/feat 等关键指标。
- Favorites：支持多收藏横向对比 + CSV 导出，并进入 headless 验收项。

**主要落点**

- `src/app/controllers/inspectorController.ts`
- `src/features/console/DiagnosticsPanel.ts`
- `src/features/favorites/FavoritesPanel.ts`
- `src/state/paramSchema.ts`
- `scripts/headless-verify.mjs`

### 3.4 新增：Essentia.js Beat/Tempo（Worker + Inspector 可选模块）

**目的**

- 让“节拍/速度”作为可选能力接入：默认不影响演出；需要时再打开。

**结果**

- Worker：`RhythmExtractor2013` 分析输出 `bpm/confidence/ticks`，并计算 `beatPhase/beatPulse`。
- 主线程：只在 `enabled=true` 时创建 Worker；结果注入 `AudioFrame.features`：
  - `tempoBpm`, `beatPhase`, `beatPulse`, `beatConfidence`

### 3.5 UI：旋钮（Ableton/插件风）+ 插槽模块化

**目的**

- 现场操作要像插件/调音台：旋钮手感稳定、读数明确、拖动时不抖、不误触。

**结果**

- 宏与关键参数使用旋钮 UI（range input + 自绘外观），并用 pointer capture 实现“竖向拖动调参”。
  - 支持 `Shift` 微调（更小步进）。
  - 拖动过程中会派发 `input`/`change`，保持与现有监听逻辑兼容。
- MacroSlots 区域改为“插件卡片”式布局（小旋钮 + 小开关），并对拖动更新做 rAF 节流，降低高频 patch 造成的卡顿。
- Audio 区域补回关键读数：Energy / BPM / Confidence，便于现场排障与确认 beat/tempo 是否在工作。

**主要落点**

- `src/app/renderShell.ts`
- `src/app/bootstrap.ts`
- `src/style.css`

### 3.6 视觉融合：图层叠放顺序 + 默认混合更友好

**目的**

- 修复“前景层看起来没融合/像硬盖上去”的主观问题，让 Camera/Video/Basic 能自然叠在 LiquidMetal 之上。

**结果**

- 调整渲染顺序（`renderOrder`）：LiquidMetal 作为基底，Basic/Camera/Video 作为叠加层。
- 当用户从“关闭”切到某个前景层时，若该层仍处于默认不透明状态，会自动给一个更利于混合的默认透明度（避免一上来把底层完全盖死）。
- Camera 增加与 Video 一致的 cover-fit 缩放策略（按视口覆盖），减少拉伸/黑边，提升舞台观感。

**主要落点**

- `src/layers/BasicBackgroundLayer.ts`
- `src/layers/CameraLayer.ts`
- `src/layers/VideoLayer.ts`
- `src/app/bootstrap.ts`

### 3.7 系统音频捕获：失败清理 + 状态更可见

**目的**

- Windows loopback/系统音频在浏览器侧容易出现“无声/残留流/重复启动”问题，需要更强的失败清理和更明确的反馈。

**结果**

- 系统音频捕获失败或无音轨时，会主动 stop 相关 tracks，避免残留资源影响下一次启动。
- 成功后会把捕获到的音轨 label 反馈到状态文案，便于确认到底抓到的是哪个来源。

**主要落点**

- `src/app/controllers/audioTransportController.ts`

---

## 4. Techno Auto + 音频控制层设计报告（2025-12-17）

> 目标：在不解析 projectM 预设内部参数的前提下，用少量平滑的“音频控制量”统一驱动 ProjectM + LiquidMetal + Camera/Video，支持 Techno 场景下的自动化（2–8s 插值 + beat/小节量化）、并配套中英双语 UI。

### 4.1 当前整体架构概览

- 舞台与图层

  - `src/SceneManager.ts`：总控舞台，负责按顺序添加/启动各图层（ProjectM、LiquidMetal、Basic、Camera、Video），并提供 `onAfterRender` 钩子。
  - 背景层：
    - `src/layers/LiquidMetalLayerV2.ts`：金属液态背景，核心视觉基底。
    - `src/layers/BasicBackgroundLayer.ts`：简单几何/渐变前景层。
    - `src/layers/CameraLayer.ts`：摄像头背景（可选 MediaPipe 人像分割）。
    - `src/layers/VideoLayer.ts`：视频背景，支持 `opacity/playbackRate` 控制。
  - ProjectM 层：
    - `src/layers/ProjectMLayer.ts`：负责加载/切换 .milk 预设，以及混合参数（`opacity/energyToOpacityAmount/blendMode`）。
    - 预设库配置：`src/config/presets.ts` + `src/config/presetLibraries.ts`。

- 音频处理与特征

  - `src/audio/AudioBus.ts`：集中处理音频输入（文件/URL/系统音频/Mixxx），输出 `AudioFrame`：
    - 基础：`energy`, `bands{low,mid,high}`, `rms`, `peak`, `pcm512Mono`, `sampleRate`, `timeSec`。
    - “舞台化”三频：`bandsStage`，用于驱动视觉。
    - 高级特征：通过 Meyda 计算 `flux`, `centroid`, `loudness`, `flatness`, `zcr` 等。
  - `src/audio/beatTempo/beatTempoAnalyzer.ts`：
    - 通过 Essentia.js Worker（`beatTempoWorker.ts`）运行 `RhythmExtractor2013`，输出：
      - `bpm`, `confidence01`, `beatPhase`, `beatPulse`（0..1）。
    - 在 `BeatTempoConfig.enabled=true` 时才启动 Worker，避免资源占用。

- 宏系统 + 参数映射

  - 宏定义（全局控件）：
    - `src/state/paramSchema.ts` → `global.macros`：`fusion/motion/sparkle` 三个 0..1 宏。
  - 宏到参数映射：
    - `src/features/macros/computeMacroPatch.ts` 定义 `MacroMappingBase` + `MacroMappingRanges`：
      - ProjectM：`opacity`, `energyToOpacityAmount`
      - LiquidMetal：`opacity/brightness/contrast/timeScale/waveAmplitude/metallicAmount/metallicSpeed`
      - Basic：`opacity/speed`
      - Camera：`opacity`
      - Video：`opacity/playbackRate`
    - `src/app/bootstrap.ts` 中的 `applyAudioCouplingRuntime()` 每帧计算 patch，并用 `backgroundRegistry.applyParams()` 等方法，将宏映射到所有层，形成统一的控制入口。

- UI 与多语言
  - 主控制面板：`src/app/renderShell.ts`
    - 使用 `getLang()` + `s(zh,en)` 实现中英双语文本。
    - 默认语言为中文，右上角 `#lang-toggle` 按钮一键切换语言并 `window.location.reload()`。
    - 提供 “Techno 自动 / Techno Auto” 总开关（`#auto-techno-toggle`）。
    - 提供 “Techno 风格 / Techno Style” 下拉菜单（`#techno-profile-select`）与状态摘要（`#techno-profile-summary`），用于快速切换/观察 Ambient/Peak/Dub/Drone/VideoVJ。
    - 提供快速开关：音频控制层（`#audio-controls-toggle`）与节拍/速度分析（`#beat-tempo-toggle`），便于现场临时降载/排障。
  - i18n 状态：`src/app/i18n.ts`
    - `getLang`/`setLang`/`toggleLang`，通过 `localStorage` 持久化当前语言。
  - Inspector 面板：`src/app/controllers/inspectorController.ts`
    - 所有 UI 文案（展开/收起、推荐、重置）都支持中英双语。
    - 参数定义完全来自 `paramSchema`，新加入的 `Audio/Controls/technoProfile` 也会自动展示为下拉菜单。

### 4.2 AudioControls：统一的音频控制层

- 配置结构：`src/audio/audioControls/audioControls.ts`

  - `AudioControlsConfig`：
    - 开关：`enabled`
    - 混合度：`mixToMacros`（0..1，音频宏对 UI 宏的侵入程度）
    - 平滑参数：`attackMs`, `releaseMs`, `maxDeltaPerSec`
    - 各层权重：`amounts.{projectm/liquid/basic/camera/video}`（0..1）
    - 特征权重：
      - `weights.fusion.{energy,bass,flux,beatPulse}`
      - `weights.motion.{...}`
      - `weights.sparkle.{...}`

- 输出快照：`AudioControlsSnapshot`

  - 原始音频控制量：
    - `energy01`, `bass01`, `flux01`, `beatPulse01`（全部平滑后的 0..1）
  - 宏控制量：
    - `fusion01`, `motion01`, `sparkle01`（以 0.5 为中心，偏移控制宏）

- 算法要点

  - 对每个信号使用 `smoothAttackRelease`：
    - Attack/Release 时间常数控制快慢。
    - `maxDeltaPerSec` 限制每秒最大变化量，防止跳变。
  - 基于 `weights` 对音频信号做加权平均：
    - `fusion` 更偏整体能量 + 低频；
    - `motion` 更偏 flux + beat；
    - `sparkle` 更偏高频/flux 的“闪烁”。
  - 将信号映射到宏空间：
    - `signalToMacro01(x01)` 保持“无音频”时宏接近 0.5，避免图像完全静止或过暗。

- 启动与接线（`bootstrap.ts`）
  - 默认值：`AUDIO_CONTROLS_DEFAULTS = getDefaultsForSchema(paramSchema.audio.controls)`。
  - 持久化：
    - `AUDIO_CONTROLS_KEY = "newliveweb:audio:controls:v1"`
    - `loadAudioControlsValuesFromStorage()` / `persistAudioControlsValues()`。
  - 配置转换：
    - `toAudioControlsConfig(values)` 将 schema 值转换为 `AudioControlsConfig`。
  - 每帧更新：
    - `lastAudioControlsSnapshot = audioControls.onAudioFrame(frame, nowMs);`
    - `applyAudioCouplingRuntime(nowMs)` 使用 snapshot + 宏系统映射到 ProjectM + 背景层。

### 4.3 Techno 节拍时钟与随机策略升级

- Techno 节拍时钟：`updateTechnoBeatClock`

  - 输入：
    - `nowMs`
    - `beat`（来自 `beatTempoAnalyzer.getSnapshot()`）
    - `frame`（当前 `AudioFrame`）
  - 行为：
    - 优先使用 Essentia 的 `beatPhase/confidence01`：
      - 在 `beatPhase` 从接近 1 跳到接近 0 时认为发生了 beat。
    - 若节拍不可靠：
      - 使用 `flux` 峰值作为 “类 beat”：
        - `flux > 0.65` 且前一帧 `< 0.45` 且间隔 >= 240ms，认为发生一次 beat。
    - 计数：
      - `beatCount++`，每 4 个 beat 认为一个 bar（4/4 结构）。
      - 每满一 bar → `barCount++`，返回 `barBoundary = true`。

- 宏过渡（2–8s 插值）：`startMacroTransition` + `applyMacroTransition`

  - 目标：
    - 用平滑的宏曲线替代“瞬间随机所有参数”，在 2–8 秒内完成视觉过渡。
  - `startMacroTransition({nowMs,to,durationMs})`：
    - 记录当前宏为 `from`，目标宏为 `to`。
    - 持续时间限制在 [200ms, +∞)。
  - `applyMacroTransition(nowMs)`：
    - 使用 `smoothstep01` 对时间归一化，插值 `fusion/motion/sparkle`。
    - 每次应用后：
      - `applyGlobalPatch({macros: next})`
      - `syncMacroControlsFromState()`
      - `applyMacroMapping()` → 更新 ProjectM + 背景层。

- 随机策略改造：`applyRandomVisualState`
  - 旧行为：
    - 直接随机 ProjectM 预设 + 一堆参数，变化剧烈且不可控。
  - 新行为：
    - 按钮按下时：
      - 若节拍可靠（有 `lastBeatPhase`）：
        - 不立即动，只设置 `manualRandomPending = true`；
        - 真正的 preset 切换 + 宏过渡，会在下一次 bar 边界触发。
      - 若节拍不可靠：
        - 立即生成一个基于当前能量的宏目标；
        - 启动 2–8 秒插值；
        - 调用 `maybeChangePreset("Random")` 切换预设。
    - 在主音频循环中：
      - 每帧根据 `updateTechnoBeatClock` 的结果，如果 `manualRandomPending && (barBoundary || !beatOk)`：
        - 启动宏过渡；
        - 调用 `maybeChangePreset("Random")`。

### 4.4 Techno Auto 自动化与 8 小节结构

- Techno Auto 状态与 UI

  - 状态：
    - `AUTO_TECHNO_KEY = "newliveweb:auto:techno:v1"`
    - `technoAuto: { enabled: boolean }`
  - UI：
    - `renderShell.ts` 中的 `#auto-techno-toggle`，标签为“Techno 自动 / Techno Auto”。
    - `bootstrap.ts` 中绑定 `onTechnoAutoChange`：
      - 同步 `technoAuto.enabled`；
      - `persistTechnoAuto()` 存储；
      - `resetTechnoScheduler()` 清空 beat/bar 计数与宏过渡状态。

- 自动行为（主音频循环内）
  - 每帧：
    - 通过 `beatTempoAnalyzer.onAudioFrame(frame)` 更新节拍分析；
    - 读取 snapshot，调用 `updateTechnoBeatClock` 得到 `barBoundary` 与 `beatOk`。
  - 当 `technoAuto.enabled` 且 `barBoundary=true`：
    - 若 `nextPresetBar` 尚未初始化：
      - 设为 `barCount + 8`。
    - 当 `barCount >= nextPresetBar`：
      - 触发一次 preset 更换：`maybeChangePreset("Techno")`；
      - 更新 `nextPresetBar = barCount + 8`。
    - 若当前没有活跃的 `macroTransition`：
      - 根据当前能量生成一个宏目标；
      - 在 2–8 秒内插值到目标。

### 4.5 Techno 风格 Profile 预设（Ambient / Peak Rave / Dub / Drone / Video VJ）

- Profile 参数入口

  - `src/state/paramSchema.ts` 中新增：
    - `Audio/Controls/technoProfile`：
      - 值域：`"ambient" | "peakRave" | "dub" | "drone" | "videoVj" | "custom"`
      - 默认值：`"ambient"`
  - Inspector 中自动展示为下拉菜单，可通过搜索 `Audio/Controls` 快速定位。

- 类型与状态

  - `bootstrap.ts` 中定义：
    - `type TechnoProfileId = "ambient" | "peakRave" | "dub" | "drone" | "videoVj" | "custom";`
  - 与 `audioControlsValues` 一起存储在 `localStorage` 对应 key 下。

- `applyTechnoProfile(profile: TechnoProfileId)` 行为

  - 入口：`bootstrap.ts` 中，在 Techno Auto UI 初始化附近：
    - 当 Inspector 对 `audio.controls` scope 发送 patch 且包含 `technoProfile` 时：
      - `applyInspectorPatch` 会优先调用 `applyTechnoProfile(profile)`。
  - 通用流程：
    - 构建 `patch: Record<string, unknown>`，至少包含当前 profile 的标记：
      - `patch.technoProfile = profile`
    - 若 `profile === "custom"`：
      - 只更新 `technoProfile`，保留用户手动调的所有数值，不改 Techno Auto 与 BeatTempo。
    - 其他 profile：
      - 根据风格设置：
        - `enabled/mixToMacros/attackMs/releaseMs/maxDeltaPerSec`
        - `amountProjectM/Liquid/Basic/Camera/Video`
        - `wFusion*/wMotion*/wSparkle*`
      - 同时调整：
        - `technoAuto.enabled`（是否自动运行）
        - `BeatTempoConfig.enabled` 及部分参数（BPM 范围、windowSec、updateIntervalMs 等）
      - 应用顺序：
        - `persistTechnoAuto()`；
        - `resetTechnoScheduler()`；
        - `applyAudioControlsPatch(patch)`；
        - 同步 UI：`autoTechnoToggle.checked = technoAuto.enabled`；
        - `refreshInspectorStatus()`。

- 各风格 Profile 的设计思路（概要）
  - `ambient`（Ambient Techno）
    - 慢速起伏，亮度和形变平缓：
      - `mixToMacros ≈ 0.55`；`attack ≈ 360ms；release ≈ 1600ms；maxDeltaPerSec ≈ 1.2`
      - Liquid 权重大，ProjectM 中等，Video 极弱。
      - 以能量+低频为主要驱动，`beatPulse` 权重很低。
      - 默认关闭 Techno Auto & BeatTempo。
  - `peakRave`（Peak-time Rave Techno）
    - 快速响应、强烈闪烁：
      - `mixToMacros ≈ 0.9`；`attack ≈ 80ms；release ≈ 420ms；maxDeltaPerSec ≈ 4.0`
      - ProjectM/Liquid/Video 全部高权重，Camera 有一定权重。
      - `flux + beatPulse` 权重大，适合主时段 Rave。
      - 默认开启 Techno Auto；
      - BeatTempo 打开，BPM 限制在约 122–138 区间。
  - `dub`（Dub Techno）
    - 中速、重低频、空间感：
      - `mixToMacros ≈ 0.7`；`attack ≈ 260ms；release ≈ 1400ms；maxDeltaPerSec ≈ 1.6`
      - Liquid 最大，其次 ProjectM 与 Basic；Camera/Video 较轻。
      - `bass` 权重偏高，`beatPulse` 较弱，整体偏平滑。
      - 默认关闭 Techno Auto & BeatTempo，鼓励演出者手动推进。
  - `drone`（Drone / 极慢氛围）
    - 几乎没有突变，适合 drone/ambient 段：
      - `attack ≈ 800ms；release ≈ 2600ms；maxDeltaPerSec ≈ 0.8`
      - Liquid+ProjectM 权重大，Basic/Video 较轻。
      - beat 相关权重接近 0，主要看 RMS/flux 的大趋势。
      - 默认关闭 Techno Auto & BeatTempo。
  - `videoVj`（强调 Video Cut / VJ）
    - Video 为主角，ProjectM 为纹理叠加：
      - `mixToMacros ≈ 0.95`；`attack ≈ 70ms；release ≈ 280ms；maxDeltaPerSec ≈ 4.5`
      - `amountVideo = 1.0`；Liquid/Basic/Camera 中等；ProjectM 相对较小。
      - `flux + beatPulse` 是主驱动力，Video 的 `opacity/playbackRate` 变化更明显。
      - 默认开启 Techno Auto；
      - BeatTempo 打开，BPM 116–140 的较宽范围。

### 4.6 使用与演出范例

- Ambient Techno 开场

  - 选择 profile：`Audio/Controls/technoProfile = ambient`
  - Techno Auto 保持关闭，只使用新的 Random 策略（目标 → 2–8s 插值）。
  - 适合长 intro 氛围：偶尔敲一下 Random，在 bar 边界上做平滑变换。

- Peak-time Rave Techno 主时段

  - 选择 profile：`peakRave`（自动开启 Techno Auto + BeatTempo）。
  - 播放 128–135 BPM 的 Rave/Techno，系统每 8 bar 自动换 preset，并在 bar 内做 2–8s 宏过渡。
  - 手动 Random 留给真正的 drop 时刻使用。

- Dub Techno 深夜 Session

  - 选择 profile：`dub`，手动控制 Random/宏，保持视觉缓慢推进。
  - 可以适当提高 Liquid 的 `timeScale/waveAmplitude` 上限，强调“雾状”流动感。

- Drone / 实验氛围

  - 选择 profile：`drone`，关闭 Techno Auto & BeatTempo。
  - 播放 drone/ambient/noise 等长音，视觉缓慢变化，没有爆点。

- Video VJ / Techno + 视觉切割
- 选择 profile：`videoVj`（自动开启 Techno Auto + BeatTempo）。
- 使用高对比度、结构明显的视频作为背景；ProjectM 只做纹理叠加。
- 在节拍上，利用 flux/beat 驱动 Video 的透明度与播放速率，实现 Techno 风格的“切割闪烁”。

### 4.7 参数详解 + 调参流程（attack/release/BPM/MIDI）

**关键控制参数（Audio/Controls）**

- `mixToMacros`（0..1）
  - 作用：音频推到宏上的“侵入度”。0 表示完全按 UI 宏值，1 表示完全由音频控制。
  - 建议：
    - Ambient/Dub：0.5–0.7（保留手动控制）
    - PeakRave/VideoVJ：0.85–0.95（让音乐说了算）
- `attackMs`（10–2000）
  - 作用：音频上升响应时间（毫秒），越小越“抢节奏”，越大越慢热。
  - 调参经验：
    - 视觉“抖得太多、跟 hi-hat 一样碎”：适当增大 attack。
    - 视觉“跟不上鼓点、总是慢半拍”：减小 attack。
- `releaseMs`（10–5000）
  - 作用：音频下降响应时间，控制尾巴长度。
  - 调参经验：
    - 视觉闪一下就没了（太干）：增大 release，让残影更长。
    - 视觉一直糊成一片，看不出结构：减小 release。
- `maxDeltaPerSec`（0–10）
  - 作用：限制每秒允许的最大变化幅度，防止瞬间跳变。
  - 调参经验：
    - 视觉“偶尔突然跳一下”：减小该值。
    - 整体太“粘”，高能量段也不够兴奋：适当增加。
- `amountProjectM/Liquid/Basic/Camera/Video`（0..1）
  - 作用：音频宏映射到各图层时的“混入量”。
  - 调参经验：
    - 需要一个“安静背景”时，把非主角层 amount 调低甚至 0。
    - 做 VJ 强调 Video cut：`amountVideo` 拉到 1.0，同时降低 `amountProjectM`。
- `wFusion* / wMotion* / wSparkle*`
  - 作用：三组宏对不同音频特征（energy/bass/flux/beatPulse）的权重。
  - 调参建议：
    - 想让 Fusion 更跟低频：提升 `wFusionBass`。
    - 想让 Motion 更跟 hi-hat/噪声：提升 `wMotionFlux`。
    - 想让 Sparkle 更偏闪烁：提升 `wSparkleFlux` + 适当提高 `wSparkleBeat`。

**节拍/速度参数（Audio/BeatTempo）**

- `windowSec`（4–20）
  - 作用：节拍分析的时间窗，越长越稳定，越短越敏捷但易跳。
  - 建议：
    - 演出前期（曲目风格稳定）：8–12 秒。
    - 疯狂跨风格/变拍的 set：可稍微减小至 6–8 秒。
- `updateIntervalMs`（250–5000）
  - 作用：多久重新跑一次节拍分析。
  - 建议：700–1200ms 左右即可，太频繁浪费 CPU，太少响应慢。
- `minTempo/maxTempo`
  - 作用：限制节拍检测的 BPM 范围，避免错误落在 60 或 200 这种倍频。
  - 调参流程（实战版）：
    1. 根据整场 set 定一个大概 BPM 区间（例如 124–135）。
    2. 先把 `minTempo/maxTempo` 设置成宽一点：如 115–140。
    3. 现场听几首后，如果检测结果总是偏低（节奏感觉慢一倍）：适当提高 `minTempo`。
    4. 如果经常误锁到太高 BPM：略微降低 `maxTempo`。
- `inputFps`
  - 作用：分析输入帧率，默认 20 足够；一般无需修改。

**基于真实演出反馈的微调步骤（建议）**

1. 场前彩排

   - 选每种 profile（Ambient/PeakRave/Dub/Drone/VideoVJ）各 1–2 首典型曲目。
   - 调整：
     - “整体律动感”：主要动 `attackMs/releaseMs/maxDeltaPerSec`。
     - “层级平衡”：主要动 `amount*` 系列。
     - “跟哪一部分乐器”：动 `w*Energy/Bass/Flux/Beat`。
   - 结论写成简单笔记（曲目名 + 调整方向）。

2. 演出早段（前 30 分钟）

   - 重点观察：
     - Visual 是否在 drop 前就泄露“爆点”（变化太早）：稍微增大 attack 或降低 `w*Beat`。
     - Break 段是否过于兴奋（视觉没休息）：适当增大 release 或减小 `mixToMacros`。

3. 中场（Peak-time）

   - 对 `PeakRave` / `VideoVj` profile：
     - 如果 preset 换得太密：增大 bar 数（未来可做参数），或暂时关掉 Techno Auto，改用手动 Random。
     - 如果 Video cut 感不够：提高 `amountVideo` 与 `wMotionFlux/wSparkleFlux`。

4. 事后复盘
   - 根据录屏/录音回看：
     - 标记“视觉跟不上/超前/过于暴躁/过于平”的时间段。
     - 反推这些段落下的参数值，微调各 profile 的 attack/release/BPM 区间，并记录在本报告中。

**MIDI 映射（Ableton Move / 8 推子控制器）**

- 内置 MIDI Map 能力

  - UI 入口：工具栏中的 MIDI 区域：
    - `Connect`：连接 Web MIDI（浏览器需支持 `navigator.requestMIDIAccess`）。
    - `Target` 下拉框：选择绑定对象。
    - `Learn`：进入学习模式，扭动硬件旋钮即可绑定。
    - `Unbind` / `Clear`：解除当前/全部绑定。
  - 支持目标：
    - 宏：`macro:fusion/motion/sparkle`
    - ProjectM 混合参数：`param:projectm.opacity` 等
    - 背景参数：`param:liquid.timeScale`、`param:video.opacity` 等
    - 插槽：`slot:<id>`（宏快照槽位）
    - 新增：Audio Controls / BeatTempo 参数：
      - `param:audio.controls.attackMs/releaseMs/mixToMacros/maxDeltaPerSec/...`
      - `param:audio.beatTempo.minTempo/maxTempo/windowSec/updateIntervalMs/...`

- 建议的 Ableton Move 映射（8 推子/旋钮示例）
  - 上排 8 个推子/旋钮：
    1. `macro:fusion`（整体融合感）
    2. `macro:motion`（运动感）
    3. `macro:sparkle`（闪烁）
    4. `param:audio.controls.mixToMacros`
    5. `param:audio.controls.attackMs`
    6. `param:audio.controls.releaseMs`
    7. `param:audio.controls.maxDeltaPerSec`
    8. `param:projectm.opacity`
  - 下排 8 个旋钮：
    1. `param:audio.controls.amountProjectM`
    2. `param:audio.controls.amountLiquid`
    3. `param:audio.controls.amountBasic`
    4. `param:audio.controls.amountCamera`
    5. `param:audio.controls.amountVideo`
    6. `param:audio.beatTempo.minTempo`
    7. `param:audio.beatTempo.maxTempo`
    8. `param:audio.beatTempo.windowSec`
  - 若设备有推子：
    - 分配给 `slot:*`，作为不同“宏场景”的 crossfade 控制。

> 提示：目前 MIDI 主要针对“数值型参数”。`Audio/Controls/enabled` 等开关建议仍通过 UI 操作，以保持逻辑简单和可预期；如果你的打击垫输出的是 Note（而非 CC），需要在设备侧把 Pad 映射成 CC，才能用当前的 `Learn` 捕捉到。

- Inspector：新增 scope `audio.beatTempo`，可调参数并写入 `localStorage`：
  - key：`newliveweb:audio:beatTempo:v1`
- 样式接口：新增 CSS 变量：
  - `--ai-audio-beat-pulse`
  - `--ai-audio-tempo-bpm`

**主要落点**

- `src/audio/beatTempo/beatTempoAnalyzer.ts`
- `src/audio/beatTempo/beatTempoWorker.ts`
- `src/app/bootstrap.ts`
- `src/state/paramSchema.ts`
- `src/shims/essentia.d.ts`
- `scripts/sync-essentia-assets.mjs` + `public/vendor/essentia/*`

**许可证风险（必须注意）**

- `essentia.js` 为 **AGPL-3.0**：若项目将分发/商用，需先明确合规策略（否则建议默认不集成或提供可移除的构建开关）。

### 3.5 构建/工程：修复 Worker 生产构建

**问题**

- `vite build` 下，Worker 默认 `format=iife` 与 code-splitting 构建不兼容，导致生产构建失败。

**修复**

- 设置 `worker.format='es'`，保证 module Worker 可正常打包。

**落点**

- `vite.config.ts`

## 4. 影响面（对使用者/对开发者）

### 4.1 对使用者（演出/本机）

- 默认行为不变：beat/tempo 默认关闭；未开启时不会创建 Worker、不会额外跑算法。
- Diagnostics 更可读：能更快定位“当前音频源/背景状态/音频三频是否在跳”。
- Camera/Video 更稳：失败时状态可见，避免“看起来没反应”。

### 4.2 对开发者（扩展/升级）

- `bootstrap.ts` 逐步薄化：新功能优先做成 controller/module，再由 bootstrap 装配。
- Inspector schema 扩展成本降低：新增参数只需补 `paramSchema` + scope patch 分发。

## 5. 回滚/禁用策略（避免现场翻车）

- Beat/Tempo：保持 `Audio/BeatTempo/enabled=false`；或清除 `localStorage` 的 `newliveweb:audio:beatTempo:v1`。
- MediaPipe 分割：关闭对应 Camera 参数（如 `segmentPerson`）。
- 若遇到构建问题：确认 `vite.config.ts` 保留 `worker.format='es'`。

## 6. 已知注意点 / 风险

- 浏览器安全上下文：若不是 `localhost/127.0.0.1` 或 HTTPS，摄像头/音频权限可能失败（现场用同网段访问需额外方案）。
- 性能：Beat/Tempo 算法在 Worker，仍需关注窗口长度/更新间隔对 CPU 的影响（默认参数已偏保守）。
- 许可证：Essentia.js AGPL-3.0 是“发布层面”的硬风险点。

## 7. 使用说明（现场/调试）

### 7.1 打开节拍/速度（Beat/Tempo）

1. 同步本地 wasm 资源（若 `public/vendor/essentia/*` 已存在可跳过）：`npm run sync:essentia`
2. 打开页面 → 打开 Inspector → 搜索 `Audio/BeatTempo/enabled` → 打开
3. 观察 Diagnostics 的 AudioFrame：出现 `tempo=` / `beat=` / `conf=`（若无，先检查音频源是否确实在输入）

### 7.2 关闭节拍/速度（回到零风险）

- Inspector 里关闭 `Audio/BeatTempo/enabled`
- 或清空本地配置（会回到默认关闭）：删除 `localStorage` key `newliveweb:audio:beatTempo:v1`

### 7.3 摄像头/分割相关

- 摄像头失败/拒权时：优先看 Diagnostics 的 `bg=`/`bgStatus=`。
- 人像分割为可选项：只在开启对应参数时生效；若性能不足，直接关闭分割即可回退到普通 camera 背景。

## 8. 文件索引（快速定位）

- 装配入口：`src/app/bootstrap.ts`
- Controller（逐步拆分）：`src/app/controllers/*`
- 音频主链路：`src/audio/AudioBus.ts`、`src/audio/StreamAudioProcessor.ts`、`src/types/audioFrame.ts`
- 三频舞台化：`src/audio/stageBands.ts`
- Beat/Tempo：`src/audio/beatTempo/beatTempoAnalyzer.ts`、`src/audio/beatTempo/beatTempoWorker.ts`
- 参数 schema：`src/state/paramSchema.ts`
- Diagnostics：`src/features/console/DiagnosticsPanel.ts`
- Favorites：`src/features/favorites/FavoritesPanel.ts`
- 构建/Worker：`vite.config.ts`
- 资源同步：
  - `scripts/sync-essentia-assets.mjs` → `public/vendor/essentia/*`
  - `scripts/sync-mediapipe-assets.mjs` → `public/vendor/mediapipe/selfie_segmentation/*`

## 9. 演出前检查清单（推荐）

- 统一入口：只用 `localhost` 或 `127.0.0.1` 打开页面（避免权限/secure context 差异）。
- 音频源：确认 `Diagnostics -> AudioContext` 显示 `source=stream` 且 `input=` 有设备名（DJM/声卡）。
- 防反馈：确认输入监听默认不出声（输出音量仍为 0 或 monitor 未开启）。
- 背景：切到 camera/video 时，看 `bgStatus=`；失败则先回退 liquid，避免现场卡在黑屏。
- 验收命令：现场机器至少跑一次 `VERIFY_HOST=127.0.0.1 VERIFY_PORT=5176 npm run verify:dev`（确保渲染持续出帧）。
