# 训练产物价值评估与优化路线图（newliveweb × aidata）

> 文档类型：Report（快照 + 可执行优化清单）
>
> 生成日期：2026-02-13
>
> 范围：围绕 `D:/aidata` 的“训练/炼丹产物”与 `newliveweb/public/presets/*` 的运行时接入，回答一个问题：
> 训练产物到底是不是“废物”？如果不是，下一步怎样把价值吃满并可验证。
>
> 权威口径：
> - 全局 SSOT：`newliveweb/MASTER_SPEC.zh.md`
> - AIVJ 范围内 SSOT：`newliveweb/docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md`
> - 本文仅做“价值评估 + 优化路线图”，不替代上述权威文档。

---

## 0. TL;DR（结论）

训练产物不是废物，但价值分层非常明显：

1. 已经直接驱动运行时输出的产物，价值已兑现。
2. 已经生成了“可解释指标/索引”，但运行时还在随机用或没用，价值被浪费。
3. 只停留在“模型文件/中间数据/一次性报告”，如果不接入闭环，会长期看起来像废物。

“废物”不是由文件名决定的，而是由以下事实决定：能否被运行时消费、能否影响选择策略、能否复现与验收。

---

## 1. 训练产物的“最小价值单位”（避免自我怀疑）

把训练产物当作“内容工程”，最小价值单位不是“我训练过”，而是以下三种之一：

1. 可被浏览器直接消费的可视化素材（`.milk` + manifest + 可加载路径）。
2. 可被 AIVJ/选择器消费的索引与指标（run-manifest / style-index / pair-metrics）。
3. 可用于离线门禁与生成的可复现工具链（模型、训练集、脚本、阈值与输出）。

如果产物无法落到以上任何一个单位，就会演变成“废物”。

---

## 2. 当前真实接入图谱（代码与文件为证）

### 2.1 “耦合对数据集”已经接入（并非设想）

耦合对是“训练产物”里价值最直接、最难被替代的一类，因为它把“FG/BG 语义关联”做成了可加载数据结构。

1. 源数据（大数据域）
   - `D:/aidata/ai_generated_coupled_final/manifest.jsonl`
2. 同步与转码（把大数据变成前端可用目录结构）
   - `newliveweb/scripts/sync-aidata-packs.mjs` 会把 WSL 路径转 Windows 路径、复制 fg/bg 文件，并生成 `pairs-manifest.v0.json`
3. 浏览器实际消费的产物（运行时域）
   - `newliveweb/public/presets/ai_generated_coupled_final/pairs-manifest.v0.json`
4. 运行时加载与切换
   - `newliveweb/src/app/bootstrap.ts`：`?coupled=1` 或 `?coupledPairs=1` 开启，默认 pack 为 `ai_generated_coupled_final`
   - manifest 加载：`newliveweb/src/features/presets/coupledPairsLoader.ts`
   - manifest 状态存储：`newliveweb/src/features/presets/coupledPairsStore.ts`

### 2.2 “3D 耦合效果”不依赖训练（但能放大训练产物价值）

3D 耦合是运行时算法系统，不需要 ML 模型文件：

1. 运行时代码
   - `newliveweb/src/layers/ProjectM3DCoupling.ts`
2. 开关与可调参数
   - `newliveweb/src/app/bootstrap.ts`
   - `?coupling3d=on|debug`，以及 `?coupling3dParallax`、`?coupling3dDof`、`?coupling3dStrength`、`?coupling3dHud=1`

关键点是：3D 耦合本身不靠训练，但“耦合对数据集”能让 3D 耦合更稳定、更可控。

### 2.3 run-manifest 与权重函数已在 AIVJ 选择中生效

run-manifest 是把离线验收/打分结果带回运行时的通道之一。

1. 运行时可消费文件
   - `newliveweb/public/run-manifest.json`
2. 权重函数（把 run-manifest 指标转成选择权重）
   - `newliveweb/src/features/aivj/manifestWeightFn.ts`
3. 运行时调用点（AIVJ 选择路径里传入 weightByPresetId）
   - `newliveweb/src/app/bootstrap.ts`（`pickNextPresetByStyleV0({ weightByPresetId: manifestWeightByPresetId })`）

### 2.4 curated/ai-curated/ai_generated_* 已形成可选库入口

这些训练/炼丹产物已经以“库”的形式存在于运行时域：

