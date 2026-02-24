'use strict';

const { EventEmitter } = require('events');

const DEFAULT_THRESHOLD = 5;
const DEFAULT_TIMEOUT_MS = 60000;

const CIRCUIT_STATES = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
});

class CircuitBreakerOpenError extends Error {
  /**
   * @param {string} name
   * @param {'OPEN'|'HALF_OPEN'} state
   * @param {number} retryAfterMs
   */
  constructor(name, state, retryAfterMs = 0) {
    const retrySuffix = retryAfterMs > 0
      ? ` Retry after ${Math.ceil(retryAfterMs / 1000)}s.`
      : '';
    super(`Circuit breaker "${name}" is ${state}.${retrySuffix}`);
    this.name = 'CircuitBreakerOpenError';
    this.circuitName = name;
    this.state = state;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Generic circuit breaker for provider discovery/model operations.
 *
 * Events:
 * - open(payload)
 * - half-open(payload)
 * - close(payload)
 */
class CircuitBreaker extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.threshold=5] - Consecutive failures before OPEN.
   * @param {number} [options.timeout=60000] - OPEN duration before HALF_OPEN trial.
   * @param {string} [options.name='circuit-breaker'] - Human-readable breaker name.
   */
  constructor(options = {}) {
    super();

    this.name = typeof options.name === 'string' && options.name.length > 0
      ? options.name
      : 'circuit-breaker';
    this.threshold = this._coerceThreshold(options.threshold);
    this.timeout = this._coerceTimeout(options.timeout);

    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.openedAt = 0;
    this.halfOpenInFlight = false;
  }

  /**
   * Execute an operation with circuit protection.
   *
   * @template T
   * @param {() => Promise<T>|T} fn
   * @returns {Promise<T>}
   */
  async execute(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('CircuitBreaker.execute(fn) requires a function');
    }

    this._transitionOpenToHalfOpenIfReady();

    if (this.state === CIRCUIT_STATES.OPEN) {
      throw this._createOpenError();
    }

    if (this.state === CIRCUIT_STATES.HALF_OPEN && this.halfOpenInFlight) {
      throw this._createHalfOpenInFlightError();
    }

    const isHalfOpenProbe = this.state === CIRCUIT_STATES.HALF_OPEN;
    if (isHalfOpenProbe) {
      this.halfOpenInFlight = true;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    } finally {
      if (isHalfOpenProbe) {
        this.halfOpenInFlight = false;
      }
    }
  }

  /**
   * Circuit breaker hook-compatible success signal.
   *
   * @param {string} [targetId]
   */
  recordSuccess(targetId) {
    void targetId;
    this.failureCount = 0;

    if (this.state === CIRCUIT_STATES.HALF_OPEN || this.state === CIRCUIT_STATES.OPEN) {
      this._transitionTo(CIRCUIT_STATES.CLOSED);
    }
  }

  /**
   * Circuit breaker hook-compatible failure signal.
   *
   * @param {string} [targetId]
   * @param {object|number} [errorOrRetryAfterMs]
   */
  recordFailure(targetId, errorOrRetryAfterMs) {
    void targetId;
    void errorOrRetryAfterMs;

    if (this.state === CIRCUIT_STATES.OPEN) {
      return;
    }

    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      this.failureCount += 1;
      this._transitionTo(CIRCUIT_STATES.OPEN);
      return;
    }

    this.failureCount += 1;
    if (this.failureCount >= this.threshold) {
      this._transitionTo(CIRCUIT_STATES.OPEN);
    }
  }

  /**
   * Get current state with time-based OPEN->HALF_OPEN transition applied.
   *
   * @returns {'CLOSED'|'OPEN'|'HALF_OPEN'}
   */
  getState() {
    this._transitionOpenToHalfOpenIfReady();
    return this.state;
  }

  /**
   * Manually reset circuit to CLOSED state.
   */
  reset() {
    this.failureCount = 0;
    this._transitionTo(CIRCUIT_STATES.CLOSED);
  }

  _transitionOpenToHalfOpenIfReady() {
    if (this.state !== CIRCUIT_STATES.OPEN) {
      return;
    }

    const elapsedMs = Date.now() - this.openedAt;
    if (elapsedMs >= this.timeout) {
      this._transitionTo(CIRCUIT_STATES.HALF_OPEN);
    }
  }

  /**
   * @param {'CLOSED'|'OPEN'|'HALF_OPEN'} nextState
   */
  _transitionTo(nextState) {
    if (this.state === nextState) {
      return;
    }

    const previousState = this.state;
    this.state = nextState;

    if (nextState === CIRCUIT_STATES.OPEN) {
      this.openedAt = Date.now();
      this.halfOpenInFlight = false;
      this.emit('open', this._buildEventPayload(previousState));
      return;
    }

    if (nextState === CIRCUIT_STATES.HALF_OPEN) {
      this.halfOpenInFlight = false;
      this.emit('half-open', this._buildEventPayload(previousState));
      return;
    }

    this.openedAt = 0;
    this.failureCount = 0;
    this.halfOpenInFlight = false;
    this.emit('close', this._buildEventPayload(previousState));
  }

  /**
   * @param {'CLOSED'|'OPEN'|'HALF_OPEN'} previousState
   */
  _buildEventPayload(previousState) {
    return {
      name: this.name,
      state: this.state,
      previousState,
      failureCount: this.failureCount,
      threshold: this.threshold,
      timeout: this.timeout
    };
  }

  _createOpenError() {
    const retryAfterMs = Math.max(0, this.timeout - (Date.now() - this.openedAt));
    return new CircuitBreakerOpenError(this.name, CIRCUIT_STATES.OPEN, retryAfterMs);
  }

  _createHalfOpenInFlightError() {
    return new CircuitBreakerOpenError(this.name, CIRCUIT_STATES.HALF_OPEN, 0);
  }

  _coerceThreshold(value) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      return DEFAULT_THRESHOLD;
    }
    return Math.max(1, Math.floor(normalized));
  }

  _coerceTimeout(value) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      return DEFAULT_TIMEOUT_MS;
    }
    return Math.max(0, normalized);
  }
}

module.exports = {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CIRCUIT_STATES
};
