# Orchestration Wiring Fixes — All 33 Gaps

## TL;DR

> **Quick Summary**: Fix all identified orchestration wiring failures, disconnected data pipelines, missing production hooks, and partial-data gaps discovered in the March 2026 deep audit. 30 of 33 gaps fixed in this plan; 3 deferred as new-feature work.
>
> **Deliverables**:
> - All broken wiring fixed (silent TypeErrors, null references, schema mismatches eliminated)
> - All major data pipelines connected (telemetry, alerts, learning engine events)
> - All missing production hooks wired (token budget, skill failures, proofcheck)
> - Data quality gaps closed (field-name consistency, denominator accuracy)
> - Structural discoverability improved (exports map, bootstrap visibility)
>
> **Estimated Effort**: XL (30 targeted fixes across 15+ files)
> **Parallel Execution**: YES — 5 waves, mostly sequential within waves
> **Critical Path**: Task 0 (baseline) → Wave 1 → Wave 2 → Wave 3 → Wave 4 → Wave 5

---

## Context

### Original Request
Fix all 33 orchestration gaps and data collection failures identified in the deep audit of the opencode-setup monorepo.

### Key Technical Files
- `packages/opencode-integration-layer/src/bootstrap.js` (332 LOC) — singleton loader
- `packages/opencode-integration-layer/src/index.js` (1500+ LOC) — IntegrationLayer class
- `packages/opencode-model-router-x/src/index.js` — ModelRouter
- `packages/opencode-learning-engine/src/index.js` — LearningEngine
- `packages/opencode-learning-engine/src/tool-usage-tracker.js` (841 LOC)
- `packages/opencode-model-manager/src/monitoring/alert-manager.js`
- `packages/opencode-memory-graph/src/graph-builder.js`
- `scripts/runtime-tool-telemetry.mjs`
- `opencode-config/skills/registry.json`

### Metis Review
**Key gaps identified by Metis (incorporated)**:
- CircuitBreaker downgraded from critical — ModelRouter has working self-healing local require. Bootstrap tryLoad is additive only.
- Gap #3 (getLearningAdvice TypeError) IS a confirmed runtime TypeError, silently swallowed by try/catch — highest-leverage single fix
- Gaps #21, #22, #33 reclassified as features/refactors → DEFERRED to future PR
- Gap #3 and Gap #16 MUST be paired in same wave (jointly change runtime behavior — model selection + budget activation)
- Must run `bun test` before starting to establish passing baseline; tag git before Wave 1

---

## Work Objectives

### Core Objective
Eliminate all silent failures, connect all disconnected data pipelines, and wire all missing production hooks so the orchestration system functions as designed.

### Concrete Deliverables
- `bootstrap.js`: CircuitBreaker tryLoad, proofcheck stored in config
- `index.js` (IntegrationLayer): crashGuard wired, proofcheck wired, recordTokenUsage called in hot path, evaluateBudget called after consumeTokens, skill-failure detection in fallback flow
- `model-router-x/index.js`: getLearningAdvice method added, learnFromOutcome call path added
- `graph-builder.js`: schema field normalization (sessionId→session_id, message→error_type)
- `exploration-adapter.js`: method name aligned (recordOutcome→learnFromOutcome)
- `runtime-tool-telemetry.mjs`: success flag driven by actual result, failure data captured
- `alert-manager.js` + integration-layer: `.on()` listeners wired for alert:fired / alert:resolved
- Dashboard routes: use shared MetricsCollector from integration-layer, not own singleton
- Dashboard memory-graph route: delegate to opencode-memory-graph package API
- `opencode.json` plugin config: 4 missing plugins added
- `package.json` (integration-layer): bootstrap.js added to exports map
- Deprecation docs for 5 orphaned packages + compound-engineering/info.md dead reference

### Definition of Done
- [ ] `bun test` passes with all 253 tests (0 regressions) after EVERY individual fix
- [ ] `getLearningAdvice` no longer throws in route() — verified by calling route() directly
- [ ] Memory graph accepts entries — verified by sending a test entry and confirming storage
- [ ] Token usage is non-zero after a delegate() call
- [ ] Alert listeners fire on evaluateBudget() — verified by triggering a budget threshold
- [ ] runtime-tool-telemetry captures `success: false` on tool error — verified via test invocation

### Must Have
- Fail-open semantics preserved on ALL fixes (every try/catch that returns null/default stays that way)
- bun test baseline established before first code change
- Git tag `pre-wiring-fix` before Wave 1 starts
- Each fix verified individually before proceeding to next

