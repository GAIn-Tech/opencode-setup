'use strict';

/**
 * severity.js — Multi-factor severity scoring engine for Memory Graph v3.0
 *
 * Deterministic scoring: same (error, context) → same score, always.
 * No randomness, no time-dependent factors — all temporal data comes
 * from the context object passed by the caller.
 *
 * Score range: 0–100, capped.
 *
 * Factor breakdown:
 *   Keyword severity:  0–30  (matches against error message keywords)
 *   Frequency:         0–20  (occurrences in last hour, scaled)
 *   Blast radius:      5–15  (sessions affected — minimum 5 baseline)
 *   Persistence:       0–15  (recurring across sessions)
 *   Co-occurrence:     0–15  (triggers other errors)
 *   Subtotal:          5–95  (before capping)
 */

// ═══════════════════════════════════════════════════════════════════════════
//  Keyword Severity Table
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Keyword → severity weight (0–30).
 * Checked against error.message. Highest matching keyword wins.
 */
const KEYWORD_SCORES = {
  // Critical (25–30)
  FATAL: 30,
  panic: 28,
  SIGSEGV: 28,
  SIGKILL: 27,
  crash: 25,
  crashed: 25,
  abort: 22,
  aborted: 22,

  // High (15–20)
  ECONNREFUSED: 18,
  ENOTFOUND: 16,
  ECONNRESET: 16,
  EACCES: 15,
  EPERM: 15,
  PermissionDenied: 15,

  // Medium (8–14)
  TypeError: 12,
  ReferenceError: 12,
  SyntaxError: 12,
  ENOENT: 11,
  ETIMEOUT: 10,
  ModuleNotFound: 10,
  timeout: 8,

  // Low (3–7)
  Error: 5,
  exception: 5,
  rejected: 5,
  failed: 4,
  CommandNotFound: 4,
  warning: 3,
};

/**
 * Cached regexes for keyword matching (built once).
 * Sorted longest-first so more-specific keywords match before generic ones.
 * @type {{ regex: RegExp, weight: number }[]}
 */
const _keywordMatchers = Object.entries(KEYWORD_SCORES)
  .sort((a, b) => b[0].length - a[0].length) // longest keyword first
  .map(([keyword, weight]) => ({
    regex: new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
    weight,
  }));

// ═══════════════════════════════════════════════════════════════════════════
//  Scoring Functions (pure, stateless)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute keyword severity factor (0–30).
 * Takes the highest matching keyword score.
 *
 * @param {string} message
 * @returns {number}
 */
function _scoreKeyword(message) {
  if (!message) return 0;
  let max = 0;
  for (const { regex, weight } of _keywordMatchers) {
    if (regex.test(message)) {
      if (weight > max) max = weight;
      // Keep going — we want the absolute max, not first match
    }
  }
  return Math.min(max, 30);
}

/**
 * Compute frequency factor (0–20).
 * Logarithmic scaling: 1→2, 5→8, 10→13, 50→20, 100→20.
 *
 * @param {number} occurrencesLastHour
 * @returns {number}
 */
function _scoreFrequency(occurrencesLastHour) {
  if (!occurrencesLastHour || occurrencesLastHour <= 0) return 0;
  // log2(n) * 4, capped at 20
  const raw = Math.log2(occurrencesLastHour + 1) * 4;
  return Math.min(Math.round(raw), 20);
}

/**
 * Compute blast radius factor (5–15).
 * Minimum baseline of 5 (every error affects at least its own session).
 * Linear scaling: 1 session=5, 5 sessions=9, 10+=15.
 *
 * @param {number} sessionsAffected
 * @returns {number}
 */
function _scoreBlastRadius(sessionsAffected) {
  const count = sessionsAffected || 0;
  if (count <= 0) return 5; // minimum baseline
  // 5 + count scaled to fill 5→15
  return Math.min(5 + Math.round(count), 15);
}

/**
 * Compute persistence factor (0–15).
 * How many sessions show this error recurring?
 * Linear: 0→0, 1→3, 3→9, 5+→15.
 *
 * @param {number} recurringSessions
 * @returns {number}
 */
function _scorePersistence(recurringSessions) {
  const count = recurringSessions || 0;
  if (count <= 0) return 0;
  return Math.min(Math.round(count * 3), 15);
}

/**
 * Compute co-occurrence factor (0–15).
 * How many other error types co-occur with this one?
 * Linear: 0→0, 1→3, 3→9, 5+→15.
 *
 * @param {number} coOccurrences
 * @returns {number}
 */
function _scoreCoOccurrence(coOccurrences) {
  const count = coOccurrences || 0;
  if (count <= 0) return 0;
  return Math.min(Math.round(count * 3), 15);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute overall severity score for an error in context.
 * Deterministic: same inputs → same output.
 *
 * @param {{ message?: string, error_type?: string }} error
 * @param {{ occurrencesLastHour?: number, sessionsAffected?: number, recurringSessions?: number, coOccurrences?: number }} [context]
 * @returns {number} Score 0–100
 */
function score(error, context) {
  const ctx = context || {};
  const message = (error && error.message) || '';

  const keyword = _scoreKeyword(message);
  const frequency = _scoreFrequency(ctx.occurrencesLastHour);
  const blastRadius = _scoreBlastRadius(ctx.sessionsAffected);
  const persistence = _scorePersistence(ctx.recurringSessions);
  const coOccurrence = _scoreCoOccurrence(ctx.coOccurrences);

  const total = keyword + frequency + blastRadius + persistence + coOccurrence;
  return Math.min(total, 100);
}

module.exports = {
  score,
  KEYWORD_SCORES,
  // Exposed for testing / introspection
  _scoreKeyword,
  _scoreFrequency,
  _scoreBlastRadius,
  _scorePersistence,
  _scoreCoOccurrence,
};
