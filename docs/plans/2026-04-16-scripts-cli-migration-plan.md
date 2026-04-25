# Scripts Migration Plan (Core 93)

## Scope and selection

- Total .mjs under scripts/: **111** (excluding temporary generator script).
- Core infrastructure set for CLI migration planning: **93 scripts**.
- Excluded from this plan: frontier/perf/fault/evals/security/governance/ops/replay FG harness scripts (16) and lib unit tests (2).

## Category distribution

- Governance: 30
- Deployment: 13
- Health: 17
- Model: 3
- State: 2
- Utility: 28

## Migration action summary

- migrate as-is: 40
- refactor: 21
- consolidate: 26
- deprecate: 6

## Priority summary

- P1: 51
- P2: 26
- P0: 10
- P3: 6

## Key dependency clusters

### Bootstrap/Setup

- scripts/bootstrap-cache-guard.mjs
- scripts/bootstrap-runtime.mjs
- scripts/preflight-versions.mjs
- scripts/setup-resilient.mjs
- scripts/tests/bootstrap-runtime.test.mjs
- scripts/verify-bootstrap-manifest.mjs
- scripts/verify-bootstrap-prereqs.mjs
- scripts/verify-setup.mjs

### Skill Governance

- scripts/check-skill-consistency.mjs
- scripts/check-skill-coverage.mjs
- scripts/check-skill-overlap-governance.mjs
- scripts/consolidate-skills.mjs
- scripts/import-antigravity-skills.mjs
- scripts/init-kb.mjs
- scripts/meta-super-cycle.mjs
- scripts/normalize-superpowers-skills.mjs
- scripts/run-skill-routing-gates.mjs
- scripts/runtime-skill-tracker.mjs
- scripts/skill-profile-loader.mjs
- scripts/skill-routing-evaluator.mjs
- scripts/skills-manage.mjs
- scripts/synthesize-meta-kb.mjs
- scripts/tests/check-skill-coverage.test.mjs
- scripts/tests/skill-implied-full-coverage.test.mjs
- scripts/validate-skill-import.mjs

### Model Lifecycle

- scripts/model-rollback.mjs
- scripts/validate-models.mjs
- scripts/weekly-model-sync.mjs

### Runtime/MCP

- scripts/bootstrap-runtime.mjs
- scripts/generate-mcp-config.mjs
- scripts/lib/cli-runtime.mjs
- scripts/mcp-exercise-harness.mjs
- scripts/mcp-mirror-coherence.mjs
- scripts/mcp-smoke-harness.mjs
- scripts/rebuild-q-runtime.mjs
- scripts/report-mcp-lifecycle.mjs
- scripts/run-distill-mcp.mjs
- scripts/runtime-context-compliance.mjs
- scripts/runtime-skill-tracker.mjs
- scripts/runtime-tool-surface-proof.mjs
- scripts/runtime-tool-telemetry.mjs
- scripts/runtime-workflow-scenarios.mjs
- scripts/tests/bootstrap-runtime.test.mjs
- scripts/tests/runtime-context-compliance.test.mjs
- scripts/tests/runtime-workflow-scenarios.test.mjs

### Config Validation

- scripts/copy-config.mjs
- scripts/generate-mcp-config.mjs
- scripts/migrate-central-config.mjs
- scripts/protocol-compliance-pass.mjs
- scripts/sync-user-config.mjs
- scripts/validate-config-coherence.mjs
- scripts/validate-config.mjs
- scripts/validate-control-plane-schema.mjs
- scripts/validate-fallback-consistency.mjs
- scripts/validate-launcher-contract.mjs
- scripts/validate-models.mjs
- scripts/validate-plugin-compatibility.mjs
- scripts/validate-policies-structure.mjs
- scripts/validate-skill-import.mjs
- scripts/verify-bootstrap-manifest.mjs
- scripts/verify-bootstrap-prereqs.mjs
- scripts/verify-integration.mjs
- scripts/verify-no-hidden-exec.mjs
- scripts/verify-plugin-parity.mjs
- scripts/verify-plugin-readiness.mjs
- scripts/verify-portability.mjs
- scripts/verify-setup.mjs

## Direct script-to-script dependencies

