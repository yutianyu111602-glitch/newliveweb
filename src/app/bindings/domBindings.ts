export type DomBinding = {
  /** Push current state into DOM. Safe to call often. */
  sync: () => void;
  /** Remove event listeners. Safe to call multiple times. */
  dispose: () => void;
};

type MaybeEl<T> = T | null | undefined;

type ListenOptions = boolean | AddEventListenerOptions;

export function listen<T extends EventTarget, K extends keyof DocumentEventMap>(
  target: MaybeEl<T>,
  type: K | (string & {}),
  handler: (event: any) => void,
  options?: ListenOptions
): () => void {
  if (!target) return () => {};
  target.addEventListener(type as any, handler as any, options as any);
  return () => {
    try {
      target.removeEventListener(type as any, handler as any, options as any);
    } catch {
      // ignore
    }
  };
}

export function bindButton(
  button: MaybeEl<HTMLButtonElement>,
  onClick: () => void
): DomBinding {
  const dispose = listen(button, "click", () => onClick());
  return { sync: () => {}, dispose };
}

export function bindCheckbox(opts: {
  el: MaybeEl<HTMLInputElement>;
  get: () => boolean;
  set: (checked: boolean) => void;
  event?: "change" | "input";
}): DomBinding {
  const { el, get, set, event = "change" } = opts;
  const dispose = listen(el, event, () => {
    if (!el) return;
    set(Boolean(el.checked));
  });

  const sync = () => {
    if (!el) return;
    const next = Boolean(get());
    if (el.checked !== next) el.checked = next;
  };

  return { sync, dispose };
}

export function bindSelect(opts: {
  el: MaybeEl<HTMLSelectElement>;
  get: () => string;
  set: (value: string) => void;
  event?: "change";
  normalizeDom?: (raw: string) => string;
}): DomBinding {
  const { el, get, set, event = "change", normalizeDom } = opts;

  const dispose = listen(el, event, () => {
    if (!el) return;
    const raw = String(el.value ?? "");
    set(normalizeDom ? normalizeDom(raw) : raw);
  });

  const sync = () => {
    if (!el) return;
    const next = String(get() ?? "");
    if (el.value !== next) el.value = next;
  };

  return { sync, dispose };
}

export function bindInputValue(opts: {
  el: MaybeEl<HTMLInputElement>;
  get: () => string;
  set: (value: string) => void;
  event?: "input" | "change";
  normalizeDom?: (raw: string) => string;
}): DomBinding {
  const { el, get, set, event = "input", normalizeDom } = opts;

  const dispose = listen(el, event, () => {
    if (!el) return;
    const raw = String(el.value ?? "");
    set(normalizeDom ? normalizeDom(raw) : raw);
  });

  const sync = () => {
    if (!el) return;
    const next = String(get() ?? "");
    if (el.value !== next) el.value = next;
  };

  return { sync, dispose };
}

export function bindFileInput(opts: {
  el: MaybeEl<HTMLInputElement>;
  set: (file: File) => void | Promise<void>;
  clearAfter?: boolean;
}): DomBinding {
  const { el, set, clearAfter = false } = opts;

  const dispose = listen(el, "change", async (event: Event) => {
    const input = (event.target as HTMLInputElement | null) ?? null;
    const file = input?.files?.[0] ?? null;
    if (!file) return;
    try {
      await set(file);
    } finally {
      if (clearAfter && input) {
        try {
          input.value = "";
        } catch {
          // ignore
        }
      }
    }
  });

  return { sync: () => {}, dispose };
}
