# AIVJ 整合任务计划（3D 耦合 + 音频设备选择）

## 执行摘要

整合两个核心任务到统一规划：

1. **Task A**：3D 参数耦合系统增强（让图层之间物理互动）
2. **Task B**：修复音频设备选择功能（恢复本地音频输入能力）
3. **Task C**：全局参数收藏/复现（收藏夹可发现 + 覆盖新参数 + 清空过时收藏）

---

## Task C：参数收藏 / 收藏夹（优先级 P0）

### 目标

- **能收藏**：把当前视觉状态（ProjectM + 背景/液态金属等）存到收藏夹
- **能复现**：从收藏夹一键 Load 回到当时的“特效算法”状态
- **能找到**：用户能直观地打开收藏夹，不需要猜入口
- **能清空过时数据**：旧版本字段结构变化后，自动清空/隔离旧收藏，避免“加载后看起来不对”

### 现状（以代码为准）

- UI 顶部工具栏已有 **“收藏/Favorite”按钮** 与 **收藏计数**（点击计数可打开收藏面板）
- 收藏面板实现于 `src/features/favorites/FavoritesPanel.ts`：
  - 列表项有 `Load`（复现）、`参数`（查看/对比）、`删除`

### 使用方法（复现收藏特效）

1. 点击工具栏 **“收藏”**：立即保存当前视觉状态，并自动弹出收藏夹
2. 在收藏夹列表点击 **`Load`**：立即加载并复现该收藏的效果
3. 也可以点击工具栏显示的 **“收藏:N”** 打开/关闭收藏夹

### 清空过时收藏（已执行）

- 收藏存储 key 已从 `newliveweb:favorites:v1` 升级到 `newliveweb:favorites:v2`
- 启动时会移除旧的 `v1` key，避免用户继续看到“过时参数”的收藏

### 最小验收（MVP）

1. 点击“收藏”后 **收藏夹自动弹出**，且收藏计数 +1
2. 在收藏夹点击 `Load` 能复现（至少 ProjectM preset + blend params + liquid 参数）
3. 刷新页面后收藏仍在（同一 `v2` key）
4. 旧 `v1` 收藏不再显示（视为已清空）

### 最小手动验收记录（建议）

- 操作：点击“收藏” → 预期：收藏夹面板自动弹出，并新增 1 条记录。
- 操作：在收藏夹点击“Load” → 预期：视觉效果（宏/背景/ProjectM 参数）切换到该收藏快照。
- 操作：刷新页面 → 预期：收藏列表仍存在且可 Load。
- 操作：检查旧 key（可选） → 预期：`newliveweb:favorites:v1` 已不存在/不再被读取。

## 问题诊断

### Task B 现状诊断：AudioBus 缺少输入设备 API

**症状**：

- UI 有设备选择下拉框和"Use input"按钮
- UI 侧存在设备选择下拉框与"Use input"入口（代码已写好一套 controller）
- audioTransportController 调用了`audioBus.loadInputDevice(deviceId)` / `audioBus.loadMediaStream(...)`
- ❌ **AudioBus.ts 中不存在这些方法** → audioTransportController 产生一组类型错误（13 处）

**关键对齐（以代码为准）**：

- ✅ `StreamAudioProcessor` 已经实现了：
  - `loadFromStream(stream, { monitor? })`
  - `seek(timeSec)`
  - `get currentSource()`
- ❌ `AudioBus` 当前只封装了 `loadFile/loadUrl/play/pause/toggle/setVolume/setLoop/...`，没有把 stream/input 入口暴露出去
- ⚠️ `audioTransportController.ts` 目前在工程里存在，但 `bootstrap.ts` 并没有接入/调用它（当前 bootstrap 用的是另一套更简化的音频交互逻辑），因此你会看到“只能系统默认/无法选输入设备”的体验

**根因分析**：

