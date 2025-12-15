import './style.css';
import { SceneManager } from './SceneManager';
import { LiquidMetalLayerV2 } from './layers/LiquidMetalLayerV2';
import { LiquidMetalControlPanel } from './ui/LiquidMetalControlPanel';
import { ProjectMLayer } from './layers/ProjectMLayer';
import { AudioBus } from './audio/AudioBus';
import type { AudioFrame } from './types/audioFrame';
import { DiagnosticsPanel } from './features/console/DiagnosticsPanel';
import {
  type PresetDescriptor,
  BUILT_IN_PRESETS,
  findPresetById,
  getNextPreset,
  getAllPresets,
  registerRuntimePresets,
  markPresetAsBroken
} from './config/presets';
import { PRESET_PACK_PATH, TEST_AUDIO_LIBRARY_PATH } from './config/paths';
import { loadLibraryManifest } from './lib/loadManifest';
import { mapManifestToPresetDescriptors } from './config/presetManifest';
import {
  DEFAULT_LIBRARY_SOURCE,
  PRESET_LIBRARIES,
  type PresetLibrarySource,
  getLibraryConfig
} from './config/presetLibraries';
import { CAMERA_FEATURE } from './config/cameraSources';
import { CameraLayer } from './layers/CameraLayer';

import {
  type BlendMode,
  type FavoriteVisualState,
  type VisualStateV1,
  cloneVisualState,
  createDefaultVisualState,
  loadFavoritesFromStorage,
  saveFavoritesToStorage
} from './features/visualState/visualStateStore';
import { randomizeBlendParams, randomizeLiquidMetalParams } from './state/paramSchema';
import { createRandomSeed, createSeededRng } from './state/seededRng';
import { renderShell } from './app/renderShell';
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('#app container not found');
}

const renderLibrarySelectOptions = () => {
  return PRESET_LIBRARIES.map((lib) => `<option value="${lib.id}">${lib.label}</option>`).join('');
};

const audioUrlPlaceholder = `${TEST_AUDIO_LIBRARY_PATH}/示例音轨.mp3`;
// Local test track (served via Vite dev middleware). Requires a user click due to autoplay policy.
// Using English path to avoid encoding issues with Chinese characters.
const TEST_TRACK_FS_PATH = "D:/test MP3/Lick It - Juicy Selekta's Bootylicious Remix.mp3";

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

const canvas = dom.canvas;

const sceneManager = new SceneManager(canvas);
const liquidLayer = new LiquidMetalLayerV2();
const liquidControlPanel = new LiquidMetalControlPanel(liquidLayer);
const projectLayer = new ProjectMLayer();
const cameraLayer = CAMERA_FEATURE.enabled ? new CameraLayer(CAMERA_FEATURE) : null;
const audioBus = new AudioBus();
const diagnosticsPanel = new DiagnosticsPanel(document.body);
diagnosticsPanel.updateRenderer(sceneManager.getRendererInfo());
window.addEventListener('resize', () => diagnosticsPanel.updateRenderer(sceneManager.getRendererInfo()));

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
const visualFavoriteButton = dom.visualFavoriteButton;
const visualFavoriteCount = dom.visualFavoriteCount;
const pmOpacityInput = dom.pmOpacityInput;
const pmBlendModeSelect = dom.pmBlendModeSelect;
const pmAudioOpacityToggle = dom.pmAudioOpacityToggle;
const pmEnergyOpacityInput = dom.pmEnergyOpacityInput;
let favoritesPanel: HTMLDivElement | null = null;

const presetControls = [
  presetSelect,
  presetFileInput,
  presetUrlInput,
  presetUrlButton,
  presetNextButton,
  presetAutoToggle,
  presetAutoIntervalInput
];

let currentPresetId: string | null = null;
let currentPresetUrl: string | null = null;
let projectLayerReady = false;
let autoCycleTimer: number | null = null;
let currentLibrarySource: PresetLibrarySource = DEFAULT_LIBRARY_SOURCE;
let currentEnergyLevel = 0;

const FAVORITES_STORAGE_KEY = 'newliveweb:favorites:v1';

function getLiquidParamsSnapshot() {
  return { ...liquidLayer.params };
}

function getCurrentBlendParams() {
  return projectLayer.getBlendParams();
}

