/**
 * Preset 预测引擎 - 基于历史切换模式的智能预取
 *
 * 优化目标：
 * - Prefetch 命中率 ↑50%
 * - 减少 preset 加载延迟
 * - 提升用户体验（尤其是快速切换场景）
 *
 * 算法策略：
 * - 统计全局转移频率（preset A → preset B）
 * - 时间衰减（最近的切换权重更高）
 * - Markov 链补充（基于最近 2-3 次切换）
 * - 兜底顺序预取（保证基本覆盖）
 */

export type PresetTransition = {
  from: string; // preset ID
  to: string; // preset ID
  timestamp: number; // performance.now() or Date.now()
};

export type PredictionResult = {
  presetId: string;
  score: number; // 0-1, 预测置信度
  reason: "frequency" | "markov" | "sequential";
};

/**
 * Preset 预测引擎类
 */
export class PresetPredictor {
  // 转移历史记录（滑动窗口，最多保存 N 条）
  private transitionHistory: PresetTransition[] = [];
  private readonly MAX_HISTORY = 200; // 保存最近 200 次切换

  // 转移频率统计 (from -> to -> count)
  private transitionCounts = new Map<string, Map<string, number>>();

  // 时间衰减参数
  private readonly TIME_DECAY_HALF_LIFE_MS = 10 * 60 * 1000; // 10 分钟半衰期

  /**
   * 记录一次 preset 切换
   * @param from 源 preset ID（可能为 null，表示首次加载）
   * @param to 目标 preset ID
   */
  recordTransition(from: string | null, to: string): void {
    if (!to) return;

    // 只记录有效的转移（from 存在）
    if (from && from !== to) {
      const nowMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      // 添加到历史
      this.transitionHistory.push({ from, to, timestamp: nowMs });

      // 维护滑动窗口
      if (this.transitionHistory.length > this.MAX_HISTORY) {
        this.transitionHistory.shift();
      }

      // 更新频率统计
      this.updateTransitionCount(from, to);
    }
  }

