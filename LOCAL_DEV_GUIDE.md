# newliveweb · 本地运行与状态交接

> 日期：2025-12-11  
> 适用场景：自测、排障、交接给下一位同事

## 1. 模块总览

| 模块 | 位置 | 说明 |
| --- | --- | --- |
| 可视化入口 | src/main.ts | 构建 UI，加载 manifest，管理 ProjectM + LiquidMetal 层，音频驱动、全局随机与收藏 |
| Three.js 场景 | src/SceneManager.ts | 统一管理 renderer、camera、layer 渲染周期 |
| 液态金属层 | src/layers/LiquidMetalLayerV2.ts | Shader 与参数接口，支持音频频段驱动 |
| ProjectM 层 | src/layers/ProjectMLayer.ts | 封装 ProjectMEngine，负责预设加载与透明度调节 |
| 音频控制 | src/audio/AudioController.ts | 封装 StreamAudioProcessor，向上层提供 `AudioData` |
| Manifest 工具 | smelter-win/* | 预设扫描/筛选/wasm 兼容检查，生成 `public/presets*/library-manifest*.json` |

## 2. 当前功能亮点

1) **多库模式**：在 `presetLibraries.ts` 间切换 “大库/大库安全/精选/精选安全”，可开启 `requireWasmSafe` 过滤。  
2) **全局随机**：`Random visual` 按钮与 `R` 快捷键，基于当前音频能量（peak/rms）同步随机 ProjectM 预设、LiquidMetal 参数、ProjectM 透明度。  
3) **收藏系统**：`★ Favorite` 将当前预设、LiquidMetal 参数、ProjectM 透明度存入 localStorage；`Favorites: N` 打开侧边列表，支持一键恢复和删除。  
4) **WASM 兼容提示**：`getCompatNote()` 会把 `wasmCompat` 的 errorType/message 附加到预设加载错误，便于定位不兼容预设。

## 3. 已知问题与优化点

| 分类 | 问题 | 说明 |
| --- | --- | --- |
| Dev Server | 端口总回到 5173、浏览器 404 | VS Code 内嵌 PowerShell 结束命令后会收回控制权，进程退出；且若存在 vite.config.js 可能覆盖 vite.config.ts。需用外部终端并确保配置唯一。 |
| Favorites | 数据不同步/无上限 | 随机或恢复后控制面板 slider 未刷新；localStorage 没有数量上限。 |
| 音频能量 | 未做平滑 | 直接用 `max(peak, rms*1.5)` 驱动，可能过于激进，建议后续加 EMA/滑动窗口。 |
| ProjectM 透明度 | 缺少 clamp | 随机后最高可能 >1，建议后续 `Math.min(1, value)`。 |
| Manifest 安全性 | `projectm-preset-probe` 仍在启动即崩 | `check-wasm-compat` 输出大量 `probe_no_output`，wasmCompat 暂难提供真实信息，需后续 C++ 调试。 |
| Mixxx 接入 | 入口未完成 | 未来需要专用“连接 Mixxx”按钮、断线重连与状态展示。 |
| 预设随机 | 可能落在无 manifest 场景 | `applyRandomVisualState` 直接随机 `getAllPresets()`；若 manifest 为空不会加载新预设但仍会随机参数，建议后续增加“无可用预设”提示。 |

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

1) **修复 CLI & 生成 wasm-safe manifest**：定位 `projectm-preset-probe` 启动崩溃，跑通 `check-wasm-compat`，在前端 `presetLibraries` 增加“极致安全”模式指向 wasm-safe。  
2) **强化随机/收藏体验**：  
   - 引入能量平滑（EMA/滑窗），增加强度模式（ambient/aggressive）；  
   - 外部修改后刷新控制面板 UI；  
   - 为收藏设置上限并支持导出/清空。  
3) **Mixxx 流接入**：增加“连接 Mixxx”按钮，配置 Icecast/HTTP，提供状态指示与重连。  
4) **音频触发扩展**：在 `AudioController` 中增加节拍/速度估计，用于自动轮播或随机的智能触发。
