import type { FavoriteVisualState } from '../visualState/visualStateStore';

export type FavoritesPanelOptions = {
  container: HTMLElement;
  getFavorites: () => FavoriteVisualState[];
  onLoad: (favorite: FavoriteVisualState) => void;
  onDelete: (favoriteId: string) => void;
};

export type FavoritesPanelHandle = {
  refresh: () => void;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  dispose: () => void;
};

export function createFavoritesPanel(options: FavoritesPanelOptions): FavoritesPanelHandle {
  const { container, getFavorites, onLoad, onDelete } = options;

  let panel: HTMLDivElement | null = null;

  const ensurePanel = () => {
    if (panel) return panel;

    const root = document.createElement('div');
    root.id = 'favorites-panel';
    root.style.cssText = `
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
      root.style.display = 'none';
    });
    titleRow.appendChild(title);
    titleRow.appendChild(closeBtn);
    root.appendChild(titleRow);

    const list = document.createElement('div');
    list.id = 'favorites-list';
    root.appendChild(list);

    container.appendChild(root);
    panel = root;

    return root;
  };

  const refresh = () => {
    const root = ensurePanel();
    const list = root.querySelector<HTMLDivElement>('#favorites-list');
    if (!list) return;

    list.innerHTML = '';

    const favorites = getFavorites();
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
        item.style.cssText =
          'padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;gap:4px;';

        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display:flex;justify-content:space-between;gap:8px;';
        const label = document.createElement('span');
        label.textContent = fav.label ?? '[no preset]';
        label.style.cssText =
          'color:#e5e7eb;max-width:180px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;';
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
        loadBtn.style.cssText =
          'flex:0 0 auto;padding:2px 6px;font-size:11px;border-radius:4px;border:1px solid rgba(96,165,250,0.6);background:rgba(59,130,246,0.12);color:#bfdbfe;cursor:pointer;';
        loadBtn.addEventListener('click', () => {
          onLoad(fav);
        });
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '删除';
        deleteBtn.style.cssText =
          'flex:0 0 auto;padding:2px 6px;font-size:11px;border-radius:4px;border:1px solid rgba(248,113,113,0.6);background:rgba(248,113,113,0.08);color:#fecaca;cursor:pointer;';
        deleteBtn.addEventListener('click', () => {
          onDelete(fav.id);
        });
        actions.appendChild(loadBtn);
        actions.appendChild(deleteBtn);
        item.appendChild(actions);

        list.appendChild(item);
      });
  };

  const show = () => {
    const root = ensurePanel();
    refresh();
    root.style.display = 'block';
  };

  const hide = () => {
    const root = ensurePanel();
    root.style.display = 'none';
  };

  const toggle = () => {
    const root = ensurePanel();
    if (root.style.display === 'none' || !root.style.display) {
      show();
    } else {
      hide();
    }
  };

  const dispose = () => {
    if (!panel) return;
    panel.remove();
    panel = null;
  };

  return { refresh, show, hide, toggle, dispose };
}
