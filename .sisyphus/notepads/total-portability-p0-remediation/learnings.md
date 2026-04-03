# Learnings — Total Portability P0 Remediation

## Session: 2026-03-31

### Policy Locks (from gap audit)
- TOTAL replicability across entire repo surface
- Dev+CI scope on Windows+Linux
- Zero waivers for P0 blockers
- Internal mirror/cache + pinned dependencies
- Same-run, same-commit, signed CI evidence only
- CI signing via keyless OIDC
- Unsigned local artifacts: diagnostics only, never release evidence

### Key Evidence Sources
- `.sisyphus/drafts/portability-final-gap-register.md` — full gap register
- `.sisyphus/plans/total-portability-p0-remediation.md` — implementation-ready work plan

### Critical Findings from Direct Audit
1. Workflow triggers omit `plugins/**` and `local/**` — changes can bypass gates
2. `exception-approved` maps to pass — conflicts with zero-waiver policy
3. Probe coverage threshold is 50% — below total-replicability requirement
4. Plugin readiness scope is manifest-scoped, not entire-surface
5. Smoke runner excludes plugin runtime surface
6. Local-coupled parity depends on gitignored `local/` paths
7. Env contract validates schema, not realized runtime parity
8. Runtime workflow scenarios are largely synthetic/mocked
9. MCP exercise proof relies on telemetry recency, not deterministic universal proof
10. Release claim contract allows policy drift between objective and implementation

### Remediation Phases
- Phase 0: Policy alignment (A2, C2)
- Phase 1: Trigger/surface closure (A1, B1, B2)
- Phase 2: Runtime proof strengthening (E1, A3, C1, E2)
- Phase 3: Convergence/local dependency elimination (D1, B3)

### Conventions
- All tests use Bun test framework
- Evidence artifacts stored under `.sisyphus/evidence/`
- Failure bundles must include: gate JSON, logs, runtime trace, sanitized env snapshot, commit+run manifest
- Reason codes required for all failures (machine-readable + free text)

### 2026-03-31 — Task 1 (Gap A2 + A3 foundation) implementation notes
- `scripts/verify-portability.mjs` now enforces strict zero-waiver semantics in release evaluation:
  - Removed `exception-approved` pass normalization from `mapReportStatusToGateStatus`.
  - `appendStrictSupplyChainFailure` now treats any non-`passed` supply-chain status as a strict failure; `exception-approved` is emitted with reason code prefix `ZERO_WAIVER_EXCEPTION_STATUS`.
  - Added `lintReleaseVerdictZeroWaiver(releaseVerdict)` export for parse/eval-time contract linting.
- Contract lint now rejects waiver metadata and statuses with machine-readable reason codes:
  - Status code format: `ZERO_WAIVER_EXCEPTION_STATUS:<scope>:<status>`
  - Field code format: `ZERO_WAIVER_FIELD_PRESENT:<path>`
  - Blocked fields include waiver/exception metadata (`waiver`, `waivers`, `exception`, `exceptions`, `approvalId`, `approvedBy`, `expiresAt`, `ticket`).
- `scripts/generate-portability-report.mjs` now lints incoming `releaseVerdict` payload before aggregation:
  - Any zero-waiver violation adds failed `zeroWaiverContract` gate.
  - Violations are propagated into merged release reasons as `zero-waiver-contract: <code>`.
- Tests added/updated in `scripts/tests/verify-portability.test.js`:
  - `exception-approved` supply-chain payload now expected to fail release verdict (non-zero exit) with `ZERO_WAIVER_EXCEPTION_STATUS` reason.
  - New negative contract-lint tests validate rejection of both exception statuses and waiver fields.

### 2026-03-31 — Task 2 (Gap C2) release-mode supply-chain guard lock
- Hardened `scripts/supply-chain-guard.mjs` with explicit release-mode detection:
  - Release mode now activates via `--release`, `--release-mode`, `--strict`, or strict/release env toggles (`OPENCODE_SUPPLY_CHAIN_RELEASE_MODE`, `OPENCODE_RELEASE_MODE`, `OPENCODE_PORTABILITY_STRICT`).
