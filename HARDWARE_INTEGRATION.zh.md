# HARDWARE_INTEGRATION（硬件集成与实验性方向）

> 目的：把“需要硬件/实验验证”的想法从 `TODOS.zh.md` 中移出，避免淹没可执行清单。
> 规则：此文档不作为执行 TODO 入口；真正要做的事项，应在 `TODOS.zh.md` 的 Now/Next/Later 中留一条指针 + 验收信号。

---

## iPhone 深度/红外（暗光舞台）

- 背景：地下俱乐部暗光环境下，RGB 摄像头对人像/动作的信号质量有限；深度/红外可能带来更稳定的轮廓与距离信息。

### 路线 A（推荐）：自研 iOS App → WebSocket/WebRTC

- 输出：深度帧（灰度 JPEG / 16-bit depth / RGB-D 之一），以及建议的分辨率与帧率基线（例如 320×240@30fps）。
- 浏览器端：接收深度帧 → 更新纹理 → shader 可视化（热力图/边缘/Sobel）。

### 路线 B：第三方 App/协议

- 目标：验证是否存在现成 App 能稳定输出深度流（含浏览器可接入的协议）。

### 备选硬件

- Intel RealSense D435i：USB，社区方案较多；代价是采购/便携性一般。
- Azure Kinect：精度高但体积更大。

---

## Depth 驱动视觉（概念）

- Depth → ProjectM：将“靠近/远离/手势大小/深度梯度”映射为虚拟控制信号，注入到 ProjectM（类似现有 `portraitEdge → ProjectM`，但信号更偏 3D）。
- 多相机混合：RGB（色彩）+ Depth（轮廓）在 shader 中融合，强调主体轮廓。
- 手势识别：MediaPipe Hands（可结合 Depth）识别 3D 手势并映射宏/参数。
- 多人追踪：多主体 segmentation/追踪（需要更强模型与性能预算）。

---

## 文档对齐（当且仅当进入实施）

- 若深度输入正式进入路线：
  - 在 `MASTER_SPEC.zh.md` 追加“深度输入能力/兼容性约束/验收信号”。
  - 在 `DATA_INTERFACES.zh.md` 追加“DepthFrame 接口字段/传输协议/采样频率”。
