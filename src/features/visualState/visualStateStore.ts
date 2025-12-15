import type { LiquidMetalParams } from '../../layers/LiquidMetalLayerV2';

export type BlendMode = 'normal' | 'add' | 'screen' | 'multiply';

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

export type FavoriteVisualState = {
  id: string;
  createdAt: string;
  label: string | null;
  state: VisualStateV1;
};

export function createDefaultVisualState(liquidMetalDefaults: LiquidMetalParams): VisualStateV1 {
  return {
    version: 1,
    global: { seed: 0 },
    projectm: {
      presetId: null,
      presetUrl: null,
      opacity: 0.8,
      blendMode: 'add',
      audioDrivenOpacity: true,
      energyToOpacityAmount: 0.3
    },
    liquidMetal: { ...liquidMetalDefaults }
  };
}

export function cloneVisualState(state: VisualStateV1): VisualStateV1 {
  return {
    version: 1,
    global: state.global ? { ...state.global } : undefined,
    projectm: { ...state.projectm },
    liquidMetal: { ...state.liquidMetal }
  };
}

export function migrateFavorite(raw: any, liquidMetalDefaults: LiquidMetalParams): FavoriteVisualState | null {
  if (raw && raw.state && raw.state.projectm && raw.state.liquidMetal) {
    const fav = raw as FavoriteVisualState;
    if (!fav.state.global) {
      fav.state.global = { seed: 0 };
    }
    return fav;
  }

  if (raw && ('presetId' in raw || 'presetUrl' in raw)) {
    const state: VisualStateV1 = {
      version: 1,
      global: { seed: 0 },
      projectm: {
        presetId: raw.presetId ?? null,
        presetUrl: raw.presetUrl ?? null,
        opacity: raw.projectOpacity ?? 0.8,
        blendMode: 'add',
        audioDrivenOpacity: true,
        energyToOpacityAmount: 0.3
      },
      liquidMetal: {
        ...liquidMetalDefaults,
        ...(raw.liquidParams ?? {})
      }
    };

    return {
      id: raw.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: raw.createdAt ?? new Date().toISOString(),
      label: raw.presetLabel ?? raw.presetUrl ?? 'legacy',
      state
    };
  }

  return null;
}

export function loadFavoritesFromStorage(
  storage: Pick<Storage, 'getItem'>,
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
  storage: Pick<Storage, 'setItem'>,
  key: string,
  favorites: FavoriteVisualState[]
) {
  try {
    storage.setItem(key, JSON.stringify(favorites));
  } catch {
    // Non-fatal if storage is unavailable
  }
}
