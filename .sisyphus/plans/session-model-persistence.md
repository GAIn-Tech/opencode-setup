# Session-Model Persistence Fix

## TL;DR
> **Quick Summary**: Implement sticky session-model persistence to prevent random model switching mid-execution. Once a model is selected for a session, it remains assigned until the session ends, the model fails health checks, or the user explicitly switches.
>
> **Deliverables**:
> - SQLite `session_models` table for persistence
> - Modified `route()` method with sticky model check
> - Session-model registry service
> - Configuration option `routing.stickySessions: boolean`
> - Health/budget bypass logic
> - Sticky model cleanup with TTL
>
> **Estimated Effort**: Medium (2-3 hours)
> **Parallel Execution**: NO - sequential dependencies
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4

---

## Context

### Original Request
User reported that the primary orchestrator randomly switches models mid-execution. After user selects a model, subsequent turns lose the selection and fall back to default model selection (Thompson sampling, scoring, jitter).

### Root Cause Analysis
The model router (`packages/opencode-model-router-x/src/index.js`) re-evaluates model selection on every request:
1. No session-model persistence exists
2. `route()` method runs full selection logic each time
3. Thompson sampling, jitter, and scoring cause different model picks per turn
4. `ctx.sessionId` is passed but never used to look up a previously selected model

### Key Findings
- **Line 783-850**: `route()` method is the entry point for model selection
- **Line 816-830**: `ctx.overrideModelId` bypass exists but is for explicit overrides, not session persistence
- **Exploration Controller**: Uses Thompson sampling for exploration/exploitation tradeoff
- **Health Filtering**: `_filterByHealth()` filters unavailable models (line 844)
- **Budget Tracking**: Context Governor tracks per-model budgets

---

## Work Objectives

### Core Objective
Implement session-model persistence that "sticks" a model to a session once selected, preventing random switching while allowing health failures and explicit overrides to trigger re-selection.

### Concrete Deliverables
1. SQLite schema: `session_models` table with session_id, model_id, timestamps
2. SessionModelRegistry service in opencode-model-router-x
3. Modified `route()` method with sticky model check (lines 783-850)
4. Health/budget bypass logic for sticky models
5. Cleanup mechanism for stale session mappings (TTL-based)
6. Configuration: `routing.stickySessions: boolean` in opencode.json

### Definition of Done
- [ ] First request to `route()` with new session_id runs selection and stores result
- [ ] Second request with same session_id returns same model without re-selection
- [ ] Sticky model fails health check → runs normal selection
- [ ] Sticky model exceeds budget → runs normal selection
- [ ] Stale sessions (TTL expired) are cleaned up
- [ ] `reason: 'sticky:session'` appears in routing logs

### Must Have
- Session-model persistence via SQLite
- Health check bypass for sticky models
- Budget check bypass for sticky models
- TTL-based cleanup for stale sessions

### Must NOT Have (Guardrails)
- **NO** per-category stickiness (keep it global per session)
- **NO** provider-level stickiness (stick to modelId only)
- **NO** circular dependencies between router and sisyphus-state
- **NO** hard-coded TTL (must be configurable)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: YES (Tests after)
- **Framework**: bun test

### Agent-Executed QA Scenarios (MANDATORY)

**Scenario 1: Sticky Model Persistence**
Tool: Bash (bun test)
Preconditions: Dev server running, clean database
Steps:
1. Call `router.route({sessionId: 'test-session-1', prompt: 'Hello'})`
2. Assert: Returns model with `reason: 'exploration:best-known'` or similar
3. Call `router.route({sessionId: 'test-session-1', prompt: 'Again'})` again
4. Assert: Returns SAME model_id as first call
5. Assert: `reason: 'sticky:session'` in response
Expected Result: Second call returns same model without re-selection
Evidence: Test output captured

**Scenario 2: Health Check Bypass**
Tool: Bash (bun test)
Preconditions: Session has sticky model, model becomes unhealthy
Steps:
1. Create session with sticky model
2. Simulate model health failure (circuit breaker)
3. Call `router.route()` with same session
4. Assert: Runs normal selection (new model)
5. Assert: New model stored in registry
Expected Result: Unhealthy sticky model triggers re-selection
Evidence: Test output captured

**Scenario 3: Budget Check Bypass**
Tool: Bash (bun test)
Preconditions: Session has sticky model, budget exhausted
Steps:
1. Create session with sticky model
2. Exhaust budget for that model
3. Call `router.route()` with same session
4. Assert: Runs normal selection (different model)
5. Assert: New model stored in registry
Expected Result: Budget-exceeded sticky model triggers re-selection
Evidence: Test output captured

