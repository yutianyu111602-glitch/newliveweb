# newliveweb 基础设施引入计划（宏观旋钮 / 全参数面板 / 可插拔背景 / 可收藏随机 / MIDI 预留）

> 归档提示：最新权威入口请看 `MASTER_SPEC.zh.md`（本文作为“基础设施专题”保留，后续只追加变更记录）。
> 阅读/写作路由：要做事先看 `DOCS_INDEX.zh.md`；任务拆解写 `TODOS.zh.md`；接口细节写 `DATA_INTERFACES.zh.md`；真实进度与验收口径以 `MASTER_SPEC.zh.md` 为准。

> 本文档是“下一阶段工程基础设施”的专用规格，用于在 **不把复杂度散落到 main/bootstrap/UI/layer** 的前提下，实现：
>
> - 3 个宏观旋钮（默认简单）
> - 可展开的全参数面板（高级精调）
> - 背景可替换（Liquid → Camera → Video…）
> - 随机/收藏/恢复统一语义（VisualState + ParamSchema + SeededRng）
> - 预留 MIDI 控制映射接口（未来增强，不阻塞当前落地）

---

## 1. 现状盘点（以当前代码为准）

### 1.1 已经具备的基础能力（P0/P1 落地）

- 音频：`AudioBus` 是唯一分发源，产出 `AudioFrame`（energy/rms/peak/bands/pcm…）。
- Layer 管线：`SceneManager` 驱动 `Layer[]`（LiquidMetal / ProjectM / Camera…）。
- ProjectM 叠加融合：`ProjectMLayer.setBlendParams({opacity, blendMode, audioDrivenOpacity, energyToOpacityAmount})`，并在 `update()` 中调制。
- 收藏/随机：已有 `VisualStateV1`（含 seed/Blend/LiquidMetal），且 Random 已引入 `SeededRng` 并写 `global.seed`（可复现基础存在）。
- UI：
  - 顶部工具栏已具备 PM blend 控件（`pm-opacity/pm-blend-mode/pm-audio-opacity/pm-energy-opacity`）。
  - `LiquidMetalControlPanel` 存在，但其实现是“直接改 layer.params”（需要逐步收敛到 store/controller）。
- 验收：`npm run verify:dev` + headless report 已可稳定输出关键摘要。

### 1.2 已知结构风险

- “参数与 UI 绑定”正在分裂：一部分走 toolbar，一部分走 LiquidMetalControlPanel（直接改 layer），未来扩展会造成双入口、语义漂移、收藏不一致。
- 背景源未来会变多（camera/video），如果继续用“每个背景写一套 UI + 一套随机 + 一套收藏字段”，复杂度会指数增长。

---

## 2. 不变约束（继承执行规范）

- 单一音频源：分析/分发只来自 `AudioBus`（禁止第二套能量/平滑/增益）。
- 层边界：`layers/*` 不碰 DOM/localStorage；UI/收藏/随机只通过公开 API 或 store/controller。
- BlendParams 语义冻结：`opacity` 永远代表 PM overlay 强度；`audioDrivenOpacity = base + energy*amount`；未来 compositor 也沿用。
- 可观测验收：Diagnostics + headless verify 是“真相源”，不接受“观感争论”。

---

## 3. 北极星：把复杂度收敛在 4 个基础设施

1. **VisualState（状态）**：收藏/随机/恢复/分享的唯一真相源
2. **ParamSchema（参数定义）**：面板生成 + 随机生成的唯一来源
3. **Controller（应用）**：把 state 应用到 layers，隔离 UI 与渲染实现
4. **Background Plugin（可插拔背景）**：Liquid/Camera/Video 等背景都走同一接口

宏观旋钮、加号生成“随机宏变量”、未来 MIDI，都落在 **State + Schema + Controller** 上，而不是散落在 UI 事件里。

---

## 4. 目标状态数据模型（V2：面向可插拔背景与宏观旋钮扩展）

### 4.1 VisualStateV2（建议）

> 说明：现有 `VisualStateV1` 不删不改，新增 V2 并提供迁移；V1 仍可读。

