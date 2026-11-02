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
const { DOMAIN_SLUGS, buildDomainWeightHyperParameters } = require('./meta-awareness-rules');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');

let PluginLifecycleSupervisor;
try {
  ({ PluginLifecycleSupervisor } = require('../../opencode-plugin-lifecycle/src/index.js'));
} catch {
  // Fail-open in environments where plugin lifecycle package is unavailable.
  PluginLifecycleSupervisor = class PluginLifecycleSupervisorFallback {
    on() {}
    emit() {}
  };
}

// Hyper-parameter registry (Task 7: per-task_type decay floors/half-life) — fail-open.
let HyperParameterRegistry;
try {
  ({ HyperParameterRegistry } = require('../../opencode-hyper-param-learner/src/index.js'));
} catch {
  HyperParameterRegistry = null;
}

// Optional: feedback collector + learner used to adapt hyper-parameters from outcomes.
let FeedbackCollector;
let ParameterLearner;
try {
  ({ FeedbackCollector } = require('../../opencode-hyper-param-learner/src/feedback-collector.js'));
  ({ ParameterLearner } = require('../../opencode-hyper-param-learner/src/parameter-learner.js'));
} catch {
  FeedbackCollector = null;
  ParameterLearner = null;
}

// Task 8: advice cache TTL bounds + defaults
const ADVICE_CACHE_TTL_MS_DEFAULT = 300000; // 5 minutes
const ADVICE_CACHE_MAX_DEFAULT = 500;
const ADVICE_CACHE_TTL_MS_MIN = 60000; // MUST NOT go below 1 minute
const ADVICE_CACHE_TTL_MS_MAX = 3600000; // MUST NOT exceed 1 hour

function _normalizeTaskTypeKey(taskType) {
  if (typeof taskType !== 'string' || taskType.trim() === '') return 'general';
  let key = taskType
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (!key) key = 'general';
  if (!/^[a-z]/.test(key)) key = `t_${key}`;
  // HyperParameterRegistry name rules: /^[a-z][a-z0-9_]*$/
  key = key.replace(/[^a-z0-9_]/g, '_');
  if (!/^[a-z][a-z0-9_]*$/.test(key)) return 'general';
  return key;
}

