# newliveweb · 本地运行与状态交接

> 日期：2025-12-11
> 适用场景：自测、排障、交接给下一位同事
> 最新入口：`MASTER_SPEC.zh.md`（本文保留为本地运行手册，后续只追加）。
> 文档索引：`DOCS_INDEX.zh.md`（写作路由与权威性分层）。

## 1. 模块总览

| 模块          | 位置                             | 说明                                                                             |
| ------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| 可视化入口    | src/main.ts                      | 构建 UI，加载 manifest，管理 ProjectM + LiquidMetal 层，音频驱动、全局随机与收藏 |
| Three.js 场景 | src/SceneManager.ts              | 统一管理 renderer、camera、layer 渲染周期                                        |
| 液态金属层    | src/layers/LiquidMetalLayerV2.ts | Shader 与参数接口，支持音频频段驱动                                              |
| ProjectM 层   | src/layers/ProjectMLayer.ts      | 封装 ProjectMEngine，负责预设加载与透明度调节                                    |
| 音频控制      | src/audio/AudioController.ts     | 封装 StreamAudioProcessor，向上层提供 `AudioData`                                |
| Manifest 工具 | smelter-win/\*                   | 预设扫描/筛选/wasm 兼容检查，生成 `public/presets*/library-manifest*.json`       |

> 对齐说明：上表反映了 2025-12-11 当时的模块口径；当前主链路已切换为 `AudioBus`（见本文第 6.2 节），`AudioController` 保留但不作为主入口使用。

## 2. 当前功能亮点

1. **多库模式**：在 `presetLibraries.ts` 间切换 “大库/大库安全/精选/精选安全”，可开启 `requireWasmSafe` 过滤。
2. **全局随机**：`Random visual` 按钮与 `R` 快捷键，基于当前音频能量（peak/rms）同步随机 ProjectM 预设、LiquidMetal 参数、ProjectM 透明度。
3. **收藏系统**：`★ Favorite` 将当前预设、LiquidMetal 参数、ProjectM 透明度存入 localStorage；`Favorites: N` 打开侧边列表，支持一键恢复和删除。
4. **WASM 兼容提示**：`getCompatNote()` 会把 `wasmCompat` 的 errorType/message 附加到预设加载错误，便于定位不兼容预设。

## 3. 已知问题与优化点

| 分类            | 问题                                 | 说明                                                                                                                                    |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Dev Server      | 端口总回到 5173、浏览器 404          | VS Code 内嵌 PowerShell 结束命令后会收回控制权，进程退出；且若存在 vite.config.js 可能覆盖 vite.config.ts。需用外部终端并确保配置唯一。 |
| Favorites       | 数据不同步/无上限                    | 随机或恢复后控制面板 slider 未刷新；localStorage 没有数量上限。                                                                         |
| 音频能量        | 默认不平滑（可选 EMA）               | `AudioBus` 产出 `energyRaw` 与 `energy`；可通过 URL 参数启用 EMA（默认关闭，避免改变行为）。                                            |
| ProjectM 透明度 | 缺少 clamp                           | 随机后最高可能 >1，建议后续 `Math.min(1, value)`。                                                                                      |
| Manifest 安全性 | `projectm-preset-probe` 仍在启动即崩 | `check-wasm-compat` 输出大量 `probe_no_output`，wasmCompat 暂难提供真实信息，需后续 C++ 调试。                                          |
| Mixxx 接入      | 已实现（MVP）                        | 工具栏已提供 “Connect Mixxx” 按钮，支持 URL 记忆、断线重连与状态展示（Diagnostics 也可见）。                                            |
| 预设随机        | 可能落在无 manifest 场景             | `applyRandomVisualState` 直接随机 `getAllPresets()`；若 manifest 为空不会加载新预设但仍会随机参数，建议后续增加“无可用预设”提示。       |

## 4. Dev Server 指南

### 4.1 启动（推荐用外部终端）

1. 关闭 VS Code 内的 `npm run dev`，必要时在**管理员 PowerShell**执行：
   ```powershell
   taskkill /IM node.exe /F
   ```
2. 打开系统终端（Windows Terminal / PowerShell）：
   ```powershell
   cd C:\Users\pc\code\newliveweb
   npm install
   npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
   ```
3. 保持终端挂起，浏览器访问 `http://127.0.0.1:5174/`。

#### 4.1.1 Windows 小贴士：从仓库根目录一键启动（避免 cd 目录）

如果你经常在 `C:\Users\pc\code` 下误执行 `npm run dev`（该目录没有 package.json），可以用仓库根目录的启动脚本：

