'use strict';

const os = require('os');
const path = require('path');
const { IntegrationLayer } = require('./index.js');

// --- Fail-open package imports ---
let initCrashGuard = null;
let SkillRLManager = null;
let ExplorationRLAdapterClass = null;
let ShowboatWrapper = null;
let Runbooks = null;
let CircuitBreaker = null;
let Proofcheck = null;
let FallbackDoctor = null;
let PreloadSkillsPlugin = null;
let PluginLifecycleSupervisor = null;
let WorkflowStore = null;
let WorkflowExecutor = null;
let ModelRouter = null;
let DashboardLauncher = null;
let Healthd = null;
let LoggerClass = null;
let ValidatorModule = null;
let ErrorTaxonomy = null;
let HealthCheckModule = null;
let MetaAwarenessTracker = null;
let ConfigLoaderClass = null;
let createFeatureFlags = null;
let LearningEngineClass = null;
let AlertManagerClass = null;
let PipelineMetricsCollectorClass = null;

const loadAttempts = {};

function tryLoad(name, loader) {
  try {
    const mod = loader();
    loadAttempts[name] = true;
    return mod;
  } catch {
    loadAttempts[name] = false;
    return null;
  }
}

// All packages use CJS module.exports except crash-guard (ESM).
// Bun supports require() of ESM packages in workspace context.
initCrashGuard = tryLoad('crash-guard', () =>
  require('../../opencode-crash-guard/src/index.js').initCrashGuard
);
SkillRLManager = tryLoad('skill-rl-manager', () =>
  require('../../opencode-skill-rl-manager/src/index.js').SkillRLManager
);
ExplorationRLAdapterClass = tryLoad('exploration-rl-adapter', () =>
  require('../../opencode-skill-rl-manager/src/index.js').ExplorationRLAdapter
);
ShowboatWrapper = tryLoad('showboat-wrapper', () =>
  require('../../opencode-showboat-wrapper/src/index.js').ShowboatWrapper
);
Runbooks = tryLoad('runbooks', () =>
  require('../../opencode-runbooks/src/index.js').Runbooks
);
CircuitBreaker = tryLoad('circuit-breaker', () =>
  require('../../opencode-circuit-breaker/src/index.js').CircuitBreaker
);
Proofcheck = tryLoad('proofcheck', () =>
  require('../../opencode-proofcheck/src/index.js').Proofcheck
);
FallbackDoctor = tryLoad('fallback-doctor', () =>
  require('../../opencode-fallback-doctor/src/index.js').FallbackDoctor
);
PreloadSkillsPlugin = tryLoad('preload-skills', () =>
  require('../../opencode-plugin-preload-skills/src/index.js').PreloadSkillsPlugin
);
PluginLifecycleSupervisor = tryLoad('plugin-lifecycle', () =>
  require('../../opencode-plugin-lifecycle/src/index.js').PluginLifecycleSupervisor
);
WorkflowStore = tryLoad('sisyphus-state-store', () =>
  require('../../opencode-sisyphus-state/src/index.js').WorkflowStore
);
WorkflowExecutor = tryLoad('sisyphus-state-executor', () =>
  require('../../opencode-sisyphus-state/src/index.js').WorkflowExecutor
);
ModelRouter = tryLoad('model-router-x', () =>
  require('../../opencode-model-router-x/src/index.js').ModelRouter
);
DashboardLauncher = tryLoad('dashboard-launcher', () =>
  require('../../opencode-dashboard-launcher/src/index.js')
);
Healthd = tryLoad('plugin-healthd', () =>
  require('../../opencode-plugin-healthd/src/index.js').Healthd
);
const loggerModule = tryLoad('logger', () =>
  require('../../opencode-logger/src/index.js')
);
LoggerClass = loggerModule?.Logger || loggerModule?.default || (typeof loggerModule === 'function' ? loggerModule : null);
ValidatorModule = tryLoad('validator', () =>
  require('../../opencode-validator/src/index.js')
);
ErrorTaxonomy = tryLoad('errors', () =>
  require('../../opencode-errors/src/index.js')
);
HealthCheckModule = tryLoad('health-check', () =>
  require('../../opencode-health-check/src/index.js')
);
MetaAwarenessTracker = tryLoad('meta-awareness-tracker', () =>
  require('../../opencode-learning-engine/src/meta-awareness-tracker.js').MetaAwarenessTracker
);
ConfigLoaderClass = tryLoad('config-loader', () =>
  require('../../opencode-config-loader/src/index.js').ConfigLoader
);
const featureFlagsModule = tryLoad('feature-flags', () =>
  require('../../opencode-feature-flags/src/index.js')
);
createFeatureFlags = featureFlagsModule?.createFeatureFlags || featureFlagsModule?.default?.createFeatureFlags || null;
LearningEngineClass = tryLoad('learning-engine', () =>
  require('../../opencode-learning-engine/src/index.js').LearningEngine
);
const _monitoring = tryLoad('monitoring', () =>
  require('opencode-model-manager/monitoring')
);
AlertManagerClass = _monitoring?.AlertManager || null;
PipelineMetricsCollectorClass = _monitoring?.PipelineMetricsCollector || null;

