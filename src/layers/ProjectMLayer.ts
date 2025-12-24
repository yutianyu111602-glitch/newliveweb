import * as THREE from "three";
import type { Layer } from "./Layer";
import { ProjectMEngine } from "../projectm/ProjectMEngine";
import type { AudioFrame } from "../types/audioFrame";
import type { BlendParams } from '../state/visualState';
import type { AudioDriver } from '../audio/audioControls/expressiveAudioDriver';
import type { PresetsController } from '../features/presets/PresetsController';

interface ProjectMLayerOptions {
  opacity?: number;
  presetUrl?: string;
  statsKey?: string;
  audioProfile?: "fg" | "bg" | "flat";
  audioFeedIntervalMs?: number;
  dprCap?: number;
  engineScale?: number;
  maxCssWidth?: number;
  maxCssHeight?: number;
}

type ResolvedProjectMLayerOptions = {
  opacity: number;
  presetUrl: string;
  statsKey?: string;
  audioProfile: "fg" | "bg" | "flat";
  audioFeedIntervalMs: number;
};

export class ProjectMLayer implements Layer {
  private engine: ProjectMEngine | null = null;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private rendererRef: THREE.WebGLRenderer | null = null;
  private pixelRatio = 1;
  private currentEnergy = 0;
  private accent01 = 0; // 新增：存储重音信号强度 (0-1)
  private audioDriver: AudioDriver | null = null;
  private presetsController: PresetsController | null = null;
  private externalOpacityDrive01 = 0;
  private bass01 = 0;     // 存储低频能量 (0-1)
  private mid01 = 0;      // 存储中频能量 (0-1)
  private high01 = 0;     // 存储高频能量 (0-1)
  private audioReactiveMultiplier = 1;
  private overlayOpacityMultiplier = 1;
  private baseOpacity = 0.6;
  private energyToOpacityAmount = 0.2;
  private audioDrivenOpacity = true;
  private idlePhase = 0;
  private idlePcm: Float32Array | null = null;
  private timeScale = 1;
  private useCompositor = false;
  private lastGoodPresetUrl: string | null = null;
  private rebuildInProgress = false;
  private lastRebuildMs = 0;
  private statsKey: string | null = null;
  private audioProfile: "fg" | "bg" | "flat" = "flat";
  private audioFeedIntervalMs = 0;
  private lastAudioFeedMs = 0;
  private audioLowpassState = 0;
  private audioPcmBuffer: Float32Array | null = null;
  private dprCap: number | null = null;
  private engineScale = 1;
  private maxCssWidth: number | null = null;
  private maxCssHeight: number | null = null;
  private sizeOverride: { width: number; height: number } | null = null;
  private lastViewportWidth = 0;
  private lastViewportHeight = 0;
  private lastEngineCssWidth = 0;
  private lastEngineCssHeight = 0;
  private lastDeviceDpr = 0;
  private lastCanvasWidth = 0;
  private lastCanvasHeight = 0;
  private blendMode:
    | "normal"
    | "add"
    | "screen"
    | "multiply"
    | "overlay"
    | "difference"
    | "exclusion"
    | "color-dodge" = "add";

  private readonly options: ResolvedProjectMLayerOptions;

