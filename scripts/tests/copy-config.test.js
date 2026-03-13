import { describe, expect, test } from 'bun:test';
import { buildRuntimeSafeUserConfig } from '../copy-config.mjs';

describe('copy-config runtime-safe merge', () => {
  test('removes dormant MCP entries while preserving user custom entries', () => {
    const canonicalConfig = {
      plugin: ['opencode-supermemory@2.0.1'],
      mcp: {
        'opencode-context-governor': {
          command: ['node', 'packages/opencode-context-governor/src/mcp-server.mjs'],
          enabled: true,
        },
        supermemory: {
          url: 'https://mcp.supermemory.ai',
          enabled: true,
        },
      },
    };
    const userConfig = {
      plugin: ['custom-plugin'],
      mcp: {
        'opencode-memory-graph': {
          command: ['node', 'packages/opencode-memory-graph/src/cli.js'],
          enabled: false,
        },
        'my-custom-mcp': {
          command: ['uvx', 'my-mcp'],
          enabled: true,
        },
      },
    };

    const merged = buildRuntimeSafeUserConfig(
      canonicalConfig,
      userConfig,
      new Set(['opencode-memory-graph']),
    );

    expect(merged.plugin).toEqual(['custom-plugin']);
    expect(merged.mcp).toEqual({
      'opencode-context-governor': {
        command: ['node', 'packages/opencode-context-governor/src/mcp-server.mjs'],
        enabled: true,
      },
      'my-custom-mcp': {
        command: ['uvx', 'my-mcp'],
        enabled: true,
      },
      supermemory: {
        url: 'https://mcp.supermemory.ai',
        enabled: true,
      },
    });
  });
});
