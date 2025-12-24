import type { LiquidMetalParams } from "../../layers/LiquidMetalLayerV2";
import { createFavoritesPanel } from "../../features/favorites/FavoritesPanel";
import type { FavoriteVisualState } from "../../features/visualState/visualStateStore";
import {
  loadFavoritesFromStorage,
  saveFavoritesToStorage,
} from "../../features/visualState/visualStateStore";

export type FavoritesController = {
  getFavorites: () => FavoriteVisualState[];
  addFavorite: (favorite: FavoriteVisualState) => void;
  showPanel: () => void;
  hidePanel: () => void;
  togglePanel: () => void;
  refreshPanel: () => void;
  refreshCountLabel: () => void;
  dispose: () => void;
};

export function initFavoritesController(opts: {
  container: HTMLElement;
  favoriteCountLabel: HTMLElement | null;
  storage: Storage;
  keys: { v1: string; v2: string };
  liquidDefaults: LiquidMetalParams;
  onLoad: (favorite: FavoriteVisualState) => void;
  countLabelFormatter?: (count: number) => string;
  countLabelTitle?: string;
}): FavoritesController {
  const {
    container,
    favoriteCountLabel,
    storage,
    keys,
    liquidDefaults,
    onLoad,
    countLabelFormatter,
    countLabelTitle,
  } = opts;

  const loadWithMigration = (): FavoriteVisualState[] => {
    let hasV2 = false;
    try {
      hasV2 = storage.getItem(keys.v2) != null;
    } catch {
      // ignore
    }

    const v2 = loadFavoritesFromStorage(storage, keys.v2, liquidDefaults);
    if (hasV2) return v2;

    const v1 = loadFavoritesFromStorage(storage, keys.v1, liquidDefaults);
    if (v1.length) {
      try {
        saveFavoritesToStorage(storage, keys.v2, v1);
      } catch {
        // ignore
      }
    }
    return v1;
  };

  let favorites: FavoriteVisualState[] = loadWithMigration();

  // Keep storage clean: v1 is legacy and should not linger.
  try {
    storage.removeItem(keys.v1);
  } catch {
    // ignore
  }

  const refreshCountLabel = () => {
    if (!favoriteCountLabel) return;
    const fmt =
      countLabelFormatter ??
      ((count: number) => {
        return `Favorites: ${count}`;
      });
    favoriteCountLabel.textContent = fmt(favorites.length);
    if (countLabelTitle) {
      favoriteCountLabel.title = countLabelTitle;
    }
  };

  const persist = () => {
    try {
      saveFavoritesToStorage(storage, keys.v2, favorites);
    } catch {
      // ignore
    }
  };

  const panel = createFavoritesPanel({
    container,
    getFavorites: () => favorites,
    onLoad,
    onDelete: (favoriteId) => {
      favorites = favorites.filter((f) => f.id !== favoriteId);
      persist();
      refreshCountLabel();
      panel.refresh();
    },
  });

  refreshCountLabel();

  return {
    getFavorites: () => favorites,
    addFavorite: (favorite) => {
      favorites = [...favorites, favorite];
      persist();
      refreshCountLabel();
      panel.refresh();
    },
    showPanel: () => panel.show(),
    hidePanel: () => panel.hide(),
    togglePanel: () => panel.toggle(),
    refreshPanel: () => panel.refresh(),
    refreshCountLabel,
    dispose: () => panel.dispose(),
  };
}
