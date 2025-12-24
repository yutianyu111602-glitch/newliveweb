import type { ProjectMLayer } from "../../layers/ProjectMLayer";
import {
  type PresetDescriptor,
  findPresetById,
  getAllPresets,
  getNextPreset,
  markPresetAsBroken,
  registerRuntimePresets,
} from "../../config/presets";
import { loadLibraryManifest } from "../../lib/loadManifest";
import { mapManifestToPresetDescriptors } from "../../config/presetManifest";
import {
  DEFAULT_LIBRARY_SOURCE,
  PRESET_LIBRARIES,
  type PresetLibrarySource,
  getLibraryConfig,
} from "../../config/presetLibraries";
import {
  bindButton,
  bindCheckbox,
  bindFileInput,
  bindInputValue,
  bindSelect,
} from "../../app/bindings/domBindings";

export type PresetsDom = {
  presetSelect: HTMLSelectElement | null;
  presetFileInput: HTMLInputElement | null;
  presetUrlInput: HTMLInputElement | null;
  presetUrlButton: HTMLButtonElement | null;
  presetStatus: HTMLElement | null;
  presetManifestInfo: HTMLElement | null;
  presetNextButton: HTMLButtonElement | null;
  presetAutoToggle: HTMLInputElement | null;
  presetAutoIntervalInput: HTMLInputElement | null;
  presetAutoLabel: HTMLElement | null;
  presetLibrarySelect: HTMLSelectElement | null;
};

export type PresetsControllerOptions = {
  dom: PresetsDom;
  presetControls: Array<
    HTMLInputElement | HTMLSelectElement | HTMLButtonElement | null
  >;
  projectLayer: ProjectMLayer;
  isProjectLayerReady: () => boolean;
  ensureProjectLayerReady: () => void;
  getCurrentPresetId: () => string | null;
  getCurrentPresetUrl: () => string | null;
  setCurrentPreset: (next: { id: string | null; url: string | null }) => void;
  storage?: Pick<Storage, "getItem" | "setItem">;
};

export type PresetsControllerHandle = {
  init: () => void;
  onProjectLayerReady: () => void;
  dispose: () => void;
  setStatus: (message: string, isError?: boolean) => void;
  getCompatNote: (preset?: PresetDescriptor | null) => string;
  handleLoadError: (message: string, error: unknown) => void;
  updateSelectValue: (presetId: string | null) => void;
  loadPresetFromUrl: (args: {
    url: string;
    presetId?: string | null;
    label?: string;
    origin?: string;
    compatPreset?: PresetDescriptor | null;
    brokenId?: string;
  }) => Promise<void>;
  loadPresetFromDescriptor: (
    preset: PresetDescriptor,
    origin?: string
  ) => Promise<void>;
  refresh: () => void;
  markBrokenAndRefresh: (
    preset?: { id: string } | PresetDescriptor | null
  ) => void;
};

const AUTO_INTERVAL_DEFAULT = 90;
const AUTO_INTERVAL_MIN = 15;
const AUTO_INTERVAL_MAX = 600;

