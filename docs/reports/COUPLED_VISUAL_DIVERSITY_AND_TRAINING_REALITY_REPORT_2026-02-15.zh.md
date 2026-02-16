# newliveweb 耦合视觉“同质化”现实报告与下一步计划（基于代码/数据证据）

日期：2026-02-15  
范围：`newliveweb/`（runtime + scripts + python trainer）+ 本机源库 `C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025`

## 0. TL;DR（先回答你最关心的）

### 0.1 为什么你看到“随机但图案都差不多（黑黑的线条）”？

不是单纯 “3D 耦合导致的”。主因是 **你当前在 coupled 模式用的 pack：`ai_generated_coupled_final` 本身就非常同质化**：

- **FG 预设几乎都是“参数型 preset”**：抽样 120 个 `fg/*.milk`，`per_frame/per_pixel` 代码段出现次数为 **0**（等于没有算法代码，基本只剩参数组合）。
- **wave 颜色被系统性置 0**：抽样 120 个 `fg/*.milk`，`wave_r/wave_g/wave_b` 非 0 的数量为 **0**（波形/线条趋向“黑线”）。
- shapes 基本全开：抽样 120 个 `fg/*.milk`，`shapecode_0_enabled=1` 出现次数为 **120**（很多视觉结构来自 shape 叠加）。

结论：你现在看到的是 “两个偏线条、偏暗、无脚本算法的 preset 叠一起（FG+BG）”，在观感上就会非常像。

### 0.2 3D 耦合到底做了什么？

3D 耦合（`?coupling3d=on`）做的是 **运行时的两层合成/视差/景深增强**（见 `newliveweb/src/app/bootstrap.ts` + `createProjectM3DCoupling(...)`），它会让“线条叠加”更显著，但 **不会凭空制造多样化的 preset 算法**。

### 0.3 立刻验证“是不是 pack 太同质化”的 30 秒动作

把 URL 从（你现在的）：

```text
/?coupled=1&coupledPack=ai_generated_coupled_final&coupledPick=random&coupling3d=on
```

改为：

1) 换 pack（同样 coupled，但更彩色的那套）：  
```text
/?coupled=1&coupledPack=ai_generated_coupled&coupledPick=random&coupling3d=on
```

2) 或者关掉 3D（仍然 coupled 两层，但少了 3D 合成强化）：  
```text
/?coupled=1&coupledPack=ai_generated_coupled_final&coupledPick=random&coupling3d=off
```

如果 1) 明显更丰富，说明问题主要来自 `ai_generated_coupled_final` pack 的内容分布，而不是 random 按钮坏了。

---

## 1. 现状事实（你机器上已经验证过的产物）

### 1.1 离线采样（eval 扩展训练集）

目录（最新）：`newliveweb/artifacts/coupled-eval/overnight-2026-02-14_231015/`

- `eval.jsonl`：6953 行
- unique pairs（按 pack）：`ai_generated_coupled_final` = 2699 / 3000（约 90%）
- WebGL 真 GPU：`meta.json.runtime.webgl.renderer` 包含 RTX 4090 D3D11（不是 SwiftShader）

### 1.2 训练与出分（runtime 消费 JSON）

已生成并可被 runtime 加载：

- checkpoint：`newliveweb/outputs/coupling/models/coupling_net_final.pth`
- `newliveweb/public/presets/ai_generated_coupled_final/pairs-quality.v0.json`
- `newliveweb/public/presets/ai_generated_coupled/pairs-quality.v0.json`

两套 pack 的 `qualityStats.std` 均为 0.0306（带 `std_stretch.v0` 校准元数据，写在 `qualityStats.calibration`）。

### 1.3 verify 门禁

最新通过的证据目录：

- `newliveweb/artifacts/headless-coupled/manual-2026-02-15_072758/`
  - `report.json`：`pageErrors=0`
  - `trace.zip`、多张关键截图、console/pageerror 日志齐全

---

## 2. “随机但都像黑线”根因分析（代码/数据证据）

### 2.1 coupled 模式取的不是 “全库随机”，而是 “pack 内随机”

`newliveweb/src/app/bootstrap.ts`：

- coupled 开关：`?coupled=1`
- pack：`?coupledPack=...`（默认 `ai_generated_coupled_final`）
- pickMode：`?coupledPick=random|weighted`（默认 weighted）

也就是说：你按 random，本质是在 `pairs-manifest.v0.json` 的 pairs 数组里抽。

### 2.2 `ai_generated_coupled_final` 的 `.milk` 特征决定了“看起来都像”

