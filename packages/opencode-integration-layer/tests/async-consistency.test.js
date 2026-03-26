const { describe, it, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index.js');

describe('IntegrationLayer async consistency', () => {
  it('awaits async advisor results before building adaptive options', async () => {
    const integration = new IntegrationLayer({
      advisor: {
        advise: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { risk_score: 75, quota_risk: 0.1, routing: { skills: [] } };
        },
      },
    });

    const result = await integration.executeTaskWithEvidence(
      { task: 'test-task', task_type: 'debug' },
      async (_taskContext, _skills, adaptiveOptions) => ({
        success: true,
        retriesUsed: adaptiveOptions.retries,
      })
    );

    expect(result.retriesUsed).toBe(1);
  });

  it('handles async exploration feedback rejections without unhandled promises', async () => {
    const unhandled = [];
    const onUnhandled = (reason) => {
      unhandled.push(reason);
    };

    process.on('unhandledRejection', onUnhandled);

    const integration = new IntegrationLayer({
      explorationAdapter: {
        updateFromExploration: async () => {
          await Promise.resolve();
          throw new Error('exploration failed');
        },
      },
    });

    await integration.executeTaskWithEvidence(
      { task: 'explore-task', task_type: 'debug' },
      async () => ({ success: true })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    process.removeListener('unhandledRejection', onUnhandled);

    expect(unhandled.length).toBe(0);
  });
});
