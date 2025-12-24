import { createRandomSeed, createSeededRng } from "../../state/seededRng";
import type { MidiBinding, MidiBindingTarget } from "../settings/settingsStore";
import { sameTarget } from "../settings/settingsStore";
import type { MacroSlot, VisualStateV2 } from "../visualState/visualStateStore";

export const AIVJ_MACRO_BANK = [
  { id: "aivj-m4", label: "M4" },
  { id: "aivj-m5", label: "M5" },
  { id: "aivj-m6", label: "M6" },
  { id: "aivj-m7", label: "M7" },
  { id: "aivj-m8", label: "M8" },
] as const;

export function getAivjMacroBankTargets(): MidiBindingTarget[] {
  return [
    { kind: "macro", key: "fusion" },
    { kind: "macro", key: "motion" },
    { kind: "macro", key: "sparkle" },
    ...AIVJ_MACRO_BANK.map(
      (s): MidiBindingTarget => ({ kind: "slot", slotId: s.id })
    ),
  ];
}

export function hasBindingForTarget(
  bindings: MidiBinding[],
  target: MidiBindingTarget
) {
  return bindings.some((b) => sameTarget(b.target as any, target as any));
}

export function computeAivjMacroBankBindingState(bindings: MidiBinding[]) {
  const targets = getAivjMacroBankTargets();
  const any = targets.some((t) => hasBindingForTarget(bindings, t));
  const all = targets.every((t) => hasBindingForTarget(bindings, t));
  return {
    any,
    all,
    bindingsCount: bindings.length,
    bindings,
    targets,
  };
}

export function ensureAivjMacroBankSlots(state: VisualStateV2): VisualStateV2 {
  const clamp01Local = (value: unknown, fallback: number) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  };

  const existing = Array.isArray(state.global.macroSlots)
    ? state.global.macroSlots
    : [];
  const byId = new Map(existing.map((s) => [String((s as any)?.id ?? ""), s]));
  const rng = createSeededRng(createRandomSeed());

  const bankSlots: MacroSlot[] = AIVJ_MACRO_BANK.map((spec) => {
    const found = byId.get(spec.id) as MacroSlot | undefined;
    if (found) {
      return {
        ...found,
        id: spec.id,
        label: String(found.label || spec.label),
        value: clamp01Local(found.value, 0.5),
        randomize:
          typeof found.randomize === "boolean" ? found.randomize : true,
      };
    }
    return {
      id: spec.id,
      label: spec.label,
      value: clamp01Local(rng.next(), 0.5),
      randomize: true,
    };
  });

  const rest = existing.filter(
    (s) => !AIVJ_MACRO_BANK.some((spec) => spec.id === String((s as any)?.id))
  );

  return {
    ...state,
    global: {
      ...state.global,
      macroSlots: [...bankSlots, ...rest],
    },
  };
}