export function createPresetsController(
  options: PresetsControllerOptions
): PresetsControllerHandle {
  const {
    dom,
    presetControls,
    projectLayer,
    isProjectLayerReady,
    ensureProjectLayerReady,
    getCurrentPresetId,
    getCurrentPresetUrl,
    setCurrentPreset,
    storage = localStorage,
  } = options;

  let autoCycleTimer: number | null = null;
  let currentLibrarySource: PresetLibrarySource = DEFAULT_LIBRARY_SOURCE;

  const disposers: Array<() => void> = [];

  const setStatus = (message: string, isError = false) => {
    if (!dom.presetStatus) return;
    dom.presetStatus.textContent = message;
    dom.presetStatus.dataset.state = isError ? "error" : "ok";
  };

  const setManifestInfo = (message: string, isError = false) => {
    if (!dom.presetManifestInfo) return;
    dom.presetManifestInfo.textContent = message;
    dom.presetManifestInfo.dataset.state = isError ? "error" : "ok";
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

  const handleLoadError = (message: string, error: unknown) => {
    // Distinguish network errors from other types
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isNetworkError =
      errorMsg.includes("Network") ||
      errorMsg.includes("fetch") ||
      errorMsg.includes("connect") ||
      errorMsg.includes("Connection refused") ||
      errorMsg.includes("timeout");

    if (isNetworkError) {
      console.warn(message, error);
      setStatus("⚠️ 网络错误：开发服务器未运行或连接中断", true);
    } else {
      console.error(message, error);
      setStatus(message, true);
    }
  };

  const shouldPauseAutoCycleOnError = (origin?: string | null) => {
    const normalized = (origin ?? "").trim().toLowerCase();
    return normalized === "auto" || normalized.startsWith("auto");
  };

  const isTransientPresetLoadError = (error: unknown) => {
    if (error instanceof Error) {
      if (error.name === "AbortError") return true;
      const msg = String(error.message || "");
      return (
        msg.includes("Network timeout") ||
        msg.includes("timeout=") ||
        msg.includes("Network error") ||
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("Load failed") ||
        msg.includes("ERR_ABORTED")
      );
    }
    const msg = String((error as any)?.message ?? error);
    return (
      msg.includes("Network timeout") ||
      msg.includes("Network error") ||
      msg.includes("Failed to fetch") ||
      msg.includes("timeout=")
    );
  };

  const disableControls = () => {
    presetControls.forEach((control) => {
      if (!control) return;
      control.disabled = true;
    });
  };

  const enableControls = () => {
    presetControls.forEach((control) => {
      if (!control) return;
      control.disabled = false;
    });
    updateCyclerAvailability();
  };

  const updateSelectValue = (presetId: string | null) => {
    if (!dom.presetSelect) return;
    if (presetId) {
      dom.presetSelect.value = presetId;
    } else {
      dom.presetSelect.selectedIndex = -1;
    }
  };

  const refreshSelect = () => {
    if (!dom.presetSelect) return;

    const presets = getAllPresets();
    if (!presets.length) {
      dom.presetSelect.innerHTML =
        "<option disabled selected>No presets available</option>";
      dom.presetSelect.disabled = true;
      return;
    }

    const currentPresetId = getCurrentPresetId();
    const hasCurrent = currentPresetId
      ? presets.some((preset) => preset.id === currentPresetId)
      : false;

    let nextPresetId = currentPresetId;
    if (!hasCurrent) {
      nextPresetId = presets[0]?.id ?? null;
      setCurrentPreset({ id: nextPresetId, url: getCurrentPresetUrl() });
    }

    dom.presetSelect.disabled = false;
    dom.presetSelect.innerHTML = presets
      .map((preset) => `<option value="${preset.id}">${preset.label}</option>`)
      .join("");
    updateSelectValue(nextPresetId);
  };

  const setLibrarySelectValue = (source: PresetLibrarySource) => {
    if (!dom.presetLibrarySelect) return;
    dom.presetLibrarySelect.value = source;
  };

  const getInitialLibrarySource = (): PresetLibrarySource => {
    try {
      const stored = storage.getItem("presetLibrarySource");
      if (stored && PRESET_LIBRARIES.some((lib) => lib.id === stored)) {
        return stored as PresetLibrarySource;
      }
    } catch {
      // ignore
    }
    return DEFAULT_LIBRARY_SOURCE;
  };

  const persistLibrarySource = (source: PresetLibrarySource) => {
    try {
      storage.setItem("presetLibrarySource", source);
    } catch {
      // ignore
    }
  };

  const markBrokenAndRefresh = (
    preset?: { id: string } | PresetDescriptor | null
  ) => {
    const presetId = preset?.id;
    if (!presetId) return;

    markPresetAsBroken(presetId);

    const currentPresetId = getCurrentPresetId();
    if (currentPresetId === presetId) {
      setCurrentPreset({ id: null, url: null });
    }

    refreshSelect();
    updateCyclerAvailability();
  };

  const clampAutoInterval = (value: number | null) => {
    if (!Number.isFinite(value)) return AUTO_INTERVAL_DEFAULT;
    return Math.min(
      AUTO_INTERVAL_MAX,
      Math.max(AUTO_INTERVAL_MIN, value ?? AUTO_INTERVAL_DEFAULT)
    );
  };

  const setAutoLabelState = (isOn: boolean) => {
    if (!dom.presetAutoLabel) return;
    dom.presetAutoLabel.textContent = isOn ? "Auto-cycle (on)" : "Auto-cycle";
  };

  const clearAutoCycleTimer = () => {
    if (autoCycleTimer != null) {
      window.clearInterval(autoCycleTimer);
      autoCycleTimer = null;
    }
  };

  const stopAutoCycle = (statusMessage?: string, isError = false) => {
    if (dom.presetAutoToggle) {
      dom.presetAutoToggle.checked = false;
    }
    clearAutoCycleTimer();
    setAutoLabelState(false);
    if (statusMessage) {
      setStatus(statusMessage, isError);
    }
  };

  const updateCyclerAvailability = () => {
    const hasPresets = getAllPresets().length > 0;
    if (dom.presetSelect) dom.presetSelect.disabled = !hasPresets;
    if (dom.presetNextButton) dom.presetNextButton.disabled = !hasPresets;
    if (dom.presetAutoToggle) dom.presetAutoToggle.disabled = !hasPresets;
    if (dom.presetAutoIntervalInput)
      dom.presetAutoIntervalInput.disabled = !hasPresets;
    if (!hasPresets) {
      stopAutoCycle();
    }
  };

  const getAutoIntervalSeconds = () => {
    const value = Number(
      dom.presetAutoIntervalInput?.value ?? AUTO_INTERVAL_DEFAULT
    );
    const clamped = clampAutoInterval(value);
    if (dom.presetAutoIntervalInput) {
      dom.presetAutoIntervalInput.value = String(clamped);
    }
    return clamped;
  };

  const scheduleAutoCycle = () => {
    clearAutoCycleTimer();
    if (!dom.presetAutoToggle?.checked) {
      return;
    }
    if (!getAllPresets().length) {
      stopAutoCycle("No presets to auto-cycle", true);
      return;
    }
    const seconds = getAutoIntervalSeconds();
    autoCycleTimer = window.setInterval(() => {
      void cycleToNextPreset("auto");
    }, seconds * 1000);
    setAutoLabelState(true);
    setStatus(`Auto-cycle every ${seconds}s`);
  };

  const cycleToNextPreset = async (origin: "manual" | "auto") => {
    if (!isProjectLayerReady()) return;

    const currentPresetId = getCurrentPresetId();
    const nextPreset = getNextPreset(currentPresetId);
    if (!nextPreset) {
      stopAutoCycle("No presets available for cycling", true);
      return;
    }

    setStatus(
      `${origin === "auto" ? "Auto" : "Manual"} loading: ${
        nextPreset.label
      } ...`
    );
    try {
      ensureProjectLayerReady();
      await projectLayer.loadPresetFromUrl(nextPreset.url);
      setCurrentPreset({ id: nextPreset.id, url: nextPreset.url });
      updateSelectValue(nextPreset.id);
      setStatus(`Preset: ${nextPreset.label}`);
    } catch (error) {
      const compatNote = getCompatNote(nextPreset);
      handleLoadError(`Failed to load preset${compatNote}`, error);
      if (!isTransientPresetLoadError(error)) {
        markBrokenAndRefresh(nextPreset);
      }
      if (origin === "auto") {
        stopAutoCycle("Auto-cycle paused due to error", true);
      }
    }
  };

  const loadPresetFromUrl = async (args: {
    url: string;
    presetId?: string | null;
    label?: string;
    origin?: string;
    compatPreset?: PresetDescriptor | null;
    brokenId?: string;
  }) => {
    const url = args.url;
    const presetId = args.presetId ?? null;
    const label = args.label ?? url;
    const origin = args.origin ?? "Loading";
    const compatPreset =
      args.compatPreset ?? (presetId ? findPresetById(presetId) : null);
    const brokenId = args.brokenId ?? presetId ?? `url:${url}`;

    // Keep behavior consistent with previous bootstrap logic: if ProjectM isn't ready,
    // only update state and return without touching status/errors.
    if (!isProjectLayerReady()) {
      setCurrentPreset({ id: presetId, url });
      return;
    }

    setStatus(`${origin} loading: ${label} ...`);
    try {
      ensureProjectLayerReady();
      await projectLayer.loadPresetFromUrl(url);
      setCurrentPreset({ id: presetId, url });

      const isKnownId = presetId ? Boolean(findPresetById(presetId)) : false;
      updateSelectValue(isKnownId ? presetId : null);
      setStatus(`Preset: ${label}`);
    } catch (error) {
      const compatNote = getCompatNote(compatPreset);
      handleLoadError(`Failed to load preset${compatNote}`, error);
      if (!isTransientPresetLoadError(error)) {
        markBrokenAndRefresh({ id: brokenId });
      }
      if (shouldPauseAutoCycleOnError(origin)) {
        stopAutoCycle("Auto-cycle paused due to error", true);
      }
    }
  };

  const loadPresetFromDescriptor = async (
    preset: PresetDescriptor,
    origin = "Random"
  ) => {
    await loadPresetFromUrl({
      url: preset.url,
      presetId: preset.id,
      label: preset.label,
      origin,
      compatPreset: preset,
      brokenId: preset.id,
    });
  };

  async function loadPresetManifestForSource(source: PresetLibrarySource) {
    const { manifestUrl, label, requireWasmSafe } = getLibraryConfig(source);
    try {
      setManifestInfo(`Loading ${label} manifest...`);
      const manifest = await loadLibraryManifest(manifestUrl, {
        requireWasmSafe,
      });
      const presets = mapManifestToPresetDescriptors(manifest);
      registerRuntimePresets(presets);
      refreshSelect();
      updateCyclerAvailability();

      const filteredOut = manifest.filteredOutByWasmCompat ?? 0;
      const filteredInfo =
        filteredOut > 0 ? ` (filtered ${filteredOut} by wasmCompat)` : "";

      if (presets.length) {
        setManifestInfo(
          `Loaded ${presets.length} presets | ${label}${filteredInfo} | ${
            manifest.sourceRoot ?? "custom pack"
          }`
        );
      } else {
        setManifestInfo(`Preset manifest has 0 entries | ${label}`);
      }

      const currentPresetId = getCurrentPresetId();
      const hasCurrent = currentPresetId
        ? findPresetById(currentPresetId)
        : null;
      if (!hasCurrent) {
        const nextPresetId = getAllPresets()[0]?.id ?? null;
        setCurrentPreset({ id: nextPresetId, url: getCurrentPresetUrl() });
        updateSelectValue(nextPresetId);
      }

      const initialPresetId = getCurrentPresetId();
      const initialPreset = initialPresetId
        ? findPresetById(initialPresetId)
        : null;

      // When the library changes, prefer a deterministic outcome:
      // load the first available preset (or keep current if still present).
      if (isProjectLayerReady()) {
        if ((projectLayer as any).isFailed?.()) {
          setStatus("ProjectM engine failed; refresh page to recover", true);
          return;
        }

        const presetToLoad =
          (initialPresetId ? findPresetById(initialPresetId) : null) ??
          getAllPresets()[0] ??
          null;

        if (presetToLoad) {
          setStatus(`Loading: ${presetToLoad.label} ...`);
          try {
            ensureProjectLayerReady();
            await projectLayer.loadPresetFromUrl(presetToLoad.url);
            setCurrentPreset({ id: presetToLoad.id, url: presetToLoad.url });
            updateSelectValue(presetToLoad.id);
            setStatus(`Preset: ${presetToLoad.label}`);
          } catch (error) {
            const compatNote = getCompatNote(presetToLoad);
            handleLoadError(`Failed to load preset${compatNote}`, error);
            if (!isTransientPresetLoadError(error)) {
              markBrokenAndRefresh(presetToLoad);
            }
          }
          return;
        }
      }

      setStatus(
        initialPreset ? `Preset: ${initialPreset.label}` : "Preset ready"
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isNetworkError =
        errorMsg.includes("Network") ||
        errorMsg.includes("fetch") ||
        errorMsg.includes("connect") ||
        errorMsg.includes("timeout");

      if (isNetworkError) {
        console.warn("Preset manifest unavailable due to network error", error);
        setManifestInfo(
          `⚠️ 网络错误：无法加载预设库 - ${getLibraryConfig(source).label}`,
          true
        );
      } else {
        console.warn("Preset manifest unavailable", error);
        setManifestInfo(
          `Preset manifest missing - ${getLibraryConfig(source).label}`,
          true
        );
      }

      registerRuntimePresets([]);
      refreshSelect();
      updateCyclerAvailability();
    }
  }

  const reloadLibraryPresets = async (source: PresetLibrarySource) => {
    currentLibrarySource = source;
    persistLibrarySource(source);
    setLibrarySelectValue(source);
    stopAutoCycle("Auto-cycle paused by library change");
    setCurrentPreset({ id: null, url: null });
    await loadPresetManifestForSource(source);
  };

  const bind = () => {
    if (dom.presetLibrarySelect) {
      const binding = bindSelect({
        el: dom.presetLibrarySelect,
        get: () => String(currentLibrarySource),
        set: (raw) => {
          const nextSource = raw as PresetLibrarySource;
          const isValid = PRESET_LIBRARIES.some((lib) => lib.id === nextSource);
          if (!isValid) {
            setLibrarySelectValue(currentLibrarySource);
            return;
          }
          void reloadLibraryPresets(nextSource);
        },
      });
      binding.sync();
      disposers.push(binding.dispose);
    }

    if (dom.presetSelect) {
      const onSelect = async (presetId: string) => {
        if (!isProjectLayerReady()) return;
        const preset = findPresetById(presetId);
        if (!preset) {
          setStatus("Preset not found in manifest", true);
          return;
        }
        setStatus(`Loading: ${preset.label} ...`);
        try {
          ensureProjectLayerReady();
          await projectLayer.loadPresetFromUrl(preset.url);
          setCurrentPreset({ id: presetId, url: preset.url });
          setStatus(`Preset: ${preset.label}`);
          if (dom.presetAutoToggle?.checked) {
            scheduleAutoCycle();
          }
        } catch (error) {
          const compatNote = getCompatNote(preset);
          handleLoadError(`Failed to load preset${compatNote}`, error);
          if (!isTransientPresetLoadError(error)) {
            markBrokenAndRefresh(preset);
          }
          if (dom.presetAutoToggle?.checked) {
            stopAutoCycle("Auto-cycle paused due to error", true);
          }
        }
      };

      const binding = bindSelect({
        el: dom.presetSelect,
        get: () => String(dom.presetSelect?.value ?? ""),
        set: (presetId) => {
          void onSelect(presetId);
        },
      });
      disposers.push(binding.dispose);
    }

    if (dom.presetNextButton) {
      const binding = bindButton(dom.presetNextButton, () => {
        void cycleToNextPreset("manual");
      });
      disposers.push(binding.dispose);
    }

    if (dom.presetAutoToggle) {
      const binding = bindCheckbox({
        el: dom.presetAutoToggle,
        get: () => Boolean(dom.presetAutoToggle?.checked),
        set: (checked) => {
          if (checked) scheduleAutoCycle();
          else stopAutoCycle("Auto-cycle paused");
        },
        event: "change",
      });
      disposers.push(binding.dispose);
    }

    if (dom.presetAutoIntervalInput) {
      const binding = bindInputValue({
        el: dom.presetAutoIntervalInput,
        event: "change",
        get: () =>
          String(dom.presetAutoIntervalInput?.value ?? AUTO_INTERVAL_DEFAULT),
        set: () => {
          const seconds = getAutoIntervalSeconds();
          if (dom.presetAutoToggle?.checked) {
            scheduleAutoCycle();
          } else {
            setStatus(`Auto-cycle interval set to ${seconds}s`);
          }
        },
      });
      disposers.push(binding.dispose);
    }

    if (dom.presetFileInput) {
      const binding = bindFileInput({
        el: dom.presetFileInput,
        clearAfter: true,
        set: async (file) => {
          if (!isProjectLayerReady()) return;
          setStatus(`Importing: ${file.name} ...`);
          try {
            ensureProjectLayerReady();
            const presetData = await file.text();
            projectLayer.loadPresetFromData(presetData);
            setCurrentPreset({ id: null, url: `file:${file.name}` });
            updateSelectValue(null);
            stopAutoCycle();
            setStatus(`Preset: ${file.name}`);
          } catch (error) {
            handleLoadError("Failed to import preset file", error);
            if (!isTransientPresetLoadError(error)) {
              markBrokenAndRefresh({ id: `file:${file.name}` });
            }
          }
        },
      });
      disposers.push(binding.dispose);
    }

    if (dom.presetUrlButton) {
      const binding = bindButton(dom.presetUrlButton, () => {
        void (async () => {
          if (!isProjectLayerReady()) return;
          const url = dom.presetUrlInput?.value.trim();
          if (!url) {
            setStatus("Enter a preset URL first", true);
            return;
          }
          setStatus("Loading preset URL ...");
          try {
            ensureProjectLayerReady();
            await projectLayer.loadPresetFromUrl(url);
            setCurrentPreset({ id: null, url });
            updateSelectValue(null);
            stopAutoCycle();
            setStatus(`Preset: ${url}`);
          } catch (error) {
            handleLoadError("Failed to load preset URL", error);
            if (!isTransientPresetLoadError(error)) {
              markBrokenAndRefresh({ id: `url:${url}` });
            }
          }
        })();
      });
      disposers.push(binding.dispose);
    }
  };

  const init = () => {
    disableControls();
    refreshSelect();
    setAutoLabelState(false);

    currentLibrarySource = getInitialLibrarySource();
    setLibrarySelectValue(currentLibrarySource);

    bind();
    void loadPresetManifestForSource(currentLibrarySource);
  };

  const onProjectLayerReady = () => {
    enableControls();
    const initialPresetId = getCurrentPresetId();
    const initialPreset = initialPresetId
      ? findPresetById(initialPresetId)
      : null;
    setStatus(
      initialPreset ? `Preset: ${initialPreset.label}` : "Preset ready"
    );
  };

  const dispose = () => {
    stopAutoCycle();
    for (const d of disposers.splice(0)) {
      try {
        d();
      } catch {
        // ignore
      }
    }
  };

  return {
    init,
    onProjectLayerReady,
    dispose,
    setStatus,
    getCompatNote,
    handleLoadError,
    updateSelectValue,
    loadPresetFromUrl,
    loadPresetFromDescriptor,
    refresh: refreshSelect,
    markBrokenAndRefresh: markBrokenAndRefresh,
  };
}
