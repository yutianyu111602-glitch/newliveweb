# newliveweb 项目代码优化建议报告

> 生成时间：2026-01-28
> 分析范围：src/app/, src/features/, src/audio/, src/performance/
> 模型：MiniMax-M2.1

---

## 1. 项目概述

### 1.1 项目结构

```
newliveweb/
├── src/
│   ├── app/                    # 主应用入口和核心逻辑
│   │   ├── bootstrap.ts        # 主装配逻辑 (~12000行)
│   │   ├── renderShell.ts      # DOM 渲染模板
│   │   ├── controllers/        # 控制器层
│   │   └── bindings/           # DOM/MIDI 绑定
│   ├── audio/                  # 音频处理
│   │   ├── AudioBus.ts         # 音频主分发 (~900行)
│   │   ├── StreamAudioProcessor.ts
│   │   └── audioControls/
│   ├── layers/                 # 可视化图层
│   │   ├── LiquidMetalLayerV2.ts
│   │   ├── ProjectMLayer.ts
│   │   ├── CameraLayer.ts
│   │   └── DepthLayer.ts
│   ├── features/               # 功能模块
│   │   ├── presets/           # 预设管理
│   │   ├── favorites/         # 收藏系统
│   │   ├── aivj/              # AI 演出控制
│   │   ├── macros/            # 宏控制
│   │   └── closedLoop/        # 闭环控制
│   ├── config/                 # 配置
│   ├── performance/           # 性能管理
│   └── types/                  # 类型定义
```

### 1.2 核心功能

1. **音乐可视化**: LiquidMetal Shader + ProjectM 渲染
2. **音频处理**: 实时频谱分析、节拍检测、能量追踪
3. **预设管理**: 本地/远程 MilkDrop 预设加载
4. **AIVJ 自动演出**: 基于音频特征的智能切换
5. **宏系统**: 8通道参数映射和控制
6. **MIDI 控制**: MIDI 设备绑定和映射
7. **深度摄像头**: 支持 RealSense/LiDAR/Webcam

---

## 2. 发现的问题和优化点

### 2.1 主应用 bootstrap.ts

**文件**: `src/app/bootstrap.ts`
**行数**: ~12000行（超大文件）

#### 问题 2.1.1: 文件过大，违反单一职责原则

**当前代码示例**:
```typescript
// 文件开头导入区 (~50行)
import { SceneManager } from "../SceneManager";
import { LiquidMetalLayerV2 } from "../layers/LiquidMetalLayerV2";
// ... 更多导入

export function bootstrapApp() {
  // 500+ 行配置
  // 1000+ 行状态变量
  // 2000+ 行控制逻辑
  // ...
}
```

**优化建议**: 拆分为多个模块
```typescript
// src/app/bootstrap/
export { bootstrapApp } from "./bootstrapOrchestrator";
export { initControlPlane } from "./controlPlane";
export { initPerformanceCoordinator } from "./performanceCoordinator";
export { initRenderLoop } from "./renderLoop";
```

#### 问题 2.1.2: 魔法数字过多

**文件**: `src/app/bootstrap.ts` (行 700-900)

**当前代码**:
```typescript
const AUDIO_VALID_RMS_MIN = 0.005;
const AUDIO_VALID_FRAMES = 12;
const AUDIO_COOLDOWN_MS = 1200;
const BEAT_TRUST_MS = 1500;
const BEAT_COOLDOWN_MS = 2000;
const RENDER_COOLDOWN_MS = 2500;
const FRAME_TIME_P95_LIMIT_MS = 10.5;
const AUDIO_ANALYSIS_FPS_MIN = 30;
// ... 50+ 个魔法数字
```

**优化建议**: 集中到配置对象
```typescript
// src/config/performanceThresholds.ts
export const PERFORMANCE_THRESHOLDS = {
  audio: {
    validRmsMin: 0.005,
    validFrames: 12,
    cooldownMs: 1200,
  },
  beat: {
    trustMs: 1500,
    cooldownMs: 2000,
  },
  render: {
    cooldownMs: 2500,
    frameTimeP95LimitMs: 10.5,
  },
  analysis: {
    fpsMin: 30,
    fpsMid: 45,
    fpsMax: 60,
  },
} as const;
```

