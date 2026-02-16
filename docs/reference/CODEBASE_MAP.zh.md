# CODEBASE_MAP.zh.md（代码地图 / 可点击索引）

目标：把项目拆成 3 条主干（审计/数据、预设加载/黑名单、AIVJ/换预设策略），并提供“从 UI 一路点到 ProjectM 加载/渲染/探测/黑名单”的可点击路径。

> 约定：本文只指向仓库内真实文件；链接可直接在 VS Code 中点开。

---

## 1) 三条主干（模块树）

### A. 审计 / 数据（Audit + Artifacts）

- 审计入口（Node/Playwright）：[scripts/preset-audit.mjs](../../scripts/preset-audit.mjs)
- 审计快照（从 checkpoint/最终 JSON 生成 live blacklist）：[scripts/snapshot-preset-audit.mjs](../../scripts/snapshot-preset-audit.mjs)
- SQLite 离线索引工具：
  - [scripts/audit-to-sqlite.py](../../scripts/audit-to-sqlite.py)
  - [scripts/audit_sqlite_tools.py](../../scripts/audit_sqlite_tools.py)
- 产物输出目录（示例）：
  - `artifacts/presets/audit-full-130k-2025-12-28-run3/`（run3 全量审计）
  - `artifacts/presets/audit-run3-nowavesnoshapes-200/`（修复包复审计）

### B. 预设加载 / 黑名单 / 质量判定

- 预设库配置（UI 下拉可切库）：[src/config/presetLibraries.ts](../../src/config/presetLibraries.ts)
- Manifest 拉取与注册（加载 manifest → 注册 presets → 初始加载）：
  - [src/features/presets/PresetsController.ts](../../src/features/presets/PresetsController.ts)
- Manifest 解析映射：
  - [src/lib/loadManifest.ts](../../src/lib/loadManifest.ts)
- 质量探测与原因体系（`too-dark/wasm-abort/...`）：
  - [src/features/presets/presetQuality.ts](../../src/features/presets/presetQuality.ts)

### C. AIVJ / 换预设策略（运行时）

- UI/运行时总入口（包含换预设函数、预加载队列等）：
  - [src/app/bootstrap.ts](../../src/app/bootstrap.ts)
- AIVJ 宏控制器（当前主要是宏/槽位的自动化，不直接负责“选哪个 preset”）：
  - [src/features/aivj/unifiedAivjController.ts](../../src/features/aivj/unifiedAivjController.ts)

---

## 2) 关键入口（你要改策略改哪儿）

- 换预设策略（顺序 + 过滤黑名单）：
  - `getNextPresetFiltered()`：见 [src/app/bootstrap.ts#L4789](../../src/app/bootstrap.ts#L4789)
- Manifest 加载（切库时的主要入口）：
  - `loadPresetManifestForSource()`：见 [src/features/presets/PresetsController.ts#L442](../../src/features/presets/PresetsController.ts#L442)
- ProjectM 质量探测（probe）：
  - `probePresetQuality()`：见 [src/features/presets/presetQuality.ts](../../src/features/presets/presetQuality.ts)

---

## 3) 数据流（从 UI → 选预设 → 加载 → 渲染 → 探测/黑名单）

```mermaid
flowchart TD
  UI[UI: toolbar / hotkeys] --> BOOT[bootstrap.ts]
  BOOT -->|pick next| NEXT[getNextPresetFiltered()]
  NEXT --> PRESET[PresetDescriptor]
  PRESET --> CTRL[PresetsController]
  CTRL -->|loadPresetFromUrl| PM[ProjectMEngine / projectLayer]
  PM --> RENDER[WebGL render]

  %% Quality probe loop
  BOOT --> PRELOADQ[presetPreloadQueue]
  PRELOADQ --> PROBE[probePresetQuality()]
  PROBE -->|bad reasons| BLACKLIST[markPresetQualityBad / markPresetAesthetic]
  BLACKLIST --> NEXT

  %% Library load
  UI -->|switch library| LOADMAN[loadPresetManifestForSource()]
  LOADMAN --> FETCH[fetch(manifestUrl)]
  FETCH --> MAP[mapManifestToPresetDescriptors]
  MAP --> REG[registerRuntimePresets]
  REG --> CTRL
```

---

## 4) 你要接“风格索引/AI”的 Hook 点（建议）

- **运行时加载 style index**：优先挂在 `loadPresetManifestForSource()` 之后（manifest 已加载、presets 已注册）。
- **运行时选 preset**：优先改 `bootstrap.ts` 中 `getNextPresetFiltered()` / 或其调用侧，把“顺序轮转”替换为“按场景/宏状态采样”。

下一份文档会把“选 preset 的调用链”展开：见 [CALLCHAIN_PRESET_SELECTION.zh.md](CALLCHAIN_PRESET_SELECTION.zh.md)
