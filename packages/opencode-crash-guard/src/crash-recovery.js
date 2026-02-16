/**
 * Crash Recovery
 * Persists crash information and enables recovery on restart
 */

import { SafeJSON } from './safe-json.js';
import fs from 'fs';
import path from 'path';

export class CrashRecovery {
  constructor(options = {}) {
    this.dataDir = options.dataDir || './data';
    this.crashFile = path.join(this.dataDir, 'crashes.json');
    this.stateFile = path.join(this.dataDir, 'crash-recovery-state.json');
    this.maxCrashes = options.maxCrashes || 50;
    this.onCrash = options.onCrash || null;
    this.crashes = [];
    this.state = {};
    
    // Auto-save interval
    this.saveIntervalMs = options.saveIntervalMs || 30000;
    this.saveInterval = null;
  }

  /**
   * Initialize crash recovery
   */
  init() {
    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    // Load existing crash data
    this.loadCrashes();
    this.loadState();
    
    // Start auto-save
    this.saveInterval = setInterval(() => {
      this.saveCrashes();
    }, this.saveIntervalMs);
    
    console.log('[CrashRecovery] Initialized');
  }

  /**
   * Load crashes from file
   */
  loadCrashes() {
    try {
      if (fs.existsSync(this.crashFile)) {
        const data = fs.readFileSync(this.crashFile, 'utf-8');
        this.crashes = SafeJSON.parse(data, []);
        console.log(`[CrashRecovery] Loaded ${this.crashes.length} previous crashes`);
      }
    } catch (error) {
      console.warn('[CrashRecovery] Could not load crash data:', error.message);
      this.crashes = [];
    }
  }

  /**
   * Save crashes to file
   */
  saveCrashes() {
    try {
      const data = SafeJSON.stringify(this.crashes.slice(0, this.maxCrashes));
      const tmpFile = `${this.crashFile}.tmp`;
      fs.writeFileSync(tmpFile, data, 'utf-8');
      fs.renameSync(tmpFile, this.crashFile);
    } catch (error) {
      console.error('[CrashRecovery] Could not save crash data:', error.message);
    }
  }

  /**
   * Load recovery state
   */
  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf-8');
        this.state = SafeJSON.parse(data, {});
        console.log('[CrashRecovery] Loaded recovery state');
      }
    } catch (error) {
      console.warn('[CrashRecovery] Could not load state:', error.message);
      this.state = {};
    }
  }

  /**
   * Save recovery state
   */
  saveState() {
    try {
      const data = SafeJSON.stringify(this.state);
      const tmpFile = `${this.stateFile}.tmp`;
      fs.writeFileSync(tmpFile, data, 'utf-8');
      fs.renameSync(tmpFile, this.stateFile);
    } catch (error) {
      console.error('[CrashRecovery] Could not save state:', error.message);
    }
  }

  /**
   * Record a crash
   * @param {Object} crashInfo - Information about the crash
   */
  recordCrash(crashInfo) {
    const crash = {
      ...crashInfo,
      timestamp: Date.now(),
      memory: process.memoryUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      arch: process.arch
    };
    
    this.crashes.unshift(crash);
    if (this.crashes.length > this.maxCrashes) {
      this.crashes = this.crashes.slice(0, this.maxCrashes);
    }
    
    this.saveCrashes();
    
    // Analyze crash patterns
    this.analyzeCrashes();
    
    console.log(`[CrashRecovery] Recorded crash: ${crashInfo.type || 'unknown'}`);
  }

  /**
   * Analyze crash patterns
   */
  analyzeCrashes() {
    if (this.crashes.length < 2) return;
    
    // Check for repeated crash patterns
    const recentCrashes = this.crashes.slice(0, 10);
    const types = {};
    
    for (const crash of recentCrashes) {
      const type = crash.type || 'unknown';
      types[type] = (types[type] || 0) + 1;
    }
    
    // Check for frequent crashes
    const now = Date.now();
    const lastHour = recentCrashes.filter(c => now - c.timestamp < 3600000);
    
    if (lastHour.length > 5) {
      console.warn(`[CrashRecovery] WARNING: ${lastHour.length} crashes in the last hour`);
      console.warn('[CrashRecovery] Crash types:', types);
    }
  }

  /**
   * Get crash statistics
   */
  getStats() {
    const now = Date.now();
    const oneHour = 3600000;
    const oneDay = 86400000;
    
    const lastHour = this.crashes.filter(c => now - c.timestamp < oneHour).length;
    const lastDay = this.crashes.filter(c => now - c.timestamp < oneDay).length;
    
    const types = {};
    for (const crash of this.crashes) {
      const type = crash.type || 'unknown';
      types[type] = (types[type] || 0) + 1;
    }
    
    return {
      total: this.crashes.length,
      lastHour,
      lastDay,
      types,
      lastCrash: this.crashes[0] || null
    };
  }

  /**
   * Save recovery state for a specific component
   * @param {string} component - Component name
   * @param {any} state - State to save
   */
  saveComponentState(component, state) {
    this.state[component] = {
      data: state,
      timestamp: Date.now()
    };
    this.saveState();
  }

  /**
   * Load recovery state for a specific component
   * @param {string} component - Component name
   * @returns {any} Saved state or null
   */
  loadComponentState(component) {
    const saved = this.state[component];
    if (saved && Date.now() - saved.timestamp < 86400000) { // 24 hour expiry
      return saved.data;
    }
    return null;
  }

  /**
   * Clear crash history
   */
  clearHistory() {
    this.crashes = [];
    this.saveCrashes();
    console.log('[CrashRecovery] Cleared crash history');
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    this.saveCrashes();
    this.saveState();
  }
}

export default CrashRecovery;
