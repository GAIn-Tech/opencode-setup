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
  AuditHookPayloadSchema,
  CheckPolicyHookPayloadSchema,
  mergePolicy,
  parseSecurityPluginConfig,
  sanitizeContent,
  SanitizeHookPayloadSchema,
  SecurityDecisionSchema,
  SecurityPolicySchema,
  type SecurityDecision,
  type SecurityPolicy,
  type SecurityValidationResult,
  ValidateInputHookPayloadSchema,
  validateSecurityInput
} from './security-plugin-mappings';

const HOOK_VALIDATE_INPUT = 'security.validate-input';
const HOOK_CHECK_POLICY = 'security.check-policy';
const HOOK_SANITIZE = 'security.sanitize';
const HOOK_AUDIT = 'security.audit';

export interface SecurityAuditEvent {
  readonly timestamp: string;
  readonly eventType: string;
  readonly decision: SecurityDecision;
  readonly reason?: string;
  readonly details?: Record<string, unknown>;
}

interface SecurityPluginAdapterOptions {
  readonly loadConfig?: () => Promise<unknown>;
}

export class SecurityPluginAdapter extends PackageAdapter<PluginsPort> {
  public readonly name = 'security-plugin';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('plugins');
  public readonly required = true;

  private policy?: SecurityPolicy;
  private pluginRecord?: PluginRecord;
  private auditLog: SecurityAuditEvent[] = [];

  public constructor(private readonly options: SecurityPluginAdapterOptions = {}) {
    super();
  }

  public async load(): Promise<void> {
    try {
      this.policy = parseSecurityPluginConfig(await this.loadConfig());
    } catch (error: unknown) {
      throw new Error(`Failed to load security plugin config: ${this.toErrorMessage(error)}`);
    }
  }

  public async initialize(): Promise<void> {
    this.policy = parseSecurityPluginConfig(await this.loadConfig());
    this.auditLog = [];

    this.pluginRecord = {
      manifest: {
        id: this.name,
        name: this.name,
        version: this.version,
        description: 'security-plugin adapter',
        entrypoint: './src/adapters/plugins/security-plugin.ts',
        hooks: [HOOK_VALIDATE_INPUT, HOOK_CHECK_POLICY, HOOK_SANITIZE, HOOK_AUDIT],
        capabilities: [
          'input-validation',
          'content-filtering',
          'policy-enforcement',
          'sanitization',
          'security-audit-logging'
        ],
        requiredPermissions: []
      },
      state: 'enabled',
      loadedAt: new Date().toISOString()
    };

    this.setPort(this.createPort());
  }

  public healthCheck(): Promise<AdapterHealthInput> {
    if (!this.pluginRecord || !this.policy) {
      return Promise.resolve({ status: 'unhealthy', details: 'Plugin adapter is not initialized' });
    }

    if (!this.policy.strictMode) {
      return Promise.resolve({ status: 'degraded', details: 'Security plugin running with strictMode=false' });
    }

    return Promise.resolve({ status: 'healthy' });
  }

  public shutdown(): Promise<void> {
    this.policy = undefined;
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
        status: this.policy ? 'healthy' : 'unhealthy',
        details: this.policy ? undefined : 'Security policy not loaded',
        checkedAt: new Date().toISOString()
      })
    };
  }

  private handleHook(event: HookEvent): HookResult {
    try {
      if (event.name === HOOK_VALIDATE_INPUT) {
        const output = this.handleValidateInput(event.payload);
        return {
          pluginId: this.name,
          handled: true,
          output
        };
      }

      if (event.name === HOOK_CHECK_POLICY) {
        const output = this.handleCheckPolicy(event.payload);
        return {
          pluginId: this.name,
          handled: true,
          output
        };
      }

      if (event.name === HOOK_SANITIZE) {
        const output = this.handleSanitize(event.payload);
        return {
          pluginId: this.name,
          handled: true,
          output
        };
      }

      if (event.name === HOOK_AUDIT) {
        const output = this.handleAudit(event.payload);
        return {
          pluginId: this.name,
          handled: true,
          output
        };
      }

      return { pluginId: this.name, handled: false, error: `Unsupported hook: ${event.name}` };
    } catch (error: unknown) {
      return { pluginId: this.name, handled: false, error: this.toErrorMessage(error) };
    }
  }

  private handleValidateInput(payloadValue: unknown): SecurityValidationResult {
    const payload = ValidateInputHookPayloadSchema.parse(payloadValue);
    const result = validateSecurityInput(payload.input, this.requirePolicy());

    this.recordAuditIfEnabled('validate-input', result.decision, {
      score: result.score,
      violations: result.violations,
      context: payload.context
    });

    return result;
  }

  private handleCheckPolicy(payloadValue: unknown): SecurityValidationResult {
    const payload = CheckPolicyHookPayloadSchema.parse(payloadValue);
    const policy = mergePolicy(this.requirePolicy(), payload.policyOverrides);
    const result = validateSecurityInput(payload.content, policy);

    this.recordAuditIfEnabled('check-policy', result.decision, {
      score: result.score,
      violations: result.violations,
      context: payload.context
    });

    return result;
  }

  private handleSanitize(payloadValue: unknown) {
    const payload = SanitizeHookPayloadSchema.parse(payloadValue);
    const result = sanitizeContent(payload.content, payload.aggressive);

    this.recordAuditIfEnabled('sanitize', result.changed ? 'sanitize' : 'allow', {
      changed: result.changed,
      appliedRules: result.appliedRules
    });

    return result;
  }

  private handleAudit(payloadValue: unknown) {
    const payload = AuditHookPayloadSchema.parse(payloadValue);
    const event: SecurityAuditEvent = {
      timestamp: new Date().toISOString(),
      eventType: payload.eventType,
      decision: SecurityDecisionSchema.parse(payload.decision),
      reason: payload.reason,
      details: payload.details
    };

    this.auditLog.push(event);

    return {
      accepted: true,
      entry: event,
      totalEvents: this.auditLog.length
    };
  }

  private recordAuditIfEnabled(eventType: string, decision: SecurityDecision, details?: Record<string, unknown>): void {
    const policy = this.requirePolicy();
    if (!policy.auditEnabled) return;

    this.auditLog.push({
      timestamp: new Date().toISOString(),
      eventType,
      decision,
      details
    });
  }

  private requirePlugin(): PluginRecord {
    return z
      .object({
        manifest: z.any(),
        state: z.enum(['discovered', 'installed', 'loaded', 'enabled', 'disabled', 'error'])
      })
      .parse(this.pluginRecord) as PluginRecord;
  }

  private requirePolicy(): SecurityPolicy {
    return SecurityPolicySchema.parse(this.policy);
  }

  private async loadConfig(): Promise<unknown> {
    if (this.options.loadConfig) return this.options.loadConfig();
    return {};
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
