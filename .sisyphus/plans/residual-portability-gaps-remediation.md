# Residual Portability Gaps Remediation (Implementation-Ready)

## TL;DR

> **Quick Summary**: Close 8 residual portability gaps identified by post-remediation audit to achieve true total replicability.
> 
> **Deliverables**:
> - Fixed CI proof pipeline order (generate before verify)
> - Aligned MCP attestation contract (exercise + smoke run-binding)
> - Extended supply-chain guard to plugin specs
> - Real cryptographic signature verification (or fail-closed)
> - Run-bound restore/convergence evidence
> - Cross-platform path semantics fixes
> - Fixed package smoke runner compatibility
> - Documentation coherence enforcement
>
> **Estimated Effort**: Medium (1–2 days)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: P01/P02/P03 wiring fixes → P04/P05 enforcement hardening → P06/P07/P08 edge cases

---

## Context

### Original Request
After completing the 11-task Total Portability P0 Remediation plan (83/83 tests pass), user asked: "Is there anything else we could've missed?" Oracle audit identified 8 residual gaps that can allow false-positive "portable" outcomes.

### Audit Summary
**Source**: Oracle audit (`bg_8bf04329`) + direct grep exploration
**Key Finding**: Core framework is strong, but wiring/enforcement gaps remain that undermine claim reliability.

### Locked Policy Requirements
- TOTAL replicability across Windows+Linux (Dev+CI)
- Entire repo surface (source-controlled + reproducible state)
- Zero waivers for P0 gaps
- Same-run, same-commit, signed CI evidence only
- Real cryptographic verification (not structural JSON checks)

### Primary Evidence Artifacts
- Oracle audit result: Gap register with file paths and mitigations
- Grep results: HOME/USERPROFILE in 10 files, spawn in 31 files, localhost URLs in 3 files

---

## Work Objectives

### Core Objective
Ensure the portability claim path is fully reliable: proof generation → verification → verdict, with no false-positive pathways.

### Concrete Deliverables
- Fixed CI workflow order (proofs before verification)
- Aligned MCP attestation schema across exercise/smoke harnesses
- Extended supply-chain guard to plugin specs
- Real or fail-closed signature verification
- Run-bound convergence/restore evidence
- Cross-platform path semantics compliance
- Fixed package smoke runner (.mjs/require compatibility)
- Docs coherence check

### Definition of Done
- [ ] All 8 gap IDs (P01–P08) are `PASS` in machine-generated output
- [ ] CI pipeline generates proofs before running strict verifier
- [ ] MCP attestations have consistent runId/commitSha across exercise→smoke
- [ ] Supply-chain guard blocks @latest in both MCP and plugin specs
- [ ] Signature verification is cryptographic OR fails closed
- [ ] All convergence/restore evidence is bound to current run/commit
- [ ] No /tmp or string-replace path assumptions remain
- [ ] Package smoke runner works in pure .mjs environments
- [ ] Documentation matches runtime configuration

### Must Have
- Correct CI proof pipeline order (no false positives from missing artifacts)
- Consistent attestation contracts across all harnesses
- Real enforcement of supply-chain policy (plugins included)
- Fail-closed signature verification

### Must NOT Have (Guardrails)
- No structural-only signature checks (trust without verification)
- No stale evidence acceptance in any gate
- No cross-platform path assumptions
- No doc drift from runtime source-of-truth

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES (Bun test + CI workflows)
- **Automated tests**: YES (tests-after per task)
- **Framework**: Bun test (`scripts/tests/**/*.js`)

### Agent-Executed QA Scenarios
- Each task must include:
  1. LSP diagnostics on all changed files
  2. Relevant test suite execution
  3. End-to-end verification where applicable

### Evidence Requirements
- Test output showing pass/fail counts
- LSP diagnostics showing clean files
- CI workflow syntax validation
- Integration test results for end-to-end paths

---

## Gap-to-Task Mapping

### Gap Register Summary

| Gap ID | Description | Risk | Effort |
|--------|-------------|------|--------|
| P01 | CI proof pipeline order inconsistent | High | Low |
| P02 | MCP attestation contract mismatch | High | Low |
| P03 | Supply-chain guard scope gap (plugins) | High | Low |
| P04 | Signature verification is structural | High | Medium |
| P05 | Stale evidence can satisfy gates | Medium | Low |
| P06 | Cross-platform path edge cases | Medium | Low |
| P07 | Package smoke runner compatibility | Medium | Low |
| P08 | Documentation drift | Low | Low |

### Task Assignment

