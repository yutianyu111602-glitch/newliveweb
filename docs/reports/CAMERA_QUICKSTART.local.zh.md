# 摄像头使用速查（演出前 1 分钟看一眼）

> 只讲“怎么用”和“大概调到什么范围好看”，不讲代码。  
> 下面三种模式都假设 Liquid + PM 已经有一个你满意的底图。

---

## 1) 摄像头做“前景叠加”（人站在画面前）

适合：DJ/主控人像为主，后面是 Liquid/PM。

1. 在 Background 面板：  
   - 打开 `Camera` 层；  
   - 保持 Liquid/PM 也开启。
2. 在 Camera 控制里：  
   - `opacity ≈ 0.3–0.6`：  
     - 太低 → 人几乎看不见；  
     - 太高 → 纯直出摄像头，底图都没了。  
3. 在 Inspector 的 overlayBudget 里（如果你有这一组参数）：  
   - 适度提高 `overlayBudgetPriorityCamera` 到一个“略大于 Basic/Liquid、略小于 Depth/Video”的值；  
   - 目标：音乐强的时候人更“浮出来”，安静时人像稍微退一点，让底图多一点空间。

---

## 2) 摄像头做“柔和背景”（环境氛围 + 视觉层叠加）

适合：场地环境画面（舞池、灯光）做背景，Liquid/PM 盖在上面。

1. 在 Background：  
   - 打开 `Camera`；  
   - 保持 Liquid/PM 也开启。
2. Camera 参数建议：  
   - `opacity ≈ 0.2–0.4`：  
     - 让摄像头画面“隐约可见”，但主感觉仍然来自 Liquid/PM；  
   - 如果现场灯光很亮，可以稍微把 `opacity` 再降一点（避免过曝）。  
3. overlayBudget：  
   - `overlayBudgetPriorityCamera` 保持和 Basic/Liquid 接近或者略低；  
   - 重点让 Camera 做“填空”的角色，不抢主视觉。

---

## 3) 摄像头 + 人像分割（人物在前，底图跟着动）

适合：做“人物剪影 + 动态背景”的效果。

1. 在 Camera 控制面板：  
   - 打开**人像分割**（如果开关存在，一般叫 `segmentPerson`）；  
   - 初始设置：  
     - `segmentQuality = medium`；  
     - `segmentFps ≈ 15`；  
     - `segmentEdgeBlurPx ≈ 6–10`（边缘不要太硬）。  
2. 调整透明度与底图关系：  
   - `opacity ≈ 0.5–0.8`：人物应清晰可见；  
   - 底图（Liquid/PM）的亮度/对比不要太高，避免人物被底图“吃掉”。  
3. 如果有 Camera→PM 联动参数（例如 `cameraEdgeToPmAmount01` 一类）：  
   - 先保持略小的数值（例如 0.2–0.4），看人物移动时 PM 是否有一点点透明度变化；  
   - 感觉太弱可以微调上去，但不要一次拉满，避免 PM 抖得太厉害。

---

## 4) 快速自检 checklist（摄像头相关）

- 画面是否“只剩摄像头”：  
  - 如果是，先把 Camera `opacity` 降到 0.3–0.6，确认 Liquid/PM 又能看见。  
- 画面是否“看不出摄像头存在”：  
  - 略微提高 `opacity`，或在 overlayBudget 中提高 Camera 的 priority 一点点。  
- 人像分割是否“边缘严重撕裂”：  
  - 适当增大 `segmentEdgeBlurPx`，并把 `segmentQuality` 调成 medium 或 high。  
- 摄像头是否“很无聊”：  
  - 试着把 Camera 当成一层“前景 / 背景 overlay”，而不是唯一画面：  
    - 前景模式：Camera 在上面，Liquid/PM 在后面；  
    - 背景模式：Camera 在下面，Liquid/PM/Depth 在上面；  
    - 场地允许的话，让人物/灯光多进入镜头，让画面本身更有内容。