function buildCurrentVisualState(): VisualStateV1 {
  const blend = getCurrentBlendParams();
  const preset = currentPresetId ? findPresetById(currentPresetId) : null;
  const presetUrl = currentPresetUrl ?? preset?.url ?? null;

  return {
    version: 1,
    global: lastVisualState.global ? { ...lastVisualState.global } : undefined,
    projectm: {
      presetId: currentPresetId,
      presetUrl,
      opacity: blend.opacity,
      blendMode: blend.blendMode,
      audioDrivenOpacity: blend.audioDrivenOpacity,
      energyToOpacityAmount: blend.energyToOpacityAmount
    },
    liquidMetal: getLiquidParamsSnapshot()
  };
}

let favorites: FavoriteVisualState[] = loadFavoritesFromStorage(localStorage, FAVORITES_STORAGE_KEY, liquidLayer.params);
let lastVisualState: VisualStateV1 = createDefaultVisualState(liquidLayer.params);
const DIAGNOSTICS_THROTTLE_MS = 500;
let lastDiagnosticsUpdate = 0;

function syncBlendControlsFromLayer() {
  const blend = projectLayer.getBlendParams();
  if (pmOpacityInput) pmOpacityInput.value = blend.opacity.toFixed(2);
  if (pmBlendModeSelect) pmBlendModeSelect.value = blend.blendMode;
  if (pmAudioOpacityToggle) pmAudioOpacityToggle.checked = blend.audioDrivenOpacity;
  if (pmEnergyOpacityInput) pmEnergyOpacityInput.value = String(blend.energyToOpacityAmount);
}

function applyBlendControlsToLayer() {
  const rawOpacity = Number(pmOpacityInput?.value ?? 0.8);
  const opacity = Math.min(1, Math.max(0, Number.isFinite(rawOpacity) ? rawOpacity : 0.8));
  const blendMode = (pmBlendModeSelect?.value ?? 'add') as BlendMode;
  const audioDrivenOpacity = Boolean(pmAudioOpacityToggle?.checked);
  const rawAmount = Number(pmEnergyOpacityInput?.value ?? 0.3);
  const energyToOpacityAmount = Math.min(1, Math.max(0, Number.isFinite(rawAmount) ? rawAmount : 0.3));

  projectLayer.setBlendParams({
    opacity,
    blendMode,
    audioDrivenOpacity,
    energyToOpacityAmount
  });

  lastVisualState = buildCurrentVisualState();
}

function updateFavoriteCountLabel() {
  if (!visualFavoriteCount) return;
  visualFavoriteCount.textContent = `Favorites: ${favorites.length}`;
}

function applyFavoriteVisualState(fav: FavoriteVisualState) {
  const preset = fav.state.projectm.presetId ? findPresetById(fav.state.projectm.presetId) : null;
  const targetPresetId = fav.state.projectm.presetId ?? null;
  const targetPresetUrl = fav.state.projectm.presetUrl || preset?.url || null;

  if (projectLayerReady && targetPresetUrl) {
    setPresetStatus(`Loading favorite: ${fav.label ?? targetPresetUrl} ...`);
    void (async () => {
      try {
        ensureProjectLayerReady();
        await projectLayer.loadPresetFromUrl(targetPresetUrl);
        currentPresetId = targetPresetId;
        currentPresetUrl = targetPresetUrl;
        if (targetPresetId && findPresetById(targetPresetId)) {
          updatePresetSelectValue(targetPresetId);
        }
        setPresetStatus(`Preset: ${fav.label ?? targetPresetUrl}`);
      } catch (error) {
        const compatNote = getCompatNote(preset ?? null);
        handlePresetLoadError(`Failed to load favorite preset${compatNote}`, error);
      }
    })();
  } else {
    currentPresetId = targetPresetId;
    currentPresetUrl = targetPresetUrl;
  }

  liquidLayer.params = { ...fav.state.liquidMetal };
  liquidLayer.updateParams();
  projectLayer.setBlendParams({
    opacity: fav.state.projectm.opacity,
    audioDrivenOpacity: fav.state.projectm.audioDrivenOpacity,
    energyToOpacityAmount: fav.state.projectm.energyToOpacityAmount,
    blendMode: fav.state.projectm.blendMode
  });
  lastVisualState = cloneVisualState(fav.state);
  syncBlendControlsFromLayer();
}

