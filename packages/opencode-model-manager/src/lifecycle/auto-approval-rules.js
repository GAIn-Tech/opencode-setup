'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = Object.freeze({
  thresholds: Object.freeze({
    autoApprove: 50,
    manualReview: 80
  }),
  trustedProviders: Object.freeze(['openai', 'anthropic']),
  knownProviders: Object.freeze([]),
  untrustedProviders: Object.freeze([]),
  rules: Object.freeze({
    metadataOnly: Object.freeze({ score: 5, autoApprove: true }),
    patchVersion: Object.freeze({ score: 10, autoApprove: true }),
    lowRiskProvider: Object.freeze({ score: 15, autoApprove: true }),
    majorChange: Object.freeze({ score: 60, autoApprove: false })
  }),
  factorScores: Object.freeze({
    changeType: Object.freeze({
      added: 80,
      removed: 90,
      modified: 20
    }),
    classification: Object.freeze({
      major: 50,
      minor: 10
    }),
    provider: Object.freeze({
      trusted: 0,
      new: 30,
      untrusted: 50
    }),
    contextWindow: Object.freeze({
      high: 40,
      medium: 20,
      low: 5,
      none: 0
    }),
    deprecated: Object.freeze({
      statusChange: 60,
      none: 0
    })
  })
});

const CHANGE_TYPES = Object.freeze({
  ADDED: 'added',
  REMOVED: 'removed',
  MODIFIED: 'modified'
});

const CLASSIFICATIONS = Object.freeze({
  MAJOR: 'major',
  MINOR: 'minor'
});

const METADATA_ONLY_PREFIXES = Object.freeze([
  'displayName',
  'description',
  'pricing',
  'metadata',
  'tags',
  'aliases'
]);

const AUDIT_ACTOR = 'system:auto-approval-rules';

class AutoApprovalRules {
  constructor(config = {}) {
    this.config = createDefaultConfig();
    this.thresholds = cloneValue(this.config.thresholds);
    this.trustedProviders = new Set();
    this.knownProviders = new Set();
    this.untrustedProviders = new Set();

    this.loadConfig(config);
  }

  evaluate(diff, model) {
    const modelId = resolveModelId(model);
    const change = selectChangeRecord(diff, modelId);
    const resolvedModel = resolveModel(model, change, modelId);
    const provider = resolveProvider(change, resolvedModel);
    const providerStatus = this._resolveProviderStatus(provider);

    const deprecatedStatusChanged = didDeprecatedStatusChange(change);
    const contextWindowScore = this._scoreContextWindow(change);

    const factors = {
      changeType: this._scoreChangeType(change.type),
      classification: this._scoreClassification(change.classification),
      provider: this._scoreProvider(providerStatus),
      contextWindow: contextWindowScore,
      deprecated: deprecatedStatusChanged
        ? this.config.factorScores.deprecated.statusChange
        : this.config.factorScores.deprecated.none
    };

    const rawScore = clampScore(
      factors.changeType +
      factors.classification +
      factors.provider +
      factors.contextWindow +
      factors.deprecated
    );

    const flags = {
      metadataOnly: this._isMetadataOnlyChange(change),
      patchVersion: this._isPatchVersionChange(change),
      lowRiskProvider: providerStatus === 'trusted' &&
        change.type === CHANGE_TYPES.MODIFIED &&
        change.classification === CLASSIFICATIONS.MINOR,
      majorChange: this._isMajorManualReviewChange(change, providerStatus),
      blocked: this._isBlockedChange(change, providerStatus, deprecatedStatusChanged)
    };

    const { score, matchedRules } = this._applyRules(rawScore, flags);
    const recommendation = this.getRecommendation(score);
    const autoApproved = recommendation === 'auto-approve';

    const audit = {
      actor: AUDIT_ACTOR,
      autoApproved,
      recommendation,
      reason: buildAuditReason(recommendation, matchedRules),
      metadata: {
        riskScore: score,
        factors: cloneValue(factors),
        matchedRules: matchedRules.slice(),
        thresholds: cloneValue(this.thresholds),
        modelId: resolveModelId(resolvedModel),
        provider
      }
    };

    return {
      score,
      factors,
      recommendation,
      autoApproved,
      matchedRules,
      audit
    };
  }

  shouldAutoApprove(riskScore) {
    return this.getRecommendation(riskScore) === 'auto-approve';
  }

