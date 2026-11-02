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
  AntigravityAuthConfigSchema,
  createAccountStates,
  consumeQuota,
  findAccountById,
  GetAccountHookPayloadSchema,
  isAccountAvailable,
  markRateLimited,
  parseAntigravityAuthConfig,
  RateLimitHookPayloadSchema,
  resolveCooldownSeconds,
  RotateAccountHookPayloadSchema,
  selectAccount,
  SessionRecoveryHookPayloadSchema,
  type AntigravityAccountState,
  type AntigravityAuthConfig
} from './antigravity-auth-mappings';

const DEFAULT_ANTIGRAVITY_CONFIG_PATH = '../../../../opencode-config/antigravity.json';

const HOOK_GET_ACCOUNT = 'auth.antigravity.get-account';
const HOOK_ROTATE_ACCOUNT = 'auth.antigravity.rotate-account';
const HOOK_RATE_LIMIT = 'auth.antigravity.rate-limit';
const HOOK_SESSION_RECOVERY = 'auth.antigravity.session-recovery';

interface AntigravityAuthPluginAdapterOptions {
  readonly configPath?: string;
  readonly loadConfig?: () => Promise<unknown>;
}

export class AntigravityAuthPluginAdapter extends PackageAdapter<PluginsPort> {
  public readonly name = 'antigravity-auth';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('plugins');
  public readonly required = true;

  private config?: AntigravityAuthConfig;
  private pluginRecord?: PluginRecord;
  private accounts: AntigravityAccountState[] = [];
  private sessionAssignments = new Map<string, string>();
  private rotationCursor = 0;

  public constructor(private readonly options: AntigravityAuthPluginAdapterOptions = {}) {
    super();
  }

  public async load(): Promise<void> {
    try {
      this.config = parseAntigravityAuthConfig(await this.loadConfig());
    } catch (error: unknown) {
      throw new Error(`Failed to load antigravity config: ${this.toErrorMessage(error)}`);
    }
  }

