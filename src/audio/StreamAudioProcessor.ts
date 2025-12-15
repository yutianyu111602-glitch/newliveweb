import type { AudioBands, AudioConfig, AudioData } from './types';

export type StreamAudioSource = 'file' | 'url' | 'element';

const DEFAULT_CONFIG: AudioConfig = {
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
  minDecibels: -95,
  maxDecibels: -10,
  sampleRate: undefined
};

export class StreamAudioProcessor {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private audioElement: HTMLAudioElement | null = null;

  private pcmBuffer: Float32Array<ArrayBuffer>;
  private frequencyBuffer: Uint8Array<ArrayBuffer>;
  private config: AudioConfig;
  private startTime = 0;
  private loop = true;
  private sourceType: StreamAudioSource | null = null;

  constructor(config: Partial<AudioConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pcmBuffer = new Float32Array(this.config.fftSize) as Float32Array<ArrayBuffer>;
    this.frequencyBuffer = new Uint8Array(this.config.fftSize / 2) as Uint8Array<ArrayBuffer>;
  }

  async loadFromUrl(url: string, opts: { loop?: boolean } = {}): Promise<void> {
    this.loop = opts.loop ?? true;
    await this.ensureContext();
    await this.prepareElement(url);
    this.sourceType = 'url';
  }

  async loadFile(file: File, opts: { loop?: boolean } = {}): Promise<void> {
    const blobUrl = URL.createObjectURL(file);
    try {
      await this.loadFromUrl(blobUrl, opts);
      this.sourceType = 'file';
    } catch (error) {
      URL.revokeObjectURL(blobUrl);
      throw error;
    }
  }

  async attachElement(element: HTMLAudioElement, opts: { loop?: boolean } = {}): Promise<void> {
    this.teardownMediaElement();
    this.loop = opts.loop ?? true;
    await this.ensureContext();
    element.loop = this.loop;
    await this.waitForReady(element);
    this.connectElement(element);
    this.audioElement = element;
    this.sourceType = 'element';
    this.startTime = this.audioContext?.currentTime ?? 0;
  }

  private async prepareElement(url: string): Promise<void> {
    this.teardownMediaElement();
    const audio = this.createAudioElement(url);
    audio.loop = this.loop;
    await this.waitForReady(audio);
    this.connectElement(audio);
    this.audioElement = audio;
    this.startTime = this.audioContext?.currentTime ?? 0;
  }