  getRecommendation(riskScore) {
    const score = extractRiskScore(riskScore);

    if (score > this.thresholds.manualReview) {
      return 'block';
    }

    if (score > this.thresholds.autoApprove) {
      return 'manual-review';
    }

    return 'auto-approve';
  }

  loadConfig(config) {
    const parsedInput = parseConfigInput(config);
    this.config = normalizeConfig(parsedInput, DEFAULT_CONFIG);
    this.thresholds = cloneValue(this.config.thresholds);

    this.trustedProviders = new Set(this.config.trustedProviders.map((provider) => normalizeProvider(provider)));
    this.untrustedProviders = new Set(this.config.untrustedProviders.map((provider) => normalizeProvider(provider)));

    this.knownProviders = new Set(this.config.knownProviders.map((provider) => normalizeProvider(provider)));
    for (const provider of this.trustedProviders) {
      this.knownProviders.add(provider);
    }
    for (const provider of this.untrustedProviders) {
      this.knownProviders.add(provider);
    }

    return cloneValue(this.config);
  }

  _scoreChangeType(changeType) {
    const normalizedType = normalizeChangeType(changeType);
    return this.config.factorScores.changeType[normalizedType];
  }

  _scoreClassification(classification) {
    const normalizedClassification = normalizeClassification(classification);
    return this.config.factorScores.classification[normalizedClassification];
  }

  _scoreProvider(providerStatus) {
    if (providerStatus === 'trusted') {
      return this.config.factorScores.provider.trusted;
    }

    if (providerStatus === 'untrusted') {
      return this.config.factorScores.provider.untrusted;
    }

    return this.config.factorScores.provider.new;
  }

  _resolveProviderStatus(provider) {
    const normalizedProvider = normalizeProvider(provider);
    if (!normalizedProvider) {
      return 'new';
    }

    if (this.trustedProviders.has(normalizedProvider)) {
      return 'trusted';
    }

    if (this.untrustedProviders.has(normalizedProvider)) {
      return 'untrusted';
    }

    if (this.knownProviders.has(normalizedProvider)) {
      return 'untrusted';
    }

    return 'new';
  }

  _scoreContextWindow(change) {
    if (!change || change.type !== CHANGE_TYPES.MODIFIED) {
      return this.config.factorScores.contextWindow.none;
    }

    const contextTokensChange = findFieldChange(change.changes, 'contextTokens');
    if (!contextTokensChange) {
      return this.config.factorScores.contextWindow.low;
    }

    const oldValue = Number(contextTokensChange.old);
    const newValue = Number(contextTokensChange.new);

    if (!Number.isFinite(oldValue) || !Number.isFinite(newValue) || oldValue <= 0) {
      return this.config.factorScores.contextWindow.low;
    }

    const ratio = Math.abs(newValue - oldValue) / oldValue;

    if (ratio > 0.5) {
      return this.config.factorScores.contextWindow.high;
    }

    if (ratio >= 0.2) {
      return this.config.factorScores.contextWindow.medium;
    }

    return this.config.factorScores.contextWindow.low;
  }

  _isMetadataOnlyChange(change) {
    if (!change || change.type !== CHANGE_TYPES.MODIFIED || !isObject(change.changes)) {
      return false;
    }

    const changePaths = Object.keys(change.changes);
    if (changePaths.length === 0) {
      return false;
    }

    return changePaths.every((fieldPath) => isMetadataPath(fieldPath));
  }

  _isPatchVersionChange(change) {
    if (!change || change.type !== CHANGE_TYPES.MODIFIED || !isObject(change.changes)) {
      return false;
    }

    const versionChange = findFieldChange(change.changes, 'version');
    if (!versionChange) {
      return false;
    }

    const oldVersion = parseVersion(versionChange.old);
    const newVersion = parseVersion(versionChange.new);

    if (!oldVersion || !newVersion) {
      return false;
    }

    return oldVersion.major === newVersion.major &&
      oldVersion.minor === newVersion.minor &&
      newVersion.patch > oldVersion.patch;
  }

  _isMajorManualReviewChange(change, providerStatus) {
    if (!change) {
      return false;
    }

    if (change.classification === CLASSIFICATIONS.MAJOR) {
      return true;
    }

    if (providerStatus === 'new') {
      return true;
    }

    return hasPathPrefix(change.changes, 'capabilities');
  }

