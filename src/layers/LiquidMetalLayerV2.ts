import * as THREE from 'three';
import type { Layer } from './Layer';
import type { AudioBands } from '../audio/types';

// 液态金属参数接口
export interface LiquidMetalParams {
  // 动画参数
  timeScale: number;        // 时间缩放 (0-5)
  iterations: number;       // 迭代次数 (1-10)
  waveAmplitude: number;    // 波浪幅度 (0-2)
  
  // 鼠标交互
  mouseInfluence: number;   // 鼠标影响强度 (0-1)
  
  // 金属质感
  metallicAmount: number;   // 金属度 (0-1)
  metallicSpeed: number;    // 金属闪烁速度 (0-5)
  
  // 亮度
  brightness: number;       // 亮度 (0-3)
  
  // 音频响应
  audioReactive: boolean;   // 是否响应音频
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
  
  // 默认参数
  public params: LiquidMetalParams = {
    timeScale: 1.0,
    iterations: 10,
    waveAmplitude: 0.6,
    
    mouseInfluence: 1.0,
    
    metallicAmount: 0.1,
    metallicSpeed: 1.0,
    
    brightness: 1.0,
    
    audioReactive: true,
    audioSensitivity: 1.0
  };

  constructor() {
    this.startTime = Date.now();
    
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    // 创建shader material - 复刻旧代码的液态金属效果
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
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
        
        // 音频参数
        uAudioBass: { value: 0 },
        uAudioMid: { value: 0 },
        uAudioHigh: { value: 0 },
        uAudioSensitivity: { value: this.params.audioSensitivity }
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
        
        uniform float uBaseHue;
        uniform float uBaseSaturation;
        uniform float uBrightness;
        
        uniform float uTimeScale;
        uniform float uIterations;
        uniform float uWaveAmplitude;
        
        uniform float uMouseInfluence;
        
        uniform float uMetallicAmount;
        uniform float uMetallicSpeed;
        
        uniform float uAudioBass;
        uniform float uAudioMid;
        uniform float uAudioHigh;
        uniform float uAudioSensitivity;
        
        varying vec2 vUv;
        
        void main() {
          // 标准化坐标 - 复刻旧代码的flowing_waves.frag
          vec2 uv = (2.0 * (vUv * uResolution) - uResolution) / min(uResolution.x, uResolution.y);
          
          // 鼠标交互
          vec2 mousePos = uMouse;
          vec2 mouseDir = (mousePos - 0.5) * 2.0;
          float mouseInfluence = length(mouseDir) * 0.3 * uMouseInfluence;
          
          // 音频调制
          float audioMod = 1.0 + (uAudioBass * 0.3 + uAudioMid * 0.2) * uAudioSensitivity;
          
          // UV变形 - 应用鼠标偏移
          uv += mouseDir * 0.1 * sin(uTime * uTimeScale * 0.5);
          
          // 波形叠加循环 - 核心算法
          float maxIter = uIterations;
          for(float i = 1.0; i < 10.0; i++){
            if (i >= maxIter) break;
            uv.x += uWaveAmplitude / i * cos(i * 2.5 * uv.y + uTime * uTimeScale + mouseInfluence * audioMod);
            uv.y += uWaveAmplitude / i * cos(i * 1.5 * uv.x + uTime * uTimeScale + mouseInfluence * audioMod);
          }
          
          // 强度计算
          float intensity = 1.0 / abs(sin(uTime * uTimeScale - uv.y - uv.x));
          
          // 银色调色板
          vec3 platinum = vec3(0.88, 0.90, 0.93);
          vec3 lightSilver = vec3(0.78, 0.81, 0.85);
          vec3 mediumSilver = vec3(0.65, 0.68, 0.72);
          vec3 darkSilver = vec3(0.48, 0.52, 0.56);
          
          // 渐变混合
          float gradient = sin(uv.x * 2.0 + uTime * uTimeScale * 0.5) * 0.5 + 0.5;
          float secondaryGradient = cos(uv.y * 1.5 + uTime * uTimeScale * 0.3) * 0.5 + 0.5;
          
          vec3 baseColor = mix(darkSilver, platinum, gradient);
          baseColor = mix(baseColor, lightSilver, secondaryGradient * 0.6);
          
          vec3 color = baseColor * intensity * 0.18 * uBrightness;
          
          // 金属质感
          float metallicSheen = sin(gradient * 3.14159 + uTime * uTimeScale * uMetallicSpeed) * uMetallicAmount + (1.0 - uMetallicAmount * 0.5);
          color *= metallicSheen;
          
          // 音频高频闪烁
          color += vec3(uAudioHigh * 0.05 * uAudioSensitivity);
          
          gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geometry, this.material);

    // 鼠标跟踪
    window.addEventListener('mousemove', this.onMouseMove);
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

  private onMouseMove = (event: MouseEvent) => {
    this.mouse.x = event.clientX / window.innerWidth;
    this.mouse.y = 1.0 - (event.clientY / window.innerHeight);
  };

  // 更新参数到shader
  updateParams() {
    this.material.uniforms.uTimeScale.value = this.params.timeScale;
    this.material.uniforms.uIterations.value = this.params.iterations;
    this.material.uniforms.uWaveAmplitude.value = this.params.waveAmplitude;
    
    this.material.uniforms.uMouseInfluence.value = this.params.mouseInfluence;
    
    this.material.uniforms.uMetallicAmount.value = this.params.metallicAmount;
    this.material.uniforms.uMetallicSpeed.value = this.params.metallicSpeed;
    
    this.material.uniforms.uBrightness.value = this.params.brightness;
    
    this.material.uniforms.uAudioSensitivity.value = this.params.audioSensitivity;
  }

  update(deltaTime: number) {
    const elapsed = (Date.now() - this.startTime) * 0.001;
    
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uMouse.value.copy(this.mouse);
    
    // 音频响应
    const audioBands = this.currentAudioBands;
    if (this.params.audioReactive && audioBands) {
      this.material.uniforms.uAudioBass.value = audioBands.low;
      this.material.uniforms.uAudioMid.value = audioBands.mid;
      this.material.uniforms.uAudioHigh.value = audioBands.high;
    } else {
      this.material.uniforms.uAudioBass.value = 0;
      this.material.uniforms.uAudioMid.value = 0;
      this.material.uniforms.uAudioHigh.value = 0;
    }
  }

  // onResize 是可选的Layer方法
  onResize(width: number, height: number) {
    this.material.uniforms.uResolution.value.set(width, height);
  }

  dispose() {
    window.removeEventListener('mousemove', this.onMouseMove);
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
