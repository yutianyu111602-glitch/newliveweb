# 音频驱动力实时调试清单

**用途**: 在开发/演出现场快速诊断音频驱动问题
**配合**: [AUDIO_DRIVE_ANALYSIS.zh.md](./AUDIO_DRIVE_ANALYSIS.zh.md) 深度分析报告

---

## 🚨 快速诊断流程

### 症状 1: 视觉没有随音频律动

**检查清单**:

```javascript
// 1. 检查 AudioContext 状态
globalThis.__nw_verify.audioContext.state;
// ✅ "running" | ❌ "suspended"

// 2. 检查音频有效性门控
globalThis.__nw_verify.gates.audioValid;
// ✅ true | ❌ false

// 3. 检查音频能量
globalThis.__nw_verify.audioFrame.energy;
// ✅ > 0.1 | ❌ < 0.05 (可能是输入静音)

// 4. 检查 ProjectM audio feed
globalThis.__nw_verify.projectLayer.audioFeedStats;
// ✅ lastFeedMs 在更新 | ❌ 停滞 >1s

// 5. 检查 AIVJ accent
globalThis.__nw_verify.aivj.accent01;
// ✅ 有脉冲变化 | ❌ 始终为 0
```

**常见原因**:

- AudioContext 自动播放策略阻止 → **点击任意按钮恢复**
- 音频输入未正确选择 → **检查 Audio Source 下拉**
- ProjectM audio feed 间隔过长 → **检查 p95 性能指标**

---

### 症状 2: 节拍不同步 (Preset 切换错位)

**检查清单**:

```javascript
// 1. 检查 BeatTempo 状态
globalThis.__nw_verify.beatTempo.ok;
// ✅ true | ❌ false

// 2. 检查 Beat Phase
globalThis.__nw_verify.audioFrame.features.beatPhase;
// ✅ 0.9-0.06 窗口触发切换 | ❌ 随机相位

// 3. 检查 Beat Confidence
globalThis.__nw_verify.audioFrame.features.beatConfidence;
// ✅ > 0.7 | ⚠️ 0.5-0.7 | ❌ < 0.5

// 4. 检查 Beat 门控
globalThis.__nw_verify.gates.beatTrusted;
// ✅ true | ❌ false

// 5. 检查 Preset switch gating
// (控制台会输出 ACTION_DENY 日志)
```

**常见原因**:

- BeatTempo disabled → **启用 BeatTempo 面板**
- 音乐节奏复杂 (变速/环境音) → **confidence < 0.5**
- Phase gating 阻止切换 → **等待下一拍点窗口**

---

### 症状 3: 延迟过高 (视觉滞后音频)

**测量延迟**:

```javascript
// 端到端延迟估算 (控制台)
const measure = () => {
  const t0 = performance.now();
  const ctx = globalThis.__nw_verify.audioContext;
  const audioT = ctx.currentTime * 1000; // ms
  const frameT = globalThis.__nw_verify.audioFrame.timestamp ?? 0;
  const renderT = globalThis.__nw_verify.sceneManager.lastRenderMs ?? 0;
  console.log({
    audioLatency: t0 - audioT,
    frameAge: t0 - frameT,
    renderAge: t0 - renderT,
    totalEstimate: t0 - audioT + (t0 - frameT) + (t0 - renderT),
  });
};
measure();
```

**优化选项**:

```javascript
// 1. 降低 FFT size (牺牲频率分辨率)
globalThis.__nw_verify.audioConfig.fftSize = 1024; // 默认 2048

// 2. 提高 audio feed 频率
globalThis.__nw_verify.pmAudioCadence = "high"; // 33ms fg

// 3. 强制 120fps (如果硬件支持)
globalThis.__nw_verify.forceHighFps = true;
```

**警告**: 降低延迟会增加 CPU 负载，注意 p95 指标。

---

### 症状 4: 音频驱动过于敏感/迟钝

**调整响应性**:

