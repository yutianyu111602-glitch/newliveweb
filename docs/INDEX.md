# newliveweb 文档索引

> **核心原则**：所有命令、门禁、证据链，最终只以 [SSOT](./MASTER_SPEC.zh.md) 为准。任何散落命令视为冲突源，必须迁移入 SSOT 并在原处 DEPRECATED。

## 🚀 我要开始干活

| 目标 | 入口 |
|------|------|
| 查看当前计划与里程碑 | [PLAN_CURRENT.md](./PLAN_CURRENT.md) |
| 了解项目架构与硬规则 | [MASTER_SPEC.zh.md](./MASTER_SPEC.zh.md) |
| 快速启动开发环境 | [MASTER_SPEC 第2章](./MASTER_SPEC.zh.md#2-快速开始) |

## 🔧 我要运行验证/门禁

| 场景 | 命令 | 文档 |
|------|------|------|
| 开发环境快速检查 | `npm run verify:dev` | [SSOT 4.1](./MASTER_SPEC.zh.md#41-verifydev) |
| CI/CD 严格门禁 | `npm run verify:check` | [SSOT 4.2](./MASTER_SPEC.zh.md#42-verifycheck) |
| 离线质量评估 | `node scripts/headless-eval-coupled-pairs.mjs` | [SSOT 锚点](./MASTER_SPEC.zh.md#deprecated-root-migration-audit) |
| 一键过夜流程 | `.\scripts\run-coupled-quality-overnight.ps1` | [SSOT 锚点](./MASTER_SPEC.zh.md#deprecated-root-migration-audit) |

## 🐛 我遇到了问题

| 症状 | 排查入口 |
|------|----------|
| WebGL/GPU 相关 | [SSOT 4.3](./MASTER_SPEC.zh.md#43-headless--gpu--swiftshader-判定) |
| 音频无信号 (audioRms=0) | [SSOT 8.2](./MASTER_SPEC.zh.md#82-headless-音频swiftshader) |
| verify 失败 | [SSOT 8.1](./MASTER_SPEC.zh.md#81-verify-失败) |
| 训练/评估失败 | [SSOT 锚点排障](./MASTER_SPEC.zh.md#deprecated-root-migration-audit) |

## 📋 我是开发者

| 我要改什么 | 关键文件 | SSOT 章节 |
|-----------|----------|-----------|
| URL 开关/verify hooks | `src/app/bootstrap.ts` | [SSOT 6.1](./MASTER_SPEC.zh.md#61-runtime-选择逻辑) |
| 质量 JSON 加载 | `src/features/presets/coupledPairsLoader.ts` | [SSOT 6.1](./MASTER_SPEC.zh.md#61-runtime-选择逻辑) |
| 数据 schema | `src/features/presets/coupledPairsStore.ts` | [SSOT 6.1](./MASTER_SPEC.zh.md#61-runtime-选择逻辑) |
| 质量计算 | `src/features/presets/presetQuality.ts` | [SSOT 6.1](./MASTER_SPEC.zh.md#61-runtime-选择逻辑) |
| 音频管线 | `src/audio/AudioBus.ts` | [SSOT 6.1](./MASTER_SPEC.zh.md#61-runtime-选择逻辑) |

## ⚠️ 我打开了一个旧文档

如果你看到的文档顶部有类似这样的标记：

```markdown
<!-- DEPRECATED: status=MERGE -->
<!-- replacement: docs/MASTER_SPEC.zh.md#deprecated-... -->
```

**说明本文档已过时**，请直接点击 `replacement` 链接查看最新规范。

## 📚 文档分类地图

### 核心文档（KEEP）
- `MASTER_SPEC.zh.md` - SSOT 单一真相源
- `PLAN_CURRENT.md` - 当前计划唯一入口

### 参考文档
- `docs/reference/` - 架构、设计、工具参考
- `docs/runbooks/` - 操作手册（部分已 DEPRECATED，见 SSOT 锚点）
- `docs/reports/` - 历史报告（部分已 DEPRECATED）

### 已归档
- 标记为 DEPRECATED 的文档保留在原位置，但内容已冻结
- 替代内容见 SSOT 对应锚点

---

**维护**：本文档随 SSOT 更新，最后同步：2026-02-17
