# Technical Debt Hardening — Six-Zone Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the highest-impact technical debt found in the codebase audit: silent crash paths, unbounded memory/disk growth, and invisible degradation across the six debt hotspots.

**Architecture:** Surgical, minimal-footprint fixes only — no refactors, no API changes, no dependency additions. Each fix is independent. Tests use the existing `node:test` framework. Run with `bun test <path>`.

**Tech Stack:** Node.js/Bun, `node:test` + `node:assert/strict`, synchronous `fs`, existing package conventions.

---

## Summary of 12 Tasks

| # | Zone | File | Issue | Risk |
|---|------|------|-------|------|
| 1 | context-governor | `src/index.js:168` | Unguarded `JSON.parse` → crash on corrupt file | HIGH |
| 2 | context-governor | `src/index.js:42,117,152` | Silent persistence failures | MED |
| 3 | context-governor | `src/index.js` + `session-tracker.js` | `saveToFile` on every `consumeTokens` call | MED |
| 4 | context-governor | `src/session-tracker.js` | Session Map grows unbounded | MED |
| 5 | learning-engine | `src/meta-awareness-tracker.js` | Read+write rollup JSON on every `trackEvent()` | HIGH |
| 6 | learning-engine | `src/meta-awareness-tracker.js` | JSONL telemetry grows unbounded | MED |
| 7 | learning-engine | `src/pattern-extractor.js:597,611,623` | Empty catches silently drop patterns | MED |
| 8 | config-loader | `src/central-config-state.js`, `src/central-config.js` | Unguarded `JSON.parse` in 9 call sites | HIGH |
| 9 | integration-layer | `src/index.js` | Silent null-on-fail imports, no startup health signal | MED |
| 10 | model-router-x | `src/model-discovery.js` | All providers fail → stale cache returned silently | MED |
| 11 | model-manager | `src/lifecycle/state-machine.js` | `transitionLocks` Map grows unbounded | LOW |
| 12 | context-governor | `src/index.js:checkBudget` | `error`/`exceeded` statuses not programmatically distinguishable | LOW |

---

## Task 1: Fix Unguarded JSON.parse in context-governor loadFromFile

**Files:**
- Modify: `packages/opencode-context-governor/src/index.js:165-170`

**Step 1: Write the failing test**

Create `packages/opencode-context-governor/test/governor-crash.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Governor } = require('../src/index');

test('loadFromFile does not throw on corrupt JSON', () => {
  const tmpPath = path.join(os.tmpdir(), `budget-corrupt-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, '{ broken json <<<', 'utf-8');
  const gov = new Governor({ persistPath: tmpPath, autoLoad: false });
  // Must not throw
  assert.doesNotThrow(() => gov.loadFromFile(tmpPath));
});

