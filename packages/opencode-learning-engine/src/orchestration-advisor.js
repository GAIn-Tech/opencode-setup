/**
 * OrchestrationAdvisor — Uses learned patterns to advise on task routing and execution.
 *
 * Core principle: Anti-pattern warnings are STRONG (blockers), positive suggestions are SOFT (hints).
 * This asymmetry is intentional — avoiding known failures is more valuable than repeating successes.
 *
 * Feeds into oh-my-opencode agent selection.
 */

const fs = require('fs');
const path = require('path');
const { AntiPatternCatalog } = require('./anti-patterns');
const { PositivePatternTracker } = require('./positive-patterns');

// Wire in tool-usage tracker for tool appropriateness insights
let ToolUsageTracker;
try {
  ToolUsageTracker = require('./tool-usage-tracker');
} catch (e) {
  // Tool usage tracker optional - advisor works without it
  ToolUsageTracker = null;
}

// Graceful fallback chain: scoped package → relative path → inline stubs
let contextUtils;
try {
  contextUtils = require('opencode-shared-orchestration/src/context-utils');
} catch {
  try {
    contextUtils = require('../../opencode-shared-orchestration/src/context-utils');
  } catch {
    console.warn('[OrchestrationAdvisor] opencode-shared-orchestration not found — using inline stubs.');
    contextUtils = {
      createOrchestrationId: (prefix = 'orch') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      getQuotaSignal: (ctx) => ({
        percent_used: ctx?.quota_signal?.percent_used ?? 0,
        fallback_applied: ctx?.quota_signal?.fallback_applied ?? false,
      }),
    };
  }
}
const { createOrchestrationId, getQuotaSignal } = contextUtils;

// Agent routing knowledge
const AGENT_CAPABILITIES = {
  explore: {
    strengths: ['code_navigation', 'codebase_understanding', 'search'],
    task_types: ['explore', 'understand', 'search', 'find'],
  },
  librarian: {
    strengths: ['documentation', 'knowledge_retrieval', 'context'],
    task_types: ['document', 'explain', 'lookup'],
  },
  oracle: {
    strengths: ['analysis', 'architecture', 'design_review'],
    task_types: ['review', 'analyze', 'design', 'plan'],
  },
  hephaestus: {
    strengths: ['building', 'implementation', 'coding'],
    task_types: ['build', 'implement', 'create', 'feature'],
  },
  metis: {
    strengths: ['planning', 'strategy', 'decomposition'],
    task_types: ['plan', 'decompose', 'strategy', 'complex'],
  },
  momus: {
    strengths: ['testing', 'validation', 'quality'],
    task_types: ['test', 'validate', 'verify', 'quality'],
  },
};

// Fallback skill affinity map (used if registry load fails)
const SKILL_AFFINITY_FALLBACK = {
  debug: ['systematic-debugging', 'test-driven-development'],
  refactor: ['using-git-worktrees', 'verification-before-completion'],
  feature: ['brainstorming', 'writing-plans', 'executing-plans'],
  fix: ['systematic-debugging'],
  test: ['test-driven-development', 'verification-before-completion'],
  git: ['git-master'],
  browser: ['agent-browser', 'dev-browser'],
  ui: ['frontend-ui-ux', 'dev-browser'],
  deploy: ['verification-before-completion'],
  plan: ['writing-plans', 'brainstorming'],
  complex: ['dispatching-parallel-agents', 'subagent-driven-development'],
};

// Skill affinity map — built from registry at construction time
let SKILL_AFFINITY = SKILL_AFFINITY_FALLBACK;

/**
 * Build skill affinity map from registry.json
 * Maps keywords (category + triggers) to skill names
 * Merges registry-based affinities with fallback hardcoded map
 * @param {string} registryPath - Path to registry.json
 * @returns {Object} {[keyword]: [skillName, ...]}
 */
