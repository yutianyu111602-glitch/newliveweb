# Debug UI 视觉规范（FigmaAI 输出：纯样式 / 不改逻辑）

> 目标：把 newliveweb 的“调试 UI / 参数面板 / 收藏夹 / 诊断信息”做成舞台可用的深色控制台风格：
>
> - 信息层级清晰（状态/错误/关键开关更显眼）
> - 操作可预期（hover/focus/disabled 一致）
> - 密度合理（同屏信息更多但不拥挤）
> - **只输出 CSS/样式**：不新增页面、不改 DOM 结构、不改 JS 逻辑

---

## 0. 约束（必须遵守）

1. 不新增交互逻辑、不改事件绑定、不引入组件库。
2. 不新增主题/字体/阴影系统：只能使用现有 `src/style.css` 的变量/基调。
3. 不改变布局语义（仍是上方 toolbar + 下方 canvas；浮层面板仍为 fixed）。
4. 样式落点必须能直接映射到现有选择器（见第 2 节）。

现有样式入口：`src/style.css`
现有 DOM 结构：`src/app/renderShell.ts`
动态 inspector HTML：`src/app/bootstrap.ts` 内 `renderInspector()`

---

## 1. 设计语言（Design Language）

### 1.1 视觉基调

- 深色半透明面板（避免遮挡画面，但确保可读性）
- 小字号高密度（12px 基准），但：
  - 标题/分组更突出
  - 状态/错误更醒目
  - 关键按钮有明确的 hover/active/focus

### 1.2 颜色与 Token（必须复用现有变量）

仅允许使用以下现有 token：

- `--nw-accent`（高亮/焦点/强调）
- `--nw-ok`（正常/启用）
- `--nw-danger`（错误/危险）
- `--nw-border`（边框）
- `--nw-surface` / `--nw-surface-strong`（面板底）
- `--nw-input-bg` / `--nw-input-border`（输入控件）

若需要“弱文字/强文字/分隔线”的一致性：用透明度（opacity）而不是新增颜色。

### 1.3 排版与间距

- 基准字号：12px（toolbar 现状）
- 行高：1.35~1.5
- 间距节奏（建议）：8px / 12px / 16px
- 圆角：4px（控件）/ 10px（section 卡片、浮层 panel）保持一致

---

## 2. 必须覆盖的 UI 区域与选择器映射

### 2.1 顶部 Toolbar（整体）

- 根容器：`.toolbar`、`.toolbar__grid`、`.toolbar__section`、`.toolbar__section-header`、`.toolbar__row`
- 标题与副标题：`.toolbar__title`、`.toolbar__subtitle`
- 状态文本：`.toolbar__status`（以及 `data-state="error"`）

### 2.2 基础控件（通用）

- Button：`.toolbar__button`、`.toolbar__button--compact`
- Select：`.toolbar__select`、`.toolbar__select--compact`（下拉 option 已修复为深色）
- Input：`.toolbar__input`、`.toolbar__url input`、`.toolbar__interval input`
- Switch：`.toolbar__switch` + 内部 `input[type="checkbox"]`
- Slider：`.toolbar__volume input[type="range"]`

### 2.3 Audio 电平

- Meter 容器：`.toolbar__meter`
- Meter bar：`.toolbar__meter-bar`
- 文本：`#audio-level-text`

### 2.4 高级参数 Inspector（动态渲染）

- 容器：`#inspector-container.toolbar__inspector-container`
- 行：`#inspector-container .toolbar__row[data-scope]`
- 角色选择器（可用于更精细的样式落点）：
  - `[data-role="number-range"]`, `[data-role="number-input"]`
  - `[data-role="enum-select"]`
  - `[data-role="bool-toggle"]`
  - `[data-role="string-input"]`
  - `[data-role="reset-param"]`

### 2.5 宏变量 MacroSlots（动态渲染）

- 容器：`#macro-slots.toolbar__macro-slots`
- 行：`#macro-slots .toolbar__row[data-slot-id]`
- 角色：`[data-role="slot-label"|"slot-value"|"slot-randomize"|"slot-pinned"]`

### 2.6 浮层面板（Favorites / Diagnostics）

