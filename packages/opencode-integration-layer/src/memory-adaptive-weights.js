'use strict';

/**
 * Learning Engine Adaptive Weights Integration.
 *
 * Wires the memory scoring pipeline into the learning engine's
 * adaptive hyper-parameter system:
 * - Uses hyperParamRegistry to get current decay floors/half-lives
 * - Feeds memory access outcomes back into the feedback collector
 * - Provides MemoryScoringPipeline with adaptive weights from the registry
 *
 * This module is the bridge between Wave 11 memory system and the
 * learning engine's hyper-parameter adaptation loop.
 */

const { scoreMemory, DEFAULT_HALF_LIFE_DAYS } = require('./memory-scoring.js');

/**
 * Create an adaptive scoring function that uses the learning engine's
 * hyper-parameters for memory scoring.
 *
 * @param {object} learningEngine - LearningEngine instance
 * @returns {Function} async function(query, memory, options) → {total, breakdown}
 */
function createAdaptiveScorer(learningEngine) {
  if (!learningEngine?.hyperParamRegistry) {
    // Fallback to static scoring if registry unavailable
    return async (query, memory, options = {}) => {
      return scoreMemory(memory, { query, ...options });
    };
  }

  return async (query, memory, options = {}) => {
    const registry = learningEngine.hyperParamRegistry;
    const taskType = options.taskType || 'general';
    const normalizedKey = _normalizeTaskTypeKey(taskType);

    // Get adaptive hyper-parameters
    const halfLifeDays = _getRegistryValue(
      registry,
      `decay_half_life_days_${normalizedKey}`,
      DEFAULT_HALF_LIFE_DAYS,
    );

    const decayFloor = _getRegistryValue(
      registry,
      `decay_floor_${normalizedKey}`,
      0.1,
    );

    // Score with adaptive parameters
    const result = await scoreMemory(memory, {
      query,
      halfLifeDays,
      ...options,
    });

    // Attach hyper-parameter metadata to breakdown
    result.breakdown._hyperParams = {
      taskType,
      halfLifeDays,
      decayFloor,
      source: 'adaptive',
    };

    return result;
  };
}

/**
 * Record memory access outcome for learning engine feedback.
 *
 * @param {object} learningEngine - LearningEngine instance
 * @param {object} outcome - { memoryId, accessed, useful, query, taskType }
 */
function recordMemoryOutcome(learningEngine, outcome) {
  if (!learningEngine?.feedbackCollector) {
    return;
  }

  try {
    learningEngine.feedbackCollector.record({
      event_type: 'memory_access',
      task_type: outcome.taskType || 'general',
      outcome: outcome.useful ? 'positive' : 'negative',
      metadata: {
        memory_id: outcome.memoryId,
        query: outcome.query,
        accessed: outcome.accessed,
      },
    });
  } catch (err) {
    // Fail-open: feedback recording should not break memory operations
    console.warn(`[AdaptiveWeights] feedback record failed: ${err.message}`);
  }
}

/**
 * Get adaptive weight for a specific memory type.
 *
 * @param {object} registry - hyperParamRegistry
 * @param {string} memoryType - memory type (fact, pattern, decision, etc.)
 * @param {number} defaultWeight - fallback weight
 * @returns {number} adaptive weight
 */
function getAdaptiveTypeWeight(registry, memoryType, defaultWeight = 0.8) {
  if (!registry) return defaultWeight;

  const paramName = `memory_type_weight_${memoryType}`;
  return _getRegistryValue(registry, paramName, defaultWeight);
}

/**
 * Get current hyper-parameter values from registry.
 *
 * @param {object} registry - hyperParamRegistry
 * @param {string} name - parameter name
 * @param {number} fallback - fallback value
 * @returns {number} current value
 */
function _getRegistryValue(registry, name, fallback) {
  try {
    if (typeof registry.get !== 'function') return fallback;
    const param = registry.get(name);
    if (param && typeof param.current_value === 'number') {
      return param.current_value;
    }
  } catch {
    // Fail-open
  }
  return fallback;
}

function _normalizeTaskTypeKey(taskType) {
  if (typeof taskType !== 'string' || taskType.trim() === '') return 'general';
  let key = taskType
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (!key) key = 'general';
  if (!/^[a-z]/.test(key)) key = `t_${key}`;
  key = key.replace(/[^a-z0-9_]/g, '_');
  if (!/^[a-z][a-z0-9_]*$/.test(key)) return 'general';
  return key;
}

module.exports = {
  createAdaptiveScorer,
  recordMemoryOutcome,
  getAdaptiveTypeWeight,
};