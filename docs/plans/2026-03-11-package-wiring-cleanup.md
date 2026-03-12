# Package Wiring & Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prune 4 dead packages, fix 2 known bugs, create a runtime bootstrap that wires the 15 isolated-but-implemented packages into a live dependency graph, and verify the whole thing with tests.

**Architecture:** Five phases executed sequentially. Each phase leaves the repo green (tests pass, governance checks pass). Phase 0 prunes dead weight. Phase 1 fixes known bugs. Phase 2 creates a bootstrap entry point that instantiates IntegrationLayer with all available packages. Phase 3 wires model-router-x's phantom dependencies. Phase 4 connects remaining high-value packages. All new code follows existing patterns: CJS for integration-layer, ESM for standalone packages, try/catch fail-open imports, Bun test framework.

**Tech Stack:** Bun 1.3.x, CJS (require) for integration-layer, ESM (import) for crash-guard/errors/circuit-breaker, Bun test runner (`bun:test`), governance scripts (learning-gate.mjs, commit-governance hook)

---

## Phase 0: Prune Dead Packages (4 packages)

### Task 1: Extract patterns from memory-bus, then delete

**Files:**
- Extract from: `packages/opencode-memory-bus/spike/sqlite-compatibility.js` (156 LOC)
- Extract from: `packages/opencode-memory-bus/test/spike.test.js` (298 LOC)
- Create: `packages/opencode-test-utils/reference/bun-sqlite-patterns.js`
- Delete: `packages/opencode-memory-bus/` (3 files)

**Step 1: Extract sqlite-vec + FTS5 + bm25 patterns**

The spike file contains unique patterns not found elsewhere in the codebase:
- sqlite-vec loading in bun:sqlite
- FTS5 virtual table creation and MATCH queries
- bm25() scoring
- Vector KNN query: `Float32Array → Buffer → vec0 MATCH`
- sqlite-vec + FTS5 coexistence in same DB

Copy the valuable patterns from `spike/sqlite-compatibility.js` into `packages/opencode-test-utils/reference/bun-sqlite-patterns.js` as documented reference code. Include the 12 bun:sqlite test patterns from `test/spike.test.js` as well.

**Step 2: Verify no runtime references exist**

Search the entire repo for `memory-bus` imports or requires. Only references should be in AGENTS.md inventories or documentation — zero runtime imports.

Expected: No `require('opencode-memory-bus')` or `from 'opencode-memory-bus'` anywhere.

**Step 3: Delete the package directory**

Remove `packages/opencode-memory-bus/` entirely.

**Step 4: Run tests**

Run: `bun test`

Expected: All 213+ tests pass. No test file referenced memory-bus.

**Step 5: Commit**

```
git add -A && git commit -m "chore: extract sqlite patterns from memory-bus, then prune dead spike"
```

---

### Task 2: Extract CLI from goraphdb-bridge into graphdb-bridge, then delete duplicate

**Files:**
- Extract from: `packages/opencode-goraphdb-bridge/bin/cli.js` (366 LOC)
- Create: `packages/opencode-graphdb-bridge/bin/cli.js`
- Delete: `packages/opencode-goraphdb-bridge/` (7 files)

**Step 1: Verify src/ files are true duplicates**

Diff `packages/opencode-goraphdb-bridge/src/` against `packages/opencode-graphdb-bridge/src/`. The src files (index.js, schemas.js) should be identical. client.js differs — graphdb-bridge (keeper) has the IMPROVED version with `safeJsonParse()` and 10MB size guard.

**Step 2: Copy CLI to graphdb-bridge**

`packages/opencode-goraphdb-bridge/bin/cli.js` (366 LOC) is a full GoraphDB CLI with commands: init, query, named-query, inspect, import-session, suggest, schemas, ddl, help. It has a well-structured `parseFlags()` utility. This CLI does NOT exist in graphdb-bridge. Copy it to `packages/opencode-graphdb-bridge/bin/cli.js`. Update the `bin` field in graphdb-bridge's `package.json` to point to it.

**Step 3: Search for references**

Search for `goraphdb-bridge` imports/requires across the repo. Expected: zero runtime references.

**Step 4: Delete the duplicate package**

Remove `packages/opencode-goraphdb-bridge/` entirely.

**Step 5: Run tests**

Run: `bun test`

Expected: All tests pass.

**Step 6: Commit**

