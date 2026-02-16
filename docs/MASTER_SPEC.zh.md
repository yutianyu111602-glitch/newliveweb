# newliveweb MASTER_SPEC（SSOT）

> 本文档是全项目唯一真相源（SSOT）。  
> 任何"跑法/命令/路径/门禁规则"不得在其他文档复制粘贴，只能链接到本文对应章节。

## 0. 读者导航
- 我只想跑项目：看 [2. 快速开始](#2-快速开始) / [4. 门禁与验证](#4-门禁与验证)
- 我只想跑 coupled pipeline：看 [5. coupled quality pipeline](#5-coupled-quality-pipeline)
- 我只想改 runtime 选择逻辑：看 [6. runtime 选择逻辑](#6-runtime-选择逻辑)
- 我只想训练产出 JSON：看 [7. 离线训练产出规范](#7-离线训练产出规范)

## 1. SSOT 硬规则

### 1.1 文档唯一入口与冲突处理
- 所有文档如果包含命令/跑法，必须链接到本 SSOT 的章节
- 发现重复跑法：标记为 CONFLICT → 修复或 DEPRECATED

### 1.2 计划类文档唯一入口规则
- **只允许** `docs/PLAN_CURRENT.md` 代表当前计划
- 其他计划一律归档到 `docs/_archive/`
- `PLAN_CURRENT.md` 必须包含：目标、里程碑、最后验证日期、门禁命令

### 1.3 运行/验证命令引用规则
- 禁止散落命令
- 任何 verify / pipeline / dev server / build 命令只在 SSOT 维护

## 2. 快速开始（最短路径）

### 2.1 环境断言
```bash
node -v  # >= 18
npm -v   # >= 9
```

### 2.2 启动 dev
```bash
npm run dev
# 访问 http://localhost:5173
```

### 2.3 运行验证
- [verify:dev](#41-verifydev) - 开发验证
- [verify:check](#42-verifycheck) - 严格门禁

### 2.4 常见失败处理
见 [8. 故障处理与排障速查](#8-故障处理与排障速查)

## 3. 项目目录与数据域

### 3.1 Runtime 域
- 路径：`public/presets/<pack>/`
- 产物：`pairs-manifest.v0.json` + `pairs-quality.v0.json`
- 禁止：运行时加载模型，只消费 JSON

### 3.2 训练域（炼丹域）
- 路径：`D:\aidata`（Windows）
- **严禁递归扫描**
- 只允许明确单路径操作

### 3.3 Artifacts 域
- 路径：`artifacts/`
- 子目录：
  - `coupled-eval/<timestamp>/` - eval 证据
  - `backups/` - 文档迁移备份

## 4. 门禁与验证（唯一跑法）

### 4.1 verify:dev
```bash
npm run verify:dev
```
- 输出证据：`artifacts/verify-dev/latest/`
- 通过标准：exit code 0 + 无 ERROR 日志

### 4.2 verify:check
```bash
npm run verify:check
```
- 差异：更严格的门禁项
- 常见失败：
  - WebGL SwiftShader 回退
  - audioRms = 0
  - 缺失 quality JSON

### 4.3 headless / GPU / SwiftShader 判定
检查 `meta.json`:
```json
{
  "runtime": {
    "webgl": {
      "renderer": "ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)"
    }
  }
}
```
- ✅ 期望：包含 "D3D11" 或 "RTX"
- ❌ 拒绝："SwiftShader"（CPU 回退）

## 5. coupled quality pipeline

### 5.1 入口脚本
```powershell
.\scripts\run-coupled-quality-overnight.ps1 -TargetCoverage 0.95
```

### 5.2 证据链
1. **eval** → `artifacts/coupled-eval/<stamp>/eval.jsonl`
2. **train** → `public/presets/<pack>/pairs-quality.v0.json`
3. **verify** → exit code 0

### 5.3 关键门禁
- `min-quality-std` 过滤
- `TargetCoverage` 达标
- `audioRms > 0`（非静音）

## 6. runtime 选择逻辑

### 6.1 关键文件索引
| 文件 | 职责 |
|------|------|
| `src/app/bootstrap.ts` | URL 开关、verify hooks、选择日志 |
| `src/features/presets/coupledPairsLoader.ts` | 质量 JSON 加载 |
| `src/features/presets/coupledPairsStore.ts` | 数据 schema |
| `src/features/presets/presetQuality.ts` | 质量计算逻辑 |
| `src/audio/AudioBus.ts` | 音频管线与活性检测 |

### 6.2 消费格式
```typescript
// pairs-quality.v0.json
{
  "pairs": [{
    "fg": "...",
    "bg": "...",
    "quality": { "overall": 0.85, ... }
  }]
}
```

## 7. 离线训练产出规范

### 7.1 Schema 定义
- `pairs-quality.v0.json` - 质量评分
- `pairs-manifest.v0.json` - 文件清单

### 7.2 产物落点
```
public/presets/<pack>/
├── pairs-manifest.v0.json
├── pairs-quality.v0.json
├── foregrounds/
└── backgrounds/
```

### 7.3 版本规则
- v0 = 当前版本
-  Breaking change → v1

## 8. 故障处理与排障速查

### 8.1 verify 失败
1. 查看 `artifacts/verify-dev/latest/verify.log`
2. 检查 `meta.json` 中 `webgl.renderer`
3. 确认 `pairs-quality.v0.json` 存在

### 8.2 headless 音频/SwiftShader
```powershell
# 清理僵尸进程
.\scripts\kill-stale-headless-browsers.ps1

# 重新运行（ headed 模式更可靠）
npm run verify:dev
```

### 8.3 std 过小/信号塌缩
- 检查训练数据分布
- 调整 `min-quality-std` 阈值

### 8.4 文件缺失/missingFiles
- 确认 `sync-presets` 已执行
- 检查 `public/presets/` 目录完整性

## 9. 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-02-17 | 初版 SSOT 建立 |

---

**维护原则**：本文档随代码变更更新，任何规则变化必须同步记录在第 9 章。


---

## Deprecated Targets

> 说明：以下锚点是"弃用文档"的稳定替代入口。锚点字符串一旦发布，永不改名（内容可更新/重写）。

### <a id="deprecated-targets"></a> deprecated-targets

- root-migration 汇总：[#deprecated-root-migration-audit](#deprecated-root-migration-audit)
- 优化完成汇总：[#deprecated-optimization-complete](#deprecated-optimization-complete)

### <a id="deprecated-root-migration-audit"></a> deprecated-root-migration-audit

用于替代：
- root-migration 审计/迁移/实施的旧报告、旧清单、旧白皮书、旧 runbook（以及 local 临时执行记录）。
- 若需要进一步拆分，可在本节下新增子锚点，但保留本锚点作为总入口。

**现行事实（命令/门禁/证据链）**：
- verify:dev / verify:check：见 [SSOT 第 4 章](#4-门禁与验证)
- coupled pipeline：见 [SSOT 第 5 章](#5-coupled-quality-pipeline)
- runtime 关键文件：见 [SSOT 第 6 章](#6-runtime-选择逻辑)

### <a id="deprecated-optimization-complete"></a> deprecated-optimization-complete

用于替代：
- CODE_CONFLICT / OPTIMIZATION 相关旧报告与完成总结。

**现行事实**：
- 优化结论与实现：见 [SSOT 第 5 章](#5-coupled-quality-pipeline)
- 冲突解决记录：保留在 git history (`git log --grep="CONFLICT"`)
