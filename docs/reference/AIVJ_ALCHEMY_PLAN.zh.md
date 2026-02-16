# AIVJ「炼丹」方案（本地最短路径 · 4090）

> 目标：用超大 MilkDrop/ProjectM 预设库（13 万级）做“离线体检 → 生成安全池 → 离线聚类/embedding → 运行时自动选预设”，把现有 newliveweb 的 **AIVJ（自动 VJ）** 变成“更稳 + 更贴合音乐/风格 + 可自学习”的系统。
>
> 这份文档偏 **可执行 runbook**：你可以先只跑 v0（无 AI），然后逐步升级到 v1/v2（有 AI）。

## 0) 现状与边界（以代码为准）

### AIVJ 已经“部分实装”

newliveweb 里已经有：

- **宏银行（macro bank）+ AIVJ 状态**：`src/app/bootstrap.ts`（搜索 `AIVJ_MACRO_BANK`、`aivj.enabled`）
- **scene classifier（ambient/techno/rock）+ auto director**：`src/app/bootstrap.ts`（搜索 `Scene classifier`、`Auto director`）
- **自动换预设触发**：`src/app/bootstrap.ts`（搜索 `requestPresetCycle("auto")`）
- **预设池过滤（soft/aesthetic/quality blacklist）**：`src/app/bootstrap.ts`（搜索 `getNextPresetFiltered`）

### 重要结论

- 你现在缺的不是“从 0 写 AIVJ”，而是：**给 AIVJ 一个可靠的安全预设池**，再把“下一个预设怎么选”从“顺序轮转”升级到“按风格/音乐状态选”。
- 这正好能用你正在跑的 `preset-audit` 产物解决。

## 1) 输入数据（你已经在产出了）

### 1.1 离线体检（审计）

来自 `scripts/preset-audit.mjs` 的 checkpoint：

- `artifacts/presets/<OUT>/preset-audit.json`

以及 live 快照脚本（不中断长跑）：

- `scripts/snapshot-preset-audit.mjs` → 生成：
  - `preset-audit.summary*.json`
  - `quality-blacklist.*.live.json`

详见：`docs/reference/PRESET_AUDIT_TOOL.md`（run3 实战流程）

> run3 最终关键数字（以 `audit-summary.json` 为准）：
>
> - `scanned=136109`, `probed=136109`, `ok=1284`, `bad=134825`
> - crash-safe 可用池（排除 wasm-abort/render-failed/Aborted(...)/probe-timeout）约 `19721` 条
> - 含义：线上 AIVJ 请优先用 crash-safe 池；ok-only 池更严格但更小、风格覆盖会变窄

### 1.2 安全预设池（pack）

通过 `scripts/sync-presets.mjs` 从大库抽样拷贝出一个本地 pack（会生成 manifest）：

- `public/presets/<packName>/library-manifest.json`

> 这个 pack 是 AIVJ “炼丹”的核心：后续所有 AI/聚类/自学习都只在这个安全池上做，避免把“坏预设/卡死预设”引入线上策略。

## 2) v0：0 AI 的最短路径（立刻能跑）

> 适合：先把“能稳定演出”跑通，再决定要不要上视觉 embedding/自学习。

### 2.1 目标

- 用 **crash-safe** 安全池作为 preset library
- 开启 AIVJ/Techno Auto + Auto preset
- 让系统自动换预设、自动调宏，完成“自动 VJ”

### 2.2 依赖

- 无需新增依赖（只要 `npm install` + dev server）

### 2.3 步骤

1) 启动 dev server

