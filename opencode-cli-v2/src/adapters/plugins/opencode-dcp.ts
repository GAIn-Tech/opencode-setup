import { z } from 'zod';

import { PackageAdapter } from '../base';
import type { AdapterHealthInput } from '../health';
import type { BudgetPort } from '../../ports/budget';
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
  COMPRESSION_CRITICAL_THRESHOLD_PCT,
  COMPRESSION_RECOMMEND_THRESHOLD_PCT,
  COMPRESSION_WARNING_THRESHOLD_PCT,
  CompressionModeSchema,
  DcpEvaluatePayloadSchema,
  DcpEvaluationSchema,
  DcpExecutePayloadSchema,
  DcpPruneResultSchema,
  DcpTransformPayloadSchema,
  buildSessionContextInjection,
  deriveUsedPctFromPayload,
  evaluateCompressionPolicy,
  evaluateCompressionSeverity,
  extractTransformMessages,
  pruneContextMessages,
  resolveDcpHookName,
  type CompressionMode,
  type DcpEvaluatePayload,
  type DcpExecutePayload,
  type DcpTransformPayload
} from './opencode-dcp-mappings';

export interface OpencodeDcpPluginAdapterOptions {
  readonly budgetPort?: BudgetPort;
}

export class OpencodeDcpPluginAdapter extends PackageAdapter<PluginsPort> {
  public readonly name = 'opencode-dcp';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('plugins');
  public readonly required = true;

  private pluginRecord?: PluginRecord;

  public constructor(private readonly options: OpencodeDcpPluginAdapterOptions = {}) {
    super();
  }

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
        description: 'opencode-dcp plugin adapter',
        entrypoint: './src/adapters/plugins/opencode-dcp.ts',
        hooks: [
          'context.compress.evaluate',
          'context.compress.execute',
          'context.messages.transform',
          'experimental.chat.messages.transform',
          'experimental.chat.system.transform',
          'command.execute.before',
          'tool.compress'
        ],
        capabilities: ['context-compression', 'token-budget-aware-pruning'],
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

    if (!this.options.budgetPort) {
      return Promise.resolve({ status: 'degraded', details: 'Budget port not configured; using payload-only usage' });
    }

