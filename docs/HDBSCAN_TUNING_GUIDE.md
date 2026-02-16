# HDBSCAN 参数调优指南 (130k 规模)

**目标**: 在 130k 预设上找到最佳的 HDBSCAN 聚类参数  
**挑战**: 数据量大、风格多样、长尾分布

---

## 一、参数说明

### 核心参数

| 参数 | 说明 | 推荐范围 | 影响 |
|------|------|----------|------|
| `min_cluster_size` | 最小簇大小 | 10~500 | 决定簇的数量和大小 |
| `min_samples` | 核心点最小邻居数 | 1~100 | 影响噪声点比例 |
| `metric` | 距离度量 | cosine/euclidean | 影响相似度计算 |
| `cluster_selection_method` | 簇选择方法 | eom/leaf | eom 更保守，leaf 更多簇 |
| `cluster_selection_epsilon` | 簇选择阈值 | 0.0~0.5 | 合并小簇 |

### 参数详解

#### min_cluster_size (最重要)

```python
# 过小 -> 簇太多，噪声太少
min_cluster_size=5   # 可能产生 1000+ 簇

# 适中 -> 平衡
min_cluster_size=50  # 可能产生 100-300 簇

# 过大 -> 簇太少，大量噪声
min_cluster_size=500 # 可能产生 <50 簇
```

**推荐策略**:
- 10k 预设: 10~30
- 50k 预设: 30~100
- 130k 预设: 50~200

#### min_samples

```python
# 较小 -> 更多点被分类，更少噪声
min_samples=1

# 适中 -> 平衡
min_samples=10

# 较大 -> 更严格的噪声过滤
min_samples=50  # 只有密集区域的点才形成簇
```

**经验法则**: `min_samples = min_cluster_size / 5`

#### metric

```python
# 余弦相似度 - 推荐（embedding 已归一化）
metric="cosine"

# 欧氏距离
metric="euclidean"
```

**为什么 cosine?**
- CLIP embedding 已经归一化
- Cosine 对向量长度不敏感
- 更适合语义相似度

#### cluster_selection_method

```python
# EOM (Excess of Mass) - 默认，更保守
eom -> 更少的簇，更稳定的簇

# Leaf - 更多簇，更细粒度
leaf -> 更多的簇，可能包含小簇
```

---

## 二、调优策略

### 两阶段调优

```bash
# Stage 1: 快速粗调优（10k 采样）
python scripts/aivj/hdbscan_tuning_130k.py \
  --embeddings artifacts/aivj/run3-crashsafe/embeddings.npy \
  --ids artifacts/aivj/run3-crashsafe/ids.txt \
  --samples 10000 \
  --output tuning_report_stage1.json

# Stage 2: 精细调优（基于 Stage 1 结果，50k 采样）
python scripts/aivj/hdbscan_tuning_130k.py \
  --embeddings artifacts/aivj/run3-crashsafe/embeddings.npy \
  --ids artifacts/aivj/run3-crashsafe/ids.txt \
  --samples 50000 \
  --output tuning_report_stage2.json

# Stage 3: 最终验证（全量 130k）
python scripts/aivj/cluster_embeddings_advanced.py \
  --embeddings artifacts/aivj/run3-crashsafe/embeddings.npy \
  --ids artifacts/aivj/run3-crashsafe/ids.txt \
  --algorithm hdbscan \
  # 使用 Stage 2 推荐参数
```

### 手动调优流程

```python
import hdbscan
import numpy as np

# 1. 加载数据
embeddings = np.load("embeddings.npy")
embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

# 2. 测试不同参数
for min_cluster_size in [30, 50, 100]:
    for min_samples in [5, 10, 20]:
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples,
            metric="cosine"
        )
        labels = clusterer.fit_predict(embeddings)
        
        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        n_noise = np.sum(labels == -1)
        noise_ratio = n_noise / len(labels)
        
        print(f"MCS={min_cluster_size}, MS={min_samples}: "
              f"{n_clusters} clusters, {noise_ratio:.1%} noise")
```

---

## 三、评估指标

### 理想聚类特征

| 指标 | 理想范围 | 说明 |
|------|----------|------|
| 聚类数量 | 100~500 | 足够细分但不碎片化 |
| 噪声比例 | 5%~30% | 过滤异常值但不过度 |
| 簇大小 CV | <1.0 | 簇大小相对均匀 |
| DBCV 分数 | >0.5 | 聚类结构清晰 |
| 运行时间 | <5min | 可接受的计算成本 |

### 可视化检查

```python
import umap
import matplotlib.pyplot as plt

# 降维可视化
reducer = umap.UMAP(n_components=2, random_state=42)
emb_2d = reducer.fit_transform(embeddings)

# 绘制聚类结果
plt.figure(figsize=(12, 8))
scatter = plt.scatter(emb_2d[:, 0], emb_2d[:, 1], 
                      c=labels, cmap='tab20', s=1, alpha=0.5)
plt.colorbar(scatter)
plt.title(f'HDBSCAN Clustering: {n_clusters} clusters')
plt.savefig('clustering_viz.png', dpi=150)
```

