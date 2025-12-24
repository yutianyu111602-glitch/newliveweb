import { bindButton, type DomBinding } from "../bindings/domBindings";

export function initToolbarCollapsedController(opts: {
  toolbar: HTMLElement | null;
  toolbarBody: HTMLElement | null;
  toolbarToggleButton: HTMLButtonElement | null;
  storage: Storage;
  storageKey?: string;
}) {
  const {
    toolbar,
    toolbarBody,
    toolbarToggleButton,
    storage,
    storageKey = "newliveweb:ui:toolbarCollapsed",
  } = opts;

  if (!toolbarBody || !toolbarToggleButton) return;

  let collapsed = false;
  let toggleBinding: DomBinding | null = null;

  const setCollapsed = (next: boolean) => {
    collapsed = Boolean(next);
    toolbarBody.style.display = collapsed ? "none" : "block";
    toolbarToggleButton.textContent = collapsed ? "展开" : "收起";
    toolbar?.classList.toggle("toolbar--collapsed", collapsed);
    try {
      storage.setItem(storageKey, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  };

  try {
    const saved = storage.getItem(storageKey);
    if (saved === "1") setCollapsed(true);
  } catch {
    // ignore
  }

  toggleBinding = bindButton(toolbarToggleButton, () => {
    setCollapsed(!collapsed);
  });

  // Expose minimal API (optional; kept for future expansion).
  return {
    setCollapsed,
    getCollapsed: () => collapsed,
    dispose: () => {
      toggleBinding?.dispose();
      toggleBinding = null;
    },
  };
}
