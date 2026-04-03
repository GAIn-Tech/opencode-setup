# Portability/Replicability Hardening Plan (Wave F→J+)

## TL;DR

> **Quick Summary**: Enforce fail-closed portability and deterministic runtime behavior across OS/shell/runtime by eliminating resolver fragmentation, removing skip-based false greens, and strengthening doctor/repair + rollback safety.
>
> **Deliverables**:
> - Unified data-home/config-home resolver adoption in remaining hotspots
> - Fail-closed MCP probe policy with explicit allowlist/expiry model
> - Launcher parity contract tests (Node/Bun ownership clarity)
> - Fault-injection tests for doctor/repair/rollback
> - Cross-OS matrix gates hardened for path/shell edge cases
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES (4 waves)
> **Critical Path**: Task 1 → Task 3 → Task 6 → Task 10

---

## Context

### Original Request
User asked to find **everything still missed** in environment portability, replicability, and runtime wiring/trigger reliability, then plan all tightenings comprehensively.

### Interview Summary
- User-selected policy decisions:
  - **Fail-closed now** for portability gates
  - **Path/runtime determinism first**
  - **TDD + fail-closed CI** verification strategy
- Existing hardening already landed (doctor/repair, supply-chain guard, portability matrix, MCP mirror coherence), but scan still found:
  - resolver fragmentation,
  - probe skips that can hide unexercised paths,
  - launcher ambiguity across scripts,
  - remaining path islands using direct HOME/.opencode logic.

### Metis Review (addressed)
- Missing guardrails added in this plan:
  - explicit supported runtime ownership per entrypoint,
  - explicit skip-budget policy (default zero),
  - deterministic path precedence contract,
  - rollback dry-run compatibility before apply.
- Scope creep locked down (no unrelated feature work).

---

## Work Objectives

### Core Objective
Guarantee deterministic bootstrap/runtime behavior across Windows/macOS/Linux with no silent degradation paths and with reproducible, repairable state transitions.

### Concrete Deliverables
- Canonical path-resolution contract + shared resolver usage in remaining runtime hotspots
- Zero-skip (or explicit allowlist) probe enforcement in CI and local strict checks
- Launcher parity checks for script entrypoints with declared ownership
- Fault-injection harness for doctor/repair and rollback dry-run gating
- Cross-OS matrix scenarios covering spaces/unicode/non-default homes and shell variants

### Definition of Done
- [ ] `bun run verify:strict` passes with `--probe-mcp` and zero unauthorized skips
- [ ] `bun run governance:check` passes
- [ ] portability matrix workflow passes on all legs
- [ ] doctor/repair fault-injection tests pass

### Must Have
- No new silent pass conditions
- Every portability exception documented via allowlist + rationale
- Every critical runtime path exercised in CI

### Must NOT Have (Guardrails)
- No hidden fallback that returns success without explicit telemetry
- No new hardcoded `.opencode`/HOME path writes outside shared resolver policy
- No mixed runtime ownership ambiguity for the same operational entrypoint

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> All acceptance criteria are agent-executable via scripts/CI commands.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: **TDD**
- **Framework**: Bun test + script contract tests + CI matrix

### TDD Policy
For each hardening target:
1. RED: add failing contract test/check
2. GREEN: implement minimal fix
3. REFACTOR: remove duplication while preserving green

### Agent-Executed QA Scenarios (Global)

Scenario: Strict portability gate (happy path)
  Tool: Bash
  Preconditions: repo linked, config mirrored
  Steps:
    1. Run `bun run verify:strict`
    2. Capture stdout/stderr
    3. Assert exit code is 0
    4. Assert output includes portability + mirror + skill consistency checks passing
  Expected Result: strict suite passes
  Failure Indicators: non-zero exit, skip budget exceeded, probe failures
  Evidence: `.sisyphus/evidence/verify-strict.txt`

Scenario: Fail-closed policy (negative)
  Tool: Bash
  Preconditions: create controlled probe skip condition in test harness/fixture
  Steps:
    1. Run portability strict command in fixture mode
    2. Assert skip not allowlisted
    3. Assert command exits non-zero
  Expected Result: strict gate fails when unallowlisted skip occurs
  Evidence: `.sisyphus/evidence/verify-strict-negative.txt`

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Foundations)
- Task 1: Canonical path contract & static anti-pattern gate
- Task 2: Runtime ownership/launcher contract definition

