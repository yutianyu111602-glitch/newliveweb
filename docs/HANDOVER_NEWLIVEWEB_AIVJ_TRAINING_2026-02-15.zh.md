# newliveweb × AIVJ 训练与产物闭环：接手文档（2026-02-15）

面向：接手的工程师 / 编程 AI  
适用：Windows + PowerShell；GPU：RTX 4090（强烈建议）  
目标：把“离线训练/炼丹产物”稳定地变成 **runtime 可消费的 JSON**，并能通过 `verify:dev` / `verify:check` 门禁。

这份文档是“接手入口”，但不是唯一事实源：
- 全项目 SSOT：`newliveweb/MASTER_SPEC.zh.md`
- AIVJ 范围内 SSOT：`newliveweb/docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md`
- 耦合质量过夜训练 Runbook（实操）：`newliveweb/docs/reports/COUPLED_QUALITY_OVERNIGHT_PLAYBOOK_2026-02-14.zh.md`
- eval 续跑与音频稳定性修复（近期变更）：`newliveweb/docs/reports/COUPLED_EVAL_RESUME_AND_AUDIO_STABILITY_FIX_2026-02-15.zh.md`
- “为什么随机都像黑线”的现实报告（数据分布解释）：`newliveweb/docs/reports/COUPLED_VISUAL_DIVERSITY_AND_TRAINING_REALITY_REPORT_2026-02-15.zh.md`

---

## 0) 30 秒 TL;DR（跑起来 + 监控 + 不造废数据）

### 0.1 只做“监控”，不打断正在跑的训练

WebUI（推荐）：
```powershell
cd C:\Users\pc\code
# 自动选择 newliveweb/artifacts/coupled-eval/ 下最新的 overnight-* 目录：
node .\newliveweb\scripts\monitor-webui.mjs --port 5195
#
# 或者指定某一次长跑 stamp（更稳，适合你同时跑多个 outDir 时）：
# node .\newliveweb\scripts\monitor-webui.mjs --stamp 2026-02-15_163645 --port 5195
# 打开 http://127.0.0.1:5195/
```

命令行（快速一眼看是否卡死）：
```powershell
irm http://127.0.0.1:5195/api/status `
  | select stage, @{n='ageSec';e={$_.eval.evalJsonl.ageSec}}, @{n='visited';e={$_.eval.derived.byPack.ai_generated_coupled_final.visitedUnique}}
```

### 0.2 从“耦合 pack”开始的一键过夜闭环（eval → train+score → verify）

```powershell
powershell -ExecutionPolicy Bypass -File .\newliveweb\scripts\run-coupled-quality-overnight.ps1 `
  -Packs "ai_generated_coupled_final,ai_generated_coupled" `
  -CleanupStale `
  -EvalPickMode shuffle `
  -TargetCoverage 0.99 -MaxHours 10 -ReloadEvery 800 `
  -GpuMode safe -Headed `
  -Epochs 20 -BatchSize 256 -ExtraEvalWeight 0.35 `
  -NegSamples 50000 -NegWeight 0.20 -NegMinPairDistance 50 `
  -MinQualityStd 0.03 `
  -VerifyPack "ai_generated_coupled_final"
```

关键点：
- `-Headed` 是为了 **真 GPU WebGL**（避免 headless SwiftShader CPU 渲染）。
- 训练阶段 PyTorch 会强制 `device=cuda`（没有 CUDA 会直接失败，避免悄悄 CPU 跑废）。
- 浏览器会静音输出（不吵你），但仍会把音频频谱送进分析链路。

---

## 1) newliveweb 项目是什么（你需要的心智模型）

一句话：`newliveweb` 是一个浏览器端实时可视化引擎（ProjectM WASM + WebGL），用音频驱动渲染与选择策略，并用一套可复现的 **verify 门禁 + 证据链 artifacts** 保证“不会越改越玄学”。

你会反复遇到的核心原则：
1. **runtime 不加载模型**：浏览器只吃 JSON（例如 `pairs-quality.v0.json`），不在前端跑 PyTorch。
2. **训练/炼丹的价值取决于闭环**：产物如果不进入 runtime 选择/门禁验收，就会长期像“废物”。
3. **不要递归扫大目录**：尤其 `D:\aidata`（大数据域）。用明确文件路径 + `Test-Path`。

---

## 2) repo 地图（接手必须记住的路径）

