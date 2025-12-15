export type NumberParam = {
  min: number;
  max: number;
  step?: number;
  default: number;
};

export type EnumParam<T extends string> = {
  values: readonly T[];
  default: T;
};

export type BlendParamSchema = {
  opacity: NumberParam;
  energyToOpacityAmount: NumberParam;
  blendMode: EnumParam<'normal' | 'add' | 'screen' | 'multiply'>;
};

type RngLike = { next: () => number } | undefined;

const blendSchema: BlendParamSchema = {
  opacity: { min: 0.4, max: 1.0, step: 0.01, default: 0.8 },
  energyToOpacityAmount: { min: 0.15, max: 0.55, step: 0.01, default: 0.3 },
  blendMode: { values: ['add', 'screen', 'normal', 'multiply'] as const, default: 'add' }
};

export type LiquidMetalParamSchema = {
  timeScale: NumberParam;
  iterations: NumberParam;
  waveAmplitude: NumberParam;
  mouseInfluence: NumberParam;
  metallicAmount: NumberParam;
  metallicSpeed: NumberParam;
  brightness: NumberParam;
  audioSensitivity: NumberParam;
};

const liquidMetalSchema: LiquidMetalParamSchema = {
  timeScale: { min: 0.4, max: 3.0, step: 0.01, default: 1.0 },
  iterations: { min: 5, max: 10, step: 1, default: 10 },
  waveAmplitude: { min: 0.2, max: 1.0, step: 0.01, default: 0.6 },
  mouseInfluence: { min: 0.2, max: 1.0, step: 0.01, default: 1.0 },
  metallicAmount: { min: 0.0, max: 0.3, step: 0.01, default: 0.1 },
  metallicSpeed: { min: 0.5, max: 3.0, step: 0.01, default: 1.0 },
  brightness: { min: 0.6, max: 2.0, step: 0.01, default: 1.0 },
  audioSensitivity: { min: 0.6, max: 1.6, step: 0.01, default: 1.0 }
};

function randomNumber(param: NumberParam, energy: number | undefined, rng: RngLike) {
  const rnd = rng?.next ?? Math.random;
  const base = rnd();
  const mod = energy ? Math.min(1, Math.max(0, energy)) : 0.5;
  const t = 0.35 * mod + 0.65 * base;
  const value = param.min + (param.max - param.min) * t;
  if (param.step) {
    const inv = 1 / param.step;
    return Math.round(value * inv) / inv;
  }
  return value;
}

function randomEnum<T extends string>(param: EnumParam<T>, rng: RngLike) {
  const rnd = rng?.next ?? Math.random;
  const idx = Math.floor(rnd() * param.values.length);
  return param.values[idx] ?? param.default;
}

export function randomizeBlendParams(energy: number, rng?: RngLike) {
  return {
    opacity: randomNumber(blendSchema.opacity, energy, rng),
    energyToOpacityAmount: randomNumber(blendSchema.energyToOpacityAmount, energy, rng),
    blendMode: randomEnum(blendSchema.blendMode, rng),
    audioDrivenOpacity: true
  };
}

export function randomizeLiquidMetalParams(energy: number, rng?: RngLike) {
  const e = Number.isFinite(energy) ? energy : 0.5;

  return {
    timeScale: randomNumber(liquidMetalSchema.timeScale, e, rng),
    iterations: randomNumber(liquidMetalSchema.iterations, e, rng),
    waveAmplitude: randomNumber(liquidMetalSchema.waveAmplitude, e, rng),
    mouseInfluence: randomNumber(liquidMetalSchema.mouseInfluence, e, rng),
    metallicAmount: randomNumber(liquidMetalSchema.metallicAmount, e, rng),
    metallicSpeed: randomNumber(liquidMetalSchema.metallicSpeed, e, rng),
    brightness: randomNumber(liquidMetalSchema.brightness, e, rng),
    audioReactive: true,
    audioSensitivity: randomNumber(liquidMetalSchema.audioSensitivity, e, rng)
  };
}