```typescript
// audioTransportController.ts:384 调用了不存在的方法
await audioBus.loadInputDevice(deviceId || undefined);

// AudioBus.ts当前只有：
- loadFile(file: File)
- loadUrl(url: string)
- ❌ 缺少 loadInputDevice(deviceId?: string)
- ❌ 缺少 loadMediaStream(stream, opts)
- ❌ 缺少 currentSource getter
- ❌ 缺少 inputSourceInfo getter
- ❌ 缺少 seek(time) method
```

**TypeScript 现状（以 `tsc --noEmit` 为准）**：

- 当前工程总计 **23 个错误 / 5 个文件**，其中 **audioTransportController 贡献 13 个**（正是 AudioBus 缺 API 引起的）。
- 另外还有一些与音频无关的错误（例如 visualState 版本、blendMode 类型收窄、LiquidMetal 参数类型等）。

**audioTransportController 相关错误清单**（13 处）：

1. Line 204: `audioBus.currentSource` - Property 'currentSource' does not exist
2. Line 228: `audioBus.currentSource` - Property 'currentSource' does not exist
3. Line 274: `audioBus.currentSource` - Property 'currentSource' does not exist
4. Line 384: `audioBus.loadInputDevice(deviceId)` - Property 'loadInputDevice' does not exist ⚠️
5. Line 394: `audioBus.inputSourceInfo.label` - Property 'inputSourceInfo' does not exist ⚠️
6. Line 483: `audioBus.loadMediaStream(stream, {...})` - Property 'loadMediaStream' does not exist ⚠️
7. Line 622: `audioBus.loadUrl(url, { loop: false })` - Expected 1 arguments, but got 2
8. Line 648: `audioBus.currentSource` - Property 'currentSource' does not exist
9. Line 650: `audioBus.seek(duration * ratio)` - Property 'seek' does not exist
10. Line 664: `audioBus.currentSource` - Property 'currentSource' does not exist
11. Line 756: `audioBus.currentSource` - Property 'currentSource' does not exist
12. Line 824: `audioBus.currentSource` - Property 'currentSource' does not exist
13. Line 868: `audioBus.currentSource` - Property 'currentSource' does not exist

**影响范围**：

- ❌ 无法选择麦克风/声卡/虚拟音频设备
- ❌ 无法捕获系统音频（getDisplayMedia 的音频流）
- ❌ "Use input"按钮无效
- ❌ "系统音频"按钮无效
- ⚠️ 代码无法通过 TypeScript 编译（当前总计 23 个错误，其中 13 个来自音频输入控制器）

---

## Task A：3D 参数耦合系统（详见 AIVJ_3D_COUPLING_PLAN.md）

### 核心目标

让 ProjectM、LiquidMetal、Depth 图层之间产生"物理互动"，而不是简单叠加。

### 现有耦合机制（4 个）

1. **Overlay Budget System** - 多图层竞争，PM 存在时背景退让
2. **Macro System** - fusion/motion/sparkle 一对多影响参数
3. **Audio Coupling Runtime** - 音频驱动全局调整
4. **Portrait Edge Coupling** - 人像边缘检测增强 PM

### 拟增强耦合（4 个新维度）

1. **深度传播** - depth.fog → liquid.metallicAmount + pm.energyAmt
2. **颜色共振** - pm.avgLuma → liquid.tintHue/brightness
3. **节奏级联** - BPM → liquid.timeScale + depth.layers
4. **空间扭曲** - liquid.waveAmplitude → depth.scale/blur

详细设计见 [AIVJ_3D_COUPLING_PLAN.md](./AIVJ_3D_COUPLING_PLAN.md)

---

## Task B：音频设备选择修复（优先级 P0）

### 最小可验证目标（MVP）

✅ **验收标准**：

1. TypeScript 编译通过（0 错误）
2. 点击"Use input"后可选择麦克风
3. 音频能量正常驱动视觉
4. Diagnostics 显示正确的设备标签
5. 刷新页面后记住上次选择的设备

补充：如果你要“抓电脑播放的声音”，两条路：

