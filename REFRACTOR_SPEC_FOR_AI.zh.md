# newliveweb 重构/融合/音频总线 �?AI 执行规格（面向编�?AI�?
> 目的：把现有计划 [REFRACTOR_PLAN.zh.md](REFRACTOR_PLAN.zh.md) 重新组织�?*可被编程 AI 直接执行**的规格文档：
> - 明确不变量（invariants）与禁止事项（do-not�?> - 明确模块边界与数据流（单向）
> - 明确每一步的最小变更、依赖关系与验收标准
> - 明确与当前代码一致的“事实”（不要依赖旧假设）

---

## 0. 当前事实快照（以代码为准�?
**入口与现�?*
- 入口：`src/main.ts` 仍是巨石（DOM 拼装 + query + 事件绑定 + preset + favorites + audio wiring + layers wiring）�?- 渲染编排：`src/SceneManager.ts`（OrthographicCamera + render loop + resize）�?- ProjectM：`src/projectm/ProjectMEngine.ts` + `src/layers/ProjectMLayer.ts`（canvas �?CanvasTexture �?overlay mesh）�?- 音频：`src/audio/StreamAudioProcessor.ts`（AudioContext + MediaElement + Analyser�? `src/audio/AudioController.ts`（RAF 分发）�?- Dev 本地音频：`vite.config.ts` 已新�?`GET /__local_audio?path=...`（支�?Range，解�?`/@fs` 对音频的 SPA fallback 问题）�?- Headless 验证：`scripts/headless-verify.mjs`（DSF 默认 1.5；点击触发音频；忽略 /__local_audio �?HEAD abort）�?
**融合现状**
- ProjectM 叠加：`ProjectMLayer` 当前固定 `THREE.AdditiveBlending` + `opacity`�?- LiquidMetal 背景：`LiquidMetalLayerV2`（未在此文展开代码细节，但作为“底层背景层”存在）�?- Renderer 色彩：`SceneManager` 尚未显式设置 `renderer.outputColorSpace` / `toneMapping`（计划要求补齐）�?
---

## 1. 全局不变量（必须始终成立�?
### 1.1 单向数据流（Hard Rule�?- 唯一跨层信号来源：`AudioBus` �?`VisualStateStore`�?- Layer 之间禁止互相 import / 互相调用（避免循环依�?+ 生命周期不清）�?
**允许的调用方�?*
- `app/*` 装配：创建、连接、dispose�?- `features/*`（UI/业务）→ 通过 controller/store/bus 的公开 API 影响系统�?- `layers/*` 只接受稳定输入（setXxx），不拉�?DOM、不读写 localStorage、不创建业务定时器�?
### 1.2 “互相影响”分三阶段推进（Hard Rule�?1) **共享控制信号**（AudioFrame.energy/bands）——最低风险，最快看到“协同”�?2) **参数耦合**（GlobalColor/BlendParams 统一）——把风格统一做出来�?3) **像素级反�?*（采样统�?Compositor）——最强互相影响，最后做�?
### 1.3 融合语义固定（Hard Rule�?- 合成顺序固定：背景是 dst，ProjectM �?overlay(src) 后画（或�?compositor �?src/dst 语义等价）�?- `BlendParams.opacity` 永远表示 ProjectM overlay 强度；未来上 Compositor 不允许改变该语义�?
### 1.4 颜色空间/色调映射可见且一致（Hard Rule�?- `SceneManager` 必须明确 renderer �?color management（至�?`outputColorSpace`，toneMapping 可先固定）�?- Diagnostics 必须显示这些关键配置，避免未来无意回退�?
---

## 2. 目标架构（可执行的接口定义）

