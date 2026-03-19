/**
 * SecurityVeto - Mandatory veto mechanisms for fail-closed security
 * Implements VISION architectural pattern: mandatory veto blocks operations when criteria unmet
 */

const path = require('path');
const crypto = require('crypto');

class SecurityVeto {
  /**
   * Create a SecurityVeto instance
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    this.auditLogger = options.auditLogger || console;
    this.vetoPolicies = options.vetoPolicies || [];
    this.overrideGracePeriod = options.overrideGracePeriod || 0; // ms, 0 = no grace
    this.auditTrail = [];
    this.activeVetoes = new Map(); // vetoId -> {policy, timestamp, reason}
    this.vetoCount = 0;
    this.overridesUsed = 0;
    
    // Default veto policies if none provided
    if (this.vetoPolicies.length === 0) {
      this.vetoPolicies = [
        {
          id: 'command-safety',
          description: 'Prevents execution of dangerous commands',
          criteria: (operation) => this.isDangerousCommand(operation.command),
          action: 'BLOCK',
          severity: 'CRITICAL'
        },
        {
          id: 'resource-exhaustion',
          description: 'Prevents resource exhaustion attacks',
          criteria: (operation) => this.wouldExhaustResources(operation),
          action: 'BLOCK',
          severity: 'HIGH'
        },
        {
          id: 'sandbox-violation',
          description: 'Enforces sandbox boundaries',
          criteria: (operation) => this.violatesSandbox(operation),
          action: 'BLOCK',
          severity: 'HIGH'
        },
        {
          id: 'telemetry-quality',
          description: 'Ensures telemetry quality before acceptance',
          criteria: (operation) => !this.meetsTelemetryQuality(operation.metrics),
          action: 'BLOCK',
          severity: 'MEDIUM'
        }
      ];
    }
  }

  /**
   * Evaluate an operation against all veto policies
   * @param {Object} operation Operation to evaluate
   * @param {string} operation.type Operation type (command, file, network, etc.)
   * @param {Object} operation.details Operation details
   * @param {Object} context Additional context
   * @returns {Object} Evaluation result
   */
  evaluate(operation, context = {}) {
    const operationId = this.generateOperationId(operation);
    const timestamp = Date.now();
    const vetoResults = [];
    
    // Check each veto policy
    for (const policy of this.vetoPolicies) {
      try {
        const triggersVeto = policy.criteria(operation, context);
        
        if (triggersVeto) {
          const vetoResult = {
            policyId: policy.id,
            policyDescription: policy.description,
            action: policy.action,
            severity: policy.severity,
            reason: `Veto triggered by policy: ${policy.description}`,
            timestamp,
            operationId
          };
          
          vetoResults.push(vetoResult);
          
          // Record active veto
          this.activeVetoes.set(`${policy.id}-${operationId}`, {
            policy,
            timestamp,
            reason: vetoResult.reason,
            operation
          });
          
          this.vetoCount++;
          
          this.auditLog('VETO_TRIGGERED', {
            operationId,
            policyId: policy.id,
            operationType: operation.type,
            action: policy.action,
            severity: policy.severity
          });
        }
      } catch (error) {
        // Fail-closed: if policy evaluation fails, trigger veto
        vetoResults.push({
          policyId: policy.id,
          policyDescription: policy.description,
          action: 'BLOCK',
          severity: 'CRITICAL',
          reason: `Policy evaluation failed: ${error.message}`,
          timestamp,
          operationId,
          error: true
        });
        
        this.auditLog('VETO_EVALUATION_ERROR', {
          operationId,
          policyId: policy.id,
          error: error.message
        });
      }
    }
    
    const hasVeto = vetoResults.length > 0;
    const result = {
      allowed: !hasVeto,
      vetoes: vetoResults,
      operationId,
      timestamp,
      overrideAvailable: this.overrideGracePeriod > 0,
      overrideWindow: this.overrideGracePeriod
    };
    
    if (hasVeto) {
      // Determine final action based on most severe veto
      const highestSeverity = vetoResults.reduce((max, veto) => 
        this.severityValue(veto.severity) > this.severityValue(max.severity) ? veto : max
      );
      
      result.finalAction = highestSeverity.action;
      result.blockingVeto = highestSeverity;
    }
    
    this.auditLog('VETO_EVALUATION_COMPLETE', {
      operationId,
      allowed: result.allowed,
      vetoCount: vetoResults.length,
      finalAction: result.finalAction || 'ALLOW'
    });
    
    return result;
  }

