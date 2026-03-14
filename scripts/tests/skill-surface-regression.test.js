import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

describe('skill surface regressions', () => {
  test('all enabled custom skills have on-disk skill definitions', () => {
    const registry = readJson('opencode-config/skills/registry.json');
    const compound = readJson('opencode-config/compound-engineering.json');
    const enabled = new Set(compound.skills.enabled);

    const customEnabled = Object.entries(registry.skills)
      .filter(([name, meta]) => enabled.has(name) && meta?.source === 'custom')
      .map(([name]) => name);

    for (const skillName of customEnabled) {
      const directPath = join(ROOT, 'opencode-config', 'skills', skillName, 'SKILL.md');
      const superpowersPath = join(ROOT, 'opencode-config', 'skills', 'superpowers', skillName, 'SKILL.md');
      expect(existsSync(directPath) || existsSync(superpowersPath)).toBe(true);
    }
  });

  test('codebase-auditor is registered, enabled, and present on disk', () => {
    const registry = readJson('opencode-config/skills/registry.json');
    const compound = readJson('opencode-config/compound-engineering.json');
    const enabled = new Set(compound.skills.enabled);

    expect(registry.skills['codebase-auditor']).toBeDefined();
    expect(registry.skills['codebase-auditor'].category).toBe('analysis');
    expect(enabled.has('codebase-auditor')).toBe(true);
    expect(existsSync(join(ROOT, 'opencode-config/skills/codebase-auditor/SKILL.md'))).toBe(true);
  });
});