- PowerShell：
  - `./dev-newliveweb.ps1 -Port 5174 -StrictPort`
- CMD：
  - `dev-newliveweb.bat 5174 strict`

脚本会自动 `cd` 到 `newliveweb` 再运行 Vite。

> 说明：VS Code 内嵌终端命令结束后会收回控制权，`npm run dev` 退出导致端口未监听；外部终端可保持前台运行。

### 4.2 如果仍被绑定到 5173

- 检查是否有 `vite.config.js` 覆盖了 `vite.config.ts`，若有请删除或重命名，仅保留 ts 配置。
- 重跑 `npm run dev`，确认日志显示 `Local: http://localhost:5174/`。

### 4.3 端口监听确认

```powershell
netstat -ano | findstr 5174
```

若无 LISTENING，检查防火墙或确认 dev 进程仍在运行。

### 4.4 预览模式

1. 构建：`npm run build`（生成 dist）。
2. 预览：`npm run preview -- --host --port 5173`（默认 4173，如占用可改端口）。
3. 访问对应地址，若提示端口被占用，先 `netstat -ano | findstr 4173` 找 PID，再 `taskkill /F /PID <PID>` 后重试。

## 5. 后续工作建议

1. **修复 CLI & 生成 wasm-safe manifest**：定位 `projectm-preset-probe` 启动崩溃，跑通 `check-wasm-compat`，在前端 `presetLibraries` 增加“极致安全”模式指向 wasm-safe。
2. **强化随机/收藏体验**：
   - 引入能量平滑（EMA/滑窗），增加强度模式（ambient/aggressive）；
   - 外部修改后刷新控制面板 UI；
   - 为收藏设置上限并支持导出/清空。
3. **Mixxx 流接入**：增加“连接 Mixxx”按钮，配置 Icecast/HTTP，提供状态指示与重连。

- 勘误：上述入口已实现 MVP；后续可补齐更完整的错误提示与更明确的连接参数说明。

4. **音频触发扩展**：在 `AudioController` 中增加节拍/速度估计，用于自动轮播或随机的智能触发。

---

## 6. 2025-12 对齐更新（与当前代码一致）

> 说明：本文最初写于 2025-12-11，当时入口与音频管线仍以 `main.ts + AudioController` 为中心；当前已演进为 `bootstrap + AudioBus`。以下为“现状对齐补充”，不覆盖原文。

### 6.1 入口与装配

- 入口：`src/main.ts` → `src/app/bootstrap.ts`
- UI：`src/app/renderShell.ts` 生成 DOM 并返回 `DomRefs`，避免 main 内嵌大模板导致编码破损

### 6.2 音频主链路（单一分发源）

- `src/audio/AudioBus.ts` 为唯一分发源，内部复用 `src/audio/StreamAudioProcessor.ts`
- `src/audio/AudioController.ts` 仍保留但不作为主入口使用（避免两套 onFrame/energy）

补充：可选能量平滑（EMA）

- 默认：不启用（`energy === energyRaw`）
- 启用方式（显式 opt-in）：在 URL 加上 `?audioSmoothing=ema&audioSmoothingAlpha=0.2`
- Diagnostics 面板会同时显示 `energy` 与 `energyRaw`，用于确认平滑前后的真实值

### 6.3 预设与收藏模块化

- 预设控制：`src/features/presets/PresetsController.ts`（包含库模式、auto-cycle、坏预设隔离、storage key `presetLibrarySource`）
- 收藏面板：`src/features/favorites/FavoritesPanel.ts`（storage key `newliveweb:favorites:v2`，启动时会从 v1 自动迁移）

### 6.4 推荐验收流程（更可靠）

- 本地跑：`npm run verify:dev`
- 查看产物：`artifacts/headless/report.json`、`page-errors.log`、`browser-console.log`、`trace.zip`、`diff.png`（或对比 `viz-canvas-a/b.png`；不要只看 `screenshot.png`）

### 6.5 演出场景补充（Mac 外置声卡输入 + 摄像头背景）

> 目的：把演出当天的关键路径写成“可验证步骤”，并明确当前缺口，避免现场踩坑。

- 现状（以代码为准）

  - 应用已支持捕获系统/外置声卡输入：点击工具栏 “Use input” 会触发 `getUserMedia({ audio })` 并接入 `AudioBus`（`MediaStreamAudioSourceNode`）。
  - macOS 系统里把“输入设备”切到 DJM-900… 仍然有用：它影响“系统默认输入”，但**必须**在网页内点击 “Use input” 完成权限与捕获。
  - 摄像头背景：在工具栏“背景图层”勾选 `Camera` 才会请求权限并启动；`background.type` 仅表示当前编辑层，不再互斥禁用其它层。
  - 深度背景（Effect C）：同样在“背景图层”勾选 `Depth` 启用；默认走 `webcam`（需要 https/localhost 的 secure context），也可切到 `ws` 由外部桥接推送深度帧。

