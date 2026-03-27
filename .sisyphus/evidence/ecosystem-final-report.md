# Ecosystem Final Report (Wave 2 — Task 10)

**Date:** 2026-03-25  
**Status:** Finalized from prior task evidence (Tasks 1-9)  
**Primary Objective:** Close the ecosystem skill/package audit with a review-ready summary, explicit tier posture, verified before/after metrics, accepted risks, and bounded future work.

---

## 1) Evidence Inputs Used

- `.sisyphus/evidence/ecosystem-baseline-summary.json`
- `.sisyphus/evidence/skill-classification-recommendations.json`
- `.sisyphus/evidence/package-surface-classification.json`
- `.sisyphus/evidence/scenario-taxonomy-model.json`
- `.sisyphus/evidence/migration-validation-summary.json`
- `.sisyphus/evidence/governance-update-summary.json`
- `.sisyphus/evidence/control-plane-lifecycle-policy.json`
- `.sisyphus/evidence/migration-semantics-policy.json`
- `docs/architecture/ecosystem-tier-model.md`

---

## 2) Final Tier Outcome (Canonical Summary)

### 2.1 New default core (9)

The default core is intentionally narrow and aligned to the planning -> audit -> debug spine:

1. `codebase-auditor`
2. `context7`
3. `git-master`
4. `systematic-debugging`
5. `task-orchestrator`
6. `test-driven-development`
7. `using-superpowers`
8. `verification-before-completion`
9. `writing-plans`

### 2.2 Manual tier (83)

Manual tier remains broad by design (specialist overlays and explicit-intent paths) and includes:

- browser + accessibility specialists,
- architecture and systems-design specialists,
- security/devops/data/framework domain specialists,
- workflow/orchestration and quality specialists,
- explicit user-flagged skills retained as **manual** (`rust-development`, `go-development`, `laravel-development`, `c4-architecture`, `django-development`, `gtm-strategy`).

Authoritative full roster: `.sisyphus/evidence/skill-classification-recommendations.json#tierRecommendations.manual`.

### 2.3 Dormant tier (5)

- `agent-browser`
- `memory-graph`
- `proofcheck`
- `showboat-wrapper`
- `token-reporter`

### 2.4 Candidate-prune set (10)

- `codebase-memory`
- `eval-harness`
- `graphdb-bridge`
- `integration-layer`
- `learning-engine`
- `model-benchmark`
- `model-router-x`
- `plugin-preload-skills`
- `skill-rl-manager`
- `tool-usage-tracker`

**Important semantic guardrail:** candidate-prune is a recommendation/lifecycle state, **not** immediate deletion.

---

## 3) Before/After Metrics (Verified)

| Metric | Baseline (Task 1) | Final State (Tasks 3/6/9) | Delta | Evidence |
|---|---:|---:|---:|---|
| Registered skills | 107 | 107 | 0 | Baseline summary + skill tier summary |
| Default-surface skill count | 39 enabled/default | 9 default-core allowlist | -30 (**-76.9%**) | Baseline summary; skill tier summary; governance update summary |
| Manual tier size | N/A (not tiered) | 83 | N/A | Skill tier summary |
| Dormant tier size | N/A (not tiered) | 5 | N/A | Skill tier summary |
| Candidate-prune tier size | N/A (not tiered) | 10 | N/A | Skill tier summary |
| Routing ambiguity rate | 0.077 | 0.000 (default-path fixture) | -0.077 | Baseline verification; migration validation summary |
| One-pass routing correctness | 0.923 | 1.000 | +0.077 | Baseline verification; migration validation summary |
| Default-core leakage breaches | Not enforced in baseline fixture model | 0 | N/A -> 0 | Migration validation summary |
| Governance gate status | pass (baseline gate run) | pass (6/6 gates) | Stable pass | Baseline summary; governance + migration validation summaries |
| Package surface posture | 10 CLI-entrypoint packages, 3 MCP-wrapper packages (raw transport counts) | 7 CLI-first, 2 MCP-first, 1 hybrid, 26 library-only (policy role model) | Reframed to canonical role model | Baseline summary; package surface classification |

### 3.1 Interpretation notes

- Default-core narrowing is evidence-backed and validated under enforced default-core fixtures.
- Surface-role counts are now policy-interpretable (CLI-first/MCP-first/hybrid/library-only), not only raw transport totals.
- Governance remains green while tier semantics and leakage controls are tightened.

---

## 4) Executed Scope vs Deferred Scope

### 4.1 Executed in this audit wave