### Must NOT Have (Guardrails)
- **NO** method signature changes on: `learnFromOutcome`, `selectSkills`, `route`, `recordResult`, `executeTaskWithEvidence`
- **NO** fail-open→fail-closed conversions anywhere
- **NO** central event bus implementation (Gap #21 — deferred, future PR)
- **NO** exploration/exploitation policy for skill selection (Gap #22 — deferred, future PR)
- **NO** standalone tool-usage-tracker package extraction (Gap #33 — deferred, future PR)
- **NO** deleting orphaned packages (Gap #32) — document deprecation only
- **NO** breaking changes to Dashboard API routes (must remain backward-compatible)
- **NO** changing atomic write patterns (temp-file-then-rename stays)
- **NO** changing CircuitBreaker's local self-healing require in ModelRouter — bootstrap tryLoad is additive only
- **NO** changes to `ON CONFLICT DO NOTHING` SQL patterns (intentional idempotency)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (bun test, 253 tests, 1,676 assertions)
- **Automated tests**: Tests-after (verify existing tests pass + add targeted regression tests per gap)
- **Framework**: bun test

### Baseline Verification (BEFORE ANY CODE)
```bash
# Run from repo root
bun test
# Expected: 253 tests pass, 0 failures

# Tag git before starting
git tag pre-wiring-fix
```

### Per-Fix Verification Pattern
After EVERY individual fix:
```bash
bun test
# Expected: still 253+ tests pass, 0 failures
```

### Wave 2 Special: Behavioral Regression Tests
Gap #3 and #16 change runtime behavior. Before touching them:
```bash
# Capture pre-fix model selection baseline
node -e "
  const {ModelRouter} = require('./packages/opencode-model-router-x/src/index.js');
  const r = new ModelRouter({});
  const ctx = {taskType:'debug',sessionId:'smoke-test'};
  try { const res = r.route(ctx); console.log('pre-fix route:', res.modelId, res.metaKBPenalty); }
  catch(e) { console.error('pre-fix threw:', e.message); }
"
```

After fix:
```bash
# Verify getLearningAdvice no longer throws
node -e "
  const {ModelRouter} = require('./packages/opencode-model-router-x/src/index.js');
  const r = new ModelRouter({});
  const res = r.route({taskType:'debug',sessionId:'smoke-test'});
  console.log('post-fix route:', res.modelId);
  if (!res.modelId) process.exit(1);
  console.log('PASS: route() succeeds without TypeError');
"
```

---

## Execution Strategy

### Wave Ordering (Risk-Based)

```
Task 0: Baseline + Git Tag (Sequential, before all waves)

Wave 1: Safe Structural Wiring (no behavior change)
├── Task 1: CircuitBreaker tryLoad in bootstrap
├── Task 2: crashGuard wired in IntegrationLayer
├── Task 3: proofcheck stored in IntegrationLayer config
├── Task 4: ExplorationRLAdapter method alignment (recordOutcome→learnFromOutcome)
├── Task 5: Memory graph schema normalization
├── Task 6: bootstrap.js added to package.json exports map
└── Task 7: context-governor/memory-graph/backup-manager visible to bootstrapStatus

Wave 2: Behavior-Changing Wiring (paired, run together)
├── Task 8: getLearningAdvice added to ModelRouter
├── Task 9: LearningEngine.learnFromOutcome call path from integration-layer
├── Task 10: recordTokenUsage called in executeTaskWithEvidence hot path
└── Task 11: checkContextBudget called in production routing

Wave 3: Pipeline Connections
├── Task 12: runtime-tool-telemetry success flag fix
├── Task 13: runtime-tool-telemetry bypass fix (detectUnderUse/appropriateness)
├── Task 14: AlertManager event bus — wire .on() listeners in bootstrap
├── Task 15: LearningEngine event hooks — wire non-test consumers
├── Task 16: Dashboard memory-graph route delegates to package API
├── Task 17: Dashboard metric routes use shared MetricsCollector
└── Task 18: PipelineMetricsCollector auto-feed from runtime events

Wave 4: Production Hooks + Data Quality
├── Task 19: AlertManager.evaluateBudget() wired after consumeTokens
├── Task 20: WorkflowExecutor budgetEnforcer wired (behind feature flag)
├── Task 21: Skill-failure detection added to FallbackDoctor
├── Task 22: Consecutive-failure handler for skills (3-strike threshold)
├── Task 23: taskType vs task_type field-name consistency
├── Task 24: SkillRL influence shape fix in ModelRouter (success_rate + no recommendedModels)
├── Task 25: Dashboard tool-usage breadth denominator fix (60→dynamic from AVAILABLE_TOOLS)
└── Task 26: PostToolUse hook params capture depth improvement

Wave 5: Structural + Cleanup
├── Task 27: 4 unconfigured plugins added to opencode.json
├── Task 28: opencode-supermemory + opencode-beads plugin metadata stubs
├── Task 29: compound-engineering/info.md dead reference documented
└── Task 30: 5 orphaned packages — deprecation notices added to their README files

Critical Path: Task 0 → Wave 1 (sequential) → Wave 2 (sequential) → Wave 3 → Wave 4 → Wave 5
```

---

## TODOs

- [ ] 0. Establish Baseline + Git Tag

  **What to do**:
  - Run `bun test` and confirm all 253 tests pass (0 failures)
  - If any tests fail, STOP and document which tests fail (do not proceed with fixes until baseline is clean)
  - Run `git tag pre-wiring-fix` to create a rollback point
  - Capture pre-fix model selection baseline (see Wave 2 Special above) and save to `.sisyphus/evidence/orchestration-fixes/pre-fix-model-selection.txt`

  **Must NOT do**:
  - Do not skip this task under any circumstances
  - Do not proceed to Task 1 if `bun test` shows failures

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: Creating the git tag and capturing evidence

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: ALL other tasks (must complete first)

  **References**:
  - `packages/opencode-integration-layer/src/bootstrap.js` — bootstrap singleton pattern
  - `packages/opencode-model-router-x/src/index.js:698` — getLearningAdvice call site

  **Acceptance Criteria**:
  - [ ] `bun test` output shows "253 tests passed" (or higher), 0 failures
  - [ ] `git tag pre-wiring-fix` succeeds and appears in `git tag --list`
  - [ ] Pre-fix baseline file saved: `.sisyphus/evidence/orchestration-fixes/pre-fix-model-selection.txt`
  - [ ] Evidence: `.sisyphus/evidence/orchestration-fixes/task-0-baseline.txt` (bun test output)

  **Commit**: NO (no code changes)

---

- [ ] 1. CircuitBreaker tryLoad in bootstrap.js

  **What to do**:
  - In `packages/opencode-integration-layer/src/bootstrap.js`, add a `tryLoad()` call for `opencode-circuit-breaker` (or the correct package name) alongside the other package loads
  - Store result in bootstrap config as `config.CircuitBreaker` for bootstrapStatus visibility
  - This is ADDITIVE ONLY — ModelRouter's own self-healing local require at model-router-x/index.js:8-13 must not be touched
  - The tryLoad result passes as `options.circuitBreakerClass` to ModelRouter constructor (line 266), which already has the fallback `this.CircuitBreaker = options.circuitBreakerClass || CircuitBreaker || null`

  **Must NOT do**:
  - Do NOT remove ModelRouter's local `require` for CircuitBreaker (lines 8-13)
  - Do NOT change ModelRouter's constructor fallback logic (line 379)
  - Do NOT make this fail-closed (if CircuitBreaker fails to load, bootstrap continues)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 1 tasks run sequentially to simplify regression tracking)
  - **Blocked By**: Task 0

  **References**:
  - `packages/opencode-integration-layer/src/bootstrap.js:1-50` — existing tryLoad pattern to follow
  - `packages/opencode-integration-layer/src/bootstrap.js:266` — where CircuitBreaker is passed to ModelRouter
  - `packages/opencode-model-router-x/src/index.js:8-13` — DO NOT TOUCH local require
  - `packages/opencode-model-router-x/src/index.js:379` — constructor fallback (DO NOT TOUCH)

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `node -e "const {getBootstrapStatus} = require('./packages/opencode-integration-layer/src/bootstrap.js'); const s = getBootstrapStatus(); console.log(JSON.stringify(s.packages?.circuitBreaker));"` — shows loaded status (true or false, not undefined)
  - [ ] Evidence: `.sisyphus/evidence/orchestration-fixes/task-1-circuit-breaker.txt`

  **Commit**: YES (with Task 2, 3)
  - Message: `fix(bootstrap): tryLoad CircuitBreaker and store proofcheck in IntegrationLayer config`

---

- [ ] 2. crashGuard wired in IntegrationLayer constructor

  **What to do**:
  - In `packages/opencode-integration-layer/src/index.js`, find the constructor where config is received
  - Add `this.crashGuard = config.crashGuard || null;` to the constructor (matching the pattern of other config assignments)
  - Verify `commandExists()` at line ~637 checks `this.crashGuard` before calling — if not, add null guard: `if (!this.crashGuard) return true;` (fail-open)
  - Verify `safeSpawn()` at line ~653 similarly guards — if not, add null guard: `if (!this.crashGuard) return childProcess.spawn(...args);` (fail-open)

  **Must NOT do**:
  - Do NOT change crashGuard to fail-closed (missing crashGuard → allow spawn, not block)
  - Do NOT change the `initCrashGuard()` module-level function
  - Do NOT change existing `commandExists` or `safeSpawn` signatures

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3, after Task 1 completes)
  - **Blocked By**: Task 0

  **References**:
  - `packages/opencode-integration-layer/src/index.js` — constructor and commandExists/safeSpawn
  - `packages/opencode-integration-layer/src/bootstrap.js` — how crashGuard is initialized

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `node -e "const IL = require('./packages/opencode-integration-layer/src/index.js'); const il = new IL({crashGuard: {commandExists: ()=>true}}); console.log('crashGuard set:', !!il.crashGuard);"` → outputs `crashGuard set: true`
  - [ ] `node -e "const IL = require('./packages/opencode-integration-layer/src/index.js'); const il = new IL({}); const r = il.commandExists('bun'); console.log('commandExists with null guard:', r);"` → does not throw

  **Commit**: YES (grouped with Task 1, 3)

---

- [ ] 3. proofcheck stored in IntegrationLayer config

  **What to do**:
  - In `packages/opencode-integration-layer/src/index.js` constructor, add `this.proofcheck = config.proofcheck || null;`
  - Confirm bootstrap.js:176 creates `config.proofcheck` and it will now be accessible at runtime
  - Optionally expose via `getBootstrapStatus()` or IntegrationLayer status getter

  **Must NOT do**:
  - Do NOT call proofcheck methods yet — just store the reference (proofcheck integration is a separate concern)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Blocked By**: Task 0

  **References**:
  - `packages/opencode-integration-layer/src/bootstrap.js:176` — where proofcheck is created
  - `packages/opencode-integration-layer/src/index.js` — constructor

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] Constructor stores `this.proofcheck` — verified by `grep "this.proofcheck" packages/opencode-integration-layer/src/index.js`

  **Commit**: YES (grouped with Task 1, 2)

---

- [ ] 4. ExplorationRLAdapter method alignment

  **What to do**:
  - In `packages/opencode-exploration-rl/src/exploration-adapter.js` (or wherever ExplorationRLAdapter is defined):
    - Find the validation at line ~8: `typeof skillRLManager.recordOutcome !== 'function'`
    - Change to: `typeof skillRLManager.learnFromOutcome !== 'function'`
  - Find all calls to `skillRLManager.recordOutcome()` in the adapter (line ~68) and change to `skillRLManager.learnFromOutcome()`
  - Use `ast_grep_search` to find ALL occurrences of `recordOutcome` across the codebase before editing
  - Verify SkillRLManager.learnFromOutcome() signature matches what the adapter passes

  **Must NOT do**:
  - Do NOT rename `learnFromOutcome` on SkillRLManager (it's the correct method name)
  - Do NOT add `recordOutcome` as an alias on SkillRLManager
  - Use `lsp_find_references` on `recordOutcome` before editing to confirm no other callers

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (independent of Tasks 1-3)
  - **Blocked By**: Task 0

  **References**:
  - `packages/opencode-exploration-rl/src/exploration-adapter.js:8,68` — method name mismatch
  - `packages/opencode-skill-rl/src/index.js` — SkillRLManager.learnFromOutcome() signature

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `grep -r "recordOutcome" packages/` returns 0 results (or only comments)
  - [ ] ExplorationRLAdapter can be instantiated without throwing: `node -e "const {ExplorationRLAdapter} = require('./packages/opencode-exploration-rl/src/exploration-adapter.js'); console.log('adapter imported OK');"`

  **Commit**: YES
  - Message: `fix(exploration-rl): align ExplorationRLAdapter to use learnFromOutcome instead of recordOutcome`

---

- [ ] 5. Memory graph schema normalization

  **What to do**:
  - In `packages/opencode-memory-graph/src/graph-builder.js` around lines 149-150:
    - Either: normalize incoming fields before the check: `const session_id = entry.session_id || entry.sessionId; const error_type = entry.error_type || entry.name || entry.constructor?.name || 'UnknownError';`
    - OR: update `recordSessionError()` in `packages/opencode-integration-layer/src/index.js` to send `{ session_id: data.sessionId, error_type: data.name || 'UnknownError', message: data.message, stack: data.stack }`
    - **PREFER option 1** (normalize in graph-builder) — it makes the intake more robust to multiple callers
  - Ensure the `if (!session_id || !error_type) continue` guard still exists but now rarely triggers
  - Add a fallback: if error_type would be empty string, use `'UnknownError'`

  **Must NOT do**:
  - Do NOT remove the `if (!session_id || !error_type) continue` guard
  - Do NOT change the graph storage format or output schema

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Blocked By**: Task 0

  **References**:
  - `packages/opencode-memory-graph/src/graph-builder.js:149-150` — schema destructure + guard
  - `packages/opencode-integration-layer/src/index.js` — recordSessionError() call site

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] Graph accepts entries sent in old format: `node -e "const {buildGraph} = require('./packages/opencode-memory-graph/src/graph-builder.js'); const r = buildGraph([{sessionId:'test-session',message:'Test error',name:'TypeError',stack:'stack'}]); if(r.meta.total_entries < 1) { console.error('FAIL: entry dropped'); process.exit(1); } console.log('PASS: entry stored, total_entries:', r.meta.total_entries);"`
  - [ ] Evidence: `.sisyphus/evidence/orchestration-fixes/task-5-memory-graph.txt`

  **Commit**: YES
  - Message: `fix(memory-graph): normalize schema field names to prevent silent entry drops`

---

- [ ] 6. bootstrap.js added to package.json exports map

  **What to do**:
  - In `packages/opencode-integration-layer/package.json`, find the `"exports"` field
  - Add bootstrap export: `"./bootstrap": "./src/bootstrap.js"`
  - Verify no circular dependency is introduced (bootstrap.js imports from index.js — check for cycles)
  - Also add any other commonly deep-imported files that aren't in the exports map

  **Must NOT do**:
  - Do NOT change the main entry point or break existing imports
  - Do NOT add exports that create circular requires

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Blocked By**: Task 0

  **References**:
  - `packages/opencode-integration-layer/package.json` — exports field
  - `packages/opencode-integration-layer/src/bootstrap.js` — file to export

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `node -e "const b = require('opencode-integration-layer/bootstrap'); console.log('bootstrap importable:', typeof b.bootstrap);"` — succeeds (assuming package is linked)
  - [ ] `grep '"./bootstrap"' packages/opencode-integration-layer/package.json` returns a result

  **Commit**: YES
  - Message: `fix(integration-layer): add bootstrap.js to package.json exports map`

---

- [ ] 7. context-governor/memory-graph/backup-manager visible to bootstrapStatus

  **What to do**:
  - In `packages/opencode-integration-layer/src/bootstrap.js`, find the `getBootstrapStatus()` function
  - These 3 packages currently bypass bootstrap (loaded independently). Add their status to `bootstrapStatus`:
    - Try to `require()` each package and check if it's available
    - Add to status object: `contextGovernor: { loaded: boolean }`, `memoryGraph: { loaded: boolean }`, `backupManager: { loaded: boolean }`
  - This is READ-ONLY — do NOT change how they're loaded, just report their availability

  **Must NOT do**:
  - Do NOT change how context-governor, memory-graph, or backup-manager are initialized
  - Do NOT route their initialization through bootstrap (they have their own init patterns)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Blocked By**: Task 0

  **References**:
  - `packages/opencode-integration-layer/src/bootstrap.js` — getBootstrapStatus() function
  - `packages/opencode-context-governor/` — package to check
  - `packages/opencode-memory-graph/` — package to check
  - `packages/opencode-backup-manager/` — package to check

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `node -e "const {getBootstrapStatus} = require('./packages/opencode-integration-layer/src/bootstrap.js'); const s = getBootstrapStatus(); console.log('contextGovernor:', s.contextGovernor?.loaded, 'memoryGraph:', s.memoryGraph?.loaded, 'backupManager:', s.backupManager?.loaded);"` — all three fields present (true or false, not undefined)

  **Commit**: YES (with Task 6)
  - Message: `fix(bootstrap): expose context-governor, memory-graph, backup-manager in bootstrapStatus`

---

- [ ] 8. getLearningAdvice added to ModelRouter ⚠️ BEHAVIOR CHANGE

  **What to do**:
  - In `packages/opencode-model-router-x/src/index.js`:
    - Add a `getLearningAdvice(ctx)` method to the ModelRouter class
    - This method should delegate to `this._adapter?.getLearningAdvice(ctx)` if an adapter is available
    - Return empty object `{}` as fallback if no adapter: `return this._adapter?.getLearningAdvice(ctx) || {};`
    - The existing call at line 698 (`this.getLearningAdvice(ctx)`) will now resolve correctly
  - Use `lsp_find_references` to confirm `getLearningAdvice` is only called at line 698 before implementing
  - Check RouterIntegrationAdapter.getLearningAdvice() signature to match return shape

  **Must NOT do**:
  - Do NOT refactor ModelRouter to use RouterIntegrationAdapter throughout
  - Do NOT change `route()` signature or return shape
  - Do NOT change RouterIntegrationAdapter

  **⚠️ BEHAVIORAL IMPACT**: After this fix, `metaKBPenalty` in route() will no longer always be `{}`. Model selection scores will change. Run behavioral comparison test (see Verification Strategy section).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: NO — must pair with Task 10 (recordTokenUsage); both change live routing behavior
  - **Blocked By**: Wave 1 complete

  **References**:
  - `packages/opencode-model-router-x/src/index.js:698` — call site
  - `packages/opencode-model-router-x/src/index.js` — RouterIntegrationAdapter.getLearningAdvice() signature
  - `packages/opencode-model-router-x/src/index.js:696-705` — try/catch that currently swallows the TypeError

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `node -e "const {ModelRouter} = require('./packages/opencode-model-router-x/src/index.js'); const r = new ModelRouter({}); const res = r.route({taskType:'debug',sessionId:'test'}); console.log('PASS route succeeded:', res.modelId); if(!res.modelId) process.exit(1);"` — succeeds without TypeError
  - [ ] Behavioral comparison: save output of route() before and after to `.sisyphus/evidence/orchestration-fixes/task-8-model-selection-comparison.txt`
  - [ ] Evidence: `.sisyphus/evidence/orchestration-fixes/task-8-get-learning-advice.txt`

  **Commit**: YES (with Tasks 9, 10, 11)
  - Message: `fix(model-router): add getLearningAdvice to ModelRouter and wire learnFromOutcome call path`

---

- [ ] 9. LearningEngine.learnFromOutcome call path from integration-layer

  **What to do**:
  - In `packages/opencode-integration-layer/src/index.js`, find `executeTaskWithEvidence()` (the post-execution path)
  - After `ModelRouter.recordResult()` is called, add a call to `this.learningEngine?.learnFromOutcome(outcomeData)` with the appropriate outcome data shape
  - Check `LearningEngine.learnFromOutcome()` signature (index.js:735) for required fields
  - Use fail-open: wrap in try/catch, log error, continue execution

  **Must NOT do**:
  - Do NOT change LearningEngine.learnFromOutcome() signature
  - Do NOT make this fail-closed (if learning engine is unavailable, execution continues)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 8)
  - **Blocked By**: Wave 1 complete

  **References**:
  - `packages/opencode-integration-layer/src/index.js` — executeTaskWithEvidence post-execution path
  - `packages/opencode-learning-engine/src/index.js:735` — learnFromOutcome signature

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `grep "learnFromOutcome" packages/opencode-integration-layer/src/index.js` returns at least 1 result (not just a comment)

  **Commit**: YES (grouped with Tasks 8, 10, 11)

