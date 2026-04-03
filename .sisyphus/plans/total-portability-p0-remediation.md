# Total Portability P0 Remediation (Implementation-Ready)

## TL;DR

> **Quick Summary**: Close all currently identified P0 portability gaps so release decisions are strictly aligned with TOTAL replicability policy across the entire repo surface (Windows+Linux, Dev+CI, zero waivers).
>
> **Deliverables**:
> - Zero-waiver enforcement in portability verdict path
> - Full trigger/surface coverage for plugins/local-coupled areas
> - Full-surface execution proof (not threshold-based)
> - Deterministic convergence and signed evidence contract enforcement
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: A2/C2 policy hardening → A1/B1/B2 coverage closure → E1/A3 runtime proof contract → D1/B3 convergence closure

---

## Context

### Original Request
User asked to proceed autonomously until implementation-ready because the system is in a transitory broken state.

### Interview Summary
**Locked policy requirements**:
- TOTAL replicability
- Entire repo surface (source-controlled + reproducible state)
- Dev+CI scope on Windows+Linux
- Any P0 gap blocks release
- Zero waivers
- Internal mirror/cache + pinned dependencies
- Same-run, same-commit, signed CI evidence only
- CI signing via keyless OIDC

**Primary evidence artifacts**:
- `.sisyphus/drafts/portability-final-gap-register.md`
- `.sisyphus/drafts/portability-total-gap-audit.md`

### Metis Review
- Delegation unavailable (`Tool execution aborted`), so pre-plan gap analysis was completed manually from finalized evidence-backed register.

---

## Work Objectives

### Core Objective
Make release portability verdicts and checks fully enforce the agreed P0 policy without loopholes, and ensure every declared surface is exercised and evidenced under deterministic Windows+Linux CI runs.

### Concrete Deliverables
- Updated portability/verdict scripts and tests for zero-waiver semantics.
- Updated CI triggers/checks to include full surface.
- Expanded readiness/smoke/proof coverage for plugins + local-coupled contracts.
- Deterministic convergence attestations and signed evidence bundle enforcement.

### Definition of Done
- [ ] All 11 gap IDs (A1, A2, A3, B1, B2, B3, C1, C2, D1, E1, E2) are `PASS` in machine-generated output.
- [ ] No `exception-approved`/waiver pathway can produce pass for any P0 gate.
- [ ] Full-surface required proof is deterministic, same-run, same-commit, signed CI evidence.

### Must Have
- Zero-waiver enforcement and full-surface gate coverage.
- Signed evidence admissibility and failure bundle completeness.

### Must NOT Have (Guardrails)
- No release bypass via partial trigger paths.
- No threshold-only proof where policy requires universal proof.
- No human-only acceptance steps.

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES (Bun test + CI workflows already present)
- **Automated tests**: YES (tests-after per task)
- **Framework**: Bun test (`scripts/tests/**/*.js`)

### Agent-Executed QA Scenarios (applies to every task)
- Frontend-style UI is not primary here; verification is CLI/CI/script based.
- Every task must include:
  - command-level assertions (exit code + deterministic output)
  - negative scenario (policy violation should fail)
  - evidence capture path under `.sisyphus/evidence/`

---

## Execution Strategy

### Parallel Execution Waves

**Wave 1 (Policy hard-stop alignment)**
- Task 1 (A2/A3 core)
- Task 2 (C2)

**Wave 2 (Surface coverage closure)**
- Task 3 (A1)
- Task 4 (B1)
- Task 5 (B2)

**Wave 3 (Runtime proof hardening)**
- Task 6 (E1)
- Task 7 (C1)
- Task 8 (E2)

**Wave 4 (Convergence + local dependency closure)**
- Task 9 (D1)
- Task 10 (B3)
- Task 11 (final signed evidence + verdict integration gate)

### Dependency Matrix

| Task | Depends On | Blocks |
|---|---|---|
| 1 | None | 6, 11 |
| 2 | None | 11 |
| 3 | 1 | 6, 11 |
| 4 | 3 | 6, 11 |
| 5 | 3 | 6, 11 |
| 6 | 1,4,5 | 11 |
| 7 | 1 | 11 |
| 8 | 1 | 11 |
| 9 | 6,7 | 11 |
| 10 | 4 | 11 |
| 11 | 1..10 | None |

---

## TODOs

### Execution Metadata Defaults (applies to all tasks unless overridden)
- **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `ci-cd-automation`, `secure-coding`, `codebase-auditor`
  - **Why**: Tasks are cross-cutting CI/policy/security portability hardening with broad repository impact.
- **Parallelization rule**:
  - Run strictly by wave; tasks within a wave may run in parallel unless blocked by explicit dependency.

