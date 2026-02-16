# Run3 预设扫描汇总报告

生成时间：2025-12-29T16:53:28.855Z

## 关键结论

- Run3 全量审计：scanned=136109 probed=136109 ok=1284 bad=134825（newliveweb/artifacts/presets/audit-full-130k-2025-12-28-run3/audit-summary.json）
- NoWavesNoShapes 修复包（wasm-abort-only 5k v1）：scanned=5000 probed=5000 ok=4760 bad=240（newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-wasmabortonly-5000-v1/audit-summary.json）
  - bad reasons(top)：Aborted(both async and sync fetching of the wasm failed)=212, too-dark=27, low-motion=4, wasm-abort=1

## 全部扫描产物列表（newliveweb/artifacts/presets 下所有 audit-summary.json）

| 产物 | generatedAt | totals | bad reasons (top) |
|---|---|---|---|
| newliveweb/artifacts/presets/audit-full-130k-2025-12-28-run3/audit-summary.json | 2025-12-28T23:04:43.421Z | scanned=136109 probed=136109 ok=1284 bad=134825 | too-dark=84459, wasm-abort=71879, Aborted(Assertion failed: Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch.)=23737, Aborted(native code called abort())=20541, no-motion-sample=11493, Aborted(both async and sync fetching of the wasm failed)=224 |
| newliveweb/artifacts/presets/audit-full-safe-sample/audit-summary.json | 2025-12-27T16:54:46.438Z | scanned=30 probed=30 ok=1 bad=29 | wasm-abort=21, no-motion-sample=19, Aborted(Assertion failed: Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch.)=4 |
| newliveweb/artifacts/presets/audit-full-sample/audit-summary.json | 2025-12-27T17:50:08.092Z | scanned=500 probed=500 ok=4 bad=496 | wasm-abort=335, no-motion-sample=216, Aborted(Assertion failed: Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch.)=81, Aborted(native code called abort())=75, too-dark=11 |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-sample100-v2/audit-summary.json | 2025-12-29T10:44:03.415Z | scanned=100 probed=0 ok=0 bad=0 | - |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-sample100-v3/audit-summary.json | 2025-12-29T10:45:57.484Z | scanned=100 probed=100 ok=0 bad=100 | wasm-abort=57, Aborted(Assertion failed: Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch.)=43 |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-sample100/audit-summary.json | 2025-12-29T10:42:59.073Z | scanned=100 probed=0 ok=0 bad=0 | - |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-wasmabortonly-5000-v1-probecheck15s/audit-summary.json | 2025-12-29T15:30:57.562Z | scanned=56 probed=56 ok=56 bad=0 | - |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-wasmabortonly-5000-v1-smoke300/audit-summary.json | 2025-12-29T11:46:20.261Z | scanned=300 probed=300 ok=297 bad=3 | too-dark=3, low-motion=1 |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-wasmabortonly-5000-v1/audit-summary.json | 2025-12-29T16:22:18.601Z | scanned=5000 probed=5000 ok=4760 bad=240 | Aborted(both async and sync fetching of the wasm failed)=212, too-dark=27, low-motion=4, wasm-abort=1 |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-wasmabortonly-sample100-v1/audit-summary.json | 2025-12-29T10:47:47.573Z | scanned=100 probed=100 ok=0 bad=100 | too-dark=100 |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-wasmabortonly-sample100-v2-audit/audit-summary.json | 2025-12-29T10:49:50.330Z | scanned=100 probed=100 ok=0 bad=100 | too-dark=100 |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-wasmabortonly-sample100-v3-audit/audit-summary.json | 2025-12-29T10:51:32.949Z | scanned=100 probed=100 ok=0 bad=100 | too-dark=100 |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-wasmabortonly-sample100-v4-audit/audit-summary.json | 2025-12-29T10:53:13.041Z | scanned=100 probed=100 ok=0 bad=100 | too-dark=100 |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-wasmabortonly-sample100-v5/audit-summary.json | 2025-12-29T10:59:15.618Z | scanned=100 probed=100 ok=0 bad=100 | too-dark=100 |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-wasmabortonly-sample100-v6-min035/audit-summary.json | 2025-12-29T11:04:40.282Z | scanned=100 probed=100 ok=99 bad=1 | too-dark=1 |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-wasmabortonly-sample100-v6/audit-summary.json | 2025-12-29T11:01:00.510Z | scanned=100 probed=100 ok=0 bad=100 | too-dark=100 |
| newliveweb/artifacts/presets/audit-repair-nowavesnoshapes-wasmabortonly-sample100-v7-invert/audit-summary.json | 2025-12-29T11:03:22.371Z | scanned=100 probed=100 ok=0 bad=100 | too-dark=100 |
| newliveweb/artifacts/presets/audit-run3-nowavesnoshapes-20/audit-summary.json | 2025-12-29T00:32:36.548Z | scanned=20 probed=20 ok=0 bad=20 | too-dark=20 |
| newliveweb/artifacts/presets/audit-run3-nowavesnoshapes-200/audit-summary.json | 2025-12-29T00:46:29.352Z | scanned=200 probed=200 ok=0 bad=200 | too-dark=200 |
| newliveweb/artifacts/presets/audit-smoke-130k-limit200-2025-12-28-v3/audit-summary.json | 2025-12-28T08:56:24.007Z | scanned=200 probed=200 ok=0 bad=200 | wasm-abort=131, no-motion-sample=116, too-dark=88, Aborted(Assertion failed: Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch.)=38, Aborted(native code called abort())=28, probe-timeout=1 |
| newliveweb/artifacts/presets/audit-smoke-curated-probe/audit-summary.json | 2025-12-28T08:31:56.211Z | scanned=50 probed=0 ok=0 bad=0 | - |
| newliveweb/artifacts/presets/audit-smoke-curated/audit-summary.json | 2025-12-28T08:31:48.433Z | scanned=200 probed=0 ok=0 bad=0 | - |
| newliveweb/artifacts/presets/audit/audit-summary.json | 2025-12-27T16:59:23.625Z | scanned=140271 probed=0 ok=0 bad=0 | - |
| newliveweb/artifacts/presets/repair-test-elegant death metal/out/audit-summary.json | 2025-12-28T23:53:48.500Z | scanned=1 probed=1 ok=0 bad=1 | Aborted(Assertion failed: Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch.)=1 |
| newliveweb/artifacts/presets/repair-test-elegant-death-metal-aggressive/out/audit-summary.json | 2025-12-28T23:54:53.813Z | scanned=1 probed=1 ok=0 bad=1 | Aborted(Assertion failed: Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch.)=1 |
| newliveweb/artifacts/presets/repair-test-EMPR _ Rovastar - Voov - Pins and Needles/out/audit-summary.json | 2025-12-28T23:54:01.729Z | scanned=1 probed=1 ok=0 bad=1 | Aborted(native code called abort())=1 |
| newliveweb/artifacts/presets/repair-test-out/audit-summary.json | 2025-12-28T23:52:13.333Z | scanned=1 probed=1 ok=0 bad=1 | too-dark=1 |

## 备注

- probe 依赖本地 dev server：http://127.0.0.1:5174/preset-probe.html。若中途断连，可能出现 scanned 已完成但 probed 未完成，需要 --resume --probeMissing 补齐。
- NoWavesNoShapes 修复包复审口径建议：--minAvgLuma 0.035（默认 0.06 对修复包偏严）。
