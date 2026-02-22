const fs = require('fs');
const os = require('os');
const path = require('path');

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

    this.state[name] = next;
    return next;
  }

  evaluateMany(inputs = []) {
    const items = inputs.map((input) => this.evaluatePlugin(input));
    this._save();
    const degraded = items.filter((item) => item.status === 'degraded').length;
    const healthy = items.filter((item) => item.status === 'healthy').length;
    const unknown = items.filter((item) => item.status === 'unknown').length;
    const quarantined = items.filter((item) => Boolean(item.quarantine)).length;

    return {
      updated_at: new Date(this.now()).toISOString(),
      total: items.length,
      healthy,
      degraded,
      unknown,
      quarantined,
      items,
    };
  }

  list() {
    return Object.values(this.state);
  }

  _load() {
    try {
      if (!fs.existsSync(this.statePath)) return {};
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  _save() {
    const dir = path.dirname(this.statePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.statePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.statePath);
  }
}

module.exports = {
  PluginLifecycleSupervisor,
};
