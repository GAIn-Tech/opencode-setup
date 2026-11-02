# Ecosystem Skill Package Audit — Learnings

## 2026-03-24 — Wave 1 Task 1 Baseline Capture

- Captured skill surface baseline: **107 registered** skills, **39 enabled/default** skills, **29 registered categories**, **15 enabled categories**.
- Captured package surface baseline: **36 workspace packages**, **10 CLI-entrypoint packages**, **3 MCP-wrapper packages**, **2 dormant package surfaces**.
- Captured governance baseline: **6 routing/governance gates**, latest full-report run passed all gates.
- Captured docs drift baseline: `packages/README.md` headings cover **8/36** packages, leaving **28 undocumented workspace packages**.
- Captured manifest assumption baseline: `.sisyphus/skill-manifest.json` is **54/54 must-have (100%)**, including user-flagged candidates (`rust-development`, `go-development`, `laravel-development`, `c4-architecture`, `django-development`, `gtm-strategy`).
- Defined explicit improvement metrics for:
  - default-surface reduction,
  - docs drift reduction,
  - false-activation control,
  - governance-assumption reduction.

### Evidence

- `.sisyphus/evidence/ecosystem-baseline-summary.json`
- `.sisyphus/evidence/ecosystem-baseline-skills.json`
- `.sisyphus/evidence/ecosystem-baseline-packages.json`
- `.sisyphus/evidence/ecosystem-baseline-governance.json`
- `.sisyphus/evidence/ecosystem-baseline-manifest-assumptions.json`
- `.sisyphus/evidence/ecosystem-baseline-metrics.json`
- `.sisyphus/evidence/ecosystem-baseline-routing-gates/`

## 2026-03-24 — Wave 2 Task 3 Skill Classification (107 skills)

- Produced full-tier recommendation artifact for all **107 registered skills**: `.sisyphus/evidence/skill-classification-recommendations.json`.
- Applied taxonomy evidence model from Task 2 (`minimumEvidenceFieldsForTask3`) and scored skill families on:
  - scenario frequency,
  - impact,
  - overlap,
  - misroute risk,
  - maintenance cost,
  - substitutability.
- Proposed tier distribution:
  - **default: 9** (core planning/audit/debug loop only),
  - **manual: 83** (secondary/specialist overlays),
  - **dormant: 5** (fallback/low-frequency utilities),
  - **candidate-prune: 10** (runtime-internal wrappers with low scenario fit + high redundancy).
- Explicitly evaluated user-cited low-priority skills and kept all **manual** (not default-first-class):
  - `rust-development`,
  - `go-development`,
  - `laravel-development`,
  - `c4-architecture`,
  - `django-development`,
  - `gtm-strategy`.
- Dependency-chain note: default skills have minimal hard dependencies, but implicit flow dependencies still exist (e.g., `task-orchestrator -> executing-plans/subagent-driven-development`, `verification-before-completion -> browser/quality specialists`). These are documented as manual-gated chains to avoid false activation.

### Evidence

- `.sisyphus/evidence/skill-classification-recommendations.json`

## 2026-03-25 — Wave 4 Task 9 Migration Validation

- Validated migration safety, rollback paths, and default-path behavior.
- Governance suite passes: `bun scripts/run-skill-routing-gates.mjs` (6/6 gates).
- All Bun tests pass: `bun test` (integration tests, critical plugin contracts, dashboard write guard, orchestration atomic write, skillrl API regression, skillrl showboat e2e).
- Rollback instructions validated via dry-run review of control-plane commands (`scripts/skills-manage.mjs` enable/disable/list/audit/sync --dry-run).
- Default-path fixtures validated: planning/audit/debug core scenarios succeed with only default capabilities (9 default skills).
- Negative leakage checks validated: manual/dormant capabilities do not leak into default routing.
- Default core metrics: allowlist size 9, leakage breaches 0, enforced true.
- Rollback validation executed for all tier transitions (default→manual, manual→dormant, dormant→candidate-prune, candidate-prune→manual reactivation).

### Evidence

- `.sisyphus/evidence/migration-validation-summary.json`
- `opencode-config/skills/registry.json`
- `opencode-config/compound-engineering.json`
- `.sisyphus/skill-manifest.json`
- `.sisyphus/evidence/scenario-taxonomy-model.json`
- `.sisyphus/evidence/ecosystem-baseline-summary.json`
- `bun scripts/check-skill-coverage.mjs` (88/88 implied coverage)
- `bun test scripts/tests/skill-implied-full-coverage.test.mjs` (pass)

