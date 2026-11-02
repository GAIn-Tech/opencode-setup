#!/usr/bin/env node
/**
 * synthesize-meta-kb.mjs — Aggregate learning-updates + AGENTS.md into a
 * queryable meta-knowledge index.
 *
 * Produces: opencode-config/meta-knowledge-index.json
 *
 * Usage:
 *   node scripts/synthesize-meta-kb.mjs              # Full synthesis
 *   node scripts/synthesize-meta-kb.mjs --dry-run    # Preview without writing
 *   node scripts/synthesize-meta-kb.mjs --stats      # Print stats only
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoot } from './resolve-root.mjs';

const __filename = fileURLToPath(import.meta.url);

const ROOT = resolveRoot();
const UPDATES_DIR = join(ROOT, 'opencode-config', 'learning-updates');
const OUTPUT_PATH = join(ROOT, 'opencode-config', 'meta-knowledge-index.json');

// --- CLI flags ---
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STATS_ONLY = args.includes('--stats');

// --- Helpers ---

/**
 * Recursively find files matching a name pattern, skipping excluded dirs.
 */
function findFiles(dir, fileName, excludeDirs = ['node_modules', '.next', '.git', '.worktrees']) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (excludeDirs.includes(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, fileName, excludeDirs));
    } else if (entry.name === fileName) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Extract the first two path segments as a grouping key for affected_paths.
 * e.g. "packages/opencode-dashboard/src/foo.js" -> "packages/opencode-dashboard"
 */
function pathPrefix(filePath) {
  // Normalize to forward slashes
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, 2).join('/');
  return parts[0] || normalized;
}

/**
 * Extract a section from AGENTS.md content between ## HEADER and the next ## or EOF.
 */
function extractSection(content, sectionName) {
  const headerPattern = new RegExp(`^## ${sectionName}.*$`, 'mi');
  const match = content.match(headerPattern);
  if (!match) return null;

  const startIdx = match.index + match[0].length;
  // Find the next ## header (or EOF)
  const rest = content.slice(startIdx);
  const nextHeader = rest.match(/^## /m);
  const sectionText = nextHeader ? rest.slice(0, nextHeader.index) : rest;
  return sectionText.trim();
}

/**
 * Parse anti-patterns from an AGENTS.md section.
 * Handles formats like:
 *   **Name**: Description
 *   - **Name**: Description
 *   **Severity (Label)**:
 */
function parseAntiPatterns(sectionText, sourceFile) {
  if (!sectionText) return [];
  const results = [];
  // Match lines with bold text followed by colon and description
  // Pattern: **Name**: Description  or  - **Name**: Description
  const lines = sectionText.split('\n');
  let currentSeverity = 'medium';

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for severity headers like **CRITICAL (Must Avoid)**:
    const severityMatch = trimmed.match(/^\*\*(CRITICAL|HIGH|MEDIUM|LOW|WARNINGS?|SQL)\b[^*]*\*\*\s*:?/i);
    if (severityMatch) {
      const sev = severityMatch[1].toUpperCase();
      if (sev === 'CRITICAL') currentSeverity = 'critical';
      else if (sev === 'HIGH') currentSeverity = 'high';
      else if (sev === 'LOW') currentSeverity = 'low';
      else if (sev.startsWith('WARN')) currentSeverity = 'warning';
      else if (sev === 'SQL') currentSeverity = 'medium';
      else currentSeverity = 'medium';
      continue;
    }

    // Match anti-pattern entries: - **Name**: Description
    const entryMatch = trimmed.match(/^-?\s*\*\*([^*]+)\*\*\s*:\s*(.+)/);
    if (entryMatch) {
      results.push({
        source: 'agents.md',
        file: sourceFile,
        pattern: entryMatch[1].trim(),
        severity: currentSeverity,
        description: entryMatch[2].trim(),
      });
    }
  }
  return results;
}

/**
 * Parse conventions from an AGENTS.md section.
 * Format: - **Name**: Description
 */
function parseConventions(sectionText, sourceFile) {
  if (!sectionText) return [];
  const results = [];
  const lines = sectionText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^-?\s*\*\*([^*]+)\*\*\s*:\s*(.+)/);
    if (match) {
      results.push({
        source: 'agents.md',
        file: sourceFile,
        convention: match[1].trim(),
        description: match[2].trim(),
      });
    }
  }
  return results;
}

