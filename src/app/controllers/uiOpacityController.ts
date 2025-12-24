import { bindInputValue, type DomBinding } from "../bindings/domBindings";

export function initUiOpacityController(opts: {
  input: HTMLInputElement | null;
  text: HTMLElement | null;
  root: HTMLElement;
  storage: Storage;
  storageKey?: string;
  cssVarName?: string;
}) {
  const {
    input,
    text,
    root,
    storage,
    storageKey = "newliveweb:ui:opacity",
    cssVarName = "--nw-ui-opacity",
  } = opts;

  if (!input) return;

  const clampPct = (value: unknown, fallbackPct: number) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallbackPct;
    return Math.max(20, Math.min(100, Math.round(n)));
  };

  const setPct = (pct: number, persist: boolean) => {
    const safePct = clampPct(pct, 100);
    const v = safePct / 100;
    try {
      root.style.setProperty(cssVarName, String(v));
    } catch {
      // ignore
    }
    input.value = String(safePct);
    if (text) text.textContent = `${safePct}%`;
    if (!persist) return;
    try {
      storage.setItem(storageKey, String(safePct));
    } catch {
      // ignore
    }
  };

  // Init from storage.
  try {
    const raw = storage.getItem(storageKey);
    if (raw != null) setPct(Number(raw), false);
    else setPct(Number(input.value ?? 100), false);
  } catch {
    setPct(Number(input.value ?? 100), false);
  }

  let binding: DomBinding | null = null;
  binding = bindInputValue({
    el: input,
    event: "input",
    get: () => String(input.value ?? 100),
    set: (raw) => {
      setPct(Number(raw), true);
    },
  });

  return {
    setPct,
    dispose: () => {
      binding?.dispose();
      binding = null;
    },
  };
}
