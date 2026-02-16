# newliveweb 项目整合总文档（给编程 AI 的交接版 + 给人的白话版）

> 生成/整合时间：2026-01-30
> 目标：把当前仓库里分散的计划、报告、清单、执行记录整合成“单一入口”。
> 读者：
> - **编程 AI（主读者）**：需要可执行的入口、约束、验收口径、代码落点与下一步任务。
> - **项目拥有者（白话版）**：需要快速理解“现在做到哪了、怎么用、接下来做什么”。
>
---

## 0. 使用方式（先读这个）

> 编程 AI 执行入口（只看这一份）：`docs/reference/whitepapers/audio-driven-projectm/AUDIO_DRIVEN_PROJECTM_SUPER_PLAN.zh.md`

### 0.1 本文的角色

- 本文是“**统一入口**”：给出架构概览、主线目标、真实落地状态、验收/证据链口径、以及下一步执行清单。
- 本文**不替代**所有细节文档，而是：
  - 把“哪些文档是权威/执行口径”讲清楚
  - 把“系统怎么跑、怎么验收、怎么调试”讲清楚
  - 给出“下一步应该写什么代码/改什么文件/怎么验收”

### 0.2 权威规则（避免文档互相打架）

- 全局 Canonical（全项目 SSOT / 发生冲突以其为准）：`MASTER_SPEC.zh.md`
- 写作路由/分工索引（写到哪里/怎么避免重复口径）：`DOCS_INDEX.zh.md`
- Scoped-Canonical（范围内 SSOT：AIVJ 输出优化/验收/证据链）：`docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md`
  - 任何“已完成/未完成/验收口径/证据链落盘”都以它为准（仅限其声明的范围）。
- Whitepaper / Design（技术总纲，不等于执行口径）：`AUDIO_DRIVEN_PROJECTM_COMPREHENSIVE_PLAN.md`
  - 设计与算法细节以它为主；但“是否已落地/如何启用/如何验收”的执行口径必须落到 Scoped-Canonical 或本文的验收章节。

### 0.3 文档状态字段（推荐统一口径）

> 用于本文的“来源索引/状态矩阵”。同一主题如出现冲突：先按 Authority 决策，再按代码与门禁/证据链校验。

- **Canonical（Global）**：全项目唯一权威入口（SSOT）。
- **Scoped-Canonical**：在明确范围内的唯一事实源（例如：AIVJ 输出优化/验收证据链）。
- **Runbook**：操作手册/现场步骤（以可复现为目标）。
- **Report**：报告/结论快照（可能过时；需要标注快照时间与适用范围）。
- **Reference**：参考资料/深度专题（帮助理解，但不作为进度/验收口径）。
- **Placeholder**：占位文档（列出缺口与预期补全内容）。
- **Archive**：历史归档（保留追溯，不再作为协作入口）。

---

## 1. 项目一句话概述（给 AI）

newliveweb 是一个面向 VJ/直播/大屏的前端可视化引擎：
- 双层 ProjectM（FG/BG）+ LiquidMetal 等 layer
- AudioBus 作为音频单一事实源（SSOT），驱动 AIVJ 宏、节拍门控、ProjectM audio feed cadence
- 预设来自本地炼丹数据（`D:/aidata`）与仓库 `public/presets/*`
- 有明确的“验收脚本体系 + 证据链落盘”以避免口头完成

---

## 2. 架构与数据流（AI 需要的心智模型）

### 2.1 渲染层（Layer Model）

参考：`docs/reference/ARCHITECTURE.md`

- `src/layers/Layer.ts`：所有视觉层的统一接口（init/update/onResize/dispose）。
- `src/SceneManager.ts`：
  - 管 renderer/camera/resize
  - 驱动 layers update
  -（重要）compositor 路径：负责 FG/BG 合成与 shader/uniforms（深度效果也是在这里落地）
- 常见层：
  - `src/layers/ProjectMLayer.ts`
  - `src/layers/LiquidMetalLayerV2.ts`
  - `src/layers/DepthLayer.ts` / `src/layers/CameraLayer.ts`（扩展方向）

### 2.2 预设加载与质量/黑名单

参考：`docs/reference/CODEBASE_MAP.zh.md`

- `src/features/presets/PresetsController.ts`：manifest 加载、注册 runtime presets、加载 preset。
- `src/features/presets/presetQuality.ts`：probe/质量原因体系。
- `src/app/bootstrap.ts`：运行时策略入口（换 preset、预取队列、AIVJ 控制、verify hooks、以及 coupling3d runtime 挂载）。

