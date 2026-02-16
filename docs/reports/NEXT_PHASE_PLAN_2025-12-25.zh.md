# newliveweb 下一阶段计划（稳定 · 高性能 · 超强音频驱动表现力）

> 日期：2025-12-25
>
> 目标：把音频链路的“稳定性/性能/表现力”统一到一套可执行路线图。
>
> 口径来源（已对齐）：
>
> - `audio-audit-report.md`：音频参数与结构盘点（字段/参数/模块划分）
> - `docs/reference/AUDIO_PIPELINE_AUDIT_2025-12-25.zh.md`：链路风险点、热路径、已落地修复与下一步 TODO
> - `docs/reports/AUDIO_DRIVE_ANALYSIS.zh.md`：音频驱动表现力分析（stageBands / accent / gate 等）
> - `docs/reports/PERF_OPTIMIZATION_LOG.local.md`：已落地的性能优化留痕（caps/load-shedding/diagnostics）
> - `MASTER_SPEC.zh.md`：不变约束（单一音频源、可观测验收等）

---

## 0) 约束与原则（必须遵守）

1. **单一音频源**：所有分析/分发只来自 `AudioBus` 的 `AudioFrame`，严禁第二套 energy/增益/平滑体系。
2. **节流语义要可解释**：时域/频域更新频率不同（典型：analysis 60fps、frequency 30fps），消费侧必须容忍“频域不每帧更新”。
3. **降级优先于崩溃**：任意 WASM 音频 API / 输入链路异常，都应自动回退到安全路径，不允许 abort loop。
4. **热路径零分配**：AudioBus/ProjectM 喂入/宏驱动的 per-frame 路径尽量做到“0 new、0 spread、0 临时数组”。
5. **可观测即契约**：Diagnostics + headless artifacts（以及控制台关键字段）是“真相源”，用来把问题分流到可定位原因。

---

## 1) 当前共同事实（两份审计结论的交集）

### 1.1 AudioFrame 信号分层（必须写进团队共识）

- **processed**：经过 inputGain/adaptiveGain 等链路后的信号（更适合视觉驱动稳定性）。
- **raw（best-effort）**：尽力在增益前采样（更适合 UI 电平/波形的“真实输入语义”与诊断对比）。
- **stage（舞台整形）**：面向“演出表现力”的可控整形（punchy/soft 等 profile），用于驱动宏/层联动，避免 flicker 与弱输入。

### 1.2 三个“统一驱动通道”（建议固定语义，不要漂移）

- `energy`：0..1 的统一强度（已含自适应归一），用于全局驱动与 opacity 增强。
- `bands(low/mid/high)`：三段能量（频域节流 30fps 时允许沿用上一帧）。
- `features`：techno-oriented 子带（kick/bass/clap/synth/hihat）+ `flux` 等瞬态/变化量。

---

## 2) 路线图（按优先级拆解）

> 说明：这里的“验收信号”优先选 **运行时可观测**（Diagnostics/日志/画面反应）。
> `verify:*` 可以作为“固化证据”，但不把“跑脚本”当作任务本体。

### P0（本周）：稳定性封顶（演出级“不崩、不挂、不抖”）

1. **输入/AudioContext 解锁链路稳定化**

- 目标：`Use input / Use system / Load track` 任何入口都能在 1–2s 内稳定产出电平/波形/能量。
- 关注点：用户交互触发 `AudioContext.resume()` 的时机一致；失败态明确可见（权限/设备/共享失败）。
- 验收信号：
  - UI：波形持续刷新，`Level/Energy` 动态；`BPM/Conf` 不长期为 `--`。
  - Diagnostics：AudioFrame version/timestamp 单调递增；`isSilentRaw` 合理。

2. **ProjectM 音频路径“永不 abort”硬化（守住底线）**

- 目标：任何情况下都不允许出现 `pm_pcm_add_float` 类 abort loop。
- 方法：继续坚持“严格导出探测 + 自动降级”原则；所有异常统一进入 `failed` 状态位并 early-return。
- 验收信号：
  - Console：无 WASM abort；preset 错误不会导致每帧刷 error。
  - Diagnostics / `__projectm_verify`：`hasAudioApi` 与实际行为一致；`framesRendered>0`。

3. **关键驱动信号的护栏（避免现场极端输入导致画面失控）**

- 目标：弱输入/噪声输入/爆音输入时，画面“仍有驱动但不乱跳/不炸白/不黑屏”。
- 手段：
  - energy/bands/features 的最小门限 + 软饱和曲线（避免线性放大带来的过冲）。
  - accent/slot pulse 的最大 delta 限幅（避免旋钮剧烈抖动）。
- 验收信号：
  - 静音：画面可保持轻微生命感但不过度抽动。
  - 爆音：不会出现持续 100% 亮度/过曝；release 正常回落。

### P1（下周）：性能确定性（4k120/长时间运行“稳态成本”）

4. **统一性能预算管理器收敛为“唯一调度中心”**

