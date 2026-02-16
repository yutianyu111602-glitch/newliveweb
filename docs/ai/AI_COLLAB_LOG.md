# AI 协作记录 / Prompt 提示约定

> 目的：在多位 AI 同时开发前后端时，统一上下文和约定，避免互相踩坑。

## 当前分工（示例，可继续补充）

- 前端：UI/渲染/随机与收藏逻辑、manifest 加载、库模式切换。
- 后端/炼丹：manifest 生成与筛选、wasm 兼容检查、projectM CLI 调试。
- 新增摄像头/LiDAR 协作：前端已加 `src/camera/*` 和 `CameraLayer` 占位，后续 WebRTC/深度流可按此接口接入。

## 接口 / 约束

- Layer 接口固定：`src/layers/Layer.ts`（init/update/onResize/dispose）。添加新视觉层（如未来 Camera/LiDAR）请新建 `Layer` 实现，不要修改现有层。
- SceneManager 作为渲染 orchestrator，不在其中写业务逻辑；新增层请通过 addLayer 注册。
- 配置与数据流：`config/*`、`lib/*`；避免把全局配置散落在组件内。

## 提示词 / 操作规约

- 避免改动对方正在处理的文件时重写逻辑；若需修改共享文件，请在这里先记一笔。
- 端口使用：dev 建议 5174（或任意非 5173 的稳定端口）；preview 默认 4173，如占用请修改命令行参数。
- 运行命令：`npm run dev -- --host 127.0.0.1 --port <port> --strictPort`；预览需先 `npm run build`，再 `npm run preview -- --host --port <port>`.

## 变更记录（按时间追加）

- 2025-12-11：创建本协作记录，约定 Layer 接口和 SceneManager 不嵌业务逻辑；前后端分工如上。
- 2025-12-17：重构：抽离 BG/Camera 热开关、toolbar 折叠、UI 透明度、mediaDevices devicechange、Favorites/MIDI/MacroSlots/Inspector 等 controller，统一 unload/HMR 清理；验收：`npm run lint` + `VERIFY_HOST=127.0.0.1 VERIFY_PORT=5176 npm run verify:dev`。
- 2025-12-17：音频/摄像头：DJM 立体声分析 + 三频舞台化 + Meyda 特征；可选 MediaPipe 人像分割（本地资源 `public/vendor/mediapipe/selfie_segmentation`，脚本 `npm run sync:mediapipe`）；验收同上。
- 2025-12-17：Audio/BeatTempo：可选 Essentia.js Worker + Inspector scope `audio.beatTempo`（默认关闭）；验收同上；NOTE：`essentia.js` 为 AGPL-3.0。
- 2025-12-17：构建修复：设置 Vite `worker.format='es'` 以支持 module Worker；验收：`npm run build`。

## 待办 / 交接事项

- 如需新增模块/接口，请在此列出目的、文件路径、对现有代码的约束。
