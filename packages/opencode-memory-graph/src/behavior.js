'use strict';

/**
 * behavior.js — Pattern detection for Memory Graph v3.0
 *
 * Purely functional approach: all state is passed in and returned (no mutation).
 * Uses a ring-buffer model with 1-minute buckets over a 10-minute lookback window.
 *
 * Behavior classifications:
 *   'transient'    — single occurrence, likely one-off
 *   'intermittent' — appears in some buckets but with gaps
 *   'persistent'   — appears in most/all buckets (continuous)
 *   'resolved'     — was tracked but no longer appears in the window
 */

// ═══════════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════════

const WINDOW_SIZE_MINUTES = 10;
const BUCKET_SIZE_MS = 60 * 1000; // 1 minute per bucket
const WINDOW_SIZE_MS = WINDOW_SIZE_MINUTES * BUCKET_SIZE_MS;

// Thresholds for behavior classification
const PERSISTENT_BUCKET_RATIO = 0.6;  // ≥60% of buckets filled → persistent
const INTERMITTENT_MIN_BUCKETS = 2;   // ≥2 distinct buckets → intermittent
const RECOVERY_QUIET_MS = 5 * BUCKET_SIZE_MS; // 5 min of quiet → recovery

// ═══════════════════════════════════════════════════════════════════════════
//  State Shape
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tracker state shape:
 * {
 *   errors: {
 *     [errorId: string]: {
 *       timestamps: number[],      // raw timestamps of all tracked events
 *       firstSeen: number,         // earliest timestamp
 *       lastSeen: number,          // most recent timestamp
 *     }
 *   }
 * }
 *
 * Keeping raw timestamps (instead of pre-bucketed) allows flexible re-analysis
 * from any reference time. The bucketing is done at analysis time.
 */

// ═══════════════════════════════════════════════════════════════════════════
//  Internal Helpers (pure functions)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert timestamps to bucket indices relative to a reference time.
 * Bucket 0 is the most recent, bucket (WINDOW_SIZE_MINUTES - 1) is the oldest.
 *
 * @param {number[]} timestamps
 * @param {number} refTime  Reference time (typically Date.now())
 * @returns {Set<number>}   Set of bucket indices that have at least one event
 */
function _toBuckets(timestamps, refTime) {
  const buckets = new Set();
  const windowStart = refTime - WINDOW_SIZE_MS;

  for (const ts of timestamps) {
    if (ts < windowStart || ts > refTime) continue;
    const age = refTime - ts;
    const bucketIdx = Math.floor(age / BUCKET_SIZE_MS);
    if (bucketIdx >= 0 && bucketIdx < WINDOW_SIZE_MINUTES) {
      buckets.add(bucketIdx);
    }
  }

  return buckets;
}

/**
 * Count events within the lookback window.
 *
 * @param {number[]} timestamps
 * @param {number} refTime
 * @returns {number}
 */
function _countInWindow(timestamps, refTime) {
  const windowStart = refTime - WINDOW_SIZE_MS;
  let count = 0;
  for (const ts of timestamps) {
    if (ts >= windowStart && ts <= refTime) count++;
  }
  return count;
}

/**
 * Get the most recent timestamp within the window.
 *
 * @param {number[]} timestamps
 * @param {number} refTime
 * @returns {number|null}
 */
function _latestInWindow(timestamps, refTime) {
  const windowStart = refTime - WINDOW_SIZE_MS;
  let latest = null;
  for (const ts of timestamps) {
    if (ts >= windowStart && ts <= refTime) {
      if (latest === null || ts > latest) latest = ts;
    }
  }
  return latest;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Public API (purely functional)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new empty tracker state.
 * @returns {{ errors: {} }}
 */
function createTracker() {
  return { errors: {} };
}

/**
 * Track an error event. Returns NEW state (immutable).
 *
 * @param {{ errors: object }} state  Current tracker state
 * @param {string} errorId           Error identifier
 * @param {number} timestamp         Event timestamp (ms since epoch)
 * @returns {{ errors: object }}     New state with event recorded
 */
function track(state, errorId, timestamp) {
  const existing = state.errors[errorId];
  const newEntry = existing
    ? {
        timestamps: [...existing.timestamps, timestamp],
        firstSeen: Math.min(existing.firstSeen, timestamp),
        lastSeen: Math.max(existing.lastSeen, timestamp),
      }
    : {
        timestamps: [timestamp],
        firstSeen: timestamp,
        lastSeen: timestamp,
      };

  return {
    errors: {
      ...state.errors,
      [errorId]: newEntry,
    },
  };
}

/**
 * Analyze the behavior pattern of an error.
 *
 * @param {{ errors: object }} state  Tracker state
 * @param {string} errorId           Error to analyze
 * @param {number} [refTime]         Reference time (default: Date.now())
 * @returns {'transient' | 'intermittent' | 'persistent' | 'resolved'}
 */
function analyze(state, errorId, refTime) {
  const ref = refTime || Date.now();
  const entry = state.errors[errorId];

  // Never tracked → treat as transient (no data)
  if (!entry || entry.timestamps.length === 0) {
    return 'transient';
  }

  const inWindow = _countInWindow(entry.timestamps, ref);

  // No events in current window → resolved
  if (inWindow === 0) {
    return 'resolved';
  }

  // Single event in window → transient
  if (inWindow === 1) {
    return 'transient';
  }

  // Multiple events: check bucket spread
  const buckets = _toBuckets(entry.timestamps, ref);
  const filledRatio = buckets.size / WINDOW_SIZE_MINUTES;

  if (filledRatio >= PERSISTENT_BUCKET_RATIO) {
    return 'persistent';
  }

  if (buckets.size >= INTERMITTENT_MIN_BUCKETS) {
    return 'intermittent';
  }

  // Multiple events but all in same bucket → still transient (burst)
  return 'transient';
}

/**
 * Detect whether an error has recovered (stopped occurring).
 * Recovery = error was seen in the window but NOT in the last RECOVERY_QUIET_MS.
 *
 * @param {{ errors: object }} state  Tracker state
 * @param {string} errorId           Error to check
 * @param {number} [refTime]         Reference time (default: Date.now())
 * @returns {boolean}                True if recovery detected
 */
function detectRecovery(state, errorId, refTime) {
  const ref = refTime || Date.now();
  const entry = state.errors[errorId];

  // Never tracked → no recovery to detect
  if (!entry || entry.timestamps.length === 0) {
    return false;
  }

  const latest = _latestInWindow(entry.timestamps, ref);

  // No events in window → not recovery (it's fully resolved, not recovering)
  if (latest === null) {
    return false;
  }

  // Events exist in window, but none in the last RECOVERY_QUIET_MS → recovery
  const quietStart = ref - RECOVERY_QUIET_MS;
  if (latest < quietStart) {
    return true;
  }

  return false;
}

module.exports = {
  createTracker,
  track,
  analyze,
  detectRecovery,
  WINDOW_SIZE_MINUTES,
  // Exposed for advanced use / testing
  _toBuckets,
  _countInWindow,
  _latestInWindow,
  BUCKET_SIZE_MS,
  WINDOW_SIZE_MS,
  PERSISTENT_BUCKET_RATIO,
  INTERMITTENT_MIN_BUCKETS,
  RECOVERY_QUIET_MS,
};
