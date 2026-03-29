#!/usr/bin/env node
/**
 * ingest-sessions.mjs
 *
 * Runs LearningEngine.ingestAllSessions() to analyze historical opencode sessions
 * at ~/.opencode/messages/ and persist extracted patterns.
 *
 * Also wires SkillRLManager.learnFromOutcome() so historical session patterns
 * feed into skill success-rate tracking and evolution.
 *
 * Run manually:  bun run scripts/ingest-sessions.mjs
 * Or add to bun run setup in package.json for automatic startup ingestion.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'fs';
import path from 'path';
import { resolveUserDataPath } from './resolve-root.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const DELEGATION_LOG_FILE = resolveUserDataPath('delegation-log.json');
const WINDOWS_RENAME_RETRIES = 3;
const WINDOWS_RENAME_RETRY_DELAY_MS = 10;

// Resolve packages from this repo root
const enginePath = path.join(__dirname, '..', 'packages', 'opencode-learning-engine', 'src', 'index.js');
const skillRLPath = path.join(__dirname, '..', 'packages', 'opencode-skill-rl-manager', 'src', 'index.js');
const advisorPath = path.join(__dirname, '..', 'packages', 'opencode-learning-engine', 'src', 'orchestration-advisor.js');

const { LearningEngine } = require(enginePath);
const { SkillRLManager } = require(skillRLPath);

function sleepSync(delayMs) {
  if (!Number.isFinite(delayMs) || delayMs <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.floor(delayMs));
}

function renameWithWindowsRetrySync(tmpPath, filePath) {
  for (let attempt = 0; attempt < WINDOWS_RENAME_RETRIES; attempt++) {
    try {
      renameSync(tmpPath, filePath);
      return;
    } catch (err) {
      const isLastAttempt = attempt === WINDOWS_RENAME_RETRIES - 1;
      if (err?.code === 'EPERM' && !isLastAttempt) {
        sleepSync(WINDOWS_RENAME_RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
}

function writeJsonAtomicSync(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  const tmpPath = `${filePath}.tmp`;
  let tempWritten = false;

  try {
    writeFileSync(tmpPath, json, 'utf8');
    tempWritten = true;

    try {
      renameWithWindowsRetrySync(tmpPath, filePath);
    } catch (err) {
      if (err?.code === 'EPERM') {
        writeFileSync(filePath, json, 'utf8');
      } else {
        throw err;
      }
    }
  } catch {
    if (tempWritten) {
      writeFileSync(filePath, json, 'utf8');
    }
  } finally {
    try { unlinkSync(tmpPath); } catch { /* best-effort */ }
  }
}

// Map pattern types to implied skill names for SkillRL feedback
const PATTERN_SKILL_MAP = {
  // Positive patterns → skill that succeeded
  efficient_debug:       'systematic-debugging',
  fast_resolution:       'systematic-debugging',
  good_delegation:       'dispatching-parallel-agents',
  clean_refactor:        'git-master',
  creative_solution:     'brainstorming',
  // Anti-patterns → skill that should have been used / failed
  failed_debug:          'systematic-debugging',
  shotgun_debug:         'systematic-debugging',
  broken_state:          'verification-before-completion',
  type_suppression:      'test-driven-development',
  repeated_mistake:      'systematic-debugging',
  wrong_tool:            'task-orchestrator',
  inefficient_solution:  'brainstorming',
  quota_exhaustion_risk: 'budget-aware-router',
};

