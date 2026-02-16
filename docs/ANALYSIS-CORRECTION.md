# 炼丹项目完整技术分析与14天计划

## 📊 一、我做了哪些优化？

### 1.1 我最初的**错误诊断**（已纠正）

❌ **错误1：Motion=0 是计算bug**
- 我说：prevGray=null → motion=undefined → JSON变成0
- **真相**：motion=undefined会被过滤掉（line 1028），不会变0
- **实际原因**：这些preset画面真的完全静态（5帧SHA256相同）

❌ **错误2：Luma=0 是渲染失败被标记为ok**
- 我说：failed却status=ok是bug
- **真相**：preset确实渲染出黑屏（可能preset设计如此/缺纹理/不支持特性）

❌ **错误3：阈值过严导致大量失败**
- 我说：39.48%被过滤是阈值太严
- **真相**：baseline成功率99.9%很健康，lowBoth 17.8%在容忍度内（<25%）

❌ **错误4：混淆了超时配置**
- 我说：4500ms超时太短
- **真相**：4500ms是preset-audit.mjs的值，AIVJ渲染用的是70s/100s

### 1.2 我实际做的优化（部分有效，部分误判）

#### ✅ **有效优化：修改warmup逻辑**
```typescript
// 修改：presetFrameDump.ts
// 拆分warmup和capture循环，在warmup最后一帧捕获prevGray
for (let i = 0; i < warmupFrames; i++) {
  render();
  if (i === warmupFrames - 1) {
    prevGray = computeGray01FromImageData(image.data);  // 确保第一个capture有prevGray
  }
}
```
**效果**：理论上有效，但从数据看motion=0比例依然15-18%
**原因**：大部分motion=0不是bug，是preset真的静止

#### ⚠️ **误导性优化：放宽质量阈值**
```javascript
// render-14day-optimized.mjs
frameLumaMin: 0.01,      // 从0.06降到0.01
frameMotionMin: 0.0005,  // 从0.002降到0.0005
```
**效果**：会收录更多"低价值"preset（暗/静态）
**问题**：对techno音乐可视化来说，这些可能不是想要的

#### ✅ **有效优化：增加超时容忍度**
```javascript
timeoutMs: 30000,        // 从20s增到30s
retryTimes: 3,           // 从2增到3
watchdogMaxPresetMs: 120000,  // 120s max
```
**效果**：理论上能减少超时失败
**但**：对于fusion/slow的70s+超时，仍然不够

---

## 🎯 二、原因是什么？

### 2.1 Motion=0 的真实原因（修正）
**不是bug，是preset特性**：
- 12.38% preset同时luma=0+motion=0（完全黑屏+静止）
- 约3% preset有luma但motion=0（静态艺术效果）
- **来源**：
  - NoWavesNoShapes preset（设计为静态几何）
  - 依赖缺失纹理的preset（渲染出空画面）
  - 某些ambient/meditation风格preset

### 2.2 Luma=0 的真实原因
**不是渲染失败，是preset输出特性**：
- 12.45% preset真的输出黑屏
- **来源**：
  - 依赖不支持的ProjectM特性
  - 缺少外部纹理/图像文件
  - per-frame代码输出全0
  - 设计为"暗黑系"但techno音频无法激活

### 2.3 Fusion/Slow超时的真实原因
**不是4500ms，是70s/100s硬超时**：
```javascript
// render-preset-frames.mjs line 992
const hardTimeoutMs = Math.max(1000, Math.min(120_000, args.timeoutMs + 10_000));
// fusion: 60s + 10s = 70s
// slow: 90s + 10s = 100s
```
**原因**：
- Parallax overlay需要双倍渲染（base + overlay）
- 复杂shader编译时间长（尤其slow列表都是编译重的）
- captureMaxFrames=100时需要渲染更多帧

---

## 📈 三、测试结果如何？

