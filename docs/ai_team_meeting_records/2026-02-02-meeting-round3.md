# AI 团队讨论会议记录 - 2026-02-02（第三轮）

## 会议主题
全自动训练流水线 + 长时间智能自训练程序设计

## 参与专家
- **DeepSeek**（自训练架构）
- **Qwen**（数据增量）
- **GLM**（监控告警）
- **Kimi**（质量门禁）

## 背景
- **训练数据**：`D:\aidata\`（104,040 对精炼数据 + 500+ 精英数据）
- **项目目录**：`C:\Users\pc\code\newliveweb\`
- **训练脚本**：`python\preset_quality_trainer.py`
- **预训练模型**：`coupling_net_best.pth` (4.6MB)

---

## DeepSeek 专家建议（自训练架构）

### 1. 基于监控守护进程的智能训练调度器
创建 `auto_train_daemon.py`：
- **数据检测**：用 inotify 或定时扫描监控 `D:\aidata\`，文件哈希对比检测新增数据
- **增量训练**：检查点机制，从 `coupling_net_best.pth` 加载权重，训练完成后自动覆盖
- **容错处理**：进程异常退出自动重启，失败 3 次后发送告警
- **告警系统**：集成 Telegram Bot API，训练完成/失败/新数据检测时通知

### 2. 分阶段渐进式训练流水线
创建 `pipeline_trainer.py`，三阶段训练：
1. **精英数据预热**：500+ 精英数据微调 1-2 个 epoch，快速提升模型质量
2. **全量数据训练**：加载预热后模型，使用 104,040 对数据进行完整训练
3. **增量数据融合**：检测到新数据时，仅用新数据 + 部分旧数据进行平衡训练
4. **资源监控**：实时监控 GPU 内存、温度，超阈值时暂停训练并告警

### 3. 基于时间窗口的智能训练策略
创建 `smart_scheduler.py`：
- **时间调度**：每日凌晨 2-6 点自动训练（避开工作时间）
- **性能评估**：训练后自动在验证集评估，性能提升 <0.5% 时跳过下次训练
- **数据管理**：自动清理旧版本模型，保留最近 5 个检查点
- **日志聚合**：训练日志自动上传云端，Web 界面远程查看进度
- **紧急停止**：支持通过 Telegram 命令远程暂停/恢复训练进程

---

## Qwen 专家建议（数据增量）

### 1. 增量数据检测
在 `D:\aidata\` 下维护 `.last_seen` 时间戳文件：
- 启动时用 `os.scandir()` 遍历新 `.jsonl`/`.parquet` 文件
- 比对 `st_mtime > .last_seen` 值
- 已处理文件哈希记录至 `processed_hashes.jsonl`，防重复加载

### 2. 断点续训与热启
修改 `preset_quality_trainer.py`：
- 支持 `--resume-from=checkpoint.pth --data-list=new_files.txt`
- 每 500 步自动保存 `checkpoints/step_XXXX.pth` + `train_state.json`
- 检测到新数据时，加载最新 checkpoint 并追加 `new_files.txt` 进 dataloader

### 3. 版本化训练与原子回滚
- 每次训练生成唯一 `v{unix_ts}_{hash4}` 版本号
- 输出至 `models/v{ver}/` 并软链 `models/latest -> models/v{ver}`
- 写入 `versions.csv`（ver, time, data_hash, model_hash, cmd_line）
- 回滚只需 `ln -sf v20240520_abc1 models/latest`

---

## GLM 专家建议（监控告警）

### 1. 训练进度实时监控 + Telegram 通知
**监控指标**：
- 当前训练步骤（Step 1-9）
- 已处理样本数 / 总样本数
- 预计剩余时间
- 内存/磁盘使用率

**技术方案**：
```python
TELEGRAM_TOKEN = "your_bot_token"
TELEGRAM_CHAT_ID = "your_chat_id"

def send_telegram(message):
    requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", 
                 json={"chat_id": TELEGRAM_CHAT_ID, "text": message})

# 每个主要步骤后调用
send_telegram(f"✅ Step X 完成\n进度: {current_step}/9\n已处理: {i}/{total}")
```

### 2. 资源与异常监控 + 邮件+Telegram双通道
**监控指标**：
- 内存使用率 >85%
- CPU 持续占用 >90%（5分钟）
- 磁盘剩余空间 <5GB
- 训练异常/错误日志
- 交叉验证准确率下降 >10%

**告警方式**：
- **Telegram**：即时告警（内存溢出、训练崩溃）
- **邮件**：详细报告（性能下降、日志文件）

### 3. 训练结果自动验证 + Web仪表板
**监控指标**：
- 交叉验证准确率（cv_accuracy）
- 训练准确率（training_accuracy）
- F1 分数变化趋势
- 特征重要性 TOP10
- 模型文件大小和完整性

**远程查看**：FastAPI 轻量级 Web 服务器
```python
# app.py
from fastapi import FastAPI, HTMLResponse
import json

