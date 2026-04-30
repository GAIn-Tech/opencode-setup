'use strict';

const fs = require('fs/promises');
const path = require('path');

const { DiscoveryEngine, PROVIDER_ORDER } = require('../discovery/discovery-engine');
const { SnapshotStore } = require('../snapshot/snapshot-store');
const { DiffEngine } = require('../diff/diff-engine');
const { ModelAssessor } = require('../assessment/model-assessor');
const { StateMachine, LIFECYCLE_STATES } = require('../lifecycle/state-machine');
const { AutoApprovalRules } = require('../lifecycle/auto-approval-rules');
const { PRGenerator } = require('./pr-generator');

const DEFAULT_CATALOG_PATH = path.resolve(process.cwd(), 'opencode-config/models/catalog-2026.json');

async function runModelManagementCycle(options = {}) {
  const providers = normalizeProviders(options.providers);
  const adapters = normalizeAdapters(options.adapters, providers);
  const discoveryEngine = options.discoveryEngine || new DiscoveryEngine(adapters);
  const snapshotStore = options.snapshotStore || new SnapshotStore(options.snapshotOptions);
  const diffEngine = options.diffEngine || new DiffEngine();
  const assessor = options.assessor || new ModelAssessor(options.assessorOptions);
  const stateMachine = options.stateMachine || new StateMachine(options.lifecycleOptions);
  const autoApprovalRules = options.autoApprovalRules || new AutoApprovalRules(options.autoApprovalOptions);
  const catalogPath = options.catalogPath || DEFAULT_CATALOG_PATH;
  const prGenerator = options.prGenerator || new PRGenerator({
    catalogPath,
    repoPath: options.repoPath || process.cwd(),
    baseBranch: options.baseBranch
  });

  const discovery = await discoveryEngine.discover(options.discoveryOptions || {});
  const previousSnapshot = await loadPreviousSnapshot({
    previousSnapshot: options.previousSnapshot,
    snapshotStore,
    baselineSnapshotProvider: options.baselineSnapshotProvider,
    catalogPath
  });

  const currentSnapshot = {
    provider: 'automation',
    timestamp: Date.now(),
    models: discovery.models
  };

  const diff = diffEngine.compare(previousSnapshot, currentSnapshot);
  const candidateChanges = [...diff.added, ...diff.modified];
  const assessments = [];

  for (const change of candidateChanges) {
    const modelId = resolveModelId(change.model, change.provider);
    const currentState = await stateMachine.getState(modelId);

    if (!currentState) {
      await stateMachine.setState(modelId, LIFECYCLE_STATES.DETECTED, {
        provider: change.provider,
        discoveredAt: currentSnapshot.timestamp
      });
    }

    const refreshedState = await stateMachine.getState(modelId);
    let assessmentResult = null;

    if (refreshedState === LIFECYCLE_STATES.DETECTED) {
      assessmentResult = await assessor.assess({
        ...change.model,
        id: modelId,
        provider: change.provider || change.model.provider
      });
      await stateMachine.transition(modelId, LIFECYCLE_STATES.ASSESSED, {
        assessmentResults: assessmentResult,
        assessedAt: Date.now()
      });
    }

    assessments.push({
      modelId,
      provider: change.provider || change.model.provider || '',
      state: await stateMachine.getState(modelId),
      result: assessmentResult || await assessor.getResults(modelId)
    });
  }

  const approvalDecisions = candidateChanges.map((change) => {
    const decision = autoApprovalRules.evaluate(diff, change.model);
    return {
      modelId: resolveModelId(change.model, change.provider),
      provider: change.provider || change.model.provider || '',
      recommendation: decision.recommendation,
      score: decision.score,
      autoApproved: decision.autoApproved,
      decision
    };
  });

  const approvalSummary = summarizeApprovals(approvalDecisions);
  const hasChanges = candidateChanges.length > 0 || diff.removed.length > 0;
  const catalogUpdatePayload = hasChanges
    ? await prGenerator.previewCatalogUpdate(diff)
    : null;
  const prMetadata = options.generatePrMetadata === false || !hasChanges
    ? null
    : {
        title: prGenerator.generatePRTitle(diff),
        body: prGenerator.generatePRBody(diff)
      };

  if (!options.dryRun && snapshotStore && typeof snapshotStore.save === 'function') {
    await snapshotStore.save(options.baselineSnapshotProvider || 'baseline', discovery.models, {
      metadata: {
        discoveryDuration: 0,
        providerCoverage: providers
      }
    });
  }

  return {
    providers,
    discovery,
    previousSnapshot,
    currentSnapshot,
    diff,
    assessments,
    approvalDecisions,
    approvalSummary,
    catalogUpdatePayload,
    prMetadata,
    catalogUpdatePrepared: Boolean(catalogUpdatePayload)
  };
}