1. 库配置入口
   - `newliveweb/src/config/presetLibraries.ts`
2. 典型库的 manifest（样例）
   - `newliveweb/public/presets/ai_generated_v2/library-manifest.json`
   - `newliveweb/public/presets/ai_generated_premium/library-manifest.json`
   - `newliveweb/public/presets/ai_generated_quality/library-manifest.json`
   - `newliveweb/public/presets/curated_v5/dark/library-manifest.json`
   - `newliveweb/public/presets/ai-curated-dark/library-manifest.json`

这意味着“训练产物”已经不是“D 盘里一堆文件”，而是应用可切换的内容资产。

---

## 3. 价值分层：哪些已经值回票价，哪些像废物

### 3.1 A 类（已经兑现价值）

满足条件：运行时可消费、能影响输出、可复现。

1. `ai_generated_coupled_final`（成对 FG/BG，可直接驱动 coupled 模式）
2. curated/ai-curated/ai_generated_v2 等“可选库”（可直接加载使用）
3. run-manifest + manifestWeightFn（已经进入 AIVJ 的权重路径）

### 3.2 B 类（价值很大但没吃满）

满足条件：数据/指标已生成，但运行时目前没有用或用得很粗糙。

1. `pairs-manifest.v0.json` 中的 `warp_diff`、`cx_diff`
   - 现状：已进入 coupled pair 加权选择（2026-02-13，见 8.1）
   - 仍有空间：引入过滤阈值/上限，避免“过激”或“太弱”的 pair 在不合适的段落被选中
2. run-manifest 的 `avgLuma/motion/tier/reasons` 等指标
   - 现状：已用于权重与 gating，但仍有空间用于更细粒度的“场景匹配”

### 3.3 C 类（目前像废物，但可被转正）

满足条件：目前未被运行时消费，或者没有接入明确闭环。

1. `quality_model.pkl`、`training_dataset.json`
   - 现状：存在训练脚本产出（例如 `newliveweb/preset_quality_trainer.py`），但不直接进入前端运行时是合理的
   - 风险：如果不进入“离线门禁/manifest 生成”闭环，这些会永久像纪念品
2. `public/presets/ai-metadata/*` 与相似检索/推荐面板
   - 现状：产物与代码存在（`newliveweb/src/features/presets/aiPresetRecommender.ts`），但主应用尚未调用 UI 面板
   - 额外风险：`newliveweb/scripts/build-ai-preset-metadata.mjs` 当前生成的是“伪 embedding”（参数驱动的 deterministic 向量），只能做占位验证，不能代表真实语义相似

---

## 4. 什么情况下训练产物才算“真废物”（判定标准）

满足任意一条，就应当被判为“废物候选”，要么接入闭环，要么砍掉：

1. 不能被运行时消费
   - 不在 `newliveweb/public/`，没有稳定 URL，缺少 manifest，或者 sync 脚本无法复现
2. 不能影响选择策略
   - 指标存在但运行时从未读取，或者只做日志展示不参与决策
3. 不可复现
   - 缺少输入来源、生成参数、版本信息，无法在同一环境重建同一 pack
4. 无验收证据
   - 没有通过 verify/统计脚本证明它让“更稳、更好看、更可控”中的任一项变好

---

## 5. 优化路线图（把 B/C 类资产变成 A 类）

### 5.1 Phase 1：吃满现成指标（低成本，高回报）

目标：不引入新训练，只把已有指标接入“选择策略”。

1. Coupled pair 加权选择（立即可做）
   - 输入：`warp_diff`、`cx_diff`（来自 `pairs-manifest.v0.json`）
   - 信号：能量/节拍强度/段落强度（来自 `ExpressiveAudioSnapshot`）
   - 输出：从“纯随机抽 pair”升级为“按音频强度选更合适的 pair”
2. 引入 pair 过滤阈值（防止效果看不出或过激）
   - 例：`warp_diff < x` 时降低权重，`cx_diff < y` 时降低权重
3. 日志与证据链
   - 在 `logs/` 或 `artifacts/` 记录每次 coupled 选择的（pairId、warp_diff、cx_diff、音频强度、最终权重），避免优化靠主观

验收建议：
1. 同一段音频下，多次运行的“3D 感输出”方差收敛，不再完全随机漂移
2. coupled 模式下的切换失败率不升高（FG/BG 并行加载仍稳定）

