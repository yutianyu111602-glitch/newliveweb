# HANDOFF（2025-12-19）：网易云下载目录、离线补扫、去重确认（NAS 端）

## 背景与问题

### 网易云音乐下载落盘逻辑（Windows）

- 网易云下载时会受其侧数据/版权状态影响：
  - 有时下载为 MP3，落在 `D:\CloudMusic`（根目录或其内的直接文件）
  - 有时下载为 NCM，落在 `D:\CloudMusic\VipSongsDownload`
- 常见漏传场景：
  - 文件在 watcher 未运行期间已下载完成（磁盘已存在）
  - watcher 依赖 watchdog 的文件事件，启动后不会自动补扫“已存在文件”
  - 结果是 NAS 侧缺文件，后续整理工具（如 smart_organize）缺曲

## 更新（2025-12-19）：已确认 3 首 MP3 实际已上传到 NAS

Windows 侧之前担心“缺少 MP3”的 3 首，已确认在 NAS 上存在（SMB 路径）：

- `\\192.168.8.200\nas\music\mp3\10_raw\inbox_win\2025-12-18\Arkajo - Consequence #1.mp3`
- `\\192.168.8.200\nas\music\mp3\10_raw\inbox_win\2025-12-18\Arkajo - Consequence #2.mp3`
- `\\192.168.8.200\nas\music\mp3\10_raw\inbox_win\2025-12-18\Dorisburg,Efraim Kent - Wired to the Mainframe.mp3`

因此，如果 NAS 容器内执行 `smart_organize --music-root /music` 仍然缺这 3 首，更可能是 NAS 容器侧的挂载/扫描范围问题：

- 容器内 `/music` 未包含 `mp3/10_raw/inbox_win` 这棵目录树；或
- smart_organize 的扫描逻辑未覆盖该分支（例如排除 `10_raw`）。

建议 NAS 端先做两步定位：

1. 容器内确认文件是否可见（择一）：
   - `ls -lah "/music/mp3/10_raw/inbox_win/2025-12-18" | grep -E "Consequence|Wired"`
   - `find /music -maxdepth 7 -type f \\( -name "Arkajo - Consequence #1.mp3" -o -name "Arkajo - Consequence #2.mp3" -o -name "Dorisburg,Efraim Kent - Wired to the Mainframe.mp3" \\)`
2. 如果容器内看不到，但 SMB 上能看到：优先检查 `docker-compose` 的 volume/mount（`/music` 对应的宿主路径是否包含 `mp3/` 这棵树）。

## 目录映射（宿主机 / SMB / 容器）

NAS 上目前存在两套“根目录”，容易混淆：

### 1) SMB 落盘（Windows 上传看到的路径）

- Windows 上传使用共享 `\\192.168.8.200\nas\music`（宿主机路径：`/volume1/nas/music`）
  - NCM drop：`/volume1/nas/music/ncm/YYYY-MM-DD/*.ncm`
  - MP3 drop：`/volume1/nas/music/mp3/10_raw/inbox_win/YYYY-MM-DD/*.mp3`

### 2) 容器统一流水线根（整理/索引/输出使用的路径）

- 容器内 `--music-root /music` 实际对应宿主机：`/volume1/music`（该目录不一定通过 SMB 共享暴露）
  - pipeline inbox：`/volume1/music/10_raw/inbox_win/...`
  - pipeline archive：`/volume1/music/10_raw/by_day/...`
  - 输出：`/volume1/music/20_converted`、报告：`/volume1/music/99_reports`

### 3) 桥接/入库服务（把 SMB drop 汇入 pipeline inbox）

（来自 `\\192.168.8.200\docker\nas-ncm-tool\docker-compose.yml`）

- `ncm-bridge`：`/volume1/nas/music/mp3/10_raw/inbox_win` -> `/volume1/music/10_raw/inbox_win`（rsync 复制，保留日期子目录）
- `ncm-ingest`：`/volume1/nas/music/ncm` -> `/volume1/music/10_raw/inbox_win`（并归档到 `/volume1/music/10_raw/by_day`）

