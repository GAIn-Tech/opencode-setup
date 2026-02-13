# Moltbot Selective Adoption Plan (from opencode-setup)

Canonical copy: `moltbot-sandbox/work/opencode-setup/integration-plan.md`

## Adopt
- Twofold operating model: Sisyphus orchestrates, OpenCode specialists implement.
- Safety + evidence gates: `safety-gate` before risky commands, `showboat` after high-impact work.
- RL workflow discipline: PROMETHEUS -> SISYPHUS -> MOMUS -> METIS with durable lesson capture.
- Structured research split: `explore` for internal patterns, `librarian` for external references.

## Defer
- `opencode-memory-graph` full activation until persistence, retention, and degraded-mode policy are explicit.
- `opencode-model-router-x` until cost/latency SLOs and deterministic fallbacks are proven.
- `opencode-eval-harness` continuous mode until benchmark corpus and CI budget are formalized.
- `opencode-runbooks` auto-remediation until non-destructive allowlists and approval gates are defined.

## Reject (for now)
- Always-on plugin health daemon in runtime path; run checks on demand instead.
- Hard dependency on external graph sidecar (`goraphdb`) before necessity is demonstrated.
- Autonomous prompt self-mutation; keep prompt evolution reviewable and versioned.

## Policy
- Adopt reasoning/orchestration rigor aggressively.
- Adopt infra-heavy autonomy conservatively.
- Every candidate capability must pass: quality gain, operational cost, failure-mode clarity.

## Execution Checklist
- [ ] Baseline metrics captured (success rate, cycle time, rework, incidents).
- [ ] Delegation default enforced (OpenCode specialists for coding tasks).
- [ ] Safety gate enforced for non-trivial shell actions.
- [ ] Showboat evidence required for high-impact changes.
- [ ] RL loop discipline enforced for non-trivial work.
- [ ] Weekly memory hygiene pass (prune low-signal entries).
- [ ] Monthly adoption review with adopt/defer/reject updates.

## Rollout Gates
- [ ] No quality regression across 2 weeks.
- [ ] Zero severe command safety incidents.
- [ ] Spend variance within agreed limits.
- [ ] All deferred items have explicit readiness artifacts.
