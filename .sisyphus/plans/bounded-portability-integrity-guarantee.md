# Bounded Portability & Integrity Guarantee Plan

## TL;DR

> **Quick Summary**: Convert remaining portability/security blind spots into release-blocking, machine-verifiable gates for a bounded Tiered LTS matrix (Windows/macOS/Linux current+previous stable, x64+arm64), targeting 99.5% per-release critical-path pass rate.
>
> **Deliverables**:
> - Support-floor enforcement gate (OS/arch/runtime contract)
> - Hermeticity/no-global-state gate
> - Fail-closed supply-chain trust gate
> - Determinism gate (filesystem/time/locale/encoding)
> - Restore-drill evidence gate (RTO 1h / RPO 15m)
> - Privilege/break-glass governance gate
> - Tamper-evident observability integrity checks
> - Tiered matrix release verdict/report integration
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 8 → Task 9

---

## Context

### Original Request
Assess what may still be missing after previous portability hardening passes to reach highly adaptable, reliable, secure operation on this machine and across supported environments.

### Interview Summary
**Key decisions confirmed**:
- Guarantee model: **Bounded guarantee**
- Support boundary: **Tiered LTS matrix** (Windows/macOS/Linux current + previous stable, x64 + arm64)
- Confidence target: **99.5%**
- Confidence metric: **Per-release acceptance**
- Threat priority: **Balanced** (accidental drift + supply-chain compromise + privilege misuse)
- Tier policy: **Strict both tiers** (required critical-path checks are release-blocking)
- Supply-chain baseline: **Fail-closed trusted pipeline**
- Privilege governance: **Dual approval + immutable audit**
- Recovery objective: **RTO 1h / RPO 15m**
- Compliance: **No mandatory external framework mapping**
- Offline/air-gapped: **Out of scope**
- Test strategy: **TDD**, plus mandatory agent-executed QA scenarios

### Defaults Applied (ambiguous items resolved)
- **Support-floor version resolution**: “current + previous stable” means vendor-designated stable major/minor at release-cut date.
- **Confidence sample minimum**: require at least **200 critical-path matrix executions per release window**; below this, report `insufficientEvidence` and block confidence claim.
- **Connected-environment assumption**: normal outbound connectivity is permitted, but release gates remain fail-closed for trust/integrity violations.

### Metis Review (incorporated)
Addressed gaps by explicitly requiring:
- Release-blocking JSON gates for each blind spot
- Support-floor fail-fast checks
- Hermeticity controls against global-state leakage
- Restore-drill evidence tied to RTO/RPO
- Tamper-evident observability requirements
- Explicit anti-scope-creep guardrails

---

## Work Objectives

### Core Objective
Establish auditable, enforceable, release-blocking controls that support high-confidence portability/security/operational integrity claims within the bounded support matrix.

### Concrete Deliverables
- New/updated scripts and policy artifacts implementing gating controls and evidence generation
- CI workflow integration that blocks release when required gates fail
- Consolidated release verdict report with confidence and evidence pointers

### Definition of Done
- [ ] Required gate commands pass on supported matrix and fail deterministically on injected violations
- [ ] Release verdict artifact is generated and includes per-gate status + evidence paths
- [ ] Required critical-path matrix checks are release-blocking for both tiers
- [ ] Restore-drill evidence proves RTO/RPO objective compliance

### Must Have
- Fail-closed behavior for trust/integrity gates
- Deterministic, machine-readable outputs (JSON) for all gates
- Immutable/auditable break-glass path

### Must NOT Have (Guardrails)
- No claim of universal portability outside bounded support matrix
- No silent downgrade from blocking to warning for required gates
- No dependency on manual human verification for acceptance
- No implicit reliance on user-global HOME/gitconfig/locale/timezone in release-critical checks

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> All verification is agent-executed via commands/tooling. No manual testing steps.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD
- **Framework**: Bun test + script-level command gates

### If TDD Enabled
Each task with new gate logic follows RED-GREEN-REFACTOR:
1. RED: add failing test/spec for violated contract
2. GREEN: implement minimum behavior to satisfy contract
3. REFACTOR: improve structure while preserving green state

