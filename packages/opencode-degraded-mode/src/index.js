/**
 * Degraded-Mode Contract
 * 
 * Replaces silent degraded behavior with explicit degraded-mode state and
 * containment for critical orchestration/routing seams.
 * 
 * Core principle: NO silent fallback on critical routing/orchestration seams.
 * All degraded states must be:
 * 1. Explicitly tracked
 * 2. Structured with severity and containment
 * 3. Observable via events
 * 4. Gated for unsafe operations
 */

const { EventEmitter } = require('events');

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

/**
 * Degraded mode types
 */
const DEGRADED_MODES = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',           // Partial functionality
  STUBBED: 'stubbed',             // Using inline stubs
  DEPENDENCY_MISSING: 'dependency_missing',  // Critical dep unavailable
  CORRUPTED: 'corrupted',         // Config/data corruption
  RATE_LIMITED: 'rate_limited',   // External rate limiting
  BROWNOUT: 'brownout'            // Partial outage
});

/**
 * Containment actions for degraded states
 */
const CONTAINMENT_ACTIONS = Object.freeze({
  NONE: 'none',                   // No containment needed
  LOG_ONLY: 'log_only',           // Log but continue
  FALLBACK_APPROVED: 'fallback_approved',  // Use approved fallback
  FALLBACK_UNAPPROVED: 'fallback_unapproved',  // Use unapproved fallback (warning)
  BLOCK: 'block',                 // Block operation
  QUARANTINE: 'quarantine'        // Isolate and alert
});

/**
 * Severity levels for degraded states
 */
const SEVERITY_LEVELS = Object.freeze({
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
});

/**
 * Affected subsystems
 */
const AFFECTED_SUBSYSTEMS = Object.freeze({
  ROUTING: 'routing',
  LEARNING: 'learning',
  ORCHESTRATION: 'orchestration',
  TELEMETRY: 'telemetry',
  DELEGATION: 'delegation'
});

// ---------------------------------------------------------------------------
// DEGRADED MODE STATE
// ---------------------------------------------------------------------------

/**
 * Represents the degraded-mode state of a single component or dependency.
 * Emits structured events on transitions.
 */
class DegradedModeState extends EventEmitter {
  constructor(initialState = {}) {
    super();
    this._mode = initialState.mode || DEGRADED_MODES.HEALTHY;
    this._severity = initialState.severity || SEVERITY_LEVELS.NONE;
    this._containment = initialState.containment || CONTAINMENT_ACTIONS.NONE;
    this._dependency = initialState.dependency || null;
    this._reason = initialState.reason || null;
    this._remediation = initialState.remediation || null;
    this._affects = initialState.affects || [];
    this._timestamp = new Date().toISOString();
    this._provenance = {
      source: 'degraded-mode-contract',
      version: '1.0.0'
    };
  }

  get mode() { return this._mode; }
  get severity() { return this._severity; }
  get containment() { return this._containment; }
  get dependency() { return this._dependency; }
  get reason() { return this._reason; }
  get remediation() { return this._remediation; }
  get affects() { return this._affects; }
  get timestamp() { return this._timestamp; }
  get provenance() { return this._provenance; }

  /**
   * Transition to a new degraded mode state.
   * @param {string} mode - New mode from DEGRADED_MODES
   * @param {object} options - Transition options
   */
  transition(mode, options = {}) {
    const previousMode = this._mode;
    
    this._mode = mode;
    this._severity = options.severity || this._inferSeverity(mode);
    this._containment = options.containment || this._inferContainment(mode, this._severity);
    this._dependency = options.dependency || this._dependency;
    this._reason = options.reason || this._reason;
    this._remediation = options.remediation || null;
    this._affects = options.affects || this._affects;
    this._timestamp = new Date().toISOString();

    // Emit transition event
    this.emit('transition', {
      from: previousMode,
      to: mode,
      timestamp: this._timestamp,
      severity: this._severity,
      containment: this._containment,
      provenance: this._provenance
    });
  }

  /**
   * Check if learning updates are safe in current state.
   */
  canSafelyUpdateLearning() {
    // Block learning updates in critical states
    if (this._severity === SEVERITY_LEVELS.CRITICAL) return false;
    if (this._mode === DEGRADED_MODES.DEPENDENCY_MISSING) return false;
    if (this._mode === DEGRADED_MODES.CORRUPTED) return false;
    return true;
  }

