# Final Evidence-Backed Overlooked Gap Register

## Scope and Policy Locks
- Target: **TOTAL replicability**
- Coverage: **Entire repo surface** (source-controlled + reproducible state contracts)
- Environments: **Dev + CI**
- OS matrix: **Windows + Linux**
- P0 policy: **Any gap is release-blocking**
- Waivers: **Not allowed (zero waivers)**
- Network policy: **Pinned dependencies + internal mirror/cache required**
- Evidence policy: **Same-run, same-commit CI evidence only for release decisions**
- Signing: **CI-only signing, Keyless OIDC trust model**

> Evidence source for this register: direct repository audit (fallback path after subagent instability).  
> Release admissibility note: checks requiring signed CI runtime artifacts remain `UNPROVEN` until produced in a valid same-run CI bundle.

---

## Top-10 Executive Summary (Blast Radius First)
1. Workflow trigger coverage gap can bypass portability gates on plugin/local changes (`FAIL`)
2. `exception-approved` is still treated as pass, conflicting with zero-waiver policy (`FAIL`)
3. Probe coverage floor allows partial exercise under “total replicability” target (`FAIL`)
4. Plugin readiness scope is narrower than entire-surface requirement (`FAIL`)
5. Smoke execution excludes plugin runtime surface (`FAIL`)
6. Local-copy parity dependency (`local/`) weakens repo-only replicability proof (`UNPROVEN`)
7. Env contract checks schema, not realized runtime parity (`UNPROVEN`)
8. Runtime workflow scenarios are heavily synthetic/mocked (`UNPROVEN`)
9. MCP exercise proof is telemetry-threshold based, not universal deterministic proof (`UNPROVEN`)
10. Claim contract and implemented checks still permit policy drift (`FAIL`)

---

## Surface A — Orchestration & Entrypoints

### A1
- Gap: Workflows do not explicitly trigger on `plugins/**` and `local/**` changes.
- Impact: Portability-critical changes may merge without gate execution.
- Evidence:
  - `.github/workflows/portability-matrix.yml`
  - `.github/workflows/bootstrap-readiness.yml`
  - `.github/workflows/governance-gate.yml`
- P0 hard check: Every portability-relevant surface must be trigger-covered or enforced by always-run gate.
- Status: `FAIL`
- Reason code: `EXEC_MISSING_PROOF`
- Overlook cause: Trigger predicates lagged expanded “entire surface” policy.

### A2
- Gap: `exception-approved` status maps to pass in release verdict logic.
- Impact: Zero-waiver policy can be bypassed.
- Evidence:
  - `scripts/verify-portability.mjs`
- P0 hard check: Any P0 exception status must hard-fail aggregation.
- Status: `FAIL`
- Reason code: `CLAIM_EVIDENCE_MISMATCH`
- Overlook cause: Legacy controlled-exception model remained active.

### A3
- Gap: End-to-end zero-waiver enforcement contract not fully proven in report aggregation path.
- Impact: Policy interpretation can diverge from machine behavior.
- Evidence:
  - `scripts/generate-portability-report.mjs`
  - `scripts/verify-portability.mjs`
- P0 hard check: Verdict schema rejects waiver/exception fields and statuses before aggregation.
- Status: `UNPROVEN`
- Reason code: `EVIDENCE_INVALID_OR_MISSING`
- Overlook cause: Contract was specified, but full enforcement proof remains pending.

---

## Surface B — Wiring Graph (Packages/Plugins/Skills/Config)

### B1
- Gap: Plugin readiness validation is manifest-scoped (`core-and-official-plugins`), not entire plugin/local surface.
- Impact: Non-manifest plugin surfaces may drift undetected.
- Evidence:
  - `scripts/bootstrap-manifest.json`
  - `scripts/verify-plugin-readiness.mjs`
  - `opencode-config/opencode.json`
  - `plugins/README.md`
- P0 hard check: Validate all plugin-related source-controlled surfaces against declared contract.
- Status: `FAIL`
- Reason code: `WIRE_DECLARED_NOT_EXERCISED`
- Overlook cause: Earlier bootstrap scope was narrower than current policy.

### B2
- Gap: Smoke runner covers `packages/` only; plugin runtime smoke coverage is absent.
- Impact: Plugin failures can evade smoke gates.
- Evidence:
  - `scripts/run-package-smokes.mjs`
- P0 hard check: Unified smoke matrix for packages + plugins across OS matrix.
- Status: `FAIL`
- Reason code: `WIRE_DECLARED_NOT_EXERCISED`
- Overlook cause: Existing smoke tooling optimized for workspace packages.

### B3
- Gap: Plugin parity checks depend on `local/oh-my-opencode` path assumptions.
- Impact: Repo-only portability guarantees can be undermined by local-only drift.
- Evidence:
  - `scripts/verify-plugin-parity.mjs`
- P0 hard check: Local dependencies must be explicit contract inputs or excluded from P0 claim scope.
- Status: `UNPROVEN`
- Reason code: `WIRE_RESOLUTION_DRIFT`
- Overlook cause: Historical local mirror workflow persisted into stricter portability goals.

---

## Surface C — Environment & Toolchain

### C1
- Gap: Env contract validation is schema-centric, not runtime-realization proof.
- Impact: Schema can pass while behavior diverges across machines.
- Evidence:
  - `scripts/env-contract-check.mjs`
  - `.env.example`
- P0 hard check: Add runtime realization probes in CI matrix.
- Status: `UNPROVEN`
- Reason code: `ENV_SCHEMA_DRIFT`
- Overlook cause: Fast schema diagnostics prioritized over stronger runtime checks.

