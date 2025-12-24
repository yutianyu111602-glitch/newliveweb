# 4k120 性能/架构计划 v3.5（repo 内可执行对齐版 · local）

> 本文件是对 `newliveweb-4k120-performance-plan-v3.5.md`（本机 Downloads）的“可执行版收敛”：只保留能直接落到代码/脚本/产物的入口。

## 0. 权威入口（执行顺序）

1. 现场验收（[!]）：`TODOS.zh.md`
2. A0 基线（S1–S7 + direct/OBS）：`docs/reports/BASELINE_S1_S7_LOG.local.zh.md`
3. B3/B4（先埋点再优化）：本文件 §3/§4

## 1. v3.5 原文来源与弃用标记

- 原文（repo 外，参考）：
  - `C:\Users\pc\Downloads\newliveweb-4k120-performance-plan-v3.5.md`
  - （旧路径）`C:\Users\pc\.codex\plans\newliveweb-4k120-performance-plan.md`

> 弃用说明：仓库内执行请以本文件 + `docs/reports/EXECUTION_PLAN_4K120_A0.local.zh.md` 为准；外部计划文本仅保留为“历史/原始讨论材料”。

## 2. 已经落地/已收口的执行工具（对应 v3.5 P0/P1/P2 的前置）

- A0 自动采集脚本：`scripts/baseline-a0-s1-s7.mjs`
  - 输出：`artifacts/baseline-a0/<runId>/baseline.json|baseline.md|S*/snapshot.json`
- Snapshot 导出包含基线关键字段：`nw-snapshot-v1`（含 `perf.frameTimeP95Ms`、renderer/compositor、overlayBudget、topology、decisionTrace）
- 可编排的 baseline hooks：`__nw_verify.getFrameTimeP95Ms()` / `setBaselineCompositorEnabled()` / `setBaselineProjectmBgEnabled()`

## 3. B3（Compositor/RT 成本）— 下一步要做什么

v3.5 的核心要求是：先把 compositor 的成本与状态变成可观测数据，再谈 shader/RT 优化。

### 3.1 需要的最小观测字段（建议写入 snapshot + diagnostics）

- RT 尺寸（fixed/viewport）与 pool 使用情况
- passes / bypass flags（例如：pm opacity near0 / layerDisabled / pressureWindow）
- RT realloc 最近一次的时间（已有 `RT_REALLOC` 事件与 `getLastRtReallocMs()`）

### 3.2 执行方式（最小闭环）

1. 先跑 A0 基线拿到 direct/OBS 两条曲线
2. 再做 B3 埋点（只加观测字段，不改策略）
3. 重跑 A0，确认指标能解释差异后，再进入真正优化

## 4. B4（Preset 切换峰值）— 下一步要做什么

v3.5 希望把“切换卡顿来自哪段”拆开：fetch/parse/apply/rebuild/first-frame，并通过 gate/latest-wins 降峰。

### 4.1 需要的最小埋点

- SwitchReport（FG/BG 各一套）：
  - `t_fetchMs` / `t_parseMs` / `t_engineApplyMs` / `t_rebuildMs` / `t_firstFrameMs`
- blacklist（hard/soft）与 AnchorSet 回退（长测统计）

### 4.2 执行方式（最小闭环）

1. 先用 A0 与现场验收确认“切换卡顿”是否真实存在
2. 加 SwitchReport 埋点（不改策略）
3. 再决定是否加更严格 gate 或 latest-wins 强化

## 5. 验证策略（按当前约定：最后统一跑）

- 本机约定：**所有任务完成后再跑 verify**（避免中途被 verify 打断节奏）。
- verify 入口（最后阶段）：
  - `npm --prefix c:\Users\pc\code\newliveweb run verify:dev`
  - `npm --prefix c:\Users\pc\code\newliveweb run verify:check`
