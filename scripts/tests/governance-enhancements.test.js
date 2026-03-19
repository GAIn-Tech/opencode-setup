import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─── check-skill-overlap-governance enhancements ────────────────────────────

describe('check-skill-overlap-governance enhancements', () => {
  // We import the new functions that will be added
  let detectCircularDependencies, detectTransitiveConflicts;

  test('detectCircularDependencies finds A→B→A cycle', async () => {
    const mod = await import('../check-skill-overlap-governance.mjs');
    detectCircularDependencies = mod.detectCircularDependencies;
    const skills = {
      A: { dependencies: ['B'], synergies: [], conflicts: [] },
      B: { dependencies: ['A'], synergies: [], conflicts: [] },
    };
    const cycles = detectCircularDependencies(skills);
    expect(cycles.length).toBeGreaterThan(0);
    // Should find cycle involving A and B
    const cycleStr = cycles.map(c => c.join(' → ')).join('; ');
    expect(cycleStr).toContain('A');
    expect(cycleStr).toContain('B');
  });

  test('detectCircularDependencies finds A→B→C→A cycle', async () => {
    const mod = await import('../check-skill-overlap-governance.mjs');
    detectCircularDependencies = mod.detectCircularDependencies;
    const skills = {
      A: { dependencies: ['B'], synergies: [], conflicts: [] },
      B: { dependencies: ['C'], synergies: [], conflicts: [] },
      C: { dependencies: ['A'], synergies: [], conflicts: [] },
    };
    const cycles = detectCircularDependencies(skills);
    expect(cycles.length).toBeGreaterThan(0);
  });

  test('detectCircularDependencies returns empty for acyclic graph', async () => {
    const mod = await import('../check-skill-overlap-governance.mjs');
    detectCircularDependencies = mod.detectCircularDependencies;
    const skills = {
      A: { dependencies: ['B'], synergies: [], conflicts: [] },
      B: { dependencies: ['C'], synergies: [], conflicts: [] },
      C: { dependencies: [], synergies: [], conflicts: [] },
    };
    const cycles = detectCircularDependencies(skills);
    expect(cycles.length).toBe(0);
  });

  test('detectTransitiveConflicts finds A↔B conflict + B↔C conflict → warns A+C', async () => {
    const mod = await import('../check-skill-overlap-governance.mjs');
    detectTransitiveConflicts = mod.detectTransitiveConflicts;
    const skills = {
      A: { dependencies: [], synergies: [], conflicts: ['B'] },
      B: { dependencies: [], synergies: [], conflicts: ['A', 'C'] },
      C: { dependencies: [], synergies: [], conflicts: ['B'] },
    };
    const warnings = detectTransitiveConflicts(skills);
    expect(warnings.length).toBeGreaterThan(0);
    const warningStr = warnings.join('; ');
    expect(warningStr).toContain('A');
    expect(warningStr).toContain('C');
  });

  test('detectTransitiveConflicts returns empty when no transitive conflicts', async () => {
    const mod = await import('../check-skill-overlap-governance.mjs');
    detectTransitiveConflicts = mod.detectTransitiveConflicts;
    const skills = {
      A: { dependencies: [], synergies: [], conflicts: ['B'] },
      B: { dependencies: [], synergies: [], conflicts: ['A'] },
      C: { dependencies: [], synergies: [], conflicts: [] },
    };
    const warnings = detectTransitiveConflicts(skills);
    expect(warnings.length).toBe(0);
  });

  test('handles 92+ skills without performance issues', async () => {
    const mod = await import('../check-skill-overlap-governance.mjs');
    detectCircularDependencies = mod.detectCircularDependencies;
    detectTransitiveConflicts = mod.detectTransitiveConflicts;

    // Build 100 skills with chain deps (no cycles)
    const skills = {};
    for (let i = 0; i < 100; i++) {
      skills[`skill-${i}`] = {
        dependencies: i > 0 ? [`skill-${i - 1}`] : [],
        synergies: [],
        conflicts: i % 10 === 0 && i > 0 ? [`skill-${i - 1}`] : [],
      };
    }

    const start = performance.now();
    const cycles = detectCircularDependencies(skills);
    const warnings = detectTransitiveConflicts(skills);
    const elapsed = performance.now() - start;

    expect(cycles.length).toBe(0);
    expect(elapsed).toBeLessThan(1000); // Under 1s for 100 skills
  });
});

// ─── normalize-superpowers-skills extension ─────────────────────────────────

