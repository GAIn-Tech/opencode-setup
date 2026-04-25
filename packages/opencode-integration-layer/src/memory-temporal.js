'use strict';

/**
 * Temporal Intelligence Layer.
 *
 * Analyzes memory access patterns over time:
 * - Access frequency: how often a memory is accessed
 * - Access velocity: rate of access changes
 * - Temporal clustering: memories accessed together in time windows
 * - Optimal recall window: when to surface memories based on access patterns
 */

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Record a memory access event.
 *
 * @param {object} accessLog - In-memory access log (Map of memoryId → timestamps[])
 * @param {string} memoryId - Memory ID
 * @param {number} [timestamp] - Access time (ms epoch, default: now)
 */
function recordAccess(accessLog, memoryId, timestamp = Date.now()) {
  if (!accessLog instanceof Map) {
    throw new Error('[Temporal] accessLog must be a Map');
  }

  if (!accessLog.has(memoryId)) {
    accessLog.set(memoryId, []);
  }

  accessLog.get(memoryId).push(timestamp);
}

/**
 * Compute access frequency for a memory (accesses per day).
 *
 * @param {string[]} timestamps - Array of access timestamps (ms epoch)
 * @param {number} [windowDays] - Analysis window in days (default: 30)
 * @returns {number} Accesses per day
 */
function computeAccessFrequency(timestamps, windowDays = 30) {
  if (!Array.isArray(timestamps) || timestamps.length === 0) {
    return 0;
  }

  const now = Date.now();
  const windowMs = windowDays * MS_PER_DAY;
  const cutoff = now - windowMs;

  const recentAccesses = timestamps.filter((t) => t >= cutoff);
  if (recentAccesses.length === 0) {
    return 0;
  }

  // Find time span
  const oldest = Math.min(...recentAccesses);
  const spanDays = Math.max(1, (now - oldest) / MS_PER_DAY);

  return Math.round((recentAccesses.length / spanDays) * 100) / 100;
}

/**
 * Compute access velocity (rate of change in access frequency).
 * Positive = increasing access, Negative = decreasing.
 *
 * @param {string[]} timestamps - Array of access timestamps
 * @param {number} [windowDays] - Analysis window (default: 30)
 * @returns {number} Velocity (accesses/day change per day)
 */
function computeAccessVelocity(timestamps, windowDays = 30) {
  if (!Array.isArray(timestamps) || timestamps.length < 4) {
    return 0;
  }

  const halfWindow = Math.floor(windowDays / 2);
  const now = Date.now();

  // Split into two halves
  const firstHalf = timestamps.filter(
    (t) => t >= now - windowDays * MS_PER_DAY && t < now - halfWindow * MS_PER_DAY,
  );
  const secondHalf = timestamps.filter((t) => t >= now - halfWindow * MS_PER_DAY);

  const freqFirst = computeAccessFrequency(firstHalf, halfWindow || 1);
  const freqSecond = computeAccessFrequency(secondHalf, halfWindow || 1);

  // Velocity = change in frequency over time
  return Math.round((freqSecond - freqFirst) * 100) / 100;
}

/**
 * Find temporal clusters (memories accessed within time windows).
 *
 * @param {Array<{memoryId: string, timestamp: number}>} events - Access events
 * @param {number} [clusterWindowMs] - Window for clustering (default: 5 minutes)
 * @returns {Array<Array<{memoryId: string, timestamp: number}>>} Clusters
 */
function findTemporalClusters(events, clusterWindowMs = 5 * MS_PER_HOUR) {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }

  // Sort by timestamp
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  const clusters = [];
  let currentCluster = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].timestamp;
    const curr = sorted[i].timestamp;

    if (curr - prev <= clusterWindowMs) {
      currentCluster.push(sorted[i]);
    } else {
      clusters.push(currentCluster);
      currentCluster = [sorted[i]];
    }
  }

  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  return clusters;
}

/**
 * Compute optimal recall window for a memory.
 * Returns hours until next optimal recall time, or 0 if recently accessed.
 *
 * @param {string[]} timestamps - Access timestamps
 * @param {string} retention - Memory retention type
 * @param {number} [baseIntervalHours] - Base recall interval (default: 24)
 * @returns {number} Hours until next optimal recall (0 = recently accessed)
 */
function computeOptimalRecallWindow(timestamps, retention, baseIntervalHours = 24) {
  if (!Array.isArray(timestamps) || timestamps.length === 0) {
    return 0; // Never accessed → surface immediately
  }

  const now = Date.now();
  const lastAccess = Math.max(...timestamps);
  const hoursSinceAccess = (now - lastAccess) / MS_PER_HOUR;

  // Core memories: recall every 48 hours
  if (retention === 'core') {
    return Math.max(0, 48 - hoursSinceAccess);
  }

  // Perishable: more frequent recall, decay over time
  if (retention === 'perishable') {
    const decayFactor = Math.max(0.5, 1 - timestamps.length * 0.05);
    const interval = baseIntervalHours * decayFactor;
    return Math.max(0, interval - hoursSinceAccess);
  }

  // Ephemeral: very frequent recall
  if (retention === 'ephemeral') {
    return Math.max(0, 4 - hoursSinceAccess);
  }

  return Math.max(0, baseIntervalHours - hoursSinceAccess);
}

/**
 * Get temporal stats for a memory.
 *
 * @param {string[]} timestamps - Access timestamps
 * @param {string} retention - Retention type
 * @returns {object} Temporal statistics
 */
function getTemporalStats(timestamps, retention) {
  const frequency = computeAccessFrequency(timestamps);
  const velocity = computeAccessVelocity(timestamps);
  const recallWindow = computeOptimalRecallWindow(timestamps, retention);

  return {
    accessCount: timestamps.length,
    frequency,
    velocity,
    recallWindowHours: recallWindow,
    lastAccess: timestamps.length > 0 ? Math.max(...timestamps) : null,
    firstAccess: timestamps.length > 0 ? Math.min(...timestamps) : null,
  };
}

module.exports = {
  recordAccess,
  computeAccessFrequency,
  computeAccessVelocity,
  findTemporalClusters,
  computeOptimalRecallWindow,
  getTemporalStats,
  MS_PER_HOUR,
  MS_PER_DAY,
};