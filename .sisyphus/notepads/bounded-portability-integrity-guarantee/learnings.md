# Learnings - Bounded Portability & Integrity Guarantee

## Conventions
- All gates must produce deterministic JSON output
- Evidence artifacts go in `.sisyphus/evidence/`
- RED-GREEN-REFACTOR TDD approach for all new logic
- Fail-closed behavior for trust/integrity gates
- No silent downgrade from blocking to warning

## Patterns
- Use `scripts/verify-portability.mjs` as entry point for gates
- JSON structure: `{ supported: boolean, reason: string, detected: object }`
- Evidence naming: `task-{N}-{scenario}.json`
- Support-floor gate should run before other checks in strict mode (fail-fast, fail-closed)
- Support-floor simulation uses deterministic env overrides: `OPENCODE_PORTABILITY_PLATFORM`, `OPENCODE_PORTABILITY_RELEASE`, `OPENCODE_PORTABILITY_ARCH`, `OPENCODE_PORTABILITY_BUN_VERSION`
- Hermetic strict-mode baseline should be explicit and deterministic: `LC_ALL=C`, `TZ=UTC`, absolute roots for `OPENCODE_CONFIG_HOME`, `OPENCODE_DATA_HOME`, `XDG_CACHE_HOME`, and a unified absolute temp root (`TMPDIR`/`TEMP`/`TMP`).
- Hermetic negative-path validation should be fault-injectable (`OPENCODE_PORTABILITY_FAULT_GLOBAL_LEAK=1`) so strict mode deterministically returns non-zero with `hermeticityReport.violations` populated.
- Supply-chain release gate should return deterministic `supplyChainReport` with `status` + `reason` for machine aggregation
- Exception path contract should be explicit (`approvalId`, `approvedBy`, `reason`, `expiresAt`, `ticket`) and include audit metadata in output
- Restore-drill gate should be strict fail-closed with deterministic `restoreDrillReport` fields: `status`, `rto`, `rpo`, and `evidence`; validate ISO timestamps (`startedAt`, `completedAt`, `backupTimestamp`), require `integrityCheck="pass"`, compute `rto/rpo` minutes, and block when `rto>60` or `rpo>15`.
- Privilege/break-glass governance gate should return deterministic `privilegeGovernanceReport` with `status` + `violations`, and strict mode must fail-closed on unauthorized escalation, missing break-glass audit trails, missing approvals, or expired access windows.
- Observability integrity gate should emit deterministic `observabilityIntegrityReport` (`status`, `violations`, `checks`, `baseline`) and fail-closed in strict mode on log-chain, metrics consistency, trace completeness/authenticity, or audit-trail tamper-evidence violations.
- Determinism gate should return `determinismReport` with fail-closed checks for filesystem path resolution/case policy, timezone+locale baseline (`TZ=UTC`, `LC_ALL=C`, `LANG` set), and UTF-8 encoding (`OPENCODE_PORTABILITY_ENCODING` or locale-derived), with negative-path injection via `OPENCODE_PORTABILITY_FAULT_DETERMINISM=1`.
- CI strict matrix should use explicit `strict-tier` legs (`current`, `previous-stable`) and execute `node scripts/verify-portability.mjs --strict --json` with deterministic env baseline (`LC_ALL`, `TZ`, `LANG`, filesystem case policy, encoding, hermetic roots, restore-drill evidence); workflow must remain blocking (no `continue-on-error` on strict portability step).
- Release aggregation should emit deterministic `releaseVerdict` with `status`, top-level `reasons`, and per-gate `gates.{gate}.status/reasons`, and it must fail whenever any gate reports `failed`.
- ADR/control-ownership governance gate should emit deterministic `adrGovernanceReport` (`status`, `adrDirectory`, `requiredDocuments`, `checkedDocuments`, `violations`) and fail-closed in strict mode when required ADR files, required policy sections, or exception contract field tokens are missing.

## Gotchas
- Windows/macOS/Linux path differences
- Shell compatibility across matrix legs
- Locale/timezone sensitivity in determinism checks
- Immutable audit requirements for break-glass paths
- Fail-closed supply-chain checks must reject untrusted source/provenance mismatch unless approved exception metadata is valid and unexpired
