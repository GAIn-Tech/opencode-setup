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
  classifyCommandRisk,
  DEFAULT_SAFETY_POLICY,
  normalizeCommand,
  resolveSafetyDecision,
  SafetyAuditPayloadSchema,
  SafetyAuditRecordSchema,
  SafetyCheckRiskPayloadSchema,
  SafetyConfirmPayloadSchema,
  SafetyHookNameSchema,
  SafetyPolicySchema,
  SafetyValidateCommandPayloadSchema,
  type SafetyAuditRecord,
  type SafetyPolicy
} from './safety-net-mappings';

export interface SafetyNetPluginAdapterOptions {
  readonly policy?: SafetyPolicy;
  readonly maxAuditEntries?: number;
}

export class SafetyNetPluginAdapter extends PackageAdapter<PluginsPort> {
  public readonly name = 'safety-net';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('plugins');
  public readonly required = true;

  private pluginRecord?: PluginRecord;
  private policy: SafetyPolicy = DEFAULT_SAFETY_POLICY;
  private auditLog: SafetyAuditRecord[] = [];

  public constructor(private readonly options: SafetyNetPluginAdapterOptions = {}) {
    super();
  }

  public load(): Promise<void> {
    this.policy = SafetyPolicySchema.parse(this.options.policy ?? DEFAULT_SAFETY_POLICY);
    return Promise.resolve();
  }

  public initialize(): Promise<void> {
    this.policy = SafetyPolicySchema.parse(this.options.policy ?? DEFAULT_SAFETY_POLICY);
    this.auditLog = [];

    this.pluginRecord = {
      manifest: {
        id: this.name,
        name: this.name,
        version: this.version,
        description: 'safety-net plugin adapter',
        entrypoint: './src/adapters/plugins/safety-net.ts',
        hooks: ['safety.validate-command', 'safety.check-risk', 'safety.confirm', 'safety.audit'],
        capabilities: ['destructive-command-blocking', 'risk-classification', 'safety-guardrails', 'audit-logging'],
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

    if (this.policy.blocklist.length === 0) {
      return Promise.resolve({ status: 'degraded', details: 'No blocklist patterns configured' });
    }

    return Promise.resolve({ status: 'healthy' });
  }

  public shutdown(): Promise<void> {
    this.pluginRecord = undefined;
    this.auditLog = [];
    return Promise.resolve();
  }

  private createPort(): PluginsPort {
    return {
      listPlugins: async () => (this.pluginRecord ? [this.pluginRecord] : []),
      installPlugin: async (_request: PluginInstallRequest): Promise<PluginManifest> => this.requirePlugin().manifest,
      uninstallPlugin: async () => {
        this.pluginRecord = undefined;
      },
      loadPlugin: () => Promise.resolve(),
      unloadPlugin: () => Promise.resolve(),
      enablePlugin: async () => {
        this.requirePlugin().state = 'enabled';
      },
      disablePlugin: async () => {
        this.requirePlugin().state = 'disabled';
      },
      runHook: async (event: HookEvent): Promise<HookResult[]> => [this.handleHook(event)],
      getPluginHealth: async (_pluginId: string): Promise<PluginHealth> => ({
        pluginId: this.name,
        status: this.pluginRecord ? 'healthy' : 'unhealthy',
        details: this.pluginRecord ? `auditEntries=${this.auditLog.length}` : 'Plugin not initialized',
        checkedAt: new Date().toISOString()
      })
    };
  }

  private handleHook(event: HookEvent): HookResult {
    const hookName = SafetyHookNameSchema.safeParse(event.name);
    if (!hookName.success) {
      return { pluginId: this.name, handled: false, error: `Unsupported hook: ${event.name}` };
    }

    try {
      if (hookName.data === 'safety.check-risk') {
        const payload = SafetyCheckRiskPayloadSchema.parse(event.payload);
        const command = normalizeCommand(payload.command, payload.args);
        const output = classifyCommandRisk(command, this.policy);
        return { pluginId: this.name, handled: true, output };
      }

      if (hookName.data === 'safety.validate-command') {
        const payload = SafetyValidateCommandPayloadSchema.parse(event.payload);
        const command = normalizeCommand(payload.command, payload.args);
        const classification = classifyCommandRisk(command, this.policy);
        const decision = resolveSafetyDecision({
          command,
          risk: classification.risk,
          confirmed: payload.confirmed,
          bypass: payload.bypass,
          automation: payload.automation
        });

        const auditRecord = this.appendAudit({
          command,
          risk: decision.risk,
          decision: decision.decision,
          reason: decision.reason,
          metadata: {
            matchedBy: classification.matchedBy,
            matchedRules: [...classification.matchedRules]
          }
        });

        return {
          pluginId: this.name,
          handled: true,
          output: {
            ...decision,
            matchedBy: classification.matchedBy,
            matchedRules: classification.matchedRules,
            audit: auditRecord
          }
        };
      }

      if (hookName.data === 'safety.confirm') {
        const payload = SafetyConfirmPayloadSchema.parse(event.payload);
        const decision = resolveSafetyDecision({
          command: payload.command,
          risk: payload.risk,
          confirmed: payload.confirmed,
          bypass: payload.bypass,
          automation: payload.automation
        });

        const auditRecord = this.appendAudit({
          command: payload.command,
          risk: payload.risk,
          decision: decision.decision,
          reason: payload.reason ?? decision.reason
        });

        return {
          pluginId: this.name,
          handled: true,
          output: {
            ...decision,
            audit: auditRecord
          }
        };
      }

      const payload = SafetyAuditPayloadSchema.parse(event.payload);
      const record = this.appendAudit(payload);
      return {
        pluginId: this.name,
        handled: true,
        output: {
          logged: true,
          totalEntries: this.auditLog.length,
          record
        }
      };
    } catch (error: unknown) {
      return { pluginId: this.name, handled: false, error: this.toErrorMessage(error) };
    }
  }

  private appendAudit(payload: {
    readonly command: string;
    readonly risk: z.infer<typeof SafetyAuditPayloadSchema.shape.risk>;
    readonly decision: z.infer<typeof SafetyAuditPayloadSchema.shape.decision>;
    readonly reason?: string;
    readonly metadata?: Record<string, unknown>;
  }): SafetyAuditRecord {
    const record = SafetyAuditRecordSchema.parse({
      timestamp: new Date().toISOString(),
      command: payload.command,
      risk: payload.risk,
      decision: payload.decision,
      reason: payload.reason,
      metadata: payload.metadata
    });

    this.auditLog.push(record);
    const maxEntries = this.options.maxAuditEntries ?? 500;
    if (this.auditLog.length > maxEntries) {
      this.auditLog = this.auditLog.slice(this.auditLog.length - maxEntries);
    }

    return record;
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