  /**
   * 预测下一个可能的 presets
   * @param currentId 当前 preset ID
   * @param candidateIds 候选 preset ID 列表（用于过滤）
   * @param topK 返回前 K 个预测结果
   * @returns 预测结果数组（按 score 降序）
   */
  predict(
    currentId: string | null,
    candidateIds: string[],
    topK: number = 3
  ): PredictionResult[] {
    if (!currentId || !candidateIds.length) return [];

    const predictions: PredictionResult[] = [];
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    // 策略 1: 基于频率的预测（时间衰减）
    const frequencyPreds = this.predictByFrequency(
      currentId,
      candidateIds,
      nowMs
    );
    predictions.push(...frequencyPreds);

    // 策略 2: Markov 链预测（基于最近 2-3 次切换）
    const markovPreds = this.predictByMarkov(currentId, candidateIds, topK);
    predictions.push(...markovPreds);

    // 去重并合并得分
    const merged = this.mergeAndDeduplicate(predictions);

    // 排序并返回 Top-K
    return merged.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * 基于全局转移频率的预测（带时间衰减）
   */
  private predictByFrequency(
    from: string,
    candidates: string[],
    nowMs: number
  ): PredictionResult[] {
    const results: PredictionResult[] = [];
    const candidateSet = new Set(candidates);

    // 遍历历史，计算时间衰减的转移分数
    const scores = new Map<string, number>();
    for (const transition of this.transitionHistory) {
      if (transition.from !== from) continue;
      if (!candidateSet.has(transition.to)) continue;

      // 计算时间衰减因子: weight = 0.5 ^ (elapsed / halfLife)
      const elapsedMs = nowMs - transition.timestamp;
      const decayFactor = Math.pow(
        0.5,
        elapsedMs / this.TIME_DECAY_HALF_LIFE_MS
      );

      const currentScore = scores.get(transition.to) || 0;
      scores.set(transition.to, currentScore + decayFactor);
    }

    // 归一化并生成结果
    const maxScore = Math.max(...Array.from(scores.values()), 1e-6);
    for (const [to, score] of scores.entries()) {
      if (score > 0.01) {
        // 过滤掉极低分数
        results.push({
          presetId: to,
          score: score / maxScore, // 归一化到 0-1
          reason: "frequency",
        });
      }
    }

    return results;
  }

  /**
   * 基于 Markov 链的预测（匹配最近 N 次切换的模式）
   */
  private predictByMarkov(
    currentId: string,
    candidates: string[],
    topK: number
  ): PredictionResult[] {
    const results: PredictionResult[] = [];
    const candidateSet = new Set(candidates);

    // 获取最近 2-3 次切换的模式
    const recentPattern = this.getRecentPattern(currentId, 2);
    if (!recentPattern.length) return results;

    // 在历史中查找相同模式后的转移
    const nextCounts = new Map<string, number>();
    for (
      let i = 0;
      i < this.transitionHistory.length - recentPattern.length;
      i++
    ) {
      // 检查是否匹配模式
      let match = true;
      for (let j = 0; j < recentPattern.length; j++) {
        if (this.transitionHistory[i + j]?.to !== recentPattern[j]) {
          match = false;
          break;
        }
      }

      if (match) {
        const next = this.transitionHistory[i + recentPattern.length]?.to;
        if (next && candidateSet.has(next)) {
          nextCounts.set(next, (nextCounts.get(next) || 0) + 1);
        }
      }
    }

    // 归一化并生成结果
    const maxCount = Math.max(...Array.from(nextCounts.values()), 1);
    for (const [to, count] of nextCounts.entries()) {
      results.push({
        presetId: to,
        score: count / maxCount,
        reason: "markov",
      });
    }

    return results.slice(0, topK);
  }

  /**
   * 获取最近 N 次切换的模式（包括当前 preset）
   */
  private getRecentPattern(currentId: string, depth: number): string[] {
    const pattern: string[] = [];

    // 从后往前查找，最多 depth 次
    for (
      let i = this.transitionHistory.length - 1;
      i >= 0 && pattern.length < depth;
      i--
    ) {
      if (this.transitionHistory[i]?.to) {
        pattern.unshift(this.transitionHistory[i].to);
      }
    }

    // 确保当前 ID 在末尾
    if (pattern[pattern.length - 1] !== currentId) {
      pattern.push(currentId);
    }

    return pattern.slice(-depth);
  }

  /**
   * 合并并去重预测结果（相同 preset 取最高分）
   */
  private mergeAndDeduplicate(
    predictions: PredictionResult[]
  ): PredictionResult[] {
    const merged = new Map<string, PredictionResult>();

    for (const pred of predictions) {
      const existing = merged.get(pred.presetId);
      if (!existing || pred.score > existing.score) {
        merged.set(pred.presetId, pred);
      }
    }

    return Array.from(merged.values());
  }

  /**
   * 更新转移计数（用于统计）
   */
  private updateTransitionCount(from: string, to: string): void {
    if (!this.transitionCounts.has(from)) {
      this.transitionCounts.set(from, new Map());
    }
    const toMap = this.transitionCounts.get(from)!;
    toMap.set(to, (toMap.get(to) || 0) + 1);
  }

  /**
   * 获取统计信息（用于调试和验证）
   */
  getStats() {
    return {
      historySize: this.transitionHistory.length,
      uniqueTransitions: this.transitionCounts.size,
      totalTransitions: this.transitionHistory.length,
      oldestTimestamp: this.transitionHistory[0]?.timestamp ?? 0,
      newestTimestamp:
        this.transitionHistory[this.transitionHistory.length - 1]?.timestamp ??
        0,
    };
  }

  /**
   * 清空历史（用于测试或重置）
   */
  reset(): void {
    this.transitionHistory.length = 0;
    this.transitionCounts.clear();
  }

  /**
   * 导出历史数据（用于持久化）
   */
  exportHistory(): PresetTransition[] {
    return [...this.transitionHistory];
  }

  /**
   * 导入历史数据（用于恢复）
   */
  importHistory(history: PresetTransition[]): void {
    this.reset();
    for (const transition of history) {
      if (transition.from && transition.to) {
        this.transitionHistory.push(transition);
        this.updateTransitionCount(transition.from, transition.to);
      }
    }
    // 维护窗口大小
    if (this.transitionHistory.length > this.MAX_HISTORY) {
      this.transitionHistory = this.transitionHistory.slice(-this.MAX_HISTORY);
    }
  }
}

/**
 * 创建全局单例（在 bootstrap 中使用）
 */
export const createPresetPredictor = (): PresetPredictor => {
  return new PresetPredictor();
};
