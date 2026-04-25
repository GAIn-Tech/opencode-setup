import { z } from 'zod';

import { PackageAdapter } from '../base';
import type { AdapterHealthInput } from '../health';
import type {
  HookEvent,
  HookResult,
  PluginHealth,
  PluginInstallRequest,
  PluginManifest,
  PluginRecord,
  PluginsPort
} from '../../ports/plugins';
import {
  createLlmCallRecord,
  createScoreRecord,
  createSpanRecord,
  createTraceRecord,
  incrementTraceCounters,
  LangfuseCreateSpanPayloadSchema,
  LangfuseCreateTracePayloadSchema,
  LangfuseLogLlmCallPayloadSchema,
  LangfuseScorePayloadSchema,
  resolveLangfuseHookName,
  type LangfuseLlmCall,
  type LangfuseScore,
  type LangfuseSpan,
  type LangfuseTrace
} from './langfuse-mappings';

const HOOK_CREATE_TRACE = 'langfuse.create-trace';
const HOOK_CREATE_SPAN = 'langfuse.create-span';
const HOOK_LOG_LLM_CALL = 'langfuse.log-llm-call';
const HOOK_SCORE = 'langfuse.score';

export class LangfusePluginAdapter extends PackageAdapter<PluginsPort> {
  public readonly name = 'langfuse';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('plugins');
  public readonly required = true;

  private pluginRecord?: PluginRecord;
  private traces = new Map<string, LangfuseTrace>();
  private spans = new Map<string, LangfuseSpan>();
  private llmCalls = new Map<string, LangfuseLlmCall>();
  private scores = new Map<string, LangfuseScore>();

