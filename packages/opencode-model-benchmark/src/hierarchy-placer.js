/**
 * HierarchyPlacer - Determines model placement in hierarchy based on performance
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HIERARCHY_LEVELS = ['premium', 'standard', 'economy', 'fallback'];

export class HierarchyPlacer {
  constructor(options = {}) {
    this.configPath = options.configPath || join(__dirname, '..', 'config', 'hierarchy-rules.json');
    this.rules = options.rules || this.loadRules();
  }

  loadRules() {
    // Default placement rules
    return {
      premium: {
        minBenchmarkScore: 0.8,
        maxLatency: 1000,
        minReliability: 0.99,
        description: 'High-complexity, high-stakes tasks'
      },
      standard: {
        minBenchmarkScore: 0.6,
        maxLatency: 3000,
        minReliability: 0.95,
        description: 'General purpose tasks'
      },
      economy: {
        minBenchmarkScore: 0.4,
        maxLatency: 5000,
        minReliability: 0.90,
        description: 'Simple tasks, cost-sensitive'
      },
      fallback: {
        minBenchmarkScore: 0,
        maxLatency: Infinity,
        minReliability: 0.80,
        description: 'Last resort, guaranteed availability'
      }
    };
  }

  /**
   * Determine hierarchy level for a model based on performance data
   */
  determineLevel(modelId, performanceData) {
    const {
      benchmarkScore = 0,
      latency = 0,
      reliability = 0,
      cost = 0
    } = performanceData;

    // Check each level from top to bottom
    for (const level of HIERARCHY_LEVELS) {
      const rules = this.rules[level];
      
      if (this.meetsRequirements(benchmarkScore, latency, reliability, rules)) {
        return {
          level,
          confidence: this.calculateConfidence(performanceData, rules),
          reason: this.getReason(performanceData, rules)
        };
      }
    }

    // Default to fallback if nothing matches
    return {
      level: 'fallback',
      confidence: 0.5,
      reason: 'Did not meet requirements for higher tiers'
    };
  }

  meetsRequirements(benchmarkScore, latency, reliability, rules) {
    return (
      benchmarkScore >= rules.minBenchmarkScore &&
      latency <= rules.maxLatency &&
      reliability >= rules.minReliability
    );
  }

  calculateConfidence(data, rules) {
    let confidence = 0.5;

    // Increase confidence based on how well model exceeds requirements
    if (data.benchmarkScore > rules.minBenchmarkScore) {
      confidence += 0.2;
    }
    if (data.latency < rules.maxLatency * 0.5) {
      confidence += 0.15;
    }
    if (data.reliability > rules.minReliability + 0.02) {
      confidence += 0.15;
    }

    return Math.min(confidence, 1);
  }

  getReason(data, rules) {
    const reasons = [];
    
    if (data.benchmarkScore >= rules.minBenchmarkScore) {
      reasons.push(`Benchmark: ${(data.benchmarkScore * 100).toFixed(0)}%`);
    }
    if (data.latency <= rules.maxLatency) {
      reasons.push(`Latency: ${data.latency}ms`);
    }
    if (data.reliability >= rules.minReliability) {
      reasons.push(`Reliability: ${(data.reliability * 100).toFixed(1)}%`);
    }

    return reasons.join(', ') || 'Default placement';
  }

  /**
   * Batch determine levels for multiple models
   */
  determineLevels(modelPerformanceMap) {
    const results = {};
    
    for (const [modelId, performance] of Object.entries(modelPerformanceMap)) {
      results[modelId] = this.determineLevel(modelId, performance);
    }

    return results;
  }

  /**
   * Get models at a specific level
   */
  getModelsAtLevel(hierarchy, level) {
    return Object.entries(hierarchy)
      .filter(([, data]) => data.level === level)
      .map(([modelId]) => modelId);
  }

  /**
   * Suggest promotion/demotion based on recent performance
   */
  suggestChanges(currentHierarchy, recentPerformance) {
    const suggestions = [];

    for (const [modelId, recent] of Object.entries(recentPerformance)) {
      const current = currentHierarchy[modelId];
      if (!current) continue;

      const currentIndex = HIERARCHY_LEVELS.indexOf(current.level);
      const newLevel = this.determineLevel(modelId, recent);

      if (newLevel.level !== current.level) {
        const newIndex = HIERARCHY_LEVELS.indexOf(newLevel.level);
        
        suggestions.push({
          modelId,
          currentLevel: current.level,
          suggestedLevel: newLevel.level,
          direction: newIndex < currentIndex ? 'promote' : 'demote',
          confidence: newLevel.confidence,
          reason: newLevel.reason
        });
      }
    }

    return suggestions;
  }
}

export default HierarchyPlacer;
export { HIERARCHY_LEVELS };
