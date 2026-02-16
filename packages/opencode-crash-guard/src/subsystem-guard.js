/**
 * Subsystem Guard
 * Provides graceful degradation for failing subsystems
 */

import { SafeJSON } from './safe-json.js';

export class SubsystemGuard {
  constructor(options = {}) {
    this.onCrash = options.onCrash || null;
    this.subsystems = new Map();
    this.failureCounts = new Map();
    this.failureWindowMs = options.failureWindowMs || 60000; // 1 minute
    this.failureThreshold = options.failureThreshold || 3;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs || 300000; // 5 minutes
    
    // Default fallback behaviors
    this.defaultFallbacks = {
      'model-router': () => ({ error: 'model-router unavailable', fallback: true }),
      'quota-manager': () => ({ available: true, quotas: {} }),
      'skill-rl': () => ({ skills: [], fallback: true }),
      'memory-graph': () => ({ sessions: [], fallback: true }),
      'context-governor': () => ({ budget: { remaining: 0 }, fallback: true }),
      'integration-layer': () => ({ error: 'integration-layer unavailable', fallback: true }),
      'provider-status': () => ({ providers: {}, fallback: true })
    };
  }

  /**
   * Register a subsystem with optional fallback
   * @param {string} name - Subsystem name
   * @param {Object} options - Options
   * @param {Function} options.fallback - Fallback function when subsystem fails
   * @param {Function} options.healthCheck - Health check function
   */
  register(name, options = {}) {
    this.subsystems.set(name, {
      name,
      fallback: options.fallback || this.defaultFallbacks[name] || (() => ({ error: `${name} unavailable`, fallback: true })),
      healthCheck: options.healthCheck || null,
      isDegraded: false,
      lastFailure: 0,
      lastSuccess: Date.now()
    });
    
    this.failureCounts.set(name, []);
    
    console.log(`[SubsystemGuard] Registered subsystem: ${name}`);
  }

  /**
   * Wrap a subsystem call with protection
   * @param {string} name - Subsystem name
   * @param {Function} fn - Function to wrap
   * @returns {Promise<any>} Result or fallback
   */
  async wrap(name, fn) {
    const subsystem = this.subsystems.get(name);
    
    if (!subsystem) {
      console.warn(`[SubsystemGuard] Unknown subsystem: ${name}`);
      return fn();
    }
    
    // Check if subsystem is degraded
    if (subsystem.isDegraded) {
      // Check if we should try again
      if (Date.now() - subsystem.lastFailure > this.recoveryTimeoutMs) {
        console.log(`[SubsystemGuard] Attempting recovery for: ${name}`);
        subsystem.isDegraded = false;
      } else {
        console.log(`[SubsystemGuard] Using fallback for degraded subsystem: ${name}`);
        return subsystem.fallback();
      }
    }
    
    try {
      const result = await fn();
      
      // Success - update status
      subsystem.lastSuccess = Date.now();
      subsystem.isDegraded = false;
      
      // Clear failure count on success
      this.failureCounts.set(name, []);
      
      return result;
    } catch (error) {
      // Record failure
      this.recordFailure(name, error);
      
      // Check if we should degrade
      const failures = this.failureCounts.get(name);
      if (failures.length >= this.failureThreshold) {
        console.error(`[SubsystemGuard] Degrading subsystem: ${name} (${failures.length} failures)`);
        subsystem.isDegraded = true;
        subsystem.lastFailure = Date.now();
        
        if (this.onCrash) {
          this.onCrash({
            type: 'subsystemDegraded',
            subsystem: name,
            failures: failures.length,
            lastError: error.message,
            timestamp: Date.now()
          });
        }
      }
      
      // Return fallback
      return subsystem.fallback();
    }
  }

  /**
   * Record a failure for a subsystem
   * @param {string} name - Subsystem name
   * @param {Error} error - Error that occurred
   */
  recordFailure(name, error) {
    const failures = this.failureCounts.get(name) || [];
    const now = Date.now();
    
    // Add failure
    failures.push({
      timestamp: now,
      error: error.message
    });
    
    // Remove old failures outside the window
    const cutoff = now - this.failureWindowMs;
    const recentFailures = failures.filter(f => f.timestamp > cutoff);
    
    this.failureCounts.set(name, recentFailures);
  }

  /**
   * Get status of all subsystems
   */
  getStatus() {
    const status = {};
    
    for (const [name, subsystem] of this.subsystems) {
      const failures = this.failureCounts.get(name) || [];
      
      status[name] = {
        isDegraded: subsystem.isDegraded,
        lastSuccess: subsystem.lastSuccess,
        lastFailure: subsystem.lastFailure,
        recentFailures: failures.length,
        hasFallback: !!subsystem.fallback
      };
    }
    
    return status;
  }

  /**
   * Manually degrade a subsystem
   * @param {string} name - Subsystem name
   */
  degrade(name) {
    const subsystem = this.subsystems.get(name);
    if (subsystem) {
      subsystem.isDegraded = true;
      subsystem.lastFailure = Date.now();
      console.log(`[SubsystemGuard] Manually degraded: ${name}`);
    }
  }

  /**
   * Manually recover a subsystem
   * @param {string} name - Subsystem name
   */
  recover(name) {
    const subsystem = this.subsystems.get(name);
    if (subsystem) {
      subsystem.isDegraded = false;
      this.failureCounts.set(name, []);
      console.log(`[SubsystemGuard] Manually recovered: ${name}`);
    }
  }

  /**
   * Health check for all subsystems
   * @returns {Object} Health status
   */
  async healthCheck() {
    const results = {};
    
    for (const [name, subsystem] of this.subsystems) {
      if (subsystem.healthCheck) {
        try {
          const healthy = await subsystem.healthCheck();
          results[name] = {
            healthy,
            checked: true
          };
        } catch (e) {
          results[name] = {
            healthy: false,
            checked: true,
            error: e.message
          };
        }
      } else {
        results[name] = {
          healthy: !subsystem.isDegraded,
          checked: false
        };
      }
    }
    
    return results;
  }

  /**
   * Destroy the subsystem guard
   */
  destroy() {
    this.subsystems.clear();
    this.failureCounts.clear();
  }
}

export default SubsystemGuard;
