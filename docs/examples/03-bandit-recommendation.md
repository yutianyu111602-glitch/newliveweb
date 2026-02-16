# 示例 3: Bandit 推荐系统

使用 Thompson Sampling 学习用户偏好

## 初始化

```typescript
import { getBanditRecommender } from 'newliveweb/features/presets';

const bandit = getBanditRecommender();

// 添加可用预设簇
const clusters = ['calm-ambient', 'techno-peak', 'psychedelic'];
clusters.forEach(c => bandit.addArm(c));
```

## 获取推荐

```typescript
// 根据当前音频上下文推荐
const rec = bandit.recommend(clusters, {
  sceneLabel: 'peak',
  audioFeatures: { energy: 0.9, brightness: 0.8 }
});

console.log(rec);
// {
//   armId: 'techno-peak',
//   score: 0.85,
//   confidence: 0.72,
//   exploration: true
// }
```

## 记录反馈

```typescript
// 用户行为
bandit.recordFeedback({
  armId: 'techno-peak',
  action: 'favorite',  // 或 'skip', 'hold', 'complete'
  durationMs: 15000,
  timestamp: Date.now()
});
```

## 学习效果

推荐质量会随着反馈积累而提升：

```typescript
// 初始：随机探索
// 10 次反馈后开始收敛
// 50 次反馈后高度个性化

// 检查臂的统计
const arm = bandit.getArm('techno-peak');
console.log(arm.pulls, arm.rewardMean);
```

## 持久化

```typescript
// 保存模型
const state = bandit.serialize();
localStorage.setItem('bandit-model', state);

// 恢复模型
const saved = localStorage.getItem('bandit-model');
bandit.deserialize(saved);
```
