# 新旧代码优化计划

## 问题诊断

### 1. AudioBus 双实现冲突
**问题**: `AudioBus.ts` 和 `AudioBusOptimized.ts` 几乎完全相同（95%代码重复）
- AudioBus: 自研 DFT 分析
- AudioBusOptimized: 增加了 Meyda FFT 分析
- 维护困难，容易出 bug

**解决方案**: 合并两个类，将 Meyda 作为可选功能添加到 AudioBus

### 2. Bandit 双系统数据隔离
**问题**: 
- `aivjBanditV0.ts`: 基于 EMA，使用键 `newliveweb:aivj:bandit:v0`
- `banditRecommender.ts`: 基于 Thompson Sampling，使用键 `newliveweb:bandit:v0`
- 数据不互通，用户体验不一致

**解决方案**: 
- 保持两个系统（用途不同）
- 添加数据同步机制
- 在 UI 层统一展示

### 3. 反馈系统分散
**问题**:
- `feedbackStore.ts`: 喜欢/不喜欢
- `presetTasteStore.ts`: 跳过/黑名单
- `UserAnalyticsCollector`: 全面分析（内存中）
- 数据分散，难以统一分析

**解决方案**: 
- 保持存储分离（避免迁移成本）
- 添加统一导出/分析接口

### 4. 新功能未集成
**问题**:
- `BanditRecommender`: 导出但未在 bootstrap.ts 使用
- `ReactivePresetSwitcher`: 导出但未集成到音频流
- `SimilarPresetSearch`: 只有 SimilarPresetPanel 使用
- `PerformanceMonitor`: 导出但未启用

**解决方案**: 在 bootstrap.ts 中添加特性开关控制的新功能集成

### 5. 缺少 Preset-Cluster 映射
**问题**: Bandit 使用 clusterId，但系统使用 presetId，缺少映射函数

**解决方案**: 添加映射函数和工具

---

## 优化执行清单

### Phase 1: 合并 AudioBus
- [ ] 将 Meyda 功能迁移到 AudioBus
- [ ] 添加特性开关 `useMeydaAnalysis`
- [ ] 删除 AudioBusOptimized
- [ ] 更新测试

### Phase 2: 整合 Bandit 系统
- [ ] 添加 Bandit 数据导出/导入接口
- [ ] 创建统一反馈收集器
- [ ] 在 bootstrap.ts 中集成 BanditRecommender

### Phase 3: 集成新功能
- [ ] 在 bootstrap.ts 中添加特性开关检查
- [ ] 集成 ReactivePresetSwitcher
- [ ] 集成 PerformanceMonitor
- [ ] 添加预设-簇映射函数

### Phase 4: 统一反馈系统
- [ ] 创建 FeedbackAggregator
- [ ] 统一导出接口
- [ ] 更新 UI 组件

---

## 预期收益

1. **代码维护性**: 减少 30% 重复代码
2. **用户体验**: 统一学习系统，推荐更准确
3. **性能**: 可监控和优化关键路径
4. **功能**: 自动切换等高级功能可用
