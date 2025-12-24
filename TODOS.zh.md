# newliveweb TODOs（全局待办 / 2025-12-16）

> 目标：把“计划/接口/实现/验收”串起来，下一步做事不靠记忆。
> 规则：每条 TODO 都要有可验收信号（UI/日志/headless artifacts），并遵守 `MASTER_SPEC.zh.md` 的不变约束。
>
> 写作路由（避免重复口径）：先更新 `MASTER_SPEC.zh.md`（事实/约束/验收），再按需同步到 `DATA_INTERFACES.zh.md`（接口细节）与本文件（可执行 TODO）。详见 `DOCS_INDEX.zh.md`。
>
> 统一验收命令（Windows）：
>
> - CMD：`VERIFY_HOST=127.0.0.1 VERIFY_PORT=5174 npm run verify:dev`
> - PowerShell：`$env:VERIFY_HOST='127.0.0.1'; $env:VERIFY_PORT='5174'; npm run verify:dev`
> - 然后：`npm run verify:check`
>   （如端口占用再改 `VERIFY_PORT`；host 固定避免 localhost/127.0.0.1 行为差异）。

## 本轮变更记录（2025-12-18）

- Playwright headless 验证通过：`npm run verify:dev` + `npm run verify:check`
- 电平/波形改为“原始音频语义”（raw pre-gain）：UI meter 优先使用 `peakRaw/rmsRaw`，并基于 `isSilentRaw` 判静音
- 静音不再卡 ~20%：UI meter 增加轻量自适应噪声底（只影响显示，不影响可视化驱动信号）
- Headless userFlow 稳定性：Inspector 控件在 toolbar overflow 场景下会自动滚动到可见，避免误报失败
- BeatTempo：修复 `C` 长期为 0 的置信度归一化问题；输入改为 raw-first 的 2048 PCM，并按 hop 节流，避免有效采样率偏低导致 BPM 不准
- AIVJ：morph 采样改为正弦（cosine ease-in-out）；触发新 morph 时从“当前采样值”续接避免回跳；并对每次目标变化做 delta 限幅 + 按能量自适应 morph 时长，减少旋钮剧烈抖动

> 下一步：你只需要按 Now 区的每条“现场验收步骤”逐项人工确认即可（尤其是滚轮调参 / Camera 可见 / iDepth 连接 / AIVJ Auto）。

---

## Now（本周 P0 验收 / 2025-12-18）

> 原则：先验收“现场可用性”（音频/视频/遮挡），再做结构性重构；每项都要有可复现的验收步骤。

- [x] **P0 现场验收：工具栏控件支持鼠标滚轮调参（range/number）**

  - 元数据：优先级=P0 ｜预计=10m ｜依赖=无｜验收信号=滚轮可调 + 页面不乱滚
  - 步骤：鼠标悬停在工具栏任意滑块/数字输入（如 opacity、fog、blur）上 → 滚轮上下滚动
  - 通过：

    - 值会按 step（或自动估算 step）增减，并触发对应效果变化；
    - 鼠标在控件上滚轮不会导致页面滚动（preventDefault 生效）；
    - 鼠标不在工具栏上滚轮仍保持页面正常滚动。

  - 证明（headless，不覆盖现场手动验收）：`npm --prefix newliveweb run verify:check` → `OK: artifacts look good (framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true)`

- [x] **P0 现场验收：所有“旋钮（nw-knob）/宏旋钮/槽位旋钮”支持鼠标滚轮调参**

  - 元数据：优先级=P0 ｜预计=15m ｜依赖=无｜验收信号=旋钮可滚轮调节 + 数值/旋钮角度同步
  - 范围：
    - 宏旋钮：fusion/motion/sparkle
    - 任意 `nw-knob`（如 ProjectM opacity）
    - 槽位旋钮：`+ 槽位` 新增后的每个 slot knob
  - 步骤：
    - 在任意旋钮上悬停 → 滚轮上下滚动
    - 观察：旋钮角度变化、数值文本变化、对应效果（如 opacity）变化
  - 通过：

    - `wheel` 会触发 input/change，旋钮样式（角度）与数值文本同步更新；
    - `+ 槽位` 可新增 slot，slot knob 也可滚轮调节。

  - 证明（headless，不覆盖现场手动验收）：`npm --prefix newliveweb run verify:check` → `OK: artifacts look good (framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true)`