直接观察该 pack 的文件结构：

- `newliveweb/public/presets/ai_generated_coupled_final/fg/*.milk`
- `newliveweb/public/presets/ai_generated_coupled_final/bg/*.milk`
- `newliveweb/public/presets/ai_generated_coupled_final/pairs-manifest.v0.json`

抽样 120 个 FG 文件（只读文本，不跑渲染）得到：

- `wave_r/wave_g/wave_b` 非 0：0/120
- `per_frame=` 出现：0/120
- `shapecode_0_enabled=1`：120/120

这会自然把观感推向“暗色 + 线条 + 结构相似”，即便 pairId 在切换。

对照：`ai_generated_coupled`（500 pairs）抽样 120 个 FG：

- `wave_r/wave_g/wave_b` 非 0：120/120

所以你会感觉 “以前随机很多完全不同的视觉算法”，而现在 “黑线居多”：你实际上是在换数据源。

### 2.3 3D 耦合的影响：它会放大“线条叠加感”，但不是根因

`?coupling3d=on` 做的是运行时合成增强（视差/景深/耦合强度等），让 FG/BG 的差异更立体；如果 FG/BG 都是暗线条，它只会让“暗线条叠两层”的特征更明显。

---

## 3. 官方信息对齐：MilkDrop2077 / MilkDrop3 与我们当前系统的关系

你现在实现的 “coupled + 3D” 在形态上很像 MilkDrop3 的 `.milk2` 双 preset（同时显示/混合两套 preset）。

### 3.1 MilkDrop3 的 `.milk2` 能不能直接在 newliveweb 里用？

结论：**不能“直接用”，但可以“作为输入格式/互通格式”来用。**

- “不能直接用”的意思是：`newliveweb` runtime 的渲染内核是 WASM projectM（WebGL），它不会去运行 MilkDrop3 这个 DX9 程序；同时 projectM 也不会天然认识 MilkDrop3 的 `.milk2` 双 preset 文件格式（它主要兼容的是 `.milk`）。
- “可以互通”的意思是：我们可以写一个离线转换器，把 `.milk2` 解析成：
  - 两个 `.milk`（FG/BG）
  - 再生成 `pairs-manifest.v0.json` / `pairs-quality.v0.json` 这套 runtime 只吃的 JSON
  这样你就能把 MilkDrop3 里做好的 double-preset 迁移到 web 的 coupled pack。

当前阻碍：本仓库里还没有任何 `.milk2` 样本文件（只看得到 README 里的功能说明），所以我不会盲写解析器。正确路径是先拿 3-5 个真实 `.milk2` 样本，确认其实际结构：纯文本/二进制？是引用外部 `.milk` 还是内嵌两份 `.milk`？是否把图片也内嵌进去？

### 3.2 是否重复造轮子？是否开源？

**重复造轮子评估**

- 你现在的 coupled+3D = 在 Web 里实现了“同时运行两套 preset 并合成”的能力，本质上对应 MilkDrop3 的 `.milk2` 运行时效果。
- 但 `newliveweb` 额外做了 MilkDrop3 没有的工程闭环：
  - 离线可训练的 `quality01`（runtime 可消费的 JSON 信号）
  - `verify:dev` 门禁（可验收、可回归）
  - “浏览器只吃 JSON 产物、不加载模型”的约束
- 所以：不是“纯重复”，而是“同一概念在不同运行时（DX9 vs WebGL/WASM）的必需实现”。真正能减少重复的点在于：**支持 `.milk2` 作为导入/导出格式**，而不是换引擎。

**开源/许可现状（只基于你本机已有仓库副本，不做法律结论）**

- `milkdrop2077/MilkDrop3` 仓库内：`artifacts/ext/MilkDrop3/code/LICENSE.txt` 是 BSD 3-Clause（BeatDrop 基础）；`artifacts/ext/MilkDrop3/code/vis_milk2/*.h` 顶部也包含类似 BSD 的 Nullsoft 许可文本。
- 但“产品使用/商业授权”不要想当然：MilkDrop3 官网明确区分个人免费与 PRO 授权（这通常意味着：可以当外部工具用，但不要把它当成“可随便嵌入/分发”的依赖）。

### 3.3 我接下来准备怎么做（落地路径）

Phase E（新增）：`.milk2 -> coupled pack` 互通

