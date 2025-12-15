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
  frequency: Uint8Array;
  bands: AudioBands;
  peak: number;
  rms: number;
  time: number;
}