- 演出前可做的最小验证（当前版本）

  1. 用“音频文件”或“音频 URL”驱动渲染，确认 Diagnostics 中 `energy/rms/peak` 有波动、`__projectm_verify.framesRendered` 增长。
  2. 点击 “Use input”，选择 DJM-900 等输入设备，确认 Diagnostics 中 `source=stream` 且 `energyRaw/energy` 随音乐持续跳动（默认音量为 0，避免反馈）。
  3. 勾选 `Camera` 图层，确认权限允许后有画面；拒绝权限时应可取消勾选继续演出（必要时可切回 `Liquid` 作为底图）。
  4. （可选）勾选 `Depth` 图层，调 `fog/edge/blur/layers` 确认有雾/等高线叠加；多层同时开启时系统会在 runtime 端对 overlay opacity 做归一化，避免过曝。

#### 6.5.0 控制台（Toolbar）UI：当前交互口径（2025-12-18）

> 目的：现场操作更快；语义与现有多层 mixer / AIVJ / audio coupling 保持一致。

- 背景区分两类概念：

  - **Edit focus（编辑层）**：`bg-type-select` 只决定“当前编辑哪个层的 params”（对应 `background.type`）。
  - **Layer enabled（图层开关）**：`Liquid/Basic/Cam/Video/Depth` 的 checkbox 控制 `background.layers.<layer>.enabled`，图层可多选并同时叠加。

- 行式布局：

  - `Basic/Cam/Video/Depth` 提供**快速 opacity slider**（层关闭时 slider 会禁用）。
  - **层专属控件折叠**：仅当该层 enabled 时显示对应行：
    - `Camera` → 设备下拉 + Person seg + Edge→PM
    - `Video` → Retry video
    - `Depth` → source/device/debug/status + fog/edge/layers/blur（Depth params 行）

- 约束/护栏：
  - `Camera` 与 `Depth(webcam)` 需要 secure context（https/localhost）；不满足时勾选会自动回退关闭并提示。
  - 多层 overlay 同时启用时，runtime 端会对 overlay opacity 做归一化/平滑，减少叠加过曝（不修改保存到 state 的 opacity 值）。

### 6.5.1 NDI / Depth 设备接入要点（Windows/Mac）

- 设备下拉（Camera/Depth）基于 `enumerateDevices()`：首次进入页面可能看不到设备 label，先允许一次摄像头权限再刷新下拉。
- NDI 常见用法：
  - `Camera`：选择 “NDI Webcam Input …” 作为 camera device。
  - `Depth`：如果你的 NDI 管线提供第二路灰度/深度流，可在 Depth 的 device 下拉里选对应设备（并把 Depth source 设为 `webcam`）。
- Secure context 护栏：
  - `Camera` 与 `Depth(webcam)` 都要求 `https` 或 `http://localhost`/`127.0.0.1`。
  - 若在不安全上下文勾选，会自动回退关闭并提示原因。
- 混合建议：Depth 为 additive 叠加，首次启用会把默认 opacity 从 1 下调到更“融合友好”的值（当前为 0.6）；需要更亮再手动加。

- 计划（进一步增强）
  - 输入源可观测：Diagnostics 显示当前 input label/deviceId；对拒权/设备占用/无设备给更清晰提示。
  - 防反馈与监控：保持默认静音；后续可增加显式 “Monitor” 开关而不是依赖音量滑块。
  - 对应任务：见 `TODOS.zh.md` 的“本地音频输入（MediaStream）打通”与“Camera 背景体验护栏”。

---

### 6.6 WASM compat 探测链路对齐补充（2025-12-16）

> 勘误：本文第 3 节“Manifest 安全性 / probe_no_output”是 2025-12-11 的旧状态；当前已修复。

- `projectm-preset-probe`（C++ CLI）现在会稳定输出单行 JSON（即使 worker 发生硬崩溃也不会导致调用方 `probe_no_output`）。
- Windows 构建后会自动把 runtime DLL（如 `projectM-4.dll` / `glew32.dll` / `SDL2.dll`）拷贝到 `build-vcpkg/src/tools/Release/`，避免 `STATUS_DLL_NOT_FOUND (0xC0000135)`。
- `smelter-win/tools/preset-analyzer/check-wasm-compat.mts` 已可用于为 v1.safe manifest 批量写入 `wasmCompat`。

