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
  createContextCacheKey,
  DEFAULT_SKILL_CATALOG,
  analyzeContext,
  parseSkillCatalog,
  recommendSkills,
  resolveSkillLoadOrder,
  selectSkillsForStrategy,
  SkillContextSchema,
  SkillsAnalyzeContextPayloadSchema,
  SkillsGetLoadedPayloadSchema,
  SkillsPreloadPayloadSchema,
  SkillsRecommendPayloadSchema,
  SKILLS_ANALYZE_CONTEXT_HOOK,
  SKILLS_GET_LOADED_HOOK,
  SKILLS_PRELOAD_HOOK,
  SKILLS_RECOMMEND_HOOK,
  type LoadedSkillRecord,
  type SkillCatalog,
  type SkillRecommendation
} from './preload-skills-mappings';

const DEFAULT_PRELOAD_SKILLS_CONFIG_PATH = '../../../../opencode-config/compound-engineering.json';

interface PreloadSkillsPluginAdapterOptions {
  readonly configPath?: string;
  readonly loadConfig?: () => Promise<unknown>;
}

export class PreloadSkillsPluginAdapter extends PackageAdapter<PluginsPort> {
  public readonly name = 'preload-skills';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('plugins');
  public readonly required = true;

  private pluginRecord?: PluginRecord;
  private skillCatalog: SkillCatalog = DEFAULT_SKILL_CATALOG;
  private readonly loadedSkills = new Map<string, LoadedSkillRecord>();
  private readonly recommendationCache = new Map<string, SkillRecommendation[]>();
  private readonly analysisCache = new Map<string, ReturnType<typeof analyzeContext>>();

  public constructor(private readonly options: PreloadSkillsPluginAdapterOptions = {}) {
    super();
  }

  public async load(): Promise<void> {
    try {
      this.skillCatalog = parseSkillCatalog(await this.loadConfig());
    } catch (error: unknown) {
      throw new Error(`Failed to load preload-skills config: ${this.toErrorMessage(error)}`);
    }
  }

  public async initialize(): Promise<void> {
    this.skillCatalog = parseSkillCatalog(await this.loadConfig());
    this.pluginRecord = {
      manifest: {
        id: this.name,
        name: this.name,
        version: this.version,
        description: 'preload-skills plugin adapter',
        entrypoint: this.getConfigPath(),
        hooks: [SKILLS_PRELOAD_HOOK, SKILLS_RECOMMEND_HOOK, SKILLS_ANALYZE_CONTEXT_HOOK, SKILLS_GET_LOADED_HOOK],
        capabilities: ['skill-context-analysis', 'skill-preloading', 'skill-recommendation', 'skill-caching'],
        requiredPermissions: []
      },
      state: 'enabled',
      loadedAt: new Date().toISOString()
    };

    this.setPort(this.createPort());
  }

  public healthCheck(): Promise<AdapterHealthInput> {
    if (!this.pluginRecord) {
      return Promise.resolve({ status: 'unhealthy', details: 'Plugin adapter is not initialized' });
    }

    if (this.skillCatalog.skills.length === 0) {
      return Promise.resolve({ status: 'degraded', details: 'Skill catalog is empty' });
    }

    return Promise.resolve({ status: 'healthy' });
  }

