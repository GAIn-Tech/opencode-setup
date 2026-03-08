const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');
const { safeJsonParse } = require('opencode-safe-io');

class PluginLifecycleSupervisor {
  constructor(options = {}) {
    this.statePath =
      options.statePath ||
      path.join(os.homedir(), '.opencode', 'plugin-runtime-state.json');
    this.now = options.now || (() => Date.now());
    this.quarantineCrashThreshold = Number.isFinite(options.quarantineCrashThreshold)
      ? Math.max(1, options.quarantineCrashThreshold)
      : 3;
    this.state = this._load();
  }

  evaluatePlugin(input) {
    const name = String(input?.name || '').trim();
    if (!name) {
      throw new Error('Plugin name is required');
    }

    const previous = this.state[name] || {};
    const configured = Boolean(input?.configured);
    const discovered = Boolean(input?.discovered);
    const heartbeatOk = input?.heartbeat_ok !== false;
    const dependencyOk = input?.dependency_ok !== false;
    const policyViolation = Boolean(input?.policy_violation);
    const crashCount = Number(input?.crash_count ?? previous.crash_count ?? 0);
    const lastError = input?.last_error ? String(input.last_error) : '';

    let status = 'healthy';
    let reasonCode = 'healthy';
    let quarantine = false;

    if (!configured && !discovered) {
      status = 'unknown';
      reasonCode = 'not-discovered';
    } else if (!dependencyOk) {
      status = 'degraded';
      reasonCode = 'dependency-break';
      quarantine = true;
    } else if (policyViolation) {
      status = 'degraded';
      reasonCode = 'policy-violation';
      quarantine = true;
    } else if (crashCount >= this.quarantineCrashThreshold) {
      status = 'degraded';
      reasonCode = 'crash-loop';
      quarantine = true;
    } else if (!heartbeatOk) {
      status = 'degraded';
      reasonCode = 'missing-heartbeat';
      quarantine = false;
    }

    const ts = new Date(this.now()).toISOString();
    const prevStatus = String(previous.status || 'unknown');
    const transitionReason =
      prevStatus === status ? 'stable' : `${prevStatus}->${status}:${reasonCode}`;

    const next = {
      name,
      configured,
      discovered,
      status,
      reason_code: reasonCode,
      quarantine,
      quarantined: quarantine,
      crash_count: crashCount,
      last_error: lastError || previous.last_error || '',
      dependency_ok: dependencyOk,
      heartbeat_ok: heartbeatOk,
      policy_violation: policyViolation,
      transition_reason: transitionReason,
      updated_at: ts,
      first_seen_at: previous.first_seen_at || ts,
    };

    this.setPluginState(name, next);
    return next;
  }

  setPluginState(name, next) {
    if (name === '__proto__' || name === 'prototype' || name === 'constructor') {
      throw new Error(`Invalid plugin name: "${name}"`);
    }
    if (typeof name !== 'string' || name.length === 0 || name.length > 100) {
      throw new Error('Invalid plugin name format');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error('Plugin name contains invalid characters');
    }
    this.state[name] = next;
  }

  async evaluateMany(inputs = []) {
    const items = [];
    for (const input of inputs) {
      try {
        const result = this.evaluatePlugin(input);
        items.push(result);
      } catch (err) {
        items.push({
          name: input?.name || 'unknown',
          status: 'error',
          reason_code: 'evaluation-error',
          error: err.message,
        });
      }
    }

    try {
      await this._save();
    } catch (err) {
      // Non-fatal: log but don't re-throw
      console.error('[plugin-lifecycle] Failed to save state:', err.message);
    }

    const degraded = items.filter((item) => item.status === 'degraded').length;
    const healthy = items.filter((item) => item.status === 'healthy').length;
    const unknown = items.filter((item) => item.status === 'unknown').length;
    const error = items.filter((item) => item.status === 'error').length;
    const quarantined = items.filter((item) => Boolean(item.quarantine)).length;

    return {
      updated_at: new Date(this.now()).toISOString(),
      total: items.length,
      healthy,
      degraded,
      unknown,
      error,
      quarantined,
      items,
    };
  }

  list() {
    return Object.values(this.state);
  }

  _load() {
    try {
      if (!fs.existsSync(this.statePath)) return Object.create(null);
      const parsed = safeJsonParse(fs.readFileSync(this.statePath, 'utf8'), {}, 'plugin-lifecycle-state');
      if (!parsed || typeof parsed !== 'object') return Object.create(null);
      const safe = Object.create(null);
      for (const key of Object.keys(parsed)) {
        if (key !== '__proto__' && key !== 'prototype' && key !== 'constructor') {
          safe[key] = parsed[key];
        }
      }
      // Validate state integrity
      const validation = this.validateState(safe);
      if (!validation.valid) {
        console.warn('[plugin-lifecycle] State validation issues:', validation.issues);
      }
      return safe;
    } catch {
      return Object.create(null);
    }
  }

  async _save() {
    try {
      const dir = path.dirname(this.statePath);
      await fsPromises.mkdir(dir, { recursive: true });
      const tmp = `${this.statePath}.tmp`;
      await fsPromises.writeFile(tmp, JSON.stringify(this.state, null, 2), 'utf8');
      await fsPromises.rename(tmp, this.statePath);
    } catch (err) {
      // Attempt cleanup of temp file
      const tmp = `${this.statePath}.tmp`;
      try {
        await fsPromises.unlink(tmp);
      } catch {
        // Ignore cleanup errors
      }
      // Log error to stderr but don't re-throw (save failures are non-fatal)
      console.error('[plugin-lifecycle] Failed to save state:', err.message);
    }
  }

  validateState(stateObj = this.state) {
    const issues = [];
    const validStatuses = ['healthy', 'degraded', 'unknown', 'error'];

    for (const [name, entry] of Object.entries(stateObj)) {
      if (typeof entry !== 'object' || entry === null) {
        issues.push(`Entry "${name}" is not an object`);
        continue;
      }

      // Check required fields
      if (!entry.name || typeof entry.name !== 'string') {
        issues.push(`Entry "${name}" missing or invalid "name" field`);
      }
      if (!entry.status || typeof entry.status !== 'string') {
        issues.push(`Entry "${name}" missing or invalid "status" field`);
      }
      if (!entry.updated_at || typeof entry.updated_at !== 'string') {
        issues.push(`Entry "${name}" missing or invalid "updated_at" field`);
      }
      if (!entry.reason_code || typeof entry.reason_code !== 'string') {
        issues.push(`Entry "${name}" missing or invalid "reason_code" field`);
      }

      // Check status is valid
      if (entry.status && !validStatuses.includes(entry.status)) {
        issues.push(`Entry "${name}" has invalid status: "${entry.status}"`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

module.exports = {
  PluginLifecycleSupervisor,
};
