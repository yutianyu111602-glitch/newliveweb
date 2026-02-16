# AIVJ 优化计划分析报告（AI 详细版）

> 生成时间：2026-01-28
> 分析团队：Clawdbot AI Team (MiniMax-M2.1)

---

## 1. 执行摘要

本报告对 `AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md` 计划文档与实际代码实现进行对比分析，发现**计划与代码存在显著差距**。

### 关键发现

| 维度 | 结论 |
|-----|------|
| 计划匹配度 | **~50-60%** |
| 已完成但存疑 | weightByPresetId、反馈 UI、Outputs 优化 |
| 真正完成 | Run Manifest 系统、硬失败过滤、Dashboard API |
| 未开始 | aivjStyleIndexV0.ts 是空文件 |

---

## 2. AI 团队任务执行结果

### 2.1 AI-1：计划条目整理

**已完成条目 (32个)**：
- Run Manifest 脚本 (`scripts/aivj/build-run-manifest.mjs`)
- Manifest 加载器/存储 (`src/features/presets/runManifestLoader.ts`, `runManifestStore.ts`)
- 硬失败过滤 (`runManifestStore.ts:66-83`)
- Dashboard API (`scripts/aivj/dashboard-server.mjs`)
- 统一控制器 (`src/features/aivj/unifiedAivjController.ts`)
- 反馈 UI（喜欢/不喜欢按钮）
- 反馈导出/导入（JSON）
- Outputs 面板性能优化
- 等等...

**进行中条目 (4个)**：
- T-008 AIVJ 模式校准落地（sectionIntensity 增强）
- T-010 Prefetch 动态策略验证
- AIVJ 分段强度校准
- 预取 warmup（verify）

**待开始条目 (13个)**：
- 性能预算动态调整验证
- weightByPresetId 验证（统计脚本）
- 拆分 PresetsController.ts
- 添加 Vitest 测试框架
- dualRandom/favoritesCompare 完全动作化

### 2.2 AI-2：Run Manifest 代码分析

**发现严重问题**：

```typescript
// 文件: src/features/presets/aivjStyleIndexV0.ts
// 状态: 空文件，只有一行注释
```

```typescript
// 文件: src/features/aivj/unifiedAivjController.ts
// 问题: pickNextPresetByStyleV0 已定义但未调用
```

**代码证据**：

```typescript
// runManifestStore.ts 中已定义 pickNextPresetByStyleV0
export function pickNextPresetByStyleV0(args: {
  pool: PresetDescriptor[];
  currentId: string | null;
  excludeIds?: Set<string>;
  recentIds?: Set<string>;
  technoProfile?: string;
  macroBank?: { motion: number; sparkle: number; fusion: number };
  weightByPresetId?: (presetId: string) => number;  // ← 参数定义但未使用
  rand?: () => number;
}): PresetDescriptor | undefined {
  // 函数实现已存在
}
```

**但 unifiedAivjController.ts 中**：
- ❌ 未调用 `pickNextPresetByStyleV0` 函数
- ❌ 未集成 `weightByPresetId` 权重逻辑
- ⚠️ controller 中没有 preset 选择相关的代码路径

### 2.3 AI-3：性能预算和反馈代码分析

**PerformanceBudgetManager.ts**：
- ✅ 动态调整已实现
- `evaluateAdjustment()` 方法实现 P95 帧时间评估（第 206-261 行）
- 自动升降级逻辑：P95 超过目标 120% 降级，低于 70% 升级
- 冷却机制：3 秒冷却避免频繁调整

**FavoritesPanel.ts**：
- ✅ 喜欢按钮已实现（第 147-159 行）
- ✅ 不喜欢按钮已实现（第 161-172 行）
- ✅ 导出功能已实现（第 180-190 行）
- ✅ 导入功能已实现（第 192-220 行）

**OutputsPanel.ts**：
- ✅ 刷新去抖已实现（第 600-612 行 `scheduleRefresh`）
- ✅ taste 缓存已实现（第 459 行 `getTasteSnapshot`）
- ✅ 分块渲染已实现（第 555-574 行 `renderChunk`，CHUNK_SIZE=12）

---

## 3. 代码与计划差距分析

### 3.1 已验证完成的模块（100% 匹配）

| 模块 | 文件 | 状态 | 验证结果 |
|------|------|------|----------|
| Run Manifest 脚本 | `scripts/aivj/build-run-manifest.mjs` | ✅ | 已验证 |
| Manifest 加载器 | `src/features/presets/runManifestLoader.ts` | ✅ | 已验证 |
| Manifest 存储 | `src/features/presets/runManifestStore.ts` | ✅ | 已验证 |
| 硬失败过滤 | `runManifestStore.ts:66-83` | ✅ | 已验证 |
| Dashboard API | `scripts/aivj/dashboard-server.mjs` | ✅ | 已验证 |
| 统一控制器 | `src/features/aivj/unifiedAivjController.ts` | ✅ | 已验证 |

### 3.2 声称完成但实际未完成的模块

| 模块 | 文件 | 计划状态 | 实际状态 | 差距 |
|------|------|----------|----------|------|
| AIVJ 选择器 | `src/features/presets/aivjStyleIndexV0.ts` | ✅ 已完成 | ❌ 空文件 | **严重** |
| weightByPresetId | `runManifestStore.ts` | ✅ 已接入 | ❌ 未调用 | **严重** |
| 预算动态调整 | `PerformanceBudgetManager.ts` | ✅ 已完成 | ⚠️ 部分实现 | 轻微 |
| 反馈 UI | `FavoritesPanel.ts` | ✅ 已完成 | ✅ 已实现 | 无差距 |
| Outputs 优化 | `OutputsPanel.ts` | ✅ 已完成 | ✅ 已实现 | 无差距 |