- **方案 1（推荐，稳定）**：选择回环/虚拟声卡输入设备（Stereo Mix / VB-CABLE / Voicemeeter / WASAPI loopback 等）→ 走 `getUserMedia({ audio: { deviceId } })`
- **方案 2（浏览器限制下的系统音频）**：走 `getDisplayMedia({ audio: true })`，必须选择“标签页”并勾选“共享音频/Share audio”（Chrome/Edge）

### 需要实现的 API

#### AudioBus 新增接口

```typescript
// 1. 加载音频输入设备（麦克风/声卡）
async loadInputDevice(deviceId?: string): Promise<void>

// 2. 加载MediaStream（系统音频捕获）
async loadMediaStream(
  stream: MediaStream,
  opts?: { label?: string }
): Promise<void>

// 3. 跳转到指定时间（只对file/url有效）
seek(timeSec: number): void

// 4. 获取当前音频源类型
get currentSource(): 'file' | 'url' | 'stream' | null

// 5. 获取输入设备信息（stream模式下）
get inputSourceInfo(): {
  deviceId: string | null;
  label: string;
  kind: 'default' | 'device' | 'display' | 'unknown';
}
```

#### StreamAudioProcessor 需要对接的方法

```typescript
// 已存在（无需新增）：
async loadFromStream(stream: MediaStream, opts?: StreamAudioMonitorOptions): Promise<void>
seek(timeSec: number): void
get currentSource(): StreamAudioSource | null
```

---

## 详细实施计划

### Phase 1：修复音频输入（P0 - 必须先完成）

#### Task B.1：扩展 AudioBus API（⏱️ 1-2 小时）

**文件**：`src/audio/AudioBus.ts`

**实现步骤**：

1. **添加输入源跟踪状态**

   ```typescript
   export class AudioBus {
     private processor = new StreamAudioProcessor();
     private listeners = new Set<AudioFrameListener>();
     private rafId: number | null = null;
     private latestFrame: AudioFrame | null = null;
     private ready = false;

     // 新增：输入源跟踪
     private streamLabel: string | null = null;
     private streamDeviceId: string | null = null;
     private streamKind: "default" | "device" | "display" | "unknown" =
       "unknown";
   }
   ```

2. **实现 loadInputDevice 方法**

   ```typescript
   async loadInputDevice(deviceId?: string): Promise<void> {
     // 1. 请求麦克风/声卡权限
     const constraints: MediaStreamConstraints = {
       audio: deviceId
         ? { deviceId: { exact: deviceId } }
         : true,
       video: false
     };

     const stream = await navigator.mediaDevices.getUserMedia(constraints);

     // 2. 获取设备信息
     const audioTrack = stream.getAudioTracks()[0];
     const label = audioTrack?.label || '音频输入';
     this.streamDeviceId = deviceId || null;
     this.streamLabel = label;
     this.streamKind = deviceId ? 'device' : 'default';

     // 3. 接入processor
     await this.processor.loadFromStream(stream, { monitor: false });
     this.ready = true;
     this.startLoop();
   }
   ```

3. **实现 loadMediaStream 方法**

   ```typescript
   async loadMediaStream(
     stream: MediaStream,
     opts?: { label?: string }
   ): Promise<void> {
     this.streamLabel = opts?.label || '媒体流';
     this.streamDeviceId = null;
     this.streamKind = 'display'; // 系统音频捕获

     await this.processor.loadFromStream(stream, { monitor: false });
     this.ready = true;
     this.startLoop();
   }
   ```

4. **实现 seek 方法**

   ```typescript
   seek(timeSec: number): void {
     if (this.currentSource === 'stream') {
       console.warn('Cannot seek on stream source');
       return;
     }
     this.processor.seek(timeSec);
   }
   ```

5. **实现 getter 属性**

   ```typescript
   get currentSource(): 'file' | 'url' | 'stream' | null {
     return this.processor.currentSource;
   }

   get inputSourceInfo() {
     return {
       deviceId: this.streamDeviceId,
       label: this.streamLabel || '未知',
       kind: this.streamKind
     };
   }
   ```

