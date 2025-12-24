# 音频驱动参数速查表

**用途**: 快速调整音频驱动参数以适配不同音乐风格和场景
**受众**: VJ、开发者、音频工程师

---

## 📋 核心参数矩阵

### 1. **响应性参数** (Responsiveness)

| **参数**                 | **位置**              | **默认值**                   | **范围**   | **用途**                                 |
| ------------------------ | --------------------- | ---------------------------- | ---------- | ---------------------------------------- |
| `smoothingTimeConstant`  | StreamAudioProcessor  | 0.45 (file)<br>0.25 (stream) | 0.0-1.0    | Web Audio 平滑度<br>↓ 更快响应，↑ 更稳定 |
| `accentAttackMs`         | unifiedAivjController | 60ms                         | 20-200ms   | Accent 上升时间<br>↓ 更快捕捉瞬态        |
| `accentReleaseMs`        | unifiedAivjController | 150ms                        | 80-500ms   | Accent 释放时间<br>↑ 更长尾音效果        |
| `energyAttackMs`         | ExpressiveDriver      | 240ms                        | 100-600ms  | 能量上升时间                             |
| `energyReleaseMs`        | ExpressiveDriver      | 900ms                        | 400-2000ms | 能量下降时间                             |
| `audioControlsAttackMs`  | audioControls         | 100ms                        | 50-300ms   | Macro 驱动上升                           |
| `audioControlsReleaseMs` | audioControls         | 620ms                        | 300-1500ms | Macro 驱动下降                           |

**预设推荐**:

```javascript
// 1. 快节奏 (Techno/Dnb 160-180 BPM)
accentAttackMs: 40;
accentReleaseMs: 120;
smoothingTimeConstant: 0.2;

// 2. 中等节奏 (House 120-130 BPM)
accentAttackMs: 60; // 默认
accentReleaseMs: 150;
smoothingTimeConstant: 0.35;

// 3. 慢节奏 (Dub/Ambient 80-100 BPM)
accentAttackMs: 80;
accentReleaseMs: 250;
smoothingTimeConstant: 0.5;

// 4. 极致响应 (Live Performance)
accentAttackMs: 30;
accentReleaseMs: 100;
smoothingTimeConstant: 0.15;
```

---

### 2. **频率分析参数** (FFT)

| **参数**          | **位置**             | **默认值** | **范围**          | **影响**                               |
| ----------------- | -------------------- | ---------- | ----------------- | -------------------------------------- |
| `fftSize`         | StreamAudioProcessor | 2048       | 256-8192<br>(2^n) | 频率分辨率 vs 延迟<br>↑ 更精细，↓ 更快 |
| `minDecibels`     | AnalyserNode         | -95dB      | -100~-30dB        | 噪声门限                               |
| `maxDecibels`     | AnalyserNode         | -20dB      | -50~0dB           | 峰值映射                               |
| `frequencyFpsCap` | AudioBus             | 30fps      | 15-60fps          | FFT 更新频率                           |

**频率分辨率计算**:

```
分辨率 (Hz) = sampleRate / fftSize
例如: 48000Hz / 2048 = 23.4Hz/bin

延迟 (ms) ≈ (fftSize / sampleRate) * 1000
例如: (2048 / 48000) * 1000 ≈ 42.7ms
```

**场景推荐**:

```javascript
// 1. 低延迟优先 (VJ演出)
fftSize: 1024; // ~21ms 延迟
frequencyFpsCap: 30; // 节省CPU

// 2. 平衡 (默认)
fftSize: 2048; // ~43ms 延迟
frequencyFpsCap: 30;

// 3. 高精度 (录制/分析)
fftSize: 4096; // ~85ms 延迟
frequencyFpsCap: 60;
```

---

### 3. **频段权重配置** (Band Weights)

#### 3.1 AudioControls 权重

