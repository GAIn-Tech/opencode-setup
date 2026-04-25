import { describe, expect, test } from 'bun:test';

import { detectLegacyFormat, migrateConfigObject } from '../../src/config/migration';

describe('config migration', () => {
  test('detects and migrates opencode.json', () => {
    const legacy = {
      plugin: ['oh-my-opencode', 'antigravity-auth'],
      provider: {
        openai: {
          options: {
            apiKey: '{env:OPENAI_API_KEY}'
          }
        }
      },
      model: {
        default: 'openai/gpt-5.3-codex'
      }
    };

    const format = detectLegacyFormat('opencode.json', legacy);
    const result = migrateConfigObject(legacy, format);

    expect(result.migrated).toBe(true);
    expect(result.config.models.default).toBe('openai/gpt-5.3-codex');
    expect(result.config.plugins).toContain('oh-my-opencode');
  });

  test('migrates oh-my-opencode agent and mcp toggles', () => {
    const legacy = {
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
    };

    const result = migrateConfigObject(legacy, 'oh-my-opencode.json');

    expect(result.config.agents.prometheus?.enabled).toBe(true);
    expect(result.config.mcp.servers.context7?.enabled).toBe(true);
  });

  test('migrates config.yaml global rules and delegation blocks', () => {
    const legacy = {
      global_rules: {
        always_apply: ['development-standards']
      },
      delegation: {
        parallel: {
          enabled: true
        }
      }
    };

    const result = migrateConfigObject(legacy, 'config.yaml');

    expect(result.config.globalRules?.always_apply).toEqual(['development-standards']);
    expect(result.config.delegation?.parallel).toEqual({ enabled: true });
  });

  test('passes through already unified config', () => {
    const unified = {
      version: '2.0',
      plugins: ['opencode-dcp']
    };

    const result = migrateConfigObject(unified, 'unified');

    expect(result.migrated).toBe(false);
    expect(result.config.plugins).toEqual(['opencode-dcp']);
  });
});
