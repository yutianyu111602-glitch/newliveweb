# Inspector UI 重构规范（Ableton Live 插件风）

目标：只做 UI 层的布局/位置/尺寸/分组重构，不改动任何音频/AIVJ/渲染/参数路由后端逻辑。

## 0. 权威接口与文档来源

- 参数接口/路由总览（以代码为准）：
  - `paramSchema`：`src/state/paramSchema.ts`
  - Inspector 渲染与 patch 路由：`src/app/controllers/inspectorController.ts`
  - patch 落地：`src/app/bootstrap.ts`
- 推荐阅读（本仓库已有）：
  - `docs/reports/PARAM_ROUTING_REPORT.zh.md`
  - `docs/DATA_INTERFACES.zh.md`

## 1. 信息架构（IA）：模块与分组

Inspector 的信息组织应当遵循“信号源 → 调制 → 合成 → 输出”的心智模型，并贴合现有 scope 路由：

1. 推荐（Recommended）

- 顶部固定区，展示当前最可能需要的 10 个参数（现有逻辑已按 score 计算）。

2. Audio

- BeatTempo（`Audio/BeatTempo` → `audio.beatTempo`）：节拍推断与稳定性。
- Controls（`Audio/Controls` → `audio.controls`）：音频到宏的混合/平滑/权重。
- Overlay Budget（`Audio/Controls/OverlayBudget`，仍属于 `audio.controls`）：多层合成策略（预算、优先级、PM retreat）。
  - 这组参数必须在默认视图可见（不要求开启“高级”），因为它直接决定画面多层叠加的“策略”。

3. ProjectM

- Blend（`ProjectM/Blend` → `projectm.blend`）：输出主层的混合/透明度/音频驱动。

4. Background

- Type（`Background/Type` → `background.type`）：当前 focus layer。
- Layers（`Background/*` → `background.layer.*`）：liquid/basic/camera/video/depth 各自参数。

说明：本规范不改变 `scope` 映射规则，只对 UI 结构与布局进行重排。

## 2. 交互与布局约束（不改变风格与颜色）

### 2.1 总体布局

- Inspector 容器必须使用统一的布局 class：`toolbar__inspector-container`
- 禁止使用绝对定位来摆放单个参数行；参数行应由 grid/flex 自适应排布。

### 2.2 参数行（Param Row）尺寸标准

每个参数行固定为“左信息 + 右操作”的两列：

- Row Grid：`grid-template-columns: 1fr auto`
- 右侧只放 Reset 按钮（保持与现有视觉一致）。

Number 参数行（slider + number）：

- Label Grid：`140px | 1fr | 86px`
  - key：140px（截断/省略，不换行）
  - slider：自适应
  - number：86px，右对齐，tabular 数字

Enum/String 参数行：

- Label Grid：`140px | 1fr`

Bool 参数行：

- key 文本占 140px，开关在右侧。

### 2.3 分组（Group）容器

- 使用专用 wrapper：`.toolbar__inspector-group`
- Group 内垂直排列：`flex-direction: column; gap: var(--nw-space-sm)`
- 不复用 `.toolbar__row` 作为分组容器（避免嵌套 row 样式冲突，导致元素重叠/互相遮挡）。

## 3. Overlay Budget（多层合成策略）专门规范

Overlay Budget 这组参数与其它 Audio/Controls 不同：它不是“单层参数”，而是“合成调度策略”。

推荐在 Inspector 中显示为单独分组，并按决策链排序。

实现约束（已落地）：

- 外层 Group 标题仍为 `Audio/Controls/OverlayBudget`（来自 `def.group`），不改 scope/路由。
- Group 内使用子分组 wrapper：`.toolbar__inspector-subgroup`。
- 每个子分组的标题使用现有 `.toolbar__subtitle`，标题文案为英文固定值（与当前实现保持一致）：
  - `Budget`
  - `Depth Influence`
  - `Priorities`
  - `ProjectM Retreat`
  - `Other`（仅当出现未列入下方固定清单的新 key 时自动出现）

1. Budget

- `overlayBudgetMaxEnergy`（预算上限）
- `overlayBudgetMinScale`（最低缩放）
- `overlayBudgetSmoothBaseMs`（平滑基准）

2. Depth Influence

- `overlayBudgetDepthWeight`（depth 权重）

3. Priorities

- `overlayBudgetPriorityBasic`
- `overlayBudgetPriorityCamera`
- `overlayBudgetPriorityVideo`
- `overlayBudgetPriorityDepth`

4. ProjectM Retreat

- `overlayBudgetPmRetreatStrength`
- `overlayBudgetPmRetreatFloor`

说明：只调整显示位置与分组标题，不修改这些参数的实际消费逻辑。

## 4. 验收标准（避免图中“明显干涉”）

- 任何窗口宽度 ≥ 320px 时：
  - 参数行内部不重叠、不遮挡；Reset 按钮不覆盖 slider/文本。
  - Group 标题不会覆盖参数行。
- Inspector 开启/关闭不会导致其它 toolbar section 内容跳动异常。
- `npm run verify:headless` 的 `userFlow` 与 `favoritesCompare` 保持通过。
