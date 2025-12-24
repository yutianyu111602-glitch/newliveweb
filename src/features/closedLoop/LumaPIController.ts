export type LumaPIControllerOptions = {
  enabled: boolean;
  targetLuma?: number; // 0..1
  kp?: number;
  ki?: number;
  integralLimit?: number;
  maxDeltaPerSec?: number;
  minValue?: number;
  maxValue?: number;
};

export type LumaPIControllerSnapshot = {
  enabled: boolean;
  targetLuma: number;
  kp: number;
  ki: number;
  integral: number;
  integralLimit: number;
  maxDeltaPerSec: number;
  value: number | null;
  lastError: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export class LumaPIController {
  private enabled = false;
  private targetLuma = 0.45;
  private kp = 0.25;
  private ki = 0.05;
  private integral = 0;
  private integralLimit = 0.75;
  private maxDeltaPerSec = 0.15;
  private minValue = 0;
  private maxValue = 1;

  private value: number | null = null;
  private lastError: number | null = null;

  constructor(opts: LumaPIControllerOptions) {
    this.enabled = Boolean(opts.enabled);

    const t = Number(opts.targetLuma);
    if (Number.isFinite(t)) this.targetLuma = clamp(t, 0, 1);

    const kp = Number(opts.kp);
    if (Number.isFinite(kp)) this.kp = clamp(kp, 0, 5);

    const ki = Number(opts.ki);
    if (Number.isFinite(ki)) this.ki = clamp(ki, 0, 5);

    const il = Number(opts.integralLimit);
    if (Number.isFinite(il)) this.integralLimit = clamp(il, 0, 10);

    const md = Number(opts.maxDeltaPerSec);
    if (Number.isFinite(md)) this.maxDeltaPerSec = clamp(md, 0.001, 5);

    const minV = Number(opts.minValue);
    const maxV = Number(opts.maxValue);
    if (Number.isFinite(minV)) this.minValue = minV;
    if (Number.isFinite(maxV)) this.maxValue = maxV;
    if (this.maxValue < this.minValue) {
      const tmp = this.minValue;
      this.minValue = this.maxValue;
      this.maxValue = tmp;
    }
  }

  isEnabled() {
    return this.enabled;
  }

  reset(initialValue: number) {
    this.value = clamp(Number(initialValue), this.minValue, this.maxValue);
    this.integral = 0;
    this.lastError = null;
  }

  update(measuredLuma: number, dtSec: number): number | null {
    if (!this.enabled) return null;
    if (!Number.isFinite(measuredLuma)) return null;
    if (!Number.isFinite(dtSec) || dtSec <= 0) return null;
    if (this.value == null) return null;

    const error = this.targetLuma - measuredLuma;
    this.lastError = error;

    this.integral = clamp(this.integral + error * dtSec, -this.integralLimit, this.integralLimit);

    const u = this.kp * error + this.ki * this.integral;
    const maxStep = this.maxDeltaPerSec * dtSec;
    const step = clamp(u, -maxStep, maxStep);

    this.value = clamp(this.value + step, this.minValue, this.maxValue);
    return this.value;
  }

  getSnapshot(): LumaPIControllerSnapshot {
    return {
      enabled: this.enabled,
      targetLuma: this.targetLuma,
      kp: this.kp,
      ki: this.ki,
      integral: this.integral,
      integralLimit: this.integralLimit,
      maxDeltaPerSec: this.maxDeltaPerSec,
      value: this.value,
      lastError: this.lastError
    };
  }
}
