import type { VisualStateV2 } from "../../features/visualState/visualStateStore";
import type { CameraLayer } from "../../layers/CameraLayer";
import { bindSelect, type DomBinding } from "../bindings/domBindings";

type BackgroundType = VisualStateV2["background"]["type"];
type PatchSource = "user" | "macro" | "closedLoop";

const FOREGROUND_TYPES = ["none", "camera", "video", "basic", "depth"] as const;
const LIQUID_VARIANTS = ["metal", "waves", "stars", "lines"] as const;

export type BackgroundMixerUiController = {
  bind: () => void;
  syncToggles: () => void;
  startCameraEnableHint: (opts?: {
    fallbackToLiquidOnFailure?: boolean;
  }) => void;
  dispose?: () => void;
};

export function createBackgroundMixerUiController(opts: {
  dom: {
    bgTypeSelect: HTMLSelectElement | null;
    bgVariantSelect: HTMLSelectElement | null;
  };
  cameraLayer: CameraLayer | null;
  getState: () => VisualStateV2;
  isSecureContext: () => boolean;
  setStatusExtraTransient: (message: string, ttlMs?: number) => void;
  refreshCameraDevices: () => void | Promise<void>;
  applyBackgroundLayerPatch: (
    layerType: BackgroundType,
    patch: Record<string, unknown>,
    source?: PatchSource
  ) => void;
  applyBackgroundTypePatch: (type: unknown) => void;
}): BackgroundMixerUiController {
  const {
    dom,
    cameraLayer,
    getState,
    isSecureContext,
    setStatusExtraTransient,
    refreshCameraDevices,
    applyBackgroundLayerPatch,
    applyBackgroundTypePatch,
  } = opts;

  let bound = false;
  let typeBinding: DomBinding | null = null;
  let variantBinding: DomBinding | null = null;

  const getBgTypeValueForSelect = () => {
    const state = getState();
    const bgType = state.background.type;
    const desired = bgType === "liquid" ? "none" : bgType;
    if (!FOREGROUND_TYPES.includes(desired as any)) return "none";
    if (desired === "camera" && !cameraLayer) return "none";
    return desired;
  };

  const getVariantValueForSelect = () => {
    const state = getState();
    const layers = (state.background as any)?.layers as
      | Record<string, Record<string, unknown>>
      | undefined;
    const rawVariant = String(
      (layers?.liquid as any)?.variant ??
        (state.background.params as any)?.variant ??
        "metal"
    ).trim();
    return LIQUID_VARIANTS.includes(rawVariant as any) ? rawVariant : "metal";
  };

  const syncToggles = () => {
    // If bindings are not active yet, mirror prior behavior for early calls.
    if (!typeBinding && dom.bgTypeSelect) {
      dom.bgTypeSelect.value = getBgTypeValueForSelect();
    }
    if (!variantBinding && dom.bgVariantSelect) {
      dom.bgVariantSelect.value = getVariantValueForSelect();
    }

    typeBinding?.sync();
    variantBinding?.sync();
  };

  const startCameraEnableHint = (hintOpts?: {
    fallbackToLiquidOnFailure?: boolean;
  }) => {
    if (!cameraLayer) return;
    setStatusExtraTransient("camera permission…", 2500);

    void (async () => {
      const startedAt = performance.now();
      const timeoutMs = 8000;

      while (performance.now() - startedAt < timeoutMs) {
        const status = (cameraLayer as any).getStatus?.() as
          | { state?: string; lastErrorName?: string | null }
          | undefined;
        if (!status) return;
        if (status.state === "streaming") {
          void refreshCameraDevices();
          return;
        }
        if (status.state === "error") {
          const name = status.lastErrorName ?? "error";
          const reason = (() => {
            if (name === "NotAllowedError" || name === "SecurityError") {
              return "permission denied";
            }
            if (name === "NotFoundError") {
              return "no camera device";
            }
            if (name === "NotReadableError") {
              return "device busy";
            }
            return "unavailable";
          })();
          setStatusExtraTransient(`camera ${reason}`, 3500);

          if (
            hintOpts?.fallbackToLiquidOnFailure &&
            getState().background.type === "camera"
          ) {
            applyBackgroundTypePatch("liquid");
          }
          return;
        }
        await new Promise((r) => window.setTimeout(r, 800));
      }

      setStatusExtraTransient("camera still starting (check permission)", 4000);
    })();
  };

  const onTypeChange = (rawFromDom: string) => {
    const raw = String(rawFromDom ?? "none");
    if (!FOREGROUND_TYPES.includes(raw as any)) return;
    const selectedType: BackgroundType =
      raw === "camera" || raw === "video" || raw === "basic" || raw === "depth"
        ? (raw as any)
        : "liquid";

    if (selectedType === "camera") {
      if (!cameraLayer) {
        setStatusExtraTransient("camera unavailable (no device)", 4500);
        applyBackgroundTypePatch("liquid");
        if (dom.bgTypeSelect) dom.bgTypeSelect.value = "none";
        return;
      }
    }

    applyBackgroundTypePatch(selectedType);
  };

  const onVariantChange = (rawFromDom: string) => {
    const v = String(rawFromDom ?? "metal").trim();
    const variant = LIQUID_VARIANTS.includes(v as any) ? v : "metal";
    applyBackgroundLayerPatch("liquid", { variant }, "user");
  };

  const bind = () => {
    if (bound) return;
    bound = true;

    typeBinding = bindSelect({
      el: dom.bgTypeSelect,
      get: getBgTypeValueForSelect,
      set: (value) => onTypeChange(value),
    });
    variantBinding = bindSelect({
      el: dom.bgVariantSelect,
      get: getVariantValueForSelect,
      set: (value) => onVariantChange(value),
    });

    // Push current state into DOM once bound.
    syncToggles();
  };

  const dispose = () => {
    if (!bound) return;
    bound = false;
    typeBinding?.dispose();
    variantBinding?.dispose();
    typeBinding = null;
    variantBinding = null;
  };

  return { bind, syncToggles, startCameraEnableHint, dispose };
}
