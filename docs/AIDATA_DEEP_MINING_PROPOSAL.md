# AI 炼丹数据深度挖掘提案

> 基于 32,000+ AI 生成预设的数据价值提炼方案

---

## 数据资产盘点

### 当前数据规模

| 数据类型 | 数量 | 可用性 | 价值等级 |
|----------|------|--------|----------|
| 完整预设文件 | 32,000+ | ✅ | ⭐⭐⭐ |
| 参数元数据 | 853 | ✅ | ⭐⭐⭐⭐ |
| 3D 耦合配对 | 8,000 对 | ✅ | ⭐⭐⭐⭐⭐ |
| 生成日志 | 未知 | ⚠️ | ⭐⭐ |
| 用户反馈 | 少量 | ⚠️ | ⭐⭐⭐⭐⭐ |

### 数据维度分析

每个预设包含的参数维度：
```
基础参数: fRating, fGammaAdj, fDecay
波形参数: nWaveMode, fWaveScale, fWaveAlpha, fWaveSmoothing
变形参数: warp, fWarpScale, fWarpAnimSpeed
运动参数: zoom, rot, dx, dy, cx, cy
颜色参数: wave_r, wave_g, wave_b
形状参数: shapecode_0/1/2/3 (enabled, sides, textured, ...)
合成参数: comp (gamma, brightness, contrast, ...)
```

**总计**: 约 50-100 个参数维度

---

## 深度挖掘方案

### 方案 1: 参数空间分析 (数据科学)

**目标**: 发现哪些参数组合产生高质量预设

**实施步骤**:

```python
# 1. 参数分布分析
import pandas as pd
import numpy as np

# 加载所有预设参数
df = pd.read_json('ai-metadata/metadata.json')

# 分析高质量预设的参数特征
high_quality = df[df['fRating'] >= 4.5]

# 参数相关性分析
correlation = df[['warp', 'decay', 'gamma', 'waveMode']].corr()

# 发现规律
print("高 warp 预设的 decay 分布:")
print(high_quality[high_quality['warp'] > 0.5]['decay'].describe())
```

**预期产出**:
- 参数相关性热力图
- 高质量预设的参数范围
- "黄金参数组合"识别

**应用场景**:
- 指导新的 AI 生成器参数调整
- 为用户推荐 "安全" 的参数范围
- 发现未知的视觉效果规律

---

### 方案 2: 预设 DNA 杂交 (生成对抗)

**目标**: 通过交叉两个优质预设生成新的预设

**算法**:

```typescript
// Preset DNA 杂交
function crossbreedPresets(parentA: Preset, parentB: Preset, ratio: number = 0.5): Preset {
  const child = { ...parentA };
  
  // 参数插值
  child.params.warp = lerp(parentA.params.warp, parentB.params.warp, ratio);
  child.params.decay = lerp(parentA.params.decay, parentB.params.decay, ratio);
  child.params.gamma = lerp(parentA.params.gamma, parentB.params.gamma, ratio);
  
  // 离散参数选择
  child.params.waveMode = Math.random() > 0.5 ? parentA.params.waveMode : parentB.params.waveMode;
  
  // 突变
  if (Math.random() < 0.1) {
    child.params.warp += (Math.random() - 0.5) * 0.1;
  }
  
  return child;
}
```

**创新点**:
- 不重新训练模型，直接利用现有优质预设
- 保留 "父母" 预设的优点
- 可控的变异率

**应用场景**:
- 用户选择两个喜欢的预设，生成 "孩子" 预设
- 自动探索参数空间
- 修复 "死亡" 预设（与稳定预设杂交）

---

### 方案 3: 音乐-参数映射 (智能适配)

**目标**: 根据音乐特征自动推荐/生成预设参数

**训练数据构建**:

```json
{
  "training_samples": [
    {
      "audio_features": {
        "bpm": 128,
        "energy": 0.8,
        "spectral_centroid": 3000,
        "onset_strength": 0.7
      },
      "preset_params": {
        "warp": 0.6,
        "decay": 0.3,
        "waveMode": 3
      },
      "user_rating": 5.0
    }
  ]
}
```

**模型设计**:

```python
# 简单的神经网络映射
import torch
import torch.nn as nn

class AudioToPresetModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(4, 32),   # 4 维音频特征
            nn.ReLU(),
            nn.Linear(32, 64),
            nn.ReLU(),
        )
        self.decoder = nn.Sequential(
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 5),   # 5 维预设参数
            nn.Sigmoid()        # 输出 0-1
        )
    
    def forward(self, audio_features):
        x = self.encoder(audio_features)
        return self.decoder(x)
```