app = FastAPI()

@app.get("/", response_class=HTMLResponse)
def dashboard():
    with open('training_report.json') as f:
        data = json.load(f)
    return f"""
    <h1>训练状态仪表板</h1>
    <p>准确率: {data['model_performance']['cv_accuracy']}</p>
    <p>F1分数: {data['model_performance']['f1_score']}</p>
    <script>setTimeout(()=>location.reload(), 300000)</script>
    """
# 启动: uvicorn app:app --host 0.0.0.0 --port 8080
```

---

## Kimi 专家建议（质量门禁）

### 1. 多重指标检查点（Checkpoint Quality Gate）
**检测指标**：
- **损失趋势**：验证集损失连续 3 轮上升则触发告警
- **准确率阈值**：精英集准确率 <95% 或整体验证集 <90% 为不合格
- **损失异常值**：单轮损失变化 >50% 视为训练震荡

**技术方案**：
```python
checkpoint_metrics = {
    'val_loss': current_val_loss,
    'elite_acc': elite_accuracy,
    'epoch': epoch
}
if val_loss > last_3_epochs_avg * 1.1:
    trigger_rollback()
```

### 2. 版本化模型仓库 + 自动回滚
**版本管理**：
- 每轮保存：`coupling_net_v{epoch}_{val_loss:.4f}.pth`
- 维护 `model_registry.json`：记录每个版本的指标和状态

**回滚策略**：
| 条件 | 动作 |
|------|------|
| 连续 2 轮指标恶化 | 自动回滚到最近"健康"版本 |
| 损失为 NaN/Inf | 立即回滚并降低学习率 50% |
| 磁盘空间不足 | 仅保留 top3 最佳模型 |

### 3. 精英数据作为黄金标准（Golden Test）
**最佳模型选择策略**：
1. **每日竞赛**：新模型必须在精英集上击败当前最佳模型（+1% 以上）
2. **双轨验证**：精英集 500+ 数据作为"一票否决"，验证集 10万+ 作为参考
3. **自动晋升**：`elite_acc_new > elite_acc_best * 1.01` 且 `val_acc_new > val_acc_best`

**技术方案**：
```python
def promote_model(candidate_path):
    elite_score = evaluate(candidate_path, elite_dataset)
    current_score = evaluate('coupling_net_best.pth', elite_dataset)
    
    if elite_score > current_score * 1.01:
        backup_current()
        shutil.copy(candidate_path, 'coupling_net_best.pth')
        update_registry(candidate_path, status='promoted')
        return True
    else:
        update_registry(candidate_path, status='rejected')
        return False
```

---

## 自训练程序架构总览

```
D:\aidata\                          # 数据源
  ├── .last_seen                    # 增量检测时间戳
  ├── processed_hashes.jsonl        # 已处理文件记录
  ├── aivj_coupled_refinery_v2/     # 主训练数据
  └── AIVJ_FINAL_ELITE/             # 精英数据（黄金标准）

C:\Users\pc\code\newliveweb\        # 项目目录
  ├── python/
  │   ├── preset_quality_trainer.py # 训练脚本（待修改）
  │   ├── auto_train_daemon.py      # [新增] 监控守护进程
  │   ├── pipeline_trainer.py       # [新增] 三阶段流水线
  │   ├── smart_scheduler.py        # [新增] 智能调度器
  │   ├── incremental_detector.py   # [新增] 增量检测器
  │   └── notify.py                 # [新增] 告警服务
  ├── models/
  │   ├── coupling_net_best.pth     # 当前最佳模型
  │   ├── v20240520_abc1/           # 版本化历史模型
  │   └── latest -> v20240520_abc1  # 软链接
  ├── scripts/
  │   ├── smoke-test.ps1            # 冒烟测试
  │   └── auto-train.ps1            # 一键启动脚本
  ├── training_report.json          # 训练报告
  └── versions.csv                  # 版本记录

监控告警：
  ├── Telegram Bot                 # 即时通知
  ├── 邮件服务                     # 详细报告
  └── FastAPI Web 仪表板           # 远程查看
```

---

## 质量保障闭环

```
指标监控(Kimi) → 版本回滚 → 精英标准(GLM) → 增量数据(Qwen) → 自动训练(DeepSeek) → 监控告警(GLM) → ...
```

---

## 相关文档
- 第二轮讨论：`docs/ai_team_meeting_records/2026-02-02-meeting.md`
- 优化计划：`docs/ai_team_meeting_records/AI_TEAM_PLAN_OPTIMIZATION.md`
- 项目目录：`C:\Users\pc\code\newliveweb\`

---

*会议记录创建时间：2026-02-02 11:35 GMT+8*