1) **获取样本**：你从 MilkDrop3 里随便保存 3-5 个 `.milk2`（F9 进入 double-preset，按 `s` 保存），给我一个目录路径（不需要全库）。
2) **写 sniff 工具**：新增 `newliveweb/scripts/milk2-sniff.mjs`，输出 `.milk2` 的结构摘要（文本/二进制、是否包含两份 preset 名、是否内嵌资源）。
3) **写转换器**：新增 `newliveweb/scripts/milk2-to-coupled-pack.mjs`
   - 输入：一个 `.milk2` 文件列表（明确路径，避免递归扫描）
   - 输出：`public/presets/<pack>/fg/*.milk`、`bg/*.milk`、`pairs-manifest.v0.json`
4) **接入训练闭环**：对新 pack 跑 `eval -> train/score -> verify`，看 `qualityStats.std` 是否达标、运行时是否更丰富。

对齐点：

- MilkDrop3（milkdrop2077）明确支持一种 “double-preset (.milk2)” 同时混合两个 preset 的机制，并列出大量额外功能（更多 shape/wave、q1-q64、深度 mashup、beat-based auto-change 等）。
- projectM 方向持续在提升 MilkDrop 兼容性（parser 重写、补齐缺失语法、修复 comp/warp parsing 等）。

我们这边现实约束：

- `newliveweb` runtime 以 WASM projectM 为内核，目标是 “稳定优先 + headless verify 可验收 + 浏览器只吃 JSON”。
- 因此：如果你把 mega pack 里“最狂”的 preset 直接拿来跑，实际效果常常会受兼容性/稳定性约束，最终你会被迫走 “audit -> crashsafe -> repair/salvage” 的路线。

这也解释了为什么你现在的 coupled_final pack 很可能被压到了“参数型、安全风格”，从而看起来同质化。

---

## 4. 训练计划文档盘点（哪些是“现状真实可用”，哪些可能过期）

### 4.1 当前真正落地可用的链路（已跑通）

- 总体价值/闭环解释：`newliveweb/docs/reports/TRAINING_ARTIFACTS_VALUE_AND_OPTIMIZATION_2026-02-13.zh.md`
- 过夜采样 + GPU 优先 runbook：`newliveweb/docs/reports/COUPLED_QUALITY_OVERNIGHT_PLAYBOOK_2026-02-14.zh.md`
- 采样脚本：`newliveweb/scripts/headless-eval-coupled-pairs.mjs`
- 训练/出分：`newliveweb/python/unified_coupling_trainer.py`
- 编排脚本：`newliveweb/scripts/run-coupled-quality-overnight.ps1`
- verify：`newliveweb/scripts/headless-verify.mjs` + `newliveweb/scripts/verify-dev.mjs`

### 4.2 可能与现状数据不一致的文档（需要更新口径）

示例：

- `newliveweb/docs/3D_AIVJ_COUPLING_SYSTEM.md`、`newliveweb/docs/AIDATA_ANALYSIS_REPORT.md`
  - 提到 `ai_generated_coupled_final` 是 8040/8041 对等规模；但你本机实际 `manifest.source.jsonl` 与 `pairs-manifest.v0.json` 都是 3000。
  - 结论：这类文档更像“阶段性愿景/历史记录”，不能作为当下 SSOT。

建议口径：

- 架构与硬规则以 `newliveweb/MASTER_SPEC.zh.md` 为准。
- 可执行流程以 2026-02 的 runbook + scripts 为准。

---

## 5. 下一步计划（按“避免废物数据/避免无效逻辑/能落地”排序）

### Phase A（马上做，1-2 小时）：把“多样性问题”从训练问题里剥离出来

目标：先承认现实：**quality01 训练不会让视觉变得更花**，视觉多样性来自 “预设库/pack 的内容与生成策略”。

动作：

1) 运行时用 `ai_generated_coupled` 对照验证
   - 如果它确实更彩色：说明 `ai_generated_coupled_final` 的生成策略需要调整，而不是 random/3D 耦合坏了。

2) 为 coupled_final 做一个轻量统计报告（不递归扫描大目录）
   - 统计：`wave_*`、`per_frame/per_pixel`、`fDecay/warp/zoom` 的分布
   - 目的：用数据确认“同质化”到底来自哪些字段固定化（现在 wave 颜色全 0 就是最强证据）

产物：
- 脚本：`newliveweb/scripts/report-coupled-pack-style.mjs`
- 输出：`newliveweb/artifacts/reports/coupled_pack_style_stats.ai_generated_coupled_final.json`（默认）

### Phase B（提升采样效率，避免“0.99 覆盖率要 16h 的随机抽卡”）

