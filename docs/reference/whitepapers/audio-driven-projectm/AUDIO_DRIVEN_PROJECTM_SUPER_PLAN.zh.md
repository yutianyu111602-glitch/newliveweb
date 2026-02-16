# 音频驱动 ProjectM（双层 + 3D 耦合）超级计划书（给编程 AI）

> 更新时间：2026-01-30
> 核心目的：**只看这一份文档，就能持续把项目往前推**（包含：当前状态、已做/没做、下一步做什么、改哪些文件、怎么验收、证据链落盘在哪里）。
>
> 文档治理说明：
> - 全局 Canonical（发生冲突以其为准）：`newliveweb/MASTER_SPEC.zh.md`
> - Scoped-Canonical（AIVJ 输出优化/验收/证据链）：`newliveweb/docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md`
> - 本文（Super Plan）：**执行计划书/工作入口**（不替代 Canonical；但这是“编程 AI 的唯一入口”）。
>
> 约束（必须遵守）：
> - 默认行为不变；新增能力必须“显式开关启用 + 可回滚”。
> - 以门禁与证据链判断完成：`npm run lint` + `node scripts/aivj/run-acceptance-tests.mjs`（必要时包含 `npm run verify:check`）。
> - 不要为了“修报错”偏离主线（例如：Vitest 非主线门禁时不优先）。

---

## 0. 一句话告诉你现在该做什么

1) 先把文档入口变成 1 个：本文；根目录只留少量入口，其余迁到 `docs/*`（映射见：`newliveweb/docs/reports/root-migration/ROOT_TO_DOCS_MIGRATION_MAP_2026-01-30.zh.md`）。
2) 然后推进主线：**音频驱动 + 双层 ProjectM + 3D 深度耦合**，每一步都要有开关、验收与 artifacts 证据。

---

## 1. 当前“代码现实”（你要有的心智模型）

### 1.1 关键入口与职责（不争论，按代码走）

- App 装配：`src/app/bootstrap.ts`
  - 运行时开关（URL/localStorage）
  - AIVJ 控制与 preset 切换策略
  - coupling3d 每帧更新与 HUD
- 渲染驱动：`src/SceneManager.ts`
  - compositor 路径（FG/BG 合成）
  - 深度效果 shader 变体（仅 on 模式启用）
- 3D 耦合：`src/layers/ProjectM3DCoupling.ts`
  - mode：off/debug/on
  - 参数平滑/钳制
- 音频 SSOT：`src/audio/AudioBus.ts` + `src/audio/StreamAudioProcessor.ts`
  - 唯一音频帧协议：`src/types/audioFrame.ts`
- AIVJ 选择/宏：`src/features/aivj/*`、`src/features/presets/*`

### 1.3 背景层（Camera/Video/Depth）的“真实 wiring”要点（按代码核对）

> 结论：Camera/Video/Depth 都已在 `bootstrap.ts` 实例化与接线；Depth 已支持 `source=idepth`，并通过 `DepthWsClient` 连接 ws 并向 `DepthLayer.setFrame()` 喂 `ImageBitmap`。

- 实例化位置：
  - `src/app/bootstrap.ts` 创建 `cameraLayer/videoLayer/depthLayer`（Camera 受 `CAMERA_FEATURE.enabled` 控制；Depth/Video 总会创建实例）。
- Depth 外部源（ws/idepth）配置键：
  - `localStorage['nw.depth.wsUrl']`（ws）
  - `localStorage['nw.depth.idepthUrl']`（idepth）
  - `bootstrap.ts` 中 `ensureDepthWsClient(source)` 负责：连接/重连、状态回写、帧喂入 `depthLayer.setFrame()`。
- Depth UI 可观测：
  - `updateDepthStatusLabel()` 会把 `DepthLayer.getStatus()` 与 ws 状态拼成一行（包含 state/frames/error）。

### 1.4 coupling3d 运行时开关（按代码核对，作为后续文档/验收口径）

