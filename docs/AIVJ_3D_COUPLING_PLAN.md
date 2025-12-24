# newliveweb AIVJ 3D 多维参数耦合系统 - 设计文档

> 说明（2025-12-19 收敛）：本文是“设计/思路”文档，不作为 P0/P1 可执行清单。
>
> - 可执行入口：`TODOS.zh.md`
> - 未完成项集中汇总：`docs/reports/UNFINISHED_TODOS_ROADMAP.local.zh.md`

## 🎯 核心目标

创建一个**3D 深度联动系统**，让 ProjectM、LiquidMetal、Camera、Depth 等图层之间通过多维参数耦合产生牛逼的视觉效果，而不是简单的透明度叠加。

---

## 📊 现有参数全景图（All Controllable Parameters）

### 1. ProjectM Layer（Milkdrop Presets）

| 参数名                    | 变量                                 | 范围        | 消费者            | 作用                               |
| ------------------------- | ------------------------------------ | ----------- | ----------------- | ---------------------------------- |
| **opacity**               | `projectLayer.baseOpacity`           | 0-1         | Three.js Material | 整体可见度                         |
| **blendMode**             | `projectLayer.blendMode`             | enum (8 种) | Three.js Material | 混合模式（add/screen/multiply 等） |
| **energyToOpacityAmount** | `projectLayer.energyToOpacityAmount` | 0-1         | Update loop       | 音频能量驱动的透明度增益           |
| **audioDrivenOpacity**    | `projectLayer.audioDrivenOpacity`    | bool        | Update loop       | 是否启用音频响应                   |
| **presetUrl**             | 外部传入                             | string      | ProjectMEngine    | 当前预设文件路径                   |

**特殊能力**：

- ProjectM 自带的预设内部算法（无法从外部精确控制）
- 可以接收 PCM 音频数据 (`addAudioData`)
- 有 `avgLumaSampling` 功能（闭环 PI 控制）

---

### 2. LiquidMetal Layer（背景 shader）

| 参数名               | 变量                         | 范围                           | 消费者                     | 作用                                  |
| -------------------- | ---------------------------- | ------------------------------ | -------------------------- | ------------------------------------- |
| **variant**          | `liquidLayer.params.variant` | enum (metal/waves/stars/lines) | Shader 材质切换            | 4 种算法                              |
| **opacity**          | `params.opacity`             | 0-1                            | Shader `uOpacity`          | 整体透明度                            |
| **timeScale**        | `params.timeScale`           | 0-5                            | Shader `uTimeScale`        | 动画速度                              |
| **iterations**       | `params.iterations`          | 1-20                           | Shader `uIterations`       | 递归迭代次数（复杂度）                |
| **waveAmplitude**    | `params.waveAmplitude`       | 0-2                            | Shader `uWaveAmplitude`    | 波浪振幅                              |
| **mouseInfluence**   | `params.mouseInfluence`      | 0-5                            | Shader `uMouseInfluence`   | 鼠标交互强度                          |
| **metallicAmount**   | `params.metallicAmount`      | 0-1                            | Shader `uMetallicAmount`   | 金属度                                |
| **metallicSpeed**    | `params.metallicSpeed`       | 0-5                            | Shader `uMetallicSpeed`    | 金属闪烁速度                          |
| **brightness**       | `params.brightness`          | 0-3                            | Shader `uBrightness`       | 亮度（受音频能量影响）                |
| **contrast**         | `params.contrast`            | 0.5-2                          | Shader `uContrast`         | 对比度                                |
| **tintHue**          | `params.tintHue`             | 0-1                            | Shader `uTintHue`          | 色相调色                              |
| **tintStrength**     | `params.tintStrength`        | 0-1                            | Shader `uTintStrength`     | 染色强度                              |
| **paletteStrength**  | `params.paletteStrength`     | 0-1                            | Shader `uPaletteStrength`  | 调色板强度                            |
| **audioReactive**    | `params.audioReactive`       | bool                           | Update loop                | 是否响应音频                          |
| **audioSensitivity** | `params.audioSensitivity`    | 0-2                            | Shader `uAudioSensitivity` | 音频灵敏度                            |
| **audioBands**       | `currentAudioBands`          | AudioBands                     | Shader uniforms            | 低中高频段能量（uAudioBass/Mid/High） |
| **audioEnergy**      | `currentAudioEnergy`         | 0-1                            | Brightness 计算            | 整体能量 → 亮度增益                   |

