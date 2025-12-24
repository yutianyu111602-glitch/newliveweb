# newliveweb 文档整理与执行对齐审计（local · 2025-12-23）

> 目的：把“计划/报告/旧文档/代码现状”对齐到一个可执行清单，避免口径漂移与重复开工。
>
> 权威规则：发生冲突时，以 `newliveweb/DOCS_INDEX.zh.md` → `newliveweb/MASTER_SPEC.zh.md` → 代码 为准；可执行任务以 `newliveweb/TODOS.zh.md` 为准。

---

## 1) 本次审计输入（已阅读）

### 计划/执行记录

- `docs/reports/PLAN_4K120_PERF_v3.5.local.zh.md`（4k120 计划 v3.5：repo 内可执行对齐版）
- （repo 外，已弃用入口）`C:\Users\pc\.codex\plans\newliveweb-4k120-performance-plan.md`（历史计划原文，仅作参考）
- `newliveweb/docs/reports/PERF_OPTIMIZATION_LOG.local.md`（性能优化留痕日志）

### 代码侧“证据路径”（抽样核对）

- 音频分析节流：`newliveweb/src/app/bootstrap.ts`（caps / pressure window）+ `newliveweb/src/audio/AudioBus.ts` / `newliveweb/src/audio/StreamAudioProcessor.ts`
- Depth 降载：`newliveweb/src/layers/DepthLayer.ts`
- AIVJ accent 可观测：`newliveweb/src/features/aivj/unifiedAivjController.ts` + Diagnostics/Topology/Trace（由 headless verify 覆盖）
- Headless 验证：`newliveweb/scripts/headless-verify.mjs` + `newliveweb/scripts/verify-check.mjs`

---

## 2) 文档盘点（“读什么/改什么”的最终口径）

### 权威入口（冲突以此为准）

- `newliveweb/DOCS_INDEX.zh.md`（文档收敛约定/写作路由）
- `newliveweb/MASTER_SPEC.zh.md`（事实口径/硬约束/验收真相源）
- `newliveweb/DATA_INTERFACES.zh.md`（接口/字段/存储 key/诊断字段）
- `newliveweb/TODOS.zh.md`（可执行 TODO + 最小验收信号）

### 计划/专题（只做“补充”，不替代权威口径）

- 4k120 计划（repo 内执行）：`docs/reports/PLAN_4K120_PERF_v3.5.local.zh.md`
- 4k120 计划原文（repo 外参考，已弃用入口）：`C:\Users\pc\.codex\plans\newliveweb-4k120-performance-plan.md`
- AIVJ 计划：`newliveweb/docs/AIVJ_INTEGRATED_PLAN.zh.md`、`newliveweb/docs/AIVJ_3D_COUPLING_PLAN.md`、`newliveweb/AIVJ_DESIGN.zh.md`
- UI/调试台：`newliveweb/docs/ui/*`
- 历史/排障：`newliveweb/docs/reference/*`

### 重要说明：部分“local 报告/历史专题”存在编码/口径老化

以下文件在当前控制台输出中出现明显乱码标点（不影响“事实真相源”，但影响可读性）；建议视为“历史备忘录”，仅在需要时参考其末尾对齐补充段落：

- `newliveweb/docs/reports/BASELINE_S1_S7_LOG.local.zh.md`
- `newliveweb/docs/reports/UNFINISHED_TODOS_ROADMAP.local.zh.md`
- `newliveweb/docs/reference/PROJECTM_INTEGRATION.md`
- `newliveweb/docs/reference/PLANNED_NOT_DONE.zh.md`（该文件末尾已追加“可读性修复说明 + 最新现状”段落）

---

## 3) 计划执行对齐（计划/日志 ↔ 代码）

### 3.1 与 `PERF_OPTIMIZATION_LOG.local.md` 对齐（已落地）

- DepthLayer 处理间隔/降采样与“近零 opacity 不处理”：`newliveweb/src/layers/DepthLayer.ts`（`computeProcIntervalMs` / `computeMaxProcSide`）
- 音频 analysis FPS cap（30/45/60）+ 滞回：`newliveweb/src/app/bootstrap.ts`（`audioAnalysisFpsCap` / `updateAudioAnalysisCap`）
- BeatTempo FPS cap（10/20/30）：`newliveweb/src/app/bootstrap.ts`（`beatTempoFpsCap` / `updateBeatTempoCadence`）
- ProjectM FG/BG 音频喂入节流：`newliveweb/src/app/bootstrap.ts`（`pmAudioCadenceMode` + perPm interval）
- preset 切换压力窗降峰：`newliveweb/src/app/bootstrap.ts`（`presetLoadPressureUntilMs` + `notePresetLoadPressure`）
- compositor bypass（ProjectM opacity 近零时跳过 RT/合成）：`newliveweb/src/app/bootstrap.ts`（`updateCompositorBypass`）+ `newliveweb/src/SceneManager.ts`
- AIVJ 表现力/guard：`newliveweb/src/features/aivj/unifiedAivjController.ts`（accent 层 + `applyToneGuard`）

