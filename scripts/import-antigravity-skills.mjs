#!/usr/bin/env node

/**
 * import-antigravity-skills.mjs
 *
 * Pipeline that reads antigravity SKILL.md files, converts them to our format,
 * generates registry.json entries, and auto-infers interconnections.
 *
 * Usage:
 *   node scripts/import-antigravity-skills.mjs \
 *     --manifest .sisyphus/skill-manifest.json \
 *     --source .sisyphus/analysis/antigravity-awesome-skills/skills/ \
 *     --output-dir opencode-config/skills/ \
 *     --dry-run
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { parseFrontmatter } from './lib/yaml-frontmatter-parser.mjs';

// ── CLI Argument Parsing ────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    manifest: null,
    source: '.sisyphus/analysis/antigravity-awesome-skills/skills/',
    outputDir: 'opencode-config/skills/',
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--manifest':
        args.manifest = argv[++i];
        break;
      case '--source':
        args.source = argv[++i];
        break;
      case '--output-dir':
        args.outputDir = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        console.error(`Unknown argument: ${argv[i]}`);
        process.exit(1);
    }
  }

  if (!args.manifest) {
    console.error('Error: --manifest <path> is required');
    process.exit(1);
  }

  return args;
}

// ── Manifest Loading ────────────────────────────────────────────────────────

export function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const raw = readFileSync(manifestPath, 'utf8');
  let manifest;

  try {
    manifest = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in manifest: ${manifestPath}`);
  }

  if (!manifest.skills || !Array.isArray(manifest.skills) || manifest.skills.length === 0) {
    throw new Error('Manifest skills[] is missing or empty');
  }

  // Validate each entry has required fields
  for (const skill of manifest.skills) {
    if (!skill.source_dir || !skill.target_name || !skill.our_category) {
      throw new Error(`Invalid manifest entry: ${JSON.stringify(skill)}`);
    }
  }

  return manifest;
}

// ── Body Section Extraction ─────────────────────────────────────────────────

const FRONTMATTER_RE = /^---[\t ]*\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

/**
 * Extract the markdown body (everything after frontmatter).
 */
export function extractBody(content) {
  if (!content) return '';
  return content.replace(FRONTMATTER_RE, '').trim();
}

/**
 * Extract "When to Use" / "Use this skill when" triggers from body text.
 * Looks for sections like "When to Use", "Use this skill when", "When invoked".
 */