### 5.2 Phase 2：把 quality_model 从“纪念品”变成门禁工具

目标：让模型文件成为“离线门禁的一环”，而不是被前端直接加载。

1. 在 manifest 生成或 pack 同步阶段引入质量打分
   - 输入：`.milk` 参数抽取 + `quality_model.pkl`
   - 输出：给每个 preset 写入 `predQualityScore` 或生成 safe 子集 manifest
2. 把质量门禁结果反哺到运行时
   - AIVJ：将低分项降权或剔除
   - UI：库选择时展示 “quality tier” 或默认使用更稳的子集

验收建议：
1. 在固定时间预算下（同样的预取策略），崩溃/硬失败率下降
2. “太暗/太静/无响应”的比例下降（通过 run-manifest 指标或输出统计证明）

### 5.3 Phase 3：清理“伪 embedding”或升级为真 embedding（做取舍）

现状：
1. `ai-metadata` 目录产物存在
2. 相似检索代码存在
3. 但主应用没有调用推荐面板
4. 生成脚本当前是“伪 embedding”

两条路线二选一：

1. 砍掉路线（如果你短期不需要相似检索）
   - 保留最低限度 metadata（例如 tags/fRating）即可
   - 删除或归档伪 embedding，避免后续误用
2. 做实路线（如果你要做“相似推荐/风格探索/跨模态映射”）
   - 用真实模型生成 embedding（CLIP/CLAP 等），并写清楚版本、维度、数据来源
   - 增加面板入口与验收脚本，确保它“真正在用”

验收建议：
1. 相似检索结果可解释且稳定（同一 query 返回的 topK 不随机漂移）
2. 面板入口存在，且不会拖慢启动（按需加载）

---

## 6. 操作清单（复现与验证）

### 6.1 同步训练产物到运行时域

1. 同步 aidata packs
   - `npm run sync:aidata`
2. 同步 130k 子集（如需要）
   - `npm run sync:presets`

### 6.2 本地运行时验证（建议参数）

1. 3D 耦合开关
   - `?coupling3d=on&coupling3dHud=1`
2. coupled pair 开关
   - `?coupled=1&coupledPack=ai_generated_coupled_final`

### 6.3 验收门禁（已有体系）

1. TypeScript 门禁
   - `npm run lint`
2. AIVJ 验收闭环
   - `node scripts/aivj/run-acceptance-tests.mjs`
3. headless verify（包含 guardrails）
   - `npm run verify:dev`

### 6.4 Coupled pair 离线训练与出分（quality01）

一口气跑通（sync -> train -> score -> verify）：
- `powershell -ExecutionPolicy Bypass -File newliveweb/scripts/run-coupled-quality-pipeline.ps1 -Pack ai_generated_coupled_final`

或者分步执行：

1. 一键训练 + 生成 `pairs-quality.v0.json`
   - `powershell -ExecutionPolicy Bypass -File newliveweb/scripts/train-coupled-quality.ps1 -Pack ai_generated_coupled_final`
2. headless 验证（只跑 coupled 路径，便于快速回归）
   - `$env:VERIFY_HARD_TIMEOUT_MS='900000'`
   - `powershell -ExecutionPolicy Bypass -File newliveweb/scripts/verify-dev-coupled.ps1 -Pack ai_generated_coupled_final`

---

## 7. 追加建议（防止产物再次“堆成废物”）

把产物治理成“可持续系统”，推荐引入一条硬规则：

1. 每个训练产物 pack 必须具备“运行时契约”
   - flat pack：`library-manifest.json`
   - coupled pack：`pairs-manifest.v0.json`
2. 每个 pack 必须具备“复现契约”
   - 输入来源、生成参数、生成脚本版本、生成时间
3. 任何新增指标必须进入“选择策略”或“门禁验收”
   - 否则指标就是债务

---

## 附录：关键文件索引

1. 3D 耦合系统
   - `newliveweb/src/layers/ProjectM3DCoupling.ts`
   - `newliveweb/src/app/bootstrap.ts`
2. 耦合对 manifest 与同步
   - `newliveweb/scripts/sync-aidata-packs.mjs`
   - `newliveweb/public/presets/ai_generated_coupled_final/pairs-manifest.v0.json`
3. run-manifest 与权重
   - `newliveweb/public/run-manifest.json`
   - `newliveweb/src/features/aivj/manifestWeightFn.ts`
