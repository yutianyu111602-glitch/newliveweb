# 4k120 Baseline S1-S7 记录表（本地）

> 用于 A0 基线采集。建议每个场景至少运行 60s。
> 每个场景都点一次 Show 区的 “Snapshot” 按钮保存快照文件并记录文件名。

## 快速入口（推荐）

- 可执行计划（repo 内）：`docs/reports/EXECUTION_PLAN_4K120_A0.local.zh.md`
- 自动采集脚本（A0）：`scripts/baseline-a0-s1-s7.mjs`

## 基本信息

- 日期：
- 机器：M3 Ultra MBP 32G
- 浏览器：Chrome / 版本：
- 输出设备：投影 / 电视 / LED
- 分辨率/刷新率（系统实际）：
- 采集路径：直出 / OBS
- 备注（温度/后台程序）：

## S1-S7 记录

### S1: Liquid + 单 PM（最轻）

- 分辨率/Hz：
- Compositor：on/off, targetMode=, size=, DPR cap=
- 图层：Liquid on, PM-FG on, 其它 off
- FPS avg/p95：
- Frame time avg/p95：
- CPU/GPU：
- Snapshot 文件：
- 备注：

### S2: S1 + compositor on

- 分辨率/Hz：
- Compositor：on, targetMode=, size=, DPR cap=
- 图层：Liquid on, PM-FG on
- FPS avg/p95：
- Frame time avg/p95：
- CPU/GPU：
- Snapshot 文件：
- 备注：

### S3: 双 PM（目标形态）

- 分辨率/Hz：
- Compositor：on, targetMode=, size=, DPR cap=
- 图层：Liquid + PM-FG + PM-BG
- FPS avg/p95：
- Frame time avg/p95：
- CPU/GPU：
- Snapshot 文件：
- 备注：

### S4: S3 + Depth（webcam）

- 分辨率/Hz：
- Depth 参数（fps/scale/blur/layers）：
- FPS avg/p95：
- Frame time avg/p95：
- CPU/GPU：
- Snapshot 文件：
- 备注：

### S5: S3 + Depth（ws/idepth）

- 分辨率/Hz：
- Depth 参数（fps/scale/blur/layers）：
- FPS avg/p95：
- Frame time avg/p95：
- CPU/GPU：
- Snapshot 文件：
- 备注：

### S6: S3 + Camera 分割

- 分辨率/Hz：
- Camera 分割：质量/帧率/边缘
- FPS avg/p95：
- Frame time avg/p95：
- CPU/GPU：
- Snapshot 文件：
- 备注：

### S7: S3 + Video 背景

- 分辨率/Hz：
- Video 源/播放率/时长：
- FPS avg/p95：
- Frame time avg/p95：
- CPU/GPU：
- Snapshot 文件：
- 备注：

## 结论

- 主要瓶颈：
- 可接受的降级策略：
- 下一步优化建议：

---

## 2025-12-23 对齐补充（本机）

> 本文件是 A0（S1-S7）基线采集表。若你需要“当前未执行/未验证”的统一清单，请看：
>
> - `docs/reports/DOCS_EXECUTION_AUDIT_2025-12-23.local.zh.md`
