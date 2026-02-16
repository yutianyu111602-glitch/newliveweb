# 音频系统重构计划：从自研到专业库

## 1. 当前架构分析

### 1.1 数据流

```
┌─────────────────────┐
│  StreamAudioProcessor │  ← 原始音频获取 (Web Audio API)
│  - PCM (时域)        │
│  - Frequency (频域)  │
│  - RMS/Peak          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      AudioBus       │  ← 当前自研处理核心
│                     │
│  1. computeTechnoBands()   ← 问题区域1
│     - avgBins01()          ← 简单平均，精度低
│                             ← 使用 Uint8Array frequency bins
│                             ← 频率分辨率差
│                     │
│  2. smoothAttackRelease()  ← 问题区域2
│     - 自研包络跟随器        ← 不是标准算法
│                             ← 参数调优困难
│                     │
│  3. Spectral Flux          ← 问题区域3
│     - 简单差分和            ← 不是专业瞬态检测
│                             ← 容易误触发
│                     │
│  4. buildFrame()           ← 组装 AudioFrame
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    AudioFrame       │  ← 输出到可视化层
│  (types/audioFrame.ts)│
└─────────────────────┘
```

### 1.2 问题识别

| 自研代码 | 问题 | 专业替代方案 |
|---------|------|------------|
| `avgBins01()` | 简单平均，频率分辨率低 | Meyda 的 Mel/Bark 频带 |
| `computeTechnoBands()` | 硬编码频段边界，无人耳感知模型 | Meyda 的 perceptual bands |
| `smoothAttackRelease()` | 非标准包络算法 | 标准 ADSR 或 Meyda 的平滑输出 |
| Spectral Flux | 简单差分，噪声敏感 | Meyda 的多特征融合 |
| `calculateRMS()` | 基础实现，无权重 | ITU-R BS.1770 标准响度 |

## 2. 目标架构

```
┌─────────────────────┐
│  StreamAudioProcessor │  ← 保持不变（原始数据获取）
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    MeydaAnalyzer    │  ← 新增：专业特征提取
│  (替代 AudioBus 部分) │
│                     │
│  - melBands         │  ← 替代 avgBins01
│  - barkBands        │  ← 更符合人耳感知
│  - spectralCentroid │  ← 新增：明亮度
│  - spectralRolloff  │  ← 新增：低频占比
│  - spectralFlatness │  ← 新增：噪声/谐波
│  - rms              │  ← 标准能量计算
│  - zcr              │  ← 过零率（节奏检测）
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    AudioBus         │  ← 简化后：仅负责
│                     │
│  - 数据传递          │
│  - 能量归一化        │
│  - 包络跟随（可选）   │
│                     │
│  删除：avgBins01     │
│  删除：复杂计算逻辑   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    AudioFrame       │  ← 完全向后兼容
└─────────────────────┘
```

## 3. 详细替换计划

### Phase 1: 创建 Meyda 分析器 (安全，可回滚)

**目标**: 创建新的 `MeydaAudioAnalyzer` 类，与现有系统并行运行

**文件**: `src/audio/MeydaAudioAnalyzer.ts` (已存在，需完善)

**步骤**:
1. 完善 Meyda 初始化，处理 WASM 加载失败回退
2. 创建 `TechnoBands` 计算，映射 Mel bands 到 kick/bass/clap/synth/hihat
3. 添加特征缓存，避免每帧重复计算
4. 提供与现有 `AudioBus` 相同的输出格式

**验证点**:
- [ ] Meyda 成功加载
- [ ] 无音频时返回零值
- [ ] 异常处理不崩溃

### Phase 2: 创建 AudioBus 包装器 (渐进替换)

**目标**: 创建 `AudioBusMeyda` 类，继承或包装现有 `AudioBus`

**策略**: 
- 保持 `AudioBus` 接口完全不变
- 内部使用 Meyda 计算频带
- 保留原有的 `smoothAttackRelease`（这是业务逻辑，非信号处理）

