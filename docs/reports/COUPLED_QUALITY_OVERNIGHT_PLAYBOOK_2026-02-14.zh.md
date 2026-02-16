# newliveweb 耦合网络过夜训练与 GPU 优先优化 Runbook（AI 可执行 + 白话注释）
更新: 2026-02-14

目标读者
- AI/自动化代理: 需要按步骤执行并产出可验收结果
- 你本人: 需要知道每一步在做什么、为什么做、卡住时怎么判断

核心目标
- 运行时(浏览器)只消费 JSON 产物: `newliveweb/public/presets/<pack>/pairs-quality.v0.json`
- 离线训练(本机 Python)产出 checkpoint + 给 pack 出分
- 过夜 6-12 小时真正耗时在 “浏览器采样覆盖率”，不是 GPU 反向传播

你现在看到的“两个图层”是什么
- coupled 模式本来就是 fg+bg 两层同时渲染，所以“看起来一直是两层”是正常现象
- 你真正要确认的是 “pair 是否在切换”
- 最可靠的判断: 看页面左上角的 `eval overlay` 文本是否在变 (pair/visited/fg/bg 文件名/音频 rms)
- 其次: 看 `eval.jsonl` 里的 `pair` 是否在变化

---

## TL;DR（先 smoke，再过夜）

### 1) 清理遗留浏览器进程（每次开跑前建议做）
AI:
```powershell
powershell -ExecutionPolicy Bypass -File .\newliveweb\scripts\kill-stale-headless-browsers.ps1
```
人话:
中断/超时后 Playwright 的 `chrome.exe` 有时会残留在后台持续吃 CPU/内存，先清掉避免后续“莫名其妙卡死”。

### 2) 10-20 分钟 smoke（只验证闭环，不追求质量）
AI:
```powershell
powershell -ExecutionPolicy Bypass -File .\newliveweb\scripts\run-coupled-quality-overnight.ps1 `
  -Packs "ai_generated_coupled_final" `
  -CleanupStale `
  -EvalPickMode shuffle `
  -TargetCoverage 0.01 -MaxHours 0.05 -ReloadEvery 0 `
  -GpuMode safe -Headed `
  -Epochs 5 -BatchSize 256 -NegSamples 2000 -MinQualityStd 0.0 `
  -SkipVerify
```
人话:
smoke 的目的不是“训练好”，而是确认整条链路都能跑通:
采样能写 `eval.jsonl`，Trainer 能用 CUDA，能写 `pairs-quality.v0.json`。

### 3) 6-12 小时过夜（GPU 优先，目标覆盖率 99% + 门禁）
AI:
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
人话:
这会打开一个真实浏览器窗口跑很久，主要时间花在采样覆盖率上。
训练本身会很快，重点是数据覆盖和负样本。

---

## 为什么 CPU 满载但 GPU 没怎么动

结论(AI):
- Windows 上 Playwright 的 headless Chromium 很常见会把 WebGL 回退到 SwiftShader(纯 CPU 软件渲染)
- 所以你会看到 CPU 90%+，GPU 3D 基本不动
- 解决: eval/verify 用 `-Headed`，并用 `GpuMode=safe`

人话:
你跑的最耗时部分是 “浏览器画面渲染 + 切换 + 采样”，如果 WebGL 不走显卡，就是 CPU 在模拟显卡干活。

怎么确认是否真的用上 4090
AI:
```powershell
$d = Get-ChildItem .\newliveweb\artifacts\coupled-eval | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$meta = Join-Path $d.FullName "meta.json"
(Get-Content $meta -Raw | ConvertFrom-Json).runtime.webgl
```
人话:
`renderer` 里出现 `NVIDIA GeForce RTX 4090 ... D3D11` 代表真 GPU。
出现 `SwiftShader` 代表软渲染，这次采样基本就是 CPU “苦力”。

---

## 静音但要有频谱输入(你最关心的点)

你想要的是:
- 训练期间不听到音乐
- 但网页仍然有音频分析输入(频谱/能量)，让预设有正常动态

当前实现(重要事实)
- eval 采样脚本默认启用 Chromium `--mute-audio` (`--muteAudio` 默认为 true)
- 同时把页面 `#audio-volume` 设为 100，避免 “音量=0 导致分析=0”
- 如果从 `D:/CloudMusic` 找到的音频文件无法产生有效信号，会自动 fallback 到内置 click-track WAV

怎么确认“静音但有信号”
- 看 eval.jsonl: `audioRms` 应该是非零(例如 0.005+)

---

## 覆盖率冲 0.99 的关键优化（避免“后 10% 抽卡抽到天亮”）

现状解释（人话）：
- 以前 eval 用 `coupledPick=random` 时，属于“放回抽样”，越接近 99% 覆盖率越慢（典型集卡问题）。

现在的做法（AI）：
- eval 默认用 `coupledPick=shuffle`：对 pack 内 pair 先洗牌，再逐个遍历；取完再洗牌。
- 结果：覆盖率增长近似线性，3000 pairs 的 99% 约等于 2970 次有效切换即可完成（再加少量重启/超时带来的重复）。
- 你耳朵听不到任何声音是正常的(被浏览器层面静音)

---

## 输入/输出契约(给 AI 的硬约束)

