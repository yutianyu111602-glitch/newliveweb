# AIVJ 核心变量清单（参数字典）

> 用于快速查询变量名、作用、范围和消费者关系

---

## 0. 参数收藏 / 收藏夹（Task C - P0）

### 0.1 localStorage 存储键

| Key                       | 类型                            | 作用                   | 写入者                      | 读取者                       |
| ------------------------- | ------------------------------- | ---------------------- | --------------------------- | ---------------------------- |
| `newliveweb:favorites:v2` | `FavoriteVisualState[]`（JSON） | 收藏夹数据（当前版本） | `bootstrap.ts`（收藏/删除） | `bootstrap.ts`（启动加载）   |
| `newliveweb:favorites:v1` | `FavoriteVisualState[]`（JSON） | 旧版收藏（已弃用）     | 历史版本                    | 启动时会清理（避免过时参数） |

### 0.2 FavoriteVisualState 结构（概念）

| 字段        | 类型             | 说明                                                     |
| ----------- | ---------------- | -------------------------------------------------------- |
| `id`        | `string`         | 收藏项唯一 ID                                            |
| `createdAt` | `string`         | ISO 时间戳                                               |
| `label`     | `string \| null` | 显示名称（通常是 preset 名/URL）                         |
| `state`     | `VisualStateV2`  | 视觉状态快照（含 background + projectm + global/macros） |

### 0.3 UI 入口（可发现性）

- 工具栏按钮：`#visual-favorite`（点击保存收藏）
- 收藏计数：`#visual-favorite-count`（显示为“收藏:N”，点击打开收藏夹）
- 收藏面板：`src/features/favorites/FavoritesPanel.ts`（Load/参数/删除/对比）

## 1. 音频输入系统变量（Task B - 修复中）

> 说明：当前代码里 `StreamAudioProcessor` 已支持 stream 输入与 seek/currentSource；缺口主要在 `AudioBus`（尚未暴露输入设备/MediaStream 的封装 API）。

### 1.1 AudioBus 核心字段

| 变量名           | 类型                                              | 默认值      | 作用                                               | 读取者                                 | 写入者                             |
| ---------------- | ------------------------------------------------- | ----------- | -------------------------------------------------- | -------------------------------------- | ---------------------------------- |
| `streamLabel`    | `string \| null`                                  | `null`      | （待实现）输入设备显示名称（如"麦克风 (Realtek)"） | UI 状态栏、Diagnostics                 | loadInputDevice、loadMediaStream   |
| `streamDeviceId` | `string \| null`                                  | `null`      | （待实现）音频输入设备唯一 ID                      | localStorage、refreshAudioInputDevices | loadInputDevice                    |
| `streamKind`     | `'default' \| 'device' \| 'display' \| 'unknown'` | `'unknown'` | （待实现）音频源分类（默认/设备/系统音频/未知）    | UI 标签判断                            | loadInputDevice、loadMediaStream   |
| `ready`          | `boolean`                                         | `false`     | 音频系统是否就绪                                   | play、pause、toggle                    | loadFile、loadUrl、loadInputDevice |
| `processor`      | `StreamAudioProcessor`                            | -           | 底层音频处理引擎                                   | 所有音频方法                           | 构造函数                           |
| `latestFrame`    | `AudioFrame \| null`                              | `null`      | 最新一帧音频数据                                   | getSnapshot、所有 listeners            | startLoop                          |
| `listeners`      | `Set<AudioFrameListener>`                         | `new Set()` | 订阅者列表                                         | startLoop                              | onFrame、subscribe                 |

### 1.2 AudioBus 方法签名