4. 质量模型（离线）
   - preset 质量：`newliveweb/preset_quality_trainer.py`
   - coupled pair 质量：`newliveweb/python/unified_coupling_trainer.py`
   - coupled 一键训练+出分：`newliveweb/scripts/train-coupled-quality.ps1`
   - coupled 质量产物：`newliveweb/public/presets/<pack>/pairs-quality.v0.json`
5. AI 元数据与推荐（当前未接入主应用）
   - `newliveweb/public/presets/ai-metadata/metadata.json`
   - `newliveweb/src/features/presets/aiPresetRecommender.ts`
   - `newliveweb/scripts/build-ai-preset-metadata.mjs`

---

## 8. 2026-02-13 已执行优化（落地说明）

### 8.1 Coupled pair 选取从“纯随机”升级为“按强度加权”

目标：把 `pairs-manifest.v0.json` 里已经存在但未被运行时消费的 `warp_diff` / `cx_diff` 变成实际选取策略的一部分，从而让 coupled 切换更“跟着音乐走”，并且每次选择都有可追溯证据链（不是主观感觉）。

实现位置：
- `newliveweb/src/app/bootstrap.ts`

默认行为：
- 默认启用 `weighted`（加权模式）；必要时自动 fallback 回 `random`（例如音频 snapshot 不可用）。

可控开关：
- Query 参数：`?coupledPick=weighted|random`
- 本地配置键：`nw.coupledPairs.pickMode`（`"weighted"` | `"random"`）

加权输入与信号：
- 数据侧：`warp_diff` / `cx_diff`（来自 `newliveweb/public/presets/ai_generated_coupled_final/pairs-manifest.v0.json`）
- 音频侧：`ExpressiveAudioSnapshot`（基于 `energy01/accent01/beatPulse01` 合成 `intensity01`）

防重复：
- 对上一次 pick 的 index 做权重惩罚，避免“连续抽到同一对”。

证据链与调试入口：
- `controlPlaneDebug.preset.coupledPickMode`
- `controlPlaneDebug.preset.coupledLastPick`
- `verify:headless` 的 state 里会包含最近 pick（以及 pickLog 最近 20 条），用于复现与验收（见 `newliveweb/src/app/bootstrap.ts` 的 verify hooks）。

### 8.2 本次验收结果

- `npm run lint`：通过
- `npm run verify:dev`：通过（2026-02-13）

### 8.3 Coupled pair 离线质量 quality01（回归网络 + pairs-quality.v0.json）已接入

之前的 `quality01` 信号如果是常数/占位，就无法进入选择策略，本质上属于“指标债务”。本次把它做成了可训练、可出分、可被运行时消费的闭环。

落地内容：

1. 离线训练与出分（GPU）
   - 训练入口：`newliveweb/python/unified_coupling_trainer.py`
   - 一键脚本：`newliveweb/scripts/train-coupled-quality.ps1`
   - checkpoint：`newliveweb/outputs/coupling/models/coupling_net_final.pth`
   - 质量文件：`newliveweb/public/presets/ai_generated_coupled_final/pairs-quality.v0.json`
2. 运行时接入
   - `coupledPairsLoader` 会在同目录自动加载 `pairs-quality.v0.json`，并按 `pair` id 合并进 `pairs-manifest.v0.json` 的每个 pair：
     - `newliveweb/src/features/presets/coupledPairsLoader.ts`
     - `newliveweb/src/features/presets/coupledPairsStore.ts`
   - pick 加权：在原有权重基础上额外乘 `(0.2 + 0.8 * quality01)`（缺失则不影响）
     - `newliveweb/src/app/bootstrap.ts`
3. 可观测与回归
   - `pairs-quality.v0.json` 内置 `qualityStats`（min/max/mean/std/pXX），用于快速识别信号是否退化成“常数”。
   - coupled headless 验证（建议用较长 hard timeout）：
     - `$env:VERIFY_HARD_TIMEOUT_MS='900000'`
     - `powershell -ExecutionPolicy Bypass -File newliveweb/scripts/verify-dev-coupled.ps1 -Pack ai_generated_coupled_final`

实测（`ai_generated_coupled_final`，2026-02-14）：
- `qualityStats`：min 0.7277 / p50 0.7746 / max 0.8122 / std 0.0192（见 `pairs-quality.v0.json`）