快速验证（样本规模建议先小后大）：

1. 构建 probe（Release）：

   - `cmake --build projectm/build-vcpkg --config Release --target projectm-preset-probe`

2. 运行单文件 probe：

   - `projectm/build-vcpkg/src/tools/Release/projectm-preset-probe.exe --preset newliveweb/public/presets/default.milk`

3. 跑 wasmCompat（对 manifest 批量探测）：

   - `npx tsx smelter-win/tools/preset-analyzer/check-wasm-compat.mts --input newliveweb/public/presets-curated/library-manifest.v1.safe.json`

## 2025-12-16 对齐补充（勘误）：输入设备捕获已实现

> 说明：本节为 append-only 勘误；上面“未接入 MediaStreamAudioSourceNode”的描述属于历史口径。

- 现状（以代码为准）
  - `AudioBus.loadInputDevice(deviceId?: string)` 已实现：通过 `getUserMedia({ audio })` 捕获输入设备 `MediaStream` 并接入 `StreamAudioProcessor`。
  - UI 已提供 `#audio-input-device`（选择设备）与 `#audio-input-use`（Use input）用于切换到输入源。
  - 默认 `monitor=false`（避免反馈），拒权/无设备会提示且不崩溃。

## 2025-12-16 补充（append-only）：`mode=show`（演出 input-only 模式）

> 目的：演出现场**只用 mixer input**（不依赖 Track 测试音轨/本地路径），把误操作面降到最低。

- 打开方式：在浏览器地址后追加 `?mode=show`
  - 示例：`http://127.0.0.1:5174/?mode=show`
- 行为变化（以代码为准：`src/app/bootstrap.ts`）
  - 禁用 Track 相关控件（文件/URL/Play）；Play 按钮显示为 `Input only` 且不可点击
  - 不绑定“首个手势自动加载测试音轨”的逻辑（避免误触发）
  - `Show/Save show` 以 input-only 语义保存/恢复（不落到 track）
- 开发自测（需要 Track 时）
  - 不要带 `mode=show`，直接打开 `http://127.0.0.1:5174/`
  - 可选：传 `?testTrackPath=/abs/path/to/file.mp3` 让首个手势/Play 自动加载该本地测试音轨
