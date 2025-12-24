# 全局 UI 重构规范（newliveweb / layout-only）

目标：在不改主题色/风格、不改业务逻辑的前提下，统一各模块窗口的布局网格与溢出策略，确保 **320px+** 宽度下可用（不遮挡、不串栏、不把相邻模块挤坏）。

约束：

- 只做布局/结构/分组/排序/溢出策略；不改渲染/音频/AIVJ/参数消费逻辑。
- 不引入新的颜色/字体/阴影 token（复用现有 `--nw-*`）。
- DOM 改动以“加 class / 换容器布局方式（flex→grid）”为主，避免大规模改写结构。

---

## 1) 统一布局原则

- **模块内首选 grid**：当一行有 5+ 控件（按钮 + select + 状态）时，`flex-wrap` 容易产生错位/串栏，优先改为 `grid`。
- **所有子项必须可收缩**：模块容器与子元素均需要 `min-width: 0`，避免长文本/下拉框撑爆。
- **长文本优先换行而不是挤压**：状态/提示文本（binding、summary、manifest 等）独占一行并允许 `overflow-wrap:anywhere`。
- **按钮/选择器宽度可控**：窄宽度时允许 select/按钮占满 grid cell（`width:100%`），防止高度/基线错位。

---

## 2) 溢出策略（统一）

- 模块容器：保持现有 `toolbar__section`，不改视觉；内部内容如果需要滚动，采用“模块内部滚动”。
- 文本类：
  - 默认单行省略（`text-overflow: ellipsis`）用于 header/status。
  - 对“描述型长文本”：允许多行换行（`white-space: normal; overflow-wrap: anywhere`）并限制行高。
- 输入类：对特定模块覆盖 `min-width`（例如 MIDI target select），避免 320px 下溢出。

---

## 3) 分组与排序

- Inspector：以 `ParamDef.group` 为一级分组，组内按既定顺序（OverlayBudget 子分组固定顺序）。
- 其他模块：不引入新的业务分组，只做视觉层级（标题/副标题/独占行）。

---

## 4) 模块级落地（已执行/作为模板）

### MIDI（模板）

- 将 MIDI 控件行从 `flex` 改为 `grid` 容器：`.toolbar__midi-grid`。
- 使用 12 列网格并为关键控件分配跨度：
  - `#midi-connect` 3 列
  - `#midi-count` 1 列
  - `.toolbar__midi-target` 8 列（select 允许 shrink：覆盖 `.toolbar__select--compact{min-width:0}`）
  - Learn/Unbind/Clear 各 4 列，自动换行
  - `#midi-binding` 独占全行并允许换行

---

## 5) Headless 截图产物策略（验收必须可见）

- fullPage 截图经常看不到内部滚动容器的内容；因此每个主要模块必须有专用截图：
  - Inspector：`artifacts/headless/inspector-overlayBudget.png`
  - MIDI：`artifacts/headless/midi.png`
  - （后续补齐 Favorites / Diagnostics）

---

## 6) 验收标准（每个模块都要过）

- 320px 宽度下：
  - 控件不重叠、不遮挡相邻模块
  - select/按钮不会把容器撑出边框
  - 长文本不会导致横向滚动（除非该模块明确允许内部横向滚动）
- `npm run verify:check` 通过
- `npm run verify:headless` 通过，并产出模块专用截图