function ensureFavoritesPanel() {
  if (favoritesPanel) return favoritesPanel;
  const panel = document.createElement('div');
  panel.id = 'favorites-panel';
  panel.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 320px;
    max-height: 50vh;
    overflow-y: auto;
    background: rgba(10,10,20,0.95);
    color: #fff;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.12);
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 12px;
    padding: 12px;
    z-index: 1001;
    display: none;
  `;

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
  const title = document.createElement('span');
  title.textContent = 'Favorites';
  title.style.cssText = 'font-weight:600;color:#e5e7eb;';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = 'border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:14px;';
  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
  });
  titleRow.appendChild(title);
  titleRow.appendChild(closeBtn);
  panel.appendChild(titleRow);

  const list = document.createElement('div');
  list.id = 'favorites-list';
  panel.appendChild(list);

  document.body.appendChild(panel);
  favoritesPanel = panel;
  refreshFavoritesPanel();
  return panel;
}

function refreshFavoritesPanel() {
  if (!favoritesPanel) return;
  const list = favoritesPanel.querySelector<HTMLDivElement>('#favorites-list');
  if (!list) return;
  list.innerHTML = '';

  if (!favorites.length) {
    const empty = document.createElement('div');
    empty.textContent = "No favorites yet. Use 'Favorite' to save.";
    empty.style.cssText = 'color:#6b7280;padding:8px 0;';
    list.appendChild(empty);
    return;
  }

  favorites
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .forEach((fav) => {
      const item = document.createElement('div');
      item.style.cssText = 'padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;gap:4px;';

      const titleRow = document.createElement('div');
      titleRow.style.cssText = 'display:flex;justify-content:space-between;gap:8px;';
      const label = document.createElement('span');
      label.textContent = fav.label ?? '[no preset]';
      label.style.cssText = 'color:#e5e7eb;max-width:180px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;';
      const ts = document.createElement('span');
      ts.textContent = new Date(fav.createdAt).toLocaleTimeString();
      ts.style.cssText = 'color:#9ca3af;';
      titleRow.appendChild(label);
      titleRow.appendChild(ts);
      item.appendChild(titleRow);

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:6px;margin-top:2px;';
      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load';
      loadBtn.style.cssText = 'flex:0 0 auto;padding:2px 6px;font-size:11px;border-radius:4px;border:1px solid rgba(96,165,250,0.6);background:rgba(59,130,246,0.12);color:#bfdbfe;cursor:pointer;';
      loadBtn.addEventListener('click', () => {
        applyFavoriteVisualState(fav);
      });
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '删除';
      deleteBtn.style.cssText = 'flex:0 0 auto;padding:2px 6px;font-size:11px;border-radius:4px;border:1px solid rgba(248,113,113,0.6);background:rgba(248,113,113,0.08);color:#fecaca;cursor:pointer;';
      deleteBtn.addEventListener('click', () => {
        favorites = favorites.filter((f) => f.id !== fav.id);
        saveFavoritesToStorage(localStorage, FAVORITES_STORAGE_KEY, favorites);
        updateFavoriteCountLabel();
        refreshFavoritesPanel();
      });
      actions.appendChild(loadBtn);
      actions.appendChild(deleteBtn);
      item.appendChild(actions);

      list.appendChild(item);
    });
}

const AUTO_INTERVAL_DEFAULT = 90;
const AUTO_INTERVAL_MIN = 15;
const AUTO_INTERVAL_MAX = 600;
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
    presetSelect.innerHTML = '<option disabled selected>No presets available</option>';
    presetSelect.disabled = true;
    return;
  }

  const hasCurrent = currentPresetId ? presets.some((preset) => preset.id === currentPresetId) : false;
  if (!hasCurrent) {
    currentPresetId = presets[0]?.id ?? null;
  }

  presetSelect.disabled = false;
  presetSelect.innerHTML = presets
    .map((preset) => `<option value="${preset.id}">${preset.label}</option>`)
    .join('');
  updatePresetSelectValue(currentPresetId);
};

const updatePresetManifestInfo = (message: string, isError = false) => {
  if (!presetManifestInfo) return;
  presetManifestInfo.textContent = message;
  presetManifestInfo.dataset.state = isError ? 'error' : 'ok';
};

const setLibrarySelectValue = (source: PresetLibrarySource) => {
  if (!presetLibrarySelect) return;
  presetLibrarySelect.value = source;
};

const getInitialLibrarySource = (): PresetLibrarySource => {
  try {
    const stored = localStorage.getItem('presetLibrarySource');
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
    localStorage.setItem('presetLibrarySource', source);
  } catch {
    // Non-fatal if storage is unavailable
  }
};

async function loadPresetManifestFromDiskLegacy() {
  try {
    const response = await fetch('/presets/library-manifest.json', { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const manifest = (await response.json()) as PresetManifest;
    const presets = manifest.presets ?? [];
    registerRuntimePresets(presets);
    refreshPresetSelect();
    updatePresetCyclerAvailability();
    if (presets.length) {
      updatePresetManifestInfo(`Loaded ${presets.length} presets - ${manifest.sourcePath ?? 'custom pack'}`);
    } else {
      updatePresetManifestInfo('Preset manifest has 0 entries');
    }
  } catch (error) {
    console.warn('Preset manifest unavailable', error);
    registerRuntimePresets([]);
    refreshPresetSelect();
    updatePresetCyclerAvailability();
    updatePresetManifestInfo('Preset manifest missing - run npm run sync:presets', true);
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
        `Loaded ${presets.length} presets - ${manifest.sourceRoot ?? 'custom pack'}`
      );
    } else {
      updatePresetManifestInfo('Preset manifest has 0 entries');
    }
  } catch (error) {
    console.warn('Preset manifest unavailable', error);
    registerRuntimePresets([]);
    refreshPresetSelect();
    updatePresetCyclerAvailability();
    updatePresetManifestInfo('Preset manifest missing - run npm run sync:presets', true);
  }
}

async function loadPresetManifestForSource(source: PresetLibrarySource) {
  const { manifestUrl, label, requireWasmSafe } = getLibraryConfig(source);
  try {
    updatePresetManifestInfo(`Loading ${label} manifest...`);
    const manifest = await loadLibraryManifest(manifestUrl, { requireWasmSafe });
    const presets = mapManifestToPresetDescriptors(manifest);
    registerRuntimePresets(presets);
    refreshPresetSelect();
    updatePresetCyclerAvailability();
    const filteredOut = manifest.filteredOutByWasmCompat ?? 0;
    const filteredInfo = filteredOut > 0 ? ` (filtered ${filteredOut} by wasmCompat)` : '';
    if (presets.length) {
      updatePresetManifestInfo(
        `Loaded ${presets.length} presets | ${label}${filteredInfo} | ${manifest.sourceRoot ?? 'custom pack'}`
      );
    } else {
      updatePresetManifestInfo(`Preset manifest has 0 entries | ${label}`);
    }

    const hasCurrent = currentPresetId ? findPresetById(currentPresetId) : null;
    if (!hasCurrent) {
      currentPresetId = getAllPresets()[0]?.id ?? null;
      updatePresetSelectValue(currentPresetId);
    }

    const initialPreset = currentPresetId ? findPresetById(currentPresetId) : null;
    setPresetStatus(initialPreset ? `Preset: ${initialPreset.label}` : 'Preset ready');
  } catch (error) {
    console.warn('Preset manifest unavailable', error);
    registerRuntimePresets([]);
    refreshPresetSelect();
    updatePresetCyclerAvailability();
    updatePresetManifestInfo(`Preset manifest missing - ${label}`, true);
  }
}

const reloadLibraryPresets = async (source: PresetLibrarySource) => {
  currentLibrarySource = source;
  persistLibrarySource(source);
  setLibrarySelectValue(source);
  stopAutoCycle('Auto-cycle paused by library change');
  currentPresetId = null;
  currentPresetUrl = null;
  await loadPresetManifestForSource(source);
};

const setPresetStatus = (message: string, isError = false) => {
  if (!presetStatus) return;
  presetStatus.textContent = message;
  presetStatus.dataset.state = isError ? 'error' : 'ok';
};

const handlePresetLoadError = (message: string, error: unknown) => {
  console.error(message, error);
  setPresetStatus(message, true);
};

const getCompatNote = (preset?: PresetDescriptor | null) => {
  if (preset?.wasmCompat?.ok === false) {
    const type = preset.wasmCompat.errorType ?? 'unknown';
    const msg = preset.wasmCompat.message ?? '';
    const detail = msg ? `${type} / ${msg}` : type;
    return ` (离线体检: ${detail})`;
  }
  return '';
};

const markPresetAsBrokenAndRefresh = (preset?: { id: string } | PresetDescriptor | null) => {
  const presetId = preset?.id;
  if (!presetId) return;
  markPresetAsBroken(presetId);
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
  return Math.min(AUTO_INTERVAL_MAX, Math.max(AUTO_INTERVAL_MIN, value ?? AUTO_INTERVAL_DEFAULT));
};

const setAutoLabelState = (isOn: boolean) => {
  if (!presetAutoLabel) return;
  presetAutoLabel.textContent = isOn ? 'Auto-cycle (on)' : 'Auto-cycle';
};

const randomInRange = (min: number, max: number) => {
  return min + (max - min) * Math.random();
};

const applyRandomVisualState = async () => {
  const energy = currentEnergyLevel || 0.5;
  const seed = createRandomSeed();
  const rng = createSeededRng(seed);

  const presets = getAllPresets();
  const hasPresets = presets.length > 0;
  const maybePreset = hasPresets ? presets[rng.int(0, presets.length)] : null;

  if (projectLayerReady && maybePreset) {
    setPresetStatus(`Random loading: ${maybePreset.label} ...`);
    try {
      ensureProjectLayerReady();
      await projectLayer.loadPresetFromUrl(maybePreset.url);
      currentPresetId = maybePreset.id;
      currentPresetUrl = maybePreset.url;
      updatePresetSelectValue(maybePreset.id);
      setPresetStatus(`Preset: ${maybePreset.label}`);
    } catch (error) {
      const compatNote = getCompatNote(maybePreset);
      handlePresetLoadError(`Failed to load preset${compatNote}`, error);
      markPresetAsBrokenAndRefresh(maybePreset);
    }
  } else {
    currentPresetId = maybePreset?.id ?? null;
    currentPresetUrl = maybePreset?.url ?? null;
  }

  const e = energy;
  const nextLiquid = randomizeLiquidMetalParams(e, rng);
  liquidLayer.params = { ...liquidLayer.params, ...nextLiquid };
  liquidLayer.updateParams();

  const blend = randomizeBlendParams(e, rng);
  projectLayer.setBlendParams(blend);
  syncBlendControlsFromLayer();

  // 记录当前随机生成的 VisualState 以便收藏/预览
  const nextState: VisualStateV1 = {
    ...buildCurrentVisualState(),
    global: { seed }
  };
  // 记录最近一次随机的 VisualState，供收藏/复用
  lastVisualState = nextState;
};

function updatePresetCyclerAvailability() {
  const hasPresets = getAllPresets().length > 0;
  if (presetSelect) presetSelect.disabled = !hasPresets;
  if (presetNextButton) presetNextButton.disabled = !hasPresets;
  if (presetAutoToggle) presetAutoToggle.disabled = !hasPresets;
  if (presetAutoIntervalInput) presetAutoIntervalInput.disabled = !hasPresets;
  if (!hasPresets) {
    stopAutoCycle();
  }
}

const getAutoIntervalSeconds = () => {
  const value = Number(presetAutoIntervalInput?.value ?? AUTO_INTERVAL_DEFAULT);
  const clamped = clampAutoInterval(value);
  if (presetAutoIntervalInput) {
    presetAutoIntervalInput.value = String(clamped);
  }
  return clamped;
};

const clearAutoCycleTimer = () => {
  if (autoCycleTimer) {
    window.clearInterval(autoCycleTimer);
    autoCycleTimer = null;
  }
};

const stopAutoCycle = (statusMessage?: string, isError = false) => {
  if (presetAutoToggle) {
    presetAutoToggle.checked = false;
  }
  clearAutoCycleTimer();
  setAutoLabelState(false);
  if (statusMessage) {
    setPresetStatus(statusMessage, isError);
  }
};

const scheduleAutoCycle = () => {
  clearAutoCycleTimer();
  if (!presetAutoToggle?.checked) {
    return;
  }
  if (!getAllPresets().length) {
    stopAutoCycle('No presets to auto-cycle', true);
    return;
  }
  const seconds = getAutoIntervalSeconds();
  autoCycleTimer = window.setInterval(() => {
    void cycleToNextPreset('auto');
  }, seconds * 1000);
  setAutoLabelState(true);
  setPresetStatus(`Auto-cycle every ${seconds}s`);
};

const cycleToNextPreset = async (origin: 'manual' | 'auto') => {
  if (!projectLayerReady) return;
  const nextPreset = getNextPreset(currentPresetId);
  if (!nextPreset) {
    stopAutoCycle('No presets available for cycling', true);
    return;
  }
  setPresetStatus(`${origin === 'auto' ? 'Auto' : 'Manual'} loading: ${nextPreset.label} ...`);
  try {
    ensureProjectLayerReady();
    await projectLayer.loadPresetFromUrl(nextPreset.url);
    currentPresetId = nextPreset.id;
    currentPresetUrl = nextPreset.url;
    updatePresetSelectValue(nextPreset.id);
    setPresetStatus(`Preset: ${nextPreset.label}`);
  } catch (error) {
    const compatNote = getCompatNote(nextPreset);
    handlePresetLoadError(`Failed to load preset${compatNote}`, error);
    markPresetAsBrokenAndRefresh(nextPreset);
    if (origin === 'auto') {
      stopAutoCycle('Auto-cycle paused due to error', true);
    }
  }
};

const ensureProjectLayerReady = () => {
  if (!projectLayer.isReady()) {
    throw new Error('ProjectM layer not ready');
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
  if (cameraLayer) {
    try {
      await sceneManager.addLayer(cameraLayer);
      console.log('Camera layer initialized');
    } catch (error) {
      console.warn('Camera layer failed to initialize:', error);
    }
  }

  // ProjectM 层初始化可能失败，使用 try-catch 包裹
  try {
    await sceneManager.addLayer(projectLayer);
    console.log('✅ ProjectM layer initialized');
  } catch (error) {
    console.warn('⚠️ ProjectM layer failed to initialize:', error);
    console.log('🎨 Continuing with liquid metal layer only');
  }

  sceneManager.start();
  projectLayerReady = true;

  // 显示控制面板
  liquidControlPanel.show();

  // 添加快捷键：按 'L' 键切换控制面板
  window.addEventListener('keydown', (e) => {
    if (e.key === 'l' || e.key === 'L') {
      liquidControlPanel.toggle();
    } else if (e.key === 'r' || e.key === 'R') {
      void applyRandomVisualState();
    }
  });

  enablePresetControls();
  const initialPreset = currentPresetId ? findPresetById(currentPresetId) : null;
  setPresetStatus(
    initialPreset ? `Preset: ${initialPreset.label}` : 'Preset ready'
  );
  // Try auto-loading the default audio URL once (browser will still require user gesture for autoplay policies)
  void tryAutoLoadDefaultAudio();
  bindAudioResumeOnGesture();
})();

const fileInput = dom.audioFileInput;
const urlInput = dom.audioUrlInput;
const urlButton = dom.audioUrlButton;
const toggleButton = dom.audioToggle;
const volumeSlider = dom.audioVolumeInput;
const statusLabel = dom.audioStatus;
const timeLabel = dom.audioTime;
let autoAudioAttempted = false;
let audioResumeBound = false;

async function tryAutoLoadDefaultAudio() {
  if (autoAudioAttempted) return;
  autoAudioAttempted = true;

  // No longer auto-loading remote audio on startup.
  // Test track will be loaded on first user gesture (see bindAudioResumeOnGesture).
  bindAudioResumeOnGesture();
}

function bindAudioResumeOnGesture() {
  if (audioResumeBound) return;
  audioResumeBound = true;
  const resume = () => {
    // Autoplay policy note (Chrome): user activation can be lost after an `await`.
    // So we must start audio loading synchronously inside the gesture handler.

    // Load & play the local test track on first user gesture.
    if (!audioBus.isReady) {
      console.log(`[Audio] Attempting to load: ${TEST_TRACK_URL}`);
      console.log(`[Audio] File path: ${TEST_TRACK_FS_PATH}`);

      const loadPromise = audioBus.loadUrl(TEST_TRACK_URL);
      void (async () => {
        try {
          // Optional fetch diagnostics (does not gate user activation).
          const head = await fetch(TEST_TRACK_URL, { method: 'HEAD' }).catch(() => null);
          if (head && !head.ok) {
            console.warn(`[Audio] HEAD not ok: ${head.status} ${head.statusText}`);
          }

          await loadPromise;

          // Enforce 80% volume always (gain node exists after load).
          audioBus.setVolume(0.8);
          if (volumeSlider) volumeSlider.value = '0.8';

          setStatus(`✅ Loaded: ${TEST_TRACK_FS_PATH}`);
          enablePlaybackControls();
          updatePlayButton();
        } catch (error) {
          console.error('Test track auto-load failed:', error);
          console.log('Check if file exists at:', TEST_TRACK_FS_PATH);
          console.log('Vite fs.allow should include: D:/test MP3');
          setStatus(`⚠️ Test track unavailable (see console)`, true);
        }
      })();
    } else {
      // Already loaded; just enforce volume.
      audioBus.setVolume(0.8);
      if (volumeSlider) volumeSlider.value = '0.8';
    }
  };
  window.addEventListener('pointerdown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });
}

const setStatus = (message: string, isError = false) => {
  if (!statusLabel) return;
  statusLabel.textContent = message;
  statusLabel.dataset.state = isError ? 'error' : 'ok';
};

const enablePlaybackControls = () => {
  if (toggleButton?.disabled) {
    toggleButton.disabled = false;
  }
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) {
    return '00:00';
  }
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
};

const updatePlayButton = () => {
  if (!toggleButton) return;
  toggleButton.textContent = audioBus.isPlaying ? 'Pause' : 'Play';
};

const updateTimeline = () => {
  if (!timeLabel) return;
  const current = formatTime(audioBus.currentTime);
  const total = formatTime(audioBus.duration);
  timeLabel.textContent = `${current} / ${total}`;
};

fileInput?.addEventListener('change', async (event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  try {
    await audioBus.loadFile(file);
    setStatus(`Loaded: ${file.name}`);
    enablePlaybackControls();
    updatePlayButton();
  } catch (error) {
    console.error('Audio load failed', error);
    setStatus('Failed to load file', true);
  }
});

urlButton?.addEventListener('click', async () => {
  const url = urlInput?.value.trim();
  if (!url) {
    setStatus('Enter an audio URL first', true);
    return;
  }
  try {
    await audioBus.loadUrl(url);
    setStatus(`Streaming: ${url}`);
    enablePlaybackControls();
    updatePlayButton();
  } catch (error) {
    console.error('Audio URL load failed', error);
    setStatus('Unable to load URL', true);
  }
});

toggleButton?.addEventListener('click', () => {
  audioBus.toggle();
  updatePlayButton();
});

volumeSlider?.addEventListener('input', (event) => {
  const slider = event.target as HTMLInputElement;
  audioBus.setVolume(Number(slider.value));
});

pmBlendModeSelect?.addEventListener('change', () => {
  applyBlendControlsToLayer();
});

pmOpacityInput?.addEventListener('input', () => {
  applyBlendControlsToLayer();
});

pmAudioOpacityToggle?.addEventListener('change', () => {
  applyBlendControlsToLayer();
});

pmEnergyOpacityInput?.addEventListener('change', () => {
  applyBlendControlsToLayer();
});

audioBus.onFrame((frame: AudioFrame) => {
  projectLayer.setAudioFrame(frame);
  liquidLayer.setAudioFrame(frame);
  currentEnergyLevel = frame.energy;
  const now = performance.now();
  if (now - lastDiagnosticsUpdate >= DIAGNOSTICS_THROTTLE_MS) {
    diagnosticsPanel.updateAudioContext(audioBus.audioContextState);
    diagnosticsPanel.updateAudioFrame({ energy: frame.energy, rms: frame.rms, peak: frame.peak });
    diagnosticsPanel.updateProjectM((globalThis as any).__projectm_verify ?? {});
    diagnosticsPanel.updateRenderer(sceneManager.getRendererInfo());
    updateTimeline();
    lastDiagnosticsUpdate = now;
  }
});

// (moved above as function declaration so it can be called earlier)

presetLibrarySelect?.addEventListener('change', (event) => {
  const select = event.target as HTMLSelectElement;
  const nextSource = select.value as PresetLibrarySource;
  const isValid = PRESET_LIBRARIES.some((lib) => lib.id === nextSource);
  if (!isValid) {
    setLibrarySelectValue(currentLibrarySource);
    return;
  }
  void reloadLibraryPresets(nextSource);
});

presetSelect?.addEventListener('change', async (event) => {
  if (!projectLayerReady) return;
  const select = event.target as HTMLSelectElement;
  const presetId = select.value;
  const preset = findPresetById(presetId);
  if (!preset) {
    setPresetStatus('Preset not found in manifest', true);
    return;
  }
  setPresetStatus(`Loading: ${preset.label} ...`);
  try {
    ensureProjectLayerReady();
    await projectLayer.loadPresetFromUrl(preset.url);
    currentPresetId = presetId;
    currentPresetUrl = preset.url;
    setPresetStatus(`Preset: ${preset.label}`);
    if (presetAutoToggle?.checked) {
      scheduleAutoCycle();
    }
  } catch (error) {
    const compatNote = getCompatNote(preset);
    handlePresetLoadError(`Failed to load preset${compatNote}`, error);
    markPresetAsBrokenAndRefresh(preset);
  }
});

presetNextButton?.addEventListener('click', () => {
  void cycleToNextPreset('manual');
});

presetAutoToggle?.addEventListener('change', (event) => {
  const checkbox = event.target as HTMLInputElement;
  if (checkbox.checked) {
    scheduleAutoCycle();
  } else {
    stopAutoCycle('Auto-cycle paused');
  }
});

presetAutoIntervalInput?.addEventListener('change', () => {
  const seconds = getAutoIntervalSeconds();
  if (presetAutoToggle?.checked) {
    scheduleAutoCycle();
  } else {
    setPresetStatus(`Auto-cycle interval set to ${seconds}s`);
  }
});

presetFileInput?.addEventListener('change', async (event) => {
  if (!projectLayerReady) return;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  setPresetStatus(`Importing: ${file.name} ...`);
  try {
    ensureProjectLayerReady();
    const presetData = await file.text();
    projectLayer.loadPresetFromData(presetData);
    currentPresetId = null;
    currentPresetUrl = `file:${file.name}`;
    updatePresetSelectValue(null);
    stopAutoCycle();
    setPresetStatus(`Preset: ${file.name}`);
  } catch (error) {
    handlePresetLoadError('Failed to import preset file', error);
    markPresetAsBrokenAndRefresh({ id: `file:${file.name}` });
  } finally {
    input.value = '';
  }
});

presetUrlButton?.addEventListener('click', async () => {
  if (!projectLayerReady) return;
  const url = presetUrlInput?.value.trim();
  if (!url) {
    setPresetStatus('Enter a preset URL first', true);
    return;
  }
  setPresetStatus('Loading preset URL ...');
  try {
    ensureProjectLayerReady();
    await projectLayer.loadPresetFromUrl(url);
    currentPresetId = null;
    currentPresetUrl = url;
    updatePresetSelectValue(null);
    stopAutoCycle();
    setPresetStatus(`Preset: ${url}`);
  } catch (error) {
    handlePresetLoadError('Failed to load preset URL', error);
    markPresetAsBrokenAndRefresh({ id: `url:${url}` });
  }
});

visualRandomButton?.addEventListener('click', () => {
  void applyRandomVisualState();
});

visualFavoriteButton?.addEventListener('click', () => {
  const state = buildCurrentVisualState();
  const preset = state.projectm.presetId ? findPresetById(state.projectm.presetId) : null;

  const favorite: FavoriteVisualState = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    label: preset?.label ?? state.projectm.presetUrl ?? null,
    state
  };
  lastVisualState = state;
  favorites = [...favorites, favorite];
  saveFavoritesToStorage(localStorage, FAVORITES_STORAGE_KEY, favorites);
  updateFavoriteCountLabel();
  setStatus('Favorited current visual state');
});

visualFavoriteCount?.addEventListener('click', () => {
  const panel = ensureFavoritesPanel();
  if (panel.style.display === 'none' || !panel.style.display) {
    refreshFavoritesPanel();
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
});

window.addEventListener('beforeunload', () => audioBus.dispose());

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    audioBus.dispose();
    cameraLayer?.dispose();
  });
}
