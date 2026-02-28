import { describe, expect, test } from 'bun:test';
import { buildManifestFromConfig } from '../generate-mcp-config.mjs';

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
});
