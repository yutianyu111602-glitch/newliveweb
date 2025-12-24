# newliveweb AI 同步包（给另一位 AI 的最短对齐材料）

> 目标：让多位 AI 并行推进时**不互相踩坑**、不产生重复方案、并且每一步都有最小验收信号。
> 权威路由：先看 `DOCS_INDEX.zh.md` → `MASTER_SPEC.zh.md`（事实口径）→ `DATA_INTERFACES.zh.md`（接口细节）→ `TODOS.zh.md`（可执行任务）。

---

## 0. 当前要交付的“演出级目标”

- 使用本机/外置声卡输入（例如 DJM-900）驱动渲染（能量/频段/PCM）。
- 摄像头可作为底层背景（camera），并且权限/失败提示明确，不会“黑屏无提示”。
- 不破坏现有硬约束：`AudioBus` 为唯一音频分发源；Random/Favorite/Inspector 都走 controller patch；Diagnostics + headless verify 仍是验收真相源。

---

## 1. 关键事实（以代码为准）

- 已落地：
  - `AudioBus` 输出 `AudioFrame`（含 `energy` 与 `energyRaw?`），可 URL opt-in EMA 平滑（`?audioSmoothing=ema&audioSmoothingAlpha=0.2`）。
  - 本地输入设备捕获：`AudioBus.loadInputDevice(deviceId?)`（`getUserMedia({ audio })` → `MediaStreamAudioSourceNode`），工具栏 `Input` + `Use input` 可切换到输入源，默认音量 0 防反馈。
  - Background：`liquid/camera/video` 类型存在；`BackgroundRegistry` 负责互斥启用与 params 过滤。
  - `CameraLayer` / `VideoLayer` 已实现（含最小护栏与状态可见性：拒权回退/短提示/Diagnostics bgStatus）。
  - `VisualStateV2`、`ParamSchema`、`VisualStateController.applyPatch`、Inspector/Random/Favorite 已形成闭环（但仍需治理遗留直写入口）。
  - 演出模式一键配置：`Save show`/`Show`（localStorage：`newliveweb:showConfig:v1`）保存并恢复音频偏好 + `VisualStateV2`。
  - MIDI bindings UX：显示 `Bindings: N`，支持 `Clear` 清空；存储于 `newliveweb:settings:v1`（仅 `midi.bindings`，不进入 Favorites）。
  - Video autoplay 被拒时：工具栏 `Retry video` 支持用户手势重试。

- 已补齐（演出关键护栏）：
  - Camera：拒权/错误时短提示并回退 liquid；Diagnostics 展示 bg 状态摘要。
  - Video：src 为空/播放被拒会给短提示；autoplay 被拒时可点 `Retry video` 走用户手势重试路径。

---

## 2. 并行分工建议（避免改同一文件）

### AI-A：本地音频输入（核心后端 + 最小 UI）（已完成）

- 主要改动文件（尽量只动这些）：
  - `src/audio/StreamAudioProcessor.ts`：新增 `loadFromStream(stream)` + teardown（stop tracks）
  - `src/audio/AudioBus.ts`：新增 `loadInputDevice(deviceId?)`（getUserMedia）
  - `src/app/renderShell.ts`：新增音频输入设备 UI 控件（下拉 + 按钮 + 状态文本）
  - `src/app/bootstrap.ts`：设备枚举/授权/记忆 deviceId，调用 AudioBus；Diagnostics 增输入源显示
- 最小验收：
  - 点击 “Use input” 后，Diagnostics 显示 `source=stream` 且 `energyRaw/energy/rms/peak` 持续跳动；拒权/无设备提示且不崩；可切回 Track。

### AI-B：Camera/Video UX 护栏 + 控制器收敛（不动音频底层）

- 主要改动文件（尽量只动这些）：
  - `src/layers/CameraLayer.ts` / `src/layers/VideoLayer.ts`：错误状态暴露（或回调），便于 UI 提示
  - `src/features/console/DiagnosticsPanel.ts`：展示 `background.type`、camera/video 状态摘要
  - `src/ui/LiquidMetalControlPanel.ts`：消除直写 `layer.params`（统一走 patch）或在非 liquid 模式彻底禁用
  - `src/app/visualStateController.ts`：若需要，补齐背景切换时的 params defaults/过滤策略
- 最小验收：
  - camera 权限拒绝时 UI 有提示并可回退 liquid；video src 为空/播放被拒时提示；Random 默认不会切到 camera/video；Favorite restore 一致。

### 共同遵守（两位都必须）

- 不变约束：见 `MASTER_SPEC.zh.md` 第 2 节。
- 不做“双入口”：所有 UI 变更只产生 patch，统一走 `VisualStateController.applyPatch`。
- 任何新增字段：必须同时更新
  - `MASTER_SPEC.zh.md`（事实/验收）
  - `DATA_INTERFACES.zh.md`（接口/字段）
  - `TODOS.zh.md`（可执行 TODO + 最小验收）

---

## 3. 快速定位（文件/模块入口）

- 主装配：`src/app/bootstrap.ts`
- UI DOM：`src/app/renderShell.ts`
- 音频：`src/audio/AudioBus.ts` + `src/audio/StreamAudioProcessor.ts`
- 状态/迁移：`src/features/visualState/visualStateStore.ts`
- Controller：`src/app/visualStateController.ts`
- 背景：`src/background/backgroundRegistry.ts` + `src/layers/*Layer.ts`
- 验收：`src/features/console/DiagnosticsPanel.ts` + `scripts/headless-verify.mjs`

---

## 4. 冲突避免机制（简单但有效）

- 开工前：在 `AI_SYNC_BOARD.zh.md` “Claim” 区域写下你要改的文件列表。
- 提交前（或合并前）：对照 `AI_SYNC_BOARD.zh.md`，避免同时大改同一文件。
- 若必须改同一文件：先把变更拆小（例如仅加函数/仅加 UI 控件），并在 board 中注明预计改动范围。
