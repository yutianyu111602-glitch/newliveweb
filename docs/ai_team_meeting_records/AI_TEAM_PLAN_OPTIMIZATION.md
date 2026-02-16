# newliveweb 优化计划 - 双层 ProjectM 3D 时空耦合算法

## 文档信息
- **版本**: v2.0
- **更新日期**: 2026-02-02
- **状态**: 进行中
- **负责人**: AI 团队（DeepSeek/Qwen/GLM/Kimi）

## 执行摘要
基于 AI 团队第二轮讨论结果，本计划聚焦**优化双层 ProjectM 3D 时空耦合算法**，并设计**全自动训练流水线**和**长时间智能自训练程序**。

## 背景数据资源

### 已就绪数据
| 数据集 | 规模 | 质量 | 用途 |
|--------|------|------|------|
| AIVJ_FINAL_ELITE | 500+ 对 | 精英（score=5.0） | 黄金标准、验证集 |
| aivj_coupled_refinery_v2 | 104,040 对 | 精炼（已评分） | 主流训练集 |
| deep_alchemy_10h | 2,001 对 | quality=0.8 | 辅助训练 |
| coupling_net_best.pth | 4.6MB | 预训练模型 | 初始化权重 |

### 数据存储位置
- **本地训练数据**: `D:\aidata\`
- **项目目录**: `C:\Users\pc\code\newliveweb\`
- **训练脚本**: `C:\Users\pc\code\newliveweb\python\`
- **输出模型**: `C:\Users\pc\code\newliveweb\outputs\`

---

## 第一阶段：算法架构优化（Week 1-2）

### 任务 1.1：自适应时空权重学习
**负责人**: DeepSeek

**验收标准**:
- [ ] 实现权重预测网络（输入：精英对特征，输出：\(w_s, w_t\)）
- [ ] 损失函数收敛，验证集准确率 > 85%
- [ ] 在 500 精英数据上通过率 100%
- [ ] 文档：`docs/ai_team_meeting_records/adaptive_weight_network.md`

**技术细节**:
```python
# 伪代码
L = sum((rank_i - sigmoid(w_s * S_i + w_t * T_i + b))^2)
optimizer.zero_grad()
L.backward()
optimizer.step()
```

---

### 任务 1.2：残差注意力机制实现
**负责人**: DeepSeek

**验收标准**:
- [ ] 实现 Attention(Q, K, V) 模块
- [ ] 集成到双层 ProjectM 耦合网络
- [ ] 端到端训练验证，损失下降 15%+
- [ ] 内存占用 < 2GB（Web 环境约束）

**技术细节**:
```python
# 伪代码
Attn(Q, K, V) = Softmax(QK^T / sqrt(d_k)) * V + Residual(Q)
```

---

### 任务 1.3：分数分布重加权损失
**负责人**: DeepSeek

**验收标准**:
- [ ] 实现 α_i 权重计算公式
- [ ] 可调温度参数 β（建议范围 0.5-2.0）
- [ ] 高分样本（score > 4.0）梯度贡献提升 3x+
- [ ] 消融实验报告

---

## 第二阶段：数据流水线优化（Week 2-3）

### 任务 2.1：Parquet 列式存储转换
**负责人**: Qwen

**验收标准**:
- [ ] 编写转换脚本：`python/scripts/convert_to_parquet.py`
- [ ] 按 `score_bin`, `rank_quartile` 分区
- [ ] Snappy 压缩 + dictionary encoding
- [ ] I/O 吞吐提升 3x+（基准测试）

**数据分区策略**:
```
score_bin: [0-1), [1-2), [2-3), [3-4), [4-5]
rank_quartile: Q1 (top 25%), Q2, Q3, Q4 (bottom 25%)
```

---

### 任务 2.2：增量流式重加权 pipeline
**负责人**: Qwen

**验收标准**:
- [ ] 实现 Flink 流处理器（或轻量替代方案）
- [ ] 监听 `refinery_v2_*.log` 变更事件
- [ ] Redis Sorted Set 实时更新
- [ ] 权重更新延迟 < 1s

**技术选型**:
- 轻量替代：Python asyncio + Redis Streams
- 生产环境：Apache Flink + RocksDB

---

### 任务 2.3：精英数据优先调度器（EDPS）
**负责人**: Qwen

**验收标准**:
- [ ] 实现自定义 PyTorch Sampler
- [ ] 每 batch：4 精英样本 + 32 常规样本
- [ ] `persistent_workers=True` 配置
- [ ] 训练日志证明精英样本高频出现

---

## 第三阶段：产品化功能（Week 3-4）

### 任务 3.1：音乐风格适配引擎
**负责人**: GLM

**验收标准**:
- [ ] 音频特征提取（CNN+LSTM）
- [ ] 训练音乐→视觉参数映射模型
- [ ] 推理延迟 < 100ms（WebAssembly 部署）
- [ ] 支持 EDM/古典/电子等 5+ 风格

---

### 任务 3.2：渐进式效果学习系统
**负责人**: GLM

**验收标准**:
- [ ] 用户反馈收集 API
- [ ] 本地联邦学习框架
- [ ] A/B 测试基础设施
- [ ] 用户留存提升 10%+（实验验证）

---

### 任务 3.3：精英效果模板市场
**负责人**: GLM

**验收标准**:
- [ ] 500+ 精英模板打包
- [ ] 相似度推荐算法（欧氏距离）
- [ ] 社区上传 + 自动评分
- [ ] 免费层（Top 50）+ 高级层

---

## 第四阶段：测试保障体系（Week 2-4）

### 任务 4.1：分层回归测试体系
**负责人**: Kimi

**验收标准**:
- [ ] 数据分桶（A/B/C/D 四级）
- [ ] 快速验证集：2,080 对（2% 采样）
- [ ] 黄金标准集：500 精英（100% 通过）
- [ ] CI 流水线集成

---

### 任务 4.2：双向一致性校验
**负责人**: Kimi

**验收标准**:
- [ ] 新旧算法双轨运行框架
- [ ] 容差阈值配置：
  - 3D 坐标误差 < 0.5%
  - 时序相位差 < 1 帧
  - 视觉评分偏差 < 5%
- [ ] 像素级比对（SSIM/PSNR）
- [ ] 差异热力图可视化

---

### 任务 4.3：监控看板 + 自动回滚
**负责人**: Kimi

**验收标准**:
- [ ] Grafana 看板配置
- [ ] 监控指标：
  - 精英通过率
  - 分布漂移（KL 散度）
  - 耗时 P99/P95
- [ ] 自动回滚阈值：
  - 精英通过率 < 98%
  - 分布漂移 > 0.1
- [ ] 质量报告自动生成

---

## 第五阶段：全自动训练流水线（Week 4-6）

### 任务 5.1：训练流程自动化
**负责人**: All

**验收标准**:
- [ ] 一键启动：`python scripts/run_full_training.py`
- [ ] 自动数据加载 + 预处理
- [ ] 自动超参数搜索
- [ ] 自动模型保存 + 验证
- [ ] 自动生成训练报告

**Pipeline 流程**:
```
数据加载 → 预处理 → 训练循环 → 验证 → 模型保存 → 质量报告
```

---

### 任务 5.2：长时间智能自训练程序
**负责人**: All

**验收标准**:
- [ ] 无人值守运行（用户出差期间）
- [ ] 定时任务：每小时检查新数据
- [ ] 自动增量训练
- [ ] 自动质量检测 + 告警
- [ ] 日志 + 进度报告

**自训练架构**:
```
cron(每小时) → 检查新数据 → 增量训练 → 质量验证 → 
  通过 → 保存模型 → 通知
  失败 → 回滚 → 告警
