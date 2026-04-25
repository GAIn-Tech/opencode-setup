'use strict';

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import the module under test
const {
  SOURCES,
  resolveAgentModel,
  resolveCategoryModel,
  getEffectiveConfig,
  getTelemetryMaps,
  DEFAULT_AGENT_MODELS,
  DEFAULT_CATEGORY_MODELS
} = require('../src/index.js');

describe('Runtime Authority Resolver', () => {
  const originalEnv = { ...process.env };
  
  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('resolveAgentModel', () => {
    test('resolves agent from defaults when no config exists', () => {
      const result = resolveAgentModel('atlas', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      expect(result.modelId).toBe('kimi-k2.5');
      expect(result.provider).toBe('moonshotai');
      expect(result.source).toBe(SOURCES.DEFAULT);
      expect(result.provenance).toContain('default');
    });

    test('resolves agent with hyphenated name', () => {
      const result = resolveAgentModel('multimodal-looker', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      expect(result.modelId).toBe('gemini-3-flash-preview');
      expect(result.provider).toBe('google');
      expect(result.source).toBe(SOURCES.DEFAULT);
    });

    test('returns NOT_FOUND for unknown agent', () => {
      const result = resolveAgentModel('unknown-agent', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      expect(result.source).toBe(SOURCES.NOT_FOUND);
      expect(result.error).toContain('unknown-agent');
    });

    test('returns error for invalid agent name', () => {
      const result = resolveAgentModel('');
      expect(result.source).toBe(SOURCES.NOT_FOUND);
      expect(result.error).toBeDefined();
    });

    test('resolves agent from environment variable override', () => {
      process.env.OPENCODE_AGENT_ATLAS_MODEL = 'claude-opus-4-6';
      
      const result = resolveAgentModel('atlas', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      expect(result.modelId).toBe('claude-opus-4-6');
      expect(result.source).toBe(SOURCES.ENV_OVERRIDE);
      expect(result.provenance).toContain('OPENCODE_AGENT_ATLAS_MODEL');
    });

    test('resolves agent with provider prefix from env', () => {
      process.env.OPENCODE_AGENT_LIBRARIAN_MODEL = 'anthropic/claude-sonnet-4-5';
      
      const result = resolveAgentModel('librarian', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      expect(result.modelId).toBe('claude-sonnet-4-5');
      expect(result.provider).toBe('anthropic');
      expect(result.source).toBe(SOURCES.ENV_OVERRIDE);
    });

    test('resolves agent from repo config', () => {
      // Use the actual repo config
      const repoConfigPath = path.join(__dirname, '..', '..', '..', 'opencode-config', 'oh-my-opencode.json');
      
      const result = resolveAgentModel('atlas', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: repoConfigPath
      });
      
      expect(result.modelId).toBeDefined();
      expect(result.source).toBe(SOURCES.REPO_CONFIG);
      expect(result.provenance).toContain('oh-my-opencode.json');
    });
  });

  describe('resolveCategoryModel', () => {
    test('resolves category from defaults when no config exists', async () => {
      const result = await resolveCategoryModel('deep', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      expect(result.modelId).toBe('glm-5');
      expect(result.provider).toBe('z-ai');
      expect(result.source).toBe(SOURCES.DEFAULT);
    });

    test('resolves category from environment variable override', async () => {
      process.env.OPENCODE_CATEGORY_QUICK_MODEL = 'gpt-5.2';
      
      const result = await resolveCategoryModel('quick', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      expect(result.modelId).toBe('gpt-5.2');
      expect(result.source).toBe(SOURCES.ENV_OVERRIDE);
    });

    test('returns NOT_FOUND for unknown category', async () => {
      const result = await resolveCategoryModel('unknown-category', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      expect(result.source).toBe(SOURCES.NOT_FOUND);
      expect(result.error).toContain('unknown-category');
    });

    test('resolves category from repo config', async () => {
      const repoConfigPath = path.join(__dirname, '..', '..', '..', 'opencode-config', 'oh-my-opencode.json');
      
      const result = await resolveCategoryModel('deep', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: repoConfigPath
      });
      
      expect(result.modelId).toBeDefined();
      expect(result.source).toBe(SOURCES.REPO_CONFIG);
    });
  });

  describe('Precedence chain', () => {
    test('env override takes precedence over repo config', () => {
      process.env.OPENCODE_AGENT_ATLAS_MODEL = 'env-override-model';
      
      const repoConfigPath = path.join(__dirname, '..', '..', '..', 'opencode-config', 'oh-my-opencode.json');
      const result = resolveAgentModel('atlas', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: repoConfigPath
      });
      
      expect(result.modelId).toBe('env-override-model');
      expect(result.source).toBe(SOURCES.ENV_OVERRIDE);
    });

    test('repo config takes precedence over defaults', () => {
      const repoConfigPath = path.join(__dirname, '..', '..', '..', 'opencode-config', 'oh-my-opencode.json');
      
      const result = resolveAgentModel('atlas', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: repoConfigPath
      });
      
      // Should use repo config, not defaults
      expect(result.source).toBe(SOURCES.REPO_CONFIG);
    });
  });

  describe('getEffectiveConfig', () => {
    test('returns snapshot of all resolutions', async () => {
      const snapshot = await getEffectiveConfig({
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.agents).toBeDefined();
      expect(snapshot.categories).toBeDefined();
      expect(Object.keys(snapshot.agents).length).toBeGreaterThan(0);
      expect(Object.keys(snapshot.categories).length).toBeGreaterThan(0);
    });

    test('includes provenance for each resolution', async () => {
      const snapshot = await getEffectiveConfig({
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      for (const [agent, resolution] of Object.entries(snapshot.agents)) {
        expect(resolution.provenance).toBeDefined();
        expect(resolution.source).toBeDefined();
      }
    });
  });

  describe('getTelemetryMaps', () => {
    test('returns CATEGORY_TO_MODEL and AGENT_TO_MODEL maps', async () => {
      const maps = await getTelemetryMaps({
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      expect(maps.CATEGORY_TO_MODEL).toBeDefined();
      expect(maps.AGENT_TO_MODEL).toBeDefined();
      expect(Object.keys(maps.CATEGORY_TO_MODEL).length).toBeGreaterThan(0);
      expect(Object.keys(maps.AGENT_TO_MODEL).length).toBeGreaterThan(0);
    });

    test('map values have modelId and provider', async () => {
      const maps = await getTelemetryMaps({
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      for (const [key, value] of Object.entries(maps.CATEGORY_TO_MODEL)) {
        expect(value.modelId).toBeDefined();
        expect(value.provider).toBeDefined();
      }
      
      for (const [key, value] of Object.entries(maps.AGENT_TO_MODEL)) {
        expect(value.modelId).toBeDefined();
        expect(value.provider).toBeDefined();
      }
    });
  });

  describe('Provenance tracking', () => {
    test('provenance includes source type', () => {
      const result = resolveAgentModel('atlas', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      expect(result.provenance).toBeDefined();
      expect(result.source).toBeDefined();
    });

    test('Thompson Sampling routing takes precedence when modelRouter provided', async () => {
      const mockRouteResult = {
        model: { id: 'thompson-selected-model', provider: 'test-provider' },
        modelId: 'thompson-selected-model',
        reason: 'thompson-sampling:category=deep'
      };
      
      const mockRouter = {
        routeAsync: async (ctx) => {
          expect(ctx.category).toBe('deep');
          return mockRouteResult;
        }
      };
      
      const result = await resolveCategoryModel('deep', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json',
        modelRouter: mockRouter
      });
      
      expect(result.modelId).toBe('thompson-selected-model');
      expect(result.provider).toBe('test-provider');
      expect(result.source).toBe('thompson-sampling');
      expect(result.provenance).toBe('thompson-sampling:category=deep');
    });

    test('falls back to config when modelRouter.routeAsync fails', async () => {
      const mockRouter = {
        routeAsync: async () => { throw new Error('Router unavailable'); }
      };
      
      const result = await resolveCategoryModel('deep', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json',
        modelRouter: mockRouter
      });
      
      // Should fall back to defaults
      expect(result.modelId).toBe('glm-5');
      expect(result.source).toBe(SOURCES.DEFAULT);
    });

    test('falls back to config when modelRouter.routeAsync returns null', async () => {
      const mockRouter = {
        routeAsync: async () => null
      };
      
      const result = await resolveCategoryModel('deep', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json',
        modelRouter: mockRouter
      });
      
      // Should fall back to defaults
      expect(result.modelId).toBe('glm-5');
      expect(result.source).toBe(SOURCES.DEFAULT);
    });
  });

  describe('Provenance details', () => {
    test('provenance for env includes variable name', () => {
      process.env.OPENCODE_AGENT_METIS_MODEL = 'test-model';
      
      const result = resolveAgentModel('metis', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: '/nonexistent/repo-config.json'
      });
      
      expect(result.provenance).toContain('OPENCODE_AGENT_METIS_MODEL');
    });

    test('provenance for file includes path', () => {
      const repoConfigPath = path.join(__dirname, '..', '..', '..', 'opencode-config', 'oh-my-opencode.json');
      
      const result = resolveAgentModel('oracle', {
        homeConfigPath: '/nonexistent/home-config.json',
        repoConfigPath: repoConfigPath
      });
      
      expect(result.provenance).toContain('file:');
      expect(result.provenance).toContain('.json');
    });
  });
});
