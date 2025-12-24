export type MidiCcEvent = {
  deviceId: string;
  deviceName: string;
  channel: number; // 0..15
  cc: number; // 0..127
  rawValue: number; // 0..127
  value01: number; // 0..1
};

export function isWebMidiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator as any).requestMIDIAccess === 'function';
}

export async function requestWebMidiAccess(): Promise<MIDIAccess | null> {
  if (!isWebMidiSupported()) return null;
  try {
    const access = await (navigator as any).requestMIDIAccess({ sysex: false });
    return access as MIDIAccess;
  } catch {
    return null;
  }
}

export function subscribeToControlChange(
  access: MIDIAccess,
  onEvent: (event: MidiCcEvent) => void
): () => void {
  const inputUnsubs = new Map<string, () => void>();

  function attachInput(input: MIDIInput) {
    const id = input.id;
    if (inputUnsubs.has(id)) return;

    const handler = (e: MIDIMessageEvent) => {
      const data = e.data;
      if (!data || data.length < 3) return;
      const status = data[0] ?? 0;
      const data1 = data[1] ?? 0;
      const data2 = data[2] ?? 0;

      const isCC = (status & 0xf0) === 0xb0;
      if (!isCC) return;

      const channel = status & 0x0f;
      const cc = data1;
      const rawValue = data2;
      const value01 = Math.min(1, Math.max(0, rawValue / 127));

      onEvent({
        deviceId: input.id,
        deviceName: input.name ?? 'MIDI Input',
        channel,
        cc,
        rawValue,
        value01
      });
    };

    input.addEventListener('midimessage', handler as any);

    inputUnsubs.set(id, () => {
      try {
        input.removeEventListener('midimessage', handler as any);
      } catch {
        // ignore
      }
    });
  }

  function detachMissing() {
    const liveIds = new Set<string>();
    for (const input of access.inputs.values()) {
      liveIds.add(input.id);
    }
    for (const [id, unsub] of inputUnsubs.entries()) {
      if (!liveIds.has(id)) {
        unsub();
        inputUnsubs.delete(id);
      }
    }
  }

  function refresh() {
    for (const input of access.inputs.values()) {
      attachInput(input);
    }
    detachMissing();
  }

  const stateHandler = () => refresh();
  access.addEventListener('statechange', stateHandler as any);

  refresh();

  return () => {
    try {
      access.removeEventListener('statechange', stateHandler as any);
    } catch {
      // ignore
    }

    for (const unsub of inputUnsubs.values()) {
      unsub();
    }
    inputUnsubs.clear();
  };
}