| 方法名            | 签名                                                                | 返回值          | 作用                                    | 调用场景                        |
| ----------------- | ------------------------------------------------------------------- | --------------- | --------------------------------------- | ------------------------------- |
| `loadFile`        | `(file: File) => Promise<void>`                                     | -               | 加载本地音频文件                        | 用户拖拽文件、file input        |
| `loadUrl`         | `(url: string) => Promise<void>`                                    | -               | 加载网络音频 URL（当前实现）            | 用户输入 URL、测试曲目          |
| `loadUrl`         | `(url: string, opts?: { loop?: boolean }) => Promise<void>`         | -               | （待实现）支持传 loop 等参数            | audioTransportController        |
| `loadInputDevice` | `(deviceId?: string) => Promise<void>`                              | -               | （待实现）加载麦克风/声卡输入           | "Use input"按钮点击             |
| `loadMediaStream` | `(stream: MediaStream, opts?: { label?: string }) => Promise<void>` | -               | （待实现）加载 MediaStream              | "系统音频"按钮、getDisplayMedia |
| `play`            | `() => void`                                                        | -               | 播放音频                                | Toggle 按钮、自动播放           |
| `pause`           | `() => void`                                                        | -               | 暂停音频                                | Toggle 按钮                     |
| `toggle`          | `() => void`                                                        | -               | 切换播放/暂停                           | 空格键、Toggle 按钮             |
| `seek`            | `(timeSec: number) => void`                                         | -               | （待实现）跳转到指定时间（仅 file/url） | seekSlider 拖动                 |
| `setVolume`       | `(volume: number) => void`                                          | -               | 设置音量（0..1）                        | volumeSlider 拖动               |
| `setLoop`         | `(loop: boolean) => void`                                           | -               | 设置是否循环播放                        | UI 开关                         |
| `onFrame`         | `(listener: AudioFrameListener) => () => void`                      | 取消订阅函数    | 订阅音频帧                              | bootstrap、图层初始化           |
| `subscribe`       | `(cb: (frame: AudioFrame) => void) => () => void`                   | 取消订阅函数    | 订阅音频帧（别名）                      | 同上                            |
| `getSnapshot`     | `() => AudioFrame \| null`                                          | 最新 AudioFrame | 获取当前音频状态                        | Diagnostics、手动查询           |
| `resumeContext`   | `() => Promise<void>`                                               | -               | 恢复 AudioContext（解决自动播放限制）   | 用户首次点击                    |
| `dispose`         | `() => void`                                                        | -               | 清理资源                                | 页面卸载、切换场景              |

### 1.3 AudioBus Getter 属性

| 属性名              | 类型                                   | 作用                     | 使用场景                  |
| ------------------- | -------------------------------------- | ------------------------ | ------------------------- |
| `isReady`           | `boolean`                              | 音频系统是否已初始化     | UI 状态判断、play 前检查  |
| `isPlaying`         | `boolean`                              | 当前是否正在播放         | Toggle 按钮状态、UI 同步  |
| `currentTime`       | `number`                               | 当前播放位置（秒）       | Timeline 显示、seekSlider |
| `duration`          | `number`                               | 总时长（秒）             | Timeline 显示、seekSlider |
| `audioContextState` | `AudioContextState \| 'uninitialized'` | AudioContext 状态        | Diagnostics、自动播放检测 |
| `currentSource`     | `'file' \| 'url' \| 'stream' \| null`  | （待实现）当前音频源类型 | UI 状态判断（13 处引用）  |
| `inputSourceInfo`   | `{ deviceId, label, kind }`            | （待实现）输入设备信息   | UI 显示、Diagnostics      |

---

## 2. 音频帧数据结构（AudioFrame）

