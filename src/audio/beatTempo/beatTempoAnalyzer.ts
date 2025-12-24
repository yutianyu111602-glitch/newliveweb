import type { AudioFrame } from "../../types/audioFrame";
import { getNumber, isRecord } from "../../lib/guards";

export type BeatTempoSnapshot = {
  ok: boolean;
  bpm: number; // 0 when unknown
  confidence01: number; // 0..1
  stability01: number; // 0..1 (derived from BPM stability)
  beatPhase: number; // 0..1
  beatPulse: number; // 0..1
  method: "multifeature" | "degara" | "aubio";
  lastUpdatedMs: number;
  lastError?: string | null;
};

export type BeatTempoConfig = {
  enabled: boolean;
  windowSec: number;
  updateIntervalMs: number;
  minTempo: number;
  maxTempo: number;
  method: "multifeature" | "degara" | "aubio";
  inputFps: number;
};

export type BeatTempoInputOptions = {
  maxFps?: number;
};

const DEFAULT_CONFIG: BeatTempoConfig = {
  enabled: true,
  // Use a longer window for more stable BPM (user-requested 10s cache).
  windowSec: 10,
  updateIntervalMs: 250,
  minTempo: 60,
  maxTempo: 190,
  // Default to Essentia RhythmExtractor2013 for stability.
  method: "multifeature",
  inputFps: 30,
};

export function normalizeBeatTempoConfig(
  patch: Partial<BeatTempoConfig>
): BeatTempoConfig {
  const enabled = Boolean(patch.enabled ?? DEFAULT_CONFIG.enabled);
  const windowSecRaw = Number(patch.windowSec ?? DEFAULT_CONFIG.windowSec);
  const windowSec = Number.isFinite(windowSecRaw)
    ? Math.min(20, Math.max(4, windowSecRaw))
    : DEFAULT_CONFIG.windowSec;
  const updateIntervalMsRaw = Number(
    patch.updateIntervalMs ?? DEFAULT_CONFIG.updateIntervalMs
  );
  const updateIntervalMs = Number.isFinite(updateIntervalMsRaw)
    ? Math.min(5000, Math.max(250, updateIntervalMsRaw))
    : DEFAULT_CONFIG.updateIntervalMs;
  const minTempoRaw = Number(patch.minTempo ?? DEFAULT_CONFIG.minTempo);
  const minTempo = Number.isFinite(minTempoRaw)
    ? Math.min(220, Math.max(30, minTempoRaw))
    : DEFAULT_CONFIG.minTempo;
  const maxTempoRaw = Number(patch.maxTempo ?? DEFAULT_CONFIG.maxTempo);
  const maxTempo = Number.isFinite(maxTempoRaw)
    ? Math.min(260, Math.max(60, maxTempoRaw))
    : DEFAULT_CONFIG.maxTempo;
  const method =
    patch.method === "degara"
      ? "degara"
      : patch.method === "aubio"
      ? "aubio"
      : "multifeature";
  const inputFpsRaw = Number(patch.inputFps ?? DEFAULT_CONFIG.inputFps);
  const inputFps = Number.isFinite(inputFpsRaw)
    ? Math.min(60, Math.max(5, Math.round(inputFpsRaw)))
    : DEFAULT_CONFIG.inputFps;

  return {
    enabled,
    windowSec,
    updateIntervalMs,
    minTempo,
    maxTempo,
    method,
    inputFps,
  };
}

