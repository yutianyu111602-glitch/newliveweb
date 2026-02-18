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

### 1.4 文档类型标记规范（whitepaper分层权威）

> 目标：防止"参考文档被当成执行权威"，导致跑法分裂、口径漂移、数字冲突反复出现。

**文档类型（必须在文档头部显式标记其角色）**：

- **SSOT / Canonical（执行权威）**  
  - 唯一执行权威：`docs/MASTER_SPEC.zh.md`（本文件）
  - 任何脚本跑法、门禁口径、数量口径、排障入口，最终都必须能回链到 SSOT

- **Plan（计划入口）**  
  - 唯一计划入口：`docs/PLAN_CURRENT.md`
  - 其它计划类文档若存在，只能作为历史记录/草案，必须标记为非当前入口

- **Runbook（可执行操作手册）**  
  - 允许包含命令，但必须满足"硬规则 1.3"：命令后必须附 SSOT 链接（指向门禁/跑法的权威段落）
  - 允许记录"当时有效"的步骤，但需要明确版本/日期/适用范围

- **Report / Audit（事实记录与证据）**  
  - 允许保留当时观察与结论，但若出现规模/数字/口径，必须以 SSOT 的"产物口径"对齐
  - 与 SSOT 不一致必须显式标 `CONFLICT`（见 3.4.2 / 8.6）

- **Whitepaper（技术参考，不是执行权威）**  
  - 必须显式声明：**Reference, not execution authority**
  - 禁止把 whitepaper 作为"唯一跑法/最终口径"的引用目标；whitepaper 内的命令必须回链 SSOT

**whitepaper 分层权威模式（建议结构）**：
- Overview → Pipeline → Dual → 3D → Perf  
- 每一层都要写清：用途、适用范围、与 SSOT 的关系（引用/解释/背景，而非替代）

**禁止项（Hard Ban）**：
- 禁止在非 SSOT 文档中定义"唯一跑法"
- 禁止仅引用 whitepaper 作为执行依据

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

### 2.5 编程AI入口定义（人类/AI协作的唯一入口约束）

> 目标：把"怎么让编程 AI 开始干活"变成统一协议，避免在不同文档里分散下指令。

**唯一入口**：
- 编程 AI 的执行入口必须以 SSOT 为准：先读本章，再读对应章节（4/5/6/8），再执行。

**最小工作包（给编程 AI 的输入必须包含）**：
1) 目标（1 句话）
2) 作用域（文件/目录清单，禁止递归扫大目录，尤其禁止递归扫 `D:\aidata`）
3) 验收门禁（至少一个：`verify:dev` / `verify:check` / docs gate）
4) 证据产物路径（要写入哪个 `artifacts/...`）
5) 回滚策略（如何恢复）

**默认行为（必须）**：
- 任何涉及"跑法/门禁/规模/数字"的变更，必须在提交前补充 SSOT 对应段落或链接
- 对"历史文档/whitepaper"只允许做：补 SSOT 链接、标 DEPRECATED、标 CONFLICT、修编码；禁止重写为执行权威

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

### 3.4 Source Library SSOT（炼丹产物域）

**口径定义（强制）**：
- **Source Library（原矿/源库 SSOT）**：只读、可复用、不可凭记忆改数字  
  - 例：`C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025`（原矿）
- **Training Cache（可重建缓存）**：允许生成/丢弃/重建，但禁止递归扫描  
  - 例：`D:\aidata`（炼丹域）——任何统计以"明确文件路径 + 门禁脚本证据"为准

**规模/数量口径（唯一可信来源）**：
- 一切"pairs 数量/规模"以运行时可消费产物为准：
  - `public/presets/<pack>/pairs-manifest.v0.json`
  - `public/presets/<pack>/pairs-quality.v0.json`
- 文档中的数字若与产物不一致：必须标记 `CONFLICT` 并链接到 `#### 3.4.2`

> ⚠️ **数据冲突警告**: 以下旧文档包含**过时数据**，以本文为准

#### 3.4.1 实际数量（2026-02-17 验证）

