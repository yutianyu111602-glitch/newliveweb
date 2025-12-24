# newliveweb 文档索引与收敛约定（给人类与 AI 的“写作路由”）

> 目的：解决“文档爆炸”——把信息放对地方、避免重复口径、同时确保**不丢信息**（历史仍可追溯）。
> 原则：任何“新增/变更”先写 `MASTER_SPEC.zh.md`（权威入口），再按需同步到分项文档；同步时遵守“只追加，不覆盖/不删除”。

---

## 0. 术语（统一口径）

- **Canonical（权威）**：唯一可信口径，发生冲突以其为准。
- **Append-only（只追加）**：允许在文档末尾新增“对齐补充/变更记录”，不修改旧段落（避免历史丢失）。
- **内部后端/数据层**：本项目没有传统服务端；这里指应用内部的 `AudioBus / VisualState / ParamSchema / Presets / Diagnostics / Verify` 等契约。

---

## 1. 文档分工（读什么、改什么）

### 1.1 权威入口（必须先看/先改）

- `MASTER_SPEC.zh.md`
  - **角色**：全项目唯一权威入口（产品定位、硬约束、当前真实能力、验收口径、文档规则、变更记录）。
  - **你要写在这里的内容**：
    - 新功能“是否已落地”的事实口径（以代码为准）
    - 不变约束与验收口径的更新
    - 变更记录（日期追加）
  - **不要在这里做的事**：把分项文档全文复制进来（只保留摘要 + 指针）。

### 1.2 分项权威（单主题的“细节真相”）

- `DATA_INTERFACES.zh.md`

  - **角色**：接口契约专题（类型/方法/存储 key/诊断字段），面向 UI 与扩展开发。
  - **策略**：接口细节写这里；`MASTER_SPEC.zh.md` 只保留摘要与链接。

- `AIVJ_DESIGN.zh.md`

  - **角色**：AIVJ（自动 VJ / AIDJ）算法规格与验收口径（Techno 取向、MIDI 仲裁、8-knob macro bank）。
  - **策略**：算法/仲裁的“正文”可以写这里；但任何“是否已实装/变更记录”仍需先追加到 `MASTER_SPEC.zh.md`，并在此同步对齐。

- `INFRASTRUCTURE_PLAN.zh.md`

  - **角色**：工程路线图（为什么要做、怎么分阶段做、每阶段验收）。
  - **策略**：计划写这里；真实进度/现状对齐写回 `MASTER_SPEC.zh.md` 的变更记录与“当前代码现状”。

- `TODOS.zh.md`
  - **角色**：可执行任务清单（每条都有最小验收信号）。
  - **策略**：任务粒度写这里；不要重复写一份“完整规格”，遇到重复以链接/引用解决。

### 1.3 运行手册（操作步骤为主）

- `LOCAL_DEV_GUIDE.md`
  - **角色**：本地运行/排障/交接操作步骤（怎么启动、怎么验收、怎么看 artifacts）。
  - **策略**：操作性内容写这里；架构/规划不要展开（指向 `MASTER_SPEC.zh.md`/`INFRASTRUCTURE_PLAN.zh.md`）。

### 1.4 入口说明（面向新读者）

- `README.md`
  - **角色**：从零开始的入口（怎么跑、看哪些文档、当前状态）。
  - **策略**：只放最短路径链接，不承载大量“规格正文”。

### 1.5 深度专题（历史/排障/方案，不再作为全局口径）

> 这些文档允许“保持历史”，但不应成为协作时的第一引用来源；需要时从 `MASTER_SPEC.zh.md` 进入。

- `docs/reference/PROJECTM_INTEGRATION.md` / `docs/reference/PROJECTM_WASM_SOLUTION.md` / `docs/reference/PROJECTM_FIX_ANALYSIS.md`：ProjectM 集成与排障专题。
- `docs/reference/REFRACTOR_SPEC_FOR_AI.zh.md` / `docs/reference/REFRACTOR_PLAN_CLEAN.zh.md` / `docs/reference/REFRACTOR_PLAN.zh.md`：重构执行规范与历史计划（存在重复/旧口径时，以 `MASTER_SPEC.zh.md` 为准）。
- `docs/reference/PLANNED_NOT_DONE.zh.md`：已计划但未落地 punch list（与 `TODOS.zh.md` 的差别是：这里更像“备忘录/缺口列表”）。
- `docs/reference/ARCHITECTURE.md`：简短架构笔记（与 `MASTER_SPEC.zh.md` 口径一致时可参考）。
- `docs/ai/AI_COLLAB_LOG.md`：AI 协作提示与交接记录（不作为产品/架构口径）。
- `docs/ai/AI_SYNC_PACKET.zh.md`：给另一位 AI 的“最短对齐材料”（目标/事实/分工/验收）。
- `docs/ai/AI_SYNC_BOARD.zh.md`：并行协作看板（文件占用/冲突避免）。