- MacBook Pro（开发服务器）演出当日最小步骤

  1. 连接 DJ mixer：USB-B（方口）→ USB-C（Mac）
  2. macOS：系统设置 → 声音 → 输入设备 选择 “DJM-900…”（或你的声卡名）
  3. 启动 dev server：`cd newliveweb && npm install && npm run dev -- --host 127.0.0.1 --port 5174`
  4. 打开：`http://127.0.0.1:5174/?mode=show`
  5. 工具栏：选择 `Input` 设备（或 Default）→ 点击 `Use input`（授权麦克风）
  6. （可选）点击 `Show`：应用已保存的 show config（背景/参数/音频偏好）
  7. Diagnostics 验收
     - `source=stream` 且 `energyRaw/energy/rms/peak` 持续跳动
     - `ProjectM lastAudioRms/lastAudioPeak` 有变化（说明 ProjectM 正在接收 Float32 PCM）

  ***

  ## 2025-12-16 补充（append-only）：更真实的彩排/演出验收 checklist

  > 目标：尽量接近“现场真的会用”的路径；每一步都给出可观测信号与常见失败分支。

  ### A. 基线（5 分钟内确认系统健康）

  1. 启动 dev server（固定端口，便于复现）

  - `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`

  2. 浏览器打开：`http://127.0.0.1:5174/`
  3. 观察 Diagnostics（右上角）

  - 期望：`ProjectM frames=` 持续增长
  - 期望：无明显红色错误状态（页面弹错/崩溃）

  4. 运行自动门禁（可选但推荐）

  - `npm run verify:ci`

  ### B. 演出模式（最贴近现场：input-only）

  1. 打开：`http://127.0.0.1:5174/?mode=show`
  2. 验收 UI 护栏

  - 期望：音频 Track 相关控件禁用：`Load audio`（文件选择）、`Load URL`、`Connect Mixxx`、`Play`
  - 期望：`Play` 按钮文字变为 `Input only` 且不可点击

  3. 选择输入设备 → 点击 `Use input`（会触发麦克风权限）

  - 期望：Diagnostics 中 `source=stream`
  - 期望：`energyRaw/energy/rms/peak` 随音乐持续跳动
  - 备注：默认监控音量为 0（避免反馈）；energy 与监控音量无关，但现场请不要把音量误拉太高

  4. （可选）点击 `Show`

  - 期望：背景/参数被恢复，且仍然保持 input-only 语义（不落到 Track）

  常见失败分支：

  - `Use input` 被拒绝：浏览器地址栏权限里允许“麦克风”；或在系统隐私设置里允许该浏览器。
  - `No matching audio input device found`：重新插拔 USB 声卡/混音台；刷新页面后再试。
  - 能量一直为 0：确认输入设备确实有信号（系统输入电平/混音台输出），以及没有选错设备。

  ### C. Mixxx（更贴近“DJ 软件推流”场景：不使用 show mode）

  > 说明：`mode=show` 会禁用 URL/Connect Mixxx；Mixxx 验收请用普通模式。

  1. 打开：`http://127.0.0.1:5174/`
  2. 在工具栏 `Audio URL` 输入框（`#audio-url`）粘贴 Mixxx 的 HTTP/Icecast 流地址（示例：`http://127.0.0.1:8000/live`）

     - 说明：`Load URL`（`#audio-url-load`）是“普通 URL 音频加载”；Mixxx 推荐用下一步的 `Connect Mixxx`。

  3. 点击工具栏 `Connect Mixxx`（`#audio-mixxx-connect`）

  - 期望：状态提示 `🎛️ Mixxx: connected`
  - 期望：Diagnostics 中出现 `stream=connected`（或 error/connecting），并显示 `url=...`

  4. 断线/重连验收（更真实）

  - 暂停/重启 Mixxx 推流或断网，再恢复
  - 期望：状态变为 error 后会自动重试（多次），恢复后再次进入 connected

  5. 刷新页面验收（URL 记忆）

  - 期望：`Audio URL` 会自动回填上次的 Mixxx URL（便于一键重新连接）

  常见失败分支：

  - 一直 `error`：确认 URL 可被浏览器直接访问（在新标签页打开 URL 看是否返回音频/可下载）。
  - 连接成功但无能量：确认推流是“音频内容”而不是空流；或 Mixxx 输出路由/采样率配置是否正常。

  ### D. 摄像头/视频背景（现场常见）

  1. 打开高级参数面板：点击工具栏的 `Advanced`（`#inspector-toggle`）
  2. 切到 camera 背景：在面板中找到 `Background/Type/type`，把值改为 `camera`

  - 期望：浏览器弹出摄像头权限；允许后有画面

    - 期望：Diagnostics 中 `bg=camera`；如果有状态实现则会出现 `bgStatus=...`

    3. 切回 liquid：把 `Background/Type/type` 改回 `liquid`

  - 期望：摄像头可被停用/不再占用（避免后台耗电/占用设备）

    4. 切到 video 背景并设置视频地址

    - 把 `Background/Type/type` 改为 `video`
    - 设置 `Background/Video/src`（示例：`https://.../video.mp4`）

    - 期望：Diagnostics `bg=video`，并可通过界面 `Retry video`（`#video-retry`）恢复播放（若存在自动播放限制）

    （可选）调高级视频参数：在 Inspector 打开 `Show advanced`（`#inspector-show-advanced`），可看到 `Background/Video/loop`、`muted`、`fitMode`、`playbackRate`。

  ### E. 演出当天速记版（30 秒能照做）

  #### 1) 现场演出（只用混音台输入，最安全）

  1. 打开：`http://127.0.0.1:5174/?mode=show`
  2. 工具栏：`输入设备` 下拉（`#audio-input-device`）选设备（或 `系统默认`）
  3. 点击 `使用输入`（`#audio-input-use`）并允许麦克风权限
  4. （可选）点击 `Show`（`#show-setup`）应用已保存 show
  5. 验收：`电平：xx%`（`#audio-level-text`）会随输入跳动；Diagnostics 里 `energyRaw/energy/rms/peak` 也会持续变化

  #### 2) DJ 软件推流（Mixxx / Icecast / HTTP）

  1. 打开：`http://127.0.0.1:5174/`（不要带 `mode=show`）
  2. 在 `Audio URL`（`#audio-url`）粘贴流地址
  3. 点击 `连接 Mixxx`（`#audio-mixxx-connect`）
  4. 验收：状态提示 `🎛️ Mixxx: connected`
  5. 验收：Diagnostics 出现 `stream=connected` 且 `url=...`

  #### 3) 摄像头背景（现场常用）

  1. 点 `展开`（`#inspector-toggle`）打开面板
  2. 将 `Background/Type/type` 设为 `camera`
  3. 允许摄像头权限，看到画面
  4. （可选）用 `Background/Camera/opacity` 调透明度
  5. 验收：Diagnostics 出现 `bg=camera`