async function main() {
  console.log('[ingest-sessions] Starting session ingestion...');

  // --- Learning Engine ---
  let engine;
  try {
    engine = new LearningEngine({ autoLoad: true, autoSave: true });
  } catch (err) {
    console.error('[ingest-sessions] Failed to initialize LearningEngine:', err.message);
    process.exit(1);
  }

  const before = {
    anti: engine.antiPatterns?.patterns?.length ?? 0,
    positive: engine.positivePatterns?.patterns?.length ?? 0,
  };

  // Get per-session data directly for SkillRL wiring (ingestAllSessions only returns aggregates)
  let fullResult;
  try {
    fullResult = engine.extractor.extractFromAllSessions();
  } catch (err) {
    console.warn('[ingest-sessions] extractFromAllSessions() failed, skipping SkillRL wiring:', err.message);
    fullResult = { sessions: [], cross_session_anti_patterns: [] };
  }

  // Persist patterns via the standard ingestAllSessions path
  let result;
  try {
    result = engine.ingestAllSessions();
  } catch (err) {
    console.error('[ingest-sessions] ingestAllSessions() failed:', err.message);
    process.exit(1);
  }

  const after = {
    anti: engine.antiPatterns?.patterns?.length ?? 0,
    positive: engine.positivePatterns?.patterns?.length ?? 0,
  };

  console.log('[ingest-sessions] Learning engine done.');
  console.log(`  Sessions analyzed : ${result.sessions_analyzed}`);
  console.log(`  Anti-patterns     : ${result.total_anti} found, ${after.anti - before.anti} new (total: ${after.anti})`);
  console.log(`  Positive patterns : ${result.total_positive} found, ${after.positive - before.positive} new (total: ${after.positive})`);
  console.log(`  Cross-session     : ${result.cross_session} repeated-mistake patterns`);

  if (result.sessions_analyzed === 0) {
    console.log('[ingest-sessions] Warning: no sessions found at ~/.opencode/messages/ — nothing to ingest.');
    return;
  }

  // --- SkillRL Wiring ---
  let skillRL;
  try {
    skillRL = new SkillRLManager({ autoLoad: true });
  } catch (err) {
    console.warn('[ingest-sessions] SkillRLManager unavailable, skipping skill-RL wiring:', err.message);
    return;
  }

  let skillOutcomes = 0;
  const sessions = fullResult?.sessions || [];

  for (const session of sessions) {
    // Positive patterns → success signal for implied skill
    for (const pp of session.positive_patterns || []) {
      const skillName = PATTERN_SKILL_MAP[pp.type];
      if (!skillName) continue;
      try {
        skillRL.learnFromOutcome({
          task_type: pp.context?.task_type || pp.type,
          skill_used: skillName,
          success: true,
          tokens_used: pp.context?.tokens_used,
        });
        skillOutcomes++;
      } catch (_) { /* non-fatal */ }
    }

    // NOTE: Anti-patterns are intentionally NOT mapped to failure signals.
    // An anti-pattern like 'inefficient_solution' means the skill was absent from the session,
    // not that the skill was used and failed. Penalizing a skill for patterns where it wasn't
    // invoked produces incorrect degradation (e.g. brainstorming → 0.023 success_rate).
    // Failure signals come only from actual delegation outcomes in processDelegationLog().
  }

  // NOTE: Cross-session repeated-mistake patterns are also excluded from skill penalties
  // for the same reason: they indicate missed skill usage, not skill failure.

  // Persist SkillRL state
  try {
    if (typeof skillRL.save === 'function') {
      skillRL.save();
    } else if (typeof skillRL._persist === 'function') {
      skillRL._persist();
    }
    console.log(`  SkillRL outcomes  : ${skillOutcomes} signals fed into skill bank`);
  } catch (err) {
    console.warn('[ingest-sessions] SkillRL save failed (non-fatal):', err.message);
    console.log(`  SkillRL outcomes  : ${skillOutcomes} signals processed (save failed)`);
  }

  // --- OrchestrationAdvisor + SkillRL: Process Delegation Log ---
  console.log('\n[ingest-sessions] Processing delegation log...');
  await processDelegationLog(skillRL);

  // --- Codebase Memory Enrichment ---
  // Wire codebase-memory error enrichment: enrich anti-pattern descriptions with symbol context
  try {
    const { CodebaseMemory } = require(path.join(__dirname, '..', 'packages', 'opencode-codebase-memory', 'src', 'index.js'));
    const mem = new CodebaseMemory();
    const repos = mem.listRepos();
    if (repos.length > 0 && fullResult?.sessions) {
      let enriched = 0;
      for (const session of fullResult.sessions) {
        for (const ap of (session.anti_patterns || [])) {
          if (ap.description && ap.description.length > 10) {
            const context = mem.enrichErrorContext(ap.description);
            if (context.length > 0) {
              ap.codebase_context = context;
              enriched++;
            }
          }
        }
      }
      if (enriched > 0) console.log(`[codebase-memory] Enriched ${enriched} anti-patterns with symbol context`);
    }
  } catch (_) {
    // Non-fatal — codebase-memory may not have repos indexed yet
    // Users can run: opencode-codebase analyze . --name opencode-setup
  }
}