### 1.6 本地报告/计划（local，方便执行与留痕）

> 说明：这些文件用于“执行记录/现场表格/本机计划”，不作为全局权威口径；若结论稳定，应回写到 `MASTER_SPEC.zh.md` 的变更记录与 `TODOS.zh.md` 的可执行项。

- `docs/reports/PERF_OPTIMIZATION_LOG.local.md`：性能优化留痕（每一步都记录时间与落点）。
- `docs/reports/DOCS_EXECUTION_AUDIT_2025-12-23.local.zh.md`：文档整理 + 计划执行对齐审计（统一未执行/未验证清单）。
- `docs/reports/BASELINE_S1_S7_LOG.local.zh.md`：4k120 基线采集表（A0）。
- `docs/reports/EXECUTION_PLAN_4K120_A0.local.zh.md`：4k120 执行计划（repo 内可执行版本：先 [!] 现场验收，再跑 A0）。
- `docs/reports/PLAN_4K120_PERF_v3.5.local.zh.md`：4k120 性能/架构计划 v3.5（repo 内可执行对齐版，含 B3/B4 下一步）。
- （repo 外，已弃用入口）`C:\Users\pc\.codex\plans\newliveweb-4k120-performance-plan.md`：历史计划原文（仅作参考；执行以 repo 内计划为准）。

---

## 2. “写作路由”（新增信息写到哪里）

### 2.1 新增功能（例如：本地音频输入、摄像头背景、视频背景）

1. 在 `MASTER_SPEC.zh.md` 追加：
   - **事实**：当前是否已实现（以代码为准）
   - **缺口**：缺什么接口/UX/护栏
   - **验收**：Diagnostics/verify/UI 最小信号
2. 在 `DATA_INTERFACES.zh.md` 追加：
   - 新增/变更的接口与字段（方法签名、类型、storage key、diagnostics 字段）
3. 在 `TODOS.zh.md` 拆成可执行 TODO：
   - 每条都能验收（UI/日志/artifacts）
4. 如涉及操作步骤，在 `LOCAL_DEV_GUIDE.md` 追加演出/开发指南。

### 2.2 只做计划（尚未实现）

- 详细拆解写 `INFRASTRUCTURE_PLAN.zh.md`。
- `MASTER_SPEC.zh.md` 只保留“计划入口链接 + 与现状的差距”。

---

## 3. AI/协作写作规范（避免再次爆炸）

- **先对齐事实，再写计划**：每次写“将要做”之前，先写“现在是什么”（代码文件路径为证据）。
- **不做双份规格**：出现重复段落时，保留一处为“权威正文”，其余改为摘要 + 链接（历史段落保留在原文档中，不删除）。
- **变更集中写一次**：同一变更先落 `MASTER_SPEC.zh.md`，再向分项文档追加同步；避免每份文档都写一遍完整叙述。
- **验收信号必须可点击**：每条 TODO/验收尽量引用具体文件路径（例如 `src/audio/AudioBus.ts`、`scripts/headless-verify.mjs`）。

---

## 4. Debug UI（样式改造与对接）

- `docs/ui/DEBUG_UI_FIGMAAI_BRIEF.zh.md`

  - **角色**：给 FigmaAI 的“纯样式”输出规范（只改 CSS，不改逻辑/DOM）。
  - **读者**：设计/前端。

- `docs/ui/DEBUG_UI_AI_INTERFACE.zh.md`

  - **角色**：给“自动化/AI”准备的 **样式接口层**（CSS 变量 / data-attributes / 状态类），用于在不改 DOM 结构的前提下做智能化视觉反馈。
  - **读者**：需要做“智能调试 UI”的开发/AI。

- `docs/ui/DEBUG_UI_DEV_HANDOFF.zh.md`

  - **角色**：开发交接与数据链路梳理（audio → AudioFrame → layers → renderer；schema-driven inspector；可扩展接口）。
  - **读者**：前端/图形/扩展开发。

- `docs/ui/DEBUG_UI_FIGMA_SPEC.zh.md`
  - **角色**：更详细的 Figma 设计规格（组件清单、状态、布局与选择器映射；严格贴合现有 `src/style.css` token 与控制台风格）。
  - **读者**：设计/FigmaAI/前端。