---

- [ ] 10. recordTokenUsage called in executeTaskWithEvidence ⚠️ BEHAVIOR CHANGE

  **What to do**:
  - In `packages/opencode-integration-layer/src/index.js`, in `executeTaskWithEvidence()`:
    - After the task completes and result is available, call `this.recordTokenUsage(sessionId, model, result.tokensUsed || 0)`
    - Check `recordTokenUsage()` at line ~804 for its expected parameter signature
    - Wrap in try/catch (fail-open)
  - Verify that `result.tokensUsed` is populated by the actual execution — if not, find where token counts come from

  **Must NOT do**:
  - Do NOT make token budget block execution (fail-open — if budget exceeded, log warning but continue)
  - Do NOT add token tracking to any other method (scope boundary: only executeTaskWithEvidence)

  **⚠️ BEHAVIORAL IMPACT**: Token budget will now be consumed on every delegation. This activates budget-aware model penalties. Monitor for unexpected throttling.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 8, 9)
  - **Blocked By**: Wave 1 complete

  **References**:
  - `packages/opencode-integration-layer/src/index.js:804` — recordTokenUsage signature
  - `packages/opencode-integration-layer/src/index.js` — executeTaskWithEvidence return shape (find where tokensUsed comes from)

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] After a mock delegate call: `node -e "/* instantiate IL, call delegate, check that recordTokenUsage was called with non-zero value */"` (adapter test)
  - [ ] Token budget is non-zero after delegation: verify via context-governor status if available

  **Commit**: YES (grouped with Tasks 8, 9, 11)

