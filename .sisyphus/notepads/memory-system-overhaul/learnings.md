# Memory System Overhaul Learnings

## 2026-04-21
- Confirmed Node.js built-ins from Context7: `crypto.createHash('sha256').update(value).digest('hex')` for SHA-256 hex digests, and `crypto.randomUUID()` for RFC4122 v4 UUID generation.
- Mirrored hashing style from `packages/opencode-model-manager/src/lifecycle/audit-logger.js` by using direct crypto hash chaining with `digest('hex')`.
- Verified project precedent with ast-grep (`createHash('sha256').update(...).digest('hex')`) and aligned `content_hash` + idempotency key generation to this pattern.
- Established canonical memory schema module in integration-layer with explicit enum constraints, normalization defaults, and invariant-aware validation.
- Implemented `DegradedModeHandler` in integration-layer with fail-open Supermemory probing (`checkAvailability` + timeout), SQLite-backed local queue (`pending_writes`), and queue overflow eviction (oldest-first when `maxQueueSize` exceeded).
- Applied idempotent SQLite insert style with `ON CONFLICT(id) DO NOTHING`, matching the same conflict-handling intent used by audit logging.
- Added batch `flush()` behavior with exponential retry backoff anchored at 1 minute and capped at 16 minutes, plus status reporting (`available`, `queuedCount`, `lastCheckTime`) and consolidation gating via `disableConsolidation()`.
- Context7 better-sqlite3 refresh: validated practical API usage (`prepare(...).run/get/all`, `db.transaction(...)`, `db.pragma(...)`) and mirrored this in the SQLite client abstraction for Bun + better-sqlite3 compatibility.