  constructor(
    options: ProjectMLayerOptions = {},
    private blendMode: BlendParams,
    audioDriver: AudioDriver,
    presetsController: PresetsController
  ) {
    this.options = {
      opacity: options.opacity ?? 0.7,
      presetUrl: options.presetUrl ?? "/presets/default.milk",
      ...(options.statsKey !== undefined ? { statsKey: options.statsKey } : {}),
      audioProfile: options.audioProfile ?? "flat",
      audioFeedIntervalMs: options.audioFeedIntervalMs ?? 0,
    };
    this.baseOpacity = this.options.opacity;
    this.audioDriver = audioDriver;
    this.presetsController = presetsController;
    this.statsKey =
      typeof this.options.statsKey === "string" && this.options.statsKey.trim()
        ? this.options.statsKey.trim()
        : null;
    this.audioProfile = this.options.audioProfile;
    this.audioFeedIntervalMs = this.options.audioFeedIntervalMs;
    const rawDprCap = Number(options.dprCap);
    this.dprCap =
      Number.isFinite(rawDprCap) && rawDprCap > 0
        ? Math.max(0.5, Math.min(2, rawDprCap))
        : null;
    const rawScale = Number(options.engineScale);
    this.engineScale =
      Number.isFinite(rawScale) && rawScale > 0
        ? Math.max(0.25, Math.min(1, rawScale))
        : 1;
    const rawMaxW = Number(options.maxCssWidth);
    this.maxCssWidth =
      Number.isFinite(rawMaxW) && rawMaxW > 0 ? Math.floor(rawMaxW) : null;
    const rawMaxH = Number(options.maxCssHeight);
    this.maxCssHeight =
      Number.isFinite(rawMaxH) && rawMaxH > 0 ? Math.floor(rawMaxH) : null;
  }

  private resolveEngineSize(viewportWidth: number, viewportHeight: number) {
    const base = this.sizeOverride ?? {
      width: Math.max(1, Math.floor(viewportWidth)),
      height: Math.max(1, Math.floor(viewportHeight)),
    };
    const baseW = Math.max(1, Math.floor(base.width));
    const baseH = Math.max(1, Math.floor(base.height));
    let scale = Number.isFinite(this.engineScale) ? this.engineScale : 1;
    let maxScale = 1;
    if (this.maxCssWidth != null && this.maxCssWidth > 0) {
      maxScale = Math.min(maxScale, this.maxCssWidth / baseW);
    }
    if (this.maxCssHeight != null && this.maxCssHeight > 0) {
      maxScale = Math.min(maxScale, this.maxCssHeight / baseH);
    }
    if (Number.isFinite(maxScale) && maxScale > 0) {
      scale = Math.min(scale, maxScale);
    }
    scale = Math.max(0.25, Math.min(1, scale));
    return {
      baseW,
      baseH,
      scale,
      width: Math.max(1, Math.floor(baseW * scale)),
      height: Math.max(1, Math.floor(baseH * scale)),
    };
  }

  private applyEngineResize(reason: string) {
    if (!this.engine) return;
    const viewportW = this.lastViewportWidth;
    const viewportH = this.lastViewportHeight;
    if (!viewportW || !viewportH) return;
    const { baseW, baseH, scale, width, height } = this.resolveEngineSize(
      viewportW,
      viewportH
    );
    const deviceDpr = Number(window.devicePixelRatio || 1);
    const sizeChanged =
      width !== this.lastEngineCssWidth || height !== this.lastEngineCssHeight;
    const dprChanged = Math.abs(deviceDpr - this.lastDeviceDpr) > 1e-3;
    if (!sizeChanged && !dprChanged) return;

    console.log(
      `[ProjectMLayer] Resize(${reason}): viewport=${viewportW}x${viewportH}, base=${baseW}x${baseH}, scale=${scale.toFixed(
        3
      )}, engine(CSS)=${width}x${height}`
    );
    this.engine.setWindowSize(width, height);
    this.lastEngineCssWidth = width;
    this.lastEngineCssHeight = height;
    this.lastDeviceDpr = deviceDpr;

    const canvas = this.engine.getCanvas();
    const canvasChanged =
      canvas.width !== this.lastCanvasWidth ||
      canvas.height !== this.lastCanvasHeight;
    if (!canvasChanged) return;

    if (this.texture) {
      this.texture.dispose();
    }
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.lastEngineCssWidth = width;
    this.lastEngineCssHeight = height;
    this.lastDeviceDpr = deviceDpr;
    this.lastCanvasWidth = canvas.width;
    this.lastCanvasHeight = canvas.height;

    if (this.material) {
      this.material.map = this.texture;
      this.material.needsUpdate = true;
    }
    console.log(
      `[ProjectMLayer] Texture recreated: ${canvas.width}x${canvas.height}`
    );
  }

