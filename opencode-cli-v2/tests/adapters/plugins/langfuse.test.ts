import { describe, expect, test } from 'bun:test';

import { PackageAdapter } from '../../../src/adapters/base';
import { LangfusePluginAdapter } from '../../../src/adapters/plugins/langfuse';

const CREATE_TRACE_HOOK = 'langfuse.create-trace';
const CREATE_SPAN_HOOK = 'langfuse.create-span';
const LOG_LLM_CALL_HOOK = 'langfuse.log-llm-call';
const SCORE_HOOK = 'langfuse.score';

describe('LangfusePluginAdapter', () => {
  test('extends package adapter and supports lifecycle', async () => {
    const adapter = new LangfusePluginAdapter();
    expect(adapter).toBeInstanceOf(PackageAdapter);

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const plugins = await port.listPlugins();
    expect(plugins[0]?.manifest.id).toBe('langfuse');

    const preTraceHealth = await adapter.runHealthCheck();
    expect(preTraceHealth.status).toBe('degraded');

    const [traceResult] = await port.runHook({
      name: CREATE_TRACE_HOOK,
      payload: {
        traceId: 'trace-lifecycle',
        name: 'Agent execution lifecycle'
      }
    });

    expect(traceResult?.handled).toBe(true);

    const postTraceHealth = await adapter.runHealthCheck();
    expect(postTraceHealth.status).toBe('healthy');

    await adapter.runShutdown();
    expect(adapter.getStatus()).toBe('shutdown');
  });

  test('creates trace and span for operation tracking', async () => {
    const adapter = new LangfusePluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();
    const port = adapter.getPort();

    const [trace] = await port.runHook({
      name: CREATE_TRACE_HOOK,
      payload: {
        traceId: 'trace-1',
        name: 'Agent run',
        sessionId: 'session-1',
        userId: 'user-1',
        tags: ['agent', 'execution'],
        metadata: { objective: 'Implement plugin adapter' }
      }
    });

    expect(trace?.handled).toBe(true);
    expect(trace?.output).toMatchObject({
      traceId: 'trace-1',
      sessionId: 'session-1',
      userId: 'user-1',
      spansCount: 0
    });

    const [span] = await port.runHook({
      name: CREATE_SPAN_HOOK,
      payload: {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'tool-execution',
        startTime: '2026-04-16T12:00:00.000Z',
        endTime: '2026-04-16T12:00:00.125Z',
        metadata: { tool: 'read' }
      }
    });

    expect(span?.handled).toBe(true);
    expect(span?.output).toMatchObject({
      traceId: 'trace-1',
      spanId: 'span-1',
      name: 'tool-execution',
      latencyMs: 125
    });
  });

  test('logs llm call with token usage and latency', async () => {
    const adapter = new LangfusePluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();
    const port = adapter.getPort();

    await port.runHook({
      name: CREATE_TRACE_HOOK,
      payload: {
        traceId: 'trace-llm',
        name: 'LLM request trace'
      }
    });

    await port.runHook({
      name: CREATE_SPAN_HOOK,
      payload: {
        traceId: 'trace-llm',
        spanId: 'span-llm',
        name: 'model-call'
      }
    });

    const [llmCall] = await port.runHook({
      name: LOG_LLM_CALL_HOOK,
      payload: {
        traceId: 'trace-llm',
        spanId: 'span-llm',
        callId: 'call-1',
        model: 'openai/gpt-5.3-codex',
        provider: 'openai',
        prompt: 'Summarize adapter requirements',
        response: 'Summary complete',
        inputTokens: 120,
        outputTokens: 80,
        startTime: '2026-04-16T12:00:01.000Z',
        endTime: '2026-04-16T12:00:01.300Z'
      }
    });

    expect(llmCall?.handled).toBe(true);
    expect(llmCall?.output).toMatchObject({
      callId: 'call-1',
      traceId: 'trace-llm',
      spanId: 'span-llm',
      model: 'openai/gpt-5.3-codex',
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      latencyMs: 300
    });
  });

  test('supports scoring and feedback on traces', async () => {
    const adapter = new LangfusePluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();
    const port = adapter.getPort();

    await port.runHook({
      name: CREATE_TRACE_HOOK,
      payload: {
        traceId: 'trace-score',
        name: 'Scored trace'
      }
    });

    const [score] = await port.runHook({
      name: SCORE_HOOK,
      payload: {
        traceId: 'trace-score',
        scoreId: 'score-1',
        name: 'quality',
        value: 0.97,
        comment: 'High answer quality',
        source: 'human-review'
      }
    });

    expect(score?.handled).toBe(true);
    expect(score?.output).toMatchObject({
      scoreId: 'score-1',
      traceId: 'trace-score',
      name: 'quality',
      value: 0.97,
      comment: 'High answer quality',
      source: 'human-review'
    });
  });

  test('returns errors for unsupported hooks and unknown traces', async () => {
    const adapter = new LangfusePluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();
    const port = adapter.getPort();

    const [unsupported] = await port.runHook({
      name: 'langfuse.unknown',
      payload: {}
    });

    expect(unsupported?.handled).toBe(false);
    expect(unsupported?.error).toContain('Unsupported hook');

    const [unknownTrace] = await port.runHook({
      name: SCORE_HOOK,
      payload: {
        traceId: 'missing-trace',
        name: 'quality',
        value: 0.2
      }
    });

    expect(unknownTrace?.handled).toBe(false);
    expect(unknownTrace?.error).toContain('Trace not found');
  });
});