```ts
type MacroId = "fusion" | "motion" | "sparkle";

type MacroSlot = {
  id: string; // stable id, for saving + MIDI mapping
  label: string; // e.g. "Fusion+" / "My Macro 1"
  value: number; // 0..1
  randomize: boolean; // 是否参与全局随机
  pinned?: boolean; // 可选：锁定不被随机覆盖
};

type VisualStateV2 = {
  version: 2;
  global: {
    seed: number; // 所有随机的根种子
    macros: Record<MacroId, number>; // 3 个主旋钮（默认暴露）
    macroSlots: MacroSlot[]; // “+” 新增的宏变量列表（可保存，可参与随机）
    energyScale?: number; // 可选：全局能量缩放
    mode?: "stable" | "punchy" | "dark";
  };
  background: {
    type: "liquid" | "camera" | "video";
    params: Record<string, unknown>; // 由背景模块 schema 定义（JSON-safe）
  };
  projectm: {
    presetId: string | null;
    presetUrl: string | null;
    opacity: number;
    blendMode: "normal" | "add" | "screen" | "multiply";
    audioDrivenOpacity: boolean;
    energyToOpacityAmount: number;
  };
};
```

### 4.2 设计要点

- “宏观旋钮”是稳定产品语义：始终只有 3 个主旋钮；高级用户可通过 “+” 新增宏变量（MacroSlot）。
- MacroSlot 是第一等公民：能被收藏/恢复/全局随机影响，也能被未来 MIDI 绑定。
- 背景可替换：state 里只关心 `background.type + params`，不关心其实现是 shader、camera 还是视频纹理。

---

## 5. ParamSchema：一套 schema 同时服务三件事（面板 / 随机 / 宏映射）

### 5.1 Schema 能力（最小实现，不追求过度抽象）

每个参数定义至少包含：

- `type`: number | bool | enum（后续可加 color）
- `default/min/max/step`（number）
- `group`: e.g. "Background/Color", "ProjectM/Blend"
- `advanced`: 是否只在“展开面板”显示
- `random`: 是否参与随机（可选带权重/分布）
- `macroBinding`: 可选，标注被哪个宏观旋钮影响（或由宏映射函数统一处理）

### 5.2 当前落点建议（贴合现有代码）

- `src/state/paramSchema.ts`：继续作为 schema 汇总处，但从“函数集合”逐步升级为“可枚举 schema”。
- `LiquidMetalControlPanel`：逐步退役为 schema 驱动的 Inspector（或改造成只写 store，而不直接写 layer.params）。

---

## 6. Controller：把 UI 变更收敛为“写 state”，把渲染收敛为“应用 state”

### 6.1 单一入口：applyVisualState / applyPatch

- UI（toolbar + inspector + 宏旋钮 + “+”按钮）只做：`store.applyPatch(patch)`
- Controller 订阅 store 并做：
  - `projectmLayer.setBlendParams(state.projectm)`
  - `projectmLayer.loadPresetFromUrl(state.projectm.presetUrl)`（受控触发）
  - `backgroundModule.applyParams(state.background.params)`
  - `scene/background layer` 切换（当 `background.type` 变化）

### 6.2 宏观旋钮接口预留（避免以后推翻）

宏旋钮不直接改某几个参数，而是走一个清晰接口：

```ts
type MacroInputs = {
  macros: Record<"fusion" | "motion" | "sparkle", number>;
  slots: MacroSlot[];
  audio: { energy: number; bands: { low: number; mid: number; high: number } };
};

type MacroPatch = {
  // 只写能稳定映射的字段；其他字段保持用户精调不被覆盖
  projectm?: Partial<VisualStateV2["projectm"]>;
  background?: { params?: Record<string, unknown> };
};

function computeMacroPatch(input: MacroInputs): MacroPatch;
```

约束：

- 默认只映射“高价值、可解释、不会毁画面”的少数字段（例如 ProjectM opacity、Liquid brightness/contrast/tint）。
- “展开面板的精调”优先级更高：宏 patch 不应该每帧覆盖用户手动锁定的参数（可通过 `pinned` 或“锁定参数”策略实现）。

---

## 7. “+”按钮：新增一个随机宏变量（MacroSlot）的产品与技术规格

### 7.1 交互规格

- 在 3 个宏观旋钮旁边显示 `+`。
- 点击 `+`：新增一个 MacroSlot：
  - 默认 label：`Macro 1/2/3…`（可编辑）
  - value：由 SeededRng 生成 0..1
  - randomize：默认 true（会被全局随机影响）
- 全局 Random：
  - 会同时随机：seed、三主旋钮、所有 `randomize=true` 的 MacroSlot.value
  - 会保留：`randomize=false` 或 `pinned=true` 的 slot
