import type { LiquidMetalLayerV2 } from "../layers/LiquidMetalLayerV2";
import type { BasicBackgroundLayer } from "../layers/BasicBackgroundLayer";
import type { CameraLayer } from "../layers/CameraLayer";
import type { DepthLayer } from "../layers/DepthLayer";
import type { VideoLayer } from "../layers/VideoLayer";
import type { VisualStateV2 } from "../features/visualState/visualStateStore";
import type { ParamDef } from "../state/paramSchema";

export type BackgroundType = VisualStateV2["background"]["type"];
export type BackgroundParams = Record<string, unknown>;

export type BackgroundModule = {
  type: BackgroundType;
  paramDefs: readonly ParamDef[];
  setEnabled: (enabled: boolean) => void;
  applyParams: (params: BackgroundParams) => void;
};

export type BackgroundRegistry = {
  setActive: (type: BackgroundType) => void;
  getActiveType: () => BackgroundType;
  applyParams: (type: BackgroundType, params: BackgroundParams) => void;
  getParamDefs: (type: BackgroundType) => readonly ParamDef[];
  getActiveParamDefs: () => readonly ParamDef[];
};

export function createBackgroundRegistry(opts: {
  basicLayer?: BasicBackgroundLayer | null;
  liquidLayer: LiquidMetalLayerV2;
  cameraLayer?: CameraLayer | null;
  depthLayer?: DepthLayer | null;
  videoLayer?: VideoLayer | null;
  paramDefs?: Partial<Record<BackgroundType, readonly ParamDef[]>>;
}): BackgroundRegistry {
  const {
    basicLayer,
    liquidLayer,
    cameraLayer,
    depthLayer,
    videoLayer,
    paramDefs,
  } = opts;

  const basicModule: BackgroundModule = {
    type: "basic",
    paramDefs: paramDefs?.basic ?? [],
    setEnabled: (enabled) => (basicLayer as any)?.setEnabled?.(enabled),
    applyParams: (params) => {
      (basicLayer as any)?.applyParams?.(params);
    },
  };

  const liquidModule: BackgroundModule = {
    type: "liquid",
    paramDefs: paramDefs?.liquid ?? [],
    setEnabled: (enabled) => liquidLayer.setEnabled?.(enabled),
    applyParams: (params) => {
      liquidLayer.params = {
        ...liquidLayer.params,
        ...(params as any),
      };
      liquidLayer.updateParams();
    },
  };

  const cameraModule: BackgroundModule = {
    type: "camera",
    paramDefs: paramDefs?.camera ?? [],
    setEnabled: (enabled) => cameraLayer?.setEnabled?.(enabled),
    applyParams: (params) => {
      (cameraLayer as any)?.applyParams?.(params);
    },
  };

  const videoModule: BackgroundModule = {
    type: "video",
    paramDefs: paramDefs?.video ?? [],
    setEnabled: (enabled) => videoLayer?.setEnabled?.(enabled),
    applyParams: (params) => {
      (videoLayer as any)?.applyParams?.(params);
    },
  };

  const depthModule: BackgroundModule = {
    type: "depth",
    paramDefs: paramDefs?.depth ?? [],
    setEnabled: (enabled) => depthLayer?.setEnabled?.(enabled),
    applyParams: (params) => {
      (depthLayer as any)?.applyParams?.(params);
    },
  };

  let activeType: BackgroundType = "liquid";

  function getModule(type: BackgroundType): BackgroundModule {
    if (type === "basic") return basicModule;
    if (type === "camera") return cameraModule;
    if (type === "depth") return depthModule;
    if (type === "video") return videoModule;
    return liquidModule;
  }

  function setActive(type: BackgroundType) {
    activeType = type;
    // Multi-layer mixer: do NOT auto-toggle other layers here.
    // Each layer's visibility is driven by its own `enabled` param via applyParams().
  }

  function applyParams(type: BackgroundType, params: BackgroundParams) {
    const defs = getParamDefs(type);
    const rawParams = params && typeof params === "object" ? params : {};

    // Back-compat: if no schema provided, allow all keys through.
    if (!defs.length) {
      getModule(type).applyParams(rawParams);
      return;
    }

    const allowed = new Set(defs.map((d) => d.key));
    const filtered: BackgroundParams = {};
    for (const [key, value] of Object.entries(rawParams)) {
      if (allowed.has(key)) filtered[key] = value;
    }

    // Layer toggles: if schema includes `enabled`, treat it as a module enable flag.
    if (Object.prototype.hasOwnProperty.call(filtered, "enabled")) {
      const enabled = (filtered as any).enabled;
      if (typeof enabled === "boolean") {
        getModule(type).setEnabled(enabled);
      }
      delete (filtered as any).enabled;
    }
    getModule(type).applyParams(filtered);
  }

  function getParamDefs(type: BackgroundType) {
    return getModule(type).paramDefs;
  }

  // Keep focus type initialized.
  setActive(activeType);

  return {
    setActive,
    getActiveType: () => activeType,
    applyParams,
    getParamDefs,
    getActiveParamDefs: () => getParamDefs(activeType),
  };
}
