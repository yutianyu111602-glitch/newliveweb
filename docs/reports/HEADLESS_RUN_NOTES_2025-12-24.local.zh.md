# Headless 长跑产物速记（local · 2025-12-24）

> 目的：避免重复长跑/卡住终端；先读现有 artifacts，再决定是否重跑。

## 1) 现有产物位置（示例）

- 目录：`newliveweb/artifacts/headless-runs/2025-12-23T22-52-27/`
- verify：`verify/`（截图、report.json、console/page errors 等）
- A0：`baseline-a0/`（本次看到 direct 产物已生成）

## 2) 关键观测（来自 verify/browser-console.log）

- 多次出现 preset 加载超时：
  - `Failed to load preset ... Network timeout loading preset from /presets/...`
  - Playwright 侧伴随 `net::ERR_ABORTED` 的 requestfailed
- AIVJ 可观测性检查报缺失：
  - `AIVJ accent observability missing ...`
  - 进而触发 verify 的 `page.waitForFunction Timeout 6000ms exceeded`（perf/AIVJ checks failed）
- ProjectM 偶发 WASM abort：
  - `Exception catching is not enabled` → 触发重建（日志里可见 `Preset caused WASM abort; rebuilding ProjectM engine...`）

## 3) A0（S7）采集情况（来自 baseline-s7.out.log）

- S7 跑通：
  - `sampling for 60s...` → `snapshot export...` → `baseline.json/baseline.md` 已写入。

## 4) 建议下一步（不重跑 verify）

- 先按 `TODOS.zh.md` 把 [!] 现场验收链路跑稳（音频/Camera/iDepth/Video/Diagnostics）。
- 等现场链路稳定后，再统一用 `scripts/headless-validate-all.ps1 -StartInBackground` 做一次无头回归留痕。
