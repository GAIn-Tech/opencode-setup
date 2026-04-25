import { describe, expect, test } from 'bun:test';

import { AdapterLifecycleManager } from '../../src/adapters/lifecycle';
import { AdapterRegistry } from '../../src/adapters/registry';
import { SkillsAdapter } from '../../src/adapters/packages/skills';
import { TestAdapter } from '../adapters/helpers';
import { cleanupIntegrationFixture, createIntegrationFixture } from './helpers';

describe('integration: adapter lifecycle', () => {
  test('discovers adapters, bootstraps required adapters, and degrades optional failures', async () => {
    const fixture = await createIntegrationFixture();

    try {
      const skillsAdapter = new SkillsAdapter({ skillsDir: fixture.skillsDir });
      const optionalAdapter = new TestAdapter('optional-observer', {
        required: false,
        load: () => {
          throw new Error('optional load failure');
        }
      });

      const registry = new AdapterRegistry();
      const discovered = await registry.discover(() => [skillsAdapter, optionalAdapter]);
      expect(discovered).toEqual({ discovered: 2, registered: 2 });
      expect(registry.size()).toBe(2);

      const manager = new AdapterLifecycleManager(registry);
      const summary = await manager.bootstrap();

      expect(summary.load.map((entry) => [entry.adapter, entry.status])).toEqual([
        ['opencode-skill-loader', 'success'],
        ['optional-observer', 'failed']
      ]);
      expect(summary.initialize).toHaveLength(1);
      expect(summary.initialize[0]?.adapter).toBe('opencode-skill-loader');
      expect(summary.health.status).toBe('healthy');

      const skills = await skillsAdapter.getPort().listSkills();
      expect(skills.map((skill) => skill.name).sort()).toEqual([
        'test-driven-development',
        'verification-before-completion',
        'writing-plans'
      ]);

      const shutdown = await manager.shutdownAll();
      expect(shutdown.map((entry) => entry.adapter)).toEqual([
        'optional-observer',
        'opencode-skill-loader'
      ]);
    } finally {
      await cleanupIntegrationFixture(fixture.rootDir);
    }
  });
});
