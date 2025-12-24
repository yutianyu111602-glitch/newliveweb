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

export type BoolParam = {
  default: boolean;
};

export type ParamGroup = string;

export type NumberParamDef = {
  kind: "number";
  key: string;
  group: ParamGroup;
  advanced?: boolean;
  random?: boolean;
  min: number;
  max: number;
  step?: number;
  default: number;
};

export type EnumParamDef<T extends string> = {
  kind: "enum";
  key: string;
  group: ParamGroup;
  advanced?: boolean;
  random?: boolean;
  values: readonly T[];
  default: T;
};

export type BoolParamDef = {
  kind: "bool";
  key: string;
  group: ParamGroup;
  advanced?: boolean;
  random?: boolean;
  default: boolean;
};

export type StringParamDef = {
  kind: "string";
  key: string;
  group: ParamGroup;
  advanced?: boolean;
  random?: boolean;
  default: string;
  placeholder?: string;
};

export type ParamDef =
  | NumberParamDef
  | EnumParamDef<string>
  | BoolParamDef
  | StringParamDef;

export type BlendParamSchema = {
  opacity: NumberParam;
  energyToOpacityAmount: NumberParam;
  blendMode: EnumParam<
    | "normal"
    | "add"
    | "screen"
    | "multiply"
    | "overlay"
    | "difference"
    | "exclusion"
    | "color-dodge"
  >;
  audioDrivenOpacity: BoolParam;
};

type RngLike = { next: () => number } | undefined;

const blendSchema: BlendParamSchema = {
  opacity: { min: 0.4, max: 1.0, step: 0.01, default: 0.7 },
  energyToOpacityAmount: { min: 0.15, max: 0.7, step: 0.01, default: 0.25 },
  blendMode: {
    values: [
      "add",
      "screen",
      "normal",
      "multiply",
      "overlay",
      "difference",
      "exclusion",
      "color-dodge",
    ] as const,
    default: "normal",
  },
  audioDrivenOpacity: { default: true },
};

export type LiquidMetalParamSchema = {
  timeScale: NumberParam;
  iterations: NumberParam;
  waveAmplitude: NumberParam;
  mouseInfluence: NumberParam;
  metallicAmount: NumberParam;
  metallicSpeed: NumberParam;
  brightness: NumberParam;
  contrast: NumberParam;
  tintHue: NumberParam;
  tintStrength: NumberParam;
  paletteStrength: NumberParam;
  audioReactive: BoolParam;
  audioSensitivity: NumberParam;
};

const liquidMetalSchema: LiquidMetalParamSchema = {
  timeScale: { min: 0.4, max: 3.0, step: 0.01, default: 1.0 },
  iterations: { min: 5, max: 10, step: 1, default: 10 },
  waveAmplitude: { min: 0.2, max: 1.0, step: 0.01, default: 0.6 },
  mouseInfluence: { min: 0.2, max: 1.0, step: 0.01, default: 1.0 },
  metallicAmount: { min: 0.0, max: 0.2, step: 0.01, default: 0.08 },
  metallicSpeed: { min: 0.5, max: 3.0, step: 0.01, default: 1.0 },
  brightness: { min: 0.4, max: 1.1, step: 0.01, default: 0.8 },
  contrast: { min: 0.7, max: 1.6, step: 0.01, default: 1.0 },
  tintHue: { min: 0.0, max: 1.0, step: 0.01, default: 0.0 },
  tintStrength: { min: 0.0, max: 0.6, step: 0.01, default: 0.0 },
  paletteStrength: { min: 0.0, max: 0.6, step: 0.01, default: 0.0 },
  audioReactive: { default: true },
  audioSensitivity: { min: 0.6, max: 1.4, step: 0.01, default: 1.0 },
};

