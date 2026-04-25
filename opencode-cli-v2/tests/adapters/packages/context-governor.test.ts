import { describe, expect, test } from 'bun:test';

import { ContextGovernorAdapter } from '../../../src/adapters/packages/context-governor';
import { ContextGovernorAdapterError } from '../../../src/adapters/packages/context-governor-errors';

type FakeUsageStatus = 'ok' | 'warn' | 'error' | 'exceeded';

class FakeGovernor {
  private readonly usage = new Map<string, number>();
  private readonly callbacks: ((payload: Record<string, unknown>) => void)[] = [];

  public constructor(private readonly options: Record<string, unknown> = {}) {
    if (typeof options.onErrorThreshold === 'function') {
      this.callbacks.push(options.onErrorThreshold as (payload: Record<string, unknown>) => void);
    }
  }

  public checkBudget(sessionId: string, model: string, proposedTokens: number) {
    const current = this.getRemainingBudget(sessionId, model);
    const wouldUse = current.used + proposedTokens;
    const max = this.maxTokens();
    const pct = wouldUse / max;

    let status: FakeUsageStatus = 'ok';
    let allowed = true;

    if (wouldUse > max) {
      status = 'exceeded';
      allowed = false;
    } else if (pct >= 0.8) {
      status = 'error';
      allowed = false;
      for (const cb of this.callbacks) {
        cb({ sessionId, model, wouldPct: pct, wouldUse, maxTokens: max });
      }
    } else if (pct >= 0.75) {
      status = 'warn';
    }

    return {
      allowed,
      status,
      remaining: Math.max(0, max - wouldUse),
      message: 'fake-check'
    };
  }

  public consumeTokens(sessionId: string, model: string, tokens: number) {
    const key = `${sessionId}:${model}`;
    const next = (this.usage.get(key) ?? 0) + tokens;
    this.usage.set(key, next);

    const max = this.maxTokens();
    const pct = next / max;
    let status: FakeUsageStatus = 'ok';
    if (next >= max) {
      status = 'exceeded';
    } else if (pct >= 0.8) {
      status = 'error';
      for (const cb of this.callbacks) {
        cb({ sessionId, model, wouldPct: pct, wouldUse: next, maxTokens: max });
      }
    } else if (pct >= 0.75) {
      status = 'warn';
    }

    return {
      used: next,
      remaining: Math.max(0, max - next),
      pct,
      status
    };
  }

  public getRemainingBudget(sessionId: string, model: string) {
    const key = `${sessionId}:${model}`;
    const used = this.usage.get(key) ?? 0;
    const max = this.maxTokens();
    const pct = used / max;

    let status: FakeUsageStatus = 'ok';
    if (used >= max) {
      status = 'exceeded';
    } else if (pct >= 0.8) {
      status = 'error';
    } else if (pct >= 0.75) {
      status = 'warn';
    }

    return {
      used,
      remaining: Math.max(0, max - used),
      max,
      pct,
      status
    };
  }

  public getAllSessions() {
    const result: Record<string, Record<string, ReturnType<FakeGovernor['getRemainingBudget']>>> = {};

    for (const key of this.usage.keys()) {
      const [sessionId, model] = key.split(':');
      if (!sessionId || !model) {
        continue;
      }

      result[sessionId] ??= {};

      result[sessionId][model] = this.getRemainingBudget(sessionId, model);
    }

    return result;
  }

  public resetSession(sessionId: string, model?: string) {
    if (model) {
      this.usage.delete(`${sessionId}:${model}`);
      return;
    }

    for (const key of [...this.usage.keys()]) {
      if (key.startsWith(`${sessionId}:`)) {
        this.usage.delete(key);
      }
    }
  }

  public onErrorThreshold(callback: (payload: Record<string, unknown>) => void) {
    this.callbacks.push(callback);
  }

  public shutdown() {
    this.usage.clear();
    this.callbacks.length = 0;
  }

  private maxTokens(): number {
    const max = this.options.maxTokens;
    return typeof max === 'number' && max > 0 ? Math.floor(max) : 1_000;
  }
}

