# 3D Coupling Step 1–3 就绪清单（2026-01-29）

## Step 1：结构
- [ ] Layer/Scene 管线存在且可复现（FG/BG 双层）
- [ ] 输入/输出类型明确（ProjectMLayerSpatialTransform 等）
- [ ] 入口/调用路径明确（SceneManager → Layer）

## Step 2：深度计算
- [ ] Depth 计算范围定义清晰（单位、归一化）
- [ ] Depth 与耦合强度存在可调映射
- [ ] Depth 对视觉可见性有明确影响（UI/日志可验证）

## Step 3：透视投影
- [ ] 透视矩阵参数可配置（FOV/near/far）
- [ ] 偏移/旋转/缩放验收可观察
- [ ] 透视变化不会导致强烈闪烁或崩溃

## 验收信号
- 日志：存在耦合参数输出或状态日志（可检索）
- 画面：FG/BG 叠加具备可辨别深度差异
- 性能：帧时间未出现持续性超限

## 参考
- docs/3D_COUPLED_IMPLEMENTATION_PLAN.md
- src/layers/ProjectM3DCoupling.ExpertOptimized.ts
- src/layers/ProjectMLayer.ts
- src/SceneManager.ts
