'use strict';

const fs = require('fs');
const path = require('path');

const { GovernanceValidator } = require('./governance-validator');

const PARAMETER_NAME_RE = /^[a-z][a-z0-9_]*$/;
const DEFAULT_REGISTRY_PATH = path.join(
  process.cwd(),
  'opencode-config',
  'hyper-parameter-registry.json'
);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureString(value, fieldPath) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${fieldPath}: expected non-empty string`);
  }
}

function ensureFiniteNumber(value, fieldPath) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${fieldPath}: expected finite number`);
  }
}

function ensureBoolean(value, fieldPath) {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${fieldPath}: expected boolean`);
  }
}

function ensureInteger(value, fieldPath, min = 0) {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Invalid ${fieldPath}: expected integer >= ${min}`);
  }
}

function ensureRange(value, fieldPath, min, max) {
  ensureFiniteNumber(value, fieldPath);
  if (value < min || value > max) {
    throw new Error(`Invalid ${fieldPath}: expected ${min} <= value <= ${max}`);
  }
}

function validateParameterName(name, fieldPath = 'name') {
  if (typeof name !== 'string' || !PARAMETER_NAME_RE.test(name)) {
    throw new Error(
      `Invalid ${fieldPath}: "${name}" does not match ${PARAMETER_NAME_RE}`
    );
  }
}

function validateBounds(bounds, fieldPath) {
  if (!isPlainObject(bounds)) {
    throw new Error(`Invalid ${fieldPath}: expected object`);
  }

  for (const boundName of ['soft', 'hard']) {
    const bound = bounds[boundName];
    const boundPath = `${fieldPath}.${boundName}`;

    if (!isPlainObject(bound)) {
      throw new Error(`Invalid ${boundPath}: expected object`);
    }

    ensureFiniteNumber(bound.min, `${boundPath}.min`);
    ensureFiniteNumber(bound.max, `${boundPath}.max`);

    if (bound.min > bound.max) {
      throw new Error(
        `Invalid ${boundPath}: min (${bound.min}) must be <= max (${bound.max})`
      );
    }
  }

  if (bounds.soft.min < bounds.hard.min || bounds.soft.max > bounds.hard.max) {
    throw new Error(
      `Invalid ${fieldPath}: soft bounds must stay within hard bounds`
    );
  }
}

function validateLearningConfig(learningConfig, fieldPath = 'learning_config') {
  if (!isPlainObject(learningConfig)) {
    throw new Error(`Invalid ${fieldPath}: expected object`);
  }

  ensureString(learningConfig.adaptation_strategy, `${fieldPath}.adaptation_strategy`);

  if (!isPlainObject(learningConfig.triggers)) {
    throw new Error(`Invalid ${fieldPath}.triggers: expected object`);
  }

  ensureString(learningConfig.triggers.outcome_type, `${fieldPath}.triggers.outcome_type`);
  ensureInteger(learningConfig.triggers.min_samples, `${fieldPath}.triggers.min_samples`, 1);
  ensureRange(
    learningConfig.triggers.confidence_threshold,
    `${fieldPath}.triggers.confidence_threshold`,
    0,
    1
  );

  validateBounds(learningConfig.bounds, `${fieldPath}.bounds`);

  if (!isPlainObject(learningConfig.exploration_policy)) {
    throw new Error(`Invalid ${fieldPath}.exploration_policy: expected object`);
  }

  ensureBoolean(
    learningConfig.exploration_policy.enabled,
    `${fieldPath}.exploration_policy.enabled`
  );
  ensureRange(
    learningConfig.exploration_policy.epsilon,
    `${fieldPath}.exploration_policy.epsilon`,
    0,
    1
  );
  ensureRange(
    learningConfig.exploration_policy.annealing_rate,
    `${fieldPath}.exploration_policy.annealing_rate`,
    0,
    1
  );
}

function validateGrouping(grouping, fieldPath = 'grouping') {
  if (!isPlainObject(grouping)) {
    throw new Error(`Invalid ${fieldPath}: expected object`);
  }

  ensureBoolean(grouping.group_by_task_type, `${fieldPath}.group_by_task_type`);
  ensureBoolean(grouping.group_by_complexity, `${fieldPath}.group_by_complexity`);
  ensureString(grouping.aggregate_function, `${fieldPath}.aggregate_function`);
}

function validateIndividualTracking(individualTracking, fieldPath = 'individual_tracking') {
  if (!isPlainObject(individualTracking)) {
    throw new Error(`Invalid ${fieldPath}: expected object`);
  }

  ensureBoolean(individualTracking.per_session, `${fieldPath}.per_session`);
  ensureBoolean(individualTracking.per_task, `${fieldPath}.per_task`);
}

