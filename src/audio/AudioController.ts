import { StreamAudioProcessor } from './StreamAudioProcessor';
import type { AudioData } from './types';

export type AudioFrameListener = (data: AudioData) => void;

export class AudioController {
  private processor: StreamAudioProcessor;
  private listeners = new Set<AudioFrameListener>();
  private rafId: number | null = null;
  private ready = false;

  constructor() {
    this.processor = new StreamAudioProcessor();
  }

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

  dispose() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.listeners.clear();
    this.processor.dispose();
    this.ready = false;
  }

  private startLoop() {
    if (this.rafId !== null) {
      return;
    }
    const tick = () => {
      if (this.processor.isInitialized) {
        const data = this.processor.getAnalysisData();
        this.listeners.forEach((listener) => listener(data));
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }
}