---

### 3. Camera Layer（摄像头）

| 参数名            | 变量                        | 范围   | 消费者                 | 作用             |
| ----------------- | --------------------------- | ------ | ---------------------- | ---------------- |
| **opacity**       | `cameraLayer.opacity`       | 0-1    | Three.js Material      | 透明度           |
| **enabled**       | `cameraLayer.enabled`       | bool   | Mesh visibility        | 开关             |
| **deviceId**      | 内部状态                    | string | getUserMedia           | 摄像头设备 ID    |
| **segmentPerson** | `cameraLayer.segmentPerson` | bool   | MediaPipe              | 是否启用人像分割 |
| **edge01**        | LiDAR 输出                  | 0-1    | Portrait Edge Coupling | 人像边缘检测强度 |
| **area01**        | LiDAR 输出                  | 0-1    | Portrait Edge Coupling | 人像面积占比     |

---

### 4. Depth Layer（深度雷达）

| 参数名      | 变量                 | 范围  | 消费者             | 作用         |
| ----------- | -------------------- | ----- | ------------------ | ------------ |
| **opacity** | `depthLayer.opacity` | 0-1   | Shader `u_opacity` | 整体透明度   |
| **fog**     | `depth.fog`          | 0-3   | Shader `u_fog`     | 雾效强度     |
| **edge**    | `depth.edge`         | 0-3   | Shader `u_edge`    | 边缘检测强度 |
| **blur**    | `depth.blur`         | 0-30  | Canvas blur()      | 模糊半径     |
| **noise**   | `depth.noise`        | 0-1   | Shader `u_noise`   | 噪声颗粒度   |
| **layers**  | `depth.layers`       | 1-30  | Shader `u_layers`  | 深度分层数量 |
| **bw**      | `depth.bw`           | 0-1   | Shader `u_bw`      | 黑白混合度   |
| **fall**    | `depth.fall`         | 0-2   | Shader `u_fall`    | 远近衰减     |
| **scale**   | `depth.scale`        | 0.5-2 | Shader `u_scale`   | 深度缩放     |

---

### 5. Macro System（宏控制）

| 参数名         | 变量             | 范围 | 消费者              | 作用                                         |
| -------------- | ---------------- | ---- | ------------------- | -------------------------------------------- |
| **fusion**     | `macros.fusion`  | 0-1  | `computeMacroPatch` | ProjectM 存在感（主轴）                      |
| **motion**     | `macros.motion`  | 0-1  | `computeMacroPatch` | 动态/复杂度（liquid timeScale/depth layers） |
| **sparkle**    | `macros.sparkle` | 0-1  | `computeMacroPatch` | 锐利度/颗粒感（depth edge/noise）            |
| **slots[0-7]** | `slots[].value`  | 0-1  | `computeMacroPatch` | 8 个插槽驱动多维参数偏移                     |

**Macro 影响矩阵**（来自 `computeMacroPatch.ts`）：

```typescript
// Fusion → ProjectM Presence
projectmOpacity = base + fusion * 0.15 + slot0 * 0.18;
energyToOpacityAmount = base + motion * 0.2 + slot0 * 0.08;

// Motion → Liquid动画速度/Depth复杂度
liquidTimeScale = base + motion * 0.6 + slot3 * 0.25;
depthLayers = base + motion * 6 + slot1 * 4;

// Sparkle → Depth锐利度/Liquid金属感
metallicAmount = base + sparkle * 0.25 + slot2 * 0.22;
depthEdge = base + sparkle * 0.15 + slot4 * 0.18;
```

