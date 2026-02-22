// Feature flags for gradual rollouts and A/B testing
import { atomicWriteJson } from '@opencode/crash-guard/safe-json';

class FeatureFlags {
  constructor(options = {}) {
    this.flags = {};
    this.persistedPath = options.persistedPath || './feature-flags.json';
    this.defaults = options.defaults || {};
    this.listeners = new Map();
    
    // Load persisted flags
    this._load();
  }
  
  _load() {
    try {
      const data = require('fs').readFileSync(this.persistedPath, 'utf-8');
      this.flags = JSON.parse(data);
    } catch {
      this.flags = {};
    }
  }
  
  _save() {
    try {
      atomicWriteJson(this.persistedPath, this.flags);
    } catch (e) {
      console.error('[FeatureFlags] Failed to persist:', e.message);
    }
  }
  
  // Check if a feature is enabled
  isEnabled(name, userId = null) {
    const flag = this.flags[name];
    if (!flag) return this.defaults[name] ?? false;
    
    // Check if globally enabled/disabled
    if (flag.enabled === false) return false;
    if (flag.enabled === true) return true;
    
    // Handle rollout percentage
    if (flag.rolloutPercentage !== undefined) {
      // Deterministic rollout based on userId or random
      const hash = this._hash(userId || Math.random().toString());
      return (hash % 100) < flag.rolloutPercentage;
    }
    
    // Handle A/B testing
    if (flag.variants && userId) {
      const variantIndex = this._hash(userId) % flag.variants.length;
      return flag.variants[variantIndex];
    }
    
    return flag.enabled ?? this.defaults[name] ?? false;
  }
  
  // Get the variant for A/B testing
  getVariant(name, userId) {
    const flag = this.flags[name];
    if (!flag || !flag.variants) return null;
    
    const variantIndex = this._hash(userId) % flag.variants.length;
    return flag.variants[variantIndex];
  }
  
  // Enable a feature
  enable(name) {
    this.flags[name] = { ...this.flags[name], enabled: true };
    this._save();
    this._notify(name, true);
  }
  
  // Disable a feature  
  disable(name) {
    this.flags[name] = { ...this.flags[name], enabled: false };
    this._save();
    this._notify(name, false);
  }
  
  // Set rollout percentage (0-100)
  setRollout(name, percentage) {
    this.flags[name] = { ...this.flags[name], rolloutPercentage: percentage };
    this._save();
  }
  
  // Set A/B variants
  setVariants(name, variants) {
    this.flags[name] = { ...this.flags[name], variants };
    this._save();
  }
  
  // Get all flags
  getAll() {
    return { ...this.flags };
  }
  
  // Subscribe to flag changes
  onChange(name, callback) {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, []);
    }
    this.listeners.get(name).push(callback);
  }
  
  _notify(name, value) {
    const callbacks = this.listeners.get(name) || [];
    callbacks.forEach(cb => cb(value));
  }
  
  _hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

export function createFeatureFlags(options) {
  return new FeatureFlags(options);
}

export default { createFeatureFlags };
