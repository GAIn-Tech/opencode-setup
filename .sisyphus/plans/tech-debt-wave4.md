# Tech Debt Wave 4 — Tier 1 Critical Hotspot Remediation

## TL;DR

> **Quick Summary**: Fix the 3 highest-density intersections of unresolved tech debt and performance criticality: health-check timer leak, dashboard correlation sync I/O, and tool-usage-tracker async conversion. Continues Wave 1-3 remediation pattern (72 points already resolved).
>
> **Deliverables**:
> - Health-check: Timer leak fix + cleanup API + .unref()
> - Correlation.js: Sync→async I/O conversion (event-loop unblocking)
> - Tool-usage-tracker: Full async conversion of all hot-path functions
>
> **Estimated Effort**: Medium (8-12 hours across 3 tasks)
> **Parallel Execution**: YES — 2 waves (Tasks 1+2 parallel, Task 3 sequential)
> **Critical Path**: Baseline verification → Task 1 + Task 2 (parallel) → Task 3
> **Risk Reduction**: ~70 points (Tier 1 items)

---

## Context

### Original Request
Exhaustive parallel audit (5 explore agents + direct grep/AST-grep/file reads across all 34 packages) to find areas with greatest density of unresolved technical debt AND criticality to system performance. Identified 3 Tier 1 critical items, 3 Tier 2 high items, and 4 Tier 3 low items. User chose Tier 1 only scope.

### Previous Waves (COMPLETE — 72 points resolved)
| Wave | Packages | Key Fixes | Tests |
|------|----------|-----------|-------|
| Wave 1 | config-loader, learning-engine, model-manager | Async I/O, bounded arrays, FIFO eviction | 358 pass |
| Wave 2 | context-governor, model-router-x, model-manager | Debounce verified, cache TTL+FIFO, alert bounds | 68+331+11 pass |
| Wave 3 | Integration tests | Cross-package integration verification | ~445 pass |

### Metis Review (Key Findings)
**Incorporated into plan:**
1. **tool-usage-tracker has zero external callers currently** — the module is fully implemented but not yet integrated. Fix is still warranted to prevent debt accrual and prepare for integration, but priority is reordered: health-check and correlation.js are higher immediate impact.
2. **correlation.js caller (route.ts) has 15-second result cache + in-flight dedup** — mitigates "blocks entire endpoint" severity. Cold-start cache misses still block for seconds with large datasets. Async conversion remains valuable for event-loop unblocking but pagination is NOT needed.
3. **route.ts has 10+ OTHER sync I/O calls** — explicitly OUT OF SCOPE. Only correlation.js internals modified.
4. **Race condition risk on async file writes** — plan includes write queue pattern (matches model-manager Wave 2).
5. **No pre-existing tests for any of the 3 target files** — all regression tests are new.

### Test Infrastructure
- **Framework**: bun test
- **Existing tests**: ~445 across 5+ packages (must pass before and after)
- **Strategy**: Tests-after (match Wave 1-3 pattern)
- **Agent QA**: All tasks include tool-executed verification scenarios

---

## Work Objectives

### Core Objective
Eliminate the 3 highest-scoring tech debt × performance criticality hotspots identified in the deep audit, following the proven Wave 1-3 remediation pattern.

### Concrete Deliverables
- `packages/opencode-health-check/src/index.js`: Timer leak fixed, cleanup API added
- `packages/opencode-dashboard/src/app/api/orchestration/lib/correlation.js`: Sync→async conversion
- `packages/opencode-learning-engine/src/tool-usage-tracker.js`: Full async conversion

### Definition of Done
- [x] Zero sync I/O calls (readFileSync/writeFileSync/readdirSync/statSync) remain in correlation.js
- [x] Zero sync I/O calls remain in tool-usage-tracker.js hot-path functions
- [x] Health-check intervals stored with IDs, .unref() applied, stopHealthChecks() exported
- [x] All ~445 existing tests still pass (`bun test`)
- [x] New regression tests added for each fix

### Must Have
- Event-loop unblocking in correlation data collection
- Timer cleanup capability in health-check
- Async I/O pattern in tool-usage-tracker for future integration readiness
- Write queue or promise chain for concurrent async file writes (tool-usage-tracker)

