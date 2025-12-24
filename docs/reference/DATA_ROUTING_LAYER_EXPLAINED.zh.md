# newliveweb 数据路由层（深入浅出：人话版 + 工程版）

这份文档想回答一个问题：在 newliveweb 里，**“一切输入（UI/MIDI/音频/摄像头/AI）是怎么变成最终画面里每一层的具体效果的？”**

如果你要看“参数字段全集 + 分组清单”，看旧文档：
- `docs/reports/PARAM_ROUTING_REPORT.zh.md`
- `docs/reports/PARAM_ROUTING_REPORT.local.zh.md`

如果你想在运行时“看见系统正在做什么决策”，看可视化叠加层（顶层）：
- `src/features/decisionTopology/DecisionTopologyOverlay.ts`

---

## 1) 人话版：把它想成“模块合成器的 patch bay（插线板）”

你可以把整个系统想成一个实时 VJ 合成器：

- **输入**：你拧旋钮（Inspector/MIDI）、音频能量/节拍、摄像头画面/深度、preset、AI 随机策略……
- **路由层（本质）**：把这些输入“翻译 + 分流”，写进正确的地方，并且避免互相打架。
- **输出**：ProjectM / Liquid / Camera / Depth / Video 等 layer 叠在一起渲染出最终画面。

一句话定义“数据路由层”：

`source（信号从哪来） -> router（如何解释/分流） -> writer（谁负责写） -> sink（哪里真正生效）`

你调一个参数没有生效，基本只可能卡在这四段的某一段。

---

## 2) 先分清 3 种“数据”，否则一定排错地狱

很多东西都叫“参数”，但生命周期完全不同。newliveweb 里最重要的是先分清：

### A. 可保存/可复现（慢层）：`VisualStateV2`

这是一切“Show 保存/收藏/下次打开能复现”的权威来源。

- 典型内容：背景类型、各 layer 的参数、ProjectM blend、宏（macros/slots）等
- 代码入口：`src/features/visualState/visualStateStore.ts`

经验法则：你希望“保存后还能复现”的东西，应该落在 `VisualStateV2`（或至少能从它推导）。

### B. 运行时信号（快层）：`AudioFrame` / Camera / Depth status

这些是“每帧都在变”的测量值，不应当保存进 show 配置。

- `AudioFrame`：`src/types/audioFrame.ts`
- 摄像头/深度：各自 layer 维护状态（例如 `src/layers/CameraLayer.ts`、`src/layers/DepthLayer.ts` 的 `getStatus()`）

经验法则：它们是“测量结果”，不是“配置”，不要直接写进 `VisualStateV2`。

### C. 派生决策（快层）：AIVJ / AudioControls / overlayBudget / 3D coupling / 闭环

这些是“根据运行时信号算出来的控制量”，通常 runtime-only，但必须可观测（否则你不知道系统为何这样表现）。

核心汇聚点在：`src/app/bootstrap.ts`

---

## 3) 这项目里，路由层的“字典”是什么：`paramSchema`

`src/state/paramSchema.ts` 是系统的“参数字典”（给 Inspector/MIDI/推荐分组/默认值/范围等用）。

它回答的问题主要是：
- 有哪些参数（key）？
- 每个参数属于哪个组（group）？
- 范围/默认值/步进/是否 advanced？

它不回答的问题是：
- 参数最终怎么生效？（生效链路在 controller/bootstrap/layer 的消费代码里）

---

## 4) 主干路由 1：UI / Inspector / MIDI -> patch -> 写入正确的 writer

通俗说法：你在 UI 拧一下，系统会先把它变成一个“小补丁对象 patch”，然后按 scope 分流到不同 writer。

关键实现（读这个你就知道“写到哪儿去了”）：
- Inspector 的 scope 映射：`src/app/controllers/inspectorController.ts`（`getScopeForDef` 用 `group.startsWith(...)` 决定 scope）
- patch 具体怎么应用：`src/app/bootstrap.ts`（`initInspectorController({ applyInspectorPatch })`）

这里的核心取舍只有一个：**这个 patch 要不要持久化？**

- 要持久化：写回 `VisualStateV2`（或至少更新 lastVisualState 以便保存）
- 不持久化：写到 runtime-only 模块配置（例如 BeatTempo、AudioControls、overlayBudget 等）

---

## 5) 主干路由 2：音频 -> BeatTempo / AudioControls -> AIVJ -> MacroBank -> 各层参数

这条链路是“自动 VJ”的发动机，目标是：**把音频变成可控的“宏驱动向量”**，再把宏落到每个 layer 的具体参数上。

你可以按这条顺序理解：