```javascript
// 1. Accent attack/release
globalThis.__nw_verify.aivjConfig.accentAttackMs = 40; // 默认 60
globalThis.__nw_verify.aivjConfig.accentReleaseMs = 120; // 默认 150

// 2. Energy smoothing
globalThis.__nw_verify.audioControls.attackMs = 80; // 默认 100
globalThis.__nw_verify.audioControls.releaseMs = 500; // 默认 620

// 3. StageBands attack rate
globalThis.__nw_verify.stageBands.profile = "punchy"; // 快速响应
// (修改需重启 AudioBus)

// 4. Adaptive input gain
globalThis.__nw_verify.audioProcessor.adaptiveGainEnabled = false;
// (禁用自动增益，手动设置)
```

**测试验证**:

- 播放 test tone (kick 循环)
- 观察 Accent 脉冲波形
- 调整参数到理想响应曲线

---

## 📊 实时监控面板

### Console 监控命令

**1. 连续监控音频指标**:

```javascript
const monitor = setInterval(() => {
  const v = globalThis.__nw_verify;
  console.clear();
  console.table({
    AudioContext: v.audioContext.state,
    Energy: v.audioFrame.energy?.toFixed(3),
    BPM: v.audioFrame.features?.tempoBpm?.toFixed(1),
    Confidence: v.audioFrame.features?.beatConfidence?.toFixed(2),
    Phase: v.audioFrame.features?.beatPhase?.toFixed(3),
    Accent: v.aivj.accent01?.toFixed(3),
    PmFeedFg: `${v.projectLayer.audioFeedIntervalMs}ms`,
    PmFeedBg: `${v.projectLayerBg.audioFeedIntervalMs}ms`,
    P95: `${v.frameTimeP95?.toFixed(1)}ms`,
  });
}, 500);

// 停止监控
clearInterval(monitor);
```

**2. 音频延迟分析**:

```javascript
const latencyTest = () => {
  const samples = [];
  const interval = setInterval(() => {
    const now = performance.now();
    const ctx = globalThis.__nw_verify.audioContext;
    const audioT = ctx.currentTime * 1000;
    samples.push(now - audioT);

    if (samples.length >= 60) {
      clearInterval(interval);
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      const max = Math.max(...samples);
      const min = Math.min(...samples);
      console.log({
        avgLatency: avg.toFixed(1) + "ms",
        maxLatency: max.toFixed(1) + "ms",
        minLatency: min.toFixed(1) + "ms",
        jitter: (max - min).toFixed(1) + "ms",
      });
    }
  }, 16);
};
latencyTest();
```

**3. 帧时间直方图**:

```javascript
const frameTimeHist = () => {
  const v = globalThis.__nw_verify;
  const hist = v.frameTimeHistory ?? [];
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0]; // <8, 8-12, 12-16, 16-20, 20-25, 25-33, 33-50, >50
  hist.forEach((t) => {
    if (t < 8) buckets[0]++;
    else if (t < 12) buckets[1]++;
    else if (t < 16) buckets[2]++;
    else if (t < 20) buckets[3]++;
    else if (t < 25) buckets[4]++;
    else if (t < 33) buckets[5]++;
    else if (t < 50) buckets[6]++;
    else buckets[7]++;
  });
  console.table({
    "<8ms (120fps)": buckets[0],
    "8-12ms": buckets[1],
    "12-16ms (60fps)": buckets[2],
    "16-20ms": buckets[3],
    "20-25ms": buckets[4],
    "25-33ms (30fps)": buckets[5],
    "33-50ms": buckets[6],
    ">50ms (卡顿)": buckets[7],
  });
};
frameTimeHist();
```

---

## 🛠️ 常用修复操作

### 1. 重启音频管道

```javascript
// 完全重启 AudioBus
globalThis.__nw_verify.audioBus.dispose();
// (需要重新加载音频源)
```

### 2. 强制清空 Beat history

```javascript
globalThis.__nw_verify.beatTempo.reset();
// (用于节奏切换后重新收敛)
```

### 3. 重置 AIVJ 状态

```javascript
const now = performance.now();
globalThis.__nw_verify.aivj.reset(globalThis.__nw_verify.macroBank, now);
```

### 4. 强制 Preset 切换门控开启 (调试用)

```javascript
globalThis.__nw_verify.forcePresetGateOpen = true;
// ⚠️ 仅用于测试，可能导致相位错乱
```

### 5. 导出当前音频配置

