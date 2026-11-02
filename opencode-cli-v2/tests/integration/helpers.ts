import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface IntegrationFixture {
  readonly rootDir: string;
  readonly skillsDir: string;
}

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

export async function createIntegrationFixture(): Promise<IntegrationFixture> {
  const rootDir = await mkdtemp(join(tmpdir(), 'opencode-cli-v2-integration-'));
  const skillsDir = join(rootDir, 'skills');
  await mkdir(skillsDir, { recursive: true });

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

  return { rootDir, skillsDir };
}

export async function cleanupIntegrationFixture(rootDir: string): Promise<void> {
  await rm(rootDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
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
