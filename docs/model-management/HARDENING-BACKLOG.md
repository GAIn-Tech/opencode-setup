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

1. **Dashboard↔Model Manager boundary refinement**
   - Current state now uses package imports (`opencode-model-manager/lifecycle`, `opencode-model-manager/monitoring`).
   - Next: enforce stricter public API contracts and forbid raw internal subpath imports in lint/governance.

2. **Mutable dashboard APIs require operational hardening**
   - Auth gate and append-only write audit now exist.
   - Next: role-scoped authorization policy and actor identity verification.

3. **Rollback safety pre-validation**
   - Snapshot schema pre-validation now blocks invalid restore candidates.
   - Next: formal schema object + reusable validator shared with snapshot writer.

4. **Multi-process transition safety**
   - Upgrade lifecycle transition persistence from process-local lock guarantees to DB-level atomic guards.

5. **Build/runtime warning cleanup**
   - Dynamic require expression warning eliminated in lifecycle loaders.
   - Next: keep module warnings as CI budget (fail on new critical-dependency warnings).

6. **Repo-wide test health still blocked by unrelated regressions**
   - Keep full-suite green as ship gate.

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
