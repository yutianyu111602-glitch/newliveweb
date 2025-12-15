import * as THREE from 'three';
import type { AudioBands } from '../audio/types';
import type { Layer } from './Layer';

type LiquidMetalPalette = {
  highlights: THREE.ColorRepresentation;
  midtones: THREE.ColorRepresentation;
  shadows: THREE.ColorRepresentation;
};

interface LiquidMetalLayerOptions {
  palette?: LiquidMetalPalette;
  audioIntensity?: number; // scalar applied to band energy
  pointerInertia?: number; // how quickly the pointer target lerps
}

const DEFAULT_PALETTE: LiquidMetalPalette = {
  highlights: '#e9f1ff',
  midtones: '#8aa4c2',
  shadows: '#10141d'
};

export class LiquidMetalLayer implements Layer {
  private material: THREE.ShaderMaterial | null = null;
  private mesh: THREE.Mesh | null = null;
  private elapsedTime = 0;
  private mouse = new THREE.Vector2(0.5, 0.5);
  private mouseTarget = new THREE.Vector2(0.5, 0.5);
  private pointerActive = false;
  private pointerElement: HTMLElement | null = null;
  private resolution = new THREE.Vector2(1, 1);
  private audioBands = new THREE.Vector3(0, 0, 0);
  private audioBandsTarget = new THREE.Vector3(0, 0, 0);
  private audioLevel = 0;
  private audioLevelTarget = 0;

  private readonly palette: LiquidMetalPalette;
  private readonly audioIntensity: number;
  private readonly pointerInertia: number;

  constructor(options: LiquidMetalLayerOptions = {}) {
    this.palette = options.palette ?? DEFAULT_PALETTE;
    this.audioIntensity = options.audioIntensity ?? 1.0;
    this.pointerInertia = options.pointerInertia ?? 0.18;
  }

  private onPointerMove = (event: PointerEvent) => {
    if (!this.pointerElement) return;
    const rect = this.pointerElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointerActive = true;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    this.mouseTarget.set(THREE.MathUtils.clamp(x, 0, 1), THREE.MathUtils.clamp(1 - y, 0, 1));
  };

  private onPointerLeave = () => {
    this.pointerActive = false;
    this.mouseTarget.set(0.5, 0.5);
  };