function validateHyperParameter(parameter, expectedName) {
  if (!isPlainObject(parameter)) {
    throw new Error('Invalid hyper-parameter: expected object');
  }

  const missing = [];
  for (const field of [
    'name',
    'current_value',
    'learning_config',
    'grouping',
    'individual_tracking',
  ]) {
    if (!(field in parameter)) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Hyper-parameter validation failed — missing required field(s): ${missing.join(', ')}`
    );
  }

  validateParameterName(parameter.name, 'name');

  if (expectedName && parameter.name !== expectedName) {
    throw new Error(
      `Hyper-parameter name mismatch: expected "${expectedName}", got "${parameter.name}"`
    );
  }

  ensureFiniteNumber(parameter.current_value, 'current_value');

  validateLearningConfig(parameter.learning_config);
  validateGrouping(parameter.grouping);
  validateIndividualTracking(parameter.individual_tracking);

  const hard = parameter.learning_config.bounds.hard;
  if (parameter.current_value < hard.min || parameter.current_value > hard.max) {
    throw new Error(
      `Invalid current_value: ${parameter.current_value} must be within hard bounds [${hard.min}, ${hard.max}]`
    );
  }

  return true;
}

function normalizeParameterCollection(input) {
  if (Array.isArray(input)) {
    return input;
  }

  if (!isPlainObject(input)) {
    throw new Error('Invalid parameter collection: expected array or object');
  }

  if (Array.isArray(input.parameters)) {
    return input.parameters;
  }

  return Object.entries(input).map(([key, value]) => {
    if (!isPlainObject(value)) {
      return value;
    }
    return {
      ...value,
      name: value.name || key,
    };
  });
}

function buildValidatedMap(parameterCollection) {
  const parameters = normalizeParameterCollection(parameterCollection);
  const next = new Map();

  for (const parameter of parameters) {
    validateHyperParameter(parameter);

    if (next.has(parameter.name)) {
      throw new Error(`Duplicate hyper-parameter name: "${parameter.name}"`);
    }

    next.set(parameter.name, deepClone(parameter));
  }

  return next;
}

function deepMerge(baseValue, patchValue) {
  if (Array.isArray(patchValue)) {
    return deepClone(patchValue);
  }

  if (isPlainObject(baseValue) && isPlainObject(patchValue)) {
    const merged = { ...baseValue };

    for (const [key, value] of Object.entries(patchValue)) {
      if (key in baseValue) {
        merged[key] = deepMerge(baseValue[key], value);
      } else {
        merged[key] = deepClone(value);
      }
    }

    return merged;
  }

  return deepClone(patchValue);
}

class HyperParameterRegistry {
  constructor(options = {}) {
    this._persistPath = options.persistPath || DEFAULT_REGISTRY_PATH;
    this._schemaVersion = options.schemaVersion || '1.0.0';
    this._parameters = new Map();

    const governanceOptions = options.governance;
    if (governanceOptions === false) {
      this._governance = null;
    } else {
      const baseDir = path.dirname(this._persistPath);
      const mergedGovernance = isPlainObject(governanceOptions) ? { ...governanceOptions } : {};
      mergedGovernance.auditLogPath =
        typeof mergedGovernance.auditLogPath === 'string' && mergedGovernance.auditLogPath.trim()
          ? mergedGovernance.auditLogPath
          : path.join(baseDir, 'hyper-parameter-audit.jsonl');
      mergedGovernance.learningUpdatesDir =
        typeof mergedGovernance.learningUpdatesDir === 'string' && mergedGovernance.learningUpdatesDir.trim()
          ? mergedGovernance.learningUpdatesDir
          : path.join(process.cwd(), 'opencode-config', 'learning-updates');
      this._governance = new GovernanceValidator(mergedGovernance);
    }

    const defaults = options.defaults || options.defaultParameters || [];
    this._parameters = buildValidatedMap(defaults);

    if (options.autoLoad !== false) {
      this.load(this._persistPath);
    }
  }

  create(parameter) {
    validateHyperParameter(parameter);

    if (this._parameters.has(parameter.name)) {
      throw new Error(`Hyper-parameter already exists: "${parameter.name}"`);
    }

    this._parameters.set(parameter.name, deepClone(parameter));
    return this.get(parameter.name);
  }

  register(parameter) {
    return this.create(parameter);
  }

  get(name) {
    validateParameterName(name);
    const found = this._parameters.get(name);
    return found ? deepClone(found) : null;
  }

  read(name) {
    return this.get(name);
  }

  list() {
    return Array.from(this._parameters.values(), (entry) => deepClone(entry));
  }

  has(name) {
    validateParameterName(name);
    return this._parameters.has(name);
  }

  update(name, updates) {
    validateParameterName(name);

    if (!this._parameters.has(name)) {
      throw new Error(`Cannot update missing hyper-parameter: "${name}"`);
    }

    if (!isPlainObject(updates)) {
      throw new Error('Invalid updates: expected object');
    }

    const current = this._parameters.get(name);
    const merged = deepMerge(current, updates);
    merged.name = name;

    // No-op updates should not create governance artifacts.
    try {
      if (JSON.stringify(current) === JSON.stringify(merged)) {
        return this.get(name);
      }
    } catch {
      // If serialization fails, fall through and treat as a real update.
    }

    let governed = null;
    if (this._governance) {
      governed = this._governance.validateAndPrepareChange({
        registry: this,
        name,
        before: deepClone(current),
        candidate: deepClone(merged),
        updates: deepClone(updates),
        context: {
          action: 'update',
        },
      });

      if (!governed.allowed) {
        // Record blocked attempts (audit trail + learning-update entry), then fail.
        this._governance.commitChange({
          audit_entry: governed.audit_entry,
          learning_update: governed.learning_update,
        });
        throw new Error(`Governance blocked hyper-parameter update: ${governed.blocked_reason}`);
      }

      // Allow validator to clamp/normalize candidate.
      merged.current_value = governed.parameter.current_value;
      if (governed.parameter.governance !== undefined) {
        merged.governance = deepClone(governed.parameter.governance);
      }
    }

    validateHyperParameter(merged, name);

    if (this._governance && governed) {
      // Record successful changes only after schema validation, but before mutation.
      this._governance.commitChange({
        audit_entry: governed.audit_entry,
        learning_update: governed.learning_update,
      });
    }

    this._parameters.set(name, merged);
    return this.get(name);
  }

  rollback(name, steps = 1, context = {}) {
    validateParameterName(name);
    if (!this._governance) {
      throw new Error('Rollback requires governance to be enabled');
    }

    const prepared = this._governance.prepareRollback({
      registry: this,
      name,
      steps,
      context: isPlainObject(context) ? context : {},
    });

    const current = this._parameters.get(name);
    if (!current) {
      throw new Error(`Cannot rollback missing hyper-parameter: "${name}"`);
    }

    const merged = deepMerge(current, prepared.updates);
    merged.name = name;
    validateHyperParameter(merged, name);

    this._governance.commitChange({
      audit_entry: prepared.audit_entry,
      learning_update: prepared.learning_update,
    });

    this._parameters.set(name, merged);
    return this.get(name);
  }

  delete(name) {
    validateParameterName(name);
    return this._parameters.delete(name);
  }

  remove(name) {
    return this.delete(name);
  }

  clear() {
    this._parameters.clear();
  }

  load(filePath = this._persistPath) {
    let raw;

    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch {
      return false;
    }

    if (!raw || !raw.trim()) {
      return false;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn(`[HyperParameterRegistry] Corrupt registry file at ${filePath}: ${err.message}`);
      return false;
    }

    try {
      const next = buildValidatedMap(parsed);
      this._parameters = next;
      return true;
    } catch (err) {
      console.warn(`[HyperParameterRegistry] Invalid registry payload at ${filePath}: ${err.message}`);
      return false;
    }
  }

  save(filePath = this._persistPath) {
    const targetDir = path.dirname(filePath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const payload = {
      schema_version: this._schemaVersion,
      saved_at: new Date().toISOString(),
      parameters: this.list(),
    };

    const serialized = JSON.stringify(payload, null, 2);
    const tmpPath = `${filePath}.tmp`;

    try {
      fs.writeFileSync(tmpPath, serialized, 'utf8');
      fs.renameSync(tmpPath, filePath);

      // Atomic write verification (detect disk corruption or partial writes).
      const persisted = fs.readFileSync(filePath, 'utf8');
      if (persisted !== serialized) {
        throw new Error(`Registry verification failed for ${filePath}`);
      }
    } catch (err) {
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch {
        // no-op
      }

      throw err;
    }

    return filePath;
  }

  toJSON() {
    return {
      schema_version: this._schemaVersion,
      parameters: this.list(),
    };
  }
}

module.exports = {
  HyperParameterRegistry,
  PARAMETER_NAME_RE,
  validateHyperParameter,
  GovernanceValidator,
};
