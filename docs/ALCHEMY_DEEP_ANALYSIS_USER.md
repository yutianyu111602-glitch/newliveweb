# 炼丹数据深度分析报告（通俗版）

> 生成时间：2026-01-28
> 目标读者：使用自然语言 AI 编程的用户

---

## 1. 数据概况

### 1.1 原始数据包

你有一个**130k MilkDrop 预设数据包**（136,102 个文件，约 1.3GB）。

**从哪里来的**：
- Winamp Forum 经典预设（48k+）
- DeviantArt、Discord、Reddit 社区贡献
- 作者包括：Geiss、Flexi、Krash、Martin、Eo.S、MilkDrop2077 等知名作者

### 1.2 已炼成的产物

你已经在 D 盘炼好的预设：

| 产物名 | 预设数 | 什么风格 |
|-------|-------|---------|
| phase3-slow-curated-v4-dark | 9,627 | 慢速暗黑（最大） |
| long7d-techno-fusion-v4 | 5,xxx | Techno Fusion |
| phase1-baseline-supplement-v6 | 6,xxx | 基线补充 |
| lora-techno-parallel-v2 | 3,xxx | LoRA 风格 |

---

## 2. 发现的问题

### ❌ 问题 1：Target 分类重复

**现象**：band-targets-high 和 band-targets-low 有大量重叠的预设

**为什么不好**：
- 同一个预设被分到 high 又分到 low
- 分类不清晰，筛选时容易混乱

**怎么修**：改成多维分类（低音强度、中音强度、高音强度分别打分）

---

### ❌ 问题 2：motion 过滤太严格

**现象**：
- 普通版：motion < 0.01 的被过滤
- slow 版：motion < 0.006 被过滤（更严格）

**为什么不好**：
- 过滤掉太多有动态变化的预设
- slow 版预设太少（只有 1,609 个）

**怎么修**：
| 风格 | 建议阈值 | 说明 |
|-----|---------|------|
| dark | < 0.008 | 暗光环境 |
| relaxed | < 0.015 | 放松氛围 |
| strict | < 0.025 | 高能场景 |
| slow | < 0.004 | 极低动态（放宽） |

---

### ❌ 问题 3：缺少关键指标

**当前只有**：
- tier（dark/relaxed/strict）
- avgLuma（亮度）
- motion（运动）
- bandClass（频段）

**缺少的重要指标**：
- **fRating（0-5分）**：用户评分，5分是顶级
- **Shader 复杂度**：影响性能
- **Mesh Size**：影响 CPU 计算
- **作者信誉**：知名作者质量更稳定

**参考**：业界 Cream of the Crop 精选了 9,854 个 fRating=5.0 的预设

---

### ❌ 问题 4：130k 数据只用了很少

**现象**：产物只利用了 run3-crashsafe-15000 的子集

**意味着**：100k+ 高质量预设还没被筛选

---

## 3. 怎么炼出更好的数据

### 3.1 从 130k 中筛选（短期）

**策略**：分层抽样 + 定向筛选

**告诉 AI 的话**：
> "从 130k 预设中随机抽 1%（约 1,360 个），然后筛选知名作者（Geiss、Flexi、Krash 等）的作品，生成新的 curated 产物。"

**具体步骤**：
```bash
# 1. 随机抽 1%
python scripts/sample_presets.py --ratio 0.01

# 2. 筛选优质作者
python scripts/filter_by_author.py --authors "Geiss,Flexi,Krash"

# 3. 按 fRating 筛选（如果有）
python scripts/filter_by_rating.py --min_rating 4.0
```

---

### 3.2 建立质量评分体系（中长期）

**告诉 AI 的话**：
> "建立一个多维质量评分系统，综合考虑：
> - 视觉质量（色彩、动画、复杂度）
> - 音频响应（低音、中音、高音的响应程度）
> - 性能（Shader 复杂度、帧率）
> - 用户评分（fRating）"

**评分权重建议**：
| 维度 | 权重 | 说明 |
|-----|------|------|
| 视觉质量 | 35% | 色彩丰富度、动画流畅度 |
| 音频响应 | 35% | 频段响应强度 |
| 性能 | 20% | 不卡顿 |
| 用户评分 | 10% | fRating |

---

### 3.3 智能筛选流程

```
输入：130k 预设
  ↓
Step 1：粗筛（基础质量）
  - 过滤 fRating < 3.5
  - 过滤 Shader 复杂度 > 100
  ↓
Step 2：精筛（音频响应）
  - 按 bass/mid/treb 响应打分
  - 按 motion 评分
  ↓
Step 3：聚类（保证多样性）
  - 按风格分组
  - 每组最多 50 个
  ↓
Step 4：排序
  - 按综合评分排序
输出：高质量预设列表
```

---

## 4. 实施步骤

### 第一阶段（1-2 周）：修复现有问题

告诉 AI 做什么：
1. "修复产物目录：补充缺失的 run-manifest.json"
2. "合并去重 band-targets-high.txt 和 band-targets-low.txt"
3. "调整 motion 过滤阈值：dark<0.008, relaxed<0.015, strict<0.025, slow<0.004"
4. "建立 fRating 解析（如果有数据）"
5. "建立 Shader 复杂度检测"

### 第二阶段（1 个月）：处理 130k 数据

告诉 AI 做什么：
1. "完成 130k 预设的 1% 抽样分析"
2. "建立优质作者库（Geiss、Flexi、Krash、Martin、Eo.S 等）"
3. "筛选首批新产物（约 5,000 预设）"
4. "实现多维质量评分系统"
5. "集成到 newliveweb 的预设系统"

### 第三阶段（3 个月）：高级功能

告诉 AI 做什么：
1. "尝试用 LoRA 训练生成新风格预设"
2. "建立自动化炼丹 pipeline"
3. "集成用户反馈（收藏/评分数据）"

---

## 5. 预期效果

| 阶段 | 效果 |
|-----|------|
| 短期 | 现有产物更清晰、阈值更合理 |
| 中期 | 新增 5,000+ 高质量预设 |
| 长期 | 自动化炼丹，持续产出高质量预设 |

---

## 6. 快速参考

### 相关文件

| 文件 | 路径 |
|-----|------|
| 原始数据包 | `C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets` |
| 产物目录 | `D:\aidata\` |
| Target 文件 | `D:\aidata\band-targets-*.txt` |
| newliveweb 预设 | `public/presets/` |

### 关键数字

| 数字 | 含义 |
|-----|------|
| 136,102 | 原始数据包预设数 |
| ~1.3GB | 原始数据包大小 |
| 9,627 | 最大产物（phase3-slow）的预设数 |
| 4,915 | phase3-slow 中唯一预设数 |

### 建议阈值

| 风格 | motion 阈值 | fRating 最低 |
|-----|------------|-------------|
| dark | < 0.008 | 3.5 |
| relaxed | < 0.015 | 3.5 |
| strict | < 0.025 | 3.5 |
| slow | < 0.004 | 4.0 |

---

## 7. 总结

**核心问题**：
1. Target 分类重复
2. motion 过滤太严
3. 缺少 fRating 等关键指标
4. 130k 数据只用了一小部分

**核心方案**：
1. 修复现有问题（1-2 周）
2. 抽样分析 130k（1 个月）
3. 建立智能筛选系统（1-3 个月）

**下一步**：让 AI 按"实施步骤"逐步执行。

---

*通俗版报告，由 Clawdbot AI Team 整理*