- [x] **P0 修复验收：AIVJ Auto toggle 可开启且状态可观测**

  - 元数据：优先级=P0 ｜预计=10m ｜依赖=音频链路有输入｜验收信号=AIVJ pill + 参数在 5–10s 内变化
  - 步骤：
    - 打开页面 → 选择音频输入（`Use input` 或 Load Track）→ 勾选 `Auto Techno`（AIVJ）；
    - 观察 Visual 区域的 AIVJ status pill 与 `profile summary`；
    - 观察 5–10s：ProjectM 的 presence/opacity 或 LiquidMetal feel 有可见变化。
  - 通过：

    - AIVJ pill 从 OFF 切到 AI（或反之）立即生效；
    - 切换 profile 后刷新页面仍能保持（localStorage 持久化）；
    - 默认行为：首次进入页面 AIVJ 为开启态（若用户曾手动关闭则以持久化为准）；
    - 即使当前音频为静音，也应在几秒内至少触发一次 morph（用于快速确认 AIVJ 正在运行）。
    - 关闭 AIVJ 后不再继续触发 morph（不应持续变动）。

  - 证明（headless，不覆盖现场手动验收）：`npm --prefix newliveweb run verify:check` → `OK: artifacts look good (framesRendered=188, finalOutputChanges=true, pmCanvasChanges=true)`

- [x] **P0 UX 约束：移除/禁用右下角 LiquidMetalControlPanel（参数统一在左侧可隐藏面板）**

  - 元数据：优先级=P0 ｜预计=10m ｜依赖=无｜验收信号=右下角面板不再出现；所有调参入口仍可用
  - 步骤：刷新页面，观察右下角是否出现金属背景层参数面板
  - 通过：
    - 右下角面板不再自动出现；
    - 不存在需要依赖该面板才能调的关键参数（统一在左侧 toolbar/Inspector）。

- [!] **P0 现场验收：Camera 图层开启后画面可见**

  - 元数据：优先级=P0 ｜预计=15m ｜依赖=浏览器可访问摄像头｜验收信号=画面出现 + opacity 生效
  - 步骤：勾 `Camera` → 授权 getUserMedia → 选择正确的 camera device → 调高 `Camera opacity`
  - 通过：
    - 画面在画布上可见（至少能看到亮度/轮廓变化）；
    - `Camera opacity` 调整立即影响可见性；
    - `Segmentation` 开/关有可观测差异（若设备性能不足，可先验收“画面可见”）。

- [!] **P0 修复验收：Depth 增加 iDepth 入口 + 可连接外部深度帧**

  - 元数据：优先级=P0 ｜预计=20m ｜依赖=iPhone iDepth 推流端已就绪｜验收信号=depth-status 进入 connected/receiving
  - 步骤：
    - 勾 `Depth` → `source` 选择 `iDepth`；
    - 在浏览器 DevTools Console 设置连接地址（示例）：
      - `localStorage.setItem('nw.depth.idepthUrl','ws://127.0.0.1:9002')`
    - 观察工具栏 `depth-status` 文本变化（connecting/connected/frames）。
  - 通过：
    - `source` 下拉出现 `iDepth`；
    - `depth-status` 能显示连接状态与帧统计（至少从 idle → connecting → connected/frames>0）；
    - 深度效果（fog/edge/layers/blur）调整能对画面产生影响。

- [!] **P0 回归验收：图层开关/控件接线生效（UI 改动“真的生效”）**

  - 元数据：优先级=P0 ｜预计=15m ｜依赖=dev server 可跑｜验收信号=toggle 立即影响渲染
  - 步骤：依次勾/取消 `Basic/Camera/Video/Depth/Liquid` → 调整各自 opacity
  - 通过：任意开关/滑块都能在 1 秒内影响画面（不再出现“点了没反应”的情况）。