### 3.2 与 4k120 计划对齐（当前已落地 / 未落地）

已落地（代码存在，但多数仍需现场量化/调参）：

- A8/A9/A10/A11：audio/beat/PM cadence + load shedding + accent 可观测（入口主要在 `newliveweb/src/app/bootstrap.ts`，可由 headless verify 观测）
- A12：headless verify 覆盖 perf caps / AIVJ accent / audio-drive presets / preset load shedding（`newliveweb/scripts/headless-verify.mjs` + `newliveweb/scripts/verify-check.mjs`）
- A13：prefetch 延后到压力窗结束（`newliveweb/src/app/bootstrap.ts`：prefetch pump 延迟逻辑）
- A14：audio-drive presets 与 accent boost 调参（`newliveweb/src/app/bootstrap.ts` + `newliveweb/src/features/aivj/unifiedAivjController.ts`）
- B1：频谱更新限 30fps（`newliveweb/src/audio/AudioBus.ts` + `newliveweb/src/audio/StreamAudioProcessor.ts`：`skipFrequency`）
- B2：Depth 降档策略（`newliveweb/src/layers/DepthLayer.ts`：`perfTier/procCostAvgMs/procBlurPx`）

未落地（代码缺口/需要新增 instrumentation 或 shader 工作）：

- B3：Compositor shader 成本收敛（需 GPU pass 计时/RT 压力分析/可能的 shader 调整）
- B4：Preset 切换路径进一步降峰（需要细分计时：rebuild/IO/parse/texture upload，并在 gate/pressure window 上做更严格的调度）

---

## 4) “未执行/未完成”的统一清单（去重后的 Backlog）

### 4.1 代码层未执行（P0/P1 性能向）

- B3 Compositor shader：GPU pass 成本与 RT 读写压力记录 + 优化策略落地
- B4 Preset 切换路径：分段计时 + 更严格 gate + 降峰策略

### 4.2 现场/人工验收未完成（来自 `TODOS.zh.md` 的 [!]）

- Camera 图层开启后画面可见（权限/设备/opacity/segmentation）
- Depth iDepth 入口与外部帧连接闭环（ws 连接/frames>0/效果可见）
- 图层开关/控件接线生效（UI 改动真实落地）
- 音频链路持续更新（波形/电平/BPM/Conf）
- Use input / 系统音频捕获后无需额外点击即可看到电平/波形（AudioContext gesture 链路）
- Loopback 输入电平可读（低电平设备不长期卡 1–5%）
- Video src 入口闭环（playing 或明确失败态 + retry）
- 波形 + BPM/Conf UI 有输出（E/BPM/C 不长期为 --）

### 4.3 4k120 基线未执行（来自 4k120 计划 A0）

- A0：按 S1-S7 在 4k120 设备上采集 FPS/p95/Diagnostics（含 direct/OBS 两路径）

---

## 5) 未来规划（按“先能跑稳 → 再好看 → 再极限性能”排序）

### P0（立即推进）

1. 先把 `TODOS.zh.md` 的 [!] 现场验收全部打勾（这是所有后续性能/表现力调参的前提）
2. 完成 A0 基线（S1-S7），把结果填进 `newliveweb/docs/reports/BASELINE_S1_S7_LOG.local.zh.md`

### P1（性能瓶颈 B3/B4）

1. B3：为 compositor 增加可观测指标（每帧 pass 次数/RT 尺寸/是否 bypass），再决定 shader/RT 策略
2. B4：为 preset 切换加入“分段计时”（fetch/parse/compile/rebuild/texture upload），再落地更严格 gate 与峰值削减策略

### P2（长期）

- 24h soak + blacklist/anchor 回退长测（需要落日志与可导出统计）

---

## 未验证项目（放在末尾，按约定暂不执行）

> 说明：这里的“未验证”包括两类：① headless/CI 未跑；② 现场硬件/真实输入未验收。

- 4k120 基线：A0（S1-S7 + direct/OBS）
- B3/B4：Compositor shader / Preset 切换路径进一步降峰
- `newliveweb/TODOS.zh.md` 中所有 [!] 现场验收项
- 24h soak（含 blacklist/anchor 回退统计）
