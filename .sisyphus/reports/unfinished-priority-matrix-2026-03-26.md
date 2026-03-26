# Unfinished Priority Matrix — 2026-03-26

## Scope

Evidence-backed snapshot of remaining execution priorities after lane-based uncommitted-change management on branch `wip/uncommitted-lanes-20260326`.

## Priority Matrix

| Priority | Stream | Current State | Evidence | Recommended Next Action |
|---|---|---|---|---|
| P0 | Governance/routing lane readiness | **Ready** in working tree | `bun scripts/run-skill-routing-gates.mjs --full-report` => **6/6 pass**; targeted tests pass (81/81). | Keep as active implementation lane for commit slicing/PR preparation. |
| P0 | Learning governance compliance | **Reconciled** | `opencode-config/.governance-hashes.json` regenerated; learning update record added (`opencode-config/learning-updates/2026-03-26-skill-routing-governance-reconcile.json`). | Preserve this update in same commit group as governed file changes. |
| P1 | Ecosystem audit plan state drift | **Reconciled** (doc status corrected) | `.sisyphus/boulder.json` completed plan state + evidence artifacts; plan docs updated to mark completion/reconciliation. | No further runtime work required; treat as closed documentation drift item. |
| P1 | Wave 11 context/perf plan | **Completed** | Task 9/11/24 closure artifacts present; targeted Wave11 tests passed (117/117), governance 6/6 pass, health-check 0 failures, full `bun test` now passes after tracker metrics-shape fix. | Treat Wave11 as closed; carry forward only routine drift governance/docs hygiene. |
| P1 | AGENTS drift remediation | **Open (post-closure hygiene)** | `node scripts/check-agents-drift.mjs` still reports numeric/structure drift across AGENTS.md files and emits proposals under `.sisyphus/proposals/`. | Run a focused docs-drift lane to reconcile AGENTS counts/structure references. |
| P2 | Explicit librarian prompt-file deliverable | **Resolved** | `opencode-config/agents/librarian.md` added with Context7-first instructions and fallback constraints. | Keep file in future config governance/drift checks; no further immediate work. |
| P2 | Non-active stash lanes | **Deferred intentionally** | `stash@{2}` (`docs/learning/local utils`) still parked; lane split preserved. | Keep parked until governance/routing lane is committed; then apply separately if needed. |

## Notes

- Working tree intentionally remains non-clean because this branch is operating in lane mode.
- This matrix is for sequencing and closure, not for deciding final commit granularity.
- Commit planning should split by concern: governance/routing core, `.sisyphus` evidence/docs reconciliation, and deferred utility/docs lane.