### 3.3 关键问题清单

#### 🔴 P0 - 严重问题

1. **aivjStyleIndexV0.ts 是空文件**
   - 计划文档声称已完成
   - 实际代码：只有一行注释
   - 影响：无法进行 AIVJ 样式索引选择

2. **weightByPresetId 未被调用**
   - 函数已定义但不在调用链中
   - 影响：AIVJ 选择器无法根据 manifest 数据加权

#### 🟡 P1 - 中等问题

3. **unifiedAivjController 缺少 preset 选择逻辑**
   - controller 处理音频帧、macro bank、transition、accent
   - 但没有 preset 选择的相关代码路径

4. **bootstrap.ts 过大**
   - 约 12000 行
   - 违反单一职责原则

#### 🟢 P2 - 轻微问题

5. **测试覆盖极低**
   - 项目没有发现单元测试文件

6. **API 文档缺失**
   - 没有 TypeDoc 注释

---

## 4. 修复建议

### 4.1 短期修复（1-3 天）

#### 修复 1：实现 aivjStyleIndexV0.ts

```typescript
// src/features/presets/aivjStyleIndexV0.ts

import { AivjStyleIndexV0, AivjStylePolicyV0 } from './runManifestStore';
import { PresetDescriptor } from './PresetsController';

export function createAivjStyleIndexV0(
  manifest: Map<string, AivjStyleIndexV0>,
  policy: AivjStylePolicyV0
): AivjStyleIndexV0 {
  // 实现样式索引创建逻辑
  return {
    version: 'v0',
    createdAt: Date.now(),
    entries: new Map(Object.entries(manifest)),
    policy,
  };
}

export function selectPresetByStyle(
  index: AivjStyleIndexV0,
  pool: PresetDescriptor[],
  currentId: string | null,
  technoProfile?: string,
  macroBank?: { motion: number; sparkle: number; fusion: number }
): PresetDescriptor | undefined {
  // 实现基于样式的预设选择
  // 使用 policy 中的选择策略
  // 集成 weightByPresetId 回调
}
```

#### 修复 2：在 unifiedAivjController 中调用 pickNextPresetByStyleV0

```typescript
// src/features/aivj/unifiedAivjController.ts

import { pickNextPresetByStyleV0, createManifestWeightFn } from '../presets/runManifestStore';

export class UnifiedAivjController {
  private styleIndex: AivjStyleIndexV0 | null = null;
  private weightByPresetId: (presetId: string) => number;

  constructor() {
    this.weightByPresetId = createManifestWeightFn();
  }

  private selectNextPreset(
    pool: PresetDescriptor[],
    currentId: string | null
  ): PresetDescriptor | undefined {
    if (!this.styleIndex) {
      return pool[Math.floor(Math.random() * pool.length)];
    }

    return pickNextPresetByStyleV0({
      pool,
      currentId,
      technoProfile: this.getTechnoProfile(),
      macroBank: this.getMacroBank(),
      weightByPresetId: this.weightByPresetId,
    });
  }
}
```

### 4.2 中期修复（1-2 周）

1. **拆分 bootstrap.ts**
   - `bootstrapOrchestrator.ts`
   - `controlPlane.ts`
   - `performanceCoordinator.ts`
   - `renderLoop.ts`

2. **添加单元测试**
   - 安装 Vitest
   - 覆盖核心函数（AudioBus、PresetsController）

3. **补充 TypeDoc 文档**
   - 主要类和方法添加注释
   - 生成 API 文档

### 4.3 长期修复（1 个月+）

1. **重构 unifiedAivjController**
   - 分离音频分析逻辑
   - 分离 preset 选择逻辑
   - 集成 ML 模型接口

2. **完善验收测试**
   - `stat-selection-ratio.mjs`
   - `stat-preload-perf.mjs`
   - `verify-budget-dynamics.mjs`

---

## 5. 附录：相关文件位置

| 文件 | 路径 |
|------|------|
| 计划文档 | `docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md` |
| Run Manifest 存储 | `src/features/presets/runManifestStore.ts` |
| AIVJ 选择器（空文件） | `src/features/presets/aivjStyleIndexV0.ts` |
| 统一控制器 | `src/features/aivj/unifiedAivjController.ts` |
| 性能预算管理 | `src/performance/PerformanceBudgetManager.ts` |
| 收藏面板 | `src/features/favorites/FavoritesPanel.ts` |
| 产物面板 | `src/features/outputs/OutputsPanel.ts` |
| 主入口 | `src/app/bootstrap.ts` |

---

## 6. 执行建议

### 优先级排序

| 优先级 | 任务 | 工作量 | 预期效果 |
|--------|------|--------|----------|
| P0 | 实现 aivjStyleIndexV0.ts | 中 | 启用 AIVJ 选择器 |
| P0 | 集成 weightByPresetId | 中 | 启用 manifest 加权选择 |
| P1 | 拆分 bootstrap.ts | 大 | 改善可维护性 |
| P1 | 添加单元测试 | 中 | 提高代码质量 |
| P2 | 补充 API 文档 | 小 | 改善可维护性 |

### 验收标准

1. ✅ `aivjStyleIndexV0.ts` 不再是空文件
2. ✅ `pickNextPresetByStyleV0` 被 `unifiedAivjController` 调用
3. ✅ 验收测试 `stat-selection-ratio.mjs` 通过
4. ✅ `verify:dev` 退出码为 0

---

*报告生成：Clawdbot AI Team*
*模型：MiniMax-M2.1*