| 字段名           | 类型                 | 范围     | 作用                       | 消费者             |
| ---------------- | -------------------- | -------- | -------------------------- | ------------------ |
| `version`        | `1`                  | 固定值 1 | 协议版本号                 | 兼容性检查         |
| `timeSec`        | `number`             | 0..∞     | 当前播放位置（秒）         | Timeline           |
| `sampleRate`     | `number`             | 48000    | 采样率                     | ProjectM、FFT 分析 |
| `pcm2048Mono`    | `Float32Array`       | -1..1    | 2048 点单声道 PCM          | ProjectM           |
| `pcm512Mono`     | `Float32Array`       | -1..1    | 512 点单声道 PCM（重采样） | 通用视觉分析       |
| `pcm512StereoLR` | `{ left, right }`    | -1..1    | 512 点立体声 PCM           | 立体声可视化       |
| `bands`          | `{ low, mid, high }` | 0..255   | 频段能量（低中高）         | LiquidMetal、Depth |
| `rms`            | `number`             | 0..1     | RMS 均方根                 | 能量计算           |
| `peak`           | `number`             | 0..1     | 峰值                       | 能量计算           |
| `energyRaw`      | `number?`            | 0..∞     | 原始能量（可选）           | Diagnostics 调试   |
| `energy`         | `number`             | 0..1     | 归一化能量（主控制信号）   | 所有图层、宏系统   |
| `isSilent`       | `boolean`            | -        | 是否静音                   | 节能优化、UI 提示  |

---

## 3. ProjectM 图层参数

### 3.1 核心控制参数

| 变量名                  | 类型      | 范围 | 默认值   | 作用                                      | 影响者                             | 消费者                 |
| ----------------------- | --------- | ---- | -------- | ----------------------------------------- | ---------------------------------- | ---------------------- |
| `opacity`               | `number`  | 0..1 | 0.85     | 图层不透明度                              | fusion 宏、slot[0]、Overlay Budget | Compositor 混合        |
| `blendMode`             | `enum`    | 8 种 | 'normal' | 混合模式（normal/add/multiply/screen 等） | UI 选择                            | Compositor 混合        |
| `energyToOpacityAmount` | `number`  | 0..1 | 0.0      | 音频能量 → 透明度影响量                   | fusion 宏、Portrait Edge（+0.45）  | ProjectM 渲染          |
| `audioDrivenOpacity`    | `boolean` | -    | false    | 是否启用音频驱动透明度                    | UI 开关                            | ProjectM 渲染          |
| `avgLumaSampling`       | `boolean` | -    | false    | 是否启用平均亮度采样（PI 控制）           | UI 开关                            | Portrait Edge Coupling |

### 3.2 混合模式枚举

```typescript
type BlendMode =
  | "normal" // 正常
  | "add" // 加法（发光效果）
  | "multiply" // 正片叠底（暗化）
  | "screen" // 滤色（亮化）
  | "overlay" // 叠加
  | "darken" // 变暗
  | "lighten" // 变亮
  | "difference"; // 差值
```

---

## 4. LiquidMetal 图层参数

### 4.1 核心 Shader 参数

| 变量名           | 类型                                       | 范围   | 默认值    | 作用                                | 影响者                                               | 消费者                            |
| ---------------- | ------------------------------------------ | ------ | --------- | ----------------------------------- | ---------------------------------------------------- | --------------------------------- |
| `variant`        | `"metal" \| "waves" \| "stars" \| "lines"` | -      | `"metal"` | 算法变体（metal/waves/stars/lines） | UI 选择                                              | Shader 逻辑（当前以参数保存为准） |
| `timeScale`      | `number`                                   | 0..2   | 1.0       | 时间流速                            | motion 宏（+0.6）、slot[3]（+0.25）、BPM             | Shader time 计算                  |
| `iterations`     | `number`                                   | 1..8   | 4         | 迭代次数（复杂度）                  | UI 滑块                                              | Shader 循环                       |
| `waveAmplitude`  | `number`                                   | 0..1   | 0.5       | 波浪振幅                            | UI 滑块、音频能量                                    | Shader 扭曲、**depth.scale**      |
| `metallicAmount` | `number`                                   | 0..1   | 0.7       | 金属质感强度                        | sparkle 宏（+0.25）、slot[2]（+0.22）、**depth.fog** | Shader 材质                       |
| `noiseScale`     | `number`                                   | 0.5..5 | 1.5       | 噪声缩放                            | UI 滑块                                              | Shader 噪声采样                   |
| `glowIntensity`  | `number`                                   | 0..1   | 0.4       | 发光强度                            | sparkle 宏                                           | Shader 后处理                     |
| `colorShift`     | `number`                                   | 0..1   | 0.0       | 颜色偏移量                          | UI 滑块                                              | Shader 色相调整                   |
| `flowSpeed`      | `number`                                   | 0..2   | 1.0       | 流动速度                            | motion 宏                                            | Shader uvOffset                   |
| `tintHue`        | `number`                                   | 0..360 | 180       | 色调（HSL）                         | UI 滑块、**pm.avgLuma**                              | Shader tint 颜色                  |
| `tintBrightness` | `number`                                   | 0..2   | 1.0       | 亮度（HSL）                         | UI 滑块、**pm.avgLuma**                              | Shader tint 强度                  |

