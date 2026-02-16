/**
 * OpenCode Crash Guard
 * Provides crash prevention, recovery, and graceful degradation for the OpenCode platform.
 * Handles segmentation faults, memory errors, and uncaught exceptions.
 * 
 * Features:
 * - Global exception handlers with safe recovery
 * - Memory monitoring with automatic GC triggers
 * - Crash recovery with state persistence
 * - Process isolation for dangerous operations
 * - Graceful degradation for failing subsystems
 */

import { SafeJSON } from './safe-json.js';
import { MemoryGuard } from './memory-guard.js';
import { CrashRecovery } from './crash-recovery.js';
import { ProcessIsolation } from './process-isolation.js';
import { SubsystemGuard } from './subsystem-guard.js';

/**
 * Initialize crash guard with all protections
 * @param {Object} options - Configuration options
 * @param {boolean} options.enableRecovery - Enable crash recovery (default: true)
 * @param {boolean} options.enableMemoryGuard - Enable memory monitoring (default: true)
 * @param {boolean} options.enableIsolation - Enable process isolation (default: true)
 * @param {number} options.memoryThresholdMB - Memory threshold in MB (default: 512)
 * @param {Function} options.onCrash - Callback when crash is detected
 * @returns {Object} Crash guard API
 */
export function initCrashGuard(options = {}) {
  const {
    enableRecovery = true,
    enableMemoryGuard = true,
    enableIsolation = true,
    memoryThresholdMB = 512,
    onCrash = null
  } = options;

  // Initialize components
  const memoryGuard = enableMemoryGuard 
    ? new MemoryGuard({ thresholdMB: memoryThresholdMB, onCrash }) 
    : null;
  
  const crashRecovery = enableRecovery 
    ? new CrashRecovery({ onCrash }) 
    : null;
  
  const processIsolation = enableIsolation 
    ? new ProcessIsolation() 
    : null;
  
  const subsystemGuard = new SubsystemGuard({ onCrash });

  // Global exception handlers
  const setupGlobalHandlers = () => {
    // Handle uncaught exceptions (including segfaults manifested as exceptions)
    process.on('uncaughtException', (error, origin) => {
      console.error('[CrashGuard] Uncaught Exception:', error.message);
      console.error('[CrashGuard] Origin:', origin);
      
      if (onCrash) {
        onCrash({
          type: 'uncaughtException',
          error: SafeJSON.stringify(error),
          origin,
          timestamp: Date.now()
        });
      }
      
      if (crashRecovery) {
        crashRecovery.recordCrash({
          type: 'uncaughtException',
          message: error.message,
          stack: error.stack
        });
      }
      
      // Don't exit immediately - try graceful recovery
      if (!error.message.includes('Segmentation fault')) {
        console.log('[CrashGuard] Attempting graceful recovery...');
        return;
      }
      
      // For segfaults, we can't recover - just log and exit
      console.error('[CrashGuard] Segmentation fault detected - cannot recover safely');
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('[CrashGuard] Unhandled Promise Rejection:', reason);
      
      if (onCrash) {
        onCrash({
          type: 'unhandledRejection',
          reason: SafeJSON.stringify(reason),
          timestamp: Date.now()
        });
      }
      
      if (crashRecovery) {
        crashRecovery.recordCrash({
          type: 'unhandledRejection',
          message: String(reason)
        });
      }
    });

    // Handle out-of-memory errors
    process.on('OOM', (details) => {
      console.error('[CrashGuard] Out of Memory:', details);
      
      if (onCrash) {
        onCrash({
          type: 'OOM',
          details,
          timestamp: Date.now()
        });
      }
      
      // Force garbage collection if available
      if (global.gc) {
        console.log('[CrashGuard] Forcing garbage collection...');
        global.gc();
      }
      
      if (crashRecovery) {
        crashRecovery.recordCrash({ type: 'OOM', details });
      }
    });
  };

  // Initialize
  if (enableMemoryGuard) {
    memoryGuard?.start();
  }
  
  if (enableRecovery) {
    crashRecovery?.init();
  }
  
  setupGlobalHandlers();

  // Return API
  return {
    // Memory management
    memory: memoryGuard,
    
    // Crash recovery
    recovery: crashRecovery,
    
    // Process isolation
    isolate: processIsolation ? (fn, options) => processIsolation.run(fn, options) : null,
    
    // Subsystem protection
    guard: subsystemGuard,
    
    // Safe JSON operations
    safeJSON: SafeJSON,
    
    // Cleanup
    destroy: () => {
      memoryGuard?.stop();
      crashRecovery?.cleanup();
      subsystemGuard?.destroy();
    }
  };
}

export { SafeJSON } from './safe-json.js';
export { MemoryGuard } from './memory-guard.js';
export { CrashRecovery } from './crash-recovery.js';
export { ProcessIsolation } from './process-isolation.js';
export { SubsystemGuard } from './subsystem-guard.js';

export default { initCrashGuard };