- 背景：bootstrap 已有预算回调挂载（audio analysis / beat tempo / PM audio feed cadence），但需要把“策略/阈值/滞回/压力窗”彻底固化成可解释的模型。
- 目标：把以下都变成预算管理器的可控输出，并在 Diagnostics 可见：
  - analysis fps cap（30/45/60）
  - frequency cap（固定 30，或由预算决定）
  - beat tempo cadence（interval 或 fps cap）
  - ProjectM FG/BG audio feed cadence（离散档位）
  - preset load pressure window 期间的 load-shedding
- 验收信号：
  - 压力升高时：caps 自动下调，p95 回落；压力解除后可恢复。
  - “为什么降级/何时恢复”在 Diagnostics 中一眼可解释（原因码 + 时间戳）。

5. **热路径“零分配”二次清剿（以长时间稳定为准）**

- 目标：把热路径的残余对象分配压到最低（重点是 per-frame 的临时对象/数组/对象展开）。
- 重点模块：
  - AudioBus frame 构建（PCM/bands/features）
  - ExpressiveAudioDriver / AudioControls（避免 `{...snapshot}`）
  - ProjectMEngine 喂入（复用 interleaved buffer / wasm ptr / view）
- 验收信号：
  - Memory：分配速率下降；GC 间隔明显变长；无锯齿型 heap 增长。
  - 现场：运行 30–60 分钟不出现“越跑越卡”。

6. **时间基准统一（RAF timestamp / audio clock 对齐）**

- 背景：当前存在 RAF 节拍与频域节流，未来在 120fps 下需要更强的 dt 一致性。
- 目标：关键平滑器/包络计算统一使用“明确 dt”，而不是隐式依赖固定帧率。
- 验收信号：
  - 60→120→60 切换时：驱动强度的 attack/release 体感一致，不会变“粘/抖”。

### P2（后续）：超强音频驱动表现力（“像导演一样”可控、层次丰富）

7. **AudioDrive Profiles（风格化可控的表现力层）**

- 目标：把“表现力调参”从散落常量提升为 profile（例如：techno/dnb/ambient/hiphop），每个 profile 明确：
  - stageBands：attack/release/gamma/hold
  - accent：attack/release/scale
  - macro mixing：fusion/motion/sparkle 的权重与 guard
  - gate：beat phase window 的严格度
- 交付形态（优先不加新 UI）：
  - 通过现有 state/config 选择 profile；Diagnostics 显示当前 profile 名称与关键参数。
- 验收信号：
  - 同一首歌切换 profile：画面“风格明显变化”，但不会破坏稳定性（无闪烁/无抖动）。

8. **驱动信号“层级合成”（能量/瞬态/节拍/结构）**

- 目标：形成可解释的“驱动分层”，避免所有东西都靠 energy：
  - Body：`energy`（长期）
  - Punch：`kick/clap/hihat`（短期 accent）
  - Motion：`flux`（变化量）
  - Groove：`beatPhase`（门控/段落感）
- 验收信号：
  - 快节奏：punch 清晰，motion 连贯；
  - 慢节奏：body 稳，groove 有呼吸。

9. **诊断面板升级为“现场调参仪表盘”**

- 目标：现场调参只看 Diagnostics 就能定位“为什么没动/为什么抖/为什么发白”。
- 必须可见字段：
  - energy（raw/processed/stage 的关键对比）
  - bands 三套（P/R/S）
  - accent/slotPulse（含 gate 状态）
  - budget 当前档位与原因码
- 验收信号：出现问题时能在 30 秒内定位到“输入/节流/降级/信号护栏/ProjectM”中的具体一类。

---

## 3) 里程碑建议（建议你按节奏推进，不追求一次做完）

- 里程碑 A（P0）：

  - 音频输入链路稳定（波形/电平/BPM/Conf 持续更新）
  - ProjectM 音频路径永不 abort
  - 关键驱动信号护栏完成（静音/爆音都不失控）

- 里程碑 B（P1）：

  - 性能预算管理器成为唯一调度中心（可解释的自动降级/恢复）
  - 热路径零分配二次清剿（长时间运行稳定）
  - dt/时钟统一，60/120 下体感一致

- 里程碑 C（P2）：
  - Profiles 完成（至少 3 个风格）
  - 驱动分层合成完成（body/punch/motion/groove）
  - Diagnostics 升级为现场仪表盘

---

## 4) 文档对齐 TODO（避免口径漂移）

- 将 `audio-audit-report.md` 中对 AudioFrame/参数的描述，与 `DATA_INTERFACES.zh.md` 的真实字段对齐（尤其是 raw/stage 的语义与更新频率）。
- 将“stageBands 的 profile 参数”（attack/release/gamma/hold）以“可引用的单一真相源”写在一个地方（建议：`DATA_INTERFACES.zh.md` 或 `docs/reference/AUDIO_PIPELINE_AUDIT_2025-12-25.zh.md` 追加一节）。