| 产物类型 | 实际数量 | 路径 | 状态 |
|---------|---------|------|------|
| 3D Coupled Pairs | **~3,000 对** | `D:\aidata\ai_generated_coupled_final\` | ✅ 可用 |
| Curated Dark | 500 | `public/presets/ai-curated-dark/` | ✅ 已导入 |
| Curated Relaxed | 353 | `public/presets/ai-curated-relaxed/` | ✅ 已导入 |

#### 3.4.2 已知数据冲突清单（CONFLICT）

以下文档声称的数量**不正确**，引用时以本表为准：

| 错误文档 | 错误声称 | 实际值 | 冲突标记 |
|---------|---------|--------|---------|
| `docs/3D_AIVJ_COUPLING_SYSTEM.md` | 8,041对 | ~3,000对 | `#conflict-3d-coupled-count` |
| `docs/AIDATA_ANALYSIS_REPORT.md` | 8,040/8,041对 | ~3,000对 | `#conflict-3d-coupled-count` |
| `docs/AIDATA_COMPLETE_IMPLEMENTATION.md` | 1,000对 | ~3,000对 | `#conflict-3d-coupled-count` |

**验证方法**:
```powershell
# PowerShell
(Get-ChildItem "D:\aidata\ai_generated_coupled_final" -Filter "*.milk").Count
```

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

**headless-eval 续跑（必须优先）**：
- 支持 `--resume`：从 `eval.jsonl` 重建 visited，避免重复渲染与重复采样（优先于重跑全量）

**音频判定（避免误判）**：
- 对 `lastAudioRms` 采用"循环轮询直到稳定阈值"策略，而非单次采样；失败按 8.2/8.5 进入重启/续跑流程


<!-- BEGIN SSOT-P0:B1-4.4-pack-diversity-gate -->
### 4.4 Pack Diversity Gate（Pack 同质化门禁）

**目标**：每次演出/训练前检查 pack 多样性，避免同质化灾难。

**命令**：
```bash
# 基础诊断
npm run diag:pack -- --root "public/presets/${PACK_NAME}"

# Gate 模式（推荐）
npm run diag:pack:gate -- --root "public/presets/${PACK_NAME}" --sample 120

# 趋势分析（可选）
npm run diag:pack:trend
```

**产物**：
- artifacts/pack_diagnostics/latest.json（最新摘要）
- artifacts/pack_diagnostics/trend.md（趋势报告）
- artifacts/pack_diagnostics/advice.md（RED 时修复建议）

**门禁判定**：
- 🟢 GREEN：通过
- 🟡 YELLOW：通过但关注趋势
- 🔴 RED：阻断（不建议直接演出/训练）

**排障**：
- 耦合 pack 天生会判红 → 在 pack 根目录放 .packmeta.json 声明 metricProfile: "coupled"（使用对应 profile 解释指标）
- RED → 先读 advice.md，再决定：换 pack / 混入更动态的预设 / 调整采样范围

<!-- END SSOT-P0:B1-4.4-pack-diversity-gate -->

<!-- BEGIN SSOT-P0:B2-4.5-ssot-docs-gate -->
### 4.5 SSOT 文档链接验证（HARD RULE 5 门禁）

**目标**：任何文档变更后自动检查 SSOT 链接完整性（包含 verify 命令的文档必须带 SSOT 链接）。

**命令**：
```bash
# 手动运行
node scripts/verify-docs-ssot.mjs

# npm 入口（如已配置）
npm run verify:docs:ssot
```

**产物**：
- artifacts/ssot-gate-report.json（详细报告，含违规清单）

**门禁标准**：
- 0 HARD RULE 5 violations → PASS

**失败排查**：
- FAIL → 按报告给对应文档补上 docs/MASTER_SPEC.zh.md#锚点
- 豁免文档 → 仅允许 INDEX/PLAN_CURRENT/MASTER_SPEC（以及你显式加入 EXEMPT_SET 的文件）

<!-- END SSOT-P0:B2-4.5-ssot-docs-gate -->

## 5. coupled quality pipeline


<!-- BEGIN SSOT-P0:A-4.3.1-gpu-gate -->
#### 4.3.1 自动化 GPU 检测（SwiftShader Gate）

**目标**：在 headless/CI/本地快速判定是否回退 SwiftShader（CPU 软渲染）。

**命令**：
```bash
node scripts/check-gpu.mjs
```

**期望输出**：
```json
{ "renderer": "ANGLE (NVIDIA...)", "swiftshader": false, "status": "PASS" }
```

**门禁标准**：
- renderer 不包含 "SwiftShader"
- swiftshader=false

