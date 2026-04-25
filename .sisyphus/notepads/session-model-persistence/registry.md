# SessionModelRegistry - Task 2 Findings

## Implementation Summary

- Added `SessionModelRegistry` at `packages/opencode-model-router-x/src/session-model-registry.js`.
- Added router integration in `packages/opencode-model-router-x/src/index.js`:
  - imports `SessionModelRegistry`
  - initializes `this.sessionModelRegistry` in constructor via dependency injection
  - exports `SessionModelRegistry` from package entrypoint

## Design Decisions

- **Dependency injection only**: registry accepts an injected db handle (`db`, `db.db`, `workflowStore`) and does not import `opencode-sisyphus-state`.
- **Fail-open error handling**: every public method catches database/runtime errors and returns safe values instead of throwing.
- **Parameterized SQL**: all SQL calls use placeholders (`?`) for `sessionId`, `modelId`, and TTL.
- **Transaction safety**:
  - prefers native `db.transaction(...)` when available
  - falls back to `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` when needed
- **Prepared statement reuse**: statements cached in a local map for repeated access.

## Method Behavior

- `get(sessionId)`
  - returns `model_id` when found
  - returns `null` for missing/invalid session
  - updates `last_used_at` on successful read
- `set(sessionId, modelId)`
  - `INSERT ... ON CONFLICT(session_id) DO UPDATE`
  - updates `last_used_at` and model mapping atomically
- `delete(sessionId)` removes mapping for a session
- `updateLastUsed(sessionId)` touches `last_used_at`
- `cleanup(ttlHours)` deletes records older than TTL and returns deleted row count

## Notes for Task 3

- `ModelRouter` now exposes `this.sessionModelRegistry` for sticky lookup/write logic in `route()`.
- Route-level sticky behavior (read sticky model, health/budget bypass, reason tagging, re-persist on reselection) remains for Task 3.
