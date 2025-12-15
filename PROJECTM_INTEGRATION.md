# ProjectM + 液态金属图层 集成说明

## 📋 架构概览

### 图层系统
newliveweb使用Three.js场景管理器，包含两个独立的视觉图层：

1. **LiquidMetalLayerV2** - 液态水银背景
   - WebGL Shader效果（flowing_waves算法）
   - 响应音频频段（bass/mid/high）
   - 可通过UI控制面板实时调整参数

2. **ProjectMLayer** - ProjectM音乐可视化
   - WASM驱动的高性能音乐可视化
   - 支持MilkDrop预设（.milk文件）
   - 渲染到offscreen canvas然后映射到Three.js纹理

### 数据流架构

```
Audio File/Stream
    ↓
AudioController (管理播放和分析)
    ↓
StreamAudioProcessor (Web Audio API + AnalyserNode)
    ↓
AudioData {
    pcm: Float32Array        // PCM音频样本
    frequency: Uint8Array    // FFT频谱数据
    bands: {low, mid, high}  // 频段能量
    peak, rms, time
}
    ↓
    ├─→ ProjectMLayer.addAudioData(pcm)
    │   └─→ ProjectMEngine._projectm_pcm_add_float()
    │       └─→ WASM模块处理
    │           └─→ Canvas渲染
    │               └─→ Three.js CanvasTexture
    │
    └─→ LiquidMetalLayerV2.setAudioBands(bands)
        └─→ Shader uniforms (uAudioBass/Mid/High)
            └─→ 实时调制waveAmplitude/brightness等参数
```

## 🔧 关键组件

### 1. ProjectMEngine
**位置**: `src/projectm/ProjectMEngine.ts`

**职责**:
- 加载ProjectM WASM模块 (`/projectm-runtime/projectm.js`)
- 管理ProjectM实例生命周期
- 将PCM音频数据传递给WASM
- 渲染到offscreen canvas

**关键方法**:
```typescript
async init()                           // 初始化WASM模块
loadPresetFromUrl(url: string)         // 加载.milk预设文件
loadPresetData(presetData: string)     // 加载预设内容
addAudioData(pcmData: Float32Array)    // 传递音频样本
render()                               // 渲染一帧
setWindowSize(width, height)           // 调整画布大小
```

### 2. ProjectMLayer
**位置**: `src/layers/ProjectMLayer.ts`

**职责**:
- 实现Layer接口
- 将ProjectMEngine的canvas映射为Three.js纹理
- 使用AdditiveBlending混合模式叠加到场景

**混合设置**:
```typescript
material = new THREE.MeshBasicMaterial({
  map: this.texture,
  transparent: true,
  opacity: 0.85,                    // 85%不透明度
  blending: THREE.AdditiveBlending  // 加法混合模式
});
```

### 3. LiquidMetalLayerV2
**位置**: `src/layers/LiquidMetalLayerV2.ts`

**职责**:
- Shader驱动的液态金属背景
- 接收音频频段数据进行响应式调制
- 支持实时参数调整

**音频响应**:
```typescript
update(deltaTime: number) {
  // 音频响应逻辑
  if (this.params.audioReactive && audioBands) {
    this.material.uniforms.uAudioBass.value = audioBands.low;
    this.material.uniforms.uAudioMid.value = audioBands.mid;
    this.material.uniforms.uAudioHigh.value = audioBands.high;
  }
}
```

**Shader参数**:
- `uTimeScale`: 时间缩放 (0-5)
- `uIterations`: UV扭曲迭代次数 (1-10)
- `uWaveAmplitude`: 波浪幅度 (0-2)
- `uMouseInfluence`: 鼠标影响强度 (0-5)
- `uMetallicAmount`: 金属闪烁 (0-1)
- `uBrightness`: 亮度 (0-2)
- `uAudioBass/Mid/High`: 音频频段能量

### 4. AudioController
**位置**: `src/audio/AudioController.ts`

**职责**:
- 加载音频文件/URL
- 管理播放控制
- 实时分析音频数据
- 通过onFrame回调分发AudioData

**使用方式**:
```typescript
const audioController = new AudioController();

// 加载音频
await audioController.loadFile(file);
await audioController.loadUrl(url);

// 监听音频数据帧
audioController.onFrame((data: AudioData) => {
  projectLayer.addAudioData(data.pcm);
  liquidLayer.setAudioBands(data.bands);
});

// 播放控制
audioController.play();
audioController.pause();
audioController.toggle();
```

## 🎮 用户交互

### 音频控制
- **Load audio**: 加载本地音频文件
- **Load URL**: 从URL流式传输音频
- **Play/Pause**: 控制播放
- **Volume**: 音量滑块 (0-1)

### ProjectM预设
- **Preset下拉菜单**: 选择MilkDrop预设
- **Import .milk**: 导入自定义预设文件
- **Load URL**: 从URL加载预设
- **Next preset**: 切换到下一个预设
- **Auto-cycle**: 自动轮播预设 (15-600秒间隔)

### 液态金属控制
- **按L键**: 显示/隐藏控制面板
- **参数滑块**: 实时调整所有shader参数
- **预设按钮**: 快速切换预设配置
  - 经典银色
  - 流动汞
  - 冷钢
  - 极简
- **音频响应开关**: 启用/禁用音频调制
- **重置默认**: 恢复初始参数

## 🚀 启动流程