- mode：`off | debug | on`
- URL 开关：`?coupling3d=on` / `?coupling3d=debug`
- localStorage 开关：`localStorage['nw.coupling3d'] = 'on' | 'debug' | '0'`
- 可调参数（URL 优先于 localStorage）：
  - `?coupling3dParallax=...`（0..0.25）/ `localStorage['nw.coupling3d.parallax']`
  - `?coupling3dDof=...`（0..2）/ `localStorage['nw.coupling3d.dof']`
  - `?coupling3dStrength=...`（0..1）/ `localStorage['nw.coupling3d.strength']`
- HUD：`?coupling3dHud=1` 或 `localStorage['nw.coupling3d.hud']='1'`

### 1.2 门禁（完成的唯一判定）

- `npm run lint`
- `node scripts/aivj/run-acceptance-tests.mjs`
  - 产物：`artifacts/headless/report.json`、`artifacts/headless/budget-dynamics.json` 等（详见 AIVJ Scoped-Canonical）

---

## 2. 现在已经做到哪了（已验证/可回滚的事实）

> 备注：这里尽量只写“已落地且可验收”的事实；如果只是白皮书/构想，放到“未完成/计划”。

### 2.1 AIVJ 输出优化（Scoped-Canonical 内）

- ✅ 验收闭环：`lint + acceptance + verify:check` 与 artifacts 证据链已稳定。
- ✅ selection ratio/解析/匹配策略修复已落地，并纳入门禁。

权威入口：`docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md`

### 2.2 coupling3d（Step2/Step3 工程落地）

- ✅ `coupling3d` 模式：off/debug/on（默认 off）
- ✅ compositor 深度 shader 变体：仅 on 模式启用
- ✅ 参数平滑/钳制
- ✅ HUD：默认关闭；开启后可实时观测与调参并写入 localStorage

执行/验收口径：以 AIVJ Scoped-Canonical 的 `12.6` 为准（只在该文档记录“落地文件/开关/验收/证据链”）。

---

## 3. 根目录瘦身（立即执行：降低“我该看哪个”成本）

### 3.1 迁移映射（已落盘）

- 映射表（真实文件名）：`docs/reports/root-migration/ROOT_TO_DOCS_MIGRATION_MAP_2026-01-30.zh.md`
- 执行日志：`docs/reports/root-migration/ROOT_MIGRATION_EXECUTION_LOG_2026-01-30.txt`

### 3.2 根目录最终保留（建议）

- `README.md`
- `MASTER_SPEC.zh.md`
- `DOCS_INDEX.zh.md`
- `LOCAL_DEV_GUIDE.md`
- `DATA_INTERFACES.zh.md`
- `INFRASTRUCTURE_PLAN.zh.md`
- `TODOS.zh.md`

---

## 4. 白皮书拆分（5 主题，避免“长文 = 执行口径”）

Legacy（已迁入并降权）：
- `docs/reference/whitepapers/audio-driven-projectm/LEGACY_AUDIO_DRIVEN_PROJECTM_COMPREHENSIVE_PLAN.md`

拆分产物（Reference，作为“理解材料”，不作为验收口径）：
- `docs/reference/whitepapers/audio-driven-projectm/00_OVERVIEW.md`
- `docs/reference/whitepapers/audio-driven-projectm/10_AUDIO_PIPELINE.md`
- `docs/reference/whitepapers/audio-driven-projectm/20_DUAL_PROJECTM.md`
- `docs/reference/whitepapers/audio-driven-projectm/30_3D_COUPLING.md`
- `docs/reference/whitepapers/audio-driven-projectm/40_PERF_VERIFY.md`

---

## 5. 超级详细执行计划（按主题 + 可验收任务）


> 规则：每条任务必须包含：
> - **状态**：Not started / In progress / Done / Needs verify
> - **改动落点**：要改哪些文件（越具体越好）
> - **开关/回滚**：URL/localStorage/env（默认不影响现有行为）
> - **验收**：命令 + 证据链路径（机器优先，现场项给出“人工步骤”）