**应用场景**:
- 实时根据音乐节拍调整 warp
- 能量高时自动切换到高动态预设
- 为任意歌曲 "匹配" 最佳预设

---

### 方案 4: 风格向量空间 (降维可视化)

**目标**: 将 50 维参数空间降维到 2D/3D，可视化风格分布

**技术方案**:

```python
from sklearn.manifold import TSNE
import matplotlib.pyplot as plt

# 提取参数向量
params = df['params'].apply(lambda x: [
    x['warp'], x['decay'], x['gamma'], 
    x['waveMode'] / 10, x['waveScale']
]).tolist()

# t-SNE 降维
tsne = TSNE(n_components=2, random_state=42)
embeddings_2d = tsne.fit_transform(params)

# 可视化
plt.scatter(embeddings_2d[:, 0], embeddings_2d[:, 1], 
           c=df['fRating'], cmap='viridis')
plt.colorbar(label='fRating')
plt.title('Preset Style Space')
plt.show()
```

**预期产出**:
- 风格地图（Style Map）
- 识别风格 "孤岛" 和 "桥梁"
- 发现缺失的风格区域

**应用场景**:
- 用户在 2D 地图上探索预设
- 识别 "风格空白区" 指导生成
- 推荐 "风格邻近" 的预设

---

### 方案 5: 预设修复工厂 (质量提升)

**目标**: 自动修复低质量/崩溃的预设

**修复策略**:

```typescript
class PresetDoctor {
  // 诊断问题
  diagnose(preset: Preset): string[] {
    const issues = [];
    
    // 检查致命参数
    if (preset.params.warp > 10) issues.push('warp_too_high');
    if (preset.params.decay > 1) issues.push('decay_invalid');
    if (preset.params.fWaveScale > 100) issues.push('wave_unstable');
    
    // 检查缺失参数
    if (!preset.params.hasOwnProperty('gamma')) issues.push('missing_gamma');
    
    return issues;
  }
  
  // 修复问题
  repair(preset: Preset): Preset {
    const fixed = { ...preset };
    
    // 限制参数范围
    fixed.params.warp = Math.min(fixed.params.warp, 5);
    fixed.params.decay = Math.min(Math.max(fixed.params.decay, 0), 1);
    
    // 填充默认值
    if (!fixed.params.gamma) fixed.params.gamma = 1.0;
    
    return fixed;
  }
  
  // 增强预设
  enhance(preset: Preset): Preset {
    // 基于高质量预设统计，优化参数
    const enhanced = { ...preset };
    
    // 如果 decay 过低（画面残留太短），适度增加
    if (enhanced.params.decay < 0.3) {
      enhanced.params.decay += 0.1;
    }
    
    return enhanced;
  }
}
```

**应用场景**:
- 批量修复 130k MegaPack 中的问题预设
- 用户上传预设时自动修复
- 从 "死亡" 预设中抢救可用参数

---

### 方案 6: 生成模型微调 (迁移学习)

**目标**: 用现有高质量预设微调新的生成模型

**数据准备**:

```python
# 构建训练数据集
high_quality_presets = load_presets(fRating_threshold=4.5)

# 提取特征向量
X = []
for preset in high_quality_presets:
    features = [
        preset['warp'],
        preset['decay'],
        preset['gamma'],
        preset['waveMode'] / 10,
        preset['waveScale'],
        # ... 更多参数
    ]
    X.append(features)

X = np.array(X)
```

**模型训练**:

```python
# 使用 VAE 学习预设分布
from sklearn.decomposition import PCA
from sklearn.mixture import GaussianMixture

# 降维
pca = PCA(n_components=10)
X_reduced = pca.fit_transform(X)

# 学习分布
gmm = GaussianMixture(n_components=20)
gmm.fit(X_reduced)

# 生成新预设
new_samples = gmm.sample(100)[0]
new_presets = pca.inverse_transform(new_samples)
```

**应用场景**:
- 生成 "类 AI" 风格的新预设
- 填补风格空白区域
- 创建平滑的风格过渡

---

### 方案 7: 相似预设聚类 (自动分类)

**目标**: 自动将 32k 预设聚类成风格群组

**算法**:

