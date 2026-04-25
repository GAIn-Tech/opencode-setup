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
  calculateBackoffSeconds,
  CheckCircuitHookPayloadSchema,
  detectRateLimit,
  GetNextModelHookPayloadSchema,
  isCircuitOpen,
  isModelRateLimited,
  nextRateLimitedState,
  OnRateLimitHookPayloadSchema,
  parseRateLimitFallbackConfig,
  ResetCircuitHookPayloadSchema,
  resetModelCircuitState,
  resolveNextModel,
  type RateLimitFallbackConfig,
  type RateLimitModelState
} from './rate-limit-fallback-mappings';

const DEFAULT_CONFIG_PATH = '../../../../opencode-config/opencode.json';

const HOOK_ON_RATE_LIMIT = 'fallback.on-rate-limit';
const HOOK_GET_NEXT_MODEL = 'fallback.get-next-model';
const HOOK_CHECK_CIRCUIT = 'fallback.check-circuit';
const HOOK_RESET_CIRCUIT = 'fallback.reset-circuit';

interface RateLimitFallbackPluginAdapterOptions {
  readonly configPath?: string;
  readonly loadConfig?: () => Promise<unknown>;
  readonly isMainSession?: (sessionId: string | undefined) => boolean;
  readonly now?: () => number;
}

export class RateLimitFallbackPluginAdapter extends PackageAdapter<PluginsPort> {
  public readonly name = 'rate-limit-fallback';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('plugins');
  public readonly required = true;

  private config?: RateLimitFallbackConfig;
  private pluginRecord?: PluginRecord;
  private modelStates = new Map<string, RateLimitModelState>();
  private sessionAssignments = new Map<string, string>();

  public constructor(private readonly options: RateLimitFallbackPluginAdapterOptions = {}) {
    super();
  }

  public async load(): Promise<void> {
    try {
      this.config = parseRateLimitFallbackConfig(await this.loadConfig());
    } catch (error: unknown) {
      throw new Error(`Failed to load rate-limit-fallback config: ${this.toErrorMessage(error)}`);
    }
  }