  /**
   * Request an override for a vetoed operation
   * @param {string} operationId Operation ID
   * @param {string} overrideReason Reason for override
   * @param {Object} overrideContext Context for override decision
   * @returns {Object} Override result
   */
  requestOverride(operationId, overrideReason, overrideContext = {}) {
    const timestamp = Date.now();
    
    // Check if override is within grace period
    const vetoEntry = Array.from(this.activeVetoes.entries())
      .find(([key, value]) => key.includes(operationId));
    
    if (!vetoEntry) {
      return {
        success: false,
        error: 'No active veto found for operation',
        operationId
      };
    }
    
    const [vetoKey, vetoInfo] = vetoEntry;
    
    // Check grace period
    if (this.overrideGracePeriod > 0) {
      const timeSinceVeto = timestamp - vetoInfo.timestamp;
      if (timeSinceVeto > this.overrideGracePeriod) {
        this.auditLog('OVERRIDE_EXPIRED', {
          operationId,
          timeSinceVeto,
          gracePeriod: this.overrideGracePeriod
        });
        
        return {
          success: false,
          error: 'Override grace period expired',
          operationId,
          timeSinceVeto,
          gracePeriod: this.overrideGracePeriod
        };
      }
    }
    
    // Process override
    this.overridesUsed++;
    this.activeVetoes.delete(vetoKey);
    
    this.auditLog('OVERRIDE_GRANTED', {
      operationId,
      vetoPolicyId: vetoInfo.policy.id,
      overrideReason,
      overrideContext,
      overridesUsed: this.overridesUsed
    });
    
    return {
      success: true,
      operationId,
      overrideGranted: true,
      timestamp,
      remainingGrace: this.overrideGracePeriod > 0 
        ? this.overrideGracePeriod - (timestamp - vetoInfo.timestamp)
        : null,
      auditTrailId: this.auditTrail.length
    };
  }

  /**
   * Register a new veto policy
   * @param {Object} policy Veto policy
   * @returns {string} Policy ID
   */
  registerPolicy(policy) {
    const policyId = policy.id || `policy-${crypto.randomBytes(4).toString('hex')}`;
    const newPolicy = {
      ...policy,
      id: policyId
    };
    
    this.vetoPolicies.push(newPolicy);
    
    this.auditLog('POLICY_REGISTERED', {
      policyId,
      description: policy.description,
      action: policy.action,
      severity: policy.severity
    });
    
    return policyId;
  }

  /**
   * Remove a veto policy
   * @param {string} policyId Policy ID to remove
   * @returns {boolean} Success
   */
  removePolicy(policyId) {
    const initialLength = this.vetoPolicies.length;
    this.vetoPolicies = this.vetoPolicies.filter(p => p.id !== policyId);
    
    const removed = this.vetoPolicies.length < initialLength;
    
    if (removed) {
      this.auditLog('POLICY_REMOVED', { policyId });
    }
    
    return removed;
  }

  /**
   * Get statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      totalVetoes: this.vetoCount,
      activeVetoes: this.activeVetoes.size,
      overridesUsed: this.overridesUsed,
      policyCount: this.vetoPolicies.length,
      auditTrailSize: this.auditTrail.length
    };
  }

  /**
   * Get audit trail
   * @param {number} limit Maximum entries to return
   * @returns {Array} Audit trail entries
   */
  getAuditTrail(limit = 100) {
    return this.auditTrail.slice(-limit);
  }

  // Policy evaluation helpers (default implementations)

  /**
   * Check if command is dangerous
   * @param {string} command Command to check
   * @returns {boolean} True if dangerous
   */
  isDangerousCommand(command) {
    if (typeof command !== 'string') return false;
    
    const dangerousPatterns = [
      /rm\s+-rf/,
      /dd\s+if=/,
      /mkfs/,
      /fdisk/,
      /chmod\s+777/,
      /chown\s+root/,
      /cat\s+>\s+.*\.(env|key|pem|priv)/i,
      /echo\s+.*>\s+\/etc\//,
      /wget\s+.*\|\s+sh/,
      /curl\s+.*\|\s+sh/
    ];
    
    return dangerousPatterns.some(pattern => pattern.test(command));
  }

