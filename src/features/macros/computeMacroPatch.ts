export type MacroInputs = {
  macros: { fusion: number; motion: number; sparkle: number };
  slots: Array<{ value: number }>;
};

export type MacroMappingBase = {
  projectm: {
    opacity: number;
    energyToOpacityAmount: number;
  };
  liquid: {
    opacity: number;
    brightness: number;
    contrast: number;
    timeScale: number;
    waveAmplitude: number;
    metallicAmount: number;
    metallicSpeed: number;
  };
  basic: {
    opacity: number;
    speed: number;
  };
  camera: {
    opacity: number;
  };
  video: {
    opacity: number;
    playbackRate: number;
  };
  depth: {
    opacity: number;
    fog: number;
    edge: number;
    blur: number;
    noise: number;
    layers: number;
    bw: number;
    fall: number;
    scale: number;
  };
};

export type MacroMappingRanges = {
  projectm: {
    opacity: { min: number; max: number };
    energyToOpacityAmount: { min: number; max: number };
  };
  liquid: {
    opacity: { min: number; max: number };
    brightness: { min: number; max: number };
    contrast: { min: number; max: number };
    timeScale: { min: number; max: number };
    waveAmplitude: { min: number; max: number };
    metallicAmount: { min: number; max: number };
    metallicSpeed: { min: number; max: number };
  };
  basic: {
    opacity: { min: number; max: number };
    speed: { min: number; max: number };
  };
  camera: {
    opacity: { min: number; max: number };
  };
  video: {
    opacity: { min: number; max: number };
    playbackRate: { min: number; max: number };
  };
  depth: {
    opacity: { min: number; max: number };
    fog: { min: number; max: number };
    edge: { min: number; max: number };
    blur: { min: number; max: number };
    noise: { min: number; max: number };
    layers: { min: number; max: number };
    bw: { min: number; max: number };
    fall: { min: number; max: number };
    scale: { min: number; max: number };
  };
};

export type MacroPatch = {
  projectm?: {
    opacity?: number;
    energyToOpacityAmount?: number;
  };
  liquid?: {
    opacity?: number;
    brightness?: number;
    contrast?: number;
    timeScale?: number;
    waveAmplitude?: number;
    metallicAmount?: number;
    metallicSpeed?: number;
  };
  basic?: {
    opacity?: number;
    speed?: number;
  };
  camera?: {
    opacity?: number;
  };
  video?: {
    opacity?: number;
    playbackRate?: number;
  };
  depth?: {
    opacity?: number;
    fog?: number;
    edge?: number;
    blur?: number;
    noise?: number;
    layers?: number;
    bw?: number;
    fall?: number;
    scale?: number;
  };
};