- Baseline ecosystem inventory and metrics model.
- Scenario taxonomy and four-tier model.
- Full 107-skill tier recommendations.
- Full 36-package surface classification and skill<->package cohesion map.
- Migration semantics policy + lifecycle/control-plane governance policy.
- Canonical tier documentation update.
- Migration safety, rollback-path, and default-path validation.

### 4.2 Explicitly NOT executed (deferred)

- Expanding CLI/MCP wrappers for additional library-only packages.
- Promoting package-only command surfaces into new skill namespaces.
- Reopening broad MCP-vs-CLI transport strategy debates.

Deferred items are isolated in **Appendix A** and must not be conflated with this wave’s completed scope.

---

## 5) Remaining Risks (Accepted) and Ownership Expectations

| Risk ID | Risk | Current Evidence | Expected Owner Action |
|---|---|---|---|
| R1 | Discoverability/routing drift: always-enabled set remains wider than narrow default recommendation. | `enabledCount=39` vs `recommendedDefaultCount=9` in package-surface classification drift section. | Runtime governance owner should keep default-core enforcement active and schedule controlled enabled-surface convergence work. |
| R2 | Orphan skill/package surfaces reduce clarity and onboarding discoverability. | Orphan skills: `agent-browser`, `token-reporter`, `beads`; orphan package surfaces: `opencode-dashboard-launcher`, `opencode-fallback-doctor`, `opencode-plugin-healthd`. | Assign owner decisions: create explicit skill routing entries or document package-only permanence. |
| R3 | Weak cohesion in select dormant/candidate-prune links may cause stale inventory drag. | `showboat-wrapper` weak cohesion; deprecated candidate-prune-linked packages noted in package classification. | Lifecycle owner should review in cadence windows and either re-justify dormancy or advance prune workflow proposal. |
| R4 | Control-plane misuse risk: sync write-path can re-inflate enabled surface quickly. | Migration validation dry-run: sync reported large potential enable set; lifecycle policy excludes sync write-path from routine governance. | Enforce `sync --dry-run` only in governance operations; block write-path without explicit change ticket + evidence. |
| R5 | Tier metadata incompleteness would break lifecycle governance quality. | Lifecycle policy requires `tier`, `owner`, `rationale`, `review_date_utc`, `promotion_evidence_refs` for admission/transition approval. | Governance owner must reject untiered/metadata-incomplete transitions and maintain review-date freshness by tier cadence. |

### Ownership contract (must hold for ongoing operations)

From lifecycle policy, each governed skill transition must include at minimum:

- `owner`
- `rationale`
- `review_date_utc`
- `promotion_evidence_refs` (non-empty for upward transitions)

Tier review cadence expectation:

- default: 30 days
- manual: 45 days
- dormant: 30 days
- candidate-prune: 21 days

---

## 6) Review Checklist (Execution/Review Friendly)

Use this checklist before approving follow-on changes:

1. Confirm tier recommendations artifact still resolves to 9/83/5/10 (default/manual/dormant/candidate-prune).
2. Confirm governance gate status remains pass (`bun scripts/run-skill-routing-gates.mjs`).
3. Confirm default-path fixture still reports zero leakage breaches.
4. Confirm any tier transition record contains required owner/metadata fields.
5. Confirm deferred MCP-vs-CLI topics are tracked as future work (not silently executed).

---

## Appendix A — Deferred Future Work (Bounded): MCP-vs-CLI Analysis

### A.1 Deferred topic boundary

This appendix covers only the deferred question: **whether/how to expand MCP vs CLI surfaces beyond current policy posture**.

It does **not** reopen or invalidate current tier decisions, migration semantics, or governance enforcement already implemented.

### A.2 Deferred items (explicit)

1. Evaluate adding wrappers for selected library-only packages.
2. Evaluate promoting package-only command surfaces into skill-routable namespaces.
3. Revisit transport strategy only through policy criteria and measurable outcomes (not ad-hoc debate).

### A.3 Entry criteria for future execution

Future MCP-vs-CLI work should start only when all are true:

- At least one full governance cycle confirms stable narrow-default behavior.
- Discoverability and orphan-surface pain is evidenced in real operator workflows.
- Proposed expansions include rollback paths and tier-impact analysis.

### A.4 Required future deliverables (when executed)

- A scoped decision matrix per candidate surface (CLI-first/MCP-first/hybrid/library-only).
- Evidence of scenario fit and tier impact (default/manual/dormant/candidate-prune).
- Non-destructive migration + rollback plan per surface.
- Governance acceptance criteria and leakage safeguards for any newly exposed route.

### A.5 Out-of-scope reminder

No MCP-vs-CLI expansion decisions are enacted by this report.

This report closes the current ecosystem audit wave and preserves transport expansion as bounded follow-up work.