### 2.1 Types（必�?JSON-safe 的状�?/ �?JSON 的帧数据�?
**VisualState（JSON-safe，可收藏/随机/持久化）**
```ts
// src/types/visualState.ts
export type VisualStateV1 = {
  version: 1;
  global: {
    seed: number;
    paletteId: string;
    energyScale: number;
  };
  liquidMetal: Record<string, unknown>; // 逐步替换�?LiquidMetalParams
  projectm: {
    presetId: string | null;
    presetUrl: string | null;
    opacity: number;
    blendMode: 'normal' | 'add' | 'screen' | 'multiply';
    audioDrivenOpacity: boolean;
    energyToOpacityAmount: number;
  };
  audio?: {
    // P2 才需要完整做大；P0 可以先不�?state
    profile: 'clean' | 'punchy';
  };
};
```

**AudioFrame（非 JSON，复�?buffer；由 AudioBus 生产�?*
```ts
// src/types/audioFrame.ts
export type AudioFrame = {
  version: 1;
  timeSec: number;
  sampleRate: number;
  pcm2048Mono: Float32Array;
  pcm512Mono: Float32Array;
  pcm512StereoLR: { left: Float32Array; right: Float32Array };
  bands: { low: number; mid: number; high: number };
  rms: number;
  peak: number;
  energy: number;     // 0..1，统一控制信号
  isSilent: boolean;
};
```

### 2.2 Bus/Store/Layer API（稳定输入口�?
**AudioBus**
```ts
export class AudioBus {
  subscribe(cb: (frame: AudioFrame) => void): () => void;
  getSnapshot(): AudioFrame | null;
}
```

**VisualStateStore**
```ts
export class VisualStateStore {
  getSnapshot(): VisualStateV1;
  replace(next: VisualStateV1): void;
  applyPartial(patch: Partial<VisualStateV1>): void;
}
```

**Layers（对外输入口�?*
- `LiquidMetalLayerV2.setAudioFrame(frame: AudioFrame)`
- `LiquidMetalLayerV2.setGlobalColor(state: VisualStateV1['global'])`（最小：tint/paletteId 可先占位�?- `ProjectMLayer.setAudioFrame(frame: AudioFrame)`（只�?`pcm512StereoLR`�?- `ProjectMLayer.setBlendParams(p: VisualStateV1['projectm'])`（至少处�?opacity/blendMode/energy 驱动�?
---

