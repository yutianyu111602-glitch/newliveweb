export type AudioFrame = {
  version: 1;
  timeSec: number;
  sampleRate: number;
  pcm2048Mono: Float32Array;
  pcm512Mono: Float32Array;
  // Raw (pre-input-gain / pre-adaptive-gain). Present when available (notably for live inputs).
  pcm2048MonoRaw?: Float32Array;
  pcm512MonoRaw?: Float32Array;
  pcm512StereoLR: { left: Float32Array; right: Float32Array };
  bands: { low: number; mid: number; high: number };
  bandsRaw?: { low: number; mid: number; high: number };
  bandsStage?: { low: number; mid: number; high: number };
  rms: number;
  peak: number;
  rmsRaw?: number;
  peakRaw?: number;
  energyRaw?: number; // optional raw value for diagnostics/debug; may be omitted
  energy: number; // 0..1 clamped, unified control signal
  features?: {
    flux?: number; // 0..1 (spectral-change proxy)
    centroid?: number; // 0..1 (normalized)
    loudness?: number; // 0..1 (normalized)
    flatness?: number; // 0..1
    zcr?: number; // 0..1 (normalized)

    // Electronic-music-oriented sub-band features (0..1).
    // - Raw: immediate response (from analyser frequency bins)
    // - Long: attack/release smoothed for "long tail" stage-friendly motion
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

    tempoBpm?: number; // 0..260
    beatPhase?: number; // 0..1
    beatPulse?: number; // 0..1
    beatConfidence?: number; // 0..1
    beatStability?: number; // 0..1 (derived from BPM stability)
  };
  isSilent: boolean;
  // Optional: silence detection based on raw (pre-input-gain / pre-adaptive-gain) metrics.
  // When absent, consumers should fall back to isSilent.
  isSilentRaw?: boolean;
};
