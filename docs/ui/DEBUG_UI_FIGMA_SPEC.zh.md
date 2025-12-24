# Debug UI · Figma 详细设计规格（贴合现有代码 / 配色 / 个人风格）

> 适用：设计（Figma/FigmaAI）输出“视觉与样式规范”，供开发把 CSS 追加到 `src/style.css`。
> 核心原则：**不改逻辑、不改 DOM**；只通过现有 class / id / data-role 选择器做视觉升级。

---

## 1. 你这个项目的“个人风格”定义（作为设计准绳）

这是一个舞台/演出向的实时可视化控制台：

- **黑底**（画面是主角），UI 只做“可信赖的控制与状态”
- **低饱和度蓝灰点缀**（`--nw-accent`）+ **低饱和度绿/红状态**（`--nw-ok/--nw-danger`）
- **密度高但不躁**：同屏信息多，排版要稳、对齐要准、层级要清
- **工程感/控制台感**：像音频设备/调音台 UI，不像消费级 App

风格关键词：`深色半透明` / `模块卡片` / `焦点强调` / `可扫读的参数列表` / `舞台可靠性`

---

## 2. 不能越界的硬约束（来自代码现实）

1. 不新增任何 JS 逻辑 / 事件 / 动画系统。
2. 不改变 DOM 结构（`src/app/renderShell.ts` 是模板，`bootstrap.ts` 动态渲染 inspector）。
3. 不引入新字体/新配色体系：以 `src/style.css` 的 token 为准；仅允许新增 `--nw-accent-hover` 与 `--nw-text-primary/secondary/tertiary`（用于更专业的文字层级）。
4. 样式以“追加覆盖”为主：把新 CSS 放到 `src/style.css` **尾部**，用更具体选择器覆盖。

---

## 3. 设计 Token（银灰 v2 - 专业音视频工具风格）

### 3.1 颜色 Token（银灰 v2 口径）

> 说明：本节定义的是“目标 token 口径”。实现方式是：在 `src/style.css` 的 `:root` 中**更新现有变量值**，并只新增本节列出的少量文本变量（用于更专业的文字层级）。

主强调色（低饱和度蓝灰）：

- Accent（焦点/强调）：`--nw-accent: #5b8aad`
- Accent Hover：`--nw-accent-hover: #6b9abd`

状态色（低饱和度）：

- OK（启用/成功）：`--nw-ok: #5a9a7a`
- Danger（错误/危险）：`--nw-danger: #a85858`

表面/背景（深沉灰黑）：

- Surface（卡片底）：`--nw-surface: rgba(18, 20, 24, 0.78)`
- Surface Strong（工具栏底）：`--nw-surface-strong: rgba(12, 14, 18, 0.88)`

边框/输入：

- Border（分隔/边框）：沿用 `--nw-border`（建议保持低对比的灰白透明度体系）
- Input BG / Border：沿用 `--nw-input-bg` / `--nw-input-border`

文字（银灰色系）：

- Primary：`--nw-text-primary: rgba(230, 235, 240, 0.96)`
- Secondary：`--nw-text-secondary: rgba(180, 190, 200, 0.72)`
- Tertiary：`--nw-text-tertiary: rgba(140, 150, 160, 0.48)`

### 3.1.1 更专业的配色用法（低饱和度、长时间不刺眼）

你的代码里已经形成了“冷静、工程、舞台可靠”的配色气质；要更专业，关键不是加更多颜色，而是**减少颜色种类 + 统一语义**：

- **中性色**（绝大多数 UI）：

  - 文字：使用 `--nw-text-primary/secondary/tertiary` 形成层级；避免纯白大面积文字。
  - 背景：优先使用深沉灰黑 surface（`--nw-surface-strong / --nw-surface`），避免高亮彩色大块底。
  - 边框：统一用 `--nw-border` 与 `--nw-input-border`（低对比、稳定、耐看）。

- **强调色只用一个**：`--nw-accent`（hover 可用 `--nw-accent-hover`）

  - 只用于 focus ring、hover 边框、关键选中态；不要用于大面积底色。

- **状态色只用两种**：

  - OK：`--nw-ok`（用于“开/启用/成功”）
  - Error：`--nw-danger`（用于“错误/拒权/失败”）

- **避免“第三状态色”**：除非代码里已经存在且必须表达（例如某些提示色），否则不要再引入新的警告色体系。

### 3.2 允许的“派生色”规则（不新增新颜色，只用透明度）

为保证一致性：