## 3. 执行计划（优化后的顺�?+ 依赖 + 最�?TODO�?
> 核心策略：先让“系统可�?+ 语义锁死 + 数据流统一”（P0），再拆 main.ts（P1），最后做强互相影响（P2）�?
### P0：最小闭环（可测 + 可调 + 同步协同�?
**P0 成功定义（规格一定）**
- Diagnostics 必须有：`AudioContext.state`、`AudioFrame.energy/rms/peak`、`__projectm_verify.framesRendered/lastAudioRms`、renderer.getPixelRatio/outputColorSpace/toneMapping`，保持真文章折叠，可视形变化�?
- AudioBus 与咟接支合关：所有对音频的解析、推受该�? AudioBus 内，播播控口只控制准分发来源，避免洗出清物作用蔙过算法被�?��同道�?���?
- BlendParams 语义固定：只�? opacity 表示 PM overlay 强度，AudioDrivenOpacity = base + energy * amount（去效为自然）�?�Mompositor 上同语义，私自然均策略）
- Compositor / RT 一致：RT 分配根据 renderer drawingBuffer 或加单值阶�?（如 1/2）「偿免除 CSS 处理、后送非取电子源逆图情况（将 DPR �?1.5 事项有过率变出现�?
- ParamSchema 副件：先把第�?项线的观效美量上 schema 〚ClendMode/opacity/energyToOpacityAmount`，Clobal tintStrength/contrast`，Audio energyScale`，后续你能进�?步加�? LiquidMetal 全部参数�?
- ����：每�? verify:dev + Diagnostics 变化可见；要求�@看运动或黑小生呼：Deadless 报表 `projectMFramesRendered` 必�?��?�伌canvas hash 必�?��?�伌不能变�?�无感放过琬视）
**P0-1 Diagnostics 面板（先解决误判�?*
- 目标�? 分钟内回答：音频在播吗？AudioFrame 非零吗？ProjectM 在渲染吗�?- 最�?TODO�?  - 新增 `src/features/console/DiagnosticsPanel.ts`（只读、可折叠）�?  - 展示：AudioContext state、当前音频源（file/url）、`rms/peak/energy/bands`、`__projectm_verify.framesRendered/lastAudioRms`、renderer color config�?- 验收：打开 dev 后点击一次页面，Diagnostics 数值变化且不报错�?
**P0-2 AudioBus v1（稳定协议，不追求复杂算法）**
- 最�?TODO�?  - 新增 `src/types/audioFrame.ts`�?  - 新增 `src/audio/AudioBus.ts`：基�?`StreamAudioProcessor.getAnalysisData()` 产出 `AudioFrame`�?  - 实现 `resampleTo512`（简单步�?线性均可）；`pcm512StereoLR` �?L=R�?  - 实现 `energy = clamp(max(peak, rms*1.5))` 并可选轻微平滑�?- 验收：Diagnostics �?AudioFrame �?energy/bands 随音乐变化�?
**P0-3 统一输入口（两层吃同一�?frame�?*
- 最�?TODO�?  - 给两层补 `setAudioFrame(frame)`；main 只订�?AudioBus 转发�?  - 暂时保留 AudioController 负责播放，但“分发源”必须唯一：AudioBus�?- 验收：两层响应同步（至少 energy 驱动的效果一致）�?
**P0-4 BlendParams 最小可控（别上 compositor�?*
- 最�?TODO�?  - `ProjectMLayer.setBlendParams()`：映射到 Three blending（normal/add/screen/multiply）�?  - `ProjectMLayer.update()`：如�?`audioDrivenOpacity`，将 `opacity = base + energy * amount`（并 clamp 0..1）�?- 验收：切�?blendMode/opacity 能立即看到变化；energy 驱动时“跟拍”�?
**P0-5 SceneManager 色彩空间显式�?*
- 最�?TODO�?  - �?`SceneManager` 设置 `renderer.outputColorSpace = THREE.SRGBColorSpace`�?  - 选择一个固定的 toneMapping（或先不设置，但必须�?Diagnostics 显示当前值）�?- 验收：不同机器上融合观感更一致；Diagnostics 可看到配置�?
**P0 测试命令（统一�?*
- 手动：`npm run dev` �?打开 `http://127.0.0.1:5174/` �?点击画面�?- Headless：`$env:VERIFY_DSF='1.5'; node scripts/headless-verify.mjs`，检�?`artifacts/headless/report.json` 与截图�?
---

### P1：结构化拆分（让 AI 可长期迭代）

**P1-1 renderShell：把 DOM/query �?main.ts 拆走**
- 最�?TODO：只�?DOM �?query，保�?id/class 完全一致�?
**P1-2 VisualStateStore：状态集中，收藏/随机都围�?VisualState**
- 最�?TODO：先覆盖现有 favorites/preset/opacity/liquid params snapshot；不追求全字段�?
**P1-3 ParamSchema + SeededRng：随机与范围成为单一事实来源**
- 最�?TODO：先�?LiquidMetal 已有 UI 字段�?schema；ProjectM 先只�?opacity/blend�?
**P1-4 Favorites Feature、P1-5 Presets Feature、P1-6 bootstrap**
- 最�?TODO：把 main.ts 里的业务块拆�?controller/store，但只通过 store/bus/layer 的公开 API 交互�?
---

### P2：强互相影响（像素级反馈 / compositor�?
**P2-1 低频统计反馈（ProjectM �?背景�?*
- 只做统计�?~5Hz 采样少量点，输出 `avgLuma/avgColor`�?- 作为调制信号叠加�?LiquidMetal（强度可�?可关）�?
**P2-2 Compositor v1（真正融合）**
- 背景渲染�?RT；ProjectM 作为纹理；合�?shader 实现 overlay/screen/add�?- 关键：保�?BlendParams 语义不变�?
---