  _isBlockedChange(change, providerStatus, deprecatedStatusChanged) {
    if (!change) {
      return false;
    }

    if (change.type === CHANGE_TYPES.REMOVED) {
      return true;
    }

    if (deprecatedStatusChanged) {
      return true;
    }

    return providerStatus === 'untrusted';
  }

  _applyRules(rawScore, flags) {
    let score = clampScore(rawScore);
    const matchedRules = [];

    if (flags.blocked) {
      score = Math.max(score, this.thresholds.manualReview + 1);
      matchedRules.push('blocked');
      return {
        score: clampScore(score),
        matchedRules
      };
    }

    if (flags.metadataOnly) {
      score = this._applyRuleScore(score, this.config.rules.metadataOnly);
      matchedRules.push('metadataOnly');
    }

    if (flags.patchVersion) {
      score = this._applyRuleScore(score, this.config.rules.patchVersion);
      matchedRules.push('patchVersion');
    }

    if (flags.lowRiskProvider) {
      score = this._applyRuleScore(score, this.config.rules.lowRiskProvider);
      matchedRules.push('lowRiskProvider');
    }

    if (flags.majorChange) {
      const majorRuleScore = resolveRuleScore(
        this.config.rules.majorChange,
        this.thresholds.autoApprove + 1
      );
      score = Math.max(score, majorRuleScore, this.thresholds.autoApprove + 1);
      score = Math.min(score, this.thresholds.manualReview);
      matchedRules.push('majorChange');
    }

    return {
      score: clampScore(score),
      matchedRules
    };
  }

  _applyRuleScore(currentScore, rule) {
    if (!rule || rule.autoApprove !== true) {
      return currentScore;
    }

    const ruleScore = resolveRuleScore(rule, currentScore);
    return Math.min(currentScore, ruleScore);
  }
}

function parseConfigInput(config) {
  if (config === undefined || config === null) {
    return {};
  }

  if (isObject(config)) {
    return cloneValue(config);
  }

  if (typeof config !== 'string') {
    throw new Error('AutoApprovalRules config must be an object, YAML/JSON string, or file path');
  }

  const trimmed = config.trim();
  if (!trimmed) {
    return {};
  }

  let payload = trimmed;
  let extension = '';

  if (!trimmed.includes('\n') && !trimmed.includes('\r')) {
    const resolvedPath = path.resolve(trimmed);
    if (fs.existsSync(resolvedPath)) {
      payload = fs.readFileSync(resolvedPath, 'utf8');
      extension = path.extname(resolvedPath).toLowerCase();
    }
  }

  const parsed = parseStructuredConfig(payload, extension);
  if (!isObject(parsed)) {
    throw new Error('AutoApprovalRules config must resolve to an object');
  }

  return parsed;
}

function parseStructuredConfig(rawText, extension) {
  const text = String(rawText || '').trim();
  if (!text) {
    return {};
  }

  const shouldTryJsonFirst = extension === '.json' || text.startsWith('{') || text.startsWith('[');
  if (shouldTryJsonFirst) {
    try {
      return JSON.parse(text);
    } catch (error) {
      if (extension === '.json') {
        throw new Error(`Invalid JSON config: ${error.message}`);
      }
    }
  }

  try {
    return parseYaml(text);
  } catch (yamlError) {
    try {
      return JSON.parse(text);
    } catch (_jsonError) {
      throw new Error(`Unable to parse config as YAML or JSON: ${yamlError.message}`);
    }
  }
}

function parseYaml(rawText) {
  const bunGlobal = typeof globalThis === 'object' ? globalThis.Bun : undefined;
  if (bunGlobal && bunGlobal.YAML && typeof bunGlobal.YAML.parse === 'function') {
    return bunGlobal.YAML.parse(rawText);
  }

  return parseSimpleYaml(rawText);
}

function parseSimpleYaml(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => ({
      indent: countIndent(line),
      text: stripInlineComment(line).trim()
    }))
    .filter((entry) => entry.text.length > 0);

  if (lines.length === 0) {
    return {};
  }

  const { value } = parseYamlBlock(lines, 0, lines[0].indent);
  return value;
}

