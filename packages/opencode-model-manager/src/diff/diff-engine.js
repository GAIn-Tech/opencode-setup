'use strict';

const SIGNIFICANT_CONTEXT_CHANGE_THRESHOLD = 0.2;

class DiffEngine {
  compare(oldSnapshot, newSnapshot) {
    const previousSnapshot = normalizeSnapshot(oldSnapshot);
    const nextSnapshot = normalizeSnapshot(newSnapshot);
    const previousModels = indexModelsById(previousSnapshot.models);
    const nextModels = indexModelsById(nextSnapshot.models);
    const timestamp = Number.isFinite(nextSnapshot.timestamp)
      ? nextSnapshot.timestamp
      : Date.now();

    const added = [];
    const removed = [];
    const modified = [];

    for (const [modelId, nextModel] of nextModels.entries()) {
      const previousModel = previousModels.get(modelId);

      if (!previousModel) {
        added.push(this._buildChangeRecord('added', 'major', nextModel, null, nextSnapshot, timestamp));
        continue;
      }

      const changes = this.detectFieldChanges(previousModel, nextModel);
      if (Object.keys(changes).length === 0) {
        continue;
      }

      const classification = this.classifyChange(previousModel, nextModel);
      modified.push(this._buildChangeRecord('modified', classification, nextModel, changes, nextSnapshot, timestamp));
    }

    for (const [modelId, previousModel] of previousModels.entries()) {
      if (nextModels.has(modelId)) {
        continue;
      }

      removed.push(this._buildChangeRecord('removed', 'major', previousModel, null, nextSnapshot, timestamp));
    }

    return {
      added,
      removed,
      modified
    };
  }

  classifyChange(oldModel, newModel) {
    if (!isObject(oldModel) || !isObject(newModel)) {
      return 'major';
    }

    const oldDeprecated = Boolean(oldModel.deprecated);
    const newDeprecated = Boolean(newModel.deprecated);
    if (oldDeprecated !== newDeprecated) {
      return 'major';
    }

    const oldContext = Number(oldModel.contextTokens);
    const newContext = Number(newModel.contextTokens);

    if (isPositiveNumber(oldContext) && isPositiveNumber(newContext)) {
      const changeRatio = Math.abs(newContext - oldContext) / oldContext;
      if (changeRatio > SIGNIFICANT_CONTEXT_CHANGE_THRESHOLD) {
        return 'major';
      }
    }

    return 'minor';
  }

  detectFieldChanges(oldModel, newModel) {
    const changes = {};

    if (!isObject(oldModel) || !isObject(newModel)) {
      return changes;
    }

    collectFieldChanges(oldModel, newModel, '', changes);
    return changes;
  }

  _buildChangeRecord(type, classification, model, changes, snapshot, timestamp) {
    const provider = resolveProvider(model, snapshot);

    return {
      type,
      classification,
      model: cloneValue(model),
      changes: changes ? cloneValue(changes) : null,
      provider,
      timestamp
    };
  }
}

function normalizeSnapshot(snapshot) {
  if (!isObject(snapshot)) {
    return {
      provider: '',
      timestamp: Date.now(),
      models: []
    };
  }

  return {
    provider: String(snapshot.provider || ''),
    timestamp: Number.isFinite(Number(snapshot.timestamp))
      ? Number(snapshot.timestamp)
      : Date.now(),
    models: Array.isArray(snapshot.models) ? snapshot.models : []
  };
}

function indexModelsById(models) {
  const index = new Map();

  for (const model of models) {
    if (!isObject(model)) {
      continue;
    }

    const modelId = String(model.id || '').trim();
    if (!modelId) {
      continue;
    }

    index.set(modelId, model);
  }

  return index;
}

function collectFieldChanges(oldValue, newValue, path, changes) {
  const oldIsObject = isObject(oldValue);
  const newIsObject = isObject(newValue);

  if (oldIsObject && newIsObject) {
    const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
    const sortedKeys = [...keys].sort();

    for (const key of sortedKeys) {
      const nextPath = path ? `${path}.${key}` : key;
      collectFieldChanges(oldValue[key], newValue[key], nextPath, changes);
    }

    return;
  }

  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    if (!areValuesEqual(oldValue, newValue)) {
      changes[path] = {
        old: cloneValue(oldValue),
        new: cloneValue(newValue)
      };
    }
    return;
  }

  if (!areValuesEqual(oldValue, newValue)) {
    changes[path] = {
      old: cloneValue(oldValue),
      new: cloneValue(newValue)
    };
  }
}

function areValuesEqual(left, right) {
  if (left === right) {
    return true;
  }

  if (typeof left !== typeof right) {
    return false;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      if (!areValuesEqual(left[index], right[index])) {
        return false;
      }
    }

    return true;
  }

  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) {
        return false;
      }

      if (!areValuesEqual(left[key], right[key])) {
        return false;
      }
    }

    return true;
  }

  if (Number.isNaN(left) && Number.isNaN(right)) {
    return true;
  }

  return false;
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (isObject(value)) {
    const clone = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      clone[key] = cloneValue(nestedValue);
    }

    return clone;
  }

  return value;
}

function resolveProvider(model, snapshot) {
  if (isObject(model) && typeof model.provider === 'string' && model.provider.length > 0) {
    return model.provider;
  }

  if (snapshot && typeof snapshot.provider === 'string' && snapshot.provider.length > 0) {
    return snapshot.provider;
  }

  return '';
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

module.exports = {
  DiffEngine
};