**失败排查**：
- 看到 SwiftShader → 优先检查：Chromium 启动参数 / 驱动 / 远程桌面环境
- 仍失败 → 切换浏览器（Chrome↔Edge）或重启系统，再跑一次检测

<!-- END SSOT-P0:A-4.3.1-gpu-gate -->

### 5.1 入口脚本
```powershell
.\scripts\run-coupled-quality-overnight.ps1 -TargetCoverage 0.95
```

**采样与训练的 P0 经验（强制默认）**：
- **shuffle 优于 random**：避免"集卡式"重复，覆盖率随时间线性增长
- **训练采样配比建议**：`elite/eval/neg = 0.25/0.25/0.50`（防 neg 淹没）
- **防废物机制（必须具备）**：
  - self-test 点击验证（确保链路真实写入）
  - pick 超时不写 null（避免污染证据链）
  - 浏览器失败自动重启（上限 20 次），并保留重启计数/日志

### 5.2 证据链
1. **eval** → `artifacts/coupled-eval/<stamp>/eval.jsonl`
2. **train** → `public/presets/<pack>/pairs-quality.v0.json`
3. **verify** → exit code 0

### 5.3 关键门禁
- `min-quality-std` 过滤
- `TargetCoverage` 达标
- `audioRms > 0`（非静音）

### 5.4 v4 hardened 默认参数（2026-02-19 固化）

> Tag: `coupled-v4-hardened-20260219` (commit `ece8020`)

**默认 coupled 运行参数**：

| 参数 | 值 |
|------|-----|
| `coupledPack` | `ai_generated_coupled_final` |
| `coupledManifest` | `pairs-manifest.filtered.current.json` |
| `motionMin` | `1e-5` |
| `lumaMin` | `0.06` |

**强制门禁**：`MANIFEST_MISMATCH` fail-fast（pair 不在 manifest → 立即抛错退出）

**入口脚本**：

| 用途 | 脚本 |
|------|------|
| 复验/smoke | `scripts/coupled-smoke-current.ps1` |
| 负测（证明 fail-fast 有效） | `scripts/coupled-negative-manifest-mismatch.ps1` |
| verify-dev（底层） | `scripts/verify-dev-coupled.ps1` |

**v4 基准结果**（360 samples, `pairs-manifest.filtered.v4.json`, 31/3000 pairs）：

| 指标 | 值 | 达标线 |
|------|-----|--------|
| okRate | **0.436** | ≥ 0.35 |
| too-dark | **0.431** | ≤ 0.45 |
| low-motion | **0.286** | ≤ 0.55 |

**夜跑接入**：在过夜脚本调用 coupled eval 前设置环境变量：

```powershell
$env:COUPLED_SMOKE_PAIRS_MANIFEST = "pairs-manifest.filtered.current.json"
$env:COUPLED_SMOKE_MOTION_MIN     = "0.00001"
$env:COUPLED_SMOKE_LUMA_MIN       = "0.06"
```

**迭代到 v5**：重新生成 keep list → 覆盖 `filtered.current.json` → 同一套 verify-dev + 负测。

## 6. runtime 选择逻辑


<!-- BEGIN SSOT-P0:C-5.4-resume -->
### 5.4 过夜训练 Resume 续跑机制

**目标**：中断后从断点恢复，不重复工作（避免重复渲染/重复采样）。

**命令**：
```bash
# 续跑（推荐）
npm run playbook:overnight -- --resume

# 冷启动（丢弃断点）
rm -f artifacts/overnight/resume.json && npm run playbook:overnight
```

**产物**：
- artifacts/overnight/resume.json（断点信息：阶段、stamp、游标/批次）
- artifacts/overnight/training.log
- public/presets/<pack>/pairs-quality.v0.json

**门禁标准**：
- resume.json 存在且时间戳 <24h：允许续跑
- 续跑后前 10 分钟不出现“重复采样/重复渲染”迹象

**失败排查**：
- 恢复失败：删除 resume.json 冷启动
- 仍重复：清空缓存/重置 shuffle 种子，再跑一次

<!-- END SSOT-P0:C-5.4-resume -->

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

### 6.3 多源参数仲裁规则（F-22/F-23，必须遵守）

> 目标：解决"多源写参数"导致的覆盖、漂移、污染 Favorites 等问题。