**Scenario 4: Explicit Override Bypasses Sticky**
Tool: Bash (bun test)
Preconditions: Session has sticky model
Steps:
1. Create session with sticky model 'model-a'
2. Call `router.route({sessionId: 'test', overrideModelId: 'model-b'})`
3. Assert: Returns 'model-b' (not the sticky model)
4. Assert: `reason: 'override:modelId'` in response
Expected Result: Explicit override takes precedence over sticky
Evidence: Test output captured

**Scenario 5: TTL Cleanup**
Tool: Bash (bun test)
Preconditions: Session with sticky model exists, TTL expired
Steps:
1. Create session with sticky model
2. Wait for TTL expiration (or mock clock)
3. Trigger cleanup job
4. Query database for session
5. Assert: Session record deleted
Expected Result: Stale sessions cleaned up
Evidence: Test output captured

---

## Execution Strategy

### Parallel Execution Waves
```
Wave 1 (Start Immediately):
├── Task 1: Create SQLite schema for session_models table
└── Task 2: Create SessionModelRegistry service

Wave 2 (After Wave 1):
└── Task 3: Modify route() method with sticky logic

Wave 3 (After Wave 2):
└── Task 4: Add cleanup mechanism and configuration

Critical Path: Task 1 → Task 2 → Task 3 → Task 4
Parallel Speedup: ~15% (mostly sequential due to dependencies)
```

### Dependency Matrix
| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2 | None |
| 2 | 1 | 3 | None |
| 3 | 2 | 4 | None |
| 4 | 3 | None | None |

---

## TODOs

### Task 1: Create SQLite Schema for session_models

**What to do**:
- Add `session_models` table to `opencode-sisyphus-state` database
- Schema: session_id (TEXT PRIMARY KEY), model_id (TEXT NOT NULL), created_at, last_used_at
- Use WAL mode and busy_timeout like existing tables
- Create migration if using migrations

**Must NOT do**:
- Do NOT create circular dependency between router and sisyphus-state
- Do NOT use JSON files for persistence (use SQLite)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: `database-design`, `clean-architecture`
- `database-design`: SQLite schema design, WAL mode, migrations
- `clean-architecture`: Proper separation of concerns, interface design
- **Skills Evaluated but Omitted**:
  - `postgresql-optimization`: Not needed (using SQLite)

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: Task 2
- **Blocked By**: None

**References**:
- `packages/opencode-sisyphus-state/src/database.js` - Existing SQLite setup
- `packages/opencode-sisyphus-state/src/schema.sql` - Schema patterns
- `packages/opencode-context-governor/src/index.js` - Debounced write pattern

**Acceptance Criteria**:
- [ ] Table exists in `.sisyphus-state.db`
- [ ] `PRAGMA journal_mode = WAL` set
- [ ] `busy_timeout = 5000` set
- [ ] Can insert and query session-model mappings

**Agent-Executed QA Scenarios**:
```
Scenario: SQLite schema creation
Tool: Bash
Preconditions: Clean database
Steps:
1. Run migration or schema creation
2. Query: `SELECT name FROM sqlite_master WHERE type='table'`
3. Assert: 'session_models' in results
4. Query table schema
5. Assert: Columns: session_id, model_id, created_at, last_used_at
Expected Result: Table created with correct schema
Evidence: SQL query output
```

**Commit**: YES
- Message: `feat(state): add session_models table for sticky model persistence`
- Files: `packages/opencode-sisyphus-state/src/schema.sql`, database migration
- Pre-commit: `bun test packages/opencode-sisyphus-state/`

---

### Task 2: Create SessionModelRegistry Service

