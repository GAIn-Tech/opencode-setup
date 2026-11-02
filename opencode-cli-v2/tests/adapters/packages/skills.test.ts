import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { SkillsAdapter } from '../../../src/adapters/packages/skills';
import { SkillsAdapterError } from '../../../src/adapters/packages/skills-errors';

const BRAINSTORMING_SKILL = `---
name: brainstorming
description: Explore feature intent before implementation.
version: 2.1.0
tags: [creative, planning, design]
---

# Brainstorming

## When to Use
- creating features
- modifying behavior

## Workflow
1. Clarify requirements
2. Compare options
3. Confirm chosen approach
`;

const GIT_SKILL = `---
name: git-master
description: Perform safe git operations.
version: 1.0.0
tags: [git, version-control]
---

# Git Master

## When to Use
- commit changes
- review git history

## Quick Start
- inspect status
- stage files
- create commit
`;

async function setupSkillsDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'opencode-cli-v2-skills-adapter-'));
  await mkdir(join(root, 'brainstorming'), { recursive: true });
  await mkdir(join(root, 'git-master'), { recursive: true });
  await writeFile(join(root, 'brainstorming', 'SKILL.md'), BRAINSTORMING_SKILL, 'utf8');
  await writeFile(join(root, 'git-master', 'SKILL.md'), GIT_SKILL, 'utf8');
  return root;
}

async function withInitializedAdapter(
  fn: (adapter: SkillsAdapter) => Promise<void>,
  options: ConstructorParameters<typeof SkillsAdapter>[0] = {}
): Promise<void> {
  const skillsDir = await setupSkillsDirectory();
  const adapter = new SkillsAdapter({ skillsDir, ...options });
  await adapter.runLoad();
  await adapter.runInitialize();

  try {
    await fn(adapter);
  } finally {
    await adapter.runShutdown();
    await rm(skillsDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
  }
}

describe('SkillsAdapter', () => {
  test('loads, initializes, health checks, and lists skills from filesystem', async () => {
    await withInitializedAdapter(async (adapter) => {
      const health = await adapter.runHealthCheck();
      const skills = await adapter.getPort().listSkills();

      expect(adapter.getStatus()).toBe('ready');
      expect(health.status).toBe('healthy');
      expect(skills).toHaveLength(2);
      expect(skills[0]?.name).toBe('brainstorming');
      expect(skills[0]?.version).toBe('2.1.0');
      expect(skills[0]?.entrypoint.endsWith('SKILL.md')).toBe(true);
      expect(skills[0]?.tags).toContain('creative');
    });
  });

  test('loads, fetches, and unloads a skill', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();
      const loaded = await port.loadSkill({ name: 'brainstorming', preload: true });
      const info = await port.getSkill('brainstorming');

      expect(loaded.loaded).toBe(true);
      expect(loaded.metadata?.name).toBe('brainstorming');
      expect(info?.description).toContain('feature intent');

      await port.unloadSkill('brainstorming');
    });
  });

  test('executes skill with fallback filesystem runtime', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();
      await port.loadSkill({ name: 'git-master', preload: false });
      const result = await port.executeSkill({
        name: 'git-master',
        args: { message: 'feat: add adapter' },
        context: { taskType: 'commit' }
      });

      expect(result.success).toBe(true);
      expect(result.logs[0]).toContain('Executed git-master');
      expect(result.output).toEqual(
        expect.objectContaining({
          description: 'Perform safe git operations.',
          args: { message: 'feat: add adapter' }
        })
      );
    });
  });

  test('selects contextual skills and validates skill definitions', async () => {
    await withInitializedAdapter(async (adapter) => {
      const selected = await adapter.selectSkillsForContext({
        task: 'I am creating features and modifying behavior in this module'
      });

      expect(selected).toContain('brainstorming');
      expect(await adapter.validateSkill('brainstorming')).toBe(true);
      expect(await adapter.validateSkill('missing-skill')).toBe(false);
    });
  });

  test('uses legacy runtime hooks for execution and contextual selection', async () => {
    const calls: string[] = [];
    await withInitializedAdapter(
      async (adapter) => {
        const port = adapter.getPort();
        await port.loadSkill({ name: 'brainstorming', preload: false });

        const executed = await port.executeSkill({ name: 'brainstorming', args: { mode: 'fast' } });
        const selected = await adapter.selectSkillsForContext({ taskType: 'creative' });
        const valid = await adapter.validateSkill('brainstorming');

        expect(executed.output).toEqual({ ok: true, mode: 'fast' });
        expect(selected).toEqual(['brainstorming']);
        expect(valid).toBe(true);
        expect(calls).toEqual(['load:brainstorming', 'execute:brainstorming', 'select', 'validate:brainstorming']);
      },
      {
        loadLegacyModule: async () => ({
          loadSkill(name: string) {
            calls.push(`load:${name}`);
          },
          executeSkill(name: string, args?: Record<string, unknown>) {
            calls.push(`execute:${name}`);
            return { ok: true, mode: args?.mode };
          },
          selectSkillsForContext() {
            calls.push('select');
            return ['brainstorming'];
          },
          validateSkill(name: string) {
            calls.push(`validate:${name}`);
            return true;
          }
        })
      }
    );
  });

  test('maps invalid payloads and missing skills to adapter errors', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();

      await expect(port.loadSkill({ name: '', preload: false })).rejects.toBeInstanceOf(SkillsAdapterError);
      await expect(port.unloadSkill('does-not-exist')).rejects.toBeInstanceOf(SkillsAdapterError);
      await expect(port.executeSkill({ name: 'does-not-exist', args: {} })).rejects.toBeInstanceOf(SkillsAdapterError);
    });
  });
});
