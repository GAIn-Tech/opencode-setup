# Wave 6 Naivete Remediation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remediate 25+ systemic naivete findings from Wave 6 deep audit across resilience, memory, config, race conditions, testing, and API boundaries.

**Architecture:** Fix critical race conditions first (cascade impact), then memory bombs, then resilience gaps, then API contracts, then config system, finally test coverage.

**Tech Stack:** Bun monorepo (34 packages), TypeScript/JavaScript, SQLite, JSONL

---

## Planning Philosophy

**Cascade Impact Priority:**
1. **Wave 6A** (Foundation): Race conditions + circuit breaker (blocks other fixes)
2. **Wave 6B** (Memory): Unbounded growth fixes (prevents OOM during execution)
3. **Wave 6C** (Resilience): Timeouts + retry unification (harder to test, safer after foundation)
4. **Wave 6D** (Contracts): API fixes + config normalization (structural changes)
5. **Wave 6E** (Testing): Add smoke tests for zero-coverage packages

**DO NOT fix while changing:**
- Do NOT add tests to files being modified in same wave
- Do NOT refactor while fixing
- Do NOT change public APIs until Wave 6D

---

## Wave 6A: Race Conditions + Circuit Breaker (Highest Cascade)

### Task 1: Fix Event Store Lost Updates
**Problem:** POST reads `existing.events` before enqueueing write; stale snapshot merged → concurrent overwrites

**Files:**
- Modify: `packages/opencode-dashboard/src/app/api/orchestration/lib/event-store.js:110-180`
- Test: `packages/opencode-dashboard/test/event-store-race.test.js`

**Step 1: Read current persistEvents implementation**
```bash
cat packages/opencode-dashboard/src/app/api/orchestration/lib/event-store.js | head -200 | tail -100
```

**Step 2: Move merge inside the serialized section**
Change from:
```javascript
// Current (WRONG): merge happens outside queue
const existing = this._loadEventsSync();
const merged = [...existing.events, ...newEvents];
this._writePromise = this._writePromise.then(() => fs.writeFile(...merged));
```

To:
```javascript
// Fixed: read-merge-write inside queue
this._writePromise = this._writePromise
  .then(() => this._loadEvents())      // async read inside queue
  .then(existing => {
    const merged = [...existing.events, ...newEvents];
    return this._writeEvents(merged);  // async write
  });
```

**Step 3: Add regression test for lost updates**
Create `packages/opencode-dashboard/test/event-store-race.test.js`:
```javascript
import { test, expect } from 'bun:test';
import { EventStore } from '../src/app/api/orchestration/lib/event-store.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

test('concurrent persists do not lose events', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-store-test-'));
  const store = new EventStore({ eventsFile: path.join(tmpDir, 'events.json') });
  
  // Simulate 5 concurrent persist calls
  const promises = Array(5).fill().map((_, i) => 
    store.persistEvents([{ id: i, timestamp: Date.now() }])
  );
  
  await Promise.all(promises);
  
  // Verify all 5 events persisted
  const events = await store.loadEvents();
  expect(events).toHaveLength(5);
  
  // Cleanup
  await fs.rm(tmpDir, { recursive: true });
});
```

**Step 4: Run tests**
```bash
bun test packages/opencode-dashboard/test/event-store-race.test.js
```
Expected: 1 test, PASS

**Step 5: Run full suite**
```bash
bun test
```
Expected: All existing tests still pass

**Step 6: Commit**
```bash
git add packages/opencode-dashboard/src/app/api/orchestration/lib/event-store.js
bun run --bun packages/opencode-dashboard/test/event-store-race.test.js
git add packages/opencode-dashboard/test/event-store-race.test.js
git commit -m "fix(event-store): eliminate lost updates by moving merge inside write queue" -m "" -m "Learning-Update: event-store-race-fix" -m "Risk-Level: high"
```

---

### Task 2: Fix Tool Usage Tracker Read-Modify-Write Race
**Problem:** `_writePromise` only serializes writes, not read+mutate+write transaction

**Files:**
- Modify: `packages/opencode-learning-engine/src/tool-usage-tracker.js:270-340`
- Test: `packages/opencode-learning-engine/test/tool-usage-race.test.js`

**Step 1: Examine current implementation**
```bash
grep -n "_writePromise\|logInvocation\|readJsonAsync" packages/opencode-learning-engine/src/tool-usage-tracker.js | head -20
```