1. **初始化场景**:
```typescript
const sceneManager = new SceneManager(canvas);
const liquidLayer = new LiquidMetalLayerV2();
const projectLayer = new ProjectMLayer();
const audioController = new AudioController();
```

2. **添加图层**:
```typescript
await sceneManager.addLayer(liquidLayer);  // 底层: 液态金属
await sceneManager.addLayer(projectLayer); // 顶层: ProjectM
sceneManager.start();
```

3. **连接音频数据流**:
```typescript
audioController.onFrame((data) => {
  projectLayer.addAudioData(data.pcm);    // PCM -> ProjectM WASM
  liquidLayer.setAudioBands(data.bands);  // Bands -> Shader uniforms
});
```

4. **加载初始预设** (可选):
```typescript
await projectLayer.loadPresetFromUrl('/presets/default.milk');
```

## 📁 文件结构

```
newliveweb/
├── src/
│   ├── main.ts                    # 应用入口
│   ├── SceneManager.ts            # Three.js场景管理
│   ├── layers/
│   │   ├── Layer.ts               # 图层接口
│   │   ├── LiquidMetalLayerV2.ts  # 液态金属图层
│   │   └── ProjectMLayer.ts       # ProjectM图层
│   ├── projectm/
│   │   └── ProjectMEngine.ts      # ProjectM WASM封装
│   ├── audio/
│   │   ├── AudioController.ts     # 音频控制器
│   │   ├── StreamAudioProcessor.ts # 音频分析
│   │   └── types.ts               # 音频数据类型
│   └── ui/
│       └── LiquidMetalControlPanel.ts # 参数控制面板
├── public/
│   ├── projectm-runtime/
│   │   ├── projectm.js            # WASM glue代码
│   │   └── projectm.wasm          # ProjectM核心
│   └── presets/
│       └── library-manifest.json  # 预设清单
└── index.html
```

## 🎨 视觉效果

### 混合模式
- **LiquidMetalLayer**: 基础层，使用normalBlending
- **ProjectMLayer**: 叠加层，使用AdditiveBlending (opacity: 0.85)

这种配置产生：
- 液态金属提供背景纹理
- ProjectM效果以85%强度叠加
- 加法混合创造发光效果
- 两层都响应音频，产生协同视觉效果

### 性能优化
- ProjectM渲染到offscreen canvas (避免DOM操作)
- CanvasTexture.needsUpdate仅在render后设置
- AudioController使用requestAnimationFrame同步
- Shader参数仅在变化时更新

## 🐛 调试技巧

### 检查ProjectM状态
```javascript
// 浏览器控制台
console.log(projectLayer.isReady());
```

### 检查音频数据流
```javascript
audioController.onFrame((data) => {
  console.log('PCM samples:', data.pcm.length);
  console.log('Bands:', data.bands);
});
```

### 检查WASM加载
```javascript
// 应该看到 projectm.js 和 projectm.wasm 返回 200
// Network tab -> Filter: projectm
```

### 查看Shader编译
```javascript
// Three.js会在控制台输出shader错误
// 查找 "THREE.WebGLProgram" 相关消息
```

## ✅ 验证清单

- [ ] Vite开发服务器运行在 http://127.0.0.1:5174/
- [ ] 页面加载无JavaScript错误
- [ ] 可以看到液态金属背景
- [ ] 按L键显示/隐藏控制面板
- [ ] 加载音频文件后播放按钮可用
- [ ] 播放音频时液态金属背景响应节奏
- [ ] ProjectM预设下拉菜单有选项
- [ ] 选择预设后ProjectM视觉效果显示
- [ ] ProjectM效果跟随音乐变化
- [ ] 两个图层正确混合显示

## 🎯 下一步增强

### 可能的改进方向

1. **更深度的音频响应**:
   - 根据ProjectM的视觉复杂度动态调整液态金属参数
   - 节拍检测驱动参数脉冲效果

2. **预设同步**:
   - 为每个ProjectM预设创建匹配的液态金属配置
   - 预设切换时平滑过渡参数

3. **性能优化**:
   - 根据FPS动态降低质量
   - 移动设备的简化模式

4. **用户自定义**:
   - 保存/加载个人配置
   - 导出参数配置为JSON
   - 社区预设分享

## 📝 总结

**你的问题答案**：
> "projectm实际上是一个图层对吗"

**是的！** ProjectM确实是一个独立的图层。具体来说：

1. **ProjectM是一个Layer实现** - 它实现了`Layer`接口，和`LiquidMetalLayerV2`一样
2. **独立渲染** - ProjectM渲染到自己的offscreen canvas，然后作为Three.js纹理
3. **音频驱动** - 通过`addAudioData(pcm)`接收PCM音频样本
4. **与其他层叠加** - 使用AdditiveBlending混合到场景中
5. **不直接影响液态金属** - 两个图层独立响应音频数据

音频数据流的路径是：
```
AudioController 
  → AudioData {pcm, bands}
    ├─→ ProjectMLayer (使用pcm驱动WASM)
    └─→ LiquidMetalLayer (使用bands调制shader)
```

两个图层都从**同一个音频源**获取数据，但处理方式不同：
- ProjectM: 完整的音乐可视化算法（预设驱动）
- LiquidMetal: Shader参数调制（频段能量驱动）

这样设计的好处：
✅ 解耦 - 两个图层可以独立开发和调试
✅ 灵活 - 可以单独启用/禁用任一图层
✅ 高效 - 各自使用最适合的渲染方式
✅ 协同 - 两者都响应音频创造统一视觉体验
