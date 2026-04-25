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
  buildOrchestrationPatterns,
  mapLegacyAgentConfig,
  parseLegacyAgentConfigs,
  parseLegacyOhMyOpenCodeModule,
  WorkflowHookPayloadSchema,
  type OrchestrationPattern
} from './oh-my-opencode-mappings';

const DEFAULT_LEGACY_MODULE_PATH = '../../../../local/oh-my-opencode/src/agents/index.ts';

export interface RegisteredAgent {
  readonly id: string;
  readonly role: string;
  readonly model?: string;
  readonly capabilities: readonly string[];
  readonly metadata: Record<string, unknown>;
}

export interface AgentRegistry {
  registerAgent(agent: RegisteredAgent): Promise<void> | void;
}

export interface PluginAdapter {
  readonly name: string;
  readonly version: string;
  initialize(): Promise<void>;
  registerAgents(registry: AgentRegistry): Promise<void>;
  getOrchestrationPatterns(): OrchestrationPattern[];
}

abstract class PluginPackageAdapter extends PackageAdapter<PluginsPort> implements PluginAdapter {
  public abstract registerAgents(registry: AgentRegistry): Promise<void>;
  public abstract getOrchestrationPatterns(): OrchestrationPattern[];
}

interface OhMyOpenCodePluginAdapterOptions {
  readonly modulePath?: string;
  readonly loadLegacyModule?: () => Promise<unknown>;
}

export class OhMyOpenCodePluginAdapter extends PluginPackageAdapter {
  public readonly name = 'oh-my-opencode';
  public readonly version = '2.0.0';
  public readonly portType = Symbol.for('plugins');
  public readonly required = true;

  private pluginRecord?: PluginRecord;
  private registeredAgents: RegisteredAgent[] = [];
  private orchestrationPatterns: OrchestrationPattern[] = [];

  public constructor(private readonly options: OhMyOpenCodePluginAdapterOptions = {}) {
    super();
  }

  public async load(): Promise<void> {
    try {
      parseLegacyOhMyOpenCodeModule(await this.loadLegacyModule());
    } catch (error: unknown) {
      throw new Error(`Failed to load oh-my-opencode legacy module: ${this.toErrorMessage(error)}`);
    }
  }

  public async initialize(): Promise<void> {
    const module = parseLegacyOhMyOpenCodeModule(await this.loadLegacyModule());
    const legacyAgents = parseLegacyAgentConfigs(await module.createBuiltinAgents());

    this.registeredAgents = Object.entries(legacyAgents).map(([agentId, config]) =>
      mapLegacyAgentConfig(agentId, config)
    );
    this.orchestrationPatterns = buildOrchestrationPatterns(this.registeredAgents.map((agent) => agent.id));
    this.pluginRecord = {
      manifest: {
        id: this.name,
        name: this.name,
        version: this.version,
        description: 'oh-my-opencode plugin adapter',
        entrypoint: this.getLegacyModulePath(),
        hooks: ['orchestrate.workflow'],
        capabilities: ['agent-registration', 'multi-agent-orchestration'],
        requiredPermissions: []
      },
      state: 'enabled',
      loadedAt: new Date().toISOString()
    };

    this.setPort(this.createPort());
  }

  public getOrchestrationPatterns(): OrchestrationPattern[] {
    return [...this.orchestrationPatterns];
  }

  public async registerAgents(registry: AgentRegistry): Promise<void> {
    for (const agent of this.registeredAgents) {
      await registry.registerAgent(agent);
    }
  }

  public healthCheck(): Promise<AdapterHealthInput> {
    if (!this.pluginRecord) {
      return Promise.resolve({ status: 'unhealthy', details: 'Plugin adapter is not initialized' });
    }

    if (this.registeredAgents.length === 0) {
      return Promise.resolve({ status: 'degraded', details: 'No agents registered from legacy module' });
    }

    return Promise.resolve({ status: 'healthy' });
  }

  public shutdown(): Promise<void> {
    this.pluginRecord = undefined;
    this.registeredAgents = [];
    this.orchestrationPatterns = [];
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
        status: this.registeredAgents.length > 0 ? 'healthy' : 'degraded',
        details: this.registeredAgents.length > 0 ? undefined : 'No agents registered',
        checkedAt: new Date().toISOString()
      })
    };
  }

  private handleHook(event: HookEvent): HookResult {
    if (event.name !== 'orchestrate.workflow') {
      return { pluginId: this.name, handled: false, error: `Unsupported hook: ${event.name}` };
    }

    try {
      const payload = WorkflowHookPayloadSchema.parse(event.payload);
      const pattern = this.orchestrationPatterns.find((candidate) => candidate.id === payload.patternId);
      if (!pattern) {
        throw new Error(`Unknown orchestration pattern: ${payload.patternId}`);
      }

      return {
        pluginId: this.name,
        handled: true,
        output: {
          patternId: pattern.id,
          status: 'completed',
          input: payload.input,
          steps: pattern.steps.map((step, index) => ({ ...step, order: index + 1, status: 'completed' }))
        }
      };
    } catch (error: unknown) {
      return { pluginId: this.name, handled: false, error: this.toErrorMessage(error) };
    }
  }

  private requirePlugin(): PluginRecord {
    return z
      .object({
        manifest: z.any(),
        state: z.enum(['discovered', 'installed', 'loaded', 'enabled', 'disabled', 'error'])
      })
      .parse(this.pluginRecord) as PluginRecord;
  }

  private async loadLegacyModule(): Promise<unknown> {
    if (this.options.loadLegacyModule) return this.options.loadLegacyModule();
    return import(this.getLegacyModulePath());
  }

  private getLegacyModulePath(): string {
    return this.options.modulePath ?? DEFAULT_LEGACY_MODULE_PATH;
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
