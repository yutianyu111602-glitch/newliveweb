import * as THREE from "three";
import type { Layer } from "./Layer";
import type { AudioBands } from "../audio/types";
import type { AudioFrame } from "../types/audioFrame";

// 液态金属参数接口
export interface LiquidMetalParams {
  // 背景算法变体
  variant?: "metal" | "waves" | "stars" | "lines";

  // Compositor-level opacity (0..1). Implemented via THREE material opacity.
  opacity?: number;

  // 动画参数
  timeScale: number; // 时间缩放 (0-5)
  iterations: number; // 迭代次数 (1-10)
  waveAmplitude: number; // 波浪幅度 (0-2)

  // 鼠标交互
  mouseInfluence: number; // 鼠标影响强度 (0-1)

  // 金属质感
  metallicAmount: number; // 金属度 (0-1)
  metallicSpeed: number; // 金属闪烁速度 (0-5)

  // 亮度
  brightness: number; // 亮度 (0-3)
  contrast?: number; // 对比度 (0.7-1.6)

  // 色彩控制（高级）
  tintHue?: number; // 0..1
  tintStrength?: number; // 0..1
  paletteStrength?: number; // 0..1

  // 音频响应
  audioReactive: boolean; // 是否响应音频
  audioSensitivity: number; // 音频灵敏度 (0-2)
}

export class LiquidMetalLayerV2 implements Layer {
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera;
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private startTime: number;
  private mouse = new THREE.Vector2(0.5, 0.5);
  private currentAudioBands: AudioBands | null = null;
  private currentAudioEnergy = 0;
  private audioReactiveMultiplier = 1;
  private overlayOpacityMultiplier = 1;

  // Runtime-only (no state persistence): allow closed-loop controllers to bias color.
  private runtimeTintHue: number | null = null; // 0..1
  private runtimeTintStrengthAdd = 0; // -1..1 (clamped to 0..1 after add)
  private runtimePaletteStrengthAdd = 0; // -1..1
  private runtimeContrastMul = 1; // 0.5..2 (then clamped to [0.7..1.6])
  private runtimeTimeScaleMul = 1;
  private runtimeTimeScaleAdd = 0;
  private runtimeIterationsAdd = 0;
  private runtimeWaveAmplitudeMul = 1;
  private runtimeMetallicAmountAdd = 0;
  private runtimeBrightnessMul = 1;

  // 默认参数
  public params: LiquidMetalParams = {
    variant: "metal",
    opacity: 0.7,
    timeScale: 1.0,
    iterations: 10,
    waveAmplitude: 0.6,

    mouseInfluence: 1.0,

    metallicAmount: 0.08,
    metallicSpeed: 1.0,

    brightness: 0.8,
    contrast: 1.0,
    tintHue: 0.0,
    tintStrength: 0.0,
    paletteStrength: 0.0,

    audioReactive: true,
    audioSensitivity: 1.0,
  };

  setEnabled(enabled: boolean) {
    this.mesh.visible = Boolean(enabled);
  }

  // Runtime-only: compositor/overlay budget can fade the layer without mutating params.opacity.
  setOverlayOpacityMultiplier(value01: number) {
    const v = Number(value01);
    this.overlayOpacityMultiplier = Number.isFinite(v)
      ? Math.min(1, Math.max(0, v))
      : 1;
    this.updateParams();
  }

