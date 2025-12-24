import type { AudioFrame } from "../../types/audioFrame";
import type { ExpressiveAudioSnapshot } from "../../audio/audioControls/expressiveAudioDriver";
import {
  computeMacroBankIdeal,
  createAivjTransition,
  sampleAivjTransition,
  type AivjRng,
  type AivjTransition,
  type MacroBank,
  type TechnoProfileId,
} from "./aivjTechno";

export type UnifiedAivjMode = "off" | "hold" | "midi" | "ai";

export type UnifiedAivjInput = {
  enabled: boolean;
  profile: TechnoProfileId;
  nowMs: number;

  midiLock: boolean;
  manualHoldUntilMs: number;
  morphHoldUntilMs?: number;

  frame: AudioFrame;
  baseBank: MacroBank;
  sectionState?: "CALM" | "GROOVE" | "PEAK";
  sectionIntensity01?: number;
  expressive?: ExpressiveAudioSnapshot;

  audioControls?: {
    enabled: boolean;
    mixToMacros01: number;
    fusion01: number;
    motion01: number;
    sparkle01: number;
  };

  beat?: {
    phase01: number;
    pulse01: number;
    confidence01: number;
    stability01: number;
  };

  portraitEdge01?: number;
};

export type UnifiedAivjOutput = {
  runtimeBank: MacroBank;
  commitSlowBankToState?: MacroBank;
  debug: {
    mode: UnifiedAivjMode;
    section: string;
    stage?: "CALM" | "GROOVE" | "PEAK";
    mix01: number;
    targetAgeMs: number;
    accent01?: number;
    slotPulse01?: number;
    accentSource?: "expressive" | "raw" | "none";
  };
};

type AccentDebug = {
  accent01: number;
  slotPulse01: number;
  accentSource: "expressive" | "raw" | "none";
};