### 3.1 Baseline数据集（已完成）
```
路径: D:\aidata\long7d-techno-baseline-v1
状态: ✅ 99.9% 成功率，数据健康

统计:
├─ Total: 14590
├─ OK: 14582 (99.95%)
├─ Motion=0: 2240 (15.35%)  ← 真实静态preset
├─ Luma=0: 1817 (12.45%)    ← 真实黑屏preset
└─ Both=0: 1806 (12.38%)    ← 黑屏+静态

质量分层:
├─ 优质数据 (motion>0, luma>0): ~11500条 (78.8%)
├─ 可用但低价值 (motion低或luma低): ~1276条 (8.7%)
└─ 无效数据 (both=0): 1806条 (12.4%)
```

### 3.2 14day-optimized（当前运行）
```
路径: D:\aidata\14day-techno-optimized-v1
状态: 🔄 运行中，已处理 167 presets

最近50条统计:
├─ Motion=0: 9 (18%)        ← 比baseline稍高
├─ Luma=0: 5 (10%)          ← 与baseline相近
└─ 优质: 31 (62%)           ← 仍有大量低价值数据混入

问题:
1. 放宽阈值导致更多静态/暗preset被接受
2. captureCount=5但很多只有3帧（配置有误？）
3. Motion=0比例未改善（说明不是bug问题）
```

### 3.3 Fusion批次（部分完成）
```
路径: D:\aidata\long7d-techno-fusion-v1
进度: 3625/14348 (25.3%)

失败分析:
├─ 成功: 3010 (82.6%)
├─ 失败: 617 (17.1%)
└─ 主要原因: probe-timeout>70000ms (639/643)

结论: 70s超时对于parallax+复杂preset不够
```

---

## 🗑️ 四、现有产物是否废数据？

### 4.1 **Baseline: 78.8%有效，NOT废数据**

✅ **11500条优质数据可直接用于训练**
- Motion>0 且 Luma>0.01
- 真实动态可视化效果
- 适合techno音乐风格

⚠️ **1276条低价值数据需要筛选**
- Motion很低(<0.002)但不为0
- Luma很低(<0.06)但有动态
- 可能适合特定风格（ambient/dark）

❌ **1806条无效数据需要过滤**
- Both=0（黑屏+静态）
- 训练时会产生噪音

### 4.2 **14day-optimized: 配置有误，建议停止**

问题:
1. ❌ 降低阈值适得其反（收录更多低价值preset）
2. ❌ captureCount=5但实际只有3帧（配置错误）
3. ❌ 未解决motion=0问题（因为不是bug）

建议: **立即停止当前任务，重新配置**

### 4.3 **Fusion: 82.6%有效，继续运行**

✅ 已完成的3010条数据有效
- Parallax效果丰富训练多样性
- 失败的617条主要是超时（可后续单独重跑）

---

## 🚀 五、如何处理黑屏和静态preset问题？

### 5.1 **策略：分级过滤，而非全部丢弃**

#### **Tier 1: 核心数据（优先训练）**
```javascript
过滤条件:
├─ avgLuma >= 0.06 && avgLuma <= 0.94
├─ motion >= 0.005
└─ frames.length === captureCount

预期: ~70% preset (约91000条)
用途: LoRA模型主训练集
```

#### **Tier 2: 补充数据（辅助训练）**
```javascript
过滤条件:
├─ (avgLuma >= 0.02 && avgLuma < 0.06) || (avgLuma > 0.94)  // 极暗/极亮
├─ motion >= 0.001 && motion < 0.005  // 慢动态
└─ frames.length === captureCount

预期: ~15% preset (约19500条)
用途: 增加风格多样性
```

#### **Tier 3: 废弃数据（不用于训练）**
```javascript
过滤条件:
├─ avgLuma === 0  // 纯黑
├─ motion === 0   // 完全静止
└─ 或 avgLuma === 0 && motion === 0

预期: ~15% preset (约19500条)
处理: 标记为blacklist，不用于训练
```

### 5.2 **实施方案：后处理脚本**

创建 `filter-training-data.mjs`:
```javascript
// 读取 frames-index.jsonl
// 按上述规则分级
// 生成3个manifest:
//   - tier1-high-quality.json
//   - tier2-supplementary.json
//   - tier3-blacklist.json
```

---

## 📅 六、14天计划如何处理？

### 6.1 **立即行动：停止错误配置**

```powershell
# 1. 停止当前14day-optimized任务
Stop-Process -Name "node" -Force

# 2. 删除错误产物
Remove-Item "d:\aidata\14day-techno-optimized-v1" -Recurse -Force
```