### Agent-Executed QA Scenarios (applies to all tasks)
All tasks include:
- Happy-path scenario (gate passes)
- Negative-path scenario (gate fails with deterministic reason)
- Evidence artifacts in `.sisyphus/evidence/`

---

## Execution Strategy

### Parallel Execution Waves

```text
Wave 1 (Foundation)
├── Task 1: Support-floor contract gate
├── Task 2: Hermeticity gate
└── Task 3: Supply-chain trust gate

Wave 2 (Determinism & Recovery)
├── Task 4: Determinism gate
├── Task 5: Restore-drill gate
└── Task 6: Privilege governance gate

Wave 3 (Observability & Matrix)
├── Task 7: Tamper-evident observability checks
└── Task 8: Tiered matrix blocking integration

Wave 4 (Aggregation)
├── Task 9: Release verdict/report aggregator
└── Task 10: ADR + control ownership + exceptions governance

Critical Path: 1 → 8 → 9
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|----------------------|
| 1 | None | 8, 9 | 2, 3 |
| 2 | None | 9 | 1, 3 |
| 3 | None | 8, 9 | 1, 2 |
| 4 | 1 | 9 | 5, 6 |
| 5 | 1 | 9 | 4, 6 |
| 6 | 3 | 9 | 4, 5 |
| 7 | 3, 6 | 9 | 8 |
| 8 | 1, 3 | 9 | 7 |
| 9 | 2, 4, 5, 7, 8 | 10 | None |
| 10 | 9 | None | None |

---

## TODOs

- [x] 1. Implement support-floor enforcement gate

  **What to do**:
  - Add explicit supported platform/runtime contract (OS/version tier, arch, Bun version source of truth).
  - Implement fail-fast gate returning deterministic JSON (`supported`, `reason`, `detected` fields).
  - Add RED/GREEN tests for supported and intentionally unsupported cases.

  **Must NOT do**:
  - Do not infer support implicitly from passing tests.
  - Do not allow unknown platforms to pass silently.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: cross-platform policy + contract gate design
  - **Skills**: `architecture-design`, `linting-standards`
    - `architecture-design`: policy/contract clarity
    - `linting-standards`: quality gate hygiene

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 1 (with 2, 3)
  - Blocks: 8, 9
  - Blocked By: None

  **References**:
  - `scripts/verify-portability.mjs` - existing portability verification entry point and JSON reporting model.
  - `.github/workflows/portability-matrix.yml` - matrix execution context to align support-floor contract enforcement.
  - `package.json` - script wiring pattern for strict verification gates.
  - `.bun-version` - canonical Bun version source for runtime floor.

  **Acceptance Criteria**:
  - [ ] RED: test/spec fails when simulated unsupported OS/runtime is injected.
  - [ ] GREEN: `node scripts/verify-portability.mjs --strict --json` includes `supportFloorReport`.
  - [ ] Negative: unsupported environment exits non-zero with explicit `reason`.

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Supported runtime passes support-floor gate
    Tool: Bash
    Preconditions: Supported matrix runner, repo checked out
    Steps:
      1. Run: node scripts/verify-portability.mjs --strict --json > .sisyphus/evidence/task-1-supported.json
      2. Parse JSON and assert: supportFloorReport.supported == true
      3. Assert: process exit code == 0
    Expected Result: Gate passes with supported=true
    Evidence: .sisyphus/evidence/task-1-supported.json

  Scenario: Unsupported floor fails deterministically
    Tool: Bash
    Preconditions: Test harness can inject unsupported floor fixture
    Steps:
      1. Run fixture command that simulates unsupported runtime
      2. Assert: exit code != 0
      3. Assert: JSON contains supportFloorReport.reason (non-empty)
    Expected Result: Hard fail with explicit reason
    Evidence: .sisyphus/evidence/task-1-unsupported.json
  ```

