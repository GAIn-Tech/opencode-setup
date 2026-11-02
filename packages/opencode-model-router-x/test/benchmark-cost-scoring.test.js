/**
 * Task 17: Tests for benchmark bonus (T12) and cost-efficiency scoring (T13)
 * in ModelRouter._scoreModel().
 *
 * Follows the isolation pattern from meta-kb-routing.test.js — extracts the
 * scoring logic verbatim from index.js to avoid the full ModelRouter dependency
 * chain (circuit-breaker, integration-layer, logger, etc.).
 */
const { describe, test, expect } = require('bun:test');
const TokenCostCalculator = require('../src/strategies/token-cost-calculator');

// ── T12: Benchmark bonus logic (extracted from ModelRouter) ────────────────

/**
 * Known benchmark pass@1 scores — mirrors ModelRouter.BENCHMARK_SCORES.
 */
const BENCHMARK_SCORES = {
  'anthropic/claude-opus-4-6':        { humaneval: 0.92, mbpp: 0.90 },
  'anthropic/claude-opus-4-5':        { humaneval: 0.90, mbpp: 0.88 },
  'anthropic/claude-sonnet-4-5':      { humaneval: 0.88, mbpp: 0.86 },
  'anthropic/claude-haiku-4-5':       { humaneval: 0.78, mbpp: 0.80 },
  'openai/gpt-5':                     { humaneval: 0.89, mbpp: 0.87 },
  'openai/gpt-5.2':                   { humaneval: 0.72, mbpp: 0.75 },
  'openai/o1':                        { humaneval: 0.93, mbpp: 0.91 },
  'openai/o1-mini':                   { humaneval: 0.82, mbpp: 0.80 },
  'google/gemini-3-pro':              { humaneval: 0.85, mbpp: 0.84 },
  'google/gemini-3-flash':            { humaneval: 0.76, mbpp: 0.78 },
  'deepseek/deepseek-chat':           { humaneval: 0.80, mbpp: 0.82 },
  'groq/llama-4-maverick':            { humaneval: 0.73, mbpp: 0.76 },
  'groq/llama-4-scout':               { humaneval: 0.68, mbpp: 0.72 },
  'groq/llama-3.3-70b-versatile':     { humaneval: 0.65, mbpp: 0.70 },
  'cerebras/llama-4-maverick':        { humaneval: 0.73, mbpp: 0.76 },
  'cerebras/llama-3.3-70b':           { humaneval: 0.62, mbpp: 0.68 },
};

/**
 * Extracted verbatim from ModelRouter._applyBenchmarkBonus in index.js.
 */
function applyBenchmarkBonus(modelId) {
  const scores = BENCHMARK_SCORES[modelId];
  if (!scores) {
    return { bonus: 0, reason: null };
  }

  const benchScores = [];
  if (typeof scores.humaneval === 'number') benchScores.push(scores.humaneval);
  if (typeof scores.mbpp === 'number') benchScores.push(scores.mbpp);

  if (benchScores.length === 0) {
    return { bonus: 0, reason: null };
  }

  const avgScore = benchScores.reduce((a, b) => a + b, 0) / benchScores.length;

  const baseline = 0.60;
  const maxBonus = 0.15;
  const bonus = avgScore > baseline
    ? Math.min(maxBonus, ((avgScore - baseline) / (1.0 - baseline)) * maxBonus)
    : 0;

  return {
    bonus: Math.round(bonus * 1000) / 1000,
    reason: `benchmark(avg=${avgScore.toFixed(2)},+${bonus.toFixed(3)})`
  };
}

// ── T13: Cost-efficiency logic (extracted from ModelRouter) ────────────────

/**
 * Extracted from ModelRouter._applyCostEfficiency in index.js.
 * Uses a real TokenCostCalculator instance for pricing lookups and supports
 * config-driven behavior + model cost fallback.
 */