/**
 * Parse commands from an AGENTS.md section (markdown table).
 * Format: | command | purpose |
 */
function parseCommands(sectionText, sourceFile) {
  if (!sectionText) return [];
  const results = [];
  const lines = sectionText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip header rows and separator rows
    if (!trimmed.startsWith('|')) continue;
    if (trimmed.match(/^\|\s*-+/)) continue;
    if (trimmed.match(/^\|\s*Command\s*\|/i)) continue;

    const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length >= 2) {
      const command = cells[0].replace(/`/g, '').trim();
      const purpose = cells[1].trim();
      if (command && purpose && command.toLowerCase() !== 'command') {
        results.push({
          source: 'agents.md',
          file: sourceFile,
          command,
          purpose,
        });
      }
    }
  }
  return results;
}

// --- Semantic auto-categorization ---

/**
 * Infer a canonical category from an update record's id, summary, and paths.
 * Applied only when the record has no explicit `category` field.
 * Rules are ordered from most-specific to least-specific.
 */
const CATEGORY_RULES = [
  // Security concerns first (narrow patterns)
  { keywords: ['injection', 'command-injection', 'xss', 'csrf', 'auth-bypass', 'vulnerability'], category: 'security' },
  // Specific subsystems
  { keywords: ['context-governor', 'context-bridge', 'context-management', 'memory-graph', 'token-budget'], category: 'context-management' },
  { keywords: ['skill-rl', 'skill-activation', 'skill-bank', 'exploration-rl', 'skill-orchestrat'], category: 'skill-activation' },
  { keywords: ['model-router', 'circuit-breaker', 'routing', 'rate-limit', 'quota', 'fallback-chain'], category: 'routing' },
  { keywords: ['dashboard', 'observability', 'ui-widget', 'frontend'], category: 'dashboard' },
  { keywords: ['telemetry', 'tool-telemetry', 'metrics-collector', 'alert-manager'], category: 'telemetry' },
  { keywords: ['learning-engine', 'learning-gate', 'orchestration-advisor', 'pattern-extractor', 'meta-kb', 'meta-knowledge'], category: 'learning' },
  { keywords: ['governance', 'commit-governance', 'deployment-state', 'pr-governance'], category: 'governance' },
  { keywords: ['agents-md', 'agent-source', 'agent-config', 'agents-drift'], category: 'agent-config' },
  { keywords: ['benchmark', 'eval', 'ml-evaluation', 'performance', 'perf-track', 'latency'], category: 'performance' },
  { keywords: ['dead-code', 'dead_code', 'dead-code-elim', 'unused-import', 'dead-export'], category: 'dead-code' },
  { keywords: ['drift', 'namespace-drift', 'drift-fix', 'count-drift'], category: 'drift-fix' },
  { keywords: ['type-safety', 'typescript', 'ts-strict', 'type-error'], category: 'type-safety' },
  { keywords: ['test', 'regression', 'coverage', 'jest', 'vitest', 'spec'], category: 'testing' },
  { keywords: ['api-compat', 'api-compatibility', 'api-version', 'openai-compat', 'vertex-ai'], category: 'api-compatibility' },
  { keywords: ['dependency', 'dep-cleanup', 'package-upgrade', 'bun-upgrade', 'npm-upgrade', 'node-upgrade', 'bun-1-3'], category: 'infrastructure' },
  { keywords: ['setup', 'bootstrap', 'install', 'init', 'verify-setup'], category: 'infrastructure' },
  { keywords: ['security', 'hardening', 'audit-log', 'audit-hardening', 'boundary-hardening', 'schema-hardening'], category: 'reliability' },
  { keywords: ['config', 'central-config', 'opencode-config', 'configuration'], category: 'configuration' },
  { keywords: ['codebase-auditor', 'codebase-audit'], category: 'tooling' },
  { keywords: ['browser-mcp', 'playwright', 'browser-automation'], category: 'tooling' },
  { keywords: ['doc', 'documentation', 'readme', 'agents-md-doc'], category: 'documentation' },
  { keywords: ['bugfix', 'bug-fix', 'fix-reversal', 'critical-fix', 'hotfix'], category: 'bugfix' },
  { keywords: ['integration', 'integration-layer', 'integration-hardening', 'wiring'], category: 'integration' },
  { keywords: ['model-manager', 'model-catalog', 'model-sync', 'model-rollback', 'model-valid'], category: 'model-management' },
  { keywords: ['api'], category: 'api' },
  { keywords: ['memory'], category: 'context-management' },
  { keywords: ['infra', 'infrastructure', 'wave', 'automation-wave'], category: 'infrastructure' },
];

/**
 * Return a canonical category for a learning-update record.
 * Uses explicit category if present; falls back to keyword inference.
 */
function inferCategory(update) {
  if (update.category) return update.category;

  // Build a search corpus from id, summary, and affected_paths
  const corpus = [
    update.id || '',
    update.summary || '',
    ...(update.affected_paths || []),
  ].join(' ').toLowerCase().replace(/[_/\\]/g, '-');

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(kw => corpus.includes(kw))) {
      return rule.category;
    }
  }

  return 'uncategorized';
}

// --- Main synthesis ---

function synthesize() {
  const index = {
    generated_at: new Date().toISOString(),
    schema_version: 1,
    total_records: 0,
    source_files: { learning_updates: 0, agents_md: 0 },
    by_category: {},
    by_risk_level: { low: [], medium: [], high: [] },
    by_affected_path: {},
    anti_patterns: [],
    conventions: [],
    commands: [],
  };

  // ─── 1. Read learning-updates ────────────────────────────
  const updateFiles = [];
  if (existsSync(UPDATES_DIR)) {
    try {
      const entries = readdirSync(UPDATES_DIR);
      for (const name of entries) {
        if (!name.endsWith('.json')) continue;
        updateFiles.push(join(UPDATES_DIR, name));
      }
    } catch (err) {
      console.error(`[synthesize-meta-kb] Failed to read updates dir: ${err.message}`);
    }
  }

  const validUpdates = [];
  let skipped = 0;

  for (const filePath of updateFiles) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      // Minimal validation: must have id, summary, risk_level
      if (!data.id || !data.summary || !data.risk_level) {
        skipped++;
        console.error(`[synthesize-meta-kb] WARN: Skipping ${relative(ROOT, filePath)} — missing required fields`);
        continue;
      }

      // Normalize: ensure affected_paths is an array
      if (!Array.isArray(data.affected_paths)) {
        data.affected_paths = [];
      }

      validUpdates.push(data);
    } catch (err) {
      skipped++;
      console.error(`[synthesize-meta-kb] WARN: Skipping ${relative(ROOT, filePath)} — ${err.message}`);
    }
  }

  // Sort by timestamp descending (newest first)
  validUpdates.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  // Build indices
  for (const update of validUpdates) {
    const entry = {
      id: update.id,
      summary: update.summary,
      risk_level: update.risk_level,
      affected_paths: update.affected_paths,
      timestamp: update.timestamp || null,
    };

    // by_category (use semantic inference when explicit category missing)
    const category = inferCategory(update);
    if (!index.by_category[category]) index.by_category[category] = [];
    index.by_category[category].push(entry);

    // by_risk_level
    const risk = update.risk_level || 'low';
    if (!index.by_risk_level[risk]) index.by_risk_level[risk] = [];
    index.by_risk_level[risk].push(entry);

    // by_affected_path
    for (const affectedPath of update.affected_paths) {
      const prefix = pathPrefix(affectedPath);
      if (!index.by_affected_path[prefix]) index.by_affected_path[prefix] = [];
      // Avoid duplicates in the same path prefix group
      if (!index.by_affected_path[prefix].some(e => e.id === entry.id)) {
        index.by_affected_path[prefix].push({
          id: entry.id,
          summary: entry.summary,
          risk_level: entry.risk_level,
          timestamp: entry.timestamp,
        });
      }
    }
  }

  index.total_records = validUpdates.length;
  index.source_files.learning_updates = validUpdates.length;

  // ─── 2. Find and parse AGENTS.md files ────────────────────
  const agentsMdFiles = findFiles(ROOT, 'AGENTS.md');

  for (const mdPath of agentsMdFiles) {
    const relPath = relative(ROOT, mdPath).replace(/\\/g, '/');

    // Skip files inside local/ or node_modules (oh-my-opencode has 30+ AGENTS.md)
    if (relPath.startsWith('local/') || relPath.includes('node_modules')) continue;

    let content;
    try {
      content = readFileSync(mdPath, 'utf-8');
    } catch {
      continue;
    }

    index.source_files.agents_md++;

    // Extract sections
    const antiPatternsSection = extractSection(content, 'ANTI-PATTERNS') || extractSection(content, 'ANTI_PATTERNS');
    const conventionsSection = extractSection(content, 'CONVENTIONS');
    const commandsSection = extractSection(content, 'COMMANDS');
    const uniqueStylesSection = extractSection(content, 'UNIQUE STYLES');

    // Parse each section
    const antiPatterns = parseAntiPatterns(antiPatternsSection, relPath);
    const conventions = [
      ...parseConventions(conventionsSection, relPath),
      ...parseConventions(uniqueStylesSection, relPath),
    ];
    const commands = parseCommands(commandsSection, relPath);

    index.anti_patterns.push(...antiPatterns);
    index.conventions.push(...conventions);
    index.commands.push(...commands);
  }

  return { index, skipped };
}

function normalizeIndexForComparison(index) {
  if (!index || typeof index !== 'object') return null;
  const clone = JSON.parse(JSON.stringify(index));
  delete clone.generated_at;
  return clone;
}

function prepareOutputIndex(nextIndex, existingIndex) {
  if (!existingIndex || typeof existingIndex !== 'object') {
    return { index: nextIndex, changed: true };
  }

  const normalizedExisting = normalizeIndexForComparison(existingIndex);
  const normalizedNext = normalizeIndexForComparison(nextIndex);

  if (JSON.stringify(normalizedExisting) === JSON.stringify(normalizedNext)) {
    // Always freshen generated_at so health checks see the last synthesis run time,
    // not the original creation time (which causes false staleness warnings).
    return {
      index: {
        ...nextIndex,
        generated_at: nextIndex.generated_at,  // use current run's timestamp
      },
      changed: true,  // always write so mtime reflects latest run
    };
  }

  return { index: nextIndex, changed: true };
}

// --- Entry point ---

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  const { index, skipped } = synthesize();

  const stats = [
    `Synthesized ${index.source_files.learning_updates} learning-updates + ${index.source_files.agents_md} AGENTS.md files`,
    `  Categories: ${Object.keys(index.by_category).length}`,
    `  Risk levels: low=${(index.by_risk_level.low || []).length}, medium=${(index.by_risk_level.medium || []).length}, high=${(index.by_risk_level.high || []).length}`,
    `  Affected path groups: ${Object.keys(index.by_affected_path).length}`,
    `  Anti-patterns: ${index.anti_patterns.length}`,
    `  Conventions: ${index.conventions.length}`,
    `  Commands: ${index.commands.length}`,
    skipped > 0 ? `  Skipped: ${skipped} invalid files` : null,
  ].filter(Boolean);

  if (STATS_ONLY) {
    console.error(stats.join('\n'));
    process.exit(0);
  }

  if (DRY_RUN) {
    console.error('[dry-run] Would write to:', relative(ROOT, OUTPUT_PATH));
    console.error(stats.join('\n'));
    console.log(JSON.stringify(index, null, 2));
    process.exit(0);
  }

  let existingIndex = null;
  if (existsSync(OUTPUT_PATH)) {
    try {
      existingIndex = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
    } catch {
      existingIndex = null;
    }
  }

  const { index: outputIndex, changed } = prepareOutputIndex(index, existingIndex);

  // Write output
  const outputDir = join(ROOT, 'opencode-config');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  if (changed || !existsSync(OUTPUT_PATH)) {
    writeFileSync(OUTPUT_PATH, JSON.stringify(outputIndex, null, 2), 'utf-8');
  }

  console.error(stats.join('\n'));
  if (changed || !existsSync(OUTPUT_PATH)) {
    console.error(`-> ${relative(ROOT, OUTPUT_PATH)}`);
  } else {
    console.error(`-> ${relative(ROOT, OUTPUT_PATH)} (unchanged)`);
  }
  process.exit(0);
}

// Export for programmatic use
export { synthesize, normalizeIndexForComparison, prepareOutputIndex };
