# AIVJ 验证报告（2026-01-29）

## 目标
- 验证 selector/预算/budget gating 是否按规范输出

## 输入
- run-manifest 路径：public/run-manifest.json
- run-manifest 生成脚本：scripts/aivj/build-run-manifest.mjs（index: D:\\aidata\\long7d-techno-fusion-v4-strict\\frames-index.jsonl）
- selector 版本：未记录（建议补充：当前启用的 AIVJ selector / style index 版本号与 commit）
- budget 配置：未记录（建议补充：PerformanceBudgetManager 当前 level/阈值与 verify-budget-dynamics 输出）

## 关键指标
- 选择成功率（基于 selection log 与 run-manifest）：
	- uniqueSelected=9
	- uniqueMatched=6
	- matchRatio=0.667
	- matchedWithExpectedPrefix(run3-crashsafe-15000-*)=6
- budget 超限次数：待补（建议来源：verify:dev 的 perfCaps + scripts/aivj/verify-budget-dynamics.mjs）
- 失败原因 TopN（来自 run-manifest）：quality-filter(838)、luma<0.02(613)、motion<0.01(407)、probe-timeout>140000ms(260)、luma>0.95(213)、empty(4)
- 质量门槛统计（ok 样本）：
	- avgLuma：mean=0.358，p10=0.072，p50=0.309，p90=0.755（n=12598）
	- motion：mean=0.141，p10=0.052，p50=0.134，p90=0.239（n=12598）

## 现有证据
- run3-crashsafe-15000 质量报告：artifacts/presets/run3-crashsafe-15000/quality-report.json
- style index/policy：public/presets/run3-crashsafe-15000/aivj-style-index.v0.json、aivj-style-policy.v0.json
- run-manifest：public/run-manifest.json
- run-manifest 分析（本次生成）：artifacts/run-manifest.analysis.2026-01-29.json

## 结论
- 结论：run-manifest 已存在且可统计；selection log 与 run-manifest 的匹配率达 0.667，并且包含足量 run3-crashsafe-15000 前缀 ID。
- 风险：当前 selection log 内仍包含内置/非 run-manifest 的 presetId（如 default / martin-liquid-gold / geiss-starfish-1），需要确认这是“预期回退”还是“选择源未强制”。
- 下一步：
	- 固化 selector 版本信息（写入 verify 报告：style index 版本、presetLibrarySource、runManifestUrl）。
	- 补齐 budget 动态输出（verify-budget-dynamics + verify:dev 的 perfCaps 产物）。
