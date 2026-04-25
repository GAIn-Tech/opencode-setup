# Script Migration Plan (84 Infrastructure Scripts)

## Scope & Approach

This plan covers all **84 top-level `scripts/*.mjs` infrastructure scripts**.  
For each script, this document defines:

- Category: Governance / Deployment / Health / Model / State / Utility
- Purpose (operational intent)
- Key dependencies (shared helpers, Node core, package links)
- Migration strategy: **Migrate / Refactor / Consolidate / Deprecate**
- Priority: **Critical / High / Medium / Low**
- Implementation phase: **7.1 / 7.2 / 7.3 / 7.4**

## 1) Script Inventory + Strategy + Priority

| Script | Category | Purpose | Dependencies | Strategy | Priority | Phase |
|---|---|---|---|---|---|---|
| integrity-guard.mjs | Governance | Verifies runtime/data integrity constraints and blocks drift before execution. | `resolve-root`, `node:fs`, `node:path`, `node:os` | Migrate | Critical | 7.1 |
| verify-setup.mjs | Governance | End-to-end verification that setup produced a valid, runnable environment. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Migrate | Critical | 7.1 |
| runtime-tool-telemetry.mjs | State | Captures tool/runtime telemetry for learning and observability pipelines. | `node:fs`, `node:path`, `node:os`, `module` | Refactor | High | 7.2 |
| api-sanity.mjs | Health | Runs API smoke checks for baseline service responsiveness. | `bun`, `fetch`/runtime API surface | Migrate | High | 7.2 |
| verify-portability.mjs | Governance | Validates cross-platform behavior and portable filesystem/process assumptions. | `resolve-root`, `node:child_process`, `node:fs`, `node:path`, `node:os` | Refactor | High | 7.2 |
| verify-plugin-readiness.mjs | Governance | Ensures plugin prerequisites and expected plugin artifacts are present. | `node:fs`, `node:path`, `node:url` | Consolidate | Medium | 7.3 |
| verify-plugin-parity.mjs | Governance | Compares plugin state against canonical config to detect drift. | `node:fs`, `node:path`, `node:crypto` | Consolidate | Medium | 7.3 |
| verify-no-hidden-exec.mjs | Governance | Prevents undisclosed command execution patterns in scripts/configs. | `node:fs`, `node:path` | Consolidate | Medium | 7.3 |
| verify-bootstrap-prereqs.mjs | Governance | Checks machine/runtime prerequisites before bootstrap starts. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Migrate | Critical | 7.1 |
| verify-bootstrap-manifest.mjs | Governance | Validates bootstrap manifest completeness and structural correctness. | `node:fs`, `node:path` | Migrate | Critical | 7.1 |
| validate-launcher-contract.mjs | Governance | Validates launcher ownership/contract invariants across configs. | `node:fs`, `node:path`, `node:url` | Migrate | High | 7.2 |
| sync-reconcile.mjs | State | Reconciles user/local state with canonical setup state and policies. | `resolve-root`, `node:child_process`, `node:fs`, `node:path`, `node:crypto` | Refactor | High | 7.2 |
| supply-chain-guard.mjs | Governance | Enforces dependency and file-chain guardrails for supply-chain safety. | `resolve-root`, `node:fs`, `node:path` | Migrate | Critical | 7.1 |
| setup-resilient.mjs | Deployment | Orchestrates resilient multi-step setup with recovery safeguards. | `copy-config`, `generate-mcp-config`, `resolve-root`, `node:child_process`, `node:fs` | Refactor | Critical | 7.1 |
| runtime-workflow-scenarios.mjs | Health | Executes representative runtime workflow scenarios for regression checks. | `bootstrap-runtime`, `node:fs`, `node:path` | Consolidate | Medium | 7.3 |
| runtime-tool-surface-proof.mjs | Governance | Verifies runtime tool surface remains compliant and non-drifting. | `resolve-root`, `node:child_process`, `node:fs`, `module` | Consolidate | High | 7.2 |
| runtime-context-compliance.mjs | Governance | Tests runtime context-management protocol compliance. | `bootstrap-runtime`, `node:fs`, `node:path` | Migrate | Critical | 7.1 |
| run-package-smokes.mjs | Health | Runs package-level smoke checks to catch obvious breakage early. | `resolve-root`, `node:child_process`, `node:fs` | Consolidate | High | 7.2 |
| run-distill-mcp.mjs | Utility | Developer helper to invoke distill MCP scenarios manually. | `resolve-root`, `node:child_process`, `node:fs` | Deprecate | Low | 7.4 |
| resolve-root.mjs | Utility | Central root-resolution helper used across many scripts. | `node:fs`, `node:path`, `node:os`, `node:child_process` | Refactor | Critical | 7.1 |
| report-mcp-lifecycle.mjs | Health | Produces lifecycle/report output for MCP startup and state transitions. | `resolve-root`, `node:fs`, `node:path` | Consolidate | Medium | 7.3 |
| repair.mjs | Utility | Attempts automated recovery/remediation for known setup/runtime failures. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Migrate | High | 7.2 |
| release-portability-verdict.mjs | Governance | Computes final release portability verdict from collected checks. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Consolidate | Medium | 7.3 |
| mcp-mirror-coherence.mjs | Governance | Validates mirror/coherence between canonical and generated MCP config. | `generate-mcp-config`, `resolve-root`, `node:fs`, `node:path` | Consolidate | High | 7.2 |
| mcp-exercise-harness.mjs | Health | Runs deterministic MCP exercise harnesses for test attestation. | `resolve-root`, `node:child_process`, `node:fs`, `module` | Consolidate | Medium | 7.3 |
| mcp-smoke-harness.mjs | Health | Smoke-tests MCP startup/handshake across supported platforms. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Consolidate | High | 7.2 |
| ingest-sessions.mjs | State | Ingests session artifacts into learning/analytics pipelines. | `resolve-root`, `node:fs`, `module`, `node:path` | Refactor | High | 7.2 |
| generate-portability-report.mjs | Governance | Generates portability report artifacts from verification outputs. | `resolve-root`, `sync-reconcile`, `node:fs`, `node:child_process` | Consolidate | Medium | 7.3 |
| fault-injection-tests.mjs | Health | Executes controlled fault scenarios to validate resilience behavior. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Migrate | High | 7.2 |
| env-contract-check.mjs | Governance | Ensures environment contract variables and required invariants are satisfied. | `node:child_process`, `node:fs`, `node:path` | Migrate | Critical | 7.1 |
| check-hardcoded-paths.mjs | Governance | Static scan that blocks hardcoded-path anti-patterns. | `node:fs`, `node:path` | Migrate | Critical | 7.1 |
| doctor.mjs | Health | Diagnostic command that summarizes system state and probable fixes. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Migrate | High | 7.2 |
| copy-config.mjs | Deployment | Copies baseline config fragments and applies setup-safe merge behavior. | `generate-mcp-config`, `resolve-root`, `node:fs`, `node:path`, `node:os` | Refactor | Critical | 7.1 |
| bootstrap-cache-guard.mjs | Governance | Verifies bootstrap cache integrity and corruption prevention rules. | `resolve-root`, `node:fs`, `node:path` | Migrate | High | 7.2 |
| sync-project-learnings.mjs | State | Syncs project-scoped learning artifacts into canonical learning store. | `node:fs`, `node:fs/promises`, `node:path` | Refactor | High | 7.2 |
| init-kb.mjs | State | Initializes knowledge base scaffolding and base metadata. | `opencode-init-kb`, `node:path`, `node:url` | Migrate | Medium | 7.3 |
| sync-user-config.mjs | Deployment | Synchronizes user-level OpenCode config with repository canonical state. | `resolve-root`, `node:fs`, `node:path` | Migrate | Critical | 7.1 |
| install-git-hooks.mjs | Utility | Installs repository git hooks required by governance workflow. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Migrate | Medium | 7.3 |
| system-health.mjs | Health | Aggregates broad system health checks into one operator summary. | `node:fs`, `node:path`, `node:os`, `module` | Consolidate | High | 7.2 |
| skill-routing-evaluator.mjs | Governance | Evaluates skill routing quality/coverage against expected behavior. | `skill-profile-loader`, `node:fs`, `node:path` | Refactor | Medium | 7.3 |
| run-skill-routing-gates.mjs | Governance | Runs pass/fail gates for skill-routing governance criteria. | `node:child_process`, `node:fs`, `node:path` | Consolidate | Medium | 7.3 |
| check-skill-coverage.mjs | Governance | Checks whether required skills are represented and discoverable. | `skill-profile-loader`, `node:fs`, `node:path` | Consolidate | Medium | 7.3 |
| check-skill-consistency.mjs | Governance | Verifies skill metadata consistency and format integrity. | `node:fs`, `node:path` | Consolidate | Medium | 7.3 |
| check-agents-drift.mjs | Governance | Detects drift between agent declarations and expected structure/policies. | `resolve-root`, `node:fs`, `node:path` | Migrate | High | 7.2 |
| validate-skill-import.mjs | Governance | Validates imported skill descriptors and filesystem contracts. | `node:fs`, `node:path` | Consolidate | Medium | 7.3 |
| validate-models.mjs | Model | Performs model catalog/schema validation and policy checks. | `resolve-root`, `node:fs`, `node:path`, `node:module` | Migrate | Critical | 7.1 |
| validate-config.mjs | Governance | Validates global config schema and mandatory field correctness. | `resolve-root`, `node:path`, `node:module` | Migrate | Critical | 7.1 |
| skills-manage.mjs | Utility | Performs maintenance operations for skill files and indexes. | `node:fs`, `node:path` | Refactor | Medium | 7.3 |
| import-antigravity-skills.mjs | Utility | Imports antigravity skill artifacts into local skill repository. | `yaml-frontmatter-parser`, `node:fs`, `node:path` | Consolidate | Low | 7.4 |
| remove-tier1-from-tier2.mjs | Utility | One-off cleanup utility for obsolete skill-tier layout. | `node:fs`, `node:path` | Deprecate | Low | 7.4 |
| preload-state-persist.mjs | State | Persists preload/skill state overrides for runtime startup behavior. | `node:fs`, `node:path` | Refactor | High | 7.2 |
| check-skill-overlap-governance.mjs | Governance | Detects and governs overlapping/duplicative skill ownership. | `node:fs`, `node:path` | Consolidate | Medium | 7.3 |
| normalize-superpowers-skills.mjs | Utility | Normalizes skill frontmatter/format from superpowers source layout. | `yaml-frontmatter-parser`, `node:fs`, `node:path` | Consolidate | Low | 7.4 |
| meta-super-cycle.mjs | State | Builds/updates meta-cycle state used by higher-order workflow loops. | `node:fs/promises`, `node:path`, `node:os` | Refactor | Medium | 7.3 |
| learning-gate.mjs | Governance | Blocks promotion/deploy when learning quality gates fail. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Migrate | Critical | 7.1 |
| consolidate-skills.mjs | Utility | Consolidates dispersed skill sources into canonical destination. | `yaml-frontmatter-parser`, `node:fs`, `node:path`, `child_process` | Consolidate | Medium | 7.3 |
| migrate-central-config.mjs | Utility | One-time central-config migration utility for legacy layouts. | `node:fs`, `node:path` | Deprecate | Low | 7.4 |
| ci-warning-budget.mjs | Governance | Enforces CI warning budget threshold for quality hygiene. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Migrate | High | 7.2 |
| runtime-skill-tracker.mjs | State | Runtime hook that tracks skill usage for RL and observability. | `module`, `node:path`, `node:url` | Refactor | High | 7.2 |
| synthesize-meta-kb.mjs | State | Synthesizes AGENTS/learning updates into meta knowledge artifacts. | `resolve-root`, `node:fs`, `node:path` | Refactor | Medium | 7.3 |
| validate-config-coherence.mjs | Governance | Validates cross-file coherence after copy/merge/enrichment steps. | `copy-config`, `resolve-root`, `node:fs`, `node:path`, `node:crypto` | Migrate | Critical | 7.1 |
| model-rollback.mjs | Model | Performs model snapshot rollback with safety checks and integrity binding. | `opencode-model-manager`, `resolve-root`, `node:child_process`, `node:crypto` | Migrate | Critical | 7.1 |
| ci-boundary-enforce.mjs | Governance | Enforces repo/package boundary rules in CI. | `node:fs`, `node:path` | Migrate | Critical | 7.1 |
| pr-governance.mjs | Governance | Applies governance policy checks for pull request readiness. | `resolve-root`, `child_process`, `node:fs`, `node:path` | Migrate | Critical | 7.1 |
| generate-mcp-config.mjs | Deployment | Generates merged MCP config from canonical source fragments. | `resolve-root`, `node:fs`, `node:path` | Refactor | Critical | 7.1 |
| protocol-compliance-pass.mjs | Governance | Runs protocol conformance pass against defined operating rules. | `resolve-root`, `node:child_process`, `node:path` | Migrate | Critical | 7.1 |
| bootstrap-runtime.mjs | Deployment | Canonical runtime bootstrap entry for command execution context. | `module` | Refactor | Critical | 7.1 |
| health-check.mjs | Health | Comprehensive health gate with system and dependency checks. | `resolve-root`, `node:child_process`, `node:fs`, `node:path`, `node:os` | Migrate | Critical | 7.1 |
| preflight-versions.mjs | Governance | Verifies Bun/CLI/runtime versions before running critical flows. | `node:child_process` | Migrate | Critical | 7.1 |
| weekly-model-sync.mjs | Model | Performs scheduled model catalog synchronization. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Migrate | High | 7.2 |
| verify-integration.mjs | Health | Executes integration verification workflow across key components. | `child_process`, `node:fs`, `node:path` | Migrate | Critical | 7.1 |
| validate-policies-structure.mjs | Governance | Validates policy file structure and required sections. | `resolve-root`, `node:fs`, `node:path` | Consolidate | High | 7.2 |
| validate-plugin-compatibility.mjs | Governance | Validates plugin compatibility contracts against current stack. | `resolve-root`, `node:fs`, `node:path` | Consolidate | High | 7.2 |
| validate-fallback-consistency.mjs | Governance | Ensures fallback strategy config is internally consistent. | `resolve-root`, `node:fs`, `node:path` | Consolidate | High | 7.2 |
| validate-control-plane-schema.mjs | Governance | Validates control-plane schema for orchestration configuration. | `resolve-root`, `node:fs`, `node:path` | Migrate | High | 7.2 |
| smoke-pipeline.mjs | Health | Executes fresh-machine smoke pipeline from setup to minimal runtime proof. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Migrate | Critical | 7.1 |
| skill-profile-loader.mjs | State | Loads skill profile metadata used by routing/governance checks. | `node:fs`, `node:path` | Refactor | Medium | 7.3 |
| rebuild-q-runtime.mjs | Deployment | Rebuild helper for q-runtime artifacts during local maintenance. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Deprecate | Low | 7.4 |
| opencode-with-dashboard.mjs | Deployment | Convenience launcher that starts OpenCode with dashboard integration. | `resolve-root`, `node:child_process`, `node:path` | Migrate | High | 7.2 |
| link-packages.mjs | Deployment | Links workspace packages/plugins for local development consistency. | `resolve-root`, `node:child_process`, `node:fs`, `node:path` | Migrate | High | 7.2 |
| docs-governance-check.mjs | Governance | Checks docs compliance and governance-sensitive documentation gaps. | `node:child_process`, `node:fs` | Consolidate | Medium | 7.3 |
| docs-gate.mjs | Governance | CI gate that enforces docs requirements before merge/deploy. | `resolve-root`, `child_process`, `node:fs`, `node:path` | Consolidate | Medium | 7.3 |
| deployment-state.mjs | State | Reads/writes deployment lifecycle state used by release automation. | `resolve-root`, `child_process`, `node:fs`, `node:path` | Refactor | Critical | 7.1 |
| commit-governance.mjs | Governance | Enforces governance rules and commit hygiene before acceptance. | `resolve-root`, `child_process`, `node:fs`, `node:path` | Migrate | High | 7.2 |