```powershell
cd C:\Users\pc\code\newliveweb
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

2) 在 UI 中选择一个“安全 pack”（例如你已生成的）：

- `run3 · Crash-safe(2000)`：更适合长时间跑（不追求“必然好看”，追求“不硬崩/不卡死”）
- `run3 · Ok-only(~1284)`：更严格（通过质量门禁），但数量小、风格覆盖可能变窄（如果你看到还是 ~955，说明 pack 是审计中途生成的，建议按最终 `quality-blacklist.json` 重建一次）

3) 开启：

- AIVJ / Techno Auto（宏会随音乐变化）
- Auto preset（让 auto director 有权换预设）

> 这一步其实已经是“AI VJ”了：只是“AI”目前更多是规则/启发式 + 音频驱动，而不是深度学习。

## 3) v1：轻量“AI”（无模型）——风格索引 + 聚类选预设

> 目标：把 `getNextPresetFiltered()` 从“顺序轮转”升级成“按宏/scene 选择风格簇”，效果立竿见影，但不引入深度学习依赖。

### 3.1 新增依赖（可选）

如果你希望离线聚类更省事（k-means），建议加一个 JS 聚类库：

```powershell
cd C:\Users\pc\code\newliveweb
npm i -D ml-kmeans
```

> 不装也可以：先用“tag bucket”做 8~16 个风格桶即可（wave/liquid/line/dots/abstract…）。

### 3.2 离线产物：AIVJ 风格索引（style index）

建议输出到 pack 目录，运行时直接 fetch：

- `public/presets/<packName>/aivj-style-index.v0.json`
- `public/presets/<packName>/aivj-style-index.v0.json`
- `public/presets/<packName>/aivj-style-index.v1.json`（推荐：运行时优先 v1，缺失/无效严格回退 v0）

自检（确认命中 v1 / 回退 v0）：

```powershell
node scripts/aivj/check-style-index.mjs --manifestUrl "http://127.0.0.1:5174/presets/<packName>/library-manifest.json"
```

建议结构（示例）：

```json
{
  "version": "v0",
  "generatedAt": "2025-..",
  "pack": "run3-crashsafe-2000",
  "manifestUrl": "/presets/run3-crashsafe-2000/library-manifest.json",
  "presets": [
    {
      "id": "foo/bar.milk",
      "tags": ["wave","abstract","vectors"],
      "primaryCategory": "wave",
      "metrics": {"avgLuma":0.42,"avgFrameDelta":0.012,"avgRenderMs":18.1},
      "cluster": 7
    }
  ],
  "clusters": [
    {"id":7,"label":"techno-wave-sparkle","centroid":[...],"count":123}
  ]
}
```

### 3.3 生成脚本设计（Node）

建议新增脚本（设计稿）：

- `scripts/build-aivj-style-index.mjs`

输入：

- `--manifest public/presets/<pack>/library-manifest.json`
- `--audit artifacts/presets/<OUT>/preset-audit.json`
- `--out public/presets/<pack>/aivj-style-index.v0.json`
- `--mode tag|kmeans`

实现要点（关键对齐点）：

- manifest 的 `entry.id === relPath`（见 `src/types/presets.ts`），而 audit 里也是 `entry.relPath`
- 所以 join key 用 `relPath` 最稳

特征向量（不依赖深度学习）建议至少包含：

- one-hot tags（wave/liquid/line/dots/abstract/vectors…）
- `avgLuma`（亮度）
- `avgFrameDelta`（动感）
- `avgRenderMs`/`p95RenderMs`（性能）

### 3.4 运行时接入点（最小改动）

目标：只改“选下一个预设”的策略，不改 AIVJ 其它架构。

推荐接入点：

- `src/app/bootstrap.ts`：`getNextPresetFiltered()`（当前是顺序轮转）

策略：

1) 当 library/manifest 加载完成后，尝试加载 `aivj-style-index.v0.json`
2) 在 auto director 触发 `requestPresetCycle("auto")` 时：
   - 根据 `sceneLabel` + macro bank（fusion/motion/sparkle）计算“目标风格分布”
   - 抽取 cluster → 抽取 preset
   - fallback：如果 index 不存在或采样失败，退回 `getNextPresetFiltered()`

风格分布（简单版）：

- `scene=techno`：偏 `motion/sparkle` 高的 cluster（wave/dots/vectors）
- `scene=ambient`：偏 `fusion` 高、`motion` 中低（liquid/abstract）
- `scene=rock`：`motion` 高但少许 `fusion`（wave + line）

> 这样做的好处：你不需要训练任何模型，就能让 AIVJ 的“换预设”明显更像一个 DJ/VJ 在挑风格。

## 4) v2：真·视觉 AI（4090）——CLIP embedding 聚类

> 目标：让“风格簇”更接近人类审美（而不是仅靠 tags/阈值）。
>
> 核心：**渲染预设 → 取图 → 用本地 GPU 模型提 embedding → 聚类**。

### 4.1 依赖（Python，建议单独 venv）

1) 准备 Python（建议 3.10+）
2) 建 venv：

```powershell
cd C:\Users\pc\code\newliveweb
python -m venv .venv-aivj
.\.venv-aivj\Scripts\Activate.ps1
```

3) 安装 CUDA 版 torch（示例 cu121；按你机器实际 CUDA 版本调整）：

```powershell
pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

