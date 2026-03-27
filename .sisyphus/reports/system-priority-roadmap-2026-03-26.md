# System Priority Roadmap — 2026-03-26

## Scope
Evidence-backed roadmap after ecosystem/Wave11 closure for remaining open and decision-needed lanes.

## Closed Baseline (for context)
- Governance/routing lane: reconciled/ready.
- Learning-governance compliance: reconciled.
- Ecosystem audit drift: reconciled.
- Wave11 context/perf lane: completed (25/25).
- AGENTS drift remediation: reconciled (drift checker hardening + AGENTS factual updates completed).
- Cross-plan librarian consistency: reconciled (legacy delete instructions neutralized; runtime-sync policy aligned to retain canonical librarian prompt).
- Dormant MCP lifecycle decisions: reconciled (explicit decisions/owners/review dates recorded; model-router-x MCP surface retired while runtime package remains internal).

## Open / Decision Lanes

| Priority | Lane | Status | Evidence Source | Plan Coverage | Execution Order |
|---|---|---|---|---|---|
| P2 | Stash disposition lane | Deferred intentionally (pending explicit disposition) | `.sisyphus/reports/unfinished-priority-matrix-2026-03-26.md`, `git stash list` state | **New plan created**: `.sisyphus/plans/2026-03-26-stash-disposition-plan.md` | 1 |

## Review Notes
- AGENTS drift proposals previously included nested-path false positives; this was closed by tree-aware parser hardening in `scripts/check-agents-drift.mjs` and regression tests.
- Cross-plan librarian consistency lane is closed; keep librarian retention policy as a guarded invariant in future docs/config drift checks.
- MCP lifecycle decision record now exists (`.sisyphus/reports/mcp-lifecycle-decision-2026-03-26.md`); re-run review on next due date.
- Stash disposition must remain non-destructive (archive before drop).

## Plan QA Notes (Momus-guided revisions applied)
- All four new plans were reviewed and revised for:
  - owner/DRI explicitness,
  - evidence-baseline accuracy,
  - measurable verification/exit criteria,
  - command-level executability.
- `.sisyphus/plans/agent-surface-hardening.md` was updated to use supported drift-check command (`--dry-run`) and explicit librarian retention-safe purge rule.

## Next Checkpoint
- Execute lane 1 (stash disposition) with updated matrix state.
