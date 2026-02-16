# Preset Audit Tool / 预设审计工具（批量扫描 + 修复 + 标签）

中文：本文档描述 `scripts/preset-audit.mjs` 这套**离线审计**工具，用于对超大 MilkDrop/ProjectM `.milk` 预设库做“可工作性/安全性”审计，并输出可用于构建“更安全子库”的黑名单与统计。

English: This doc describes `scripts/preset-audit.mjs`, an **offline auditor** for huge MilkDrop/ProjectM `.milk` libraries. It produces a quality report + summary + blacklist, which you can use to build safer packs/manifests.

> 编码提示 / Encoding tip:
>
> - 如果你在 **Windows PowerShell 5.1** 里用 `Get-Content` 看到中文乱码，请改用：`Get-Content -Encoding utf8 ...`（或用 VS Code 打开）。

## What it does

- Scans `.milk` files from a source directory.
- Sanitizes text (removes control chars, normalizes line endings).
- Optionally runs a quality probe in Playwright + WASM ProjectM:
  - `avgLuma` / `avgFrameDelta` / `avgRenderMs` / `p95RenderMs`
  - `wasm-abort` / `render-failed` / `probe-timeout` / `probe-unavailable` …
- Tags presets (wave/line/abstract/liquid + extra tags).
- Emits `preset-audit.json` continuously (checkpointed), plus (on clean exit) `audit-summary.json` + `quality-blacklist.json`.
- For long watchdog runs: use `scripts/snapshot-preset-audit.mjs` to generate **live** `preset-audit.summary*.json` + `quality-blacklist.*.live.json` without stopping the audit.

## Requirements

- Dev server running (needed for the probe phase).
- Playwright installed (already in `devDependencies`).

## Start dev server

```powershell
cd C:\Users\pc\code\newliveweb
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

## Run audit

Full scan with probing:

```powershell
node scripts/preset-audit.mjs --source "C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets" --probe true --resume true
```

Sample scan (first 2000 files, no probe):

```powershell
node scripts/preset-audit.mjs --source "C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets" --limit 2000 --sample first --probe false
```

Scan + write sanitized presets:

```powershell
node scripts/preset-audit.mjs --source "C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets" --repair true --repairOut artifacts\presets\fixed
```

Experimental crash repair (NoWavesNoShapes):

> 目的：对一部分 `wasm-abort` 类型的崩溃预设，尝试通过禁用自定义 wave/shape 代码来“降级修复”，换取稳定性（视觉复杂度会下降）。
>
> 适用面：更可能对 **reason 里只有 `wasm-abort`（且没有 `Aborted(...)` 长文本）** 的预设有效；对 `Aborted(exception catching is not enabled)` / `Aborted(native code called abort())` 这类通常无能为力（更偏引擎/兼容性问题）。
>
> 更完整的“最短收益修复路线图”（含引擎级修复/去脏/扩池/闭环）见：`docs/reference/PRESET_REPAIR_PLAN.zh.md`。

```powershell
cd C:\Users\pc\code\newliveweb

# 0) （推荐）长跑期间先生成 live crash blacklist（包含 badReasonsByRelPath，供 repair 脚本筛选 wasm-abort-only）
node scripts/snapshot-preset-audit.mjs `
  --outDir "artifacts\\presets\\audit-full-130k-2025-12-28-run3" `
  --blacklistMode crash `
  --includeReasonsByRelPath true `
  --blacklistOut "quality-blacklist.crash.live.json" `
  --summaryOut "preset-audit.summary.crash.live.json"

# 1) 先生成一个“修复候选 pack”（只挑 wasm-abort-only，默认 limit=200，支持断点续跑）
node scripts/repair-crash-presets-nowavesnoshapes.mjs `
  --blacklist "artifacts\\presets\\audit-full-130k-2025-12-28-run3\\quality-blacklist.crash.live.json" `
  --sourceRoot "C:\\Users\\pc\\code\\MilkDrop 130k+ Presets MegaPack 2025\\presets" `
  --outDir "public\\presets\\run3-nowavesnoshapes-200"

# 2) 复测：对修复后的 pack 再跑一次 preset-audit（只扫 pack 本身，速度快）
node scripts/preset-audit.mjs `
  --source "public\\presets\\run3-nowavesnoshapes-200" `
  --out "artifacts\\presets\\audit-run3-nowavesnoshapes-200" `
  --limit 0 --probe true --resume false

# 3)（可选）把修复 pack 的审计导出成 sqlite，快速看原因分布
python scripts\\audit-to-sqlite.py `
  --auditIn "artifacts\\presets\\audit-run3-nowavesnoshapes-200\\preset-audit.json" `
  --dbOut  "artifacts\\presets\\audit-run3-nowavesnoshapes-200\\preset-audit.sqlite"
python scripts\\audit_sqlite_tools.py --db "artifacts\\presets\\audit-run3-nowavesnoshapes-200\\preset-audit.sqlite" stats --top 30
```

实测（run3 小样本）：

- 现象：NoWavesNoShapes 这类“降级修复”会把很多预设变成**可渲染但偏暗**的“线条/轮廓型视觉”，其 `avgLuma` 常落在 ~0.04 附近。
- 注意：`preset-audit.mjs` 默认 `--minAvgLuma 0.06` 会把这类视觉大量判为 `too-dark`，但这通常是**门槛口径偏保守**导致的“误杀”，并不等价于黑屏。
- 建议复审口径（用于 Step 8/Step 9 的 repair 包验收）：对 repair 包单独使用更低门槛（例如 `--minAvgLuma 0.035`），然后再结合现场观感/其它指标继续筛选。

示例（对修复 pack 复审，降低 too-dark 门槛）：

```powershell
node scripts/preset-audit.mjs `
  --source "public\\presets\\run3-repair-nowavesnoshapes-wasmabortonly-sample100-v6" `
  --out "artifacts\\presets\\audit-repair-nowavesnoshapes-wasmabortonly-sample100-v6-min035" `
  --limit 0 --probe true --resume false --minAvgLuma 0.035
