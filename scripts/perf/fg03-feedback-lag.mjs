#!/usr/bin/env node

import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ModelRouter } = require('../../packages/opencode-model-router-x/src/index.js');

class MockLearningEngine extends EventEmitter {
  constructor() {
    super();
    this.mode = 'normal';
  }

  advise() {
    if (this.mode === 'penalize') {
      return {
        warnings: [{ type: 'provider-instability', severity: 'high' }],
        suggestions: [],
        shouldPause: false,
        riskScore: 0,
      };
    }
    return { warnings: [], suggestions: [], shouldPause: false, riskScore: 0 };
  }

  learnFromOutcome() {
    this.mode = 'penalize';
  }
}

function main() {
  const learningEngine = new MockLearningEngine();
  const router = new ModelRouter({
    learningEngine,
    learningAdviceCacheTTL: 300000,
  });

  const modelId = Object.keys(router.models)[0];
  if (!modelId) {
    throw new Error('No models available for feedback-lag test');
  }

  const context = { taskType: 'general', complexity: 'moderate' };

  const first = router._scoreModel(modelId, context);
  const firstHasLearningPenalty = first.reason.includes('learning:');

  router.recordLearningOutcome(modelId, {
    success: false,
    failureReason: 'timeout',
    tokensUsed: 300,
    timeTakenMs: 1500,
  });

  const second = router._scoreModel(modelId, context);
  const secondHasLearningPenalty = second.reason.includes('learning:');

  if (firstHasLearningPenalty) {
    throw new Error('Unexpected learning penalty before outcome update');
  }
  if (!secondHasLearningPenalty) {
    throw new Error('Learning penalty did not appear immediately after outcome update');
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        modelId,
        before: first,
        after: second,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
