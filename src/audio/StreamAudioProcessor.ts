import type { AudioBands, AudioConfig, AudioData } from "./types";

export type StreamAudioSource = "file" | "url" | "element" | "stream";

export type StreamAudioMonitorOptions = {
  // If true, route captured input to speakers (risk of feedback). Defaults to false.
  monitor?: boolean;
};

const DEFAULT_CONFIG: AudioConfig = {
  fftSize: 2048,
  // Lower smoothing makes visuals feel more responsive.
  smoothingTimeConstant: 0.45,
  minDecibels: -95,
  // A slightly lower max makes low-level signals map to higher byte values.
  maxDecibels: -20,
  sampleRate: undefined,
};

type AnalysisOptions = {
  skipFrequency?: boolean;
};

export class StreamAudioProcessor {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rawAnalyser: AnalyserNode | null = null;
  private channelSplitter: ChannelSplitterNode | null = null;
  private leftAnalyser: AnalyserNode | null = null;
  private rightAnalyser: AnalyserNode | null = null;
  private rawChannelSplitter: ChannelSplitterNode | null = null;
  private rawLeftAnalyser: AnalyserNode | null = null;
  private rawRightAnalyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private streamSourceNode: MediaStreamAudioSourceNode | null = null;
  private inputGainNode: GainNode | null = null;
  private gainNode: GainNode | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private mediaStream: MediaStream | null = null;
  private streamMonitorEnabled = false;
  private adaptiveInputGain = 1.0;
  private peakHistory: number[] = [];
  // 动态窗口大小：stream input 需要更快响应（60 samples = 1.0s），file/url 保持平滑（90 samples = 1.5s）
  // 优化目标：live input 响应速度 ↑30%
  private readonly PEAK_HISTORY_SIZE_STREAM = 60; // 1.0s @ 60fps - 快速响应
  private readonly PEAK_HISTORY_SIZE_FILE = 90; // 1.5s @ 60fps - 平滑稳定

  private pcmBuffer: Float32Array<ArrayBuffer>;
  private pcmLeftBuffer: Float32Array<ArrayBuffer>;
  private pcmRightBuffer: Float32Array<ArrayBuffer>;
  private frequencyBuffer: Uint8Array<ArrayBuffer>;
  private frequencyLeftBuffer: Uint8Array<ArrayBuffer>;
  private frequencyRightBuffer: Uint8Array<ArrayBuffer>;
  private rawPcmBuffer: Float32Array<ArrayBuffer>;
  private rawPcmLeftBuffer: Float32Array<ArrayBuffer>;
  private rawPcmRightBuffer: Float32Array<ArrayBuffer>;
  private rawFrequencyBuffer: Uint8Array<ArrayBuffer>;
  private rawFrequencyLeftBuffer: Uint8Array<ArrayBuffer>;
  private rawFrequencyRightBuffer: Uint8Array<ArrayBuffer>;
  private config: AudioConfig;
  private startTime = 0;
  private loop = true;
  private sourceType: StreamAudioSource | null = null;
  private lastBands: AudioBands = { low: 0, mid: 0, high: 0 };
  private lastBandsLeft: AudioBands = { low: 0, mid: 0, high: 0 };
  private lastBandsRight: AudioBands = { low: 0, mid: 0, high: 0 };
  private lastBandsRaw: AudioBands = { low: 0, mid: 0, high: 0 };

