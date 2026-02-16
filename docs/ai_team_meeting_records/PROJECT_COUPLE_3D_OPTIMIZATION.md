# newliveweb 核心优化项目 - 双层 ProjectM 3D 时空耦合算法

## 项目状态
- **状态**: 执行中
- **开始日期**: 2026-02-02
- **核心目标**: 优化双层 ProjectM 3D 时空耦合算法
- **数据基础**: 104,040 对精炼数据 + 4.6MB 预训练模型

---

## 一、核心目标

基于 AI 团队三轮讨论结果，聚焦优化双层 ProjectM 3D 时空耦合算法：

### 核心算法优化方向

| 优先级 | 优化项 | 负责人 | 预期收益 |
|--------|--------|--------|----------|
| P0 | 自适应时空权重学习 | DeepSeek | 模型准确率 +15% |
| P0 | 残差注意力机制 | DeepSeek | 特征融合质量 +20% |
| P0 | 分数分布重加权 | DeepSeek | 高分样本聚焦 3x |
| P1 | 数据流水线优化 | Qwen | I/O 吞吐 3x |
| P1 | 增量数据处理 | Qwen | 断点续训支持 |
| P2 | 监控告警系统 | GLM | 远程监控 |
| P2 | 质量门禁 | Kimi | 自动回滚 |

### 数学原理

**1. 自适应时空权重学习**
```
L = Σ(rank_i - σ(w_s·S_i + w_t·T_i + b))²
```

**2. 残差注意力机制**
```
Attn(Q,K,V) = Softmax(QK^T / √d_k)·V + Residual(Q)
```

**3. 分数分布重加权**
```
α_i = exp(β·score_i) / Σ exp(β·score_j)
L_coupled = Σ α_i·||F_upper - F_lower||²
```

---

## 二、数据基础

### 已就绪数据

| 数据集 | 规模 | 质量 | 用途 |
|--------|------|------|------|
| aivj_coupled_refinery_v2 | 104,040 对 | 精炼（已评分） | 主训练集 |
| AIVJ_FINAL_ELITE | 500+ 对 | 精英（score=5.0） | 黄金标准/验证集 |
| deep_alchemy_10h | 2,001 对 | quality=0.8 | 辅助训练 |
| coupling_net_best.pth | 4.6MB | 预训练模型 | 初始化权重 |

### 数据位置

```
D:\aidata\
  ├── aivj_coupled_refinery_v2\    # 主训练数据 (104,040对)
  │   ├── bg\                      # 背景预设
  │   └── fg\                      # 前景预设
  ├── AIVJ_FINAL_ELITE\            # 精英数据 (500+对)
  │   ├── AIVJ_FINAL_ELITE_MANIFEST.json
  │   ├── bg\
  │   └── fg\
  └── deep_alchemy_10h\            # 深度学习数据
      ├── coupling_net_best.pth    # 预训练模型 (4.6MB)
      └── manifest.jsonl
```

---

## 三、执行计划

### Phase 1: 算法核心优化 (Day 1-2)

#### 任务 1.1: 实现自适应权重学习网络
**文件**: `python/adaptive_weight_network.py`

**验收标准**:
- [ ] 加载 500+ 精英数据
- [ ] 实现权重预测网络（输入: 64维特征, 输出: w_s, w_t）
- [ ] 损失函数收敛（< 0.01）
- [ ] 验证集准确率 > 85%

**代码位置**: `python/adaptive_weight_network.py`

#### 任务 1.2: 实现残差注意力机制
**文件**: `python/residual_attention.py`

**验收标准**:
- [ ] 实现 Attention(Q,K,V) 模块
- [ ] 支持多头注意力（num_heads=4）
- [ ] 残差连接 + 层归一化
- [ ] 内存占用 < 2GB

**代码位置**: `python/residual_attention.py`

#### 任务 1.3: 实现分数重加权损失
**文件**: `python/score_reweighting.py`

**验收标准**:
- [ ] 实现 α_i 权重计算公式
- [ ] 可调温度参数 β（0.5-2.0）
- [ ] 高分样本（score>4.0）梯度贡献提升 3x
- [ ] 消融实验报告

**代码位置**: `python/score_reweighting.py`

### Phase 2: 统一训练流水线 (Day 2-3)

#### 任务 2.1: 创建统一训练脚本
**文件**: `python/unified_coupling_trainer.py`

**验收标准**:
- [ ] 整合三个优化模块
- [ ] 支持命令行参数（--epochs, --batch-size, --lr）
- [ ] 自动保存检查点（每 10 epochs）
- [ ] 生成训练报告（JSON）

**命令**:
```bash
python python/unified_coupling_trainer.py --epochs 100 --batch-size 32
```

#### 任务 2.2: 创建一键启动脚本
**文件**: `python/run_optimization.py`

**验收标准**:
- [ ] 支持 --mode check/test/training/all
- [ ] 支持 --dry-run 验证配置
- [ ] 自动创建输出目录

