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
  aggregateQuota,
  AntigravityQuotaConfigSchema,
  appendUsageHistory,
  buildQuotaDistribution,
  buildQuotaThresholdAlerts,
  CheckQuotaThresholdsHookPayloadSchema,
  createQuotaAccountStates,
  findQuotaAccountById,
  GetQuotaHistoryHookPayloadSchema,
  GetQuotaStatusHookPayloadSchema,
  getQuotaHistory,
  ListQuotaAccountsHookPayloadSchema,
  normalizeThresholds,
  parseAntigravityQuotaConfig,
  recordQuotaUsage,
  type AntigravityQuotaAccountState,
  type AntigravityQuotaConfig,
  type QuotaUsageHistoryEntry
} from './antigravity-quota-mappings';

const DEFAULT_ANTIGRAVITY_CONFIG_PATH = '../../../../opencode-config/antigravity.json';

const HOOK_GET_STATUS = 'quota.get-status';
const HOOK_LIST_ACCOUNTS = 'quota.list-accounts';
const HOOK_GET_HISTORY = 'quota.get-history';
const HOOK_CHECK_THRESHOLDS = 'quota.check-thresholds';

interface AntigravityQuotaPluginAdapterOptions {
  readonly configPath?: string;
  readonly loadConfig?: () => Promise<unknown>;
}

export class AntigravityQuotaPluginAdapter extends PackageAdapter<PluginsPort> {
  public readonly name = 'antigravity-quota';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('plugins');
  public readonly required = true;

  private config?: AntigravityQuotaConfig;
  private pluginRecord?: PluginRecord;
  private accounts: AntigravityQuotaAccountState[] = [];
  private usageHistory: QuotaUsageHistoryEntry[] = [];

  public constructor(private readonly options: AntigravityQuotaPluginAdapterOptions = {}) {
    super();
  }

  public async load(): Promise<void> {
    try {
      this.config = parseAntigravityQuotaConfig(await this.loadConfig());
    } catch (error: unknown) {
      throw new Error(`Failed to load antigravity quota config: ${this.toErrorMessage(error)}`);
    }
  }

  public async initialize(): Promise<void> {
    this.config = parseAntigravityQuotaConfig(await this.loadConfig());
    this.accounts = createQuotaAccountStates(this.config);
    this.usageHistory = [];

    this.pluginRecord = {
      manifest: {
        id: this.name,
        name: this.name,
        version: this.version,
        description: 'antigravity-quota plugin adapter',
        entrypoint: this.getConfigPath(),
        hooks: [HOOK_GET_STATUS, HOOK_LIST_ACCOUNTS, HOOK_GET_HISTORY, HOOK_CHECK_THRESHOLDS],
        capabilities: ['quota-visibility', 'multi-account-aggregation', 'quota-threshold-alerts'],
        requiredPermissions: []
      },
      state: 'enabled',
      loadedAt: new Date().toISOString()
    };

    this.setPort(this.createPort());
  }

  public healthCheck(): Promise<AdapterHealthInput> {
    if (!this.pluginRecord || !this.config) {
      return Promise.resolve({ status: 'unhealthy', details: 'Plugin adapter is not initialized' });
    }

    const enabledAccounts = this.accounts.filter((account) => !account.disabled);
    if (enabledAccounts.length === 0) {
      return Promise.resolve({ status: 'degraded', details: 'No enabled antigravity accounts for quota tracking' });
    }

    return Promise.resolve({ status: 'healthy' });
  }