### Task Parallelization Map
| Task | Wave | Can Parallelize | Blocked By |
|---|---|---|---|
| 1 | 1 | YES (with 2) | None |
| 2 | 1 | YES (with 1) | None |
| 3 | 2 | YES (with 4,5) | 1 |
| 4 | 2 | YES (with 3,5) | 3 |
| 5 | 2 | YES (with 3,4) | 3 |
| 6 | 3 | YES (with 7,8) | 1,4,5 |
| 7 | 3 | YES (with 6,8) | 1 |
| 8 | 3 | YES (with 6,7) | 1 |
| 9 | 4 | YES (with 10) | 6,7 |
| 10 | 4 | YES (with 9) | 4 |
| 11 | 4 | NO | 1..10 |

- [ ] 1. Enforce zero-waiver portability verdict semantics (A2 + A3 foundation)
  - **What to do**: remove/forbid pass mapping for `exception-approved`; reject waiver fields/statuses in release verdict path.
  - **References**:
    - `scripts/verify-portability.mjs` — current status mapping + strict gate logic.
    - `scripts/generate-portability-report.mjs` — report aggregation path.
    - `scripts/tests/verify-portability.test.js` — existing behavior test patterns.
  - **Acceptance**:
    - New/updated tests fail on any exception status treated as pass.
    - `bun test scripts/tests/verify-portability.test.js` passes with zero-waiver assertions.
  - **QA Scenarios**:
    - Scenario: `exception-approved` injected into gate payload → verdict fails.
    - Scenario: waiver fields present in release payload → hard fail with reason code.

- [ ] 2. Lock release-mode supply chain policy (C2)
  - **What to do**: disable release-mode allowlist/`@latest` bypasses.
  - **References**:
    - `scripts/supply-chain-guard.mjs`
    - `opencode-config/opencode.json`
  - **Acceptance**:
    - Release mode fails when `@latest` appears in governed dependency commands.
    - Release mode ignores permissive env bypass toggles.
  - **QA Scenarios**:
    - Scenario: config with `@latest` in governed field → command exits non-zero.
    - Scenario: fully pinned config → command exits zero.

- [ ] 3. Close workflow trigger coverage gaps for entire surface (A1)
  - **What to do**: include `plugins/**` and governed `local/**`/equivalent contract path in trigger or enforce always-run portability gate.
  - **References**:
    - `.github/workflows/portability-matrix.yml`
    - `.github/workflows/bootstrap-readiness.yml`
    - `.github/workflows/governance-gate.yml`
  - **Acceptance**:
    - Any portability-relevant path mutation triggers required workflows.
    - Path-filter regression tests/fixtures prove trigger coverage.
  - **QA Scenarios**:
    - Scenario: touch plugin metadata path in PR simulation → required gates run.
    - Scenario: touch local-coupled governed path → required gates run.

- [ ] 4. Expand plugin readiness from official baseline to full declared surface (B1)
  - **What to do**: reconcile manifest scope with entire-surface policy and validate all declared plugin-related surfaces.
  - **References**:
    - `scripts/bootstrap-manifest.json`
    - `scripts/verify-plugin-readiness.mjs`
    - `plugins/README.md`
    - `opencode-config/opencode.json`
  - **Acceptance**:
    - Readiness check fails if any declared plugin surface lacks required metadata/contract compliance.
  - **QA Scenarios**:
    - Scenario: remove required metadata from one declared plugin surface → fail.
    - Scenario: full set valid → pass.

- [ ] 5. Add plugin runtime smoke execution parity (B2)
  - **What to do**: extend smoke runner contract beyond `packages/` to plugin runtime surface.
  - **References**:
    - `scripts/run-package-smokes.mjs`
    - `scripts/tests/package-smoke-runner.test.js`
  - **Acceptance**:
    - Unified smoke run includes package + plugin runtime checks on both OS jobs.
  - **QA Scenarios**:
    - Scenario: intentionally broken plugin smoke target → run fails with isolated reason.
    - Scenario: all smoke targets healthy → run passes.

- [ ] 6. Replace threshold proof with universal deterministic exercise attestations (E1)
  - **What to do**: move from threshold/telemetry recency to 100% required-surface same-run attestations.
  - **References**:
    - `scripts/verify-portability.mjs`
    - `scripts/mcp-smoke-harness.mjs`
    - `scripts/runtime-tool-surface-proof.mjs`
  - **Acceptance**:
    - Gate fails if any required surface lacks same-run attestation.
  - **QA Scenarios**:
    - Scenario: one required MCP/tool path unexercised → fail with deterministic missing list.
    - Scenario: all required paths exercised in same run → pass.