test('loadFromFile does not throw on empty file', () => {
  const tmpPath = path.join(os.tmpdir(), `budget-empty-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, '', 'utf-8');
  const gov = new Governor({ persistPath: tmpPath, autoLoad: false });
  assert.doesNotThrow(() => gov.loadFromFile(tmpPath));
});
```

**Step 2: Run test to verify it fails**

```
bun test packages/opencode-context-governor/test/governor-crash.test.js
```
Expected: FAIL — `SyntaxError: Unexpected token`

**Step 3: Fix `loadFromFile` in `packages/opencode-context-governor/src/index.js`**

Find the current `loadFromFile` method (around line 165):
```js
  loadFromFile(filePath) {
    const p = filePath || this._persistPath;
    const raw = fs.readFileSync(p, 'utf-8');
    const data = JSON.parse(raw);
    this._tracker.loadState(data);
  }
```

Replace with:
```js
  loadFromFile(filePath) {
    const p = filePath || this._persistPath;
    let raw;
    try {
      raw = fs.readFileSync(p, 'utf-8');
    } catch {
      // File missing or unreadable — no persisted state to load.
      return;
    }
    if (!raw || !raw.trim()) return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.warn(`[Governor] Corrupt budget file at ${p} — resetting (${err.message})`);
      return;
    }
    this._tracker.loadState(data);
  }
```

**Step 4: Run test to verify it passes**

```
bun test packages/opencode-context-governor/test/governor-crash.test.js
```
Expected: PASS (2 tests)

**Step 5: Commit**

```
git add packages/opencode-context-governor/src/index.js packages/opencode-context-governor/test/governor-crash.test.js
git commit -m "fix(context-governor): guard loadFromFile against corrupt JSON crash"
```

---

## Task 2: Surface Silent Persistence Failures in context-governor

**Files:**
- Modify: `packages/opencode-context-governor/src/index.js` (3 catch blocks at lines ~42, ~117, ~152)

**Step 1: No new test needed** — these are defensive `catch` blocks for persistence operations. Logging them is sufficient.

**Step 2: Update the 3 empty catch blocks**

In `constructor` (line ~42):
```js
// BEFORE
} catch {
  // No persisted state yet — that's fine.
}

// AFTER
} catch (err) {
  // No persisted state yet, or unreadable — that's fine.
  if (err.code !== 'ENOENT') {
    console.warn(`[Governor] Could not load persisted budget state: ${err.message}`);
  }
}
```

In `consumeTokens` (line ~117):
```js
// BEFORE
} catch {
  // Persistence failure is non-fatal
}

// AFTER
} catch (err) {
  console.warn(`[Governor] Budget state save failed (non-fatal): ${err.message}`);
}
```

In `resetSession` (line ~152):
```js
// BEFORE
} catch {
  // non-fatal
}

// AFTER
} catch (err) {
  console.warn(`[Governor] Budget state save after reset failed (non-fatal): ${err.message}`);
}
```

**Step 3: Run existing tests (smoke check)**

```
bun test packages/opencode-context-governor/
```
Expected: All pass

**Step 4: Commit**

```
git add packages/opencode-context-governor/src/index.js
git commit -m "fix(context-governor): log persistence failures instead of swallowing silently"
```

---

## Task 3: Debounce saveToFile on consumeTokens

**Files:**
- Modify: `packages/opencode-context-governor/src/index.js`

**Context:** `saveToFile()` is called on every `consumeTokens()` call. Under high-frequency token tracking (100s of calls/session), this creates a write-per-call pattern. A 200ms debounce reduces writes ~100x while keeping state recovery within 200ms of loss.

**Step 1: Write the failing test**

Add to `packages/opencode-context-governor/test/governor-crash.test.js`:

```js
test('consumeTokens debounces saveToFile', async () => {
  const tmpPath = path.join(os.tmpdir(), `budget-debounce-${Date.now()}.json`);
  const gov = new Governor({ persistPath: tmpPath, autoLoad: false, saveDebounceMs: 50 });
  
  let writeCount = 0;
  const orig = gov.saveToFile.bind(gov);
  gov.saveToFile = (...args) => { writeCount++; return orig(...args); };

  // 10 rapid consumeTokens calls
  for (let i = 0; i < 10; i++) {
    gov.consumeTokens('ses_test', 'anthropic/claude-opus-4-6', 100);
  }

  // Writes should not have fired yet (debounced)
  assert.ok(writeCount < 10, `Expected debounced writes, got ${writeCount}`);

  // After debounce delay, should flush once
  await new Promise(r => setTimeout(r, 100));
  assert.ok(writeCount <= 2, `Expected 1-2 writes after flush, got ${writeCount}`);
});
```

**Step 2: Run to verify it fails**

```
bun test packages/opencode-context-governor/test/governor-crash.test.js
```
Expected: FAIL

**Step 3: Add debounce to `packages/opencode-context-governor/src/index.js`**

In the `constructor`, after `this._learningEngine = ...`, add:
```js
    this._saveDebounceMs = opts.saveDebounceMs ?? 200;
    this._saveTimer = null;
```

Replace `consumeTokens` persistence section:
```js
  consumeTokens(sessionId, model, count) {
    const result = this._tracker.consumeTokens(sessionId, model, count);

    // Debounced persistence — flush at most once per saveDebounceMs
    this._scheduleSave();

    return result;
  }

  _scheduleSave() {
    if (this._saveTimer) return; // already scheduled
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try {
        this.saveToFile(this._persistPath);
      } catch (err) {
        console.warn(`[Governor] Budget state save failed (non-fatal): ${err.message}`);
      }
    }, this._saveDebounceMs);
    // Allow process to exit even if timer is pending
    if (this._saveTimer.unref) this._saveTimer.unref();
  }
```

Also remove the old try/catch save block inside `consumeTokens` (replaced by `_scheduleSave`).

**Step 4: Run test**

```
bun test packages/opencode-context-governor/test/governor-crash.test.js
```
Expected: PASS

**Step 5: Commit**

```
git add packages/opencode-context-governor/src/index.js packages/opencode-context-governor/test/governor-crash.test.js
git commit -m "fix(context-governor): debounce saveToFile to avoid per-consume disk writes"
```

---

## Task 4: Cap Session Map Growth in context-governor SessionTracker

**Files:**
- Modify: `packages/opencode-context-governor/src/session-tracker.js`

**Context:** `_sessions` is a Map with no eviction. Completed sessions are never removed. A max cap of 500 sessions (evicting oldest first) prevents unbounded growth.

**Step 1: Write the failing test**

Create `packages/opencode-context-governor/test/session-tracker-eviction.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SessionTracker } = require('../src/session-tracker');

test('SessionTracker caps sessions at maxSessions', () => {
  const tracker = new SessionTracker({ maxSessions: 5 });
  for (let i = 0; i < 10; i++) {
    tracker.consumeTokens(`ses_${i}`, 'anthropic/claude-opus-4-6', 100);
  }
  const sessions = Object.keys(tracker.getAllSessions());
  assert.ok(sessions.length <= 5, `Expected ≤5 sessions, got ${sessions.length}`);
});

test('SessionTracker evicts oldest sessions first', () => {
  const tracker = new SessionTracker({ maxSessions: 3 });
  tracker.consumeTokens('ses_old', 'anthropic/claude-opus-4-6', 100);
  tracker.consumeTokens('ses_mid', 'anthropic/claude-opus-4-6', 100);
  tracker.consumeTokens('ses_new', 'anthropic/claude-opus-4-6', 100);
  tracker.consumeTokens('ses_newest', 'anthropic/claude-opus-4-6', 100);
  // ses_old should be evicted
  const sessions = Object.keys(tracker.getAllSessions());
  assert.ok(!sessions.includes('ses_old'), 'ses_old should have been evicted');
  assert.ok(sessions.includes('ses_newest'), 'ses_newest should be present');
});
```

**Step 2: Run to verify it fails**

```
bun test packages/opencode-context-governor/test/session-tracker-eviction.test.js
```

**Step 3: Modify `packages/opencode-context-governor/src/session-tracker.js`**

Update constructor:
```js
class SessionTracker {
  constructor(opts = {}) {
    /** @type {Map<string, Map<string, number>>} sessionId -> (model -> tokensUsed) */
    this._sessions = new Map();
    this._maxSessions = opts.maxSessions ?? 500;
  }
```

In `_ensureEntry`, after `this._sessions.set(sessionId, ...)`, add eviction check:
```js
  _ensureEntry(sessionId, model) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, new Map());
      // Evict oldest session if over cap
      if (this._sessions.size > this._maxSessions) {
        const oldest = this._sessions.keys().next().value;
        this._sessions.delete(oldest);
      }
    }
    const modelMap = this._sessions.get(sessionId);
    if (!modelMap.has(model)) {
      modelMap.set(model, 0);
    }
    return modelMap.get(model);
  }
```

**Step 4: Run tests**

```
bun test packages/opencode-context-governor/test/session-tracker-eviction.test.js
bun test packages/opencode-context-governor/
```

**Step 5: Commit**

```
git add packages/opencode-context-governor/src/session-tracker.js packages/opencode-context-governor/test/session-tracker-eviction.test.js
git commit -m "fix(context-governor): cap SessionTracker map at 500 sessions to prevent unbounded growth"
```

---

## Task 5: Debounce Rollup Writes in MetaAwarenessTracker

**Files:**
- Modify: `packages/opencode-learning-engine/src/meta-awareness-tracker.js`

**Context:** `trackEvent()` currently: (1) reads the full rollup JSON from disk, (2) computes deltas, (3) writes the full rollup JSON to disk — all synchronously. This is O(n·filesize) per event. The fix: hold rollups in an in-memory cache, write to disk at most once per 500ms (debounced) or on explicit flush.

**Step 1: Write the failing test**

Add to `packages/opencode-learning-engine/test/meta-awareness.test.js` (append to existing file):

```js
test('MetaAwarenessTracker debounces rollup writes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mat-'));
  const tracker = new MetaAwarenessTracker({
    telemetryDir: dir,
    flushDebounceMs: 50,
  });
  
  let writeCount = 0;
  const orig = tracker._writeRollups.bind(tracker);
  tracker._writeRollups = (r) => { writeCount++; return orig(r); };

  for (let i = 0; i < 20; i++) {
    tracker.trackEvent({ event_type: 'orchestration.delegation_decision', metadata: { should_delegate: true, delegated: true } });
  }

  // Should not have written 20 times — debounced
  assert.ok(writeCount < 20, `Expected debounced writes, got ${writeCount}`);

  // After flush delay
  await new Promise(r => setTimeout(r, 100));
  assert.ok(writeCount <= 3, `Expected 1-3 writes after flush, got ${writeCount}`);

  fs.rmSync(dir, { recursive: true, force: true });
});
```

**Step 2: Run to verify it fails**

```
bun test packages/opencode-learning-engine/test/meta-awareness.test.js
```

**Step 3: Add in-memory rollup cache + debounced write to `meta-awareness-tracker.js`**

In `constructor`, after `this.anomalyZThreshold = ...`, add:
```js
    this._flushDebounceMs = options.flushDebounceMs ?? 500;
    this._rollupCache = null;   // in-memory rollup (null = not loaded yet)
    this._flushTimer = null;
```

Replace `_readRollups()`:
```js
  _readRollups() {
    if (this._rollupCache !== null) return this._rollupCache;
    if (!fs.existsSync(this.rollupsPath)) {
      this._rollupCache = initializeRollups();
      return this._rollupCache;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.rollupsPath, 'utf8'));
      this._rollupCache = (parsed && typeof parsed === 'object') ? parsed : initializeRollups();
    } catch {
      this._rollupCache = initializeRollups();
    }
    return this._rollupCache;
  }
```

Replace `_writeRollups(rollups)`:
```js
  _writeRollups(rollups) {
    this._rollupCache = rollups; // always update cache
    this._scheduleFlush();
  }

  _scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._flushNow();
    }, this._flushDebounceMs);
    if (this._flushTimer.unref) this._flushTimer.unref();
  }

  _flushNow() {
    if (!this._rollupCache) return;
    try {
      const tmp = `${this.rollupsPath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this._rollupCache, null, 2), 'utf8');
      fs.renameSync(tmp, this.rollupsPath);
    } catch (err) {
      console.warn(`[MetaAwarenessTracker] Failed to flush rollups: ${err.message}`);
    }
  }

  /** Force immediate flush — call before process exit if needed */
  flush() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    this._flushNow();
  }
