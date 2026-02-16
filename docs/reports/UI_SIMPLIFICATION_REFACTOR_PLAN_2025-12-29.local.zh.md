# UI 简化重构执行计划（本地 · 2025-12-29）

> 目标：把 newliveweb 的 UI 从“同屏全量控件”收敛为**演出必需默认可见**，其余一律收纳到 **Advanced/Debug**（不改渲染/音频/AIVJ/参数消费逻辑），让现场操作更快、更不容易误触、更易扫读。
>
> 范围声明：本计划以“UI/布局/信息架构”为主；业务逻辑只允许做**必要的 UI 分组/可见性开关**与**不改变语义的 DOM 调整**。

---

## 0. 一句话结论（你要的“链路确认”）

### 0.1 UI 生成链路（入口）

- UI DOM 模板：`src/app/renderShell.ts`
  - 负责生成 Toolbar/Canvas 的 HTML，并返回 `DomRefs`（所有按钮/输入的引用）。
- 运行装配与写入路由：`src/app/bootstrap.ts`
  - 负责：UI 事件绑定 → controller 初始化 → patch 落地到 `VisualStateV2` / runtime writer / layer。

### 0.2 三条核心数据链路（你现场真正会用到的）

1) **音频驱动链路**
- `AudioBus.onFrame(AudioFrame)` → `LiquidMetalLayerV2.setAudioFrame(frame)` + `ProjectMLayer.setAudioFrame(frame)` + Diagnostics
- 关键文件：`src/audio/AudioBus.ts`、`src/types/audioFrame.ts`、`src/app/bootstrap.ts`

2) **预设切换链路**
- UI 触发（Next/Auto/Random/Favorite）→ `PresetsController` → `ProjectMLayer.loadPresetFromUrl(...)`
- 关键文件：`src/features/presets/PresetsController.ts`、`src/app/bootstrap.ts`
- Callchain 索引：`docs/reference/CALLCHAIN_PRESET_SELECTION.zh.md`

3) **参数/宏/自动化链路（AIVJ）**
- `paramSchema` 定义参数 → Inspector/MIDI/Random 通过 scope 路由写 patch → bootstrap 落地
- AIVJ/AudioControls 作为 runtime decision writer，最终收敛到对 ProjectM/Liquid 等的 runtime 调制
- 关键文件：`src/state/paramSchema.ts`、`src/app/controllers/inspectorController.ts`、`src/app/controllers/midiController.ts`、`src/features/aivj/unifiedAivjController.ts`、`src/app/bootstrap.ts`

---

## 1. 当前 UI “复杂感”的根因（痛点拆解）

### 1.1 信息架构混层

- 演出必需（要快、要少、要稳定）
- 设置/调参（需要时再开）
- 调试/验收（只在排障/验证时开）

这三类目前在同屏混杂，导致：
- 现场扫一眼找不到“最该拧的那几个”
- 高密度控件导致误触风险高
- 新人上手难：不知道哪些是“会影响画面”的，哪些是“开发调试用”的

### 1.2 “可见性不受控”

虽然项目已经有 `data-group="live|debug|advanced"` 与 toggle（bootstrap 中的 `nw.toolbar.showDebug/showAdvanced`），但仍有大量“设置/调参”控件放在默认可见的 live 区域。

---

## 2. 设计目标（可验收，不是口号）

### 2.1 默认视图 = 演出必需（Stage-first）

默认（Advanced=off / Debug=off）时，仅保留：
- 音频：播放/输入设备/音量/电平（可用即可）
- 预设：库/选择/下一个/自动切换（可控即可）
- AIVJ：自动开关 + 风格选择 + HOLD（核心演出行为）
- 宏：fusion/motion/sparkle 三个旋钮（最重要的手感入口）
- ProjectM：opacity + audio amount（让 PM 可见且不炸）
- Display：Fullscreen（现场必须）

### 2.2 Advanced/Debug = “需要才开”

- Advanced 打开后才出现：导入/URL、波形、Seek、背景各层开关/opacity、macro slots、宏映射、blendMode/priority/retreat、Inspector、MIDI 等。
- Debug 打开后才出现：Calibration、Snapshot 等。

### 2.3 不改变现有逻辑语义

- 任何按钮/输入的 `id` 不改（避免 bootstrap/controller 断线）
- 任何 patch writer 的语义不改（避免 single-writer 打架）
- 仅通过 `data-group` 与少量结构重排实现“简洁默认可见”

