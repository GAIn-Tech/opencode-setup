'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = './metrics.db';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_ROBUSTNESS_RUNS = 3;
const DEFAULT_PROMPT_COUNT = 5;

const DEFAULT_LATENCY_PROMPTS = [
  'Explain how optimistic UI updates work in a client application.',
  'Write a JavaScript function that groups array items by a key selector.',
  'Summarize eventual consistency in distributed databases in two paragraphs.',
  'Describe an O(n) approach to detect duplicates in a list of integers.',
  'Provide a short pull-request review checklist for backend services.'
];

const DEFAULT_USAGE = {
  inputTokens: 1000,
  outputTokens: 500
};

class MetricsCollector {
  constructor(options = {}) {
    this.dbPath = path.resolve(options.dbPath || DEFAULT_DB_PATH);
    this.executePrompt = typeof options.executePrompt === 'function' ? options.executePrompt : null;
    this.nowMs = typeof options.nowMs === 'function' ? options.nowMs : () => Date.now();
    this.defaultCurrency = String(options.currency || DEFAULT_CURRENCY).toUpperCase();
    this.defaultUsage = normalizeUsage(options.defaultUsage, DEFAULT_USAGE);
    this.latencyPrompts = normalizePromptList(options.latencyPrompts, DEFAULT_LATENCY_PROMPTS, DEFAULT_PROMPT_COUNT);
    this.robustnessRuns = Math.max(DEFAULT_ROBUSTNESS_RUNS, toPositiveInteger(options.robustnessRuns, DEFAULT_ROBUSTNESS_RUNS));
    this.accuracyWeights = normalizeAccuracyWeights(options.accuracyWeights);

    this._initializeDatabase();
  }

  async collectMetrics(model, assessmentResults = {}) {
    const modelId = this._resolveModelId(model);
    const timestamp = Date.now();

    const accuracy = this._extractAccuracyMetrics(assessmentResults);
    const latencyPrompts = normalizePromptList(
      assessmentResults.latencyPrompts,
      this.latencyPrompts,
      DEFAULT_PROMPT_COUNT
    );
    const latency = await this.measureLatency(model, latencyPrompts);

    const usage = resolveUsage(assessmentResults, model, this.defaultUsage);
    const cost = this.calculateCost(model, usage);

    const robustnessPrompts = normalizePromptList(
      assessmentResults.robustnessPrompts,
      latencyPrompts.slice(0, 1),
      1
    );
    const robustness = await this.measureRobustness(model, robustnessPrompts);

    const metrics = {
      modelId,
      timestamp,
      accuracy,
      latency,
      cost,
      robustness,
      modelMetadata: this._extractModelMetadata(model)
    };

    await this.storeMetrics(modelId, metrics);
    return metrics;
  }

  async measureLatency(model, prompts) {
    const promptList = normalizePromptList(prompts, this.latencyPrompts, DEFAULT_PROMPT_COUNT);
    const samples = [];

    for (const prompt of promptList) {
      const startedAt = toFiniteNumber(this.nowMs(), 0);
      await this._executePrompt(model, prompt, {
        metricType: 'latency'
      });
      const endedAt = toFiniteNumber(this.nowMs(), startedAt);
      samples.push(Math.max(0, endedAt - startedAt));
    }

    const sortedSamples = samples.slice().sort((left, right) => left - right);
    const avgMs = samples.length > 0
      ? samples.reduce((total, value) => total + value, 0) / samples.length
      : 0;

    return {
      avgMs: round(avgMs, 2),
      p50: round(percentile(sortedSamples, 50), 2),
      p95: round(percentile(sortedSamples, 95), 2),
      p99: round(percentile(sortedSamples, 99), 2),
      samples: samples.length
    };
  }

  calculateCost(model, usage) {
    const pricing = extractPricing(model, this.defaultCurrency);
    const normalizedUsage = normalizeUsage(usage, this.defaultUsage);

    const inputCost = (normalizedUsage.inputTokens / 1_000_000) * pricing.inputTokenPrice;
    const outputCost = (normalizedUsage.outputTokens / 1_000_000) * pricing.outputTokenPrice;

    return {
      inputTokenPrice: round(pricing.inputTokenPrice, 8),
      outputTokenPrice: round(pricing.outputTokenPrice, 8),
      avgCostPerRequest: round(inputCost + outputCost, 10),
      currency: pricing.currency
    };
  }

