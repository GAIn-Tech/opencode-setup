# MCP Lifecycle Decision Plan (2026-03-26)

> **Status**: COMPLETED (executed 2026-03-26)
> **Owner/DRI**: MCP Surface Owners (dashboard / memory / routing)

## Goal
Make explicit, evidence-backed decisions for currently dormant MCPs and document whether each should be reactivated, remain dormant with review cadence, or be retired.

## Evidence Baseline
- `.sisyphus/reports/mcp-lifecycle-2026-03-13.md` lists dormant MCPs with owners and reactivation criteria:
  - `opencode-dashboard-launcher`
  - `opencode-memory-graph`
  - `opencode-model-router-x`
- `.sisyphus/reports/system-priority-roadmap-2026-03-26.md` tracks this as a decision-needed lane.
- Lifecycle command surface exists in root `package.json` (`mcp:report`, `mcp:smoke`, `mcp:exercise`) and should anchor verification.

## Scope
1. Validate current implementation readiness against documented reactivation criteria.
2. Record decision state per dormant MCP (reactivate / remain dormant / retire).
3. Update lifecycle documentation and review cadence.

## Non-Goals
- No forced reactivation of MCPs without wrapper + smoke validation.
- No changes to unrelated live MCP integrations.

## Work Plan

### Phase 1 — Readiness Audit
1. Refresh baseline with:
   - `bun run mcp:report`
2. For each dormant MCP, verify:
   - wrapper/entrypoint availability,
   - startup path,
   - smoke verification command,
   - owner accountability.
3. Anchor checks to:
   - `mcp-servers/server-list.md` (declared commands/servers)
   - `docs/architecture/cli-mcp-surface-policy.md` (surface policy)
   - `.sisyphus/reports/mcp-lifecycle-2026-03-13.md` (owner + criteria)
4. Capture findings in a decision table.

### Phase 2 — Decision Record
1. Assign one of three states per MCP:
   - `Reactivate now`,
   - `Remain dormant (with next review date)`,
   - `Retire/deprecate`.
2. Include rationale tied to explicit criteria in lifecycle report.
3. Use decision artifact schema per MCP:
   - decision,
   - owner,
   - next review date,
   - criteria reference,
   - verification command(s).

### Phase 3 — Documentation Reconciliation
1. Update lifecycle report to current decision state and date.
2. Add or update a `.sisyphus/reports/mcp-lifecycle-decision-<date>.md` artifact with owner + due date per dormant MCP.
3. Update `.sisyphus/reports/system-priority-roadmap-2026-03-26.md` lane status to reflect recorded decisions.

## Verification
- `bun run mcp:report`
- For any MCP marked `Reactivate now`: run `bun run mcp:smoke` and `bun run mcp:exercise`.
- Confirm lifecycle docs reflect final decisions and owners.

## Exit Criteria
- Every dormant MCP has explicit decision + owner + next review/validation action.
- Lifecycle documentation no longer leaves dormant entries without actionable follow-up.
- Roadmap lane status updated to reflect decision completion state.

## Execution Outcome (2026-03-26)
- Baseline refreshed with `bun run mcp:report` and persisted at `.sisyphus/reports/mcp-lifecycle-2026-03-26.md`.
- Decision artifact recorded at `.sisyphus/reports/mcp-lifecycle-decision-2026-03-26.md` with explicit decision/owner/review date/criteria/verification commands.
- Final per-MCP decisions:
  - `opencode-dashboard-launcher` → **Remain dormant** (owner: dashboard; next review: 2026-04-26).
  - `opencode-model-router-x` → **Retire MCP surface** (owner: routing; review runtime-library posture on 2026-04-26).
  - `opencode-memory-graph` → **Keep passive-enabled (hybrid)** (owner: memory; next review: 2026-04-26).
- Verification evidence:
  - `bun run mcp:report` (lifecycle refresh)
  - `bun run mcp:smoke`
  - `bun run mcp:exercise`
- `opencode-model-router-x` removed from host-facing MCP config/policy/mirror while retaining internal runtime routing package usage.
- Roadmap updated to close MCP lifecycle decision lane and promote stash disposition as the next lane.