- 收藏/恢复：MacroSlot 必须完整写入 VisualState（包括 id/label/value/randomize）

### 7.2 工程落点（最小改动路径）

- `renderShell.ts`：在宏旋钮区加入 `+` 按钮（先只做一个“新增 slot”，不立即做 MIDI）。
- store：新增 `macroSlots` 存储与迁移（V1 → V2 时 slot 列表默认空）。
- controller：把 slots 作为 computeMacroPatch 的输入（即使当前不映射，也要保留结构）。

---

## 8. MIDI 映射（未来增强，不阻塞当前落地）

### 8.1 需求拆解

MIDI 本质是“把外部连续控制信号映射到某个可调参数”，最适合的绑定对象：

- 三主旋钮（fusion/motion/sparkle）
- MacroSlot（用户自定义宏变量）
- （高级）某个 schema 参数（可选）

### 8.2 预留接口（现在就设计好，不现在实现）

定义一个可保存的映射表：

```ts
type MidiBinding = {
  id: string;
  target: { kind: "macro" | "slot" | "param"; key: string }; // e.g. 'fusion', slotId, 'background.brightness'
  deviceId?: string;
  channel?: number;
  cc?: number; // 控制器编号
  min?: number;
  max?: number;
  curve?: "linear" | "exp" | "log";
};
```

保存位置：`VisualState.global` 或单独 `SettingsStore`（推荐后者：设备相关不应该进收藏）。

---

## 9. 分阶段引入计划（每一步都可验收、可回滚）

### Phase A（最小落地，先把“结构”建好）

1. 新增 `INFRASTRUCTURE_PLAN.zh.md`（本文档）
2. 定义 VisualStateV2（只加字段，不改业务语义）+ 迁移器（V1→V2）
3. 在 UI 增加 3 个宏旋钮 + `+`（slot 列表）但先不做复杂映射，先实现“可保存/可随机”
   验收：headless verify 继续 pass；收藏/恢复无回归。

### Phase B（面板与随机收敛到 schema）

1. Schema 变为可枚举：背景/ProjectM/global 都提供 schema
2. 新增 InspectorPanel：展开后由 schema 自动生成全参数 UI（按 group/advanced）
3. Random 只作用于 schema 标注 random 的字段 + 宏旋钮/slots
   验收：随机覆盖更稳定，且收藏语义一致；避免“双入口”改参导致收藏不一致。

### Phase C（可插拔背景）

1. 背景模块化：Liquid/Camera/Video 都实现 BackgroundModule 接口
2. Controller 负责切换 background.type 并应用 params
   验收：切换背景不破收藏；默认仍以 liquid 为主。

### Phase D（MIDI，最后做）

1. SettingsStore 保存绑定（不进入收藏）
2. Web MIDI 接入（权限/设备枚举/CC 输入）
3. 绑定 UI（选 target + 学习模式）
   验收：不影响 verify；设备缺失时完全不报错。

---

## 10. 护栏（避免“复杂度变事故”）

- 单一入口：参数修改必须走 store → controller；禁止 UI 直接写 layer.params（逐步改掉 LiquidMetalControlPanel 的直接写入）。
- 变更节流：宏 patch 与 inspector 输入都需要 debounce/合批，避免主线程抖动。
- 验收强制：每个 phase 结束必须跑 `npm run verify:dev` 并记录摘要。
- 编码规范：文档与 TS 文件均为 UTF-8（Windows 友好），大文档与代码不要混提交。

---

## 11. 2025-12-16 计划刷新（后端优先 → UI）

> 本节用于把“可交付/可验证”的优化计划映射到当前已落地的 V2 / Controller / BackgroundRegistry / ParamSchema。

### 11.1 后端优先的交付顺序（建议）

1. ParamSchema 补齐与 Random 约束

- 让 Random/Inspector/Favorites 共同依赖 schema（`group/advanced/random`）。
- Random 只作用 `random:true` 字段；`random:false` 字段保持当前值（避免“意外乱跳”）。

2. Controller 单入口（applyPatch）继续收敛

- Random/Favorite/Inspector/快捷键都通过 controller patch；移除/隔离任何“直写 layer.params”的 UI 遗留入口。
- 背景切换（background.type）必须由 controller 驱动 registry 同步启用/禁用与 params 应用。