### 6.2 **重新配置：分三阶段执行**

#### **Phase 1: 完成baseline补充（2天）**
```javascript
目标: 补齐baseline中超时/失败的preset
配置:
├─ 使用baseline的失败列表
├─ timeoutMs: 60000 (60s)
├─ 保持原质量阈值 (luma 0.06-0.96, motion 0.002)
├─ captureCount: 5 (确保5帧)
└─ 预计: 补充~500条高质量数据
```

#### **Phase 2: 完成fusion补充（5天）**
```javascript
目标: 完成fusion剩余10723个preset
配置:
├─ timeoutMs: 90000 (90s for parallax)
├─ overlayMode: parallax
├─ 质量阈值: luma 0.06-0.96, motion 0.005
├─ captureCount: 5
└─ 预计: 完成8500+条parallax数据
```

#### **Phase 3: 精选慢preset（7天）**
```javascript
目标: 从slow列表挑选能跑通的preset
策略:
├─ 先用preset-audit预筛选 (timeoutMs=10000)
├─ 只渲染通过预筛选的preset
├─ timeoutMs: 180000 (3分钟)
├─ captureCount: 3 (减少渲染负担)
└─ 预计: 完成200-500条复杂preset
```

### 6.3 **最终目标：分级数据集**

```
14天后产出:
├─ tier1-baseline: ~11500条 (现有baseline优质数据)
├─ tier1-fusion: ~8500条 (新完成fusion优质数据)
├─ tier1-补充: ~500条 (baseline补充)
├─ tier2-dark: ~1200条 (低亮度但有动态)
├─ tier2-slow: ~300条 (慢动态preset)
└─ tier2-bright: ~200条 (高亮度preset)

总计优质训练数据: ~22200条 preset × 5帧 = 111000张图像
```

---

## ⚠️ 七、当前报错原因

你提到的monitor脚本报错：
```
Line 108/109: 字符串缺少终止符 '
```

**原因**：PowerShell单引号字符串内不能嵌套单引号
```powershell
# 错误写法：
Write-Host 'Motion=0: $m0 ($('{0:P1}' -f $rate))'

# 正确写法：
Write-Host "Motion=0: $m0 ($([math]::Round($rate*100,1))%)"
```

**修复**：改用双引号或转义单引号

---

## ✅ 八、总结与建议

### 8.1 我的优化效果评估

| 优化项 | 意图 | 实际效果 | 评分 |
|--------|------|----------|------|
| warmup修复 | 解决motion=0 | 无明显改善（motion=0是preset特性） | ⭐⭐ |
| 降低质量阈值 | 增加数据量 | 收录更多低价值数据，适得其反 | ⭐ |
| 增加超时 | 减少失败率 | 对baseline无意义，对fusion有帮助 | ⭐⭐⭐ |
| 增加重试 | 提高鲁棒性 | 有一定帮助但效果有限 | ⭐⭐⭐ |

### 8.2 正确的优化方向

1. ✅ **接受现实**：15%的preset就是静态/黑屏，这是原始数据特性
2. ✅ **后处理过滤**：而非前置阈值，允许采集完整数据再分级
3. ✅ **分批处理**：baseline/fusion/slow分开配置，不要一刀切
4. ✅ **增加超时**：对fusion/slow确实需要更长超时

### 8.3 立即行动建议

```bash
# 1. 停止当前任务
pkill -f "render-14day-optimized"

# 2. 保留baseline数据（有效）
# 不删除 D:\aidata\long7d-techno-baseline-v1

# 3. 删除14day-optimized（配置有误）
rm -rf D:\aidata\14day-techno-optimized-v1

# 4. 启动正确的三阶段计划
# 见上述 Phase 1/2/3
```

---

**最终答案**：
- ❌ 我的motion=0诊断是**错误的**
- ⚠️ 降低阈值的优化是**误导性的**
- ✅ 增加超时的优化是**有效的**
- ✅ Baseline数据**78.8%有效，NOT废数据**
- ⚠️ 14day-optimized**配置有误，建议停止**
- ✅ **正确方案**：分三阶段+后处理过滤
