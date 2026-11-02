# Wave 2: Runtime Package Wiring

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire 5 remaining packages (memory-graph, fallback-doctor, plugin-lifecycle, sisyphus-state, model-router-x) into the bootstrap/IntegrationLayer runtime so the orchestration system can use them.

**Architecture:** Follow established fail-open pattern from Wave 1 — tryLoad in bootstrap.js, store on IntegrationLayer instance, delegate methods with try/catch returning null on failure.

**Tech Stack:** CJS, Bun test framework, fail-open imports via try/catch

---

## Context

### Current bootstrap.js wiring (155 LOC)
Packages loaded: crash-guard, skill-rl-manager, showboat-wrapper, runbooks, proofcheck, fallback-doctor, preload-skills.
Pattern: `tryLoad(name, loader)` → instantiate in try/catch → pass via `config` object → `new IntegrationLayer(config)`.

### Current IntegrationLayer (1016 LOC)
Constructor accepts: skillRL/skillRLManager, showboat/showboatWrapper, quotaManager, advisor, modelRouter, preloadSkills, runbooks, currentSessionId, metaKBIndexPath.
Also imports at module level (fail-open): logger, validator, health-check, backup-manager, feature-flags, context-governor, memory-graph.

### Governance Requirements
Commits touching governed paths require:
1. `Learning-Update: opencode-config/learning-updates/<file>.json` trailer
2. `Risk-Level: low|medium|high` trailer

---

## Phase 1: Wire Loaded-But-Unused Packages

### Task 1: Expose memory-graph methods in IntegrationLayer

**Problem:** `this.memoryGraph` is stored (line 162) but NO delegation methods exist. The MemoryGraph API (getSessionErrors, getErrorFrequency, activate/deactivate) is inaccessible to consumers.

**Files:**
- Modify: `packages/opencode-integration-layer/src/index.js` (add 5 methods after `diagnose()` ~line 214)
- Create: `packages/opencode-integration-layer/tests/memory-graph-wiring.test.js`

**Changes to index.js — add after diagnose() method:**
```js
/**
 * Record an error for a session in the memory graph.
 * @param {string} sessionId
 * @param {object} error - Error details { type, message, stack? }
 * @returns {Promise<object|null>}
 */
async recordSessionError(sessionId, error) {
  if (!this.memoryGraph) return null;
  try {
    // buildGraph accepts array of error objects with session metadata
    return await this.memoryGraph.buildGraph([{ sessionId, ...error, timestamp: new Date().toISOString() }]);
  } catch {
    return null;
  }
}

/**
 * Get errors for a specific session from the memory graph.
 * @param {string} sessionId
 * @returns {Promise<Array|null>}
 */
async getSessionErrors(sessionId) {
  if (!this.memoryGraph) return null;
  try {
    return await this.memoryGraph.getSessionErrors(sessionId);
  } catch {
    return null;
  }
}

/**
 * Get error frequency statistics from the memory graph.
 * @returns {Promise<Array|null>}
 */
async getErrorFrequency() {
  if (!this.memoryGraph) return null;
  try {
    return await this.memoryGraph.getErrorFrequency();
  } catch {
    return null;
  }
}

/**
 * Activate memory graph collection.
 * @param {object} [opts]
 * @returns {Promise<void>}
 */
async activateMemoryGraph(opts) {
  if (!this.memoryGraph) return;
  try {
    await this.memoryGraph.activate(opts);
  } catch {
    // fail-open
  }
}

/**
 * Check if memory graph is active.
 * @returns {boolean}
 */
isMemoryGraphActive() {
  if (!this.memoryGraph) return false;
  try {
    return this.memoryGraph.isActive();
  } catch {
    return false;
  }
}
```

**Test file (5 tests):**
1. getSessionErrors delegates to memoryGraph.getSessionErrors
2. getErrorFrequency delegates to memoryGraph.getErrorFrequency
3. activateMemoryGraph calls memoryGraph.activate
4. Returns null when memoryGraph unavailable
5. Returns null when memoryGraph.method throws

**Commit:** `feat(integration): expose memory-graph methods in IntegrationLayer`

---

### Task 2: Store + expose fallback-doctor in IntegrationLayer

**Problem:** FallbackDoctor is instantiated in bootstrap.js (line 114-118) and passed as `config.fallbackDoctor`, but IntegrationLayer constructor ignores it. The validateChain() and diagnose() APIs are inaccessible.

**Files:**
- Modify: `packages/opencode-integration-layer/src/index.js` (add constructor line + 2 methods)
- Create: `packages/opencode-integration-layer/tests/fallback-doctor-wiring.test.js`

**Changes to index.js:**

Constructor (after line 133 `this.runbooks = config.runbooks || null;`):
```js
this.fallbackDoctor = config.fallbackDoctor || null;
```