#### 问题 2.1.3: 状态变量未封装

**文件**: `src/app/bootstrap.ts` (行 800-1000)

**当前代码**:
```typescript
let gateAudioValid = false;
let gateBeatTrusted = false;
let gateRenderStable = true;
let frameTimeP95Ms = 0;
let audioValidFrames = 0;
let audioCooldownUntilMs = 0;
let beatOkSinceMs = 0;
let beatCooldownUntilMs = 0;
let renderCooldownUntilMs = 0;
let lastResCommitMs = 0;
// ... 50+ 独立变量
```

**优化建议**: 使用状态管理
```typescript
// src/app/state/gateState.ts
export interface GateState {
  audioValid: boolean;
  beatTrusted: boolean;
  renderStable: boolean;
  frameTimeP95Ms: number;
}

export class GateStateManager {
  private state: GateState = {
    audioValid: false,
    beatTrusted: false,
    renderStable: true,
    frameTimeP95Ms: 0,
  };

  updateAudioValid(valid: boolean, nowMs: number): void {
    // 带冷却的状态更新
  }
  
  // ... 其他方法
}
```

---

### 2.2 音频模块 AudioBus.ts

**文件**: `src/audio/AudioBus.ts`
**行数**: ~900行

#### 问题 2.2.1: 函数过长，可读性差

**文件**: `src/audio/AudioBus.ts` (行 400-600)

**当前代码**:
```typescript
private buildFrame(
  data: AudioData,
  opts: { frequencyUpdated?: boolean } = {}
): AudioFrame {
  const frame = this.framePool.getFrame();
  const pcm512 = resampleTo512(data.pcm, this.pcm512Buffer ?? undefined);
  this.pcm512Buffer = pcm512;
  // ... 150+ 行连续逻辑
  // 能量计算
  // 频段特征
  // 长尾跟踪
  // ...
  return frame;
}
```

**优化建议**: 拆分为子函数
```typescript
private buildFrame(
  data: AudioData,
  opts: { frequencyUpdated?: boolean } = {}
): AudioFrame {
  const frame = this.framePool.getFrame();
  
  this.buildPcmSection(frame, data);
  this.buildEnergySection(frame, data);
  this.buildBandFeatures(frame, data, opts);
  this.buildStageBands(frame, data, opts);
  
  return frame;
}

private buildPcmSection(frame: AudioFrame, data: AudioData): void {
  const pcm512 = resampleTo512(data.pcm, this.pcm512Buffer ?? undefined);
  this.pcm512Buffer = pcm512;
  // ...
}

private buildEnergySection(frame: AudioFrame, data: AudioData): void {
  // 能量归一化逻辑
}
```

#### 问题 2.2.2: 类型安全问题

**文件**: `src/audio/AudioBus.ts` (行 100-150)

**当前代码**:
```typescript
type TechnoBandFeatures = {
  kick01Raw: number;
  bass01Raw: number;
  clap01Raw: number;
  synth01Raw: number;
  hihat01Raw: number;
};

// 直接修改对象属性，无类型保护
function computeTechnoBandFeaturesInto(
  out: TechnoBandFeatures,
  bins: Uint8Array,
  sampleRate: number
): void {
  out.kick01Raw = avgBins01(bins, sampleRate, 40, 110);
  out.bass01Raw = avgBins01(bins, sampleRate, 60, 250);
  // ...
}
```

**优化建议**: 使用只读类型和验证
```typescript
type TechnoBandFeatures = {
  readonly kick01Raw: number;
  readonly bass01Raw: number;
  // ...
};

function computeTechnoBandFeaturesInto(
  out: WritableTechnoBandFeatures,
  bins: Uint8Array,
  sampleRate: number
): TechnoBandFeatures {
  return {
    kick01Raw: avgBins01(bins, sampleRate, 40, 110),
    bass01Raw: avgBins01(bins, sampleRate, 60, 250),
    // ...
  };
}
```

---

### 2.3 预设控制器 PresetsController.ts

**文件**: `src/features/presets/PresetsController.ts`
**行数**: ~800行

#### 问题 2.3.1: 错误处理重复