- 分隔线/次要边框：`var(--nw-border)` 或同色更低 opacity
- 次要文字：优先使用 `--nw-text-secondary`，必要时再用 `opacity` 微调
- 强文字：优先使用 `--nw-text-primary`

禁止：新增任意全新 HEX 作为“主题色”（除了现有文件里已经用过的少量文本灰）。

### 3.3 字体与排版 Token（保持工程感）

- 全局字体：系统字体栈（已在 `style.css`）
- 基准字号：12px（toolbar 已固定）
- 标题/分组：11px + letter-spacing（已存在 `.toolbar__subtitle`）
- Diagnostics（等宽）：保留 monospace（已存在 `.nw-panel--diagnostics`）

---

## 4. 布局结构（Figma Frame 的结构要对齐代码）

### 4.1 顶层布局

- 上：Toolbar（多 section 网格）
- 下：Canvas（全屏渲染区域）
- 浮层：Favorites（右下）/ Diagnostics（左下）

对应代码：

- DOM：`src/app/renderShell.ts`
- 视觉：`.toolbar` + `.canvas-root` + `#viz-canvas`

### 4.2 Toolbar 网格（Section 卡片）

- `.toolbar__grid`: `grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))`
- 设计要点：
  - **不要设计成固定列数**；要能自适应宽度
  - section 卡片内部是 flex-column，多行 row 会 wrap

### 4.3 Section 内容排版原则

每个 section 有：

- header（左标题/右状态）
- 多个 row（可换行）

设计目标：

- header 与内容区分更清晰（可用分割线/间距，但不改 DOM）
- row 内控件在视觉上对齐（尤其是 inspector 与 macro slots）

---

## 5. 组件清单（Figma 组件必须覆盖）

> 命名建议：使用 `NW/` 前缀，方便与其他系统区分。

### 5.1 Button（`.toolbar__button` / `.nw-btn`）

Figma 组件：`NW/Button`

- Variants：`default | primary | danger`、`compact on/off`、`disabled on/off`
- States：`default / hover / active / focus`

映射：

- toolbar 内：`.toolbar__button` + `.toolbar__button--compact`
- favorites 内：`.nw-btn` + `.nw-btn--primary` + `.nw-btn--danger`

视觉要求（更像“设备控制”）：

- hover：背景更亮；边框走 `--nw-accent-hover` 或更接近 `--nw-accent`
- active：轻微下压（1px）
- focus-visible：清晰外描边（2px，`--nw-accent`）
- disabled：降低对比、明确不可点

### 5.2 Select（`.toolbar__select`）

Figma 组件：`NW/Select`

- Variants：`default | compact`、`disabled on/off`
- States：`default / hover / focus`

映射：`.toolbar__select` `.toolbar__select--compact`
备注：option 下拉已通过 `select option { background-color; color }` 适配深色。

### 5.3 Text Input（`.toolbar__input` / `.toolbar__url input`）

Figma 组件：`NW/Input/Text`

- States：`default / focus / disabled`
- 视觉规则：与 select 的高度/圆角/边框一致

### 5.4 Number Input（`.toolbar__interval input[type=number]`）

Figma 组件：`NW/Input/Number`

- 主要用在：auto-cycle 秒数、ProjectM opacity/energyToOpacity、inspector number

### 5.5 Range Slider（`.toolbar__volume input[type=range]` + inspector range）

Figma 组件：`NW/Slider`

- 轨道/拇指要清晰但低调，accent-color 走 `--nw-accent`
- 与 number input “成对出现”时，视觉上要像一个控件组

### 5.6 Switch Pill（`.toolbar__switch`）

Figma 组件：`NW/SwitchPill`

- 结构限制：内部是 `input[type=checkbox] + span`
- 目标：像“状态胶囊”，checked 更明显
- 映射：`.toolbar__switch`（包含 presets auto、show advanced、pm audio opacity、macro slot randomize/pin 等）

### 5.7 Meter（音频电平）

Figma 组件：`NW/Meter`

- 映射：`.toolbar__meter` + `#audio-level-bar.toolbar__meter-bar` + `#audio-level-text`
- 目标：
  - bar 动态清晰
  - 文本弱化但可读

### 5.8 Status Text / Pill

Figma 组件：`NW/StatusText`、`NW/Pill`

- 映射：
  - `.toolbar__status` + `[data-state="error"]`
  - `.toolbar__hint--pill`（测试音乐库/预设合集等）
  - `#visual-favorite-count`（可点击 pill）

规则：

