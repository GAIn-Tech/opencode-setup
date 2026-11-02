import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

import { executeCli, type CliExecutionOutput } from '../../src/cli';
import type { PromptAdapter } from '../../src/cli/prompts';
import { AdapterLifecycleManager } from '../../src/adapters/lifecycle';
import { SkillsAdapter } from '../../src/adapters/packages/skills';
import { OhMyOpenCodePluginAdapter } from '../../src/adapters/plugins/oh-my-opencode';
import { PreloadSkillsPluginAdapter } from '../../src/adapters/plugins/preload-skills';
import { AdapterRegistry } from '../../src/adapters/registry';

const SKILL_FIXTURES = [
  {
    name: 'test-driven-development',
    description: 'Write failing tests before implementation.',
    tags: ['testing', 'quality'],
    body: ['# Test Driven Development', '', '## Workflow', '1. Red', '2. Green', '3. Refactor']
  },
  {
    name: 'verification-before-completion',
    description: 'Verify outcomes before claiming completion.',
    tags: ['verification', 'quality'],
    body: ['# Verification Before Completion', '', '## Checklist', '- Run checks', '- Confirm expected output']
  },
  {
    name: 'writing-plans',
    description: 'Build implementation plans for complex changes.',
    tags: ['planning'],
    body: ['# Writing Plans', '', '## Output', '- Goal', '- Tasks', '- Validation steps']
  }
] as const;

export interface E2EFixture {
  readonly rootDir: string;
  readonly skillsDir: string;
  readonly globalConfigPath: string;
  readonly projectConfigPath: string;
  readonly legacyConfigDir: string;
}

export interface PromptOverrides {
  readonly taskInput?: string;
  readonly selectedAgent?: string;
  readonly confirmed?: boolean;
}

export function createPrompts(overrides: PromptOverrides = {}): PromptAdapter {
  return {
    askTaskInput: async () => overrides.taskInput ?? 'e2e-task',
    selectAgent: async () => overrides.selectedAgent ?? 'prom-agent',
    confirm: async () => overrides.confirmed ?? true
  };
}

export function parseCommandFields(output: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const tokens = output.split(/\s+/g).filter((token) => token.includes('='));
  for (const token of tokens) {
    const separator = token.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const key = token.slice(0, separator);
    const value = token.slice(separator + 1);
    fields[key] = value;
  }

  return fields;
}

export async function runCliCommand(
  argv: readonly string[],
  options: {
    readonly prompts?: PromptAdapter;
  } = {}
): Promise<{
  readonly result: CliExecutionOutput;
  readonly fields: Record<string, string>;
}> {
  const result = await executeCli(argv, { prompts: options.prompts ?? createPrompts() });
  return {
    result,
    fields: parseCommandFields(result.stdout)
  };
}

export async function createE2EFixture(): Promise<E2EFixture> {
  const rootDir = await mkdtemp(join(tmpdir(), 'opencode-cli-v2-e2e-'));
  const skillsDir = join(rootDir, 'skills');
  const legacyConfigDir = join(rootDir, 'opencode-config');
  const globalConfigPath = join(rootDir, 'global-config.yaml');
  const projectConfigPath = join(rootDir, '.opencode', 'config.yaml');

  await mkdir(skillsDir, { recursive: true });
  await mkdir(legacyConfigDir, { recursive: true });
  await mkdir(join(rootDir, '.opencode'), { recursive: true });

  for (const skill of SKILL_FIXTURES) {
    const dir = join(skillsDir, skill.name);
    await mkdir(dir, { recursive: true });
    const document = [
      '---',
      `name: ${skill.name}`,
      `description: ${skill.description}`,
      'version: 1.0.0',
      `tags: [${skill.tags.join(', ')}]`,
      '---',
      '',
      ...skill.body,
      ''
    ].join('\n');
    await writeFile(join(dir, 'SKILL.md'), document, 'utf8');
  }

  await writeYaml(globalConfigPath, {
    version: '2.0',
    models: {
      default: 'global-model'
    },
    plugins: ['from-global']
  });

  await writeYaml(projectConfigPath, {
    version: '2.0',
    models: {
      default: 'project-model'
    },
    plugins: ['from-project']
  });

  return {
    rootDir,
    skillsDir,
    globalConfigPath,
    projectConfigPath,
    legacyConfigDir
  };
}

export async function cleanupE2EFixture(rootDir: string): Promise<void> {
  await rm(rootDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function writeYaml(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, stringifyYaml(data), 'utf8');
}

export function createLegacyAgentModule(agentIds: readonly string[] = ['prom', 'atlas', 'sisyphus-junior']): {
  createBuiltinAgents: () => Promise<Record<string, { model: string; instructions: string; tools: string[] }>>;
} {
  return {
    createBuiltinAgents: async () =>
      Object.fromEntries(
        agentIds.map((agentId) => [
          agentId,
          {
            model: `model/${agentId}`,
            instructions: `${agentId} instructions`,
            tools: ['read', 'write']
          }
        ])
      )
  };
}

export function createPreloadSkillConfig(): {
  readonly preloadSkills: {
    readonly skills: readonly {
      readonly id: string;
      readonly keywords: readonly string[];
      readonly patterns: readonly string[];
      readonly fileTypes: readonly string[];
      readonly taskTypes: readonly string[];
      readonly dependencies: readonly string[];
      readonly priority: number;
      readonly lazyEligible: boolean;
    }[];
  };
} {
  return {
    preloadSkills: {
      skills: [
        {
          id: 'test-driven-development',
          keywords: ['test', 'coverage', 'workflow'],
          patterns: ['describe(', 'expect('],
          fileTypes: ['test.ts'],
          taskTypes: ['testing'],
          dependencies: ['verification-before-completion'],
          priority: 10,
          lazyEligible: false
        },
        {
          id: 'verification-before-completion',
          keywords: ['verify', 'completion'],
          patterns: ['expect('],
          fileTypes: ['test.ts'],
          taskTypes: ['testing'],
          dependencies: [],
          priority: 8,
          lazyEligible: true
        }
      ]
    }
  };
}

export async function bootstrapAdapterStack(skillsDir: string): Promise<{
  readonly registry: AdapterRegistry;
  readonly lifecycle: AdapterLifecycleManager;
  readonly skillsAdapter: SkillsAdapter;
  readonly preloadAdapter: PreloadSkillsPluginAdapter;
  readonly orchestrationAdapter: OhMyOpenCodePluginAdapter;
}> {
  const skillsAdapter = new SkillsAdapter({ skillsDir });
  const preloadAdapter = new PreloadSkillsPluginAdapter({
    loadConfig: async () => createPreloadSkillConfig()
  });
  const orchestrationAdapter = new OhMyOpenCodePluginAdapter({
    loadLegacyModule: async () => createLegacyAgentModule()
  });

  const registry = new AdapterRegistry();
  await registry.discover([skillsAdapter, preloadAdapter, orchestrationAdapter]);
  const lifecycle = new AdapterLifecycleManager(registry);

  return {
    registry,
    lifecycle,
    skillsAdapter,
    preloadAdapter,
    orchestrationAdapter
  };
}