function clamp01(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function expSmoothingAlpha(dtMs: number, tauMs: number) {
  const dt = Math.max(0, dtMs);
  const tau = Math.max(1, tauMs);
  return 1 - Math.exp(-dt / tau);
}

function clampDelta01(from: number, to: number, maxDelta: number) {
  const f = clamp01(from, 0.5);
  const t = clamp01(to, 0.5);
  const md = Math.max(0, Math.min(0.6, Number(maxDelta) || 0));
  return clamp01(Math.min(f + md, Math.max(f - md, t)), 0.5);
}

function softClamp01(value: number, min: number, max: number) {
  const v = clamp01(value, 0.5);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (v < lo) return Math.max(0, lo + (v - lo) * 0.35);
  if (v > hi) return Math.min(1, hi + (v - hi) * 0.35);
  return v;
}

export class UnifiedAivjController {
  private lastTriggerMs = 0;
  private transition: AivjTransition | null = null;
  private lastApplied: MacroBank = {
    macros: { fusion: 0.5, motion: 0.5, sparkle: 0.5 },
    slots: [0.5, 0.5, 0.5, 0.5, 0.5],
  };
  private trajectoryBank: MacroBank | null = null;
  private trajectoryNoise: MacroBank = {
    macros: { fusion: 0, motion: 0, sparkle: 0 },
    slots: [0, 0, 0, 0, 0],
  };
  private trajectoryNoiseTarget: MacroBank = {
    macros: { fusion: 0, motion: 0, sparkle: 0 },
    slots: [0, 0, 0, 0, 0],
  };
  private trajectoryLastMs = 0;
  private trajectoryNoiseLastMs = 0;

  private lastBeatPhase01 = 0;
  private beatCount = 0;

  private accent01 = 0;
  private lastAccentMs = 0;
  private accentDebug: AccentDebug = {
    accent01: 0,
    slotPulse01: 0,
    accentSource: "none",
  };
  private cachedAccentProfile: ReturnType<
    UnifiedAivjController["getAccentProfile"]
  > | null = null;
  private cachedAccentProfileId: TechnoProfileId | null = null;

  constructor(private readonly rng: AivjRng) {}

  private getAccentProfile(profile: TechnoProfileId) {
    // Cache result to avoid object allocation per frame.
    if (this.cachedAccentProfileId === profile && this.cachedAccentProfile) {
      return this.cachedAccentProfile;
    }

    let result: ReturnType<UnifiedAivjController["getAccentProfile"]>;
    if (profile === "peakRave") {
      result = {
        deltaMul: 1.2,
        durationMul: 1.1,
        macroMul: 1.15,
        fusionMul: 1.1,
        slotMul: 1.1,
      };
    } else if (profile === "videoVj") {
      result = {
        deltaMul: 1.05,
        durationMul: 1.0,
        macroMul: 1.05,
        fusionMul: 1.0,
        slotMul: 1.0,
      };
    } else if (profile === "dub") {
      result = {
        deltaMul: 0.95,
        durationMul: 1.05,
        macroMul: 0.95,
        fusionMul: 0.95,
        slotMul: 0.95,
      };
    } else if (profile === "drone") {
      result = {
        deltaMul: 0.8,
        durationMul: 1.1,
        macroMul: 0.8,
        fusionMul: 0.9,
        slotMul: 0.85,
      };
    } else if (profile === "ambient") {
      result = {
        deltaMul: 0.85,
        durationMul: 1.05,
        macroMul: 0.85,
        fusionMul: 0.9,
        slotMul: 0.9,
      };
    } else {
      result = {
        deltaMul: 1.0,
        durationMul: 1.0,
        macroMul: 1.0,
        fusionMul: 1.0,
        slotMul: 1.0,
      };
    }

    this.cachedAccentProfileId = profile;
    this.cachedAccentProfile = result;
    return result;
  }

  requestImmediateTrigger() {
    this.lastTriggerMs = 0;
  }

  resetToBase(base: MacroBank, nowMs: number) {
    this.transition = null;
    this.lastApplied = base;
    this.lastTriggerMs = nowMs;
    this.lastAccentMs = nowMs;
    this.accent01 = 0;
    this.resetAccentDebug();
    this.trajectoryBank = base;
    this.trajectoryNoise = {
      macros: { fusion: 0, motion: 0, sparkle: 0 },
      slots: [0, 0, 0, 0, 0],
    };
    this.trajectoryNoiseTarget = {
      macros: { fusion: 0, motion: 0, sparkle: 0 },
      slots: [0, 0, 0, 0, 0],
    };
    this.trajectoryLastMs = nowMs;
    this.trajectoryNoiseLastMs = nowMs;
  }

  onFrame(input: UnifiedAivjInput): UnifiedAivjOutput {
    const stage = input.sectionState ?? "GROOVE";
    const allowAutomation =
      !input.midiLock && input.nowMs >= input.manualHoldUntilMs;

    if (!input.enabled) {
      // AIVJ off: still allow AudioControls (unified single-writer).
      this.resetAccentDebug();
      const accent = this.accentDebug;
      const bank = this.applyAudioControls(input.baseBank, input.audioControls);
      return {
        runtimeBank: bank,
        debug: {
          mode: input.midiLock
            ? "midi"
            : input.nowMs < input.manualHoldUntilMs
            ? "hold"
            : "off",
          section: "off",
          stage,
          mix01: clamp01(input.audioControls?.mixToMacros01 ?? 0, 0),
          targetAgeMs: 0,
          accent01: accent.accent01,
          slotPulse01: accent.slotPulse01,
          accentSource: accent.accentSource,
        },
      };
    }

    if (!allowAutomation) {
      // Hold/midi lock: freeze AI, do not apply audio-derived macros (user wants stability).
      this.resetToBase(input.baseBank, input.nowMs);
      const accent = this.accentDebug;
      return {
        runtimeBank: input.baseBank,
        debug: {
          mode: input.midiLock ? "midi" : "hold",
          section: "blocked",
          stage,
          mix01: 0,
          targetAgeMs: 0,
          accent01: accent.accent01,
          slotPulse01: accent.slotPulse01,
          accentSource: accent.accentSource,
        },
      };
    }

    const morphHoldActive = input.nowMs < (input.morphHoldUntilMs ?? 0);
    if (morphHoldActive && this.transition) {
      const sampled = sampleAivjTransition(this.transition, input.nowMs);
      this.transition = null;
      this.lastApplied = sampled.bank;
    }
    // Scheme B: when no transition is active, keep AI baseline aligned with saved slow bank.
    if (!this.transition && !morphHoldActive) {
      this.lastApplied = input.baseBank;
    }

    // --- Beat-aligned target scheduling (fallback to time-based) ---
    const beat = input.beat;
    const phase01 = clamp01(beat?.phase01 ?? 0, 0);
    const conf01 = clamp01(beat?.confidence01 ?? 0, 0);
    const stab01 = clamp01(beat?.stability01 ?? 0, 0);

    const drive = input.expressive;
    const beatQuality01 = clamp01(Math.max(conf01, stab01), 0);
    const beatStable = drive?.beatTrusted ?? beatQuality01 >= 0.5;
    const wrapped = beatStable && phase01 < this.lastBeatPhase01 - 0.5;
    this.lastBeatPhase01 = phase01;

    if (wrapped) {
      this.beatCount++;
    }

    const baseBeatsPerUpdate =
      stage === "PEAK" ? 8 : stage === "CALM" ? 24 : 16;
    const beatSlowdown = 1 + (1 - beatQuality01) * 1.6;
    const beatsPerUpdate = Math.max(
      6,
      Math.min(48, Math.round(baseBeatsPerUpdate * beatSlowdown))
    );
    const shouldTriggerBeat =
      beatStable && wrapped && this.beatCount % beatsPerUpdate === 0;

    const baseTimeGateMs =
      stage === "PEAK" ? 3200 : stage === "CALM" ? 5200 : 4200;
    const timeGateMs = baseTimeGateMs * (1 + (1 - beatQuality01) * 1.2);
    const shouldTriggerTime =
      this.lastTriggerMs === 0 || input.nowMs - this.lastTriggerMs > timeGateMs;

    const shouldTrigger =
      !morphHoldActive &&
      (shouldTriggerBeat ||
        (!beatStable && shouldTriggerTime) ||
        this.lastTriggerMs === 0);

    // If a transition is in-flight, start future transitions from the current sampled bank.
    const currentSlowBank = this.transition
      ? sampleAivjTransition(this.transition, input.nowMs).bank
      : this.lastApplied;

    let commitSlowBankToState: MacroBank | undefined;

    const frame = input.frame;
    const energy01Base =
      frame.isSilentRaw ?? frame.isSilent
        ? 0.35
        : clamp01((frame as any).energyRaw ?? frame.energy ?? 0, 0.35);
    const energy01 = clamp01(drive?.energy01 ?? energy01Base, 0.35);
    const bass01 = clamp01(drive?.bass01 ?? frame.bands?.low ?? 0, 0);
    const flux01 = clamp01(
      drive?.flux01 ?? (frame.features as any)?.flux ?? 0,
      0
    );
    const beatPulse01 = clamp01(
      drive?.beatPulse01 ??
        beat?.pulse01 ??
        (frame.features as any)?.beatPulse ??
        0,
      0
    );
    const onsetRate2s = clamp01((drive?.onsetRate2s ?? 0) / 2.6, 0);
    const accentDriveRaw = clamp01(drive?.accent01 ?? 0, 0);
    const accentDrive = beatStable ? accentDriveRaw : accentDriveRaw * 0.35;
    const profile = input.profile;
    const accentProfile = this.getAccentProfile(profile);

    const idealTarget = computeMacroBankIdeal({
      energy01,
      bass01,
      flux01,
      beatPulse01,
      kick01Raw: (frame.features as any)?.kick01Raw ?? 0,
      kick01Long: (frame.features as any)?.kick01Long ?? 0,
      bass01Raw: (frame.features as any)?.bass01Raw ?? 0,
      bass01Long: (frame.features as any)?.bass01Long ?? 0,
      clap01Raw: (frame.features as any)?.clap01Raw ?? 0,
      clap01Long: (frame.features as any)?.clap01Long ?? 0,
      synth01Raw: (frame.features as any)?.synth01Raw ?? 0,
      synth01Long: (frame.features as any)?.synth01Long ?? 0,
      hihat01Raw: (frame.features as any)?.hihat01Raw ?? 0,
      hihat01Long: (frame.features as any)?.hihat01Long ?? 0,
      portraitEdge01: input.portraitEdge01 ?? 0,
      profile,
    });

    const dtMs =
      this.trajectoryLastMs > 0 ? input.nowMs - this.trajectoryLastMs : 0;
    this.trajectoryLastMs = input.nowMs;
    if (!this.trajectoryBank) {
      this.trajectoryBank = currentSlowBank;
    }
    const noiseIntervalMs =
      stage === "PEAK" ? 1300 : stage === "CALM" ? 2200 : 1700;
    const noiseTauMs = stage === "PEAK" ? 1200 : stage === "CALM" ? 1800 : 1500;
    if (
      this.trajectoryNoiseLastMs === 0 ||
      input.nowMs - this.trajectoryNoiseLastMs > noiseIntervalMs
    ) {
      this.trajectoryNoiseLastMs = input.nowMs;
      const amp = stage === "PEAK" ? 0.06 : stage === "CALM" ? 0.03 : 0.045;
      const pick = () => (this.rng.next() - 0.5) * 2 * amp;
      this.trajectoryNoiseTarget = {
        macros: {
          fusion: pick(),
          motion: pick(),
          sparkle: pick(),
        },
        slots: [pick(), pick(), pick(), pick(), pick()],
      };
    }
    const noiseAlpha = expSmoothingAlpha(dtMs, noiseTauMs);
    const noise = this.trajectoryNoise;
    const noiseTarget = this.trajectoryNoiseTarget;
    noise.macros = {
      fusion: lerp(noise.macros.fusion, noiseTarget.macros.fusion, noiseAlpha),
      motion: lerp(noise.macros.motion, noiseTarget.macros.motion, noiseAlpha),
      sparkle: lerp(
        noise.macros.sparkle,
        noiseTarget.macros.sparkle,
        noiseAlpha
      ),
    };
    noise.slots = noise.slots.map((v, i) =>
      lerp(v, noiseTarget.slots[i] ?? 0, noiseAlpha)
    );
    this.trajectoryNoise = noise;

    const trajectoryTauMs =
      (stage === "PEAK" ? 900 : stage === "CALM" ? 1700 : 1200) *
      (1.4 - 0.6 * beatQuality01);
    const trajAlpha = expSmoothingAlpha(dtMs, trajectoryTauMs);
    const applyNoise = (value: number, offset: number) =>
      clamp01(value + offset, value);
    const trajectory = this.trajectoryBank;
    this.trajectoryBank = {
      macros: {
        fusion: clamp01(
          lerp(
            trajectory.macros.fusion,
            applyNoise(idealTarget.macros.fusion, noise.macros.fusion),
            trajAlpha
          ),
          trajectory.macros.fusion
        ),
        motion: clamp01(
          lerp(
            trajectory.macros.motion,
            applyNoise(idealTarget.macros.motion, noise.macros.motion),
            trajAlpha
          ),
          trajectory.macros.motion
        ),
        sparkle: clamp01(
          lerp(
            trajectory.macros.sparkle,
            applyNoise(idealTarget.macros.sparkle, noise.macros.sparkle),
            trajAlpha
          ),
          trajectory.macros.sparkle
        ),
      },
      slots: trajectory.slots.map((v, i) =>
        clamp01(
          lerp(
            v,
            applyNoise(idealTarget.slots[i] ?? 0.5, noise.slots[i] ?? 0),
            trajAlpha
          ),
          v
        )
      ),
    };

    if (shouldTrigger) {
      this.lastTriggerMs = input.nowMs;
      const trajectoryTarget = this.trajectoryBank ?? idealTarget;
      const target: MacroBank = {
        macros: { ...trajectoryTarget.macros },
        slots: [...trajectoryTarget.slots],
      };

      const baseMacroDelta =
        profile === "peakRave"
          ? 0.26
          : profile === "drone"
          ? 0.12
          : profile === "videoVj"
          ? 0.22
          : 0.18;
      const sectionDeltaMul =
        stage === "PEAK" ? 1.15 : stage === "CALM" ? 0.85 : 1;
      const onsetDeltaMul = 1 + 0.18 * onsetRate2s;
      const accentDeltaMul = 1 + 0.25 * accentDrive * accentProfile.deltaMul;
      const maxMacroDelta = Math.min(
        0.36,
        baseMacroDelta *
          sectionDeltaMul *
          onsetDeltaMul *
          (0.7 + 0.6 * beatQuality01) *
          accentDeltaMul
      );
      const maxSlotDelta = Math.min(
        0.36,
        maxMacroDelta + 0.08 + 0.04 * accentDrive
      );

      target.macros.fusion = clampDelta01(
        currentSlowBank.macros.fusion,
        target.macros.fusion,
        maxMacroDelta
      );
      target.macros.motion = clampDelta01(
        currentSlowBank.macros.motion,
        target.macros.motion,
        maxMacroDelta
      );
      target.macros.sparkle = clampDelta01(
        currentSlowBank.macros.sparkle,
        target.macros.sparkle,
        maxMacroDelta
      );
      target.slots = target.slots.map((v, i) =>
        clampDelta01(currentSlowBank.slots[i] ?? 0.5, v, maxSlotDelta)
      );

      const baseDurationMs =
        profile === "peakRave" ? 2200 : profile === "drone" ? 7000 : 4200;
      const sectionDurationMul =
        stage === "PEAK" ? 0.75 : stage === "CALM" ? 1.35 : 1;
      const accentDurationMul = Math.max(
        0.7,
        1 - 0.25 * accentDrive * accentProfile.durationMul
      );
      const durationMs = Math.max(
        1800,
        Math.min(
          9000,
          Math.round(
            baseDurationMs *
              (1.25 - 0.55 * energy01) *
              sectionDurationMul *
              (1.3 - 0.5 * beatQuality01) *
              (1 - 0.2 * onsetRate2s) *
              accentDurationMul
          )
        )
      );

      this.transition = createAivjTransition({
        nowMs: input.nowMs,
        from: currentSlowBank,
        to: target,
        durationMs,
      });
    }

    // Sample/advance transition.
    let slowBank: MacroBank = currentSlowBank;
    let slowAgeMs = 0;
    if (this.transition) {
      const sampled = sampleAivjTransition(this.transition, input.nowMs);
      slowBank = sampled.bank;
      slowAgeMs = Math.max(0, input.nowMs - this.transition.startMs);
      if (sampled.done) {
        this.lastApplied = sampled.bank;
        this.transition = null;
        commitSlowBankToState = this.lastApplied;
      }
    } else {
      // No transition: keep AI aligned with the saved slow bank.
      this.lastApplied = input.baseBank;
      slowBank = input.baseBank;
    }

    // --- AudioControls macro mix (runtime-only) ---
    const afterAudio = this.applyAudioControls(slowBank, input.audioControls);

    // --- Accent layer (runtime-only) ---
    const withAccent = this.applyAccent(afterAudio, input);
    const guarded = this.applyToneGuard(withAccent, input);

    const accent = this.accentDebug;
    return {
      runtimeBank: guarded,
      commitSlowBankToState,
      debug: {
        mode: "ai",
        section: this.transition ? "transition" : beatStable ? "beat" : "free",
        stage,
        mix01: clamp01(input.audioControls?.mixToMacros01 ?? 0, 0),
        targetAgeMs: slowAgeMs,
        accent01: accent.accent01,
        slotPulse01: accent.slotPulse01,
        accentSource: accent.accentSource,
      },
    };
  }

  private applyAudioControls(
    base: MacroBank,
    audio?: UnifiedAivjInput["audioControls"]
  ) {
    if (!audio?.enabled) return base;

    const mix01 = clamp01(audio.mixToMacros01, 0);
    if (mix01 <= 0.0001) return base;

    return {
      macros: {
        fusion: clamp01(lerp(base.macros.fusion, audio.fusion01, mix01), 0.5),
        motion: clamp01(lerp(base.macros.motion, audio.motion01, mix01), 0.5),
        sparkle: clamp01(
          lerp(base.macros.sparkle, audio.sparkle01, mix01),
          0.5
        ),
      },
      slots: base.slots,
    };
  }

  private applyAccent(bank: MacroBank, input: UnifiedAivjInput): MacroBank {
    const nowMs = input.nowMs;
    const dtMs = this.lastAccentMs > 0 ? nowMs - this.lastAccentMs : 0;
    this.lastAccentMs = nowMs;

    const frame = input.frame;
    const clamp01Local = (v: unknown, fb = 0) => clamp01(v, fb);
    const drive = input.expressive;

    if (drive && Number.isFinite(drive.accent01)) {
      const accent = clamp01(Number(drive.accent01), 0);
      this.accent01 = accent;
      if (accent <= 0.0005) {
        this.setAccentDebug(accent, 0, "expressive");
        return bank;
      }

      const section = input.sectionState ?? "GROOVE";
      const sectionIntensity = clamp01(
        input.sectionIntensity01 ?? frame.energy ?? 0,
        0
      );
      const sectionMul =
        section === "PEAK" ? 1.25 : section === "CALM" ? 0.75 : 1;
      const intensityMul = 0.85 + 0.25 * sectionIntensity;
      const boostMul = sectionMul * intensityMul;

      const accentProfile = this.getAccentProfile(input.profile);
      const body01 = clamp01(drive.energySlow01 ?? frame.energy ?? 0, 0);
      const bass01 = clamp01(drive.bass01 ?? frame.bands?.low ?? 0, 0);
      const bodyDrive = 0.6 * body01 + 0.4 * bass01; // Already in [0,1]
      const gateBoost = Math.max(0, Math.min(1, (drive.gateBoost ?? 1) - 1));
      const gateMul = 1 + 0.35 * gateBoost;

      const macroMul = accentProfile.macroMul * gateMul;
      const accentBoost = accent * boostMul * macroMul;
      const sparkleBoost = 0.3 * accentBoost;
      const motionBoost = 0.13 * accentBoost;
      const fusionBoost =
        0.03 * bodyDrive * (0.7 + 0.3 * accent) * accentProfile.fusionMul;
      const slotPulse = 0.065 * accentBoost * accentProfile.slotMul;
      // Inline slot weights to avoid array lookup overhead.
      const nextSlots = [
        clamp01(bank.slots[0] + slotPulse * 0.8, 0.5),
        clamp01(bank.slots[1] + slotPulse * 0.45, 0.5),
        clamp01(bank.slots[2] + slotPulse * 0.55, 0.5),
        clamp01(bank.slots[3] + slotPulse * 0.75, 0.5),
        clamp01(bank.slots[4] + slotPulse * 0.6, 0.5),
      ];

      this.setAccentDebug(accent, slotPulse, "expressive");
      return {
        macros: {
          fusion: clamp01(bank.macros.fusion + fusionBoost, 0.5),
          motion: clamp01(bank.macros.motion + motionBoost, 0.5),
          sparkle: clamp01(bank.macros.sparkle + sparkleBoost, 0.5),
        },
        slots: nextSlots,
      };
    }

    const kick = clamp01Local(
      (frame.features as any)?.kick01Raw ??
        (frame.features as any)?.kick01Long ??
        0,
      0
    );
    const clap = clamp01Local(
      (frame.features as any)?.clap01Raw ??
        (frame.features as any)?.clap01Long ??
        0,
      0
    );
    const hihat = clamp01Local(
      (frame.features as any)?.hihat01Raw ??
        (frame.features as any)?.hihat01Long ??
        0,
      0
    );
    const beatPulse = clamp01Local(
      input.beat?.pulse01 ?? (frame.features as any)?.beatPulse ?? 0,
      0
    );

    // Raw-first transient accent.
    const rawAccent = clamp01(
      0.65 * kick + 0.25 * hihat + 0.2 * clap + 0.15 * beatPulse,
      0
    );

    // Attack fast, release moderately fast (snappy but smooth).
    const attackMs = 60;
    const releaseMs = 150; // Reduced from 220ms: better for fast BPM (techno/dnb)
    const tauMs = rawAccent >= this.accent01 ? attackMs : releaseMs;
    const a = expSmoothingAlpha(dtMs, tauMs);
    this.accent01 = this.accent01 + (rawAccent - this.accent01) * a;

    const accent = clamp01(this.accent01, 0);
    if (accent <= 0.0005) {
      this.setAccentDebug(accent, 0, "raw");
      return bank;
    }

    const section = input.sectionState ?? "GROOVE";
    const sectionIntensity = clamp01(
      input.sectionIntensity01 ?? frame.energy ?? 0,
      0
    );
    const sectionMul =
      section === "PEAK" ? 1.25 : section === "CALM" ? 0.75 : 1;
    const intensityMul = 0.85 + 0.25 * sectionIntensity;
    const boostMul = sectionMul * intensityMul;

    const body01 = clamp01(frame.energy ?? 0, 0);
    const bass01 = clamp01(frame.bands?.low ?? 0, 0);
    const bodyDrive = Math.min(1, 0.6 * body01 + 0.4 * bass01);
    const accentProfile = this.getAccentProfile(input.profile);
    const macroMul = accentProfile.macroMul;
    const sparkleBoost = 0.3 * accent * boostMul * macroMul;
    const motionBoost = 0.13 * accent * boostMul * macroMul;
    const fusionBoost =
      0.03 * bodyDrive * (0.7 + 0.3 * accent) * accentProfile.fusionMul;
    const slotPulse =
      0.065 * accent * boostMul * macroMul * accentProfile.slotMul;
    const slotWeights = [0.8, 0.45, 0.55, 0.75, 0.6];
    const nextSlots = bank.slots.map((v, i) =>
      clamp01((v ?? 0.5) + slotPulse * (slotWeights[i] ?? 0.55), 0.5)
    );

    this.setAccentDebug(accent, slotPulse, "raw");
    return {
      macros: {
        fusion: clamp01(bank.macros.fusion + fusionBoost, 0.5),
        motion: clamp01(bank.macros.motion + motionBoost, 0.5),
        sparkle: clamp01(bank.macros.sparkle + sparkleBoost, 0.5),
      },
      slots: nextSlots,
    };
  }

  private applyToneGuard(bank: MacroBank, input: UnifiedAivjInput): MacroBank {
    const stage = input.sectionState ?? "GROOVE";
    const base =
      stage === "PEAK"
        ? { min: 0.28, max: 0.92 }
        : stage === "CALM"
        ? { min: 0.34, max: 0.84 }
        : { min: 0.31, max: 0.88 };
    const slotMin = 0.22;
    const slotMax = 0.9;

    return {
      macros: {
        fusion: softClamp01(bank.macros.fusion, base.min + 0.01, base.max),
        motion: softClamp01(bank.macros.motion, base.min, base.max + 0.02),
        sparkle: softClamp01(bank.macros.sparkle, base.min, base.max + 0.04),
      },
      slots: bank.slots.map((v) => softClamp01(v ?? 0.5, slotMin, slotMax)),
    };
  }

  private setAccentDebug(
    accent01: number,
    slotPulse01: number,
    accentSource: AccentDebug["accentSource"]
  ) {
    this.accentDebug = {
      accent01: clamp01(accent01, 0),
      slotPulse01: clamp01(slotPulse01, 0),
      accentSource,
    };
  }

  private resetAccentDebug() {
    this.accentDebug = {
      accent01: 0,
      slotPulse01: 0,
      accentSource: "none",
    };
  }
}