### 4.2 音频响应参数

| 变量名            | 类型              | 作用     | 来源                  | 消费者          |
| ----------------- | ----------------- | -------- | --------------------- | --------------- |
| `audioBands.low`  | `number (0..255)` | 低频能量 | AudioFrame.bands.low  | Shader 低频振动 |
| `audioBands.mid`  | `number (0..255)` | 中频能量 | AudioFrame.bands.mid  | Shader 中频闪烁 |
| `audioBands.high` | `number (0..255)` | 高频能量 | AudioFrame.bands.high | Shader 高频粒子 |
| `audioEnergy`     | `number (0..1)`   | 总能量   | AudioFrame.energy     | Shader 整体响应 |

---

## 5. Depth 图层参数

| 变量名   | 类型     | 范围   | 默认值 | 作用                | 影响者                                | 消费者                            |
| -------- | -------- | ------ | ------ | ------------------- | ------------------------------------- | --------------------------------- |
| `fog`    | `number` | 0..1   | 0.3    | 雾气密度            | UI 滑块、**liquid.metallicAmount**    | Shader 深度雾化、**pm.energyAmt** |
| `edge`   | `number` | 0..1   | 0.5    | 边缘锐度            | sparkle 宏（+0.15）、slot[4]（+0.18） | Shader 边缘检测                   |
| `blur`   | `number` | 0..1   | 0.2    | 模糊强度            | UI 滑块、**liquid.waveAmplitude**     | Shader 后处理                     |
| `noise`  | `number` | 0..1   | 0.4    | 噪声强度            | UI 滑块                               | Shader 纹理混合                   |
| `layers` | `number` | 1..8   | 3      | 深度层数            | motion 宏（+6）、slot[1]（+4）、BPM   | Shader 多层渲染                   |
| `bw`     | `number` | 0..1   | 0.0    | 黑白化程度          | UI 滑块                               | Shader 去饱和度                   |
| `fall`   | `number` | 0..2   | 1.0    | 下落速度            | motion 宏                             | Shader uvOffset.y                 |
| `scale`  | `number` | 0.5..2 | 1.0    | 空间缩放            | UI 滑块、**liquid.waveAmplitude**     | Shader uv 变换                    |
| `weight` | `number` | 0..2   | 1.4    | Overlay Budget 权重 | Macro Patch                           | computeOverlayBudgetAllocation    |

---

## 6. Macro System 参数

### 6.1 核心宏旋钮（3 个）

| 宏名      | 范围 | 作用            | 影响的参数（示例）                                             |
| --------- | ---- | --------------- | -------------------------------------------------------------- |
| `fusion`  | 0..1 | ProjectM 融合度 | `projectmOpacity (+0.15)`, `pmRetreatStrength`, `depthWeight`  |
| `motion`  | 0..1 | 运动/速度强度   | `liquidTimeScale (+0.6)`, `depthLayers (+6)`, `depthFall`      |
| `sparkle` | 0..1 | 闪耀/高光度     | `metallicAmount (+0.25)`, `depthEdge (+0.15)`, `glowIntensity` |

### 6.2 自由槽（8 个）

