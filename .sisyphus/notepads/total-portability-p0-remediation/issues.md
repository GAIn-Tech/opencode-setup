# Issues — Total Portability P0 Remediation

## Session: 2026-03-31

### Known Issues (Pre-Remediation)

#### ISSUE-001: Exception Pathway Still Active
- **Gap ID**: A2
- **Description**: `verify-portability.mjs` treats `exception-approved` as pass
- **Impact**: Zero-waiver policy can be bypassed
- **Status**: OPEN — Task 1 will address

#### ISSUE-002: Workflow Trigger Gaps
- **Gap ID**: A1
- **Description**: `plugins/**` and `local/**` not in CI trigger paths
- **Impact**: Changes can merge without running portability gates
- **Status**: OPEN — Task 3 will address

#### ISSUE-003: Partial Probe Coverage
- **Gap ID**: E1
- **Description**: 50% threshold allows unexercised surfaces to pass
- **Impact**: Total replicability claim is not enforced
- **Status**: OPEN — Task 6 will address

#### ISSUE-004: Plugin Readiness Scope Mismatch
- **Gap ID**: B1
- **Description**: Readiness checks only cover manifest-scoped official plugins
- **Impact**: Non-manifest plugin surfaces can drift undetected
- **Status**: OPEN — Task 4 will address

#### ISSUE-005: Smoke Runner Excludes Plugins
- **Gap ID**: B2
- **Description**: `run-package-smokes.mjs` only executes package smoke tests
- **Impact**: Plugin runtime breakage evades detection
- **Status**: OPEN — Task 5 will address

#### ISSUE-006: Local-Dependency in Release Path
- **Gap ID**: B3
- **Description**: `verify-plugin-parity.mjs` depends on `local/oh-my-opencode`
- **Impact**: Repo-only reproducibility is compromised
- **Status**: OPEN — Task 10 will address

#### ISSUE-007: Schema-Only Env Validation
- **Gap ID**: C1
- **Description**: `env-contract-check.mjs` validates schema, not runtime realization
- **Impact**: Machines can pass schema but diverge behaviorally
- **Status**: OPEN — Task 7 will address

#### ISSUE-008: Mocked Scenario Dominance
- **Gap ID**: E2
- **Description**: Runtime workflow scenarios are largely synthetic/mocked
- **Impact**: Real-world integration behavior is under-proven
- **Status**: OPEN — Task 8 will address

#### ISSUE-009: Convergence Attestation Missing
- **Gap ID**: D1
- **Description**: No artifact-level equivalence proof between clone and pull-reconcile
- **Impact**: Silent state drift can survive undetected
- **Status**: OPEN — Task 9 will address

#### ISSUE-010: Supply-Chain Allowlist Bypass
- **Gap ID**: C2
- **Description**: `OPENCODE_ALLOW_LATEST_MCP` permits `@latest` in governed deps
- **Impact**: Time-dependent drift can enter pinned flows
- **Status**: OPEN — Task 2 will address

#### ISSUE-011: Unsigned Evidence Admissibility
- **Gap ID**: A3
- **Description**: No cryptographic binding for portability verdict artifacts
- **Impact**: Evidence tampering/replay is possible
- **Status**: OPEN — Task 11 will address

### Blocking Issues
- None currently — all issues have assigned tasks

### Dependencies
- Task 1 (A2) blocks Tasks 6, 11
- Task 3 (A1) blocks Tasks 4, 5
- Tasks 6, 7, 8 depend on Task 1
- Task 11 depends on all prior tasks