  /**
   * Check if operation would exhaust resources
   * @param {Object} operation Operation details
   * @returns {boolean} True if would exhaust
   */
  wouldExhaustResources(operation) {
    // Default implementation - override in production
    return false;
  }

  /**
   * Check if operation violates sandbox boundaries
   * @param {Object} operation Operation details
   * @returns {boolean} True if violates
   */
  violatesSandbox(operation) {
    // Default implementation - override in production
    return false;
  }

  /**
   * Check if telemetry meets quality standards
   * @param {Object} metrics Telemetry metrics
   * @returns {boolean} True if meets quality
   */
  meetsTelemetryQuality(metrics) {
    if (!metrics) return false;
    
    // Basic quality checks
    const checks = [
      metrics.timestamp && typeof metrics.timestamp === 'number',
      metrics.source && typeof metrics.source === 'string',
      !metrics._invalid,
      !metrics._corrupted
    ];
    
    return checks.every(check => check === true);
  }

  // Internal helpers

  generateOperationId(operation) {
    // Upgrade to SHA-512 for better collision resistance
    const hash = crypto.createHash('sha512');
    
    // Handle null/undefined operations safely
    const operationData = operation ? JSON.stringify(operation) : '{}';
    hash.update(operationData);
    hash.update(Date.now().toString());
    hash.update(crypto.randomBytes(8)); // Add salt for extra uniqueness
    
    return `op-${hash.digest('hex').slice(0, 16)}`;
  }

  severityValue(severity) {
    const values = {
      'LOW': 1,
      'MEDIUM': 2,
      'HIGH': 3,
      'CRITICAL': 4
    };
    return values[severity.toUpperCase()] || 0;
  }

  auditLog(event, data) {
    const entry = {
      event,
      timestamp: Date.now(),
      data,
      vetoStats: this.getStats()
    };
    
    this.auditTrail.push(entry);
    
    // Keep audit trail bounded
    if (this.auditTrail.length > 10000) {
      this.auditTrail = this.auditTrail.slice(-9000);
    }
    
    // Call audit logger
    if (this.auditLogger && this.auditLogger[event.toLowerCase()]) {
      this.auditLogger[event.toLowerCase()](entry);
    } else if (this.auditLogger.info) {
      this.auditLogger.info(`[SecurityVeto] ${event}`, entry);
    }
  }
}

// Export factory function for easy integration
function createSecurityVeto(options = {}) {
  return new SecurityVeto(options);
}

// Export integration with spawn-guard from crash-guard
function integrateWithSpawnGuard(vetoSystem, spawnGuard) {
  if (!spawnGuard || !spawnGuard.safeSpawn) {
    console.warn('[SecurityVeto] spawnGuard not available');
    return;
  }
  
  // Wrap safeSpawn with veto check
  const originalSafeSpawn = spawnGuard.safeSpawn;
  
  spawnGuard.safeSpawn = async function(command, args = [], options = {}) {
    // Create operation for veto evaluation
    const operation = {
      type: 'command',
      command: command,
      args: args,
      details: {
        command,
        args,
        options
      }
    };
    
    const vetoResult = vetoSystem.evaluate(operation);
    
    if (!vetoResult.allowed && vetoResult.finalAction === 'BLOCK') {
      const vetoReason = vetoResult.blockingVeto?.reason || 'Operation vetoed';
      
      vetoSystem.auditLog('COMMAND_VETOED', {
        command,
        args,
        vetoReason,
        operationId: vetoResult.operationId
      });
      
      return {
        success: false,
        error: `Command vetoed: ${vetoReason}`,
        vetoed: true,
        operationId: vetoResult.operationId,
        overrideAvailable: vetoResult.overrideAvailable
      };
    }
    
    // Proceed with original spawn
    return originalSafeSpawn.call(this, command, args, options);
  };
  
  console.log('[SecurityVeto] Integrated with spawn-guard');
}

module.exports = {
  SecurityVeto,
  createSecurityVeto,
  integrateWithSpawnGuard
};