- [x] 2. Add hermeticity/no-global-state gate

  **What to do**:
  - Add checks ensuring release-critical scripts do not read/write uncontrolled user-global locations.
  - Enforce deterministic env baselines (`LC_ALL`, `TZ`, temp/cache roots).
  - Add TDD tests for accidental HOME/global leak behavior.

  **Must NOT do**:
  - No silent fallback to user-global state.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `clean-architecture`, `linting-standards`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 1
  - Blocks: 9
  - Blocked By: None

  **References**:
  - `scripts/verify-portability.mjs` - current checks and strict-mode behavior.
  - `scripts/fault-injection-tests.mjs` - pattern for negative-path reliability checks.

  **Acceptance Criteria**:
  - [ ] RED: global-state leak test fails before implementation.
  - [ ] GREEN: strict verification reports hermeticity pass/fail details.
  - [ ] Negative: intentional global-state dependency triggers non-zero exit.

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Hermetic execution with isolated env passes
    Tool: Bash
    Preconditions: Temporary HOME and cache directories available
    Steps:
      1. Set env: HOME=<temp>, XDG_* = <temp>, TZ=UTC, LC_ALL=C
      2. Run: node scripts/verify-portability.mjs --strict --json > .sisyphus/evidence/task-2-hermetic-pass.json
      3. Assert: hermeticityReport.status == "ok"
    Expected Result: Gate passes without global-state access
    Evidence: .sisyphus/evidence/task-2-hermetic-pass.json

  Scenario: Injected global-state dependency is blocked
    Tool: Bash
    Preconditions: Fault-injection toggle for global dependency enabled
    Steps:
      1. Run strict verifier with fault toggle
      2. Assert: exit code != 0
      3. Assert: hermeticityReport.violations length > 0
    Expected Result: Deterministic fail on global-state violation
    Evidence: .sisyphus/evidence/task-2-hermetic-fail.json
  ```

- [x] 3. Enforce fail-closed supply-chain trust policy gate

  **What to do**:
  - Verify pinning/integrity/provenance/signature requirements for release mode.
  - Add exception path contract (time-bound + approved + auditable) without default bypass.
  - Add RED tests for untrusted source/provenance mismatch.

  **Must NOT do**:
  - No warning-only mode in release-gating path.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `api-security`, `secure-coding`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 1
  - Blocks: 8, 9
  - Blocked By: None

  **References**:
  - `package.json` (`verify:strict`) - strict gate entrypoint integration.
  - `scripts/generate-portability-report.mjs` - report aggregation extension point.
  - `scripts/lock-integrity-allowlist.json` - allowlist pattern to mirror exception governance style.

  **Acceptance Criteria**:
  - [ ] RED: provenance mismatch causes strict gate failure.
  - [ ] GREEN: strict gate passes with trusted inputs.
  - [ ] Exception path requires approval metadata and emits auditable record.

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Trusted dependency/provenance passes
    Tool: Bash
    Preconditions: Trusted/pinned dependency graph fixture
    Steps:
      1. Run strict verify in release mode
      2. Assert: supplyChainReport.status == "ok"
      3. Assert: exit code == 0
    Expected Result: Fail-closed policy passes only for trusted inputs
    Evidence: .sisyphus/evidence/task-3-supplychain-pass.json

  Scenario: Provenance mismatch hard-fails release gate
    Tool: Bash
    Preconditions: Fixture with tampered/untrusted source
    Steps:
      1. Run strict verify in release mode
      2. Assert: exit code != 0
      3. Assert: supplyChainReport.reason contains "provenance" or "untrusted"
    Expected Result: Release blocked
    Evidence: .sisyphus/evidence/task-3-supplychain-fail.json
  ```

