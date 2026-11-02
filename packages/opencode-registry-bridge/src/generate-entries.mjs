/**
 * registry-bridge/src/generate-entries.mjs
 *
 * Reads opencode infrastructure packages and auto-generates skill registry
 * entries that conform to opencode-config/skills/registry.schema.json.
 *
 * Mapping rules:
 *   package.json description  → entry.description
 *   package.json keywords     → entry.tags  (+ auto-generated variants)
 *   package.json name        → skill name (strip "opencode-" prefix)
 *   package.json dependencies→ entry.synergies (intersection with other target packages)
 *   keywords + name           → entry.triggers (natural-language variants)
 *   keyword domain inference   → entry.category
 *   package main export       → entry.inputs / entry.outputs
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/opencode-registry-bridge/src → up 3 to reach monorepo root (C:\Users\jack\work\opencode-setup)
const ROOT = join(__dirname, '..', '..', '..');
const OUTPUT_DIR = join(ROOT, 'opencode-config', 'skills', 'generated');
const REGISTRY_PATH = join(ROOT, 'opencode-config', 'skills', 'registry.json');

// ---------------------------------------------------------------------------
// 14 infrastructure packages that have skill-like functionality but are
// invisible to the skill system.
// ---------------------------------------------------------------------------
const TARGET_PACKAGES = [
  'opencode-learning-engine',
  'opencode-skill-rl-manager',
  'opencode-memory-graph',
  'opencode-runbooks',
  'opencode-proofcheck',
  'opencode-eval-harness',
  'opencode-tool-usage-tracker',
  'opencode-model-router-x',
  'opencode-integration-layer',
  'opencode-showboat-wrapper',
  'opencode-codebase-memory',
  'opencode-model-benchmark',
  'opencode-plugin-preload-skills',
  'opencode-graphdb-bridge',
];

// ---------------------------------------------------------------------------
// Category inference from keyword domains
// ---------------------------------------------------------------------------
const CATEGORY_RULES = [
  { keywords: ['learning', 'rl', 'reinforcement', 'orchestration'], category: 'orchestration' },
  { keywords: ['memory', 'graph', 'session', 'log-parser'], category: 'memory' },
  { keywords: ['runbooks', 'remediation', 'error-handling'], category: 'debugging' },
  { keywords: ['benchmark', 'eval', 'evaluation', 'harness'], category: 'evaluation' },
  { keywords: ['tool-tracking', 'metrics', 'telemetry'], category: 'observability' },
  { keywords: ['model-router', 'llm', 'routing', 'policy'], category: 'routing' },
  { keywords: ['proofcheck', 'deployment', 'verification', 'gate'], category: 'verification' },
  { keywords: ['integration', 'skillrl'], category: 'orchestration' },
  { keywords: ['showboat', 'evidence-capture', 'playwright'], category: 'verification' },
  { keywords: ['codebase', 'indexing', 'sqlite', 'ast'], category: 'analysis' },
  { keywords: ['graphdb', 'cypher', 'neo4j'], category: 'memory' },
  { keywords: ['preload', 'skills', 'plugin'], category: 'orchestration' },
];

function inferCategory(keywords) {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => keywords.includes(k))) {
      return rule.category;
    }
  }
  return 'utility';
}

// ---------------------------------------------------------------------------
// Trigger generation from keywords + package name
// ---------------------------------------------------------------------------
function generateTriggers(name, keywords) {
  const triggers = new Set();
  const skillName = name.replace(/^opencode-/, '').replace(/-/g, ' ');

  // Natural-language variants of the skill name
  triggers.add(`use ${skillName}`);
  triggers.add(`${skillName} skill`);
  triggers.add(`${skillName} tool`);
  triggers.add(`invoke ${skillName}`);

  // From keywords
  for (const kw of keywords) {
    triggers.add(`use ${kw.replace(/-/g, ' ')}`);
    triggers.add(`${kw.replace(/-/g, ' ')} task`);
    triggers.add(`with ${kw.replace(/-/g, ' ')}`);
  }

  // Domain-specific trigger hints
  if (name.includes('learning-engine')) {
    triggers.add('anti-pattern detected');
    triggers.add('task routing advice');
    triggers.add('improve skill selection');
  }
  if (name.includes('skill-rl-manager')) {
    triggers.add('orchestrate multiple skills');
    triggers.add('select best skill');
    triggers.add('hierarchical skill selection');
  }
  if (name.includes('memory-graph')) {
    triggers.add('session error history');
    triggers.add('error frequency analysis');
    triggers.add('build session graph');
  }
  if (name.includes('runbooks')) {
    triggers.add('auto-remediation');
    triggers.add('fix this error');
    triggers.add('error recovery');
    triggers.add('runbook for');
  }
  if (name.includes('proofcheck')) {
    triggers.add('pre-deployment gate');
    triggers.add('verify before deploy');
    triggers.add('deployment checklist');
  }
  if (name.includes('eval-harness')) {
    triggers.add('benchmark model');
    triggers.add('evaluate AI quality');
    triggers.add('run test harness');
  }
  if (name.includes('tool-usage-tracker')) {
    triggers.add('tool invocation metrics');
    triggers.add('track tool usage');
    triggers.add('tool breadth analysis');
  }
  if (name.includes('model-router-x')) {
    triggers.add('select optimal model');
    triggers.add('cost-aware routing');
    triggers.add('route to model');
  }
  if (name.includes('showboat-wrapper')) {
    triggers.add('capture evidence');
    triggers.add('high-impact task');
    triggers.add('deterministic verification');
  }
  if (name.includes('codebase-memory')) {
    triggers.add('index codebase');
    triggers.add('codebase symbols');
    triggers.add('call graph analysis');
    triggers.add('search codebase structure');
  }
  if (name.includes('model-benchmark')) {
    triggers.add('HumanEval benchmark');
    triggers.add('compare model performance');
    triggers.add('SWE-bench evaluation');
  }
  if (name.includes('graphdb-bridge')) {
    triggers.add('graph database query');
    triggers.add('cypher query');
    triggers.add('neo4j session data');
  }
  if (name.includes('integration-layer')) {
    triggers.add('orchestrate plugins');
    triggers.add('plugin event bus');
    triggers.add('emit plugin event');
  }

  return [...triggers].slice(0, 30);  // Cap at 30 triggers
}

// ---------------------------------------------------------------------------
// Extract exported methods from main entry file (ESM + CommonJS)
// ---------------------------------------------------------------------------
function extractExports(mainPath) {
  const methods = [];
  try {
    const content = readFileSync(mainPath, 'utf8');

    // ESM: export class / export function / export const
    for (const match of content.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:class|function|const|let|var)\s+(\w+)/g)) {
      methods.push({ name: match[1], type: match[0].includes('class') ? 'class' : 'function' });
    }
    for (const match of content.matchAll(/export\s+\{\s*([^}]+)\s*\}/g)) {
      // export { Foo, Bar }
      for (const name of match[1].split(',').map(n => n.trim().split(' as ')[0])) {
        if (name) methods.push({ name, type: 'named' });
      }
    }

    // CommonJS: class Foo (at module level) + module.exports = { Foo, Bar }
    // Step 1: collect class names defined in file
    const classNames = new Set();
    for (const match of content.matchAll(/^class\s+(\w+)/gm)) {
      classNames.add(match[1]);
    }
    // Step 2: find module.exports = { ... } and match names
    // Strip single-line and multi-line comments before parsing
    const stripComments = (str) => str
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const cjsExport = content.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
    if (cjsExport) {
      const exportBlock = stripComments(cjsExport[1]);
      for (const name of exportBlock.split(',').map(n => n.trim().split(':')[0].trim())) {
        if (/^[A-Z][A-Za-z0-9]*$/.test(name) || /^[a-z][a-z0-9_]*$/i.test(name)) {
          methods.push({ name, type: classNames.has(name) ? 'class' : 'named' });
        }
      }
    } else {
      // No explicit module.exports — export whatever classes are defined at top level
      for (const name of classNames) {
        methods.push({ name, type: 'class' });
      }
    }
  } catch {
    // File doesn't exist or can't be read — skip
  }
  return methods;
}

// ---------------------------------------------------------------------------
// Resolve package main entry path
// ---------------------------------------------------------------------------
function resolveMainPath(pkgDir) {
  try {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    if (!pkg.main) return null;
    let path = join(pkgDir, pkg.main);
    return path;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Compute synergies as intersection of dependencies with other target packages
// ---------------------------------------------------------------------------
function computeSynergies(pkgJson, targetSet) {
  const deps = Object.keys(pkgJson.dependencies || {});
  return deps.filter(d => targetSet.has(d));
}

// ---------------------------------------------------------------------------
// Build a registry entry for a single package
// ---------------------------------------------------------------------------
function buildEntry(pkgName, pkgJson, pkgDir, targetSet) {
  const skillName = pkgName.replace(/^opencode-/, '').replace(/-/g, '-');
  const keywords = pkgJson.keywords || [];
  const deps = pkgJson.dependencies ? Object.keys(pkgJson.dependencies) : [];
  const mainPath = resolveMainPath(pkgDir);
  const exports = extractExports(mainPath);

  // Cross-package synergies (internal opencode packages that this one depends on)
  const synergies = computeSynergies(pkgJson, targetSet);

  // Map exported methods → inputs/outputs
  const inputs = exports
    .filter(e => !['constructor', 'init', 'connect'].includes(e.name))
    .slice(0, 10)
    .map(e => ({
      name: e.name,
      type: e.type,
      description: `${e.type} ${e.name}`,
      required: false,
    }));

  const outputs = exports
    .filter(e => ['getReport', 'getResult', 'getScore', 'getAdvice', 'getMetrics'].includes(e.name))
    .map(e => ({
      name: e.name,
      type: 'object',
      description: `Returns ${e.name} data`,
      required: false,
    }));

  // Category from keyword inference
  const category = inferCategory(keywords);

  // selectionHints.useWhen — domain detection patterns
  const useWhen = [];
  if (keywords.includes('learning') || keywords.includes('rl')) useWhen.push('RL or learning signal available');
  if (keywords.includes('benchmark') || keywords.includes('eval')) useWhen.push('model evaluation needed');
  if (keywords.includes('memory') || keywords.includes('graph')) useWhen.push('session or codebase context');
  if (keywords.includes('runbooks') || keywords.includes('error')) useWhen.push('error or failure state detected');
  if (keywords.includes('proofcheck') || keywords.includes('verification')) useWhen.push('pre-deployment phase');

  return {
    description: pkgJson.description || `Skill bridge for ${pkgName}`,
    category,
    tags: keywords.length ? keywords : [skillName.replace(/-/g, ' ')],
    source: 'builtin',
    dependencies: deps.filter(d => d.startsWith('opencode-') && targetSet.has(d)),
    synergies: synergies.map(d => d.replace(/^opencode-/, '').replace(/-/g, '-')),
    conflicts: [],
    triggers: generateTriggers(pkgName, keywords),
    inputs,
    outputs,
    version: pkgJson.version || '0.1.0',
    processPhase: inferProcessPhase(category),
    domain: category,
    selectionHints: {
      useWhen: useWhen.slice(0, 5),
      avoidWhen: [],
    },
    recommended_agents: inferRecommendedAgents(keywords),
    compatible_agents: [],
  };
}

function inferProcessPhase(category) {
  const map = {
    orchestration: 'pre-analysis',
    memory: 'pre-analysis',
    debugging: 'implementation',
    evaluation: 'verification',
    observability: 'post-process',
    routing: 'pre-analysis',
    verification: 'verification',
    analysis: 'analysis',
    utility: 'implementation',
  };
  return map[category] || 'implementation';
}

function inferRecommendedAgents(keywords) {
  const agents = [];
  if (keywords.includes('learning') || keywords.includes('rl')) agents.push('atlas');
  if (keywords.includes('benchmark') || keywords.includes('evaluation')) agents.push('oracle');
  if (keywords.includes('runbooks') || keywords.includes('error')) agents.push('sisyphus');
  if (keywords.includes('memory') || keywords.includes('graph')) agents.push('librarian');
  if (keywords.includes('codebase')) agents.push('oracle');
  return [...new Set(agents)];
}

// ---------------------------------------------------------------------------
// Main: generate entries for all target packages
// ---------------------------------------------------------------------------
export function generateAll() {
  const PKGS_DIR = join(ROOT, 'packages');
  const targetSet = new Set(TARGET_PACKAGES);

  const results = {};
  const errors = [];

  for (const pkgName of TARGET_PACKAGES) {
    const pkgDir = join(PKGS_DIR, pkgName);
    let pkgJson;

    try {
      pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    } catch (e) {
      errors.push({ pkg: pkgName, error: `package.json not found or invalid: ${e.message}` });
      continue;
    }

    const skillName = pkgName.replace(/^opencode-/, '').replace(/-/g, '-');
    const entry = buildEntry(pkgName, pkgJson, pkgDir, targetSet);
    results[skillName] = entry;
  }

  return { results, errors };
}

export function writeEntries(entries, { outputDir = OUTPUT_DIR, dryRun = false } = {}) {
  // Create output dir if needed (mkdirSync is safe — Node.js creates intermediate dirs)
  mkdirSync(outputDir, { recursive: true });
  const output = JSON.stringify({ generated: entries, generatedAt: new Date().toISOString() }, null, 2);
  const outPath = join(outputDir, 'generated-skills.json');
  writeFileSync(outPath, output, 'utf8');
  return outPath;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const diffMode = args.includes('--diff');
const dryRun = args.includes('--dry-run');

const { results, errors } = generateAll();

// Pretty-print summary
console.log('\n=== Registry Bridge: Skill Entry Generation ===\n');
console.log(`Target packages: ${TARGET_PACKAGES.length}`);
console.log(`Successfully generated: ${Object.keys(results).length}`);
if (errors.length) console.log(`Errors: ${errors.length}`);

for (const [skill, entry] of Object.entries(results)) {
  console.log(`\n  ${skill}`);
  console.log(`    category:    ${entry.category}`);
  console.log(`    triggers:    ${entry.triggers.length}`);
  console.log(`    tags:        ${entry.tags.slice(0, 3).join(', ')}`);
  console.log(`    synergies:   ${entry.synergies.length ? entry.synergies.join(', ') : '(none)'}`);
  console.log(`    inputs:      ${entry.inputs.map(i => i.name).join(', ') || '(none)'}`);
}

if (errors.length) {
  console.log('\n=== Errors ===');
  for (const e of errors) console.log(`  ${e.pkg}: ${e.error}`);
}

// Write output (unless --dry-run)
if (!dryRun) {
  try {
    const outPath = writeEntries(results);
    console.log(`\nWritten to: ${outPath}`);
  } catch (e) {
    console.error(`\nFailed to write output: ${e.message}`);
    process.exit(1);
  }
}

process.exit(errors.length ? 1 : 0);
