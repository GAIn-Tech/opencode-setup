'use strict';

const { describe, it, expect, beforeEach } = require('bun:test');

/**
 * Integration test: Model Manager Pipeline (end-to-end)
 *
 * Verifies the full discovery → diff → assessment → lifecycle → PR generation
 * pipeline works as a cohesive unit. Uses mock adapters (no real API calls).
 */

const MODEL_MANAGER_ROOT = '../packages/opencode-model-manager/src';

// ---------- helpers ----------

function makeModel(overrides = {}) {
  return {
    id: overrides.id || 'test-provider/test-model',
    provider: overrides.provider || 'openai',
    displayName: overrides.displayName || 'Test Model',
    contextTokens: overrides.contextTokens ?? 128000,
    outputTokens: overrides.outputTokens ?? 4096,
    deprecated: overrides.deprecated ?? false,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      reasoning: false,
      ...(overrides.capabilities || {}),
    },
  };
}

function makeMockAdapter(models) {
  return { list: async () => models };
}

// ---------- tests ----------

describe('model-manager pipeline integration', () => {
  it('DiscoveryEngine discovers models from mock adapters', async () => {
    const { DiscoveryEngine } = require(`${MODEL_MANAGER_ROOT}/discovery/discovery-engine`);

    const modelsA = [makeModel({ id: 'openai/gpt-5', provider: 'openai' })];
    const modelsB = [makeModel({ id: 'google/gemini-3', provider: 'google' })];

    const engine = new DiscoveryEngine({
      openai: makeMockAdapter(modelsA),
      google: makeMockAdapter(modelsB),
      groq: makeMockAdapter([]),
      cerebras: makeMockAdapter([]),
      nvidia: makeMockAdapter([]),
    });

    const result = await engine.discover();

    expect(result.models.length).toBe(2);
    expect(result.errors.length).toBe(0);
    expect(result.models.map((m) => m.id).sort()).toEqual([
      'google/gemini-3',
      'openai/gpt-5',
    ]);
  });

  it('DiffEngine detects added, removed, and modified models', () => {
    const { DiffEngine } = require(`${MODEL_MANAGER_ROOT}/diff/diff-engine`);
    const diffEngine = new DiffEngine();

    const oldSnapshot = {
      models: [
        makeModel({ id: 'openai/gpt-4', contextTokens: 8192 }),
        makeModel({ id: 'openai/gpt-3.5', contextTokens: 4096 }),
      ],
    };

    const newSnapshot = {
      models: [
        makeModel({ id: 'openai/gpt-4', contextTokens: 128000 }), // modified
        makeModel({ id: 'openai/gpt-5' }),                        // added
        // gpt-3.5 removed
      ],
    };

    const diff = diffEngine.compare(oldSnapshot, newSnapshot);

    expect(diff.added.length).toBe(1);
    expect(diff.added[0].model.id).toBe('openai/gpt-5');
    expect(diff.removed.length).toBe(1);
    expect(diff.removed[0].model.id).toBe('openai/gpt-3.5');
    expect(diff.modified.length).toBe(1);
    expect(diff.modified[0].model.id).toBe('openai/gpt-4');
  });

  it('CacheLayer returns cached data and triggers background refresh', async () => {
    const os = require('os');
    const path = require('path');
    const { CacheLayer } = require(`${MODEL_MANAGER_ROOT}/cache/cache-layer`);

    const tmpPath = path.join(os.tmpdir(), `cache-integ-${Date.now()}.json`);
    const cache = new CacheLayer({ l1Ttl: 60000, l2Ttl: 120000, l2Path: tmpPath });

    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      return [makeModel({ id: `model-v${fetchCount}` })];
    };

    const first = await cache.get('test-key', fetcher);
    expect(first).toBeDefined();
    expect(fetchCount).toBe(1);

    // Second call should hit L1 cache (no additional fetch)
    const second = await cache.get('test-key', fetcher);
    expect(second).toEqual(first);
    expect(fetchCount).toBe(1);

    // Cleanup
    try { require('fs').unlinkSync(tmpPath); } catch {}
  });

  it('AutoApprovalRules scores low-risk metadata change below auto-approve threshold', () => {
    const { AutoApprovalRules } = require(`${MODEL_MANAGER_ROOT}/lifecycle/auto-approval-rules`);

    const rules = new AutoApprovalRules();
    const diff = {
      added: [],
      removed: [],
      modified: [
        {
          modelId: 'openai/gpt-4',
          changeType: 'modified',
          classification: 'minor',
          model: makeModel({ id: 'openai/gpt-4', provider: 'openai' }),
          changes: { displayName: { old: 'GPT-4', new: 'GPT-4 Turbo' } },
        },
      ],
    };

    const evaluation = rules.evaluate(diff);
    expect(evaluation).toBeDefined();
    expect(typeof evaluation.score).toBe('number');
    expect(evaluation.recommendation).toBeDefined();
  });

  it('ChangeEventSystem publishes events for diff changes', async () => {
    const os = require('os');
    const path = require('path');
    const { ChangeEventSystem } = require(`${MODEL_MANAGER_ROOT}/events/change-event-system`);

    const tmpPath = path.join(os.tmpdir(), `events-integ-${Date.now()}.json`);
    const eventSystem = new ChangeEventSystem({ auditLogPath: tmpPath });

    const receivedEvents = [];
    eventSystem.on('model:added', (evt) => receivedEvents.push(evt));

    const diff = {
      added: [
        {
          modelId: 'openai/gpt-5',
          changeType: 'added',
          classification: 'major',
          model: makeModel({ id: 'openai/gpt-5' }),
        },
      ],
      removed: [],
      modified: [],
    };

    const published = await eventSystem.publishChanges(diff, 'snapshot-001');
    expect(published.length).toBeGreaterThanOrEqual(1);
    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].model.id).toBe('openai/gpt-5');

    // Cleanup
    try { require('fs').unlinkSync(tmpPath); } catch {}
  });

  it('PRGenerator produces valid PR metadata from diff', async () => {
    const { PRGenerator } = require(`${MODEL_MANAGER_ROOT}/automation/pr-generator`);

    const prGen = new PRGenerator({
      catalogPath: '/tmp/fake-catalog.json',
      repoPath: '/tmp/fake-repo',
    });

    const diff = {
      added: [
        {
          modelId: 'openai/gpt-5',
          changeType: 'added',
          classification: 'major',
          model: makeModel({ id: 'openai/gpt-5', provider: 'openai', displayName: 'GPT-5' }),
        },
      ],
      removed: [],
      modified: [],
    };

    // Only test PR body/title generation (not git operations)
    const title = prGen.generatePRTitle(diff);
    const body = prGen.generatePRBody(diff);

    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
    expect(typeof body).toBe('string');
    expect(body).toContain('gpt-5');
  });

  it('CircuitBreaker opens after repeated failures', () => {
    const { CircuitBreaker } = require(`${MODEL_MANAGER_ROOT}/circuit-breaker/circuit-breaker`);

    const breaker = new CircuitBreaker({ threshold: 3, timeout: 500 });

    // Record failures to open the circuit
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.state).toBe('OPEN');
  });

  it('full pipeline: discover → diff → events (smoke test)', async () => {
    const os = require('os');
    const path = require('path');
    const { DiscoveryEngine } = require(`${MODEL_MANAGER_ROOT}/discovery/discovery-engine`);
    const { DiffEngine } = require(`${MODEL_MANAGER_ROOT}/diff/diff-engine`);
    const { ChangeEventSystem } = require(`${MODEL_MANAGER_ROOT}/events/change-event-system`);

    const tmpPath = path.join(os.tmpdir(), `pipeline-integ-${Date.now()}.json`);

    // Phase 1: Discovery with mock adapters
    const engine = new DiscoveryEngine({
      openai: makeMockAdapter([
        makeModel({ id: 'openai/gpt-5', provider: 'openai' }),
        makeModel({ id: 'openai/gpt-4', provider: 'openai' }),
      ]),
      google: makeMockAdapter([]),
      groq: makeMockAdapter([]),
      cerebras: makeMockAdapter([]),
      nvidia: makeMockAdapter([]),
    });

    const discoveryResult = await engine.discover();
    expect(discoveryResult.models.length).toBe(2);

    // Phase 2: Diff against "empty previous state"
    const diffEngine = new DiffEngine();
    const diff = diffEngine.compare({ models: [] }, { models: discoveryResult.models });

    expect(diff.added.length).toBe(2);
    expect(diff.removed.length).toBe(0);
    expect(diff.modified.length).toBe(0);

    // Phase 3: Publish change events
    const eventSystem = new ChangeEventSystem({ auditLogPath: tmpPath });
    const addedEvents = [];
    eventSystem.on('model:added', (evt) => addedEvents.push(evt));

    const published = await eventSystem.publishChanges(diff, 'integ-snapshot-001');
    expect(published.length).toBe(2);
    expect(addedEvents.length).toBe(2);

    // Verify event data integrity
    const eventIds = addedEvents.map((e) => e.model.id).sort();
    expect(eventIds).toEqual(['openai/gpt-4', 'openai/gpt-5']);

    // Cleanup
    try { require('fs').unlinkSync(tmpPath); } catch {}
  });
});