- [x] 4. Implement determinism gate for filesystem/time/locale/encoding

  **What to do**:
  - Add deterministic checks for path case/spacing/unicode and locale/timezone-sensitive outputs.
  - Re-run identical scenarios and verify stable normalized outputs.
  - Add RED tests for locale/TZ-induced variance.

  **Must NOT do**:
  - Do not treat flaky/variant output as acceptable in release path.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `architecture-design`, `linting-standards`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 2 (with 5, 6)
  - Blocks: 9
  - Blocked By: 1

  **References**:
  - `.github/workflows/portability-matrix.yml` - path variant matrix context.
  - `scripts/verify-portability.mjs` - existing probe and report extension points.

  **Acceptance Criteria**:
  - [ ] RED: intentional TZ/locale variance test fails.
  - [ ] GREEN: deterministic report section present and passing.
  - [ ] Repeated runs on same runner produce stable normalized hashes.

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Deterministic output under forced TZ/locale
    Tool: Bash
    Preconditions: TZ=UTC, LC_ALL=C
    Steps:
      1. Run strict verify twice, save JSON outputs
      2. Compare normalized determinism sections
      3. Assert: hashes/normalized outputs match
    Expected Result: Stable deterministic report
    Evidence: .sisyphus/evidence/task-4-determinism-pass.json

  Scenario: Locale drift injection is detected
    Tool: Bash
    Preconditions: Drift fixture or alt locale setup
    Steps:
      1. Run with altered locale/time settings without normalization
      2. Assert: determinismReport.status == "fail"
      3. Assert: exit code != 0 in strict mode
    Expected Result: Drift detected and blocked
    Evidence: .sisyphus/evidence/task-4-determinism-fail.json
  ```

- [x] 5. Add restore-drill evidence gate (RTO 1h / RPO 15m)

  **What to do**:
  - Create automated restore-drill script path and evidence artifact contract.
  - Validate integrity checks (checksum/record consistency) post-restore.
  - Add RED tests for RTO/RPO breach behavior.

  **Must NOT do**:
  - Do not rely on rollback dry-run alone as recovery proof.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `monitoring-observability`, `incident-commander`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 2
  - Blocks: 9
  - Blocked By: 1

  **References**:
  - `scripts/model-rollback.mjs` - rollback workflow compatibility context.
  - `scripts/verify-portability.mjs` rollback reporting pattern.
  - `.sisyphus/reports/portability-report.json` - report artifact structure precedent.

  **Acceptance Criteria**:
  - [ ] RED: simulated RTO/RPO breach fails gate.
  - [ ] GREEN: restore drill emits measurable `rtoMinutes` and `rpoMinutes`.
  - [ ] Strict verify/report includes restore-drill section with pass/fail.

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Restore drill meets target SLOs
    Tool: Bash
    Preconditions: Test backup artifact available
    Steps:
      1. Run restore drill command in test environment
      2. Assert: rtoMinutes <= 60
      3. Assert: rpoMinutes <= 15
      4. Assert: integrity check == pass
    Expected Result: Recovery target achieved
    Evidence: .sisyphus/evidence/task-5-restore-pass.json

  Scenario: RTO breach is blocked
    Tool: Bash
    Preconditions: Fault-injected delayed restore scenario
    Steps:
      1. Run restore drill with induced delay
      2. Assert: rtoMinutes > 60
      3. Assert: strict gate exits non-zero
    Expected Result: Release gate blocks on breach
    Evidence: .sisyphus/evidence/task-5-restore-fail.json
  ```