export const paramSchema = {
  renderer: {
    compositor: [
      {
        kind: "enum",
        key: "targetMode",
        group: "Renderer/Compositor",
        values: ["viewport", "fixed"] as const,
        default: "viewport",
        advanced: true,
        random: false,
      } as EnumParamDef<"viewport" | "fixed">,
      {
        kind: "number",
        key: "fixedWidth",
        group: "Renderer/Compositor",
        min: 320,
        max: 4096,
        step: 1,
        default: 1280,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "fixedHeight",
        group: "Renderer/Compositor",
        min: 240,
        max: 4096,
        step: 1,
        default: 720,
        advanced: true,
        random: false,
      },
    ] satisfies ParamDef[],
  },
  global: {
    macros: [
      {
        kind: "number",
        key: "fusion",
        group: "Global/Macros",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.5,
        random: true,
      },
      {
        kind: "number",
        key: "motion",
        group: "Global/Macros",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.5,
        random: true,
      },
      {
        kind: "number",
        key: "sparkle",
        group: "Global/Macros",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.5,
        random: true,
      },
    ] satisfies NumberParamDef[],
  },
  projectm: {
    blend: [
      {
        kind: "number",
        key: "opacity",
        group: "ProjectM/Blend",
        min: blendSchema.opacity.min,
        max: blendSchema.opacity.max,
        step: blendSchema.opacity.step,
        default: blendSchema.opacity.default,
        random: true,
      },
      {
        kind: "number",
        key: "energyToOpacityAmount",
        group: "ProjectM/Blend",
        min: blendSchema.energyToOpacityAmount.min,
        max: blendSchema.energyToOpacityAmount.max,
        step: blendSchema.energyToOpacityAmount.step,
        default: blendSchema.energyToOpacityAmount.default,
        random: true,
      },
      {
        kind: "enum",
        key: "blendMode",
        group: "ProjectM/Blend",
        values: blendSchema.blendMode.values,
        default: blendSchema.blendMode.default,
        random: true,
      } as EnumParamDef<"normal" | "add" | "screen" | "multiply">,
      {
        kind: "number",
        key: "energyCurve",
        group: "ProjectM/Blend",
        min: 0.5,
        max: 2.0,
        step: 0.1,
        default: 1.0,
        random: true,
      },
      {
        kind: "bool",
        key: "audioDrivenOpacity",
        group: "ProjectM/Blend",
        default: blendSchema.audioDrivenOpacity.default,
        advanced: true,
        random: false,
      },
    ] satisfies ParamDef[],
    presetTuning: [
      {
        kind: "number",
        key: "externalOpacityBiasSigned",
        group: "ProjectM/PresetTuning",
        min: -0.6,
        max: 0.6,
        step: 0.01,
        default: 0,
        random: false,
      },
      {
        kind: "number",
        key: "audioReactiveMultiplier",
        group: "ProjectM/PresetTuning",
        min: 0,
        max: 3,
        step: 0.01,
        default: 0.7,
        advanced: true,
        random: false,
      },
    ] satisfies ParamDef[],
  },
  audio: {
    beatTempo: [
      {
        kind: "bool",
        key: "enabled",
        group: "Audio/BeatTempo",
        default: true,
        random: false,
      },
      {
        kind: "enum",
        key: "method",
        group: "Audio/BeatTempo",
        values: ["multifeature", "degara", "aubio"] as const,
        default: "aubio",
        advanced: true,
        random: false,
      } as EnumParamDef<"multifeature" | "degara" | "aubio">,
      {
        kind: "number",
        key: "windowSec",
        group: "Audio/BeatTempo",
        min: 4,
        max: 20,
        step: 1,
        default: 10,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "updateIntervalMs",
        group: "Audio/BeatTempo",
        min: 250,
        max: 5000,
        step: 50,
        default: 900,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "inputFps",
        group: "Audio/BeatTempo",
        min: 5,
        max: 60,
        step: 1,
        default: 20,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "minTempo",
        group: "Audio/BeatTempo",
        min: 30,
        max: 220,
        step: 1,
        default: 60,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "maxTempo",
        group: "Audio/BeatTempo",
        min: 60,
        max: 260,
        step: 1,
        default: 190,
        advanced: true,
        random: false,
      },
    ] as const satisfies readonly ParamDef[],
    controls: [
      {
        kind: "enum",
        key: "technoProfile",
        group: "Audio/Controls",
        values: [
          "ambient",
          "peakRave",
          "dub",
          "drone",
          "videoVj",
          "custom",
        ] as const,
        default: "ambient",
        random: false,
      } as EnumParamDef<
        "ambient" | "peakRave" | "dub" | "drone" | "videoVj" | "custom"
      >,
      {
        kind: "bool",
        key: "enabled",
        group: "Audio/Controls",
        default: false,
        random: false,
      },
      {
        kind: "number",
        key: "mixToMacros",
        group: "Audio/Controls",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.85,
        random: false,
      },
      {
        kind: "number",
        key: "attackMs",
        group: "Audio/Controls",
        min: 10,
        max: 2000,
        step: 10,
        default: 120,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "releaseMs",
        group: "Audio/Controls",
        min: 10,
        max: 5000,
        step: 10,
        default: 520,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "maxDeltaPerSec",
        group: "Audio/Controls",
        min: 0,
        max: 10,
        step: 0.1,
        default: 2.2,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "amountProjectM",
        group: "Audio/Controls",
        min: 0,
        max: 1,
        step: 0.05,
        default: 1,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "amountLiquid",
        group: "Audio/Controls",
        min: 0,
        max: 1,
        step: 0.05,
        default: 1,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "amountBasic",
        group: "Audio/Controls",
        min: 0,
        max: 1,
        step: 0.05,
        default: 1,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "amountCamera",
        group: "Audio/Controls",
        min: 0,
        max: 1,
        step: 0.05,
        default: 1,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "amountVideo",
        group: "Audio/Controls",
        min: 0,
        max: 1,
        step: 0.05,
        default: 1,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "amountDepth",
        group: "Audio/Controls",
        min: 0,
        max: 1,
        step: 0.05,
        default: 1,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "wFusionEnergy",
        group: "Audio/Controls",
        min: 0,
        max: 2,
        step: 0.05,
        default: 1.0,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "wFusionBass",
        group: "Audio/Controls",
        min: 0,
        max: 2,
        step: 0.05,
        default: 0.6,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "wFusionFlux",
        group: "Audio/Controls",
        min: 0,
        max: 2,
        step: 0.05,
        default: 0.25,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "wFusionBeat",
        group: "Audio/Controls",
        min: 0,
        max: 2,
        step: 0.05,
        default: 0.25,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "wMotionEnergy",
        group: "Audio/Controls",
        min: 0,
        max: 2,
        step: 0.05,
        default: 0.15,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "wMotionBass",
        group: "Audio/Controls",
        min: 0,
        max: 2,
        step: 0.05,
        default: 0.25,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "wMotionFlux",
        group: "Audio/Controls",
        min: 0,
        max: 2,
        step: 0.05,
        default: 1.0,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "wMotionBeat",
        group: "Audio/Controls",
        min: 0,
        max: 2,
        step: 0.05,
        default: 0.6,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "wSparkleEnergy",
        group: "Audio/Controls",
        min: 0,
        max: 2,
        step: 0.05,
        default: 0.15,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "wSparkleBass",
        group: "Audio/Controls",
        min: 0,
        max: 2,
        step: 0.05,
        default: 0.2,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "wSparkleFlux",
        group: "Audio/Controls",
        min: 0,
        max: 2,
        step: 0.05,
        default: 0.85,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "wSparkleBeat",
        group: "Audio/Controls",
        min: 0,
        max: 2,
        step: 0.05,
        default: 0.35,
        advanced: true,
        random: false,
      },

      // AIVJ / multi-layer budget tuning (advanced).
      {
        kind: "number",
        key: "overlayBudgetMaxEnergy",
        group: "Audio/Controls/OverlayBudget",
        min: 0.6,
        max: 2.0,
        step: 0.01,
        default: 1.15,
        advanced: false,
        random: false,
      },
      {
        kind: "number",
        key: "overlayBudgetMinScale",
        group: "Audio/Controls/OverlayBudget",
        min: 0.0,
        max: 1.0,
        step: 0.01,
        default: 0.2,
        advanced: false,
        random: false,
      },
      {
        kind: "number",
        key: "overlayBudgetDepthWeight",
        group: "Audio/Controls/OverlayBudget",
        min: 0.5,
        max: 3.0,
        step: 0.05,
        default: 1.4,
        advanced: false,
        random: false,
      },
      {
        kind: "number",
        key: "overlayBudgetSmoothBaseMs",
        group: "Audio/Controls/OverlayBudget",
        min: 5,
        max: 200,
        step: 1,
        default: 33,
        advanced: false,
        random: false,
      },
      {
        kind: "number",
        key: "overlayBudgetPriorityBasic",
        group: "Audio/Controls/OverlayBudget",
        min: 0.25,
        max: 4,
        step: 0.05,
        default: 1,
        advanced: false,
        random: false,
      },
      {
        kind: "number",
        key: "overlayBudgetPriorityCamera",
        group: "Audio/Controls/OverlayBudget",
        min: 0.25,
        max: 4,
        step: 0.05,
        default: 1,
        advanced: false,
        random: false,
      },
      {
        kind: "number",
        key: "overlayBudgetPriorityVideo",
        group: "Audio/Controls/OverlayBudget",
        min: 0.25,
        max: 4,
        step: 0.05,
        default: 1,
        advanced: false,
        random: false,
      },
      {
        kind: "number",
        key: "overlayBudgetPriorityDepth",
        group: "Audio/Controls/OverlayBudget",
        min: 0.25,
        max: 4,
        step: 0.05,
        default: 0.65,
        advanced: false,
        random: false,
      },
      {
        kind: "number",
        key: "overlayBudgetPmRetreatStrength",
        group: "Audio/Controls/OverlayBudget",
        min: 0,
        max: 0.9,
        step: 0.01,
        default: 0.45,
        advanced: false,
        random: false,
      },
      {
        kind: "number",
        key: "overlayBudgetPmRetreatFloor",
        group: "Audio/Controls/OverlayBudget",
        min: 0.2,
        max: 1.0,
        step: 0.01,
        default: 0.55,
        advanced: false,
        random: false,
      },

      // ProjectM closed-loop visibility control (advanced, default off).
      {
        kind: "bool",
        key: "pmClosedLoopEnabled",
        group: "Audio/Controls/ProjectMClosedLoop",
        default: false,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "pmClosedLoopTargetLuma",
        group: "Audio/Controls/ProjectMClosedLoop",
        min: 0.05,
        max: 0.95,
        step: 0.01,
        default: 0.35,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "pmClosedLoopKp",
        group: "Audio/Controls/ProjectMClosedLoop",
        min: 0.0,
        max: 2.0,
        step: 0.01,
        default: 0.55,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "pmClosedLoopKi",
        group: "Audio/Controls/ProjectMClosedLoop",
        min: 0.0,
        max: 1.0,
        step: 0.01,
        default: 0.12,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "pmClosedLoopIntegralClamp",
        group: "Audio/Controls/ProjectMClosedLoop",
        min: 0.0,
        max: 1.0,
        step: 0.01,
        default: 0.35,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "pmClosedLoopOutputClamp",
        group: "Audio/Controls/ProjectMClosedLoop",
        min: 0.0,
        max: 1.0,
        step: 0.01,
        default: 0.45,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "pmClosedLoopMaxDeltaPerSec",
        group: "Audio/Controls/ProjectMClosedLoop",
        min: 0.0,
        max: 2.0,
        step: 0.01,
        default: 0.35,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "pmClosedLoopIntervalMs",
        group: "Audio/Controls/ProjectMClosedLoop",
        min: 100,
        max: 2000,
        step: 10,
        default: 500,
        advanced: true,
        random: false,
      },

      // ProjectM color cast feedback -> background tinting (advanced, default off).
      {
        kind: "bool",
        key: "pmColorLoopEnabled",
        group: "Audio/Controls/ProjectMColorLoop",
        default: false,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "pmColorLoopHueOffset",
        group: "Audio/Controls/ProjectMColorLoop",
        min: 0.0,
        max: 1.0,
        step: 0.01,
        default: 0.5,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "pmColorLoopAmount",
        group: "Audio/Controls/ProjectMColorLoop",
        min: 0.0,
        max: 1.0,
        step: 0.01,
        default: 0.35,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "pmColorLoopMaxStrength",
        group: "Audio/Controls/ProjectMColorLoop",
        min: 0.0,
        max: 1.0,
        step: 0.01,
        default: 0.45,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "pmColorLoopContrastAmount",
        group: "Audio/Controls/ProjectMColorLoop",
        min: 0.0,
        max: 0.6,
        step: 0.01,
        default: 0.12,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "pmColorLoopMaxDeltaPerSec",
        group: "Audio/Controls/ProjectMColorLoop",
        min: 0.0,
        max: 2.0,
        step: 0.01,
        default: 0.35,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "pmColorLoopIntervalMs",
        group: "Audio/Controls/ProjectMColorLoop",
        min: 100,
        max: 2000,
        step: 10,
        default: 500,
        advanced: true,
        random: false,
      },
    ] satisfies ParamDef[],
  },
  background: {
    type: [
      {
        kind: "enum",
        key: "type",
        group: "Background/Type",
        values: ["liquid", "basic", "camera", "video", "depth"] as const,
        default: "liquid",
        random: false,
      } as EnumParamDef<"liquid" | "basic" | "camera" | "video" | "depth">,
    ] as const,
    basic: [
      {
        kind: "bool",
        key: "enabled",
        group: "Background/Basic",
        default: false,
        random: false,
      },
      {
        kind: "number",
        key: "speed",
        group: "Background/Basic",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.2,
        random: false,
      },
      {
        kind: "number",
        key: "opacity",
        group: "Background/Basic",
        min: 0,
        max: 1,
        step: 0.01,
        default: 1,
        random: false,
        advanced: true,
      },
    ] as const satisfies readonly ParamDef[],
    camera: [
      {
        kind: "bool",
        key: "enabled",
        group: "Background/Camera",
        default: false,
        random: false,
      },
      {
        kind: "string",
        key: "deviceId",
        group: "Background/Camera",
        default: "",
        placeholder: "(auto)",
        // Keep device selection visible by default (no need to toggle "show advanced").
        advanced: false,
        random: false,
      },
      {
        kind: "number",
        key: "opacity",
        group: "Background/Camera",
        min: 0,
        max: 1,
        step: 0.01,
        default: 1,
        random: false,
      },
      {
        kind: "bool",
        key: "segmentPerson",
        group: "Background/Camera",
        default: false,
        advanced: false,
        random: false,
      },
      {
        kind: "enum",
        key: "segmentQuality",
        group: "Background/Camera",
        values: ["low", "medium", "high"] as const,
        default: "medium",
        advanced: true,
        random: false,
      } as EnumParamDef<"low" | "medium" | "high">,
      {
        kind: "number",
        key: "segmentFps",
        group: "Background/Camera",
        min: 5,
        max: 30,
        step: 1,
        default: 15,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "segmentEdgeBlurPx",
        group: "Background/Camera",
        min: 0,
        max: 16,
        step: 1,
        default: 8,
        advanced: true,
        random: false,
      },
    ] as const satisfies readonly ParamDef[],
    video: [
      {
        kind: "bool",
        key: "enabled",
        group: "Background/Video",
        default: false,
        random: false,
      },
      {
        kind: "string",
        key: "src",
        group: "Background/Video",
        default: "",
        placeholder: "https://.../video.mp4",
        random: false,
      },
      {
        kind: "number",
        key: "opacity",
        group: "Background/Video",
        min: 0,
        max: 1,
        step: 0.01,
        default: 1,
        random: false,
      },
      {
        kind: "bool",
        key: "loop",
        group: "Background/Video",
        default: true,
        advanced: true,
        random: false,
      },
      {
        kind: "bool",
        key: "muted",
        group: "Background/Video",
        default: true,
        advanced: true,
        random: false,
      },
      {
        kind: "enum",
        key: "fitMode",
        group: "Background/Video",
        values: ["cover", "contain", "stretch"] as const,
        default: "cover",
        advanced: true,
        random: false,
      } as EnumParamDef<"cover" | "contain" | "stretch">,
      {
        kind: "number",
        key: "playbackRate",
        group: "Background/Video",
        min: 0.25,
        max: 4,
        step: 0.05,
        default: 1,
        advanced: true,
        random: false,
      },
    ] as const satisfies readonly ParamDef[],

    depth: [
      {
        kind: "bool",
        key: "enabled",
        group: "Background/Depth",
        default: false,
        random: false,
      },
      {
        kind: "enum",
        key: "source",
        group: "Background/Depth",
        values: ["webcam", "ws", "idepth"] as const,
        default: "webcam",
        random: false,
        advanced: true,
      } as EnumParamDef<"webcam" | "ws" | "idepth">,
      {
        kind: "string",
        key: "deviceId",
        group: "Background/Depth",
        default: "",
        placeholder: "(select a depth camera)",
        random: false,
        advanced: true,
      },
      {
        kind: "number",
        key: "opacity",
        group: "Background/Depth",
        min: 0,
        max: 1,
        step: 0.01,
        default: 1,
        random: false,
        advanced: true,
      },
      {
        kind: "number",
        key: "near",
        group: "Background/Depth",
        min: 0,
        max: 1,
        step: 0.001,
        default: 0.2,
        random: false,
      },
      {
        kind: "number",
        key: "far",
        group: "Background/Depth",
        min: 0,
        max: 1,
        step: 0.001,
        default: 0.85,
        random: false,
      },
      {
        kind: "bool",
        key: "invert",
        group: "Background/Depth",
        default: false,
        random: false,
      },
      {
        kind: "bool",
        key: "showDepth",
        group: "Background/Depth",
        default: false,
        random: false,
        advanced: true,
      },
      {
        kind: "number",
        key: "layers",
        group: "Background/Depth",
        min: 3,
        max: 28,
        step: 1,
        default: 12,
        random: false,
      },
      {
        kind: "number",
        key: "bw",
        group: "Background/Depth",
        min: 0.01,
        max: 0.35,
        step: 0.001,
        default: 0.1,
        random: false,
      },
      {
        kind: "number",
        key: "fog",
        group: "Background/Depth",
        min: 0,
        max: 2.5,
        step: 0.01,
        default: 1.1,
        random: false,
      },
      {
        kind: "number",
        key: "fall",
        group: "Background/Depth",
        min: 0,
        max: 3,
        step: 0.01,
        default: 1.2,
        random: false,
      },
      {
        kind: "number",
        key: "edge",
        group: "Background/Depth",
        min: 0,
        max: 4,
        step: 0.01,
        default: 1.3,
        random: false,
      },
      {
        kind: "number",
        key: "blur",
        group: "Background/Depth",
        min: 0,
        max: 30,
        step: 1,
        default: 10,
        random: false,
      },
      {
        kind: "number",
        key: "noise",
        group: "Background/Depth",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.18,
        random: false,
      },
      {
        kind: "number",
        key: "scale",
        group: "Background/Depth",
        min: 0.5,
        max: 2,
        step: 0.01,
        default: 1,
        random: false,
      },
      {
        kind: "number",
        key: "fps",
        group: "Background/Depth",
        min: 5,
        max: 30,
        step: 1,
        default: 15,
        random: false,
        advanced: true,
      },
    ] as const satisfies readonly ParamDef[],
    liquid: [
      {
        kind: "bool",
        key: "enabled",
        group: "Background/Liquid",
        default: true,
        random: false,
      },
      {
        kind: "number",
        key: "opacity",
        group: "Background/Liquid",
        min: 0,
        max: 1,
        step: 0.01,
        default: 1,
        advanced: true,
        random: false,
      },
      {
        kind: "enum",
        key: "variant",
        group: "Background/Liquid",
        values: ["metal", "waves", "stars", "lines"] as const,
        default: "metal",
        random: false,
      } as EnumParamDef<"metal" | "waves" | "stars" | "lines">,
      {
        kind: "number",
        key: "timeScale",
        group: "Background/Liquid",
        min: liquidMetalSchema.timeScale.min,
        max: liquidMetalSchema.timeScale.max,
        step: liquidMetalSchema.timeScale.step,
        default: liquidMetalSchema.timeScale.default,
        random: true,
      },
      {
        kind: "number",
        key: "iterations",
        group: "Background/Liquid",
        min: liquidMetalSchema.iterations.min,
        max: liquidMetalSchema.iterations.max,
        step: liquidMetalSchema.iterations.step,
        default: liquidMetalSchema.iterations.default,
        random: true,
      },
      {
        kind: "number",
        key: "waveAmplitude",
        group: "Background/Liquid",
        min: liquidMetalSchema.waveAmplitude.min,
        max: liquidMetalSchema.waveAmplitude.max,
        step: liquidMetalSchema.waveAmplitude.step,
        default: liquidMetalSchema.waveAmplitude.default,
        random: true,
      },
      {
        kind: "number",
        key: "mouseInfluence",
        group: "Background/Liquid",
        min: liquidMetalSchema.mouseInfluence.min,
        max: liquidMetalSchema.mouseInfluence.max,
        step: liquidMetalSchema.mouseInfluence.step,
        default: liquidMetalSchema.mouseInfluence.default,
        random: true,
      },
      {
        kind: "number",
        key: "metallicAmount",
        group: "Background/Liquid",
        min: liquidMetalSchema.metallicAmount.min,
        max: liquidMetalSchema.metallicAmount.max,
        step: liquidMetalSchema.metallicAmount.step,
        default: liquidMetalSchema.metallicAmount.default,
        random: true,
      },
      {
        kind: "number",
        key: "metallicSpeed",
        group: "Background/Liquid",
        min: liquidMetalSchema.metallicSpeed.min,
        max: liquidMetalSchema.metallicSpeed.max,
        step: liquidMetalSchema.metallicSpeed.step,
        default: liquidMetalSchema.metallicSpeed.default,
        random: true,
      },
      {
        kind: "number",
        key: "brightness",
        group: "Background/Liquid",
        min: liquidMetalSchema.brightness.min,
        max: liquidMetalSchema.brightness.max,
        step: liquidMetalSchema.brightness.step,
        default: liquidMetalSchema.brightness.default,
        random: true,
      },
      {
        kind: "number",
        key: "contrast",
        group: "Background/Liquid",
        min: liquidMetalSchema.contrast.min,
        max: liquidMetalSchema.contrast.max,
        step: liquidMetalSchema.contrast.step,
        default: liquidMetalSchema.contrast.default,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "tintHue",
        group: "Background/Liquid",
        min: liquidMetalSchema.tintHue.min,
        max: liquidMetalSchema.tintHue.max,
        step: liquidMetalSchema.tintHue.step,
        default: liquidMetalSchema.tintHue.default,
        random: true,
      },
      {
        kind: "number",
        key: "tintStrength",
        group: "Background/Liquid",
        min: liquidMetalSchema.tintStrength.min,
        max: liquidMetalSchema.tintStrength.max,
        step: liquidMetalSchema.tintStrength.step,
        default: liquidMetalSchema.tintStrength.default,
        random: true,
      },
      {
        kind: "number",
        key: "paletteStrength",
        group: "Background/Liquid",
        min: liquidMetalSchema.paletteStrength.min,
        max: liquidMetalSchema.paletteStrength.max,
        step: liquidMetalSchema.paletteStrength.step,
        default: liquidMetalSchema.paletteStrength.default,
        random: true,
      },
      {
        kind: "bool",
        key: "audioReactive",
        group: "Background/Liquid",
        default: liquidMetalSchema.audioReactive.default,
        advanced: true,
        random: false,
      },
      {
        kind: "number",
        key: "audioSensitivity",
        group: "Background/Liquid",
        min: liquidMetalSchema.audioSensitivity.min,
        max: liquidMetalSchema.audioSensitivity.max,
        step: liquidMetalSchema.audioSensitivity.step,
        default: liquidMetalSchema.audioSensitivity.default,
        random: true,
      },
    ] satisfies ParamDef[],
  },
} as const;

