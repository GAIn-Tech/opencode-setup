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
| P1 | AGENTS drift remediation | **Reconciled** (closed 2026-03-26) | `bun test scripts/tests/check-agents-drift-structure-nesting.test.mjs` => **3/3 pass**; `node scripts/check-agents-drift.mjs --dry-run` => **No drift found**; parser hardening + AGENTS factual updates completed. | Treat AGENTS lane as closed; continue with cross-plan librarian consistency lane. |
| P2 | Explicit librarian prompt-file deliverable | **Resolved** (cross-plan consistency reconciled 2026-03-26) | Canonical `opencode-config/agents/librarian.md` retained; legacy delete instructions reconciled; runtime-sync deprecated purge list no longer includes `librarian.md`. | Treat librarian lane as closed; continue with MCP lifecycle decisions lane. |
| P2 | MCP lifecycle decisions | **Reconciled** (decision record completed 2026-03-26) | `bun run mcp:report` refreshed lifecycle state (`.sisyphus/reports/mcp-lifecycle-2026-03-26.md`); decision artifact recorded (`.sisyphus/reports/mcp-lifecycle-decision-2026-03-26.md`) with owner + next review date per MCP; `opencode-model-router-x` MCP surface retired from host-facing MCP config/policy/mirror. | Treat MCP lifecycle lane as closed; proceed with stash disposition lane. |
| P2 | Non-active stash lanes | **Deferred intentionally** | `stash@{2}` (`docs/learning/local utils`) still parked; lane split preserved. | Keep parked until governance/routing lane is committed; then apply separately if needed. |

## Notes

- Working tree intentionally remains non-clean because this branch is operating in lane mode.
- This matrix is for sequencing and closure, not for deciding final commit granularity.
- Commit planning should split by concern: governance/routing core, `.sisyphus` evidence/docs reconciliation, and deferred utility/docs lane.
