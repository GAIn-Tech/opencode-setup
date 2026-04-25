import { describe, expect, test } from 'bun:test';

import { PackageAdapter } from '../../../src/adapters/base';
import { PreloadSkillsPluginAdapter } from '../../../src/adapters/plugins/preload-skills';

const PRELOAD_HOOK = 'skills.preload';
const RECOMMEND_HOOK = 'skills.recommend';
const ANALYZE_HOOK = 'skills.analyze-context';
const GET_LOADED_HOOK = 'skills.get-loaded';

describe('PreloadSkillsPluginAdapter', () => {
  test('extends package adapter and supports lifecycle', async () => {
    const adapter = createAdapter();
    expect(adapter).toBeInstanceOf(PackageAdapter);

    await adapter.runLoad();
    await adapter.runInitialize();

    const plugins = await adapter.getPort().listPlugins();
    expect(plugins[0]?.manifest.id).toBe('preload-skills');
    expect(plugins[0]?.manifest.hooks).toEqual([PRELOAD_HOOK, RECOMMEND_HOOK, ANALYZE_HOOK, GET_LOADED_HOOK]);

    const health = await adapter.runHealthCheck();
    expect(health.status).toBe('healthy');

    await adapter.runShutdown();
    expect(adapter.getStatus()).toBe('shutdown');
  });

  test('analyzes context for task type, keywords, and file types', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const [result] = await adapter.getPort().runHook({
      name: ANALYZE_HOOK,
      payload: {
        context: {
          task: 'Debug failing test for React component hook',
          files: ['src/components/Button.tsx', 'tests/button.test.ts'],
          patterns: ['useEffect(']
        }
      }
    });

    expect(result?.handled).toBe(true);
    expect(result?.output).toMatchObject({
      analysis: {
        taskType: 'debugging',
        fileTypes: ['tsx', 'ts'],
        patternMatches: ['useeffect(']
      }
    });
  });

  test('recommends matching skills based on context and dependencies', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const [result] = await adapter.getPort().runHook({
      name: RECOMMEND_HOOK,
      payload: {
        context: {
          task: 'Debug failing regression test and verify fix',
          files: ['tests/foo.test.ts'],
          patterns: ['exception']
        },
        maxSkills: 5
      }
    });

    expect(result?.handled).toBe(true);
    const output = result?.output as { recommendations?: { skillId: string; dependencies: string[] }[] } | undefined;
    const recommended = output?.recommendations ?? [];
    expect(recommended[0]?.skillId).toBe('systematic-debugging');
    expect(recommended.find((item) => item.skillId === 'systematic-debugging')?.dependencies).toContain(
      'verification-before-completion'
    );
  });

  test('preloads skills in dependency order and tracks loaded cache', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const [preloadResult] = await adapter.getPort().runHook({
      name: PRELOAD_HOOK,
      payload: {
        context: {
          task: 'Debug failing regression test and verify fix',
          files: ['tests/foo.test.ts'],
          patterns: ['exception']
        },
        strategy: 'eager',
        maxSkills: 5
      }
    });

    expect(preloadResult?.handled).toBe(true);
    const preloadOutput = preloadResult?.output as
      | { loadOrder?: string[]; loaded?: { skillId: string }[]; cache?: { recommendationEntries: number } }
      | undefined;
    expect(preloadOutput?.loadOrder).toContain('verification-before-completion');
    expect(preloadOutput?.loadOrder?.indexOf('verification-before-completion')).toBeLessThan(
      preloadOutput?.loadOrder?.indexOf('systematic-debugging') ?? 999
    );
    expect(preloadOutput?.loaded?.some((item) => item.skillId === 'systematic-debugging')).toBe(true);
    expect(preloadOutput?.cache?.recommendationEntries).toBe(1);

    const [loadedResult] = await adapter.getPort().runHook({
      name: GET_LOADED_HOOK,
      payload: { includeMetadata: true }
    });
    const loadedOutput = loadedResult?.output as { count?: number; skills?: { skillId: string }[] } | undefined;
    expect(loadedOutput?.count).toBeGreaterThan(0);
    expect(loadedOutput?.skills?.some((item) => item.skillId === 'systematic-debugging')).toBe(true);
  });

  test('lazy preload only loads non-lazy-eligible priority set', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const [result] = await adapter.getPort().runHook({
      name: PRELOAD_HOOK,
      payload: {
        context: {
          task: 'Implement React component and add accessibility checks',
          files: ['src/App.tsx'],
          patterns: ['useState(', 'aria-']
        },
        strategy: 'lazy',
        maxSkills: 8
      }
    });

    expect(result?.handled).toBe(true);
    const output = result?.output as { loaded?: { skillId: string }[]; recommendations?: { skillId: string }[] } | undefined;
    const loadedIds = (output?.loaded ?? []).map((item) => item.skillId);
    const recommendedIds = (output?.recommendations ?? []).map((item) => item.skillId);

    expect(recommendedIds).toContain('react-patterns');
    expect(loadedIds).toContain('react-patterns');
    expect(loadedIds.length).toBeLessThanOrEqual(recommendedIds.length);
  });

  test('returns unsupported hook error for unknown events', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const [result] = await adapter.getPort().runHook({
      name: 'skills.unknown',
      payload: {}
    });

    expect(result?.handled).toBe(false);
    expect(result?.error).toContain('Unsupported hook');
  });

  test('fails load when config shape is invalid', async () => {
    const adapter = new PreloadSkillsPluginAdapter({
      loadConfig: async () => ({ preloadSkills: { skills: [{ id: '' }] } })
    });

    await expect(adapter.runLoad()).rejects.toThrow('Failed to load adapter: preload-skills');
  });
});

function createAdapter(): PreloadSkillsPluginAdapter {
  return new PreloadSkillsPluginAdapter({
    loadConfig: async () => ({
      preloadSkills: {
        skills: [
          {
            id: 'systematic-debugging',
            keywords: ['debug', 'failing', 'regression', 'error'],
            fileTypes: ['ts', 'test.ts'],
            patterns: ['exception'],
            taskTypes: ['debugging', 'testing'],
            dependencies: ['verification-before-completion'],
            priority: 10,
            lazyEligible: false
          },
          {
            id: 'verification-before-completion',
            keywords: ['verify', 'validation', 'complete'],
            fileTypes: [],
            patterns: ['passes'],
            taskTypes: ['general', 'testing'],
            dependencies: [],
            priority: 8,
            lazyEligible: false
          },
          {
            id: 'react-patterns',
            keywords: ['react', 'component', 'hook'],
            fileTypes: ['tsx'],
            patterns: ['useState('],
            taskTypes: ['frontend'],
            dependencies: ['accessibility-testing'],
            priority: 7,
            lazyEligible: false
          },
          {
            id: 'accessibility-testing',
            keywords: ['accessibility', 'aria', 'wcag'],
            fileTypes: ['tsx', 'html'],
            patterns: ['aria-'],
            taskTypes: ['frontend'],
            dependencies: [],
            priority: 7,
            lazyEligible: true
          }
        ]
      }
    })
  });
}