| 槽名      | 范围 | 主要影响                  | 次要影响 |
| --------- | ---- | ------------------------- | -------- |
| `slot[0]` | 0..1 | `projectmOpacity (+0.18)` | -        |
| `slot[1]` | 0..1 | `depthLayers (+4)`        | -        |
| `slot[2]` | 0..1 | `metallicAmount (+0.22)`  | -        |
| `slot[3]` | 0..1 | `liquidTimeScale (+0.25)` | -        |
| `slot[4]` | 0..1 | `depthEdge (+0.18)`       | -        |
| `slot[5]` | 0..1 | 预留                      | -        |
| `slot[6]` | 0..1 | 预留                      | -        |
| `slot[7]` | 0..1 | 预留                      | -        |

### 6.3 Macro Patch 输出示例

```typescript
interface MacroPatch {
  projectmOpacity: number; // base + fusion*0.15 + slot[0]*0.18
  projectmBlendMode: BlendMode; // 根据fusion切换
  liquidTimeScale: number; // base + motion*0.6 + slot[3]*0.25
  liquidMetallicAmount: number; // base + sparkle*0.25 + slot[2]*0.22
  depthLayers: number; // base + motion*6 + slot[1]*4
  depthEdge: number; // base + sparkle*0.15 + slot[4]*0.18
  depthWeight: number; // base + fusion影响
  pmRetreatStrength: number; // fusion → 背景退让
  // ... 更多参数
}
```

---

## 7. Overlay Budget System 参数

### 7.1 全局预算参数

| 变量名              | 类型     | 范围     | 默认值 | 作用            | 消费者                         |
| ------------------- | -------- | -------- | ------ | --------------- | ------------------------------ |
| `maxEnergy`         | `number` | 1.0..1.3 | 1.15   | 最大能量总预算  | computeOverlayBudgetAllocation |
| `pmRetreatStrength` | `number` | 0..1     | 0.45   | PM 退让强度系数 | 背景图层 opacity 计算          |
| `targetScale`       | `number` | 0.5..2.0 | 1.0    | 目标缩放系数    | 所有图层分配                   |

### 7.2 图层优先级

| 图层类型         | 优先级值 | 意义       | 竞争表现               |
| ---------------- | -------- | ---------- | ---------------------- |
| `ProjectM`       | 1.0      | 最高优先级 | 能量充足时近乎全开     |
| `Basic (Liquid)` | 0.8      | 高优先级   | 被压制较少             |
| `Depth`          | 0.65     | 低优先级   | 被压制较强（营造纵深） |

### 7.3 竞争公式

```typescript
// PM存在时，背景可用能量减少
pmPresence01 = (fusion - 0.5) * 2; // fusion>0.5时PM存在
maxEnergy_adjusted = maxEnergy * (1 - pmRetreatStrength * pmPresence01);

// 按优先级分配（指数函数，优先级越低越易被压制）
sDepth = (eDepth / totalEnergy) ^ ((1 / priorityDepth) * targetScale);
```

---

## 8. Audio Coupling Runtime 参数

| 变量名                          | 范围 | 作用                  | 影响范围                       |
| ------------------------------- | ---- | --------------------- | ------------------------------ |
| `audioCouplingAmounts.projectm` | 0..1 | PM 受音频影响强度     | energyToOpacityAmount 动态调整 |
| `audioCouplingAmounts.liquid`   | 0..1 | Liquid 受音频影响强度 | timeScale、iterations 动态调整 |
| `audioCouplingAmounts.depth`    | 0..1 | Depth 受音频影响强度  | layers、noise 动态调整         |

**特性**：不修改 state，通过`scale(base, target, amount)`混合临时值

---

## 9. Portrait Edge Coupling 参数

| 变量名                 | 范围 | 来源             | 作用              | 影响参数                           |
| ---------------------- | ---- | ---------------- | ----------------- | ---------------------------------- |
| `edge01`               | 0..1 | 人像边缘检测强度 | 人像前景-背景分离 | `pm.energyToOpacityAmount (+0.45)` |
| `edgeCouplingStrength` | 0..1 | 耦合强度配置     | 控制 PM 增强程度  | `pm.opacity (+0.18 * edge01)`      |

