import { z } from 'zod';

import { PackageAdapter } from '../base';
import type { AdapterHealthInput } from '../health';
import {
  BudgetAllocationSchema,
  BudgetCheckRequestSchema,
  BudgetConsumptionSchema,
  type BudgetAllocation,
  type BudgetCheckRequest,
  type BudgetCheckResult,
  type BudgetPort,
  type BudgetSessionSummary,
  type BudgetStatus
} from '../../ports/budget';
import {
  createContextGovernorAdapterError,
  normalizeContextGovernorAdapterError,
  type ContextGovernorAdapterErrorInit
} from './context-governor-errors';
import {
  CompressionRecommendationSchema,
  LegacyContextGovernorModuleSchema,
  LegacyGovernorCheckResultSchema,
  LegacyGovernorSessionSummarySchema,
  LegacyGovernorUsageSchema,
  asRecord,
  getCompressionRecommendation,
  mapToBudgetCheckResult,
  mapToBudgetStatus,
  mapToSessionSummary,
  toRuntimeBudgetConfig,
  type CompressionRecommendation,
  type LegacyContextGovernorModule,
  type LegacyGovernorCheckResult,
  type LegacyGovernorInstance,
  type RuntimeBudgetConfig
} from './context-governor-mappings';

const DEFAULT_LEGACY_MODULE_PATH = '../../../../packages/opencode-context-governor/src/index.js';

const SessionIdSchema = z.string().min(1);
const ModelSchema = z.string().min(1);

export interface ContextGovernorAdapterOptions {
  readonly modulePath?: string;
  readonly loadLegacyModule?: () => Promise<unknown>;
  readonly governorOptions?: Record<string, unknown>;
  readonly createGovernor?: (module: LegacyContextGovernorModule) => LegacyGovernorInstance;
}

export class ContextGovernorAdapter extends PackageAdapter<BudgetPort> {
  public readonly name = 'opencode-context-governor';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('budget');
  public readonly required = true;

  private legacyModule?: LegacyContextGovernorModule;
  private governor?: LegacyGovernorInstance;
  private readonly allocations = new Map<string, RuntimeBudgetConfig>();
  private readonly updatedAt = new Map<string, string>();

  public constructor(private readonly options: ContextGovernorAdapterOptions = {}) {
    super();
  }

  public async load(): Promise<void> {
    try {
      const moduleCandidate = await this.loadLegacyModule();
      const namespace = asRecord(moduleCandidate);
      const candidate = asRecord(namespace.default);
      const resolved = Object.keys(candidate).length > 0 ? candidate : namespace;
      this.legacyModule = LegacyContextGovernorModuleSchema.parse(resolved);
    } catch (error: unknown) {
      throw normalizeContextGovernorAdapterError(error, {
        code: 'UNKNOWN',
        message: 'Failed to load legacy opencode-context-governor module',
        details: {
          modulePath: this.getLegacyModulePath()
        }
      });
    }
  }

  public initialize(): Promise<void> {
    if (!this.legacyModule) {
      throw createContextGovernorAdapterError({
        code: 'UNKNOWN',
        message: 'Cannot initialize context governor adapter before module load'
      });
    }

    try {
      this.governor = this.options.createGovernor
        ? this.options.createGovernor(this.legacyModule)
        : new this.legacyModule.Governor(this.options.governorOptions);

      this.setPort(this.createPort());
      return Promise.resolve();
    } catch (error: unknown) {
      throw normalizeContextGovernorAdapterError(error, {
        code: 'UNKNOWN',
        message: 'Failed to initialize legacy context governor runtime'
      });
    }
  }