// --- Bootstrap state ---
let singleton = null;
const bootstrapStatus = {
  crashGuardInitialized: false,
  packagesAttempted: 0,
  packagesLoaded: 0,
  packages: {},
};

function bootstrap(options = {}) {
  if (singleton) return singleton;

  const bootstrapLogger = LoggerClass
    ? new LoggerClass({ service: 'integration-bootstrap' })
    : {
        error: (...args) => console.error('[integration-bootstrap]', ...args),
        warn: (...args) => console.warn('[integration-bootstrap]', ...args),
      };

  // 1. Initialize crash-guard FIRST (prevents Bun ENOENT segfaults)
  if (initCrashGuard) {
    try {
      initCrashGuard({
        enableRecovery: true,
        enableMemoryGuard: true,
        enableIsolation: false,
        memoryThresholdMB: options.memoryThresholdMB || 512,
        onCrash: (error) => {
          bootstrapLogger.error('crash-guard caught', { error: error?.message });
        },
      });
      bootstrapStatus.crashGuardInitialized = true;
    } catch (err) {
      bootstrapLogger.warn('crash-guard init failed', { error: err?.message });
      bootstrapStatus.crashGuardInitialized = false;
    }
  }

  // 2. Instantiate optional package instances
  const config = {};

  if (SkillRLManager) {
    try {
      config.skillRLManager = new SkillRLManager(options.skillRL);
      bootstrapStatus.packages['skill-rl-manager'] = true;
    } catch { bootstrapStatus.packages['skill-rl-manager'] = false; }
  }

  // Wire ExplorationRLAdapter: reads model_performance SQLite table → SkillRL weights
  // Requires: skillRLManager + a SQLite db at ~/.opencode/audit.db (or OPENCODE_AUDIT_DB_PATH)
  // Fail-open: if db missing, table absent, or constructor throws → adapter stays null
  if (ExplorationRLAdapterClass && config.skillRLManager) {
    try {
      const _auditDbPath = path.join(os.homedir(), '.opencode', 'audit.db');
      const fs = require('fs');
      if (fs.existsSync(_auditDbPath)) {
        let _Database;
        try { _Database = require('bun:sqlite').Database; } catch {
          try { _Database = require('better-sqlite3'); } catch { _Database = null; }
        }
        if (_Database) {
          const _db = new _Database(_auditDbPath, { readonly: true });
          config.explorationAdapter = new ExplorationRLAdapterClass({
            comprehensionMemory: { db: _db },
            skillRLManager: config.skillRLManager,
          });
          bootstrapStatus.packages['exploration-rl-adapter'] = true;
        }
      }
    } catch {
      // Fail-open: exploration adapter is optional — missing db/table is non-fatal
      bootstrapStatus.packages['exploration-rl-adapter'] = false;
    }
  }

  if (ShowboatWrapper) {
    try {
      config.showboatWrapper = new ShowboatWrapper(options.showboat || {});
      bootstrapStatus.packages['showboat-wrapper'] = true;
    } catch { bootstrapStatus.packages['showboat-wrapper'] = false; }
  }

  if (Runbooks) {
    try {
      config.runbooks = new Runbooks();
      bootstrapStatus.packages.runbooks = true;
    } catch { bootstrapStatus.packages.runbooks = false; }
  }

  if (CircuitBreaker) {
    try {
      config.circuitBreaker = CircuitBreaker;
      bootstrapStatus.packages['circuit-breaker'] = true;
    } catch { bootstrapStatus.packages['circuit-breaker'] = false; }
  }

  if (Proofcheck) {
    try {
      config.proofcheck = new Proofcheck(options.proofcheck || {});
      bootstrapStatus.packages.proofcheck = true;
    } catch { bootstrapStatus.packages.proofcheck = false; }
  }

  if (FallbackDoctor) {
    try {
      config.fallbackDoctor = new FallbackDoctor();
      bootstrapStatus.packages['fallback-doctor'] = true;
    } catch { bootstrapStatus.packages['fallback-doctor'] = false; }
  }

  if (PreloadSkillsPlugin) {
    try {
      const preload = new PreloadSkillsPlugin({
        skillRL: config.skillRLManager || null,
      });
      preload.init();
      config.preloadSkills = preload;
      bootstrapStatus.packages['preload-skills'] = true;
    } catch { bootstrapStatus.packages['preload-skills'] = false; }
  }

  if (PluginLifecycleSupervisor) {
    try {
      config.pluginLifecycle = new PluginLifecycleSupervisor({
        quarantineCrashThreshold: options.quarantineCrashThreshold || 3,
      });
      bootstrapStatus.packages['plugin-lifecycle'] = true;
    } catch { bootstrapStatus.packages['plugin-lifecycle'] = false; }
  }

  if (WorkflowStore) {
    try {
      const dbPath = options.workflowDbPath || null;
      config.workflowStore = new WorkflowStore(dbPath);
      if (WorkflowExecutor) {
        const _budgetEnforcementEnabled = process.env.OPENCODE_BUDGET_ENFORCEMENT === 'true';
        config.workflowExecutor = new WorkflowExecutor(config.workflowStore, {}, {
          // budgetEnforcer is opt-in — set OPENCODE_BUDGET_ENFORCEMENT=true to enable
          budgetEnforcer: _budgetEnforcementEnabled && config.contextGovernor ? config.contextGovernor : null,
        });
      }
      bootstrapStatus.packages['sisyphus-state'] = true;
    } catch { bootstrapStatus.packages['sisyphus-state'] = false; }
  }

  // Create LearningEngine before ModelRouter so both ModelRouter and
  // OrchestrationAdvisor can use it.  Previously learningEngine was scoped
  // inside the ModelRouter block, leaving config.advisor always null.
  let learningEngine = null;
  if (LearningEngineClass) {
    try {
      learningEngine = new LearningEngineClass();
      bootstrapStatus.packages['learning-engine'] = true;
    } catch { bootstrapStatus.packages['learning-engine'] = false; }
  }

  // Wire OrchestrationAdvisor from the LearningEngine into the IntegrationLayer.
  // LearningEngine creates an OrchestrationAdvisor internally (engine.advisor)
  // using its own antiPatterns + positivePatterns catalogs.
  if (learningEngine && learningEngine.advisor) {
    config.advisor = learningEngine.advisor;
    bootstrapStatus.packages['orchestration-advisor'] = true;
  }

  // Wire LearningEngine itself into IntegrationLayer for SkillRL↔LearningEngine
  // cross-feedback.  IntegrationLayer feeds skill performance data (success_rate,
  // usage_count) to LearningEngine after each SkillRL learnFromOutcome() call.
  if (learningEngine) {
    config.learningEngine = learningEngine;
  }

  // T15: Wire LearningEngine event consumers (fail-open, advisory logging)
  if (learningEngine && typeof learningEngine.on === 'function') {
    try {
      learningEngine.on('outcomeRecorded', (data) => {
        try { bootstrapLogger.info('[LearningEngine] Outcome recorded', { adviceId: data?.advice_id }); } catch {}
      });
      learningEngine.on('onFailureDistill', (data) => {
        try { bootstrapLogger.warn('[LearningEngine] Failure distilled', { adviceId: data?.advice_id }); } catch {}
      });
      learningEngine.on('patternStored', (data) => {
        try { bootstrapLogger.info('[LearningEngine] Pattern stored', { type: data?.type }); } catch {}
      });
    } catch { /* fail-open */ }
  }

  // T14: Instantiate AlertManager and wire alert event listeners
  if (AlertManagerClass) {
    try {
      config.alertManager = new AlertManagerClass();
      config.alertManager.on('alert:fired', (alert) => {
        try { bootstrapLogger.warn('[AlertManager] Alert fired', { type: alert?.type, id: alert?.id, severity: alert?.severity }); } catch {}
      });
      config.alertManager.on('alert:resolved', (ev) => {
        try { bootstrapLogger.info('[AlertManager] Alert resolved', { type: ev?.type, alertId: ev?.alertId }); } catch {}
      });
      bootstrapStatus.packages['alert-manager'] = true;
    } catch { bootstrapStatus.packages['alert-manager'] = false; }
  }

  // Gap #21: Subscribe to central event bus for cross-package event observability
  const eventBus = (() => { try { return require('opencode-event-bus'); } catch { return null; } })();
  if (eventBus) {
    try {
      eventBus.on('alert:fired', (alert) => {
        try { bootstrapLogger.info('[EventBus] alert:fired', { type: alert?.type, id: alert?.id, severity: alert?.severity }); } catch {}
      });
      eventBus.on('alert:resolved', (ev) => {
        try { bootstrapLogger.info('[EventBus] alert:resolved', { type: ev?.type, alertId: ev?.alertId }); } catch {}
      });
      eventBus.on('learning:outcomeRecorded', (data) => {
        try { bootstrapLogger.info('[EventBus] learning:outcomeRecorded', { adviceId: data?.advice_id }); } catch {}
      });
      eventBus.on('learning:onFailureDistill', (data) => {
        try { bootstrapLogger.warn('[EventBus] learning:onFailureDistill', { adviceId: data?.advice_id }); } catch {}
      });
      eventBus.on('learning:patternStored', (data) => {
        try { bootstrapLogger.info('[EventBus] learning:patternStored', { type: data?.type }); } catch {}
      });
      bootstrapStatus.packages['event-bus'] = true;
    } catch { bootstrapStatus.packages['event-bus'] = false; }
  }

  // T18: Instantiate PipelineMetricsCollector for runtime event feeding
  if (PipelineMetricsCollectorClass) {
    try {
      config.pipelineMetrics = new PipelineMetricsCollectorClass({ autoCleanup: true });
      bootstrapStatus.packages['pipeline-metrics'] = true;
    } catch { bootstrapStatus.packages['pipeline-metrics'] = false; }
  }

  if (ModelRouter) {
    try {
      const configLoader = ConfigLoaderClass ? new ConfigLoaderClass() : null;
      const featureFlags = createFeatureFlags ? createFeatureFlags() : null;
      // learningEngine already created above (hoisted for advisor wiring)
      // Wire exploration config from ConfigLoader → ModelRouter
      const explorationConfig = configLoader ? {
        active: configLoader.get('exploration.active', false),
        mode: configLoader.get('exploration.mode', 'balanced'),
        budget: configLoader.get('exploration.budget', 20),
        tokenBudgetRatio: configLoader.get('exploration.tokenBudgetRatio', 0.1),
        minTokens: configLoader.get('exploration.minTokens', 500),
      } : undefined;
      const statsPersistPath = path.join(os.homedir(), '.opencode', 'model-router-stats.json');
      config.modelRouter = new ModelRouter({
        skillRLManager: config.skillRLManager || null,
        fallbackDoctor: config.fallbackDoctor || null,
        configLoader,
        featureFlags,
        learningEngine,
        exploration: explorationConfig,
        logger: bootstrapLogger,
        validator: ValidatorModule || null,
        openCodeErrors: ErrorTaxonomy || null,
        healthCheck: HealthCheckModule || null,
        metaAwarenessTracker: MetaAwarenessTracker ? new MetaAwarenessTracker() : null,
        circuitBreakerClass: CircuitBreaker || null,
        integrationLayerClass: IntegrationLayer,
        statsPersistPath,
      });
      // Load persisted RL stats so model routing benefits from historical outcomes.
      // Also replay runtime outcomes captured by the PostToolUse hook so Thompson
      // Sampling has real training data from prior delegations.
      let runtimeOutcomes = [];
      try {
        const outcomesPath = path.join(os.homedir(), '.opencode', 'model-router-runtime-outcomes.json');
        const raw = require('fs').readFileSync(outcomesPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          runtimeOutcomes = parsed.filter(o => o && typeof o.modelId === 'string');
        }
      } catch { /* file missing or corrupt — start fresh, fail-open */ }
      config.modelRouter.loadStatsFromDisk(runtimeOutcomes);
      bootstrapStatus.packages['model-router-x'] = true;
    } catch { bootstrapStatus.packages['model-router-x'] = false; }
  }

  if (DashboardLauncher) {
    config.dashboardLauncher = DashboardLauncher;
    bootstrapStatus.packages['dashboard-launcher'] = true;
  }

  if (Healthd) {
    try {
      config.healthd = new Healthd({
        mcps: options.healthdMcps || undefined,
      });
      bootstrapStatus.packages['plugin-healthd'] = true;
    } catch { bootstrapStatus.packages['plugin-healthd'] = false; }
  }

  // Count stats
  bootstrapStatus.packagesAttempted = Object.keys(loadAttempts).length;
  bootstrapStatus.packagesLoaded = Object.values(loadAttempts).filter(Boolean).length;

  // 3. Create IntegrationLayer with all injected packages
  config.currentSessionId = options.sessionId || `ses_${Date.now()}`;
  singleton = new IntegrationLayer(config);

  return singleton;
}