---

### 6. Overlay Budget System（图层能量预算）

**核心算法**：`computeOverlayBudgetAllocation()`

**作用**：当多个背景图层同时激活时，根据总能量（所有 opacity 之和）动态缩放每个图层的 opacity，避免过曝。

**关键参数**：
| 参数名 | 默认值 | 作用 |
|--------|--------|------|
| **maxEnergy** | 1.15 | 能量上限阈值 |
| **depthWeight** | 1.4 | Depth 层权重（因为是叠加混合） |
| **priorityBasic/Camera/Video/Depth** | 1/1/1/0.65 | 各图层竞争优先级 |
| **pmRetreatStrength** | 0.45 | ProjectM 存在时，背景退让强度 |
| **pmRetreatFloor** | 0.55 | 最小保留比例 |

**算法精髓**（形成 3D 纵深感的关键）：

```typescript
// PM存在时，压缩maxEnergy
pmPresence01 = (fusion - 0.5) * 2; // fusion 0.5-1 映射到 0-1
maxEnergy_adjusted = maxEnergy * (1 - pmRetreatStrength * pmPresence01);

// 当 energy > maxEnergy 时，按优先级分配
if (energy > maxEnergy) {
  sBasic = (eBasic / energy) ^ ((1 / priorityBasic) * targetScale);
  sDepth = (eDepth / energy) ^ ((1 / priorityDepth) * targetScale);
  // ... 低优先级图层被压制更强
}
```

---

### 7. Audio Coupling Runtime（音频耦合）

**机制**：通过 `applyAudioCouplingRuntime()` 在 runtime 动态调整参数（不改变 state）

**配置来源**：`getAudioControlsValues()` 读取 UI 或默认配置

| 参数名               | 作用                                         |
| -------------------- | -------------------------------------------- |
| **amounts.projectm** | ProjectM 参数受音频 coupling 影响的量（0-1） |
| **amounts.liquid**   | Liquid 参数受音频 coupling 影响的量（0-1）   |
| **amounts.depth**    | Depth 参数受音频 coupling 影响的量（0-1）    |

**混合公式**：

```typescript
scale = (base: number, next: number, amount01: number) => {
  return base + (next - base) * amount;
};
```

---

### 8. Portrait Edge Coupling（人像边缘耦合）

**触发条件**：Camera Layer 启用且 `segmentPerson=true`

**输出**：

- `edge01`: 边缘检测强度 (0-1)
- `area01`: 人像面积占比 (0-1)

**影响**：

```typescript
// 人像边缘 → 增强ProjectM能量响应
energyToOpacityAmount = baseAmt + 0.45 * edge01;
projectmOpacity = baseOpacity + 0.18 * edge01;
```

---

## 🌌 现有的 3D 耦合机制（已实现但可能被忽视）

### 机制 1：Overlay Budget（图层竞争）

- **3D 效果**：多图层激活时，高优先级图层"挤压"低优先级图层
- **深度感来源**：ProjectM（前景）存在时，背景自动退让（pmRetreat）

### 机制 2：Macro → Multi-Layer Coupling

- **3D 效果**：一个宏旋钮同时影响多个图层的多个参数
- **深度感来源**：
  - `motion` 增加 → liquid 速度+depth 复杂度同步提升 → 背景和深度层"共振"
  - `sparkle` 增加 → liquid 金属感+depth 锐利度同步提升 → 整体质感一致性

### 机制 3：Audio Coupling（音频驱动全局）

- **3D 效果**：音频能量同时影响 ProjectM 透明度、Liquid 亮度、Depth 雾效
- **深度感来源**：所有图层对音频的响应是协调的，而不是独立抖动