  public healthCheck(): Promise<AdapterHealthInput> {
    const governor = this.governor;
    if (!governor) {
      return Promise.resolve({
        status: 'unhealthy',
        details: 'Context governor runtime is not initialized'
      });
    }

    try {
      LegacyGovernorSessionSummarySchema.parse(governor.getAllSessions());
      return Promise.resolve({ status: 'healthy' });
    } catch (error: unknown) {
      return Promise.resolve({
        status: 'unhealthy',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  public async shutdown(): Promise<void> {
    if (this.governor?.shutdown) {
      await Promise.resolve(this.governor.shutdown());
    }

    this.allocations.clear();
    this.updatedAt.clear();
    this.governor = undefined;
    this.legacyModule = undefined;
  }

  public async shouldCompress(sessionId: string, model: string): Promise<boolean> {
    const status = await this.getBudgetStatus(sessionId, model);
    return getCompressionRecommendation(status).level !== 'none';
  }

  public async getCompressionRecommendation(
    sessionId: string,
    model: string
  ): Promise<CompressionRecommendation | undefined> {
    const status = await this.getBudgetStatus(sessionId, model);
    const recommendation = getCompressionRecommendation(status);
    return recommendation.level === 'none' ? undefined : recommendation;
  }

  private createPort(): BudgetPort {
    return {
      upsertAllocation: (allocation) => this.toPromise(() => this.upsertAllocation(allocation)),
      consumeTokens: (consumption) => this.toPromise(() => this.consumeTokens(consumption)),
      checkBudget: (request) => this.toPromise(() => this.checkBudget(request)),
      getStatus: (sessionId, model) => this.toPromise(() => this.getBudgetStatus(sessionId, model)),
      listSessions: () => this.toPromise(() => this.listSessions()),
      reset: (sessionId, model) => this.toPromise(() => this.reset(sessionId, model))
    };
  }

  private upsertAllocation(allocation: BudgetAllocation): void {
    const parsed = this.parseWithSchema(BudgetAllocationSchema, allocation, 'Invalid budget allocation payload');

    try {
      const runtime = toRuntimeBudgetConfig(parsed);
      this.allocations.set(this.key(runtime.sessionId, runtime.model), runtime);
      this.touch(runtime.sessionId, runtime.model);
      this.readGovernorUsage(runtime.sessionId, runtime.model);
    } catch (error: unknown) {
      throw normalizeContextGovernorAdapterError(error, {
        code: 'INVALID_BUDGET_ALLOCATION',
        message: 'Failed to upsert budget allocation'
      });
    }
  }

  private consumeTokens(consumption: z.input<typeof BudgetConsumptionSchema>): BudgetStatus {
    const parsed = this.parseWithSchema(BudgetConsumptionSchema, consumption, 'Invalid budget consumption payload');
    const allocation = this.requireAllocation(parsed.sessionId, parsed.model);
    const governor = this.requireGovernor();

    try {
      governor.consumeTokens(parsed.sessionId, parsed.model, parsed.tokens);
      const usage = this.readGovernorUsage(parsed.sessionId, parsed.model);
      const status = mapToBudgetStatus(
        parsed.sessionId,
        parsed.model,
        usage.used,
        allocation,
        this.touch(parsed.sessionId, parsed.model)
      );

      CompressionRecommendationSchema.parse(getCompressionRecommendation(status));

      return status;
    } catch (error: unknown) {
      throw normalizeContextGovernorAdapterError(error, {
        code: 'BUDGET_STORAGE_FAILURE',
        message: 'Failed to consume tokens in legacy context governor',
        details: {
          sessionId: parsed.sessionId,
          model: parsed.model
        }
      });
    }
  }

  private checkBudget(request: BudgetCheckRequest): BudgetCheckResult {
    const parsed = this.parseWithSchema(BudgetCheckRequestSchema, request, 'Invalid budget check request payload');
    const allocation = this.requireAllocation(parsed.sessionId, parsed.model);
    const governor = this.requireGovernor();

    try {
      const legacyCheck = this.parseWithSchema(
        LegacyGovernorCheckResultSchema,
        governor.checkBudget(parsed.sessionId, parsed.model, parsed.proposedTokens),
        'Legacy context governor returned invalid check result'
      );

      const usage = this.readGovernorUsage(parsed.sessionId, parsed.model);
      return this.reconcileCheckResult(parsed, allocation, usage.used, legacyCheck);
    } catch (error: unknown) {
      throw normalizeContextGovernorAdapterError(error, {
        code: 'UNKNOWN',
        message: 'Failed to check budget in legacy context governor',
        details: {
          sessionId: parsed.sessionId,
          model: parsed.model
        }
      });
    }
  }

  private getBudgetStatus(sessionId: string, model: string): BudgetStatus {
    const parsedSessionId = this.parseWithSchema(SessionIdSchema, sessionId, 'Invalid session id payload');
    const parsedModel = this.parseWithSchema(ModelSchema, model, 'Invalid model payload');
    const allocation = this.requireAllocation(parsedSessionId, parsedModel);

    try {
      const usage = this.readGovernorUsage(parsedSessionId, parsedModel);
      return mapToBudgetStatus(
        parsedSessionId,
        parsedModel,
        usage.used,
        allocation,
        this.touch(parsedSessionId, parsedModel)
      );
    } catch (error: unknown) {
      throw normalizeContextGovernorAdapterError(error, {
        code: 'UNKNOWN',
        message: 'Failed to get budget status from legacy context governor',
        details: {
          sessionId: parsedSessionId,
          model: parsedModel
        }
      });
    }
  }

  private listSessions(): BudgetSessionSummary[] {
    const sessions = new Map<string, string[]>();
    for (const allocation of this.allocations.values()) {
      const models = sessions.get(allocation.sessionId) ?? [];
      models.push(allocation.model);
      sessions.set(allocation.sessionId, models);
    }

    return [...sessions.entries()].map(([sessionId, models]) => {
      const statuses = models.map((model) => this.getBudgetStatus(sessionId, model));
      return mapToSessionSummary(sessionId, statuses);
    });
  }

  private reset(sessionId: string, model?: string): void {
    const parsedSessionId = this.parseWithSchema(SessionIdSchema, sessionId, 'Invalid session id payload');
    const parsedModel = model === undefined ? undefined : this.parseWithSchema(ModelSchema, model, 'Invalid model payload');
    const governor = this.requireGovernor();

    try {
      governor.resetSession(parsedSessionId, parsedModel);
      if (parsedModel) {
        this.allocations.delete(this.key(parsedSessionId, parsedModel));
        this.updatedAt.delete(this.key(parsedSessionId, parsedModel));
      } else {
        for (const key of [...this.allocations.keys()]) {
          if (key.startsWith(`${parsedSessionId}:`)) {
            this.allocations.delete(key);
            this.updatedAt.delete(key);
          }
        }
      }
    } catch (error: unknown) {
      throw normalizeContextGovernorAdapterError(error, {
        code: 'BUDGET_STORAGE_FAILURE',
        message: 'Failed to reset budget in legacy context governor',
        details: {
          sessionId: parsedSessionId,
          model: parsedModel
        }
      });
    }
  }

  private reconcileCheckResult(
    request: BudgetCheckRequest,
    allocation: RuntimeBudgetConfig,
    usedTokens: number,
    legacyCheck: LegacyGovernorCheckResult
  ): BudgetCheckResult {
    const mapped = mapToBudgetCheckResult(usedTokens, request.proposedTokens, allocation);
    if (!legacyCheck.allowed && mapped.allowed) {
      return {
        ...mapped,
        allowed: false,
        status: 'critical'
      };
    }

    return mapped;
  }

  private requireGovernor(): LegacyGovernorInstance {
    if (!this.governor) {
      throw createContextGovernorAdapterError({
        code: 'UNKNOWN',
        message: 'Context governor adapter runtime is not initialized'
      });
    }

    return this.governor;
  }

  private requireAllocation(sessionId: string, model: string): RuntimeBudgetConfig {
    const allocation = this.allocations.get(this.key(sessionId, model));
    if (!allocation) {
      throw createContextGovernorAdapterError({
        code: 'BUDGET_NOT_FOUND',
        message: `Budget allocation not found for ${sessionId}/${model}`,
        details: {
          sessionId,
          model
        }
      });
    }

    return allocation;
  }

  private readGovernorUsage(sessionId: string, model: string): { readonly used: number } {
    const governor = this.requireGovernor();
    const raw = governor.getRemainingBudget(sessionId, model);
    const parsed = this.parseWithSchema(
      LegacyGovernorUsageSchema,
      raw,
      'Legacy context governor returned invalid budget usage payload'
    );

    return { used: parsed.used };
  }

  private key(sessionId: string, model: string): string {
    return `${sessionId}:${model}`;
  }

  private touch(sessionId: string, model: string): string {
    const timestamp = new Date().toISOString();
    this.updatedAt.set(this.key(sessionId, model), timestamp);
    return timestamp;
  }

  private parseWithSchema<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
    const result = schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    throw normalizeContextGovernorAdapterError(result.error, {
      code: 'VALIDATION_ERROR',
      message
    });
  }

  private async loadLegacyModule(): Promise<unknown> {
    if (this.options.loadLegacyModule) {
      return this.options.loadLegacyModule();
    }

    return import(this.getLegacyModulePath());
  }

  private getLegacyModulePath(): string {
    return this.options.modulePath ?? DEFAULT_LEGACY_MODULE_PATH;
  }

  private toPromise<T>(operation: () => T | Promise<T>): Promise<T> {
    return Promise.resolve().then(operation);
  }
}

export function isContextGovernorAdapterError(error: unknown): error is ContextGovernorAdapterErrorInit {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as Record<string, unknown>).code === 'string' &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}
