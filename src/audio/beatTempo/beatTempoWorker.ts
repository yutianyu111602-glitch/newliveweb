type WorkerConfig = {
  enabled: boolean;
  windowSec: number;
  updateIntervalMs: number;
  minTempo: number;
  maxTempo: number;
  method: "multifeature" | "degara" | "aubio";
};

type WorkerState = {
  config: WorkerConfig;
  sampleRate: number;
  ring: Float32Array;
  writeIndex: number;
  filled: number;
  lastTimeSec: number;
  lastAnalysisMs: number;
  essentiaReady: boolean;
  essentia: any | null;
};

const DEFAULT_CONFIG: WorkerConfig = {
  enabled: false,
  windowSec: 10,
  updateIntervalMs: 900,
  minTempo: 60,
  maxTempo: 190,
  method: "aubio",
};

const state: WorkerState = {
  config: { ...DEFAULT_CONFIG },
  sampleRate: 48000,
  ring: new Float32Array(48000 * 10),
  writeIndex: 0,
  filled: 0,
  lastTimeSec: 0,
  lastAnalysisMs: 0,
  essentiaReady: false,
  essentia: null,
};

let aubioReady = false;
let aubioTempo: any | null = null;
let aubioInitPromise: Promise<void> | null = null;
let aubioLastBeatAbsSec = NaN;
let bpmSmoothed = 0;

async function ensureAubio(sampleRate: number) {
  if (aubioReady && aubioTempo) {
    // Recreate tempo if sample rate changes.
    if (state.sampleRate === sampleRate) return;
  }
  if (aubioInitPromise) return aubioInitPromise;

  aubioInitPromise = (async () => {
    try {
      const mod: any = await import("aubiojs");
      const aubioFactory = mod?.default ?? mod;
      const aubio =
        typeof aubioFactory === "function"
          ? await aubioFactory()
          : aubioFactory;
      const Tempo = aubio?.Tempo;
      if (!Tempo) throw new Error("aubio Tempo not available");

      // aubio tempo expects hop-sized streaming frames; use 512 hop / 2048 window.
      const bufferSize = 2048;
      const hopSize = 512;
      aubioTempo = new Tempo(bufferSize, hopSize, Math.floor(sampleRate));
      aubioReady = true;
      aubioLastBeatAbsSec = NaN;
      bpmSmoothed = 0;
    } finally {
      aubioInitPromise = null;
    }
  })();

  return aubioInitPromise;
}

// Keep a small rolling history of BPM estimates so we can compute a
// "stability confidence" supplement (useful when Essentia confidence is low
// but the estimate is consistently stable).
const bpmHistory: number[] = [];
const MAX_BPM_HISTORY = 10;