  async measureRobustness(model, prompts) {
    const promptList = normalizePromptList(prompts, this.latencyPrompts.slice(0, 1), 1);
    const varianceSamples = [];
    const normalizedVarianceSamples = [];

    for (const prompt of promptList) {
      const signatures = [];

      for (let runIndex = 0; runIndex < this.robustnessRuns; runIndex += 1) {
        const response = await this._executePrompt(model, prompt, {
          metricType: 'robustness',
          runIndex
        });
        signatures.push(responseSignature(response));
      }

      const variance = calculateVariance(signatures);
      const mean = calculateMean(signatures);
      const normalizedVariance = mean > 0 ? variance / (mean * mean) : variance;

      varianceSamples.push(variance);
      normalizedVarianceSamples.push(normalizedVariance);
    }

    const variance = varianceSamples.length > 0 ? calculateMean(varianceSamples) : 0;
    const normalizedVariance = normalizedVarianceSamples.length > 0 ? calculateMean(normalizedVarianceSamples) : 0;
    const consistency = clamp(1 - normalizedVariance, 0, 1);

    return {
      score: round(consistency, 6),
      variance: round(variance, 6),
      consistency: round(consistency, 6)
    };
  }

  async storeMetrics(modelId, metrics) {
    const resolvedModelId = this._resolveModelId(modelId);
    const timestamp = Number.isFinite(Number(metrics && metrics.timestamp))
      ? Number(metrics.timestamp)
      : Date.now();
    const modelMetadata = extractStoredMetadata(metrics && metrics.modelMetadata);
    const provider = String(modelMetadata.provider || '');

    this.db.run(
      `
      INSERT INTO model_metrics (
        model_id, provider, timestamp, metrics_json, metadata_json
      ) VALUES (?, ?, ?, ?, ?)
      `,
      [
        resolvedModelId,
        provider,
        timestamp,
        JSON.stringify(metrics || {}),
        JSON.stringify(modelMetadata)
      ]
    );
  }

