export interface AudioConfig {
  fftSize: number;
  smoothingTimeConstant: number;
  minDecibels: number;
  maxDecibels: number;
  sampleRate?: number;
}

export interface AudioBands {
  low: number;
  mid: number;
  high: number;
}

export interface AudioData {
  pcm: Float32Array;
  pcmLeft?: Float32Array;
  pcmRight?: Float32Array;
  // Raw (pre-input-gain / pre-adaptive-gain) analysis. Optional; present when available.
  pcmRaw?: Float32Array;
  frequency: Uint8Array;
  frequencyLeft?: Uint8Array;
  frequencyRight?: Uint8Array;
  frequencyRaw?: Uint8Array;
  bands: AudioBands;
  bandsLeft?: AudioBands;
  bandsRight?: AudioBands;
  bandsRaw?: AudioBands;
  peak: number;
  rms: number;
  peakRaw?: number;
  rmsRaw?: number;
  peakLeft?: number;
  peakRight?: number;
  rmsLeft?: number;
  rmsRight?: number;
  time: number;
}