## 2026-03-24 — Wave 2 Task 4 Package Surface Classification + Skill↔Package Cohesion

- Produced package-surface classification artifact for all **36 workspace packages**: `.sisyphus/evidence/package-surface-classification.json`.
- Classified package roles using CLI/MCP surface policy + dormant policy overrides:
  - **CLI-first: 7**
  - **MCP-first: 2**
  - **Hybrid: 1**
  - **Library-only: 26**
  - **Out-of-scope: 0**
- Built skill↔package cohesion edge map for package-like skills (**15 mapped edges**) and validated default-loop coherence:
  - recommended default tier skills remain **package-unbound** (no default skill points at a package-specialist surface), preserving planning -> audit -> debug spine.
- Identified explicit orphaning/drift signals:
  - **orphan skills** (no workspace package surface): `agent-browser`, `token-reporter`, `beads`
  - **orphan package surfaces** (exposed but not skill-routable): `opencode-dashboard-launcher`, `opencode-fallback-doctor`, `opencode-plugin-healthd`
  - **docs drift**: `packages/README.md` still covers only **8/36** packages (28 missing)
  - **routing/discoverability drift**: `compound-engineering.json` keeps **39 always-enabled skills** while tier model recommends **9 default** (30 enabled skills are non-default by recommendation)
- Captured weak cohesion hotspots for future staged transitions (not changed in this task):
  - `showboat-wrapper` skill -> library-only package with no wrapper,
  - deprecated/orphaned package surfaces (`opencode-eval-harness`, `opencode-graphdb-bridge`, `opencode-model-benchmark`) still represented in candidate-prune skill tier.

### Evidence

- `.sisyphus/evidence/package-surface-classification.json`
- `docs/architecture/cli-mcp-surface-policy.md`
- `opencode-config/mcp-dormant-policy.json`
- `setup-instructions.md`
- `packages/README.md`
- `.sisyphus/evidence/ecosystem-baseline-packages.json`
- `.sisyphus/evidence/scenario-taxonomy-model.json`
- `.sisyphus/evidence/skill-classification-recommendations.json`

## 2026-03-25 — Wave 2 Task 6 Governance + Routing Updates for Narrow Default Core

- Replaced breadth-biased governance assumptions with **tier-aware default-core enforcement** tied to `.sisyphus/evidence/skill-classification-recommendations.json`.
- Updated routing evaluator built-ins to a narrow default fixture set aligned to planning -> audit -> debug spine + approved core capabilities:
  - `writing-plans`, `codebase-auditor`, `systematic-debugging`, `test-driven-development`, `verification-before-completion`, `git-master`, `context7`, `task-orchestrator`, `using-superpowers`.
- Coverage gate now validates implied evidence for **default tier only** (no longer requires all on-disk skills to be default-ranked candidates).
- Added explicit governance failures for:
  - **untiered on-disk skills**,
  - **duplicate tier assignments** in classification evidence,
  - **default fixture leakage** into manual/dormant/candidate-prune/untiered top-skill selections.
- Added alias-aware tier resolution for `superpowers/*` disk skill IDs to prevent false untiered violations.
- Verification outcomes after updates:
  - `bun test scripts/tests/check-skill-coverage.test.mjs` ✅
  - `bun test scripts/tests/skill-implied-full-coverage.test.mjs` ✅
  - `bun scripts/skill-routing-evaluator.mjs --tier-evidence .sisyphus/evidence/skill-classification-recommendations.json` ✅
  - `bun scripts/run-skill-routing-gates.mjs` ✅

### Evidence

- `.sisyphus/evidence/governance-routing-updates.json`
- `scripts/run-skill-routing-gates.mjs`
- `scripts/check-skill-consistency.mjs`
- `scripts/check-skill-coverage.mjs`
- `scripts/skill-routing-evaluator.mjs`
- `scripts/tests/skill-implied-full-coverage.test.mjs`
- `scripts/tests/check-skill-coverage.test.mjs`

## 2026-03-25 — Wave 2 Task 6 (Execution Pass): Governance Assumptions Verified for Narrow Default Core

- Re-validated governance behavior against Task 2 taxonomy + Task 3 tier recommendations without widening default expectations.
- Confirmed governance posture is **tier-aware** and no longer assumes all on-disk skills need default implied-routing evidence.
- Confirmed failure semantics remain strict (not weakened):
  - untiered on-disk skills fail coverage/consistency gates,
  - duplicate tier assignments fail evaluator/consistency checks,
  - default-core fixture leakage to manual/dormant/candidate-prune/untiered fails evaluator.