```python
from sklearn.cluster import HDBSCAN

# 参数标准化
from sklearn.preprocessing import StandardScaler
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# 聚类
clusterer = HDBSCAN(min_cluster_size=10, min_samples=5)
clusters = clusterer.fit_predict(X_scaled)

# 分析每个聚类
df['cluster'] = clusters
for cluster_id in set(clusters):
    if cluster_id == -1: continue  # 噪声点
    
    cluster_presets = df[df['cluster'] == cluster_id]
    print(f"Cluster {cluster_id}: {len(cluster_presets)} presets")
    print(f"  Average warp: {cluster_presets['warp'].mean():.2f}")
    print(f"  Average decay: {cluster_presets['decay'].mean():.2f}")
```

**预期产出**:
- 自动发现 "风格流派"
- 每个聚类的代表预设
- 聚类间的过渡预设

**应用场景**:
- 自动标签生成
- 按风格浏览预设
- 发现 "风格边缘" 的创新预设

---

## 实施路线图

### 第一阶段：数据分析 (1 周)

**优先级**: ⭐⭐⭐⭐⭐

1. **参数分布统计**
   - 生成参数分布直方图
   - 计算相关性矩阵
   - 识别异常值

2. **质量预测模型**
   - 训练简单模型预测 fRating
   - 识别最重要的质量因素
   - 生成 "质量报告"

**产出**: 数据分析报告 + 可视化图表

---

### 第二阶段：杂交生成 (1 周)

**优先级**: ⭐⭐⭐⭐

1. **实现杂交算法**
   - 参数插值函数
   - 离散参数处理
   - 变异机制

2. **用户界面**
   - "父母预设" 选择器
   - 杂交比例滑块
   - 预览功能

**产出**: Preset Crossbreeding 工具

---

### 第三阶段：音乐适配 (2 周)

**优先级**: ⭐⭐⭐⭐⭐

1. **数据收集**
   - 录制音乐-预设配对数据
   - 用户评分收集

2. **模型训练**
   - 训练 Audio→Preset 映射模型
   - 验证效果

3. **实时适配**
   - 集成到音频分析管线
   - 实时参数调整

**产出**: 音乐自适应预设系统

---

### 第四阶段：聚类发现 (1 周)

**优先级**: ⭐⭐⭐

1. **聚类分析**
   - 运行 HDBSCAN
   - 可视化聚类结果
   - 标记聚类特征

2. **自动分类**
   - 为未分类预设分配标签
   - 构建风格树

**产出**: 自动分类系统 + 风格地图

---

## 预期收益

### 短期收益 (1 个月)

1. **质量提升**: 识别并修复低质量预设
2. **用户体验**: 音乐自适应预设切换
3. **生成效率**: 杂交算法快速生成新预设

### 中期收益 (3 个月)

1. **数据资产**: 完整的参数空间地图
2. **智能推荐**: 基于音乐特征的精准推荐
3. **自动化**: 减少人工筛选工作量 80%

### 长期收益 (6 个月)

1. **生成模型**: 训练专属的新预设生成模型
2. **风格创新**: 发现全新的视觉效果风格
3. **行业标准**: 成为 MilkDrop 预设生成的最佳实践

---

## 实施建议

### 立即可开始

1. **数据分析**: 用 Python + Pandas 分析现有 853 个预设
2. **杂交实验**: 实现简单的参数插值，测试效果
3. **修复工具**: 批量检查和修复参数范围

### 需要资源

1. **音乐适配**: 需要大量音乐-预设配对数据
2. **聚类分析**: 需要处理全部 32k 预设的计算资源
3. **模型训练**: 可能需要 GPU 训练生成模型

### 风险控制

1. **备份数据**: 所有操作前备份原始预设
2. **A/B 测试**: 新功能先在小范围测试
3. **用户反馈**: 每个功能都要有反馈收集机制

---

## 总结

你的 AI 炼丹数据是一座**金矿**，目前的利用只是冰山一角。

### 最有价值的 3 个方向

1. **音乐-参数映射** (立即价值)
   - 让预设随音乐 "呼吸"
   - 实时适配不同风格

2. **预设杂交** (用户价值)
   - 用户创造独特预设
   - 社交分享 "亲子" 关系

3. **参数空间分析** (长期价值)
   - 发现未知的视觉规律
   - 指导 AI 生成器改进

### 下一步行动

1. 运行参数分布分析 (今天)
2. 实现简单杂交工具 (本周)
3. 收集音乐-预设配对数据 (本周开始)

**建议**: 先从数据分析开始，成本低、见效快，能为后续方案提供基础。