- scripts/bootstrap-cache-guard.mjs -> scripts/resolve-root.mjs
- scripts/bootstrap-runtime.mjs -> scripts/bootstrap-runtime.mjs
- scripts/check-agents-drift.mjs -> scripts/resolve-root.mjs
- scripts/check-hardcoded-paths.mjs -> scripts/check-hardcoded-paths.mjs
- scripts/check-hardcoded-paths.mjs -> scripts/resolve-root.mjs
- scripts/check-skill-coverage.mjs -> scripts/skill-profile-loader.mjs
- scripts/check-skill-coverage.mjs -> scripts/tests/skill-implied-full-coverage.test.mjs
- scripts/ci-warning-budget.mjs -> scripts/resolve-root.mjs
- scripts/commit-governance.mjs -> scripts/resolve-root.mjs
- scripts/consolidate-skills.mjs -> scripts/lib/yaml-frontmatter-parser.mjs
- scripts/copy-config.mjs -> scripts/generate-mcp-config.mjs
- scripts/copy-config.mjs -> scripts/resolve-root.mjs
- scripts/deployment-state.mjs -> scripts/deployment-state.mjs
- scripts/deployment-state.mjs -> scripts/resolve-root.mjs
- scripts/docs-gate.mjs -> scripts/resolve-root.mjs
- scripts/doctor.mjs -> scripts/check-skill-consistency.mjs
- scripts/doctor.mjs -> scripts/mcp-mirror-coherence.mjs
- scripts/doctor.mjs -> scripts/resolve-root.mjs
- scripts/doctor.mjs -> scripts/supply-chain-guard.mjs
- scripts/doctor.mjs -> scripts/verify-portability.mjs
- scripts/doctor.mjs -> scripts/verify-setup.mjs
- scripts/fault-injection-tests.mjs -> scripts/check-skill-consistency.mjs
- scripts/fault-injection-tests.mjs -> scripts/doctor.mjs
- scripts/fault-injection-tests.mjs -> scripts/mcp-mirror-coherence.mjs
- scripts/fault-injection-tests.mjs -> scripts/resolve-root.mjs
- scripts/fault-injection-tests.mjs -> scripts/supply-chain-guard.mjs
- scripts/fault-injection-tests.mjs -> scripts/verify-portability.mjs
- scripts/fault-injection-tests.mjs -> scripts/verify-setup.mjs
- scripts/generate-mcp-config.mjs -> scripts/generate-mcp-config.mjs
- scripts/generate-mcp-config.mjs -> scripts/resolve-root.mjs
- scripts/generate-portability-report.mjs -> scripts/fault-injection-tests.mjs
- scripts/generate-portability-report.mjs -> scripts/generate-portability-report.mjs
- scripts/generate-portability-report.mjs -> scripts/resolve-root.mjs
- scripts/generate-portability-report.mjs -> scripts/setup-resilient.mjs
- scripts/generate-portability-report.mjs -> scripts/sync-reconcile.mjs
- scripts/generate-portability-report.mjs -> scripts/verify-bootstrap-manifest.mjs
- scripts/generate-portability-report.mjs -> scripts/verify-bootstrap-prereqs.mjs
- scripts/generate-portability-report.mjs -> scripts/verify-no-hidden-exec.mjs
- scripts/generate-portability-report.mjs -> scripts/verify-plugin-readiness.mjs
- scripts/generate-portability-report.mjs -> scripts/verify-portability.mjs
- scripts/generate-portability-report.mjs -> scripts/verify-setup.mjs
- scripts/health-check.mjs -> scripts/link-packages.mjs
- scripts/health-check.mjs -> scripts/resolve-root.mjs
- scripts/import-antigravity-skills.mjs -> scripts/import-antigravity-skills.mjs
- scripts/import-antigravity-skills.mjs -> scripts/lib/yaml-frontmatter-parser.mjs
- scripts/ingest-sessions.mjs -> scripts/ingest-sessions.mjs
- scripts/ingest-sessions.mjs -> scripts/resolve-root.mjs
- scripts/install-git-hooks.mjs -> scripts/commit-governance.mjs
- scripts/install-git-hooks.mjs -> scripts/learning-gate.mjs
- scripts/install-git-hooks.mjs -> scripts/resolve-root.mjs
- scripts/install-git-hooks.mjs -> scripts/synthesize-meta-kb.mjs
- scripts/install-git-hooks.mjs -> scripts/verify-portability.mjs
- scripts/integrity-guard.mjs -> scripts/resolve-root.mjs
- scripts/learning-gate.mjs -> scripts/learning-gate.mjs
- scripts/learning-gate.mjs -> scripts/resolve-root.mjs
- scripts/link-packages.mjs -> scripts/resolve-root.mjs
- scripts/mcp-exercise-harness.mjs -> scripts/resolve-root.mjs
- scripts/mcp-exercise-harness.mjs -> scripts/run-distill-mcp.mjs
- scripts/mcp-mirror-coherence.mjs -> scripts/generate-mcp-config.mjs
- scripts/mcp-mirror-coherence.mjs -> scripts/mcp-mirror-coherence.mjs
- scripts/mcp-mirror-coherence.mjs -> scripts/resolve-root.mjs
- scripts/mcp-smoke-harness.mjs -> scripts/resolve-root.mjs
- scripts/meta-super-cycle.mjs -> scripts/meta-super-cycle.mjs
- scripts/migrate-central-config.mjs -> scripts/migrate-central-config.mjs
- scripts/model-rollback.mjs -> scripts/model-rollback.mjs
- scripts/model-rollback.mjs -> scripts/resolve-root.mjs
- scripts/model-rollback.mjs -> scripts/validate-models.mjs
- scripts/normalize-superpowers-skills.mjs -> scripts/lib/yaml-frontmatter-parser.mjs
- scripts/opencode-with-dashboard.mjs -> scripts/resolve-root.mjs
- scripts/pr-governance.mjs -> scripts/resolve-root.mjs
- scripts/preload-state-persist.mjs -> scripts/preload-state-persist.mjs
- scripts/protocol-compliance-pass.mjs -> scripts/learning-gate.mjs
- scripts/protocol-compliance-pass.mjs -> scripts/resolve-root.mjs
- scripts/protocol-compliance-pass.mjs -> scripts/runtime-tool-surface-proof.mjs
- scripts/rebuild-q-runtime.mjs -> scripts/resolve-root.mjs
- scripts/release-portability-verdict.mjs -> scripts/resolve-root.mjs
- scripts/repair.mjs -> scripts/copy-config.mjs
- scripts/repair.mjs -> scripts/generate-mcp-config.mjs
- scripts/repair.mjs -> scripts/learning-gate.mjs
- scripts/repair.mjs -> scripts/mcp-mirror-coherence.mjs
- scripts/repair.mjs -> scripts/resolve-root.mjs
- scripts/repair.mjs -> scripts/supply-chain-guard.mjs
- scripts/repair.mjs -> scripts/verify-portability.mjs
- scripts/repair.mjs -> scripts/verify-setup.mjs
- scripts/report-mcp-lifecycle.mjs -> scripts/resolve-root.mjs
- scripts/run-distill-mcp.mjs -> scripts/resolve-root.mjs
- scripts/run-distill-mcp.mjs -> scripts/run-distill-mcp.mjs
- scripts/run-package-smokes.mjs -> scripts/resolve-root.mjs
- scripts/runtime-context-compliance.mjs -> scripts/bootstrap-runtime.mjs
- scripts/runtime-tool-surface-proof.mjs -> scripts/resolve-root.mjs
- scripts/runtime-tool-telemetry.mjs -> scripts/runtime-tool-telemetry.mjs
- scripts/runtime-workflow-scenarios.mjs -> scripts/bootstrap-runtime.mjs
- scripts/setup-resilient.mjs -> scripts/bootstrap-cache-guard.mjs
- scripts/setup-resilient.mjs -> scripts/check-skill-consistency.mjs
- scripts/setup-resilient.mjs -> scripts/copy-config.mjs
- scripts/setup-resilient.mjs -> scripts/generate-mcp-config.mjs
- scripts/setup-resilient.mjs -> scripts/mcp-mirror-coherence.mjs
- scripts/setup-resilient.mjs -> scripts/preflight-versions.mjs
- scripts/setup-resilient.mjs -> scripts/resolve-root.mjs
- scripts/setup-resilient.mjs -> scripts/supply-chain-guard.mjs
- scripts/setup-resilient.mjs -> scripts/validate-config.mjs
- scripts/setup-resilient.mjs -> scripts/validate-plugin-compatibility.mjs
- scripts/setup-resilient.mjs -> scripts/verify-portability.mjs
- scripts/setup-resilient.mjs -> scripts/verify-setup.mjs
- scripts/skill-profile-loader.mjs -> scripts/skill-profile-loader.mjs
- scripts/skill-routing-evaluator.mjs -> scripts/skill-profile-loader.mjs
- scripts/skills-manage.mjs -> scripts/learning-gate.mjs
- scripts/skills-manage.mjs -> scripts/skills-manage.mjs
- scripts/smoke-pipeline.mjs -> scripts/api-sanity.mjs
- scripts/smoke-pipeline.mjs -> scripts/resolve-root.mjs
- scripts/smoke-pipeline.mjs -> scripts/verify-setup.mjs
- scripts/supply-chain-guard.mjs -> scripts/resolve-root.mjs
- scripts/sync-project-learnings.mjs -> scripts/sync-project-learnings.mjs
- scripts/sync-reconcile.mjs -> scripts/resolve-root.mjs
- scripts/sync-user-config.mjs -> scripts/resolve-root.mjs
- scripts/sync-user-config.mjs -> scripts/sync-user-config.mjs
- scripts/sync-user-config.mjs -> scripts/verify-portability.mjs
- scripts/synthesize-meta-kb.mjs -> scripts/resolve-root.mjs
- scripts/synthesize-meta-kb.mjs -> scripts/synthesize-meta-kb.mjs
- scripts/system-health.mjs -> scripts/system-health.mjs
- scripts/tests/check-agents-drift-structure-nesting.test.mjs -> scripts/check-agents-drift.mjs
- scripts/tests/runtime-context-compliance.test.mjs -> scripts/runtime-context-compliance.mjs
- scripts/tests/runtime-workflow-scenarios.test.mjs -> scripts/runtime-workflow-scenarios.mjs
- scripts/tests/skill-implied-full-coverage.test.mjs -> scripts/check-skill-coverage.mjs
- scripts/validate-config-coherence.mjs -> scripts/copy-config.mjs
- scripts/validate-config-coherence.mjs -> scripts/resolve-root.mjs
- scripts/validate-config.mjs -> scripts/resolve-root.mjs
- scripts/validate-control-plane-schema.mjs -> scripts/resolve-root.mjs
- scripts/validate-fallback-consistency.mjs -> scripts/resolve-root.mjs
- scripts/validate-launcher-contract.mjs -> scripts/validate-launcher-contract.mjs
- scripts/validate-models.mjs -> scripts/health-check.mjs
- scripts/validate-models.mjs -> scripts/resolve-root.mjs
- scripts/validate-plugin-compatibility.mjs -> scripts/resolve-root.mjs
- scripts/validate-policies-structure.mjs -> scripts/resolve-root.mjs
- scripts/verify-bootstrap-prereqs.mjs -> scripts/resolve-root.mjs
- scripts/verify-integration.mjs -> scripts/copy-config.mjs
- scripts/verify-integration.mjs -> scripts/skill-profile-loader.mjs
- scripts/verify-no-hidden-exec.mjs -> scripts/setup-resilient.mjs
- scripts/verify-portability.mjs -> scripts/doctor.mjs
- scripts/verify-portability.mjs -> scripts/model-rollback.mjs
- scripts/verify-portability.mjs -> scripts/resolve-root.mjs
- scripts/verify-portability.mjs -> scripts/supply-chain-guard.mjs
- scripts/verify-portability.mjs -> scripts/verify-portability.mjs
- scripts/verify-portability.mjs -> scripts/verify-setup.mjs
- scripts/verify-setup.mjs -> scripts/install-git-hooks.mjs
- scripts/verify-setup.mjs -> scripts/link-packages.mjs
- scripts/verify-setup.mjs -> scripts/migrate-central-config.mjs
- scripts/verify-setup.mjs -> scripts/resolve-root.mjs
- scripts/verify-setup.mjs -> scripts/validate-config.mjs
- scripts/weekly-model-sync.mjs -> scripts/health-check.mjs
- scripts/weekly-model-sync.mjs -> scripts/resolve-root.mjs
- scripts/weekly-model-sync.mjs -> scripts/validate-models.mjs

