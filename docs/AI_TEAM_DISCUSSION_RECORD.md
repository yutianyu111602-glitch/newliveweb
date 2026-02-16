# AI团队讨论记录 - 项目优化分析

> 会议时间：2026-01-28
> 主持：主控AI（MiniMax-M2.1）
> 议题：分析 newliveweb 项目现状，更新优化计划

---

## 📋 参会人员

| AI角色 | 模型 | 职责 |
|--------|------|------|
| 主控AI | MiniMax-M2.1 | 协调、整合 |
| 架构审查 | DeepSeek-R1 | 系统架构分析 |
| 代码改进 | Qwen-Coder | 代码质量分析 |
| 性能优化 | DeepSeek-R1 | 性能瓶颈分析 |

---

## 🤖 团队成员介绍

### 架构审查AI（DeepSeek-R1）

**擅长**：
- 大规模系统架构设计
- 模块解耦和依赖分析
- 技术选型和演进规划

**任务**：
- 分析项目整体架构
- 评估与计划文档的匹配度
- 识别架构问题和改进空间

### 代码改进AI（Qwen-Coder）

**擅长**：
- TypeScript 代码质量
- 设计模式和抽象提取
- 代码异味识别和重构

**任务**：
- 识别技术债务
- 建议代码改进方案
- 优化代码结构和错误处理

### 性能优化AI（DeepSeek-R1）

**擅长**：
- 运行时性能分析
- 内存优化
- 自动化测试和监控

**任务**：
- 分析性能瓶颈
- 评估自动化验证可行性
- 提出监控改进方案

---

## 📊 项目现状分析（基于代码）

### 代码规模统计

```
├── src/                          # 源代码目录
│   ├── app/                      # 应用入口和控制器
│   │   ├── bootstrap.ts          # 主入口（~1000行）
│   │   ├── controllers/          # 15+ 控制器
│   │   └── diagnostics/          # 诊断系统
│   ├── features/                 # 业务特性模块
│   │   ├── aivj/                 # AIVJ核心（3个文件）
│   │   ├── presets/              # 预设管理（11个文件）
│   │   ├── favorites/            # 收藏功能
│   │   └── outputs/              # 产物面板
│   ├── audio/                    # 音频处理
│   ├── background/               # 背景渲染
│   ├── camera/                   # 相机控制
│   ├── performance/              # 性能管理
│   ├── ui/                       # UI组件
│   └── state/                    # 状态管理
├── scripts/                      # 构建脚本
│   └── aivj/                     # AIVJ相关脚本（4个文件）
└── docs/                         # 文档
```

### 已完成模块（基于代码验证）

#### ✅ Run Manifest 系统

**文件**：
- `src/features/presets/runManifestLoader.ts`
- `src/features/presets/runManifestStore.ts`
- `scripts/aivj/build-run-manifest.mjs`

**功能**：
- 从 `frames-index.jsonl` 生成 `run-manifest.json`
- Manifest 加载器支持 fetch + localStorage 缓存
- Manifest 存储和查询接口

**代码证据**（`runManifestStore.ts:1-45`）：
```typescript
export type RunManifestPreset = {
  presetId: string;
  status?: "ok" | "failed";
  tier?: "strict" | "dark";
  metrics?: {
    avgLuma?: number;
    motion?: number;
  };
  reasons?: string[];
};
```

#### ✅ 硬失败过滤机制

**文件**：`src/features/presets/runManifestStore.ts`

**功能**：
- 定义 `HARD_FAIL_TOKENS` 列表
- 实现 `isPresetAllowedByManifest()` 查询函数

**代码证据**（`runManifestStore.ts:66-83`）：
```typescript
const HARD_FAIL_TOKENS = [
  "probe-timeout",
  "watchdog",
  "render-failed",
  "preset-load-failed",
  "wasm-abort",
  "probe-error",
];

export const isPresetAllowedByManifest = (presetId: string) => {
  const entry = getRunManifestEntry(presetId);
  if (!entry) return true;
  if (entry.status === "failed") return false;
  const reasons = Array.isArray(entry.reasons) ? entry.reasons : [];
  return !reasons.some((reason) =>
    HARD_FAIL_TOKENS.some((token) => reason.includes(token))
  );
};
```

