'use strict';

/**
 * opencode-delegation-liveness
 * 
 * Delegation liveness detection and progress tracking.
 * 
 * This module defines the contract for detecting stalled delegations,
 * tracking progress signals, and classifying task states.
 * 
 * Classification taxonomy:
 * - healthy: Task is making progress
 * - slow: Task is running but slower than expected
 * - stalled: No progress detected within timeout
 * - failed: Task has failed
 * - waiting-on-human: Task is blocked waiting for human input
 * 
 * Progress signals vary by task category:
 * - deep/ultrabrain: Tool invocations, file reads/writes
 * - quick: Completion within expected time
 * - visual-engineering: Browser interactions, screenshots
 * - background: Heartbeat updates, status checks
 */

// Task state classification
const TASK_STATES = {
  HEALTHY: 'healthy',
  SLOW: 'slow',
  STALLED: 'stalled',
  FAILED: 'failed',
  WAITING_ON_HUMAN: 'waiting-on-human',
  UNKNOWN: 'unknown'
};

// Progress signal types
const PROGRESS_SIGNALS = {
  TOOL_INVOCATION: 'tool-invocation',
  FILE_READ: 'file-read',
  FILE_WRITE: 'file-write',
  BASH_COMMAND: 'bash-command',
  BROWSER_ACTION: 'browser-action',
  HEARTBEAT: 'heartbeat',
  STATUS_UPDATE: 'status-update',
  SUBAGENT_SPAWN: 'subagent-spawn',
  SUBAGENT_COMPLETE: 'subagent-complete',
  ERROR: 'error',
  HUMAN_INPUT_REQUIRED: 'human-input-required'
};

// Category-specific timeout defaults (in milliseconds)
const CATEGORY_TIMEOUTS = {
  'quick': 30000,           // 30 seconds
  'unspecified-low': 60000, // 1 minute
  'deep': 300000,           // 5 minutes
  'ultrabrain': 600000,     // 10 minutes
  'visual-engineering': 180000, // 3 minutes
  'artistry': 300000,       // 5 minutes
  'unspecified-high': 300000, // 5 minutes
  'writing': 120000,        // 2 minutes
  'default': 120000         // 2 minutes default
};

// Slow detection thresholds (percentage of timeout)
const SLOW_THRESHOLDS = {
  'quick': 0.5,             // Flag as slow at 50% of timeout
  'deep': 0.7,              // Flag as slow at 70% of timeout
  'ultrabrain': 0.8,        // Flag as slow at 80% of timeout
  'default': 0.6            // Default 60%
};

/**
 * ProgressTracker tracks progress signals for a delegation.
 */
class ProgressTracker {
  constructor(options = {}) {
    this.taskId = options.taskId || `task-${Date.now()}`;
    this.category = options.category || 'default';
    this.startedAt = options.startedAt || Date.now();
    this.signals = [];
    this.lastProgressAt = this.startedAt;
    this.state = TASK_STATES.HEALTHY;
    this.metadata = options.metadata || {};
  }

  /**
   * Record a progress signal.
   * 
   * @param {string} signalType - Type of progress signal
   * @param {object} details - Additional details about the signal
   */
  recordProgress(signalType, details = {}) {
    const now = Date.now();
    const signal = {
      type: signalType,
      timestamp: now,
      elapsed: now - this.startedAt,
      details
    };
    
    this.signals.push(signal);
    this.lastProgressAt = now;
    
    // Reset state to healthy on progress
    if (this.state === TASK_STATES.SLOW || this.state === TASK_STATES.UNKNOWN) {
      this.state = TASK_STATES.HEALTHY;
    }
    
    return signal;
  }

  /**
   * Get the time since last progress signal.
   */
  getTimeSinceLastProgress() {
    return Date.now() - this.lastProgressAt;
  }

  /**
   * Get the total elapsed time.
   */
  getElapsedTime() {
    return Date.now() - this.startedAt;
  }

  /**
   * Get the timeout for this task's category.
   */
  getTimeout() {
    return CATEGORY_TIMEOUTS[this.category] || CATEGORY_TIMEOUTS.default;
  }

  /**
   * Get the slow threshold for this task's category.
   */
  getSlowThreshold() {
    const threshold = SLOW_THRESHOLDS[this.category] || SLOW_THRESHOLDS.default;
    return this.getTimeout() * threshold;
  }