```

补充说明 / Notes:

- `quality-blacklist.json` 只在 audit **正常退出**时生成；长跑期间可能很久不更新，所以这里推荐用 `snapshot-preset-audit.mjs` 生成 `quality-blacklist.crash.live.json`。
- `repair-crash-presets-nowavesnoshapes.mjs` 也支持 `--relPathsFile <txt>`：一行一个 relPath（相对 `sourceRoot`）。你可以用 SQLite 导出 relPath 列表后再修复，避免依赖 blacklist JSON。

## Outputs

- 输出都写在 `--out` 目录下（默认：`artifacts/presets/audit/`）：
  - `preset-audit.json`
  - `preset-audit.log`（状态/错误摘要）
  - `audit-summary.json`（仅“正常退出”时生成）
  - `quality-blacklist.json`（仅“正常退出”时生成）
  - `preset-audit.summary*.json` / `quality-blacklist.*.live.json`（推荐：用 snapshot 脚本生成的“随时可用”产物）

Live-run note:

- `audit-summary.json` and `quality-blacklist.json` are written **only when the process exits normally** (end of `main()`).
- During a long watchdog run, they can be **stale** for hours. For “current state”, use `preset-audit.json` + `scripts/snapshot-preset-audit.mjs` (see the 130k runbook below).

## Build a safer pack from the blacklist

```powershell
# 长跑期间（audit 还没退出）优先使用 live blacklist：
# - okonly：仅 quality.ok === true（数量可能很小，但“质量门禁”最严格）
# - crash：仅拉黑“崩溃/硬失败类”，规模会大很多，适合现场演出“安全库”

npm run sync:presets -- --target run3-crashsafe-smoke --limit 200 `
  --qualityBlacklistFile artifacts\presets\audit-full-130k-2025-12-28-run3\quality-blacklist.crash.live.json `
  --excludeHygieneBad true
```

## Offline analysis with SQLite (recommended)

When `preset-audit.json` grows large (100MB+), opening/parsing it repeatedly is painful. Use the SQLite exporter to build a local index for fast interactive queries.

### Export audit → SQLite

```powershell
cd C:\Users\pc\code\newliveweb

# Full export (writes a single sqlite file)
python scripts\audit-to-sqlite.py `
  --auditIn artifacts\presets\audit-full-130k-2025-12-28-run3\preset-audit.json `
  --dbOut  artifacts\presets\audit-full-130k-2025-12-28-run3\preset-audit.sqlite

# Quick smoke (first 200 entries)
python scripts\audit-to-sqlite.py --limit 200
```

The DB contains:

- `entries` (one row per preset)
- `tags` (many-to-one)
- `reasons` (many-to-one)
- views: `v_tag_counts`, `v_reason_counts`

### Example queries

Use any SQLite client (DB Browser for SQLite, sqlite3 CLI, VS Code SQLite extension).

```sql
-- How many are OK vs NOT OK?
SELECT qualityOk, COUNT(*) AS n
FROM entries
GROUP BY qualityOk
ORDER BY qualityOk;

-- Top failure reasons
SELECT * FROM v_reason_counts LIMIT 20;

-- Top tags
SELECT * FROM v_tag_counts LIMIT 20;

-- Find OK presets in the liquid category
SELECT relPath, fileSize, lineCount
FROM entries
WHERE qualityOk = 1 AND primaryCategory = 'liquid'
LIMIT 50;