**Step 2: Queue full transaction (read+mutate+write)**
Change from:
```javascript
async logInvocation(tool, duration) {
  const data = await readJsonAsync(this.filePath);  // Read outside queue
  data.push({ tool, duration });                      // Mutate
  await this._queueWrite(data);                      // Write queued
}
```

To:
```javascript
async logInvocation(tool, duration) {
  // Queue the ENTIRE transaction
  this._writePromise = this._writePromise.then(async () => {
    const data = await readJsonAsync(this.filePath);  // Read inside queue
    data.push({ tool, duration });                     // Mutate
    await writeJsonAsync(this.filePath, data);         // Write
    return data;
  });
  return this._writePromise;
}
```

**Step 3: Add regression test**
Create `packages/opencode-learning-engine/test/tool-usage-race.test.js`:
```javascript
import { test, expect } from 'bun:test';
import { ToolUsageTracker } from '../src/tool-usage-tracker.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

test('concurrent logInvocation does not lose entries', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-usage-test-'));
  const tracker = new ToolUsageTracker({ 
    storagePath: path.join(tmpDir, 'usage.json') 
  });
  
  // Initialize empty file
  await fs.writeFile(tracker.filePath, '[]');
  
  // Simulate 10 concurrent logs
  const promises = Array(10).fill().map((_, i) =>
    tracker.logInvocation(`tool-${i}`, i * 100)
  );
  
  await Promise.all(promises);
  
  // Verify all 10 entries persisted
  const data = JSON.parse(await fs.readFile(tracker.filePath, 'utf8'));
  expect(data).toHaveLength(10);
  
  // Cleanup
  await fs.rm(tmpDir, { recursive: true });
});
```

**Step 4: Run tests**
```bash
bun test packages/opencode-learning-engine/test/tool-usage-race.test.js
```
Expected: 1 test, PASS

**Step 5: Commit**
```bash
git add packages/opencode-learning-engine/src/tool-usage-tracker.js
bun run --bun packages/opencode-learning-engine/test/tool-usage-race.test.js
git add packages/opencode-learning-engine/test/tool-usage-race.test.js
git commit -m "fix(learning-engine): queue full read-modify-write transaction" -m "" -m "Learning-Update: tool-usage-race-fix" -m "Risk-Level: high"
```

---

### Task 3: Fix Async Contract - await engine.getReport()
**Problem:** Async function called without await, Promise passed to sync normalizer

**Files:**
- Modify: `packages/opencode-dashboard/src/app/api/learning/route.ts:145`
- Test: `packages/opencode-dashboard/test/learning-route-contract.test.js`

**Step 1: Find the line**
```bash
grep -n "engine.getReport()" packages/opencode-dashboard/src/app/api/learning/route.ts
```

**Step 2: Add await**
Change:
```typescript
const report = normalizeLearningReportShape(engine.getReport());
```

To:
```typescript
const report = normalizeLearningReportShape(await engine.getReport());
```

**Step 3: Verify TypeScript compiles**
```bash
cd packages/opencode-dashboard && npx tsc --noEmit src/app/api/learning/route.ts
```

**Step 4: Run tests**
```bash
bun test packages/opencode-dashboard/test/learning-route-contract.test.js
```
Expected: PASS

**Step 5: Commit**
```bash
git add packages/opencode-dashboard/src/app/api/learning/route.ts
git commit -m "fix(dashboard): await async getReport() before normalizing" -m "" -m "Learning-Update: async-contract-fix" -m "Risk-Level: medium"
```

---

### Task 4: Wire Dormant Circuit Breaker in Discovery Engine
**Problem:** DiscoveryEngine constructs adapters with no circuitBreaker instance

**Files:**
- Modify: `packages/opencode-model-manager/src/discovery/discovery-engine.js:22`
- Modify: `packages/opencode-model-manager/src/adapters/base-adapter.js:279`
- Test: `packages/opencode-model-manager/test/discovery-circuit-breaker.test.js`

**Step 1: Check current adapter construction**
```bash
grep -n "new.*Adapter\|circuitBreaker" packages/opencode-model-manager/src/discovery/discovery-engine.js | head -20
```

**Step 2: Import circuit breaker**
Add at top of discovery-engine.js:
```javascript
import { CircuitBreaker } from '../circuit-breaker/circuit-breaker.js';
```

**Step 3: Create breaker per provider**
Change adapter construction from:
```javascript
const adapter = new AdapterClass({ name, apiKey, timeout: 30000 });
```

