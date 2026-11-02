# Control Plane Innovation Migration Plan (v1)

## Scope

Repository-wide orchestration/control-plane refinement for stronger principle adherence across robustness, adaptability, efficiency, and governance.

## Hotspot Ranking (IHS Model)

Scoring model:

`IHS = (VarianceNuance^1.20) * (PotentialValue^1.50) * (InverseAttention^1.35) * Confidence`

| Rank | Hotspot | VarianceNuance | PotentialValue | InverseAttention | Confidence | IHS |
|---|---|---:|---:|---:|---:|---:|
| 1 | Governance enforcement as runtime detector (not hard gate) | 0.92 | 0.98 | 0.83 | 0.93 | 0.612 |
| 2 | Telemetry semantics drift (fallback/fidelity/reason naming) across boundaries | 0.90 | 0.94 | 0.82 | 0.89 | 0.542 |
| 3 | Event trust and replay integrity are policy-optional | 0.88 | 0.95 | 0.79 | 0.90 | 0.519 |
| 4 | Plugin lifecycle supervision is still structural, not behavioral | 0.84 | 0.92 | 0.81 | 0.84 | 0.458 |
| 5 | Learning-loop quality controls are heuristic-heavy, weakly anti-gaming | 0.86 | 0.88 | 0.78 | 0.80 | 0.396 |

Evidence anchors:
- `packages/opencode-dashboard/src/app/api/orchestration/route.ts`
- `packages/opencode-config-loader/src/index.js`
- `packages/opencode-integration-layer/src/index.js`
- `packages/opencode-skill-rl-manager/src/evolution-engine.js`
- `packages/opencode-dashboard/src/app/api/{learning,skills,rl,health}/route.ts`
- `scripts/validate-{control-plane-schema,fallback-consistency,plugin-compatibility}.mjs`

## Chosen Innovation Direction Per Hotspot

### 1) Governance enforcement as runtime detector
- Conservative: expand drift checks and warnings only.
- Adjacent leap: enforce warn->block policy by environment (dev/stage/prod modes).
- Boundary-pushing redesign: signed policy bundle + policy attestation at startup.
- **Chosen direction**: adjacent leap now, preserve path to signed policy bundle.

### 2) Telemetry semantics drift
- Conservative: patch naming inconsistencies endpoint-by-endpoint.
- Adjacent leap: canonical telemetry envelope schema with translators at boundaries.
- Boundary-pushing redesign: schema-registry + compatibility matrix + contract tests.
- **Chosen direction**: adjacent leap + contract tests.

### 3) Event trust and replay integrity
- Conservative: keep optional signature/replay settings.
- Adjacent leap: default strict mode outside dev + rejection diagnostics.
- Boundary-pushing redesign: key IDs, rotation windows, verifiable audit chain.
- **Chosen direction**: adjacent leap now, then audit-chain increment.

### 4) Plugin lifecycle supervision
- Conservative: improve static discovery/status reporting.
- Adjacent leap: runtime supervisor state machine (init/health/degrade/recover).
- Boundary-pushing redesign: plugin sandboxing and capability attestation.
- **Chosen direction**: adjacent leap.

### 5) Learning-loop anti-gaming and calibration
- Conservative: tune thresholds and add more tests.
- Adjacent leap: quality-weighted reward model + confidence calibration.
- Boundary-pushing redesign: counterfactual policy simulation with holdout traces.
- **Chosen direction**: adjacent leap.

## Migration Strategy

## Phase A - Contract and Gate Consolidation

Atomic steps:
1. Introduce canonical telemetry envelope for fallback/fidelity/reason fields and compatibility translators.
2. Add contract test suite validating envelope consistency across `/api/learning`, `/api/skills`, `/api/rl`, `/api/orchestration`.
3. Upgrade governance scripts to fail on envelope drift.

Verification gates:
- Contract tests green.
- Governance scripts green.
- No endpoint emits non-canonical fields without translator.