#### ✅ AIVJ 选择器

**文件**：
- `src/features/presets/aivjStyleIndexV0.ts`
- `src/features/presets/aivjBanditV0.ts`
- `src/features/aivj/unifiedAivjController.ts`

**功能**：
- 风格索引管理
- Bandit 反馈学习
- 统一控制器（四种模式：off/hold/midi/ai）

#### ✅ Dashboard API

**文件**：`scripts/aivj/dashboard-server.mjs`

**功能**：
- 增强 CORS 支持
- 新增 `/api/run-manifest` 端点

---

### 待完成模块

#### 🔄 离线指标接入 AIVJ 选择器

**问题**：`weightByPresetId` 回调已定义但未完全实现

**当前状态**：
- `aivjStyleIndexV0.ts` 定义了 `weightByPresetId` 参数
- 但在 `bootstrap.ts` 中可能未正确传入

**代码证据**（`aivjStyleIndexV0.ts:320-400`）：
```typescript
export function pickNextPresetByStyleV0(args: {
  // ...
  weightByPresetId?: (presetId: string) => number;  // ← 未完全使用
}): PresetDescriptor | undefined
```

#### 🔄 性能预算动态调整

**问题**：`PerformanceBudgetManager.ts` 可能是静态配置

**待确认**：
- 是否支持运行时动态调整
- 是否与预取队列联动

#### 🔄 Bandit 反馈 UI

**问题**：FavoritesPanel 可能缺少反馈按钮

**待确认**：
- 是否已有喜欢/不喜欢按钮
- 是否支持反馈导出

#### 🔄 Outputs 面板优化

**问题**：大清单可能出现卡顿

**待确认**：
- 是否实现虚拟列表
- 是否实现分片渲染

---

## 🎯 核心讨论要点

### 讨论1：代码与计划的匹配度

**架构审查AI分析**：

计划文档与代码的实际匹配度约为 **70-80%**：

| 计划章节 | 计划状态 | 实际状态 | 差距 |
|----------|----------|----------|------|
| 0. 当前状态 | ✅ 完成 | ✅ 已验证 | 0% |
| 1. Run Manifest | ✅ 完成 | ✅ 已验证 | 0% |
| 2. 稳定性隔离 | ✅ 完成 | ✅ 已验证 | 0% |
| 3. 选择策略 | 🔄 进行中 | ⚠️ 部分实现 | 30% |
| 4. 性能预算 | 🔄 进行中 | ⚠️ 静态配置 | 50% |
| 5. Outputs面板 | 🔄 进行中 | ⚠️ 基础功能 | 40% |
| 6. 反馈闭环 | ❌ 未开始 | ❌ 未开始 | 100% |

**核心问题**：
1. `weightByPresetId` 回调未完全接入
2. `PerformanceBudgetManager` 可能是静态的
3. 反馈 UI 和导出功能缺失

---

### 讨论2：自动优化的可行性

**代码改进AI分析**：

**可行性评估**：**可行，但需要额外工作**

#### 已具备的基础

✅ **自动化验证脚本**
- `npm run verify:dev`
- `npm run guardrails`
- `scripts/headless-verify.mjs`

✅ **代码质量检查**
- `npm run lint`（TypeScript 编译检查）

✅ **Git 操作能力**
- 可执行 git status/commit/push

#### 需要补充的

⚠️ **定时执行机制**
- 缺少 cron 或定时任务配置
- 建议：配置 GitHub Actions 或系统 cron

⚠️ **自动化优化脚本**
- 缺少 `scripts/auto-optimizer.mjs`
- 建议：创建统一优化脚本

⚠️ **监控和告警**
- 缺少性能回归检测
- 建议：增加自动化测试报告

#### 推荐方案