```

---

## 冒烟测试命令集合

### Windows PowerShell
```powershell
# 基础冒烟测试
cd C:\Users\pc\code\newliveweb

# 1. TypeScript 类型检查
npm run type-check

# 2. 单元测试
npm run test

# 3. 构建测试
npm run build

# 4. WASM 加载测试
node check-wasm-api.js

# 5. 预设加载测试
node test-preset-switching.mjs

# 6. 训练脚本测试
cd python
python preset_quality_trainer.py --dry-run

# 7. 数据转换测试
python scripts/convert_to_parquet.py --sample 100

# 完整冒烟测试
.\scripts\smoke-test.ps1
```

### WSL（推荐）
```bash
# 导航到项目
cd /mnt/c/Users/pc/code/newliveweb

# 1. 安装依赖
npm ci

# 2. 类型检查
npm run type-check

# 3. 运行测试
npm run test

# 4. 构建
npm run build

# 5. 启动开发服务器测试
npm run dev &
sleep 10
curl http://localhost:5173/health
kill %1

# 6. Python 依赖检查
cd python
pip list | grep -E "torch|numpy|pandas"

# 7. 训练脚本测试
python preset_quality_trainer.py --dry-run

# 8. 冒烟测试脚本
bash scripts/smoke-test.sh
```

### 快速验证命令
```powershell
# 5 分钟快速验证
.\scripts\quick-smoke.ps1
```

```bash
# 5 分钟快速验证 (WSL)
bash scripts/quick-smoke.sh
```

---

## 质量指标总览

| 指标 | 当前值 | 目标值 | 验收方法 |
|------|--------|--------|----------|
| 精英数据通过率 | - | ≥ 98% | Kimi 回归测试 |
| 帧率提升 | - | +30% | DeepSeek Web Worker |
| 加载时间 | - | < 3s | Lighthouse |
| 训练吞吐量 | - | 3x+ | Qwen Parquet |
| 用户满意度 | - | +10% | GLM 产品指标 |

---

## 风险控制

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| WASM 崩溃 | 中 | 高 | Graceful Degradation |
| 内存溢出 | 中 | 中 | LRU 缓存 + 分片加载 |
| 训练不收敛 | 低 | 高 | 精英数据引导 + 早停 |
| 数据丢失 | 低 | 高 | 增量保存 + 备份 |

---

## 相关文档

- AI 团队讨论记录：`docs/ai_team_meeting_records/2026-02-02-meeting.md`
- 项目主目录：`C:\Users\pc\code\newliveweb\`
- 训练数据目录：`D:\aidata\`
- 训练脚本目录：`python/`

---

## 更新日志

### v2.0 (2026-02-02)
- 新增第二阶段数据流水线优化
- 新增第五阶段全自动训练流水线
- 新增冒烟测试命令集合
- 完善验收标准

### v2.1 (2026-02-02)
- 新增优化模块（已创建）：
  - `python/adaptive_weight_network.py` - 自适应权重学习网络
  - `python/residual_attention.py` - 残差注意力机制
  - `python/score_reweighting.py` - 分数分布重加权
  - `python/unified_coupling_trainer.py` - 统一训练脚本
  - `python/run_optimization.py` - 一键启动脚本
- 新增第三轮 AI 团队讨论记录（全自动训练流水线）
- 更新优化计划，添加快速开始指南

---

## 优化模块使用指南

### 1. 自适应权重学习网络 (adaptive_weight_network.py)
```python
# 使用示例
from adaptive_weight_network import AdaptiveWeightNetwork, EliteCouplingDataset