### C2
- Gap: Supply-chain guard still supports allowlist-based `@latest` exceptions.
- Impact: Time/network-dependent drift can re-enter “pinned” flows.
- Evidence:
  - `scripts/supply-chain-guard.mjs`
- P0 hard check: In release mode, disallow `@latest` and disable bypass toggles.
- Status: `FAIL`
- Reason code: `TOOLCHAIN_INTEGRITY_FAIL`
- Overlook cause: Compatibility escape hatch conflicts with hardened replicability.

---

## Surface D — Stateful & Regenerable Artifacts

### D1
- Gap: Clone vs pull-reconcile success is tested, but per-artifact deterministic equivalence evidence is not explicit.
- Impact: Silent drift in caches/db/generated outputs may persist.
- Evidence:
  - `.github/workflows/bootstrap-readiness.yml`
  - `scripts/sync-reconcile.mjs`
- P0 hard check: Require per-artifact reset/regenerate attestations with equivalence checks.
- Status: `UNPROVEN`
- Reason code: `STATE_NO_CONVERGENCE`
- Overlook cause: Workflow-level success checks are not equivalent to artifact-level convergence proofs.

---

## Surface E — Security & Supply Chain Replicability

### E1
- Gap: MCP/runtime exercise proof is telemetry-threshold based, not deterministic universal execution proof.
- Impact: Critical paths may remain unexecuted in same-run release evidence.
- Evidence:
  - `scripts/mcp-smoke-harness.mjs`
  - `scripts/verify-portability.mjs`
- P0 hard check: Require same-run deterministic exercise attestation for 100% required surface.
- Status: `FAIL`
- Reason code: `EXEC_MISSING_PROOF`
- Overlook cause: Operationally practical thresholds were retained despite stricter policy.

### E2
- Gap: Runtime workflow scenarios are predominantly synthetic/mocked.
- Impact: Real-world cross-environment behavior may diverge from mocked assumptions.
- Evidence:
  - `scripts/runtime-workflow-scenarios.mjs`
- P0 hard check: Enforce minimum non-mocked scenario ratio for release-grade verification.
- Status: `UNPROVEN`
- Reason code: `SECRET_BOUNDARY_VIOLATION`
- Overlook cause: Determinism/speed tradeoff reduced real-environment coverage strength.

---

## Strict P0 Remediation Priority Map (Dependency-Ordered)

### Sequencing Rule
- Resolve in this order: **policy contradictions first**, then **gate coverage completeness**, then **runtime proof depth**, then **artifact convergence proof**.
- A later phase cannot be considered complete if any earlier-phase P0 item remains open.

### Phase 0 — Hard Policy Alignment (Immediate blockers)
1. **A2 (`CLAIM_EVIDENCE_MISMATCH`)**: Remove/forbid `exception-approved` pass mapping in release verdict path.
2. **C2 (`TOOLCHAIN_INTEGRITY_FAIL`)**: Disable release-mode allowlist escape for unpinned `@latest` dependency resolution.

**Exit condition:** No policy path can transform a P0 exception into pass.

### Phase 1 — Gate Trigger and Surface Coverage Closure
3. **A1 (`EXEC_MISSING_PROOF`)**: Ensure plugin/local surface changes cannot bypass portability/governance gates.
4. **B1 (`WIRE_DECLARED_NOT_EXERCISED`)**: Expand readiness contract from manifest-scoped official baseline to full declared plugin/local source-controlled surface.
5. **B2 (`WIRE_DECLARED_NOT_EXERCISED`)**: Add plugin-runtime smoke coverage alongside package smoke coverage.

**Exit condition:** Entire declared surface is always gate-covered and exercise-required.

### Phase 2 — Deterministic Runtime Proof Strengthening
6. **E1 (`EXEC_MISSING_PROOF`)**: Raise telemetry-threshold proof to deterministic same-run universal execution attestation for required surface.
7. **A3 (`EVIDENCE_INVALID_OR_MISSING`)**: Enforce zero-waiver schema lint and contract validation before aggregation.
8. **C1 (`ENV_SCHEMA_DRIFT`)**: Add runtime realization probes to supplement schema-only env checks.
9. **E2 (`SECRET_BOUNDARY_VIOLATION`)**: Increase non-mocked scenario share for release-grade runtime/security verification.

**Exit condition:** Runtime proof is deterministic, same-run, and policy-contract enforced.

### Phase 3 — Convergence and Local-Dependency Elimination
10. **D1 (`STATE_NO_CONVERGENCE`)**: Add per-artifact deterministic convergence attestations (clone vs pull-reconcile).
11. **B3 (`WIRE_RESOLUTION_DRIFT`)**: Resolve local-path dependency ambiguity (`local/oh-my-opencode`) by explicit contract treatment (included with proof or excluded from claim scope).

**Exit condition:** Stateful artifacts and local-coupled paths cannot invalidate replicability claims.

### Critical Dependency Graph
- `A2` and `C2` **block all downstream trust** (must be first).
- `A1` **blocks** `B1`, `B2`, `E1` confidence.
- `B1` + `B2` **feed** `E1` universal execution proof.
- `A3` depends on `A2` completion and on evidence contracts from Phases 1–2.
- `D1` and `B3` are final convergence gates after coverage/proof hardening.

### Priority Heatmap (P0)
- **P0-Immediate:** A2, C2, A1
- **P0-High:** B1, B2, E1
- **P0-High/Validation:** A3, C1, E2
- **P0-Convergence:** D1, B3