To:
```javascript
const circuitBreaker = new CircuitBreaker({
  name: `discovery-${name}`,
  failureThreshold: 5,
  resetTimeoutMs: 30000
});

const adapter = new AdapterClass({ 
  name, 
  apiKey, 
  timeout: 30000,
  circuitBreaker  // Now wired!
});
```

**Step 4: Verify base-adapter accepts circuitBreaker**
```bash
grep -n "circuitBreaker" packages/opencode-model-manager/src/adapters/base-adapter.js | head -10
```

**Step 5: Add regression test**
Create test verifying breaker trips after failures.

**Step 6: Run tests**
```bash
bun test packages/opencode-model-manager/test/discovery-circuit-breaker.test.js
```

**Step 7: Commit**
```bash
git add packages/opencode-model-manager/src/discovery/discovery-engine.js
bun run --bun packages/opencode-model-manager/test/discovery-circuit-breaker.test.js
git add packages/opencode-model-manager/test/discovery-circuit-breaker.test.js
git commit -m "fix(model-manager): wire circuit breaker in discovery engine" -m "" -m "Learning-Update: circuit-breaker-discovery" -m "Risk-Level: high"
```

---

## Wave 6B: Memory Management (Unbounded Growth)

### Task 5: Cap Change Event System Audit Log
**Problem:** `this.auditLog` grows indefinitely; every persist serializes full array

**Files:**
- Modify: `packages/opencode-model-manager/src/events/change-event-system.js:32`
- Test: `packages/opencode-model-manager/test/audit-log-cap.test.js`

**Step 1: Read current implementation**
```bash
grep -n "auditLog\|persist\|MAX" packages/opencode-model-manager/src/events/change-event-system.js | head -20
```

**Step 2: Add constants and cap**
Add at top of class:
```javascript
const MAX_AUDIT_EVENTS = 10000;  // Cap before rotation
const MAX_AUDIT_AGE_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days
```

**Step 3: Add rotation method**
```javascript
_maybeRotateAuditLog() {
  if (this.auditLog.length > MAX_AUDIT_EVENTS) {
    // Keep newest events
    this.auditLog = this.auditLog.slice(-MAX_AUDIT_EVENTS);
  }
  
  // Age-based cleanup
  const cutoff = Date.now() - MAX_AUDIT_AGE_MS;
  this.auditLog = this.auditLog.filter(e => e.timestamp > cutoff);
}
```

**Step 4: Call rotation before persist**
```javascript
async persist() {
  this._maybeRotateAuditLog();  // Add this line
  const data = JSON.stringify({ events: this.auditLog });
  // ... rest
}
```

**Step 5: Commit**
```bash
git add packages/opencode-model-manager/src/events/change-event-system.js
git commit -m "fix(model-manager): cap audit log at 10k events + 7 day TTL" -m "" -m "Learning-Update: audit-log-cap" -m "Risk-Level: medium"
```

---

### Task 6: Add Max-Size to Cache Layer
**Problem:** `l1Cache`/`l2Cache` have TTL but no cardinality limit

**Files:**
- Modify: `packages/opencode-model-manager/src/cache/cache-layer.js:17`
- Test: `packages/opencode-model-manager/test/cache-cap.test.js`

**Step 1: Add LRU eviction**
```javascript
const MAX_CACHE_ENTRIES = 1000;

// Add to set() method
set(key, value) {
  // Evict oldest if at capacity
  if (this.l1Cache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = this.l1Cache.keys().next().value;
    this.l1Cache.delete(firstKey);
    delete this.l2Cache[firstKey];
  }
  
  this.l1Cache.set(key, value);
  this.l2Cache[key] = value;
}
```

**Step 2: Add proactive sweep**
```javascript
_startCleanupTimer() {
  this._cleanupInterval = setInterval(() => {
    this._sweepExpired();
  }, 60000).unref();  // Every minute
}
```

**Step 3: Commit**
```bash
git add packages/opencode-model-manager/src/cache/cache-layer.js
git commit -m "fix(model-manager): add LRU eviction to cache-layer (max 1000 entries)" -m "" -m "Learning-Update: cache-lru-cap" -m "Risk-Level: medium"
```

---

### Task 7: Convert Memory Graph Bridge to Streaming
**Problem:** Reads entire JSONL synchronously

**Files:**
- Modify: `orchestrate-bridge/memory-graph-bridge.js:46`

**Step 1: Replace sync read with streaming**
Change from:
```javascript
const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n').filter(Boolean);
```

