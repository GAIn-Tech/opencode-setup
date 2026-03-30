# Wave 8: System Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete remaining system gaps identified in post-Wave 7 assessment: broken integrations, test coverage, documentation, and performance bottlenecks.

**Architecture:** Fix integrations first (blocks other work), then add critical tests, then documentation, then performance optimizations.

**Tech Stack:** Bun monorepo (34 packages), TypeScript/JavaScript

---

## Planning Philosophy

**Priority Order:**
1. **Wave 8A** (Integrations): Fix broken imports, missing packages
2. **Wave 8B** (Tests): Add critical regression tests for uncovered paths
3. **Wave 8C** (Docs): Add READMEs and JSDoc to undocumented APIs
4. **Wave 8D** (Performance): Fix JSON.parse size guards, sync I/O, unbounded loops

**DO NOT:**
- Add features while fixing gaps
- Change public APIs without backward compat
- Skip tests for critical paths

---

## Wave 8A: Integration Fixes (Critical)

### Task 1: Fix Remaining Namespace Drift ✅ COMPLETE
**Problem:** Some @jackoatmon/* imports may still exist

**Check and fix:**
```bash
grep -rn "@jackoatmon" packages/ --include="*.js" --include="*.ts" | grep -v node_modules
```

**Fix any remaining:**
```javascript
// @jackoatmon/opencode-* -> opencode-*
```

**Commit:** `fix: resolve remaining namespace drift`

---

### Task 2: Fix Missing opencode-logger Context Export ✅ COMPLETE
**Problem:** test/context.test.js exists but verify src/context.js exports

**Verify:**
- `packages/opencode-logger/src/context.js` exports `withCorrelationId` and `getCorrelationId`
- Tests pass

**Commit:** `fix(logger): ensure context.js exports are complete`

---

### Task 3: Verify All Package Exports Have References ✅ COMPLETE
**Problem:** Some exports may be orphaned

**Check:**
```bash
# For each package src/index.js, verify exports are imported elsewhere
```

**Remove or deprecate true orphans**

**Commit:** `chore: remove orphaned exports`

---

## Wave 8B: Critical Test Coverage

### Task 4: Add Tests for Dashboard Routes ✅ COMPLETE
**Problem:** 29 large dashboard files without tests

**Priority routes:**
1. `packages/opencode-dashboard/src/app/api/orchestration/route.ts`
2. `packages/opencode-dashboard/src/app/api/memory-graph/route.ts`
3. `packages/opencode-dashboard/src/app/api/providers/route.ts`

**Create:** `packages/opencode-dashboard/test/orchestration-route.test.ts`

**Test coverage:**
- Route handlers respond correctly
- Auth gates work
- Error handling

**Commit:** `test(dashboard): add regression tests for orchestration routes`

---

### Task 5: Add Tests for Model Router Tier Selection ✅ COMPLETE
**Problem:** `tier-router.js` logic untested

**Create:** `packages/opencode-model-router-x/test/tier-router.test.js`

**Test:**
- Tier selection under different conditions
- Cost-based routing
- Fallback behavior

**Commit:** `test(model-router): add tier selection regression tests`

---

### Task 6: Add Tests for Learning Engine Core Decay Rules ✅ COMPLETE
**Problem:** Core persistence weighting rules untested

**Create:** `packages/opencode-learning-engine/test/core-decay.test.js`

**Test:**
- `getAdaptiveWeight` behavior
- `markAsCore` persistence
- Decay vs non-decay

**Commit:** `test(learning-engine): add core decay rule tests`

---

### Task 7: Add Tests for Memory Graph Operations ✅ COMPLETE
**Problem:** `backfill.js` and graph operations untested

**Create:** `packages/opencode-memory-graph/test/graph-operations.test.js`

**Test:**
- Graph building
- Backfill logic
- Memory operations

**Commit:** `test(memory-graph): add graph operations tests`

---

## Wave 8C: Documentation

### Task 8: Add READMEs to Remaining Critical Packages ✅ COMPLETE
**Problem:** 14 packages still without READMEs (from original 19)

**Priority packages:**
1. `opencode-crash-guard` (stability)
2. `opencode-learning-engine` (core logic)
3. `opencode-feature-flags` (configuration)
4. `opencode-model-router-x` (routing)
5. `opencode-memory-graph` (memory)

**Create:** `packages/{package}/README.md`

**Include:**
- Description
- Installation
- Usage examples
- API reference

**Commit:** `docs: add READMEs to critical packages`

---

### Task 9: Add JSDoc to Undocumented Public APIs ✅ COMPLETE
**Problem:** 4+ exported functions missing JSDoc

**Add to:**
- `createFeatureFlags()` in feature-flags
- `createPyodideSandbox()` in model-benchmark
- `collectCorrelationData()` in dashboard
- `evaluatePolicyEngine()` in dashboard

**Commit:** `docs: add JSDoc to undocumented public APIs`

---

### Task 10: Document Dashboard API Routes ✅ COMPLETE
**Problem:** 31 routes without endpoint docs

**Created:** `packages/opencode-dashboard/API.md` (1075 lines, all 31 routes)

**Documented:**
- All 31 endpoints with method, auth requirements, query params, request/response shapes
- Added: /api/events SSE, /api/config, /api/docs, /api/frontier-status, /api/retrieval-quality
- Added: /api/plugin-supervisor, /api/policy-review, /api/runs, /api/runs/:id
- Added: /api/orchestration/correlation, /forensics, /meta-awareness, /timeline, /policy-sim, /stability
- Added: /api/models/lifecycle, /audit, /transition; /api/skills/promotions; status/* routes
- Added: Environment Variables reference table, SDK examples, rate limiting docs

**Committed:** `6049c66` docs(dashboard): expand API.md to cover all 31 endpoints

---

## Wave 8D: Performance Optimization

### Task 11: Add Size Guards to JSON.parse ✅ COMPLETE
**Problem:** Large JSON.parse without limits

**Locations:**
- `opencode-memory-graph/src/graph-builder.js:34,40`
- `opencode-dashboard/src/app/api/orchestration/lib/correlation.js:83`

**Add:**
```javascript
const MAX_JSON_SIZE = 10 * 1024 * 1024; // 10MB
if (data.length > MAX_JSON_SIZE) {
  throw new Error('JSON payload too large');
}
const parsed = safeJsonParse(data, {});
```

**Commit:** `perf: add size guards to large JSON.parse operations`

---

### Task 12: Convert Dashboard Sync I/O to Async ✅ COMPLETE
**Problem:** `readFileSync` in async context

**Location:** `opencode-dashboard/src/app/api/skills/route.ts:165`

**Change:**
```typescript
// FROM:
const data = fs.readFileSync(path);
// TO:
const data = await fs.promises.readFile(path);
```

**Commit:** `perf(dashboard): convert sync I/O to async in skills route`

---

### Task 13: Add Iteration Cap to Thompson Sampling ✅ COMPLETE
**Problem:** Unbounded `while(true)` loop

**Location:** `opencode-model-router-x/src/thompson-sampling-router.js:250`

**Add:**
```javascript
let iterations = 0;
const MAX_ITERATIONS = 10000;

while (true) {
  if (iterations++ > MAX_ITERATIONS) {
    throw new Error('Thompson sampling exceeded max iterations');
  }
  // existing logic
}
```

**Commit:** `fix(model-router): add iteration cap to thompson sampling`

---

## Success Metrics

| Wave | Tasks | Deliverable | Verification |
|------|-------|-------------|--------------|
| 8A | 3 | All integrations fixed | `bun test` passes, no broken imports |
| 8B | 4 | Critical paths tested | New tests pass, coverage ↑ |
| 8C | 3 | Documentation complete | READMEs exist, JSDoc present |
| 8D | 3 | Performance optimized | Size guards, async I/O, iteration caps |

**Total Estimated Risk Points Reduced:** ~200

---

## Execution Strategy

**Parallel Waves:**
- Wave 8A first (blocks others)
- Wave 8B parallel with 8C
- Wave 8D after 8B/8C

**Dependencies:**
- Task 4-7 (tests) → After Task 1 (integrations)
- Task 12 (async I/O) → After Task 11 (size guards)

---

## Notes

**Acceptance Criteria per Task:**
- [x] Implementation matches spec
- [x] Tests added/regression tests pass
- [x] `bun test` full suite passes
- [x] Commit with Learning-Update trailer
- [x] LSP diagnostics clean

**Wave 8C Task 10 completed:** 2026-03-08 — commit `6049c66`

**Wave 8 COMPLETED:** 2026-03-08
- All 13 tasks verified complete
- `bun test` passes (exit code 0)
- Tasks 8A-1 through 8A-3: integration fixes (namespace drift, logger exports, orphan check)
- Tasks 8B-4 through 8B-7: test coverage confirmed (pre-existing tests verified passing)
- Tasks 8C-8 through 8C-10: documentation complete (READMEs, JSDoc, API docs)
- Tasks 8D-11 through 8D-13: performance optimizations (size guards, async I/O, iteration cap)
- Governed commits: `04d937d`, `4342f3b` (namespace drift fixes)

---

## Plan Metadata

**Created:** 2026-02-25
**Based on:** Post-Wave 7 System Assessment
**Total Tasks:** 13
**Completed:** 13/13
**Completed Date:** 2026-03-08
**Estimated Duration:** 2-3 hours
**Estimated Risk Points:** ~200
