/**
 * ModelComparator - Compares models across multiple dimensions
 */

export class ModelComparator {
  constructor(options = {}) {
    this.weights = options.weights || {
      benchmark: 0.4,
      cost: 0.2,
      latency: 0.2,
      reliability: 0.2
    };
  }

  /**
   * Compare two models and return scores
   */
  compare(modelA, modelB, data) {
    const scores = {
      modelA: 0,
      modelB: 0,
      breakdown: {}
    };

    // Benchmark comparison
    if (data.benchmarks) {
      const benchmarkScore = this.compareBenchmarks(
        data.benchmarks[modelA], 
        data.benchmarks[modelB]
      );
      scores.breakdown.benchmark = benchmarkScore;
      scores.modelA += benchmarkScore.modelA * this.weights.benchmark;
      scores.modelB += benchmarkScore.modelB * this.weights.benchmark;
    }

    // Cost comparison (lower is better)
    if (data.cost) {
      const costScore = this.compareCost(data.cost[modelA], data.cost[modelB]);
      scores.breakdown.cost = costScore;
      scores.modelA += costScore.modelA * this.weights.cost;
      scores.modelB += costScore.modelB * this.weights.cost;
    }

    // Latency comparison (lower is better)
    if (data.latency) {
      const latencyScore = this.compareLatency(
        data.latency[modelA], 
        data.latency[modelB]
      );
      scores.breakdown.latency = latencyScore;
      scores.modelA += latencyScore.modelA * this.weights.latency;
      scores.modelB += latencyScore.modelB * this.weights.latency;
    }

    // Reliability comparison
    if (data.reliability) {
      const reliabilityScore = this.compareReliability(
        data.reliability[modelA],
        data.reliability[modelB]
      );
      scores.breakdown.reliability = reliabilityScore;
      scores.modelA += reliabilityScore.modelA * this.weights.reliability;
      scores.modelB += reliabilityScore.modelB * this.weights.reliability;
    }

    scores.winner = scores.modelA > scores.modelB ? modelA : 
                    scores.modelB > scores.modelA ? modelB : 'tie';

    return scores;
  }

  compareBenchmarks(a, b) {
    if (!a || !b) return { modelA: 0.5, modelB: 0.5 };
    
    const aScore = (a.passAt1 || 0) + (a.passAt10 || 0) / 10;
    const bScore = (b.passAt1 || 0) + (b.passAt10 || 0) / 10;
    const total = aScore + bScore || 1;
    
    return {
      modelA: aScore / total,
      modelB: bScore / total
    };
  }

  compareCost(costA, costB) {
    const lower = Math.min(costA || Infinity, costB || Infinity);
    return {
      modelA: costA === lower ? 1 : 0.5,
      modelB: costB === lower ? 1 : 0.5
    };
  }

  compareLatency(latA, latB) {
    const lower = Math.min(latA || Infinity, latB || Infinity);
    return {
      modelA: latA === lower ? 1 : 0.5,
      modelB: latB === lower ? 1 : 0.5
    };
  }

  compareReliability(relA, relB) {
    return {
      modelA: relA || 0.5,
      modelB: relB || 0.5
    };
  }

  /**
   * Rank multiple models
   */
  rank(models, data) {
    const rankings = models.map(model => ({
      modelId: model,
      score: 0,
      breakdown: {}
    }));

    // Calculate overall scores
    for (const ranking of rankings) {
      if (data.benchmarks?.[ranking.modelId]) {
        const score = this.compareBenchmarks(
          data.benchmarks[ranking.modelId],
          {}
        );
        ranking.score += score.modelA * this.weights.benchmark;
        ranking.breakdown.benchmark = score.modelA;
      }
    }

    // Sort by score
    rankings.sort((a, b) => b.score - a.score);

    return rankings;
  }
}

export default ModelComparator;
