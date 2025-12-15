export type AudioFrame = {
  version: 1;
  timeSec: number;
  sampleRate: number;
  pcm2048Mono: Float32Array;
  pcm512Mono: Float32Array;
  pcm512StereoLR: { left: Float32Array; right: Float32Array };
  bands: { low: number; mid: number; high: number };
  rms: number;
  peak: number;
  energy: number; // 0..1 clamped, unified control signal
  isSilent: boolean;
};