| Task | Gap ID(s) | Priority | Dependencies |
|------|-----------|----------|--------------|
| Task 1: Fix CI proof pipeline order | P01 | P0 | None |
| Task 2: Align MCP attestation contract | P02 | P0 | None |
| Task 3: Extend supply-chain guard to plugins | P03 | P0 | None |
| Task 4: Implement real signature verification | P04 | P0 | Task 1 |
| Task 5: Bind convergence/restore to run/commit | P05 | P1 | None |
| Task 6: Fix cross-platform path semantics | P06 | P1 | None |
| Task 7: Fix package smoke runner compatibility | P07 | P1 | None |
| Task 8: Add documentation coherence check | P08 | P2 | None |

---

## Execution Waves

### Wave 1: Critical Wiring Fixes (Tasks 1–3)
**Priority**: P0  
**Parallelizable**: YES  
**Estimated Duration**: 2–3 hours

#### Task 1: Fix CI Proof Pipeline Order (P01)
**Gap**: `.github/workflows/portability-matrix.yml:210-221` runs `verify-portability` before proof scripts generate artifacts.

**Implementation Steps**:
1. Reorder jobs in `portability-matrix.yml`:
   - Add new job: `generate-proofs` (runs first)
   - Modify existing `verify` job to depend on `generate-proofs`
2. Update `runtime-tool-surface-proof.mjs` and `mcp-smoke-harness.mjs` to write artifacts to `.sisyphus/evidence/` instead of stdout
3. Add artifact paths to `verify-portability.mjs` expectations
4. Create test validating correct pipeline order

**Files to Modify**:
- `.github/workflows/portability-matrix.yml`
- `scripts/runtime-tool-surface-proof.mjs`
- `scripts/mcp-smoke-harness.mjs`
- `scripts/verify-portability.mjs`
- `scripts/tests/ci-pipeline-order.test.js` (create)

**Verification**:
- `bun test scripts/tests/ci-pipeline-order.test.js`
- LSP diagnostics on all modified files
- Manual CI workflow syntax check

**Reason Codes**:
- `CI_PIPELINE_ORDER_INVALID`
- `PROOF_ARTIFACT_NOT_GENERATED`
- `VERIFICATION_RAN_BEFORE_PROOFS`

---

#### Task 2: Align MCP Attestation Contract (P02)
**Gap**: `mcp-smoke-harness.mjs:113-117` requires `runId`/`commitSha`, but `mcp-exercise-harness.mjs` doesn't write them.

**Implementation Steps**:
1. Add `runId` and `commitSha` fields to `mcp-exercise-harness.mjs` output
2. Update exercise entry schema to include run-binding metadata
3. Modify smoke harness to validate exercise entries have run-binding
4. Create end-to-end test: exercise → smoke chain

**Files to Modify**:
- `scripts/mcp-exercise-harness.mjs`
- `scripts/mcp-smoke-harness.mjs`
- `scripts/tests/mcp-attestation-contract.test.js` (create)

**Verification**:
- `bun test scripts/tests/mcp-attestation-contract.test.js`
- `bun test scripts/tests/mcp-smoke-harness.test.js`
- LSP diagnostics on modified files

**Reason Codes**:
- `MCP_EXERCISE_MISSING_RUN_BINDING`
- `MCP_ATTESTATION_CONTRACT_MISMATCH`
- `MCP_SMOKE_STALE_EXERCISE_REF`

---

#### Task 3: Extend Supply-Chain Guard to Plugins (P03)
**Gap**: `opencode-config/opencode.json:7,11-14` has `@latest` plugins; guard only checks MCP commands.

**Implementation Steps**:
1. Add plugin spec parsing to `supply-chain-guard.mjs`
2. Validate plugin entries for `@latest` in strict/release mode
3. Add reason codes for plugin violations
4. Update tests to cover plugin scope

**Files to Modify**:
- `scripts/supply-chain-guard.mjs`
- `scripts/tests/supply-chain-guard.test.js`

**Verification**:
- `bun test scripts/tests/supply-chain-guard.test.js`
- LSP diagnostics on modified files

**Reason Codes**:
- `SCG_PLUGIN_LATEST_BLOCKED`
- `SCG_PLUGIN_SPEC_INVALID`
- `SCG_PLUGIN_UNPINNED_VERSION`

---

### Wave 2: Enforcement Hardening (Tasks 4–5)
**Priority**: P0–P1  
**Parallelizable**: YES (after Task 1 complete)  
**Estimated Duration**: 3–4 hours

#### Task 4: Implement Real Signature Verification (P04)
**Gap**: `scripts/lib/signed-evidence-bundle.mjs:49-57` trusts `signature.verified` boolean without crypto verification.

