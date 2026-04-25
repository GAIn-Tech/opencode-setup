# Task 1 — SQLite session_models schema

## Findings

- `packages/opencode-sisyphus-state/src/database.js` already configures SQLite for concurrency with:
  - `PRAGMA journal_mode = WAL`
  - `PRAGMA busy_timeout = 5000`
- Added `packages/opencode-sisyphus-state/src/schema.sql` with:

```sql
CREATE TABLE IF NOT EXISTS session_models (
  session_id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- Updated `packages/opencode-sisyphus-state/src/database.js` init path to execute `src/schema.sql` on startup (if present), ensuring `session_models` is created during DB initialization.
