/**
 * Memory Guard
 * Monitors memory usage and triggers automatic recovery actions
 */

import { SafeJSON } from './safe-json.js';

export class MemoryGuard {
  constructor(options = {}) {
    this.thresholdMB = options.thresholdMB || 512;
    this.checkIntervalMs = options.checkIntervalMs || 5000;
    this.gcTriggerThreshold = options.gcTriggerThreshold || 0.8; // 80% of threshold
    this.onCrash = options.onCrash || null;
    this.interval = null;
    this.lastWarning = 0;
    this.warningCooldownMs = 60000; // 1 minute between warnings
    
    // Track memory history for trend analysis
    this.history = [];
    this.historyMaxLength = 60; // Keep last 60 readings
    
    // Memory thresholds for different severity levels
    this.thresholds = {
      warning: 0.6,    // 60% of limit
      critical: 0.8,   // 80% of limit
      emergency: 0.9    // 90% of limit
    };
  }

  /**
   * Get current memory usage
   * @returns {Object} Memory usage info
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const rssMB = usage.rss / 1024 / 1024;
    const externalMB = usage.external / 1024 / 1024;
    
    return {
      heapUsed: heapUsedMB,
      heapTotal: heapTotalMB,
      heapPercent: (heapUsedMB / this.thresholdMB) * 100,
      rss: rssMB,
      external: externalMB,
      timestamp: Date.now()
    };
  }

  /**
   * Check memory and trigger recovery actions if needed
   */
  checkMemory() {
    const usage = this.getMemoryUsage();
    const percent = usage.heapPercent / 100;
    
    // Add to history
    this.history.push(usage);
    if (this.history.length > this.historyMaxLength) {
      this.history.shift();
    }
    
    // Determine severity
    if (percent >= this.thresholds.emergency) {
      this.handleEmergency(usage);
    } else if (percent >= this.thresholds.critical) {
      this.handleCritical(usage);
    } else if (percent >= this.thresholds.warning) {
      this.handleWarning(usage);
    }
    
    return usage;
  }

  /**
   * Handle warning level memory usage
   */
  handleWarning(usage) {
    const now = Date.now();
    if (now - this.lastWarning < this.warningCooldownMs) {
      return;
    }
    
    console.warn(`[MemoryGuard] Warning: Memory at ${usage.heapPercent.toFixed(1)}% (${usage.heapUsed.toFixed(1)}MB/${this.thresholdMB}MB)`);
    this.lastWarning = now;
    
    // Try to free memory by clearing caches if available
    this.freeMemory();
  }

  /**
   * Handle critical level memory usage
   */
  handleCritical(usage) {
    console.error(`[MemoryGuard] Critical: Memory at ${usage.heapPercent.toFixed(1)}%`);
    
    // Force garbage collection if available
    if (global.gc) {
      console.log('[MemoryGuard] Forcing garbage collection...');
      global.gc();
    }
    
    // Try to free more memory
    this.freeMemory();
    
    if (this.onCrash) {
      this.onCrash({
        type: 'memoryCritical',
        usage,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle emergency level memory usage
   */
  handleEmergency(usage) {
    console.error(`[MemoryGuard] EMERGENCY: Memory at ${usage.heapPercent.toFixed(1)}%`);
    
    // Aggressive memory freeing
    this.aggressiveFree();
    
    if (this.onCrash) {
      this.onCrash({
        type: 'memoryEmergency',
        usage,
        timestamp: Date.now()
      });
    }
    
    // If still critical after aggressive free, consider exiting
    const currentUsage = this.getMemoryUsage();
    if (currentUsage.heapPercent / 100 >= this.thresholds.emergency) {
      console.error('[MemoryGuard] Could not free enough memory - considering graceful shutdown');
      // Don't exit immediately - try to save state
    }
  }

  /**
   * Free memory by clearing internal caches
   */
  freeMemory() {
    // Clear module-level caches if they exist
    try {
      // Clear require cache for large modules (be selective)
      const modulesToClear = [
        // Add module names that can be safely cleared
      ];
      
      for (const mod of modulesToClear) {
        delete require.cache[require.resolve(mod)];
      }
    } catch (e) {
      // Ignore errors
    }
  }

  /**
   * Aggressively free memory
   */
  aggressiveFree() {
    // Force GC
    if (global.gc) {
      for (let i = 0; i < 3; i++) {
        global.gc();
      }
    }
    
    // Clear history
    this.history = [];
    
    // Clear any large buffers
    this.freeMemory();
  }

  /**
   * Get memory trend
   * @returns {string} Trend description
   */
  getTrend() {
    if (this.history.length < 10) {
      return 'insufficient_data';
    }
    
    const recent = this.history.slice(-10);
    const older = this.history.slice(-20, -10);
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((a, b) => a + b.heapPercent, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b.heapPercent, 0) / older.length;
    
    const diff = recentAvg - olderAvg;
    
    if (diff > 5) return 'increasing_rapidly';
    if (diff > 2) return 'increasing';
    if (diff < -5) return 'decreasing_rapidly';
    if (diff < -2) return 'decreasing';
    return 'stable';
  }

  /**
   * Start memory monitoring
   */
  start() {
    if (this.interval) {
      return;
    }
    
    console.log(`[MemoryGuard] Starting memory monitoring (threshold: ${this.thresholdMB}MB)`);
    
    this.interval = setInterval(() => {
      this.checkMemory();
    }, this.checkIntervalMs);
    
    // Check immediately
    this.checkMemory();
  }

  /**
   * Stop memory monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[MemoryGuard] Stopped memory monitoring');
    }
  }

  /**
   * Get status
   */
  getStatus() {
    const usage = this.getMemoryUsage();
    return {
      ...usage,
      trend: this.getTrend(),
      threshold: this.thresholdMB,
      thresholds: this.thresholds,
      isRunning: this.interval !== null
    };
  }
}

export default MemoryGuard;
