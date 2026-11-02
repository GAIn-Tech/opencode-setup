# Technical Debt Fix Plan - Multi-Package Resolution

## TL;DR

> **Quick Summary**: Fix critical technical debt across 5 packages: config-loader, context-governor, learning-engine, model-manager, and model-router-x. Focus on sync I/O blocking, unbounded collections, and unguarded JSON parsing.

> **Deliverables**:
> - Config loader: Async I/O + caching + guarded JSON.parse
> - Context governor: Verified debounce + sync I/O elimination
> - Learning engine: Async trackEvent() + JSONL rotation
> - Model manager: Bounded arrays + alert history cap
> - Model router: Optimized JSON.parse loop + cache TTL

> **Estimated Effort**: XL (40+ tasks across 5 packages)
> **Parallel Execution**: YES - 3 waves based on package dependencies
> **Critical Path**: config-loader (Zone 1) → learning-engine (Zone 2) → model-manager (Zone 3)

---

## Context

### Original Request
User requested comprehensive audit of technical debt density × system criticality. Audit identified 7 critical zones across 5 packages with ~28 distinct issues. Many already partially fixed via prior sessions.

### Audit Summary (from SUPERMEMORY)
| Rank | Package | Primary Issues | Risk Score |
|------|---------|----------------|------------|
| 1 | config-loader | sync I/O + unguarded JSON.parse | 28 |
| 2 | context-governor | sync saveToFile 1000×/session | 24 |
| 3 | learning-engine | sync trackEvent() I/O | 22 |
| 4 | model-manager | 4 unbounded event arrays | 22 |
| 5 | model-router-x | JSON.parse loop | 18 |

### Test Infrastructure
- **Framework**: bun test (Node.js test runner)
- **Test files**: 16+ across packages
- **Strategy**: Tests-after (fix first, then verify with existing tests + new regression tests)
- **Agent QA**: All tasks include Playwright/curl verification scenarios

---

## Work Objectives

### Core Objective
Reduce production risk by fixing high-scoring technical debt issues across 5 core packages. Each fix must include regression tests and Agent-Executed QA scenarios.

### Concrete Deliverables
- Async file I/O with proper error handling in config-loader
- Debounce verification in context-governor (ensure 200ms debounce works)
- Async event tracking in learning-engine (no sync I/O in hot path)
- Bounded collections in model-manager metrics (FIFO eviction)
- JSON.parse optimization in model-router-x discovery

### Definition of Done
- [ ] All sync I/O in hot paths replaced with async
- [ ] All unbounded collections have size limits + eviction
- [ ] All JSON.parse calls guarded with try/catch
- [ ] All packages pass existing tests after changes
- [ ] New regression tests added for each fix

### Must Have
- No event loop blocking in token consumption path
- No unbounded memory growth in metrics collection
- No silent failures hiding data loss

### Must NOT Have
- No new sync I/O in hot paths (trackEvent, consumeTokens, config access)
- No append-only collections without eviction
- No bare JSON.parse without error handling

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (existing tests + regression tests)
- **Framework**: bun test

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)
Each task includes verification via:
- **API changes**: curl/httpie to endpoint
- **File I/O**: Bash to verify file operations
- **Memory**: Node.js to check collection sizes
- **Performance**: Benchmark before/after for sync I/O removal

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Independent - Start Immediately):
├── config-loader: Async I/O + JSON.parse guards
├── learning-engine: Async trackEvent() 
└── model-manager: Bounded arrays (discovery/cache/transition/pr events)

Wave 2 (After Wave 1 completes):
├── context-governor: Verify debounce, fix if needed
├── model-router-x: JSON.parse loop optimization
└── model-manager: Alert history cap + writeQueue fix

Wave 3 (Integration):
├── All packages: Run full test suite
└── Verify no regressions across packages
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1. config-loader async | None | 5, 7 | 2, 3, 4 |
| 2. learning-engine async | None | 5 | 1, 3, 4 |
| 3. model-manager arrays | None | 6 | 1, 2, 4 |
| 4. context-governor verify | None | None | 1, 2, 3 |
| 5. model-router-x optimize | 1, 2 | None | - |
| 6. model-manager alerts | 3 | None | - |
| 7. integration tests | 1, 2, 3, 4, 5, 6 | None | - |

---

## TODOs

### Wave 1: Critical Path Fixes