-- Find presets with a specific hard-failure reason
SELECT r.relPath
FROM reasons r
WHERE r.reason = 'wasm-abort'
LIMIT 200;
```

### Build crash-safe full partition (run3)

Goal: create a *practical* “safe enough to run” library from run3 by excluding only hard failures (e.g. `wasm-abort`, `render-failed`, `probe-timeout`). This intentionally allows non-crash quality failures like `too-dark`, `low-motion`, etc.

Commands:

- Build the manifest (v1, filtered from the shipped full manifest):
  - `npm --prefix newliveweb run build:run3-crashsafe`

- Add-on: inspect stats / export lists from the SQLite DB:
  - `python newliveweb/scripts/audit_sqlite_tools.py --db newliveweb/artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.sqlite stats`
  - `python newliveweb/scripts/audit_sqlite_tools.py --db newliveweb/artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.sqlite export-relpaths --preset hardfails --out hardfails.txt`
  - `python newliveweb/scripts/audit_sqlite_tools.py --db newliveweb/artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.sqlite export-relpaths --preset crashsafe --out crashsafe.txt`

## Notes

- `public/preset-probe.html` is a minimal host page for the probe.
- Tags are heuristic; adjust thresholds in `scripts/preset-audit.mjs` if needed.

---

## 2025-12-28：中文说明 + 逐条代码证据（中英双语）

> 核对说明 / Verification note:
>
> - 本节内容已按仓库当前代码逐条核对（以文件路径与行号为证据）。
> - 行号以当日版本为准；后续若文件增删行，行号会漂移，但关键标识（函数名/字符串）仍可用 `rg` 复核。

### 概述 / Overview

中文：`scripts/preset-audit.mjs` 用于对超大 MilkDrop/ProjectM `.milk` 预设库做离线审计：扫描 → 预设文本清洗/可选修复输出 → 参数与启发式标签 →（可选）Playwright 质量探测 → 输出报告/统计/黑名单，供后续生成“更安全的子库”。

English: `scripts/preset-audit.mjs` is an offline auditor for large MilkDrop/ProjectM `.milk` libraries: scan → sanitize (optionally write repaired presets) → parse params & heuristic tags → (optional) Playwright quality probing → emit report/summary/blacklist for building safer packs.

### 原理与代码证据（逐条可核对） / Principles & Code Evidence (verifiable)

1) 目标发现：支持目录 walk 或按 manifest 精确审计 / Target discovery: directory walk or exact manifest list

- 代码证据 / Evidence:
  - `scripts/preset-audit.mjs:255`：`readManifestTargets()` 读取 manifest 并生成 `{relPath, fullPath}`。
  - `scripts/preset-audit.mjs:915`：`collectTargets()` 决定用 manifest targets 或 `walk(sourceDir)`。
- 核对 / Verified: 已核对 / confirmed.

2) 文本清洗（自纠错）：编码/换行/控制字符/结尾换行 / Sanitization (self-fix): encoding, newlines, control chars, trailing newline

- 代码证据 / Evidence:
  - `scripts/preset-audit.mjs:375`：`decodePresetText()`：UTF-8 strict → fallback latin1、去 BOM、规范化换行、剔除控制字符、保证末尾换行。
  - `scripts/preset-audit.mjs:413`：`sanitizePreset()`：带超时读文件、检查 `binary-nul/large/empty` 等 warnings，并标记 fatal。
  - `scripts/preset-audit.mjs:219`：`readFileWithTimeout()`：`AbortController` + 超时中止，避免卡死在文件读取。
- 核对 / Verified: 已核对 / confirmed.

3) 启发式预分类：wave/line/liquid/abstract/… / Heuristic pre-tagging: wave/line/liquid/abstract/…

- 代码证据 / Evidence:
  - `scripts/preset-audit.mjs:501`：`inferTags()`：基于参数与行数统计（`per_pixel_`/`per_frame_`/`shape`/`wave_`）+ 质量指标（亮度/运动）打标签。
  - `scripts/preset-audit.mjs:565`：`pickPrimaryCategory()`：按优先级选出主类别。
- 核对 / Verified: 已核对 / confirmed.

4) 质量探测（Playwright + probe page）：在浏览器/WASM 中跑 `probePresetQuality` / Quality probe (Playwright + probe page): run `probePresetQuality` in browser/WASM

- 代码证据 / Evidence:
  - `scripts/preset-audit.mjs:755`：`createProbeContext()`：`import("playwright")` → `chromium.launch()` → `page.goto(devUrl)`。
  - `scripts/preset-audit.mjs:761`：Windows 下为稳定 GPU/WebGL2，默认加 `--use-gl=angle --use-angle=d3d11 ...`，并打印到日志 `[preset-audit] Probe Chromium args: ...`（便于复现你看到的 Chromium flags）。
  - `scripts/preset-audit.mjs:807`：在 probe page 中 `import("/src/features/presets/presetQuality.ts")` 并缓存到 `globalThis.__nw_probePresetQuality`。
  - `scripts/preset-audit.mjs:842`：`runQualityProbeWithRetries()`：对每个预设做硬超时 `Promise.race(...)` + retry + 必要时重建浏览器上下文。
- 核对 / Verified: 已核对 / confirmed.

5) 质量判定指标：亮度/运动/性能/WASM abort/渲染成功 / Quality verdict dimensions: luma, motion, perf, WASM abort, renderOk

- 代码证据 / Evidence:
  - `src/features/presets/presetQuality.ts:186`：`probePresetQuality()` 默认采样参数：`256x144`、warmup=10、sample=30、timeout=4000ms。
  - `src/features/presets/presetQuality.ts:199`：默认阈值：`minAvgLuma=0.06`、`maxAvgLuma=0.96`、`minAvgFrameDelta=0.002`。
  - `src/features/presets/presetQuality.ts:342`：失败原因：`wasm-abort`、`render-failed`、`too-dark/too-bright`、`low-motion`、`slow-render-*`、`no-luma/no-motion-sample` 等。
  - `src/features/presets/presetQuality.ts:387`：`finally { engine?.dispose() }`，确保引擎释放。
  - `src/features/presets/presetQuality.ts:213`：性能阈值 `maxAvgRenderMs/maxP95RenderMs` **默认不启用**（未传入时会变成 `null`，因此不会产生 `slow-render-*`）。
  - `src/features/presets/presetQuality.ts:356`：若 motion 采样完全没拿到数据，则标记 `no-motion-sample`（这更像“测量缺失”，不等同于 `low-motion`）。
  - `src/features/presets/presetQuality.ts:291`：probe 渲染是 tight loop（非真实 60fps）；为避免“机器太快导致 interval 采样永远不触发”，这里使用 **virtual clock(60fps)** 驱动 motion sampler。
  - `scripts/preset-audit.mjs:184`：审计脚本默认 `--probeTimeoutMs 4500`（写入 probe options）。
  - `scripts/preset-audit.mjs:843`：审计脚本外层还有 `hardTimeoutMs`（`probeTimeoutMs + 2500`，上限 120s）并用 `Promise.race` 强制超时，避免单个预设卡死整趟。
- 核对 / Verified: 已核对 / confirmed.

6) 断点续跑：resume + 仅补 probeMissing / Resume: skip seen entries, optionally fill missing probe

- 代码证据 / Evidence:
  - `scripts/preset-audit.mjs:299`：`readExistingReport()`：`--resume true` 时读取既有 `preset-audit.json`，并建立 `seen` 集合。
  - `scripts/preset-audit.mjs:1187`：主循环里：若 `seen.has(relPath)` 则 skip；在 `--probeMissing true` 时会对缺失/短暂失败的 quality 重新 probe。
- 核对 / Verified: 已核对 / confirmed.

7) 看门狗/自愈：超时、重试、刷新上下文、失败预算 / Watchdog & self-heal: timeout, retries, context refresh, failure budget

- 代码证据 / Evidence:
  - `scripts/preset-audit.mjs:170`：`--probeRefreshEvery`：每 N 次 probe 刷新浏览器上下文。
  - `scripts/preset-audit.mjs:713`：`closeProbeContext()`：关闭 page/context/browser，并在必要时 `process.kill(pid)` 防止残留。
  - `scripts/preset-audit.mjs:342`：`isInfraProbeFailure()`：仅把“基础设施失败”计入连续失败预算（刻意不把 `probe-timeout` 算进去）。
  - `scripts/preset-audit.mjs:1282`：`maxProbeFailures` + `probeFailMode`：达到阈值后可 abort/continue/skip。
- 核对 / Verified: 已核对 / confirmed.

8) 稳健写盘：分块写、原子替换、重试、fallback / Robust writes: chunked, atomic replace, retries, fallback

- 代码证据 / Evidence:
  - `scripts/preset-audit.mjs:606`：`atomicWriteTextWithRetries()`：写 `.tmp` → rename 替换 → 失败时 copy+unlink → 多次重试 → 最后 fallback `*.partial.json`。
  - `scripts/preset-audit.mjs:1356`：按 `checkpointEvery` 写 report，并在写失败时退避（backoff）。
- 核对 / Verified: 已核对 / confirmed.

9) 可控运行时长：`--stopAfter` / `--stopAfterSec` / Controllable runtime: `--stopAfter` / `--stopAfterSec`

- 代码证据 / Evidence:
  - `scripts/preset-audit.mjs:1018`：`--stopAfter`/`--stopAfterSec` 出现在 help。
  - `scripts/preset-audit.mjs:1164`：主循环入口检查并 `break`，退出后仍会写最终报告/统计/黑名单。
- 核对 / Verified: 已核对 / confirmed.

10) 输出工件：report/summary/blacklist / Output artifacts: report/summary/blacklist

- 代码证据 / Evidence:
  - `scripts/preset-audit.mjs:80`：输出路径：`preset-audit.json` / `audit-summary.json` / `quality-blacklist.json`。
  - `scripts/preset-audit.mjs:1420`：汇总 `summary`（tags/categories/reasons/totals）。
  - `scripts/preset-audit.mjs:1435`：生成 `blacklist`（bad relPaths + reasons）。
- 核对 / Verified: 已核对 / confirmed.

#### 实战产物清单（以 run3 为例）/ Practical artifact inventory (run3)

中文：大库长跑建议你把输出分成“审计主产物 / 快照产物 / 下游产物 / 监控产物”四类管理，这样你第二天起床能快速判断：**跑没跑完、数据干不干净、下一步该做什么**。

English: For huge overnight runs, group outputs into “audit core / snapshots / downstream / monitoring”, so you can quickly tell if the run finished, whether the data is clean, and what to do next.

- 审计主产物 / Audit core:
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.json`：主 checkpoint（持续写入；**体积大**）。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.log`：审计进程 stdout 日志（含 `[preset-audit] Status:` 心跳）。注意：如果你用 `watch-preset-audit.ps1` 跑长跑并发生重启，`Start-Process -RedirectStandardOutput` 可能会**覆盖**这个文件；此时请以 `preset-audit.supervisor.live.log`（见下方）作为“全程日志”。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/audit-summary.json`：**仅在干净退出时**生成的最终汇总（权威判断“跑完”）。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/quality-blacklist.json`：质量黑名单（`badSourceRelPaths[]` + `badReasonsByRelPath{}`）。

- 快照产物（不中断长跑）/ Snapshots (no stop needed):
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.summary.json`：从 checkpoint 即时汇总（字段含 `withQuality/missing`）。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/quality-blacklist.crash.live.json`：**只拉黑硬失败**（适合做 crash-safe 子库）。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.summary.crash.live.json`：配套 crash 模式 summary。

