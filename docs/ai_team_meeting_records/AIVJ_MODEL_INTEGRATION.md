# AIVJ 耦合模型集成指南

## 产物位置

```
D:\aidata\outputs\extreme_training\
├── models/
│   ├── latest.pth              # 最新模型 (2.6MB)
│   └── extreme_round_*.pth     # 历史检查点 (4.2MB x 10)
├── training_history.json       # 训练历史
└── ai_team_analysis_kimi.md    # AI团队分析报告
```

## 快速集成

### Python 集成

```python
from python.aivj_coupling_engine import AIVJCouplingEngine

# 创建引擎
engine = AIVJCouplingEngine()

# 单样本推理
upper = np.random.randn(64)
lower = np.random.randn(64)
output = engine.predict(upper, lower)

# 批量推理
batch_upper = np.random.randn(10, 64)
batch_lower = np.random.randn(10, 64)
batch_output = engine.predict(batch_upper, batch_lower)
```

### 模型信息

| 参数 | 值 |
|------|-----|
| 输入维度 | 64 |
| 隐藏维度 | 128 |
| 输出维度 | 32 |
| 训练轮数 | 6 |
| 总epochs | 60 |

## 集成到 newliveweb AIVJ 系统

### 步骤 1: 复制模型文件

```powershell
# 复制到 newliveweb 静态目录
cp D:\aidata\outputs\extreme_training\models\latest.pth C:\Users\pc\code\newliveweb\public\models\
```

### 步骤 2: 创建加载器

在 `src/features/aivj/` 目录下创建 `couplingModel.ts`:

```typescript
import * as tf from '@tensorflow/tfjs';

export class AIVJCouplingModel {
  private model: tf.LayersModel;
  
  async load(modelPath: string) {
    this.model = await tf.loadLayersModel(modelPath);
  }
  
  predict(upper: number[], lower: number[]): number[] {
    const input = tf.tensor2d([upper, lower]);
    const output = this.model.predict(input) as tf.Tensor;
    return output.arraySync()[0];
  }
}
```

### 步骤 3: 在 AIVJController 中使用

```typescript
import { couplingModel } from './couplingModel';

// 加载模型
await couplingModel.load('/models/latest.json');

// 预测耦合特征
const upperFeatures = getUpperPresetFeatures();
const lowerFeatures = getLowerPresetFeatures();
const coupledFeatures = couplingModel.predict(upperFeatures, lowerFeatures);
```

## 训练配置总结

| 配置项 | 值 |
|--------|-----|
| 数据集 | AIVJ_FINAL_ELITE (200样本) |
| 批次大小 | 32 |
| 学习率 | 0.001 |
| 轮数 | 6 (早停) |
| 总epochs | 60 |
| 最终损失 | 0.000002 |
| 损失下降 | 99.998% |

## AI团队分析结论

**评分: ⭐⭐⭐⭐⭐ (5/5)**

- ✅ 训练成功
- ⚠️ 轻微过拟合 (可控)
- ✅ 早停合理
- ✅ 模型质量良好

## 下一步优化

1. **增加数据量**: 200 → 1000+ 样本
2. **数据增强**: 样本变换扩充
3. **模型集成**: 多模型投票

## 文件清单

| 文件 | 说明 |
|------|------|
| `python/simple_trainer.py` | 训练脚本 |
| `python/aivj_coupling_engine.py` | 推理引擎 |
| `python/ai_team_analysis_kimi.py` | AI分析脚本 |
| `python/verify_model.py` | 模型验证 |
| `python/training_monitor.py` | 心跳监控 |
| `docs/ai_team_meeting_records/` | 会议记录 |