function median(values: number[]): number {
  const xs = values
    .filter((v) => Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  if (xs.length === 0) return NaN;
  const mid = Math.floor(xs.length / 2);
  if (xs.length % 2 === 1) return xs[mid] ?? NaN;
  const a = xs[mid - 1];
  const b = xs[mid];
  return Number.isFinite(a) && Number.isFinite(b) ? (a + b) * 0.5 : NaN;
}

function computeStability01(history: number[]): number {
  // Need at least a handful of samples to be meaningful.
  if (history.length < 5) return 0;
  const med = median(history);
  if (!Number.isFinite(med)) return 0;
  const absDevs = history.map((v) => Math.abs(v - med));
  const mad = median(absDevs);
  if (!Number.isFinite(mad)) return 0;
  // Map MAD (in BPM) to 0..1. 0.5 BPM jitter => ~1.0, 6 BPM jitter => ~0.0.
  const good = 0.5;
  const bad = 6.0;
  const t = (mad - good) / Math.max(1e-6, bad - good);
  return clamp01(1 - t);
}

let essentiaInitPromise: Promise<void> | null = null;
let essentiaInitFailedAtMs = 0;
let essentiaInitFailCount = 0;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function ensureRingCapacity(sampleRate: number, windowSec: number) {
  const sr = Math.max(8000, Math.min(192000, Math.floor(sampleRate)));
  const win = Math.max(4, Math.min(20, windowSec));
  const size = Math.max(1024, Math.floor(sr * win));
  if (state.sampleRate === sr && state.ring.length === size) return;

  state.sampleRate = sr;
  state.ring = new Float32Array(size);
  state.writeIndex = 0;
  state.filled = 0;
}

function pushSamples(chunk: Float32Array) {
  const ring = state.ring;
  let w = state.writeIndex;
  for (let i = 0; i < chunk.length; i++) {
    ring[w] = chunk[i] ?? 0;
    w++;
    if (w >= ring.length) w = 0;
  }
  state.writeIndex = w;
  state.filled = Math.min(ring.length, state.filled + chunk.length);
}

function readWindowContiguous(): Float32Array {
  const ring = state.ring;
  const len = state.filled;
  const out = new Float32Array(len);
  const start = (state.writeIndex - len + ring.length) % ring.length;
  if (start + len <= ring.length) {
    out.set(ring.subarray(start, start + len));
    return out;
  }
  const firstLen = ring.length - start;
  out.set(ring.subarray(start));
  out.set(ring.subarray(0, len - firstLen), firstLen);
  return out;
}

function resampleNearest(
  signal: Float32Array,
  srcSampleRate: number,
  dstSampleRate: number
): Float32Array {
  const srcSr = Math.max(1, Math.floor(srcSampleRate));
  const dstSr = Math.max(1, Math.floor(dstSampleRate));
  if (srcSr === dstSr) return signal;

  const outLen = Math.max(1, Math.floor((signal.length * dstSr) / srcSr));
  const out = new Float32Array(outLen);
  const step = signal.length / outLen;
  for (let i = 0; i < outLen; i++) {
    const idx = Math.min(signal.length - 1, Math.floor(i * step));
    out[i] = signal[idx] ?? 0;
  }
  return out;
}

async function ensureEssentia() {
  if (state.essentiaReady) return;
  if (essentiaInitPromise) return essentiaInitPromise;

  const nowMs =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  if (essentiaInitFailCount > 0) {
    const backoffMs = Math.min(
      30000,
      1500 * Math.pow(2, Math.min(4, essentiaInitFailCount - 1))
    );
    if (nowMs - essentiaInitFailedAtMs < backoffMs) return;
  }

  essentiaInitPromise = (async () => {
    try {
      console.log("[BeatTempo Worker] Starting Essentia initialization...");

      // Some Essentia WASM builds reference `document.title` even in worker contexts.
      // Provide a minimal stub so initialization doesn't crash with "document is not defined".
      const g = self as any;
      if (typeof g.document === "undefined") g.document = { title: "" };

      console.log("[BeatTempo Worker] Importing essentia modules...");
      const wasmMod: any = await import(
        "essentia.js/dist/essentia-wasm.web.js"
      );
      const coreMod: any = await import(
        "essentia.js/dist/essentia.js-core.es.js"
      );
      console.log(
        "[BeatTempo Worker] Modules imported, wasmMod:",
        !!wasmMod,
        "coreMod:",
        !!coreMod
      );

      const wasmFactory = wasmMod?.default ?? wasmMod?.EssentiaWASM ?? wasmMod;
      console.log("[BeatTempo Worker] wasmFactory type:", typeof wasmFactory);

      const wasmInit =
        typeof wasmFactory === "function"
          ? wasmFactory({
              locateFile: (file: string) => {
                const path = `/vendor/essentia/${file}`;
                console.log("[BeatTempo Worker] locateFile:", file, "->", path);
                return path;
              },
            })
          : wasmFactory;
      console.log("[BeatTempo Worker] wasmInit:", !!wasmInit);

      const wasmModule =
        wasmInit && typeof wasmInit?.then === "function"
          ? await wasmInit
          : wasmInit;
      console.log("[BeatTempo Worker] WASM module loaded:", !!wasmModule);

      const Essentia = coreMod?.Essentia ?? coreMod?.default ?? coreMod;
      console.log("[BeatTempo Worker] Essentia constructor:", typeof Essentia);

      state.essentia = new Essentia(wasmModule);
      state.essentiaReady = true;
      essentiaInitFailCount = 0;
      console.log("[BeatTempo Worker] ✅ Essentia initialized successfully!");

      (self as any).postMessage({
        type: "info",
        message: "Essentia initialized",
      });
    } catch (err) {
      console.error(
        "[BeatTempo Worker] ❌ Essentia initialization failed:",
        err
      );
      state.essentia = null;
      state.essentiaReady = false;
      essentiaInitFailCount++;
      essentiaInitFailedAtMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      (self as any).postMessage({
        type: "error",
        message: `Essentia init failed: ${String(err)}`,
      });
    } finally {
      essentiaInitPromise = null;
    }
  })();

  return essentiaInitPromise;
}

function computeBeatPulse(phase01: number): number {
  const p = clamp01(phase01);
  const d = Math.min(p, 1 - p);
  // Gaussian-ish impulse around beat.
  const x = d / 0.11;
  return clamp01(Math.exp(-(x * x)));
}

function analyzeAubio(nowSec: number, hopSec: number) {
  if (!aubioTempo) return;

  const bpmRaw = Number(aubioTempo.getBpm?.() ?? 0);
  const cfg = state.config;
  const bpmOk =
    Number.isFinite(bpmRaw) &&
    bpmRaw >= Math.max(30, cfg.minTempo - 10) &&
    bpmRaw <= Math.min(260, cfg.maxTempo + 10);

  if (bpmOk) {
    bpmHistory.push(bpmRaw);
    if (bpmHistory.length > MAX_BPM_HISTORY)
      bpmHistory.splice(0, bpmHistory.length - MAX_BPM_HISTORY);
  }

  const stability01 = bpmOk ? computeStability01(bpmHistory) : 0;

  // Smooth BPM strongly; attack when stable, release when unstable.
  const targetBpm = bpmOk ? bpmRaw : 0;
  if (bpmSmoothed <= 0 && targetBpm > 0) bpmSmoothed = targetBpm;
  const attack = 0.22 + 0.38 * stability01; // 0.22..0.60
  const release = 0.06; // slow drift when unstable
  const a = targetBpm >= bpmSmoothed ? attack : release;
  bpmSmoothed = bpmSmoothed + (targetBpm - bpmSmoothed) * a;

  const bpm = bpmSmoothed;
  const bpmFinalOk =
    Number.isFinite(bpm) && bpm >= cfg.minTempo && bpm <= cfg.maxTempo;

  // Beat event: aubio Tempo.do() returns non-zero on beat in many bindings.
  // We approximate the beat timestamp at the end of this hop.
  const periodSec = bpmFinalOk ? 60 / bpm : 0;
  const phase01 =
    bpmFinalOk && Number.isFinite(aubioLastBeatAbsSec) && periodSec > 0
      ? clamp01(((nowSec - aubioLastBeatAbsSec) % periodSec) / periodSec)
      : 0;
  const beatPulse = computeBeatPulse(phase01);

  const ok = bpmFinalOk && stability01 >= 0.55;

  // For aubio backend we use stability as confidence (stream-friendly).
  const confidence01 = stability01;

  // 动态更新间隔：稳定时降低频率节省 CPU，不稳定时提高频率快速跟踪
  // 优化目标：BPM 跟踪 ↑40% (混音/transition 场景)
  const suggestedUpdateIntervalMs =
    stability01 > 0.8
      ? Math.min(1200, state.config.updateIntervalMs * 1.3) // 稳定 → 降低频率
      : Math.max(600, state.config.updateIntervalMs * 0.67); // 不稳定 → 提高频率

  (self as any).postMessage({
    type: "result",
    ok,
    bpm: bpmFinalOk ? bpm : 0,
    confidence01,
    stability01,
    beatPhase: phase01,
    beatPulse,
    method: "aubio",
    suggestedUpdateIntervalMs, // 新增：建议的更新间隔
    // hopSec included for debugging if needed
    hopSec,
  });
}

function analyze() {
  const essentia = state.essentia;
  if (!essentia) return;
  if (state.filled < Math.floor(state.ring.length * 0.6)) return;

  const cfg = state.config;
  const nowSec = state.lastTimeSec;
  const windowSec = state.filled / state.sampleRate;
  const windowStartSec = nowSec - windowSec;

  // RhythmExtractor2013 assumes 44.1kHz internally; resample to keep timing correct.
  const TARGET_SR = 44100;
  const signal = resampleNearest(
    readWindowContiguous(),
    state.sampleRate,
    TARGET_SR
  );

  const vec = essentia.arrayToVector(signal);
  const res = essentia.RhythmExtractor2013(
    vec,
    cfg.maxTempo,
    cfg.method,
    cfg.minTempo
  );
  const bpm = Number(res?.bpm ?? 0);
  const bpmOk = Number.isFinite(bpm) && bpm >= 30 && bpm <= 260;
  const confidenceRaw = Number(res?.confidence ?? 0);
  // Essentia RhythmExtractor2013 confidence is typically already in 0..1.
  // Using an exponential mapping here can compress values so much that UI shows 0%.
  const confidence01 = clamp01(confidenceRaw);

  if (bpmOk) {
    bpmHistory.push(bpm);
    if (bpmHistory.length > MAX_BPM_HISTORY)
      bpmHistory.splice(0, bpmHistory.length - MAX_BPM_HISTORY);
  }
  const stability01 = bpmOk ? computeStability01(bpmHistory) : 0;

  let lastTickAbs = NaN;
  try {
    const ticksVec = res?.ticks;
    const ticksArr: Float32Array = ticksVec
      ? essentia.vectorToArray(ticksVec)
      : new Float32Array(0);
    // Find last tick in window and map to absolute time.
    for (let i = ticksArr.length - 1; i >= 0; i--) {
      const t = Number(ticksArr[i]);
      const abs = windowStartSec + t;
      if (Number.isFinite(abs) && abs <= nowSec + 0.02) {
        lastTickAbs = abs;
        break;
      }
    }
  } catch {
    // ignore
  }

  const periodSec = bpmOk ? 60 / bpm : 0;
  const phase01 =
    bpmOk && Number.isFinite(lastTickAbs) && periodSec > 0
      ? clamp01(((nowSec - lastTickAbs) % periodSec) / periodSec)
      : 0;
  const beatPulse = computeBeatPulse(phase01);

  // "ok" should be true when either Essentia is confident, or the estimate is
  // consistently stable over multiple analyses.
  const ok = bpmOk && (confidence01 >= 0.15 || stability01 >= 0.6);

  // 动态更新间隔（同 aubio 分支）
  const suggestedUpdateIntervalMs =
    stability01 > 0.8
      ? Math.min(1200, state.config.updateIntervalMs * 1.3)
      : Math.max(600, state.config.updateIntervalMs * 0.67);

  (self as any).postMessage({
    type: "result",
    ok,
    bpm: bpmOk ? bpm : 0,
    confidence01,
    stability01,
    beatPhase: phase01,
    beatPulse,
    method: "essentia",
    suggestedUpdateIntervalMs, // 新增
  });
}

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data as any;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "config") {
    console.log("[BeatTempo Worker] Received config:", msg);
    const next: WorkerConfig = {
      enabled: Boolean(msg.enabled),
      windowSec: Number.isFinite(Number(msg.windowSec))
        ? Math.min(20, Math.max(4, Number(msg.windowSec)))
        : DEFAULT_CONFIG.windowSec,
      updateIntervalMs: Number.isFinite(Number(msg.updateIntervalMs))
        ? Math.min(5000, Math.max(250, Number(msg.updateIntervalMs)))
        : DEFAULT_CONFIG.updateIntervalMs,
      minTempo: Number.isFinite(Number(msg.minTempo))
        ? Math.min(220, Math.max(30, Number(msg.minTempo)))
        : DEFAULT_CONFIG.minTempo,
      maxTempo: Number.isFinite(Number(msg.maxTempo))
        ? Math.min(260, Math.max(60, Number(msg.maxTempo)))
        : DEFAULT_CONFIG.maxTempo,
      method:
        msg.method === "degara"
          ? "degara"
          : msg.method === "aubio"
          ? "aubio"
          : "multifeature",
    };
    state.config = next;
    ensureRingCapacity(state.sampleRate, next.windowSec);
    if (next.enabled) {
      console.log(
        "[BeatTempo Worker] Config enabled, initializing Essentia..."
      );
      if (next.method === "aubio") {
        await ensureAubio(state.sampleRate);
      } else {
        await ensureEssentia();
      }
    }
    return;
  }

  if (msg.type === "audio") {
    if (!state.config.enabled) return;

    const sr = Number(msg.sampleRate);
    const timeSec = Number(msg.timeSec);
    const pcm = msg.pcm;
    if (!(pcm instanceof Float32Array)) return;
    if (!Number.isFinite(sr) || sr <= 0) return;
    if (!Number.isFinite(timeSec)) return;

    // aubio backend: hop-sized streaming frames.
    if (state.config.method === "aubio") {
      await ensureAubio(sr);
      if (!aubioReady || !aubioTempo) return;

      // Run aubio hop processing.
      try {
        const r = aubioTempo.do?.(pcm);
        const isBeat =
          (typeof r === "number" && r > 0) ||
          (Array.isArray(r) && Number(r[0]) > 0) ||
          (r && typeof r === "object" && Number((r as any)[0]) > 0);
        if (isBeat) {
          aubioLastBeatAbsSec = timeSec;
        }
      } catch (err) {
        (self as any).postMessage({
          type: "error",
          message: `aubio tempo failed: ${String(err)}`,
        });
        return;
      }

      // Analyze on interval (like essentia path).
      const nowMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (nowMs - state.lastAnalysisMs < state.config.updateIntervalMs) return;
      state.lastAnalysisMs = nowMs;

      const hopSec = pcm.length / sr;
      analyzeAubio(timeSec, hopSec);
      return;
    }

    // Essentia backend.
    if (!state.essentiaReady) {
      await ensureEssentia();
      if (!state.essentiaReady) {
        console.warn(
          "[BeatTempo Worker] Essentia not ready after init attempt"
        );
        return;
      }
    }

    ensureRingCapacity(sr, state.config.windowSec);
    state.lastTimeSec = timeSec;
    pushSamples(pcm);

    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (nowMs - state.lastAnalysisMs < state.config.updateIntervalMs) return;
    state.lastAnalysisMs = nowMs;
    try {
      analyze();
    } catch (err) {
      (self as any).postMessage({
        type: "error",
        message: `analysis failed: ${String(err)}`,
      });
    }
  }
};