- 下游产物（给工程用）/ Downstream (for the app):
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.sqlite`：把 JSON 折叠成 SQLite，便于统计/筛选/导出列表。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/quality-blacklist.crash.final.json`：最终版 crash 黑名单（**更小**，通常不带 `badReasonsByRelPath`）。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.summary.final.json`：最终版 summary（通常配合 crash 黑名单的口径）。
  - `public/presets/run3-crashsafe/library-manifest.json`：基于仓库自带 full manifest 过滤出来的 crash-safe 子库（见 `npm run build:run3-crashsafe`）。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/run3-crashsafe.manifest.report.json`：上面那一步的报告。

- 监控/看门狗产物 / Monitoring & watchdog:
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.pid`：当前审计进程 PID（可能会过期；配合 `inspect/kill` 脚本使用）。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.supervisor.lock`：watchdog PID（可能会过期）。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.supervisor.log`：watchdog 日志。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.supervisor.live.log`：如果你用 `Start-Process ... -RedirectStandardOutput` 启动 watchdog，这里会记录 watchdog 的**全程输出**（含带时间戳的 status 行），用于复盘“重启/卡住/退避”的全过程。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.supervisor.live.err.log`：上面 live 日志的 stderr。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.health.log`：健康检查脚本输出（如果你用 `Start-Process` 常驻方式启动）。
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.health.pid`：健康检查脚本的 PID 记录（可用于停掉常驻监控）。

11) 下游：从 audit 生成 safe/unsafe manifests / Downstream: build safe/unsafe manifests from audit

- 代码证据 / Evidence:
  - `scripts/build-safe-unsafe-manifests-from-audit.mjs:7`：默认输入输出路径（full manifest + audit → safe/unsafe manifests）。
  - `scripts/build-safe-unsafe-manifests-from-audit.mjs:17`：`missingQuality` 策略 + `allowBadInSafe` + `requireWasmCompatOk`。
- 核对 / Verified: 已核对 / confirmed.

12) 下游：用黑名单生成更安全的子库 / Downstream: build safer packs using the blacklist

- 代码证据 / Evidence:
  - `scripts/sync-presets.mjs:108`：`--qualityBlacklistFile` 参数入口。
  - `scripts/sync-presets.mjs:113`：`--prefilterBlacklist`（默认当传入 blacklist 时启用）：在抽样阶段先过滤掉黑名单，避免 safe 比例极低时“limit 取不满”。
  - `scripts/sync-presets.mjs:351`：按 blacklist 排除预设并记录 excluded 原因。
- 核对 / Verified: 已核对 / confirmed.

> 下一步 / Next step:
>
> - 如果你的目标是“用大库炼丹做 AIVJ”，建议走 `crash-safe pack → render frames → CLIP embedding → clustering → aivj-style-index` 这条最短路线；可直接按 `docs/reference/AIVJ_ALCHEMY_PLAN.zh.md` 的 runbook 夜跑。

13) 下游：live 快照（不等审计退出）/ Downstream: live snapshot (no stop needed)

- 代码证据 / Evidence:
  - `scripts/snapshot-preset-audit.mjs:1`：脚本目标：从 `preset-audit.json`（checkpoint）生成 summary/blacklist（streaming，低内存）。
  - `scripts/snapshot-preset-audit.mjs:12`：CLI 参数：`--blacklistMode` / `--missingQuality` / `--includeReasonsByRelPath` / `--summaryOut` / `--blacklistOut`。
  - `scripts/snapshot-preset-audit.mjs:240`：写出 `preset-audit.summary*.json` 与 `quality-blacklist.*.live.json`（不依赖 `preset-audit.mjs` 正常退出）。
- 核对 / Verified: 已核对 / confirmed.

### 日志与监控 / Logs & Monitoring

中文：推荐用 `scripts/progress-preset-audit.ps1` 监控 `preset-audit.log` 中的 `[preset-audit] Status:` 心跳，并同时观察 checkpoint 文件更新时间。

English: Use `scripts/progress-preset-audit.ps1` to tail `[preset-audit] Status:` heartbeats and confirm checkpoint updates.

- 代码证据 / Evidence:
  - `scripts/progress-preset-audit.ps1:36`：`Try-ParseStatus()` 从日志行解析 `processed/skipped/probed/ok/bad/rate`。
  - `scripts/progress-preset-audit.ps1:95`：从 log tail 中向上找最近一条 `[preset-audit] Status:`。

#### 进度条终端（推荐常开）/ Progress bar terminal (keep it open)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\progress-preset-audit.ps1" `
  -OutDir "c:\Users\pc\code\newliveweb\artifacts\presets\audit-full-130k-2025-12-28-run3" `
  -Source "c:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets" `
  -RefreshSec 2 -StallWarnSec 120