4) 安装 embedding/聚类依赖：

```powershell
pip install -r scripts/aivj/requirements-aivj.txt
```

可选：

- `pip install rich`（更好看的进度条）
- 安装 `ffmpeg`（把渲染帧拼成视频/动图用于人工筛选）
- （可选，真·炼丹）LoRA/HF CLIP：`pip install -r scripts/aivj/requirements-aivj-lora.txt`

### 4.2 渲染帧提取（Node + Playwright）

已实现脚本：

- `scripts/aivj/render-preset-frames.mjs`

输入（两种模式二选一）：

- **Pack 模式（推荐）**：`--manifest public/presets/<pack>/library-manifest.json`
- **原库模式**：`--sourceRoot <dir> --relPathsFile <crashsafe.txt>`

关键参数：

- `--devUrl http://127.0.0.1:5174/preset-probe.html`（必须 200）
- `--outDir artifacts/aivj/<pack>`
- `--captureCount 3` / `--captureEvery 12` / `--warmupFrames 12`
- `--resume true`（断点续跑）
- `--stopAfterSec N`（夜跑时间预算，提前留出 embedding/聚类时间）

输出：

- `artifacts/aivj/<pack>/frames-index.jsonl`：每个 preset 一行（status/frames/metrics）
- `artifacts/aivj/<pack>/frames/<hash>/frame-000.webp ...`：渲染帧（默认 webp）

示例（对 `run3-crashsafe` pack 跑一晚，8 小时预算；断点续跑）：

```powershell
cd C:\Users\pc\code\newliveweb
node scripts/aivj/render-preset-frames.mjs `
  --manifest "public/presets/run3-crashsafe/library-manifest.json" `
  --outDir "artifacts/aivj/run3-crashsafe" `
  --devUrl "http://127.0.0.1:5174/preset-probe.html" `
  --resume true `
  --stopAfterSec 25200
```

实现说明（已内置）：

- Playwright 复用与 `preset-audit` 相同的 GPU/ANGLE 参数（更稳）
- 每 `--refreshEvery` 个 preset 自动重启浏览器上下文（降低泄漏风险）
- 每个 preset 内部会做 retry；失败会落到 `frames-index.jsonl` 的 `status=failed`

### 4.3 embedding 提取（Python）

已实现脚本：

- `scripts/aivj/embed_clip.py`：OpenCLIP（默认路线，产物文件名：`embeddings.npy`/`ids.txt`）
- `scripts/aivj/embed_clip_hf.py`：HuggingFace CLIPVision（可选，支持 `--loraDir`，产物文件名：`embeddings.hf.npy`/`ids.hf.txt`）

输入：

- `--index artifacts/aivj/<pack>/frames-index.jsonl`
- `--root artifacts/aivj/<pack>`（用于解析 index 内的相对路径）

输出（增量写入，支持多晚累积）：

- `artifacts/aivj/<pack>/ids.txt`
- `artifacts/aivj/<pack>/embeddings.npy`
- `artifacts/aivj/<pack>/embeddings.meta.json`

示例：

```powershell
cd C:\Users\pc\code\newliveweb
.\.venv-aivj\Scripts\Activate.ps1
python scripts/aivj/embed_clip.py `
  --index "artifacts/aivj/run3-crashsafe/frames-index.jsonl" `
  --root  "artifacts/aivj/run3-crashsafe" `
  --outDir "artifacts/aivj/run3-crashsafe" `
  --model "ViT-B-32" `
  --pretrained "laion2b_s34b_b79k" `
  --fp16
