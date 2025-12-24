# Docker 部署（NAS）

本项目是纯前端 WebGL 应用：容器只负责“提供网页与静态资源”，实际渲染发生在观众/你的浏览器里（NAS 不需要 GPU）。

## 什么时候有必要用 Docker？

- **有必要**（推荐用于 NAS 测试/部署）：
  - 希望在 NAS 上“常驻”一个稳定地址（例如 `http://nas:8080`）。
  - 希望一键重启、环境一致（Node 版本/依赖一致）。
  - 希望 dev 模式崩了能自动拉起（`restart: unless-stopped`）。
- **不一定有必要**：
  - 你只在本机开发/演出，`npm run dev` 足够。
  - “服务器不会崩溃”主要取决于代码与资源，Docker 只能提升**可恢复性**与**部署一致性**，并不能消除应用 bug。

## 生产模式（稳定地址，推荐）

在 NAS 的项目目录（`newliveweb/`）执行：

1. 启动：
   - `docker compose --profile prod up -d --build`
2. 访问：
   - `http://<NAS_IP>:8080`
3. 查看日志：
   - `docker logs -f newliveweb`

## 开发模式（热更新 / HMR）

1. 启动：
   - `docker compose --profile dev up -d --build`
2. 访问：
   - `http://<NAS_IP>:5174`
3. 说明：
   - NAS/网络盘的文件监听经常不稳定，所以 compose 里默认开启了 polling（HMR 更可靠，但会更耗 CPU）。

## （可选）容器内本地音频代理 `/__local_audio`

`vite.config.ts` 支持通过环境变量指定允许读取的音频目录（仅 dev 模式）：`LOCAL_AUDIO_ROOT`。

示例（把 NAS 上的音频目录挂载到容器里）：

- 在 `docker-compose.yml` 的 `newliveweb-dev` 中添加：
  - `LOCAL_AUDIO_ROOT: "/media/audio"`
  - 以及一个 volume：
    - `- /path/on/nas/audio:/media/audio:ro`

## （可选）UI 占位路径（仅提示用）

UI 里的“测试音频库路径 / 预设包路径”只是提示，不参与实际读取；如果你想让占位符更贴合你的机器，可在 `.env.local` 设置：

- `VITE_TEST_AUDIO_LIBRARY_PATH=/path/to/music`
- `VITE_PRESET_PACK_PATH=/path/to/presets`

## 摄像头 / 设备权限注意

- 摄像头需要 **https 或 localhost**（安全上下文）。如果你打算在手机/外网访问 NAS 上的 dev/prod：
  - 建议走 NAS 的反代 + HTTPS，或者只在本机 `localhost` 使用摄像头功能。

## MacBook 演出：系统音频输入方案（推荐 + BlackHole 备份）

浏览器无法直接抓取“系统输出”（扬声器/声卡输出），演出时一般需要把 DJ 软件/Live 的主输出“复制”到一个**虚拟输入设备**，再让网页从这个输入设备采集音频。

### 方案 A（推荐）：DJ/Live → 音频接口物理回路 → 浏览器

- 适用：现场有声卡/调音台，且你愿意走一条物理线（最稳定）。
- 做法：
  - DJM/声卡的 REC OUT / BOOTH OUT / AUX OUT → 声卡 Line In（或另一台采集声卡）→ 浏览器选择该输入设备。
- 优点：最稳、最少系统权限坑；缺点：需要线材/额外输入通道。

### 方案 B（备份）：BlackHole（虚拟声卡）把系统输出变成“可采集输入”

> 适用：临时没有物理回路；或现场电脑音频路由复杂时的备份方案。

1. 安装 BlackHole（任选其一）
   - Homebrew（推荐）：`brew install --cask blackhole-2ch`
   - 或从 BlackHole 项目页面下载 `.pkg` 安装（macOS 可能需要在“隐私与安全性”中允许）。
2. 打开 `Audio MIDI Setup`（应用：音频 MIDI 设置）
3. 创建 **Multi-Output Device（多输出设备）**（把声音同时送到你的耳机/声卡 + BlackHole）
   - 勾选：
     - 你的实际输出（如 “MacBook Speakers” 或 “你的声卡输出”）
     - “BlackHole 2ch”
   - 采样率建议统一设为 `48kHz`（和现场常用声卡一致），避免重采样导致抖动。
4. 在 DJ 软件 / Ableton Live 里，把 **输出设备** 设为刚创建的 Multi-Output Device
   - 这样：你依然能听到/出声，同时音频会被送进 BlackHole。
5. 在 newliveweb 页面里选择输入设备
   - 工具栏 `Input` 下拉框选择类似 “BlackHole 2ch”
   - 点击 `Use input`
6. 验证
   - 看工具栏 `Level` 是否有数值跳动
   - 如启用了 `Audio/BeatTempo/enabled` 或工具栏 `Beat` 开关，看 `BPM`/`beatPulse` 是否出现

**常见坑（现场快速排障）**

- 看不到 BlackHole 设备：重新插拔/重启浏览器；检查系统“隐私与安全性”是否阻止了音频设备；必要时重启电脑。
- 有输出但页面没输入：确认 newliveweb 里选的是 “BlackHole 2ch” 且点了 `Use input`；Chrome 地址栏左侧站点权限里允许麦克风。
- 采样率不一致导致爆音/抖动：在 `Audio MIDI Setup` 里统一输出设备采样率（常用 `48kHz`）。
- 延迟太大：优先用方案 A（物理回路）。BlackHole 方案通常比物理更容易引入系统级缓冲。

### 浏览器建议（演出）

- 推荐用 Chrome（WebMIDI/音频权限/性能更稳）
- 演出前建议跑一次冷启动检查：
  - 打开页面 → 选择输入设备 → `Use input` → 看 `Level` → 再开 `Techno Auto/Techno Style`。