- [ ] 1. **config-loader: Convert sync I/O to async**

  **What to do**:
  - Replace fs.readFileSync with fs.promises.readFile in central-config-state.js
  - Replace fs.writeFileSync with fs.promises.writeFile
  - Add caching layer to avoid read-before-write pattern
  - Add try/catch guards to all JSON.parse calls

  **Must NOT do**:
  - Keep any sync I/O in hot paths (load, save, update functions)
  - Remove atomic rename pattern (tmp + rename) - keep for durability

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-file refactor requiring careful API changes
  - **Skills**: [`systematic-debugging`]
    - systematic-debugging: Required to verify no regressions in config loading

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 5 (model-router-x may depend on config)
  - **Blocked By**: None

  **References**:
  - `packages/opencode-config-loader/src/central-config-state.js:55-151` - Current sync I/O locations
  - `packages/opencode-config-loader/src/central-config.js:108-121` - Main config loading
  - `packages/opencode-context-governor/src/index.js:211-222` - Example of async-safe saveToFile with debounce

  **Acceptance Criteria**:
  - [ ] All fs.readFileSync replaced with await fs.promises.readFile
  - [ ] All fs.writeFileSync replaced with await fs.promises.writeFile
  - [ ] Cache layer prevents redundant reads
  - [ ] All JSON.parse wrapped in try/catch
  - [ ] bun test packages/opencode-config-loader/test/ → PASS

  **Agent-Executed QA Scenarios**:

  \`\`\`
  Scenario: Config loads asynchronously without blocking
    Tool: Bash
    Preconditions: Test config file exists
    Steps:
      1. time node -e "const {loadRlState} = require('./src/central-config-state.js'); await loadRlState();"
      2. Assert: Command completes in <100ms (async, not blocking)
    Expected Result: Async load completes quickly
    Evidence: Timing output

  Scenario: Config save is atomic and async
    Tool: Bash
    Preconditions: None
    Steps:
      1. node -e "const {saveRlState} = require('./src/central-config-state.js'); await saveRlState({test:1});"
      2. Assert: File exists at target path
      3. Assert: No .tmp file left behind
    Expected Result: Atomic async write
    Evidence: File listing

  Scenario: Corrupt JSON doesn't crash
    Tool: Bash
    Preconditions: Corrupt config file created
    Steps:
      1. echo "not valid json" > corrupt.json
      2. node -e "const {loadRlState} = require('./src/central-config-state.js'); await loadRlState('./corrupt.json');"
      3. Assert: Returns null or defaults, doesn't throw
      4. Assert: No crash, no uncaught exception
    Expected Result: Graceful degradation
    Evidence: Process exit code 0
  \`\`\`

  **Commit**: YES
  - Message: `refactor(config-loader): convert sync I/O to async with caching`
  - Files: `src/central-config-state.js`, `src/central-config.js`
  - Pre-commit: `bun test packages/opencode-config-loader/test/`

---

- [ ] 2. **learning-engine: Convert trackEvent() to async**

  **What to do**:
  - Replace sync fs.readFileSync in _readRollups() with async
  - Replace sync fs.writeFileSync in _writeRollups() with async
  - Ensure debounce is working (should already be implemented)
  - Add JSONL rotation for orchestration-intel.jsonl (max file size)

  **Must NOT do**:
  - Keep any sync I/O in trackEvent() path
  - Remove existing debounce logic (keep it)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Hot path optimization requiring async conversion
  - **Skills**: [`systematic-debugging`]
    - systematic-debugging: Verify no event tracking loss

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `packages/opencode-learning-engine/src/meta-awareness-tracker.js:50-80` - trackEvent() implementation
  - `packages/opencode-learning-engine/src/meta-awareness-tracker.js:290-340` - _readRollups, _writeRollups
  - `packages/opencode-context-governor/src/index.js:211-222` - Reference for async + debounce pattern

  **Acceptance Criteria**:
  - [ ] _readRollups() uses await fs.promises.readFile
  - [ ] _writeRollups() uses await fs.promises.writeFile
  - [ ] trackEvent() doesn't block on file I/O
  - [ ] JSONL file rotation when > maxEventLines
  - [ ] bun test packages/opencode-learning-engine/test/ → PASS

  **Agent-Executed QA Scenarios**:

  \`\`\`
  Scenario: trackEvent doesn't block event loop
    Tool: Bash
    Preconditions: None
    Steps:
      1. time node -e "const {MetaAwarenessTracker} = require('./src/meta-awareness-tracker.js'); const t = new MetaAwarenessTracker(); t.trackEvent({session_id:'test'});"
      2. Assert: Completes in <50ms (async, not waiting for disk)
    Expected Result: Non-blocking event tracking
    Evidence: Timing output

  Scenario: Rapid trackEvent calls are debounced
    Tool: Bash
    Preconditions: None
    Steps:
      1. node -e "const {MetaAwarenessTracker} = require('./src/meta-awareness-tracker.js'); const t = new MetaAwarenessTracker(); for(let i=0;i<20;i++) t.trackEvent({session_id:'test',i});"
      2. Assert: Only 1-3 disk writes occur (debounced)
    Expected Result: Batched writes
    Evidence: Disk I/O observation
  \`\`\`

  **Commit**: YES
  - Message: `refactor(learning-engine): async trackEvent with JSONL rotation`
  - Files: `src/meta-awareness-tracker.js`
  - Pre-commit: `bun test packages/opencode-learning-engine/test/`

---

- [ ] 3. **model-manager: Add bounded arrays to metrics collector**

  **What to do**:
  - Add maxEvents option to PipelineMetricsCollector constructor (default: 10000)
  - Implement FIFO eviction in _discoveryEvents, _cacheEvents, _transitionEvents, _prEvents
  - Add eviction test to verify bounds are enforced

  **Must NOT do**:
  - Remove existing event recording functionality
  - Change the API signature (keep backward compatibility)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Memory management fix requiring careful array bounds
  - **Skills**: [`systematic-debugging`]
    - systematic-debugging: Verify no event data loss

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 6 (alert manager)
  - **Blocked By**: None

  **References**:
  - `packages/opencode-model-manager/src/monitoring/metrics-collector.js:26-35` - Unbounded arrays
  - `packages/opencode-context-governor/src/session-tracker.js:45` - Reference for maxSessions cap pattern

  **Acceptance Criteria**:
  - [ ] _discoveryEvents capped at maxEvents (default 10000)
  - [ ] _cacheEvents capped at maxEvents
  - [ ] _transitionEvents capped at maxEvents
  - [ ] _prEvents capped at maxEvents
  - [ ] Old events evicted FIFO when limit exceeded
  - [ ] bun test packages/opencode-model-manager/test/ → PASS

  **Agent-Executed QA Scenarios**:

  \`\`\`
  Scenario: Events are evicted when limit exceeded
    Tool: Bash
    Preconditions: None
    Steps:
      1. node -e "
    const {PipelineMetricsCollector} = require('./src/monitoring/metrics-collector.js');
    const c = new PipelineMetricsCollector({maxEvents: 100});
    for(let i=0;i<150;i++) c.recordDiscovery({model:'m'+i, provider:'p', latency:100, success:true});
    console.log('count:', c._discoveryEvents.length);
    "
      2. Assert: count <= 100 (capped)
    Expected Result: FIFO eviction keeps array bounded
    Evidence: Console output showing <= 100

  Scenario: Old events removed first
    Tool: Bash
    Preconditions: None
    Steps:
      1. node -e "
    const {PipelineMetricsCollector} = require('./src/monitoring/metrics-collector.js');
    const c = new PipelineMetricsCollector({maxEvents: 5});
    c.recordDiscovery({model:'first', provider:'p', latency:100, success:true});
    c.recordDiscovery({model:'second', provider:'p', latency:100, success:true});
    c.recordDiscovery({model:'third', provider:'p', latency:100, success:true});
    c.recordDiscovery({model:'fourth', provider:'p', latency:100, success:true});
    c.recordDiscovery({model:'fifth', provider:'p', latency:100, success:true});
    c.recordDiscovery({model:'sixth', provider:'p', latency:100, success:true});
    console.log('first:', c._discoveryEvents[0].model);
    "
      2. Assert: first === 'second' (first was evicted)
    Expected Result: FIFO order preserved
    Evidence: Console output
  \`\`\`

  **Commit**: YES
  - Message: `fix(model-manager): add bounded arrays with FIFO eviction to metrics collector`
  - Files: `src/monitoring/metrics-collector.js`
  - Pre-commit: `bun test packages/opencode-model-manager/test/`

---

### Wave 2: Secondary Fixes

- [ ] 4. **context-governor: Verify debounce implementation**

  **What to do**:
  - Verify saveToFile() debounce is working correctly
  - If not working, implement 200ms debounce with .unref()
  - Add regression test for debounce behavior
  - Ensure consumeTokens() doesn't block on save

  **Must NOT do**:
  - Remove the save functionality (state must persist)
  - Change the atomic rename pattern

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Verification + potential fix of existing debounce
  - **Skills**: [`systematic-debugging`]
    - systematic-debugging: Test debounce timing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `packages/opencode-context-governor/src/index.js:120-130` - saveToFile location
  - `packages/opencode-learning-engine/src/meta-awareness-tracker.js:330-350` - Reference debounce implementation

  **Acceptance Criteria**:
  - [ ] 10 rapid consumeTokens() calls produce <= 3 disk writes
  - [ ] Debounce window is ~200ms
  - [ ] Timer uses .unref() to not block process exit
  - [ ] bun test packages/opencode-context-governor/test/ → PASS

  **Agent-Executed QA Scenarios**:

  \`\`\`
  Scenario: Rapid token consumption is debounced
    Tool: Bash
    Preconditions: None
    Steps:
      1. node -e "
    const {Governor} = require('./src/index.js');
    const g = new Governor();
    const start = Date.now();
    for(let i=0;i<10;i++) g.consumeTokens('s','claude-opus-4-6',100);
    const elapsed = Date.now() - start;
    console.log('elapsed:', elapsed);
    "
      2. Assert: elapsed < 500ms (debounced, not 10 × sync writes)
    Expected Result: Fast due to debouncing
    Evidence: Timing output

  Scenario: State persists after debounce
    Tool: Bash
    Preconditions: None
    Steps:
      1. node -e "
    const {Governor} = require('./src/index.js');
    const g = new Governor();
    g.consumeTokens('test-debounce','claude-opus-4-6',1000);
    "
      2. Wait 300ms (debounce window)
      3. node -e "
    const {Governor} = require('./src/index.js');
    const g = new Governor();
    const budget = g.getRemainingBudget('test-debounce','claude-opus-4-6');
    console.log('remaining:', budget.remaining);
    "
      4. Assert: remaining < 180000 (tokens were consumed)
    Expected Result: State saved after debounce
    Evidence: Budget output
  \`\`\`

  **Commit**: YES
  - Message: `fix(context-governor): verify and fix debounce if needed`
  - Files: `src/index.js`
  - Pre-commit: `bun test packages/opencode-context-governor/test/`

---

- [ ] 5. **model-router-x: Optimize JSON.parse loop in discovery**

  **What to do**:
  - Optimize the audit log validation loop in model-discovery.js
  - Add early exit when first invalid JSON found
  - Consider batch parsing or streaming JSON parse
  - Add cache TTL to discoveryCache Map

  **Must NOT do**:
  - Remove audit log validation (security requirement)
  - Change the validation logic incorrectly

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Performance optimization in discovery path
  - **Skills**: [`systematic-debugging`]
    - systematic-debugging: Verify discovery still works

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: None
  - **Blocked By**: Task 1 (config-loader)

  **References**:
  - `packages/opencode-model-router-x/src/model-discovery.js:62-137` - JSON.parse loop
  - `packages/opencode-model-router-x/src/model-discovery.js:40-60` - discoveryCache

  **Acceptance Criteria**:
  - [ ] Audit log validation uses early exit on first error
  - [ ] discoveryCache has TTL or maxSize limit
  - [ ] Discovery completes in <500ms even with large audit log
  - [ ] bun test packages/opencode-model-router-x/test/ → PASS

  **Agent-Executed QA Scenarios**:

  \`\`\`
  Scenario: Discovery completes quickly with large audit log
    Tool: Bash
    Preconditions: Large audit log (>1000 entries)
    Steps:
      1. time node -e "
    const {ModelDiscovery} = require('./src/model-discovery.js');
    const d = new ModelDiscovery();
    await d.pollOnce();
    "
      2. Assert: Completes in <500ms
    Expected Result: Fast discovery despite large log
    Evidence: Timing output
  \`\`\`

  **Commit**: YES
  - Message: `perf(model-router-x): optimize JSON.parse loop with early exit`
  - Files: `src/model-discovery.js`
  - Pre-commit: `bun test packages/opencode-model-router-x/test/`

---

- [ ] 6. **model-manager: Cap alert history + fix writeQueue**

  **What to do**:
  - Add maxHistorySize to AlertManager (default: 1000)
  - Implement FIFO eviction for _alertHistory array
  - Add bounded queue or semaphore for writeQueue in audit-logger

  **Must NOT do**:
  - Remove alert functionality
  - Change audit log format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Memory management + queue depth fix
  - **Skills**: [`systematic-debugging`]
    - systematic-debugging: Verify alerts still fire

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: None
  - **Blocked By**: Task 3 (metrics collector)

  **References**:
  - `packages/opencode-model-manager/src/monitoring/alert-manager.js:44-50` - Alert history
  - `packages/opencode-model-manager/src/lifecycle/audit-logger.js:16` - writeQueue

  **Acceptance Criteria**:
  - [ ] _alertHistory capped at maxHistorySize (default 1000)
  - [ ] writeQueue has max pending limit (default: 100)
  - [ ] Old alerts evicted FIFO
  - [ ] bun test packages/opencode-model-manager/test/ → PASS

  **Agent-Executed QA Scenarios**:

  \`\`\`
  Scenario: Alert history is bounded
    Tool: Bash
    Preconditions: None
    Steps:
      1. node -e "
    const {AlertManager} = require('./src/monitoring/alert-manager.js');
    const a = new AlertManager({maxHistorySize: 10});
    for(let i=0;i<20;i++) a.evaluate({type:'test',severity:'high',message:'msg'+i});
    console.log('count:', a._alertHistory.length);
    "
      2. Assert: count <= 10
    Expected Result: Bounded alert history
    Evidence: Console output
  \`\`\`

  **Commit**: YES
  - Message: `fix(model-manager): cap alert history and writeQueue`
  - Files: `src/monitoring/alert-manager.js`, `src/lifecycle/audit-logger.js`
  - Pre-commit: `bun test packages/opencode-model-manager/test/`

---

### Wave 3: Integration Verification

- [ ] 7. **Run full test suite across all modified packages**

  **What to do**:
  - Run bun test across all 5 packages
  - Verify no regressions introduced
  - Verify all Agent-Executed QA scenarios pass
  - Generate test coverage report if needed

  **Must NOT do**:
  - Skip any package's tests
  - Accept test failures as "expected"

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running existing tests, verification only
  - **Skills**: [`systematic-debugging`]
    - systematic-debugging: Analyze any test failures

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential verification)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2, 3, 4, 5, 6

  **References**:
  - All test files in packages/*/test/

  **Acceptance Criteria**:
  - [ ] bun test packages/opencode-config-loader/test/ → PASS
  - [ ] bun test packages/opencode-context-governor/test/ → PASS
  - [ ] bun test packages/opencode-learning-engine/test/ → PASS
  - [ ] bun test packages/opencode-model-manager/test/ → PASS
  - [ ] bun test packages/opencode-model-router-x/test/ → PASS
  - [ ] No regressions in any package

  **Agent-Executed QA Scenarios**:

  \`\`\`
  Scenario: All package tests pass
    Tool: Bash
    Preconditions: All fixes complete
    Steps:
      1. bun test packages/opencode-config-loader/test/
      2. bun test packages/opencode-context-governor/test/
      3. bun test packages/opencode-learning-engine/test/
      4. bun test packages/opencode-model-manager/test/
      5. bun test packages/opencode-model-router-x/test/
    Expected Result: All tests pass
    Evidence: Test output summary
  \`\`\`

  **Commit**: YES (optional - can batch all fixes)
  - Message: `chore: complete technical debt fixes across 5 packages`
  - Files: Multiple files across packages
  - Pre-commit: `bun test` (all packages)

---

## Success Criteria

### Verification Commands
```bash
# Test each package
bun test packages/opencode-config-loader/test/
bun test packages/opencode-context-governor/test/
bun test packages/opencode-learning-engine/test/
bun test packages/opencode-model-manager/test/
bun test packages/opencode-model-router-x/test/
```

### Final Checklist
- [ ] All sync I/O in hot paths replaced with async
- [ ] All unbounded collections have size limits + eviction
- [ ] All JSON.parse calls guarded with try/catch
- [ ] All packages pass existing tests
- [ ] No event loop blocking in token consumption
- [ ] No unbounded memory growth in metrics
- [ ] No silent failures hiding data loss

---

## Risk Assessment

| Task | Risk | Mitigation |
|------|------|------------|
| 1. config-loader async | Medium - could break config loading | Test thoroughly, keep atomic rename |
| 2. learning-engine async | Medium - could lose events | Verify debounce, add flush() on exit |
| 3. model-manager arrays | Low - data loss acceptable | Keep recent events, test eviction |
| 4. context-governor verify | Low - should already work | Test debounce timing |
| 5. model-router-x optimize | Medium - could skip validation | Keep validation, just optimize |
| 6. model-manager alerts | Low - data loss acceptable | Keep recent alerts |
| 7. integration tests | Low - just verification | Run all tests |

**Overall Risk**: MEDIUM - Each fix is isolated and testable. No architectural changes.