- error：用 `--nw-danger`，但别整块大红；优先文字/边框
- ok：可微弱用 `--nw-ok`

### 5.9 Floating Panel（Favorites / Diagnostics）

Figma 组件：`NW/Panel`

- 映射：`.nw-panel` + `--favorites` / `--diagnostics`
- 子组件：header（title + close），body，list item

Favorites 列表项：

- `.nw-fav-item`（标题行 + actions 行）
- `.nw-fav-item__label`（最重要）
- `.nw-fav-item__time`（弱化）

Diagnostics：

- 只读 overlay；保持 `pointer-events: none`
- 等宽、对齐、字段可扫读

---

## 6. Inspector（高级参数）的“列表化 UI”规格（本项目最关键）

### 6.1 结构现实（必须按这套来）

来源：`src/app/bootstrap.ts` 的 `renderInspector()`

- 容器：`#inspector-container.toolbar__inspector-container`
- 每个组：外层 `.toolbar__row`（inline: column） + 一个 `.toolbar__subtitle` + 多条参数 row
- 参数行：`.toolbar__row[data-scope][data-key]`
- 控件角色：
  - `[data-role="number-range"]` + `[data-role="number-input"]`
  - `[data-role="enum-select"]`
  - `[data-role="bool-toggle"]`
  - `[data-role="string-input"]`
  - `[data-role="reset-param"]`

### 6.2 设计目标（可扫读、可对齐、可批量操作）

- 组标题像“段落标题”，与组内容有明显层级
- 每一行参数视觉结构固定：
  1. Key（参数名）
  2. 控件区（range/select/switch/input）
  3. Reset（弱化，但可点）

### 6.3 对齐规则（Figma 需要出 redline）

- Key 列：视觉上对齐（建议固定最小宽度概念）
- 控件列：占主要宽度
- Reset：固定靠右，不抢主视觉

> 注意：DOM 当前用 flex + wrap；CSS 需要用更具体选择器在不改 DOM 情况下做到“像表格一样整齐”。

---

## 7. 交互状态规范（必须在 Figma 中完整画出）

对以下组件至少画出：`default/hover/active/focus-visible/disabled`：

- Button / Select / TextInput / NumberInput / SwitchPill

细则：

- focus-visible：统一 2px 外描边，颜色 `var(--nw-accent)`，不要浏览器默认 outline
- hover：只做轻量增强（背景/边框），避免“闪瞎”
- active：轻微按压（1px translateY）
- disabled：降低 opacity + `cursor:not-allowed`

---

## 8. Figma 交付物清单（你要 Figma 给开发什么）

1. 一页 `Tokens`：列出本项目允许的 token（第 3 节）
2. 一页 `Components (NW/*)`：第 5 节组件全量 + states
3. 一页 `Toolbar Layout`：展示 6 个 section 卡片的排版规则（自适应网格）
4. 一页 `Inspector`：至少 2 个组（number/enum/bool/string 各一）+ reset 行为视觉
5. 一页 `Panels`：Favorites + Diagnostics 视觉规范
6. 一段“给 FigmaAI 的 prompt”：

   - 输出 CSS 追加块
   - 只用现有 token
   - 只用现有选择器（id/class/data-role）

7. 一页 `Data Contracts (UI)`：把 Debug UI 会展示/编辑的字段列清楚（见第 11 节）。

---

## 9. 选择器映射速查表（交付给 FigmaAI / 开发直接用）

- Toolbar 容器：`.toolbar` / `.toolbar__grid` / `.toolbar__section` / `.toolbar__row`
- Button：`.toolbar__button` / `.toolbar__button--compact`
- Select：`.toolbar__select` / `.toolbar__select--compact`
- 输入：`.toolbar__input` / `.toolbar__url input` / `.toolbar__interval input`
- Switch：`.toolbar__switch` + 内部 `input`
- 电平：`.toolbar__meter` / `#audio-level-bar` / `#audio-level-text`
- Inspector：`#inspector-container .toolbar__row[data-scope]` + `[data-role="..."]`
- Macro slots：`#macro-slots .toolbar__row[data-slot-id]` + `[data-role="..."]`
- Favorites：`.nw-panel--favorites` + `.nw-fav-*` + `.nw-btn*`
- Diagnostics：`.nw-panel--diagnostics`

---

## 10. 不做的事（再次强调，避免设计跑偏）

- 不把 toolbar 改成侧边栏
- 不新增新的页面/弹窗/复杂动效
- 不引入 Tailwind/Radix/shadcn
- 不改变任何文案/功能语义

