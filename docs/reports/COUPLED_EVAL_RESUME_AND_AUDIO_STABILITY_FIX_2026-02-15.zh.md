# Coupled Eval 续跑与音频稳定性修复报告（2026-02-15）

## TL;DR
本次长跑（stamp=`2026-02-15_163645`）在覆盖率约 **80.3%** 时退出，根因是 **reload 后音频 RMS 瞬时过低** 被当作致命错误导致 eval 直接 abort。

已完成两类修复（不改 runtime 外观代码）：
1. `headless-eval-coupled-pairs.mjs` 支持 `--resume`：从已有 `eval.jsonl` 读取已访问 pair，继续补齐覆盖率，避免“重复跑已覆盖样本”浪费。
2. 音频检测更鲁棒：等待 `#audio-toggle` 可用 + 多次轮询 `__projectm_verify.lastAudioRms`；reload/recover 阶段音频失败不再直接 abort，而是 **重启 browser+bootstrap 继续跑**（并保留 visited）。

同时新增了一个 WebUI 监控面板：
- `node newliveweb/scripts/monitor-webui.mjs --stamp 2026-02-15_163645`
- 打开 `http://127.0.0.1:5195/` 实时看覆盖率、最后一条 eval、WebGL renderer、nvidia-smi、日志 tail。

---

## 1. 本次产物快照（失败前）
Eval outDir：
- `newliveweb/artifacts/coupled-eval/overnight-2026-02-15_163645/`

关键文件：
- `meta.json`
  - `finishedAt=2026-02-15T11:45:48.914Z`
  - `error.message="reload audio(file+fallback) failed: audio-silent rms=0.000356..."`（iter=2400）
  - WebGL renderer：`NVIDIA GeForce RTX 4090 ... D3D11`（非 SwiftShader）
  - `muteAudio=true`（静音输出，但仍有频谱输入）
- `eval.jsonl`
  - `lines=2386`
  - `uniquePairs(ai_generated_coupled_final)=2385`
  - 覆盖率：`2385/2970=80.3%`（目标 99%）

数据质量指标（从 eval.jsonl 统计）：
- okHeuristic：`269/2386 = 11.3%`
- 主要失败原因：`too-dark`、`low-motion`（该 pack 当前视觉分布确实偏暗/低动）

---

## 2. 根因分析（为什么会在 reload 时 abort）
现状逻辑（旧）：
- reload 后调用 `ensureAudioFromFile(... waitMs=600 requireSignal=true)`
- 失败则 fallback `ensureAudioClickTrack(... waitMs=600 requireSignal=true)`
- fallback 仍失败则 **throw**，导致整个 eval 退出（并写入 meta.error）

实际失败现象：
- reload 后短时间内 `__projectm_verify.lastAudioRms` 被采样到低于阈值（约 3.5e-4）
- 由于只做“一次等待 + 一次采样”，把“短暂低 RMS/尚未就绪”误判为“音频不可用”

---

## 3. 已实施的修复（代码级）
### 3.1 `--resume`：续跑补齐覆盖率，避免重复造废数据
文件：
- `newliveweb/scripts/headless-eval-coupled-pairs.mjs`

新增能力：
- `--resume`：读取 outDir 下已有 `eval.jsonl`，按 pack 构建 `visited` 集合，并跳过已完成 pack。
- 同时把旧 `meta.error` 迁移到 `meta.errors[]`，清掉 `finishedAt`，让监控/续跑语义正确。

为什么有效：
- 续跑从“缺失 pair”继续补齐，而不是重新随机抽样，避免浪费数小时重复渲染已覆盖样本。

### 3.2 音频检测更鲁棒 + reload/recover 音频失败可恢复
文件：
- `newliveweb/scripts/headless-eval-coupled-pairs.mjs`

改动点：
- `ensureAudioFromFile` / `ensureAudioClickTrack`
  - 等待 `#audio-toggle` **从 disabled 变为可用**（加载/解码是异步的）
  - 在 `waitMs` 窗口内 **循环轮询** `__projectm_verify.lastAudioRms`，而不是只读一次
- reload/recover 分支：
  - 音频多次尝试仍失败：不再 throw abort，而是 `recreateBrowserSession()` + `bootstrapWithRetries()` 继续跑（保持 visited）
- bootstrap 重试策略：
  - 把 `audio-silent` / `requireAudio` 等也视为可恢复错误，允许重启 browser 尝试自愈

为什么有效：
- 防止“瞬时未就绪/短暂低 RMS”导致整轮 eval 终止。
- 真音频故障时通过 restart 走自愈路径，避免产生长段“静音导致低动态”的垃圾样本。

---

## 4. 续跑指令（建议）
### 4.1 只续跑 eval（推荐先补齐覆盖率再训练）
在 `newliveweb/` 目录下：
```powershell
node scripts/headless-eval-coupled-pairs.mjs `
  --packs ai_generated_coupled_final,ai_generated_coupled `
  --host 127.0.0.1 --port 5174 `
  --coupledPick shuffle `
  --gpuMode safe --headed --startMaximized `
  --targetCoverage 0.99 --maxHours 10 --reloadEvery 800 `
  --outDir artifacts/coupled-eval/overnight-2026-02-15_163645 `
  --audioRoot D:/CloudMusic --requireAudio `
  --resume
```

### 4.2 用一键脚本续跑整个 pipeline
```powershell
.\newliveweb\scripts\run-coupled-quality-overnight.ps1 `
  -RunStamp 2026-02-15_163645 `
  -CleanupStale `
  -ResumeEval `
  -EvalPickMode shuffle -GpuMode safe -Headed `
  -TargetCoverage 0.99 -MaxHours 10 -ReloadEvery 800
```

---

## 5. 监控与验收（避免造废数据）
监控（WebUI）：
- `node newliveweb/scripts/monitor-webui.mjs --stamp 2026-02-15_163645 --port 5195`
- 打开 `http://127.0.0.1:5195/`

验收点：
- `meta.json.runtime.webgl.renderer` 不含 `SwiftShader`
- `eval.jsonl` 的 `pair` 持续变化，且 `uniquePairs` 持续上升
- 覆盖率达到：
  - `ai_generated_coupled_final`: `>=2970`
  - `ai_generated_coupled`: `>=495`
- 续跑完成后：
  - 进入训练阶段生成新 `pairs-quality.v0.json`（mtime 应晚于本次 run 的 startedAt）
  - `verify:dev`（coupled）通过