  public async initialize(): Promise<void> {
    this.config = parseAntigravityAuthConfig(await this.loadConfig());
    this.accounts = createAccountStates(this.config);
    this.rotationCursor = 0;

    this.pluginRecord = {
      manifest: {
        id: this.name,
        name: this.name,
        version: this.version,
        description: 'antigravity-auth plugin adapter',
        entrypoint: this.getConfigPath(),
        hooks: [HOOK_GET_ACCOUNT, HOOK_ROTATE_ACCOUNT, HOOK_RATE_LIMIT, HOOK_SESSION_RECOVERY],
        capabilities: ['account-rotation', 'quota-aware-routing', 'session-recovery'],
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

    const hasAvailableAccount = this.accounts.some((account) => isAccountAvailable(account));
    if (!hasAvailableAccount) {
      return Promise.resolve({ status: 'degraded', details: 'No available antigravity accounts' });
    }

    return Promise.resolve({ status: 'healthy' });
  }

  public shutdown(): Promise<void> {
    this.config = undefined;
    this.pluginRecord = undefined;
    this.accounts = [];
    this.sessionAssignments.clear();
    this.rotationCursor = 0;
    return Promise.resolve();
  }

  private createPort(): PluginsPort {
    const hasAvailableAccount = (): boolean => this.accounts.some((account) => isAccountAvailable(account));

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
          status: hasAvailableAccount() ? 'healthy' : 'degraded',
          details: hasAvailableAccount() ? undefined : 'No available antigravity accounts',
          checkedAt: new Date().toISOString()
        });
      }
    };
  }

  private handleHook(event: HookEvent): HookResult {
    try {
      if (event.name === HOOK_GET_ACCOUNT) {
        return this.handleGetAccount(event.payload);
      }

      if (event.name === HOOK_ROTATE_ACCOUNT) {
        return this.handleRotateAccount(event.payload);
      }

      if (event.name === HOOK_RATE_LIMIT) {
        return this.handleRateLimit(event.payload);
      }

      if (event.name === HOOK_SESSION_RECOVERY) {
        return this.handleSessionRecovery(event.payload);
      }

      return { pluginId: this.name, handled: false, error: `Unsupported hook: ${event.name}` };
    } catch (error: unknown) {
      return { pluginId: this.name, handled: false, error: this.toErrorMessage(error) };
    }
  }

  private handleGetAccount(payloadValue: unknown): HookResult {
    const payload = GetAccountHookPayloadSchema.parse(payloadValue);

    if (payload.sessionId && !payload.forceRotate) {
      const assigned = findAccountById(this.accounts, this.sessionAssignments.get(payload.sessionId));
      if (assigned && isAccountAvailable(assigned)) {
        return {
          pluginId: this.name,
          handled: true,
          output: {
            accountId: assigned.id,
            reusedSessionAssignment: true,
            remainingQuota: assigned.remainingQuota,
            pressure: assigned.pressure
          }
        };
      }
    }

    const config = this.requireConfig();
    const { account, nextCursor } = selectAccount(
      this.accounts,
      config.account_selection_strategy,
      this.rotationCursor
    );

    if (!account) {
      throw new Error('No available antigravity account');
    }

    this.rotationCursor = nextCursor;

    if (payload.requestedQuota > 0) {
      this.accounts = consumeQuota(this.accounts, account.id, payload.requestedQuota);
    }

    const updated = findAccountById(this.accounts, account.id) ?? account;
    if (payload.sessionId) {
      this.sessionAssignments.set(payload.sessionId, updated.id);
    }

    return {
      pluginId: this.name,
      handled: true,
      output: {
        accountId: updated.id,
        strategy: config.account_selection_strategy,
        remainingQuota: updated.remainingQuota,
        pressure: updated.pressure
      }
    };
  }

  private handleRotateAccount(payloadValue: unknown): HookResult {
    const payload = RotateAccountHookPayloadSchema.parse(payloadValue);
    const config = this.requireConfig();

    const currentAccountId =
      payload.currentAccountId ?? (payload.sessionId ? this.sessionAssignments.get(payload.sessionId) : undefined);
    const candidateAccounts = this.accounts.filter(
      (account) => account.id !== currentAccountId && isAccountAvailable(account)
    );

    let account = selectAccount(candidateAccounts, config.account_selection_strategy, this.rotationCursor).account;
    account ??= selectAccount(this.accounts, config.account_selection_strategy, this.rotationCursor).account;

    if (!account) {
      throw new Error('No account available for rotation');
    }

    if (payload.sessionId) {
      this.sessionAssignments.set(payload.sessionId, account.id);
    }

    return {
      pluginId: this.name,
      handled: true,
      output: {
        previousAccountId: currentAccountId,
        accountId: account.id,
        reason: payload.reason ?? 'manual-rotation'
      }
    };
  }

  private handleRateLimit(payloadValue: unknown): HookResult {
    const payload = RateLimitHookPayloadSchema.parse(payloadValue);
    const config = this.requireConfig();

    const cooldownSeconds = resolveCooldownSeconds(payload, config);
    this.accounts = markRateLimited(this.accounts, payload.accountId, cooldownSeconds);

    let rotatedAccountId: string | undefined;
    if (config.switch_on_first_rate_limit) {
      const result = this.handleRotateAccount({
        sessionId: payload.sessionId,
        currentAccountId: payload.accountId,
        reason: 'rate-limit'
      });
      if (result.handled && typeof result.output === 'object' && result.output !== null) {
        const output = result.output as Record<string, unknown>;
        rotatedAccountId = typeof output.accountId === 'string' ? output.accountId : undefined;
      }
    }

    return {
      pluginId: this.name,
      handled: true,
      output: {
        accountId: payload.accountId,
        cooldownSeconds,
        rotatedAccountId,
        switched: Boolean(rotatedAccountId)
      }
    };
  }

  private handleSessionRecovery(payloadValue: unknown): HookResult {
    const payload = SessionRecoveryHookPayloadSchema.parse(payloadValue);
    const config = this.requireConfig();

    if (!config.session_recovery) {
      return {
        pluginId: this.name,
        handled: true,
        output: {
          recovered: false,
          reason: 'session_recovery_disabled'
        }
      };
    }

    const preferred = findAccountById(this.accounts, payload.preferredAccountId);
    const previous = findAccountById(this.accounts, payload.previousAccountId);

    const recovered =
      (preferred && isAccountAvailable(preferred) ? preferred : undefined) ??
      (previous && isAccountAvailable(previous) ? previous : undefined) ??
      selectAccount(this.accounts, config.account_selection_strategy, this.rotationCursor).account;

    if (!recovered) {
      throw new Error('Unable to recover session account');
    }

    this.sessionAssignments.set(payload.sessionId, recovered.id);
    return {
      pluginId: this.name,
      handled: true,
      output: {
        recovered: true,
        sessionId: payload.sessionId,
        accountId: recovered.id
      }
    };
  }

  private requirePlugin(): PluginRecord {
    return z
      .object({
        manifest: z.any(),
        state: z.enum(['discovered', 'installed', 'loaded', 'enabled', 'disabled', 'error'])
      })
      .parse(this.pluginRecord) as PluginRecord;
  }

  private requireConfig(): AntigravityAuthConfig {
    return AntigravityAuthConfigSchema.parse(this.config);
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
