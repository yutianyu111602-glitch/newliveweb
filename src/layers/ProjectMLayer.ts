import * as THREE from 'three';
import type { Layer } from './Layer';
import { ProjectMEngine } from '../projectm/ProjectMEngine';
import type { AudioFrame } from '../types/audioFrame';

interface ProjectMLayerOptions {
  opacity?: number;
  presetUrl?: string;
}

export class ProjectMLayer implements Layer {
  private engine: ProjectMEngine | null = null;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private rendererRef: THREE.WebGLRenderer | null = null;
  private pixelRatio = 1;
  private currentEnergy = 0;
  private baseOpacity = 0.85;
  private energyToOpacityAmount = 0.2;
  private audioDrivenOpacity = true;
  private blendMode: 'normal' | 'add' | 'screen' | 'multiply' = 'add';

  private readonly options: Required<ProjectMLayerOptions>;

  constructor(options: ProjectMLayerOptions = {}) {
    this.options = {
      opacity: options.opacity ?? 0.85,
      presetUrl: options.presetUrl ?? '/presets/default.milk'
    };
    this.baseOpacity = this.options.opacity;
  }

  async init(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.rendererRef = renderer;
    this.pixelRatio = renderer.getPixelRatio();
    const size = renderer.getSize(new THREE.Vector2());
    // CRITICAL: Pass CSS pixels to ProjectM. Emscripten internally applies devicePixelRatio
    // when creating the canvas (canvas.width/height will be CSS × DPR automatically).
    // Manually multiplying by DPR causes double-scaling: we pass 3008, Emscripten makes it 4512.
    const cssWidth = Math.floor(size.x);
    const cssHeight = Math.floor(size.y);
    console.log(`[ProjectMLayer] Init: viewport=${size.x}x${size.y}, dpr=${this.pixelRatio}, engine(CSS)=${cssWidth}x${cssHeight}`);
    this.engine = new ProjectMEngine(cssWidth, cssHeight);
    await this.engine.init();

    try {
      await this.engine.loadPresetFromUrl(this.options.presetUrl);
    } catch (error) {
      console.warn('ProjectMLayer: failed to load preset', error);
    }

    const canvas = this.engine.getCanvas();
    console.log(`[ProjectMLayer] Canvas size: ${canvas.width}x${canvas.height}, style: ${canvas.style.cssText}`);
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
      depthWrite: false
    });

    this.applyBlendMode(this.blendMode);

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1; // ensure it draws over the base layer
    scene.add(this.mesh);
  }

  setAudioFrame(frame: AudioFrame) {
    this.currentEnergy = frame.energy;
    this.engine?.addAudioData(frame.pcm2048Mono);
  }

  setBlendParams(params: {
    opacity?: number;
    blendMode?: 'normal' | 'add' | 'screen' | 'multiply';
    audioDrivenOpacity?: boolean;
    energyToOpacityAmount?: number;
  }) {
    if (typeof params.opacity === 'number') {
      this.baseOpacity = params.opacity;
    }
    if (typeof params.audioDrivenOpacity === 'boolean') {
      this.audioDrivenOpacity = params.audioDrivenOpacity;
    }
    if (typeof params.energyToOpacityAmount === 'number') {
      this.energyToOpacityAmount = params.energyToOpacityAmount;
    }
    if (params.blendMode) {
      this.blendMode = params.blendMode;
      this.applyBlendMode(params.blendMode);
    }
  }

  getBlendParams() {
    return {
      opacity: this.baseOpacity,
      blendMode: this.blendMode,
      audioDrivenOpacity: this.audioDrivenOpacity,
      energyToOpacityAmount: this.energyToOpacityAmount,
    };
  }

  update(_deltaTime: number) {
    if (!this.engine || !this.texture) return;
    this.engine.render();
    this.texture.needsUpdate = true;
    if (this.material) {
      const driven = this.audioDrivenOpacity ? this.currentEnergy * this.energyToOpacityAmount : 0;
      const targetOpacity = Math.min(1, Math.max(0, this.baseOpacity + driven));
      this.material.opacity = targetOpacity;
    }
  }

  isReady() {
    return Boolean(this.engine);
  }

  getOpacity() {
    if (this.material) {
      return this.material.opacity;
    }
    return this.options.opacity;
  }

  setOpacity(value: number) {
    this.options.opacity = value;
    this.baseOpacity = value;
    if (this.material) {
      this.material.opacity = value;
    }
  }

  async loadPresetFromUrl(url: string) {
    if (!this.engine) {
      throw new Error('ProjectM engine not initialized yet');
    }
    try {
      await this.engine.loadPresetFromUrl(url);
    } catch (error) {
      // Some presets can hard-abort the WASM runtime (exceptions disabled in this build).
      // Rebuild the engine so future preset switches can continue working.
      const message = String((error as any)?.message ?? error);
      if (message.includes('Aborted') || message.includes('exception catching is not enabled')) {
        console.warn('[ProjectMLayer] Preset caused WASM abort; rebuilding ProjectM engine...');
        await this.rebuildEngine();
      }
      throw error;
    }
  }

  loadPresetFromData(presetData: string) {
    if (!this.engine) {
      throw new Error('ProjectM engine not initialized yet');
    }
    this.engine.loadPresetData(presetData);
  }

  onResize(width: number, height: number) {
    if (this.rendererRef) {
      this.pixelRatio = this.rendererRef.getPixelRatio();
    }
    const cssWidth = Math.floor(width);
    const cssHeight = Math.floor(height);
    console.log(`[ProjectMLayer] Resize: viewport=${width}x${height}, dpr=${this.pixelRatio}, engine(CSS)=${cssWidth}x${cssHeight}`);
    this.engine?.setWindowSize(cssWidth, cssHeight);

    // CRITICAL: Recreate texture after canvas resize to ensure Three.js picks up new dimensions
    if (this.texture && this.engine) {
      this.texture.dispose();
      const canvas = this.engine.getCanvas();
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
      console.log(`[ProjectMLayer] Texture recreated: ${canvas.width}x${canvas.height}`);
    }
  }

  addAudioData(pcmData: Float32Array) {
    this.engine?.addAudioData(pcmData);
  }

  private async rebuildEngine() {
    if (!this.rendererRef) return;

    this.engine?.dispose();
    this.engine = null;

    const size = this.rendererRef.getSize(new THREE.Vector2());
    const cssWidth = Math.floor(size.x);
    const cssHeight = Math.floor(size.y);
    const engine = new ProjectMEngine(cssWidth, cssHeight);
    await engine.init();
    this.engine = engine;

    // Rebind texture to the new engine canvas.
    const canvas = engine.getCanvas();
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
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
    this.engine?.dispose();
    this.engine = null;
  }

  private applyBlendMode(mode: 'normal' | 'add' | 'screen' | 'multiply') {
    if (!this.material) return;

    // Reset to defaults to avoid carrying stale CustomBlending factors.
    this.material.blendEquation = THREE.AddEquation;
    this.material.blendSrc = THREE.SrcAlphaFactor;
    this.material.blendDst = THREE.OneMinusSrcAlphaFactor;
    this.material.blendEquationAlpha = THREE.AddEquation;
    this.material.blendSrcAlpha = THREE.OneFactor;
    this.material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;

    switch (mode) {
      case 'normal':
        this.material.blending = THREE.NormalBlending;
        break;
      case 'multiply':
        this.material.blending = THREE.MultiplyBlending;
        break;
      case 'add':
        this.material.blending = THREE.AdditiveBlending;
        break;
      case 'screen':
      default:
        // Screen: src + dst*(1-src). Approximated via fixed-function blend:
        // glBlendFunc(ONE, ONE_MINUS_SRC_COLOR)
        this.material.blending = THREE.CustomBlending;
        this.material.blendSrc = THREE.OneFactor;
        this.material.blendDst = THREE.OneMinusSrcColorFactor;
        this.material.blendEquation = THREE.AddEquation;
        // Keep alpha compositing reasonable.
        this.material.blendSrcAlpha = THREE.OneFactor;
        this.material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
        this.material.blendEquationAlpha = THREE.AddEquation;
        break;
    }

    this.material.needsUpdate = true;
  }
}
