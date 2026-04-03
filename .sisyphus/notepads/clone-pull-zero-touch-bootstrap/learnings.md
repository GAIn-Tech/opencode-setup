# Learnings - Clone/Pull Zero-Touch Bootstrap

## Conventions
- One-command bootstrap (`setup`) + explicit post-pull reconcile (`sync`)
- No hidden auto-execution on clone/pull (opt-in hooks only)
- TDD for all gate logic with agent-executed QA scenarios
- Machine-readable JSON reports for all verification steps

## Patterns
- Idempotent setup/sync behavior (safe to run repeatedly)
- Deterministic failure policy for integrity mismatches
- CI-enforced readiness checks with local warnings only
- Bounded claim language: "minimal explicit setup" not "fully automatic"
- Authoritative-manifest coverage checks should validate both directions: manifest spec exists in config **and** config official plugin appears in manifest.

## Gotchas
- Windows/macOS/Linux path differences in setup scripts
- Shell compatibility across matrix legs
- Generated config drift vs user-local override conflicts
- Timing SLO measurement across cached vs uncached runs
- Baseline-aware conflict detection needs manifest history (`config-manifest.json`); without baseline hash, runtime drift must be treated as unmanaged and blocked to avoid silent data loss.

## 2026-03-31 — Task 2 Setup Idempotency + Reporting
- `scripts/setup-resilient.mjs` now emits machine-readable setup report JSON with contract: `{ ok, duration_seconds, steps, timestamp }` and per-step status (`success`/`skipped`/`failed`).
- Idempotency status is computed from pre/post fingerprint probes on mutating setup steps (`copy-config`, `generate-mcp-config`): unchanged state on rerun is marked `skipped`.
- Global user-state mutations are now explicit opt-in only (`--allow-global-writes` or `OPENCODE_SETUP_ALLOW_GLOBAL_WRITES=1`): no hidden Windows user env writes by default.
- Added TDD coverage at `scripts/tests/setup-idempotency.test.js` validating report schema/timing and converged second-run skip behavior.

## 2026-03-31 — Task 7 Official Plugin Readiness Gate
- Added `scripts/verify-plugin-readiness.mjs` readiness gate with deterministic machine-readable report contract: `{ ok, plugins, missing, failed, reasons }`.
- Gate checks each manifest-listed `officialPlugins[]` entry for local presence/loadability via `loadChecks.requiredFiles` + `loadChecks.entryPoints`, and validates `loadChecks.opencodePluginSpec` membership in `opencode-config/opencode.json`.
- Missing manifest-listed plugin files now fail closed (`ok: false`) and CLI exits non-zero; no implicit network-only assumptions are used.
- Added TDD suite `scripts/tests/verify-plugin-readiness.test.js` covering green path, missing plugin load files, config plugin mismatch, and strict non-zero CLI failure semantics.

## 2026-03-31 — Task 5 Prerequisite + Environment Contract Gate
- Added `scripts/verify-bootstrap-prereqs.mjs` with deterministic prereq report contract: `{ ok, prereqs, missing, invalid, reasons }` and strict JSON output.
- Required toolchain checks now include Bun (exact match against `.bun-version`), Node.js (>=18), and git (>=2) with deterministic non-zero exit on missing/invalid.
- Strict env baseline now enforces `LC_ALL=C`, `TZ=UTC`, and non-empty `LANG` with explicit reasons (no silent degradation path).
- Added TDD coverage in `scripts/tests/verify-bootstrap-prereqs.test.js` for missing toolchain command, env baseline mismatch, Bun version mismatch, and strict CLI JSON failure behavior.
- Captured evidence in `.sisyphus/evidence/task-5-prereqs-strict-report.json`.