---

- [ ] 11. checkContextBudget called in production routing

  **What to do**:
  - In `packages/opencode-integration-layer/src/index.js`, in the delegation flow (before or after executeTaskWithEvidence):
    - Call `this.contextGovernor?.checkContextBudget(sessionId, model, proposedTokens)` to get budget status
    - If budget status is CRITICAL (>=80%), log a warning (but do NOT block — fail-open)
    - If budget status is WARNING (>=75%), log a warning
  - Find where `this.contextGovernor` is or should be set in the IntegrationLayer constructor

  **Must NOT do**:
  - Do NOT block execution when budget is exceeded (fail-open)
  - Do NOT call checkContextBudget in tests (test callsites are fine as-is)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8-10)
  - **Blocked By**: Wave 1 complete

  **References**:
  - `packages/opencode-context-governor/src/index.js` — checkContextBudget signature and threshold constants (75% WARNING, 80% CRITICAL)
  - `packages/opencode-integration-layer/src/index.js` — delegation flow

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `grep "checkContextBudget" packages/opencode-integration-layer/src/index.js` returns a non-test callsite

  **Commit**: YES (grouped with Tasks 8, 9, 10)
  - Message: `fix(integration-layer): wire budget tracking — recordTokenUsage and checkContextBudget in hot path`

---

- [ ] 12. runtime-tool-telemetry success flag fix

  **What to do**:
  - In `scripts/runtime-tool-telemetry.mjs`, find line ~1360 where `success: true` is hardcoded
  - Change to derive `success` from the actual tool result: check if the result contains an error, exception, or error-indicating fields
  - Populate `errorClass` and `errorCode` fields from tool result when success is false
  - The tool result shape may be an object with `isError`, `error`, or similar field — inspect the PostToolUse hook payload

  **Must NOT do**:
  - Do NOT change the file format of invocations.json
  - Do NOT change the hook registration mechanism

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: NO — do Task 12 before Task 13 (both touch runtime-tool-telemetry.mjs)
  - **Blocked By**: Wave 2 complete

  **References**:
  - `scripts/runtime-tool-telemetry.mjs:1360` — hardcoded success: true
  - PostToolUse hook payload shape — check opencode documentation or hook registration code for result field names

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `grep "success: true" scripts/runtime-tool-telemetry.mjs` returns 0 results (or only in comments)
  - [ ] Simulate a tool failure and confirm `success: false` with errorClass populated in invocations.json

  **Commit**: YES (with Task 13)
  - Message: `fix(telemetry): derive success flag from actual tool result; populate errorClass/errorCode on failure`