function parseYamlBlock(lines, startIndex, indent) {
  const firstLine = lines[startIndex];
  if (!firstLine) {
    return { value: {}, nextIndex: startIndex };
  }

  if (firstLine.text.startsWith('- ')) {
    return parseYamlArray(lines, startIndex, indent);
  }

  return parseYamlObject(lines, startIndex, indent);
}

function parseYamlObject(lines, startIndex, indent) {
  const output = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) {
      break;
    }

    if (line.indent > indent || line.text.startsWith('- ')) {
      index += 1;
      continue;
    }

    const separatorIndex = line.text.indexOf(':');
    if (separatorIndex === -1) {
      index += 1;
      continue;
    }

    const key = line.text.slice(0, separatorIndex).trim();
    const remainder = line.text.slice(separatorIndex + 1).trim();

    if (!key) {
      index += 1;
      continue;
    }

    if (remainder.length > 0) {
      output[key] = parseScalar(remainder);
      index += 1;
      continue;
    }

    const nextLine = lines[index + 1];
    if (!nextLine || nextLine.indent <= line.indent) {
      output[key] = {};
      index += 1;
      continue;
    }

    const parsedNested = parseYamlBlock(lines, index + 1, nextLine.indent);
    output[key] = parsedNested.value;
    index = parsedNested.nextIndex;
  }

  return { value: output, nextIndex: index };
}

function parseYamlArray(lines, startIndex, indent) {
  const output = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent || !line.text.startsWith('- ')) {
      break;
    }

    const remainder = line.text.slice(2).trim();
    if (remainder.length > 0) {
      output.push(parseScalar(remainder));
      index += 1;
      continue;
    }

    const nextLine = lines[index + 1];
    if (!nextLine || nextLine.indent <= line.indent) {
      output.push(null);
      index += 1;
      continue;
    }

    const parsedNested = parseYamlBlock(lines, index + 1, nextLine.indent);
    output.push(parsedNested.value);
    index = parsedNested.nextIndex;
  }

  return { value: output, nextIndex: index };
}

function parseScalar(value) {
  const normalized = String(value || '').trim();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  if (normalized === 'null') {
    return null;
  }

  const numeric = Number(normalized);
  if (normalized.length > 0 && Number.isFinite(numeric) && !/^0\d+$/.test(normalized)) {
    return numeric;
  }

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1);
  }

  return normalized;
}

function normalizeConfig(config, defaults) {
  const source = isObject(config) ? config : {};

  const thresholds = normalizeThresholds(source.thresholds, defaults.thresholds);

  return {
    thresholds,
    trustedProviders: normalizeProviderList(source.trustedProviders, defaults.trustedProviders),
    knownProviders: normalizeProviderList(source.knownProviders, defaults.knownProviders),
    untrustedProviders: normalizeProviderList(source.untrustedProviders, defaults.untrustedProviders),
    rules: normalizeRules(source.rules, defaults.rules),
    factorScores: normalizeFactorScores(source.factorScores, defaults.factorScores)
  };
}

function normalizeThresholds(value, fallback) {
  const source = isObject(value) ? value : {};
  const autoApprove = Math.min(99, clampScore(toFiniteNumber(source.autoApprove, fallback.autoApprove)));

  let manualReview = clampScore(toFiniteNumber(source.manualReview, fallback.manualReview));
  if (manualReview <= autoApprove) {
    manualReview = Math.min(100, autoApprove + 1);
  }

  return {
    autoApprove,
    manualReview
  };
}

function normalizeRules(value, fallback) {
  const source = isObject(value) ? value : {};

  return {
    metadataOnly: normalizeRule(source.metadataOnly, fallback.metadataOnly),
    patchVersion: normalizeRule(source.patchVersion, fallback.patchVersion),
    lowRiskProvider: normalizeRule(source.lowRiskProvider, fallback.lowRiskProvider),
    majorChange: normalizeRule(source.majorChange, fallback.majorChange)
  };
}

function normalizeRule(value, fallback) {
  const source = isObject(value) ? value : {};

  return {
    score: resolveRuleScore(source, fallback.score),
    autoApprove: typeof source.autoApprove === 'boolean'
      ? source.autoApprove
      : fallback.autoApprove
  };
}

