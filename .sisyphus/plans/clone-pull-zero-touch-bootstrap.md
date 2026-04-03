# Clone/Pull Zero-Touch Bootstrap Guarantee Plan

## TL;DR

> **Quick Summary**: Deliver a secure, near-zero-setup onboarding flow where a fresh clone becomes ready via one explicit command (`setup`), and post-pull drift is reconciled via one explicit command (`sync`) with CI enforcement.
>
> **Deliverables**:
> - Authoritative “core + official plugins” functionality manifest
> - Idempotent `setup` and `sync` command contract
> - Opt-in hook installer (no hidden clone/pull auto-execution)
> - CI scenarios for fresh clone, pull-reconcile, timing SLO, and drift blocking
> - Release-verdict/report extension for minimal-setup guarantees
>
> **Estimated Effort**: Large  
> **Parallel Execution**: YES (4 waves)  
> **Critical Path**: 1 → 2 → 3 → 6 → 9

---

## Context

### Original Request
Guarantee that the ecosystem transports all functionality with minimal setup on each clone/pull, ideally automatic.

### Interview Summary
**Confirmed decisions**:
- Automation model: **One-command bootstrap + opt-in hooks**
- Guarantee scope: **Core + official plugins**
- Environment scope (v1): **Dev machines + CI**
- Setup SLO: **<= 10 minutes** fresh clone to ready
- Enforcement: **Warn locally, block in CI**
- Test strategy: **TDD (RED-GREEN-REFACTOR)** + agent-executed QA scenarios

### Research Findings
- Existing setup anchor already exists (`bun run setup` via `scripts/setup-resilient.mjs`)
- Existing strict-gate and portability CI infrastructure can be reused
- Security constraint: no safe default for hidden arbitrary code execution on clone/pull
- Oracle recommendation: explicit `setup` + explicit `sync`, optional hermetic fallback

### Metis Review (incorporated)
- Add explicit source-of-truth manifest for “core + official plugins”
- Define precise `sync` reconcile semantics (conflict behavior, generated-file policy)
- Add idempotency guarantees and no-hidden-exec policy checks
- Add machine-verifiable timing and drift criteria

---

## Work Objectives

### Core Objective
Create an auditable, deterministic bootstrap/reconcile system that minimizes manual setup while preserving security and cross-platform reliability.

### Concrete Deliverables
- Functionality manifest + verification contract
- Unified `setup` and `sync` command paths with JSON report outputs
- CI enforcement jobs proving fresh-clone and post-pull readiness
- Final report/verdict showing readiness claim validity

### Definition of Done
- [ ] Fresh clone + `setup` reaches ready state within <=10 minutes on supported targets
- [ ] Pull + `sync` reconciles drift deterministically and blocks CI on unresolved state
- [ ] Official plugin/core functionality manifest verifies with zero missing/failed entries
- [ ] No hidden clone/pull auto-execution paths exist; opt-in hooks only

### Must Have
- Fail-closed CI checks for missing reconcile/manifest drift
- Idempotent `setup`/`sync` behavior
- Machine-readable verification outputs and evidence artifacts

### Must NOT Have (Guardrails)
- No implicit automatic code execution on clone/pull
- No unpinned or unverifiable critical dependency behavior in release path
- No mandatory live external-credential provisioning in baseline setup
- No universal guarantee language beyond bounded scope

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**  
> Verification is fully agent-executed with commands and artifacts.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD
- **Framework**: Bun tests + script-level command gates

### TDD Contract
For each task touching logic:
1. RED: add failing spec for contract violation
2. GREEN: minimal implementation to pass
3. REFACTOR: improve structure, keep green

### Agent-Executed QA Scenarios (all tasks)
Each task includes:
- Happy path (success)
- Negative path (deterministic failure)
- Evidence in `.sisyphus/evidence/task-{N}-*.json`

---

## Execution Strategy

### Parallel Waves

```text
Wave 1 (Contracts)
├── Task 1: Define functionality manifest + ownership contract
└── Task 4: No-hidden-exec policy and opt-in hook contract

Wave 2 (Core Commands)
├── Task 2: Harden idempotent setup orchestration
└── Task 3: Implement explicit sync reconcile command

Wave 3 (Verification)
├── Task 5: Prereq/deterministic env contract checks
├── Task 6: CI fresh-clone + pull-reconcile + SLO jobs
└── Task 7: Official-plugin readiness verification gate

Wave 4 (Reporting & Governance)
├── Task 8: Claim-language and governance docs
└── Task 9: Release verdict/report integration
```

### Dependency Matrix

| Task | Depends On | Blocks | Parallel With |
|---|---|---|---|
| 1 | None | 2,3,7,9 | 4 |
| 2 | 1 | 6,9 | 3 |
| 3 | 1 | 6,9 | 2 |
| 4 | None | 6,8 | 1 |
| 5 | 2 | 6,9 | 7 |
| 6 | 2,3,4,5,7 | 9 | None |
| 7 | 1 | 6,9 | 5 |
| 8 | 4 | 9 | None |
| 9 | 1,2,3,5,6,7,8 | None | None |

