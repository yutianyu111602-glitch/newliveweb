import { SceneManager } from "../SceneManager";
import { LiquidMetalLayerV2 } from "../layers/LiquidMetalLayerV2";
import { ProjectMLayer } from "../layers/ProjectMLayer";
import { BasicBackgroundLayer } from "../layers/BasicBackgroundLayer";
import { AudioBus } from "../audio/AudioBus";
import type { AudioFrame } from "../types/audioFrame";
import {
  createAudioControls,
  type AudioControlsConfig,
} from "../audio/audioControls/audioControls";
import {
  createExpressiveAudioDriver,
  type ExpressiveAudioSnapshot,
} from "../audio/audioControls/expressiveAudioDriver";
import { initBeatTempoAnalyzer } from "../audio/beatTempo/beatTempoAnalyzer";
import { initInspectorController } from "./controllers/inspectorController";
import { paramSchema } from "../state/paramSchema";
import { DiagnosticsPanel } from "../features/console/DiagnosticsPanel";
import {
  DecisionTopologyOverlay,
  type DecisionTopologySnapshot,
} from "../features/decisionTopology/DecisionTopologyOverlay";
import { DecisionTrace } from "../features/decisionTopology/DecisionTrace";
import {
  type PresetDescriptor,
  BUILT_IN_PRESETS,
  findPresetById,
  getNextPreset,
  getAllPresets,
  registerRuntimePresets,
  markPresetAsBroken,
} from "../config/presets";
import { PRESET_PACK_PATH, TEST_AUDIO_LIBRARY_PATH } from "../config/paths";
import { loadLibraryManifest } from "../lib/loadManifest";
import { mapManifestToPresetDescriptors } from "../config/presetManifest";
import {
  DEFAULT_LIBRARY_SOURCE,
  PRESET_LIBRARIES,
  type PresetLibrarySource,
  getLibraryConfig,
} from "../config/presetLibraries";
import {
  PRESET_PREFETCH_CACHE_LIMIT,
  PRESET_PREFETCH_IDLE_DELAY_MS,
  PRESET_PREFETCH_TIMEOUT_MS,
  PRESET_PREFETCH_TTL_MS,
} from "../config/presetPrefetch";
import { createPresetPredictor } from "../features/presets/presetPrediction";
import { createPerformanceBudgetManager } from "../performance/PerformanceBudgetManager";
import { CAMERA_FEATURE } from "../config/cameraSources";
import { CameraLayer } from "../layers/CameraLayer";
import { DepthLayer } from "../layers/DepthLayer";
import { VideoLayer } from "../layers/VideoLayer";
import { DepthWsClient, type DepthWsStatus } from "../camera/DepthWsClient";
import {
  type MacroBank,
  type TechnoProfileId,
} from "../features/aivj/aivjTechno";
import {
  UnifiedAivjController,
  type UnifiedAivjOutput,
} from "../features/aivj/unifiedAivjController";

import {
  type BlendMode,
  type FavoriteVisualState,
  type VisualStateV2,
  cloneVisualState,
  createDefaultVisualState,
} from "../features/visualState/visualStateStore";
import {
  randomPatchAllForSchema,
  randomizeBlendParams,
  randomizeLiquidMetalParams,
} from "../state/paramSchema";
import { createRandomSeed, createSeededRng } from "../state/seededRng";
import { createBackgroundRegistry } from "../background/backgroundRegistry";
import { renderShell } from "./renderShell";
import {
  createVisualStateController,
  type VisualStatePatch,
} from "./visualStateController";
import { initAudioTransportController } from "./controllers/audioTransportController";
import { initMacroSlotsController } from "./controllers/macroSlotsController";
import { initFavoritesController } from "./controllers/favoritesController";
import { initShowConfigController } from "./controllers/showConfigController";
import { initMidiController } from "./controllers/midiController";
import { createBackgroundMixerUiController } from "./controllers/backgroundMixerUiController";
import {
  AIVJ_MACRO_BANK,
  ensureAivjMacroBankSlots,
} from "../features/aivj/aivjMacroBank";
import { initToolbarCollapsedController } from "./controllers/toolbarCollapsedController";
import { initUiOpacityController } from "./controllers/uiOpacityController";
import { computeMacroPatch } from "../features/macros/computeMacroPatch";
import {
  sameTarget,
  type MidiBinding,
  type MidiBindingTarget,
} from "../features/settings/settingsStore";
import { listen } from "./bindings/domBindings";

export function bootstrapApp() {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("#app container not found");
  }

  const renderLibrarySelectOptions = () => {
    return PRESET_LIBRARIES.map(
      (lib) => `<option value="${lib.id}">${lib.label}</option>`
    ).join("");
  };

  const audioUrlPlaceholder = `${TEST_AUDIO_LIBRARY_PATH}/示例音轨.mp3`;
  // Local test track (served via Vite dev middleware). Requires a user click due to autoplay policy.
  // Using English path to avoid encoding issues with Chinese characters.
  const TEST_TRACK_FS_PATH =
    "D:/test MP3/Lick It - Juicy Selekta's Bootylicious Remix.mp3";

  function toLocalAudioUrl(fsPath: string) {
    // Served by the Vite dev middleware in vite.config.ts.
    return `/__local_audio?path=${encodeURIComponent(fsPath)}`;
  }

  const TEST_TRACK_URL = toLocalAudioUrl(TEST_TRACK_FS_PATH);
  const presetUrlPlaceholder = `${PRESET_PACK_PATH}/classic/Geiss - Starfish 1.milk`;

  const dom = renderShell(app, {
    librarySelectOptionsHtml: renderLibrarySelectOptions(),
    audioUrlPlaceholder,
    presetUrlPlaceholder,
    testAudioLibraryPathLabel: TEST_AUDIO_LIBRARY_PATH,
    presetPackPathLabel: PRESET_PACK_PATH,
  });

  const bootstrapDisposers: Array<() => void> = [];
  const trackBootstrapDispose = (dispose: () => void) => {
    bootstrapDisposers.push(dispose);
  };
  const disposeBootstrapBindings = () => {
    for (const dispose of bootstrapDisposers.splice(0)) {
      try {
        dispose();
      } catch {
        // ignore
      }
    }
  };

  // Top toolbar bar controls: collapse + UI scale/opacity + language.
  // These are intentionally tiny and should never block the rest of bootstrap.
  initToolbarCollapsedController({
    toolbar: dom.toolbar,
    toolbarBody: dom.toolbarBody,
    toolbarToggleButton: dom.toolbarToggleButton,
    storage: localStorage,
  });
  initUiOpacityController({
    input: dom.uiOpacityInput,
    text: dom.uiOpacityText,
    root: document.documentElement,
    storage: localStorage,
  });

  const canvas = dom.canvas;
  const computeDprCap = (w: number, h: number) => {
    const maxSide = Math.max(
      1,
      Math.round(Number(w) || 0),
      Math.round(Number(h) || 0)
    );
    if (maxSide >= 3000) return 1;
    if (maxSide >= 2000) return 1.25;
    return 1.5;
  };
  const readDisplaySize = () => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(
      1,
      Math.round(rect.width || canvas.clientWidth || window.innerWidth)
    );
    const h = Math.max(
      1,
      Math.round(rect.height || canvas.clientHeight || window.innerHeight)
    );
    return { w, h };
  };
  const initialDisplay = readDisplaySize();
  const initialDprCap = computeDprCap(initialDisplay.w, initialDisplay.h);
  const calibrationOverlay = document.createElement("div");
  calibrationOverlay.className = "nw-calibration-overlay";
  calibrationOverlay.setAttribute("aria-hidden", "true");
  calibrationOverlay.style.display = "none";
  const makeCalibRow = (colors: string[]) => {
    const row = document.createElement("div");
    row.className = "nw-calibration-row";
    colors.forEach((color) => {
      const swatch = document.createElement("span");
      swatch.className = "nw-calibration-swatch";
      swatch.style.background = color;
      row.appendChild(swatch);
    });
    return row;
  };
  calibrationOverlay.appendChild(
    makeCalibRow([
      "#ffffff",
      "#ffff00",
      "#00ffff",
      "#00ff00",
      "#ff00ff",
      "#ff0000",
      "#0000ff",
      "#000000",
    ])
  );
  calibrationOverlay.appendChild(
    makeCalibRow([
      "#f2f2f2",
      "#d9d9d9",
      "#bfbfbf",
      "#a6a6a6",
      "#808080",
      "#595959",
      "#333333",
      "#0d0d0d",
    ])
  );
  calibrationOverlay.appendChild(
    makeCalibRow([
      "#f2c9a0",
      "#d8a07a",
      "#b07a52",
      "#7a4e32",
      "#4d2f1a",
      "#0f0f0f",
      "#ffffff",
      "#000000",
    ])
  );
  dom.canvasRoot.appendChild(calibrationOverlay);
  let calibrationOverlayEnabled = false;

  const frameTimeSamples: Array<{ tMs: number; dtMs: number }> = [];
  const FRAME_TIME_WINDOW_MS = 3000;
  const MAX_FRAME_SAMPLES = 240;
  const pushFrameTimeSample = (tMs: number, dtMs: number) => {
    const dt = Number(dtMs);
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1000) return;
    frameTimeSamples.push({ tMs, dtMs: dt });
    if (frameTimeSamples.length > MAX_FRAME_SAMPLES) {
      const excess = frameTimeSamples.length - MAX_FRAME_SAMPLES;
      frameTimeSamples.splice(0, excess);
    }
  };
  const computeFrameTimeP95 = (nowMs: number) => {
    const cutoff = nowMs - FRAME_TIME_WINDOW_MS;
    let firstValid = 0;
    while (
      firstValid < frameTimeSamples.length &&
      frameTimeSamples[firstValid].tMs < cutoff
    ) {
      firstValid++;
    }
    if (firstValid > 0) {
      frameTimeSamples.splice(0, firstValid);
    }
    if (!frameTimeSamples.length) return 0;
    const sorted = frameTimeSamples
      .map((s) => s.dtMs)
      .slice()
      .sort((a, b) => a - b);
    const idx = Math.max(0, Math.floor(sorted.length * 0.95) - 1);
    return sorted[idx] ?? sorted[sorted.length - 1] ?? 0;
  };

  let updateAudioAnalysisCap: ((timeMs: number) => void) | null = null;
  let updateBeatTempoCadence: ((timeMs: number) => void) | null = null;
  let updateProjectMAudioCadence: ((timeMs: number) => void) | null = null;
  let updateCompositorBypass: ((timeMs: number) => void) | null = null;

  const sceneManager = new SceneManager(canvas, {
    onAfterRender: ({ timeMs, deltaTimeSec }) => {
      pushFrameTimeSample(timeMs, deltaTimeSec * 1000);
      updateAudioAnalysisCap?.(timeMs);
      updateBeatTempoCadence?.(timeMs);
      updateProjectMAudioCadence?.(timeMs);
      updateCompositorBypass?.(timeMs);
    },
  });
  sceneManager.setPixelRatioCap(initialDprCap);
  const liquidLayer = new LiquidMetalLayerV2();
  const basicLayer = new BasicBackgroundLayer();
  const projectLayer = new ProjectMLayer({
    statsKey: "fg",
    audioProfile: "fg",
    audioFeedIntervalMs: 33,
    dprCap: initialDprCap,
    maxCssWidth: 2880,
    maxCssHeight: 1620,
  });
  const projectLayerBg = new ProjectMLayer({
    opacity: 0.4,
    statsKey: "bg",
    audioProfile: "bg",
    audioFeedIntervalMs: 50, // 20fps: cleaner than 55ms, sufficient for bg layer
    dprCap: initialDprCap,
    maxCssWidth: 1920,
    maxCssHeight: 1080,
  });
  const cameraLayer = CAMERA_FEATURE.enabled
    ? new CameraLayer(CAMERA_FEATURE)
    : null;
  const videoLayer = new VideoLayer();
  const depthLayer = new DepthLayer();
  const audioBus = new AudioBus();

  // Use SceneManager compositor for all ProjectM blend modes (incl. overlay/difference/exclusion/color-dodge).
  sceneManager.setCompositorEnabled(true);
  projectLayer.setUseCompositor(true);
  projectLayerBg.setUseCompositor(false);
  projectLayerBg.setBlendParams({
    opacity: 0.4,
    blendMode: "normal",
    energyToOpacityAmount: 0.12,
    audioDrivenOpacity: true,
  });
  const syncProjectMEngineTargets = () => {
    const cfg = sceneManager.getCompositorConfig();
    if (cfg.targetMode === "fixed") {
      projectLayer.setEngineSizeOverride(cfg.fixedWidth, cfg.fixedHeight);
      projectLayerBg.setEngineSizeOverride(cfg.fixedWidth, cfg.fixedHeight);
    } else {
      projectLayer.setEngineSizeOverride(null, null);
      projectLayerBg.setEngineSizeOverride(null, null);
    }
  };
  syncProjectMEngineTargets();

  // Visual state is referenced by several early bindings (AIVJ/macros/etc).
  // Declare it up-front to avoid block-scope TDZ issues in TypeScript.
  let lastVisualState: VisualStateV2 = createDefaultVisualState(
    liquidLayer.params
  );

  const beatTempo = initBeatTempoAnalyzer({
    initial: {
      enabled: Boolean(dom.beatTempoToggle?.checked ?? true),
      // User-requested: keep ~10s of audio for more stable BPM.
      windowSec: 10,
      updateIntervalMs: 250,
      inputFps: 30,
      method: "multifeature",
    },
  });

  trackBootstrapDispose(
    listen(dom.beatTempoToggle, "change", () => {
      beatTempo.setConfig({ enabled: Boolean(dom.beatTempoToggle?.checked) });
    })
  );

  const audioControlsToggle = dom.audioControlsToggle;
  const audioControls = createAudioControls({
    enabled: Boolean(audioControlsToggle?.checked),
  });
  const expressiveAudioDriver = createExpressiveAudioDriver();
  trackBootstrapDispose(
    listen(audioControlsToggle, "change", () => {
      audioControls.setConfig({
        enabled: Boolean(audioControlsToggle?.checked),
      });
    })
  );

  // Unified macro runtime application (AudioControls + AIVJ): apply at a modest rate.
  let macroRuntimeLastApplyMs = 0;

  const migrateAudioStorageKeys = () => {
    const migrations = [
      {
        oldKey: "newliveweb:audio:preferredSource",
        nextKey: "nw.audio.preferredSource",
      },
      {
        oldKey: "newliveweb:audio:inputDeviceId",
        nextKey: "nw.audio.inputDeviceId",
      },
      {
        oldKey: "newliveweb:audio:trackVolume",
        nextKey: "nw.audio.trackVolume",
      },
      {
        oldKey: "newliveweb:audio:mixxxUrl",
        nextKey: "nw.audio.mixxxUrl",
      },
    ];

    for (const { oldKey, nextKey } of migrations) {
      try {
        if (localStorage.getItem(nextKey) != null) continue;
        const oldValue = localStorage.getItem(oldKey);
        if (oldValue == null) continue;
        localStorage.setItem(nextKey, oldValue);
      } catch {
        // ignore storage failures
      }
    }
  };

  migrateAudioStorageKeys();

  const audioTransport = initAudioTransportController({
    dom: {
      fileInput: dom.audioFileInput,
      urlInput: dom.audioUrlInput,
      urlButton: dom.audioUrlButton,
      mixxxConnectButton: dom.audioMixxxConnectButton,
      toggleButton: dom.audioToggle,
      inputDeviceSelect: dom.audioInputDeviceSelect,
      inputUseButton: dom.audioInputUseButton,
      systemAudioUseButton: dom.audioSystemUseButton,
      volumeSlider: dom.audioVolumeInput,
      volumeText: dom.audioVolumeText,
      seekSlider: dom.audioSeekInput,
      statusLabel: dom.audioStatus,
      timeLabel: dom.audioTime,
      audioLevelBar: dom.audioLevelBar,
      audioLevelText: dom.audioLevelText,
    },
    audioBus,
    storage: localStorage,
    keys: {
      preferredSourceKey: "nw.audio.preferredSource",
      inputDeviceIdKey: "nw.audio.inputDeviceId",
      trackVolumeKey: "nw.audio.trackVolume",
      mixxxUrlKey: "nw.audio.mixxxUrl",
    },
    isShowMode: false,
    testTrack: {
      url: TEST_TRACK_URL,
      filePath: TEST_TRACK_FS_PATH,
      shouldAutoLoad: () => true,
    },
    setStatus: (message: string, isError = false) => {
      dom.audioStatus.textContent = message;
      dom.audioStatus.dataset.state = isError ? "error" : "ok";
    },
  });

  const diagnosticsPanel = new DiagnosticsPanel(document.body);
  diagnosticsPanel.updateRenderer({
    ...sceneManager.getRendererInfo(),
    compositor: (() => {
      try {
        return (sceneManager as any).getCompositorProfile?.();
      } catch {
        return sceneManager.getCompositorConfig();
      }
    })(),
  });
  trackBootstrapDispose(
    listen(window, "resize", () =>
      diagnosticsPanel.updateRenderer({
        ...sceneManager.getRendererInfo(),
        compositor: (() => {
          try {
            return (sceneManager as any).getCompositorProfile?.();
          } catch {
            return sceneManager.getCompositorConfig();
          }
        })(),
      })
    )
  );

  const decisionTopologyOverlay = new DecisionTopologyOverlay(document.body, {
    storage: localStorage,
  });
  trackBootstrapDispose(() => decisionTopologyOverlay.dispose());

  const decisionTrace = new DecisionTrace({ maxEvents: 240 });
  let lastTopologySnapshot: DecisionTopologySnapshot | null = null;

  type AudioFrameSummary = {
    timeSec: number;
    sampleRate: number;
    energy: number;
    rms: number;
    peak: number;
    bands: { low: number; mid: number; high: number };
    features: AudioFrame["features"];
  };
  let lastAudioFrameSummary: AudioFrameSummary | null = null;

  const buildAudioFrameSummary = (frame: AudioFrame): AudioFrameSummary => ({
    timeSec: Number(frame.timeSec ?? 0),
    sampleRate: Number(frame.sampleRate ?? 0),
    energy: Number(frame.energy ?? 0),
    rms: Number(frame.rms ?? 0),
    peak: Number(frame.peak ?? 0),
    bands: {
      low: Number(frame.bands?.low ?? 0),
      mid: Number(frame.bands?.mid ?? 0),
      high: Number(frame.bands?.high ?? 0),
    },
    features: frame.features ? { ...frame.features } : undefined,
  });

  type ControlPlaneEvent = {
    tMs: number;
    type: string;
    detail?: string;
  };

  type ControlPlaneDebug = {
    gate: {
      audioValid: boolean;
      beatTrusted: boolean;
      renderStable: boolean;
    };
    cooldown: {
      audioMs: number;
      beatMs: number;
      renderMs: number;
      m3Ms: number;
      fgMs: number;
      bgMs: number;
      fgRecentMs: number;
      bgRecentMs: number;
    };
    sectionState: "CALM" | "GROOVE" | "PEAK";
    scheduledAction: string | null;
    denyReasonsTop: string[];
    freezeFlags: {
      rebuild: boolean;
      resCooldown: boolean;
      beatCooldown: boolean;
    };
    finalWriter: string | null;
    lastEvent: string | null;
    phase: {
      phase01: number;
      fgWindow: boolean;
      bgWindow: boolean;
    };
    preset: {
      fgId: string | null;
      bgId: string | null;
    };
    presetStats: {
      hardFails: number;
      softFails: number;
      aestheticFails: number;
      anchorFallbacks: number;
      lastAnchorReason: string | null;
    };
    coupler: {
      kEff: number;
      phaseW: number;
      signFlipRate2s: number;
      freeze: boolean;
    };
    calibration: {
      enabled: boolean;
      autoOffMs: number;
    };
    display: {
      viewportW: number;
      viewportH: number;
      dpr: number;
      initScale: number;
      targetW: number;
      targetH: number;
      pending: boolean;
    };
    color: {
      outputColorSpace: string;
      toneMapping: string;
      toneMappingExposure: number;
      premultipliedAlpha: boolean | null;
      targetMode: "viewport" | "fixed";
      fixedWidth: number;
      fixedHeight: number;
    };
    events: ControlPlaneEvent[];
  };

  const controlPlaneEvents: ControlPlaneEvent[] = [];
  const CONTROL_PLANE_EVENT_LIMIT = 200;
  let lastControlTraceKey = "";
  let lastControlTraceMs = 0;
  const recordControlPlaneEvent = (type: string, detail?: string) => {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    controlPlaneEvents.push({
      tMs: nowMs,
      type,
      detail: detail ? String(detail) : undefined,
    });
    controlPlaneDebug.lastEvent = detail ? `${type}:${detail}` : type;
    if (controlPlaneEvents.length > CONTROL_PLANE_EVENT_LIMIT) {
      const excess = controlPlaneEvents.length - CONTROL_PLANE_EVENT_LIMIT;
      controlPlaneEvents.splice(0, excess);
    }
    const traceTypes = new Set([
      "ACTION_COMMIT",
      "ACTION_DENY",
      "COUPLER_DAMPEN",
      "SNAPSHOT",
      "RES_COMMIT",
      "RES_INIT",
      "RES_PROBE",
      "REBUILD_START",
      "REBUILD_END",
      "GATE_AUDIO_VALID",
      "GATE_BEAT_TRUSTED",
      "GATE_RENDER_STABLE",
      "DISPLAY_CHANGE",
      "COLOR_SNAPSHOT",
      "CALIB",
      "PRESET_AESTHETIC",
    ]);
    if (traceTypes.has(type)) {
      const key = `${type}:${detail ?? ""}`;
      const minGapMs = 250;
      if (
        key !== lastControlTraceKey ||
        nowMs - lastControlTraceMs > minGapMs
      ) {
        decisionTrace.record({
          tMs: nowMs,
          writer: "controlPlane",
          target: `controlPlane.${type}`,
          value: detail ? String(detail).slice(0, 120) : undefined,
        });
        lastControlTraceKey = key;
        lastControlTraceMs = nowMs;
      }
    }
  };

  const controlPlaneDebug: ControlPlaneDebug = {
    gate: { audioValid: false, beatTrusted: false, renderStable: true },
    cooldown: {
      audioMs: 0,
      beatMs: 0,
      renderMs: 0,
      m3Ms: 0,
      fgMs: 0,
      bgMs: 0,
      fgRecentMs: 0,
      bgRecentMs: 0,
    },
    sectionState: "CALM",
    scheduledAction: null,
    denyReasonsTop: [],
    freezeFlags: { rebuild: false, resCooldown: false, beatCooldown: false },
    finalWriter: null,
    lastEvent: null,
    phase: { phase01: 0, fgWindow: false, bgWindow: false },
    preset: { fgId: null, bgId: null },
    presetStats: {
      hardFails: 0,
      softFails: 0,
      aestheticFails: 0,
      anchorFallbacks: 0,
      lastAnchorReason: null,
    },
    coupler: {
      kEff: 0,
      phaseW: 0,
      signFlipRate2s: 0,
      freeze: false,
    },
    calibration: {
      enabled: false,
      autoOffMs: 0,
    },
    display: {
      viewportW: 0,
      viewportH: 0,
      dpr: 1,
      initScale: 1,
      targetW: 0,
      targetH: 0,
      pending: false,
    },
    color: {
      outputColorSpace: "--",
      toneMapping: "--",
      toneMappingExposure: 1,
      premultipliedAlpha: null,
      targetMode: "viewport",
      fixedWidth: 0,
      fixedHeight: 0,
    },
    events: controlPlaneEvents,
  };

  let gateAudioValid = false;
  let gateBeatTrusted = false;
  let gateRenderStable = true;
  let frameTimeP95Ms = 0;
  let audioValidFrames = 0;
  let audioCooldownUntilMs = 0;
  let beatOkSinceMs = 0;
  let beatCooldownUntilMs = 0;
  let renderCooldownUntilMs = 0;
  let lastResCommitMs = 0;
  let lastRebuildInProgress = false;
  let lastRtReallocSeenMs = 0;
  let lastPresetSwitchMs = 0;
  let lastBgPresetSwitchMs = 0;
  let lastBeatPhase01 = 0;
  let displayLastCheckMs = 0;
  let displayLastChangeMs = 0;
  let displayPending = true;
  let displayMetrics = { w: 0, h: 0, dpr: 1 };
  let currentDprCap = initialDprCap;
  let calibrationAutoOffUntilMs = 0;
  let calibrationAutoOffTimer: number | null = null;
  let sectionState: "CALM" | "GROOVE" | "PEAK" = "CALM";
  let sectionIntensity01 = 0;
  let sectionTransitionStartMs = 0;
  let expressiveDrive: ExpressiveAudioSnapshot | null = null;
  let energySlow01 = 0;
  let energySlowLastMs = 0;
  let fluxAbove = false;
  const fluxOnsetTimes: number[] = [];
  let couplingLastOutput = 0;
  let couplingFgDrive = 0;
  let couplingBgDrive = 0;
  let couplingLastSign = 0;
  let couplingDampenUntilMs = 0;
  let couplingSwitchDampenUntilMs = 0;
  const couplingFlipTimes: number[] = [];
  let couplingLumaFg = 0;
  let couplingLumaBg = 0;
  let couplingLumaDelta = 0;
  let couplingLumaValid = false;
  let frameOverSinceMs = 0;
  let resProbeDownStartMs = 0;
  let frameUnderSinceMs = 0;
  let resProbeUpStartMs = 0;
  let resScaleIndex = 0;
  let presetLoadPressureUntilMs = 0;
  let pendingPresetRequest: {
    origin: "manual" | "auto";
    requestedAtMs: number;
  } | null = null;
  let pendingBgPresetRequest: { origin: "auto"; requestedAtMs: number } | null =
    null;

  const AUDIO_VALID_RMS_MIN = 0.005;
  const AUDIO_VALID_FRAMES = 12;
  const AUDIO_COOLDOWN_MS = 1200;
  const BEAT_TRUST_MS = 1500;
  const BEAT_COOLDOWN_MS = 2000;
  const RENDER_COOLDOWN_MS = 2500;
  const FRAME_TIME_P95_LIMIT_MS = 10.5;
  const AUDIO_ANALYSIS_FPS_MIN = 30;
  const AUDIO_ANALYSIS_FPS_MID = 45;
  const AUDIO_ANALYSIS_FPS_MAX = 60;
  const AUDIO_ANALYSIS_COOLDOWN_MS = 4000;
  const BEAT_TEMPO_FPS_LOW = 10;
  const BEAT_TEMPO_FPS_MID = 20;
  const BEAT_TEMPO_FPS_HIGH = 30;
  const BEAT_TEMPO_COOLDOWN_MS = 4000;
  const PM_AUDIO_FEED_FG_HIGH_MS = 33;
  const PM_AUDIO_FEED_FG_MID_MS = 50;
  const PM_AUDIO_FEED_FG_LOW_MS = 70;
  const PM_AUDIO_FEED_BG_HIGH_MS = 55;
  const PM_AUDIO_FEED_BG_MID_MS = 80;
  const PM_AUDIO_FEED_BG_LOW_MS = 120;
  const PM_AUDIO_FEED_COOLDOWN_MS = 3500;
  const RES_COOLDOWN_MS = 2500;
  const RES_PROBE_AFTER_MS = 3000;
  const RES_PROBE_WINDOW_MS = 2000;
  const RES_P95_THRESHOLD_MS = 9.6;
  const RES_P95_UP_THRESHOLD_MS = 7.6;
  const RES_UP_STABLE_MS = 10000;
  const RES_UP_PRESET_COOLDOWN_MS = 5000;
  const RES_SCALE_STEPS = [1, 0.85, 0.7, 0.6];
  const DISPLAY_CHECK_INTERVAL_MS = 250;
  const DISPLAY_INIT_DEBOUNCE_MS = 400;
  const DISPLAY_CHANGE_MIN_PX = 48;
  const DISPLAY_CHANGE_MIN_RATIO = 0.08;
  const DISPLAY_MAX_PIXELS = 3840 * 2160;
  const CALIBRATION_AUTO_OFF_MS = 30_000;
  const PRESET_SWITCH_COOLDOWN_MS = 4000;
  const BG_PRESET_SWITCH_COOLDOWN_MS = 30000;
  const FG_RECENT_BLOCK_MS = 2000;
  const BG_RECENT_BLOCK_MS = 2000;
  const PM_OPACITY_BUDGET = 1.2;
  const BG_COUPLE_STRENGTH = 0.7;
  const PRESET_LOAD_PRESSURE_MS = 1400;
  const PRESET_PREFETCH_PRESSURE_DELAY_MS = 220;
  const SECTION_ONSET_WINDOW_MS = 2000;
  const SECTION_FLUX_THR = 0.35;
  const SECTION_ATTACK_HZ = 1.6;
  const SECTION_RELEASE_HZ = 0.6;
  const COUPLING_FLIP_WINDOW_MS = 2000;
  const COUPLING_FLIP_THRESHOLD = 4;
  const COUPLING_DAMPEN_MS = 3000;
  const COUPLING_DAMPEN_SCALE = 0.6;
  const COUPLING_SWITCH_DAMPEN_MS = 1500;
  const COUPLING_SWITCH_DAMPEN_SCALE = 0.5;
  const COUPLING_LUMA_DELTA_GAIN = 0.35;

  let audioAnalysisFpsCap = AUDIO_ANALYSIS_FPS_MAX;
  let audioAnalysisLastSetMs = 0;
  let beatTempoFpsCap = BEAT_TEMPO_FPS_HIGH;
  let beatTempoLastSetMs = 0;
  let pmAudioCadenceMode: "high" | "mid" | "low" = "high";
  let pmAudioCadenceLastSetMs = 0;
  
  // 初始化预算管理器（基于分辨率选择初始等级）
  const computeInitialQualityLevel = () => {
    const maxSide = Math.max(1, initialDisplay.w, initialDisplay.h);
    if (maxSide >= 3000) return "medium";
    if (maxSide >= 2000) return "high";
    return "high";
  };
  
  const initPerformanceBudget = (nowMs: number) => {
    const initialLevel = computeInitialQualityLevel();
    performanceBudgetManager.setLevel(initialLevel, nowMs);
  };
  
  // 统一的性能预算更新（替换原有的 3 个独立函数）
  const updatePerformanceBudget = (timeMs: number) => {
    // 记录帧时间到预算管理器
    const p95 = computeFrameTimeP95(timeMs);
    if (Number.isFinite(p95) && p95 > 0) {
      performanceBudgetManager.recordFrameTime(p95);
    }
    
    // Preset 加载期间强制降级
    if (presetLoadPressureUntilMs && timeMs < presetLoadPressureUntilMs) {
      performanceBudgetManager.setLevel("low", timeMs);
      return;
    }
    
    // 评估是否需要调整质量级别
    const suggestedLevel = performanceBudgetManager.evaluateAdjustment(timeMs);
    if (suggestedLevel) {
      performanceBudgetManager.applyLevel(suggestedLevel, timeMs);
    }
  };
  
  // 保留旧函数接口用于向后兼容（内部委托给预算管理器）
  const applyAudioAnalysisCap = (
    next: number,
    reason: string,
    nowMs: number
  ) => {
    const v = Number(next);
    if (!Number.isFinite(v)) return;
    const clamped = Math.max(
      AUDIO_ANALYSIS_FPS_MIN,
      Math.min(AUDIO_ANALYSIS_FPS_MAX, Math.round(v))
    );
    if (clamped === audioAnalysisFpsCap) return;
    audioAnalysisFpsCap = clamped;
    audioAnalysisLastSetMs = nowMs;
    audioBus.setAnalysisFpsCap(audioAnalysisFpsCap);
    recordControlPlaneEvent("AUDIO_FPS", `${audioAnalysisFpsCap}:${reason}`);
  };

  const initAudioAnalysisCap = (nowMs: number) => {
    // 委托给统一预算管理器
    initPerformanceBudget(nowMs);
  };

  updateAudioAnalysisCap = (timeMs: number) => {
    // 委托给统一预算管理器
    updatePerformanceBudget(timeMs);
  };

  const applyBeatTempoCap = (next: number, reason: string, nowMs: number) => {
    const v = Number(next);
    if (!Number.isFinite(v)) return;
    const clamped = Math.max(
      BEAT_TEMPO_FPS_LOW,
      Math.min(BEAT_TEMPO_FPS_HIGH, Math.round(v))
    );
    if (clamped === beatTempoFpsCap) return;
    beatTempoFpsCap = clamped;
    beatTempoLastSetMs = nowMs;
    recordControlPlaneEvent("BEAT_FPS", `${beatTempoFpsCap}:${reason}`);
  };

  const initBeatTempoCap = (nowMs: number) => {
    // 委托给统一预算管理器
    initPerformanceBudget(nowMs);
  };

  updateBeatTempoCadence = (timeMs: number) => {
    // 委托给统一预算管理器
    updatePerformanceBudget(timeMs);
  };

  const applyProjectMAudioCadence = (
    mode: "high" | "mid" | "low",
    reason: string,
    nowMs: number
  ) => {
    if (mode === pmAudioCadenceMode && reason !== "init") return;
    pmAudioCadenceMode = mode;
    pmAudioCadenceLastSetMs = nowMs;
    const fgMs =
      mode === "low"
        ? PM_AUDIO_FEED_FG_LOW_MS
        : mode === "mid"
        ? PM_AUDIO_FEED_FG_MID_MS
        : PM_AUDIO_FEED_FG_HIGH_MS;
    const bgMs =
      mode === "low"
        ? PM_AUDIO_FEED_BG_LOW_MS
        : mode === "mid"
        ? PM_AUDIO_FEED_BG_MID_MS
        : PM_AUDIO_FEED_BG_HIGH_MS;
    projectLayer.setAudioFeedIntervalMs(fgMs);
    projectLayerBg.setAudioFeedIntervalMs(bgMs);
    recordControlPlaneEvent(
      "PM_AUDIO_FEED",
      `${mode}:${fgMs}/${bgMs}:${reason}`
    );
  };

  updateProjectMAudioCadence = (timeMs: number) => {
    // 委托给统一预算管理器
    updatePerformanceBudget(timeMs);
  };
      applyProjectMAudioCadence(mode, reason, timeMs);
    }
  };

  initAudioAnalysisCap(
    typeof performance !== "undefined" ? performance.now() : Date.now()
  );
  initBeatTempoCap(
    typeof performance !== "undefined" ? performance.now() : Date.now()
  );
  applyProjectMAudioCadence(
    pmAudioCadenceMode,
    "init",
    typeof performance !== "undefined" ? performance.now() : Date.now()
  );

  const PM_BYPASS_THRESHOLD_ON = 0.02;
  const PM_BYPASS_THRESHOLD_OFF = 0.05;
  const PM_BYPASS_ON_MS = 1200;
  const PM_BYPASS_OFF_MS = 300;
  let pmInvisibleSinceMs = 0;
  let pmVisibleSinceMs = 0;
  let pmCompositorBypass = false;
  updateCompositorBypass = (timeMs: number) => {
    if (!sceneManager.getCompositorConfig().enabled) return;
    const pmReady = projectLayer.isReady();
    const pmOpacity = projectLayer.getOpacity();
    const shouldBypass =
      !pmReady ||
      pmOpacity <= PM_BYPASS_THRESHOLD_ON ||
      !Number.isFinite(pmOpacity);
    const shouldEnable = pmReady && pmOpacity >= PM_BYPASS_THRESHOLD_OFF;

    if (shouldBypass) {
      if (!pmInvisibleSinceMs) pmInvisibleSinceMs = timeMs;
      pmVisibleSinceMs = 0;
      if (
        !pmCompositorBypass &&
        timeMs - pmInvisibleSinceMs >= PM_BYPASS_ON_MS
      ) {
        pmCompositorBypass = true;
        sceneManager.setCompositorBypassProjectM(true);
        recordControlPlaneEvent("COMPOSITOR_PM", "bypass");
      }
      return;
    }

    if (shouldEnable) {
      if (!pmVisibleSinceMs) pmVisibleSinceMs = timeMs;
      pmInvisibleSinceMs = 0;
      if (pmCompositorBypass && timeMs - pmVisibleSinceMs >= PM_BYPASS_OFF_MS) {
        pmCompositorBypass = false;
        sceneManager.setCompositorBypassProjectM(false);
        recordControlPlaneEvent("COMPOSITOR_PM", "active");
      }
    }
  };

  const isInFgPhaseWindow = (phase01: number) =>
    phase01 >= 0.9 || phase01 <= 0.06;
  const isInBgPhaseWindow = (phase01: number) =>
    phase01 >= 0.45 && phase01 <= 0.55;

  const evaluatePresetSwitchGate = (
    nowMs: number,
    origin: string
  ): { allow: boolean; reasons: string[] } => {
    const reasons: string[] = [];
    if (origin === "auto" && nowMs < autoCycleBackoffUntilMs) {
      reasons.push("backoff");
    }
    const verifyOverride = Boolean(
      (globalThis as any).__nw_verify?.forcePresetGateOpen
    );
    if (!verifyOverride) {
      if (!gateAudioValid) reasons.push("audio");
      if (!gateBeatTrusted) reasons.push("beat");
      if (!gateRenderStable) reasons.push("render");
    }
    if (nowMs < beatCooldownUntilMs) reasons.push("beatCooldown");
    if (lastResCommitMs && nowMs - lastResCommitMs < RES_COOLDOWN_MS) {
      reasons.push("m3Cooldown");
    }
    if (
      lastPresetSwitchMs &&
      nowMs - lastPresetSwitchMs < PRESET_SWITCH_COOLDOWN_MS
    ) {
      reasons.push("cooldown");
    }
    if (
      lastBgPresetSwitchMs &&
      nowMs - lastBgPresetSwitchMs < BG_RECENT_BLOCK_MS
    ) {
      reasons.push("bgRecent");
    }
    if (!verifyOverride && gateBeatTrusted) {
      const phase01 = clamp01(lastBeatPhase01);
      if (!isInFgPhaseWindow(phase01)) reasons.push("phase");
    }
    if (reasons.length === 0) return { allow: true, reasons };
    recordControlPlaneEvent("ACTION_DENY", `${origin}:${reasons.join(",")}`);
    return { allow: false, reasons };
  };

  const evaluateBgPresetSwitchGate = (
    nowMs: number,
    origin: string
  ): { allow: boolean; reasons: string[] } => {
    const reasons: string[] = [];
    if (origin === "bg:auto" && nowMs < autoCycleBgBackoffUntilMs) {
      reasons.push("backoff");
    }
    const verifyOverride = Boolean(
      (globalThis as any).__nw_verify?.forcePresetGateOpen
    );
    if (!verifyOverride) {
      if (!gateAudioValid) reasons.push("audio");
      if (!gateBeatTrusted) reasons.push("beat");
      if (!gateRenderStable) reasons.push("render");
    }
    if (nowMs < beatCooldownUntilMs) reasons.push("beatCooldown");
    if (lastResCommitMs && nowMs - lastResCommitMs < RES_COOLDOWN_MS) {
      reasons.push("m3Cooldown");
    }
    if (lastPresetSwitchMs && nowMs - lastPresetSwitchMs < FG_RECENT_BLOCK_MS) {
      reasons.push("fgRecent");
    }
    if (
      lastBgPresetSwitchMs &&
      nowMs - lastBgPresetSwitchMs < BG_PRESET_SWITCH_COOLDOWN_MS
    ) {
      reasons.push("cooldown");
    }
    if (!verifyOverride && gateBeatTrusted) {
      const phase01 = clamp01(lastBeatPhase01);
      if (!isInBgPhaseWindow(phase01)) reasons.push("phase");
    }
    if (reasons.length === 0) return { allow: true, reasons };
    recordControlPlaneEvent("ACTION_DENY", `${origin}:${reasons.join(",")}`);
    return { allow: false, reasons };
  };

  const evaluateResCommitGate = (nowMs: number, direction: "down" | "up") => {
    const reasons: string[] = [];
    if (!gateAudioValid) reasons.push("audio");
    const rebuilding = projectLayer.getRebuildStatus().inProgress;
    if (rebuilding) reasons.push("rebuild");
    if (lastResCommitMs && nowMs - lastResCommitMs < RES_COOLDOWN_MS) {
      reasons.push("cooldown");
    }
    if (presetLoadInFlight) reasons.push("presetLoad");
    if (direction === "up" && !gateRenderStable) reasons.push("render");
    const lastPresetActionMs = Math.max(
      lastPresetSwitchMs,
      lastBgPresetSwitchMs
    );
    if (lastPresetActionMs) {
      const presetCooldown =
        direction === "up"
          ? RES_UP_PRESET_COOLDOWN_MS
          : PRESET_SWITCH_COOLDOWN_MS;
      if (nowMs - lastPresetActionMs < presetCooldown) {
        reasons.push("presetCooldown");
      }
    }
    return { allow: reasons.length === 0, reasons };
  };

  const applyResolutionScale = (scale: number, nowMs: number) => {
    const rect = canvas.getBoundingClientRect();
    const baseW = Math.max(1, Math.round(rect.width || canvas.clientWidth));
    const baseH = Math.max(1, Math.round(rect.height || canvas.clientHeight));
    const nextScale = Math.max(0.5, Math.min(1, Number(scale)));
    const w = Math.max(1, Math.floor(baseW * nextScale));
    const h = Math.max(1, Math.floor(baseH * nextScale));
    sceneManager.setCompositorTargetMode("fixed");
    sceneManager.setCompositorFixedSize(w, h);
    syncProjectMEngineTargets();
    lastResCommitMs = nowMs;
    recordControlPlaneEvent("RES_COMMIT", `${w}x${h}`);
    noteCouplingSwitchDampen(nowMs, "res");
    decisionTrace.record({
      tMs: nowMs,
      writer: "adaptiveRes",
      target: "renderer.compositor.fixedSize",
      value: `${w}x${h}`,
    });
    captureColorSnapshot("resCommit", nowMs);
  };

  const readDisplayMetrics = () => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(
      1,
      Math.round(rect.width || canvas.clientWidth || window.innerWidth)
    );
    const h = Math.max(
      1,
      Math.round(rect.height || canvas.clientHeight || window.innerHeight)
    );
    const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
    return { w, h, dpr };
  };

  const hasDisplayChanged = (
    prev: { w: number; h: number; dpr: number },
    next: { w: number; h: number; dpr: number }
  ) => {
    if (!prev.w || !prev.h) return true;
    const dw = Math.abs(next.w - prev.w);
    const dh = Math.abs(next.h - prev.h);
    const dr = Math.abs(next.dpr - prev.dpr);
    const rw = prev.w > 0 ? dw / prev.w : 0;
    const rh = prev.h > 0 ? dh / prev.h : 0;
    return (
      dw >= DISPLAY_CHANGE_MIN_PX ||
      dh >= DISPLAY_CHANGE_MIN_PX ||
      rw >= DISPLAY_CHANGE_MIN_RATIO ||
      rh >= DISPLAY_CHANGE_MIN_RATIO ||
      dr >= 0.05
    );
  };

  const pickInitialScaleIndex = (w: number, h: number) => {
    const basePixels = Math.max(1, Math.round(w * h));
    const capRatio = DISPLAY_MAX_PIXELS / basePixels;
    const idealScale = Math.min(1, Math.sqrt(Math.max(0, capRatio)));
    let idx = RES_SCALE_STEPS.length - 1;
    for (let i = 0; i < RES_SCALE_STEPS.length; i += 1) {
      if (RES_SCALE_STEPS[i] <= idealScale + 1e-6) {
        idx = i;
        break;
      }
    }
    return idx;
  };

  const applyDisplayInitScale = (
    nowMs: number,
    metrics: { w: number; h: number; dpr: number },
    reason: string
  ) => {
    if (metrics.w < 10 || metrics.h < 10) return false;
    const idx = pickInitialScaleIndex(metrics.w, metrics.h);
    const scale = RES_SCALE_STEPS[idx] ?? 1;
    const targetW = Math.max(1, Math.floor(metrics.w * scale));
    const targetH = Math.max(1, Math.floor(metrics.h * scale));

    controlPlaneDebug.display.viewportW = metrics.w;
    controlPlaneDebug.display.viewportH = metrics.h;
    controlPlaneDebug.display.dpr = metrics.dpr;
    controlPlaneDebug.display.initScale = scale;
    controlPlaneDebug.display.targetW = targetW;
    controlPlaneDebug.display.targetH = targetH;
    controlPlaneDebug.display.pending = displayPending;

    const cfg = sceneManager.getCompositorConfig();
    const sameSize =
      cfg.targetMode === "fixed" &&
      Math.abs(cfg.fixedWidth - targetW) <= 2 &&
      Math.abs(cfg.fixedHeight - targetH) <= 2;
    if (sameSize && resScaleIndex === idx) {
      return true;
    }
    if (projectLayer.getRebuildStatus().inProgress || presetLoadInFlight) {
      return false;
    }
    resScaleIndex = idx;
    applyResolutionScale(scale, nowMs);
    frameOverSinceMs = 0;
    frameUnderSinceMs = 0;
    resProbeDownStartMs = 0;
    resProbeUpStartMs = 0;
    controlPlaneDebug.scheduledAction = `resInit:${scale}`;
    recordControlPlaneEvent("RES_INIT", `${targetW}x${targetH}@${scale}`);
    decisionTrace.record({
      tMs: nowMs,
      writer: "displayInit",
      target: "renderer.compositor.fixedSize",
      value: `${targetW}x${targetH}`,
      reason,
    });
    return true;
  };

  const captureColorSnapshot = (reason: string, nowMs: number) => {
    const r = sceneManager.getRendererInfo();
    const c = sceneManager.getCompositorConfig();
    controlPlaneDebug.color.outputColorSpace = String(r.outputColorSpace);
    controlPlaneDebug.color.toneMapping = String(r.toneMapping);
    controlPlaneDebug.color.toneMappingExposure = Number(
      (r as any).toneMappingExposure ?? 1
    );
    controlPlaneDebug.color.premultipliedAlpha =
      typeof (r as any).premultipliedAlpha === "boolean"
        ? Boolean((r as any).premultipliedAlpha)
        : null;
    controlPlaneDebug.color.targetMode = c.targetMode;
    controlPlaneDebug.color.fixedWidth = c.fixedWidth;
    controlPlaneDebug.color.fixedHeight = c.fixedHeight;
    recordControlPlaneEvent(
      "COLOR_SNAPSHOT",
      `${String(r.outputColorSpace)}|${String(r.toneMapping)}|${
        controlPlaneDebug.color.toneMappingExposure
      }|pm=${controlPlaneDebug.color.premultipliedAlpha ? 1 : 0}`
    );
    decisionTrace.record({
      tMs: nowMs,
      writer: "colorSpace",
      target: "renderer.colorSpace",
      value: `${String(r.outputColorSpace)}/${String(r.toneMapping)}`,
      reason,
    });
  };

  const setCalibrationOverlayEnabled = (enabled: boolean, reason: string) => {
    calibrationOverlayEnabled = Boolean(enabled);
    calibrationOverlay.style.display = calibrationOverlayEnabled
      ? "flex"
      : "none";
    dom.calibrationToggle?.classList.toggle(
      "toolbar__button--active",
      calibrationOverlayEnabled
    );
    if (calibrationAutoOffTimer != null) {
      window.clearTimeout(calibrationAutoOffTimer);
      calibrationAutoOffTimer = null;
    }
    if (calibrationOverlayEnabled) {
      const nowMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      calibrationAutoOffUntilMs = nowMs + CALIBRATION_AUTO_OFF_MS;
      calibrationAutoOffTimer = window.setTimeout(() => {
        calibrationAutoOffTimer = null;
        setCalibrationOverlayEnabled(false, "autoOff");
      }, CALIBRATION_AUTO_OFF_MS);
    } else {
      calibrationAutoOffUntilMs = 0;
    }
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    recordControlPlaneEvent("CALIB", calibrationOverlayEnabled ? "on" : reason);
    captureColorSnapshot(reason, nowMs);
    decisionTrace.record({
      tMs: nowMs,
      writer: "calibration",
      target: "renderer.calibrationOverlay",
      value: calibrationOverlayEnabled ? "on" : "off",
      reason,
    });
  };

  const exportRuntimeSnapshot = (reason: string) => {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const snapshot = {
      version: "nw-snapshot-v1",
      reason,
      timeIso: new Date().toISOString(),
      nowMs,
      perf: {
        frameTimeP95Ms,
      },
      controlPlane: controlPlaneDebug,
      overlay: {
        diag: { ...overlayBudgetDiag },
        mul: {
          basic: overlayMulBasic,
          camera: overlayMulCamera,
          video: overlayMulVideo,
          depth: overlayMulDepth,
          projectm: overlayMulProjectM,
        },
        cfg: { ...overlayBudget },
      },
      renderer: {
        info: sceneManager.getRendererInfo(),
        compositor: sceneManager.getCompositorConfig(),
        compositorProfile: (() => {
          try {
            return (sceneManager as any).getCompositorProfile?.();
          } catch {
            return undefined;
          }
        })(),
      },
      presets: {
        fgId: currentPresetId,
        bgId: currentPresetIdBg,
        librarySource: currentLibrarySource,
        autoCycle: Boolean(presetAutoToggle?.checked),
        switchReportLast: presetSwitchReports[presetSwitchReports.length - 1],
        switchReportsRecent: presetSwitchReports.slice(-20),
      },
      audio: {
        context: audioBus.audioContextInfo,
        lastFrame: lastAudioFrameSummary,
        lastAudioFrameMs,
      },
      decisionTrace: decisionTrace.getRecent({
        sinceMs: nowMs - 60_000,
        limit: 200,
      }),
      topology: lastTopologySnapshot,
      projectmVerify: (globalThis as any).__projectm_verify ?? {},
      visualState: lastVisualState,
    };

    try {
      const json = JSON.stringify(snapshot, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `newliveweb-snapshot-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      recordControlPlaneEvent("SNAPSHOT", reason);
      setInspectorStatusExtraTransient("Snapshot exported", 1800);
    } catch {
      setInspectorStatusExtraTransient("Snapshot export failed", 1800);
    }
  };

  const requestPresetSwitch = (origin: string) => {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const decision = evaluatePresetSwitchGate(nowMs, origin);
    if (!decision.allow) {
      controlPlaneDebug.denyReasonsTop = decision.reasons.slice(0, 3);
      controlPlaneDebug.scheduledAction = null;
      return { ok: false, reasons: decision.reasons };
    }
    controlPlaneDebug.denyReasonsTop = [];
    controlPlaneDebug.scheduledAction = `preset:${origin}`;
    lastPresetSwitchMs = nowMs;
    recordControlPlaneEvent("ACTION_COMMIT", `preset:${origin}`);
    noteCouplingSwitchDampen(nowMs, origin);
    noteAivjMorphHold(`preset:${origin}`);
    return { ok: true, reasons: [] as string[] };
  };

  const requestPresetCycle = (origin: "manual" | "auto") => {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const decision = evaluatePresetSwitchGate(nowMs, origin);
    if (!decision.allow) {
      if (pendingPresetRequest?.origin === "manual" && origin === "auto") {
        return;
      }
      pendingPresetRequest = { origin, requestedAtMs: nowMs };
      controlPlaneDebug.denyReasonsTop = decision.reasons.slice(0, 3);
      controlPlaneDebug.scheduledAction = null;
      return;
    }
    pendingPresetRequest = null;
    controlPlaneDebug.denyReasonsTop = [];
    controlPlaneDebug.scheduledAction = `preset:${origin}`;
    lastPresetSwitchMs = nowMs;
    recordControlPlaneEvent("ACTION_COMMIT", `preset:${origin}`);
    noteCouplingSwitchDampen(nowMs, origin);
    noteAivjMorphHold(`preset:${origin}`);
    void cycleToNextPreset(origin, { skipGate: true });
  };

  const requestBgPresetCycle = (origin: "auto") => {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const decision = evaluateBgPresetSwitchGate(nowMs, `bg:${origin}`);
    if (!decision.allow) {
      pendingBgPresetRequest = { origin, requestedAtMs: nowMs };
      controlPlaneDebug.denyReasonsTop = decision.reasons.slice(0, 3);
      controlPlaneDebug.scheduledAction = null;
      return;
    }
    pendingBgPresetRequest = null;
    controlPlaneDebug.denyReasonsTop = [];
    controlPlaneDebug.scheduledAction = `presetBg:${origin}`;
    lastBgPresetSwitchMs = nowMs;
    recordControlPlaneEvent("ACTION_COMMIT", `presetBg:${origin}`);
    noteCouplingSwitchDampen(nowMs, `bg:${origin}`);
    noteAivjMorphHold(`presetBg:${origin}`);
    void cycleToNextPresetBg(origin, { skipGate: true });
  };

  let inspectorStatusExtraTimer: number | null = null;
  const setInspectorStatusExtraTransient = (message: string, ttlMs = 2500) => {
    if (!dom.inspectorStatus) return;
    try {
      dom.inspectorStatus.dataset.extra = String(message ?? "").trim();
    } catch {
      // ignore
    }
    try {
      inspector?.refreshStatus();
    } catch {
      // ignore
    }
    if (inspectorStatusExtraTimer != null) {
      window.clearTimeout(inspectorStatusExtraTimer);
      inspectorStatusExtraTimer = null;
    }
    if (ttlMs > 0) {
      inspectorStatusExtraTimer = window.setTimeout(() => {
        inspectorStatusExtraTimer = null;
        try {
          if (dom.inspectorStatus)
            delete (dom.inspectorStatus as any).dataset?.extra;
        } catch {
          // ignore
        }
        try {
          inspector?.refreshStatus();
        } catch {
          // ignore
        }
      }, ttlMs);
    }
  };

  // --- Toolbar helpers ---
  const setRowVisible = (
    row: HTMLElement | null | undefined,
    visible: boolean
  ) => {
    if (!row) return;
    row.style.display = visible ? "" : "none";
  };

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const fmtPct = (v01: number) => `${Math.round(clamp01(v01) * 100)}%`;

  const clampLiquidRandomPatch = (patch: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...patch };
    const clampNum = (value: unknown, min: number, max: number) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return value;
      return Math.min(max, Math.max(min, n));
    };
    if (Object.prototype.hasOwnProperty.call(next, "brightness")) {
      next.brightness = clampNum(next.brightness, 0.6, 1.1);
    }
    if (Object.prototype.hasOwnProperty.call(next, "metallicAmount")) {
      next.metallicAmount = clampNum(next.metallicAmount, 0, 0.16);
    }
    if (Object.prototype.hasOwnProperty.call(next, "tintStrength")) {
      next.tintStrength = clampNum(next.tintStrength, 0, 0.5);
    }
    if (Object.prototype.hasOwnProperty.call(next, "paletteStrength")) {
      next.paletteStrength = clampNum(next.paletteStrength, 0, 0.5);
    }
    if (Object.prototype.hasOwnProperty.call(next, "audioSensitivity")) {
      next.audioSensitivity = clampNum(next.audioSensitivity, 0.7, 1.3);
    }
    return next;
  };

  function readNumberInputValue(
    el: HTMLInputElement | null | undefined,
    fallback: number
  ) {
    const n = Number(el?.value);
    return Number.isFinite(n) ? n : fallback;
  }

  function readRangeInputValue01(
    el: HTMLInputElement | null | undefined,
    fallback01: number
  ) {
    const n = Number(el?.value);
    if (!Number.isFinite(n)) return fallback01;
    return clamp01(n);
  }

  const resolveToolbarTunableInput = (
    target: HTMLElement | null
  ): HTMLInputElement | null => {
    if (!target) return null;

    let input = target.closest?.(
      'input[type="range"], input[type="number"]'
    ) as HTMLInputElement | null;

    // Macro strips: allow wheel/drag anywhere in the strip (label/value/knob) to adjust the macro.
    if (!input) {
      const strip = target.closest?.(".nw-macro-strip") as HTMLElement | null;
      if (strip) {
        input = strip.querySelector<HTMLInputElement>(
          'input.nw-knob__input[type="range"], input.nw-knob__input[type="number"]'
        );
      }
    }

    // Slot knobs: allow wheel/drag anywhere within the slot knob wrapper.
    if (!input) {
      const slotKnob = target.closest?.(
        "[data-role='slot-knob']"
      ) as HTMLElement | null;
      if (slotKnob) {
        input = slotKnob.querySelector<HTMLInputElement>(
          'input[data-role="slot-value"], input.nw-knob__input[type="range"], input.nw-knob__input[type="number"]'
        );
      }
    }

    // Support plugin-style knobs: wheel/drag on dial should still adjust the hidden range.
    if (!input) {
      const knob = target.closest?.(".nw-knob") as HTMLElement | null;
      if (knob) {
        input = knob.querySelector<HTMLInputElement>(
          'input.nw-knob__input[type="range"], input.nw-knob__input[type="number"]'
        );
      }
    }

    return input ?? null;
  };

  // Mouse-wheel tuning: allow adjusting sliders/numbers without drag.
  // Applies only inside toolbar to avoid breaking page scroll.
  trackBootstrapDispose(
    listen(
      dom.toolbar,
      "wheel",
      (ev) => {
        const target = ev.target as HTMLElement | null;
        if (!target) return;

        const input = resolveToolbarTunableInput(target);
        if (!input) return;
        if (input.disabled) return;

        // Don't fight browser zoom or horizontal scrolling.
        if ((ev as WheelEvent).ctrlKey) return;

        const stepAttr = (input.getAttribute("step") ?? "").trim();
        const step = stepAttr && stepAttr !== "any" ? Number(stepAttr) : NaN;
        const min = Number(input.getAttribute("min"));
        const max = Number(input.getAttribute("max"));

        const current = Number(input.value);
        if (!Number.isFinite(current)) return;

        const dir = ev.deltaY < 0 ? 1 : -1; // wheel up => increase

        let delta = Number.isFinite(step)
          ? step * dir
          : input.type === "range" &&
            Number.isFinite(min) &&
            Number.isFinite(max)
          ? ((max - min) / 100) * dir
          : 1 * dir;

        // Keep range inputs stable.
        if (!Number.isFinite(delta) || delta === 0) delta = 1 * dir;

        let next = current + delta;
        if (Number.isFinite(min)) next = Math.max(min, next);
        if (Number.isFinite(max)) next = Math.min(max, next);

        // Avoid noisy updates.
        if (next === current) return;

        input.value = String(next);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        ev.preventDefault();
      },
      { passive: false }
    )
  );

  // Windows-friendly knob interaction: allow click+drag on the knob dial.
  // This keeps the "wheel" path and avoids changing any UI structure.
  type KnobDragState = {
    dial: HTMLElement;
    input: HTMLInputElement;
    pointerId: number;
    startX: number;
    startY: number;
    startValue: number;
    min: number;
    max: number;
    step: number;
  };
  let knobDrag: KnobDragState | null = null;

  const readInputRangeMeta = (input: HTMLInputElement) => {
    const stepAttr = (input.getAttribute("step") ?? "").trim();
    const step = stepAttr && stepAttr !== "any" ? Number(stepAttr) : NaN;
    const min = Number(input.getAttribute("min"));
    const max = Number(input.getAttribute("max"));
    return {
      step: Number.isFinite(step) ? step : 0,
      min: Number.isFinite(min) ? min : -Infinity,
      max: Number.isFinite(max) ? max : Infinity,
    };
  };

  if (typeof document !== "undefined") {
    trackBootstrapDispose(
      listen(
        dom.toolbar,
        "pointerdown",
        (ev) => {
          const pev = ev as PointerEvent;
          if (pev.button !== 0) return;

          const target = pev.target as HTMLElement | null;
          if (!target) return;

          const knob = target.closest?.(".nw-knob") as HTMLElement | null;
          if (!knob) return;

          const dial =
            (knob.querySelector(".nw-knob__dial") as HTMLElement | null) ??
            knob;

          const input = resolveToolbarTunableInput(knob);
          if (!input) return;
          if (input.disabled) return;

          const macroStrip = knob.closest?.(".nw-macro-strip");
          const macroSlot = knob.closest?.(".nw-slot");
          if (macroStrip || macroSlot) {
            try {
              noteUserMacroInteraction();
            } catch {
              // ignore
            }
          }

          const current = Number(input.value);
          if (!Number.isFinite(current)) return;

          const meta = readInputRangeMeta(input);
          knobDrag = {
            dial,
            input,
            pointerId: pev.pointerId,
            startX: pev.clientX,
            startY: pev.clientY,
            startValue: current,
            min: meta.min,
            max: meta.max,
            step: meta.step,
          };

          try {
            dial.setPointerCapture(pev.pointerId);
          } catch {
            // ignore
          }
          pev.preventDefault();
        },
        { passive: false }
      )
    );

    trackBootstrapDispose(
      listen(
        document,
        "pointermove",
        (ev) => {
          const pev = ev as PointerEvent;
          if (!knobDrag) return;
          if (pev.pointerId !== knobDrag.pointerId) return;

          const dy = knobDrag.startY - pev.clientY;
          const dx = pev.clientX - knobDrag.startX;
          const range =
            Number.isFinite(knobDrag.max) && Number.isFinite(knobDrag.min)
              ? knobDrag.max - knobDrag.min
              : 1;

          const safeRange =
            Number.isFinite(range) && range > 0 && range < 1e9 ? range : 1;

          // Windows-friendly: allow both vertical + horizontal drag.
          // ~260px vertical drag maps to full range.
          let perPx = safeRange / 260;
          if (pev.shiftKey) perPx *= 0.2;
          if (pev.altKey) perPx *= 0.1;
          if (pev.ctrlKey) perPx *= 0.05;

          const drag = dy + dx * 0.6;
          let next = knobDrag.startValue + drag * perPx;
          if (Number.isFinite(knobDrag.min))
            next = Math.max(knobDrag.min, next);
          if (Number.isFinite(knobDrag.max))
            next = Math.min(knobDrag.max, next);

          // Snap to step when defined.
          if (knobDrag.step > 0 && Number.isFinite(knobDrag.step)) {
            next = Math.round(next / knobDrag.step) * knobDrag.step;
          }

          if (Number.isFinite(next) && String(next) !== knobDrag.input.value) {
            knobDrag.input.value = String(next);
            knobDrag.input.dispatchEvent(new Event("input", { bubbles: true }));
          }
          pev.preventDefault();
        },
        { passive: false }
      )
    );

    trackBootstrapDispose(
      listen(
        document,
        "pointerup",
        (ev) => {
          const pev = ev as PointerEvent;
          if (!knobDrag) return;
          if (pev.pointerId !== knobDrag.pointerId) return;
          try {
            knobDrag.input.dispatchEvent(
              new Event("change", { bubbles: true })
            );
            knobDrag.dial.releasePointerCapture(pev.pointerId);
          } catch {
            // ignore
          }
          knobDrag = null;
        },
        { passive: true }
      )
    );

    trackBootstrapDispose(
      listen(
        document,
        "pointercancel",
        (ev) => {
          const pev = ev as PointerEvent;
          if (!knobDrag) return;
          if (pev.pointerId !== knobDrag.pointerId) return;
          knobDrag = null;
        },
        { passive: true }
      )
    );
  }

  const presetSelect = dom.presetSelect;
  const presetFileInput = dom.presetFileInput;
  const presetUrlInput = dom.presetUrlInput;
  const presetUrlButton = dom.presetUrlButton;
  const presetStatus = dom.presetStatus;
  const presetManifestInfo = dom.presetManifestInfo;
  const presetNextButton = dom.presetNextButton;
  const presetAutoToggle = dom.presetAutoToggle;
  const presetAutoIntervalInput = dom.presetAutoIntervalInput;
  const presetAutoLabel = dom.presetAutoLabel;
  const presetLibrarySelect = dom.presetLibrarySelect;
  const visualRandomButton = dom.visualRandomButton;
  const visualRandomParamsButton = dom.visualRandomParamsButton;
  const visualHoldButton = dom.visualHoldButton;
  const visualFavoriteButton = dom.visualFavoriteButton;
  const visualFavoriteCount = dom.visualFavoriteCount;
  const autoTechnoToggle = dom.autoTechnoToggle;
  const followAiToggle = dom.followAiToggle;
  const technoProfileSelect = dom.technoProfileSelect;
  const technoProfileSummary = dom.technoProfileSummary;
  const aivjStatusPill = dom.aivjStatusPill;
  const audioDrivePresetSelect = dom.audioDrivePresetSelect;
  const pmOpacityInput = dom.pmOpacityInput;
  const pmOpacityText = dom.pmOpacityText;
  const pmBlendModeSelect = dom.pmBlendModeSelect;
  const pmAudioOpacityToggle = dom.pmAudioOpacityToggle;
  const pmEnergyOpacityInput = dom.pmEnergyOpacityInput;
  const pmEnergyOpacityText = dom.pmEnergyOpacityText;
  const pmPriorityInput = dom.pmPriorityInput;
  const pmPriorityText = dom.pmPriorityText;
  const pmRetreatStrengthInput = dom.pmRetreatStrengthInput;
  const pmRetreatStrengthText = dom.pmRetreatStrengthText;
  const pmBudgetStatusText = dom.pmBudgetStatusText;
  const macroMapToggleButton = dom.macroMapToggleButton;
  const macroMapApplyButton = dom.macroMapApplyButton;
  const macroMapRandomButton = dom.macroMapRandomButton;
  const macroMapSaveButton = dom.macroMapSaveButton;
  const macroMapLoadButton = dom.macroMapLoadButton;
  const macroMapPanel = dom.macroMapPanel;
  const macroPresetSelect = dom.macroPresetSelect;
  const macroPresetApplyButton = dom.macroPresetApplyButton;
  const macroPresetAutoToggle = dom.macroPresetAutoToggle;
  const macroMapPmOpacityMacroSelect = dom.macroMapPmOpacityMacroSelect;
  const macroMapPmOpacityMinInput = dom.macroMapPmOpacityMinInput;
  const macroMapPmOpacityMaxInput = dom.macroMapPmOpacityMaxInput;
  const macroMapPmEnergyMacroSelect = dom.macroMapPmEnergyMacroSelect;
  const macroMapPmEnergyMinInput = dom.macroMapPmEnergyMinInput;
  const macroMapPmEnergyMaxInput = dom.macroMapPmEnergyMaxInput;
  const macroMapPmReactMacroSelect = dom.macroMapPmReactMacroSelect;
  const macroMapPmReactMinInput = dom.macroMapPmReactMinInput;
  const macroMapPmReactMaxInput = dom.macroMapPmReactMaxInput;
  const macroMapLiquidTimeMacroSelect = dom.macroMapLiquidTimeMacroSelect;
  const macroMapLiquidTimeMinInput = dom.macroMapLiquidTimeMinInput;
  const macroMapLiquidTimeMaxInput = dom.macroMapLiquidTimeMaxInput;
  const macroMapLiquidWaveMacroSelect = dom.macroMapLiquidWaveMacroSelect;
  const macroMapLiquidWaveMinInput = dom.macroMapLiquidWaveMinInput;
  const macroMapLiquidWaveMaxInput = dom.macroMapLiquidWaveMaxInput;
  const macroMapLiquidMetalMacroSelect = dom.macroMapLiquidMetalMacroSelect;
  const macroMapLiquidMetalMinInput = dom.macroMapLiquidMetalMinInput;
  const macroMapLiquidMetalMaxInput = dom.macroMapLiquidMetalMaxInput;
  const macroMapLiquidSpeedMacroSelect = dom.macroMapLiquidSpeedMacroSelect;
  const macroMapLiquidSpeedMinInput = dom.macroMapLiquidSpeedMinInput;
  const macroMapLiquidSpeedMaxInput = dom.macroMapLiquidSpeedMaxInput;
  const macroMapLiquidBrightnessMacroSelect =
    dom.macroMapLiquidBrightnessMacroSelect;
  const macroMapLiquidBrightnessMinInput = dom.macroMapLiquidBrightnessMinInput;
  const macroMapLiquidBrightnessMaxInput = dom.macroMapLiquidBrightnessMaxInput;
  const macroMapLiquidContrastMacroSelect =
    dom.macroMapLiquidContrastMacroSelect;
  const macroMapLiquidContrastMinInput = dom.macroMapLiquidContrastMinInput;
  const macroMapLiquidContrastMaxInput = dom.macroMapLiquidContrastMaxInput;

  // Background controls.
  const bgTypeSelect = dom.bgTypeSelect;
  const bgVariantSelect = dom.bgVariantSelect;
  const bgVariantLockToggle = dom.bgVariantLockToggle;
  const layerLiquidToggle = dom.layerLiquidToggle;
  const layerBasicToggle = dom.layerBasicToggle;
  const layerCameraToggle = dom.layerCameraToggle;
  const layerVideoToggle = dom.layerVideoToggle;
  const layerDepthToggle = dom.layerDepthToggle;

  const basicOpacityInput = dom.basicOpacityInput;
  const basicOpacityText = dom.basicOpacityText;
  const cameraOpacityInput = dom.cameraOpacityInput;
  const cameraOpacityText = dom.cameraOpacityText;
  const videoOpacityInput = dom.videoOpacityInput;
  const videoOpacityText = dom.videoOpacityText;
  const depthOpacityInput = dom.depthOpacityInput;
  const depthOpacityText = dom.depthOpacityText;

  const cameraDeviceSelect = dom.cameraDeviceSelect;
  const cameraSegmentToggle = dom.cameraSegmentToggle;

  const depthSourceSelect = dom.depthSourceSelect;
  const depthDeviceSelect = dom.depthDeviceSelect;
  const depthShowDepthToggle = dom.depthShowDepthToggle;
  const depthFogInput = dom.depthFogInput;
  const depthFogText = dom.depthFogText;
  const depthEdgeInput = dom.depthEdgeInput;
  const depthEdgeText = dom.depthEdgeText;
  const depthLayersInput = dom.depthLayersInput;
  const depthLayersText = dom.depthLayersText;
  const depthBlurInput = dom.depthBlurInput;
  const depthBlurText = dom.depthBlurText;
  const depthStatusText = dom.depthStatusText;

  const videoRetryButton = dom.videoRetryButton;
  const videoSrcInput = dom.videoSrcInput;
  const videoSrcApplyButton = dom.videoSrcApplyButton;
  const videoSrcHint = dom.videoSrcHint;

  const showSetupButton = dom.showSetupButton;
  const showSaveButton = dom.showSaveButton;
  const fullscreenToggleButton = dom.fullscreenToggleButton;
  const calibrationToggleButton = dom.calibrationToggle;
  const snapshotExportButton = dom.snapshotExportButton;

  const midiStatus = dom.midiStatus;
  const midiBindingsCount = dom.midiBindingsCount;
  const midiConnectButton = dom.midiConnectButton;
  const midiTargetSelect = dom.midiTargetSelect;
  const midiLearnButton = dom.midiLearnButton;
  const midiUnbindButton = dom.midiUnbindButton;
  const midiClearButton = dom.midiClearButton;
  const midiBindingLabel = dom.midiBindingLabel;

  let depthWsClient: DepthWsClient | null = null;
  let depthWsStatus: DepthWsStatus | null = null;

  // --- AIVJ (minimal Techno Auto) ---
  const AIVJ_ENABLED_KEY = "nw.aivj.enabled";
  const AIVJ_PROFILE_KEY = "nw.aivj.profile";
  const AIVJ_FOLLOW_UI_KEY = "nw.aivj.followUi";

  const LIQUID_VARIANT_LOCK_KEY = "nw.liquid.variantLock";
  let liquidVariantLocked = false;

  const readStoredBool = (key: string, fallback: boolean) => {
    try {
      const v = localStorage.getItem(key);
      if (v == null) return fallback;
      return v === "1" || v.toLowerCase() === "true";
    } catch {
      return fallback;
    }
  };

  liquidVariantLocked = readStoredBool(LIQUID_VARIANT_LOCK_KEY, false);
  if (bgVariantLockToggle) bgVariantLockToggle.checked = liquidVariantLocked;

  const readStoredNumber = (key: string, fallback: number) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  };

  const writeStored = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  };

  const TOOLBAR_DEBUG_KEY = "nw.toolbar.showDebug";
  const TOOLBAR_ADVANCED_KEY = "nw.toolbar.showAdvanced";
  let toolbarShowDebug = readStoredBool(TOOLBAR_DEBUG_KEY, false);
  let toolbarShowAdvanced = readStoredBool(TOOLBAR_ADVANCED_KEY, false);

  const applyToolbarGroups = () => {
    dom.toolbarBody.dataset.showDebug = toolbarShowDebug ? "1" : "0";
    dom.toolbarBody.dataset.showAdvanced = toolbarShowAdvanced ? "1" : "0";
    dom.toolbarDebugToggleButton.classList.toggle(
      "toolbar__button--active",
      toolbarShowDebug
    );
    dom.toolbarAdvancedToggleButton.classList.toggle(
      "toolbar__button--active",
      toolbarShowAdvanced
    );
    dom.toolbarDebugToggleButton.setAttribute(
      "aria-pressed",
      toolbarShowDebug ? "true" : "false"
    );
    dom.toolbarAdvancedToggleButton.setAttribute(
      "aria-pressed",
      toolbarShowAdvanced ? "true" : "false"
    );
  };

  applyToolbarGroups();
  trackBootstrapDispose(
    listen(dom.toolbarDebugToggleButton, "click", () => {
      toolbarShowDebug = !toolbarShowDebug;
      writeStored(TOOLBAR_DEBUG_KEY, toolbarShowDebug ? "1" : "0");
      applyToolbarGroups();
    })
  );
  trackBootstrapDispose(
    listen(dom.toolbarAdvancedToggleButton, "click", () => {
      toolbarShowAdvanced = !toolbarShowAdvanced;
      writeStored(TOOLBAR_ADVANCED_KEY, toolbarShowAdvanced ? "1" : "0");
      applyToolbarGroups();
    })
  );

  const readStoredString = (key: string, fallback: string) => {
    try {
      const v = localStorage.getItem(key);
      if (!v) return fallback;
      return v;
    } catch {
      return fallback;
    }
  };

  type AudioDrivePresetId = "balanced" | "punch" | "intense" | "subtle";
  const AUDIO_DRIVE_PRESET_KEY = "nw.audio.drivePreset";
  const AUDIO_DRIVE_PRESETS: Record<
    AudioDrivePresetId,
    Partial<AudioControlsConfig>
  > = {
    balanced: {
      mixToMacros: 0.86,
      attackMs: 100,
      releaseMs: 620,
      maxDeltaPerSec: 2.4,
      weights: {
        fusion: { energy: 0.8, bass: 0.7, flux: 0.25, beatPulse: 0.35 },
        motion: { energy: 0.15, bass: 0.25, flux: 1.15, beatPulse: 0.85 },
        sparkle: { energy: 0.08, bass: 0.15, flux: 1.05, beatPulse: 0.6 },
      },
    },
    punch: {
      mixToMacros: 0.96,
      attackMs: 80,
      releaseMs: 460,
      maxDeltaPerSec: 2.9,
      weights: {
        fusion: { energy: 0.7, bass: 0.7, flux: 0.25, beatPulse: 0.75 },
        motion: { energy: 0.1, bass: 0.3, flux: 1.05, beatPulse: 1.15 },
        sparkle: { energy: 0.08, bass: 0.2, flux: 0.85, beatPulse: 1.0 },
      },
    },
    intense: {
      mixToMacros: 1.0,
      attackMs: 60,
      releaseMs: 360,
      maxDeltaPerSec: 3.3,
      weights: {
        fusion: { energy: 0.65, bass: 0.85, flux: 0.3, beatPulse: 1.1 },
        motion: { energy: 0.05, bass: 0.4, flux: 1.2, beatPulse: 1.35 },
        sparkle: { energy: 0.06, bass: 0.3, flux: 1.0, beatPulse: 1.25 },
      },
    },
    subtle: {
      mixToMacros: 0.5,
      attackMs: 160,
      releaseMs: 750,
      maxDeltaPerSec: 1.6,
      weights: {
        fusion: { energy: 0.9, bass: 0.45, flux: 0.25, beatPulse: 0.25 },
        motion: { energy: 0.12, bass: 0.2, flux: 0.7, beatPulse: 0.3 },
        sparkle: { energy: 0.12, bass: 0.12, flux: 0.6, beatPulse: 0.25 },
      },
    },
  };

  const applyAudioDrivePreset = (
    presetId: AudioDrivePresetId,
    opts?: { save?: boolean }
  ) => {
    const preset =
      AUDIO_DRIVE_PRESETS[presetId] ?? AUDIO_DRIVE_PRESETS.balanced;
    audioControls.setConfig({ ...preset });
    if (audioDrivePresetSelect)
      audioDrivePresetSelect.value = presetId ?? "balanced";
    if (opts?.save !== false) {
      writeStored(AUDIO_DRIVE_PRESET_KEY, presetId);
    }
  };

  const initialAudioPreset = readStoredString(
    AUDIO_DRIVE_PRESET_KEY,
    "balanced"
  ) as AudioDrivePresetId;
  applyAudioDrivePreset(initialAudioPreset, { save: false });

  trackBootstrapDispose(
    listen(audioDrivePresetSelect, "change", () => {
      const raw = String(audioDrivePresetSelect?.value ?? "balanced");
      const next = (
        ["balanced", "punch", "intense", "subtle"] as const
      ).includes(raw as AudioDrivePresetId)
        ? (raw as AudioDrivePresetId)
        : "balanced";
      applyAudioDrivePreset(next, { save: true });
    })
  );

  const registerVerifyHooks = () => {
    const root = (globalThis as any).__nw_verify ?? {};
    (globalThis as any).__nw_verify = {
      ...root,
      getCompositorProfile: () => {
        try {
          return (sceneManager as any).getCompositorProfile?.();
        } catch {
          return null;
        }
      },
      getLastPresetSwitchReport: () => {
        return presetSwitchReports[presetSwitchReports.length - 1] ?? null;
      },
      getPresetSwitchReports: (limit?: number) => {
        const n = Math.max(
          1,
          Math.min(
            PRESET_SWITCH_REPORT_LIMIT,
            Number.isFinite(Number(limit)) ? Number(limit) : 40
          )
        );
        return presetSwitchReports.slice(-n);
      },
      clearPresetSwitchReports: () => {
        presetSwitchReports.length = 0;
        return true;
      },
      // Preset 预测引擎诊断 API
      getPresetPredictorStats: () => {
        return presetPredictor.getStats();
      },
      predictNextPresets: (topK?: number) => {
        if (!currentPresetId) return [];
        const all = getAllPresets();
        const candidates = all.map((p) => p.id);
        return presetPredictor.predict(currentPresetId, candidates, topK ?? 5);
      },
      togglePresetPrediction: (enabled?: boolean) => {
        const prev = presetPredictionEnabled;
        presetPredictionEnabled = enabled ?? !presetPredictionEnabled;
        return { prev, current: presetPredictionEnabled };
      },
      resetPresetPrediction: () => {
        presetPredictor.reset();
        return { reset: true };
      },
      
      // 性能预算管理器诊断 API
      getPerformanceBudgetStats: () => {
        return performanceBudgetManager.getStats();
      },
      setPerformanceQualityLevel: (level: string) => {
        const validLevels = ["ultra", "high", "medium", "low", "minimal"];
        if (!validLevels.includes(level)) {
          return { error: `Invalid level. Use: ${validLevels.join(", ")}` };
        }
        const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
        performanceBudgetManager.setLevel(level as any, nowMs);
        return { level, timestamp: nowMs };
      },
      resetPerformanceBudget: () => {
        performanceBudgetManager.reset();
        return { reset: true };
      },
      
      hideTopologyOverlay: () => {
        try {
          decisionTopologyOverlay.hide();
          return true;
        } catch {
          return false;
        }
      },
      showTopologyOverlay: () => {
        try {
          decisionTopologyOverlay.show();
          return true;
        } catch {
          return false;
        }
      },
      getFrameTimeP95Ms: () => {
        // Prefer the same value used by ControlPlane gates.
        // This is a rolling-window metric (see computeFrameTimeP95).
        return Number.isFinite(frameTimeP95Ms) ? frameTimeP95Ms : 0;
      },
      setBaselineCompositorEnabled: (enabled: boolean) => {
        // Baseline S1/S2 wants to compare compositor off/on.
        // When compositor is off, ProjectM must render with fixed-function blending.
        // When compositor is on, ProjectM should render "straight" (NoBlending) into RT.
        const next = Boolean(enabled);
        try {
          sceneManager.setCompositorEnabled(next);
        } catch {
          // ignore
        }
        try {
          projectLayer.setUseCompositor(next);
        } catch {
          // ignore
        }
      },
      setBaselineProjectmBgEnabled: (enabled: boolean) => {
        const next = Boolean(enabled);
        try {
          if (!next) {
            const cur = projectLayerBg.getBlendParams();
            projectLayerBg.setBlendParams({
              ...cur,
              opacity: 0,
              audioDrivenOpacity: false,
              energyToOpacityAmount: 0,
            });
          } else {
            const cur = projectLayerBg.getBlendParams();
            // Restore to a sane baseline if it was previously disabled.
            const opacity = cur.opacity > 0 ? cur.opacity : 0.4;
            const energyToOpacityAmount =
              cur.energyToOpacityAmount > 0 ? cur.energyToOpacityAmount : 0.2;
            projectLayerBg.setBlendParams({
              ...cur,
              opacity,
              audioDrivenOpacity: true,
              energyToOpacityAmount,
            });
          }
        } catch {
          // ignore
        }
      },
      getPerfCaps: () => {
        const nowMs =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const verify = (globalThis as any).__projectm_verify ?? {};
        const perPm = verify.perPm ?? {};
        const fg = perPm?.fg ?? {};
        const bg = perPm?.bg ?? {};
        let audioCfg: AudioControlsConfig | null = null;
        try {
          audioCfg = audioControls.getConfig();
        } catch {
          audioCfg = null;
        }
        return {
          nowMs,
          presetLoadPressureMsLeft: Math.max(
            0,
            presetLoadPressureUntilMs - nowMs
          ),
          frameTimeP95Ms: Number.isFinite(frameTimeP95Ms) ? frameTimeP95Ms : 0,
          audioAnalysisFpsCap,
          beatTempoFpsCap,
          pmAudioCadenceMode,
          pmAudioFeedIntervalMs: {
            fg: Number(fg.audioFeedIntervalMs ?? 0),
            bg: Number(bg.audioFeedIntervalMs ?? 0),
          },
          audioDrivePreset: audioDrivePresetSelect?.value ?? null,
          audioControls: audioCfg
            ? {
                enabled: Boolean(audioCfg.enabled),
                mixToMacros: Number(audioCfg.mixToMacros),
                attackMs: Number(audioCfg.attackMs),
                releaseMs: Number(audioCfg.releaseMs),
                maxDeltaPerSec: Number(audioCfg.maxDeltaPerSec),
              }
            : null,
        };
      },

      // Verify-only: deterministically exercise the shedding window without relying on UI
      // preset switching timing (which can be flaky under headless + HMR).
      triggerPresetLoadPressure: (reason?: unknown) => {
        try {
          notePresetLoadPressure(String(reason ?? "verify"));
        } catch {
          // ignore
        }
      },
    };
  };
  registerVerifyHooks();

  const readProfile = (): TechnoProfileId => {
    const raw = String(technoProfileSelect?.value ?? "ambient").trim();
    if (
      raw === "ambient" ||
      raw === "peakRave" ||
      raw === "dub" ||
      raw === "drone" ||
      raw === "videoVj" ||
      raw === "custom"
    ) {
      return raw;
    }
    return "ambient";
  };

  const aivj = {
    enabled: false,
    profile: "ambient" as TechnoProfileId,
    rng: { next: () => Math.random() },
  };

  const aivjController = new UnifiedAivjController(aivj.rng);
  let lastAivjDebug: UnifiedAivjOutput["debug"] | null = null;
  let lastAivjRuntimeBank: MacroBank | null = null;
  let lastAivjBaseBank: MacroBank | null = null;

  // "Hold" freezes preset switching (manual/auto/random) to keep the stage stable.
  let presetHold = false;
  // MIDI lock: when 8-knob bank is bound, AI should not fight user controls.
  let midiLock = false;
  // Manual override: when user touches macro knobs/slots, pause AIVJ + audio
  // so manual changes are visible and stable.
  let aivjManualHoldUntilMs = 0;
  const macroUserHoldMs = 9000;
  let aivjMorphHoldUntilMs = 0;
  const AIVJ_MORPH_HOLD_MS = 1600;
  const noteAivjMorphHold = (origin: string, holdMs = AIVJ_MORPH_HOLD_MS) => {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    aivjMorphHoldUntilMs = Math.max(aivjMorphHoldUntilMs, nowMs + holdMs);
    recordControlPlaneEvent("AIVJ_MORPH_HOLD", origin);
  };

  // --- Multi-source write strategy (human > ai > runtime) ---
  // Goal: avoid "button jumping" and inconsistent state caused by multiple writers
  // updating the same parameters in the same time window.
  type MacroWriteSource = "human" | "ai" | "runtime";
  const macroWritePriority: Record<MacroWriteSource, number> = {
    human: 3,
    ai: 2,
    runtime: 1,
  };
  let macroWriteOwner: MacroWriteSource | null = null;
  let macroWriteOwnerUntilMs = 0;
  let pmMacroHoldUntilMs = 0;

  // Manual visibility hold: when the user adjusts ProjectM blend controls (or macro knobs),
  // temporarily disable runtime-only modifiers that can hide the change (overlayBudget retreat
  // and closed-loop/coupling external opacity drive).
  const pmVisibilityHoldMs = 2200;
  let pmVisibilityHoldUntilMs = 0;
  const noteProjectmVisibilityHold = (holdMs = pmVisibilityHoldMs) => {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    pmVisibilityHoldUntilMs = Math.max(pmVisibilityHoldUntilMs, nowMs + holdMs);
  };

  const noteCouplingSwitchDampen = (nowMs: number, reason: string) => {
    couplingSwitchDampenUntilMs = Math.max(
      couplingSwitchDampenUntilMs,
      nowMs + COUPLING_SWITCH_DAMPEN_MS
    );
    recordControlPlaneEvent("COUPLER_DAMPEN", `switch:${reason}`);
  };

  const requestMacroWriteOwner = (
    source: MacroWriteSource,
    nowMs: number,
    holdMs: number
  ) => {
    const active =
      macroWriteOwner && nowMs < macroWriteOwnerUntilMs
        ? macroWriteOwner
        : null;

    if (!active) {
      macroWriteOwner = source;
      macroWriteOwnerUntilMs = nowMs + holdMs;
      return true;
    }
    if (active === source) {
      macroWriteOwnerUntilMs = Math.max(macroWriteOwnerUntilMs, nowMs + holdMs);
      return true;
    }
    if (macroWritePriority[source] > macroWritePriority[active]) {
      macroWriteOwner = source;
      macroWriteOwnerUntilMs = nowMs + holdMs;
      return true;
    }
    return false;
  };

  const noteHumanMacroOwnership = (nowMs: number, holdMs = macroUserHoldMs) => {
    // Keep manual moves stable for a while (UI should not be overwritten).
    requestMacroWriteOwner("human", nowMs, holdMs);
  };

  const notePmMacroHold = (holdMs = 4000) => {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    pmMacroHoldUntilMs = Math.max(pmMacroHoldUntilMs, nowMs + holdMs);
  };

  // UI observability: track last audio frame + a smoothed, raw-first energy for stable readouts.
  let lastAudioFrameMs = 0;
  let uiEnergy01Smoothed = 0;
  let uiEnergyLastMs = performance.now();

  const setAivjPill = (state: "off" | "ai" | "midi" | "hold") => {
    if (!aivjStatusPill) return;
    aivjStatusPill.dataset.aivjState = state;
    aivjStatusPill.textContent =
      state === "hold"
        ? "HOLD"
        : state === "midi"
        ? "AIVJ: MIDI lock"
        : state === "ai"
        ? "AIVJ: AI"
        : "AIVJ: off";
  };

  const updateAivjPill = () => {
    setAivjPill(
      presetHold ? "hold" : !aivj.enabled ? "off" : midiLock ? "midi" : "ai"
    );
  };

  const updateAivjSummary = () => {
    if (!technoProfileSummary) return;
    if (!aivj.enabled) {
      technoProfileSummary.textContent = "--";
      return;
    }
    technoProfileSummary.textContent = `profile=${aivj.profile} | morph=~4s`;
  };

  // Initialize AIVJ UI from storage (default: on for live usability, but persistent once toggled).
  aivj.enabled = readStoredBool(AIVJ_ENABLED_KEY, true);
  aivj.profile = readProfile();
  let followAiUiEnabled = readStoredBool(AIVJ_FOLLOW_UI_KEY, false);
  try {
    const storedProfile = (localStorage.getItem(AIVJ_PROFILE_KEY) ?? "").trim();
    if (
      storedProfile === "ambient" ||
      storedProfile === "peakRave" ||
      storedProfile === "dub" ||
      storedProfile === "drone" ||
      storedProfile === "videoVj" ||
      storedProfile === "custom"
    ) {
      aivj.profile = storedProfile;
      if (technoProfileSelect) technoProfileSelect.value = storedProfile;
    }
  } catch {
    // ignore
  }
  if (autoTechnoToggle) autoTechnoToggle.checked = aivj.enabled;
  if (followAiToggle) followAiToggle.checked = followAiUiEnabled;
  updateAivjPill();
  updateAivjSummary();

  trackBootstrapDispose(
    listen(autoTechnoToggle, "change", () => {
      aivj.enabled = Boolean(autoTechnoToggle.checked);
      writeStored(AIVJ_ENABLED_KEY, aivj.enabled ? "1" : "0");
      if (!aivj.enabled) {
        aivjController.resetToBase(getMacroBankFromState(), performance.now());
      }
      // Ensure AIVJ macro slots exist in the UI/state once enabled.
      if (aivj.enabled) {
        lastVisualState = ensureAivjMacroBankSlots(lastVisualState);
        macroSlotsController?.render();
        syncMacroUiFromState();
        aivjController.resetToBase(getMacroBankFromState(), performance.now());
        aivjController.requestImmediateTrigger();
      }
      updateAivjPill();
      updateMacroBankPill();
      updateAivjSummary();
    })
  );

  trackBootstrapDispose(
    listen(followAiToggle, "change", () => {
      followAiUiEnabled = Boolean(followAiToggle.checked);
      writeStored(AIVJ_FOLLOW_UI_KEY, followAiUiEnabled ? "1" : "0");
    })
  );

  trackBootstrapDispose(
    listen(technoProfileSelect, "change", () => {
      aivj.profile = readProfile();
      writeStored(AIVJ_PROFILE_KEY, aivj.profile);
      updateAivjSummary();
    })
  );

  type MacroMapMacroId = "fusion" | "motion" | "sparkle" | "fusionMotion";
  type MacroMapKey =
    | "pmOpacity"
    | "pmEnergy"
    | "pmReactive"
    | "liquidTime"
    | "liquidWave"
    | "liquidMetal"
    | "liquidSpeed"
    | "liquidBrightness"
    | "liquidContrast";
  type MacroMapEntry = { macro: MacroMapMacroId; min: number; max: number };
  type MacroMapConfig = Record<MacroMapKey, MacroMapEntry>;

  const MACRO_MAP_KEY = "nw.macros.map.v1";
  const MACRO_MAP_KEYS: MacroMapKey[] = [
    "pmOpacity",
    "pmEnergy",
    "pmReactive",
    "liquidTime",
    "liquidWave",
    "liquidMetal",
    "liquidSpeed",
    "liquidBrightness",
    "liquidContrast",
  ];
  const MACRO_MAP_DEFAULTS: MacroMapConfig = {
    pmOpacity: { macro: "fusion", min: 0.35, max: 1.0 },
    pmEnergy: { macro: "motion", min: 0.3, max: 1.0 },
    pmReactive: { macro: "motion", min: 1.2, max: 2.6 },
    liquidTime: { macro: "motion", min: 0.4, max: 3.0 },
    liquidWave: { macro: "motion", min: 0.2, max: 1.0 },
    liquidMetal: { macro: "sparkle", min: 0.0, max: 0.3 },
    liquidSpeed: { macro: "sparkle", min: 0.5, max: 3.0 },
    liquidBrightness: { macro: "fusionMotion", min: 0.6, max: 1.4 },
    liquidContrast: { macro: "sparkle", min: 0.7, max: 1.6 },
  };
  const MACRO_MAP_LIMITS: Record<MacroMapKey, { min: number; max: number }> = {
    pmOpacity: { min: 0, max: 1 },
    pmEnergy: { min: 0, max: 1 },
    pmReactive: { min: 0.6, max: 3 },
    liquidTime: { min: 0, max: 4 },
    liquidWave: { min: 0, max: 1.5 },
    liquidMetal: { min: 0, max: 0.6 },
    liquidSpeed: { min: 0, max: 4 },
    liquidBrightness: { min: 0.2, max: 2 },
    liquidContrast: { min: 0.2, max: 2 },
  };

  const clampMacroMapEntry = (
    key: MacroMapKey,
    entry: Partial<MacroMapEntry> | null | undefined
  ): MacroMapEntry => {
    const fallback = MACRO_MAP_DEFAULTS[key];
    const macro = (entry?.macro ?? fallback.macro) as MacroMapMacroId;
    const limits = MACRO_MAP_LIMITS[key];
    const minRaw = Number(entry?.min ?? fallback.min);
    const maxRaw = Number(entry?.max ?? fallback.max);
    const minSafe = Number.isFinite(minRaw)
      ? Math.min(limits.max, Math.max(limits.min, minRaw))
      : fallback.min;
    const maxSafe = Number.isFinite(maxRaw)
      ? Math.min(limits.max, Math.max(limits.min, maxRaw))
      : fallback.max;
    const min = Math.min(minSafe, maxSafe);
    const max = Math.max(minSafe, maxSafe);
    const macroSafe =
      macro === "fusion" ||
      macro === "motion" ||
      macro === "sparkle" ||
      macro === "fusionMotion"
        ? macro
        : fallback.macro;
    return { macro: macroSafe, min, max };
  };

  const loadMacroMapConfig = (): MacroMapConfig => {
    try {
      const raw = localStorage.getItem(MACRO_MAP_KEY);
      if (!raw) return { ...MACRO_MAP_DEFAULTS };
      const parsed = JSON.parse(raw);
      const next = {} as MacroMapConfig;
      for (const key of MACRO_MAP_KEYS) {
        next[key] = clampMacroMapEntry(key, parsed?.[key]);
      }
      return next;
    } catch {
      return { ...MACRO_MAP_DEFAULTS };
    }
  };

  const persistMacroMapConfig = (config: MacroMapConfig) => {
    try {
      localStorage.setItem(MACRO_MAP_KEY, JSON.stringify(config));
    } catch {
      // ignore
    }
  };

  const resolveMacroMapValue = (
    macro: MacroMapMacroId,
    fusion: number,
    motion: number,
    sparkle: number
  ) => {
    if (macro === "fusion") return fusion;
    if (macro === "motion") return motion;
    if (macro === "sparkle") return sparkle;
    return Math.min(1, Math.max(0, 0.55 * fusion + 0.45 * motion));
  };

  const mapMacroValue = (
    entry: MacroMapEntry,
    fusion: number,
    motion: number,
    sparkle: number
  ) => {
    const v = resolveMacroMapValue(entry.macro, fusion, motion, sparkle);
    return entry.min + (entry.max - entry.min) * v;
  };

  const clampMacroMapValue = (key: MacroMapKey, value: number) => {
    const limits = MACRO_MAP_LIMITS[key];
    if (!Number.isFinite(value)) return limits.min;
    return Math.min(limits.max, Math.max(limits.min, value));
  };

  let macroMapConfig: MacroMapConfig = loadMacroMapConfig();
  let pmMacroReactiveMultiplier = 1;

  const macroMapUi = {
    pmOpacity: {
      macro: macroMapPmOpacityMacroSelect,
      min: macroMapPmOpacityMinInput,
      max: macroMapPmOpacityMaxInput,
    },
    pmEnergy: {
      macro: macroMapPmEnergyMacroSelect,
      min: macroMapPmEnergyMinInput,
      max: macroMapPmEnergyMaxInput,
    },
    pmReactive: {
      macro: macroMapPmReactMacroSelect,
      min: macroMapPmReactMinInput,
      max: macroMapPmReactMaxInput,
    },
    liquidTime: {
      macro: macroMapLiquidTimeMacroSelect,
      min: macroMapLiquidTimeMinInput,
      max: macroMapLiquidTimeMaxInput,
    },
    liquidWave: {
      macro: macroMapLiquidWaveMacroSelect,
      min: macroMapLiquidWaveMinInput,
      max: macroMapLiquidWaveMaxInput,
    },
    liquidMetal: {
      macro: macroMapLiquidMetalMacroSelect,
      min: macroMapLiquidMetalMinInput,
      max: macroMapLiquidMetalMaxInput,
    },
    liquidSpeed: {
      macro: macroMapLiquidSpeedMacroSelect,
      min: macroMapLiquidSpeedMinInput,
      max: macroMapLiquidSpeedMaxInput,
    },
    liquidBrightness: {
      macro: macroMapLiquidBrightnessMacroSelect,
      min: macroMapLiquidBrightnessMinInput,
      max: macroMapLiquidBrightnessMaxInput,
    },
    liquidContrast: {
      macro: macroMapLiquidContrastMacroSelect,
      min: macroMapLiquidContrastMinInput,
      max: macroMapLiquidContrastMaxInput,
    },
  };

  const readMacroMapFromUi = (): MacroMapConfig => {
    const next = {} as MacroMapConfig;
    for (const key of MACRO_MAP_KEYS) {
      const ui = (macroMapUi as any)[key];
      const macroRaw = String(
        ui?.macro?.value ?? MACRO_MAP_DEFAULTS[key].macro
      );
      const minRaw = Number(ui?.min?.value ?? MACRO_MAP_DEFAULTS[key].min);
      const maxRaw = Number(ui?.max?.value ?? MACRO_MAP_DEFAULTS[key].max);
      next[key] = clampMacroMapEntry(key, {
        macro: macroRaw as MacroMapMacroId,
        min: minRaw,
        max: maxRaw,
      });
    }
    return next;
  };

  const syncMacroMapUiFromConfig = (config: MacroMapConfig) => {
    for (const key of MACRO_MAP_KEYS) {
      const entry = config[key];
      const ui = (macroMapUi as any)[key];
      if (ui?.macro) ui.macro.value = entry.macro;
      if (ui?.min) ui.min.value = entry.min.toFixed(2);
      if (ui?.max) ui.max.value = entry.max.toFixed(2);
    }
  };

  function applyMacroMapConfig(
    config: MacroMapConfig,
    opts?: { persist?: boolean; syncUi?: boolean }
  ) {
    macroMapConfig = config;
    if (opts?.syncUi) syncMacroMapUiFromConfig(config);
    if (opts?.persist) persistMacroMapConfig(config);
    try {
      applyMacroBankFromState();
    } catch {
      // applyMacroBankFromState may not be initialized yet.
    }
  }

  const mergeMacroMapConfig = (patch?: Partial<MacroMapConfig>) => {
    if (!patch) return macroMapConfig;
    const next = { ...macroMapConfig };
    for (const key of MACRO_MAP_KEYS) {
      if (!(key in patch)) continue;
      next[key] = clampMacroMapEntry(key, (patch as any)[key]);
    }
    return next;
  };

  type MacroPresetId =
    | "technoBoost"
    | "ravePunch"
    | "deepPulse"
    | "wideSweep"
    | "technoBrutal"
    | "industrialSurge"
    | "acidOverdrive";
  type MacroPreset = {
    id: MacroPresetId;
    label: string;
    macros: { fusion: number; motion: number; sparkle: number };
    slots: Array<{ id: string; label: string; value: number }>;
    mapPatch?: Partial<MacroMapConfig>;
    audioDrivePreset?: AudioDrivePresetId;
    pmPriority?: number;
  };

  const MACRO_PRESET_KEY = "nw.macros.preset";
  const MACRO_PRESET_AUTO_KEY = "nw.macros.presetAuto";
  const AIVJ_SLOT_IDS = AIVJ_MACRO_BANK.map((s) => s.id);
  const MACRO_PRESETS: MacroPreset[] = [
    {
      id: "technoBoost",
      label: "Techno Boost",
      macros: { fusion: 0.8, motion: 0.9, sparkle: 0.65 },
      slots: [
        { id: AIVJ_SLOT_IDS[0] ?? "aivj-m4", label: "Punch", value: 0.92 },
        { id: AIVJ_SLOT_IDS[1] ?? "aivj-m5", label: "Drive", value: 0.45 },
        { id: AIVJ_SLOT_IDS[2] ?? "aivj-m6", label: "Edge", value: 0.82 },
        { id: AIVJ_SLOT_IDS[3] ?? "aivj-m7", label: "Pulse", value: 0.75 },
        { id: AIVJ_SLOT_IDS[4] ?? "aivj-m8", label: "Air", value: 0.6 },
      ],
      mapPatch: {
        pmOpacity: { macro: "fusion", min: 0.35, max: 1.0 },
        pmEnergy: { macro: "motion", min: 0.35, max: 1.0 },
        pmReactive: { macro: "motion", min: 1.6, max: 2.8 },
        liquidBrightness: { macro: "fusionMotion", min: 0.8, max: 1.6 },
      },
      audioDrivePreset: "intense",
      pmPriority: 0.7,
    },
    {
      id: "ravePunch",
      label: "Rave Punch",
      macros: { fusion: 0.9, motion: 0.8, sparkle: 0.85 },
      slots: [
        { id: AIVJ_SLOT_IDS[0] ?? "aivj-m4", label: "Gate", value: 0.8 },
        { id: AIVJ_SLOT_IDS[1] ?? "aivj-m5", label: "Lift", value: 0.65 },
        { id: AIVJ_SLOT_IDS[2] ?? "aivj-m6", label: "Noise", value: 0.9 },
        { id: AIVJ_SLOT_IDS[3] ?? "aivj-m7", label: "Flash", value: 0.82 },
        { id: AIVJ_SLOT_IDS[4] ?? "aivj-m8", label: "Space", value: 0.7 },
      ],
      mapPatch: {
        pmOpacity: { macro: "fusion", min: 0.4, max: 1.0 },
        pmEnergy: { macro: "motion", min: 0.3, max: 1.0 },
        pmReactive: { macro: "motion", min: 1.4, max: 2.6 },
        liquidContrast: { macro: "sparkle", min: 0.9, max: 1.8 },
      },
      audioDrivePreset: "punch",
      pmPriority: 0.75,
    },
    {
      id: "deepPulse",
      label: "Deep Pulse",
      macros: { fusion: 0.68, motion: 0.86, sparkle: 0.42 },
      slots: [
        { id: AIVJ_SLOT_IDS[0] ?? "aivj-m4", label: "Sub", value: 0.88 },
        { id: AIVJ_SLOT_IDS[1] ?? "aivj-m5", label: "Slow", value: 0.3 },
        { id: AIVJ_SLOT_IDS[2] ?? "aivj-m6", label: "Flow", value: 0.72 },
        { id: AIVJ_SLOT_IDS[3] ?? "aivj-m7", label: "Blur", value: 0.55 },
        { id: AIVJ_SLOT_IDS[4] ?? "aivj-m8", label: "Dim", value: 0.38 },
      ],
      mapPatch: {
        pmOpacity: { macro: "fusion", min: 0.25, max: 0.9 },
        pmEnergy: { macro: "motion", min: 0.25, max: 0.95 },
        pmReactive: { macro: "motion", min: 1.2, max: 2.1 },
        liquidBrightness: { macro: "fusionMotion", min: 0.7, max: 1.3 },
      },
      audioDrivePreset: "balanced",
      pmPriority: 0.65,
    },
    {
      id: "wideSweep",
      label: "Wide Sweep",
      macros: { fusion: 0.62, motion: 0.72, sparkle: 0.92 },
      slots: [
        { id: AIVJ_SLOT_IDS[0] ?? "aivj-m4", label: "Spread", value: 0.7 },
        { id: AIVJ_SLOT_IDS[1] ?? "aivj-m5", label: "Tilt", value: 0.55 },
        { id: AIVJ_SLOT_IDS[2] ?? "aivj-m6", label: "Shine", value: 0.9 },
        { id: AIVJ_SLOT_IDS[3] ?? "aivj-m7", label: "Sweep", value: 0.86 },
        { id: AIVJ_SLOT_IDS[4] ?? "aivj-m8", label: "Glint", value: 0.78 },
      ],
      mapPatch: {
        pmOpacity: { macro: "fusion", min: 0.3, max: 0.95 },
        pmEnergy: { macro: "motion", min: 0.2, max: 0.9 },
        pmReactive: { macro: "sparkle", min: 1.1, max: 2.3 },
        liquidContrast: { macro: "sparkle", min: 1.0, max: 2.0 },
      },
      audioDrivePreset: "punch",
      pmPriority: 0.7,
    },
    {
      id: "technoBrutal",
      label: "Techno Brutal",
      macros: { fusion: 0.95, motion: 0.98, sparkle: 0.7 },
      slots: [
        { id: AIVJ_SLOT_IDS[0] ?? "aivj-m4", label: "Crush", value: 0.98 },
        { id: AIVJ_SLOT_IDS[1] ?? "aivj-m5", label: "Drive", value: 0.82 },
        { id: AIVJ_SLOT_IDS[2] ?? "aivj-m6", label: "Strobe", value: 0.92 },
        { id: AIVJ_SLOT_IDS[3] ?? "aivj-m7", label: "Clash", value: 0.88 },
        { id: AIVJ_SLOT_IDS[4] ?? "aivj-m8", label: "Air", value: 0.55 },
      ],
      mapPatch: {
        pmOpacity: { macro: "fusion", min: 0.5, max: 1.0 },
        pmEnergy: { macro: "motion", min: 0.4, max: 1.0 },
        pmReactive: { macro: "motion", min: 2.1, max: 3.0 },
        liquidBrightness: { macro: "fusionMotion", min: 0.9, max: 1.8 },
        liquidContrast: { macro: "sparkle", min: 1.3, max: 2.0 },
      },
      audioDrivePreset: "intense",
      pmPriority: 0.85,
    },
    {
      id: "industrialSurge",
      label: "Industrial Surge",
      macros: { fusion: 0.9, motion: 0.95, sparkle: 0.8 },
      slots: [
        { id: AIVJ_SLOT_IDS[0] ?? "aivj-m4", label: "Torque", value: 0.9 },
        { id: AIVJ_SLOT_IDS[1] ?? "aivj-m5", label: "Surge", value: 0.78 },
        { id: AIVJ_SLOT_IDS[2] ?? "aivj-m6", label: "Grind", value: 0.88 },
        { id: AIVJ_SLOT_IDS[3] ?? "aivj-m7", label: "Hammer", value: 0.84 },
        { id: AIVJ_SLOT_IDS[4] ?? "aivj-m8", label: "Steel", value: 0.62 },
      ],
      mapPatch: {
        pmOpacity: { macro: "fusion", min: 0.45, max: 1.0 },
        pmEnergy: { macro: "motion", min: 0.35, max: 1.0 },
        pmReactive: { macro: "motion", min: 1.9, max: 2.9 },
        liquidSpeed: { macro: "motion", min: 1.2, max: 3.6 },
        liquidContrast: { macro: "sparkle", min: 1.2, max: 2.0 },
      },
      audioDrivePreset: "intense",
      pmPriority: 0.88,
    },
    {
      id: "acidOverdrive",
      label: "Acid Overdrive",
      macros: { fusion: 0.86, motion: 0.92, sparkle: 0.98 },
      slots: [
        { id: AIVJ_SLOT_IDS[0] ?? "aivj-m4", label: "Acid", value: 0.85 },
        { id: AIVJ_SLOT_IDS[1] ?? "aivj-m5", label: "Razor", value: 0.72 },
        { id: AIVJ_SLOT_IDS[2] ?? "aivj-m6", label: "Glitch", value: 0.9 },
        { id: AIVJ_SLOT_IDS[3] ?? "aivj-m7", label: "Sweep", value: 0.88 },
        { id: AIVJ_SLOT_IDS[4] ?? "aivj-m8", label: "Shine", value: 0.82 },
      ],
      mapPatch: {
        pmOpacity: { macro: "fusion", min: 0.4, max: 1.0 },
        pmEnergy: { macro: "motion", min: 0.35, max: 1.0 },
        pmReactive: { macro: "sparkle", min: 2.0, max: 3.0 },
        liquidBrightness: { macro: "fusionMotion", min: 0.85, max: 1.7 },
        liquidContrast: { macro: "sparkle", min: 1.25, max: 2.0 },
      },
      audioDrivePreset: "intense",
      pmPriority: 0.9,
    },
  ];

  const getMacroPresetLabel = (id: MacroPresetId | null) => {
    if (!id) return null;
    return MACRO_PRESETS.find((p) => p.id === id)?.label ?? id;
  };

  const randomizeMacroMapConfig = (
    rng: ReturnType<typeof createSeededRng>
  ): MacroMapConfig => {
    const options: MacroMapMacroId[] = [
      "fusion",
      "motion",
      "sparkle",
      "fusionMotion",
    ];
    const next = {} as MacroMapConfig;
    for (const key of MACRO_MAP_KEYS) {
      const limits = MACRO_MAP_LIMITS[key];
      const a = limits.min + (limits.max - limits.min) * rng.next();
      const b = limits.min + (limits.max - limits.min) * rng.next();
      const min = Math.min(a, b);
      const max = Math.max(a, b);
      const macro = options[rng.int(0, options.length)];
      next[key] = clampMacroMapEntry(key, { macro, min, max });
    }
    return next;
  };

  syncMacroMapUiFromConfig(macroMapConfig);
  const initialMacroPresetRaw = readStoredString(
    MACRO_PRESET_KEY,
    "technoBoost"
  ) as MacroPresetId;
  const resolveMacroPresetId = (raw: string): MacroPresetId => {
    const next = raw as MacroPresetId;
    return MACRO_PRESETS.some((p) => p.id === next) ? next : "technoBoost";
  };
  let currentMacroPresetId = resolveMacroPresetId(initialMacroPresetRaw);
  let pendingMacroPresetAutoApply: MacroPresetId | null = null;
  const initialMacroPresetAuto = readStoredBool(MACRO_PRESET_AUTO_KEY, false);
  if (macroPresetSelect) macroPresetSelect.value = currentMacroPresetId;
  if (macroPresetAutoToggle)
    macroPresetAutoToggle.checked = initialMacroPresetAuto;
  if (initialMacroPresetAuto) {
    pendingMacroPresetAutoApply = currentMacroPresetId;
  }

  trackBootstrapDispose(
    listen(macroPresetApplyButton, "click", () => {
      const raw = String(macroPresetSelect?.value ?? "technoBoost");
      const presetId = resolveMacroPresetId(raw);
      applyMacroPreset(presetId);
    })
  );
  trackBootstrapDispose(
    listen(macroPresetSelect, "change", () => {
      const raw = String(macroPresetSelect?.value ?? "technoBoost");
      const presetId = resolveMacroPresetId(raw);
      currentMacroPresetId = presetId;
      writeStored(MACRO_PRESET_KEY, presetId);
      if (macroPresetAutoToggle?.checked) {
        applyMacroPreset(presetId);
      }
    })
  );
  trackBootstrapDispose(
    listen(macroPresetAutoToggle, "change", () => {
      const enabled = Boolean(macroPresetAutoToggle?.checked);
      writeStored(MACRO_PRESET_AUTO_KEY, enabled ? "1" : "0");
      if (!enabled) return;
      const raw = String(macroPresetSelect?.value ?? "technoBoost");
      const presetId = resolveMacroPresetId(raw);
      applyMacroPreset(presetId);
    })
  );
  trackBootstrapDispose(
    listen(macroMapToggleButton, "click", () => {
      if (!macroMapPanel) return;
      const nextVisible = macroMapPanel.style.display === "none";
      macroMapPanel.style.display = nextVisible ? "grid" : "none";
    })
  );
  trackBootstrapDispose(
    listen(macroMapApplyButton, "click", () => {
      const next = readMacroMapFromUi();
      applyMacroMapConfig(next, { persist: false, syncUi: true });
      if (dom.audioStatus) {
        dom.audioStatus.textContent = "Macro map applied";
        dom.audioStatus.dataset.state = "ok";
      }
    })
  );
  trackBootstrapDispose(
    listen(macroMapRandomButton, "click", () => {
      const seed = createRandomSeed();
      const rng = createSeededRng(seed);
      const next = randomizeMacroMapConfig(rng);
      applyMacroMapConfig(next, { persist: false, syncUi: true });
      if (dom.audioStatus) {
        dom.audioStatus.textContent = "Macro map randomized";
        dom.audioStatus.dataset.state = "ok";
      }
    })
  );
  trackBootstrapDispose(
    listen(macroMapSaveButton, "click", () => {
      const next = readMacroMapFromUi();
      applyMacroMapConfig(next, { persist: true, syncUi: true });
      if (dom.audioStatus) {
        dom.audioStatus.textContent = "Macro map saved";
        dom.audioStatus.dataset.state = "ok";
      }
    })
  );
  trackBootstrapDispose(
    listen(macroMapLoadButton, "click", () => {
      const next = loadMacroMapConfig();
      applyMacroMapConfig(next, { persist: false, syncUi: true });
      if (dom.audioStatus) {
        dom.audioStatus.textContent = "Macro map loaded";
        dom.audioStatus.dataset.state = "ok";
      }
    })
  );

  const applyMacroBankToRuntime = (
    bank: MacroBank,
    opts?: {
      syncUi?: boolean;
      applyProjectm?: boolean;
      applyLiquid?: boolean;
    }
  ) => {
    const applyProjectm = opts?.applyProjectm !== false;
    const applyLiquid = opts?.applyLiquid !== false;
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const fusion0 = clamp01Local(bank.macros.fusion, 0.5);
    const motion0 = clamp01Local(bank.macros.motion, 0.5);
    const sparkle0 = clamp01Local(bank.macros.sparkle, 0.5);

    const slots = Array.isArray(bank.slots) ? bank.slots : [];
    const slotDevs = slots.map((v) => clamp01Local(v, 0.5) - 0.5);
    const slotAvgDev = slotDevs.length
      ? slotDevs.reduce((a, b) => a + b, 0) / slotDevs.length
      : 0;
    const s0 = slotDevs[0] ?? 0;
    const s1 = slotDevs[1] ?? 0;
    const s2 = slotDevs[2] ?? 0;
    const s3 = slotDevs[3] ?? 0;

    // Slightly "widen" the 8-knob bank using slots while keeping it controllable.
    const fusion = clamp01Local(fusion0 + 0.12 * slotAvgDev + 0.18 * s0, 0.5);
    const motion = clamp01Local(motion0 + 0.1 * slotAvgDev + 0.18 * s1, 0.5);
    const sparkle = clamp01Local(sparkle0 + 0.1 * slotAvgDev + 0.18 * s2, 0.5);

    // ProjectM presence: editable macro map.
    const nextOpacity = clampMacroMapValue(
      "pmOpacity",
      mapMacroValue(macroMapConfig.pmOpacity, fusion, motion, sparkle)
    );
    const nextEnergyToOpacityAmount = clampMacroMapValue(
      "pmEnergy",
      mapMacroValue(macroMapConfig.pmEnergy, fusion, motion, sparkle)
    );
    const nextReactiveMultiplier = clampMacroMapValue(
      "pmReactive",
      mapMacroValue(macroMapConfig.pmReactive, fusion, motion, sparkle)
    );

    const allowProjectmMacro = applyProjectm && nowMs >= pmMacroHoldUntilMs;
    if (allowProjectmMacro) {
      decisionTrace.recordNumeric({
        tMs: nowMs,
        writer: "macroMapper",
        target: "projectm.opacity",
        value: nextOpacity,
        minIntervalMs: 120,
        minDelta: 0.01,
        digits: 3,
        reason: `F=${fusion.toFixed(2)}`,
      });
      decisionTrace.recordNumeric({
        tMs: nowMs,
        writer: "macroMapper",
        target: "projectm.energyToOpacityAmount",
        value: nextEnergyToOpacityAmount,
        minIntervalMs: 120,
        minDelta: 0.01,
        digits: 3,
        reason: `M=${motion.toFixed(2)}`,
      });

      pmMacroReactiveMultiplier = nextReactiveMultiplier;
      decisionTrace.recordNumeric({
        tMs: nowMs,
        writer: "macroMapper",
        target: "projectm.audioReactiveMultiplier",
        value: nextReactiveMultiplier,
        minIntervalMs: 200,
        minDelta: 0.02,
        digits: 3,
        reason: `M=${motion.toFixed(2)}`,
      });

      const blend = projectLayer.getBlendParams();
      projectLayer.setBlendParams({
        ...blend,
        opacity: Math.min(1, Math.max(0, nextOpacity)),
        energyToOpacityAmount: Math.min(
          1,
          Math.max(0, nextEnergyToOpacityAmount)
        ),
      });
      controlPlaneDebug.finalWriter = "pm.opacity=macroMapper";
      // Important: runtime/AI should NOT drive the toolbar inputs directly,
      // otherwise the user sees "button/slider jumping".
      if (opts?.syncUi) {
        if (pmOpacityInput) pmOpacityInput.value = nextOpacity.toFixed(2);
        if (pmEnergyOpacityInput)
          pmEnergyOpacityInput.value = nextEnergyToOpacityAmount.toFixed(2);
        if (pmEnergyOpacityText)
          pmEnergyOpacityText.textContent = `${Math.round(
            nextEnergyToOpacityAmount * 100
          )}%`;
      }
    }

    // LiquidMetal: mapped to schema-ish ranges.
    const liquidPatch = {
      timeScale: clampMacroMapValue(
        "liquidTime",
        mapMacroValue(macroMapConfig.liquidTime, fusion, motion, sparkle)
      ),
      waveAmplitude: clampMacroMapValue(
        "liquidWave",
        mapMacroValue(macroMapConfig.liquidWave, fusion, motion, sparkle)
      ),
      metallicAmount: clampMacroMapValue(
        "liquidMetal",
        mapMacroValue(macroMapConfig.liquidMetal, fusion, motion, sparkle)
      ),
      metallicSpeed: clampMacroMapValue(
        "liquidSpeed",
        mapMacroValue(macroMapConfig.liquidSpeed, fusion, motion, sparkle)
      ),
      brightness: clampMacroMapValue(
        "liquidBrightness",
        mapMacroValue(macroMapConfig.liquidBrightness, fusion, motion, sparkle)
      ),
      contrast: clampMacroMapValue(
        "liquidContrast",
        mapMacroValue(macroMapConfig.liquidContrast, fusion, motion, sparkle)
      ),
      tintHue: clamp01Local(0.5 + s3 * 0.6, 0.0),
      tintStrength: clamp01Local(Math.abs(sparkle - 0.5) * 1.2, 0),
      paletteStrength: clamp01Local(Math.abs(s2) * 1.6, 0),
    } as any;
    if (applyLiquid) {
      applyBackgroundLayerPatch("liquid", liquidPatch, "macro");

      decisionTrace.recordNumeric({
        tMs: nowMs,
        writer: "macroMapper",
        target: "liquid.timeScale",
        value: Number((liquidPatch as any).timeScale),
        minIntervalMs: 200,
        minDelta: 0.03,
        digits: 3,
        reason: `M=${motion.toFixed(2)}`,
      });
      decisionTrace.recordNumeric({
        tMs: nowMs,
        writer: "macroMapper",
        target: "liquid.brightness",
        value: Number((liquidPatch as any).brightness),
        minIntervalMs: 200,
        minDelta: 0.03,
        digits: 3,
        reason: `F=${fusion.toFixed(2)} M=${motion.toFixed(2)}`,
      });
      decisionTrace.recordNumeric({
        tMs: nowMs,
        writer: "macroMapper",
        target: "liquid.contrast",
        value: Number((liquidPatch as any).contrast),
        minIntervalMs: 200,
        minDelta: 0.03,
        digits: 3,
        reason: `S=${sparkle.toFixed(2)}`,
      });
    }

    if (opts?.syncUi) {
      syncMacroUiFromBank(bank);
    }
  };

  const commitAivjSlowBankToState = (bank: MacroBank) => {
    // Scheme B: AIVJ slow bank writes back to state (so Favorites/Show can reproduce).
    const ids = ["aivj-m4", "aivj-m5", "aivj-m6", "aivj-m7", "aivj-m8"];
    const nextSlots = Array.isArray(lastVisualState.global.macroSlots)
      ? [...lastVisualState.global.macroSlots]
      : [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i] as string;
      const v01 = clamp01Local(bank.slots?.[i] ?? 0.5, 0.5);
      const idx = nextSlots.findIndex((s) => s.id === id);
      if (idx >= 0) {
        nextSlots[idx] = { ...nextSlots[idx], value: v01 } as any;
      } else {
        nextSlots.push({
          id,
          label: id,
          value: v01,
          randomize: true,
          pinned: false,
        } as any);
      }
    }

    lastVisualState = {
      ...lastVisualState,
      global: {
        ...lastVisualState.global,
        macros: {
          ...lastVisualState.global.macros,
          fusion: clamp01Local(bank.macros.fusion, 0.5),
          motion: clamp01Local(bank.macros.motion, 0.5),
          sparkle: clamp01Local(bank.macros.sparkle, 0.5),
        },
        macroSlots: nextSlots,
      },
    };

    // Reflect slow bank in UI (but do not include runtime-only audio/accent).
    macroSlotsController?.render();
    syncMacroUiFromState();
  };

  const getMacroBankFromState = (overrideMacros?: {
    fusion: number;
    motion: number;
    sparkle: number;
  }): MacroBank => {
    const ids = ["aivj-m4", "aivj-m5", "aivj-m6", "aivj-m7", "aivj-m8"];
    const slots = ids.map((id) => {
      const s = (lastVisualState.global.macroSlots ?? []).find(
        (x) => x.id === id
      );
      return clamp01Local(s?.value ?? 0.5, 0.5);
    });
    const m = overrideMacros ?? lastVisualState.global.macros;
    return {
      macros: {
        fusion: clamp01Local(m.fusion, 0.5),
        motion: clamp01Local(m.motion, 0.5),
        sparkle: clamp01Local(m.sparkle, 0.5),
      },
      slots,
    };
  };

  const applyMacroBankFromState = (overrideMacros?: {
    fusion: number;
    motion: number;
    sparkle: number;
  }) => {
    applyMacroBankToRuntime(getMacroBankFromState(overrideMacros), {
      syncUi: true,
    });
  };

  const noteUserMacroInteraction = () => {
    const nowMs = performance.now();
    noteHumanMacroOwnership(nowMs, macroUserHoldMs);
    pmMacroHoldUntilMs = 0;
    // Let user-driven macro changes be visible immediately.
    noteProjectmVisibilityHold();
    updateMacroBankPill();
    if (!aivj.enabled) return;
    if (midiLock) return;
    // Pause AI briefly so manual moves are visible and stable.
    aivjManualHoldUntilMs = Math.max(
      aivjManualHoldUntilMs,
      nowMs + macroUserHoldMs
    );
    // Cancel any in-flight AI transition so it doesn't immediately overwrite.
    // Align AI baseline with the user's current bank so resuming AI is smooth.
    aivjController.resetToBase(getMacroBankFromState(), nowMs);
  };

  function clamp01Local(value: unknown, fallback: number) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  }

  const applySceneMacroBias = (bank: MacroBank): MacroBank => {
    const macros = bank?.macros ?? { fusion: 0.5, motion: 0.5, sparkle: 0.5 };
    const bias = sceneMacroBias;
    return {
      macros: {
        fusion: clamp01Local(macros.fusion + bias.fusion, 0.5),
        motion: clamp01Local(macros.motion + bias.motion, 0.5),
        sparkle: clamp01Local(macros.sparkle + bias.sparkle, 0.5),
      },
      slots: Array.isArray(bank?.slots) ? [...bank.slots] : [],
    };
  };

  function setKnobVars(knob: HTMLElement | null, value01: number) {
    if (!knob) return;
    const v = clamp01Local(value01, 0.5);
    const angle = -135 + v * 270;
    try {
      knob.style.setProperty("--nw-knob-value", String(v));
      knob.style.setProperty("--nw-knob-angle", `${angle}deg`);
    } catch {
      // ignore
    }
  }

  function setMacroValueText(
    which: "fusion" | "motion" | "sparkle",
    v01: number
  ) {
    const pct = `${Math.round(clamp01Local(v01, 0.5) * 100)}%`;
    if (which === "fusion") dom.macroFusionValueText.textContent = pct;
    if (which === "motion") dom.macroMotionValueText.textContent = pct;
    if (which === "sparkle") dom.macroSparkleValueText.textContent = pct;
    pulseMacroStrip(which, v01);
  }

  type MacroPulseState = {
    value: number;
    lastPulseMs: number;
    armed: boolean;
    timer: number | null;
  };
  const macroPulseState: Record<
    "fusion" | "motion" | "sparkle",
    MacroPulseState
  > = {
    fusion: { value: 0.5, lastPulseMs: 0, armed: false, timer: null },
    motion: { value: 0.5, lastPulseMs: 0, armed: false, timer: null },
    sparkle: { value: 0.5, lastPulseMs: 0, armed: false, timer: null },
  };

  const pulseMacroStrip = (
    which: "fusion" | "motion" | "sparkle",
    value01: number
  ) => {
    const state = macroPulseState[which];
    const next = clamp01Local(value01, state.value);
    if (!state.armed) {
      state.value = next;
      state.armed = true;
      return;
    }
    const delta = Math.abs(next - state.value);
    state.value = next;
    if (delta < 0.02) return;

    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (nowMs - state.lastPulseMs < 160) return;
    state.lastPulseMs = nowMs;

    const input =
      which === "fusion"
        ? dom.macroFusionInput
        : which === "motion"
        ? dom.macroMotionInput
        : dom.macroSparkleInput;
    const strip = input?.closest(".nw-macro-strip") as HTMLElement | null;
    if (!strip) return;

    strip.classList.remove("nw-macro-strip--pulse");
    void strip.offsetWidth;
    strip.classList.add("nw-macro-strip--pulse");
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      strip.classList.remove("nw-macro-strip--pulse");
    }, 240);
  };

  function syncMacroUiFromState() {
    const macros = lastVisualState.global.macros;
    const fusion = clamp01Local(macros.fusion, 0.5);
    const motion = clamp01Local(macros.motion, 0.5);
    const sparkle = clamp01Local(macros.sparkle, 0.5);

    if (dom.macroFusionInput) dom.macroFusionInput.value = String(fusion);
    if (dom.macroMotionInput) dom.macroMotionInput.value = String(motion);
    if (dom.macroSparkleInput) dom.macroSparkleInput.value = String(sparkle);

    setMacroValueText("fusion", fusion);
    setMacroValueText("motion", motion);
    setMacroValueText("sparkle", sparkle);

    setKnobVars(
      dom.macroFusionInput?.closest(".nw-knob") as HTMLElement | null,
      fusion
    );
    setKnobVars(
      dom.macroMotionInput?.closest(".nw-knob") as HTMLElement | null,
      motion
    );
    setKnobVars(
      dom.macroSparkleInput?.closest(".nw-knob") as HTMLElement | null,
      sparkle
    );
  }

  function syncMacroUiFromBank(bank: MacroBank) {
    const fusion = clamp01Local(bank.macros.fusion, 0.5);
    const motion = clamp01Local(bank.macros.motion, 0.5);
    const sparkle = clamp01Local(bank.macros.sparkle, 0.5);

    if (dom.macroFusionInput) dom.macroFusionInput.value = String(fusion);
    if (dom.macroMotionInput) dom.macroMotionInput.value = String(motion);
    if (dom.macroSparkleInput) dom.macroSparkleInput.value = String(sparkle);

    setMacroValueText("fusion", fusion);
    setMacroValueText("motion", motion);
    setMacroValueText("sparkle", sparkle);

    setKnobVars(
      dom.macroFusionInput?.closest(".nw-knob") as HTMLElement | null,
      fusion
    );
    setKnobVars(
      dom.macroMotionInput?.closest(".nw-knob") as HTMLElement | null,
      motion
    );
    setKnobVars(
      dom.macroSparkleInput?.closest(".nw-knob") as HTMLElement | null,
      sparkle
    );

    // Update AIVJ slot values (M4..M8) if present.
    const slotIds = ["aivj-m4", "aivj-m5", "aivj-m6", "aivj-m7", "aivj-m8"];
    for (let i = 0; i < slotIds.length; i++) {
      const slotId = slotIds[i] as string;
      const v01 = clamp01Local(bank.slots?.[i] ?? 0.5, 0.5);
      const input = dom.macroSlotsContainer?.querySelector<HTMLInputElement>(
        `[data-slot-id="${slotId}"] input[data-role="slot-value"]`
      );
      if (!input) continue;
      input.value = String(v01);
      const knob = input.closest(
        "[data-role='slot-knob']"
      ) as HTMLElement | null;
      setKnobVars(knob, v01);
      const wrapper = input.closest("[data-slot-id]") as HTMLElement | null;
      const valueText = wrapper?.querySelector<HTMLElement>(
        "[data-role='slot-value-text']"
      );
      if (valueText) valueText.textContent = `${Math.round(v01 * 100)}%`;
    }
  }

  const updateMacroBankPill = () => {
    if (!dom.macroBankStatusPill) return;
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const owner =
      macroWriteOwner && nowMs < macroWriteOwnerUntilMs
        ? macroWriteOwner
        : null;
    const ttlMs = Math.max(0, macroWriteOwnerUntilMs - nowMs);
    const ttlS = ttlMs > 0 ? `${Math.ceil(ttlMs / 100) / 10}s` : "";

    const mode = midiLock ? "midi" : aivj.enabled ? "ai" : "ui";
    const ownerKey = owner ?? "";
    const prevMode = dom.macroBankStatusPill.dataset.macroBank;
    const prevOwner = dom.macroBankStatusPill.dataset.macroOwner;

    const text = owner
      ? owner === "human"
        ? `宏库：已由用户接管${ttlS ? ` (${ttlS})` : ""}`
        : owner === "ai"
        ? `宏库：已由AI接管${ttlS ? ` (${ttlS})` : ""}`
        : `宏库：已由系统接管${ttlS ? ` (${ttlS})` : ""}`
      : midiLock
      ? "宏库：MIDI"
      : aivj.enabled
      ? "宏库：AI"
      : "宏库：UI";

    if (
      prevMode === mode &&
      prevOwner === ownerKey &&
      dom.macroBankStatusPill.textContent === text
    ) {
      return;
    }
    dom.macroBankStatusPill.dataset.macroBank = mode;
    dom.macroBankStatusPill.dataset.macroOwner = ownerKey;
    dom.macroBankStatusPill.textContent = text;
  };

  function setMacroValue(
    key: "fusion" | "motion" | "sparkle",
    value01: number
  ) {
    const v = clamp01Local(value01, 0.5);
    lastVisualState = {
      ...lastVisualState,
      global: {
        ...lastVisualState.global,
        macros: { ...lastVisualState.global.macros, [key]: v },
      },
    };
    setMacroValueText(key, v);
    // Keep knob rotation in sync (wheel updates won't touch CSS vars otherwise).
    const input =
      key === "fusion"
        ? dom.macroFusionInput
        : key === "motion"
        ? dom.macroMotionInput
        : dom.macroSparkleInput;
    setKnobVars(input?.closest(".nw-knob") as HTMLElement | null, v);

    noteUserMacroInteraction();

    applyMacroBankFromState();
  }

  const MACRO_SAVE_KEY = "nw.macros.saved.v1";
  type MacroSaveMap = Partial<Record<"fusion" | "motion" | "sparkle", number>>;
  const loadMacroSaves = (): MacroSaveMap => {
    try {
      const raw = localStorage.getItem(MACRO_SAVE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      const out: MacroSaveMap = {};
      (["fusion", "motion", "sparkle"] as const).forEach((key) => {
        const v = Number((parsed as any)[key]);
        if (Number.isFinite(v)) out[key] = Math.min(1, Math.max(0, v));
      });
      return out;
    } catch {
      return {};
    }
  };
  let macroSaves: MacroSaveMap = loadMacroSaves();
  const persistMacroSaves = () => {
    try {
      localStorage.setItem(MACRO_SAVE_KEY, JSON.stringify(macroSaves));
    } catch {
      // ignore
    }
  };
  const saveMacroValue = (key: "fusion" | "motion" | "sparkle") => {
    const v = clamp01Local(lastVisualState.global.macros[key], 0.5);
    macroSaves = { ...macroSaves, [key]: v };
    persistMacroSaves();
    if (dom.audioStatus) {
      dom.audioStatus.textContent = `Macro ${key} saved (${Math.round(
        v * 100
      )}%)`;
      dom.audioStatus.dataset.state = "ok";
    }
  };
  const loadMacroValue = (key: "fusion" | "motion" | "sparkle") => {
    const v = Number(macroSaves[key]);
    if (!Number.isFinite(v)) {
      if (dom.audioStatus) {
        dom.audioStatus.textContent = `Macro ${key} not saved yet`;
        dom.audioStatus.dataset.state = "error";
      }
      return;
    }
    setMacroValue(key, v);
    if (dom.audioStatus) {
      dom.audioStatus.textContent = `Macro ${key} loaded (${Math.round(
        v * 100
      )}%)`;
      dom.audioStatus.dataset.state = "ok";
    }
  };

  // Wire the 3 main macro knobs (input + wheel via the global toolbar handler).
  trackBootstrapDispose(
    listen(dom.macroFusionInput, "input", () => {
      setMacroValue("fusion", Number(dom.macroFusionInput?.value ?? 0.5));
    })
  );
  trackBootstrapDispose(
    listen(dom.macroMotionInput, "input", () => {
      setMacroValue("motion", Number(dom.macroMotionInput?.value ?? 0.5));
    })
  );
  trackBootstrapDispose(
    listen(dom.macroSparkleInput, "input", () => {
      setMacroValue("sparkle", Number(dom.macroSparkleInput?.value ?? 0.5));
    })
  );

  trackBootstrapDispose(
    listen(dom.macroFusionSaveButton, "click", () => saveMacroValue("fusion"))
  );
  trackBootstrapDispose(
    listen(dom.macroFusionLoadButton, "click", () => loadMacroValue("fusion"))
  );
  trackBootstrapDispose(
    listen(dom.macroMotionSaveButton, "click", () => saveMacroValue("motion"))
  );
  trackBootstrapDispose(
    listen(dom.macroMotionLoadButton, "click", () => loadMacroValue("motion"))
  );
  trackBootstrapDispose(
    listen(dom.macroSparkleSaveButton, "click", () => saveMacroValue("sparkle"))
  );
  trackBootstrapDispose(
    listen(dom.macroSparkleLoadButton, "click", () => loadMacroValue("sparkle"))
  );
  trackBootstrapDispose(
    listen(dom.macroRandomButton, "click", () => {
      const energy = currentEnergyLevel || 0.5;
      const seed = createRandomSeed();
      const rng = createSeededRng(seed);
      applyRandomMacroBank(energy, rng, seed);
      lastVisualState = buildCurrentVisualState();
      inspector?.refreshStatus();
      if (dom.audioStatus) {
        dom.audioStatus.textContent = "Randomized macros only";
        dom.audioStatus.dataset.state = "ok";
      }
    })
  );

  // Macro slots controller ("+ 槽位" + per-slot knobs).
  let macroSlotsController: ReturnType<typeof initMacroSlotsController> | null =
    null;
  let midiController: ReturnType<typeof initMidiController> | null = null;
  const addMacroSlot = () => {
    const id = `slot-${Date.now().toString(36)}-${Math.random()
      .toString(16)
      .slice(2, 6)}`;
    const nextSlot = {
      id,
      label: "Macro",
      value: 0.5,
      randomize: true,
      pinned: false,
    };
    lastVisualState = {
      ...lastVisualState,
      global: {
        ...lastVisualState.global,
        macroSlots: [...(lastVisualState.global.macroSlots ?? []), nextSlot],
      },
    };
  };

  const updateMacroSlot = (slotId: string, patch: any) => {
    const slots = Array.isArray(lastVisualState.global.macroSlots)
      ? lastVisualState.global.macroSlots
      : [];
    lastVisualState = {
      ...lastVisualState,
      global: {
        ...lastVisualState.global,
        macroSlots: slots.map((s) =>
          s.id === slotId ? ({ ...s, ...patch } as any) : s
        ),
      },
    };
  };

  const applyMacroPreset = (presetId: MacroPresetId) => {
    const preset = MACRO_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    currentMacroPresetId = presetId;
    if (macroPresetSelect) macroPresetSelect.value = presetId;

    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    noteHumanMacroOwnership(nowMs, macroUserHoldMs);

    const existing = Array.isArray(lastVisualState.global.macroSlots)
      ? [...lastVisualState.global.macroSlots]
      : [];
    const byId = new Map(existing.map((s) => [String(s.id), s]));
    for (const slot of preset.slots) {
      const current = byId.get(slot.id);
      if (current) {
        byId.set(slot.id, {
          ...current,
          label: slot.label,
          value: clamp01Local(slot.value, 0.5),
          randomize:
            typeof current.randomize === "boolean" ? current.randomize : true,
          pinned: current.pinned ?? false,
        });
      } else {
        byId.set(slot.id, {
          id: slot.id,
          label: slot.label,
          value: clamp01Local(slot.value, 0.5),
          randomize: true,
          pinned: false,
        } as any);
      }
    }
    const nextSlots = Array.from(byId.values());

    lastVisualState = {
      ...lastVisualState,
      global: {
        ...lastVisualState.global,
        macros: {
          ...lastVisualState.global.macros,
          fusion: clamp01Local(preset.macros.fusion, 0.5),
          motion: clamp01Local(preset.macros.motion, 0.5),
          sparkle: clamp01Local(preset.macros.sparkle, 0.5),
        },
        macroSlots: nextSlots,
      },
    };

    if (preset.mapPatch) {
      const nextMap = mergeMacroMapConfig(preset.mapPatch);
      applyMacroMapConfig(nextMap, { persist: true, syncUi: true });
    }
    if (preset.audioDrivePreset) {
      applyAudioDrivePreset(preset.audioDrivePreset, { save: true });
    }
    if (preset.pmPriority != null) {
      applyPmPriority(preset.pmPriority);
    }
    if (pmAudioOpacityToggle) {
      pmAudioOpacityToggle.checked = true;
      applyBlendControlsToLayer();
    }

    macroSlotsController?.render();
    syncMacroUiFromState();
    applyMacroBankFromState();
    updateMacroBankPill();
    if (dom.audioStatus) {
      dom.audioStatus.textContent = `Macro preset: ${preset.label}`;
      dom.audioStatus.dataset.state = "ok";
    }
    noteUserMacroInteraction();
    writeStored(MACRO_PRESET_KEY, presetId);
  };

  macroSlotsController = initMacroSlotsController({
    addSlotButton: dom.macroAddSlotButton,
    container: dom.macroSlotsContainer,
    getSlots: () => lastVisualState.global.macroSlots ?? [],
    addSlot: addMacroSlot,
    updateSlot: updateMacroSlot,
    onValueChanged: () => {
      noteUserMacroInteraction();
      applyMacroBankFromState();
    },
    onTargetsChanged: () => {
      try {
        midiController?.refreshTargets();
      } catch {
        // ignore
      }
    },
  });

  // Always ensure the 8-knob bank slots exist (M4..M8) so UI/MIDI auto-map is stable.
  lastVisualState = ensureAivjMacroBankSlots(lastVisualState);

  macroSlotsController.render();
  syncMacroUiFromState();
  updateMacroBankPill();
  if (pendingMacroPresetAutoApply) {
    applyMacroPreset(pendingMacroPresetAutoApply);
    pendingMacroPresetAutoApply = null;
  }

  const DEPTH_WS_URL_KEY = "nw.depth.wsUrl";
  const DEPTH_IDEPTH_URL_KEY = "nw.depth.idepthUrl";

  function getDepthWsUrlForSource(source: string): string {
    const key = source === "idepth" ? DEPTH_IDEPTH_URL_KEY : DEPTH_WS_URL_KEY;
    try {
      return (localStorage.getItem(key) ?? "").trim();
    } catch {
      return "";
    }
  }

  function ensureDepthWsClient(source: string) {
    const url = getDepthWsUrlForSource(source);
    if (!url) {
      depthWsClient?.dispose();
      depthWsClient = null;
      depthWsStatus = {
        state: "idle",
        url: "",
        framesReceived: 0,
        lastError:
          source === "idepth"
            ? `Set localStorage['${DEPTH_IDEPTH_URL_KEY}'] to your iDepth ws:// URL`
            : `Set localStorage['${DEPTH_WS_URL_KEY}'] to your depth ws:// URL`,
      };
      return;
    }

    // Recreate if URL changed.
    if (depthWsClient && depthWsStatus?.url === url) return;
    depthWsClient?.dispose();
    depthWsClient = new DepthWsClient({
      url,
      onFrame: (bmp) => depthLayer.setFrame(bmp),
      onStatus: (s) => {
        depthWsStatus = s;
      },
      reconnect: { enabled: true, minDelayMs: 250, maxDelayMs: 5000 },
    });
    depthWsStatus = depthWsClient.getStatus();
    depthWsClient.connect();
  }

  function stopDepthWsClient() {
    depthWsClient?.dispose();
    depthWsClient = null;
    depthWsStatus = null;
  }

  async function populateVideoInputDevices(select: HTMLSelectElement | null) {
    if (!select) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      select.innerHTML = cams
        .map((d, i) => {
          const label = (d.label || `Camera ${i + 1}`).trim();
          return `<option value="${d.deviceId}">${label}</option>`;
        })
        .join("");
    } catch {
      select.innerHTML = "";
    }
  }

  function updateDepthStatusLabel() {
    if (!depthStatusText) return;
    const st = depthLayer.getStatus();
    const ws = depthWsStatus;
    const wsInfo =
      st.source === "webcam"
        ? ""
        : ws
        ? ` | ws:${ws.state} frames:${ws.framesReceived}${
            ws.lastError ? ` err:${ws.lastError}` : ""
          }`
        : " | ws:idle";
    const err = st.lastErrorName
      ? ` err:${st.lastErrorName}${
          st.lastErrorMessage ? `(${st.lastErrorMessage})` : ""
        }`
      : "";
    depthStatusText.textContent = `${st.source} ${st.state}${wsInfo}${err}`;
  }

  function setDepthParamsFromUi() {
    applyBackgroundLayerPatch(
      "depth",
      {
        source: depthSourceSelect?.value ?? "webcam",
        deviceId: depthDeviceSelect?.value ?? "",
        showDepth: Boolean(depthShowDepthToggle?.checked),
        opacity: readRangeInputValue01(depthOpacityInput, 0.7),
        fog: readNumberInputValue(depthFogInput, 1.1),
        edge: readNumberInputValue(depthEdgeInput, 1.3),
        layers: readNumberInputValue(depthLayersInput, 12),
        blur: readNumberInputValue(depthBlurInput, 10),
      },
      "user"
    );
    updateDepthStatusLabel();
  }

  function setCameraParamsFromUi() {
    if (!cameraLayer) return;
    applyBackgroundLayerPatch(
      "camera",
      {
        deviceId: cameraDeviceSelect?.value ?? "",
        opacity: readRangeInputValue01(cameraOpacityInput, 0.85),
        segmentPerson: Boolean(cameraSegmentToggle?.checked),
        // Keep defaults for quality/fps/blur unless Inspector is added later.
      },
      "user"
    );
  }

  function syncCameraEdgeToPmFromUi() {
    const raw = Number(cameraEdgeToPmInput?.value ?? 0);
    const pct = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
    cameraEdgeToPmAmount01 = pct / 100;
    if (cameraEdgeToPmText)
      cameraEdgeToPmText.textContent = `${Math.round(pct)}%`;
  }

  function setVideoParamsFromUi() {
    applyBackgroundLayerPatch(
      "video",
      {
        opacity: readRangeInputValue01(videoOpacityInput, 0.7),
        src: (videoSrcInput?.value ?? "").trim(),
      },
      "user"
    );
  }

  function setBasicParamsFromUi() {
    applyBackgroundLayerPatch(
      "basic",
      {
        opacity: readRangeInputValue01(basicOpacityInput, 0.7),
      },
      "user"
    );
  }

  function refreshBackgroundUiEnabledState() {
    // Show/hide layer-specific rows.
    setRowVisible(dom.cameraControlsRow, Boolean(layerCameraToggle?.checked));
    setRowVisible(dom.videoControlsRow, Boolean(layerVideoToggle?.checked));
    const depthOn = Boolean(layerDepthToggle?.checked);
    setRowVisible(dom.depthControlsRow, depthOn);
    setRowVisible(dom.depthParamsRow, depthOn);

    // Keep opacity sliders interactive even when the layer is disabled.
    // Users often want to pre-set opacity before enabling a layer.
    if (basicOpacityInput) basicOpacityInput.disabled = false;
    if (cameraOpacityInput) cameraOpacityInput.disabled = false;
    if (videoOpacityInput) videoOpacityInput.disabled = false;
    if (depthOpacityInput) depthOpacityInput.disabled = false;

    if (depthDeviceSelect) {
      const src = (depthSourceSelect?.value ?? "webcam").trim();
      depthDeviceSelect.disabled = !depthOn || src !== "webcam";
    }
  }

  // Bump the storage key to intentionally clear stale favorites after state/schema changes.
  const FAVORITES_STORAGE_KEY = "newliveweb:favorites:v2";
  const FAVORITES_STORAGE_KEY_V1 = "newliveweb:favorites:v1";

  const favoritesController = initFavoritesController({
    container: document.body,
    favoriteCountLabel: visualFavoriteCount,
    storage: localStorage,
    keys: { v1: FAVORITES_STORAGE_KEY_V1, v2: FAVORITES_STORAGE_KEY },
    liquidDefaults: liquidLayer.params,
    onLoad: (fav) => applyFavoriteVisualState(fav),
    countLabelFormatter: (count) => `收藏:${count}`,
    countLabelTitle: "点击打开收藏夹",
  });

  const presetControls = [
    presetSelect,
    presetFileInput,
    presetUrlInput,
    presetUrlButton,
    presetNextButton,
    presetAutoToggle,
    presetAutoIntervalInput,
  ];

  let currentPresetId: string | null = null;
  let currentPresetUrl: string | null = null;
  let projectLayerReady = false;
  let currentPresetIdBg: string | null = null;
  let currentPresetUrlBg: string | null = null;
  let projectLayerBgReady = false;
  let autoCycleTimer: number | null = null;
  let autoCycleBgTimer: number | null = null;
  let autoCycleBackoffUntilMs = 0;
  let autoCycleBackoffFactor = 1;
  let autoCycleBgBackoffUntilMs = 0;
  let autoCycleBgBackoffFactor = 1;
  const AUTO_CYCLE_BACKOFF_MAX = 8;
  let presetLoadInFlight = false;
  let pendingCycleOrigin: "manual" | "auto" | null = null;
  let pendingPresetSelectId: string | null = null;
  let randomVisualInFlight = false;
  let pendingRandomVisual = false;
  let randomParamsInFlight = false;
  let pendingRandomParams = false;
  let presetHardFailCount = 0;
  let presetSoftFailCount = 0;
  let presetAestheticFailCount = 0;
  let presetFailStreak = 0;
  let anchorFallbackCount = 0;
  let lastAnchorFallbackReason: string | null = null;
  const presetFailById = new Map<
    string,
    { hard: number; soft: number; aesthetic: number }
  >();
  const presetLoadStatsById = new Map<
    string,
    { count: number; totalMs: number }
  >();
  let presetLoadTotalCount = 0;
  let presetLoadTotalMs = 0;

  type PresetSwitchScope = "fg" | "bg";
  type PresetSwitchOutcome = "success" | "error" | "skipped";
  type PresetSwitchCache = "hit" | "miss" | "na";

  type PresetSwitchReport = {
    scope: PresetSwitchScope;
    origin: string;
    presetId: string | null;
    presetUrl: string | null;
    presetLabel?: string | null;

    tStartMs: number;
    tEndMs: number;
    durationMs: number;
    loadMs?: number;
    cache: PresetSwitchCache;

    rebuildBefore?: { inProgress: boolean; lastRebuildMs: number };
    rebuildAfter?: { inProgress: boolean; lastRebuildMs: number };

    framesBefore?: number;
    framesAfter?: number;
    firstFrameDeltaMs?: number;

    engine?: {
      token?: number;
      cache?: PresetSwitchCache;
      fetchMs?: number;
      yieldMs?: number;
      applyMs?: number;
      totalMs?: number;
      tApplyEndMs?: number;
      firstFrameMs?: number;
      applyToFirstFrameMs?: number;
    };

    outcome: PresetSwitchOutcome;
    errorText?: string;
  };

  const PRESET_SWITCH_REPORT_LIMIT = 80;
  const presetSwitchReports: PresetSwitchReport[] = [];

  const tryEnrichPresetSwitchReport = (report: PresetSwitchReport) => {
    try {
      const v = (globalThis as any).__projectm_verify;
      const last = v?.presetLoadLast;
      if (!last || typeof last !== "object") return;

      const lastUrl = String((last as any).url ?? "");
      const reportUrl = String(report.presetUrl ?? "");
      if (!lastUrl || !reportUrl) return;
      if (lastUrl !== reportUrl) return;

      const tEndMs = Number((last as any).tEndMs);
      const reportEnd = Number(report.tEndMs);
      if (Number.isFinite(tEndMs) && Number.isFinite(reportEnd)) {
        // Only attach if the engine load finished very near this report.
        if (Math.abs(tEndMs - reportEnd) > 1500) return;
      }

      const cacheRaw = String((last as any).cache ?? "na");
      const cache: PresetSwitchCache =
        cacheRaw === "hit" ? "hit" : cacheRaw === "miss" ? "miss" : "na";

      report.engine = {
        token: Number((last as any).token) || undefined,
        cache,
        fetchMs: Number((last as any).fetchMs) || undefined,
        yieldMs: Number((last as any).yieldMs) || undefined,
        applyMs: Number((last as any).applyMs) || undefined,
        totalMs: Number((last as any).totalMs) || undefined,
        tApplyEndMs: Number((last as any).tApplyEndMs) || undefined,
        firstFrameMs: Number((last as any).firstFrameMs) || undefined,
        applyToFirstFrameMs:
          Number((last as any).applyToFirstFrameMs) || undefined,
      };

      // Prefer engine cache classification when available.
      if (cache !== "na") report.cache = cache;
      // Prefer engine totalMs for loadMs if it's tighter than wrapper duration.
      const engineTotal = Number((last as any).totalMs);
      if (Number.isFinite(engineTotal) && engineTotal > 0) {
        report.loadMs = engineTotal;
      }
    } catch {
      // ignore
    }
  };

  const pushPresetSwitchReport = (report: PresetSwitchReport) => {
    tryEnrichPresetSwitchReport(report);
    presetSwitchReports.push(report);
    if (presetSwitchReports.length > PRESET_SWITCH_REPORT_LIMIT) {
      const excess = presetSwitchReports.length - PRESET_SWITCH_REPORT_LIMIT;
      presetSwitchReports.splice(0, excess);
    }
  };

  const tryReadFramesRendered = () => {
    try {
      const v = (globalThis as any).__projectm_verify;
      const n = Number(v?.framesRendered);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  };

  const updatePresetSwitchFirstFrame = async (
    report: PresetSwitchReport,
    opts: { timeoutMs?: number } = {}
  ) => {
    const timeoutMs = Math.max(250, Math.min(4000, opts.timeoutMs ?? 1800));
    const tStart =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const framesBefore =
      typeof report.framesBefore === "number" ? report.framesBefore : null;
    if (framesBefore == null) return;

    while (true) {
      await yieldToBrowser();
      const framesAfter = tryReadFramesRendered();
      if (framesAfter != null && framesAfter > framesBefore) {
        const tNow =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        report.framesAfter = framesAfter;
        report.firstFrameDeltaMs = Math.max(0, tNow - report.tStartMs);
        return;
      }
      const elapsed =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        tStart;
      if (elapsed > timeoutMs) {
        report.framesAfter = framesAfter ?? undefined;
        return;
      }
    }
  };
  let lastSoakReportMs = 0;
  const SOAK_REPORT_INTERVAL_MS = 10 * 60 * 1000;

  // Preset 预测引擎 - 智能 prefetch
  const presetPredictor = createPresetPredictor();
  let presetPredictionEnabled = true; // 可通过 UI 或 config 关闭

  // 统一性能预算管理器
  const performanceBudgetManager = createPerformanceBudgetManager("high");
  
  // 注册回调 - 统一管理所有子系统预算
  performanceBudgetManager.onAudioAnalysisFpsChange((fps) => {
    audioAnalysisFpsCap = Math.round(fps);
    audioBus.setAnalysisFpsCap(audioAnalysisFpsCap);
    recordControlPlaneEvent("AUDIO_FPS", `${audioAnalysisFpsCap}:budget`);
  });
  
  performanceBudgetManager.onBeatTempoIntervalChange((intervalMs) => {
    // Beat tempo 使用 FPS，需要转换：fps = 1000 / intervalMs
    const fps = 1000 / intervalMs;
    beatTempoFpsCap = Math.max(BEAT_TEMPO_FPS_LOW, Math.min(BEAT_TEMPO_FPS_HIGH, fps));
    recordControlPlaneEvent("BEAT_FPS", `${beatTempoFpsCap.toFixed(2)}:budget`);
  });
  
  performanceBudgetManager.onPmAudioFeedIntervalChange((intervalMs) => {
    // 根据 intervalMs 映射到 mode
    const mode = intervalMs <= 33 ? "high" : intervalMs <= 50 ? "mid" : "low";
    const fgMs = intervalMs;
    const bgMs = Math.round(intervalMs * 1.5); // bg 比 fg 慢 50%
    projectLayer.setAudioFeedIntervalMs(fgMs);
    projectLayerBg.setAudioFeedIntervalMs(bgMs);
    pmAudioCadenceMode = mode;
    recordControlPlaneEvent("PM_AUDIO_FEED", `${mode}:${fgMs}/${bgMs}:budget`);
  });
  
  performanceBudgetManager.onLevelChange((level) => {
    console.log(`[PerformanceBudget] Quality level: ${level}`);
  });

  /**
   * 记录 preset 切换到预测引擎
   * 在所有 currentPresetId 赋值点调用
   */
  const recordPresetTransition = (fromId: string | null, toId: string) => {
    if (!toId || !presetPredictionEnabled) return;
    presetPredictor.recordTransition(fromId, toId);
  };

  const presetPrefetchCache = new Map<
    string,
    { text: string; touchedMs: number }
  >();
  const presetPrefetchQueue: Array<{ url: string; reason: string }> = [];
  const presetPrefetchQueued = new Set<string>();
  let presetPrefetchInFlight = false;
  let presetPrefetchTimer: number | null = null;
  let presetPrefetchAbort: AbortController | null = null;
  let currentLibrarySource: PresetLibrarySource = DEFAULT_LIBRARY_SOURCE;
  let runtimePresetList: PresetDescriptor[] = [];
  let currentEnergyLevel = 0;
  const GOOD_PRESET_STORAGE_KEY = "nw.presets.good";
  const loadGoodPresetIds = () => {
    try {
      const raw = localStorage.getItem(GOOD_PRESET_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.map((v) => String(v)).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  };
  const goodPresetIds = new Set<string>(loadGoodPresetIds());
  const persistGoodPresetIds = () => {
    try {
      const list = Array.from(goodPresetIds);
      const capped = list.slice(-400);
      localStorage.setItem(GOOD_PRESET_STORAGE_KEY, JSON.stringify(capped));
    } catch {
      // ignore
    }
  };
  const recordPresetSuccess = (preset?: PresetDescriptor | null) => {
    if (!preset?.id) return;
    if (goodPresetIds.has(preset.id)) return;
    goodPresetIds.add(preset.id);
    persistGoodPresetIds();
    if (softBlacklistById.has(preset.id)) {
      softBlacklistById.delete(preset.id);
      persistSoftBlacklist();
    }
  };

  const SOFT_BLACKLIST_STORAGE_KEY = "nw.presets.softBlacklist.v1";
  const SOFT_BLACKLIST_TTL_MS = 24 * 60 * 60 * 1000;
  const loadSoftBlacklist = () => {
    try {
      const raw = localStorage.getItem(SOFT_BLACKLIST_STORAGE_KEY);
      if (!raw) return new Map<string, number>();
      const parsed = JSON.parse(raw) as Record<string, number>;
      const map = new Map<string, number>();
      for (const [id, until] of Object.entries(parsed ?? {})) {
        const t = Number(until);
        if (id && Number.isFinite(t)) map.set(id, t);
      }
      return map;
    } catch {
      return new Map<string, number>();
    }
  };
  let softBlacklistById = loadSoftBlacklist();
  const persistSoftBlacklist = () => {
    try {
      const obj: Record<string, number> = {};
      for (const [id, until] of softBlacklistById.entries()) {
        obj[id] = until;
      }
      localStorage.setItem(SOFT_BLACKLIST_STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore
    }
  };
  const pruneSoftBlacklist = (nowMs: number) => {
    let changed = false;
    for (const [id, until] of softBlacklistById.entries()) {
      if (!Number.isFinite(until) || until <= nowMs) {
        softBlacklistById.delete(id);
        changed = true;
      }
    }
    if (changed) persistSoftBlacklist();
  };
  const isSoftBlacklisted = (id: string, nowMs: number) => {
    pruneSoftBlacklist(nowMs);
    const until = softBlacklistById.get(id);
    return Boolean(until && until > nowMs);
  };
  const markPresetSoft = (id: string, ttlMs = SOFT_BLACKLIST_TTL_MS) => {
    if (!id) return;
    const until = Date.now() + Math.max(1000, ttlMs);
    softBlacklistById.set(id, until);
    persistSoftBlacklist();
  };

  const AESTHETIC_BLACKLIST_STORAGE_KEY = "nw.presets.aestheticBlacklist.v1";
  const AESTHETIC_BLACKLIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const loadAestheticBlacklist = () => {
    try {
      const raw = localStorage.getItem(AESTHETIC_BLACKLIST_STORAGE_KEY);
      if (!raw) return new Map<string, number>();
      const parsed = JSON.parse(raw) as Record<string, number>;
      const map = new Map<string, number>();
      for (const [id, until] of Object.entries(parsed ?? {})) {
        const t = Number(until);
        if (id && Number.isFinite(t)) map.set(id, t);
      }
      return map;
    } catch {
      return new Map<string, number>();
    }
  };
  let aestheticBlacklistById = loadAestheticBlacklist();
  const persistAestheticBlacklist = () => {
    try {
      const obj: Record<string, number> = {};
      for (const [id, until] of aestheticBlacklistById.entries()) {
        obj[id] = until;
      }
      localStorage.setItem(
        AESTHETIC_BLACKLIST_STORAGE_KEY,
        JSON.stringify(obj)
      );
    } catch {
      // ignore
    }
  };
  const pruneAestheticBlacklist = (nowMs: number) => {
    let changed = false;
    for (const [id, until] of aestheticBlacklistById.entries()) {
      if (!Number.isFinite(until) || until <= nowMs) {
        aestheticBlacklistById.delete(id);
        changed = true;
      }
    }
    if (changed) persistAestheticBlacklist();
  };
  const isAestheticBlacklisted = (id: string, nowMs: number) => {
    pruneAestheticBlacklist(nowMs);
    const until = aestheticBlacklistById.get(id);
    return Boolean(until && until > nowMs);
  };
  const markPresetAesthetic = (
    id: string,
    reason: string,
    ttlMs = AESTHETIC_BLACKLIST_TTL_MS
  ) => {
    if (!id) return;
    const until = Date.now() + Math.max(1000, ttlMs);
    aestheticBlacklistById.set(id, until);
    persistAestheticBlacklist();
    recordPresetLoadFailure(id, "aesthetic");
    recordControlPlaneEvent("PRESET_AESTHETIC", `${id}:${reason}`);
    presetFailStreak += 1;
    if (presetFailStreak >= 3) {
      scheduleAnchorFallback(`aesthetic:${reason}`);
    }
  };

  // Avoid the "Random keeps picking the same few" feeling by tracking
  // a small recency window and skipping those IDs when possible.
  const RECENT_RANDOM_PRESET_STORAGE_KEY = "nw.presets.recentRandom.v1";
  const loadRecentRandomPresetIds = () => {
    try {
      const raw = localStorage.getItem(RECENT_RANDOM_PRESET_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.map((v) => String(v)).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  };
  let recentRandomPresetIds: string[] = loadRecentRandomPresetIds();
  const persistRecentRandomPresetIds = () => {
    try {
      localStorage.setItem(
        RECENT_RANDOM_PRESET_STORAGE_KEY,
        JSON.stringify(recentRandomPresetIds)
      );
    } catch {
      // ignore
    }
  };
  const rememberRandomPresetId = (presetId: string) => {
    const id = String(presetId || "").trim();
    if (!id) return;
    // Move-to-front + cap.
    recentRandomPresetIds = [
      id,
      ...recentRandomPresetIds.filter((x) => x && x !== id),
    ].slice(0, 24);
    persistRecentRandomPresetIds();
  };

  const EXTRA_SAFE_PRESET_MIN = 140;
  const EXTRA_SAFE_PRESET_MAX = 220;
  let extraSafePresetSeeded = false;
  const seedExtraSafePresetsIfNeeded = async (source: PresetLibrarySource) => {
    if (extraSafePresetSeeded) return;
    if (source === "full" || source === "full-safe") return;
    const currentCount = runtimePresetList.length;
    if (currentCount >= EXTRA_SAFE_PRESET_MIN) return;
    extraSafePresetSeeded = true;

    try {
      const { manifestUrl } = getLibraryConfig("full-safe");
      const manifest = await loadLibraryManifest(manifestUrl, {
        requireWasmSafe: true,
      });
      const presets = mapManifestToPresetDescriptors(manifest);
      const existing = new Set(getAllPresets().map((p) => p.id));
      const bag = presets.filter((p) => !existing.has(p.id));
      if (!bag.length) return;

      const seed = createRandomSeed();
      const rng = createSeededRng(seed);
      const target = Math.min(
        EXTRA_SAFE_PRESET_MAX,
        Math.max(0, EXTRA_SAFE_PRESET_MIN - currentCount),
        bag.length
      );
      const sample: PresetDescriptor[] = [];
      for (let i = 0; i < target; i++) {
        const idx = rng.int(0, bag.length);
        const next = bag.splice(idx, 1)[0];
        if (next) sample.push(next);
      }
      if (!sample.length) return;

      runtimePresetList = [...runtimePresetList, ...sample];
      registerRuntimePresets(runtimePresetList);
      refreshPresetSelect();
      updatePresetCyclerAvailability();
      for (const preset of sample) {
        if (!goodPresetIds.has(preset.id)) goodPresetIds.add(preset.id);
      }
      persistGoodPresetIds();
    } catch (error) {
      console.warn("Safe preset seeding failed", error);
      extraSafePresetSeeded = false;
    }
  };
  const getRandomPresetPool = (rng?: {
    int: (minInclusive: number, maxExclusive: number) => number;
  }) => {
    const nowMs = Date.now();
    const all = getAllPresets();
    const presets = all.filter(
      (p) =>
        !isSoftBlacklisted(p.id, nowMs) && !isAestheticBlacklisted(p.id, nowMs)
    );
    const pool = presets.length ? presets : all;
    if (!pool.length) return pool;

    const recentSet = new Set(recentRandomPresetIds.slice(0, 18));
    const filterRecent = (list: PresetDescriptor[]) => {
      if (!recentSet.size) return list;
      const filtered = list.filter((p) => !recentSet.has(p.id));
      if (!filtered.length) return list;
      if (filtered.length >= Math.min(6, list.length - 2)) return filtered;
      return list;
    };

    // Prefer known-good presets to avoid repeated load failures, but always
    // keep some exploration to prevent Random from getting stuck in a small set.
    const good = pool.filter((p) => goodPresetIds.has(p.id));
    const minCount = Math.min(4, pool.length);
    if (good.length < minCount) return filterRecent(pool);

    const rest = pool.filter((p) => !goodPresetIds.has(p.id));
    const goodFresh = filterRecent(good);
    const restFresh = filterRecent(rest);
    if (!restFresh.length) return goodFresh;

    const pickIndex = (maxExclusive: number) => {
      if (!(maxExclusive > 0)) return 0;
      if (rng) return rng.int(0, maxExclusive);
      return Math.floor(Math.random() * maxExclusive);
    };

    // Add a small sample of not-yet-good presets into the pool.
    const exploreMax = Math.min(30, restFresh.length);
    const exploreCount = Math.min(
      exploreMax,
      Math.max(6, Math.round(goodFresh.length * 0.25))
    );
    const bag = [...restFresh];
    const mixed = [...goodFresh];
    for (let i = 0; i < exploreCount; i++) {
      const idx = pickIndex(bag.length);
      const candidate = bag.splice(idx, 1)[0];
      if (!candidate) break;
      mixed.push(candidate);
    }
    return mixed;
  };

  const getNextPresetFiltered = (currentId: string | null) => {
    const nowMs = Date.now();
    const all = getAllPresets();
    const presets = all.filter(
      (p) =>
        !isSoftBlacklisted(p.id, nowMs) && !isAestheticBlacklisted(p.id, nowMs)
    );
    const pool = presets.length ? presets : all;
    if (!pool.length) return undefined;
    const currentIndex = currentId
      ? pool.findIndex((preset) => preset.id === currentId)
      : -1;
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % pool.length : 0;
    return pool[nextIndex];
  };

  const getNextPresetFilteredExcluding = (
    currentId: string | null,
    excludeIds: Set<string>
  ) => {
    const nowMs = Date.now();
    const all = getAllPresets();
    const presets = all.filter(
      (p) =>
        !isSoftBlacklisted(p.id, nowMs) && !isAestheticBlacklisted(p.id, nowMs)
    );
    const pool = presets.length ? presets : all;
    if (!pool.length) return undefined;
    const currentIndex = currentId
      ? pool.findIndex((preset) => preset.id === currentId)
      : -1;
    const startIndex = currentIndex >= 0 ? (currentIndex + 1) % pool.length : 0;
    for (let i = 0; i < pool.length; i += 1) {
      const idx = (startIndex + i) % pool.length;
      const candidate = pool[idx];
      if (!excludeIds.has(candidate.id)) return candidate;
    }
    return pool[startIndex];
  };

  const isPrefetchablePresetUrl = (url: string | null | undefined) => {
    const u = String(url ?? "").trim();
    if (!u) return false;
    return u.startsWith("/") || u.startsWith("http");
  };

  const touchPresetPrefetchCache = (url: string, text: string) => {
    if (!isPrefetchablePresetUrl(url)) return;
    const nowMs = Date.now();
    if (presetPrefetchCache.has(url)) {
      presetPrefetchCache.delete(url);
    }
    presetPrefetchCache.set(url, { text, touchedMs: nowMs });
    while (presetPrefetchCache.size > PRESET_PREFETCH_CACHE_LIMIT) {
      const oldest = presetPrefetchCache.keys().next().value as
        | string
        | undefined;
      if (!oldest) break;
      presetPrefetchCache.delete(oldest);
    }
  };

  const getPresetPrefetchText = (url: string | null | undefined) => {
    if (!isPrefetchablePresetUrl(url)) return null;
    const entry = presetPrefetchCache.get(url as string);
    if (!entry) return null;
    const nowMs = Date.now();
    if (nowMs - entry.touchedMs > PRESET_PREFETCH_TTL_MS) {
      presetPrefetchCache.delete(url as string);
      return null;
    }
    presetPrefetchCache.delete(url as string);
    presetPrefetchCache.set(url as string, {
      text: entry.text,
      touchedMs: nowMs,
    });
    return entry.text;
  };

  const invalidatePresetPrefetch = (url: string | null | undefined) => {
    if (!url) return;
    const key = String(url).trim();
    if (!key) return;
    presetPrefetchCache.delete(key);
    presetPrefetchQueued.delete(key);
    for (let i = presetPrefetchQueue.length - 1; i >= 0; i -= 1) {
      if (presetPrefetchQueue[i].url === key) {
        presetPrefetchQueue.splice(i, 1);
      }
    }
  };

  const schedulePresetPrefetchPump = (
    delayMs = PRESET_PREFETCH_IDLE_DELAY_MS
  ) => {
    if (presetPrefetchTimer != null) return;
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const pressureLeft = presetLoadPressureUntilMs - nowMs;
    const delay =
      pressureLeft > 0
        ? Math.max(delayMs, pressureLeft + PRESET_PREFETCH_PRESSURE_DELAY_MS)
        : delayMs;
    presetPrefetchTimer = window.setTimeout(() => {
      presetPrefetchTimer = null;
      void pumpPresetPrefetch();
    }, delay);
  };

  const pumpPresetPrefetch = async () => {
    if (presetPrefetchInFlight) return;
    if (presetLoadInFlight) {
      schedulePresetPrefetchPump();
      return;
    }
    const prefetchNowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const pressureLeft = presetLoadPressureUntilMs - prefetchNowMs;
    if (pressureLeft > 0) {
      schedulePresetPrefetchPump(
        Math.max(pressureLeft + PRESET_PREFETCH_PRESSURE_DELAY_MS, 240)
      );
      return;
    }
    if (typeof document !== "undefined" && document.hidden) {
      schedulePresetPrefetchPump(600);
      return;
    }
    if (!gateRenderStable) {
      schedulePresetPrefetchPump(1200);
      return;
    }
    const prefetchP95 = computeFrameTimeP95(prefetchNowMs);
    if (prefetchP95 >= RES_P95_THRESHOLD_MS) {
      schedulePresetPrefetchPump(1200);
      return;
    }
    const next = presetPrefetchQueue.shift();
    if (!next) return;
    presetPrefetchQueued.delete(next.url);
    presetPrefetchInFlight = true;
    const controller = new AbortController();
    presetPrefetchAbort = controller;
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, PRESET_PREFETCH_TIMEOUT_MS);
    try {
      const res = await fetch(next.url, {
        cache: "force-cache",
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      touchPresetPrefetchCache(next.url, text);
    } catch {
      // Ignore prefetch failures (runtime-only optimization).
    } finally {
      window.clearTimeout(timeoutId);
      presetPrefetchInFlight = false;
      presetPrefetchAbort = null;
      if (presetPrefetchQueue.length) {
        schedulePresetPrefetchPump();
      }
    }
  };

  const enqueuePresetPrefetch = (
    preset: PresetDescriptor | null | undefined,
    reason: string
  ) => {
    if (!preset?.url || !preset.id) return;
    const nowMs = Date.now();
    if (
      isSoftBlacklisted(preset.id, nowMs) ||
      isAestheticBlacklisted(preset.id, nowMs)
    )
      return;
    const url = String(preset.url).trim();
    if (!isPrefetchablePresetUrl(url)) return;
    if (getPresetPrefetchText(url)) return;
    if (presetPrefetchQueued.has(url)) return;
    presetPrefetchQueued.add(url);
    presetPrefetchQueue.push({ url, reason });
    schedulePresetPrefetchPump();
  };

  /**
   * 智能 prefetch: 结合预测引擎 + 顺序兜底
   * 优化目标: prefetch 命中率 ↑50%
   */
  const queuePresetPrefetchAround = (
    currentId: string | null,
    count: number,
    reason: string,
    excludeIds?: Set<string>
  ) => {
    const nowMs = Date.now();
    const all = getAllPresets();
    const filtered = all.filter(
      (p) =>
        !isSoftBlacklisted(p.id, nowMs) && !isAestheticBlacklisted(p.id, nowMs)
    );
    const pool = filtered.length ? filtered : all;
    if (!pool.length) return;

    const alreadyQueued = new Set<string>();
    let queued = 0;

    // 策略 1: 基于预测引擎（优先级最高）
    if (presetPredictionEnabled && currentId) {
      const candidateIds = pool
        .filter((p) => !excludeIds?.has(p.id))
        .map((p) => p.id);

      const predictions = presetPredictor.predict(
        currentId,
        candidateIds,
        count
      );

      for (const pred of predictions) {
        if (queued >= count) break;
        const preset = pool.find((p) => p.id === pred.presetId);
        if (preset && !alreadyQueued.has(preset.id)) {
          enqueuePresetPrefetch(
            preset,
            `${reason}+predicted(${pred.reason},${pred.score.toFixed(2)})`
          );
          alreadyQueued.add(preset.id);
          queued += 1;
        }
      }
    }

    // 策略 2: 顺序预取（兜底，填充剩余 slot）
    if (queued < count) {
      const startIndex = currentId
        ? pool.findIndex((preset) => preset.id === currentId)
        : -1;

      for (let i = 0; i < pool.length && queued < count; i += 1) {
        const idx = (startIndex + 1 + i) % pool.length;
        const candidate = pool[idx];
        if (excludeIds?.has(candidate.id)) continue;
        if (alreadyQueued.has(candidate.id)) continue;

        enqueuePresetPrefetch(candidate, `${reason}+sequential`);
        alreadyQueued.add(candidate.id);
        queued += 1;
      }
    }
  };

  const resetPresetPrefetch = () => {
    if (presetPrefetchAbort) {
      try {
        presetPrefetchAbort.abort();
      } catch {
        // ignore
      }
    }
    presetPrefetchAbort = null;
    presetPrefetchInFlight = false;
    if (presetPrefetchTimer != null) {
      window.clearTimeout(presetPrefetchTimer);
      presetPrefetchTimer = null;
    }
    presetPrefetchQueue.length = 0;
    presetPrefetchQueued.clear();
    presetPrefetchCache.clear();
  };

  const pausePresetPrefetch = (reason: string) => {
    if (presetPrefetchAbort) {
      try {
        presetPrefetchAbort.abort();
      } catch {
        // ignore
      }
    }
    presetPrefetchAbort = null;
    presetPrefetchInFlight = false;
    if (presetPrefetchTimer != null) {
      window.clearTimeout(presetPrefetchTimer);
      presetPrefetchTimer = null;
    }
    if (presetPrefetchQueue.length || presetPrefetchQueued.size) {
      presetPrefetchQueue.length = 0;
      presetPrefetchQueued.clear();
    }
    recordControlPlaneEvent("PRESET_PREFETCH", `pause:${reason}`);
  };

  const notePresetLoadPressure = (reason: string) => {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    presetLoadPressureUntilMs = Math.max(
      presetLoadPressureUntilMs,
      nowMs + PRESET_LOAD_PRESSURE_MS
    );
    applyAudioAnalysisCap(AUDIO_ANALYSIS_FPS_MIN, `preset:${reason}`, nowMs);
    applyBeatTempoCap(BEAT_TEMPO_FPS_LOW, `preset:${reason}`, nowMs);
    applyProjectMAudioCadence("low", `preset:${reason}`, nowMs);
    pausePresetPrefetch(reason);
    recordControlPlaneEvent("PRESET_PRESSURE", reason);
  };

  const yieldToBrowser = () =>
    new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(() => resolve(), 0);
      }
    });

  const loadPresetMaybeCached = async (
    layer: ProjectMLayer,
    preset: PresetDescriptor,
    reason: string
  ) => {
    notePresetLoadPressure(reason);
    const cachedText = getPresetPrefetchText(preset.url);
    if (cachedText != null) {
      await yieldToBrowser();
      layer.loadPresetFromData(cachedText);
      return { cache: "hit" as const };
    }
    await yieldToBrowser();
    await layer.loadPresetFromUrl(preset.url);
    return { cache: "miss" as const };
  };

  const loadPresetUrlMaybeCached = async (
    layer: ProjectMLayer,
    url: string,
    reason: string
  ) => {
    notePresetLoadPressure(reason);
    const cachedText = getPresetPrefetchText(url);
    if (cachedText != null) {
      await yieldToBrowser();
      layer.loadPresetFromData(cachedText);
      return { cache: "hit" as const };
    }
    await yieldToBrowser();
    await layer.loadPresetFromUrl(url);
    return { cache: "miss" as const };
  };

  const ANCHOR_FALLBACK_COOLDOWN_MS = 5000;
  const ANCHOR_PRESET_MIN = 12;
  const ANCHOR_PRESET_MAX = 24;
  let anchorFallbackInFlight = false;
  let lastAnchorFallbackMs = 0;
  let anchorCursor = 0;

  const getAnchorPresets = () => {
    const nowMs = Date.now();
    const all = getAllPresets();
    if (!all.length) return [];
    const filtered = all.filter(
      (p) =>
        !isSoftBlacklisted(p.id, nowMs) && !isAestheticBlacklisted(p.id, nowMs)
    );
    const pool = filtered.length ? filtered : all;
    const good = pool.filter((p) => goodPresetIds.has(p.id));
    const base = good.length >= ANCHOR_PRESET_MIN ? good : pool;
    return base.slice(0, Math.min(ANCHOR_PRESET_MAX, base.length));
  };

  const selectAnchorPreset = () => {
    const anchors = getAnchorPresets();
    if (!anchors.length) return null;
    anchorCursor = (anchorCursor + 1) % anchors.length;
    return anchors[anchorCursor] ?? anchors[0] ?? null;
  };

  const scheduleAnchorFallback = (reason: string) => {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (anchorFallbackInFlight) return;
    if (nowMs - lastAnchorFallbackMs < ANCHOR_FALLBACK_COOLDOWN_MS) return;
    lastAnchorFallbackMs = nowMs;
    anchorFallbackInFlight = true;
    anchorFallbackCount += 1;
    lastAnchorFallbackReason = reason;
    recordControlPlaneEvent("ANCHOR_FALLBACK", reason);
    setTimeout(() => {
      void loadAnchorPreset(reason);
    }, 0);
  };

  const loadAnchorPreset = async (reason: string) => {
    if (!projectLayerReady || presetLoadInFlight) {
      anchorFallbackInFlight = false;
      return;
    }
    const preset = selectAnchorPreset();
    if (!preset) {
      anchorFallbackInFlight = false;
      return;
    }
    const startMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const framesBefore = tryReadFramesRendered();
    const rebuildBefore = (() => {
      try {
        return projectLayer.getRebuildStatus();
      } catch {
        return undefined;
      }
    })();
    presetLoadInFlight = true;
    updatePresetCyclerAvailability();
    setPresetStatus(`Anchor fallback (${reason}): ${preset.label} ...`);
    try {
      ensureProjectLayerReady();
      const cacheResult = await loadPresetMaybeCached(
        projectLayer,
        preset,
        "anchor"
      );
      const prevPresetId = currentPresetId; // 记录切换前的 ID
      currentPresetId = preset.id;
      currentPresetUrl = preset.url;
      recordPresetTransition(prevPresetId, preset.id); // 记录到预测引擎
      recordPresetSuccess(preset);
      updatePresetSelectValue(preset.id);
      applyProjectMPresetTuningToRuntime("presetLoaded");
      setPresetStatus(`Preset: ${preset.label}`);
      armProjectMMotionWatch("manual");
      queuePresetPrefetchAround(preset.id, 2, "anchor");

      const tEnd =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const report: PresetSwitchReport = {
        scope: "fg",
        origin: "anchor",
        presetId: preset.id,
        presetUrl: preset.url,
        presetLabel: preset.label,
        tStartMs: startMs,
        tEndMs: tEnd,
        durationMs: Math.max(0, tEnd - startMs),
        loadMs: Math.max(0, tEnd - startMs),
        cache: cacheResult?.cache === "hit" ? "hit" : "miss",
        framesBefore: framesBefore ?? undefined,
        rebuildBefore,
        rebuildAfter: (() => {
          try {
            return projectLayer.getRebuildStatus();
          } catch {
            return undefined;
          }
        })(),
        outcome: "success",
      };
      pushPresetSwitchReport(report);
      void updatePresetSwitchFirstFrame(report);
    } catch (error) {
      const elapsedMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        startMs;
      handlePresetLoadError("Anchor preset failed", error);
      handlePresetFailure(preset, error, elapsedMs);

      const tEnd =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const report: PresetSwitchReport = {
        scope: "fg",
        origin: "anchor",
        presetId: preset.id,
        presetUrl: preset.url,
        presetLabel: preset.label,
        tStartMs: startMs,
        tEndMs: tEnd,
        durationMs: Math.max(0, tEnd - startMs),
        cache: "na",
        framesBefore: framesBefore ?? undefined,
        rebuildBefore,
        rebuildAfter: (() => {
          try {
            return projectLayer.getRebuildStatus();
          } catch {
            return undefined;
          }
        })(),
        outcome: "error",
        errorText: (() => {
          try {
            const e = error as any;
            return typeof e?.message === "string" ? e.message : String(error);
          } catch {
            return "";
          }
        })(),
      };
      pushPresetSwitchReport(report);
    } finally {
      presetLoadInFlight = false;
      updatePresetCyclerAvailability();
      flushPendingPresetRequests();
      anchorFallbackInFlight = false;
    }
  };

  type ProjectMPresetTuningV1 = {
    externalOpacityBiasSigned: number; // [-1..1] (clamped)
    audioReactiveMultiplier: number; // [0..3]
  };

  const PROJECTM_PRESET_TUNING_STORAGE_KEY =
    "newliveweb:projectm:presetTuning:v1";

  const clampNumber = (
    value: unknown,
    min: number,
    max: number,
    fallback: number
  ) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };

  const defaultProjectMPresetTuning = (): ProjectMPresetTuningV1 => ({
    externalOpacityBiasSigned: 0,
    audioReactiveMultiplier: 1,
  });

  let projectmPresetTuningByUrl: Record<string, ProjectMPresetTuningV1> = {};
  try {
    const raw = localStorage.getItem(PROJECTM_PRESET_TUNING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, any>;
      if (parsed && typeof parsed === "object") {
        const next: Record<string, ProjectMPresetTuningV1> = {};
        for (const [url, v] of Object.entries(parsed)) {
          if (!url) continue;
          next[url] = {
            externalOpacityBiasSigned: clampNumber(
              (v as any)?.externalOpacityBiasSigned,
              -1,
              1,
              0
            ),
            audioReactiveMultiplier: clampNumber(
              (v as any)?.audioReactiveMultiplier,
              0,
              3,
              1
            ),
          };
        }
        projectmPresetTuningByUrl = next;
      }
    }
  } catch {
    projectmPresetTuningByUrl = {};
  }

  const persistProjectMPresetTuning = () => {
    try {
      localStorage.setItem(
        PROJECTM_PRESET_TUNING_STORAGE_KEY,
        JSON.stringify(projectmPresetTuningByUrl)
      );
    } catch {
      // ignore
    }
  };

  const getActivePresetUrlForTuning = () =>
    (currentPresetUrl ?? lastVisualState.projectm.presetUrl ?? null)?.trim() ||
    null;

  let pmPresetExternalOpacityBiasSigned = 0;
  let pmPresetAudioReactiveMultiplier = 1;

  const getProjectMPresetTuningValues = (): ProjectMPresetTuningV1 => {
    const url = getActivePresetUrlForTuning();
    const tuning = url ? projectmPresetTuningByUrl[url] : null;
    return {
      ...defaultProjectMPresetTuning(),
      ...(tuning ?? null),
    };
  };

  const applyProjectMPresetTuningToRuntime = (reason: string) => {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const url = getActivePresetUrlForTuning();
    const t = getProjectMPresetTuningValues();
    pmPresetExternalOpacityBiasSigned = clampNumber(
      t.externalOpacityBiasSigned,
      -1,
      1,
      0
    );
    pmPresetAudioReactiveMultiplier = clampNumber(
      t.audioReactiveMultiplier,
      0,
      3,
      1
    );
    try {
      if (projectLayerReady) {
        projectLayer.setAudioReactiveMultiplier(
          pmPresetAudioReactiveMultiplier
        );
      }
    } catch {
      // ignore
    }
    decisionTrace.recordNumeric({
      tMs: nowMs,
      writer: "presetTuning",
      target: "projectm.presetTuning.externalOpacityBiasSigned",
      value: pmPresetExternalOpacityBiasSigned,
      minIntervalMs: 150,
      minDelta: 0.01,
      digits: 3,
      reason: url ? `${reason} | ${url}` : reason,
    });
    decisionTrace.recordNumeric({
      tMs: nowMs,
      writer: "presetTuning",
      target: "projectm.presetTuning.audioReactiveMultiplier",
      value: pmPresetAudioReactiveMultiplier,
      minIntervalMs: 150,
      minDelta: 0.01,
      digits: 3,
      reason: url ? `${reason} | ${url}` : reason,
    });
  };

  const randomizeProjectMPresetTuningForActivePreset = (
    rng: ReturnType<typeof createSeededRng>,
    energy01: number,
    reason: string
  ) => {
    const url = getActivePresetUrlForTuning();
    if (!url) return;
    const e = Math.min(1, Math.max(0, Number(energy01) || 0));

    const randIn = (min: number, max: number) =>
      min + (max - min) * Math.min(1, Math.max(0, rng.next()));

    // Keep changes subtle but noticeable.
    const next: ProjectMPresetTuningV1 = {
      externalOpacityBiasSigned: clampNumber(randIn(-0.25, 0.25), -1, 1, 0),
      // Bias toward stronger reactivity when energy is high.
      audioReactiveMultiplier: clampNumber(
        randIn(0.75 + 0.35 * e, 1.65 + 0.95 * e),
        0,
        3,
        1
      ),
    };
    projectmPresetTuningByUrl = {
      ...projectmPresetTuningByUrl,
      [url]: next,
    };
    persistProjectMPresetTuning();
    applyProjectMPresetTuningToRuntime(reason);
  };

  function getLiquidParamsSnapshot() {
    return { ...liquidLayer.params };
  }

  function getCurrentBlendParams() {
    try {
      return projectLayer.getBlendParams();
    } catch {
      // If ProjectM isn't ready (or temporarily failed), still allow save/favorite.
      return {
        opacity: lastVisualState.projectm.opacity,
        blendMode: lastVisualState.projectm.blendMode as any,
        audioDrivenOpacity: lastVisualState.projectm.audioDrivenOpacity,
        energyToOpacityAmount: lastVisualState.projectm.energyToOpacityAmount,
      };
    }
  }

  function buildCurrentVisualState(
    globalOverride: VisualStateV2["global"] = lastVisualState.global,
    backgroundOverride: VisualStateV2["background"] = lastVisualState.background
  ): VisualStateV2 {
    const blend = getCurrentBlendParams();
    const preset = currentPresetId ? findPresetById(currentPresetId) : null;
    const presetUrl = currentPresetUrl ?? preset?.url ?? null;

    const next = cloneVisualState(lastVisualState);

    next.global = globalOverride;
    next.background = backgroundOverride;

    next.projectm = {
      ...next.projectm,
      presetId: currentPresetId,
      presetUrl,
      opacity: blend.opacity,
      blendMode: blend.blendMode,
      audioDrivenOpacity: blend.audioDrivenOpacity,
      energyToOpacityAmount: blend.energyToOpacityAmount,
    };

    const layers = (next.background.layers ?? {
      liquid: {},
      basic: {},
      camera: {},
      video: {},
      depth: {},
    }) as NonNullable<VisualStateV2["background"]["layers"]>;

    // Snapshot the active UI values so favorites/show save reflect what users see/tuned.
    const liquidSnapshot = getLiquidParamsSnapshot() as Record<string, unknown>;
    const nextLiquid = {
      ...(layers.liquid ?? {}),
      ...liquidSnapshot,
      enabled: Boolean(layerLiquidToggle?.checked ?? true),
    } as Record<string, unknown>;
    const liquidVariant = String(bgVariantSelect?.value ?? "").trim();
    if (
      liquidVariant === "metal" ||
      liquidVariant === "waves" ||
      liquidVariant === "stars" ||
      liquidVariant === "lines"
    ) {
      nextLiquid.variant = liquidVariant;
    }
    layers.liquid = nextLiquid;

    layers.basic = {
      ...(layers.basic ?? {}),
      enabled: Boolean(layerBasicToggle?.checked),
      opacity: readRangeInputValue01(basicOpacityInput, 0.7),
    };

    layers.camera = {
      ...(layers.camera ?? {}),
      enabled: Boolean(layerCameraToggle?.checked),
      deviceId: cameraDeviceSelect?.value ?? "",
      opacity: readRangeInputValue01(cameraOpacityInput, 0.85),
      segmentPerson: Boolean(cameraSegmentToggle?.checked),
    };

    layers.video = {
      ...(layers.video ?? {}),
      enabled: Boolean(layerVideoToggle?.checked),
      opacity: readRangeInputValue01(videoOpacityInput, 0.7),
      src: (videoSrcInput?.value ?? "").trim(),
    };

    layers.depth = {
      ...(layers.depth ?? {}),
      enabled: Boolean(layerDepthToggle?.checked),
      opacity: readRangeInputValue01(depthOpacityInput, 0.7),
      source: (depthSourceSelect?.value ?? "webcam").trim(),
      deviceId: depthDeviceSelect?.value ?? "",
      showDepth: Boolean(depthShowDepthToggle?.checked),
      fog: readNumberInputValue(depthFogInput, 1.1),
      edge: readNumberInputValue(depthEdgeInput, 1.3),
      layers: readNumberInputValue(depthLayersInput, 12),
      blur: readNumberInputValue(depthBlurInput, 10),
    };

    next.background.layers = layers;

    // Background focus type (mixer focus): prefer the toolbar select when present.
    const focusRaw = String(bgTypeSelect?.value ?? "").trim();
    const nextType =
      focusRaw === "basic" ||
      focusRaw === "camera" ||
      focusRaw === "video" ||
      focusRaw === "depth"
        ? (focusRaw as any)
        : "liquid";
    next.background.type = nextType;
    next.background.params = { ...(layers as any)[nextType] };

    return next;
  }

  const backgroundRegistry = createBackgroundRegistry({
    liquidLayer,
    basicLayer,
    cameraLayer,
    videoLayer,
    depthLayer,
    paramDefs: {
      liquid: (paramSchema.background as any)?.liquid ?? [],
      basic: (paramSchema.background as any)?.basic ?? [],
      camera: (paramSchema.background as any)?.camera ?? [],
      video: (paramSchema.background as any)?.video ?? [],
      depth: (paramSchema.background as any)?.depth ?? [],
    },
  });

  const visualStateController = createVisualStateController({
    projectLayer,
    backgroundRegistry,
    buildCurrentVisualState: (global, background) =>
      buildCurrentVisualState(global, background),
  });

  // Inspector (debug/advanced controls). Required by headless verify and useful for tuning.
  // IMPORTANT: Initialize only after preset vars + buildCurrentVisualState exist (avoid TDZ).
  const liquidDefaultsAtBoot = {
    ...liquidLayer.params,
    enabled: true,
    opacity: 0.7,
  } as Record<string, unknown>;

  // Camera device list for Inspector.
  let inspectorCameraDevices: Array<{ id: string; label: string }> = [];
  const refreshInspectorCameraDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      inspectorCameraDevices = devices
        .filter((d) => d.kind === "videoinput")
        .map((d, i) => ({
          id: d.deviceId,
          label: (d.label || `Camera ${i + 1}`).trim(),
        }));
    } catch {
      inspectorCameraDevices = [];
    }
  };

  const updateLastVisualStateLayer = (
    layer: "liquid" | "basic" | "camera" | "video" | "depth",
    patch: Record<string, unknown>
  ) => {
    const existingLayers = lastVisualState.background.layers ?? {
      liquid: {},
      basic: {},
      camera: {},
      video: {},
      depth: {},
    };
    const nextLayer = {
      ...(existingLayers as any)[layer],
      ...patch,
    };
    lastVisualState = {
      ...lastVisualState,
      background: {
        ...lastVisualState.background,
        layers: {
          ...existingLayers,
          [layer]: nextLayer,
        } as any,
        params:
          layer === lastVisualState.background.type
            ? { ...nextLayer }
            : lastVisualState.background.params,
      },
    };
  };

  const overlayBudget = {
    maxEnergy: 1.2,
    minScale: 0.18,
    depthWeight: 1.2,
    smoothBaseMs: 33,
    priorityBasic: 0.8,
    priorityCamera: 0.85,
    priorityVideo: 0.85,
    priorityDepth: 0.55,
    pmRetreatStrength: 0.25,
    pmRetreatFloor: 0.65,
  };

  const PM_PRIORITY_KEY = "nw.pm.priority";
  const applyPmPriority = (value01: number) => {
    const v = clamp01(Number.isFinite(value01) ? value01 : 0.6);
    overlayBudget.pmRetreatStrength = Math.min(
      0.7,
      Math.max(0.05, 0.6 - 0.45 * v)
    );
    overlayBudget.pmRetreatFloor = Math.min(
      0.9,
      Math.max(0.35, 0.5 + 0.35 * v)
    );
    if (pmPriorityInput) pmPriorityInput.value = v.toFixed(2);
    if (pmPriorityText) pmPriorityText.textContent = `${Math.round(v * 100)}%`;
    if (pmRetreatStrengthInput)
      pmRetreatStrengthInput.value = overlayBudget.pmRetreatStrength.toFixed(2);
    if (pmRetreatStrengthText)
      pmRetreatStrengthText.textContent = `${Math.round(
        overlayBudget.pmRetreatStrength * 100
      )}%`;
    writeStored(PM_PRIORITY_KEY, v.toFixed(2));
  };
  const applyPmRetreatStrength = (value01: number) => {
    const v = clampRuntime(value01, 0.05, 0.7);
    const derivedPriority = clamp01((0.6 - v) / 0.45);
    applyPmPriority(derivedPriority);
  };
  applyPmPriority(readStoredNumber(PM_PRIORITY_KEY, 0.6));

  // Runtime-only overlay budget state: smoothed opacity multipliers per overlay layer.
  let overlayBudgetLastMs = 0;
  let overlayMulBasic = 1;
  let overlayMulCamera = 1;
  let overlayMulVideo = 1;
  let overlayMulDepth = 1;
  let overlayMulProjectM = 1;
  let lastVisibilityRescueMs = 0;

  const overlayBudgetDiag = {
    energy01: 0,
    depthFresh01: 0,
    nActive: 0,
    scale: 1,
    meanOverlayMul: 0,
    pmTarget: 1,
  };

  const overlayBudgetHoldMs = 2200;
  const overlayBudgetHoldUntil: Record<
    "basic" | "camera" | "video" | "depth",
    number
  > = {
    basic: 0,
    camera: 0,
    video: 0,
    depth: 0,
  };

  const noteOverlayBudgetHold = (
    layer: "basic" | "camera" | "video" | "depth"
  ) => {
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    overlayBudgetHoldUntil[layer] = now + overlayBudgetHoldMs;
  };

  const pmClosedLoop = {
    enabled: true,
    targetLuma: 0.38,
    kp: 0.55,
    ki: 0.12,
    integralClamp: 0.35,
    outputClamp: 0.6,
    maxDeltaPerSec: 0.35,
    intervalMs: 500,
  };

  const pmColorLoop = {
    enabled: false,
    hueOffset: 0.5,
    amount: 0.35,
    maxStrength: 0.45,
    contrastAmount: 0.12,
    maxDeltaPerSec: 0.35,
    intervalMs: 500,
  };

  // Random preset watchdog: detect ProjectM output stuck/static and re-roll.
  const pmMotionWatch = {
    active: false,
    reason: "random" as "random" | "manual" | "unknown",
    presetUrl: null as string | null,
    startMs: 0,
    lastSampleMs: 0,
    lastChangeMs: 0,
    lastFramesRendered: 0,
    lastLumaSampleCount: 0,
    lastLuma: 0,
    lastColor: { r: 0, g: 0, b: 0 },
    lumaOutSinceMs: 0,
    attempts: 0,
    inFlight: false,
  };
  const PM_MOTION_START_DELAY_MS = 1500;
  const PM_MOTION_FREEZE_MS = 4500;
  const PM_MOTION_MAX_ATTEMPTS = 2;
  const PM_MOTION_LUMA_EPS = 0.002;
  const PM_MOTION_COLOR_EPS = 0.01;
  const PM_LUMA_MIN = 0.02;
  const PM_LUMA_MAX = 0.98;
  const PM_LUMA_OUT_HOLD_MS = 1200;

  // Runtime-only PI state (no saved-state mutation).
  let pmClosedLoopIntegral = 0;
  let pmClosedLoopLastUpdateMs = 0;
  let pmClosedLoopLastOutput = 0;
  let pmClosedLoopLastError = 0;
  let pmClosedLoopLastLuma = 0;

  // Runtime-only color loop state (no saved-state mutation).
  let pmColorLoopLastUpdateMs = 0;
  let pmColorLoopHue01 = 0.5;
  let pmColorLoopStrength01 = 0;
  let pmColorLoopContrastMul = 1;

  const getAudioControlsValues = () => {
    const cfg = audioControls.getConfig();
    return {
      technoProfile: aivj.profile,
      enabled: cfg.enabled,
      mixToMacros: cfg.mixToMacros,
      attackMs: cfg.attackMs,
      releaseMs: cfg.releaseMs,
      maxDeltaPerSec: cfg.maxDeltaPerSec,
      amountProjectM: cfg.amounts.projectm,
      amountLiquid: cfg.amounts.liquid,
      amountBasic: cfg.amounts.basic,
      amountCamera: cfg.amounts.camera,
      amountVideo: cfg.amounts.video,
      amountDepth: cfg.amounts.depth,
      wFusionEnergy: cfg.weights.fusion.energy,
      wFusionBass: cfg.weights.fusion.bass,
      wFusionFlux: cfg.weights.fusion.flux,
      wFusionBeat: cfg.weights.fusion.beatPulse,
      wMotionEnergy: cfg.weights.motion.energy,
      wMotionBass: cfg.weights.motion.bass,
      wMotionFlux: cfg.weights.motion.flux,
      wMotionBeat: cfg.weights.motion.beatPulse,
      wSparkleEnergy: cfg.weights.sparkle.energy,
      wSparkleBass: cfg.weights.sparkle.bass,
      wSparkleFlux: cfg.weights.sparkle.flux,
      wSparkleBeat: cfg.weights.sparkle.beatPulse,
      overlayBudgetMaxEnergy: overlayBudget.maxEnergy,
      overlayBudgetMinScale: overlayBudget.minScale,
      overlayBudgetDepthWeight: overlayBudget.depthWeight,
      overlayBudgetSmoothBaseMs: overlayBudget.smoothBaseMs,
      overlayBudgetPriorityBasic: overlayBudget.priorityBasic,
      overlayBudgetPriorityCamera: overlayBudget.priorityCamera,
      overlayBudgetPriorityVideo: overlayBudget.priorityVideo,
      overlayBudgetPriorityDepth: overlayBudget.priorityDepth,
      overlayBudgetPmRetreatStrength: overlayBudget.pmRetreatStrength,
      overlayBudgetPmRetreatFloor: overlayBudget.pmRetreatFloor,

      pmClosedLoopEnabled: pmClosedLoop.enabled,
      pmClosedLoopTargetLuma: pmClosedLoop.targetLuma,
      pmClosedLoopKp: pmClosedLoop.kp,
      pmClosedLoopKi: pmClosedLoop.ki,
      pmClosedLoopIntegralClamp: pmClosedLoop.integralClamp,
      pmClosedLoopOutputClamp: pmClosedLoop.outputClamp,
      pmClosedLoopMaxDeltaPerSec: pmClosedLoop.maxDeltaPerSec,
      pmClosedLoopIntervalMs: pmClosedLoop.intervalMs,

      pmColorLoopEnabled: pmColorLoop.enabled,
      pmColorLoopHueOffset: pmColorLoop.hueOffset,
      pmColorLoopAmount: pmColorLoop.amount,
      pmColorLoopMaxStrength: pmColorLoop.maxStrength,
      pmColorLoopContrastAmount: pmColorLoop.contrastAmount,
      pmColorLoopMaxDeltaPerSec: pmColorLoop.maxDeltaPerSec,
      pmColorLoopIntervalMs: pmColorLoop.intervalMs,
    };
  };

  const applyAudioControlsPatch = (patch: Record<string, unknown>) => {
    const cfg = audioControls.getConfig();
    const next: any = {};

    if (Object.prototype.hasOwnProperty.call(patch, "technoProfile")) {
      const raw = String((patch as any).technoProfile ?? "").trim();
      if (
        raw === "ambient" ||
        raw === "peakRave" ||
        raw === "dub" ||
        raw === "drone" ||
        raw === "videoVj" ||
        raw === "custom"
      ) {
        aivj.profile = raw;
        if (technoProfileSelect) technoProfileSelect.value = raw;
        writeStored(AIVJ_PROFILE_KEY, raw);
        updateAivjSummary();
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "enabled")) {
      next.enabled = Boolean((patch as any).enabled);
      if (audioControlsToggle) audioControlsToggle.checked = next.enabled;
    }
    if (patch.mixToMacros != null) next.mixToMacros = Number(patch.mixToMacros);
    if (patch.attackMs != null) next.attackMs = Number(patch.attackMs);
    if (patch.releaseMs != null) next.releaseMs = Number(patch.releaseMs);
    if (patch.maxDeltaPerSec != null)
      next.maxDeltaPerSec = Number(patch.maxDeltaPerSec);

    const nextAmounts: any = { ...cfg.amounts };
    const assignAmount = (key: string, field: keyof typeof cfg.amounts) => {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
      const v = Number((patch as any)[key]);
      if (!Number.isFinite(v)) return;
      nextAmounts[field] = v;
    };
    assignAmount("amountProjectM", "projectm");
    assignAmount("amountLiquid", "liquid");
    assignAmount("amountBasic", "basic");
    assignAmount("amountCamera", "camera");
    assignAmount("amountVideo", "video");
    assignAmount("amountDepth", "depth");
    next.amounts = nextAmounts;

    const nextWeights: any = {
      fusion: { ...cfg.weights.fusion },
      motion: { ...cfg.weights.motion },
      sparkle: { ...cfg.weights.sparkle },
    };
    const assignWeight = (
      key: string,
      macro: "fusion" | "motion" | "sparkle",
      field: "energy" | "bass" | "flux" | "beatPulse"
    ) => {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
      const v = Number((patch as any)[key]);
      if (!Number.isFinite(v)) return;
      nextWeights[macro][field] = v;
    };
    assignWeight("wFusionEnergy", "fusion", "energy");
    assignWeight("wFusionBass", "fusion", "bass");
    assignWeight("wFusionFlux", "fusion", "flux");
    assignWeight("wFusionBeat", "fusion", "beatPulse");
    assignWeight("wMotionEnergy", "motion", "energy");
    assignWeight("wMotionBass", "motion", "bass");
    assignWeight("wMotionFlux", "motion", "flux");
    assignWeight("wMotionBeat", "motion", "beatPulse");
    assignWeight("wSparkleEnergy", "sparkle", "energy");
    assignWeight("wSparkleBass", "sparkle", "bass");
    assignWeight("wSparkleFlux", "sparkle", "flux");
    assignWeight("wSparkleBeat", "sparkle", "beatPulse");
    next.weights = nextWeights;

    audioControls.setConfig(next);

    const clampOr = (v: unknown, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    if (Object.prototype.hasOwnProperty.call(patch, "overlayBudgetMaxEnergy"))
      overlayBudget.maxEnergy = clampOr(
        (patch as any).overlayBudgetMaxEnergy,
        overlayBudget.maxEnergy
      );
    if (Object.prototype.hasOwnProperty.call(patch, "overlayBudgetMinScale"))
      overlayBudget.minScale = clampOr(
        (patch as any).overlayBudgetMinScale,
        overlayBudget.minScale
      );
    if (Object.prototype.hasOwnProperty.call(patch, "overlayBudgetDepthWeight"))
      overlayBudget.depthWeight = clampOr(
        (patch as any).overlayBudgetDepthWeight,
        overlayBudget.depthWeight
      );
    if (
      Object.prototype.hasOwnProperty.call(patch, "overlayBudgetSmoothBaseMs")
    )
      overlayBudget.smoothBaseMs = clampOr(
        (patch as any).overlayBudgetSmoothBaseMs,
        overlayBudget.smoothBaseMs
      );
    if (
      Object.prototype.hasOwnProperty.call(patch, "overlayBudgetPriorityBasic")
    )
      overlayBudget.priorityBasic = clampOr(
        (patch as any).overlayBudgetPriorityBasic,
        overlayBudget.priorityBasic
      );
    if (
      Object.prototype.hasOwnProperty.call(patch, "overlayBudgetPriorityCamera")
    )
      overlayBudget.priorityCamera = clampOr(
        (patch as any).overlayBudgetPriorityCamera,
        overlayBudget.priorityCamera
      );
    if (
      Object.prototype.hasOwnProperty.call(patch, "overlayBudgetPriorityVideo")
    )
      overlayBudget.priorityVideo = clampOr(
        (patch as any).overlayBudgetPriorityVideo,
        overlayBudget.priorityVideo
      );
    if (
      Object.prototype.hasOwnProperty.call(patch, "overlayBudgetPriorityDepth")
    )
      overlayBudget.priorityDepth = clampOr(
        (patch as any).overlayBudgetPriorityDepth,
        overlayBudget.priorityDepth
      );
    if (
      Object.prototype.hasOwnProperty.call(
        patch,
        "overlayBudgetPmRetreatStrength"
      )
    )
      overlayBudget.pmRetreatStrength = clampOr(
        (patch as any).overlayBudgetPmRetreatStrength,
        overlayBudget.pmRetreatStrength
      );
    if (
      Object.prototype.hasOwnProperty.call(patch, "overlayBudgetPmRetreatFloor")
    )
      overlayBudget.pmRetreatFloor = clampOr(
        (patch as any).overlayBudgetPmRetreatFloor,
        overlayBudget.pmRetreatFloor
      );

    if (Object.prototype.hasOwnProperty.call(patch, "pmClosedLoopEnabled")) {
      pmClosedLoop.enabled = Boolean((patch as any).pmClosedLoopEnabled);
      if (!pmClosedLoop.enabled) {
        pmClosedLoopIntegral = 0;
        pmClosedLoopLastOutput = 0;
        pmClosedLoopLastError = 0;
        pmClosedLoopLastUpdateMs = 0;
      }
    }

    const clamp01 = (v: unknown, fallback: number) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(0, Math.min(1, n));
    };

    if (Object.prototype.hasOwnProperty.call(patch, "pmClosedLoopTargetLuma"))
      pmClosedLoop.targetLuma = clamp01(
        (patch as any).pmClosedLoopTargetLuma,
        pmClosedLoop.targetLuma
      );
    if (Object.prototype.hasOwnProperty.call(patch, "pmClosedLoopKp"))
      pmClosedLoop.kp = clampOr((patch as any).pmClosedLoopKp, pmClosedLoop.kp);
    if (Object.prototype.hasOwnProperty.call(patch, "pmClosedLoopKi"))
      pmClosedLoop.ki = clampOr((patch as any).pmClosedLoopKi, pmClosedLoop.ki);
    if (
      Object.prototype.hasOwnProperty.call(patch, "pmClosedLoopIntegralClamp")
    )
      pmClosedLoop.integralClamp = clamp01(
        (patch as any).pmClosedLoopIntegralClamp,
        pmClosedLoop.integralClamp
      );
    if (Object.prototype.hasOwnProperty.call(patch, "pmClosedLoopOutputClamp"))
      pmClosedLoop.outputClamp = clamp01(
        (patch as any).pmClosedLoopOutputClamp,
        pmClosedLoop.outputClamp
      );
    if (
      Object.prototype.hasOwnProperty.call(patch, "pmClosedLoopMaxDeltaPerSec")
    )
      pmClosedLoop.maxDeltaPerSec = clampOr(
        (patch as any).pmClosedLoopMaxDeltaPerSec,
        pmClosedLoop.maxDeltaPerSec
      );
    if (Object.prototype.hasOwnProperty.call(patch, "pmClosedLoopIntervalMs"))
      pmClosedLoop.intervalMs = clampOr(
        (patch as any).pmClosedLoopIntervalMs,
        pmClosedLoop.intervalMs
      );

    if (Object.prototype.hasOwnProperty.call(patch, "pmColorLoopEnabled")) {
      pmColorLoop.enabled = Boolean((patch as any).pmColorLoopEnabled);
      if (!pmColorLoop.enabled) {
        pmColorLoopLastUpdateMs = 0;
        pmColorLoopHue01 = 0.5;
        pmColorLoopStrength01 = 0;
        pmColorLoopContrastMul = 1;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "pmColorLoopHueOffset"))
      pmColorLoop.hueOffset = clamp01(
        (patch as any).pmColorLoopHueOffset,
        pmColorLoop.hueOffset
      );
    if (Object.prototype.hasOwnProperty.call(patch, "pmColorLoopAmount"))
      pmColorLoop.amount = clamp01(
        (patch as any).pmColorLoopAmount,
        pmColorLoop.amount
      );
    if (Object.prototype.hasOwnProperty.call(patch, "pmColorLoopMaxStrength"))
      pmColorLoop.maxStrength = clamp01(
        (patch as any).pmColorLoopMaxStrength,
        pmColorLoop.maxStrength
      );
    if (
      Object.prototype.hasOwnProperty.call(patch, "pmColorLoopContrastAmount")
    )
      pmColorLoop.contrastAmount = clamp01(
        (patch as any).pmColorLoopContrastAmount,
        pmColorLoop.contrastAmount
      );
    if (
      Object.prototype.hasOwnProperty.call(patch, "pmColorLoopMaxDeltaPerSec")
    )
      pmColorLoop.maxDeltaPerSec = clampOr(
        (patch as any).pmColorLoopMaxDeltaPerSec,
        pmColorLoop.maxDeltaPerSec
      );
    if (Object.prototype.hasOwnProperty.call(patch, "pmColorLoopIntervalMs"))
      pmColorLoop.intervalMs = clampOr(
        (patch as any).pmColorLoopIntervalMs,
        pmColorLoop.intervalMs
      );
  };

  const applyBackgroundTypePatch = (type: unknown) => {
    const raw = String(type ?? "liquid").trim();
    const nextType =
      raw === "basic" ||
      raw === "camera" ||
      raw === "video" ||
      raw === "depth" ||
      raw === "liquid"
        ? (raw as "liquid" | "basic" | "camera" | "video" | "depth")
        : "liquid";
    const resolvedType =
      nextType === "camera" && !cameraLayer ? "liquid" : nextType;

    if (bgTypeSelect) {
      bgTypeSelect.value = resolvedType === "liquid" ? "none" : resolvedType;
    }

    // Ensure the chosen focus layer is enabled so "Background/Type/type" changes are visible.
    if (resolvedType === "liquid") {
      applyBackgroundLayerPatch("liquid", { enabled: true }, "user");
    } else if (resolvedType === "basic") {
      applyBackgroundLayerPatch("basic", { enabled: true }, "user");
    } else if (resolvedType === "camera") {
      applyBackgroundLayerPatch("camera", { enabled: true }, "user");
    } else if (resolvedType === "video") {
      applyBackgroundLayerPatch("video", { enabled: true }, "user");
    } else if (resolvedType === "depth") {
      applyBackgroundLayerPatch("depth", { enabled: true }, "user");
    }

    // When switching focus away from liquid, allow other layers to be seen clearly.
    if (resolvedType !== "liquid") {
      applyBackgroundLayerPatch("liquid", { enabled: false }, "user");
    }

    refreshBackgroundUiEnabledState();

    // Unify state transition for background focus type.
    lastVisualState = visualStateController.applyPatch(
      buildCurrentVisualState(),
      {
        background: { type: resolvedType },
      }
    );

    // Apply current UI params so enabling a layer is immediately visible.
    setBasicParamsFromUi();
    setCameraParamsFromUi();
    setVideoParamsFromUi();
    setDepthParamsFromUi();

    ensureVisibleBaseline();
    lastVisualState = buildCurrentVisualState();
    inspector?.refreshStatus();
  };

  const applyBackgroundLayerPatch = (
    type: "liquid" | "basic" | "camera" | "video" | "depth",
    patch: Record<string, unknown>,
    _source: "user" | "macro" | "closedLoop" | "random" = "user"
  ) => {
    if (type === "camera" && !cameraLayer) return;

    // Keep UI toggles in sync for enabled changes.
    if (Object.prototype.hasOwnProperty.call(patch, "enabled")) {
      const enabled = Boolean((patch as any).enabled);
      if (type === "liquid") {
        if (layerLiquidToggle) layerLiquidToggle.checked = enabled;
        refreshBackgroundUiEnabledState();
      } else if (type === "basic") {
        if (layerBasicToggle) layerBasicToggle.checked = enabled;
        refreshBackgroundUiEnabledState();
      } else if (type === "camera") {
        if (layerCameraToggle) layerCameraToggle.checked = enabled;
        refreshBackgroundUiEnabledState();
      } else if (type === "video") {
        if (layerVideoToggle) layerVideoToggle.checked = enabled;
        refreshBackgroundUiEnabledState();
      } else if (type === "depth") {
        if (layerDepthToggle) layerDepthToggle.checked = enabled;
        refreshBackgroundUiEnabledState();
      }
    }

    // Keep toolbar variant select in sync (unless locked against non-user updates).
    if (
      type === "liquid" &&
      Object.prototype.hasOwnProperty.call(patch, "variant")
    ) {
      if (liquidVariantLocked && _source !== "user") {
        delete (patch as any).variant;
      } else {
        const v = String((patch as any).variant ?? "").trim();
        if (bgVariantSelect && v) bgVariantSelect.value = v;
      }
    }

    // When patches originate from user/Inspector/MIDI, keep toolbar controls in sync.
    // This prevents buildCurrentVisualState() (which snapshots toolbar values) from
    // overwriting the patched state on the next rebuild.
    if (_source === "user") {
      const has = (k: string) => Object.prototype.hasOwnProperty.call(patch, k);
      const num = (k: string) => Number((patch as any)[k]);

      if (type === "basic") {
        if (has("opacity")) {
          const v = num("opacity");
          if (Number.isFinite(v) && basicOpacityInput)
            basicOpacityInput.value = String(v);
        }
      }

      if (type === "camera") {
        if (has("deviceId") && cameraDeviceSelect) {
          cameraDeviceSelect.value = String((patch as any).deviceId ?? "");
        }
        if (has("opacity")) {
          const v = num("opacity");
          if (Number.isFinite(v) && cameraOpacityInput)
            cameraOpacityInput.value = String(v);
        }
        if (has("segmentPerson") && cameraSegmentToggle) {
          cameraSegmentToggle.checked = Boolean((patch as any).segmentPerson);
        }
      }

      if (type === "video") {
        if (has("src") && videoSrcInput) {
          videoSrcInput.value = String((patch as any).src ?? "");
        }
        if (has("opacity")) {
          const v = num("opacity");
          if (Number.isFinite(v) && videoOpacityInput)
            videoOpacityInput.value = String(v);
        }
      }

      if (type === "depth") {
        if (has("source") && depthSourceSelect) {
          depthSourceSelect.value = String((patch as any).source ?? "webcam");
        }
        if (has("deviceId") && depthDeviceSelect) {
          depthDeviceSelect.value = String((patch as any).deviceId ?? "");
        }
        if (has("opacity")) {
          const v = num("opacity");
          if (Number.isFinite(v) && depthOpacityInput)
            depthOpacityInput.value = String(v);
        }
        if (has("showDepth") && depthShowDepthToggle) {
          depthShowDepthToggle.checked = Boolean((patch as any).showDepth);
        }
        if (has("fog") && depthFogInput) {
          const v = num("fog");
          if (Number.isFinite(v)) depthFogInput.value = String(v);
        }
        if (has("edge") && depthEdgeInput) {
          const v = num("edge");
          if (Number.isFinite(v)) depthEdgeInput.value = String(v);
        }
        if (has("layers") && depthLayersInput) {
          const v = num("layers");
          if (Number.isFinite(v)) depthLayersInput.value = String(v);
        }
        if (has("blur") && depthBlurInput) {
          const v = num("blur");
          if (Number.isFinite(v)) depthBlurInput.value = String(v);
        }
      }
    }

    // Apply via unified VisualState controller path (single source of truth).
    const vsPatch: VisualStatePatch = {
      background: {
        layers: {
          [type]: patch as any,
        } as any,
      },
    };

    lastVisualState = visualStateController.applyPatch(
      buildCurrentVisualState(),
      vsPatch
    );
  };

  let inspector: ReturnType<typeof initInspectorController> | null = null;

  inspector = initInspectorController({
    dom: {
      container: dom.inspectorContainer,
      toggleButton: dom.inspectorToggleButton,
      searchInput: dom.inspectorSearchInput,
      showAdvancedToggle: dom.inspectorShowAdvancedToggle,
      resetButton: dom.inspectorResetButton,
      status: dom.inspectorStatus,
    },
    getState: () => buildCurrentVisualState(),
    getProjectMBlendSnapshot: () => ({ ...getCurrentBlendParams() }),
    getLiquidDefaults: () => ({ ...liquidDefaultsAtBoot }),
    defs: {
      audioBeatTempo: paramSchema.audio.beatTempo,
      audioControls: paramSchema.audio.controls,
      rendererCompositor: (paramSchema as any).renderer?.compositor ?? [],
      backgroundType: paramSchema.background.type,
      underlayLiquid: [],
      projectmBlend: paramSchema.projectm.blend,
      projectmPresetTuning: (paramSchema as any).projectm?.presetTuning ?? [],
      getBackgroundLayer: (type) =>
        (paramSchema.background as any)?.[type] ?? ([] as const),
      includeCamera: Boolean(cameraLayer),
      includeDepth: true,
    },
    getAudioBeatTempoValues: () => beatTempo.getConfig(),
    getAudioControlsValues: () => getAudioControlsValues(),
    getRendererCompositorValues: () => {
      const cfg = sceneManager.getCompositorConfig();
      return {
        targetMode: cfg.targetMode,
        fixedWidth: cfg.fixedWidth,
        fixedHeight: cfg.fixedHeight,
      };
    },
    cameraDevices: {
      refresh: () => {
        void refreshInspectorCameraDevices();
      },
      getOptions: () => inspectorCameraDevices,
    },
    getProjectMPresetTuningValues: () => getProjectMPresetTuningValues(),
    applyInspectorPatch: (scope, patch) => {
      // Minimal application path: apply to real layers and keep lastVisualState reasonably in sync.
      try {
        if (scope === "audio.beatTempo") {
          beatTempo.setConfig(patch as any);
          if (Object.prototype.hasOwnProperty.call(patch, "enabled")) {
            const enabled = Boolean((patch as any).enabled);
            if (dom.beatTempoToggle) dom.beatTempoToggle.checked = enabled;
          }
          return;
        }

        if (scope === "audio.controls") {
          applyAudioControlsPatch(patch as any);
          return;
        }

        if (scope === "projectm.blend") {
          applyProjectMBlendPatch(patch as any);
          return;
        }

        if (scope === "renderer.compositor") {
          const nowMs =
            typeof performance !== "undefined" ? performance.now() : Date.now();

          let resChanged = false;
          if (Object.prototype.hasOwnProperty.call(patch, "targetMode")) {
            const modeRaw = String((patch as any).targetMode ?? "viewport");
            const mode = modeRaw === "fixed" ? "fixed" : "viewport";
            sceneManager.setCompositorTargetMode(mode);
            lastResCommitMs = nowMs;
            recordControlPlaneEvent("RES_COMMIT", `mode:${mode}`);
            decisionTrace.record({
              tMs: nowMs,
              writer: "inspector",
              target: "renderer.compositor.targetMode",
              value: mode,
            });
            resChanged = true;
          }

          const hasW = Object.prototype.hasOwnProperty.call(
            patch,
            "fixedWidth"
          );
          const hasH = Object.prototype.hasOwnProperty.call(
            patch,
            "fixedHeight"
          );
          if (hasW || hasH) {
            const cfg = sceneManager.getCompositorConfig();
            const w = hasW ? Number((patch as any).fixedWidth) : cfg.fixedWidth;
            const h = hasH
              ? Number((patch as any).fixedHeight)
              : cfg.fixedHeight;
            sceneManager.setCompositorFixedSize(w, h);
            lastResCommitMs = nowMs;
            recordControlPlaneEvent(
              "RES_COMMIT",
              `${Math.floor(Number(w))}x${Math.floor(Number(h))}`
            );
            decisionTrace.record({
              tMs: nowMs,
              writer: "inspector",
              target: "renderer.compositor.fixedSize",
              value: `${Math.floor(Number(w))}x${Math.floor(Number(h))}`,
            });
            resChanged = true;
          }

          if (resChanged) {
            syncProjectMEngineTargets();
            captureColorSnapshot("inspector", nowMs);
          }

          return;
        }

        if (scope === "projectm.presetTuning") {
          const nowMs =
            typeof performance !== "undefined" ? performance.now() : Date.now();
          const url = getActivePresetUrlForTuning();
          if (!url) {
            setInspectorStatusExtraTransient("No active preset URL", 2000);
            return;
          }

          const existing =
            projectmPresetTuningByUrl[url] ?? defaultProjectMPresetTuning();

          const next: ProjectMPresetTuningV1 = {
            ...defaultProjectMPresetTuning(),
            ...existing,
          };

          if (
            Object.prototype.hasOwnProperty.call(
              patch,
              "externalOpacityBiasSigned"
            )
          ) {
            next.externalOpacityBiasSigned = clampNumber(
              (patch as any).externalOpacityBiasSigned,
              -1,
              1,
              next.externalOpacityBiasSigned
            );
          }
          if (
            Object.prototype.hasOwnProperty.call(
              patch,
              "audioReactiveMultiplier"
            )
          ) {
            next.audioReactiveMultiplier = clampNumber(
              (patch as any).audioReactiveMultiplier,
              0,
              3,
              next.audioReactiveMultiplier
            );
          }

          projectmPresetTuningByUrl = {
            ...projectmPresetTuningByUrl,
            [url]: next,
          };
          persistProjectMPresetTuning();
          applyProjectMPresetTuningToRuntime("inspector");
          decisionTrace.record({
            tMs: nowMs,
            writer: "inspector",
            target: "projectm.presetTuning",
            value: "saved",
            reason: url,
          });
          return;
        }

        if (scope === "background.type") {
          const nextType = String((patch as any).type ?? "liquid");
          if (
            nextType === "liquid" ||
            nextType === "basic" ||
            nextType === "camera" ||
            nextType === "video" ||
            nextType === "depth"
          ) {
            applyBackgroundTypePatch(nextType);
          }
          return;
        }

        if (scope.startsWith("background.layer.")) {
          const layer = scope.slice("background.layer.".length) as
            | "liquid"
            | "basic"
            | "camera"
            | "video"
            | "depth";

          applyBackgroundLayerPatch(layer as any, patch as any, "user");
          return;
        }
      } finally {
        inspector?.refreshStatus();
      }
    },
  });

  inspector.refreshStatus();

  const backgroundMixerUi = createBackgroundMixerUiController({
    dom: { bgTypeSelect, bgVariantSelect },
    cameraLayer,
    getState: () => buildCurrentVisualState(),
    isSecureContext: () => window.isSecureContext,
    setStatusExtraTransient: setInspectorStatusExtraTransient,
    refreshCameraDevices: () => {
      void populateVideoInputDevices(cameraDeviceSelect);
    },
    applyBackgroundLayerPatch,
    applyBackgroundTypePatch,
  });
  backgroundMixerUi.bind();
  backgroundMixerUi.syncToggles();

  const bankTargets: MidiBindingTarget[] = [
    { kind: "macro", key: "fusion" },
    { kind: "macro", key: "motion" },
    { kind: "macro", key: "sparkle" },
    { kind: "slot", slotId: "aivj-m4" },
    { kind: "slot", slotId: "aivj-m5" },
    { kind: "slot", slotId: "aivj-m6" },
    { kind: "slot", slotId: "aivj-m7" },
    { kind: "slot", slotId: "aivj-m8" },
  ];

  const recomputeMidiLock = (bindings: MidiBinding[]) => {
    midiLock = bankTargets.every((t) =>
      bindings.some((b) => sameTarget(b.target, t))
    );
    updateMacroBankPill();
    updateAivjPill();
  };

  const setMacroValue01 = (
    key: "fusion" | "motion" | "sparkle",
    value01: number
  ) => {
    setMacroValue(key, value01);
    // Keep Inspector + saved state consistent.
    lastVisualState = buildCurrentVisualState();
  };

  const setSlotValue01 = (slotId: string, value01: number) => {
    updateMacroSlot(slotId, { value: clamp01Local(value01, 0.5) });
    macroSlotsController?.render();
    lastVisualState = buildCurrentVisualState();
  };

  const applyProjectMBlendPatch = (patch: Record<string, unknown>) => {
    const current = projectLayer.getBlendParams();
    const nextBlendMode = (patch.blendMode ?? current.blendMode) as any;
    sceneManager.setCompositorBlendMode(nextBlendMode);

    lastVisualState = visualStateController.applyPatch(
      buildCurrentVisualState(),
      {
        projectm: {
          opacity: patch.opacity,
          blendMode: nextBlendMode,
          audioDrivenOpacity: (patch as any).audioDrivenOpacity,
          energyToOpacityAmount: patch.energyToOpacityAmount,
        } as any,
      }
    );

    syncBlendControlsFromLayer();
  };

  midiController = initMidiController({
    dom: {
      status: midiStatus,
      bindingsCount: midiBindingsCount,
      connectButton: midiConnectButton,
      targetSelect: midiTargetSelect,
      learnButton: midiLearnButton,
      unbindButton: midiUnbindButton,
      clearButton: midiClearButton,
      bindingLabel: midiBindingLabel,
    },
    storage: localStorage,
    includeCamera: Boolean(cameraLayer),
    getMacroSlots: () =>
      (lastVisualState.global.macroSlots ?? []).map((s) => ({
        id: s.id,
        label: s.label,
      })),
    autoMap: {
      enabled: true,
      getTargets: () => bankTargets,
    },
    projectmBlendDefs: paramSchema.projectm.blend,
    getBackgroundParamDefs: (type) =>
      (paramSchema.background as any)?.[type] ?? ([] as const),
    setMacroValue01,
    setSlotValue01,
    applyProjectMBlendPatch,
    applyBackgroundLayerPatch: (type, patch) => {
      applyBackgroundLayerPatch(type as any, patch, "user");
    },
    onParamPatched: () => {
      inspector?.refreshStatus();
    },
    setInspectorStatusExtraTransient,
    onBindingsChanged: (bindings) => {
      recomputeMidiLock(bindings);
      setInspectorStatusExtraTransient(
        `midi bindings: ${bindings.length}`,
        2000
      );
    },
    audioControlsDefs: paramSchema.audio.controls,
    audioBeatTempoDefs: paramSchema.audio.beatTempo,
    applyAudioControlsPatch: (patch) => applyAudioControlsPatch(patch as any),
    applyBeatTempoPatch: (patch) => {
      beatTempo.setConfig(patch as any);
      if (Object.prototype.hasOwnProperty.call(patch, "enabled")) {
        const enabled = Boolean((patch as any).enabled);
        if (dom.beatTempoToggle) dom.beatTempoToggle.checked = enabled;
      }
    },
  });
  recomputeMidiLock(midiController.getBindings());
  const DIAGNOSTICS_THROTTLE_MS = 500;
  let lastDiagnosticsUpdate = 0;

  // Toolbar waveform rendering (purely visual).
  const waveformCanvas = dom.audioWaveform;
  const waveformCtx = waveformCanvas?.getContext?.("2d") ?? null;
  let waveformLastDrawMs = 0;

  const cameraEdgeToPmInput = dom.cameraEdgeToPmInput;
  const cameraEdgeToPmText = dom.cameraEdgeToPmText;
  let cameraEdgeToPmAmount01 = 0;

  // Spatial ("3D") signal pipeline: portrait segmentation + depth presence.
  // Runtime-only: we do NOT write back to UI inputs or persisted visual state.
  let spatialLastMs =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  let portraitEdge01Smoothed = 0;
  let portraitArea01Smoothed = 0;
  let depthFresh01Smoothed = 0;
  let depthLastFramesSeen = 0;
  let depthLastFrameMs = 0;
  let depthRuntimeLastApplyMs = 0;
  let depthRuntimeLast: {
    opacity: number;
    fog: number;
    edge: number;
    blur: number;
    layers: number;
    scale: number;
    fps: number;
  } | null = null;
  let depthCouplingFog01 = 0;
  let depthCouplingEdge01 = 0;
  let depthCouplingWave01 = 0;
  let depthCouplingBpmRatio = 1;
  let depthCouplingBpmLayersBoost = 0;
  let pmAvgLuma01 = 0;
  let pmEnergyDepthBoost = 0;
  let pmEnergyDepthBoostBg = 0;

  const clamp01Runtime = (v: number, fallback = 0) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  };

  const clampRuntime = (v: number, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  };

  // Beat-driven intensity: when tempo is stable/confident, we increase the
  // strength of audio-reactive visuals (without modifying saved params).
  let beatQuality01Smoothed = 0;
  let beatQualityLastMs =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  let beatBpmSmoothed = 0;
  let beatBpmLastMs =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  // Scene classifier (ambient/techno/rock) + auto-director cues (runtime-only).
  let sceneLabel: "ambient" | "techno" | "rock" = "ambient";
  let sceneScores = { ambient: 0.4, techno: 0.3, rock: 0.3 };
  let sceneMacroBias = { fusion: 0, motion: 0, sparkle: 0 };
  let sceneLastUpdateMs =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  let sceneLastSwitchMs = 0;
  let scenePortraitFocus01 = 0;
  let sceneDepthWeightMul = 1;
  let autoPresetEnergyFast = 0;
  let autoPresetEnergySlow = 0;
  let autoPresetEnergyLastMs =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  let autoPresetLastMs = 0;
  let autoBgPresetLastMs = 0;
  let autoPresetScene: "ambient" | "techno" | "rock" = sceneLabel;
  let autoVariantLastMs = 0;
  let beatBpmUi = 0;

  const getCss = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const waveformColors = {
    bg: getCss("--nw-surface-strong") || "rgba(0,0,0,0)",
    line: getCss("--nw-text-primary") || "rgba(255,255,255,0.85)",
    grid: getCss("--nw-border") || "rgba(255,255,255,0.18)",
  };

  function resizeWaveformCanvas() {
    if (!waveformCanvas || !waveformCtx) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, waveformCanvas.clientWidth);
    const h = Math.max(1, waveformCanvas.clientHeight);
    const nextW = Math.floor(w * dpr);
    const nextH = Math.floor(h * dpr);
    if (waveformCanvas.width !== nextW) waveformCanvas.width = nextW;
    if (waveformCanvas.height !== nextH) waveformCanvas.height = nextH;
    waveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawWaveform(pcm: Float32Array) {
    if (!waveformCanvas || !waveformCtx) return;
    const now = performance.now();
    // Throttle to ~30fps to keep UI light.
    if (now - waveformLastDrawMs < 33) return;
    waveformLastDrawMs = now;

    resizeWaveformCanvas();

    const w = Math.max(1, waveformCanvas.clientWidth);
    const h = Math.max(1, waveformCanvas.clientHeight);
    const midY = h * 0.5;

    waveformCtx.clearRect(0, 0, w, h);
    if (waveformColors.bg && waveformColors.bg !== "rgba(0,0,0,0)") {
      waveformCtx.fillStyle = waveformColors.bg;
      waveformCtx.fillRect(0, 0, w, h);
    }

    waveformCtx.strokeStyle = waveformColors.grid;
    waveformCtx.lineWidth = 1;
    waveformCtx.beginPath();
    waveformCtx.moveTo(0, midY);
    waveformCtx.lineTo(w, midY);
    waveformCtx.stroke();

    if (!pcm || pcm.length === 0) return;

    waveformCtx.strokeStyle = waveformColors.line;
    waveformCtx.lineWidth = 1.25;
    waveformCtx.beginPath();

    const len = pcm.length;
    let maxAbs = 0;
    for (let i = 0; i < len; i++) {
      const v = pcm[i] ?? 0;
      const a = Math.abs(v);
      if (a > maxAbs) maxAbs = a;
    }

    for (let x = 0; x < w; x++) {
      const idx = Math.min(len - 1, Math.floor((x / Math.max(1, w - 1)) * len));
      const v = pcm[idx] ?? 0;
      const vv = Math.max(-1, Math.min(1, v));
      const y = midY - vv * (h * 0.78);
      if (x === 0) waveformCtx.moveTo(x, y);
      else waveformCtx.lineTo(x, y);
    }
    waveformCtx.stroke();
  }

  trackBootstrapDispose(listen(window, "resize", resizeWaveformCanvas));
  resizeWaveformCanvas();

  function syncBlendControlsFromLayer() {
    const blend = projectLayer.getBlendParams();
    if (pmOpacityInput) pmOpacityInput.value = blend.opacity.toFixed(2);
    if (pmOpacityText)
      pmOpacityText.textContent = `${Math.round(blend.opacity * 100)}%`;
    if (pmBlendModeSelect) pmBlendModeSelect.value = blend.blendMode;
    if (pmAudioOpacityToggle)
      pmAudioOpacityToggle.checked = blend.audioDrivenOpacity;
    if (pmEnergyOpacityInput)
      pmEnergyOpacityInput.value = String(blend.energyToOpacityAmount);
    if (pmEnergyOpacityText)
      pmEnergyOpacityText.textContent = `${Math.round(
        blend.energyToOpacityAmount * 100
      )}%`;
  }

  function applyBlendControlsToLayer() {
    // Human > AI > runtime: user blend controls must stay stable.
    // Claim macro write ownership so runtime macro writer won't fight these sliders.
    try {
      noteHumanMacroOwnership(
        typeof performance !== "undefined" ? performance.now() : Date.now()
      );
      notePmMacroHold();
      noteProjectmVisibilityHold();
    } catch {
      // ignore
    }

    const rawOpacity = Number(pmOpacityInput?.value ?? 0.7);
    const opacity = Math.min(
      1,
      Math.max(0, Number.isFinite(rawOpacity) ? rawOpacity : 0.8)
    );
    if (pmOpacityText)
      pmOpacityText.textContent = `${Math.round(opacity * 100)}%`;
    const blendMode = (pmBlendModeSelect?.value ?? "add") as BlendMode;
    const audioDrivenOpacity = Boolean(pmAudioOpacityToggle?.checked);
    const rawAmount = Number(pmEnergyOpacityInput?.value ?? 0.25);
    const energyToOpacityAmount = Math.min(
      1,
      Math.max(0, Number.isFinite(rawAmount) ? rawAmount : 0.3)
    );
    if (pmEnergyOpacityText)
      pmEnergyOpacityText.textContent = `${Math.round(
        energyToOpacityAmount * 100
      )}%`;

    // Keep compositor blend mode consistent with toolbar state.
    // (Snapshots/Inspector already do this; toolbar path should too.)
    sceneManager.setCompositorBlendMode(blendMode);

    projectLayer.setBlendParams({
      opacity,
      blendMode,
      audioDrivenOpacity,
      energyToOpacityAmount,
    });

    lastVisualState = buildCurrentVisualState();
  }

  function nudgeProjectMOpacityForBackgroundVisibility() {
    if (!pmOpacityInput) return;
    const rawOpacity = Number(pmOpacityInput.value);
    if (!Number.isFinite(rawOpacity)) return;
    // If ProjectM is fully opaque, background layers (camera/video/depth) can look
    // like they "don't work". Nudge opacity once when a background layer is enabled.
    if (rawOpacity >= 0.98) {
      pmOpacityInput.value = "0.85";
      applyBlendControlsToLayer();
    }
  }

  function updateFavoriteCountLabel() {
    if (!visualFavoriteCount) return;
    favoritesController.refreshCountLabel();
  }

  function applyVisualStateSnapshot(
    state: VisualStateV2,
    origin: string,
    label: string | null,
    brokenId: string,
    opts?: { forcePresetLoad?: boolean }
  ) {
    lastVisualState = ensureAivjMacroBankSlots(cloneVisualState(state));

    // --- ProjectM blend ---
    sceneManager.setCompositorBlendMode(lastVisualState.projectm.blendMode);
    projectLayer.setBlendParams({
      opacity: lastVisualState.projectm.opacity,
      blendMode: lastVisualState.projectm.blendMode,
      audioDrivenOpacity: lastVisualState.projectm.audioDrivenOpacity,
      energyToOpacityAmount: lastVisualState.projectm.energyToOpacityAmount,
    });
    syncBlendControlsFromLayer();

    // --- Background layers ---
    const layers = lastVisualState.background.layers;
    const liquidParams = (layers?.liquid ??
      lastVisualState.background.params) as any;
    if (liquidParams) {
      applyBackgroundLayerPatch(
        "liquid",
        {
          ...liquidParams,
          enabled: Boolean(liquidParams.enabled ?? true),
        },
        "user"
      );
    }

    const basicParams = (layers?.basic ?? {}) as any;
    applyBackgroundLayerPatch(
      "basic",
      { ...basicParams, enabled: Boolean(basicParams.enabled) },
      "user"
    );
    if (basicOpacityInput && basicParams.opacity != null) {
      basicOpacityInput.value = String(basicParams.opacity);
      if (basicOpacityText)
        basicOpacityText.textContent = fmtPct(Number(basicOpacityInput.value));
    }

    const camParams = (layers?.camera ?? {}) as any;
    applyBackgroundLayerPatch(
      "camera",
      { ...camParams, enabled: Boolean(camParams.enabled) },
      "user"
    );
    if (cameraOpacityInput && camParams.opacity != null) {
      cameraOpacityInput.value = String(camParams.opacity);
      if (cameraOpacityText)
        cameraOpacityText.textContent = fmtPct(
          Number(cameraOpacityInput.value)
        );
    }
    if (cameraDeviceSelect && camParams.deviceId != null) {
      cameraDeviceSelect.value = String(camParams.deviceId);
    }
    if (cameraSegmentToggle && camParams.segmentPerson != null) {
      cameraSegmentToggle.checked = Boolean(camParams.segmentPerson);
    }

    const vidParams = (layers?.video ?? {}) as any;
    applyBackgroundLayerPatch(
      "video",
      { ...vidParams, enabled: Boolean(vidParams.enabled) },
      "user"
    );
    if (videoOpacityInput && vidParams.opacity != null) {
      videoOpacityInput.value = String(vidParams.opacity);
      if (videoOpacityText)
        videoOpacityText.textContent = fmtPct(Number(videoOpacityInput.value));
    }
    if (videoSrcInput && vidParams.src != null) {
      videoSrcInput.value = String(vidParams.src);
      if (videoSrcHint)
        videoSrcHint.textContent = vidParams.src ? "src set" : "";
    }

    const depParams = (layers?.depth ?? {}) as any;
    applyBackgroundLayerPatch(
      "depth",
      { ...depParams, enabled: Boolean(depParams.enabled) },
      "user"
    );
    if (depthSourceSelect && depParams.source != null)
      depthSourceSelect.value = String(depParams.source);
    if (depthDeviceSelect && depParams.deviceId != null)
      depthDeviceSelect.value = String(depParams.deviceId);
    if (depthShowDepthToggle && depParams.showDepth != null)
      depthShowDepthToggle.checked = Boolean(depParams.showDepth);
    if (depthOpacityInput && depParams.opacity != null) {
      depthOpacityInput.value = String(depParams.opacity);
      if (depthOpacityText)
        depthOpacityText.textContent = fmtPct(Number(depthOpacityInput.value));
    }
    if (depthFogInput && depParams.fog != null) {
      depthFogInput.value = String(depParams.fog);
      if (depthFogText)
        depthFogText.textContent = Number(depthFogInput.value).toFixed(2);
    }
    if (depthEdgeInput && depParams.edge != null) {
      depthEdgeInput.value = String(depParams.edge);
      if (depthEdgeText)
        depthEdgeText.textContent = Number(depthEdgeInput.value).toFixed(2);
    }
    if (depthLayersInput && depParams.layers != null) {
      depthLayersInput.value = String(depParams.layers);
      if (depthLayersText)
        depthLayersText.textContent = String(
          Math.round(Number(depthLayersInput.value))
        );
    }
    if (depthBlurInput && depParams.blur != null) {
      depthBlurInput.value = String(depParams.blur);
      if (depthBlurText)
        depthBlurText.textContent = String(
          Math.round(Number(depthBlurInput.value))
        );
    }

    refreshBackgroundUiEnabledState();

    // Focus type (for inspector and bgTypeSelect).
    applyBackgroundTypePatch(lastVisualState.background.type);

    // --- Macros UI ---
    syncMacroUiFromState();
    macroSlotsController?.render();
    updateMacroBankPill();

    // --- Preset ---
    const preset = lastVisualState.projectm.presetId
      ? findPresetById(lastVisualState.projectm.presetId)
      : null;
    const targetPresetId = lastVisualState.projectm.presetId ?? null;
    const targetPresetUrl =
      lastVisualState.projectm.presetUrl || preset?.url || null;

    if (presetHold && !opts?.forcePresetLoad) {
      setPresetStatus("HOLD: preset locked");
      return;
    }

    if (projectLayerReady && targetPresetUrl) {
      const holdNote = presetHold ? " (HOLD bypass)" : "";
      setPresetStatus(
        `Loading ${origin}${holdNote}: ${label ?? targetPresetUrl} ...`
      );
      if (presetLoadInFlight) {
        setPresetStatus("Preset switch in progress…");
        return;
      }
      if (!opts?.forcePresetLoad) {
        const gate = requestPresetSwitch(`snapshot:${origin}`);
        if (!gate.ok) {
          const reasonText = gate.reasons.length
            ? gate.reasons.join(",")
            : "gate";
          setPresetStatus(`${origin} blocked (${reasonText})`);
          return;
        }
      }
      void (async () => {
        const nowMs = () =>
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const loadStartMs = nowMs();
        const framesBefore = tryReadFramesRendered();
        const rebuildBefore = (() => {
          try {
            return projectLayer.getRebuildStatus();
          } catch {
            return undefined;
          }
        })();
        try {
          presetLoadInFlight = true;
          updatePresetCyclerAvailability();
          ensureProjectLayerReady();
          const cacheResult = await loadPresetUrlMaybeCached(
            projectLayer,
            targetPresetUrl,
            `snapshot:${origin}`
          );
          const prevPresetId = currentPresetId; // 记录切换前
          currentPresetId = targetPresetId;
          currentPresetUrl = targetPresetUrl;
          recordPresetTransition(prevPresetId, targetPresetId); // 记录转移
          recordPresetSuccess(preset ?? findPresetById(targetPresetId ?? ""));
          if (targetPresetId) {
            recordPresetLoadSuccess(targetPresetId, nowMs() - loadStartMs);
          }
          applyProjectMPresetTuningToRuntime("presetLoaded");
          if (targetPresetId && findPresetById(targetPresetId)) {
            updatePresetSelectValue(targetPresetId);
          }
          setPresetStatus(`Preset: ${label ?? targetPresetUrl}`);
          if (targetPresetId) {
            queuePresetPrefetchAround(targetPresetId, 2, `snapshot:${origin}`);
          }

          const tEnd = nowMs();
          const report: PresetSwitchReport = {
            scope: "fg",
            origin: `snapshot:${origin}`,
            presetId: targetPresetId,
            presetUrl: targetPresetUrl,
            presetLabel: label,
            tStartMs: loadStartMs,
            tEndMs: tEnd,
            durationMs: Math.max(0, tEnd - loadStartMs),
            loadMs: Math.max(0, tEnd - loadStartMs),
            cache: cacheResult?.cache === "hit" ? "hit" : "miss",
            framesBefore: framesBefore ?? undefined,
            rebuildBefore,
            rebuildAfter: (() => {
              try {
                return projectLayer.getRebuildStatus();
              } catch {
                return undefined;
              }
            })(),
            outcome: "success",
          };
          pushPresetSwitchReport(report);
          void updatePresetSwitchFirstFrame(report);
        } catch (error) {
          const compatNote = getCompatNote(preset ?? null);
          const targetLabel = label ?? targetPresetUrl ?? "preset";
          const reason =
            error instanceof Error ? error.message : String(error ?? "").trim();
          const reasonNote = reason ? ` | ${reason}` : "";
          handlePresetLoadError(
            `Failed to load ${origin}: ${targetLabel}${compatNote}${reasonNote}`,
            error
          );
          const elapsedMs = nowMs() - loadStartMs;
          handlePresetFailure({ id: brokenId }, error, elapsedMs);

          const tEnd = nowMs();
          const report: PresetSwitchReport = {
            scope: "fg",
            origin: `snapshot:${origin}`,
            presetId: targetPresetId,
            presetUrl: targetPresetUrl,
            presetLabel: label,
            tStartMs: loadStartMs,
            tEndMs: tEnd,
            durationMs: Math.max(0, tEnd - loadStartMs),
            cache: "na",
            framesBefore: framesBefore ?? undefined,
            rebuildBefore,
            rebuildAfter: (() => {
              try {
                return projectLayer.getRebuildStatus();
              } catch {
                return undefined;
              }
            })(),
            outcome: "error",
            errorText: getPresetErrorText(error),
          };
          pushPresetSwitchReport(report);
        } finally {
          presetLoadInFlight = false;
          updatePresetCyclerAvailability();
          flushPendingPresetRequests();
        }
      })();
    } else {
      currentPresetId = targetPresetId;
      currentPresetUrl = targetPresetUrl;
    }
  }

  function applyFavoriteVisualState(fav: FavoriteVisualState) {
    applyVisualStateSnapshot(
      fav.state,
      "Favorite",
      fav.label,
      `fav:${fav.id}`,
      {
        forcePresetLoad: true,
      }
    );
  }

  initShowConfigController({
    storage: localStorage,
    storageKey: "newliveweb:showConfig:v1",
    showSaveButton,
    showSetupButton,
    inputDeviceSelect: dom.audioInputDeviceSelect,
    volumeSlider: dom.audioVolumeInput,
    getAudioController: () => audioTransport,
    buildCurrentVisualState: () => buildCurrentVisualState(),
    applyVisualStateSnapshot,
    applyBackgroundTypePatch: (type) => applyBackgroundTypePatch(type),
    hasCameraLayer: () => Boolean(cameraLayer),
    setInspectorStatusExtraTransient,
  });

  trackBootstrapDispose(
    listen(fullscreenToggleButton, "click", () => {
      void (async () => {
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
            captureColorSnapshot(
              "fullscreenExit",
              typeof performance !== "undefined"
                ? performance.now()
                : Date.now()
            );
            return;
          }
          const target = dom.canvasRoot ?? document.documentElement;
          await (target as any).requestFullscreen?.();
          captureColorSnapshot(
            "fullscreenEnter",
            typeof performance !== "undefined" ? performance.now() : Date.now()
          );
        } catch {
          // ignore
        }
      })();
    })
  );

  trackBootstrapDispose(
    listen(calibrationToggleButton, "click", () => {
      setCalibrationOverlayEnabled(
        !calibrationOverlayEnabled,
        "calibrationToggle"
      );
    })
  );
  trackBootstrapDispose(
    listen(snapshotExportButton, "click", () => {
      exportRuntimeSnapshot("toolbar");
    })
  );

  // Favorites panel UI is handled by src/features/favorites/FavoritesPanel.ts

  const AUTO_INTERVAL_DEFAULT = 90;
  const AUTO_INTERVAL_MIN = 15;
  const AUTO_INTERVAL_MAX = 600;
  const PRESET_LOAD_SLOW_MS = 1000;
  type PresetManifest = {
    sourcePath?: string;
    generatedAt?: string;
    presets?: PresetDescriptor[];
  };

  const disablePresetControls = () => {
    presetControls.forEach((control) => {
      if (!control) return;
      control.disabled = true;
    });
  };

  const enablePresetControls = () => {
    presetControls.forEach((control) => {
      if (!control) return;
      control.disabled = false;
    });
    updatePresetCyclerAvailability();
  };

  const refreshPresetSelect = () => {
    if (!presetSelect) return;
    const presets = getAllPresets();
    if (!presets.length) {
      presetSelect.innerHTML =
        "<option disabled selected>No presets available</option>";
      presetSelect.disabled = true;
      return;
    }

    const hasCurrent = currentPresetId
      ? presets.some((preset) => preset.id === currentPresetId)
      : false;
    if (!hasCurrent) {
      currentPresetId = presets[0]?.id ?? null;
    }

    presetSelect.disabled = false;
    presetSelect.innerHTML = presets
      .map((preset) => `<option value="${preset.id}">${preset.label}</option>`)
      .join("");
    updatePresetSelectValue(currentPresetId);
  };

  const updatePresetManifestInfo = (message: string, isError = false) => {
    if (!presetManifestInfo) return;
    presetManifestInfo.textContent = message;
    presetManifestInfo.dataset.state = isError ? "error" : "ok";
  };

  const setLibrarySelectValue = (source: PresetLibrarySource) => {
    if (!presetLibrarySelect) return;
    presetLibrarySelect.value = source;
  };

  const getInitialLibrarySource = (): PresetLibrarySource => {
    try {
      const stored = localStorage.getItem("presetLibrarySource");
      if (stored && PRESET_LIBRARIES.some((lib) => lib.id === stored)) {
        return stored as PresetLibrarySource;
      }
    } catch {
      // Ignore storage errors and fall back to default
    }
    return DEFAULT_LIBRARY_SOURCE;
  };

  const persistLibrarySource = (source: PresetLibrarySource) => {
    try {
      localStorage.setItem("presetLibrarySource", source);
    } catch {
      // Non-fatal if storage is unavailable
    }
  };

  async function loadPresetManifestFromDiskLegacy() {
    try {
      const response = await fetch("/presets/library-manifest.json", {
        cache: "no-cache",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const manifest = (await response.json()) as PresetManifest;
      const presets = manifest.presets ?? [];
      runtimePresetList = presets;
      runtimePresetList = presets;
      runtimePresetList = presets;
      registerRuntimePresets(presets);
      refreshPresetSelect();
      updatePresetCyclerAvailability();
      if (presets.length) {
        updatePresetManifestInfo(
          `Loaded ${presets.length} presets - ${
            manifest.sourcePath ?? "custom pack"
          }`
        );
      } else {
        updatePresetManifestInfo("Preset manifest has 0 entries");
      }
      void seedExtraSafePresetsIfNeeded(currentLibrarySource);
    } catch (error) {
      console.warn("Preset manifest unavailable", error);
      // Fallback to built-ins so the preset UI remains usable even if the manifest is missing.
      runtimePresetList = BUILT_IN_PRESETS;
      registerRuntimePresets(BUILT_IN_PRESETS);
      refreshPresetSelect();
      updatePresetCyclerAvailability();
      updatePresetManifestInfo(
        `Preset manifest missing - using built-ins (run npm run sync:presets for full packs)`,
        true
      );
    }
  }

  async function loadPresetManifestFromDisk() {
    try {
      const manifest = await loadLibraryManifest();
      const presets = mapManifestToPresetDescriptors(manifest);
      registerRuntimePresets(presets);
      refreshPresetSelect();
      updatePresetCyclerAvailability();
      if (presets.length) {
        updatePresetManifestInfo(
          `Loaded ${presets.length} presets - ${
            manifest.sourceRoot ?? "custom pack"
          }`
        );
      } else {
        updatePresetManifestInfo("Preset manifest has 0 entries");
      }
      void seedExtraSafePresetsIfNeeded(currentLibrarySource);
    } catch (error) {
      console.warn("Preset manifest unavailable", error);
      runtimePresetList = BUILT_IN_PRESETS;
      registerRuntimePresets(BUILT_IN_PRESETS);
      refreshPresetSelect();
      updatePresetCyclerAvailability();
      updatePresetManifestInfo(
        `Preset manifest missing - using built-ins (run npm run sync:presets for full packs)`,
        true
      );
    }
  }

  async function loadPresetManifestForSource(source: PresetLibrarySource) {
    const { manifestUrl, label, requireWasmSafe } = getLibraryConfig(source);
    try {
      extraSafePresetSeeded = false;
      updatePresetManifestInfo(`Loading ${label} manifest...`);
      const manifest = await loadLibraryManifest(manifestUrl, {
        requireWasmSafe,
      });
      const presets = mapManifestToPresetDescriptors(manifest);
      registerRuntimePresets(presets);
      refreshPresetSelect();
      updatePresetCyclerAvailability();
      const filteredOut = manifest.filteredOutByWasmCompat ?? 0;
      const filteredInfo =
        filteredOut > 0 ? ` (filtered ${filteredOut} by wasmCompat)` : "";
      if (presets.length) {
        updatePresetManifestInfo(
          `Loaded ${presets.length} presets | ${label}${filteredInfo} | ${
            manifest.sourceRoot ?? "custom pack"
          }`
        );
      } else {
        updatePresetManifestInfo(`Preset manifest has 0 entries | ${label}`);
      }

      void seedExtraSafePresetsIfNeeded(source);
      const hasCurrent = currentPresetId
        ? findPresetById(currentPresetId)
        : null;
      if (!hasCurrent) {
        currentPresetId = getAllPresets()[0]?.id ?? null;
        updatePresetSelectValue(currentPresetId);
      }

      const initialPreset = currentPresetId
        ? findPresetById(currentPresetId)
        : null;
      setPresetStatus(
        initialPreset ? `Preset: ${initialPreset.label}` : "Preset ready"
      );
    } catch (error) {
      console.warn("Preset manifest unavailable", error);
      runtimePresetList = BUILT_IN_PRESETS;
      registerRuntimePresets(BUILT_IN_PRESETS);
      refreshPresetSelect();
      updatePresetCyclerAvailability();
      updatePresetManifestInfo(
        `Preset manifest missing - ${label} (using built-ins)`,
        true
      );
    }
  }

  const reloadLibraryPresets = async (source: PresetLibrarySource) => {
    currentLibrarySource = source;
    persistLibrarySource(source);
    setLibrarySelectValue(source);
    stopAutoCycle("Auto-cycle paused by library change");
    resetPresetPrefetch();
    currentPresetId = null;
    currentPresetUrl = null;
    await loadPresetManifestForSource(source);
  };

  const setPresetStatus = (message: string, isError = false) => {
    if (!presetStatus) return;
    presetStatus.textContent = message;
    presetStatus.dataset.state = isError ? "error" : "ok";
  };

  const handlePresetLoadError = (message: string, error: unknown) => {
    const errorText = (() => {
      try {
        const e = error as any;
        if (typeof e?.message === "string") return e.message;
        return String(error);
      } catch {
        return "";
      }
    })();

    // Some ProjectM presets can trigger a WASM abort due to exception handling
    // being disabled in the current build. This is recoverable (we rebuild the
    // engine), so keep it as a warning to avoid failing headless verify.
    const looksLikeWasmAbort =
      errorText.includes("Aborted(") &&
      errorText.includes("exception catching is not enabled");

    if (looksLikeWasmAbort) {
      console.warn(message, error);
    } else {
      console.error(message, error);
    }
    setPresetStatus(message, true);
  };

  const loadPresetById = async (presetId: string, origin: string) => {
    if (!projectLayerReady) return;
    if (presetHold) {
      setPresetStatus("HOLD: preset locked");
      updatePresetSelectValue(currentPresetId);
      return;
    }
    if (presetLoadInFlight) {
      pendingPresetSelectId = presetId;
      setPresetStatus("Preset queued…");
      updatePresetSelectValue(currentPresetId);
      return;
    }
    const gate = requestPresetSwitch(origin);
    if (!gate.ok) {
      const reasonText = gate.reasons.length ? gate.reasons.join(",") : "gate";
      setPresetStatus(`Preset blocked (${reasonText})`);
      updatePresetSelectValue(currentPresetId);
      return;
    }
    const preset = findPresetById(presetId);
    if (!preset) {
      setPresetStatus("Preset not found in manifest", true);
      updatePresetSelectValue(currentPresetId);
      return;
    }
    setPresetStatus(`Loading: ${preset.label} ...`);
    const loadStartMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const framesBefore = tryReadFramesRendered();
    const rebuildBefore = (() => {
      try {
        return projectLayer.getRebuildStatus();
      } catch {
        return undefined;
      }
    })();
    presetLoadInFlight = true;
    updatePresetCyclerAvailability();
    try {
      ensureProjectLayerReady();
      const cacheResult = await loadPresetMaybeCached(
        projectLayer,
        preset,
        origin
      );
      const prevPresetId = currentPresetId; // 记录切换前
      currentPresetId = preset.id;
      currentPresetUrl = preset.url;
      recordPresetTransition(prevPresetId, preset.id); // 记录转移
      recordPresetSuccess(preset);
      recordPresetLoadSuccess(preset.id, performance.now() - loadStartMs);
      applyProjectMPresetTuningToRuntime("presetLoaded");
      updatePresetSelectValue(preset.id);
      setPresetStatus(`Preset: ${preset.label}`);
      armProjectMMotionWatch("manual");
      queuePresetPrefetchAround(preset.id, 2, `select:${origin}`);
      if (presetAutoToggle?.checked) {
        scheduleAutoCycle();
      }

      const tEnd =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const report: PresetSwitchReport = {
        scope: "fg",
        origin: `select:${origin}`,
        presetId: preset.id,
        presetUrl: preset.url,
        presetLabel: preset.label,
        tStartMs: loadStartMs,
        tEndMs: tEnd,
        durationMs: Math.max(0, tEnd - loadStartMs),
        loadMs: Math.max(0, tEnd - loadStartMs),
        cache: cacheResult?.cache === "hit" ? "hit" : "miss",
        framesBefore: framesBefore ?? undefined,
        rebuildBefore,
        rebuildAfter: (() => {
          try {
            return projectLayer.getRebuildStatus();
          } catch {
            return undefined;
          }
        })(),
        outcome: "success",
      };
      pushPresetSwitchReport(report);
      void updatePresetSwitchFirstFrame(report);
    } catch (error) {
      const elapsedMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        loadStartMs;
      const compatNote = getCompatNote(preset);
      handlePresetLoadError(`Failed to load preset${compatNote}`, error);
      handlePresetFailure(preset, error, elapsedMs);

      const tEnd =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const report: PresetSwitchReport = {
        scope: "fg",
        origin: `select:${origin}`,
        presetId: preset.id,
        presetUrl: preset.url,
        presetLabel: preset.label,
        tStartMs: loadStartMs,
        tEndMs: tEnd,
        durationMs: Math.max(0, tEnd - loadStartMs),
        cache: "na",
        framesBefore: framesBefore ?? undefined,
        rebuildBefore,
        rebuildAfter: (() => {
          try {
            return projectLayer.getRebuildStatus();
          } catch {
            return undefined;
          }
        })(),
        outcome: "error",
        errorText: getPresetErrorText(error),
      };
      pushPresetSwitchReport(report);
    } finally {
      presetLoadInFlight = false;
      updatePresetCyclerAvailability();
      flushPendingPresetRequests();
    }
  };

  const flushPendingPresetRequests = () => {
    if (presetLoadInFlight) return;
    if (pendingPresetSelectId) {
      const queued = pendingPresetSelectId;
      pendingPresetSelectId = null;
      setTimeout(() => {
        void loadPresetById(queued, "select-queued");
      }, 0);
      return;
    }
    if (pendingCycleOrigin) {
      const queued = pendingCycleOrigin;
      pendingCycleOrigin = null;
      setTimeout(() => {
        requestPresetCycle(queued);
      }, 0);
    }
  };

  const getPresetErrorText = (error: unknown) => {
    try {
      const e = error as any;
      if (typeof e?.message === "string") return e.message;
      return String(error);
    } catch {
      return "";
    }
  };

  const classifyPresetFailure = (
    error: unknown,
    elapsedMs: number
  ): "hard" | "soft" => {
    const msg = getPresetErrorText(error);
    const looksLikeWasmAbort =
      msg.includes("Aborted(") &&
      msg.includes("exception catching is not enabled");
    if (looksLikeWasmAbort) return "hard";
    if (Number.isFinite(elapsedMs) && elapsedMs > PRESET_LOAD_SLOW_MS)
      return "soft";
    if (
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("404") ||
      msg.includes("timeout")
    ) {
      return "soft";
    }
    return "soft";
  };

  const recordPresetLoadSuccess = (presetId: string, elapsedMs: number) => {
    if (!presetId) return;
    presetFailStreak = 0;
    const safeMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    presetLoadTotalCount += 1;
    presetLoadTotalMs += safeMs;
    const existing = presetLoadStatsById.get(presetId) ?? {
      count: 0,
      totalMs: 0,
    };
    existing.count += 1;
    existing.totalMs += safeMs;
    presetLoadStatsById.set(presetId, existing);
  };

  const recordPresetLoadFailure = (
    presetId: string,
    severity: "hard" | "soft" | "aesthetic"
  ) => {
    if (!presetId) return;
    const existing = presetFailById.get(presetId) ?? {
      hard: 0,
      soft: 0,
      aesthetic: 0,
    };
    if (severity === "hard") existing.hard += 1;
    else if (severity === "aesthetic") existing.aesthetic += 1;
    else existing.soft += 1;
    presetFailById.set(presetId, existing);
    if (severity === "hard") presetHardFailCount += 1;
    else if (severity === "aesthetic") presetAestheticFailCount += 1;
    else presetSoftFailCount += 1;
  };

  const summarizeSoak = () => {
    const avgLoadMs =
      presetLoadTotalCount > 0 ? presetLoadTotalMs / presetLoadTotalCount : 0;
    const hardList = Array.from(presetFailById.entries())
      .filter(([, v]) => v.hard > 0)
      .sort((a, b) => b[1].hard - a[1].hard)
      .slice(0, 10)
      .map(([id, v]) => `${id}(${v.hard})`);
    const softList = Array.from(presetFailById.entries())
      .filter(([, v]) => v.soft > 0)
      .sort((a, b) => b[1].soft - a[1].soft)
      .slice(0, 10)
      .map(([id, v]) => `${id}(${v.soft})`);
    const aestheticList = Array.from(presetFailById.entries())
      .filter(([, v]) => v.aesthetic > 0)
      .sort((a, b) => b[1].aesthetic - a[1].aesthetic)
      .slice(0, 10)
      .map(([id, v]) => `${id}(${v.aesthetic})`);
    return {
      avgLoadMs,
      hardTop: hardList,
      softTop: softList,
      aestheticTop: aestheticList,
    };
  };

  const handlePresetFailure = (
    preset: PresetDescriptor | { id: string } | null | undefined,
    error: unknown,
    elapsedMs: number
  ) => {
    if ((preset as PresetDescriptor | null)?.url) {
      invalidatePresetPrefetch((preset as PresetDescriptor).url);
    }
    const presetId = preset?.id ? String(preset.id) : "";
    const severity = classifyPresetFailure(error, elapsedMs);
    if (severity === "hard" && presetId) {
      markPresetAsBrokenAndRefresh({ id: presetId });
    } else if (presetId) {
      markPresetSoft(presetId);
    }
    if (presetId) recordPresetLoadFailure(presetId, severity);
    presetFailStreak += 1;
    if (severity === "hard" || presetFailStreak >= 3) {
      scheduleAnchorFallback(`fail:${severity}`);
    }
  };

  const getCompatNote = (preset?: PresetDescriptor | null) => {
    if (preset?.wasmCompat?.ok === false) {
      const type = preset.wasmCompat.errorType ?? "unknown";
      const msg = preset.wasmCompat.message ?? "";
      const detail = msg ? `${type} / ${msg}` : type;
      return ` (离线体检: ${detail})`;
    }
    return "";
  };

  const markPresetAsBrokenAndRefresh = (
    preset?: { id: string } | PresetDescriptor | null
  ) => {
    const presetId = preset?.id;
    if (!presetId) return;
    markPresetAsBroken(presetId);
    if (goodPresetIds.has(presetId)) {
      goodPresetIds.delete(presetId);
      persistGoodPresetIds();
    }
    if (currentPresetId === presetId) {
      currentPresetId = null;
      currentPresetUrl = null;
    }
    refreshPresetSelect();
    updatePresetCyclerAvailability();
  };

  const updatePresetSelectValue = (presetId: string | null) => {
    if (!presetSelect) return;
    if (presetId) {
      presetSelect.value = presetId;
    } else {
      presetSelect.selectedIndex = -1;
    }
  };

  const clampAutoInterval = (value: number | null) => {
    if (!Number.isFinite(value)) return AUTO_INTERVAL_DEFAULT;
    return Math.min(
      AUTO_INTERVAL_MAX,
      Math.max(AUTO_INTERVAL_MIN, value ?? AUTO_INTERVAL_DEFAULT)
    );
  };

  const setAutoLabelState = (isOn: boolean) => {
    if (!presetAutoLabel) return;
    presetAutoLabel.textContent = isOn ? "Auto-cycle (on)" : "Auto-cycle";
  };

  const randomInRange = (min: number, max: number) => {
    return min + (max - min) * Math.random();
  };

  const ensureVisibleBaseline = (opts?: {
    allowEnableBackgroundIfAllOff?: boolean;
  }) => {
    const liquidOn = Boolean(layerLiquidToggle?.checked ?? true);
    const basicOn = Boolean(layerBasicToggle?.checked);
    const cameraOn = Boolean(layerCameraToggle?.checked);
    const videoOn = Boolean(layerVideoToggle?.checked);
    const depthOn = Boolean(layerDepthToggle?.checked);
    const anyLayerOn = liquidOn || basicOn || cameraOn || videoOn || depthOn;

    const allowEnableBackground = opts?.allowEnableBackgroundIfAllOff !== false;
    // IMPORTANT: Do not auto-enable Liquid. If we must avoid a blank screen while
    // ProjectM is not ready, prefer enabling Basic (lowest-interference background).
    if (!anyLayerOn && allowEnableBackground && !projectLayer.isReady()) {
      applyBackgroundLayerPatch("basic", { enabled: true, opacity: 1 }, "user");
      if (layerBasicToggle) layerBasicToggle.checked = true;
      refreshBackgroundUiEnabledState();
    }

    const blend = projectLayer.getBlendParams();
    const baseOpacity = Number.isFinite(Number(blend.opacity))
      ? Number(blend.opacity)
      : 0.85;
    const baseEnergy = Number.isFinite(Number(blend.energyToOpacityAmount))
      ? Number(blend.energyToOpacityAmount)
      : 0.3;
    const nextOpacity = Math.max(0.55, baseOpacity);
    const nextEnergy = Math.max(0.12, baseEnergy);
    if (nextOpacity !== baseOpacity || nextEnergy !== baseEnergy) {
      projectLayer.setBlendParams({
        ...blend,
        opacity: nextOpacity,
        energyToOpacityAmount: nextEnergy,
      });
      syncBlendControlsFromLayer();
    }

    // Do not touch liquid params when liquid is explicitly disabled.
    const liquidEnabledNow = Boolean(layerLiquidToggle?.checked ?? true);
    if (liquidEnabledNow) {
      const rawBrightness = Number((liquidLayer.params as any)?.brightness);
      const rawOpacity = Number((liquidLayer.params as any)?.opacity);
      const nextBrightness = Number.isFinite(rawBrightness)
        ? Math.max(0.6, rawBrightness)
        : 1.0;
      const nextLiquidOpacity = Number.isFinite(rawOpacity)
        ? Math.max(0.6, rawOpacity)
        : 1.0;
      if (
        nextBrightness !== rawBrightness ||
        nextLiquidOpacity !== rawOpacity
      ) {
        applyBackgroundLayerPatch(
          "liquid",
          { brightness: nextBrightness, opacity: nextLiquidOpacity },
          "user"
        );
      }
    }
  };

  const armProjectMMotionWatch = (reason: "random" | "manual" | "unknown") => {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    pmMotionWatch.active = true;
    pmMotionWatch.reason = reason;
    pmMotionWatch.presetUrl = currentPresetUrl ?? null;
    pmMotionWatch.startMs = nowMs;
    pmMotionWatch.lastSampleMs = 0;
    pmMotionWatch.lastChangeMs = nowMs;
    pmMotionWatch.lastFramesRendered = 0;
    pmMotionWatch.lastLumaSampleCount = 0;
    pmMotionWatch.lastLuma = 0;
    pmMotionWatch.lastColor = { r: 0, g: 0, b: 0 };
    pmMotionWatch.lumaOutSinceMs = 0;
    pmMotionWatch.attempts = 0;
    pmMotionWatch.inFlight = false;
  };

  const applyRandomVisualState = async () => {
    if (randomVisualInFlight) {
      pendingRandomVisual = true;
      setPresetStatus("Random queued…");
      return;
    }
    randomVisualInFlight = true;
    if (visualRandomButton) visualRandomButton.disabled = true;
    if (visualRandomParamsButton) visualRandomParamsButton.disabled = true;
    const energy = currentEnergyLevel || 0.5;
    const seed = createRandomSeed();
    const rng = createSeededRng(seed);

    const liquidOn = Boolean(layerLiquidToggle?.checked ?? true);
    const basicOn = Boolean(layerBasicToggle?.checked);
    const cameraOn = Boolean(layerCameraToggle?.checked);
    const videoOn = Boolean(layerVideoToggle?.checked);
    const depthOn = Boolean(layerDepthToggle?.checked);
    const anyBackgroundLayerOn =
      liquidOn || basicOn || cameraOn || videoOn || depthOn;

    const backgroundFocus = (lastVisualState.background.type ?? "liquid") as
      | "liquid"
      | "basic"
      | "camera"
      | "video"
      | "depth";

    const presets = getRandomPresetPool(rng);
    const hasPresets = presets.length > 0;
    let loadedPreset: PresetDescriptor | null = null;

    if (!presetHold && projectLayerReady && hasPresets) {
      if (presetLoadInFlight) {
        // IMPORTANT: do not continue doing background random work while a preset
        // switch is in progress — it can pile up and freeze the UI.
        pendingRandomVisual = true;
        setPresetStatus("Preset switching… (random queued)");
        return;
      } else {
        const gate = requestPresetSwitch("random");
        if (!gate.ok) {
          pendingRandomVisual = true;
          const reasonText = gate.reasons.length
            ? gate.reasons.join(",")
            : "gate";
          setPresetStatus(`Random blocked (${reasonText})`);
          return;
        }
        presetLoadInFlight = true;
        updatePresetCyclerAvailability();
        try {
          const currentId = (currentPresetId ?? "").trim();
          const recentCap = 12;
          const exclude = new Set<string>(
            [
              ...(currentId ? [currentId] : []),
              ...recentRandomPresetIds.slice(0, recentCap),
            ].filter(Boolean)
          );

          const poolAll = [...presets];
          const poolPreferred = poolAll.filter((p) => !exclude.has(p.id));
          const maxAttempts = Math.min(10, poolAll.length);

          const pickFrom = (arr: PresetDescriptor[]) => {
            const idx = rng.int(0, arr.length);
            return arr.splice(idx, 1)[0] ?? null;
          };

          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const nowMs = () =>
              typeof performance !== "undefined"
                ? performance.now()
                : Date.now();
            const loadStartMs = nowMs();
            const candidate =
              poolPreferred.length > 0
                ? pickFrom(poolPreferred)
                : pickFrom(poolAll);
            if (!candidate) break;
            setPresetStatus(`Random loading: ${candidate.label} ...`);
            try {
              const framesBefore = tryReadFramesRendered();
              const rebuildBefore = (() => {
                try {
                  return projectLayer.getRebuildStatus();
                } catch {
                  return undefined;
                }
              })();
              ensureProjectLayerReady();
              const cacheResult = await loadPresetMaybeCached(
                projectLayer,
                candidate,
                "random"
              );
              loadedPreset = candidate;
              recordPresetSuccess(candidate);
              recordPresetLoadSuccess(candidate.id, nowMs() - loadStartMs);
              rememberRandomPresetId(candidate.id);
              currentPresetId = candidate.id;
              currentPresetUrl = candidate.url;
              applyProjectMPresetTuningToRuntime("presetLoaded");
              // Random should affect ProjectM behavior without touching blend UI settings.
              randomizeProjectMPresetTuningForActivePreset(
                rng,
                energy,
                "random"
              );
              updatePresetSelectValue(candidate.id);
              setPresetStatus(`Preset: ${candidate.label}`);
              queuePresetPrefetchAround(candidate.id, 2, "random");

              const tEnd = nowMs();
              const report: PresetSwitchReport = {
                scope: "fg",
                origin: "random",
                presetId: candidate.id,
                presetUrl: candidate.url,
                presetLabel: candidate.label,
                tStartMs: loadStartMs,
                tEndMs: tEnd,
                durationMs: Math.max(0, tEnd - loadStartMs),
                loadMs: Math.max(0, tEnd - loadStartMs),
                cache: cacheResult?.cache === "hit" ? "hit" : "miss",
                framesBefore: framesBefore ?? undefined,
                rebuildBefore,
                rebuildAfter: (() => {
                  try {
                    return projectLayer.getRebuildStatus();
                  } catch {
                    return undefined;
                  }
                })(),
                outcome: "success",
              };
              pushPresetSwitchReport(report);
              void updatePresetSwitchFirstFrame(report);
              break;
            } catch (error) {
              const elapsedMs = nowMs() - loadStartMs;
              const compatNote = getCompatNote(candidate);
              handlePresetLoadError(
                `Failed to load preset${compatNote}`,
                error
              );
              handlePresetFailure(candidate, error, elapsedMs);

              const tEnd = nowMs();
              const report: PresetSwitchReport = {
                scope: "fg",
                origin: "random",
                presetId: candidate.id,
                presetUrl: candidate.url,
                presetLabel: candidate.label,
                tStartMs: loadStartMs,
                tEndMs: tEnd,
                durationMs: Math.max(0, tEnd - loadStartMs),
                cache: "na",
                framesBefore: tryReadFramesRendered() ?? undefined,
                rebuildBefore: (() => {
                  try {
                    return projectLayer.getRebuildStatus();
                  } catch {
                    return undefined;
                  }
                })(),
                rebuildAfter: (() => {
                  try {
                    return projectLayer.getRebuildStatus();
                  } catch {
                    return undefined;
                  }
                })(),
                outcome: "error",
                errorText: getPresetErrorText(error),
              };
              pushPresetSwitchReport(report);
            }
          }
          if (!loadedPreset) {
            setPresetStatus("Random preset failed; keeping current", true);
          }
        } finally {
          presetLoadInFlight = false;
          updatePresetCyclerAvailability();
          flushPendingPresetRequests();
        }
      }
    } else if (presetHold) {
      setPresetStatus("HOLD: preset locked");
    }
    if (loadedPreset) {
      armProjectMMotionWatch("random");
    }

    const e = energy;
    // Tight scope: only randomize liquid when liquid is the current focus and enabled.
    if (anyBackgroundLayerOn && liquidOn && backgroundFocus === "liquid") {
      const nextLiquid = randomizeLiquidMetalParams(e, rng);
      const liquidSafe = {
        ...nextLiquid,
        brightness: Math.min(
          1.05,
          Math.max(0.6, Number(nextLiquid.brightness ?? 1))
        ),
        opacity: Math.min(
          1,
          Math.max(0.7, Number((nextLiquid as any).opacity ?? 1))
        ),
      };
      applyBackgroundLayerPatch("liquid", liquidSafe as any, "random");
    }

    // NOTE: ProjectM blend controls do not participate in global random.

    ensureVisibleBaseline({
      allowEnableBackgroundIfAllOff: anyBackgroundLayerOn,
    });

    // 记录当前随机生成的 VisualState 以便收藏/预览
    const baseState = buildCurrentVisualState();
    const nextState: VisualStateV2 = {
      ...baseState,
      global: { ...baseState.global, seed },
    };
    // 记录最近一次随机的 VisualState，供收藏/复用
    lastVisualState = nextState;

    // If the user spam-clicked Random while we were busy, run one more time.
    // (One-item queue keeps responsiveness without runaway work.)
    if (pendingRandomVisual) {
      pendingRandomVisual = false;
      setTimeout(() => {
        void applyRandomVisualStateSafe();
      }, 0);
    }
  };

  const finishRandomUi = () => {
    randomVisualInFlight = false;
    if (visualRandomButton) visualRandomButton.disabled = false;
    if (visualRandomParamsButton) visualRandomParamsButton.disabled = false;
  };

  const applyRandomVisualStateSafe = async () => {
    try {
      await applyRandomVisualState();
    } finally {
      finishRandomUi();
    }
  };

  const applyRandomMacroBank = (
    energy: number,
    rng: ReturnType<typeof createSeededRng>,
    seed: number
  ) => {
    // IMPORTANT: Do NOT switch ProjectM preset here.
    try {
      noteUserMacroInteraction();
    } catch {
      // ignore
    }

    try {
      const macroPatch = randomPatchAllForSchema(
        paramSchema.global.macros,
        energy,
        rng
      );
      const nextMacros = {
        ...lastVisualState.global.macros,
        ...macroPatch,
      } as any;
      const nextSlots = (lastVisualState.global.macroSlots ?? []).map(
        (slot) => {
          if (slot.pinned) return slot;
          if (!slot.randomize) return slot;
          return { ...slot, value: Math.min(1, Math.max(0, rng.next())) };
        }
      );
      lastVisualState = {
        ...lastVisualState,
        global: {
          ...lastVisualState.global,
          seed,
          macros: {
            ...lastVisualState.global.macros,
            ...nextMacros,
          },
          macroSlots: nextSlots,
        },
      };
      macroSlotsController?.render();
      syncMacroUiFromState();
      applyMacroBankToRuntime(getMacroBankFromState(), {
        syncUi: true,
        applyLiquid: false,
      });
    } catch {
      // ignore
    }
  };

  const applyRandomCurrentParams = () => {
    if (randomParamsInFlight) {
      pendingRandomParams = true;
      return;
    }
    if (randomVisualInFlight || presetLoadInFlight) {
      pendingRandomParams = true;
      setPresetStatus("Busy… (params queued)");
      return;
    }
    randomParamsInFlight = true;
    try {
      const energy = currentEnergyLevel || 0.5;
      const seed = createRandomSeed();
      const rng = createSeededRng(seed);

      applyRandomMacroBank(energy, rng, seed);

      // ProjectM blend does not participate in random params.
      // Instead randomize preset-tuning (runtime behavior) for the active preset.
      try {
        randomizeProjectMPresetTuningForActivePreset(
          rng,
          energy,
          "randomParams"
        );
      } catch {
        // ignore
      }

      lastVisualState = buildCurrentVisualState();
      inspector?.refreshStatus();
      if (dom.audioStatus) {
        dom.audioStatus.textContent =
          "Randomized ProjectM tuning + macros (blend unchanged)";
        dom.audioStatus.dataset.state = "ok";
      }
    } finally {
      randomParamsInFlight = false;
      if (pendingRandomParams) {
        pendingRandomParams = false;
        setTimeout(() => {
          applyRandomCurrentParams();
        }, 0);
      }
    }
  };

  const requestProjectMRandomReroll = (reason: string) => {
    if (pmMotionWatch.inFlight) return;
    if (presetLoadInFlight) return;
    if (presetHold || !projectLayerReady) return;
    if (pmMotionWatch.attempts >= PM_MOTION_MAX_ATTEMPTS) {
      pmMotionWatch.active = false;
      return;
    }
    pmMotionWatch.inFlight = true;
    pmMotionWatch.attempts += 1;
    setPresetStatus(`Random preset stalled; rerolling (${reason}) ...`);
    void applyRandomVisualStateSafe().finally(() => {
      pmMotionWatch.inFlight = false;
    });
  };

  const checkProjectMMotionWatch = (nowMs: number) => {
    if (!pmMotionWatch.active) return;
    if (!projectLayerReady) return;
    if (pmMotionWatch.inFlight) return;
    if (pmMotionWatch.presetUrl && currentPresetUrl) {
      if (pmMotionWatch.presetUrl !== currentPresetUrl) {
        pmMotionWatch.active = false;
        return;
      }
    }
    if (nowMs - pmMotionWatch.startMs < PM_MOTION_START_DELAY_MS) return;

    const verify = (globalThis as any).__projectm_verify;
    const perPm = verify?.perPm ?? {};
    const fg = perPm?.fg ?? {};
    const framesRendered = Number(verify?.framesRendered ?? 0);
    const lumaCount = Number(
      fg?.avgLumaSampleCount ?? verify?.avgLumaSampleCount ?? 0
    );
    const avgLuma = Number(fg?.avgLuma ?? verify?.avgLuma ?? 0);
    const avgR = Number(fg?.avgColorR ?? verify?.avgColorR ?? 0);
    const avgG = Number(fg?.avgColorG ?? verify?.avgColorG ?? 0);
    const avgB = Number(fg?.avgColorB ?? verify?.avgColorB ?? 0);

    if (Number.isFinite(framesRendered)) {
      if (framesRendered !== pmMotionWatch.lastFramesRendered) {
        pmMotionWatch.lastFramesRendered = framesRendered;
        pmMotionWatch.lastSampleMs = nowMs;
      } else if (nowMs - pmMotionWatch.lastSampleMs > 2200) {
        if (currentPresetId) {
          markPresetAesthetic(currentPresetId, "no-frames");
        }
        requestProjectMRandomReroll("no-frames");
        return;
      }
    }

    if (!Number.isFinite(lumaCount) || lumaCount <= 0) return;
    if (lumaCount === pmMotionWatch.lastLumaSampleCount) return;
    pmMotionWatch.lastLumaSampleCount = lumaCount;

    const deltaLuma = Math.abs(avgLuma - pmMotionWatch.lastLuma);
    const deltaColor =
      Math.abs(avgR - pmMotionWatch.lastColor.r) +
      Math.abs(avgG - pmMotionWatch.lastColor.g) +
      Math.abs(avgB - pmMotionWatch.lastColor.b);

    pmMotionWatch.lastLuma = avgLuma;
    pmMotionWatch.lastColor = { r: avgR, g: avgG, b: avgB };

    if (Number.isFinite(avgLuma)) {
      const lumaOut = avgLuma <= PM_LUMA_MIN || avgLuma >= PM_LUMA_MAX;
      if (lumaOut) {
        if (!pmMotionWatch.lumaOutSinceMs) {
          pmMotionWatch.lumaOutSinceMs = nowMs;
        } else if (nowMs - pmMotionWatch.lumaOutSinceMs > PM_LUMA_OUT_HOLD_MS) {
          if (currentPresetId) {
            markPresetAesthetic(currentPresetId, "luma-out");
          }
          requestProjectMRandomReroll("luma-out");
          return;
        }
      } else {
        pmMotionWatch.lumaOutSinceMs = 0;
      }
    } else {
      pmMotionWatch.lumaOutSinceMs = 0;
    }

    if (deltaLuma > PM_MOTION_LUMA_EPS || deltaColor > PM_MOTION_COLOR_EPS) {
      pmMotionWatch.lastChangeMs = nowMs;
      return;
    }

    if (nowMs - pmMotionWatch.lastChangeMs > PM_MOTION_FREEZE_MS) {
      if (currentPresetId) {
        markPresetAesthetic(currentPresetId, "low-motion");
      }
      requestProjectMRandomReroll("low-motion");
    }
  };

  function updatePresetCyclerAvailability() {
    const hasPresets = getAllPresets().length > 0;
    const disabled = !hasPresets || presetHold || presetLoadInFlight;
    if (presetSelect) presetSelect.disabled = disabled;
    if (presetNextButton) presetNextButton.disabled = disabled;
    if (presetAutoToggle) presetAutoToggle.disabled = disabled;
    if (presetAutoIntervalInput) presetAutoIntervalInput.disabled = disabled;
    if (presetLibrarySelect)
      presetLibrarySelect.disabled = presetHold || presetLoadInFlight;
    if (!hasPresets) {
      stopAutoCycle();
    }
  }

  const getAutoIntervalSeconds = () => {
    const value = Number(
      presetAutoIntervalInput?.value ?? AUTO_INTERVAL_DEFAULT
    );
    const clamped = clampAutoInterval(value);
    if (presetAutoIntervalInput) {
      presetAutoIntervalInput.value = String(clamped);
    }
    return clamped;
  };

  const getBgAutoIntervalSeconds = () => {
    const fg = getAutoIntervalSeconds();
    return clampAutoInterval(Math.max(30, Math.round(fg * 4)));
  };

  const resetAutoCycleBackoff = () => {
    autoCycleBackoffFactor = 1;
    autoCycleBackoffUntilMs = 0;
    autoCycleBgBackoffFactor = 1;
    autoCycleBgBackoffUntilMs = 0;
  };

  const bumpAutoCycleBackoff = (
    scope: "fg" | "bg",
    nowMs: number,
    baseIntervalSec: number
  ) => {
    if (scope === "bg") {
      autoCycleBgBackoffFactor = Math.min(
        AUTO_CYCLE_BACKOFF_MAX,
        Math.max(1, autoCycleBgBackoffFactor * 2)
      );
      autoCycleBgBackoffUntilMs =
        nowMs + autoCycleBgBackoffFactor * baseIntervalSec * 1000;
      return;
    }
    autoCycleBackoffFactor = Math.min(
      AUTO_CYCLE_BACKOFF_MAX,
      Math.max(1, autoCycleBackoffFactor * 2)
    );
    autoCycleBackoffUntilMs =
      nowMs + autoCycleBackoffFactor * baseIntervalSec * 1000;
  };

  const clearAutoCycleTimer = () => {
    if (autoCycleTimer) {
      window.clearInterval(autoCycleTimer);
      autoCycleTimer = null;
    }
    if (autoCycleBgTimer) {
      window.clearInterval(autoCycleBgTimer);
      autoCycleBgTimer = null;
    }
  };

  const stopAutoCycle = (statusMessage?: string, isError = false) => {
    if (presetAutoToggle) {
      presetAutoToggle.checked = false;
    }
    clearAutoCycleTimer();
    resetAutoCycleBackoff();
    setAutoLabelState(false);
    if (statusMessage) {
      setPresetStatus(statusMessage, isError);
    }
  };

  const syncPresetHoldUi = () => {
    if (visualHoldButton) {
      visualHoldButton.dataset.active = presetHold ? "1" : "0";
      visualHoldButton.setAttribute(
        "aria-pressed",
        presetHold ? "true" : "false"
      );
    }
  };

  const setPresetHold = (hold: boolean) => {
    presetHold = Boolean(hold);
    if (presetHold) {
      stopAutoCycle("HOLD: preset locked");
      disablePresetControls();
      if (presetLibrarySelect) presetLibrarySelect.disabled = true;
    } else {
      enablePresetControls();
      if (presetLibrarySelect) presetLibrarySelect.disabled = false;
      const initialPreset = currentPresetId
        ? findPresetById(currentPresetId)
        : null;
      setPresetStatus(
        initialPreset ? `Preset: ${initialPreset.label}` : "Preset ready"
      );
    }
    syncPresetHoldUi();
    updateAivjPill();
  };

  const togglePresetHold = () => setPresetHold(!presetHold);

  trackBootstrapDispose(
    listen(visualHoldButton, "click", () => {
      togglePresetHold();
    })
  );

  trackBootstrapDispose(
    listen(window, "keydown", (e) => {
      const ev = e as KeyboardEvent;
      if (ev.key !== " " && ev.key !== "Spacebar") return;
      const t = ev.target as HTMLElement | null;
      const tag = (t?.tagName ?? "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (t?.isContentEditable) return;
      ev.preventDefault();
      togglePresetHold();
    })
  );

  trackBootstrapDispose(
    listen(window, "keydown", (e) => {
      const ev = e as KeyboardEvent;
      if (ev.key !== "c" && ev.key !== "C") return;
      const t = ev.target as HTMLElement | null;
      const tag = (t?.tagName ?? "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (t?.isContentEditable) return;
      ev.preventDefault();
      setCalibrationOverlayEnabled(
        !calibrationOverlayEnabled,
        "calibrationHotkey"
      );
    })
  );

  const scheduleAutoCycle = () => {
    clearAutoCycleTimer();
    if (!presetAutoToggle?.checked) {
      return;
    }
    if (presetHold) {
      stopAutoCycle("HOLD: preset locked");
      return;
    }
    if (!getAllPresets().length) {
      stopAutoCycle("No presets to auto-cycle", true);
      return;
    }
    resetAutoCycleBackoff();
    const seconds = getAutoIntervalSeconds();
    autoCycleTimer = window.setInterval(() => {
      requestPresetCycle("auto");
    }, seconds * 1000);
    const bgSeconds = getBgAutoIntervalSeconds();
    autoCycleBgTimer = window.setInterval(() => {
      requestBgPresetCycle("auto");
    }, bgSeconds * 1000);
    setAutoLabelState(true);
    setPresetStatus(`Auto-cycle FG ${seconds}s / BG ${bgSeconds}s`);
  };

  const cycleToNextPreset = async (
    origin: "manual" | "auto",
    opts?: { skipGate?: boolean }
  ) => {
    if (!projectLayerReady) return;
    if (presetHold) {
      setPresetStatus("HOLD: preset locked");
      return;
    }
    if (presetLoadInFlight) {
      // One-item queue: remember the latest request and run it once we're free.
      // Manual overrides auto.
      pendingCycleOrigin =
        origin === "manual" ? "manual" : pendingCycleOrigin ?? "auto";
      if (origin === "manual") setPresetStatus("Preset switch in progress…");
      return;
    }
    if (!opts?.skipGate) {
      const gate = requestPresetSwitch(origin);
      if (!gate.ok) {
        const reasonText = gate.reasons.length
          ? gate.reasons.join(",")
          : "gate";
        setPresetStatus(
          `${origin === "auto" ? "Auto" : "Manual"} blocked (${reasonText})`
        );
        return;
      }
    }
    const nextPreset = getNextPresetFiltered(currentPresetId);
    if (!nextPreset) {
      stopAutoCycle("No presets available for cycling", true);
      return;
    }
    setPresetStatus(
      `${origin === "auto" ? "Auto" : "Manual"} loading: ${
        nextPreset.label
      } ...`
    );
    const loadStartMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const framesBefore = tryReadFramesRendered();
    const rebuildBefore = (() => {
      try {
        return projectLayer.getRebuildStatus();
      } catch {
        return undefined;
      }
    })();
    presetLoadInFlight = true;
    updatePresetCyclerAvailability();
    try {
      ensureProjectLayerReady();
      const cacheResult = await loadPresetMaybeCached(
        projectLayer,
        nextPreset,
        origin
      );
      currentPresetId = nextPreset.id;
      currentPresetUrl = nextPreset.url;
      recordPresetSuccess(nextPreset);
      recordPresetLoadSuccess(nextPreset.id, performance.now() - loadStartMs);
      applyProjectMPresetTuningToRuntime("presetLoaded");
      updatePresetSelectValue(nextPreset.id);
      setPresetStatus(`Preset: ${nextPreset.label}`);
      armProjectMMotionWatch("manual");
      queuePresetPrefetchAround(nextPreset.id, 2, `cycle:${origin}`);
      if (origin === "auto") {
        autoCycleBackoffFactor = 1;
        autoCycleBackoffUntilMs = 0;
      }

      const tEnd =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const report: PresetSwitchReport = {
        scope: "fg",
        origin: `cycle:${origin}`,
        presetId: nextPreset.id,
        presetUrl: nextPreset.url,
        presetLabel: nextPreset.label,
        tStartMs: loadStartMs,
        tEndMs: tEnd,
        durationMs: Math.max(0, tEnd - loadStartMs),
        loadMs: Math.max(0, tEnd - loadStartMs),
        cache: cacheResult?.cache === "hit" ? "hit" : "miss",
        framesBefore: framesBefore ?? undefined,
        rebuildBefore,
        rebuildAfter: (() => {
          try {
            return projectLayer.getRebuildStatus();
          } catch {
            return undefined;
          }
        })(),
        outcome: "success",
      };
      pushPresetSwitchReport(report);
      void updatePresetSwitchFirstFrame(report);
    } catch (error) {
      const elapsedMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        loadStartMs;
      const compatNote = getCompatNote(nextPreset);
      handlePresetLoadError(`Failed to load preset${compatNote}`, error);
      handlePresetFailure(nextPreset, error, elapsedMs);
      if (origin === "auto") {
        const nowMs =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        bumpAutoCycleBackoff("fg", nowMs, getAutoIntervalSeconds());
      }

      const tEnd =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const report: PresetSwitchReport = {
        scope: "fg",
        origin: `cycle:${origin}`,
        presetId: nextPreset.id,
        presetUrl: nextPreset.url,
        presetLabel: nextPreset.label,
        tStartMs: loadStartMs,
        tEndMs: tEnd,
        durationMs: Math.max(0, tEnd - loadStartMs),
        cache: "na",
        framesBefore: framesBefore ?? undefined,
        rebuildBefore,
        rebuildAfter: (() => {
          try {
            return projectLayer.getRebuildStatus();
          } catch {
            return undefined;
          }
        })(),
        outcome: "error",
        errorText: getPresetErrorText(error),
      };
      pushPresetSwitchReport(report);
      // IMPORTANT: don't auto-disable auto-cycle just because one preset fails.
      // We mark the preset as broken and allow the next tick to advance.
    } finally {
      presetLoadInFlight = false;
      updatePresetCyclerAvailability();
      flushPendingPresetRequests();
    }
  };

  const cycleToNextPresetBg = async (
    origin: "auto",
    opts?: { skipGate?: boolean }
  ) => {
    if (!projectLayerBgReady) return;
    if (presetHold) {
      setPresetStatus("HOLD: preset locked");
      return;
    }
    if (presetLoadInFlight) {
      pendingBgPresetRequest =
        origin === "auto" ? { origin, requestedAtMs: Date.now() } : null;
      return;
    }
    if (!opts?.skipGate) {
      const gate = evaluateBgPresetSwitchGate(
        typeof performance !== "undefined" ? performance.now() : Date.now(),
        `bg:${origin}`
      );
      if (!gate.allow) {
        return;
      }
    }
    const excludeIds = new Set<string>();
    if (currentPresetId) excludeIds.add(currentPresetId);
    const nextPreset = getNextPresetFilteredExcluding(
      currentPresetIdBg,
      excludeIds
    );
    if (!nextPreset) {
      return;
    }
    const loadStartMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const framesBefore = tryReadFramesRendered();
    const rebuildBefore = (() => {
      try {
        return projectLayerBg.getRebuildStatus();
      } catch {
        return undefined;
      }
    })();
    presetLoadInFlight = true;
    updatePresetCyclerAvailability();
    try {
      ensureProjectLayerBgReady();
      const cacheResult = await loadPresetMaybeCached(
        projectLayerBg,
        nextPreset,
        `bg:${origin}`
      );
      currentPresetIdBg = nextPreset.id;
      currentPresetUrlBg = nextPreset.url;
      recordPresetSuccess(nextPreset);
      recordPresetLoadSuccess(nextPreset.id, performance.now() - loadStartMs);
      queuePresetPrefetchAround(
        nextPreset.id,
        1,
        `cycle-bg:${origin}`,
        currentPresetId ? new Set([currentPresetId]) : undefined
      );
      autoCycleBgBackoffFactor = 1;
      autoCycleBgBackoffUntilMs = 0;

      const tEnd =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const report: PresetSwitchReport = {
        scope: "bg",
        origin: `cycle-bg:${origin}`,
        presetId: nextPreset.id,
        presetUrl: nextPreset.url,
        presetLabel: nextPreset.label,
        tStartMs: loadStartMs,
        tEndMs: tEnd,
        durationMs: Math.max(0, tEnd - loadStartMs),
        loadMs: Math.max(0, tEnd - loadStartMs),
        cache: cacheResult?.cache === "hit" ? "hit" : "miss",
        framesBefore: framesBefore ?? undefined,
        rebuildBefore,
        rebuildAfter: (() => {
          try {
            return projectLayerBg.getRebuildStatus();
          } catch {
            return undefined;
          }
        })(),
        outcome: "success",
      };
      pushPresetSwitchReport(report);
      void updatePresetSwitchFirstFrame(report);
    } catch (error) {
      const elapsedMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        loadStartMs;
      handlePresetLoadError("Failed to load BG preset", error);
      handlePresetFailure(nextPreset, error, elapsedMs);
      const nowMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      bumpAutoCycleBackoff("bg", nowMs, getBgAutoIntervalSeconds());

      const tEnd =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const report: PresetSwitchReport = {
        scope: "bg",
        origin: `cycle-bg:${origin}`,
        presetId: nextPreset.id,
        presetUrl: nextPreset.url,
        presetLabel: nextPreset.label,
        tStartMs: loadStartMs,
        tEndMs: tEnd,
        durationMs: Math.max(0, tEnd - loadStartMs),
        cache: "na",
        framesBefore: framesBefore ?? undefined,
        rebuildBefore,
        rebuildAfter: (() => {
          try {
            return projectLayerBg.getRebuildStatus();
          } catch {
            return undefined;
          }
        })(),
        outcome: "error",
        errorText: getPresetErrorText(error),
      };
      pushPresetSwitchReport(report);
    } finally {
      presetLoadInFlight = false;
      updatePresetCyclerAvailability();
      flushPendingPresetRequests();
    }
  };

  const ensureProjectLayerReady = () => {
    if (!projectLayer.isReady()) {
      throw new Error("ProjectM layer not ready");
    }
  };

  const ensureProjectLayerBgReady = () => {
    if (!projectLayerBg.isReady()) {
      throw new Error("ProjectM BG layer not ready");
    }
  };

  disablePresetControls();
  refreshPresetSelect();
  setAutoLabelState(false);
  currentLibrarySource = getInitialLibrarySource();
  setLibrarySelectValue(currentLibrarySource);
  void loadPresetManifestForSource(currentLibrarySource);
  updateFavoriteCountLabel();
  syncBlendControlsFromLayer();

  (async () => {
    // 先添加液态金属层
    await sceneManager.addLayer(liquidLayer);

    // Optional background overlays.
    await sceneManager.addLayer(basicLayer);
    await sceneManager.addLayer(depthLayer);

    if (cameraLayer) {
      try {
        await sceneManager.addLayer(cameraLayer);
        console.log("Camera layer initialized");
      } catch (error) {
        console.warn("Camera layer failed to initialize:", error);
      }
    }

    await sceneManager.addLayer(videoLayer);

    // ProjectM 层初始化可能失败，使用 try-catch 包裹
    try {
      await sceneManager.addLayer(projectLayer);
      console.log("✅ ProjectM layer initialized");
    } catch (error) {
      console.warn("⚠️ ProjectM layer failed to initialize:", error);
      console.log("🎨 Continuing with liquid metal layer only");
    }

    // Background ProjectM (low-reactive) to replace Basic in dual-PM setups.
    try {
      await sceneManager.addLayer(projectLayerBg);
      projectLayerBgReady = true;
      const defaultPreset = findPresetById("default");
      currentPresetIdBg = defaultPreset?.id ?? null;
      currentPresetUrlBg = defaultPreset?.url ?? null;
      console.log("✅ ProjectM BG layer initialized");
    } catch (error) {
      console.warn("⚠️ ProjectM BG layer failed to initialize:", error);
    }

    sceneManager.start();
    projectLayerReady = true;
    applyProjectMPresetTuningToRuntime("boot");
    captureColorSnapshot(
      "boot",
      typeof performance !== "undefined" ? performance.now() : Date.now()
    );

    // Keyboard shortcuts: 'R' randomizes.
    trackBootstrapDispose(
      listen(window, "keydown", (e) => {
        const ev = e as KeyboardEvent;
        if (ev.key === "r" || ev.key === "R") {
          void applyRandomVisualStateSafe();
        }
      })
    );

    enablePresetControls();
    const initialPreset = currentPresetId
      ? findPresetById(currentPresetId)
      : null;
    setPresetStatus(
      initialPreset ? `Preset: ${initialPreset.label}` : "Preset ready"
    );
    // Audio transport controller handles user-gesture resume + optional test track autoload.
    void audioTransport.tryAutoLoadDefaultAudio();
    audioTransport.bindAudioResumeOnGesture();

    // Initial background enable + params.
    applyBackgroundLayerPatch(
      "liquid",
      { enabled: Boolean(layerLiquidToggle?.checked ?? true) },
      "user"
    );
    applyBackgroundLayerPatch(
      "basic",
      { enabled: Boolean(layerBasicToggle?.checked) },
      "user"
    );
    applyBackgroundLayerPatch(
      "depth",
      { enabled: Boolean(layerDepthToggle?.checked) },
      "user"
    );
    if (cameraLayer) {
      applyBackgroundLayerPatch(
        "camera",
        { enabled: Boolean(layerCameraToggle?.checked) },
        "user"
      );
    }
    applyBackgroundLayerPatch(
      "video",
      { enabled: Boolean(layerVideoToggle?.checked) },
      "user"
    );

    refreshBackgroundUiEnabledState();

    // Populate devices once; labels may appear only after permission.
    void populateVideoInputDevices(cameraDeviceSelect);
    void populateVideoInputDevices(depthDeviceSelect);

    // Apply initial params.
    setBasicParamsFromUi();
    setCameraParamsFromUi();
    syncCameraEdgeToPmFromUi();
    setVideoParamsFromUi();
    setDepthParamsFromUi();

    // If Depth source is ws/idepth and enabled, connect WS client.
    const depthSource = (depthSourceSelect?.value ?? "webcam").trim();
    if (
      Boolean(layerDepthToggle?.checked) &&
      (depthSource === "ws" || depthSource === "idepth")
    ) {
      ensureDepthWsClient(depthSource);
      updateDepthStatusLabel();
    }
  })();

  // Background UI bindings.
  trackBootstrapDispose(
    listen(layerLiquidToggle, "change", () => {
      applyBackgroundLayerPatch(
        "liquid",
        { enabled: Boolean(layerLiquidToggle?.checked) },
        "user"
      );
    })
  );

  trackBootstrapDispose(
    listen(bgVariantLockToggle, "change", () => {
      liquidVariantLocked = Boolean(bgVariantLockToggle?.checked);
      writeStored(LIQUID_VARIANT_LOCK_KEY, liquidVariantLocked ? "1" : "0");
    })
  );

  trackBootstrapDispose(
    listen(bgVariantSelect, "change", () => {
      const v = String(bgVariantSelect?.value ?? "").trim();
      if (v === "metal" || v === "waves" || v === "stars" || v === "lines") {
        applyBackgroundLayerPatch("liquid", { variant: v }, "user");
      }
    })
  );

  trackBootstrapDispose(
    listen(layerBasicToggle, "change", () => {
      applyBackgroundLayerPatch(
        "basic",
        { enabled: Boolean(layerBasicToggle?.checked) },
        "user"
      );
    })
  );

  trackBootstrapDispose(
    listen(basicOpacityInput, "input", () => {
      noteOverlayBudgetHold("basic");
      const v = readRangeInputValue01(basicOpacityInput, 0.7);
      if (basicOpacityText) basicOpacityText.textContent = fmtPct(v);
      setBasicParamsFromUi();
    })
  );

  trackBootstrapDispose(
    listen(layerCameraToggle, "change", () => {
      const enabled = Boolean(layerCameraToggle?.checked);
      applyBackgroundLayerPatch("camera", { enabled }, "user");
      if (enabled) nudgeProjectMOpacityForBackgroundVisibility();
      setCameraParamsFromUi();
      // Re-enumerate to get labels after permission grant.
      void populateVideoInputDevices(cameraDeviceSelect);
    })
  );

  trackBootstrapDispose(
    listen(cameraOpacityInput, "input", () => {
      noteOverlayBudgetHold("camera");
      const v = readRangeInputValue01(cameraOpacityInput, 0.85);
      if (cameraOpacityText) cameraOpacityText.textContent = fmtPct(v);
      setCameraParamsFromUi();
    })
  );

  trackBootstrapDispose(
    listen(cameraDeviceSelect, "change", () => {
      setCameraParamsFromUi();
    })
  );

  trackBootstrapDispose(
    listen(cameraSegmentToggle, "change", () => {
      setCameraParamsFromUi();
    })
  );

  trackBootstrapDispose(
    listen(cameraEdgeToPmInput, "input", () => {
      syncCameraEdgeToPmFromUi();
    })
  );

  trackBootstrapDispose(
    listen(layerVideoToggle, "change", () => {
      const enabled = Boolean(layerVideoToggle?.checked);
      applyBackgroundLayerPatch("video", { enabled }, "user");
      if (enabled) nudgeProjectMOpacityForBackgroundVisibility();
      setVideoParamsFromUi();
    })
  );

  trackBootstrapDispose(
    listen(videoOpacityInput, "input", () => {
      noteOverlayBudgetHold("video");
      const v = readRangeInputValue01(videoOpacityInput, 0.7);
      if (videoOpacityText) videoOpacityText.textContent = fmtPct(v);
      setVideoParamsFromUi();
    })
  );

  trackBootstrapDispose(
    listen(videoSrcApplyButton, "click", () => {
      setVideoParamsFromUi();
      if (videoSrcHint)
        videoSrcHint.textContent = (videoSrcInput?.value ?? "").trim()
          ? "src set"
          : "";
    })
  );

  trackBootstrapDispose(
    listen(videoRetryButton, "click", () => {
      void (async () => {
        // User-gesture retry for autoplay-rejected playback.
        setVideoParamsFromUi();
        const ok = await videoLayer.retryPlayback();
        setInspectorStatusExtraTransient(
          ok ? "video resumed" : "video retry failed",
          2500
        );
      })();
    })
  );

  trackBootstrapDispose(
    listen(layerDepthToggle, "change", () => {
      const enabled = Boolean(layerDepthToggle?.checked);
      applyBackgroundLayerPatch("depth", { enabled }, "user");
      if (enabled) nudgeProjectMOpacityForBackgroundVisibility();
      if (!enabled) {
        stopDepthWsClient();
      } else {
        const src = (depthSourceSelect?.value ?? "webcam").trim();
        if (src === "ws" || src === "idepth") {
          ensureDepthWsClient(src);
        }
      }
      setDepthParamsFromUi();
    })
  );

  trackBootstrapDispose(
    listen(depthSourceSelect, "change", () => {
      const src = (depthSourceSelect?.value ?? "webcam").trim();
      refreshBackgroundUiEnabledState();
      setDepthParamsFromUi();
      if (
        Boolean(layerDepthToggle?.checked) &&
        (src === "ws" || src === "idepth")
      ) {
        ensureDepthWsClient(src);
      } else {
        stopDepthWsClient();
      }
      // Re-enumerate depth devices after permission grant.
      void populateVideoInputDevices(depthDeviceSelect);
    })
  );

  trackBootstrapDispose(
    listen(depthDeviceSelect, "change", () => {
      setDepthParamsFromUi();
    })
  );

  trackBootstrapDispose(
    listen(depthShowDepthToggle, "change", () => {
      setDepthParamsFromUi();
    })
  );

  trackBootstrapDispose(
    listen(depthOpacityInput, "input", () => {
      noteOverlayBudgetHold("depth");
      const v = readRangeInputValue01(depthOpacityInput, 0.7);
      if (depthOpacityText) depthOpacityText.textContent = fmtPct(v);
      setDepthParamsFromUi();
    })
  );

  trackBootstrapDispose(
    listen(depthFogInput, "input", () => {
      if (depthFogText)
        depthFogText.textContent = Number(depthFogInput.value).toFixed(2);
      setDepthParamsFromUi();
    })
  );
  trackBootstrapDispose(
    listen(depthEdgeInput, "input", () => {
      if (depthEdgeText)
        depthEdgeText.textContent = Number(depthEdgeInput.value).toFixed(2);
      setDepthParamsFromUi();
    })
  );
  trackBootstrapDispose(
    listen(depthLayersInput, "input", () => {
      if (depthLayersText)
        depthLayersText.textContent = String(
          Math.round(Number(depthLayersInput.value))
        );
      setDepthParamsFromUi();
    })
  );
  trackBootstrapDispose(
    listen(depthBlurInput, "input", () => {
      if (depthBlurText)
        depthBlurText.textContent = String(
          Math.round(Number(depthBlurInput.value))
        );
      setDepthParamsFromUi();
    })
  );

  trackBootstrapDispose(
    listen(navigator.mediaDevices, "devicechange", () => {
      void populateVideoInputDevices(cameraDeviceSelect);
      void populateVideoInputDevices(depthDeviceSelect);
    })
  );

  trackBootstrapDispose(
    listen(pmBlendModeSelect, "change", () => {
      applyBlendControlsToLayer();
    })
  );

  trackBootstrapDispose(
    listen(pmOpacityInput, "input", () => {
      applyBlendControlsToLayer();
    })
  );

  trackBootstrapDispose(
    listen(pmAudioOpacityToggle, "change", () => {
      applyBlendControlsToLayer();
    })
  );

  trackBootstrapDispose(
    listen(pmEnergyOpacityInput, "change", () => {
      applyBlendControlsToLayer();
    })
  );

  trackBootstrapDispose(
    listen(pmEnergyOpacityInput, "input", () => {
      applyBlendControlsToLayer();
    })
  );

  trackBootstrapDispose(
    listen(pmPriorityInput, "input", () => {
      const raw = Number(pmPriorityInput?.value ?? 0.6);
      applyPmPriority(Math.min(1, Math.max(0, raw)));
    })
  );
  trackBootstrapDispose(
    listen(pmRetreatStrengthInput, "input", () => {
      const raw = Number(pmRetreatStrengthInput?.value ?? 0.25);
      applyPmRetreatStrength(raw);
    })
  );

  audioBus.onFrame((frame: AudioFrame) => {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    lastAudioFrameSummary = buildAudioFrameSummary(frame);
    controlPlaneDebug.finalWriter = null;
    controlPlaneDebug.scheduledAction = null;
    controlPlaneDebug.denyReasonsTop = [];
    controlPlaneDebug.calibration.enabled = calibrationOverlayEnabled;
    controlPlaneDebug.calibration.autoOffMs = Math.max(
      0,
      calibrationAutoOffUntilMs - nowMs
    );

    const audioControlsCfg = audioControls.getConfig();
    const audioControlsSnap = audioControls.onAudioFrame(frame, nowMs);

    // BeatTempo snapshot -> feed into the frame so AIVJ/visuals can consume it.
    // (Snapshot is updated asynchronously by the worker; this is the latest known value.)
    const beatEnabled = beatTempo.getConfig().enabled;
    const beatSnapshot = beatEnabled ? beatTempo.getSnapshot() : null;
    if (beatEnabled && beatSnapshot) {
      const cfg = beatTempo.getConfig();

      const pickHarmonicBpm = (raw: number) => {
        const b = Number(raw);
        if (!Number.isFinite(b) || b <= 0) return 0;

        const minT = Number.isFinite(Number(cfg.minTempo))
          ? Math.max(30, Math.min(220, Number(cfg.minTempo)))
          : 30;
        const maxT = Number.isFinite(Number(cfg.maxTempo))
          ? Math.max(minT, Math.min(260, Number(cfg.maxTempo)))
          : 260;

        // Consider octave harmonics; clamp to a reasonable range.
        const cands = [b, b * 2, b * 0.5].filter(
          (x) => Number.isFinite(x) && x >= minT && x <= maxT
        );
        if (cands.length === 0) return 0;

        // Prefer continuity: stay close to previous smoothed BPM.
        const prev = Number(beatBpmSmoothed);
        const havePrev = Number.isFinite(prev) && prev > 0;
        const target = havePrev ? prev : (minT + maxT) * 0.5;

        let best = cands[0];
        let bestScore = Math.abs(cands[0] - target);
        for (let i = 1; i < cands.length; i++) {
          const x = cands[i];
          const s = Math.abs(x - target);
          if (s < bestScore) {
            best = x;
            bestScore = s;
          }
        }
        return best;
      };

      const beatConfidence01 = Math.min(
        1,
        Math.max(
          0,
          Math.max(
            beatSnapshot.confidence01 || 0,
            0.75 * (beatSnapshot.stability01 || 0)
          )
        )
      );
      const rawBpm = pickHarmonicBpm(Number(beatSnapshot.bpm || 0));
      const conf01 = Math.min(1, Math.max(0, beatSnapshot.confidence01 || 0));
      if (rawBpm > 0) {
        const dtSec = Math.max(0.001, (nowMs - beatBpmLastMs) / 1000);
        beatBpmLastMs = nowMs;
        if (beatBpmSmoothed <= 0) {
          beatBpmSmoothed = rawBpm;
        } else {
          const jump = Math.abs(rawBpm - beatBpmSmoothed);
          if (!(jump > 30 && conf01 < 0.7)) {
            const baseHz = conf01 >= 0.7 ? 2.4 : conf01 >= 0.5 ? 1.2 : 0.6;
            const alpha = 1 - Math.exp(-dtSec * baseHz);
            const weight = Math.min(1, Math.max(0.15, conf01));
            beatBpmSmoothed =
              beatBpmSmoothed + (rawBpm - beatBpmSmoothed) * alpha * weight;
          }
        }
      }
      const tempoBpm = beatBpmSmoothed > 0 ? beatBpmSmoothed : rawBpm;
      beatBpmUi = tempoBpm;
      frame.features = {
        ...(frame.features ?? {}),
        tempoBpm,
        beatConfidence: beatConfidence01,
        beatStability: beatSnapshot.stability01 || 0,
        beatPhase: beatSnapshot.beatPhase || 0,
        beatPulse: beatSnapshot.beatPulse || 0,
      };
    } else if (!beatEnabled) {
      beatBpmSmoothed = 0;
      beatBpmUi = 0;
    }
    lastBeatPhase01 = clamp01(
      Number(frame.features?.beatPhase ?? lastBeatPhase01 ?? 0)
    );

    // Update beat quality smoothing (attack fast, release slow).
    {
      const dtSec = Math.max(0.001, (nowMs - beatQualityLastMs) / 1000);
      beatQualityLastMs = nowMs;
      const conf01 = Math.min(
        1,
        Math.max(0, Number(frame.features?.beatConfidence ?? 0))
      );
      const stab01 = Math.min(
        1,
        Math.max(0, Number((frame.features as any)?.beatStability ?? 0))
      );
      const target = Math.min(1, Math.max(conf01, stab01));

      const attackHz = 2.8;
      const releaseHz = 0.7;
      const hz = target >= beatQuality01Smoothed ? attackHz : releaseHz;
      const alpha = 1 - Math.exp(-dtSec * hz);
      beatQuality01Smoothed =
        beatQuality01Smoothed + (target - beatQuality01Smoothed) * alpha;
    }

    // Scene classifier (ambient/techno/rock) drives subtle macro bias + auto-director hints.
    {
      const energy01 = clamp01Runtime(
        Number(frame.energy ?? (frame as any).energyRaw ?? 0),
        0
      );
      const bass01 = clamp01Runtime(
        Number(frame.features?.bass01Long ?? frame.bands?.low ?? 0),
        0
      );
      const kick01 = clamp01Runtime(
        Number(frame.features?.kick01Long ?? frame.features?.kick01Raw ?? 0),
        0
      );
      const mid01 = clamp01Runtime(
        Number(frame.bands?.mid ?? frame.bandsRaw?.mid ?? 0),
        0
      );
      const high01 = clamp01Runtime(
        Number(frame.features?.hihat01Long ?? frame.bands?.high ?? 0),
        0
      );
      const flux01 = clamp01Runtime(Number(frame.features?.flux ?? 0), 0);
      const beatConf01 = clamp01Runtime(
        Number(frame.features?.beatConfidence ?? 0),
        0
      );

      const ambientScore = clamp01Runtime(
        0.55 * (1 - energy01) + 0.25 * (1 - flux01) + 0.2 * (1 - beatConf01),
        0
      );
      const technoScore = clamp01Runtime(
        0.45 * energy01 + 0.35 * kick01 + 0.2 * beatConf01,
        0
      );
      const rockScore = clamp01Runtime(
        0.4 * energy01 + 0.35 * mid01 + 0.25 * high01,
        0
      );

      const dtSec = Math.max(0.001, (nowMs - sceneLastUpdateMs) / 1000);
      const alpha = 1 - Math.exp(-dtSec * 2.4);
      sceneLastUpdateMs = nowMs;
      sceneScores = {
        ambient:
          sceneScores.ambient + (ambientScore - sceneScores.ambient) * alpha,
        techno: sceneScores.techno + (technoScore - sceneScores.techno) * alpha,
        rock: sceneScores.rock + (rockScore - sceneScores.rock) * alpha,
      };

      const currentScore = sceneScores[sceneLabel];
      let nextLabel = sceneLabel;
      let bestScore = currentScore;
      (["ambient", "techno", "rock"] as const).forEach((label) => {
        const s = sceneScores[label];
        if (s > bestScore) {
          bestScore = s;
          nextLabel = label;
        }
      });

      if (
        nextLabel !== sceneLabel &&
        (bestScore > currentScore + 0.08 || nowMs - sceneLastSwitchMs > 8000)
      ) {
        sceneLabel = nextLabel;
        sceneLastSwitchMs = nowMs;
      }

      if (sceneLabel === "ambient") {
        sceneMacroBias = { fusion: 0.08, motion: -0.08, sparkle: -0.1 };
      } else if (sceneLabel === "rock") {
        sceneMacroBias = { fusion: 0.04, motion: 0.04, sparkle: 0.1 };
      } else {
        sceneMacroBias = { fusion: 0.02, motion: 0.12, sparkle: 0.08 };
      }

      const eDt = Math.max(0.001, (nowMs - autoPresetEnergyLastMs) / 1000);
      autoPresetEnergyLastMs = nowMs;
      const fastAlpha = 1 - Math.exp(-eDt * 3.6);
      const slowAlpha = 1 - Math.exp(-eDt * 0.7);
      autoPresetEnergyFast =
        autoPresetEnergyFast + (energy01 - autoPresetEnergyFast) * fastAlpha;
      autoPresetEnergySlow =
        autoPresetEnergySlow + (energy01 - autoPresetEnergySlow) * slowAlpha;
    }

    // --- Control plane gates (MVP): audio valid / beat trusted / render stable. ---
    {
      const audioRms = Number(frame.rms);
      const audioEnergy = Number(frame.energy);
      const audioSilent = Boolean(frame.isSilent);
      const audioOk =
        Number.isFinite(audioRms) &&
        audioRms > AUDIO_VALID_RMS_MIN &&
        Number.isFinite(audioEnergy) &&
        audioEnergy >= 0 &&
        !audioSilent;

      if (audioOk) {
        audioValidFrames = Math.min(AUDIO_VALID_FRAMES, audioValidFrames + 1);
      } else {
        audioValidFrames = 0;
        if (gateAudioValid) {
          gateAudioValid = false;
          audioCooldownUntilMs = nowMs + AUDIO_COOLDOWN_MS;
          recordControlPlaneEvent("GATE_AUDIO_VALID", "off");
        }
      }

      const audioValidNow =
        audioValidFrames >= AUDIO_VALID_FRAMES && nowMs >= audioCooldownUntilMs;
      if (audioValidNow !== gateAudioValid) {
        gateAudioValid = audioValidNow;
        recordControlPlaneEvent(
          "GATE_AUDIO_VALID",
          audioValidNow ? "on" : "off"
        );
      }

      const beatConf = Number(frame.features?.beatConfidence ?? 0);
      const beatStability = Number(frame.features?.beatStability ?? 0);
      const beatOk = beatConf >= 0.75 && beatStability >= 0.65;
      if (beatOk) {
        if (!beatOkSinceMs) beatOkSinceMs = nowMs;
      } else {
        beatOkSinceMs = 0;
        if (gateBeatTrusted) {
          gateBeatTrusted = false;
          beatCooldownUntilMs = nowMs + BEAT_COOLDOWN_MS;
          recordControlPlaneEvent("GATE_BEAT_TRUSTED", "off");
        }
      }

      const beatTrustedNow =
        Boolean(beatOkSinceMs) &&
        nowMs - beatOkSinceMs >= BEAT_TRUST_MS &&
        nowMs >= beatCooldownUntilMs;
      if (beatTrustedNow !== gateBeatTrusted) {
        gateBeatTrusted = beatTrustedNow;
        recordControlPlaneEvent(
          "GATE_BEAT_TRUSTED",
          beatTrustedNow ? "on" : "off"
        );
      }

      const rebuild = projectLayer.getRebuildStatus();
      const rebuildInProgress = Boolean(rebuild?.inProgress);
      if (rebuildInProgress !== lastRebuildInProgress) {
        recordControlPlaneEvent(
          rebuildInProgress ? "REBUILD_START" : "REBUILD_END"
        );
        lastRebuildInProgress = rebuildInProgress;
      }

      const rtReallocMs = sceneManager.getLastRtReallocMs();
      if (rtReallocMs && rtReallocMs !== lastRtReallocSeenMs) {
        const cfg = sceneManager.getCompositorConfig();
        recordControlPlaneEvent(
          "RT_REALLOC",
          `${cfg.targetMode}:${cfg.fixedWidth}x${cfg.fixedHeight}`
        );
        lastRtReallocSeenMs = rtReallocMs;
      }
      const rtReallocRecent =
        rtReallocMs > 0 && nowMs - rtReallocMs < RES_COOLDOWN_MS;
      const resCooldownActive =
        (lastResCommitMs > 0 && nowMs - lastResCommitMs < RES_COOLDOWN_MS) ||
        rtReallocRecent;
      frameTimeP95Ms = computeFrameTimeP95(nowMs);
      const frameTimeOver =
        Number.isFinite(frameTimeP95Ms) &&
        frameTimeP95Ms > FRAME_TIME_P95_LIMIT_MS;
      if (rebuildInProgress || frameTimeOver || rtReallocRecent) {
        renderCooldownUntilMs = nowMs + RENDER_COOLDOWN_MS;
      }

      const renderStableNow =
        !rebuildInProgress &&
        !resCooldownActive &&
        !frameTimeOver &&
        nowMs >= renderCooldownUntilMs;
      if (renderStableNow !== gateRenderStable) {
        gateRenderStable = renderStableNow;
        recordControlPlaneEvent(
          "GATE_RENDER_STABLE",
          renderStableNow ? "on" : "off"
        );
      }

      controlPlaneDebug.gate.audioValid = gateAudioValid;
      controlPlaneDebug.gate.beatTrusted = gateBeatTrusted;
      controlPlaneDebug.gate.renderStable = gateRenderStable;

      controlPlaneDebug.cooldown.audioMs = Math.max(
        0,
        audioCooldownUntilMs - nowMs
      );
      controlPlaneDebug.cooldown.beatMs = Math.max(
        0,
        beatCooldownUntilMs - nowMs
      );
      controlPlaneDebug.cooldown.renderMs = Math.max(
        0,
        renderCooldownUntilMs - nowMs
      );
      controlPlaneDebug.cooldown.m3Ms = Math.max(
        0,
        lastResCommitMs > 0 ? RES_COOLDOWN_MS - (nowMs - lastResCommitMs) : 0
      );
      controlPlaneDebug.cooldown.fgMs = Math.max(
        0,
        lastPresetSwitchMs > 0
          ? PRESET_SWITCH_COOLDOWN_MS - (nowMs - lastPresetSwitchMs)
          : 0
      );
      controlPlaneDebug.cooldown.bgMs = Math.max(
        0,
        lastBgPresetSwitchMs > 0
          ? BG_PRESET_SWITCH_COOLDOWN_MS - (nowMs - lastBgPresetSwitchMs)
          : 0
      );
      controlPlaneDebug.cooldown.bgRecentMs = Math.max(
        0,
        lastBgPresetSwitchMs > 0
          ? BG_RECENT_BLOCK_MS - (nowMs - lastBgPresetSwitchMs)
          : 0
      );
      controlPlaneDebug.cooldown.fgRecentMs = Math.max(
        0,
        lastPresetSwitchMs > 0
          ? FG_RECENT_BLOCK_MS - (nowMs - lastPresetSwitchMs)
          : 0
      );
      controlPlaneDebug.freezeFlags.rebuild = rebuildInProgress;
      controlPlaneDebug.freezeFlags.resCooldown = resCooldownActive;
      controlPlaneDebug.freezeFlags.beatCooldown = nowMs < beatCooldownUntilMs;

      const phase01 = clamp01(lastBeatPhase01);
      controlPlaneDebug.phase.phase01 = phase01;
      controlPlaneDebug.phase.fgWindow =
        gateBeatTrusted && isInFgPhaseWindow(phase01);
      controlPlaneDebug.phase.bgWindow =
        gateBeatTrusted && isInBgPhaseWindow(phase01);

      controlPlaneDebug.preset.fgId = currentPresetId;
      controlPlaneDebug.preset.bgId = currentPresetIdBg;
      controlPlaneDebug.presetStats.hardFails = presetHardFailCount;
      controlPlaneDebug.presetStats.softFails = presetSoftFailCount;
      controlPlaneDebug.presetStats.aestheticFails = presetAestheticFailCount;
      controlPlaneDebug.presetStats.anchorFallbacks = anchorFallbackCount;
      controlPlaneDebug.presetStats.lastAnchorReason = lastAnchorFallbackReason;
    }

    // --- Section FSM (CALM/GROOVE/PEAK) ---
    {
      const energy01 = clamp01(Number(frame.energy ?? 0));
      const dtSec = Math.max(
        0.001,
        Math.min(0.25, (nowMs - energySlowLastMs) / 1000)
      );
      energySlowLastMs = nowMs;
      const hz =
        energy01 >= energySlow01 ? SECTION_ATTACK_HZ : SECTION_RELEASE_HZ;
      const alpha = 1 - Math.exp(-dtSec * hz);
      energySlow01 = energySlow01 + (energy01 - energySlow01) * alpha;
      sectionIntensity01 = clamp01(energySlow01);

      const flux01 = clamp01(Number(frame.features?.flux ?? 0));
      if (flux01 > SECTION_FLUX_THR) {
        if (!fluxAbove) {
          fluxAbove = true;
          fluxOnsetTimes.push(nowMs);
        }
      } else {
        fluxAbove = false;
      }
      while (
        fluxOnsetTimes.length &&
        fluxOnsetTimes[0] < nowMs - SECTION_ONSET_WINDOW_MS
      ) {
        fluxOnsetTimes.shift();
      }
      const onsetRate2s = fluxOnsetTimes.length / 2;

      const setSectionState = (next: typeof sectionState) => {
        if (sectionState === next) return;
        sectionState = next;
        sectionTransitionStartMs = 0;
        recordControlPlaneEvent("SECTION", next);
      };

      if (!gateAudioValid) {
        setSectionState("CALM");
      } else if (!gateBeatTrusted) {
        if (sectionState !== "CALM") {
          if (!sectionTransitionStartMs) sectionTransitionStartMs = nowMs;
          if (nowMs - sectionTransitionStartMs >= 1000) {
            setSectionState("CALM");
          }
        } else {
          sectionTransitionStartMs = 0;
        }
      } else {
        switch (sectionState) {
          case "CALM": {
            if (energySlow01 > 0.35) {
              if (!sectionTransitionStartMs) sectionTransitionStartMs = nowMs;
              if (nowMs - sectionTransitionStartMs >= 1200) {
                setSectionState("GROOVE");
              }
            } else {
              sectionTransitionStartMs = 0;
            }
            break;
          }
          case "GROOVE": {
            if (energySlow01 > 0.65 && onsetRate2s > 2.2) {
              if (!sectionTransitionStartMs) sectionTransitionStartMs = nowMs;
              if (nowMs - sectionTransitionStartMs >= 1500) {
                setSectionState("PEAK");
              }
            } else {
              sectionTransitionStartMs = 0;
            }
            break;
          }
          case "PEAK": {
            if (energySlow01 < 0.55) {
              if (!sectionTransitionStartMs) sectionTransitionStartMs = nowMs;
              if (nowMs - sectionTransitionStartMs >= 2000) {
                setSectionState("GROOVE");
              }
            } else {
              sectionTransitionStartMs = 0;
            }
            break;
          }
        }
      }

      controlPlaneDebug.sectionState = sectionState;
    }

    // --- Expressive audio driver (AIVJ-friendly shaped signals) ---
    expressiveDrive = expressiveAudioDriver.onFrame({
      nowMs,
      frame,
      audioValid: gateAudioValid,
      beatTrusted: gateBeatTrusted,
      beat: {
        pulse01: Number(frame.features?.beatPulse ?? 0),
        phase01: Number(frame.features?.beatPhase ?? 0),
        confidence01: Number(frame.features?.beatConfidence ?? 0),
        stability01: Number((frame.features as any)?.beatStability ?? 0),
      },
    });

    // --- Pending preset action (latest-wins, gate + phase window) ---
    if (pendingPresetRequest && !presetHold && !presetLoadInFlight) {
      const origin = pendingPresetRequest.origin;
      const decision = evaluatePresetSwitchGate(nowMs, origin);
      if (decision.allow) {
        pendingPresetRequest = null;
        controlPlaneDebug.denyReasonsTop = [];
        controlPlaneDebug.scheduledAction = `preset:${origin}`;
        lastPresetSwitchMs = nowMs;
        recordControlPlaneEvent("ACTION_COMMIT", `preset:${origin}`);
        noteCouplingSwitchDampen(nowMs, origin);
        void cycleToNextPreset(origin, { skipGate: true });
      } else {
        controlPlaneDebug.denyReasonsTop = decision.reasons.slice(0, 3);
      }
    }

    // --- Pending BG preset action (auto, mid-beat window) ---
    if (pendingBgPresetRequest && !presetHold && !presetLoadInFlight) {
      const origin = pendingBgPresetRequest.origin;
      const decision = evaluateBgPresetSwitchGate(nowMs, `bg:${origin}`);
      if (decision.allow) {
        pendingBgPresetRequest = null;
        controlPlaneDebug.denyReasonsTop = [];
        controlPlaneDebug.scheduledAction = `presetBg:${origin}`;
        lastBgPresetSwitchMs = nowMs;
        recordControlPlaneEvent("ACTION_COMMIT", `presetBg:${origin}`);
        noteCouplingSwitchDampen(nowMs, `bg:${origin}`);
        void cycleToNextPresetBg(origin, { skipGate: true });
      } else {
        controlPlaneDebug.denyReasonsTop = decision.reasons.slice(0, 3);
      }
    }

    // --- Display init sizing (startup / display change) ---
    if (nowMs - displayLastCheckMs >= DISPLAY_CHECK_INTERVAL_MS) {
      displayLastCheckMs = nowMs;
      const next = readDisplayMetrics();
      if (hasDisplayChanged(displayMetrics, next)) {
        displayMetrics = next;
        displayPending = true;
        displayLastChangeMs = nowMs;
        recordControlPlaneEvent(
          "DISPLAY_CHANGE",
          `${next.w}x${next.h}@${next.dpr.toFixed(2)}`
        );
      }
      const nextCap = computeDprCap(displayMetrics.w, displayMetrics.h);
      if (Math.abs(nextCap - currentDprCap) > 1e-3) {
        currentDprCap = nextCap;
        sceneManager.setPixelRatioCap(nextCap);
        projectLayer.setDprCap(nextCap);
        projectLayerBg.setDprCap(nextCap);
        recordControlPlaneEvent("RES_COMMIT", `dprCap:${nextCap.toFixed(2)}`);
      }
      controlPlaneDebug.display.viewportW = displayMetrics.w;
      controlPlaneDebug.display.viewportH = displayMetrics.h;
      controlPlaneDebug.display.dpr = displayMetrics.dpr;
      if (displayMetrics.w > 0 && displayMetrics.h > 0) {
        const idx = pickInitialScaleIndex(displayMetrics.w, displayMetrics.h);
        const scale = RES_SCALE_STEPS[idx] ?? 1;
        controlPlaneDebug.display.initScale = scale;
        controlPlaneDebug.display.targetW = Math.max(
          1,
          Math.floor(displayMetrics.w * scale)
        );
        controlPlaneDebug.display.targetH = Math.max(
          1,
          Math.floor(displayMetrics.h * scale)
        );
      }
      controlPlaneDebug.display.pending = displayPending;
    }
    if (
      displayPending &&
      nowMs - displayLastChangeMs >= DISPLAY_INIT_DEBOUNCE_MS
    ) {
      const applied = applyDisplayInitScale(
        nowMs,
        displayMetrics,
        "displayChange"
      );
      if (applied) {
        displayPending = false;
        controlPlaneDebug.display.pending = false;
      }
    }

    // --- Adaptive resolution (probe -> commit) ---
    {
      const over =
        Number.isFinite(frameTimeP95Ms) &&
        frameTimeP95Ms > RES_P95_THRESHOLD_MS;
      if (over) {
        if (!frameOverSinceMs) frameOverSinceMs = nowMs;
      } else {
        frameOverSinceMs = 0;
        resProbeDownStartMs = 0;
      }

      if (
        frameOverSinceMs &&
        nowMs - frameOverSinceMs >= RES_PROBE_AFTER_MS &&
        resScaleIndex < RES_SCALE_STEPS.length - 1
      ) {
        if (!resProbeDownStartMs) {
          resProbeDownStartMs = nowMs;
          recordControlPlaneEvent("RES_PROBE", "down");
        } else if (nowMs - resProbeDownStartMs >= RES_PROBE_WINDOW_MS) {
          const gate = evaluateResCommitGate(nowMs, "down");
          if (gate.allow) {
            resScaleIndex = Math.min(
              RES_SCALE_STEPS.length - 1,
              resScaleIndex + 1
            );
            const scale = RES_SCALE_STEPS[resScaleIndex];
            applyResolutionScale(scale, nowMs);
            controlPlaneDebug.scheduledAction = `resDown:${scale}`;
            controlPlaneDebug.denyReasonsTop = [];
          } else {
            controlPlaneDebug.denyReasonsTop = gate.reasons.slice(0, 3);
            recordControlPlaneEvent(
              "ACTION_DENY",
              `resDown:${gate.reasons.join(",")}`
            );
          }
          resProbeDownStartMs = 0;
          frameOverSinceMs = nowMs;
        }
      }

      const under =
        Number.isFinite(frameTimeP95Ms) &&
        frameTimeP95Ms > 0 &&
        frameTimeP95Ms < RES_P95_UP_THRESHOLD_MS;
      if (under) {
        if (!frameUnderSinceMs) frameUnderSinceMs = nowMs;
      } else {
        frameUnderSinceMs = 0;
        resProbeUpStartMs = 0;
      }

      if (
        frameUnderSinceMs &&
        nowMs - frameUnderSinceMs >= RES_UP_STABLE_MS &&
        resScaleIndex > 0
      ) {
        if (!resProbeUpStartMs) {
          resProbeUpStartMs = nowMs;
          recordControlPlaneEvent("RES_PROBE", "up");
        } else if (nowMs - resProbeUpStartMs >= RES_PROBE_WINDOW_MS) {
          const gate = evaluateResCommitGate(nowMs, "up");
          if (gate.allow) {
            resScaleIndex = Math.max(0, resScaleIndex - 1);
            const scale = RES_SCALE_STEPS[resScaleIndex];
            applyResolutionScale(scale, nowMs);
            controlPlaneDebug.scheduledAction = `resUp:${scale}`;
            controlPlaneDebug.denyReasonsTop = [];
          } else {
            controlPlaneDebug.denyReasonsTop = gate.reasons.slice(0, 3);
            recordControlPlaneEvent(
              "ACTION_DENY",
              `resUp:${gate.reasons.join(",")}`
            );
          }
          resProbeUpStartMs = 0;
          frameUnderSinceMs = nowMs;
        }
      }
    }

    // Map beat quality to an audio-reactive multiplier.
    // 0.0 -> 1.0x, 1.0 -> ~1.9x
    const kickLong01 = Math.min(
      1,
      Math.max(0, Number(frame.features?.kick01Long ?? 0))
    );
    const bassLong01 = Math.min(
      1,
      Math.max(0, Number(frame.features?.bass01Long ?? frame.bands?.low ?? 0))
    );
    const clapLong01 = Math.min(
      1,
      Math.max(0, Number(frame.features?.clap01Long ?? 0))
    );
    const hihatLong01 = Math.min(
      1,
      Math.max(0, Number(frame.features?.hihat01Long ?? frame.bands?.high ?? 0))
    );

    const beatQualityMul =
      1 + 0.9 * Math.min(1, Math.max(0, beatQuality01Smoothed));
    const technoDrive01 = Math.min(
      1,
      Math.max(
        0,
        0.55 * kickLong01 +
          0.35 * bassLong01 +
          0.25 * clapLong01 +
          0.25 * hihatLong01
      )
    );
    const accent01 = Math.min(
      1,
      Math.max(
        0,
        0.45 * clamp01Runtime(frame.features?.kick01Raw ?? 0, 0) +
          0.2 * clamp01Runtime(frame.features?.clap01Raw ?? 0, 0) +
          0.2 * clamp01Runtime(frame.features?.hihat01Raw ?? 0, 0) +
          0.15 * clamp01Runtime(frame.features?.beatPulse ?? 0, 0)
      )
    );
    const technoMul = 1 + 0.55 * technoDrive01;
    const fluxGate = clamp01Runtime(frame.features?.flux ?? 0, 0);
    const gateBoostRaw = 1 + 0.25 * accent01 + 0.15 * fluxGate;
    const gateBoostMax =
      sectionState === "PEAK" ? 1.45 : sectionState === "GROOVE" ? 1.25 : 1.1;
    const gateBoost = Math.min(gateBoostMax, gateBoostRaw);
    const audioReactiveMul = Math.min(2.4, beatQualityMul * technoMul);
    const pmReactiveCap =
      sectionState === "PEAK" ? 3 : sectionState === "GROOVE" ? 2.5 : 1.8;
    const pmReactiveSectionMul =
      sectionState === "PEAK" ? 1.08 : sectionState === "GROOVE" ? 1 : 0.9;
    const pmReactiveMul = Math.min(
      pmReactiveCap,
      Math.max(
        0,
        audioReactiveMul *
          pmMacroReactiveMultiplier *
          gateBoost *
          pmReactiveSectionMul
      )
    );
    projectLayer.setAudioReactiveMultiplier(pmReactiveMul);
    projectLayerBg.setAudioReactiveMultiplier(pmReactiveMul * 0.55);
    liquidLayer.setAudioReactiveMultiplier(audioReactiveMul);

    // BPM -> ProjectM speed-up (time scale). Only speeds up (never slows down).
    // Weighted by beat quality so it doesn't wobble when tempo is uncertain.
    {
      const bpm = Number(frame.features?.tempoBpm ?? 0);
      const beatQ = clamp01Runtime(beatQuality01Smoothed, 0);
      let timeScale = 1;
      if (beatEnabled && Number.isFinite(bpm) && bpm > 0) {
        const rawScale = clampRuntime(bpm / 120, 1, 2.25);
        timeScale = 1 + (rawScale - 1) * beatQ;
      }
      projectLayer.setTimeScale(timeScale);
      projectLayerBg.setTimeScale(1 + (timeScale - 1) * 0.6);
    }

    // --- Spatial ("3D") macro patch pipeline ---
    // Goals:
    // - Make compositing feel more "3D" (depth fog/edge/blur/layers respond to signals)
    // - Make parameter coupling feel more "3D" (camera/depth signals become stable drives)
    // Runtime-only: no UI write-back, no saved-state mutation.
    {
      const nowMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const dtSec = Math.max(
        0.001,
        Math.min(0.25, (nowMs - spatialLastMs) / 1000)
      );
      spatialLastMs = nowMs;

      const pmVisibilityHoldActive = nowMs < pmVisibilityHoldUntilMs;
      const freezeClosedLoop =
        controlPlaneDebug.freezeFlags.rebuild ||
        controlPlaneDebug.freezeFlags.resCooldown;

      const waveAmplitude = clampRuntime(
        Number(liquidLayer.params.waveAmplitude ?? 0),
        0,
        2
      );
      depthCouplingWave01 = clamp01Runtime(waveAmplitude / 2, 0);

      const tempoBpm = beatEnabled
        ? Number(frame.features?.tempoBpm ?? beatBpmSmoothed ?? 0)
        : 0;
      const beatQ = clamp01Runtime(beatQuality01Smoothed, 0);
      let bpmRatio = 1;
      let bpmLayersBoost = 0;
      if (Number.isFinite(tempoBpm) && tempoBpm > 0) {
        const rawRatio = clampRuntime(tempoBpm / 120, 0.8, 1.6);
        bpmRatio = 1 + (rawRatio - 1) * beatQ;
        bpmLayersBoost = clampRuntime((tempoBpm - 100) * 0.08, -2, 6) * beatQ;
      }
      depthCouplingBpmRatio = bpmRatio;
      depthCouplingBpmLayersBoost = bpmLayersBoost;

      // --- ProjectM closed-loop PI: avgLuma -> signed opacity bias (runtime-only, default off) ---
      // Uses __projectm_verify.avgLuma (produced by ProjectMEngine downsample sampler).
      if (!gateAudioValid) {
        pmClosedLoopLastOutput = 0;
        pmClosedLoopLastError = 0;
        pmClosedLoopLastLuma = 0;
        pmClosedLoopIntegral = 0;
        pmClosedLoopLastUpdateMs = nowMs;
      } else if (pmVisibilityHoldActive) {
        // Freeze PI effect during manual visibility holds.
        pmClosedLoopLastOutput = 0;
        pmClosedLoopLastError = 0;
        pmClosedLoopLastLuma = 0;
        pmClosedLoopLastUpdateMs = nowMs;
      } else if (freezeClosedLoop) {
        // Hold the last output during rebuilds/resolution cooldown to avoid false luma spikes.
        pmClosedLoopLastUpdateMs = nowMs;
      } else if (!pmClosedLoop.enabled) {
        pmClosedLoopLastOutput = 0;
        pmClosedLoopLastError = 0;
        pmClosedLoopLastLuma = 0;
      } else {
        const intervalMs = Math.max(
          100,
          Math.min(5000, pmClosedLoop.intervalMs)
        );
        if (!pmClosedLoopLastUpdateMs) pmClosedLoopLastUpdateMs = nowMs;
        if (nowMs - pmClosedLoopLastUpdateMs >= intervalMs) {
          const verify = (globalThis as any).__projectm_verify;
          const perPm = verify?.perPm ?? {};
          const fg = perPm?.fg ?? {};
          const luma = Number(fg?.avgLuma ?? verify?.avgLuma);
          if (Number.isFinite(luma)) {
            const dtPi = Math.max(
              0.05,
              Math.min(2.0, (nowMs - pmClosedLoopLastUpdateMs) / 1000)
            );
            pmClosedLoopLastUpdateMs = nowMs;

            const target = Math.max(
              0.01,
              Math.min(0.99, pmClosedLoop.targetLuma)
            );
            const e = target - Math.max(0, Math.min(1, luma));
            pmClosedLoopLastError = e;
            pmClosedLoopLastLuma = luma;

            const kp = Math.max(0, pmClosedLoop.kp);
            const ki = Math.max(0, pmClosedLoop.ki);
            const iClamp = Math.max(0, Math.min(1, pmClosedLoop.integralClamp));
            pmClosedLoopIntegral = Math.max(
              -iClamp,
              Math.min(iClamp, pmClosedLoopIntegral + e * ki * dtPi)
            );

            const outClamp = Math.max(0, Math.min(1, pmClosedLoop.outputClamp));
            const rawOut = Math.max(
              -outClamp,
              Math.min(outClamp, kp * e + pmClosedLoopIntegral)
            );
            const maxDelta = Math.max(0, pmClosedLoop.maxDeltaPerSec) * dtPi;
            const delta = Math.max(
              -maxDelta,
              Math.min(maxDelta, rawOut - pmClosedLoopLastOutput)
            );
            pmClosedLoopLastOutput = pmClosedLoopLastOutput + delta;
          }
        }
      }

      // Publish diagnostics fields (read by DiagnosticsPanel via __projectm_verify).
      try {
        (globalThis as any).__projectm_verify = {
          ...(globalThis as any).__projectm_verify,
          closedLoopPiEnabled: pmClosedLoop.enabled,
          closedLoopPiTarget: pmClosedLoop.targetLuma,
          closedLoopPiError: pmClosedLoopLastError,
          closedLoopPiOpacity: pmClosedLoopLastOutput,

          colorLoopEnabled: pmColorLoop.enabled,
          colorLoopHue01: pmColorLoopHue01,
          colorLoopStrength01: pmColorLoopStrength01,
          colorLoopContrastMul: pmColorLoopContrastMul,
        };
      } catch {
        // ignore
      }

      if (pmClosedLoop.enabled && !pmVisibilityHoldActive) {
        const lumaNote = Number.isFinite(pmClosedLoopLastLuma)
          ? ` luma=${pmClosedLoopLastLuma.toFixed(3)}`
          : "";
        const freezeNote = freezeClosedLoop ? " freeze" : "";
        decisionTrace.recordNumeric({
          tMs: nowMs,
          writer: "closedLoopPi",
          target: "projectm.closedLoopPi.opacityBiasSigned",
          value: Number(pmClosedLoopLastOutput ?? 0),
          minIntervalMs: 150,
          minDelta: 0.01,
          digits: 3,
          reason: `e=${Number(pmClosedLoopLastError ?? 0).toFixed(
            3
          )}${lumaNote}${freezeNote}`,
        });
      }

      // Camera portrait signals (0..1). (If segmentation is off, these are typically 0.)
      const camStatus = cameraLayer?.getStatus?.();
      const edge01Raw = clamp01Runtime(
        Number((camStatus as any)?.portraitEdge01 ?? 0),
        0
      );
      const area01Raw = clamp01Runtime(
        Number((camStatus as any)?.portraitArea01 ?? 0),
        0
      );

      // Depth freshness: treat depth as "active" if frames are arriving recently.
      const depthOn = Boolean(layerDepthToggle?.checked);
      const depthStatus = depthOn ? depthLayer.getStatus() : null;
      const framesSeen = depthOn
        ? Number(depthWsStatus?.framesReceived ?? depthStatus?.framesIn ?? 0)
        : 0;
      if (
        depthOn &&
        Number.isFinite(framesSeen) &&
        framesSeen > depthLastFramesSeen
      ) {
        depthLastFramesSeen = framesSeen;
        depthLastFrameMs = nowMs;
      }
      const ageMs =
        depthOn && depthLastFrameMs > 0 ? nowMs - depthLastFrameMs : 1e9;
      const depthFresh01Raw = depthOn ? Math.exp(-Math.max(0, ageMs) / 900) : 0;

      // Smooth (fast attack, slower release) for stable coupling.
      const attackHz = 6.5;
      const releaseHz = 2.0;
      const hzEdge = edge01Raw >= portraitEdge01Smoothed ? attackHz : releaseHz;
      const hzArea = area01Raw >= portraitArea01Smoothed ? attackHz : releaseHz;
      const hzDepth =
        depthFresh01Raw >= depthFresh01Smoothed ? attackHz : releaseHz;
      const aEdge = 1 - Math.exp(-dtSec * hzEdge);
      const aArea = 1 - Math.exp(-dtSec * hzArea);
      const aDepth = 1 - Math.exp(-dtSec * hzDepth);
      portraitEdge01Smoothed += (edge01Raw - portraitEdge01Smoothed) * aEdge;
      portraitArea01Smoothed += (area01Raw - portraitArea01Smoothed) * aArea;
      depthFresh01Smoothed += (depthFresh01Raw - depthFresh01Smoothed) * aDepth;

      const edge01 = clamp01Runtime(portraitEdge01Smoothed, 0);
      const area01 = clamp01Runtime(portraitArea01Smoothed, 0);
      const depth01 = clamp01Runtime(depthFresh01Smoothed, 0);
      scenePortraitFocus01 = clamp01Runtime(0.6 * edge01 + 0.4 * area01, 0);

      // Parameter coupling: camera edge -> ProjectM external opacity drive.
      // Use area as a stabilizer so tiny/noisy masks don't overdrive.
      const edgeDrive01 = clamp01Runtime(edge01 * (0.35 + 0.65 * area01), 0);
      const edgeBias = edgeDrive01 * cameraEdgeToPmAmount01;
      const verify = (globalThis as any).__projectm_verify;
      const perPm = verify?.perPm ?? {};
      const fgStats = perPm?.fg ?? {};
      const bgStats = perPm?.bg ?? {};
      const fgLuma = Number(fgStats?.avgLuma ?? verify?.avgLuma);
      const bgLuma = Number(bgStats?.avgLuma);
      if (Number.isFinite(fgLuma)) couplingLumaFg = fgLuma;
      if (Number.isFinite(bgLuma)) couplingLumaBg = bgLuma;
      couplingLumaValid = Number.isFinite(fgLuma) && Number.isFinite(bgLuma);
      couplingLumaDelta = couplingLumaValid ? fgLuma - bgLuma : 0;
      if (Number.isFinite(fgLuma)) {
        pmAvgLuma01 = clamp01Runtime(fgLuma, pmAvgLuma01);
      }
      const beatPhase01 = clamp01Runtime(
        Number(frame.features?.beatPhase ?? 0),
        0
      );
      const beatPulse01 = clamp01Runtime(
        Number(frame.features?.beatPulse ?? 0),
        0
      );
      const flux01 = clamp01Runtime(Number(frame.features?.flux ?? 0), 0);
      const kick01 = clamp01Runtime(
        Number(frame.features?.kick01Long ?? frame.features?.kick01Raw ?? 0),
        0
      );
      const audioDrive01 = clamp01Runtime(
        0.45 * beatPulse01 + 0.35 * flux01 + 0.2 * kick01,
        0
      );
      const smoothstep = (edge0: number, edge1: number, x: number) => {
        const t =
          edge0 === edge1
            ? 0
            : Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      };
      const phaseW = gateBeatTrusted
        ? Math.min(
            1,
            smoothstep(0.92, 1.0, beatPhase01) +
              smoothstep(0.0, 0.06, beatPhase01)
          )
        : 0;
      const sectionPhaseMul =
        sectionState === "PEAK" ? 1.15 : sectionState === "GROOVE" ? 1 : 0.85;
      const phaseBoost = gateBeatTrusted
        ? clampRuntime((0.7 + 0.5 * phaseW) * sectionPhaseMul, 0.6, 1.6)
        : 1;
      const audioDriveSigned = Math.min(0.45, audioDrive01 * 0.45 * phaseBoost);
      const piBias = pmVisibilityHoldActive ? 0 : pmClosedLoopLastOutput;
      const presetBias = pmPresetExternalOpacityBiasSigned;
      const freezeCoupling =
        controlPlaneDebug.freezeFlags.rebuild ||
        controlPlaneDebug.freezeFlags.resCooldown;
      const audioInvalid = !gateAudioValid;
      while (
        couplingFlipTimes.length &&
        couplingFlipTimes[0] < nowMs - COUPLING_FLIP_WINDOW_MS
      ) {
        couplingFlipTimes.shift();
      }
      const couplingSectionMul =
        sectionState === "PEAK" ? 1.35 : sectionState === "GROOVE" ? 1 : 0.7;
      const lumaDeltaDrive = couplingLumaValid
        ? clampRuntime(
            -couplingLumaDelta * COUPLING_LUMA_DELTA_GAIN * couplingSectionMul,
            -0.35,
            0.35
          )
        : 0;
      const rawCoupling =
        edgeBias + audioDriveSigned + piBias + presetBias + lumaDeltaDrive;
      const nextSign =
        Math.abs(rawCoupling) < 0.02 ? 0 : Math.sign(rawCoupling);
      if (
        nextSign !== 0 &&
        couplingLastSign !== 0 &&
        nextSign !== couplingLastSign
      ) {
        couplingFlipTimes.push(nowMs);
        while (
          couplingFlipTimes.length &&
          couplingFlipTimes[0] < nowMs - COUPLING_FLIP_WINDOW_MS
        ) {
          couplingFlipTimes.shift();
        }
        if (couplingFlipTimes.length >= COUPLING_FLIP_THRESHOLD) {
          couplingDampenUntilMs = nowMs + COUPLING_DAMPEN_MS;
          recordControlPlaneEvent("COUPLER_DAMPEN", "flip");
          couplingFlipTimes.length = 0;
        }
      }
      couplingLastSign = nextSign || couplingLastSign;
      const switchScale =
        nowMs < couplingSwitchDampenUntilMs ? COUPLING_SWITCH_DAMPEN_SCALE : 1;
      const couplingScale =
        (nowMs < couplingDampenUntilMs ? COUPLING_DAMPEN_SCALE : 1) *
        switchScale;
      const signFlipRate2s =
        couplingFlipTimes.length / (COUPLING_FLIP_WINDOW_MS / 1000);
      const kEff =
        freezeCoupling || audioInvalid ? 0 : couplingScale * phaseBoost;
      controlPlaneDebug.coupler.kEff = Number.isFinite(kEff) ? kEff : 0;
      controlPlaneDebug.coupler.phaseW = Number.isFinite(phaseW) ? phaseW : 0;
      controlPlaneDebug.coupler.signFlipRate2s = Number.isFinite(signFlipRate2s)
        ? signFlipRate2s
        : 0;
      controlPlaneDebug.coupler.freeze = freezeCoupling;
      const prevCoupling = couplingLastOutput;
      const externalOpacityDriveSigned = audioInvalid
        ? 0
        : pmVisibilityHoldActive
        ? clampRuntime(presetBias, -1, 1)
        : freezeCoupling
        ? prevCoupling
        : clampRuntime(
            (edgeBias + audioDriveSigned + piBias) * couplingScale + presetBias,
            -1,
            1
          );
      let fgDrive = externalOpacityDriveSigned;
      let bgDrive = clampRuntime(-fgDrive * BG_COUPLE_STRENGTH, -1, 1);
      try {
        const fgBase = Number(projectLayer.getBlendParams().opacity);
        const bgBase = Number(projectLayerBg.getBlendParams().opacity);
        const baseSum =
          (Number.isFinite(fgBase) ? fgBase : 0) +
          (Number.isFinite(bgBase) ? bgBase : 0);
        const driveSum = fgDrive + bgDrive;
        if (driveSum > 0 && baseSum + driveSum > PM_OPACITY_BUDGET) {
          const available = Math.max(0, PM_OPACITY_BUDGET - baseSum);
          const scale = Math.min(1, available / driveSum);
          fgDrive *= scale;
          bgDrive *= scale;
        }
      } catch {
        // ignore
      }
      couplingLastOutput = fgDrive;
      couplingFgDrive = fgDrive;
      couplingBgDrive = bgDrive;
      projectLayer.setExternalOpacityDrive01(fgDrive);
      projectLayerBg.setExternalOpacityDrive01(bgDrive);
      controlPlaneDebug.finalWriter = "projectm.externalOpacityDrive=coupling";
      const lumaNote = couplingLumaValid
        ? ` lumaΔ=${couplingLumaDelta.toFixed(3)}`
        : "";
      decisionTrace.recordNumeric({
        tMs: nowMs,
        writer: "coupling",
        target: "projectm.externalOpacityDrive",
        value: externalOpacityDriveSigned,
        minIntervalMs: 120,
        minDelta: 0.01,
        digits: 3,
        reason: audioInvalid
          ? "AUDIO_INVALID"
          : pmVisibilityHoldActive
          ? `HOLD preset=${presetBias.toFixed(3)}`
          : freezeCoupling
          ? `FREEZE last=${Number(prevCoupling).toFixed(3)}`
          : `edge=${edgeBias.toFixed(3)} audio=${audioDriveSigned.toFixed(
              3
            )} pi=${Number(piBias).toFixed(3)} preset=${presetBias.toFixed(
              3
            )}${lumaNote}`,
      });

      // ProjectM avgColor -> background tint (runtime-only, default off).
      if (!pmColorLoop.enabled) {
        pmColorLoopStrength01 = 0;
        pmColorLoopContrastMul = 1;
      } else {
        const sectionIntervalMul =
          sectionState === "PEAK" ? 0.75 : sectionState === "GROOVE" ? 1 : 1.35;
        const intervalMs = Math.max(
          100,
          Math.min(5000, pmColorLoop.intervalMs * sectionIntervalMul)
        );
        if (!pmColorLoopLastUpdateMs) pmColorLoopLastUpdateMs = nowMs;
        if (nowMs - pmColorLoopLastUpdateMs >= intervalMs) {
          const verify = (globalThis as any).__projectm_verify;
          const perPm = verify?.perPm ?? {};
          const fg = perPm?.fg ?? {};
          const r = Number(fg?.avgColorR ?? verify?.avgColorR);
          const g = Number(fg?.avgColorG ?? verify?.avgColorG);
          const b = Number(fg?.avgColorB ?? verify?.avgColorB);
          if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
            const dtPi = Math.max(
              0.05,
              Math.min(2.0, (nowMs - pmColorLoopLastUpdateMs) / 1000)
            );
            pmColorLoopLastUpdateMs = nowMs;

            // Dominant channel -> hue (R=0, G=1/3, B=2/3).
            let dominantHue01 = 0;
            let dominance = r;
            if (g > dominance) {
              dominance = g;
              dominantHue01 = 1 / 3;
            }
            if (b > dominance) {
              dominance = b;
              dominantHue01 = 2 / 3;
            }

            // Strength scales with dominance above neutral gray.
            const dominanceExcess = Math.max(0, Math.min(1, dominance - 1 / 3));
            const sectionStrengthMul =
              sectionState === "PEAK"
                ? 1.25
                : sectionState === "GROOVE"
                ? 1
                : 0.7;
            const maxStrength = clampRuntime(
              pmColorLoop.maxStrength * sectionStrengthMul,
              0,
              1
            );
            const targetStrength = Math.max(
              0,
              Math.min(maxStrength, dominanceExcess * 3 * pmColorLoop.amount)
            );

            // Counter-hue (dominant + 0.5 turns) with user offset.
            const targetHue01 =
              (dominantHue01 + 0.5 + (pmColorLoop.hueOffset - 0.5) + 1) % 1;

            // Slew-rate limit hue/strength/contrast.
            const maxDelta = Math.max(0, pmColorLoop.maxDeltaPerSec) * dtPi;
            const hueDelta = ((targetHue01 - pmColorLoopHue01 + 1.5) % 1) - 0.5;
            const hueStep = Math.max(-maxDelta, Math.min(maxDelta, hueDelta));
            pmColorLoopHue01 = (pmColorLoopHue01 + hueStep + 1) % 1;

            const strengthDelta = targetStrength - pmColorLoopStrength01;
            const strengthStep = Math.max(
              -maxDelta,
              Math.min(maxDelta, strengthDelta)
            );
            pmColorLoopStrength01 = clampRuntime(
              pmColorLoopStrength01 + strengthStep,
              0,
              1
            );

            const contrastSectionMul =
              sectionState === "PEAK"
                ? 1.2
                : sectionState === "GROOVE"
                ? 1
                : 0.75;
            const targetContrastMul =
              1 +
              clampRuntime(
                pmColorLoop.contrastAmount * contrastSectionMul,
                0,
                0.6
              ) *
                pmColorLoopStrength01;
            const contrastDelta = targetContrastMul - pmColorLoopContrastMul;
            const contrastStep = Math.max(
              -maxDelta,
              Math.min(maxDelta, contrastDelta)
            );
            pmColorLoopContrastMul = clampRuntime(
              pmColorLoopContrastMul + contrastStep,
              0.5,
              2.0
            );
          }
        }

        liquidLayer.setRuntimeColorTuning({
          enabled: true,
          tintHue: pmColorLoopHue01,
          tintStrengthAdd: pmColorLoopStrength01,
          contrastMul: pmColorLoopContrastMul,
        });

        decisionTrace.recordNumeric({
          tMs: nowMs,
          writer: "colorLoop",
          target: "liquid.runtimeColorTuning.tintHue",
          value: pmColorLoopHue01,
          minIntervalMs: 180,
          minDelta: 0.01,
          digits: 3,
          reason: "avgColor -> counter-hue",
        });
        decisionTrace.recordNumeric({
          tMs: nowMs,
          writer: "colorLoop",
          target: "liquid.runtimeColorTuning.tintStrengthAdd",
          value: pmColorLoopStrength01,
          minIntervalMs: 180,
          minDelta: 0.01,
          digits: 3,
          reason: "avgColor -> strength",
        });
        decisionTrace.recordNumeric({
          tMs: nowMs,
          writer: "colorLoop",
          target: "liquid.runtimeColorTuning.contrastMul",
          value: pmColorLoopContrastMul,
          minIntervalMs: 180,
          minDelta: 0.01,
          digits: 3,
          reason: "avgColor -> contrast",
        });
      }

      // Visual compositing: depth feel increases when depth is fresh + portrait area exists.
      // Keep it subtle; users can still dial depth params manually.
      if (depthOn) {
        const baseOpacity = readRangeInputValue01(depthOpacityInput, 0.7);
        const baseFog = readNumberInputValue(depthFogInput, 1.1);
        const baseEdge = readNumberInputValue(depthEdgeInput, 1.3);
        const baseLayers = readNumberInputValue(depthLayersInput, 12);
        const baseBlur = readNumberInputValue(depthBlurInput, 10);
        const baseDepthState = (lastVisualState.background.layers?.depth ??
          {}) as any;
        const baseScale = Number.isFinite(Number(baseDepthState.scale))
          ? Number(baseDepthState.scale)
          : 1;
        const baseFps = Number.isFinite(Number(baseDepthState.fps))
          ? Number(baseDepthState.fps)
          : 15;

        const spatial01 = clamp01Runtime(0.65 * depth01 + 0.35 * area01, 0);
        const portraitFocus01 = clamp01Runtime(scenePortraitFocus01, 0);
        const audio01 = clamp01Runtime(
          0.5 * kickLong01 + 0.35 * bassLong01 + 0.25 * hihatLong01,
          0
        );
        const depthBlurCap =
          sectionState === "PEAK" ? 30 : sectionState === "GROOVE" ? 24 : 18;
        const depthLayersCap =
          sectionState === "PEAK" ? 24 : sectionState === "GROOVE" ? 18 : 14;
        const depthScaleCap =
          sectionState === "PEAK" ? 1.1 : sectionState === "GROOVE" ? 1 : 0.9;
        const depthFpsCap =
          sectionState === "PEAK" ? 24 : sectionState === "GROOVE" ? 18 : 12;
        const focusRetreatMul = clampRuntime(
          1 - 0.25 * portraitFocus01,
          0.6,
          1
        );
        const focusFogMul = clampRuntime(1 - 0.3 * portraitFocus01, 0.5, 1);
        const focusEdgeMul = 1 + 0.35 * portraitFocus01;
        const focusBlurOffset = -6 * portraitFocus01;

        const nextOpacity = clampRuntime(
          baseOpacity *
            (1 + 0.18 * spatial01 + 0.12 * audio01) *
            focusRetreatMul,
          0,
          1
        );
        const nextFog = clampRuntime(
          baseFog * (1 + 0.35 * spatial01 + 0.18 * audio01) * focusFogMul,
          0,
          2.5
        );
        const nextEdge = clampRuntime(
          baseEdge * (1 + 0.45 * edgeDrive01 + 0.2 * audio01) * focusEdgeMul,
          0,
          4
        );
        const nextBlur = clampRuntime(
          baseBlur +
            8 * spatial01 +
            4 * audio01 +
            depthCouplingWave01 * 5 +
            focusBlurOffset,
          0,
          depthBlurCap
        );
        const nextLayers = clampRuntime(
          Math.round(
            baseLayers +
              5 * spatial01 +
              3 * audio01 +
              depthCouplingBpmLayersBoost
          ),
          3,
          depthLayersCap
        );
        const nextScale = clampRuntime(
          baseScale * (1 + depthCouplingWave01 * 0.3),
          0.5,
          depthScaleCap
        );
        const nextFps = clampRuntime(Math.round(baseFps), 5, depthFpsCap);
        depthCouplingFog01 = clamp01Runtime(nextFog / 2.5, 0);
        depthCouplingEdge01 = clamp01Runtime(nextEdge / 4, 0);
        const depthComplex01 = clamp01Runtime(
          0.6 * depthCouplingEdge01 + 0.4 * depthCouplingFog01,
          0
        );
        const profileDepthMul =
          aivj.profile === "peakRave"
            ? 1.05
            : aivj.profile === "videoVj"
            ? 0.9
            : aivj.profile === "drone"
            ? 0.85
            : aivj.profile === "ambient"
            ? 0.9
            : aivj.profile === "dub"
            ? 0.95
            : 1;
        const portraitDepthMul = clampRuntime(
          1 - 0.35 * portraitFocus01,
          0.6,
          1
        );
        sceneDepthWeightMul = clampRuntime(
          (1 - depthComplex01 * 0.35) * profileDepthMul * portraitDepthMul,
          0.55,
          1.2
        );

        // Apply at a modest rate to avoid triggering expensive re-processing too often.
        const APPLY_INTERVAL_MS = 120;
        if (nowMs - depthRuntimeLastApplyMs >= APPLY_INTERVAL_MS) {
          depthRuntimeLastApplyMs = nowMs;

          const prev = depthRuntimeLast;
          const changed =
            !prev ||
            Math.abs(prev.opacity - nextOpacity) > 0.005 ||
            Math.abs(prev.fog - nextFog) > 0.02 ||
            Math.abs(prev.edge - nextEdge) > 0.02 ||
            Math.abs(prev.blur - nextBlur) > 0.5 ||
            Math.abs(prev.layers - nextLayers) > 0.5 ||
            Math.abs(prev.scale - nextScale) > 0.02 ||
            Math.abs(prev.fps - nextFps) > 0.5;

          if (changed) {
            depthRuntimeLast = {
              opacity: nextOpacity,
              fog: nextFog,
              edge: nextEdge,
              blur: nextBlur,
              layers: nextLayers,
              scale: nextScale,
              fps: nextFps,
            };
            depthLayer.applyParams({
              opacity: nextOpacity,
              fog: nextFog,
              edge: nextEdge,
              blur: nextBlur,
              layers: nextLayers,
              scale: nextScale,
              fps: nextFps,
            });
          }
        }
      }
      if (!depthOn) {
        depthCouplingFog01 = 0;
        depthCouplingEdge01 = 0;
        sceneDepthWeightMul = 1;
      }
    }

    // --- overlayBudget: dynamic overlay opacity + ProjectM retreat (runtime-only) ---
    {
      const dtMs = overlayBudgetLastMs ? nowMs - overlayBudgetLastMs : 0;
      overlayBudgetLastMs = nowMs;
      const tauMs = Math.max(1, Number(overlayBudget.smoothBaseMs) || 33);
      const alpha = 1 - Math.exp(-Math.max(0, dtMs) / tauMs);

      const pmVisibilityHoldActive = nowMs < pmVisibilityHoldUntilMs;

      const energy01 = clamp01Runtime(
        Number(frame.energy ?? (frame as any).energyRaw ?? 0),
        0
      );
      const depth01 = clamp01Runtime(depthFresh01Smoothed, 0);

      overlayBudgetDiag.energy01 = energy01;
      overlayBudgetDiag.depthFresh01 = depth01;

      const enabledBasic = Boolean(layerBasicToggle?.checked);
      const enabledCamera = Boolean(layerCameraToggle?.checked);
      const enabledVideo = Boolean(layerVideoToggle?.checked);
      const enabledDepth = Boolean(layerDepthToggle?.checked);

      const portraitFocus01 = clamp01Runtime(scenePortraitFocus01, 0);
      const cameraBoost = 1 + 0.45 * portraitFocus01;
      const videoBoost = 1 + 0.35 * (1 - portraitFocus01);
      const depthWeightMul = clampRuntime(sceneDepthWeightMul, 0.6, 1.2);

      const wBasic = enabledBasic
        ? Number(overlayBudget.priorityBasic) || 0
        : 0;
      const wCamera = enabledCamera
        ? (Number(overlayBudget.priorityCamera) || 0) * cameraBoost
        : 0;
      const wVideo = enabledVideo
        ? (Number(overlayBudget.priorityVideo) || 0) * videoBoost
        : 0;
      const wDepth = enabledDepth
        ? (Number(overlayBudget.priorityDepth) || 0) *
          (1 + (Number(overlayBudget.depthWeight) || 0) * depth01) *
          depthWeightMul
        : 0;

      const total = wBasic + wCamera + wVideo + wDepth;
      const nActive = [wBasic, wCamera, wVideo, wDepth].filter(
        (w) => w > 0
      ).length;
      overlayBudgetDiag.nActive = nActive;

      const sectionOverlayMaxMul =
        sectionState === "PEAK" ? 0.85 : sectionState === "GROOVE" ? 1 : 1.15;
      const maxEnergy = Math.max(
        0.05,
        (Number(overlayBudget.maxEnergy) || 1.15) * sectionOverlayMaxMul
      );
      const budget01 = total > 0 ? clamp01Runtime(energy01 / maxEnergy, 0) : 0;
      const minScale = clampRuntime(Number(overlayBudget.minScale) || 0, 0, 1);
      const scale = minScale + (1 - minScale) * budget01;
      overlayBudgetDiag.scale = scale;

      const shareMul = (w: number) => {
        if (total <= 0 || nActive <= 0) return 1;
        return clampRuntime(scale * (w / total) * nActive, 0, 1);
      };

      const tBasic = wBasic > 0 ? shareMul(wBasic) : 1;
      const tCamera = wCamera > 0 ? shareMul(wCamera) : 1;
      const tVideo = wVideo > 0 ? shareMul(wVideo) : 1;
      const tDepth = wDepth > 0 ? shareMul(wDepth) : 1;

      overlayMulBasic = overlayMulBasic + (tBasic - overlayMulBasic) * alpha;
      overlayMulCamera =
        overlayMulCamera + (tCamera - overlayMulCamera) * alpha;
      overlayMulVideo = overlayMulVideo + (tVideo - overlayMulVideo) * alpha;
      overlayMulDepth = overlayMulDepth + (tDepth - overlayMulDepth) * alpha;

      if (nowMs < overlayBudgetHoldUntil.basic) overlayMulBasic = 1;
      if (nowMs < overlayBudgetHoldUntil.camera) overlayMulCamera = 1;
      if (nowMs < overlayBudgetHoldUntil.video) overlayMulVideo = 1;
      if (nowMs < overlayBudgetHoldUntil.depth) overlayMulDepth = 1;

      // ProjectM retreat: overlays dominate -> PM backs off (floor prevents blackout).
      const sumActiveOverlayMul =
        (wBasic > 0 ? overlayMulBasic : 0) +
        (wCamera > 0 ? overlayMulCamera : 0) +
        (wVideo > 0 ? overlayMulVideo : 0) +
        (wDepth > 0 ? overlayMulDepth : 0);
      const meanOverlayMul = nActive > 0 ? sumActiveOverlayMul / nActive : 0;
      overlayBudgetDiag.meanOverlayMul = meanOverlayMul;
      const sectionRetreatMul =
        sectionState === "PEAK" ? 0.75 : sectionState === "GROOVE" ? 1 : 1.2;
      const retreatStrength = clampRuntime(
        (Number(overlayBudget.pmRetreatStrength) || 0) * sectionRetreatMul,
        0,
        1
      );
      const retreatFloor = clampRuntime(
        Number(overlayBudget.pmRetreatFloor) || 0.55,
        0,
        1
      );
      const pmTarget = clampRuntime(
        1 - retreatStrength * clamp01Runtime(meanOverlayMul, 0),
        retreatFloor,
        1
      );
      overlayBudgetDiag.pmTarget = pmVisibilityHoldActive ? 1 : pmTarget;
      overlayMulProjectM =
        overlayMulProjectM + (pmTarget - overlayMulProjectM) * alpha;

      if (pmVisibilityHoldActive) overlayMulProjectM = 1;

      decisionTrace.recordNumeric({
        tMs: nowMs,
        writer: "overlayBudget",
        target: "overlayBudget.projectmMul",
        value: overlayMulProjectM,
        minIntervalMs: 200,
        minDelta: 0.01,
        digits: 3,
        reason: pmVisibilityHoldActive
          ? "HOLD manual"
          : `meanOverlayMul=${meanOverlayMul.toFixed(
              3
            )} pmTarget=${pmTarget.toFixed(3)} sec=${sectionState}`,
      });

      (basicLayer as any)?.setOverlayOpacityMultiplier?.(overlayMulBasic);
      (cameraLayer as any)?.setOverlayOpacityMultiplier?.(overlayMulCamera);
      (videoLayer as any)?.setOverlayOpacityMultiplier?.(overlayMulVideo);
      (depthLayer as any)?.setOverlayOpacityMultiplier?.(overlayMulDepth);
      (projectLayer as any)?.setOverlayOpacityMultiplier?.(overlayMulProjectM);
      (projectLayerBg as any)?.setOverlayOpacityMultiplier?.(
        overlayMulProjectM
      );
    }

    // --- Unified macro writer: AudioControls + AIVJ slow + accent ---
    {
      const baseBank = getMacroBankFromState();
      const humanHoldActive =
        macroWriteOwner === "human" && nowMs < macroWriteOwnerUntilMs;
      const audioGateOk = gateAudioValid;
      const audioEnabled =
        audioGateOk && Boolean(audioControlsCfg.enabled) && !humanHoldActive;
      const aiEnabled =
        audioGateOk && Boolean(aivj.enabled) && !humanHoldActive;
      const sectionMixMul =
        sectionState === "PEAK" ? 1.1 : sectionState === "GROOVE" ? 1 : 0.8;
      const mixToMacros01 = clamp01Runtime(
        audioControlsCfg.mixToMacros * sectionMixMul,
        0
      );
      const out = aivjController.onFrame({
        enabled: aiEnabled,
        profile: aivj.profile,
        nowMs,
        midiLock,
        manualHoldUntilMs: aivjManualHoldUntilMs,
        morphHoldUntilMs: aivjMorphHoldUntilMs,
        frame,
        baseBank,
        sectionState,
        sectionIntensity01,
        expressive: expressiveDrive ?? undefined,
        audioControls: {
          enabled: audioEnabled,
          mixToMacros01,
          fusion01: clamp01Runtime(audioControlsSnap.fusion01, 0.5),
          motion01: clamp01Runtime(audioControlsSnap.motion01, 0.5),
          sparkle01: clamp01Runtime(audioControlsSnap.sparkle01, 0.5),
        },
        beat: {
          phase01: clamp01Runtime(Number(frame.features?.beatPhase ?? 0), 0),
          pulse01: clamp01Runtime(Number(frame.features?.beatPulse ?? 0), 0),
          confidence01: clamp01Runtime(
            Number(frame.features?.beatConfidence ?? 0),
            0
          ),
          stability01: clamp01Runtime(
            Number((frame.features as any)?.beatStability ?? 0),
            0
          ),
        },
        portraitEdge01: portraitEdge01Smoothed,
      });

      const neutralBank: MacroBank = {
        macros: { fusion: 0.5, motion: 0.5, sparkle: 0.5 },
        slots: [0.5, 0.5, 0.5, 0.5, 0.5],
      };
      const rawBank = audioGateOk ? out.runtimeBank : neutralBank;
      const runtimeBank = applySceneMacroBias(rawBank);

      lastAivjDebug = out.debug;
      lastAivjBaseBank = baseBank;
      lastAivjRuntimeBank = runtimeBank;

      if (aiEnabled && out.debug) {
        const accent01 = Number(out.debug.accent01);
        if (Number.isFinite(accent01)) {
          decisionTrace.recordNumeric({
            tMs: nowMs,
            writer: "ai",
            target: "aivj.accent01",
            value: accent01,
            minIntervalMs: 140,
            minDelta: 0.02,
            digits: 3,
            reason: out.debug.accentSource
              ? `src=${out.debug.accentSource}`
              : undefined,
          });
        }
        const slotPulse01 = Number(out.debug.slotPulse01);
        if (Number.isFinite(slotPulse01)) {
          decisionTrace.recordNumeric({
            tMs: nowMs,
            writer: "ai",
            target: "aivj.slotPulse01",
            value: slotPulse01,
            minIntervalMs: 140,
            minDelta: 0.003,
            digits: 3,
            reason: out.debug.accentSource
              ? `src=${out.debug.accentSource}`
              : undefined,
          });
        }
      }

      if (!humanHoldActive && out.commitSlowBankToState && audioGateOk) {
        commitAivjSlowBankToState(out.commitSlowBankToState);
      }

      const shouldApply = nowMs - macroRuntimeLastApplyMs >= 33;
      if (shouldApply && !humanHoldActive) {
        const canAiWrite =
          aiEnabled && !midiLock && nowMs >= aivjManualHoldUntilMs;
        const writer: MacroWriteSource = canAiWrite ? "ai" : "runtime";
        const holdMs = writer === "ai" ? 1000 : 250;
        if (requestMacroWriteOwner(writer, nowMs, holdMs)) {
          macroRuntimeLastApplyMs = nowMs;
          applyMacroBankToRuntime(runtimeBank, {
            syncUi: writer === "ai" && followAiUiEnabled,
          });
          updateMacroBankPill();
        }
      } else if (humanHoldActive) {
        updateMacroBankPill();
      }
    }

    // --- Cross-layer coupling: depth/bpm/luma -> Liquid + ProjectM (runtime-only) ---
    {
      const depthFog01 = clamp01Runtime(depthCouplingFog01, 0);
      const depthEdge01 = clamp01Runtime(depthCouplingEdge01, 0);
      const bpmRatio = clampRuntime(depthCouplingBpmRatio, 0.8, 1.6);
      const luma01 = clamp01Runtime(pmAvgLuma01, 0);

      liquidLayer.setRuntimeParamTuning({
        enabled: true,
        timeScaleMul: bpmRatio,
        metallicAmountAdd: depthFog01 * 0.3,
        brightnessMul: 1 + luma01 * 0.35,
      });

      if (!pmColorLoop.enabled) {
        const tintHue = (0.08 + luma01 * 0.6) % 1;
        liquidLayer.setRuntimeColorTuning({
          enabled: luma01 > 0,
          tintHue,
          tintStrengthAdd: luma01 * 0.25,
          paletteStrengthAdd: luma01 * 0.18,
          contrastMul: 1 + luma01 * 0.15,
        });
      }

      const fgBlend = projectLayer.getBlendParams();
      const fgBaseEnergy = clampRuntime(
        fgBlend.energyToOpacityAmount - pmEnergyDepthBoost,
        0,
        1
      );
      const fgBoost = depthEdge01 * 0.2;
      const fgEnergy = clampRuntime(fgBaseEnergy + fgBoost, 0, 1);
      if (Math.abs(fgEnergy - fgBlend.energyToOpacityAmount) > 0.001) {
        projectLayer.setBlendParams({
          ...fgBlend,
          energyToOpacityAmount: fgEnergy,
        });
      }
      pmEnergyDepthBoost = fgBoost;

      const bgBlend = projectLayerBg.getBlendParams();
      const bgBaseEnergy = clampRuntime(
        bgBlend.energyToOpacityAmount - pmEnergyDepthBoostBg,
        0,
        1
      );
      const bgBoost = depthEdge01 * 0.12;
      const bgEnergy = clampRuntime(bgBaseEnergy + bgBoost, 0, 1);
      if (Math.abs(bgEnergy - bgBlend.energyToOpacityAmount) > 0.001) {
        projectLayerBg.setBlendParams({
          ...bgBlend,
          energyToOpacityAmount: bgEnergy,
        });
      }
      pmEnergyDepthBoostBg = bgBoost;
    }

    // --- Auto director: scene-driven preset switching + liquid variant choreography ---
    {
      const allowAutoDirector =
        aivj.enabled &&
        !presetHold &&
        !midiLock &&
        nowMs >= aivjManualHoldUntilMs;
      const allowPresetAuto =
        allowAutoDirector && Boolean(presetAutoToggle?.checked);
      const bank = lastAivjRuntimeBank ?? getMacroBankFromState();
      const macros = bank?.macros ?? { fusion: 0.5, motion: 0.5, sparkle: 0.5 };
      const fusion = clamp01Local(macros.fusion, 0.5);
      const motion = clamp01Local(macros.motion, 0.5);
      const sparkle = clamp01Local(macros.sparkle, 0.5);

      if (allowPresetAuto) {
        const energyDelta = autoPresetEnergyFast - autoPresetEnergySlow;
        const beatPulse01 = clamp01Runtime(
          Number(frame.features?.beatPulse ?? 0),
          0
        );
        const beatQuality01 = clamp01Runtime(beatQuality01Smoothed, 0);
        const drive01 = Math.max(motion, sparkle);
        const baseCooldownMs =
          sceneLabel === "ambient"
            ? 22000
            : sceneLabel === "rock"
            ? 14000
            : 11000;
        const qualityCooldownMul = 1 + (1 - beatQuality01) * 1.1;
        const sceneCooldownMs = baseCooldownMs * qualityCooldownMul;
        const canPreset = nowMs - autoPresetLastMs > sceneCooldownMs;
        const pulseGate = 0.2 * (0.7 + 0.3 * beatQuality01);
        const energyTrigger =
          energyDelta > 0.2 &&
          drive01 > 0.6 &&
          beatQuality01 > 0.35 &&
          beatPulse01 > pulseGate;
        const sceneShift =
          sceneLabel !== autoPresetScene &&
          nowMs - sceneLastSwitchMs < 3000 &&
          beatQuality01 > 0.25;
        if ((energyTrigger || sceneShift) && canPreset) {
          autoPresetLastMs = nowMs;
          autoPresetScene = sceneLabel;
          requestPresetCycle("auto");
          if (
            sceneLabel === "techno" &&
            beatQuality01Smoothed > 0.6 &&
            nowMs - autoBgPresetLastMs > 18000
          ) {
            autoBgPresetLastMs = nowMs;
            requestBgPresetCycle("auto");
          }
        }
      }

      if (
        allowAutoDirector &&
        !liquidVariantLocked &&
        Boolean(layerLiquidToggle?.checked)
      ) {
        const currentVariant = liquidLayer.params.variant ?? "metal";
        let nextVariant = currentVariant;
        if (sparkle >= 0.72) {
          nextVariant = "stars";
        } else if (motion >= 0.68) {
          nextVariant = "waves";
        } else if (fusion <= 0.35) {
          nextVariant = "lines";
        } else {
          nextVariant = "metal";
        }

        if (nextVariant !== currentVariant) {
          const variantCooldownMs =
            sceneLabel === "ambient"
              ? 15000
              : sceneLabel === "rock"
              ? 11000
              : 9000;
          if (nowMs - autoVariantLastMs > variantCooldownMs) {
            autoVariantLastMs = nowMs;
            applyBackgroundLayerPatch(
              "liquid",
              { variant: nextVariant },
              "macro"
            );
          }
        }
      }
    }

    if (nowMs - lastVisibilityRescueMs > 1500) {
      const liquidOn = Boolean(layerLiquidToggle?.checked ?? true);
      const basicOn = Boolean(layerBasicToggle?.checked);
      const cameraOn = Boolean(layerCameraToggle?.checked);
      const videoOn = Boolean(layerVideoToggle?.checked);
      const depthOn = Boolean(layerDepthToggle?.checked);
      const anyLayerOn = liquidOn || basicOn || cameraOn || videoOn || depthOn;
      if (!anyLayerOn && !projectLayer.isReady()) {
        if (!basicOn) {
          applyBackgroundLayerPatch("basic", { enabled: true }, "user");
          if (layerBasicToggle) layerBasicToggle.checked = true;
        }
        ensureVisibleBaseline();
        lastVisibilityRescueMs = nowMs;
      }
    }

    projectLayer.setAudioFrame(frame);
    projectLayerBg.setAudioFrame(frame);
    liquidLayer.setAudioFrame(frame);
    checkProjectMMotionWatch(nowMs);
    audioTransport.onAudioFrame(frame);
    if (beatEnabled) {
      beatTempo.onAudioFrame(frame, { maxFps: beatTempoFpsCap });
    }
    drawWaveform(frame.pcm512MonoRaw ?? frame.pcm512Mono);

    // Track audio liveness + a stable UI energy (raw-first) for toolbar/AIVJ indicators.
    lastAudioFrameMs = performance.now();
    {
      const energy01 = Math.min(
        1,
        Math.max(0, frame.energy ?? (frame as any).energyRaw ?? 0)
      );
      const nowMs = performance.now();
      const dtSec = Math.max(0.001, (nowMs - uiEnergyLastMs) / 1000);
      uiEnergyLastMs = nowMs;
      // Exponential smoothing (snappy but not jumpy).
      const alpha = 1 - Math.exp(-dtSec * 9.0);
      uiEnergy01Smoothed =
        uiEnergy01Smoothed + (energy01 - uiEnergy01Smoothed) * alpha;
    }
    currentEnergyLevel = frame.energy;
    const now = performance.now();
    if (now - lastDiagnosticsUpdate >= DIAGNOSTICS_THROTTLE_MS) {
      // Keep takeover UI fresh even when no new writes occur.
      updateMacroBankPill();

      // Toolbar metrics (snappy, human-friendly).
      if (dom.audioEnergyText) {
        const pctRaw = Math.min(1, Math.max(0, uiEnergy01Smoothed)) * 100;
        dom.audioEnergyText.textContent =
          pctRaw > 0 && pctRaw < 1
            ? `E ${pctRaw.toFixed(1)}%`
            : `E ${Math.round(pctRaw)}%`;
      }
      const tempo = beatEnabled ? beatTempo.getSnapshot() : null;
      if (dom.audioTempoText) {
        if (!beatEnabled) {
          dom.audioTempoText.textContent = "BPM off";
          dom.audioTempoText.title = "BeatTempo disabled";
        } else if (!tempo) {
          dom.audioTempoText.textContent = "BPM --";
        } else {
          const conf01 = Math.min(1, Math.max(0, tempo.confidence01 ?? 0));
          const displayBpm = beatBpmUi > 0 ? beatBpmUi : Number(tempo.bpm || 0);
          const hasBpm = Number.isFinite(displayBpm) && displayBpm > 0;
          dom.audioTempoText.textContent = tempo.lastError
            ? "BPM err"
            : hasBpm
            ? `BPM ${Math.round(displayBpm)}`
            : "BPM --";
          dom.audioTempoText.title = tempo.lastError
            ? `BeatTempo error: ${tempo.lastError}`
            : `confidence=${Math.round(conf01 * 100)}% ok=${
                tempo.ok ? "1" : "0"
              }`;
        }
      }
      if (dom.audioConfText) {
        if (!beatEnabled) {
          dom.audioConfText.textContent = "C off";
          dom.audioConfText.title = "BeatTempo disabled";
        } else if (!tempo) {
          dom.audioConfText.textContent = "C --%";
        } else {
          const conf01 = Math.min(1, Math.max(0, tempo.confidence01 ?? 0));
          dom.audioConfText.textContent = tempo.lastError
            ? "C err"
            : `C ${Math.round(conf01 * 100)}%`;
          dom.audioConfText.title = tempo.lastError
            ? `BeatTempo error: ${tempo.lastError}`
            : "";
        }
      }

      if (dom.audioStabilityText) {
        if (!beatEnabled) {
          dom.audioStabilityText.textContent = "S off";
          dom.audioStabilityText.title = "BeatTempo disabled";
        } else if (!tempo) {
          dom.audioStabilityText.textContent = "S --%";
        } else {
          const s01 = Math.min(1, Math.max(0, (tempo as any).stability01 ?? 0));
          dom.audioStabilityText.textContent = tempo.lastError
            ? "S err"
            : `S ${Math.round(s01 * 100)}%`;
          dom.audioStabilityText.title = tempo.lastError
            ? `BeatTempo error: ${tempo.lastError}`
            : "";
        }
      }

      if (pmBudgetStatusText) {
        const meanMul = Math.min(
          1,
          Math.max(0, Number(overlayBudgetDiag.meanOverlayMul ?? 0))
        );
        const pmTarget = Math.min(
          1,
          Math.max(0, Number(overlayBudgetDiag.pmTarget ?? 1))
        );
        pmBudgetStatusText.textContent = `budget ${Math.round(
          meanMul * 100
        )}% | pm ${Math.round(pmTarget * 100)}%`;
      }

      // AIVJ audio ingestion indicator (reuse existing summary text; no new UI).
      if (technoProfileSummary && aivj.enabled) {
        const ageMs = lastAudioFrameMs
          ? Math.max(0, now - lastAudioFrameMs)
          : 0;
        const ePct = Math.round(
          Math.min(1, Math.max(0, uiEnergy01Smoothed)) * 100
        );
        technoProfileSummary.textContent = `profile=${
          aivj.profile
        } | morph=~4s | audio=${
          ageMs < 300 ? "ok" : `${Math.round(ageMs)}ms`
        } | E=${ePct}%`;
      }

      {
        const clamp01Diag = (v: unknown, fb: number) => {
          const n = Number(v);
          if (!Number.isFinite(n)) return fb;
          return Math.min(1, Math.max(0, n));
        };

        const bankToDiag = (bank: MacroBank) => {
          const slots = Array.isArray(bank.slots) ? bank.slots : [];
          return {
            fusion: clamp01Diag(bank.macros.fusion, 0.5),
            motion: clamp01Diag(bank.macros.motion, 0.5),
            sparkle: clamp01Diag(bank.macros.sparkle, 0.5),
            m4: clamp01Diag(slots[0] ?? 0.5, 0.5),
            m5: clamp01Diag(slots[1] ?? 0.5, 0.5),
            m6: clamp01Diag(slots[2] ?? 0.5, 0.5),
            m7: clamp01Diag(slots[3] ?? 0.5, 0.5),
            m8: clamp01Diag(slots[4] ?? 0.5, 0.5),
          };
        };

        const bindings = midiController?.getBindings?.() ?? [];
        const midiMacroBankBound = bankTargets.filter((t) =>
          bindings.some((b) => sameTarget(b.target, t))
        ).length;

        const baseBank = lastAivjBaseBank ?? getMacroBankFromState();
        const runtimeBank = lastAivjRuntimeBank;
        diagnosticsPanel.updateAivj({
          enabled: aivj.enabled,
          macroBankMode: midiLock ? "midiLock" : "ai",
          midiMacroBankBound,
          midiBindingsTotal: bindings.length,
          userBank: bankToDiag(baseBank),
          aiBank: runtimeBank ? bankToDiag(runtimeBank) : undefined,
          debug: lastAivjDebug
            ? {
                mode: lastAivjDebug.mode,
                section: lastAivjDebug.section,
                stage: lastAivjDebug.stage,
                mix01: lastAivjDebug.mix01,
                targetAgeMs: lastAivjDebug.targetAgeMs,
                accent01: lastAivjDebug.accent01,
                slotPulse01: lastAivjDebug.slotPulse01,
                accentSource: lastAivjDebug.accentSource,
              }
            : undefined,
        });
      }

      diagnosticsPanel.updateAudioContext(audioBus.audioContextInfo);
      diagnosticsPanel.updateAudioFrame({
        energy: frame.energy,
        rms: frame.rms,
        peak: frame.peak,
        bands: frame.bands,
        bandsRaw: frame.bandsRaw,
        bandsStage: frame.bandsStage,
        features: frame.features,
        isSilent: frame.isSilent,
      });
      diagnosticsPanel.updateProjectM(
        (globalThis as any).__projectm_verify ?? {}
      );
      const soak = summarizeSoak();
      if (now - lastSoakReportMs >= SOAK_REPORT_INTERVAL_MS) {
        lastSoakReportMs = now;
        console.info("[SoakStats]", {
          avgLoadMs: Math.round(soak.avgLoadMs),
          hardTop: soak.hardTop,
          softTop: soak.softTop,
          aestheticTop: soak.aestheticTop,
          totals: {
            ok: presetLoadTotalCount,
            hard: presetHardFailCount,
            soft: presetSoftFailCount,
            aesthetic: presetAestheticFailCount,
            anchor: anchorFallbackCount,
          },
        });
        recordControlPlaneEvent("SOAK_REPORT", "console");
      }

      const clampOpacity = (value: unknown) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return undefined;
        return Math.min(1, Math.max(0, n));
      };
      const layerOpacity = (layer?: { getOpacity?: () => number } | null) =>
        clampOpacity(layer?.getOpacity?.());

      diagnosticsPanel.updateRuntimeDebug({
        macroOwner: macroWriteOwner,
        macroOwnerTtlMs: Math.max(0, macroWriteOwnerUntilMs - nowMs),
        aivjManualHoldMs: Math.max(0, aivjManualHoldUntilMs - nowMs),
        midiLock,
        aivjEnabled: aivj.enabled,
        overlay: {
          energy01: overlayBudgetDiag.energy01,
          depthFresh01: overlayBudgetDiag.depthFresh01,
          nActive: overlayBudgetDiag.nActive,
          scale: overlayBudgetDiag.scale,
          meanOverlayMul: overlayBudgetDiag.meanOverlayMul,
          pmTarget: overlayBudgetDiag.pmTarget,
          basic: overlayMulBasic,
          camera: overlayMulCamera,
          video: overlayMulVideo,
          depth: overlayMulDepth,
          projectm: overlayMulProjectM,
        },
        layers: {
          liquid: clampOpacity(liquidLayer.params.opacity),
          pmFg: {
            opacity: clampOpacity(projectLayer.getOpacity()),
            drive: couplingFgDrive,
          },
          pmBg: {
            opacity: clampOpacity(projectLayerBg.getOpacity()),
            drive: couplingBgDrive,
          },
          basic: layerOpacity(basicLayer),
          camera: layerOpacity(cameraLayer),
          video: layerOpacity(videoLayer),
          depth: layerOpacity(depthLayer),
        },
        controlPlane: controlPlaneDebug,
        soak: {
          avgLoadMs: soak.avgLoadMs,
          hardTop: soak.hardTop,
          softTop: soak.softTop,
          aestheticTop: soak.aestheticTop,
        },
      });
      diagnosticsPanel.updateRenderer({
        ...sceneManager.getRendererInfo(),
        compositor: sceneManager.getCompositorConfig(),
      });

      const topologySnapshot: DecisionTopologySnapshot = {
        nowMs,
        decisionTrace: {
          recent: decisionTrace.getRecent({
            sinceMs: nowMs - 15_000,
            limit: 48,
          }),
        },
        audio: {
          playing: Boolean(audioBus.audioContextInfo.playing),
          source: audioBus.audioContextInfo.source,
          ctxState: audioBus.audioContextInfo.state,
        },
        audioFrame: {
          energy01: frame.energy,
          rms: frame.rms,
          peak: frame.peak,
          tempoBpm: frame.features?.tempoBpm,
          beatConfidence01: frame.features?.beatConfidence,
          beatStability01: frame.features?.beatStability,
        },
        beatTempo: (() => {
          try {
            const cfg = beatTempo.getConfig();
            const snap = beatTempo.getSnapshot();
            return {
              enabled: Boolean(cfg.enabled),
              windowSec: Number(cfg.windowSec),
              updateIntervalMs: Number(cfg.updateIntervalMs),
              minTempo: Number(cfg.minTempo),
              maxTempo: Number(cfg.maxTempo),
              method: cfg.method,
              inputFps: Number(cfg.inputFps),
              ok: Boolean(snap.ok),
              bpm: Number(snap.bpm),
              confidence01: Number(snap.confidence01),
              stability01: Number(snap.stability01),
              beatPhase01: Number(snap.beatPhase),
              beatPulse01: Number(snap.beatPulse),
            };
          } catch {
            return undefined;
          }
        })(),
        audioControls: (() => {
          try {
            const cfg = audioControls.getConfig();
            const snap = audioControls.getSnapshot();
            return {
              enabled: Boolean(cfg.enabled),
              mixToMacros: Number(cfg.mixToMacros),
              attackMs: Number(cfg.attackMs),
              releaseMs: Number(cfg.releaseMs),
              maxDeltaPerSec: Number(cfg.maxDeltaPerSec),
              amounts: {
                projectm: Number(cfg.amounts.projectm),
                liquid: Number(cfg.amounts.liquid),
                basic: Number(cfg.amounts.basic),
                camera: Number(cfg.amounts.camera),
                video: Number(cfg.amounts.video),
                depth: Number(cfg.amounts.depth),
              },
              snapshot: {
                energy01: Number(snap.energy01),
                bass01: Number(snap.bass01),
                flux01: Number(snap.flux01),
                beatPulse01: Number(snap.beatPulse01),
                fusion01: Number(snap.fusion01),
                motion01: Number(snap.motion01),
                sparkle01: Number(snap.sparkle01),
              },
            };
          } catch {
            return undefined;
          }
        })(),
        aivj: {
          enabled: aivj.enabled,
          profile: aivj.profile,
          macroOwner: macroWriteOwner,
          macroOwnerTtlMs: Math.max(0, macroWriteOwnerUntilMs - nowMs),
          manualHoldMs: Math.max(0, aivjManualHoldUntilMs - nowMs),
          baseBank: lastAivjBaseBank ?? getMacroBankFromState(),
          runtimeBank: lastAivjRuntimeBank,
          debug: lastAivjDebug
            ? {
                mode: lastAivjDebug.mode,
                section: lastAivjDebug.section,
                stage: lastAivjDebug.stage,
                mix01: lastAivjDebug.mix01,
                targetAgeMs: lastAivjDebug.targetAgeMs,
                accent01: lastAivjDebug.accent01,
                slotPulse01: lastAivjDebug.slotPulse01,
                accentSource: lastAivjDebug.accentSource,
              }
            : undefined,
        },
        macroPreset: {
          id: currentMacroPresetId ?? null,
          label: getMacroPresetLabel(currentMacroPresetId),
          autoApply: Boolean(macroPresetAutoToggle?.checked),
        },
        overlay: {
          energy01: overlayBudgetDiag.energy01,
          depthFresh01: overlayBudgetDiag.depthFresh01,
          scale01: overlayBudgetDiag.scale,
          meanOverlayMul01: overlayBudgetDiag.meanOverlayMul,
          pmTarget01: overlayBudgetDiag.pmTarget,
          cfg: {
            maxEnergy: overlayBudget.maxEnergy,
            minScale: overlayBudget.minScale,
            depthWeight: overlayBudget.depthWeight,
            smoothBaseMs: overlayBudget.smoothBaseMs,
            priorityBasic: overlayBudget.priorityBasic,
            priorityCamera: overlayBudget.priorityCamera,
            priorityVideo: overlayBudget.priorityVideo,
            priorityDepth: overlayBudget.priorityDepth,
            pmRetreatStrength: overlayBudget.pmRetreatStrength,
            pmRetreatFloor: overlayBudget.pmRetreatFloor,
          },
          mul: {
            basic: overlayMulBasic,
            camera: overlayMulCamera,
            video: overlayMulVideo,
            depth: overlayMulDepth,
            projectm: overlayMulProjectM,
          },
        },
        controlPlane: controlPlaneDebug,
        runtime: {
          renderer: {
            compositor: sceneManager.getCompositorConfig(),
            compositorProfile: (() => {
              try {
                return (sceneManager as any).getCompositorProfile?.();
              } catch {
                return undefined;
              }
            })(),
          },
          projectm: (() => {
            try {
              const b = projectLayer.getBlendParams();
              return {
                opacity01: Number(b.opacity),
                energyToOpacityAmount01: Number(b.energyToOpacityAmount),
              };
            } catch {
              return {};
            }
          })(),
          liquid: (() => {
            try {
              return { ...(liquidLayer.params as any) };
            } catch {
              return {};
            }
          })(),
          camera: {
            enabled: Boolean(dom.layerCameraToggle?.checked),
            opacity01:
              dom.cameraOpacityInput && dom.cameraOpacityInput.value != null
                ? Number(dom.cameraOpacityInput.value)
                : undefined,
            ...((): Record<string, unknown> => {
              try {
                const s = cameraLayer?.getStatus?.() as any;
                return {
                  state: typeof s?.state === "string" ? s.state : undefined,
                  segmentPerson: Boolean(s?.segmentPerson),
                  portraitEdge01: Number(s?.portraitEdge01 ?? 0),
                  portraitArea01: Number(s?.portraitArea01 ?? 0),
                };
              } catch {
                return {};
              }
            })(),
          },
          depth: (() => {
            const enabled = Boolean(dom.layerDepthToggle?.checked);
            if (!enabled) return { enabled: false };
            try {
              const s = depthLayer.getStatus();
              return {
                enabled: true,
                source: String(s.source ?? ""),
                state: String(s.state ?? ""),
                fpsIn: Number(s.fpsIn ?? 0),
                fpsProc: Number(s.fpsProc ?? 0),
                framesIn: Number(s.framesIn ?? 0),
                framesProcessed: Number(s.framesProcessed ?? 0),
              };
            } catch {
              return { enabled: true };
            }
          })(),
          spatial: (() => {
            const edge01 = Math.min(
              1,
              Math.max(0, Number(portraitEdge01Smoothed ?? 0))
            );
            const area01 = Math.min(
              1,
              Math.max(0, Number(portraitArea01Smoothed ?? 0))
            );
            const depth01 = Math.min(
              1,
              Math.max(0, Number(depthFresh01Smoothed ?? 0))
            );
            const edgeDrive01 = Math.min(
              1,
              Math.max(0, edge01 * (0.35 + 0.65 * area01))
            );
            const edgeBias01 = Math.min(
              1,
              Math.max(
                0,
                edgeDrive01 * Math.min(1, Math.max(0, cameraEdgeToPmAmount01))
              )
            );
            const piBiasSigned = Number(pmClosedLoopLastOutput ?? 0);
            const presetBiasSigned = Number(
              pmPresetExternalOpacityBiasSigned ?? 0
            );
            const externalOpacityDriveSigned = Math.max(
              -1,
              Math.min(1, edgeBias01 + piBiasSigned + presetBiasSigned)
            );
            return {
              portraitEdge01: edge01,
              portraitArea01: area01,
              depthFresh01: depth01,
              cameraEdgeToPmAmount01: Math.min(
                1,
                Math.max(0, cameraEdgeToPmAmount01)
              ),
              edgeDrive01,
              edgeBias01,
              piBiasSigned,
              presetBiasSigned,
              externalOpacityDriveSigned,
            };
          })(),
          projectmVerify: (() => {
            const v = (globalThis as any).__projectm_verify ?? {};
            const perPm = v.perPm ?? {};
            const fg = perPm?.fg ?? {};
            const bg = perPm?.bg ?? {};
            const avgColorR = Number(fg?.avgColorR ?? v.avgColorR);
            const avgColorG = Number(fg?.avgColorG ?? v.avgColorG);
            const avgColorB = Number(fg?.avgColorB ?? v.avgColorB);
            const hasRgb =
              Number.isFinite(avgColorR) &&
              Number.isFinite(avgColorG) &&
              Number.isFinite(avgColorB);
            const fgLuma = Number(fg?.avgLuma ?? v.avgLuma);
            const fgHasLuma = Number.isFinite(fgLuma);
            const fgColor = {
              r: Number(fg?.avgColorR),
              g: Number(fg?.avgColorG),
              b: Number(fg?.avgColorB),
            };
            const fgHasColor =
              Number.isFinite(fgColor.r) &&
              Number.isFinite(fgColor.g) &&
              Number.isFinite(fgColor.b);
            const bgLuma = Number(bg?.avgLuma);
            const bgHasLuma = Number.isFinite(bgLuma);
            const bgColor = {
              r: Number(bg?.avgColorR),
              g: Number(bg?.avgColorG),
              b: Number(bg?.avgColorB),
            };
            const bgHasColor =
              Number.isFinite(bgColor.r) &&
              Number.isFinite(bgColor.g) &&
              Number.isFinite(bgColor.b);
            return {
              avgLuma: Number.isFinite(fgLuma) ? fgLuma : undefined,
              avgColor: hasRgb
                ? { r: avgColorR, g: avgColorG, b: avgColorB }
                : undefined,
              perPm: {
                fg:
                  fgHasLuma || fgHasColor
                    ? {
                        avgLuma: fgHasLuma ? fgLuma : undefined,
                        avgColor: fgHasColor ? fgColor : undefined,
                      }
                    : undefined,
                bg:
                  bgHasLuma || bgHasColor
                    ? {
                        avgLuma: bgHasLuma ? bgLuma : undefined,
                        avgColor: bgHasColor ? bgColor : undefined,
                      }
                    : undefined,
              },
              closedLoopPiEnabled: Boolean(v.closedLoopPiEnabled),
              closedLoopPiTarget: Number(v.closedLoopPiTarget),
              closedLoopPiError: Number(v.closedLoopPiError),
              closedLoopPiOpacity: Number(v.closedLoopPiOpacity),
              colorLoopEnabled: Boolean(v.colorLoopEnabled),
              colorLoopHue01: Number(v.colorLoopHue01),
              colorLoopStrength01: Number(v.colorLoopStrength01),
              colorLoopContrastMul: Number(v.colorLoopContrastMul),
            };
          })(),
        },
      };
      lastTopologySnapshot = topologySnapshot;
      decisionTopologyOverlay.update(topologySnapshot);
      audioTransport.updateTimeline();
      lastDiagnosticsUpdate = now;
    }

    // Keep depth status readable even if diagnostics throttle skips.
    // (Updates are cheap and make ws/idepth debugging much easier.)
    if (depthStatusText) {
      updateDepthStatusLabel();
    }
  });

  // (moved above as function declaration so it can be called earlier)

  trackBootstrapDispose(
    listen(presetLibrarySelect, "change", (event) => {
      if (presetHold) {
        setPresetStatus("HOLD: preset locked");
        setLibrarySelectValue(currentLibrarySource);
        return;
      }
      const select = event.target as HTMLSelectElement;
      const nextSource = select.value as PresetLibrarySource;
      const isValid = PRESET_LIBRARIES.some((lib) => lib.id === nextSource);
      if (!isValid) {
        setLibrarySelectValue(currentLibrarySource);
        return;
      }
      void reloadLibraryPresets(nextSource);
    })
  );

  trackBootstrapDispose(
    listen(presetSelect, "change", async (event) => {
      const select = event.target as HTMLSelectElement;
      const presetId = select.value;
      void loadPresetById(presetId, "select");
    })
  );

  trackBootstrapDispose(
    listen(presetNextButton, "click", () => {
      requestPresetCycle("manual");
    })
  );

  trackBootstrapDispose(
    listen(presetAutoToggle, "change", (event) => {
      const checkbox = event.target as HTMLInputElement;
      if (checkbox.checked) {
        scheduleAutoCycle();
      } else {
        stopAutoCycle("Auto-cycle paused");
      }
    })
  );

  trackBootstrapDispose(
    listen(presetAutoIntervalInput, "change", () => {
      const seconds = getAutoIntervalSeconds();
      if (presetAutoToggle?.checked) {
        scheduleAutoCycle();
      } else {
        setPresetStatus(`Auto-cycle interval set to ${seconds}s`);
      }
    })
  );

  trackBootstrapDispose(
    listen(presetFileInput, "change", async (event) => {
      if (!projectLayerReady) return;
      if (presetHold) {
        setPresetStatus("HOLD: preset locked");
        return;
      }
      if (presetLoadInFlight) {
        setPresetStatus("Preset switch in progress…");
        return;
      }
      const gate = requestPresetSwitch("file");
      if (!gate.ok) {
        const reasonText = gate.reasons.length
          ? gate.reasons.join(",")
          : "gate";
        setPresetStatus(`Preset blocked (${reasonText})`);
        return;
      }
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      const filePresetId = `file:${file.name}`;
      setPresetStatus(`Importing: ${file.name} ...`);
      const loadStartMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      presetLoadInFlight = true;
      updatePresetCyclerAvailability();
      try {
        notePresetLoadPressure("file");
        ensureProjectLayerReady();
        const presetData = await file.text();
        await yieldToBrowser();
        projectLayer.loadPresetFromData(presetData);
        currentPresetId = null;
        currentPresetUrl = `file:${file.name}`;
        recordPresetLoadSuccess(filePresetId, performance.now() - loadStartMs);
        applyProjectMPresetTuningToRuntime("presetLoaded");
        updatePresetSelectValue(null);
        stopAutoCycle();
        setPresetStatus(`Preset: ${file.name}`);
        armProjectMMotionWatch("manual");

        const tEnd =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const report: PresetSwitchReport = {
          scope: "fg",
          origin: "file",
          presetId: filePresetId,
          presetUrl: `file:${file.name}`,
          presetLabel: file.name,
          tStartMs: loadStartMs,
          tEndMs: tEnd,
          durationMs: Math.max(0, tEnd - loadStartMs),
          loadMs: Math.max(0, tEnd - loadStartMs),
          cache: "na",
          framesBefore: tryReadFramesRendered() ?? undefined,
          rebuildBefore: (() => {
            try {
              return projectLayer.getRebuildStatus();
            } catch {
              return undefined;
            }
          })(),
          rebuildAfter: (() => {
            try {
              return projectLayer.getRebuildStatus();
            } catch {
              return undefined;
            }
          })(),
          outcome: "success",
        };
        pushPresetSwitchReport(report);
        void updatePresetSwitchFirstFrame(report);
      } catch (error) {
        const elapsedMs =
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) - loadStartMs;
        handlePresetLoadError("Failed to import preset file", error);
        handlePresetFailure({ id: filePresetId }, error, elapsedMs);

        const tEnd =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const report: PresetSwitchReport = {
          scope: "fg",
          origin: "file",
          presetId: filePresetId,
          presetUrl: `file:${file.name}`,
          presetLabel: file.name,
          tStartMs: loadStartMs,
          tEndMs: tEnd,
          durationMs: Math.max(0, tEnd - loadStartMs),
          cache: "na",
          framesBefore: tryReadFramesRendered() ?? undefined,
          rebuildBefore: (() => {
            try {
              return projectLayer.getRebuildStatus();
            } catch {
              return undefined;
            }
          })(),
          rebuildAfter: (() => {
            try {
              return projectLayer.getRebuildStatus();
            } catch {
              return undefined;
            }
          })(),
          outcome: "error",
          errorText: getPresetErrorText(error),
        };
        pushPresetSwitchReport(report);
      } finally {
        presetLoadInFlight = false;
        updatePresetCyclerAvailability();
        flushPendingPresetRequests();
        input.value = "";
      }
    })
  );

  trackBootstrapDispose(
    listen(presetUrlButton, "click", async () => {
      if (!projectLayerReady) return;
      if (presetHold) {
        setPresetStatus("HOLD: preset locked");
        return;
      }
      if (presetLoadInFlight) {
        setPresetStatus("Preset switch in progress…");
        return;
      }
      const gate = requestPresetSwitch("url");
      if (!gate.ok) {
        const reasonText = gate.reasons.length
          ? gate.reasons.join(",")
          : "gate";
        setPresetStatus(`Preset blocked (${reasonText})`);
        return;
      }
      const url = presetUrlInput?.value.trim();
      if (!url) {
        setPresetStatus("Enter a preset URL first", true);
        return;
      }
      setPresetStatus("Loading preset URL ...");
      const urlPresetId = `url:${url}`;
      const loadStartMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      presetLoadInFlight = true;
      updatePresetCyclerAvailability();
      try {
        ensureProjectLayerReady();
        const framesBefore = tryReadFramesRendered();
        const rebuildBefore = (() => {
          try {
            return projectLayer.getRebuildStatus();
          } catch {
            return undefined;
          }
        })();
        const cacheResult = await loadPresetUrlMaybeCached(
          projectLayer,
          url,
          "url"
        );
        currentPresetId = null;
        currentPresetUrl = url;
        recordPresetLoadSuccess(urlPresetId, performance.now() - loadStartMs);
        applyProjectMPresetTuningToRuntime("presetLoaded");
        updatePresetSelectValue(null);
        stopAutoCycle();
        setPresetStatus(`Preset: ${url}`);
        armProjectMMotionWatch("manual");

        const tEnd =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const report: PresetSwitchReport = {
          scope: "fg",
          origin: "url",
          presetId: urlPresetId,
          presetUrl: url,
          presetLabel: url,
          tStartMs: loadStartMs,
          tEndMs: tEnd,
          durationMs: Math.max(0, tEnd - loadStartMs),
          loadMs: Math.max(0, tEnd - loadStartMs),
          cache: cacheResult?.cache === "hit" ? "hit" : "miss",
          framesBefore: framesBefore ?? undefined,
          rebuildBefore,
          rebuildAfter: (() => {
            try {
              return projectLayer.getRebuildStatus();
            } catch {
              return undefined;
            }
          })(),
          outcome: "success",
        };
        pushPresetSwitchReport(report);
        void updatePresetSwitchFirstFrame(report);
      } catch (error) {
        const elapsedMs =
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) - loadStartMs;
        handlePresetLoadError("Failed to load preset URL", error);
        handlePresetFailure({ id: urlPresetId }, error, elapsedMs);

        const tEnd =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const report: PresetSwitchReport = {
          scope: "fg",
          origin: "url",
          presetId: urlPresetId,
          presetUrl: url,
          presetLabel: url,
          tStartMs: loadStartMs,
          tEndMs: tEnd,
          durationMs: Math.max(0, tEnd - loadStartMs),
          cache: "na",
          framesBefore: tryReadFramesRendered() ?? undefined,
          rebuildBefore: (() => {
            try {
              return projectLayer.getRebuildStatus();
            } catch {
              return undefined;
            }
          })(),
          rebuildAfter: (() => {
            try {
              return projectLayer.getRebuildStatus();
            } catch {
              return undefined;
            }
          })(),
          outcome: "error",
          errorText: getPresetErrorText(error),
        };
        pushPresetSwitchReport(report);
      } finally {
        presetLoadInFlight = false;
        updatePresetCyclerAvailability();
        flushPendingPresetRequests();
      }
    })
  );

  trackBootstrapDispose(
    listen(visualRandomButton, "click", () => {
      void applyRandomVisualStateSafe();
    })
  );

  trackBootstrapDispose(
    listen(visualRandomParamsButton, "click", () => {
      applyRandomCurrentParams();
    })
  );

  trackBootstrapDispose(
    listen(visualFavoriteButton, "click", () => {
      const state = buildCurrentVisualState();
      const preset = state.projectm.presetId
        ? findPresetById(state.projectm.presetId)
        : null;

      const favorite: FavoriteVisualState = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        label: preset?.label ?? state.projectm.presetUrl ?? null,
        state,
      };
      lastVisualState = state;
      favoritesController.addFavorite(favorite);
      updateFavoriteCountLabel();
      dom.audioStatus.textContent = "Favorited current visual state";
      dom.audioStatus.dataset.state = "ok";
      favoritesController.showPanel();
    })
  );

  trackBootstrapDispose(
    listen(visualFavoriteCount, "click", () => {
      favoritesController.togglePanel();
    })
  );

  trackBootstrapDispose(
    listen(window, "beforeunload", () => audioBus.dispose())
  );

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      disposeBootstrapBindings();
      audioBus.dispose();
      cameraLayer?.dispose();
      projectLayerBg.dispose();
    });
  }
}
