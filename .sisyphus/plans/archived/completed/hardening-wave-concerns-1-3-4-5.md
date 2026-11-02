# Hardening Wave: Concerns 1, 3, 4, 5

> **Source**: `docs/model-management/HARDENING-BACKLOG.md`
> **Prerequisite**: All tests green (commit `4d353c5`)

**Goal:** Close 4 of 6 hardening backlog concerns: extend boundary enforcement beyond dashboard, unify rollback schema validation, fix multi-process transition race, add warning budget governance.

---

## Wave 1: Boundary Enforcement Extension (Concern 1) + Snapshot Schema Unification (Concern 3)
*Parallel — no shared files*

### Task 1: Extend ci-boundary-enforce.mjs to all packages

**Files:**
- Modify: `scripts/ci-boundary-enforce.mjs`
- Test: `scripts/tests/ci-boundary-enforce.test.js` (CREATE)

**Current state:** Only scans `packages/opencode-dashboard/src/app/api/` TS files.

**Step 1: Create test file with failing tests**

```javascript
// scripts/tests/ci-boundary-enforce.test.js
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const SCRIPT = join(import.meta.dir, '..', 'ci-boundary-enforce.mjs');

describe('ci-boundary-enforce', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'boundary-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('fails when non-dashboard package imports model-manager internals', () => {
    // Create a fake package with forbidden import
    const pkgDir = join(tempDir, 'packages', 'opencode-foo', 'src');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'bar.js'),
      `import { something } from 'opencode-model-manager/src/internal';`
    );
    const result = spawnSync('node', [SCRIPT, '--root', tempDir], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
  });

  test('passes when packages use only public exports', () => {
    const pkgDir = join(tempDir, 'packages', 'opencode-foo', 'src');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'bar.js'),
      `import { ModelStateMachine } from 'opencode-model-manager/lifecycle/state-machine';`
    );
    const result = spawnSync('node', [SCRIPT, '--root', tempDir], { encoding: 'utf8' });
    expect(result.status).toBe(0);
  });

  test('skips opencode-model-manager itself', () => {
    const pkgDir = join(tempDir, 'packages', 'opencode-model-manager', 'src');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'internal.js'),
      `import { db } from './db.js';`  // self-import is fine
    );
    const result = spawnSync('node', [SCRIPT, '--root', tempDir], { encoding: 'utf8' });
    expect(result.status).toBe(0);
  });
});
```

**Step 2: Modify ci-boundary-enforce.mjs**

Changes:
- Accept `--root <dir>` CLI arg (default to process.cwd())
- Scan ALL `packages/*/src/**/*.{js,mjs,ts,tsx}` (not just dashboard API)
- Skip `packages/opencode-model-manager/` itself
- Keep existing forbidden pattern: `opencode-model-manager/(src|lib)/`
- Exit 1 if any violations found

**Step 3: Run tests**

```bash
bun test scripts/tests/ci-boundary-enforce.test.js
```

**Step 4: Verify existing test suites unaffected**

```bash
bun test
```

---

### Task 2: Unify snapshot schema validation

**Files:**
- Create: `packages/opencode-model-manager/src/snapshot/snapshot-schema.js`
- Modify: `packages/opencode-model-manager/src/snapshot/snapshot-store.js` (use shared schema)
- Modify: `scripts/model-rollback.mjs` (use shared schema)
- Create: `packages/opencode-model-manager/test/snapshot/snapshot-schema.test.js`

**Step 1: Create shared schema module**

```javascript
// packages/opencode-model-manager/src/snapshot/snapshot-schema.js
// NOTE: Package is "type": "commonjs" — use CJS module.exports
'use strict';

const crypto = require('crypto');

/**
 * Canonical snapshot shape:
 * {
 *   id: string (UUID),
 *   timestamp: number (epoch_ms, positive finite),
 *   provider: string,
 *   models: Array<{ id: string, provider: string, name?: string }>,
 *   rawPayloadHash?: string,
 *   metadata?: { discoveryDuration?: number, modelCount?: number }
 * }
 */

function validateSnapshot(snapshot) {
  const errors = [];

  if (!snapshot || typeof snapshot !== 'object') {
    return { valid: false, errors: ['snapshot must be a non-null object'] };
  }

  if (typeof snapshot.id !== 'string' || !snapshot.id) {
    errors.push('snapshot.id must be a non-empty string');
  }

  if (typeof snapshot.timestamp !== 'number' || !Number.isFinite(snapshot.timestamp) || snapshot.timestamp <= 0) {
    errors.push('snapshot.timestamp must be a finite positive number');
  }

  if (!Array.isArray(snapshot.models) || snapshot.models.length === 0) {
    errors.push('snapshot.models must be a non-empty array');
  } else {
    for (let i = 0; i < snapshot.models.length; i++) {
      const model = snapshot.models[i];
      if (!model || typeof model !== 'object') {
        errors.push(`snapshot.models[${i}] must be an object`);
        continue;
      }
      if (!model.id && !model.name) {
        errors.push(`snapshot.models[${i}] must have id or name`);
      }
      if (typeof model.provider !== 'string') {
        errors.push(`snapshot.models[${i}].provider must be a string`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    timestamp: typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)
      ? raw.timestamp
      : Date.now(),
    provider: typeof raw.provider === 'string' ? raw.provider : '',
    models: Array.isArray(raw.models) ? raw.models : [],
    rawPayloadHash: raw.rawPayloadHash || undefined,
    metadata: raw.metadata && typeof raw.metadata === 'object'
      ? {
          discoveryDuration: raw.metadata.discoveryDuration,
          modelCount: raw.metadata.modelCount ?? (Array.isArray(raw.models) ? raw.models.length : 0),
        }
      : undefined,
  };
}

module.exports = { validateSnapshot, normalizeSnapshot };
```

