/**
 * 统一性能预算管理器
 *
 * 优化目标：
 * - 协调所有子系统的性能开销
 * - 自适应调整质量以维持目标帧率
 * - 统一预算分配逻辑
 * - 避免子系统间的竞争和冲突
 *
 * 管理的子系统：
 * - Audio Analysis (频谱分析 FPS)
 * - Beat Tempo (BPM 检测间隔)
 * - ProjectM Audio Feed (音频数据传递频率)
 * - Preset Prefetch (预取策略频率)
 * - Compositor (渲染质量级别)
 */

export type QualityLevel = "ultra" | "high" | "medium" | "low" | "minimal";

export type PerformanceBudget = {
  targetFrameTimeMs: number;
  audioAnalysisFps: number;
  beatTempoIntervalMs: number;
  pmAudioFeedIntervalMs: number;
  prefetchAggressiveness: number; // 0-1, 预取积极程度
  compositorQuality: number; // 0-1, compositor 质量
};

export type SubsystemMetrics = {
  audioAnalysisMs: number;
  beatTempoMs: number;
  pmRenderMs: number;
  compositorMs: number;
  prefetchOverhead: boolean;
};

export type BudgetConfig = {
  // 质量级别预算定义
  budgets: Record<QualityLevel, PerformanceBudget>;

  // 阈值配置
  frameTimeUpgradeThresholdMs: number; // 低于此阈值升级质量
  frameTimeDowngradeThresholdMs: number; // 超过此阈值降级质量

  // 冷却时间（避免频繁调整）
  adjustmentCooldownMs: number;

  // 历史窗口大小（用于 P95 计算）
  historySize: number;
};

const DEFAULT_CONFIG: BudgetConfig = {
  budgets: {
    ultra: {
      targetFrameTimeMs: 8, // 120fps
      audioAnalysisFps: 60,
      beatTempoIntervalMs: 600,
      pmAudioFeedIntervalMs: 16, // ~60fps
      prefetchAggressiveness: 1.0,
      compositorQuality: 1.0,
    },
    high: {
      targetFrameTimeMs: 16, // 60fps
      audioAnalysisFps: 60,
      beatTempoIntervalMs: 900,
      pmAudioFeedIntervalMs: 33, // ~30fps
      prefetchAggressiveness: 0.8,
      compositorQuality: 0.9,
    },
    medium: {
      targetFrameTimeMs: 20, // 50fps
      audioAnalysisFps: 45,
      beatTempoIntervalMs: 1200,
      pmAudioFeedIntervalMs: 50, // 20fps
      prefetchAggressiveness: 0.6,
      compositorQuality: 0.7,
    },
    low: {
      targetFrameTimeMs: 33, // 30fps
      audioAnalysisFps: 30,
      beatTempoIntervalMs: 1500,
      pmAudioFeedIntervalMs: 67, // 15fps
      prefetchAggressiveness: 0.4,
      compositorQuality: 0.5,
    },
    minimal: {
      targetFrameTimeMs: 50, // 20fps
      audioAnalysisFps: 20,
      beatTempoIntervalMs: 2000,
      pmAudioFeedIntervalMs: 100, // 10fps
      prefetchAggressiveness: 0.2,
      compositorQuality: 0.3,
    },
  },
  frameTimeUpgradeThresholdMs: 0.7, // 低于目标 70% → 升级
  frameTimeDowngradeThresholdMs: 1.2, // 超过目标 120% → 降级
  adjustmentCooldownMs: 3000, // 3秒冷却
  historySize: 30, // 30帧历史（0.5s @ 60fps）
};

/**
 * 性能预算管理器
 */
export class PerformanceBudgetManager {
  private currentLevel: QualityLevel;
  private config: BudgetConfig;

  private frameTimeHistory: number[] = [];
  private lastAdjustmentMs = 0;

  private subsystemMetrics: SubsystemMetrics = {
    audioAnalysisMs: 0,
    beatTempoMs: 0,
    pmRenderMs: 0,
    compositorMs: 0,
    prefetchOverhead: false,
  };

  // 回调函数（用于应用预算到各子系统）
  private callbacks: {
    onAudioAnalysisFpsChange?: (fps: number) => void;
    onBeatTempoIntervalChange?: (intervalMs: number) => void;
    onPmAudioFeedIntervalChange?: (intervalMs: number) => void;
    onPrefetchAggressivenessChange?: (level: number) => void;
    onCompositorQualityChange?: (quality: number) => void;
    onLevelChange?: (level: QualityLevel) => void;
  } = {};

