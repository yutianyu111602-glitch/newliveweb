# AI 团队优化配置

> 版本：v3.3
> 更新日期：2026-02-16
> 目标：真实联网讨论和测试 AI 团队

---

## 1. 可用模型配置（团队 4 个模型 + OpenAI 主模型）

### ✅ DeepSeek（推荐 - 快速响应）

```bash
# DeepSeek Chat（已验证可用）
model: deepseek/deepseek-chat
alias: DeepSeek

API Key: <REDACTED>
Base URL: https://api.deepseek.com/chat/completions
状态: ✅ 已验证（2026-01-28）
文档: https://api-docs.deepseek.com/zh-cn/
```

> 注：本文档不再记录可用的真实 API Key；请将密钥放在本机环境变量或 `~/.openclaw/.env`（并确保不提交到仓库）。

**⚠️ 注意**: `deepseek-reasoner` 暂不可用（不支持 `developer` 角色）

### ✅ MiniMax（深度分析）

```bash
model: minimax/MiniMax-M2.1
alias: Minimax

API Key: <REDACTED>
Base URL: https://api.minimaxi.com/anthropic
状态: ✅ 已验证（主会话使用）
```

### ✅ Qwen（已验证可用）

```bash
# Qwen Plus
model: qwen-dashscope/qwen-plus
alias: Qwen-Plus

# Qwen Coder
model: qwen-dashscope/qwen-coder-plus
alias: Qwen-Coder

API Key: <REDACTED>
Base URL: https://dashscope.aliyuncs.com/compatible-mode/v1
状态: ✅ 已验证（2026-02-16）
```

### ✅ OpenAI（OAuth 订阅授权，不是 API Key 充值）

```bash
Provider: openai-codex
Model: gpt-5.3-codex
认证: OAuth（运行 openclaw 的登录流程获取授权）
状态: ✅ 可用（主模型）

# 登录示例（只需在本机执行一次，后续复用授权）
openclaw models auth login --provider openai-codex
```

---

## 2. AI 团队角色定义（4 个模型）

### 角色 1：架构审查（DeepSeek）

**职责**：系统架构分析

**任务指令**：
```
你是系统架构师。读取 /mnt/c/Users/pc/code/newliveweb/src/app/bootstrap.ts 的前100行，输出：
1）文件大致行数
2）主要导入模块（前5个）
3）一个架构改进建议

只输出这3点，不要执行命令。
```

### 角色 2：代码质量（MiniMax）

**职责**：代码质量分析

**任务指令**：
```
你是代码质量专家。读取 /mnt/c/Users/pc/code/newliveweb/src/features/presets/runManifestStore.ts 的前80行，输出：
1）导出的主要类型
2）HARD_FAIL_TOKENS 内容
3）一个代码改进建议

只输出这3点，不要执行命令。
```

### 角色 3：性能优化（DeepSeek）

**职责**：性能瓶颈分析

**任务指令**：
```
你是性能工程师。读取 /mnt/c/Users/pc/code/newliveweb/src/performance/PerformanceBudgetManager.ts 的前80行，输出：
1）PerformanceBudget 的主要字段
2）QualityLevel 的定义
3）一个性能优化建议

只输出这3点，不要执行命令。
```

### 角色 4：综合分析（MiniMax）

**职责**：整合分析结果

**任务指令**：
```
你是技术架构专家。根据以下分析结果，整合输出：
1）项目整体架构评分（1-5）
2）最关键的3个问题
3）优先级最高的2个改进建议

分析内容：
[将其他AI的输出粘贴到这里]

只输出这3点。
```

---

## 3. 快速测试命令

```bash
# 并行启动 3 个 AI 角色进行小型会议

# 1. 架构审查（DeepSeek）
/session_spawn agentId="newliveweb" label="architect" model="DeepSeek" task="你是系统架构师。读取 /mnt/c/Users/pc/code/newliveweb/src/app/bootstrap.ts 的前100行，输出：1）文件大致行数，2）主要导入模块（前5个），3）一个架构改进建议。只输出这3点。" timeoutSeconds=90 cleanup="keep"

# 2. 代码质量（MiniMax）
/session_spawn agentId="newliveweb" label="code-quality" model="Minimax" task="你是代码质量专家。读取 /mnt/c/Users/pc/code/newliveweb/src/features/presets/runManifestStore.ts 的前80行，输出：1）导出的主要类型，2）HARD_FAIL_TOKENS 内容，3）一个代码改进建议。只输出这3点。" timeoutSeconds=90 cleanup="keep"

# 3. 性能优化（DeepSeek）
/session_spawn agentId="newliveweb" label="performance" model="DeepSeek" task="你是性能工程师。读取 /mnt/c/Users/pc/code/newliveweb/src/performance/PerformanceBudgetManager.ts 的前80行，输出：1）PerformanceBudget 的主要字段，2）QualityLevel 的定义，3）一个性能优化建议。只输出这3点。" timeoutSeconds=90 cleanup="keep"
```

---

## 4. 可用模型矩阵

| 模型 | 别名 | 状态 | 用途 | API Key |
|------|------|------|------|---------|
| `deepseek/deepseek-chat` | DeepSeek | ✅ 可用 | 架构/性能 | <REDACTED> |
| `deepseek/deepseek-reasoner` | DeepSeek-R1 | ❌ 禁用 | - | - |
| `minimax/MiniMax-M2.1` | Minimax | ✅ 可用 | 代码/综合 | <REDACTED> |
| `qwen-dashscope/qwen-plus` | Qwen-Plus | ✅ 可用 | - | <REDACTED> |
| `qwen-dashscope/qwen-coder-plus` | Qwen-Coder | ✅ 可用 | - | <REDACTED> |
| `openai-codex/gpt-5.3-codex` | OpenAI | ✅ 可用 | 主模型/兜底 | OAuth |

---

## 5. 已知问题

### 1. DeepSeek-R1 兼容性问题

**现象**: `400 Failed to deserialize: unknown variant 'developer'`

**原因**: DeepSeek-R1（reasoner 模型）不支持 `developer` 角色

**解决方案**: 使用 `deepseek-chat` 替代

### 2. Qwen 模型不被允许

**现象**: `model not allowed: qwen-portal/qwen-*-latest`

**原因**: 子代理配置可能需要额外设置

**解决方案**: 等待后续配置更新

### 3. DeepSeek 工作目录问题

**现象**: 子代理默认工作目录可能不是项目目录

**解决方案**: 使用绝对路径
```bash
task: "读取 /mnt/c/Users/pc/code/newliveweb/src/app/bootstrap.ts..."
```

---

## 6. 版本记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-01-28 | 初版 |
| v2.0 | 2026-01-28 | 添加 DeepSeek 兼容性说明 |
| v3.0 | 2026-01-28 | 7个模型，添加 GPT-5.2 |
| v3.1 | 2026-01-28 | 移除 GPT-5.2（当时误判不可用），保留 5 个模型 |
| v3.2 | 2026-01-28 | 移除 DeepSeek-R1（兼容性问题），保留 4 个可用模型 |
| v3.3 | 2026-02-16 | 纠正 OpenAI “需充值/禁用”误导：改为 OAuth 授权可用；同步主模型为 gpt-5.3-codex；文档不再记录真实 API Key |

---

*本文档由 AI 团队真实运行验证*