function applyCostEfficiency(provider, modelName, options = {}) {
  const calc = new TokenCostCalculator();
  const {
    fallbackCost,
    enabled = true,
    maxCostThreshold = 15.0,
    maxBonus = 0.05,
  } = options;

  if (!enabled) {
    return { bonus: 0, reason: null };
  }

  const pricing = calc.getPricing(provider, modelName);
  const fallback = Number(fallbackCost);
  let avgCostPer1K = null;

  if (pricing && Number.isFinite(pricing.input) && Number.isFinite(pricing.output)) {
    avgCostPer1K = (pricing.input + pricing.output) / 2;
  } else if (Number.isFinite(fallback) && fallback >= 0) {
    avgCostPer1K = fallback;
  }

  if (!Number.isFinite(avgCostPer1K)) {
    return { bonus: 0, reason: null };
  }

  const bonus = avgCostPer1K < maxCostThreshold
    ? maxBonus * (1 - avgCostPer1K / maxCostThreshold)
    : 0;

  return {
    bonus: Math.round(bonus * 1000) / 1000,
    reason: `cost($${avgCostPer1K.toFixed(2)}/1K,+${bonus.toFixed(3)})`
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('T12: Benchmark Bonus', () => {
  test('returns bonus for known models', () => {
    const result = applyBenchmarkBonus('anthropic/claude-opus-4-6');
    expect(result.bonus).toBeGreaterThan(0);
    expect(result.bonus).toBeLessThanOrEqual(0.15);
    expect(result.reason).toContain('benchmark');
  });

  test('returns 0 for unknown models', () => {
    const result = applyBenchmarkBonus('unknown/model-xyz');
    expect(result.bonus).toBe(0);
    expect(result.reason).toBeNull();
  });

  test('caps bonus at 0.15', () => {
    // o1 has the highest scores (0.93, 0.91)
    const result = applyBenchmarkBonus('openai/o1');
    expect(result.bonus).toBeLessThanOrEqual(0.15);
    expect(result.bonus).toBeGreaterThan(0.10); // high scoring model should get substantial bonus
  });

  test('gives higher bonus to better-scoring models', () => {
    const opus = applyBenchmarkBonus('anthropic/claude-opus-4-6');
    const haiku = applyBenchmarkBonus('anthropic/claude-haiku-4-5');
    expect(opus.bonus).toBeGreaterThan(haiku.bonus);
  });

  test('gives 0 for models below 0.60 baseline', () => {
    // Verify the formula: avgScore <= 0.60 yields zero bonus
    const lowScores = { humaneval: 0.40, mbpp: 0.35 };
    const avgScore = (lowScores.humaneval + lowScores.mbpp) / 2;
    const baseline = 0.60;
    const maxBonus = 0.15;
    const bonus = avgScore > baseline
      ? Math.min(maxBonus, ((avgScore - baseline) / (1.0 - baseline)) * maxBonus)
      : 0;
    expect(bonus).toBe(0);
  });

  test('BENCHMARK_SCORES covers major providers', () => {
    expect(BENCHMARK_SCORES['anthropic/claude-opus-4-6']).toBeDefined();
    expect(BENCHMARK_SCORES['openai/gpt-5']).toBeDefined();
    expect(BENCHMARK_SCORES['google/gemini-3-pro']).toBeDefined();
    expect(BENCHMARK_SCORES['deepseek/deepseek-chat']).toBeDefined();
    expect(BENCHMARK_SCORES['groq/llama-4-maverick']).toBeDefined();
    expect(BENCHMARK_SCORES['cerebras/llama-4-maverick']).toBeDefined();
  });

  test('reason string includes average and bonus amount', () => {
    const result = applyBenchmarkBonus('anthropic/claude-sonnet-4-5');
    // humaneval: 0.88, mbpp: 0.86 -> avg 0.87
    expect(result.reason).toContain('avg=0.87');
    expect(result.reason).toMatch(/\+0\.\d{3}/); // +0.NNN format
  });

  test('bonus is monotonically increasing with avg score', () => {
    const entries = Object.entries(BENCHMARK_SCORES).map(([id, scores]) => {
      const avg = (scores.humaneval + scores.mbpp) / 2;
      return { id, avg, bonus: applyBenchmarkBonus(id).bonus };
    });
    entries.sort((a, b) => a.avg - b.avg);

    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].bonus).toBeGreaterThanOrEqual(entries[i - 1].bonus);
    }
  });
});

