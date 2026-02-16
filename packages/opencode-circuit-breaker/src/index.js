/**
 * CircuitBreaker - Prevents provider failure cascades
 * 
 * States: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
 * 
 * Usage:
 *   const cb = new CircuitBreaker('openai', {
 *     failureThreshold: 5,    // Open after 5 failures
 *     successThreshold: 2,    // Close after 2 successes
 *     timeout: 30000,        // Try recovery after 30s
 *   });
 *   
 *   try {
 *     return await cb.execute(() => api.call());
 *   } catch (e) {
 *     if (cb.isOpen()) throw new ProviderCircuitOpenError();
 *   }
 */

export class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000;
    
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = 0;
    
    // Event callbacks
    this.onStateChange = options.onStateChange || (() => {});
    this.onSuccess = options.onSuccess || (() => {});
    this.onFailure = options.onFailure || (() => {});
  }
  
  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn) {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new CircuitOpenError(this.name, this.nextAttemptTime - Date.now());
      }
      // Transition to HALF_OPEN
      this._transitionTo('HALF_OPEN');
    }
    
    try {
      const result = await fn();
      this._recordSuccess();
      return result;
    } catch (error) {
      this._recordFailure();
      throw error;
    }
  }
  
  /**
   * Execute synchronously with circuit breaker protection
   */
  executeSync(fn) {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new CircuitOpenError(this.name, this.nextAttemptTime - Date.now());
      }
      // Transition to HALF_OPEN
      this._transitionTo('HALF_OPEN');
    }
    
    try {
      const result = fn();
      this._recordSuccess();
      return result;
    } catch (error) {
      this._recordFailure();
      throw error;
    }
  }
  
  _recordSuccess() {
    this.failures = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this._transitionTo('CLOSED');
      }
    }
    
    this.onSuccess(this.name, this.state);
  }
  
  _recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;
    
    if (this.state === 'HALF_OPEN') {
      this._transitionTo('OPEN');
    } else if (this.state === 'CLOSED' && this.failures >= this.failureThreshold) {
      this._transitionTo('OPEN');
    }
    
    this.onFailure(this.name, this.failures, this.state);
  }
  
  _transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    
    if (newState === 'OPEN') {
      this.nextAttemptTime = Date.now() + this.timeout;
    } else if (newState === 'CLOSED') {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === 'HALF_OPEN') {
      this.successes = 0;
    }
    
    this.onStateChange(this.name, oldState, newState);
  }
  
  // State getters
  isClosed() { return this.state === 'CLOSED'; }
  isOpen() { return this.state === 'OPEN'; }
  isHalfOpen() { return this.state === 'HALF_OPEN'; }
  
  getState() { return this.state; }
  getFailures() { return this.failures; }
  getNextAttemptTime() { return this.nextAttemptTime; }
  
  // Manual control
  reset() {
    this._transitionTo('CLOSED');
  }
  
  forceOpen() {
    this._transitionTo('OPEN');
  }
  
  forceClosed() {
    this._transitionTo('CLOSED');
  }
  
  // Get status for monitoring
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      timeUntilRetry: this.state === 'OPEN' ? Math.max(0, this.nextAttemptTime - Date.now()) : 0
    };
  }
}

/**
 * CircuitBreakerRegistry - Manage multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  constructor() {
    this.breakers = new Map();
    this.defaultOptions = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000
    };
  }
  
  /**
   * Get or create a circuit breaker
   */
  get(name, options = {}) {
    if (!this.breakers.has(name)) {
      const opts = { ...this.defaultOptions, ...options };
      this.breakers.set(name, new CircuitBreaker(name, opts));
    }
    return this.breakers.get(name);
  }
  
  /**
   * Execute with circuit breaker protection
   */
  async execute(name, fn, options = {}) {
    const cb = this.get(name, options);
    return cb.execute(fn);
  }
  
  /**
   * Get all circuit breaker statuses
   */
  getAllStatus() {
    const status = {};
    for (const [name, cb] of this.breakers) {
      status[name] = cb.getStatus();
    }
    return status;
  }
  
  /**
   * Get circuit breaker by name
   */
  getBreaker(name) {
    return this.breakers.get(name);
  }
  
  /**
   * Remove a circuit breaker
   */
  remove(name) {
    this.breakers.delete(name);
  }
  
  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const cb of this.breakers.values()) {
      cb.reset();
    }
  }
  
  /**
   * Get summary for monitoring
   */
  getSummary() {
    let closed = 0, open = 0, halfOpen = 0;
    for (const cb of this.breakers.values()) {
      if (cb.isClosed()) closed++;
      else if (cb.isOpen()) open++;
      else halfOpen++;
    }
    return {
      total: this.breakers.size,
      closed,
      open,
      halfOpen,
      breakers: this.getAllStatus()
    };
  }
}

/**
 * Custom error for circuit open state
 */
export class CircuitOpenError extends Error {
  constructor(name, retryAfter) {
    super(`Circuit breaker "${name}" is OPEN. Retry after ${Math.ceil(retryAfter/1000)}s`);
    this.name = 'CircuitOpenError';
    this.circuitName = name;
    this.retryAfter = retryAfter;
  }
}

// Default registry instance
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