---

## 10. 拟新增耦合参数（Task A - Phase 3）

### 10.1 深度传播耦合

| 变量名                                 | 方向   | 强度系数 | 公式                                           |
| -------------------------------------- | ------ | -------- | ---------------------------------------------- |
| `depth.fog → liquid.metallicAmount`    | 正相关 | 0.3      | `liquid.metallicAmount += depth.fog * 0.3`     |
| `depth.fog → pm.energyToOpacityAmount` | 正相关 | 0.25     | `pm.energyToOpacityAmount += depth.fog * 0.25` |

**效果**：雾气浓时，liquid 更金属，PM 更敏感

### 10.2 颜色共振耦合

| 变量名                               | 方向   | 强度系数 | 公式                                              |
| ------------------------------------ | ------ | -------- | ------------------------------------------------- |
| `pm.avgLuma → liquid.tintHue`        | 正相关 | 60 度    | `liquid.tintHue = (base + pm.avgLuma * 60) % 360` |
| `pm.avgLuma → liquid.tintBrightness` | 正相关 | 0.4      | `liquid.tintBrightness = 1.0 + pm.avgLuma * 0.4`  |

**效果**：PM 越亮，liquid 色调越暖、亮度越高

### 10.3 节奏级联耦合

| 变量名                   | 方向   | 强度系数   | 公式                                         |
| ------------------------ | ------ | ---------- | -------------------------------------------- |
| `bpm → liquid.timeScale` | 正相关 | 0.3        | `timeScale *= (1 + (bpm - 120) / 120 * 0.3)` |
| `bpm → depth.layers`     | 正相关 | 1 层/20bpm | `layers += Math.floor((bpm - 120) / 20)`     |

**效果**：快歌时 liquid 更快、depth 更复杂

### 10.4 空间扭曲耦合

| 变量名                               | 方向   | 强度系数 | 公式                                              |
| ------------------------------------ | ------ | -------- | ------------------------------------------------- |
| `liquid.waveAmplitude → depth.scale` | 正相关 | 0.3      | `depth.scale *= (1 + liquid.waveAmplitude * 0.3)` |
| `liquid.waveAmplitude → depth.blur`  | 正相关 | 0.2      | `depth.blur += liquid.waveAmplitude * 0.2`        |

**效果**：liquid 波浪越大，depth 空间越扭曲

---

## 11. localStorage 持久化变量

| 键名                               | 类型                         | 默认值  | 作用                      |
| ---------------------------------- | ---------------------------- | ------- | ------------------------- |
| `newliveweb:audio:preferredSource` | `'file' \| 'url' \| 'input'` | -       | 记忆上次使用的音频源类型  |
| `newliveweb:audio:inputDeviceId`   | `string`                     | -       | 记忆上次选择的输入设备 ID |
| `newliveweb:audio:trackVolume`     | `string (number)`            | `"1.0"` | 记忆音量设置              |
| `newliveweb:mixxx:url`             | `string`                     | -       | 记忆 Mixxx WebSocket URL  |
| `newliveweb:ui:debugMode`          | `'on' \| 'off'`              | `'off'` | 记忆调试模式开关          |

---

## 12. URL 参数（查询字符串）

| 参数名                | 类型              | 示例                       | 作用                    |
| --------------------- | ----------------- | -------------------------- | ----------------------- |
| `audioSmoothing`      | `'ema' \| 'none'` | `?audioSmoothing=ema`      | 启用能量平滑（EMA）     |
| `audioSmoothingAlpha` | `number (0..1)`   | `&audioSmoothingAlpha=0.2` | EMA 平滑系数            |
| `debugMode`           | `'on'`            | `?debugMode=on`            | 启用调试模式            |
| `showMode`            | `'on'`            | `?showMode=on`             | 演出模式（隐藏部分 UI） |

---

## 13. 变量依赖关系图（简化）