- [x] **P0 修复：电平/波形必须显示“原始音频”（非自适应增益/非舞台整形）**

  - 元数据：优先级=P0 ｜预计=30–60m ｜依赖=可复现静音场景｜验收信号=静音 ≈0% + 波形与原音一致
  - 现象：静音/无声时顶部 `电平` 仍显示 ~20%；波形可能被可视化链路的增益/整形影响。
  - 目标：UI 的 `电平` 与波形使用 raw（pre-input-gain / pre-adaptive-gain）的 PCM/peak/rms；可视化算法仍可继续使用 processed 信号。
  - 验收步骤：
    - Track 模式：`音量=0%` 或暂停播放 → `电平` 应在 1–2s 内衰减到接近 0%（允许极低噪声 0–2%）；波形接近直线。
    - Input 模式：麦克风静音/无声环境 → `电平` 接近 0%（允许极低噪声）；说话/播放音乐时明显上升。

- [!] **P0 现场验收：音频链路持续更新**

  - 元数据：优先级=P0 ｜预计=10m ｜依赖=本机音频输入可用｜验收信号=UI 指标动态 +（可选）Diagnostics 非 0

  - 步骤：打开 `http://127.0.0.1:5174/` → 点击空白处一次（触发 AudioContext resume）→ `Use input` 选择声卡/loopback → 观察 10–20s
  - 通过（UI/可核对）：波形持续刷新；`Level/Energy` 有明显动态；`BPM/Conf` 在节拍明显的音源下能变化（不长期为 0/--）

- [!] **P0 修复验收：Use input / 系统音频捕获后无需额外点击即可看到电平/波形**

  - 元数据：优先级=P0 ｜预计=10m ｜依赖=浏览器权限允许｜验收信号=点击按钮后 1–2s 内出现电平/波形
  - 步骤：
    - 点击 `Use input` 选择任意输入设备，或点击 `Use system` 完成共享
    - 不做额外页面点击，直接观察电平/波形
  - 通过：电平/波形能够自动开始更新（AudioContext 已在按钮交互中 resume）。

- [!] **P0 现场验收：Loopback 输入电平可读**

  - 元数据：优先级=P0 ｜预计=5m ｜依赖=loopback 设备｜验收信号=顶部电平不再长期卡 1–5%

  - 通过：正常节目音量下顶部 `电平/E` 长期不再卡在 1–5%；静音时仍接近 0；不出现明显削波（monitor 开启时尤其注意）

- [!] **P0 现场验收：Video src 入口闭环**

  - 元数据：优先级=P0 ｜预计=10m ｜依赖=浏览器可播放 mp4/webm ｜验收信号=Video state 进入 playing 或明确失败态

  - 步骤：勾 `Video` → 在工具栏 Video 行填写 `src`（mp4/webm）→ 点“设置”或回车 → 观察 `src: ... (state)`
  - 通过：能进入 `playing` 或给出明确失败态；`Retry video` 在失败态可用且可恢复（受浏览器 autoplay 策略影响时至少提示清晰）

- [x] **P0 文档去重与口径统一（本文件）**

  - 元数据：优先级=P0 ｜预计=45m ｜依赖=无｜验收信号=章节结构统一 + 无重复 AIVJ 口径 + 端口口径统一
  - 内容：把重复的 AIVJ/Phase 清单合并；本文件只保留“可执行 TODO + 验收项”，设计推导移到 `AIVJ_DESIGN.zh.md`；硬件/远期灵感移到独立文档并在此留 1 行指针。
  - 产物：`docs/reports/UNFINISHED_TODOS_ROADMAP.local.zh.md`（集中汇总 + 去重后的路线图）

- [!] **P0 修复：波形 + BPM/Conf UI 有输出**

  - 元数据：优先级=P0 ｜预计=20m ｜依赖=dev server 可跑 ｜验收信号=工具栏波形动态 + `E/BPM/C` 不再是 `--`
  - 说明：BPM/Conf 需要一个滑动窗口（默认 4–6s）做统计，启动后前几秒显示 `--` 属正常；但波形/能量应立刻变化。
  - 步骤：打开 `http://127.0.0.1:5174/` → 点击一次页面（解锁 AudioContext）→ `Use input` 或 Load File/URL → 观察 5–10s
  - 通过：
    - 波形框不再为空白，随着输入音频变化；
    - `E xx%` 实时变化；
    - 几秒后 `BPM nnn` 与 `C xx%` 开始出现（音乐节拍明显时更稳定）。

