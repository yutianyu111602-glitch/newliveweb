import {
  SETTINGS_STORAGE_KEY_V1,
  loadSettings,
  saveSettings,
  removeMidiBinding,
  sameTarget,
  upsertMidiBinding,
  type MidiBinding,
  type MidiBindingTarget,
  type SettingsV1,
} from "../../features/settings/settingsStore";
import type { ParamDef } from "../../state/paramSchema";
import {
  isWebMidiSupported,
  requestWebMidiAccess,
  subscribeToControlChange,
  type MidiCcEvent,
} from "../../midi/webMidi";
import {
  consumeAutoMapEvent,
  createAutoMapState,
  getAutoMapLabel,
  type AutoMapState,
} from "../../features/midi/autoMap";
import { listen } from "../bindings/domBindings";

type BackgroundType = "liquid" | "basic" | "camera" | "video" | "depth";

export type MidiControllerDom = {
  status: HTMLElement | null | undefined;
  bindingsCount: HTMLElement | null | undefined;
  connectButton: HTMLButtonElement | null | undefined;
  targetSelect: HTMLSelectElement | null | undefined;
  learnButton: HTMLButtonElement | null | undefined;
  unbindButton: HTMLButtonElement | null | undefined;
  clearButton: HTMLButtonElement | null | undefined;
  bindingLabel: HTMLElement | null | undefined;
};

export type MidiController = {
  refreshTargets: () => void;
  refreshBindingLabel: () => void;
  getBindings: () => MidiBinding[];
  dispose: () => void;
};

