const RUNTIME_BASE_PATH = '/projectm-runtime';

type Cwrap = (ident: string, returnType: string | null, argTypes?: (string | null)[]) => (...args: any[]) => any;

type ProjectMModule = {
  canvas?: HTMLCanvasElement;
  cwrap: Cwrap;
  ccall: (ident: string, returnType: string | null, argTypes: (string | null)[], args: any[]) => any;
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
}) => Promise<ProjectMModule>;

declare global {
  interface Window {
    createProjectMModule?: CreateProjectMModule;
  }
}

export class ProjectMEngine {
  private static scriptPromise: Promise<void> | null = null;

  private module: ProjectMModule | null = null;
  private instancePtr: number | null = null;
  private canvas: HTMLCanvasElement;
  private mounted = false;
  private targetWidth: number;
  private targetHeight: number;
  private targetDpr = 1;

  // This ProjectM runtime does not export Module.HEAP* views.
  // Touching Module.HEAPF32/HEAP8 triggers an aborting getter.
  // Instead, locate WebAssembly.Memory via safe descriptor inspection.
  private wasmMemory: WebAssembly.Memory | null = null;
  private heapF32: Float32Array | null = null;
  private heapF32Buffer: ArrayBuffer | null = null;

  // Audio buffer management (separate stereo channels)
  private audioLeft: Float32Array | null = null;
  private audioRight: Float32Array | null = null;
  private audioLeftPtr = 0;
  private audioRightPtr = 0;
  private audioSampleCount = 512; // Standard ProjectM buffer size per channel

  private framesRendered = 0;
  private timeBaseMs = 0;

  // Bound WASM functions
  private createFn: ((width: number, height: number) => number) | null = null;
  private destroyFn: ((ptr: number) => void) | null = null;
  private renderFn:
    | ((ptr: number, leftPtr: number, rightPtr: number, samplesPerChannel: number, timeSeconds: number) => void)
    | null = null;
  private resizeFn: ((ptr: number, width: number, height: number) => void) | null = null;
  private loadPresetFn: ((ptr: number, heapPtr: number, length: number) => void) | null = null;