Wave 2 (Detection Hardening)
- Task 3: Probe skip/fallback budget enforcement
- Task 4: MCP launch probe coverage expansion
- Task 5: Mirror/registry drift budget + stale entry enforcement

Wave 3 (Recovery Safety)
- Task 6: Doctor/repair fault-injection tests
- Task 7: Rollback dry-run compatibility gate
- Task 8: Lock/cache integrity + interrupted-run recovery tests

Wave 4 (Cross-OS Repro)
- Task 9: Portability matrix edge-case scenarios
- Task 10: Final contract aggregation + governance integration

### Dependency Matrix

| Task | Depends On | Blocks | Parallel With |
|---|---|---|---|
| 1 | None | 3, 9 | 2 |
| 2 | None | 4, 10 | 1 |
| 3 | 1 | 10 | 4,5 |
| 4 | 2 | 10 | 3,5 |
| 5 | 1 | 10 | 3,4 |
| 6 | None | 10 | 7,8 |
| 7 | 6 | 10 | 8 |
| 8 | 6 | 10 | 7 |
| 9 | 1,2 | 10 | 6,7,8 |
| 10 | 3,4,5,7,8,9 | None | None |

---

## TODOs

- [ ] 1. Enforce canonical path contract + anti-pattern static gate
  - **What to do**:
    - Define single precedence for data/config/cache paths.
    - Add static check script that fails on non-allowlisted hardcoded `.opencode`/HOME path usage.
    - Migrate remaining direct path islands to canonical resolver imports.
  - **Must NOT do**:
    - No broad refactor outside path resolution behavior.
  - **References**:
    - `scripts/resolve-root.mjs`
    - `packages/opencode-skill-rl-manager/src/index.js`
    - `packages/opencode-init-kb/src/kb-initializer.js`
    - `packages/opencode-memory-graph/src/cli.js`
    - `packages/opencode-sisyphus-state/src/database.js`
    - `scripts/integrity-guard.mjs`
  - **Acceptance Criteria**:
    - [ ] Static gate script fails on forbidden patterns in fixture and passes in repo baseline.
    - [ ] Path-resolution tests cover Windows/macOS/Linux precedence permutations.

- [ ] 2. Define runtime/launcher ownership contract
  - **What to do**:
    - Create explicit ownership matrix: Node-only, Bun-only, dual-supported.
    - Add parity tests for dual-supported entrypoints.
  - **References**:
    - `scripts/setup-resilient.mjs`
    - `scripts/verify-setup.mjs`
    - `scripts/verify-portability.mjs`
    - `scripts/run-distill-mcp.mjs`
    - `package.json` scripts section
  - **Acceptance Criteria**:
    - [ ] Contract file exists and is validated in CI.
    - [ ] Parity tests fail if output/exit differs for declared dual-supported entrypoints.

- [ ] 3. Fail-closed skip/fallback budget enforcement
  - **What to do**:
    - Enforce default `skip_count=0`, `fallback_count=0` unless allowlisted.
    - Add allowlist file schema with rationale + expiry date.
  - **References**:
    - `scripts/verify-portability.mjs`
    - `scripts/doctor.mjs`
    - `scripts/mcp-smoke-harness.mjs`
  - **Acceptance Criteria**:
    - [ ] Strict command fails when unauthorized skip appears.
    - [ ] Allowlisted skip with valid expiry passes and is surfaced in report.

- [ ] 4. Expand MCP launch probe coverage
  - **What to do**:
    - Increase probe-safe launcher/script detection coverage.
    - Add explicit probe reason taxonomy and CI assertions.
  - **References**:
    - `scripts/verify-portability.mjs`
    - `opencode-config/opencode.json`
    - `mcp-servers/tool-manifest.json`
  - **Acceptance Criteria**:
    - [ ] Probe coverage report includes exercised/unsupported/skipped counts.
    - [ ] CI fails if coverage drops below threshold.