export function initBeatTempoAnalyzer(
  opts: {
    initial?: Partial<BeatTempoConfig>;
  } = {}
) {
  let config = normalizeBeatTempoConfig(opts.initial ?? {});
  let worker: Worker | null = null;
  let lastSentMs = 0;

  let snapshot: BeatTempoSnapshot = {
    ok: false,
    bpm: 0,
    confidence01: 0,
    stability01: 0,
    beatPhase: 0,
    beatPulse: 0,
    method: config.method,
    lastUpdatedMs: 0,
    lastError: null,
  };

  const ensureWorker = () => {
    if (worker) return;
    worker = new Worker(new URL("./beatTempoWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent) => {
      const data: unknown = event.data;
      if (!isRecord(data)) return;
      const msgType = typeof data.type === "string" ? data.type : "";

      if (msgType === "result") {
        snapshot = {
          ok: Boolean((data as Record<string, unknown>).ok),
          bpm: Math.max(0, getNumber(data, "bpm", 0)),
          confidence01: Math.max(
            0,
            Math.min(1, getNumber(data, "confidence01", 0))
          ),
          stability01: Math.max(
            0,
            Math.min(1, getNumber(data, "stability01", 0))
          ),
          beatPhase: Math.max(0, Math.min(1, getNumber(data, "beatPhase", 0))),
          beatPulse: Math.max(0, Math.min(1, getNumber(data, "beatPulse", 0))),
          method:
            data.method === "degara"
              ? "degara"
              : data.method === "aubio"
              ? "aubio"
              : "multifeature",
          lastUpdatedMs:
            typeof performance !== "undefined" ? performance.now() : Date.now(),
          lastError: null,
        };

        // 动态调整更新间隔：根据 worker 的建议
        const suggestedIntervalMs = getNumber(data, "suggestedUpdateIntervalMs", 0);
        if (suggestedIntervalMs > 0) {
          const currentInterval = config.updateIntervalMs;
          // 避免频繁调整，至少相差 100ms 才更新
          if (Math.abs(currentInterval - suggestedIntervalMs) > 100) {
            config.updateIntervalMs = suggestedIntervalMs;
            // 不需要重新 postConfig，worker 会在下次分析时自然应用新间隔
            // 因为间隔检查在 worker 内部（nowMs - lastAnalysisMs < updateIntervalMs）
            postConfig();
          }
        }
      }
      if (msgType === "error") {
        snapshot = {
          ...snapshot,
          ok: false,
          lastError: String(
            (data as Record<string, unknown>).message ?? "error"
          ),
          lastUpdatedMs:
            typeof performance !== "undefined" ? performance.now() : Date.now(),
        };
      }
    });
  };

  const postConfig = () => {
    if (!worker) return;
    worker.postMessage({
      type: "config",
      enabled: config.enabled,
      windowSec: config.windowSec,
      updateIntervalMs: config.updateIntervalMs,
      minTempo: config.minTempo,
      maxTempo: config.maxTempo,
      method: config.method,
    });
  };

  const setConfig = (patch: Partial<BeatTempoConfig>) => {
    config = normalizeBeatTempoConfig({ ...config, ...patch });
    snapshot = { ...snapshot, method: config.method };
    if (config.enabled) {
      ensureWorker();
      postConfig();
    } else {
      disposeWorker();
      snapshot = {
        ok: false,
        bpm: 0,
        confidence01: 0,
        stability01: 0,
        beatPhase: 0,
        beatPulse: 0,
        method: config.method,
        lastUpdatedMs:
          typeof performance !== "undefined" ? performance.now() : Date.now(),
        lastError: null,
      };
    }
  };

  const disposeWorker = () => {
    if (!worker) return;
    try {
      worker.terminate();
    } catch {
      // ignore
    }
    worker = null;
  };

  const onAudioFrame = (frame: AudioFrame, opts?: BeatTempoInputOptions) => {
    if (!config.enabled) {
      console.warn("[BeatTempo] onAudioFrame called but config.enabled=false");
      return;
    }
    ensureWorker();

    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const pcmForRate =
      config.method === "aubio"
        ? frame.pcm512MonoRaw ?? frame.pcm512Mono
        : frame.pcm2048MonoRaw ?? frame.pcm2048Mono;
    const sr = Number(frame.sampleRate);
    // Prefer throttling based on chunk hop time to keep the effective sample rate sane.
    // IMPORTANT: for the aubio backend, do not throttle by inputFps (it expects hop-sized
    // streaming frames). Dropping hops makes the worker see discontinuous audio, which can
    // skew tempo estimates.
    const hopMs =
      Number.isFinite(sr) && sr > 0 && pcmForRate instanceof Float32Array
        ? (pcmForRate.length / sr) * 1000
        : 0;
    const maxFpsRaw = Number(opts?.maxFps);
    const maxFps =
      Number.isFinite(maxFpsRaw) && maxFpsRaw > 0
        ? Math.min(60, Math.max(5, Math.round(maxFpsRaw)))
        : 0;
    const capIntervalMs =
      maxFps > 0 && config.method !== "aubio" ? 1000 / maxFps : 0;
    const intervalMs =
      config.method === "aubio"
        ? Math.max(0, hopMs || 0)
        : Math.max(16, hopMs || 0, 1000 / config.inputFps, capIntervalMs);
    if (nowMs - lastSentMs < intervalMs) return;
    lastSentMs = nowMs;

    const pcm = pcmForRate;
    if (!(pcm instanceof Float32Array)) {
      console.warn(
        "[BeatTempo] pcm2048Mono is not Float32Array:",
        typeof pcm,
        pcm
      );
      return;
    }

    // Debug: Log first few sends
    if (lastSentMs < 5000) {
      console.log("[BeatTempo] Sending audio to worker:", {
        sampleRate: frame.sampleRate,
        timeSec: frame.timeSec,
        pcmLength: pcm.length,
        workerExists: !!worker,
      });
    }

    worker?.postMessage({
      type: "audio",
      sampleRate: frame.sampleRate,
      timeSec: frame.timeSec,
      pcm,
    });
  };

  // Apply initial config.
  if (config.enabled) {
    ensureWorker();
    postConfig();
  }

  return {
    getConfig: () => ({ ...config }),
    setConfig,
    getSnapshot: () => snapshot,
    onAudioFrame,
    dispose: () => {
      disposeWorker();
    },
  };
}
