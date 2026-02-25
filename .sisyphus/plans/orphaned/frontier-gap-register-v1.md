# Frontier Gap Register (v1)

Purpose: hard, execution-grade checklist of remaining gaps blocking forefront real-world agentic performance.

## Scoring

- Priority: `P0` (must fix for frontier), `P1` (major uplift), `P2` (differentiator)
- Impact vectors: latency, reliability, quality, cost, security, operability

## Register

| ID | Gap | Priority | Current State | Target Metric | Closure Proof | Owner Files |
|---|---|---|---|---|---|---|
| FG-01 | Router stats durability loss under high write rate | P0 | Outcome persistence can drop updates under concurrent write pressure | 100/100 outcome writes persisted after stress + restart | Stress test: 100 rapid `recordResult()` calls, restart, verify persisted totals | `packages/opencode-model-router-x/src/index.js` |
| FG-02 | Synchronous I/O and JSON processing in hot decision paths | P0 | Blocking `readFileSync`/`writeFileSync` + parse/stringify in loop-adjacent flows | `advise()` p99 < 5ms under 200ms simulated FS delay | Perf harness with injected FS delay and p50/p95/p99 output | `packages/opencode-config-loader/src/index.js`, `packages/opencode-dashboard/src/lib/provider-status-store.ts`, learning/skill persistence modules |
| FG-03 | Learning-to-routing feedback lag from cache/poll windows | P0 | Degradation signals may take minutes to impact routing | New anti-pattern/failure signal affects next routing decision in <=10s | End-to-end test: inject failure signal, observe route adjustment timestamp delta | `packages/opencode-model-router-x/src/index.js`, learning/integration adapters |
| FG-04 | Learning ingestion integrity not uniformly signed/verified | P0 | Event signing exists in orchestration path; file-based learning ingestion still weaker | 0 unsigned/invalid records accepted in strict mode | Test corpus with tampered records rejected + explicit reason logs | learning ingestion + `packages/opencode-dashboard/src/app/api/orchestration/route.ts` |
| FG-05 | Silent orchestrator strategy degradation | P1 | Strategy failures can degrade quality while preserving uptime without strong visibility/mitigation | Per-strategy failure counters + auto-bypass MTTR < 30s | Fault injection shows strategy isolation + recovery telemetry | router/orchestrator modules + health APIs |
| FG-06 | No tail-latency-aware routing objective (p95/p99) | P1 | Routing uses average/partial latency signals; tails under-penalized | p99 latency SLO enforced with scoring penalty and policy sim visibility | Simulated tail spikes trigger demotion and preserve loop SLA | router scoring/policy modules |
| FG-07 | Eval harness weakly coupled to policy promotion | P1 | Eval exists but not hard-gating policy/routing promotion | 100% policy promotions require eval delta pass | CI + policy pipeline proof with blocked bad promotion | eval harness + policy save/promotion paths |
| FG-08 | Polling/timer ecology uncoordinated across subsystems | P1 | Multiple intervals with independent cadence/backoff increase contention/staleness | <5% overlapping poll collisions at peak load | Scheduler telemetry + contention benchmark report | health/provider/model sync/watcher modules |
| FG-09 | Deterministic replay does not enforce full environment snapshot parity | P2 | Seeded RNG implemented, but full replay parity not guaranteed across all boundaries | >=99% trace replay path-hash match | Replay suite compares live vs replay traces across scenarios | router/orchestration/event schema modules |
| FG-10 | Anti-gaming review queue has no hard operational SLOs | P2 | Queue exists but throughput/aging/FP/FN discipline incomplete | Review p95 age < 24h, FP/FN tracked weekly | Queue metrics endpoint + SLO dashboard + alerting | `packages/opencode-dashboard/src/app/api/models/route.ts` + review queue readers |
| FG-11 | Memory retrieval quality metrics not first-class | P2 | Memory graph present; retrieval precision/groundedness metrics underdeveloped | MAP@K / grounded recall tracked continuously | Retrieval eval report with threshold gates | memory graph + retrieval/ranking components |
| FG-12 | Policy simulation not mandatory gate for enforcement flips | P2 | Simulation endpoint exists; promotion workflow may bypass strict preflight | 100% strict-mode flips require successful policy sim | Enforcement change audit shows sim artifact hash linkage | `packages/opencode-dashboard/src/app/api/orchestration/policy-sim/route.ts`, governance workflows |

## Execution Rules

- No gap can be marked closed without machine-checkable evidence.
- P0 gaps close before any P2 optimization work.
- Any change touching routing/learning/signing must update at least one closure proof artifact.

## Mandatory Evidence Bundle per Gap

1. Repro test or benchmark command
2. Before/after metric snapshot
3. Linked logs or API output proving expected behavior
4. Drift/gov checks passing:
   - `node scripts/validate-control-plane-schema.mjs`
   - `node scripts/validate-fallback-consistency.mjs`
   - `node scripts/validate-plugin-compatibility.mjs`

## Suggested Next Closures (Order)

1. FG-01 (stats durability)
2. FG-03 (feedback lag)
3. FG-02 (sync I/O on hot paths)
4. FG-04 (learning ingestion integrity)
5. FG-06 (tail-latency objective)