```

Also update `getOverview()` — it calls `_writeRollups` which now just schedules a flush, so it still works correctly.

**Step 4: Run tests**

```
bun test packages/opencode-learning-engine/test/meta-awareness.test.js
```
Expected: All pass

**Step 5: Commit**

```
git add packages/opencode-learning-engine/src/meta-awareness-tracker.js packages/opencode-learning-engine/test/meta-awareness.test.js
git commit -m "fix(learning-engine): debounce MetaAwarenessTracker rollup writes, add in-memory cache"
```

---

## Task 6: Add JSONL Rotation to MetaAwarenessTracker

**Files:**
- Modify: `packages/opencode-learning-engine/src/meta-awareness-tracker.js`

**Context:** `orchestration-intel.jsonl` is append-only with no size limit. On a busy system, this grows without bound. Fix: when file exceeds `maxEventLines` (default 50,000), trim to keep the last 40,000 lines (keeping recent 80%).

**Step 1: No new test file needed** — add to existing test file.

Add to `packages/opencode-learning-engine/test/meta-awareness.test.js`:

```js
test('MetaAwarenessTracker rotates JSONL when line limit exceeded', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mat-rot-'));
  const tracker = new MetaAwarenessTracker({
    telemetryDir: dir,
    maxEventLines: 10,
    rotateKeepLines: 6,
  });

  // Write 15 events
  for (let i = 0; i < 15; i++) {
    tracker._appendEvent({ event_type: 'test', seq: i, timestamp: new Date().toISOString() });
  }

  const lines = fs.readFileSync(tracker.eventsPath, 'utf8').split('\n').filter(Boolean);
  assert.ok(lines.length <= 10, `Expected ≤10 lines after rotation, got ${lines.length}`);

  fs.rmSync(dir, { recursive: true, force: true });
});
```

**Step 2: Run to verify it fails**

```
bun test packages/opencode-learning-engine/test/meta-awareness.test.js
```

**Step 3: Update constructor and `_appendEvent` in `meta-awareness-tracker.js`**

In constructor, add:
```js
    this._maxEventLines = options.maxEventLines ?? 50000;
    this._rotateKeepLines = options.rotateKeepLines ?? 40000;
    this._appendCount = 0; // track calls since last rotation check
    this._rotationCheckInterval = 1000; // check every 1000 appends