**Implementation Steps**:
1. Add cryptographic verification option:
   - If `OPENCODE_SIGNING_VERIFIER=sigstore`: use sigstore verification
   - If `OPENCODE_SIGNING_VERIFIER=cosign`: use cosign verification
   - If `OPENCODE_SIGNING_VERIFIER=disabled`: fail closed with explicit reason
2. Verify signature against artifact digest and signer identity
3. Remove JSON boolean trust path
4. Update tests to validate crypto verification or fail-closed behavior

**Files to Modify**:
- `scripts/lib/signed-evidence-bundle.mjs`
- `scripts/tests/signed-evidence-bundle.test.js` (create)
- `package.json` (add sigstore/cosign dependency if needed)

**Verification**:
- `bun test scripts/tests/signed-evidence-bundle.test.js`
- LSP diagnostics on modified files

**Reason Codes**:
- `SIGNATURE_VERIFICATION_UNAVAILABLE`
- `SIGNATURE_CRYPTO_MISMATCH`
- `SIGNATURE_DIGEST_INVALID`
- `SIGNATURE_IDENTITY_MISMATCH`

---

#### Task 5: Bind Convergence/Restore to Run/Commit (P05)
**Gap**: `scripts/verify-portability.mjs:1722-1838` and `scripts/sync-reconcile.mjs:83-99` don't bind evidence to current run.

**Implementation Steps**:
1. Add `runId` and `commitSha` fields to convergence snapshots
2. Add same-run validation in restore drill checks
3. Update `sync-reconcile.mjs` to include run-binding in attestation output
4. Create test validating run-bound convergence

**Files to Modify**:
- `scripts/sync-reconcile.mjs`
- `scripts/verify-portability.mjs`
- `scripts/tests/convergence-attestations.test.js`

**Verification**:
- `bun test scripts/tests/convergence-attestations.test.js`
- LSP diagnostics on modified files

**Reason Codes**:
- `CONVERGENCE_STALE_RUN`
- `CONVERGENCE_COMMIT_MISMATCH`
- `RESTORE_DRILL_STALE_EVIDENCE`

---

### Wave 3: Edge Case Fixes (Tasks 6–8)
**Priority**: P1–P2  
**Parallelizable**: YES  
**Estimated Duration**: 2–3 hours

#### Task 6: Fix Cross-Platform Path Semantics (P06)
**Gap**: `/tmp` literal in `graph-store.js:54`, string-replace `cwd` in `health/route.ts:128`, HOME assumptions in 10 files.

**Implementation Steps**:
1. Replace `/tmp` with `os.tmpdir()` or `process.env.TMPDIR/TEMP/TMP`
2. Replace string-replace path derivation with `path.resolve()` and repo root resolver
3. Normalize HOME/USERPROFILE fallback chains to use `os.homedir()` with explicit env precedence
4. Add Windows path-semantics regression test

**Files to Modify**:
- `packages/opencode-codebase-memory/src/graph-store.js`
- `packages/opencode-dashboard/src/app/api/health/route.ts`
- `scripts/cli-grep.js`
- `scripts/mcp-smoke-harness.mjs`
- `scripts/resolve-root.mjs`
- `scripts/runtime-tool-telemetry.mjs`
- `scripts/setup-resilient.mjs`
- `scripts/tests/cross-platform-paths.test.js` (create)

**Verification**:
- `bun test scripts/tests/cross-platform-paths.test.js`
- LSP diagnostics on all modified files

**Reason Codes**:
- `PATH_LITERAL_UNIX_ONLY`
- `PATH_STRING_REPLACE_DERIVATION`
- `PATH_HOME_ENV_FALLBACK_INCOMPLETE`

---

#### Task 7: Fix Package Smoke Runner Compatibility (P07)
**Gap**: `scripts/run-package-smokes.mjs:31` uses `require` inside `.mjs` file, tests don't cover passing non-dry-run.

**Implementation Steps**:
1. Replace `require` fallback with `createRequire` or pure `spawnSync(where/which)`
2. Add passing non-dry-run test case
3. Add `packages:smoke` to portability CI matrix

**Files to Modify**:
- `scripts/run-package-smokes.mjs`
- `scripts/tests/package-smoke-runner.test.js`
- `.github/workflows/portability-matrix.yml`

**Verification**:
- `bun test scripts/tests/package-smoke-runner.test.js`
- LSP diagnostics on modified files

**Reason Codes**:
- `SMOKE_RUNNER_MJS_REQUIRE_INCOMPATIBLE`
- `SMOKE_RUNNER_PATH_CHECK_FALLBACK_FAILED`

---

#### Task 8: Add Documentation Coherence Check (P08)
**Gap**: `README.md:60` says Bun 1.3.9, `.bun-version:1` says 1.3.10; dashboard README has npm commands in Bun repo.