function clamp01(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function escapeHtml(text: string) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findNumberDefByKey(
  defs: readonly ParamDef[],
  key: string
): { min: number; max: number; step?: number } | null {
  const def = defs.find((d) => d.kind === "number" && d.key === key);
  if (!def || def.kind !== "number") return null;
  return {
    min: Number(def.min),
    max: Number(def.max),
    step: def.step != null ? Number(def.step) : undefined,
  };
}

function scale01ToRange(
  value01: number,
  range: { min: number; max: number; step?: number }
) {
  const raw = range.min + (range.max - range.min) * clamp01(value01, 0.5);
  if (range.step && Number.isFinite(range.step) && range.step > 0) {
    return Math.round(raw / range.step) * range.step;
  }
  return raw;
}

export function initMidiController(opts: {
  dom: MidiControllerDom;
  storage: Storage;
  storageKey?: string;
  includeCamera: boolean;
  getMacroSlots: () => Array<{ id: string; label: string }>;
  autoMap?: {
    enabled: boolean;
    getTargets: () => MidiBindingTarget[];
  };
  projectmBlendDefs: readonly ParamDef[];
  getBackgroundParamDefs: (type: BackgroundType) => readonly ParamDef[];
  setMacroValue01: (
    key: "fusion" | "motion" | "sparkle",
    value01: number
  ) => void;
  setSlotValue01: (slotId: string, value01: number) => void;
  applyProjectMBlendPatch: (patch: Record<string, unknown>) => void;
  applyBackgroundLayerPatch: (
    type: BackgroundType,
    patch: Record<string, unknown>
  ) => void;
  onParamPatched?: () => void;
  setInspectorStatusExtraTransient?: (message: string, ttlMs?: number) => void;
  onBindingsChanged?: (bindings: MidiBinding[]) => void;
  audioControlsDefs?: readonly ParamDef[];
  audioBeatTempoDefs?: readonly ParamDef[];
  applyAudioControlsPatch?: (patch: Record<string, unknown>) => void;
  applyBeatTempoPatch?: (patch: Record<string, unknown>) => void;
}): MidiController {
  const {
    dom,
    storage,
    storageKey = SETTINGS_STORAGE_KEY_V1,
    includeCamera,
    getMacroSlots,
    autoMap,
    projectmBlendDefs,
    getBackgroundParamDefs,
    setMacroValue01,
    setSlotValue01,
    applyProjectMBlendPatch,
    applyBackgroundLayerPatch,
    onParamPatched,
    setInspectorStatusExtraTransient,
    onBindingsChanged,
    audioControlsDefs,
    audioBeatTempoDefs,
    applyAudioControlsPatch,
    applyBeatTempoPatch,
  } = opts;

  const statusEl = dom.status;
  const bindingsCountEl = dom.bindingsCount;
  const connectButton = dom.connectButton;
  const targetSelect = dom.targetSelect;
  const learnButton = dom.learnButton;
  const unbindButton = dom.unbindButton;
  const clearButton = dom.clearButton;
  const bindingLabel = dom.bindingLabel;

  const disposers: Array<() => void> = [];

  let settings: SettingsV1 = loadSettings(storage, storageKey);
  let midiAccess: MIDIAccess | null = null;
  let midiUnsubscribe: (() => void) | null = null;
  let midiLearnArmed = false;
  let lastMidiEvent: MidiCcEvent | null = null;
  let autoMapState: AutoMapState | null = null;

  const setStatus = (text: string) => {
    if (statusEl) statusEl.textContent = text;
  };

  function saveSettingsAndNotify(next: SettingsV1) {
    settings = next;
    saveSettings(storage, settings, storageKey);
    onBindingsChanged?.(settings.midi.bindings);
  }

  function refreshMidiBindingsCount() {
    const count = settings.midi.bindings.length;
    if (bindingsCountEl) {
      bindingsCountEl.textContent = String(count);
      try {
        bindingsCountEl.setAttribute("title", `Bindings: ${count}`);
      } catch {
        // ignore
      }
    }
    if (clearButton) clearButton.disabled = count === 0;
  }

  function getSelectedMidiTarget(): MidiBindingTarget {
    const raw = String(targetSelect?.value ?? "macro:fusion");
    if (raw.startsWith("macro:")) {
      const key = raw.slice("macro:".length);
      if (key === "fusion" || key === "motion" || key === "sparkle")
        return { kind: "macro", key };
      return { kind: "macro", key: "fusion" };
    }
    if (raw.startsWith("slot:")) {
      return { kind: "slot", slotId: raw.slice("slot:".length) };
    }
    if (raw.startsWith("param:")) {
      return { kind: "param", key: raw.slice("param:".length) };
    }
    return { kind: "macro", key: "fusion" };
  }

  function describeBinding(binding: MidiBinding | null): string {
    if (!binding) return "No binding";
    const target =
      binding.target.kind === "macro"
        ? `macro:${binding.target.key}`
        : binding.target.kind === "slot"
        ? `slot:${binding.target.slotId}`
        : `param:${binding.target.key}`;
    const device = binding.deviceName ? `${binding.deviceName}` : "MIDI";
    const cc = binding.cc == null ? "?" : String(binding.cc);
    const ch = binding.channel == null ? "?" : String(binding.channel + 1);
    return `${target} ← ${device} ch${ch} cc${cc}`;
  }

  function getBindingForTarget(target: MidiBindingTarget): MidiBinding | null {
    return (
      settings.midi.bindings.find((b) => sameTarget(b.target, target)) ?? null
    );
  }

  function refreshBindingLabel() {
    const selected = getSelectedMidiTarget();
    const binding = getBindingForTarget(selected);
    const selectedLabel =
      selected.kind === "macro"
        ? `macro:${selected.key}`
        : selected.kind === "slot"
        ? `slot:${selected.slotId}`
        : `param:${selected.key}`;

    const lastEventLabel = lastMidiEvent
      ? `${lastMidiEvent.deviceName ?? "MIDI"} ch${
          (lastMidiEvent.channel ?? 0) + 1
        } cc${lastMidiEvent.cc ?? "?"} v=${(lastMidiEvent.value01 ?? 0).toFixed(
          2
        )}`
      : "waiting…";

    const autoMapLabel = (() => {
      if (!autoMapState) return null;
      return getAutoMapLabel(autoMapState);
    })();

    if (bindingLabel) {
      bindingLabel.textContent = autoMapLabel
        ? autoMapLabel
        : midiLearnArmed
        ? `Armed: ${selectedLabel} • last: ${lastEventLabel}`
        : describeBinding(binding);
    }
    if (learnButton)
      learnButton.textContent = midiLearnArmed
        ? `Learning (${selectedLabel})…`
        : "Learn";
    if (unbindButton) unbindButton.disabled = !binding;
    refreshMidiBindingsCount();
  }

  function applyParamTargetValue(paramId: string, value01: number) {
    if (paramId.startsWith("projectm.")) {
      const key = paramId.slice("projectm.".length);
      const range = findNumberDefByKey(projectmBlendDefs, key) ?? {
        min: 0,
        max: 1,
      };
      applyProjectMBlendPatch({ [key]: scale01ToRange(value01, range) });
      onParamPatched?.();
      return;
    }

    if (
      paramId.startsWith("audio.controls.") &&
      audioControlsDefs &&
      applyAudioControlsPatch
    ) {
      const key = paramId.slice("audio.controls.".length);
      const range = findNumberDefByKey(audioControlsDefs, key);
      if (!range) return;
      applyAudioControlsPatch({ [key]: scale01ToRange(value01, range) });
      onParamPatched?.();
      return;
    }

    if (
      paramId.startsWith("audio.beatTempo.") &&
      audioBeatTempoDefs &&
      applyBeatTempoPatch
    ) {
      const key = paramId.slice("audio.beatTempo.".length);
      const range = findNumberDefByKey(audioBeatTempoDefs, key);
      if (!range) return;
      applyBeatTempoPatch({ [key]: scale01ToRange(value01, range) });
      onParamPatched?.();
      return;
    }

    const parts = paramId.split(".");
    const bgType = parts[0] as BackgroundType;
    const key = parts.slice(1).join(".");
    if (
      bgType !== "liquid" &&
      bgType !== "basic" &&
      bgType !== "camera" &&
      bgType !== "video" &&
      bgType !== "depth"
    )
      return;
    if (!key) return;

    const defs = getBackgroundParamDefs(bgType);
    const range = findNumberDefByKey(defs, key);
    if (!range) return;
    applyBackgroundLayerPatch(bgType, {
      [key]: scale01ToRange(value01, range),
    });
    onParamPatched?.();
  }

  function applyMidiTargetValue(target: MidiBindingTarget, value01: number) {
    const value = clamp01(value01, 0.5);

    if (target.kind === "macro") {
      setMacroValue01(target.key, value);
      return;
    }

    if (target.kind === "slot") {
      setSlotValue01(target.slotId, value);
      return;
    }

    if (target.kind === "param") {
      applyParamTargetValue(target.key, value);
    }
  }

  function handleMidiCcEvent(event: MidiCcEvent) {
    lastMidiEvent = event;

    if (midiLearnArmed) {
      const target = getSelectedMidiTarget();
      const binding: MidiBinding = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        target,
        deviceId: event.deviceId,
        deviceName: event.deviceName,
        channel: event.channel,
        cc: event.cc,
        min: 0,
        max: 1,
        curve: "linear",
      };
      saveSettingsAndNotify(upsertMidiBinding(settings, binding));
      midiLearnArmed = false;
      refreshBindingLabel();
      return;
    }

    if (autoMapState) {
      const { nextState, target } = consumeAutoMapEvent(autoMapState, event);
      autoMapState = nextState;

      if (target) {
        const binding: MidiBinding = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          target,
          deviceId: event.deviceId,
          deviceName: event.deviceName,
          channel: event.channel,
          cc: event.cc,
          min: 0,
          max: 1,
          curve: "linear",
        };
        saveSettingsAndNotify(upsertMidiBinding(settings, binding));

        if (!autoMapState) {
          setInspectorStatusExtraTransient?.(
            "midi auto-mapped (8 macros)",
            2500
          );
          setStatus("Connected");
        }

        refreshBindingLabel();
        return;
      }
    }

    for (const binding of settings.midi.bindings) {
      if (binding.cc == null || binding.channel == null) continue;
      if (binding.cc !== event.cc) continue;
      if (binding.channel !== event.channel) continue;
      if (binding.deviceId && binding.deviceId !== event.deviceId) continue;

      const min = Number.isFinite(Number(binding.min))
        ? Number(binding.min)
        : 0;
      const max = Number.isFinite(Number(binding.max))
        ? Number(binding.max)
        : 1;
      const scaled = min + (max - min) * event.value01;
      applyMidiTargetValue(binding.target, scaled);
    }
  }

  function refreshTargets() {
    if (!targetSelect) return;
    const current = String(targetSelect.value || "macro:fusion");

    const slotOptions = getMacroSlots()
      .map(
        (s) =>
          `<option value="slot:${escapeHtml(s.id)}">slot:${escapeHtml(
            s.label
          )}</option>`
      )
      .join("");

    const projectmOptions = projectmBlendDefs
      .filter((d) => d.kind === "number")
      .map((d) => {
        const key = escapeHtml(d.key);
        return `<option value="param:projectm.${key}">param:projectm.${key}</option>`;
      })
      .join("");

    const bgTypes: BackgroundType[] = includeCamera
      ? ["liquid", "basic", "camera", "video"]
      : ["liquid", "basic", "video"];

    const bgOptions = bgTypes
      .flatMap((type) =>
        getBackgroundParamDefs(type)
          .filter((d) => d.kind === "number")
          .map((d) => `${type}.${d.key}`)
      )
      .map(
        (id) =>
          `<option value="param:${escapeHtml(id)}">param:${escapeHtml(
            id
          )}</option>`
      )
      .join("");

    const audioControlsOptions =
      audioControlsDefs && audioControlsDefs.length
        ? audioControlsDefs
            .filter((d) => d.kind === "number")
            .map((d) => `audio.controls.${d.key}`)
            .map(
              (id) =>
                `<option value="param:${escapeHtml(id)}">param:${escapeHtml(
                  id
                )}</option>`
            )
            .join("")
        : "";

    const audioBeatTempoOptions =
      audioBeatTempoDefs && audioBeatTempoDefs.length
        ? audioBeatTempoDefs
            .filter((d) => d.kind === "number")
            .map((d) => `audio.beatTempo.${d.key}`)
            .map(
              (id) =>
                `<option value="param:${escapeHtml(id)}">param:${escapeHtml(
                  id
                )}</option>`
            )
            .join("")
        : "";

    targetSelect.innerHTML = `
      <option value="macro:fusion">macro:fusion</option>
      <option value="macro:motion">macro:motion</option>
      <option value="macro:sparkle">macro:sparkle</option>
      ${projectmOptions}
      ${bgOptions}
      ${audioControlsOptions}
      ${audioBeatTempoOptions}
      ${slotOptions}
    `;

    const exists = Array.from(targetSelect.options).some(
      (o) => o.value === current
    );
    targetSelect.value = exists ? current : "macro:fusion";
    refreshBindingLabel();
  }

  const onTargetChanged = () => refreshBindingLabel();

  const onConnect = () => {
    void (async () => {
      if (!isWebMidiSupported()) {
        setStatus("Unavailable");
        return;
      }

      setStatus("Connecting…");
      const access = await requestWebMidiAccess();
      if (!access) {
        setStatus("Denied");
        return;
      }

      midiAccess = access;
      midiUnsubscribe?.();
      midiUnsubscribe = subscribeToControlChange(access, handleMidiCcEvent);
      setStatus("Connected");

      if (autoMap?.enabled) {
        const hasAnyBindings = (settings.midi.bindings ?? []).length > 0;
        const targets = autoMap.getTargets?.() ?? [];
        if (!hasAnyBindings && targets.length) {
          autoMapState = createAutoMapState(targets);
          setInspectorStatusExtraTransient?.(
            "midi auto-map: move 8 knobs/sliders to bind",
            3500
          );
          refreshBindingLabel();
        }
      }
    })();
  };

  const onLearnToggle = () => {
    if (!midiAccess) {
      setStatus(isWebMidiSupported() ? "Click Connect" : "Unavailable");
      return;
    }
    midiLearnArmed = !midiLearnArmed;
    refreshBindingLabel();
  };

  const onUnbind = () => {
    const target = getSelectedMidiTarget();
    saveSettingsAndNotify(removeMidiBinding(settings, target));
    refreshBindingLabel();
  };

  const onClear = () => {
    midiLearnArmed = false;
    autoMapState = null;
    saveSettingsAndNotify({
      ...settings,
      midi: { ...settings.midi, bindings: [] },
    });
    refreshBindingLabel();
    setInspectorStatusExtraTransient?.("midi bindings cleared", 2500);
  };

  disposers.push(listen(targetSelect, "change", onTargetChanged));
  disposers.push(listen(connectButton, "click", onConnect));
  disposers.push(listen(learnButton, "click", onLearnToggle));
  disposers.push(listen(unbindButton, "click", onUnbind));
  disposers.push(listen(clearButton, "click", onClear));

  // Init UI state.
  if (isWebMidiSupported()) {
    setStatus("Disconnected");
  } else {
    setStatus("Unavailable");
  }
  refreshTargets();

  return {
    refreshTargets,
    refreshBindingLabel,
    getBindings: () => settings.midi.bindings.slice(),
    dispose: () => {
      try {
        for (const dispose of disposers.splice(0)) {
          dispose();
        }
        midiUnsubscribe?.();
      } catch {
        // ignore
      }
    },
  };
}
