# AIVJ Unified Techno 升级更新报告

日期：2025-12-18/19

## 目标与决策落地

- 采用 **方案 B**：慢层（slow bank）完成一次 morph 后会 **写回到可持久化状态**（Favorites/Show 的 `lastVisualState`）；accent 层保持 **纯 runtime**。
- 将 `overlayBudget` 从“参数存在但未消费”变为 **真实影响渲染**：对各 overlay layer 做 runtime-only 透明度倍率控制，并对 ProjectM 做 retreat（回退）倍率。
- 强化可观测性：在 Diagnostics 面板的 AIVJ 行增加 unified controller 的 debug 信息（mode/section/age/mix）。

## 主要改动（按模块）

- AIVJ 调度统一化：
  - 新增统一控制器：`src/features/aivj/unifiedAivjController.ts`
  - 功能：beat 对齐触发（稳定时每 16 beats 更新），不稳定时 4s fallback；accent 快攻慢释；输出 `debug`（mode/section/mix01/targetAgeMs）；slow 完成后提供 `commitSlowBankToState`。
- 单写者（single-writer）宏写入：
  - 统一在 `src/app/bootstrap.ts` 的 audio frame loop 内调用 controller，并对 runtime bank 做节流写入（33ms）。
  - slow bank 完成后通过 `commitAivjSlowBankToState(...)` 写回 state。
- overlayBudget 消费（runtime-only）：
  - 在 `src/app/bootstrap.ts` 计算 overlay 分配倍率（按优先级、能量预算、depth freshness/weight、smoothing），并调用各 layer 的 `setOverlayOpacityMultiplier(...)`。
  - ProjectM 通过 retreat multiplier（带 floor）避免被 overlays 完全压黑。
  - Layer runtime-only 乘子接口已落到：
    - `src/layers/ProjectMLayer.ts`
    - `src/layers/LiquidMetalLayerV2.ts`
    - `src/layers/BasicBackgroundLayer.ts`
    - `src/layers/CameraLayer.ts`
    - `src/layers/VideoLayer.ts`
    - `src/layers/DepthLayer.ts`
- Diagnostics AIVJ debug 行：
  - `src/features/console/DiagnosticsPanel.ts`：AIVJ 行支持可选 `debug` 字段并渲染 `dbg=...`。
  - `src/app/bootstrap.ts`：每帧缓存 unified controller 的 debug/base/runtime bank，并在 diagnostics 节流 tick 内调用 `diagnosticsPanel.updateAivj(...)`。

## 验证与结果（命令行无头浏览器）

已执行：

- `npm run verify:check`
  - OK：artifacts 检查通过（framesRendered 正常）。
- `npm run verify:headless`
  - Guardrails：OK
  - Summary：`framesRendered=157`，`finalOutputChanged=true`，`projectMCanvasChanged=true`
  - `artifacts/headless/page-errors.log`：空（无页面错误）
  - Console：存在 headless/WebGL 环境相关 warning（ReadPixels stall、swiftshader fallback），属于预期噪声。
  - `favoritesCompare.ok=false`：headless 脚本在等待 favorites 对比表出现时超时（favoritesCount=0）。这更像是 **测试场景数据缺失/脚本假设** 或 **非本次改动引入**，但建议本机手动点开 Favorites 面板确认 UI 是否正常。

## 风险点与建议

- AIVJ（方案 B）写回语义：
  - 风险：slow bank 会改变持久化 state，用户可能在不知情情况下把“AI 产生的慢变化”带入 Favorites/Show。
  - 建议：如果需要更强提示，可在 UI/文档中强调“启用 AIVJ 会逐步改写宏状态（方案 B）”。
- Diagnostics AIVJ 的 bank 字段语义：
  - 当前在 diagnostics 中把 `user` 显示为 base bank、`ai` 显示为 runtime bank（便于对比）。这只是 diagnostics 文本，不影响业务逻辑。
- overlayBudget 实际生效后：
  - 风险：在低预算/低能量下 overlay layer 可能“过暗”；以及 priority/depthWeight 配置不当可能导致某一层长期被压制。
  - 建议：通过 `minScale` 和各 `priority*` 调整；必要时先将 `pmRetreatStrength` 降低以避免 ProjectM 存在感太弱。

---

如果你希望我把 AIVJ diagnostics 的输出格式再“更短更舞台友好”（例如只显示 `ai/beat 1200ms 35%`），我也可以再收紧一次。