```
git add -A && git commit -m "chore: extract CLI from goraphdb-bridge into graphdb-bridge, prune duplicate"
```

---

### Task 3: Merge shared-orchestration into config-loader

**Files:**
- Delete: `packages/opencode-shared-orchestration/` (4 files)
- Modify: `packages/opencode-config-loader/src/index.js` (add 4 utility functions)
- Modify: `packages/opencode-integration-layer/src/index.js` (update import path, lines 1-20)
- Create: `packages/opencode-config-loader/test/context-utils.test.js`

**Step 1: Write failing test for the migrated utilities**

Create `packages/opencode-config-loader/test/context-utils.test.js`:

```js
const { describe, it, expect } = require('bun:test');
const {
  createOrchestrationId,
  pickSessionId,
  normalizeQuotaSignal,
  getQuotaSignal,
} = require('../src/context-utils.js');

describe('context-utils (migrated from shared-orchestration)', () => {
  it('createOrchestrationId generates prefixed UUID', () => {
    const id = createOrchestrationId('task');
    expect(id).toMatch(/^task_[a-f0-9-]+$/);
  });

  it('pickSessionId returns context value or fallback', () => {
    expect(pickSessionId({ sessionId: 'ses_abc' })).toBe('ses_abc');
    expect(pickSessionId({}, 'fallback')).toBe('fallback');
  });

  it('normalizeQuotaSignal clamps to 0-1', () => {
    expect(normalizeQuotaSignal(0.5)).toBe(0.5);
    expect(normalizeQuotaSignal(-1)).toBe(0);
    expect(normalizeQuotaSignal(2)).toBe(1);
  });

  it('getQuotaSignal extracts from context', () => {
    expect(getQuotaSignal({ quota: 0.8 })).toBe(0.8);
    expect(getQuotaSignal({})).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test packages/opencode-config-loader/test/context-utils.test.js`

Expected: FAIL — module not found.

**Step 3: Copy the 4 functions into config-loader**

Create `packages/opencode-config-loader/src/context-utils.js` with the exact 4 functions from `packages/opencode-shared-orchestration/src/context-utils.js` (35 LOC). Keep CJS exports.

**Step 4: Run test to verify it passes**

Run: `bun test packages/opencode-config-loader/test/context-utils.test.js`

Expected: PASS.

**Step 5: Update integration-layer import**

In `packages/opencode-integration-layer/src/index.js`, the try/catch import block (lines ~3-8) tries to require `opencode-shared-orchestration`. Update the require path to `opencode-config-loader/src/context-utils.js`. Keep the existing inline fallback functions — they're the safety net if config-loader also fails.

**Step 6: Run full test suite**

Run: `bun test`

Expected: All tests pass.

**Step 7: Delete shared-orchestration package**

Remove `packages/opencode-shared-orchestration/` entirely.

**Step 8: Run tests again**

Run: `bun test`

Expected: All tests still pass (integration-layer falls back gracefully even if import fails).

**Step 9: Commit**

```
git add -A && git commit -m "refactor: merge shared-orchestration utils into config-loader"
```

---

### Task 4: Extract patterns from model-sync, merge config into model-manager, then delete

**Files:**
- Extract from: `packages/opencode-model-sync/src/index.js` (251 LOC)
- Create: `packages/opencode-model-manager/src/sync-stub.js` (config extraction)
- Create: `packages/opencode-backup-manager/src/rotation.js` (backup rotation pattern)
- Create: `packages/opencode-model-manager/test/sync-stub.test.js`
- Create: `packages/opencode-backup-manager/test/rotation.test.js`
- Delete: `packages/opencode-model-sync/` (4 files)

**Step 1: Extract backup rotation pattern into backup-manager**

model-sync's `backupCatalog()` (lines 105-132) implements timestamped backup with keep-last-N rotation: `catalog-{ISO-timestamp}.json`, keeps only last 10, recursive dir creation. This is a reusable pattern.

Create `packages/opencode-backup-manager/src/rotation.js` with a generalized `rotateBackups(dir, prefix, maxKeep)` function extracted from this pattern. Write a test at `packages/opencode-backup-manager/test/rotation.test.js` that verifies rotation behavior (creates N+1 backups, oldest is removed).

**Step 2: Extract health-check registration pattern as reference**

model-sync's `registerWithHealthCheck(healthCheck)` (lines 181-216) shows the canonical subsystem → health-check integration pattern: `healthCheck.registerSubsystem(name, { checkFn, checkInterval })`. Document this pattern in a comment block at the top of the sync-stub.js file for future wiring reference.