## 2) Migration Strategy Summary (by Decision Type)

### Migrate
Commands that should exist in the new CLI with largely the same external behavior (possibly thin wrappers over new services).

### Refactor
Scripts that currently encode orchestration/state logic in imperative script form and should move to reusable modules + typed command handlers.

### Consolidate
Overlapping checks/gates that should merge into grouped commands (e.g., `governance validate`, `runtime verify`, `skills audit`) to reduce duplication and operator surface area.

### Deprecate
One-off migration/legacy helpers with low long-term operational value.

## 3) Priority Order

### Critical (Phase 7.1)
`integrity-guard`, `verify-setup`, `verify-bootstrap-prereqs`, `verify-bootstrap-manifest`, `supply-chain-guard`, `setup-resilient`, `runtime-context-compliance`, `env-contract-check`, `check-hardcoded-paths`, `copy-config`, `sync-user-config`, `learning-gate`, `validate-models`, `validate-config`, `validate-config-coherence`, `model-rollback`, `ci-boundary-enforce`, `pr-governance`, `generate-mcp-config`, `protocol-compliance-pass`, `bootstrap-runtime`, `health-check`, `preflight-versions`, `verify-integration`, `smoke-pipeline`, `deployment-state`, `resolve-root`.

### High (Phase 7.2)
`runtime-tool-telemetry`, `api-sanity`, `verify-portability`, `validate-launcher-contract`, `sync-reconcile`, `runtime-tool-surface-proof`, `run-package-smokes`, `repair`, `mcp-mirror-coherence`, `mcp-smoke-harness`, `ingest-sessions`, `fault-injection-tests`, `doctor`, `bootstrap-cache-guard`, `sync-project-learnings`, `check-agents-drift`, `preload-state-persist`, `ci-warning-budget`, `runtime-skill-tracker`, `weekly-model-sync`, `validate-policies-structure`, `validate-plugin-compatibility`, `validate-fallback-consistency`, `validate-control-plane-schema`, `opencode-with-dashboard`, `link-packages`, `commit-governance`, `system-health`.