```javascript
// audioControls.ts 默认配置
weights: {
  fusion: {
    energy: 0.9,     // 主导: 整体能量
    bass: 0.8,       // 次要: 低频驱动
    flux: 0.2,       // 辅助: 瞬态变化
    beatPulse: 0.25  // 辅助: 节拍脉冲
  },
  motion: {
    energy: 0.2,     // 辅助
    bass: 0.25,      // 辅助
    flux: 1.05,      // 主导: 瞬态驱动运动
    beatPulse: 0.7   // 次要: 节拍驱动
  },
  sparkle: {
    energy: 0.1,     // 最小
    bass: 0.15,      // 最小
    flux: 0.95,      // 主导: 瞬态闪烁
    beatPulse: 0.45  // 辅助: 节拍闪烁
  }
}
```

**风格优化**:

```javascript
// 1. Bass-heavy (Dubstep/Dub)
fusion: { bass: 1.2, energy: 0.7 }
motion: { bass: 0.5, flux: 0.8 }

// 2. Percussion-focused (Breakbeat/Jungle)
motion: { flux: 1.3, beatPulse: 0.9 }
sparkle: { flux: 1.2, beatPulse: 0.6 }

// 3. Melodic (Trance/Progressive)
fusion: { energy: 1.1, bass: 0.5 }
motion: { energy: 0.4, flux: 0.7 }

// 4. Ambient/Drone
fusion: { energy: 1.0, flux: 0.05 }
motion: { energy: 0.1, flux: 0.2 }
sparkle: { flux: 0.3, beatPulse: 0.1 }
```

---

#### 3.2 StageBands punchy profile

```javascript
// stageBands.ts 配置
{
  low: {
    baseRate: 0.9,      // 噪声gate速率
    floor: 0.02,        // 静音阈值
    gateMul: 0.55,      // gate衰减系数
    gain: 3.2,          // 增益 (最高)
    knee: 0.18,         // 软压缩拐点
    gamma: 0.52,        // 动态压缩指数
    attack: 22,         // 上升速率 (Hz)
    release: 5.8,       // 下降速率 (Hz)
    peakDecay: 1.05,    // 峰值衰减 (s)
    peakHoldMul: 0.92   // 峰值保持系数
  },
  mid: {
    gain: 2.6,          // 中等增益
    attack: 18,
    release: 6.2,
    peakHoldMul: 0.9
  },
  high: {
    gain: 3.8,          // 最高增益
    attack: 26,         // 最快响应
    release: 7.2,
    peakHoldMul: 0.88
  }
}
```

**调优方向**:

```javascript
// 更激进的冲击感
low.gain: 3.2 → 4.0
low.peakHoldMul: 0.92 → 0.95
high.attack: 26 → 32

// 更平滑的过渡
low.release: 5.8 → 4.5  // 更快释放
low.gamma: 0.52 → 0.60  // 更少压缩
```

---

### 4. **Accent Boost 系数**

```javascript
// unifiedAivjController.ts applyAccent()
sparkleBoost = 0.3 * accent * sectionMul * intensityMul * macroMul;
motionBoost = 0.13 * accent * sectionMul * intensityMul * macroMul;
fusionBoost = 0.03 * bodyDrive * (0.7 + 0.3 * accent) * fusionMul;
slotPulse = 0.065 * accent * sectionMul * intensityMul * slotMul;

// 槽位权重 (inline)
slot[0] * 0.8; // M4 最强
slot[1] * 0.45; // M5 中等
slot[2] * 0.55; // M6 中强
slot[3] * 0.75; // M7 强
slot[4] * 0.6; // M8 较强
```

**Section multiplier**:

```javascript
section === "PEAK"   ? 1.25  // PEAK段落加强
section === "CALM"   ? 0.75  // CALM段落减弱
section === "GROOVE" ? 1.0   // 默认
```

**Profile multiplier** (TechnoProfileId):

```javascript
"peakRave":  { macroMul: 1.15, fusionMul: 1.1, slotMul: 1.1 }
"videoVj":   { macroMul: 1.05, fusionMul: 1.0, slotMul: 1.0 }
"techno":    { macroMul: 1.0,  fusionMul: 1.0, slotMul: 1.0 }  // 默认
"dub":       { macroMul: 0.95, fusionMul: 0.95, slotMul: 0.95 }
"ambient":   { macroMul: 0.85, fusionMul: 0.9, slotMul: 0.9 }
```

