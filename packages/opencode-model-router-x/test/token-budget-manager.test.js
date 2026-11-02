'use strict';

const { describe, test, expect } = require('bun:test');
const TokenBudgetManager = require('../src/token-budget-manager.js');

describe('TokenBudgetManager predictive budgeting', () => {
  test('blocks exploration when exploration budget is below minimum', () => {
    const manager = new TokenBudgetManager({ minExplorationTokens: 1000, governor: null });

    const result = manager.shouldExplore({
      availableTokens: 5000,
      explorationRatio: 0.1, // 500 tokens
    });

    expect(result).toBe(false);
  });

  test('uses governor budget check when session and model are provided', () => {
    const governor = {
      checkBudget: () => ({ allowed: false }),
      consumeTokens: () => ({ ok: true }),
    };
    const manager = new TokenBudgetManager({ governor, minExplorationTokens: 100 });

    const result = manager.shouldExplore({
      sessionId: 's1',
      modelId: 'm1',
      availableTokens: 5000,
      explorationRatio: 0.1,
    });

    expect(result).toBe(false);
  });

  test('predictExhaustion returns null without velocity state', () => {
    const manager = new TokenBudgetManager({ governor: null });

    const prediction = manager.predictExhaustion('s1', 'm1', 1000);
    expect(prediction).toBeNull();
  });

  test('records velocity and emits prediction log in shadow mode', () => {
    const governor = {
      checkBudget: () => ({ allowed: true }),
      consumeTokens: () => ({ ok: true }),
    };

    const manager = new TokenBudgetManager({ governor, minExplorationTokens: 100 });

    const originalNow = Date.now;
    const originalLog = console.log;
    let now = 1000;
    const logs = [];

    Date.now = () => now;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      manager.recordUsage('s1', 'm1', 100);
      now = 2000;
      manager.recordUsage('s1', 'm1', 100);

      const prediction = manager.predictExhaustion('s1', 'm1', 1000);
      expect(prediction).not.toBeNull();
      expect(prediction.msRemaining).toBeGreaterThan(0);

      manager.shouldExplore({
        sessionId: 's1',
        modelId: 'm1',
        availableTokens: 5000,
        explorationRatio: 0.1,
      });

      const hasPredictionLog = logs.some((line) => line.includes('[PREDICTION]'));
      expect(hasPredictionLog).toBe(true);
    } finally {
      Date.now = originalNow;
      console.log = originalLog;
    }
  });
});