---

## 3. 目标信息架构（IA）与交互规范

### 3.1 Toolbar 三态分层（统一口径）

- `live`：演出必需
- `advanced`：设置/调参（默认隐藏）
- `debug`：调试/验收（默认隐藏）

### 3.2 可见性开关（已存在，继续复用）

- localStorage：
  - `nw.toolbar.showAdvanced`
  - `nw.toolbar.showDebug`
- 控制点：`src/app/bootstrap.ts` 内 `applyToolbarGroups()`
- CSS gating：
  - `src/style.css` 中 `[data-group="advanced"]` / `[data-group="debug"]` 的 display 控制

### 3.3 “少即是多”的现场原则

- 默认只露出“最常用 + 误触成本最低”的控件
- 不要求用户理解所有模块，只需要能：
  1) 有音频
  2) 能切换 preset
  3) 能 HOLD
  4) 能开 AIVJ 并选风格
  5) 能手拧 3 个宏

---

## 4. 实施步骤（可照着做，带检查点）

> 下述步骤按“最小风险优先”排列：先分层隐藏，再做结构收敛，再做视觉/排版细化。

### Phase 0（已落地）：默认视图瘦身（只用 data-group）

落点文件：
- `src/app/renderShell.ts`
- `src/app/bootstrap.ts`
- `src/style.css`

已做事项（对齐本次改动口径）：
- 把以下控件移入 `data-group="advanced"`（默认隐藏）：
  - 顶栏：Params（随机当前图层参数）
  - Audio：System audio / File / URL / Mixxx / Seek / Waveform
  - Presets：Import / Preset URL
  - Visual：Follow AI / Audio Drive preset / Beat toggle / 背景层编辑与各层 opacity / Camera/Video/Depth 细项
  - Macros：macro save/load actions / +Slot / macro preset / macro slots
  - ProjectM：blendMode / retreat / priority
- 把 toolbar 的 showAdvanced/showDebug 同步到 `#toolbar` dataset（允许顶栏也能被 Advanced gating）
- 为下一步结构收敛做铺垫：Advanced/Debug 的大块控件已不再默认出现在同屏 Stage 视图

自检清单：
- [x] Advanced=off 时顶栏不出现 Params
- [x] Advanced=on 时顶栏出现 Params
- [x] Advanced=off 时 Visual 不再铺满背景层控制
- [x] Advanced=on 时背景层控制完整可用

### Phase 1（已落地）：结构收敛（Stage/Setup/Debug 分区）

落点文件：
- `src/app/renderShell.ts`
- `src/style.css`

已实现信息架构：
- Stage（默认可见）：以“演出操作”为主，控件尽量少且高频
- Setup（Advanced=on）：承载导入/细调/映射/层混合/Inspector/MIDI
- Debug（Debug=on）：只放校准/快照等工具

Stage（默认）包含：
- Audio：Play / Input device / Use input / Volume / Level + 音频特征
- Presets：Select / Next / Auto toggle + interval / Status + manifest info
- AIVJ：Hold / Auto techno / Style / AudioCtl
- Macros：3 knobs + bank status + Random macros
- ProjectM Blend：Opacity / Audio drive / Energy amount
- Display：Fullscreen

Setup（Advanced）包含：
- Audio Setup：System out / Mixxx / File / URL / Seek / Waveform
- Preset Library：Library select / Import file / URL
- AIVJ：Follow AI / BeatTempo / Audio drive preset + summary
- Layers：bg type / liquid variant lock / layer toggles / opacity / camera/video/depth rows + params
- Macro Setup：save/load、macro preset、slots、macro map panel（含各 mapping 的 macro/min/max）
- ProjectM Setup：blendMode / priority / retreat strength
- Inspector
- MIDI

Debug（Debug）包含：
- Tools：Calibration / Snapshot

实现约束（已遵守）：
- 所有 `id` 保持不变（`renderShell` 缺失会 throw）
- `#audio-status` 保持在 `.toolbar__section` 内（transport controller 依赖）
- 已跑回归：`npm --prefix newliveweb run lint` 与 `npm --prefix newliveweb run verify:check`

检查点：
- [x] 现场默认视图能在 5 秒内完成：有音频 + 可切 preset + 开 AIVJ + HOLD
- [x] Advanced 打开后能找到所有原有控件（没有“改丢了”）

