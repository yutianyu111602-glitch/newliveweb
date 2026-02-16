# 离线预设工具链（扫描 / 抽样 / 生成 manifest / favorites 包）

> 目标：在不依赖网页 UI 的情况下，完成预设库整理与“收藏包（favorites pack）”生成，供前端直接加载或自动导入。

---

## 1) 预设库同步（生成 library-manifest.json）

对应脚本：`newliveweb/scripts/sync-presets.mjs`

常见用途：

- 扫描本机 `.milk` 预设目录
- 复制/整理到 `newliveweb/public/presets/<pack>/`
- 生成 `newliveweb/public/presets/<pack>/library-manifest.json`（前端可直接读取）

示例（以 mega 为例）：

- 在仓库根目录执行：
  - `npm --prefix c:\Users\pc\code\newliveweb run sync:presets -- --target mega --limit 1000`

说明：

- `--target`：输出 pack 名（例如 `mega` / `curated` / 自定义）
- `--limit`：抽样数量（例如 mega 常用 1000）

产物：

- `newliveweb/public/presets/<pack>/library-manifest.json`

---

## 2) 生成收藏包（favorites pack）

对应脚本：`newliveweb/scripts/build-favorites-pack.mjs`

常见用途：

- 从预设集合离线挑选/抽样
- 复制预设到 `newliveweb/public/presets/favorites/`
- 同时生成：
  - `library-manifest.json`（让 favorites pack 可以当作“一个预设库”被加载）
  - `favorites.v2.json`（一组 `FavoriteVisualState[]` 的 bundle，可被启动时导入）

示例：

- 在仓库根目录执行：
  - `npm --prefix c:\Users\pc\code\newliveweb run build:favorites`

产物（默认）：

- `newliveweb/public/presets/favorites/library-manifest.json`
- `newliveweb/public/presets/favorites/favorites.v2.json`

---

## 3) 前端消费方式（最小闭环）

当 `public/presets/favorites/favorites.v2.json` 存在时：

- 应用启动会尝试读取并导入（合并 + 去重），避免依赖网页操作。

提示：

- 如果你更新/重建了 favorites bundle，确保 bundle 的 `generatedAt` 会变化，前端才能识别为“新的一版”。

---

## 4) 常见排障

- 看不到 favorites：
  - 检查 dev server 是否能访问：`/presets/favorites/favorites.v2.json`
- 预设库看不到：
  - 检查对应 pack 的 `library-manifest.json` 是否存在且 JSON 可解析