  public async initialize(): Promise<void> {
    this.config = parseRateLimitFallbackConfig(await this.loadConfig());
    this.modelStates = new Map<string, RateLimitModelState>();
    this.sessionAssignments.clear();

    this.pluginRecord = {
      manifest: {
        id: this.name,
        name: this.name,
        version: this.version,
        description: 'rate-limit-fallback plugin adapter',
        entrypoint: this.getConfigPath(),
        hooks: [HOOK_ON_RATE_LIMIT, HOOK_GET_NEXT_MODEL, HOOK_CHECK_CIRCUIT, HOOK_RESET_CIRCUIT],
        capabilities: ['rate-limit-detection', 'model-fallback', 'circuit-breaker', 'exponential-backoff'],
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

    if (Object.keys(this.config.fallbackChains).length === 0) {
      return Promise.resolve({ status: 'degraded', details: 'No fallback chains configured' });
    }

    return Promise.resolve({ status: 'healthy' });
  }

  public shutdown(): Promise<void> {
    this.config = undefined;
    this.pluginRecord = undefined;
    this.modelStates.clear();
    this.sessionAssignments.clear();
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
    try {
      if (event.name === HOOK_ON_RATE_LIMIT) {
        return this.handleOnRateLimit(event.payload);
      }

      if (event.name === HOOK_GET_NEXT_MODEL) {
        return this.handleGetNextModel(event.payload);
      }

      if (event.name === HOOK_CHECK_CIRCUIT) {
        return this.handleCheckCircuit(event.payload);
      }

      if (event.name === HOOK_RESET_CIRCUIT) {
        return this.handleResetCircuit(event.payload);
      }

      return { pluginId: this.name, handled: false, error: `Unsupported hook: ${event.name}` };
    } catch (error: unknown) {
      return { pluginId: this.name, handled: false, error: this.toErrorMessage(error) };
    }
  }

  private handleOnRateLimit(payloadValue: unknown): HookResult {
    const payload = OnRateLimitHookPayloadSchema.parse(payloadValue);
    const config = this.requireConfig();
    const now = this.now();
    const detection = detectRateLimit(payload, config);

    if (!detection.isRateLimit) {
      return {
        pluginId: this.name,
        handled: true,
        output: {
          model: payload.model,
          isRateLimit: false,
          switched: false,
          nextModel: undefined
        }
      };
    }

    const currentState = this.modelStates.get(payload.model);
    const nextRetryCount = (currentState?.retryCount ?? 0) + 1;
    const backoffSeconds = calculateBackoffSeconds(nextRetryCount, config, payload.retryAfterSeconds);

    const nextState = nextRateLimitedState({
      current: currentState,
      model: payload.model,
      now,
      backoffSeconds,
      threshold: config.circuitBreakerThreshold,
      circuitCooldownSeconds: config.circuitBreakerCooldownSeconds
    });
    this.modelStates.set(payload.model, nextState);

    const nextModel = resolveNextModel({
      currentModel: payload.model,
      fallbackChains: config.fallbackChains,
      states: this.modelStates,
      now
    });

    // Only assign fallback model to subagent/background sessions
    // Main session model should not be affected by rate limit fallbacks
    if (payload.sessionId && nextModel && !this.isMainSession(payload.sessionId)) {
      this.sessionAssignments.set(payload.sessionId, nextModel);
    }

    return {
      pluginId: this.name,
      handled: true,
      output: {
        model: payload.model,
        sessionId: payload.sessionId,
        isRateLimit: true,
        statusCode: detection.statusCode,
        retryCount: nextState.retryCount,
        backoffSeconds,
        rateLimitedUntil: nextState.rateLimitedUntil,
        circuitState: isCircuitOpen(nextState, now) ? 'open' : 'closed',
        switched: Boolean(nextModel) && !this.isMainSession(payload.sessionId),
        nextModel
      }
    };
  }

  private handleGetNextModel(payloadValue: unknown): HookResult {
    const payload = GetNextModelHookPayloadSchema.parse(payloadValue);
    const config = this.requireConfig();
    const now = this.now();

    const currentModel = payload.sessionId ? this.sessionAssignments.get(payload.sessionId) ?? payload.model : payload.model;
    const nextModel = resolveNextModel({
      currentModel,
      fallbackChains: config.fallbackChains,
      states: this.modelStates,
      now
    });

    // Only assign fallback model to subagent/background sessions
    // Main session model should not be affected by rate limit fallbacks
    if (payload.sessionId && nextModel && !this.isMainSession(payload.sessionId)) {
      this.sessionAssignments.set(payload.sessionId, nextModel);
    }

    return {
      pluginId: this.name,
      handled: true,
      output: {
        model: currentModel,
        nextModel,
        available: Boolean(nextModel)
      }
    };
  }

  private handleCheckCircuit(payloadValue: unknown): HookResult {
    const payload = CheckCircuitHookPayloadSchema.parse(payloadValue);
    const now = this.now();
    const state = this.modelStates.get(payload.model);

    const open = isCircuitOpen(state, now);
    return {
      pluginId: this.name,
      handled: true,
      output: {
        model: payload.model,
        open,
        state: open ? 'open' : 'closed',
        retryCount: state?.retryCount ?? 0,
        failureCount: state?.failureCount ?? 0,
        rateLimited: isModelRateLimited(state, now),
        rateLimitedUntil: state?.rateLimitedUntil,
        circuitOpenedUntil: state?.circuitOpenedUntil
      }
    };
  }

  private handleResetCircuit(payloadValue: unknown): HookResult {
    const payload = ResetCircuitHookPayloadSchema.parse(payloadValue);
    this.modelStates.set(payload.model, resetModelCircuitState(payload.model));

    return {
      pluginId: this.name,
      handled: true,
      output: {
        model: payload.model,
        reset: true,
        state: 'closed'
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

  private requireConfig(): RateLimitFallbackConfig {
    return z
      .object({
        fallbackChains: z.record(z.string(), z.array(z.string().min(1))),
        rateLimitStatusCodes: z.array(z.number().int().min(100).max(599)),
        baseBackoffSeconds: z.number().int().positive(),
        maxBackoffSeconds: z.number().int().positive(),
        circuitBreakerThreshold: z.number().int().positive(),
        circuitBreakerCooldownSeconds: z.number().int().positive()
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

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private isMainSession(sessionId: string | undefined): boolean {
    return this.options.isMainSession ? this.options.isMainSession(sessionId) : false;
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