输入必须存在
- Elite manifest: `D:\aidata\AIVJ_FINAL_ELITE\AIVJ_FINAL_ELITE_MANIFEST.json`
- Pack manifest: `newliveweb/public/presets/<pack>/pairs-manifest.v0.json`

eval 采样产物
- `newliveweb/artifacts/coupled-eval/<timestamp>/eval.jsonl`
- `newliveweb/artifacts/coupled-eval/<timestamp>/meta.json`
- `newliveweb/artifacts/coupled-eval/<timestamp>/vite.log`

训练/出分产物(runtime 消费)
- checkpoint: `newliveweb/outputs/coupling/models/coupling_net_final.pth`
- pack 质量: `newliveweb/public/presets/<pack>/pairs-quality.v0.json`

---

## 为什么之前会“没切换还在写废数据”，现在不会

采样脚本的防废物机制
- 等待 coupled 真正启用: `coupled.enabled == true` 且 pack 匹配
- self-test: 连续 2 次点击 `#preset-next`，必须看到 `lastPick.timeMs` 变化，否则直接报错退出
- pick 超时不会写入 `pair:null` 的垃圾行(只记录到 vite.log 并执行恢复)
- `Target page/context/browser has been closed` 会自动重启浏览器并继续(默认最多 20 次)

你应该看哪里确认它在切换
- 页面左上角 `eval overlay` 的 `pair=` 和 `visited=` 会持续变化
- `eval.jsonl` 中 `pair` 会持续变化
- `meta.json.progress[pack].visited` 会持续增长

---

## 训练阶段为什么现在不容易“输出塌缩成常数”

问题本质
- neg_samples 很大时，如果简单 shuffle，训练 batch 会被 neg 淹没
- 结果模型容易学成“所有东西都差不多”，导致 `qualityStats.std` 很小

当前实现
- Trainer 使用 `WeightedRandomSampler` 按 source 做比例采样(默认 elite/eval/neg = 0.25/0.25/0.50)
- 保证每个 epoch 的 batch 里稳定出现 elite/eval anchor

---

## 验收标准(跑完就知道值不值)

产物存在
- `newliveweb/public/presets/ai_generated_coupled_final/pairs-quality.v0.json`
- `newliveweb/public/presets/ai_generated_coupled/pairs-quality.v0.json`
- `newliveweb/artifacts/coupled-eval/<ts>/eval.jsonl`
- `newliveweb/artifacts/coupled-eval/<ts>/meta.json`

信号质量
- `qualityStats.std >= 0.03` (低于这个，pipeline 应该失败并提示你要加数据或调参)
- `qualityStats.min` 明显低于 `qualityStats.p50` (建议至少差 0.05)
- `stats.missingFiles` 接近 0

门禁
- `npm --prefix newliveweb run verify:dev` 返回码为 0

GPU 真实性
- eval 的 `meta.json.runtime.webgl.renderer` 包含 `RTX 4090` 且不包含 `SwiftShader`
- Trainer 日志出现 `device=cuda` 且打印 `nvidia-smi` 快照

---

## 故障排查矩阵(卡住时你应该怎么判断)

现象: 页面看起来一直不变
- 人话: 很多 pair 本来就偏暗/低动，肉眼不容易分辨
- 你应该看:
  - 左上角 eval overlay 的 `pair=` 是否变化
  - `eval.jsonl` 的 `pair` 是否在变
  - `eval.jsonl` 的 `audioRms` 是否非零

现象: `audioRms` 约等于 0 或一直是 null
- 人话: 音频没真正跑起来(常见于 autoplay 或音量被置 0)
- 你应该看:
  - `vite.log` 的 `audio:file` / `audio:click` 行
  - meta.json 里记录的 `audio.audioFile`
- 处理:
  - 脚本会自动 fallback click-track
  - 如果仍失败，说明页面音频控件没 ready 或 selector 变了

现象: CPU 90%+, GPU 几乎不动
- 人话: 你在用 SwiftShader 软渲染
- 处理:
  - 必须 `-Headed`
  - 看 meta.json 的 `runtime.webgl.renderer`

现象: `Target page, context or browser has been closed`
- 人话: 浏览器崩了或页面崩了
- 处理:
  - 采样脚本会自动重启并继续
  - 如果超过 `browserMaxRestarts` 会失败，去看 `vite.log` 的 crash/console.error

现象: `qualityStats.std < 0.03`
- 人话: 信号仍然太窄，runtime 用起来等于“接近常数”
- 处理路径(优先级从高到低):
  - 增加 eval 覆盖率(这是最有效的)
  - 增加 neg_samples 或调高 ExtraEvalWeight
  - 增加 epochs(最后再做)

---

## 关键文件(你要找代码就看这些)
- eval sampler: `newliveweb/scripts/headless-eval-coupled-pairs.mjs`
- orchestrator: `newliveweb/scripts/run-coupled-quality-overnight.ps1`
- trainer: `newliveweb/python/unified_coupling_trainer.py`
- verify: `newliveweb/scripts/headless-verify.mjs`
- cleanup: `newliveweb/scripts/kill-stale-headless-browsers.ps1`

---

## 不允许的操作(硬规则)
- 不要递归扫描 `D:\aidata` 或 `D:\CloudMusic`
- 不要把 API key 写进仓库、文档或日志