- Panel：`.nw-panel`、`.nw-panel__header`、`.nw-panel__title`、`.nw-panel__close`
- Favorites：`.nw-panel--favorites`、`.nw-fav-item*`、`.nw-btn*`
- Diagnostics：`.nw-panel--diagnostics`（当前 `pointer-events:none`，只读显示）

---

## 3. 组件级样式目标（FigmaAI 输出要做到什么）

### 3.1 Section 卡片（`.toolbar__section`）

- 让每个 section 更像“模块卡片”：
  - Header 与内容之间分割更清晰
  - 内容区多行时可读性更强（行间距/对齐）
- 要求：不改变 grid 行为（仍 auto-fit）

### 3.2 Button（`.toolbar__button`）

- 目标：看起来像“控制台按钮”，一致的 hover/active/focus/disabled
- 建议（只描述效果，具体 CSS 由 FigmaAI 输出）：
  - hover：背景更亮、边框略偏 `--nw-accent`
  - active：轻微下压（现已有 transform on select；按钮也可一致）
  - focus-visible：清晰外描边（沿用 `--nw-accent`）

### 3.3 Input / Select

- 目标：输入类控件统一高度、统一圆角、统一边框与 focus ring
- Inspector 中：
  - number 的 range + number input 属于一组（视觉上应该“绑定”在一起）
  - string input 占满剩余宽度（当前有 inline style，CSS 需兼容）

### 3.4 Switch（`.toolbar__switch`）

- 目标：更像“状态胶囊”，checked 状态更明显
- 不改变内部结构（checkbox + span）

### 3.5 Inspector 分组

当前 `renderInspector()` 的分组是：

- 外层：`<div class="toolbar__row" style="flex-direction:column;...">`
- 标题：`<span class="toolbar__subtitle">GroupName</span>`
- 子项：若干 `.toolbar__row[data-scope]`

样式目标：

- 每个组像一个“可扫读的列表”
- 参数项对齐：
  - label（key）宽度一致
  - 控件区域对齐
  - reset 按钮位置固定且弱化（避免抢眼）

### 3.6 Favorites 面板（`.nw-panel--favorites`）

- 目标：更像“预设/场景库”，突出 label，弱化时间戳
- `.nw-btn--primary` `.nw-btn--danger` 视觉一致

### 3.7 Diagnostics 面板（`.nw-panel--diagnostics`）

- 目标：可读性更强，但仍保持“不会挡住画面”
- 约束：保持 `pointer-events:none`（避免影响舞台操作）
- 建议：
  - 标题/内容的对齐更规整
  - 关键字段（energy / source / bg）可以用轻量高亮（只用 opacity 与现有 token）

---

## 4. 状态规范（必须覆盖）

- Hover：所有可交互控件（button/select/input/switch）都有 hover
- Active：button/select 有按压反馈
- Focus-visible：统一的外描边（`--nw-accent`），不要用浏览器默认 outline
- Disabled：灰化且 `cursor:not-allowed`
- Error：
  - `#audio-status`、`#preset-status`、`#inspector-status` 采用 `data-state="error"`
  - `.toolbar__status[data-state="error"]` 已存在；需要让错误更显眼但不刺眼

---

## 5. FigmaAI 输出格式要求（给 FigmaAI 的指令）

请输出：

1. 一份“可直接粘贴到 `src/style.css` 尾部”的 CSS（只追加，不覆盖旧规则；使用更具体选择器覆盖）。
2. 不创建新的 className 依赖（除非是纯装饰且无需改 DOM）。
3. 只使用现有 CSS 变量（第 1.2 节）。

优先覆盖这些选择器：

- `.toolbar__section`, `.toolbar__section-header`, `.toolbar__row`
- `.toolbar__button`, `.toolbar__select`, `.toolbar__input`, `.toolbar__switch`
- `#inspector-container .toolbar__row[data-scope]` + `[data-role="..."]`
- `#macro-slots .toolbar__row[data-slot-id]` + `[data-role="..."]`
- `.nw-panel*`, `.nw-fav-*`, `.nw-btn*`

---

## 6. 不在本轮做的事（防止越界）

- 不做布局重排（例如把 toolbar 变成侧边栏）
- 不新增新的面板/页面
- 不加入动画/过渡体系（已有少量 transition 足够；可尊重 `prefers-reduced-motion`）
- 不引入 Tailwind/Radix/shadcn（Shader Reminder 仅作为视觉参考）
