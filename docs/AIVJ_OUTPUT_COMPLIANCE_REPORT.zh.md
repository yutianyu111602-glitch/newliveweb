# 炼丹产物达标/未达标总结报告（2026-01-27）

## 结论摘要
- **Phase1：未达标**（实际 20,340 / 预期 28,900）
- **Phase2：未达标**（实际 16,312 / 预期 75,000）
- **Phase2b：未达标**（实际 9,131 / 预期 75,000）
- **Phase3：超额达标**（实际 29,892 / 预期 4,041）

> 统计口径：以各目录中的 frames-index.jsonl 行数作为“产物帧数”。

---

## 依据与数据来源
- 计划预期来源：[scripts/aivj/PLAN_14DAY_TECHNO.zh.md](scripts/aivj/PLAN_14DAY_TECHNO.zh.md)
- 实际产物目录（D:\aidata）：
  - Phase1: [aidata/phase1-baseline-supplement-v4-strict/frames-index.jsonl](aidata/phase1-baseline-supplement-v4-strict/frames-index.jsonl), [aidata/phase1-baseline-supplement-v4-dark/frames-index.jsonl](aidata/phase1-baseline-supplement-v4-dark/frames-index.jsonl)
  - Phase2: [aidata/long7d-techno-fusion-v4-strict/frames-index.jsonl](aidata/long7d-techno-fusion-v4-strict/frames-index.jsonl), [aidata/long7d-techno-fusion-v4-dark/frames-index.jsonl](aidata/long7d-techno-fusion-v4-dark/frames-index.jsonl)
  - Phase2b: [aidata/long7d-techno-fusion-v4-relaxed/frames-index.jsonl](aidata/long7d-techno-fusion-v4-relaxed/frames-index.jsonl), [aidata/long7d-techno-fusion-v4-relaxed-dark/frames-index.jsonl](aidata/long7d-techno-fusion-v4-relaxed-dark/frames-index.jsonl)
  - Phase3: [aidata/phase3-slow-curated-v4-strict/frames-index.jsonl](aidata/phase3-slow-curated-v4-strict/frames-index.jsonl), [aidata/phase3-slow-curated-v4-dark/frames-index.jsonl](aidata/phase3-slow-curated-v4-dark/frames-index.jsonl)

---

## 分阶段对比表（产物帧数）

| Phase | Tier1 | Tier2 | 实际合计 | 计划预期 | 达标结论 |
|---|---:|---:|---:|---:|---|
| Phase1 | 10,731 | 9,609 | 20,340 | 28,900 | 未达标 |
| Phase2 | 14,589 | 1,723 | 16,312 | 75,000 | 未达标 |
| Phase2b | 8,803 | 328 | 9,131 | 75,000 | 未达标 |
| Phase3 | 20,265 | 9,627 | 29,892 | 4,041 | **超额达标** |

---

## 产物对 projectM 的价值与帮助
这些产物本质上是 **projectM 渲染训练/评估样本集**，带来如下帮助：

1. **提升渲染稳定性与鲁棒性**
   - 覆盖更多 preset 组合与渲染路径，减少黑帧、花屏、崩溃等问题。

2. **强化对复杂/慢速 shader 的适配能力**
   - Phase3 的 slow presets 输出显著超额，强化了对高编译复杂度 preset 的覆盖，有助于提升 projectM 对“极端 preset”的兼容性与质量表现。

3. **提高质量筛选与自动化 QA 精度**
   - Tier1/Tier2 双桶结构让“严格合格样本”和“暗场/弱激励样本”可被区分，利于训练与评测中建立更准确的质量标准。

4. **优化音频驱动参数与视觉响应一致性**
   - 丰富样本让你更容易找出 audio-reactive 参数的最佳区间，减少“音乐驱动不足导致画面静止/发黑”的情况。

5. **支撑后续模型训练/检索/聚类**
   - 产物可用于构建检索数据库、聚类相似风格、训练推荐/排序模型，加速 preset 质量分层与自动筛选流程。

---

## 结论与建议（简短）
- **Phase1/2/2b 未达标**：建议补产或复核对应目录是否存在未计入的额外产物。
- **Phase3 超额达标**：说明慢 preset 产出已非常充足，可作为高价值样本优先用于训练与验证。

---

## 与网页优化/稳定性联动的行动项（建议）
1. **优先保障网页端“硬失败隔离”可立即受益**
   - 将 Phase1/2/2b 中已知失败/崩溃 preset 的原因固化到 run-manifest，并在网页端自动跳过（避免自动轮播反复踩坑）。
   - 对应计划：docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md（稳定性隔离与回退、产物浏览面板）。

2. **补产策略：先补“缺口最大的阶段”，再补“最有训练价值的桶”**
   - Phase2 / Phase2b 缺口最大：优先补齐 Tier1（strict）样本，再补 Tier2（dark）。
   - Phase1 作为基线补产：补齐到计划下限即可，避免挤占 Phase2 的算力预算。

3. **Phase3 作为“极端慢 shader”稳定性回归集**
   - 既然已超额，可把 Phase3 视为高价值 regression 产物，用于：
     - projectM 兼容性回归（崩溃/黑屏/花屏）
     - 质量阈值/过滤规则的校准（avgLuma/motion 等）

4. **复核统计口径（避免“漏计导致误判未达标”）**
   - 检查是否存在：多份 frames-index.jsonl、分片输出、或目录迁移导致的未纳入统计。
   - 若后续改用 run-manifest.json 的 counts 汇总，可作为第二口径交叉验证。

---

## 网页端联动进度（落地项）
- DiagnosticsPanel 已显示当前 preset 的 run-manifest 指标（status/tier/avgLuma/motion/reasons），用于快速解释“为何跳过/降权”。
- run-manifest 拉取具备自动重试/退避（指数 backoff + jitter），网络抖动时尽量不清空旧索引。

> 如需，我可以继续生成：
> - Phase1/2/2b 补产建议方案
> - 产物清洗/去重/训练清单导出
> - 面向 projectM 的训练收益评估清单
