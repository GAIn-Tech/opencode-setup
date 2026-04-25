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
  mergeNotifierConfig,
  normalizePlatform,
  NotifyClearHistoryPayloadSchema,
  NotifyConfigurePayloadSchema,
  NotifyGetHistoryPayloadSchema,
  NotifySendPayloadSchema,
  parseNotifierConfig,
  shouldDispatchNotification,
  trimHistory,
  type NotificationRecord,
  type NotifierConfig,
  type NotificationPlatform
} from './notifier-mappings';

const DEFAULT_CONFIG_PATH = '../../../../opencode-config/opencode.json';

const HOOK_NOTIFY_SEND = 'notify.send';
const HOOK_NOTIFY_CONFIGURE = 'notify.configure';
const HOOK_NOTIFY_GET_HISTORY = 'notify.get-history';
const HOOK_NOTIFY_CLEAR_HISTORY = 'notify.clear-history';

interface NotifierPluginAdapterOptions {
  readonly configPath?: string;
  readonly loadConfig?: () => Promise<unknown>;
  readonly getPlatform?: () => string;
  readonly dispatchNotification?: (notification: NotificationDispatchRequest) => Promise<void> | void;
  readonly now?: () => Date;
  readonly createId?: () => string;
}

interface NotificationDispatchRequest {
  readonly id: string;
  readonly event: string;
  readonly title: string;
  readonly message: string;
  readonly level: 'info' | 'success' | 'warning' | 'error';
  readonly platform: NotificationPlatform;
  readonly metadata?: Record<string, unknown>;
}

export class NotifierPluginAdapter extends PackageAdapter<PluginsPort> {
  public readonly name = 'notifier';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('plugins');
  public readonly required = true;

  private config?: NotifierConfig;
  private pluginRecord?: PluginRecord;
  private history: NotificationRecord[] = [];

  public constructor(private readonly options: NotifierPluginAdapterOptions = {}) {
    super();
  }

  public async load(): Promise<void> {
    try {
      this.config = parseNotifierConfig(await this.loadConfig());
    } catch (error: unknown) {
      throw new Error(`Failed to load notifier config: ${this.toErrorMessage(error)}`);
    }
  }