### Medium (Phase 7.3)
`verify-plugin-readiness`, `verify-plugin-parity`, `verify-no-hidden-exec`, `runtime-workflow-scenarios`, `report-mcp-lifecycle`, `release-portability-verdict`, `mcp-exercise-harness`, `generate-portability-report`, `init-kb`, `install-git-hooks`, `skill-routing-evaluator`, `run-skill-routing-gates`, `check-skill-coverage`, `check-skill-consistency`, `validate-skill-import`, `skills-manage`, `check-skill-overlap-governance`, `meta-super-cycle`, `consolidate-skills`, `synthesize-meta-kb`, `skill-profile-loader`, `docs-governance-check`, `docs-gate`.

### Low (Phase 7.4)
`run-distill-mcp`, `import-antigravity-skills`, `remove-tier1-from-tier2`, `normalize-superpowers-skills`, `migrate-central-config`, `rebuild-q-runtime`.

## 4) Implementation Plan (Phased)

## Phase 7.1 — Critical Scripts (MVP Blockers)

**Goal:** deliver minimum safe operational CLI for setup, health, governance, deployment state, and model rollback.

1. Build shared command runtime (`paths`, process runner, JSON/text output, structured exit codes).
2. Port critical gates and setup flow (`setup`, `verify`, `health`, `governance`, `models rollback`).
3. Replace script-local root/state handling with unified service modules.
4. Add CI parity tests proving old script vs new CLI result equivalence for critical commands.