  constructor(config: Partial<AudioConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pcmBuffer = new Float32Array(
      this.config.fftSize
    ) as Float32Array<ArrayBuffer>;
    this.pcmLeftBuffer = new Float32Array(
      this.config.fftSize
    ) as Float32Array<ArrayBuffer>;
    this.pcmRightBuffer = new Float32Array(
      this.config.fftSize
    ) as Float32Array<ArrayBuffer>;
    this.frequencyBuffer = new Uint8Array(
      this.config.fftSize / 2
    ) as Uint8Array<ArrayBuffer>;
    this.frequencyLeftBuffer = new Uint8Array(
      this.config.fftSize / 2
    ) as Uint8Array<ArrayBuffer>;
    this.frequencyRightBuffer = new Uint8Array(
      this.config.fftSize / 2
    ) as Uint8Array<ArrayBuffer>;

    // Raw (pre-input-gain) buffers.
    this.rawPcmBuffer = new Float32Array(
      this.config.fftSize
    ) as Float32Array<ArrayBuffer>;
    this.rawPcmLeftBuffer = new Float32Array(
      this.config.fftSize
    ) as Float32Array<ArrayBuffer>;
    this.rawPcmRightBuffer = new Float32Array(
      this.config.fftSize
    ) as Float32Array<ArrayBuffer>;
    this.rawFrequencyBuffer = new Uint8Array(
      this.config.fftSize / 2
    ) as Uint8Array<ArrayBuffer>;
    this.rawFrequencyLeftBuffer = new Uint8Array(
      this.config.fftSize / 2
    ) as Uint8Array<ArrayBuffer>;
    this.rawFrequencyRightBuffer = new Uint8Array(
      this.config.fftSize / 2
    ) as Uint8Array<ArrayBuffer>;
  }

