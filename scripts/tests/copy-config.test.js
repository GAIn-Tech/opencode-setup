import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildRuntimeSafeUserConfig, pruneDeprecatedRuntimeAgentPrompts } from '../copy-config.mjs';

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('copy-config runtime-safe merge', () => {
  test('removes dormant MCP entries while preserving user custom entries', () => {
    const canonicalConfig = {
      plugin: ['opencode-supermemory@2.0.1'],
      mcp: {
        'opencode-context-governor': {
          command: ['node', 'packages/opencode-context-governor/src/mcp-server.mjs'],
          enabled: true,
        },
        'opencode-memory-graph': {
          command: ['node', 'packages/opencode-memory-graph/src/mcp-server.mjs'],
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
        'opencode-dashboard-launcher': {
          command: ['node', 'packages/opencode-dashboard-launcher/src/index.js'],
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
      new Set(['opencode-dashboard-launcher']),
    );

    expect(merged.plugin).toEqual(['custom-plugin']);
    expect(merged.mcp).toEqual({
      'opencode-context-governor': {
        command: ['node', 'packages/opencode-context-governor/src/mcp-server.mjs'],
        enabled: true,
      },
      'opencode-memory-graph': {
        command: ['node', 'packages/opencode-memory-graph/src/mcp-server.mjs'],
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

  test('prunes only deprecated runtime agent prompts', () => {
    const targetConfigDir = mkdtempSync(path.join(tmpdir(), 'copy-config-agents-'));
    tempDirs.push(targetConfigDir);

    const agentsDir = path.join(targetConfigDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(path.join(agentsDir, 'thinker.md'), '# stale\n', 'utf8');
    writeFileSync(path.join(agentsDir, 'memory-keeper.md'), '# stale\n', 'utf8');
    writeFileSync(path.join(agentsDir, 'my-custom-agent.md'), '# keep\n', 'utf8');

    const removed = pruneDeprecatedRuntimeAgentPrompts(targetConfigDir);

    expect(removed.sort()).toEqual(['memory-keeper.md', 'thinker.md']);
    expect(existsSync(path.join(agentsDir, 'thinker.md'))).toBe(false);
    expect(existsSync(path.join(agentsDir, 'memory-keeper.md'))).toBe(false);
    expect(existsSync(path.join(agentsDir, 'my-custom-agent.md'))).toBe(true);
  });
});