```

Replace `_appendEvent`:
```js
  _appendEvent(event) {
    fs.appendFileSync(this.eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
    this._appendCount += 1;
    if (this._appendCount >= this._rotationCheckInterval) {
      this._appendCount = 0;
      this._maybeRotateJSONL();
    }
  }

  _maybeRotateJSONL() {
    try {
      if (!fs.existsSync(this.eventsPath)) return;
      const content = fs.readFileSync(this.eventsPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      if (lines.length <= this._maxEventLines) return;
      // Keep most recent rotateKeepLines
      const kept = lines.slice(-this._rotateKeepLines).join('\n') + '\n';
      const tmp = `${this.eventsPath}.tmp`;
      fs.writeFileSync(tmp, kept, 'utf8');
      fs.renameSync(tmp, this.eventsPath);
      console.log(`[MetaAwarenessTracker] Rotated JSONL: kept ${this._rotateKeepLines} of ${lines.length} lines`);
    } catch (err) {
      console.warn(`[MetaAwarenessTracker] JSONL rotation failed (non-fatal): ${err.message}`);
    }
  }
```

**Step 4: Run tests**

```
bun test packages/opencode-learning-engine/test/meta-awareness.test.js
```

**Step 5: Commit**

```
git add packages/opencode-learning-engine/src/meta-awareness-tracker.js packages/opencode-learning-engine/test/meta-awareness.test.js
git commit -m "fix(learning-engine): add JSONL rotation to prevent unbounded telemetry file growth"
```

---

## Task 7: Log Empty Catches in pattern-extractor.js

**Files:**
- Modify: `packages/opencode-learning-engine/src/pattern-extractor.js`

**Context:** 3 empty catches at lines ~597, ~611, ~623 silently discard pattern extraction errors, making it impossible to know when session parsing is degraded.

**Step 1: Find the 3 empty catches**

```
grep -n "} catch {" packages/opencode-learning-engine/src/pattern-extractor.js
```

Note the exact lines and surrounding context.

**Step 2: Read each catch site, understand what it wraps, add targeted warning**

Pattern to apply for each:
```js
// BEFORE
} catch {
}

// AFTER  
} catch (err) {
  // pattern extraction is best-effort; log but don't propagate
  if (process.env.DEBUG) console.warn('[PatternExtractor] parse error (skipped):', err.message);
}
```

Apply to all 3 catch blocks.

**Step 3: Run existing tests**

```
bun test packages/opencode-learning-engine/
```
Expected: All pass (no behavior change)

**Step 4: Commit**

```
git add packages/opencode-learning-engine/src/pattern-extractor.js
git commit -m "fix(learning-engine): log pattern extraction errors under DEBUG instead of silently swallowing"
```

---

## Task 8: Add safeJsonParse Helper to config-loader

**Files:**
- Create: `packages/opencode-config-loader/src/safe-json-parse.js`
- Modify: `packages/opencode-config-loader/src/central-config-state.js` (5+ call sites)
- Modify: `packages/opencode-config-loader/src/central-config.js` (2 call sites)

**Context:** 9 unguarded `JSON.parse` calls across the config loader. A `SyntaxError` from any of them crashes the startup path. Fix: extract a `safeJsonParse(src, fallback, label)` helper and use it at all call sites that read from files (not from controlled inline data).

**Step 1: Write failing test**

Create `packages/opencode-config-loader/test/safe-json-parse.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { safeJsonParse } = require('../src/safe-json-parse');