---

## 四、常见问题

### 问题 1: 簇太少 (<50)

**症状**: 所有预设被分到少数几个大类  
**解决**: 减小 `min_cluster_size`

```python
# 从
min_cluster_size=200
# 改为
min_cluster_size=50
```

### 问题 2: 簇太多 (>1000)

**症状**: 过度碎片化  
**解决**: 增大 `min_cluster_size`

```python
# 从
min_cluster_size=10
# 改为
min_cluster_size=100
```

### 问题 3: 噪声点过多 (>50%)

**症状**: 大量预设被标记为噪声  
**解决**: 减小 `min_samples` 或增大 `min_cluster_size`

```python
# 方案 1: 减小 min_samples
min_samples=5  # 原来是 20

# 方案 2: 增大 min_cluster_size
min_cluster_size=100  # 原来是 30
```

### 问题 4: 运行时间过长

**症状**: 超过 10 分钟  
**解决**: 

```python
# 1. 采样
embeddings_sample = embeddings[np.random.choice(len(embeddings), 50000)]

# 2. 使用更快的近似算法
clusterer = hdbscan.HDBSCAN(
    algorithm='boruvka_kdtree',  # 或 'prims_kdtree'
    core_dist_n_jobs=4  # 多线程
)
```

### 问题 5: 内存不足

**症状**: OOM 错误  
**解决**:

```python
# 1. 分批处理
batch_size = 10000

# 2. 使用内存映射
embeddings = np.load("embeddings.npy", mmap_mode='r')
```

---

## 五、130k 规模推荐参数

### 快速模式（开发/测试）

```python
# 时间: ~30s
# 质量: 中等
hdbscan.HDBSCAN(
    min_cluster_size=30,
    min_samples=5,
    metric="cosine",
    cluster_selection_method="eom"
)
```

### 平衡模式（推荐）

```python
# 时间: ~3min
# 质量: 高
hdbscan.HDBSCAN(
    min_cluster_size=50,
    min_samples=10,
    metric="cosine",
    cluster_selection_method="eom"
)
```

### 高质量模式（生产）

```python
# 时间: ~10min
# 质量: 最高
hdbscan.HDBSCAN(
    min_cluster_size=100,
    min_samples=20,
    metric="cosine",
    cluster_selection_method="eom"
)
```

---

## 六、与 K-Means 对比

| 特性 | K-Means | HDBSCAN |
|------|---------|---------|
| 簇数量 | 需预设 | 自动确定 |
| 噪声处理 | 无 | 自动识别噪声 |
| 形状 | 球形假设 | 任意形状 |
| 速度 | 快 | 慢 |
| 内存 | 少 | 多 |
| 可解释性 | 高 | 中 |

**选择建议**:
- 数据干净、分布均匀 → K-Means
- 数据复杂、有噪声、长尾分布 → HDBSCAN

---

## 七、实际案例

### run3-crashsafe-2000 (2k 预设)

```python
# 最佳参数
min_cluster_size=10
min_samples=5

# 结果
n_clusters=156
noise_ratio=12%
runtime=2.3s
```

### run3-crashsafe-15000 (15k 预设)

```python
# 最佳参数
min_cluster_size=30
min_samples=5

# 结果
n_clusters=203
noise_ratio=15%
runtime=18s
```

### run3-fullsafe-130k (130k 预设)

```python
# 推荐参数（待验证）
min_cluster_size=50
min_samples=10

# 预期结果
n_clusters=250~400
noise_ratio=15~25%
runtime=3~5min
```

---

## 八、工具使用

### 调优脚本

```bash
# 基础用法
python scripts/aivj/hdbscan_tuning_130k.py \
  --embeddings embeddings.npy \
  --ids ids.txt

# 完整参数
python scripts/aivj/hdbscan_tuning_130k.py \
  --embeddings artifacts/aivj/run3-crashsafe/embeddings.npy \
  --ids artifacts/aivj/run3-crashsafe/ids.txt \
  --samples 10000 \
  --jobs 4 \
  --output tuning_report.json
```

### 输出解读

```json
{
  "best_config": {
    "min_cluster_size": 50,
    "min_samples": 10,
    "metric": "cosine",
    "cluster_selection_method": "eom"
  },
  "best_result": {
    "n_clusters": 287,
    "n_noise": 2340,
    "noise_ratio": 0.234,
    "runtime_sec": 125.4
  }
}
```

---

## 九、总结

### 调优检查清单

- [ ] 数据已归一化
- [ ] 采样测试（10k~50k）
- [ ] 两阶段搜索（粗搜+细搜）
- [ ] 验证簇数量（100~500）
- [ ] 验证噪声比例（5%~30%）
- [ ] 可视化检查
- [ ] 全量数据验证

### 关键经验

1. **min_cluster_size 最重要** - 先调这个
2. **min_samples 辅助** - 控制噪声
3. **cosine 度量** - 适合 CLIP embedding
4. **EOM 方法** - 更稳定的簇
5. **采样调优** - 节省时间

---

*最后更新: 2026-01-30*
