import { describe, expect, test } from 'bun:test';

import { AdapterLifecycleManager } from '../../src/adapters/lifecycle';
import { SkillsAdapter } from '../../src/adapters/packages/skills';
import { PreloadSkillsPluginAdapter } from '../../src/adapters/plugins/preload-skills';
import {
  SKILLS_GET_LOADED_HOOK,
  SKILLS_PRELOAD_HOOK
} from '../../src/adapters/plugins/preload-skills-mappings';
import { AdapterRegistry } from '../../src/adapters/registry';
import { cleanupIntegrationFixture, createIntegrationFixture } from './helpers';

describe('integration: end-to-end workflow', () => {
  test('preloads recommended skills and executes a selected skill end-to-end', async () => {
    const fixture = await createIntegrationFixture();

    try {
      const skillsAdapter = new SkillsAdapter({ skillsDir: fixture.skillsDir });
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
      await registry.discover([skillsAdapter, preloadAdapter]);

      const lifecycle = new AdapterLifecycleManager(registry);
      const summary = await lifecycle.bootstrap();
      expect(summary.health.status).toBe('healthy');

      const pluginPort = preloadAdapter.getPort();
      const [preload] = await pluginPort.runHook({
        name: SKILLS_PRELOAD_HOOK,
        payload: {
          context: {
            task: 'Add integration tests and improve coverage',
            files: ['tests/integration/workflow-e2e.integration.test.ts'],
            patterns: ['describe(', 'expect(']
          },
          strategy: 'eager',
          maxSkills: 4,
          forceReload: false
        }
      });

      expect(preload?.handled).toBe(true);

      const [loaded] = await pluginPort.runHook({
        name: SKILLS_GET_LOADED_HOOK,
        payload: {
          includeMetadata: false
        }
      });

      expect(loaded?.handled).toBe(true);
      const loadedSkillIds = (loaded?.output as { skills: string[] } | undefined)?.skills ?? [];
      expect(loadedSkillIds.length).toBeGreaterThan(0);

      const skillsPort = skillsAdapter.getPort();
      const availableSkills = await skillsPort.listSkills();
      const runnableSkillId = loadedSkillIds.find((skillId) =>
        availableSkills.some((available) => available.name === skillId)
      );

      expect(runnableSkillId).toBeDefined();
      if (!runnableSkillId) {
        throw new Error('Expected at least one preload recommendation to exist in skills adapter catalog');
      }

      const loadedSkill = await skillsPort.loadSkill({ name: runnableSkillId, preload: true });
      expect(loadedSkill.loaded).toBe(true);

      const execution = await skillsPort.executeSkill({
        name: runnableSkillId,
        args: { phase: 'todo-5.1' },
        context: { area: 'integration-tests' }
      });

      expect(execution.success).toBe(true);
      expect(execution.logs[0]).toContain(`Executed ${runnableSkillId}`);

      await lifecycle.shutdownAll();
    } finally {
      await cleanupIntegrationFixture(fixture.rootDir);
    }
  });
});