function normalizeFactorScores(value, fallback) {
  const source = isObject(value) ? value : {};

  return {
    changeType: {
      added: resolveNonNegativeScore(readPath(source, ['changeType', 'added']), fallback.changeType.added),
      removed: resolveNonNegativeScore(readPath(source, ['changeType', 'removed']), fallback.changeType.removed),
      modified: resolveNonNegativeScore(readPath(source, ['changeType', 'modified']), fallback.changeType.modified)
    },
    classification: {
      major: resolveNonNegativeScore(readPath(source, ['classification', 'major']), fallback.classification.major),
      minor: resolveNonNegativeScore(readPath(source, ['classification', 'minor']), fallback.classification.minor)
    },
    provider: {
      trusted: resolveNonNegativeScore(readPath(source, ['provider', 'trusted']), fallback.provider.trusted),
      new: resolveNonNegativeScore(readPath(source, ['provider', 'new']), fallback.provider.new),
      untrusted: resolveNonNegativeScore(readPath(source, ['provider', 'untrusted']), fallback.provider.untrusted)
    },
    contextWindow: {
      high: resolveNonNegativeScore(readPath(source, ['contextWindow', 'high']), fallback.contextWindow.high),
      medium: resolveNonNegativeScore(readPath(source, ['contextWindow', 'medium']), fallback.contextWindow.medium),
      low: resolveNonNegativeScore(readPath(source, ['contextWindow', 'low']), fallback.contextWindow.low),
      none: resolveNonNegativeScore(readPath(source, ['contextWindow', 'none']), fallback.contextWindow.none)
    },
    deprecated: {
      statusChange: resolveNonNegativeScore(readPath(source, ['deprecated', 'statusChange']), fallback.deprecated.statusChange),
      none: resolveNonNegativeScore(readPath(source, ['deprecated', 'none']), fallback.deprecated.none)
    }
  };
}

function normalizeProviderList(value, fallback) {
  const source = Array.isArray(value)
    ? value
    : fallback;

  const deduplicated = [];
  const seen = new Set();

  for (const provider of source || []) {
    const normalizedProvider = normalizeProvider(provider);
    if (!normalizedProvider || seen.has(normalizedProvider)) {
      continue;
    }

    deduplicated.push(normalizedProvider);
    seen.add(normalizedProvider);
  }

  return deduplicated;
}

function selectChangeRecord(diff, modelId) {
  if (isObject(diff) && typeof diff.type === 'string') {
    return normalizeChangeRecord(diff);
  }

  const normalizedDiff = isObject(diff) ? diff : {};
  const candidates = [
    ...normalizeChangeArray(normalizedDiff.added),
    ...normalizeChangeArray(normalizedDiff.removed),
    ...normalizeChangeArray(normalizedDiff.modified)
  ];

  if (candidates.length === 0) {
    return {
      type: CHANGE_TYPES.MODIFIED,
      classification: CLASSIFICATIONS.MINOR,
      model: modelId ? { id: modelId } : {},
      changes: {}
    };
  }

  if (modelId) {
    const matched = candidates.find((entry) => resolveModelId(entry.model) === modelId);
    if (matched) {
      return normalizeChangeRecord(matched);
    }
  }

  return normalizeChangeRecord(candidates[0]);
}

function normalizeChangeArray(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.filter((entry) => isObject(entry));
}

function normalizeChangeRecord(change) {
  const type = normalizeChangeType(change && change.type);
  const classification = normalizeClassification(change && change.classification, type);

  return {
    type,
    classification,
    model: isObject(change && change.model)
      ? cloneValue(change.model)
      : {},
    changes: isObject(change && change.changes)
      ? cloneValue(change.changes)
      : {},
    provider: resolveProvider(change)
  };
}

function normalizeChangeType(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === CHANGE_TYPES.ADDED) {
    return CHANGE_TYPES.ADDED;
  }

  if (normalized === CHANGE_TYPES.REMOVED) {
    return CHANGE_TYPES.REMOVED;
  }

  return CHANGE_TYPES.MODIFIED;
}

function normalizeClassification(value, changeType) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === CLASSIFICATIONS.MAJOR) {
    return CLASSIFICATIONS.MAJOR;
  }

  if (normalized === CLASSIFICATIONS.MINOR) {
    return CLASSIFICATIONS.MINOR;
  }

  if (changeType === CHANGE_TYPES.ADDED || changeType === CHANGE_TYPES.REMOVED) {
    return CLASSIFICATIONS.MAJOR;
  }

  return CLASSIFICATIONS.MINOR;
}