**三层模型（工程约束）**：
- **慢层**：`VisualStateV2`（可持久/可收藏/可回放）
- **快层**：`AudioControls` / `AIVJ`（实时响应，不得污染慢层）
- **呈现层**：最终喂给渲染与运行时的"单一输出对象"

**单 writer 原则（Hard Rule）**：
- 同一参数同一时刻只允许一个写入者  
- 最终输出必须从一个仲裁器/控制器生成，禁止分散写

**仲裁优先级建议（可执行默认）**：
- `midiLock > manualHold > merge(base + audio + aivj)`
- 任何"手动/锁定"必须压制 AIVJ 的随机与自动写入

**F-22：AIVJ 覆盖 AudioControls（覆盖冲突）**：
- 症状：AudioControls 先写 → AIVJ 后写 → AIVJ 覆盖导致"画面不跟音乐/宏被抢"
- 规则：AudioControls 与 AIVJ 必须先在仲裁器内融合，再一次性输出

**F-23：AIVJ 随机效果污染 Favorites（写回污染）**：
- 症状：runtime-only 的随机/点缀写回了 slow state，导致收藏被污染
- 规则：accent/random 层必须是 runtime-only，禁止写回 `lastVisualState` / `VisualStateV2`

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


<!-- BEGIN SSOT-P0:D-8.2.1-audio-fallback -->
#### 8.2.1 AudioRms=0 Fallback 机制（click-track）

**目标**：音频输入失效时，自动/手动切换到 click-track（如 120 BPM）保证节奏驱动不崩。

**命令**：
```bash
# 读取 diagnostics（如你有该 API）
curl http://localhost:5173/api/diagnostics | jq '.audioRms'
```

**手动启用**（UI）：Settings → Audio → fallbackBpm=120

**门禁标准**：
- audioRms=0 持续 >5s：必须进入 fallback 或明确告警
- fallback 启用后：视觉节奏可见变化（与 120BPM 对齐）

**失败排查**：
- 系统音频被占用：关闭其他独占音频应用
- fallback 无效：检查 fallbackBpm 配置是否生效（默认 120）

<!-- END SSOT-P0:D-8.2.1-audio-fallback -->

### 8.3 std 过小/信号塌缩
- 检查训练数据分布
- 调整 `min-quality-std` 阈值

### 8.4 文件缺失/missingFiles
- 确认 `sync-presets` 已执行
- 检查 `public/presets/` 目录完整性

### 8.5 Overnight 故障速查矩阵