  /**
   * Evaluate the current state of this task.
   * 
   * @returns {object} State evaluation result
   */
  evaluateState() {
    const elapsed = this.getElapsedTime();
    const sinceProgress = this.getTimeSinceLastProgress();
    const timeout = this.getTimeout();
    const slowThreshold = this.getSlowThreshold();

    // Check for explicit failure
    const lastError = this.signals.filter(s => s.type === PROGRESS_SIGNALS.ERROR).pop();
    if (lastError) {
      this.state = TASK_STATES.FAILED;
      return {
        state: TASK_STATES.FAILED,
        reason: 'error-signal',
        lastError: lastError.details,
        elapsed,
        sinceProgress
      };
    }

    // Check for waiting on human
    const humanInputRequired = this.signals.filter(s => s.type === PROGRESS_SIGNALS.HUMAN_INPUT_REQUIRED).pop();
    if (humanInputRequired) {
      this.state = TASK_STATES.WAITING_ON_HUMAN;
      return {
        state: TASK_STATES.WAITING_ON_HUMAN,
        reason: 'human-input-required',
        elapsed,
        sinceProgress
      };
    }

    // Check for stalled (no progress for full timeout)
    if (sinceProgress >= timeout) {
      this.state = TASK_STATES.STALLED;
      return {
        state: TASK_STATES.STALLED,
        reason: 'no-progress-timeout',
        timeout,
        elapsed,
        sinceProgress
      };
    }

    // Check for slow (approaching timeout)
    if (elapsed >= slowThreshold && sinceProgress > slowThreshold * 0.5) {
      this.state = TASK_STATES.SLOW;
      return {
        state: TASK_STATES.SLOW,
        reason: 'approaching-timeout',
        slowThreshold,
        elapsed,
        sinceProgress
      };
    }

    // Otherwise healthy
    this.state = TASK_STATES.HEALTHY;
    return {
      state: TASK_STATES.HEALTHY,
      reason: 'progress-observed',
      elapsed,
      sinceProgress
    };
  }

  /**
   * Get a summary of this task's progress.
   */
  getSummary() {
    return {
      taskId: this.taskId,
      category: this.category,
      state: this.state,
      startedAt: this.startedAt,
      elapsed: this.getElapsedTime(),
      sinceProgress: this.getTimeSinceLastProgress(),
      signalCount: this.signals.length,
      lastSignalType: this.signals.length > 0 ? this.signals[this.signals.length - 1].type : null
    };
  }
}

/**
 * LivenessDetector manages progress tracking for multiple delegations.
 */
class LivenessDetector {
  constructor(options = {}) {
    this.trackers = new Map();
    this.options = options;
  }

  /**
   * Start tracking a new delegation.
   */
  startTracking(taskId, options = {}) {
    const tracker = new ProgressTracker({
      taskId,
      ...this.options,
      ...options
    });
    this.trackers.set(taskId, tracker);
    return tracker;
  }

  /**
   * Record progress for a task.
   */
  recordProgress(taskId, signalType, details = {}) {
    const tracker = this.trackers.get(taskId);
    if (!tracker) {
      return null;
    }
    return tracker.recordProgress(signalType, details);
  }

  /**
   * Evaluate all tracked tasks.
   */
  evaluateAll() {
    const results = [];
    for (const [taskId, tracker] of this.trackers) {
      results.push({
        taskId,
        ...tracker.evaluateState()
      });
    }
    return results;
  }

  /**
   * Get stalled tasks.
   */
  getStalledTasks() {
    return this.evaluateAll().filter(r => r.state === TASK_STATES.STALLED);
  }

  /**
   * Get slow tasks.
   */
  getSlowTasks() {
    return this.evaluateAll().filter(r => r.state === TASK_STATES.SLOW);
  }

  /**
   * Stop tracking a task.
   */
  stopTracking(taskId) {
    return this.trackers.delete(taskId);
  }

  /**
   * Get a specific tracker.
   */
  getTracker(taskId) {
    return this.trackers.get(taskId);
  }
}

/**
 * Classify a task's state based on progress signals and time.
 * This is a pure function for use in tests and governance checks.
 * 
 * @param {object} options - Classification options
 * @param {string} options.category - Task category
 * @param {number} options.elapsed - Elapsed time in ms
 * @param {number} options.sinceProgress - Time since last progress in ms
 * @param {boolean} options.hasError - Whether an error occurred
 * @param {boolean} options.waitingOnHuman - Whether waiting for human input
 * @returns {object} Classification result
 */
function classifyTaskState(options = {}) {
  const {
    category = 'default',
    elapsed = 0,
    sinceProgress = 0,
    hasError = false,
    waitingOnHuman = false
  } = options;

  if (hasError) {
    return {
      state: TASK_STATES.FAILED,
      reason: 'error-signal'
    };
  }

  if (waitingOnHuman) {
    return {
      state: TASK_STATES.WAITING_ON_HUMAN,
      reason: 'human-input-required'
    };
  }

  const timeout = CATEGORY_TIMEOUTS[category] || CATEGORY_TIMEOUTS.default;
  const slowThreshold = timeout * (SLOW_THRESHOLDS[category] || SLOW_THRESHOLDS.default);

  if (sinceProgress >= timeout) {
    return {
      state: TASK_STATES.STALLED,
      reason: 'no-progress-timeout',
      timeout
    };
  }

  if (elapsed >= slowThreshold && sinceProgress > slowThreshold * 0.5) {
    return {
      state: TASK_STATES.SLOW,
      reason: 'approaching-timeout',
      slowThreshold
    };
  }

  return {
    state: TASK_STATES.HEALTHY,
    reason: 'progress-observed'
  };
}

module.exports = {
  TASK_STATES,
  PROGRESS_SIGNALS,
  CATEGORY_TIMEOUTS,
  SLOW_THRESHOLDS,
  ProgressTracker,
  LivenessDetector,
  classifyTaskState
};
