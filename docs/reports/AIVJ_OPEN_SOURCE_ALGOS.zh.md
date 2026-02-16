# AIVJ 可用开源算法/库清单（按“对项目收益”排序）

**更新**: 2025-12-30  
**适用范围**: 预设渲染 → embedding → 聚类/检索 → 运行时选预设（带音频驱动）

> 这是一份“工具箱菜单”，不是强制全上。建议先把 15k/130k 跑稳，再按痛点逐个引入。

---

## 0) 立刻省时间的三件套（强烈推荐）

### 0.1 近重复/坏图过滤（避免“又回到绿 M”）

- `imagehash`（pHash/dHash/wHash）  
  Repo: https://github.com/JohannesBuchner/imagehash  
  用途：快速发现“大片重复帧/同一初始化态”回归；适合做 gate。

- `imagededup`（hash + embedding 去重工具箱）  
  Repo: https://github.com/idealo/imagededup  
  用途：更工程化的 near-duplicate pipeline（可接目录批处理）。

- `LPIPS`（感知距离，更接近“风格相似度”）  
  Repo: https://github.com/richzhang/PerceptualSimilarity  
  用途：过滤“看起来几乎一样”的样本；也可做 QA/抽样多样性。

### 0.2 向量检索（runtime 选预设加速 + 可做去重）

- FAISS（ANN / 聚类 / 相似检索）  
  Repo: https://github.com/facebookresearch/faiss  
  用途：用 embedding 做“相似 preset 检索/反向检索”，以及快速 dedup。

- hnswlib（HNSW ANN，轻量易用）  
  Repo: https://github.com/nmslib/hnswlib  
  用途：纯 CPU 也很快，部署简单；适合 runtime 本地索引。

- Annoy（树结构 ANN，超省心）  
  Repo: https://github.com/spotify/annoy  
  用途：最简单的近似检索 baseline，易集成。

### 0.3 聚类升级（k-means 之外最值）

- UMAP（降维/可视化/为 HDBSCAN 做预处理）  
  Repo: https://github.com/lmcinnes/umap  
  用途：让“风格空间”更可视化，帮助选 k/选策略。

- HDBSCAN（密度聚类，自动长尾）  
  Repo: https://github.com/scikit-learn-contrib/hdbscan  
  用途：对簇形状不规则、长尾风格更友好（比固定 k 更“crate”）。

---

## 1) 视觉 embedding（你现在用的 + 可升级）

### 1.1 CLIP 系（强 baseline）

- OpenCLIP（你当前 pipeline 使用的核心）  
  Repo: https://github.com/mlfoundations/open_clip  
  用途：可直接替换不同模型/权重（`ViT-B/32` → `ViT-L/14` 等）。

- SigLIP（更强的对比学习系视觉表示，很多权重已被 OpenCLIP 生态支持）  
  参考：OpenCLIP / timm 生态  
  用途：更强的语义/风格分离，可能让聚类更“像人分组”。

### 1.2 自监督视觉表征（更偏“风格/纹理/结构”）

- DINOv2  
  Repo: https://github.com/facebookresearch/dinov2  
  用途：对纹理/结构敏感，适合“风格簇”。

### 1.3 视频/多帧表征（当 3 帧仍不够像）

（你目前是对多帧做 mean pooling；如果还想更强，可考虑 video encoder）

- VideoMAE  
  Repo: https://github.com/MCG-NJU/VideoMAE

- TimeSformer  
  Repo: https://github.com/facebookresearch/TimeSformer

用途：把“运动模式”也当作风格维度；代价是算力与工程复杂度上升。

---

## 2) 聚类与“clusterId 稳定”（扩规模必做）

### 2.1 工程稳：MiniBatchKMeans / KMeans++

- scikit-learn（KMeans / MiniBatchKMeans / PCA / 指标）  
  Repo: https://github.com/scikit-learn/scikit-learn  
  用途：大规模基础设施；你当前聚类脚本已在用 MiniBatchKMeans。

### 2.2 让 clusterId 在 2k→15k→130k 尽量不漂

- Hungarian 匹配（新旧簇对齐）  
  SciPy: https://github.com/scipy/scipy  
  API：`scipy.optimize.linear_sum_assignment`  
  用途：根据 centroid cosine 做最优匹配，把“簇编号”稳定下来。

实践建议：
- 先保存上一轮 centroids；
- 新一轮聚类后，用 Hungarian 对齐并写一个 `clusterIdMap`（版本化）。

---

## 3) 音频侧（让选预设更像 DJ）

### 3.1 基础特征（低成本高收益）

- librosa  
  Repo: https://github.com/librosa/librosa  
  用途：RMS/谱质心/节拍/onset/tempo，做 energy 桶（calm/groove/peak）。

- Essentia  
  Repo: https://github.com/MTG/essentia  
  用途：更完整的音乐特征库（你项目里已有 essentia.js 路线）。

- aubio  
  Repo: https://github.com/aubio/aubio  
  用途：onset/beat detection，实时性很好。

- madmom（beat/onset 很强，偏研究）  
  Repo: https://github.com/CPJKU/madmom

### 3.2 音频 embedding（用于“音频→风格分布”学习）

- LAION-CLAP（音频/文本对齐，很多场景拿来即用）  
  Repo: https://github.com/LAION-AI/CLAP

- OpenL3（经典强 baseline）  
  Repo: https://github.com/marl/openl3

- musicnn（音乐 tagging 表征）  
  Repo: https://github.com/jordipons/musicnn

用途：
- 做 `audio embedding → cluster logits` 的回归/分类；
- 或做 `audio embedding → visual embedding` 的跨模态检索（更高级）。

---

## 4) 在线自学习 / 推荐（现场越用越懂你）

- Vowpal Wabbit（工业级 contextual bandit）  
  Repo: https://github.com/VowpalWabbit/vowpal_wabbit

- River（在线学习工具箱）  
  Repo: https://github.com/online-ml/river

- contextualbandits（Python 轻量 bandit）  
  Repo: https://github.com/david-cortes/contextualbandits

用途：
- 以“观众/你自己”的反馈（跳过/停留/回放）作为 reward；
- 在线调整 cluster 的采样概率（Thompson/LinUCB/EXP3）。

---

## 5) 质量评估（可选，但对 130k 很香）

- scikit-image（SSIM/MS-SSIM 等）  
  Repo: https://github.com/scikit-image/scikit-image

- PIQ（PyTorch Image Quality）  
  Repo: https://github.com/photosynthesis-team/piq  
  用途：做 IQA/多样性辅助指标（别当硬门禁，容易误杀）。

- LAION aesthetic predictor（CLIP embedding + 小 MLP）  
  参考：LAION 相关实现（多版本）  
  用途：过滤“丑/糊/过曝/纯噪声”一类样本，提高聚类可解释性。

---

## 6) 采样与 QA（让你像在分 crate）

（当你有 130k 时，“怎么挑代表作/怎么挑 QA 样本”会变成核心问题）

- farthest-point sampling（最大化多样性）
- MMR（最大边际相关，兼顾代表性与多样性）
- DPP（确定性点过程，多样性抽样）

实现可以先用 numpy/FAISS 的距离计算做 baseline，再考虑更复杂的算法。

---

## 7) 最小集成顺序（建议）

1) 130k 分批跑稳 + 门禁（重复帧/failed/luma/motion）
2) FAISS/HNSW 做检索（顺带做 dedup）
3) Hungarian/centroid init 做 clusterId 稳定
4) 音频侧：librosa/essentia 做 energy 桶
5) 再考虑：CLAP/OpenL3 + 回归到 cluster 分布（进入“越用越懂你”阶段）
