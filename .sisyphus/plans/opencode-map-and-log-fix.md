# OpenCode Map Bounds & Console.log Fix Implementation Plan

## TL;DR

> **Quick Summary**: Fix memory leaks from unbounded Maps in retry/token managers and remove console.log statements from production code.
>
> **Deliverables**:
> - Map eviction logic in `subagent-retry-manager.js`
> - Map eviction logic in `token-budget-manager.js`
> - Remove console.log from 4 production files
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - Tasks 1-4 can run in parallel
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### User Request
Debug subagent delegation (system issue - out of scope), then fix Map bounds and console.log issues.

### Analysis Summary

| Issue | File | Line(s) | Status |
|-------|------|---------|--------|
| Unbounded `#failureCounts` Map | `subagent-retry-manager.js` | 65 | HIGH RISK - grows indefinitely |
| Unbounded `#failurePatternCounts` Map | `subagent-retry-manager.js` | 66 | HIGH RISK - grows indefinitely |
| Unbounded `velocityMap` | `token-budget-manager.js` | 17 | HIGH RISK - never cleaned |
| console.log leak | `subagent-retry-manager.js` | 174 | MEDIUM |
| console.log leak | `token-budget-manager.js` | 34 | MEDIUM |
| console.log leak | `telemetry-observer.js` | 32 | MEDIUM |
| console.log leak | `metrics-collector.js` | 306 | MEDIUM |
| Subagent delegation | (system) | N/A | OUT OF SCOPE - system bug |

### Compression Callbacks Status
✅ ALREADY WIRED - No work needed:
- Governor `onErrorThreshold()` called at 80% threshold (line 160)
- ContextBridge `onCompress` called at 80% threshold (line 150)

---

## Work Objectives

### Core Objective
Fix memory leaks and remove production debug logging.

### Must Have
- Maps in retry manager auto-evict entries older than `unstableWindowMs` (5 min)
- Maps in token budget manager auto-evict entries older than 10 minutes
- No console.log/console.warn in production paths

### Must NOT Have
- Don't break existing API contracts
- Don't remove test file console.log statements
- Don't touch the parser.js file (nodesByName is function-scoped, not a leak)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (All Independent):
├── Task 1: Fix subagent-retry-manager.js Maps + console.log
├── Task 2: Fix token-budget-manager.js Map + console.log
├── Task 3: Remove console.log from telemetry-observer.js
└── Task 4: Remove console.log from metrics-collector.js
```

---

## TODOs

- [x] 1. Fix unbounded Maps + console.log in subagent-retry-manager.js

  **What to do**:
  - Add eviction logic to `#failureCounts` and `#failurePatternCounts` Maps
  - On each recordFailure/recordSuccess call, iterate and remove entries older than `unstableWindowMs` (5 min)
  - Remove console.log at line 174 (prediction logging)
  - Keep console.warn (intentional warning for ops)

  **Pattern for Map eviction**:
  ```javascript
  // At start of recordFailure/recordSuccess
  const now = Date.now();
  for (const [key, value] of this.#failureCounts) {
    if (now - value.lastFailure > this.#options.unstableWindowMs) {
      this.#failureCounts.delete(key);
    }
  }
  // Same for #failurePatternCounts with predictiveWindowMs
  ```

  **Acceptance Criteria**:
  - [x] Map eviction runs on each recordFailure/recordSuccess
  - [x] Entries older than 5 minutes are removed
  - [x] Line 174 console.log removed
  - [x] console.warn at line 98 kept (intentional ops alert)

  **References**:
  - `packages/opencode-model-router-x/src/subagent-retry-manager.js:65-107`

- [x] 2. Fix unbounded Map + console.log in token-budget-manager.js

  **What to do**:
  - Add eviction logic to `velocityMap`
  - Remove entries older than 10 minutes on each recordUsage
  - Remove console.log at line 34

  **Pattern for Map eviction**:
  ```javascript
  // At start of recordUsage
  const now = Date.now();
  for (const [key, state] of this.velocityMap) {
    if (now - state.lastTimestamp > 10 * 60 * 1000) {
      this.velocityMap.delete(key);
    }
  }
  ```

  **Acceptance Criteria**:
  - [x] Map eviction runs on each recordUsage
  - [x] Entries older than 10 minutes are removed
  - [x] Line 34 console.log removed

  **References**:
  - `packages/opencode-model-router-x/src/token-budget-manager.js:17-90`

- [x] 3. Remove console.log from telemetry-observer.js

  **What to do**:
  - Remove console.log at line 32
  - Verify this is production code (not test file)

  **Acceptance Criteria**:
  - [x] Line 32 console.log removed
  - [x] File still imports/exports correctly

  **References**:
  - `packages/opencode-event-bus/src/telemetry-observer.js:32`

- [x] 4. Remove console.log from metrics-collector.js

  **What to do**:
  - Remove console.log at line 306
  - Verify this is production code (not test file)

  **Acceptance Criteria**:
  - [x] Line 306 console.log removed
  - [x] File still imports/exports correctly

  **References**:
  - `packages/opencode-model-manager/src/monitoring/metrics-collector.js:306`

---

## Files to Modify

| Task | File | Changes |
|------|------|---------|
| 1 | `packages/opencode-model-router-x/src/subagent-retry-manager.js` | Add Map eviction logic, remove line 174 |
| 2 | `packages/opencode-model-router-x/src/token-budget-manager.js` | Add Map eviction logic, remove line 34 |
| 3 | `packages/opencode-event-bus/src/telemetry-observer.js` | Remove line 32 |
| 4 | `packages/opencode-model-manager/src/monitoring/metrics-collector.js` | Remove line 306 |

---

## Success Criteria

### Verification Commands
```bash
# Verify no console.log in production files
grep -r "console\.log(" packages/opencode-model-router-x/src/
grep -r "console\.log(" packages/opencode-event-bus/src/
grep -r "console\.log(" packages/opencode-model-manager/src/monitoring/

# Run tests to ensure no breakage
bun test packages/opencode-model-router-x/
```

### Final Checklist
- [ ] All 3 Maps have eviction logic
- [ ] All 4 console.log statements removed
- [ ] Tests pass
- [ ] No new console.warn introduced
