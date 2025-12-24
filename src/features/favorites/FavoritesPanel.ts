import type { FavoriteVisualState } from "../visualState/visualStateStore";
import {
  bindButton,
  bindCheckbox,
  type DomBinding,
} from "../../app/bindings/domBindings";

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

export function createFavoritesPanel(
  options: FavoritesPanelOptions
): FavoritesPanelHandle {
  const { container, getFavorites, onLoad, onDelete } = options;

  let panel: HTMLDivElement | null = null;
  let selectedFavoriteId: string | null = null;
  let compareMode = false;
  const compareSelectedIds = new Set<string>();

  let panelBindings: DomBinding[] = [];
  let listBindings: DomBinding[] = [];

  const disposeBindings = (bindings: DomBinding[]) => {
    for (const b of bindings) {
      try {
        b.dispose();
      } catch {
        // ignore
      }
    }
    bindings.length = 0;
  };

  const toDisplayString = (value: unknown): string => {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return String(value);
      // Keep numbers stable but not overly verbose.
      const rounded = Math.round(value * 100000) / 100000;
      return String(rounded);
    }
    if (typeof value === "boolean") return value ? "true" : "false";
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const flattenObject = (
    input: unknown,
    out: Record<string, string>,
    prefix = ""
  ) => {
    if (input == null) {
      if (prefix) out[prefix] = "";
      return;
    }
    if (
      typeof input === "string" ||
      typeof input === "number" ||
      typeof input === "boolean"
    ) {
      if (prefix) out[prefix] = toDisplayString(input);
      return;
    }
    if (Array.isArray(input)) {
      if (prefix) out[prefix] = toDisplayString(input);
      return;
    }
    if (typeof input !== "object") {
      if (prefix) out[prefix] = toDisplayString(input);
      return;
    }

    const obj = input as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenObject(value, out, nextPrefix);
    }
  };

  const escapeCsvCell = (value: string): string => {
    const v = String(value ?? "");
    // Quote if needed (comma, quote, newline, leading/trailing spaces).
    if (!/[",\n\r]/.test(v) && v.trim() === v) return v;
    return `"${v.replace(/"/g, '""')}"`;
  };

  const downloadTextFile = (filename: string, content: string) => {
    try {
      const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const ensurePanel = () => {
    if (panel) return panel;

    const root = document.createElement("div");
    root.id = "favorites-panel";
    root.className = "nw-panel nw-panel--favorites";

    const titleRow = document.createElement("div");
    titleRow.className = "nw-panel__header";
    const title = document.createElement("span");
    title.textContent = "收藏夹";
    title.className = "nw-panel__title";

    const headerActions = document.createElement("div");
    headerActions.className = "nw-panel__header-actions";

    const randomBtn = document.createElement("button");
    randomBtn.textContent = "随机载入";
    randomBtn.className = "nw-panel__action";
    randomBtn.title = "从收藏夹随机加载一个配置";
    panelBindings.push(
      bindButton(randomBtn, () => {
        const favs = getFavorites();
        if (!favs.length) return;
        const fav = favs[Math.floor(Math.random() * favs.length)];
        selectedFavoriteId = null;
        compareMode = false;
        onLoad(fav);
      })
    );

    const compareBtn = document.createElement("button");
    compareBtn.textContent = "对比";
    compareBtn.className = "nw-panel__action";
    compareBtn.title = "选择多个收藏后横向对比参数";
    panelBindings.push(
      bindButton(compareBtn, () => {
        selectedFavoriteId = null;
        compareMode = true;
        refresh();
      })
    );

    const clearCompareBtn = document.createElement("button");
    clearCompareBtn.textContent = "清除";
    clearCompareBtn.className = "nw-panel__action";
    clearCompareBtn.title = "清空对比选择";
    panelBindings.push(
      bindButton(clearCompareBtn, () => {
        compareSelectedIds.clear();
        compareMode = false;
        selectedFavoriteId = null;
        refresh();
      })
    );
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.className = "nw-panel__close";
    panelBindings.push(
      bindButton(closeBtn, () => {
        root.style.display = "none";
      })
    );
    titleRow.appendChild(title);

    headerActions.appendChild(randomBtn);
    headerActions.appendChild(compareBtn);
    headerActions.appendChild(clearCompareBtn);
    headerActions.appendChild(closeBtn);
    titleRow.appendChild(headerActions);
    root.appendChild(titleRow);

    const list = document.createElement("div");
    list.id = "favorites-list";
    root.appendChild(list);

    container.appendChild(root);
    panel = root;

    return root;
  };

  const refresh = () => {
    const root = ensurePanel();
    const list = root.querySelector<HTMLDivElement>("#favorites-list");
    if (!list) return;

    disposeBindings(listBindings);
    list.innerHTML = "";

    const favorites = getFavorites();
    if (!favorites.length) {
      selectedFavoriteId = null;
      const empty = document.createElement("div");
      empty.textContent = "No favorites yet. Use 'Favorite' to save.";
      empty.className = "nw-fav-empty";
      list.appendChild(empty);
      return;
    }

    const sorted = favorites
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    // Compare view: union of keys (flattened) across selected favorites.
    if (compareMode) {
      const selected = sorted.filter((x) => compareSelectedIds.has(x.id));

      const header = document.createElement("div");
      header.className = "nw-fav-compare__header";

      const backBtn = document.createElement("button");
      backBtn.textContent = "← 返回";
      backBtn.className = "nw-btn nw-btn--secondary";
      listBindings.push(
        bindButton(backBtn, () => {
          compareMode = false;
          refresh();
        })
      );

      const meta = document.createElement("div");
      meta.className = "nw-fav-compare__meta";
      meta.textContent = `已选 ${selected.length} 个收藏`;

      const actions = document.createElement("div");
      actions.className = "nw-fav-compare__actions";

      const exportBtn = document.createElement("button");
      exportBtn.textContent = "导出 CSV";
      exportBtn.className = "nw-btn nw-btn--secondary";
      exportBtn.title = "下载当前对比表为 CSV";
      exportBtn.disabled = selected.length < 2;

      header.appendChild(backBtn);
      actions.appendChild(meta);
      actions.appendChild(exportBtn);
      header.appendChild(actions);
      list.appendChild(header);

      if (selected.length < 2) {
        const hint = document.createElement("div");
        hint.className = "nw-fav-empty";
        hint.textContent = "请先在列表里勾选至少 2 个收藏，再点“对比”。";
        list.appendChild(hint);
        return;
      }

      const perFavFlat: Array<{
        fav: FavoriteVisualState;
        flat: Record<string, string>;
      }> = selected.map((fav) => {
        const flat: Record<string, string> = {};
        flat["favorite.id"] = fav.id;
        flat["favorite.createdAt"] = fav.createdAt;
        flat["favorite.label"] = fav.label ?? "";
        flattenObject(fav.state, flat, "state");
        return { fav, flat };
      });

      const keySet = new Set<string>();
      for (const item of perFavFlat) {
        for (const k of Object.keys(item.flat)) keySet.add(k);
      }
      const keys = Array.from(keySet).sort((a, b) => a.localeCompare(b));

      listBindings.push(
        bindButton(exportBtn, () => {
          // Header row: key + each favorite label.
          const headerCells = [
            "key",
            ...perFavFlat.map((x) => x.fav.label ?? "[no preset]"),
          ];

          const lines: string[] = [];
          lines.push(headerCells.map(escapeCsvCell).join(","));
          for (const key of keys) {
            const row = [key, ...perFavFlat.map((x) => x.flat[key] ?? "")];
            lines.push(row.map(escapeCsvCell).join(","));
          }

          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, "0");
          const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
            now.getDate()
          )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(
            now.getSeconds()
          )}`;
          downloadTextFile(`favorites-compare-${stamp}.csv`, lines.join("\n"));
        })
      );

      const tableWrap = document.createElement("div");
      tableWrap.className = "nw-fav-compare__tablewrap";
      const table = document.createElement("table");
      table.className = "nw-fav-compare__table";

      const thead = document.createElement("thead");
      const headTr = document.createElement("tr");

      const thKey = document.createElement("th");
      thKey.className = "nw-fav-compare__th nw-fav-compare__th--key";
      thKey.textContent = "key";
      headTr.appendChild(thKey);

      for (const item of perFavFlat) {
        const th = document.createElement("th");
        th.className = "nw-fav-compare__th";
        const label = item.fav.label ?? "[no preset]";
        th.textContent = label;
        th.title = `${label}\n${new Date(item.fav.createdAt).toLocaleString()}`;
        headTr.appendChild(th);
      }

      thead.appendChild(headTr);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      for (const key of keys) {
        const tr = document.createElement("tr");
        const tdKey = document.createElement("td");
        tdKey.className = "nw-fav-compare__key";
        tdKey.textContent = key;
        tr.appendChild(tdKey);

        for (const item of perFavFlat) {
          const td = document.createElement("td");
          td.className = "nw-fav-compare__val";
          td.textContent = item.flat[key] ?? "";
          tr.appendChild(td);
        }

        tbody.appendChild(tr);
      }
      table.appendChild(tbody);

      tableWrap.appendChild(table);
      list.appendChild(tableWrap);
      return;
    }

    if (selectedFavoriteId) {
      const fav = sorted.find((x) => x.id === selectedFavoriteId) ?? null;
      if (!fav) {
        selectedFavoriteId = null;
      } else {
        const header = document.createElement("div");
        header.className = "nw-fav-params__header";

        const backBtn = document.createElement("button");
        backBtn.textContent = "← 返回";
        backBtn.className = "nw-btn nw-btn--secondary";
        listBindings.push(
          bindButton(backBtn, () => {
            selectedFavoriteId = null;
            refresh();
          })
        );

        const titleRow = document.createElement("div");
        titleRow.className = "nw-fav-params__meta";
        const label = document.createElement("div");
        label.className = "nw-fav-params__label";
        label.textContent = fav.label ?? "[no preset]";
        const ts = document.createElement("div");
        ts.className = "nw-fav-params__time";
        ts.textContent = new Date(fav.createdAt).toLocaleString();
        titleRow.appendChild(label);
        titleRow.appendChild(ts);

        const actions = document.createElement("div");
        actions.className = "nw-fav-params__actions";
        const loadBtn = document.createElement("button");
        loadBtn.textContent = "Load";
        loadBtn.className = "nw-btn nw-btn--primary";
        listBindings.push(bindButton(loadBtn, () => onLoad(fav)));
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "删除";
        deleteBtn.className = "nw-btn nw-btn--danger";
        listBindings.push(bindButton(deleteBtn, () => onDelete(fav.id)));
        actions.appendChild(loadBtn);
        actions.appendChild(deleteBtn);

        header.appendChild(backBtn);
        header.appendChild(actions);

        const flat: Record<string, string> = {};
        // Include meta for clarity.
        flat["favorite.id"] = fav.id;
        flat["favorite.createdAt"] = fav.createdAt;
        flat["favorite.label"] = fav.label ?? "";
        flattenObject(fav.state, flat, "state");

        const keys = Object.keys(flat).sort((a, b) => a.localeCompare(b));

        const tableWrap = document.createElement("div");
        tableWrap.className = "nw-fav-params__tablewrap";
        const table = document.createElement("table");
        table.className = "nw-fav-params__table";

        for (const key of keys) {
          const tr = document.createElement("tr");
          const tdKey = document.createElement("td");
          tdKey.className = "nw-fav-params__key";
          tdKey.textContent = key;
          const tdVal = document.createElement("td");
          tdVal.className = "nw-fav-params__val";
          tdVal.textContent = flat[key] ?? "";
          tr.appendChild(tdKey);
          tr.appendChild(tdVal);
          table.appendChild(tr);
        }

        tableWrap.appendChild(table);
        list.appendChild(titleRow);
        list.appendChild(header);
        list.appendChild(tableWrap);
        return;
      }
    }

    sorted.forEach((fav) => {
      const item = document.createElement("div");
      item.className = "nw-fav-item";

      const titleRow = document.createElement("div");
      titleRow.className = "nw-fav-item__meta";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "nw-fav-item__check";
      check.title = "加入对比";
      const checkBinding = bindCheckbox({
        el: check,
        get: () => compareSelectedIds.has(fav.id),
        set: (checked) => {
          if (checked) compareSelectedIds.add(fav.id);
          else compareSelectedIds.delete(fav.id);
        },
      });
      checkBinding.sync();
      listBindings.push(checkBinding);

      const label = document.createElement("span");
      label.textContent = fav.label ?? "[no preset]";
      label.className = "nw-fav-item__label";
      const ts = document.createElement("span");
      ts.textContent = new Date(fav.createdAt).toLocaleTimeString();
      ts.className = "nw-fav-item__time";

      titleRow.appendChild(check);
      titleRow.appendChild(label);
      titleRow.appendChild(ts);
      item.appendChild(titleRow);

      const actions = document.createElement("div");
      actions.className = "nw-fav-item__actions";
      const loadBtn = document.createElement("button");
      loadBtn.textContent = "Load";
      loadBtn.className = "nw-btn nw-btn--primary";
      listBindings.push(
        bindButton(loadBtn, () => {
          onLoad(fav);
        })
      );
      const paramsBtn = document.createElement("button");
      paramsBtn.textContent = "参数";
      paramsBtn.className = "nw-btn nw-btn--secondary";
      listBindings.push(
        bindButton(paramsBtn, () => {
          selectedFavoriteId = fav.id;
          compareMode = false;
          refresh();
        })
      );
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "删除";
      deleteBtn.className = "nw-btn nw-btn--danger";
      listBindings.push(
        bindButton(deleteBtn, () => {
          onDelete(fav.id);
        })
      );
      actions.appendChild(loadBtn);
      actions.appendChild(paramsBtn);
      actions.appendChild(deleteBtn);
      item.appendChild(actions);

      list.appendChild(item);
    });
  };

  const show = () => {
    const root = ensurePanel();
    refresh();
    root.style.display = "block";
  };

  const hide = () => {
    const root = ensurePanel();
    root.style.display = "none";
  };

  const toggle = () => {
    const root = ensurePanel();
    if (root.style.display === "none" || !root.style.display) {
      show();
    } else {
      hide();
    }
  };

  const dispose = () => {
    if (!panel) return;
    disposeBindings(listBindings);
    disposeBindings(panelBindings);
    panel.remove();
    panel = null;
  };

  return { refresh, show, hide, toggle, dispose };
}