async function withInitializedAdapter(
  fn: (adapter: ContextGovernorAdapter) => Promise<void>,
  options: ConstructorParameters<typeof ContextGovernorAdapter>[0] = {}
): Promise<void> {
  const adapter = new ContextGovernorAdapter({
    loadLegacyModule: async () => ({ Governor: FakeGovernor }),
    ...options
  });

  await adapter.runLoad();
  await adapter.runInitialize();

  try {
    await fn(adapter);
  } finally {
    await adapter.runShutdown();
  }
}

describe('ContextGovernorAdapter', () => {
  test('loads, initializes, and reports healthy status', async () => {
    await withInitializedAdapter(async (adapter) => {
      const health = await adapter.runHealthCheck();

      expect(adapter.getStatus()).toBe('ready');
      expect(health.status).toBe('healthy');
    });
  });

  test('tracks token budgets and maps status thresholds', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();
      await port.upsertAllocation({
        sessionId: 'session-1',
        model: 'openai/gpt-4o',
        scope: 'session',
        maxTokens: 1_000
      });

      const statusAfterConsume = await port.consumeTokens({
        sessionId: 'session-1',
        model: 'openai/gpt-4o',
        tokens: 780
      });

      expect(statusAfterConsume.usedTokens).toBe(780);
      expect(statusAfterConsume.remainingTokens).toBe(220);
      expect(statusAfterConsume.status).toBe('warning');

      const statusCritical = await port.consumeTokens({
        sessionId: 'session-1',
        model: 'openai/gpt-4o',
        tokens: 80
      });
      expect(statusCritical.status).toBe('critical');
    });
  });

  test('checks budget status and blocks exhausted requests', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();
      await port.upsertAllocation({
        sessionId: 'session-2',
        model: 'openai/gpt-4o',
        scope: 'session',
        maxTokens: 1_000,
        warningThreshold: 750,
        criticalThreshold: 800
      });

      await port.consumeTokens({
        sessionId: 'session-2',
        model: 'openai/gpt-4o',
        tokens: 790
      });

      const check = await port.checkBudget({
        sessionId: 'session-2',
        model: 'openai/gpt-4o',
        proposedTokens: 260
      });

      expect(check.allowed).toBe(false);
      expect(check.status).toBe('exhausted');
      expect(check.remainingTokens).toBe(0);
      expect(check.usedTokens).toBe(1050);
    });
  });

  test('supports compression triggers and recommendations', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();
      await port.upsertAllocation({
        sessionId: 'session-3',
        model: 'openai/gpt-4o',
        scope: 'session',
        maxTokens: 1_000
      });

      await port.consumeTokens({
        sessionId: 'session-3',
        model: 'openai/gpt-4o',
        tokens: 700
      });

      expect(await adapter.shouldCompress('session-3', 'openai/gpt-4o')).toBe(true);
      const recommendation = await adapter.getCompressionRecommendation('session-3', 'openai/gpt-4o');
      expect(recommendation?.level).toBe('compress');

      await port.consumeTokens({
        sessionId: 'session-3',
        model: 'openai/gpt-4o',
        tokens: 260
      });

      const urgentRecommendation = await adapter.getCompressionRecommendation('session-3', 'openai/gpt-4o');
      expect(urgentRecommendation?.level).toBe('compress_emergency');
    });
  });

  test('lists tracked sessions and supports reset', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();

      await port.upsertAllocation({
        sessionId: 'session-4',
        model: 'openai/gpt-4o',
        scope: 'session',
        maxTokens: 1_000
      });

      await port.upsertAllocation({
        sessionId: 'session-4',
        model: 'anthropic/claude-sonnet-4-5',
        scope: 'session',
        maxTokens: 2_000
      });

      await port.consumeTokens({
        sessionId: 'session-4',
        model: 'openai/gpt-4o',
        tokens: 100
      });

      const sessions = await port.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.sessionId).toBe('session-4');
      expect(sessions[0]?.models).toHaveLength(2);
      expect(sessions[0]?.totalUsedTokens).toBe(100);

      await port.reset('session-4', 'openai/gpt-4o');
      await expect(port.getStatus('session-4', 'openai/gpt-4o')).rejects.toBeInstanceOf(
        ContextGovernorAdapterError
      );
    });
  });

  test('maps payload validation failures to adapter errors', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();

      await expect(
        port.upsertAllocation({
          sessionId: '',
          model: 'openai/gpt-4o',
          scope: 'session',
          maxTokens: 0
        })
      ).rejects.toBeInstanceOf(ContextGovernorAdapterError);
    });
  });
});