```
AudioFrame.energy (0..1)
  ├─→ Macro System (fusion/motion/sparkle)
  │     ├─→ ProjectM (opacity, energyToOpacityAmount)
  │     ├─→ LiquidMetal (timeScale, metallicAmount)
  │     └─→ Depth (layers, edge)
  │
  ├─→ Audio Coupling Runtime
  │     ├─→ ProjectM (energyToOpacityAmount dynamic)
  │     ├─→ LiquidMetal (timeScale dynamic)
  │     └─→ Depth (layers dynamic)
  │
  └─→ Overlay Budget System
        ├─→ PM退让强度 (fusion → pmRetreatStrength)
        └─→ 多图层竞争分配 (priorityDepth → opacity)

Portrait Edge (edge01 from camera)
  └─→ PM增强
        ├─→ energyToOpacityAmount (+0.45)
        └─→ opacity (+0.18)

[拟新增耦合]
depth.fog ──→ liquid.metallicAmount (+0.3)
          └─→ pm.energyToOpacityAmount (+0.25)

pm.avgLuma ──→ liquid.tintHue (+60°)
           └─→ liquid.tintBrightness (+0.4)

bpm ──→ liquid.timeScale (动态调整)
     └─→ depth.layers (动态调整)

liquid.waveAmplitude ──→ depth.scale (空间扭曲)
                      └─→ depth.blur (模糊增强)
```

---

## 14. 快速查询索引

### 按功能查询

**音频输入**：`loadInputDevice`, `loadMediaStream`, `streamLabel`, `streamDeviceId`, `inputSourceInfo`

**音频帧数据**：`AudioFrame`, `energy`, `bands`, `pcm2048Mono`, `rms`, `peak`

**ProjectM 控制**：`opacity`, `blendMode`, `energyToOpacityAmount`, `audioDrivenOpacity`

**Liquid 效果**：`variant`, `timeScale`, `waveAmplitude`, `metallicAmount`, `tintHue`

**Depth 效果**：`fog`, `layers`, `edge`, `blur`, `scale`

**宏系统**：`fusion`, `motion`, `sparkle`, `slot[0-7]`

**耦合系统**：`pmRetreatStrength`, `audioCouplingAmounts`, `edge01`, `computeMacroPatch`

### 按文件查询

**AudioBus.ts**：音频总线核心，loadInputDevice 等方法

**AudioFrame**：`src/types/audioFrame.ts`，统一音频数据格式

**ProjectMLayer.ts**：PM 图层参数和渲染

**LiquidMetalLayerV2.ts**：液态金属 shader 参数

**DepthLayer.ts**：深度效果参数

**computeMacroPatch.ts**：宏系统耦合矩阵

**bootstrap.ts**：Overlay Budget、Audio Coupling、Portrait Edge Coupling

---

## 15. 常见问题速查

**Q: 如何查看当前使用的音频设备？**
A: `audioBus.inputSourceInfo.label`

**Q: 如何获取最新的音频能量？**
A: `audioBus.getSnapshot()?.energy`

**Q: 如何让 PM 在背景存在时退让？**
A: `fusion > 0.5` 自动触发 `pmRetreatStrength`

**Q: 如何让 liquid 跟随音频节奏？**
A: `motion` 宏影响 `liquidTimeScale`，或启用 BPM 检测

**Q: 如何添加新的耦合规则？**
A: 在 `bootstrap.ts` 的 runtime coupling 函数中添加，或修改 `computeMacroPatch.ts`

---

**最后更新**：2025-12-18
**对应计划文档**：[AIVJ_INTEGRATED_PLAN.zh.md](./AIVJ_INTEGRATED_PLAN.zh.md)
---

## 2025-12-24 对齐补充（音频 localStorage key）

- 现行 key：`nw.audio.preferredSource` / `nw.audio.inputDeviceId` / `nw.audio.trackVolume` / `nw.audio.mixxxUrl`
- 旧 key `newliveweb:audio:*` 会在启动时迁移写入（代码侧兼容）。
