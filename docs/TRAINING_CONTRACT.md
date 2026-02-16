# TRAINING_CONTRACT: Coupled Pair Quality (SSOT)

> 目的：把"训练在吃什么 / 产物是什么 / runtime 怎么用 / 怎么验收"写成一张单页卡片。
> 以后你只按这张卡片做 A/B 证据，就不会再"凭感觉训练"。

## Inputs

- Elite labels (强监督锚点):
  - `D:\aidata\AIVJ_FINAL_ELITE\AIVJ_FINAL_ELITE_MANIFEST.json`
  - ~200 entries (pos=150 score>=4, neg=50), unique `.milk` = 400
- Browser eval (运行时采样，扩展训练集):
  - `<REPO_ROOT>/artifacts/coupled-eval/<stamp>/eval.jsonl` + `meta.json`

## Training

- Trainer: `python/unified_coupling_trainer.py`
- One-shot: `scripts/train-coupled-quality.ps1`
- Device: must use `cuda` (RTX 4090), no CPU fallback
- Feature count: 63

## Output Artifact (runtime-consumable)

- `public/presets/<PACK>/pairs-quality.v0.json`
  - `pairs[]`: `{ pair: int, quality01: float 0..1 }`
  - `qualityStats`: `{ std, p50, p95, min, max }`
  - **Hard gate**: `qualityStats.std >= 0.03`

## Runtime Consumption

- **Loader**: `src/features/presets/coupledPairsLoader.ts`
  - Derives quality URL from manifest URL (same folder)
  - Merges `quality01` into each `CoupledPairV0` entry
  - Log: `[coupled-pairs] loaded pairs-quality { pack, url, std, pairs }`

- **Pick strategy** (`src/app/bootstrap.ts`):
  - `shuffle`: Fisher-Yates full-cycle, ignores quality01
  - `random`: uniform random, ignores quality01
  - `weighted` (default): `w *= 0.2 + 0.8 * quality01` + warp/cx diff Gaussian

- **Selection log** (grep-friendly, captured by headless):
  ```
  [sel] mode=<mode> pack=<pack> pair=<int> q=<float|na> presetId=<id> reason=<reason>
  ```

## Acceptance / Gate

### 1) 产物存在
- `public/presets/<PACK>/pairs-quality.v0.json` exists

### 2) 信号不塌缩
- `qualityStats.std >= 0.03`

### 3) Runtime 证据
- Network: 页面 fetch `pairs-quality.v0.json`  200
- Console: `[coupled-pairs] loaded pairs-quality` 行出现
- `[sel]` lines: browser-console.log 含 `pair=<n>` + `q=<float>`

### 4) A/B 对照
- 脚本: `scripts/metrics/compare-coupled-pick.ps1`
- PASS: `weighted.avgQuality > shuffle.avgQuality AND weighted.top20HitRate > shuffle.top20HitRate`
- 最少 >=50 samples/arm 才有统计意义

## Headless A/B Procedure

```powershell
# Run 1: shuffle
$env:VERIFY_URL = "http://127.0.0.1:5174/?coupled=1&coupledPack=<PACK>&coupledPick=shuffle"
npm run verify:dev
Copy-Item artifacts\headless\browser-console.log artifacts\headless\sel.shuffle.browser-console.log

# Run 2: weighted
$env:VERIFY_URL = "http://127.0.0.1:5174/?coupled=1&coupledPack=<PACK>&coupledPick=weighted"
npm run verify:dev
Copy-Item artifacts\headless\browser-console.log artifacts\headless\sel.weighted.browser-console.log

# Compare
powershell -File scripts\metrics\compare-coupled-pick.ps1 `
  -Pack "<PACK>" `
  -ShuffleLog "artifacts\headless\sel.shuffle.browser-console.log" `
  -WeightedLog "artifacts\headless\sel.weighted.browser-console.log"
```

## Notes

- Headless weighted requires `mockCoupledIntensity01=0.5` (injected by `headless-verify.mjs`)
- First few picks may fallback to `mode=random reason=fallback:no-audio` before mock injection
- For >=50 samples/arm, use overnight eval: `scripts/headless-eval-coupled-pairs.mjs`