function _clampNumber(value, min, max, fallback) {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  if (typeof num !== 'number' || !Number.isFinite(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

// Lazy require of central event bus — fail-open so LearningEngine works without it
let _eventBus = null;
function _getEventBus() {
  if (_eventBus === null) {
    try { _eventBus = require('../../opencode-event-bus/src/index.js'); } catch { _eventBus = undefined; }
  }
  return _eventBus || null;
}

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

    // Task 7 (hyper-param-learning-system): per-task_type decay floors + half-life params.
    this._initDecayHyperParams({ autoLoad });

    // Wire registry into meta-awareness tracker (constructed earlier).
    if (this.hyperParamRegistry && this.metaAwarenessTracker) {
      this.metaAwarenessTracker.hyperParamRegistry = this.hyperParamRegistry;
    }

    // Feedback collector: used for hyper-parameter adaptation from outcome feedback.
    this.feedbackCollector = null;
    if (FeedbackCollector && this.hyperParamRegistry) {
      try {
        const learner = ParameterLearner ? new ParameterLearner() : null;
        this.feedbackCollector = new FeedbackCollector({
          registry: this.hyperParamRegistry,
          parameterLearner: learner,
        });
      } catch (err) {
        this.feedbackCollector = null;
        console.warn(`[LearningEngine] FeedbackCollector init failed (non-fatal): ${err.message}`);
      }
    }

    // Advice meta snapshots (used to correlate domain scores with outcomes)
    this._metaSnapshotByAdviceId = new Map();

    this.autoSave = autoSave;
    this.sessionLog = []; // Track which sessions have been ingested
    this.hooks = {};
    this.pluginSupervisor = new PluginLifecycleSupervisor();
    this._initAntiGamingClassifier();

    // T6 (Wave 11): Advice cache — keyed by taskType+complexity
    this._adviceCache = new Map();
    this._adviceCacheTTL = ADVICE_CACHE_TTL_MS_DEFAULT;
    this._adviceCacheMax = ADVICE_CACHE_MAX_DEFAULT;
    this._initAdviceCacheHyperParams();
    this._initAdviceCacheAdaptiveLearning();

    // Meta-KB reader: loads the synthesized meta-knowledge index (fail-open)
    this.metaKB = new MetaKBReader(options.metaKBPath);
    this.metaKB.load(); // Non-blocking, returns false if unavailable

    // Register built-in adviceGenerated hook: adjust routing based on meta-KB evidence
    this.registerHook('adviceGenerated', ({ task_context, advice }) => {
      if (!this.metaKB.index || !advice?.routing) return;
      const metaResult = this.metaKB.query(task_context);
      const warnings = Array.isArray(metaResult?.warnings) ? metaResult.warnings : [];
      const evidenceEntries = Array.isArray(metaResult?.suggestions) ? metaResult.suggestions : [];
      const suggestedSkills = Array.isArray(advice.routing.skills)
        ? advice.routing.skills
          .filter((skill) => typeof skill === 'string' && skill.length > 0)
          .map((skill) => skill.toLowerCase())
        : [];

      const relevantWarningCount = warnings.filter((warning) => {
        if (suggestedSkills.length === 0) return false;
        const warningText = [warning?.pattern, warning?.description, warning?.type]
          .filter((part) => typeof part === 'string' && part.length > 0)
          .join(' ')
          .toLowerCase();
        return suggestedSkills.some((skill) => warningText.includes(skill));
      }).length;

      if (relevantWarningCount > 0 && typeof advice.routing.confidence === 'number') {
        advice.routing.confidence = Math.max(
          0.1,
          Math.round(advice.routing.confidence * 0.9 * 100) / 100
        );
        advice.routing.meta_kb_warnings = relevantWarningCount;
      }

      if (evidenceEntries.length > 0) {
        advice.routing.meta_kb_evidence = evidenceEntries.length;
        if (!Array.isArray(advice.suggestions)) {
          advice.suggestions = [];
        }
        advice.suggestions.push({
          type: 'meta_kb_evidence',
          description: `Meta-KB found ${evidenceEntries.length} relevant entries for skill routing.`,
          evidence_count: evidenceEntries.length,
          strength: 'SOFT',
          action: 'CONSIDER',
        });
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
   * Task 7: Ensure required decay hyper-parameters exist.
   * Fail-open: if registry package is unavailable or registry is invalid, defaults are used.
   */
  _initDecayHyperParams({ autoLoad } = {}) {
    this.hyperParamRegistry = null;
    this._decayParamTelemetry = {
      calls: 0,
      legacy_comparisons: 0,
      legacy_delta_mean: 0,
      legacy_delta_max: 0,
      by_task_type: {},
    };

    if (!HyperParameterRegistry) return;

    const makeDecayFloor = (name, currentValue) => ({
      name,
      current_value: currentValue,
      learning_config: {
        adaptation_strategy: 'ema',
        triggers: {
          outcome_type: 'feedback',
          min_samples: 30,
          confidence_threshold: 0.9,
        },
        bounds: {
          soft: { min: 0.05, max: 0.3 },
          hard: { min: 0.01, max: 0.5 },
        },
        exploration_policy: {
          enabled: false,
          epsilon: 0,
          annealing_rate: 1,
        },
      },
      grouping: {
        group_by_task_type: false,
        group_by_complexity: false,
        aggregate_function: 'mean',
      },
      individual_tracking: {
        per_session: false,
        per_task: true,
      },
    });

    // NOTE: bounds here are distinct from decay floors. Half-life is in days.
    const makeDecayHalfLifeDays = (name, currentValue) => ({
      name,
      current_value: currentValue,
      learning_config: {
        adaptation_strategy: 'ema',
        triggers: {
          outcome_type: 'feedback',
          min_samples: 30,
          confidence_threshold: 0.9,
        },
        bounds: {
          soft: { min: 60, max: 240 },
          hard: { min: 7, max: 730 },
        },
        exploration_policy: {
          enabled: false,
          epsilon: 0,
          annealing_rate: 1,
        },
      },
      grouping: {
        group_by_task_type: false,
        group_by_complexity: false,
        aggregate_function: 'mean',
      },
      individual_tracking: {
        per_session: false,
        per_task: true,
      },
    });

    const defaults = [
      makeDecayFloor('decay_floor_default', 0.1),
      makeDecayHalfLifeDays('decay_half_life_days_default', 120),
    ];

    let registry;
    try {
      registry = new HyperParameterRegistry({
        defaults,
        autoLoad: autoLoad !== false,
      });
    } catch (err) {
      console.warn(`[LearningEngine] HyperParameterRegistry init failed: ${err.message}`);
      return;
    }

    const TASK_TYPES = [
      'debug',
      'feature',
      'refactor',
      'fix',
      'test',
      'docs',
      'build',
      'chore',
      'general',
    ];

    const ensure = (parameter) => {
      try {
        if (!registry.has(parameter.name)) {
          registry.create(parameter);
        }
      } catch (err) {
        // Fail-open: invalid registry state should not break LearningEngine.
        console.warn(`[LearningEngine] Hyper-parameter ensure failed (${parameter.name}): ${err.message}`);
      }
    };

    // Ensure defaults exist even if registry loaded without them.
    for (const param of defaults) ensure(param);

    // Ensure per-task_type overrides exist.
    for (const taskType of TASK_TYPES) {
      const key = _normalizeTaskTypeKey(taskType);
      ensure(makeDecayFloor(`decay_floor_${key}`, 0.1));
      ensure(makeDecayHalfLifeDays(`decay_half_life_days_${key}`, 120));
    }

    // Task 10 (hyper-param-learning-system): meta-awareness domain weights.
    // Register global + optional per-workflow overrides.
    try {
      const domainWeightParams = buildDomainWeightHyperParameters({ workflowTypes: TASK_TYPES });
      for (const param of domainWeightParams) ensure(param);
    } catch (err) {
      console.warn(`[LearningEngine] Domain weight hyper-parameter init failed (non-fatal): ${err.message}`);
    }

    this.hyperParamRegistry = registry;
  }

  /**
   * Task 8: advice cache hyper-parameters
   * - advice_cache_ttl_ms_default (default 300000)
   * - advice_cache_ttl_ms_{task_type}
   * - advice_cache_max_default (default 500)
   */
  _initAdviceCacheHyperParams() {
    const registry = this.hyperParamRegistry;
    if (!registry || typeof registry.has !== 'function' || typeof registry.create !== 'function') return;

    const makeAdviceCacheTTL = (name, currentValue) => ({
      name,
      current_value: currentValue,
      learning_config: {
        adaptation_strategy: 'ema',
        triggers: {
          outcome_type: 'feedback',
          min_samples: 15,
          confidence_threshold: 0.75,
        },
        bounds: {
          soft: { min: 120000, max: 1800000 },
          hard: { min: ADVICE_CACHE_TTL_MS_MIN, max: ADVICE_CACHE_TTL_MS_MAX },
        },
        exploration_policy: {
          enabled: false,
          epsilon: 0,
          annealing_rate: 1,
        },
      },
      grouping: {
        group_by_task_type: true,
        group_by_complexity: false,
        aggregate_function: 'mean',
      },
      individual_tracking: {
        per_session: false,
        per_task: true,
      },
    });

    const makeAdviceCacheMax = (name, currentValue) => ({
      name,
      current_value: currentValue,
      learning_config: {
        adaptation_strategy: 'none',
        triggers: {
          outcome_type: 'feedback',
          min_samples: 1,
          confidence_threshold: 0,
        },
        bounds: {
          soft: { min: 100, max: 2000 },
          hard: { min: 50, max: 5000 },
        },
        exploration_policy: {
          enabled: false,
          epsilon: 0,
          annealing_rate: 1,
        },
      },
      grouping: {
        group_by_task_type: false,
        group_by_complexity: false,
        aggregate_function: 'mean',
      },
      individual_tracking: {
        per_session: false,
        per_task: false,
      },
    });

    const ensure = (parameter) => {
      try {
        if (!registry.has(parameter.name)) {
          registry.create(parameter);
        }
      } catch (err) {
        console.warn(`[LearningEngine] Hyper-parameter ensure failed (${parameter?.name || 'unknown'}): ${err.message}`);
      }
    };

    ensure(makeAdviceCacheTTL('advice_cache_ttl_ms_default', ADVICE_CACHE_TTL_MS_DEFAULT));
    ensure(makeAdviceCacheMax('advice_cache_max_default', ADVICE_CACHE_MAX_DEFAULT));

    const TASK_TYPES = [
      'debug',
      'feature',
      'refactor',
      'fix',
      'test',
      'docs',
      'build',
      'chore',
      'general',
    ];
    for (const taskType of TASK_TYPES) {
      const key = _normalizeTaskTypeKey(taskType);
      ensure(makeAdviceCacheTTL(`advice_cache_ttl_ms_${key}`, ADVICE_CACHE_TTL_MS_DEFAULT));
    }

    // Read-time safety clamps (fail-open)
    this._adviceCacheTTL = this._getAdviceCacheTTLms('general');
    this._adviceCacheMax = this._getAdviceCacheMax();
  }

  _getAdviceCacheTTLms(taskType) {
    const key = _normalizeTaskTypeKey(taskType);
    const v = this._readHyperParamValue(`advice_cache_ttl_ms_${key}`, null);
    const resolved = v === null
      ? this._readHyperParamValue('advice_cache_ttl_ms_default', ADVICE_CACHE_TTL_MS_DEFAULT)
      : v;
    return _clampNumber(resolved, ADVICE_CACHE_TTL_MS_MIN, ADVICE_CACHE_TTL_MS_MAX, ADVICE_CACHE_TTL_MS_DEFAULT);
  }

  _getAdviceCacheMax() {
    const v = this._readHyperParamValue('advice_cache_max_default', ADVICE_CACHE_MAX_DEFAULT);
    return _clampNumber(v, 50, 5000, ADVICE_CACHE_MAX_DEFAULT);
  }

  _initAdviceCacheAdaptiveLearning() {
    this._adviceCacheLearning = {
      byAdviceId: new Map(),
      qualityByTaskType: new Map(),
      qualityByCacheKey: new Map(),
      telemetry: {
        cache_hits: 0,
        cache_misses: 0,
        ttl_updates: 0,
        ttl_update_blocked: 0,
      },
    };

    this._adviceCacheParamLearner = ParameterLearner ? new ParameterLearner() : null;
  }

  _recordAdviceCacheLookup({ taskContext, cacheKey, cached }) {
    const learning = this._adviceCacheLearning;
    if (!learning) return;

    const taskTypeKey = _normalizeTaskTypeKey(taskContext?.task_type || 'general');

    if (cached) {
      learning.telemetry.cache_hits++;

      // If last cached outcome was good and we see a repeat request, consider increasing TTL.
      const byKey = learning.qualityByCacheKey.get(cacheKey);
      if (byKey?.last_outcome_success === true) {
        this._maybeIncreaseAdviceCacheTTL(taskTypeKey);
      }

      const adviceId = cached?.value?.advice_id || cached?.value?.adviceId;
      if (typeof adviceId === 'string' && adviceId) {
        learning.byAdviceId.set(adviceId, {
          cache_key: cacheKey,
          task_type_key: taskTypeKey,
          was_cache_hit: true,
          served_at: Date.now(),
        });
      }
      return;
    }

    learning.telemetry.cache_misses++;
  }

  _updateAdviceCacheQuality({ adviceId, outcome }) {
    const learning = this._adviceCacheLearning;
    if (!learning) return;

    const meta = learning.byAdviceId.get(adviceId);
    if (!meta || !meta.was_cache_hit) return;

    // Prevent unbounded growth.
    learning.byAdviceId.delete(adviceId);

    const success = outcome?.success === true;

    // MUST DO: wire FeedbackCollector to compute cache hit quality (success_rate)
    try {
      this.feedbackCollector?.recordOutcome?.(
        { success },
        {
          outcome_type: 'feedback',
          advice_id: adviceId,
          cache_key: meta.cache_key,
          task_type_key: meta.task_type_key,
        }
      );
    } catch {
      // fail-open
    }

    // Update per-task_type EMA quality (0..1)
    const entry = learning.qualityByTaskType.get(meta.task_type_key) || {
      samples: 0,
      ema_quality: 0.5,
      last_at: null,
    };
    const alpha = 0.2;
    entry.samples += 1;
    entry.ema_quality = (entry.ema_quality * (1 - alpha)) + ((success ? 1 : 0) * alpha);
    entry.last_at = Date.now();
    learning.qualityByTaskType.set(meta.task_type_key, entry);

    learning.qualityByCacheKey.set(meta.cache_key, {
      last_outcome_success: success,
      last_outcome_at: Date.now(),
    });

    if (!success) {
      this._maybeDecreaseAdviceCacheTTL(meta.task_type_key);
    }
  }

  _shouldAdaptAdviceCacheTTL(taskTypeKey) {
    const learning = this._adviceCacheLearning;
    if (!learning || !this._adviceCacheParamLearner) return false;
    const entry = learning.qualityByTaskType.get(taskTypeKey);
    if (!entry) return false;

    // Learning config (required): min_samples=15, confidence_threshold=0.75
    const confidence = this._adviceCacheParamLearner.computeConfidence(entry.samples, 15);
    return confidence >= 0.75;
  }

  _tryUpdateAdviceCacheTTLParam(taskTypeKey, nextValue) {
    const registry = this.hyperParamRegistry;
    const learning = this._adviceCacheLearning;
    if (!registry?.update || !registry?.has || !learning) return;

    const key = _normalizeTaskTypeKey(taskTypeKey);
    const name = `advice_cache_ttl_ms_${key}`;
    if (!registry.has(name)) return;

    const clamped = _clampNumber(nextValue, ADVICE_CACHE_TTL_MS_MIN, ADVICE_CACHE_TTL_MS_MAX, ADVICE_CACHE_TTL_MS_DEFAULT);
    try {
      registry.update(name, { current_value: clamped });
      learning.telemetry.ttl_updates++;
    } catch (err) {
      console.warn(`[LearningEngine] TTL hyper-parameter update blocked (${name}): ${err.message}`);
    }
  }

  _maybeIncreaseAdviceCacheTTL(taskTypeKey) {
    const learning = this._adviceCacheLearning;
    if (!learning) return;
    if (!this._shouldAdaptAdviceCacheTTL(taskTypeKey)) {
      learning.telemetry.ttl_update_blocked++;
      return;
    }

    const quality = learning.qualityByTaskType.get(taskTypeKey);
    if (!quality || quality.ema_quality < 0.75) return;

    const current = this._getAdviceCacheTTLms(taskTypeKey);
    const candidate = _clampNumber(current * 1.25, ADVICE_CACHE_TTL_MS_MIN, ADVICE_CACHE_TTL_MS_MAX, current);
    const next = Math.round((current * 0.8) + (candidate * 0.2));
    this._tryUpdateAdviceCacheTTLParam(taskTypeKey, next);
  }

  _maybeDecreaseAdviceCacheTTL(taskTypeKey) {
    const learning = this._adviceCacheLearning;
    if (!learning) return;
    if (!this._shouldAdaptAdviceCacheTTL(taskTypeKey)) {
      learning.telemetry.ttl_update_blocked++;
      return;
    }

    const quality = learning.qualityByTaskType.get(taskTypeKey);
    if (!quality || quality.ema_quality > 0.45) return;

    const current = this._getAdviceCacheTTLms(taskTypeKey);
    const candidate = _clampNumber(current * 0.8, ADVICE_CACHE_TTL_MS_MIN, ADVICE_CACHE_TTL_MS_MAX, current);
    const next = Math.round((current * 0.8) + (candidate * 0.2));
    this._tryUpdateAdviceCacheTTLParam(taskTypeKey, next);
  }

  _getLearningTaskType(learning) {
    const raw =
      learning?.task_type ||
      learning?.taskType ||
      learning?.context?.task_type ||
      learning?.context?.taskType ||
      learning?.context?.taskType ||
      learning?.context?.task_type;
    return _normalizeTaskTypeKey(raw || 'general');
  }

  _readHyperParamValue(name, fallback) {
    try {
      const param = this.hyperParamRegistry?.get?.(name);
      const v = param?.current_value;
      return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    } catch {
      return fallback;
    }
  }

  _getDecayFloor(taskTypeKey) {
    const key = _normalizeTaskTypeKey(taskTypeKey);
    const v = this._readHyperParamValue(`decay_floor_${key}`, null);
    if (v === null) {
      return this._readHyperParamValue('decay_floor_default', 0.1);
    }
    return v;
  }

  _getDecayHalfLifeDays(taskTypeKey) {
    const key = _normalizeTaskTypeKey(taskTypeKey);
    const v = this._readHyperParamValue(`decay_half_life_days_${key}`, null);
    if (v === null) {
      return this._readHyperParamValue('decay_half_life_days_default', 120);
    }
    return v;
  }

  getDecayParamTelemetry() {
    return JSON.parse(JSON.stringify(this._decayParamTelemetry || {}));
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
   * Emit a hook by name with payload.
   * @param {string} hookName
   * @param {Object} payload
   * @private
   */
  _emitHook(hookName, payload) {
    const handlers = this.hooks[hookName];
    if (!handlers || !Array.isArray(handlers)) return;
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        console.warn(`[LearningEngine] Hook "${hookName}" threw:`, err.message);
      }
    }
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

    // Invalid timestamps fail-open to full weight.
    if (!Number.isFinite(days) || days < 0) return 1.0;

    const taskTypeKey = this._getLearningTaskType(learning);
    const decayFloor = _clampNumber(this._getDecayFloor(taskTypeKey), 0.01, 0.5, 0.1);
    const halfLifeDays = _clampNumber(this._getDecayHalfLifeDays(taskTypeKey), 7, 730, 120);

    // Schedule (backward-compatible shape):
    // - <7d: 1.0
    // - 7..30d: 1.0 → 0.3 (linear)
    // - 30..halfLifeDays: 0.3 → decayFloor (linear)
    // - >=halfLifeDays: decayFloor
    const FULL_WEIGHT_DAYS = 7;
    const MID_DAYS = 30;
    const floorAtDays = Math.max(MID_DAYS, halfLifeDays);

    let weight;
    if (days < FULL_WEIGHT_DAYS) {
      weight = 1.0;
    } else if (days < MID_DAYS) {
      weight = 1.0 - ((days - FULL_WEIGHT_DAYS) / (MID_DAYS - FULL_WEIGHT_DAYS)) * 0.7; // 1.0 → 0.3
    } else if (days < floorAtDays) {
      const span = floorAtDays - MID_DAYS;
      if (span <= 0) {
        weight = decayFloor;
      } else {
        // 0.3 → decayFloor
        weight = 0.3 - ((days - MID_DAYS) / span) * (0.3 - decayFloor);
      }
    } else {
      weight = decayFloor;
    }

    // Telemetry: compare vs legacy schedule (pre-Task 7) to detect behavior drift.
    try {
      const legacyFloor = 0.1;
      let legacyWeight;
      if (days < 7) legacyWeight = 1.0;
      else if (days < 30) legacyWeight = 1.0 - ((days - 7) / 23) * 0.7;
      else if (days < 90) legacyWeight = 0.3 - ((days - 30) / 60) * 0.2;
      else legacyWeight = legacyFloor;

      const delta = Math.abs(weight - legacyWeight);
      const t = this._decayParamTelemetry;
      if (t) {
        t.calls = (t.calls || 0) + 1;
        t.legacy_comparisons = (t.legacy_comparisons || 0) + 1;
        const n = t.legacy_comparisons;
        t.legacy_delta_mean = ((t.legacy_delta_mean || 0) * (n - 1) + delta) / n;
        t.legacy_delta_max = Math.max(t.legacy_delta_max || 0, delta);
        const bucket = t.by_task_type || (t.by_task_type = {});
        const key = taskTypeKey || 'general';
        const entry = bucket[key] || (bucket[key] = { comparisons: 0, delta_mean: 0, delta_max: 0 });
        entry.comparisons += 1;
        entry.delta_mean = (entry.delta_mean * (entry.comparisons - 1) + delta) / entry.comparisons;
        entry.delta_max = Math.max(entry.delta_max, delta);
      }
    } catch {
      // no-op
    }

    // Final clamp for safety.
    return _clampNumber(weight, 0.01, 1.0, 0.1);
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
     const pluginMetrics = this.getQuarantineMetrics();
     
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
       lastSave: this.lastSave || null,
       // Plugin quarantine metrics
       pluginQuarantine: pluginMetrics
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
   * Also forwards to central event bus with 'learning:' prefix (fail-open).
   * @param {string} hookName
   * @param {unknown} payload
   */
  _emitHook(hookName, payload) {
    this.emit(hookName, payload);

    // Forward to central event bus (fail-open)
    try { _getEventBus()?.emit(`learning:${hookName}`, payload); } catch { /* fail-open */ }

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
     
     // Apply anti-gaming filter to incoming events
     const filteredEvent = this.applyAntiGamingFilter(event);
     
     // If gaming detected and classified as hard-block, reject the event
     if (filteredEvent.gamingClassification && 
         filteredEvent.gamingClassification.action === 'block') {
       return {
         success: false, 
         reason: `Event blocked due to gaming behavior: ${filteredEvent.gamingClassification.reason}`
       };
     }
     
     const { type, payload } = filteredEvent;
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
      const ttlMs = this._getAdviceCacheTTLms(taskContext?.task_type || 'general');
      if (cached && (Date.now() - cached.ts) < ttlMs) {
        this._recordAdviceCacheLookup({ taskContext, cacheKey, cached });
        return { ...cached.value, cache: { hit: true, key: cacheKey } }; // shallow copy to prevent mutation
      }
      this._recordAdviceCacheLookup({ taskContext, cacheKey, cached: null });
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

    // Capture per-domain snapshot for outcome correlation learning.
    try {
      const domainScores = {};
      const domains = meta?.domains && typeof meta.domains === 'object' ? meta.domains : {};
      for (const [domainKey, bucket] of Object.entries(domains)) {
        const slug = DOMAIN_SLUGS[domainKey] || domainKey;
        domainScores[slug] = bucket?.score_mean ?? 50;
      }

      // Cap to prevent unbounded memory growth.
      if (this._metaSnapshotByAdviceId.size > 2000) {
        const oldestKey = this._metaSnapshotByAdviceId.keys().next().value;
        this._metaSnapshotByAdviceId.delete(oldestKey);
      }

      this._metaSnapshotByAdviceId.set(advice.advice_id, {
        at: new Date().toISOString(),
        workflow_type: taskContext?.task_type || 'general',
        composite_score: meta?.composite?.score_mean ?? 50,
        domain_scores: domainScores,
      });
    } catch {
      // Fail-open
    }
    this._emitHook('adviceGenerated', { task_context: taskContext, advice });

    // Enrich advice with meta-KB context (fail-open: empty if unavailable)
    const metaContext = this.metaKB.index
      ? this.metaKB.query(taskContext)
      : { warnings: [], suggestions: [], conventions: [] };
    advice.meta_context = metaContext;

    // Add staleness warning if meta-KB index is outdated
    if (this.metaKB.isStale()) {
      advice.meta_context_stale = true;
      if (!Array.isArray(advice.suggestions)) {
        advice.suggestions = [];
      }
      advice.suggestions.push({
        type: 'meta_kb_stale',
        description: 'Meta-knowledge index is stale; recommendations may be outdated.',
        strength: 'SOFT',
      });
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
      // Evict oldest if over max (parameterized)
      const cacheMax = this._getAdviceCacheMax();
      while (this._adviceCache.size >= cacheMax) {
        const oldest = this._adviceCache.keys().next().value;
        if (oldest === undefined) break;
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
    const snapshot = this._metaSnapshotByAdviceId.get(adviceId) || null;
    if (snapshot) {
      this._metaSnapshotByAdviceId.delete(adviceId);
    }

    const result = this.advisor.learnFromOutcome(adviceId, outcome);

    // Record feedback signals for domain-weight learning (fail-open).
    try {
      const entry = Array.isArray(this.advisor?.outcomeLog)
        ? this.advisor.outcomeLog.find((e) => e.advice_id === adviceId)
        : null;
      const workflowType = snapshot?.workflow_type || entry?.task_context?.task_type || 'general';

      if (this.feedbackCollector && typeof this.feedbackCollector.recordMetaAwarenessFeedback === 'function') {
        this.feedbackCollector.recordMetaAwarenessFeedback({
          workflow_type: workflowType,
          domain_scores: snapshot?.domain_scores || null,
          outcome: outcome || {},
        });
      }

      const verificationScore = snapshot?.domain_scores?.verification;
      const testsPassed =
        outcome?.tests_passed ??
        outcome?.testsPassed ??
        outcome?.verification_passed ??
        outcome?.verificationPassed ??
        outcome?.build_passed ??
        outcome?.buildPassed;

      // If verification was scored high but tests/build failed, penalize verification domain.
      if (testsPassed === false && typeof verificationScore === 'number' && verificationScore >= 75) {
        this.metaAwarenessTracker.trackEvent({
          event_type: 'orchestration.verification_mismatch',
          task_type: workflowType,
          complexity: 'moderate',
          metadata: {
            tests_passed: false,
            verification_score: verificationScore,
            advice_id: adviceId,
          },
        });
      }
    } catch {
      // Fail-open
    }
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

    // Task 8: cache-quality feedback drives adaptive advice-cache TTL.
    try {
      this._updateAdviceCacheQuality({ adviceId, outcome });
    } catch {
      // fail-open
    }

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
      // Audit trail is persisted as part of the main learning engine state
    }

    /**
     * Save all state to disk.
     */
    save() {
      this.antiPatterns.save();
      this.positivePatterns.save();
      // Audit trail is saved as part of anti-patterns/positive-patterns
      // In a full implementation, this would have its own persistence
    }

    /**
     * Anti-gaming classifier with audit trail.
     * Detects and classifies gaming behaviors in the learning system.
     */
    _initAntiGamingClassifier() {
      // Initialize audit trail for gaming events
      this.auditTrail = {
        _events: [],
        _maxSize: 1000,
        
        addEvent: function(event) {
          this._events.push({
            ...event,
            timestamp: new Date().toISOString(),
            id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
          });
          
          // Keep audit trail size bounded
          if (this._events.length > this._maxSize) {
            this._events = this._events.slice(-this._maxSize);
          }
          
          // Persist if auto-save is enabled
          if (this._learningEngineInstance && this._learningEngineInstance.autoSave) {
            this._learningEngineInstance.save();
          }
        },
        
        getEvents: function(filter = {}) {
          let results = [...this._events];
          
          if (filter.type) {
            results = results.filter(e => e.type === filter.type);
          }
          if (filter.severity) {
            results = results.filter(e => e.severity === filter.severity);
          }
          if (filter.startTime) {
            const startDate = new Date(filter.startTime);
            results = results.filter(e => new Date(e.timestamp) >= startDate);
          }
          if (filter.endTime) {
            const endDate = new Date(filter.endTime);
            results = results.filter(e => new Date(e.timestamp) <= endDate);
          }
          
          return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        },
        
        _load: function() {
          // Implementation would load from disk
          // For now, start with empty array
          this._events = [];
        },
        
        save: function() {
          // Implementation would save to disk
          // For now, this is a placeholder
        }
      };
      
      // Reference to self for audit trail
      this.auditTrail._learningEngineInstance = this;
      
      // Gaming detection thresholds and patterns
      this.gamingPatterns = {
        // Repeated similar outcomes (potential success inflation)
        repeatedSuccess: {
          threshold: 3, // 3+ similar successes in short time
          weight: 0.8,
          bucket: 'review' // Start with review, escalate to hard-block
        },
        
        // Rapid fire trivial fixes
        trivialFixSpam: {
          threshold: 5, // 5+ trivial fixes in 5 minutes
          weight: 0.9,
          bucket: 'hard-block'
        },
        
        // Artificial success metrics inflation
        metricInflation: {
          threshold: 0.95, // Success rate > 95% over multiple sessions
          weight: 0.85,
          bucket: 'review'
        },
        
        // Tool/skill gaming (using same tools to avoid challenging work)
        toolMonopolization: {
          threshold: 0.8, // Same tool used for >80% of operations
          weight: 0.75,
          bucket: 'review'
        }
      };
    }

   /**
    * Evaluate a plugin's health and update its quarantine status.
    * @param {Object} input - Plugin evaluation input {name, configured, discovered, heartbeat_ok, dependency_ok, policy_violation, crash_count, last_error}
    * @returns {Object} Plugin evaluation result with quarantine status
    */
   evaluatePlugin(input) {
     return this.pluginSupervisor.evaluatePlugin(input);
   }

   /**
    * Evaluate multiple plugins' health and update their quarantine status.
    * @param {Array} inputs - Array of plugin evaluation inputs
    * @returns {Object} Batch evaluation results
    */
   evaluateManyPlugins(inputs = []) {
     return this.pluginSupervisor.evaluateMany(inputs);
   }

   /**
    * Get list of all plugins with their current status.
    * @returns {Array} List of plugin state objects
    */
   listPlugins() {
     return this.pluginSupervisor.list();
   }

   /**
    * Get count of quarantined plugins.
    * @returns {number} Number of plugins currently quarantined
    */
   getQuarantinedCount() {
     const plugins = this.pluginSupervisor.list();
     return plugins.filter(plugin => Boolean(plugin.quarantine)).length;
   }

   /**
    * Get plugin quarantine severity map and reason codes.
    * @returns {Object} Quarantine statistics including reason code breakdown
    */
   getQuarantineMetrics() {
     const plugins = this.pluginSupervisor.list();
     const quarantined = plugins.filter(plugin => Boolean(plugin.quarantine));
     
     // Count by reason code
     const reasonCodes = {};
     quarantined.forEach(plugin => {
       const code = plugin.reason_code || 'unknown';
       reasonCodes[code] = (reasonCodes[code] || 0) + 1;
     });
     
     return {
       quarantinedCount: quarantined.length,
       totalPlugins: plugins.length,
       quarantineRate: plugins.length > 0 ? (quarantined.length / plugins.length) * 100 : 0,
       reasonCodes: reasonCodes,
       quarantinedPlugins: quarantined.map(plugin => ({
         name: plugin.name,
         reasonCode: plugin.reason_code,
         status: plugin.status,
         crashCount: plugin.crash_count,
         lastError: plugin.last_error
       }))
     };
   }

   /**
    * Detect gaming behaviors in learning events.
    * Analyzes patterns that indicate gaming the system (e.g., repeated similar outcomes,
    * artificial success inflation, trivial fix spam) and classifies severity.
    * 
    * @param {Object} event - Learning event to analyze
    * @returns {Object} Gaming assessment { isGaming, bucket, confidence, details }
    */
   detectGamingBehavior(event) {
     if (!this.gamingPatterns || !this.auditTrail) {
       return { isGaming: false, bucket: null, confidence: 0, details: 'Classifier not initialized' };
     }

     const gamingEvents = this.auditTrail.getEvents({ type: 'gaming-behavior' });
     const recentEvents = this.auditTrail.getEvents({ 
       startTime: new Date(Date.now() - 10 * 60 * 1000).toISOString() // Last 10 minutes
     });
     
     let totalScore = 0;
     let maxWeight = 0;
     const detectedPatterns = [];

     // Check for repeated success patterns
     const successEvents = recentEvents.filter(e => 
       e.outcome && e.outcome.success === true && 
       e.context && e.context.taskType
     );
     
     if (successEvents.length >= this.gamingPatterns.repeatedSuccess.threshold) {
       // Group by task type to see if same type of task is being "gamed"
       const byTaskType = {};
       successEvents.forEach(event => {
         const taskType = event.context.taskType || 'unknown';
         if (!byTaskType[taskType]) byTaskType[taskType] = [];
         byTaskType[taskType].push(event);
       });
       
       for (const taskType in byTaskType) {
         if (byTaskType[taskType].length >= this.gamingPatterns.repeatedSuccess.threshold) {
           const weight = this.gamingPatterns.repeatedSuccess.weight;
           totalScore += weight;
           maxWeight += weight;
           detectedPatterns.push({
             type: 'repeatedSuccess',
             description: `Repeated success in ${taskType} task type (${byTaskType[taskType].length} occurrences)`,
             weight,
             bucket: this.gamingPatterns.repeatedSuccess.bucket
           });
         }
       }
     }

     // Check for trivial fix spam (rapid fire low-impact changes)
     const trivialEvents = recentEvents.filter(e => 
       e.context && 
       (e.context.action?.includes('trivial') || 
        e.context.action?.includes('minor') ||
        e.context.action?.includes('typo')) &&
       e.outcome && e.outcome.success === true
     );
     
     if (trivialEvents.length >= this.gamingPatterns.trivialFixSpam.threshold) {
       const weight = this.gamingPatterns.trivialFixSpam.weight;
       totalScore += weight;
       maxWeight += weight;
       detectedPatterns.push({
         type: 'trivialFixSpam',
         description: `Trivial fix spam detected (${trivialEvents.length} occurrences)`,
         weight,
         bucket: this.gamingPatterns.trivialFixSpam.bucket
       });
     }

     // Check for metric inflation (unnaturally high success rates)
     if (recentEvents.length >= 5) {
       const successCount = recentEvents.filter(e => 
         e.outcome && e.outcome.success === true
       ).length;
       
       const successRate = successCount / recentEvents.length;
       if (successRate > this.gamingPatterns.metricInflation.threshold) {
         const weight = this.gamingPatterns.metricInflation.weight;
         totalScore += weight;
         maxWeight += weight;
         detectedPatterns.push({
           type: 'metricInflation',
           description: `Unnaturally high success rate: ${(successRate * 100).toFixed(1)}%`,
           weight,
           bucket: this.gamingPatterns.metricInflation.bucket
         });
       }
     }

     // Check for tool monopolization (using same tools to avoid challenging work)
     const toolUsage = {};
     recentEvents.forEach(event => {
       if (event.context && event.context.tool) {
         const tool = event.context.tool;
         toolUsage[tool] = (toolUsage[tool] || 0) + 1;
       }
     });
     
     const totalToolUsage = Object.values(toolUsage).reduce((sum, count) => sum + count, 0);
     if (totalToolUsage > 0) {
       for (const tool in toolUsage) {
         const usageRatio = toolUsage[tool] / totalToolUsage;
         if (usageRatio > this.gamingPatterns.toolMonopolization.threshold) {
           const weight = this.gamingPatterns.toolMonopolization.weight;
           totalScore += weight;
           maxWeight += weight;
           detectedPatterns.push({
             type: 'toolMonopolization',
             description: `Tool monopolization: ${tool} used for ${(usageRatio * 100).toFixed(1)}% of operations`,
             weight,
             bucket: this.gamingPatterns.toolMonopolization.bucket
           });
         }
       }
     }

     // Calculate final assessment
     const confidence = maxWeight > 0 ? totalScore / maxWeight : 0;
     const isGaming = confidence > 0.5; // Threshold for considering it gaming behavior
     
     // Determine highest severity bucket (hard-block > review)
     let bucket = null;
     if (detectedPatterns.some(p => p.bucket === 'hard-block')) {
       bucket = 'hard-block';
     } else if (detectedPatterns.some(p => p.bucket === 'review')) {
       bucket = 'review';
     }

     // Add to audit trail if gaming detected
     if (isGaming && detectedPatterns.length > 0) {
       this.auditTrail.addEvent({
         type: 'gaming-behavior',
         severity: bucket === 'hard-block' ? 'high' : 'medium',
         description: `Gaming behavior detected: ${detectedPatterns.map(p => p.description).join('; ')}`,
         context: {
           event: event,
           detectedPatterns,
           confidence,
           sessionId: event.context?.sessionId
         }
       });
     }

     return {
       isGaming,
       bucket,
       confidence: Number(confidence.toFixed(3)),
       details: detectedPatterns
     };
   }

   /**
    * Classify gaming severity into hard-block vs review buckets.
    * @param {Object} gamingAssessment - Output from detectGamingBehavior
    * @returns {Object} Classification with action and reasoning
    */
   classifyGamingSeverity(gamingAssessment) {
     if (!gamingAssessment.isGaming) {
       return {
         action: 'allow',
         reason: 'No gaming behavior detected',
         bucket: null
       };
     }

     switch (gamingAssessment.bucket) {
       case 'hard-block':
         return {
           action: 'block',
           reason: 'High-confidence gaming behavior detected - potential system abuse',
           bucket: 'hard-block',
           confidence: gamingAssessment.confidence
         };
       case 'review':
         return {
           action: 'review',
           reason: 'Medium-confidence gaming behavior detected - manual review recommended',
           bucket: 'review',
           confidence: gamingAssessment.confidence
         };
       default:
         return {
           action: 'allow',
           reason: 'Unclear gaming behavior - defaulting to allow',
           bucket: null,
           confidence: gamingAssessment.confidence
         };
     }
   }

   /**
    * Apply anti-gaming classifier to learning events before processing.
    * @param {Object} event - Learning event to classify
    * @returns {Object} Event with gaming classification applied
    */
   applyAntiGamingFilter(event) {
     // Skip if event is already classified or is an audit event
     if (event._gamingClassified || event.type === 'audit') {
       return event;
     }

     const gamingAssessment = this.detectGamingBehavior(event);
     const classification = this.classifyGamingSeverity(gamingAssessment);

     // Add classification to event
     const classifiedEvent = {
       ...event,
       _gamingClassified: true,
       gamingAssessment,
       gamingClassification: classification
     };

     // Emit hook for gaming detection
     this._emitHook('gamingDetected', {
       event: classifiedEvent,
       assessment: gamingAssessment,
       classification: classification
     });

     return classifiedEvent;
   }

  /**
   * Task 5.x: Apply learning outcomes to routing decisions
   * Translates anti-pattern risk scores into routing overrides
   * 
   * @param {Object} taskContext - Task context from route()
   * @param {Object} advice - Advice from advise() method  
   * @returns {Object} Routing overrides { agentOverride, skillOverride, penalty, reason }
   */
  applyLearningToRouting(taskContext, advice) {
    return this.advisor.applyLearningToRouting(taskContext, advice);
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