- Disabled all `@latest` bypasses in release mode:
  - `parseAllowlist()` now returns an empty allowlist under release mode (default allowlist and `OPENCODE_ALLOW_LATEST_MCP` bypasses are ignored).
  - Added permissive bypass-key detection (`/^OPENCODE_.*ALLOW_LATEST/`) and surfaced ignored bypass env keys in release failures for auditability.
- Added machine-readable reason codes for policy violations and key guard failures:
  - `SCG_RELEASE_LATEST_BLOCKED`, `SCG_LATEST_BLOCKED`, `SCG_ALLOWLISTED_LATEST`, `SCG_BUN_PIN_REQUIRED`, `SCG_LOCKFILE_MISSING`, `SCG_DISTILL_PIN_REQUIRED`.
- Added targeted tests in `scripts/tests/supply-chain-guard.test.js`:
  - Release mode fails on `@latest` even for previously default-allowlisted MCPs.
  - Release mode explicitly rejects env bypass attempts (`OPENCODE_ALLOW_LATEST_MCP` and similar).
  - Non-release allowlist behavior remains intact.

### 2026-03-31 — Task 3 (Gap A1) workflow trigger surface closure
- Closed workflow trigger coverage gap across required portability gates:
  - Updated `.github/workflows/portability-matrix.yml` `on.pull_request.paths` + `on.push.paths` to include `plugins/**` and `local/**`.
  - Updated `.github/workflows/bootstrap-readiness.yml` `on.pull_request.paths` + `on.push.paths` to include `plugins/**` and `local/**`.
  - Updated `.github/workflows/governance-gate.yml` `on.pull_request.paths` + `on.push.paths` to include `plugins/**` and `local/**`.
- Added one additional portability-relevant missing surface in governance gate:
  - Included `mcp-servers/**` in both `pull_request` and `push` path filters to align with portability-critical runtime/config surface.
- Guardrails applied while changing triggers:
  - Trigger changes are path-filter only (no job/step logic changes).
  - No duplicate path entries were introduced in modified path lists.
  - No new event types added, avoiding circular/recursive trigger behavior.
- Added regression test `scripts/tests/workflow-trigger-coverage.test.js`:
  - Asserts all three target workflows include `plugins/**` + `local/**` in both `pull_request` and `push` path filters.
  - Asserts `governance-gate.yml` includes `mcp-servers/**` in both events.
  - Asserts each checked path list has unique entries (no duplicates).

### 2026-03-31 — Task 4 (Gap B1) plugin readiness declared-surface expansion
- Expanded plugin-readiness policy and implementation from manifest-only official plugin checks to entire declared plugin surface under `plugins/`:
  - Updated `scripts/bootstrap-manifest.json` policy scope to `entire-declared-surface`.
  - Policy notes now document full plugin directory sweep + config cross-reference behavior.
- Extended `scripts/verify-plugin-readiness.mjs` without removing official validation logic:
  - Added directory enumeration for all plugin directories under `plugins/`.
  - Added required metadata presence checks for `plugins/<name>/info.md` across all declared plugin directories.
  - Preserved official `loadChecks` + `opencodePluginSpec` validation path and config cross-check.
  - Added machine-readable reason-code prefixes for expanded metadata/contract failures:
    - `PLUGIN_MISSING_INFO_MD`
    - `PLUGIN_MISSING_SPEC`
    - `PLUGIN_NOT_IN_CONFIG`
  - Added optional support for local `opencodePluginSpec*` metadata files (`opencodePluginSpec`, `.txt`, `.md`, `.json`) for non-official plugin directories where spec cross-reference is explicitly declared.
- Expanded `scripts/tests/verify-plugin-readiness.test.js` coverage:
  - Asserted reason code output for missing config membership (`PLUGIN_NOT_IN_CONFIG`).
  - Added declared-surface failure assertion for plugin directories missing `info.md` (`PLUGIN_MISSING_INFO_MD`).
  - Added missing official spec assertion (`PLUGIN_MISSING_SPEC`).

### 2026-03-31 — Task 5 (Gap B2) package+plugin smoke runtime parity
- Extended `scripts/run-package-smokes.mjs` from package-only to unified package+plugin smoke execution:
  - Added plugin directory scanning under `plugins/*` for runtime plugin packages that include `package.json`.
  - Preserved existing package smoke behavior (`packages/*` with `scripts.test:smoke`).
  - Added unified JSON payload fields: `pluginCount` and `plugins` alongside existing package fields.