**Step 3: Write failing test for sync config**

Create `packages/opencode-model-manager/test/sync-stub.test.js`:

```js
const { describe, it, expect } = require('bun:test');
const { getSyncConfig } = require('../src/sync-stub.js');

describe('sync-stub (migrated from model-sync)', () => {
  it('returns sync config with defaults', () => {
    const config = getSyncConfig();
    expect(config).toHaveProperty('syncIntervalMs');
    expect(config).toHaveProperty('providers');
    expect(config.syncIntervalMs).toBeGreaterThan(0);
  });
});
```

**Step 4: Run test to verify it fails**

Run: `bun test packages/opencode-model-manager/test/sync-stub.test.js`

Expected: FAIL — module not found.

**Step 5: Create sync-stub.js with config extraction + health-check reference**

Extract the config-reading logic from model-sync (env vars, provider URLs, intervals) into `packages/opencode-model-manager/src/sync-stub.js`. Drop the hardcoded hypothetical model list and the stub `fetchLatestModels()`. Include the health-check registration pattern as a documented reference comment.

**Step 6: Run test to verify it passes**

Run: `bun test packages/opencode-model-manager/test/sync-stub.test.js`

Expected: PASS.

**Step 7: Delete model-sync package**

Remove `packages/opencode-model-sync/` entirely.

**Step 8: Run full tests**

Run: `bun test`

Expected: All tests pass.

**Step 9: Commit**

```
git add -A && git commit -m "refactor: merge model-sync config into model-manager, prune stub"
```

---

## Phase 1: Fix Known Bugs

### Task 5: Fix buildManifestFromConfig() args leak

**Files:**
- Modify: `scripts/generate-mcp-config.mjs` (line 44)
- Modify: `scripts/test/generate-mcp-config.test.mjs` (or create if absent)

**Step 1: Write failing test**

The test should verify that `buildManifestFromConfig()` does NOT include `args` or `description` in its output entries.

