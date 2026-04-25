import { describe, expect, test } from 'bun:test';

import {
  adaptAntigravityConfig,
  adaptCompoundEngineeringConfig,
  adaptLegacyConfigYaml,
  adaptOhMyOpencodeConfig,
  adaptOpencodeConfigJson,
  adaptOpencodeJson
} from '../../src/config/adapters';

describe('legacy config adapters', () => {
  test('adapts opencode.json', () => {
    const adapted = adaptOpencodeJson({
      plugin: ['oh-my-opencode'],
      provider: {
        anthropic: {
          apiKey: '{env:ANTHROPIC_API_KEY}'
        }
      },
      model: {
        default: 'anthropic/claude-sonnet-4-5'
      }
    });

    expect(adapted.plugins).toEqual(['oh-my-opencode']);
    expect(adapted.models?.default).toBe('anthropic/claude-sonnet-4-5');
  });

  test('adapts antigravity.json', () => {
    const adapted = adaptAntigravityConfig({
      account_selection_strategy: 'hybrid'
    });

    expect(adapted.antigravity?.account_selection_strategy).toBe('hybrid');
  });

  test('adapts oh-my-opencode.json', () => {
    const adapted = adaptOhMyOpencodeConfig({
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

    expect(adapted.agents?.prometheus?.enabled).toBe(true);
    expect(adapted.mcp?.servers?.context7?.enabled).toBe(true);
  });

  test('adapts compound-engineering.json', () => {
    const adapted = adaptCompoundEngineeringConfig({
      skills: {
        enabled: ['git-master', 'context7']
      },
      integration: {
        skills_directory: '~/.config/opencode/skills/'
      }
    });

    expect(adapted.skills?.preload).toEqual(['git-master', 'context7']);
    expect(adapted.skills?.registry).toBe('~/.config/opencode/skills/');
  });

  test('adapts config.yaml', () => {
    const adapted = adaptLegacyConfigYaml({
      global_rules: {
        always_apply: ['development-standards']
      }
    });

    expect(adapted.globalRules?.always_apply).toEqual(['development-standards']);
  });

  test('adapts .opencode.config.json', () => {
    const adapted = adaptOpencodeConfigJson({
      runtime: {
        bun: {
          heapLimit: '4096mb'
        }
      }
    });

    expect(adapted.runtime?.bun).toEqual({ heapLimit: '4096mb' });
  });
});