  constructor(
    initialLevel: QualityLevel = "high",
    config?: Partial<BudgetConfig>
  ) {
    this.currentLevel = initialLevel;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 记录一帧的时间
   */
  recordFrameTime(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;

    this.frameTimeHistory.push(ms);
    if (this.frameTimeHistory.length > this.config.historySize) {
      this.frameTimeHistory.shift();
    }
  }

  /**
   * 更新子系统指标
   */
  updateSubsystemMetrics(metrics: Partial<SubsystemMetrics>): void {
    this.subsystemMetrics = { ...this.subsystemMetrics, ...metrics };
  }

  /**
   * 评估是否需要调整质量级别
   * 返回建议的新级别，如果无需调整则返回 null
   */
  evaluateAdjustment(nowMs: number): QualityLevel | null {
    // 检查冷却时间
    if (nowMs - this.lastAdjustmentMs < this.config.adjustmentCooldownMs) {
      return null;
    }

    // 需要足够的历史数据
    if (this.frameTimeHistory.length < this.config.historySize) {
      return null;
    }

    // 计算 P95 帧时间
    const p95 = this.computeP95FrameTime();
    if (!Number.isFinite(p95) || p95 <= 0) return null;

    const currentBudget = this.config.budgets[this.currentLevel];
    const targetFrameTime = currentBudget.targetFrameTimeMs;

    // 决策逻辑
    if (p95 > targetFrameTime * this.config.frameTimeDowngradeThresholdMs) {
      // 超出预算 20% → 降级
      return this.getNextLowerLevel(this.currentLevel);
    } else if (
      p95 <
      targetFrameTime * this.config.frameTimeUpgradeThresholdMs
    ) {
      // 低于预算 30% → 升级
      return this.getNextHigherLevel(this.currentLevel);
    }

    return null; // 无需调整
  }

  /**
   * 应用质量级别
   */
  applyLevel(level: QualityLevel, nowMs: number): void {
    if (level === this.currentLevel) return;

    const oldLevel = this.currentLevel;
    this.currentLevel = level;
    this.lastAdjustmentMs = nowMs;

    const budget = this.config.budgets[level];

    // 触发回调
    this.callbacks.onLevelChange?.(level);
    this.callbacks.onAudioAnalysisFpsChange?.(budget.audioAnalysisFps);
    this.callbacks.onBeatTempoIntervalChange?.(budget.beatTempoIntervalMs);
    this.callbacks.onPmAudioFeedIntervalChange?.(budget.pmAudioFeedIntervalMs);
    this.callbacks.onPrefetchAggressivenessChange?.(
      budget.prefetchAggressiveness
    );
    this.callbacks.onCompositorQualityChange?.(budget.compositorQuality);

    console.log(
      `[PerformanceBudget] Level changed: ${oldLevel} → ${level}`,
      budget
    );
  }

  /**
   * 手动设置质量级别
   */
  setLevel(level: QualityLevel, nowMs: number): void {
    this.applyLevel(level, nowMs);
  }

  /**
   * 注册回调函数
   */
  onAudioAnalysisFpsChange(callback: (fps: number) => void): void {
    this.callbacks.onAudioAnalysisFpsChange = callback;
  }

  onBeatTempoIntervalChange(callback: (intervalMs: number) => void): void {
    this.callbacks.onBeatTempoIntervalChange = callback;
  }

  onPmAudioFeedIntervalChange(callback: (intervalMs: number) => void): void {
    this.callbacks.onPmAudioFeedIntervalChange = callback;
  }

  onPrefetchAggressivenessChange(callback: (level: number) => void): void {
    this.callbacks.onPrefetchAggressivenessChange = callback;
  }

  onCompositorQualityChange(callback: (quality: number) => void): void {
    this.callbacks.onCompositorQualityChange = callback;
  }

  onLevelChange(callback: (level: QualityLevel) => void): void {
    this.callbacks.onLevelChange = callback;
  }

  /**
   * 获取当前质量级别
   */
  getCurrentLevel(): QualityLevel {
    return this.currentLevel;
  }

  /**
   * 获取当前预算
   */
  getCurrentBudget(): PerformanceBudget {
    return this.config.budgets[this.currentLevel];
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      currentLevel: this.currentLevel,
      frameTimeP95: this.computeP95FrameTime(),
      historySize: this.frameTimeHistory.length,
      lastAdjustmentMs: this.lastAdjustmentMs,
      subsystemMetrics: { ...this.subsystemMetrics },
      currentBudget: this.getCurrentBudget(),
    };
  }

  /**
   * 重置历史（用于测试或场景切换）
   */
  reset(): void {
    this.frameTimeHistory.length = 0;
    this.lastAdjustmentMs = 0;
  }

  /**
   * 计算 P95 帧时间
   */
  private computeP95FrameTime(): number {
    if (this.frameTimeHistory.length === 0) return 0;

    const sorted = [...this.frameTimeHistory].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    return sorted[p95Index] ?? sorted[sorted.length - 1] ?? 0;
  }

  /**
   * 获取下一个更低的质量级别
   */
  private getNextLowerLevel(current: QualityLevel): QualityLevel | null {
    const levels: QualityLevel[] = [
      "ultra",
      "high",
      "medium",
      "low",
      "minimal",
    ];
    const currentIndex = levels.indexOf(current);
    if (currentIndex < levels.length - 1) {
      return levels[currentIndex + 1];
    }
    return null; // 已经最低
  }

  /**
   * 获取下一个更高的质量级别
   */
  private getNextHigherLevel(current: QualityLevel): QualityLevel | null {
    const levels: QualityLevel[] = [
      "ultra",
      "high",
      "medium",
      "low",
      "minimal",
    ];
    const currentIndex = levels.indexOf(current);
    if (currentIndex > 0) {
      return levels[currentIndex - 1];
    }
    return null; // 已经最高
  }
}

/**
 * 创建全局单例
 */
export const createPerformanceBudgetManager = (
  initialLevel?: QualityLevel,
  config?: Partial<BudgetConfig>
): PerformanceBudgetManager => {
  return new PerformanceBudgetManager(initialLevel, config);
};