### 2.1 Runtime 主入口与关键模块（TypeScript）

- 启动与策略入口：`newliveweb/src/app/bootstrap.ts`
  - URL 参数开关（`coupled=1`, `coupling3d=on` 等）
  - 预设切换 / coupled 选择 / AIVJ 控制
  - verify hooks：`window.__nw_verify.getVerifyState()`（采样脚本/Playwright 用）
- 耦合 pack 加载（runtime 只吃 JSON）：`newliveweb/src/features/presets/coupledPairsLoader.ts`
- 耦合数据结构（manifest/quality schema）：`newliveweb/src/features/presets/coupledPairsStore.ts`
- 预设质量探测（亮度/运动阈值）：`newliveweb/src/features/presets/presetQuality.ts`
- 音频（运行时特征 SSOT）：`newliveweb/src/audio/AudioBus.ts`（以及相关 audio 模块）

### 2.2 Offline 训练 / 采样 / 门禁脚本（Node/Playwright/Python）

耦合质量链路（你近期最常跑）：
- 采样生成 eval：`newliveweb/scripts/headless-eval-coupled-pairs.mjs`
- 训练 + 出分：`newliveweb/python/unified_coupling_trainer.py`
- 一键过夜编排（sync → eval → train → verify）：`newliveweb/scripts/run-coupled-quality-overnight.ps1`
- baseline（只 train+score，不扩数据）：`newliveweb/scripts/train-coupled-quality.ps1`
- 单 pack pipeline（sync+train+verify）：`newliveweb/scripts/run-coupled-quality-pipeline.ps1`
- 清理遗留浏览器：`newliveweb/scripts/kill-stale-headless-browsers.ps1`
- 门禁入口（会跑 Playwright）：`newliveweb/scripts/verify-dev.mjs` → `newliveweb/scripts/headless-verify.mjs`

监控：
- WebUI：`newliveweb/scripts/monitor-webui.mjs`（静态前端在 `newliveweb/scripts/monitor-webui/`）
- 命令行监控：`newliveweb/scripts/monitor-coupled-overnight.ps1`

---

## 3) 数据域 vs 运行时域（最容易搞混的地方）

你可以把数据分成三层：

### 3.1 源库（原始、可信、可重建）

- 你本机的源预设库（非常大）：`C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025`
  - 这更像“素材原矿”，不要直接全量搬进 `public/`。
  - 建议做“子集化 + 索引化 + 可验收”后再接入。

### 3.2 炼丹产物域（大、杂、不要递归扫）

- `D:\aidata\...`
  - 包含大量生成/筛选/训练过程的中间产物与 pack。
  - 重要：**不要**用递归扫描命令（会卡死/超时），用明确文件路径读取。

### 3.3 运行时消费域（必须稳定、可 fetch）

- `newliveweb/public/`
  - 任何 runtime 真正会加载的东西都应在这里（或可被 Vite 静态服务）。
  - coupled pack：`newliveweb/public/presets/<pack>/pairs-manifest.v0.json` + `fg/*.milk` + `bg/*.milk`
  - coupled 质量产物：`newliveweb/public/presets/<pack>/pairs-quality.v0.json`

---

## 4) 耦合 pack / 训练输入输出契约（硬信息）

### 4.1 CoupledPairsManifestV0（runtime 输入）

类型定义：`newliveweb/src/features/presets/coupledPairsStore.ts`

核心文件：
- `newliveweb/public/presets/ai_generated_coupled_final/pairs-manifest.v0.json`
- `newliveweb/public/presets/ai_generated_coupled/pairs-manifest.v0.json`

当前事实（2026-02-15，本机文件统计）：
- `ai_generated_coupled_final`：pairs=3000，uniqueFgUrls=3000，uniqueBgUrls=3000（总 `.milk` 约 6000）
- `ai_generated_coupled`：pairs=500，uniqueFgUrls=500，uniqueBgUrls=500（总 `.milk` 约 1000）

### 4.2 pairs-quality.v0.json（runtime 输入；由离线 trainer 生成）

加载逻辑：`newliveweb/src/features/presets/coupledPairsLoader.ts`

规则：`pairs-manifest.v0.json` 同目录固定名字：
- `.../pairs-manifest.v0.json` → `.../pairs-quality.v0.json`