## 4. 与当前代码不一�?高风险点（AI 必须显式处理�?
- `src/main.ts` 目前仍直接使�?`AudioController.onFrame(...)` 分发�?`computeEnergyCoefficient()`；引�?AudioBus 后必须做到“单一分发源”，否则会出现两套不同平�?增益�?- ProjectM WASM：某些构建可能对 `Module.HEAP*` 访问敏感（历史上出现�?abort）；任何访问前必须以实际运行日志/验证为准�?- DPR/尺寸：ProjectM canvas �?Emscripten 与手动锁定共同作用；任何改动 resize 逻辑必须带上 DSF=1.5 �?headless 回归�?- 本地音频路径：当前推荐使�?`__local_audio`（不要再依赖 `/@fs` 来加�?MP3）�?
---

## 5. 禁止事项（Do-Not List，避免返工）

- 禁止�?Layer 直接操作 DOM �?localStorage�?- 禁止�?Layer 互相 import 或相互持有引用�?- 禁止在两层内部各自做“自己的 energy/bands 平滑/归一化”（必须集中�?AudioBus）�?- 禁止在未建立 Diagnostics 前就做复杂融合（否则调参靠猜）�?- 禁止改变 BlendParams 的语义（opacity/mix 的含义一旦确定不得反转）�?
---

## 6. 交付物清单（AI 完成每阶段必须产出）

- P0�?  - 新增 Diagnostics 面板文件 + AudioBus 文件 + AudioFrame 类型文件�?  - `headless-verify` 通过，`artifacts/headless/report.json` 显示 canvas 非空/变化，且无致命错误�?- P1�?  - 新增 renderShell + VisualStateStore + paramSchema + seededRng + bootstrap；main.ts 明显变薄�?- P2�?  - 新增 sampler/compositor；提供开关与强度参数（默认关闭以保证稳定）�?

## 2026 �yɫ��̫�����wɫ��Ҏ������ǰ��/Shader/Compositor ������
- ���Aɫ�P��
  - Һ�B���ٻ��� `#d8dde7` / �߹� `#fefefe` / ���� `#0f1118`��
  - �ڶ��{�ڝu�ӣ�`#060712 -> #0f1b2d -> #3f4b5f`��radial����
  - ���x���c�Y�����{ `#21d8ff`����� `#f14dff`�����x��G `#b7ff4a` ���������ȡ�
- ���|�Z�x��
  - �yɫҺ�B���٣�metalness 0.85~1.0��roughness 0.08~0.18�������R��У�
  - ̫�Չm/�����ֲڶ���ߵ� 0.35~0.5��metalness 0.2~0.4���B�Ӽ������sӍ��
  - �ڶ��p϶�������㷴�䣬�ɫ�i�� `#03040a`~`#0b0f1c`���ɯB�ӃȰl�⡣
- Shader/Compositor ���h��
  - ������ radial gradient + curl noise flow map�����l��߶����ӣ����lֻ 10~20%����
  - Overlay ���� gamma ���_��Screen/SoftLight ������Add ֻ�ڸ߹�Oֵ������ double-gamma��
  - Glow ֻ���ڵ��x���c�Y���ֵ tone-mapped ���� bloom����ֹȫ�ַ��ס�
- UI/�����ӌ��R��
  - �ؼ�/��B�ñ��{/��������{ɫ������ů��/�أ�
  - Diagnostics/��ʾ�ð��� `#0f1118`�����ֻ� `#c9d0da`���e�`�t `#ff5f6c`���ɹ��G `#6de28d`��
- �ӑB���ࣺ
  - �������� < 0.05 units/s���R��߹���� 0.2~0.3 �Ķ��ӷ��ȣ�
  - �ڶ����Ŀ������l�տs/�}�n��0.2~0.4 Hz�����c���l energy ���� 0.2~0.5 ���ء�
- ���ɣ�
  - ��Ҫ����eʹ��ͼt/�ȣ�
  - ��Ҫ�ڲ�ͬ�Ӹ��� gamma���yһ�� Compositor / renderer outputColorSpace/toneMapping ���ơ�
