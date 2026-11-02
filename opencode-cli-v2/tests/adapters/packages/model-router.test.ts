import { describe, expect, test } from 'bun:test';

import { ModelRouterAdapter } from '../../../src/adapters/packages/model-router';
import { ModelRouterAdapterError } from '../../../src/adapters/packages/model-router-errors';

interface FakeSelection {
  modelId: string;
  reason: string;
  score: number;
  fallbacks?: string[];
}

class FakeLegacyModelRouter {
  public readonly models: Record<string, Record<string, unknown>> = {
    'google/gemini-3-pro': {
      id: 'google/gemini-3-pro',
      provider: 'google',
      tier: 'flagship',
      max_context: 1_000_000,
      max_output: 8_192,
      cost_per_1k_tokens: 0.02,
      strengths: ['reasoning', 'long-context']
    },
    'openai/gpt-4o': {
      id: 'openai/gpt-4o',
      provider: 'openai',
      tier: 'balanced',
      max_context: 128_000,
      max_output: 4_096,
      cost_per_1k_tokens: 0.01,
      strengths: ['coding']
    }
  };

  public readonly stats = {
    'google/gemini-3-pro': {
      calls: 12,
      successes: 9,
      failures: 3,
      total_latency_ms: 4_800
    },
    'openai/gpt-4o': {
      calls: 8,
      successes: 7,
      failures: 1,
      total_latency_ms: 2_000
    }
  };

  public selection: FakeSelection = {
    modelId: 'google/gemini-3-pro',
    reason: 'fit:reasoning',
    score: 0.91,
    fallbacks: ['openai/gpt-4o']
  };

  public lastSelectContext?: Record<string, unknown>;
  public lastOutcome?: {
    modelId: string;
    success: boolean;
    latencyMs: number;
    context?: Record<string, unknown>;
  };

  public listModels() {
    return Object.values(this.models);
  }

  public selectModel(context: Record<string, unknown>) {
    this.lastSelectContext = context;
    return this.selection;
  }

  public resolveModelId(modelId: string): string | null {
    if (this.models[modelId]) {
      return modelId;
    }

    if (modelId === 'gpt-4o') {
      return 'openai/gpt-4o';
    }

    return null;
  }

  public recordOutcome(
    modelId: string,
    success: boolean,
    latencyMs = 0,
    context?: Record<string, unknown>
  ) {
    this.lastOutcome = { modelId, success, latencyMs, context };
  }

  public shutdown() {
    return undefined;
  }
}

async function withInitializedAdapter(
  fn: (adapter: ModelRouterAdapter, router: FakeLegacyModelRouter) => Promise<void>
): Promise<void> {
  const fakeRouter = new FakeLegacyModelRouter();
  const adapter = new ModelRouterAdapter({
    loadLegacyModule: async () => ({
      ModelRouter: class {
        public constructor() {
          return fakeRouter;
        }
      }
    })
  });

  await adapter.runLoad();
  await adapter.runInitialize();

  try {
    await fn(adapter, fakeRouter);
  } finally {
    await adapter.runShutdown();
  }
}

describe('ModelRouterAdapter', () => {
  test('loads, initializes, and reports healthy status', async () => {
    await withInitializedAdapter(async (adapter) => {
      const health = await adapter.runHealthCheck();

      expect(adapter.getStatus()).toBe('ready');
      expect(health.status).toBe('healthy');
    });
  });

  test('lists and maps legacy models to routing descriptors', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();
      const models = await port.listModels();

      expect(models).toHaveLength(2);
      expect(models[0]?.id).toBe('google/gemini-3-pro');
      expect(models[0]?.latencyTier).toBe('high');
      expect(models[0]?.costTier).toBe('medium');
      expect(models[0]?.capabilities).toContain('reasoning');
    });
  });

  test('routes model selection and forwards budget-aware context fields', async () => {
    await withInitializedAdapter(async (adapter, router) => {
      const port = adapter.getPort();
      const decision = await port.selectModel({
        taskType: 'code_generation',
        prompt: 'Implement adapter',
        maxTokens: 7000,
        preferredModel: 'openai/gpt-4o',
        requiredCapabilities: ['coding', 'reasoning'],
        metadata: {
          sessionId: 'session-123',
          category: 'quick',
          complexity: 'high'
        }
      });

      expect(decision.modelId).toBe('google/gemini-3-pro');
      expect(decision.alternatives).toEqual(['openai/gpt-4o']);

      expect(router.lastSelectContext).toBeDefined();
      expect(router.lastSelectContext?.availableTokens).toBe(7000);
      expect(router.lastSelectContext?.sessionId).toBe('session-123');
      expect(router.lastSelectContext?.overrideModelId).toBe('openai/gpt-4o');
      expect(router.lastSelectContext?.required_strengths).toEqual(['coding', 'reasoning']);
    });
  });

  test('returns model health for known and unknown models', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();

      const healthy = await port.getModelHealth('google/gemini-3-pro');
      const unavailable = await port.getModelHealth('missing-model');

      expect(healthy.status).toBe('healthy');
      expect(unavailable.status).toBe('unavailable');
    });
  });

  test('records routing outcomes and aggregates stats', async () => {
    await withInitializedAdapter(async (adapter, router) => {
      const port = adapter.getPort();

      await port.recordOutcome({
        modelId: 'openai/gpt-4o',
        taskType: 'analysis',
        success: true,
        latencyMs: 220,
        inputTokens: 150,
        outputTokens: 80,
        recordedAt: new Date().toISOString()
      });

      expect(router.lastOutcome).toEqual({
        modelId: 'openai/gpt-4o',
        success: true,
        latencyMs: 220,
        context: {
          taskType: 'analysis',
          availableTokens: 150,
          sessionId: undefined
        }
      });

      const stats = await port.getStats();
      expect(stats.totalRoutes).toBe(20);
      expect(stats.successRate).toBeCloseTo(0.8, 6);
      expect(stats.averageLatencyMs).toBeCloseTo(340, 6);
      expect(stats.modelSelectionCounts).toEqual({
        'google/gemini-3-pro': 12,
        'openai/gpt-4o': 8
      });
    });
  });

  test('maps validation failures to adapter errors', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();

      await expect(
        port.selectModel({ taskType: '', prompt: 'invalid', requiredCapabilities: [] })
      ).rejects.toBeInstanceOf(
        ModelRouterAdapterError
      );
    });
  });
});