test('safeJsonParse returns parsed object on valid JSON', () => {
  assert.deepEqual(safeJsonParse('{"a":1}', null), { a: 1 });
});

test('safeJsonParse returns fallback on broken JSON', () => {
  assert.equal(safeJsonParse('{ broken <<< }', null), null);
});

test('safeJsonParse returns fallback on empty string', () => {
  assert.deepEqual(safeJsonParse('', {}), {});
});

test('safeJsonParse returns fallback on non-string input', () => {
  assert.equal(safeJsonParse(null, 'default'), 'default');
});
```

**Step 2: Run to verify it fails (module not found)**

```
bun test packages/opencode-config-loader/test/safe-json-parse.test.js
```

**Step 3: Create `packages/opencode-config-loader/src/safe-json-parse.js`**

```js
'use strict';

/**
 * Safe JSON.parse that returns a fallback instead of throwing.
 * Use for all file reads where the content may be corrupt or empty.
 *
 * @param {string} src - Raw string to parse
 * @param {*} fallback - Value to return on error
 * @param {string} [label] - Optional label for warning output
 * @returns {*} Parsed value or fallback
 */
function safeJsonParse(src, fallback, label) {
  if (typeof src !== 'string' || !src.trim()) return fallback;
  try {
    return JSON.parse(src);
  } catch (err) {
    if (label) {
      console.warn(`[safeJsonParse] Could not parse ${label}: ${err.message}`);
    }
    return fallback;
  }
}