### 2.3 音频链路（Audio Pipeline）

参考：`docs/reports/AUDIO_DRIVE_ANALYSIS.zh.md` + `docs/reports/AUDIO_DRIVE_PARAMS.zh.md` + `docs/reports/AUDIO_DRIVE_DEBUG_CHECKLIST.zh.md`

核心路径：
- `src/audio/StreamAudioProcessor.ts`：WebAudio 采集/FFT/PCM 管道。
- `src/audio/AudioBus.ts`：主循环 buildFrame（对象池/采样/特征）。
- `src/features/aivj/unifiedAivjController.ts`：宏 bank、accent、段落强度等。
- ProjectM audio feed cadence/门控：在 `src/app/bootstrap.ts`。

---

## 3. 运行与验收（AI 必须遵守的门禁）

### 3.1 最小门禁

- TypeScript：`npm run lint`
- AIVJ 验收：`node scripts/aivj/run-acceptance-tests.mjs`
  - 该脚本会跑一组 verify/统计，并把证据写入 `artifacts/`。

### 3.2 证据链（落盘在哪里、如何解读）

以 `docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md` 为准，常见输出：
- `artifacts/headless/report.json`：verify 核心结果（硬门禁）
- `artifacts/headless/budget-dynamics.json`：预算动态（硬门禁）
- `artifacts/headless/frame-time.json`：frame-time 分布（信息模式）
- `logs/aivj-selection.log` / `logs/preload.log`：选择/预取日志（用于统计脚本）

### 3.3 常用环境变量（只写“你应该知道的”）

- `AIVJ_ACCEPT_USE_ARTIFACTS=1`：允许验收使用已有 artifacts（加速）。
- verify 脚本可能用到的：`VERIFY_GPU`、`VERIFY_GPU_MODE`、`VERIFY_HEADLESS`（详见唯一事实源里的执行记录示例）。

---

## 4. 数据与产物（D:/aidata 与 public/presets 的关系）

### 4.1 炼丹产物与 run-manifest

参考：`docs/AIDATA_UTILIZATION_PLAN.md` + 唯一事实源

- `D:/aidata/*`：炼丹产物主目录（大数据；不要递归扫描）。
- `public/run-manifest.json`：前端可直接 fetch 的“运行时 manifest”（由脚本生成）。
- `public/presets/curated_v5/*`：已同步/生成索引的 curated 子集。

### 4.2 3D 耦合产物（FG/BG 成对）

参考：`docs/AIDATA_3D_COUPLING_EXECUTION_PLAN.md` + `docs/3D_COUPLED_IMPLEMENTATION_PLAN.md`

- `D:/aidata/ai_generated_coupled_final/`：FG/BG 成对产物与 manifest。
- 前端集成（Step4）涉及：pairs-manifest、加载器、切换逻辑、混合模式自动调节。

---

## 5. AIVJ 输出优化主线（现状 + 继续怎么做）

> **权威**：`docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md`（这里仅做导航和关键口径复述）

### 5.1 已跑通的闭环（你可以信）

- 验收脚本体系化（lint + verify:check + artifacts 证据链）。
- selection ratio 解析规范化（避免尾注导致 manifest 匹配失败）。
- 预算动态与预取策略可验证（verify-budget-dynamics）。

### 5.2 AIVJ 验证报告（例）

参考：`docs/reports/AIVJ_VERIFICATION_REPORT_2026-01-29.md`

关键关注点：
- selection log 与 run-manifest 的匹配率是否合理；non-prefix 选择是否是预期回退。
- budget/perfCaps 是否有稳定输出。

---

## 6. 音频驱动 ProjectM / 3D 耦合（Step2/Step3：落地现状 + 统一口径）

> **总方案**：`AUDIO_DRIVEN_PROJECTM_COMPREHENSIVE_PLAN.md`
>
> **执行口径**：见唯一事实源新增的 `12.6`（开关/参数/门禁/证据链/回滚）。

### 6.1 当前已落地的“最低可用能力”（MVP）

- `coupling3d` 运行时模式：off/debug/on（默认 off）。
- `SceneManager` 支持 compositor 深度效果 shader 变体，且仅在 on 模式启用。
- 参数平滑/钳制，避免抖动与越界。
- HUD（默认关闭）支持实时观测与滑条调参，并写回 localStorage。

### 6.2 现场调试要点