**调优场景**:

```javascript
// 1. 更强的视觉冲击 (Festival)
sparkleBoost: 0.3 → 0.4
motionBoost: 0.13 → 0.18
sectionMul: 1.25 (PEAK) → 1.5

// 2. 更细腻的律动 (Club)
sparkleBoost: 0.3 → 0.25
slotPulse: 0.065 → 0.05
accentReleaseMs: 150 → 180

// 3. 极简风格 (Ambient)
sparkleBoost: 0.3 → 0.15
motionBoost: 0.13 → 0.08
fusionBoost: 0.03 → 0.02
```

---

### 5. **Adaptive Gain (Live Input)**

| **参数**            | **位置**             | **默认值** | **范围**   | **用途**                             |
| ------------------- | -------------------- | ---------- | ---------- | ------------------------------------ |
| `PEAK_HISTORY_SIZE` | StreamAudioProcessor | 90 samples | 30-180     | 峰值历史窗口<br>↑ 更稳定，↓ 更快响应 |
| `targetPeak`        | updateAdaptiveGain   | 0.5        | 0.3-0.7    | 目标峰值电平                         |
| `tolerance`         | updateAdaptiveGain   | 0.15       | 0.05-0.3   | 容差范围                             |
| `threshold`         | updateAdaptiveGain   | 0.005      | 0.001-0.02 | 噪声阈值                             |
| `maxGain`           | updateAdaptiveGain   | 16.0       | 4.0-32.0   | 最大增益                             |

**公式**:

```javascript
// 收敛逻辑
if (avgPeak < targetPeak - tolerance && avgPeak > threshold) {
  factor = min(2.0, targetPeak / avgPeak);
  newGain = min(maxGain, oldGain * factor * 0.3 + oldGain * 0.7);
} else if (avgPeak > targetPeak + tolerance) {
  factor = max(0.5, targetPeak / avgPeak);
  newGain = max(1.0, oldGain * factor * 0.3 + oldGain * 0.7);
}
```

**场景配置**:

```javascript
// 1. 低电平输入 (Line-in @ -20dB)
maxGain: 16.0 → 32.0
threshold: 0.005 → 0.001

// 2. 高电平输入 (Mixer @ 0dB)
maxGain: 16.0 → 8.0
targetPeak: 0.5 → 0.3

// 3. 快速收敛 (Soundcheck)
PEAK_HISTORY_SIZE: 90 → 45  // 0.75s @ 60fps

// 4. 禁用自动增益 (Manual)
adaptiveGainEnabled = false
inputGain.gain.value = 固定值
```

---

### 6. **ProjectM Audio Feed Cadence**

| **模式** | **Foreground** | **Background** | **场景**    |
| -------- | -------------- | -------------- | ----------- |
| `high`   | 33ms (30fps)   | 42ms (~24fps)  | P95 < 12ms  |
| `mid`    | 42ms (~24fps)  | 50ms (20fps)   | P95 12-20ms |
| `low`    | 50ms (20fps)   | 67ms (15fps)   | P95 > 20ms  |

**手动控制**:

```javascript
// 强制设置 (绕过自适应)
projectLayer.setAudioFeedIntervalMs(33); // fg
projectLayerBg.setAudioFeedIntervalMs(50); // bg

// 恢复自适应
// (下次 updateProjectMAudioCadence 触发时重新计算)
```

**性能权衡**:

- **33ms fg**: 最流畅，CPU +30%
- **50ms fg**: 平衡，推荐
- **67ms fg**: 性能优先，可能有轻微延迟感

---

### 7. **BeatTempo 配置**

