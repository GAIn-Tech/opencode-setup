import { describe, expect, test } from 'bun:test';

import { detectReleaseMode, evaluateMcpLatestPolicy, evaluatePluginLatestPolicy } from '../supply-chain-guard.mjs';

describe('supply-chain-guard release-mode policy', () => {
  test('release mode fails on @latest even for default allowlisted MCP', () => {
    const result = evaluateMcpLatestPolicy({
      releaseMode: true,
      env: {},
      mcp: {
        playwright: {
          command: ['bunx', '@playwright/mcp@latest'],
        },
      },
    });

    expect(result.warnings).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('[SCG_RELEASE_LATEST_BLOCKED]');
    expect(result.failures[0]).toContain("MCP 'playwright' uses @latest");
  });

  test('release mode ignores OPENCODE_ALLOW_LATEST_MCP bypass env', () => {
    const env = {
      OPENCODE_ALLOW_LATEST_MCP: 'playwright,sequentialthinking',
      OPENCODE_ALLOW_LATEST_PLUGIN: 'anything',
    };

    const result = evaluateMcpLatestPolicy({
      releaseMode: true,
      env,
      mcp: {
        playwright: {
          command: ['bunx', '@playwright/mcp@latest'],
        },
      },
    });

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('[SCG_RELEASE_LATEST_BLOCKED]');
    expect(result.failures[0]).toContain('Active bypass env ignored in release mode');
    expect(result.failures[0]).toContain('OPENCODE_ALLOW_LATEST_MCP');
  });

  test('non-release mode keeps allowlist behavior', () => {
    const result = evaluateMcpLatestPolicy({
      releaseMode: false,
      env: {},
      mcp: {
        playwright: {
          command: ['bunx', '@playwright/mcp@latest'],
        },
      },
    });

    expect(result.failures).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('[SCG_ALLOWLISTED_LATEST]');
  });

  test('detectReleaseMode supports release flags and strict env', () => {
    expect(detectReleaseMode({ argv: ['node', 'script', '--release'], env: {} })).toBe(true);
    expect(detectReleaseMode({ argv: ['node', 'script'], env: { OPENCODE_PORTABILITY_STRICT: '1' } })).toBe(true);
    expect(detectReleaseMode({ argv: ['node', 'script'], env: {} })).toBe(false);
  });
});

describe('supply-chain-guard plugin policy (P03)', () => {
  test('release mode fails on @latest plugin spec', () => {
    const result = evaluatePluginLatestPolicy({
      releaseMode: true,
      env: {},
      plugins: ['@tarquinen/opencode-dcp@latest', 'oh-my-opencode@3.5.2'],
    });

    expect(result.warnings).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('[SCG_PLUGIN_LATEST_BLOCKED]');
    expect(result.failures[0]).toContain("@tarquinen/opencode-dcp@latest");
  });

  test('release mode fails on multiple @latest plugins', () => {
    const result = evaluatePluginLatestPolicy({
      releaseMode: true,
      env: {},
      plugins: ['@tarquinen/opencode-dcp@latest', 'opencode-rate-limit-fallback@latest'],
    });

    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]).toContain('[SCG_PLUGIN_LATEST_BLOCKED]');
    expect(result.failures[1]).toContain('[SCG_PLUGIN_LATEST_BLOCKED]');
  });

  test('non-release mode allows allowlisted @latest plugins', () => {
    const result = evaluatePluginLatestPolicy({
      releaseMode: false,
      env: {},
      plugins: ['playwright@latest'],
    });

    // playwright is in DEFAULT_LATEST_ALLOWLIST
    expect(result.failures).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('[SCG_PLUGIN_ALLOWLISTED_LATEST]');
  });

  test('non-release mode fails on non-allowlisted @latest plugin', () => {
    const result = evaluatePluginLatestPolicy({
      releaseMode: false,
      env: {},
      plugins: ['@tarquinen/opencode-dcp@latest'],
    });

    expect(result.warnings).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('[SCG_PLUGIN_LATEST_BLOCKED]');
  });

  test('pinned plugins are valid', () => {
    const result = evaluatePluginLatestPolicy({
      releaseMode: true,
      env: {},
      plugins: ['oh-my-opencode@3.5.2', 'opencode-plugin-preload-skills@1.8.0'],
    });

    expect(result.failures).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
