# 本地落地报告：参数路由与统一绑定改造（newliveweb）

本文是 **本地运行 / 排错 / 改造用的落地版报告**，基于：

- `docs/reports/PARAM_ROUTING_REPORT.zh.md`（旧主报告｜更偏“地图/结构/接口”）
- 当前代码状态（更偏“明天演出先跑通/怎么调”）

你可以这样用这份文档：

- 只想“能用、能调出好画面”：看 **第 0、9、12.1 节（人话版）**，以及 `docs/reports/CAMERA_QUICKSTART.local.zh.md`
- 想排错、理解路由/参数体系：看 **第 1、8 节**，剩余细节去看旧主报告
- 想让 AI/自己以后改代码：看 **第 10–11、12.2–12.3 节（工程/约束版）**

> 编码说明：此文件应为 **UTF-8**。若某些终端/工具显示乱码，请强制按 UTF-8 打开（PowerShell 示例：`Get-Content -Encoding UTF8 docs/reports/PARAM_ROUTING_REPORT.local.zh.md`）。

---

## 0) 人话版：一分钟搞明白你在“拧什么”

### 0.1 你手上的几个“大旋钮”

- **三宏：`Fusion / Motion / Sparkle`**
  - Fusion：画面“有多满、多亮、多粘”。
  - Motion：画面“有多动、波纹多不多”。
  - Sparkle：画面“有多闪、多金属、多锐利/多彩色”。
- **背景层：`Liquid / Basic / Camera / Video / Depth`**
  - 通过 Background 的 focus type + 各层开关，决定谁是主角、谁在前面叠加。
- **音频驱动强度：`Audio/Controls.mixToMacros`**
  - 越大 → 音乐越“接管”三宏；
  - 越小 → 你手动拧宏越“说了算”。
- **自动 VJ（AIVJ）：开关 + profile**
  - 开启时，系统按节奏和 profile 慢慢推三宏 + slots；
  - 你手动动宏/slots 后会有几秒 “hand-hold”，AI 暂停抢手。
- **overlayBudget：多层叠加“挤座位”的规则**
  - 决定 Basic/Camera/Video/Depth 谁在前面、谁退后，
  - 决定 PM 在多层覆盖时要不要“往后缩一点”。

### 0.2 背后的思路（非常粗略，但够用）

把系统想成三层就够了：

1. **慢层：可保存的“姿势”**
   - `VisualStateV2` + AIVJ slow bank（决定整体风格/构图）。
2. **快层：跟着音乐/空间变化**
   - AudioControls、AIVJ accent、3D coupling、overlayBudget（决定“此刻怎么动/谁上前”）。
3. **呈现层：真正画出来的画面**
   - 三宏 + slots → ProjectM/Liquid/各背景层参数 → 多层混合。

一句话记忆：
**你只管三宏 + 背景层 + mixToMacros，系统会用这些再推一大堆细节参数。**

### 0.3 出问题怎么自查（人话版）

- **“有音乐但画面不跟着动”**
  - 检查 AudioControls 是否 enabled；
  - 检查 `mixToMacros` 是否太小（<0.2）；
  - 检查 BeatTempo 是否开启且 BPM 稳定（看 Diagnostics 的 Tempo/Conf）。
- **“AI 总是改掉我刚拧好的宏”**
  - 看是否处于 MIDI lock；
  - 看 AIVJ 是否开着；你手动拧宏/slots 后会有几秒 hand-hold（演出后再调长）。
- **“画面太黑/太亮，等于没效果”**
  - 检查 ProjectM opacity、Liquid brightness/contrast、Depth opacity 是否跑到极端；
  - 按 12.1 的“亮度巡查”跑一遍，把明显会黑屏/爆白的组合记下来，演出先绕开。
- **“摄像头画面太无聊，像普通直出”**
  - 先按 12.1.G 只通过“混合比例 + priority + 现有联动”让它至少与其它层有互动；
  - 摄像头的 1–2 套可用混合场景，直接抄 `docs/reports/CAMERA_QUICKSTART.local.zh.md`。

---

## 1) 核心结论（工程视角：路由与不变量）

- ✅ **唯一建议持久化的视觉抽象层：`VisualStateV2`**
  - Favorites/Show/URL 导入都应基于它：`src/features/visualState/visualStateStore.ts`
  - 像 `AudioFrame` 这种运行时信号不直接写入持久化状态。
- ✅ **参数字典的唯一来源：`paramSchema`**
  - Inspector/MIDI/随机的参数定义都来自：`src/state/paramSchema.ts`
  - 建议按 `group + key → scope + patch` 组织 UI 和路由（详见旧主报告）。