  async getMetrics(modelId) {
    const row = this.db.get(
      `
      SELECT metrics_json, metadata_json
      FROM model_metrics
      WHERE model_id = ?
      ORDER BY timestamp DESC, id DESC
      LIMIT 1
      `,
      [String(modelId || '')]
    );

    if (!row) {
      return null;
    }

    const metrics = parseJsonSafely(row.metrics_json, null);
    if (!metrics) {
      return null;
    }

    if (!metrics.modelMetadata) {
      metrics.modelMetadata = parseJsonSafely(row.metadata_json, {});
    }

    return metrics;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  async _executePrompt(model, prompt, context) {
    const executor = this._resolveExecutor(model);
    const output = await executor(model, prompt, context || {});
    return normalizeOutput(output);
  }

  _resolveExecutor(model) {
    if (this.executePrompt) {
      return this.executePrompt;
    }

    if (model && typeof model.executePrompt === 'function') {
      return async (_model, prompt, context) => model.executePrompt(prompt, context || {});
    }

    if (model && typeof model.generate === 'function') {
      return async (_model, prompt, context) => model.generate(prompt, context || {});
    }

    if (model && typeof model.complete === 'function') {
      return async (_model, prompt, context) => model.complete(prompt, context || {});
    }

    throw new Error('No model execution function available. Provide options.executePrompt(model, prompt, context).');
  }

  _extractAccuracyMetrics(assessmentResults) {
    const humaneval = extractScore(
      assessmentResults,
      ['accuracy', 'humaneval'],
      ['benchmarks', 'humaneval', 'score'],
      ['humaneval', 'score'],
      ['humaneval']
    );
    const mbpp = extractScore(
      assessmentResults,
      ['accuracy', 'mbpp'],
      ['benchmarks', 'mbpp', 'score'],
      ['mbpp', 'score'],
      ['mbpp']
    );

    const weighted = [];
    if (Number.isFinite(humaneval)) {
      weighted.push({ value: humaneval, weight: this.accuracyWeights.humaneval });
    }
    if (Number.isFinite(mbpp)) {
      weighted.push({ value: mbpp, weight: this.accuracyWeights.mbpp });
    }

    const overall = weighted.length > 0
      ? weighted.reduce((total, entry) => total + (entry.value * entry.weight), 0) /
        weighted.reduce((total, entry) => total + entry.weight, 0)
      : 0;

    return {
      humaneval: round(Number.isFinite(humaneval) ? humaneval : 0, 6),
      mbpp: round(Number.isFinite(mbpp) ? mbpp : 0, 6),
      overall: round(overall, 6)
    };
  }

  _extractModelMetadata(model) {
    if (!model || typeof model !== 'object') {
      return {
        provider: '',
        pricing: {
          inputTokenPrice: 0,
          outputTokenPrice: 0,
          currency: this.defaultCurrency
        }
      };
    }

    const pricing = extractPricing(model, this.defaultCurrency);

    return {
      provider: this._resolveProvider(model),
      displayName: typeof model.displayName === 'string' ? model.displayName : '',
      contextTokens: toFiniteNumber(model.contextTokens, null),
      outputTokens: toFiniteNumber(model.outputTokens, null),
      pricing: {
        inputTokenPrice: pricing.inputTokenPrice,
        outputTokenPrice: pricing.outputTokenPrice,
        currency: pricing.currency
      }
    };
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
      CREATE TABLE IF NOT EXISTS model_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metrics_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_model_metrics_model_timestamp
        ON model_metrics(model_id, timestamp DESC);
    `);
  }

  _resolveModelId(model) {
    if (model && typeof model === 'object' && typeof model.id === 'string' && model.id.length > 0) {
      return model.id;
    }

    if (typeof model === 'string' && model.length > 0) {
      return model;
    }

    throw new Error('Model must include a non-empty id');
  }

  _resolveProvider(model) {
    if (model && typeof model === 'object' && typeof model.provider === 'string') {
      return model.provider;
    }

    return '';
  }
}

function resolveUsage(assessmentResults, model, fallback) {
  const assessmentUsage = assessmentResults && assessmentResults.usage;
  if (assessmentUsage && typeof assessmentUsage === 'object') {
    return normalizeUsage(assessmentUsage, fallback);
  }

  if (model && typeof model === 'object' && model.typicalUsage && typeof model.typicalUsage === 'object') {
    return normalizeUsage(model.typicalUsage, fallback);
  }

  return normalizeUsage(null, fallback);
}

function extractPricing(model, defaultCurrency) {
  const pricing = model && typeof model === 'object' && model.pricing && typeof model.pricing === 'object'
    ? model.pricing
    : {};

  const inputTokenPrice = firstFinite(
    pricing.inputTokenPrice,
    pricing.input,
    pricing.inputPerMillion,
    pricing.promptTokenPrice,
    pricing.prompt,
    model && model.inputTokenPrice
  );

  const outputTokenPrice = firstFinite(
    pricing.outputTokenPrice,
    pricing.output,
    pricing.outputPerMillion,
    pricing.completionTokenPrice,
    pricing.completion,
    model && model.outputTokenPrice
  );

  const currency = String(
    pricing.currency ||
    (model && model.currency) ||
    defaultCurrency ||
    DEFAULT_CURRENCY
  ).toUpperCase();

  return {
    inputTokenPrice: Math.max(0, Number.isFinite(inputTokenPrice) ? inputTokenPrice : 0),
    outputTokenPrice: Math.max(0, Number.isFinite(outputTokenPrice) ? outputTokenPrice : 0),
    currency
  };
}

function extractStoredMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return {
      provider: '',
      pricing: {
        inputTokenPrice: 0,
        outputTokenPrice: 0,
        currency: DEFAULT_CURRENCY
      }
    };
  }

  const provider = typeof metadata.provider === 'string' ? metadata.provider : '';
  const pricing = metadata.pricing && typeof metadata.pricing === 'object'
    ? metadata.pricing
    : {};

  return {
    ...metadata,
    provider,
    pricing: {
      inputTokenPrice: Math.max(0, toFiniteNumber(pricing.inputTokenPrice, 0)),
      outputTokenPrice: Math.max(0, toFiniteNumber(pricing.outputTokenPrice, 0)),
      currency: String(pricing.currency || DEFAULT_CURRENCY).toUpperCase()
    }
  };
}

function normalizeUsage(usage, fallback) {
  const baseline = fallback && typeof fallback === 'object'
    ? fallback
    : DEFAULT_USAGE;
  const source = usage && typeof usage === 'object' ? usage : {};

  return {
    inputTokens: Math.max(0, Math.floor(toFiniteNumber(source.inputTokens, baseline.inputTokens))),
    outputTokens: Math.max(0, Math.floor(toFiniteNumber(source.outputTokens, baseline.outputTokens)))
  };
}

function normalizePromptList(prompts, fallback, limit) {
  const source = Array.isArray(prompts) ? prompts : fallback;
  const normalized = [];

  for (const prompt of source || []) {
    if (typeof prompt !== 'string') {
      continue;
    }

    const text = prompt.trim();
    if (!text) {
      continue;
    }

    normalized.push(text);
    if (normalized.length >= limit) {
      break;
    }
  }

  if (normalized.length > 0) {
    return normalized;
  }

  const safeFallback = Array.isArray(fallback) ? fallback : DEFAULT_LATENCY_PROMPTS;
  return safeFallback.slice(0, Math.max(1, limit));
}

function normalizeAccuracyWeights(weights) {
  const source = weights && typeof weights === 'object' ? weights : {};
  const humaneval = Math.max(0, toFiniteNumber(source.humaneval, 0.5));
  const mbpp = Math.max(0, toFiniteNumber(source.mbpp, 0.5));

  if ((humaneval + mbpp) === 0) {
    return {
      humaneval: 0.5,
      mbpp: 0.5
    };
  }

  return {
    humaneval,
    mbpp
  };
}

function extractScore(payload, ...paths) {
  for (const pathSegments of paths) {
    const value = readPath(payload, pathSegments);
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  return Number.NaN;
}

function readPath(payload, pathSegments) {
  let current = payload;
  for (const segment of pathSegments) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function responseSignature(responseText) {
  const normalized = String(responseText || '').trim();
  return normalized.length;
}

function calculateVariance(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const mean = calculateMean(values);
  const variance = values.reduce((total, value) => {
    const delta = value - mean;
    return total + (delta * delta);
  }, 0) / values.length;

  return variance;
}

function calculateMean(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function percentile(sortedNumbers, percentileValue) {
  if (!Array.isArray(sortedNumbers) || sortedNumbers.length === 0) {
    return 0;
  }

  const position = Math.ceil((percentileValue / 100) * sortedNumbers.length) - 1;
  const index = Math.max(0, Math.min(position, sortedNumbers.length - 1));
  return sortedNumbers[index];
}

function normalizeOutput(output) {
  if (typeof output === 'string') {
    return output;
  }

  if (!output || typeof output !== 'object') {
    return '';
  }

  if (typeof output.response === 'string') {
    return output.response;
  }

  if (typeof output.text === 'string') {
    return output.text;
  }

  if (typeof output.content === 'string') {
    return output.content;
  }

  if (Array.isArray(output.content)) {
    const textParts = output.content
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return '';
        }

        if (typeof entry.text === 'string') {
          return entry.text;
        }

        if (typeof entry.value === 'string') {
          return entry.value;
        }

        return '';
      })
      .filter(Boolean);

    if (textParts.length > 0) {
      return textParts.join('\n');
    }
  }

  return '';
}

function createSqliteClient(dbPath) {
  const bunDatabase = tryLoadBunDatabase();
  if (bunDatabase) {
    return new BunSqliteClient(new bunDatabase(dbPath, { create: true }));
  }

  const BetterSqliteDatabase = require('better-sqlite3');
  return new BetterSqliteClient(new BetterSqliteDatabase(dbPath));
}

function tryLoadBunDatabase() {
  try {
    const bunSqlite = require('bun:sqlite');
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

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toPositiveInteger(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  return Math.floor(numericValue);
}

function toFiniteNumber(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return numericValue;
}

function firstFinite(...values) {
  for (const value of values) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  return Number.NaN;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
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

module.exports = {
  MetricsCollector
};
