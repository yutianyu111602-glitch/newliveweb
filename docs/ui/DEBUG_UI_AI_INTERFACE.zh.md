# AI 对接指南 · Debug UI 智能化样式接口（纯样式 / 不改 DOM）

> 目标：让“自动化/AI/脚本”**只通过 CSS 变量、data-attributes、状态类**就能对 Debug UI 做智能化视觉反馈，不需要改 `renderShell.ts` 的 DOM 结构，也不要求改现有交互逻辑。
>
> 适用范围：`newliveweb/src/style.css` 的 UI（toolbar / inspector / macro slots / favorites / diagnostics）。

---

## 0. 约束（必须遵守）

1. **不改 DOM 结构**：不修改 `newliveweb/src/app/renderShell.ts` 的模板结构；inspector/macro slots 仍由 `newliveweb/src/app/bootstrap.ts` 动态渲染。
2. **不引入 UI 框架**：不引入 Tailwind/Radix/shadcn 等。
3. **样式入口唯一**：所有样式落地在 `newliveweb/src/style.css`（推荐“只追加覆盖”）。
4. **默认不改变现有外观**：这些 hook 只有在你显式设置变量/属性/类时才生效。

---

## 1. 推荐挂载点（与现有代码对齐）

这些选择器在当前代码里稳定存在：

- toolbar 根：`#toolbar.toolbar`
- 音频状态：`#audio-status`（`dataset.state = ok|error`，见 `newliveweb/src/app/bootstrap.ts` 的 `setStatus()`）
- 预设状态：`#preset-status`（会临时切 `dataset.state`）
- Inspector 状态：`#inspector-status`（会写入 `dataset.extra` 做 transient 文案）
- Inspector 容器：`#inspector-container.toolbar__inspector-container`（行：`.toolbar__row[data-scope][data-key]`）
- Macro slots：`#macro-slots .toolbar__row[data-slot-id]`（内部控件：`data-role="slot-*"`）
- Favorites：`#favorites-panel.nw-panel--favorites`
- Diagnostics：`#diagnostics-panel.nw-panel--diagnostics`

如果你想给“整个模块卡片”打状态（例如 Audio section 变红），推荐在运行时用：

```js
const section = document.querySelector('#audio-status')?.closest('.toolbar__section');
section?.classList.add('ai-error');
```

---

## 2. CSS 变量接口（AI/脚本可编程）

### 2.1 主题（只影响 UI，不影响 canvas）

写入位置：`document.documentElement`（`:root`）。

- `--ai-theme-hue`：0..360
- `--ai-theme-saturation`：百分比（如 `25%`）
- `--ai-theme-brightness`：百分比（如 `60%`，在 CSS 中按 HSL lightness 使用）

```js
const root = document.documentElement;
root.style.setProperty('--ai-theme-hue', '205');
root.style.setProperty('--ai-theme-saturation', '25%');
root.style.setProperty('--ai-theme-brightness', '60%');
```

> 重要：当前 `src/style.css` 里为了保持默认外观不变，只有在你显式开启时才会把 `--ai-*` 映射到 `--nw-accent`：
>
> ```js
> document.documentElement.setAttribute('data-ai-theme-dynamic', '1');
> ```
>
> 如果你不想用动态映射，也可以直接设置 `--nw-accent/--nw-accent-hover`（会立即影响现有 UI）。

### 2.2 音频响应（每帧更新可选）

变量（0..1）：

- `--ai-audio-intensity`
- `--ai-audio-bass`
- `--ai-audio-mid`
- `--ai-audio-treble`

```js
const root = document.documentElement;
root.style.setProperty('--ai-audio-intensity', String(frame.energy));
root.style.setProperty('--ai-audio-bass', String(frame.bands?.low ?? 0));
root.style.setProperty('--ai-audio-mid', String(frame.bands?.mid ?? 0));
root.style.setProperty('--ai-audio-treble', String(frame.bands?.high ?? 0));
```

### 2.3 毛玻璃强度（只影响 toolbar/panel）

- `--ai-blur-amount`：如 `40px`
- `--ai-blur-saturation`：如 `140%`

> 说明：当前 `src/style.css` 里 `--ai-blur-*` 主要用于 `.nw-panel` 的可选覆写（开启方式见 4 节的 `data-ai-glass="1"`）。如果你希望同时影响 `.toolbar` 的 blur，需要再追加一条针对 `.toolbar` 的选择器覆盖。

---

## 3. 状态类（语义化控制）

把这些 class 加在任意元素上即可触发样式（默认不改变现有逻辑）：

- `.ai-loading`：禁用交互 + 旋转加载指示（适合“连接中/加载中”）
- `.ai-success` / `.ai-warning` / `.ai-error`：语义化边框/底色提示
- `.ai-highlight`：轻高亮（引导注意力）
- `.ai-pulse`：脉冲（适合 warning/critical）
- `.ai-shake`：抖动（输入校验失败）
- `.ai-disabled` / `.ai-hidden`：禁用/隐藏（仅视觉层，不建议替代真实 disabled）

---

## 4. data-attributes（更细粒度的样式钩子）

这些属性可以由运行时脚本写入（不要求改 DOM 模板）：

- `data-ai-density="compact|normal|comfortable"`：UI 密度（建议挂 `document.body`）
- `data-ai-contrast="low|normal|high"`：UI 对比度（建议挂 `document.body`）
- `data-ai-theme="warm|cool|neutral"`：主题预设（建议挂 `document.body`）
- `data-ai-theme-dynamic="1"`：把 `--ai-theme-*` 动态映射到 `--nw-accent`（建议挂 `document.documentElement`）
- `data-ai-glass="1"`：启用可编程毛玻璃覆写（当前主要作用于 `.nw-panel`，建议挂 `document.body`）
- `data-ai-alert="message"`：在元素右上角显示临时徽标（适合“High CPU / disconnected”）
- `data-validation="valid|invalid|pending"`：输入校验反馈
- `data-param-changed="true"`：参数被修改提示（适合 inspector 行）
- `data-midi-bound="true"`：MIDI 绑定徽标（适合 inspector 行）

示例：

```js
document.body.setAttribute('data-ai-density', 'compact');
document.querySelector('#audio-status')?.setAttribute('data-ai-alert', 'Disconnected');
```

---

## 5. 与现有“真实状态”的对齐建议（不改逻辑也能先用）

当前代码已经提供的状态信号：

- `#audio-status.dataset.state = ok|error`（`setStatus()`）
- `#preset-status.dataset.state = ok|error`（Random 提示）
- `#inspector-status.dataset.extra = ...`（transient）
- Diagnostics 文本包含 `source=... stream=... bg=... bgStatus=...`（见 `newliveweb/src/features/console/DiagnosticsPanel.ts`）

想做更“语义化”的 data-attributes（例如 `data-connection-state="connecting"`）需要少量 JS 绑定（见 `newliveweb/src/app/bootstrap.ts` 的 `diagnosticsTicker`），建议作为 TODO 单独做。