  // Runtime-only: apply color bias without mutating params (avoids contaminating favorites/state).
  setRuntimeColorTuning(patch: {
    enabled?: boolean;
    tintHue?: number;
    tintStrengthAdd?: number;
    paletteStrengthAdd?: number;
    contrastMul?: number;
  }) {
    const enabled = patch.enabled !== false;
    if (!enabled) {
      this.runtimeTintHue = null;
      this.runtimeTintStrengthAdd = 0;
      this.runtimePaletteStrengthAdd = 0;
      this.runtimeContrastMul = 1;
      this.updateParams();
      return;
    }

    if (patch.tintHue != null) {
      const h = Number(patch.tintHue);
      this.runtimeTintHue = Number.isFinite(h)
        ? Math.min(1, Math.max(0, h))
        : null;
    }
    if (patch.tintStrengthAdd != null) {
      const n = Number(patch.tintStrengthAdd);
      this.runtimeTintStrengthAdd = Number.isFinite(n)
        ? Math.min(1, Math.max(-1, n))
        : this.runtimeTintStrengthAdd;
    }
    if (patch.paletteStrengthAdd != null) {
      const n = Number(patch.paletteStrengthAdd);
      this.runtimePaletteStrengthAdd = Number.isFinite(n)
        ? Math.min(1, Math.max(-1, n))
        : this.runtimePaletteStrengthAdd;
    }
    if (patch.contrastMul != null) {
      const n = Number(patch.contrastMul);
      this.runtimeContrastMul = Number.isFinite(n)
        ? Math.min(2, Math.max(0.5, n))
        : this.runtimeContrastMul;
    }

    this.updateParams();
  }

  setRuntimeParamTuning(patch: {
    enabled?: boolean;
    timeScaleMul?: number;
    timeScaleAdd?: number;
    iterationsAdd?: number;
    waveAmplitudeMul?: number;
    metallicAmountAdd?: number;
    brightnessMul?: number;
  }) {
    const enabled = patch.enabled !== false;
    if (!enabled) {
      this.runtimeTimeScaleMul = 1;
      this.runtimeTimeScaleAdd = 0;
      this.runtimeIterationsAdd = 0;
      this.runtimeWaveAmplitudeMul = 1;
      this.runtimeMetallicAmountAdd = 0;
      this.runtimeBrightnessMul = 1;
      this.updateParams();
      return;
    }

    let changed = false;

    if (patch.timeScaleMul != null) {
      const n = Number(patch.timeScaleMul);
      const next = Number.isFinite(n) ? Math.min(4, Math.max(0.25, n)) : 1;
      if (next !== this.runtimeTimeScaleMul) {
        this.runtimeTimeScaleMul = next;
        changed = true;
      }
    }
    if (patch.timeScaleAdd != null) {
      const n = Number(patch.timeScaleAdd);
      const next = Number.isFinite(n) ? Math.min(3, Math.max(-3, n)) : 0;
      if (next !== this.runtimeTimeScaleAdd) {
        this.runtimeTimeScaleAdd = next;
        changed = true;
      }
    }
    if (patch.iterationsAdd != null) {
      const n = Number(patch.iterationsAdd);
      const next = Number.isFinite(n) ? Math.min(8, Math.max(-8, n)) : 0;
      if (next !== this.runtimeIterationsAdd) {
        this.runtimeIterationsAdd = next;
        changed = true;
      }
    }
    if (patch.waveAmplitudeMul != null) {
      const n = Number(patch.waveAmplitudeMul);
      const next = Number.isFinite(n) ? Math.min(2, Math.max(0, n)) : 1;
      if (next !== this.runtimeWaveAmplitudeMul) {
        this.runtimeWaveAmplitudeMul = next;
        changed = true;
      }
    }
    if (patch.metallicAmountAdd != null) {
      const n = Number(patch.metallicAmountAdd);
      const next = Number.isFinite(n) ? Math.min(1, Math.max(-1, n)) : 0;
      if (next !== this.runtimeMetallicAmountAdd) {
        this.runtimeMetallicAmountAdd = next;
        changed = true;
      }
    }
    if (patch.brightnessMul != null) {
      const n = Number(patch.brightnessMul);
      const next = Number.isFinite(n) ? Math.min(2.5, Math.max(0.5, n)) : 1;
      if (next !== this.runtimeBrightnessMul) {
        this.runtimeBrightnessMul = next;
        changed = true;
      }
    }

    if (changed) {
      this.updateParams();
    }
  }

  constructor() {
    this.startTime = Date.now();

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // 创建shader material - 复刻旧代码的液态金属效果
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uResolution: {
          value: new THREE.Vector2(window.innerWidth, window.innerHeight),
        },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },

        // 动画参数
        uTimeScale: { value: this.params.timeScale },
        uIterations: { value: this.params.iterations },
        uWaveAmplitude: { value: this.params.waveAmplitude },