Rollback:
- Keep compatibility translators and feature flag envelope enforcement.

## Phase B - Enforcement Mode Progression (Warn -> Enforce)

Atomic steps:
1. Define policy mode matrix for signing, trace requirements, fidelity minimum.
2. Add explicit per-environment defaults and startup summaries.
3. Enable strict mode in non-dev pathways with clear rejection diagnostics.

Verification gates:
- Policy simulation predicts expected acceptance/rejection.
- Enforcement metrics visible in orchestration dashboard.

Rollback:
- Single env toggle to revert to warn mode.

## Phase C - Plugin Runtime Supervisor

Atomic steps:
1. Add supervisor state contract (`unknown|healthy|degraded|crashed`) with reason codes.
2. Track heartbeat, dependency order, restart attempts, quarantine transitions.
3. Wire supervisor state into `/api/health` and `/api/orchestration` frontier scoring.

Verification gates:
- Fault injection test proves state transitions and recovery.
- No plugin can be treated as healthy without runtime evidence.

Rollback:
- Disable active supervision while preserving passive reporting.

## Phase D - Learning Quality and Anti-Gaming Controls

Atomic steps:
1. Add reward calibration based on outcome quality and provenance confidence.
2. Penalize low-fidelity/demo-derived learning updates.
3. Add anti-gaming checks (token inflation, missing trace/signature, synthetic success patterns).

Verification gates:
- Calibration tests: confidence aligns with realized outcome.
- Anti-gaming tests block known exploit patterns.

Rollback:
- Keep old scoring path behind switch until calibration stability target met.

## Cross-Phase Mandatory Risk Controls

- All contract changes include migration notes and backward compatibility adapters.
- Every phase must pass:
  - `node scripts/validate-control-plane-schema.mjs`
  - `node scripts/validate-fallback-consistency.mjs`
  - `node scripts/validate-plugin-compatibility.mjs`
- Every phase requires policy simulation before enforcement changes.

## Success Metrics

- Drift incidents: downward trend to near-zero (schema/policy/telemetry drift).
- Strict-policy rejection clarity: 100% rejected events have deterministic reason codes.
- Plugin reliability: measurable reduction in unknown runtime states.
- Learning quality: lower false-positive anti-pattern flags and higher outcome calibration.
- Replay confidence: deterministic reproduction for seeded traces in policy sim.

## Resolved Decision Baseline (Approved)

1. Production signing default:
   - **`require-valid-signature`**
   - rollout pattern: shadow policy simulation first, then enforce.
2. Minimum fidelity for policy-changing production learning updates:
   - **`live` required**
   - degraded data allowed only for observational/shadow pipelines.
3. Plugin quarantine behavior:
   - **hybrid**
   - automatic quarantine for high-severity failures (crash-loop, signature policy violations, dependency break)
   - manual approval path for low-severity degradations.
4. Learning anti-gaming strictness:
   - **hybrid**
   - hard-block high-confidence abuse patterns
   - soft-penalty + review queue for uncertain anomalies.

## Execution Profile

- Profile name: `control-plane-strict-v1`
- Intended environment defaults:
  - production: strict enforcement
  - non-production: warn/simulate-first
- Preconditions before enabling strict production profile:
  - policy simulation endpoint shows acceptable rejection ratio
  - governance scripts pass
  - rollback toggle validated in staging

## Initial Implementation Tranche (Immediate)

1. Enforce production default policy in orchestration ingestion (`require-valid-signature` unless explicit override).
2. Add learning update gate so policy-mutating updates require `live` fidelity.
3. Add plugin quarantine severity map + reason codes to runtime health contract.
4. Add anti-gaming classifier buckets (hard-block vs review) with audit trail.

Verification for this tranche:
- governance scripts pass
- policy simulation verifies expected acceptance/rejection under strict defaults
- orchestration API surfaces enforcement/fidelity/quarantine state transparently
