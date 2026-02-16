# AIVJ 炼丹 Roadmap（2k → 15k → 130k）

**更新**: 2025-12-30  
**当前状态**: ✅ `run3-crashsafe-2000` 已完成闭环（渲染 → embedding → 聚类 → style index/policy → QA）

> 入口文档：`AIVJ_2K_ALCHEMY_RUNBOOK.zh.md`（可复制粘贴的最短闭环命令）  
> 本文件：更偏“下一阶段怎么扩规模/怎么验收/怎么炼丹升级”。

---

## 0) 2k 已验证的结论（作为扩规模基线）

- 渲染输出：`artifacts/aivj/run3-crashsafe-2000`（`ok=2000 failed=0`）
- 多样性（2k 实测）：
  - `avgLuma 0.059-0.767 (range 0.708)`
  - `motion  0.0032-0.4756 (range 0.4725)`
- 去重：首帧 SHA1 `unique=2000/2000`
- style index/policy：
  - `public/presets/run3-crashsafe-2000/aivj-style-index.v1.json`
  - `public/presets/run3-crashsafe-2000/aivj-style-policy.v0.json`

---

## 1) 参数冻结（先小后大最关键的一条）

扩到 15k/130k 之前，先把“能跑通且好用”的参数冻结下来，避免每次跑出来不可复现。

建议固定：
- 时间推进：`--timeMode fixedStep --fixedStepFps 30`
- 预热：`--prewarm true --prewarmTimeoutMs 90000`
- 渲染：`--warmupFrames 60 --captureCount 3 --captureEvery 30`
- 稳定性：`--refreshEvery 100 --timeoutMs 30000 --retryTimes 2 --presetDelayMs 200`
- 输出：`--outSize 224 --format webp`

说明：
- `fixedStep` 让 warmup/capture 的“时间”变成可控的模拟秒数（60 帧≈2s，30 帧≈1s），不依赖 wall-clock。
- `prewarm` 主要解决“首个预设/首批预设”容易超时的问题。

---

## 2) 15k 阶段（目标：一晚跑完 + 门禁通过）

### 2.1 渲染（15k）

启动 dev server（独立终端保持运行）：

```powershell
cd C:\Users\pc\code\newliveweb
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

渲染（可断点续跑）：

```powershell
cd C:\Users\pc\code\newliveweb
node scripts/aivj/render-preset-frames.mjs `
  --manifest "public/presets/run3-crashsafe-15000/library-manifest.json" `
  --outDir "artifacts/aivj/run3-crashsafe-15000" `
  --resume true `
  --headless true `
  --timeMode fixedStep `
  --fixedStepFps 30 `
  --prewarm true `
  --prewarmTimeoutMs 90000 `
  --warmupFrames 60 `
  --captureCount 3 `
  --captureEvery 30 `
  --timeoutMs 30000 `
  --refreshEvery 100 `
  --retryTimes 2 `
  --presetDelayMs 200 `
  --outSize 224 `
  --format webp `
  --logEvery 25
```

### 2.2 门禁（强制）

门禁通过才允许进入 130k：
- OK 率：`ok/(ok+failed) >= 95%`
- 重复首帧：`topSame(frame-000) < 20%`
- 多样性：`avgLuma range > 0.3` 且 `motion range > 0.05`

如果门禁不过（只改 1–2 个变量再试）：
- `--timeoutMs 45000`（先保命）
- `--warmupFrames 90` / `--captureEvery 60`（仍像初始化态时）
- `--refreshEvery 50`（怀疑长跑状态污染时）

---

## 3) 15k 炼丹（embedding → 聚类 → QA）

### 3.1 Embedding（OpenCLIP baseline）

```powershell
cd C:\Users\pc\code\newliveweb
.\.venv-aivj\Scripts\python.exe scripts\aivj\embed_clip.py `
  --index "artifacts/aivj/run3-crashsafe-15000/frames-index.jsonl" `
  --root  "artifacts/aivj/run3-crashsafe-15000" `
  --outDir "artifacts/aivj/run3-crashsafe-15000" `
  --model "ViT-B-32" `
  --pretrained "laion2b_s34b_b79k" `
  --maxFramesPerPreset 3 `
  --batch 64 `
  --fp16