  init(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    const geometry = new THREE.PlaneGeometry(2, 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: this.resolution.clone() },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_audioBands: { value: new THREE.Vector3(0, 0, 0) },
        u_audioLevel: { value: 0 },
        u_paletteHighlights: { value: new THREE.Color(this.palette.highlights) },
        u_paletteMidtones: { value: new THREE.Color(this.palette.midtones) },
        u_paletteShadows: { value: new THREE.Color(this.palette.shadows) },
        u_audioIntensity: { value: this.audioIntensity }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision mediump float;
        uniform float u_time;
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform vec3 u_audioBands;
        uniform float u_audioLevel;
        uniform vec3 u_paletteHighlights;
        uniform vec3 u_paletteMidtones;
        uniform vec3 u_paletteShadows;
        uniform float u_audioIntensity;

        const float PI = 3.141592653589793;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int i = 0; i < 5; i++) {
            value += amplitude * noise(p);
            p = p * 2.0 + vec2(0.5);
            amplitude *= 0.5;
          }
          return value;
        }

        vec3 palette(float t) {
          float curve = smoothstep(0.05, 0.7, t);
          vec3 blend = mix(u_paletteMidtones, u_paletteHighlights, curve);
          return mix(u_paletteShadows, blend, smoothstep(0.0, 1.0, t));
        }

        void main() {
          vec2 frag = gl_FragCoord.xy;
          vec2 uv = (frag / u_resolution.xy) * 2.0 - 1.0;
          uv.x *= u_resolution.x / u_resolution.y;

          vec2 mouse = (u_mouse / u_resolution.xy) * 2.0 - 1.0;
          mouse.x *= u_resolution.x / u_resolution.y;

          float bandEnergy = clamp(dot(u_audioBands, vec3(0.45, 0.75, 1.35)) * u_audioIntensity, 0.0, 3.0);
          float time = u_time * (0.25 + 0.05 * bandEnergy);

          vec2 swirlUv = uv;
          float swirl = fbm(uv * 1.6 - time * 0.2);
          float angle = swirl * (PI * 2.0) * (0.2 + bandEnergy * 0.05);
          mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
          swirlUv = rot * uv;

          float metal = fbm(swirlUv * 3.0 + time) * 1.15;
          float ridge = fbm(swirlUv * 5.0 - time * 0.4);
          float mouseRipple = sin(distance(uv, mouse) * (8.0 + bandEnergy * 5.0) - time * 6.0);
          float highlight = pow(max(0.0, 1.0 - length(uv - mouse)), 2.0);

          float specular = ridge * 0.6 + mouseRipple * 0.2 + highlight * (0.4 + bandEnergy * 0.3);
          float metallic = clamp(metal + specular, 0.0, 1.0);

          vec3 color = palette(metallic);
          vec3 anisotropic = vec3(0.2 + 0.3 * ridge, 0.25 + 0.35 * ridge, 0.3 + 0.4 * ridge);
          color = mix(color, anisotropic, 0.45);
          color += vec3(0.15, 0.17, 0.22) * mouseRipple * 0.25;
          color *= 1.0 + 0.35 * u_audioLevel + 0.15 * bandEnergy;
          color = pow(color, vec3(0.85));
          color = clamp(color, 0.0, 1.2);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.attachPointerListeners(renderer.domElement);

    const size = renderer.getSize(new THREE.Vector2());
    this.onResize(size.x, size.y);
  }

  private attachPointerListeners(element: HTMLElement) {
    this.detachPointerListeners();
    this.pointerElement = element;
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerleave', this.onPointerLeave);
  }

  private detachPointerListeners() {
    if (!this.pointerElement) return;
    this.pointerElement.removeEventListener('pointermove', this.onPointerMove);
    this.pointerElement.removeEventListener('pointerleave', this.onPointerLeave);
    this.pointerElement = null;
  }

  update(deltaTime: number) {
    if (!this.material) {
      return;
    }

    this.elapsedTime += deltaTime;
    const smoothing = this.pointerActive ? this.pointerInertia : this.pointerInertia * 0.35;
    this.mouse.lerp(this.mouseTarget, smoothing);
    this.audioBands.lerp(this.audioBandsTarget, 0.08);
    this.audioLevel = THREE.MathUtils.lerp(this.audioLevel, this.audioLevelTarget, 0.1);

    this.material.uniforms.u_time.value = this.elapsedTime;
    const res = this.material.uniforms.u_resolution.value as THREE.Vector2;
    res.copy(this.resolution);

    const mouseVec = this.material.uniforms.u_mouse.value as THREE.Vector2;
    mouseVec.set(this.mouse.x * this.resolution.x, this.mouse.y * this.resolution.y);

    const audioVec = this.material.uniforms.u_audioBands.value as THREE.Vector3;
    audioVec.copy(this.audioBands);
    this.material.uniforms.u_audioLevel.value = this.audioLevel;
  }

  setAudioResponse(bands: AudioBands, peak: number, rms: number) {
    this.audioBandsTarget.set(Math.min(1, bands.low), Math.min(1, bands.mid), Math.min(1, bands.high));
    const level = Math.min(1, Math.max(peak, rms * 1.5));
    this.audioLevelTarget = level;
  }

  onResize(width: number, height: number) {
    this.resolution.set(width, height);
    if (this.material) {
      const res = this.material.uniforms.u_resolution.value as THREE.Vector2;
      res.set(width, height);
    }
  }

  dispose() {
    this.detachPointerListeners();

    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
  }
}