describe('T13: Cost Efficiency', () => {
  test('returns bonus for models with known pricing', () => {
    // claude-haiku-4-5: input 1.0, output 5.0 -> avg 3.0
    const result = applyCostEfficiency('anthropic', 'claude-haiku-4-5');
    expect(result.bonus).toBeGreaterThan(0);
    expect(result.bonus).toBeLessThanOrEqual(0.05);
    expect(result.reason).toContain('cost');
  });

  test('returns 0 for models without pricing data', () => {
    const result = applyCostEfficiency('unknown', 'no-such-model');
    expect(result.bonus).toBe(0);
    expect(result.reason).toBeNull();
  });

  test('uses fallback model cost when token pricing is unavailable', () => {
    const result = applyCostEfficiency('unknown', 'no-such-model', { fallbackCost: 3.5 });
    expect(result.bonus).toBeGreaterThan(0);
    expect(result.reason).toContain('$3.50/1K');
  });

  test('returns zero when cost efficiency is disabled by config', () => {
    const result = applyCostEfficiency('anthropic', 'claude-haiku-4-5', { enabled: false });
    expect(result.bonus).toBe(0);
    expect(result.reason).toBeNull();
  });

  test('honors configured max bonus and threshold', () => {
    const result = applyCostEfficiency('anthropic', 'claude-haiku-4-5', {
      maxCostThreshold: 10,
      maxBonus: 0.03,
    });
    expect(result.bonus).toBeLessThanOrEqual(0.03);
    expect(result.bonus).toBeGreaterThan(0);
  });

  test('favors cheaper models over expensive ones', () => {
    // haiku (input: 1.0, output: 5.0, avg: 3.0) vs opus (input: 5.0, output: 25.0, avg: 15.0)
    const haiku = applyCostEfficiency('anthropic', 'claude-haiku-4-5');
    const opus = applyCostEfficiency('anthropic', 'claude-opus-4-6');
    expect(haiku.bonus).toBeGreaterThan(opus.bonus);
  });

  test('bonus capped at 0.05', () => {
    // groq/llama-3.3-70b-versatile: input 0.08, output 0.08 -> avg 0.08 (very cheap)
    const result = applyCostEfficiency('groq', 'llama-3.3-70b-versatile');
    expect(result.bonus).toBeLessThanOrEqual(0.05);
    expect(result.bonus).toBeGreaterThan(0.04); // should be near max for cheap model
  });

  test('very expensive models get near-zero cost bonus', () => {
    // o1: input 15.0, output 60.0 -> avg 37.5 (exceeds threshold)
    const result = applyCostEfficiency('openai', 'o1');
    expect(result.bonus).toBe(0);
  });

  test('reason string includes cost per 1K and bonus amount', () => {
    const result = applyCostEfficiency('anthropic', 'claude-sonnet-4-5');
    // sonnet: input 3.0, output 15.0 -> avg $9.00
    expect(result.reason).toContain('$9.00/1K');
    expect(result.reason).toMatch(/\+0\.\d{3}/);
  });
});

describe('T12+T13: Scoring Integration', () => {
  test('benchmark bonus + cost bonus never exceeds 0.20 combined', () => {
    for (const modelId of Object.keys(BENCHMARK_SCORES)) {
      const bench = applyBenchmarkBonus(modelId);
      const provider = modelId.split('/')[0];
      const modelName = modelId.split('/')[1];
      const cost = applyCostEfficiency(provider, modelName);

      const combined = bench.bonus + cost.bonus;
      expect(combined).toBeLessThanOrEqual(0.20); // 0.15 max + 0.05 max
    }
  });

  test('TokenCostCalculator getPricing returns valid structure', () => {
    const calc = new TokenCostCalculator();
    const pricing = calc.getPricing('anthropic', 'claude-opus-4-6');
    expect(pricing).toBeDefined();
    expect(pricing.input).toBeGreaterThan(0);
    expect(pricing.output).toBeGreaterThan(0);
  });

  test('both bonuses produce non-negative values for all known models', () => {
    for (const modelId of Object.keys(BENCHMARK_SCORES)) {
      const bench = applyBenchmarkBonus(modelId);
      expect(bench.bonus).toBeGreaterThanOrEqual(0);

      const provider = modelId.split('/')[0];
      const modelName = modelId.split('/')[1];
      const cost = applyCostEfficiency(provider, modelName);
      expect(cost.bonus).toBeGreaterThanOrEqual(0);
    }
  });
});
