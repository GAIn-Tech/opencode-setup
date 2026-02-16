/**
 * Health Check System
 * Provides health endpoints and subsystem monitoring
 */

// Subsystem health status
const subsystemHealth = new Map();

/**
 * Register a subsystem for health monitoring
 * @param {string} name - Subsystem name
 * @param {Object} options - Health check options
 */
export function registerSubsystem(name, options = {}) {
  subsystemHealth.set(name, {
    name,
    status: 'healthy', // healthy, degraded, unhealthy
    lastCheck: Date.now(),
    checkInterval: options.checkInterval || 30000,
    checkFn: options.checkFn || (() => Promise.resolve({ healthy: true })),
    metadata: options.metadata || {},
    failureCount: 0,
    consecutiveFailures: 0,
  });
}

/**
 * Get health status of all subsystems
 * @returns {Object} Health status of all subsystems
 */
export function getHealthStatus() {
  const subsystems = {};
  let overallStatus = 'healthy';
  
  for (const [name, health] of subsystemHealth) {
    subsystems[name] = {
      status: health.status,
      lastCheck: health.lastCheck,
      metadata: health.metadata,
      failureCount: health.failureCount,
    };
    
    if (health.status === 'unhealthy') {
      overallStatus = 'unhealthy';
    } else if (health.status === 'degraded' && overallStatus === 'healthy') {
      overallStatus = 'degraded';
    }
  }
  
  return {
    overall: overallStatus,
    timestamp: Date.now(),
    subsystems,
  };
}

/**
 * Get detailed status of a specific subsystem
 * @param {string} name - Subsystem name
 * @returns {Object|null} Subsystem status or null if not found
 */
export function getSubsystemStatus(name) {
  return subsystemHealth.get(name) || null;
}

/**
 * Update subsystem health status
 * @param {string} name - Subsystem name
 * @param {string} status - Status: healthy, degraded, unhealthy
 * @param {Object} metadata - Additional metadata
 */
export function updateSubsystemStatus(name, status, metadata = {}) {
  const health = subsystemHealth.get(name);
  if (!health) {
    console.warn(`[HealthCheck] Unknown subsystem: ${name}`);
    return;
  }
  
  health.status = status;
  health.lastCheck = Date.now();
  health.metadata = { ...health.metadata, ...metadata };
  
  if (status === 'healthy') {
    health.consecutiveFailures = 0;
  } else {
    health.consecutiveFailures++;
    health.failureCount++;
  }
  
  // Auto-degrade after 3 consecutive failures
  if (health.consecutiveFailures >= 3 && health.status !== 'unhealthy') {
    health.status = 'unhealthy';
    console.error(`[HealthCheck] Subsystem ${name} marked unhealthy after ${health.consecutiveFailures} failures`);
  }
}

/**
 * Run health check for a subsystem
 * @param {string} name - Subsystem name
 */
export async function checkSubsystem(name) {
  const health = subsystemHealth.get(name);
  if (!health) {
    console.warn(`[HealthCheck] Unknown subsystem: ${name}`);
    return;
  }
  
  try {
    const result = await health.checkFn();
    if (result.healthy) {
      updateSubsystemStatus(name, 'healthy', result.metadata);
    } else {
      updateSubsystemStatus(name, result.status || 'degraded', result.metadata);
    }
  } catch (error) {
    updateSubsystemStatus(name, 'unhealthy', { error: error.message });
  }
}

/**
 * Start automatic health checks for all subsystems
 */
export function startHealthChecks() {
  for (const [name, health] of subsystemHealth) {
    if (health.checkInterval > 0) {
      setInterval(() => checkSubsystem(name), health.checkInterval);
    }
  }
  console.log('[HealthCheck] Started automatic health checks');
}

/**
 * Create Express/Next.js health check endpoint handler
 * @param {Object} options - Options
 * @returns {Function} Express route handler
 */