---

## 11. 数据接口附录（给 Figma/设计理解 UI“显示什么/编辑什么”）

> 说明：这部分不是让设计画“后端 API”，而是让设计知道：哪些字段存在、哪些是稳定信号、哪些状态必须被 UI 表达。
> 权威专题：`DATA_INTERFACES.zh.md`（本节为“UI 摘要版”，便于 Figma 快速理解）。

### 11.1 音频：`AudioFrame`（UI 与视觉共用的唯一音频帧）

来源：`src/types/audioFrame.ts`（由 `AudioBus` 产出）

```ts
export type AudioFrame = {
  version: 1;
  timeSec: number;
  sampleRate: number;
  pcm2048Mono: Float32Array;
  pcm512Mono: Float32Array;
  pcm512StereoLR: { left: Float32Array; right: Float32Array };
  bands: { low: number; mid: number; high: number };
  rms: number;
  peak: number;
  energyRaw?: number;
  energy: number; // 0..1
  isSilent: boolean;
};
```

对 UI 的意义（设计要表达的点）：

- `energy`：当前“统一控制信号”（0..1），用于电平条、音频响应感知。
- `energyRaw`：诊断用原始值（可能不存在），用于“平滑是否开启/是否过度压缩”的排障。
- `bands`/`rms`/`peak`：用于更细粒度的诊断与调参（例如高频/低频对视觉的影响）。

### 11.2 运行状态：Diagnostics（UI 只读浮层）

实现：`src/features/console/DiagnosticsPanel.ts`

它显示 4 段信息：

- AudioContext：
  - `state` / `ready` / `playing`
  - `source`（track/stream 等）
  - `streamStatus`（Mixxx 流状态）
  - `inputLabel`（输入设备 label）
  - `backgroundType/backgroundStatus`
- AudioFrame：`energy / energyRaw / rms / peak / isSilent`
- ProjectM：来自 `globalThis.__projectm_verify` 的快照（例如 `initialized / framesRendered / lastAudioRms / lastAudioPeak / aborted / abortReason`，以及启用时的 `avgLuma*` 字段）
- Renderer：`dpr / outputColorSpace / toneMapping`

设计要求：Diagnostics 是“舞台健康仪表盘”——信息密度高但要**可扫读**（字段对齐、次要字段弱化、错误字段可见）。

### 11.3 视觉状态：`VisualStateV2`（收藏/恢复/Show 的核心数据结构）

来源：`src/features/visualState/visualStateStore.ts`

```ts
export type VisualStateV2 = {
  version: 2;
  global: {
    seed: number;
    macros: Record<"fusion" | "motion" | "sparkle", number>; // 0..1
    macroSlots: {
      id: string;
      label: string;
      value: number;
      randomize: boolean;
      pinned?: boolean;
    }[];
  };
  background: {
    type: "liquid" | "camera" | "video";
    params: Record<string, unknown>; // schema-driven
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

对 UI 的意义：

- 你看到的所有“可调参/可恢复”的东西，最终都要能落到 VisualState（否则收藏/恢复会漂）。
- Inspector 的参数列表来自 schema；UI 本质是“编辑 VisualState 的一部分”。

### 11.4 收藏：`FavoriteVisualState`（Favorites 面板列表项）

来源：`src/features/visualState/visualStateStore.ts`

```ts
export type FavoriteVisualState = {
  id: string;
  createdAt: string;
  label: string | null;
  state: VisualStateV2;
};
```

对 UI 的意义（Favorites 面板）：

- `label`：主标题（最重要、要突出）
- `createdAt`：次要信息（弱化）

### 11.5 参数 Schema：`ParamDef`（Inspector 自动生成的根源）

来源：`src/state/paramSchema.ts` 与 `src/background/backgroundRegistry.ts`

```ts
export type ParamDef =
  | {
      kind: "number";
      key: string;
      group: string;
      min: number;
      max: number;
      step?: number;
      default: number;
      advanced?: boolean;
      random?: boolean;
    }
  | {
      kind: "enum";
      key: string;
      group: string;
      values: readonly string[];
      default: string;
      advanced?: boolean;
      random?: boolean;
    }
  | {
      kind: "bool";
      key: string;
      group: string;
      default: boolean;
      advanced?: boolean;
      random?: boolean;
    }
  | {
      kind: "string";
      key: string;
      group: string;
      default: string;
      placeholder?: string;
      advanced?: boolean;
      random?: boolean;
    };
