# newliveweb 重构/融合/音频总线 · AI 执行规范

> 目标：把现有计划转成可直接执行的规范，锁死语义、接口与验收。顺序：先可测（P0），再拆 main.ts（P1），最后做强互相影响（P2）。
> 最新权威入口：`MASTER_SPEC.zh.md`（本文件作为执行规范/补丁日志保留，后续只追加）。

---

## 1. 不变项 / 禁止事项

- 单一音频源：所有分析/分发只能经 AudioBus 输出的 `AudioFrame`，严禁第二套平滑/增益。
- 层边界：`layers/*` 不碰 DOM/localStorage，不互相 import；`features/*` 只通过公开 API 与 layer/bus/store 交互。
- BlendParams 语义固定：`opacity`=PM overlay 强度；`audioDrivenOpacity = base + energy*amount`；未来 Compositor 也沿用。
- 颜色管理统一：renderer `outputColorSpace = sRGB`，toneMapping 显式；禁止各层各自 gamma。

---

## 2. 接口 / 类型（现阶段必须）

- AudioFrame：`version,timeSec,sampleRate,pcm2048Mono,pcm512Mono,pcm512StereoLR,bands,rms,peak,energy,isSilent`。
- AudioBus：`loadFile/loadUrl/play/pause/toggle/setVolume/setLoop/onFrame/getSnapshot/audioContextState`，内部完成重采样 512 与 energy 归一。
- ProjectMLayer：`setAudioFrame(frame)` 喂 PM，`setBlendParams({opacity,blendMode,audioDrivenOpacity,energyToOpacityAmount})`。
- LiquidMetalLayerV2：`setAudioFrame(frame)`（用 bands/energy）；`setGlobalColor` 可后续加 palette/tint。
- SceneManager：显式设置 colorSpace/toneMapping，`getRendererInfo()` 用于诊断。
- DiagnosticsPanel：显示 `AudioContext.state`、`AudioFrame.energy/rms/peak`、`__projectm_verify.framesRendered/lastAudioRms`、renderer pixelRatio/outputColorSpace/toneMapping。

---

## 3. 执行计划（先 P0 再 P1 再 P2）

### P0：最小闭环（可测 + 可调 + 同步协同）

**成功定义**

- 诊断可见：AudioContext.state、AudioFrame.energy/rms/peak、`__projectm_verify.framesRendered/lastAudioRms`、renderer.getPixelRatio/outputColorSpace/toneMapping。
- 音频只经 AudioBus；BlendParams 语义保持；RT 分辨率跟 renderer drawingBuffer（或固定比例）绑定，避免 DPR/CSS 裁切。
- 验收：`npm run dev` 可看到诊断字段；headless 报告 frames 渐增、canvas hash 变化。
  **最小 TODO**
- main.ts 补齐：消除残留乱码，BlendParams 接线（UI/收藏/随机至少传 opacity/audioDrivenOpacity/energyToOpacityAmount/blendMode），Diagnostics 每帧刷新 PM/renderer 信息。
- Favorites/Random 用完整 VisualState：将 Favorites 存储升级为 VisualState，Random 基于 ParamSchema 生成，确保收藏/恢复一致性。
- headless-verify 明确验收：帧计数递增、canvas hash 变化；输出关键字段日志，便于本地/CI 核对。
- renderer/诊断节流：每帧更新 renderer/PM 诊断可能耗时，考虑 0.5~1s 节流或按需更新，保持字段真实。

### P1：结构化拆分

- renderShell：抽出 DOM/query，main.ts 不再含大块模板。
- VisualStateStore：集中收藏/随机/应用；Favorites/Random 基于 VisualState。
- ParamSchema + SeededRng：随机/默认值统一来源（先覆盖 LiquidMetal/Blend 关键字段）。
- 业务块拆分：Favorites/Presets/controller/bootstrap 从 main.ts 拆出，仍仅通过公开 API 交互。

### P2：强互相影响

- 低频统计反馈：PM canvas 低频采样 `avgLuma/avgColor`，可选调制背景（可关）。
- Compositor v1：背景 →RT，PM→ 纹理，Shader 实现 overlay/screen/add，保持 BlendParams 语义。

---

## 4. 高风险点

- PM WASM：对 `Module.HEAP*` 访问敏感，改动前后要跑日志/验证。
- DPR/尺寸：PM canvas + Emscripten 交互，resize 需兼容 DSF=1.5 的 headless 验证。
- 本地音频：统一走 `__local_audio`，避免 `/@fs`。

---

## 5. 交付物清单

- P0：Diagnostics 面板文件 + AudioBus + AudioFrame 类型；headless-verify 通过且帧计数/哈希变化。
- P1：renderShell + VisualStateStore + paramSchema + seededRng + bootstrap；main.ts 变薄。
- P2：sampler/compositor，带开关/强度，默认关闭以保证稳定。
- 基础设施文档：`INFRASTRUCTURE_PLAN.zh.md` 作为后续扩展（宏观旋钮/全参数面板/背景可插拔/MIDI）规范入口。