# 创建模型
model = AdaptiveWeightNetwork(input_dim=64, hidden_dim=32, output_dim=2)

# 加载精英数据训练
trainer = WeightTrainer()
trainer.prepare_data()
trainer.train()
```

### 2. 残差注意力机制 (residual_attention.py)
```python
# 使用示例
from residual_attention import ResidualAttention, DualLayerCouplingNetwork

# 创建注意力模块
attention = ResidualAttention(embed_dim=64, num_heads=4)

# 前向传播
output, weights = attention(query, key, value)
```

### 3. 分数分布重加权 (score_reweighting.py)
```python
# 使用示例
from score_reweighting import ReweightedCouplingLoss

# 创建损失函数
loss_fn = ReweightedCouplingLoss(temperature=1.0)

# 计算加权损失
loss = loss_fn(upper_features, lower_features, scores=[5.0, 4.5, 4.0, ...])
```

### 4. 统一训练脚本 (unified_coupling_trainer.py)
```bash
# 命令行使用
python unified_coupling_trainer.py --data-dir D:/aidata/aivj_coupled_refinery_v2 --epochs 100
```

### 5. 一键启动 (run_optimization.py)
```bash
# 检查环境
python run_optimization.py --mode check

# 运行测试
python run_optimization.py --mode test

# 运行训练（10 epochs）
python run_optimization.py --mode training

# 运行训练（100 epochs）
python run_optimization.py --mode training --epochs 100

# Dry-run
python run_optimization.py --mode all --dry-run
```

---

## 已完成任务 ✅

1. ✅ 整理第一轮会议记录
2. ✅ 整理第二轮会议记录（优化双层 ProjectM 3D 时空耦合算法）
3. ✅ 整理第三轮会议记录（全自动训练流水线）
4. ✅ 查看 D 盘 aidata 数据（104,040 对精炼数据 + 500+ 精英数据）
5. ✅ 精化提示词
6. ✅ 执行优化任务（创建 5 个 Python 模块）

## 待完成任务 ⏳

1. ⏳ 运行模块测试验证代码
2. ⏳ 运行完整训练
3. ⏳ 实现数据流水线优化（Parquet + 增量检测）
4. ⏳ 实现监控告警系统
5. ⏳ 实现质量门禁与自动回滚
6. ⏳ 部署长时间自训练程序

### v1.0 (2026-02-01)
- 初始版本
- 第一阶段算法架构优化