- Added canonical execution artifact for this task: `.sisyphus/evidence/governance-update-summary.json`.
- Required verification commands both passed:
  - `bun test scripts/tests/skill-implied-full-coverage.test.mjs`
  - `bun scripts/run-skill-routing-gates.mjs`

### Evidence

- `.sisyphus/evidence/governance-update-summary.json`
- `.sisyphus/evidence/skill-classification-recommendations.json`
- `.sisyphus/evidence/scenario-taxonomy-model.json`
- `scripts/run-skill-routing-gates.mjs`
- `scripts/check-skill-coverage.mjs`
- `scripts/skill-routing-evaluator.mjs`
- `scripts/check-skill-consistency.mjs`

## 2026-03-25 — Wave 2 Task 8: Documentation + Taxonomy Drift Repair

- Replaced stale package-only plugin narrative in `packages/README.md` with canonical workspace inventory covering **all 36 workspace packages**.
- Added explicit package surface-role summary aligned to Task 4 classification evidence:
  - **CLI-first: 7**
  - **MCP-first: 2**
  - **Hybrid: 1**
  - **Library-only: 26**
- Added canonical tier-model narrative doc: `docs/architecture/ecosystem-tier-model.md`.
  - Consolidates scenario taxonomy (planning-core, audit-core, debug-core + secondary overlays).
  - Consolidates tier semantics (`default`, `manual`, `dormant`, `candidate-prune`) and transition policy.
  - Explicitly documents why non-default tiers are intentional governance posture, not missing capability.
  - Includes a dedicated **deferred future-work** section for CLI-vs-MCP expansion (kept out of current migration scope).
- Created execution artifact `.sisyphus/evidence/documentation-drift-fix-summary.json` to capture scope, inputs, source-of-truth posture, and deferrals.
- Noted unavailable draft source at execution time: `.sisyphus/drafts/ecosystem-audit-cohesion.md` (not present in repository).

### Evidence

- `packages/README.md`
- `docs/architecture/ecosystem-tier-model.md`
- `.sisyphus/evidence/documentation-drift-fix-summary.json`
- `.sisyphus/evidence/scenario-taxonomy-model.json`
- `.sisyphus/evidence/skill-classification-recommendations.json`
- `.sisyphus/evidence/package-surface-classification.json`
- `docs/architecture/cli-mcp-surface-policy.md`

## 2026-03-25 — Wave 2 Task 9: Migration Safety + Rollback + Default-Path Validation

- Executed full governance gate suite with full-report mode and confirmed **6/6 passing gates**:
  - `bun scripts/run-skill-routing-gates.mjs --full-report` ✅
- Executed test verification including full suite and focused routing coverage regression:
  - `bun test` ✅
  - `bun test scripts/tests/skill-implied-full-coverage.test.mjs` ✅ (2 pass / 0 fail)
- Executed applicable build verification at the dashboard package level:
  - `bun run build` (in `packages/opencode-dashboard`) ✅
  - Build completed with non-blocking module-resolution warnings; compilation and page generation succeeded.
- Re-ran default-path routing fixture with tier evidence and confirmed planning/audit/debug default spine integrity:
  - `bun scripts/skill-routing-evaluator.mjs --tier-evidence .sisyphus/evidence/skill-classification-recommendations.json` ✅
  - Result: `pass=true`, `defaultCore.leakageBreaches=[]`, one-pass correctness `1.0`.
- Re-ran default-tier implied coverage check and confirmed governance assumptions hold:
  - `bun scripts/check-skill-coverage.mjs --tier-evidence .sisyphus/evidence/skill-classification-recommendations.json` ✅
  - Result: default covered `8/8`, missing `0`, untiered on-disk `0`.
- Ran explicit negative leakage fixture (planning/audit/debug tasks with specialist-overlay phrasing under `enforceDefaultCore=true`) and confirmed **no manual/dormant leakage**:
  - Result: breach count `0`, mismatch count `0`, top skills remained default (`writing-plans`, `codebase-auditor`, `systematic-debugging`).
- Validated rollback command paths in dry-run mode for tier changes and dormant/manual transitions using `scripts/skills-manage.mjs`:
  - baseline control-plane checks: `list --all`, `audit`, `sync --dry-run` executed;
  - transition command-path checks executed for `default<->manual`, `manual<->dormant`, and candidate-prune safety posture;
  - all validations were non-destructive dry-runs (no state mutation).
- Operational guardrail reaffirmed: `sync --dry-run` showed a large potential enable set, reinforcing policy that sync write-path remains excluded from routine governance.