  /**
   * Check if routing decisions are safe in current state.
   */
  canSafelyRoute() {
    if (this._containment === CONTAINMENT_ACTIONS.BLOCK) return false;
    if (this._severity === SEVERITY_LEVELS.CRITICAL) return false;
    return true;
  }

  /**
   * Get a serializable snapshot of current state.
   */
  toSnapshot() {
    return {
      mode: this._mode,
      severity: this._severity,
      containment: this._containment,
      dependency: this._dependency,
      reason: this._reason,
      remediation: this._remediation,
      affects: this._affects,
      timestamp: this._timestamp,
      provenance: this._provenance
    };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE METHODS
  // ---------------------------------------------------------------------------

  _inferSeverity(mode) {
    const severityMap = {
      [DEGRADED_MODES.HEALTHY]: SEVERITY_LEVELS.NONE,
      [DEGRADED_MODES.DEGRADED]: SEVERITY_LEVELS.MEDIUM,
      [DEGRADED_MODES.STUBBED]: SEVERITY_LEVELS.MEDIUM,
      [DEGRADED_MODES.DEPENDENCY_MISSING]: SEVERITY_LEVELS.CRITICAL,
      [DEGRADED_MODES.CORRUPTED]: SEVERITY_LEVELS.CRITICAL,
      [DEGRADED_MODES.RATE_LIMITED]: SEVERITY_LEVELS.LOW,
      [DEGRADED_MODES.BROWNOUT]: SEVERITY_LEVELS.HIGH
    };
    return severityMap[mode] || SEVERITY_LEVELS.MEDIUM;
  }

  _inferContainment(mode, severity) {
    if (mode === DEGRADED_MODES.HEALTHY) return CONTAINMENT_ACTIONS.NONE;
    if (mode === DEGRADED_MODES.RATE_LIMITED) return CONTAINMENT_ACTIONS.LOG_ONLY;
    if (severity === SEVERITY_LEVELS.CRITICAL) return CONTAINMENT_ACTIONS.BLOCK;
    if (severity === SEVERITY_LEVELS.HIGH) return CONTAINMENT_ACTIONS.FALLBACK_UNAPPROVED;
    if (mode === DEGRADED_MODES.STUBBED) return CONTAINMENT_ACTIONS.FALLBACK_APPROVED;
    return CONTAINMENT_ACTIONS.LOG_ONLY;
  }
}

// ---------------------------------------------------------------------------
// DEGRADED MODE MANAGER
// ---------------------------------------------------------------------------

/**
 * Manages degraded-mode state across multiple dependencies and subsystems.
 * Provides gating for routing and learning operations.
 */
class DegradedModeManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this._dependencies = new Map();
    this._lastEmittedState = null;
    this._oscillationThreshold = options.oscillationThreshold || 3;
    this._oscillationWindow = options.oscillationWindow || 60000; // 1 minute
    this._stateChanges = [];
  }

  /**
   * Report a dependency's status.
   * @param {string} name - Dependency name
   * @param {object} status - Status object with mode, severity, etc.
   */
  reportDependency(name, status) {
    const previousStatus = this._dependencies.get(name);
    
    // Track state change for oscillation detection
    this._trackStateChange(name, status);
    
    this._dependencies.set(name, {
      name,
      status: status.status,
      severity: status.severity,
      reason: status.reason,
      affects: status.affects || [],
      fallbackApproved: status.fallbackApproved || false,
      timestamp: new Date().toISOString()
    });

    // Emit events for significant changes
    if (status.status !== 'healthy') {
      if (!previousStatus || previousStatus.status === 'healthy') {
        this.emit('degraded-mode', createDegradedEvent({
          mode: this._mapStatusToMode(status.status),
          dependency: name,
          severity: status.severity,
          affects: status.affects
        }));
      }
    } else if (previousStatus && previousStatus.status !== 'healthy') {
      this.emit('recovered', {
        dependency: name,
        previousStatus: previousStatus.status,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get overall degraded state across all dependencies.
   */
  getOverallState() {
    let worstMode = DEGRADED_MODES.HEALTHY;
    let worstSeverity = SEVERITY_LEVELS.NONE;
    let worstContainment = CONTAINMENT_ACTIONS.NONE;
    const affectedSubsystems = new Set();

    for (const [name, dep] of this._dependencies) {
      if (dep.status !== 'healthy') {
        const mode = this._mapStatusToMode(dep.status);
        const severity = dep.severity;
        
        // Track worst state
        if (this._compareSeverity(severity, worstSeverity) > 0) {
          worstMode = mode;
          worstSeverity = severity;
          worstContainment = this._inferContainmentForDep(dep);
        }
        
        // Track affected subsystems
        for (const sub of dep.affects) {
          affectedSubsystems.add(sub);
        }
      }
    }

    return {
      mode: worstMode,
      severity: worstSeverity,
      containment: worstContainment,
      affects: Array.from(affectedSubsystems),
      dependencyCount: this._dependencies.size,
      degradedCount: Array.from(this._dependencies.values())
        .filter(d => d.status !== 'healthy').length
    };
  }

  /**
   * Get a snapshot of all dependency states.
   */
  getSnapshot() {
    const dependencies = {};
    for (const [name, dep] of this._dependencies) {
      dependencies[name] = dep;
    }
    return {
      overall: this.getOverallState(),
      dependencies,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check if routing is allowed in current state.
   */
  checkRoutingGate() {
    const overall = this.getOverallState();
    
    // Check if any routing-affecting dependency is degraded
    for (const [name, dep] of this._dependencies) {
      if (dep.affects.includes(AFFECTED_SUBSYSTEMS.ROUTING)) {
        if (dep.status === 'missing' && !dep.fallbackApproved) {
          return {
            allowed: false,
            reason: `Routing blocked: ${name} is unavailable and no approved fallback`,
            fallbackPath: null,
            fallbackUsed: false
          };
        }
        if (dep.status === 'corrupted') {
          return {
            allowed: false,
            reason: `Routing blocked: ${name} is corrupted`,
            fallbackPath: null,
            fallbackUsed: false
          };
        }
      }
    }

    // Check overall state
    if (overall.containment === CONTAINMENT_ACTIONS.BLOCK) {
      return {
        allowed: false,
        reason: `Routing blocked: overall state is ${overall.mode}`,
        fallbackPath: null,
        fallbackUsed: false
      };
    }

    // Allow with fallback if approved
    const hasApprovedFallback = Array.from(this._dependencies.values())
      .some(d => d.affects.includes(AFFECTED_SUBSYSTEMS.ROUTING) && d.fallbackApproved);

    return {
      allowed: true,
      reason: hasApprovedFallback ? 'Routing allowed with approved fallback' : 'Routing healthy',
      fallbackPath: hasApprovedFallback ? 'approved-fallback' : null,
      fallbackUsed: hasApprovedFallback
    };
  }

  /**
   * Check if learning updates are allowed in current state.
   */
  checkLearningGate() {
    const overall = this.getOverallState();
    
    // Block learning updates in critical states
    if (overall.severity === SEVERITY_LEVELS.CRITICAL) {
      return {
        action: CONTAINMENT_ACTIONS.BLOCK,
        reason: 'Learning updates blocked: critical degraded state',
        allowed: false
      };
    }

    // Check if any learning-affecting dependency is degraded
    for (const [name, dep] of this._dependencies) {
      if (dep.affects.includes(AFFECTED_SUBSYSTEMS.LEARNING)) {
        if (dep.status === 'missing' || dep.status === 'corrupted') {
          return {
            action: CONTAINMENT_ACTIONS.BLOCK,
            reason: `Learning updates blocked: ${name} is ${dep.status}`,
            allowed: false
          };
        }
      }
    }

    return {
      action: CONTAINMENT_ACTIONS.NONE,
      reason: 'Learning updates allowed',
      allowed: true
    };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE METHODS
  // ---------------------------------------------------------------------------

  _mapStatusToMode(status) {
    const statusMap = {
      'healthy': DEGRADED_MODES.HEALTHY,
      'degraded': DEGRADED_MODES.DEGRADED,
      'stubbed': DEGRADED_MODES.STUBBED,
      'missing': DEGRADED_MODES.DEPENDENCY_MISSING,
      'corrupted': DEGRADED_MODES.CORRUPTED,
      'rate_limited': DEGRADED_MODES.RATE_LIMITED,
      'brownout': DEGRADED_MODES.BROWNOUT,
      'optional_missing': DEGRADED_MODES.STUBBED
    };
    return statusMap[status] || DEGRADED_MODES.DEGRADED;
  }

  _compareSeverity(a, b) {
    const order = ['none', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(a) - order.indexOf(b);
  }

  _inferContainmentForDep(dep) {
    if (dep.status === 'healthy') return CONTAINMENT_ACTIONS.NONE;
    if (dep.fallbackApproved) return CONTAINMENT_ACTIONS.FALLBACK_APPROVED;
    if (dep.severity === SEVERITY_LEVELS.CRITICAL) return CONTAINMENT_ACTIONS.BLOCK;
    return CONTAINMENT_ACTIONS.LOG_ONLY;
  }

  _trackStateChange(name, status) {
    const now = Date.now();
    this._stateChanges.push({
      name,
      status: status.status,
      timestamp: now
    });

    // Clean up old entries
    this._stateChanges = this._stateChanges.filter(
      c => now - c.timestamp < this._oscillationWindow
    );

    // Check for oscillation
    const recentChanges = this._stateChanges.filter(c => c.name === name);
    if (recentChanges.length >= this._oscillationThreshold) {
      // Emit warning but don't spam
      const lastEmittedKey = `${name}:${status.status}`;
      if (this._lastEmittedState !== lastEmittedKey) {
        this._lastEmittedState = lastEmittedKey;
        this.emit('oscillation-warning', {
          dependency: name,
          changeCount: recentChanges.length,
          windowMs: this._oscillationWindow
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------------------------

/**
 * Classify a dependency's status based on its availability and requirements.
 */
function classifyDependencyStatus(options) {
  const { available, required, fallbackAvailable, fallbackApproved } = options;

  if (available) {
    return {
      status: 'healthy',
      severity: SEVERITY_LEVELS.NONE,
      containment: CONTAINMENT_ACTIONS.NONE
    };
  }

  if (!available && required && !fallbackAvailable) {
    return {
      status: 'missing',
      severity: SEVERITY_LEVELS.CRITICAL,
      containment: CONTAINMENT_ACTIONS.BLOCK
    };
  }

  if (!available && required && fallbackAvailable) {
    return {
      status: 'stubbed',
      severity: fallbackApproved ? SEVERITY_LEVELS.MEDIUM : SEVERITY_LEVELS.HIGH,
      containment: fallbackApproved 
        ? CONTAINMENT_ACTIONS.FALLBACK_APPROVED 
        : CONTAINMENT_ACTIONS.FALLBACK_UNAPPROVED
    };
  }

  if (!available && !required && fallbackAvailable) {
    return {
      status: 'optional_missing',
      severity: SEVERITY_LEVELS.LOW,
      containment: CONTAINMENT_ACTIONS.LOG_ONLY
    };
  }

  return {
    status: 'unknown',
    severity: SEVERITY_LEVELS.MEDIUM,
    containment: CONTAINMENT_ACTIONS.LOG_ONLY
  };
}

/**
 * Create a structured degraded-mode event.
 */
function createDegradedEvent(options) {
  const { mode, dependency, severity, affects, remediation } = options;
  
  // Infer containment from mode and severity
  let containment = CONTAINMENT_ACTIONS.LOG_ONLY;
  if (mode === DEGRADED_MODES.HEALTHY) {
    containment = CONTAINMENT_ACTIONS.NONE;
  } else if (mode === DEGRADED_MODES.DEPENDENCY_MISSING || mode === DEGRADED_MODES.CORRUPTED) {
    containment = CONTAINMENT_ACTIONS.BLOCK;
  } else if (mode === DEGRADED_MODES.STUBBED) {
    containment = CONTAINMENT_ACTIONS.FALLBACK_APPROVED;
  }

  return {
    id: `degraded_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    mode,
    dependency,
    severity,
    containment,
    affects: affects || [],
    remediation,
    provenance: {
      source: 'degraded-mode-contract',
      version: '1.0.0'
    }
  };
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  // Classes
  DegradedModeState,
  DegradedModeManager,
  
  // Constants
  DEGRADED_MODES,
  CONTAINMENT_ACTIONS,
  SEVERITY_LEVELS,
  AFFECTED_SUBSYSTEMS,
  
  // Helper functions
  classifyDependencyStatus,
  createDegradedEvent
};