```js
import { describe, it, expect } from 'bun:test';
import { buildManifestFromConfig } from '../generate-mcp-config.mjs';

describe('buildManifestFromConfig', () => {
  it('does not emit args or description into manifest entries', () => {
    const config = {
      mcpServers: {
        'test-server': {
          command: ['node', 'server.js'],
          args: ['--port', '3000'],       // should be stripped
          description: 'A test server',    // should be stripped
          enabled: true,
        },
      },
    };
    const manifest = buildManifestFromConfig(config);
    const entry = manifest['test-server'];
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty('args');
    expect(entry).not.toHaveProperty('description');
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — entry has `args` property because line 44 copies it.

**Step 3: Fix the bug**

In `scripts/generate-mcp-config.mjs`, line 44, remove `args: cfg.args` from the manifest entry construction. The `command` array already contains the full command + args for valid MCP entries.

Before (line ~44):
```js
args: cfg.args,
```

After: Remove this line entirely.

**Step 4: Run test to verify it passes**

Expected: PASS.

**Step 5: Run full tests**

Run: `bun test`

Expected: All tests pass.

**Step 6: Commit**

```
git add -A && git commit -m "fix(scripts): remove args leak from buildManifestFromConfig manifest output"
```

---

### Task 6: Fix DCP/Distill runtime invocation chain

**Files:**
- Modify: `packages/opencode-integration-layer/src/index.js` (resolveRuntimeContext method, lines ~392-424)
- Create: `packages/opencode-integration-layer/tests/distill-wiring.test.js`

**Context:** The DCP/Distill chain currently works as follows:
1. `context-governor` tracks token budget per session+model
2. `context-bridge.js` evaluates budget → returns advisory (`compress_urgent` / `compress` / `none`)
3. `integration-layer.resolveRuntimeContext()` reads that advisory and sets `compression.active = true` when budget >= 65%
4. **But nobody calls `resolveRuntimeContext()`** — so the advisory is never evaluated

The distill MCP server IS configured and running — the issue is that no code reads the advisory and acts on it. This is fixed in Phase 2 (bootstrap) when something finally calls `resolveRuntimeContext()`. This task ensures the method itself works correctly when called.

**Step 1: Write test for DCP advisory wiring**

Create `packages/opencode-integration-layer/tests/distill-wiring.test.js`:

```js
const { describe, it, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index');

describe('DCP/Distill wiring in resolveRuntimeContext', () => {
  it('returns compression advisory when context budget exceeds threshold', () => {
    const integration = new IntegrationLayer({});

    // Mock context-governor to report high usage
    integration.contextBridge = {
      evaluateAndCompress: () => ({
        action: 'compress',
        reason: 'Budget at 70%',
        pct: 70,
      }),
    };

    // Mock preload-skills to return tool selection
    integration.preloadSkills = {
      selectTools: () => ({
        tools: [{ id: 'grep', tier: 0 }],
        totalTokens: 500,
      }),
    };

    const result = integration.resolveRuntimeContext({
      sessionId: 'test-session',
      model: 'claude-sonnet-4-20250514',
      taskType: 'code-edit',
    });

    expect(result).toHaveProperty('compression');
    expect(result.compression.active).toBe(true);
  });

  it('returns no compression when budget is healthy', () => {
    const integration = new IntegrationLayer({});

    integration.contextBridge = {
      evaluateAndCompress: () => ({
        action: 'none',
        reason: 'Budget healthy at 30%',
        pct: 30,
      }),
    };

    integration.preloadSkills = {
      selectTools: () => ({
        tools: [{ id: 'grep', tier: 0 }],
        totalTokens: 500,
      }),
    };

    const result = integration.resolveRuntimeContext({
      sessionId: 'test-session',
      model: 'claude-sonnet-4-20250514',
      taskType: 'code-edit',
    });

    expect(result.compression.active).toBe(false);
  });
});
```

**Step 2: Run test**

Run: `bun test packages/opencode-integration-layer/tests/distill-wiring.test.js`

Expected: Should PASS if the method is correctly implemented. If it fails, debug and fix the method internals. The method exists (lines 392-424) — this test validates it works correctly with mocked dependencies.

**Step 3: Commit**

```
git add -A && git commit -m "test: add DCP/Distill wiring verification for resolveRuntimeContext"
```

---

## Phase 2: Bootstrap — Create Runtime Entry Point

### Task 7: Create bootstrap module

**Files:**
- Create: `packages/opencode-integration-layer/src/bootstrap.js`
- Create: `packages/opencode-integration-layer/tests/bootstrap.test.js`

**Context:** Currently NO code instantiates IntegrationLayer or calls initCrashGuard(). This task creates a bootstrap module that:
1. Calls `initCrashGuard()` first (prevents Bun ENOENT segfaults)
2. Instantiates IntegrationLayer with all available packages injected
3. Exports a singleton + a `bootstrap()` factory function
4. All imports are fail-open (try/catch) following existing integration-layer pattern

**Step 1: Write failing test**

Create `packages/opencode-integration-layer/tests/bootstrap.test.js`:

```js
const { describe, it, expect } = require('bun:test');

describe('bootstrap', () => {
  it('exports a bootstrap factory function', () => {
    const { bootstrap } = require('../src/bootstrap.js');
    expect(typeof bootstrap).toBe('function');
  });

  it('bootstrap() returns an IntegrationLayer instance', () => {
    const { bootstrap } = require('../src/bootstrap.js');
    const instance = bootstrap();
    expect(instance).toBeDefined();
    expect(typeof instance.resolveRuntimeContext).toBe('function');
    expect(typeof instance.selectToolsForTask).toBe('function');
    expect(typeof instance.checkContextBudget).toBe('function');
  });

  it('bootstrap() initializes crash-guard', () => {
    const { bootstrap, getBootstrapStatus } = require('../src/bootstrap.js');
    bootstrap();
    const status = getBootstrapStatus();
    expect(status).toHaveProperty('crashGuardInitialized');
    // crash-guard init may fail in test env — that's ok, we just verify it was attempted
    expect(typeof status.crashGuardInitialized).toBe('boolean');
  });

  it('bootstrap() loads available packages fail-open', () => {
    const { bootstrap, getBootstrapStatus } = require('../src/bootstrap.js');
    bootstrap();
    const status = getBootstrapStatus();
    expect(status).toHaveProperty('packagesAttempted');
    expect(status).toHaveProperty('packagesLoaded');
    expect(status.packagesAttempted).toBeGreaterThan(0);
  });

  it('subsequent bootstrap() calls return same singleton', () => {
    const { bootstrap } = require('../src/bootstrap.js');
    const a = bootstrap();
    const b = bootstrap();
    expect(a).toBe(b);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test packages/opencode-integration-layer/tests/bootstrap.test.js`

Expected: FAIL — module not found.

**Step 3: Implement bootstrap.js**

Create `packages/opencode-integration-layer/src/bootstrap.js` (CJS):

```js
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

// ESM packages need dynamic import — but bootstrap is sync CJS.
// For ESM packages (crash-guard, errors, circuit-breaker), use require()
// which Bun supports for ESM packages in workspace context.
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
```

**Step 4: Run test to verify it passes**

Run: `bun test packages/opencode-integration-layer/tests/bootstrap.test.js`

Expected: PASS. Some packages may fail to load in test env — that's fine, bootstrap is fail-open.

**Step 5: Run full tests**

Run: `bun test`

Expected: All tests pass.

**Step 6: Commit**

```
git add -A && git commit -m "feat(integration): add bootstrap module for runtime package wiring"
```

---

### Task 8: Wire bootstrap into a runnable entry point

**Files:**
- Create: `scripts/bootstrap-runtime.mjs`
- Create: `scripts/test/bootstrap-runtime.test.mjs`

**Context:** The bootstrap module creates the wired IntegrationLayer, but something needs to call it. This script serves as the canonical entry point that other scripts/tools can invoke or import.

**Step 1: Write failing test**

Create `scripts/test/bootstrap-runtime.test.mjs`:

```js
import { describe, it, expect } from 'bun:test';
import { resolve } from 'path';
import { existsSync } from 'fs';

describe('bootstrap-runtime script', () => {
  it('script file exists', () => {
    const scriptPath = resolve(import.meta.dir, '..', 'bootstrap-runtime.mjs');
    expect(existsSync(scriptPath)).toBe(true);
  });

  it('exports getRuntime function', async () => {
    const mod = await import('../bootstrap-runtime.mjs');
    expect(typeof mod.getRuntime).toBe('function');
  });

  it('getRuntime returns an IntegrationLayer instance', async () => {
    const { getRuntime } = await import('../bootstrap-runtime.mjs');
    const runtime = getRuntime();
    expect(runtime).toBeDefined();
    expect(typeof runtime.resolveRuntimeContext).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — module not found.

**Step 3: Create bootstrap-runtime.mjs**

Create `scripts/bootstrap-runtime.mjs`:

```js
#!/usr/bin/env node
/**
 * bootstrap-runtime.mjs — Canonical runtime entry point.
 *
 * Usage:
 *   import { getRuntime } from './bootstrap-runtime.mjs';
 *   const runtime = getRuntime();
 *   const ctx = runtime.resolveRuntimeContext({ sessionId, model, taskType });
 *
 * Or run directly:
 *   node scripts/bootstrap-runtime.mjs --status
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { bootstrap, getBootstrapStatus } = require(
  '../packages/opencode-integration-layer/src/bootstrap.js'
);

let runtime = null;

export function getRuntime(options = {}) {
  if (!runtime) {
    runtime = bootstrap(options);
  }
  return runtime;
}

export function getRuntimeStatus() {
  return getBootstrapStatus();
}

// CLI mode: node scripts/bootstrap-runtime.mjs --status
if (import.meta.url === `file://${process.argv[1]}` || process.argv.includes('--status')) {
  const rt = getRuntime();
  const status = getRuntimeStatus();
  console.log('Bootstrap Status:');
  console.log(JSON.stringify(status, null, 2));
  console.log(`\nIntegrationLayer ready: ${!!rt}`);
  console.log(`Runtime context methods: resolveRuntimeContext, selectToolsForTask, checkContextBudget`);
}
```

**Step 4: Run test to verify it passes**

Run: `bun test scripts/test/bootstrap-runtime.test.mjs`

Expected: PASS.

**Step 5: Run full tests**

Run: `bun test`

Expected: All tests pass.

**Step 6: Commit**

```
git add -A && git commit -m "feat(scripts): add bootstrap-runtime entry point for package wiring"
```

---

## Phase 3: Wire model-router-x Phantom Dependencies

### Task 9: Clean up model-router-x package.json — remove phantom deps

**Files:**
- Modify: `packages/opencode-model-router-x/package.json`

**Context:** model-router-x declares 8 workspace deps but only imports 2 (config-loader, context-governor). The other 6 are phantom — declared but never used. This is misleading and causes unnecessary install overhead.

**Step 1: Read current package.json**

Identify the 6 phantom dependencies: uuid, zod, learning-engine, model-benchmark, health-check, fallback-doctor, feature-flags (any that aren't config-loader or context-governor and aren't imported in src/).

**Step 2: Verify no src/ imports**

Search `packages/opencode-model-router-x/src/` for any require/import of the phantom deps. Confirm they are truly unused.

**Step 3: Remove phantom deps from package.json**

Keep only the deps that are actually imported in src/:
- `opencode-config-loader`
- `opencode-context-governor`
- Plus any external deps (uuid, zod) that ARE used — verify first.

**Step 4: Run tests**

Run: `bun test packages/opencode-model-router-x/`

Expected: All model-router-x tests pass (they never used those deps either).

**Step 5: Commit**

```
git add -A && git commit -m "chore(model-router-x): remove 6 phantom workspace deps never imported in src"
```

---

### Task 10: Wire circuit-breaker into model-router-x provider calls

**Files:**
- Modify: `packages/opencode-model-router-x/src/index.js` (provider execution path)
- Create: `packages/opencode-model-router-x/test/circuit-breaker-wiring.test.js`
- Modify: `packages/opencode-model-router-x/package.json` (add circuit-breaker dep)

**Context:** model-router-x selects providers but doesn't protect against provider failures. circuit-breaker implements CLOSED/OPEN/HALF_OPEN per-provider. Wire it in.

**Step 1: Identify the provider execution path in model-router-x**

Read `packages/opencode-model-router-x/src/index.js` to find where providers are called. Look for the function that actually dispatches to a model provider.

**Step 2: Write failing test**

```js
const { describe, it, expect } = require('bun:test');

describe('model-router-x circuit breaker wiring', () => {
  it('wraps provider calls with circuit breaker', () => {
    // Test that when a provider is called through model-router-x,
    // it goes through a circuit breaker. Mock the circuit breaker
    // and verify execute() is called.
    // Exact test depends on model-router-x's provider call API.
  });

  it('opens circuit after consecutive failures', () => {
    // Test that after N consecutive provider failures,
    // the circuit opens and subsequent calls fail fast.
  });
});
```

> **Note:** Exact test implementation depends on model-router-x's provider call API discovered in Step 1. The implementing engineer must read the source to determine the exact integration point.

**Step 3: Wire circuit-breaker**

In the provider execution path:
1. Import CircuitBreaker (try/catch fail-open)
2. Create a Map of provider-name → CircuitBreaker instance
3. Wrap provider calls with `breaker.execute(fn)`
4. On circuit open, fall through to next provider in priority list

**Step 4: Add dep to package.json**

Add `"opencode-circuit-breaker": "workspace:*"` to dependencies.

**Step 5: Run tests**

Run: `bun test packages/opencode-model-router-x/`

Expected: All tests pass.

**Step 6: Commit**

```
git add -A && git commit -m "feat(model-router-x): wire circuit-breaker into provider execution"
```

---

## Phase 4: Wire Remaining High-Value Packages

### Task 11: Wire errors package into integration-layer error paths

**Files:**
- Modify: `packages/opencode-integration-layer/src/index.js` (add OpenCodeError import + usage)
- Create: `packages/opencode-integration-layer/tests/error-wiring.test.js`

**Step 1: Write failing test**

```js
const { describe, it, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index');

describe('error wiring', () => {
  it('throws OpenCodeError with category on validation failure', () => {
    const integration = new IntegrationLayer({});
    try {
      integration.validateInput(null, { required: true, type: 'string' });
    } catch (err) {
      expect(err.category || err.code).toBeDefined();
    }
  });
});
```

**Step 2: Import OpenCodeError fail-open**

Add to integration-layer's try/catch import block:

```js
let OpenCodeError = null;
try {
  ({ OpenCodeError } = require('../../opencode-errors/src/index.js'));
} catch { /* fail-open: use plain Error */ }
```

**Step 3: Wrap key error throws to use OpenCodeError when available**

In methods like `validateInput()`, `safeSpawn()`, `checkContextBudget()` — when they throw or return errors, use `OpenCodeError` with appropriate `ErrorCategory` and `ErrorCode` if the package loaded. Fall back to plain `Error` if not.

**Step 4: Run tests**

Run: `bun test`

Expected: All tests pass.

**Step 5: Commit**

```
git add -A && git commit -m "feat(integration): wire errors package into integration-layer error paths"
```

---

### Task 12: Wire logger into integration-layer

**Files:**
- Modify: `packages/opencode-integration-layer/src/index.js` (replace console.log with logger)
- Create: `packages/opencode-integration-layer/tests/logger-wiring.test.js`

**Context:** integration-layer already try/catch imports logger (lines ~10-15) and creates a fallback. But many methods still use `console.log` / `console.warn` directly. Replace with the loaded logger instance.

**Step 1: Search for console.log/warn/error in integration-layer src**

Find all raw console calls that should use the structured logger.

**Step 2: Write test**

```js
const { describe, it, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index');

describe('logger wiring', () => {
  it('uses structured logger instead of console for operational messages', () => {
    const logs = [];
    const integration = new IntegrationLayer({});
    // Inject mock logger
    integration.logger = {
      info: (...args) => logs.push(['info', ...args]),
      warn: (...args) => logs.push(['warn', ...args]),
      error: (...args) => logs.push(['error', ...args]),
      debug: (...args) => logs.push(['debug', ...args]),
    };

    // Trigger a method that logs
    integration.resolveRuntimeContext({ sessionId: 'test', model: 'test' });

    // Verify logger was called instead of console
    expect(logs.length).toBeGreaterThan(0);
  });
});
```

**Step 3: Replace console calls with logger**

Replace `console.log` → `this.logger.info`, `console.warn` → `this.logger.warn`, `console.error` → `this.logger.error` throughout the IntegrationLayer methods.

**Step 4: Run tests**

Run: `bun test`

Expected: All tests pass.

**Step 5: Commit**

```
git add -A && git commit -m "feat(integration): wire structured logger replacing raw console calls"
```

---

### Task 13: Wire runbooks into integration-layer error handling

**Files:**
- Modify: `packages/opencode-integration-layer/src/bootstrap.js` (already loads Runbooks)
- Modify: `packages/opencode-integration-layer/src/index.js` (add diagnose method)
- Create: `packages/opencode-integration-layer/tests/runbooks-wiring.test.js`

**Step 1: Write failing test**

```js
const { describe, it, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index');

describe('runbooks wiring', () => {
  it('exposes diagnose() that delegates to runbooks', () => {
    const integration = new IntegrationLayer({});
    const mockRunbooks = {
      diagnose: (error) => ({
        matched: true,
        pattern: 'ENOENT',
        remedy: 'Check command exists',
      }),
    };
    integration.runbooks = mockRunbooks;

    const result = integration.diagnose(new Error('ENOENT: no such file'));
    expect(result.matched).toBe(true);
    expect(result.remedy).toBeDefined();
  });

  it('returns null gracefully when runbooks unavailable', () => {
    const integration = new IntegrationLayer({});
    integration.runbooks = null;

    const result = integration.diagnose(new Error('some error'));
    expect(result).toBeNull();
  });
});
```

**Step 2: Add diagnose() method to IntegrationLayer**

```js
diagnose(error, context = {}) {
  if (!this.runbooks) return null;
  try {
    return this.runbooks.diagnose(error, context);
  } catch {
    return null;
  }
}
```

**Step 3: Run tests**

Run: `bun test`

Expected: All tests pass.

**Step 4: Commit**

```
git add -A && git commit -m "feat(integration): wire runbooks auto-diagnosis into integration-layer"
```

---

### Task 14: Wire plugin-preload-skills into bootstrap

**Files:**
- Modify: `packages/opencode-integration-layer/src/bootstrap.js` (add preload-skills init)
- Create: `packages/opencode-integration-layer/tests/preload-skills-wiring.test.js`

**Context:** plugin-preload-skills has `selectTools(context)` which is the tool-selection engine. IntegrationLayer's `selectToolsForTask()` already delegates to `this.preloadSkills.selectTools()` — but `preloadSkills` is never injected. Bootstrap should instantiate and inject it.

**Step 1: Write failing test**

```js
const { describe, it, expect } = require('bun:test');

describe('preload-skills bootstrap wiring', () => {
  it('bootstrap injects preloadSkills into IntegrationLayer', () => {
    // Clear singleton
    const { resetBootstrap, bootstrap } = require('../src/bootstrap.js');
    resetBootstrap();

    const instance = bootstrap();
    // preloadSkills may or may not load depending on deps — but attempt is tracked
    const { getBootstrapStatus } = require('../src/bootstrap.js');
    const status = getBootstrapStatus();
    expect(status.packages).toHaveProperty('preload-skills');
  });
});
```

**Step 2: Add preload-skills to bootstrap.js**

In the fail-open import block:

```js
let PreloadSkillsPlugin = null;
PreloadSkillsPlugin = tryLoad('preload-skills', () =>
  require('../../opencode-plugin-preload-skills/src/index.js').PreloadSkillsPlugin
);
```

In the bootstrap function, after SkillRLManager instantiation:

```js
if (PreloadSkillsPlugin) {
  try {
    const preload = new PreloadSkillsPlugin({
      skillRL: config.skillRLManager || null,
    });
    preload.init(); // loads tier resolver
    config.preloadSkills = preload;
    bootstrapStatus.packages['preload-skills'] = true;
  } catch { bootstrapStatus.packages['preload-skills'] = false; }
}
```

**Step 3: Run tests**

Run: `bun test`

Expected: All tests pass.

**Step 4: Commit**

```
git add -A && git commit -m "feat(integration): wire plugin-preload-skills into bootstrap for tool selection"
```

---

### Task 15: Final verification — end-to-end bootstrap smoke test

**Files:**
- Create: `integration-tests/bootstrap-e2e.test.js`

**Step 1: Write E2E test**

```js
const { describe, it, expect } = require('bun:test');

describe('bootstrap E2E', () => {
  it('full bootstrap produces a functional runtime', () => {
    // Clean state
    const { resetBootstrap, bootstrap, getBootstrapStatus } =
      require('../packages/opencode-integration-layer/src/bootstrap.js');
    resetBootstrap();

    const runtime = bootstrap({ sessionId: 'e2e-test' });
    const status = getBootstrapStatus();

    // Verify core methods exist
    expect(typeof runtime.resolveRuntimeContext).toBe('function');
    expect(typeof runtime.selectToolsForTask).toBe('function');
    expect(typeof runtime.checkContextBudget).toBe('function');
    expect(typeof runtime.diagnose).toBe('function');

    // Verify at least some packages loaded
    expect(status.packagesAttempted).toBeGreaterThan(0);
    console.log(`Loaded ${status.packagesLoaded}/${status.packagesAttempted} packages`);
    console.log('Package status:', JSON.stringify(status.packages, null, 2));

    // Verify resolveRuntimeContext doesn't throw
    const ctx = runtime.resolveRuntimeContext({
      sessionId: 'e2e-test',
      model: 'claude-sonnet-4-20250514',
      taskType: 'code-edit',
    });
    expect(ctx).toBeDefined();
    expect(ctx).toHaveProperty('compression');
  });

  it('bootstrap is idempotent', () => {
    const { bootstrap } =
      require('../packages/opencode-integration-layer/src/bootstrap.js');
    const a = bootstrap();
    const b = bootstrap();
    expect(a).toBe(b);
  });
});
```

**Step 2: Run E2E test**

Run: `bun test integration-tests/bootstrap-e2e.test.js`

Expected: PASS — runtime boots with available packages.

**Step 3: Run full test suite**

Run: `bun test`

Expected: All 213+ existing tests pass + new tests pass.

**Step 4: Run governance checks**

Run: `bun run governance:check`

Expected: All governance gates pass.

**Step 5: Final commit**

```
git add -A && git commit -m "test: add bootstrap E2E smoke test verifying full package wiring"
```

---

## Summary

| Phase | Tasks | Packages Affected | Risk |
|-------|-------|-------------------|------|
| 0: Prune | 1-4 | 4 deleted/merged | Low — dead code removal |
| 1: Bug fixes | 5-6 | 2 scripts/modules | Low — isolated fixes |
| 2: Bootstrap | 7-8 | 1 new module + 1 script | Medium — new entry point |
| 3: model-router-x | 9-10 | 1 package cleanup + wiring | Medium — touches routing |
| 4: High-value wiring | 11-14 | 4 packages wired | Medium — multiple integration points |
| 4: Verification | 15 | E2E test | Low — read-only verification |

**Total: 15 tasks, ~15 atomic commits, estimated 2-3 hours of implementation.**

**Not in scope (future work):**
- Wiring lower-priority packages: feature-flags, health-check, dashboard-launcher, plugin-lifecycle, memory-graph, backup-manager, proofcheck, showboat-wrapper, fallback-doctor, sisyphus-state
- Making model-router-x actually callable at runtime (needs opencode hook point)
- Connecting skill-rl-manager feedback loop to eval-harness results
- Wiring learning-engine anti-pattern detection into agent routing