- Implemented plugin-specific machine-readable reason codes:
  - `PLUGIN_SMOKE_MISSING` when plugin package exists but has no `test:smoke` script (graceful skip, non-fatal).
  - `PLUGIN_SMOKE_FAILED` when plugin `test:smoke` execution fails (fatal to overall runner exit).
- Maintained cross-OS execution parity semantics:
  - Plugin smoke execution uses same Bun invocation and Windows shell handling pattern as package smoke execution.
  - Unified runner now executes both surfaces with identical runtime pathway in a single command.
- Expanded `scripts/tests/package-smoke-runner.test.js` coverage:
  - Added fixture-based test for plugin inclusion + skip reason assertion (`PLUGIN_SMOKE_MISSING`) in dry-run JSON output.
  - Added non-dry-run failing plugin smoke assertion for `PLUGIN_SMOKE_FAILED` and non-zero exit behavior.
  - Retained existing package smoke regression checks and package script contract assertion.

### 2026-03-31 — Task 6 (Gap E1) universal deterministic exercise attestations
- Removed threshold-based release pass semantics from `scripts/verify-portability.mjs`:
  - Deleted 50% MCP probe coverage gate logic from release verdict and main exit decision.
  - Added strict universal proof attestation gate (`proofAttestation`) sourced from same-run proof artifacts.
- Added deterministic proof contract enforcement with machine-readable reason codes:
  - `PROOF_MISSING_ATTESTATION` when required proof artifact/payload/attestations are absent.
  - `PROOF_STALE_RUN` when attestation runId/commitSha mismatches expected same-run evidence.
  - `PROOF_THRESHOLD_FORBIDDEN` when threshold-based override signals are present.
- Added artifact-level universal proof payloads to runtime evidence generators:
  - `scripts/mcp-smoke-harness.mjs` now emits `universalProof` metadata with run/commit binding and missing-attestation list.
  - `scripts/runtime-tool-surface-proof.mjs` now emits `universalProof` metadata with selected-tool attestation completeness.
- Expanded tests for universal proof behavior:
  - `scripts/tests/verify-portability.test.js` now asserts missing-attestation failure, stale-run failure, and forbidden threshold override code emission.
  - `scripts/tests/mcp-smoke-harness.test.js` now asserts deterministic universal proof pass when same-run exercise metadata is present.

### 2026-03-31 — Task 7 (Gap C1) runtime environment realization probes
- Upgraded `scripts/env-contract-check.mjs` from schema-only validation to two-phase contract enforcement:
  - Phase 1: `.env.example` schema validation remains authoritative for contract shape.
  - Phase 2: runtime realization probe executes a subprocess (`process.execPath -e ...`) to capture effective environment realization as JSON (platform, node version, cwd, values map).
- Added runtime contract comparison against expected field surface (required contract fields + portability baseline fields):
  - Probe payload must include all expected fields; missing fields now emit `ENV_REALIZATION_MISMATCH`.
  - Runtime values are validated for path absoluteness, numeric range/integer semantics, and threshold ordering (`QUOTA_WARNING_THRESHOLD < QUOTA_CRITICAL_THRESHOLD`).
- Added machine-readable reason codes for runtime phase:
  - `ENV_PROBE_FAILED` when probe process fails, returns non-zero, empty output, or invalid JSON.
  - `ENV_REALIZATION_MISMATCH` when realized runtime values violate contract semantics or expected fields are missing.
  - `ENV_SCHEMA_VALID_RUNTIME_INVALID` umbrella failure when schema passes but runtime realization fails.
- Added focused Bun tests in `scripts/tests/env-contract-check.test.js`:
  - Happy-path schema+runtime pass.
  - Schema-valid/runtime-invalid path emits `ENV_SCHEMA_VALID_RUNTIME_INVALID` with nested `ENV_REALIZATION_MISMATCH`.
  - Probe failure path emits `ENV_PROBE_FAILED`.
  - Missing probe field path emits `ENV_REALIZATION_MISMATCH`.