- ✅ **宏写入建议遵守“单 writer”**
  - 同一底层参数在同一时刻只允许一个写入者（Human/MIDI/AI/Runtime overlay…），避免互相打架。
- ✅ **慢层可存、快层只在内存**
  - 慢层：`VisualStateV2` + AIVJ slow bank（可保存/可复现）
  - 快层：AudioControls snapshot、accent、overlayBudget、3D coupling（runtime-only）

> 第 2–7 节的“结构地图/接口表/字段细节”，请直接看旧主报告：`docs/reports/PARAM_ROUTING_REPORT.zh.md`。

---

## 8) `Audio/Controls.mixToMacros` 的端到端路由示例（工程 + 使用兼顾）

以 `param:audio.controls.mixToMacros` 为例，从 Inspector/MIDI 到最终画面的链路（按现有代码逻辑概述）：

1. Inspector/MIDI 修改 → 进入 audio controls 的 patch（`bootstrap.ts` 的绑定链路）。
2. `audioControls.setConfig({ mixToMacros })` 更新配置。
3. 每帧：`audioControls.onAudioFrame(frame, nowMs)` 根据能量/频段输出 `fusion01/motion01/sparkle01` 等驱动量。
4. `UnifiedAivjController` 融合 AudioControls 与 AIVJ 输出宏 bank（AI bank + user bank + runtime 混合）。
5. 宏 bank 通过宏写入链路落到 ProjectM/Liquid/背景层参数（保持“单 writer”约束）。
6. overlayBudget/3D coupling 作为 runtime-only 的“层间调度/耦合”，不写回 `VisualStateV2`。

---

## 9) 演出快速调参配方（人话 + 可执行）

- 想要更明显的“层间调度感”（谁上前谁退后）：
  - 适度提高 `overlayBudget.maxEnergy`，让能量更多体现在层间调度，而不仅仅把 PM/Liquid 推得很亮。
- 想要更稳的 drone/ambient：
  - 使用 drone/ambient profile + `mixToMacros ≈ 0.3–0.5`；
  - 增大 releaseMs，让变化更慢；
  - 提高 depth priority + depthWeight；
  - 注意 PM opacity 不要长期低于 ~0.25，否则观感接近“黑屏”。
- 想要 peak rave：
  - 使用 peakRave profile + `mixToMacros ≈ 0.7–0.9`；
  - 提高 `overlayBudgetPriorityVideo/Camera`，让人像/视频有机会“压上来”；
  - 确保 BeatTempo 稳定；
  - 同时限制 Liquid brightness 在大约 0.7–1.6 的安全区，避免大面积爆白。

---

## 12) 短 / 中 / 长期路线图（包含摄像头 & 亮度的计划）

### 12.1 短期（演出前 1 天｜目标：稳定跑通，避免黑屏/爆白/无聊摄像头）

**A. 基础检查**

- 如未安装依赖：在项目根目录运行 `npm install`。
- 本地检查：`npm run verify:check`，确认构建/类型正常。
- 有时间的话：`npm run verify:headless`，看是否有明显错误。

**B. 音频 + BeatTempo + AudioControls**

- 在 Audio 模块中：
  - 选择一首接近演出风格的测试曲目；
  - 确认能量条/文本在动，数值合理。
- 打开 BeatTempo：观察 BPM 是否能稳定在合理范围（看 Diagnostics 的 Tempo/Conf）。
- 打开 AudioControls：
  - 先设 `mixToMacros ≈ 0.6`；
  - 暂时不要大改 attack/release，保持默认。

**C. AIVJ 行为（自动 + 手动）**

- 打开 AIVJ，选择 profile（ambient/peakRave 等）；
- 播放音乐，观察三宏是否随节奏缓慢变化；
- 手动拧宏/slots，确认：
  - 你操作后画面能稳定几秒（AI 不要马上抢回去）；
  - 不会出现“抖动/抽搐式变化”。

**D. 准备 2–3 个“安全场景”**

- 保存至少 2–3 个 Favorites/Show：
  - Ambient：Motion 较低、Fusion 中等、Sparkle 较低、PM opacity ≈ 0.5–0.7；
  - Peak：Fusion/Motion 较高、Sparkle 中等、PM opacity ≈ 0.7–0.9；
  - 视需要增加一个 Video/Depth 较明显的场景。
- 测试在这几个场景之间切换：三宏和背景层能正确恢复，没有奇怪的闪黑/闪白。

**E. 专门做一次“亮度巡查”（避免过黑/过亮）**

对每个安全场景，按三个层面大致检查：

- ProjectM：
  - 主动看强弱段落，避免 `opacity` 长时间低于 ~0.2；
  - 遇到本身就极暗的 preset，优先换 preset。