### Must NOT Have (Guardrails from Metis)
- **MUST NOT** modify `route.ts` beyond adding `await` to the `collectCorrelationData()` call site
- **MUST NOT** add caching inside `collectCorrelationData()` (route-level 15s cache already exists)
- **MUST NOT** add pagination or streaming to `collectCorrelationData()` (async conversion only)
- **MUST NOT** change `module.exports` shape of any modified file
- **MUST NOT** change return value shapes (backward compatibility)
- **MUST NOT** fix `getSchedulerTelemetry` in health-check (pre-existing unrelated issue)
- **MUST NOT** fix `trackEvent` fire-and-forget calls in `learning-engine/src/index.js` (out of scope)
- **MUST NOT** convert sync I/O in route.ts `readJson`/`countSkillUniverse`/`fileContains`/`countPluginDirectories` (out of scope)
- **MUST NOT** touch `AVAILABLE_TOOLS` or `TOOL_APPROPRIATENESS_RULES` constants in tool-usage-tracker

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> Every criterion is verified by running a command or using a tool.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (match Wave 1-3 pattern)
- **Framework**: bun test

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

Every task includes concrete QA scenarios that the executing agent runs directly via Bash commands. The agent performs what a human tester would, but automated.

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Async I/O conversion** | Bash (grep/ast_grep_search) | Verify zero sync fs calls remain |
| **Timer management** | Bash (node -e) | Import module, verify cleanup works |
| **Test suite** | Bash (bun test) | Run full suite, assert 0 failures |
| **API contract** | Bash (node -e) | Import function, verify return type is Promise |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Prerequisite — Must Complete First):
└── Task 0: Baseline verification (bun test → all pass)

Wave 1 (After Wave 0):
├── Task 1: health-check timer leak fix [no dependencies]
└── Task 2: correlation.js async conversion [no dependencies]

Wave 2 (After Wave 1):
└── Task 3: tool-usage-tracker async conversion [no dependencies, but benefits from Wave 1 patterns]

Critical Path: Task 0 → Tasks 1+2 (parallel) → Task 3
Parallel Speedup: ~30% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 0 | None | 1, 2, 3 | None (prerequisite) |
| 1 | 0 | None | 2 |
| 2 | 0 | None | 1 |
| 3 | 0 | None | Could parallelize with 1+2, but sequenced for pattern reuse |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 0 | Baseline | task(category="quick", load_skills=[], ...) |
| 1 | 1, 2 | task(category="unspecified-low", load_skills=["systematic-debugging"], ...) dispatched in parallel |
| 2 | 3 | task(category="unspecified-high", load_skills=["systematic-debugging"], ...) |

---

## TODOs

### Task 0: Baseline Verification (Prerequisite)