现状：coupled random 是 **with replacement** 的均匀随机；0.99 覆盖率是典型“集卡”问题，后 9% 会极慢。

两个可行方案（二选一）：

1) **保持 runtime 不变，只改 eval：允许 “random without replacement”**
   - 思路：eval 脚本读取 pack 的所有 pairId，打乱后逐个强制切到该 pair（需要 runtime 提供 “pick specific pairId” 的调试接口）。
   - 结果：3000 对在 3000 次以内必然覆盖 100%（比随机抽卡快一个数量级）。

2) **给 runtime 增加一个新 pickMode：`shuffle`**
   - shuffle = 随机排列 + 逐个取，取完再洗牌。
   - eval 时用 `?coupledPick=shuffle`，你 0.99 覆盖率能在约 3.4h 内搞定（取决于每次切换耗时）。

状态：已实现 2)（`newliveweb/src/app/bootstrap.ts` 增加 `coupledPick=shuffle`；`newliveweb/scripts/run-coupled-quality-overnight.ps1` 增加 `-EvalPickMode`，默认 `shuffle`）。

建议：eval/过夜跑覆盖率一律用 `shuffle`；演出时若你喜欢“随强度变化”的感觉仍可用 `weighted`。

### Phase C（用 130k MegaPack 做“源库 SSOT”，怀疑 D:\\aidata 出问题也能绕开）

你的直觉是对的：**D:\\aidata 应该被当成“可重建的产物缓存”，不是源库**。

建议把 “MegaPack 2025” 变成 SSOT，然后做 3 条下游分支：

1) `full`/`mega`：用于手工演出探索
2) `run3-crashsafe-*`：用于稳定演出与自动化测试
3) `coupled packs`：用于 3D 耦合模式（FG/BG 配对）

你仓库里已经有完整工具链（重点）：

- 同步子集：`newliveweb/scripts/sync-presets.mjs`
  - 支持 `--scanLimit`、`--sample first|reservoir`、`--relPathsFile`（避免每次扫 130k）
- 质量审计：`newliveweb/scripts/preset-audit.mjs`
  - 能跑 Playwright+WASM probe，生成 blacklist / summary / sqlite
- 构建 crashsafe：`newliveweb/scripts/build-run3-crashsafe-manifest-from-sqlite.py`
  - 从 sqlite + full manifest 产出 crashsafe manifest

你的“下一步实际计划”应该是：

1) 先跑一个 **小规模** audit（2000 个 preset），把耗时、失败类型、too-dark 阈值口径跑通  
2) 再决定要不要整库 audit（130k），以及是否要引入 repair（NoWavesNoShapes）来 salvage wasm-abort-only 的那批  
3) 只有当 crashsafe 质量足够好，再去用它生成新的 coupled pack（否则耦合出来还是一堆暗线）

### Phase D（简化 UI 的计划，但不改“外观代码”）

你现在 UI 的问题本质不是样式，而是“默认可见控件太多”。仓库里已经有一份非常具体的 UI 收敛方案：

- `newliveweb/docs/reports/UI_SIMPLIFICATION_REFACTOR_PLAN_2025-12-29.local.zh.md`

在“不改 CSS/外观代码”的约束下，我建议只做一件事：

- **增加一个 “Training/Automation 默认 UI 状态” 的入口**（例如 query `?ui=training`）
  - 只做 localStorage 默认值写入（`nw.toolbar.showAdvanced=0`、`nw.toolbar.showDebug=0`、必要时强制折叠 overlay）
  - 不动样式文件，不改 UI 布局，只减少默认可见模块

这样：
- 人用时仍可手动开 Advanced/Debug
- 自动化跑一晚上时默认是最小 UI，不容易卡住/误触

---

## 6. 对你当前问题的结论与建议（非常具体）

1) 你看到“随机都差不多”，**优先怀疑 pack 内容分布**，不是 random 没工作。
2) `ai_generated_coupled_final` 目前非常像 “安全/稳定导向” 的产物（wave 颜色被压成 0、无脚本），会天然同质化。
3) 想要“完全不同的视觉算法”回来，你需要的是：
   - 用 MegaPack 构建 crashsafe/full-safe 等多样化库（靠 audit/blacklist/repair 来让它在 WASM 里跑得住）
   - 或者重新生成 coupled_final，使其继承更丰富的 preset code（per_frame/per_pixel）与颜色分布
4) 训练（quality01）能做的是：让 coupled 的“离线质量信号”更可信，帮助 runtime 选更稳/更动/更亮度合适的 pair；它不会自己创造视觉多样性。