---

- [ ] 13. runtime-tool-telemetry pipeline bypass fix

  **What to do**:
  - In `scripts/runtime-tool-telemetry.mjs`, currently invocation data is written directly to invocations.json
  - Wire the recorded invocations through `tool-usage-tracker`'s `detectUnderUse()` and appropriateness scoring (line ~449, ~416 of tool-usage-tracker.js)
  - Option A (simpler): After writing to invocations.json, call `detectUnderUse()` with the accumulated data
  - Option B (better): Import tool-usage-tracker and route through it before persisting
  - Use fail-open: if tool-usage-tracker is unavailable, fall back to direct write

  **Must NOT do**:
  - Do NOT remove the direct-to-invocations.json path as fallback
  - Do NOT change tool-usage-tracker signatures

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 12 (same file)
  - **Blocked By**: Task 12

  **References**:
  - `scripts/runtime-tool-telemetry.mjs` — invocations write path
  - `packages/opencode-learning-engine/src/tool-usage-tracker.js:449` — detectUnderUse()
  - `packages/opencode-learning-engine/src/tool-usage-tracker.js:416` — appropriateness scoring

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] After recording tool invocations, `detectUnderUse()` is called at least once in the telemetry flow (verified by log or code inspection)

  **Commit**: YES (grouped with Task 12)

---

- [ ] 14. AlertManager event bus — wire .on() listeners in bootstrap/IntegrationLayer

  **What to do**:
  - In `packages/opencode-model-manager/src/monitoring/alert-manager.js`, it emits `alert:fired` (line ~333) and `alert:resolved` (line ~181) with ZERO listeners
  - In `packages/opencode-integration-layer/src/bootstrap.js` or `index.js`, after loading AlertManager:
    - Add: `alertManager.on('alert:fired', (alert) => { console.warn('[ALERT FIRED]', alert.id, alert.message); /* or route to logger */ });`
    - Add: `alertManager.on('alert:resolved', (alert) => { console.info('[ALERT RESOLVED]', alert.id); });`
  - Do NOT build a full event bus — just add these two specific `.on()` listeners
  - Optionally route to `this.logger` or existing logging infrastructure

  **Must NOT do**:
  - Do NOT build a central event bus (defer Gap #21 to future PR)
  - Do NOT change AlertManager event names or payload shapes
  - Do NOT make alert:fired block execution

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 15-18)
  - **Blocked By**: Wave 2 complete

  **References**:
  - `packages/opencode-model-manager/src/monitoring/alert-manager.js:181,333` — event emission
  - `packages/opencode-integration-layer/src/bootstrap.js` — where to add listeners
  - Existing logger in bootstrap/IntegrationLayer — use for routing alert output

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `grep "\.on.*alert:" packages/opencode-integration-layer/src/bootstrap.js` or index.js returns at least 2 results
  - [ ] Trigger a test alert: `node -e "const AM = require('./packages/opencode-model-manager/src/monitoring/alert-manager.js'); /* trigger evaluateBudget at 90% */"` — listener output appears in console

  **Commit**: YES
  - Message: `fix(alerts): wire AlertManager event listeners in bootstrap for alert:fired and alert:resolved`

---

- [ ] 15. LearningEngine event hooks — wire non-test consumers

  **What to do**:
  - LearningEngine emits: `outcomeRecorded` (index.js:749), `onFailureDistill` (index.js:751), `patternStored` (index.js:775) — currently no non-test consumers
  - In `packages/opencode-integration-layer/src/index.js`, after wiring LearningEngine:
    - Add listener for `outcomeRecorded`: log the outcome summary or route to metrics collector
    - Add listener for `onFailureDistill`: trigger distill recommendation or log
    - Add listener for `patternStored`: log or route to meta-knowledge base
  - Match existing payload shapes from LearningEngine (check what data is emitted)

  **Must NOT do**:
  - Do NOT change LearningEngine event names or payload shapes
  - Do NOT build complex routing — simple logging/metrics routing only

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14, 16, 17, 18)
  - **Blocked By**: Wave 2 complete

  **References**:
  - `packages/opencode-learning-engine/src/index.js:749,751,775` — event emission with payload shapes
  - `packages/opencode-integration-layer/src/index.js` — where to add .on() listeners

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `grep "\.on.*outcomeRecorded\|\.on.*onFailureDistill\|\.on.*patternStored" packages/opencode-integration-layer/src/index.js` returns 3 results

  **Commit**: YES (with Task 14)
  - Message: `fix(learning-engine): wire non-test consumers for outcomeRecorded, onFailureDistill, patternStored events`

---

- [ ] 16. Dashboard memory-graph route delegates to package API

  **What to do**:
  - In the Dashboard route file at `packages/opencode-dashboard/src/app/` (find the memory-graph route, line ~167):
    - Currently it builds its own graph from `~/.opencode` files directly
    - Import and use the `opencode-memory-graph` package API instead: `const {buildGraph, getMemoryGraph} = require('opencode-memory-graph');`
    - Replace the custom graph-building logic with the package API call
  - Ensure the output shape remains the same (backward-compatible API response)
  - If package API isn't available (tryLoad pattern), fall back to existing direct implementation

  **Must NOT do**:
  - Do NOT change the Dashboard API response shape (other routes depend on it)
  - Do NOT change how `~/.opencode` files are read by other routes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14, 15, 17, 18)
  - **Blocked By**: Wave 2 complete

  **References**:
  - Dashboard memory-graph route file (search for line 167 with custom graph-building logic)
  - `packages/opencode-memory-graph/src/index.js` — package API surface

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `bun run build` (dashboard) — succeeds, 0 errors
  - [ ] Dashboard memory-graph API endpoint returns same shape as before — verify with curl or Playwright

  **Commit**: YES
  - Message: `fix(dashboard): memory-graph route delegates to opencode-memory-graph package API`

---

- [ ] 17. Dashboard metric routes use shared MetricsCollector

  **What to do**:
  - Dashboard has compression, context7, and error-trend routes that each instantiate their own `MetricsCollector` singleton — disconnected from the live runtime producer
  - Create a shared MetricsCollector instance (or use the one from IntegrationLayer) accessible to all dashboard routes
  - Options:
    - A: Export a singleton from `packages/opencode-model-manager/src/monitoring/metrics-collector.js`
    - B: Create a shared instance in a `lib/shared-metrics.ts` module in dashboard
    - **Prefer option A** — use the same metrics-collector singleton the runtime uses
  - Update the 3 affected routes to import from the shared source

  **Must NOT do**:
  - Do NOT change MetricsCollector class signatures
  - Do NOT change dashboard API response shapes
  - Do NOT break the dashboard build

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14-16)
  - **Blocked By**: Wave 2 complete

  **References**:
  - `packages/opencode-model-manager/src/monitoring/metrics-collector.js` — singleton to share
  - Dashboard route files for compression/context7/error-trend — find them via `grep -r "new MetricsCollector" packages/opencode-dashboard/`

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `bun run build` — dashboard builds successfully
  - [ ] `grep -r "new MetricsCollector" packages/opencode-dashboard/src/app/` returns 0 results (or only the shared singleton)

  **Commit**: YES (with Task 16)
  - Message: `fix(dashboard): use shared MetricsCollector singleton across all metric routes`

