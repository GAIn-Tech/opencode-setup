# Hardening Backlog

Last updated: 2026-02-24

## Implemented In This Wave

- Replaced fragile dashboard deep-relative imports with workspace package imports (`opencode-model-manager/...`).
- Added mutable-route write protection for dashboard APIs:
  - `OPENCODE_DASHBOARD_WRITE_TOKEN` gate
  - accepted headers: `x-opencode-write-token` or `Authorization: Bearer <token>`
- Added atomic JSON write helper for mutable dashboard config/model-policy writes.
- Added workflow-level regression protocol for package/skill loss:
  - `scripts/integrity-guard.mjs`
  - `opencode-config/integrity-baseline.json` baseline (required packages + required/min user skills)
  - `bun run integrity:check`
  - integrated into `bun run governance:check`
- Added integration tests for dashboard write-route guard (`integration-tests/dashboard-write-guard.test.ts`).

## Active Concerns (Keep On List)

1. ~~**Dashboard↔Model Manager boundary refinement**~~ **RESOLVED**
   - `scripts/ci-boundary-enforce.mjs` extended to scan all packages (not just dashboard).
   - Forbids `opencode-model-manager/(src|lib)/` direct imports across entire repo.

2. ~~**Mutable dashboard APIs require operational hardening**~~ **RESOLVED**
   - All 10 POST endpoints now guarded by `requireWriteAccess` with specific permissions.
   - 4 new permissions added: `skills:promote`, `usage:write`, `providers:manage`, `orchestration:write`.
   - Regression test in `integration-tests/dashboard-write-guard.test.ts` scans all `route.ts` files to ensure every POST export calls `requireWriteAccess` with a permission string.

3. ~~**Rollback safety pre-validation**~~ **RESOLVED**
   - Shared `packages/opencode-model-manager/src/snapshot/snapshot-schema.js` with `validateSnapshot()` and `normalizeSnapshot()`.
   - Both `model-rollback.mjs` and `snapshot-store.js` consume the shared module.

4. ~~**Multi-process transition safety**~~ **RESOLVED**
   - Atomic compare-and-swap added to `_persistTransition()` in `state-machine.js`.
   - State verification now happens inside `BEGIN IMMEDIATE` transaction; throws `STALE_STATE` on mismatch.

5. ~~**Build/runtime warning cleanup**~~ **RESOLVED**
   - `opencode-config/warning-baseline.json` + `scripts/ci-warning-budget.mjs` enforce warning budget.
   - Integrated into `bun run governance:check`.

6. ~~**Repo-wide test health still blocked by unrelated regressions**~~ **RESOLVED**
   - `context-management.test.js` test isolation fixed (SQLite persistence cleanup in `beforeEach`).

## Regression-Loss Protocol (Verifiable Workflow)

### Goal

Detect accidental loss of packages/skills/config assets before shipping.

### Checks

`scripts/integrity-guard.mjs` verifies:

- critical package directories still exist,
- skill registry exists and is non-trivially populated,
- user skill inventory has not regressed compared to latest and richest `~/.config/opencode/skills.backup.*` snapshots,
- required user skills and minimum skill-count baseline in `opencode-config/integrity-baseline.json` are enforced.

### Workflow

1. `bun run integrity:check` (manual preflight)
2. `bun run governance:check` (includes integrity guard)
3. if integrity check fails, do not proceed until missing assets are restored or intentionally documented.

### Recovery Path

- Restore missing user skills from latest `skills.backup.*` directory.
- Re-run `bun run integrity:check` and capture output in PR notes.