        // 鼠标参数
        uMouseInfluence: { value: this.params.mouseInfluence },

        // 金属参数
        uMetallicAmount: { value: this.params.metallicAmount },
        uMetallicSpeed: { value: this.params.metallicSpeed },

        // 亮度
        uBrightness: { value: this.params.brightness },
        uContrast: { value: this.params.contrast ?? 1.0 },

        // 色彩
        uTintHue: { value: this.params.tintHue ?? 0.0 },
        uTintStrength: { value: this.params.tintStrength ?? 0.0 },
        uPaletteStrength: { value: this.params.paletteStrength ?? 0.0 },

        // 变体
        uVariant: { value: 0 },

        // 音频参数
        uAudioBass: { value: 0 },
        uAudioMid: { value: 0 },
        uAudioHigh: { value: 0 },
        uAudioSensitivity: { value: this.params.audioSensitivity },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec2 uMouse;

        uniform float uBrightness;
        uniform float uContrast;

        uniform float uTimeScale;
        uniform float uIterations;
        uniform float uWaveAmplitude;

        uniform float uMouseInfluence;

        uniform float uMetallicAmount;
        uniform float uMetallicSpeed;

        uniform float uTintHue;
        uniform float uTintStrength;
        uniform float uPaletteStrength;
        uniform int uVariant;

        uniform float uAudioBass;
        uniform float uAudioMid;
        uniform float uAudioHigh;
        uniform float uAudioSensitivity;

        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float hash1(float n) {
          return fract(sin(n) * 43758.5453);
        }

