# 示例 1: 基础音频分析

使用 Meyda 提取实时音频特征

## 快速开始

```typescript
import { AudioBusOptimized } from 'newliveweb/audio';

// 创建音频总线
const audioBus = new AudioBusOptimized();

// 加载音频文件
await audioBus.loadUrl('/path/to/music.mp3');

// 监听音频特征
audioBus.onFrame((frame) => {
  console.log('Energy:', frame.energy);
  console.log('Brightness:', frame.features.centroid);
  console.log('Kick:', frame.features.kick01Raw);
});

// 播放
audioBus.play();
```

## 特征说明

| 特征 | 范围 | 描述 |
|------|------|------|
| `energy` | 0-1 | 整体能量/响度 |
| `brightness` | 0-1 | 频谱质心（高频含量） |
| `noisiness` | 0-1 | 频谱平坦度 |
| `kick/bass/clap/synth/hihat` | 0-1 | 电子音乐频段 |

## 节拍检测

```typescript
audioBus.onFrame((frame) => {
  if (frame.beat) {
    console.log('Beat detected!');
    // 触发视觉特效
  }
});
```

## 性能优化

使用 Worker 避免阻塞主线程：

```typescript
import { getAudioAnalyzerWorker } from 'newliveweb/audio';

const worker = getAudioAnalyzerWorker();
await worker.initialize();

worker.onFrame((frame) => {
  // 处理特征
});
```
