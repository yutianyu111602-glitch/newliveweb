# TODOS_ARCHIVE（历史计划存档）

> 说明：此文件为从 `TODOS.zh.md` 迁移出的历史阶段/旧结构内容（Phase/宏观旋钮/未来增强等）。
> 执行入口以 `TODOS.zh.md` 的 Now/Next/Later 为准；设计推导以 `AIVJ_DESIGN.zh.md` 为准；硬件与实验以 `HARDWARE_INTEGRATION.zh.md` 为准。

---

## 1. P0（建议优先做：小改动、高收益、低风险）

- [x] **本地音频输入（MediaStream）打通**

  - 后端：`StreamAudioProcessor.loadFromStream`（`MediaStreamAudioSourceNode`）+ teardown；`AudioBus.loadInputDevice(deviceId?)`
  - 前端：工具栏 `Input` 下拉 + `Use input`（用户手势授权）；USB 插拔触发 `devicechange` 自动刷新；记忆 `newliveweb:audio:preferredSource`/`newliveweb:audio:inputDeviceId`
  - 防反馈：切到输入源后默认音量设为 0（可手动调高）
  - Diagnostics：显示 `source=stream` + input label；energy/raw/rms/peak 持续跳动
  - 验收：选择 DJM-900 等输入后能驱动渲染；拒权/无设备提示且不崩溃；可用 “Track” 快捷切回测试音轨；`verify:dev` 不回归

- [x] **本地音频输入（MediaStream）现场护栏（最小）**

  - 内容：提供“切回播放测试音轨”的最小路径（输入模式下 Play 按钮显示为 “Track”）；权限拒绝/无设备时提示更明确
  - 约束：不新增页面/弹窗；默认监控音量保持 0（避免现场反馈）
  - 验收：输入 → 驱动 → 可切回；拒权不崩溃且可恢复

- [x] **文档口径对齐（append-only）**

  - 影响面：`DATA_INTERFACES.zh.md`、`MASTER_SPEC.zh.md`、（可选）`docs/reference/PROJECTM_INTEGRATION.md`
  - 内容：更新为 VisualStateV2 / favorites v2 key / video schema 现状 / LiquidMetal 新增 contrast / 新增本地音频输入与设备选择
  - 验收：只追加；不删不改旧段落；`verify:dev` 仍通过

  - 状态：已追加更新（DATA_INTERFACES / MASTER_SPEC / PROJECTM_INTEGRATION）；待后续如需再补充 video schema 现状再追加

- [x] **Random 在“无 presets”场景的非阻塞提示**

  - 来源：`LOCAL_DEV_GUIDE.md`
  - 内容：`applyRandomVisualState` 若 `getAllPresets().length===0`，给 UI 一个短提示（不弹 modal、不新增页面）
  - 验收：无 manifest 时，Random 仍能随机参数且提示出现；提示可在 2–3s 内自动消失；headless verify 不受影响

- [x] **LiquidMetalControlPanel 的“遗留入口”收敛**

  - 动机：避免 UI 双入口导致收藏/随机/面板漂移
  - 内容：确保它所有改动都走 store/controller（或直接隐藏/弃用，仅保留 Inspector）
  - 验收：调参 → 收藏 → 恢复 → 参数一致；`verify:dev` 通过

- [x] **LiquidMetal shader 清理：移除未提供的 uniforms（uBaseHue/uBaseSaturation）或补齐**

  - 风险：WebGL uniform mismatch/警告，未来改 shader 更难排障
  - 验收：无 console shader 警告；视觉不变；`verify:dev` 通过

- [x] **Debug UI：AI 样式接口运行时绑定（AudioFrame → CSS vars / 状态 → data-attributes）**

  - 动机：把“音频/连接/性能”等状态从“纯文案”升级为可被 CSS 选择器驱动的视觉反馈；同时不引入新 UI 组件。
  - 内容（最小）：在 `src/app/bootstrap.ts` 的 `audioBus.onFrame` / `diagnosticsTicker` 路径里：
    - 每帧写入 CSS 变量：`--ai-audio-intensity`/`--ai-audio-bass`/`--ai-audio-treble`（来自 `AudioFrame.energy` 与 `AudioFrame.bands`）。
    - 在 `#audio-status`（或其 `.toolbar__section`）上写入 `data-connection-state` / `data-audio-state`（例如：connecting/connected/error/paused），以及必要的 `data-ai-alert` 临时提示。
  - 验收：不改 DOM 结构；不改变现有交互；打开页面后手动设置 `document.body.dataset.aiTheme='warm'` 等能立即生效；播放/输入时 UI 上可见音频响应（可选挂 `data-audio-reactive` 到某个 pill/状态）。
  - 状态：已实现（`src/app/bootstrap.ts` 写入 `--ai-audio-*`；并同步 `data-audio-state/data-connection-state` 与 `data-ai-alert` 到 `#audio-status` 与其 section）

- [x] **UI 透明度可调（控制面板背景透明度）**

  - 动机：现场/投影/录屏时需要“UI 不挡画面”，但不影响文字可读性。
  - 内容：工具栏顶栏加入 UI 透明度滑块（20%–100%），只影响 UI 背景（surface/surface-strong），不影响画布；实现落点：`src/app/controllers/uiOpacityController.ts`；持久化 key：`newliveweb:ui:opacity`；CSS 变量：`--nw-ui-opacity`。
  - 落点：`src/app/controllers/uiOpacityController.ts`（storage key + UI 同步）+ `src/style.css`（`--nw-ui-opacity` 驱动 surface alpha）。
  - 验收：滑块变化即时生效；刷新后保持；`npm run lint` + `VERIFY_PORT=5174 npm run verify:dev` 通过。