```

说明 / Notes:

- 断点续跑时，进度条按 `processed + skipped` 显示“有效完成量”（避免重启后 `processed` 回退造成误判）。
- 会在里程碑（每 5000）与 checkpoint 更新时输出 `CONFIRM:`。

#### 健康检查（防止跑出废数据）/ Health checks (prevent bad runs)

快速快照 / one-shot snapshot:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\health-preset-audit.ps1" `
  -OutDir "c:\Users\pc\code\newliveweb\artifacts\presets\audit-full-130k-2025-12-28-run3"
```

低噪声快照（推荐）：`-OneLine -CheckFlags`；如果你不想等 5 秒的 log 增长检测，可以加 `-LogGrowthSeconds 0`：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\health-preset-audit.ps1" `
  -OutDir "c:\Users\pc\code\newliveweb\artifacts\presets\audit-full-130k-2025-12-28-run3" `
  -OneLine -CheckFlags -LogGrowthSeconds 0
```

持续监控 / continuous monitor:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\health-preset-audit.ps1" `
  -OutDir "c:\Users\pc\code\newliveweb\artifacts\presets\audit-full-130k-2025-12-28-run3" `
  -Loop -LoopSeconds 30 `
  -OneLine -CheckFlags
```

后台常驻（不占用终端、写到文件）/ Detached monitor (no terminal spam):

```powershell
$root = "c:\Users\pc\code\newliveweb"
$out  = "c:\Users\pc\code\newliveweb\artifacts\presets\audit-full-130k-2025-12-28-run3"
$script = Join-Path $root "scripts\\health-preset-audit.ps1"
$stdout = Join-Path $out  "preset-audit.health.log"
$stderr = Join-Path $out  "preset-audit.health.err.log"

$args = @(
  "-NoProfile","-ExecutionPolicy","Bypass",
  "-File",$script,
  "-OutDir",$out,
  "-Loop","-LoopSeconds","30",
  "-OneLine","-CheckFlags"
)

$p = Start-Process -FilePath powershell -ArgumentList $args -RedirectStandardOutput $stdout -RedirectStandardError $stderr -NoNewWindow -PassThru
Set-Content -LiteralPath (Join-Path $out "preset-audit.health.pid") -Value $p.Id -Encoding ascii
```

停止后台健康检查 / Stop the detached health monitor:

```powershell
$out  = "c:\Users\pc\code\newliveweb\artifacts\presets\audit-full-130k-2025-12-28-run3"
$pidPath = Join-Path $out "preset-audit.health.pid"
$pid = Get-Content -LiteralPath $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pid) { Stop-Process -Id ([int]$pid) -Force -ErrorAction SilentlyContinue }
```

重点看这些信号 / Key signals:

- `AUDIT pid=... alive=True` 且 `LOG grow=...`：进程仍在推进。
- `PROBE http=200`：probe 页面可达（dev server 正常）。
- `flags:suspend=True failMode=True`：当前审计进程已启用 `--probeSuspendMs` 与 `--probeFailMode continue`（降低 `ERR_CONNECTION_REFUSED` 造成的“脏 probe 数据”）。
- `netErr/refused`：如果持续很高，说明 dev server 抖动/拒绝连接；在启用 `--probeSuspendMs` 时会退避并**留空 quality**，后续可用 `--probeMissing true` 补齐。
- **审计完成的判定**：当 `audit-summary.json` 存在且 `totals.probed === totals.scanned`，说明审计已“正常退出并写出最终产物”。此时 `AUDIT pid alive=False` 是正常的（进程结束了），可以停止 `health-preset-audit.ps1 -Loop` 以免误报“卡死”。

#### 参数核对（确认启用了退避）/ Inspect current flags

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\inspect-preset-audit.ps1" `
  -OutDir "c:\Users\pc\code\newliveweb\artifacts\presets\audit-full-130k-2025-12-28-run3"
```

确保命令行包含：`--probeFailMode continue` 与 `--probeSuspendMs 60000`。

---

## 2025-12-28：130k+ 全库实战运行手册（分段 + 自愈 + 少废日志）

> 背景 / Context:
>
> - 你的预设库路径示例：`C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets`
> - 目标：对 **13 万级** 预设做“可工作性/安全性”验证，输出 `quality-blacklist.json`，并据此生成更安全的子库或 safe manifest。

### 1) 推荐总流程 / Recommended high-level flow

中文（建议顺序）：

1. 先跑一次 `--probe false` 静态审计：得到 tags/分类/基础卫生（编码/控制字符/空文件/二进制 NUL 等）。
2. 再跑 `--probe true` 的质量探测：在 Playwright + WASM ProjectM 中跑 `probePresetQuality()`，得到亮度/运动/性能/WASM abort 等 verdict。
3. 用 `quality-blacklist.json` 生成 “safe pack”（或对某个 manifest 生成 safe/unsafe manifests）。

English (recommended order):

1. Run a fast static scan with `--probe false` to build tags/categories and hygiene info.
2. Run the slow quality probe with `--probe true` to get luma/motion/perf/WASM-abort verdicts.
3. Use `quality-blacklist.json` to build a safer pack (or safe/unsafe manifests for a specific manifest).

### 2) 启动 probe 所需 dev server / Start the dev server for probing

```powershell
cd C:\Users\pc\code\newliveweb
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

自检（必须返回 200）/ Self-check (must return 200):

```powershell
$ProgressPreference='SilentlyContinue'
(Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:5174/preset-probe.html" -TimeoutSec 10).StatusCode
```

如果这里是 `ERR_CONNECTION_REFUSED`：`preset-audit.mjs` 会在启动阶段报 `probe init failed`；当你用 `--probeFailMode continue` 时，会**自动降级为 no-probe** 继续跑静态审计（这对“补 probeMissing”并没有帮助）。

