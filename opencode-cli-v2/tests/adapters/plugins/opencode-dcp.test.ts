import { describe, expect, test } from 'bun:test';

import { PackageAdapter } from '../../../src/adapters/base';
import { OpencodeDcpPluginAdapter } from '../../../src/adapters/plugins/opencode-dcp';
import {
  pruneContextMessages,
  resolveDcpHookName,
  type DcpMessage
} from '../../../src/adapters/plugins/opencode-dcp-mappings';
import type {
  BudgetAllocation,
  BudgetCheckRequest,
  BudgetCheckResult,
  BudgetConsumption,
  BudgetPort,
  BudgetSessionSummary,
  BudgetStatus
} from '../../../src/ports/budget';

class InMemoryBudgetPort implements BudgetPort {
  public readonly consumed: BudgetConsumption[] = [];

  public upsertAllocation(allocation: BudgetAllocation): Promise<void> {
    void allocation;
    return Promise.resolve();
  }

  public async consumeTokens(consumption: BudgetConsumption): Promise<BudgetStatus> {
    this.consumed.push(consumption);
    return this.getStatus(consumption.sessionId, consumption.model);
  }

  public checkBudget(request: BudgetCheckRequest): Promise<BudgetCheckResult> {
    void request;
    return Promise.resolve({
      allowed: true,
      remainingTokens: 500,
      usedTokens: 500,
      maxTokens: 1000,
      status: 'healthy'
    });
  }

  public getStatus(sessionId: string, model: string): Promise<BudgetStatus> {
    return Promise.resolve({
      sessionId,
      model,
      usedTokens: 500,
      remainingTokens: 500,
      maxTokens: 1000,
      warningThreshold: 750,
      criticalThreshold: 800,
      status: 'healthy',
      updatedAt: new Date().toISOString()
    });
  }

  public listSessions(): Promise<BudgetSessionSummary[]> {
    return Promise.resolve([]);
  }

  public reset(sessionId: string, model?: string): Promise<void> {
    void sessionId;
    void model;
    return Promise.resolve();
  }
}

