'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = require('path').join(
  process.env.HOME || process.env.USERPROFILE || require('os').homedir(),
  '.opencode',
  'lifecycle.db'
);

const LIFECYCLE_STATES = Object.freeze({
  DETECTED: 'detected',
  ASSESSED: 'assessed',
  APPROVED: 'approved',
  SELECTABLE: 'selectable',
  DEFAULT: 'default'
});

const STATE_ORDER = Object.freeze([
  LIFECYCLE_STATES.DETECTED,
  LIFECYCLE_STATES.ASSESSED,
  LIFECYCLE_STATES.APPROVED,
  LIFECYCLE_STATES.SELECTABLE,
  LIFECYCLE_STATES.DEFAULT
]);

class StateMachine {
  constructor(options = {}) {
    this.dbPath = path.resolve(options.dbPath || DEFAULT_DB_PATH);
    this.onStateChange = typeof options.onStateChange === 'function'
      ? options.onStateChange
      : null;

    this.updateCatalog = resolveSideEffect(options.updateCatalog);
    this.addToUiModelList = resolveSideEffect(options.addToUiModelList);
    this.updateDefaultModelConfig = resolveSideEffect(options.updateDefaultModelConfig);

    this.transitionLocks = new Map();

    this._initializeDatabase();
  }

  async transition(modelId, toState, context = {}) {
    const resolvedModelId = this._resolveModelId(modelId);
    const nextState = normalizeState(toState);
    const transitionContext = isObject(context) ? context : {};

    if (!nextState) {
      throw createStateError('INVALID_STATE', `Unknown lifecycle state "${toState}"`);
    }

    return this._withModelLock(resolvedModelId, async () => {
      const current = this._getStateRow(resolvedModelId);
      if (!current) {
        throw createStateError(
          'MODEL_NOT_INITIALIZED',
          `Model "${resolvedModelId}" does not have an initialized lifecycle state`
        );
      }

      const expectedNextState = getNextState(current.currentState);
      if (expectedNextState !== nextState) {
        throw createStateError(
          'INVALID_TRANSITION',
          `Invalid transition for "${resolvedModelId}": ${current.currentState} -> ${nextState}`
        );
      }

      const guard = this._evaluateGuard(nextState, transitionContext, current.metadata);
      if (!guard.ok) {
        throw createStateError(
          'TRANSITION_GUARD_FAILED',
          guard.reason || `Guard failed for transition ${current.currentState} -> ${nextState}`
        );
      }

const timestamp = Number.isFinite(Number(transitionContext.timestamp))
        ? Math.floor(Number(transitionContext.timestamp))
        : Date.now();
      
      const sideEffects = await this._runSideEffects(
        resolvedModelId,
        current.currentState,
        nextState,
        transitionContext,
        current.metadata
      );
      const nextMetadata = this._buildNextMetadata(current.metadata, nextState, transitionContext, sideEffects);

      this._persistTransition({
        modelId: resolvedModelId,
        fromState: current.currentState,
        toState: nextState,
        timestamp,
        context: transitionContext,
        sideEffects,
        metadata: nextMetadata
      });

      this._emitStateChange({
        modelId: resolvedModelId,
        fromState: current.currentState,
        toState: nextState,
        timestamp,
        context: cloneValue(transitionContext),
        sideEffects: cloneValue(sideEffects)
      });

      return nextState;
    });
  }

  async canTransition(modelId, toState, context = {}) {
    const resolvedModelId = this._resolveModelId(modelId);
    const nextState = normalizeState(toState);
    const transitionContext = isObject(context) ? context : {};

    if (!nextState) {
      return false;
    }

    return this._withModelLock(resolvedModelId, async () => {
      const current = this._getStateRow(resolvedModelId);
      if (!current) {
        return nextState === LIFECYCLE_STATES.DETECTED;
      }

      const expectedNextState = getNextState(current.currentState);
      if (expectedNextState !== nextState) {
        return false;
      }

      const guard = this._evaluateGuard(nextState, transitionContext, current.metadata);
      return guard.ok;
    });
  }

