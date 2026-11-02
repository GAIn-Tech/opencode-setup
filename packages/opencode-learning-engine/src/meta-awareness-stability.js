'use strict';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function boundedDelta(delta, maxUpdateDelta = 5) {
  const cap = Math.abs(Number(maxUpdateDelta) || 5);
  return clamp(delta, -cap, cap);
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const m = mean(values);
  const variance = mean(values.map((value) => (value - m) ** 2));
  return Math.sqrt(variance);
}

function detectAnomaly({ value, history = [], zThreshold = 3 }) {
  if (!Array.isArray(history) || history.length < 5) {
    return { isAnomaly: false, zScore: 0 };
  }
  const m = mean(history);
  const sd = stdDev(history);
  if (sd <= 0) return { isAnomaly: false, zScore: 0 };
  const z = (value - m) / sd;
  return {
    isAnomaly: Math.abs(z) >= zThreshold,
    zScore: z,
  };
}

function selectiveReassessmentWeight({ eventTaskType, baselineTaskType, eventComplexity, baselineComplexity }) {
  const taskDrift = eventTaskType && baselineTaskType && eventTaskType !== baselineTaskType;
  const complexityDrift = eventComplexity && baselineComplexity && eventComplexity !== baselineComplexity;
  if (taskDrift && complexityDrift) return 0.75;
  if (taskDrift || complexityDrift) return 0.9;
  return 1.0;
}

module.exports = {
  boundedDelta,
  clamp,
  detectAnomaly,
  mean,
  stdDev,
  selectiveReassessmentWeight,
};
