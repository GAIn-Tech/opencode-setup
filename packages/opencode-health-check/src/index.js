/**
 * Health Check System
 * Provides health endpoints and subsystem monitoring
 */

// Subsystem health status
const subsystemHealth = new Map();

// Guard flag to prevent double-start
let _running = false;

// Scheduler telemetry tracking
const schedulerTelemetry = {
  tickCount: 0,
  overlapRate: 0,
  maxConcurrentChecks: 0,
  lastCheckTimes: new Map(), // Track last check time per subsystem
  checkDurations: new Map(), // Track check duration per subsystem
  concurrentChecks: 0, // Current concurrent checks
};

/**
 * Register a subsystem for health monitoring
 * @param {string} name - Subsystem name
 * @param {Function} checkFn - Health check function
 * @param {Object} options - Health check options
 */
export function registerSubsystem(name, checkFn, options = {}) {
  subsystemHealth.set(name, {
    name,
    status: 'healthy', // healthy, degraded, unhealthy
    lastCheck: Date.now(),
    checkInterval: options.checkInterval || 30000,
    checkFn: checkFn || (() => Promise.resolve({ healthy: true })),
    metadata: options.metadata || {},
    failureCount: 0,
    consecutiveFailures: 0,
    _intervalId: null, // Store interval ID for cleanup
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
function updateSubsystemStatus(name, status, metadata = {}) {
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
  
  // Track concurrent checks
  schedulerTelemetry.concurrentChecks++;
  if (schedulerTelemetry.concurrentChecks > schedulerTelemetry.maxConcurrentChecks) {
    schedulerTelemetry.maxConcurrentChecks = schedulerTelemetry.concurrentChecks;
  }
  
  const startTime = Date.now();
  
  try {
    const result = await health.checkFn();
    if (result.healthy) {
      updateSubsystemStatus(name, 'healthy', result.metadata);
    } else {
      updateSubsystemStatus(name, result.status || 'degraded', result.metadata);
    }
  } catch (error) {
    updateSubsystemStatus(name, 'unhealthy', { error: error.message });
  } finally {
    // Track check duration and decrement concurrent count
    const duration = Date.now() - startTime;
    schedulerTelemetry.lastCheckTimes.set(name, Date.now());
    schedulerTelemetry.checkDurations.set(name, duration);
    schedulerTelemetry.concurrentChecks--;
    schedulerTelemetry.tickCount++;
    
    // Calculate overlap rate (simplified: ratio of max concurrent to total ticks)
    if (schedulerTelemetry.tickCount > 0) {
      schedulerTelemetry.overlapRate = schedulerTelemetry.maxConcurrentChecks / Math.max(1, subsystemHealth.size);
    }
  }
}

/**
 * Start automatic health checks for all subsystems
 */
export function startHealthChecks() {
  // If already running, clear existing timers first
  if (_running) {
    stopHealthChecks();
  }
  
  for (const [name, health] of subsystemHealth) {
    if (health.checkInterval > 0) {
      const intervalId = setInterval(() => checkSubsystem(name), health.checkInterval);
      
      // Store interval ID for cleanup
      health._intervalId = intervalId;
      
      // Call .unref() to prevent blocking process exit
      if (intervalId && typeof intervalId.unref === 'function') {
        intervalId.unref();
      }
    }
  }
  
  _running = true;
  console.log('[HealthCheck] Started automatic health checks');
}

/**
 * Stop automatic health checks for all subsystems
 */
export function stopHealthChecks() {
  for (const [name, health] of subsystemHealth) {
    if (health._intervalId) {
      clearInterval(health._intervalId);
      health._intervalId = null;
    }
  }
  
  _running = false;
  console.log('[HealthCheck] Stopped automatic health checks');
}

/**
 * Create Express/Next.js health check endpoint handler
 * @param {Object} options - Options
 * @returns {Function} Express route handler
 */
function createHealthEndpoint(options = {}) {
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
function createLivenessEndpoint() {
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
function createReadinessEndpoint() {
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
const commonChecks = {
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
      const classification = classifyUrlError(error);
      return { 
        healthy: false, 
        status: 'unhealthy', 
        metadata: { 
          url, 
          error: error.message,
          errorType: classification.type,
          errorCode: classification.code
        } 
      };
    }
  },
};

function classifyUrlError(error) {
  if (!error || typeof error !== 'object') {
    return { type: 'unknown', code: null };
  }

  const code = error.code || null;
  const message = String(error.message || '').toLowerCase();

  if (error.name === 'AbortError') {
    return { type: 'timeout', code: code || 'ETIMEDOUT' };
  }
  if (code === 'ENOTFOUND' || message.includes('enotfound')) {
    return { type: 'dns', code: code || 'ENOTFOUND' };
  }
  if (code === 'ECONNREFUSED' || message.includes('econnrefused')) {
    return { type: 'refused', code: code || 'ECONNREFUSED' };
  }
  if (code === 'ECONNRESET' || message.includes('econnreset')) {
    return { type: 'reset', code: code || 'ECONNRESET' };
  }
  if (message.includes('certificate') || message.includes('tls')) {
    return { type: 'tls', code };
  }

  return { type: 'unknown', code };
}

/**
 * Get scheduler telemetry data
 * @returns {Object} Telemetry data with tickCount, overlapRate, maxConcurrentChecks
 */
export function getSchedulerTelemetry() {
  return {
    tickCount: schedulerTelemetry.tickCount,
    overlapRate: schedulerTelemetry.overlapRate,
    maxConcurrentChecks: schedulerTelemetry.maxConcurrentChecks,
    lastCheckTimes: Object.fromEntries(schedulerTelemetry.lastCheckTimes),
    checkDurations: Object.fromEntries(schedulerTelemetry.checkDurations),
  };
}

// Alias for API compatibility
export const getHealth = getHealthStatus;
export default {
  registerSubsystem,
  getHealthStatus,
  getSubsystemStatus,
  checkSubsystem,
  startHealthChecks,
  stopHealthChecks,
  getSchedulerTelemetry,
  getHealth,
};
