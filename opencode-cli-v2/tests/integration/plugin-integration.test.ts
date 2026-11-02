import { describe, expect, test } from 'bun:test';

import { AdapterLifecycleManager } from '../../src/adapters/lifecycle';
import { OhMyOpenCodePluginAdapter } from '../../src/adapters/plugins/oh-my-opencode';
import { PreloadSkillsPluginAdapter } from '../../src/adapters/plugins/preload-skills';
import { AdapterRegistry } from '../../src/adapters/registry';
import {
  SKILLS_PRELOAD_HOOK,
  SKILLS_RECOMMEND_HOOK
} from '../../src/adapters/plugins/preload-skills-mappings';
import { createLegacyAgentModule } from './helpers';

describe('integration: plugin adapters', () => {
  test('boots plugin adapters and executes plugin hooks through their ports', async () => {
    const orchestrationAdapter = new OhMyOpenCodePluginAdapter({
      loadLegacyModule: async () => createLegacyAgentModule(['prom', 'atlas', 'sisyphus-junior'])
    });

    const preloadAdapter = new PreloadSkillsPluginAdapter({
      loadConfig: async () => ({
        preloadSkills: {
          skills: [
            {
              id: 'test-driven-development',
              keywords: ['test', 'coverage'],
              patterns: ['describe('],
              fileTypes: ['test.ts'],
              taskTypes: ['testing'],
              dependencies: ['verification-before-completion'],
              priority: 10,
              lazyEligible: false
            },
            {
              id: 'verification-before-completion',
              keywords: ['verify'],
              patterns: ['expect('],
              fileTypes: ['test.ts'],
              taskTypes: ['testing'],
              dependencies: [],
              priority: 8,
              lazyEligible: true
            }
          ]
        }
      })
    });

    const registry = new AdapterRegistry();
    await registry.discover([orchestrationAdapter, preloadAdapter]);

    const manager = new AdapterLifecycleManager(registry);
    const summary = await manager.bootstrap();
    expect(summary.health.status).toBe('healthy');

    const orchestrationPort = orchestrationAdapter.getPort();
    const orchestrationPlugins = await orchestrationPort.listPlugins();
    expect(orchestrationPlugins).toHaveLength(1);
    expect(orchestrationPlugins[0]?.manifest.id).toBe('oh-my-opencode');

    const [workflowResult] = await orchestrationPort.runHook({
      name: 'orchestrate.workflow',
      payload: {
        patternId: 'plan-execute-review',
        input: {
          task: 'Create integration tests'
        }
      }
    });
    expect(workflowResult?.handled).toBe(true);

    const preloadPort = preloadAdapter.getPort();
    const [recommendationResult] = await preloadPort.runHook({
      name: SKILLS_RECOMMEND_HOOK,
      payload: {
        context: {
          task: 'Write coverage tests for adapters',
          files: ['tests/integration/adapter-integration.test.ts'],
          patterns: ['describe(', 'expect(']
        },
        maxSkills: 3,
        includeLoaded: true
      }
    });
    expect(recommendationResult?.handled).toBe(true);

    const [preloadResult] = await preloadPort.runHook({
      name: SKILLS_PRELOAD_HOOK,
      payload: {
        context: {
          task: 'Write coverage tests for adapters',
          files: ['tests/integration/adapter-integration.test.ts'],
          patterns: ['describe(', 'expect(']
        },
        strategy: 'eager',
        maxSkills: 3,
        forceReload: false
      }
    });
    expect(preloadResult?.handled).toBe(true);
    expect((preloadResult?.output as { loaded: unknown[] } | undefined)?.loaded.length).toBeGreaterThan(0);

    const shutdown = await manager.shutdownAll();
    expect(shutdown.map((entry) => entry.adapter)).toEqual(['preload-skills', 'oh-my-opencode']);
  });
});
