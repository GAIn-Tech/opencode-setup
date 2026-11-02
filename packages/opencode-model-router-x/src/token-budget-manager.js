'use strict';

// === TOKEN BUDGET CONSTANTS ===
const BUDGET_CONSTANTS = Object.freeze({
  exploration: {
    defaultRatio: 0.1,         // 10% of available tokens for exploration
  },
  tokens: {
    minExplorationTokens: 1000,  // Minimum tokens required to allow exploration
  },
});

let Governor;
try { ({ Governor } = require('@jackoatmon/opencode-context-governor')); } catch (e) {
  try { ({ Governor } = require('../../opencode-context-governor/src/index.js')); } catch (e2) {
    Governor = null;
  }
}

class TokenBudgetManager {
  constructor(options = {}) {
    this.governor = options.governor || (Governor ? new Governor() : null);
    this.minExplorationTokens = Number(options.minExplorationTokens) || BUDGET_CONSTANTS.tokens.minExplorationTokens;

    // Predictive state keyed by "sessionId:modelId"
    // { lastTimestamp: number, totalConsumed: number, velocity: number(tokens/ms) }
    this.velocityMap = new Map();
  }

  /**
   * Predict exhaustion time based on usage velocity.
   * Shadow mode: emit prediction log; does not alter behavior.
   */
  predictExhaustion(sessionId, modelId, availableTokens) {
    if (!sessionId || !modelId || !Number.isFinite(availableTokens)) return null;

    const key = `${sessionId}:${modelId}`;
    const state = this.velocityMap.get(key);
    if (!state || state.velocity <= 0) return null;

    const msToExhaustion = availableTokens / state.velocity;
    const predictionTime = new Date(Date.now() + msToExhaustion).toISOString();

    return {
      projectedTime: predictionTime,
      msRemaining: msToExhaustion,
      velocity: state.velocity,
    };
  }

  shouldExplore({ sessionId, modelId, availableTokens, explorationRatio }) {
    if (!Number.isFinite(availableTokens)) return true;

    const ratio = Number.isFinite(explorationRatio) ? explorationRatio : BUDGET_CONSTANTS.exploration.defaultRatio;
    const explorationBudget = availableTokens * ratio;
    if (explorationBudget < this.minExplorationTokens) return false;

    if (sessionId && modelId) {
      // Shadow-mode prediction only; no behavioral effect.
      this.predictExhaustion(sessionId, modelId, availableTokens);

      if (!this.governor) return true;
      const check = this.governor.checkBudget(sessionId, modelId, Math.ceil(explorationBudget));
      return check.allowed;
    }

    return true;
  }

  recordUsage(sessionId, modelId, tokensUsed) {
    const now = Date.now();
    // Evict stale entries (older than 10 minutes)
    for (const [key, state] of this.velocityMap) {
      if (now - state.lastTimestamp > 10 * 60 * 1000) {
        this.velocityMap.delete(key);
      }
    }

    if (!sessionId || !modelId || !Number.isFinite(tokensUsed)) return null;

    const key = `${sessionId}:${modelId}`;
    const state = this.velocityMap.get(key) || {
      lastTimestamp: now,
      totalConsumed: 0,
      velocity: 0,
    };

    const timeDelta = now - state.lastTimestamp;
    if (timeDelta > 0) {
      const currentVelocity = tokensUsed / timeDelta;
      // simple smoothing to reduce spikes
      state.velocity = state.velocity === 0
        ? currentVelocity
        : (state.velocity * 0.8) + (currentVelocity * 0.2);
    }

    state.lastTimestamp = now;
    state.totalConsumed += tokensUsed;
    this.velocityMap.set(key, state);

    if (!this.governor) return null;
    return this.governor.consumeTokens(sessionId, modelId, Math.ceil(tokensUsed));
  }
}

module.exports = TokenBudgetManager;
