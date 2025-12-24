# newliveweb AI 并行协作看板（文件占用/冲突避免）

> 用法：每位 AI 开始改代码前，把“准备修改的文件”写到 Claim 区；做完后移到 Done，并写一句验收信号。
> 目标：减少“同文件大冲突”与“重复实现”。

---

## Claim（正在进行）

> 格式：
>
> - AI: <name>
> - Scope: <1 句话>
> - Files:
>   - path
> - Done signal: <UI/日志/verify 产物>

- AI: (empty)

  - Scope:
  - Files:
  - Done signal:

---

## Done（已完成）

> 格式同上，并补一行“Notes（若有坑）”。

- AI: GPT-5.2 (Codex)

  - Scope: A) 本地音频输入（MediaStream）+ 设备选择 UI + Diagnostics 输入源观测
  - Files:
    - src/audio/StreamAudioProcessor.ts
    - src/audio/AudioBus.ts
    - src/app/renderShell.ts
    - src/app/bootstrap.ts
    - src/features/console/DiagnosticsPanel.ts
    - README.md / MASTER_SPEC.zh.md / DATA_INTERFACES.zh.md / LOCAL_DEV_GUIDE.md
  - Done signal: UI “Use input” 调用 `AudioBus.loadInputDevice`；Diagnostics 显示 `source=stream` + input label；音量默认 0；可切回 Track
  - Notes: 需在 macOS/Chrome/Safari 现场验证权限与 secure context；未授权前设备 label 为空属于正常现象

- AI: GPT-5.2 (Codex)
  - Scope: B) camera/video 背景护栏 + 状态可见性 + 移除遗留直写入口
  - Files:
    - src/layers/VideoLayer.ts
    - src/layers/CameraLayer.ts
    - src/app/bootstrap.ts
    - src/features/console/DiagnosticsPanel.ts
    - src/background/backgroundRegistry.ts
    - TODOS.zh.md
  - Done signal: Diagnostics 显示 `bg=` 与 `bgStatus=`；camera 在 error/拒权时自动回退 liquid；video src 为空/播放被拒会给短提示且可点 Retry；全仓仅 backgroundRegistry 直写 params；`npm run lint` + `npm run verify:dev` 通过
  - Notes: `npm run verify:headless` 不会自动起 dev server，验收请用 `verify:dev`

- AI: GPT-5.2 (Codex)
  - Scope: C) 演出模式一键配置（Show config）+ MIDI bindings UX + Video 用户手势重试
  - Files:
    - src/app/renderShell.ts
    - src/app/bootstrap.ts
    - src/layers/VideoLayer.ts
    - src/features/settings/settingsStore.ts
    - DATA_INTERFACES.zh.md
    - MASTER_SPEC.zh.md
    - TODOS.zh.md
  - Done signal: `Save show` 写入 `newliveweb:showConfig:v1`，`Show` 可恢复音频偏好 + `VisualStateV2`；工具栏显示 `Bindings: N` 且支持 `Clear`；Video autoplay 被拒时可点 `Retry video` 手动重试
  - Notes: `Show` 按钮被加入“首个手势不自动加载测试音轨”的白名单（避免误触发 Track 自动加载）