- [x] **收藏夹：多收藏参数对比表（横向对比）**

  - 动机：不同预设参数不一致时，单条参数表不方便发现差异。
  - 内容：收藏列表支持勾选多个收藏 → “对比”进入对比表；行=参数 key 并集；列=收藏；缺失值为空。
  - 验收：至少 2 条收藏可对比；表格可滚动；不崩溃；`npm run lint` + `VERIFY_PORT=5174 npm run verify:dev` 通过。

  - 状态：已实现（`src/features/favorites/FavoritesPanel.ts` 含 compareMode + 多选 + CSV 导出），并已通过 `verify:dev`（见 `docs/ai/AI_COLLAB_LOG.md` 2025-12-17 记录）。

- [x] **Debug UI：DiagnosticsPanel 语义化 DOM（去 inline style，便于纯 CSS 设计化）**

  - 动机：当前 `src/features/console/DiagnosticsPanel.ts` 的 label/value 依赖 inline style，难以做一致排版与主题化。
  - 内容：将 `addSection()` 输出改为 class（例如 `.nw-diag-row/.nw-diag-label/.nw-diag-value`），并在 `src/style.css` 做覆盖；保持 `pointer-events:none` 的 overlay 语义不变。
  - 验收：Diagnostics 可读性提升；字段对齐；无行为回归；`npm run lint` + `VERIFY_PORT=5174 npm run verify:dev` 通过。

  - 状态：已实现（`src/features/console/DiagnosticsPanel.ts` + `src/style.css`），并已通过 `verify:dev`（见 `docs/ai/AI_COLLAB_LOG.md` 2025-12-17 记录）。

- (ARCHIVED) **Loopback / 输入电平偏低校准（以现场验收为准）**

  - 背景：外部声卡（例如 Quantum ES）通过 Loopback 通道输入时，顶部 `电平` 与 `E xx%` 指示仅在 0–5% 左右波动，但实际音量正常，难以作为演出时的“是否有声”反馈。
  - 内容（待设计）：在不破坏 `AudioFrame.energy` 语义的前提下，检查 `StreamAudioProcessor` 与 `AudioBus` 的 RMS/peak 归一化，对输入设备（尤其是 loopback）增加一个轻量的“meter gain” 或自动标定，让 UI 电平条处于更易读的 30–80% 区间。
  - 验收：在当前 Quantum ES loopback 设置下，正常节目音量时顶部 `电平`/`E` 能稳定反映 30–70% 的动态；静音时仍接近 0%；不出现“常态节目只有 1% 左右”的假低电平。

- (ARCHIVED) **宏旋钮算法评估与优化**

  - 背景：用户询问"旋钮的算法更新了吗？使用了更加合理的算法了吗（开源的也行）"
  - 当前状态（已分析）：线性组合 + lerp/smoothstep；优点是稳定可预期，缺点是硬编码系数。

---

## 2. Phase C（背景可插拔：补齐产品闭环）

- [x] Camera 背景体验护栏
- [x] Background/Type=camera 自动启用并拉起摄像头
- [x] Video 背景 src 入口闭环
- [x] Background params 默认值/重置一致性
- [x] 多层混合器：BG/Camera 快捷开关 + 热开关健壮性

---

## 3. 宏观旋钮（产品化：把 3 个旋钮真正映射到画面）

- [x] computeMacroPatch 最小实现（保守映射，默认弱影响）

---

## 4. Phase D（MIDI：从“能连上”到“可用”）

- [x] SettingsStore 持久化 MIDI bindings（不进入 Favorites）
- [x] Learn UX 完整化

---

## 4.1 AIVJ（自动 VJ：8 宏 bank + MIDI 不抢旋钮）

- [x] AIVJ 8 宏 bank（3 主宏 + M4–M8）默认存在
- [x] MIDI 自动映射（AutoMap）
- [x] 冲突避免：检测到宏 bank 已映射 → AI 不写宏旋钮（MIDI lock）
- (ARCHIVED) 文档对齐（AIVJ 语义冻结）：MASTER_SPEC/DATA_INTERFACES append-only

---

## 4.2 AIVJ：运行态可观测 + 人像边缘驱动 ProjectM

- [x] BeatTempo / E-BPM-C 指标链路修复
- [x] UI 排列优化（Techno 摘要 + 面板布局）
- [x] 摄像头人像分割 + portraitEdge01 暴露
- [x] 人像边缘 → ProjectM 耦合 + UI 控制
- (ARCHIVED) 参数/文档调优（AIVJ_DESIGN vNext）

---

## 5. P2（强互相影响：默认关闭，作为“高级增强”）

- [x] ProjectM 输出采样 avgLuma + Diagnostics 展示
- [x] 闭环控制（PI，带限速）
- [x] Compositor v1（RT + 合成 shader，默认 off）

---

## 8. 后端优先验收标准（Checklist）

- ParamSchema + Random
- Controller 单入口
- BackgroundRegistry（Liquid/Camera）
- Audio + Diagnostics
- ProjectM + headless verify

---

## 9. 从“计划文档”导出的最小 TODO（补齐口径 + 降噪）

- [x] 文档对齐：DATA_INTERFACES 的 MediaStream 现状修正（append-only）
- [x] 文档对齐：PLANNED_NOT_DONE 已落地事项标注（append-only）
- [x] Mixxx 接入：专用连接入口 + 状态/重连（MVP）
- [x] LiquidMetal 风格化参数：tint/hue/paletteStrength（schema + shader + Inspector）
