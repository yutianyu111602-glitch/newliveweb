# projectM WASM 重编译指南（解决 `Aborted(exception catching is not enabled…)`）

## 目标 / Goal

你在 `preset-audit` 的 run3 里看到大量原因类似：

- `Aborted(Assertion failed: Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING …)`

这通常意味着：**当前 `public/projectm-runtime/projectm.wasm` 构建时禁用了异常捕获**，一旦 C++ 内部抛异常，就会直接 `abort()`，导致大量预设被标成 hard-fail（无法演出）。

本指南目标是：

1) 让 projectM WASM **启用异常捕获**（能在 JS 侧 catch/转成“可处理的失败”，而不是硬 abort）。
2) 为后续“大库救回率提升”提供可重复的构建流程（最好能 A/B 对比）。

> 注意：重编译是“更重升级项”。建议先用 `crash-safe` 池把 AIVJ 跑通（见 `docs/reference/AIVJ_ALCHEMY_PLAN.zh.md`），再上这一步。

## 快速自检（先确认你当前 runtime 的编译信号）

```powershell
cd C:\Users\pc\code\newliveweb
node scripts/projectm/check-projectm-runtime-flags.mjs
```

这会做一个**静态检查**（字符串特征）：

- 是否包含 `createProjectMModule`（newliveweb 运行时入口）
- 是否提到 `DISABLE_EXCEPTION_CATCHING` / `NO_DISABLE_EXCEPTION_CATCHING`

> 静态检查不能 100% 证明编译 flags，但能快速发现“明显禁用异常”的 runtime。

## 为什么这一步对 run3 很关键

run3 的 `audit-summary.json` 显示：

- `Aborted(…exception catching is not enabled…)` 数量非常大（2.3 万级）

这类失败**高度相关于引擎构建**，逐个 patch `.milk` 的收益通常远低于“引擎级修复”。

## 你需要准备的依赖（Windows）

推荐两条路线：

1) **WSL2（更稳）**：在 Ubuntu 里装 emsdk/cmake/ninja，然后把产物拷贝回 `newliveweb/public/projectm-runtime/`。
2) **纯 Windows**：使用 emsdk 的 `emsdk_env.ps1` + Visual Studio Build Tools + CMake/Ninja。

共同依赖：

- Emscripten SDK（emsdk）：提供 `emcc/emcmake/emmake`
- CMake + Ninja（或 MSBuild）
- 一个能构建 projectM 的源码仓库（你本机已有：`C:\Users\pc\code\projectm`）

参考资料（你本机已存在）：

- `C:\Users\pc\code\projectm\EMSCRIPTEN.md`
- `C:\Users\pc\code\smelter-win\docs\projectm-wasm-notes.zh.md`（更详细的“异常捕获/Wrapper”分析）

## 关键原则（不要一上来就“瞎改”）

newliveweb 的 `ProjectMEngine` **依赖一个特定的 JS/WASM 接口形态**：

- `public/projectm-runtime/projectm.js` 需要在浏览器里提供 `window.createProjectMModule(...)`
- `ProjectMEngine.ts` 通过 `module.cwrap()` 绑定若干 C 导出函数（例如创建实例、加载预设、渲染、喂音频）
- 现有 runtime 还有一些“非标准行为”（例如对 `Module.HEAP*` 的访问会触发 abort），`ProjectMEngine.ts` 内有对应的兼容实现

因此，“只把 projectM 官方库编译成 .a/.bc”还不够；你需要：

1) **确定现有 wrapper 的 C 导出接口**（不要改函数名/签名）
2) 在相同 wrapper 上**仅调整异常捕获相关 flags**，先做 A/B 验证

## 建议的最短可落地步骤（A/B 对比）

1) 备份当前 runtime：

```powershell
cd C:\Users\pc\code\newliveweb
Copy-Item -Force public\projectm-runtime\projectm.js public\projectm-runtime\projectm.js.bak
Copy-Item -Force public\projectm-runtime\projectm.wasm public\projectm-runtime\projectm.wasm.bak
```

2) 在 projectM/wrapper 工程里（你现有的构建链）启用异常捕获：

- `-sNO_DISABLE_EXCEPTION_CATCHING`
  - 或更精细的：`-sEXCEPTION_CATCHING_ALLOWED=[...]`（只对白名单函数启用，体积更小）

3) 产出新的 `projectm.js` + `projectm.wasm`，覆盖到：

- `newliveweb/public/projectm-runtime/projectm.js`
- `newliveweb/public/projectm-runtime/projectm.wasm`

4) 做小样本复测（不要立刻重跑 13 万）：

- 从 run3 中挑 500～2000 个 `Aborted(exception catching is not enabled…)` 的 relPath
- 用 `scripts/prepare-audit-for-reprobe.mjs` 清掉它们的 `quality`，然后 `--probeMissing true` 回填
- 观察该 reason 是否显著下降

## 复测建议（命令）

例：清掉特定 reason，再回填 probe：

```powershell
cd C:\Users\pc\code\newliveweb

node scripts/prepare-audit-for-reprobe.mjs `
  --in "artifacts\presets\audit-full-130k-2025-12-28-run3\preset-audit.json" `
  --inplace true `
  --reasons "exception catching is not enabled"

node scripts/preset-audit.mjs `
  --source "C:\Users\pc\code\MilkDrop 130k+ Presets MegaPack 2025\presets" `
  --out "artifacts\presets\audit-full-130k-2025-12-28-run3" `
  --resume true `
  --probe true `
  --probeMissing true `
  --probeFailMode continue `
  --probeSuspendMs 60000
```

## 预期收益（为什么值得做）

- 你当前的 hard-fail 里，有一大块是“异常捕获禁用”导致的 abort。
- 如果重编译后能把这些从 `abort()` 变成“可 catch 的错误”，你就可以：
  - 在审计里把它们从 hard-fail 降级为 soft-fail（或可修复）
  - 在运行时做更细的 fallback（而不是直接崩）
  - 显著扩大 crash-safe 池，提升 AIVJ 风格覆盖

