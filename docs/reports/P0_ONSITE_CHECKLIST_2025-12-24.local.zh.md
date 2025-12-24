# P0 现场验收清单（local · 2025-12-24）

> 目标：先把 `TODOS.zh.md` 的所有 `[!]` 条目跑通并留痕。
>
> 前置：
>
> - dev server：`http://127.0.0.1:5174/`
> - 监控：`powershell -NoProfile -ExecutionPolicy Bypass -File c:\Users\pc\code\scripts\ncm-watcher-status.ps1`
>
> 记录规则：每项写 `PASS/FAIL` + 1 句原因（失败时写“下一步怎么复现/怎么查日志”）。

---

## 0) 今日环境信息

- 时间：****\_\_****
- 机器/显示：****\_\_****
- 音频输入源（Use input/Use system/Track）：****\_\_****
- 摄像头设备：****\_\_****
- iDepth ws 地址（如用）：****\_\_****
- Video src（如用）：****\_\_****

---

## 1) Camera 图层可见

- 目标：`Camera` 开启后画面可见，`Camera opacity` 生效。
- 结果：[ ] PASS / [ ] FAIL
- 备注：****\_\_****

## 2) Depth iDepth 连接闭环

- 目标：Depth source 选择 `iDepth`；`depth-status` 进入 connected/frames>0；效果可见。
- 操作提示：Console 执行 `localStorage.setItem('nw.depth.idepthUrl','ws://127.0.0.1:9002')`（按实际改）。
- 结果：[ ] PASS / [ ] FAIL
- 备注：****\_\_****

## 3) 图层开关/控件接线生效

- 目标：`Basic/Camera/Video/Depth/Liquid` 任意 toggle/opacity 在 1s 内影响画面。
- 结果：[ ] PASS / [ ] FAIL
- 备注：****\_\_****

## 4) 音频链路持续更新

- 目标：波形持续刷新；`Level/Energy` 动态；`BPM/Conf` 不长期为 0/--。
- 结果：[ ] PASS / [ ] FAIL
- 备注：****\_\_****

## 5) Use input / Use system 点击后无需额外点击

- 目标：点击按钮完成权限/选择后，1–2s 内出现电平/波形（不需要再点页面）。
- 结果：[ ] PASS / [ ] FAIL
- 备注：****\_\_****

## 6) Loopback 电平可读

- 目标：节目音量下不长期卡 1–5%；静音接近 0；monitor 开启不明显削波。
- 结果：[ ] PASS / [ ] FAIL
- 备注：****\_\_****

## 7) Video src 入口闭环

- 目标：Video state 进入 playing 或明确失败态；失败时 `Retry video` 可恢复。
- 结果：[ ] PASS / [ ] FAIL
- 备注：****\_\_****

## 8) 波形 + BPM/Conf UI 有输出

- 目标：波形框不空白；`E xx%` 变化；几秒后 `BPM nnn` 与 `C xx%` 出现。
- 结果：[ ] PASS / [ ] FAIL
- 备注：****\_\_****

---

## 9) 失败时怎么查（不跑 verify）

- 浏览器 Console：看权限/设备/WS 连接错误。
- watcher/tray：`C:\ProgramData\ncm_watcher\tray.log`、`watcher.err.log`
- 若需要对比旧长跑产物：`newliveweb/artifacts/headless-runs/2025-12-23T22-52-27/verify/browser-console.log`