### 3) 130k 全库质量探测：分段跑（推荐） / Full-library probing in segments (recommended)

原因：13 万级 Playwright probe 可能是“小时~天级”；分段 + `--resume true` 可以避免“一次跑到天荒地老”。

示例（每次跑 30 分钟；可反复执行，自动续跑）：

```powershell
cd C:\Users\pc\code\newliveweb
node scripts/preset-audit.mjs `
  --source "C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets" `
  --out "artifacts\presets\audit-full-130k-2025-12-28-run3" `
  --limit 0 `
  --resume true `
  --probe true `
  --probeFailMode continue `
  --checkpointEvery 10000 `
  --probeSuspendMs 60000 `
  --statusEverySec 30 `
  --readTimeoutMs 30000 `
  --stopAfterSec 1800
```

关键参数解释（结合当前实现）：

- `--resume true`：读取既有 `preset-audit.json`；对缺失 quality 的 entry（默认 `probeMissing=true`）会补 probe。
- `--checkpointEvery 10000`：降低写 150MB JSON 的频率（减少 I/O）。
- `--stopAfterSec` / `--stopAfter`：控制分段；退出后仍会写最终 report/summary/blacklist。
- `--probeFailMode continue`：probe 基础设施不稳定时自动禁用 probe 继续跑（避免整趟崩掉）。
- `--probeSuspendMs 60000`：当 dev server/probe 页面临时不可达（例如 `ERR_CONNECTION_REFUSED`）时，**暂停 probe 一段时间**并继续静态扫描，避免反复拉起 Chromium 导致“卡住感/浏览器风暴”；质量数据会保持缺失，后续可用 `--probeMissing true` 补齐。
- `--readTimeoutMs`：单文件读取超时（避免卡死在 I/O）。

### 4) 用看门狗跑（你当前在用的方式） / Run with the watchdog (your current setup)

你当前 out dir 里出现了：`preset-audit.supervisor.* / preset-audit.pid / preset-audit.log`，说明你是用 PowerShell 看门狗脚本在跑。

启动看门狗（自动写 `preset-audit.log` + `preset-audit.err.log`，并在卡住时重启）：

```powershell
cd C:\Users\pc\code\newliveweb
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\watch-preset-audit.ps1 `
  -Source "C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets" `
  -Out "C:\Users\pc\code\newliveweb\artifacts\presets\audit-full-130k-2025-12-28-run3" `
  -DevUrl "http://127.0.0.1:5174/preset-probe.html" `
  -CheckpointEvery 10000 `
  -MaxIdleSec 1800

说明：看门狗内部会调用 `preset-audit.mjs`，并默认启用 `--probeSuspendMs 60000` 来降低 devUrl 掉线时的重试风暴。
```

代码证据（watchdog 的关键行为）/ Evidence (watchdog behavior):

- `scripts/watch-preset-audit.ps1:47`：`preset-audit.supervisor.lock`，防止重复启动多个 supervisor。
- `scripts/watch-preset-audit.ps1:136`：`Start-Process ... -RedirectStandardOutput preset-audit.log -RedirectStandardError preset-audit.err.log`。
- `scripts/watch-preset-audit.ps1:312`：检测 `STALL`（长时间无进度）并重启。
- `scripts/watch-preset-audit.ps1:180`：尽量清理 Playwright browser 进程，减少僵尸进程残留。

### 5) 进度监控（推荐组合） / Progress monitoring (recommended combo)

监控 heartbeat（少废日志、只输出关键进度）：

```powershell
cd C:\Users\pc\code\newliveweb
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\progress-preset-audit.ps1 `
  -OutDir "C:\Users\pc\code\newliveweb\artifacts\presets\audit-full-130k-2025-12-28-run3" `
  -Source "C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets"
```

常见坑 / Common pitfall:

- PowerShell 的 `Select-String` 在“找不到匹配行”时可能返回 exit code=1；这不是脚本崩了，只是“当前还没写出 Status 行”。`progress-preset-audit.ps1` 已内置 “waiting for first status line” 的处理逻辑。

你这次 run3 的“真实输出示例”（用于理解字段含义；会随时间变化）：

```text
[preset-audit] Status: processed=13176 skipped=10000 probed=13176 ok=24 bad=13152 rate=1.45/s
- processed=23176/136109  17.03% rate=1.45/s ETA=21:38:05
```

其中第二行来自 `progress-preset-audit.ps1`：它把 `processed + skipped` 当作“有效完成数”，并用你本机扫描到的 `TOTAL` 估算 ETA（这不是 `preset-audit.mjs` Status 行自带的 `eta=` 字段）。

卡住感（典型原因）/ “Feels stuck” (common cause):

- 如果你在 `preset-audit.log` 里看到 `lastProbeErr=...ERR_CONNECTION_REFUSED...`，这通常表示 `http://127.0.0.1:5174/preset-probe.html` 短暂不可达。
  - 解决：确保 dev server 在跑（端口 5174 可达）。
  - 新版本会用 `--probeSuspendMs` 做退避：暂停 probe 并继续静态扫描，避免无限重启 Chromium。

快速复现你看到的 Chromium flags（日志里那一行）：

```powershell
Get-Content -LiteralPath "artifacts\\presets\\audit-full-130k-2025-12-28-run3\\preset-audit.log" -Tail 200 |
  Select-String -SimpleMatch "[preset-audit] Probe Chromium args:" |
  Select-Object -Last 1
```

查看当前正在跑的审计进程（watchdog 会把 PID 写到 `preset-audit.pid`）：

```powershell
Get-Content -LiteralPath "artifacts\\presets\\audit-full-130k-2025-12-28-run3\\preset-audit.pid"
Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^node(\\.exe)?$' -and $_.CommandLine -match 'preset-audit\\.mjs' } |
  Select-Object ProcessId, CommandLine | Format-List
```

Status 行字段速查 / Status line field legend:

