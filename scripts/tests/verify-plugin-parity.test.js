import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyPluginParity } from '../verify-plugin-parity.mjs';

function createFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'plugin-parity-'));

  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  mkdirSync(path.join(dir, 'opencode-config'), { recursive: true });
  mkdirSync(path.join(dir, 'plugins', 'oh-my-opencode'), { recursive: true });

  const manifestPath = path.join(dir, 'scripts', 'bootstrap-manifest.json');
  const configPath = path.join(dir, 'opencode-config', 'opencode.json');

  const manifest = {
    schemaVersion: 1,
    officialPlugins: [
      {
        id: 'oh-my-opencode',
        package: 'oh-my-opencode@1.0.0',
        loadChecks: {
          requiredFiles: ['plugins/oh-my-opencode/info.md'],
        },
      },
    ],
    portability: {
      pluginParity: {
        evidenceInputs: ['scripts/bootstrap-manifest.json', 'opencode-config/opencode.json', 'plugins/oh-my-opencode/info.md'],
      },
    },
  };

  const config = {
    plugin: ['oh-my-opencode@1.0.0'],
  };

  writeFileSync(path.join(dir, 'plugins', 'oh-my-opencode', 'info.md'), '# info\n', 'utf8');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

  return { dir, manifestPath, configPath };
}

describe('verify-plugin-parity', () => {
  test('passes using governed source-controlled inputs without local dependency', () => {
    const fixture = createFixture();

    try {
      const result = verifyPluginParity({
        rootDir: fixture.dir,
        manifestPath: fixture.manifestPath,
        configPath: fixture.configPath,
      });

      expect(result.ok).toBe(true);
      expect(result.reasonCode).toBe('PARITY_PROOF_GENERATED_FROM_GOVERNED_INPUTS');
      expect(result.details.parityProofDigest).toBeString();
      expect(result.details.governedInputs.length).toBeGreaterThan(0);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('fails with LOCAL_DEPENDENCY_IN_RELEASE_PATH when local/ appears in release decision path', () => {
    const fixture = createFixture();

    try {
      const manifest = {
        schemaVersion: 1,
        officialPlugins: [
          {
            id: 'oh-my-opencode',
            package: 'oh-my-opencode@1.0.0',
            loadChecks: {
              requiredFiles: ['local/oh-my-opencode/src/plugin/tool-execute-after.ts'],
            },
          },
        ],
      };
      writeFileSync(fixture.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      const result = verifyPluginParity({
        rootDir: fixture.dir,
        manifestPath: fixture.manifestPath,
        configPath: fixture.configPath,
      });

      expect(result.ok).toBe(false);
      expect(result.reasonCode).toBe('LOCAL_DEPENDENCY_IN_RELEASE_PATH');
      expect(result.details.localDependencyPaths).toEqual([
        'officialPlugins.0.loadChecks.requiredFiles.0=local/oh-my-opencode/src/plugin/tool-execute-after.ts',
      ]);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('fails with PARITY_SOURCE_NOT_SOURCE_CONTROLLED when evidence input escapes repo root', () => {
    const fixture = createFixture();

    try {
      const manifest = {
        schemaVersion: 1,
        officialPlugins: [],
        portability: {
          pluginParity: {
            evidenceInputs: ['../outside.json'],
          },
        },
      };
      writeFileSync(fixture.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      const result = verifyPluginParity({
        rootDir: fixture.dir,
        manifestPath: fixture.manifestPath,
        configPath: fixture.configPath,
      });

      expect(result.ok).toBe(false);
      expect(result.reasonCode).toBe('PARITY_SOURCE_NOT_SOURCE_CONTROLLED');
      expect(result.details.issues).toEqual([
        {
          input: '../outside.json',
          issue: 'outside-root',
        },
      ]);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('cli exits zero and emits governed-input proof reason code on success', () => {
    const fixture = createFixture();

    try {
      const scriptPath = path.resolve(import.meta.dir, '..', 'verify-plugin-parity.mjs');
      const command = spawnSync(
        'bun',
        [
          scriptPath,
          '--root',
          fixture.dir,
          '--manifest',
          fixture.manifestPath,
          '--config',
          fixture.configPath,
        ],
        { encoding: 'utf8' },
      );

      expect(command.status).toBe(0);
      const output = JSON.parse(command.stdout || '{}');
      expect(output.ok).toBe(true);
      expect(output.reasonCode).toBe('PARITY_PROOF_GENERATED_FROM_GOVERNED_INPUTS');
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });
});
