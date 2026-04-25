import { describe, expect, test } from 'bun:test';

import { loadConfig } from '../../src/config/loader';
import {
  SKILLS_GET_LOADED_HOOK,
  SKILLS_PRELOAD_HOOK
} from '../../src/adapters/plugins/preload-skills-mappings';
import {
  bootstrapAdapterStack,
  cleanupE2EFixture,
  createE2EFixture,
  createPrompts,
  runCliCommand,
  writeJson
} from './helpers';

describe('e2e: full cli workflows', () => {
  test('executes run -> agent spawn -> task queue workflow from entry to exit', async () => {
    const run = await runCliCommand(['run', '--task', 'ship-workflow']);
    const spawn = await runCliCommand(['agent', 'spawn', '--type', 'prom', '--task', 'ship-workflow']);
    const queue = await runCliCommand(['task', 'queue', 'ship-workflow']);

    expect(run.result.exitCode).toBe(0);
    expect(run.fields.command).toBe('run');
    expect(spawn.result.exitCode).toBe(0);
    expect(spawn.fields.command).toBe('agent');
    expect(spawn.fields.action).toBe('spawn');
    expect(queue.result.exitCode).toBe(0);
    expect(queue.fields.command).toBe('task');
    expect(queue.fields.action).toBe('queue');
  });

  test('supports prompts when task arguments are omitted in chained workflow', async () => {
    const prompts = createPrompts({ taskInput: 'prompted-e2e-task' });
    const run = await runCliCommand(['run'], { prompts });
    const spawn = await runCliCommand(['agent', 'spawn', '--type', 'atlas'], { prompts });
    const queue = await runCliCommand(['task', 'queue'], { prompts });

    expect(run.result.exitCode).toBe(0);
    expect(run.fields.task).toBe('prompted-e2e-task');
    expect(spawn.result.exitCode).toBe(0);
    expect(spawn.fields.task).toBe('prompted-e2e-task');
    expect(queue.result.exitCode).toBe(0);
    expect(queue.fields.task).toBe('prompted-e2e-task');
  });

  test('boots adapters, preloads skills, and executes a loaded skill end-to-end', async () => {
    const fixture = await createE2EFixture();

    try {
      const stack = await bootstrapAdapterStack(fixture.skillsDir);
      const summary = await stack.lifecycle.bootstrap();
      expect(summary.health.status).toBe('healthy');

      const preloadPort = stack.preloadAdapter.getPort();
      const [preload] = await preloadPort.runHook({
        name: SKILLS_PRELOAD_HOOK,
        payload: {
          context: {
            task: 'Write end to end tests with coverage',
            files: ['tests/e2e/cli-workflow.e2e.test.ts'],
            patterns: ['describe(', 'expect(']
          },
          strategy: 'eager',
          maxSkills: 4,
          forceReload: false
        }
      });

      expect(preload?.handled).toBe(true);

      const [loaded] = await preloadPort.runHook({
        name: SKILLS_GET_LOADED_HOOK,
        payload: {
          includeMetadata: false
        }
      });

      const loadedIds = (loaded?.output as { skills: string[] } | undefined)?.skills ?? [];
      expect(loadedIds.length).toBeGreaterThan(0);

      const skillPort = stack.skillsAdapter.getPort();
      const loadedSkillId = loadedIds[0];
      expect(loadedSkillId).toBeDefined();
      if (!loadedSkillId) {
        throw new Error('Expected preloaded skill id');
      }

      const load = await skillPort.loadSkill({ name: loadedSkillId, preload: true });
      expect(load.loaded).toBe(true);

      const execution = await skillPort.executeSkill({
        name: loadedSkillId,
        args: { phase: '5.2' },
        context: { suite: 'e2e' }
      });

      expect(execution.success).toBe(true);
      expect(execution.logs[0]).toContain(`Executed ${loadedSkillId}`);

      const shutdown = await stack.lifecycle.shutdownAll();
      expect(shutdown.length).toBe(3);
    } finally {
      await cleanupE2EFixture(fixture.rootDir);
    }
  });

  test('loads and migrates legacy configuration set as part of workflow startup', async () => {
    const fixture = await createE2EFixture();

    try {
      await writeJson(`${fixture.legacyConfigDir}/opencode.json`, {
        plugin: ['oh-my-opencode'],
        provider: {
          openai: {
            apiKey: '{env:OPENAI_API_KEY}'
          }
        },
        model: {
          default: 'openai/gpt-5.3-codex'
        }
      });

      await writeJson(`${fixture.legacyConfigDir}/antigravity.json`, {
        account_selection_strategy: 'hybrid'
      });

      const loaded = await loadConfig({
        cwd: fixture.rootDir,
        globalPath: `${fixture.rootDir}/missing-global.yaml`,
        projectPath: `${fixture.rootDir}/missing-project.yaml`,
        includeLegacyDiscovery: true
      });

      expect(loaded.config.plugins).toContain('oh-my-opencode');
      expect(loaded.config.models.default).toBe('openai/gpt-5.3-codex');
      expect(loaded.config.antigravity?.account_selection_strategy).toBe('hybrid');
      expect(loaded.sources.legacyPaths.length).toBeGreaterThan(0);
    } finally {
      await cleanupE2EFixture(fixture.rootDir);
    }
  });

  test('threads global --config through chained commands', async () => {
    const configPath = 'workspace-config.yaml';

    const migrate = await runCliCommand(['--config', configPath, 'config', 'migrate']);
    const validate = await runCliCommand(['--config', configPath, 'config', 'validate']);
    const run = await runCliCommand(['--config', configPath, 'run', '--task', 'config-aware-task']);

    expect(migrate.result.exitCode).toBe(0);
    expect(migrate.fields.config).toBe(configPath);
    expect(validate.result.exitCode).toBe(0);
    expect(validate.fields.config).toBe(configPath);
    expect(run.result.exitCode).toBe(0);
    expect(run.fields.config).toBe(configPath);
  });
});
