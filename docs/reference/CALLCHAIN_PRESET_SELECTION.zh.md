# CALLCHAIN_PRESET_SELECTION.zh.md（从 getNextPresetFiltered() 到实际加载）

目标：把“从 UI 触发换预设 → 选下一个 preset → ProjectM 加载 → 错误/黑名单回写”的链路写成一条可点击的调用链，方便改策略与加 hook。

---

## 1) 入口：bootstrap.ts 的换预设选择器

- 选择器本体（顺序轮转 + 黑名单过滤）：[src/app/bootstrap.ts](../../src/app/bootstrap.ts)
  - `getNextPresetFiltered(currentId)`：
    - 读取 `getAllPresets()`
    - 过滤 `soft/aesthetic/quality` 三类黑名单
    - pool 为空则 fallback 到 all
    - 返回 “当前 index + 1” 的下一个 preset

> 你要做“按风格簇/宏状态采样”，最小改动路径：保留黑名单过滤不动，把“nextIndex 计算”替换成“从候选池按权重采样”。

---

## 2) 加载：PresetsController 负责真正 loadPresetFromUrl

- 切库时：`loadPresetManifestForSource(source)`
  - 位置：[src/features/presets/PresetsController.ts#L442](../../src/features/presets/PresetsController.ts#L442)
  - 做的事：
    1) `loadLibraryManifest(manifestUrl, { requireWasmSafe })`
    2) `mapManifestToPresetDescriptors(manifest)`
    3) `registerRuntimePresets(presets)`
    4) 初始化/回填 current preset
    5) `projectLayer.loadPresetFromUrl(preset.url)` 加载第一个可用 preset

- 单次换预设（从某个 preset descriptor）：
  - `loadPresetFromDescriptor(preset, origin)` → `loadPresetFromUrl({ url, presetId, label, origin })`

---

## 3) 渲染：ProjectM 层（projectLayer / engine）

- `projectLayer.loadPresetFromUrl(url)` 是实际把 `.milk` 送入 ProjectM/WASM 引擎的入口。
- 渲染失败/异常会在 `loadPresetFromUrl` 的 catch 分支中：
  - `handleLoadError(...)`
  - 非 transient 错误会：`markBrokenAndRefresh({ id })`
  - 需要时会暂停自动换预设：`stopAutoCycle(...)`

---

## 4) 质量探测/黑名单回写（bootstrap.ts 的预加载队列）

- 预加载队列：`presetPreloadQueue`
  - 位置：[src/app/bootstrap.ts](../../src/app/bootstrap.ts)
  - 作用：
    - 预取 preset 文本（prefetch cache）
    - 运行快速质量探测（低分辨率）
    - 对 bad 的 preset：
      - `markPresetQualityBad(preset.id, reasons, ttl)`
      - `markPresetAesthetic(preset.id, reasonText, ttl)`

> 这条链路解释了“为什么 Random 会越来越少踩雷”：因为后台 probe 会不断给黑名单喂数据。

---

## 5) 给里程碑 3/4/5 的具体 Hook 建议

- v1（无模型）风格索引：
  - 运行时加载：挂在 `loadPresetManifestForSource()` 完成后
  - 选 preset：替换/包装 `getNextPresetFiltered()` 的“顺序轮转”为“按 bucket/cluster 采样”
- v2（CLIP embedding）风格簇：
  - 依旧不需要动 ProjectM；只动“选哪个 preset”与“缓存/索引加载”
- v3 bandit 自学习：
  - reward 记录挂在“用户操作事件（next/fav/hold）”与“加载错误/黑名单命中”处