```

### 4.4 聚类 + 输出 style index（Python 或 Node）

已实现脚本：

- `scripts/aivj/cluster_embeddings.py`

输入：

- `embeddings.npy` + `ids.txt`
- `frames-index.jsonl`（可选，用于 motion 分位数 → calm/groove/peak）
- `--manifest .../library-manifest.json`（可选，用于把 style index 写到 pack 目录）

输出：

- `artifacts/aivj/<pack>/clusters.v0.json`（调试/复现用）
- `public/presets/<pack>/aivj-style-index.v0.json`（直接给运行时用，兼容）
- `public/presets/<pack>/aivj-style-index.v1.json`（推荐：运行时会优先加载 v1，缺失/无效时严格回退到 v0）

注意：

- 聚类数 K 不要太大：先从 32/64 开始
- 目前我们把 `authorKey` 复用成 `clusterId`（让运行时“同簇连续”更自然），再用 motion 分位数给 `energy` 分桶（calm/groove/peak）

示例：

```powershell
cd C:\Users\pc\code\newliveweb
.\.venv-aivj\Scripts\Activate.ps1
python scripts/aivj/cluster_embeddings.py `
  --embeddings "artifacts/aivj/run3-crashsafe/embeddings.npy" `
  --ids "artifacts/aivj/run3-crashsafe/ids.txt" `
  --framesIndex "artifacts/aivj/run3-crashsafe/frames-index.jsonl" `
  --k 64 `
  --seed 1 `
  --styleIndexVersion v1 `
  --manifest "public/presets/run3-crashsafe/library-manifest.json"

node scripts/build-aivj-style-policy-v0.mjs `
  --manifest "public/presets/run3-crashsafe/library-manifest.json"
```

### 4.5 一键夜跑（睡觉脚本）/ One-command overnight run

已实现脚本：`scripts/aivj/run-overnight.ps1`（自动：起 dev server → 渲染帧（时间预算）→ CLIP embedding → 聚类 → 写入 style index/policy → 关 dev server）

#### 夜跑前 5 分钟检查清单（强烈推荐）

- 确认 Playwright Chromium 已安装（只需一次）：`npx playwright install chromium`
- 确认 Python venv/依赖 OK（建议用 `-PythonExe` 指定到 venv 的 `python.exe`）
- 关闭 Windows 睡眠/休眠（否则半夜可能暂停渲染/断网）
- 先跑 smoke（20～50 个预设）确认链路通，再跑整晚

Smoke 示例（会在开头做 python/playwright 预检，失败会立刻报错，不会“渲染一晚最后才挂”）：

```powershell
cd C:\Users\pc\code\newliveweb
$py = "C:\Users\pc\code\newliveweb\.venv-aivj\Scripts\python.exe"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/aivj/run-overnight.ps1 `
  -Pack run3-crashsafe-smoke `
  -Hours 1 `
  -Limit 30 `
  -K 32 `
  -PythonExe $py `
  -Headless
```

跑完后检查：

- `artifacts/aivj/<pack>/frames-index.jsonl`
- `public/presets/<pack>/aivj-style-index.v0.json`
- 日志：`artifacts/aivj/<pack>/overnight-*.log`

```powershell
cd C:\Users\pc\code\newliveweb
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/aivj/run-overnight.ps1 `
  -Pack run3-crashsafe `
  -Hours 8 `
  -K 64
```

### 4.6（可选）LoRA：微调 CLIP 视觉编码器（真·炼丹）/ Optional LoRA fine-tune for CLIP

> 你先跑完 4.2~4.5 的 baseline，再考虑 LoRA；否则容易“还没数据就上训练”。
>
> 目标：用你自己的 ProjectM 视觉分布，让 embedding 更贴近你常用的风格簇（聚类更稳定、检索更准）。

最短可落地路线（推荐顺序）：

1) **不微调 backbone，只训练一个小头**（linear/MLP）：
   - 输入：CLIP embedding
   - 标签：聚类得到的 `clusterId`（伪标签）
   - 产物：`head.pt`（推理超快，几分钟训练完）

