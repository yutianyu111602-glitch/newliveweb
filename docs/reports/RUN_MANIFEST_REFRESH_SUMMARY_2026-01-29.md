# run-manifest 刷新摘要（2026-01-29）

## 输入
- run-manifest：public/run-manifest.json
- 生成脚本：scripts/aivj/build-run-manifest.mjs
	- index：D:\\aidata\\long7d-techno-fusion-v4-strict\\frames-index.jsonl
	- runName：long7d-techno-fusion-v4-strict

## 统计
- 条目（index 行数）：total=14589
- 通过/失败：ok=12598，failed=1991
- uniquePresets=13700（run-manifest 实际写入 presets[] 长度=13700）
- tier：strict=13700（tier2Ok=0）

### ok 质量分布（来自 run-manifest 统计）
- avgLuma：mean=0.358，p10=0.072，p50=0.309，p90=0.755（n=12598）
- motion：mean=0.141，p10=0.052，p50=0.134，p90=0.239（n=12598）

### ok bandClass 分布（来自 run-manifest 统计）
- balanced=10634
- mid=915
- low=536
- high=496
- flat=17

### 失败原因 Top（来自 run-manifest 统计）
- quality-filter：838
- luma<0.02：613
- motion<0.01：407
- probe-timeout>140000ms：260
- luma>0.95：213
- empty：4

## 诊断快照
- 预算指标：待补（建议用 scripts/aivj/verify-budget-dynamics.mjs 与 verify:dev 产物补齐）
- 选择分布：见 AIVJ 验证报告（本次已有 selection log 与 run-manifest 匹配统计）
- 运行时异常：run-manifest 统计中包含 4 条 empty（另有 run3-crashsafe-15000 的 quality-report 也有 empty 警告）

## 证据
- run-manifest：public/run-manifest.json
- run-manifest 分析（本次生成）：artifacts/run-manifest.analysis.2026-01-29.json
- run3-crashsafe-15000 质量报告（另一路产物）：artifacts/presets/run3-crashsafe-15000/quality-report.json