- [x] 6. Enforce privilege/break-glass governance gate

  **What to do**:
  - Add governance simulation check requiring dual approval metadata for privileged overrides.
  - Require immutable audit entry for each override attempt (approved/denied).
  - Add RED tests for single-approver or missing-audit denial.

  **Must NOT do**:
  - No hidden env var bypass for privileged path.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `api-security`, `secure-coding`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 2
  - Blocks: 9
  - Blocked By: 3

  **References**:
  - `scripts/fault-injection-tests.mjs` - negative-path enforcement test style.
  - `scripts/generate-portability-report.mjs` - include governance evidence summary.

  **Acceptance Criteria**:
  - [ ] Missing second approval causes hard fail.
  - [ ] Approved override path requires immutable audit record.
  - [ ] Strict report includes governance verification status.

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Dual-approved override passes and is audited
    Tool: Bash
    Preconditions: Valid dual approval fixture
    Steps:
      1. Run governance simulation command
      2. Assert: status == approved
      3. Assert: immutableAuditRecordId exists
    Expected Result: Controlled override path works with audit
    Evidence: .sisyphus/evidence/task-6-governance-pass.json

  Scenario: Single-approval override is denied
    Tool: Bash
    Preconditions: Single approval fixture
    Steps:
      1. Run governance simulation command
      2. Assert: status == denied
      3. Assert: exit code != 0
      4. Assert: denial audit entry exists
    Expected Result: Fail-closed governance
    Evidence: .sisyphus/evidence/task-6-governance-fail.json
  ```

- [x] 7. Add tamper-evident observability integrity checks

  **What to do**:
  - Ensure critical gate/audit events have tamper-evidence (hash chain/signature or equivalent integrity marker).
  - Verify event traceability from check execution to release verdict.
  - Add RED tests for hash-chain break/tampered evidence.

  **Must NOT do**:
  - No mutable, unverified evidence accepted for release decisions.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `monitoring-observability`, `secure-coding`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 3 (with 8)
  - Blocks: 9
  - Blocked By: 3, 6

  **References**:
  - `packages/opencode-model-manager/src/lifecycle/audit-logger.js` - immutable/hash-chain logging pattern in repo conventions.
  - `.sisyphus/reports/portability-report.json` - release evidence schema extension point.

  **Acceptance Criteria**:
  - [ ] Tampered evidence produces non-zero fail in strict mode.
  - [ ] Untampered evidence passes and links to release verdict.

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Untampered evidence chain validates
    Tool: Bash
    Preconditions: Generated report/evidence bundle
    Steps:
      1. Run evidence integrity validation command
      2. Assert: chainValid == true
      3. Assert: exit code == 0
    Expected Result: Evidence accepted
    Evidence: .sisyphus/evidence/task-7-observability-pass.json

  Scenario: Tamper detection blocks release
    Tool: Bash
    Preconditions: Modify one evidence payload byte in fixture
    Steps:
      1. Run evidence integrity validation
      2. Assert: chainValid == false
      3. Assert: exit code != 0
    Expected Result: Tamper detected and blocked
    Evidence: .sisyphus/evidence/task-7-observability-fail.json
  ```

- [x] 8. Integrate strict both-tier blocking in CI matrix

  **What to do**:
  - Update workflow logic so required critical-path checks are blocking for current and previous stable tiers.
  - Ensure shell-safe execution across Windows + bash/pwsh contexts.
  - Add RED tests/workflow checks for accidental non-blocking regression.

  **Must NOT do**:
  - No shell-specific script blocks that silently skip on some matrix legs.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `github-actions`, `ci-cd-automation`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 3
  - Blocks: 9
  - Blocked By: 1, 3

  **References**:
  - `.github/workflows/portability-matrix.yml` - existing matrix and path-variant logic to harden.
  - `scripts/verify-portability.mjs` - command invoked by matrix jobs.

  **Acceptance Criteria**:
  - [ ] Required checks fail workflow on both tiers when gate failure injected.
  - [ ] Required checks pass workflow on both tiers under healthy baseline.
  - [ ] No shell-compatibility regressions across matrix legs.

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Tiered matrix required checks block on failure
    Tool: Bash (gh/CI simulation)
    Preconditions: Test branch with injected gate failure
    Steps:
      1. Trigger portability matrix workflow
      2. Wait for current + previous stable jobs
      3. Assert: workflow conclusion == failure
      4. Assert: failing check is marked required
    Expected Result: Release blocked on either tier failure
    Evidence: .sisyphus/evidence/task-8-matrix-fail.json

  Scenario: Healthy baseline passes both tiers
    Tool: Bash (gh/CI)
    Preconditions: No injected failures
    Steps:
      1. Trigger matrix workflow
      2. Assert: required jobs success for both tiers
      3. Assert: workflow conclusion == success
    Expected Result: Gate allows promotion
    Evidence: .sisyphus/evidence/task-8-matrix-pass.json
  ```

- [x] 9. Extend release verdict aggregation/reporting

  **What to do**:
  - Extend portability report to include new gate sections and final release verdict.
  - Encode confidence statement only when all required evidence and thresholds are met.
  - Add RED tests for missing evidence/incomplete samples.

  **Must NOT do**:
  - Do not produce “99.5% claim” if evidence is incomplete (must emit `insufficientEvidence`).

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `clean-architecture`, `linting-standards`

  **Parallelization**:
  - Can Run In Parallel: NO
  - Parallel Group: Wave 4
  - Blocks: 10
  - Blocked By: 2, 4, 5, 7, 8

  **References**:
  - `scripts/generate-portability-report.mjs` - existing report generator.
  - `.sisyphus/reports/portability-report.json` - current output structure.
  - `package.json` (`portability:report`, `verify:strict`) - script wiring.

  **Acceptance Criteria**:
  - [ ] Report includes all gate statuses and evidence paths.
  - [ ] `overallOk` is false when any required gate fails.
  - [ ] Confidence claim shown only when all required conditions met.

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Complete evidence yields positive release verdict
    Tool: Bash
    Preconditions: All gate tasks passing
    Steps:
      1. Run: node scripts/generate-portability-report.mjs
      2. Assert: report.summary.overallOk == true
      3. Assert: report.summary.confidenceClaim == "99.5%"
    Expected Result: Positive bounded guarantee verdict
    Evidence: .sisyphus/reports/portability-report.json

  Scenario: Missing required evidence blocks confidence claim
    Tool: Bash
    Preconditions: Remove one required gate evidence artifact in fixture
    Steps:
      1. Run report generation
      2. Assert: summary.confidenceClaim == "insufficientEvidence"
      3. Assert: overallOk == false
    Expected Result: No unsupported claim emitted
    Evidence: .sisyphus/evidence/task-9-report-fail.json
  ```