### 5.0 P0 现场验收矩阵（从 `TODOS.zh.md` 的 Now 区抽取；这里是“执行入口”）

> 说明：这批任务的目标不是“写白皮书”，而是把现场可用性问题变成 **可重复验收** 的闭环。
>
> 统一验收命令（Windows）：
> - PowerShell：`$env:VERIFY_HOST='127.0.0.1'; $env:VERIFY_PORT='5174'; npm run verify:dev` 然后 `npm run verify:check`
>
> 证据链（机器侧）：
> - `artifacts/headless/report.json`
> - `artifacts/headless/page-errors.log`
> - `artifacts/headless/console.log`

#### P0-V1：Camera 图层开启后画面可见
- 状态：Needs verify
- 现状/相关文件：
  - Camera 实现：`src/layers/CameraLayer.ts`
  - Camera UI：`src/ui/CameraControlPanel.ts`
  - 装配/wiring：`src/app/bootstrap.ts`
- 开关/回滚：
  - UI toggle：`Camera` layer on/off（默认 off，避免权限弹窗）
  - 透明度：camera params `opacity`（默认 1，必要时可把默认调高但必须可回滚）
- 现场验收步骤：
  1) 打开页面 → 勾选 `Camera`
  2) 授权 getUserMedia
  3) 选择正确 camera device（如有 device 下拉）
  4) 调高 `Camera opacity`
- 通过标准：
  - 画布上可见真实画面（至少能看到亮度/轮廓变化）
  - `Camera opacity` 调整 1 秒内可见生效
  - 可选：开启 `Segmentation` 后画面边缘/主体遮罩有可观测差异
- 失败时优先排查：
  - `CameraLayer.startStream()` 是否进入 `streaming` 状态
  - `mesh.visible`/材质 opacity 是否被 overlay budget 乘到近 0
  - `VideoTexture` 是否被替换/未 `needsUpdate`

#### P0-V2：Depth 增加 iDepth 入口 + 可连接外部深度帧
- 状态：Needs verify（代码路径基本齐：`source=idepth` + `DepthWsClient` + `depth-status` 文本；剩余是现场联调与问题收敛）
- 现状/相关文件：
  - Depth 实现：`src/layers/DepthLayer.ts`（已支持 `source: "webcam"|"ws"|"idepth"`，并提供 `setFrame()`/`setExternalState()`/`getStatus()`）
  - 装配/wiring：`src/app/bootstrap.ts`（`DEPTH_IDEPTH_URL_KEY='nw.depth.idepthUrl'`，`ensureDepthWsClient('idepth')` 喂入帧并刷新状态文本）
- 交付目标（最小闭环）：
  1) UI 下拉出现 `iDepth`
  2) 从 `localStorage.nw.depth.idepthUrl` 读取 ws 地址并连接
  3) 收到帧后调用 `depthLayer.setFrame(ImageBitmap)`
  4) UI 能观测 `DepthLayerStatus`（connecting/connected/frames/fps）
- 开关/回滚：
  - layer toggle：`Depth` on/off
  - source：`webcam|ws|idepth`（默认 webcam）
  - 配置：`localStorage.setItem('nw.depth.idepthUrl','ws://127.0.0.1:9002')`
- 验收（现场）：
  - `source` 选择 `iDepth` → `depth-status` 从 idle → connecting → streaming，且 `framesIn>0`
  - 调整 fog/edge/layers/blur 对画面有影响
- 验收（机器侧，最小）：
  - 在 `__nw_verify`（或等价诊断入口）暴露 `depth.getStatus()` 关键字段并写入 headless artifacts（至少：source/state/framesIn）

#### P0-V3：图层开关/控件接线生效（UI 改动“真的生效”）
- 状态：Needs verify
- 相关文件：`src/app/bootstrap.ts`、`src/SceneManager.ts`、`src/layers/*Layer.ts`
- 开关/回滚：各 layer toggle（Basic/Camera/Video/Depth/Liquid）
- 现场验收：依次勾/取消各图层并调 opacity，1 秒内必须影响画面
- 通过标准：不出现“点了没反应”；任何 slider/toggle 都是可见生效

