# Frontier Gap Execution Plan (Start-Work Ready)

This is the execution companion to:
- `.sisyphus/plans/frontier-gap-register-v1.md`
- `.sisyphus/plans/control-plane-innovation-migration-v1.md`

It converts FG items into atomic, testable implementation tasks with hard verification and rollback controls.

## Execution Policy

- Close all `P0` items before advancing `P2`.
- Each task must include machine-checkable evidence.
- Any task touching routing/learning/signing must pass governance suite.

Mandatory suite after each milestone:

```bash
node scripts/validate-control-plane-schema.mjs
node scripts/validate-fallback-consistency.mjs
node scripts/validate-plugin-compatibility.mjs
```

Dashboard build check (known unrelated blocker currently exists):

```bash
cd packages/opencode-dashboard
bunx next build
```

---

## Milestone M0 - Baseline Capture (No Behavior Change)

### M0.1 Baseline metrics harness
- Add a baseline script for latency/reliability snapshots before FG changes.
- Record:
  - router decision p50/p95/p99
  - policy update acceptance/rejection ratios
  - plugin runtime state distribution

Acceptance:
- Baseline artifact written to `.opencode/metrics/baseline-<timestamp>.json`.

Rollback:
- Remove baseline harness only; no runtime behavior changed.

---

## Milestone M1 - P0 Closure

### FG-01 Router stats durability under throughput
Atomic tasks:
1. Replace drop-on-pending write behavior with buffered flush queue.
2. Add bounded flush interval and shutdown flush.
3. Add write-failure retry with capped attempts and telemetry counters.

Verification:
```bash
node scripts/perf/fg01-stats-durability.mjs
```

Pass criteria:
- 100/100 rapid `recordResult()` calls persisted across restart.

Rollback:
- Feature flag `OPENCODE_ROUTER_BUFFERED_STATS=false`.

### FG-03 Learning-to-routing feedback lag
Atomic tasks:
1. Add event-driven invalidation from learning updates to router advice cache.
2. Cap stale-cache TTL to low bound if invalidation unavailable.
3. Emit `learning_advice_invalidated` telemetry event.

Verification:
```bash
node scripts/perf/fg03-feedback-lag.mjs
```

Pass criteria:
- Anti-pattern/failure signal affects routing in <=10s.

Rollback:
- Revert to TTL-only behavior via env flag.

### FG-02 Sync I/O in hot decision paths
Atomic tasks:
1. Identify top sync I/O calls in decision-adjacent code.
2. Move persistence to async write-behind where safe.
3. Add latency probes around replaced paths.

Verification:
```bash
node scripts/perf/fg02-hotpath-io.mjs
```

Pass criteria:
- `advise()` p99 < 5ms under injected slow FS profile.

Rollback:
- `OPENCODE_SYNC_IO_FALLBACK=true` for emergency reversion.

### FG-04 Learning ingestion integrity
Atomic tasks:
1. Enforce provenance verification in learning ingestion strict mode.
2. Reject unsigned/invalid records with deterministic reason codes.
3. Emit rejection counters and reasons to orchestration metrics.

Verification:
```bash
node scripts/security/fg04-ingestion-integrity.mjs
```

Pass criteria:
- 0 unsigned/invalid records accepted when strict mode enabled.

Rollback:
- Temporary downgrade to `require-signed` with explicit warning event.

---

## Milestone M2 - P1 Closure

### FG-05 Silent orchestrator degradation
Atomic tasks:
1. Add per-strategy failure counters and rolling windows.
2. Introduce auto-bypass cooldown for failing strategies.
3. Surface counters in `/api/health` and `/api/orchestration`.

Verification:
```bash
node scripts/fault/fg05-strategy-failure-isolation.mjs
```

Pass criteria:
- MTTR from strategy fault to healthy route path < 30s.

### FG-06 Tail-latency-aware routing objective
Atomic tasks:
1. Add p95/p99 tracking per model (streaming estimator).
2. Add SLO threshold policy and score penalties for violators.
3. Include tail metrics in policy simulation output.

Verification:
```bash
node scripts/perf/fg06-tail-latency-slo.mjs
```

Pass criteria:
- Tail-latency outliers are demoted and loop SLA preserved.

### FG-07 Eval harness promotion gate
Atomic tasks:
1. Define regression thresholds for promotion.
2. Link eval result artifact to policy promotion endpoint/workflow.
3. Block promotion if thresholds fail.

Verification:
```bash
node scripts/evals/fg07-promotion-gate.mjs
```

Pass criteria:
- 100% policy promotions require passing eval deltas.

### FG-08 Poll/timer coordination
Atomic tasks:
1. Inventory all intervals and polling loops.
2. Add centralized cadence policy or staggered scheduler.
3. Add collision/overlap telemetry.

Verification:
```bash
node scripts/perf/fg08-poll-coordination.mjs
```

Pass criteria:
- <5% overlapping poll collisions at peak simulation load.

---

## Milestone M3 - P2 Differentiators

### FG-09 Full replay parity
Atomic tasks:
1. Capture environment snapshot metadata in trace artifacts.
2. Add replay comparator computing path-hash parity.
3. Expose replay parity KPI in orchestration dashboard/API.

Verification:
```bash
node scripts/replay/fg09-replay-parity.mjs
```

Pass criteria:
- >=99% trace replay path-hash match in seeded mode.

### FG-10 Review queue operational SLOs
Atomic tasks:
1. Add review queue read/status API.
2. Add queue age and throughput metrics + p95 age alert.
3. Add false-positive/false-negative review feedback fields.

Verification:
```bash
node scripts/ops/fg10-review-queue-slo.mjs
```

Pass criteria:
- Review p95 age <24h; weekly FP/FN report generated.

### FG-11 Memory retrieval quality metrics
Atomic tasks:
1. Define retrieval benchmark set + ground truth.
2. Implement MAP@K / grounded recall metrics pipeline.
3. Surface retrieval quality in dashboard and promotion checks.

Verification:
```bash
node scripts/evals/fg11-retrieval-quality.mjs
```

Pass criteria:
- MAP@K and grounded recall tracked continuously with threshold alerts.

### FG-12 Policy-sim mandatory gate
Atomic tasks:
1. Require policy simulation artifact hash before strict flips.
2. Add audit linkage between sim result and applied policy.
3. Block enforcement toggles without valid sim artifact.

Verification:
```bash
node scripts/governance/fg12-sim-gate.mjs
```

Pass criteria:
- 100% strict-mode flips have valid preflight simulation linkage.

---

## Unified Evidence Template (Use for Every FG Item)

For each FG closure, include:

1. **Repro/benchmark command**
2. **Before metrics** (p50/p95/p99, acceptance/rejection, error counts)
3. **After metrics**
4. **Artifact paths** (logs/json reports)
5. **Governance suite result**
6. **Rollback switch** and validated rollback result

---

## Risk and Rollback Controls

- Each milestone gated behind env toggles; no irreversible rollout.
- Strict-mode changes require policy simulation pass artifact.
- If any P0 regression appears in production-like test, rollback that milestone and freeze downstream work.

---

## Start-Work Handoff

Execution plan is now atomic and start-work ready.
Use this plan path for execution:

`.sisyphus/plans/frontier-gap-execution-v1.md`