        vec3 hsv2rgb(vec3 c) {
          vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
          vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
          return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        vec3 applyContrast(vec3 col, float contrast) {
          return clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
        }

        mat2 rot(float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, -s, s, c);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash1(i.x + i.y * 57.0);
          float b = hash1(i.x + 1.0 + i.y * 57.0);
          float c = hash1(i.x + i.y * 57.0 + 1.0);
          float d = hash1(i.x + 1.0 + i.y * 57.0 + 1.0);
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm(vec2 p) {
          float sum = 0.0;
          float amp = 0.5;
          float freq = 1.0;
          for (int i = 0; i < 6; i++) {
            sum += amp * noise(p * freq);
            amp *= 0.5;
            freq *= 2.0;
          }
          return sum;
        }

        float mapEther(vec3 p, float t, float audioPulse) {
          p.xz *= rot(t * 0.4 + audioPulse * 0.08);
          p.xy *= rot(t * 0.3 - audioPulse * 0.05);
          vec3 q = p * 2.0 + t + audioPulse;
          return length(p + vec3(sin(t * 0.7 + audioPulse))) * log(length(p) + 1.0) +
            sin(q.x + sin(q.z + sin(q.y))) * 0.5 - 1.0;
        }

        float linesPattern(vec2 uv, float thickness, float distortion, float t) {
          float y = uv.y;
          float distortionAmount = distortion * fbm(vec2(uv.x * 2.0, y * 0.5 + t * 0.1));
          y += distortionAmount;
          float linePattern = fract(y * 20.0);
          float line = smoothstep(0.5 - thickness, 0.5, linePattern) -
            smoothstep(0.5, 0.5 + thickness, linePattern);
          return line;
        }

        void main() {
          vec2 fragCoord = vUv * uResolution;
          vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
          vec2 p = (vUv - 0.5) * aspect * 2.0;

          vec2 mouseDir = (uMouse - 0.5) * 2.0;
          float mouseInfluence = length(mouseDir) * 0.35 * uMouseInfluence;

          float audioPulse = (uAudioBass * 0.5 + uAudioMid * 0.3 + uAudioHigh * 0.2) * uAudioSensitivity;
          float audioMod = 1.0 + audioPulse;

          vec2 uv = p + mouseDir * 0.15 * sin(uTime * uTimeScale * 0.4);

          vec3 platinum = vec3(0.88, 0.90, 0.93);
          vec3 lightSilver = vec3(0.78, 0.81, 0.85);
          vec3 darkSilver = vec3(0.48, 0.52, 0.56);

          float gradient = sin(uv.x * 2.0 + uTime * uTimeScale * 0.5) * 0.5 + 0.5;
          float secondaryGradient = cos(uv.y * 1.5 + uTime * uTimeScale * 0.3) * 0.5 + 0.5;
          vec3 baseColor = mix(darkSilver, platinum, gradient);
          baseColor = mix(baseColor, lightSilver, secondaryGradient * 0.6);

          float hue = fract(uTintHue + gradient * 0.12 + secondaryGradient * 0.08 + uTime * 0.01);
          vec3 palette = hsv2rgb(vec3(hue, 0.72, 1.0));
          baseColor = mix(baseColor, palette, clamp(uPaletteStrength, 0.0, 1.0));

          vec3 color = vec3(0.0);

          if (uVariant == 0) {
            float maxIter = max(1.0, min(10.0, uIterations));
            vec2 wuv = uv;
            for (float i = 1.0; i < 10.0; i++) {
              if (i > maxIter) break;
              wuv.x += uWaveAmplitude / i * cos(i * 2.5 * wuv.y + uTime * uTimeScale + mouseInfluence * audioMod);
              wuv.y += uWaveAmplitude / i * cos(i * 1.5 * wuv.x + uTime * uTimeScale + mouseInfluence * audioMod);
            }
            float denom = abs(sin(uTime * uTimeScale - wuv.y - wuv.x));
            float intensity = 1.0 / max(0.08, denom);
            color = baseColor * clamp(intensity * 0.18, 0.0, 2.0);
          } else if (uVariant == 1) {
            float t = uTime * uTimeScale;
            vec2 pp = p * 0.9;
            vec3 cl = vec3(0.0);
            float d = 2.4;
            for (int i = 0; i < 6; i++) {
              vec3 p3d = vec3(0.0, 0.0, 5.0) + normalize(vec3(pp, -1.0)) * d;
              float rz = mapEther(p3d, t, audioPulse);
              float f = clamp((rz - mapEther(p3d + 0.1, t, audioPulse)) * 0.5, -0.1, 1.0);
              vec3 base = mix(baseColor * 0.35, baseColor * 1.25, f);
              cl = cl * base + smoothstep(2.5, 0.0, rz) * 0.7 * base;
              d += min(rz, 1.0);
            }
            color = cl;
          } else if (uVariant == 2) {
            vec4 acc = vec4(0.0);
            vec2 b = vec2(0.0, 0.2 + 0.12 * audioPulse);
            for (int i = 0; i < 20; i++) {
              float fi = float(i) + 1.0;
              float angle = fi + audioPulse * 0.4;
              mat2 R = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
              float angle2 = fi + 33.0 + audioPulse;
              mat2 R2 = mat2(cos(angle2), -sin(angle2), sin(angle2), cos(angle2));
              vec2 coord = fragCoord / uResolution.y * fi * 0.1 + uTime * b;
              vec2 fracCoord = fract(coord * R2) - 0.5;
              vec2 p2 = R * fracCoord;
              vec2 clamped = clamp(p2, -b, b);
              float len = length(clamped - p2);
              if (len > 0.0) {
                vec4 star = 1e-3 / len * (cos(p2.y / 0.1 + vec4(0.0, 1.0, 2.0, 3.0)) + 1.0);
                acc += star;
              }
            }
            vec3 nebula = mix(vec3(0.02, 0.02, 0.04), baseColor, 0.45 + 0.25 * audioPulse);
            color = nebula + acc.rgb * (0.4 + 0.8 * audioPulse);
          } else {
            float t = uTime * uTimeScale;
            vec2 uvLines = fragCoord / uResolution.xy;
            uvLines.x *= uResolution.x / uResolution.y;
            float thickness = 0.035 + 0.045 * uWaveAmplitude;
            float distortion = 0.18 + 0.32 * uWaveAmplitude;
            float line = linesPattern(uvLines, thickness, distortion, t);
            float timeOffset = sin(t * 0.2) * 0.1;
            float animated = linesPattern(uvLines + vec2(timeOffset, 0.0), thickness, distortion, t);
            line = mix(line, animated, 0.35);
            color = mix(vec3(0.02, 0.02, 0.03), baseColor, line);
            color += vec3(0.12, 0.12, 0.16) * line * audioPulse;
          }

          float metallicSheen = sin(gradient * 3.14159 + uTime * uTimeScale * uMetallicSpeed) *
            uMetallicAmount + (1.0 - uMetallicAmount * 0.45);
          color *= metallicSheen;

          color *= uBrightness * (0.9 + 0.2 * audioPulse);
          color += vec3(uAudioHigh * 0.06 * uAudioSensitivity);

          vec3 tint = hsv2rgb(vec3(fract(uTintHue), 0.75, 1.0));
          color = mix(color, color * tint, clamp(uTintStrength, 0.0, 1.0));

          color = applyContrast(color, max(0.01, uContrast));

          gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    // Allow layer to fade via material opacity.
    this.material.transparent = true;
    this.material.opacity = 1;

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geometry, this.material);

    // 鼠标跟踪
    window.addEventListener("mousemove", this.onMouseMove);
  }