```

备注：
- 当前实现会对同一 preset 的多帧 embedding 做归一化后 mean pooling（这对“动态预设”更稳）。

### 3.2 聚类（建议先保持 k=64）

```powershell
cd C:\Users\pc\code\newliveweb
.\.venv-aivj\Scripts\python.exe scripts\aivj\cluster_embeddings.py `
  --embeddings "artifacts/aivj/run3-crashsafe-15000/embeddings.npy" `
  --ids "artifacts/aivj/run3-crashsafe-15000/ids.txt" `
  --framesIndex "artifacts/aivj/run3-crashsafe-15000/frames-index.jsonl" `
  --k 64 `
  --seed 1 `
  --outDir "artifacts/aivj/run3-crashsafe-15000" `
  --manifest "public/presets/run3-crashsafe-15000/library-manifest.json" `
  --styleIndexVersion v1 `
  --outStyleIndex "public/presets/run3-crashsafe-15000/aivj-style-index.v1.json"
```

### 3.3 产出 policy + QA 抽样

```powershell
cd C:\Users\pc\code\newliveweb
node scripts/build-aivj-style-policy-v0.mjs --manifest "public/presets/run3-crashsafe-15000/library-manifest.json"
node scripts/aivj/qa-sample-clusters.mjs --pack run3-crashsafe-15000 --perCluster 12 --frameIndex 1 --random
```

打开 QA：
- `artifacts/aivj/run3-crashsafe-15000/qa-samples/index.html`

---

## 4) 130k 扩规模（核心：分批 + 稳定 clusterId）

### 4.1 分批策略（推荐）

原则：
- 不要一次性 130k 全跑到底才验收；每批都要过门禁。
- outDir 按批次分目录（避免 `frames-index.jsonl` 混跑污染）。

建议目录结构：
```
artifacts/aivj/run3-fullsafe-130k/
  batch-0001/
  batch-0002/
  ...
```

每批建议规模：
- 5k~20k/批（看单晚预算与磁盘空间）

### 4.2 clusterId 稳定（很关键）

问题：
- 直接对 2k/15k/130k 重新跑 k-means，cluster 编号会漂移，运行时“同一个 clusterId”不再表示同一风格。

建议路线（按实现成本从低到高）：
1) **版本化**：每个规模输出独立 `style-index.v1.json`（最简单，但跨规模不稳定）
2) **对齐簇**：用 Hungarian（centroid cosine）把新旧簇做对齐映射（保持编号尽量一致）
3) **增量初始化**：用上一轮 centroids 作为 k-means init（最像“扩展同一套 crate”）

---

## 5) 运行时炼丹（从“能用”到“像 DJ”）

### 5.1 Baseline（无需训练）

- 用 `energy`（motion 分位数）做三档：`calm / groove / peak`
- 根据音频 RMS/beat/onset 估计当前能量档 → 从对应 energy 桶里抽 preset
- 加“避免重复”与“最短驻留时长”：
  - 同一 preset：N 秒内不重复
  - 同一 cluster：M 次切换内不重复

### 5.2 下一步（可训练）

目标：
- 学一个 `audio → style distribution`（输出 cluster 概率）或 `audio → embedding`（检索最相似的 preset）

最低成本 baseline：
- 音频 embedding（CLAP/OpenL3）+ 线性/MLP 回归到 cluster one-hot（或多标签）

---

## 6) 复盘与记录（每次跑完都要写）

每个规模都落盘一份 run meta（建议手动写一段也行）：
- 渲染参数（timeMode/fps/warmup/capture/refresh/timeout）
- OK/failed、失败原因 TopN
- topSame(frame-000)
- luma/motion range
- 选定 k 与 QA 结论

建议把“门禁数据”追加到：
- `EXECUTION_STATUS.local.md`
- `TODOS.local.md`
