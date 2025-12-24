import type { LiquidMetalParams } from "../../layers/LiquidMetalLayerV2";
import { isRecord } from "../../lib/guards";

export type BlendMode =
  | "normal"
  | "add"
  | "screen"
  | "multiply"
  | "overlay"
  | "difference"
  | "exclusion"
  | "color-dodge";

export type BlendParamsSnapshot = {
  opacity: number;
  blendMode: BlendMode;
  audioDrivenOpacity: boolean;
  energyToOpacityAmount: number;
};

export type VisualStateV1 = {
  version: 1;
  global?: {
    seed: number;
  };
  projectm: {
    presetId: string | null;
    presetUrl: string | null;
  } & BlendParamsSnapshot;
  liquidMetal: LiquidMetalParams;
};

export type MacroId = "fusion" | "motion" | "sparkle";

export type MacroSlot = {
  id: string;
  label: string;
  value: number; // 0..1
  randomize: boolean;
  pinned?: boolean;
};

export type VisualStateV2 = {
  version: 2;
  global: {
    seed: number;
    macros: Record<MacroId, number>;
    macroSlots: MacroSlot[];
  };
  background: {
    type: "liquid" | "camera" | "video" | "basic" | "depth";
    // Back-compat: params for the current focus type.
    params: Record<string, unknown>;
    // Multi-layer mixer: per-layer params.
    layers?: {
      liquid: Record<string, unknown>;
      basic: Record<string, unknown>;
      camera: Record<string, unknown>;
      video: Record<string, unknown>;
      depth: Record<string, unknown>;
    };
    // Legacy (pre-mixer) underlay field; migrated into layers.liquid.
    underlayLiquidParams?: Record<string, unknown>;
  };
  projectm: {
    presetId: string | null;
    presetUrl: string | null;
  } & BlendParamsSnapshot;
};

function defaultBackgroundLayers(liquidMetalDefaults: LiquidMetalParams) {
  return {
    liquid: { ...liquidMetalDefaults, enabled: false, opacity: 0.7 },
    basic: { enabled: false, speed: 0.2, opacity: 1 },
    camera: { enabled: false, deviceId: "", opacity: 1 },
    video: {
      enabled: false,
      src: "",
      opacity: 1,
      loop: true,
      muted: true,
      fitMode: "cover",
      playbackRate: 1,
    },
    depth: { enabled: false, opacity: 1 },
  } as const;
}

export type VisualState = VisualStateV1 | VisualStateV2;

export type FavoriteVisualState = {
  id: string;
  createdAt: string;
  label: string | null;
  state: VisualStateV2;
};

export function createDefaultVisualState(
  liquidMetalDefaults: LiquidMetalParams
): VisualStateV2 {
  const layers = defaultBackgroundLayers(liquidMetalDefaults);
  return {
    version: 2,
    global: {
      seed: 0,
      macros: { fusion: 0.5, motion: 0.5, sparkle: 0.5 },
      macroSlots: [],
    },
    background: {
      type: "liquid",
      params: { ...layers.liquid },
      layers: {
        liquid: { ...layers.liquid },
        basic: { ...layers.basic },
        camera: { ...layers.camera },
        video: { ...layers.video },
        depth: { ...layers.depth },
      },
    },
    projectm: {
      presetId: null,
      presetUrl: null,
      opacity: 0.7,
      blendMode: "normal",
      audioDrivenOpacity: true,
      energyToOpacityAmount: 0.25,
    },
  };
}

export function cloneVisualState(state: VisualStateV2): VisualStateV2 {
  return {
    version: 2,
    global: {
      seed: state.global.seed,
      macros: { ...state.global.macros },
      macroSlots: state.global.macroSlots.map((s) => ({ ...s })),
    },
    background: {
      type: state.background.type,
      params: { ...(state.background.params ?? {}) },
      layers: state.background.layers
        ? {
            liquid: { ...(state.background.layers.liquid ?? {}) },
            basic: { ...(state.background.layers.basic ?? {}) },
            camera: { ...(state.background.layers.camera ?? {}) },
            video: { ...(state.background.layers.video ?? {}) },
            depth: { ...(state.background.layers.depth ?? {}) },
          }
        : undefined,
      underlayLiquidParams: state.background.underlayLiquidParams
        ? { ...(state.background.underlayLiquidParams as any) }
        : undefined,
    },
    projectm: { ...state.projectm },
  };
}