  // Layer接口方法
  init(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.mesh);
  }

  // 设置音频数据（从外部调用）
  setAudioBands(audioBands: AudioBands) {
    this.currentAudioBands = audioBands;
  }

  setAudioFrame(frame: AudioFrame) {
    const kick = this.clamp01Local(
      frame.features?.kick01Long ?? frame.features?.kick01Raw ?? 0,
      0
    );
    const bass = this.clamp01Local(
      frame.features?.bass01Long ??
        frame.features?.bass01Raw ??
        frame.bands?.low ??
        0,
      0
    );
    const synth = this.clamp01Local(
      frame.features?.synth01Long ??
        frame.features?.synth01Raw ??
        frame.bands?.mid ??
        0,
      0
    );
    const clap = this.clamp01Local(
      frame.features?.clap01Long ?? frame.features?.clap01Raw ?? 0,
      0
    );
    const hihat = this.clamp01Local(
      frame.features?.hihat01Long ??
        frame.features?.hihat01Raw ??
        frame.bands?.high ??
        0,
      0
    );

    const low = Math.min(
      1,
      Math.max(frame.bands?.low ?? 0, 0.55 * bass + 0.35 * kick)
    );
    const mid = Math.min(
      1,
      Math.max(frame.bands?.mid ?? 0, 0.8 * synth + 0.15 * bass)
    );
    const high = Math.min(
      1,
      Math.max(frame.bands?.high ?? 0, 0.75 * hihat + 0.25 * clap)
    );

    this.currentAudioBands = { low, mid, high };

    const accent01 = Math.min(1, 0.55 * kick + 0.25 * hihat + 0.2 * clap);
    this.currentAudioEnergy = Math.min(
      1,
      Math.max(0, frame.energy * (0.95 + 0.35 * accent01))
    );
  }

  setAudioReactiveMultiplier(value: number) {
    const v = Number(value);
    this.audioReactiveMultiplier = Number.isFinite(v)
      ? Math.min(3, Math.max(0, v))
      : 1;
  }

  private onMouseMove = (event: MouseEvent) => {
    this.mouse.x = event.clientX / window.innerWidth;
    this.mouse.y = 1.0 - event.clientY / window.innerHeight;
  };

  // 更新参数到shader
  updateParams() {
    const rawOpacity = Number(this.params.opacity ?? 1);
    const opacity = Number.isFinite(rawOpacity)
      ? Math.min(1, Math.max(0, rawOpacity))
      : 1;
    this.material.opacity = Math.min(
      1,
      Math.max(0, opacity * this.overlayOpacityMultiplier)
    );

    const timeScale = this.clampNumber(
      this.params.timeScale * this.runtimeTimeScaleMul + this.runtimeTimeScaleAdd,
      0,
      5,
      this.params.timeScale
    );
    const iterations = this.clampNumber(
      this.params.iterations + this.runtimeIterationsAdd,
      1,
      10,
      this.params.iterations
    );
    const waveAmplitude = this.clampNumber(
      this.params.waveAmplitude * this.runtimeWaveAmplitudeMul,
      0,
      2,
      this.params.waveAmplitude
    );
    this.material.uniforms.uTimeScale.value = timeScale;
    this.material.uniforms.uIterations.value = iterations;
    this.material.uniforms.uWaveAmplitude.value = waveAmplitude;

    this.material.uniforms.uMouseInfluence.value = this.params.mouseInfluence;

    const metallicAmount = this.clampNumber(
      this.params.metallicAmount + this.runtimeMetallicAmountAdd,
      0,
      1,
      this.params.metallicAmount
    );
    this.material.uniforms.uMetallicAmount.value = metallicAmount;
    this.material.uniforms.uMetallicSpeed.value = this.params.metallicSpeed;

    const brightness = this.clampNumber(
      this.params.brightness * this.runtimeBrightnessMul,
      0.35,
      3,
      this.params.brightness
    );
    this.material.uniforms.uBrightness.value = brightness;
    const baseContrast = this.clampNumber(
      this.params.contrast ?? 1,
      0.7,
      1.6,
      1
    );
    this.material.uniforms.uContrast.value = this.clampNumber(
      baseContrast * this.runtimeContrastMul,
      0.7,
      1.6,
      1
    );

    const hue =
      this.runtimeTintHue != null
        ? this.runtimeTintHue
        : this.params.tintHue ?? 0;
    this.material.uniforms.uTintHue.value = this.clamp01Local(hue, 0);
    this.material.uniforms.uTintStrength.value = this.clamp01Local(
      (this.params.tintStrength ?? 0) + this.runtimeTintStrengthAdd,
      0
    );
    this.material.uniforms.uPaletteStrength.value = this.clamp01Local(
      (this.params.paletteStrength ?? 0) + this.runtimePaletteStrengthAdd,
      0
    );

    const variant = this.params.variant ?? "metal";
    const variantInt =
      variant === "waves"
        ? 1
        : variant === "stars"
        ? 2
        : variant === "lines"
        ? 3
        : 0;
    this.material.uniforms.uVariant.value = variantInt;

    this.material.uniforms.uAudioSensitivity.value =
      this.params.audioSensitivity * this.audioReactiveMultiplier;
  }

  private clamp01Local(value: unknown, fallback: number) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  }

  private clampNumber(
    value: unknown,
    min: number,
    max: number,
    fallback: number
  ) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  update(deltaTime: number) {
    const elapsed = (Date.now() - this.startTime) * 0.001;

    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uMouse.value.copy(this.mouse);

    // 音频响应
    const audioBands = this.currentAudioBands;
    const baseBrightness = Number(this.params.brightness) || 1;
    const tunedBrightness = this.clampNumber(
      baseBrightness * this.runtimeBrightnessMul,
      0.35,
      3,
      baseBrightness
    );
    const audioEnergy01 =
      this.params.audioReactive && audioBands
        ? this.currentAudioEnergy * this.audioReactiveMultiplier
        : 0;
    const nextBrightness = Math.min(
      1.05,
      Math.max(0.35, tunedBrightness + audioEnergy01 * 0.15)
    );
    if (this.params.audioReactive && audioBands) {
      this.material.uniforms.uAudioBass.value = audioBands.low;
      this.material.uniforms.uAudioMid.value = audioBands.mid;
      this.material.uniforms.uAudioHigh.value = audioBands.high;
    } else {
      this.material.uniforms.uAudioBass.value = 0;
      this.material.uniforms.uAudioMid.value = 0;
      this.material.uniforms.uAudioHigh.value = 0;
    }
    this.material.uniforms.uBrightness.value = nextBrightness;
    const tunedWaveAmplitude = this.clampNumber(
      this.params.waveAmplitude * this.runtimeWaveAmplitudeMul,
      0,
      2,
      this.params.waveAmplitude
    );
    this.material.uniforms.uWaveAmplitude.value =
      tunedWaveAmplitude * (1 + audioEnergy01 * 0.25);
  }

  // onResize 是可选的Layer方法
  onResize(width: number, height: number) {
    this.material.uniforms.uResolution.value.set(width, height);
  }

  dispose() {
    window.removeEventListener("mousemove", this.onMouseMove);
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
