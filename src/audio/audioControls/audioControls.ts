import type { AudioFrame } from "../../types/audioFrame";

export type AudioControlsConfig = {
  enabled: boolean;
  mixToMacros: number; // 0..1 (how much audio-derived macros override UI macros)
  attackMs: number;
  releaseMs: number;
  maxDeltaPerSec: number;
  amounts: {
    projectm: number; // 0..1
    liquid: number; // 0..1
    basic: number; // 0..1
    camera: number; // 0..1
    video: number; // 0..1
    depth: number; // 0..1
  };
  weights: {
    fusion: { energy: number; bass: number; flux: number; beatPulse: number };
    motion: { energy: number; bass: number; flux: number; beatPulse: number };
    sparkle: { energy: number; bass: number; flux: number; beatPulse: number };
  };
};

export type AudioControlsSnapshot = {
  enabled: boolean;
  energy01: number;
  bass01: number;
  mid01: number;  // Added for frequency-specific control
  high01: number;  // Added for frequency-specific control
  flux01: number;
  beatPulse01: number;
  fusion01: number;
  motion01: number;
  sparkle01: number;
};

function clamp01(value: number, fallback = 0) {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

function expSmoothingAlpha(dtSec: number, timeConstSec: number) {
  const t = Math.max(1e-4, Number(timeConstSec));
  const dt = Math.max(0, Number(dtSec));
  return 1 - Math.exp(-dt / t);
}

function smoothAttackRelease(opts: {
  current: number;
  target: number;
  dtSec: number;
  attackSec: number;
  releaseSec: number;
  maxDeltaPerSec: number;
}) {
  const { current, target, dtSec, attackSec, releaseSec, maxDeltaPerSec } =
    opts;

  const maxDelta = Math.max(0, maxDeltaPerSec) * Math.max(0, dtSec);
  const unclampedDelta = target - current;
  const delta =
    Math.abs(unclampedDelta) <= maxDelta
      ? unclampedDelta
      : Math.sign(unclampedDelta) * maxDelta;
  const limitedTarget = current + delta;

  const tau = limitedTarget >= current ? attackSec : releaseSec;
  const alpha = expSmoothingAlpha(dtSec, tau);
  return clamp01(alpha * limitedTarget + (1 - alpha) * current, current);
}

function weightedSignal01(
  weights: Record<string, number>,
  signals: Record<string, number>
) {
  let sumW = 0;
  let sum = 0;
  for (const [key, weightRaw] of Object.entries(weights)) {
    const w = Number(weightRaw);
    if (!Number.isFinite(w) || w <= 0) continue;
    const x = clamp01(Number(signals[key] ?? 0), 0);
    sumW += w;
    sum += w * x;
  }
  if (!sumW) return 0;
  return clamp01(sum / sumW, 0);
}

function signalToMacro01(x01: number) {
  // Keep "no audio" near the neutral macro value (0.5).
  return clamp01(0.5 + 0.5 * clamp01(x01, 0), 0.5);
}

export function createAudioControls(initial?: Partial<AudioControlsConfig>): {
  getConfig: () => AudioControlsConfig;
  setConfig: (patch: Partial<AudioControlsConfig>) => void;
  reset: () => void;
  onAudioFrame: (frame: AudioFrame, timeMs?: number) => AudioControlsSnapshot;
  getSnapshot: () => AudioControlsSnapshot;
} {
  const config: AudioControlsConfig = {
    enabled: false,
    mixToMacros: 0.85,
    attackMs: 100,
    releaseMs: 620,
    maxDeltaPerSec: 2.4,
    amounts: {
      projectm: 1,
      liquid: 1,
      basic: 1,
      camera: 1,
      video: 1,
      depth: 1,
    },
    weights: {
      fusion: { energy: 0.9, bass: 0.8, flux: 0.2, beatPulse: 0.25 },
      motion: { energy: 0.2, bass: 0.25, flux: 1.05, beatPulse: 0.7 },
      sparkle: { energy: 0.1, bass: 0.15, flux: 0.95, beatPulse: 0.45 },
    },
    ...initial,
  };

  let lastMs: number | null = null;

  const snapshot: AudioControlsSnapshot = {
    enabled: Boolean(config.enabled),
    energy01: 0,
    bass01: 0,
    flux01: 0,
    beatPulse01: 0,
    fusion01: 0.5,
    motion01: 0.5,
    sparkle01: 0.5,
  };

  const reset = () => {
    lastMs = null;
    snapshot.energy01 = 0;
    snapshot.bass01 = 0;
    snapshot.flux01 = 0;
    snapshot.beatPulse01 = 0;
    snapshot.fusion01 = 0.5;
    snapshot.motion01 = 0.5;
    snapshot.sparkle01 = 0.5;
  };

  const getConfig = () => ({
    ...config,
    amounts: { ...config.amounts },
    weights: {
      fusion: { ...config.weights.fusion },
      motion: { ...config.weights.motion },
      sparkle: { ...config.weights.sparkle },
    },
  });

  const setConfig = (patch: Partial<AudioControlsConfig>) => {
    if (patch.enabled != null) config.enabled = Boolean(patch.enabled);
    if (patch.mixToMacros != null)
      config.mixToMacros = clamp01(
        Number(patch.mixToMacros),
        config.mixToMacros
      );
    if (patch.attackMs != null)
      config.attackMs = Math.max(5, Number(patch.attackMs) || config.attackMs);
    if (patch.releaseMs != null)
      config.releaseMs = Math.max(
        5,
        Number(patch.releaseMs) || config.releaseMs
      );
    if (patch.maxDeltaPerSec != null)
      config.maxDeltaPerSec = Math.max(
        0,
        Number(patch.maxDeltaPerSec) || config.maxDeltaPerSec
      );

    if (patch.amounts) {
      const next = patch.amounts as any;
      for (const k of [
        "projectm",
        "liquid",
        "basic",
        "camera",
        "video",
        "depth",
      ] as const) {
        const v = Number(next?.[k]);
        if (Number.isFinite(v))
          (config.amounts as any)[k] = clamp01(v, (config.amounts as any)[k]);
      }
    }

    if (patch.weights) {
      const next = patch.weights as any;
      for (const macroKey of ["fusion", "motion", "sparkle"] as const) {
        if (!next[macroKey]) continue;
        for (const k of ["energy", "bass", "flux", "beatPulse"] as const) {
          const v = Number(next[macroKey]?.[k]);
          if (Number.isFinite(v))
            (config.weights as any)[macroKey][k] = Math.max(0, v);
        }
      }
    }

    snapshot.enabled = Boolean(config.enabled);
  };

  const onAudioFrame = (frame: AudioFrame, timeMs?: number) => {
    snapshot.enabled = Boolean(config.enabled);
    const nowMs =
      typeof timeMs === "number" && Number.isFinite(timeMs)
        ? timeMs
        : typeof performance !== "undefined"
        ? performance.now()
        : Date.now();

    const dtSec =
      lastMs == null
        ? 1 / 60
        : Math.max(0.001, Math.min(0.25, (nowMs - lastMs) / 1000));
    lastMs = nowMs;

    const energyTarget = clamp01(Number(frame.energy ?? 0), 0);
    const bands = (frame.bandsStage ??
      frame.bands ?? { low: 0, mid: 0, high: 0 }) as any;
    const bassTarget = clamp01(Number(bands.low ?? 0), 0);
    const midTarget = clamp01(Number(bands.mid ?? 0), 0);  // Added
    const highTarget = clamp01(Number(bands.high ?? 0), 0);  // Added
    const fluxTarget = clamp01(Number(frame.features?.flux ?? 0), 0);
    const beatTarget = clamp01(Number(frame.features?.beatPulse ?? 0), 0);

    const attackSec = Math.max(0.005, config.attackMs / 1000);
    const releaseSec = Math.max(0.005, config.releaseMs / 1000);

    snapshot.energy01 = smoothAttackRelease({
      current: snapshot.energy01,
      target: energyTarget,
      dtSec,
      attackSec,
      releaseSec,
      maxDeltaPerSec: config.maxDeltaPerSec,
    });
    snapshot.bass01 = smoothAttackRelease({
      current: snapshot.bass01,
      target: bassTarget,
      dtSec,
      attackSec,
      releaseSec,
      maxDeltaPerSec: config.maxDeltaPerSec,
    });
    
    snapshot.mid01 = smoothAttackRelease({  // Added
      current: snapshot.mid01,
      target: midTarget,
      dtSec,
      attackSec,
      releaseSec,
      maxDeltaPerSec: config.maxDeltaPerSec,
    });
    
    snapshot.high01 = smoothAttackRelease({  // Added
      current: snapshot.high01,
      target: highTarget,
      dtSec,
      attackSec,
      releaseSec,
      maxDeltaPerSec: config.maxDeltaPerSec,
    });
    
    snapshot.flux01 = smoothAttackRelease({
      current: snapshot.flux01,
      target: fluxTarget,
      dtSec,
      attackSec,
      releaseSec,
      maxDeltaPerSec: config.maxDeltaPerSec,
    });
    // Beat pulse is already "shaped"; keep it responsive but still rate-limited.
    snapshot.beatPulse01 = smoothAttackRelease({
      current: snapshot.beatPulse01,
      target: beatTarget,
      dtSec,
      attackSec: Math.max(0.01, attackSec * 0.5),
      releaseSec: Math.max(0.01, releaseSec * 0.6),
      maxDeltaPerSec: Math.max(config.maxDeltaPerSec, 3.5),
    });

    const signals = {
      energy: snapshot.energy01,
      bass: snapshot.bass01,
      flux: snapshot.flux01,
      beatPulse: snapshot.beatPulse01,
    };

    const fusionSignal = weightedSignal01(
      config.weights.fusion as any,
      signals
    );
    const motionSignal = weightedSignal01(
      config.weights.motion as any,
      signals
    );
    const sparkleSignal = weightedSignal01(
      config.weights.sparkle as any,
      signals
    );

    snapshot.fusion01 = smoothAttackRelease({
      current: snapshot.fusion01,
      target: signalToMacro01(fusionSignal),
      dtSec,
      attackSec,
      releaseSec,
      maxDeltaPerSec: config.maxDeltaPerSec,
    });
    snapshot.motion01 = smoothAttackRelease({
      current: snapshot.motion01,
      target: signalToMacro01(motionSignal),
      dtSec,
      attackSec,
      releaseSec,
      maxDeltaPerSec: config.maxDeltaPerSec,
    });
    snapshot.sparkle01 = smoothAttackRelease({
      current: snapshot.sparkle01,
      target: signalToMacro01(sparkleSignal),
      dtSec,
      attackSec,
      releaseSec,
      maxDeltaPerSec: config.maxDeltaPerSec,
    });

    return snapshot;
  };

  return {
    getConfig,
    setConfig,
    reset,
    onAudioFrame,
    getSnapshot: () => ({ ...snapshot }),
  };
}