**当前代码**:
```typescript
const isTransientPresetLoadError = (error: unknown) => {
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    const msg = String(error.message || "");
    return (
      msg.includes("Network timeout") ||
      msg.includes("timeout=") ||
      // ... 重复的错误模式
    );
  }
  // ...
};

const shouldPauseAutoCycleOnError = (origin?: string | null) => {
  const normalized = (origin ?? "").trim().toLowerCase();
  return normalized === "auto" || normalized.startsWith("auto");
};
```

**优化建议**: 统一错误分类
```typescript
// src/utils/errorClassifiers.ts
export type ErrorCategory = "network" | "abort" | "timeout" | "parse" | "unknown";

export const classifyError = (error: unknown): ErrorCategory => {
  // 统一的错误分类逻辑
};

export const isTransientError = (error: unknown): boolean => {
  return ["network", "abort", "timeout"].includes(classifyError(error));
};
```

---

### 2.4 渲染层 SceneManager.ts

**文件**: `src/SceneManager.ts`
**行数**: ~800行

#### 问题 2.4.1: 资源池管理复杂

**当前代码**:
```typescript
private rtPool = new Map<
  string,
  {
    bg: THREE.WebGLRenderTarget;
    pmFg: THREE.WebGLRenderTarget;
    pmBg: THREE.WebGLRenderTarget;
    lastUsedMs: number;
  }
>();

private rtBackground: THREE.WebGLRenderTarget | null = null;
private rtProjectMFg: THREE.WebGLRenderTarget | null = null;
private rtProjectMBg: THREE.WebGLRenderTarget | null = null;
```

**优化建议**: 封装资源池
```typescript
// src/performance/RenderTargetPool.ts
export class RenderTargetPool {
  private pool = new Map<string, ManagedRenderTarget>();
  
  acquire(key: string, config: RenderTargetConfig): THREE.WebGLRenderTarget {
    // 统一的获取逻辑
  }
  
  release(key: string): void {
    // 统一的释放逻辑
  }
  
  getStats(): PoolStats {
    return {
      size: this.pool.size,
      hits: this.hitCount,
      misses: this.missCount,
    };
  }
}
```

---

### 2.5 宏系统 computeMacroPatch.ts

**文件**: `src/features/macros/computeMacroPatch.ts`
**行数**: ~250行

#### 问题 2.5.1: 参数硬编码

**当前代码**:
```typescript
const effectiveFusion = clamp01(
  inputs.macros.fusion + 0.12 * slotAvgDev + 0.18 * s0,
  0.5
);
const effectiveMotion = clamp01(
  inputs.macros.motion + 0.1 * slotAvgDev + 0.18 * s1,
  0.5
);
const effectiveSparkle = clamp01(
  inputs.macros.sparkle + 0.1 * slotAvgDev + 0.18 * s2,
  0.5
);
```

**优化建议**: 配置化
```typescript
// src/config/macroWeights.ts
export const MACRO_WEIGHTS = {
  fusion: {
    base: 1.0,
    slotAvg: 0.12,
    slot0: 0.18,
  },
  motion: {
    base: 1.0,
    slotAvg: 0.1,
    slot1: 0.18,
  },
  sparkle: {
    base: 1.0,
    slotAvg: 0.1,
    slot2: 0.18,
  },
} as const;
```

---

### 2.6 通用问题

#### 2.6.1: 缺少单元测试

**现状**: 项目没有发现单元测试文件

**建议**: 添加测试框架（Vitest）
```
// test/audio/AudioBus.test.ts
describe("AudioBus", () => {
  it("should normalize energy correctly", () => {
    // ...
  });
});
```

#### 2.6.2: 缺少 API 文档

**现状**: 没有发现 API 文档注释

**建议**: 使用 TypeDoc 生成文档
```typescript
/**
 * AudioBus - 音频主分发器
 * 
 * 负责音频加载、频谱分析、能量追踪
 * 
 * @example
 * ```typescript
 * const audioBus = new AudioBus();
 * await audioBus.loadFile(file);
 * ```
 */
export class AudioBus {
  // ...
}
```

#### 2.6.3: 日志级别不统一