function _buildSkillAffinity(registryPath) {
  try {
    const registryContent = fs.readFileSync(registryPath, 'utf8');
    const registry = JSON.parse(registryContent);
    
    // Start with fallback to preserve hardcoded categories
    const affinityMap = { ...SKILL_AFFINITY_FALLBACK };
    
    // Iterate over each skill in the registry
    if (registry.skills && typeof registry.skills === 'object') {
      for (const [skillName, skillData] of Object.entries(registry.skills)) {
        // Add skill under its category
        if (skillData.category) {
          const category = skillData.category.toLowerCase();
          if (!affinityMap[category]) {
            affinityMap[category] = [];
          }
          if (!affinityMap[category].includes(skillName)) {
            affinityMap[category].push(skillName);
          }
        }
        
        // Add skill under each of its triggers
        if (Array.isArray(skillData.triggers)) {
          for (const trigger of skillData.triggers) {
            const triggerKey = trigger.toLowerCase();
            if (!affinityMap[triggerKey]) {
              affinityMap[triggerKey] = [];
            }
            if (!affinityMap[triggerKey].includes(skillName)) {
              affinityMap[triggerKey].push(skillName);
            }
          }
        }
      }
    }
    
    return affinityMap;
  } catch (error) {
    // Fail-open: return fallback on any error (file not found, parse error, etc.)
    return SKILL_AFFINITY_FALLBACK;
  }
}

class OrchestrationAdvisor {
  constructor(antiPatternCatalog, positivePatternTracker, hooks = {}) {
    this.antiPatterns = antiPatternCatalog || new AntiPatternCatalog();
    this.positivePatterns = positivePatternTracker || new PositivePatternTracker();
    this.hooks = hooks;
    this.outcomeLog = []; // Track advice → outcome for learning
    
    // Load skill affinity from registry at construction time
    // Resolve registry path: from src/ → packages/opencode-learning-engine/ → packages/ → root
    const registryPath = path.resolve(__dirname, '../../../opencode-config/skills/registry.json');
    this.skillAffinity = _buildSkillAffinity(registryPath);
  }

  /**
   * Get orchestration advice for a task.
   *
   * @param {Object} taskContext
   * @param {string} taskContext.task_type - debug, refactor, feature, fix, test, etc.
   * @param {string} [taskContext.description] - Natural language task description
   * @param {string[]} [taskContext.files] - Files likely to be touched
   * @param {string} [taskContext.error_type] - If fixing an error
   * @param {number} [taskContext.attempt_number] - Which attempt
   * @param {string} [taskContext.tool] - Tool being considered
   * @param {string} [taskContext.action] - Action being considered
   * @param {string} [taskContext.complexity] - trivial, simple, moderate, complex, extreme
   * @param {Object} [taskContext.quota_signal] - Current provider quota status
   * @returns {{
   *   warnings: Object[],   // STRONG — anti-pattern matches
   *   suggestions: Object[], // SOFT — positive pattern recommendations
   *   routing: { agent: string, skills: string[], confidence: number },
   *   risk_score: number,
   *   advice_id: string,
   *   quota_risk: number,    // Additional signal for economic resilience
   *   should_pause: boolean,
   * }}
   */
  advise(taskContext = {}) {
    const adviceId = createOrchestrationId('adv');

    // === STRONG: Anti-pattern warnings ===
    const antiCheck = this.antiPatterns.shouldWarn(taskContext);
    const warnings = antiCheck.warnings.map((w) => ({
      ...w,
      strength: 'STRONG',
      action: 'BLOCK_OR_REVIEW', // Agent should pause and reconsider
    }));

    // === Quota awareness: Economic risk ===
    const quotaRisk = this._computeQuotaRisk(taskContext);
    if (quotaRisk > 0.5) {
      warnings.push({
        type: 'quota_exhaustion_risk',
        description: `High quota pressure detected (${Math.round(quotaRisk * 100)}%). Consider switching to a less-used provider.`,
        severity: quotaRisk > 0.9 ? 'critical' : 'high',
        strength: 'STRONG',
        action: 'BLOCK_OR_REVIEW'
      });
    }

    // === SOFT: Positive pattern suggestions ===
    const recommendations = this.positivePatterns.getRecommendations(taskContext);
    const suggestions = recommendations.map((r) => ({
      type: r.type,
      description: r.description,
      success_rate: r.success_rate,
      relevance: r.relevance_score,
      strength: 'SOFT',
      action: 'CONSIDER', // Agent can freely ignore
    }));

    // === Routing: Agent + Skill recommendation ===
    const routing = this._computeRouting(taskContext, warnings);

    // Log for learning
    this.outcomeLog.push({
      advice_id: adviceId,
      task_context: taskContext,
      warnings_count: warnings.length,
      suggestions_count: suggestions.length,
      routing,
      quota_risk: quotaRisk,
      timestamp: new Date().toISOString(),
      outcome: null, // Filled in by learnFromOutcome
    });

    // Cap log at 500 entries
    if (this.outcomeLog.length > 500) {
      this.outcomeLog = this.outcomeLog.slice(-500);
    }

    const advice = {
      advice_id: adviceId,
      warnings,
      suggestions,
      routing,
      risk_score: Math.max(antiCheck.risk_score, quotaRisk * 100),
      riskScore: Math.max(antiCheck.risk_score, quotaRisk * 100), // camelCase for router compatibility
      quota_risk: quotaRisk,
      should_pause: antiCheck.risk_score > 15 || quotaRisk > 0.85, // High risk → agent should pause
    };

    // Allow hooks to augment advice before returning
    if (this.hooks && typeof this.hooks.onBeforeAdviceReturn === 'function') {
      return this.hooks.onBeforeAdviceReturn(taskContext, advice);
    }

    return advice;
  }