1. **AudioBus（统一音频源）**：产出 `AudioFrame`
2. **BeatTempo**：从 PCM/能量里估计 bpm、beatPulse 等（“节拍时钟”）
3. **AudioControls**：把音频特征合成几个可用的宏驱动（例如 fusion/motion/sparkle 这类）
4. **AIVJ（Unified）**：融合“手动宏 + AudioControls + AI profile”，输出 `MacroBank`
5. **applyMacroBankToRuntime**：把 `MacroBank` 写进真正生效的 runtime 参数（在 `src/app/bootstrap.ts`）

当你感觉“AI 决策没生效/音频驱动不跟拍”，优先沿这条链路逐段确认输入/输出是否合理。

---

## 6) 主干路由 3：overlayBudget（避免“过亮/过暗/漆黑一片”）

overlayBudget 的目标不是“炫”，而是“稳”：在多层叠加时动态算出一个 **overlay 预算**，让画面不至于炸白/死黑，同时还能给 ProjectM 留出呼吸空间（retreat）。

实现集中在：`src/app/bootstrap.ts`（含平滑、scale、meanOverlayMul、pmTarget 等诊断字段）。

排错方式（最有效的那种）：
- 先确认“是不是预算把它压下去了”（meanOverlayMul / pmTarget）
- 再确认“是不是某一层本身参数就让它黑掉/白掉”

---

## 7) 主干路由 4：Camera/Depth -> 3D coupling -> ProjectM externalOpacityDrive

如果你觉得“摄像头很无聊、像普通画面、跟其他层没耦合”，通常缺的不是“更复杂的 shader”，而是：

1) 摄像头/深度状态有没有稳定产出（status 是否 fresh）  
2) 这些信号有没有进入“耦合器”（3D coupling）  
3) 耦合器有没有把结果写到一个大家都能用的 knob（例如 ProjectM 的 `externalOpacityDrive`）  

这条链路的目的：让 Camera/Depth 变成“驱动信号”，而不只是“背景素材”。

---

## 8) 闭环：ProjectM 输出采样 -> 反向调制（ClosedLoop / ColorLoop）

闭环的意思是：系统不只看输入（音频/摄像头），也看“自己当前输出长啥样”（比如 avgLuma/avgColor），然后反向调制，避免长期偏黑/偏白/偏单色。

这类逻辑通常也在 `src/app/bootstrap.ts` 附近汇聚（作为 runtime-only 调制器），并且应该暴露诊断值，否则调参会像盲飞。

---

## 9) 两条硬规则（决定你以后会不会“参数打架”）

### 规则 1：Single Writer（每个可控量要有唯一写入者）

一个参数如果同时被：
- UI 写
- MIDI 写
- AudioControls 写
- AIVJ 写
- overlayBudget 再乘一遍

最后一定会出现“我明明调了但立刻又被改回去”的打架现象。

正确做法：把其他来源变成“输入信号”，统一收敛到一个 writer（比如宏 -> applyMacroBankToRuntime），并且通过可观测层显示“当前是谁在写、写了多少”。

### 规则 2：先定生命周期，再定存放位置

新增一个参数前先回答：
- 它需要保存复现吗？（是 -> `VisualStateV2`）
- 它是每帧测量值吗？（是 -> runtime signal）
- 它是从信号算出来的决策吗？（是 -> runtime decision，并必须可观测）

---

## 10) “dataflow audit” 是什么意思（你刚刚跑出来的那个）

你看到的 `artifacts/audit/dataflow-inspector-groups.md` 大意是：**paramSchema 的分组，Inspector 是否都覆盖到了**。

它统计了三件事：

- `Groups found in paramSchema`：`paramSchema.ts` 里出现了多少个 `group`
- `Prefix rules found in inspectorController (startsWith)`：Inspector 用多少条 `group.startsWith(...)` 规则把 group 映射成 scope
- `Uncovered groups`：有没有某些 group 在 Inspector scope 映射里“找不到归属”（找不到就意味着这组参数很可能在 UI 里不易触达/不可调）

`Uncovered groups: 0` 的意思是：**目前 paramSchema 里的每个 group，都能被 Inspector 的 scope 规则覆盖到**（至少从“分组路由”层面是完整的）。

---

## 11) 最实用的排错清单（演出前用）

当你遇到“某个效果没反应 / 黑成一片 / 白到爆 / 摄像头无聊”时，按这个顺序排：

1. **它是慢层还是快层？**（要保存复现的东西别在 runtime-only 里找）
2. **谁是 writer？**（去 `bootstrap.ts`/相关 controller/layer 看最终写入点）
3. **输入信号有没有？**（AudioFrame / Camera/Depth status）
4. **是不是被预算/闭环压住了？**（overlayBudget / ClosedLoop 的诊断值）
5. **用可观测层确认**（DecisionTopologyOverlay / DiagnosticsPanel / audit 输出）


