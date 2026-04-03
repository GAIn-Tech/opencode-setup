import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyPluginReadiness } from '../verify-plugin-readiness.mjs';

function createFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'plugin-readiness-'));

  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  mkdirSync(path.join(dir, 'opencode-config'), { recursive: true });
  mkdirSync(path.join(dir, 'plugins', 'oh-my-opencode'), { recursive: true });
  mkdirSync(path.join(dir, 'plugins', 'antigravity-auth'), { recursive: true });

  writeFileSync(path.join(dir, 'plugins', 'oh-my-opencode', 'info.md'), '# info\n', 'utf8');
  writeFileSync(path.join(dir, 'plugins', 'antigravity-auth', 'info.md'), '# info\n', 'utf8');

  const manifestPath = path.join(dir, 'scripts', 'bootstrap-manifest.json');
  const configPath = path.join(dir, 'opencode-config', 'opencode.json');

  const manifest = {
    schemaVersion: 1,
    core: [],
    officialPlugins: [
      {
        id: 'oh-my-opencode',
        package: 'oh-my-opencode@1.0.0',
        loadChecks: {
          requiredFiles: ['plugins/oh-my-opencode/info.md'],
          entryPoints: ['plugins/oh-my-opencode/info.md'],
          opencodePluginSpec: 'oh-my-opencode@1.0.0',
        },
      },
      {
        id: 'antigravity-auth',
        package: 'opencode-antigravity-auth@1.0.0',
        loadChecks: {
          requiredFiles: ['plugins/antigravity-auth/info.md'],
          entryPoints: ['plugins/antigravity-auth/info.md'],
          opencodePluginSpec: 'opencode-antigravity-auth@1.0.0',
        },
      },
    ],
  };

  const config = {
    plugin: ['oh-my-opencode@1.0.0', 'opencode-antigravity-auth@1.0.0'],
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

  return { dir, manifestPath, configPath };
}

describe('verify-plugin-readiness', () => {
  test('returns readiness report with plugins and no errors when all plugins are loadable', () => {
    const fixture = createFixture();

    try {
      const result = verifyPluginReadiness({
        rootDir: fixture.dir,
        manifestPath: fixture.manifestPath,
        configPath: fixture.configPath,
      });

      expect(result).toEqual({
        ok: true,
        plugins: ['oh-my-opencode@1.0.0', 'opencode-antigravity-auth@1.0.0'],
        missing: [],
        failed: [],
        reasons: [],
      });
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('missing plugin files are reported in missing array and fail readiness', () => {
    const fixture = createFixture();

    try {
      rmSync(path.join(fixture.dir, 'plugins', 'antigravity-auth', 'info.md'));

      const result = verifyPluginReadiness({
        rootDir: fixture.dir,
        manifestPath: fixture.manifestPath,
        configPath: fixture.configPath,
      });

      expect(result.ok).toBe(false);
      expect(result.plugins).toEqual(['oh-my-opencode@1.0.0', 'opencode-antigravity-auth@1.0.0']);
      expect(result.missing).toEqual([
        'plugin:antigravity-auth:entry:plugins/antigravity-auth/info.md',
        'plugin:antigravity-auth:required:plugins/antigravity-auth/info.md',
      ]);
      expect(result.failed).toEqual([]);
      expect(result.reasons).toEqual([
        'Missing entry point for plugin:antigravity-auth: plugins/antigravity-auth/info.md',
        'Missing required file for plugin:antigravity-auth: plugins/antigravity-auth/info.md',
      ]);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('plugin spec missing from opencode-config is reported in failed array', () => {
    const fixture = createFixture();

    try {
      writeFileSync(
        fixture.configPath,
        JSON.stringify({ plugin: ['oh-my-opencode@1.0.0'] }, null, 2),
        'utf8',
      );

      const result = verifyPluginReadiness({
        rootDir: fixture.dir,
        manifestPath: fixture.manifestPath,
        configPath: fixture.configPath,
      });

      expect(result.ok).toBe(false);
      expect(result.missing).toEqual([]);
      expect(result.failed).toEqual([
        'plugin:antigravity-auth:opencode-config:missing-spec:opencode-antigravity-auth@1.0.0',
      ]);
      expect(result.reasons).toEqual([
        'PLUGIN_NOT_IN_CONFIG: Plugin spec missing from opencode-config/opencode.json for plugin:antigravity-auth: opencode-antigravity-auth@1.0.0',
      ]);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('fails when any declared plugin directory is missing info.md metadata', () => {
    const fixture = createFixture();

    try {
      mkdirSync(path.join(fixture.dir, 'plugins', 'custom-plugin'), { recursive: true });

      const result = verifyPluginReadiness({
        rootDir: fixture.dir,
        manifestPath: fixture.manifestPath,
        configPath: fixture.configPath,
      });

      expect(result.ok).toBe(false);
      expect(result.missing).toEqual([
        'plugin:custom-plugin:required:plugins/custom-plugin/info.md',
      ]);
      expect(result.reasons).toEqual([
        'PLUGIN_MISSING_INFO_MD: Missing plugin metadata file for plugin:custom-plugin: plugins/custom-plugin/info.md',
      ]);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('uses PLUGIN_MISSING_SPEC when official plugin omits opencodePluginSpec', () => {
    const fixture = createFixture();

    try {
      const manifest = JSON.parse(readFileSync(fixture.manifestPath, 'utf8'));
      delete manifest.officialPlugins[1].loadChecks.opencodePluginSpec;
      writeFileSync(fixture.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      const result = verifyPluginReadiness({
        rootDir: fixture.dir,
        manifestPath: fixture.manifestPath,
        configPath: fixture.configPath,
      });

      expect(result.ok).toBe(false);
      expect(result.failed).toEqual([
        'plugin:antigravity-auth:missing-opencode-plugin-spec',
      ]);
      expect(result.reasons).toEqual([
        'PLUGIN_MISSING_SPEC: Missing loadChecks.opencodePluginSpec for plugin:antigravity-auth.',
      ]);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('cli exits non-zero when a manifest-listed plugin is missing', () => {
    const fixture = createFixture();

    try {
      rmSync(path.join(fixture.dir, 'plugins', 'antigravity-auth', 'info.md'));

      const scriptPath = path.resolve(import.meta.dir, '..', 'verify-plugin-readiness.mjs');
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

      expect(command.status).toBe(1);
      const output = JSON.parse(command.stdout || '{}');
      expect(output.ok).toBe(false);
      expect(output.missing).toEqual([
        'plugin:antigravity-auth:entry:plugins/antigravity-auth/info.md',
        'plugin:antigravity-auth:required:plugins/antigravity-auth/info.md',
      ]);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });
});