| 故障现象 | 根因 | 解决命令 | 查看日志 |
|---------|------|---------|---------|
| Sync 失败 | `D:\aidata` 不可访问 | 检查NAS挂载 | `artifacts/coupled-eval/<stamp>/sync.log` |
| Eval 中断 | headless browser 卡死 | `scripts/kill-stale-headless-browsers.ps1` | `artifacts/coupled-eval/<stamp>/vite.log` |
| Train 失败 | 数据分布不均 | 调整 `min-quality-std` | `python/unified_coupling_trainer.py` stdout |
| Verify 失败 | quality JSON 缺失 | 重新运行 `train-coupled-quality` | [8.1 verify 失败](#81-verify-失败) |
| 覆盖率低 | shuffle 未启用 | 检查 `coupledPick=shuffle` | `artifacts/verify-check/latest/verify.log` |
| 渲染失败 | SwiftShader 回退 | 重启+kill 僵尸进程 | `meta.json` 中 `webgl.renderer` |

### 8.6 已知数据冲突速查

引用任何旧文档前，先核对下表：

| 旧文档声称 | 正确值 | 验证方法 |
|-----------|-------|---------|
| "8,041对 3D耦合" | ~3,000对 | 见 [3.4.2](#342-已知数据冲突清单conflict) |
| "13万预设全部可用" | 实际可用 ~20k | `preset-audit.json` 中 `crash-safe` 计数 |

### 8.7 单writer原则与state分层（排障视角）

**常见现象 → 根因 → 动作**：

- 现象：画面不跟音乐 / 宏被抢 / 参数"忽大忽小"  
  - 根因：多源同时写（违反单 writer）或仲裁优先级错误  
  - 动作：检查是否存在"多个 writer"；统一到仲裁器一次性输出；按 6.3 优先级修

- 现象：Favorites 被污染（收藏变得随机/不可控）  
  - 根因：runtime-only 层写回 slow state（违反快慢层隔离）  
  - 动作：禁止写回 `VisualStateV2/lastVisualState`；将随机点缀转为纯 runtime-only

- 现象：HOLD/MIDI lock 失效  
  - 根因：仲裁优先级未把 lock/hold 放在最高  
  - 动作：优先级固定为 `midiLock > manualHold > merge(...)`

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

**现行事实（黄金命令/门禁/证据链）**：

#### ① verify:dev（开发验证）
```bash
npm run verify:dev
```
- **目的**：快速验证开发环境，检查 WebGL/GPU、音频活性、JSON 产物
- **产物路径**：`artifacts/verify-dev/latest/`
  - `verify.log` - 完整日志
  - `meta.json` - 运行时常数（含 `webgl.renderer`）
- **失败时看哪里**：
  - `meta.json` 中 `runtime.webgl.renderer` 含 "SwiftShader" → GPU 回退，执行 `scripts/kill-stale-headless-browsers.ps1` 后重试
  - `audioRms: 0` → 音频静音，检查 `AudioBus.ts` 初始化

#### ② verify:check（严格门禁）
```bash
npm run verify:check
```
- **目的**：CI/CD 门禁，比 verify:dev 更严格的阈值
- **产物路径**：`artifacts/verify-check/latest/`
- **失败时看哪里**：
  - Exit code ≠ 0 → 看 `verify.log` 中 ERROR 行
  - Missing `pairs-quality.v0.json` → 执行 coupled pipeline 生成

#### ③ headless-eval-coupled-pairs（离线评估）
```bash
node scripts/headless-eval-coupled-pairs.mjs --resume
```
- **目的**：离线评估 fg/bg 配对质量，产出质量评分
- **产物路径**：`artifacts/coupled-eval/<timestamp>/`
  - `eval.jsonl` - 逐对评估记录
  - `meta.json` - 运行时证据（WebGL renderer、audioRms）
  - `checkpoint.json` - 断点（支持 `--resume`）
- **失败时看哪里**：
  - `webgl.renderer` = "SwiftShader" →  headed 模式更可靠
  - `audioRms: 0` → 检查 `--mute-audio=false` 参数
  - 进程卡住 → `scripts/kill-stale-headless-browsers.ps1`

#### ④ run-coupled-quality-overnight（一键过夜）
```powershell
.\scripts\run-coupled-quality-overnight.ps1 -TargetCoverage 0.95
```
- **目的**：sync → eval → train → verify 全自动过夜流程
- **产物路径**：
  - 评估：`artifacts/coupled-eval/<stamp>/`
  - 训练：`public/presets/<pack>/pairs-quality.v0.json`
  - 验证：`artifacts/verify-dev/latest/`
- **失败时看哪里**：
  - Sync 失败 → 检查 `D:
aidata` 路径可访问
  - Eval 失败 → 看 `artifacts/coupled-eval/<stamp>/vite.log`
  - Train 失败 → 检查 `python/unified_coupling_trainer.py` 日志
  - Verify 失败 → 见本节 ①/②

#### ⑤ train-coupled-quality（训练）
```powershell
.\scripts\train-coupled-quality.ps1
```
- **目的**：基于评估结果训练质量模型，产出 `pairs-quality.v0.json`
- **产物路径**：`public/presets/<pack>/pairs-quality.v0.json`
- **失败时看哪里**：
  - `min-quality-std` 门禁未通过 → 检查训练数据分布
  - 模型不收敛 → 调整 `performanceThresholds.ts` 阈值

#### ⑥ runtime 关键文件速查
- **URL 开关/verify hooks**：`src/app/bootstrap.ts`
- **质量 JSON 加载**：`src/features/presets/coupledPairsLoader.ts`
- **数据 schema**：`src/features/presets/coupledPairsStore.ts`
- **质量计算**：`src/features/presets/presetQuality.ts`
- **音频管线/活性检测**：`src/audio/AudioBus.ts`

### <a id="deprecated-optimization-complete"></a> deprecated-optimization-complete

用于替代：
- CODE_CONFLICT / OPTIMIZATION 相关旧报告与完成总结。

**现行事实**：
- 优化结论与实现：见 [SSOT 第 5 章](#5-coupled-quality-pipeline)
- 冲突解决记录：保留在 git history (`git log --grep="CONFLICT"`)
