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

### Task 1: Fix Remaining Namespace Drift
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

### Task 2: Fix Missing opencode-logger Context Export
**Problem:** test/context.test.js exists but verify src/context.js exports

**Verify:**
- `packages/opencode-logger/src/context.js` exports `withCorrelationId` and `getCorrelationId`
- Tests pass

**Commit:** `fix(logger): ensure context.js exports are complete`

---

### Task 3: Verify All Package Exports Have References
**Problem:** Some exports may be orphaned

**Check:**
```bash
# For each package src/index.js, verify exports are imported elsewhere
```

**Remove or deprecate true orphans**

**Commit:** `chore: remove orphaned exports`

---

## Wave 8B: Critical Test Coverage

### Task 4: Add Tests for Dashboard Routes
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

### Task 5: Add Tests for Model Router Tier Selection
**Problem:** `tier-router.js` logic untested

**Create:** `packages/opencode-model-router-x/test/tier-router.test.js`

**Test:**
- Tier selection under different conditions
- Cost-based routing
- Fallback behavior

**Commit:** `test(model-router): add tier selection regression tests`

---

### Task 6: Add Tests for Learning Engine Core Decay Rules
**Problem:** Core persistence weighting rules untested

**Create:** `packages/opencode-learning-engine/test/core-decay.test.js`

**Test:**
- `getAdaptiveWeight` behavior
- `markAsCore` persistence
- Decay vs non-decay

**Commit:** `test(learning-engine): add core decay rule tests`

---

### Task 7: Add Tests for Memory Graph Operations
**Problem:** `backfill.js` and graph operations untested

**Create:** `packages/opencode-memory-graph/test/graph-operations.test.js`

**Test:**
- Graph building
- Backfill logic
- Memory operations

**Commit:** `test(memory-graph): add graph operations tests`

---

## Wave 8C: Documentation

### Task 8: Add READMEs to Remaining Critical Packages
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

### Task 9: Add JSDoc to Undocumented Public APIs
**Problem:** 4+ exported functions missing JSDoc

**Add to:**
- `createFeatureFlags()` in feature-flags
- `createPyodideSandbox()` in model-benchmark
- `collectCorrelationData()` in dashboard
- `evaluatePolicyEngine()` in dashboard

**Commit:** `docs: add JSDoc to undocumented public APIs`

---

### Task 10: Document Dashboard API Routes
**Problem:** 31 routes without endpoint docs

**Create:** `packages/opencode-dashboard/API.md`

**Document:**
- GET /api/config
- GET /api/learning
- POST /api/orchestration
- etc.

**Include:** Method, auth requirements, request/response shapes

**Commit:** `docs(dashboard): add API endpoint documentation`

---

## Wave 8D: Performance Optimization

### Task 11: Add Size Guards to JSON.parse
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

### Task 12: Convert Dashboard Sync I/O to Async
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

### Task 13: Add Iteration Cap to Thompson Sampling
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
- [ ] Implementation matches spec
- [ ] Tests added/regression tests pass
- [ ] `bun test` full suite passes
- [ ] Commit with Learning-Update trailer
- [ ] LSP diagnostics clean

---

## Plan Metadata

**Created:** 2026-02-25
**Based on:** Post-Wave 7 System Assessment
**Total Tasks:** 13
**Estimated Duration:** 2-3 hours
**Estimated Risk Points:** ~200