### Evidence

- `.sisyphus/evidence/migration-validation-summary.json`
- `.sisyphus/evidence/migration-semantics-policy.json`
- `.sisyphus/evidence/control-plane-lifecycle-policy.json`
- `.sisyphus/evidence/governance-update-summary.json`
- `scripts/run-skill-routing-gates.mjs`
- `scripts/skill-routing-evaluator.mjs`
- `scripts/check-skill-coverage.mjs`
- `scripts/check-skill-consistency.mjs`
- `scripts/tests/skill-implied-full-coverage.test.mjs`

## 2026-03-25 — Wave 2 Task 9 (Revalidation Pass): Safety, Rollback Paths, and Leakage Controls Reconfirmed

- Revalidated migration safety posture against current policy artifacts:
  - `.sisyphus/evidence/migration-semantics-policy.json`
  - `.sisyphus/evidence/control-plane-lifecycle-policy.json`
  - `.sisyphus/evidence/governance-update-summary.json`
- Executed rollback command-path checks in dry-run mode across tier transitions (`default<->manual`, `manual<->dormant`, candidate-prune safety/exception viability) using `scripts/skills-manage.mjs`; no state mutations performed.
- Confirmed default-path fixture integrity remains intact:
  - `bun scripts/skill-routing-evaluator.mjs --tier-evidence .sisyphus/evidence/skill-classification-recommendations.json` ✅
  - Result: `pass=true`, `onePassCorrectness=1.0`, `defaultCore.leakageBreaches=[]`.
- Ran explicit negative leakage fixture with specialist-overlay phrasing under enforced default-core behavior and confirmed no non-default routing leaks:
  - inline `bun -e` fixture evaluation ✅
  - Result: `breachCount=0`, `mismatchCount=0`, top skills remained default (`writing-plans`, `codebase-auditor`, `systematic-debugging`).
- Ran required verification commands and confirmed both pass:
  - `bun test` ✅
  - `bun scripts/run-skill-routing-gates.mjs` ✅ (`6/6` gates passed).

### Evidence

- `.sisyphus/evidence/migration-validation-summary.json`
- `.sisyphus/evidence/migration-semantics-policy.json`
- `.sisyphus/evidence/control-plane-lifecycle-policy.json`
- `.sisyphus/evidence/governance-update-summary.json`
- `scripts/skills-manage.mjs`
- `scripts/skill-routing-evaluator.mjs`
- `scripts/run-skill-routing-gates.mjs`

## 2026-03-25 — Wave 2 Task 10: Final Ecosystem Report + Deferred MCP-vs-CLI Appendix

- Produced final closure artifact: `.sisyphus/evidence/ecosystem-final-report.md`.
- Consolidated canonical tier posture for execution/review:
  - **default: 9** (`codebase-auditor`, `context7`, `git-master`, `systematic-debugging`, `task-orchestrator`, `test-driven-development`, `using-superpowers`, `verification-before-completion`, `writing-plans`)
  - **manual: 83** (specialist/manual-first overlays retained)
  - **dormant: 5**
  - **candidate-prune: 10** (explicitly non-destructive recommendation state)
- Captured verified before/after metrics and routing quality deltas from baseline to validated posture:
  - default-surface skill count: **39 -> 9**
  - routing ambiguity rate: **0.077 -> 0.000**
  - one-pass routing correctness: **0.923 -> 1.000**
  - default-core leakage breaches (validated fixture): **0**
- Recorded accepted residual risks without hiding unresolved items:
  - enabled-surface drift (`enabledCount=39` vs recommended default `9`),
  - orphan skills and orphan package surfaces,
  - weak dormant/candidate-prune cohesion entries,
  - sync write-path re-inflation risk,
  - lifecycle metadata completeness risk.
- Added a bounded future-work appendix that explicitly isolates deferred MCP-vs-CLI topics from executed scope (no transport expansion enacted in this task).

### Evidence

- `.sisyphus/evidence/ecosystem-final-report.md`
- `.sisyphus/evidence/ecosystem-baseline-summary.json`
- `.sisyphus/evidence/skill-classification-recommendations.json`
- `.sisyphus/evidence/package-surface-classification.json`
- `.sisyphus/evidence/scenario-taxonomy-model.json`
- `.sisyphus/evidence/governance-update-summary.json`
- `.sisyphus/evidence/migration-validation-summary.json`
- `.sisyphus/evidence/migration-semantics-policy.json`
- `.sisyphus/evidence/control-plane-lifecycle-policy.json`
- `docs/architecture/ecosystem-tier-model.md`