trainer 输出结构（来自 `unified_coupling_trainer.py`）：
- `qualityStats`：min/p50/p95/std 等，用来判断信号有没有“塌缩成常数”
- `pairs[]`：每个 pair 的 `quality01`（0~1）
- `stats.missingFiles`：有多少对因为文件缺失没打分（应接近 0）

### 4.3 Elite 监督集（离线训练强监督锚点）

路径（默认）：`D:\aidata\AIVJ_FINAL_ELITE\AIVJ_FINAL_ELITE_MANIFEST.json`

当前事实（2026-02-15，本机文件统计）：
- entries=200
- score 分布：pos(score>=4)=150，neg(score<=2)=50
- unique `.milk`：fg=200，bg=200，总 400

### 4.4 eval.jsonl + meta.json（扩展训练集；来自浏览器采样）

目录：`newliveweb/artifacts/coupled-eval/<stamp>/`
- `eval.jsonl`：一行一条采样记录（JSONL）
- `meta.json`：复现契约（packs、阈值、WebGL renderer、音频文件选择、进度）
- `vite.log`：过程日志（pick-timeout、recover、webgl probe、audio probe）

eval 字段说明以 `meta.json.fields` 为准；关键字段你一定会用到：
- `pack/pair`：到底切换了哪个 pair
- `vizAvgLuma/vizAvgFrameDelta`：亮度/动态 proxy（用于 okHeuristic）
- `audioRms/audioPeak`：音频信号是否真的在喂（静音不等于没信号）
- `okHeuristic/reasons`：阈值失败原因（too-dark/low-motion 等）

---

## 5) “AIVJ 训练计划”到底包含什么（两条主线）

很多人把“训练”理解成“跑神经网络”。但在 newliveweb 里，真正决定系统质量的是两条主线：

### 5.1 主线 A：AIVJ 输出优化（产物驱动，不依赖 PyTorch）

核心思想：
- 把离线验收/统计结果做成 `run-manifest.json`（或其他索引 JSON）
- runtime 选择器（AIVJ/style-index/权重函数）消费这些 JSON
- verify 门禁把“能否稳定运行/性能/错误率”量化并落盘

权威文档（SSOT）：
- `newliveweb/docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md`

典型脚本（目录：`newliveweb/scripts/aivj/`）：
- `build-run-manifest.mjs`：生成 `public/run-manifest.json`
- `run-acceptance-tests.mjs`：验收脚本体系（会写 `artifacts/` 证据链）
- `dashboard-server.mjs`：本地仪表盘服务（历史方案）
- embedding/cluster/lora trainlist 相关：用于“从大库里组织可用子集”，不直接进 runtime

验收入口：
- Dev 门禁：`npm --prefix newliveweb run verify:dev`
- Release 门禁：`npm --prefix newliveweb run verify:check`

你真正会跑的“验收套件”（建议接手第一天就跑一次）：
- 脚本：`newliveweb/scripts/aivj/run-acceptance-tests.mjs`
- 用法：
```powershell
cd C:\Users\pc\code\newliveweb
node scripts/aivj/run-acceptance-tests.mjs
```
它会串行执行（大概）：
1) `npm run lint` / `npm run guardrails`
2) `npm run verify:dev`（生成 `artifacts/headless/report.json` 等证据链）
3) `npm run verify:check`（release 硬门禁）
4) 若干统计脚本（selection ratio / preload perf / frame-time / budget dynamics）

### 5.2 主线 B：Coupled Pair Quality Net（离线 PyTorch；runtime 只吃 JSON）

核心思想：
- “耦合对（FG+BG）”本身是一类很难靠规则写死的资产
- 我们用离线训练给每个 pair 一个 `quality01`
- runtime 只加载 `pairs-quality.v0.json`，用于 `coupledPick=weighted` 等策略（或后续多策略融合）

关键文件：
- 采样：`newliveweb/scripts/headless-eval-coupled-pairs.mjs`
- 训练与出分：`newliveweb/python/unified_coupling_trainer.py`
- runtime 合并：`newliveweb/src/features/presets/coupledPairsLoader.ts`

注意：这条链路真正耗时的不是 PyTorch epoch，而是 **浏览器采样覆盖率**（特别是你追求 0.99 覆盖率时）。

---

## 6) 耦合质量过夜 pipeline（一步一步，含“为什么”）

这里给出“最不容易造废数据”的标准流程。更详细 Runbook 见：
- `newliveweb/docs/reports/COUPLED_QUALITY_OVERNIGHT_PLAYBOOK_2026-02-14.zh.md`