- LiquidMetal：
  - 检查 `brightness/contrast` 组合，避免长时间接近全黑/全白；
  - 如果 AudioControls 驱动造成 brightness 剧烈抖动，可以临时减小 `amountLiquid` 或缩小相关宏的作用范围。
- Depth/Overlay：
  - Depth opacity 不要低到“看不出来”（例如 <0.1）；
  - overlayBudget priority 不要极端偏向某一层，以免其它层“全被吃掉”。

**F. 熟悉“紧急开关”**

- 关闭 AIVJ：只保留手动宏 + AudioControls。
- 再关闭 AudioControls：完全手动模式。
- 关闭 Depth/Camera/Video，只保留 Liquid + PM（最安全的兜底）。
- 确认以上模式下都不会出现“完全看不见”的画面。

**G. 摄像头层的“快速不无聊化”（不改算法，只调耦合）**

当前 Camera 层已经接在混合管线里，但如果参数很保守，看起来会像“普通直出摄像头”。短期目标是在 **不改 TS 代码** 的前提下，让它至少和其它层有一点融合感：

- 先照抄 `docs/reports/CAMERA_QUICKSTART.local.zh.md` 调出 1–2 套可用混合场景；
- 再做轻量耦合（不改算法）：
  - Camera `opacity` 优先控制在 **0.3–0.6**，避免直接盖住 Liquid/PM；
  - 在 Inspector 中适度提高 `overlayBudgetPriorityCamera`，但不要远高于 Video/Depth；
  - 如果 UI 有 Camera→PM 的联动参数（例如 `cameraEdgeToPmAmount01` 一类），先用 0.2–0.4 的保守区间微调，观察“人移动时 PM 是否有轻微变化”。

> 短期只通过“混合比例 + priority + 现有联动”让摄像头不再完全直出；真正改算法放中长期。

### 12.2 中期（演出后 1–2 周｜目标：好用、好调、自动避免极端亮度）

- 整理 3–5 套“风格预设”（ambient/peakRave/drone/videoVJ…）：
  - 对每套预设，记录三宏默认值、AudioControls 配置、overlayBudget、Depth/Camera/Video 参数的习惯区间；
  - 特别标注“亮度安全区”和“容易黑屏/爆白的组合”，方便下次避坑。
- 在 Diagnostics 或 Inspector 中增加：
  - 整体亮度/对比度的简易指标；
  - overlayBudget multiplier、AIVJ owner 状态；
  - Camera/Depth 活跃度（帧率、portraitEdge/depthFresh 等）。
- 启动“单一宏 writer/owner + 曝光保护”的代码重构：
  - 参考旧主报告的约束，把宏 owner/融合模块收敛；
  - 设计 `clampVisualExposure(params)` 等统一的曝光安全函数，让所有 runtime 路径在进入 layer 前都经过同一套裁剪逻辑。

### 12.3 长期（1–3 个月｜目标：真正的大统一 AIVJ + 稳定曝光 + 有趣 Camera）

- 完成控制层 / 状态层 / 呈现层的彻底拆分，并为每层写清文档约束；
- 把宏、音频、空间（Camera/Depth）信号统一看作一个“控制空间”，通过 profile 描述不同风格；
- 在渲染链路末端增加一个“全局曝光/安全滤镜”层：
  - 监测整体亮度分布，自动对极暗/极亮的 preset/组合做轻微补偿；
  - 保证真正意义上的“全黑/全白”只在你刻意需要时才出现。
- 针对 Camera 层：
  - 设计更聪明的“人物/边缘/区域”驱动策略，让 Camera 既能和 PM/Liquid/Depth 有机耦合，又不过度依赖现场光线质量。

---

## 13) （可选）排错/观测性：Diagnostics 里要看什么

这一节的目标是：你在演出前排错时，能用 Diagnostics 快速判断“谁在写宏、BeatTempo 是否在工作、层间混合有没有把画面吃掉”。

- `Audio/Level/Energy`：确认音频链路在跑、能量值合理。
- `Tempo/Conf`：确认 BeatTempo 是否锁定（Tempo 有 bpm，Conf 非 0）。
- `AIVJ/Writer`：确认是否 AIVJ 在驱动宏，manualHold 是否正常。
- `Overlay`：确认 overlayBudget 的 multiplier 没把某层压成 0（极暗/全黑时优先看这里）。

---

## 14) 文档修复记录（本次）

- 发现问题：文件内容被错误重编码，出现 `U+FFFD`（替换符）且整篇被压成一行，导致 IDE/终端显示“乱码”。
- 已处理：重新写回为正常 UTF-8 Markdown 排版。
- 已备份：`docs/reports/PARAM_ROUTING_REPORT.local.zh.md.corrupt-*.bak`