**Implementation Steps**:
1. Create `scripts/verify-docs-coherence.mjs` that checks:
   - Bun version in README.md matches `.bun-version`
   - Stack inventory matches `opencode-config/opencode.json`
   - Package READMEs use correct package manager
2. Add docs-coherence check to governance-gate workflow
3. Update README.md with correct values

**Files to Modify**:
- `scripts/verify-docs-coherence.mjs` (create)
- `scripts/tests/verify-docs-coherence.test.js` (create)
- `.github/workflows/governance-gate.yml`
- `README.md`
- `packages/opencode-dashboard/README.md`

**Verification**:
- `bun test scripts/tests/verify-docs-coherence.test.js`
- `node scripts/verify-docs-coherence.mjs`
- LSP diagnostics on modified files

**Reason Codes**:
- `DOCS_BUN_VERSION_MISMATCH`
- `DOCS_STACK_INVENTORY_DRIFT`
- `DOCS_PACKAGE_MANAGER_WRONG`

---

## Dependency Graph

```
Wave 1 (parallel):
  Task 1 → (no deps)
  Task 2 → (no deps)
  Task 3 → (no deps)

Wave 2 (parallel after Task 1):
  Task 4 → Task 1 (needs correct pipeline order)
  Task 5 → (no deps)

Wave 3 (parallel):
  Task 6 → (no deps)
  Task 7 → (no deps)
  Task 8 → (no deps)
```

---

## Priority Heatmap

| Task | Gap ID | Risk | Blast Radius | Priority Score |
|------|--------|------|--------------|----------------|
| Task 1 | P01 | High | Entire CI pipeline | **CRITICAL** |
| Task 2 | P02 | High | MCP attestation chain | **CRITICAL** |
| Task 3 | P03 | High | Supply-chain integrity | **CRITICAL** |
| Task 4 | P04 | High | Evidence trust model | **HIGH** |
| Task 5 | P05 | Medium | Convergence gates | HIGH |
| Task 6 | P06 | Medium | Cross-platform paths | MEDIUM |
| Task 7 | P07 | Medium | Smoke runner | MEDIUM |
| Task 8 | P08 | Low | Documentation | LOW |

---

## Parallelization Map

**Maximum Parallelization**:
- Wave 1: 3 tasks in parallel (Tasks 1, 2, 3)
- Wave 2: 2 tasks in parallel (Tasks 4, 5) — after Task 1 complete
- Wave 3: 3 tasks in parallel (Tasks 6, 7, 8)

**Sequential Execution Option**:
If parallel execution is constrained, execute in order: 1→2→3→4→5→6→7→8

---

## Commit Strategy

### Commit Batches
- **Batch 1**: Wave 1 fixes (Tasks 1–3) — `fix(ci): correct proof pipeline order, MCP attestation, supply-chain scope`
- **Batch 2**: Wave 2 hardening (Tasks 4–5) — `fix(security): real signature verification, run-bound convergence`
- **Batch 3**: Wave 3 edge cases (Tasks 6–8) — `fix(portability): cross-platform paths, smoke runner, docs coherence`

---

## Success Criteria

### Per-Task Completion
- [ ] All tests pass for modified code
- [ ] LSP diagnostics clean on changed files
- [ ] Reason codes added and documented
- [ ] Notepad updated with learnings

### Overall Completion
- [ ] All 8 gap IDs are `PASS` in machine-generated output
- [ ] Full test suite passes (83+ tests)
- [ ] CI workflow order is correct
- [ ] MCP attestation chain is consistent
- [ ] Supply-chain guard covers plugins
- [ ] Signature verification is cryptographic or fail-closed
- [ ] All evidence is run-bound
- [ ] No cross-platform path assumptions
- [ ] Documentation matches runtime

---

## Recommended Agent Profile

**Category**: `unspecified-high`  
**Skills**: `ci-cd-automation`, `secure-coding`, `codebase-auditor`

---

## Notes

### Why This Approach
1. **Prioritizes correctness of release claim path** — where false positives are most damaging
2. **Avoids architecture churn** — mostly wiring, schema alignment, and gate-hardening
3. **Improves Windows+Linux dev+CI replicability evidence directly**
4. **Medium effort (1–2 days)** with clear parallelization opportunities

### Key Risks
- Task 4 (signature verification) may require external dependency installation
- Cross-platform path fixes need testing on both Windows and Linux
- CI workflow changes need careful validation to avoid breaking existing flows

### Mitigation
- Implement fail-closed behavior for signature verification if crypto tools unavailable
- Add specific Windows path-semantics tests
- Use workflow syntax validation before merge