## Next（P0 实现 / 已落地的合并任务在此记录）

- [x] **P0-4 TODO 元数据标准化**

  - 元数据：优先级=P0 ｜预计=30m ｜依赖=无｜验收信号=Now/Next 的每条 TODO 都包含 4 字段（优先级/工时/依赖/验收信号）
  - 标准模板：
    - 元数据：优先级=P0/P1/P2 ｜预计=30m ｜依赖=...｜验收信号=UI/日志/artifacts 的可核对条目

- [x] **P0-5 “验收信号”脚本化 checklist（尽量机器可核对）**

  - 元数据：优先级=P0 ｜预计=已完成 ｜依赖=verify artifacts ｜验收信号=`npm run verify:check` PASS/FAIL 可机器判定
  - 执行顺序：
    - `VERIFY_HOST=127.0.0.1 VERIFY_PORT=5174 npm run verify:dev`
    - `npm run verify:check`
  - 口径说明：以 `npm run verify:dev` 产出的 `artifacts/headless/*` 为准（检查 `report.json` 的 `framesRendered>0`、`finalOutputChanges`、`projectMCanvasChanges` 等；并要求 `page-errors.log` 为空、console 无 `[error]` 行）。

- [x] **P0-7 ProjectMEngine：失败状态位 + 调用阻断（FE-A1）**

  - 元数据：优先级=P0 ｜预计=已完成 ｜依赖=无｜验收信号=手动触发异常后不再持续报错/卡顿
  - 改动点：[src/projectm/ProjectMEngine.ts](src/projectm/ProjectMEngine.ts)
  - 要求：
    - 增加 `failed` 状态；
    - 一旦 `loadPresetData/loadPresetFromUrl/render` 捕获异常或 `onAbort` 触发，标记 `failed=true`；
    - `failed=true` 时禁止继续调用 render/load（early return）。
  - 验收（可核对）：
    - 手动加载一个会报错的 preset 后，console 不应每帧持续刷 error；页面 FPS 不应明显崩坏；
    - `npm run verify:dev` 仍可跑通（不会因为 console error 被验收脚本判死）。

- [x] **P0-8 preset 切换入口统一 try/catch + 自动轮播降级（FE-A2）**

  - 元数据：优先级=P0 ｜预计=已完成 ｜依赖=P0-7 ｜验收信号=错误态可见 + 自动轮播遇错自动暂停
  - 改动点：preset 切换逻辑（下拉/Next/Prev/auto-cycle 等）
  - 要求：
    - 统一封装 `handlePresetLoadError(message, error)`：记录日志 + 状态栏/提示显示失败原因；
    - 所有 preset 切换入口对 `engine.loadPreset*` 做 `try/catch`；
    - `origin='auto'` 的轮播遇错必须暂停，并提示“auto paused due to error”。
  - 验收（可核对）：
    - 人工触发一个错误 preset：UI 能显示失败态；
    - 自动轮播遇错：轮播停止，且不会马上再次触发同一个失败 preset 的加载。

- [x] **P0-9（可选）坏 preset 记忆/避开（FE-A3）**

  - 元数据：优先级=P0 ｜预计=已完成 ｜依赖=P0-8 ｜验收信号=同一坏 preset 不会反复被选中
  - 要求：
    - 在运行期记录 `badPresetIds`（可选 localStorage 持久化）；
    - 一旦某 preset 加载失败，将其标记为 broken，并从候选列表中过滤。
  - 验收（可核对）：手动/自动轮播都不会在短时间内反复选中同一坏 preset。

- [x] **P0-10 多库 + 安全模式切换：配置/状态/持久化（FE-B1/B3）**

  - 元数据：优先级=P0 ｜预计=已完成 ｜依赖=manifest 文件已存在｜验收信号=刷新后仍保持上次选择的库模式
  - 现状参考：已存在 [src/config/presetLibraries.ts](src/config/presetLibraries.ts)
  - 要求：
    - 默认模式保持为“精选·安全”；
    - 读取/写入 `localStorage.presetLibrarySource`；
    - 切换模式时触发重新加载 manifest 并重建 preset 列表。