module.exports = { safeJsonParse };
```

**Step 4: Run test to verify it passes**

```
bun test packages/opencode-config-loader/test/safe-json-parse.test.js
```

**Step 5: Apply to call sites in `central-config.js` and `central-config-state.js`**

At top of each file, add:
```js
const { safeJsonParse } = require('./safe-json-parse');
```

Replace each **file-read** `JSON.parse(content)` / `JSON.parse(fs.readFileSync(...))` call with the safe version.

Example for `central-config.js:108`:
```js
// BEFORE
config = JSON.parse(content);

// AFTER
config = safeJsonParse(content, null, 'central-config.json');
if (!config) throw new Error('central-config.json is empty or corrupt');
```

Example for `central-config-state.js:82`:
```js
// BEFORE
currentState = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// AFTER
currentState = safeJsonParse(fs.readFileSync(filePath, 'utf8'), null, filePath);
if (!currentState) { /* handle missing/corrupt */ return defaultState; }
```

Work through all 9 unguarded call sites identified. **Do NOT replace inline `JSON.parse({...})` literals — only file-read parse calls.**

**Step 6: Run all config-loader tests**

```
bun test packages/opencode-config-loader/
```
Expected: All pass

**Step 7: Commit**

```
git add packages/opencode-config-loader/src/safe-json-parse.js packages/opencode-config-loader/src/central-config.js packages/opencode-config-loader/src/central-config-state.js packages/opencode-config-loader/test/safe-json-parse.test.js
git commit -m "fix(config-loader): add safeJsonParse helper, replace unguarded JSON.parse in file-read paths"
```

---

## Task 9: Add Startup Health Log to Integration Layer

**Files:**
- Modify: `packages/opencode-integration-layer/src/index.js`

**Context:** All 9 package imports silently null on failure with no aggregated signal. The system can run fully crippled. Fix: after all imports, emit a single startup health log line listing which integrations are active vs. absent.

**Step 1: No new test** — this is an observability-only change (log output).

**Step 2: Locate the import block in `src/index.js` (lines 29-65 approx)**

After all 9 try/catch import blocks, add:

```js
// ---- Startup health report ----
const _integrationStatus = {
  logger: !!structuredLogger,
  validator: !!inputValidator,
  healthChecker: !!healthChecker,
  backupManager: !!backupManager,
  featureFlags: !!featureFlags,
  contextGovernor: !!contextGovernor,
  memoryGraph: !!memoryGraph,
};
const _active = Object.entries(_integrationStatus).filter(([, v]) => v).map(([k]) => k);
const _missing = Object.entries(_integrationStatus).filter(([, v]) => !v).map(([k]) => k);