```javascript
const exportConfig = () => {
  const v = globalThis.__nw_verify;
  return {
    audioContext: {
      state: v.audioContext.state,
      sampleRate: v.audioContext.sampleRate,
    },
    audioProcessor: {
      fftSize: v.audioConfig.fftSize,
      smoothingTimeConstant: v.audioConfig.smoothingTimeConstant,
      adaptiveGain: v.audioProcessor.adaptiveInputGain,
    },
    beatTempo: v.beatTempo.getConfig(),
    audioControls: v.audioControls.getConfig(),
    pmAudioFeed: {
      fg: v.projectLayer.audioFeedIntervalMs,
      bg: v.projectLayerBg.audioFeedIntervalMs,
      mode: v.pmAudioCadence,
    },
    gates: v.gates,
  };
};
console.log(JSON.stringify(exportConfig(), null, 2));
```

---

## 📈 性能基准参考

### 理想状态 (60fps @ 1080p)

| **指标**        | **目标值** | **警告阈值** | **临界值** |
| --------------- | ---------- | ------------ | ---------- |
| P95 帧时间      | <16ms      | 16-20ms      | >25ms      |
| 音频延迟        | <100ms     | 100-150ms    | >200ms     |
| Beat confidence | >0.7       | 0.5-0.7      | <0.5       |
| AudioFrame rate | 60fps      | 45-60fps     | <30fps     |
| Accent 响应     | <120ms     | 120-200ms    | >300ms     |

### 负载等级对应配置

| **等级** | **P95** | **音频分析 fps** | **PM feed (fg/bg)** |
| -------- | ------- | ---------------- | ------------------- |
| 轻负载   | <12ms   | 60fps            | 33ms / 42ms         |
| 中负载   | 12-20ms | 45fps            | 42ms / 50ms         |
| 重负载   | 20-33ms | 30fps            | 50ms / 67ms         |
| 超载     | >33ms   | 降级触发         | 降级触发            |

---

## 🎯 现场演出检查清单

### 演出前 (Soundcheck)

- [ ] 确认音频输入源 (loopback/mixer)
- [ ] 测试峰值电平 (避免削波)
- [ ] 校准 Adaptive Gain (1-2 分钟收敛)
- [ ] 验证 Beat detection (播放已知 BPM 音乐)
- [ ] 测试 Preset 切换同步性
- [ ] 记录基准 P95 (空闲场景)
- [ ] 预热预设库 (prefetch 常用 preset)

### 演出中 (Live)

- [ ] 监控 AudioContext 状态 (绿灯)
- [ ] 观察 Beat confidence 趋势
- [ ] 留意 P95 突刺 (preset 加载/GC)
- [ ] 准备 anchor preset (应急回退)
- [ ] 关注内存使用 (>1GB 触发手动 GC)

### 演出后 (Review)

- [ ] 导出控制平面日志 (`__nw_verify.controlPlaneLog`)
- [ ] 分析失败 preset (`brokenPresets`)
- [ ] 检查 GC 触发频率
- [ ] 优化 blacklist (移除误判)
- [ ] 备份 macro presets

---

## 🐛 已知问题与规避方法

### Issue 1: WebAudio autoplay policy

**现象**: AudioContext suspended 无法恢复
**规避**: 在用户 gesture 中调用 `audioBus.prewarmContext()`

### Issue 2: Loopback gain 过低

**现象**: Live input 能量始终 <0.1
**规避**: 手动设置 `inputGain.gain.value = 32.0`

### Issue 3: BPM 锁定在错误八度

**现象**: 检测到 80BPM 但实际 160BPM
**规避**: 调整 `minTempo/maxTempo` 范围限制倍频

### Issue 4: GC pause 导致卡顿

**现象**: 每隔 10s 出现 50ms+ 帧时间
**规避**: 使用 Object Pool (见 AUDIO_DRIVE_ANALYSIS.zh.md)

### Issue 5: Preset 切换导致 audio feed 中断

**现象**: 切换时短暂静音
**规避**: 已修复 (buffer reuse 机制)

---

**版本**: v1.0.0
**最后更新**: 2025-12-24
**维护**: AI Programming Assistant
