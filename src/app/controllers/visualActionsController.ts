import { listen } from "../bindings/domBindings";

type KeydownEvent = Pick<
  KeyboardEvent,
  | "key"
  | "ctrlKey"
  | "metaKey"
  | "altKey"
  | "shiftKey"
  | "target"
  | "preventDefault"
>;

function isTypingTarget(target: unknown) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable === true;
}

function isDisabled(el: HTMLElement | null) {
  return Boolean((el as unknown as { disabled?: boolean } | null)?.disabled);
}

export function initVisualActionsController(opts: {
  randomButton: HTMLElement | null;
  favoriteButton: HTMLElement | null;
  favoriteCountButton: HTMLElement | null;
  onRandom: () => void;
  onFavorite: () => void;
  onToggleFavorites: () => void;
  windowObj?: Window;
}) {
  const {
    randomButton,
    favoriteButton,
    favoriteCountButton,
    onRandom,
    onFavorite,
    onToggleFavorites,
    windowObj = window,
  } = opts;

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch {
      // ignore
    }
  };

  const onRandomClick = () => {
    if (isDisabled(randomButton)) return;
    safe(onRandom);
  };

  const onFavoriteClick = () => {
    if (isDisabled(favoriteButton)) return;
    safe(onFavorite);
  };

  const onFavoritesToggle = () => {
    safe(onToggleFavorites);
  };

  const onFavoriteCountKeydown = (e: KeydownEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onFavoritesToggle();
    }
  };

  const onWindowKeydown = (e: KeydownEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;
    if (e.key === "r" || e.key === "R") {
      onRandomClick();
    }
  };

  const disposers = [
    listen(randomButton, "click", onRandomClick),
    listen(favoriteButton, "click", onFavoriteClick),
    listen(favoriteCountButton, "click", onFavoritesToggle),
    listen(favoriteCountButton, "keydown", onFavoriteCountKeydown as any),
    listen(windowObj, "keydown", onWindowKeydown as any),
  ];

  return {
    dispose: () => {
      for (const d of disposers) d();
    },
  };
}