if (_missing.length > 0) {
  console.warn(
    `[IntegrationLayer] Degraded startup: ${_missing.length}/${Object.keys(_integrationStatus).length} integrations unavailable: ${_missing.join(', ')}`
  );
} else {
  console.log(`[IntegrationLayer] All ${_active.length} integrations loaded.`);
}
```

Also export the status for programmatic health checks:
```js
// Add to module.exports at the bottom of the file:
module.exports.integrationStatus = _integrationStatus;
```

**Step 3: Run existing integration tests**

```
bun test packages/opencode-integration-layer/tests/
```
Expected: All pass

**Step 4: Commit**

```
git add packages/opencode-integration-layer/src/index.js
git commit -m "fix(integration-layer): emit startup health log and export integrationStatus for monitoring"
```

---

## Task 10: Add All-Providers-Fail Detection to Model Discovery

**Files:**
- Modify: `packages/opencode-model-router-x/src/model-discovery.js`

**Context:** When all 6 provider API calls fail, `pollOnce()` silently returns stale cache with no indication that discovery has failed. Callers receive models that may be hours out of date.

**Step 1: Read `pollOnce()` fully** (lines 73+ in model-discovery.js)

```
bun -e "const {readFileSync}=require('fs'); console.log(readFileSync('packages/opencode-model-router-x/src/model-discovery.js','utf8').slice(3000,5000))"
```

**Step 2: Find the return path in `pollOnce()`** when all providers return errors

**Step 3: Modify `pollOnce()` to track and surface total failure**

After the provider loop in `pollOnce()`, locate where results are collated. Add:

```js
  async pollOnce() {
    const results = {};
    const allNewModels = [];
    let successCount = 0;
    let errorCount = 0;

    for (const [providerId, config] of Object.entries(this.providers)) {
      try {
        const models = await this._fetchModels(providerId);
        // ... existing success handling ...
        successCount++;
      } catch (err) {
        results[providerId] = { error: err.message, models: [] };
        errorCount++;
        console.warn(`[ModelDiscovery] Provider ${providerId} failed: ${err.message}`);
      }
    }

    // ---- Circuit breaker: all providers failed ----
    const totalProviders = Object.keys(this.providers).length;
    if (errorCount === totalProviders) {
      const cacheAge = this.lastPollTime 
        ? Math.round((Date.now() - this.lastPollTime) / 1000 / 60) 
        : null;
      const ageStr = cacheAge !== null ? ` (cache age: ${cacheAge}min)` : ' (no cache)';
      console.error(`[ModelDiscovery] ALL ${totalProviders} providers failed — discovery returning stale data${ageStr}`);
      return {
        results,
        allNewModels: [],
        successCount: 0,
        errorCount,
        allProvidersFailed: true,
        staleCache: true,
      };
    }

    // ... rest of existing return ...
    return { results, allNewModels, successCount, errorCount, allProvidersFailed: false };
  }
