# root → docs/* 迁移映射表（可直接执行）

> 生成时间：2026-01-30
> 目标：把 `newliveweb/` 根目录散落的“报告/白皮书/审计/快照/本地执行记录”迁入 `docs/*`，根目录只保留少数权威入口与日常入口。
> 原则：移动后在原路径保留 **stub**（1-3 行），避免旧链接失效。
>
> 执行方式：本文件提供“真实文件名”的映射清单；执行脚本由 Copilot 在本次变更中直接运行。

---

## 1) 根目录保留文件（不迁移）

- README.md
- MASTER_SPEC.zh.md
- DOCS_INDEX.zh.md
- LOCAL_DEV_GUIDE.md
- DATA_INTERFACES.zh.md
- INFRASTRUCTURE_PLAN.zh.md
- TODOS.zh.md
- （可选/暂不动：AGENTS.md、IDENTITY.md、SOUL.md、USER.md、MEMORY.md、TOOLS.md、HEARTBEAT.md）

---

## 2) root → docs 迁移映射（真实文件名）

### 2.1 Whitepapers / Reference（方案、深度分析、长期参考）

- 130k_strategy_discussion.md → docs/reference/whitepapers/optimization/130k_strategy_discussion.md
- optimization_plan.md → docs/reference/whitepapers/optimization/optimization_plan.md
- OPEN_SOURCE_LIBS_CHEATSHEET.md → docs/reference/OPEN_SOURCE_LIBS_CHEATSHEET.md

- comprehensive-audio-guide.md → docs/reference/whitepapers/audio/comprehensive-audio-guide.md
- audio-pipeline-detailed-spec.md → docs/reference/whitepapers/audio/audio-pipeline-detailed-spec.md
- audio-pipeline-optimization.md → docs/reference/whitepapers/audio/audio-pipeline-optimization.md

- dual-projectm-implementation.md → docs/reference/whitepapers/projectm/dual-projectm-implementation.md
- DUAL_PROJECTM_3D_COUPLING_OPTIMIZATION.md → docs/reference/whitepapers/projectm/DUAL_PROJECTM_3D_COUPLING_OPTIMIZATION.md

- AUDIO_DRIVEN_PROJECTM_COMPREHENSIVE_PLAN.md → docs/reference/whitepapers/audio-driven-projectm/LEGACY_AUDIO_DRIVEN_PROJECTM_COMPREHENSIVE_PLAN.md

（Batch 2 / 2026-01-30）
- AIVJ_DESIGN.zh.md → docs/reference/AIVJ_DESIGN.zh.md
- HARDWARE_INTEGRATION.zh.md → docs/reference/HARDWARE_INTEGRATION.zh.md

### 2.2 Reports（审计/状态/总结快照）

- AUDIT_SUMMARY.md → docs/reports/root-migration/AUDIT_SUMMARY.md
- detailed-audit-report.md → docs/reports/root-migration/detailed-audit-report.md
- full-audit-report.md → docs/reports/root-migration/full-audit-report.md
- EXPERT_IMPLEMENTATION_AUDIT.md → docs/reports/root-migration/EXPERT_IMPLEMENTATION_AUDIT.md
- DOCUMENTATION_UPDATE_COMPLETE.md → docs/reports/root-migration/DOCUMENTATION_UPDATE_COMPLETE.md
- OPTIMIZATION_COMPLETE.md → docs/reports/root-migration/OPTIMIZATION_COMPLETE.md

- PRESET_FIX_STATUS.md → docs/reports/root-migration/PRESET_FIX_STATUS.md
- PRESET_LOADING_FIX.md → docs/reports/root-migration/PRESET_LOADING_FIX.md
- PRESET_RENDER_FIXES_SUMMARY.md → docs/reports/root-migration/PRESET_RENDER_FIXES_SUMMARY.md

- audio-audit-report.md → docs/reports/root-migration/audio-audit-report.md
- PROJECT_FILE_STATUS.zh.md → docs/reports/root-migration/PROJECT_FILE_STATUS.zh.md

- training_report.md → docs/reports/root-migration/training_report.md

（Batch 2 / 2026-01-30）
- AI_ALCHEMY_DIAGNOSIS.md → docs/reports/ai/AI_ALCHEMY_DIAGNOSIS.md
- AI_LORA_ANALYSIS.md → docs/reports/ai/AI_LORA_ANALYSIS.md

### 2.3 Runbooks（可执行操作手册/清单）

- EXECUTION_CHECKLIST.md → docs/runbooks/EXECUTION_CHECKLIST.md
- MIGRATION_CHECKLIST.md → docs/runbooks/MIGRATION_CHECKLIST.md
- RUN_PRESET_TRAINING.md → docs/runbooks/RUN_PRESET_TRAINING.md

（Batch 2 / 2026-01-30）
- AIVJ_2K_ALCHEMY_RUNBOOK.zh.md → docs/runbooks/AIVJ_2K_ALCHEMY_RUNBOOK.zh.md

### 2.4 Local snapshots（本机执行记录/可归档）

- EXECUTION_PLAN.local.md → docs/archive/local/EXECUTION_PLAN.local.md
- EXECUTION_STATUS.local.md → docs/archive/local/EXECUTION_STATUS.local.md
- FINAL_SUMMARY.local.md → docs/archive/local/FINAL_SUMMARY.local.md
- TODOS.local.md → docs/archive/local/TODOS.local.md

### 2.5 Archive（历史存档，不作为执行入口）

（Batch 2 / 2026-01-30）
- TODOS_ARCHIVE.zh.md → docs/archive/TODOS_ARCHIVE.zh.md

### 2.6 暂不迁移（下一批再处理）

> 这些属于“分项权威/规划文档”，本次先不动以减少链路断裂；后续要瘦身根目录可迁到 docs/reference 并保留 stub。

（本轮已迁移：AIVJ_DESIGN.zh.md / AIVJ_2K_ALCHEMY_RUNBOOK.zh.md / HARDWARE_INTEGRATION.zh.md / TODOS_ARCHIVE.zh.md）

---

## 3) Stub 模板（根目录原路径保留）

```md
# Moved

Moved to: docs/xxx/yyy.md
This stub remains for compatibility. Please update links.
```