6. **修改 loadUrl 支持 options 参数**
   ```typescript
   async loadUrl(url: string, opts?: { loop?: boolean }) {
     const loop = opts?.loop ?? true;
     await this.processor.loadFromUrl(url, { loop });
     this.ready = true;
     this.startLoop();
     this.play();
   }
   ```

**验证**：

- [!] TypeScript 编译通过
- [x] `audioBus.loadInputDevice()` 可调用（代码已具备）
- [x] `audioBus.currentSource === 'stream'` 返回正确值（代码已具备）

---

#### Task B.2：确认 StreamAudioProcessor 支持（⏱️ 30 分钟）

**文件**：`src/audio/StreamAudioProcessor.ts`

**检查清单**：

- [x] `loadFromStream(stream, opts)` 已存在（代码已具备）
- [x] `get currentSource()` 已存在（代码已具备）
- [x] `seek(timeSec)` 已存在（代码已具备）

**如果缺少，需补充**：

```typescript
async loadFromStream(
  stream: MediaStream,
  opts?: StreamAudioMonitorOptions
): Promise<void> {
  await this.ensureContext();
  this.teardownMediaElement();
  this.teardownStreamSource();

  this.sourceNode = this.audioContext!.createMediaStreamSource(stream);
  this.connectInputNode(this.sourceNode);

  if (opts?.monitor) {
    this.sourceNode.connect(this.audioContext!.destination);
  }

  this.sourceType = 'stream';
  this.startTime = this.audioContext!.currentTime;
}

get currentSource(): StreamAudioSource | null {
  return this.sourceType;
}

seek(timeSec: number): void {
  if (!this.audioElement) return;
  this.audioElement.currentTime = timeSec;
}
```

---

#### Task B.3：UI 交互验证（⏱️ 30 分钟）

**验证步骤**：

1. 启动 dev server：`npm run dev`
2. 打开浏览器控制台
3. 点击"Use input"按钮
4. 授权麦克风权限
5. 检查：
   - [x] 状态栏显示"🎚️ 已使用输入：XXX"
   - [x] AudioFrame.energy 响应麦克风声音
   - [x] Diagnostics 面板显示 deviceId 和 label
   - [x] 刷新页面后自动恢复上次选择

**调试工具**：

```javascript
// 浏览器控制台
console.log("Current source:", audioBus.currentSource);
console.log("Input info:", audioBus.inputSourceInfo);
console.log("AudioFrame:", audioBus.getSnapshot());
```

---

### Phase 2：3D 参数耦合增强（P1 - Task B 完成后）

详见 [AIVJ_3D_COUPLING_PLAN.md](./AIVJ_3D_COUPLING_PLAN.md) 的 Phase 2-4。

**快速启动建议**：

- **方案 A**（UI 优先）：先做 ProjectM 融合面板，让现有耦合可视化
- **方案 B**（算法优先）：先做"颜色共振"，视觉效果最直观
- **混合方案**：Task 1（PM 面板） + Task 5（颜色共振）

---

## 最小 TODO 清单

> 2025-12-19 收敛：Task B.1/B.2 属于“代码实现项”已在仓库中落地；后续主要按 B.3 做现场/交互验收。

### P0 - 必须立即完成（阻塞编译）

- [x] **B.1.1** 在 AudioBus.ts 添加 streamLabel/streamDeviceId/streamKind 字段（代码已具备）
- [x] **B.1.2** 实现`async loadInputDevice(deviceId?: string)`（代码已具备）
- [x] **B.1.3** 实现`async loadMediaStream(stream, opts)`（代码已具备）
- [x] **B.1.4** 实现`seek(timeSec: number)`方法（代码已具备）
- [x] **B.1.5** 实现`get currentSource()`（代码已具备）
- [x] **B.1.6** 实现`get inputSourceInfo()`（代码已具备）
- [x] **B.1.7** 修改`loadUrl`支持`opts?: { loop?: boolean }`参数（代码已具备）
- [x] **B.2.1** 确认 StreamAudioProcessor 已有`loadFromStream`方法（代码已具备）
- [x] **B.2.2** 确认 StreamAudioProcessor 已有`currentSource` getter（代码已具备）
- [x] **B.2.3** 如缺少则补充`seek`方法（代码已具备）

