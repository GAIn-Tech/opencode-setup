# AGENTS Drift Remediation Plan (2026-03-26)

> **Status**: COMPLETED (executed 2026-03-26)
> **Owner/DRI**: Docs Governance / AGENTS Maintainer

## Goal
Resolve high-confidence AGENTS documentation drift and harden drift detection so real structural/count drift is flagged while false positives are suppressed.

## Evidence Baseline
- At lane start, `.sisyphus/reports/unfinished-priority-matrix-2026-03-26.md` marked **P1 AGENTS drift remediation** as open.
- `.sisyphus/proposals/agents-drift-report-2026-03-26.md` reports 32 drift issues.
- Concrete known false-positive pattern:
  - drift report expects package-root paths like `packages/opencode-dashboard/app`,
  - while `packages/opencode-dashboard/AGENTS.md` and `packages/opencode-model-manager/AGENTS.md` declare nested `src/*` structures.
- At lane start, `scripts/check-agents-drift.mjs` resolved STRUCTURE entries directly to package root and did not maintain tree parent context for nested paths.
- Guardrail: until parser hardening is complete, do **not** apply “remove STRUCTURE entry” recommendations for known nested `src/*` false positives.

## Scope
1. Reconcile numeric drift (counts/claims) in AGENTS docs.
2. Fix structural drift detection logic to reduce nested-path false positives.
3. Refresh drift reports and close the AGENTS drift lane with evidence.

## Non-Goals
- No runtime behavior or model-routing changes.
- No unrelated governance/policy refactors.

## Work Plan

### Phase 1 — Truth Snapshot
1. Run `node scripts/check-agents-drift.mjs --dry-run` and capture current findings.
2. Inventory all AGENTS files flagged by drift output.
3. Classify each finding as one of:
   - factual count drift,
   - true missing-path drift,
   - parser/path-resolution false positive.

### Phase 2 — Drift Script Hardening
1. Update `scripts/check-agents-drift.mjs` STRUCTURE parsing to preserve nesting context (tree-aware resolution), including `parseStructureDirectories()` and `resolveStructurePath()` flow.
2. Ensure nested `src/*` entries are resolved relative to parent tree nodes, not always package root.
3. Add/adjust regression tests in `scripts/tests/check-agents-drift-structure-nesting.test.mjs` and run:
   - `bun test scripts/tests/check-agents-drift-structure-nesting.test.mjs`

### Phase 3 — AGENTS Doc Reconciliation
1. Update AGENTS numeric claims to current values where drift is factual.
2. Keep valid nested structure references; remove only truly stale entries.
3. Re-run drift script and confirm remaining findings (if any) are explicit and justified.

### Phase 4 — Evidence and Closure
1. Run `node scripts/check-agents-drift.mjs` to regenerate date-stamped proposal/report artifacts under `.sisyphus/proposals/`.
2. Update `.sisyphus/reports/unfinished-priority-matrix-2026-03-26.md` AGENTS row from open to reconciled/closed once criteria pass.
3. Add closure summary under `.sisyphus/reports/` with before/after drift counts.

## Verification
- `node scripts/check-agents-drift.mjs --dry-run`
- `node scripts/check-agents-drift.mjs`
- `bun test scripts/tests/check-agents-drift-structure-nesting.test.mjs`
- Verify dry-run output content (not exit code) no longer lists known false positives for dashboard/model-manager nested `src/*` STRUCTURE paths.
- Verify regenerated date-stamped files exist under `.sisyphus/proposals/`.

## Exit Criteria
- Drift script no longer reports known nested-path false positives.
- AGENTS docs reflect current counts/structure with evidence-backed updates.
- Known false-positive package pairs (dashboard/model-manager) are clean in dry-run output.
- Priority matrix updated to reflect AGENTS lane closure or narrowed residuals.

## Execution Outcome (2026-03-26)
- Implemented tree-aware STRUCTURE parsing in `scripts/check-agents-drift.mjs` so nested paths under declared roots (e.g., `src/...`) resolve correctly.
- Added regression tests in `scripts/tests/check-agents-drift-structure-nesting.test.mjs`.
- Reconciled factual AGENTS drift in:
  - `AGENTS.md` (script-count claims),
  - `scripts/AGENTS.md` (script-count claims),
  - `packages/opencode-model-manager/AGENTS.md` (`src/automation` path correctness).
- Verification evidence:
  - `bun test scripts/tests/check-agents-drift-structure-nesting.test.mjs` → **3 pass, 0 fail**.
  - `node scripts/check-agents-drift.mjs --dry-run` → **No drift found**.
  - `node scripts/check-agents-drift.mjs` → **No drift found**.
- Closure artifact: `.sisyphus/reports/agents-drift-closure-status-2026-03-26.md`.