### 机制 4：Portrait Edge → ProjectM Boost

- **3D 效果**：人像出现时，ProjectM 自动增强，产生"人物-背景"分离感
- **深度感来源**：前景（人像）驱动中景（ProjectM）压制背景（Liquid/Depth）

---

## 🚀 AIVJ 最终目标：3D 参数耦合增强计划

### 问题诊断

**当前问题**：

1. ❌ 用户可能不知道已有的耦合机制
2. ❌ ProjectM 模块 UI 过于简单（只有 opacity/blendMode）
3. ❌ 宏旋钮的影响不够直观（需要可视化反馈）
4. ❌ 图层之间的联动不够"酷炫"（缺少视觉震撼）

### 解决方案

#### 方案 A：增强现有耦合可视化（保守方案）

**不修改核心算法，只优化 UI 反馈**

1. **ProjectM 融合面板增强**：

   - 添加"纵深模式"开关 → 控制 `pmRetreatStrength`
   - 实时显示 Overlay Budget 状态（哪些层被压制了）
   - 可视化 energyToOpacityAmount 的影响

2. **宏旋钮增强**：

   - 每个宏旋钮旁边显示"影响范围"标签（fusion→PM+BG 退让，motion→ 速度+复杂度）
   - 添加"联动预览"：调节宏时，实时显示哪些图层的哪些参数会变化

3. **图层状态面板**：
   - 显示当前每个图层的实际 opacity（runtime 值，非 state 值）
   - 显示 Budget 分配比例（basic 80%, depth 45% 等）

#### 方案 B：增强算法耦合（激进方案）

**添加新的 3D 耦合维度**

1. **深度传播（Depth Propagation）**：

   - Depth 层的 fog 强度 → 影响 Liquid 的 metallicAmount
   - Depth 层的 edge 强度 → 影响 ProjectM 的 energyToOpacityAmount
   - **效果**：深度场景越复杂，整体视觉越"立体"

2. **颜色共振（Color Resonance）**：

   - ProjectM 的平均亮度（avgLuma）→ 影响 Liquid 的 brightness 和 tintHue
   - Liquid 的 tintHue → 影响 Depth 的 bw（色彩饱和度联动黑白度）
   - **效果**：颜色在图层间"传递"，形成和谐

3. **节奏级联（Rhythm Cascade）**：

   - BPM 检测 → 同步驱动 Liquid 的 timeScale 和 Depth 的 layers 切换
   - Beat 检测（置信度 C） → 瞬间 boost 所有图层的对比度/锐利度
   - **效果**：音乐节拍时，所有图层同步"爆发"

4. **空间扭曲（Spatial Warping）**：
   - Liquid 的 waveAmplitude → 影响 Depth 的 scale（波浪越大，深度越扭曲）
   - ProjectM 的 blend 模式 → 影响 Liquid 的 variant 切换（add→waves, multiply→metal）
   - **效果**：图层之间形成"物理"互动

#### 方案 C：新增"AIVJ 自动导演"模式

**AI 驱动的参数联动**

1. **场景识别器**：

   - 检测音频类型（techno/ambient/rock） → 自动调整 macro 初值
   - 检测人像数量 → 自动调整 Camera 的影响强度
   - 检测深度复杂度 → 自动平衡 Depth 权重

2. **动态预设链**：
   - 根据音频能量/BPM/频谱特征，自动切换 ProjectM 预设
   - 根据 macro 状态，自动切换 Liquid variant
   - **效果**：整个系统像"活的"，自己跳舞

---

## 📋 实现计划（Todos）

### Phase 1: 参数文档化（本文档）

- [x] 列出所有可调参数
- [x] 标注变量名、范围、消费者
- [x] 绘制现有耦合机制图

### Phase 2: UI 增强（方案 A）