---

## 6. 交接与补丁日志

### 6.1 给下一位 AI 的注意事项

- main.ts 曾因编码混乱出现模板/日志乱码；编辑时请保持 UTF-8，避免混入 BOM 或 GBK。
- AudioBus 是唯一分发源；禁止新增第二套 onFrame/energy 计算。
- Diagnostics 字段必须是真实数据（不要写死），每帧/定期刷新 renderer 和 `__projectm_verify`。
- 文档大改不要与代码改混在同一提交，避免再次误删/覆盖。

### 6.2 已打的补丁（本地）

- 修复 main.ts 乱码（ProjectM 初始化日志、快捷键提示等），接入 AudioBus/Diagnostics。
- 新增 AudioFrame 类型、AudioBus 实现、DiagnosticsPanel、SceneManager colorSpace/toneMapping 显式化。
- LiquidMetalLayerV2/ProjectMLayer 支持 `setAudioFrame`，ProjectM 支持 BlendParams 能量调制。
- 规范文档本次重写为 UTF-8 可读版本，移除所有乱码。
- ParamSchema + SeededRng：新增 `src/state/paramSchema.ts` 与 `src/state/seededRng.ts`，Random 视觉已改为 schema 驱动且带 `global.seed`（可复现随机基础）。
- Headless 验收摘要：`scripts/headless-verify.mjs` 追加 `framesRendered/finalOutputChanged/projectMCanvasChanged` 输出，便于快速定位“帧冻结/没动”。
- Windows 文档协作：新增 `REFRACTOR_PLAN_CLEAN.zh.md` 作为 UTF-8 干净版计划（`REFRACTOR_PLAN.zh.md` 保留历史原文不覆盖）。

### 6.3 守门/验证链路现状（2025-12-15）

- `npm run verify:ci`：`guardrails` → `tsc --noEmit` → `verify-dev`(自动启动/复用 Vite) → Playwright headless，当前可稳定 exit 0 并产出 `artifacts/headless/*`。
- `scripts/verify-dev.mjs`：Windows 下改为杀进程树（taskkill /T /F），避免 Vite 子进程残留导致“终端卡住”。
- `scripts/headless-verify.mjs`：
  - 忽略 `/__local_audio` 的 `net::ERR_ABORTED`（媒体请求中止属常见非致命情况）。
  - 对 Vite HMR/page reload 造成的 `Execution context was destroyed` 做一次重试（避免边编辑边跑验证误失败）。
  - 修复关闭 browser 时 page close/crash 被计入错误的假阳性，exit code 现在与 `page-errors.log` 一致。
  - 调试汇总行仅在失败或 `VERIFY_DEBUG=1` 时输出。
- `ProjectMLayer` 新增 `getBlendParams()` 供 VisualState 快照使用。

### 6.4 另一位 AI 当前进度（根据其报告对齐）

- 已在 `main.ts` 将 Favorites/Random 升级为 VisualState v1（包含 ProjectM preset/presetUrl/opacity/blendMode/audioDrivenOpacity/energyToOpacityAmount + LiquidMetal params），收藏/恢复走完整 state。
- 已补迁移逻辑：旧 favorites（仅 opacity + liquidParams）可迁移到 v1。
- 下一步（仍待做/可选）：
  - 把 BlendParams（blendMode/audioDrivenOpacity/energyToOpacityAmount）接入 UI（手动调节/保存），并与 VisualState 保持一致。
  - Diagnostics 刷新节流/字段核对（避免每帧过重）。
  - 保持 `verify:ci` 作为每次修改后的必跑验收。

---

## 7. 2026 银色·太空流体色彩规范（Shader/Compositor 指南）

- 色盘：液态金属 `#d8dde7` / 高光 `#fefefe` / 暗部 `#0f1118`；黑洞蓝黑 `#060712 -> #0f1b2d -> #3f4b5f`；点缀：冰蓝 `#21d8ff`、电紫 `#f14dff`，少量酸绿 `#b7ff4a`。
- 材质：液态金属 metalness 0.85~1.0、roughness 0.08~0.18；太空尘 metalness 0.2~0.4、roughness 0.35~0.5；黑洞缝隙低反射（`#03040a~#0b0f1c`）可叠内发光。
- Shader/Compositor：背景 radial gradient + curl noise flow（低频大尺度，高频 10~20%）；Overlay 用 Screen/SoftLight，Add 仅高光极值，保持 gamma 正确；Glow 只用于点缀，阈值后再 bloom。
- UI/诊断配色：暗底 `#0f1118`，文字灰 `#c9d0da`，错误红 `#ff5f6c`，成功绿 `#6de28d`，强调用冰蓝/电紫，避免大面积暖色。
- 动态节奏：背景流速 <0.05 units/s，高光抖动 0.2~0.3；黑洞中心 0.2~0.4 Hz 脉冲，可与 energy 绑定 0.2~0.5 权重。
- 禁忌：避免大面积饱和红/橙；避免层内各自 gamma，统一在 Compositor/renderer 处理。