  public shutdown(): Promise<void> {
    this.pluginRecord = undefined;
    this.loadedSkills.clear();
    this.recommendationCache.clear();
    this.analysisCache.clear();
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
        status: this.skillCatalog.skills.length > 0 ? 'healthy' : 'degraded',
        details: this.skillCatalog.skills.length > 0 ? undefined : 'Skill catalog is empty',
        checkedAt: new Date().toISOString()
      })
    };
  }

  private handleHook(event: HookEvent): HookResult {
    try {
      if (event.name === SKILLS_ANALYZE_CONTEXT_HOOK) {
        const payload = SkillsAnalyzeContextPayloadSchema.parse(event.payload);
        const analysis = this.analyzeContextCached(payload.context);
        return {
          pluginId: this.name,
          handled: true,
          output: {
            context: SkillContextSchema.parse(payload.context),
            analysis
          }
        };
      }

      if (event.name === SKILLS_RECOMMEND_HOOK) {
        const payload = SkillsRecommendPayloadSchema.parse(event.payload);
        const analysis = this.analyzeContextCached(payload.context);
        const recommendations = this.recommendCached(payload.context)
          .filter((recommendation) => payload.includeLoaded || !this.loadedSkills.has(recommendation.skillId))
          .slice(0, payload.maxSkills);

        return {
          pluginId: this.name,
          handled: true,
          output: {
            analysis,
            recommendations
          }
        };
      }

      if (event.name === SKILLS_PRELOAD_HOOK) {
        const payload = SkillsPreloadPayloadSchema.parse(event.payload);
        const recommendations = this.recommendCached(payload.context).slice(0, payload.maxSkills);
        const order = resolveSkillLoadOrder(recommendations, this.skillCatalog, [...this.loadedSkills.keys()]);
        const selected = selectSkillsForStrategy(payload.strategy, order, this.skillCatalog);

        const loaded: LoadedSkillRecord[] = [];
        const skipped: string[] = [];
        for (const skillId of selected) {
          if (!payload.forceReload && this.loadedSkills.has(skillId)) {
            skipped.push(skillId);
            continue;
          }

          const record: LoadedSkillRecord = {
            skillId,
            loadedAt: new Date().toISOString(),
            strategy: payload.strategy
          };
          this.loadedSkills.set(skillId, record);
          loaded.push(record);
        }

        return {
          pluginId: this.name,
          handled: true,
          output: {
            strategy: payload.strategy,
            recommendations,
            loadOrder: order,
            loaded,
            skipped,
            cache: {
              recommendationEntries: this.recommendationCache.size,
              analysisEntries: this.analysisCache.size
            }
          }
        };
      }

      if (event.name === SKILLS_GET_LOADED_HOOK) {
        const payload = SkillsGetLoadedPayloadSchema.parse(event.payload);
        const loaded = [...this.loadedSkills.values()].sort((left, right) => left.skillId.localeCompare(right.skillId));

        return {
          pluginId: this.name,
          handled: true,
          output: {
            count: loaded.length,
            skills: payload.includeMetadata ? loaded : loaded.map((item) => item.skillId)
          }
        };
      }

      return { pluginId: this.name, handled: false, error: `Unsupported hook: ${event.name}` };
    } catch (error: unknown) {
      return { pluginId: this.name, handled: false, error: this.toErrorMessage(error) };
    }
  }

  private analyzeContextCached(context: z.infer<typeof SkillContextSchema>): ReturnType<typeof analyzeContext> {
    const key = createContextCacheKey(context);
    const cached = this.analysisCache.get(key);
    if (cached) return cached;
    const analysis = analyzeContext(context);
    this.analysisCache.set(key, analysis);
    return analysis;
  }

  private recommendCached(context: z.infer<typeof SkillContextSchema>): SkillRecommendation[] {
    const key = createContextCacheKey(context);
    const cached = this.recommendationCache.get(key);
    if (cached) return cached;
    const recommendations = recommendSkills(this.skillCatalog, this.analyzeContextCached(context));
    this.recommendationCache.set(key, recommendations);
    return recommendations;
  }

  private requirePlugin(): PluginRecord {
    return z
      .object({
        manifest: z.any(),
        state: z.enum(['discovered', 'installed', 'loaded', 'enabled', 'disabled', 'error'])
      })
      .parse(this.pluginRecord) as PluginRecord;
  }

  private async loadConfig(): Promise<unknown> {
    if (this.options.loadConfig) return this.options.loadConfig();
    return {};
  }

  private getConfigPath(): string {
    return this.options.configPath ?? DEFAULT_PRELOAD_SKILLS_CONFIG_PATH;
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