---

## TODOs

- [ ] 1. Define authoritative functionality manifest (core + official plugins)
  - **What to do**: Create/extend manifest that enumerates guaranteed components, load checks, and ownership metadata.
  - **Must NOT do**: Do not infer “official” dynamically from uncontrolled runtime state.
  - **Recommended Agent Profile**: category `architecture-design`; skills `architecture-design`, `clean-architecture`
  - **Parallelization**: YES (Wave 1), Blocks 2/3/7/9
  - **References**:
    - `scripts/verify-setup.mjs` (existing readiness checks)
    - `scripts/check-skill-consistency.mjs` (registry consistency patterns)
    - `opencode-config/` (configuration source patterns)
  - **Acceptance Criteria**:
    - [ ] RED: test fails when manifest entry is missing/invalid
    - [ ] GREEN: manifest validator returns deterministic pass/fail JSON
    - [ ] Evidence: `.sisyphus/evidence/task-1-manifest-*.json`

- [ ] 2. Harden `setup` into idempotent one-command bootstrap
  - **What to do**: Ensure `bun run setup` converges on repeated runs and emits machine-readable report (timing, outcomes, failures).
  - **Must NOT do**: No hidden writes to user-global state without explicit flag.
  - **Recommended Agent Profile**: category `unspecified-high`; skills `ci-cd-automation`, `linting-standards`
  - **Parallelization**: YES (Wave 2), Blocked by 1
  - **References**:
    - `scripts/setup-resilient.mjs` (primary orchestrator)
    - `scripts/copy-config.mjs`, `scripts/generate-mcp-config.mjs` (setup sub-steps)
  - **Acceptance Criteria**:
    - [ ] RED: repeated setup run currently leaves drift or non-deterministic output
    - [ ] GREEN: second run reports no additional required changes
    - [ ] `setup` report includes duration_seconds and step statuses

- [ ] 3. Implement explicit post-pull `sync` reconcile command
  - **What to do**: Add deterministic reconcile flow for deps/config/generated artifacts after pull.
  - **Must NOT do**: Do not silently overwrite conflicting user-local files.
  - **Recommended Agent Profile**: category `unspecified-high`; skills `architecture-design`, `secure-coding`
  - **Parallelization**: YES (Wave 2), Blocked by 1
  - **References**:
    - `scripts/verify-setup.mjs` (post-setup expectations)
    - `scripts/validate-config-coherence.mjs` (drift/coherence checks)
  - **Acceptance Criteria**:
    - [ ] RED: simulated drift not detected before implementation
    - [ ] GREEN: `sync` resolves allowed drift and fails on protected conflicts
    - [ ] JSON output includes `reconciled`, `blocked`, `reasons`

- [ ] 4. Enforce no-hidden-execution policy + opt-in hooks
  - **What to do**: Add explicit hook install command and policy check that blocks implicit auto-hook activation.
  - **Must NOT do**: No default auto-install on clone/pull.
  - **Recommended Agent Profile**: category `api-security`; skills `api-security`, `secure-coding`
  - **Parallelization**: YES (Wave 1), Blocks 6/8
  - **References**:
    - existing hook install wiring in setup scripts/package scripts
    - governance scripts under `scripts/` for policy-fail patterns
  - **Acceptance Criteria**:
    - [ ] RED: policy test fails when hidden hook activation path exists
    - [ ] GREEN: CI check fails on hidden path and passes on opt-in path

- [ ] 5. Add deterministic prerequisite + environment contract checks
  - **What to do**: Validate required toolchain versions and deterministic env baseline for setup/sync.
  - **Must NOT do**: No best-effort silent degradation for required prereqs in strict mode.
  - **Recommended Agent Profile**: category `unspecified-high`; skills `architecture-design`, `linting-standards`
  - **Parallelization**: YES (Wave 3), Blocked by 2
  - **References**:
    - `.bun-version`, `package.json` scripts
    - `scripts/verify-portability.mjs` (strict deterministic gate patterns)
  - **Acceptance Criteria**:
    - [ ] Missing/invalid prerequisite yields deterministic non-zero failure + reason
    - [ ] Strict mode outputs prerequisite report JSON

- [ ] 6. Integrate CI scenarios: fresh clone, pull reconcile, and SLO assertions
  - **What to do**: Add matrix jobs that run setup/sync paths and enforce <=600s setup budget.
  - **Must NOT do**: No non-blocking `continue-on-error` for required readiness jobs.
  - **Recommended Agent Profile**: category `github-actions`; skills `github-actions`, `ci-cd-automation`
  - **Parallelization**: YES (Wave 3), Blocked by 2/3/4/5/7
  - **References**:
    - `.github/workflows/portability-matrix.yml`
    - `scripts/setup-resilient.mjs`, `scripts/verify-setup.mjs`
  - **Acceptance Criteria**:
    - [ ] Fresh-clone job: setup + verify passes on required matrix legs
    - [ ] Pull-reconcile job: drift injected then sync required to pass
    - [ ] Timing assertion: setup duration_seconds <= 600