  public load(): Promise<void> {
    z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
        portType: z.symbol(),
        required: z.boolean()
      })
      .parse({
        name: this.name,
        version: this.version,
        portType: this.portType,
        required: this.required
      });

    return Promise.resolve();
  }

  public initialize(): Promise<void> {
    this.pluginRecord = {
      manifest: {
        id: this.name,
        name: this.name,
        version: this.version,
        description: 'langfuse plugin adapter',
        entrypoint: './src/adapters/plugins/langfuse.ts',
        hooks: [HOOK_CREATE_TRACE, HOOK_CREATE_SPAN, HOOK_LOG_LLM_CALL, HOOK_SCORE],
        capabilities: ['tracing', 'span-management', 'llm-observability', 'scoring'],
        requiredPermissions: []
      },
      state: 'enabled',
      loadedAt: new Date().toISOString()
    };

    this.setPort(this.createPort());
    return Promise.resolve();
  }

  public healthCheck(): Promise<AdapterHealthInput> {
    if (!this.pluginRecord) {
      return Promise.resolve({ status: 'unhealthy', details: 'Plugin adapter is not initialized' });
    }

    if (this.traces.size === 0) {
      return Promise.resolve({ status: 'degraded', details: 'No traces recorded yet' });
    }

    return Promise.resolve({ status: 'healthy' });
  }

  public shutdown(): Promise<void> {
    this.pluginRecord = undefined;
    this.traces.clear();
    this.spans.clear();
    this.llmCalls.clear();
    this.scores.clear();
    return Promise.resolve();
  }

  private createPort(): PluginsPort {
    return {
      listPlugins: () => Promise.resolve(this.pluginRecord ? [this.pluginRecord] : []),
      installPlugin: (request: PluginInstallRequest): Promise<PluginManifest> => {
        void request;
        return Promise.resolve(this.requirePlugin().manifest);
      },
      uninstallPlugin: () => {
        this.pluginRecord = undefined;
        return Promise.resolve();
      },
      loadPlugin: () => Promise.resolve(),
      unloadPlugin: () => Promise.resolve(),
      enablePlugin: () => {
        this.requirePlugin().state = 'enabled';
        return Promise.resolve();
      },
      disablePlugin: () => {
        this.requirePlugin().state = 'disabled';
        return Promise.resolve();
      },
      runHook: (event: HookEvent): Promise<HookResult[]> => Promise.resolve([this.handleHook(event)]),
      getPluginHealth: (pluginId: string): Promise<PluginHealth> => {
        void pluginId;
        return Promise.resolve({
          pluginId: this.name,
          status: this.pluginRecord ? 'healthy' : 'unhealthy',
          details: this.pluginRecord ? undefined : 'Plugin not initialized',
          checkedAt: new Date().toISOString()
        });
      }
    };
  }

  private handleHook(event: HookEvent): HookResult {
    const canonicalHook = resolveLangfuseHookName(event.name);
    if (!canonicalHook) {
      return { pluginId: this.name, handled: false, error: `Unsupported hook: ${event.name}` };
    }

    try {
      if (canonicalHook === HOOK_CREATE_TRACE) {
        return {
          pluginId: this.name,
          handled: true,
          output: this.handleCreateTrace(event.payload)
        };
      }

      if (canonicalHook === HOOK_CREATE_SPAN) {
        return {
          pluginId: this.name,
          handled: true,
          output: this.handleCreateSpan(event.payload)
        };
      }

      if (canonicalHook === HOOK_LOG_LLM_CALL) {
        return {
          pluginId: this.name,
          handled: true,
          output: this.handleLogLlmCall(event.payload)
        };
      }

      return {
        pluginId: this.name,
        handled: true,
        output: this.handleScore(event.payload)
      };
    } catch (error: unknown) {
      return {
        pluginId: this.name,
        handled: false,
        error: this.toErrorMessage(error)
      };
    }
  }

  private handleCreateTrace(payloadValue: unknown): LangfuseTrace {
    const payload = LangfuseCreateTracePayloadSchema.parse(payloadValue);
    const trace = createTraceRecord(payload);

    if (this.traces.has(trace.traceId)) {
      throw new Error(`Trace already exists: ${trace.traceId}`);
    }

    this.traces.set(trace.traceId, trace);
    return trace;
  }

  private handleCreateSpan(payloadValue: unknown): LangfuseSpan {
    const payload = LangfuseCreateSpanPayloadSchema.parse(payloadValue);
    const trace = this.requireTrace(payload.traceId);
    const span = createSpanRecord(payload);

    if (this.spans.has(span.spanId)) {
      throw new Error(`Span already exists: ${span.spanId}`);
    }

    this.spans.set(span.spanId, span);
    this.traces.set(trace.traceId, incrementTraceCounters(trace, 'spansCount'));

    return span;
  }

  private handleLogLlmCall(payloadValue: unknown): LangfuseLlmCall {
    const payload = LangfuseLogLlmCallPayloadSchema.parse(payloadValue);
    const trace = this.requireTrace(payload.traceId);

    if (payload.spanId) {
      const span = this.requireSpan(payload.spanId);
      if (span.traceId !== payload.traceId) {
        throw new Error(`Span ${payload.spanId} is not attached to trace ${payload.traceId}`);
      }
    }

    const call = createLlmCallRecord(payload);
    if (this.llmCalls.has(call.callId)) {
      throw new Error(`LLM call already exists: ${call.callId}`);
    }

    this.llmCalls.set(call.callId, call);
    this.traces.set(trace.traceId, incrementTraceCounters(trace, 'llmCallsCount'));

    return call;
  }

  private handleScore(payloadValue: unknown): LangfuseScore {
    const payload = LangfuseScorePayloadSchema.parse(payloadValue);
    const trace = this.requireTrace(payload.traceId);

    if (payload.spanId) {
      const span = this.requireSpan(payload.spanId);
      if (span.traceId !== payload.traceId) {
        throw new Error(`Span ${payload.spanId} is not attached to trace ${payload.traceId}`);
      }
    }

    const score = createScoreRecord(payload);
    if (this.scores.has(score.scoreId)) {
      throw new Error(`Score already exists: ${score.scoreId}`);
    }

    this.scores.set(score.scoreId, score);
    this.traces.set(trace.traceId, incrementTraceCounters(trace, 'scoresCount'));

    return score;
  }

  private requirePlugin(): PluginRecord {
    return z
      .object({
        manifest: z.any(),
        state: z.enum(['discovered', 'installed', 'loaded', 'enabled', 'disabled', 'error'])
      })
      .parse(this.pluginRecord) as PluginRecord;
  }

  private requireTrace(traceId: string): LangfuseTrace {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`Trace not found: ${traceId}`);
    }

    return trace;
  }

  private requireSpan(spanId: string): LangfuseSpan {
    const span = this.spans.get(spanId);
    if (!span) {
      throw new Error(`Span not found: ${spanId}`);
    }

    return span;
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