## Script inventory and migration decisions

| Script | Purpose | Category | Dependencies | Priority | Migration |
|---|---|---|---|---|---|
| scripts/api-sanity.mjs | Api Sanity automation script. | Health | - | P1 | migrate as-is |
| scripts/bootstrap-cache-guard.mjs | Bootstrap and verify local runtime setup prerequisites. | Deployment | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/bootstrap-runtime.mjs | CLI mode: node scripts/bootstrap-runtime.mjs --status | Deployment | scripts/bootstrap-runtime.mjs | P1 | migrate as-is |
| scripts/check-agents-drift.mjs | Check agents drift. | Governance | scripts/resolve-root.mjs | P1 | refactor |
| scripts/check-hardcoded-paths.mjs | --- Configuration --- | Governance | scripts/check-hardcoded-paths.mjs, scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/check-skill-consistency.mjs | Check skill consistency. | Governance | - | P2 | consolidate |
| scripts/check-skill-coverage.mjs | Check skill coverage. | Governance | scripts/skill-profile-loader.mjs, scripts/tests/skill-implied-full-coverage.test.mjs | P2 | consolidate |
| scripts/check-skill-overlap-governance.mjs | Found cycle: extract the cycle portion from path | Governance | - | P2 | consolidate |
| scripts/ci-boundary-enforce.mjs | Ci Boundary Enforce automation script. | Governance | - | P1 | refactor |
| scripts/ci-warning-budget.mjs | ANSI colors | Governance | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/commit-governance.mjs | Enforce governance policy and release gates. | Governance | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/consolidate-skills.mjs | Source: User's superpowers installation | Utility | scripts/lib/yaml-frontmatter-parser.mjs | P2 | consolidate |
| scripts/copy-config.mjs | NOTE: 'skills' is intentionally excluded — handled below with MERGE logic | Deployment | scripts/generate-mcp-config.mjs, scripts/resolve-root.mjs | P1 | refactor |
| scripts/deployment-state.mjs | Manage persisted deployment/runtime state artifacts. | State | scripts/deployment-state.mjs, scripts/resolve-root.mjs | P0 | migrate as-is |
| scripts/docs-gate.mjs | Enforce governance policy and release gates. | Governance | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/docs-governance-check.mjs | Enforce governance policy and release gates. | Governance | - | P1 | migrate as-is |
| scripts/doctor.mjs | best effort | Health | scripts/check-skill-consistency.mjs, scripts/mcp-mirror-coherence.mjs, scripts/resolve-root.mjs, scripts/supply-chain-guard.mjs, scripts/verify-portability.mjs, scripts/verify-setup.mjs | P1 | migrate as-is |
| scripts/env-contract-check.mjs | Env Contract Check automation script. | Governance | - | P1 | refactor |
| scripts/fault-injection-tests.mjs | Test results tracking | Health | scripts/check-skill-consistency.mjs, scripts/doctor.mjs, scripts/mcp-mirror-coherence.mjs, scripts/resolve-root.mjs, scripts/supply-chain-guard.mjs, scripts/verify-portability.mjs, scripts/verify-setup.mjs | P1 | migrate as-is |
| scripts/generate-mcp-config.mjs | Normalize to forward slashes (MCP config uses forward slashes even on Windows) | Deployment | scripts/generate-mcp-config.mjs, scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/generate-portability-report.mjs | Parse arguments | Utility | scripts/fault-injection-tests.mjs, scripts/generate-portability-report.mjs, scripts/resolve-root.mjs, scripts/setup-resilient.mjs, scripts/sync-reconcile.mjs, scripts/verify-bootstrap-manifest.mjs, scripts/verify-bootstrap-prereqs.mjs, scripts/verify-no-hidden-exec.mjs, scripts/verify-plugin-readiness.mjs, scripts/verify-portability.mjs, scripts/verify-setup.mjs | P1 | refactor |
| scripts/health-check.mjs | Ignore malformed files. | Health | scripts/link-packages.mjs, scripts/resolve-root.mjs | P0 | refactor |
| scripts/import-antigravity-skills.mjs | ── CLI Argument Parsing ──────────────────────────────────────────────────── | Utility | scripts/import-antigravity-skills.mjs, scripts/lib/yaml-frontmatter-parser.mjs | P2 | consolidate |
| scripts/ingest-sessions.mjs | Resolve packages from this repo root | Utility | scripts/ingest-sessions.mjs, scripts/resolve-root.mjs | P1 | refactor |
| scripts/init-kb.mjs | Get workspace root (default to repo root, allow override via --workspace) | Utility | - | P2 | consolidate |
| scripts/install-git-hooks.mjs | Install Git Hooks automation script. | Deployment | scripts/commit-governance.mjs, scripts/learning-gate.mjs, scripts/resolve-root.mjs, scripts/synthesize-meta-kb.mjs, scripts/verify-portability.mjs | P1 | migrate as-is |
| scripts/integrity-guard.mjs | Check OPENCODE_DATA_DIR first (test compatibility) | Health | scripts/resolve-root.mjs | P1 | refactor |
| scripts/learning-gate.mjs | Sanitize base parameter to prevent command injection | Governance | scripts/learning-gate.mjs, scripts/resolve-root.mjs | P0 | refactor |
| scripts/lib/cli-runtime.mjs | continue | Utility | - | P2 | consolidate |
| scripts/lib/signed-evidence-bundle.mjs | Signed Evidence Bundle automation script. | Utility | - | P2 | consolidate |
| scripts/lib/yaml-frontmatter-parser.mjs | Empty frontmatter block | Utility | - | P2 | consolidate |
| scripts/link-packages.mjs | Link Packages automation script. | Deployment | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/mcp-exercise-harness.mjs | Generate deterministic run ID and commit SHA for attestation binding | Utility | scripts/resolve-root.mjs, scripts/run-distill-mcp.mjs | P2 | consolidate |
| scripts/mcp-mirror-coherence.mjs | Mcp Mirror Coherence automation script. | Utility | scripts/generate-mcp-config.mjs, scripts/mcp-mirror-coherence.mjs, scripts/resolve-root.mjs | P2 | consolidate |
| scripts/mcp-smoke-harness.mjs | Cross-platform data home resolution (P06 fix) | Health | scripts/resolve-root.mjs | P2 | consolidate |
| scripts/meta-super-cycle.mjs | Read files with cascade failure protection - each file is independent | Utility | scripts/meta-super-cycle.mjs | P2 | consolidate |
| scripts/migrate-central-config.mjs | Read source configs | Deployment | scripts/migrate-central-config.mjs | P1 | refactor |
| scripts/model-rollback.mjs | --------------------------------------------------------------------------- | Model | scripts/model-rollback.mjs, scripts/resolve-root.mjs, scripts/validate-models.mjs | P0 | refactor |
| scripts/normalize-superpowers-skills.mjs | Recurse into superpowers | Utility | scripts/lib/yaml-frontmatter-parser.mjs | P2 | consolidate |
| scripts/opencode-with-dashboard.mjs | Opencode With Dashboard automation script. | Deployment | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/pr-governance.mjs | Enforce governance policy and release gates. | Governance | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/preflight-versions.mjs | Preflight Versions automation script. | Health | - | P1 | migrate as-is |
| scripts/preload-state-persist.mjs | Load state file if it exists | State | scripts/preload-state-persist.mjs | P1 | migrate as-is |
| scripts/protocol-compliance-pass.mjs | Protocol Compliance Pass automation script. | Governance | scripts/learning-gate.mjs, scripts/resolve-root.mjs, scripts/runtime-tool-surface-proof.mjs | P0 | migrate as-is |
| scripts/rebuild-q-runtime.mjs | Rebuild Q Runtime automation script. | Utility | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/release-portability-verdict.mjs | Release Portability Verdict automation script. | Utility | scripts/resolve-root.mjs | P1 | refactor |
| scripts/remove-tier1-from-tier2.mjs | Skills pre-loaded by tier_1 categories (all 19 unique skills across 17 categories) | Utility | - | P2 | consolidate |
| scripts/repair.mjs | continue best-effort cleanup | Utility | scripts/copy-config.mjs, scripts/generate-mcp-config.mjs, scripts/learning-gate.mjs, scripts/mcp-mirror-coherence.mjs, scripts/resolve-root.mjs, scripts/supply-chain-guard.mjs, scripts/verify-portability.mjs, scripts/verify-setup.mjs | P1 | refactor |
| scripts/report-mcp-lifecycle.mjs | Report Mcp Lifecycle automation script. | Utility | scripts/resolve-root.mjs | P1 | refactor |
| scripts/resolve-root.mjs | 1. Explicit env var (highest priority — allows CI/Docker overrides) | Utility | - | P1 | migrate as-is |
| scripts/run-distill-mcp.mjs | Run Distill Mcp automation script. | Utility | scripts/resolve-root.mjs, scripts/run-distill-mcp.mjs | P1 | migrate as-is |
| scripts/run-package-smokes.mjs | Cache Bun.which() results to avoid repeated PATH lookups | Health | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/run-skill-routing-gates.mjs | --- Parse args --- | Governance | - | P2 | consolidate |
| scripts/runtime-context-compliance.mjs | Runtime Context Compliance automation script. | Health | scripts/bootstrap-runtime.mjs | P1 | migrate as-is |
| scripts/runtime-skill-tracker.mjs | Read stdin | Utility | - | P2 | consolidate |
| scripts/runtime-tool-surface-proof.mjs | fall through and treat input as raw source text | Health | scripts/resolve-root.mjs | P2 | consolidate |
| scripts/runtime-tool-telemetry.mjs | Import PipelineMetricsCollector for SQLite persistence (lazy-loaded to avoid debug noise) | Health | scripts/runtime-tool-telemetry.mjs | P2 | consolidate |
| scripts/runtime-workflow-scenarios.mjs | Runtime Workflow Scenarios automation script. | Health | scripts/bootstrap-runtime.mjs | P2 | consolidate |
| scripts/setup-resilient.mjs | --------------------------------------------------------------------------- | Deployment | scripts/bootstrap-cache-guard.mjs, scripts/check-skill-consistency.mjs, scripts/copy-config.mjs, scripts/generate-mcp-config.mjs, scripts/mcp-mirror-coherence.mjs, scripts/preflight-versions.mjs, scripts/resolve-root.mjs, scripts/supply-chain-guard.mjs, scripts/validate-config.mjs, scripts/validate-plugin-compatibility.mjs, scripts/verify-portability.mjs, scripts/verify-setup.mjs | P0 | refactor |
| scripts/skill-profile-loader.mjs | --- Hierarchical scoring helpers (Task 2) --- | Utility | scripts/skill-profile-loader.mjs | P2 | consolidate |
| scripts/skill-routing-evaluator.mjs | --- Built-in default evaluation tasks --- | Utility | scripts/skill-profile-loader.mjs | P2 | consolidate |
| scripts/skills-manage.mjs | ─── Utilities ─────────────────────────────────────────────────────────────── | Utility | scripts/learning-gate.mjs, scripts/skills-manage.mjs | P2 | consolidate |
| scripts/smoke-pipeline.mjs | Execute smoke tests for critical runtime surfaces. | Health | scripts/api-sanity.mjs, scripts/resolve-root.mjs, scripts/verify-setup.mjs | P0 | migrate as-is |
| scripts/supply-chain-guard.mjs | Parse plugin name from spec (e.g., "@tarquinen/opencode-dcp@latest" -> "@tarquinen/opencode-dcp") | Health | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/sync-project-learnings.mjs | Paths | Utility | scripts/sync-project-learnings.mjs | P2 | consolidate |
| scripts/sync-reconcile.mjs | Synchronize configuration, catalog, or learning artifacts. | Utility | scripts/resolve-root.mjs | P1 | refactor |
| scripts/sync-user-config.mjs | Files to sync (source relative to opencode-config/) | Utility | scripts/resolve-root.mjs, scripts/sync-user-config.mjs, scripts/verify-portability.mjs | P1 | migrate as-is |
| scripts/synthesize-meta-kb.mjs | --- CLI flags --- | Utility | scripts/resolve-root.mjs, scripts/synthesize-meta-kb.mjs | P2 | consolidate |
| scripts/system-health.mjs | ── ANSI colors (skipped in JSON mode) ──────────────────────────────────────── | Health | scripts/generate-meta-kb.mjs, scripts/system-health.mjs | P1 | refactor |
| scripts/tests/bootstrap-runtime.test.mjs | Bootstrap and verify local runtime setup prerequisites. | Deployment | - | P3 | deprecate |
| scripts/tests/check-agents-drift-structure-nesting.test.mjs | Check agents drift structure nesting.test. | Governance | scripts/check-agents-drift.mjs | P3 | deprecate |
| scripts/tests/check-skill-coverage.test.mjs | Check skill coverage.test. | Governance | - | P3 | deprecate |
| scripts/tests/runtime-context-compliance.test.mjs | Runtime Context Compliance.test automation script. | Health | scripts/runtime-context-compliance.mjs | P3 | deprecate |
| scripts/tests/runtime-workflow-scenarios.test.mjs | Runtime Workflow Scenarios.test automation script. | Health | scripts/runtime-workflow-scenarios.mjs | P3 | deprecate |
| scripts/tests/skill-implied-full-coverage.test.mjs | Manage skill metadata, routing, and consistency checks. | Utility | scripts/check-skill-coverage.mjs | P3 | deprecate |
| scripts/validate-config-coherence.mjs | Files that are copied from repo then intentionally enriched by post-copy scripts | Governance | scripts/copy-config.mjs, scripts/resolve-root.mjs | P1 | refactor |
| scripts/validate-config.mjs | Validate config. | Governance | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/validate-control-plane-schema.mjs | Validate control plane schema. | Governance | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/validate-fallback-consistency.mjs | Validate fallback consistency. | Governance | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/validate-launcher-contract.mjs | --- Load contract --- | Governance | scripts/validate-launcher-contract.mjs | P1 | migrate as-is |
| scripts/validate-models.mjs | Validate models. | Model | scripts/health-check.mjs, scripts/resolve-root.mjs | P0 | migrate as-is |
| scripts/validate-plugin-compatibility.mjs | Validate plugin compatibility. | Governance | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/validate-policies-structure.mjs | Validate policies structure. | Governance | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/validate-skill-import.mjs | Skills that are meta/builtin and don't need SKILL.md files on disk | Governance | - | P2 | consolidate |
| scripts/verify-bootstrap-manifest.mjs | Verify bootstrap manifest. | Deployment | - | P1 | migrate as-is |
| scripts/verify-bootstrap-prereqs.mjs | Verify bootstrap prereqs. | Deployment | scripts/resolve-root.mjs | P1 | migrate as-is |
| scripts/verify-integration.mjs | Configuration | Governance | scripts/copy-config.mjs, scripts/skill-profile-loader.mjs | P1 | migrate as-is |
| scripts/verify-no-hidden-exec.mjs | Verify no hidden exec. | Governance | scripts/setup-resilient.mjs | P1 | migrate as-is |
| scripts/verify-plugin-parity.mjs | Verify plugin parity. | Governance | - | P1 | migrate as-is |
| scripts/verify-plugin-readiness.mjs | Verify plugin readiness. | Governance | - | P1 | refactor |
| scripts/verify-portability.mjs | --- Skip/Fallback Budget Enforcement --- | Governance | scripts/doctor.mjs, scripts/model-rollback.mjs, scripts/resolve-root.mjs, scripts/supply-chain-guard.mjs, scripts/verify-portability.mjs, scripts/verify-setup.mjs | P1 | refactor |
| scripts/verify-setup.mjs | Ignore malformed files. | Deployment | scripts/install-git-hooks.mjs, scripts/link-packages.mjs, scripts/migrate-central-config.mjs, scripts/resolve-root.mjs, scripts/validate-config.mjs | P0 | refactor |
| scripts/weekly-model-sync.mjs | Synchronize configuration, catalog, or learning artifacts. | Model | scripts/health-check.mjs, scripts/resolve-root.mjs, scripts/validate-models.mjs | P0 | migrate as-is |

## Recommended CLI migration waves

1. **Wave 1 (P0):** health-check, deployment-state, learning-gate, validate-models, model-rollback, weekly-model-sync, setup-resilient, verify-setup, smoke-pipeline, protocol-compliance-pass.
2. **Wave 2 (P1):** standalone validate/check/verify scripts and operational runbooks with low coupling.
3. **Wave 3 (P2):** consolidate overlapping skill/runtime/MCP orchestration scripts into unified command groups.
4. **Wave 4 (P3):** deprecate script-level tests in favor of `bun test` suites and retain only command entrypoints.
