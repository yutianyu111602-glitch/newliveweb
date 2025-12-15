# newliveweb

全新、干净的前端可视化工程：LiquidMetal 背景 + ProjectM 图层，面向 OBS / DJ 使用场景。

> 说明：`projectm-web-visualizer/` 仅保留为历史 Demo/参考，**所有新功能都在 `newliveweb/` 实现**。

## 技术栈

- Vite + TypeScript
- Three.js（Layer 管线 + ShaderMaterial）
- Web Audio API（下一阶段接入 StreamAudioProcessor）
- ProjectM WASM（`public/projectm-runtime/projectm.{js,wasm}`）

## 开发

```bash
cd /Users/masher/code/Mac_Development_Package_copy/newliveweb
npm install
npm run dev   # 默认 5173/5174 端口，终端会提示实际端口

# 生产构建
npm run build
```

## 当前状态

- ✅ Layer 架构：`SceneManager` + `Layer` 接口，支持动态添加/销毁图层。
- ✅ LiquidMetalLayer：新版 ShaderMaterial，响应时间与鼠标，运行在主 Canvas。
- ✅ ProjectMLayer：封装 `ProjectMEngine`（加载 `/projectm-runtime/projectm.{js,wasm}`），默认 preset `public/presets/default.milk`，以 CanvasTexture + AdditiveBlending 覆盖 LiquidMetal。
- ✅ 音频管线：`StreamAudioProcessor` + `AudioController` 已接入，支持本地文件上传或 URL 流，实时把频段能量驱动 LiquidMetal，并把 PCM 推送到 ProjectM。
- ✅ Preset 管理：工具栏支持预设下拉、`.milk` 导入、远程 URL 加载 & 自动轮播，底层由 `src/config/presets.ts` 管理内置清单（默认提供 Default / martin Liquid Gold / Geiss Starfish 1）。
- ✅ 资源地址预填：工程会在 UI 中展示默认测试音乐目录 `/Users/masher/Music/网易云音乐/测试转换` 以及 MegaPack 预设目录 `/Users/masher/code/MilkDrop 130k+ Presets MegaPack 2025 2`，便于拖入或脚本同步。

## 音频控制

- 工具栏包含「Load audio」按钮（本地文件）和 URL 输入（外部流 / HLS/mp3）。
- 选择或加载后自动开始播放，可用 Play/Pause 切换、Volume 滑块调节音量。
- 右侧实时显示播放进度与当前音源状态；若加载失败会提示错误。
- 所有音频解码都发生在浏览器端，OBS 只需捕获最终 Canvas 图层。

## ProjectM 预设控制

- 工具栏第二行用于管理 ProjectM 预设：
	- 下拉框：列出 `src/config/presets.ts` 中定义的内置预设；选择后立即热加载。
	- Import `.milk`：从本地上传任意 MilkDrop 预设文本，实时替换当前效果。
	- Load URL：输入远程 `.milk` 链接（支持同源或可跨域文件），点击加载即可应用。
- Next preset：手动切换到下一条内置预设，方便表演/演示快速轮播。
- Auto-cycle + Interval：勾选后按照设定秒数自动轮播内置预设；加载自定义文件/URL 会自动退出轮播，确保舞台可控。
- 想要扩展内置列表时，把 `.milk` 文件放在 `public/presets/` 并在 `src/config/presets.ts` 注册即可。
- 所有操作都在浏览器端完成，无需刷新页面即可切换预设。

## 目录提示

- `public/projectm-runtime/`：ProjectM WASM 资产（从旧项目复制但在这里独立维护）。
- `public/presets/*.milk`：默认启动的 `default.milk` 以及新增展示用 `martin-liquid-gold.milk`、`geiss-starfish-1.milk`。
- `src/config/presets.ts`：内置预设清单 & 查找辅助函数。
- `src/config/paths.ts`：集中定义测试音乐/预设资源的绝对路径。
- `public/presets/library-manifest.json`：`sync:presets` 脚本生成的动态预设清单，供 UI 自动加载。

## 运行时兼容性

- 2025-12-11：`public/projectm-runtime/projectm.js` 手动移除了所有 `import.meta.url` 依赖（共两处），改为：
  1. `_scriptName` 初始化：使用 `document.currentScript.src` 或 `self.location.href` 推导脚本路径
  2. `wasmBase` 计算：改用 `_scriptName` 通过 `new URL()` 构建 WASM 基准路径，回退到 `"./"`
  
  这样可避免在 Vite 动态注入或经典 `<script>` 环境里触发 `Cannot use 'import.meta' outside a module`。未来若重新生成该文件，请重新套用同样的 shim。

## 资源同步（MilkDrop MegaPack）

> 来源：`/Users/masher/code/MilkDrop 130k+ Presets MegaPack 2025 2`（见附件 README / PRESET LICENSE）。

- 运行脚本，把 MegaPack 中的 `.milk` 拷贝到 `public/presets/mega/**` 并生成清单：

```bash
cd /Users/masher/code/Mac_Development_Package_copy/newliveweb
npm run sync:presets -- --limit=200
```

- 参数说明：
	- `--source=/absolute/path` 可覆盖默认打包目录。
	- `--limit=200` 控制拷贝数量，防止一次性复制 13 万个文件。
	- `--target=mega` 可切换输出子目录名。
- 运行完成后 `public/presets/library-manifest.json` 会记录生成时间、来源路径与每个拷贝的 URL，前端会自动加载清单并追加到 UI 下拉列表，同时支持自动轮播。
- 请遵守 `MilkDrop 130k+ Presets MegaPack` 的授权要求（大部分基于 CC-BY-NC-SA 3.0；详见 `PRESET LICENSE.txt`）。
- `src/layers/`：所有可组合图层（LiquidMetal、ProjectM、未来的效果层）。

欢迎直接在该目录继续开发，旧 `projectm-web-visualizer/` 不再接受新代码。*** End Patch
```