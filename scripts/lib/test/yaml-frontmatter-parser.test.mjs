import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFrontmatter } from '../yaml-frontmatter-parser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');
const opencodeSkillsDir = path.join(rootDir, 'opencode-config', 'skills');
const antigravitySkillsDir = path.join(rootDir, '.sisyphus', 'analysis', 'antigravity-awesome-skills', 'skills');

describe('parseFrontmatter', () => {
  // === Basic functionality ===

  test('returns null when no frontmatter delimiters present', () => {
    const content = '# Just a heading\n\nSome content.';
    expect(parseFrontmatter(content)).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(parseFrontmatter('')).toBeNull();
  });

  test('returns null for null/undefined input', () => {
    expect(parseFrontmatter(null)).toBeNull();
    expect(parseFrontmatter(undefined)).toBeNull();
  });

  // === Simple key-value (unquoted) ===

  test('parses simple unquoted key-value pairs', () => {
    const content = `---
name: kubernetes-architect
description: Expert Kubernetes architect specializing in cloud-native infrastructure
risk: unknown
source: community
---

# Body content`;

    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result.name).toBe('kubernetes-architect');
    expect(result.description).toBe('Expert Kubernetes architect specializing in cloud-native infrastructure');
    expect(result.risk).toBe('unknown');
    expect(result.source).toBe('community');
  });

  // === Quoted strings ===

  test('parses double-quoted strings', () => {
    const content = `---
name: security-audit
description: "Comprehensive security auditing workflow covering web application testing, API security"
category: workflow-bundle
risk: safe
source: personal
date_added: "2026-02-27"
---`;

    const result = parseFrontmatter(content);
    expect(result.name).toBe('security-audit');
    expect(result.description).toBe('Comprehensive security auditing workflow covering web application testing, API security');
    expect(result.category).toBe('workflow-bundle');
    expect(result.date_added).toBe('2026-02-27');
  });

  test('parses single-quoted strings', () => {
    const content = `---
name: '007'
risk: critical
date_added: '2026-03-06'
---`;

    const result = parseFrontmatter(content);
    expect(result.name).toBe('007');
    expect(result.risk).toBe('critical');
    expect(result.date_added).toBe('2026-03-06');
  });

  // === Single-line arrays ===

  test('parses single-line bracket arrays', () => {
    const content = `---
name: code-doctor
tags: [debugging, healing, rca, automated-repair]
dependencies: [systematic-debugging, git-master]
synergies: [test-driven-development]
conflicts: []
---`;

    const result = parseFrontmatter(content);
    expect(result.tags).toEqual(['debugging', 'healing', 'rca', 'automated-repair']);
    expect(result.dependencies).toEqual(['systematic-debugging', 'git-master']);
    expect(result.synergies).toEqual(['test-driven-development']);
    expect(result.conflicts).toEqual([]);
  });

  test('parses single-line arrays with quoted items', () => {
    const content = `---
name: websearch
synergies: ["research-builder", "context7", "writing-plans"]
---`;

    const result = parseFrontmatter(content);
    expect(result.synergies).toEqual(['research-builder', 'context7', 'writing-plans']);
  });

  // === Multi-line arrays ===

  test('parses multi-line dash arrays', () => {
    const content = `---
name: '007'
tags:
  - security
  - audit
  - owasp
  - threat-modeling
tools:
  - claude-code
  - antigravity
---`;

    const result = parseFrontmatter(content);
    expect(result.tags).toEqual(['security', 'audit', 'owasp', 'threat-modeling']);
    expect(result.tools).toEqual(['claude-code', 'antigravity']);
  });

  // === Block scalars ===

  test('parses block scalar description (folded >)', () => {
    const content = `---
name: websearch
description: >
  Live web research via the websearch MCP. Use when you need current information,
  extracted page content, screenshots, transcripts, or structured web data.
category: research
---`;

    const result = parseFrontmatter(content);
    expect(result.name).toBe('websearch');
    // js-yaml folds > into single string with trailing newline stripped in some modes
    expect(result.description).toContain('Live web research via the websearch MCP');
    expect(result.category).toBe('research');
  });

  // === Missing fields ===

  test('returns undefined for absent fields', () => {
    const content = `---
name: simple-skill
description: Just a simple skill
---`;

    const result = parseFrontmatter(content);
    expect(result.name).toBe('simple-skill');
    expect(result.category).toBeUndefined();
    expect(result.tags).toBeUndefined();
    expect(result.dependencies).toBeUndefined();
  });

  // === YAML comments ===

  test('handles YAML comments in frontmatter', () => {
    const content = `---
# REQUIRED FIELDS
name: websearch
description: >
  Live web research via the websearch MCP.
# OPTIONAL METADATA
version: 1.0.0
category: research
tags: [web, search]
---`;

    const result = parseFrontmatter(content);
    expect(result.name).toBe('websearch');
    expect(result.version).toBe('1.0.0');
    expect(result.category).toBe('research');
    expect(result.tags).toEqual(['web', 'search']);
  });

  // === Full opencode-style SKILL.md ===

  test('parses full opencode SKILL.md (code-doctor style)', () => {
    const content = `---
name: code-doctor
description: Agentic diagnostic and self-healing skill for codebases. Performs fault localization, root cause analysis, automated repair attempts, and intelligent escalation.
version: 1.0.0
category: diagnostic
tags: [debugging, healing, rca, automated-repair, fault-localization]
dependencies: [systematic-debugging, git-master]
synergies: [test-driven-development, verification-before-completion]
conflicts: []
outputs: [diagnosis-report, fix-commit, escalation-request]
inputs: [error-message, stack-trace, failing-test, symptoms]
---

## Overview

code-doctor is an agentic skill...`;

    const result = parseFrontmatter(content);
    expect(result.name).toBe('code-doctor');
    expect(result.description).toContain('Agentic diagnostic');
    expect(result.version).toBe('1.0.0');
    expect(result.category).toBe('diagnostic');
    expect(result.tags).toEqual(['debugging', 'healing', 'rca', 'automated-repair', 'fault-localization']);
    expect(result.dependencies).toEqual(['systematic-debugging', 'git-master']);
    expect(result.synergies).toEqual(['test-driven-development', 'verification-before-completion']);
    expect(result.conflicts).toEqual([]);
    expect(result.outputs).toEqual(['diagnosis-report', 'fix-commit', 'escalation-request']);
    expect(result.inputs).toEqual(['error-message', 'stack-trace', 'failing-test', 'symptoms']);
  });

  // === Full antigravity-style SKILL.md ===

  test('parses full antigravity SKILL.md (architecture style)', () => {
    const content = `---
name: architecture
description: "Architectural decision-making framework. Requirements analysis, trade-off evaluation, ADR documentation."
risk: unknown
source: community
date_added: "2026-02-27"
---

# Architecture Decision Framework`;

    const result = parseFrontmatter(content);
    expect(result.name).toBe('architecture');
    expect(result.description).toBe('Architectural decision-making framework. Requirements analysis, trade-off evaluation, ADR documentation.');
    expect(result.risk).toBe('unknown');
    expect(result.source).toBe('community');
    expect(result.date_added).toBe('2026-02-27');
  });

  test('parses antigravity SKILL.md with multi-line arrays (007 style)', () => {
    const content = `---
name: '007'
description: Security audit, hardening, threat modeling.
risk: critical
source: community
date_added: '2026-03-06'
author: renat
tags:
  - security
  - audit
  - owasp
tools:
  - claude-code
  - antigravity
  - cursor
---`;

    const result = parseFrontmatter(content);
    expect(result.name).toBe('007');
    expect(result.author).toBe('renat');
    expect(result.tags).toEqual(['security', 'audit', 'owasp']);
    expect(result.tools).toEqual(['claude-code', 'antigravity', 'cursor']);
  });

  // === Edge cases ===

  test('handles frontmatter with only opening delimiter (malformed)', () => {
    const content = `---
name: broken
description: no closing delimiter`;

    expect(parseFrontmatter(content)).toBeNull();
  });

  test('handles empty frontmatter block', () => {
    const content = `---
---

# Just a heading`;

    const result = parseFrontmatter(content);
    // Empty YAML returns empty object or null; either is acceptable
    expect(result === null || (typeof result === 'object' && Object.keys(result).length === 0)).toBe(true);
  });

  test('preserves body content separation (does not include body in frontmatter)', () => {
    const content = `---
name: test-skill
---

## When to Use

- Testing things`;

    const result = parseFrontmatter(content);
    expect(result.name).toBe('test-skill');
    // Body content should not leak into frontmatter
    expect(JSON.stringify(result)).not.toContain('When to Use');
  });

  // === Windows line endings ===

  test('handles Windows CRLF line endings', () => {
    const content = '---\r\nname: windows-skill\r\ndescription: Works on Windows\r\ntags: [a, b]\r\n---\r\n\r\n# Body';

    const result = parseFrontmatter(content);
    expect(result.name).toBe('windows-skill');
    expect(result.description).toBe('Works on Windows');
    expect(result.tags).toEqual(['a', 'b']);
  });
});

