import { readFile } from 'node:fs/promises';

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
  buildUsageKey,
  CheckQuotaHookPayloadSchema,
  computeUsageAggregate,
  detectUsagePattern,
  evaluateQuotaStatus,
  filterUsageRecords,
  GetReportHookPayloadSchema,
  GetUsageHookPayloadSchema,
  parseTokenMonitorConfig,
  RecordTokensHookPayloadSchema,
  toTokenUsageRecord,
  type TokenMonitorConfig,
  type TokenUsageRecord
} from './token-monitor-mappings';

const DEFAULT_CONFIG_PATH = '../../../../opencode-config/opencode.json';

const HOOK_RECORD = 'tokens.record';
const HOOK_GET_USAGE = 'tokens.get-usage';
const HOOK_GET_REPORT = 'tokens.get-report';
const HOOK_CHECK_QUOTA = 'tokens.check-quota';

interface TokenMonitorPluginAdapterOptions {
  readonly configPath?: string;
  readonly loadConfig?: () => Promise<unknown>;
  readonly now?: () => Date;
}

export class TokenMonitorPluginAdapter extends PackageAdapter<PluginsPort> {
  public readonly name = 'token-monitor';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('plugins');
  public readonly required = true;

  private config?: TokenMonitorConfig;
  private pluginRecord?: PluginRecord;
  private records: TokenUsageRecord[] = [];
  private sessionTotals = new Map<string, number>();
  private modelTotals = new Map<string, number>();
  private sessionModelTotals = new Map<string, number>();

  public constructor(private readonly options: TokenMonitorPluginAdapterOptions = {}) {
    super();
  }

  public async load(): Promise<void> {
    try {
      this.config = parseTokenMonitorConfig(await this.loadConfig());
    } catch (error: unknown) {
      throw new Error(`Failed to load token-monitor config: ${this.toErrorMessage(error)}`);
    }
  }

  public async initialize(): Promise<void> {
    this.config = parseTokenMonitorConfig(await this.loadConfig());
    this.records = [];
    this.sessionTotals.clear();
    this.modelTotals.clear();
    this.sessionModelTotals.clear();

    this.pluginRecord = {
      manifest: {
        id: this.name,
        name: this.name,
        version: this.version,
        description: 'token-monitor plugin adapter',
        entrypoint: this.getConfigPath(),
        hooks: [HOOK_RECORD, HOOK_GET_USAGE, HOOK_GET_REPORT, HOOK_CHECK_QUOTA],
        capabilities: ['token-tracking', 'usage-analytics', 'pattern-detection', 'quota-enforcement'],
        requiredPermissions: []
      },
      state: 'enabled',
      loadedAt: this.now().toISOString()
    };

    this.setPort(this.createPort());
  }

  public healthCheck(): Promise<AdapterHealthInput> {
    if (!this.pluginRecord || !this.config) {
      return Promise.resolve({ status: 'unhealthy', details: 'Plugin adapter is not initialized' });
    }

    if (this.records.length === 0) {
      return Promise.resolve({ status: 'degraded', details: 'No token usage recorded yet' });
    }

    return Promise.resolve({ status: 'healthy' });
  }

  public shutdown(): Promise<void> {
    this.config = undefined;
    this.pluginRecord = undefined;
    this.records = [];
    this.sessionTotals.clear();
    this.modelTotals.clear();
    this.sessionModelTotals.clear();
    return Promise.resolve();
  }

  private createPort(): PluginsPort {
    return {
      listPlugins: () => Promise.resolve(this.pluginRecord ? [this.pluginRecord] : []),
      installPlugin: (_request: PluginInstallRequest): Promise<PluginManifest> => Promise.resolve(this.requirePlugin().manifest),
      uninstallPlugin: (_pluginId: string) => {
        this.pluginRecord = undefined;
        return Promise.resolve();
      },
      loadPlugin: (_pluginId: string) => Promise.resolve(),
      unloadPlugin: (_pluginId: string) => Promise.resolve(),
      enablePlugin: (_pluginId: string) => {
        this.requirePlugin().state = 'enabled';
        return Promise.resolve();
      },
      disablePlugin: (_pluginId: string) => {
        this.requirePlugin().state = 'disabled';
        return Promise.resolve();
      },
      runHook: (event: HookEvent): Promise<HookResult[]> => Promise.resolve([this.handleHook(event)]),
      getPluginHealth: (_pluginId: string): Promise<PluginHealth> =>
        Promise.resolve({
          pluginId: this.name,
          status: this.records.length > 0 ? 'healthy' : this.pluginRecord ? 'degraded' : 'unhealthy',
          details: this.pluginRecord ? (this.records.length > 0 ? undefined : 'No usage data collected') : 'Plugin not initialized',
          checkedAt: this.now().toISOString()
        })
    };
  }

  private handleHook(event: HookEvent): HookResult {
    try {
      if (event.name === HOOK_RECORD) {
        return this.handleRecord(event.payload);
      }

      if (event.name === HOOK_GET_USAGE) {
        return this.handleGetUsage(event.payload);
      }

      if (event.name === HOOK_GET_REPORT) {
        return this.handleGetReport(event.payload);
      }

      if (event.name === HOOK_CHECK_QUOTA) {
        return this.handleCheckQuota(event.payload);
      }

      return { pluginId: this.name, handled: false, error: `Unsupported hook: ${event.name}` };
    } catch (error: unknown) {
      return { pluginId: this.name, handled: false, error: this.toErrorMessage(error) };
    }
  }