---

- [ ] 18. PipelineMetricsCollector auto-feed from runtime events

  **What to do**:
  - `PipelineMetricsCollector` (in opencode-model-manager monitoring) has `recordDiscovery`, `recordCacheAccess`, `recordTransition` — currently fed mostly by manual dashboard POST
  - In `packages/opencode-integration-layer/src/index.js`, add auto-feed calls at appropriate execution points:
    - `recordDiscovery()` — call when a skill is discovered/selected
    - `recordCacheAccess()` — call when model/skill cache is hit or missed
    - `recordTransition()` — call on state transitions in workflow execution
  - Use fail-open: wrap in try/catch

  **Must NOT do**:
  - Do NOT remove the manual dashboard POST path (backward compatibility)
  - Do NOT change PipelineMetricsCollector method signatures

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14-17, but depends on Task 17 being aware of shared singleton)
  - **Blocked By**: Wave 2 complete

  **References**:
  - `packages/opencode-model-manager/src/monitoring/metrics-collector.js` — PipelineMetricsCollector methods
  - `packages/opencode-integration-layer/src/index.js` — skill selection and execution flow points

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] After a delegate call: PipelineMetricsCollector has at least 1 recordDiscovery entry — verify via metrics API or direct inspection

  **Commit**: YES (grouped with Tasks 14-17)
  - Message: `fix(metrics): auto-feed PipelineMetricsCollector from runtime skill selection and execution events`

---

- [ ] 19. AlertManager.evaluateBudget() wired after consumeTokens

  **What to do**:
  - `AlertManager.evaluateBudget()` has no production callsites (comment at alert-manager.js:82 says it should be called after consumeTokens)
  - In `packages/opencode-integration-layer/src/index.js`, in the `recordTokenUsage()` method (line ~804):
    - After recording tokens, call `this.alertManager?.evaluateBudget(sessionId, model, consumedTokens, totalBudget)`
    - Match the `evaluateBudget()` signature exactly from alert-manager.js:82
  - Use fail-open

  **Must NOT do**:
  - Do NOT make evaluateBudget block execution

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 20-26)
  - **Blocked By**: Wave 3 complete

  **References**:
  - `packages/opencode-model-manager/src/monitoring/alert-manager.js:82` — evaluateBudget signature + comment
  - `packages/opencode-integration-layer/src/index.js:804` — recordTokenUsage method

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `grep "evaluateBudget" packages/opencode-integration-layer/src/index.js` returns a production callsite

  **Commit**: YES (with Task 20)
  - Message: `fix(budget): wire evaluateBudget after consumeTokens and budgetEnforcer behind feature flag`

---

- [ ] 20. WorkflowExecutor budgetEnforcer wired (behind feature flag)

  **What to do**:
  - In `packages/opencode-integration-layer/src/bootstrap.js`, `WorkflowExecutor` receives `budgetEnforcer: null`
  - Wire the actual budget enforcer: pass `contextGovernor` or a budget-enforcing adapter as `budgetEnforcer`
  - **CRITICAL**: Gate this behind a feature flag: `process.env.OPENCODE_BUDGET_ENFORCEMENT === 'true'` or similar
  - Default: feature flag OFF (budgetEnforcer remains null in production until tested)
  - Document the feature flag in a comment and in `.sisyphus/docs/`

  **Must NOT do**:
  - Do NOT enable budget enforcement by default without testing
  - Do NOT make budgetEnforcer fail-closed (if it throws, workflow continues)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 19, 21-26)
  - **Blocked By**: Wave 3 complete

  **References**:
  - `packages/opencode-integration-layer/src/bootstrap.js` — WorkflowExecutor instantiation
  - `packages/opencode-context-governor/src/index.js` — budget enforcer interface
  - `packages/opencode-workflow-executor/` — WorkflowExecutor and budgetEnforcer parameter

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `OPENCODE_BUDGET_ENFORCEMENT=true node -e "/* test budget enforcement path */"` — enforcer is used
  - [ ] `node -e "/* default boot */"` — budgetEnforcer still null (feature flag off)

  **Commit**: YES (grouped with Task 19)

---

- [ ] 21. Skill-failure detection added to FallbackDoctor

  **What to do**:
  - `packages/opencode-fallback-doctor/src/index.js` currently only validates chains, not individual skill failures
  - Add a method `detectSkillFailures(skillResults)` that:
    - Takes an array of skill execution results
    - Identifies skills with error responses or undefined results
    - Returns a list of failed skill IDs with failure reasons
  - Wire this method into the IntegrationLayer execution flow: after `executeTaskWithEvidence`, pass results through `detectSkillFailures`
  - Use fail-open

  **Must NOT do**:
  - Do NOT change existing FallbackDoctor chain validation logic
  - Do NOT make skill failure detection block execution

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 19, 20, 22-26)
  - **Blocked By**: Wave 3 complete

  **References**:
  - `packages/opencode-fallback-doctor/src/index.js` — existing chain validation for pattern reference
  - `packages/opencode-integration-layer/src/index.js` — execution flow post-result

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `FallbackDoctor.detectSkillFailures([{skillId:'test', error: new Error('fail')}])` returns `[{skillId:'test', reason: '...'}]`

  **Commit**: YES
  - Message: `feat(fallback-doctor): add detectSkillFailures method and wire into execution flow`

---

- [ ] 22. Consecutive-failure handler for skills (3-strike threshold)

  **What to do**:
  - Currently: skill demotion only triggers at >=10 failures in 100 (evolution-engine.js:413)
  - Add a consecutive-failure tracker to SkillRLManager or IntegrationLayer:
    - Track consecutive failures per skill in memory (Map<skillId, consecutiveCount>)
    - Reset to 0 on any success
    - After 3 consecutive failures: log warning and optionally reduce skill's weight in next selectSkills call
  - Do NOT demote to evolution tier on 3 strikes — just log warning and adjust weight temporarily

  **Must NOT do**:
  - Do NOT change evolution-engine.js:413 threshold (10/100 stays)
  - Do NOT permanently demote skills based on 3 consecutive failures alone

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 19-21, 23-26)
  - **Blocked By**: Wave 3 complete

  **References**:
  - `packages/opencode-skill-rl/src/index.js` — SkillRLManager.learnFromOutcome() — add tracking here
  - `packages/opencode-learning-engine/src/evolution-engine.js:413` — DO NOT CHANGE this threshold

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] 3 consecutive failure calls to learnFromOutcome for same skill → warning is logged

  **Commit**: YES
  - Message: `feat(skill-rl): add 3-consecutive-failure warning and temporary weight reduction`

---