**当前代码**:
```typescript
console.error("[bootstrap] failed", err);
console.warn(`[RunManifest] retry in ${delayMs}ms...`);
console.log(`[PerformanceBudget] Level changed...`);
```

**建议**: 统一日志系统
```typescript
// src/utils/logger.ts
export const createLogger = (prefix: string) => ({
  debug: (msg: string, ...args: any[]) => { /* ... */ },
  info: (msg: string, ...args: any[]) => { /* ... */ },
  warn: (msg: string, ...args: any[]) => { /* ... */ },
  error: (msg: string, ...args: any[]) => { /* ... */ },
});
```

---

## 3. 新模块骨架代码

### 3.1 配置模块 src/config/performanceThresholds.ts

```typescript
// src/config/performanceThresholds.ts

/**
 * 性能阈值配置
 * 
 * 集中管理所有性能相关的魔法数字
 */

export const PERFORMANCE_THRESHOLDS = {
  audio: {
    validRmsMin: 0.005,
    validFrames: 12,
    cooldownMs: 1200,
  },
  beat: {
    trustMs: 1500,
    cooldownMs: 2000,
  },
  render: {
    cooldownMs: 2500,
    frameTimeP95LimitMs: 10.5,
  },
  analysis: {
    fpsMin: 30,
    fpsMid: 45,
    fpsMax: 60,
    cooldownMs: 4000,
  },
  projectM: {
    audioFeed: {
      highMs: 33,
      midMs: 50,
      lowMs: 70,
    },
  },
  resolution: {
    scaleSteps: [1, 0.85, 0.7, 0.6] as const,
    cooldownMs: 2500,
    probeAfterMs: 3000,
  },
} as const;

export type PerformanceThresholdKey = keyof typeof PERFORMANCE_THRESHOLDS;
```

### 3.2 状态管理模块 src/app/state/gateState.ts

```typescript
// src/app/state/gateState.ts

import { PERFORMANCE_THRESHOLDS } from "../../config/performanceThresholds";

export interface GateState {
  audioValid: boolean;
  beatTrusted: boolean;
  renderStable: boolean;
  frameTimeP95Ms: number;
}

export class GateStateManager {
  private state: GateState = {
    audioValid: false,
    beatTrusted: false,
    renderStable: true,
    frameTimeP95Ms: 0,
  };
  
  private audioValidFrames = 0;
  private audioCooldownUntilMs = 0;
  private beatOkSinceMs = 0;
  private beatCooldownUntilMs = 0;
  
  updateAudioValid(valid: boolean, nowMs: number): void {
    if (valid) {
      this.audioValidFrames++;
    } else {
      this.audioValidFrames = 0;
    }
    
    const cfg = PERFORMANCE_THRESHOLDS.audio;
    if (this.audioValidFrames >= cfg.validFrames) {
      this.state.audioValid = true;
    }
    
    if (nowMs < this.audioCooldownUntilMs) {
      this.state.audioValid = true;
    }
  }
  
  setAudioCooldown(untilMs: number): void {
    this.audioCooldownUntilMs = untilMs;
    this.state.audioValid = false;
  }
  
  getState(): Readonly<GateState> {
    return Object.freeze({ ...this.state });
  }
  
  reset(): void {
    this.state = {
      audioValid: false,
      beatTrusted: false,
      renderStable: true,
      frameTimeP95Ms: 0,
    };
    this.audioValidFrames = 0;
    this.audioCooldownUntilMs = 0;
  }
}
```

### 3.3 统一错误分类器 src/utils/errorClassifiers.ts