function clamp01(value: number, fallback = 0.5) {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

function clamp(value: number, min: number, max: number) {
  const v = Number(value);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function centeredFactor01(value01: number) {
  return (clamp01(value01, 0.5) - 0.5) * 2;
}

// Smooth cubic easing for more natural macro influence.
// Reference: https://easings.net/#easeInOutCubic
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Apply easing to centered factor for smoother transitions.
function smoothCenteredFactor(value01: number): number {
  const centered = (clamp01(value01, 0.5) - 0.5) * 2; // -1 to 1
  const sign = centered >= 0 ? 1 : -1;
  const eased = easeInOutCubic(Math.abs(centered));
  return sign * eased;
}

export function computeMacroPatch(
  inputs: MacroInputs,
  base: MacroMappingBase,
  ranges: MacroMappingRanges
): MacroPatch {
  const slots = inputs.slots ?? [];
  const slotDevs = slots.map((s) => clamp01(s.value, 0.5) - 0.5);
  const slotAvgDev = slotDevs.length
    ? slotDevs.reduce((a, b) => a + b, 0) / slotDevs.length
    : 0;

  const s0 = slotDevs[0] ?? 0;
  const s1 = slotDevs[1] ?? 0;
  const s2 = slotDevs[2] ?? 0;
  const s3 = slotDevs[3] ?? 0;
  const s4 = slotDevs[4] ?? 0;

  // Slots act as extra "macro bank" channels (5 slots ~= 8 knobs total with the 3 primary macros).
  // Keep the coupling subtle by default so the system remains controllable from just 3 macros.
  const effectiveFusion = clamp01(
    inputs.macros.fusion + 0.12 * slotAvgDev + 0.18 * s0,
    0.5
  );
  const effectiveMotion = clamp01(
    inputs.macros.motion + 0.1 * slotAvgDev + 0.18 * s1,
    0.5
  );
  const effectiveSparkle = clamp01(
    inputs.macros.sparkle + 0.1 * slotAvgDev + 0.18 * s2,
    0.5
  );

  // Use smooth easing for more natural control feel.
  const fusion = smoothCenteredFactor(effectiveFusion);
  const motion = smoothCenteredFactor(effectiveMotion);
  const sparkle = smoothCenteredFactor(effectiveSparkle);

  // Main axis: ProjectM presence.
  // Background competition/retreat is handled by runtime budget allocation (not by boosting BG opacities here).
  const pmPresence = fusion;

  const projectmOpacity = clamp(
    base.projectm.opacity + pmPresence * 0.15 + s0 * 0.18,
    ranges.projectm.opacity.min,
    ranges.projectm.opacity.max
  );

  const energyToOpacityAmount = clamp(
    base.projectm.energyToOpacityAmount + motion * 0.2 + s0 * 0.08,
    ranges.projectm.energyToOpacityAmount.min,
    ranges.projectm.energyToOpacityAmount.max
  );

  const liquidOpacity = clamp(
    base.liquid.opacity + s1 * 0.12,
    ranges.liquid.opacity.min,
    ranges.liquid.opacity.max
  );

  const brightness = clamp(
    base.liquid.brightness + s1 * 0.12,
    ranges.liquid.brightness.min,
    ranges.liquid.brightness.max
  );

  const timeScale = clamp(
    base.liquid.timeScale + motion * 0.6 + s3 * 0.25,
    ranges.liquid.timeScale.min,
    ranges.liquid.timeScale.max
  );

  const waveAmplitude = clamp(
    base.liquid.waveAmplitude + motion * 0.25 + s3 * 0.18,
    ranges.liquid.waveAmplitude.min,
    ranges.liquid.waveAmplitude.max
  );

  const metallicAmount = clamp(
    base.liquid.metallicAmount + sparkle * 0.16 + s2 * 0.12,
    ranges.liquid.metallicAmount.min,
    ranges.liquid.metallicAmount.max
  );

  const metallicSpeed = clamp(
    base.liquid.metallicSpeed + sparkle * 0.7 + s2 * 0.6,
    ranges.liquid.metallicSpeed.min,
    ranges.liquid.metallicSpeed.max
  );

  const contrast = clamp(
    base.liquid.contrast + sparkle * 0.18 + s2 * 0.12,
    ranges.liquid.contrast.min,
    ranges.liquid.contrast.max
  );

  const basicOpacity = clamp(
    base.basic.opacity + s4 * 0.12,
    ranges.basic.opacity.min,
    ranges.basic.opacity.max
  );

  const basicSpeed = clamp(
    base.basic.speed + motion * 0.25 + s3 * 0.18,
    ranges.basic.speed.min,
    ranges.basic.speed.max
  );

  const cameraOpacity = clamp(
    base.camera.opacity + s4 * 0.16,
    ranges.camera.opacity.min,
    ranges.camera.opacity.max
  );

  const videoOpacity = clamp(
    base.video.opacity + s4 * 0.22,
    ranges.video.opacity.min,
    ranges.video.opacity.max
  );

  const videoPlaybackRate = clamp(
    base.video.playbackRate + motion * 0.5 + s4 * 0.7,
    ranges.video.playbackRate.min,
    ranges.video.playbackRate.max
  );

  // Depth fog/contours: keep it expressive but stable.
  // - PM presence is handled by ProjectM; depth is driven by slots/motion/sparkle.
  // - motion: complexity/softness (layers/blur/scale)
  // - sparkle: crispness/grit (edge/noise)
  const depthOpacity = clamp(
    base.depth.opacity + s4 * 0.12,
    ranges.depth.opacity.min,
    ranges.depth.opacity.max
  );

  const depthFog = clamp(
    base.depth.fog + s0 * 0.18,
    ranges.depth.fog.min,
    ranges.depth.fog.max
  );

  const depthEdge = clamp(
    base.depth.edge + sparkle * 0.45 + s2 * 0.22,
    ranges.depth.edge.min,
    ranges.depth.edge.max
  );

  const depthNoise = clamp(
    base.depth.noise + sparkle * 0.18 + s2 * 0.12,
    ranges.depth.noise.min,
    ranges.depth.noise.max
  );

  const depthBlur = clamp(
    base.depth.blur + motion * 6 + s3 * 3,
    ranges.depth.blur.min,
    ranges.depth.blur.max
  );

  const depthLayers = clamp(
    base.depth.layers + motion * 6 + s1 * 4,
    ranges.depth.layers.min,
    ranges.depth.layers.max
  );

  const depthBw = clamp(
    base.depth.bw - sparkle * 0.04 - s2 * 0.03,
    ranges.depth.bw.min,
    ranges.depth.bw.max
  );

  const depthFall = clamp(
    base.depth.fall + s1 * 0.25,
    ranges.depth.fall.min,
    ranges.depth.fall.max
  );

  const depthScale = clamp(
    base.depth.scale + motion * 0.25 + s3 * 0.18,
    ranges.depth.scale.min,
    ranges.depth.scale.max
  );

  return {
    projectm: {
      opacity: projectmOpacity,
      energyToOpacityAmount,
    },
    liquid: {
      opacity: liquidOpacity,
      brightness,
      timeScale,
      waveAmplitude,
      metallicAmount,
      metallicSpeed,
      contrast,
    },
    basic: {
      opacity: basicOpacity,
      speed: basicSpeed,
    },
    camera: {
      opacity: cameraOpacity,
    },
    video: {
      opacity: videoOpacity,
      playbackRate: videoPlaybackRate,
    },
    depth: {
      opacity: depthOpacity,
      fog: depthFog,
      edge: depthEdge,
      blur: depthBlur,
      noise: depthNoise,
      layers: Math.round(depthLayers),
      bw: depthBw,
      fall: depthFall,
      scale: depthScale,
    },
  };
}