  public shutdown(): Promise<void> {
    this.config = undefined;
    this.pluginRecord = undefined;
    this.accounts = [];
    this.usageHistory = [];
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
          status: this.accounts.some((account) => !account.disabled) ? 'healthy' : 'degraded',
          details:
            this.accounts.some((account) => !account.disabled) ? undefined : 'No enabled antigravity accounts found',
          checkedAt: new Date().toISOString()
        });
      }
    };
  }

  private handleHook(event: HookEvent): HookResult {
    try {
      if (event.name === HOOK_GET_STATUS) {
        return this.handleGetStatus(event.payload);
      }

      if (event.name === HOOK_LIST_ACCOUNTS) {
        return this.handleListAccounts(event.payload);
      }

      if (event.name === HOOK_GET_HISTORY) {
        return this.handleGetHistory(event.payload);
      }

      if (event.name === HOOK_CHECK_THRESHOLDS) {
        return this.handleCheckThresholds(event.payload);
      }

      return { pluginId: this.name, handled: false, error: `Unsupported hook: ${event.name}` };
    } catch (error: unknown) {
      return { pluginId: this.name, handled: false, error: this.toErrorMessage(error) };
    }
  }

  private handleGetStatus(payloadValue: unknown): HookResult {
    const payload = GetQuotaStatusHookPayloadSchema.parse(payloadValue);

    if (payload.reportedUsage) {
      if (!payload.accountId) {
        throw new Error('accountId is required when reportedUsage is provided');
      }
      this.applyUsage(payload.accountId, payload.reportedUsage.amount, payload.reportedUsage.source);
    }

    const account = findQuotaAccountById(this.accounts, payload.accountId);
    if (payload.accountId && !account) {
      throw new Error(`Unknown account: ${payload.accountId}`);
    }

    const aggregate = aggregateQuota(this.accounts);
    const distribution = buildQuotaDistribution(this.accounts);

    return {
      pluginId: this.name,
      handled: true,
      output: {
        account: account
          ? {
              accountId: account.id,
              quotaLimit: account.quotaLimit,
              quotaUsed: account.quotaUsed,
              remainingQuota: account.remainingQuota,
              utilizationPercent: account.utilizationPercent,
              disabled: account.disabled,
              metadata: account.metadata
            }
          : undefined,
        aggregate: payload.includeAggregate ? aggregate : undefined,
        distribution: payload.includeDistribution ? distribution : undefined,
        checkedAt: new Date().toISOString()
      }
    };
  }

  private handleListAccounts(payloadValue: unknown): HookResult {
    const payload = ListQuotaAccountsHookPayloadSchema.parse(payloadValue);

    let accounts = payload.includeDisabled ? [...this.accounts] : this.accounts.filter((account) => !account.disabled);
    if (payload.sortBy === 'usage') {
      accounts = [...accounts].sort((left, right) => right.utilizationPercent - left.utilizationPercent);
    } else if (payload.sortBy === 'remaining') {
      accounts = [...accounts].sort((left, right) => left.remainingQuota - right.remainingQuota);
    } else {
      accounts = [...accounts].sort((left, right) => left.id.localeCompare(right.id));
    }

    return {
      pluginId: this.name,
      handled: true,
      output: {
        accounts: accounts.map((account) => ({
          accountId: account.id,
          quotaLimit: account.quotaLimit,
          quotaUsed: account.quotaUsed,
          remainingQuota: account.remainingQuota,
          utilizationPercent: account.utilizationPercent,
          disabled: account.disabled,
          metadata: account.metadata
        })),
        aggregate: aggregateQuota(accounts),
        listedAt: new Date().toISOString()
      }
    };
  }

  private handleGetHistory(payloadValue: unknown): HookResult {
    const payload = GetQuotaHistoryHookPayloadSchema.parse(payloadValue);
    if (payload.accountId && !findQuotaAccountById(this.accounts, payload.accountId)) {
      throw new Error(`Unknown account: ${payload.accountId}`);
    }

    const events = getQuotaHistory(this.usageHistory, {
      accountId: payload.accountId,
      limit: payload.limit
    });

    return {
      pluginId: this.name,
      handled: true,
      output: {
        accountId: payload.accountId,
        totalEvents: events.length,
        events
      }
    };
  }

  private handleCheckThresholds(payloadValue: unknown): HookResult {
    const payload = CheckQuotaThresholdsHookPayloadSchema.parse(payloadValue);
    const config = this.requireConfig();
    const thresholds = normalizeThresholds(
      payload.warningPercent ?? config.thresholds.warningPercent,
      payload.criticalPercent ?? config.thresholds.criticalPercent
    );

    const accounts = payload.accountId
      ? this.accounts.filter((account) => account.id === payload.accountId)
      : [...this.accounts];

    if (payload.accountId && accounts.length === 0) {
      throw new Error(`Unknown account: ${payload.accountId}`);
    }

    const alerts = buildQuotaThresholdAlerts(accounts, thresholds.warningPercent, thresholds.criticalPercent);

    return {
      pluginId: this.name,
      handled: true,
      output: {
        warningPercent: thresholds.warningPercent,
        criticalPercent: thresholds.criticalPercent,
        hasAlerts: alerts.length > 0,
        criticalCount: alerts.filter((alert) => alert.level === 'critical').length,
        warningCount: alerts.filter((alert) => alert.level === 'warning').length,
        alerts,
        checkedAt: new Date().toISOString()
      }
    };
  }

  private applyUsage(accountId: string, amount: number, source?: string): void {
    const config = this.requireConfig();
    const result = recordQuotaUsage(this.accounts, accountId, amount, source ?? 'antigravity-auth');
    this.accounts = result.accounts;
    this.usageHistory = appendUsageHistory(this.usageHistory, result.entry, config.historyLimit);
  }

  private requirePlugin(): PluginRecord {
    return z
      .object({
        manifest: z.any(),
        state: z.enum(['discovered', 'installed', 'loaded', 'enabled', 'disabled', 'error'])
      })
      .parse(this.pluginRecord) as PluginRecord;
  }

  private requireConfig(): AntigravityQuotaConfig {
    return AntigravityQuotaConfigSchema.parse(this.config);
  }

  private async loadConfig(): Promise<unknown> {
    if (this.options.loadConfig) return this.options.loadConfig();
    return JSON.parse(await readFile(this.getConfigPath(), 'utf8')) as unknown;
  }

  private getConfigPath(): string {
    return this.options.configPath ?? DEFAULT_ANTIGRAVITY_CONFIG_PATH;
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
