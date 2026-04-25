import { z } from 'zod';

const LegacyAgentConfigSchema = z
  .object({
    model: z.string().min(1).optional(),
    instructions: z.string().min(1).optional(),
    tools: z.array(z.string().min(1)).optional(),
    temperature: z.number().optional()
  })
  .passthrough();

const LegacyAgentsRecordSchema = z.record(z.string(), LegacyAgentConfigSchema);

export const LegacyOhMyOpenCodeModuleSchema = z
  .object({
    createBuiltinAgents: z.function()
  })
  .passthrough();

export type LegacyOhMyOpenCodeModule = z.infer<typeof LegacyOhMyOpenCodeModuleSchema>;
export type LegacyAgentConfig = z.infer<typeof LegacyAgentConfigSchema>;

export interface MappedAgentDefinition {
  readonly id: string;
  readonly role: string;
  readonly model?: string;
  readonly capabilities: readonly string[];
  readonly metadata: Record<string, unknown>;
}

export interface OrchestrationPattern {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly steps: readonly {
    agentId: string;
    objective: string;
  }[];
}

export const WorkflowHookPayloadSchema = z.object({
  patternId: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({})
});

export function parseLegacyOhMyOpenCodeModule(moduleValue: unknown): LegacyOhMyOpenCodeModule {
  const namespace = asRecord(moduleValue);
  const defaultExport = asRecord(namespace.default);
  const candidate = Object.keys(defaultExport).length > 0 ? defaultExport : namespace;

  return LegacyOhMyOpenCodeModuleSchema.parse(candidate);
}

export function parseLegacyAgentConfigs(agentsValue: unknown): Record<string, LegacyAgentConfig> {
  return LegacyAgentsRecordSchema.parse(agentsValue);
}

export function mapLegacyAgentConfig(agentId: string, config: LegacyAgentConfig): MappedAgentDefinition {
  return {
    id: agentId,
    role: mapAgentRole(agentId),
    model: config.model,
    capabilities: config.tools ?? [],
    metadata: {
      instructions: config.instructions,
      temperature: config.temperature
    }
  };
}

export function buildOrchestrationPatterns(agentIds: readonly string[]): OrchestrationPattern[] {
  const available = new Set(agentIds);
  const patterns: OrchestrationPattern[] = [];

  if (available.has('prom') && available.has('atlas') && available.has('sisyphus-junior')) {
    patterns.push({
      id: 'plan-execute-review',
      name: 'Plan, execute, review',
      description: 'Prom plans, Sisyphus-Junior executes, Atlas reviews and coordinates handoff.',
      steps: [
        { agentId: 'prom', objective: 'Create strategic execution plan' },
        { agentId: 'sisyphus-junior', objective: 'Execute implementation tasks' },
        { agentId: 'atlas', objective: 'Review output and orchestrate closure' }
      ]
    });
  }

  if (available.has('librarian') && available.has('prom') && available.has('sisyphus-junior')) {
    patterns.push({
      id: 'research-plan-execute',
      name: 'Research, plan, execute',
      description: 'Librarian gathers references before Prom planning and Sisyphus-Junior execution.',
      steps: [
        { agentId: 'librarian', objective: 'Collect domain and codebase references' },
        { agentId: 'prom', objective: 'Convert findings into an execution plan' },
        { agentId: 'sisyphus-junior', objective: 'Implement plan deliverables' }
      ]
    });
  }

  if (patterns.length === 0 && agentIds.length > 0) {
    patterns.push({
      id: 'single-agent-fallback',
      name: 'Single agent fallback',
      description: 'Fallback orchestration pattern when specialist trio is unavailable.',
      steps: [{ agentId: agentIds[0]!, objective: 'Handle workflow end-to-end' }]
    });
  }

  return patterns;
}

function mapAgentRole(agentId: string): string {
  if (agentId === 'prom' || agentId === 'prometheus') return 'strategic-planner';
  if (agentId === 'sisyphus-junior') return 'executor';
  if (agentId === 'atlas') return 'orchestrator';
  if (agentId === 'librarian') return 'researcher';
  if (agentId === 'oracle') return 'advisor';
  return 'specialist';
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
