export type MidiBindingTarget =
  | { kind: 'macro'; key: 'fusion' | 'motion' | 'sparkle' }
  | { kind: 'slot'; slotId: string }
  | { kind: 'param'; key: string };

export type MidiBinding = {
  id: string;
  target: MidiBindingTarget;
  deviceId?: string;
  deviceName?: string;
  channel?: number; // 0..15
  cc?: number; // 0..127
  min?: number; // default 0
  max?: number; // default 1
  curve?: 'linear' | 'exp' | 'log';
};

export type SettingsV1 = {
  version: 1;
  midi: {
    bindings: MidiBinding[];
  };
};

export const SETTINGS_STORAGE_KEY_V1 = 'newliveweb:settings:v1';

export function createDefaultSettings(): SettingsV1 {
  return { version: 1, midi: { bindings: [] } };
}

export function loadSettings(storage: Pick<Storage, 'getItem'>, key = SETTINGS_STORAGE_KEY_V1): SettingsV1 {
  try {
    const raw = storage.getItem(key);
    if (!raw) return createDefaultSettings();
    const parsed = JSON.parse(raw) as any;
    if (!parsed || typeof parsed !== 'object') return createDefaultSettings();
    if (parsed.version !== 1) return createDefaultSettings();

    const bindings = Array.isArray(parsed.midi?.bindings) ? parsed.midi.bindings : [];

    return {
      version: 1,
      midi: {
        bindings: bindings
          .filter((b: any) => b && typeof b === 'object')
          .map((b: any) => ({
            id: String(b.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
            target: normalizeTarget(b.target),
            deviceId: b.deviceId != null ? String(b.deviceId) : undefined,
            deviceName: b.deviceName != null ? String(b.deviceName) : undefined,
            channel: b.channel != null ? Number(b.channel) : undefined,
            cc: b.cc != null ? Number(b.cc) : undefined,
            min: b.min != null ? Number(b.min) : undefined,
            max: b.max != null ? Number(b.max) : undefined,
            curve: b.curve === 'exp' || b.curve === 'log' ? b.curve : 'linear'
          }))
      }
    };
  } catch {
    return createDefaultSettings();
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'>, settings: SettingsV1, key = SETTINGS_STORAGE_KEY_V1) {
  try {
    storage.setItem(key, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function upsertMidiBinding(settings: SettingsV1, binding: MidiBinding): SettingsV1 {
  const next = settings.midi.bindings.filter((b) => !sameTarget(b.target, binding.target));
  next.push(binding);
  return {
    ...settings,
    midi: {
      ...settings.midi,
      bindings: next
    }
  };
}

export function removeMidiBinding(settings: SettingsV1, target: MidiBindingTarget): SettingsV1 {
  return {
    ...settings,
    midi: {
      ...settings.midi,
      bindings: settings.midi.bindings.filter((b) => !sameTarget(b.target, target))
    }
  };
}

export function sameTarget(a: MidiBindingTarget, b: MidiBindingTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'macro') return (a as any).key === (b as any).key;
  if (a.kind === 'slot') return (a as any).slotId === (b as any).slotId;
  return (a as any).key === (b as any).key;
}

function normalizeTarget(raw: any): MidiBindingTarget {
  const kind = raw?.kind;
  if (kind === 'macro') {
    const key = raw?.key;
    if (key === 'fusion' || key === 'motion' || key === 'sparkle') return { kind: 'macro', key };
    return { kind: 'macro', key: 'fusion' };
  }
  if (kind === 'slot') {
    return { kind: 'slot', slotId: String(raw?.slotId ?? '') };
  }
  if (kind === 'param') {
    return { kind: 'param', key: String(raw?.key ?? '') };
  }
  return { kind: 'macro', key: 'fusion' };
}