  async getState(modelId) {
    const resolvedModelId = this._resolveModelId(modelId);
    const row = this._getStateRow(resolvedModelId);
    return row ? row.currentState : null;
  }

async getHistory(modelId, options = {}) {
      const resolvedModelId = this._resolveModelId(modelId);
      const { limit = 100, offset = 0 } = options;
      
      const rows = this.db.all(`
        SELECT id, model_id, from_state, to_state, context_json, side_effects_json, timestamp
        FROM model_lifecycle_history
        WHERE model_id = ?
        ORDER BY id ASC
        LIMIT ? OFFSET ?
      `, [resolvedModelId, limit, offset]);
      
      return rows.map((row) => {
        return {
         id: row.id,
         modelId: row.model_id,
         fromState: row.from_state || null,
         toState: row.to_state,
         context: parseJsonSafely(row.context_json, {}),
         sideEffects: parseJsonSafely(row.side_effects_json, {}),
         timestamp: Number.isFinite(Number(row.timestamp))
           ? Number(row.timestamp)
           : 0
       };
     });
   }

  async setState(modelId, state, context = {}) {
    const resolvedModelId = this._resolveModelId(modelId);
    const nextState = normalizeState(state);
    const transitionContext = isObject(context) ? context : {};

    if (!nextState) {
      throw createStateError('INVALID_STATE', `Unknown lifecycle state "${state}"`);
    }

    if (nextState !== LIFECYCLE_STATES.DETECTED) {
      throw createStateError(
        'INVALID_INITIAL_STATE',
        `Initial lifecycle state must be "${LIFECYCLE_STATES.DETECTED}"`
      );
    }

    return this._withModelLock(resolvedModelId, async () => {
      const existing = this._getStateRow(resolvedModelId);
      if (existing) {
        throw createStateError(
          'STATE_ALREADY_INITIALIZED',
          `Model "${resolvedModelId}" already has lifecycle state "${existing.currentState}"`
        );
      }

      const metadata = this._buildNextMetadata({}, nextState, transitionContext, {});
      const timestamp = Number.isFinite(Number(transitionContext.timestamp))
        ? Math.floor(Number(transitionContext.timestamp))
        : Date.now();

      this._persistTransition({
        modelId: resolvedModelId,
        fromState: null,
        toState: nextState,
        timestamp,
        context: transitionContext,
        sideEffects: {},
        metadata
      });

      this._emitStateChange({
        modelId: resolvedModelId,
        fromState: null,
        toState: nextState,
        timestamp,
        context: cloneValue(transitionContext),
        sideEffects: {}
      });

      return nextState;
    });
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  _initializeDatabase() {
    const directory = path.dirname(this.dbPath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    this.db = createSqliteClient(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_lifecycle_states (
        model_id TEXT PRIMARY KEY,
        current_state TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS model_lifecycle_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id TEXT NOT NULL,
        from_state TEXT,
        to_state TEXT NOT NULL,
        context_json TEXT NOT NULL,
        side_effects_json TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_lifecycle_history_model_timestamp
        ON model_lifecycle_history(model_id, timestamp DESC);
    `);
  }

  _getStateRow(modelId) {
    const row = this.db.get(
      `
      SELECT model_id, current_state, metadata_json, updated_at
      FROM model_lifecycle_states
      WHERE model_id = ?
      LIMIT 1
      `,
      [modelId]
    );

    if (!row) {
      return null;
    }

    const normalizedState = normalizeState(row.current_state);
    if (!normalizedState) {
      return null;
    }

    return {
      modelId: row.model_id,
      currentState: normalizedState,
      metadata: parseJsonSafely(row.metadata_json, {}),
      updatedAt: Number.isFinite(Number(row.updated_at))
        ? Number(row.updated_at)
        : 0
    };
  }

  _evaluateGuard(toState, context, metadata) {
    if (toState === LIFECYCLE_STATES.ASSESSED) {
      if (hasAssessmentResults(context)) {
        return { ok: true };
      }

      return {
        ok: false,
        reason: 'Assessment results are required before transitioning to assessed'
      };
    }

    if (toState === LIFECYCLE_STATES.APPROVED) {
      if (hasApproval(context)) {
        return { ok: true };
      }

      return {
        ok: false,
        reason: 'Approval context is required before transitioning to approved'
      };
    }

    if (toState === LIFECYCLE_STATES.SELECTABLE) {
      const catalogUpdated = isCatalogUpdated(context, metadata);
      if (catalogUpdated) {
        return { ok: true };
      }

      return {
        ok: false,
        reason: 'Catalog update must complete before transitioning to selectable'
      };
    }

    if (toState === LIFECYCLE_STATES.DEFAULT) {
      if (hasIntentCategoryAssignment(context)) {
        return { ok: true };
      }

      return {
        ok: false,
        reason: 'Intent and category assignment are required before transitioning to default'
      };
    }

    return { ok: true };
  }

  async _runSideEffects(modelId, fromState, toState, context, metadata) {
    void fromState;
    void metadata;

    if (toState === LIFECYCLE_STATES.APPROVED) {
      const result = await this.updateCatalog(modelId, cloneValue(context));
      if (result === false) {
        throw createStateError('SIDE_EFFECT_FAILED', 'updateCatalog side effect failed');
      }

      return {
        catalogUpdated: true,
        updateCatalog: normalizeSideEffectResult(result)
      };
    }

    if (toState === LIFECYCLE_STATES.SELECTABLE) {
      const result = await this.addToUiModelList(modelId, cloneValue(context));
      if (result === false) {
        throw createStateError('SIDE_EFFECT_FAILED', 'addToUiModelList side effect failed');
      }

      return {
        uiModelListUpdated: true,
        addToUiModelList: normalizeSideEffectResult(result)
      };
    }

    if (toState === LIFECYCLE_STATES.DEFAULT) {
      const result = await this.updateDefaultModelConfig(modelId, cloneValue(context));
      if (result === false) {
        throw createStateError('SIDE_EFFECT_FAILED', 'updateDefaultModelConfig side effect failed');
      }

      return {
        defaultModelConfigured: true,
        updateDefaultModelConfig: normalizeSideEffectResult(result)
      };
    }

    return {};
  }

  _buildNextMetadata(currentMetadata, toState, context, sideEffects) {
    const nextMetadata = isObject(currentMetadata)
      ? cloneValue(currentMetadata)
      : {};

    if (!isObject(nextMetadata.sideEffects)) {
      nextMetadata.sideEffects = {};
    }

    if (toState === LIFECYCLE_STATES.ASSESSED) {
      nextMetadata.assessmentResults = extractAssessmentResults(context);
    }

    if (toState === LIFECYCLE_STATES.APPROVED) {
      nextMetadata.approval = extractApprovalContext(context);
    }

    if (toState === LIFECYCLE_STATES.DEFAULT) {
      nextMetadata.defaultAssignment = extractIntentCategoryAssignment(context);
    }

    if (sideEffects.catalogUpdated) {
      nextMetadata.sideEffects.catalogUpdated = true;
    }

    if (sideEffects.uiModelListUpdated) {
      nextMetadata.sideEffects.uiModelListUpdated = true;
    }

    if (sideEffects.defaultModelConfigured) {
      nextMetadata.sideEffects.defaultModelConfigured = true;
    }

    const predictivePerformance = buildPredictivePerformanceWeight({
      toState,
      context,
      metadata: nextMetadata,
    });

    if (predictivePerformance) {
      nextMetadata.predictivePerformance = predictivePerformance;
    }

    return nextMetadata;
  }

  _persistTransition(payload) {
    let transactionOpen = false;

    try {
      this.db.exec('BEGIN IMMEDIATE');
      transactionOpen = true;

      // Verify state hasn't changed since we read it
      const currentRow = this.db.get(
        'SELECT current_state FROM model_lifecycle_states WHERE model_id = ?',
        [payload.modelId]
      );
      const currentDbState = currentRow ? currentRow.current_state : null;
      if (currentDbState !== null && currentDbState !== payload.fromState) {
        this.db.run('ROLLBACK');
        transactionOpen = false;
        throw createStateError(
          'STALE_STATE',
          `Transition conflict for model ${payload.modelId}: expected state "${payload.fromState}" but database has "${currentDbState}" (concurrent modification detected)`
        );
      }

      this.db.run(
        `
        INSERT INTO model_lifecycle_states (
          model_id, current_state, metadata_json, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(model_id) DO UPDATE SET
          current_state = excluded.current_state,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
        `,
        [
          payload.modelId,
          payload.toState,
          JSON.stringify(payload.metadata || {}),
          payload.timestamp
        ]
      );

      this.db.run(
        `
        INSERT INTO model_lifecycle_history (
          model_id, from_state, to_state, context_json, side_effects_json, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          payload.modelId,
          payload.fromState,
          payload.toState,
          JSON.stringify(payload.context || {}),
          JSON.stringify(payload.sideEffects || {}),
          payload.timestamp
        ]
      );

      this.db.exec('COMMIT');
      transactionOpen = false;
    } catch (error) {
      if (transactionOpen) {
        try {
          this.db.exec('ROLLBACK');
        } catch (_rollbackError) {
          // ignore rollback errors after original failure
        }
      }

      throw error;
    }
  }

  _emitStateChange(payload) {
    if (!this.onStateChange) {
      return;
    }

    try {
      this.onStateChange(payload);
    } catch (_error) {
      // onStateChange is best-effort and should not break persistence
    }
  }

  _resolveModelId(modelId) {
    if (typeof modelId === 'string' && modelId.length > 0) {
      return modelId;
    }

    if (modelId && typeof modelId === 'object' && typeof modelId.id === 'string' && modelId.id.length > 0) {
      return modelId.id;
    }

    throw createStateError('INVALID_MODEL_ID', 'Model id must be a non-empty string');
  }

  async _withModelLock(modelId, fn) {
    const previousLock = this.transitionLocks.get(modelId) || Promise.resolve();
    let releaseLock;
    const currentLock = new Promise((resolve) => {
      releaseLock = resolve;
    });

    this.transitionLocks.set(modelId, currentLock);
    await previousLock;

    try {
      return await fn();
    } finally {
      releaseLock();
      if (this.transitionLocks.get(modelId) === currentLock) {
        this.transitionLocks.delete(modelId);
      }
    }
  }
}

function getNextState(state) {
  const currentIndex = STATE_ORDER.indexOf(state);
  if (currentIndex === -1) {
    return null;
  }

  if (currentIndex >= STATE_ORDER.length - 1) {
    return null;
  }

  return STATE_ORDER[currentIndex + 1];
}

function hasAssessmentResults(context) {
  const assessmentResults = extractAssessmentResults(context);
  return Object.keys(assessmentResults).length > 0;
}

function extractAssessmentResults(context) {
  if (!isObject(context)) {
    return {};
  }

  if (isObject(context.assessmentResults)) {
    return cloneValue(context.assessmentResults);
  }

  if (isObject(context.assessment)) {
    return cloneValue(context.assessment);
  }

  return {};
}

function hasApproval(context) {
  if (!isObject(context)) {
    return false;
  }

  if (context.approved === true || context.autoApproved === true) {
    return true;
  }

  if (typeof context.approvedBy === 'string' && context.approvedBy.trim().length > 0) {
    return true;
  }

  if (isObject(context.approval)) {
    if (context.approval.approved === true || context.approval.autoApproved === true) {
      return true;
    }

    if (typeof context.approval.by === 'string' && context.approval.by.trim().length > 0) {
      return true;
    }
  }

  return false;
}

function extractApprovalContext(context) {
  if (!isObject(context)) {
    return {};
  }

  if (isObject(context.approval)) {
    return cloneValue(context.approval);
  }

  const approval = {};

  if (context.approved === true) {
    approval.approved = true;
  }

  if (context.autoApproved === true) {
    approval.autoApproved = true;
  }

  if (typeof context.approvedBy === 'string' && context.approvedBy.trim().length > 0) {
    approval.by = context.approvedBy;
  }

  return approval;
}

function isCatalogUpdated(context, metadata) {
  if (isObject(context) && context.catalogUpdated === true) {
    return true;
  }

  if (!isObject(metadata) || !isObject(metadata.sideEffects)) {
    return false;
  }

  return metadata.sideEffects.catalogUpdated === true;
}

function hasIntentCategoryAssignment(context) {
  const assignment = extractIntentCategoryAssignment(context);
  return Boolean(assignment.intent && assignment.category);
}

function extractIntentCategoryAssignment(context) {
  if (!isObject(context)) {
    return {};
  }

  if (isObject(context.assignment)) {
    const intent = toNonEmptyString(context.assignment.intent);
    const category = toNonEmptyString(context.assignment.category);
    if (intent && category) {
      return { intent, category };
    }
  }

  const intent = toNonEmptyString(context.intent);
  const category = toNonEmptyString(context.category);

  if (!intent || !category) {
    return {};
  }

  return { intent, category };
}

function toNonEmptyString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  return normalized;
}

function resolveSideEffect(fn) {
  if (typeof fn === 'function') {
    return fn;
  }

  return async () => {
    return { ok: true };
  };
}

function normalizeSideEffectResult(result) {
  if (result === undefined) {
    return { ok: true };
  }

  if (isObject(result) || Array.isArray(result)) {
    return cloneValue(result);
  }

  return {
    value: result
  };
}

function buildPredictivePerformanceWeight({ toState, context, metadata }) {
  if (!toState || toState === LIFECYCLE_STATES.DETECTED) {
    return null;
  }

  const assessment = Object.keys(extractAssessmentResults(context)).length > 0
    ? extractAssessmentResults(context)
    : (isObject(metadata) && isObject(metadata.assessmentResults) ? metadata.assessmentResults : {});
  const approval = extractApprovalContext(context);

  const successRate = normalizePercent(
    readFirstNumber([
      assessment.successRate,
      assessment.passRate,
      assessment.accuracy,
      isObject(assessment.humaneval) ? assessment.humaneval.passRate : undefined,
      isObject(assessment.mbpp) ? assessment.mbpp.passRate : undefined,
      isObject(assessment.benchmark) ? assessment.benchmark.successRate : undefined,
    ])
  );

  const latencyMs = readFirstNumber([
    assessment.latencyMs,
    assessment.latency,
    isObject(assessment.benchmark) ? assessment.benchmark.latencyMs : undefined,
  ]);

  const riskScore = readFirstNumber([
    approval.riskScore,
    isObject(approval.risk) ? approval.risk.score : undefined,
    isObject(context) ? context.riskScore : undefined,
  ]);

  const components = [];
  if (successRate !== null) {
    components.push({ weight: 0.55, value: successRate });
  }

  if (latencyMs !== null) {
    // Lower latency means higher score.
    const latencyScore = clamp01(1 - (latencyMs / 8000));
    components.push({ weight: 0.25, value: latencyScore });
  }

  if (riskScore !== null) {
    // Lower risk score means higher score.
    const normalizedRisk = clamp01(1 - (riskScore / 100));
    components.push({ weight: 0.20, value: normalizedRisk });
  }

  if (components.length === 0) {
    return null;
  }

  const weightedSum = components.reduce((sum, entry) => sum + (entry.weight * entry.value), 0);
  const totalWeight = components.reduce((sum, entry) => sum + entry.weight, 0);
  const weight = totalWeight > 0 ? roundTo(weightedSum / totalWeight, 4) : 0;
  const confidence = roundTo(components.length / 3, 4);

  return {
    strategy: 'predictive_performance_v1',
    forState: toState,
    weight,
    confidence,
    signals: {
      successRate,
      latencyMs,
      riskScore,
    },
    timestamp: Date.now(),
  };
}

function readFirstNumber(values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num;
    }
  }