**Step 2: Create tests**

```javascript
// packages/opencode-model-manager/test/snapshot/snapshot-schema.test.js
import { describe, test, expect } from 'bun:test';
import { validateSnapshot, normalizeSnapshot } from '../../src/snapshot/snapshot-schema.js';

describe('validateSnapshot', () => {
  test('accepts valid snapshot', () => {
    const result = validateSnapshot({
      id: 'abc-123', timestamp: Date.now(), provider: 'openai',
      models: [{ id: 'm1', provider: 'openai', name: 'gpt-4' }]
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects null', () => {
    expect(validateSnapshot(null).valid).toBe(false);
  });

  test('rejects missing id', () => {
    const r = validateSnapshot({ timestamp: 1, provider: 'x', models: [{ id: 'a', provider: 'x' }] });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('id'))).toBe(true);
  });

  test('rejects empty models', () => {
    const r = validateSnapshot({ id: 'x', timestamp: 1, provider: 'x', models: [] });
    expect(r.valid).toBe(false);
  });

  test('rejects model without id or name', () => {
    const r = validateSnapshot({ id: 'x', timestamp: 1, provider: 'x', models: [{ provider: 'x' }] });
    expect(r.valid).toBe(false);
  });
});

describe('normalizeSnapshot', () => {
  test('fills defaults for missing fields', () => {
    const result = normalizeSnapshot({ models: [{ id: 'a', provider: 'x' }] });
    expect(result.id).toBeTruthy();
    expect(result.timestamp).toBeGreaterThan(0);
    expect(result.provider).toBe('');
  });

  test('preserves existing values', () => {
    const result = normalizeSnapshot({
      id: 'keep', timestamp: 12345, provider: 'anthropic',
      models: [{ id: 'a', provider: 'anthropic' }]
    });
    expect(result.id).toBe('keep');
    expect(result.timestamp).toBe(12345);
    expect(result.provider).toBe('anthropic');
  });

  test('returns null for non-object', () => {
    expect(normalizeSnapshot(null)).toBeNull();
    expect(normalizeSnapshot('string')).toBeNull();
  });
});
```

**Step 3: Refactor snapshot-store.js**

Replace inline `normalizeSnapshot()` (lines 183-221) with import from `./snapshot-schema.js`. Keep the export name for backward compat via re-export.

**Step 4: Refactor model-rollback.mjs**

Replace inline `validateSnapshotForRestore()` (lines 415-454) with import from `packages/opencode-model-manager/src/snapshot/snapshot-schema.js`. Keep the function name for backward compat via wrapper.

**Step 5: Run all affected tests**

```bash
bun test packages/opencode-model-manager/test/snapshot/ scripts/tests/
```

---

## Wave 2: Multi-Process Transition Safety (Concern 4)
*Sequential — depends on Wave 1 tests passing*

### Task 3: Atomic compare-and-swap in state transitions

**Files:**
- Modify: `packages/opencode-model-manager/src/lifecycle/state-machine.js`
- Modify: `packages/opencode-model-manager/test/lifecycle/state-machine.test.ts`

**Current race:** `transition()` reads state at line 50, validates at lines 58-64, then `_persistTransition()` opens `BEGIN IMMEDIATE` at line 437 and writes. Another process can interleave.

**Fix approach:** Move state verification inside the transaction using compare-and-swap.