```

对 UI 的意义：

- `group` 决定 inspector 分组标题
- `advanced` 决定 “显示高级” 是否可见
- `random` 决定 Random 是否会影响该参数（UI 可在未来用视觉提示表达“会被 Random 改动”）

### 11.6 MIDI 绑定：`SettingsV1` / `MidiBinding`（MIDI 面板显示与编辑的对象）

来源：`src/features/settings/settingsStore.ts`

```ts
export type MidiBindingTarget =
  | { kind: "macro"; key: "fusion" | "motion" | "sparkle" }
  | { kind: "slot"; slotId: string }
  | { kind: "param"; key: string };

export type MidiBinding = {
  id: string;
  target: MidiBindingTarget;
  deviceId?: string;
  deviceName?: string;
  channel?: number; // 0..15
  cc?: number; // 0..127
  min?: number; // default 0
  max?: number; // default 1
  curve?: "linear" | "exp" | "log";
};

export type SettingsV1 = {
  version: 1;
  midi: { bindings: MidiBinding[] };
};
```

对 UI 的意义：

- MIDI 目标下拉展示的本质是“可绑定 target 的列表”；绑定条目最终写入 localStorage。

### 11.7 LocalStorage 合约（UI 需要理解“持久化什么”）

在 `src/app/bootstrap.ts` 与 settings/favorites store 中出现的 key：

- Favorites：`newliveweb:favorites:v2`（兼容迁移：`newliveweb:favorites:v1`）
- Settings（MIDI）：`newliveweb:settings:v1`
- 音频偏好：
  - `newliveweb:audio:preferredSource`（track/input）
  - `newliveweb:audio:inputDeviceId`
  - `newliveweb:audio:mixxxUrl`

对设计的价值：

- 这些 key 对应的 UI 都是“可恢复”的，因此视觉上要让用户知道“当前状态会被记住”。

### 11.8 背景系统：`BackgroundRegistry`（Background Type 与 Params 的运行时入口）

来源：`src/background/backgroundRegistry.ts`

```ts
export type BackgroundType = "liquid" | "camera" | "video";

export type BackgroundRegistry = {
  setActive: (type: BackgroundType) => void;
  getActiveType: () => BackgroundType;
  applyParams: (type: BackgroundType, params: Record<string, unknown>) => void;
  getParamDefs: (type: BackgroundType) => readonly ParamDef[];
  getActiveParamDefs: () => readonly ParamDef[];
};
```

对 UI 的意义：

- “Background Type” 的下拉只会在这三个枚举里切换。
- “Background Params” 的 Inspector 必须完全 schema-driven（否则不同 background 的 params 会互相污染）。

### 11.9 渲染层：`Layer`（SceneManager 管的可视化层接口）

来源：`src/layers/Layer.ts`

```ts
export interface Layer {
  init(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void | Promise<void>;
  update(deltaTime: number): void;
  dispose(): void;
  onResize?(width: number, height: number): void;
  setEnabled?(enabled: boolean): void;
}
```

对 UI 的意义：

- UI 的“切换/禁用某类背景”最终都会落到 `setEnabled`。

### 11.10 Mixxx：`MixxxSnapshot`（stream 连接状态的快照）

来源：`src/app/bindings/mixxxConnector.ts`

```ts
export type MixxxConnState = "idle" | "connecting" | "connected" | "error";

export type MixxxSnapshot = {
  state: MixxxConnState;
  url: string | null;
  lastErrorName: string | null;
  retries: number;
};
```

对 UI 的意义：

- `state` 决定“当前 Audio 状态文案/颜色语义”。
- `retries/lastErrorName` 只属于诊断层级（弱化显示，但必须可见）。

---

## 附：相关参考文档

- 样式输出 brief（短版）：`DEBUG_UI_FIGMAAI_BRIEF.zh.md`
- AI/自动化样式接口（可选）：`DEBUG_UI_AI_INTERFACE.zh.md`
- 开发交接/数据链路：`DEBUG_UI_DEV_HANDOFF.zh.md`
- 样式来源：`src/style.css`
- UI 模板：`src/app/renderShell.ts`
- Inspector 渲染：`src/app/bootstrap.ts`
---

## 2025-12-24 对齐补充（音频 localStorage key）

- 现行 key：`nw.audio.preferredSource` / `nw.audio.inputDeviceId` / `nw.audio.trackVolume` / `nw.audio.mixxxUrl`
- 旧 key `newliveweb:audio:*` 会在启动时迁移写入（代码侧兼容）。
