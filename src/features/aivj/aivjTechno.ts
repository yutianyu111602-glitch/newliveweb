import { AIVJ_MACRO_BANK } from "./aivjMacroBank";

export type TechnoProfileId =
  | "ambient"
  | "peakRave"
  | "dub"
  | "drone"
  | "videoVj"
  | "custom";

export type MacroTriple = { fusion: number; motion: number; sparkle: number };
export type MacroBank = { macros: MacroTriple; slots: number[] };

export type AivjRng = { next: () => number };

export type AivjTransition = {
  startMs: number;
  durationMs: number;
  from: MacroBank;
  to: MacroBank;
};

export type MacroBankSignalInput = {
  energy01: number;
  bass01: number;
  flux01: number;
  beatPulse01: number;
  // Optional: electronic-music-oriented sub-band features (0..1).
  // Prefer *Long for stage-friendly motion; raw is OK for sharp accents.
  kick01Raw?: number;
  kick01Long?: number;
  bass01Raw?: number;
  bass01Long?: number;
  clap01Raw?: number;
  clap01Long?: number;
  synth01Raw?: number;
  synth01Long?: number;
  hihat01Raw?: number;
  hihat01Long?: number;
  portraitEdge01?: number;
  profile: TechnoProfileId;
};

function clamp01(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep01(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function easeCos01(t: number) {
  const x = Math.min(1, Math.max(0, t));
  // Cosine ease-in-out (sinusoidal), avoids the “triangle wave” feel.
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

export function computeMacroBankIdeal(opts: MacroBankSignalInput): MacroBank {
  const energy = clamp01(opts.energy01, 0.5);
  const bass = clamp01(opts.bass01, 0);
  const flux = clamp01(opts.flux01, 0);
  const beat = clamp01(opts.beatPulse01, 0);
  const edge = clamp01(Number(opts.portraitEdge01 ?? 0), 0);

  const kick = clamp01(opts.kick01Long ?? opts.kick01Raw ?? 0, 0);
  const bassLong = clamp01(opts.bass01Long ?? opts.bass01Raw ?? bass, 0);
  const clap = clamp01(opts.clap01Long ?? opts.clap01Raw ?? 0, 0);
  const synth = clamp01(opts.synth01Long ?? opts.synth01Raw ?? 0, 0);
  const hihat = clamp01(opts.hihat01Long ?? opts.hihat01Raw ?? 0, 0);

  const profile = opts.profile;
  const profileBias =
    profile === "peakRave"
      ? { fusion: 0.06, motion: 0.12, sparkle: 0.16, slot: 1.1 }
      : profile === "videoVj"
      ? { fusion: 0.03, motion: 0.09, sparkle: 0.12, slot: 1.05 }
      : profile === "drone"
      ? { fusion: -0.12, motion: -0.16, sparkle: -0.18, slot: 0.75 }
      : profile === "ambient"
      ? { fusion: -0.06, motion: -0.1, sparkle: -0.12, slot: 0.85 }
      : profile === "dub"
      ? { fusion: 0.0, motion: -0.04, sparkle: -0.08, slot: 0.9 }
      : { fusion: 0, motion: 0, sparkle: 0, slot: 1 };

  const fusion = clamp01(
    0.4 + 0.22 * energy + 0.2 * bassLong + 0.14 * kick + 0.08 * edge + profileBias.fusion,
    0.5
  );
  const motion = clamp01(
    0.4 +
      0.18 * energy +
      0.16 * flux +
      0.18 * synth +
      0.08 * kick +
      0.14 * edge +
      profileBias.motion,
    0.5
  );
  const sparkle = clamp01(
    0.38 +
      0.14 * energy +
      0.2 * beat +
      0.22 * hihat +
      0.16 * clap +
      0.12 * edge +
      profileBias.sparkle,
    0.5
  );

  const slotMul = profileBias.slot;
  const slots = [
    clamp01(0.5 + slotMul * (0.16 * energy + 0.16 * kick + 0.16 * edge), 0.5),
    clamp01(0.5 + slotMul * (0.18 * flux + 0.14 * synth), 0.5),
    clamp01(0.5 + slotMul * (0.18 * beat + 0.14 * hihat), 0.5),
    clamp01(0.5 + slotMul * (0.16 * bassLong + 0.12 * kick), 0.5),
    clamp01(0.5 + slotMul * (0.1 * energy + 0.14 * clap + 0.12 * edge), 0.5),
  ];

  return { macros: { fusion, motion, sparkle }, slots };
}

export function blendMacroBank(
  user: MacroBank,
  ai: MacroBank,
  mix01: number
): MacroBank {
  const t = Math.min(1, Math.max(0, Number(mix01) || 0));
  const slots = AIVJ_MACRO_BANK.map((_, i) =>
    clamp01(lerp(user.slots[i] ?? 0.5, ai.slots[i] ?? 0.5, t), 0.5)
  );
  return {
    macros: {
      fusion: clamp01(lerp(user.macros.fusion, ai.macros.fusion, t), 0.5),
      motion: clamp01(lerp(user.macros.motion, ai.macros.motion, t), 0.5),
      sparkle: clamp01(lerp(user.macros.sparkle, ai.macros.sparkle, t), 0.5),
    },
    slots,
  };
}

export function randomMacroBankTarget(
  rng: AivjRng,
  opts: MacroBankSignalInput
): MacroBank {
  const energy = clamp01(opts.energy01, 0.5);
  const bass = clamp01(opts.bass01, 0);
  const flux = clamp01(opts.flux01, 0);
  const beat = clamp01(opts.beatPulse01, 0);
  const edge = clamp01(Number(opts.portraitEdge01 ?? 0), 0);

  const kick = clamp01(opts.kick01Long ?? opts.kick01Raw ?? 0, 0);
  const bassLong = clamp01(opts.bass01Long ?? opts.bass01Raw ?? bass, 0);
  const clap = clamp01(opts.clap01Long ?? opts.clap01Raw ?? 0, 0);
  const synth = clamp01(opts.synth01Long ?? opts.synth01Raw ?? 0, 0);
  const hihat = clamp01(opts.hihat01Long ?? opts.hihat01Raw ?? 0, 0);

  const style = opts.profile;
  const spread =
    style === "peakRave"
      ? 0.5
      : style === "videoVj"
      ? 0.45
      : style === "drone"
      ? 0.22
      : style === "dub"
      ? 0.3
      : 0.34;

  const pick = (center01: number, s = spread) =>
    clamp01(center01 + (rng.next() - 0.5) * 2 * Math.min(0.55, s), 0.5);

  const fusion = pick(
    0.4 + 0.22 * energy + 0.2 * bassLong + 0.14 * kick + 0.08 * edge,
    spread
  );
  const motion = pick(
    0.4 +
      0.18 * energy +
      0.16 * flux +
      0.18 * synth +
      0.08 * kick +
      0.14 * edge,
    spread
  );
  const sparkle = pick(
    0.38 +
      0.14 * energy +
      0.2 * beat +
      0.22 * hihat +
      0.16 * clap +
      0.12 * edge,
    spread
  );

  const slotSpread = Math.min(0.5, 0.24 + 0.22 * energy);
  const slots = [
    pick(0.5 + 0.16 * energy + 0.16 * kick + 0.16 * edge, slotSpread),
    pick(0.5 + 0.18 * flux + 0.14 * synth, slotSpread),
    pick(0.5 + 0.18 * beat + 0.14 * hihat, slotSpread),
    pick(0.5 + 0.16 * bassLong + 0.12 * kick, slotSpread),
    pick(0.5 + 0.1 * energy + 0.14 * clap + 0.12 * edge, slotSpread),
  ];

  return { macros: { fusion, motion, sparkle }, slots };
}

export function createAivjTransition(opts: {
  nowMs: number;
  from: MacroBank;
  to: MacroBank;
  durationMs: number;
}): AivjTransition {
  return {
    startMs: opts.nowMs,
    durationMs: Math.max(200, Math.floor(opts.durationMs)),
    from: opts.from,
    to: opts.to,
  };
}

export function sampleAivjTransition(
  tr: AivjTransition,
  nowMs: number
): { bank: MacroBank; done: boolean; t01: number } {
  const t = Math.min(1, Math.max(0, (nowMs - tr.startMs) / tr.durationMs));
  const e = easeCos01(t);

  const bank: MacroBank = {
    macros: {
      fusion: lerp(tr.from.macros.fusion, tr.to.macros.fusion, e),
      motion: lerp(tr.from.macros.motion, tr.to.macros.motion, e),
      sparkle: lerp(tr.from.macros.sparkle, tr.to.macros.sparkle, e),
    },
    slots: AIVJ_MACRO_BANK.map((_, i) =>
      lerp(tr.from.slots[i] ?? 0.5, tr.to.slots[i] ?? 0.5, e)
    ),
  };

  return { bank, done: t >= 1, t01: t };
}