  // Pre-create/resume the AudioContext in the current user gesture callstack.
  // This avoids autoplay-policy edge cases where async awaits (getUserMedia, fetch)
  // can lose gesture activation and keep the context suspended, resulting in 0 waveform/meter.
  prewarmContext(): void {
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext({
          sampleRate: this.config.sampleRate,
        });
      }
      if (!this.analyser) {
        this.initAnalyser();
      }
      if (!this.inputGainNode && this.audioContext) {
        this.inputGainNode = this.audioContext.createGain();
        this.inputGainNode.gain.value = 1;
      }
      if (!this.gainNode && this.audioContext) {
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 1;
        this.gainNode.connect(this.audioContext.destination);
      }
      if (this.audioContext.state === "suspended") {
        void this.audioContext.resume().catch(() => {
          // ignore
        });
      }
    } catch {
      // ignore
    }
  }

  async loadFromUrl(url: string, opts: { loop?: boolean } = {}): Promise<void> {
    this.loop = opts.loop ?? true;
    await this.ensureContext();
    this.teardownStreamSource();
    await this.prepareElement(url);
    this.sourceType = "url";
  }

  async loadFile(file: File, opts: { loop?: boolean } = {}): Promise<void> {
    const blobUrl = URL.createObjectURL(file);
    try {
      await this.loadFromUrl(blobUrl, opts);
      this.sourceType = "file";
    } catch (error) {
      URL.revokeObjectURL(blobUrl);
      throw error;
    }
  }

  async attachElement(
    element: HTMLAudioElement,
    opts: { loop?: boolean } = {}
  ): Promise<void> {
    this.teardownMediaElement();
    this.teardownStreamSource();
    this.loop = opts.loop ?? true;
    await this.ensureContext();
    element.loop = this.loop;
    await this.waitForReady(element);
    this.connectElement(element);
    this.audioElement = element;
    this.sourceType = "element";
    this.startTime = this.audioContext?.currentTime ?? 0;
  }

  async loadFromStream(
    stream: MediaStream,
    opts: StreamAudioMonitorOptions = {}
  ): Promise<void> {
    await this.ensureContext();
    this.teardownMediaElement();
    this.teardownStreamSource();
    if (
      !this.audioContext ||
      !this.analyser ||
      !this.gainNode ||
      !this.inputGainNode
    ) {
      throw new Error("Audio nodes not initialized");
    }

    // Make live capture feel snappier.
    this.analyser.smoothingTimeConstant = 0.25;

    this.mediaStream = stream;
    this.streamSourceNode = this.audioContext.createMediaStreamSource(stream);
    // Use higher initial gain for loopback/mixer inputs (common use case).
    // Adaptive gain will further adjust based on observed signal levels.
    this.inputGainNode.gain.value = 32.0;
    this.adaptiveInputGain = 32.0;
    this.peakHistory = [];
    this.connectInputNode(this.streamSourceNode);

    // Default to no-monitoring to avoid feedback loops on stage.
    this.streamMonitorEnabled = Boolean(opts.monitor);
    this.gainNode.gain.value = this.streamMonitorEnabled ? 1 : 0;

    this.sourceType = "stream";
    this.startTime = this.audioContext.currentTime ?? 0;
  }

  private async prepareElement(url: string): Promise<void> {
    this.teardownMediaElement();
    this.teardownStreamSource();
    const audio = this.createAudioElement(url);
    audio.loop = this.loop;
    await this.waitForReady(audio);
    this.connectElement(audio);
    this.audioElement = audio;
    this.startTime = this.audioContext?.currentTime ?? 0;
  }

  private async ensureContext(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    if (!this.analyser) {
      this.initAnalyser();
    }
    if (!this.inputGainNode && this.audioContext) {
      this.inputGainNode = this.audioContext.createGain();
      this.inputGainNode.gain.value = 1;
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

    // Raw analyser mirrors config; used for UI/diagnostics.
    this.rawAnalyser = this.audioContext.createAnalyser();
    this.rawAnalyser.fftSize = this.config.fftSize;
    this.rawAnalyser.smoothingTimeConstant = this.config.smoothingTimeConstant;
    this.rawAnalyser.minDecibels = this.config.minDecibels;
    this.rawAnalyser.maxDecibels = this.config.maxDecibels;
  }

  private createAnalyser(): AnalyserNode {
    if (!this.audioContext) {
      throw new Error("AudioContext not initialized");
    }
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = this.config.fftSize;
    analyser.smoothingTimeConstant =
      this.analyser?.smoothingTimeConstant ?? this.config.smoothingTimeConstant;
    analyser.minDecibels = this.config.minDecibels;
    analyser.maxDecibels = this.config.maxDecibels;
    return analyser;
  }

  private teardownAnalysisNodes() {
    for (const node of [
      this.leftAnalyser,
      this.rightAnalyser,
      this.channelSplitter,
      this.rawLeftAnalyser,
      this.rawRightAnalyser,
      this.rawChannelSplitter,
    ]) {
      if (!node) continue;
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
    this.leftAnalyser = null;
    this.rightAnalyser = null;
    this.channelSplitter = null;
    this.rawLeftAnalyser = null;
    this.rawRightAnalyser = null;
    this.rawChannelSplitter = null;
  }

  private connectInputNode(source: AudioNode) {
    if (!this.audioContext || !this.gainNode || !this.inputGainNode) {
      throw new Error("Audio nodes not initialized");
    }
    if (!this.analyser) {
      this.initAnalyser();
    }
    if (!this.analyser) {
      throw new Error("Analyser not initialized");
    }

    this.teardownAnalysisNodes();

    // Avoid duplicate connections if we re-wire using the same source node.
    try {
      source.disconnect();
    } catch {
      // ignore
    }

    try {
      this.inputGainNode.disconnect();
    } catch {
      // ignore
    }

    source.connect(this.inputGainNode);

    // Raw analysis path: tap the source BEFORE any adaptive input gain.
    if (!this.rawAnalyser) {
      // Ensure initAnalyser ran.
      this.initAnalyser();
    }
    if (this.rawAnalyser) {
      try {
        source.connect(this.rawAnalyser);
      } catch {
        // ignore
      }

      try {
        this.rawChannelSplitter = this.audioContext.createChannelSplitter(2);
        this.rawLeftAnalyser = this.createAnalyser();
        this.rawRightAnalyser = this.createAnalyser();
        source.connect(this.rawChannelSplitter);
        this.rawChannelSplitter.connect(this.rawLeftAnalyser, 0);
        this.rawChannelSplitter.connect(this.rawRightAnalyser, 1);
      } catch {
        // ignore
        this.rawLeftAnalyser = null;
        this.rawRightAnalyser = null;
        this.rawChannelSplitter = null;
      }
    }

    // Playback/monitoring path.
    this.inputGainNode.connect(this.gainNode);

    // Mono analysis path (kept for compatibility; also used as fallback).
    this.inputGainNode.connect(this.analyser);

    // Stereo analysis path (best-effort; if the source is mono, both channels will be identical).
    this.channelSplitter = this.audioContext.createChannelSplitter(2);
    this.leftAnalyser = this.createAnalyser();
    this.rightAnalyser = this.createAnalyser();
    this.inputGainNode.connect(this.channelSplitter);
    this.channelSplitter.connect(this.leftAnalyser, 0);
    this.channelSplitter.connect(this.rightAnalyser, 1);
  }

  private connectElement(element: HTMLAudioElement): void {
    if (
      !this.audioContext ||
      !this.analyser ||
      !this.gainNode ||
      !this.inputGainNode
    ) {
      throw new Error("Audio nodes not initialized");
    }
    this.teardownStreamSource();
    this.audioElement = element;

    // Restore defaults for media playback.
    this.analyser.smoothingTimeConstant = this.config.smoothingTimeConstant;

    this.sourceNode = this.audioContext.createMediaElementSource(element);
    // Media elements already tend to be hot enough; keep analysis gain at unity.
    this.inputGainNode.gain.value = 1;
    this.connectInputNode(this.sourceNode);
  }

  private createAudioElement(url: string): HTMLAudioElement {
    const audio = new Audio();
    audio.src = url;
    // Only set crossOrigin for remote URLs. For same-origin and Vite /@fs/ URLs,
    // forcing CORS can cause unexpected load failures in some environments.
    if (/^https?:\/\//i.test(url)) {
      audio.crossOrigin = "anonymous";
    }
    audio.preload = "auto";
    audio.controls = false;
    audio.loop = this.loop;
    audio.setAttribute("playsinline", "true");
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
        const detail = `code=${code ?? "unknown"} networkState=${
          element.networkState
        } readyState=${element.readyState}`;
        reject(new Error(`Audio element error (${detail}) src=${src}`));
      };
      const cleanup = () => {
        element.removeEventListener("canplay", onReady);
        element.removeEventListener("error", onError);
      };
      element.addEventListener("canplay", onReady, { once: true });
      element.addEventListener("error", onError, { once: true });
      element.load();
    });
  }

  getAnalysisData(opts: AnalysisOptions = {}): AudioData {
    if (!this.analyser || !this.audioContext) {
      return this.getEmptyData();
    }

    const skipFrequency = Boolean(opts.skipFrequency);
    let peak = 0;
    let rms = 0;
    let bands = this.lastBands;
    let bandsLeft = this.lastBandsLeft;
    let bandsRight = this.lastBandsRight;

    // Raw (pre-input-gain) values.
    let peakRaw = 0;
    let rmsRaw = 0;
    let bandsRaw = this.lastBandsRaw;

    const left = this.leftAnalyser;
    const right = this.rightAnalyser;

    const rawLeft = this.rawLeftAnalyser;
    const rawRight = this.rawRightAnalyser;

    if (left && right) {
      left.getFloatTimeDomainData(this.pcmLeftBuffer);
      right.getFloatTimeDomainData(this.pcmRightBuffer);
      for (let i = 0; i < this.pcmBuffer.length; i++) {
        this.pcmBuffer[i] =
          (this.pcmLeftBuffer[i] + this.pcmRightBuffer[i]) * 0.5;
      }

      if (!skipFrequency) {
        left.getByteFrequencyData(this.frequencyLeftBuffer);
        right.getByteFrequencyData(this.frequencyRightBuffer);
        // Optimize: Uint8Array auto-truncates, no need for Math.round.
        for (let i = 0; i < this.frequencyBuffer.length; i++) {
          this.frequencyBuffer[i] =
            (this.frequencyLeftBuffer[i] + this.frequencyRightBuffer[i]) * 0.5;
        }

        const nextBandsLeft = this.calculateBandsFromBuffer(
          this.frequencyLeftBuffer
        );
        const nextBandsRight = this.calculateBandsFromBuffer(
          this.frequencyRightBuffer
        );
        this.lastBandsLeft = nextBandsLeft;
        this.lastBandsRight = nextBandsRight;
        this.lastBands = {
          low: Math.max(nextBandsLeft.low, nextBandsRight.low),
          mid: Math.max(nextBandsLeft.mid, nextBandsRight.mid),
          high: Math.max(nextBandsLeft.high, nextBandsRight.high),
        };
      }
      bandsLeft = this.lastBandsLeft;
      bandsRight = this.lastBandsRight;
      bands = this.lastBands;
      const peakLeft = this.calculatePeak(this.pcmLeftBuffer);
      const peakRight = this.calculatePeak(this.pcmRightBuffer);
      const rmsLeft = this.calculateRMS(this.pcmLeftBuffer);
      const rmsRight = this.calculateRMS(this.pcmRightBuffer);
      peak = Math.max(peakLeft, peakRight);
      rms = Math.max(rmsLeft, rmsRight);

      // Raw stereo (best-effort).
      if (rawLeft && rawRight) {
        rawLeft.getFloatTimeDomainData(this.rawPcmLeftBuffer);
        rawRight.getFloatTimeDomainData(this.rawPcmRightBuffer);
        for (let i = 0; i < this.rawPcmBuffer.length; i++) {
          this.rawPcmBuffer[i] =
            (this.rawPcmLeftBuffer[i] + this.rawPcmRightBuffer[i]) * 0.5;
        }

        if (!skipFrequency) {
          rawLeft.getByteFrequencyData(this.rawFrequencyLeftBuffer);
          rawRight.getByteFrequencyData(this.rawFrequencyRightBuffer);
          // Optimize: Uint8Array auto-truncates, no need for Math.round.
          for (let i = 0; i < this.rawFrequencyBuffer.length; i++) {
            this.rawFrequencyBuffer[i] =
              (this.rawFrequencyLeftBuffer[i] +
                this.rawFrequencyRightBuffer[i]) *
              0.5;
          }

          const rawBandsLeft = this.calculateBandsFromBuffer(
            this.rawFrequencyLeftBuffer
          );
          const rawBandsRight = this.calculateBandsFromBuffer(
            this.rawFrequencyRightBuffer
          );
          this.lastBandsRaw = {
            low: Math.max(rawBandsLeft.low, rawBandsRight.low),
            mid: Math.max(rawBandsLeft.mid, rawBandsRight.mid),
            high: Math.max(rawBandsLeft.high, rawBandsRight.high),
          };
        }
        bandsRaw = this.lastBandsRaw;

        const rawPeakLeft = this.calculatePeak(this.rawPcmLeftBuffer);
        const rawPeakRight = this.calculatePeak(this.rawPcmRightBuffer);
        const rawRmsLeft = this.calculateRMS(this.rawPcmLeftBuffer);
        const rawRmsRight = this.calculateRMS(this.rawPcmRightBuffer);
        peakRaw = Math.max(rawPeakLeft, rawPeakRight);
        rmsRaw = Math.max(rawRmsLeft, rawRmsRight);
      } else if (this.rawAnalyser) {
        // Raw mono fallback.
        this.rawAnalyser.getFloatTimeDomainData(this.rawPcmBuffer);
        if (!skipFrequency) {
          this.rawAnalyser.getByteFrequencyData(this.rawFrequencyBuffer);
          this.lastBandsRaw = this.calculateBandsFromBuffer(
            this.rawFrequencyBuffer
          );
        }
        bandsRaw = this.lastBandsRaw;
        peakRaw = this.calculatePeak(this.rawPcmBuffer);
        rmsRaw = this.calculateRMS(this.rawPcmBuffer);
      }

      const elementTime = this.audioElement?.currentTime;
      const time =
        typeof elementTime === "number" && Number.isFinite(elementTime)
          ? elementTime
          : (this.audioContext.currentTime ?? 0) - this.startTime;

      return {
        pcm: this.pcmBuffer,
        pcmLeft: this.pcmLeftBuffer,
        pcmRight: this.pcmRightBuffer,
        pcmRaw: this.rawPcmBuffer,
        frequency: this.frequencyBuffer,
        frequencyLeft: this.frequencyLeftBuffer,
        frequencyRight: this.frequencyRightBuffer,
        frequencyRaw: this.rawFrequencyBuffer,
        bands,
        bandsLeft,
        bandsRight,
        bandsRaw,
        peak,
        rms,
        peakRaw,
        rmsRaw,
        peakLeft,
        peakRight,
        rmsLeft,
        rmsRight,
        time,
      };
    }

    // Mono fallback.
    this.analyser.getFloatTimeDomainData(this.pcmBuffer);
    if (!skipFrequency) {
      this.analyser.getByteFrequencyData(this.frequencyBuffer);
      this.lastBands = this.calculateBandsFromBuffer(this.frequencyBuffer);
    }
    bands = this.lastBands;
    peak = this.calculatePeak(this.pcmBuffer);
    rms = this.calculateRMS(this.pcmBuffer);

    // Update adaptive gain for stream inputs based on observed peak.
    this.updateAdaptiveGain(peak);

    // Raw mono analysis (best-effort).
    if (this.rawAnalyser) {
      this.rawAnalyser.getFloatTimeDomainData(this.rawPcmBuffer);
      if (!skipFrequency) {
        this.rawAnalyser.getByteFrequencyData(this.rawFrequencyBuffer);
        this.lastBandsRaw = this.calculateBandsFromBuffer(
          this.rawFrequencyBuffer
        );
      }
      bandsRaw = this.lastBandsRaw;
      peakRaw = this.calculatePeak(this.rawPcmBuffer);
      rmsRaw = this.calculateRMS(this.rawPcmBuffer);
    }

    const elementTime = this.audioElement?.currentTime;
    const time =
      typeof elementTime === "number" && Number.isFinite(elementTime)
        ? elementTime
        : (this.audioContext.currentTime ?? 0) - this.startTime;

    return {
      pcm: this.pcmBuffer,
      pcmRaw: this.rawPcmBuffer,
      frequency: this.frequencyBuffer,
      frequencyRaw: this.rawFrequencyBuffer,
      bands,
      bandsRaw,
      peak,
      rms,
      peakRaw,
      rmsRaw,
      time,
    };
  }

  private calculateBandsFromBuffer(buffer: Uint8Array): AudioBands {
    if (!this.audioContext) {
      return { low: 0, mid: 0, high: 0 };
    }

    const nyquist = this.audioContext.sampleRate / 2;
    const binCount = buffer.length;

    const sampleRange = (minFreq: number, maxFreq: number) => {
      const minBin = Math.max(0, Math.floor((minFreq / nyquist) * binCount));
      const maxBin = Math.min(
        buffer.length,
        Math.floor((maxFreq / nyquist) * binCount)
      );
      let sum = 0;
      let count = 0;
      for (let i = minBin; i < maxBin; i++) {
        sum += buffer[i];
        count++;
      }
      return count ? sum / (count * 255) : 0;
    };

    return {
      low: sampleRange(20, 250),
      mid: sampleRange(250, 4000),
      high: sampleRange(4000, 16000),
    };
  }

  private calculatePeak(buffer: Float32Array): number {
    let peak = 0;
    const len = buffer.length;
    const len4 = len - (len % 4);
    // Unroll 4x for better CPU utilization.
    for (let i = 0; i < len4; i += 4) {
      const v0 = Math.abs(buffer[i]);
      const v1 = Math.abs(buffer[i + 1]);
      const v2 = Math.abs(buffer[i + 2]);
      const v3 = Math.abs(buffer[i + 3]);
      const max4 = Math.max(v0, v1, v2, v3);
      if (max4 > peak) peak = max4;
    }
    // Remainder.
    for (let i = len4; i < len; i++) {
      const value = Math.abs(buffer[i]);
      if (value > peak) peak = value;
    }
    return Math.min(1, peak);
  }

  private updateAdaptiveGain(rawPeak: number): void {
    // Only apply adaptive gain for stream input (loopback/mixer/mic).
    if (this.sourceType !== "stream" || !this.inputGainNode) return;

    // 动态窗口大小：stream 需要快速响应
    const historySize = this.getPeakHistorySize();

    // Track peak history for stable calibration.
    this.peakHistory.push(rawPeak);
    if (this.peakHistory.length > historySize) {
      this.peakHistory.shift();
    }

    // Only calibrate after collecting enough samples.
    if (this.peakHistory.length < historySize) return;

    // Calculate moving average peak to avoid reacting to transients.
    const avgPeak =
      this.peakHistory.reduce((a, b) => a + b, 0) / this.peakHistory.length;

    // Target peak range: 0.3-0.7 (30-70% after gain).
    // If avg peak is too low, increase gain; if too high, decrease.
    const targetPeak = 0.5;
    const tolerance = 0.15;

    // Threshold raised from 0.0001 to 0.005: ignore near-silence and noise floor.
    // Some devices (line-in / loopback) report low peaks, but amplifying <0.005 causes artifacts.
    if (avgPeak < targetPeak - tolerance && avgPeak > 0.005) {
      // Signal is too weak, increase gain gradually.
      const factor = Math.min(2.0, targetPeak / avgPeak);
      this.adaptiveInputGain = Math.min(
        16.0, // Reduced from 32.0: prevents distortion on sudden peaks
        this.adaptiveInputGain * factor * 0.3 + this.adaptiveInputGain * 0.7
      );
    } else if (avgPeak > targetPeak + tolerance) {
      // Signal is too strong, decrease gain gradually.
      const factor = Math.max(0.5, targetPeak / avgPeak);
      this.adaptiveInputGain = Math.max(
        1.0,
        this.adaptiveInputGain * factor * 0.3 + this.adaptiveInputGain * 0.7
      );
    }

    // Apply gain with smooth ramping to avoid clicks.
    this.inputGainNode.gain.setTargetAtTime(
      this.adaptiveInputGain,
      this.audioContext?.currentTime ?? 0,
      0.1
    );
  }

  /**
   * 获取动态窗口大小
   * Stream input 需要更快响应（60 samples），File/URL 可以更平滑（90 samples）
   */
  private getPeakHistorySize(): number {
    return this.sourceType === "stream"
      ? this.PEAK_HISTORY_SIZE_STREAM
      : this.PEAK_HISTORY_SIZE_FILE;
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
      time: 0,
    };
  }

  play(): void {
    if (this.audioElement) {
      void this.audioElement.play();
    }
    if (this.audioContext?.state === "suspended") {
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
    // In stream (mixer/mic) mode, never monitor to speakers unless explicitly enabled.
    if (this.sourceType === "stream" && !this.streamMonitorEnabled) {
      this.gainNode.gain.value = 0;
      return;
    }
    this.gainNode.gain.value = Math.min(1, Math.max(0, volume));
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
    if (this.audioElement) {
      this.audioElement.loop = loop;
    }
  }

  seek(timeSec: number): void {
    const el = this.audioElement;
    if (!el) return;
    if (!Number.isFinite(timeSec)) return;
    const duration = el.duration;
    const clamped =
      Number.isFinite(duration) && duration > 0
        ? Math.max(0, Math.min(duration, timeSec))
        : Math.max(0, timeSec);
    try {
      el.currentTime = clamped;
    } catch {
      // ignore
    }
  }

  // Allow external user gesture to resume the AudioContext (autoplay policy compliance)
  async resumeContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  dispose(closeContext = true): void {
    this.teardownMediaElement();
    this.teardownStreamSource();
    this.teardownAnalysisNodes();
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.inputGainNode) {
      try {
        this.inputGainNode.disconnect();
      } catch {
        // ignore
      }
      this.inputGainNode = null;
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

  get currentUrl(): string | null {
    const el = this.audioElement;
    if (!el) return null;
    const src = el.currentSrc || el.src;
    return src ? String(src) : null;
  }

  get mediaElementStatus(): {
    networkState: number;
    readyState: number;
    ended: boolean;
    paused: boolean;
    errorCode: number | null;
  } | null {
    const el = this.audioElement;
    if (!el) return null;
    return {
      networkState: el.networkState,
      readyState: el.readyState,
      ended: Boolean(el.ended),
      paused: Boolean(el.paused),
      errorCode: el.error?.code ?? null,
    };
  }

  get currentSource(): StreamAudioSource | null {
    return this.sourceType;
  }

  get currentSampleRate(): number {
    return this.audioContext?.sampleRate ?? this.config.sampleRate ?? 48000;
  }

  private teardownMediaElement() {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioElement) {
      this.audioElement.pause();
      if (this.audioElement.src.startsWith("blob:")) {
        URL.revokeObjectURL(this.audioElement.src);
      }
      this.audioElement.src = "";
      this.audioElement = null;
    }
  }

  private teardownStreamSource() {
    if (this.streamSourceNode) {
      try {
        this.streamSourceNode.disconnect();
      } catch {
        // ignore
      }
      this.streamSourceNode = null;
    }
    if (this.mediaStream) {
      try {
        for (const track of this.mediaStream.getTracks()) track.stop();
      } catch {
        // ignore
      }
      this.mediaStream = null;
    }
    this.streamMonitorEnabled = false;
  }
}