- [ ] 23. taskType vs task_type field-name consistency

  **What to do**:
  - Use `ast_grep_search` to find all callsites of `SkillRLManager.selectSkills()` and `learnFromOutcome()`
  - Document which callers use `taskType` vs `task_type`
  - Choose one canonical form: `taskType` (camelCase, since JS convention) and normalize all callers
  - OR add a normalizer at the entry point: `const normalizedType = opts.taskType || opts.task_type;`
  - Fix all callsites to use the canonical form

  **Must NOT do**:
  - Do NOT change SkillRLManager method signatures
  - Do NOT break any existing callers (add backward-compat normalization if needed)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 19-22, 24-26)
  - **Blocked By**: Wave 3 complete

  **References**:
  - `packages/opencode-skill-rl/src/index.js` — selectSkills() signature
  - Use `ast_grep_search pattern="selectSkills($$$)" lang="javascript"` to find all callsites

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `grep -r "task_type" packages/ --include="*.js" --include="*.mjs"` returns 0 results (or only in comments/data files)

  **Commit**: YES
  - Message: `fix(skill-rl): normalize taskType field name consistency across all selectSkills callers`

---

- [ ] 24. SkillRL influence shape fix in ModelRouter

  **What to do**:
  - In `packages/opencode-model-router-x/src/index.js`, where SkillRL influence is applied:
    - Currently expects `recommendedModels + successRate` but SkillBank exposes `success_rate` (snake_case) and no `recommendedModels`
    - Fix the destructuring to use `success_rate` instead of `successRate`
    - If `recommendedModels` is expected but not in SkillBank, either: remove the field expectation, or add `recommendedModels: []` as default in SkillBank
  - Check `packages/opencode-skill-rl/src/skill-bank.js:189` for the actual exported shape

  **Must NOT do**:
  - Do NOT change the SkillBank storage format (only add fields if needed)
  - Do NOT change ModelRouter.route() return shape

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 19-23, 25-26)
  - **Blocked By**: Wave 3 complete

  **References**:
  - `packages/opencode-skill-rl/src/skill-bank.js:189` — actual exported shape
  - `packages/opencode-model-router-x/src/index.js` — where SkillRL influence is applied (search for `successRate` or `recommendedModels`)

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] `grep "successRate\|recommendedModels" packages/opencode-model-router-x/src/index.js` returns 0 results (or only as fallback defaults)

  **Commit**: YES
  - Message: `fix(model-router): align SkillRL influence field names with SkillBank actual shape`

---

- [ ] 25. Dashboard tool-usage breadth denominator fix

  **What to do**:
  - In `packages/opencode-dashboard/src/app/` (tool-usage route.ts at line ~97), breadth is calculated with hardcoded denominator `60`
  - Find the `AVAILABLE_TOOLS` catalog (likely in tool-usage-tracker or opencode-config) and get actual count
  - Replace hardcoded `60` with: `AVAILABLE_TOOLS.length` or import the constant
  - The actual count is ~70 per the audit

  **Must NOT do**:
  - Do NOT change the breadth calculation formula — only update the denominator source

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 19-24, 26)
  - **Blocked By**: Wave 3 complete

  **References**:
  - `packages/opencode-dashboard/src/app/` — tool-usage route.ts:97
  - `packages/opencode-learning-engine/src/tool-usage-tracker.js` — AVAILABLE_TOOLS catalog location

  **Acceptance Criteria**:
  - [ ] `bun run build` — dashboard builds successfully
  - [ ] `grep "60" packages/opencode-dashboard/src/app/` for the denominator line returns 0 results (or shows dynamic value)
  - [ ] Dashboard tool-usage breadth endpoint returns value based on ~70 denominator

  **Commit**: YES
  - Message: `fix(dashboard): use dynamic AVAILABLE_TOOLS count for breadth denominator instead of hardcoded 60`

---

- [ ] 26. PostToolUse hook params capture depth improvement

  **What to do**:
  - Currently PostToolUse hook captures `params: {}` (shallow/empty)
  - In `scripts/runtime-tool-telemetry.mjs`, the PostToolUse hook receives tool params — find where `params` is set and why it's `{}`
  - **Root cause**: the oh-my-opencode npm package in `local/` (gitignored) provides the hook payload — if params are empty there, this requires updating that package
  - **Scope limit**: If the fix requires modifying `local/oh-my-opencode` (gitignored, separate npm package), document the required change in `.sisyphus/docs/telemetry-params-fix.md` instead of implementing it directly
  - If the fix can be done in `runtime-tool-telemetry.mjs` itself (augmenting the payload from other available data), implement it there

  **Must NOT do**:
  - Do NOT assume you can modify `local/` — it's gitignored and may be an external npm package
  - Do NOT block if params remain shallow — document and move on

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 19-25)
  - **Blocked By**: Wave 3 complete

  **References**:
  - `scripts/runtime-tool-telemetry.mjs` — PostToolUse hook registration
  - `local/oh-my-opencode/` — external hook provider (read-only reference)

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] EITHER: `params` field in invocations.json is populated with actual tool parameters
  - [ ] OR: `.sisyphus/docs/telemetry-params-fix.md` created documenting the required oh-my-opencode change with exact diff to make

  **Commit**: YES
  - Message: `fix(telemetry): improve PostToolUse params capture depth or document required oh-my-opencode change`

---

- [ ] 27. 4 unconfigured plugins added to opencode.json

  **What to do**:
  - In `opencode.json` (root), find the plugins/mcpServers configuration section
  - Add entries for the 4 unconfigured plugins found in `plugins/`:
    - `rate-limit-fallback` — add with appropriate config structure
    - `notifier` — add with appropriate config structure
    - `envsitter-guard` — add with appropriate config structure
    - `safety-net` — add with appropriate config structure
  - Check each plugin's directory for a `config.json`, `info.md`, or README to determine the correct config structure

  **Must NOT do**:
  - Do NOT enable plugins that have incomplete implementations
  - Do NOT change the config structure of already-configured plugins

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 28-30)
  - **Blocked By**: Wave 4 complete

  **References**:
  - `opencode.json` — existing plugin config structure to match
  - `plugins/rate-limit-fallback/`, `plugins/notifier/`, `plugins/envsitter-guard/`, `plugins/safety-net/` — plugin directories

  **Acceptance Criteria**:
  - [ ] `bun test` — 253+ tests pass, 0 failures
  - [ ] All 4 plugins appear in `opencode.json` plugins section
  - [ ] `jq '.plugins | keys' opencode.json` (or equivalent) shows all 4 new plugin entries

  **Commit**: YES
  - Message: `fix(config): add 4 unconfigured plugins to opencode.json`

---

- [ ] 28. opencode-supermemory + opencode-beads plugin metadata stubs

  **What to do**:
  - `opencode-supermemory` and `opencode-beads` are referenced in config but have no local plugin metadata
  - Create stub metadata files for each:
    - `plugins/opencode-supermemory/info.md` — describe what the plugin does, its config options, and current status (external/cloud-dependent)
    - `plugins/opencode-beads/info.md` — same
  - Do NOT create functional implementations — stubs only for discoverability

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 27, 29, 30)
  - **Blocked By**: Wave 4 complete

  **References**:
  - `plugins/compound-engineering/info.md` — example of existing plugin metadata format (even if dead reference)
  - `opencode.json` — how supermemory and beads are configured

  **Acceptance Criteria**:
  - [ ] `plugins/opencode-supermemory/info.md` exists and describes the plugin
  - [ ] `plugins/opencode-beads/info.md` exists and describes the plugin

  **Commit**: YES (with Tasks 27-30)
  - Message: `docs(plugins): add metadata stubs for unconfigured and undocumented plugins`

