const RUNTIME_BASE_PATH = `${import.meta.env.BASE_URL}projectm-runtime`;

export type ProjectMAvgLumaSamplingOptions = {
  enabled?: boolean;
  intervalMs?: number;
  downsampleSize?: number;
};

export type ProjectMAvgColorSamplingOptions = {
  enabled?: boolean;
  intervalMs?: number;
  downsampleSize?: number;
};

export type ProjectMEngineOptions = {
  avgLumaSampling?: ProjectMAvgLumaSamplingOptions;
  avgColorSampling?: ProjectMAvgColorSamplingOptions;
  statsKey?: string;
  dprCap?: number;
};

type Cwrap = (
  ident: string,
  returnType: string | null,
  argTypes?: (string | null)[]
) => (...args: any[]) => any;

type ProjectMModule = {
  canvas?: HTMLCanvasElement;
  cwrap: Cwrap;
  ccall: (
    ident: string,
    returnType: string | null,
    argTypes: (string | null)[],
    args: any[]
  ) => any;
  _malloc(size: number): number;
  _free(ptr: number): void;
  stringToUTF8(str: string, outPtr: number, maxBytesToWrite: number): void;
  lengthBytesUTF8(str: string): number;
  UTF8ToString(ptr: number): string;
  HEAPF32: Float32Array;
};

type CreateProjectMModule = (config: {
  canvas: HTMLCanvasElement;
  locateFile: (path: string) => string;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  onAbort?: (what: unknown) => void;
}) => Promise<ProjectMModule>;

declare global {
  interface Window {
    createProjectMModule?: CreateProjectMModule;
  }
}

function formatAbortReason(what: unknown): string {
  if (what instanceof Error) return what.message || "abort";
  if (typeof what === "string") return what;
  if (typeof what === "object" && what && "message" in what) {
    const msg = (what as { message?: unknown }).message;
    if (typeof msg === "string" && msg) return msg;
  }
  return String(what ?? "abort");
}

export class ProjectMEngine {
  private static scriptPromise: Promise<void> | null = null;

  private module: ProjectMModule | null = null;
  private instancePtr: number | null = null;
  private canvas: HTMLCanvasElement;
  private failed = false;
  private mounted = false;
  private targetWidth: number;
  private targetHeight: number;
  private targetDpr = 1;
  private dprCap: number | null = null;

  // This ProjectM runtime does not export Module.HEAP* views.
  // Touching Module.HEAPF32/HEAP8 triggers an aborting getter.
  // Instead, locate WebAssembly.Memory via safe descriptor inspection.
  private wasmMemory: WebAssembly.Memory | null = null;
  private heapF32: Float32Array | null = null;
  private heapF32Buffer: ArrayBuffer | null = null;
  private lastRenderError: unknown = null;

  // Audio buffer management (separate stereo channels)
  private audioLeft: Float32Array | null = null;
  private audioRight: Float32Array | null = null;
  private audioLeftPtr = 0;
  private audioRightPtr = 0;
  private audioSampleCount = 512; // Standard ProjectM buffer size per channel

  private framesRendered = 0;
  private timeBaseMs = 0;
  private timeScale = 1;

  private avgLumaEnabled = false;
  private statsKey: string | null = null;
  private presetTextCache = new Map<string, string>();
  private static readonly PRESET_TEXT_CACHE_LIMIT = 40;
  private presetFetchInFlight = new Map<string, Promise<string>>();

  private presetLoadSeq = 0;
  private pendingPresetFirstFrame: {
    token: number;
    url: string;
    applyEndMs: number;
  } | null = null;

  private recordPresetLoadMetric(patch: Record<string, unknown>) {
    try {
      const root = (globalThis as any).__projectm_verify ?? {};
      const existing = root.presetLoadLast ?? {};
      (globalThis as any).__projectm_verify = {
        ...root,
        presetLoadLast: {
          ...existing,
          ...patch,
        },
      };
    } catch {
      // ignore
    }
  }

  private getPresetFetchTimeoutMs() {
    const DEFAULT_MS = 30_000;
    const MIN_MS = 5_000;
    const MAX_MS = 120_000;

    const fromGlobal = Number((globalThis as any).__nw_preset_fetch_timeout_ms);
    if (Number.isFinite(fromGlobal) && fromGlobal > 0) {
      return Math.max(MIN_MS, Math.min(MAX_MS, Math.floor(fromGlobal)));
    }

    try {
      const raw = (globalThis as any).localStorage?.getItem?.(
        "nw_preset_fetch_timeout_ms"
      );
      const fromStorage = Number(raw);
      if (Number.isFinite(fromStorage) && fromStorage > 0) {
        return Math.max(MIN_MS, Math.min(MAX_MS, Math.floor(fromStorage)));
      }
    } catch {
      // ignore
    }

    return DEFAULT_MS;
  }

  private isTransientPresetFetchError(error: unknown) {
    if (!(error instanceof Error)) return false;
    if (error.name === "AbortError") return true;
    const msg = String(error.message || "");
    return (
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("Load failed") ||
      msg.includes("ERR_ABORTED")
    );
  }