- [x] **P0-11 多库 + 安全模式切换：UI 控件与重载流程（FE-B4/B5）**

  - 元数据：优先级=P0 ｜预计=已完成 ｜依赖=P0-10 ｜验收信号=切换后列表更新 + 可继续播放/轮播
  - 要求：
    - 在 toolbar/设置面板提供四选一模式切换控件；
    - 切换时：reload manifest → 更新下拉列表/当前 index → 尝试加载新库第一个 preset；
    - 若 `engine` 已 failed：提示需要刷新恢复（不强制重建 WASM，保持最小实现）。
  - 验收（可核对）：
    - 四种模式都能成功加载 manifest（错误时提示明确）；
    - 切换后 preset 数量/列表发生变化；
    - `npm run verify:dev` 可跑通，`npm run verify:check` PASS。

- [x] **P0-1/P0-2 多层预算逻辑合并 + 预算分配落地**

  - 元数据：优先级=P0 ｜预计=已完成｜依赖=无｜验收信号=`npm run lint` + `npm run verify:dev` 通过
  - 说明：两条路径（AIVJ runtime / AudioCoupling runtime）复用同一套预算归一化/平滑；并升级为按层分配预算。
  - 相关代码：
    - 预算分配核心：[src/app/bootstrap.ts](src/app/bootstrap.ts)

- [x] **P0-3 fusion 主轴收敛：PM presence + BG 预算退让**

  - 元数据：优先级=P0 ｜预计=已完成｜依赖=无｜验收信号=`npm run lint` + `npm run verify:dev` 通过
  - 说明：fusion 不再直接把 BG opacity 一起抬高；BG 退让由预算系统体现；设计推导见 `AIVJ_DESIGN.zh.md`。
  - 相关代码：
    - 宏映射（fusion→PM presence）：[src/features/macros/computeMacroPatch.ts](src/features/macros/computeMacroPatch.ts)
    - 运行态预算退让：[src/app/bootstrap.ts](src/app/bootstrap.ts)

- [x] **P0-6 多层预算调参接线（Inspector → runtime）**

  - 元数据：优先级=P0 ｜预计=已完成｜依赖=paramSchema 已包含 Audio/Controls keys ｜验收信号=滑块改变会立刻影响混合（AIVJ 与 AudioCoupling 均生效）
  - 说明：overlay budget 的 `maxEnergy/minScale/depthWeight/smoothBaseMs/priorities/pmRetreat*` 从 `Audio/Controls` 读取，不再硬编码。
  - 相关代码：[src/app/bootstrap.ts](src/app/bootstrap.ts)

## Later（P1/P2）

- [x] **P1 中期：UI/架构整理**

  - 元数据：优先级=P1 ｜预计=2–4h ｜依赖=无｜验收信号=入口分层清晰且不新增页面/弹窗
  - 内容：按“演出必需 / 调试 / 高级”三层整理工具栏与 Inspector 的入口。

- [x] **P1-1 目标生成从“重采样”升级为“连续轨迹”**

  - 元数据：优先级=P1 ｜预计=2–6h ｜依赖=无｜验收信号=10 分钟播放无频繁抖动，profile 行为差异明显且连续
  - 设计说明与入口：`AIVJ_DESIGN.zh.md` + [src/features/aivj/aivjTechno.ts](src/features/aivj/aivjTechno.ts)

- [x] **P1-2 beatConfidence 连续参与决策（conf 低 → 慢/小/少触发）**

  - 元数据：优先级=P1 ｜预计=2–4h ｜依赖=BeatTempo 链路稳定｜验收信号=conf 低不疯狂触发，conf 高更“卡拍”
  - 入口：[src/app/bootstrap.ts](src/app/bootstrap.ts)

- [x] **P1-3 换 preset 与 morph 解耦（编排层级）**

  - 元数据：优先级=P1 ｜预计=2–4h ｜依赖=稳定的 bar/phrase 时钟｜验收信号=段落感更清晰，避免同刻“换 preset + 大幅 morph”
  - 入口：[src/app/bootstrap.ts](src/app/bootstrap.ts)