### P1 - 验证与优化（编译通过后）

- [!] **B.3.1** 测试"Use input"按钮 → 选择麦克风 → 音频驱动
- [!] **B.3.2** 测试"系统音频"按钮 → 捕获 Tab 音频 → 音频驱动
- [!] **B.3.3** 测试设备记忆（刷新后恢复）
- [!] **B.3.4** 测试权限拒绝的错误提示
- [!] **B.3.5** 测试设备不存在的错误提示

### P2 - 3D 耦合（Task B 验收后）

- [x] **A.UI.1** ProjectM 融合面板（pmRetreatStrength 滑块）
- [x] **A.UI.2** 宏旋钮可视化（影响标签）
- [x] **A.UI.3** 图层联动监视器
- [x] **A.Algo.4** 深度传播（depth → liquid + pm）
- [x] **A.Algo.5** 颜色共振（pm.avgLuma → liquid.tint）
- [x] **A.Algo.6** 节奏级联（BPM → timeScale + layers）
- [x] **A.Algo.7** 空间扭曲（waveAmp → depth.scale）

---

## 完整变量表（核心参数清单）

### 音频输入相关变量（Task B）

#### AudioBus 字段

| 变量名           | 类型                                              | 作用             | 消费者                           |
| ---------------- | ------------------------------------------------- | ---------------- | -------------------------------- |
| `streamLabel`    | `string \| null`                                  | 输入设备显示名称 | UI 状态栏、Diagnostics           |
| `streamDeviceId` | `string \| null`                                  | 音频输入设备 ID  | localStorage 持久化              |
| `streamKind`     | `'default' \| 'device' \| 'display' \| 'unknown'` | 音频源类型标记   | 内部判断逻辑                     |
| `ready`          | `boolean`                                         | 音频系统就绪状态 | play/pause/toggle                |
| `processor`      | `StreamAudioProcessor`                            | 底层音频处理器   | loadFile/loadUrl/loadInputDevice |

#### AudioBus 方法

| 方法名            | 签名                                            | 作用               | 调用者                               |
| ----------------- | ----------------------------------------------- | ------------------ | ------------------------------------ |
| `loadInputDevice` | `async (deviceId?: string) => void`             | 加载音频输入设备   | audioTransportController             |
| `loadMediaStream` | `async (stream, opts?) => void`                 | 加载 MediaStream   | audioTransportController（系统音频） |
| `seek`            | `(timeSec: number) => void`                     | 跳转到指定时间     | seekSlider 交互                      |
| `currentSource`   | `get () => 'file' \| 'url' \| 'stream' \| null` | 获取当前音频源类型 | UI 状态判断（13 处）                 |
| `inputSourceInfo` | `get () => { deviceId, label, kind }`           | 获取输入设备信息   | UI 显示、Diagnostics                 |

#### StreamAudioProcessor 相关

| 变量/方法        | 类型                                       | 作用             | 消费者                                   |
| ---------------- | ------------------------------------------ | ---------------- | ---------------------------------------- |
| `sourceType`     | `'file' \| 'url' \| 'stream' \| 'element'` | 内部音频源类型   | AudioBus.currentSource                   |
| `loadFromStream` | `async (stream, opts) => void`             | 接入 MediaStream | AudioBus.loadInputDevice/loadMediaStream |
| `seek`           | `(timeSec: number) => void`                | 跳转播放位置     | AudioBus.seek                            |

#### audioTransportController 使用

