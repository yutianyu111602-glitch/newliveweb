# newliveweb 优化模块 - 快速使用指南

## 1. 环境准备

### 1.1 安装 Python 依赖
```powershell
cd C:\Users\pc\code\newliveweb\python
pip install -r requirements.txt
```

或单独安装 PyTorch：
```powershell
pip install torch torchvision torchaudio
```

## 2. 快速验证

### 2.1 一键测试所有模块
```powershell
cd C:\Users\pc\code\newliveweb
.\scripts\run_optimization_tests.bat
```

这将自动：
- 检查 Python 和 PyTorch
- 验证 5 个优化模块
- 运行 score_reweighting.py 测试
- 运行 residual_attention.py 测试

### 2.2 单独运行测试
```powershell
cd C:\Users\pc\code\newliveweb\python

# 测试分数重加权
python score_reweighting.py

# 测试残差注意力
python residual_attention.py
```

## 3. 运行训练

### 3.1 快速训练（10 epochs）
```powershell
cd C:\Users\pc\code\newliveweb
.\scripts\run_training.bat
```

或命令行运行：
```powershell
cd C:\Users\pc\code\newliveweb\python
python unified_coupling_trainer.py --epochs 10 --batch-size 16
```

### 3.2 长时间训练（100 epochs）
```powershell
python unified_coupling_trainer.py --epochs 100 --batch-size 32 --learning-rate 0.001
```

### 3.3 Dry-run 验证配置
```powershell
python unified_coupling_trainer.py --epochs 10 --batch-size 16 --dry-run
```

## 4. 一键启动（推荐）

### 4.1 使用一键启动脚本
```powershell
cd C:\Users\pc\code\newliveweb\python

# 检查环境
python run_optimization.py --mode check

# 运行测试
python run_optimization.py --mode test

# 运行训练
python run_optimization.py --mode training --epochs 10

# 运行全部（检查+测试+训练）
python run_optimization.py --mode all --epochs 10
```

### 4.2 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--mode` | 运行模式: check/test/training/all | check |
| `--epochs` | 训练轮数 | 10 |
| `--batch-size` | 批次大小 | 32 |
| `--learning-rate` | 学习率 | 0.001 |
| `--dry-run` | 验证配置，不实际训练 | False |
| `--data-dir` | 训练数据目录 | D:\aidata\aivj_coupled_refinery_v2 |
| `--elite-dir` | 精英数据目录 | D:\aidata\AIVJ_FINAL_ELITE |
| `--output-dir` | 输出目录 | outputs/coupling |

## 5. 长时间自训练（出差期间）

### 5.1 启动自训练程序
```powershell
cd C:\Users\pc\code\newliveweb
.\scripts\run_auto_training.bat
```

功能：
- 每 60 分钟自动检查新数据
- 自动增量训练
- 自动质量检测
- 训练日志记录

### 5.2 手动停止
按 `Ctrl+C` 停止自训练程序

## 6. 输出产物

### 6.1 模型文件
```
outputs/coupling/models/
  ├── coupling_net_final.pth    # 最终模型
  ├── coupling_net_best.pth     # 最佳模型
  └── checkpoint_epoch_XX.pth   # 检查点
```

### 6.2 训练历史
```
outputs/coupling/
  └── training_history.json     # 训练历史记录
```

### 6.3 日志文件
```
outputs/coupling/logs/
  └── training.log              # 训练日志
```

## 7. 验证结果

### 7.1 冒烟测试
```powershell
cd C:\Users\pc\code\newliveweb
.\scripts\smoke-test.ps1
```

### 7.2 验证指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 训练损失 | 下降趋势 | 验证模型是否学习 |
| 验证损失 | < 0.01 | 模型泛化能力 |
| 精英通过率 | > 95% | 黄金标准验证 |
| 训练时间 | 合理 | 性能监控 |

## 8. 常见问题

### Q1: PyTorch 未安装
```powershell
pip install torch torchvision torchaudio -f https://download.pytorch.org/whl/cpu/torch_stable.html
```

### Q2: 内存不足
减小批次大小：
```bash
python unified_coupling_trainer.py --batch-size 8
```

### Q3: 训练不收敛
调整学习率：
```bash
python unified_coupling_trainer.py --learning-rate 0.0001
```

### Q4: 数据不存在
检查数据目录：
```powershell
ls D:\aidata\
```

## 9. 监控训练

### 9.1 查看训练进度
打开 `outputs/coupling/training_history.json` 查看损失曲线

### 9.2 查看日志
```powershell
type outputs/coupling/logs\training.log
```

## 10. 核心算法

### 10.1 自适应权重学习
```python
L = Σ(rank_i - σ(w_s·S_i + w_t·T_i + b))²
```

### 10.2 残差注意力
```python
Attn(Q,K,V) = Softmax(QK^T / √d_k)·V + Residual(Q)
```

### 10.3 分数重加权
```python
α_i = exp(β·score_i) / Σ exp(β·score_j)
```

---

**快速开始**:
```powershell
cd C:\Users\pc\code\newliveweb
.\scripts\run_optimization_tests.bat
```
