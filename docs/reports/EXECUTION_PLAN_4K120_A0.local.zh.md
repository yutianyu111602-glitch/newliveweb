# 4k120 执行计划（本地）— 优先跑通 [!] 现场验收 + A0 基线

> 目标：把“计划”变成可复跑的闭环：**验收 checklist → A0(S1–S7) 自动采集 → 产物落盘 → 填表/对比 → 决定 B3/B4 下一步**。

## 0. 权威入口（先看这些）

- 现场验收（[!]）：`TODOS.zh.md`
- 执行审计（缺口对齐）：`docs/reports/DOCS_EXECUTION_AUDIT_2025-12-23.local.zh.md`
- A0 基线表（手工/最终归档）：`docs/reports/BASELINE_S1_S7_LOG.local.zh.md`
- 4k120 计划 v3.5（B3/B4 下一步）：`docs/reports/PLAN_4K120_PERF_v3.5.local.zh.md`

### 0.1 先看现有日志（避免重复长跑/卡住）

> 原则：先读产物再决定是否重跑（本机之前已经跑过很久的 verify）。

- 最近一次 headless 产物目录（示例）：
  - `newliveweb/artifacts/headless-runs/2025-12-23T22-52-27/`
- 快速定位入口：
  - `verify/browser-console.log`：常见失败原因（例如 preset 加载 timeout / WASM abort 后重建 / UI selector 超时）
  - `verify/page-errors.log`：页面级异常与 verify 失败点
  - `baseline-a0/<mode>/.../baseline.json|baseline.md`：A0 采集结果摘要

> 备注（基于现有日志的观测）：若看到大量 `Failed to load preset ... Network timeout` 或 `AIVJ accent observability missing`，先按 P0 现场验收把音频/预设/诊断链路跑稳，再在最后阶段统一做 headless 回归。

## 1. P0：先打通 [!] 现场验收（演出可用性底线）

- 目标：Camera/Depth/Video/图层开关/音频链路在真实设备上稳定；Diagnostics/Topology/Trace 可观察。
- 执行：逐条完成 `TODOS.zh.md` 中的 `[!]` 条目（不要跳过）。
- 辅助验证：
  - `npm --prefix c:\Users\pc\code\newliveweb run verify:dev`
  - `npm --prefix c:\Users\pc\code\newliveweb run verify:check`

> 执行约定（本机）：为避免中途被自动化打断，**verify 放到所有任务完成后再统一执行**；这里保留入口作为最后阶段的“回归/留痕”。

### 1.1 最终阶段：一次性无头自动验证（不占用终端）

- PowerShell（后台 Job，一次性跑完 verify + check + A0）：

  - `powershell -NoProfile -ExecutionPolicy Bypass -File c:\Users\pc\code\newliveweb\scripts\headless-validate-all.ps1 -StartInBackground -CaptureModes direct,obs`

- 产物：
  - `newliveweb/artifacts/headless-runs/<runId>/verify/`（Playwright verify + report）
  - `newliveweb/artifacts/headless-runs/<runId>/baseline-a0/<mode>/`（A0 S1–S7）

> 说明：verify 是“自动化烟测 + 产物留痕”，不是替代现场验收；它用于避免回归/快速定位。

### 1.2 监控程序（后台常驻，不占用终端）

> 用途：现场验收/采集期间，托盘 + watcher 常驻运行，所有日志落盘到 `C:\ProgramData\ncm_watcher\`，避免占用终端。

- 启动（后台，不阻塞）：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File c:\Users\pc\code\scripts\ncm-watcher-start.ps1`
- 状态（看进程 + tail 日志）：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File c:\Users\pc\code\scripts\ncm-watcher-status.ps1`
- 停止：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File c:\Users\pc\code\scripts\ncm-watcher-stop.ps1`

日志文件（按需看）：

- `C:\ProgramData\ncm_watcher\tray.log` / `tray_fatal.log`
- `C:\ProgramData\ncm_watcher\watcher.out.log` / `watcher.err.log`

## 2. A0：4k120 S1–S7 基线采集（direct / OBS 两路径）

### 2.1 推荐的自动化采集方式（A0 脚本）

脚本：`scripts/baseline-a0-s1-s7.mjs`

- 运行前（必做）：启动 dev server（或使用现有 task）

  - VS Code Task：`newliveweb: dev server (5174)`
  - 或命令：`npm --prefix c:\Users\pc\code\newliveweb run dev -- --host 127.0.0.1 --port 5174 --strictPort`

- 运行脚本（示例：直出）

  - PowerShell：
    - `setx BASELINE_CAPTURE_MODE direct`
    - `setx BASELINE_DURATION_SEC 60`
    - `node c:\Users\pc\code\newliveweb\scripts\baseline-a0-s1-s7.mjs`

- 运行脚本（示例：OBS）

  - `setx BASELINE_CAPTURE_MODE obs`
  - `node c:\Users\pc\code\newliveweb\scripts\baseline-a0-s1-s7.mjs`

- S7 Video 场景需要视频源：

  - `setx BASELINE_VIDEO_SRC "https://.../video.mp4"`

- S5 Depth 场景默认用 `ws`，如需 `idepth`：
  - `setx BASELINE_S5_DEPTH_SOURCE idepth`

### 2.2 产物位置与如何填表

脚本会写入：`newliveweb/artifacts/baseline-a0/<runId>/`

- `baseline.json`：结构化结果（每个场景的采样统计 + perfCaps + snapshot 路径）
- `baseline.md`：可直接粘贴到基线表的摘要
- `S*/<snapshot>.json`：每个场景的 `nw-snapshot-v1` 快照

然后把结果填入：`docs/reports/BASELINE_S1_S7_LOG.local.zh.md`

## 3. P1：基于 A0 数据决定下一步（再做 B3/B4）

- B3（Compositor/RT 成本）与 B4（Preset 切换峰值）都依赖 A0 的真实基线。
- 没有 A0 基线时，很容易“优化错方向”或把现场问题当成性能问题。

执行口径（先埋点再优化）：

- B3：先把 compositor/RT 的成本字段写进 snapshot/diagnostics → 重跑 A0 → 再决定 shader/RT 优化。
- B4：先把 preset 切换分段计时（fetch/parse/apply/rebuild/first-frame）写进报告 → 用 A0/现场确认峰值 → 再做 gate/latest-wins。

详见：`docs/reports/PLAN_4K120_PERF_v3.5.local.zh.md`。

---

## 备注：与 repo 外 4k120 计划的关系

- （repo 外）`C:\Users\pc\.codex\plans\newliveweb-4k120-performance-plan.md` 是原始计划文本。
- 本文件是 **repo 内可执行版本**：只保留能直接跑的入口与产物路径。
