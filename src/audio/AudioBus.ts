import { StreamAudioProcessor } from "./StreamAudioProcessor";
import type { AudioFrame } from "../types/audioFrame";
import type { AudioData } from "./types";

export type AudioBusLoadUrlOptions = { loop?: boolean };

export type AudioBusLoadStreamOptions = {
  label?: string;
  monitor?: boolean;
  kind?: AudioInputSourceInfo["kind"];
};

export type AudioInputSourceInfo = {
  deviceId: string | null;
  label: string;
  kind: "device" | "system" | "unknown";
};

export type AudioContextInfo = {
  state: string;
  ready: boolean;
  playing: boolean;
  source?: string;
  url?: string | null;
  streamStatus?: string | null;
  inputLabel?: string | null;
  inputDeviceId?: string | null;
};

type AudioFrameListener = (frame: AudioFrame) => void;

const TARGET_PCM = 512;
const FREQUENCY_FPS_CAP = 30;

type TechnoBandFeatures = {
  kick01Raw: number;
  bass01Raw: number;
  clap01Raw: number;
  synth01Raw: number;
  hihat01Raw: number;
};

type TechnoBandFeaturesLong = {
  kick01Long: number;
  bass01Long: number;
  clap01Long: number;
  synth01Long: number;
  hihat01Long: number;
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clamp01Num(value: number): number {
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  return clamp01(v);
}

function resampleTo512(src: Float32Array, target?: Float32Array): Float32Array {
  const out =
    target && target.length === TARGET_PCM
      ? target
      : new Float32Array(TARGET_PCM);
  if (!src.length) {
    out.fill(0);
    return out;
  }
  const step = src.length / TARGET_PCM;
  for (let i = 0; i < TARGET_PCM; i++) {
    const idx = Math.min(src.length - 1, Math.floor(i * step));
    out[i] = src[idx] ?? 0;
  }
  return out;
}

function expAlpha(dtSec: number, tauSec: number) {
  const dt = Math.max(0, Number(dtSec) || 0);
  const tau = Math.max(1e-4, Number(tauSec) || 1e-4);
  return 1 - Math.exp(-dt / tau);
}

function smoothAttackRelease01(
  current: number,
  target: number,
  dtSec: number,
  attackSec: number,
  releaseSec: number
) {
  const t = clamp01Num(target);
  const c = clamp01Num(current);
  const tau = t >= c ? attackSec : releaseSec;
  const a = expAlpha(dtSec, tau);
  return clamp01Num(c + (t - c) * a);
}

function avgBins01(
  bins: Uint8Array,
  sampleRate: number,
  minHz: number,
  maxHz: number
) {
  const sr = Number(sampleRate);
  if (!(bins instanceof Uint8Array) || !bins.length) return 0;
  if (!Number.isFinite(sr) || sr <= 0) return 0;

  const nyquist = sr / 2;
  const n = bins.length;
  const hzPerBin = nyquist / n;
  const lo = Math.max(0, Math.floor(minHz / hzPerBin));
  const hi = Math.min(n - 1, Math.ceil(maxHz / hzPerBin));
  if (hi <= lo) return 0;

  let sum = 0;
  let count = 0;
  for (let i = lo; i <= hi; i++) {
    sum += bins[i] ?? 0;
    count++;
  }
  if (!count) return 0;
  const avgByte = sum / count;

  // Normalize and apply a slight gamma for punch.
  return clamp01Num(Math.pow(clamp01Num(avgByte / 255), 0.85));
}

function computeTechnoBandFeatures(opts: {
  bins: Uint8Array;
  sampleRate: number;
}): TechnoBandFeatures {
  const { bins, sampleRate } = opts;
  // Rough electronic-music focus bands:
  // Kick: 40-110Hz, Bass: 60-250Hz, Synth: 250-2kHz,
  // Clap/snare: 1.2-4kHz, Hi-hat: 6-12kHz
  return {
    kick01Raw: avgBins01(bins, sampleRate, 40, 110),
    bass01Raw: avgBins01(bins, sampleRate, 60, 250),
    synth01Raw: avgBins01(bins, sampleRate, 250, 2000),
    clap01Raw: avgBins01(bins, sampleRate, 1200, 4000),
    hihat01Raw: avgBins01(bins, sampleRate, 6000, 12000),
  };
}

/**
 * AudioFrame 对象池 - 避免每帧创建新对象，减少 GC 压力
 *
 * 优化目标：
 * - GC 压力 ↓50%
 * - 内存峰值 ↓30%
 * - 避免每帧分配 ~10KB 对象
 */
class AudioFramePool {
  private frame: AudioFrame;

  constructor() {
    // 预分配所有 buffer，完全避免运行时分配
    this.frame = {
      version: 1,
      timeSec: 0,
      sampleRate: 48000,
      pcm2048Mono: new Float32Array(2048),
      pcm512Mono: new Float32Array(512),
      pcm2048MonoRaw: undefined,
      pcm512MonoRaw: undefined,
      pcm512StereoLR: {
        left: new Float32Array(512),
        right: new Float32Array(512),
      },
      bands: { low: 0, mid: 0, high: 0 },
      bandsRaw: undefined,
      rms: 0,
      peak: 0,
      rmsRaw: undefined,
      peakRaw: undefined,
      energyRaw: 0,
      energy: 0,
      features: {
        kick01Raw: 0,
        bass01Raw: 0,
        clap01Raw: 0,
        synth01Raw: 0,
        hihat01Raw: 0,
        kick01Long: 0,
        bass01Long: 0,
        clap01Long: 0,
        synth01Long: 0,
        hihat01Long: 0,
        flux: 0,
      },
      isSilent: false,
      isSilentRaw: false,
    };
  }

  /**
   * 重置数值字段（保留 buffer 引用）
   * 注意：不需要清零 buffer 内容，会被后续逻辑覆盖
   */
  reset(): void {
    this.frame.version = 1;
    this.frame.timeSec = 0;
    this.frame.energy = 0;
    this.frame.energyRaw = 0;
    this.frame.rms = 0;
    this.frame.peak = 0;
    this.frame.rmsRaw = undefined;
    this.frame.peakRaw = undefined;
    this.frame.isSilent = false;
    this.frame.isSilentRaw = false;
    // bands, bandsRaw, features 会被 buildFrame 完全覆盖，无需清零
  }

  /**
   * 获取可复用的 frame 实例
   * 警告：调用者不应保存此引用，必须同步处理
   */
  getFrame(): AudioFrame {
    return this.frame;
  }
}

export class AudioBus {
  private processor = new StreamAudioProcessor();
  private listeners = new Set<AudioFrameListener>();
  private rafId: number | null = null;
  private analysisIntervalMs = 1000 / 60;
  private lastAnalysisMs = 0;
  private frequencyIntervalMs = 1000 / FREQUENCY_FPS_CAP;
  private lastFrequencyMs = 0;
  private latestFrame: AudioFrame | null = null;
  private ready = false;
  private inputInfo: AudioInputSourceInfo = {
    deviceId: null,
    label: "",
    kind: "unknown",
  };

  // AudioFrame 对象池 - 优化 GC
  private framePool = new AudioFramePool();

  // Long-tail envelope followers for techno-oriented bands.
  private featLastMs: number | null = null;
  private featLong: TechnoBandFeaturesLong = {
    kick01Long: 0,
    bass01Long: 0,
    clap01Long: 0,
    synth01Long: 0,
    hihat01Long: 0,
  };
  private bandRaw: TechnoBandFeatures = {
    kick01Raw: 0,
    bass01Raw: 0,
    clap01Raw: 0,
    synth01Raw: 0,
    hihat01Raw: 0,
  };
  private fluxLastBands: TechnoBandFeatures | null = null;
  private fluxSmoothed = 0;
  private energyLastMs: number | null = null;
  private energyAvg = 0;
  private energyGain = 1;
  private pcm512Buffer: Float32Array | null = null;
  private pcm512RawBuffer: Float32Array | null = null;

  async loadFile(file: File) {
    await this.processor.loadFile(file, { loop: true });
    this.ready = true;
    this.inputInfo = { deviceId: null, label: "", kind: "unknown" };
    this.startLoop();
    this.play();
  }

  async loadUrl(url: string, opts: AudioBusLoadUrlOptions = {}) {
    await this.processor.loadFromUrl(url, { loop: opts.loop ?? true });
    this.ready = true;
    this.inputInfo = { deviceId: null, label: "", kind: "unknown" };
    this.startLoop();
    this.play();
  }

  async loadMediaStream(
    stream: MediaStream,
    opts: AudioBusLoadStreamOptions = {}
  ) {
    await this.processor.loadFromStream(stream, { monitor: opts.monitor });
    this.ready = true;
    this.inputInfo = {
      deviceId: null,
      label: String(opts.label ?? "").trim(),
      kind: opts.kind ?? "unknown",
    };
    this.startLoop();
  }

  async loadInputDevice(deviceId?: string) {
    const constraints: MediaStreamConstraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      video: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const tracks = stream.getAudioTracks?.() ?? [];
    const label = String(tracks[0]?.label ?? "").trim();

    await this.loadMediaStream(stream, {
      label: label || "Audio input",
      monitor: false,
      kind: "device",
    });

    this.inputInfo = {
      deviceId: deviceId ?? null,
      label,
      kind: "device",
    };
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

  setAnalysisFpsCap(fps: number) {
    const v = Number(fps);
    if (!Number.isFinite(v) || v <= 0) {
      this.analysisIntervalMs = 0;
      this.lastAnalysisMs = 0;
      this.frequencyIntervalMs = 0;
      this.lastFrequencyMs = 0;
      return;
    }
    const clamped = Math.max(5, Math.min(120, v));
    this.analysisIntervalMs = 1000 / clamped;
    this.lastAnalysisMs = 0;
    const freqInterval = 1000 / FREQUENCY_FPS_CAP;
    this.frequencyIntervalMs = Math.max(this.analysisIntervalMs, freqInterval);
    this.lastFrequencyMs = 0;
  }

  seek(timeSec: number) {
    this.processor.seek(timeSec);
  }

  async resumeContext() {
    await this.processor.resumeContext();
  }

  // Prewarm/resume AudioContext synchronously during a user gesture.
  // See StreamAudioProcessor.prewarmContext for rationale.
  prewarmContext() {
    this.processor.prewarmContext();
  }

  dispose() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.listeners.clear();
    this.processor.dispose();
    this.ready = false;
    this.inputInfo = { deviceId: null, label: "", kind: "unknown" };
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

  get audioContextState(): AudioContextState | "uninitialized" {
    const ctx = (this.processor as any).audioContext as
      | AudioContext
      | null
      | undefined;
    return ctx?.state ?? "uninitialized";
  }

  get currentSource() {
    return this.processor.currentSource;
  }

  get inputSourceInfo(): AudioInputSourceInfo {
    return this.inputInfo;
  }

  get audioContextInfo(): AudioContextInfo {
    const source = this.processor.currentSource;
    const url = this.processor.currentUrl;

    let streamStatus: string | null = null;
    if (source === "stream") {
      streamStatus =
        this.inputInfo.kind === "system"
          ? "system"
          : this.inputInfo.kind === "device"
          ? "input"
          : "stream";
    }

    return {
      state: String(this.audioContextState),
      ready: this.isReady,
      playing: this.isPlaying,
      source: source ?? undefined,
      url,
      streamStatus,
      inputLabel: this.inputInfo.label || null,
      inputDeviceId: this.inputInfo.deviceId || null,
    };
  }

  private startLoop() {
    if (this.rafId !== null) return;
    const tick = () => {
      const nowMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (
        this.analysisIntervalMs > 0 &&
        this.lastAnalysisMs > 0 &&
        nowMs - this.lastAnalysisMs < this.analysisIntervalMs
      ) {
        this.rafId = requestAnimationFrame(tick);
        return;
      }
      this.lastAnalysisMs = nowMs;
      const needFrequency =
        this.frequencyIntervalMs <= 0 ||
        this.lastFrequencyMs <= 0 ||
        nowMs - this.lastFrequencyMs >= this.frequencyIntervalMs;
      const data = this.processor.getAnalysisData({
        skipFrequency: !needFrequency,
      });
      if (needFrequency) {
        this.lastFrequencyMs = nowMs;
      }

      // 使用对象池复用 AudioFrame，避免每帧分配
      this.framePool.reset();
      const frame = this.buildFrame(data, {
        frequencyUpdated: needFrequency,
      });

      // 为 getSnapshot() 创建快照（深拷贝）
      this.latestFrame = this.cloneFrame(frame);

      // 通知监听器（传递池化实例，监听器必须同步处理）
      this.listeners.forEach((listener) => listener(frame));

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private buildFrame(
    data: AudioData,
    opts: { frequencyUpdated?: boolean } = {}
  ): AudioFrame {
    // 使用对象池的 frame 实例（已在 startLoop 中 reset）
    const frame = this.framePool.getFrame();

    const pcm512 = resampleTo512(data.pcm, this.pcm512Buffer ?? undefined);
    this.pcm512Buffer = pcm512;
    const pcm512Raw = data.pcmRaw
      ? resampleTo512(data.pcmRaw, this.pcm512RawBuffer ?? undefined)
      : null;
    if (pcm512Raw) this.pcm512RawBuffer = pcm512Raw;
    const energyBase = clamp01(Math.max(data.peak ?? 0, (data.rms ?? 0) * 1.5));
    const energyRaw = clamp01(
      Math.max(data.peakRaw ?? 0, (data.rmsRaw ?? 0) * 1.5)
    );
    const silentProcessed = energyBase < 1e-3 && (data.peak ?? 0) < 1e-3;
    const hasRaw =
      data.peakRaw != null || data.rmsRaw != null || data.pcmRaw != null;
    const silentRaw = hasRaw
      ? energyRaw < 1e-3 && (data.peakRaw ?? 0) < 1e-3
      : silentProcessed;

    // Energy normalization for visual driving (keeps low-level mixes readable).
    const energyNowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const dtEnergySec =
      this.energyLastMs == null
        ? 1 / 60
        : Math.max(
            0.001,
            Math.min(0.25, (energyNowMs - this.energyLastMs) / 1000)
          );
    this.energyLastMs = energyNowMs;

    const avgAlpha = expAlpha(dtEnergySec, 1.2);
    if (silentProcessed) {
      this.energyAvg =
        this.energyAvg + (0 - this.energyAvg) * expAlpha(dtEnergySec, 2.5);
    } else {
      this.energyAvg =
        this.energyAvg + (energyBase - this.energyAvg) * avgAlpha;
    }

    const target = 0.5;
    const baseForGain = Math.max(0.04, this.energyAvg);
    const desiredGain = Math.max(0.8, Math.min(6.5, target / baseForGain));
    const gainAlpha = expAlpha(dtEnergySec, 0.7);
    this.energyGain =
      this.energyGain + (desiredGain - this.energyGain) * gainAlpha;
    const energy = clamp01(energyBase * this.energyGain);

    // --- Techno-oriented sub-band features (raw + long tail) ---
    // Prefer raw frequency bins (pre-input-gain) when present.
    const frequencyUpdated = opts.frequencyUpdated !== false;
    let bandRaw = this.bandRaw;
    if (frequencyUpdated) {
      const sr = this.processor.currentSampleRate;
      const bins = (data.frequencyRaw ?? data.frequency) as Uint8Array;
      bandRaw = computeTechnoBandFeatures({ bins, sampleRate: sr });
      this.bandRaw = bandRaw;
    }

    const nowMs = energyNowMs;
    const dtSec =
      this.featLastMs == null
        ? 1 / 60
        : Math.max(0.001, Math.min(0.25, (nowMs - this.featLastMs) / 1000));
    this.featLastMs = nowMs;

    // Long-tail tuning: kick/bass/synth longer; clap/hihat shorter.
    this.featLong.kick01Long = smoothAttackRelease01(
      this.featLong.kick01Long,
      bandRaw.kick01Raw,
      dtSec,
      0.04,
      0.95
    );
    this.featLong.bass01Long = smoothAttackRelease01(
      this.featLong.bass01Long,
      bandRaw.bass01Raw,
      dtSec,
      0.05,
      1.15
    );
    this.featLong.synth01Long = smoothAttackRelease01(
      this.featLong.synth01Long,
      bandRaw.synth01Raw,
      dtSec,
      0.06,
      0.9
    );
    this.featLong.clap01Long = smoothAttackRelease01(
      this.featLong.clap01Long,
      bandRaw.clap01Raw,
      dtSec,
      0.03,
      0.75
    );
    this.featLong.hihat01Long = smoothAttackRelease01(
      this.featLong.hihat01Long,
      bandRaw.hihat01Raw,
      dtSec,
      0.03,
      0.55
    );

    // Spectral flux proxy: sum of positive deltas across techno sub-bands.
    let fluxRaw = 0;
    if (this.fluxLastBands) {
      const prev = this.fluxLastBands;
      fluxRaw =
        Math.max(0, bandRaw.kick01Raw - prev.kick01Raw) +
        Math.max(0, bandRaw.bass01Raw - prev.bass01Raw) +
        Math.max(0, bandRaw.synth01Raw - prev.synth01Raw) +
        Math.max(0, bandRaw.clap01Raw - prev.clap01Raw) +
        Math.max(0, bandRaw.hihat01Raw - prev.hihat01Raw);
    }
    this.fluxLastBands = bandRaw;
    const flux01 = clamp01Num(Math.min(1, fluxRaw * 0.9));
    this.fluxSmoothed = smoothAttackRelease01(
      this.fluxSmoothed,
      flux01,
      dtSec,
      0.03,
      0.22
    );

    // 填充对象池的 frame（直接修改字段，避免创建新对象）
    frame.version = 1;
    frame.timeSec = data.time ?? 0;
    frame.sampleRate = this.processor.currentSampleRate;

    // 复用预分配的 buffer（直接拷贝数据）
    if (data.pcm.length === frame.pcm2048Mono.length) {
      frame.pcm2048Mono.set(data.pcm);
    } else {
      frame.pcm2048Mono = data.pcm;
    }

    if (pcm512.length === frame.pcm512Mono.length) {
      frame.pcm512Mono.set(pcm512);
    } else {
      frame.pcm512Mono = pcm512;
    }

    frame.pcm2048MonoRaw = data.pcmRaw ?? undefined;

    if (pcm512Raw) {
      if (
        frame.pcm512MonoRaw &&
        pcm512Raw.length === frame.pcm512MonoRaw.length
      ) {
        frame.pcm512MonoRaw.set(pcm512Raw);
      } else {
        frame.pcm512MonoRaw = pcm512Raw;
      }
    } else {
      frame.pcm512MonoRaw = undefined;
    }

    // pcm512StereoLR 复用（当前实现是 mono，left/right 指向同一buffer）
    frame.pcm512StereoLR = { left: frame.pcm512Mono, right: frame.pcm512Mono };

    // 更新 bands
    frame.bands = data.bands;
    frame.bandsRaw = data.bandsRaw ?? undefined;

    frame.rms = data.rms;
    frame.peak = data.peak;
    frame.rmsRaw = data.rmsRaw ?? undefined;
    frame.peakRaw = data.peakRaw ?? undefined;
    frame.energyRaw = energyRaw;
    frame.energy = energy;

    // 更新 features（确保存在）
    if (!frame.features) {
      frame.features = {
        kick01Raw: 0,
        bass01Raw: 0,
        clap01Raw: 0,
        synth01Raw: 0,
        hihat01Raw: 0,
        kick01Long: 0,
        bass01Long: 0,
        clap01Long: 0,
        synth01Long: 0,
        hihat01Long: 0,
        flux: 0,
      };
    }
    frame.features.kick01Raw = bandRaw.kick01Raw;
    frame.features.bass01Raw = bandRaw.bass01Raw;
    frame.features.clap01Raw = bandRaw.clap01Raw;
    frame.features.synth01Raw = bandRaw.synth01Raw;
    frame.features.hihat01Raw = bandRaw.hihat01Raw;
    frame.features.kick01Long = this.featLong.kick01Long;
    frame.features.bass01Long = this.featLong.bass01Long;
    frame.features.clap01Long = this.featLong.clap01Long;
    frame.features.synth01Long = this.featLong.synth01Long;
    frame.features.hihat01Long = this.featLong.hihat01Long;
    frame.features.flux = this.fluxSmoothed;

    frame.isSilent = silentProcessed;
    frame.isSilentRaw = silentRaw;

    return frame;
  }

  /**
   * 克隆 AudioFrame 用于快照（getSnapshot）
   * 避免外部代码保存对象池实例的引用
   */
  private cloneFrame(frame: AudioFrame): AudioFrame {
    return {
      version: frame.version,
      timeSec: frame.timeSec,
      sampleRate: frame.sampleRate,
      pcm2048Mono: frame.pcm2048Mono.slice(),
      pcm512Mono: frame.pcm512Mono.slice(),
      pcm2048MonoRaw: frame.pcm2048MonoRaw
        ? frame.pcm2048MonoRaw.slice()
        : undefined,
      pcm512MonoRaw: frame.pcm512MonoRaw
        ? frame.pcm512MonoRaw.slice()
        : undefined,
      pcm512StereoLR: {
        left: frame.pcm512StereoLR.left.slice(),
        right: frame.pcm512StereoLR.right.slice(),
      },
      bands: { ...frame.bands },
      bandsRaw: frame.bandsRaw ? { ...frame.bandsRaw } : undefined,
      rms: frame.rms,
      peak: frame.peak,
      rmsRaw: frame.rmsRaw,
      peakRaw: frame.peakRaw,
      energyRaw: frame.energyRaw,
      energy: frame.energy,
      features: { ...frame.features },
      isSilent: frame.isSilent,
      isSilentRaw: frame.isSilentRaw,
    };
  }
}