Add after memory-graph methods:
```js
/**
 * Validate a model fallback chain.
 * @param {string[]} models - Array of model IDs
 * @returns {{ valid: boolean, issues: Array, suggestions: Array }|null}
 */
validateFallbackChain(models) {
  if (!this.fallbackDoctor) return null;
  try {
    return this.fallbackDoctor.validateChain(models);
  } catch {
    return null;
  }
}

/**
 * Run full fallback diagnostics.
 * @param {object} [config] - Optional config override
 * @returns {{ healthy: boolean, issues: Array, suggestions: Array }|null}
 */
diagnoseFallbacks(config) {
  if (!this.fallbackDoctor) return null;
  try {
    return this.fallbackDoctor.diagnose(config);
  } catch {
    return null;
  }
}
```

**Test file (4 tests):**
1. validateFallbackChain delegates to fallbackDoctor.validateChain
2. diagnoseFallbacks delegates to fallbackDoctor.diagnose
3. Returns null when fallbackDoctor unavailable
4. Returns null when method throws

**Commit:** `feat(integration): wire fallback-doctor into IntegrationLayer`

---

## Phase 2: Wire New Packages Into Bootstrap

### Task 3: Wire plugin-lifecycle into bootstrap + IntegrationLayer

**Problem:** PluginLifecycleSupervisor is not imported or instantiated anywhere at runtime. MCP plugin health management is completely disconnected.

**Files:**
- Modify: `packages/opencode-integration-layer/src/bootstrap.js` (add import + instantiation)
- Modify: `packages/opencode-integration-layer/src/index.js` (add constructor + methods)
- Create: `packages/opencode-integration-layer/tests/plugin-lifecycle-wiring.test.js`

**bootstrap.js changes:**

After line 13 (`let PreloadSkillsPlugin = null;`), add:
```js
let PluginLifecycleSupervisor = null;
```

After line 49 (PreloadSkillsPlugin tryLoad), add:
```js
PluginLifecycleSupervisor = tryLoad('plugin-lifecycle', () =>
  require('../../opencode-plugin-lifecycle/src/index.js').PluginLifecycleSupervisor
);
```

After PreloadSkillsPlugin instantiation block (~line 130), add:
```js
if (PluginLifecycleSupervisor) {
  try {
    config.pluginLifecycle = new PluginLifecycleSupervisor({
      quarantineCrashThreshold: options.quarantineCrashThreshold || 3,
    });
    bootstrapStatus.packages['plugin-lifecycle'] = true;
  } catch { bootstrapStatus.packages['plugin-lifecycle'] = false; }
}
```

**index.js changes:**

Constructor (after fallbackDoctor line):
```js
this.pluginLifecycle = config.pluginLifecycle || null;
```

Methods:
```js
/**
 * Evaluate health of all plugins.
 * @param {Array} inputs - Plugin input descriptors
 * @returns {Promise<object|null>}
 */
async evaluatePluginHealth(inputs) {
  if (!this.pluginLifecycle) return null;
  try {
    return await this.pluginLifecycle.evaluateMany(inputs);
  } catch {
    return null;
  }
}

/**
 * List all plugin states.
 * @returns {object|null}
 */
listPlugins() {
  if (!this.pluginLifecycle) return null;
  try {
    return this.pluginLifecycle.list();
  } catch {
    return null;
  }
}
```

**Test file (4 tests):**
1. evaluatePluginHealth delegates to pluginLifecycle.evaluateMany
2. listPlugins delegates to pluginLifecycle.list
3. Returns null when pluginLifecycle unavailable
4. Bootstrap tracks plugin-lifecycle status

**Commit:** `feat(integration): wire plugin-lifecycle into bootstrap and IntegrationLayer`

---

### Task 4: Wire sisyphus-state into bootstrap + IntegrationLayer

**Problem:** WorkflowStore and WorkflowExecutor are not instantiated at runtime. Workflow persistence, checkpoint/resume, and durable execution are completely disconnected.

**Files:**
- Modify: `packages/opencode-integration-layer/src/bootstrap.js` (add import + instantiation)
- Modify: `packages/opencode-integration-layer/src/index.js` (add constructor + methods)
- Create: `packages/opencode-integration-layer/tests/sisyphus-state-wiring.test.js`

**bootstrap.js changes:**

Import declarations:
```js
let WorkflowStore = null;
let WorkflowExecutor = null;
```

tryLoad:
```js
WorkflowStore = tryLoad('sisyphus-state-store', () =>
  require('../../opencode-sisyphus-state/src/index.js').WorkflowStore
);
WorkflowExecutor = tryLoad('sisyphus-state-executor', () =>
  require('../../opencode-sisyphus-state/src/index.js').WorkflowExecutor
);
```

Instantiation (IMPORTANT: WorkflowStore defaults to `~/.opencode/sisyphus-state.db` if no path):
```js
if (WorkflowStore) {
  try {
    const dbPath = options.workflowDbPath || null; // null = default ~/.opencode/sisyphus-state.db
    config.workflowStore = new WorkflowStore(dbPath);
    if (WorkflowExecutor) {
      config.workflowExecutor = new WorkflowExecutor(config.workflowStore, {}, {
        budgetEnforcer: null, // Can be wired later
      });
    }
    bootstrapStatus.packages['sisyphus-state'] = true;
  } catch { bootstrapStatus.packages['sisyphus-state'] = false; }
}
```

**index.js changes:**

Constructor:
```js
this.workflowStore = config.workflowStore || null;
this.workflowExecutor = config.workflowExecutor || null;
```

