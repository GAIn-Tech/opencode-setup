import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyBootstrapManifest } from '../verify-bootstrap-manifest.mjs';

const ROOT = path.resolve(import.meta.dir, '..', '..');

function createFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'bootstrap-manifest-'));
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  mkdirSync(path.join(dir, 'opencode-config'), { recursive: true });
  mkdirSync(path.join(dir, 'plugins', 'oh-my-opencode'), { recursive: true });

  writeFileSync(path.join(dir, 'scripts', 'setup-resilient.mjs'), '#!/usr/bin/env node\n', 'utf8');
  writeFileSync(path.join(dir, 'scripts', 'verify-setup.mjs'), '#!/usr/bin/env node\n', 'utf8');
  writeFileSync(path.join(dir, 'scripts', 'sync-user-config.mjs'), '#!/usr/bin/env node\n', 'utf8');
  writeFileSync(path.join(dir, 'opencode-config', 'opencode.json'), JSON.stringify({ plugin: ['oh-my-opencode@1.0.0'] }), 'utf8');
  writeFileSync(path.join(dir, 'plugins', 'README.md'), '# plugins\n', 'utf8');
  writeFileSync(path.join(dir, 'plugins', 'oh-my-opencode', 'info.md'), '# info\n', 'utf8');

  const manifestPath = path.join(dir, 'scripts', 'bootstrap-manifest.json');
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        ownershipDefaults: {
          owner: 'qa',
          contact: 'qa@example.invalid',
          failureAction: 'block-bootstrap',
        },
        core: [
          {
            id: 'setup',
            ownership: {
              owner: 'qa',
              contact: 'qa@example.invalid',
              failureAction: 'block-bootstrap',
            },
            loadChecks: {
              requiredFiles: ['scripts/setup-resilient.mjs'],
              entryPoints: ['scripts/setup-resilient.mjs'],
            },
          },
        ],
        officialPlugins: [
          {
            id: 'oh-my-opencode',
            package: 'oh-my-opencode@1.0.0',
            ownership: {
              owner: 'qa',
              contact: 'qa@example.invalid',
              failureAction: 'block-bootstrap',
            },
            loadChecks: {
              requiredFiles: ['plugins/oh-my-opencode/info.md'],
              entryPoints: ['plugins/oh-my-opencode/info.md'],
              opencodePluginSpec: 'oh-my-opencode@1.0.0',
            },
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  return { dir, manifestPath };
}

describe('verify-bootstrap-manifest', () => {
  test('passes for canonical repository manifest', () => {
    const result = verifyBootstrapManifest({
      rootDir: ROOT,
      manifestPath: path.join(ROOT, 'scripts', 'bootstrap-manifest.json'),
    });

    expect(result).toEqual({
      valid: true,
      missing: [],
      failed: [],
      reasons: [],
    });
  });

  test('fails with deterministic missing entries when required file is absent', () => {
    const fixture = createFixture();

    try {
      rmSync(path.join(fixture.dir, 'scripts', 'setup-resilient.mjs'));

      const result = verifyBootstrapManifest({
        rootDir: fixture.dir,
        manifestPath: fixture.manifestPath,
      });

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual([
        'core:setup:entry:scripts/setup-resilient.mjs',
        'core:setup:required:scripts/setup-resilient.mjs',
      ]);
      expect(result.failed).toEqual([]);
      expect(result.reasons).toEqual([
        'Missing entry point for core:setup: scripts/setup-resilient.mjs',
        'Missing required file for core:setup: scripts/setup-resilient.mjs',
      ]);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('fails when plugin spec is not present in opencode-config', () => {
    const fixture = createFixture();

    try {
      writeFileSync(
        fixture.manifestPath,
        JSON.stringify(
          {
            schemaVersion: 1,
            ownershipDefaults: {
              owner: 'qa',
              contact: 'qa@example.invalid',
              failureAction: 'block-bootstrap',
            },
            core: [],
            officialPlugins: [
              {
                id: 'oh-my-opencode',
                package: 'oh-my-opencode@1.0.0',
                ownership: {
                  owner: 'qa',
                  contact: 'qa@example.invalid',
                  failureAction: 'block-bootstrap',
                },
                loadChecks: {
                  requiredFiles: ['plugins/oh-my-opencode/info.md'],
                  entryPoints: ['plugins/oh-my-opencode/info.md'],
                  opencodePluginSpec: 'oh-my-opencode@9.9.9',
                },
              },
            ],
          },
          null,
          2,
        ),
        'utf8',
      );

      const result = verifyBootstrapManifest({
        rootDir: fixture.dir,
        manifestPath: fixture.manifestPath,
      });

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual([]);
      expect(result.failed).toEqual([
        'manifest:official-plugins:missing-from-manifest:oh-my-opencode@1.0.0',
        'plugin:oh-my-opencode:opencode-config:missing-spec:oh-my-opencode@9.9.9',
      ]);
      expect(result.reasons).toEqual([
        'Official plugin declared in opencode-config/opencode.json is missing from manifest: oh-my-opencode@1.0.0',
        'Plugin spec missing from opencode-config/opencode.json for plugin:oh-my-opencode: oh-my-opencode@9.9.9',
      ]);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('fails when opencode-config has official plugin not declared in manifest', () => {
    const fixture = createFixture();

    try {
      writeFileSync(
        path.join(fixture.dir, 'opencode-config', 'opencode.json'),
        JSON.stringify({
          plugin: ['oh-my-opencode@1.0.0', 'opencode-antigravity-auth@1.0.0'],
        }),
        'utf8',
      );

      const result = verifyBootstrapManifest({
        rootDir: fixture.dir,
        manifestPath: fixture.manifestPath,
      });

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual([]);
      expect(result.failed).toEqual([
        'manifest:official-plugins:missing-from-manifest:opencode-antigravity-auth@1.0.0',
      ]);
      expect(result.reasons).toEqual([
        'Official plugin declared in opencode-config/opencode.json is missing from manifest: opencode-antigravity-auth@1.0.0',
      ]);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });
});