### 2026-04-01 — Task 8 (Gap E2) non-mocked runtime scenario assurance hardening
- Hardened `scripts/runtime-workflow-scenarios.mjs` policy gate to enforce real-execution coverage, not just synthetic scenario shape checks:
  - Added minimum non-mocked ratio threshold constant (`MIN_NON_MOCKED_SCENARIO_RATIO = 0.6`) and tracked-mode accounting (`executionMode: real|mocked`).
  - Added critical-path real scenario contract (`setup`, `sync`, `verify`, `report`) with mandatory real mode and successful completion.
- Added required machine-readable reason codes for scenario-policy failures:
  - `SCENARIO_MOCKED_RATIO_BELOW_THRESHOLD`
  - `SCENARIO_CRITICAL_REAL_MISSING`
  - `SCENARIO_REAL_EXECUTION_FAILED`
- Added deterministic critical real scenario probes executed against the live runtime surface:
  - `setup` → `runtime.resolveRuntimeContext(...)`
  - `sync` → `runtime.selectToolsForTask(...)`
  - `verify` → `runtime.checkContextBudget(...)`
  - `report` → `runtime.getIntegrationStatus()`
- Updated test coverage in `scripts/tests/runtime-workflow-scenarios.test.js` to assert:
  - pass path with >=60% non-mocked coverage + all critical real scenarios
  - explicit failure for mocked-ratio floor breach
  - explicit failure for missing/non-real critical scenario
  - explicit failure for failed critical real execution
  - script `--json` runtime execution includes critical real scenarios and reason-coded pass verdict.

### 2026-04-01 — Task 9 (Gap D1) artifact-level convergence attestations
- Added deterministic artifact-class snapshotting in `scripts/sync-reconcile.mjs`:
  - New `buildConvergenceSnapshot(...)` computes stable class hashes using canonical, path-sorted entry lists (`path`, `exists`, `sha256`) and SHA-256 over canonical JSON.
  - Governed classes are now explicit and machine-readable: `runtimeConfig`, `lockfile`, `generatedArtifacts`.
  - `syncReconcile(...)` now emits a pull-flow attestation artifact at `.sisyphus/evidence/pull-reconcile-convergence.json` (overrideable), with `hashesByClass`, class-level evidence entries, and drift signals.
- Added convergence equivalence evaluator in `scripts/sync-reconcile.mjs`:
  - New `evaluateConvergenceAttestation(...)` compares fresh-clone vs pull-reconcile class hashes and emits required reason codes:
    - `CONVERGENCE_ATTESTATION_MISSING`
    - `CONVERGENCE_HASH_MISMATCH`
    - `CONVERGENCE_DRIFT_DETECTED`
  - Verdict is deterministic (`passed|failed`) with per-class equivalence payload.
- Wired convergence gate into report aggregation in `scripts/generate-portability-report.mjs`:
  - Added `evaluateConvergenceAttestationGate()` that reads flow attestations from:
    - `OPENCODE_PORTABILITY_FRESH_CONVERGENCE_PATH` (default `.sisyphus/evidence/fresh-clone-convergence.json`)
    - `OPENCODE_PORTABILITY_PULL_CONVERGENCE_PATH` (default `.sisyphus/evidence/pull-reconcile-convergence.json`)
  - Missing/invalid artifacts now produce `CONVERGENCE_ATTESTATION_MISSING` reasons.
  - Convergence gate is merged into `releaseVerdict.gates.convergenceAttestation`, surfaced in report summary (`convergenceAttestationOk`), and included in overall pass criteria.
- Added TDD coverage in `scripts/tests/convergence-attestations.test.js`:
  - deterministic hash stability test for snapshot generation,
  - explicit reason-code assertions for missing/mismatch/drift failures,
  - report integration test proving convergence gate pass when fresh/pull attestations are equivalent.
- Verification evidence:
  - `bun test scripts/tests/convergence-attestations.test.js` → pass (3 tests)
  - LSP diagnostics clean for changed files (`sync-reconcile.mjs`, `generate-portability-report.mjs`, `convergence-attestations.test.js`).

### 2026-04-01 — Task 10 (Gap B3) local-coupled plugin parity contract hardening
- Replaced `scripts/verify-plugin-parity.mjs` local-runtime-coupled checks with governed-input parity verification:
  - Removed hard dependency on gitignored `local/oh-my-opencode/...` runtime path.
  - Added exported `verifyPluginParity(...)` evaluator + CLI mode (`--root`, `--manifest`, `--config`) for deterministic release-gate execution.