**Exit criteria:** all Phase 7.1 commands available in new CLI; old scripts callable only as fallback wrappers.

## Phase 7.2 — High Priority Scripts

**Goal:** migrate high-value diagnostics, portability checks, state/telemetry, and integration commands.

1. Introduce grouped command namespaces (`runtime`, `state`, `compat`, `ci`).
2. Refactor telemetry/session ingestion into reusable modules consumed by CLI.
3. Merge related smoke/fault checks into unified test harness entrypoints.
4. Ensure dashboard/developer launch and package-link workflows remain supported.

**Exit criteria:** all high-priority scripts replaced by first-class CLI commands or merged command groups.

## Phase 7.3 — Medium Priority Scripts

**Goal:** collapse fragmented skill/docs/plugin checks into cohesive command surfaces and remove duplication.

1. Consolidate skill-governance scripts under `skills audit` and `skills manage` subcommands.
2. Consolidate runtime report generators under `runtime report`.
3. Move docs and plugin verification into generalized governance validation pipeline.
4. Preserve compatibility via alias commands for one release cycle.

**Exit criteria:** medium scripts either consolidated into stable command groups or retained as thin aliases.

## Phase 7.4 — Low Priority / Deprecated

**Goal:** retire one-off migration utilities and legacy maintenance scripts safely.

1. Mark deprecations in release notes + command help output.
2. Keep temporary compatibility shims for one version window (if needed).
3. Remove scripts after telemetry confirms no active usage.
4. Archive legacy logic in docs/changelog with migration notes.

**Exit criteria:** deprecated scripts removed from primary workflow; no critical path depends on them.

## Recommended Consolidation Targets

- **`governance validate`**: merge `validate-*`, `verify-*` policy/config checks.
- **`runtime verify`**: merge tool surface/context/workflow runtime checks.
- **`skills audit`**: merge coverage/consistency/overlap/routing gate checks.
- **`health run`**: merge smoke, API sanity, health/system-health, fault injection entrypoints.
- **`state sync`**: merge reconcile, user-config sync, learnings/session ingestion flows.

## Risk Notes

- `resolve-root.mjs` is a high-fanout dependency and should be migrated first as a shared CLI library primitive.
- Governance gates (`learning-gate`, `ci-boundary-enforce`, `pr-governance`) must preserve exact fail semantics to avoid CI regressions.
- `model-rollback.mjs` requires strict parity checks due to integrity and rollback safety guarantees.
