# 音频系统重构状态报告

## 完成情况

### ✅ Phase 1: MeydaAudioAnalyzer 完善
**文件**: `src/audio/MeydaAudioAnalyzer.ts`

已完成：
- [x] 动态导入 Meyda，失败时优雅降级
- [x] Mel 频带计算映射到 Techno Bands
- [x] 高级特征提取（spectralCentroid, spectralRolloff, etc.）
- [x] 同步版本 `extractFeaturesFromPCMSync` 用于性能敏感路径
- [x] 异步版本 `extractFeaturesFromPCM` 用于完整特征提取
- [x] 测试兼容接口（简化字段名 kick/bass/clap/synth/hihat）

### ✅ Phase 2: AudioBus 集成
**文件**: `src/audio/AudioBus.ts`

已完成：
- [x] 特性开关 `useMeyda` 控制
- [x] Meyda 分析器延迟初始化（等待 AudioContext 就绪）
- [x] 频带计算优先使用 Meyda，失败时回退到自研实现
- [x] 增强特征合并到 AudioFrame.features
- [x] 资源清理（dispose 时停止 Meyda 分析器）

### ✅ Phase 3: 向后兼容
**文件**: `src/audio/index.ts`, `src/layers/ProjectM3DCoupling.ExpertOptimized.ts`

已完成：
- [x] 同步版本的特征提取（避免 async 传染）
- [x] ProjectM3DCoupling 使用同步版本
- [x] 所有测试编译通过

## 特性开关配置

```typescript
// src/config/featureFlags.ts
export const FeatureFlags = {
  useMeyda: true,      // 控制是否使用 Meyda
  // ... 其他开关
};
```

## 数据流对比

### 重构前（纯自研）
```
Audio Input → StreamAudioProcessor → AudioBus (avgBins01) → AudioFrame → Visuals
                                          ↑
                                    自研简单平均算法
```

### 重构后（Meyda 增强）
```
Audio Input → StreamAudioProcessor → AudioBus → AudioFrame → Visuals
                                          ↑
                                   ┌──────┴──────┐
                                   ↓             ↓
                              MeydaAnalyzer  Fallback
                              (专业特征)     (自研实现)
```

## 新增 AudioFrame 字段

当 `useMeyda` 启用时，`AudioFrame.features` 包含：

```typescript
{
  // 原有字段（保持不变）
  kick01Raw, kick01Long,
  bass01Raw, bass01Long,
  clap01Raw, clap01Long,
  synth01Raw, synth01Long,
  hihat01Raw, hihat01Long,
  flux,
  
  // 新增字段（Meyda 提供）
  spectralCentroid: number;   // 频谱质心 - 明亮度
  spectralRolloff: number;    // 频谱滚降 - 低频占比
  spectralSpread: number;     // 频谱展宽 - 频率分布
  spectralFlatness: number;   // 频谱平坦度 - 噪声vs谐波
  spectralSkewness: number;   // 频谱偏度
  spectralKurtosis: number;   // 频谱峰度
  zcr: number;                // 过零率 - 节奏性
  melBands: number[];         // Mel 频带 (26维)
  barkBands?: number[];       // Bark 频带 (24维)
  chroma?: number[];          // 色度特征 (12维)
}
```

## 使用示例

### 基本使用（自动）
```typescript
// AudioBus 会自动使用 Meyda（如果启用）
const audioBus = new AudioBus();
audioBus.onFrame((frame) => {
  // frame.features 包含 Meyda 特征
  console.log(frame.features.spectralCentroid);
});
```

### 直接使用 MeydaAnalyzer
```typescript
import { MeydaAudioAnalyzer } from "./audio/MeydaAudioAnalyzer";

const analyzer = new MeydaAudioAnalyzer(audioContext, sourceNode);
await analyzer.init();

// 获取 Techno Bands
const bands = analyzer.getTechnoBands();

// 获取高级特征
const features = analyzer.getEnhancedFeatures();
```

### 同步特征提取（性能敏感场景）
```typescript
import { extractFeaturesFromPCMSync } from "./audio/MeydaAudioAnalyzer";

// 无需 await
const result = extractFeaturesFromPCMSync(pcmData, 44100);
if (result?.amplitudeSpectrum) {
  // 使用频谱数据
}
```

## 性能影响

| 指标 | 自研实现 | Meyda | 变化 |
|-----|---------|-------|------|
| 初始化时间 | 0ms | ~50ms | 略微增加 |
| 每帧计算 | O(n) 简单平均 | O(nlogn) FFT | 更精确 |
| 内存占用 | 低 | 中 | 略有增加 |
| 特征质量 | 低 | 高 | 显著提升 |

## 回滚策略

如果出现问题，可以通过以下方式回滚：

```typescript
// 方法1: 关闭特性开关
import { overrideFeature } from "./config/featureFlags";
const restore = overrideFeature("useMeyda", false);

// 方法2: 恢复原始 AudioBus.ts（备份旧版本）
// git checkout src/audio/AudioBus.ts
```

## 已知限制

1. **Meyda 初始化需要时间** (~50-100ms)，在此期间使用回退实现
2. **Mel bands 映射是近似值**，可能与原有频段略有差异
3. **高级特征需要更多 CPU**，低端设备可能需要关闭

## 下一步建议

1. **A/B 测试**: 对比 Meyda vs 自研实现的视觉效果
2. **参数调优**: 根据实际音乐调整 Mel bands 映射
3. **性能监控**: 监控低端设备的性能表现
4. **文档更新**: 向用户介绍新的音频特征

## 文件变更列表

| 文件 | 变更类型 | 说明 |
|-----|---------|------|
| `src/audio/MeydaAudioAnalyzer.ts` | 重写 | 完整的 Meyda 封装 |
| `src/audio/AudioBus.ts` | 修改 | 集成 Meyda，保持向后兼容 |
| `src/audio/index.ts` | 修改 | 导出新接口 |
| `src/layers/ProjectM3DCoupling.ExpertOptimized.ts` | 修改 | 使用同步版本 |

---

**重构完成日期**: 2026-01-30  
**状态**: ✅ 编译通过，等待测试验证