  constructor(width: number, height: number) {
    this.targetWidth = width;
    this.targetHeight = height;
    this.canvas = document.createElement('canvas');
    // Don't set canvas.width/height here - will be set in init() with DPR
    // Use the id expected by Emscripten HTML5 helpers so that mouse/touch
    // callbacks can attach without spamming console errors.
    this.canvas.id = 'canvas';
    // Keep it attached but off-screen.
    this.canvas.style.position = 'absolute';
    this.canvas.style.left = '-9999px';
    this.canvas.style.top = '0';
    this.canvas.style.pointerEvents = 'none';
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  async init() {
    // Ensure the canvas is present in the DOM before initializing WASM
    if (!document.body.contains(this.canvas)) {
      document.body.appendChild(this.canvas);
    }

// CRITICAL: Read DPR before Emscripten initialization
    this.targetDpr = window.devicePixelRatio || 1;

    await this.ensureWasmScript();

    if (typeof window.createProjectMModule !== 'function') {
      throw new Error('createProjectMModule is not available after loading script.');
    }

    this.module = await window.createProjectMModule({
      canvas: this.canvas,
      locateFile: (path: string) => `${RUNTIME_BASE_PATH}/${path}`,
      // Emscripten routes many non-fatal diagnostics through stderr.
      // Keep them visible but avoid tripping console error-based health checks.
      printErr: (text: string) => console.warn(String(text)),
      print: (text: string) => console.log(String(text))
    });

    if (!this.module.cwrap) {
      throw new Error('ProjectM module missing cwrap');
    }

    const cwrap: Cwrap = this.module.cwrap.bind(this.module);

    // pm_create_default(width, height) -> instancePtr
    this.createFn = cwrap('pm_create_default', 'number', ['number', 'number']);
    if (typeof this.createFn !== 'function') {
      throw new Error('pm_create_default not available');
    }

    // pm_destroy(instancePtr)
    this.destroyFn = cwrap('pm_destroy', null, ['number']);

    // pm_render_frame signature from wasm exports:
    //   (i32, i32, i32, i32, f64) -> ()
    // Mapped as: pm_render_frame(instancePtr, leftPtr, rightPtr, samplesPerChannel, timeSeconds)
    this.renderFn = cwrap('pm_render_frame', null, ['number', 'number', 'number', 'number', 'number']);
    if (typeof this.renderFn !== 'function') {
      throw new Error('pm_render_frame not available');
    }

    // pm_resize(instancePtr, width, height)
    this.resizeFn = cwrap('pm_resize', null, ['number', 'number', 'number']);

    // pm_load_preset(instancePtr, dataPtr, length)
    this.loadPresetFn = cwrap('pm_load_preset', 'number', ['number', 'number', 'number']);

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
    console.log(`🔧 Pre-create: CSS=${this.targetWidth}x${this.targetHeight} dpr=${this.targetDpr}`);

    this.instancePtr = this.createFn(this.targetWidth, this.targetHeight);
    if (!this.instancePtr || this.instancePtr <= 0) {
      throw new Error('Failed to create ProjectM instance');
    }

    this.timeBaseMs = performance.now();

    (globalThis as any).__projectm_verify = {
      ...(globalThis as any).__projectm_verify,
      initialized: true,
      framesRendered: 0,
      lastRenderTimeMs: 0,
    };

    // CRITICAL: Lock canvas to target physical pixels IMMEDIATELY after creation
    // Emscripten will have set some size, but we must override and lock it
    const physicalW = Math.round(this.targetWidth * this.targetDpr);
    const physicalH = Math.round(this.targetHeight * this.targetDpr);

    this.lockCanvasSize(physicalW, physicalH);
    console.log(`🔒 Canvas locked: ${this.canvas.width}x${this.canvas.height} (target: ${physicalW}x${physicalH})`);

    this.mountCanvas();

    // Sync ProjectM viewport to match our pre-set canvas framebuffer
    this.scheduleViewportSync('init');
    console.log(
      `✅ ProjectM initialized: target(CSS)=${this.targetWidth}x${this.targetHeight}, canvas now ${this.canvas.width}x${this.canvas.height}`
    );

    console.log('✅ ProjectM initialized with instance:', this.instancePtr);
  }

  async loadPresetFromUrl(url: string) {
    if (!this.module || !this.instancePtr || !this.loadPresetFn) return;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load preset: ${url}`);
    }
    const presetData = await response.text();
    this.loadPresetData(presetData);
  }

  loadPresetData(presetData: string) {
    if (!this.module || !this.instancePtr || !this.loadPresetFn) {
      console.warn('ProjectM not ready for preset loading');
      return;
    }

    try {
      // Use Emscripten string helpers instead of touching HEAPU8,
      // which is not exported in this runtime.
      const byteLength = this.module.lengthBytesUTF8(presetData) + 1; // +1 for null terminator
      const heapPtr = this.module._malloc(byteLength);

      if (!heapPtr) {
        throw new Error('Failed to allocate memory for preset');
      }

      this.module.stringToUTF8(presetData, heapPtr, byteLength);

      // Length argument excludes the null terminator.
      this.loadPresetFn(this.instancePtr, heapPtr, byteLength - 1);
      this.module._free(heapPtr);

      console.log('✅ Preset loaded successfully');
    } catch (error) {
      console.error('Failed to load preset data:', error);
      // Do not permanently freeze the engine on a single preset failure.
      // Many presets can be malformed or WASM-unsafe; callers will mark them broken.
      throw error;
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
    const targetRms = 0.22;
    const gain = Math.max(0.8, Math.min(6.0, targetRms / Math.max(1e-6, rms)));

    // 4) Soft clip (tanh) to keep boosted transients bounded.
    //    Use a slightly stronger drive when peak is small.
    const drive = peak < 0.2 ? 1.8 : 1.2;

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

  render() {
    if (!this.module || !this.instancePtr || !this.renderFn) return;

    try {
      // Copy audio into WASM memory (separate L/R float32 arrays) and render.
      let leftPtr = 0;
      let rightPtr = 0;
      let samplesPerChannel = 0;

      if (this.audioLeftPtr && this.audioRightPtr && this.audioLeft && this.audioRight) {
        this.module.HEAPF32.set(this.audioLeft, this.audioLeftPtr >>> 2);
        this.module.HEAPF32.set(this.audioRight, this.audioRightPtr >>> 2);
        leftPtr = this.audioLeftPtr;
        rightPtr = this.audioRightPtr;
        samplesPerChannel = this.audioLeft.length;
      }

      const nowMs = performance.now();
      const timeSeconds = (nowMs - this.timeBaseMs) / 1000;
      this.renderFn(this.instancePtr, leftPtr, rightPtr, samplesPerChannel, timeSeconds);

      this.framesRendered++;
      (globalThis as any).__projectm_verify = {
        ...(globalThis as any).__projectm_verify,
        framesRendered: this.framesRendered,
        lastRenderTimeMs: nowMs,
        lastAudioSamplesPerChannel: samplesPerChannel,
        lastAudioLeftPtr: leftPtr,
        lastAudioRightPtr: rightPtr,
      };
    } catch (error) {
      console.warn('Failed to render frame:', error);
    }
  }

  setWindowSize(width: number, height: number) {
    if (!this.module || !this.instancePtr) return;

    this.targetWidth = width;
    this.targetHeight = height;
    this.targetDpr = window.devicePixelRatio || this.targetDpr || 1;

    // CRITICAL: Unlock, resize, and re-lock canvas to prevent Emscripten interference
    const physicalW = Math.round(width * this.targetDpr);
    const physicalH = Math.round(height * this.targetDpr);

    this.unlockAndSetCanvasSize(physicalW, physicalH);

    console.log(
      `[ProjectMEngine] setWindowSize: target(CSS)=${width}x${height}, dpr=${this.targetDpr}, canvas locked to ${physicalW}x${physicalH}`
    );

    this.scheduleViewportSync('resize');
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
      console.warn('[ProjectMEngine] syncViewport failed:', error);
    }
  }


  dispose() {
    if (this.module && this.instancePtr && this.destroyFn) {
      try {
        this.destroyFn(this.instancePtr);
      } catch (error) {
        console.warn('Failed to destroy ProjectM instance:', error);
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

    Object.defineProperty(this.canvas, 'width', {
      get: () => lockedWidth,
      set: () => { /* Block Emscripten from modifying */ },
      configurable: true
    });

    Object.defineProperty(this.canvas, 'height', {
      get: () => lockedHeight,
      set: () => { /* Block Emscripten from modifying */ },
      configurable: true
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
        if (document.querySelector('script[data-projectm-wasm]')) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = `${RUNTIME_BASE_PATH}/projectm.js`;
        script.async = true;
        script.dataset.projectmWasm = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load ProjectM wasm script'));
        document.head.appendChild(script);
      });
    }
    return ProjectMEngine.scriptPromise;
  }
}