  public async initialize(): Promise<void> {
    this.config = parseNotifierConfig(await this.loadConfig());
    this.history = [];

    this.pluginRecord = {
      manifest: {
        id: this.name,
        name: this.name,
        version: this.version,
        description: 'notifier plugin adapter',
        entrypoint: this.getConfigPath(),
        hooks: [HOOK_NOTIFY_SEND, HOOK_NOTIFY_CONFIGURE, HOOK_NOTIFY_GET_HISTORY, HOOK_NOTIFY_CLEAR_HISTORY],
        capabilities: ['os-notifications', 'notification-rules', 'notification-history'],
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

    if (this.config.historyLimit <= 0) {
      return Promise.resolve({ status: 'degraded', details: 'Notification history limit is invalid' });
    }

    return Promise.resolve({ status: 'healthy' });
  }

  public shutdown(): Promise<void> {
    this.config = undefined;
    this.pluginRecord = undefined;
    this.history = [];
    return Promise.resolve();
  }

  private createPort(): PluginsPort {
    return {
      listPlugins: async () => (this.pluginRecord ? [this.pluginRecord] : []),
      installPlugin: async (_request: PluginInstallRequest): Promise<PluginManifest> => this.requirePlugin().manifest,
      uninstallPlugin: async () => {
        this.pluginRecord = undefined;
      },
      loadPlugin: async () => {},
      unloadPlugin: async () => {},
      enablePlugin: async () => {
        this.requirePlugin().state = 'enabled';
      },
      disablePlugin: async () => {
        this.requirePlugin().state = 'disabled';
      },
      runHook: async (event: HookEvent): Promise<HookResult[]> => [this.handleHook(event)],
      getPluginHealth: async (_pluginId: string): Promise<PluginHealth> => ({
        pluginId: this.name,
        status: this.pluginRecord && this.config ? 'healthy' : 'unhealthy',
        details: this.pluginRecord && this.config ? undefined : 'Plugin not initialized',
        checkedAt: new Date().toISOString()
      })
    };
  }

  private handleHook(event: HookEvent): HookResult {
    try {
      if (event.name === HOOK_NOTIFY_SEND) {
        return this.handleSend(event.payload);
      }

      if (event.name === HOOK_NOTIFY_CONFIGURE) {
        return this.handleConfigure(event.payload);
      }

      if (event.name === HOOK_NOTIFY_GET_HISTORY) {
        return this.handleGetHistory(event.payload);
      }

      if (event.name === HOOK_NOTIFY_CLEAR_HISTORY) {
        return this.handleClearHistory(event.payload);
      }

      return { pluginId: this.name, handled: false, error: `Unsupported hook: ${event.name}` };
    } catch (error: unknown) {
      return { pluginId: this.name, handled: false, error: this.toErrorMessage(error) };
    }
  }

  private handleSend(payloadValue: unknown): HookResult {
    const payload = NotifySendPayloadSchema.parse(payloadValue);
    const config = this.requireConfig();
    const platform = normalizePlatform(this.getPlatform());
    const title = payload.title ?? config.defaultTitle;
    const ruleDecision = shouldDispatchNotification({
      event: payload.event,
      level: payload.level,
      rules: config.rules
    });

    const id = this.createNotificationId();
    const createdAt = this.now().toISOString();
    const request: NotificationDispatchRequest = {
      id,
      event: payload.event,
      title,
      message: payload.message,
      level: payload.level,
      platform,
      metadata: payload.metadata
    };

    let dispatched = false;
    let reason = ruleDecision.reason;

    if (ruleDecision.dispatch) {
      this.dispatchNotification(request);
      dispatched = true;
      reason = undefined;
    }

    const record: NotificationRecord = {
      id,
      event: payload.event,
      title,
      message: payload.message,
      level: payload.level,
      platform,
      metadata: payload.metadata,
      dispatched,
      reason,
      ruleId: ruleDecision.ruleId,
      createdAt
    };

    this.history = trimHistory([...this.history, record], config.historyLimit);

    return {
      pluginId: this.name,
      handled: true,
      output: {
        id,
        dispatched,
        reason,
        event: payload.event,
        platform,
        ruleId: ruleDecision.ruleId,
        createdAt
      }
    };
  }

  private handleConfigure(payloadValue: unknown): HookResult {
    const payload = NotifyConfigurePayloadSchema.parse(payloadValue);
    const nextConfig = mergeNotifierConfig(this.requireConfig(), payload);
    this.config = nextConfig;
    this.history = trimHistory(this.history, nextConfig.historyLimit);

    return {
      pluginId: this.name,
      handled: true,
      output: {
        defaultTitle: nextConfig.defaultTitle,
        historyLimit: nextConfig.historyLimit,
        ruleCount: nextConfig.rules.length
      }
    };
  }

  private handleGetHistory(payloadValue: unknown): HookResult {
    const payload = NotifyGetHistoryPayloadSchema.parse(payloadValue);

    const filtered = payload.event ? this.history.filter((entry) => entry.event === payload.event) : this.history;
    const limited = typeof payload.limit === 'number' ? filtered.slice(Math.max(0, filtered.length - payload.limit)) : filtered;

    return {
      pluginId: this.name,
      handled: true,
      output: {
        count: limited.length,
        history: limited
      }
    };
  }

  private handleClearHistory(payloadValue: unknown): HookResult {
    const payload = NotifyClearHistoryPayloadSchema.parse(payloadValue);

    if (!payload.event) {
      const cleared = this.history.length;
      this.history = [];
      return {
        pluginId: this.name,
        handled: true,
        output: {
          cleared,
          remaining: 0
        }
      };
    }

    const before = this.history.length;
    this.history = this.history.filter((entry) => entry.event !== payload.event);
    const cleared = before - this.history.length;

    return {
      pluginId: this.name,
      handled: true,
      output: {
        event: payload.event,
        cleared,
        remaining: this.history.length
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

  private requireConfig(): NotifierConfig {
    return z
      .object({
        defaultTitle: z.string().min(1),
        historyLimit: z.number().int().positive(),
        rules: z.array(
          z.object({
            id: z.string().min(1),
            enabled: z.boolean(),
            event: z.string().min(1),
            levels: z.array(z.enum(['info', 'success', 'warning', 'error'])).optional()
          })
        )
      })
      .parse(this.config) as NotifierConfig;
  }

  private async loadConfig(): Promise<unknown> {
    if (this.options.loadConfig) return this.options.loadConfig();
    const raw = await readFile(this.getConfigPath(), 'utf8');
    return JSON.parse(raw) as unknown;
  }

  private getConfigPath(): string {
    return this.options.configPath ?? DEFAULT_CONFIG_PATH;
  }

  private getPlatform(): string {
    if (this.options.getPlatform) return this.options.getPlatform();
    return process.platform;
  }

  private dispatchNotification(notification: NotificationDispatchRequest): void {
    if (!this.options.dispatchNotification) return;
    void this.options.dispatchNotification(notification);
  }

  private now(): Date {
    if (this.options.now) return this.options.now();
    return new Date();
  }

  private createNotificationId(): string {
    if (this.options.createId) return this.options.createId();
    return `${Date.now()}-${this.history.length + 1}`;
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
