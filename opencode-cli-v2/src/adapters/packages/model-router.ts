import { z } from 'zod';

import { PackageAdapter } from '../base';
import type { AdapterHealthInput } from '../health';
import {
  ModelHealthSchema,
  RoutingOutcomeEventSchema,
  RoutingRequestSchema,
  RoutingStatsSchema,
  type ModelDescriptor,
  type ModelHealth,
  type RoutingOutcomeEvent,
  type RoutingPort,
  type RoutingRequest,
  type RoutingStats
} from '../../ports/routing';
import {
  createModelRouterAdapterError,
  normalizeModelRouterAdapterError,
  type ModelRouterAdapterErrorInit
} from './model-router-errors';
import {
  LegacyModelSchema,
  LegacySelectionSchema,
  mapLegacyModelToDescriptor,
  mapLegacySelectionToDecision,
  mapRoutingRequestToLegacyContext,
  parseLegacyRouterStats,
  type LegacyRouteContext,
  type LegacyRouterStats
} from './model-router-mappings';

const DEFAULT_LEGACY_MODULE_PATH = '../../../../packages/opencode-model-router-x/src/index.js';
const ModelIdSchema = z.string().min(1);

type LegacyModelRecord = Record<string, unknown>;

interface LegacyModelRouterInstance {
  selectModel(context?: LegacyRouteContext): unknown;
  route?(context?: LegacyRouteContext): unknown;
  listModels?(): unknown;
  resolveModelId?(modelId: string): string | null;
  recordOutcome?(modelId: string, success: boolean, latencyMs?: number, context?: LegacyRouteContext): unknown;
  stats?: unknown;
  shutdown?(): unknown;
}

type LegacyModelRouterConstructor = new (options?: Record<string, unknown>) => LegacyModelRouterInstance;

interface LegacyModelRouterModule {
  readonly ModelRouter: LegacyModelRouterConstructor;
}

const LegacyModelRouterModuleSchema = z.object({
  ModelRouter: z.custom<LegacyModelRouterConstructor>((value) => typeof value === 'function')
});

export interface ModelRouterAdapterOptions {
  readonly modulePath?: string;
  readonly loadLegacyModule?: () => Promise<unknown>;
  readonly routerOptions?: Record<string, unknown>;
  readonly createRouter?: (ModelRouter: LegacyModelRouterConstructor) => LegacyModelRouterInstance;
}

export class ModelRouterAdapter extends PackageAdapter<RoutingPort> {
  public readonly name = 'opencode-model-router-x';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('routing');
  public readonly required = true;

  private legacyModule?: LegacyModelRouterModule;
  private router?: LegacyModelRouterInstance;

  public constructor(private readonly options: ModelRouterAdapterOptions = {}) {
    super();
  }

  public async load(): Promise<void> {
    try {
      const moduleCandidate = await this.loadLegacyModule();
      this.legacyModule = this.parseLegacyModelRouterModule(moduleCandidate);
    } catch (error: unknown) {
      throw normalizeModelRouterAdapterError(error, {
        code: 'UNKNOWN',
        message: 'Failed to load legacy opencode-model-router-x module',
        details: {
          modulePath: this.getLegacyModulePath()
        }
      });
    }
  }

  public initialize(): Promise<void> {
    if (!this.legacyModule) {
      throw createModelRouterAdapterError({
        code: 'UNKNOWN',
        message: 'Cannot initialize model router adapter before module load'
      });
    }

    try {
      this.router = this.options.createRouter
        ? this.options.createRouter(this.legacyModule.ModelRouter)
        : new this.legacyModule.ModelRouter(this.options.routerOptions);

      this.setPort(this.createPort());
      return Promise.resolve();
    } catch (error: unknown) {
      throw normalizeModelRouterAdapterError(error, {
        code: 'UNKNOWN',
        message: 'Failed to initialize legacy model router runtime'
      });
    }
  }

