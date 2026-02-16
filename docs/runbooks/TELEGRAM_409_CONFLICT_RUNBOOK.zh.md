# Telegram Bot API 409 Conflict（getUpdates/webhook）排查与根治 Runbook

## 典型现象
- 日志出现 `HTTP 409 Conflict`，常见描述包括：
  - `terminated by other getUpdates request`
  - `can't use getUpdates method while webhook is active`
- Telegram 机器人“忽然不回了/断断续续回”，重启后互相抢占。

## 根因（最常见的 2 类）
1) **同时存在 webhook + long polling**
- Telegram 的 updates 接收方式是互斥的：
  - `getUpdates`（long polling）
  - `setWebhook`（webhook 推送）
- webhook 开着时，`getUpdates` 会失败（实践里经常体现为 409）。

2) **同一个 bot token 被多个 poller 同时 `getUpdates`**
- `getUpdates` 同一时刻只允许一个活跃的 long poller；第二个会触发 409 并终止另一个请求。
- 常见来源：
  - 重复启动了 autoreply / watchdog
  - 为了“探测 chat_id”临时跑了 `getUpdates` 脚本
  - 多台机器/多个 WSL 用户同时跑同一个 token

## 快速诊断（现有脚本）
在 WSL 里运行：
- 查看 webhook 是否开启：
  - `bash /mnt/c/Users/pc/code/artifacts/wsl_debug_openclaw_telegram.sh`
- 查找可能的 poller/脚本：
  - `bash /mnt/c/Users/pc/code/artifacts/wsl_find_telegram_pollers.sh`

> 注意：任何额外的 `getUpdates` 探测都有可能打断正在运行的 poller（尤其是 long poll）。

## 根治步骤（推荐顺序）
1) **关闭 webhook**（确保切回 `getUpdates` 模式）
- `bash /mnt/c/Users/pc/code/artifacts/wsl_telegram_disable_webhook.sh`

2) **确保只有一个 poller 在跑**
- 重启 autoreply（会尽力杀掉旧实例）：
  - `bash /mnt/c/Users/pc/code/artifacts/wsl_start_telegram_autoreply.sh --restart`

3) **避免并发 getUpdates 探测**
- 获取 chat_id/调试时，优先用“只发送、不拉取”的方式；如果必须 `getUpdates`，在确认 autoreply 停止后再操作。

## 当前实现里的防护点
- [wsl_telegram_autoreply.py](../../../artifacts/wsl_telegram_autoreply.py) 启动时会：
  - 加单实例锁（避免多个 poller）
  - 检测并尝试 `deleteWebhook(drop_pending_updates=true)`（避免 webhook 与 `getUpdates` 冲突）
- [wsl_start_telegram_autoreply.sh](../../../artifacts/wsl_start_telegram_autoreply.sh) 的 `--restart` 会尽力清理旧进程，降低 409 概率。

## 仍然出现 409 时的检查清单
- 是否有第二台机器/另一个 WSL 用户也在用同一个 token 跑 `getUpdates`？
- `~/.openclaw/telegram.bot.token` 是否被多个服务共享？
- 是否在跑任何会 `getUpdates` 的脚本（比如探测冲突脚本）？