2) **LoRA 微调 CLIP Vision（peft）**（一晚能跑完的规模）：
   - 框架：HuggingFace `transformers` + `peft`（本仓库已提供可跑脚本）
   - 目标函数（最简单、最稳）：用 `clusters.v0.json` 的 `clusterId` 做分类（伪标签）
   - 输出：LoRA adapter（几十 MB），之后用 `embed_clip_hf.py --loraDir <adapter>` 重新算 embedding（更贴合你的 ProjectM 视觉分布）
   - 已实现脚本：
     - 训练：`scripts/aivj/train_clip_lora_cluster.py`
     - 推理 embedding：`scripts/aivj/embed_clip_hf.py`

建议依赖（仅当你真的要训练时再装）：

```powershell
pip install -r scripts/aivj/requirements-aivj-lora.txt
```

最短可跑示例（先用 KMeans 伪标签训 1 个 epoch）：

```powershell
cd C:\Users\pc\code\newliveweb
.\.venv-aivj\Scripts\Activate.ps1

# 1) 先用 baseline embedding 跑出 clusters.v0.json（见 4.4）
# 2) LoRA 训练（输出 adapter 到 artifacts/aivj/<pack>/lora/adapter）
python scripts/aivj/train_clip_lora_cluster.py `
  --framesIndex "artifacts/aivj/run3-crashsafe/frames-index.jsonl" `
  --clusters "artifacts/aivj/run3-crashsafe/clusters.v0.json" `
  --outDir "artifacts/aivj/run3-crashsafe/lora" `
  --epochs 1 `
  --batch 64 `
  --fp16

# 3) 用 LoRA adapter 重算 embedding（输出 embeddings.hf.npy / ids.hf.txt）
python scripts/aivj/embed_clip_hf.py `
  --index "artifacts/aivj/run3-crashsafe/frames-index.jsonl" `
  --root  "artifacts/aivj/run3-crashsafe" `
  --outDir "artifacts/aivj/run3-crashsafe" `
  --loraDir "artifacts/aivj/run3-crashsafe/lora/adapter" `
  --fp16
```

## 5) v3：在线自学习（bandit）——越用越懂你

> 目标：你手动“跳过/收藏/停留更久”就是训练信号，不需要标注数据。

### 5.1 信号设计（最小）

- 用户手动 Next：轻微惩罚当前 preset（“不够爽/想换”）
- 用户 Favorite：强奖励（“这类我爱”）
- 用户 Hold 很久：中等奖励（“这类耐听”）
- 发生硬失败（WASM abort/加载失败）：强惩罚 + 拉黑

### 5.2 存储（本地）

已实现：用 `localStorage` 存一份（见 `src/features/presets/aivjBanditV0.ts`）：

- key：`newliveweb:aivj:bandit:v0`
- 当前粒度：`authorKey:energy`（其中 `authorKey` 目前复用 `clusterId`，形如 `c01`）
- 信号接入点：`src/app/bootstrap.ts`（manual skip / favorite / preset failure）

每次 auto director 选簇时：

- baseScore（来自 scene/macro） + prefScore（来自 bandit） → softmax

> 这一步建议先做在 runtime-only（不写入 visual state），避免和 MIDI/human 抢控制权；你现有代码里已经有 “humanHold / midiLock” 的仲裁机制可以复用。

## 6) 推荐执行路线（最短）

1) **先跑 v0**：用 `run3-crashsafe-2000` 直接演出，确认稳定
2) 上 **v1**：生成 `aivj-style-index.v0.json`，把选预设从“顺序”升级为“风格簇抽样”
3) 有空再上 **v2**：CLIP embedding 聚类（4090 发力）
4) 最后做 **v3**：bandit 自学习（真正“炼丹”）

## 7) 你现在就能直接用的素材（run3）

你已经有：

- `public/presets/run3-crashsafe-2000/library-manifest.json`
- `public/presets/run3-okonly/library-manifest.json`

并且审计长跑仍在继续（可以随时 snapshot 更新 blacklist，再扩充 crashsafe 到 10k/20k）。