  public healthCheck(): Promise<AdapterHealthInput> {
    const router = this.router;
    if (!router) {
      return Promise.resolve({
        status: 'unhealthy',
        details: 'Model router runtime is not initialized'
      });
    }

    try {
      const models = this.listModelsInternal(router);
      return Promise.resolve(
        models.length > 0
          ? { status: 'healthy' }
          : {
              status: 'degraded',
              details: 'Legacy model router returned no models'
            }
      );
    } catch (error: unknown) {
      return Promise.resolve({
        status: 'unhealthy',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  public async shutdown(): Promise<void> {
    if (this.router?.shutdown) {
      await Promise.resolve(this.router.shutdown());
    }

    this.router = undefined;
    this.legacyModule = undefined;
  }

  private createPort(): RoutingPort {
    return {
      listModels: () => this.toPromise(() => this.listModels()),
      selectModel: (request) => this.toPromise(() => this.selectModel(request)),
      getModelHealth: (modelId) => this.toPromise(() => this.getModelHealth(modelId)),
      recordOutcome: (event) => this.toPromise(() => this.recordOutcome(event)),
      getStats: () => this.toPromise(() => this.getStats())
    };
  }

  private listModels(): ModelDescriptor[] {
    const router = this.requireRouter();

    try {
      return this.listModelsInternal(router);
    } catch (error: unknown) {
      throw normalizeModelRouterAdapterError(error, {
        code: 'UNKNOWN',
        message: 'Failed to list models from legacy router'
      });
    }
  }

  private selectModel(request: RoutingRequest) {
    const router = this.requireRouter();
    const parsedRequest = this.parseWithSchema(
      RoutingRequestSchema,
      request,
      'Invalid routing request payload'
    );
    const legacyContext = mapRoutingRequestToLegacyContext(parsedRequest);

    try {
      const selectionRaw =
        typeof router.selectModel === 'function'
          ? router.selectModel(legacyContext)
          : router.route?.(legacyContext);
      const selection = this.parseWithSchema(
        LegacySelectionSchema,
        selectionRaw,
        'Legacy router returned an invalid model selection'
      );

      return mapLegacySelectionToDecision(selection);
    } catch (error: unknown) {
      throw normalizeModelRouterAdapterError(error, {
        code: 'NO_ROUTE_AVAILABLE',
        message: 'Failed to select model from legacy router',
        details: {
          taskType: parsedRequest.taskType
        }
      });
    }
  }

  private getModelHealth(modelId: string): ModelHealth {
    const router = this.requireRouter();
    const parsedModelId = this.parseWithSchema(ModelIdSchema, modelId, 'Invalid model id payload');
    const resolvedModelId =
      typeof router.resolveModelId === 'function' ? router.resolveModelId(parsedModelId) ?? parsedModelId : parsedModelId;

    const models = this.listModelsInternal(router);
    const model = models.find((candidate) => candidate.id === resolvedModelId);

    if (!model) {
      return ModelHealthSchema.parse({
        modelId: parsedModelId,
        status: 'unavailable',
        checkedAt: new Date().toISOString(),
        details: 'Model is not registered in legacy router model list'
      });
    }

    return ModelHealthSchema.parse({
      modelId: model.id,
      status: model.active ? 'healthy' : 'degraded',
      checkedAt: new Date().toISOString(),
      details: model.active ? undefined : 'Model is present but marked inactive'
    });
  }

  private recordOutcome(event: RoutingOutcomeEvent): void {
    const router = this.requireRouter();
    const parsed = this.parseWithSchema(
      RoutingOutcomeEventSchema,
      event,
      'Invalid routing outcome payload'
    );

    if (!router.recordOutcome) {
      return;
    }

    const context: LegacyRouteContext = {
      taskType: parsed.taskType,
      availableTokens: parsed.inputTokens,
      sessionId: undefined
    };

    try {
      router.recordOutcome(parsed.modelId, parsed.success, parsed.latencyMs, context);
    } catch (error: unknown) {
      throw normalizeModelRouterAdapterError(error, {
        code: 'ROUTING_METRICS_WRITE_FAILED',
        message: 'Failed to record routing outcome in legacy router',
        details: {
          modelId: parsed.modelId,
          taskType: parsed.taskType
        }
      });
    }
  }

  private getStats(): RoutingStats {
    const router = this.requireRouter();

    try {
      const legacyStats = parseLegacyRouterStats(router.stats);
      const stats = this.toRoutingStats(legacyStats);
      return RoutingStatsSchema.parse(stats);
    } catch (error: unknown) {
      throw normalizeModelRouterAdapterError(error, {
        code: 'UNKNOWN',
        message: 'Failed to aggregate legacy router statistics'
      });
    }
  }

  private toRoutingStats(legacyStats: LegacyRouterStats): RoutingStats {
    let totalRoutes = 0;
    let totalSuccesses = 0;
    let totalLatencyMs = 0;
    const modelSelectionCounts: Record<string, number> = {};

    for (const [modelId, entry] of Object.entries(legacyStats)) {
      const calls = Math.max(0, entry.calls);
      totalRoutes += calls;
      totalSuccesses += Math.max(0, entry.successes);
      totalLatencyMs += Math.max(0, entry.total_latency_ms);
      modelSelectionCounts[modelId] = calls;
    }

    return {
      totalRoutes,
      successRate: totalRoutes > 0 ? totalSuccesses / totalRoutes : 1,
      averageLatencyMs: totalRoutes > 0 ? totalLatencyMs / totalRoutes : 0,
      modelSelectionCounts
    };
  }

  private listModelsInternal(router: LegacyModelRouterInstance): ModelDescriptor[] {
    const rawModels =
      typeof router.listModels === 'function'
        ? router.listModels()
        : Object.values(asRecord((router as unknown as Record<string, unknown>).models));

    if (!Array.isArray(rawModels)) {
      throw createModelRouterAdapterError({
        code: 'UNKNOWN',
        message: 'Legacy router returned invalid model list payload'
      });
    }

    return rawModels
      .map((model) => this.parseWithSchema(LegacyModelSchema, model, 'Invalid legacy model descriptor'))
      .map((model) => mapLegacyModelToDescriptor(model));
  }

  private requireRouter(): LegacyModelRouterInstance {
    if (!this.router) {
      throw createModelRouterAdapterError({
        code: 'UNKNOWN',
        message: 'Model router adapter runtime is not initialized'
      });
    }

    return this.router;
  }

  private parseLegacyModelRouterModule(moduleValue: unknown): LegacyModelRouterModule {
    const namespace = asRecord(moduleValue);
    const candidate = asRecord(namespace.default);

    return LegacyModelRouterModuleSchema.parse(
      Object.keys(candidate).length > 0 ? candidate : namespace
    );
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

  private parseWithSchema<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
    const result = schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    throw normalizeModelRouterAdapterError(result.error, {
      code: 'VALIDATION_ERROR',
      message
    });
  }

  private toPromise<T>(operation: () => T | Promise<T>): Promise<T> {
    return Promise.resolve().then(operation);
  }
}

export function isModelRouterAdapterError(error: unknown): error is ModelRouterAdapterErrorInit {
  return isRecord(error) && typeof error.code === 'string' && typeof error.message === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
