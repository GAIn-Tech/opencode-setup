'use strict';

const fs = require('fs');
const path = require('path');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function ensureDirExists(filePathOrDir) {
  const dir = path.extname(filePathOrDir) ? path.dirname(filePathOrDir) : filePathOrDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function toIso(ms) {
  return new Date(ms).toISOString();
}

function isoDate(ms) {
  return toIso(ms).slice(0, 10);
}

function randomId() {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

function safeFileNameSegment(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function listAuditEntries(auditLogPath) {
  if (!auditLogPath) return [];
  let raw;
  try {
    raw = fs.readFileSync(auditLogPath, 'utf8');
  } catch {
    return [];
  }
  if (!raw || !raw.trim()) return [];
  const entries = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = safeJsonParse(trimmed);
    if (parsed) entries.push(parsed);
  }
  return entries;
}

function withinWindow(entry, nowMs, windowMs) {
  const epoch = typeof entry?.epoch_ms === 'number' ? entry.epoch_ms : null;
  if (!Number.isFinite(epoch)) return false;
  return epoch >= nowMs - windowMs && epoch <= nowMs;
}

class GovernanceValidator {
  constructor(options = {}) {
    this._now = typeof options.now === 'function' ? options.now : () => Date.now();

    this._enabled = options.enabled !== false;

    this._auditLogPath =
      typeof options.auditLogPath === 'string' && options.auditLogPath.trim()
        ? options.auditLogPath
        : path.join(process.cwd(), 'opencode-config', 'hyper-parameter-audit.jsonl');

    this._learningUpdatesDir =
      typeof options.learningUpdatesDir === 'string' && options.learningUpdatesDir.trim()
        ? options.learningUpdatesDir
        : path.join(process.cwd(), 'opencode-config', 'learning-updates');

    const rate = isPlainObject(options.rateLimits) ? options.rateLimits : {};
    this._rateLimits = Object.freeze({
      globalPerHour: Number.isInteger(rate.globalPerHour) ? rate.globalPerHour : 50,
      globalPerDay: Number.isInteger(rate.globalPerDay) ? rate.globalPerDay : 200,
      perParameterPerHour: Number.isInteger(rate.perParameterPerHour)
        ? rate.perParameterPerHour
        : 6,
      perParameterPerDay: Number.isInteger(rate.perParameterPerDay) ? rate.perParameterPerDay : 24,
    });

    const mag = isPlainObject(options.magnitude) ? options.magnitude : {};
    this._magnitude = Object.freeze({
      maxDeltaAbsolute:
        typeof mag.maxDeltaAbsolute === 'number' && Number.isFinite(mag.maxDeltaAbsolute)
          ? Math.abs(mag.maxDeltaAbsolute)
          : Infinity,
      maxDeltaFractionOfHardRange:
        typeof mag.maxDeltaFractionOfHardRange === 'number' && Number.isFinite(mag.maxDeltaFractionOfHardRange)
          ? clamp(mag.maxDeltaFractionOfHardRange, 0, 1)
          : 0.15,
    });

    const corr = isPlainObject(options.correlation) ? options.correlation : {};
    this._correlation = Object.freeze({
      windowMs: Number.isInteger(corr.windowMs) && corr.windowMs > 0 ? corr.windowMs : 10 * 60 * 1000,
      dependencyMagnitudeMultiplier:
        typeof corr.dependencyMagnitudeMultiplier === 'number' && Number.isFinite(corr.dependencyMagnitudeMultiplier)
          ? clamp(corr.dependencyMagnitudeMultiplier, 0, 1)
          : 0.5,
      maxGroupChangesPerHour:
        Number.isInteger(corr.maxGroupChangesPerHour) && corr.maxGroupChangesPerHour > 0
          ? corr.maxGroupChangesPerHour
          : 10,
    });
  }

  get auditLogPath() {
    return this._auditLogPath;
  }

  get learningUpdatesDir() {
    return this._learningUpdatesDir;
  }

  /**
   * Validate + normalize a candidate change.
   *
   * Returns:
   * { allowed, blocked_reason, parameter, warnings, audit_entry, learning_update }
   */
  validateAndPrepareChange({ registry, name, before, candidate, updates, context = {} }) {
    if (!this._enabled) {
      const nowMs = this._now();
      const prepared = this._prepareEntries({
        name,
        before,
        after: candidate,
        updates,
        context,
        nowMs,
        decision: { allowed: true, blocked_reason: null, clamped: false, warnings: [] },
      });
      return {
        allowed: true,
        blocked_reason: null,
        parameter: candidate,
        warnings: [],
        audit_entry: prepared.audit_entry,
        learning_update: prepared.learning_update,
      };
    }

    if (!isPlainObject(before) || !isPlainObject(candidate)) {
      throw new Error('GovernanceValidator expects before/candidate parameter objects');
    }

    const nowMs = this._now();
    const warnings = [];
    const decision = {
      allowed: true,
      blocked_reason: null,
      clamped: false,
      warnings,
    };

    const auditEntries = listAuditEntries(this._auditLogPath);
    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * 60 * 60 * 1000;

    const hourEntries = auditEntries.filter((entry) => withinWindow(entry, nowMs, hourMs));
    const dayEntries = auditEntries.filter((entry) => withinWindow(entry, nowMs, dayMs));
    const hourForParam = hourEntries.filter((entry) => entry?.parameter === name);
    const dayForParam = dayEntries.filter((entry) => entry?.parameter === name);

    if (hourEntries.length >= this._rateLimits.globalPerHour) {
      decision.allowed = false;
      decision.blocked_reason = 'rate_limit_global_per_hour';
    } else if (dayEntries.length >= this._rateLimits.globalPerDay) {
      decision.allowed = false;
      decision.blocked_reason = 'rate_limit_global_per_day';
    } else if (hourForParam.length >= this._rateLimits.perParameterPerHour) {
      decision.allowed = false;
      decision.blocked_reason = 'rate_limit_per_parameter_per_hour';
    } else if (dayForParam.length >= this._rateLimits.perParameterPerDay) {
      decision.allowed = false;
      decision.blocked_reason = 'rate_limit_per_parameter_per_day';
    }

    if (!decision.allowed) {
      const prepared = this._prepareEntries({
        name,
        before,
        after: before,
        updates,
        context,
        nowMs,
        decision,
      });
      return {
        allowed: false,
        blocked_reason: decision.blocked_reason,
        parameter: before,
        warnings,
        audit_entry: prepared.audit_entry,
        learning_update: prepared.learning_update,
      };
    }

    let next = candidate;

    // Magnitude limiting (only applies to current_value changes).
    const beforeValue = before.current_value;
    const afterValue = candidate.current_value;
    const changedValue =
      typeof beforeValue === 'number' &&
      Number.isFinite(beforeValue) &&
      typeof afterValue === 'number' &&
      Number.isFinite(afterValue) &&
      afterValue !== beforeValue;

    if (changedValue) {
      const hard = candidate?.learning_config?.bounds?.hard;
      const hardMin = typeof hard?.min === 'number' && Number.isFinite(hard.min) ? hard.min : null;
      const hardMax = typeof hard?.max === 'number' && Number.isFinite(hard.max) ? hard.max : null;
      const hardRange =
        hardMin !== null && hardMax !== null && hardMax >= hardMin ? hardMax - hardMin : null;

      const paramGov = isPlainObject(candidate.governance) ? candidate.governance : null;
      const paramMaxAbs =
        typeof paramGov?.max_delta === 'number' && Number.isFinite(paramGov.max_delta)
          ? Math.abs(paramGov.max_delta)
          : null;
      const paramMaxFrac =
        typeof paramGov?.max_delta_fraction === 'number' && Number.isFinite(paramGov.max_delta_fraction)
          ? clamp(paramGov.max_delta_fraction, 0, 1)
          : null;

      const frac = paramMaxFrac !== null ? paramMaxFrac : this._magnitude.maxDeltaFractionOfHardRange;
      const fracCap = hardRange !== null ? hardRange * frac : Infinity;
      const absCap = paramMaxAbs !== null ? paramMaxAbs : this._magnitude.maxDeltaAbsolute;
      const maxDelta = Math.min(fracCap, absCap);

      if (Number.isFinite(maxDelta) && maxDelta >= 0) {
        const delta = afterValue - beforeValue;
        if (Math.abs(delta) > maxDelta) {
          const clampedValue = beforeValue + Math.sign(delta) * maxDelta;
          decision.clamped = true;
          warnings.push(
            `magnitude_clamped: requested delta ${delta} exceeds max_delta ${maxDelta}`
          );
          const boundedValue =
            hardMin !== null && hardMax !== null ? clamp(clampedValue, hardMin, hardMax) : clampedValue;
          next = { ...candidate, current_value: boundedValue };
        }
      }
    }

    // Correlation checks: dependencies + correlation groups.
    next = this._applyCorrelationGuards({
      registry,
      name,
      before,
      candidate: next,
      auditEntries,
      decision,
    });

    if (!decision.allowed) {
      const prepared = this._prepareEntries({
        name,
        before,
        after: before,
        updates,
        context,
        nowMs,
        decision,
      });
      return {
        allowed: false,
        blocked_reason: decision.blocked_reason,
        parameter: before,
        warnings,
        audit_entry: prepared.audit_entry,
        learning_update: prepared.learning_update,
      };
    }

    const prepared = this._prepareEntries({
      name,
      before,
      after: next,
      updates,
      context,
      nowMs,
      decision,
    });

    return {
      allowed: true,
      blocked_reason: null,
      parameter: next,
      warnings,
      audit_entry: prepared.audit_entry,
      learning_update: prepared.learning_update,
    };
  }

  /**
   * Write audit + learning update to disk.
   * Throws if it cannot record the audit trail.
   */
  commitChange({ audit_entry, learning_update }) {
    if (!isPlainObject(audit_entry)) {
      throw new Error('GovernanceValidator.commitChange requires audit_entry');
    }

    ensureDirExists(this._auditLogPath);
    fs.appendFileSync(this._auditLogPath, `${JSON.stringify(audit_entry)}\n`, 'utf8');

    let learningUpdatePath = null;
    if (isPlainObject(learning_update)) {
      ensureDirExists(this._learningUpdatesDir);
      const fileName = `${learning_update.date || isoDate(Date.now())}-${safeFileNameSegment(
        learning_update.id || 'hyper-param-change'
      )}.json`;
      learningUpdatePath = path.join(this._learningUpdatesDir, fileName);

      // Prefer id uniqueness over filename uniqueness.
      if (fs.existsSync(learningUpdatePath)) {
        const suffix = safeFileNameSegment(randomId().slice(0, 8));
        learningUpdatePath = learningUpdatePath.replace(/\.json$/i, `-${suffix}.json`);
      }

      fs.writeFileSync(learningUpdatePath, JSON.stringify(learning_update, null, 2), 'utf8');
    }

    return {
      auditLogPath: this._auditLogPath,
      learningUpdatePath,
    };
  }

  /**
   * Prepare a rollback update (does NOT apply; call commitChange + set state).
   */
  prepareRollback({ registry, name, steps = 1, context = {} }) {
    if (!registry) {
      throw new Error('GovernanceValidator.prepareRollback requires registry');
    }
    if (!Number.isInteger(steps) || steps < 1) {
      throw new Error('Invalid rollback steps: expected integer >= 1');
    }

    const auditEntries = listAuditEntries(this._auditLogPath)
      .filter((entry) => entry?.parameter === name)
      .filter((entry) => entry?.type === 'update' || entry?.type === 'rollback')
      .sort((a, b) => (a.epoch_ms || 0) - (b.epoch_ms || 0));

    if (auditEntries.length === 0) {
      throw new Error(`No audit history available to rollback: "${name}"`);
    }

    const current = registry.get(name);
    if (!current) {
      throw new Error(`Cannot rollback missing hyper-parameter: "${name}"`);
    }

    let cursor = auditEntries.length - 1;
    let targetValue = null;
    let consumed = 0;

    while (cursor >= 0 && consumed < steps) {
      const entry = auditEntries[cursor];
      const prevValue = entry?.previous?.current_value;
      if (typeof prevValue === 'number' && Number.isFinite(prevValue)) {
        targetValue = prevValue;
        consumed += 1;
      }
      cursor -= 1;
    }

    if (targetValue === null) {
      throw new Error(`Rollback failed: insufficient history for "${name}"`);
    }

    const nowMs = this._now();
    const after = { ...current, current_value: targetValue };
    const decision = {
      allowed: true,
      blocked_reason: null,
      clamped: false,
      warnings: [`rollback_steps:${steps}`],
    };
    const prepared = this._prepareEntries({
      name,
      before: current,
      after,
      updates: { current_value: targetValue },
      context: { ...context, action: 'rollback', rollback_steps: steps },
      nowMs,
      decision,
      overrideType: 'rollback',
    });

    return {
      parameter: after,
      updates: { current_value: targetValue },
      audit_entry: prepared.audit_entry,
      learning_update: prepared.learning_update,
    };
  }

  _applyCorrelationGuards({ registry, name, before, candidate, auditEntries, decision }) {
    const paramGov = isPlainObject(candidate.governance) ? candidate.governance : null;
    const deps = Array.isArray(paramGov?.dependencies) ? paramGov.dependencies : [];
    const group = typeof paramGov?.correlation_group === 'string' ? paramGov.correlation_group : null;

    const nowMs = this._now();
    const hourMs = 60 * 60 * 1000;

    if (group) {
      const groupChangesLastHour = auditEntries
        .filter((entry) => entry?.correlation?.group === group)
        .filter((entry) => withinWindow(entry, nowMs, hourMs));

      if (groupChangesLastHour.length >= this._correlation.maxGroupChangesPerHour) {
        decision.allowed = false;
        decision.blocked_reason = 'correlation_group_rate_limit';
        decision.warnings.push(`correlation_group_rate_limit: group=${group}`);
        return before;
      }
    }

    if (!deps.length) return candidate;

    const beforeValue = before.current_value;
    const afterValue = candidate.current_value;
    const changedValue =
      typeof beforeValue === 'number' &&
      Number.isFinite(beforeValue) &&
      typeof afterValue === 'number' &&
      Number.isFinite(afterValue) &&
      afterValue !== beforeValue;

    if (!changedValue) return candidate;

    const delta = afterValue - beforeValue;
    const hard = candidate?.learning_config?.bounds?.hard;
    const hardMin = typeof hard?.min === 'number' && Number.isFinite(hard.min) ? hard.min : null;
    const hardMax = typeof hard?.max === 'number' && Number.isFinite(hard.max) ? hard.max : null;
    const hardRange =
      hardMin !== null && hardMax !== null && hardMax >= hardMin ? hardMax - hardMin : null;
    const maxDeltaBase =
      hardRange !== null ? hardRange * this._magnitude.maxDeltaFractionOfHardRange : Infinity;
    const maxDeltaWhenCoupled = maxDeltaBase * this._correlation.dependencyMagnitudeMultiplier;

    const recentlyChangedDeps = [];
    for (const dep of deps) {
      if (typeof dep !== 'string' || !dep.trim()) continue;
      const depName = dep.trim();
      if (!registry?.has?.(depName)) continue;

      const depRecent = auditEntries
        .filter((entry) => entry?.parameter === depName)
        .filter((entry) => withinWindow(entry, this._now(), this._correlation.windowMs));

      if (depRecent.length > 0) {
        recentlyChangedDeps.push(depName);
      }
    }

    if (!recentlyChangedDeps.length) return candidate;

    if (Number.isFinite(maxDeltaWhenCoupled) && maxDeltaWhenCoupled >= 0 && Math.abs(delta) > maxDeltaWhenCoupled) {
      decision.clamped = true;
      decision.warnings.push(
        `correlation_clamped: deps_recently_changed=${recentlyChangedDeps.join(',')}`
      );
      const clampedValue = beforeValue + Math.sign(delta) * maxDeltaWhenCoupled;
      const boundedValue =
        hardMin !== null && hardMax !== null ? clamp(clampedValue, hardMin, hardMax) : clampedValue;
      return { ...candidate, current_value: boundedValue };
    }

    decision.warnings.push(
      `correlation_checked: deps_recently_changed=${recentlyChangedDeps.join(',')}`
    );
    return candidate;
  }

  _prepareEntries({ name, before, after, updates, context, nowMs, decision, overrideType = null }) {
    const type = overrideType || 'update';
    const delta =
      typeof before?.current_value === 'number' &&
      typeof after?.current_value === 'number' &&
      Number.isFinite(before.current_value) &&
      Number.isFinite(after.current_value)
        ? after.current_value - before.current_value
        : null;

    const gov = isPlainObject(after?.governance) ? after.governance : null;
    const correlation = {
      dependencies: Array.isArray(gov?.dependencies) ? gov.dependencies : [],
      group: typeof gov?.correlation_group === 'string' ? gov.correlation_group : null,
    };

    const auditId = `hp-audit-${nowMs}-${randomId().slice(0, 12)}`;
    const audit_entry = {
      id: auditId,
      type,
      at: toIso(nowMs),
      epoch_ms: nowMs,
      parameter: name,
      previous: {
        current_value: before?.current_value,
      },
      next: {
        current_value: after?.current_value,
      },
      delta,
      decision: {
        allowed: !!decision.allowed,
        blocked_reason: decision.blocked_reason || null,
        clamped: !!decision.clamped,
        warnings: Array.isArray(decision.warnings) ? decision.warnings.slice(0, 20) : [],
      },
      correlation,
      context: isPlainObject(context) ? { ...context } : {},
      updates: isPlainObject(updates)
        ? {
            keys: Object.keys(updates).slice(0, 50),
          }
        : null,
    };

    const date = isoDate(nowMs);
    const ts = toIso(nowMs);
    const safeParam = safeFileNameSegment(name);

    const risk = (() => {
      if (!decision.allowed) return 'low';
      if (type === 'rollback') return 'medium';
      if (decision.clamped) return 'medium';
      if (typeof delta === 'number' && Number.isFinite(delta) && Math.abs(delta) > 0) return 'low';
      return 'low';
    })();

    const learningUpdateId = `learning-${date}-hyper-param-${safeParam}-${nowMs}`;
    const learning_update = {
      id: learningUpdateId,
      date,
      timestamp: ts,
      summary: decision.allowed
        ? `${type === 'rollback' ? 'Rollback' : 'Update'} hyper-parameter "${name}" (${before?.current_value} -> ${after?.current_value})`
        : `Blocked hyper-parameter update for "${name}" (${decision.blocked_reason})`,
      affected_paths: [
        'opencode-config/hyper-parameter-registry.json',
        'opencode-config/learning-updates/',
      ],
      validation: {
        tests: 'not-run',
        lint: 'not-run',
        typecheck: 'not-run',
      },
      risk_level: risk,
      notes: decision.allowed
        ? 'Governance validated and recorded hyper-parameter change.'
        : 'Governance blocked hyper-parameter change; audit entry recorded.',
      meta: {
        audit_id: auditId,
        parameter: name,
        previous_value: before?.current_value,
        next_value: after?.current_value,
        delta,
        decision: {
          blocked_reason: decision.blocked_reason || null,
          clamped: !!decision.clamped,
          warnings: Array.isArray(decision.warnings) ? decision.warnings.slice(0, 20) : [],
        },
        correlation,
        context: isPlainObject(context) ? { ...context } : {},
      },
    };

    return { audit_entry, learning_update };
  }
}

module.exports = {
  GovernanceValidator,
};