### Phase 2（已部分落地）：交互手感（减少误触 + 强化状态可扫读）

落点文件：
- `src/app/renderShell.ts`
- `src/style.css`
- `src/app/bootstrap.ts`
- `src/app/controllers/audioTransportController.ts`

已做事项：
- Stage 关键按钮增加视觉语义（`toolbar__button--primary`）：Play / Next / Fullscreen
- HOLD 按钮在 HOLD 时高亮（与 AIVJ pill 的 hold 色彩一致）
- Audio Play 按钮会随播放态切换 active/pressed（并补齐 `aria-pressed`）
- Stage 默认进一步“少即是多”：
  - 隐藏 Audio conf/stability（Advanced 才显示）
  - 隐藏 preset manifest info（Advanced 才显示）
- 热键（全部在输入框/编辑态时禁用，避免误触）：
  - `Space`：HOLD
  - `N`：Next preset
  - `P`：Play/Pause
  - `R`：Random
  - `Shift+R`：Random current params
  - `F`：Fullscreen
  - `A`：Advanced toggle
  - `D`：Debug toggle
  - `C`：Calibration overlay

验收：
- [x] HOLD 状态在视觉上明显（现场一眼能看见是否 HOLD）
- [x] AIVJ 状态 pill 文案/颜色语义明确（off/ai/midi lock/hold）

### Phase 3：文档与 UX 统一（让新人看文档就能上手）

输出物：
- 更新/追加一份 UI 快速上手（放 `LOCAL_DEV_GUIDE.md` 或单独 local doc）
- 给每个模式一张图：Stage-only / Advanced / Debug

---

## 5. 验收与回归（必须跑，不然 UI 改了等于没改）

### 5.1 自动化验收（推荐顺序）

```bash
# 1) 类型检查
npm --prefix newliveweb run lint

# 2) 快速 headless 验收（会产出 artifacts/headless/*）
npm --prefix newliveweb run verify:check

# 3) 更完整的 dev 验收（会复用/启动 dev server）
npm --prefix newliveweb run verify:dev
```

### 5.2 现场手动 checklist（演出视角）

- [ ] 默认打开页面：不会被海量控件吓到（只看到 Stage 必需）
- [ ] 选择输入设备 → Use input → 音量拉起 → 电平有变化
- [ ] Next preset 正常工作；Auto 计时正常；Hold 能冻结
- [ ] AIVJ Auto 打开后宏会动（Follow AI 打开时 UI 会跟随）
- [ ] Advanced 打开后能找到：导入/URL、背景层开关、宏槽位、Inspector、MIDI

---

## 6. 风险与回滚策略（务必写清楚）

### 6.1 主要风险

- DOM 重排导致某些 `querySelector` 选择器失效（应避免，保持 `id` 不变）
- Advanced 默认隐藏导致“看起来功能没了”（必须：Advanced 一开全回来）

### 6.2 回滚策略

- 所有改动尽量只动 `renderShell.ts` + `style.css` + 少量 `bootstrap.ts` 的 dataset 同步
- 若出现不可控问题：
  - 第一优先：回滚 `renderShell.ts` 的结构改动（保留 `data-group` 分层）
  - 第二优先：回滚 bar 的 gating（只隐藏 body，顶栏不隐藏）

---

## 7. 后续可选升级（不在本轮必做，但建议列出来）

- “Stage Mode”显式开关（区别于 Advanced）：把 Stage 进一步精简到只剩 2 行控件
- 热键/OSC/MIDI 映射的 UI 统一入口（避免散落在多个 section）
- 把 Visual 的 background mixer 做成独立 “Layers” Advanced section（结构更清晰）
- 把 Inspector 默认折叠为侧边抽屉（更像 Ableton plugin 面板）

---

## 8. 参考入口（方便你继续读）

- UI 分层与模块：`docs/ui/DEBUG_UI_DEV_HANDOFF.zh.md`
- 全局 UI 规范（layout-only）：`docs/ui/UI_GLOBAL_REDESIGN_SPEC.zh.md`
- 参数路由报告：`docs/reports/PARAM_ROUTING_REPORT.zh.md`
- 预设选择 callchain：`docs/reference/CALLCHAIN_PRESET_SELECTION.zh.md`
- AIVJ 炼丹路线：`docs/reference/AIVJ_ALCHEMY_PLAN.zh.md`
