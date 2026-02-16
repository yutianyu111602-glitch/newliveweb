# Bug 修复计划

## 问题列表

### 1. AudioBusOptimized.ts 空文件
**文件**: `src/audio/AudioBusOptimized.ts`
**状态**: 0字节，空文件
**影响**: 造成困惑，MIGRATION_GUIDE 提到但实际不存在
**修复**: 删除文件，更新 MIGRATION_GUIDE

### 2. 开源依赖不完整
**计划中的依赖**:
- ✅ Meyda - 已安装，已集成
- ⚠️ Essentia.js - 已安装，部分集成（EssentiaTransientDetector）
- ❌ FAISS - 未安装，代码中无引用
- ❌ HDBSCAN - 未安装，代码中无引用  
- ❌ Bandit.js - 使用自研实现
- ❌ CLAP - 未安装，代码中无引用

**修复策略**: 
- 删除空文件
- 更新文档说明当前状态
- 可选：安装并集成缺失的依赖

### 3. Meyda 初始化时序优化
**当前逻辑**: 
- loadFile/loadUrl/loadMediaStream 后调用 initMeydaAnalyzer
- 延迟初始化等待 AudioContext 就绪

**潜在问题**: 
- 如果 AudioContext 从未就绪，Meyda 永远不会初始化
- 但自研实现会作为回退

**修复**: 
- 添加更多状态检查
- 确保清理逻辑正确

## 执行步骤

### Step 1: 清理空文件
```bash
rm src/audio/AudioBusOptimized.ts
```

### Step 2: 验证当前集成状态
- 确认 Meyda 正常工作
- 确认回退机制有效

### Step 3: 更新文档
- 更新 MIGRATION_GUIDE
- 记录实际依赖状态

## 验证清单

- [ ] AudioBusOptimized.ts 已删除
- [ ] 编译通过
- [ ] 测试通过
- [ ] 音频功能正常