注意：

- `ncm-bridge` 的 rsync 规则必须包含 `--include '*/'` 才能递归进入日期子目录；否则会出现“源目录有文件、目标目录始终为空”的现象。
- `ncm-bridge` 容器内 `/bridge` 通常以只读方式挂载，不能在启动命令里 `chmod +x /bridge/bridge_inbox.sh`；应使用 `sh /bridge/bridge_inbox.sh` 运行脚本。

因此如果 smart_organize “缺少 MP3”，优先检查 MP3 是否已经出现在：

- `/volume1/music/10_raw/inbox_win/YYYY-MM-DD/`
  而不是 `/volume1/music/mp3/...`（这条路径在当前 layout 下通常不存在）。

## Windows 端当前状态（供 NAS 端对齐）

### 监控范围与格式

- `NCM_WATCH_DIRS` 默认：`D:\CloudMusic;D:\CloudMusic\VipSongsDownload`
- `MUSIC_EXTS` 默认：`.mp3,.ncm,.flac`

### 已加入“离线补扫（catch-up scan）”

目的：补传 watcher 离线期间已存在的 MP3/NCM，避免漏扫导致缺曲。

默认行为（可用环境变量调整）：

- 启动后自动补扫最近 48 小时内的 `.mp3/.ncm`
- 最多入队 200 个候选
- 每 900 秒再补扫一次（可改为 0 表示只启动扫一次）
- 可选按“NAS 已存在同名文件”跳过，避免重复上传

补扫时间判定：

- 使用 `max(ctime, mtime)`（创建时间/修改时间取较新者），避免“复制/移动导致 mtime 旧但实际上是新文件”的漏扫。

相关环境变量：

- `CATCHUP_SCAN=true/false`
- `CATCHUP_SCAN_MAX_AGE_HOURS=48`
- `CATCHUP_SCAN_MAX_FILES=200`
- `CATCHUP_SCAN_INTERVAL_SECONDS=900`（设为 `0` 表示只扫一次）
- `CATCHUP_SCAN_SKIP_IF_NAME_EXISTS=true/false`
- `CATCHUP_SCAN_EXTS=.mp3,.ncm`（为空则使用 `MUSIC_EXTS`）

常见现象说明：

- 如果启动时日志出现类似 `queued=0 skipped={'exists_on_nas_by_name': 54}`：
  - 表示候选文件在“同名去重”阶段被判定 NAS 已存在，因此不会重复上传；
  - Windows 端会额外打印一行“示例文件名”，用于快速确认是哪些文件被跳过。
  - 注意：这里判断的“NAS 已存在”指的是 Windows 上传看到的 SMB drop 目录（`/volume1/nas/music/...`），并不等价于容器流水线根 `/volume1/music/...` 已经完成桥接入库。

## NAS 端（docker）当前待执行动作：让 MP3 drop 进入 pipeline inbox

现状是：Windows 已把 MP3 上传到 SMB drop（`/volume1/nas/music/mp3/10_raw/inbox_win/...`），但 smart_organize 使用的 `/music`（宿主 `/volume1/music`）未必能看到这些 MP3。

建议 NAS 端按下面顺序自检/修复（在 NAS 上执行）：

1. 检查 MP3 drop 是否存在（宿主机）：
   - `ls -lah /volume1/nas/music/mp3/10_raw/inbox_win/2025-12-18 | grep -E "Consequence|Wired"`
2. 检查 pipeline inbox 是否已有（宿主机）：
   - `ls -lah /volume1/music/10_raw/inbox_win/2025-12-18 | grep -E "Consequence|Wired" || true`
3. 如果 pipeline inbox 为空：重启/修复 `ncm-bridge`（MP3 桥接）：
   - `cd /volume1/docker/nas-ncm-tool`
   - `docker compose up -d --no-deps --force-recreate ncm-bridge`
4. （可选）为了让容器侧也能直接看到 drop MP3：确认 `ncm-server` 也挂载了 `/volume1/nas/music/mp3 -> /music/mp3:ro`，然后：
   - `cd /volume1/docker/nas-ncm-tool`
   - `docker compose up -d --no-deps --force-recreate ncm-server`