export function extractTriggers(body) {
  if (!body) return [];

  // Find "when to use" or "use this skill when" sections
  const whenToUseRe = /##?\s*(?:When\s+to\s+Use|Use\s+this\s+skill\s+when|When\s+invoked)[:\s]*\n([\s\S]*?)(?=\n##?\s|\n---|\Z)/i;
  const match = body.match(whenToUseRe);

  if (!match) return [];

  const section = match[1];
  const triggers = [];

  // Extract bullet points
  const bulletRe = /^[\s]*[-*]\s+(.+)/gm;
  let bulletMatch;
  while ((bulletMatch = bulletRe.exec(section)) !== null) {
    const text = bulletMatch[1]
      .replace(/\*\*/g, '')  // remove bold markers
      .replace(/`[^`]+`/g, '')  // remove inline code
      .trim();

    if (text.length > 5 && text.length < 120) {
      // Extract key phrase (first clause)
      const phrase = text
        .split(/[.;,]/)[0]
        .replace(/^(when|if|for|use when|use for)\s+/i, '')
        .trim()
        .toLowerCase();

      if (phrase.length > 3) {
        triggers.push(phrase);
      }
    }
  }

  return triggers.slice(0, 8); // Cap at 8 triggers
}

/**
 * Extract key terms from a skill name for tag generation.
 */
function nameToTags(name) {
  return name
    .split(/[-_]/)
    .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'pro', 'expert'].includes(w));
}

// ── Skill Conversion ────────────────────────────────────────────────────────

/**
 * Convert a single antigravity skill to our format.
 *
 * @param {object} manifestEntry - Entry from manifest (source_dir, target_name, our_category)
 * @param {string} sourcePath - Base path to antigravity skills dir
 * @returns {object} { registryEntry, skillMdContent, success, error }
 */
export function convertSkill(manifestEntry, sourcePath) {
  const skillPath = join(sourcePath, manifestEntry.source_dir, 'SKILL.md');

  if (!existsSync(skillPath)) {
    return { success: false, error: `SKILL.md not found: ${skillPath}` };
  }

  const content = readFileSync(skillPath, 'utf8');
  const frontmatter = parseFrontmatter(content);
  const body = extractBody(content);

  if (!frontmatter) {
    return { success: false, error: `Failed to parse frontmatter: ${skillPath}` };
  }

  // Map fields
  const name = manifestEntry.target_name;
  const description = frontmatter.description || `${name} skill imported from antigravity`;
  const category = manifestEntry.our_category;
  const risk = frontmatter.risk || 'unknown';

  // Auto-generate tags
  const tags = [
    ...new Set([
      category,
      ...nameToTags(name),
      `risk:${risk}`,
      ...(frontmatter.category && frontmatter.category !== 'uncategorized' ? [frontmatter.category] : []),
    ]),
  ];

  // Extract triggers from body
  const triggers = extractTriggers(body);

  // Build registry entry
  const registryEntry = {
    description: typeof description === 'string'
      ? description.replace(/\s+/g, ' ').trim().substring(0, 200)
      : String(description).substring(0, 200),
    category,
    tags,
    source: 'antigravity',
    dependencies: [],
    synergies: [],    // Populated later by inferInterconnections
    conflicts: [],
    triggers,
    recommended_agents: ['build'],
    compatible_agents: ['build', 'oracle'],
    overlapCluster: null,
    canonicalEntrypoint: true,
    selectionHints: {
      useWhen: triggers.slice(0, 3),
      avoidWhen: [],
    },
  };

  // Extract "Do not use" as avoidWhen
  const dontUseRe = /##?\s*(?:Do\s+not\s+use|Must\s+Not|Don't\s+use)[:\s]*\n([\s\S]*?)(?=\n##?\s|\n---|\Z)/i;
  const dontMatch = body.match(dontUseRe);
  if (dontMatch) {
    const avoidBullets = [];
    const avoidRe = /^[\s]*[-*]\s+(.+)/gm;
    let avoidMatch;
    while ((avoidMatch = avoidRe.exec(dontMatch[1])) !== null) {
      const text = avoidMatch[1].replace(/\*\*/g, '').trim();
      if (text.length > 5 && text.length < 120) {
        avoidBullets.push(text.toLowerCase().split(/[.;]/)[0].trim());
      }
    }
    registryEntry.selectionHints.avoidWhen = avoidBullets.slice(0, 3);
  }

  // Generate our-format SKILL.md
  const skillMdContent = generateSkillMd(name, description, category, tags, body, triggers);

  return { registryEntry, skillMdContent, success: true, error: null };
}

// ── SKILL.md Generation ─────────────────────────────────────────────────────

function generateSkillMd(name, description, category, tags, originalBody, triggers) {
  const descLine = typeof description === 'string'
    ? description.replace(/\s+/g, ' ').trim()
    : String(description);

  const humanName = name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Extract first meaningful paragraph from body for overview
  const bodyLines = originalBody.split('\n');
  let overview = '';
  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') && trimmed.length > 20) {
      overview = trimmed.replace(/\*\*/g, '').substring(0, 300);
      break;
    }
  }
  if (!overview) overview = descLine;

  const whenToUse = triggers.length > 0
    ? triggers.map(t => `- ${t}`).join('\n')
    : '- When this skill domain is relevant to the task';

  return `---
name: ${name}
description: >
  ${descLine}
version: 1.0.0
category: ${category}
tags: [${tags.join(', ')}]
dependencies: []
synergies: []
conflicts: []
---

# ${humanName}

## Overview

${overview}

## When to Use

${whenToUse}

## Workflow

### Phase 1: Analysis

1. Understand the current context and requirements
2. Assess the scope and constraints
3. Identify key decisions needed

### Phase 2: Implementation

1. Apply domain-specific expertise
2. Follow best practices for ${category}
3. Validate results against requirements

## Must Do

- Follow established patterns and conventions
- Validate all changes before completion
- Document decisions and rationale

## Must Not Do

- Skip validation steps
- Make changes outside the defined scope
- Ignore existing conventions

## Output Contract

1. **Deliverable**: Domain-specific guidance and implementation
2. **Validation**: Verification that requirements are met
`;
}

// ── Interconnection Inference ───────────────────────────────────────────────

/**
 * Existing skills from our registry that new skills might synergize with.
 */
const EXISTING_SKILL_SYNERGY_MAP = {
  'architecture': ['writing-plans', 'brainstorming', 'codebase-auditor'],
  'security': ['code-doctor', 'codebase-auditor', 'systematic-debugging'],
  'devops': ['verification-before-completion', 'executing-plans', 'dispatching-parallel-agents'],
  'data-ai': ['research-builder', 'context7', 'sequentialthinking'],
  'frontend': ['frontend-ui-ux', 'dev-browser', 'playwright', 'test-driven-development'],
  'backend': ['test-driven-development', 'systematic-debugging', 'code-doctor'],
  'database': ['codebase-auditor', 'writing-plans', 'systematic-debugging'],
  'business': ['brainstorming', 'writing-plans', 'research-builder'],
  'testing': ['test-driven-development', 'verification-before-completion', 'systematic-debugging', 'evaluation-harness-builder'],
  'code-quality': ['codebase-auditor', 'code-doctor', 'test-driven-development', 'requesting-code-review'],
};

/**
 * Auto-infer synergies, dependencies, and conflicts across all converted skills.
 *
 * Rules:
 * - Same category → synergy
 * - 2+ shared tags → synergy
 * - Include relevant existing skills by category
 * - Dependencies: if body mentions another skill name as prerequisite
 * - Conflicts: not auto-inferred (manual override only)
 */
export function inferInterconnections(results, allBodies) {
  const names = Object.keys(results);

  for (const name of names) {
    const entry = results[name];
    const synergies = new Set();

    // Rule 1: Same category → synergy
    for (const otherName of names) {
      if (otherName === name) continue;
      if (results[otherName].category === entry.category) {
        synergies.add(otherName);
      }
    }

    // Rule 2: 2+ shared tags → synergy
    for (const otherName of names) {
      if (otherName === name) continue;
      const sharedTags = entry.tags.filter(t => results[otherName].tags.includes(t));
      if (sharedTags.length >= 2) {
        synergies.add(otherName);
      }
    }

    // Rule 3: Add relevant existing skills from our registry
    const existingSynergies = EXISTING_SKILL_SYNERGY_MAP[entry.category] || [];
    for (const existing of existingSynergies) {
      synergies.add(existing);
    }

    // Rule 4: Dependencies — check if body mentions another skill as prerequisite
    const body = allBodies[name] || '';
    const deps = [];
    for (const otherName of names) {
      if (otherName === name) continue;
      // Look for "requires <skill>" or "prerequisite: <skill>" patterns
      const depRe = new RegExp(`(?:requires?|prerequisite|depends on|must.*first).*\\b${otherName.replace(/-/g, '[- ]')}\\b`, 'i');
      if (depRe.test(body)) {
        deps.push(otherName);
      }
    }

    entry.synergies = [...synergies].slice(0, 15); // Cap at 15
    entry.dependencies = deps;
  }

  return results;
}

// ── Pipeline Orchestration ──────────────────────────────────────────────────

/**
 * Run the full import pipeline.
 *
 * @param {object} options - { manifest, source, outputDir, dryRun }
 * @returns {object} Pipeline result summary
 */
export function runPipeline(options) {
  const { manifest: manifestPath, source, outputDir, dryRun } = options;

  // 1. Load manifest
  const manifest = loadManifest(manifestPath);
  console.log(`Loaded manifest: ${manifest.skills.length} skills`);

  // 2. Convert each skill
  const registryEntries = {};
  const allBodies = {};
  const errors = [];
  const converted = [];

  for (const entry of manifest.skills) {
    const result = convertSkill(entry, source);
    if (result.success) {
      registryEntries[entry.target_name] = result.registryEntry;
      allBodies[entry.target_name] = extractBody(
        readFileSync(join(source, entry.source_dir, 'SKILL.md'), 'utf8')
      );
      converted.push({
        source: entry.source_dir,
        target: entry.target_name,
        category: entry.our_category,
        triggerCount: result.registryEntry.triggers.length,
        skillMd: result.skillMdContent,
      });
    } else {
      errors.push({ source: entry.source_dir, error: result.error });
    }
  }

  // 3. Infer interconnections
  inferInterconnections(registryEntries, allBodies);

  // 4. Compute synergy coverage
  const withSynergies = Object.values(registryEntries).filter(e => e.synergies.length > 0).length;
  const totalEntries = Object.keys(registryEntries).length;
  const synergyCoverage = totalEntries > 0 ? ((withSynergies / totalEntries) * 100).toFixed(1) : 0;

  // 5. Build registry patch
  const registryPatch = {
    $schema: './registry.schema.json',
    version: '1.0.0',
    patchType: 'antigravity-import',
    generatedAt: new Date().toISOString(),
    skills: registryEntries,
  };

  // 6. Output
  if (dryRun) {
    console.log('\n=== DRY RUN — No files will be written ===\n');
    console.log(`Skills converted: ${converted.length}/${manifest.skills.length}`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Synergy coverage: ${synergyCoverage}% (${withSynergies}/${totalEntries} have synergies)`);

    console.log('\n--- Per-Category Summary ---');
    const byCat = {};
    for (const c of converted) {
      byCat[c.category] = (byCat[c.category] || 0) + 1;
    }
    for (const [cat, count] of Object.entries(byCat).sort()) {
      console.log(`  ${cat}: ${count} skills`);
    }

    console.log('\n--- Per-Skill Report ---');
    for (const c of converted) {
      const entry = registryEntries[c.target];
      console.log(`  ${c.target} (${c.category}) — ${entry.triggers.length} triggers, ${entry.synergies.length} synergies`);
    }

    if (errors.length > 0) {
      console.log('\n--- Errors ---');
      for (const e of errors) {
        console.log(`  ${e.source}: ${e.error}`);
      }
    }

    // Validate registry patch JSON
    try {
      JSON.stringify(registryPatch);
      console.log('\nRegistry patch: valid JSON ✓');
    } catch (err) {
      console.log(`\nRegistry patch: INVALID JSON — ${err.message}`);
    }
  } else {
    // Write SKILL.md files
    for (const c of converted) {
      const targetDir = join(outputDir, c.target);
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, 'SKILL.md'), c.skillMd, 'utf8');
    }
    console.log(`Wrote ${converted.length} SKILL.md files to ${outputDir}`);

    // Write registry patch
    const patchPath = join(outputDir, 'registry-patch.json');
    writeFileSync(patchPath, JSON.stringify(registryPatch, null, 2), 'utf8');
    console.log(`Wrote registry patch to ${patchPath}`);
  }

  return {
    total: manifest.skills.length,
    converted: converted.length,
    errors: errors.length,
    synergyCoverage: parseFloat(synergyCoverage),
    registryPatch,
    convertedSkills: converted,
    errorDetails: errors,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

// Only run main when executed directly (not imported)
const isMainModule = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));

if (isMainModule) {
  const args = parseArgs(process.argv);
  const result = runPipeline(args);

  if (result.errors > 0) {
    process.exit(1);
  }
}