- [ ] 7. Add official-plugin readiness gate
  - **What to do**: Verify all manifest-listed official plugins are present/loadable and report failures deterministically.
  - **Must NOT do**: No implicit network-only assumptions without explicit handling.
  - **Recommended Agent Profile**: category `unspecified-high`; skills `architecture-design`, `monitoring-observability`
  - **Parallelization**: YES (Wave 3), Blocked by 1
  - **References**:
    - plugin registry/config files in `opencode-config/`
    - `scripts/verify-setup.mjs` plugin checks
  - **Acceptance Criteria**:
    - [ ] Missing plugin in manifest causes strict failure
    - [ ] Readiness report includes missing/failed arrays

- [ ] 8. Publish governance + claim-language policy for “minimal setup”
  - **What to do**: Document precise claim boundaries, out-of-scope items, opt-in hook policy, and conflict behavior.
  - **Must NOT do**: No “fully automatic clone/pull” claim text.
  - **Recommended Agent Profile**: category `writing`; skills `stakeholder-communication`, `architecture-design`
  - **Parallelization**: NO (Wave 4), Blocked by 4
  - **References**:
    - `docs/adr/` existing governance style
    - this plan + manifest contract
  - **Acceptance Criteria**:
    - [ ] Policy includes explicit terminology: “minimal explicit setup”
    - [ ] Includes owner/escalation path for bootstrap contract

- [ ] 9. Extend release verdict/report aggregation for bootstrap guarantee
  - **What to do**: Integrate setup/sync/manifest/plugin/CI SLO results into final readiness verdict.
  - **Must NOT do**: Do not emit success claim when any required gate is missing/failing.
  - **Recommended Agent Profile**: category `quick`; skills `clean-architecture`, `linting-standards`
  - **Parallelization**: NO (Wave 4), Blocked by 1/2/3/5/6/7/8
  - **References**:
    - `scripts/generate-portability-report.mjs`
    - `scripts/verify-portability.mjs` releaseVerdict patterns
  - **Acceptance Criteria**:
    - [ ] Report contains per-gate status + reasons + evidence paths
    - [ ] Final claim suppressed when evidence incomplete (`insufficientEvidence`)

---

## Agent-Executed QA Scenarios (Global Examples)

```text
Scenario: Fresh clone reaches ready state in SLO
  Tool: Bash
  Preconditions: Clean runner, supported OS
  Steps:
    1. bun run setup --report-json > .sisyphus/evidence/setup-report.json
    2. bun run verify-setup --format json > .sisyphus/evidence/setup-verify.json
    3. Assert setup-report.duration_seconds <= 600
    4. Assert setup-verify.missing.length == 0 and failed.length == 0
  Expected Result: Ready state achieved <= 10 minutes

Scenario: Post-pull drift requires reconcile
  Tool: Bash
  Preconditions: Drift fixture committed on branch
  Steps:
    1. Simulate pull/update introducing config/generated drift
    2. Run bun run sync --json > .sisyphus/evidence/sync-report.json
    3. Assert sync-report.blocked == 0 for allowed paths
    4. Assert git status is clean (or only allowlisted generated diffs)
  Expected Result: Deterministic reconcile and clean state

Scenario: Hidden auto-exec policy violation is blocked
  Tool: Bash
  Preconditions: Fixture introducing implicit hook activation
  Steps:
    1. Run policy verifier command
    2. Assert non-zero exit code
    3. Assert reason includes hidden/implicit execution violation
  Expected Result: CI blocks insecure auto-execution behavior
```

---

## Commit Strategy

| After Task(s) | Message | Verification |
|---|---|---|
| 1,4 | `feat(bootstrap): add scope manifest and no-hidden-exec policy` | manifest + policy tests |
| 2,3,5 | `feat(setup): harden setup/sync idempotent contracts` | setup/sync/prereq tests |
| 6,7 | `feat(ci): enforce clone-pull reconcile readiness matrix` | workflow + plugin readiness checks |
| 8,9 | `feat(governance): publish claim policy and verdict aggregation` | docs + final report assertions |

---

## Success Criteria

### Verification Commands
```bash
bun run setup --report-json
bun run sync --json
bun run verify-setup --format json
bun test
node scripts/generate-portability-report.mjs
```

### Final Checklist
- [ ] One-command bootstrap works across bounded support scope
- [ ] One-command post-pull reconcile works and is CI-enforced
- [ ] Official plugin/core manifest verification has zero missing/failed entries
- [ ] Setup SLO <= 10 minutes is measured and enforced
- [ ] No hidden clone/pull auto-execution paths exist
- [ ] Claim text remains bounded: minimal explicit setup (not universal zero-touch)
