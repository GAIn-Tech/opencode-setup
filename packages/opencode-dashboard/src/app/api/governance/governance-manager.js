/**
 * Governance Module — Runtime governance settings that shape orchestration behavior.
 *
 * Provides:
 * - Budget mode (advisory / enforce-critical)
 * - Learning thresholds (anti-pattern override, positive pattern boost)
 * - Verification policy (when/methods/retries/escalation)
 * - Persistence and runtime application
 *
 * @module opencode-governance
 */

const path = require('path');
const fs = require('fs');

const DEFAULT_GOVERNANCE_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.opencode',
  'governance.json'
);

/**
 * Default governance settings.
 */
const DEFAULT_GOVERNANCE = Object.freeze({
  budget: {
    mode: 'advisory', // 'advisory' | 'enforce-critical'
  },
  learning: {
    anti_pattern_override_risk: 20,
    positive_pattern_boost_success: 0.8,
  },
  verification: {
    when: 'on-failure', // 'always' | 'on-failure' | 'on-high-impact'
    methods: ['tests', 'static'],
    max_retries: 3,
    escalation: 'human', // 'human' | 'auto-fix'
  },
  routing: {
    strategy: 'scoring', // 'scoring' | 'thompson-sampling' | 'category'
    allow_anthropic: false,
    constraint_penalty: 0.3,
  },
  updated_at: null,
  version: '1.0.0'
});

class GovernanceManager {
  /**
   * @param {object} [opts]
   * @param {string} [opts.governancePath] - Path to persist governance settings
   * @param {boolean} [opts.autoLoad] - Load persisted settings on construction
   */
  constructor(opts = {}) {
    this._governancePath = opts.governancePath || DEFAULT_GOVERNANCE_PATH;
    this._settings = { ...DEFAULT_GOVERNANCE };
    this._listeners = [];

    if (opts.autoLoad !== false) {
      try {
        this._load();
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.warn(`[GovernanceManager] Could not load settings: ${err.message}`);
        }
      }
    }
  }

  /**
   * Get current governance settings.
   * @returns {object}
   */
  getSettings() {
    return { ...this._settings };
  }

  /**
   * Update governance settings.
   *
   * @param {object} updates - Settings to update (partial)
   * @returns {object} Updated settings
   */
  updateSettings(updates) {
    this._settings = this._deepMerge(this._settings, updates);
    this._settings.updated_at = new Date().toISOString();
    this._save();
    this._emitUpdate(this._settings);
    return this.getSettings();
  }

  /**
   * Get a specific setting by path (e.g., 'budget.mode').
   *
   * @param {string} settingPath - Dot-separated path
   * @returns {*} Setting value or undefined
   */
  getSetting(settingPath) {
    const parts = settingPath.split('.');
    let value = this._settings;
    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = value[part];
    }
    return value;
  }

  /**
   * Register a listener for governance updates.
   *
   * @param {function} listener - Callback receiving updated settings
   */
  onUpdate(listener) {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  /**
   * Apply governance settings to runtime components.
   *
   * @param {object} runtime - Runtime components to configure
   * @param {object} runtime.governor - Context Governor instance
   * @param {object} runtime.advisor - Orchestration Advisor instance
   * @param {object} runtime.verifier - Verifier instance
   * @param {object} runtime.router - Model Router instance
   */
  applyToRuntime(runtime = {}) {
    if (!runtime || typeof runtime !== 'object') return;

    const settings = this.getSettings();

    // Apply budget mode to governor
    if (runtime.governor && typeof runtime.governor.setMode === 'function') {
      runtime.governor.setMode(settings.budget.mode);
    }

    // Apply learning thresholds to advisor
    if (runtime.advisor && typeof runtime.advisor.setGovernanceThresholds === 'function') {
      runtime.advisor.setGovernanceThresholds(settings.learning);
    }

    // Apply verification policy to verifier
    if (runtime.verifier && typeof runtime.verifier.setPolicy === 'function') {
      runtime.verifier.setPolicy(settings.verification);
    }

    // Apply routing strategy to router
    if (runtime.router && typeof runtime.router.setRoutingStrategy === 'function') {
      runtime.router.setRoutingStrategy(settings.routing.strategy);
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /**
   * Load settings from file.
   * @private
   */
  _load() {
    if (!fs.existsSync(this._governancePath)) return;

    const raw = fs.readFileSync(this._governancePath, 'utf-8');
    if (!raw || !raw.trim()) return;

    const data = JSON.parse(raw);
    this._settings = this._deepMerge({ ...DEFAULT_GOVERNANCE }, data);
  }

  /**
   * Save settings to file.
   * @private
   */
  _save() {
    try {
      const dir = path.dirname(this._governancePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tmpPath = `${this._governancePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this._settings, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this._governancePath);
    } catch (err) {
      console.warn(`[GovernanceManager] Failed to save settings (non-fatal): ${err.message}`);
    }
  }

  /**
   * Emit update event to listeners.
   * @private
   */
  _emitUpdate(settings) {
    for (const listener of this._listeners) {
      try {
        listener({ ...settings });
      } catch (err) {
        console.error('[GovernanceManager] Listener error:', err.message);
      }
    }
  }

  /**
   * Deep merge two objects.
   * @private
   */
  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
}

module.exports = { GovernanceManager, DEFAULT_GOVERNANCE };
