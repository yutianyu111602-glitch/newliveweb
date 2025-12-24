# newliveweb 未完成项集中清单（以代码现状为准）

> 生成时间：2025-12-19
>
> 目标：解决“计划文档太多、口径不一致、哪些没做不清楚”的问题：
>
> 1. 把所有文档里的未完成 checkbox（例如 `- []`）集中到一个地方；
> 2. 用当前代码仓库的真实实现去判定：哪些其实已完成（文档过时）、哪些仍需做、哪些需要现场手工验收；
> 3. 给出一个可执行的“完成全部未完成项”的路线图（按 P0→P1→P2）。
>
> 权威规则：真实状态以 `MASTER_SPEC.zh.md` + 代码 + `npm run verify:*` 为准；本文件是 local 汇总（可随时丢弃/重生成）。

---

## 0. 范围（自动扫描结果）

我用脚本扫描了 `newliveweb/**.md` 中所有包含未勾选项（`[]`）的文件，只有以下 6 个来源：

1. `newliveweb/TODOS.zh.md`
2. `newliveweb/docs/AIVJ_INTEGRATED_PLAN.zh.md`
3. `newliveweb/docs/AIVJ_3D_COUPLING_PLAN.md`
4. `newliveweb/docs/ui/UI_MODULES_AND_DATAFLOW.zh.md`
5. `newliveweb/docs/reference/PROJECTM_INTEGRATION.md`
6. `newliveweb/docs/reference/REFRACTOR_PLAN.zh.md`（存在编码乱码：强烈建议视作历史参考，不再按其中 checkbox 推进）

---

## 1. 快速结论（先把“哪些文档已过时”讲清楚）

### 1.1 明确：哪些 checklist 其实已经“在代码中完成”

以下两类是“文档里仍是 []，但代码已实现”的典型（建议把原文档对应项勾为 [x] 或追加对齐说明）：

- 音频输入/stream 支持（AIVJ_INTEGRATED_PLAN 的 Task B）：

  - `AudioBus.loadMediaStream(...)` / `AudioBus.loadInputDevice(...)` / `AudioBus.currentSource` / `AudioBus.inputSourceInfo` / `AudioBus.seek(...)` 已存在：`src/audio/AudioBus.ts`
  - `StreamAudioProcessor.loadFromStream(...)` / `seek(...)` / `currentSource` 已存在：`src/audio/StreamAudioProcessor.ts`

- ProjectM “失败状态位 + 调用阻断”、坏 preset 处理、自动轮播降级：
  - `ProjectMEngine` 已有 `failed` 状态并在失败后 early-return：`src/projectm/ProjectMEngine.ts`
  - 预设控制器具备 try/catch、错误态提示、标记 broken、避免重复加载等：`src/features/presets/PresetsController.ts`
  - 多库/安全模式切换：`presetLibrarySource` 已持久化，并有库选择 UI：`src/app/renderShell.ts` + `src/app/bootstrap.ts` + `src/config/presetLibraries.ts`

### 1.2 明确：哪些文档建议废弃（或仅保留参考）

- `docs/reference/REFRACTOR_PLAN.zh.md`

  - 当前文件含明显乱码；且其中很多“重构计划”已经以另一种方式落地（例如：renderShell/bootstrap/VisualStateV2/SceneManager compositor 等）。
  - 建议：把它视为“历史备忘录”，不要再把它当成可执行 TODO 的来源。

- `docs/reference/PROJECTM_INTEGRATION.md`
  - 其中“按 L 键显示/隐藏控制面板”等描述与当前 UI 现状可能已不一致。
  - 建议：仅作为“手工排障检查清单”的参考，不作为计划推进的 P0/P1 目标。

---

## 2. 仍需完成的事项（去重后的统一 Backlog）

> 说明：下面只列出“当前仍需要做/需要验收”的条目；已在代码中完成但文档未更新的，会放在第 3 节“可直接勾掉/废弃”的列表。

### 2.1 P0（演出前）——以现场可用为准，主要是“手工验收”

来源：`TODOS.zh.md`（Now 区）。

- [MANUAL] 工具栏滚轮调参：range/number、nw-knob、macro knobs、slot knobs

  - 验收：鼠标悬停控件滚轮 → 值变化且页面不乱滚。

- [MANUAL] AIVJ Auto toggle：可开启、状态可观测、5–10s 内有可见变化

- [MANUAL] Camera：开启后画面可见、opacity 生效、segmentation 可感知（性能不足可先只验“可见”）

- [MANUAL] Depth iDepth：source 选择 iDepth + ws 连接 + 状态可见 + 画面受影响

  - 注：代码侧已存在 iDepth/WS 支持（renderShell/paramSchema/bootstrap/DepthLayer 均有），“未完成”主要是现场链路联调与验收。

- [MANUAL] 音频链路持续更新：波形、电平、BPM/Conf 输出稳定

- [MANUAL] Use input / Use system：点击后无需额外点击即可开始看到电平/波形（AudioContext resume 行为）

- [MANUAL] Loopback 电平：长期不卡低值，静音接近 0，monitor 开启不明显削波

- [MANUAL] Video src：填写 src 后进入 playing 或明确失败态；Retry 可恢复

- [DOC] TODO 元数据标准化（如果你还想继续统一格式）
  - 把 Now/Next 的每条 TODO 固定四字段：优先级/预计工时/依赖/验收信号。

### 2.2 P1（结构/巡检）——让“参数系统与通路”可持续