async function loadPreviousSnapshot({ previousSnapshot, snapshotStore, baselineSnapshotProvider, catalogPath }) {
  if (previousSnapshot) {
    return normalizeSnapshot(previousSnapshot);
  }

  if (snapshotStore && typeof snapshotStore.getLatest === 'function') {
    const latestSnapshot = await snapshotStore.getLatest(baselineSnapshotProvider || 'baseline');
    if (latestSnapshot) {
      return normalizeSnapshot(latestSnapshot);
    }
  }

  return loadCatalogBaseline(catalogPath);
}

async function loadCatalogBaseline(catalogPath) {
  try {
    const raw = await fs.readFile(catalogPath, 'utf8');
    const catalog = JSON.parse(raw);
    const models = normalizeCatalogModels(catalog.models);
    return {
      provider: 'catalog',
      timestamp: Date.now(),
      models
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return normalizeSnapshot(null);
    }

    throw error;
  }
}

function normalizeProviders(providers) {
  if (!Array.isArray(providers) || providers.length === 0) {
    return PROVIDER_ORDER.slice();
  }

  return providers.map((provider) => String(provider || '').trim()).filter(Boolean);
}

function normalizeAdapters(adapters, providers) {
  const providedAdapters = adapters && typeof adapters === 'object' ? adapters : {};
  const normalized = {};

  for (const provider of PROVIDER_ORDER) {
    if (!providers.includes(provider)) {
      normalized[provider] = { list: async () => [] };
      continue;
    }

    normalized[provider] = providedAdapters[provider] || { list: async () => [] };
  }

  return normalized;
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { provider: '', timestamp: Date.now(), models: [] };
  }

  return {
    provider: String(snapshot.provider || ''),
    timestamp: Number.isFinite(Number(snapshot.timestamp)) ? Number(snapshot.timestamp) : Date.now(),
    models: Array.isArray(snapshot.models) ? snapshot.models.slice() : []
  };
}

function normalizeCatalogModels(models) {
  if (Array.isArray(models)) {
    return models.slice();
  }

  if (!models || typeof models !== 'object') {
    return [];
  }

  return Object.entries(models).map(([modelKey, model]) => {
    if (!model || typeof model !== 'object') {
      return { id: modelKey };
    }

    return {
      ...model,
      id: typeof model.id === 'string' && model.id.includes('/') ? model.id : modelKey,
      provider: model.provider || extractProviderFromKey(modelKey)
    };
  });
}

function summarizeApprovals(decisions) {
  const summary = {
    assessedCount: decisions.length,
    autoApproved: 0,
    manualReview: 0,
    blocked: 0
  };

  for (const decision of decisions) {
    if (decision.recommendation === 'auto-approve') {
      summary.autoApproved += 1;
      continue;
    }

    if (decision.recommendation === 'manual-review') {
      summary.manualReview += 1;
      continue;
    }

    summary.blocked += 1;
  }

  return summary;
}

function resolveModelId(model, provider) {
  const rawId = model && typeof model.id === 'string' ? model.id : '';
  if (rawId.includes('/')) {
    return rawId;
  }

  const resolvedProvider = provider || (model && model.provider) || '';
  return resolvedProvider ? `${resolvedProvider}/${rawId}` : rawId;
}

function extractProviderFromKey(modelKey) {
  const [provider] = String(modelKey || '').split('/');
  return provider || '';
}

module.exports = {
  runModelManagementCycle
};