**代码变更**:
```typescript
// AudioBus.ts 修改
class AudioBus {
  private meydaAnalyzer: MeydaAudioAnalyzer | null = null;
  
  private buildFrame(data: AudioData, opts): AudioFrame {
    // ... 保持原有逻辑 ...
    
    // 替换这行：
    // bandRaw = computeTechnoBandFeatures({ bins, sampleRate: sr });
    
    // 改为：
    if (this.meydaAnalyzer?.isReady()) {
      bandRaw = this.meydaAnalyzer.getTechnoBands();
    } else {
      // 回退到原有实现
      bandRaw = computeTechnoBandFeatures({ bins, sampleRate: sr });
    }
    
    // ... 其余逻辑保持不变 ...
  }
}
```

### Phase 3: 特征增强 (新增功能)

**目标**: 向 `AudioFrame.features` 添加 Meyda 高级特征

**新增字段**:
- `spectralCentroid`: 频谱质心（明亮度）
- `spectralRolloff`: 频谱滚降（低频占比）
- `spectralFlatness`: 频谱平坦度（噪声 vs 谐波）
- `zcr`: 过零率（节奏性）

**验证点**:
- [ ] 所有新增字段 0-1 归一化
- [ ] 向后兼容（旧代码忽略新字段）

### Phase 4: 彻底替换 (删除自研代码)

**条件**: Phase 1-3 稳定运行 1-2 周后

**删除内容**:
- `avgBins01()` 函数
- `computeTechnoBandFeatures()` 函数
- 相关辅助函数

**保留内容**:
- `smoothAttackRelease`（业务逻辑）
- 能量归一化逻辑
- 对象池优化

## 4. 风险评估与缓解

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| Meyda 加载失败 | 高 | 保留原有实现作为回退 |
| 特征值范围变化 | 中 | 重新校准归一化参数 |
| 性能下降 | 中 | 特征缓存 + 按需计算 |
| 视觉效果变化 | 低 | 渐进替换，A/B测试 |
| Mel bands 映射不准确 | 中 | 与原有频段对比验证 |

## 5. 回滚策略

```typescript
// featureFlags.ts
export const FeatureFlags = {
  // ...
  useMeydaBands: true,      // Phase 2 开关
  useMeydaFeatures: true,   // Phase 3 开关
};

// AudioBus.ts
if (isFeatureEnabled('useMeydaBands') && this.meydaAnalyzer?.isReady()) {
  // 使用 Meyda
} else {
  // 使用自研实现
}
```

## 6. 验证清单

### 功能验证
- [ ] 频带能量响应正确（kick/bass/clap/synth/hihat）
- [ ] 静音时所有值为 0
- [ ] 峰值时所有值接近 1
- [ ] 长时平滑 (Long) 正常工作
- [ ] Spectral Flux 正常工作

### 性能验证
- [ ] 60fps 不卡顿
- [ ] 内存无泄漏
- [ ] GC 压力不增加

### 兼容性验证
- [ ] 所有现有预设正常工作
- [ ] 音频输入/文件/流全部支持
- [ ] Chrome/Firefox/Safari 兼容

## 7. 时间线

| Phase | 工作量 | 风险 | 建议时间 |
|-------|-------|------|---------|
| Phase 1 | 1天 | 低 | 立即开始 |
| Phase 2 | 2天 | 中 | Phase 1 完成后 |
| Phase 3 | 1天 | 低 | Phase 2 稳定后 |
| Phase 4 | 0.5天 | 低 | 稳定运行1-2周后 |

## 8. 立即行动项

1. **完成 Phase 1**: 完善 `MeydaAudioAnalyzer.ts`
2. **添加特性开关**: 在 `featureFlags.ts` 添加控制
3. **创建 A/B 测试**: 对比自研 vs Meyda 输出
4. **文档更新**: 记录新的特征字段含义