#### P0-A1：音频链路持续更新
- 状态：Needs verify
- 相关文件：`src/audio/AudioBus.ts`、`src/audio/StreamAudioProcessor.ts`、`src/types/audioFrame.ts`
- 现场验收：10–20s 内 waveform/Level/Energy 持续变化，BPM/Conf 不应长期为 0/--（对明显节拍音源）
- 通过标准：UI 指标持续刷新；Diagnostics（若有）非 0

#### P0-A2：Use input / 系统音频捕获后无需额外点击即可看到电平/波形
- 状态：Needs verify
- 相关文件：UI 交互入口通常在 `src/app/renderShell.ts`/`src/app/bootstrap.ts`
- 目标：按钮交互内完成 AudioContext resume（避免再点空白处）
- 现场验收：点击 `Use input` 或 `Use system` 后 1–2s 出现电平/波形，无需额外点击

#### P0-A3：Loopback 输入电平可读
- 状态：Needs verify
- 相关文件：同 P0-A1（关注 raw/stage/processed 与自适应增益）
- 现场验收：节目音量下顶部电平不长期卡 1–5%；静音仍接近 0

#### P0-B1：Video src 入口闭环
- 状态：Needs verify
- 相关文件：`src/layers/VideoLayer.ts`、装配/wiring：`src/app/bootstrap.ts`
- 现场验收：填 src（mp4/webm）→ state 进入 playing 或明确失败态；失败时可 `Retry video` 恢复

#### P0-A4：波形 + BPM/Conf UI 有输出
- 状态：Needs verify
- 相关文件：音频链路同 P0-A1；UI 绘制（波形 canvas）在 toolbar/inspector 相关模块
- 现场验收：波形不空白、E 实时变化、几秒后 BPM/C 出现

### 5.1 P0（不破坏现有门禁的增量开发项）

#### P0-1：把 coupling3d 状态纳入 verify 可观测（让 headless 也能判断）
- 状态：Not started
- 改动落点：`src/app/bootstrap.ts`（优先在现有 `__nw_verify` 汇总处落地）
- 开关/回滚：`?coupling3d=debug|on`（默认 off）
- 验收：`node scripts/aivj/run-acceptance-tests.mjs` 的 artifacts 中包含 coupling3d 字段（至少：mode、关键参数摘要、是否启用深度 shader 变体）

#### P0-2：coupling3d HUD 补齐“快调关键项”
- 状态：Not started
- 改动落点：`src/app/bootstrap.ts` HUD 逻辑 + `src/layers/ProjectM3DCoupling.ts`
- 开关/回滚：`?coupling3dHud=1`（默认关闭）
- 验收：手动 `?coupling3d=on&coupling3dHud=1` 可调关键项且门禁仍全绿

#### P0-3：文档入口统一（编程 AI 只看本文）
- 状态：In progress
- 改动落点：`README.md`、`DOCS_INDEX.zh.md`、`docs/UNIFIED_PROJECT_HANDOFF.zh.md`
- 验收：入口文档顶部明确指向本文，且新增入口不超过 1 个

### 5.2 P1（Step4：双层/耦合产物真正接入运行时）

#### P1-1：接入 `D:/aidata/ai_generated_coupled_final/` 的 pairs manifest
- 状态：Not started
- 改动落点：`src/features/presets/*`（loader/store/controller）+ `public/*` 的 manifest 放置策略
- 开关/回滚：新增 librarySource 或 URL 参数（默认不启用）
- 验收：acceptance 产物中能看到 paired selection（日志/manifest 匹配），并可一键回滚到 single-layer

#### P1-2：FG/BG 预设切换策略与混合模式自动调节
- 状态：Not started
- 改动落点：`src/SceneManager.ts` compositor + 策略层（presets controller）
- 验收：paired preset 切换时 blendMode/opacity 不发散；能回滚到 single-layer；门禁全绿

