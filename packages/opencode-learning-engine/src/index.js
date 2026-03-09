/**
 * opencode-learning-engine
 *
 * Learns from opencode sessions to improve orchestration decisions.
 * HEAVILY weighted toward anti-pattern detection and avoidance.
 *
 * Architecture:
 *   AntiPatternCatalog    — Tracks failures (STRONG warnings)
 *   PositivePatternTracker — Tracks successes (SOFT suggestions)
 *   PatternExtractor       — Parses session logs to find patterns
 *   OrchestrationAdvisor   — Combines patterns into actionable advice
 *   LearningEngine         — Unified API wrapping all components
 */

const { AntiPatternCatalog, VALID_TYPES: ANTI_PATTERN_TYPES, SEVERITY_WEIGHTS } = require('./anti-patterns');
const { PositivePatternTracker, VALID_TYPES: POSITIVE_PATTERN_TYPES } = require('./positive-patterns');
const { PatternExtractor } = require('./pattern-extractor');
const { OrchestrationAdvisor, AGENT_CAPABILITIES, SKILL_AFFINITY } = require('./orchestration-advisor');
const { MetaAwarenessTracker } = require('./meta-awareness-tracker');
const { MetaKBReader } = require('./meta-kb-reader');
const EventEmitter = require('events');

class LearningEngine extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.autoLoad=true] - Load persisted data on construction
   * @param {boolean} [options.autoSave=true] - Auto-save after mutations
   */
  constructor(options = {}) {
    super();
    // T19 (Wave 11): Startup time instrumentation
    const _startupT0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const { autoLoad = true, autoSave = true } = options;

    this.antiPatterns = new AntiPatternCatalog();
    this.positivePatterns = new PositivePatternTracker();
    this.extractor = new PatternExtractor();
    this.advisor = new OrchestrationAdvisor(this.antiPatterns, this.positivePatterns);
    this.metaAwarenessTracker = options.metaAwarenessTracker || new MetaAwarenessTracker();

    this.autoSave = autoSave;
    this.sessionLog = []; // Track which sessions have been ingested
    this.hooks = {};

    // T6 (Wave 11): Advice cache — keyed by taskType+complexity, 5-min TTL, 500-entry max
    this._adviceCache = new Map();
    this._adviceCacheTTL = 300000; // 5 minutes
    this._adviceCacheMax = 500;

    // Meta-KB reader: loads the synthesized meta-knowledge index (fail-open)
    this.metaKB = new MetaKBReader(options.metaKBPath);
    this.metaKB.load(); // Non-blocking, returns false if unavailable

    // Register built-in adviceGenerated hook: adjust routing based on meta-KB evidence
    this.registerHook('adviceGenerated', ({ task_context, advice }) => {
      if (!this.metaKB.index || !advice?.routing) return;
      const metaResult = this.metaKB.query(task_context);
      const warningCount = metaResult.warnings.length;
      const evidenceCount = metaResult.suggestions.length;

      if (warningCount > 0) {
        // Reduce confidence by 10% per warning, floor at 0.1
        const factor = Math.pow(0.9, Math.min(warningCount, 5));
        advice.routing.confidence = Math.max(
          0.1,
          Math.round(advice.routing.confidence * factor * 100) / 100
        );
        advice.routing.meta_kb_warnings = warningCount;
      }

      if (evidenceCount > 0) {
        advice.routing.meta_kb_evidence = evidenceCount;
      }
    });

    if (options.hooks && typeof options.hooks === 'object') {
      for (const [hookName, handlers] of Object.entries(options.hooks)) {
        if (Array.isArray(handlers)) {
          for (const handler of handlers) {
            this.registerHook(hookName, handler);
          }
        } else {
          this.registerHook(hookName, handlers);
        }
      }
    }

    if (autoLoad) {
      this.load();
    }

    // T19 (Wave 11): Log startup duration
    const _startupMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - _startupT0;
    console.log(`[Startup] LearningEngine: ${_startupMs.toFixed(1)}ms`);
  }

  /**
   * Register extension hook handler.
   * @param {string} hookName
   * @param {(payload: any) => void} fn
   */
  registerHook(hookName, fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(`Hook "${hookName}" must be a function`);
    }
    if (!this.hooks[hookName]) {
      this.hooks[hookName] = [];
    }
    this.hooks[hookName].push(fn);
  }

  /**
   * Quality gates for learnings - prevents corrupted data from entering system
   */
  validateLearning(learning) {
    if (!learning || typeof learning !== 'object') {
      return { valid: false, reason: 'Learning must be an object' };
    }

    // Check required fields
    if (!learning.type || typeof learning.type !== 'string') {
      return { valid: false, reason: 'Learning must have a type' };
    }

    if (!learning.timestamp || isNaN(Date.parse(learning.timestamp))) {
      return { valid: false, reason: 'Learning must have valid timestamp' };
    }

    // Validate anti-pattern learnings
    if (learning.type === 'anti-pattern') {
      if (!learning.pattern || typeof learning.pattern !== 'string') {
        return { valid: false, reason: 'Anti-pattern must have pattern string' };
      }
      // Check severity against valid severity values, not pattern types
      const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
      if (!validSeverities.includes(learning.severity)) {
        return { valid: false, reason: `Invalid severity: ${learning.severity}` };
      }
    }

    // Validate positive pattern learnings
    if (learning.type === 'positive-pattern') {
      if (!learning.pattern || typeof learning.pattern !== 'string') {
        return { valid: false, reason: 'Positive pattern must have pattern string' };
      }
      if (!POSITIVE_PATTERN_TYPES.includes(learning.pattern_type)) {
        return { valid: false, reason: `Invalid pattern_type: ${learning.pattern_type}` };
      }
    }

    // Validate model learnings
    if (learning.type === 'model-performance') {
      if (!learning.model || typeof learning.model !== 'string') {
        return { valid: false, reason: 'Model performance must have model string' };
      }
      if (typeof learning.success_rate !== 'number' || learning.success_rate < 0 || learning.success_rate > 1) {
        return { valid: false, reason: 'success_rate must be number between 0 and 1' };
      }
    }

    return { valid: true };
  }

  /**
   * Calculate adaptive weight for a learning based on age
   * Uses exponential decay instead of hard cutoff
   * - < 7 days: full weight (1.0)
   * - 7-30 days: gradual decay (1.0 → 0.3)
   * - 30-90 days: reduced but not zero (0.3 → 0.1)
   * - > 90 days: minimal but retained (0.1)
   * 
   * HOWEVER: If learning.persistence === 'core', weight is ALWAYS 1.0
   * Core learnings represent fundamental truths that should never decay
   * (e.g., "Bun v1.3.x crashes", "always use atomic writes")
   */
  getAdaptiveWeight(learning) {
    // Core learnings never decay - they're fundamental truths
    if (learning.persistence === 'core') {
      return 1.0;
    }
    
    // Adaptive learnings decay over time
    const age = Date.now() - new Date(learning.timestamp).getTime();
    const days = age / (1000 * 60 * 60 * 24);

    if (days < 7) return 1.0;
    if (days < 30) return 1.0 - ((days - 7) / 23) * 0.7; // 1.0 → 0.3
    if (days < 90) return 0.3 - ((days - 30) / 60) * 0.2; // 0.3 → 0.1
    return 0.1; // Keep learnings indefinitely but with minimal weight
  }

  /**
   * Mark a learning as core/persistent (never decays)
   * Use for fundamental truths that should always guide decisions
   * Examples: "Bun v1.3.x crashes", "use atomic writes"
   */
  markAsCore(learningId) {
    const entry = this.antiPatterns.patterns.find(e => e.id === learningId);
    if (entry) {
      entry.persistence = 'core';
      entry.isCore = true;
      console.log(`[LearningEngine] Marked learning ${learningId} as CORE - will never decay`);
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Update a core learning with new evidence
   * Core learnings can be updated but stay as core
   */
  updateCoreLearning(learningId, newData) {
    const entry = this.antiPatterns.patterns.find(e => e.id === learningId);
    if (entry && entry.persistence === 'core') {
      // Keep it as core but update the data
      Object.assign(entry, newData, { 
        persistence: 'core',
        isCore: true,
        updatedAt: Date.now()
      });
      console.log(`[LearningEngine] Updated core learning ${learningId}`);
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Get all core learnings (never decay)
   */
  getCoreLearnings() {
    return this.antiPatterns.patterns.filter(e => e.persistence === 'core');
  }

  /**
   * Get all adaptive learnings (decay over time)
   */
  getAdaptiveLearnings() {
    return this.antiPatterns.patterns.filter(e => e.persistence !== 'core');
  }

  /**
   * Get staleness status without hard rejection
   * Returns { isStale, weight, status } for adaptive handling
   */
  getLearningStaleness(learning) {
    const age = Date.now() - new Date(learning.timestamp).getTime();
    const days = age / (1000 * 60 * 60 * 24);
    const weight = this.getAdaptiveWeight(learning);

    let status;
    if (days < 7) status = 'fresh';
    else if (days < 30) status = 'active';
    else if (days < 90) status = 'stale';
    else status = 'archival';

    return {
      isStale: days > 90, // Only truly "stale" after 90 days
      weight,
      status,
      days: Math.round(days)
    };
  }

  /**
   * Apply quality gates before accepting any learning
   */
  ingestWithValidation(learning) {
    const validation = this.validateLearning(learning);
    if (!validation.valid) {
      console.warn(`[LearningEngine] Rejected invalid learning: ${validation.reason}`);
      this.emit('learningRejected', { learning, reason: validation.reason });
      return false;
    }

    // Add adaptive weight based on age instead of rejecting old learnings
    learning.weight = this.getAdaptiveWeight(learning);
    const staleness = this.getLearningStaleness(learning);
    if (staleness.status === 'stale' || staleness.status === 'archival') {
      console.log(`[LearningEngine] Accepted ${staleness.status} learning (weight: ${learning.weight.toFixed(3)}, age: ${staleness.days} days)`);
    }

    return true;
  }

  /**
   * Get learning system health metrics
   */
  getHealthMetrics() {
    const core = this.getCoreLearnings();
    const adaptive = this.getAdaptiveLearnings();
    
    return {
      antiPatternCount: Array.isArray(this.antiPatterns?.patterns) ? this.antiPatterns.patterns.length : 0,
      positivePatternCount: Array.isArray(this.positivePatterns?.patterns) ? this.positivePatterns.patterns.length : 0,
      sessionCount: this.sessionLog?.length || 0,
      hooksCount: Object.keys(this.hooks).length,
      // New: Core vs Adaptive breakdown
      coreLearnings: core.length,
      adaptiveLearnings: adaptive.length,
      totalLearnings: this.catalog?.entries?.length || 0,
      lastLoad: this.lastLoad || null,
      lastSave: this.lastSave || null
    };
  }

  /**
   * Unregister extension hook handler.
   * @param {string} hookName
   * @param {(payload: any) => void} fn
   */
  unregisterHook(hookName, fn) {
    if (!this.hooks[hookName]) return;
    this.hooks[hookName] = this.hooks[hookName].filter((handler) => handler !== fn);
    if (this.hooks[hookName].length === 0) {
      delete this.hooks[hookName];
    }
  }

  /**
   * Emit EventEmitter event and registered hook callbacks.
   * @param {string} hookName
   * @param {unknown} payload
   */
  _emitHook(hookName, payload) {
    this.emit(hookName, payload);

    if (!this.hooks[hookName]) return;

    for (const fn of this.hooks[hookName]) {
      try {
        fn(payload);
      } catch (err) {
        this.emit('hook:error', { hook: hookName, payload, error: err });
      }
    }
  }

  // ===== UNIFIED EVENT INGESTION =====

  /**
   * Unified event ingestion API - single stable contract for all learning events.
   * This is the recommended API for external integrators (router, rotator, memory-graph).
   * 
   * @param {Object} event - Learning event
   * @param {string} event.type - Event type: 'anti-pattern', 'positive-pattern', 'outcome', 'tool-usage'
   * @param {Object} event.payload - Event-specific payload
   * @returns {Object} { success: boolean, reason?: string }
   */
  ingestEvent(event) {
    if (!event || typeof event !== 'object') {
      return { success: false, reason: 'Event must be an object' };
    }
    
    const { type, payload } = event;
    if (!type || !payload) {
      return { success: false, reason: 'Event must have type and payload' };
    }
    
    try {
      switch (type) {
        case 'anti-pattern':
          // Payload: { pattern, severity, context: { modelId?, provider?, tool?, sessionId? } }
          if (this.validateLearning({ type: 'anti-pattern', ...payload }).valid) {
            this.antiPatterns.addAntiPattern({
              ...payload,
              discovered_at: new Date().toISOString(),
              source: 'external-event',
            });
            this._emitHook('patternStored', { type: 'anti', pattern: payload });
            this.metaAwarenessTracker.trackEvent({
              event_type: 'orchestration.context_gap_detected',
              task_type: payload?.context?.task_type || 'learning',
              complexity: payload?.context?.complexity || 'moderate',
              outcome: 'warning',
              metadata: {
                gap_type: payload?.type || 'anti-pattern',
                resolved: false,
              },
            });
            return { success: true };
          }
          return { success: false, reason: 'Invalid anti-pattern payload' };
          
        case 'positive-pattern':
          // Payload: { pattern, pattern_type, context: { modelId?, provider?, tool?, sessionId? } }
          if (this.validateLearning({ type: 'positive-pattern', ...payload }).valid) {
            this.positivePatterns.addPositivePattern({
              ...payload,
              discovered_at: new Date().toISOString(),
              source: 'external-event',
            });
            this._emitHook('patternStored', { type: 'positive', pattern: payload });
            this.metaAwarenessTracker.trackEvent({
              event_type: 'orchestration.assumption_challenged',
              task_type: payload?.context?.task_type || 'learning',
              complexity: payload?.context?.complexity || 'moderate',
              outcome: 'improved',
              metadata: {
                source: 'positive-pattern',
                pattern_type: payload?.pattern_type || payload?.type || 'unknown',
              },
            });
            return { success: true };
          }
          return { success: false, reason: 'Invalid positive-pattern payload' };
          
        case 'outcome':
          // Payload: { adviceId?, taskContext, success, failure_reason?, tokens_used? }
          if (payload.adviceId) {
            return this.learnFromOutcome(payload.adviceId, {
              success: payload.success,
              description: payload.failure_reason,
              tokens_used: payload.tokens_used,
              time_taken_ms: payload.time_taken_ms,
            });
          } else if (payload.taskContext) {
            // Direct learning without advice ID - create a new advice entry
            return this._learnDirect(payload.taskContext, payload);
          }
          return { success: false, reason: 'Outcome must have adviceId or taskContext' };
          
        case 'tool-usage':
          // Payload: { tool, success, tokens_used, context: { modelId?, sessionId? } }
          this._emitHook('toolUsage', payload);
          this.metaAwarenessTracker.trackEvent({
            event_type: 'orchestration.tool_invoked',
            session_id: payload?.context?.sessionId || 'default',
            task_id: payload?.context?.taskId || null,
            task_type: payload?.context?.taskType || 'general',
            complexity: payload?.context?.complexity || 'moderate',
            outcome: payload?.success === false ? 'failure' : 'success',
            metadata: {
              tool: payload?.tool || 'unknown',
              model_id: payload?.context?.modelId || null,
              tool_antipattern: payload?.context?.toolAntipattern === true,
            },
          });
          return { success: true };
          
        default:
          return { success: false, reason: `Unknown event type: ${type}` };
      }
    } catch (err) {
      return { success: false, reason: err.message };
    }
  }

  /**
   * Direct learning without prior advice - creates new advice entry from task context.
   * @private
   */
  _learnDirect(taskContext, outcome) {
    const adviceId = `direct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    // Create a synthetic entry in outcomeLog for future reference
    this.advisor.outcomeLog.push({
      advice_id: adviceId,
      task_context: taskContext,
      timestamp: new Date().toISOString(),
      outcome: { success: outcome.success, ...outcome },
    });
    
    // Learn from the outcome
    if (!outcome.success && outcome.failure_reason) {
      // Extract pattern from failure
      const pattern = this.extractor._extractFailurePattern(outcome.failure_reason, taskContext);
      if (pattern) {
        this.antiPatterns.addAntiPattern({
          ...pattern,
          discovered_at: new Date().toISOString(),
          source: 'direct-learning',
        });
      }
    }
    
    return { learned: true, advice_id: adviceId };
  }

  // ===== SESSION INGESTION =====

  /**
   * Ingest a single session's logs, extracting and storing patterns.
   * @param {string} sessionId
   * @returns {{ anti_patterns_found: number, positive_patterns_found: number, session_id: string }}
   */
  ingestSession(sessionId) {
    const result = this.extractor.extractFromSession(sessionId);

    if (result.error) {
      return {
        session_id: sessionId,
        error: result.error,
        anti_patterns_found: 0,
        positive_patterns_found: 0,
      };
    }

    // Store extracted anti-patterns (HEAVILY weighted)
    for (const ap of result.anti_patterns) {
      this.antiPatterns.addAntiPattern(ap);
      this._emitHook('patternStored', { type: 'anti', pattern: ap, session_id: sessionId });
    }

    // Store extracted positive patterns
    for (const pp of result.positive_patterns) {
      this.positivePatterns.addPositivePattern(pp);
      this._emitHook('patternStored', { type: 'positive', pattern: pp, session_id: sessionId });
    }

    this.sessionLog.push({
      session_id: sessionId,
      ingested_at: new Date().toISOString(),
      anti_patterns_found: result.anti_patterns.length,
      positive_patterns_found: result.positive_patterns.length,
      message_count: result.message_count,
    });
    // Cap session log to prevent unbounded memory growth (keep last 1000)
    const MAX_SESSION_LOG = 1000;
    if (this.sessionLog.length > MAX_SESSION_LOG) {
      this.sessionLog = this.sessionLog.slice(-MAX_SESSION_LOG);
    }

    if (this.autoSave) {
      this.save();
    }

    return {
      session_id: sessionId,
      anti_patterns_found: result.anti_patterns.length,
      positive_patterns_found: result.positive_patterns.length,
      message_count: result.message_count,
    };
  }

  /**
   * Ingest all available sessions.
   * Also runs cross-session analysis (repeated_mistake detection).
   * @returns {{ sessions_analyzed: number, total_anti: number, total_positive: number, cross_session: number }}
   */
  ingestAllSessions() {
    const fullResult = this.extractor.extractFromAllSessions();

    // Store all patterns
    for (const session of fullResult.sessions) {
      for (const ap of session.anti_patterns) {
        this.antiPatterns.addAntiPattern(ap);
        this._emitHook('patternStored', { type: 'anti', pattern: ap, session_id: session.session_id });
      }
      for (const pp of session.positive_patterns) {
        this.positivePatterns.addPositivePattern(pp);
        this._emitHook('patternStored', { type: 'positive', pattern: pp, session_id: session.session_id });
      }
    }

    // Cross-session anti-patterns (repeated_mistake)
    for (const csap of fullResult.cross_session_anti_patterns) {
      this.antiPatterns.addAntiPattern(csap);
      this._emitHook('onFailureDistill', { distilled_pattern: csap, source: 'cross-session' });
    }

    this.sessionLog.push({
      type: 'bulk_ingest',
      ingested_at: new Date().toISOString(),
      sessions_analyzed: fullResult.sessions_analyzed,
      total_anti: fullResult.total_anti_patterns,
      total_positive: fullResult.total_positive_patterns,
    });

    if (this.autoSave) {
      this.save();
    }

    return {
      sessions_analyzed: fullResult.sessions_analyzed,
      total_anti: fullResult.total_anti_patterns,
      total_positive: fullResult.total_positive_patterns,
      cross_session: fullResult.cross_session_anti_patterns.length,
    };
  }

  // ===== ADVISE =====

  /**
   * Get orchestration advice for a task context.
   * Combines anti-pattern warnings (STRONG) with positive suggestions (SOFT).
   *
   * @param {Object} taskContext - See OrchestrationAdvisor.advise()
   * @returns {Object} Advice with warnings, suggestions, routing, risk_score
   */
   async advise(taskContext) {
    // Fire-and-forget: trackEvent is async but result not needed here
    this.metaAwarenessTracker.trackEvent({
      event_type: 'orchestration.phase_entered',
      task_type: taskContext?.task_type || 'general',
      complexity: taskContext?.complexity || 'moderate',
      metadata: {
        phase: 'assessment',
        phase_violation: false,
      },
    });

    this.metaAwarenessTracker.trackEvent({
      event_type: 'orchestration.assumption_challenged',
      task_type: taskContext?.task_type || 'general',
      complexity: taskContext?.complexity || 'moderate',
      metadata: {
        source: 'advisor_preflight',
      },
    });

    // T6 (Wave 11): Check advice cache for stable task-type patterns
    // Only cache if no session-specific signals (quotaSignal, rotator risk)
    const hasSessionSignals = taskContext?.quotaSignal || taskContext?.quota_signal || taskContext?.rotator_risk;
    if (!hasSessionSignals) {
      const cacheKey = `${taskContext?.task_type || 'general'}:${taskContext?.complexity || 'moderate'}`;
      const cached = this._adviceCache.get(cacheKey);
      if (cached && (Date.now() - cached.ts) < this._adviceCacheTTL) {
        return { ...cached.value };  // Return shallow copy to prevent mutation
      }
    }

    this._emitHook('preOrchestrate', { task_context: taskContext });
    const advice = this.advisor.advise(taskContext);

    this.metaAwarenessTracker.trackEvent({
      event_type: 'orchestration.phase_entered',
      task_type: taskContext?.task_type || 'general',
      complexity: taskContext?.complexity || 'moderate',
      metadata: {
        phase: 'exploration',
        phase_violation: false,
      },
    });

    this.metaAwarenessTracker.trackEvent({
      event_type: 'orchestration.skill_loaded',
      task_type: taskContext?.task_type || 'general',
      complexity: taskContext?.complexity || 'moderate',
      metadata: {
        skill_relevant: Array.isArray(advice?.routing?.skills) && advice.routing.skills.length > 0,
        missing_required_skill: !Array.isArray(advice?.routing?.skills) || advice.routing.skills.length === 0,
        selected_skills: advice?.routing?.skills || [],
      },
    });

    this.metaAwarenessTracker.trackEvent({
      event_type: 'orchestration.delegation_decision',
      task_type: taskContext?.task_type || 'general',
      complexity: taskContext?.complexity || 'moderate',
      metadata: {
        should_delegate: (taskContext?.complexity === 'complex' || taskContext?.complexity === 'extreme'),
        delegated: Boolean(advice?.routing?.agent),
        selected_agent: advice?.routing?.agent || null,
      },
    });

    const meta = await this.metaAwarenessTracker.getOverview();
    advice.meta_awareness_signal = {
      score: meta?.composite?.score_mean ?? 50,
      confidence: meta?.rl_signal?.confidence ?? 0,
      accepted: meta?.rl_signal?.accepted ?? false,
      max_influence: meta?.rl_signal?.max_influence ?? 0.15,
    };
    this._emitHook('adviceGenerated', { task_context: taskContext, advice });

    // Enrich advice with meta-KB context (fail-open: empty if unavailable)
    const metaContext = this.metaKB.index
      ? this.metaKB.query(taskContext)
      : { warnings: [], suggestions: [], conventions: [] };
    advice.meta_context = metaContext;

    // Add staleness warning if meta-KB index is outdated
    if (this.metaKB.isStale()) {
      advice.meta_context_stale = true;
    }

    this.metaAwarenessTracker.trackEvent({
      event_type: 'orchestration.phase_entered',
      task_type: taskContext?.task_type || 'general',
      complexity: taskContext?.complexity || 'moderate',
      metadata: {
        phase: 'implementation',
        phase_violation: false,
      },
    });

    // T6 (Wave 11): Store in cache if no session-specific signals
    if (!hasSessionSignals) {
      const cacheKey = `${taskContext?.task_type || 'general'}:${taskContext?.complexity || 'moderate'}`;
      // Evict oldest if over max
      if (this._adviceCache.size >= this._adviceCacheMax) {
        const oldest = this._adviceCache.keys().next().value;
        this._adviceCache.delete(oldest);
      }
      this._adviceCache.set(cacheKey, { value: advice, ts: Date.now() });
    }

    return advice;
  }

  /**
   * T6 (Wave 11): Invalidate advice cache.
   * Call after learning updates, pattern changes, or meta-KB refresh.
   */
  invalidateAdviceCache() {
    this._adviceCache.clear();
  }

  /**
   * Record the outcome of a previously advised task.
   * @param {string} adviceId
   * @param {Object} outcome - { success, description, tokens_used, time_taken_ms, failure_reason }
   */
  learnFromOutcome(adviceId, outcome) {
    this._adviceCache.clear(); // T6 (Wave 11): Invalidate cache on new learning data
    const result = this.advisor.learnFromOutcome(adviceId, outcome);
    this.metaAwarenessTracker.trackEvent({
      event_type: 'orchestration.failure_recovery_step',
      outcome: outcome?.success === false ? 'repeated_failure' : 'recovered',
      task_type: 'outcome_learning',
      complexity: 'moderate',
      metadata: {
        advice_id: adviceId,
        recovered: outcome?.success !== false,
        repeated_failure: outcome?.success === false,
      },
    });
    this._emitHook('outcomeRecorded', { advice_id: adviceId, outcome, result });
    if (outcome && outcome.success === false) {
      this._emitHook('onFailureDistill', {
        advice_id: adviceId,
        outcome,
        distilled_failure: {
          failure_reason: outcome.failure_reason || outcome.description || 'unknown failure',
          tokens_used: outcome.tokens_used,
          time_taken_ms: outcome.time_taken_ms,
        },
      });
    }
    if (this.autoSave) {
      this.save();
    }
    return result;
  }

  // ===== DIRECT PATTERN ACCESS =====

  /**
   * Manually add an anti-pattern.
   * @param {Object} pattern - { type, description, severity, context }
   */
  addAntiPattern(pattern) {
    const result = this.antiPatterns.addAntiPattern(pattern);
    this._emitHook('patternStored', { type: 'anti', pattern: result });
    if (this.autoSave) this.save();
    return result;
  }

  /**
   * Manually add a positive pattern.
   * @param {Object} pattern - { type, description, success_rate, context }
   */
  addPositivePattern(pattern) {
    const result = this.positivePatterns.addPositivePattern(pattern);
    this._emitHook('patternStored', { type: 'positive', pattern: result });
    if (this.autoSave) this.save();
    return result;
  }

  // ===== REPORTING =====

  /**
   * Get a comprehensive report of all learned patterns and insights.
   */
  async getReport() {
    const insights = this.advisor.getInsights();
    const antiStats = this.antiPatterns.getStats();
    const posStats = this.positivePatterns.getStats();

    return {
      engine_version: '1.0.0',
      generated_at: new Date().toISOString(),
      sessions_ingested: this.sessionLog.length,
      anti_patterns: {
        total: antiStats.total,
        by_type: antiStats.by_type,
        by_severity: antiStats.by_severity,
        total_weight: antiStats.total_weight,
        hotspots: antiStats.most_frequent,
        top_severe: this.antiPatterns.getSevere('high').slice(0, 5).map((p) => ({
          type: p.type,
          description: p.description,
          severity: p.severity,
          occurrences: p.occurrences,
        })),
      },
      positive_patterns: {
        total: posStats.total,
        by_type: posStats.by_type,
        avg_success_rate: posStats.avg_success_rate,
        top_strategies: posStats.top_strategies,
      },
      insights: insights.summary,
      outcome_tracking: insights.outcome_tracking,
      recommendations: insights.recommendations,
      asymmetry_note:
        'Anti-pattern data is weighted 3-5x heavier than positive patterns. ' +
        'Warnings are STRONG (should block/pause). Suggestions are SOFT (can ignore).',
      meta_awareness: await this.metaAwarenessTracker.getOverview(),
    };
  }

  getMetaAwarenessReport() {
    return this.metaAwarenessTracker.getOverview();
  }

  ingestMetaAwarenessEvent(event, options = {}) {
    return this.metaAwarenessTracker.trackEvent(event, options);
  }

  // ===== PERSISTENCE =====

  /**
   * Save all state to disk.
   */
  save() {
    this.antiPatterns.save();
    this.positivePatterns.save();
  }

  /**
   * Load persisted state from disk.
   */
  load() {
    // AntiPatternCatalog and PositivePatternTracker auto-load in constructor
    // This method is for explicit reload
    this.antiPatterns._load();
    this.positivePatterns._load();
  }
}

// ===== IMPORTS FOR EXPORTS =====
const toolUsageTracker = require('./tool-usage-tracker');

// ===== EXPORTS =====

module.exports = {
  LearningEngine,
  MetaAwarenessTracker,
  MetaKBReader,
  OrchestrationAdvisor,
};