- `processed`：本次进程实际处理（写入/更新 entry）的数量（分段续跑时会重置）。
- `skipped`：因 `--resume` 直接跳过的数量（例如：已有稳定 quality、或 fatal 预设不再 probe）。
- `probed`：本次进程实际做过质量探测的数量。
- `ok/bad`：probe 结果 `quality.ok === true/false` 的计数（bad 不等于“危险”，只是“不满足阈值/或 probe 失败原因”。）
- `rate`：`processed / elapsedSec`（单位：entries/s）。
- `eta`：仅在目标总数已知时出现（例如使用 manifest 或 limit-picked 列表时）。
- `probe`：`disabled|init|ready|suspended`（`suspended` 通常表示 `probeSuspendMs` 退避中）。
- `lastProbeErr`：最近一次“基础设施级”probe 失败摘要（timeout 通常不会计入 infra 连败预算）。

### 6) 产物解释（你会拿来做后续自动化的） / Outputs you will actually use downstream

- `preset-audit.json`：主报告（每个预设一条 entry），包含：`warnings/fixes/tags/primaryCategory/quality/*metrics*`。
- `preset-audit.log`：运行日志（包含 `[preset-audit] Status:` 与 probe/Chromium 相关信息）。
- `audit-summary.json`：统计摘要（tags/categories/reasons/totals；**仅在审计进程“正常退出”时写出**）。
- `quality-blacklist.json`：坏预设集合（`badSourceRelPaths` + reasons；**仅在审计进程“正常退出”时写出**）。
- `preset-audit.summary*.json` / `quality-blacklist.*.live.json`：**推荐**（用 `snapshot-preset-audit.mjs` 从 checkpoint 即时生成的可用产物；无需停机）。

重要约束 / Important constraint:

- `quality-blacklist.json` 的 `badSourceRelPaths` 是**相对 `sourceRoot` 的路径**（见 `preset-audit.json` 的 `sourceRoot`）；后续生成 safe pack 时，必须保持同一套 sourceRoot 语义，否则路径对不上。

长跑推荐 / Long-run recommendation:

- 看门狗跑几个小时期间，`audit-summary.json` / `quality-blacklist.json` 可能一直不存在（或很久不更新）。
- 这时请用 `scripts/snapshot-preset-audit.mjs` 生成“live summary/blacklist”，并用它们构建 safe pack。

示例（run3，生成两种“安全级别”的 live blacklist）：

```powershell
cd C:\Users\pc\code\newliveweb
$out = "C:\Users\pc\code\newliveweb\artifacts\presets\audit-full-130k-2025-12-28-run3"

# crash-safe：只拉黑“崩溃/硬失败类”（适合作为现场演出“安全库”）
node scripts/snapshot-preset-audit.mjs --outDir "$out" --blacklistMode crash --missingQuality unsafe `
  --summaryOut "$out\preset-audit.summary.crash.json" `
  --blacklistOut "$out\quality-blacklist.crash.live.json" `
  --logEveryEntries 0

# ok-only：仅保留 quality.ok === true（质量门禁最严格，但数量可能很小）
node scripts/snapshot-preset-audit.mjs --outDir "$out" --blacklistMode quality --missingQuality unsafe `
  --summaryOut "$out\preset-audit.summary.okonly.json" `
  --blacklistOut "$out\quality-blacklist.okonly.live.json" `
  --logEveryEntries 0
```

### 7) 从 blacklist 生成“更安全子库” / Build a safer pack from the blacklist

提示 / Tip:

- `scripts/sync-presets.mjs` 会在抽样阶段**预过滤** blacklist（当传入 `--qualityBlacklistFile` 时默认启用，日志会打印：`Prefilter blacklist during sampling: true`），避免“safe 比例极低 → reservoir 先抽后滤 → limit 取不满”的问题。
- 长跑期间请优先用 `quality-blacklist.*.live.json`（snapshot 产物）；等审计彻底结束再用 `quality-blacklist.json` 做最终版。

示例（run3 的 smoke pack；避免一次性拷贝上万文件影响 dev server）：

```powershell
cd C:\Users\pc\code\newliveweb
npm run sync:presets -- --target run3-okonly-smoke --limit 50 `
  --qualityBlacklistFile "artifacts\presets\audit-full-130k-2025-12-28-run3\quality-blacklist.okonly.live.json" `
  --excludeHygieneBad true `
  --seed 1

npm run sync:presets -- --target run3-crashsafe-smoke --limit 200 `
  --qualityBlacklistFile "artifacts\presets\audit-full-130k-2025-12-28-run3\quality-blacklist.crash.live.json" `
  --excludeHygieneBad true