| 变量名                    | 类型     | 作用              | 来源                               |
| ------------------------- | -------- | ----------------- | ---------------------------------- |
| `inputDeviceSelect.value` | `string` | 选中的 deviceId   | HTMLSelectElement                  |
| `keys.inputDeviceIdKey`   | `string` | localStorage 键名 | `nw.audio.inputDeviceId`   |
| `keys.preferredSourceKey` | `string` | localStorage 键名 | `nw.audio.preferredSource` |

---

### 3D 参数耦合相关变量（Task A - 详见 AIVJ_3D_COUPLING_PLAN.md）

#### ProjectM Layer（5 个参数）

| 变量名                  | 范围       | 作用                    | 消费者                              |
| ----------------------- | ---------- | ----------------------- | ----------------------------------- |
| `opacity`               | 0..1       | 图层不透明度            | Compositor（Overlay Budget System） |
| `blendMode`             | enum(8 种) | 混合模式                | Compositor                          |
| `energyToOpacityAmount` | 0..1       | 音频能量 → 透明度影响量 | ProjectM 渲染                       |
| `audioDrivenOpacity`    | boolean    | 是否启用音频驱动透明度  | ProjectM 渲染                       |
| `avgLumaSampling`       | boolean    | 是否启用平均亮度采样    | Portrait Edge Coupling              |

#### LiquidMetal Layer（15 个参数）

| 变量名           | 范围           | 作用                                | 消费者                         |
| ---------------- | -------------- | ----------------------------------- | ------------------------------ |
| `variant`        | 0..3           | 算法类型（metal/waves/stars/lines） | Shader                         |
| `timeScale`      | 0..2           | 时间流速                            | Shader（受 motion 宏影响）     |
| `iterations`     | 1..8           | 迭代复杂度                          | Shader                         |
| `waveAmplitude`  | 0..1           | 波浪振幅                            | Shader（拟影响 depth）         |
| `metallicAmount` | 0..1           | 金属感强度                          | Shader（受 sparkle 宏影响）    |
| `noiseScale`     | 0.5..5         | 噪声缩放                            | Shader                         |
| `glowIntensity`  | 0..1           | 发光强度                            | Shader                         |
| `colorShift`     | 0..1           | 颜色偏移                            | Shader                         |
| `flowSpeed`      | 0..2           | 流动速度                            | Shader                         |
| `tintHue`        | 0..360         | 色调                                | Shader（拟受 pm.avgLuma 影响） |
| `tintBrightness` | 0..2           | 亮度                                | Shader（拟受 pm.avgLuma 影响） |
| `audioBands`     | {low,mid,high} | 音频频段                            | Shader（音频响应）             |
| `audioEnergy`    | 0..1           | 音频能量                            | Shader（音频响应）             |

#### Depth Layer（9 个参数）

| 变量名   | 范围   | 作用     | 消费者                             |
| -------- | ------ | -------- | ---------------------------------- |
| `fog`    | 0..1   | 雾气密度 | Shader（拟传播到 liquid）          |
| `edge`   | 0..1   | 边缘锐度 | Shader（受 sparkle 宏影响）        |
| `blur`   | 0..1   | 模糊强度 | Shader                             |
| `noise`  | 0..1   | 噪声强度 | Shader                             |
| `layers` | 1..8   | 深度层数 | Shader（受 motion 宏影响）         |
| `bw`     | 0..1   | 黑白程度 | Shader                             |
| `fall`   | 0..2   | 下落速度 | Shader                             |
| `scale`  | 0.5..2 | 空间缩放 | Shader（拟受 liquid.waveAmp 影响） |
| `weight` | 0..2   | 图层权重 | Compositor                         |

#### Macro System（11 个参数）