### 5.3 P2（音频表现力工程化）

#### P2-1：AudioBus Worker 可行性从“讨论”变成“可测决策”
- 状态：Not started
- 参考：`docs/reports/AUDIOBUS_WORKER_FEASIBILITY_2026-01-29.md`
- 交付：定义指标（CPU、p95、drop、GC）、传输成本、fallback、验收标准，并给出 go/no-go 结论

### 5.4 P1/P2（基础设施：把复杂度收敛到 State+Schema+Controller+BackgroundPlugin）

> 范围来源：`INFRASTRUCTURE_PLAN.zh.md`（专题规格）；这里把它拆成“可执行 + 可验收”的任务。

#### INFRA-A1：引入 VisualStateV2（在不破坏 V1 的前提下）
- 状态：Not started
- 改动落点（建议从这里开始读/改）：
  - store：`src/features/visualState/visualStateStore.ts`
  - controller 装配：`src/app/visualStateController.ts`
- 开关/回滚：
  - 默认仍用 V1（或保持当前行为）；V2 仅在显式开关下启用（URL/localStorage 二选一）
- 验收（机器）：
  - `npm run lint`
  - `VERIFY_HOST=127.0.0.1 VERIFY_PORT=5174 npm run verify:dev` + `npm run verify:check`
- 验收（现场）：
  - 收藏/恢复/随机仍可用；刷新后状态保持；不出现“双入口参数打架”回归
- 证据链：`artifacts/headless/report.json` + 相关日志（必要时追加一条 V2 版本字段到 `__nw_verify`）

#### INFRA-B1：ParamSchema 可枚举化（服务：Inspector 自动生成 + Random + 宏映射）
- 状态：Not started
- 改动落点：`src/state/paramSchema.ts`
- 开关/回滚：Inspector 新面板可以先做为“高级面板开关”（默认不展示/不影响）
- 验收：
  - Inspector 面板能按 group/advanced 生成参数行（最小：number/bool/enum）
  - Random 只作用于 schema 标注 random 的字段（避免随机把用户精调覆盖掉）
  - 门禁全绿

#### INFRA-C1：Background Plugin 接口（Liquid/Camera/Video/Depth 走同一套路）
- 状态：Not started
- 改动落点（与现有控制器对齐，不强推重构）：
  - `src/app/controllers/backgroundMixerUiController.ts`
  - layers：`src/layers/LiquidMetalLayer.ts`、`src/layers/CameraLayer.ts`、`src/layers/VideoLayer.ts`、`src/layers/DepthLayer.ts`
- 开关/回滚：默认背景仍保持现状；plugin 化只做“在 controller 层统一入口”，不改变渲染语义
- 验收（现场）：切换 background.type 不破收藏；各背景参数能被保存/恢复；toggle 生效
- 验收（机器）：verify artifacts 继续 PASS（不得新增 console error）

#### INFRA-D1：MIDI 预留接口（只做结构，不做完整 binding UI）
- 状态：Not started
- 改动落点：`src/features/midi/*` + `src/app/controllers/midiController.ts`
- 约束：设备缺失/权限拒绝时必须 0 报错；不影响门禁
- 验收：无 MIDI 设备环境下 `verify:check` 仍 PASS；console 无 error

---

## 6. 每日执行流程（给编程 AI）

1) 选一个任务（P0 优先）
2) 只改必要文件（保持可回滚）
3) 跑门禁：`npm run lint` + `node scripts/aivj/run-acceptance-tests.mjs`
4) 把“落地文件/开关/验收结果/证据路径”追加写回 Scoped-Canonical：`docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md`

---

## 7. 附录：迁移后的文档去向

- root → docs 映射：`docs/reports/root-migration/ROOT_TO_DOCS_MIGRATION_MAP_2026-01-30.zh.md`
- 迁移执行日志：`docs/reports/root-migration/ROOT_MIGRATION_EXECUTION_LOG_2026-01-30.txt`