  private async fetchPresetText(url: string) {
    const key = String(url || "").trim();
    if (!key) throw new Error("Preset URL is empty");

    const existing = this.presetFetchInFlight.get(key);
    if (existing) return existing;

    const task = (async () => {
      const timeoutMs = this.getPresetFetchTimeoutMs();
      const attempts = 2;

      for (let attempt = 1; attempt <= attempts; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(key, {
            signal: controller.signal,
            cache: "force-cache",
          });

          clearTimeout(timeoutId); // CRITICAL: clear timeout on success

          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status}: ${response.statusText}. Verify preset path and ensure 'npm run sync:presets' has been run.`
            );
          }

          return await response.text();
        } catch (error) {
          clearTimeout(timeoutId); // CRITICAL: clear timeout on error
          if (attempt < attempts && this.isTransientPresetFetchError(error)) {
            // Small backoff so we don't immediately re-hit a congested dev server.
            await new Promise<void>((r) => setTimeout(r, 150 * attempt));
            continue;
          }

          if (error instanceof Error && error.name === "AbortError") {
            throw new Error(
              `Network timeout loading preset from ${key} (timeout=${timeoutMs}ms). You can raise it via localStorage nw_preset_fetch_timeout_ms.`
            );
          }

          if (
            error instanceof Error &&
            (String(error.message).includes("Failed to fetch") ||
              String(error.message).includes("NetworkError") ||
              String(error.message).includes("Load failed"))
          ) {
            throw new Error(
              `Network error loading preset from ${key}. Check if dev server is running and the preset file exists.`
            );
          }

          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      }

      // unreachable
      return "";
    })();

    this.presetFetchInFlight.set(key, task);
    try {
      return await task;
    } finally {
      this.presetFetchInFlight.delete(key);
    }
  }

  private rememberPresetText(url: string, presetText: string) {
    const key = String(url || "").trim();
    if (!key) return;
    // Move-to-end (simple LRU behavior).
    if (this.presetTextCache.has(key)) this.presetTextCache.delete(key);
    this.presetTextCache.set(key, presetText);
    while (this.presetTextCache.size > ProjectMEngine.PRESET_TEXT_CACHE_LIMIT) {
      const oldestKey = this.presetTextCache.keys().next().value as
        | string
        | undefined;
      if (!oldestKey) break;
      this.presetTextCache.delete(oldestKey);
    }
  }

  private getCachedPresetText(url: string) {
    const key = String(url || "").trim();
    if (!key) return null;
    const cached = this.presetTextCache.get(key);
    if (cached == null) return null;
    // Move-to-end.
    this.presetTextCache.delete(key);
    this.presetTextCache.set(key, cached);
    return cached;
  }

  private async yieldToBrowser() {
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(() => resolve(), 0);
      }
    });
  }

  private resolveTargetDpr() {
    const raw = Number(window.devicePixelRatio || 1);
    const base = Number.isFinite(raw) && raw > 0 ? raw : 1;
    if (this.dprCap == null) return Math.max(0.5, base);
    return Math.max(0.5, Math.min(base, this.dprCap));
  }
  private avgLumaIntervalMs = 500;
  private avgLumaDownsampleSize = 8;
  private avgLumaLastSampleMs = 0;
  private avgLumaSampleCount = 0;
  private avgLumaCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private avgLumaCtx:
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null = null;

  private avgColorEnabled = false;
  private avgColorIntervalMs = 500;
  private avgColorDownsampleSize = 8;
  private avgColorLastSampleMs = 0;
  private avgColorSampleCount = 0;

  // Bound WASM functions
  private createFn: ((width: number, height: number) => number) | null = null;
  private destroyFn: ((ptr: number) => void) | null = null;
  private renderFn:
    | ((
        ptr: number,
        leftPtr: number,
        rightPtr: number,
        samplesPerChannel: number,
        timeSeconds: number
      ) => void)
    | null = null;
  private resizeFn:
    | ((ptr: number, width: number, height: number) => void)
    | null = null;
  private loadPresetFn:
    | ((ptr: number, heapPtr: number, length: number) => void)
    | null = null;

  constructor(width: number, height: number, opts: ProjectMEngineOptions = {}) {
    this.targetWidth = width;
    this.targetHeight = height;
    this.statsKey =
      typeof opts.statsKey === "string" && opts.statsKey.trim()
        ? opts.statsKey.trim()
        : null;

    const enabled = Boolean(opts.avgLumaSampling?.enabled);
    this.avgLumaEnabled = enabled;
    if (enabled) {
      const rawInterval = Number(opts.avgLumaSampling?.intervalMs);
      const rawSize = Number(opts.avgLumaSampling?.downsampleSize);
      if (Number.isFinite(rawInterval) && rawInterval > 0) {
        this.avgLumaIntervalMs = Math.max(
          100,
          Math.min(5000, Math.floor(rawInterval))
        );
      }
      if (Number.isFinite(rawSize) && rawSize >= 2) {
        this.avgLumaDownsampleSize = Math.max(
          2,
          Math.min(64, Math.floor(rawSize))
        );
      }
    }

    const colorEnabled = Boolean(opts.avgColorSampling?.enabled);
    this.avgColorEnabled = colorEnabled;
    if (colorEnabled) {
      const rawInterval = Number(opts.avgColorSampling?.intervalMs);
      const rawSize = Number(opts.avgColorSampling?.downsampleSize);
      if (Number.isFinite(rawInterval) && rawInterval > 0) {
        this.avgColorIntervalMs = Math.max(
          100,
          Math.min(5000, Math.floor(rawInterval))
        );
      }
      if (Number.isFinite(rawSize) && rawSize >= 2) {
        this.avgColorDownsampleSize = Math.max(
          2,
          Math.min(64, Math.floor(rawSize))
        );
      }
    }

    const rawDprCap = Number(opts.dprCap);
    this.dprCap =
      Number.isFinite(rawDprCap) && rawDprCap > 0
        ? Math.max(0.5, Math.min(2, rawDprCap))
        : null;

    this.canvas = document.createElement("canvas");
    // Don't set canvas.width/height here - will be set in init() with DPR
    // Use the id expected by Emscripten HTML5 helpers so that mouse/touch
    // callbacks can attach without spamming console errors.
    this.canvas.id = "canvas";
    // Keep it attached but off-screen.
    this.canvas.style.position = "absolute";
    this.canvas.style.left = "-9999px";
    this.canvas.style.top = "0";
    this.canvas.style.pointerEvents = "none";

    // Ensure a stable verify shape even before init() completes.
    const existing = (globalThis as any).__projectm_verify ?? {};
    (globalThis as any).__projectm_verify = {
      ...existing,
      perPm: { ...(existing.perPm ?? {}) },
      initialized: false,
      framesRendered: 0,
      lastAudioRms: 0,
      lastAudioPeak: 0,
      aborted: false,
      abortReason: null,
    };
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  setTimeScale(scale: number) {
    const v = Number(scale);
    // Keep it bounded; this affects only the timeSeconds passed to the renderer.
    this.timeScale = Number.isFinite(v) ? Math.min(3, Math.max(0.25, v)) : 1;
  }

  isFailed(): boolean {
    return Boolean(this.failed);
  }

  getLastRenderError() {
    return this.lastRenderError;
  }

  async init() {
    // Ensure the canvas is present in the DOM before initializing WASM
    if (!document.body.contains(this.canvas)) {
      document.body.appendChild(this.canvas);
    }

    // CRITICAL: Read DPR before Emscripten initialization
    this.targetDpr = this.resolveTargetDpr();

    await this.ensureWasmScript();

    if (typeof window.createProjectMModule !== "function") {
      throw new Error(
        "createProjectMModule is not available after loading script."
      );
    }

    this.module = await window.createProjectMModule({
      canvas: this.canvas,
      locateFile: (path: string) => `${RUNTIME_BASE_PATH}/${path}`,
      // Emscripten routes many non-fatal diagnostics through stderr.
      // Keep them visible but avoid tripping console error-based health checks.
      printErr: (text: string) => console.warn(String(text)),
      print: (text: string) => console.log(String(text)),
      onAbort: (what: unknown) => {
        const reason = formatAbortReason(what);
        this.failed = true;
        console.warn("[ProjectMEngine] WASM abort:", reason);
        (globalThis as any).__projectm_verify = {
          ...(globalThis as any).__projectm_verify,
          aborted: true,
          abortReason: reason,
          initialized: false,
        };
      },
    });

    // Best-effort: discover WASM memory early so audio copy can avoid touching Module.HEAP*
    // in runtimes that intentionally trap such access.
    this.wasmMemory = this.tryGetWasmMemory(this.module);

    if (!this.module.cwrap) {
      throw new Error("ProjectM module missing cwrap");
    }

    const cwrap: Cwrap = this.module.cwrap.bind(this.module);

    // pm_create_default(width, height) -> instancePtr
    this.createFn = cwrap("pm_create_default", "number", ["number", "number"]);
    if (typeof this.createFn !== "function") {
      throw new Error("pm_create_default not available");
    }

    // pm_destroy(instancePtr)
    this.destroyFn = cwrap("pm_destroy", null, ["number"]);

    // pm_render_frame signature from wasm exports:
    //   (i32, i32, i32, i32, f64) -> ()
    // Mapped as: pm_render_frame(instancePtr, leftPtr, rightPtr, samplesPerChannel, timeSeconds)
    this.renderFn = cwrap("pm_render_frame", null, [
      "number",
      "number",
      "number",
      "number",
      "number",
    ]);
    if (typeof this.renderFn !== "function") {
      throw new Error("pm_render_frame not available");
    }

    // pm_resize(instancePtr, width, height)
    this.resizeFn = cwrap("pm_resize", null, ["number", "number", "number"]);

    // pm_load_preset(instancePtr, dataPtr, length)
    this.loadPresetFn = cwrap("pm_load_preset", "number", [
      "number",
      "number",
      "number",
    ]);

    // Allocate audio buffers in WASM memory (separate L/R arrays)
    const bytesPerSample = 4; // float32
    const bytesPerChannel = this.audioSampleCount * bytesPerSample;
    this.audioLeftPtr = this.module._malloc(bytesPerChannel);
    this.audioRightPtr = this.module._malloc(bytesPerChannel);
    this.audioLeft = new Float32Array(this.audioSampleCount);
    this.audioRight = new Float32Array(this.audioSampleCount);
    console.log(
      `✅ Audio buffers allocated: ${this.audioSampleCount} samples/channel, leftPtr=${this.audioLeftPtr}, rightPtr=${this.audioRightPtr}`
    );

    // Pass CSS dimensions to pm_create_default
    console.log(
      `🔧 Pre-create: CSS=${this.targetWidth}x${this.targetHeight} dpr=${this.targetDpr}`
    );

    this.instancePtr = this.createFn(this.targetWidth, this.targetHeight);
    if (!this.instancePtr || this.instancePtr <= 0) {
      throw new Error("Failed to create ProjectM instance");
    }

    this.timeBaseMs = performance.now();

    (globalThis as any).__projectm_verify = {
      ...(globalThis as any).__projectm_verify,
      initialized: true,
      framesRendered: 0,
      lastRenderTimeMs: 0,
      avgLumaEnabled: this.avgLumaEnabled,
      lastAudioRms: (globalThis as any).__projectm_verify?.lastAudioRms ?? 0,
      lastAudioPeak: (globalThis as any).__projectm_verify?.lastAudioPeak ?? 0,
    };

    // CRITICAL: Lock canvas to target physical pixels IMMEDIATELY after creation
    // Emscripten will have set some size, but we must override and lock it
    const physicalW = Math.round(this.targetWidth * this.targetDpr);
    const physicalH = Math.round(this.targetHeight * this.targetDpr);

    this.lockCanvasSize(physicalW, physicalH);
    console.log(
      `🔒 Canvas locked: ${this.canvas.width}x${this.canvas.height} (target: ${physicalW}x${physicalH})`
    );

    this.mountCanvas();

    // Sync ProjectM viewport to match our pre-set canvas framebuffer
    this.scheduleViewportSync("init");
    console.log(
      `✅ ProjectM initialized: target(CSS)=${this.targetWidth}x${this.targetHeight}, canvas now ${this.canvas.width}x${this.canvas.height}`
    );

    console.log("✅ ProjectM initialized with instance:", this.instancePtr);
  }

  async loadPresetFromUrl(url: string) {
    if (this.failed) return;
    if (!this.module || !this.instancePtr || !this.loadPresetFn) return;

    const t0 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const token = ++this.presetLoadSeq;
    const normalizedUrl = String(url || "").trim();
    this.recordPresetLoadMetric({
      token,
      url: normalizedUrl,
      cache: "na",
      tStartMs: t0,
    });

    try {
      const cached = this.getCachedPresetText(url);
      if (cached != null) {
        const tYield0 =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        // Let status/UI paint before we do the heavy WASM work.
        await this.yieldToBrowser();
        const tYield1 =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const tApply0 =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        this.loadPresetData(cached);
        const tApply1 =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const tEnd =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        this.pendingPresetFirstFrame = {
          token,
          url: normalizedUrl,
          applyEndMs: tApply1,
        };
        this.recordPresetLoadMetric({
          token,
          url: normalizedUrl,
          cache: "hit",
          yieldMs: Math.max(0, tYield1 - tYield0),
          applyMs: Math.max(0, tApply1 - tApply0),
          totalMs: Math.max(0, tEnd - t0),
          tApplyEndMs: tApply1,
          tEndMs: tEnd,
        });
        return;
      }

      const tFetch0 =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const presetData = await this.fetchPresetText(url);
      const tFetch1 =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      this.rememberPresetText(url, presetData);

      const tYield0 =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      // Let status/UI paint before we do the heavy WASM work.
      await this.yieldToBrowser();
      const tYield1 =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      const tApply0 =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      this.loadPresetData(presetData);
      const tApply1 =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      const tEnd =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      this.pendingPresetFirstFrame = {
        token,
        url: normalizedUrl,
        applyEndMs: tApply1,
      };
      this.recordPresetLoadMetric({
        token,
        url: normalizedUrl,
        cache: "miss",
        fetchMs: Math.max(0, tFetch1 - tFetch0),
        yieldMs: Math.max(0, tYield1 - tYield0),
        applyMs: Math.max(0, tApply1 - tApply0),
        totalMs: Math.max(0, tEnd - t0),
        tApplyEndMs: tApply1,
        tEndMs: tEnd,
      });
    } catch (error) {
      const tEnd =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      this.recordPresetLoadMetric({
        token,
        url: normalizedUrl,
        outcome: "error",
        totalMs: Math.max(0, tEnd - t0),
        tEndMs: tEnd,
        errorText: (() => {
          try {
            const e = error as any;
            return typeof e?.message === "string" ? e.message : String(error);
          } catch {
            return "";
          }
        })(),
      });
      throw error;
    }
  }

  loadPresetData(presetData: string) {
    if (this.failed) {
      console.warn("ProjectM engine failed; preset load ignored");
      return;
    }
    if (!this.module || !this.instancePtr || !this.loadPresetFn) {
      console.warn("ProjectM not ready for preset loading");
      return;
    }

    let heapPtr = 0;
    try {
      // Use Emscripten string helpers instead of touching HEAPU8,
      // which is not exported in this runtime.
      const byteLength = this.module.lengthBytesUTF8(presetData) + 1; // +1 for null terminator
      heapPtr = this.module._malloc(byteLength);

      if (!heapPtr) {
        throw new Error("Failed to allocate memory for preset");
      }

      this.module.stringToUTF8(presetData, heapPtr, byteLength);

      // Length argument excludes the null terminator.
      this.loadPresetFn(this.instancePtr, heapPtr, byteLength - 1);

      console.log("✅ Preset loaded successfully");
    } catch (error) {
      const message = String((error as any)?.message ?? error);
      console.warn("Failed to load preset data:", error);
      if (
        message.includes("Aborted") ||
        message.includes("exception catching is not enabled")
      ) {
        this.failed = true;
      }
      throw error;
    } finally {
      if (heapPtr) {
        try {
          this.module?._free(heapPtr);
        } catch {
          // ignore
        }
      }
    }
  }

  addAudioData(pcmData: Float32Array) {
    if (!this.audioLeft || !this.audioRight) return;

    // Audio feeding for this WASM build is done via pm_render_frame.
    // Based on the exported signature (i32, i32, i32, i32, f64), we treat inputs as:
    //   leftPtr, rightPtr, samplesPerChannel, timeSeconds
    // and we provide separate float32 arrays for L/R, with samplesPerChannel=512.
    // WebAudio AnalyserNode gives mono time-domain data; convert to stereo and
    // shape it to improve beat/energy detection (electronic music tends to benefit
    // from transient emphasis + auto-gain).

    const src = pcmData;
    const srcLen = src?.length ?? 0;
    const target = this.audioSampleCount;
    const left = this.audioLeft;
    const right = this.audioRight;

    if (!srcLen) {
      left.fill(0);
      right.fill(0);
      return;
    }

    // 1) Resample mono waveform to exactly 512 samples.
    const step = srcLen / target;
    let prevX = 0;
    let rmsAcc = 0;
    let peak = 0;

    // 2) Transient emphasis (simple pre-emphasis high-pass) + stats.
    //    y[n] = x[n] - a*x[n-1]
    const a = 0.97;

    // First pass: compute emphasized samples into left[] temporarily.
    for (let i = 0; i < target; i++) {
      const idx = Math.min(srcLen - 1, Math.max(0, Math.floor(i * step)));
      const x = src[idx] ?? 0;
      const y = x - a * prevX;
      prevX = x;

      const ay = Math.abs(y);
      if (ay > peak) peak = ay;
      rmsAcc += y * y;

      left[i] = y;
    }

    const rms = Math.sqrt(rmsAcc / target);
    // 3) Auto-gain toward a target RMS, clamped to avoid pumping.
    //    Electronic tracks can be heavily mastered; analyser output can still be small.
    const targetRms = 0.2;
    const gain = Math.max(0.8, Math.min(5.5, targetRms / Math.max(1e-6, rms)));

    // 4) Soft clip (tanh) to keep boosted transients bounded.
    //    Use a slightly stronger drive when peak is small.
    const drive = peak < 0.18 ? 1.55 : 1.25;

    for (let i = 0; i < target; i++) {
      const raw = left[i] * gain * drive;
      const clipped = Math.tanh(raw);
      left[i] = clipped;
      right[i] = clipped;
    }

    // Expose lightweight diagnostics for manual tuning.
    (globalThis as any).__projectm_verify = {
      ...(globalThis as any).__projectm_verify,
      lastAudioRms: rms,
      lastAudioPeak: peak,
      lastAudioGain: gain,
    };
  }

  render(): boolean {
    if (this.failed) return false;
    if (!this.module || !this.instancePtr || !this.renderFn) return false;

    try {
      // Copy audio into WASM memory (separate L/R float32 arrays) and render.
      let leftPtr = 0;
      let rightPtr = 0;
      let samplesPerChannel = 0;

      let audioCopyOk = false;

      if (
        this.audioLeftPtr &&
        this.audioRightPtr &&
        this.audioLeft &&
        this.audioRight
      ) {
        leftPtr = this.audioLeftPtr;
        rightPtr = this.audioRightPtr;
        samplesPerChannel = this.audioLeft.length;

        // Some builds intentionally abort when accessing Module.HEAP* views.
        // Prefer writing through WebAssembly.Memory if available.
        const heap = this.getHeapF32View();
        if (heap) {
          heap.set(this.audioLeft, leftPtr >>> 2);
          heap.set(this.audioRight, rightPtr >>> 2);
          audioCopyOk = true;
        } else {
          // If we can't copy audio safely, still render time-based animation.
          // Do NOT touch Module.HEAP* here: some runtimes install aborting getters.
          leftPtr = 0;
          rightPtr = 0;
          samplesPerChannel = 0;
          audioCopyOk = false;
        }
      }

      const nowMs = performance.now();
      const timeSeconds = ((nowMs - this.timeBaseMs) / 1000) * this.timeScale;
      this.renderFn(
        this.instancePtr,
        leftPtr,
        rightPtr,
        samplesPerChannel,
        timeSeconds
      );

      this.maybeSampleAvgLuma(nowMs);
      this.maybeSampleAvgColor(nowMs);

      this.framesRendered++;

      // B4: first-frame latency after a preset load.
      if (this.pendingPresetFirstFrame) {
        const pending = this.pendingPresetFirstFrame;
        this.pendingPresetFirstFrame = null;
        const firstFrameMs = nowMs;
        this.recordPresetLoadMetric({
          token: pending.token,
          url: pending.url,
          firstFrameMs,
          applyToFirstFrameMs: Math.max(0, firstFrameMs - pending.applyEndMs),
        });
      }

      (globalThis as any).__projectm_verify = {
        ...(globalThis as any).__projectm_verify,
        framesRendered: this.framesRendered,
        lastRenderTimeMs: nowMs,
        lastAudioSamplesPerChannel: samplesPerChannel,
        lastAudioLeftPtr: leftPtr,
        lastAudioRightPtr: rightPtr,
        lastAudioCopyOk: audioCopyOk,
      };
      return true;
    } catch (error) {
      this.lastRenderError = error;
      console.warn("Failed to render frame:", error);
      this.failed = true;
      return false;
    }
  }

  private tryGetWasmMemory(module: unknown): WebAssembly.Memory | null {
    if (!module || typeof module !== "object") return null;
    const mod = module as Record<string, unknown>;

    const readValueOnly = (obj: Record<string, unknown>, key: string) => {
      try {
        const desc = Object.getOwnPropertyDescriptor(obj, key);
        if (!desc) return undefined;
        // Never invoke getters here: some Emscripten builds install aborting getters
        // for non-exported runtime methods (e.g. wasmMemory/wasmExports/HEAP*).
        if ("value" in desc) return (desc as any).value;
      } catch {
        // ignore
      }
      return undefined;
    };

    // 0) Scan own properties for a direct WebAssembly.Memory value.
    // This avoids touching any aborting getters.
    try {
      for (const key of Object.getOwnPropertyNames(mod)) {
        const v = readValueOnly(mod, key);
        if (v instanceof WebAssembly.Memory) return v;
      }
    } catch {
      // ignore
    }

    const directCandidates = ["wasmMemory", "memory"] as const;
    for (const key of directCandidates) {
      const v = readValueOnly(mod, key);
      if (v instanceof WebAssembly.Memory) return v;
    }

    // Common Emscripten shapes: Module.asm.memory, Module.wasmInstance.exports.memory
    try {
      const asm = readValueOnly(mod, "asm");
      if (asm && typeof asm === "object") {
        const mem = readValueOnly(asm as any, "memory");
        if (mem instanceof WebAssembly.Memory) return mem;
      }
    } catch {
      // ignore
    }

    try {
      const inst = readValueOnly(mod, "wasmInstance");
      if (inst && typeof inst === "object") {
        const exportsObj = readValueOnly(inst as any, "exports");
        if (exportsObj && typeof exportsObj === "object") {
          const mem = readValueOnly(exportsObj as any, "memory");
          if (mem instanceof WebAssembly.Memory) return mem;
        }
      }
    } catch {
      // ignore
    }

    return null;
  }

  private getHeapF32View(): Float32Array | null {
    if (!this.wasmMemory && this.module) {
      this.wasmMemory = this.tryGetWasmMemory(this.module);
    }
    const mem = this.wasmMemory;
    if (!mem) return null;
    const buf = mem.buffer;
    if (this.heapF32 && this.heapF32Buffer === buf) {
      return this.heapF32;
    }
    this.heapF32 = new Float32Array(buf);
    this.heapF32Buffer = buf;
    return this.heapF32;
  }

  private ensureAvgLumaSampler() {
    if (this.avgLumaCtx && this.avgLumaCanvas) return;
    const size = this.avgLumaDownsampleSize;

    if (typeof (globalThis as any).OffscreenCanvas === "function") {
      const c = new (globalThis as any).OffscreenCanvas(
        size,
        size
      ) as OffscreenCanvas;
      const ctx = c.getContext("2d", {
        willReadFrequently: true,
      }) as OffscreenCanvasRenderingContext2D | null;
      this.avgLumaCanvas = c;
      this.avgLumaCtx = ctx;
      return;
    }

    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d", {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D | null;
    this.avgLumaCanvas = c;
    this.avgLumaCtx = ctx;
  }

  private maybeSampleAvgLuma(nowMs: number) {
    if (!this.avgLumaEnabled) return;
    if (nowMs - this.avgLumaLastSampleMs < this.avgLumaIntervalMs) return;
    this.avgLumaLastSampleMs = nowMs;

    try {
      this.ensureAvgLumaSampler();
      const ctx = this.avgLumaCtx;
      if (!ctx) return;

      const size = this.avgLumaDownsampleSize;
      // Keep sampler canvas in sync in case size changed.
      if (this.avgLumaCanvas) {
        (this.avgLumaCanvas as any).width = size;
        (this.avgLumaCanvas as any).height = size;
      }

      (ctx as any).drawImage(this.canvas, 0, 0, size, size);
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
      this.avgLumaSampleCount++;

      const root = (globalThis as any).__projectm_verify ?? {};
      const perPm = { ...(root.perPm ?? {}) };
      if (this.statsKey) {
        perPm[this.statsKey] = {
          ...(perPm[this.statsKey] ?? {}),
          avgLumaEnabled: true,
          avgLuma,
          avgLumaLastSampleMs: nowMs,
          avgLumaSampleCount: this.avgLumaSampleCount,
          avgLumaDownsampleSize: this.avgLumaDownsampleSize,
          avgLumaIntervalMs: this.avgLumaIntervalMs,
        };
      }
      const writeRoot = !this.statsKey || this.statsKey === "fg";
      (globalThis as any).__projectm_verify = {
        ...root,
        ...(writeRoot
          ? {
              avgLumaEnabled: true,
              avgLuma,
              avgLumaLastSampleMs: nowMs,
              avgLumaSampleCount: this.avgLumaSampleCount,
              avgLumaDownsampleSize: this.avgLumaDownsampleSize,
              avgLumaIntervalMs: this.avgLumaIntervalMs,
            }
          : {}),
        perPm,
      };
    } catch {
      // Never fail rendering due to diagnostics.
    }
  }

  private maybeSampleAvgColor(nowMs: number) {
    if (!this.avgColorEnabled) return;
    if (nowMs - this.avgColorLastSampleMs < this.avgColorIntervalMs) return;
    this.avgColorLastSampleMs = nowMs;

    try {
      this.ensureAvgLumaSampler();
      const ctx = this.avgLumaCtx;
      if (!ctx) return;

      const size = this.avgColorDownsampleSize;
      // Keep sampler canvas in sync in case size changed.
      if (this.avgLumaCanvas) {
        (this.avgLumaCanvas as any).width = size;
        (this.avgLumaCanvas as any).height = size;
      }

      (ctx as any).drawImage(this.canvas, 0, 0, size, size);
      const image = (ctx as any).getImageData(0, 0, size, size) as ImageData;
      const data = image.data;
      const n = size * size;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let i = 0; i < data.length; i += 4) {
        sumR += data[i] ?? 0;
        sumG += data[i + 1] ?? 0;
        sumB += data[i + 2] ?? 0;
      }
      const inv = n ? 1 / (n * 255) : 0;
      const avgR = sumR * inv;
      const avgG = sumG * inv;
      const avgB = sumB * inv;
      this.avgColorSampleCount++;

      const root = (globalThis as any).__projectm_verify ?? {};
      const perPm = { ...(root.perPm ?? {}) };
      if (this.statsKey) {
        perPm[this.statsKey] = {
          ...(perPm[this.statsKey] ?? {}),
          avgColorEnabled: true,
          avgColorR: avgR,
          avgColorG: avgG,
          avgColorB: avgB,
          avgColorLastSampleMs: nowMs,
          avgColorSampleCount: this.avgColorSampleCount,
          avgColorDownsampleSize: this.avgColorDownsampleSize,
          avgColorIntervalMs: this.avgColorIntervalMs,
        };
      }
      const writeRoot = !this.statsKey || this.statsKey === "fg";
      (globalThis as any).__projectm_verify = {
        ...root,
        ...(writeRoot
          ? {
              avgColorEnabled: true,
              avgColorR: avgR,
              avgColorG: avgG,
              avgColorB: avgB,
              avgColorLastSampleMs: nowMs,
              avgColorSampleCount: this.avgColorSampleCount,
              avgColorDownsampleSize: this.avgColorDownsampleSize,
              avgColorIntervalMs: this.avgColorIntervalMs,
            }
          : {}),
        perPm,
      };
    } catch {
      // Never fail rendering due to diagnostics.
    }
  }

  setWindowSize(width: number, height: number) {
    if (!this.module || !this.instancePtr) return;

    this.targetWidth = width;
    this.targetHeight = height;
    this.targetDpr = this.resolveTargetDpr();

    // CRITICAL: Unlock, resize, and re-lock canvas to prevent Emscripten interference
    const physicalW = Math.round(width * this.targetDpr);
    const physicalH = Math.round(height * this.targetDpr);

    this.unlockAndSetCanvasSize(physicalW, physicalH);

    console.log(
      `[ProjectMEngine] setWindowSize: target(CSS)=${width}x${height}, dpr=${this.targetDpr}, canvas locked to ${physicalW}x${physicalH}`
    );

    this.scheduleViewportSync("resize");
  }

  setDprCap(cap: number | null) {
    const raw = Number(cap);
    const next =
      Number.isFinite(raw) && raw > 0 ? Math.max(0.5, Math.min(2, raw)) : null;
    if (next == null && this.dprCap == null) return;
    if (next != null && this.dprCap != null) {
      if (Math.abs(next - this.dprCap) < 1e-3) return;
    }
    this.dprCap = next;
    const nextDpr = this.resolveTargetDpr();
    if (Math.abs(nextDpr - this.targetDpr) < 1e-3) return;
    this.targetDpr = nextDpr;
    if (!this.module || !this.instancePtr) return;
    const physicalW = Math.round(this.targetWidth * this.targetDpr);
    const physicalH = Math.round(this.targetHeight * this.targetDpr);
    this.unlockAndSetCanvasSize(physicalW, physicalH);
    this.scheduleViewportSync("dprCap");
  }

  private scheduleViewportSync(reason: string) {
    this.syncViewport(`${reason}/now`);
    requestAnimationFrame(() => this.syncViewport(`${reason}/raf1`));
    // Some browsers apply DPR scaling asynchronously a tick later.
    setTimeout(() => this.syncViewport(`${reason}/t100`), 100);
  }

  private syncViewport(reason: string) {
    if (!this.resizeFn || !this.instancePtr) return;
    try {
      // CRITICAL: Use the actual canvas framebuffer size (which we control now)
      const fbW = Math.max(1, Math.round(this.canvas.width));
      const fbH = Math.max(1, Math.round(this.canvas.height));

      // Tell ProjectM to match the canvas framebuffer exactly
      this.resizeFn(this.instancePtr, fbW, fbH);

      console.log(
        `[ProjectMEngine] syncViewport(${reason}): pm_resize(${this.instancePtr}, ${fbW}, ${fbH}) CSS=${this.targetWidth}x${this.targetHeight} dpr=${this.targetDpr}`
      );
    } catch (error) {
      console.warn("[ProjectMEngine] syncViewport failed:", error);
    }
  }

  dispose() {
    if (this.module && this.instancePtr && this.destroyFn) {
      try {
        this.destroyFn(this.instancePtr);
      } catch (error) {
        console.warn("Failed to destroy ProjectM instance:", error);
      }
      this.instancePtr = null;
    }

    // Free audio buffers
    if (this.module && this.audioLeftPtr) {
      this.module._free(this.audioLeftPtr);
      this.audioLeftPtr = 0;
    }
    if (this.module && this.audioRightPtr) {
      this.module._free(this.audioRightPtr);
      this.audioRightPtr = 0;
    }
    this.audioLeft = null;
    this.audioRight = null;

    if (this.canvas && this.canvas.parentElement && this.mounted) {
      this.canvas.parentElement.removeChild(this.canvas);
      this.mounted = false;
    }

    this.module = null;
    this.createFn = null;
    this.destroyFn = null;
    this.renderFn = null;
    this.resizeFn = null;
    this.loadPresetFn = null;
  }

  private lockCanvasSize(width: number, height: number) {
    // Force canvas to exact physical pixel dimensions
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${this.targetWidth}px`;
    this.canvas.style.height = `${this.targetHeight}px`;

    // Lock canvas size by overriding width/height setters
    const lockedWidth = width;
    const lockedHeight = height;

    Object.defineProperty(this.canvas, "width", {
      get: () => lockedWidth,
      set: () => {
        /* Block Emscripten from modifying */
      },
      configurable: true,
    });

    Object.defineProperty(this.canvas, "height", {
      get: () => lockedHeight,
      set: () => {
        /* Block Emscripten from modifying */
      },
      configurable: true,
    });
  }

  private unlockAndSetCanvasSize(width: number, height: number) {
    // Restore normal property descriptors
    delete (this.canvas as any).width;
    delete (this.canvas as any).height;

    // Set new size
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${this.targetWidth}px`;
    this.canvas.style.height = `${this.targetHeight}px`;

    // Re-lock with new dimensions
    this.lockCanvasSize(width, height);
  }

  private mountCanvas() {
    if (!this.mounted) {
      document.body.appendChild(this.canvas);
      this.mounted = true;
    }
  }

  private async ensureWasmScript() {
    if (!ProjectMEngine.scriptPromise) {
      ProjectMEngine.scriptPromise = new Promise<void>((resolve, reject) => {
        if (document.querySelector("script[data-projectm-wasm]")) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = `${RUNTIME_BASE_PATH}/projectm.js`;
        script.async = true;
        script.dataset.projectmWasm = "true";
        script.onload = () => resolve();
        script.onerror = () =>
          reject(new Error("Failed to load ProjectM wasm script"));
        document.head.appendChild(script);
      });
    }
    return ProjectMEngine.scriptPromise;
  }
}