  return null;
}

function normalizePercent(value) {
  if (!Number.isFinite(value)) return null;
  if (value > 1 && value <= 100) {
    return roundTo(value / 100, 4);
  }

  return clamp01(value);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeState(state) {
  const normalized = String(state || '').trim().toLowerCase();
  return STATE_ORDER.includes(normalized) ? normalized : '';
}

function createStateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
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

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonSafely(raw, fallback) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

function createSqliteClient(dbPath) {
  const bunDatabase = tryLoadBunDatabase();
  if (bunDatabase) {
    return new BunSqliteClient(new bunDatabase(dbPath, { create: true }));
  }

  // eslint-disable-next-line camelcase
  const BetterSqliteDatabase = __non_webpack_require__('better-sqlite3');
  return new BetterSqliteClient(new BetterSqliteDatabase(dbPath));
}

function tryLoadBunDatabase() {
  try {
    const { createRequire } = require('node:module');
    const localRequire = createRequire(__filename);
    const bunSqlite = localRequire('bun:sqlite');
    if (bunSqlite && typeof bunSqlite.Database === 'function') {
      return bunSqlite.Database;
    }

    return null;
  } catch (_error) {
    return null;
  }
}

class BunSqliteClient {
  constructor(database) {
    this.database = database;
  }

  pragma(statement) {
    this.database.exec(`PRAGMA ${statement}`);
  }

  exec(sql) {
    this.database.exec(sql);
  }

  run(sql, params) {
    this.database.query(sql).run(...normalizeSqlParams(params));
  }

  get(sql, params) {
    return this.database.query(sql).get(...normalizeSqlParams(params)) || null;
  }

  all(sql, params) {
    return this.database.query(sql).all(...normalizeSqlParams(params));
  }

  close() {
    this.database.close();
  }
}

class BetterSqliteClient {
  constructor(database) {
    this.database = database;
  }

  pragma(statement) {
    this.database.pragma(statement);
  }

  exec(sql) {
    this.database.exec(sql);
  }

  run(sql, params) {
    this.database.prepare(sql).run(...normalizeSqlParams(params));
  }

  get(sql, params) {
    return this.database.prepare(sql).get(...normalizeSqlParams(params)) || null;
  }

  all(sql, params) {
    return this.database.prepare(sql).all(...normalizeSqlParams(params));
  }

  close() {
    this.database.close();
  }
}

function normalizeSqlParams(params) {
  if (!Array.isArray(params)) {
    return [];
  }

  return params;
}

module.exports = {
  StateMachine,
  LIFECYCLE_STATES
};
