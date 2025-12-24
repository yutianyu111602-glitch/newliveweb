import type { MidiBindingTarget } from "../settings/settingsStore";

export type AutoMapMidiEvent = {
  deviceId?: string | null;
  channel?: number | null;
  cc?: number | null;
};

export type AutoMapState = {
  total: number;
  queue: MidiBindingTarget[];
  seen: Set<string>;
};

export function createAutoMapState(
  targets: MidiBindingTarget[]
): AutoMapState | null {
  const total = targets.length;
  if (!total) return null;
  return {
    total,
    queue: [...targets],
    seen: new Set<string>(),
  };
}

export function getAutoMapLabel(state: AutoMapState): string {
  const done = Math.max(0, state.total - state.queue.length);
  return state.total > 0
    ? `AutoMap ${done}/${state.total} (move next knob)…`
    : "AutoMap…";
}

export function consumeAutoMapEvent(
  state: AutoMapState,
  event: AutoMapMidiEvent
): { nextState: AutoMapState | null; target: MidiBindingTarget | null } {
  const cc = event.cc;
  const channel = event.channel;
  if (cc == null || channel == null) {
    return { nextState: state, target: null };
  }

  const key = `${event.deviceId ?? ""}|${channel}|${cc}`;
  if (state.seen.has(key)) {
    return { nextState: state, target: null };
  }
  state.seen.add(key);

  const target = state.queue.shift() ?? null;
  if (!target) {
    return { nextState: null, target: null };
  }

  if (!state.queue.length) {
    return { nextState: null, target };
  }

  return { nextState: state, target };
}
