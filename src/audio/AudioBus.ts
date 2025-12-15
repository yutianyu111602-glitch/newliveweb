import { StreamAudioProcessor } from './StreamAudioProcessor';
import type { AudioFrame } from '../types/audioFrame';
import type { AudioData } from './types';

type AudioFrameListener = (frame: AudioFrame) => void;

const TARGET_PCM = 512;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function resampleTo512(src: Float32Array): Float32Array {
  const target = new Float32Array(TARGET_PCM);
  if (!src.length) return target;
  const step = src.length / TARGET_PCM;
  for (let i = 0; i < TARGET_PCM; i++) {
    const idx = Math.min(src.length - 1, Math.floor(i * step));
    target[i] = src[idx] ?? 0;
  }
  return target;
}

export class AudioBus {
  private processor = new StreamAudioProcessor();
  private listeners = new Set<AudioFrameListener>();
  private rafId: number | null = null;
  private latestFrame: AudioFrame | null = null;
  private ready = false;

  async loadFile(file: File) {
    await this.processor.loadFile(file, { loop: true });
    this.ready = true;
    this.startLoop();
    this.play();
  }

  async loadUrl(url: string) {
    await this.processor.loadFromUrl(url, { loop: true });
    this.ready = true;
    this.startLoop();
    this.play();
  }

  onFrame(listener: AudioFrameListener): () => void {
    this.listeners.add(listener);
    this.startLoop();
    return () => this.listeners.delete(listener);
  }

  subscribe(cb: (frame: AudioFrame) => void): () => void {
    return this.onFrame(cb);
  }

  getSnapshot(): AudioFrame | null {
    return this.latestFrame;
  }

  play() {
    if (!this.ready) return;
    this.processor.play();
    this.startLoop();
  }

  pause() {
    this.processor.pause();
  }

  toggle() {
    if (!this.ready) return;
    this.processor.toggle();
    this.startLoop();
  }

  setVolume(volume: number) {
    this.processor.setVolume(volume);
  }

  setLoop(loop: boolean) {
    this.processor.setLoop(loop);
  }

  async resumeContext() {
    await this.processor.resumeContext();
  }

  dispose() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.listeners.clear();
    this.processor.dispose();
    this.ready = false;
  }

  get isReady() {
    return this.ready;
  }

  get isPlaying() {
    return this.processor.isPlaying;
  }

  get currentTime() {
    return this.processor.currentTime;
  }

  get duration() {
    return this.processor.duration;
  }

  get audioContextState(): AudioContextState | 'uninitialized' {
    const ctx = (this.processor as any).audioContext as AudioContext | null | undefined;
    return ctx?.state ?? 'uninitialized';
  }

  private startLoop() {
    if (this.rafId !== null) return;
    const tick = () => {
      const data = this.processor.getAnalysisData();
      this.latestFrame = this.buildFrame(data);
      this.listeners.forEach((listener) => listener(this.latestFrame!));
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private buildFrame(data: AudioData): AudioFrame {
    const pcm512 = resampleTo512(data.pcm);
    const energy = clamp01(Math.max(data.peak ?? 0, (data.rms ?? 0) * 1.5));
    const silent = energy < 1e-3 && (data.peak ?? 0) < 1e-3;
    return {
      version: 1,
      timeSec: data.time ?? 0,
      sampleRate: this.processor.currentSampleRate,
      pcm2048Mono: data.pcm,
      pcm512Mono: pcm512,
      pcm512StereoLR: { left: pcm512, right: pcm512 },
      bands: data.bands,
      rms: data.rms,
      peak: data.peak,
      energy,
      isSilent: silent
    };
  }
}