export function createHealthEndpoint(options = {}) {
  const { 
    includeDetails = true,
    includeSubsystems = true,
    includeMetadata = true 
  } = options;
  
  return (req, res) => {
    const status = getHealthStatus();
    
    // Include subsystem details if requested
    if (!includeDetails) {
      delete status.subsystems;
    } else if (!includeSubsystems) {
      for (const key of Object.keys(status.subsystems)) {
        delete status.subsystems[key];
      }
    }
    
    // Remove metadata if not requested
    if (!includeMetadata && status.subsystems) {
      for (const key of Object.keys(status.subsystems)) {
        delete status.subsystems[key].metadata;
      }
    }
    
    const statusCode = status.overall === 'healthy' ? 200 : 
                       status.overall === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(status);
  };
}

/**
 * Create liveness probe endpoint
 * @returns {Function} Express route handler
 */
export function createLivenessEndpoint() {
  return (req, res) => {
    res.status(200).json({ 
      status: 'alive', 
      timestamp: Date.now() 
    });
  };
}

/**
 * Create readiness probe endpoint
 * @returns {Function} Express route handler
 */
export function createReadinessEndpoint() {
  return (req, res) => {
    const status = getHealthStatus();
    
    if (status.overall === 'unhealthy') {
      return res.status(503).json({ 
        status: 'not_ready',
        reason: 'One or more subsystems unhealthy',
        details: status,
      });
    }
    
    res.status(200).json({ 
      status: 'ready',
      details: status,
    });
  };
}

/**
 * Common subsystem check functions
 */
export const commonChecks = {
  /**
   * Check if database is accessible
   * @param {Object} db - Database instance
   */
  database: (db) => async () => {
    try {
      if (db && typeof db.query === 'function') {
        await db.query('SELECT 1');
        return { healthy: true };
      }
      return { healthy: false, status: 'degraded', metadata: { reason: 'No query method' } };
    } catch (error) {
      return { healthy: false, status: 'unhealthy', metadata: { error: error.message } };
    }
  },
  
  /**
   * Check disk space
   * @param {string} path - Path to check
   * @param {number} minFreeMB - Minimum free space in MB
   */
  diskSpace: (path = '.', minFreeMB = 100) => async () => {
    try {
      const fs = await import('fs');
      const stats = fs.statfsSync ? fs.statfsSync(path) : null;
      
      if (stats) {
        const freeMB = Math.floor(stats.bavail * stats.bsize / 1024 / 1024);
        const healthy = freeMB >= minFreeMB;
        return { 
          healthy, 
          metadata: { freeMB, minFreeMB, path }
        };
      }
      
      return { healthy: true }; // Skip if not available
    } catch (error) {
      return { healthy: true, metadata: { error: error.message, skipped: true } };
    }
  },
  
  /**
   * Check memory usage
   * @param {number} maxUsagePercent - Maximum memory usage percentage
   */
  memory: (maxUsagePercent = 90) => async () => {
    try {
      const usage = process.memoryUsage();
      const heapUsedPercent = Math.round((usage.heapUsed / usage.heapTotal) * 100);
      const healthy = heapUsedPercent < maxUsagePercent;
      
      return { 
        healthy,
        status: healthy ? 'healthy' : 'degraded',
        metadata: { 
          heapUsedPercent, 
          maxUsagePercent,
          heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
        }
      };
    } catch (error) {
      return { healthy: true, metadata: { error: error.message } };
    }
  },
  
  /**
   * Check if a URL is reachable
   * @param {string} url - URL to check
   * @param {number} timeout - Timeout in ms
   */
  url: (url, timeout = 5000) => async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, { 
        signal: controller.signal,
        method: 'HEAD',
      });
      
      clearTimeout(timeoutId);
      const healthy = response.ok;
      
      return { 
        healthy,
        status: healthy ? 'healthy' : 'degraded',
        metadata: { url, status: response.status }
      };
    } catch (error) {
      return { 
        healthy: false, 
        status: 'unhealthy', 
        metadata: { url, error: error.message } 
      };
    }
  },
};

export default {
  registerSubsystem,
  getHealthStatus,
  getSubsystemStatus,
  updateSubsystemStatus,
  checkSubsystem,
  startHealthChecks,
  createHealthEndpoint,
  createLivenessEndpoint,
  createReadinessEndpoint,
  commonChecks,
};
