import { getLang } from "./i18n";

export type DomRefs = {
  root: HTMLDivElement;
  toolbar: HTMLDivElement;
  toolbarToggleButton: HTMLButtonElement;
  toolbarDebugToggleButton: HTMLButtonElement;
  toolbarAdvancedToggleButton: HTMLButtonElement;
  toolbarBody: HTMLDivElement;
  uiOpacityInput: HTMLInputElement;
  uiOpacityText: HTMLSpanElement;
  canvasRoot: HTMLDivElement;
  canvas: HTMLCanvasElement;

  audioStatus: HTMLSpanElement;
  audioToggle: HTMLButtonElement;
  audioInputDeviceSelect: HTMLSelectElement;
  audioInputUseButton: HTMLButtonElement;
  audioSystemUseButton: HTMLButtonElement;
  audioFileInput: HTMLInputElement;
  audioUrlInput: HTMLInputElement;
  audioUrlButton: HTMLButtonElement;
  audioMixxxConnectButton: HTMLButtonElement;
  audioVolumeInput: HTMLInputElement;
  audioVolumeText: HTMLSpanElement;
  audioSeekInput: HTMLInputElement;
  audioTime: HTMLSpanElement;
  audioLevelBar: HTMLDivElement;
  audioLevelText: HTMLSpanElement;
  audioEnergyText: HTMLSpanElement;
  audioTempoText: HTMLSpanElement;
  audioConfText: HTMLSpanElement;
  audioStabilityText: HTMLSpanElement;
  audioWaveform: HTMLCanvasElement;

  presetSelect: HTMLSelectElement;
  presetFileInput: HTMLInputElement;
  presetUrlInput: HTMLInputElement;
  presetUrlButton: HTMLButtonElement;
  presetStatus: HTMLSpanElement;
  presetManifestInfo: HTMLSpanElement;
  presetNextButton: HTMLButtonElement;
  presetAutoToggle: HTMLInputElement;
  presetAutoIntervalInput: HTMLInputElement;
  presetAutoLabel: HTMLSpanElement;
  presetLibrarySelect: HTMLSelectElement;

  visualRandomButton: HTMLButtonElement;
  visualRandomParamsButton: HTMLButtonElement;
  visualHoldButton: HTMLButtonElement;
  visualFavoriteButton: HTMLButtonElement;
  visualFavoriteCount: HTMLSpanElement;
  autoTechnoToggle: HTMLInputElement;
  followAiToggle: HTMLInputElement;
  technoProfileSelect: HTMLSelectElement;
  aivjStatusPill: HTMLSpanElement;
  technoProfileSummary: HTMLSpanElement;
  audioControlsToggle: HTMLInputElement;
  audioDrivePresetSelect: HTMLSelectElement;
  beatTempoToggle: HTMLInputElement;
  bgTypeSelect: HTMLSelectElement;
  layerLiquidToggle: HTMLInputElement;
  layerBasicToggle: HTMLInputElement;
  layerCameraToggle: HTMLInputElement;
  layerVideoToggle: HTMLInputElement;
  layerDepthToggle: HTMLInputElement;
  cameraControlsRow: HTMLDivElement;
  videoControlsRow: HTMLDivElement;
  depthControlsRow: HTMLDivElement;
  depthParamsRow: HTMLDivElement;
  basicOpacityInput: HTMLInputElement;
  basicOpacityText: HTMLSpanElement;
  cameraOpacityInput: HTMLInputElement;
  cameraOpacityText: HTMLSpanElement;
  videoOpacityInput: HTMLInputElement;
  videoOpacityText: HTMLSpanElement;
  cameraDeviceSelect: HTMLSelectElement;
  depthSourceSelect: HTMLSelectElement;
  depthDeviceSelect: HTMLSelectElement;
  depthShowDepthToggle: HTMLInputElement;
  depthOpacityInput: HTMLInputElement;
  depthOpacityText: HTMLSpanElement;
  depthFogInput: HTMLInputElement;
  depthFogText: HTMLSpanElement;
  depthEdgeInput: HTMLInputElement;
  depthEdgeText: HTMLSpanElement;
  depthLayersInput: HTMLInputElement;
  depthLayersText: HTMLSpanElement;
  depthBlurInput: HTMLInputElement;
  depthBlurText: HTMLSpanElement;
  depthStatusText: HTMLSpanElement;
  cameraSegmentToggle: HTMLInputElement;
  cameraEdgeToPmInput: HTMLInputElement;
  cameraEdgeToPmText: HTMLSpanElement;
  bgVariantSelect: HTMLSelectElement;
  bgVariantLockToggle: HTMLInputElement;

  macroFusionInput: HTMLInputElement;
  macroFusionValueText: HTMLDivElement;
  macroMotionInput: HTMLInputElement;
  macroMotionValueText: HTMLDivElement;
  macroSparkleInput: HTMLInputElement;
  macroSparkleValueText: HTMLDivElement;
  macroFusionSaveButton: HTMLButtonElement;
  macroFusionLoadButton: HTMLButtonElement;
  macroMotionSaveButton: HTMLButtonElement;
  macroMotionLoadButton: HTMLButtonElement;
  macroSparkleSaveButton: HTMLButtonElement;
  macroSparkleLoadButton: HTMLButtonElement;
  macroRandomButton: HTMLButtonElement;
  macroAddSlotButton: HTMLButtonElement;
  macroSlotsContainer: HTMLDivElement;
  macroBankStatusPill: HTMLSpanElement;
  macroPresetSelect: HTMLSelectElement;
  macroPresetApplyButton: HTMLButtonElement;
  macroPresetAutoToggle: HTMLInputElement;
  macroMapToggleButton: HTMLButtonElement;
  macroMapApplyButton: HTMLButtonElement;
  macroMapRandomButton: HTMLButtonElement;
  macroMapSaveButton: HTMLButtonElement;
  macroMapLoadButton: HTMLButtonElement;
  macroMapPanel: HTMLDivElement;
  macroMapPmOpacityMacroSelect: HTMLSelectElement;
  macroMapPmOpacityMinInput: HTMLInputElement;
  macroMapPmOpacityMaxInput: HTMLInputElement;
  macroMapPmEnergyMacroSelect: HTMLSelectElement;
  macroMapPmEnergyMinInput: HTMLInputElement;
  macroMapPmEnergyMaxInput: HTMLInputElement;
  macroMapPmReactMacroSelect: HTMLSelectElement;
  macroMapPmReactMinInput: HTMLInputElement;
  macroMapPmReactMaxInput: HTMLInputElement;
  macroMapLiquidTimeMacroSelect: HTMLSelectElement;
  macroMapLiquidTimeMinInput: HTMLInputElement;
  macroMapLiquidTimeMaxInput: HTMLInputElement;
  macroMapLiquidWaveMacroSelect: HTMLSelectElement;
  macroMapLiquidWaveMinInput: HTMLInputElement;
  macroMapLiquidWaveMaxInput: HTMLInputElement;
  macroMapLiquidMetalMacroSelect: HTMLSelectElement;
  macroMapLiquidMetalMinInput: HTMLInputElement;
  macroMapLiquidMetalMaxInput: HTMLInputElement;
  macroMapLiquidSpeedMacroSelect: HTMLSelectElement;
  macroMapLiquidSpeedMinInput: HTMLInputElement;
  macroMapLiquidSpeedMaxInput: HTMLInputElement;
  macroMapLiquidBrightnessMacroSelect: HTMLSelectElement;
  macroMapLiquidBrightnessMinInput: HTMLInputElement;
  macroMapLiquidBrightnessMaxInput: HTMLInputElement;
  macroMapLiquidContrastMacroSelect: HTMLSelectElement;
  macroMapLiquidContrastMinInput: HTMLInputElement;
  macroMapLiquidContrastMaxInput: HTMLInputElement;

  pmOpacityInput: HTMLInputElement;
  pmOpacityText: HTMLSpanElement;
  pmBlendModeSelect: HTMLSelectElement;
  pmAudioOpacityToggle: HTMLInputElement;
  pmEnergyOpacityInput: HTMLInputElement;
  pmEnergyOpacityText: HTMLSpanElement;
  pmPriorityInput: HTMLInputElement;
  pmPriorityText: HTMLSpanElement;
  pmRetreatStrengthInput: HTMLInputElement;
  pmRetreatStrengthText: HTMLSpanElement;
  pmBudgetStatusText: HTMLSpanElement;

  showSetupButton: HTMLButtonElement;
  showSaveButton: HTMLButtonElement;
  fullscreenToggleButton: HTMLButtonElement;
  calibrationToggle: HTMLButtonElement;
  snapshotExportButton: HTMLButtonElement;
  videoRetryButton: HTMLButtonElement;
  videoSrcHint: HTMLSpanElement;
  videoSrcInput: HTMLInputElement;
  videoSrcApplyButton: HTMLButtonElement;

  inspectorStatus: HTMLSpanElement;
  inspectorToggleButton: HTMLButtonElement;
  inspectorSearchInput: HTMLInputElement;
  inspectorShowAdvancedToggle: HTMLInputElement;
  inspectorResetButton: HTMLButtonElement;
  inspectorContainer: HTMLDivElement;

  midiStatus: HTMLSpanElement;
  midiBindingsCount: HTMLSpanElement;
  midiConnectButton: HTMLButtonElement;
  midiTargetSelect: HTMLSelectElement;
  midiLearnButton: HTMLButtonElement;
  midiUnbindButton: HTMLButtonElement;
  midiClearButton: HTMLButtonElement;
  midiBindingLabel: HTMLSpanElement;
};