### 6.1 Preflight（5 分钟，先断言环境没问题）

AI（PowerShell）：
```powershell
cd C:\Users\pc\code

# 1) 大路径只做存在性检查，不递归扫描
Test-Path D:\aidata\AIVJ_FINAL_ELITE\AIVJ_FINAL_ELITE_MANIFEST.json
Test-Path .\newliveweb\public\presets\ai_generated_coupled_final\pairs-manifest.v0.json

# 2) torch CUDA（训练必须用 CUDA，否则直接 fail）
python -c "import torch; print(torch.__version__); print('cuda_available', torch.cuda.is_available()); print('device0', torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)"
```

人话：
- 你宁愿现在 10 秒失败，也不要跑 4 小时再发现“路径不对/torch 没 CUDA”。

### 6.2 Sync（可选，但经常需要）

什么时候需要：
- `public/presets/<pack>/pairs-manifest.v0.json` 不存在
- 或你怀疑 `D:\aidata` 的 pack 更新了，需要重新同步到 runtime 域

AI：
```powershell
cd C:\Users\pc\code\newliveweb
node scripts/sync-aidata-packs.mjs --srcBase D:/aidata --destBase public/presets --pack ai_generated_coupled_final
```

人话：
- `sync-aidata-packs.mjs` 会读 `D:\aidata\<pack>\manifest.jsonl`，复制 fg/bg `.milk`，并生成 `pairs-manifest.v0.json`。
- 这一步只复制指定 pack，不应该扫整个 `D:\aidata`。

### 6.3 Eval 采样（最耗时；决定你是否在造“废数据”）

最重要的现实：
- Windows 下 Playwright **headless** Chromium 很常回退 **SwiftShader（CPU 软件渲染）**。
- 所以要“尽量用 4090”，采样必须 `--headed`。

AI（推荐：用一键脚本跑 eval+train+verify）：
```powershell
cd C:\Users\pc\code\newliveweb
powershell -ExecutionPolicy Bypass -File .\scripts\run-coupled-quality-overnight.ps1 `
  -Packs "ai_generated_coupled_final,ai_generated_coupled" `
  -CleanupStale `
  -EvalPickMode shuffle `
  -TargetCoverage 0.99 -MaxHours 10 -ReloadEvery 800 `
  -GpuMode safe -Headed `
  -SkipVerify
```

人话：
- `shuffle` 基本是线性遍历，覆盖率冲 0.99 不会变成“集卡抽到天亮”的随机问题。
- `meta.json.runtime.webgl.renderer` 出现 `RTX 4090 ... D3D11` 才算真 GPU。

静音但要频谱输入（你最关心）：
- eval 默认会对浏览器加 `--mute-audio`（不出声）
- 但仍会从文件喂音频到 WebAudio 分析
- `eval.jsonl` 里 `audioRms` 应非 0（例如 0.005+），否则就是“静音也静了输入”，会导致 motion/动态评估失真

续跑（避免重复跑已覆盖 pair）：
- 如果中断/失败，用 `--resume` 续跑同一个 outDir（会读取已有 `eval.jsonl` 的 visited set）
- 详见：`newliveweb/docs/reports/COUPLED_EVAL_RESUME_AND_AUDIO_STABILITY_FIX_2026-02-15.zh.md`

### 6.4 Train + Score（快，但必须 GPU）

trainer 文件：`newliveweb/python/unified_coupling_trainer.py`

硬规则：
- 默认要求 CUDA：没有 CUDA 会直接 raise（除非你显式 `--allow-cpu`）
- 会打印 `nvidia-smi` 快照（before/after）

