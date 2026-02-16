# run3 崩溃预设修复路线图（最短收益排序）

> 目标：把 `MilkDrop 130k+` 的 run3 审计结果，转成一个**可长期演出（crash-safe）**、并且能逐步“修复→回填→扩池→炼丹”的闭环。
>
> 本文以你这次 run3 的真实产物为基准：
>
> - 总结：`newliveweb/artifacts/presets/audit-full-130k-2025-12-28-run3/audit-summary.json`
> - 黑名单：`newliveweb/artifacts/presets/audit-full-130k-2025-12-28-run3/quality-blacklist.json`

## 0) 现状：run3 关键数字（你已经跑完了）

来自 `audit-summary.json`：

- `scanned=136109`, `probed=136109`, `ok=1284`, `bad=134825`
- Top reasons：
  - `too-dark=84459`
  - `wasm-abort=71879`
  - `Aborted(exception catching is not enabled...)=23737`
  - `Aborted(native code called abort())=20541`
  - `no-motion-sample=11493`
  - `Aborted(wasm fetch failed)=224`
  - `probe-timeout=6`

从 `quality-blacklist.json:badReasonsByRelPath` 进一步分层（你现在做决策用它更靠谱）：

- **hard-fail / 演出硬风险**：`116388`（含 `wasm-abort` / `render-failed` / `probe-timeout` / 任意 `Aborted(...)`）
- **aesthetic-only / 审美不佳但不一定会崩**：`18437`（如 `too-dark/too-bright/low-motion/no-motion-sample`）
- 推导：**crash-safe 池** ≈ `136109 - 116388 = 19721`（其中严格 `ok-only=1284`）

> 关键结论：
>
> - **“修复崩溃”优先级 > “修复不好看”**。先拿到一个大且稳的 crash-safe 池，AIVJ 才能长期跑。
> - `too-dark` 大量存在，强烈暗示：要么缺纹理/外部资源，要么没给音频驱动，要么预设就是黑；它不等价于“会崩”。

## 1) 为什么会“崩”：按代码证据拆解

### 1.1 `Aborted(exception catching is not enabled...)`

这是典型的 Emscripten 编译配置问题：WASM 内部抛了异常，但构建时禁用了异常捕获，于是直接 `abort()`。

- 证据：run3 统计里该 reason 达 `23737`
- 证据（WASM 提示文本本身）：`Compile with -sNO_DISABLE_EXCEPTION_CATCHING ...`
- 相关运行时入口：`newliveweb/src/projectm/ProjectMEngine.ts` 的 `createProjectMModule({ onAbort })`

**最短收益方向**：优先考虑“引擎级修复”（重编译 projectM WASM 开启异常捕获），比逐个改 `.milk` 更可能救回一大片。

### 1.2 `wasm-abort` / `Aborted(native code called abort())`

这类更像“运行时不可恢复失败”：可能是解析器/方程执行/资源访问/内存等问题触发 abort。

- 证据：`ProjectMEngine.ts` 在 `onAbort` 里把 `aborted=true` 写到 `globalThis.__projectm_verify`（审计用这个判定 `wasm-abort`）
- 证据：`src/features/presets/presetQuality.ts` 在 `aborted || !renderOk` 时直接硬失败返回（避免“崩溃后黑屏→too-dark/no-motion-sample”污染原因）

**最短收益方向**：把这些 hard-fail 先从演出池剔除；再做“破坏性降级修复”尝试性回收一小部分。

### 1.3 `probe-timeout` / `wasm fetch failed`

这通常不是“预设坏”，更像**探测基础设施抖动**（dev server/浏览器上下文/网络/缓存）。

- 证据：`scripts/preset-audit.mjs` 有 `probeFailMode` / `probeSuspendMs` / `probeRefreshEvery` 的自愈逻辑
- 证据：`scripts/prepare-audit-for-reprobe.mjs` 支持把指定 reason 的 `quality` 清空后回填重测

**最短收益方向**：把这类当成“脏数据”，单独回填重测，避免污染 blacklist。

## 2) 最短收益排序：你应该怎么做（可落地 runbook）

下面按“收益/成本比”排序，每一步都给出**验收标准**与**命令**。

### S0（5 分钟）：确认数据干净、可复用

验收：

- `audit-summary.json` 存在，且 `totals.probed === totals.scanned`
- `probe-timeout` 很低（run3 为 6），`ERR_CONNECTION_REFUSED` 不大量出现

命令：

```powershell
cd C:\Users\pc\code\newliveweb
Get-Content -LiteralPath artifacts\presets\audit-full-130k-2025-12-28-run3\audit-summary.json -Raw
```

### S1（10~30 分钟）：回填“基础设施失败”的条目（去脏）

目标：把 `probe-timeout` / `wasm fetch failed` 这类条目重测一遍，减少“误黑”。

验收：

- `audit-summary.json:reasons` 中 `probe-timeout` 和 `Aborted(wasm fetch failed)` 明显下降

命令（推荐：自动备份+就地清理）：

```powershell
cd C:\Users\pc\code\newliveweb
node scripts/prepare-audit-for-reprobe.mjs `
  --in "artifacts\presets\audit-full-130k-2025-12-28-run3\preset-audit.json" `
  --reasons "probe-timeout,both async and sync fetching of the wasm failed" `
  --inplace true

node scripts/preset-audit.mjs `
  --source "C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets" `
  --out "artifacts\presets\audit-full-130k-2025-12-28-run3" `
  --resume true --probe true --probeMissing true --probeFailMode continue `
  --checkpointEvery 10000 --statusEverySec 30 --stopAfterSec 1800