  private async ensureContext(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate });
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    if (!this.analyser) {
      this.initAnalyser();
    }
    if (!this.gainNode && this.audioContext) {
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1;
      this.gainNode.connect(this.audioContext.destination);
    }
  }

  private initAnalyser(): void {
    if (!this.audioContext) return;
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.config.fftSize;
    this.analyser.smoothingTimeConstant = this.config.smoothingTimeConstant;
    this.analyser.minDecibels = this.config.minDecibels;
    this.analyser.maxDecibels = this.config.maxDecibels;
  }

  private connectElement(element: HTMLAudioElement): void {
    if (!this.audioContext || !this.analyser || !this.gainNode) {
      throw new Error('Audio nodes not initialized');
    }
    this.audioElement = element;
    this.sourceNode = this.audioContext.createMediaElementSource(element);
    this.sourceNode.connect(this.analyser);
    this.analyser.connect(this.gainNode);
  }

  private createAudioElement(url: string): HTMLAudioElement {
    const audio = new Audio();
    audio.src = url;
    // Only set crossOrigin for remote URLs. For same-origin and Vite /@fs/ URLs,
    // forcing CORS can cause unexpected load failures in some environments.
    if (/^https?:\/\//i.test(url)) {
      audio.crossOrigin = 'anonymous';
    }
    audio.preload = 'auto';
    audio.controls = false;
    audio.loop = this.loop;
  audio.setAttribute('playsinline', 'true');
    return audio;
  }

  private waitForReady(element: HTMLAudioElement): Promise<void> {
    if (element.readyState >= 2) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (event: Event) => {
        cleanup();
        const mediaError = element.error;
        const code = mediaError?.code;
        const src = element.currentSrc || element.src;
        const detail = `code=${code ?? 'unknown'} networkState=${element.networkState} readyState=${element.readyState}`;
        reject(new Error(`Audio element error (${detail}) src=${src}`));
      };
      const cleanup = () => {
        element.removeEventListener('canplay', onReady);
        element.removeEventListener('error', onError);
      };
      element.addEventListener('canplay', onReady, { once: true });
      element.addEventListener('error', onError, { once: true });
      element.load();
    });
  }

  getAnalysisData(): AudioData {
    if (!this.analyser || !this.audioContext) {
      return this.getEmptyData();
    }

    this.analyser.getFloatTimeDomainData(this.pcmBuffer);
    this.analyser.getByteFrequencyData(this.frequencyBuffer);

    const bands = this.calculateBands();
    const peak = this.calculatePeak(this.pcmBuffer);
    const rms = this.calculateRMS(this.pcmBuffer);

    return {
      pcm: this.pcmBuffer,
      frequency: this.frequencyBuffer,
      bands,
      peak,
      rms,
      time: (this.audioContext.currentTime ?? 0) - this.startTime
    };
  }

  private calculateBands(): AudioBands {
    if (!this.analyser || !this.audioContext) {
      return { low: 0, mid: 0, high: 0 };
    }

    const nyquist = this.audioContext.sampleRate / 2;
    const binCount = this.analyser.frequencyBinCount;

    const sampleRange = (minFreq: number, maxFreq: number) => {
      const minBin = Math.max(0, Math.floor((minFreq / nyquist) * binCount));
      const maxBin = Math.min(this.frequencyBuffer.length, Math.floor((maxFreq / nyquist) * binCount));
      let sum = 0;
      let count = 0;
      for (let i = minBin; i < maxBin; i++) {
        sum += this.frequencyBuffer[i];
        count++;
      }
      return count ? sum / (count * 255) : 0;
    };

    return {
      low: sampleRange(20, 250),
      mid: sampleRange(250, 4000),
      high: sampleRange(4000, 16000)
    };
  }

  private calculatePeak(buffer: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const value = Math.abs(buffer[i]);
      if (value > peak) {
        peak = value;
      }
    }
    return Math.min(1, peak);
  }

  private calculateRMS(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const value = buffer[i];
      sum += value * value;
    }
    return Math.sqrt(sum / buffer.length);
  }

  private getEmptyData(): AudioData {
    return {
      pcm: this.pcmBuffer,
      frequency: this.frequencyBuffer,
      bands: { low: 0, mid: 0, high: 0 },
      peak: 0,
      rms: 0,
      time: 0
    };
  }

  play(): void {
    if (this.audioElement) {
      void this.audioElement.play();
    }
    if (this.audioContext?.state === 'suspended') {
      void this.audioContext.resume();
    }
  }

  pause(): void {
    this.audioElement?.pause();
  }

  toggle(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  setVolume(volume: number): void {
    if (!this.gainNode) return;
    this.gainNode.gain.value = Math.min(1, Math.max(0, volume));
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
    if (this.audioElement) {
      this.audioElement.loop = loop;
    }
  }

  // Allow external user gesture to resume the AudioContext (autoplay policy compliance)
  async resumeContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  dispose(closeContext = true): void {
    this.teardownMediaElement();
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (closeContext && this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.sourceType = null;
  }

  get isInitialized(): boolean {
    return !!this.analyser && !!this.audioContext;
  }

  get isPlaying(): boolean {
    return this.audioElement ? !this.audioElement.paused : false;
  }

  get duration(): number {
    return this.audioElement?.duration ?? 0;
  }

  get currentTime(): number {
    return this.audioElement?.currentTime ?? 0;
  }

  get currentSource(): StreamAudioSource | null {
    return this.sourceType;
  }

  private teardownMediaElement() {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioElement) {
      this.audioElement.pause();
      if (this.audioElement.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.audioElement.src);
      }
      this.audioElement.src = '';
      this.audioElement = null;
    }
  }
}
