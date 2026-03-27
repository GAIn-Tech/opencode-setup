# MCP Lifecycle Decision Record — 2026-03-26

## Scope
Decision record for MCP lifecycle lane after baseline refresh and command verification.

## Inputs
- `.sisyphus/reports/mcp-lifecycle-2026-03-26.md`
- `.sisyphus/reports/mcp-lifecycle-2026-03-13.md`
- `mcp-servers/server-list.md`
- `docs/architecture/cli-mcp-surface-policy.md`
- `opencode-config/mcp-dormant-policy.json`

## Decision Table

| MCP | Current Lifecycle State | Decision | Owner | Next Review Date | Criteria Reference | Verification Commands |
|---|---|---|---|---|---|---|
| `opencode-dashboard-launcher` | DORMANT (`enabled: false`) | **Remain dormant** | dashboard | 2026-04-26 | `.sisyphus/reports/mcp-lifecycle-2026-03-26.md` (Reactivation Reason/Criteria), `docs/architecture/cli-mcp-surface-policy.md` (CLI-first) | `bun run mcp:report`, `bun run mcp:smoke` |
| `opencode-model-router-x` | DORMANT (`enabled: false`) at lane start | **Retire MCP surface** (keep internal runtime library) | routing | 2026-04-26 | `.sisyphus/reports/mcp-lifecycle-2026-03-26.md` (lane-start baseline), `docs/architecture/cli-mcp-surface-policy.md` (Library-only) | `bun run mcp:report`, `bun run mcp:smoke` |
| `opencode-memory-graph` | PASSIVE (`enabled: true`) | **Keep passive-enabled (hybrid)** | memory | 2026-04-26 | `mcp-servers/server-list.md` (active MCP list), `docs/architecture/cli-mcp-surface-policy.md` (Hybrid), `opencode-config/mcp-dormant-policy.json` (not listed as dormant) | `bun run mcp:report`, `bun run mcp:exercise` |

## Rationale Summary
- Memory graph is no longer a dormant-disabled candidate in current state; it is passive-enabled and policy-consistent as hybrid.
- Dashboard launcher remains dormant-disabled and continues to require explicit wrapper/contract evidence before reactivation.
- Model-router-x MCP surface is retired from host-facing MCP configs; package remains internal runtime routing library.
- No “Reactivate now” decision was taken in this pass.

## Verification Evidence
- `bun run mcp:report` regenerated lifecycle report with current status table.
- `bun run mcp:smoke` completed and reported per-MCP smoke verification state.
- `bun run mcp:exercise` completed; memory-graph explicitly reported as skipped due missing repo-owned probe.

## Next Lane
- Proceed to stash disposition lane per:
  - `.sisyphus/plans/2026-03-26-stash-disposition-plan.md`
  - `.sisyphus/reports/system-priority-roadmap-2026-03-26.md`