describe('OpencodeDcpPluginAdapter', () => {
  test('extends package adapter base contract', () => {
    const adapter = new OpencodeDcpPluginAdapter();
    expect(adapter).toBeInstanceOf(PackageAdapter);
  });

  test('maps thresholds at 65%, 75%, 80%', async () => {
    const adapter = new OpencodeDcpPluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    const [recommendAt65] = await port.runHook({
      name: 'context.compress.evaluate',
      payload: { usedPct: 0.65 }
    });
    const [warningAt75] = await port.runHook({
      name: 'context.compress.evaluate',
      payload: { usedPct: 0.75 }
    });
    const [criticalAt80] = await port.runHook({
      name: 'context.compress.evaluate',
      payload: { usedPct: 0.8 }
    });

    expect(recommendAt65?.handled).toBe(true);
    expect(recommendAt65?.output).toMatchObject({ severity: 'recommend', mode: 'compress' });
    expect(warningAt75?.handled).toBe(true);
    expect(warningAt75?.output).toMatchObject({ severity: 'warning', mode: 'compress' });
    expect(criticalAt80?.handled).toBe(true);
    expect(criticalAt80?.output).toMatchObject({ severity: 'critical', mode: 'compress_urgent' });
  });

  test('applies compression modes deterministically', () => {
    const messages: DcpMessage[] = [
      { role: 'user', content: 'm1', relevanceScore: 0.1 },
      { role: 'assistant', content: 'm2', relevanceScore: 0.2 },
      { role: 'user', content: 'm3', relevanceScore: 0.7 },
      { role: 'assistant', content: 'm4', relevanceScore: 0.8 },
      { role: 'user', content: 'm5', relevanceScore: 0.9 }
    ];

    const compressFirst = pruneContextMessages(messages, 'compress');
    const compressSecond = pruneContextMessages(messages, 'compress');
    const urgent = pruneContextMessages(messages, 'compress_urgent');

    expect(compressFirst.messages).toEqual(compressSecond.messages);
    expect(urgent.retainedCount).toBeLessThan(compressFirst.retainedCount);
  });

  test('prunes low-relevance messages while preserving pinned/system content', () => {
    const messages: DcpMessage[] = [
      { role: 'system', content: 'system-guardrail', relevanceScore: 0 },
      { role: 'user', content: 'pinned-context', pinned: true, relevanceScore: 0 },
      { role: 'assistant', content: 'drop-me', relevanceScore: 0.01 },
      { role: 'assistant', content: 'keep-me', relevanceScore: 0.95 }
    ];

    const result = pruneContextMessages(messages, 'compress_urgent');
    const retainedContents = result.messages.map((message) => message.content);

    expect(retainedContents).toContain('system-guardrail');
    expect(retainedContents).toContain('pinned-context');
    expect(retainedContents).toContain('keep-me');
    expect(result.prunedCount).toBe(1);
    expect(retainedContents).not.toContain('drop-me');
  });

  test('does not inject synthetic summaries into prune execute results', () => {
    const messages: DcpMessage[] = [
      { role: 'user', content: 'first low relevance detail', relevanceScore: 0.01 },
      { role: 'assistant', content: 'another low relevance detail', relevanceScore: 0.02 },
      { role: 'assistant', content: 'retain this critical instruction', relevanceScore: 0.99 }
    ];

    const result = pruneContextMessages(messages, 'compress_urgent');
    const hasSyntheticContextMessage = result.messages.some(
      (message) =>
        typeof message.metadata === 'object' &&
        message.metadata !== null &&
        typeof (message.metadata).dcp === 'object'
    );

    expect(hasSyntheticContextMessage).toBe(false);
    expect(result.messages.map((message) => message.content)).not.toContain('first low relevance detail');
  });

  test('injects session context message for transform hooks when signal is compressed', async () => {
    const adapter = new OpencodeDcpPluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();
    const port = adapter.getPort();

    const [result] = await port.runHook({
      name: 'context.messages.transform',
      payload: {
        mode: 'compress_urgent',
        messages: [
          { role: 'assistant', content: 'retain this critical instruction', relevanceScore: 0.95 },
          { role: 'assistant', content: 'this has some useful but lower-confidence signal', relevanceScore: 0.6 },
          { role: 'assistant', content: 'noisy detail 1', relevanceScore: 0.05 },
          { role: 'assistant', content: 'noisy detail 2', relevanceScore: 0.04 }
        ]
      }
    });

    const output = result?.output as { messages: DcpMessage[] };
    const syntheticContext = output.messages.find(
      (message) =>
        typeof message.metadata === 'object' &&
        message.metadata !== null &&
        typeof (message.metadata).dcp === 'object'
    );

    expect(result?.handled).toBe(true);
    expect(syntheticContext).toBeDefined();
    expect(typeof syntheticContext?.content).toBe('string');
    expect(syntheticContext?.content).toContain('Context preservation note (compress_urgent)');
  });

  test('injects session context for non-urgent compression when crucial context would be lost', async () => {
    const adapter = new OpencodeDcpPluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();
    const port = adapter.getPort();

    const [result] = await port.runHook({
      name: 'context.messages.transform',
      payload: {
        mode: 'compress',
        messages: [
          { role: 'assistant', content: 'retain this high-signal context', relevanceScore: 0.95 },
          {
            role: 'user',
            content: 'TODO: update config.yaml with rollout owner=alice and ticket OPS-1234 before deploy',
            relevanceScore: 0.05
          },
          { role: 'assistant', content: 'less important filler context', relevanceScore: 0.3 }
        ]
      }
    });

    const output = result?.output as { messages: DcpMessage[] };
    const syntheticContext = output.messages.find(
      (message) =>
        typeof message.metadata === 'object' &&
        message.metadata !== null &&
        typeof (message.metadata).dcp === 'object'
    );

    expect(result?.handled).toBe(true);
    expect(syntheticContext).toBeDefined();
    expect(typeof syntheticContext?.content).toBe('string');
    expect(syntheticContext?.content).toContain('critical-context-loss');
    expect(syntheticContext?.content).toContain('OPS-1234');
  });

  test('supports hook aliases', async () => {
    const adapter = new OpencodeDcpPluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();
    const port = adapter.getPort();

    expect(resolveDcpHookName('command.execute.before')).toBe('context.compress.evaluate');
    expect(resolveDcpHookName('tool.compress')).toBe('context.compress.execute');
    expect(resolveDcpHookName('experimental.chat.messages.transform')).toBe('context.messages.transform');

    const [evaluateAliasResult] = await port.runHook({
      name: 'command.execute.before',
      payload: { usedPct: 0.8 }
    });
    const [executeAliasResult] = await port.runHook({
      name: 'tool.compress',
      payload: {
        mode: 'compress_urgent',
        messages: [{ role: 'user', content: 'hello', relevanceScore: 0.1 }]
      }
    });
    const [transformAliasResult] = await port.runHook({
      name: 'experimental.chat.messages.transform',
      payload: {
        mode: 'compress',
        messages: [{ role: 'assistant', content: 'hello', relevanceScore: 0.9 }]
      }
    });

    expect(evaluateAliasResult?.handled).toBe(true);
    expect(evaluateAliasResult?.output).toMatchObject({ mode: 'compress_urgent' });
    expect(executeAliasResult?.handled).toBe(true);
    expect(executeAliasResult?.output).toMatchObject({ mode: 'compress_urgent' });
    expect(transformAliasResult?.handled).toBe(true);
  });

  test('integrates with BudgetPort token usage on compression execute', async () => {
    const budgetPort = new InMemoryBudgetPort();
    const adapter = new OpencodeDcpPluginAdapter({ budgetPort });

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const [result] = await port.runHook({
      name: 'context.compress.execute',
      payload: {
        sessionId: 'session-1',
        model: 'openai/gpt-5.3-codex',
        mode: 'compress',
        compressionCostTokens: 42,
        messages: [
          { role: 'system', content: 'guardrail', pinned: true },
          { role: 'user', content: 'message', relevanceScore: 0.1 }
        ]
      }
    });

    expect(result?.handled).toBe(true);
    expect(budgetPort.consumed.length).toBe(1);
    expect(budgetPort.consumed[0]).toMatchObject({
      sessionId: 'session-1',
      model: 'openai/gpt-5.3-codex',
      tokens: 42,
      reason: 'context-compression'
    });
  });
});