---

- [ ] 29. compound-engineering/info.md dead reference documented

  **What to do**:
  - `plugins/compound-engineering/info.md` is referenced as a config file but is not an installable package spec
  - Add a comment at the top of the file: `<!-- STATUS: Dead reference. This is a config filename, not an installable package spec. See opencode.json for actual plugin configuration. -->`
  - OR move/rename if there's a more appropriate location

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 27, 28, 30)
  - **Blocked By**: Wave 4 complete

  **References**:
  - `plugins/compound-engineering/info.md` — file to annotate

  **Acceptance Criteria**:
  - [ ] `plugins/compound-engineering/info.md` contains a STATUS comment explaining it's a dead reference
  - [ ] OR the file is moved/renamed with a forwarding note

  **Commit**: YES (grouped with Tasks 27-30)

---

- [ ] 30. 5 orphaned packages — deprecation notices

  **What to do**:
  - Add a deprecation notice to the README.md of each orphaned package:
    - `packages/opencode-model-benchmark/README.md`
    - `packages/opencode-safe-io/README.md`
    - `packages/opencode-codebase-memory/README.md`
    - `packages/opencode-graphdb-bridge/README.md`
    - `packages/opencode-eval-harness/README.md`
  - Deprecation notice format:
    ```md
    ## ⚠️ DEPRECATED / ORPHANED
    This package has zero runtime callers in the integration layer as of March 2026.
    Status: Pending evaluation for removal or integration.
    Do not add new dependencies on this package without first consulting the AGENTS.md.
    ```
  - If any README doesn't exist, create it with just the deprecation notice

  **Must NOT do**:
  - Do NOT delete any code
  - Do NOT remove the packages from the workspace

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 27-29)
  - **Blocked By**: Wave 4 complete

  **References**:
  - `packages/opencode-model-benchmark/`, `packages/opencode-safe-io/`, `packages/opencode-codebase-memory/`, `packages/opencode-graphdb-bridge/`, `packages/opencode-eval-harness/` — target packages

  **Acceptance Criteria**:
  - [ ] All 5 packages have README.md with deprecation notice
  - [ ] No code deleted — `git diff --stat` shows only README.md additions

  **Commit**: YES (grouped with Tasks 27-29)
  - Message: `docs(packages): add deprecation notices to 5 orphaned packages with zero runtime callers`

---

## Deferred Items (Future PRs)

| Gap | Why Deferred | Future PR Name |
|-----|-------------|----------------|
| #21 — Central Event Bus | Architecture decision, not wiring fix | `event-bus-architecture` |
| #22 — Exploration/Exploitation Policy for Skills | New feature requiring design | `skill-exploration-policy` |
| #33 — Standalone tool-usage-tracker Package | Structural refactor, not a wiring fix | `extract-tool-usage-tracker` |

---

## Commit Strategy

| After Task(s) | Message | Key Files |
|---------------|---------|-----------|
| 0 | (tag only) | `git tag pre-wiring-fix` |
| 1, 2, 3 | `fix(bootstrap): tryLoad CircuitBreaker and store proofcheck/crashGuard in IntegrationLayer` | bootstrap.js, index.js |
| 4 | `fix(exploration-rl): align ExplorationRLAdapter to use learnFromOutcome` | exploration-adapter.js |
| 5 | `fix(memory-graph): normalize schema field names to prevent silent entry drops` | graph-builder.js |
| 6, 7 | `fix(bootstrap): add exports map entry and expose bypass packages in bootstrapStatus` | package.json, bootstrap.js |
| 8, 9, 10, 11 | `fix(routing): getLearningAdvice, learnFromOutcome, recordTokenUsage, checkContextBudget all wired` | model-router-x/index.js, index.js |
| 12, 13 | `fix(telemetry): success flag derived from actual result; detectUnderUse pipeline connected` | runtime-tool-telemetry.mjs |
| 14, 15 | `fix(events): wire AlertManager and LearningEngine event listeners in integration layer` | bootstrap.js, index.js |
| 16, 17, 18 | `fix(dashboard): shared MetricsCollector, memory-graph package API, PipelineMetrics auto-feed` | dashboard routes, index.js |
| 19, 20 | `fix(budget): evaluateBudget wired after consumeTokens; budgetEnforcer behind feature flag` | index.js, bootstrap.js |
| 21, 22 | `feat(fallback): skill-failure detection and 3-strike consecutive failure handler` | fallback-doctor, skill-rl |
| 23, 24, 25, 26 | `fix(data-quality): taskType consistency, SkillRL shape, breadth denominator, params depth` | multiple |
| 27, 28, 29, 30 | `docs(structural): plugin configs, deprecation notices, metadata stubs` | opencode.json, plugins/, packages/ |

---

## Success Criteria

### Verification Commands
```bash
# Full test suite — must pass after every individual fix
bun test
# Expected: 253+ tests, 0 failures

# Bootstrap status — all packages visible
node -e "const {getBootstrapStatus} = require('./packages/opencode-integration-layer/src/bootstrap.js'); console.log(JSON.stringify(getBootstrapStatus(), null, 2));"
# Expected: contextGovernor, memoryGraph, backupManager all present with loaded:true/false

# ModelRouter no longer throws TypeError
node -e "const {ModelRouter} = require('./packages/opencode-model-router-x/src/index.js'); const r = new ModelRouter({}); const res = r.route({taskType:'debug',sessionId:'final-check'}); console.log('PASS: modelId =', res.modelId); process.exit(res.modelId ? 0 : 1);"
# Expected: PASS with a valid modelId

# Memory graph accepts entries in old format
node -e "const {buildGraph} = require('./packages/opencode-memory-graph/src/graph-builder.js'); const r = buildGraph([{sessionId:'test',message:'err',name:'TypeError',stack:'...'}]); console.log('PASS: entries =', r.meta.total_entries); process.exit(r.meta.total_entries >= 1 ? 0 : 1);"
# Expected: PASS, entries >= 1

# ExplorationRLAdapter instantiates
node -e "try { require('./packages/opencode-exploration-rl/src/exploration-adapter.js'); console.log('importable'); } catch(e) { console.error('FAIL', e.message); process.exit(1); }"
# Expected: importable

# Dashboard builds
bun run build --prefix packages/opencode-dashboard
# Expected: build succeeds, 0 errors

# No hardcoded success:true in telemetry
grep "success: true" scripts/runtime-tool-telemetry.mjs
# Expected: 0 results

# AlertManager listeners wired
grep "\.on.*alert:" packages/opencode-integration-layer/src/bootstrap.js packages/opencode-integration-layer/src/index.js
# Expected: at least 2 matches
```

### Final Checklist
- [ ] All Must Have conditions met (bun test green, baseline established, git tagged)
- [ ] All Must NOT Have guardrails respected (no fail-closed, no signature changes)
- [ ] All 30 gaps addressed (3 deferred documented in Deferred Items section)
- [ ] All 5 waves committed with appropriate commit messages
- [ ] Evidence files in `.sisyphus/evidence/orchestration-fixes/` for critical fixes
- [ ] Deferred items documented with future PR names
