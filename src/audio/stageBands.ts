export type ThreeBand = { low: number; mid: number; high: number };

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function expSmoothingFactor(dtSec: number, ratePerSec: number): number {
  const dt = Math.max(0.0005, dtSec);
  const rate = Math.max(0.001, ratePerSec);
  return 1 - Math.exp(-dt * rate);
}

function softKnee(value: number, knee: number): number {
  const v = clamp01(value);
  const k = Math.max(1e-6, knee);
  return v / (v + k);
}

export type StageBandsProfile = "punchy";

export type StageBandsOptions = {
  profile?: StageBandsProfile;
};

export type StageBandsProcessor = {
  reset: () => void;
  process: (bandsRaw: ThreeBand, dtSec: number) => ThreeBand;
};

export function createStageBandsProcessor(
  opts: StageBandsOptions = {}
): StageBandsProcessor {
  const profile: StageBandsProfile = opts.profile ?? "punchy";

  const lowState = { base: 0, env: 0, peak: 0 };
  const midState = { base: 0, env: 0, peak: 0 };
  const highState = { base: 0, env: 0, peak: 0 };

  const reset = () => {
    lowState.base = 0;
    lowState.env = 0;
    lowState.peak = 0;
    midState.base = 0;
    midState.env = 0;
    midState.peak = 0;
    highState.base = 0;
    highState.env = 0;
    highState.peak = 0;
  };

  const processOne = (
    raw: number,
    dtSec: number,
    state: {
      base: number;
      env: number;
      peak: number;
    },
    tuning: {
      baseRate: number;
      floor: number;
      gateMul: number;
      gain: number;
      knee: number;
      gamma: number;
      attack: number;
      release: number;
      peakDecay: number;
      peakHoldMul: number;
    }
  ) => {
    const x = clamp01(raw);

    // Baseline tracks typical level (slow), then we subtract a portion to gate noise.
    const baseA = expSmoothingFactor(dtSec, tuning.baseRate);
    state.base = state.base + (x - state.base) * baseA;

    const gated = Math.max(0, x - state.base * tuning.gateMul - tuning.floor);
    // Soft compression to keep everything in [0..1] while lifting low levels.
    let shaped = softKnee(gated * tuning.gain, tuning.knee);
    shaped = Math.pow(clamp01(shaped), tuning.gamma);

    // Fast attack + slower release envelope.
    const a = expSmoothingFactor(dtSec, tuning.attack);
    const r = expSmoothingFactor(dtSec, tuning.release);
    state.env =
      shaped >= state.env
        ? state.env + (shaped - state.env) * a
        : state.env + (shaped - state.env) * r;

    // Peak hold for extra stage punch.
    state.peak = Math.max(state.peak, state.env);
    state.peak = Math.max(0, state.peak - dtSec * tuning.peakDecay);

    return clamp01(Math.max(state.env, state.peak * tuning.peakHoldMul));
  };

  const process = (bandsRaw: ThreeBand, dtSec: number): ThreeBand => {
    const dt = Math.max(0.0005, Math.min(0.2, dtSec));

    if (profile === "punchy") {
      const low = processOne(
        bandsRaw.low,
        dt,
        lowState,
        {
          baseRate: 0.9,
          floor: 0.02,
          gateMul: 0.55,
          gain: 3.2,
          knee: 0.18,
          gamma: 0.52,
          attack: 22,
          release: 5.8,
          peakDecay: 1.05,
          peakHoldMul: 0.92,
        }
      );

      const mid = processOne(
        bandsRaw.mid,
        dt,
        midState,
        {
          baseRate: 1.2,
          floor: 0.018,
          gateMul: 0.5,
          gain: 2.6,
          knee: 0.16,
          gamma: 0.55,
          attack: 18,
          release: 6.2,
          peakDecay: 0.95,
          peakHoldMul: 0.9,
        }
      );

      const high = processOne(
        bandsRaw.high,
        dt,
        highState,
        {
          baseRate: 1.6,
          floor: 0.012,
          gateMul: 0.45,
          gain: 3.8,
          knee: 0.14,
          gamma: 0.5,
          attack: 26,
          release: 7.2,
          peakDecay: 1.25,
          peakHoldMul: 0.88,
        }
      );

      // Extra punch: reward clear separation (e.g. kick + hats together)
      const separationBoost = clamp01(
        Math.max(0, (low - mid) * 0.25) + Math.max(0, (high - mid) * 0.2)
      );
      return {
        low: clamp01(low + separationBoost * 0.12),
        mid,
        high: clamp01(high + separationBoost * 0.08),
      };
    }

    return {
      low: clamp01(bandsRaw.low),
      mid: clamp01(bandsRaw.mid),
      high: clamp01(bandsRaw.high),
    };
  };

  return { reset, process };
}
