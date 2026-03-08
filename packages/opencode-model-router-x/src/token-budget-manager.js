'use strict';

let Governor;
try { ({ Governor } = require('@jackoatmon/opencode-context-governor')); } catch (e) {
  try { ({ Governor } = require('../../opencode-context-governor/src/index.js')); } catch (e2) {
    Governor = null;
  }
}

class TokenBudgetManager {
  constructor(options = {}) {
    this.governor = options.governor || (Governor ? new Governor() : null);
    this.minExplorationTokens = Number(options.minExplorationTokens) || 1000;
  }

  shouldExplore({ sessionId, modelId, availableTokens, explorationRatio }) {
    if (!Number.isFinite(availableTokens)) return true;
    const ratio = Number.isFinite(explorationRatio) ? explorationRatio : 0.1;
    const explorationBudget = availableTokens * ratio;
    if (explorationBudget < this.minExplorationTokens) return false;

    if (sessionId && modelId) {
      const check = this.governor.checkBudget(sessionId, modelId, Math.ceil(explorationBudget));
      return check.allowed;
    }

    return true;
  }

  recordUsage(sessionId, modelId, tokensUsed) {
    if (!sessionId || !modelId || !Number.isFinite(tokensUsed)) return null;
    return this.governor.consumeTokens(sessionId, modelId, Math.ceil(tokensUsed));
  }
}

module.exports = TokenBudgetManager;