一键脚本已包含训练与出分；如果你只想单独训练/出分（baseline）：
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\train-coupled-quality.ps1 -Pack ai_generated_coupled_final -Epochs 50 -BatchSize 32
```

### 6.5 Verify（门禁：不要靠肉眼）

入口：`npm --prefix newliveweb run verify:dev`

关键环境变量：
- `VERIFY_URL`：要测哪个页面（coupled 时带 query）
- `VERIFY_OUT_DIR`：证据链输出目录
- `VERIFY_GPU=1` + `VERIFY_GPU_MODE=safe`：verify 也尽量用真 GPU（否则可能 SwiftShader）
- `VERIFY_MUTE_AUDIO=1`：verify 静音

一键脚本 `run-coupled-quality-overnight.ps1` 在你传 `-Headed` 时会自动设置：
- `VERIFY_GPU=1`
- `VERIFY_GPU_MODE=safe`
- `VERIFY_MUTE_AUDIO=1`

---

## 7) 监控与“避免造废数据”的实时检查清单

你不需要看画面“是不是变了”，你要看 **可观测信号**：

### 7.1 eval 是否还活着（最可靠）

1) `eval.jsonl` 的 mtime 是否每几十秒更新一次  
2) WebUI `alerts` 是否出现 `eval_stale`（180s 不更新会报警）

### 7.2 是否真 GPU（不要用 Task Manager 猜）

看 `meta.json.runtime.webgl.renderer`：
- ✅ 正常：包含 `NVIDIA GeForce RTX 4090` / `Direct3D11`
- ❌ 废：包含 `SwiftShader`

### 7.3 是否在切换（避免“没切换还在写垃圾行”）

看 `eval.jsonl` 的 `pair` 是否在变化、unique visited 是否增加：
- WebUI 会从 eval.jsonl 派生 unique visited
- `meta.json.progress` 只是每 50 次写一次，更新慢是正常的

### 7.4 静音但有频谱输入

看 `eval.jsonl`：
- `audioRms` 是否非 0
- `audioPeak` 是否有波动

### 7.5 数据分布 sanity（避免整晚都在采“全黑无动”）

允许 “pack 本身偏暗/低动” 的事实存在，但你应该知道它在发生：
- `okHeuristic` 比例是多少
- `reasons` 主要是什么（too-dark / low-motion / pageerror）

如果长期 95%+ 都是 too-dark/low-motion：
- 这是数据分布问题（pack 同质化），不是采样脚本坏了
- 详见：`COUPLED_VISUAL_DIVERSITY_AND_TRAINING_REALITY_REPORT_2026-02-15.zh.md`

---

## 8) 常见故障与处理（只写会让你浪费一整夜的）

### 8.1 CPU 满载 GPU 不动

原因：
- headless Chromium WebGL 回退 SwiftShader（软件渲染）

处理：
- eval/verify 用 headed（`-Headed` / `VERIFY_GPU=1`）
- 以 `meta.json.runtime.webgl.renderer` 为准，不要凭感觉

### 8.2 “页面看起来不动/预设切不了/一直两层”

先分清：
- coupled 模式本来就是 FG+BG 两层同时渲染，“一直两层”不是 bug
- 真正要看的是 `pair` 是否在切

怎么判断：
- 看左上角 eval overlay 文本（pair/visited/fg/bg）是否在变
- 看 `eval.jsonl` 的 `pair` 是否在变

### 8.3 reload 后 `audio-silent` 导致 abort

这是已知问题并已修复为可恢复（支持 `--resume` + restart session）。详见报告：
- `newliveweb/docs/reports/COUPLED_EVAL_RESUME_AND_AUDIO_STABILITY_FIX_2026-02-15.zh.md`

### 8.4 采样进入 “Manual coupled loading: pair ...” 很久

含义：
- runtime 在手动加载某个 pair（可能是 IO/解码慢、或某些 preset 特别重）

处理建议（优先级高→低）：
1) 增加 pickTimeout（如果脚本参数支持）
2) 降低 reloadEvery（更频繁 reload 可能更稳定，也可能更慢）
3) 把异常 pairId 记录下来，后续在 pack 生成阶段做黑名单/修复

### 8.5 训练输出 `qualityStats.std` 太小（信号塌缩）

处理：
1) 增加 `--neg-samples` / `--neg-weight`
2) 增加 `--extra-eval-weight`（让视觉项更强）
3) 增加 eval 覆盖率（最有效）

trainer 会在 `--min-quality-std` 下直接 fail，避免把“常数信号”写进 runtime。

### 8.6 遗留无头浏览器（chrome.exe 吃资源）

清理：
```powershell
powershell -ExecutionPolicy Bypass -File .\newliveweb\scripts\kill-stale-headless-browsers.ps1
```

---

## 9) 利用 130k 源库的现实计划（不扫大目录，不直接搬全量）

你现在看到的 coupled pack（尤其 `ai_generated_coupled_final`）在视觉上会“黑线同质化”，这更多是 **pack 内容分布**，不是 3D 耦合算法本身。

一个更现实的方向是：把 130k 源库当作“原矿”，做一条可验证的“子集化 → 生成 → 验收 → 接入”链路：

建议路线（高层，不涉及 UI 外观改动）：
1) 从源库生成一个小而可靠的候选子集（例如 5k-15k）
2) 用离线 probe/渲染抽样做质量与多样性指标（luma/motion/错误率/脚本特征）
3) 生成新的 coupled pack（FG/BG 配对策略明确、可复现）
4) 对新 pack 跑 eval 覆盖率 + trainer 出 `pairs-quality.v0.json`
5) 用 `verify:dev` / `verify:check` 做门禁（避免“好像更好看但不稳定”）

注意事项：
- 不要把 “D:\aidata 里训练过很多轮的数据” 当作永远可信的源；源库才是可重建基准。
- 任何“生成/筛选”都要落盘：manifest + 版本 + 参数 + 统计报告，否则下次接手者无法复现。

---

## 10) MilkDrop3 `.milk2` 双 preset 系统 vs 我们现在的 coupled

现实结论：
- newliveweb 当前 coupled 是 “两份 `.milk`（FG/BG）在 runtime 同时渲染 +（可选）3D 合成”，数据契约是 `pairs-manifest.v0.json`/`pairs-quality.v0.json`。
- MilkDrop3 的 `.milk2` 是另一套“文件格式/运行时实现”。它是否能直接复用，取决于：
  1) `.milk2` 是否只是“引用两份 `.milk` + 混合参数”的文本格式
  2) 还是包含二进制资源/嵌入数据/专有字段

仓库里已有一个“安全探测脚本”，不猜 spec、不做转换，只做嗅探：
- `newliveweb/scripts/milk2-sniff.mjs`

用法：
```powershell
cd C:\Users\pc\code\newliveweb
node scripts/milk2-sniff.mjs --file "C:/path/to/preset.milk2"
```

下一步如果要“避免重复造轮子”，推荐做法是：
1) 先用 sniff 确认 `.milk2` 是否可文本解析（还是二进制）
2) 如果是纯文本引用两份 `.milk`，再设计一个 **转换到 pairs-manifest 的一次性工具**（而不是让 runtime 支持 `.milk2`）
3) 如果是复杂格式，优先继续坚持 “runtime 只吃 JSON 产物” 的路线，不要把解析复杂度塞进浏览器

---

## 11) 接手第一天 Checklist（建议照做）

1) 确认环境
- `node -v`、`npm -v`
- `python -c "import torch; print(torch.cuda.is_available())"`
- `nvidia-smi`

2) 确认 runtime 能跑
- `npm --prefix newliveweb run dev`
- 浏览器打开 `http://127.0.0.1:5174/`

