import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateOpencodeConfig, validateOpencodeConfigFile } from '../../opencode-config/validate-schema.js';

const tempDirs = [];

function makeTempDir(prefix = 'validate-opencode-schema-') {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createValidConfig() {
  return {
    schema_version: '1.0.0',
    plugin: ['opencode-supermemory@2.0.1'],
    provider: {
      openai: {
        npm: '@ai-sdk/openai',
        options: {
          apiKey: '{env:OPENAI_API_KEYS}'
        },
        models: {
          'gpt-5.3-codex': {
            name: 'GPT-5.3 Codex',
            limit: { context: 400000, output: 100000 },
            modalities: {
              input: ['text'],
              output: ['text']
            }
          }
        }
      }
    },
    skills: {
      'context7-skill': {
        description: 'Use when looking up library docs'
      }
    },
    agents: {
      planner: {
        model: 'openai/gpt-5.3-codex',
        skills: ['context7-skill']
      }
    },
    learning_updates: {
      enabled: true,
      cadence_days: 7
    },
    default_model: 'openai/gpt-5.3-codex',
    mcp: {
      context7: {
        type: 'remote',
        url: 'https://mcp.context7.com/mcp',
        enabled: true
      }
    },
    permission: {
      read: 'allow'
    }
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('validate-opencode-schema', () => {
  test('accepts valid config shape', () => {
    const result = validateOpencodeConfig(createValidConfig());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('fails on malformed top-level types', () => {
    const config = createValidConfig();
    config.plugin = 'opencode-supermemory@2.0.1';
    config.provider = [];

    const result = validateOpencodeConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('plugin'))).toBe(true);
    expect(result.errors.some((e) => e.includes('provider'))).toBe(true);
  });

  test('validates agent skill cross references', () => {
    const config = createValidConfig();
    config.agents.planner.skills.push('missing-skill');

    const result = validateOpencodeConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('missing-skill'))).toBe(true);
  });

  test('validates model references across fields', () => {
    const config = createValidConfig();
    config.default_model = 'openai/does-not-exist';
    config.agents.planner.model = 'openai/also-missing';

    const result = validateOpencodeConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('default_model'))).toBe(true);
    expect(result.errors.some((e) => e.includes('agents.planner.model'))).toBe(true);
  });

  test('supports file-based validation', () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'opencode.json');
    writeJson(filePath, createValidConfig());

    const result = validateOpencodeConfigFile(filePath);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('CLI exits non-zero on invalid config', () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'opencode.json');
    const config = createValidConfig();
    config.agents.planner.skills = ['missing-skill'];
    writeJson(filePath, config);

    const cliPath = path.join(process.cwd(), 'opencode-config', 'validate-schema.js');
    const result = spawnSync('node', [cliPath, '--file', filePath], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stderr.includes('missing-skill') || result.stdout.includes('missing-skill')).toBe(true);
  });
});
