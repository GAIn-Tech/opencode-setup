import { describe, test, expect, beforeAll } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  loadManifest,
  convertSkill,
  extractBody,
  extractTriggers,
  inferInterconnections,
  runPipeline,
} from '../../import-antigravity-skills.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');
const manifestPath = path.join(rootDir, '.sisyphus', 'skill-manifest.json');
const sourceDir = path.join(rootDir, '.sisyphus', 'analysis', 'antigravity-awesome-skills', 'skills');

// ── Manifest Loading & Validation ───────────────────────────────────────────

describe('loadManifest', () => {
  test('loads valid manifest with 54 skills', () => {
    const manifest = loadManifest(manifestPath);
    expect(manifest.skills).toBeArray();
    expect(manifest.skills.length).toBe(54);
    expect(manifest.version).toBe('1.0.0');
  });

  test('throws on missing manifest file', () => {
    expect(() => loadManifest('/nonexistent/path/manifest.json')).toThrow('Manifest not found');
  });

  test('throws on invalid JSON', () => {
    const tmpFile = path.join(os.tmpdir(), 'bad-manifest-' + Date.now() + '.json');
    fs.writeFileSync(tmpFile, 'not valid json {{{', 'utf8');
    try {
      expect(() => loadManifest(tmpFile)).toThrow('Invalid JSON');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('throws on empty skills array', () => {
    const tmpFile = path.join(os.tmpdir(), 'empty-manifest-' + Date.now() + '.json');
    fs.writeFileSync(tmpFile, JSON.stringify({ version: '1.0.0', skills: [] }), 'utf8');
    try {
      expect(() => loadManifest(tmpFile)).toThrow('missing or empty');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('throws on missing skills key', () => {
    const tmpFile = path.join(os.tmpdir(), 'no-skills-manifest-' + Date.now() + '.json');
    fs.writeFileSync(tmpFile, JSON.stringify({ version: '1.0.0' }), 'utf8');
    try {
      expect(() => loadManifest(tmpFile)).toThrow('missing or empty');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('validates each entry has required fields', () => {
    const tmpFile = path.join(os.tmpdir(), 'bad-entry-manifest-' + Date.now() + '.json');
    fs.writeFileSync(tmpFile, JSON.stringify({
      version: '1.0.0',
      skills: [{ source_dir: 'foo' }]  // missing target_name and our_category
    }), 'utf8');
    try {
      expect(() => loadManifest(tmpFile)).toThrow('Invalid manifest entry');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// ── Single Skill Conversion ─────────────────────────────────────────────────

describe('convertSkill', () => {
  test('produces valid registry entry with all required fields', () => {
    const entry = {
      source_dir: 'docker-expert',
      target_name: 'docker-containerization',
      our_category: 'devops',
    };

    const result = convertSkill(entry, sourceDir);
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();

    const reg = result.registryEntry;

    // All required fields present
    expect(reg.description).toBeString();
    expect(reg.description.length).toBeGreaterThan(10);
    expect(reg.category).toBe('devops');
    expect(reg.tags).toBeArray();
    expect(reg.tags.length).toBeGreaterThan(0);
    expect(reg.source).toBe('antigravity');
    expect(reg.dependencies).toBeArray();
    expect(reg.synergies).toBeArray();
    expect(reg.conflicts).toBeArray();
    expect(reg.triggers).toBeArray();
    expect(reg.recommended_agents).toEqual(['build']);
    expect(reg.compatible_agents).toEqual(['build', 'oracle']);
    expect(reg.overlapCluster).toBeNull();
    expect(reg.canonicalEntrypoint).toBe(true);
    expect(reg.selectionHints).toBeDefined();
    expect(reg.selectionHints.useWhen).toBeArray();
    expect(reg.selectionHints.avoidWhen).toBeArray();
  });

  test('generates valid SKILL.md content', () => {
    const entry = {
      source_dir: 'security-auditor',
      target_name: 'security-auditing',
      our_category: 'security',
    };

    const result = convertSkill(entry, sourceDir);
    expect(result.success).toBe(true);
    expect(result.skillMdContent).toContain('---');
    expect(result.skillMdContent).toContain('name: security-auditing');
    expect(result.skillMdContent).toContain('category: security');
    expect(result.skillMdContent).toContain('version: 1.0.0');
    expect(result.skillMdContent).toContain('## Overview');
    expect(result.skillMdContent).toContain('## When to Use');
  });

  test('returns error for missing skill directory', () => {
    const entry = {
      source_dir: 'nonexistent-skill-xyz',
      target_name: 'nonexistent',
      our_category: 'testing',
    };

    const result = convertSkill(entry, sourceDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('sets source to antigravity', () => {
    const entry = {
      source_dir: 'react-patterns',
      target_name: 'react-patterns',
      our_category: 'frontend',
    };

    const result = convertSkill(entry, sourceDir);
    expect(result.success).toBe(true);
    expect(result.registryEntry.source).toBe('antigravity');
  });

  test('uses manifest our_category, not antigravity category', () => {
    // docker-expert has category "devops" in antigravity, but we can override
    const entry = {
      source_dir: 'docker-expert',
      target_name: 'docker-test',
      our_category: 'infrastructure',
    };

    const result = convertSkill(entry, sourceDir);
    expect(result.success).toBe(true);
    expect(result.registryEntry.category).toBe('infrastructure');
  });

  test('includes risk level in tags', () => {
    const entry = {
      source_dir: 'security-auditor',
      target_name: 'security-auditing',
      our_category: 'security',
    };

    const result = convertSkill(entry, sourceDir);
    expect(result.success).toBe(true);
    const riskTag = result.registryEntry.tags.find(t => t.startsWith('risk:'));
    expect(riskTag).toBeDefined();
  });
});

// ── Trigger Extraction ──────────────────────────────────────────────────────

describe('extractTriggers', () => {
  test('extracts triggers from "When to Use" section', () => {
    const body = `# Some Skill

## When to Use

- Running security audits or risk assessments
- Reviewing SDLC security controls
- Investigating vulnerabilities
- Validating authentication mechanisms

## Other Section

Some other content`;

    const triggers = extractTriggers(body);
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers.length).toBeLessThanOrEqual(8);
    // Should contain relevant terms
    const joined = triggers.join(' ');
    expect(joined).toContain('security');
  });

  test('extracts from "Use this skill when" section', () => {
    const body = `# Test

## Use this skill when

- Building Docker containers for production
- Optimizing container image sizes
- Setting up multi-stage builds

## Notes

Other stuff`;

    const triggers = extractTriggers(body);
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers.some(t => t.includes('docker') || t.includes('container') || t.includes('building'))).toBe(true);
  });

  test('returns empty array when no trigger section found', () => {
    const body = `# Just a heading

Some regular content without any "when to use" section.

## Features

- Feature 1
- Feature 2`;

    const triggers = extractTriggers(body);
    expect(triggers).toEqual([]);
  });

  test('caps triggers at 8', () => {
    const bullets = Array.from({ length: 15 }, (_, i) => `- Trigger scenario number ${i + 1} with enough text`);
    const body = `## When to Use\n\n${bullets.join('\n')}\n\n## Next Section`;

    const triggers = extractTriggers(body);
    expect(triggers.length).toBeLessThanOrEqual(8);
  });
});

// ── Body Extraction ─────────────────────────────────────────────────────────

describe('extractBody', () => {
  test('removes frontmatter and returns body', () => {
    const content = `---
name: test
description: A test
---

# Body Heading

Some body content.`;

    const body = extractBody(content);
    expect(body).toContain('# Body Heading');
    expect(body).toContain('Some body content');
    expect(body).not.toContain('---');
    expect(body).not.toContain('name: test');
  });

  test('returns empty string for null/empty input', () => {
    expect(extractBody(null)).toBe('');
    expect(extractBody('')).toBe('');
  });
});

// ── Synergy Inference ───────────────────────────────────────────────────────

describe('inferInterconnections', () => {
  test('finds synergies between skills in the same category', () => {
    const results = {
      'skill-a': { category: 'security', tags: ['security', 'audit'], synergies: [], dependencies: [] },
      'skill-b': { category: 'security', tags: ['security', 'scan'], synergies: [], dependencies: [] },
      'skill-c': { category: 'devops', tags: ['devops', 'deploy'], synergies: [], dependencies: [] },
    };
    const bodies = { 'skill-a': '', 'skill-b': '', 'skill-c': '' };

    inferInterconnections(results, bodies);

    // skill-a and skill-b should be synergies (same category)
    expect(results['skill-a'].synergies).toContain('skill-b');
    expect(results['skill-b'].synergies).toContain('skill-a');

    // skill-c should NOT be a synergy of skill-a (different category)
    expect(results['skill-a'].synergies).not.toContain('skill-c');
  });

  test('finds synergies via 2+ shared tags', () => {
    const results = {
      'skill-x': { category: 'frontend', tags: ['react', 'testing', 'ui'], synergies: [], dependencies: [] },
      'skill-y': { category: 'testing', tags: ['react', 'testing', 'e2e'], synergies: [], dependencies: [] },
      'skill-z': { category: 'backend', tags: ['go', 'api'], synergies: [], dependencies: [] },
    };
    const bodies = { 'skill-x': '', 'skill-y': '', 'skill-z': '' };

    inferInterconnections(results, bodies);

    // x and y share 'react' and 'testing' — should be synergies
    expect(results['skill-x'].synergies).toContain('skill-y');
    expect(results['skill-y'].synergies).toContain('skill-x');

    // z should not have synergy with x (0 shared tags)
    expect(results['skill-z'].synergies).not.toContain('skill-x');
  });

  test('includes existing registry skills in synergies', () => {
    const results = {
      'test-skill': { category: 'testing', tags: ['testing'], synergies: [], dependencies: [] },
    };
    const bodies = { 'test-skill': '' };

    inferInterconnections(results, bodies);

    // Testing category should include existing skills like test-driven-development
    expect(results['test-skill'].synergies).toContain('test-driven-development');
  });

  test('caps synergies at 15', () => {
    // Create 20 skills in same category
    const results = {};
    const bodies = {};
    for (let i = 0; i < 20; i++) {
      results[`skill-${i}`] = { category: 'devops', tags: ['devops', 'cloud', 'infra'], synergies: [], dependencies: [] };
      bodies[`skill-${i}`] = '';
    }

    inferInterconnections(results, bodies);

    // Each skill should have at most 15 synergies
    for (const name of Object.keys(results)) {
      expect(results[name].synergies.length).toBeLessThanOrEqual(15);
    }
  });
});

// ── Dry Run Side Effects ────────────────────────────────────────────────────

describe('runPipeline --dry-run', () => {
  test('does NOT write files in dry-run mode', () => {
    const tmpDir = path.join(os.tmpdir(), 'import-test-dryrun-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const result = runPipeline({
        manifest: manifestPath,
        source: sourceDir,
        outputDir: tmpDir,
        dryRun: true,
      });

      expect(result.converted).toBe(54);
      expect(result.errors).toBe(0);

      // Verify no files written
      const contents = fs.readdirSync(tmpDir);
      expect(contents.length).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('returns valid registry patch JSON', () => {
    const result = runPipeline({
      manifest: manifestPath,
      source: sourceDir,
      outputDir: os.tmpdir(),
      dryRun: true,
    });

    expect(result.registryPatch).toBeDefined();
    expect(result.registryPatch.skills).toBeDefined();
    expect(Object.keys(result.registryPatch.skills).length).toBe(54);

    // Verify JSON serialization works
    const json = JSON.stringify(result.registryPatch);
    expect(json).toBeString();
    expect(json.length).toBeGreaterThan(100);

    // Verify it can be parsed back
    const parsed = JSON.parse(json);
    expect(parsed.skills).toBeDefined();
    expect(parsed.patchType).toBe('antigravity-import');
  });

  test('achieves >=80% synergy coverage', () => {
    const result = runPipeline({
      manifest: manifestPath,
      source: sourceDir,
      outputDir: os.tmpdir(),
      dryRun: true,
    });

    expect(result.synergyCoverage).toBeGreaterThanOrEqual(80);
  });
});

// ── Full Pipeline Integration ───────────────────────────────────────────────

describe('full pipeline integration', () => {
  test('converts all 54 skills with zero errors', () => {
    const result = runPipeline({
      manifest: manifestPath,
      source: sourceDir,
      outputDir: os.tmpdir(),
      dryRun: true,
    });

    expect(result.total).toBe(54);
    expect(result.converted).toBe(54);
    expect(result.errors).toBe(0);
  });

  test('every converted skill has name, description, category, tags, triggers', () => {
    const result = runPipeline({
      manifest: manifestPath,
      source: sourceDir,
      outputDir: os.tmpdir(),
      dryRun: true,
    });

    for (const [name, entry] of Object.entries(result.registryPatch.skills)) {
      expect(entry.description).toBeString();
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.category).toBeString();
      expect(entry.tags).toBeArray();
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(entry.triggers).toBeArray();
      // triggers may be empty for some skills (that's ok)
    }
  });

  test('registry patch structure matches expected schema', () => {
    const result = runPipeline({
      manifest: manifestPath,
      source: sourceDir,
      outputDir: os.tmpdir(),
      dryRun: true,
    });

    const patch = result.registryPatch;
    expect(patch.$schema).toBe('./registry.schema.json');
    expect(patch.version).toBe('1.0.0');
    expect(patch.patchType).toBe('antigravity-import');
    expect(patch.generatedAt).toBeString();
    expect(typeof patch.skills).toBe('object');

    // Check a specific skill entry shape
    const firstSkill = Object.values(patch.skills)[0];
    expect(firstSkill).toHaveProperty('description');
    expect(firstSkill).toHaveProperty('category');
    expect(firstSkill).toHaveProperty('tags');
    expect(firstSkill).toHaveProperty('source');
    expect(firstSkill).toHaveProperty('dependencies');
    expect(firstSkill).toHaveProperty('synergies');
    expect(firstSkill).toHaveProperty('conflicts');
    expect(firstSkill).toHaveProperty('triggers');
    expect(firstSkill).toHaveProperty('recommended_agents');
    expect(firstSkill).toHaveProperty('compatible_agents');
    expect(firstSkill).toHaveProperty('overlapCluster');
    expect(firstSkill).toHaveProperty('canonicalEntrypoint');
    expect(firstSkill).toHaveProperty('selectionHints');
  });
});