3) 跑一次最小门禁（不要跳过）
- `npm --prefix newliveweb run verify:dev`

4) 跑一次 coupled smoke（10-20 分钟）
- 参考 `COUPLED_QUALITY_OVERNIGHT_PLAYBOOK_2026-02-14.zh.md` 的 smoke 命令

5) 开 WebUI 监控长跑
- `node newliveweb/scripts/monitor-webui.mjs --port 5195`

6) 过夜跑（覆盖率 0.99）
- `run-coupled-quality-overnight.ps1 -Headed -TargetCoverage 0.99 ...`

7) 第二天早上只看硬证据
- `pairs-quality.v0.json` 的 mtime 是否晚于这次 run 的 startedAt
- `qualityStats.std` 是否达标（>=0.03）
- `stats.missingFiles` 是否接近 0
- `verify:dev` 是否 exit 0

---

## 12) 参数与环境变量速查（复制即用）

### 12.1 `run-coupled-quality-overnight.ps1`（一键过夜编排）

文件：`newliveweb/scripts/run-coupled-quality-overnight.ps1`

常用参数（只列你会频繁改的）：
- `-Packs "ai_generated_coupled_final,ai_generated_coupled"`：要跑哪些 pack
- `-RunStamp 2026-02-15_163645`：固定输出目录 stamp（便于 resume/对比）
- `-Sync`：从 `D:\aidata` 同步 pack 到 `public/presets`（会调用 `sync-aidata-packs.mjs`）
- `-CleanupStale`：开跑前清理遗留 Playwright 浏览器进程
- `-ResumeEval`：给 eval 脚本加 `--resume`（从同 outDir 续跑覆盖率）
- `-TargetCoverage 0.99` / `-MaxHours 10` / `-ReloadEvery 800`
- `-EvalPickMode shuffle|random|weighted`：推荐 `shuffle`
- `-GpuMode safe|off|force-d3d11`：推荐 `safe`
- `-Headed`：必须（Windows 下 headless 容易 SwiftShader）
- 训练超参：
  - `-Epochs 20 -BatchSize 256 -LearningRate 0.001`
  - `-ExtraEvalWeight 0.35`
  - `-NegSamples 50000 -NegWeight 0.20 -NegMinPairDistance 50`
  - `-MinQualityStd 0.03`（std 太低直接 fail，避免出“常数信号”）