5. 若终端粘贴命令会出现 `^[[200~` 之类字符：建议不要整段粘贴，改为逐行手输，或关闭终端的 bracketed paste。

## 去重确认：要不要做？复杂度与影响（给 NAS 端的决策）

### Windows 端已具备的去重链路

Windows watcher 当前已做多层去重（不依赖 NAS 新服务也能大幅降低重复上传概率）：

1. 本地内容指纹去重：`seen.sha1`（按 sha1 记忆已处理文件）
2. NAS 名称索引去重：加载 `nas_index.json`（按文件名快速判断 NAS 是否已有同名文件）
3. 目标同名冲突时的远端 sha1 校验：
   - 如果发现 NAS 上已有同名文件，会计算远端 sha1 对比
   - sha1 一致则跳过上传
   - sha1 不一致则改名保存（避免覆盖）

### 仍可能出现重复的边界情况

“相同内容不同名字”的重复上传仍可能发生于：

- Windows 本地 `seen.sha1` 被清空/丢失
- NAS 上也不同名（无法触发同名冲突检查）

### 建议

- 自动监控新增文件：不建议强制握手（会增加依赖与延迟），保持现有去重即可。
- 批量补传/手动扫描/离线补扫：建议引入“可选握手”（一次提交候选清单，NAS 返回允许上传的名单），降低重复与误传风险。

## NAS 去重确认服务（阶段 1 已实现）

Mac/NAS 端同事已确认：仓库内已实现“阶段 1（按文件名去重）”的确认服务（`manual_scan_handshake.py`），并在 `docker-compose.yml` 中提供 `ncm-handshake` 服务。

### 交互方式（目录握手）

握手目录（默认）：

- `\\192.168.8.200\nas\music\ncm\_ncm_watcher_handshake`
  - Windows 端可通过 `NAS_HANDSHAKE_DIR` 指定

Windows 写入请求文件：

- `manual_scan_<scan_id>.request.json`

NAS 服务写回响应文件（原子写入：先 tmp 再 rename）：

- `manual_scan_<scan_id>.response.json`

响应 JSON 格式（最小）：

- `{"scan_id": 123, "allow": ["a.mp3","b.ncm"]}`
  - Windows 端兼容字段名：`allow`/`upload`/`upload_names`/`names`

部署对齐信息（来自 NAS 端说明）：

- Windows 看到的握手目录：`\\192.168.8.200\nas\music\ncm\_ncm_watcher_handshake`
- 容器内对应：`/drop/_ncm_watcher_handshake`
- `HANDSHAKE_DIR=/drop/_ncm_watcher_handshake`
- `LIBRARY_ROOTS=/music`（按文件名去重的扫描根）
- 服务日志：`/music/99_reports/handshake.jsonl`

### Windows 端需要做什么（使握手生效）

- watcher 启用：`MANUAL_SCAN_HANDSHAKE=true`
- （可选但推荐显式设置）`NAS_HANDSHAKE_DIR=\\192.168.8.200\nas\music\ncm\_ncm_watcher_handshake`
- 触发方式：托盘“手动上传一次”或写入命令 `{"action":"manual_scan"}`，watcher 会写入 `manual_scan_<scan_id>.request.json` 并等待 `.response.json`，只上传 allow 列表内文件。

### 后续（阶段 2：sha1 去重）

目前未实现（NAS 端可扩展）：建立 sha1 索引（sqlite/jsonl），并在 request 中支持携带 sha1，优先按内容指纹去重。

## 供复现验证的命令（NAS 容器）

smart_organize（重跑验证）：

```bash
python3 /app/modules/ncm_tools/smart_organize.py \
  --playlist-file "/app/outputs/spotify_exports/newdeep (2)_20251218_180119.json" \
  --music-root /music \
  --output-dir /app/outputs/_debug_smart \
  --match-threshold 0.6 \
  --debug-candidates 10
```

结果查看：

- `/app/outputs/_debug_smart/_REPORT.txt`