To:
```javascript
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

async function* streamLogLines(logPath) {
  const fileStream = createReadStream(logPath);
  const rl = createInterface({ input: fileStream });
  
  for await (const line of rl) {
    if (line.trim()) yield line;
  }
}
```

**Step 2: Update consumers to use async iteration**

**Step 3: Commit**
```bash
git add orchestrate-bridge/memory-graph-bridge.js
git commit -m "perf(bridge): stream JSONL instead of loading fully into memory" -m "" -m "Learning-Update: memory-graph-streaming" -m "Risk-Level: medium"
```

---

### Task 8: Kill Child Process on Timeout + Bound Buffers
**Problem:** Timeout wraps promise without killing child; unbounded stdout/stderr

**Files:**
- Modify: `packages/opencode-model-manager/src/assessment/model-assessor.js:559`

**Step 1: Add max buffer size**
```javascript
const MAX_BUFFER_SIZE = 1024 * 1024;  // 1MB
```

**Step 2: Add bounded data handler**
```javascript
let stdout = '';
child.stdout.on('data', (chunk) => {
  if (stdout.length < MAX_BUFFER_SIZE) {
    stdout += chunk.toString().slice(0, MAX_BUFFER_SIZE - stdout.length);
  }
});
```

**Step 3: Kill child on timeout**
```javascript
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => {
    child.kill('SIGTERM');  // Try graceful first
    setTimeout(() => child.kill('SIGKILL'), 5000);  // Force kill after 5s
    reject(new Error('Assessment timeout'));
  }, timeoutMs);
});
```

**Step 4: Commit**
```bash
git add packages/opencode-model-manager/src/assessment/model-assessor.js
git commit -m "fix(model-manager): kill child on timeout + bound stdout/stderr" -m "" -m "Learning-Update: child-process-timeout-fix" -m "Risk-Level: medium"
```

---

## Wave 6C: Resilience (Timeouts + Retry Unification)

### Task 9: Add Timeouts to 7 External Call Sites
**Sites:**
1. `pr-generator.js:64` (git checkout)
2. `pr-generator.js:132` (git add)
3. `pr-generator.js:135` (git commit)
4. `pr-generator.js:146` (git push)
5. `dashboard-launcher/index.js:133` (spawn)
6. `dashboard-launcher/index.js:173` (spawn)
7. `model-router-x/model-discovery.js:354` (community fetch)

**Pattern:**
```javascript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// With timeout
await execFileAsync('git', ['checkout', '-b', branch], {
  timeout: 30000,  // 30s
  cwd: repoPath
});
```

**Commit:** One commit per file, or batch by module.

---

### Task 10: Unify Retry Taxonomy
**Problem:** 4 distinct retry implementations

**Strategy:** Create shared retry helper in `opencode-safe-io`

**Files:**
- Create: `packages/opencode-safe-io/src/retry.js`
- Refactor: base-adapter, graphdb-bridge, goraphdb-bridge, subagent-retry-manager