**命令**:
```bash
# 检查环境
python python/run_optimization.py --mode check

# 运行测试
python python/run_optimization.py --mode test

# 运行训练
python python/run_optimization.py --mode training --epochs 100
```

### Phase 3: 自动验证 (Day 3-4)

#### 任务 3.1: 模块单元测试
**验收标准**:
- [ ] adaptive_weight_network.py 测试通过
- [ ] residual_attention.py 测试通过
- [ ] score_reweighting.py 测试通过

**命令**:
```bash
python python/run_optimization.py --mode test
```

#### 任务 3.2: 集成测试
**验收标准**:
- [ ] 统一训练脚本运行无错误
- [ ] 训练损失下降（初始 → 最终）
- [ ] 精英数据通过率 > 95%

**命令**:
```bash
python python/run_optimization.py --mode training --epochs 10
```

#### 任务 3.3: 冒烟测试
**验收标准**:
- [ ] TypeScript 类型检查通过
- [ ] 构建成功
- [ ] 预设加载正常

**命令**:
```bash
# PowerShell
.\scripts\smoke-test.ps1

# WSL
bash scripts/smoke-test.sh
```

---

## 四、输出产物

### 代码文件

```
C:\Users\pc\code\newliveweb\python\
  ├── adaptive_weight_network.py   # 自适应权重学习
  ├── residual_attention.py        # 残差注意力
  ├── score_reweighting.py         # 分数重加权
  ├── unified_coupling_trainer.py  # 统一训练
  └── run_optimization.py          # 一键启动
```

### 输出目录

```
C:\Users\pc\code\newliveweb\outputs\
  └── coupling\
      ├── models\
      │   ├── coupling_net_final.pth
      │   ├── coupling_net_best.pth
      │   └── checkpoint_epoch_XX.pth
      └── training_history.json
```

### 文档

```
C:\Users\pc\code\newliveweb\docs\ai_team_meeting_records\
  ├── 2026-02-02-meeting.md              # 第一轮讨论
  ├── 2026-02-02-meeting-round3.md       # 第三轮讨论（全自动训练）
  └── AI_TEAM_PLAN_OPTIMIZATION.md       # 优化计划（v2.1）
```

---

## 五、验证指标

### 算法性能指标

| 指标 | 当前基线 | 目标值 | 验收方法 |
|------|----------|--------|----------|
| 验证集损失 | - | < 0.01 | 训练日志 |
| 精英数据通过率 | - | > 95% | EliteDataset 评估 |
| 训练吞吐量 | - | 3x 提升 | I/O 监控 |
| 模型大小 | 4.6MB | < 10MB | 文件大小 |

### 系统稳定性指标

| 指标 | 目标值 | 验收方法 |
|------|--------|----------|
| 训练崩溃率 | < 1% | 自动重试机制 |
| 断点恢复成功率 | 100% | 检查点测试 |
| 内存占用 | < 2GB | 监控告警 |

---

## 六、时间线

```
Day 1          Day 2          Day 3          Day 4
  │              │              │              │
  ├─ 权重学习    ├─ 统一训练    ├─ 单元测试    ├─ 冒烟测试
  ├─ 注意力机制  ├─ 启动脚本    ├─ 集成测试    └─ 文档整理
  └─ 重加权损失  └─ 参数调优    └─ 性能优化
```

---

## 七、风险控制

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 训练不收敛 | 低 | 高 | 精英数据引导 + 早停 |
| 内存溢出 | 中 | 中 | 梯度检查点 + 混合精度 |
| 数据损坏 | 低 | 高 | 多重备份 + 校验 |
| 依赖缺失 | 中 | 中 | requirements.txt |

---

## 八、团队讨论记录索引

### 第一轮：项目优化方向
- 文件: `2026-02-02-meeting.md`
- 专家: DeepSeek/Qwen/GLM/Kimi
- 主题: newliveweb 下一步最值得做的三件事

### 第二轮：算法架构优化
- 文件: `2026-02-02-meeting.md`
- 专家: DeepSeek/Qwen/GLM/Kimi
- 主题: 优化双层 ProjectM 3D 时空耦合算法

### 第三轮：全自动训练流水线
- 文件: `2026-02-02-meeting-round3.md`
- 专家: DeepSeek/Qwen/GLM/Kimi
- 主题: 全自动训练 + 长时间自训练程序

---

## 九、下一步行动

### 立即执行

1. ✅ 整理核心项目文档（本文件）
2. ⏳ 运行模块测试
   ```bash
   python python/run_optimization.py --mode test
   ```
3. ⏳ 运行训练验证
   ```bash
   python python/run_optimization.py --mode training --epochs 10
   ```

### 出差期间可运行

1. 长时间训练（100 epochs）
   ```bash
   python python/run_optimization.py --mode training --epochs 100
   ```

2. 冒烟测试
   ```bash
   # PowerShell
   .\scripts\smoke-test.ps1
   ```

---

*文档创建时间: 2026-02-02 11:40 GMT+8*
*版本: v1.0*
