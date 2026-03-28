# Cross-Plan Librarian Consistency Plan (2026-03-26)

> **Status**: COMPLETED (executed 2026-03-26)
> **Owner/DRI**: Docs Governance / Agent Surface Maintainer

## Goal
Eliminate contradictions across plans/reports/docs regarding librarian agent surface handling, especially where older plans conflict with Wave11-delivered librarian prompt artifacts.

## Evidence Baseline
- `docs/plans/2026-03-14-agent-surface-hardening.md` contains legacy delete instructions for `opencode-config/agents/librarian.md`.
- `.sisyphus/plans/agent-surface-hardening.md` is already revised to **retain** `opencode-config/agents/librarian.md`.
- Wave11 closure work added `opencode-config/agents/librarian.md` as an explicit deliverable.
- `.sisyphus/reports/unfinished-priority-matrix-2026-03-26.md` marks explicit librarian prompt-file deliverable as resolved.
- `opencode-config/AGENTS.md` still contains stale claims about `agents/` emptiness and requires consistency reconciliation.

## Scope
1. Identify all docs/plans that prescribe conflicting librarian file behavior.
2. Establish a single canonical policy for librarian prompt ownership.
3. Reconcile all conflicting references.

## Non-Goals
- No runtime routing/model changes.
- No unrelated doc sweeps outside librarian/cross-plan consistency scope.

## Work Plan

### Phase 1 — Conflict Inventory
1. Search `.sisyphus/plans/`, `.sisyphus/reports/`, `docs/plans/`, `opencode-config/AGENTS.md`, and `scripts/copy-config.mjs` for `librarian.md` and agent-surface policy text.
2. Build a contradiction matrix: source, old claim, canonical claim, action, severity.
3. Explicitly include historical conflict files in the matrix (e.g., `docs/plans/2026-03-14-agent-surface-hardening.md`).

### Phase 2 — Canonical Policy Definition
1. Set canonical statement:
   - `opencode-config/agents/librarian.md` is a maintained deliverable (Context7-first policy).
2. Define ownership and drift-check expectations, including runtime-sync behavior that must not delete the canonical repo deliverable.

### Phase 3 — Document Reconciliation
1. Update conflicting legacy docs/plans to remove contradictory delete instruction while preserving historical context.
2. Add reconciliation notes where historical context must be preserved.
3. Ensure unfinished-priority matrix and closure reports remain consistent.

## Verification
- Grep for contradictory librarian deletion instructions returns none in active planning/reporting docs.
- Canonical librarian policy appears consistently across updated docs.
- Matrix/closure artifacts continue to show librarian deliverable as resolved.

Recommended verification commands:
- `git grep -n "Delete: \`opencode-config/agents/librarian.md\`\|delete final stale repo agent prompt" -- .sisyphus/plans docs/plans .sisyphus/reports opencode-config/AGENTS.md`
- `git grep -n "explicit librarian prompt-file deliverable" -- .sisyphus/reports/unfinished-priority-matrix-2026-03-26.md`

## Exit Criteria
- No conflicting librarian handling instructions remain in active planning/reporting artifacts.
- Future drift checks classify librarian prompt file handling consistently.
- `opencode-config/AGENTS.md` no longer contradicts canonical librarian file handling.

## Execution Outcome (2026-03-26)
- Reconciled conflicting delete guidance in legacy docs:
  - `docs/plans/2026-03-14-agent-surface-hardening.md` now superseded/reconciled and aligned to retain canonical `librarian.md`.
  - `docs/plans/2026-03-10-passive-mcp-activation.md` now references librarian policy style without mirror/duplication semantics.
- Preserved canonical-policy consistency in active planning/reporting artifacts:
  - `.sisyphus/plans/agent-surface-hardening.md` retains canonical librarian deliverable posture.
  - `.sisyphus/reports/unfinished-priority-matrix-2026-03-26.md` continues to classify librarian deliverable as resolved.
- Aligned runtime-sync safety with policy:
  - `scripts/copy-config.mjs` deprecated-runtime purge list no longer includes `librarian.md`.

### Verification Evidence
- `git grep -n "Delete: \`opencode-config/agents/librarian.md\`\|delete final stale repo agent prompt" -- .sisyphus/plans docs/plans .sisyphus/reports opencode-config/AGENTS.md`
  - no active contradiction remains; legacy references were reconciled.
- `git grep -n "librarian.md" -- scripts/copy-config.mjs`
  - canonical librarian file is not listed as deprecated runtime prompt.

### Closure Artifact
- `.sisyphus/reports/cross-plan-librarian-consistency-closure-2026-03-26.md`