- [x] 10. Publish ADR/control ownership/exception governance policy

  **What to do**:
  - Write governance ADR describing bounded guarantee semantics, ownership by control family, waiver process, and escalation.
  - Tie each gate to owner, evidence location, cadence, and failure action.

  **Must NOT do**:
  - No ambiguous ownership for balanced threat categories.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: `architecture-design`, `stakeholder-communication`

  **Parallelization**:
  - Can Run In Parallel: NO
  - Parallel Group: Wave 4
  - Blocks: None
  - Blocked By: 9

  **References**:
  - `.sisyphus/plans/bounded-portability-integrity-guarantee.md` - source of truth for control set.
  - `docs/` architecture and governance docs - alignment with existing repository documentation style.

  **Acceptance Criteria**:
  - [ ] ADR includes bounded support statement and explicit out-of-scope policy.
  - [ ] Every gate mapped to owner + failure action + evidence path.
  - [ ] Waiver policy requires dual approval + expiry + immutable audit reference.

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Governance artifact completeness check
    Tool: Bash
    Preconditions: ADR/control matrix generated
    Steps:
      1. Run governance linter/check script
      2. Assert: every gate has owner and failure action
      3. Assert: waiver schema includes approvers + expiry + audit id
    Expected Result: Governance artifact is complete and enforceable
    Evidence: .sisyphus/evidence/task-10-governance-pass.json

  Scenario: Missing owner fails policy check
    Tool: Bash
    Preconditions: Fixture with owner removed from one control
    Steps:
      1. Run governance check
      2. Assert: exit code != 0
      3. Assert: error references missing control owner
    Expected Result: Incomplete governance is blocked
    Evidence: .sisyphus/evidence/task-10-governance-fail.json
  ```

---

## Commit Strategy

| After Task(s) | Message | Verification |
|---------------|---------|--------------|
| 1-3 | `feat(portability): add foundational bounded-guarantee gates` | strict verify + targeted negative tests |
| 4-6 | `feat(integrity): add determinism recovery and governance gates` | strict verify + restore/governance scenarios |
| 7-8 | `feat(ci): enforce tamper-evident evidence and tiered blocking` | matrix workflow validation |
| 9-10 | `feat(reporting): aggregate bounded-guarantee verdict and ownership ADR` | report generation + governance completeness check |

---

## Success Criteria

### Verification Commands (target state)
```bash
node scripts/verify-portability.mjs --strict --json
node scripts/fault-injection-tests.mjs
node scripts/generate-portability-report.mjs
```

### Final Checklist
- [x] All required bounded-guarantee gates exist and are release-blocking where specified
- [x] Both tiers enforce required critical-path checks
- [x] 99.5% per-release acceptance claim only appears with sufficient evidence
- [x] RTO/RPO gate proves 1h/15m objective
- [x] Dual-approval break-glass governance is enforced and auditable
- [x] No universal guarantee claim outside the bounded matrix