function randomNumber(
  param: NumberParam,
  energy: number | undefined,
  rng: RngLike
) {
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

function defaultsFromDefs(defs: readonly ParamDef[]) {
  const out: Record<string, unknown> = {};
  for (const def of defs) {
    out[def.key] = def.default;
  }
  return out;
}

function randomPatchFromDefs(
  defs: readonly ParamDef[],
  energy: number | undefined,
  rng: RngLike
) {
  const out: Record<string, unknown> = {};
  for (const def of defs) {
    if (def.random !== true) continue;
    if (def.kind === "number") {
      out[def.key] = randomNumber(
        { min: def.min, max: def.max, step: def.step, default: def.default },
        energy,
        rng
      );
    } else if (def.kind === "enum") {
      out[def.key] = randomEnum(
        { values: def.values, default: def.default },
        rng
      );
    } else if (def.kind === "bool") {
      // Avoid toggling booleans randomly unless explicitly requested.
      out[def.key] = def.default;
    }
  }
  return out;
}

export function getDefaultsForSchema(defs: readonly ParamDef[]) {
  return defaultsFromDefs(defs);
}

export function randomPatchForSchema(
  defs: readonly ParamDef[],
  energy: number | undefined,
  rng?: RngLike
) {
  const e = Number.isFinite(Number(energy)) ? Number(energy) : 0.5;
  return randomPatchFromDefs(defs, e, rng);
}

export function randomPatchAllForSchema(
  defs: readonly ParamDef[],
  energy: number | undefined,
  rng?: RngLike,
  opts?: { excludeKeys?: string[] }
) {
  const e = Number.isFinite(Number(energy)) ? Number(energy) : 0.5;
  const exclude = new Set((opts?.excludeKeys ?? []).map((x) => String(x)));
  const out: Record<string, unknown> = {};

  for (const def of defs) {
    if (exclude.has(def.key)) continue;
    if (def.kind === "number") {
      out[def.key] = randomNumber(
        { min: def.min, max: def.max, step: def.step, default: def.default },
        e,
        rng ?? { next: Math.random }
      );
    } else if (def.kind === "enum") {
      out[def.key] = randomEnum(
        { values: def.values, default: def.default },
        rng ?? { next: Math.random }
      );
    } else if (def.kind === "bool") {
      // Don't randomize booleans by default.
      // (Keeping layer enable flags stable makes the action predictable.)
      continue;
    }
  }

  return out;
}

export function randomizeBlendParams(energy: number, rng?: RngLike) {
  const patch = randomPatchFromDefs(paramSchema.projectm.blend, energy, rng);
  return {
    opacity: Number(patch.opacity ?? blendSchema.opacity.default),
    energyToOpacityAmount: Number(
      patch.energyToOpacityAmount ?? blendSchema.energyToOpacityAmount.default
    ),
    blendMode: (patch.blendMode ?? blendSchema.blendMode.default) as
      | "normal"
      | "add"
      | "screen"
      | "multiply",
  };
}

export function randomizeLiquidMetalParams(
  energy: number,
  rng?: RngLike,
  base?: Partial<LiquidMetalParamSchema> & Record<string, unknown>
) {
  const e = Number.isFinite(energy) ? energy : 0.5;

  const patch = randomPatchFromDefs(paramSchema.background.liquid, e, rng);
  const clampNum = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
  return {
    timeScale: Number(patch.timeScale ?? liquidMetalSchema.timeScale.default),
    iterations: Number(
      patch.iterations ?? liquidMetalSchema.iterations.default
    ),
    waveAmplitude: Number(
      patch.waveAmplitude ?? liquidMetalSchema.waveAmplitude.default
    ),
    mouseInfluence: Number(
      patch.mouseInfluence ?? liquidMetalSchema.mouseInfluence.default
    ),
    metallicAmount: clampNum(
      Number(patch.metallicAmount ?? liquidMetalSchema.metallicAmount.default),
      0,
      0.16
    ),
    metallicSpeed: Number(
      patch.metallicSpeed ?? liquidMetalSchema.metallicSpeed.default
    ),
    brightness: clampNum(
      Number(patch.brightness ?? liquidMetalSchema.brightness.default),
      0.6,
      1.05
    ),
    // contrast is random:false by default; keep current value when a base is supplied.
    contrast: Number(
      (base as any)?.contrast ?? liquidMetalSchema.contrast.default
    ),
    tintHue: Number(patch.tintHue ?? liquidMetalSchema.tintHue.default),
    tintStrength: clampNum(
      Number(patch.tintStrength ?? liquidMetalSchema.tintStrength.default),
      0,
      0.5
    ),
    paletteStrength: clampNum(
      Number(patch.paletteStrength ?? liquidMetalSchema.paletteStrength.default),
      0,
      0.5
    ),
    audioSensitivity: clampNum(
      Number(
        patch.audioSensitivity ?? liquidMetalSchema.audioSensitivity.default
      ),
      0.7,
      1.3
    ),
  };
}