function resolveModel(model, change, fallbackModelId) {
  if (isObject(model)) {
    return cloneValue(model);
  }

  if (isObject(change) && isObject(change.model)) {
    return cloneValue(change.model);
  }

  if (typeof fallbackModelId === 'string' && fallbackModelId.length > 0) {
    return { id: fallbackModelId };
  }

  return {};
}

function resolveProvider(change, model) {
  if (isObject(change) && typeof change.provider === 'string' && change.provider.trim().length > 0) {
    return change.provider.trim();
  }

  if (isObject(change) && isObject(change.model) && typeof change.model.provider === 'string' && change.model.provider.trim().length > 0) {
    return change.model.provider.trim();
  }

  if (isObject(model) && typeof model.provider === 'string' && model.provider.trim().length > 0) {
    return model.provider.trim();
  }

  return '';
}

function resolveModelId(model) {
  if (typeof model === 'string' && model.trim().length > 0) {
    return model.trim();
  }

  if (isObject(model) && typeof model.id === 'string' && model.id.trim().length > 0) {
    return model.id.trim();
  }

  return '';
}

function didDeprecatedStatusChange(change) {
  if (!isObject(change) || !isObject(change.changes)) {
    return false;
  }

  const deprecatedChange = findFieldChange(change.changes, 'deprecated');
  if (!deprecatedChange) {
    return false;
  }

  return Boolean(deprecatedChange.old) !== Boolean(deprecatedChange.new);
}

function hasPathPrefix(changes, prefix) {
  if (!isObject(changes)) {
    return false;
  }

  const normalizedPrefix = String(prefix || '');
  if (!normalizedPrefix) {
    return false;
  }

  const nestedPrefix = `${normalizedPrefix}.`;

  return Object.keys(changes).some((fieldPath) => {
    return fieldPath === normalizedPrefix || fieldPath.startsWith(nestedPrefix);
  });
}

function findFieldChange(changes, fieldName) {
  if (!isObject(changes)) {
    return null;
  }

  const target = String(fieldName || '').trim();
  if (!target) {
    return null;
  }

  const nestedTarget = `.${target}`;

  for (const [fieldPath, delta] of Object.entries(changes)) {
    if (!isObject(delta)) {
      continue;
    }

    if (fieldPath === target || fieldPath.endsWith(nestedTarget)) {
      return delta;
    }
  }

  return null;
}

function isMetadataPath(fieldPath) {
  const normalized = String(fieldPath || '').trim();
  if (!normalized) {
    return false;
  }

  return METADATA_ONLY_PREFIXES.some((prefix) => {
    return normalized === prefix || normalized.startsWith(`${prefix}.`);
  });
}

function parseVersion(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] || 0)
  };
}

function extractRiskScore(riskScore) {
  if (isObject(riskScore) && Number.isFinite(Number(riskScore.score))) {
    return clampScore(Number(riskScore.score));
  }

  return clampScore(Number(riskScore));
}

function clampScore(score) {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function resolveRuleScore(rule, fallback) {
  const source = isObject(rule) ? rule.score : rule;
  return resolveNonNegativeScore(source, fallback);
}

function resolveNonNegativeScore(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, numeric);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return numeric;
}

function normalizeProvider(provider) {
  return String(provider || '').trim().toLowerCase();
}

function buildAuditReason(recommendation, matchedRules) {
  const rules = Array.isArray(matchedRules) && matchedRules.length > 0
    ? matchedRules.join(', ')
    : 'none';

  if (recommendation === 'auto-approve') {
    return `Auto-approved by rules: ${rules}`;
  }

  if (recommendation === 'manual-review') {
    return `Manual review required by rules: ${rules}`;
  }

  return `Blocked by risk policy rules: ${rules}`;
}

function readPath(value, pathSegments) {
  let current = value;

  for (const segment of pathSegments) {
    if (!isObject(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function countIndent(line) {
  const match = /^\s*/.exec(String(line || ''));
  if (!match) {
    return 0;
  }

  return match[0].length;
}

function stripInlineComment(line) {
  const text = String(line || '');
  const commentIndex = text.indexOf('#');
  if (commentIndex === -1) {
    return text;
  }

  return text.slice(0, commentIndex);
}

function createDefaultConfig() {
  return cloneValue(DEFAULT_CONFIG);
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

module.exports = {
  AutoApprovalRules
};