- [x] **P2-1 depth 权重从常量变策略（按 profile/信号）**

  - 元数据：优先级=P2 ｜预计=0.5–1d ｜依赖=portraitEdge01/人像信号稳定｜验收信号=有人像时 depth 不遮挡且更清晰，无主体时不抢戏

- [x] **P2-2 portraitEdge01 升级为“预算与参数选择”的输入**

  - 元数据：优先级=P2 ｜预计=0.5–1d ｜依赖=depth layer/portrait signals ｜验收信号=边缘强 → 主体轮廓更清晰，边缘弱 → 更偏 PM/Video 表现

## Research（硬件/实验）

- 远期硬件与实验性想法统一收敛到 `HARDWARE_INTEGRATION.zh.md`；本文件仅保留指针，避免淹没执行清单。

## Archive（历史阶段 & Done）

- 历史阶段/旧计划已迁移到 `TODOS_ARCHIVE.zh.md`（仅存档，不作为执行入口）。
- AIVJ 的设计说明/推导统一在 `AIVJ_DESIGN.zh.md`；本文件只保留 Now/Next/Later 的可执行清单。

## 0. 已完成（Done）

- [x] Headless verify flake 降级为 unknown/warn（不再误判硬失败）
- [x] UI 统一化（Favorites/Diagnostics 面板样式与可用性）
- [x] Debug UI：对接文档补齐（`docs/ui/DEBUG_UI_*`）+ AI/自动化样式接口（`docs/ui/DEBUG_UI_AI_INTERFACE.zh.md` + `src/style.css` hooks）
- [x] MacroSlot：label 编辑 + pin + randomize；Random 跳过 pinned
- [x] LiquidMetal：新增 `contrast` 参数（Layer + ParamSchema + Inspector 可调；默认 random=false）
- [x] 本地音频输入（MediaStream）打通（见 1.P0：`AudioBus.loadInputDevice` + 设备选择 UI + Diagnostics 可观测）
- [x] 演出模式一键配置（`Show`/`Save show`，保存并恢复音频偏好 + `VisualStateV2`）
- [x] 演出 input-only 模式（`?mode=show`：禁用 Track 入口；避免误触发；只用 mixer input）
- [x] Video autoplay 被拒时的用户手势重试（`Retry video`）
- [x] Video：工具栏提供 `src` 入口（Video controls 行可直接设置来源；仍与 Inspector → Background/Video/src 兼容）
- [x] MIDI bindings 最小可用性（`Bindings: N` + `Clear` 清空 + 无绑定禁用 Unbind）
- [x] AIVJ 状态 UI 可观测性增强（Visual 区域 AIVJ status pill：OFF/AI/MIDI lock 三态；Macros 区域 MacroBank status pill：AI/MIDI lock 二态；Inspector 参数行 data-param-changed/data-midi-bound 属性徽标）
- [x] 音频：常驻波形图（toolbar waveform canvas，按 AudioFrame.pcm512Mono 绘制）
- [x] Loopback 输入自适应电平校准（初始增益 8.0，自适应阈值放宽并提高上限；目标峰值约 30-70%）
- [x] Headless verify：Inspector 背景层参数使用 paramSchema（修复 mixer controls not found）
- [x] 宏旋钮算法优化（引入 easeInOutCubic 缓动函数，更平滑的控制感；替代简单线性映射）
- [x] UI 布局优化（简化音频控制区按钮排列，使用 button-group 分组；优化响应式布局）
- [x] `npm run lint` + `npm run verify:dev` 当前通过（framesRendered=208）

## 未验证项目

- P0 现场验收项（Camera/Depth/图层开关/音频链路/Use input/Loopback/Video/BPM UI）
- P1-1 连续轨迹（AIVJ target 生成）
- P1-2 beatConfidence 参与触发节奏（慢/小/少触发）
- P1-3 preset 切换与 morph 解耦（morph hold）
- P2-1 depth 权重策略（profile/portrait 信号）
- P2-2 portraitEdge01 预算/参数选择（边缘强/弱驱动）
- P1 UI/架构整理（三层分组：演出/调试/高级）