// === Integration tests against real SKILL.md files ===

describe('parseFrontmatter — opencode SKILL.md files', () => {
  const skillDirs = fs.existsSync(opencodeSkillsDir)
    ? fs.readdirSync(opencodeSkillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== 'superpowers' && !d.name.startsWith('.'))
        .filter(d => fs.existsSync(path.join(opencodeSkillsDir, d.name, 'SKILL.md')))
        .map(d => d.name)
    : [];

  test('found opencode skill directories', () => {
    expect(skillDirs.length).toBeGreaterThan(0);
  });

  for (const skillName of skillDirs) {
    test(`parses opencode skill: ${skillName}`, () => {
      const content = fs.readFileSync(path.join(opencodeSkillsDir, skillName, 'SKILL.md'), 'utf-8');
      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();
      expect(typeof result.name).toBe('string');
      expect(result.name.length).toBeGreaterThan(0);
      // description must exist (could be string from block scalar)
      expect(result.description).toBeDefined();
    });
  }
});

describe('parseFrontmatter — antigravity SKILL.md files (20+ samples)', () => {
  // Pick 30 deterministic samples spread across the alphabet
  const sampleNames = [
    '007', 'architecture', 'api-security-testing', 'kubernetes-architect',
    'angular', 'brainstorming', 'agent-evaluation', 'ai-ml',
    'aws-serverless', 'algolia-search', 'analyze-project',
    'anti-reversing-techniques', 'apify-actorization',
    'app-store-optimization', 'astro', 'async-python-patterns',
    'ab-test-setup', 'acceptance-orchestrator', 'active-directory-attacks',
    'advanced-evaluation', 'agent-memory-systems', 'agent-orchestrator',
    'ai-analyzer', 'ai-engineering-toolkit', 'airtable-automation',
    'alpha-vantage', 'amplitude-automation', 'analytics-product',
    'android-jetpack-compose-expert', 'api-design-principles'
  ];

  const available = sampleNames.filter(name =>
    fs.existsSync(path.join(antigravitySkillsDir, name, 'SKILL.md'))
  );

  test('found at least 20 antigravity skill samples', () => {
    expect(available.length).toBeGreaterThanOrEqual(20);
  });

  for (const skillName of available) {
    test(`parses antigravity skill: ${skillName}`, () => {
      const content = fs.readFileSync(path.join(antigravitySkillsDir, skillName, 'SKILL.md'), 'utf-8');
      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();
      expect(typeof result.name).toBe('string');
      expect(result.name.length).toBeGreaterThan(0);
    });
  }
});
