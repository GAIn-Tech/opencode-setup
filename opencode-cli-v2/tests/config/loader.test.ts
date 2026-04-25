import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { stringify as stringifyYaml } from 'yaml';

import { loadConfig, loadConfigFile } from '../../src/config/loader';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-cli-v2-config-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('config loader', () => {
  test('loads unified yaml file', async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, 'config.yaml');
      await Bun.write(
        path,
        stringifyYaml({
          version: '2.0',
          plugins: ['opencode-dcp']
        })
      );

      const loaded = await loadConfigFile(path);

      expect(loaded.format).toBe('unified');
      expect(loaded.config.plugins).toEqual(['opencode-dcp']);
    });
  });

  test('applies precedence defaults < global < project < env < cli', async () => {
    await withTempDir(async (dir) => {
      const globalPath = join(dir, 'global.yaml');
      const projectDir = join(dir, '.opencode');
      const projectPath = join(projectDir, 'config.yaml');
      await mkdir(projectDir, { recursive: true });

      await Bun.write(
        globalPath,
        stringifyYaml({
          version: '2.0',
          models: {
            default: 'global-model'
          },
          plugins: ['from-global']
        })
      );

      await Bun.write(
        projectPath,
        stringifyYaml({
          version: '2.0',
          models: {
            default: 'project-model'
          },
          plugins: ['from-project']
        })
      );

      const loaded = await loadConfig({
        cwd: dir,
        globalPath,
        projectPath,
        env: {
          OPENCODE_MODELS_DEFAULT: 'env-model'
        },
        cliOverrides: {
          models: {
            default: 'cli-model'
          }
        } as unknown as never
      });

      expect(loaded.config.models.default).toBe('cli-model');
      expect(loaded.config.plugins).toEqual(['from-project']);
      expect(loaded.sources.globalPath).toBe(globalPath);
      expect(loaded.sources.projectPath).toBe(projectPath);
    });
  });

  test('discovers and migrates legacy file sets', async () => {
    await withTempDir(async (dir) => {
      const legacyDir = join(dir, 'opencode-config');
      await mkdir(legacyDir, { recursive: true });

      await Bun.write(
        join(legacyDir, 'opencode.json'),
        JSON.stringify(
          {
            plugin: ['oh-my-opencode'],
            provider: {
              openai: {
                options: {
                  apiKey: '{env:OPENAI_API_KEY}'
                }
              }
            }
          },
          null,
          2
        )
      );

      await Bun.write(
        join(legacyDir, 'antigravity.json'),
        JSON.stringify(
          {
            account_selection_strategy: 'hybrid'
          },
          null,
          2
        )
      );

      const loaded = await loadConfig({
        cwd: dir,
        env: {},
        includeLegacyDiscovery: true
      });

      expect(loaded.config.plugins).toContain('oh-my-opencode');
      expect(loaded.config.antigravity?.account_selection_strategy).toBe('hybrid');
      expect(loaded.sources.legacyPaths.length).toBeGreaterThan(0);
    });
  });
});