  private handleRecord(payloadValue: unknown): HookResult {
    const payload = RecordTokensHookPayloadSchema.parse(payloadValue);
    const record = toTokenUsageRecord(payload, this.now().toISOString());

    this.records.push(record);
    this.incrementCounter(this.sessionTotals, record.sessionId, record.totalTokens);
    this.incrementCounter(this.modelTotals, record.model, record.totalTokens);
    this.incrementCounter(this.sessionModelTotals, buildUsageKey(record.sessionId, record.model), record.totalTokens);

    const config = this.requireConfig();
    const series = this.records.filter(
      (candidate) => candidate.sessionId === record.sessionId && candidate.model === record.model
    );
    const pattern = detectUsagePattern(series, config);

    const quota = this.resolveQuota({
      sessionId: record.sessionId,
      model: record.model,
      customQuota: undefined
    });

    return {
      pluginId: this.name,
      handled: true,
      output: {
        recorded: true,
        record,
        totals: {
          sessionTokens: this.sessionTotals.get(record.sessionId) ?? 0,
          modelTokens: this.modelTotals.get(record.model) ?? 0,
          sessionModelTokens: this.sessionModelTotals.get(buildUsageKey(record.sessionId, record.model)) ?? 0
        },
        pattern,
        quota
      }
    };
  }

  private handleGetUsage(payloadValue: unknown): HookResult {
    const payload = GetUsageHookPayloadSchema.parse(payloadValue);
    const records = filterUsageRecords(this.records, payload);
    const aggregate = computeUsageAggregate(records);

    return {
      pluginId: this.name,
      handled: true,
      output: {
        scope: {
          sessionId: payload.sessionId,
          model: payload.model,
          since: payload.since,
          until: payload.until
        },
        usage: aggregate,
        recordsCount: records.length
      }
    };
  }

  private handleGetReport(payloadValue: unknown): HookResult {
    const payload = GetReportHookPayloadSchema.parse(payloadValue);
    const records = filterUsageRecords(this.records, payload);

    const bySession = this.topTotals(
      this.groupTotals(records, (record) => record.sessionId),
      payload.topN
    ).map(([sessionId, totalTokens]) => ({ sessionId, totalTokens }));

    const byModel = this.topTotals(
      this.groupTotals(records, (record) => record.model),
      payload.topN
    ).map(([model, totalTokens]) => ({ model, totalTokens }));

    const pattern = detectUsagePattern(records, this.requireConfig());

    return {
      pluginId: this.name,
      handled: true,
      output: {
        generatedAt: this.now().toISOString(),
        scope: {
          sessionId: payload.sessionId,
          model: payload.model,
          since: payload.since,
          until: payload.until
        },
        overall: computeUsageAggregate(records),
        bySession,
        byModel,
        alerts: pattern ? [pattern] : []
      }
    };
  }

  private handleCheckQuota(payloadValue: unknown): HookResult {
    const payload = CheckQuotaHookPayloadSchema.parse(payloadValue);
    const quota = this.resolveQuota({
      sessionId: payload.sessionId,
      model: payload.model,
      customQuota: payload.quota
    });

    return {
      pluginId: this.name,
      handled: true,
      output: {
        sessionId: payload.sessionId,
        model: payload.model,
        ...quota,
        status: quota.exceeded ? 'exceeded' : quota.utilization >= 0.9 ? 'near-limit' : 'ok'
      }
    };
  }

  private resolveQuota(input: {
    readonly sessionId: string;
    readonly model?: string;
    readonly customQuota?: number;
  }) {
    const config = this.requireConfig();

    if (typeof input.customQuota === 'number') {
      const used = input.model
        ? this.sessionModelTotals.get(buildUsageKey(input.sessionId, input.model)) ?? 0
        : this.sessionTotals.get(input.sessionId) ?? 0;

      return evaluateQuotaStatus({
        scope: 'custom',
        used,
        limit: input.customQuota
      });
    }

    const modelQuota = input.model ? config.modelQuotas[input.model] : undefined;
    if (input.model && typeof modelQuota === 'number') {
      const used = this.modelTotals.get(input.model) ?? 0;
      return evaluateQuotaStatus({
        scope: 'model',
        used,
        limit: modelQuota
      });
    }

    return evaluateQuotaStatus({
      scope: 'session',
      used: this.sessionTotals.get(input.sessionId) ?? 0,
      limit: config.defaultSessionQuota
    });
  }

  private groupTotals(records: readonly TokenUsageRecord[], keyOf: (record: TokenUsageRecord) => string): Map<string, number> {
    const totals = new Map<string, number>();
    for (const record of records) {
      const key = keyOf(record);
      totals.set(key, (totals.get(key) ?? 0) + record.totalTokens);
    }
    return totals;
  }

  private topTotals(totals: ReadonlyMap<string, number>, topN: number): [string, number][] {
    return [...totals.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, topN);
  }

  private incrementCounter(store: Map<string, number>, key: string, value: number): void {
    store.set(key, (store.get(key) ?? 0) + value);
  }

  private requirePlugin(): PluginRecord {
    return z
      .object({
        manifest: z.any(),
        state: z.enum(['discovered', 'installed', 'loaded', 'enabled', 'disabled', 'error'])
      })
      .parse(this.pluginRecord) as PluginRecord;
  }

  private requireConfig(): TokenMonitorConfig {
    return z
      .object({
        defaultSessionQuota: z.number().int().positive(),
        modelQuotas: z.record(z.string(), z.number().int().positive()),
        patternDetection: z.object({
          spikeMultiplier: z.number().positive(),
          minSamples: z.number().int().min(2)
        })
      })
      .parse(this.config);
  }

  private async loadConfig(): Promise<unknown> {
    if (this.options.loadConfig) return this.options.loadConfig();
    return JSON.parse(await readFile(this.getConfigPath(), 'utf8')) as unknown;
  }

  private getConfigPath(): string {
    return this.options.configPath ?? DEFAULT_CONFIG_PATH;
  }

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
