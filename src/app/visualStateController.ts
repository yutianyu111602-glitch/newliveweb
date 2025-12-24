import type { ProjectMLayer } from "../layers/ProjectMLayer";
import type {
  BlendMode,
  VisualStateV2,
} from "../features/visualState/visualStateStore";
import type { BackgroundRegistry } from "../background/backgroundRegistry";
import { getDefaultsForSchema } from "../state/paramSchema";

export type VisualStatePatch = {
  global?: Partial<VisualStateV2["global"]> & {
    macros?: Partial<VisualStateV2["global"]["macros"]>;
  };
  background?: {
    type?: VisualStateV2["background"]["type"];
    params?: Record<string, unknown>;
    layers?: Partial<
      Record<VisualStateV2["background"]["type"], Record<string, unknown>>
    >;
    underlayLiquidParams?: Record<string, unknown>;
  };
  projectm?: Partial<
    Pick<
      VisualStateV2["projectm"],
      "opacity" | "blendMode" | "audioDrivenOpacity" | "energyToOpacityAmount"
    >
  >;
};

export type VisualStateController = {
  applyPatch: (state: VisualStateV2, patch: VisualStatePatch) => VisualStateV2;
  syncBackground: (background: VisualStateV2["background"]) => void;
};

export function createVisualStateController(opts: {
  projectLayer: ProjectMLayer;
  backgroundRegistry: BackgroundRegistry;
  buildCurrentVisualState: (
    globalOverride: VisualStateV2["global"],
    backgroundOverride: VisualStateV2["background"]
  ) => VisualStateV2;
}): VisualStateController {
  const { projectLayer, backgroundRegistry, buildCurrentVisualState } = opts;

  let lastOverlayScale = 1;

  function clamp01(value: unknown, fallback: number) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  }

  function computeOverlayScale(layers: Record<string, any>) {
    const basicEnabled = Boolean(layers?.basic?.enabled);
    const cameraEnabled = Boolean(layers?.camera?.enabled);
    const videoEnabled = Boolean(layers?.video?.enabled);
    const depthEnabled = Boolean(layers?.depth?.enabled);

    const enabledCount =
      (basicEnabled ? 1 : 0) +
      (cameraEnabled ? 1 : 0) +
      (videoEnabled ? 1 : 0) +
      (depthEnabled ? 1 : 0);

    // Only normalize when multiple overlay layers are enabled.
    if (enabledCount <= 1) return 1;

    const basicOpacity = basicEnabled ? clamp01(layers?.basic?.opacity, 1) : 0;
    const cameraOpacity = cameraEnabled
      ? clamp01(layers?.camera?.opacity, 1)
      : 0;
    const videoOpacity = videoEnabled ? clamp01(layers?.video?.opacity, 1) : 0;
    const depthOpacity = depthEnabled ? clamp01(layers?.depth?.opacity, 1) : 0;

    // Depth is additive in the renderer; weight it higher.
    const DEPTH_WEIGHT = 1.4;
    const MAX_ENERGY = 1.15;

    const energy =
      basicOpacity + cameraOpacity + videoOpacity + depthOpacity * DEPTH_WEIGHT;
    if (!Number.isFinite(energy) || energy <= 0.0001) return 1;
    if (energy <= MAX_ENERGY) return 1;
    return Math.max(0.2, Math.min(1, MAX_ENERGY / energy));
  }

  function coerceBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const v = value.trim().toLowerCase();
      if (v === "true") return true;
      if (v === "false") return false;
    }
    return fallback;
  }

  function pickKnownKeys(
    params: Record<string, unknown>,
    defs: readonly { key: string }[]
  ) {
    const out: Record<string, unknown> = {};
    for (const def of defs) {
      if (Object.prototype.hasOwnProperty.call(params, def.key)) {
        out[def.key] = params[def.key];
      }
    }
    return out;
  }

  function applyGlobal(
    state: VisualStateV2,
    patch: NonNullable<VisualStatePatch["global"]>
  ): VisualStateV2 {
    const nextMacros = patch.macros
      ? {
          ...state.global.macros,
          ...patch.macros,
        }
      : state.global.macros;

    return {
      ...state,
      global: {
        ...state.global,
        ...patch,
        macros: nextMacros,
        macroSlots: patch.macroSlots ?? state.global.macroSlots,
      },
    };
  }

  function applyBackgroundParams(
    type: VisualStateV2["background"]["type"],
    patch: Record<string, unknown>
  ): void {
    backgroundRegistry.applyParams(type, patch);
  }

  function filterBackgroundParamsForType(
    type: VisualStateV2["background"]["type"],
    params: Record<string, unknown>
  ) {
    const defs = backgroundRegistry.getParamDefs(type);
    // Back-compat: if no defs exist, don't filter.
    if (!defs.length) return params;
    return pickKnownKeys(params, defs);
  }

  function filterLiquidParams(params: Record<string, unknown>) {
    return filterBackgroundParamsForType("liquid", params);
  }

  function ensureLayers(
    background: VisualStateV2["background"]
  ): NonNullable<VisualStateV2["background"]["layers"]> {
    const existing = (background as any).layers;
    if (existing && typeof existing === "object") {
      return {
        liquid: (existing as any).liquid ?? {},
        basic: (existing as any).basic ?? {},
        camera: (existing as any).camera ?? {},
        video: (existing as any).video ?? {},
        depth: (existing as any).depth ?? {},
      };
    }
    return { liquid: {}, basic: {}, camera: {}, video: {}, depth: {} };
  }

  function applyLayerPatch(
    next: VisualStateV2,
    layer: VisualStateV2["background"]["type"],
    patch: Record<string, unknown>
  ) {
    const filtered = filterBackgroundParamsForType(layer, patch);
    applyBackgroundParams(layer, filtered);

    const layers = ensureLayers(next.background);
    const merged = {
      ...(layers as any)[layer],
      ...filtered,
    };
    const nextLayers = { ...layers, [layer]: merged } as any;

    const focus = next.background.type;
    return {
      ...next,
      background: {
        ...next.background,
        layers: nextLayers,
        // Keep alias in sync when patching the focus layer.
        params: layer === focus ? merged : next.background.params,
      },
    };
  }

  function applyProjectMBlend(
    state: VisualStateV2,
    patch: NonNullable<VisualStatePatch["projectm"]>
  ): void {
    const fallback = {
      opacity: state.projectm.opacity,
      blendMode: state.projectm.blendMode,
      audioDrivenOpacity: state.projectm.audioDrivenOpacity,
      energyToOpacityAmount: state.projectm.energyToOpacityAmount,
    };

    let current = fallback;
    try {
      current = projectLayer.getBlendParams();
    } catch {
      // ignore
    }

    const rawOpacity = patch.opacity;
    const opacity =
      rawOpacity == null
        ? current.opacity
        : Math.min(1, Math.max(0, Number(rawOpacity)));

    const rawAmount = patch.energyToOpacityAmount;
    const energyToOpacityAmount =
      rawAmount == null
        ? current.energyToOpacityAmount
        : Math.min(1, Math.max(0, Number(rawAmount)));

    const blendMode = (patch.blendMode ?? current.blendMode) as BlendMode;

    const rawAudioDrivenOpacity = (
      patch as unknown as { audioDrivenOpacity?: unknown }
    ).audioDrivenOpacity;
    const audioDrivenOpacity = coerceBoolean(
      rawAudioDrivenOpacity,
      current.audioDrivenOpacity
    );

    try {
      projectLayer.setBlendParams({
        opacity,
        blendMode,
        audioDrivenOpacity,
        energyToOpacityAmount,
      });
    } catch {
      // ignore
    }
  }

  function applyPatch(
    state: VisualStateV2,
    patch: VisualStatePatch
  ): VisualStateV2 {
    let next = state;

    if (patch.global) {
      next = applyGlobal(next, patch.global);
    }

    if (patch.background?.type) {
      const nextType = patch.background.type;
      const layers = ensureLayers(next.background);

      const defs = backgroundRegistry.getParamDefs(nextType);
      const defaults = getDefaultsForSchema(defs);
      const existing = (layers as any)[nextType] ?? {};
      // Mixer semantics: changing focus (`background.type`) must NOT implicitly
      // disable other layers. Enabling/disabling is controlled by per-layer `enabled`.
      // We still ensure the focused layer has a complete param object by filling defaults.
      const nextParams = {
        ...defaults,
        ...(existing && typeof existing === "object" ? existing : {}),
      };

      const nextLayers = { ...layers, [nextType]: nextParams } as any;

      next = {
        ...next,
        background: {
          ...next.background,
          type: nextType,
          layers: nextLayers,
          // Keep alias in sync with focus.
          params: nextParams,
        },
      };

      backgroundRegistry.setActive(nextType);
      applyBackgroundParams(
        nextType,
        filterBackgroundParamsForType(nextType, nextParams)
      );
    }

    if (patch.background?.params) {
      next = applyLayerPatch(
        next,
        next.background.type,
        patch.background.params
      );
    }

    if (patch.background?.layers) {
      for (const [layer, layerPatch] of Object.entries(
        patch.background.layers
      )) {
        if (!layerPatch || typeof layerPatch !== "object") continue;
        if (
          layer !== "liquid" &&
          layer !== "basic" &&
          layer !== "camera" &&
          layer !== "video" &&
          layer !== "depth"
        ) {
          continue;
        }
        next = applyLayerPatch(next, layer as any, layerPatch as any);
      }
    }

    if (patch.background?.underlayLiquidParams) {
      // Legacy bridge: treat underlayLiquidParams as a patch to the liquid layer.
      const filtered = filterLiquidParams(
        patch.background.underlayLiquidParams
      );
      next = applyLayerPatch(next, "liquid", filtered);
      next = {
        ...next,
        background: {
          ...next.background,
          underlayLiquidParams: {
            ...(next.background.underlayLiquidParams ?? {}),
            ...filtered,
          },
        },
      };
    }

    if (patch.projectm) {
      applyProjectMBlend(next, patch.projectm);
    }

    // Always rebuild from runtime (layers + preset), but keep updated global/background.
    const snapped = buildCurrentVisualState(next.global, next.background);
    return {
      ...snapped,
      background: {
        ...snapped.background,
        // Preserve state-carried fields (layers, legacy underlay).
        ...next.background,
        type: next.background.type,
        // Ensure alias exists.
        params:
          (next.background.layers as any)?.[next.background.type] ??
          next.background.params ??
          snapped.background.params,
      },
    };
  }

  function syncBackground(background: VisualStateV2["background"]) {
    backgroundRegistry.setActive(background.type);
    const layers = ensureLayers(background);

    // Runtime-only normalization: prevent multi-layer overlays from blowing out.
    // Keep state unchanged; only scale the params we apply into the registry.
    const targetScale = computeOverlayScale(layers as any);
    // Light smoothing to avoid abrupt brightness jumps when toggling layers.
    lastOverlayScale = 0.82 * lastOverlayScale + 0.18 * targetScale;
    const scale = lastOverlayScale;

    for (const type of [
      "liquid",
      "basic",
      "camera",
      "video",
      "depth",
    ] as const) {
      const rawParams = (layers as any)[type];
      if (!rawParams || typeof rawParams !== "object") continue;

      let params: Record<string, unknown> = rawParams as any;
      if (
        (type === "basic" ||
          type === "camera" ||
          type === "video" ||
          type === "depth") &&
        (rawParams as any).enabled
      ) {
        const o = (rawParams as any).opacity;
        if (o != null) {
          params = {
            ...(rawParams as any),
            opacity: clamp01(Number(o) * scale, Number(o)),
          };
        }
      }

      applyBackgroundParams(type, filterBackgroundParamsForType(type, params));
    }
  }

  return { applyPatch, syncBackground };
}
