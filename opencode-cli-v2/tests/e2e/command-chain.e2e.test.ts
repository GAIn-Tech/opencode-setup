import { describe, expect, test } from 'bun:test';

import { SKILLS_PRELOAD_HOOK, SKILLS_RECOMMEND_HOOK } from '../../src/adapters/plugins/preload-skills-mappings';
import { loadConfig } from '../../src/config/loader';
import {
  bootstrapAdapterStack,
  cleanupE2EFixture,
  createE2EFixture,
  createPrompts,
  runCliCommand,
  writeJson
} from './helpers';

describe('e2e: command chains', () => {
  test('chains config migrate -> config validate', async () => {
    const migrate = await runCliCommand(['config', 'migrate', '--config', 'legacy.yaml']);
    const validate = await runCliCommand(['config', 'validate', '--config', 'legacy.yaml']);

    expect(migrate.result.exitCode).toBe(0);
    expect(migrate.fields.command).toBe('config');
    expect(migrate.fields.action).toBe('migrate');
    expect(validate.result.exitCode).toBe(0);
    expect(validate.fields.action).toBe('validate');
    expect(validate.fields.config).toBe('legacy.yaml');
  });

  test('chains agent spawn -> task queue -> task list', async () => {
    const prompts = createPrompts({ taskInput: 'chain-task' });
    const spawn = await runCliCommand(['agent', 'spawn', '--type', 'sisyphus-junior'], { prompts });
    const queue = await runCliCommand(['task', 'queue'], { prompts });
    const list = await runCliCommand(['task', 'list']);

    expect(spawn.result.exitCode).toBe(0);
    expect(spawn.fields.action).toBe('spawn');
    expect(queue.result.exitCode).toBe(0);
    expect(queue.fields.action).toBe('queue');
    expect(list.result.exitCode).toBe(0);
    expect(list.fields.action).toBe('list');
  });

  test('chains skill list -> skill info -> skill execution via skills adapter', async () => {
    const fixture = await createE2EFixture();

    try {
      const list = await runCliCommand(['skill', 'list']);
      const info = await runCliCommand(['skills', 'info', 'test-driven-development']);

      expect(list.result.exitCode).toBe(0);
      expect(list.fields.command).toBe('skills');
      expect(list.fields.action).toBe('list');
      expect(info.result.exitCode).toBe(0);
      expect(info.fields.name).toBe('test-driven-development');

      const stack = await bootstrapAdapterStack(fixture.skillsDir);
      await stack.lifecycle.bootstrap();
      const skillsPort = stack.skillsAdapter.getPort();
      const load = await skillsPort.loadSkill({ name: 'test-driven-development', preload: true });
      const execute = await skillsPort.executeSkill({
        name: 'test-driven-development',
        args: { mode: 'chain' },
        context: { suite: 'command-chain' }
      });

      expect(load.loaded).toBe(true);
      expect(execute.success).toBe(true);
      expect(execute.logs[0]).toContain('Executed test-driven-development');

      await stack.lifecycle.shutdownAll();
    } finally {
      await cleanupE2EFixture(fixture.rootDir);
    }
  });

  test('chains plugin hooks recommend -> preload and returns loaded skills', async () => {
    const fixture = await createE2EFixture();

    try {
      const stack = await bootstrapAdapterStack(fixture.skillsDir);
      await stack.lifecycle.bootstrap();

      const pluginPort = stack.preloadAdapter.getPort();
      const [recommend] = await pluginPort.runHook({
        name: SKILLS_RECOMMEND_HOOK,
        payload: {
          context: {
            task: 'Add integration coverage tests',
            files: ['tests/e2e/command-chain.e2e.test.ts'],
            patterns: ['describe(', 'expect(']
          },
          maxSkills: 4,
          includeLoaded: true
        }
      });

      expect(recommend?.handled).toBe(true);

      const [preload] = await pluginPort.runHook({
        name: SKILLS_PRELOAD_HOOK,
        payload: {
          context: {
            task: 'Add integration coverage tests',
            files: ['tests/e2e/command-chain.e2e.test.ts'],
            patterns: ['describe(', 'expect(']
          },
          strategy: 'eager',
          maxSkills: 4,
          forceReload: false
        }
      });

      const loaded = (preload?.output as { loaded: unknown[] } | undefined)?.loaded ?? [];
      expect(preload?.handled).toBe(true);
      expect(loaded.length).toBeGreaterThan(0);

      await stack.lifecycle.shutdownAll();
    } finally {
      await cleanupE2EFixture(fixture.rootDir);
    }
  });

  test('chains legacy config discovery with CLI validate output', async () => {
    const fixture = await createE2EFixture();

    try {
      await writeJson(`${fixture.legacyConfigDir}/oh-my-opencode.json`, {
        agents: {
          enabled: ['prometheus'],
          prometheus: {
            model: 'openai/gpt-5.3-codex'
          }
        },
        mcp: {
          context7: {
            enabled: true
          }
        }
      });

      const loaded = await loadConfig({
        cwd: fixture.rootDir,
        globalPath: `${fixture.rootDir}/missing-global.yaml`,
        projectPath: `${fixture.rootDir}/missing-project.yaml`,
        includeLegacyDiscovery: true
      });

      expect(loaded.config.agents.prometheus?.enabled).toBe(true);
      expect(loaded.config.mcp.servers.context7?.enabled).toBe(true);

      const validate = await runCliCommand(['--config', 'legacy-migrated.yaml', 'config', 'validate']);
      expect(validate.result.exitCode).toBe(0);
      expect(validate.fields.config).toBe('legacy-migrated.yaml');
    } finally {
      await cleanupE2EFixture(fixture.rootDir);
    }
  });
});
