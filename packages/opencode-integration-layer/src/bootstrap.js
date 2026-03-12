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

  // 1. Initialize crash-guard FIRST (prevents Bun ENOENT segfaults)
  if (initCrashGuard) {
    try {
      initCrashGuard({
        enableRecovery: true,
        enableMemoryGuard: true,
        enableIsolation: false,
        memoryThresholdMB: options.memoryThresholdMB || 512,
        onCrash: (error) => {
          console.error('[bootstrap] crash-guard caught:', error?.message);
        },
      });
      bootstrapStatus.crashGuardInitialized = true;
    } catch (err) {
      console.warn('[bootstrap] crash-guard init failed:', err?.message);
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
