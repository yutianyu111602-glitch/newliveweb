import type { AudioFrame } from "../../types/audioFrame";

export type ExpressiveAudioSnapshot = {
  audioValid: boolean;
  beatTrusted: boolean;
  energy01: number;
  energySlow01: number;
  bass01: number;
  flux01: number;
  beatPulse01: number;
  accent01: number;
  onsetRate2s: number;
  gateBoost: number;
};

export type ExpressiveAudioDriverInput = {
  nowMs: number;
  frame: AudioFrame;
  audioValid: boolean;
  beatTrusted: boolean;
  beat?: {
    pulse01?: number;
    phase01?: number;
    confidence01?: number;
    stability01?: number;
  };
};

type ExpressiveAudioDriverConfig = {
  fluxThreshold: number;
  onsetWindowMs: number;
  energyAttackMs: number;
  energyReleaseMs: number;
  accentAttackMs: number;
  accentReleaseMs: number;
  energyFloor: number;
  energyCeiling: number;
  energyCurve: number;
  accentEnergyBoost: number;
};

const clamp01 = (value: number, fallback = 0) => {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
};

const clampRange = (value: number, min: number, max: number, fallback = 0) => {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.min(hi, Math.max(lo, v));
};

const expSmoothingAlpha = (dtMs: number, tauMs: number) => {
  const dt = Math.max(0, dtMs);
  const tau = Math.max(1, tauMs);
  return 1 - Math.exp(-dt / tau);
};

export function createExpressiveAudioDriver(
  initial?: Partial<ExpressiveAudioDriverConfig>
): {
  onFrame: (input: ExpressiveAudioDriverInput) => ExpressiveAudioSnapshot;
  reset: () => void;
  getSnapshot: () => ExpressiveAudioSnapshot;
} {
  const config: ExpressiveAudioDriverConfig = {
    fluxThreshold: 0.28,
    onsetWindowMs: 2000,
    energyAttackMs: 240,
    energyReleaseMs: 900,
    accentAttackMs: 60,
    accentReleaseMs: 220,
    energyFloor: 0.35,
    energyCeiling: 0.88,
    energyCurve: 0.72,
    accentEnergyBoost: 0.08,
    ...initial,
  };

  let lastMs: number | null = null;
  let energySlow01 = 0;
  let accent01 = 0;
  const onsetMarks: number[] = [];

  const snapshot: ExpressiveAudioSnapshot = {
    audioValid: false,
    beatTrusted: false,
    energy01: config.energyFloor,
    energySlow01: config.energyFloor,
    bass01: 0,
    flux01: 0,
    beatPulse01: 0,
    accent01: 0,
    onsetRate2s: 0,
    gateBoost: 1,
  };

  const reset = () => {
    lastMs = null;
    energySlow01 = 0;
    accent01 = 0;
    onsetMarks.length = 0;
  };

  const getSnapshot = () => ({ ...snapshot });

  const onFrame = (input: ExpressiveAudioDriverInput) => {
    const nowMs =
      typeof input.nowMs === "number" && Number.isFinite(input.nowMs)
        ? input.nowMs
        : typeof performance !== "undefined"
        ? performance.now()
        : Date.now();
    const dtMs =
      lastMs == null ? 16 : Math.max(0, Math.min(200, nowMs - lastMs));
    lastMs = nowMs;

    const frame = input.frame;
    const audioValid = Boolean(input.audioValid);
    const beatTrusted = Boolean(input.beatTrusted);

    const energyRaw = clamp01(
      Number((frame as any).energyRaw ?? frame.energy ?? 0),
      0
    );
    const energySoft = clamp01((energyRaw - 0.03) / 0.97, 0);
    const energyCurve = clampRange(config.energyCurve, 0.45, 1.1, 0.72);
    const energyBase = audioValid
      ? clampRange(
          config.energyFloor +
            (config.energyCeiling - config.energyFloor) *
              clamp01(Math.pow(energySoft, energyCurve), 0),
          config.energyFloor,
          config.energyCeiling,
          config.energyFloor
        )
      : config.energyFloor;
    const bass01 = clamp01(
      Number((frame.bandsStage ?? frame.bands)?.low ?? 0),
      0
    );
    const flux01 = clamp01(Number(frame.features?.flux ?? 0), 0);
    const beatPulse01 = clamp01(
      Number(input.beat?.pulse01 ?? frame.features?.beatPulse ?? 0),
      0
    );

    const energyAlpha =
      energyBase >= energySlow01
        ? expSmoothingAlpha(dtMs, config.energyAttackMs)
        : expSmoothingAlpha(dtMs, config.energyReleaseMs);
    energySlow01 = clamp01(
      energySlow01 + (energyBase - energySlow01) * energyAlpha,
      energySlow01
    );

    const fluxGate = clamp01(
      (flux01 - config.fluxThreshold) / (1 - config.fluxThreshold),
      0
    );

    if (audioValid && flux01 >= config.fluxThreshold) {
      onsetMarks.push(nowMs);
    }
    const onsetCutoff = nowMs - config.onsetWindowMs;
    while (onsetMarks.length && onsetMarks[0] < onsetCutoff) {
      onsetMarks.shift();
    }
    const onsetRate2s = Math.min(5, onsetMarks.length / 2);

    const kick = clamp01(
      Number(frame.features?.kick01Raw ?? frame.features?.kick01Long ?? 0),
      0
    );
    const clap = clamp01(
      Number(frame.features?.clap01Raw ?? frame.features?.clap01Long ?? 0),
      0
    );
    const hihat = clamp01(
      Number(frame.features?.hihat01Raw ?? frame.features?.hihat01Long ?? 0),
      0
    );

    const beatAccent = beatTrusted ? 0.18 * beatPulse01 : 0;
    const rawAccent = audioValid
      ? clamp01(
          0.62 * kick +
            0.22 * hihat +
            0.2 * clap +
            beatAccent +
            0.2 * fluxGate,
          0
        )
      : 0;

    const accentAlpha =
      rawAccent >= accent01
        ? expSmoothingAlpha(dtMs, config.accentAttackMs)
        : expSmoothingAlpha(dtMs, config.accentReleaseMs);
    accent01 = clamp01(accent01 + (rawAccent - accent01) * accentAlpha, 0);

    const energy01 = audioValid
      ? clampRange(
          energyBase + config.accentEnergyBoost * accent01,
          config.energyFloor,
          config.energyCeiling,
          config.energyFloor
        )
      : config.energyFloor;

    const gateBoost = Math.min(1.6, 1 + 0.25 * accent01 + 0.15 * fluxGate);

    snapshot.audioValid = audioValid;
    snapshot.beatTrusted = beatTrusted;
    snapshot.energy01 = energy01;
    snapshot.energySlow01 = energySlow01;
    snapshot.bass01 = bass01;
    snapshot.flux01 = flux01;
    snapshot.beatPulse01 = beatPulse01;
    snapshot.accent01 = accent01;
    snapshot.onsetRate2s = onsetRate2s;
    snapshot.gateBoost = gateBoost;

    return { ...snapshot };
  };

  return { onFrame, reset, getSnapshot };
}