/**
 * Process unprocessed entries in ~/.opencode/delegation-log.json through
 * OrchestrationAdvisor (outcome loop) and SkillRL (skill usage signals).
 */
async function processDelegationLog(skillRL) {
  if (!existsSync(DELEGATION_LOG_FILE)) {
    console.log('  Delegation log    : not found (no task delegations captured yet)');
    return;
  }

  let logData;
  try {
    logData = JSON.parse(readFileSync(DELEGATION_LOG_FILE, 'utf-8'));
  } catch (err) {
    console.warn('  Delegation log    : failed to parse:', err.message);
    return;
  }

  const events = Array.isArray(logData.events) ? logData.events : [];
  const unprocessed = events.filter(e => !e.processed);

  if (unprocessed.length === 0) {
    console.log(`  Delegation log    : 0 new events (${events.length} total)`);
    return;
  }

  // Load OrchestrationAdvisor
  let advisor;
  try {
    const { OrchestrationAdvisor } = require(advisorPath);
    advisor = new OrchestrationAdvisor();
  } catch (err) {
    console.warn('  OrchestrationAdvisor unavailable:', err.message);
    advisor = null;
  }

  let advisorOutcomes = 0;
  let skillRLOutcomes = 0;

  for (const event of unprocessed) {
    // Skip RL learning for background tasks whose outcome is still unknown (success === null).
    // These were spawned as fire-and-forget and no result was captured at hook time.
    const outcomeKnown = event.success !== null && event.success !== undefined;

    // OrchestrationAdvisor: advise → learnFromOutcome
    if (advisor) {
      try {
        const advice = advisor.advise({
          task_type: event.task_type || 'general',
          category: event.category,
          description: event.description,
          skills: event.load_skills,
        });
        if (advice?.advice_id && outcomeKnown) {
          advisor.learnFromOutcome(advice.advice_id, {
            success: event.success !== false,
            error: event.success === false ? 'delegation_failed' : undefined,
          });
          advisorOutcomes++;
        }
      } catch (_) { /* non-fatal */ }
    }

    // SkillRL: record usage + outcome per skill used in this delegation
    if (skillRL && Array.isArray(event.load_skills)) {
      for (const skill of event.load_skills) {
        try {
          // recordUsage() increments usage_count (fixes DORMANT state) — always record usage
          if (skillRL.skillBank && typeof skillRL.skillBank.recordUsage === 'function') {
            skillRL.skillBank.recordUsage(skill, event.task_type || null);
          }
          // learnFromOutcome() updates success_rate — only when outcome is known
          if (outcomeKnown) {
            skillRL.learnFromOutcome({
              task_type: event.task_type || 'general',
              skill_used: skill,
              success: event.success !== false,
              failure_reason: event.success === false ? 'delegation_failed' : undefined,
            });
            skillRLOutcomes++;
          }
        } catch (_) { /* non-fatal */ }
      }
    }

    // Mark as processed
    event.processed = true;
    event.processed_at = new Date().toISOString();
  }

  // Persist SkillRL after delegation signals
  if (skillRL && skillRLOutcomes > 0) {
    try {
      if (typeof skillRL.save === 'function') skillRL.save();
      else if (typeof skillRL._persist === 'function') skillRL._persist();
    } catch (_) { /* non-fatal */ }
  }

  // Write back updated delegation log (with processed flags)
  try {
    writeJsonAtomicSync(DELEGATION_LOG_FILE, { events });
  } catch (err) {
    console.warn('  Failed to update delegation log:', err.message);
  }

  console.log(`  Delegation log    : ${unprocessed.length} new events processed`);
  if (advisor) console.log(`  Advisor outcomes  : ${advisorOutcomes} advice/outcome pairs recorded`);
  console.log(`  Skill outcomes    : ${skillRLOutcomes} skill signals from delegations`);
}

main();
