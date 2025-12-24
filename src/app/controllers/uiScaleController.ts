import { bindButton, type DomBinding } from "../bindings/domBindings";

export function initUiScaleController(opts: {
  zoomOutButton: HTMLButtonElement | null;
  zoomResetButton: HTMLButtonElement | null;
  zoomInButton: HTMLButtonElement | null;
  label: HTMLElement | null;
  root: HTMLElement;
  storage: Storage;
  storageKey?: string;
  cssVarName?: string;
}) {
  const {
    zoomOutButton,
    zoomResetButton,
    zoomInButton,
    label,
    root,
    storage,
    storageKey = "newliveweb:ui:scale",
    cssVarName = "--nw-ui-scale",
  } = opts;

  if (!zoomOutButton || !zoomResetButton || !zoomInButton) return;

  let outBinding: DomBinding | null = null;
  let inBinding: DomBinding | null = null;
  let resetBinding: DomBinding | null = null;

  const clampScale = (value: unknown, fallback: number) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0.75, Math.min(1.5, Math.round(n * 100) / 100));
  };

  const render = (scale: number) => {
    if (label) label.textContent = `${Math.round(scale * 100)}%`;
  };

  const setScale = (scale: number, persist: boolean) => {
    const safe = clampScale(scale, 1);
    try {
      root.style.setProperty(cssVarName, String(safe));
    } catch {
      // ignore
    }
    render(safe);
    if (persist) {
      try {
        storage.setItem(storageKey, String(safe));
      } catch {
        // ignore
      }
    }
    return safe;
  };

  const getScale = (): number => {
    try {
      const raw = storage.getItem(storageKey);
      if (raw != null) return clampScale(raw, 1);
    } catch {
      // ignore
    }
    try {
      const rawCss = getComputedStyle(root).getPropertyValue(cssVarName);
      if (rawCss) return clampScale(rawCss, 1);
    } catch {
      // ignore
    }
    return 1;
  };

  // Init from storage.
  setScale(getScale(), false);

  const step = 0.05;
  const onZoomOut = () => setScale(getScale() - step, true);
  const onZoomIn = () => setScale(getScale() + step, true);
  const onReset = () => setScale(1, true);

  outBinding = bindButton(zoomOutButton, onZoomOut);
  inBinding = bindButton(zoomInButton, onZoomIn);
  resetBinding = bindButton(zoomResetButton, onReset);

  return {
    setScale,
    getScale,
    dispose: () => {
      outBinding?.dispose();
      inBinding?.dispose();
      resetBinding?.dispose();
      outBinding = null;
      inBinding = null;
      resetBinding = null;
    },
  };
}