  setEngineSizeOverride(width: number | null, height: number | null) {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      if (!this.sizeOverride) return;
      this.sizeOverride = null;
    } else {
      const next = { width: Math.floor(w), height: Math.floor(h) };
      if (
        this.sizeOverride &&
        this.sizeOverride.width === next.width &&
        this.sizeOverride.height === next.height
      ) {
        return;
      }
      this.sizeOverride = next;
    }
    this.applyEngineResize("override");
  }

  async init(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.rendererRef = renderer;
    this.pixelRatio = renderer.getPixelRatio();
    const size = renderer.getSize(new THREE.Vector2());
    // CRITICAL: Pass CSS pixels to ProjectM. Emscripten internally applies devicePixelRatio
    // when creating the canvas (canvas.width/height will be CSS × DPR automatically).
    // Manually multiplying by DPR causes double-scaling: we pass 3008, Emscripten makes it 4512.
    this.lastViewportWidth = Math.floor(size.x);
    this.lastViewportHeight = Math.floor(size.y);
    const {
      baseW,
      baseH,
      scale,
      width: cssWidth,
      height: cssHeight,
    } = this.resolveEngineSize(this.lastViewportWidth, this.lastViewportHeight);
    console.log(
      `[ProjectMLayer] Init: viewport=${size.x}x${
        size.y
      }, base=${baseW}x${baseH}, scale=${scale.toFixed(3)}, dpr=${
        this.pixelRatio
      }, engine(CSS)=${cssWidth}x${cssHeight}`
    );
    this.engine = new ProjectMEngine(cssWidth, cssHeight, {
      // Low-cost downsampled diagnostics signal (used for future closed-loop controllers).
      avgLumaSampling: {
        enabled: true,
        intervalMs: 500,
        downsampleSize: 8,
      },
      avgColorSampling: {
        enabled: true,
        intervalMs: 500,
        downsampleSize: 8,
      },
      statsKey: this.statsKey ?? undefined,
      dprCap: this.dprCap ?? undefined,
    });
    await this.engine.init();
    this.engine.setTimeScale(this.timeScale);

    try {
      await this.engine.loadPresetFromUrl(this.options.presetUrl);
      this.lastGoodPresetUrl = this.options.presetUrl;
    } catch (error) {
      console.warn("ProjectMLayer: failed to load preset", error);
    }

    const canvas = this.engine.getCanvas();
    console.log(
      `[ProjectMLayer] Canvas size: ${canvas.width}x${canvas.height}, style: ${canvas.style.cssText}`
    );
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;

    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: this.options.opacity,
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
    });

    this.applyBlendMode(this.blendMode);

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(this.useCompositor ? 1 : 0);
    this.mesh.renderOrder = 1; // ensure it draws over the base layer
    scene.add(this.mesh);
  }

  setTimeScale(scale: number) {
    const v = Number(scale);
    this.timeScale = Number.isFinite(v) ? Math.min(3, Math.max(0.25, v)) : 1;
    this.engine?.setTimeScale(this.timeScale);
  }

  setDprCap(cap: number | null) {
    const raw = Number(cap);
    const next =
      Number.isFinite(raw) && raw > 0 ? Math.max(0.5, Math.min(2, raw)) : null;
    if (next == null && this.dprCap == null) return;
    if (next != null && this.dprCap != null) {
      if (Math.abs(next - this.dprCap) < 1e-3) return;
    }
    this.dprCap = next;
    this.engine?.setDprCap(this.dprCap);
    if (!this.engine) return;
    const canvas = this.engine.getCanvas();
    const canvasChanged =
      canvas.width !== this.lastCanvasWidth ||
      canvas.height !== this.lastCanvasHeight;
    if (canvasChanged) {
      if (this.texture) {
        this.texture.dispose();
      }
      this.texture = new THREE.CanvasTexture(canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.minFilter = THREE.LinearFilter;
      this.texture.magFilter = THREE.LinearFilter;
      this.texture.wrapS = THREE.ClampToEdgeWrapping;
      this.texture.wrapT = THREE.ClampToEdgeWrapping;
      this.texture.generateMipmaps = false;
      if (this.material) {
        this.material.map = this.texture;
        this.material.needsUpdate = true;
      }
      this.lastCanvasWidth = canvas.width;
      this.lastCanvasHeight = canvas.height;
      console.log(
        `[ProjectMLayer] Texture recreated: ${canvas.width}x${canvas.height}`
      );
    }
    this.lastDeviceDpr = Number(window.devicePixelRatio || 1);
  }

  setAudioFeedIntervalMs(intervalMs: number) {
    const raw = Number(intervalMs);
    const next =
      Number.isFinite(raw) && raw >= 0
        ? Math.min(2000, Math.max(0, Math.round(raw)))
        : 0;
    if (next === this.audioFeedIntervalMs) return;
    const prev = this.audioFeedIntervalMs;
    this.audioFeedIntervalMs = next;
    if (next > 0 && prev > 0 && next < prev) {
      this.lastAudioFeedMs = 0;
    }
  }

  setAudioFrame(frame: AudioFrame) {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const clamp01Local = (value: unknown) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      return Math.min(1, Math.max(0, n));
    };

    const kick = clamp01Local(
      frame.features?.kick01Long ?? frame.features?.kick01Raw ?? 0
    );
    const clap = clamp01Local(
      frame.features?.clap01Long ?? frame.features?.clap01Raw ?? 0
    );
    const hihat = clamp01Local(
      frame.features?.hihat01Long ?? frame.features?.hihat01Raw ?? 0
    );
    const flux = clamp01Local(frame.features?.flux ?? 0);

    // 计算重音信号
    this.accent01 = Math.min(1, 0.6 * kick + 0.2 * clap + 0.2 * hihat);
  }

  update(deltaTimeMs: number) {
    this.engine?.update?.(deltaTimeMs);
    this.idlePhase += (deltaTimeMs / 1000) * this.timeScale;
    if (this.idlePhase >= 8) {
      this.idlePhase = 0;
      if (!this.engine?.isRunning()) {
        this.idlePcm = this.idlePcm || new Float32Array(512).fill(0.001);
        this.engine?.setPCM(this.idlePcm, 512);
      }
    }
  }

  dispose() {
    this.mesh?.geometry.dispose();
    this.material?.dispose();
    this.texture?.dispose();
    this.engine?.dispose();
    this.engine = null;
    this.mesh = null;
    this.material = null;
    this.texture = null;
  }

  applyBlendMode(blendParams: BlendParams, deltaTimeMs: number) {
    let opacity = blendParams.opacity;
    
    if (blendParams.audioDrivenOpacity) {
      const { energy01, accent01, bass01, mid01, high01 } = this.audioDriver?.getSnapshot() ?? {};
      const activePreset = this.presetsController.getActivePreset();
      const presetTuning = activePreset?.blendTuning || {};
      
      const effectiveAmount = presetTuning.energyToOpacityAmount ?? blendParams.energyToOpacityAmount;
      const effectiveCurve = presetTuning.energyCurve ?? blendParams.energyCurve ?? 1.0;
      const accentContribution = presetTuning.accentContribution ?? 0.2;
      
      const dynamicEnergy = energy01 * (1 - accentContribution) + accent01 * accentContribution;
      opacity = blendParams.opacity + effectiveAmount * Math.pow(dynamicEnergy, effectiveCurve);
      
      // Apply frequency-specific modulation
      if (presetTuning.bassMotionAmount && this.engine) {
        const motionBoost = bass01 * presetTuning.bassMotionAmount;
        this.engine.setTimeScale(1.0 + motionBoost);
      }
    }
    
    // Update material properties
    if (this.material) {
      this.material.opacity = opacity;
      this.material.blending = blendParams.blendMode === "add" ? THREE.AdditiveBlending :
                              blendParams.blendMode === "screen" ? THREE.CustomBlending :
                              THREE.NormalBlending;
      
      if (blendParams.blendMode === "screen") {
        this.material.blendSrc = THREE.OneFactor;
        this.material.blendDst = THREE.OneMinusSrcColorFactor;
      }
    }
  }