- [ ] 7. Add runtime environment realization probes (C1)
  - **What to do**: supplement schema checks with effective-runtime probes across Windows+Linux.
  - **References**:
    - `scripts/env-contract-check.mjs`
    - `.env.example`
    - `.github/workflows/portability-matrix.yml`
  - **Acceptance**:
    - Runtime probe output captured and compared to expected contract fields.
  - **QA Scenarios**:
    - Scenario: schema-valid but runtime-invalid env realization → fail.
    - Scenario: schema+runtime valid → pass.

- [ ] 8. Increase non-mocked runtime scenario assurance (E2)
  - **What to do**: define and enforce minimum non-mocked scenario ratio and critical-path real execution set.
  - **References**:
    - `scripts/runtime-workflow-scenarios.mjs`
    - `scripts/tests/runtime-workflow-scenarios.test.js`
  - **Acceptance**:
    - Policy gate fails below required non-mocked ratio or missing critical real scenarios.
  - **QA Scenarios**:
    - Scenario: mocked-heavy run below threshold → fail.
    - Scenario: threshold satisfied + critical real paths present → pass.

- [ ] 9. Implement artifact-level convergence attestations (D1)
  - **What to do**: prove fresh-clone and pull-reconcile converge to equivalent verified state per artifact class.
  - **References**:
    - `scripts/sync-reconcile.mjs`
    - `.github/workflows/bootstrap-readiness.yml`
    - `scripts/generate-portability-report.mjs`
  - **Acceptance**:
    - Deterministic equivalence evidence produced for all governed artifact classes.
  - **QA Scenarios**:
    - Scenario: inject controlled drift in one artifact class → convergence check fails.
    - Scenario: clean reconciliation path → convergence check passes.

- [ ] 10. Resolve local-coupled parity contract ambiguity (B3)
  - **What to do**: remove gitignored `local/` dependencies from P0 release decision paths and replace with source-controlled, reproducible contract inputs.
  - **References**:
    - `scripts/verify-plugin-parity.mjs`
    - `local/oh-my-opencode/...` (current assumptions)
    - policy docs in `.sisyphus/drafts/portability-final-gap-register.md`
  - **Acceptance**:
    - No gitignored local-only dependency remains in any P0 release decision path.
    - Any required parity source is represented by source-controlled or deterministically generated evidence input.
  - **QA Scenarios**:
    - Scenario: local path absent in clean runner while release gate executes → deterministic behavior (no implicit dependency).
    - Scenario: parity proof generated from governed source-controlled inputs → pass.

- [ ] 11. Final signed evidence bundle + release gate enforcement integration
  - **What to do**: enforce same-run same-commit signed evidence admissibility, mandatory failure bundles, reason codes + free text, and top-level verdict determinism.
  - **References**:
    - `.sisyphus/drafts/portability-total-gap-audit.md` (policy locks)
    - `.sisyphus/drafts/portability-final-gap-register.md` (gap IDs/reason codes)
    - portability workflows and report scripts above
  - **Acceptance**:
    - Release verdict fails on missing signature, stale commit binding, missing failure artifacts, timeout, or missing gate result.
    - Output includes machine-readable reason codes and explanatory text.
  - **QA Scenarios**:
    - Scenario: unsigned evidence artifact in CI release context → fail.
    - Scenario: signed same-run bundle complete with all P0 gates pass → release portability gate passes.

---

## Commit Strategy

| Phase | Suggested Commit Message | Scope |
|---|---|---|
| Wave 1 | `fix(portability): enforce zero-waiver and strict supply-chain release semantics` | Tasks 1-2 |
| Wave 2 | `feat(portability): close full-surface trigger and plugin execution coverage` | Tasks 3-5 |
| Wave 3 | `feat(portability): require deterministic universal runtime proof` | Tasks 6-8 |
| Wave 4 | `feat(portability): enforce convergence and signed evidence admissibility` | Tasks 9-11 |

---

## Success Criteria

### Verification Commands
```bash
bun test scripts/tests/verify-portability.test.js
bun test scripts/tests/verify-plugin-readiness.test.js
bun test scripts/tests/package-smoke-runner.test.js
bun test scripts/tests/runtime-tool-surface-proof.test.js
bun test scripts/tests/mcp-smoke-harness.test.js
bun test scripts/tests/bootstrap-ci-scenarios.test.js
```

### Final Checklist
- [ ] All P0 gaps in final register show `PASS` with signed same-run CI evidence.
- [ ] Zero waiver pathways remain in release portability decision logic.
- [ ] Entire-surface trigger + exercise coverage is enforced.
- [ ] Convergence and evidence admissibility policies are machine-enforced.
