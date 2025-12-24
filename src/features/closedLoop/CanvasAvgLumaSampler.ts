export type CanvasAvgLumaSamplerOptions = {
  enabled: boolean;
  intervalMs?: number;
  downsampleSize?: number;
};

export type CanvasAvgLumaSample = {
  ok: boolean;
  avgLuma?: number;
  error?: unknown;
  sampledAtMs: number;
  sampleCount: number;
};

export class CanvasAvgLumaSampler {
  private enabled = false;
  private intervalMs = 500;
  private downsampleSize = 8;

  private lastSampleMs = 0;
  private sampleCount = 0;
  private last: CanvasAvgLumaSample | null = null;

  private samplerCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private samplerCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  constructor(opts: CanvasAvgLumaSamplerOptions) {
    this.enabled = Boolean(opts.enabled);

    const rawInterval = Number(opts.intervalMs);
    if (Number.isFinite(rawInterval)) this.intervalMs = Math.max(100, Math.min(5000, Math.floor(rawInterval)));

    const rawSize = Number(opts.downsampleSize);
    if (Number.isFinite(rawSize)) this.downsampleSize = Math.max(2, Math.min(64, Math.floor(rawSize)));
  }

  getSnapshot() {
    return {
      enabled: this.enabled,
      intervalMs: this.intervalMs,
      downsampleSize: this.downsampleSize,
      last: this.last
    };
  }

  maybeSample(sourceCanvas: HTMLCanvasElement, nowMs: number): CanvasAvgLumaSample | null {
    if (!this.enabled) return null;
    if (nowMs - this.lastSampleMs < this.intervalMs) return null;
    this.lastSampleMs = nowMs;

    try {
      this.ensureSampler();
      const ctx = this.samplerCtx;
      const c = this.samplerCanvas;
      if (!ctx || !c) return null;

      const size = this.downsampleSize;
      (c as any).width = size;
      (c as any).height = size;

      (ctx as any).drawImage(sourceCanvas, 0, 0, size, size);
      const image = (ctx as any).getImageData(0, 0, size, size) as ImageData;
      const data = image.data;
      const n = size * size;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      const avgLuma = n ? sum / (n * 255) : 0;

      this.sampleCount++;
      this.last = { ok: true, avgLuma, sampledAtMs: nowMs, sampleCount: this.sampleCount };
      return this.last;
    } catch (error) {
      this.sampleCount++;
      this.last = { ok: false, error, sampledAtMs: nowMs, sampleCount: this.sampleCount };
      return this.last;
    }
  }

  private ensureSampler() {
    if (this.samplerCanvas && this.samplerCtx) return;

    const size = this.downsampleSize;

    if (typeof (globalThis as any).OffscreenCanvas === 'function') {
      const c = new (globalThis as any).OffscreenCanvas(size, size) as OffscreenCanvas;
      const ctx = c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
      this.samplerCanvas = c;
      this.samplerCtx = ctx;
      return;
    }

    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
    this.samplerCanvas = c;
    this.samplerCtx = ctx;
  }
}
