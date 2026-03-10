import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

describe('skill surface regressions', () => {
  test('codebase-auditor is registered, enabled, and present on disk', () => {
    const registry = readJson('opencode-config/skills/registry.json');
    const compound = readJson('opencode-config/compound-engineering.json');
    const enabled = new Set(compound.skills.enabled);

    expect(registry.skills['codebase-auditor']).toBeDefined();
    expect(registry.skills['codebase-auditor'].category).toBe('analysis');
    expect(enabled.has('codebase-auditor')).toBe(true);
    expect(existsSync(join(ROOT, 'opencode-config/skills/codebase-auditor/SKILL.md'))).toBe(true);
    expect(existsSync(join(ROOT, 'opencode-config/agents/codebase-auditor.md'))).toBe(true);
  });
});