    return Promise.resolve({ status: 'healthy' });
  }

  public shutdown(): Promise<void> {
    this.pluginRecord = undefined;
    return Promise.resolve();
  }

  private createPort(): PluginsPort {
    return {
      listPlugins: () => Promise.resolve(this.pluginRecord ? [this.pluginRecord] : []),
      installPlugin: (request: PluginInstallRequest): Promise<PluginManifest> => {
        void request;
        return Promise.resolve(this.requirePlugin().manifest);
      },
      uninstallPlugin: (pluginId: string) => {
        void pluginId;
        this.pluginRecord = undefined;
        return Promise.resolve();
      },
      loadPlugin: (pluginId: string) => {
        void pluginId;
        return Promise.resolve();
      },
      unloadPlugin: (pluginId: string) => {
        void pluginId;
        return Promise.resolve();
      },
      enablePlugin: (pluginId: string) => {
        void pluginId;
        this.requirePlugin().state = 'enabled';
        return Promise.resolve();
      },
      disablePlugin: (pluginId: string) => {
        void pluginId;
        this.requirePlugin().state = 'disabled';
        return Promise.resolve();
      },
      runHook: (event: HookEvent): Promise<HookResult[]> => this.handleHook(event).then((result) => [result]),
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

  private async handleHook(event: HookEvent): Promise<HookResult> {
    const canonicalHook = resolveDcpHookName(event.name);
    if (!canonicalHook) {
      return { pluginId: this.name, handled: false, error: `Unsupported hook: ${event.name}` };
    }

    try {
      if (canonicalHook === 'context.compress.evaluate') {
        return {
          pluginId: this.name,
          handled: true,
          output: await this.handleEvaluateHook(event.payload)
        };
      }

      if (canonicalHook === 'context.compress.execute') {
        return {
          pluginId: this.name,
          handled: true,
          output: await this.handleExecuteHook(event.payload)
        };
      }

      return {
        pluginId: this.name,
        handled: true,
        output: await this.handleTransformHook(event.payload)
      };
    } catch (error: unknown) {
      return {
        pluginId: this.name,
        handled: false,
        error: this.toErrorMessage(error)
      };
    }
  }

  private async handleEvaluateHook(payload: Record<string, unknown>) {
    const parsed = DcpEvaluatePayloadSchema.parse(payload);
    const usedPct = await this.resolveUsedPct(parsed);
    const mode = evaluateCompressionPolicy(usedPct);

    return DcpEvaluationSchema.parse({
      usedPct,
      severity: evaluateCompressionSeverity(usedPct),
      mode,
      shouldCompress: mode !== 'none',
      thresholds: {
        recommend: COMPRESSION_RECOMMEND_THRESHOLD_PCT,
        warning: COMPRESSION_WARNING_THRESHOLD_PCT,
        critical: COMPRESSION_CRITICAL_THRESHOLD_PCT
      }
    });
  }

  private async handleExecuteHook(payload: Record<string, unknown>) {
    const parsed = DcpExecutePayloadSchema.parse(payload);
    const usedPct = await this.resolveUsedPct(parsed);
    const mode = this.resolveMode(parsed, usedPct);
    const result = pruneContextMessages(parsed.messages, mode);

    if (
      this.options.budgetPort &&
      typeof parsed.compressionCostTokens === 'number' &&
      parsed.compressionCostTokens > 0 &&
      parsed.sessionId &&
      parsed.model
    ) {
      await this.options.budgetPort.consumeTokens({
        sessionId: parsed.sessionId,
        model: parsed.model,
        tokens: parsed.compressionCostTokens,
        reason: 'context-compression'
      });
    }

    return DcpPruneResultSchema.parse(result);
  }

  private async handleTransformHook(payload: Record<string, unknown>) {
    const parsed = DcpTransformPayloadSchema.parse(payload);
    const extractedMessages = extractTransformMessages(parsed);
    const usedPct = await this.resolveUsedPct(parsed);
    const mode = this.resolveMode(parsed, usedPct);
    const pruned = pruneContextMessages(extractedMessages, mode);
    const injection = buildSessionContextInjection(extractedMessages, pruned.messages, mode);
    const transformedMessages = injection ? injectSessionContextMessage(pruned.messages, injection) : pruned.messages;
    const systemMessage = transformedMessages.find((message) => message.role === 'system');

    return {
      mode,
      messages: transformedMessages,
      system: systemMessage?.content,
      stats: {
        originalCount: pruned.originalCount,
        retainedCount: pruned.retainedCount,
        prunedCount: pruned.prunedCount,
        tokensEstimatedSaved: pruned.tokensEstimatedSaved
      }
    };
  }

  private async resolveUsedPct(payload: DcpEvaluatePayload | DcpExecutePayload | DcpTransformPayload): Promise<number> {
    const derivedFromPayload = deriveUsedPctFromPayload(payload);
    if (derivedFromPayload > 0) {
      return derivedFromPayload;
    }

    if (!this.options.budgetPort) {
      return 0;
    }

    const withContext = payload as Partial<DcpEvaluatePayload | DcpExecutePayload>;
    if (!withContext.sessionId || !withContext.model) {
      return 0;
    }

    const status = await this.options.budgetPort.getStatus(withContext.sessionId, withContext.model);
    return status.maxTokens > 0 ? Math.min(1, Math.max(0, status.usedTokens / status.maxTokens)) : 0;
  }

  private resolveMode(payload: { readonly mode?: unknown }, usedPct: number): CompressionMode {
    const parsed = CompressionModeSchema.safeParse(payload.mode);
    return parsed.success ? parsed.data : evaluateCompressionPolicy(usedPct);
  }

  private requirePlugin(): PluginRecord {
    return z
      .object({
        manifest: z.any(),
        state: z.enum(['discovered', 'installed', 'loaded', 'enabled', 'disabled', 'error'])
      })
      .parse(this.pluginRecord) as PluginRecord;
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

function injectSessionContextMessage(messages: readonly { role: string }[], injection: Record<string, unknown>) {
  const result = [...messages] as Record<string, unknown>[];
  const insertionIndex = result.findIndex((message) => message.role !== 'system');
  if (insertionIndex === -1) {
    result.push(injection);
    return result;
  }

  result.splice(insertionIndex, 0, injection);
  return result;
}
