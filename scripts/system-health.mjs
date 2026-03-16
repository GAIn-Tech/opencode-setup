#!/usr/bin/env node
/**
 * system-health.mjs
 *
 * Single-command health report for all opencode system components.
 * Surfaces real KPIs, not just "is it running".
 *
 * Usage: node scripts/system-health.mjs [--json] [--verbose]
 *
 * Subsystems audited:
 *   1. Learning Engine (anti/positive patterns, context richness, adaptation signal)
 *   2. Skill-RL (usage_count, evolution events, dormancy)
 *   3. Meta-Knowledge Base (staleness, coverage, categorization quality)
 *   4. Orchestration Advisor (outcome loop, learnFromOutcome calls, routing confidence)
 *   5. Tool Telemetry (invocation volume, unknown tools, param capture rate)
 *   6. Context Governor (persistence, cross-session tracking)
 *   7. Memory Graph (persistence, last saved)
 *   8. Runbooks (pattern coverage, Gemini patterns)
 */

import { createRequire } from 'module';
import { existsSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HOME = homedir();
const OPENCODE_DIR = join(HOME, '.opencode');

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const VERBOSE = args.includes('--verbose');

// ── ANSI colors (skipped in JSON mode) ────────────────────────────────────────
const c = JSON_MODE ? {
  reset: '', bold: '', dim: '', red: '', yellow: '', green: '', cyan: '', magenta: '', blue: '',
} : {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

const STATUS = {
  HEALTHY:  `${c.green}${c.bold}HEALTHY${c.reset}`,
  WARNING:  `${c.yellow}${c.bold}WARNING${c.reset}`,
  CRITICAL: `${c.red}${c.bold}CRITICAL${c.reset}`,
  DORMANT:  `${c.magenta}${c.bold}DORMANT${c.reset}`,
  UNKNOWN:  `${c.dim}UNKNOWN${c.reset}`,
};

const SCORE = { HEALTHY: 2, WARNING: 1, CRITICAL: 0, DORMANT: 0, UNKNOWN: 0 };

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeRead(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function fileAgeHours(filePath) {
  try {
    const stat = statSync(filePath);
    return (Date.now() - stat.mtimeMs) / 3600000;
  } catch {
    return Infinity;
  }
}

function pct(num, denom) {
  if (!denom) return '0%';
  return Math.round((num / denom) * 100) + '%';
}

function ageStr(hours) {
  if (hours === Infinity) return 'N/A';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

// ── Individual subsystem auditors ─────────────────────────────────────────────

function auditLearningEngine() {
  const antiPath = join(OPENCODE_DIR, 'learning', 'anti-patterns.json');
  const posPath  = join(OPENCODE_DIR, 'learning', 'positive-patterns.json');

  const antiData = safeRead(antiPath);
  const posData  = safeRead(posPath);

  if (!antiData && !posData) {
    return {
      status: 'UNKNOWN',
      summary: 'Learning data not found at ~/.opencode/learning/',
      metrics: {},
    };
  }

  // Anti-patterns
  const antiPatterns = antiData?.patterns || [];
  const antiCount = antiPatterns.length;
  const antiCtxNonempty = antiPatterns.filter(p => {
    const ctxArr = p.contexts || (p.context ? [p.context] : []);
    return ctxArr.some(ctx => ctx && Object.keys(ctx).length > 0);
  }).length;
  const antiTotalOccurrences = antiPatterns.reduce((s, p) => s + (p.occurrences || 1), 0);
  const corePersistCount = antiPatterns.filter(p => p.persistence === 'core').length;

  // Positive patterns
  const posPatterns = posData?.patterns || [];
  const posCount = posPatterns.length;
  const posCtxNonempty = posPatterns.filter(p => {
    const ctxArr = p.contexts || (p.context ? [p.context] : []);
    return ctxArr.some(ctx => ctx && Object.keys(ctx).length > 0);
  }).length;
  const posGoodSuccessRate = posPatterns.filter(p => (p.success_rate || 0) >= 0.8).length;

  // Age
  const antiAge = fileAgeHours(antiPath);
  const posAge  = fileAgeHours(posPath);

  // Context richness score (0-1)
  const totalPatternsWithCtx = antiCtxNonempty + posCtxNonempty;
  const totalPatterns = antiCount + posCount;
  const ctxRichness = totalPatterns > 0 ? totalPatternsWithCtx / totalPatterns : 0;

  // Placeholder descriptions (bad signal)
  const placeholderDescriptions = [
    ...antiPatterns.filter(p => ['test', 'updated evidence', ''].includes((p.description || '').toLowerCase())),
    ...posPatterns.filter(p => ['test', ''].includes((p.description || '').toLowerCase())),
  ].length;

  // Health determination
  let status = 'HEALTHY';
  const issues = [];
  if (antiCount < 5) { status = 'WARNING'; issues.push(`Only ${antiCount} anti-patterns (target ≥10)`); }
  if (ctxRichness < 0.3) { status = 'WARNING'; issues.push(`Low context richness: ${pct(totalPatternsWithCtx, totalPatterns)} non-empty contexts`); }
  if (placeholderDescriptions > 2) { issues.push(`${placeholderDescriptions} placeholder descriptions`); }
  if (antiAge > 48) { status = 'WARNING'; issues.push(`Anti-pattern data is ${ageStr(antiAge)} old`); }
  if (antiCount === 0 && posCount === 0) { status = 'CRITICAL'; issues.push('No patterns at all'); }

  return {
    status,
    summary: `${antiCount} anti-patterns, ${posCount} positive patterns | ctx richness: ${pct(totalPatternsWithCtx, totalPatterns)}`,
    metrics: {
      anti_pattern_count: antiCount,
      positive_pattern_count: posCount,
      total_occurrences: antiTotalOccurrences,
      core_persist_count: corePersistCount,
      context_richness_pct: pct(totalPatternsWithCtx, totalPatterns),
      placeholder_descriptions: placeholderDescriptions,
      good_success_rate_pos: posGoodSuccessRate,
      anti_data_age: ageStr(antiAge),
      pos_data_age: ageStr(posAge),
    },
    issues,
  };
}

function auditSkillRL() {
  const rlPath = join(OPENCODE_DIR, 'skill-rl.json');
  const data = safeRead(rlPath);

  if (!data) {
    return {
      status: 'UNKNOWN',
      summary: '~/.opencode/skill-rl.json not found',
      metrics: {},
    };
  }

  const generalSkills = data.skillBank?.general || {};
  const taskSpecific  = data.skillBank?.taskSpecific || {};
  const failureHistory = data.evolutionEngine?.failure_history || [];

  // generalSkills is a Map serialized as array of [name, obj] entries — extract the object from each entry
  const generalArr = Array.isArray(generalSkills)
    ? generalSkills.map(entry => (Array.isArray(entry) ? entry[1] : entry))
    : Object.values(generalSkills);
  const totalSkills = generalArr.length;
  const usedSkills  = generalArr.filter(s => (s.usage_count || 0) > 0);
  const avgUsage    = totalSkills > 0 ? generalArr.reduce((s, sk) => s + (sk.usage_count || 0), 0) / totalSkills : 0;
  const avgSuccessRate = usedSkills.length > 0
    ? usedSkills.reduce((s, sk) => s + (sk.success_rate || 0), 0) / usedSkills.length : 0;
  const taskSpecificCount = Object.keys(taskSpecific).length;
  const dataAge = data.timestamp ? (Date.now() - data.timestamp) / 3600000 : Infinity;

  let status = 'DORMANT';
  const issues = [];

  if (usedSkills.length === 0) {
    issues.push('All skills have usage_count=0 — SkillRLManager never wired to task routing');
  }
  if (failureHistory.length === 0 && usedSkills.length === 0) {
    issues.push('No failure history, no evolution events — system not learning from outcomes');
  }
  if (usedSkills.length > 0) {
    status = avgSuccessRate >= 0.7 ? 'HEALTHY' : 'WARNING';
  }

  const topSkills = [...usedSkills]
    .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
    .slice(0, 5)
    .map(s => `${s.name}(${s.usage_count}x)`);

  return {
    status,
    summary: `${totalSkills} general skills, ${usedSkills.length} used | ${taskSpecificCount} task-specific types | ${failureHistory.length} failure events`,
    metrics: {
      total_general_skills: totalSkills,
      skills_with_usage: usedSkills.length,
      avg_usage_per_skill: Math.round(avgUsage * 10) / 10,
      avg_success_rate: usedSkills.length > 0 ? Math.round(avgSuccessRate * 100) + '%' : 'N/A',
      task_specific_types: taskSpecificCount,
      evolution_failures: failureHistory.length,
      data_age: ageStr(dataAge),
      top_skills: topSkills.join(', ') || 'none',
    },
    issues,
  };
}

function auditMetaKB() {
  const metaKBPath = join(ROOT, 'opencode-config', 'meta-knowledge-index.json');
  const data = safeRead(metaKBPath);

  if (!data) {
    return { status: 'UNKNOWN', summary: 'meta-knowledge-index.json not found', metrics: {} };
  }

  // Prefer generated_at field from JSON (synthesize may skip write if content unchanged)
  const generatedAt = data.generated_at ? new Date(data.generated_at) : null;
  const age = generatedAt && !isNaN(generatedAt)
    ? (Date.now() - generatedAt.getTime()) / 3600000
    : fileAgeHours(metaKBPath);
  const TTL_HOURS = 24;

  const antiPatterns = data.anti_patterns || [];
  const conventions  = data.conventions || [];
  const commands     = data.commands || [];
  const totalRecords = data.total_records || (data.records?.length || 0);
  const byCategory   = data.by_category || {};
  const categoryCount = Object.keys(byCategory).length;
  const uncategorizedCount = (byCategory.uncategorized || []).length;

  // Source files coverage
  const sourceFiles = data.source_files || {};
  const agentsMdCount = Array.isArray(sourceFiles) 
    ? sourceFiles.filter(f => f.includes('AGENTS.md')).length 
    : (sourceFiles.agents_md || 0);
  const learningUpdateCount = Array.isArray(sourceFiles)
    ? sourceFiles.filter(f => f.includes('learning-updates')).length
    : (sourceFiles.learning_updates || 0);

  let status = 'HEALTHY';
  const issues = [];

  if (age > TTL_HOURS) {
    status = 'WARNING';
    issues.push(`Stale: ${ageStr(age)} old (TTL is ${TTL_HOURS}h) — run bun run scripts/generate-meta-kb.mjs`);
  }
  if (antiPatterns.length < 5) {
    issues.push(`Only ${antiPatterns.length} anti-patterns indexed (expected ≥5 from AGENTS.md)`);
  }
  if (uncategorizedCount > totalRecords * 0.5) {
    issues.push(`${uncategorizedCount}/${totalRecords} records are uncategorized — semantic matching degraded`);
  }
  if (status === 'HEALTHY' && issues.length > 0) status = 'WARNING';

  return {
    status,
    summary: `${totalRecords} records | ${antiPatterns.length} anti-patterns | ${conventions.length} conventions | age: ${ageStr(age)}`,
    metrics: {
      total_records: totalRecords,
      anti_patterns_indexed: antiPatterns.length,
      conventions_indexed: conventions.length,
      commands_indexed: commands.length,
      category_count: categoryCount,
      uncategorized_count: uncategorizedCount,
      source_agents_md: agentsMdCount,
      source_learning_updates: learningUpdateCount,
      age: ageStr(age),
      stale: age > TTL_HOURS,
    },
    issues,
  };
}

function auditOrchestrationAdvisor() {
  // The advisor's outcomeLog is in-memory only (on the LearningEngine instance).
  // We can infer its state by checking whether learnFromOutcome is called anywhere.
  const advisorSrcPath = join(ROOT, 'packages', 'opencode-learning-engine', 'src', 'orchestration-advisor.js');
  const src = existsSync(advisorSrcPath) ? readFileSync(advisorSrcPath, 'utf8') : '';

  // Check if learnFromOutcome is called from the telemetry hook or any script
  const telemetryPath = join(ROOT, 'scripts', 'runtime-tool-telemetry.mjs');
  const ingestPath = join(ROOT, 'scripts', 'ingest-sessions.mjs');
  const telemetrySrc = existsSync(telemetryPath) ? readFileSync(telemetryPath, 'utf8') : '';
  const ingestSrc = existsSync(ingestPath) ? readFileSync(ingestPath, 'utf8') : '';
  // Delegation log: indirect wiring via ingest-sessions.mjs
  const delegationLogPath = join(OPENCODE_DIR, 'delegation-log.json');
  const hasDelegationLog = existsSync(delegationLogPath);

  const learnFromOutcomeDefined = src.includes('learnFromOutcome(');
  // Wired if called directly in telemetry OR via delegation-log pipeline in ingest-sessions
  const learnFromOutcomeCalledInTelemetry = telemetrySrc.includes('learnFromOutcome');
  const learnFromOutcomeCalledInIngest = ingestSrc.includes('learnFromOutcome') || ingestSrc.includes('processDelegationLog');
  const learnFromOutcomeWired = learnFromOutcomeCalledInTelemetry || learnFromOutcomeCalledInIngest;

  // Check if advise() is called anywhere (wired to real tasks)
  const isAdviseCalled = telemetrySrc.includes('.advise(') || telemetrySrc.includes('engine.advise(')
    || ingestSrc.includes('.advise(');

  // Count outcomeLog references in advisor source
  const outcomeLogLines = src.split('\n').filter(l => l.includes('outcomeLog')).length;

  let status = 'DORMANT';
  const issues = [];

  if (!learnFromOutcomeDefined) {
    issues.push('learnFromOutcome() method not found in orchestration-advisor.js');
  }
  if (!learnFromOutcomeWired) {
    issues.push('learnFromOutcome() never called anywhere — zero outcome feedback');
  }
  if (!isAdviseCalled) {
    issues.push('advise() not wired to any script — no routing advice generated');
  }
  if (learnFromOutcomeCalledInIngest && !hasDelegationLog) {
    issues.push('ingest-sessions.mjs wires delegation log but ~/.opencode/delegation-log.json not yet created');
  }

  if (learnFromOutcomeWired && isAdviseCalled) {
    status = hasDelegationLog ? 'HEALTHY' : 'WARNING';
  } else if (learnFromOutcomeDefined && !learnFromOutcomeWired) {
    status = 'DORMANT';
  }

  return {
    status,
    summary: learnFromOutcomeWired
      ? (hasDelegationLog
          ? 'Outcome loop wired via delegation log — outcomes being learned'
          : 'Outcome loop wired but no delegation events yet (run a task to generate signals)')
      : 'Outcome loop DISCONNECTED — routing advice never reinforced',
    metrics: {
      learn_from_outcome_defined: learnFromOutcomeDefined,
      learn_from_outcome_wired_in_telemetry: learnFromOutcomeCalledInTelemetry,
      learn_from_outcome_wired_in_ingest: learnFromOutcomeCalledInIngest,
      advise_wired: isAdviseCalled,
      delegation_log_exists: hasDelegationLog,
      outcome_log_references_in_src: outcomeLogLines,
    },
    issues,
  };
}

function auditToolTelemetry() {
  const invPath = join(OPENCODE_DIR, 'tool-usage', 'invocations.json');
  const data = safeRead(invPath);

  if (!data) {
    return { status: 'UNKNOWN', summary: '~/.opencode/tool-usage/invocations.json not found', metrics: {} };
  }

  const invocations = Array.isArray(data) ? data : (data.invocations || []);
  const total = invocations.length;
  const sessions = new Set(invocations.map(i => i.context?.session || i.session_id).filter(Boolean)).size;
  const unknownCount = invocations.filter(i => i.category === 'unknown' || i.priority === 'unknown').length;
  const withParams = invocations.filter(i => i.params && Object.keys(i.params).length > 0).length;
  const failures = invocations.filter(i => i.success === false).length;

  // Category breakdown
  const catCounts = {};
  for (const inv of invocations) {
    const cat = inv.category || 'unknown';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  }
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);

  // Age (most recent invocation)
  const timestamps = invocations.map(i => i.timestamp ? new Date(i.timestamp).getTime() : 0).filter(Boolean);
  const mostRecent = timestamps.length > 0 ? (Date.now() - Math.max(...timestamps)) / 3600000 : Infinity;

  const paramCaptureRate = pct(withParams, total);
  const unknownRate = pct(unknownCount, total);

  let status = 'HEALTHY';
  const issues = [];

  if (withParams === 0) {
    status = 'WARNING';
    issues.push('0% param capture rate — tool params always {} (structural limitation in oh-my-opencode hook)');
  }
  if (unknownCount > 20) {
    issues.push(`${unknownCount} invocations with unknown category/priority`);
  }
  if (total >= 1000) {
    issues.push('At cap (1000 entries) — oldest entries being overwritten');
  }

  return {
    status,
    summary: `${total} invocations across ${sessions} sessions | unknown: ${unknownRate} | param capture: ${paramCaptureRate}`,
    metrics: {
      total_invocations: total,
      unique_sessions: sessions,
      unknown_category_count: unknownCount,
      unknown_category_pct: unknownRate,
      param_capture_count: withParams,
      param_capture_pct: paramCaptureRate,
      failure_count: failures,
      at_cap: total >= 1000,
      most_recent_invocation: ageStr(mostRecent),
      top_categories: sortedCats.slice(0, 5).map(([k, v]) => `${k}(${v})`).join(', '),
    },
    issues,
  };
}

function auditContextGovernor() {
  // Governor persists to ~/.opencode/session-budgets.json (DEFAULT_PERSIST_PATH)
  const budgetsPath = join(OPENCODE_DIR, 'session-budgets.json');
  const hasBudgets = existsSync(budgetsPath);

  // Check MCP config to see if it's enabled
  const mcpConfigPath = join(ROOT, 'mcp-servers', 'opencode-mcp-config.json');
  const mcpConfig = safeRead(mcpConfigPath);
  const mcpServers = mcpConfig?.mcpServers || mcpConfig?.servers || {};
  const govEntry = Array.isArray(mcpServers)
    ? mcpServers.find(s => s.name?.includes('context-governor'))
    : (mcpServers['opencode-context-governor'] || null);
  const isEnabled = Array.isArray(mcpServers)
    ? (govEntry?.enabled === true)
    : (govEntry?.enabled === true);

  // Load budget data if available
  let sessionCount = 0;
  let totalTokens = 0;
  if (hasBudgets) {
    try {
      const budgetData = safeRead(budgetsPath);
      const sessions = budgetData?.sessions || budgetData || {};
      sessionCount = typeof sessions === 'object' ? Object.keys(sessions).length : 0;
      totalTokens = Object.values(sessions).reduce((sum, s) => {
        const models = s?.models || {};
        return sum + Object.values(models).reduce((ms, m) => ms + (m?.tokens_used || 0), 0);
      }, 0);
    } catch (_) { /* non-fatal */ }
  }

  const issues = [];
  let status;

  if (!isEnabled) {
    status = 'CRITICAL';
    issues.push('context-governor MCP not enabled in opencode-mcp-config.json');
  } else if (!hasBudgets) {
    status = 'WARNING';
    issues.push('~/.opencode/session-budgets.json not yet written — MCP has not been restarted since setup');
  } else {
    status = 'HEALTHY';
  }

  return {
    status,
    summary: hasBudgets
      ? `Budget data: ${sessionCount} sessions tracked, ${totalTokens.toLocaleString()} total tokens | MCP enabled: ${isEnabled}`
      : `No budget data yet | MCP enabled: ${isEnabled}`,
    metrics: {
      mcp_enabled: isEnabled,
      session_budgets_exist: hasBudgets,
      sessions_tracked: sessionCount,
      total_tokens_recorded: totalTokens,
    },
    issues,
  };
}

function auditMemoryGraph() {
  const graphPath = join(OPENCODE_DIR, 'memory-graph.json');
  const hasGraph = existsSync(graphPath);
  const age = hasGraph ? fileAgeHours(graphPath) : Infinity;

  const mcpConfigPath = join(ROOT, 'mcp-servers', 'opencode-mcp-config.json');
  const mcpConfig = safeRead(mcpConfigPath);
  const mcpServers = mcpConfig?.mcpServers || mcpConfig?.servers || {};
  const graphEntry = Array.isArray(mcpServers)
    ? mcpServers.find(s => s.name?.includes('memory-graph'))
    : (mcpServers['opencode-memory-graph'] || null);
  const isEnabled = graphEntry?.enabled === true;

  let nodeCount = 0;
  let edgeCount = 0;
  if (hasGraph) {
    const data = safeRead(graphPath);
    nodeCount = data?.nodes?.length || data?.graph?.nodes?.length || 0;
    edgeCount = data?.edges?.length || data?.graph?.edges?.length || 0;
  }

  let status = 'WARNING';
  const issues = [];

  if (!hasGraph) {
    issues.push('~/.opencode/memory-graph.json not found — persistence not yet written (MCP needs restart)');
    status = 'WARNING';
  } else {
    // 0 nodes/edges is valid — no error patterns captured yet (normal for new installs)
    status = 'HEALTHY';
  }

  if (!isEnabled) {
    status = 'CRITICAL';
    issues.push('memory-graph MCP not enabled');
  }

  return {
    status,
    summary: hasGraph
      ? `Graph saved ${ageStr(age)} ago | ${nodeCount} nodes, ${edgeCount} edges | MCP enabled: ${isEnabled}`
      : `No saved graph | MCP enabled: ${isEnabled}`,
    metrics: {
      mcp_enabled: isEnabled,
      graph_file_exists: hasGraph,
      graph_age: ageStr(age),
      node_count: nodeCount,
      edge_count: edgeCount,
    },
    issues,
  };
}

function auditCodebaseMemory() {
  try {
    const { CodebaseMemory } = require(join(ROOT, 'packages', 'opencode-codebase-memory', 'src', 'index.js'));
    const mem = new CodebaseMemory();
    const repos = mem.listRepos();

    if (repos.length === 0) {
      return {
        status: 'DORMANT',
        summary: 'No indexed repositories — run: opencode-codebase analyze . --name opencode-setup',
        metrics: {
          repos_indexed: 0,
          total_nodes: 0,
          total_edges: 0,
        },
        issues: ['No repos indexed yet — codebase symbol graph unavailable for error enrichment'],
      };
    }

    let totalNodes = 0;
    let totalEdges = 0;
    const repoStats = [];

    for (const repo of repos) {
      try {
        const { GraphStore } = require(join(ROOT, 'packages', 'opencode-codebase-memory', 'src', 'graph-store.js'));
        const store = new GraphStore(repo.dbPath);
        const stats = store.getStats();
        totalNodes += stats.nodes || 0;
        totalEdges += stats.edges || 0;
        repoStats.push(`${repo.name}(${stats.nodes || 0}n/${stats.edges || 0}e)`);
        store.close();
      } catch (_) {
        // Non-fatal — repo may be corrupted
      }
    }

    const status = totalNodes > 0 ? 'HEALTHY' : 'WARNING';
    const issues = [];
    if (totalNodes === 0) {
      issues.push('Repos indexed but no symbols extracted — run: opencode-codebase analyze . --name opencode-setup');
    }

    return {
      status,
      summary: `${repos.length} repo(s) indexed | ${totalNodes} nodes, ${totalEdges} edges`,
      metrics: {
        repos_indexed: repos.length,
        total_nodes: totalNodes,
        total_edges: totalEdges,
        repo_breakdown: repoStats.join(', ') || 'none',
      },
      issues,
    };
  } catch (err) {
    return {
      status: 'UNKNOWN',
      summary: 'codebase-memory package not available',
      metrics: {},
      issues: [`Failed to load: ${err.message}`],
    };
  }
}

function auditRunbooks() {
   const runbooksPath = join(ROOT, 'packages', 'opencode-runbooks', 'src', 'runbooks.json');
   const data = safeRead(runbooksPath);

  if (!data) {
    return { status: 'UNKNOWN', summary: 'runbooks.json not found', metrics: {} };
  }

  const patterns = data.patterns || {};
  const patternIds = Object.keys(patterns);
  const total = patternIds.length;
  const geminiPatterns = patternIds.filter(id => id.toUpperCase().includes('GEMINI'));
  const withRemedies = patternIds.filter(id => patterns[id].remedy || patterns[id].remediation).length;
  const withExamples = patternIds.filter(id => patterns[id].examples?.length > 0).length;

  let status = total >= 10 ? 'HEALTHY' : 'WARNING';
  const issues = [];

  if (total < 10) issues.push(`Only ${total} runbook patterns (target ≥10 for useful coverage)`);
  if (geminiPatterns.length === 0) issues.push('No Gemini-specific runbook patterns');
  if (withRemedies < total * 0.8) issues.push(`${total - withRemedies} patterns missing remediation steps`);

  const age = fileAgeHours(runbooksPath);

  return {
    status,
    summary: `${total} patterns | ${geminiPatterns.length} Gemini | ${withRemedies} with remedies | age: ${ageStr(age)}`,
    metrics: {
      total_patterns: total,
      gemini_patterns: geminiPatterns.length,
      patterns_with_remedies: withRemedies,
      patterns_with_examples: withExamples,
      pattern_ids: VERBOSE ? patternIds.join(', ') : patternIds.slice(0, 5).join(', ') + (total > 5 ? '...' : ''),
      age: ageStr(age),
    },
    issues,
  };
}

// ── Report renderer ────────────────────────────────────────────────────────────

function renderSubsystem(name, result) {
  const statusLabel = STATUS[result.status] || STATUS.UNKNOWN;
  const scoreVal = SCORE[result.status] ?? 0;
  const icon = result.status === 'HEALTHY' ? '✓' : result.status === 'DORMANT' ? '◉' : result.status === 'CRITICAL' ? '✗' : '⚠';

  console.log(`\n${c.bold}${icon} ${name}${c.reset}  ${statusLabel}`);
  console.log(`  ${c.dim}${result.summary}${c.reset}`);

  if (VERBOSE && Object.keys(result.metrics).length > 0) {
    for (const [k, v] of Object.entries(result.metrics)) {
      console.log(`  ${c.cyan}${k}${c.reset}: ${v}`);
    }
  }

  if (result.issues?.length > 0) {
    for (const issue of result.issues) {
      const color = result.status === 'CRITICAL' ? c.red : result.status === 'DORMANT' ? c.magenta : c.yellow;
      console.log(`  ${color}→ ${issue}${c.reset}`);
    }
  }

  return scoreVal;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const audits = {
    'Learning Engine':        auditLearningEngine(),
    'Skill-RL':               auditSkillRL(),
    'Meta-Knowledge Base':    auditMetaKB(),
    'Orchestration Advisor':  auditOrchestrationAdvisor(),
    'Tool Telemetry':         auditToolTelemetry(),
    'Context Governor':       auditContextGovernor(),
    'Memory Graph':           auditMemoryGraph(),
    'Codebase Memory':        auditCodebaseMemory(),
    'Runbooks':               auditRunbooks(),
  };

  if (JSON_MODE) {
    console.log(JSON.stringify(audits, null, 2));
    return;
  }

  const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n${c.bold}${c.cyan}═══════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}${c.cyan}  opencode System Health Report${c.reset}`);
  console.log(`${c.dim}  ${now}${c.reset}`);
  console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════${c.reset}`);

  let totalScore = 0;
  let maxScore = 0;
  const criticalSubsystems = [];
  const dormantSubsystems = [];

  for (const [name, result] of Object.entries(audits)) {
    const score = renderSubsystem(name, result);
    totalScore += score;
    maxScore += 2;
    if (result.status === 'CRITICAL') criticalSubsystems.push(name);
    if (result.status === 'DORMANT') dormantSubsystems.push(name);
  }

  const healthPct = Math.round((totalScore / maxScore) * 100);
  const overallStatus = criticalSubsystems.length > 0
    ? 'CRITICAL'
    : healthPct >= 80 ? 'HEALTHY'
    : healthPct >= 50 ? 'WARNING'
    : 'CRITICAL';

  console.log(`\n${c.bold}${c.cyan}───────────────────────────────────────────────────${c.reset}`);
  console.log(`${c.bold}  Overall Health: ${STATUS[overallStatus]}  (${healthPct}% — ${totalScore}/${maxScore} points)${c.reset}`);

  if (criticalSubsystems.length > 0) {
    console.log(`  ${c.red}${c.bold}CRITICAL:${c.reset} ${criticalSubsystems.join(', ')}`);
  }
  if (dormantSubsystems.length > 0) {
    console.log(`  ${c.magenta}${c.bold}DORMANT:${c.reset}  ${dormantSubsystems.join(', ')}`);
  }

  // Actionable top priorities
  const allIssues = Object.entries(audits)
    .flatMap(([name, r]) => (r.issues || []).map(issue => ({ name, issue, status: r.status })))
    .sort((a, b) => {
      const priority = { CRITICAL: 0, DORMANT: 1, WARNING: 2, UNKNOWN: 3, HEALTHY: 4 };
      return (priority[a.status] ?? 4) - (priority[b.status] ?? 4);
    });

  if (allIssues.length > 0) {
    console.log(`\n${c.bold}  Top Priorities:${c.reset}`);
    for (const { name, issue } of allIssues.slice(0, 6)) {
      console.log(`  ${c.dim}[${name}]${c.reset} ${issue}`);
    }
  }

  console.log(`\n${c.dim}  Run with --verbose for full metrics. --json for machine-readable output.${c.reset}`);
  console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════${c.reset}\n`);
}

main().catch(err => {
  console.error('system-health.mjs error:', err.message);
  process.exit(1);
});
