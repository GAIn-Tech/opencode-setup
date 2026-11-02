/**
 * @fileoverview Constants for opencode-model-manager
 *
 * Centralized magic numbers to improve maintainability and enable
 * easy configuration changes across the codebase.
 *
 * @module constants
 */

'use strict';

// ============================================================================
// Adapter Timeouts
// ============================================================================

/** Default request timeout for provider adapters (10 seconds) */
const ADAPTER_TIMEOUT_MS = 10000;

/** Timeout for assessment operations (30 seconds) */
const ASSESSMENT_TIMEOUT_MS = 30000;

// ============================================================================
// Pagination
// ============================================================================

/** Default page size for Google API pagination */
const GOOGLE_API_PAGE_SIZE = 100;

// ============================================================================
// Retry Configuration
// ============================================================================

/** Base delay for exponential backoff (250ms) */
const RETRY_BASE_DELAY_MS = 250;

/** Maximum delay for exponential backoff (2 seconds) */
const RETRY_MAX_DELAY_MS = 2000;

/** Default jitter range for retry delays (50ms) */
const RETRY_JITTER_MS = 50;

/** Default maximum retry attempts */
const RETRY_MAX_ATTEMPTS = 3;

// ============================================================================
// Cache Configuration
// ============================================================================

/** L1 cache TTL (5 minutes in milliseconds) */
const CACHE_L1_TTL_MS = 5 * 60 * 1000;

/** L2 cache TTL (1 hour in milliseconds) */
const CACHE_L2_TTL_MS = 60 * 60 * 1000;

/** Default cache cleanup interval (1 minute) */
const CACHE_CLEANUP_INTERVAL_MS = 60000;

// ============================================================================
// Circuit Breaker
// ============================================================================

/** Circuit breaker reset timeout (30 seconds) */
const CIRCUIT_BREAKER_RESET_MS = 30000;

// ============================================================================
// Assessment
// ============================================================================

/** Score percentage multiplier for normalization */
const SCORE_PERCENTAGE_MULTIPLIER = 100;

/** Cache TTL for assessment results (5 minutes) */
const ASSESSMENT_CACHE_TTL_MS = 300000;

// ============================================================================
// Audit Logging
// ============================================================================

/** Maximum audit events before rotation */
const MAX_AUDIT_EVENTS = 10000;

/** Maximum events in metrics collector */
const MAX_METRICS_EVENTS = 10000;

// ============================================================================
// Process Management
// ============================================================================

/** SIGKILL grace period (5 seconds) */
const SIGKILL_GRACE_PERIOD_MS = 5000;

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Timeouts
  ADAPTER_TIMEOUT_MS,
  ASSESSMENT_TIMEOUT_MS,

  // Pagination
  GOOGLE_API_PAGE_SIZE,

  // Retry
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  RETRY_JITTER_MS,
  RETRY_MAX_ATTEMPTS,

  // Cache
  CACHE_L1_TTL_MS,
  CACHE_L2_TTL_MS,
  CACHE_CLEANUP_INTERVAL_MS,

  // Circuit Breaker
  CIRCUIT_BREAKER_RESET_MS,

  // Assessment
  SCORE_PERCENTAGE_MULTIPLIER,
  ASSESSMENT_CACHE_TTL_MS,

  // Audit
  MAX_AUDIT_EVENTS,
  MAX_METRICS_EVENTS,

  // Process
  SIGKILL_GRACE_PERIOD_MS
};