- [x] 0. Run full test suite and establish baseline

  **What to do**:
  - Run `bun test` across the entire monorepo
  - Record exact test count (expected: ~445 tests, 0 failures)
  - If any tests fail, STOP and report — do not proceed with Wave 4 fixes on a broken baseline

  **Must NOT do**:
  - Do not fix pre-existing test failures — only report them
  - Do not modify any code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command verification, no code changes
  - **Skills**: none needed
  
  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 0 (prerequisite)
  - **Blocks**: Tasks 1, 2, 3
  - **Blocked By**: None

  **References**:
  - `.sisyphus/plans/tech-debt-fix.md` — Previous plan's test verification pattern

  **Acceptance Criteria**:
  - [ ] `bun test` completes successfully
  - [ ] All ~445 tests pass, 0 failures
  - [ ] Test count recorded as baseline for post-fix comparison

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: Repository at C:\Users\jack\work\opencode-setup
    Steps:
      1. Run: bun test
      2. Wait for completion (timeout: 120s)
      3. Assert: exit code 0
      4. Assert: output contains "0 fail" or equivalent pass indicator
      5. Record: total test count from output
    Expected Result: All tests pass
    Failure Indicators: Non-zero exit code, "fail" in output
    Evidence: Terminal output captured
  ```

  **Commit**: NO

---

### Task 1: Fix health-check Timer Leak + Add Cleanup API

- [x] 1. Fix `startHealthChecks()` timer leak and add `stopHealthChecks()`

  **What to do**:
  1. **Store interval IDs**: Create a module-level `Map` or `Array` to store interval IDs returned by `setInterval()`. Natural location: store on the `subsystemHealth` Map entries alongside existing health data.
  2. **Add `.unref()`**: Call `.unref()` on each interval so timers don't prevent process exit.
  3. **Add `_running` guard**: Prevent `startHealthChecks()` from being called multiple times (would double timers). If already running, clear existing timers first before restarting.
  4. **Implement `stopHealthChecks()`**: New exported function that calls `clearInterval()` on all stored IDs and resets the `_running` flag.
  5. **Handle edge case**: `stopHealthChecks()` called before `startHealthChecks()` should be a safe no-op.
  6. **Export**: Add `stopHealthChecks` to the module's exports.
  7. **Add regression tests**: Create `packages/opencode-health-check/test/timer-management.test.js` with tests for:
     - Timer IDs are stored after `startHealthChecks()`
     - `.unref()` is called on intervals
     - `stopHealthChecks()` clears all intervals
     - Double-start doesn't double timers
     - `stopHealthChecks()` before `startHealthChecks()` is safe no-op
  8. **Run full test suite**: `bun test` must pass with 0 failures

  **Must NOT do**:
  - Do not modify `checkSubsystem()`, `getHealthStatus()`, or endpoint handlers
  - Do not add `getSchedulerTelemetry` (pre-existing unrelated broken import in perf script)
  - Do not change the health check logic or intervals themselves
  - Do not make `startHealthChecks` async (it's fire-and-forget by design)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Scoped fix to one file, clear pattern, low architectural risk
  - **Skills**: [`systematic-debugging`]
    - `systematic-debugging`: Needed to verify timer behavior and edge cases

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: None
  - **Blocked By**: Task 0 (baseline)

  **References**:

  **Pattern References** (existing code to follow):
  - `packages/opencode-model-manager/src/monitoring/metrics-collector.js:477-481` — Correct setInterval + .unref() pattern: store ID, check for .unref existence, call it
  - `packages/opencode-crash-guard/src/crash-recovery.js:40-44` — setInterval stored in `this.saveInterval` with clearInterval in cleanup
  - `packages/opencode-context-governor/src/index.js:132-141` — setTimeout with .unref() and guard flag pattern

  **Target File** (the file to modify):
  - `packages/opencode-health-check/src/index.js:120-130` — `startHealthChecks()` function: line 126 has the leaking `setInterval` without ID storage

  **Test References**:
  - `packages/opencode-context-governor/test/debounce-regression.test.js` — Wave 2 regression test pattern for timer behavior verification

  **Acceptance Criteria**:

  - [ ] Interval IDs stored: `grep -c '_intervals\|_timers\|intervalId' packages/opencode-health-check/src/index.js` → output ≥ 1
  - [ ] `.unref()` applied: `grep -c '\.unref()' packages/opencode-health-check/src/index.js` → output ≥ 1
  - [ ] `stopHealthChecks` exported: `grep 'stopHealthChecks' packages/opencode-health-check/src/index.js` → match found
  - [ ] `clearInterval` used in stop: `grep 'clearInterval' packages/opencode-health-check/src/index.js` → match found
  - [ ] Double-start guard exists: `grep '_running\|_started' packages/opencode-health-check/src/index.js` → match found
  - [ ] Regression tests pass: `bun test packages/opencode-health-check/` → all pass
  - [ ] Full suite passes: `bun test` → ~445+ tests, 0 failures

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Timer IDs stored and clearable
    Tool: Bash (node -e)
    Preconditions: health-check module importable
    Steps:
      1. node -e "
         const hc = await import('./packages/opencode-health-check/src/index.js');
         hc.registerSubsystem('test-sub', async () => ({ healthy: true }), { checkInterval: 60000 });
         hc.startHealthChecks();
         console.log('started');
         hc.stopHealthChecks();
         console.log('stopped');
         process.exit(0);
         "
      2. Assert: Output contains 'started' then 'stopped'
      3. Assert: Process exits cleanly (code 0) — proves .unref() works OR stop cleaned up
    Expected Result: Clean start/stop cycle with no hanging process
    Evidence: Terminal output captured

  Scenario: Double-start does not double timers
    Tool: Bash (node -e)
    Preconditions: Module importable
    Steps:
      1. node -e "
         const hc = await import('./packages/opencode-health-check/src/index.js');
         hc.registerSubsystem('test-sub', async () => ({ healthy: true }), { checkInterval: 60000 });
         hc.startHealthChecks();
         hc.startHealthChecks();
         hc.stopHealthChecks();
         process.exit(0);
         "
      2. Assert: Process exits cleanly (no leaked timers)
    Expected Result: Second start replaces first, stop cleans all
    Evidence: Terminal output captured

  Scenario: Zero leaked setInterval calls remain
    Tool: Bash (grep)
    Preconditions: Fix applied
    Steps:
      1. grep -n 'setInterval' packages/opencode-health-check/src/index.js
      2. For each match, verify the return value is assigned to a variable
      3. Verify no bare 'setInterval(' without assignment
    Expected Result: All setInterval return values captured
    Evidence: grep output captured
  ```

  **Evidence to Capture:**
  - [ ] grep output showing timer ID storage
  - [ ] Test results from `bun test packages/opencode-health-check/`
  - [ ] Full suite results from `bun test`

  **Commit**: YES
  - Message: `fix(health-check): store interval IDs, add stopHealthChecks, prevent timer leak`
  - Files: `packages/opencode-health-check/src/index.js`, `packages/opencode-health-check/test/timer-management.test.js`
  - Pre-commit: `bun test`
  - Trailers: `Learning-Update: health-check-timer-leak-fixed`, `Risk-Level: low`

