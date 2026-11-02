import { z } from 'zod';

import { PackageAdapter } from '../base';
import type { AdapterHealthInput } from '../health';
import {
  AdaptationDecisionSchema,
  LearningQuerySchema,
  LearningSignalSchema,
  type LearningPattern,
  type LearningPort,
  type LearningState,
  type Recommendation,
  type RecommendationContext
} from '../../ports/learning';
import {
  createLearningAdapterError,
  normalizeLearningAdapterError,
  type LearningAdapterErrorInit
} from './learning-errors';
import {
  LegacyIngestResultSchema,
  LegacyLearningModuleSchema,
  asRecord,
  mapAdaptationDecisionToLegacyOutcome,
  mapLegacyAdviceToRecommendations,
  mapLegacyPatternsToLearningPatterns,
  mapLegacyReportToLearningState,
  mapSignalToLegacyEvent,
  parseLegacyPatternCollection,
  toLegacyRecommendationContext,
  type LegacyLearningEngineInstance,
  type LegacyLearningModule
} from './learning-mappings';

const DEFAULT_LEGACY_MODULE_PATH = '../../../../packages/opencode-learning-engine/src/index.mjs';

export interface LearningAdapterOptions {
  readonly modulePath?: string;
  readonly loadLegacyModule?: () => Promise<unknown>;
  readonly engineOptions?: Record<string, unknown>;
  readonly createEngine?: (module: LegacyLearningModule) => LegacyLearningEngineInstance;
}

export class LearningAdapter extends PackageAdapter<LearningPort> {
  public readonly name = 'opencode-learning-engine';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('learning');
  public readonly required = true;

  private legacyModule?: LegacyLearningModule;
  private engine?: LegacyLearningEngineInstance;
  private signalCount = 0;
  private lastIngestedAt?: string;

  public constructor(private readonly options: LearningAdapterOptions = {}) {
    super();
  }

  public async load(): Promise<void> {
    try {
      const moduleCandidate = await this.loadLegacyModule();
      const namespace = asRecord(moduleCandidate);
      const candidate = asRecord(namespace.default);
      const resolved = Object.keys(candidate).length > 0 ? candidate : namespace;
      this.legacyModule = LegacyLearningModuleSchema.parse(resolved);
    } catch (error: unknown) {
      throw normalizeLearningAdapterError(error, {
        code: 'UNKNOWN',
        message: 'Failed to load legacy opencode-learning-engine module',
        details: {
          modulePath: this.getLegacyModulePath()
        }
      });
    }
  }

  public initialize(): Promise<void> {
    if (!this.legacyModule) {
      throw createLearningAdapterError({
        code: 'UNKNOWN',
        message: 'Cannot initialize learning adapter before module load'
      });
    }

    try {
      this.engine = this.options.createEngine
        ? this.options.createEngine(this.legacyModule)
        : new this.legacyModule.LearningEngine(this.options.engineOptions);

      this.setPort(this.createPort());
      return Promise.resolve();
    } catch (error: unknown) {
      throw normalizeLearningAdapterError(error, {
        code: 'UNKNOWN',
        message: 'Failed to initialize legacy learning engine runtime'
      });
    }
  }

