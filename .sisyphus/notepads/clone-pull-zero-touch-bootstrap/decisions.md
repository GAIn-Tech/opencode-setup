# Decisions - Clone/Pull Zero-Touch Bootstrap

## Architecture Decisions
- **Automation Model**: One-command bootstrap + opt-in hooks (not fully automatic)
- **Scope**: Core + official plugins only (not external integrations)
- **Enforcement**: Warn locally, block in CI
- **SLO**: <= 10 minutes fresh clone to ready state

## Technical Decisions
- Reuse existing setup anchor (`scripts/setup-resilient.mjs`)
- Extend existing portability CI matrix for readiness checks
- Add explicit `sync` command for post-pull reconciliation
- Create authoritative functionality manifest for verification

## 2026-03-31 — Wave 1 Task 1 Manifest Authority
- Added `scripts/bootstrap-manifest.json` as canonical static source for **core + official plugins** bootstrap scope.
- Official plugin membership is now explicit in the manifest and checked against `opencode-config/opencode.json` plugin specs; no runtime discovery is used.
- Added deterministic validator contract (`scripts/verify-bootstrap-manifest.mjs`) with machine output: `{ valid, missing, failed, reasons }`.
- Added TDD guardrail test suite at `scripts/tests/verify-bootstrap-manifest.test.js` to lock deterministic pass/fail semantics.

## 2026-03-31 — Wave 1 Task 4 No-Hidden-Execution Policy
- Added `scripts/verify-no-hidden-exec.mjs` with deterministic machine output contract: `{ compliant, violations, reasons }`.
- Enforced opt-in hooks policy by removing implicit hook installation from `scripts/setup-resilient.mjs` and `package.json` `setup:base`.
- Preserved explicit opt-in path through `scripts["hooks:install"]` and added `policy:no-hidden-exec` script for CI/local gate wiring.

## 2026-03-31 — Wave 1 Task 1 Coverage Enforcement Update
- Tightened validator policy: `verify-bootstrap-manifest.mjs` now enforces **full official plugin coverage** by comparing `opencode-config/opencode.json` `plugin[]` values against manifest-declared `loadChecks.opencodePluginSpec` values.
- Added deterministic failure key: `manifest:official-plugins:missing-from-manifest:<plugin-spec>` when config contains an official plugin absent from manifest.
- Preserved static-authority rule: official plugin list remains declared in-manifest and never inferred from uncontrolled runtime state.

## 2026-03-31 — Wave 1 Task 3 Explicit Sync Reconcile
- Added explicit post-pull reconcile entrypoint: `scripts/sync-reconcile.mjs` and wired `package.json` script `sync`.
- Sync policy is deterministic and fail-closed for protected local conflicts: when tracked runtime config diverges from baseline manifest and upstream changed, reconcile blocks (`config-conflict:*`) instead of overwriting.
- Allowed drift is auto-reconciled: stale/missing lockfile triggers `bun install`; missing generated artifacts trigger `bun run generate`; safe config drift updates runtime + manifest baseline.
- Machine-readable sync output contract is fixed to `{ ok, reconciled, blocked, reasons, timestamp }`.

## 2026-03-31 — Wave 1 Task 6 CI Bootstrap Readiness Scenarios
- Added dedicated blocking CI workflow: `.github/workflows/bootstrap-readiness.yml` with two required readiness jobs: `fresh-clone` and `pull-reconcile`.
- Readiness jobs run as matrix legs on `ubuntu-latest` and `windows-latest` with strict deterministic env baseline (`LC_ALL`, `TZ`, `LANG`) and isolated runtime config roots via `${{ runner.temp }}`.
- Fresh clone gate runs `bun run setup` with machine report output and hard-fails when `duration_seconds > 600` to enforce bootstrap SLO.
- Pull reconcile gate creates deterministic runtime drift (remove runtime `opencode.json` + `tool-manifest.json`), runs `bun run sync`, and requires reconciled markers (`config-created:opencode.json`, `generated-artifacts:reconciled`) plus post-sync `verify-setup` pass.
- Explicitly kept required readiness jobs fail-closed by not using `continue-on-error`.