describe('normalize-superpowers-skills extension', () => {
  test('discoverSkillDirs finds skills outside superpowers/', async () => {
    const mod = await import('../normalize-superpowers-skills.mjs');
    const { discoverSkillDirs } = mod;

    const tmpDir = mkdtempSync(join(tmpdir(), 'norm-test-'));
    try {
      // Create top-level skill dir
      const skillDir = join(tmpDir, 'my-skill');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        '---\nname: "my-skill"\ndescription: "Test"\n---\n# My Skill\n',
      );

      // Create superpowers subdir
      const spDir = join(tmpDir, 'superpowers', 'sp-skill');
      mkdirSync(spDir, { recursive: true });
      writeFileSync(
        join(spDir, 'SKILL.md'),
        '---\nname: "sp-skill"\ndescription: "SP Test"\n---\n# SP Skill\n',
      );

      const dirs = discoverSkillDirs(tmpDir);
      const names = dirs.map(d => d.name);
      expect(names).toContain('my-skill');
      expect(names).toContain('sp-skill');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('validateFrontmatterFields reports missing name', async () => {
    const mod = await import('../normalize-superpowers-skills.mjs');
    const { validateFrontmatterFields } = mod;

    const errors = validateFrontmatterFields('test-skill', {
      description: 'Has description but no name',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('name');
  });

  test('validateFrontmatterFields reports missing description', async () => {
    const mod = await import('../normalize-superpowers-skills.mjs');
    const { validateFrontmatterFields } = mod;

    const errors = validateFrontmatterFields('test-skill', {
      name: 'test-skill',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('description');
  });

  test('validateFrontmatterFields passes with both fields', async () => {
    const mod = await import('../normalize-superpowers-skills.mjs');
    const { validateFrontmatterFields } = mod;

    const errors = validateFrontmatterFields('test-skill', {
      name: 'test-skill',
      description: 'A test skill',
    });
    expect(errors.length).toBe(0);
  });
});

// ─── validate-skill-import (new script) ─────────────────────────────────────

describe('validate-skill-import', () => {
  test('detectOrphanSkillFiles finds SKILL.md without registry entry', async () => {
    const mod = await import('../validate-skill-import.mjs');
    const { detectOrphanSkillFiles } = mod;

    const registrySkills = { 'skill-a': {} };
    const skillFiles = ['skill-a', 'skill-b']; // skill-b has no registry entry
    const orphans = detectOrphanSkillFiles(registrySkills, skillFiles);
    expect(orphans).toContain('skill-b');
    expect(orphans).not.toContain('skill-a');
  });

  test('detectOrphanRegistryEntries finds registry entry without SKILL.md', async () => {
    const mod = await import('../validate-skill-import.mjs');
    const { detectOrphanRegistryEntries } = mod;

    const registrySkills = { 'skill-a': {}, 'skill-c': {} };
    const skillFiles = ['skill-a']; // skill-c has no SKILL.md
    const orphans = detectOrphanRegistryEntries(registrySkills, skillFiles);
    expect(orphans).toContain('skill-c');
    expect(orphans).not.toContain('skill-a');
  });

  test('detectNonBidirectionalSynergies finds one-way synergy', async () => {
    const mod = await import('../validate-skill-import.mjs');
    const { detectNonBidirectionalSynergies } = mod;

    const skills = {
      A: { synergies: ['B'] },
      B: { synergies: [] }, // B doesn't list A
    };
    const violations = detectNonBidirectionalSynergies(skills);
    expect(violations.length).toBeGreaterThan(0);
    const violStr = violations.join('; ');
    expect(violStr).toContain('A');
    expect(violStr).toContain('B');
  });

  test('detectNonBidirectionalSynergies passes when bidirectional', async () => {
    const mod = await import('../validate-skill-import.mjs');
    const { detectNonBidirectionalSynergies } = mod;

    const skills = {
      A: { synergies: ['B'] },
      B: { synergies: ['A'] },
    };
    const violations = detectNonBidirectionalSynergies(skills);
    expect(violations.length).toBe(0);
  });

  test('detectDependencyCycles finds cycles', async () => {
    const mod = await import('../validate-skill-import.mjs');
    const { detectDependencyCycles } = mod;

    const skills = {
      A: { dependencies: ['B'] },
      B: { dependencies: ['A'] },
    };
    const cycles = detectDependencyCycles(skills);
    expect(cycles.length).toBeGreaterThan(0);
  });

  test('detectDependencyCycles passes for acyclic deps', async () => {
    const mod = await import('../validate-skill-import.mjs');
    const { detectDependencyCycles } = mod;

    const skills = {
      A: { dependencies: ['B'] },
      B: { dependencies: [] },
    };
    const cycles = detectDependencyCycles(skills);
    expect(cycles.length).toBe(0);
  });
});