- [x] **Task 1**: 扩展 ProjectM 控制面板

  - 添加 `pmRetreatStrength` 滑块
  - 添加 `energyToOpacityAmount` 可视化指示器
  - 添加 "Budget Status" 实时显示（各图层实际 opacity）

- [x] **Task 2**: 宏旋钮可视化增强

  - 每个宏旋钮下方添加"影响标签"
  - 调节时高亮受影响的参数（UI 闪烁或颜色变化）
  - 已落地：宏旋钮变动触发 strip pulse（标签高亮 + 轻微动效）

- [x] **Task 3**: 创建"图层联动监视器"
  - 新增右侧面板，显示所有图层的 runtime 状态
  - 显示 Budget 分配、Coupling 影响量
  - 已落地：Diagnostics "Layers" 行展示运行时 opacity 与 PM 耦合驱动

### Phase 3: 算法增强（方案 B - 可选）

- [x] **Task 4**: 实现深度传播（Depth → Liquid/ProjectM）

  - 在 `applyAudioCouplingRuntime()` 中添加新的 coupling 规则
  - `liquidMetallicAmount += depthFog * 0.3`
  - `projectmEnergyAmt += depthEdge * 0.2`

- [x] **Task 5**: 实现颜色共振（ProjectM avgLuma → Liquid tint）

  - 读取 `projectLayer.avgLuma`
  - 动态调整 `liquidLayer.params.tintHue = avgLuma * 0.6`
  - 动态调整 `liquidLayer.params.brightness = avgLuma * 1.5`

- [x] **Task 6**: 实现节奏级联（BPM → TimeScale/Layers）

  - 监听 `beatTempoAnalyzer` 的 BPM 事件
  - `liquidTimeScale = baseTimeScale * (BPM / 120)`
  - `depthLayers = baseLayers + (BPM - 100) * 0.1`

- [x] **Task 7**: 实现空间扭曲（WaveAmplitude → Depth Scale）
  - `depthScale = baseScale + liquidWaveAmplitude * 0.3`
  - `depthBlur = baseBlur + liquidWaveAmplitude * 5`

### Phase 4: AI 自动导演（方案 C - 长期目标）

- [x] **Task 8**: 场景识别器

  - 分析音频频谱，分类为 techno/ambient/rock
  - 根据类型预设 macro 初值（techno→ 高 fusion, ambient→ 低 motion）

- [x] **Task 9**: 动态预设链
  - 根据 energy 变化自动切换 ProjectM 预设
  - 根据 macro 状态切换 Liquid variant

---

## 🎨 参数耦合矩阵（Coupling Matrix）

| 源参数                          | 目标参数                       | 耦合强度              | 效果描述                 |
| ------------------------------- | ------------------------------ | --------------------- | ------------------------ |
| **macro.fusion**                | projectm.opacity               | 0.15                  | Fusion↑ → PM 更亮        |
| **macro.fusion**                | overlay.pmRetreat              | 0.45                  | Fusion↑ → 背景退让       |
| **macro.motion**                | liquid.timeScale               | 0.6                   | Motion↑ → 背景更动态     |
| **macro.motion**                | depth.layers                   | 6.0                   | Motion↑ → 深度更复杂     |
| **macro.sparkle**               | liquid.metallicAmount          | 0.25                  | Sparkle↑ → 金属感增强    |
| **macro.sparkle**               | depth.edge                     | 0.15                  | Sparkle↑ → 边缘更锐利    |
| **audio.energy**                | liquid.brightness              | 0.9                   | 能量 ↑ → 背景更亮        |
| **audio.energy**                | projectm.opacity               | energyToOpacityAmount | 能量 ↑ → PM 动态透明度   |
| **camera.edge01**               | projectm.energyToOpacityAmount | 0.45                  | 人像边缘 ↑ → PM 响应增强 |
| **overlayBudget.energy**        | all.opacity                    | scale 函数            | 总能量超限 → 所有层压缩  |
| **depth.fog** (新增)            | liquid.metallicAmount          | 0.3                   | 雾效 ↑ → 金属感 ↑        |
| **projectm.avgLuma** (新增)     | liquid.tintHue                 | 0.6                   | PM 亮度 ↑ → 背景色相变化 |
| **BPM** (新增)                  | liquid.timeScale               | BPM/120               | 节奏快 → 动画快          |
| **liquid.waveAmplitude** (新增) | depth.scale                    | 0.3                   | 波浪大 → 深度扭曲        |