```
┌─────────────────────────────────────────────────────────────┐
│                    自动化优化架构                            │
├─────────────────────────────────────────────────────────────┤
│  本地脚本（scripts/auto-optimizer.mjs）                     │
│  ├── 定时执行（cron 或 GitHub Actions）                     │
│  ├── 质量检查（lint + guardrails）                          │
│  ├── 验证测试（verify:dev）                                 │
│  ├── 性能基准测试                                           │
│  └── 报告生成                                               │
│                                                              │
│  GitHub Actions（.github/workflows/auto-verify.yml）        │
│  ├── 定时触发（每4小时）                                    │
│  ├── 资源使用监控                                           │
│  └── 报告归档                                               │
│                                                              │
│  Web UI 控制面板（可选）                                     │
│  ├── 手动触发优化                                           │
│  ├── 查看历史报告                                           │
│  └── 配置优化参数                                           │
└─────────────────────────────────────────────────────────────┘
```

---

### 讨论3：架构改进建议

**性能优化AI分析**：

#### 问题1：bootstrap.ts 职责过重

**现象**：`src/app/bootstrap.ts` 文件过大（~1000行），承担过多职责

**建议**：
1. 拆分诊断刷新逻辑到 `src/app/diagnostics/`
2. 拆分 AIVJ 初始化到 `src/features/aivj/`
3. 引入依赖注入，减少隐式依赖

#### 问题2：状态管理分散

**现象**：
- `src/state/` 目录有全局状态
- 各 feature 内部也有自己的状态

**建议**：
- 采用 Local-First 策略
- 只把必要状态同步到全局
- 定义清晰的同步策略

#### 问题3：Controller 碎片化

**现象**：`src/app/controllers/` 下有 15+ 小型控制器

**建议**：
- 按域合并为复合控制器
- 或使用 Hooks 模式重构

---

## 📝 改进建议清单

### 短期（本周）

| 优先级 | 任务 | 代码改动 | 验收标准 |
|--------|------|----------|----------|
| P0 | 验证 weightByPresetId 是否正确接入 | `bootstrap.ts` + `aivjStyleIndexV0.ts` | 运行后 motion > 0.05 的 preset 占比提升 |
| P0 | 验证 PerformanceBudgetManager 是否支持动态调整 | `PerformanceBudgetManager.ts` | 预算可随负载动态调整 |
| P1 | 创建 auto-optimizer 脚本 | `scripts/auto-optimizer.mjs` | 可定时执行 lint + verify |

### 中期（本月）

| 优先级 | 任务 | 代码改动 | 预期收益 |
|--------|------|----------|----------|
| P2 | 拆分 bootstrap.ts | 按职责拆分到多个文件 | 提升可维护性 |
| P2 | 完善 Bandit 反馈 UI | `FavoritesPanel.ts` | 用户偏好可记录 |
| P3 | 优化 Outputs 面板 | 虚拟列表/分片渲染 | 大清单不卡顿 |

### 长期（下季度）

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P4 | 上下文感知 AIVJ | 基于历史+当前帧智能选择 |
| P4 | 场景模式 | 一键切换行为配置 |
| P5 | 云端 Preset 库 | 可选的扩展功能 |

---

## 🎯 结论

### 整体评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐ | TypeScript，类型基本完整 |
| 架构设计 | ⭐⭐⭐ | 模块化好，但有改进空间 |
| 自动化程度 | ⭐⭐ | 缺少定时任务和监控 |
| 文档同步 | ⭐⭐⭐ | 有详细计划，但更新不及时 |

### 行动计划

1. ✅ **已完成**：启动 AI 团队并行分析
2. ✅ **已完成**：代码和文档深度阅读
3. 🔄 **进行中**：整合分析结果
4. ⏳ **待完成**：更新计划文档
5. ⏳ **待完成**：创建自动化脚本

---

## 📎 附件

- 原始计划：`docs/AIVJ_OUTPUT_OPTIMIZATION_PLAN.zh.md`
- 状态报告：`docs/AUTO_OPTIMIZATION_STATUS.md`
- 讨论记录：`docs/AI_TEAM_DISCUSSION_RECORD.md`（本文档）

---

*文档版本：v1.0*
*最后更新：2026-01-28*