来源：`docs/ui/UI_MODULES_AND_DATAFLOW.zh.md`

- [MANUAL] Inspector：

  - `paramSchema` 的 key 能按 group 出现；group→scope 覆盖完整；窄屏 320px+ 不溢出。

- [MANUAL] MIDI：target（macro/slot/param）写入能到达 patch 落地点。

- [MANUAL] AIVJ：midiLock/hold/off/ai 四态切换不互相写穿；slow bank write-back 频率可控。

- [MANUAL] Diagnostics：AIVJ debug、AudioFrame、ProjectM 状态字段与运行时一致。

- [MANUAL] Favorites：保存/载入/对比/导出 CSV 在 UI 与 headless 下可用。

（可选）如果你想让这部分尽量机器化：执行 `npm run audit:dataflow` 并查看产物。

### 2.3 P2（效果增强）——3D 耦合与“自动导演”

来源：`docs/AIVJ_3D_COUPLING_PLAN.md`

- [P2][DONE][UNVERIFIED] UI 增强：ProjectM 面板/宏可视化/图层联动监视器 (Diagnostics Layers row + PM panel updates)

  - 备注：当前代码里已经存在 overlayBudget + Inspector 分组 + Diagnostics，很多诉求可能已被“别的形态”覆盖；如果你仍想按该文档推进，需要先把“目标 UI 形态”与现状对齐（否则容易重复开工）。

- [P2] 算法增强：深度传播、颜色共振、节奏级联、空间扭曲

- [P2] AI 自动导演：场景识别器、动态预设链

---

## 3. 可直接判定为“已完成/文档过时”的未勾选项（建议批量清理）

> 这些条目继续留在各计划文档里会造成“看起来没做、其实做了”的错觉。

### 3.1 `docs/AIVJ_INTEGRATED_PLAN.zh.md` 的 Task B（音频输入修复）

建议状态：已在代码中完成；剩余仅是“手动验收/现场测试”。

- AudioBus 相关（B.1.1~B.1.7）：已实现（见 `src/audio/AudioBus.ts`）
- StreamAudioProcessor 相关（B.2.1~B.2.3）：已实现（见 `src/audio/StreamAudioProcessor.ts`）

### 3.2 `TODOS.zh.md` 中部分 P0 实现项

建议状态：多数已在代码中完成，但仍需要你按 Now 清单做现场验收（手工打勾）。

- P0-7 ProjectMEngine failed 状态位 + 调用阻断：已实现（`src/projectm/ProjectMEngine.ts`）
- P0-8 preset 切换入口统一 try/catch + 自动轮播降级：已实现（`src/features/presets/PresetsController.ts`）
- P0-9（可选）坏 preset 记忆/避开：已实现（broken 标记与避开逻辑见 `src/features/presets/PresetsController.ts` + `src/config/presets.ts`）
- P0-10/11 多库 + 安全模式切换：已实现（`src/config/presetLibraries.ts` + `src/app/renderShell.ts` + `src/app/bootstrap.ts`）

### 3.3 `docs/reference/REFRACTOR_PLAN.zh.md`

建议状态：整体废弃（或只保留参考，不再按 checkbox 推进）。

理由（以代码事实为准）：

- `renderShell.ts` / `bootstrap.ts` / VisualStateV2 / ParamSchema / PresetsController / Diagnostics / SceneManager compositor 等核心落点已经存在。
- 继续按该文档推进会导致重复建设与口径分裂。

---

## 4. 执行路线图（完成所有仍未完成项）

### 4.1 本周（P0：把“演出前验收”打完勾）

顺序建议（尽量减少互相干扰）：

1. 音频链路（Use input / Loopback / BPM/Conf）
2. 滚轮调参（range/number + knobs）
3. AIVJ Auto（确认能跑、能停、状态可见）
4. Camera（可见性优先）
5. Depth iDepth（连通 + frames>0）
6. Video src（playing 或明确失败态）
7. （按当前约定：最后统一跑）`npm run verify:dev` + `npm run verify:check` 固化 artifacts

### 4.2 下周（P1：做一次“全链路巡检”并固化 audit 产物）

- 按 `UI_MODULES_AND_DATAFLOW.zh.md` 的清单手工验收一遍
- 运行 `npm run audit:dataflow`（如果脚本可用）并把产物留存到 `artifacts/audit/`
- 如果发现缺口，再回到 `TODOS.zh.md` 追加“可验收”的具体 TODO（而不是在多个计划文档里散落）

### 4.3 后续（P2：3D 耦合/AI 导演）

- 先对齐“现状已具备哪些耦合与预算机制”（overlayBudget/avgLuma/compositor/macro patch 等），再决定 `AIVJ_3D_COUPLING_PLAN.md` 里的 Task 1~9 哪些还需要做。
- 如果要继续推进，建议把剩余工作拆到 `TODOS.zh.md` 的 P2 区，避免长期计划文档继续膨胀。

---

## 2025-12-23 对齐补充（本机）

- 本文件的“未完成项汇总”已由更贴近当前代码与 4k120 计划的审计报告接管：
  - `docs/reports/DOCS_EXECUTION_AUDIT_2025-12-23.local.zh.md`
- 建议后续执行只维护两类清单：
  - “可执行 TODO”：`TODOS.zh.md`
  - “性能计划 + 执行留痕”：`docs/reports/PERF_OPTIMIZATION_LOG.local.md` + `docs/reports/PLAN_4K120_PERF_v3.5.local.zh.md`
