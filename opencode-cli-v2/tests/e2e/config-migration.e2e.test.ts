import { describe, expect, test } from 'bun:test';

import { loadConfig, loadConfigFile } from '../../src/config/loader';
import { detectLegacyFormat, migrateConfigObject } from '../../src/config/migration';
import { ConfigValidationError } from '../../src/config/validation';
import {
  cleanupE2EFixture,
  createE2EFixture,
  runCliCommand,
  writeJson,
  writeYaml
} from './helpers';

describe('e2e: configuration migration', () => {
  test('migrates opencode.json to unified config with plugins and models', async () => {
    const fixture = await createE2EFixture();

    try {
      const legacyPath = `${fixture.rootDir}/opencode.json`;
      await writeJson(legacyPath, {
        plugin: ['oh-my-opencode', 'antigravity-auth'],
        provider: {
          openai: {
            apiKey: '{env:OPENAI_API_KEY}'
          }
        },
        model: {
          default: 'openai/gpt-5.3-codex'
        }
      });

      const loaded = await loadConfigFile(legacyPath);
      expect(loaded.format).toBe('opencode.json');
      expect(loaded.migrated).toBe(true);
      expect(loaded.config.models.default).toBe('openai/gpt-5.3-codex');
      expect(loaded.config.plugins).toContain('oh-my-opencode');
    } finally {
      await cleanupE2EFixture(fixture.rootDir);
    }
  });

  test('migrates oh-my-opencode agent and mcp entries with backward compatibility', async () => {
    const fixture = await createE2EFixture();

    try {
      const legacyPath = `${fixture.rootDir}/oh-my-opencode.json`;
      await writeJson(legacyPath, {
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

      const loaded = await loadConfigFile(legacyPath);
      expect(loaded.migrated).toBe(true);
      expect(loaded.config.agents.prometheus?.enabled).toBe(true);
      expect(loaded.config.agents.prometheus?.model).toBe('openai/gpt-5.3-codex');
      expect(loaded.config.mcp.servers.context7?.enabled).toBe(true);
    } finally {
      await cleanupE2EFixture(fixture.rootDir);
    }
  });

  test('migrates config.yaml and preserves delegation/global rules compatibility', async () => {
    const fixture = await createE2EFixture();

    try {
      const legacyPath = `${fixture.rootDir}/config.yaml`;
      await writeYaml(legacyPath, {
        global_rules: {
          always_apply: ['development-standards']
        },
        delegation: {
          parallel: {
            enabled: true
          }
        }
      });

      const loaded = await loadConfigFile(legacyPath);
      expect(loaded.migrated).toBe(true);
      expect(loaded.config.globalRules?.always_apply).toEqual(['development-standards']);
      expect(loaded.config.delegation?.parallel).toEqual({ enabled: true });
    } finally {
      await cleanupE2EFixture(fixture.rootDir);
    }
  });

  test('discovers and merges multi-file legacy config sets from opencode-config directory', async () => {
    const fixture = await createE2EFixture();

    try {
      await writeJson(`${fixture.legacyConfigDir}/opencode.json`, {
        plugin: ['oh-my-opencode'],
        model: {
          default: 'model-from-opencode'
        }
      });

      await writeJson(`${fixture.legacyConfigDir}/antigravity.json`, {
        account_selection_strategy: 'hybrid'
      });

      await writeJson(`${fixture.legacyConfigDir}/oh-my-opencode.json`, {
        agents: {
          enabled: ['atlas'],
          atlas: {
            model: 'model-from-agent'
          }
        }
      });

      const loaded = await loadConfig({
        cwd: fixture.rootDir,
        globalPath: `${fixture.rootDir}/missing-global.yaml`,
        projectPath: `${fixture.rootDir}/missing-project.yaml`,
        includeLegacyDiscovery: true
      });

      expect(loaded.config.models.default).toBe('model-from-opencode');
      expect(loaded.config.antigravity?.account_selection_strategy).toBe('hybrid');
      expect(loaded.config.agents.atlas?.enabled).toBe(true);
      expect(loaded.sources.legacyPaths.some((path) => path.endsWith('opencode.json'))).toBe(true);
      expect(loaded.sources.legacyPaths.some((path) => path.endsWith('antigravity.json'))).toBe(true);
      expect(loaded.sources.legacyPaths.some((path) => path.endsWith('oh-my-opencode.json'))).toBe(true);
    } finally {
      await cleanupE2EFixture(fixture.rootDir);
    }
  });

  test('detectLegacyFormat and migrateConfigObject support automatic migration flow', () => {
    const legacy = {
      provider: {
        openai: {
          apiKey: '{env:OPENAI_API_KEY}'
        }
      },
      plugin: ['opencode-dcp']
    };

    const format = detectLegacyFormat('unlabeled-config.json', legacy);
    const migrated = migrateConfigObject(legacy, format, 'unlabeled-config.json');

    expect(format).toBe('opencode.json');
    expect(migrated.migrated).toBe(true);
    expect(migrated.config.plugins).toEqual(['opencode-dcp']);
    expect(migrated.config.legacy.sources).toContain('unlabeled-config.json');
  });

  test('rejects invalid migrated payloads with schema errors', () => {
    const invalidUnified = {
      version: '2.0',
      context: {
        budget: {
          warning: 9
        }
      }
    };

    expect(() => migrateConfigObject(invalidUnified, 'unified')).toThrow(ConfigValidationError);
  });

  test('chains CLI config migrate -> validate after migration load', async () => {
    const migrate = await runCliCommand(['--config', 'migrated.yaml', 'config', 'migrate']);
    const validate = await runCliCommand(['--config', 'migrated.yaml', 'config', 'validate']);

    expect(migrate.result.exitCode).toBe(0);
    expect(migrate.fields.command).toBe('config');
    expect(migrate.fields.action).toBe('migrate');
    expect(validate.result.exitCode).toBe(0);
    expect(validate.fields.action).toBe('validate');
    expect(validate.fields.config).toBe('migrated.yaml');
  });
});
