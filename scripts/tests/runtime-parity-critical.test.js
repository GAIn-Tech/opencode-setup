import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILES } from '../copy-config.mjs';

const root = process.cwd();

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

describe('critical runtime parity safeguards', () => {
  test('canonical opencode config pins critical plugin versions', () => {
    const config = readJson('opencode-config/opencode.json');
    expect(config.plugin).toContain('oh-my-openagent@3.16.0');
    expect(config.plugin).toContain('@guard22/opencode-multi-auth-codex@1.4.2');
    expect(config.plugin.some((entry) => typeof entry === 'string' && entry.includes('oh-my-opencode@'))).toBe(false);
  });

  test('canonical plugin pins file exists and pins critical plugins', () => {
    const pins = readJson('opencode-config/plugin-pins.json');
    expect(pins['oh-my-openagent']).toBe('oh-my-openagent@3.16.0');
    expect(pins['@guard22/opencode-multi-auth-codex']).toBe('@guard22/opencode-multi-auth-codex@1.4.2');
    expect(pins['oh-my-opencode']).toBeUndefined();
  });

  test('copy-config sync surface includes plugin-pins.json', () => {
    expect(CONFIG_FILES).toContain('plugin-pins.json');
  });
});
