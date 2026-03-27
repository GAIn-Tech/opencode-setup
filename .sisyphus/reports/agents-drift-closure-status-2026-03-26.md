# AGENTS Drift Closure Status — 2026-03-26

## Lane
P1 — AGENTS drift remediation

## Status
**COMPLETED (reconciled 2026-03-26)**

## Before / After
- Before: `node scripts/check-agents-drift.mjs --dry-run` reported **32 issues across 5 AGENTS files** (count drifts + nested STRUCTURE false positives).
- After: `node scripts/check-agents-drift.mjs --dry-run` reports **No drift found**.

## What Changed
1. Hardened `scripts/check-agents-drift.mjs`:
   - tree-aware STRUCTURE parsing preserving nested root context,
   - corrected path resolution behavior for nested entries,
   - `agent_count` actual now counts only `.md` files in `opencode-config/agents`.
2. Added regression coverage:
   - `scripts/tests/check-agents-drift-structure-nesting.test.mjs`.
3. Reconciled factual AGENTS docs drift:
   - `AGENTS.md` script counts aligned,
   - `scripts/AGENTS.md` script counts aligned,
   - `packages/opencode-model-manager/AGENTS.md` STRUCTURE/lookup path corrected to `src/automation`.

## Verification Evidence
- `bun test scripts/tests/check-agents-drift-structure-nesting.test.mjs` → **3 pass, 0 fail**
- `node scripts/check-agents-drift.mjs --dry-run` → **No drift found**
- `node scripts/check-agents-drift.mjs` → **No drift found**

## Next Lane
- Continue with **Cross-plan librarian consistency** per:
  - `.sisyphus/plans/2026-03-26-cross-plan-librarian-consistency-plan.md`
  - `.sisyphus/reports/system-priority-roadmap-2026-03-26.md`
