import { describe, expect, test } from 'bun:test';

import { LearningAdapter } from '../../../src/adapters/packages/learning';
import { LearningAdapterError } from '../../../src/adapters/packages/learning-errors';

interface LegacyPatternEntry {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  occurrences: number;
  weight?: number;
  success_rate?: number;
  context?: Record<string, unknown>;
}

class FakeLearningEngine {
  public readonly antiPatterns: { patterns: LegacyPatternEntry[] } = {
    patterns: []
  };
  public readonly positivePatterns: { patterns: LegacyPatternEntry[] } = {
    patterns: []
  };

  public lastAdviseContext?: Record<string, unknown>;
  public lastOutcome?: {
    adviceId: string;
    outcome: Record<string, unknown>;
  };

  public ingestEvent(event: unknown) {
    const input = event as {
      type?: string;
      payload?: Record<string, unknown>;
    };

    if (!input.type || !input.payload) {
      return { success: false, reason: 'missing event fields' };
    }

    if (input.type === 'anti-pattern') {
      this.antiPatterns.patterns.push({
        id: `ap-${this.antiPatterns.patterns.length + 1}`,
        type: String(input.payload.type ?? 'failed_debug'),
        description: String(input.payload.description ?? 'anti-pattern'),
        weight: 8,
        timestamp: new Date().toISOString(),
        occurrences: 1,
        context: (input.payload.context ?? {}) as Record<string, unknown>
      });
      return { success: true };
    }

    if (input.type === 'positive-pattern') {
      this.positivePatterns.patterns.push({
        id: `pp-${this.positivePatterns.patterns.length + 1}`,
        type: String(input.payload.type ?? 'efficient_debug'),
        description: String(input.payload.description ?? 'positive-pattern'),
        success_rate: 0.92,
        timestamp: new Date().toISOString(),
        occurrences: 1,
        context: (input.payload.context ?? {}) as Record<string, unknown>
      });
      return { success: true };
    }

    if (input.type === 'tool-usage') {
      return { success: true };
    }

    return { success: false, reason: `unsupported event type: ${input.type}` };
  }

  public advise(context: Record<string, unknown>) {
    this.lastAdviseContext = context;
    return {
      advice_id: 'adv-123',
      warnings: [
        {
          type: 'repeated_mistake',
          description: 'Same failure seen in recent sessions',
          severity: 'high',
          action: 'BLOCK_OR_REVIEW',
          advice: 'Pause and run deeper diagnostics'
        }
      ],
      suggestions: [
        {
          type: 'clean_refactor',
          description: 'Prefer focused refactor plan',
          success_rate: 0.8,
          action: 'CONSIDER'
        }
      ]
    };
  }

  public learnFromOutcome(adviceId: string, outcome: Record<string, unknown>) {
    this.lastOutcome = {
      adviceId,
      outcome
    };

    return {
      learned: true,
      advice_id: adviceId
    };
  }

  public async getReport() {
    return {
      engine_version: '1.0.0',
      generated_at: new Date().toISOString(),
      anti_patterns: {
        total: this.antiPatterns.patterns.length
      },
      positive_patterns: {
        total: this.positivePatterns.patterns.length
      }
    };
  }

  public save() {
    return undefined;
  }
}

async function withInitializedAdapter(
  fn: (adapter: LearningAdapter, engine: FakeLearningEngine) => Promise<void>
): Promise<void> {
  const fakeEngine = new FakeLearningEngine();
  const adapter = new LearningAdapter({
    loadLegacyModule: async () => ({
      LearningEngine: class {
        public constructor() {
          return fakeEngine;
        }
      }
    })
  });

  await adapter.runLoad();
  await adapter.runInitialize();

  try {
    await fn(adapter, fakeEngine);
  } finally {
    await adapter.runShutdown();
  }
}

describe('LearningAdapter', () => {
  test('loads, initializes, and reports healthy status', async () => {
    await withInitializedAdapter(async (adapter) => {
      const health = await adapter.runHealthCheck();

      expect(adapter.getStatus()).toBe('ready');
      expect(health.status).toBe('healthy');
    });
  });

  test('records signals and exposes analyzed patterns', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();

      await port.ingestSignal({
        id: 'signal-failure',
        sessionId: 'session-1',
        category: 'failure',
        input: { tool: 'bash' },
        success: false,
        timestamp: new Date().toISOString()
      });

      await port.ingestSignal({
        id: 'signal-success',
        sessionId: 'session-1',
        category: 'success',
        input: { tool: 'read' },
        success: true,
        timestamp: new Date().toISOString()
      });

      const patterns = await port.analyzePatterns({
        minConfidence: 0.5,
        limit: 10
      });

      expect(patterns.length).toBeGreaterThanOrEqual(2);
      expect(patterns.map((pattern) => pattern.category)).toContain('failure');
      expect(patterns.map((pattern) => pattern.category)).toContain('success');
    });
  });

  test('maps legacy advice to recommendations', async () => {
    await withInitializedAdapter(async (adapter, engine) => {
      const port = adapter.getPort();

      const recommendations = await port.recommend({
        sessionId: 'session-2',
        taskType: 'debug',
        metadata: {
          complexity: 'high',
          description: 'Investigate repeated build failure',
          files: ['src/main.ts']
        }
      });

      expect(recommendations.length).toBeGreaterThanOrEqual(2);
      expect(recommendations[0]?.id).toContain(':');
      expect(engine.lastAdviseContext?.task_type).toBe('debug');
      expect(engine.lastAdviseContext?.session_id).toBe('session-2');
    });
  });

  test('applies adaptation decisions through learnFromOutcome', async () => {
    await withInitializedAdapter(async (adapter, engine) => {
      const port = adapter.getPort();

      await port.applyAdaptation({
        id: 'adapt-1',
        target: 'routing',
        changeSet: {
          adviceId: 'adv-override-77',
          success: false,
          latencyMs: 345
        },
        reason: 'Routing adjustment reduced quality',
        createdAt: new Date().toISOString()
      });

      expect(engine.lastOutcome).toBeDefined();
      expect(engine.lastOutcome?.adviceId).toBe('adv-override-77');
      expect(engine.lastOutcome?.outcome.success).toBe(false);
    });
  });

  test('returns learning state from legacy report', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();

      await port.ingestSignal({
        id: 'signal-state',
        sessionId: 'session-3',
        category: 'performance',
        input: {},
        success: true,
        timestamp: new Date().toISOString()
      });

      const state = await port.getState();

      expect(state.signalCount).toBe(1);
      expect(state.patternCount).toBe(1);
      expect(state.version).toBe('1.0.0');
      expect(state.lastIngestedAt).toBeTruthy();
    });
  });

  test('maps payload validation failures to adapter errors', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();

      await expect(
        port.ingestSignal({
          id: '',
          sessionId: 'session-4',
          category: 'failure',
          input: {},
          success: false,
          timestamp: new Date().toISOString()
        })
      ).rejects.toBeInstanceOf(LearningAdapterError);
    });
  });
});
