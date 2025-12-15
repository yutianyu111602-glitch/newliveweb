import './style.css';
import { SceneManager } from './SceneManager';
import { LiquidMetalLayerV2 } from './layers/LiquidMetalLayerV2';
import { LiquidMetalControlPanel } from './ui/LiquidMetalControlPanel';
import { ProjectMLayer } from './layers/ProjectMLayer';
import { AudioController } from './audio/AudioController';
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

app.innerHTML = `
  <div id="root" class="app-root">
    <div id="toolbar" class="toolbar">
      <div class="toolbar__grid">
        <div class="toolbar__section">
          <div class="toolbar__section-header">
            <span class="toolbar__title">newliveweb - LiquidMetal + ProjectM</span>
            <span id="audio-status" class="toolbar__status toolbar__status--tight">No audio loaded</span>
          </div>
          <div class="toolbar__row">
            <button id="audio-toggle" class="toolbar__button" disabled>Play</button>
            <label class="toolbar__file">
              <input type="file" id="audio-file" accept="audio/*" hidden />
              <span>Load audio</span>
            </label>
            <div class="toolbar__url">
              <input type="text" id="audio-url" placeholder="${audioUrlPlaceholder}" />
              <button id="audio-url-load" class="toolbar__button toolbar__button--compact">Load URL</button>
            </div>
            <label class="toolbar__volume">
              Vol
              <input type="range" id="audio-volume" min="0" max="1" step="0.01" value="0.8" />
            </label>
            <span id="audio-time" class="toolbar__time">00:00 / 00:00</span>
          </div>
        </div>

        <div class="toolbar__section">
          <div class="toolbar__section-header">
            <span class="toolbar__subtitle">Preset</span>
            <span id="preset-status" class="toolbar__status toolbar__status--inline">Preset engine booting...</span>
          </div>
          <div class="toolbar__row">
            <select id="preset-select" class="toolbar__select"></select>
            <label class="toolbar__file">
              <input type="file" id="preset-file" accept=".milk" hidden />
              <span>Import .milk</span>
            </label>
            <div class="toolbar__url">
              <input type="text" id="preset-url" placeholder="${presetUrlPlaceholder}" />
              <button id="preset-url-load" class="toolbar__button toolbar__button--compact">Load URL</button>
            </div>
            <button id="preset-next" class="toolbar__button toolbar__button--compact" title="Load next preset" disabled>Next</button>
          </div>
          <div class="toolbar__row">
            <label class="toolbar__switch" title="自动轮播 ProjectM 预设">
              <input type="checkbox" id="preset-auto-toggle" />
              <span id="preset-auto-label">Auto-cycle</span>
            </label>
            <label class="toolbar__interval" title="自动轮播间隔（秒）">
              Every
              <input type="number" id="preset-auto-interval" min="15" max="600" step="5" value="90" />
              s
            </label>
            <label class="toolbar__hint toolbar__hint--select">
              <span>库模式</span>
              <select id="preset-library-select" class="toolbar__select toolbar__select--compact">
                ${renderLibrarySelectOptions()}
              </select>
            </label>
            <span id="preset-manifest-info" class="toolbar__hint toolbar__hint--status">Preset manifest pending...</span>
          </div>
        </div>

        <div class="toolbar__section">
          <div class="toolbar__section-header">
            <span class="toolbar__subtitle">Visual actions</span>
            <span id="visual-favorite-count" class="toolbar__hint toolbar__hint--status toolbar__hint--pill">Favorites: 0</span>
          </div>
          <div class="toolbar__row">
            <button id="visual-random" class="toolbar__button toolbar__button--compact" title="全局随机视觉（受当前音乐能量影响）">Random visual</button>
            <button id="visual-favorite" class="toolbar__button toolbar__button--compact" title="收藏当前视觉配置">★ Favorite</button>
            <span class="toolbar__hint toolbar__hint--pill">测试音乐库：${TEST_AUDIO_LIBRARY_PATH}</span>
            <span class="toolbar__hint toolbar__hint--pill">预设合集：${PRESET_PACK_PATH}</span>
          </div>
        </div>
      </div>
    </div>
    <div id="canvas-root" class="canvas-root">
      <canvas id="viz-canvas"></canvas>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#viz-canvas');
if (!canvas) {
  throw new Error('#viz-canvas not found');
}

const sceneManager = new SceneManager(canvas);
const liquidLayer = new LiquidMetalLayerV2();
const liquidControlPanel = new LiquidMetalControlPanel(liquidLayer);
const projectLayer = new ProjectMLayer();
const cameraLayer = CAMERA_FEATURE.enabled ? new CameraLayer(CAMERA_FEATURE) : null;
const audioController = new AudioController();

const presetSelect = document.querySelector<HTMLSelectElement>('#preset-select');
const presetFileInput = document.querySelector<HTMLInputElement>('#preset-file');
const presetUrlInput = document.querySelector<HTMLInputElement>('#preset-url');
const presetUrlButton = document.querySelector<HTMLButtonElement>('#preset-url-load');
const presetStatus = document.querySelector<HTMLSpanElement>('#preset-status');
const presetManifestInfo = document.querySelector<HTMLSpanElement>('#preset-manifest-info');
const presetNextButton = document.querySelector<HTMLButtonElement>('#preset-next');
const presetAutoToggle = document.querySelector<HTMLInputElement>('#preset-auto-toggle');
const presetAutoIntervalInput = document.querySelector<HTMLInputElement>('#preset-auto-interval');
const presetAutoLabel = document.querySelector<HTMLSpanElement>('#preset-auto-label');
const presetLibrarySelect = document.querySelector<HTMLSelectElement>('#preset-library-select');
const visualRandomButton = document.querySelector<HTMLButtonElement>('#visual-random');
const visualFavoriteButton = document.querySelector<HTMLButtonElement>('#visual-favorite');
const visualFavoriteCount = document.querySelector<HTMLSpanElement>('#visual-favorite-count');
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
let projectLayerReady = false;
let autoCycleTimer: number | null = null;
let currentLibrarySource: PresetLibrarySource = DEFAULT_LIBRARY_SOURCE;
let currentEnergyLevel = 0;

type FavoriteVisualState = {
  id: string;
  createdAt: string;
  presetId: string | null;
  presetLabel: string | null;
  presetUrl: string | null;
  projectOpacity: number;
  liquidParams: ReturnType<typeof getLiquidParamsSnapshot>;
};

const FAVORITES_STORAGE_KEY = 'newliveweb:favorites:v1';

function getLiquidParamsSnapshot() {
  return { ...liquidLayer.params };
}

function computeEnergyCoefficient(data: { peak: number; rms: number }) {
  const raw = Math.max(data.peak ?? 0, (data.rms ?? 0) * 1.5);
  const clamped = Math.max(0, Math.min(1, raw));
  return clamped;
}

function loadFavoritesFromStorage(): FavoriteVisualState[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FavoriteVisualState[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFavoritesToStorage(favorites: FavoriteVisualState[]) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // Non-fatal if storage is unavailable
  }
}

let favorites: FavoriteVisualState[] = loadFavoritesFromStorage();

function updateFavoriteCountLabel() {
  if (!visualFavoriteCount) return;
  visualFavoriteCount.textContent = `Favorites: ${favorites.length}`;
}

function applyFavoriteVisualState(fav: FavoriteVisualState) {
  const preset = fav.presetId ? findPresetById(fav.presetId) : null;
  if (projectLayerReady && (fav.presetUrl || preset?.url)) {
    const url = fav.presetUrl || preset?.url!;
    setPresetStatus(`Loading favorite: ${fav.presetLabel ?? url} ...`);
    void (async () => {
      try {
        ensureProjectLayerReady();
        await projectLayer.loadPresetFromUrl(url);
        if (fav.presetId && findPresetById(fav.presetId)) {
          currentPresetId = fav.presetId;
          updatePresetSelectValue(fav.presetId);
        }
        setPresetStatus(`Preset: ${fav.presetLabel ?? url}`);
      } catch (error) {
        const compatNote = getCompatNote(preset ?? null);
        handlePresetLoadError(`Failed to load favorite preset${compatNote}`, error);
      }
    })();
  }

  liquidLayer.params = { ...liquidLayer.params, ...fav.liquidParams };
  liquidLayer.updateParams();
  projectLayer.setOpacity(fav.projectOpacity);
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
    empty.textContent = 'No favorites yet. Use ★ to save.';
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
      label.textContent = fav.presetLabel ?? '[no preset]';
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
        saveFavoritesToStorage(favorites);
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

  const presets = getAllPresets();
  const hasPresets = presets.length > 0;
  const maybePreset = hasPresets ? presets[Math.floor(Math.random() * presets.length)] : null;

  if (projectLayerReady && maybePreset) {
    setPresetStatus(`Random loading: ${maybePreset.label} ...`);
    try {
      ensureProjectLayerReady();
      await projectLayer.loadPresetFromUrl(maybePreset.url);
      currentPresetId = maybePreset.id;
      updatePresetSelectValue(maybePreset.id);
      setPresetStatus(`Preset: ${maybePreset.label}`);
    } catch (error) {
      const compatNote = getCompatNote(maybePreset);
      handlePresetLoadError(`Failed to load preset${compatNote}`, error);
      markPresetAsBrokenAndRefresh(maybePreset);
    }
  }

  const e = energy;
  const params = liquidLayer.params;
  params.brightness = randomInRange(0.6, 2.0) * (0.7 + e * 0.6);
  params.timeScale = randomInRange(0.4, 3.0) * (0.6 + e * 0.8);
  params.iterations = Math.round(randomInRange(5, 10));
  params.waveAmplitude = randomInRange(0.2, 1.0) * (0.5 + e * 0.7);
  params.mouseInfluence = randomInRange(0.2, 3.0);
  params.metallicAmount = randomInRange(0, 0.3) * (0.5 + e * 0.5);
  params.metallicSpeed = randomInRange(0.5, 3.0) * (0.5 + e * 0.8);
  params.audioReactive = true;
  params.audioSensitivity = randomInRange(0.6, 1.6);
  liquidLayer.updateParams();

  const targetOpacity = randomInRange(0.5, 1.0) * (0.6 + e * 0.7);
  projectLayer.setOpacity(targetOpacity);
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

  // ProjectM层初始化可能失败，使用try-catch包裹
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

  // 添加快捷键: 按 'L' 键切换控制面板
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

const fileInput = document.querySelector<HTMLInputElement>('#audio-file');
const urlInput = document.querySelector<HTMLInputElement>('#audio-url');
const urlButton = document.querySelector<HTMLButtonElement>('#audio-url-load');
const toggleButton = document.querySelector<HTMLButtonElement>('#audio-toggle');
const volumeSlider = document.querySelector<HTMLInputElement>('#audio-volume');
const statusLabel = document.querySelector<HTMLSpanElement>('#audio-status');
const timeLabel = document.querySelector<HTMLSpanElement>('#audio-time');
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
    if (!audioController.isReady) {
      console.log(`[Audio] Attempting to load: ${TEST_TRACK_URL}`);
      console.log(`[Audio] File path: ${TEST_TRACK_FS_PATH}`);

      const loadPromise = audioController.loadUrl(TEST_TRACK_URL);
      void (async () => {
        try {
          // Optional fetch diagnostics (does not gate user activation).
          const head = await fetch(TEST_TRACK_URL, { method: 'HEAD' }).catch(() => null);
          if (head && !head.ok) {
            console.warn(`[Audio] HEAD not ok: ${head.status} ${head.statusText}`);
          }

          await loadPromise;

          // Enforce 80% volume always (gain node exists after load).
          audioController.setVolume(0.8);
          if (volumeSlider) volumeSlider.value = '0.8';

          setStatus(`✅ Loaded: ${TEST_TRACK_FS_PATH}`);
          enablePlaybackControls();
          updatePlayButton();
        } catch (error) {
          console.error('Test track auto-load failed:', error);
          console.log('Check if file exists at:', TEST_TRACK_FS_PATH);
          console.log('Vite fs.allow should include: D:/test MP3');
          setStatus(`❌ Test track unavailable (see console)`, true);
        }
      })();
    } else {
      // Already loaded; just enforce volume.
      audioController.setVolume(0.8);
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
  toggleButton.textContent = audioController.isPlaying ? 'Pause' : 'Play';
};

const updateTimeline = () => {
  if (!timeLabel) return;
  const current = formatTime(audioController.currentTime);
  const total = formatTime(audioController.duration);
  timeLabel.textContent = `${current} / ${total}`;
};

fileInput?.addEventListener('change', async (event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  try {
    await audioController.loadFile(file);
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
    await audioController.loadUrl(url);
    setStatus(`Streaming: ${url}`);
    enablePlaybackControls();
    updatePlayButton();
  } catch (error) {
    console.error('Audio URL load failed', error);
    setStatus('Unable to load URL', true);
  }
});

toggleButton?.addEventListener('click', () => {
  audioController.toggle();
  updatePlayButton();
});

volumeSlider?.addEventListener('input', (event) => {
  const slider = event.target as HTMLInputElement;
  audioController.setVolume(Number(slider.value));
});

audioController.onFrame((data) => {
  projectLayer.addAudioData(data.pcm);
  // 传递音频数据给液态金属层
  liquidLayer.setAudioBands(data.bands);
  currentEnergyLevel = computeEnergyCoefficient({ peak: data.peak, rms: data.rms });
  updatePlayButton();
  updateTimeline();
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
  const preset = currentPresetId ? findPresetById(currentPresetId) : null;
  const snapshot = getLiquidParamsSnapshot();
  const favorite: FavoriteVisualState = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    presetId: preset?.id ?? null,
    presetLabel: preset?.label ?? null,
    presetUrl: preset?.url ?? null,
    projectOpacity: projectLayer.getOpacity(),
    liquidParams: snapshot
  };
  favorites = [...favorites, favorite];
  saveFavoritesToStorage(favorites);
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

window.addEventListener('beforeunload', () => audioController.dispose());

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    audioController.dispose();
    cameraLayer?.dispose();
  });
}
