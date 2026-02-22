# Executor Implementation Protocol

This protocol defines the minimum context and execution standards for any agent implementing orchestration/control-plane changes in this repository.

## Mission

Implement changes that improve reliability, observability, safety, and adaptability of orchestration with production-grade evidence. No speculative changes. No silent regressions.

## Non-Negotiable Invariants

- Single source of truth for schemas/policies where possible.
- No hidden degradation: fidelity and risk states must be explicit.
- Determinism where randomness affects routing decisions.
- Verifiable provenance for ingested orchestration events.
- Backward compatibility or explicit migration path for contract changes.
- Evidence before completion claims (checks, build, diagnostics).

## Required Context Before Any Implementation

An executor must gather and use these artifacts before editing code:

1. `opencode-config-schema.json`
2. `opencode-config/opencode.json`
3. `opencode-config/rate-limit-fallback.json`
4. `packages/opencode-config-loader/src/index.js`
5. `packages/opencode-dashboard/src/app/api/orchestration/route.ts`
6. `packages/opencode-model-router-x/src/strategies/fallback-layer-strategy.js`
7. `packages/opencode-fallback-doctor/src/index.js`
8. Governance scripts:
   - `scripts/validate-control-plane-schema.mjs`
   - `scripts/validate-fallback-consistency.mjs`
   - `scripts/validate-plugin-compatibility.mjs`

If a task touches plugin health/lifecycle, also include:

- `packages/opencode-dashboard/src/app/api/health/route.ts`

## Implementation Workflow (Mandatory)

1. Define target contract delta (inputs, outputs, invariants).
2. Implement smallest safe change set.
3. Add/update guardrails (schema/validation/governance script) in same PR.
4. Verify no drift across router/doctor/config/dashboard.
5. Produce operator-facing behavior notes (strict-mode impact, env vars, compatibility).

## Completion Evidence (Required)

Must include command output outcomes for:

- `node scripts/validate-control-plane-schema.mjs`
- `node scripts/validate-fallback-consistency.mjs`
- `node scripts/validate-plugin-compatibility.mjs`
- `bunx next build` in `packages/opencode-dashboard` (or explicit pre-existing blocker callout)

If a check fails due pre-existing unrelated issues, state exact file and reason.

## Control-Plane Quality Gates

An implementation is incomplete if any apply:

- Introduces new config keys without schema/update path.
- Allows policy bypass without explicit mode flag and telemetry visibility.
- Writes/ingests events without provenance metadata handling.
- Changes fallback behavior without consistency checks.
- Returns demo/degraded data without explicit fidelity metadata.

## Env Vars and Modes

Executors must preserve and document behavior for:

- `OPENCODE_REPLAY_SEED`
- `OPENCODE_EVENT_SIGNING_KEY`
- `OPENCODE_EVENT_SIGNING_MODE` (`off|allow-unsigned|require-signed|require-valid-signature`)
- `DASHBOARD_ADMIN_TOKEN`

Strict mode changes must include safe default behavior and rejection diagnostics.

## Risk Scoring for Proposed Changes

Every non-trivial PR should score each change area:

- Reliability risk (1-5)
- Security risk (1-5)
- Drift risk (1-5)
- Operability impact (1-5)

If any score is 4 or 5, include rollback and simulation notes.

## Handoff Template

Executors should leave this summary in final output:

- Contract delta:
- Files changed:
- Guardrails added/updated:
- Validation results:
- Known pre-existing blockers:
- Runtime toggles/flags affected:
- Follow-up hardening opportunities:
