import { describe, expect, test } from 'bun:test';

import { ConfigValidationError, safeValidateConfig } from '../../src/config/validation';
import { loadConfigFile } from '../../src/config/loader';
import { AdapterLifecycleManager } from '../../src/adapters/lifecycle';
import { RequiredAdapterError } from '../../src/adapters/errors';
import { AdapterRegistry } from '../../src/adapters/registry';
import { PreloadSkillsPluginAdapter } from '../../src/adapters/plugins/preload-skills';
import { SKILLS_RECOMMEND_HOOK } from '../../src/adapters/plugins/preload-skills-mappings';
import { TestAdapter } from '../adapters/helpers';
import {
  cleanupE2EFixture,
  createE2EFixture,
  createPrompts,
  runCliCommand,
  writeYaml
} from './helpers';

describe('e2e: error handling and recovery', () => {
  test('gracefully degrades when optional adapter fails to load', async () => {
    const registry = new AdapterRegistry();
    await registry.discover([
      new TestAdapter('required-core', { required: true }),
      new TestAdapter('optional-observer', {
        required: false,
        load: () => {
          throw new Error('optional adapter failed');
        }
      })
    ]);

    const lifecycle = new AdapterLifecycleManager(registry);
    const summary = await lifecycle.bootstrap();
    const failedOptional = summary.load.find((entry) => entry.adapter === 'optional-observer');

    expect(summary.health.status).toBe('healthy');
    expect(failedOptional?.status).toBe('failed');
  });

  test('fails in strict mode when required adapter load fails', async () => {
    const registry = new AdapterRegistry();
    await registry.discover([
      new TestAdapter('required-fail', {
        required: true,
        load: () => {
          throw new Error('required adapter load failure');
        }
      })
    ]);

    const lifecycle = new AdapterLifecycleManager(registry);
    await expect(lifecycle.bootstrap()).rejects.toBeInstanceOf(RequiredAdapterError);
  });

  test('fails in strict mode when required adapter health check is unhealthy', async () => {
    const registry = new AdapterRegistry();
    await registry.discover([
      new TestAdapter('required-unhealthy', {
        required: true,
        healthCheck: () => ({
          status: 'unhealthy',
          details: 'simulated strict mode health failure'
        })
      })
    ]);

    const lifecycle = new AdapterLifecycleManager(registry);

    try {
      await lifecycle.bootstrap();
      throw new Error('Expected lifecycle.bootstrap to fail for unhealthy required adapter');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(RequiredAdapterError);
      if (!(error instanceof RequiredAdapterError)) {
        throw error;
      }

      expect(error.stage).toBe('healthCheck');
    }
  });

  test('returns clean command failure for unknown commands and recovers on next command', async () => {
    const unknown = await runCliCommand(['unknown-subcommand']);
    const run = await runCliCommand(['run', '--task', 'recover-after-error']);

    expect(unknown.result.exitCode).toBe(1);
    expect(unknown.result.stderr).toContain('Unknown command');
    expect(run.result.exitCode).toBe(0);
    expect(run.fields.command).toBe('run');
  });

  test('handles invalid plugin hook payload and continues with valid payload', async () => {
    const adapter = new PreloadSkillsPluginAdapter({
      loadConfig: async () => ({
        preloadSkills: {
          skills: []
        }
      })
    });
    await adapter.load();
    await adapter.initialize();

    const port = adapter.getPort();
    const [invalid] = await port.runHook({
      name: SKILLS_RECOMMEND_HOOK,
      payload: {
        context: {
          files: ['tests/e2e/error-handling.e2e.test.ts'],
          patterns: ['describe(']
        }
      }
    });

    expect(invalid?.handled).toBe(false);
    expect(invalid?.error).toContain('"context"');
    expect(invalid?.error).toContain('"task"');

    const [valid] = await port.runHook({
      name: SKILLS_RECOMMEND_HOOK,
      payload: {
        context: {
          task: 'Validate payload recovery path',
          files: ['tests/e2e/error-handling.e2e.test.ts'],
          patterns: ['describe(']
        },
        maxSkills: 2,
        includeLoaded: true
      }
    });

    expect(valid?.handled).toBe(true);
  });

  test('surfaces invalid config parse and schema validation failures', async () => {
    const fixture = await createE2EFixture();

    try {
      const brokenJsonPath = `${fixture.rootDir}/broken-config.json`;
      const invalidSchemaPath = `${fixture.rootDir}/invalid-config.yaml`;

      await Bun.write(brokenJsonPath, '{ bad-json: true');
      await writeYaml(invalidSchemaPath, {
        version: '2.0',
        context: {
          budget: {
            warning: 1.2
          }
        }
      });

      await expect(loadConfigFile(brokenJsonPath)).rejects.toBeInstanceOf(SyntaxError);
      await expect(loadConfigFile(invalidSchemaPath)).rejects.toBeInstanceOf(ConfigValidationError);
    } finally {
      await cleanupE2EFixture(fixture.rootDir);
    }
  });

  test('safe validation exposes issues for invalid migrated payloads', async () => {
    const invalid = safeValidateConfig({
      version: '2.0',
      context: {
        budget: {
          warning: 4
        }
      }
    });

    expect(invalid.success).toBe(false);
    if (invalid.success) {
      throw new Error('Expected failed validation result');
    }

    expect(invalid.issues.some((issue) => issue.path.includes('context.budget.warning'))).toBe(true);
  });

  test('handles strict command chain failure and then successful fallback command', async () => {
    const prompts = createPrompts({ taskInput: 'fallback-chain-task' });
    const skillInvalid = await runCliCommand(['skills', 'unknown-execution-step']);
    const fallback = await runCliCommand(['skill', 'list'], { prompts });

    expect(skillInvalid.result.exitCode).toBe(1);
    expect(skillInvalid.result.stderr).toContain('Unknown skills subcommand');
    expect(fallback.result.exitCode).toBe(0);
    expect(fallback.fields.action).toBe('list');
  });
});