**What to do**:
- Create `SessionModelRegistry` class in `opencode-model-router-x`
- Methods: `get(sessionId)`, `set(sessionId, modelId)`, `delete(sessionId)`, `cleanup(ttl)`
- Use SQLite via dependency injection (don't hardcode sisyphus-state)
- Handle concurrent access with transactions

**Must NOT do**:
- Do NOT add direct import of opencode-sisyphus-state
- Do NOT use in-memory Map (data must survive restarts)
- Do NOT skip transaction safety

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: `clean-architecture`, `database-design`
- `clean-architecture`: Interface-based persistence
- `database-design`: Transaction safety, concurrent access
- **Skills Evaluated but Omitted**:
  - `event-sourcing`: Not needed for simple CRUD

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: Task 3
- **Blocked By**: Task 1

**References**:
- `packages/opencode-model-router-x/src/index.js:1-50` - Class structure patterns
- `packages/opencode-sisyphus-state/src/workflow-store.js` - SQLite access patterns
- `packages/opencode-context-governor/src/index.js:150-200` - Transaction handling

**Acceptance Criteria**:
- [ ] `SessionModelRegistry` class exists
- [ ] `get()` returns modelId for existing session
- [ ] `get()` returns null for non-existent session
- [ ] `set()` stores mapping with timestamps
- [ ] `delete()` removes mapping
- [ ] Concurrent calls don't corrupt data

**Agent-Executed QA Scenarios**:
```
Scenario: Registry CRUD operations
Tool: Bash (bun test)
Preconditions: Registry initialized with test database
Steps:
1. registry.set('session-1', 'model-a')
2. const model = registry.get('session-1')
3. Assert: model === 'model-a'
4. registry.delete('session-1')
5. const deleted = registry.get('session-1')
6. Assert: deleted === null
Expected Result: CRUD operations work correctly
Evidence: Test output

Scenario: Concurrent access safety
Tool: Bash (bun test)
Preconditions: Registry with SQLite
Steps:
1. Promise.all([
2.   registry.set('session-1', 'model-a'),
3.   registry.set('session-1', 'model-b'),
4.   registry.get('session-1')
5. ])
6. Assert: No SQLite errors
7. Assert: Final state is consistent
Expected Result: Concurrent access handled safely
Evidence: Test output
```

**Commit**: YES
- Message: `feat(router): add SessionModelRegistry for sticky model tracking`
- Files: `packages/opencode-model-router-x/src/session-model-registry.js`
- Pre-commit: `bun test packages/opencode-model-router-x/`

---

### Task 3: Modify route() Method with Sticky Logic

**What to do**:
- Modify `packages/opencode-model-router-x/src/index.js:783-850`
- Add sticky model check AFTER `ctx.overrideModelId` check (line 830)
- BEFORE exploration controller (line 786)
- Check registry for session's model
- Verify model health via `_filterByHealth()`
- Verify budget via Context Governor
- Return sticky model with `reason: 'sticky:session'`
- If no sticky model or bypass triggered, run normal selection and store result

**Must NOT do**:
- Do NOT check sticky before overrideModelId (override must take precedence)
- Do NOT skip health/budget checks for sticky models
- Do NOT modify exploration controller behavior
- Do NOT break existing category selection logic

**Recommended Agent Profile**:
- **Category**: `ultrabrain`
- **Skills**: `systematic-debugging`, `clean-architecture`
- `systematic-debugging`: Careful modification of critical path
- `clean-architecture`: Maintain clear separation of concerns
- **Skills Evaluated but Omitted**:
  - `performance-testing`: Not critical for this change

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: Task 4
- **Blocked By**: Task 2

**References**:
- `packages/opencode-model-router-x/src/index.js:783-850` - route() method
- `packages/opencode-model-router-x/src/index.js:816-830` - overrideModelId handling
- `packages/opencode-model-router-x/src/index.js:840-844` - _filterByHealth() call
- `packages/opencode-model-router-x/src/dynamic-exploration-controller.js` - Exploration controller

**Acceptance Criteria**:
- [ ] First request with new session runs selection and stores
- [ ] Second request returns same model with `reason: 'sticky:session'`
- [ ] overrideModelId still takes precedence
- [ ] Unhealthy sticky model triggers re-selection
- [ ] Budget-exceeded sticky model triggers re-selection
- [ ] Category selection still works when no sticky model

**Agent-Executed QA Scenarios**:
```
Scenario: Sticky model persistence
Tool: Bash (bun test)
Preconditions: Router with registry, clean state
Steps:
1. result1 = router.route({sessionId: 's1', prompt: 'test'})
2. result2 = router.route({sessionId: 's1', prompt: 'test'})
3. Assert: result1.modelId === result2.modelId
4. Assert: result1.reason contains 'exploration' or 'best-known'
5. Assert: result2.reason === 'sticky:session'
Expected Result: Second call returns sticky model
Evidence: Test assertions output

Scenario: Override bypasses sticky
Tool: Bash (bun test)
Preconditions: Session with sticky model
Steps:
1. router.route({sessionId: 's1', prompt: 'test'}) // Sets sticky
2. result = router.route({sessionId: 's1', overrideModelId: 'other-model'})
3. Assert: result.modelId === 'other-model'
4. Assert: result.reason === 'override:modelId'
Expected Result: Override takes precedence
Evidence: Test assertions output

Scenario: Health failure triggers re-selection
Tool: Bash (bun test)
Preconditions: Session with sticky model, model unhealthy
Steps:
1. Create session with model-a
2. Simulate circuit breaker for model-a (unhealthy)
3. result = router.route({sessionId: 's1', prompt: 'test'})
4. Assert: result.modelId !== 'model-a'
5. Assert: result.reason contains 'exploration' or 'best-known'
Expected Result: Unhealthy sticky bypassed
Evidence: Test assertions output
```

**Commit**: YES
- Message: `feat(router): implement sticky session-model persistence in route()`
- Files: `packages/opencode-model-router-x/src/index.js`
- Pre-commit: `bun test packages/opencode-model-router-x/`

---

### Task 4: Add Cleanup Mechanism and Configuration

**What to do**:
- Add `cleanup()` method to SessionModelRegistry with TTL logic
- Schedule periodic cleanup job (e.g., every hour)
- Add `routing.stickySessions: boolean` to `opencode-config/opencode.json`
- Add `routing.stickySessionTTL: number` (hours, default 24)
- Respect configuration: if `stickySessions: false`, skip all sticky logic
- Update `last_used_at` on each access

**Must NOT do**:
- Do NOT hardcode TTL value
- Do NOT skip cleanup (will cause database bloat)
- Do NOT add sticky logic when config is disabled
- Do NOT use setInterval (use proper scheduling)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: `clean-architecture`, `database-design`
- `clean-architecture`: Configuration pattern
- `database-design`: TTL-based cleanup, indexed queries
- **Skills Evaluated but Omitted**:
  - `microservices-patterns`: Not needed

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: None (final task)
- **Blocked By**: Task 3

**References**:
- `packages/opencode-context-governor/src/index.js` - Cleanup scheduling pattern
- `packages/opencode-config/opencode.json` - Configuration structure
- `packages/opencode-model-router-x/src/index.js:1-50` - Config loading pattern

**Acceptance Criteria**:
- [ ] `cleanup(ttl)` method exists and deletes expired sessions
- [ ] Periodic cleanup job runs (hourly)
- [ ] `routing.stickySessions: true` enables feature
- [ ] `routing.stickySessions: false` disables feature
- [ ] `routing.stickySessionTTL: 24` sets TTL in hours
- [ ] `last_used_at` updated on each access

**Agent-Executed QA Scenarios**:
```
Scenario: TTL cleanup removes expired sessions
Tool: Bash (bun test)
Preconditions: Sessions with various ages
Steps:
1. Create session with created_at 48 hours ago
2. Create session with created_at 12 hours ago
3. Call registry.cleanup(ttl=24 hours)
4. const old = registry.get('old-session')
5. const recent = registry.get('recent-session')
6. Assert: old === null
7. Assert: recent !== null
Expected Result: Expired sessions cleaned up, recent kept
Evidence: Test assertions output

Scenario: Configuration disables sticky behavior
Tool: Bash (bun test)
Preconditions: Router with stickySessions: false
Steps:
1. Set config.routing.stickySessions = false
2. result1 = router.route({sessionId: 's1'})
3. result2 = router.route({sessionId: 's1'})
4. Assert: result1.reason and result2.reason both NOT 'sticky:session'
Expected Result: Sticky disabled, normal selection each time
Evidence: Test assertions output
```

**Commit**: YES
- Message: `feat(router): add sticky session cleanup and configuration options`
- Files: `packages/opencode-model-router-x/src/session-model-registry.js`, `opencode-config/opencode.json`
- Pre-commit: `bun test packages/opencode-model-router-x/`

---

## Success Criteria

### Verification Commands
```bash
# Run all model-router tests
bun test packages/opencode-model-router-x/

# Expected: All tests pass, including new sticky session tests

# Verify sticky behavior manually
bun run scripts/test-sticky-session.mjs

# Expected: Session persists model across multiple calls
```

### Final Checklist
- [ ] `session_models` table exists with correct schema
- [ ] `SessionModelRegistry` service created with CRUD operations
- [ ] `route()` method checks sticky before exploration
- [ ] Health failures trigger re-selection
- [ ] Budget failures trigger re-selection
- [ ] overrideModelId takes precedence over sticky
- [ ] Cleanup job removes expired sessions
- [ ] Configuration options work (enable/disable, TTL)
- [ ] `reason: 'sticky:session'` appears in routing logs
- [ ] All existing tests still pass
- [ ] New tests for sticky behavior pass

---

## Notes for Implementation

### Critical Path Considerations
The `route()` method is called on EVERY request. Any slowdown here affects system performance:
- SQLite lookup for sticky model: O(1) with indexed session_id
- Health check: Already happening, no new cost
- Budget check: Already happening, no new cost

Overall impact: ~1-2ms per request (acceptable)

### Testing Strategy
1. Unit tests for SessionModelRegistry (CRUD, concurrency)
2. Integration tests for route() sticky logic
3. Mock health/budget failures to test bypass
4. Edge cases: null sessionId, missing model in config, etc.

### Rollback Plan
If issues arise:
1. Set `routing.stickySessions: false` in config
2. Restart router (feature disabled)
3. Investigate and fix
4. Re-enable when ready