export type RenderShellOptions = {
  librarySelectOptionsHtml: string;
  audioUrlPlaceholder: string;
  presetUrlPlaceholder: string;
  testAudioLibraryPathLabel: string;
  presetPackPathLabel: string;
};

export function renderShell(
  app: HTMLElement,
  opts: RenderShellOptions
): DomRefs {
  const lang = getLang();
  const s = (zh: string, en: string) => (lang === "zh" ? zh : en);

  app.innerHTML = `
  <div id="root" class="app-root">
    <div id="toolbar" class="toolbar">
      <div class="toolbar__bar">
        <div class="toolbar__bar-left">
          <span class="toolbar__title">${s("控制面板", "Controls")}</span>
          <label class="toolbar__volume toolbar__ui-opacity" title="${s(
            "调整控制面板背景透明度（不影响画布）",
            "Adjust panel opacity (does not affect canvas)"
          )}">
            <span>${s("界面", "UI")}</span>
            <input type="range" id="ui-opacity" min="20" max="100" step="1" value="100" />
            <span id="ui-opacity-text" class="toolbar__hint toolbar__hint--status">100%</span>
          </label>
        </div>
        <div class="toolbar__bar-right">
          <button id="visual-random" class="toolbar__button toolbar__button--compact">${s(
            "随机",
            "Random"
          )}</button>
          <button
            id="visual-random-params"
            class="toolbar__button toolbar__button--compact"
            title="${s(
              "仅随机当前图层参数（不切换 ProjectM 预设）",
              "Randomize current layer params (keep ProjectM preset)"
            )}"
          >
            ${s("参数随机", "Params")}
          </button>
          <button id="visual-favorite" class="toolbar__button toolbar__button--compact">${s(
            "收藏",
            "Favorite"
          )}</button>
          <span id="visual-favorite-count" class="toolbar__hint toolbar__hint--status">0</span>
          <button id="toolbar-debug-toggle" class="toolbar__button toolbar__button--compact toolbar__pill-button" title="${s(
            "鏄剧ず/闅愯棌璋冭瘯鎺у埗",
            "Show/hide debug controls"
          )}">${s("璋冭瘯", "Debug")}</button>
          <button id="toolbar-advanced-toggle" class="toolbar__button toolbar__button--compact toolbar__pill-button" title="${s(
            "鏄剧ず/闅愯棌楂樼骇鎺у埗",
            "Show/hide advanced controls"
          )}">${s("楂樼骇", "Advanced")}</button>
          <button id="toolbar-toggle" class="toolbar__button toolbar__button--compact" title="${s(
            "展开/收起控制面板",
            "Expand/collapse controls"
          )}">${s("收起", "Collapse")}</button>
        </div>
      </div>
      <div id="toolbar-body" class="toolbar__body">
        <div class="toolbar__grid">
        <div class="toolbar__section" data-group="live">
          <div class="toolbar__section-header">
            <span class="toolbar__title">newliveweb - LiquidMetal + ProjectM</span>
            <span id="audio-status" class="toolbar__status toolbar__status--tight">${s(
              "未加载音频",
              "No audio loaded"
            )}</span>
          </div>
          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-lg">
            <button id="audio-toggle" class="toolbar__button" disabled>${s(
              "播放",
              "Play"
            )}</button>

            <label class="toolbar__hint toolbar__hint--select" title="${s(
              "选择音频输入设备（麦克风/调音台/虚拟声卡）。提示：浏览器无法直接抓“系统输出”，需回环设备（Loopback/BlackHole/Stereo Mix/VB-CABLE 等）。",
              "Choose input device (mic/mixer/virtual). Browsers can't directly capture system output; use loopback (Loopback/BlackHole/Stereo Mix/VB-CABLE, etc.)."
            )}">
              <span>${s("输入设备", "Input")}</span>
              <select id="audio-input-device" class="toolbar__select toolbar__select--compact">
                <option value="">${s("系统默认", "System default")}</option>
              </select>
            </label>
            <button id="audio-input-use" class="toolbar__button toolbar__button--compact" title="${s(
              "使用选中的输入设备（需要浏览器权限）",
              "Use selected input device (requires permission)"
            )}">${s("使用输入", "Use input")}</button>

            <button
              id="audio-system-use"
              class="toolbar__button toolbar__button--compact"
              title="${s(
                "（实验）尝试使用系统音频（平台/权限限制较多）",
                "(Experimental) Try system audio (platform/permission dependent)"
              )}">
              ${s("系统音频", "System audio")}
            </button>

            <label class="toolbar__hint" title="${s(
              "加载本地音频文件（用于测试）",
              "Load local audio file (testing)"
            )}" style="min-width:var(--nw-toolbar-min-220);">
              <span>${s("本地文件", "File")}</span>
              <input id="audio-file" type="file" accept="audio/*" />
            </label>

            <label class="toolbar__hint" title="${s(
              "从 URL 加载音频（支持本地 /__local_audio 代理）",
              "Load audio from URL"
            )}" style="min-width:var(--nw-toolbar-min-260);">
              <span>URL</span>
              <input id="audio-url" class="toolbar__input" type="text" placeholder="${
                opts.audioUrlPlaceholder
              }" />
            </label>
            <button id="audio-url-load" class="toolbar__button toolbar__button--compact">${s(
              "加载",
              "Load"
            )}</button>

            <button id="audio-mixxx-connect" class="toolbar__button toolbar__button--compact" title="${s(
              "连接 Mixxx（如果启用）",
              "Connect Mixxx (if enabled)"
            )}">Mixxx</button>
          </div>

          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-sm">
            <label class="toolbar__volume">
              <span>${s("音量", "Volume")}</span>
              <input id="audio-volume" type="range" min="0" max="100" step="1" value="0" />
              <span id="audio-volume-text" class="toolbar__hint toolbar__hint--status">0%</span>
            </label>

            <label class="toolbar__volume" style="min-width:min(var(--nw-toolbar-min-280), 100%);">
              <span>${s("进度", "Seek")}</span>
              <input id="audio-seek" type="range" min="0" max="1000" step="1" value="0" />
              <span id="audio-time" class="toolbar__hint toolbar__hint--status">0:00</span>
            </label>

            <div class="toolbar__volume" title="${s(
              "输入能量（仅用于提示）",
              "Input level (for hints)"
            )}" style="min-width:min(var(--nw-toolbar-min-220), 100%);">
              <span>${s("电平", "Level")}</span>
              <div class="toolbar__level">
                <div id="audio-level-bar" class="toolbar__level-bar"></div>
              </div>
              <span id="audio-level-text" class="toolbar__hint toolbar__hint--status">0.00</span>
            </div>

            <div class="toolbar__waveform" aria-label="${s(
              "波形图",
              "Waveform"
            )}">
              <canvas id="audio-waveform"></canvas>
            </div>

            <div class="toolbar__audio-metrics" aria-label="${s(
              "音频特征",
              "Audio features"
            )}">
                <span id="audio-energy-text" class="toolbar__hint toolbar__hint--status" title="${s(
                  "能量（0-100%）",
                  "Energy (0-100%)"
                )}">E --%</span>
                <span id="audio-tempo-text" class="toolbar__hint toolbar__hint--status" title="${s(
                  "节拍速度（BPM）",
                  "Tempo (BPM)"
                )}">BPM --</span>
                <span id="audio-conf-text" class="toolbar__hint toolbar__hint--status" title="${s(
                  "节拍置信度（0-100%）",
                  "Beat confidence (0-100%)"
                )}">C --%</span>
                <span id="audio-stability-text" class="toolbar__hint toolbar__hint--status" title="${s(
                  "稳定度置信度（基于 BPM 稳定性，0-100%）",
                  "Stability confidence (derived from BPM stability, 0-100%)"
                )}">S --%</span>
            </div>
          </div>
        </div>

        <div class="toolbar__section" data-group="live">
          <div class="toolbar__section-header">
            <span class="toolbar__title">${s("预设", "Presets")}</span>
            <span id="preset-status" class="toolbar__status toolbar__status--tight">--</span>
          </div>
          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-lg">
            <label class="toolbar__hint toolbar__hint--select">
              <span>${s("库", "Library")}</span>
              <select id="preset-library-select" class="toolbar__select toolbar__select--compact">
                ${opts.librarySelectOptionsHtml}
              </select>
            </label>
            <label class="toolbar__hint toolbar__hint--select" style="min-width:min(var(--nw-toolbar-min-320), 100%);">
              <span>${s("选择", "Select")}</span>
              <select id="preset-select" class="toolbar__select">
                <option disabled selected>${s("加载中…", "Loading…")}</option>
              </select>
            </label>
            <button id="preset-next" class="toolbar__button toolbar__button--compact" title="${s(
              "下一个预设",
              "Next preset"
            )}">${s("下一个", "Next")}</button>
            <span id="preset-manifest-info" class="toolbar__hint toolbar__hint--status">--</span>
          </div>
          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-lg">
            <label class="toolbar__hint" style="min-width:min(var(--nw-toolbar-min-220), 100%);">
              <span>${s("导入", "Import")}</span>
              <input id="preset-file" type="file" accept=".milk,.txt" />
            </label>
            <label class="toolbar__hint" style="min-width:min(var(--nw-toolbar-min-280), 100%);">
              <span>${s("预设 URL", "Preset URL")}</span>
              <input id="preset-url" class="toolbar__input" type="text" placeholder="${
                opts.presetUrlPlaceholder
              }" />
            </label>
            <button id="preset-url-load" class="toolbar__button toolbar__button--compact">${s(
              "加载",
              "Load"
            )}</button>
            <label class="toolbar__switch toolbar__switch--mini" title="${s(
              "自动切换预设",
              "Auto cycle presets"
            )}">
              <input id="preset-auto-toggle" type="checkbox" />
              <span>${s("自动", "Auto")}</span>
            </label>
            <label class="toolbar__hint" title="${s(
              "自动切换间隔（秒）",
              "Auto interval (sec)"
            )}">
              <span>${s("间隔", "Interval")}</span>
              <input id="preset-auto-interval" class="toolbar__input" type="number" min="15" max="600" step="1" value="90" />
            </label>
            <span id="preset-auto-label" class="toolbar__hint toolbar__hint--status">--</span>
          </div>
        </div>

        <div class="toolbar__section" data-group="live">
          <div class="toolbar__section-header">
            <span class="toolbar__title">${s("画面", "Visual")}</span>
            <span
              id="aivj-status-pill"
              class="toolbar__hint toolbar__hint--pill"
              data-aivj-state="off"
              title="${s(
                "AIVJ 运行态：OFF=关闭；AI=自动驱动 8 宏；MIDI lock=已映射 8 控，宏由 MIDI 接管（AIVJ 仍做融合淡入淡出）",
                "AIVJ runtime: OFF=disabled; AI=drives 8 macros; MIDI lock=8 mapped, knobs owned by MIDI (AIVJ still fades mixing)"
              )}">${s("AIVJ: 关", "AIVJ: off")}</span>
          </div>

          <!-- 核心控制 -->
          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-sm">
            <button
              id="visual-hold"
              class="toolbar__button toolbar__button--compact"
              title="${s(
                "保持当前预设（空格）",
                "Hold current preset (Space)"
              )}"
            >
              ${s("保持", "Hold")}
            </button>
          </div>

          <!-- AIVJ 配置 -->
          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-sm">
            <label class="toolbar__switch toolbar__switch--mini" title="${s(
              "AIVJ 自动：按小节量化做 2–8 秒平滑过渡（驱动 8 宏：3 个主宏 + M4–M8）。若已绑定 MIDI 8 控，则宏旋钮由 MIDI 接管，AIVJ 仍负责淡入淡出驱动 ProjectM/背景融合。",
              "AIVJ auto: bar-quantized 2–8s morph (drives 8 macros: 3 main + M4–M8). If MIDI 8 is mapped, knobs stay under MIDI; AIVJ still fades ProjectM/background mixing."
            )}">
              <input id="auto-techno-toggle" type="checkbox" />
              <span>${s("AIVJ 自动", "AIVJ Auto")}</span>
            </label>

            <label class="toolbar__switch toolbar__switch--mini" title="${s(
              "跟随 AI：开启后宏旋钮会随 AIVJ 自动变化（界面会动）",
              "Follow AI: sync macro UI to AIVJ output (knobs will move)"
            )}">
              <input id="follow-ai-toggle" type="checkbox" />
              <span>${s("跟随AI", "Follow AI")}</span>
            </label>

            <label class="toolbar__hint toolbar__hint--select">
              <span>${s("风格", "Style")}</span>
              <select id="techno-profile-select" class="toolbar__select toolbar__select--compact">
                <option value="ambient">Ambient</option>
                <option value="peakRave">Peak Rave</option>
                <option value="dub">Dub</option>
                <option value="drone">Drone</option>
                <option value="videoVj">Video VJ</option>
                <option value="custom">${s("自定义", "Custom")}</option>
              </select>
            </label>

            <label class="toolbar__hint toolbar__hint--select">
              <span>${s("音频驱动", "Audio Drive")}</span>
              <select id="audio-drive-preset" class="toolbar__select toolbar__select--compact">
                <option value="balanced">${s("均衡", "Balanced")}</option>
                <option value="punch">${s("冲击", "Punch")}</option>
                <option value="intense">${s("强烈", "Intense")}</option>
                <option value="subtle">${s("轻柔", "Subtle")}</option>
              </select>
            </label>

            <label class="toolbar__switch toolbar__switch--mini">
              <input id="audio-controls-toggle" type="checkbox" />
              <span>${s("音频控", "AudioCtl")}</span>
            </label>

            <label class="toolbar__switch toolbar__switch--mini">
              <input id="beat-tempo-toggle" type="checkbox" checked />
              <span>${s("节拍", "Beat")}</span>
            </label>

            <span id="techno-profile-summary" class="toolbar__hint toolbar__hint--status">--</span>
          </div>

          <!-- 背景图层 -->
          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-sm">
            <label class="toolbar__hint toolbar__hint--select">
              <span>${s("编辑层", "Edit")}</span>
              <select id="bg-type-select" class="toolbar__select toolbar__select--compact">
                <option value="none">${s("无", "None")}</option>
                <option value="basic">Basic</option>
                <option value="camera">${s("摄像头", "Camera")}</option>
                <option value="video">${s("视频", "Video")}</option>
                <option value="depth">Depth</option>
              </select>
            </label>
            <label class="toolbar__hint toolbar__hint--select">
              <span>${s("背景", "Background")}</span>
              <select id="bg-variant-select" class="toolbar__select toolbar__select--compact">
                <option value="metal">Metal</option>
                <option value="waves">Waves</option>
                <option value="stars">Stars</option>
                <option value="lines">Lines</option>
              </select>
            </label>
            <label class="toolbar__switch toolbar__switch--mini" title="${s(
              "锁定变体，随机/宏不改",
              "Lock variant (random/macro won't override)"
            )}">
              <input id="bg-variant-lock" type="checkbox" />
              <span>${s("锁定", "Lock")}</span>
            </label>
          </div>

          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-sm">
            <label class="toolbar__switch toolbar__switch--mini" title="LiquidMetal">
              <input id="layer-liquid-enabled" type="checkbox" />
              <span>Liquid</span>
            </label>
          </div>

          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-sm">
            <label class="toolbar__switch toolbar__switch--mini">
              <input id="layer-basic-enabled" type="checkbox" />
              <span>Basic</span>
            </label>
            <label class="toolbar__volume toolbar__volume--mini">
              <span>op</span>
              <input id="basic-opacity" type="range" min="0" max="1" step="0.01" value="0.7" />
              <span id="basic-opacity-text" class="toolbar__hint toolbar__hint--status">70%</span>
            </label>
          </div>

          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-sm">
            <label class="toolbar__switch toolbar__switch--mini">
              <input id="layer-camera-enabled" type="checkbox" />
              <span>${s("相机", "Cam")}</span>
            </label>
            <label class="toolbar__volume toolbar__volume--mini">
              <span>op</span>
              <input id="camera-opacity" type="range" min="0" max="1" step="0.01" value="0.85" />
              <span id="camera-opacity-text" class="toolbar__hint toolbar__hint--status">85%</span>
            </label>
          </div>

          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-sm">
            <label class="toolbar__switch toolbar__switch--mini">
              <input id="layer-video-enabled" type="checkbox" />
              <span>${s("视频", "Video")}</span>
            </label>
            <label class="toolbar__volume toolbar__volume--mini">
              <span>op</span>
              <input id="video-opacity" type="range" min="0" max="1" step="0.01" value="0.7" />
              <span id="video-opacity-text" class="toolbar__hint toolbar__hint--status">70%</span>
            </label>
          </div>

          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-sm">
            <label class="toolbar__switch toolbar__switch--mini">
              <input id="layer-depth-enabled" type="checkbox" />
              <span>Depth</span>
            </label>
            <label class="toolbar__volume toolbar__volume--mini">
              <span>op</span>
              <input id="depth-opacity" type="range" min="0" max="1" step="0.01" value="0.7" />
              <span id="depth-opacity-text" class="toolbar__hint toolbar__hint--status">70%</span>
            </label>
          </div>

          <div id="camera-controls" class="toolbar__row toolbar__row--grid toolbar__row--grid-sm" style="display:none;">
            <label class="toolbar__hint toolbar__hint--select">
              <span>${s("彩色", "Color")}</span>
              <select id="camera-device" class="toolbar__select toolbar__select--compact"></select>
            </label>

            <label class="toolbar__switch toolbar__switch--mini">
              <input id="camera-seg-toggle" type="checkbox" />
              <span>${s("人像分割", "Person")}</span>
            </label>

            <label class="toolbar__volume toolbar__volume--mini">
              <span>${s("边缘→PM", "Edge→PM")}</span>
              <input id="camera-edge-pm" type="range" min="0" max="100" step="1" value="0" />
              <span id="camera-edge-pm-text" class="toolbar__hint toolbar__hint--status">0%</span>
            </label>
          </div>

          <div id="video-controls" class="toolbar__row toolbar__row--grid toolbar__row--grid-lg" style="display:none;">
            <button id="video-retry" class="toolbar__button toolbar__button--compact">${s(
              "重试视频",
              "Retry video"
            )}</button>
            <label class="toolbar__hint" style="min-width:var(--nw-toolbar-min-320);" title="${s(
              "设置视频来源 URL（例如 mp4/webm）。也可在 Inspector → Background/Video/src 设置。",
              "Set video source URL (e.g. mp4/webm). You can also set it via Inspector → Background/Video/src."
            )}">
              <span>src</span>
              <input id="video-src" class="toolbar__input" type="text" placeholder="${s(
                "https://.../video.mp4 或 /path/video.webm",
                "https://.../video.mp4 or /path/video.webm"
              )}" />
            </label>
            <button id="video-src-apply" class="toolbar__button toolbar__button--compact">${s(
              "设置",
              "Set"
            )}</button>
            <span id="video-src-hint" class="toolbar__hint toolbar__hint--status"></span>
          </div>

          <div id="depth-controls" class="toolbar__row toolbar__row--grid toolbar__row--grid-sm" style="display:none;">
            <label class="toolbar__hint toolbar__hint--select">
              <span>${s("深度源", "Depth src")}</span>
              <select id="depth-source" class="toolbar__select toolbar__select--compact">
                <option value="webcam">webcam</option>
                <option value="ws">ws</option>
                <option value="idepth">iDepth</option>
              </select>
            </label>

            <label class="toolbar__hint toolbar__hint--select">
              <span>${s("深度", "Depth")}</span>
              <select id="depth-device" class="toolbar__select toolbar__select--compact"></select>
            </label>

            <label class="toolbar__switch toolbar__switch--mini" title="${s(
              "显示原始深度预览（调试）",
              "Show raw depth preview (debug)"
            )}">
              <input id="depth-show-depth" type="checkbox" />
              <span>${s("预览", "Debug")}</span>
            </label>

            <span id="depth-status" class="toolbar__hint toolbar__hint--status">--</span>
          </div>

          <div id="depth-params" class="toolbar__row toolbar__row--grid toolbar__row--grid-sm" style="display:none;">
            <label class="toolbar__volume toolbar__volume--mini">
              <span>fog</span>
              <input id="depth-fog" type="range" min="0" max="2.5" step="0.01" value="1.1" />
              <span id="depth-fog-text" class="toolbar__hint toolbar__hint--status">1.10</span>
            </label>

            <label class="toolbar__volume toolbar__volume--mini">
              <span>edge</span>
              <input id="depth-edge" type="range" min="0" max="4" step="0.01" value="1.3" />
              <span id="depth-edge-text" class="toolbar__hint toolbar__hint--status">1.30</span>
            </label>

            <label class="toolbar__volume toolbar__volume--mini">
              <span>layers</span>
              <input id="depth-layers" type="range" min="3" max="28" step="1" value="12" />
              <span id="depth-layers-text" class="toolbar__hint toolbar__hint--status">12</span>
            </label>

            <label class="toolbar__volume toolbar__volume--mini">
              <span>blur</span>
              <input id="depth-blur" type="range" min="0" max="30" step="1" value="10" />
              <span id="depth-blur-text" class="toolbar__hint toolbar__hint--status">10</span>
            </label>
          </div>
        </div>

        <div class="toolbar__section toolbar__section--macros" data-group="live">
          <div class="toolbar__section-header">
            <span class="toolbar__title">${s("宏", "Macros")}</span>
            <span
              id="macro-bank-status-pill"
              class="toolbar__hint toolbar__hint--pill"
              data-macro-bank="ai"
              title="${s(
                "宏库状态：AI=自动驱动；MIDI lock=已映射 8 控，由 MIDI 接管",
                "MacroBank: AI=auto-driven; MIDI lock=8 mapped, owned by MIDI"
              )}">${s("宏库: AI", "MacroBank: AI")}</span>

            <button
              id="macro-random"
              class="toolbar__button toolbar__button--compact"
              title="${s(
                "仅随机宏旋钮（不切换预设）",
                "Randomize macros only (does not switch preset)"
              )}">${s("随机宏", "Rand Macros")}</button>
            <span class="toolbar__hint toolbar__hint--status">${s(
              "预设包路径：",
              "Preset pack path:"
            )} ${opts.presetPackPathLabel}</span>
          </div>
          <div class="toolbar__row toolbar__row--macros">
            <div class="nw-macro-mixer" role="group" aria-label="${s(
              "宏观旋钮",
              "Macro controls"
            )}">
              <div class="nw-macro-strip" data-macro="fusion">
                <div class="nw-macro-strip__label">fusion</div>
                <div id="macro-fusion-value" class="nw-macro-strip__value">50%</div>
                <div class="nw-knob" data-role="knob" aria-label="fusion">
                  <div class="nw-knob__dial" aria-hidden="true"></div>
                  <input id="macro-fusion" class="nw-knob__input" type="range" min="0" max="1" step="0.01" value="0.5" />
                </div>
                <div class="nw-macro-strip__meta">
                  <span>${s("PM+BG 退让", "PM+BG retreat")}</span>
                  <span>${s("PM 能量", "PM energy")}</span>
                </div>
                <div class="nw-macro-strip__actions">
                  <button id="macro-fusion-save" class="toolbar__button toolbar__button--compact">${s(
                    "收藏",
                    "Save"
                  )}</button>
                  <button id="macro-fusion-load" class="toolbar__button toolbar__button--compact">${s(
                    "载入",
                    "Load"
                  )}</button>
                </div>
              </div>
              <div class="nw-macro-strip" data-macro="motion">
                <div class="nw-macro-strip__label">motion</div>
                <div id="macro-motion-value" class="nw-macro-strip__value">50%</div>
                <div class="nw-knob" data-role="knob" aria-label="motion">
                  <div class="nw-knob__dial" aria-hidden="true"></div>
                  <input id="macro-motion" class="nw-knob__input" type="range" min="0" max="1" step="0.01" value="0.5" />
                </div>
                <div class="nw-macro-strip__meta">
                  <span>${s("速度", "Speed")}</span>
                  <span>${s("深度层数", "Depth layers")}</span>
                </div>
                <div class="nw-macro-strip__actions">
                  <button id="macro-motion-save" class="toolbar__button toolbar__button--compact">${s(
                    "收藏",
                    "Save"
                  )}</button>
                  <button id="macro-motion-load" class="toolbar__button toolbar__button--compact">${s(
                    "载入",
                    "Load"
                  )}</button>
                </div>
              </div>
              <div class="nw-macro-strip" data-macro="sparkle">
                <div class="nw-macro-strip__label">sparkle</div>
                <div id="macro-sparkle-value" class="nw-macro-strip__value">50%</div>
                <div class="nw-knob" data-role="knob" aria-label="sparkle">
                  <div class="nw-knob__dial" aria-hidden="true"></div>
                  <input id="macro-sparkle" class="nw-knob__input" type="range" min="0" max="1" step="0.01" value="0.5" />
                </div>
                <div class="nw-macro-strip__meta">
                  <span>${s("金属感", "Metallic")}</span>
                  <span>${s("深度边缘", "Depth edge")}</span>
                </div>
                <div class="nw-macro-strip__actions">
                  <button id="macro-sparkle-save" class="toolbar__button toolbar__button--compact">${s(
                    "收藏",
                    "Save"
                  )}</button>
                  <button id="macro-sparkle-load" class="toolbar__button toolbar__button--compact">${s(
                    "载入",
                    "Load"
                  )}</button>
                </div>
              </div>
            </div>

            <button id="macro-add-slot" class="toolbar__button toolbar__button--compact" title="${s(
              "新增一个宏变量槽位（可保存/可随机）",
              "Add a macro slot (saved + randomizable)"
            )}">${s("+ 槽位", "+ Slot")}</button>
          </div>
          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-sm">
            <label class="toolbar__hint toolbar__hint--select">
              <span>${s("宏预设", "Macro Preset")}</span>
              <select id="macro-preset-select" class="toolbar__select toolbar__select--compact">
                <option value="technoBoost">${s(
                  "Techno 强推",
                  "Techno Boost"
                )}</option>
                <option value="ravePunch">${s(
                  "Rave 冲击",
                  "Rave Punch"
                )}</option>
                <option value="deepPulse">${s(
                  "Deep 脉冲",
                  "Deep Pulse"
                )}</option>
                <option value="wideSweep">${s(
                  "Wide 扫描",
                  "Wide Sweep"
                )}</option>
                <option value="technoBrutal">${s(
                  "Techno Brutal",
                  "Techno Brutal"
                )}</option>
                <option value="industrialSurge">${s(
                  "Industrial Surge",
                  "Industrial Surge"
                )}</option>
                <option value="acidOverdrive">${s(
                  "Acid Overdrive",
                  "Acid Overdrive"
                )}</option>
              </select>
            </label>
            <button id="macro-preset-apply" class="toolbar__button toolbar__button--compact">${s(
              "应用",
              "Apply"
            )}</button>
            <label class="toolbar__switch toolbar__switch--mini" title="${s(
              "选择后自动应用宏预设",
              "Auto-apply macro preset on change/startup"
            )}">
              <input id="macro-preset-auto" type="checkbox" />
              <span>${s("自动", "Auto")}</span>
            </label>
          </div>
          <div id="macro-slots" class="toolbar__macro-slots"></div>
          <div
            class="toolbar__row toolbar__row--grid toolbar__row--grid-sm"
            data-group="advanced"
          >
            <button id="macro-map-toggle" class="toolbar__button toolbar__button--compact">${s(
              "映射",
              "Map"
            )}</button>
            <button id="macro-map-apply" class="toolbar__button toolbar__button--compact">${s(
              "应用",
              "Apply"
            )}</button>
            <button id="macro-map-random" class="toolbar__button toolbar__button--compact">${s(
              "随机映射",
              "Rand Map"
            )}</button>
            <button id="macro-map-save" class="toolbar__button toolbar__button--compact">${s(
              "保存映射",
              "Save Map"
            )}</button>
            <button id="macro-map-load" class="toolbar__button toolbar__button--compact">${s(
              "载入映射",
              "Load Map"
            )}</button>
          </div>
          <div
            id="macro-map-panel"
            class="nw-macro-map"
            style="display:none;"
            data-group="advanced"
          >
            <div class="nw-macro-map__row nw-macro-map__row--header">
              <span>${s("目标", "Target")}</span>
              <span>${s("宏", "Macro")}</span>
              <span>${s("最小", "Min")}</span>
              <span>${s("最大", "Max")}</span>
            </div>
            <div class="nw-macro-map__row">
              <span>PM Opacity</span>
              <select id="macro-map-pm-opacity-macro" class="toolbar__select toolbar__select--compact">
                <option value="fusion">Fusion</option>
                <option value="motion">Motion</option>
                <option value="sparkle">Sparkle</option>
                <option value="fusionMotion">F+M</option>
              </select>
              <input id="macro-map-pm-opacity-min" class="toolbar__input" type="number" min="0" max="1" step="0.01" />
              <input id="macro-map-pm-opacity-max" class="toolbar__input" type="number" min="0" max="1" step="0.01" />
            </div>
            <div class="nw-macro-map__row">
              <span>PM Energy</span>
              <select id="macro-map-pm-energy-macro" class="toolbar__select toolbar__select--compact">
                <option value="fusion">Fusion</option>
                <option value="motion">Motion</option>
                <option value="sparkle">Sparkle</option>
                <option value="fusionMotion">F+M</option>
              </select>
              <input id="macro-map-pm-energy-min" class="toolbar__input" type="number" min="0" max="1" step="0.01" />
              <input id="macro-map-pm-energy-max" class="toolbar__input" type="number" min="0" max="1" step="0.01" />
            </div>
            <div class="nw-macro-map__row">
              <span>PM React</span>
              <select id="macro-map-pm-react-macro" class="toolbar__select toolbar__select--compact">
                <option value="fusion">Fusion</option>
                <option value="motion">Motion</option>
                <option value="sparkle">Sparkle</option>
                <option value="fusionMotion">F+M</option>
              </select>
              <input id="macro-map-pm-react-min" class="toolbar__input" type="number" min="0.6" max="3" step="0.01" />
              <input id="macro-map-pm-react-max" class="toolbar__input" type="number" min="0.6" max="3" step="0.01" />
            </div>
            <div class="nw-macro-map__row">
              <span>Liquid Time</span>
              <select id="macro-map-liquid-time-macro" class="toolbar__select toolbar__select--compact">
                <option value="fusion">Fusion</option>
                <option value="motion">Motion</option>
                <option value="sparkle">Sparkle</option>
                <option value="fusionMotion">F+M</option>
              </select>
              <input id="macro-map-liquid-time-min" class="toolbar__input" type="number" min="0" max="4" step="0.01" />
              <input id="macro-map-liquid-time-max" class="toolbar__input" type="number" min="0" max="4" step="0.01" />
            </div>
            <div class="nw-macro-map__row">
              <span>Liquid Wave</span>
              <select id="macro-map-liquid-wave-macro" class="toolbar__select toolbar__select--compact">
                <option value="fusion">Fusion</option>
                <option value="motion">Motion</option>
                <option value="sparkle">Sparkle</option>
                <option value="fusionMotion">F+M</option>
              </select>
              <input id="macro-map-liquid-wave-min" class="toolbar__input" type="number" min="0" max="1.5" step="0.01" />
              <input id="macro-map-liquid-wave-max" class="toolbar__input" type="number" min="0" max="1.5" step="0.01" />
            </div>
            <div class="nw-macro-map__row">
              <span>Liquid Metal</span>
              <select id="macro-map-liquid-metal-macro" class="toolbar__select toolbar__select--compact">
                <option value="fusion">Fusion</option>
                <option value="motion">Motion</option>
                <option value="sparkle">Sparkle</option>
                <option value="fusionMotion">F+M</option>
              </select>
              <input id="macro-map-liquid-metal-min" class="toolbar__input" type="number" min="0" max="0.6" step="0.01" />
              <input id="macro-map-liquid-metal-max" class="toolbar__input" type="number" min="0" max="0.6" step="0.01" />
            </div>
            <div class="nw-macro-map__row">
              <span>Liquid Speed</span>
              <select id="macro-map-liquid-speed-macro" class="toolbar__select toolbar__select--compact">
                <option value="fusion">Fusion</option>
                <option value="motion">Motion</option>
                <option value="sparkle">Sparkle</option>
                <option value="fusionMotion">F+M</option>
              </select>
              <input id="macro-map-liquid-speed-min" class="toolbar__input" type="number" min="0" max="4" step="0.01" />
              <input id="macro-map-liquid-speed-max" class="toolbar__input" type="number" min="0" max="4" step="0.01" />
            </div>
            <div class="nw-macro-map__row">
              <span>Liquid Bright</span>
              <select id="macro-map-liquid-brightness-macro" class="toolbar__select toolbar__select--compact">
                <option value="fusion">Fusion</option>
                <option value="motion">Motion</option>
                <option value="sparkle">Sparkle</option>
                <option value="fusionMotion">F+M</option>
              </select>
              <input id="macro-map-liquid-brightness-min" class="toolbar__input" type="number" min="0.2" max="2" step="0.01" />
              <input id="macro-map-liquid-brightness-max" class="toolbar__input" type="number" min="0.2" max="2" step="0.01" />
            </div>
            <div class="nw-macro-map__row">
              <span>Liquid Contrast</span>
              <select id="macro-map-liquid-contrast-macro" class="toolbar__select toolbar__select--compact">
                <option value="fusion">Fusion</option>
                <option value="motion">Motion</option>
                <option value="sparkle">Sparkle</option>
                <option value="fusionMotion">F+M</option>
              </select>
              <input id="macro-map-liquid-contrast-min" class="toolbar__input" type="number" min="0.2" max="2" step="0.01" />
              <input id="macro-map-liquid-contrast-max" class="toolbar__input" type="number" min="0.2" max="2" step="0.01" />
            </div>
          </div>
        </div>

        <div class="toolbar__section" data-group="live">
          <div class="toolbar__section-header">
            <span class="toolbar__title">ProjectM ${s("融合", "Blend")}</span>
            <span id="pm-budget-status" class="toolbar__hint toolbar__hint--status">--</span>
          </div>
          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-sm">
            <label class="toolbar__volume toolbar__volume--mini">
              <span>${s("不透明度", "Opacity")}</span>
              <input id="pm-opacity" type="range" min="0" max="1" step="0.01" value="0.7" />
              <span id="pm-opacity-text" class="toolbar__hint toolbar__hint--status">70%</span>
            </label>
            <label class="toolbar__hint toolbar__hint--select">
              <span>${s("混合", "Blend")}</span>
              <select id="pm-blend-mode" class="toolbar__select toolbar__select--compact">
                <option value="normal">normal</option>
                <option value="add">add</option>
                <option value="screen">screen</option>
                <option value="multiply">multiply</option>                <option value="overlay">${s(
                  "叠加",
                  "Overlay"
                )}</option>
                <option value="difference">${s("差异", "Difference")}</option>
                <option value="exclusion">${s("排除", "Exclusion")}</option>
                <option value="color-dodge">${s(
                  "颜色减淡",
                  "Color Dodge"
                )}</option>              </select>
            </label>
            <label class="toolbar__switch toolbar__switch--mini" title="${s(
              "根据音频能量驱动不透明度",
              "Drive opacity by audio energy"
            )}">
              <input id="pm-audio-opacity" type="checkbox" checked />
              <span>${s("音频驱动", "Audio")}</span>
            </label>
            <label class="toolbar__hint" title="${s(
              "能量到不透明度的强度",
              "Energy-to-opacity amount"
            )}">
              <span>${s("强度", "Amount")}</span>
              <input id="pm-energy-opacity" type="range" min="0" max="1" step="0.01" value="0.25" />
              <span id="pm-energy-opacity-text" class="toolbar__hint toolbar__hint--status">25%</span>
            </label>
            <label class="toolbar__volume toolbar__volume--mini" title="${s(
              "ProjectM 退让强度（越高越让出背景）",
              "ProjectM retreat strength"
            )}">
              <span>${s("退让", "Retreat")}</span>
              <input id="pm-retreat-strength" type="range" min="0.05" max="0.7" step="0.01" value="0.25" />
              <span id="pm-retreat-strength-text" class="toolbar__hint toolbar__hint--status">25%</span>
            </label>
            <label class="toolbar__volume toolbar__volume--mini" title="${s(
              "ProjectM 优先级（越高越压住其它图层）",
              "ProjectM priority vs overlays"
            )}">
              <span>${s("优先级", "Priority")}</span>
              <input id="pm-priority" type="range" min="0" max="1" step="0.01" value="0.6" />
              <span id="pm-priority-text" class="toolbar__hint toolbar__hint--status">60%</span>
            </label>
          </div>
        </div>

        <div class="toolbar__section" data-group="live">
          <div class="toolbar__section-header">
            <span class="toolbar__title">${s("演出配置", "Show")}</span>
            <span class="toolbar__hint toolbar__hint--status">--</span>
          </div>
          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-sm">
            <button id="show-setup" class="toolbar__button toolbar__button--compact">${s(
              "设置",
              "Setup"
            )}</button>
            <button id="show-save" class="toolbar__button toolbar__button--compact">${s(
              "保存",
              "Save"
            )}</button>
            <button id="fullscreen-toggle" class="toolbar__button toolbar__button--compact">${s(
              "全屏",
              "Fullscreen"
            )}</button>
          </div>
          <div
            class="toolbar__row toolbar__row--grid toolbar__row--grid-sm"
            data-group="debug"
          >
            <button id="calibration-toggle" class="toolbar__button toolbar__button--compact">${s("Calib", "Calib")}</button>
            <button id="snapshot-export" class="toolbar__button toolbar__button--compact">${s(
              "蹇収",
              "Snapshot"
            )}</button>
          </div>
        </div>

        <div class="toolbar__section" data-group="advanced">
          <div class="toolbar__section-header">
            <span class="toolbar__title">Inspector</span>
            <span id="inspector-status" class="toolbar__hint toolbar__hint--status">--</span>
          </div>
          <div class="toolbar__row toolbar__row--grid toolbar__row--grid-sm">
            <button id="inspector-toggle" class="toolbar__button toolbar__button--compact">${s(
              "打开",
              "Open"
            )}</button>
            <label class="toolbar__hint" style="min-width:min(var(--nw-toolbar-min-260), 100%);">
              <span>${s("搜索", "Search")}</span>
              <input id="inspector-search" class="toolbar__input" type="text" placeholder="${s(
                "输入关键字…",
                "Type to search…"
              )}" />
            </label>
            <label class="toolbar__switch toolbar__switch--mini" title="${s(
              "显示高级参数",
              "Show advanced"
            )}">
              <input id="inspector-show-advanced" type="checkbox" />
              <span>${s("高级", "Advanced")}</span>
            </label>
            <button id="inspector-reset" class="toolbar__button toolbar__button--compact">${s(
              "重置筛选",
              "Reset filter"
            )}</button>
          </div>
          <div id="inspector-container" class="toolbar__inspector toolbar__inspector-container" style="display:none;"></div>
        </div>

        <div class="toolbar__section" data-group="advanced">
          <div class="toolbar__section-header">
            <span class="toolbar__title">MIDI</span>
            <span id="midi-status" class="toolbar__hint toolbar__hint--status">${s(
              "未连接",
              "Disconnected"
            )}</span>
          </div>
          <div class="toolbar__midi-grid">
            <button id="midi-connect" class="toolbar__button toolbar__button--compact">${s(
              "连接",
              "Connect"
            )}</button>
            <span id="midi-count" class="toolbar__hint toolbar__hint--status">0</span>
            <label class="toolbar__hint toolbar__hint--select toolbar__midi-target">
              <span>${s("目标", "Target")}</span>
              <select id="midi-target" class="toolbar__select toolbar__select--compact"></select>
            </label>
            <button id="midi-learn" class="toolbar__button toolbar__button--compact">${s(
              "学习",
              "Learn"
            )}</button>
            <button id="midi-unbind" class="toolbar__button toolbar__button--compact" title="${s(
              "移除当前目标绑定",
              "Remove current binding"
            )}">${s("解绑", "Unbind")}</button>
            <button id="midi-clear" class="toolbar__button toolbar__button--compact" title="${s(
              "清空所有绑定",
              "Clear all bindings"
            )}">${s("清空", "Clear")}</button>
            <span id="midi-binding" class="toolbar__hint toolbar__hint--status">${s(
              "未绑定",
              "Not bound"
            )}</span>
          </div>
        </div>
        </div>
      </div>
    </div>
    <div id="canvas-root" class="canvas-root">
      <canvas id="viz-canvas"></canvas>
    </div>
  </div>
`;

  const q = <T extends Element>(selector: string): T => {
    const el = app.querySelector(selector);
    if (!el) throw new Error(`renderShell: missing element ${selector}`);
    return el as T;
  };

  const qOptional = <T extends Element>(selector: string): T | null =>
    (app.querySelector(selector) as T | null) ?? null;

  return {
    root: q<HTMLDivElement>("#root"),
    toolbar: q<HTMLDivElement>("#toolbar"),
    toolbarToggleButton: q<HTMLButtonElement>("#toolbar-toggle"),
    toolbarDebugToggleButton: q<HTMLButtonElement>("#toolbar-debug-toggle"),
    toolbarAdvancedToggleButton: q<HTMLButtonElement>("#toolbar-advanced-toggle"),
    toolbarBody: q<HTMLDivElement>("#toolbar-body"),
    uiOpacityInput: q<HTMLInputElement>("#ui-opacity"),
    uiOpacityText: q<HTMLSpanElement>("#ui-opacity-text"),
    canvasRoot: q<HTMLDivElement>("#canvas-root"),
    canvas: q<HTMLCanvasElement>("#viz-canvas"),

    audioStatus: q<HTMLSpanElement>("#audio-status"),
    audioToggle: q<HTMLButtonElement>("#audio-toggle"),
    audioInputDeviceSelect: q<HTMLSelectElement>("#audio-input-device"),
    audioInputUseButton: q<HTMLButtonElement>("#audio-input-use"),
    audioSystemUseButton: q<HTMLButtonElement>("#audio-system-use"),
    audioFileInput: q<HTMLInputElement>("#audio-file"),
    audioUrlInput: q<HTMLInputElement>("#audio-url"),
    audioUrlButton: q<HTMLButtonElement>("#audio-url-load"),
    audioMixxxConnectButton: q<HTMLButtonElement>("#audio-mixxx-connect"),
    audioVolumeInput: q<HTMLInputElement>("#audio-volume"),
    audioVolumeText: q<HTMLSpanElement>("#audio-volume-text"),
    audioSeekInput: q<HTMLInputElement>("#audio-seek"),
    audioTime: q<HTMLSpanElement>("#audio-time"),
    audioLevelBar: q<HTMLDivElement>("#audio-level-bar"),
    audioLevelText: q<HTMLSpanElement>("#audio-level-text"),
    audioEnergyText: q<HTMLSpanElement>("#audio-energy-text"),
    audioTempoText: q<HTMLSpanElement>("#audio-tempo-text"),
    audioConfText: q<HTMLSpanElement>("#audio-conf-text"),
    audioStabilityText: q<HTMLSpanElement>("#audio-stability-text"),
    audioWaveform: q<HTMLCanvasElement>("#audio-waveform"),

    presetSelect: q<HTMLSelectElement>("#preset-select"),
    presetFileInput: q<HTMLInputElement>("#preset-file"),
    presetUrlInput: q<HTMLInputElement>("#preset-url"),
    presetUrlButton: q<HTMLButtonElement>("#preset-url-load"),
    presetStatus: q<HTMLSpanElement>("#preset-status"),
    presetManifestInfo: q<HTMLSpanElement>("#preset-manifest-info"),
    presetNextButton: q<HTMLButtonElement>("#preset-next"),
    presetAutoToggle: q<HTMLInputElement>("#preset-auto-toggle"),
    presetAutoIntervalInput: q<HTMLInputElement>("#preset-auto-interval"),
    presetAutoLabel: q<HTMLSpanElement>("#preset-auto-label"),
    presetLibrarySelect: q<HTMLSelectElement>("#preset-library-select"),

    visualRandomButton: q<HTMLButtonElement>("#visual-random"),
    visualRandomParamsButton: q<HTMLButtonElement>("#visual-random-params"),
    visualHoldButton: q<HTMLButtonElement>("#visual-hold"),
    visualFavoriteButton: q<HTMLButtonElement>("#visual-favorite"),
    visualFavoriteCount: q<HTMLSpanElement>("#visual-favorite-count"),
    autoTechnoToggle: q<HTMLInputElement>("#auto-techno-toggle"),
    followAiToggle: q<HTMLInputElement>("#follow-ai-toggle"),
    technoProfileSelect: q<HTMLSelectElement>("#techno-profile-select"),
    aivjStatusPill: q<HTMLSpanElement>("#aivj-status-pill"),
    technoProfileSummary: q<HTMLSpanElement>("#techno-profile-summary"),
    audioControlsToggle: q<HTMLInputElement>("#audio-controls-toggle"),
    audioDrivePresetSelect: q<HTMLSelectElement>("#audio-drive-preset"),
    beatTempoToggle: q<HTMLInputElement>("#beat-tempo-toggle"),
    bgTypeSelect: q<HTMLSelectElement>("#bg-type-select"),
    layerLiquidToggle: q<HTMLInputElement>("#layer-liquid-enabled"),
    layerBasicToggle: q<HTMLInputElement>("#layer-basic-enabled"),
    layerCameraToggle: q<HTMLInputElement>("#layer-camera-enabled"),
    layerVideoToggle: q<HTMLInputElement>("#layer-video-enabled"),
    layerDepthToggle: q<HTMLInputElement>("#layer-depth-enabled"),
    cameraControlsRow: q<HTMLDivElement>("#camera-controls"),
    videoControlsRow: q<HTMLDivElement>("#video-controls"),
    depthControlsRow: q<HTMLDivElement>("#depth-controls"),
    depthParamsRow: q<HTMLDivElement>("#depth-params"),
    basicOpacityInput: q<HTMLInputElement>("#basic-opacity"),
    basicOpacityText: q<HTMLSpanElement>("#basic-opacity-text"),
    cameraOpacityInput: q<HTMLInputElement>("#camera-opacity"),
    cameraOpacityText: q<HTMLSpanElement>("#camera-opacity-text"),
    videoOpacityInput: q<HTMLInputElement>("#video-opacity"),
    videoOpacityText: q<HTMLSpanElement>("#video-opacity-text"),
    cameraDeviceSelect: q<HTMLSelectElement>("#camera-device"),
    depthSourceSelect: q<HTMLSelectElement>("#depth-source"),
    depthDeviceSelect: q<HTMLSelectElement>("#depth-device"),
    depthShowDepthToggle: q<HTMLInputElement>("#depth-show-depth"),
    depthOpacityInput: q<HTMLInputElement>("#depth-opacity"),
    depthOpacityText: q<HTMLSpanElement>("#depth-opacity-text"),
    depthFogInput: q<HTMLInputElement>("#depth-fog"),
    depthFogText: q<HTMLSpanElement>("#depth-fog-text"),
    depthEdgeInput: q<HTMLInputElement>("#depth-edge"),
    depthEdgeText: q<HTMLSpanElement>("#depth-edge-text"),
    depthLayersInput: q<HTMLInputElement>("#depth-layers"),
    depthLayersText: q<HTMLSpanElement>("#depth-layers-text"),
    depthBlurInput: q<HTMLInputElement>("#depth-blur"),
    depthBlurText: q<HTMLSpanElement>("#depth-blur-text"),
    depthStatusText: q<HTMLSpanElement>("#depth-status"),
    cameraSegmentToggle: q<HTMLInputElement>("#camera-seg-toggle"),
    cameraEdgeToPmInput: q<HTMLInputElement>("#camera-edge-pm"),
    cameraEdgeToPmText: q<HTMLSpanElement>("#camera-edge-pm-text"),
    bgVariantSelect: q<HTMLSelectElement>("#bg-variant-select"),
    bgVariantLockToggle: q<HTMLInputElement>("#bg-variant-lock"),

    macroFusionInput: q<HTMLInputElement>("#macro-fusion"),
    macroFusionValueText: q<HTMLDivElement>("#macro-fusion-value"),
    macroMotionInput: q<HTMLInputElement>("#macro-motion"),
    macroMotionValueText: q<HTMLDivElement>("#macro-motion-value"),
    macroSparkleInput: q<HTMLInputElement>("#macro-sparkle"),
    macroSparkleValueText: q<HTMLDivElement>("#macro-sparkle-value"),
    macroFusionSaveButton: q<HTMLButtonElement>("#macro-fusion-save"),
    macroFusionLoadButton: q<HTMLButtonElement>("#macro-fusion-load"),
    macroMotionSaveButton: q<HTMLButtonElement>("#macro-motion-save"),
    macroMotionLoadButton: q<HTMLButtonElement>("#macro-motion-load"),
    macroSparkleSaveButton: q<HTMLButtonElement>("#macro-sparkle-save"),
    macroSparkleLoadButton: q<HTMLButtonElement>("#macro-sparkle-load"),
    macroRandomButton: q<HTMLButtonElement>("#macro-random"),
    macroAddSlotButton: q<HTMLButtonElement>("#macro-add-slot"),
    macroSlotsContainer: q<HTMLDivElement>("#macro-slots"),
    macroBankStatusPill: q<HTMLSpanElement>("#macro-bank-status-pill"),
    macroPresetSelect: q<HTMLSelectElement>("#macro-preset-select"),
    macroPresetApplyButton: q<HTMLButtonElement>("#macro-preset-apply"),
    macroPresetAutoToggle: q<HTMLInputElement>("#macro-preset-auto"),
    macroMapToggleButton: q<HTMLButtonElement>("#macro-map-toggle"),
    macroMapApplyButton: q<HTMLButtonElement>("#macro-map-apply"),
    macroMapRandomButton: q<HTMLButtonElement>("#macro-map-random"),
    macroMapSaveButton: q<HTMLButtonElement>("#macro-map-save"),
    macroMapLoadButton: q<HTMLButtonElement>("#macro-map-load"),
    macroMapPanel: q<HTMLDivElement>("#macro-map-panel"),
    macroMapPmOpacityMacroSelect: q<HTMLSelectElement>(
      "#macro-map-pm-opacity-macro"
    ),
    macroMapPmOpacityMinInput: q<HTMLInputElement>("#macro-map-pm-opacity-min"),
    macroMapPmOpacityMaxInput: q<HTMLInputElement>("#macro-map-pm-opacity-max"),
    macroMapPmEnergyMacroSelect: q<HTMLSelectElement>(
      "#macro-map-pm-energy-macro"
    ),
    macroMapPmEnergyMinInput: q<HTMLInputElement>("#macro-map-pm-energy-min"),
    macroMapPmEnergyMaxInput: q<HTMLInputElement>("#macro-map-pm-energy-max"),
    macroMapPmReactMacroSelect: q<HTMLSelectElement>(
      "#macro-map-pm-react-macro"
    ),
    macroMapPmReactMinInput: q<HTMLInputElement>("#macro-map-pm-react-min"),
    macroMapPmReactMaxInput: q<HTMLInputElement>("#macro-map-pm-react-max"),
    macroMapLiquidTimeMacroSelect: q<HTMLSelectElement>(
      "#macro-map-liquid-time-macro"
    ),
    macroMapLiquidTimeMinInput: q<HTMLInputElement>(
      "#macro-map-liquid-time-min"
    ),
    macroMapLiquidTimeMaxInput: q<HTMLInputElement>(
      "#macro-map-liquid-time-max"
    ),
    macroMapLiquidWaveMacroSelect: q<HTMLSelectElement>(
      "#macro-map-liquid-wave-macro"
    ),
    macroMapLiquidWaveMinInput: q<HTMLInputElement>(
      "#macro-map-liquid-wave-min"
    ),
    macroMapLiquidWaveMaxInput: q<HTMLInputElement>(
      "#macro-map-liquid-wave-max"
    ),
    macroMapLiquidMetalMacroSelect: q<HTMLSelectElement>(
      "#macro-map-liquid-metal-macro"
    ),
    macroMapLiquidMetalMinInput: q<HTMLInputElement>(
      "#macro-map-liquid-metal-min"
    ),
    macroMapLiquidMetalMaxInput: q<HTMLInputElement>(
      "#macro-map-liquid-metal-max"
    ),
    macroMapLiquidSpeedMacroSelect: q<HTMLSelectElement>(
      "#macro-map-liquid-speed-macro"
    ),
    macroMapLiquidSpeedMinInput: q<HTMLInputElement>(
      "#macro-map-liquid-speed-min"
    ),
    macroMapLiquidSpeedMaxInput: q<HTMLInputElement>(
      "#macro-map-liquid-speed-max"
    ),
    macroMapLiquidBrightnessMacroSelect: q<HTMLSelectElement>(
      "#macro-map-liquid-brightness-macro"
    ),
    macroMapLiquidBrightnessMinInput: q<HTMLInputElement>(
      "#macro-map-liquid-brightness-min"
    ),
    macroMapLiquidBrightnessMaxInput: q<HTMLInputElement>(
      "#macro-map-liquid-brightness-max"
    ),
    macroMapLiquidContrastMacroSelect: q<HTMLSelectElement>(
      "#macro-map-liquid-contrast-macro"
    ),
    macroMapLiquidContrastMinInput: q<HTMLInputElement>(
      "#macro-map-liquid-contrast-min"
    ),
    macroMapLiquidContrastMaxInput: q<HTMLInputElement>(
      "#macro-map-liquid-contrast-max"
    ),

    pmOpacityInput: q<HTMLInputElement>("#pm-opacity"),
    pmOpacityText: q<HTMLSpanElement>("#pm-opacity-text"),
    pmBlendModeSelect: q<HTMLSelectElement>("#pm-blend-mode"),
    pmAudioOpacityToggle: q<HTMLInputElement>("#pm-audio-opacity"),
    pmEnergyOpacityInput: q<HTMLInputElement>("#pm-energy-opacity"),
    pmEnergyOpacityText: q<HTMLSpanElement>("#pm-energy-opacity-text"),
    pmPriorityInput: q<HTMLInputElement>("#pm-priority"),
    pmPriorityText: q<HTMLSpanElement>("#pm-priority-text"),
    pmRetreatStrengthInput: q<HTMLInputElement>("#pm-retreat-strength"),
    pmRetreatStrengthText: q<HTMLSpanElement>("#pm-retreat-strength-text"),
    pmBudgetStatusText: q<HTMLSpanElement>("#pm-budget-status"),

    showSetupButton: q<HTMLButtonElement>("#show-setup"),
    showSaveButton: q<HTMLButtonElement>("#show-save"),
    fullscreenToggleButton: q<HTMLButtonElement>("#fullscreen-toggle"),
    calibrationToggle: q<HTMLButtonElement>("#calibration-toggle"),
    snapshotExportButton: q<HTMLButtonElement>("#snapshot-export"),
    videoRetryButton: q<HTMLButtonElement>("#video-retry"),
    videoSrcHint: q<HTMLSpanElement>("#video-src-hint"),
    videoSrcInput: q<HTMLInputElement>("#video-src"),
    videoSrcApplyButton: q<HTMLButtonElement>("#video-src-apply"),

    inspectorStatus: q<HTMLSpanElement>("#inspector-status"),
    inspectorToggleButton: q<HTMLButtonElement>("#inspector-toggle"),
    inspectorSearchInput: q<HTMLInputElement>("#inspector-search"),
    inspectorShowAdvancedToggle: q<HTMLInputElement>(
      "#inspector-show-advanced"
    ),
    inspectorResetButton: q<HTMLButtonElement>("#inspector-reset"),
    inspectorContainer: q<HTMLDivElement>("#inspector-container"),

    midiStatus: q<HTMLSpanElement>("#midi-status"),
    midiBindingsCount: q<HTMLSpanElement>("#midi-count"),
    midiConnectButton: q<HTMLButtonElement>("#midi-connect"),
    midiTargetSelect: q<HTMLSelectElement>("#midi-target"),
    midiLearnButton: q<HTMLButtonElement>("#midi-learn"),
    midiUnbindButton: q<HTMLButtonElement>("#midi-unbind"),
    midiClearButton: q<HTMLButtonElement>("#midi-clear"),
    midiBindingLabel: q<HTMLSpanElement>("#midi-binding"),
  };
}