3. BackgroundRegistry 插件化闭环

- Liquid/Camera/Video 统一：只允许一个背景 active；其余背景 disable。
- schema 驱动 Inspector/Random：Inspector 只展示当前背景 paramDefs；Random 只随机 `random:true` 字段。
- 风险控制：background.type 的随机应默认关闭（避免 camera 权限与 headless 不稳定）。

4. 音频链路健壮化 + 可诊断

- AudioBus 的 energy 是唯一统一控制信号；可选 smoothing 只发生在 AudioBus 内（默认关，显式 opt-in）。
- Diagnostics 同时展示 energy 与 energyRaw，便于验证平滑策略。

5. ProjectM 可靠性 + headless verify 护栏

- 固化 `globalThis.__projectm_verify` 字段命名与语义；headless verify 校验 frames 增长与 output changes。

### 11.2 验收口径（统一）

- 人工：`npm run dev` 下 Diagnostics 能看到 AudioContext.state、energy/energyRaw、renderer info、\_\_projectm_verify 关键字段。
- 自动：`npm run verify:dev`/`npm run verify:ci` 产物 `artifacts/headless/report.json` 中 framesRendered 增长且 final output changed。

---

## 12. 后端优先任务清单（含验收标准，详细版）

> 目标：把“基础设施引入”落成可验证的工程任务，避免 UI 先行导致状态漂移。

### 12.1 ParamSchema 补全与 Random 约束

- 子任务：补齐 LiquidMetal/Camera/ProjectM 的 `group/advanced/random`；Camera `opacity` schema 必须存在；LiquidMetal `contrast` 设为 `random=false`；Random 只随机 `random=true` 字段。
- 验收：schema defs 完整；Random/Inspector 生成的参数集只包含 random:true；Camera schema 在 Inspector 可见且 Random 不触发未标注字段。

### 12.2 Controller 单入口改造

- 子任务：扩展 `VisualStateController.applyPatch` 覆盖 background.type 切换与 params 同步；Random/Favorite/Inspector/快捷键全部统一走 patch→controller；移除所有 `layer.params` 直写。
- 验收：所有入口 trace 指向 controller；背景切换后 layer 与 state 一致；代码搜索无直写残留。

### 12.3 BackgroundRegistry 插件化（Liquid/Camera）

- 子任务：Liquid/Camera 按模块接口实现 schema/default/apply/audio；registry 只允许一个 active；UI/Random/Inspector 依据当前背景 schema 工作；Video 仅占位不暴露 UI。
- 验收：liquid↔camera 切换 params 持久，Random/Inspector 生效不越权；Video 不出现在 UI/随机；渲染无异常日志。

### 12.4 音频链路与 Diagnostics

- 子任务：AudioBus 内完成能量唯一化与可选平滑（none/ema，默认关）；Diagnostics 展示 energy/energyRaw/平滑配置，含静音/未运行提示。
- 验收：Diagnostics 字段齐全；平滑不会破坏 0..1；静音提示可见且恢复自动更新。

### 12.5 ProjectM 健壮性与 headless 校验

- 子任务：锁定 `__projectm_verify` 字段名（initialized/framesRendered/lastAudioRms/lastAudioPeak）；WASM abort 日志钩子；headless verify 校验 frames 增长 + finalOutputChanged。
- 验收：Diagnostics 字段稳定；异常日志可定位；`verify:dev/ci` 通过且报告满足判定。

---

## 13. 2025-12-16 变更补充：本地音频输入（MediaStream）

> 目的：把“现场输入设备驱动渲染”纳入基础设施口径，仍保持单一音频源与可诊断验收。

- 统一入口：输入设备捕获仍走 `AudioBus`（单一分发源），不会在 layer/feature 内再接第二套 analyser。
- 实现落点：
  - `StreamAudioProcessor` 新增 `loadFromStream`（`MediaStreamAudioSourceNode`）与切源 teardown。
  - `AudioBus` 新增 `loadInputDevice(deviceId?)`（封装 `getUserMedia` + 接入 processor）。
- UI 最小闭环：顶部工具栏提供输入设备下拉与启用按钮；启用后默认音量设为 0，避免现场反馈。
- 可观测验收：Diagnostics 展示当前 source/input label；`energyRaw/energy/rms/peak` 随输入跳动；拒权/无设备时提示且不崩溃；`npm run verify:dev` 不回归。