```

**Step 4: Run any existing tests**

```
bun test packages/opencode-model-router-x/
```
Expected: All pass

**Step 5: Commit**

```
git add packages/opencode-model-router-x/src/model-discovery.js
git commit -m "fix(model-router-x): detect and surface all-providers-fail in discovery instead of silently returning stale cache"
```

---

## Task 11: Clean Up transitionLocks in StateMachine

**Files:**
- Modify: `packages/opencode-model-manager/src/lifecycle/state-machine.js`

**Context:** `this.transitionLocks = new Map()` stores a mutex Promise per `modelId` during transitions. Locks are never deleted after transition completes, so the Map grows one entry per model ever processed.

**Step 1: Find `_withModelLock` in `state-machine.js`**

```
grep -n "_withModelLock\|transitionLocks" packages/opencode-model-manager/src/lifecycle/state-machine.js
```

**Step 2: Read the `_withModelLock` implementation** (expected around line 80-120)

**Step 3: Add cleanup after lock releases**

The typical pattern:
```js
_withModelLock(modelId, fn) {
  const existing = this.transitionLocks.get(modelId) || Promise.resolve();
  const next = existing.then(() => fn()).finally(() => {
    // Clean up lock entry if this is the last queued operation
    if (this.transitionLocks.get(modelId) === next) {
      this.transitionLocks.delete(modelId);
    }
  });
  this.transitionLocks.set(modelId, next);
  return next;
}
```

Apply this pattern, preserving the existing logic.

**Step 4: Run existing model-manager tests**

```
bun test packages/opencode-model-manager/test/
```
Expected: All pass (320 tests)

**Step 5: Commit**

```
git add packages/opencode-model-manager/src/lifecycle/state-machine.js
git commit -m "fix(model-manager): clean up transitionLocks Map entries after transition completes"
```

---

## Task 12: Add Numeric Urgency Field to checkBudget Response

**Files:**
- Modify: `packages/opencode-context-governor/src/index.js`

**Context:** `checkBudget()` returns `allowed: true` at 90% usage with `status: 'error'`. Callers who only check `allowed` have no programmatic way to distinguish `ok` from `error`. Adding an `urgency: 0|1|2|3` field (0=ok, 1=warn, 2=error, 3=exceeded) makes this unambiguous without breaking the existing `status` string API.

**Step 1: No test needed** — this is an additive, non-breaking API change. Verify manually.

**Step 2: Modify `checkBudget()` return value in `packages/opencode-context-governor/src/index.js`**

```js
  checkBudget(sessionId, model, proposedTokens) {
    // ... existing logic ...

    const urgencyMap = { ok: 0, warn: 1, error: 2, exceeded: 3 };

    return {
      allowed,
      status,
      urgency: urgencyMap[status] ?? 0,
      remaining: Math.max(0, config.maxTokens - wouldUse),
      message,
    };
  }
```

**Step 3: Run all context-governor tests**

```
bun test packages/opencode-context-governor/
```

**Step 4: Commit**

```
git add packages/opencode-context-governor/src/index.js
git commit -m "feat(context-governor): add numeric urgency field to checkBudget response for programmatic budget alerting"
```

---

## Final Verification

After all 12 tasks:

```bash
# Run all affected package test suites
bun test packages/opencode-context-governor/
bun test packages/opencode-learning-engine/
bun test packages/opencode-config-loader/
bun test packages/opencode-integration-layer/tests/
bun test packages/opencode-model-router-x/
bun test packages/opencode-model-manager/test/
```

All should pass. If any fail, check the fix for that task first.

```bash
# Verify no new empty catches introduced
grep -rn "} catch {$" packages/ --include="*.js" | grep -v node_modules | grep -v ".next"
```

Count should be ≤ the original 46 (it will be less — we fixed several).