  public async healthCheck(): Promise<AdapterHealthInput> {
    const engine = this.engine;
    if (!engine) {
      return {
        status: 'unhealthy',
        details: 'Learning engine runtime is not initialized'
      };
    }

    try {
      const report = await this.readLegacyReport(engine);
      const state = mapLegacyReportToLearningState(report, this.signalCount, this.lastIngestedAt);

      return state.patternCount >= 0
        ? { status: 'healthy' }
        : {
            status: 'degraded',
            details: 'Legacy learning engine report did not expose pattern counts'
          };
    } catch (error: unknown) {
      return {
        status: 'unhealthy',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }

  public async shutdown(): Promise<void> {
    if (this.engine?.save) {
      await Promise.resolve(this.engine.save());
    }

    this.signalCount = 0;
    this.lastIngestedAt = undefined;
    this.engine = undefined;
    this.legacyModule = undefined;
  }

  private createPort(): LearningPort {
    return {
      ingestSignal: (signal) => this.toPromise(() => this.ingestSignal(signal)),
      analyzePatterns: (query) => this.toPromise(() => this.analyzePatterns(query)),
      recommend: (context) => this.toPromise(() => this.recommend(context)),
      applyAdaptation: (decision) => this.toPromise(() => this.applyAdaptation(decision)),
      getState: () => this.toPromise(() => this.getState())
    };
  }

  private ingestSignal(signal: z.input<typeof LearningSignalSchema>): void {
    const parsedSignal = this.parseWithSchema(LearningSignalSchema, signal, 'Invalid learning signal payload');
    const engine = this.requireEngine();
    const event = mapSignalToLegacyEvent(parsedSignal);

    if (typeof engine.ingestEvent !== 'function') {
      throw createLearningAdapterError({
        code: 'SIGNAL_INGEST_FAILED',
        message: 'Legacy learning engine does not expose ingestEvent API'
      });
    }

    try {
      const result = this.parseWithSchema(
        LegacyIngestResultSchema,
        engine.ingestEvent(event),
        'Legacy learning engine returned invalid ingest result payload'
      );

      if (!result.success) {
        throw createLearningAdapterError({
          code: 'SIGNAL_INGEST_FAILED',
          message: result.reason ?? 'Legacy learning engine rejected signal ingest',
          details: {
            signalId: parsedSignal.id,
            category: parsedSignal.category
          }
        });
      }

      this.signalCount += 1;
      this.lastIngestedAt = parsedSignal.timestamp;
    } catch (error: unknown) {
      throw normalizeLearningAdapterError(error, {
        code: 'SIGNAL_INGEST_FAILED',
        message: 'Failed to ingest signal into legacy learning engine',
        details: {
          signalId: parsedSignal.id,
          category: parsedSignal.category
        }
      });
    }
  }

  private analyzePatterns(query?: z.input<typeof LearningQuerySchema>): LearningPattern[] {
    const parsedQuery = query === undefined ? undefined : this.parseWithSchema(LearningQuerySchema, query, 'Invalid learning query payload');
    const engine = this.requireEngine();

    try {
      const collection = parseLegacyPatternCollection(engine);
      return mapLegacyPatternsToLearningPatterns(collection, parsedQuery);
    } catch (error: unknown) {
      throw normalizeLearningAdapterError(error, {
        code: 'PATTERN_ANALYSIS_FAILED',
        message: 'Failed to analyze patterns from legacy learning engine'
      });
    }
  }

  private async recommend(context: RecommendationContext): Promise<Recommendation[]> {
    const parsedContext = this.parseWithSchema(
      z.custom<RecommendationContext>((value) => value !== null),
      context,
      'Invalid recommendation context payload'
    );
    const engine = this.requireEngine();

    if (typeof engine.advise !== 'function') {
      throw createLearningAdapterError({
        code: 'RECOMMENDATION_FAILED',
        message: 'Legacy learning engine does not expose advise API'
      });
    }

    try {
      const legacyContext = toLegacyRecommendationContext(parsedContext);
      const advice = await Promise.resolve(engine.advise(legacyContext));
      return mapLegacyAdviceToRecommendations(advice);
    } catch (error: unknown) {
      throw normalizeLearningAdapterError(error, {
        code: 'RECOMMENDATION_FAILED',
        message: 'Failed to get recommendations from legacy learning engine',
        details: {
          sessionId: parsedContext.sessionId,
          taskType: parsedContext.taskType
        }
      });
    }
  }

  private applyAdaptation(decision: z.input<typeof AdaptationDecisionSchema>): void {
    const parsed = this.parseWithSchema(AdaptationDecisionSchema, decision, 'Invalid adaptation decision payload');
    const engine = this.requireEngine();

    if (typeof engine.learnFromOutcome !== 'function') {
      throw createLearningAdapterError({
        code: 'ADAPTATION_APPLY_FAILED',
        message: 'Legacy learning engine does not expose learnFromOutcome API'
      });
    }

    try {
      const { adviceId, outcome } = mapAdaptationDecisionToLegacyOutcome(parsed);
      engine.learnFromOutcome(adviceId, outcome);
    } catch (error: unknown) {
      throw normalizeLearningAdapterError(error, {
        code: 'ADAPTATION_APPLY_FAILED',
        message: 'Failed to apply adaptation via legacy learning engine',
        details: {
          adaptationId: parsed.id,
          target: parsed.target
        }
      });
    }
  }

  private async getState(): Promise<LearningState> {
    const engine = this.requireEngine();

    try {
      const collection = parseLegacyPatternCollection(engine);
      const fallbackPatternCount = collection.antiPatterns.length + collection.positivePatterns.length;
      const report = await this.readLegacyReport(engine);

      return mapLegacyReportToLearningState(report, this.signalCount, this.lastIngestedAt, fallbackPatternCount);
    } catch (error: unknown) {
      throw normalizeLearningAdapterError(error, {
        code: 'UNKNOWN',
        message: 'Failed to fetch learning state from legacy learning engine'
      });
    }
  }

  private async readLegacyReport(engine: LegacyLearningEngineInstance): Promise<unknown> {
    if (typeof engine.getReport === 'function') {
      return Promise.resolve(engine.getReport());
    }

    const collection = parseLegacyPatternCollection(engine);
    return {
      engine_version: 'legacy-unknown',
      anti_patterns: { total: collection.antiPatterns.length },
      positive_patterns: { total: collection.positivePatterns.length }
    };
  }

  private requireEngine(): LegacyLearningEngineInstance {
    if (!this.engine) {
      throw createLearningAdapterError({
        code: 'UNKNOWN',
        message: 'Learning adapter runtime is not initialized'
      });
    }

    return this.engine;
  }

  private parseWithSchema<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
    const result = schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    throw normalizeLearningAdapterError(result.error, {
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

export function isLearningAdapterError(error: unknown): error is LearningAdapterErrorInit {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as Record<string, unknown>).code === 'string' &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}
