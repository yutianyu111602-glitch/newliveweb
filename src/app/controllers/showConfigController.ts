import type { VisualStateV2 } from "../../features/visualState/visualStateStore";
import type { AudioTransportController } from "./audioTransportController";
import { listen } from "../bindings/domBindings";

type ShowConfigV1 = {
  version: 1;
  savedAt: string;
  audio: {
    preferredSource: "input" | "track";
    inputDeviceId: string | null;
    volume: number;
  };
  visual: VisualStateV2;
};

function clamp01Local(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function initShowConfigController(opts: {
  storage: Storage;
  storageKey: string;
  showSaveButton: HTMLButtonElement | null | undefined;
  showSetupButton: HTMLButtonElement | null | undefined;
  inputDeviceSelect: HTMLSelectElement | null | undefined;
  volumeSlider: HTMLInputElement | null | undefined;
  getAudioController: () => AudioTransportController | null;
  buildCurrentVisualState: () => VisualStateV2;
  applyVisualStateSnapshot: (
    state: VisualStateV2,
    origin: string,
    label: string | null,
    brokenId: string
  ) => void;
  applyBackgroundTypePatch: (type: "camera" | "liquid") => void;
  hasCameraLayer: () => boolean;
  setInspectorStatusExtraTransient: (message: string, ttlMs?: number) => void;
}): { dispose: () => void } {
  const {
    storage,
    storageKey,
    showSaveButton,
    showSetupButton,
    inputDeviceSelect,
    volumeSlider,
    getAudioController,
    buildCurrentVisualState,
    applyVisualStateSnapshot,
    applyBackgroundTypePatch,
    hasCameraLayer,
    setInspectorStatusExtraTransient,
  } = opts;

  function loadShowConfig(): ShowConfigV1 | null {
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as any;
      if (!parsed || typeof parsed !== "object") return null;
      if (parsed.version !== 1) return null;
      if (!parsed.visual || typeof parsed.visual !== "object") return null;
      if (parsed.visual.version !== 2) return null;

      const preferredSource =
        parsed.audio?.preferredSource === "input" ? "input" : "track";
      const inputDeviceId =
        parsed.audio?.inputDeviceId == null
          ? null
          : typeof parsed.audio.inputDeviceId === "string"
          ? parsed.audio.inputDeviceId
          : null;
      const volume = clamp01Local(
        Number(parsed.audio?.volume),
        preferredSource === "input" ? 0 : 0.8
      );

      return {
        version: 1,
        savedAt:
          typeof parsed.savedAt === "string"
            ? parsed.savedAt
            : new Date().toISOString(),
        audio: { preferredSource, inputDeviceId, volume },
        visual: parsed.visual as VisualStateV2,
      };
    } catch {
      return null;
    }
  }

  function saveShowConfig(config: ShowConfigV1) {
    try {
      storage.setItem(storageKey, JSON.stringify(config));
    } catch {
      // ignore
    }
  }

  const onSave = () => {
    const preferredSource: ShowConfigV1["audio"]["preferredSource"] = "input";
    const inputDeviceIdRaw = String(inputDeviceSelect?.value ?? "");
    const inputDeviceId = inputDeviceIdRaw ? inputDeviceIdRaw : null;
    const volume = clamp01Local(Number(volumeSlider?.value) / 100, 0);

    const config: ShowConfigV1 = {
      version: 1,
      savedAt: new Date().toISOString(),
      audio: {
        preferredSource,
        inputDeviceId,
        volume,
      },
      visual: buildCurrentVisualState(),
    };

    saveShowConfig(config);
    setInspectorStatusExtraTransient("show config saved", 2500);
  };

  const onSetup = () => {
    void (async () => {
      const audioController = getAudioController();
      const config = loadShowConfig();
      if (!config) {
        setInspectorStatusExtraTransient(
          "no show config saved; using input+camera",
          3500
        );
        await audioController?.useSelectedAudioInputDevice();
        applyBackgroundTypePatch(hasCameraLayer() ? "camera" : "liquid");
        return;
      }

      setInspectorStatusExtraTransient("applying show config…", 2500);
      await audioController?.applyShowAudio(config.audio);
      applyVisualStateSnapshot(config.visual, "Show", "Show", "show:v1");
      setInspectorStatusExtraTransient("show config applied", 2500);
    })();
  };

  const disposers = [
    listen(showSaveButton, "click", onSave),
    listen(showSetupButton, "click", onSetup),
  ];

  return {
    dispose: () => {
      for (const d of disposers) d();
    },
  };
}