export function migrateVisualStateToV2(
  raw: any,
  liquidMetalDefaults: LiquidMetalParams
): VisualStateV2 | null {
  if (!raw || typeof raw !== "object") return null;

  if (raw.version === 2 && raw.global && raw.projectm && raw.background) {
    const macros = raw.global.macros ?? {
      fusion: 0.5,
      motion: 0.5,
      sparkle: 0.5,
    };
    const macroSlots = Array.isArray(raw.global.macroSlots)
      ? raw.global.macroSlots
      : [];
    if (!("seed" in raw.global)) {
      raw.global.seed = 0;
    }
    const rawType = raw.background?.type;
    const type: "liquid" | "camera" | "video" | "basic" | "depth" =
      rawType === "camera" ||
      rawType === "video" ||
      rawType === "basic" ||
      rawType === "depth"
        ? rawType
        : "liquid";
    const rawParams =
      raw.background?.params && typeof raw.background.params === "object"
        ? raw.background.params
        : {};

    const rawUnderlay =
      raw.background?.underlayLiquidParams &&
      typeof raw.background.underlayLiquidParams === "object"
        ? raw.background.underlayLiquidParams
        : null;

    const baseLayers = defaultBackgroundLayers(liquidMetalDefaults);
    const incomingLayers =
      raw.background?.layers && typeof raw.background.layers === "object"
        ? raw.background.layers
        : null;

    const layers = {
      liquid: {
        ...baseLayers.liquid,
        ...(incomingLayers && typeof incomingLayers.liquid === "object"
          ? (incomingLayers.liquid as any)
          : null),
      } as any,
      basic: {
        ...baseLayers.basic,
        ...(incomingLayers && typeof incomingLayers.basic === "object"
          ? (incomingLayers.basic as any)
          : null),
      } as any,
      camera: {
        ...baseLayers.camera,
        ...(incomingLayers && typeof incomingLayers.camera === "object"
          ? (incomingLayers.camera as any)
          : null),
      } as any,
      video: {
        ...baseLayers.video,
        ...(incomingLayers && typeof incomingLayers.video === "object"
          ? (incomingLayers.video as any)
          : null),
      } as any,
      depth: {
        ...baseLayers.depth,
        ...(incomingLayers && typeof incomingLayers.depth === "object"
          ? (incomingLayers.depth as any)
          : null),
      } as any,
    };

    // Migrate legacy underlay into liquid layer params.
    if (rawUnderlay) {
      layers.liquid = {
        ...layers.liquid,
        ...liquidMetalDefaults,
        ...(rawUnderlay as any),
      } as any;
    }

    // Back-compat: if no layers were stored, seed the focus layer from background.params.
    if (!incomingLayers) {
      const focus = type;
      const focusParams = isRecord(raw.background?.params)
        ? raw.background.params
        : {};
      (layers as any)[focus] = {
        ...(layers as any)[focus],
        ...focusParams,
      };
    }

    const focusParams = (layers as any)[type] ?? rawParams;
    return {
      version: 2,
      global: {
        seed: Number(raw.global.seed) || 0,
        macros: {
          fusion: Number(macros.fusion ?? 0.5),
          motion: Number(macros.motion ?? 0.5),
          sparkle: Number(macros.sparkle ?? 0.5),
        },
        macroSlots: macroSlots
          .filter((s: any) => s && typeof s === "object")
          .map((s: any) => ({
            id: String(
              s.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            ),
            label: String(s.label ?? "Macro"),
            value: Number(s.value ?? 0.5),
            randomize: Boolean(s.randomize ?? true),
            pinned: s.pinned ? Boolean(s.pinned) : undefined,
          })),
      },
      background: {
        type,
        params:
          type === "liquid"
            ? {
                ...liquidMetalDefaults,
                ...(isRecord(focusParams) ? focusParams : {}),
              }
            : { ...(isRecord(focusParams) ? focusParams : {}) },
        layers: {
          liquid: { ...(layers.liquid as any) },
          basic: { ...(layers.basic as any) },
          camera: { ...(layers.camera as any) },
          video: { ...(layers.video as any) },
          depth: { ...(layers.depth as any) },
        },
      },
      projectm: { ...raw.projectm },
    };
  }

  if (raw.version === 1 && raw.projectm && raw.liquidMetal) {
    const seed = Number(raw.global?.seed ?? 0) || 0;
    return {
      version: 2,
      global: {
        seed,
        macros: { fusion: 0.5, motion: 0.5, sparkle: 0.5 },
        macroSlots: [],
      },
      background: {
        type: "liquid",
        params: { ...liquidMetalDefaults, ...(raw.liquidMetal ?? {}) },
      },
      projectm: { ...raw.projectm },
    };
  }

  return null;
}

export function migrateFavorite(
  raw: any,
  liquidMetalDefaults: LiquidMetalParams
): FavoriteVisualState | null {
  if (raw && raw.state) {
    const state = migrateVisualStateToV2(raw.state, liquidMetalDefaults);
    if (!state) return null;
    return {
      id: String(
        raw.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      ),
      createdAt: String(raw.createdAt ?? new Date().toISOString()),
      label: raw.label != null ? String(raw.label) : null,
      state,
    };
  }

  if (raw && ("presetId" in raw || "presetUrl" in raw)) {
    const liquidParams = isRecord(raw.liquidParams) ? raw.liquidParams : {};
    const state: VisualStateV2 = {
      version: 2,
      global: {
        seed: 0,
        macros: { fusion: 0.5, motion: 0.5, sparkle: 0.5 },
        macroSlots: [],
      },
      background: {
        type: "liquid",
        params: { ...liquidMetalDefaults, ...liquidParams },
      },
      projectm: {
        presetId: raw.presetId ?? null,
        presetUrl: raw.presetUrl ?? null,
        opacity: raw.projectOpacity ?? 0.8,
        blendMode: "add",
        audioDrivenOpacity: true,
        energyToOpacityAmount: 0.3,
      },
    };

    return {
      id: String(
        raw.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      ),
      createdAt: String(raw.createdAt ?? new Date().toISOString()),
      label:
        raw.presetLabel != null
          ? String(raw.presetLabel)
          : raw.presetUrl != null
          ? String(raw.presetUrl)
          : "legacy",
      state,
    };
  }

  return null;
}

export function loadFavoritesFromStorage(
  storage: Pick<Storage, "getItem">,
  key: string,
  liquidMetalDefaults: LiquidMetalParams
): FavoriteVisualState[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as any[];
    if (!Array.isArray(parsed)) return [];

    const migrated: FavoriteVisualState[] = [];
    for (const item of parsed) {
      const fav = migrateFavorite(item, liquidMetalDefaults);
      if (fav) migrated.push(fav);
    }
    return migrated;
  } catch {
    return [];
  }
}

export function saveFavoritesToStorage(
  storage: Pick<Storage, "setItem">,
  key: string,
  favorites: FavoriteVisualState[]
) {
  try {
    storage.setItem(key, JSON.stringify(favorites));
  } catch {
    // Non-fatal if storage is unavailable
  }
}