```typescript
// src/utils/errorClassifiers.ts

export type ErrorCategory = 
  | "network" 
  | "abort" 
  | "timeout" 
  | "parse" 
  | "validation" 
  | "unknown";

export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  isTransient: boolean;
  isRetryable: boolean;
}

const TRANSIENT_CATEGORIES: ErrorCategory[] = [
  "network", "abort", "timeout"
];

const RETRYABLE_PATTERNS = [
  "Network error",
  "timeout",
  "ECONNRESET",
  "ETIMEDOUT",
];

export function classifyError(error: unknown): ClassifiedError {
  let message = "Unknown error";
  let category: ErrorCategory = "unknown";
  
  if (error instanceof Error) {
    message = error.message;
    category = inferCategory(error);
  } else if (typeof error === "string") {
    message = error;
  } else if (error && typeof error === "object") {
    message = String((error as any)?.message ?? JSON.stringify(error));
  }
  
  const isTransient = TRANSIENT_CATEGORIES.includes(category);
  const isRetryable = RETRYABLE_PATTERNS.some(p => 
    message.toLowerCase().includes(p.toLowerCase())
  );
  
  return { category, message, isTransient, isRetryable };
}

function inferCategory(error: Error): ErrorCategory {
  if (error.name === "AbortError") return "abort";
  if (error.message.includes("Network")) return "network";
  if (error.message.includes("timeout")) return "timeout";
  if (error instanceof SyntaxError) return "parse";
  return "unknown";
}

export function isTransientError(error: unknown): boolean {
  return classifyError(error).isTransient;
}

export function isRetryableError(error: unknown): boolean {
  return classifyError(error).isRetryable;
}
```

### 3.4 事件发射器 src/utils/EventEmitter.ts

```typescript
// src/utils/EventEmitter.ts

type Listener<TArgs extends any[]> = (...args: TArgs) => void;

export class EventEmitter<Events extends Record<string, any[]>> {
  private listeners = new Map<keyof Events, Set<Listener<any>>>();
  
  on<K extends keyof Events>(
    event: K,
    listener: Listener<Events[K]>
  ): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return this;
  }
  
  off<K extends keyof Events>(
    event: K,
    listener: Listener<Events[K]>
  ): this {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
    return this;
  }
  
  once<K extends keyof Events>(
    event: K,
    listener: Listener<Events[K]>
  ): this {
    const wrapper: Listener<Events[K]> = (...args) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }
  
  emit<K extends keyof Events>(
    event: K,
    ...args: Events[K]
  ): boolean {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return false;
    
    for (const listener of set) {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in event listener for ${String(event)}:`, error);
      }
    }
    return true;
  }
  
  eventNames(): (keyof Events)[] {
    return Array.from(this.listeners.keys());
  }
  
  listenerCount(event: keyof Events): number {
    const set = this.listeners.get(event);
    return set?.size ?? 0;
  }
  
  removeAllListeners(event?: keyof Events): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}
```

### 3.5 资源池管理器 src/performance/RenderTargetPool.ts

```typescript
// src/performance/RenderTargetPool.ts

import * as THREE from "three";

export interface RenderTargetConfig {
  width: number;
  height: number;
  minFilter?: THREE.Filter;
  magFilter?: THREE.Filter;
  format?: THREE.PixelFormat;
  type?: THREE.TextureDataType;
}

export interface ManagedRenderTarget {
  target: THREE.WebGLRenderTarget;
  lastUsedMs: number;
  accessCount: number;
}

export interface PoolStats {
  size: number;
  hits: number;
  misses: number;
  totalAccesses: number;
}

export class RenderTargetPool {
  private pool = new Map<string, ManagedRenderTarget>();
  private hits = 0;
  private misses = 0;
  private readonly maxPoolSize = 10;
  private readonly evictionThresholdMs = 30000; // 30秒未使用则回收
  
  acquire(key: string, config: RenderTargetConfig): THREE.WebGLRenderTarget {
    const existing = this.pool.get(key);
    
    if (existing) {
      existing.lastUsedMs = performance.now();
      existing.accessCount++;
      this.hits++;
      return existing.target;
    }
    
    this.misses++;
    const target = this.createTarget(config);
    
    // 检查池大小，必要时回收
    if (this.pool.size >= this.maxPoolSize) {
      this.evictLeastUsed();
    }
    
    this.pool.set(key, {
      target,
      lastUsedMs: performance.now(),
      accessCount: 1,
    });
    
    return target;
  }
  
  release(key: string): boolean {
    return this.pool.delete(key);
  }
  
  getStats(): PoolStats {
    const total = this.hits + this.misses;
    return {
      size: this.pool.size,
      hits: this.hits,
      misses: this.misses,
      totalAccesses: total,
    };
  }
  