**API notes (from code):**
- Class: `StateMachine` (NOT ModelStateMachine)
- `transition(modelId, toState, context)` — NO fromState arg, THROWS on failure
- Table: `model_lifecycle_states` (NOT model_states)
- States: detected → assessed → approved → selectable → default
- `_getStateRow()` returns `{currentState, metadata}`
- `_persistTransition(payload)` where payload has `{modelId, fromState, toState, timestamp, context, sideEffects, metadata}`

**Step 1: Add failing test for concurrent cross-process transitions**

```typescript
// Add to state-machine.test.ts
test('throws STALE_STATE when state changed between read and persist', async () => {
  const sm = new StateMachine({ dbPath });
  // Initialize and advance to "detected"
  sm.initialize('model-race');
  await sm.transition('model-race', 'assessed');

  // Simulate another process advancing state behind our back
  sm.db.exec(`UPDATE model_lifecycle_states SET current_state = 'approved' WHERE model_id = 'model-race'`);

  // Now try to transition from (stale) "assessed" -> "approved"
  // The read will see "approved" but _persistTransition should detect the race
  // since fromState was "assessed" when read, but DB now says "approved"
  await expect(sm.transition('model-race', 'approved')).rejects.toThrow();
});
```

**Step 2: Modify _persistTransition()**

Change `_persistTransition()` to:
1. Keep `BEGIN IMMEDIATE`
2. After BEGIN, SELECT current_state inside the transaction to verify it matches `payload.fromState`
3. If mismatch → ROLLBACK, throw `createStateError('STALE_STATE', 'state changed by concurrent process')`
4. If match → proceed with existing INSERT/UPDATE + COMMIT

This is the minimal fix: adds one SELECT inside the existing transaction boundary. No schema changes needed.

**Step 3: Run tests**

```bash
bun test packages/opencode-model-manager/test/lifecycle/
```

---

## Wave 3: Warning Budget Governance (Concern 5)
*Sequential — depends on Wave 2*

### Task 4: Create warning budget baseline and CI script

**Files:**
- Create: `opencode-config/warning-baseline.json`
- Create: `scripts/ci-warning-budget.mjs`
- Create: `scripts/tests/ci-warning-budget.test.js`
- Modify: `package.json` (add to `governance:check`)

**Step 1: Capture current warning baseline**

Run `bun test 2>&1`, extract warning lines, categorize into:
```json
{
  "version": 1,
  "capturedAt": "2026-03-14",
  "categories": {
    "integration-layer-degraded": { "pattern": "IntegrationLayer .* degraded", "maxCount": 5, "note": "Expected: fail-open tryLoad()" },
    "orchestration-advisor-stub": { "pattern": "OrchestrationAdvisor.*stub", "maxCount": 2, "note": "Expected: advisor initialization" },
    "dashboard-write-token": { "pattern": "dashboard.*write.*token", "maxCount": 1, "note": "Expected: no OPENCODE_DASHBOARD_TOKEN" },
    "skills-api-parse": { "pattern": "Skills API.*parse", "maxCount": 1, "note": "Test case: intentional" },
    "skillrl-corrupted": { "pattern": "SkillRL.*corrupted", "maxCount": 1, "note": "Test case: intentional" }
  }
}
```

**Step 2: Create ci-warning-budget.mjs**

Following `integrity-guard.mjs` pattern:
- Read baseline from `opencode-config/warning-baseline.json`
- Accept `--capture` flag to regenerate baseline
- Accept `--check` flag (default) to compare test output warnings against baseline
- For each category: count matches, fail if count exceeds `maxCount`
- Fail if NEW uncategorized warnings appear
- Exit 0 on pass, 1 on regression

**Step 3: Create tests**

```javascript
// scripts/tests/ci-warning-budget.test.js
import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const SCRIPT = join(import.meta.dir, '..', 'ci-warning-budget.mjs');

describe('ci-warning-budget', () => {
  test('passes when warnings within baseline', () => {
    const result = spawnSync('node', [SCRIPT, '--check'], {
      encoding: 'utf8',
      cwd: join(import.meta.dir, '..', '..'),
      timeout: 120000
    });
    expect(result.status).toBe(0);
  });
});
```

**Step 4: Add to governance:check in package.json**

---

## Verification

After all waves:
```bash
bun test                                              # Full suite green
node scripts/ci-boundary-enforce.mjs                  # Boundary check pass
node scripts/ci-warning-budget.mjs --check            # Warning budget pass
```

## Commits

- Commit 1: `feat(governance): extend boundary enforcement to all packages`
- Commit 2: `refactor(model-manager): unify snapshot schema validation`
- Commit 3: `fix(model-manager): atomic compare-and-swap for multi-process transition safety`
- Commit 4: `feat(governance): add warning budget baseline and CI enforcement`