  /**
   * Learn from the outcome of a previous advice.
   * Updates anti-patterns (on failure) and positive patterns (on success).
   *
   * @param {string} adviceId - The advice_id from a previous advise() call
   * @param {Object} outcome
   * @param {boolean} outcome.success
   * @param {string} [outcome.description]
   * @param {number} [outcome.tokens_used]
   * @param {number} [outcome.time_taken_ms]
   * @param {string} [outcome.failure_reason]
   * @param {Object} [outcome.quota_signal]
   */
  learnFromOutcome(adviceId, outcome = {}) {
    const entry = this.outcomeLog.find((e) => e.advice_id === adviceId);
    if (!entry) return { learned: false, reason: 'advice_id not found' };

    entry.outcome = outcome;

    const taskContext = {
      ...entry.task_context,
      quota_signal: outcome.quota_signal || entry.task_context.quota_signal
    };

    if (outcome.success) {
      // Record positive pattern
      this.positivePatterns.addPositivePattern({
        type: this._inferPositiveType(taskContext),
        description:
          outcome.description ||
          `Successful ${taskContext.task_type || 'task'} execution`,
        success_rate: 1.0,
        context: {
          ...taskContext,
          tokens_used: outcome.tokens_used,
          time_taken_ms: outcome.time_taken_ms,
          agent: entry.routing?.agent,
          quota_risk: entry.quota_risk,
        },
      });

      return { learned: true, type: 'positive_pattern' };
    } else {
      // Record anti-pattern (HEAVILY weighted)
      const severity = this._inferSeverity(outcome, entry);
      this.antiPatterns.addAntiPattern({
        type: this._inferAntiPatternType(outcome, taskContext),
        description:
          outcome.failure_reason ||
          outcome.description ||
          `Failed ${taskContext.task_type || 'task'}: ${outcome.failure_reason || 'unknown'}`,
        severity,
        context: {
          ...taskContext,
          tokens_used: outcome.tokens_used,
          time_taken_ms: outcome.time_taken_ms,
          agent: entry.routing?.agent,
          warnings_ignored: entry.warnings_count > 0,
          quota_exhaustion: (taskContext.quota_signal?.percent_used >= 1.0),
        },
      });

      return { learned: true, type: 'anti_pattern', severity };
    }
  }

  /**
   * Get a summary insights report.
   * @returns {Object}
   */
  getInsights() {
    const antiStats = this.antiPatterns.getStats();
    const posStats = this.positivePatterns.getStats();

    const outcomes = this.outcomeLog.filter((e) => e.outcome !== null);
    const successes = outcomes.filter((e) => e.outcome?.success);
    const failures = outcomes.filter((e) => !e.outcome?.success);

    // Warnings that were ignored and led to failure
    const ignoredWarningsFailures = failures.filter(
      (e) => e.warnings_count > 0
    );

    // Calculate effectiveness of warnings
    const warningAccuracy =
      outcomes.length > 0
        ? ignoredWarningsFailures.length /
          Math.max(failures.length, 1)
        : 0;

    return {
      summary: {
        total_anti_patterns: antiStats.total,
        total_positive_patterns: posStats.total,
        anti_pattern_weight: antiStats.total_weight,
        avg_anti_pattern_weight: antiStats.avg_weight,
        avg_positive_success_rate: posStats.avg_success_rate,
      },
      anti_pattern_hotspots: antiStats.most_frequent,
      top_strategies: posStats.top_strategies,
      outcome_tracking: {
        total_advised: this.outcomeLog.length,
        outcomes_recorded: outcomes.length,
        success_rate: outcomes.length
          ? Math.round((successes.length / outcomes.length) * 1000) / 1000
          : 0,
        warning_accuracy: Math.round(warningAccuracy * 1000) / 1000,
        warnings_that_predicted_failure: ignoredWarningsFailures.length,
      },
      recommendations: this._generateMetaRecommendations(antiStats, posStats),
    };
  }

