export type DecisionTraceEvent = {
  tMs: number;
  writer: string;
  target: string;
  value?: string;
  // Absolute delta since last numeric record for the same target.
  // Present for recordNumeric() events; omitted for generic record() events.
  delta?: number;
  weight01?: number;
  reason?: string;
};

type RecordNumericOpts = {
  tMs: number;
  writer: string;
  target: string;
  value: number;
  weight01?: number;
  reason?: string;
  minIntervalMs?: number;
  minDelta?: number;
  digits?: number;
};

export class DecisionTrace {
  private maxEvents: number;
  private events: DecisionTraceEvent[] = [];
  private lastNumericByTarget = new Map<
    string,
    { tMs: number; value: number; writer: string }
  >();

  constructor(opts?: { maxEvents?: number }) {
    this.maxEvents = Math.max(40, Math.floor(opts?.maxEvents ?? 240));
  }

  record(event: DecisionTraceEvent) {
    if (!event || !Number.isFinite(Number(event.tMs))) return;
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
  }

  recordNumeric(opts: RecordNumericOpts) {
    const tMs = Number(opts.tMs);
    const writer = String(opts.writer ?? "");
    const target = String(opts.target ?? "");
    const value = Number(opts.value);
    if (
      !Number.isFinite(tMs) ||
      !writer ||
      !target ||
      !Number.isFinite(value)
    ) {
      return;
    }

    const minIntervalMs = Math.max(0, Number(opts.minIntervalMs ?? 90));
    const minDelta = Math.max(0, Number(opts.minDelta ?? 0.01));

    const last = this.lastNumericByTarget.get(target);
    const dvSinceLast = last ? Math.abs(value - last.value) : 0;
    if (last) {
      const dt = tMs - last.tMs;
      const dv = dvSinceLast;
      // Avoid spamming trace for values that are effectively stable.
      if (dt < minIntervalMs && dv < minDelta && last.writer === writer) {
        return;
      }
    }

    this.lastNumericByTarget.set(target, { tMs, value, writer });

    const digits = Math.max(0, Math.min(6, Math.floor(opts.digits ?? 3)));
    this.record({
      tMs,
      writer,
      target,
      value: value.toFixed(digits),
      delta: dvSinceLast,
      weight01: opts.weight01,
      reason: opts.reason,
    });
  }

  getRecent(opts?: {
    sinceMs?: number;
    limit?: number;
    targetPrefix?: string;
  }): DecisionTraceEvent[] {
    const sinceMs = opts?.sinceMs == null ? null : Number(opts.sinceMs);
    const limit = Math.max(1, Math.min(50, Math.floor(opts?.limit ?? 14)));
    const prefix = (opts?.targetPrefix ?? "").trim();

    const out: DecisionTraceEvent[] = [];
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i];
      if (sinceMs != null && Number(ev.tMs) < sinceMs) break;
      if (prefix && !String(ev.target).startsWith(prefix)) continue;
      out.push(ev);
      if (out.length >= limit) break;
    }
    return out;
  }
}