- [ ] 5. Mirror/registry stale-entry enforcement
  - **What to do**:
    - Detect stale extra skills/agents/MCP entries beyond allowlist.
    - Prevent stale mirror drift in strict mode and governance.
  - **References**:
    - `scripts/copy-config.mjs`
    - `scripts/mcp-mirror-coherence.mjs`
    - `scripts/check-skill-consistency.mjs`
    - `opencode-config/skills/registry.json`
  - **Acceptance Criteria**:
    - [ ] Strict checks fail on unexpected extras without allowlist.
    - [ ] Repair can remove or reconcile stale entries safely.

- [ ] 6. Doctor/repair fault-injection suite
  - **What to do**:
    - Add tests for partial failures, permission denied, interrupted execution, stale locks.
    - Ensure non-zero exit on partial unrecovered failures.
  - **References**:
    - `scripts/doctor.mjs`
    - `scripts/repair.mjs`
    - `packages/opencode-skill-rl-manager/src/index.js` (lock handling behavior)
  - **Acceptance Criteria**:
    - [ ] Fault-injection tests pass and verify deterministic outcomes.
    - [ ] Repair report includes repaired_count / failed_count / rollback_id.

- [ ] 7. Rollback dry-run compatibility gate
  - **What to do**:
    - Enforce rollback dry-run as precondition before apply operations.
    - Validate schema/version compatibility and file integrity.
  - **References**:
    - `scripts/model-rollback.mjs`
    - `scripts/repair.mjs`
    - `scripts/supply-chain-guard.mjs`
  - **Acceptance Criteria**:
    - [ ] Incompatible rollback target fails in dry-run with actionable diagnostics.

- [ ] 8. Cache/lock integrity hardening
  - **What to do**:
    - Extend stale lock detection semantics and false-positive allowlist (e.g., bun.lock already handled).
    - Add interrupted cache population recovery tests.
  - **References**:
    - `scripts/bootstrap-cache-guard.mjs`
    - `scripts/run-distill-mcp.mjs`
    - `scripts/doctor.mjs`
  - **Acceptance Criteria**:
    - [ ] Offline mode fails fast with explicit missing cache errors.
    - [ ] Cache warm path passes without network assumptions.

- [ ] 9. Cross-OS edge-case CI matrix expansion
  - **What to do**:
    - Add matrix scenarios for spaces/unicode paths, non-default HOME, cross-volume temp/move behavior.
    - Ensure both pwsh and bash legs on Windows execute strict contracts.
  - **References**:
    - `.github/workflows/portability-matrix.yml`
    - `scripts/setup-resilient.mjs`
    - `scripts/verify-portability.mjs`
  - **Acceptance Criteria**:
    - [ ] Matrix includes edge-case env permutations and all pass.

- [ ] 10. Final contract aggregation and governance wiring
  - **What to do**:
    - Wire all new gates into `verify:strict` and `governance:check` deterministically.
    - Publish machine-readable portability report artifact schema.
  - **References**:
    - `package.json`
    - `scripts/verify-setup.mjs`
    - `scripts/verify-portability.mjs`
    - `scripts/supply-chain-guard.mjs`
    - `scripts/mcp-mirror-coherence.mjs`
  - **Acceptance Criteria**:
    - [ ] `bun run verify:strict` exit 0 on healthy baseline.
    - [ ] `bun run governance:check` exit 0 on healthy baseline.
    - [ ] Report includes: OS/runtime/launcher/probe coverage/skip/fallback counts.

---

## Commit Strategy

1. `test(portability): add failing contracts for path/skip/launcher invariants`
2. `feat(portability): enforce canonical resolver and fail-closed skip budgets`
3. `test(repair): add doctor/repair fault injection and rollback dry-run tests`
4. `ci(portability): extend matrix edge cases and strict gates`
5. `chore(governance): wire final contract checks and report artifacts`

---

## Success Criteria

### Verification Commands
```bash
bun test
bun run verify:strict
bun run governance:check
node scripts/doctor.mjs --json
node scripts/repair.mjs --safe
```

### Final Checklist
- [ ] Zero unauthorized probe skips in strict mode
- [ ] Zero silent fallback passes in strict mode
- [ ] All supported OS/shell matrix legs green
- [ ] Doctor/repair fault-injection suite green
- [ ] Rollback dry-run compatibility gate green