  private createTarget(config: RenderTargetConfig): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(config.width, config.height, {
      minFilter: config.minFilter ?? THREE.LinearFilter,
      magFilter: config.magFilter ?? THREE.LinearFilter,
      format: config.format ?? THREE.RGBAFormat,
      type: config.type ?? THREE.UnsignedByteType,
    });
  }
  
  private evictLeastUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.pool) {
      if (entry.lastUsedMs < oldestTime) {
        oldestTime = entry.lastUsedMs;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      const entry = this.pool.get(oldestKey);
      if (entry) {
        entry.target.dispose();
      }
      this.pool.delete(oldestKey);
    }
  }
  
  dispose(): void {
    for (const entry of this.pool.values()) {
      entry.target.dispose();
    }
    this.pool.clear();
  }
}
```

### 3.6 日志模块 src/utils/logger.ts

```typescript
// src/utils/logger.ts

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  format?: "json" | "text";
}

export interface Logger {
  debug: (message: string, ...meta: any[]) => void;
  info: (message: string, ...meta: any[]) => void;
  warn: (message: string, ...meta: any[]) => void;
  error: (message: string, ...meta: any[]) => void;
  group: (label: string) => void;
  groupEnd: () => void;
}

const LEVEL_ORDER: LogLevel[] = ["debug", "info", "warn", "error"];

export function createLogger(options: LoggerOptions = {}): Logger {
  const {
    level = "info",
    prefix = "",
    format = "text",
  } = options;
  
  const minLevelIndex = LEVEL_ORDER.indexOf(level);
  
  const shouldLog = (msgLevel: LogLevel): boolean => {
    return LEVEL_ORDER.indexOf(msgLevel) >= minLevelIndex;
  };
  
  const formatMessage = (
    level: LogLevel,
    message: string,
    meta: any[]
  ): string => {
    if (format === "json") {
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        prefix,
        message,
        meta,
      });
    }
    
    const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
    const prefixStr = prefix ? `[${prefix}] ` : "";
    const metaStr = meta.length > 0 ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${prefixStr}${message}${metaStr}`;
  };
  
  const log = (level: LogLevel, message: string, ...meta: any[]) => {
    if (!shouldLog(level)) return;
    
    const formatted = formatMessage(level, message, meta);
    const consoleMethod = level === "debug" ? "log" : level;
    (console as any)[consoleMethod](formatted);
  };
  
  return {
    debug: (message: string, ...meta: any[]) => log("debug", message, ...meta),
    info: (message: string, ...meta: any[]) => log("info", message, ...meta),
    warn: (message: string, ...meta: any[]) => log("warn", message, ...meta),
    error: (message: string, ...meta: any[]) => log("error", message, ...meta),
    group: (label: string) => console.group(label),
    groupEnd: () => console.groupEnd(),
  };
}

// 全局日志实例
export const appLogger = createLogger({
  prefix: "newliveweb",
  level: import.meta.env.DEV ? "debug" : "info",
});
```

---

## 4. 优化优先级

| 优先级 | 问题 | 工作量 | 预期效果 |
|--------|------|--------|----------|
| P0 | bootstrap.ts 拆分 | 大 | 改善可维护性 |
| P0 | 魔法数字集中管理 | 中 | 方便调整参数 |
| P1 | 统一错误处理 | 小 | 提高错误可读性 |
| P1 | 资源池封装 | 中 | 避免内存泄漏 |
| P2 | 添加单元测试 | 中 | 提高代码质量 |
| P2 | 补充 API 文档 | 小 | 改善可维护性 |
| P2 | 统一日志系统 | 小 | 方便调试 |

---

## 5. 建议执行顺序

### 第一阶段（1-2 天）：快速修复
1. 集中管理魔法数字 → `src/config/performanceThresholds.ts`
2. 统一错误分类 → `src/utils/errorClassifiers.ts`

### 第二阶段（1 周）：架构改进
1. 拆分 bootstrap.ts
2. 封装资源池 → `src/performance/RenderTargetPool.ts`

### 第三阶段（2 周）：质量提升
1. 添加 Vitest 测试
2. 补充 TypeDoc 文档
3. 统一日志系统

---

*报告生成：Clawdbot AI Team*
*模型：MiniMax-M2.1*