```

### 8) 停止/清理（避免残留浏览器进程） / Stop & cleanup (avoid orphan browsers)

```powershell
cd C:\Users\pc\code\newliveweb
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\kill-preset-audit.ps1 -OutMatch "audit-full-130k-2025-12-28-run3"
```

### 9) 实测现象（run3 示例） / Real-world snapshot (run3 example)

#### 9.1 最终结果（以 `audit-summary.json` 为准） / Final result (from `audit-summary.json`)

本次 run3 已完整跑完（文件：`artifacts/presets/audit-full-130k-2025-12-28-run3/audit-summary.json`）：

- 总量：`scanned=136109`, `probed=136109`, `ok=1284`, `bad=134825`
- 分层（基于 `quality-blacklist.json` 的 `badReasonsByRelPath` 统计）：
  - **crash/hard-fail bad**（含 `wasm-abort` / `render-failed` / 任意 `Aborted(...)` / `probe-timeout`）：`116388`
  - **aesthetic-only bad**（仅 `too-dark/too-bright/low-motion/no-motion-sample/...`）：`18437`
  - 推导：**crash-safe 可用池** ≈ `136109 - 116388 = 19721`（其中 `ok=1284`）

Top reasons（`audit-summary.json:reasons`）：

- `too-dark=84459`
- `wasm-abort=71879`
- `Aborted(…exception catching is not enabled…)=23737`
- `Aborted(native code called abort())=20541`
- `no-motion-sample=11493`
- `Aborted(both async and sync fetching of the wasm failed)=224`
- `probe-timeout=6`

重要解释 / Important interpretation:

- `too-dark` / `no-motion-sample` 经常与 `wasm-abort` 同时出现（本质是崩溃后采样缺失/黑屏的副产物）。因此做“演出安全库（crash-safe）”时，**优先按 hard-fail 分层**，不要把 `too-dark` 直接等价成“预设必然没用/危险”。
- `Aborted(both async and sync fetching of the wasm failed)` 更像 **probe 基础设施问题**（WASM 没拉起来），建议单独列出并回填重测（见下文“回填/再 probe”）。

#### 9.2 中途快照（长跑期间更可靠） / Mid-run snapshots (more reliable during long runs)

以你当前这次跑出来的 snapshot summary 为例（长跑期间比 `audit-summary.json` 更可靠）：

- 文件：`artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.summary.json`
- 关键字段（示例）：`scanned=136109`, `withQuality=77881`, `ok=937`, `bad=76944`, `missing=58228`
- 常见原因（示例）：`wasm-abort`、`too-dark`、`no-motion-sample`，以及 **Emscripten/ProjectM 的 abort 文本**（如 `Aborted(...)`）

解释 / Interpretation:

- `ok` 的判定是 **reasons 数组为空**（`reasons.length === 0`）才算通过，所以在“门禁较严”或“WASM不稳定”时，`ok` 可能非常低。
- `reasons` 不止是固定枚举：`probePresetQuality()` 的 `catch` 会把异常 message 作为 reason 返回，所以你会在 summary 里看到一条很长的 abort 文本被当作 reason 统计。

### 10) reasons 分层与处理策略 / Reason taxonomy & what to do

建议把 `quality.reasons` 分成 4 类（便于后续自动化决策）：

1) **硬崩溃/硬失败（强烈建议直接拉黑）**
- `wasm-abort`
- `render-failed`
- `Aborted(...)` 这类 runtime abort 文本（通常意味着 WASM 内部不可恢复失败）

2) **探测基础设施失败（应触发自愈/重试，而不是“预设坏”）**
- `probe-unavailable`
- `probe-error`（部分属于 infra，需结合 `errorText`）
- `Execution context was destroyed` / `Target closed` / `net::ERR_*` / `ECONNREFUSED`

3) **探测超时（通常按“不安全/不适合演出”处理；但不算 infra 连败）**
- `probe-timeout`

4) **质量门禁/测量缺失（不一定危险，但可能“不适合演出”）**
- 质量门禁：`too-dark` / `too-bright` / `low-motion`
- 测量缺失：`no-luma` / `no-motion-sample`
- 性能门禁（需显式启用阈值才会出现）：`slow-render-avg` / `slow-render-p95`

### 11) 参数 cookbook（少废日志 + 可持续跑） / Param cookbook (low-noise + sustainable)

1) **130k 全库“分段探测”（推荐默认）**

```powershell
cd C:\Users\pc\code\newliveweb
node scripts/preset-audit.mjs `
  --source "C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets" `
  --out "artifacts\presets\audit-full-130k-2025-12-28-run3" `
  --limit 0 `
  --resume true `
  --probe true `
  --probeFailMode continue `
  --checkpointEvery 10000 `
  --statusEverySec 30 `
  --probeRefreshEvery 300 `
  --probeTimeoutMs 4500 `
  --readTimeoutMs 30000 `
  --stopAfterSec 1800
```

2) **Debug 单个预设（可视化排障）**

- 用 `--headless false` 观察浏览器行为；必要时加大 `--probeTimeoutMs`。
- 推荐先用 `--sample first --limit 1` 快速验证链路，再用 `--manifest` 精确复现某个 relPath。

### 12) 回填/再 probe（当你修复了 probe 逻辑/阈值） / Backfill & re-probe after changes

事实：`--resume true` + `--probeMissing true` **只会**重测“缺失 quality”或“短暂 probe 失败（timeout/unavailable/error 等）”的条目；
对已经有 `quality.ok=false` 的条目（例如 `no-motion-sample`）不会自动重测。

当你修复了 probe 逻辑（例如我们已对 motion sampler 加了 virtual clock，减少 `no-motion-sample` 假阳性）时，建议用下面的回填方式：

1) 先把旧报告里某类 reason 的 `quality` 清掉（让它变成“missing quality”）
2) 再用 `preset-audit.mjs --resume true --probeMissing true` 补测

（推荐）使用脚本：`scripts/prepare-audit-for-reprobe.mjs`（会自动备份原文件）

```powershell
cd C:\Users\pc\code\newliveweb
node scripts/prepare-audit-for-reprobe.mjs `
  --in "artifacts\presets\audit-full-130k-2025-12-28-run3\preset-audit.json" `
  --reasons "no-motion-sample" `
  --inplace true

node scripts/preset-audit.mjs `
  --source "C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets" `
  --out "artifacts\presets\audit-full-130k-2025-12-28-run3" `
  --resume true --probe true --probeMissing true --probeFailMode continue `
  --checkpointEvery 10000 --statusEverySec 30 --stopAfterSec 1800
```

### 13) `preset-audit.json` 结构速查 / Schema quick reference

顶层字段（简化）：

- `version` / `generatedAt` / `updatedAt`
- `sourceRoot`：**非常重要**（relPath 相对根）
- `entries[]`：每个预设一条记录

`entries[i]` 常用字段：

- `relPath`：相对 `sourceRoot` 的路径（跨工具链对齐的 key）
- `fileName` / `pack` / `fileSize` / `decodedAs`
- `warnings[]`：如 `binary-nul` / `large` / `empty` / `read-failed`
- `fixes[]`：如 `decoded-latin1` / `removed-bom` / `normalized-line-endings` / `stripped-control-chars`
- `lineCount` / `counts` / `params`
- `tags[]` / `primaryCategory`
- `quality`：`{ ok, reasons, avgLuma, avgFrameDelta, avgRenderMs, p95RenderMs, renderOk, aborted, errorText? }`
- `probedAt`

### 14) 可选：对某个 manifest 生成 safe/unsafe manifests / Optional: safe/unsafe manifests for a given manifest

当你已有某个子库的 manifest（例如 `public/presets/mega/library-manifest.json`）并想要导出 safe/unsafe 两个版本时：

```powershell
cd C:\Users\pc\code\newliveweb
node scripts/build-safe-unsafe-manifests-from-audit.mjs `
  --fullIn "public/presets/mega/library-manifest.json" `
  --auditIn "artifacts/presets/audit-full-130k-2025-12-28-run3/preset-audit.json" `
  --outSafe "public/presets/mega/library-manifest.safe.json" `
  --outUnsafe "public/presets/mega/library-manifest.unsafe.json" `
  --missingQuality unsafe
```