function getBootstrapStatus() {
  const status = { ...bootstrapStatus };
  
  // Add read-only status for packages that bypass bootstrap
  status.circuitBreaker = { loaded: loadAttempts['circuit-breaker'] || false };
  
  // Try-require checks for packages with their own init
  try {
    require('../../opencode-context-governor/src/index.js');
    status.contextGovernor = { loaded: true };
  } catch {
    status.contextGovernor = { loaded: false };
  }
  
  try {
    require('../../opencode-memory-graph/src/index.js');
    status.memoryGraph = { loaded: true };
  } catch {
    status.memoryGraph = { loaded: false };
  }
  
  try {
    require('../../opencode-backup-manager/src/index.js');
    status.backupManager = { loaded: true };
  } catch {
    status.backupManager = { loaded: false };
  }
  
  return status;
}

function resetBootstrap() {
  singleton = null;
  bootstrapStatus.crashGuardInitialized = false;
  bootstrapStatus.packagesAttempted = 0;
  bootstrapStatus.packagesLoaded = 0;
  bootstrapStatus.packages = {};
}

async function delegate(taskContext, executeTaskFn, options = {}) {
  const runtime = bootstrap(options);
  if (!runtime || typeof runtime.delegate !== 'function') {
    throw new Error('IntegrationLayer delegate() is unavailable');
  }
  return runtime.delegate(taskContext, executeTaskFn);
}

module.exports = { bootstrap, getBootstrapStatus, resetBootstrap, delegate };
