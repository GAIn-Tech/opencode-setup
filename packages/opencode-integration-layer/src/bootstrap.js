'use strict';

const { IntegrationLayer } = require('./index.js');

// --- Fail-open package imports ---
let initCrashGuard = null;
let SkillRLManager = null;
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
ShowboatWrapper = tryLoad('showboat-wrapper', () =>
  require('../../opencode-showboat-wrapper/src/index.js').ShowboatWrapper
);
Runbooks = tryLoad('runbooks', () =>
  require('../../opencode-runbooks/src/index.js').Runbooks
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
        config.workflowExecutor = new WorkflowExecutor(config.workflowStore, {}, {
          budgetEnforcer: null,
        });
      }
      bootstrapStatus.packages['sisyphus-state'] = true;
    } catch { bootstrapStatus.packages['sisyphus-state'] = false; }
  }

  if (ModelRouter) {
    try {
      const configLoader = ConfigLoaderClass ? new ConfigLoaderClass() : null;
      const featureFlags = createFeatureFlags ? createFeatureFlags() : null;
      const learningEngine = LearningEngineClass ? new LearningEngineClass() : null;
      // Wire exploration config from ConfigLoader → ModelRouter
      const explorationConfig = configLoader ? {
        active: configLoader.get('exploration.active', false),
        mode: configLoader.get('exploration.mode', 'balanced'),
        budget: configLoader.get('exploration.budget', 20),
        tokenBudgetRatio: configLoader.get('exploration.tokenBudgetRatio', 0.1),
        minTokens: configLoader.get('exploration.minTokens', 500),
      } : undefined;
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
      });
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
  return { ...bootstrapStatus };
}

function resetBootstrap() {
  singleton = null;
  bootstrapStatus.crashGuardInitialized = false;
  bootstrapStatus.packagesAttempted = 0;
  bootstrapStatus.packagesLoaded = 0;
  bootstrapStatus.packages = {};
}

module.exports = { bootstrap, getBootstrapStatus, resetBootstrap };