---

### Task 2: Convert correlation.js to Async I/O

- [x] 2. Convert `collectCorrelationData()` from sync to async file I/O

  **What to do**:
  1. **Make `readJson` helper async**: Convert the local `readJson()` function (lines 17-24) to use `fs.promises.readFile` instead of `fs.readFileSync`. Keep the try/catch fallback pattern.
  2. **Make `collectCorrelationData` async**: Add `async` keyword. Replace all sync fs calls:
     - `fs.existsSync(messagesPath)` → `await fsPromises.access(messagesPath).then(() => true).catch(() => false)` or stat-based check
     - `fs.readdirSync(messagesPath)` → `await fsPromises.readdir(messagesPath)`
     - `fs.statSync(...)` → `await fsPromises.stat(...)`
     - `fs.readdirSync(path.join(messagesPath, sessionId))` → `await fsPromises.readdir(...)`
     - `fs.readFileSync(...)` → `await fsPromises.readFile(...)`
  3. **Import fs/promises**: Add `import fsPromises from 'fs/promises';` at the top.
  4. **Preserve error handling**: Keep the `try { ... } catch { // ignore malformed records }` pattern in the inner loop. Maintain the silent-skip behavior for malformed JSON files.
  5. **Preserve return shape**: The returned object structure MUST NOT change. Same keys, same types.
  6. **Update call site**: In `packages/opencode-dashboard/src/app/api/orchestration/route.ts`, add `await` before the `collectCorrelationData()` call (it's already inside an async function `computePayload()`).
  7. **Integration test**: Run existing `integration-tests/orchestration-lib-extraction.test.js` to verify route still works.
  8. **Add regression tests**: Create `packages/opencode-dashboard/tests/correlation-async.test.js` with tests for:
     - Returns valid data structure with async I/O
     - Handles missing messagesPath gracefully
     - Handles malformed JSON files (skips without crash)
     - Returns empty data for empty directory
  9. **Verify zero sync calls remain**: `grep -c 'readFileSync\|readdirSync\|statSync\|existsSync' correlation.js` → 0
  10. **Run full test suite**: `bun test` must pass

  **Must NOT do**:
  - Do not modify `route.ts` beyond adding `await` to the `collectCorrelationData()` call
  - Do not add caching inside `collectCorrelationData()` — route.ts already has 15-second cache + in-flight deduplication
  - Do not add pagination or streaming — async conversion is sufficient
  - Do not fix sync I/O in route.ts's own `readJson`, `countSkillUniverse`, `fileContains`, `countPluginDirectories` (out of scope)
  - Do not change the function signature (same parameters: `{ messagesPath, customEventsPath, cutoffMs }`)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Single-file async conversion with clear pattern established in Wave 1
  - **Skills**: [`systematic-debugging`]
    - `systematic-debugging`: Needed to verify async behavior and handle edge cases in file I/O

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: None
  - **Blocked By**: Task 0 (baseline)

  **References**:

  **Pattern References** (existing code to follow):
  - `packages/opencode-config-loader/src/index.js` — Wave 1 async conversion pattern: `fs.readFileSync` → `await fs.promises.readFile`
  - `packages/opencode-learning-engine/src/meta-awareness-tracker.js:279-360` — Wave 1 fully async tracker: `await fs.promises.readFile`, `await fs.promises.writeFile`, `await fs.promises.rename`
  - `packages/opencode-model-router-x/src/model-discovery.js:138-148` — Wave 2 parallel async pattern with `Promise.all`

  **Target Files** (files to modify):
  - `packages/opencode-dashboard/src/app/api/orchestration/lib/correlation.js` — Primary: entire `collectCorrelationData()` function (lines 26-192)
  - `packages/opencode-dashboard/src/app/api/orchestration/route.ts` — Secondary: add `await` at `collectCorrelationData()` call site only

  **Existing Call Site Context**:
  - `route.ts` lines 16-18: `orchestrationCache` (Map) + `orchestrationInFlight` (Map) = 15s TTL cache with in-flight deduplication. The `collectCorrelationData()` call is inside `async computePayload()` so `await` is natural.

  **Test References**:
  - `integration-tests/orchestration-lib-extraction.test.js` — Existing integration test for the orchestration route (must still pass)

  **Acceptance Criteria**:

  - [ ] Zero sync fs calls: `grep -c 'readFileSync\|readdirSync\|statSync\|existsSync' packages/opencode-dashboard/src/app/api/orchestration/lib/correlation.js` → output is 0
  - [ ] Function is async: `grep 'export async function collectCorrelationData' packages/opencode-dashboard/src/app/api/orchestration/lib/correlation.js` → match found
  - [ ] Call site updated: `grep 'await collectCorrelationData\|await.*collectCorrelationData' packages/opencode-dashboard/src/app/api/orchestration/route.ts` → match found
  - [ ] fs/promises imported: `grep "fs/promises\|fs\.promises" packages/opencode-dashboard/src/app/api/orchestration/lib/correlation.js` → match found
  - [ ] Integration test passes: `bun test integration-tests/orchestration-lib-extraction.test.js` → pass
  - [ ] Regression tests pass: `bun test packages/opencode-dashboard/tests/correlation-async.test.js` → pass
  - [ ] Full suite passes: `bun test` → ~445+ tests, 0 failures

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: collectCorrelationData returns valid data structure
    Tool: Bash (node -e)
    Preconditions: Dashboard package importable
    Steps:
      1. node -e "
         const { collectCorrelationData } = await import('./packages/opencode-dashboard/src/app/api/orchestration/lib/correlation.js');
         const result = collectCorrelationData({ messagesPath: '/nonexistent', customEventsPath: '/nonexistent', cutoffMs: 0 });
         console.log(result instanceof Promise ? 'IS_PROMISE' : 'NOT_PROMISE');
         const data = await result;
         console.log('sessions:', data.sessions instanceof Set);
         console.log('model:', data.model instanceof Map);
         console.log('totalMessages:', typeof data.totalMessages);
         "
      2. Assert: Output contains 'IS_PROMISE' (confirms async)
      3. Assert: Output contains 'sessions: true', 'model: true', 'totalMessages: number'
    Expected Result: Function returns Promise resolving to correct shape
    Evidence: Terminal output captured

  Scenario: Zero sync fs calls remain
    Tool: Bash (grep)
    Preconditions: Fix applied
    Steps:
      1. grep -n 'readFileSync\|readdirSync\|statSync\|existsSync' packages/opencode-dashboard/src/app/api/orchestration/lib/correlation.js
      2. Assert: No matches (exit code 1 from grep = no matches)
    Expected Result: Zero sync fs calls in file
    Evidence: grep output (empty = pass)

  Scenario: Malformed JSON files are silently skipped
    Tool: Bash (node -e)
    Preconditions: Temp directory with one valid and one malformed JSON file
    Steps:
      1. Create temp dir with test session containing valid.json and broken.json
      2. Call collectCorrelationData with temp messagesPath
      3. Assert: No error thrown, valid.json data included, broken.json skipped
    Expected Result: Graceful handling of malformed files
    Evidence: Terminal output captured
  ```

  **Evidence to Capture:**
  - [ ] grep output showing zero sync calls
  - [ ] Test results from correlation-async regression tests
  - [ ] Full suite results from `bun test`

  **Commit**: YES
  - Message: `perf(dashboard): convert collectCorrelationData to async I/O`
  - Files: `packages/opencode-dashboard/src/app/api/orchestration/lib/correlation.js`, `packages/opencode-dashboard/src/app/api/orchestration/route.ts`, `packages/opencode-dashboard/tests/correlation-async.test.js`
  - Pre-commit: `bun test`
  - Trailers: `Learning-Update: correlation-async-conversion`, `Risk-Level: low`

---

### Task 3: Convert tool-usage-tracker.js to Async I/O

- [x] 3. Full async conversion of tool-usage-tracker.js hot-path functions

  **What to do**:

  **Phase A — Create async infrastructure:**
  1. **Create `writeJsonAsync()`**: Async equivalent of `writeJson()` using `await fsPromises.writeFile()` for tmp + `await fsPromises.rename()` for atomic swap. Place alongside existing `readJsonAsync()` (line 180).
  2. **Create `initAsync()`**: Async version of `init()` using `await fsPromises.mkdir()` and `await fsPromises.access()` for existence checks. Add `_initPromise` singleton pattern to prevent race conditions when multiple functions call `initAsync()` concurrently.
  3. **Add write queue**: Implement a simple `_writePromise` chain pattern (promise chain, not actual queue) to serialize concurrent writes to the same file. This prevents read-modify-write race conditions. Follow model-manager's `audit-logger.js` pattern.

  **Phase B — Convert all hot-path functions to async:**
  4. **`logInvocation()` → `async logInvocation()`**: Replace `readJson()` → `await readJsonAsync()`, `writeJson()` → `await writeJsonAsync()`. Chain writes through write queue. Handle `metaAwarenessTracker.trackEvent()` with `.catch()` (fire-and-forget, matches current implicit behavior).
  5. **`updateMetrics()` → `async updateMetrics()`**: Replace sync reads/writes. Called from `logInvocation()` — `await` it.
  6. **`calculateAppropriatenessScore()` → `async calculateAppropriatenessScore()`**: Replace `readJson(INVOCATIONS_FILE)` → `await readJsonAsync(INVOCATIONS_FILE)`. Called from `updateMetrics()` — `await` it.
  7. **`detectUnderUse()` → `async detectUnderUse()`**: Replace sync reads/writes. Handle trackEvent with `.catch()`.
  8. **`getUsageReport()` → `async getUsageReport()`**: Replace `init()` → `await initAsync()`, sync reads → async reads. `detectUnderUse()` call → `await detectUnderUse()`.
  9. **`startSession()` → `async startSession()`**: Replace init/reads/writes. Handle trackEvent with `.catch()`.
  10. **`endSession()` → `async endSession()`**: Replace reads/writes. Handle trackEvent with `.catch()`.

  **Phase C — Keep sync versions for initialization fallback:**
  11. **Keep `readJson()` (sync)**: Retain the sync version (lines 169-175) but rename to `readJsonSync()` for clarity. Used only by `init()` for backward compatibility if any caller doesn't await.
  12. **Keep `writeJson()` (sync)**: Retain as `writeJsonSync()`. Used only by `init()`.
  13. **Keep `init()` (sync)**: Retain as fallback but mark with JSDoc `@deprecated — use initAsync()`.

  **Phase D — Tests and verification:**
  14. **Create regression tests**: `packages/opencode-learning-engine/test/tool-usage-tracker.test.js`:
      - All exported functions return Promises
      - logInvocation writes data asynchronously (file appears after await)
      - Concurrent logInvocations don't corrupt data (write queue works)
      - updateMetrics increments counters correctly
      - getUsageReport returns valid structure
      - startSession/endSession lifecycle works
      - initAsync is idempotent (called multiple times safely)
  15. **Verify zero sync calls on hot paths**: Only `readJsonSync`/`writeJsonSync`/`init` (deprecated) should have sync I/O.
  16. **Run full test suite**: `bun test` must pass

  **Must NOT do**:
  - Do not change `module.exports` shape — same function names exported (now async but same names)
  - Do not touch `AVAILABLE_TOOLS` or `TOOL_APPROPRIATENESS_RULES` constants
  - Do not modify `metaAwarenessTracker.trackEvent()` itself (only how it's called)
  - Do not fix trackEvent calls in `learning-engine/src/index.js` (out of scope)
  - Do not remove the sync `init()` entirely (keep as deprecated fallback)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Largest task — full file conversion with 8 functions, write queue pattern, concurrency handling, comprehensive test suite
  - **Skills**: [`systematic-debugging`]
    - `systematic-debugging`: Critical for verifying async behavior, race condition handling, and write queue correctness

  **Parallelization**:
  - **Can Run In Parallel**: YES (no file dependencies with Tasks 1-2)
  - **Parallel Group**: Wave 2 (after Tasks 1+2, for pattern reuse benefit)
  - **Blocks**: None
  - **Blocked By**: Task 0 (baseline)

  **References**:

  **Pattern References** (existing code to follow):
  - `packages/opencode-learning-engine/src/meta-awareness-tracker.js:279-360` — The gold standard reference: fully async tracker from Wave 1. Shows `await fs.promises.readFile`, `await fs.promises.writeFile`, `await fs.promises.rename` (atomic write), `_flushTimer` with `.unref()`, and debounced write pattern.
  - `packages/opencode-model-manager/src/lifecycle/audit-logger.js` — Wave 2 write queue pattern: `_pendingWrites` counter, backpressure rejection, `.finally()` decrement. Use this pattern for serializing concurrent writes.
  - `packages/opencode-config-loader/src/index.js` — Wave 1 async conversion: `fs.readFileSync` → `await fs.promises.readFile` pattern.

  **Target File** (the file to modify):
  - `packages/opencode-learning-engine/src/tool-usage-tracker.js` — Entire file (590 lines). Key functions: `init()` (line 135), `writeJson()` (line 160), `readJson()` (line 169), `readJsonAsync()` (line 180), `logInvocation()` (line 192), `updateMetrics()` (line 261), `calculateAppropriatenessScore()` (line 281), `detectUnderUse()` (line 314), `getUsageReport()` (line 432), `startSession()` (line 505), `endSession()` (line 541).

  **API Contract Reference** (return shapes to preserve):
  - `logInvocation()` returns `invocation` object: `{ timestamp, tool, category, priority, params, success, context }`
  - `getUsageReport()` returns `{ summary, toolUsage, categoryBreakdown, unusedTools, recentUnderUse, recommendations }`
  - `startSession()` returns `session` object: `{ id, startTime, context, toolsUsed, underUseEvents }`
  - `endSession()` returns `session` object with added `endTime`, `duration`, `finalMetrics`

  **Edge Case References** (from Metis review):
  - Concurrent async writes race condition → write queue pattern (E1)
  - Async init race → `_initPromise` singleton pattern (E2)
  - `metaAwarenessTracker.trackEvent()` is async but currently called without await → add `.catch()` for explicit fire-and-forget (E8)

  **Acceptance Criteria**:

  - [ ] All exported functions return Promises: `node -e "const t = require('./packages/opencode-learning-engine/src/tool-usage-tracker'); console.log(t.logInvocation('test', {}, {}) instanceof Promise)"` → `true`
  - [ ] Zero sync fs on hot paths: `grep -n 'readFileSync\|writeFileSync\|renameSync' packages/opencode-learning-engine/src/tool-usage-tracker.js | grep -v 'readJsonSync\|writeJsonSync\|@deprecated' | wc -l` → 0 (only deprecated wrappers)
  - [ ] readJsonAsync used: `grep -c 'readJsonAsync' packages/opencode-learning-engine/src/tool-usage-tracker.js` → ≥ 7
  - [ ] writeJsonAsync exists: `grep -c 'writeJsonAsync' packages/opencode-learning-engine/src/tool-usage-tracker.js` → ≥ 1
  - [ ] Write queue implemented: `grep -c '_writePromise\|_pendingWrite\|writeQueue' packages/opencode-learning-engine/src/tool-usage-tracker.js` → ≥ 1
  - [ ] trackEvent handled: `grep -c 'trackEvent.*\.catch\|await.*trackEvent' packages/opencode-learning-engine/src/tool-usage-tracker.js` → 4
  - [ ] initAsync idempotent: `grep -c '_initPromise\|_initialized' packages/opencode-learning-engine/src/tool-usage-tracker.js` → ≥ 1
  - [ ] Regression tests pass: `bun test packages/opencode-learning-engine/test/tool-usage-tracker.test.js` → all pass
  - [ ] Full suite passes: `bun test` → ~445+ tests, 0 failures

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: logInvocation returns Promise and writes data
    Tool: Bash (node -e)
    Preconditions: Module importable, DATA_DIR writable
    Steps:
      1. node -e "
         const t = require('./packages/opencode-learning-engine/src/tool-usage-tracker');
         const result = t.logInvocation('test_tool', { key: 'val' }, { success: true }, { session: 'test-sess' });
         console.log('isPromise:', result instanceof Promise);
         result.then(inv => {
           console.log('tool:', inv.tool);
           console.log('success:', inv.success);
           process.exit(0);
         }).catch(e => { console.error(e); process.exit(1); });
         "
      2. Assert: Output contains 'isPromise: true'
      3. Assert: Output contains 'tool: test_tool' and 'success: true'
    Expected Result: Async logInvocation resolves with invocation object
    Evidence: Terminal output captured

  Scenario: Concurrent logInvocations don't corrupt data
    Tool: Bash (node -e)
    Preconditions: Module importable
    Steps:
      1. node -e "
         const t = require('./packages/opencode-learning-engine/src/tool-usage-tracker');
         const promises = [];
         for (let i = 0; i < 10; i++) {
           promises.push(t.logInvocation('tool_' + i, {}, {}, { session: 'concurrent-test' }));
         }
         Promise.all(promises).then(results => {
           console.log('all_resolved:', results.length);
           console.log('all_valid:', results.every(r => r && r.tool));
           process.exit(0);
         }).catch(e => { console.error(e); process.exit(1); });
         "
      2. Assert: Output contains 'all_resolved: 10'
      3. Assert: Output contains 'all_valid: true'
    Expected Result: 10 concurrent writes all succeed without corruption
    Evidence: Terminal output captured

  Scenario: Zero sync fs calls on hot paths
    Tool: Bash (grep)
    Preconditions: Fix applied
    Steps:
      1. grep -n 'fs\.readFileSync\|fs\.writeFileSync\|fs\.renameSync' packages/opencode-learning-engine/src/tool-usage-tracker.js
      2. For each match, verify it's inside a function named readJsonSync/writeJsonSync or has @deprecated comment
      3. Assert: No matches outside deprecated wrapper functions
    Expected Result: All hot paths use async I/O
    Evidence: grep output captured

  Scenario: getUsageReport returns valid structure
    Tool: Bash (node -e)
    Preconditions: Module importable
    Steps:
      1. node -e "
         const t = require('./packages/opencode-learning-engine/src/tool-usage-tracker');
         t.getUsageReport().then(report => {
           console.log('has_summary:', 'summary' in report);
           console.log('has_toolUsage:', 'toolUsage' in report);
           console.log('has_recommendations:', 'recommendations' in report);
           process.exit(0);
         }).catch(e => { console.error(e); process.exit(1); });
         "
      2. Assert: All 'has_*' checks are true
    Expected Result: Report structure unchanged after async conversion
    Evidence: Terminal output captured
  ```

  **Evidence to Capture:**
  - [ ] grep output showing zero sync calls on hot paths
  - [ ] Test results from `bun test packages/opencode-learning-engine/test/tool-usage-tracker.test.js`
  - [ ] Full suite results from `bun test`

  **Commit**: YES
  - Message: `perf(learning-engine): convert tool-usage-tracker to async I/O with write queue`
  - Files: `packages/opencode-learning-engine/src/tool-usage-tracker.js`, `packages/opencode-learning-engine/test/tool-usage-tracker.test.js`
  - Pre-commit: `bun test`
  - Trailers: `Learning-Update: tool-usage-tracker-async-conversion`, `Risk-Level: medium`

---

## Commit Strategy

| After Task | Message | Key Files | Verification |
|------------|---------|-----------|--------------|
| 1 | `fix(health-check): store interval IDs, add stopHealthChecks, prevent timer leak` | health-check/src/index.js | `bun test` |
| 2 | `perf(dashboard): convert collectCorrelationData to async I/O` | correlation.js, route.ts | `bun test` |
| 3 | `perf(learning-engine): convert tool-usage-tracker to async I/O with write queue` | tool-usage-tracker.js | `bun test` |

All commits use Wave 1-3 trailer format: `Learning-Update:` + `Risk-Level:`.

---

## Success Criteria

### Verification Commands
```bash
# 1. All tests pass
bun test
# Expected: ~450+ tests (baseline + new regression tests), 0 failures

# 2. Zero sync I/O in correlation.js
grep -c 'readFileSync\|readdirSync\|statSync\|existsSync' packages/opencode-dashboard/src/app/api/orchestration/lib/correlation.js
# Expected: 0

# 3. Zero sync I/O on hot paths in tool-usage-tracker.js
grep -n 'fs\.readFileSync\|fs\.writeFileSync\|fs\.renameSync' packages/opencode-learning-engine/src/tool-usage-tracker.js | grep -v Sync\(\) | wc -l
# Expected: 0 (outside deprecated wrappers)

# 4. Health-check has cleanup
grep -c 'stopHealthChecks\|clearInterval\|\.unref()' packages/opencode-health-check/src/index.js
# Expected: ≥ 3
```

### Final Checklist
- [ ] All "Must Have" present (event-loop unblocking, timer cleanup, write queue)
- [ ] All "Must NOT Have" absent (no scope creep into route.ts, no caching in correlation, no pagination)
- [ ] All existing tests pass (baseline preserved)
- [ ] New regression tests added for each task
- [ ] All QA scenarios executed with evidence captured
- [ ] Commits follow Wave 1-3 pattern with Learning-Update trailers