| **参数**           | **位置**        | **默认值** | **范围**       | **用途**                        |
| ------------------ | --------------- | ---------- | -------------- | ------------------------------- |
| `updateIntervalMs` | beatTempoWorker | 900ms      | 250-5000ms     | 分析间隔<br>↓ 更快跟踪 BPM 变化 |
| `windowSec`        | beatTempoWorker | 10s        | 4-20s          | 分析窗口<br>↑ 更稳定            |
| `minTempo`         | beatTempoWorker | 60 BPM     | 30-120 BPM     | BPM 范围下限                    |
| `maxTempo`         | beatTempoWorker | 190 BPM    | 120-260 BPM    | BPM 范围上限                    |
| `method`           | beatTempoWorker | "aubio"    | aubio/essentia | 分析算法                        |

**风格配置**:

```javascript
// 1. Techno/House (120-140 BPM)
minTempo: 110;
maxTempo: 150;
updateIntervalMs: 900; // 稳定优先

// 2. Drum & Bass (160-180 BPM)
minTempo: 150;
maxTempo: 190;
updateIntervalMs: 600; // 更快响应

// 3. Dubstep/Halftime (70-90 BPM)
minTempo: 60;
maxTempo: 100;
windowSec: 12; // 更长窗口避免倍频

// 4. 变速混音 (DJ Set)
minTempo: 80;
maxTempo: 180;
updateIntervalMs: 600; // 快速跟踪
```

---

## 🎛️ 快速调优工作流

### Step 1: 诊断当前状态

```javascript
const audit = {
  延迟: measure latency (AUDIO_DRIVE_DEBUG_CHECKLIST.zh.md),
  响应: 观察 accent pulse 波形,
  同步: 检查 beatPhase 对齐,
  驱动: 验证 visual impact vs audio energy
};
```

### Step 2: 识别瓶颈

```
延迟高 → fftSize/audioFeedInterval
响应慢 → attack/release
同步差 → BPM range/confidence
驱动弱 → boost系数/weights
```

### Step 3: 应用预设

```javascript
// 从上方矩阵选择对应场景的参数
// 逐步调整，观察效果
// 记录最佳配置
```

### Step 4: 微调验证

```javascript
// 播放测试音乐 (已知BPM/风格)
// 使用实时监控面板观察指标
// A/B对比调整前后
```

---

## 📁 配置持久化

**导出配置**:

```javascript
const config = {
  audio: {
    fftSize: 2048,
    smoothing: 0.45,
    // ...
  },
  aivj: {
    accentAttack: 60,
    accentRelease: 150,
    // ...
  },
  // ...
};
localStorage.setItem("nw.audio.customConfig", JSON.stringify(config));
```

**加载配置**:

```javascript
const saved = JSON.parse(localStorage.getItem("nw.audio.customConfig"));
// 应用到各模块...
```

---

## 🏷️ 预设模板

### Preset: "Festival Rave"

```javascript
{
  smoothingTimeConstant: 0.15,
  accentAttackMs: 30,
  accentReleaseMs: 100,
  sparkleBoost: 0.4,
  motionBoost: 0.18,
  sectionMul: { PEAK: 1.5 },
  profile: "peakRave",
  fftSize: 1024,
  pmAudioFeed: { fg: 33, bg: 42 }
}
```

### Preset: "Ambient Chill"

```javascript
{
  smoothingTimeConstant: 0.6,
  accentAttackMs: 120,
  accentReleaseMs: 400,
  sparkleBoost: 0.15,
  motionBoost: 0.06,
  fusionBoost: 0.015,
  profile: "ambient",
  energyFloor: 0.4,
  fftSize: 2048
}
```

### Preset: "Club Standard"

```javascript
{
  smoothingTimeConstant: 0.35,
  accentAttackMs: 60,
  accentReleaseMs: 150,
  sparkleBoost: 0.3,
  motionBoost: 0.13,
  profile: "techno",
  fftSize: 2048,
  pmAudioFeed: { fg: 33, bg: 50 }
}
```

---

**版本**: v1.0.0
**最后更新**: 2025-12-24
**配合使用**: AUDIO_DRIVE_ANALYSIS.zh.md + AUDIO_DRIVE_DEBUG_CHECKLIST.zh.md