```

### S2（1 小时内起效）：生成“演出安全池”（crash-safe pack / manifest）

目标：只排除 hard-fail，让 AIVJ 长时间跑不硬崩。

验收：

- 你能在 UI 里切到一个 crash-safe library 并稳定跑 30~60 分钟以上

命令（仓库内置：基于 sqlite 过滤自带 full manifest）：

```powershell
cd C:\Users\pc\code\newliveweb
npm run build:run3-crashsafe
```

如果你想从 130k 外部库**拷贝一个真正的本地 pack**（便于后续离线渲染/炼丹），用：

```powershell
cd C:\Users\pc\code\newliveweb
npm run sync:presets -- `
  --target run3-crashsafe-5000 `
  --source "C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets" `
  --limit 5000 `
  --qualityBlacklistFile "artifacts\presets\audit-full-130k-2025-12-28-run3\quality-blacklist.crash.final.json" `
  --excludeHygieneBad true
```

### S3（当晚可跑）：NoWavesNoShapes “降级修复”回收一部分 `wasm-abort-only`

目标：针对 `reasons == ["wasm-abort"]` 这类“更像脚本层触发”的预设，禁用 wave/shape 自定义代码换取稳定。

你这次 run3 里 **`wasm-abort-only` 约 5323 条**（来自 `quality-blacklist.json` 统计），这是最值得先打的靶子。

验收：

- 经过修复+复测后，“硬崩溃”显著下降（哪怕变成 `too-dark` 也算先保命）

命令（建议先做 200~1000 的样本验证再放大）：

```powershell
cd C:\Users\pc\code\newliveweb

# 1) 生成（或复用）带 reasons 的 crash live blacklist，供 repair 精确筛 wasm-abort-only
node scripts/snapshot-preset-audit.mjs `
  --outDir "artifacts\presets\audit-full-130k-2025-12-28-run3" `
  --blacklistMode crash `
  --missingQuality unsafe `
  --includeReasonsByRelPath true `
  --blacklistOut "quality-blacklist.crash.live.json" `
  --summaryOut "preset-audit.summary.crash.live.json"

# 2) 输出修复 pack（默认只挑 wasm-abort-only；支持断点续跑）
node scripts/repair-crash-presets-nowavesnoshapes.mjs `
  --blacklist "artifacts\presets\audit-full-130k-2025-12-28-run3\quality-blacklist.crash.live.json" `
  --sourceRoot "C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets" `
  --outDir "public\presets\run3-nowavesnoshapes-200" `
  --limit 200

# 3) 复测修复 pack（快）
node scripts/preset-audit.mjs `
  --source "public\presets\run3-nowavesnoshapes-200" `
  --out "artifacts\presets\audit-run3-nowavesnoshapes-200" `
  --limit 0 --probe true --resume false

# 4) 用统计脚本评估“修复救回率”
python scripts\measure-nowavesnoshapes-salvage.py `
  --repairReport "public\presets\run3-nowavesnoshapes-200\repair-nowavesnoshapes.report.json" `
  --auditOutDir "artifacts\presets\audit-run3-nowavesnoshapes-200"
```

### S4（最高潜在收益，但成本更高）：重编译 projectM WASM（开启异常捕获）

目标：对 `Aborted(exception catching is not enabled...)` 这 `23737` 条，优先走“引擎级修复”。

详细操作与 A/B 复测流程见：`docs/reference/PROJECTM_WASM_REBUILD.zh.md`。

验收：

- 取 500~2000 个该类预设做 A/B：新 wasm 下 abort 显著下降

建议路线：

1) 在 `c:\Users\pc\code\projectm` 仓库中找到 emscripten 构建脚本/CI 配置
2) 增加 Emscripten linker flags：
   - `-sNO_DISABLE_EXCEPTION_CATCHING`（或精确白名单 `-sEXCEPTION_CATCHING_ALLOWED=[..]`）
3) 产出新的 `projectm.js` + `projectm.wasm`
4) 覆盖到 `newliveweb/public/projectm-runtime/`（建议先备份旧文件）
5) 重新跑小样本审计（只针对该 reason 的 reprobe list）

> 注意：开启异常捕获会让 wasm 体积/性能有变化，但你有 4090，且这是“把 2.3 万条从硬崩变成可处理错误”的最短路。

### S5（改善“太暗”池的最大杠杆）：补齐纹理包 + 音频驱动

目标：把大量 `too-dark` 从“黑屏/无纹理/无音频”修正到“能看”。

优先做两件事：

1) **纹理包**：把 MilkDrop texture pack（projectM 官方推荐）放到 web 运行时可访问的位置，并确认 projectM 能加载到。
2) **音频驱动**：审计/离线渲染时给 `ProjectMEngine.addAudioData()` 提供合成音频（你现在的离线渲染脚本已默认 synthetic audio）。

> 这一步更偏“工程集成”，不是单纯改 `.milk` 能解决的。

## 3) 最终闭环（推荐）

你可以把整个流程变成一个可无限迭代的闭环：

1) `preset-audit`（全库/分段） → `preset-audit.json` / `audit-summary.json` / `quality-blacklist.*`
2) `snapshot`（crash/quality 两套 blacklist） → 生成可用池/子库
3) `repair`（NoWavesNoShapes 等策略） → 生成修复 pack
4) `re-audit`（修复 pack 复测） → 只纳入“修复后 crash-safe”的部分
5) `AIVJ 炼丹`：对 crash-safe pack 离线渲染 → embedding → 聚类 → `aivj-style-index.v0.json`
6) 线上用 bandit/self-learning 继续优化“风格偏好”

其中 2/3/4 是“扩池”，5/6 是“炼丹”。