| 变量名      | 范围 | 作用       | 影响范围                                 |
| ----------- | ---- | ---------- | ---------------------------------------- |
| `fusion`    | 0..1 | PM 融合度  | projectmOpacity, bgRetreat, depthWeight  |
| `motion`    | 0..1 | 运动强度   | liquidTimeScale, depthLayers, depthFall  |
| `sparkle`   | 0..1 | 闪耀度     | metallicAmount, depthEdge, glowIntensity |
| `slot[0]`   | 0..1 | 自由槽 0   | projectmOpacity 补充                     |
| `slot[1]`   | 0..1 | 自由槽 1   | depthLayers 补充                         |
| `slot[2]`   | 0..1 | 自由槽 2   | metallicAmount 补充                      |
| `slot[3]`   | 0..1 | 自由槽 3   | liquidTimeScale 补充                     |
| `slot[4]`   | 0..1 | 自由槽 4   | depthEdge 补充                           |
| `slot[5-7]` | 0..1 | 自由槽 5-7 | 预留扩展                                 |

#### Overlay Budget System（竞争分配）

| 变量名              | 范围     | 作用             | 消费者                         |
| ------------------- | -------- | ---------------- | ------------------------------ |
| `maxEnergy`         | 1.0..1.3 | 最大能量预算     | computeOverlayBudgetAllocation |
| `pmRetreatStrength` | 0..1     | PM 退让强度      | 背景图层压制系数               |
| `depthWeight`       | 1.0..1.6 | Depth 权重系数   | 优先级调整                     |
| `priorityBasic`     | 0.8      | 基础图层优先级   | 竞争指数                       |
| `priorityDepth`     | 0.65     | Depth 图层优先级 | 竞争指数（更易被压制）         |

#### Audio Coupling Runtime

| 变量名                          | 范围 | 作用                | 消费者                |
| ------------------------------- | ---- | ------------------- | --------------------- |
| `audioCouplingAmounts.projectm` | 0..1 | PM 受音频影响量     | energyToOpacityAmount |
| `audioCouplingAmounts.liquid`   | 0..1 | Liquid 受音频影响量 | timeScale 等          |
| `audioCouplingAmounts.depth`    | 0..1 | Depth 受音频影响量  | layers 等             |

#### Portrait Edge Coupling

| 变量名                 | 范围 | 作用             | 消费者                         |
| ---------------------- | ---- | ---------------- | ------------------------------ |
| `edge01`               | 0..1 | 人像边缘检测强度 | pm.energyToOpacityAmount +0.45 |
| `edgeCouplingStrength` | 0..1 | 耦合强度系数     | pm.opacity +0.18               |

---

## 拟新增耦合规则（Task A - Phase 3）

### 1. 深度传播

```typescript
// depth的雾气浓度 → 增强liquid的金属感
liquid.metallicAmount += depth.fog * 0.3;

// depth的雾气浓度 → 增强PM的能量敏感度
pm.energyToOpacityAmount += depth.fog * 0.25;
```

### 2. 颜色共振

```typescript
// PM的平均亮度 → 影响liquid的色调
liquid.tintHue = (liquid.tintHue + pm.avgLuma * 60) % 360;

// PM的平均亮度 → 影响liquid的亮度
liquid.tintBrightness = 1.0 + pm.avgLuma * 0.4;
```

### 3. 节奏级联

```typescript
// BPM检测 → 同步liquid时间流速
liquid.timeScale = baseTimeScale * (1 + ((bpm - 120) / 120) * 0.3);

// BPM检测 → 调整depth的层数（快歌更复杂）
depth.layers = baseLayers + Math.floor((bpm - 120) / 20);
```

### 4. 空间扭曲

```typescript
// liquid的波浪振幅 → 扭曲depth的空间
depth.scale = baseScale * (1 + liquid.waveAmplitude * 0.3);

// liquid的波浪振幅 → 增强depth的模糊
depth.blur = baseBlur + liquid.waveAmplitude * 0.2;
```

---

## 验证矩阵

### Task B 验收（音频输入修复）

