# Stash Disposition Plan (2026-03-26)

> **Status**: READY FOR EXECUTION
> **Owner/DRI**: Branch Hygiene / Release Integrator

## Goal
Safely resolve all deferred/temporary stash entries by classifying, preserving, and either integrating or retiring each stash without data loss.

## Evidence Baseline
- `.sisyphus/reports/unfinished-priority-matrix-2026-03-26.md` marks non-active stash lanes as intentionally deferred.
- Matrix-evidenced gating dependency:
  - keep `stash@{2}` (`docs/learning/local utils`) parked until governance/routing lane commit.
- Full stash inventory is derived from Phase 1 export and must not be assumed up-front.

## Scope
1. Classify active stash entries by lane and retention need.
2. Determine merge/apply/archive/drop action for each stash.
3. Record disposition decisions and rationale.

## Non-Goals
- No destructive stash deletion without prior archive/export.
- No silent application of stale stash content into unrelated lanes.

## Work Plan

### Phase 1 — Stash Catalog
1. Export current `git stash list` with timestamp to `.sisyphus/reports/stash-inventory-<date>.txt`.
2. For each stash, record:
   - origin lane,
   - scope/files,
   - dependency on current branch state,
   - risk of stale application.
3. Produce disposition workbook `.sisyphus/reports/stash-disposition-<date>.md` with one row per stash ref.

### Phase 2 — Disposition Decisions
1. Assign one disposition per stash:
   - `Apply now`,
   - `Archive then drop`,
   - `Keep deferred with review date`.
2. For `Archive then drop`, export patch artifact before deletion.
3. Record owner approval and rationale in the disposition workbook for each non-`Keep deferred` action.

### Phase 3 — Execution and Validation
1. Execute approved dispositions in dependency order.
2. Do **not** apply `stash@{2}` until governance/routing lane commit is complete (matrix dependency).
3. Validate working tree and key checks after each apply.
4. Update matrix/report with final stash state.

## Verification
- `git stash list` shows only intentionally retained stashes.
- Archive artifacts exist for dropped-but-preserved stash content.
- No unintended working-tree drift introduced by stash application.
- Disposition workbook provides before/after traceability per stash ref.

## Exit Criteria
- Every stash entry has documented disposition and evidence.
- Deferred stash lane no longer appears as ambiguous/open debt.
- Matrix-gated stash dependency (`stash@{2}`) handled according to recorded governance/routing commit state.
