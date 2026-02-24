// @ts-nocheck
const { describe, test, expect, mock } = require('bun:test');

const {
  DiscoveryEngine,
  PROVIDER_ORDER
} = require('../../src/discovery/discovery-engine');

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createMockAdapters(overrides = {}) {
  const adapters = {};
  const listMocks = {};

  for (const providerId of PROVIDER_ORDER) {
    const implementation = overrides[providerId]
      || (async () => [{ id: `${providerId}-model-1` }]);

    const list = mock(implementation);

    adapters[providerId] = { list };
    listMocks[providerId] = list;
  }

  return { adapters, listMocks };
}

describe('DiscoveryEngine', () => {
  test('discovers models from all 6 providers in parallel', async () => {
    const { adapters, listMocks } = createMockAdapters();
    const engine = new DiscoveryEngine(adapters);

    const discoveredEvents = [];
    engine.on('models:discovered', (payload) => {
      discoveredEvents.push(payload);
    });

    const result = await engine.discover({ traceId: 'parallel-run' });

    expect(result.errors).toHaveLength(0);
    expect(result.models).toHaveLength(PROVIDER_ORDER.length);
    expect(discoveredEvents).toHaveLength(1);

    for (const providerId of PROVIDER_ORDER) {
      expect(listMocks[providerId].mock.calls).toHaveLength(1);
      expect(listMocks[providerId].mock.calls[0][0]).toEqual({ traceId: 'parallel-run' });

      const providerModel = result.models.find((model) => model.provider === providerId);
      expect(providerModel).toBeDefined();
      expect(providerModel.id).toBe(`${providerId}-model-1`);
    }
  });

  test('continues discovery on partial failures and emits provider:failed', async () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => {
      warnings.push(String(message));
    };

    const failedProviders = ['google', 'nvidia'];

    const { adapters } = createMockAdapters({
      google: async () => {
        throw new Error('google API unavailable');
      },
      nvidia: async () => {
        throw new Error('nvidia timeout');
      }
    });

    const engine = new DiscoveryEngine(adapters);
    const providerFailures = [];
    const discoveredEvents = [];

    engine.on('provider:failed', (payload) => {
      providerFailures.push(payload);
    });

    engine.on('models:discovered', (payload) => {
      discoveredEvents.push(payload);
    });

    let result;
    try {
      result = await engine.discover();
    } finally {
      console.warn = originalWarn;
    }

    expect(result.models).toHaveLength(PROVIDER_ORDER.length - failedProviders.length);
    expect(result.errors).toHaveLength(failedProviders.length);
    expect(providerFailures).toHaveLength(failedProviders.length);
    expect(discoveredEvents).toHaveLength(1);
    expect(warnings).toHaveLength(failedProviders.length);

    const failedInResult = result.errors.map((item) => item.provider).sort();
    const failedInEvents = providerFailures.map((item) => item.provider).sort();

    expect(failedInResult).toEqual(failedProviders.sort());
    expect(failedInEvents).toEqual(failedProviders.sort());
  });

  test('returns empty model list when all providers fail', async () => {
    const originalWarn = console.warn;
    console.warn = () => {};

    const overrides = {};
    for (const providerId of PROVIDER_ORDER) {
      overrides[providerId] = async () => {
        throw new Error(`${providerId} failed`);
      };
    }

    const { adapters } = createMockAdapters(overrides);
    const engine = new DiscoveryEngine(adapters);
    const failures = [];
    engine.on('provider:failed', (payload) => {
      failures.push(payload);
    });

    let result;
    try {
      result = await engine.discover();
    } finally {
      console.warn = originalWarn;
    }

    expect(result.models).toEqual([]);
    expect(result.errors).toHaveLength(PROVIDER_ORDER.length);
    expect(failures).toHaveLength(PROVIDER_ORDER.length);
  });

  test('emits models:discovered payload for downstream consumers', async () => {
    const { adapters } = createMockAdapters();
    const engine = new DiscoveryEngine(adapters);

    const events = [];
    engine.on('models:discovered', (payload) => {
      events.push(payload);
    });

    const result = await engine.discover();

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(result);
  });

  test('completes discovery under 10 seconds', async () => {
    const callStartTimes = [];
    const overrides = {};

    for (const providerId of PROVIDER_ORDER) {
      overrides[providerId] = async () => {
        callStartTimes.push(Date.now());
        await wait(300);
        return [{ id: `${providerId}-slow-model` }];
      };
    }

    const { adapters } = createMockAdapters(overrides);
    const engine = new DiscoveryEngine(adapters);

    const startedAt = Date.now();
    const result = await engine.discover();
    const elapsedMs = Date.now() - startedAt;

    const firstCall = Math.min(...callStartTimes);
    const lastCall = Math.max(...callStartTimes);
    const startSpreadMs = lastCall - firstCall;

    expect(result.errors).toHaveLength(0);
    expect(result.models).toHaveLength(PROVIDER_ORDER.length);
    expect(elapsedMs).toBeLessThan(10000);
    expect(startSpreadMs).toBeLessThan(250);
  });
});