Methods:
```js
/**
 * Execute a workflow with durable checkpointing.
 * @param {object} workflowDef - Workflow definition { name, steps }
 * @param {object} input - Initial input data
 * @param {string} [runId] - Optional run ID
 * @returns {Promise<{ runId: string, status: string, context: object }|null>}
 */
async executeWorkflow(workflowDef, input, runId) {
  if (!this.workflowExecutor) return null;
  try {
    return await this.workflowExecutor.execute(workflowDef, input, runId);
  } catch (err) {
    this.logger.error('Workflow execution failed', { workflow: workflowDef?.name, error: err.message });
    return null;
  }
}

/**
 * Resume a workflow from its last checkpoint.
 * @param {string} runId
 * @param {object} workflowDef
 * @returns {Promise<object|null>}
 */
async resumeWorkflow(runId, workflowDef) {
  if (!this.workflowExecutor) return null;
  try {
    return await this.workflowExecutor.resume(runId, workflowDef);
  } catch (err) {
    this.logger.error('Workflow resume failed', { runId, error: err.message });
    return null;
  }
}

/**
 * Get workflow run state.
 * @param {string} runId
 * @returns {object|null}
 */
getWorkflowState(runId) {
  if (!this.workflowStore) return null;
  try {
    return this.workflowStore.getRunState(runId);
  } catch {
    return null;
  }
}
```

**Test file (5 tests):**
1. executeWorkflow delegates to workflowExecutor.execute
2. resumeWorkflow delegates to workflowExecutor.resume
3. getWorkflowState delegates to workflowStore.getRunState
4. Returns null when executor unavailable
5. Bootstrap tracks sisyphus-state status

**Commit:** `feat(integration): wire sisyphus-state into bootstrap for durable execution`

---

## Phase 3: Wire Model Router

### Task 5: Wire model-router-x into bootstrap

**Problem:** ModelRouter is fully built (1461 LOC) with circuit-breaker, scoring, live tuning — but never instantiated at runtime. IntegrationLayer already has `this.modelRouter` slot (line 131) that is always null.

**Files:**
- Modify: `packages/opencode-integration-layer/src/bootstrap.js` (add import + instantiation)
- Create: `packages/opencode-integration-layer/tests/model-router-wiring.test.js`

**bootstrap.js changes:**

Import:
```js
let ModelRouter = null;
```

tryLoad:
```js
ModelRouter = tryLoad('model-router-x', () =>
  require('../../opencode-model-router-x/src/index.js').ModelRouter
);
```

Instantiation (AFTER all other packages, since ModelRouter accepts many deps):
```js
if (ModelRouter) {
  try {
    config.modelRouter = new ModelRouter({
      skillRLManager: config.skillRLManager || null,
      fallbackDoctor: config.fallbackDoctor || null,
      featureFlags: featureFlags || null,  // Module-level import
      logger: structuredLogger || null,     // Module-level import
    });
    bootstrapStatus.packages['model-router-x'] = true;
  } catch { bootstrapStatus.packages['model-router-x'] = false; }
}
```

Note: IntegrationLayer already handles `config.modelRouter` at constructor line 131 (`this.modelRouter = config.modelRouter || config.ModelRouter || null`), and uses it in `enrichTaskContext()` (line 576) and `executeTaskWithEvidence()` (line 823). No changes needed to index.js.

**Test file (4 tests):**
1. Bootstrap tracks model-router-x status
2. ModelRouter receives skillRLManager reference
3. IntegrationLayer.modelRouter is populated after bootstrap
4. route() returns a model selection result

**Commit:** `feat(integration): wire model-router-x into bootstrap as orchestration router`

---

## Phase 4: E2E Verification

### Task 6: Update E2E bootstrap smoke test

**Files:**
- Modify: `integration-tests/bootstrap-e2e.test.js`

**Add assertions for new methods:**
```js
// Memory graph methods
expect(typeof runtime.getSessionErrors).toBe('function');
expect(typeof runtime.getErrorFrequency).toBe('function');
expect(typeof runtime.activateMemoryGraph).toBe('function');

// Fallback doctor methods
expect(typeof runtime.validateFallbackChain).toBe('function');
expect(typeof runtime.diagnoseFallbacks).toBe('function');

// Plugin lifecycle methods
expect(typeof runtime.evaluatePluginHealth).toBe('function');
expect(typeof runtime.listPlugins).toBe('function');

// Sisyphus state methods
expect(typeof runtime.executeWorkflow).toBe('function');
expect(typeof runtime.resumeWorkflow).toBe('function');
expect(typeof runtime.getWorkflowState).toBe('function');

// Model router
expect(runtime.modelRouter).toBeDefined(); // or null if package unavailable
```

**Commit:** `test: update E2E bootstrap smoke test for Wave 2 wiring`

---

## Not In Scope (Future Waves)
- dashboard-launcher (standalone process manager)
- eval-harness (benchmarking framework — CI integration)
- model-benchmark (HumanEval/MBPP runner — CI integration)
- plugin-healthd (standalone daemon)
- Enabling model-router-x MCP entry in opencode.json