| 测试场景    | 验证点              | 预期结果              | 状态 |
| ----------- | ------------------- | --------------------- | ---- |
| 编译检查    | TypeScript 编译     | 0 errors              | ⏳   |
| 麦克风输入  | 选择麦克风设备      | 状态栏显示设备名      | ⏳   |
| 麦克风输入  | 对着麦克风说话      | energy 响应、视觉变化 | ⏳   |
| 系统音频    | 播放 Tab 的 YouTube | energy 响应、视觉变化 | ⏳   |
| 设备记忆    | 刷新页面            | 恢复上次选择的设备    | ⏳   |
| 权限拒绝    | 拒绝麦克风权限      | 错误提示友好          | ⏳   |
| 设备不存在  | 选择已拔出的设备    | 错误提示友好          | ⏳   |
| Diagnostics | 查看诊断面板        | 显示 deviceId/label   | ⏳   |

### Task A 验收（3D 耦合增强）

见 [AIVJ_3D_COUPLING_PLAN.md](./AIVJ_3D_COUPLING_PLAN.md) 第 8 章"验证与调试"

---

## 代码位置速查

### Task B 相关文件

| 文件                                              | 行数 | 作用                | 需要修改                        |
| ------------------------------------------------- | ---- | ------------------- | ------------------------------- |
| `src/audio/AudioBus.ts`                           | 150  | 音频总线            | ✅ 添加 6 个方法+3 个字段       |
| `src/audio/StreamAudioProcessor.ts`               | 700+ | 底层音频处理        | ⚠️ 确认已有 loadFromStream/seek |
| `src/app/controllers/audioTransportController.ts` | 960  | UI 控制器           | ❌ 无需修改（调用方）           |
| `src/types/audioFrame.ts`                         | 20   | AudioFrame 类型定义 | ❌ 无需修改                     |

### Task A 相关文件

见 [AIVJ_3D_COUPLING_PLAN.md](./AIVJ_3D_COUPLING_PLAN.md) 第 6 章"实施路径"

---

## 时间估算

### Task B（P0 - 阻塞）

- **B.1** 扩展 AudioBus API：1-2 小时
- **B.2** 确认 StreamAudioProcessor：30 分钟
- **B.3** UI 验证测试：30 分钟
- **总计**：2-3 小时

### Task A（P1 - 增强）

- **Phase 2** UI 可视化：6-8 小时
- **Phase 3** 算法增强：8-12 小时
- **Phase 4** AI 导演：长期规划
- **总计（Phase 2-3）**：14-20 小时

---

## 执行优先级

1. ⚠️ **立即执行 Task B.1-B.2**（修复编译错误）
2. ✅ **验证 Task B.3**（确保音频输入可用）
3. 🎯 **规划 Task A 方向**（UI 优先 or 算法优先）
4. 🚀 **实施 Task A Phase 2-3**（3D 耦合增强）

---

## 附录：参考文档

- [AIVJ_3D_COUPLING_PLAN.md](./AIVJ_3D_COUPLING_PLAN.md) - 3D 参数耦合详细设计
- [DATA_INTERFACES.zh.md](../DATA_INTERFACES.zh.md) - 数据接口规范
- [LOCAL_DEV_GUIDE.md](../LOCAL_DEV_GUIDE.md) - 本地开发指南
- [MASTER_SPEC.zh.md](../MASTER_SPEC.zh.md) - 总体规格说明

---

**最后更新**：2025-12-18
**状态**：Task B 待验证 / Task A 已实现（未验证）  
**阻塞问题**：B.3 现场验收未完成

## 未验证项目
- A.UI.1~A.UI.2：已实现，未做现场验证
- A.UI.3：已实现联动监视器，但未做现场验证
- A.Algo.4~A.Algo.7：已实现，未做现场验证
- B.3.1~B.3.5：音频输入现场验收未执行
---

## 未验证项目（补充，2025-12-24）

- TypeScript 编译通过（未运行）
- B.3 UI 交互验收（Use input / 系统音频 / 设备记忆 / 权限拒绝 / 设备缺失）
- 状态栏显示“🎚️ 已使用输入：XXX”（代码已具备，未现场验证）
- AudioFrame.energy 响应麦克风声音（代码已具备，未现场验证）
- 刷新页面后自动恢复上次选择（代码已具备，未现场验证）
