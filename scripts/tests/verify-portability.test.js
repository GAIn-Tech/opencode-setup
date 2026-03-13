import { describe, expect, test } from 'bun:test';
import {
  checkPluginCommandFailures,
  checkRequiredEnvFailures,
  extractEnvPlaceholders,
  getEnabledLocalMcpCommands,
  normalizePluginName,
} from '../verify-portability.mjs';

describe('verify-portability helpers', () => {
  test('extractEnvPlaceholders finds nested {env:VAR} tokens', () => {
    const value = {
      provider: {
        google: {
          options: {
            apiKey: '{env:GOOGLE_API_KEYS}',
          },
        },
      },
      mcp: {
        supermemory: {
          headers: {
            Authorization: 'Bearer {env:SUPERMEMORY_API_KEY}',
          },
        },
      },
    };

    const vars = extractEnvPlaceholders(value);
    expect(vars.has('GOOGLE_API_KEYS')).toBe(true);
    expect(vars.has('SUPERMEMORY_API_KEY')).toBe(true);
    expect(vars.size).toBe(2);
  });

  test('getEnabledLocalMcpCommands returns only enabled local servers', () => {
    const mcp = {
      context7: { type: 'remote', url: 'https://mcp.context7.com/mcp', enabled: true },
      distill: { type: 'local', command: ['npx', '-y', 'distill-mcp@0.8.1'], enabled: true },
      tavily: { type: 'local', command: ['npx', '-y', 'tavily-mcp@0.2.16'], enabled: false },
      grep: { type: 'local', command: ['uvx', 'grep-mcp'], enabled: true },
    };

    const commands = getEnabledLocalMcpCommands(mcp);
    expect(commands).toEqual([
      { name: 'distill', command: 'npx' },
      { name: 'grep', command: 'uvx' },
    ]);
  });

  test('normalizePluginName strips npm version suffix', () => {
    expect(normalizePluginName('opencode-supermemory@2.0.1')).toBe('opencode-supermemory');
    expect(normalizePluginName('@scope/plugin@1.2.3')).toBe('@scope/plugin');
    expect(normalizePluginName('@scope/plugin')).toBe('@scope/plugin');
  });

  test('strict mode does not fail when no env placeholders exist', () => {
    const failures = checkRequiredEnvFailures({ provider: {}, mcp: {} }, true);
    expect(failures).toEqual([]);
  });

  test('plugin command requirements are skipped for unrelated plugins', () => {
    const failures = checkPluginCommandFailures({ plugin: ['opencode-supermemory@2.0.1'] });
    expect(failures).toEqual([]);
  });

  test('opencode-beads requires bd command when configured', () => {
    const failures = checkPluginCommandFailures(
      { plugin: ['opencode-beads@0.6.0'] },
      () => null,
    );
    expect(failures).toEqual(["Missing required command 'bd' for configured plugin 'opencode-beads'"]);
  });
});