---

## 💡 推荐实施顺序

1. **立即实施**（提升现有效果）：

   - Phase 2, Task 1-3（UI 增强）
   - 让用户看到现有的 3D 耦合机制

2. **短期实施**（1-2 周）：

   - Phase 3, Task 4-5（深度传播+颜色共振）
   - 这两个效果最直观，技术难度中等

3. **中期实施**（1 个月）：

   - Phase 3, Task 6-7（节奏级联+空间扭曲）
   - 需要重构部分 audio routing 逻辑

4. **长期愿景**（3-6 个月）：
   - Phase 4（AI 自动导演）
   - 需要机器学习/模式识别技术

---

## 🔧 技术实现建议

### 1. 新增耦合规则的位置

**位置 A**：`applyAudioCouplingRuntime()` 函数（runtime 修改）

- 优点：不影响 state，可以临时实验
- 缺点：刷新页面后失效

**位置 B**：`computeMacroPatch()` 函数（macro 计算）

- 优点：与现有 macro 系统一致
- 缺点：需要扩展 macro 输入源

**位置 C**：新增 `applyLayerCouplingRuntime()` 函数

- 优点：职责清晰，易于调试
- 缺点：增加代码复杂度

**推荐**：Phase 3 使用位置 C，Phase 4 整合到位置 B

### 2. 参数读取模式

```typescript
// 读取ProjectM的avgLuma
const avgLuma = projectLayer.engine?.getAvgLuma() ?? 0.5;

// 读取Depth的fog
const depthParams = (lastVisualState.background.layers?.depth as any) ?? {};
const depthFog = Number(depthParams.fog ?? 1.1);

// 读取Liquid的waveAmplitude
const liquidWaveAmp = liquidLayer.params.waveAmplitude;
```

### 3. 参数写入模式（Runtime）

```typescript
// 方法1：直接修改layer对象
liquidLayer.params.metallicAmount += depthFog * 0.3;
liquidLayer.updateParams();

// 方法2：通过registry（推荐）
backgroundRegistry.applyParams("liquid", {
  metallicAmount: baseMetallicAmount + depthFog * 0.3,
});

// 方法3：通过state patch
applyBackgroundLayerPatch(
  "liquid",
  {
    metallicAmount: newValue,
  },
  "runtime"
);
```

---

## 📚 相关文件清单

- `src/app/bootstrap.ts` (主逻辑，4900+ 行)
- `src/layers/ProjectMLayer.ts` (ProjectM 封装，389 行)
- `src/layers/LiquidMetalLayerV2.ts` (Liquid shader，637 行)
- `src/layers/DepthLayer.ts` (深度效果，~800 行)
- `src/features/macros/computeMacroPatch.ts` (宏计算，~350 行)
- `src/app/visualStateController.ts` (状态管理，~300 行)
- `src/state/paramSchema.ts` (参数定义，1273 行)

---

**总结**：newliveweb 已经有很强大的 3D 耦合基础（Overlay Budget、Macro System、Audio Coupling），但需要：

1. **UI 可视化**让用户理解这些机制
2. **新增跨层耦合**（深度传播、颜色共振）让效果更震撼
3. **AI 自动化**让系统"自己表演"

现在你有完整的参数地图和实施计划了！🚀
## 未验证项目
- Task 1/2/4/5/6/7/8/9：已实现，未做现场验证
- Task 3：已实现联动监视器，但未做现场验证