**Step 1: Create shared retry helper**
```javascript
// packages/opencode-safe-io/src/retry.js
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 250,
    maxDelayMs = 2000,
    jitterMs = 50,
    shouldRetry = () => true
  } = options;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!shouldRetry(err) || attempt === maxAttempts) throw err;
      
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * jitterMs,
        maxDelayMs
      );
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

**Step 2: Migrate consumers**
Replace custom retry loops with `withRetry()` calls.

**Step 3: Commit**
```bash
git add packages/opencode-safe-io/src/retry.js
git commit -m "feat(safe-io): add unified retry helper with exponential backoff" -m "" -m "Learning-Update: retry-taxonomy-unified" -m "Risk-Level: medium"
```

---

## Wave 6D: API Contracts + Config

### Task 11: Fix Health Check API Mismatch
**Problem:** Integration layer calls `getHealth()`, health-check exports `getHealthStatus()`

**Files:**
- Modify: `packages/opencode-health-check/src/index.js` (add alias)

**Step 1: Add alias export**
```javascript
// Add to exports
exports.getHealth = exports.getHealthStatus;
```

**Step 2: Commit**
```bash
git add packages/opencode-health-check/src/index.js
git commit -m "fix(health-check): add getHealth alias for getHealthStatus" -m "" -m "Learning-Update: health-api-alias" -m "Risk-Level: low"
```

---

### Task 12: Add Exports Maps
**Files:**
- Modify: `packages/opencode-learning-engine/package.json`
- Modify: `packages/opencode-health-check/package.json`

**Step 1: Add exports to learning-engine**
```json
{
  "exports": {
    ".": {
      "import": "./src/index.mjs",
      "require": "./src/index.js"
    },
    "./meta-awareness": {
      "import": "./src/meta-awareness-tracker.mjs",
      "require": "./src/meta-awareness-tracker.js"
    }
  }
}
```

**Step 2: Commit**
```bash
git add packages/opencode-learning-engine/package.json packages/opencode-health-check/package.json
git commit -m "feat: add exports maps for learning-engine and health-check" -m "" -m "Learning-Update: exports-maps" -m "Risk-Level: low"
```

---

### Task 13: Normalize Config Keys
**Problem:** `plugin` vs `plugins`, `mcp` vs `mcpServers`

**Files:**
- Modify: `opencode-config/opencode.json`
- Modify: `scripts/validate-plugin-compatibility.mjs`
- Modify: `packages/opencode-runbooks/src/remedies.js`

**Step 1: Normalize to canonical keys**
- `plugin` → `plugins`
- `mcp` → `mcpServers`

**Step 2: Add backward compatibility shim**
```javascript
// In config loader
const plugins = config.plugins || config.plugin || [];
const mcpServers = config.mcpServers || config.mcp || [];
```

**Step 3: Commit**
```bash
git add opencode-config/opencode.json
bun test scripts/validate-plugin-compatibility.mjs
git commit -m "config: normalize plugin/plugins and mcp/mcpServers keys" -m "" -m "Learning-Update: config-key-normalization" -m "Risk-Level: medium"
```

---

## Wave 6E: Test Coverage

### Task 14-29: Smoke Tests for 16 Zero-Test Packages
**Packages:**
1. backup-manager
2. dashboard-launcher
3. errors
4. eval-harness
5. fallback-doctor
6. feature-flags
7. goraphdb-bridge
8. graphdb-bridge
9. logger
10. model-sync
11. plugin-healthd
12. plugin-lifecycle
13. plugin-preload-skills
14. proofcheck
15. runbooks
16. shared-orchestration

**Pattern per package:**
1. Create `packages/opencode-<name>/test/smoke.test.js`
2. Test: module imports without error
3. Test: basic functionality
4. Commit

**Example for backup-manager:**
```javascript
import { test, expect } from 'bun:test';
import { BackupManager } from '../src/index.js';

test('BackupManager can be instantiated', () => {
  const manager = new BackupManager();
  expect(manager).toBeDefined();
});

test('module exports are accessible', () => {
  expect(typeof BackupManager).toBe('function');
});
```

---

## Success Metrics

| Wave | Tasks | Deliverable | Verification |
|------|-------|-------------|--------------|
| 6A | 4 | Zero race conditions, circuit breaker active | `bun test packages/*/test/*race*.test.js` → all PASS |
| 6B | 4 | Memory capped, streaming reads | Memory usage flat under load |
| 6C | 2 | Timeouts on external calls, unified retry | `grep -c "timeout:"` → 7 matches |
| 6D | 3 | API contracts fixed, config normalized | Integration tests PASS |
| 6E | 16 | Smoke tests for all 16 zero-coverage | `find packages -name "*.test.js" | wc -l` → 86 (was 70) |

**Total Estimated Risk Points Reduced:** ~150+

---

## Execution Strategy

**Parallel Waves:**
- Wave 6A tasks 1-4: Can run in parallel (different packages)
- Wave 6B tasks 5-8: Sequential (same package, different files)
- Wave 6C tasks 9-10: After 6A/6B complete
- Wave 6D tasks 11-13: Can parallelize with 6C
- Wave 6E tasks 14-29: Embarrassingly parallel (16 packages)

**Dependencies:**
- Task 9 (timeouts) → After Task 4 (circuit breaker) for model-discovery
- Task 10 (retry unify) → After Task 2 (tool-usage-race) for transaction pattern
- Task 13 (config normalize) → Before Task 9 (timeout configs)

---

## Notes

**Metis Corrections Applied:**
- Task 2: Queue full transaction (not just write) for tool-usage-tracker
- Task 4: DiscoveryEngine breaker injection needs base-adapter verification
- Task 9: Git timeouts should use SIGTERM→SIGKILL cascade

**Guardrails (Must NOT):**
- Do NOT add caching while fixing races
- Do NOT refactor config loader structure (only normalize keys)
- Do NOT change public API signatures (only add aliases)
- Do NOT delete zero-coverage packages (add smoke tests instead)