- Added required machine-readable reason codes:
  - `LOCAL_DEPENDENCY_IN_RELEASE_PATH` when manifest release-decision payload includes any `local/`-coupled path.
  - `PARITY_SOURCE_NOT_SOURCE_CONTROLLED` when parity evidence inputs escape repo root, point to local-coupled paths, or are missing.
  - `PARITY_PROOF_GENERATED_FROM_GOVERNED_INPUTS` on successful parity proof generation.
- Governed parity proof now generated from source-controlled/deterministic inputs:
  - `scripts/bootstrap-manifest.json`
  - `opencode-config/opencode.json`
  - discovered `plugins/*/info.md` metadata (or manifest-declared `portability.pluginParity.evidenceInputs`).
  - deterministic proof digest (SHA-256) emitted with normalized governed-input payload.
- Added TDD coverage in `scripts/tests/verify-plugin-parity.test.js`:
  - pass case with clean governed inputs and no local dependency;
  - failure on local-coupled manifest path (`LOCAL_DEPENDENCY_IN_RELEASE_PATH`);
  - failure when evidence input escapes repo root (`PARITY_SOURCE_NOT_SOURCE_CONTROLLED`);
  - CLI success-path exit/output contract check.
- Verification:
  - `bun test scripts/tests/verify-plugin-parity.test.js` ✅ (4 pass, 0 fail).

### 2026-04-01 — Task 11 final signed evidence + release gate enforcement integration
- Added `scripts/lib/signed-evidence-bundle.mjs` to centralize signed evidence and failure-bundle contract checks:
  - `verifySignedEvidenceBundle(...)` enforces keyless signature presence/verification + same-run/same-commit binding.
  - Emits required machine reason codes: `EVIDENCE_UNSIGNED`, `EVIDENCE_STALE_COMMIT`, `EVIDENCE_MISSING_BUNDLE`.
  - `verifyFailureBundle(...)` enforces required artifact set for failed P0 gates:
    - gate JSON, stdout log, stderr log, runtime trace, sanitized env snapshot, commit+run manifest.
- Added `scripts/release-portability-verdict.mjs` as final P0 verdict orchestrator:
  - Emits required verdict envelope with `contractVersion: "portability-p0/v1"` and required sections: `scope`, `evidence`, `gates`, `overall`.
  - Gate objects include required fields: `id`, `surface`, `severity`, `ok`, `check`, `passCriteria`, `evidencePaths`, `reason`, `updatedAt`, `boundCommitSha`.
  - Enforces timeout policy with deterministic no-retry behavior (`fast` 90s, `medium` 3m, `heavy` 8m, overall 20m) and `GATE_TIMEOUT` fail reasons.
  - Enforces missing/invalid gate output as hard-fail (`GATE_MISSING_RESULT`).
  - Enforces zero-waiver top-level policy by rejecting waiver/exception fields in evaluated gate payloads.
  - Produces deterministic top-level reason inventory with machine codes + free-text and ordered `top10ExecutiveSummary` above `fullRegister`.
  - Enforces mandatory failure-bundle policy for failed P0 gates (`EVIDENCE_MISSING_BUNDLE` on any bundle contract miss).
- Added `scripts/tests/release-portability-verdict.test.js` coverage for Task 11 acceptance failures:
  - unsigned evidence (`EVIDENCE_UNSIGNED`)
  - stale commit binding (`EVIDENCE_STALE_COMMIT`)
  - missing failure artifacts (`EVIDENCE_MISSING_BUNDLE`)
  - gate timeout (`GATE_TIMEOUT`)
  - missing gate result (`GATE_MISSING_RESULT`)
  - plus pass-path verdict determinism assertions for top-10/full-register structure.
- Verification:
  - `bun test scripts/tests/release-portability-verdict.test.js` ✅ (6 pass, 0 fail).
  - LSP diagnostics clean for:
    - `scripts/lib/signed-evidence-bundle.mjs`
    - `scripts/release-portability-verdict.mjs`
    - `scripts/tests/release-portability-verdict.test.js`