- 若“看不到音频驱动”：按 `docs/reports/AUDIO_DRIVE_DEBUG_CHECKLIST.zh.md` 快速诊断（AudioContext/gates/energy/pm feed 等）。
- 若“节拍不同步”：检查 beatTrusted、beatConfidence、phase gating。
- 若“延迟高”：优先看 p95 与 cadence（fg/bg feed interval）。

---

## 7. 音频输入设备选择（历史问题/现状提示）

参考：`docs/AIVJ_INTEGRATED_PLAN.zh.md`

- 文档中曾明确：AudioBus 缺少 `loadInputDevice/loadMediaStream/seek/currentSource/inputSourceInfo` 会导致 audioTransportController 报错。
- **实际以当前代码为准**：如果你要继续推进“音频设备选择”，需要先确认当前 `npm run lint` 是否已全绿，以及 `audioTransportController` 是否已重新接入。

---

## 8. 下一步工作清单（给编程 AI 的可执行 TODO）

> 规则：每完成一项，必须补：落地文件 + 开关 + 门禁结果 + 证据链路径。

### 8.1 最高优先级（不破坏现有门禁）

1. 扩展 coupling3d HUD：增加 `fgDepth/bgDepth/focusPoint` 等更关键的调参项（让调参更快闭环）。
2. 把 3D coupling 的关键状态写入 `__nw_verify`（如果尚未覆盖），让 headless/verify 更可观测。

### 8.2 中优先级（工程化/性能）

1. AudioBus Worker 可行性：当前 `docs/reports/AUDIOBUS_WORKER_FEASIBILITY_2026-01-29.md` 是占位，需要补“指标/传输成本/回退机制/验收标准”。
2. 对 3D coupling 新增的 shader 路径做最小性能保护（预算降级时自动关闭 depth-effects）。

---

# 9. 中文白话版（给你看）

## 9.1 这个项目现在是什么状态？

- 这个项目是一个“跟着音乐动”的视觉引擎：音乐进来，画面就会跟着节奏、能量变化。
- 你之前要求的“别空口说完成、每次都能验收”的体系已经跑通：
  - 每次改完代码都能跑 `lint + 验收脚本`，并自动生成报告和日志（证据）。
- 现在你要推进的主线是“让前景/背景两层 ProjectM 真的有 3D 深度感、而不是简单叠加”。
  - 我们已经做到了：默认不影响现有画面；你打开开关后才会看到 3D 深度效果。
  - 还做了一个 HUD：右下角一个调参小面板，拖动滑条就能实时调效果。

## 9.2 我以后应该怎么看进度？

- 你只需要把 `docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md` 当作唯一进度表。
- 这份新文档（本文）当作“总入口/说明书”：
  - 告诉任何编程 AI：项目怎么跑、怎么验收、代码在哪、下一步做什么。

## 9.3 如果你要现场快速验证 3D 效果

- 在地址栏加参数打开：`?coupling3d=on&coupling3dHud=1`
- 右下角会出现 HUD：你拖动 parallax/dof/strength 就能马上看到变化。
- 看完要恢复默认：把 `coupling3d` 改回 `off` 或直接删掉参数（也可以清理 localStorage 相关 key）。

---

## 附录 A：来源索引（按主题分组）

### AIVJ / 验收闭环
- `docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md`（唯一事实源）
- `docs/reports/AIVJ_VERIFICATION_REPORT_2026-01-29.md`
- `docs/reference/CODEBASE_MAP.zh.md`

### 3D 耦合 / 音频驱动
- `AUDIO_DRIVEN_PROJECTM_COMPREHENSIVE_PLAN.md`
- `docs/3D_COUPLED_IMPLEMENTATION_PLAN.md`
- `docs/AIDATA_3D_COUPLING_EXECUTION_PLAN.md`
- `docs/reports/COUPLING_STEP1-3_READINESS_CHECKLIST_2026-01-29.md`

### 音频调试
- `docs/reports/AUDIO_DRIVE_ANALYSIS.zh.md`
- `docs/reports/AUDIO_DRIVE_DEBUG_CHECKLIST.zh.md`
- `docs/reports/AUDIO_DRIVE_PARAMS.zh.md`

### 数据/产物
- `docs/AIDATA_UTILIZATION_PLAN.md`

### 架构
- `docs/reference/ARCHITECTURE.md`

---

> 维护建议：后续新增/修改文档时，先更新唯一事实源，再更新本“总入口”里的“来源索引 + 下一步 TODO”。
