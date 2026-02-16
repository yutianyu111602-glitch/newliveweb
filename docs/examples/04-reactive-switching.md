# 示例 4: 反应式预设切换

根据音频特征自动切换预设

## 基础配置

```typescript
import { getReactivePresetSwitcher } from 'newliveweb/features/presets';

const switcher = getReactivePresetSwitcher();

// 设置候选预设
switcher.setCandidatePresets([
  'pack1/calm.milk',
  'pack2/energy.milk',
  'pack3/beat.milk'
]);

// 监听切换事件
switcher.onSwitch((event) => {
  console.log(`Switch: ${event.previousPresetId} -> ${event.nextPresetId}`);
  console.log(`Reason: ${event.type}, Confidence: ${event.confidence}`);
  
  // 加载新预设
  loadPreset(event.nextPresetId);
});
```

## 配置触发条件

```typescript
const switcher = new ReactivePresetSwitcher({
  energySpikeThreshold: 0.3,    // 能量突增 30%
  beatDropThreshold: 0.8,       // 节拍强度
  sceneChangeThreshold: 0.5,    // 场景变化
  minSwitchIntervalMs: 5000,    // 5秒冷却
  smoothAlpha: 0.3              // 平滑因子
});
```

## 音频帧处理

```typescript
audioBus.onFrame((frame) => {
  // 传递音频特征到切换器
  switcher.onAudioFrame(frame);
});
```

## 触发类型

| 类型 | 描述 |
|------|------|
| `energy_spike` | 能量突然增加 |
| `beat_drop` | 节拍落下 |
| `scene_change` | 场景/风格变化 |
| `manual` | 手动触发 |

## 状态检查

```typescript
const state = switcher.getState();
console.log(state.energyState);      // 'stable' | 'rising' | 'spike' | ...
console.log(state.smoothedEnergy);   // 0.75
console.log(state.lastSwitchTime);   // timestamp
```

## 与 Bandit 结合

```typescript
// 自动切换时优先选择 Bandit 推荐的预设
switcher.onSwitch((event) => {
  if (event.type === 'energy_spike') {
    const rec = bandit.recommend(availableClusters, audioContext);
    // 将 Bandit 推荐映射到具体预设
    const presetId = clusterToPresetMap[rec.armId];
    loadPreset(presetId);
  }
});
```