  // ===== PRIVATE =====

  _computeQuotaRisk(taskContext) {
    const signal = getQuotaSignal(taskContext);
    const percentUsed = signal.percent_used;
    const fallbackApplied = signal.fallback_applied;
    
    // Fallback applied is a massive risk multiplier
    if (fallbackApplied) return Math.max(percentUsed, 0.85);
    
    return percentUsed;
  }

  _computeRouting(taskContext, warnings) {
    const taskType = this._normalizeTextValue(taskContext.task_type || 'general');
    const description = this._normalizeTextValue(taskContext.description);
    const complexity = this._normalizeTextValue(taskContext.complexity || 'moderate');

    // Find best agent
    let bestAgent = null;
    let bestScore = 0;

    for (const [agent, caps] of Object.entries(AGENT_CAPABILITIES)) {
      let score = 0;
      if (caps.task_types.some((type) => this._normalizeTextValue(type) === taskType)) score += 5;
      if (caps.strengths.some((s) => description.includes(this._normalizeTextValue(s)))) {
        score += 2;
      }
      // Penalize if anti-patterns suggest this agent failed before
      const agentWarnings = warnings.filter(
        (w) => w.context?.agent === agent
      );
      score -= agentWarnings.length * 2;

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    // Default fallback
    if (!bestAgent) {
      bestAgent = complexity === 'complex' || complexity === 'extreme'
        ? 'metis'
        : 'hephaestus';
    }

    // Find relevant skills — scored per skill affinity category for telemetry
    const affinityScores = {};
    const skills = [];
    for (const [type, skillList] of Object.entries(this.skillAffinity)) {
      const normalizedType = this._normalizeTextValue(type);
      let score = 0;
      if (taskType.includes(normalizedType)) score += 2;
      if (description.includes(normalizedType)) score += 1;
      if (score > 0) {
        affinityScores[type] = { score, skills: skillList };
        skills.push(...skillList);
      }
    }

    // Always suggest verification for high-risk
    if (warnings.length > 0) {
      skills.push('verification-before-completion');
    }
    if (warnings.some((w) => w.type === 'shotgun_debug')) {
      skills.push('systematic-debugging');
    }
    
    // Economic resilience: suggest quota-aware-routing if risk is high
    const quotaRisk = this._computeQuotaRisk(taskContext);
    if (quotaRisk > 0.4) {
      skills.push('quota-aware-routing');
    }

    // Deduplicate
    const uniqueSkills = [...new Set(skills)];

    // Confidence based on pattern data and warnings
    let confidence = 0.5; // Base
    confidence += Math.min(this.positivePatterns.patterns.length * 0.02, 0.3); // More data = more confident
    confidence -= Math.min(warnings.length * 0.1, 0.3); // Warnings reduce confidence
    
    // Factor in quota risk to confidence
    if (quotaRisk > 0.7) {
      confidence -= 0.15;
    }
    
    confidence = Math.max(0.1, Math.min(0.95, confidence));

    // --- Routing telemetry (additive) ---
    const sortedAffinities = Object.entries(affinityScores)
      .sort(([, a], [, b]) => b.score - a.score);
    const topAffinity = sortedAffinities[0] || null;
    const secondAffinity = sortedAffinities[1] || null;

    // Runner-up: first skill from second-best SKILL_AFFINITY category
    const runner_up_skill = secondAffinity
      ? (secondAffinity[1].skills[0] || null)
      : null;

    // Ambiguity margin: gap between top and runner-up affinity scores
    const ambiguity_margin = (topAffinity && secondAffinity)
      ? topAffinity[1].score - secondAffinity[1].score
      : null;

    // Skill switch count: times top skill changed for same task_type in outcomeLog
    const priorEntries = this.outcomeLog.filter(
      (e) => this._normalizeTextValue(e.task_context?.task_type) === taskType,
    );
    let skill_switch_count = 0;
    for (let i = 1; i < priorEntries.length; i++) {
      const prev = priorEntries[i - 1].routing?.skills?.[0];
      const curr = priorEntries[i].routing?.skills?.[0];
      if (prev && curr && prev !== curr) {
        skill_switch_count++;
      }
    }
    // Compare current recommendation against most recent prior entry
    const currentTopSkill = uniqueSkills[0] || null;
    if (priorEntries.length > 0) {
      const lastTopSkill = priorEntries[priorEntries.length - 1].routing?.skills?.[0];
      if (lastTopSkill && currentTopSkill && lastTopSkill !== currentTopSkill) {
        skill_switch_count++;
      }
    }

    return {
      agent: bestAgent,
      skills: uniqueSkills.slice(0, 5), // Max 5 skills
      confidence: Math.round(confidence * 100) / 100,
      runner_up_skill,
      ambiguity_margin,
      skill_switch_count,
    };
  }

  _normalizeTextValue(value) {
    if (typeof value !== 'string') {
      return '';
    }

    return value.trim().toLowerCase();
  }

  _inferPositiveType(taskContext) {
    const type = taskContext.task_type || '';
    if (['debug', 'fix', 'bugfix'].includes(type)) return 'efficient_debug';
    if (['refactor', 'cleanup'].includes(type)) return 'clean_refactor';
    if (['complex', 'multi-step'].includes(type)) return 'good_delegation';
    if (['quick', 'trivial'].includes(type)) return 'fast_resolution';
    return 'creative_solution';
  }

  _inferAntiPatternType(outcome, taskContext) {
    const reason = (outcome.failure_reason || '').toLowerCase();
    if (reason.includes('debug') || reason.includes('fix')) return 'failed_debug';
    if (reason.includes('tool') || reason.includes('wrong')) return 'wrong_tool';
    if (reason.includes('type') || reason.includes('suppress')) return 'type_suppression';
    if (reason.includes('build') || reason.includes('broken')) return 'broken_state';
    if (taskContext.attempt_number && taskContext.attempt_number >= 3) return 'shotgun_debug';
    if (outcome.tokens_used && outcome.tokens_used > 50000) return 'inefficient_solution';
    return 'failed_debug';
  }

  _inferSeverity(outcome, entry) {
    // Ignored warnings → higher severity
    if (entry.warnings_count > 0) return 'critical';
    if (outcome.tokens_used && outcome.tokens_used > 100000) return 'high';
    if (entry.task_context.attempt_number >= 3) return 'high';
    return 'medium';
  }

  _generateMetaRecommendations(antiStats, posStats) {
    const recs = [];

    if (antiStats.total > posStats.total * 2) {
      recs.push(
        'Anti-patterns significantly outnumber positive patterns. Focus on establishing reliable workflows before tackling complex tasks.'
      );
    }

    if (antiStats.by_type?.shotgun_debug > 3) {
      recs.push(
        'Shotgun debugging is a recurring issue. ALWAYS use systematic-debugging skill. Read errors fully before editing.'
      );
    }

    if (antiStats.by_type?.type_suppression > 2) {
      recs.push(
        'Type suppression is recurring. Enable strict TypeScript/linting and fix root causes. Never use @ts-ignore or `any`.'
      );
    }

    if (antiStats.by_type?.broken_state > 2) {
      recs.push(
        'Broken state is recurring. Run build/test verification BEFORE and AFTER every change set.'
      );
    }

    if (posStats.by_type?.efficient_debug > 3) {
      recs.push(
        'Efficient single-attempt debugging is a strength. Continue using read → edit → verify workflow.'
      );
    }

    if (recs.length === 0) {
      recs.push('Insufficient data for meta-recommendations. Continue ingesting sessions.');
    }

    return recs;
  }
}

module.exports = { OrchestrationAdvisor, AGENT_CAPABILITIES, SKILL_AFFINITY: SKILL_AFFINITY_FALLBACK };