- verify：
  - `-VerifyPack ai_generated_coupled_final`
  - `-HardTimeoutMs 900000`
  - `-SkipVerify`（只想生成/训练，不跑门禁时用）

### 12.2 `headless-eval-coupled-pairs.mjs`（采样生成 eval.jsonl）

文件：`newliveweb/scripts/headless-eval-coupled-pairs.mjs`

你需要记住的行为（比参数更重要）：
- 它会启动或复用 Vite，然后 Playwright 打开页面并循环点击 `#preset-next` 切换 coupled pair
- 它会写：
  - `eval.jsonl`（每次切换一行）
  - `meta.json`（复现契约 + 稀疏 progress）
  - `vite.log`（详细过程与异常）
- 它会探测 WebGL renderer 写进 meta（用来判定是否 SwiftShader）
- 默认会静音浏览器输出（不吵你），但会喂音频给 WebAudio 分析；必要时 fallback click-track
- `--resume` 会读已有 `eval.jsonl` 的 visited set，续跑补齐覆盖率（避免重复）

常用参数（与 `run-coupled-quality-overnight.ps1` 对齐）：
- `--packs a,b`
- `--host 127.0.0.1 --port 5174`
- `--coupledPick shuffle|random|weighted`
- `--targetCoverage 0.99 --maxHours 10 --reloadEvery 800`
- `--gpuMode safe|off|force-d3d11 --headed --startMaximized`
- `--audioRoot D:/CloudMusic --requireAudio`
- `--resume`

### 12.3 `unified_coupling_trainer.py`（训练 + 出分）

文件：`newliveweb/python/unified_coupling_trainer.py`

关键事实：
- 默认强制 CUDA（没有 CUDA 会直接失败；只有 `--allow-cpu` 才会放过）
- 会输出 checkpoint + pairs-quality JSON

常用参数：
- `--elite-dir D:/aidata/AIVJ_FINAL_ELITE`
- `--output-dir newliveweb/outputs/coupling`
- `--epochs 20 --batch-size 256 --learning-rate 0.001`
- `--extra-eval-jsonl <path>`（可重复）
- `--extra-eval-weight 0.35`
- `--neg-samples 50000 --neg-weight 0.20 --neg-min-pair-distance 50`
- `--score-manifests <csv>` 或 `--score-manifest <path>`（可重复）
- `--min-quality-std 0.03`（std 太低会报错；可配合 `--score-calibrate-std` 自动做 monotonic std-stretch）
- `--project-root <repoRoot>`（用于 url->public path 解析）

产物位置：
- checkpoint：`newliveweb/outputs/coupling/models/coupling_net_final.pth`
- pack 分数：`newliveweb/public/presets/<pack>/pairs-quality.v0.json`

### 12.4 `verify:dev` / `headless-verify.mjs` 环境变量

入口脚本：
- `newliveweb/scripts/verify-dev.mjs`（负责启动/复用 Vite）
- `newliveweb/scripts/headless-verify.mjs`（Playwright 真正执行者）

常用 env（PowerShell）：
- `VERIFY_URL`：要测的 URL（coupled 时例：`http://127.0.0.1:5174/?coupled=1&coupledPack=ai_generated_coupled_final`）
- `VERIFY_OUT_DIR`：证据链输出目录（默认 `newliveweb/artifacts/headless/`）
- `VERIFY_HARD_TIMEOUT_MS`：硬超时
- `VERIFY_GPU=1`：启用 headful + GPU 模式（Windows 下避免 SwiftShader）
- `VERIFY_GPU_MODE=safe|force-d3d11|off`
- `VERIFY_MUTE_AUDIO=1`：静音
- `VERIFY_DSF=1.5`：deviceScaleFactor（默认 1.5）
- `VERIFY_HEADLESS=1`：强制 headless（一般不建议和 GPU 目标同时用）
