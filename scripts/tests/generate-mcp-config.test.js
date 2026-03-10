import { describe, expect, test } from 'bun:test';
import { buildManifestFromConfig, mergeMcpIntoUserConfig } from '../generate-mcp-config.mjs';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('generate-mcp-config manifest mapping', () => {
  test('uses cfg.enabled as source of truth for manifest entries', () => {
    const config = {
      mcpServers: {
        alpha: { command: 'node', enabled: true },
        beta: { command: 'node', enabled: false },
      },
    };

    const manifest = buildManifestFromConfig(config);
    expect(manifest.mcp_servers).toEqual([
      { name: 'alpha', command: 'node', enabled: true, type: 'local' },
      { name: 'beta', command: 'node', enabled: false, type: 'local' },
    ]);
  });

  test('supports canonical opencode.json mcp shape', () => {
    const config = {
      mcp: {
        remoteA: { url: 'https://example.test/mcp', enabled: true },
        localB: { command: ['node', 'server.js'], enabled: false },
      },
    };

    const manifest = buildManifestFromConfig(config);
    expect(manifest.mcp_servers).toEqual([
      { name: 'remoteA', command: undefined, enabled: true, type: 'remote' },
      { name: 'localB', command: ['node', 'server.js'], enabled: false, type: 'local' },
    ]);
  });

  test('merges source MCP entries into user config while preserving user custom entries', () => {
    const sourceConfig = {
      mcp: {
        'opencode-memory-bus': { command: ['node', 'packages/opencode-memory-bus/mcp-server.js'], enabled: true },
        context7: { url: 'https://mcp.context7.com/mcp', enabled: true },
      },
    };
    const userConfig = {
      plugin: ['custom-plugin'],
      mcp: {
        'my-custom-mcp': { command: ['uvx', 'my-mcp'], enabled: true },
        context7: { url: 'https://old-context7.example/mcp', enabled: false },
      },
    };

    const merged = mergeMcpIntoUserConfig(userConfig, sourceConfig);

    expect(merged.plugin).toEqual(['custom-plugin']);
    expect(merged.mcp['my-custom-mcp']).toEqual({ command: ['uvx', 'my-mcp'], enabled: true });
    expect(merged.mcp.context7).toEqual({ url: 'https://mcp.context7.com/mcp', enabled: true });
    expect(merged.mcp['opencode-memory-bus']).toEqual({
      command: ['node', 'packages/opencode-memory-bus/mcp-server.js'],
      enabled: true,
    });
  });

  test('canonical MCP inventory keeps playwright and removes dead github/tavily entries', () => {
    const canonicalPath = join(import.meta.dir, '..', '..', 'opencode-config', 'opencode.json');
    const canonicalConfig = JSON.parse(readFileSync(canonicalPath, 'utf8'));

    expect(canonicalConfig.mcp.playwright?.enabled).toBe(true);
    expect(canonicalConfig.mcp.github).toBeUndefined();
    expect(canonicalConfig.mcp.tavily).toBeUndefined();
  });
});
