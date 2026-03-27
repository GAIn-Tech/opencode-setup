# Ecosystem Skill and Package Cohesion Refactor Plan

> **Status**: COMPLETED (reconciled 2026-03-26)
> **Reconciliation Note**: Checklist boxes in this planning artifact are stale. Completion is evidenced by `.sisyphus/boulder.json` (`ecosystem-skill-package-audit` in `completed_plans`) and audit artifacts under `.sisyphus/evidence/` including `ecosystem-final-report.md`, `governance-update-summary.json`, and `migration-validation-summary.json`.

## TL;DR

> **Quick Summary**: Refactor the repo’s skill/package ecosystem from a breadth-first, drift-prone default surface into a tiered, scenario-based system optimized for planning, audit, and debug workflows.
>
> **Deliverables**:
> - Canonical tier model for skills and packages
> - Scenario taxonomy and scoring rubric for default-worthiness
> - Governance/routing changes that constrain default activation to the new core
> - Cohesion map aligning skills, packages, docs, and control-plane scripts
> - Migration, rollback, and drift-prevention policy
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Baseline inventory → Tier/scenario model → Governance/routing enforcement → Validation + docs coherence

---

## Context

### Original Request
Audit the repository’s skill and package ecosystem so the default system contains only uniquely valuable, non-redundant, relevant capabilities; demote irrelevant/domain-specific/business-oriented items from the default path; and make the ecosystem more cohesive, scenario-mapped, dynamic, and adaptive.

### Interview Summary
**Key Discussions**:
- User explicitly does not want several domain/business/framework skills to remain first-class by default right now, including `rust-development`, `go-development`, `laravel-development`, `c4-architecture`, `django-development`, and `gtm-strategy`.
- Low-value or non-core capabilities should generally be **demoted to manual** rather than removed.
- The target end-state should be **tiered + scenario-based**.
- The default runtime path should optimize for **planning + audit + debug** scenarios.
- MCP-vs-CLI architecture is important but deferred as a **future expansion**, not part of the main execution scope of this plan.

**Research Findings**:
- `opencode-config/compound-engineering.json` currently enables a broad default set containing workflow, debugging, browser, research, meta, reasoning, and review skills.
- `.sisyphus/skill-manifest.json` still marks 54 imported skills across many domains as `must-have`, which conflicts with the desired narrower default path.
- `scripts/tests/skill-implied-full-coverage.test.mjs` and `scripts/run-skill-routing-gates.mjs` encode governance assumptions favoring broad on-disk coverage rather than a tightly curated default core.
- `scripts/skills-manage.mjs` already provides a control plane for enable/disable/audit/sync, making tier-aware evolution feasible without inventing an entirely new management layer.
- `packages/README.md` is stale relative to the actual workspace, showing package taxonomy/documentation drift.
- `docs/architecture/cli-mcp-surface-policy.md` and `opencode-config/mcp-dormant-policy.json` prove the repo already supports nuanced dormancy/default exposure decisions.

### Metis Review
**Identified Gaps** (addressed in this plan):
- Missing explicit tier contract → resolved with `default`, `manual`, `dormant`, `candidate-prune` model.
- Missing measurable acceptance criteria → resolved with baseline reduction, routing constraints, governance gates, and rollback validation.
- Missing edge-case handling → resolved with dependency-chain, dormant-critical, plugin divergence, and learning-loop safeguards.
- Missing guardrails against scope creep → resolved by excluding CLI-vs-MCP implementation, mass skill rewrites, package code refactors, and model-router redesign.

---

## Work Objectives

### Core Objective
Redesign the repo’s skill/package selection architecture so that the default runtime surface is intentionally small, scenario-driven, and governance-backed, while preserving reversible access to specialized capabilities through manual or dormant tiers.

### Concrete Deliverables
- A canonical capability tier model spanning skills and package surfaces.
- A scenario taxonomy anchored on planning, audit, and debug workflows.
- A scoring/rubric system for default-worthiness and demotion recommendations.
- Updated routing/governance expectations so default activation is allowlist-driven.
- Updated ecosystem documentation reflecting actual package and skill structure.
- A migration + rollback strategy for adopting the new model safely.

### Definition of Done
- [ ] Every governed skill/package is assigned a tier, rationale, owner, and review cadence.
- [ ] Default routing is constrained to the approved planning/audit/debug core.
- [ ] Governance/tests no longer assume “all on-disk equals default-routable”.
- [ ] Documentation reflects actual workspace/package/skill reality.
- [ ] Migration phases have rollback instructions and validation evidence.

### Must Have
- Reversible demotion-first strategy.
- Scenario-based default core rather than flat global breadth.
- Explicit governance hooks to prevent re-bloat.
- Cohesion across registry, enabled set, manifest assumptions, routing tests, and docs.

### Must NOT Have (Guardrails)
- No full architecture rewrite of unrelated runtime systems.
- No package code refactors beyond what is required for taxonomy/governance alignment.
- No blanket deletion campaign for low-value capabilities.
- No MCP-vs-CLI implementation work in this execution plan.
- No broad model-router redesign.
- No mass rewrite of every SKILL.md unless directly required by tiering/routing correctness.

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> All verification in this plan must be executed by the agent through repo reads, commands, governance scripts, and captured outputs.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: Bun tests + governance scripts + repo validation scripts

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| Config/governance | Bash | Run validation scripts, compare JSON state, inspect exit codes |
| Docs/taxonomy | Read + Bash | Read artifacts, compare against file system reality |
| Routing/tests | Bash | Execute Bun tests and routing gates |
| Repo inventory | Read/Glob/Bash | Enumerate files and compare documented vs actual surfaces |

**Global Scenarios**

Scenario: Baseline ecosystem inventory captured
  Tool: Bash + Read
  Preconditions: Repository available locally
  Steps:
    1. Run inventory commands/scripts that enumerate registered skills, enabled skills, package manifests, and package surface artifacts.
    2. Capture baseline counts for default-enabled skills, registered skills, workspace packages, dormant package surfaces, and major governance checks.
    3. Save evidence into `.sisyphus/evidence/ecosystem-baseline-*` artifacts.
  Expected Result: A reproducible baseline exists for before/after comparison.
  Failure Indicators: Missing counts, inconsistent totals, or inability to reconcile registry/enabled/package inventory.
  Evidence: `.sisyphus/evidence/ecosystem-baseline-summary.json`

Scenario: Final governance stack passes after migration
  Tool: Bash
  Preconditions: Tiering/routing/doc updates implemented
  Steps:
    1. Run skill/routing governance scripts and related Bun tests.
    2. Run any new or updated tier-validation checks.
    3. Assert all commands exit 0.
    4. Capture outputs to `.sisyphus/evidence/final-governance-pass.log`.
  Expected Result: Updated governance reflects the new tier model without regressions.
  Failure Indicators: Non-zero exits, stale assumptions about on-disk breadth, missing tier metadata, or docs drift checks failing.
  Evidence: `.sisyphus/evidence/final-governance-pass.log`

Scenario: Negative check — demoted/manual capabilities do not leak into default routing
  Tool: Bash
  Preconditions: At least one skill and one package surface have been demoted/manualized
  Steps:
    1. Execute scenario fixtures representing default planning/audit/debug prompts.
    2. Assert default routing results do not include demoted/manual-only capabilities unless explicitly requested.
    3. Capture ranked results and any false activations.
  Expected Result: Manual/dormant capabilities stay out of default flows.
  Failure Indicators: False activation above threshold or manual skills appearing in default top-ranked paths.
  Evidence: `.sisyphus/evidence/default-routing-leak-check.json`

---

## Execution Strategy

### Parallel Execution Waves

```text
Wave 1 (Start Immediately)
├── Task 1: Establish baseline inventory and decision rubric
└── Task 2: Build scenario taxonomy and capability tier model

Wave 2 (After Wave 1)
├── Task 3: Classify skills by tier and default-worthiness
├── Task 4: Classify packages/surfaces and cohesion ownership
└── Task 5: Define migration rules for manual/dormant/prune states

Wave 3 (After Wave 2)
├── Task 6: Update governance and routing assumptions
├── Task 7: Update control-plane and lifecycle policies
└── Task 8: Repair documentation and taxonomy drift

Wave 4 (After Wave 3)
├── Task 9: Run migration validation and rollback proof
└── Task 10: Finalize executive summary and future-work appendix
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 4, 5 | 2 |
| 2 | None | 3, 4, 5 | 1 |
| 3 | 1, 2 | 6, 7, 8 | 4, 5 |
| 4 | 1, 2 | 6, 8 | 3, 5 |
| 5 | 1, 2 | 6, 7, 9 | 3, 4 |
| 6 | 3, 4, 5 | 9 | 7, 8 |
| 7 | 3, 5 | 9 | 6, 8 |
| 8 | 3, 4 | 10 | 6, 7 |
| 9 | 6, 7 | 10 | None |
| 10 | 8, 9 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2 | deep / architecture-heavy planners with audit + writing-plan support |
| 2 | 3, 4, 5 | deep analyzers for classification, package/skill cohesion, governance design |
| 3 | 6, 7, 8 | implementation planners focused on scripts/config/docs coherence |
| 4 | 9, 10 | verification-first planner for validation, rollback proof, final synthesis |

---

## Decision Rubric + Migration Gates

### Capability Scoring Dimensions
Score each skill/package on a defined rubric (for example 1-5 per dimension):
- **Scenario Frequency**: how often it matters in planning/audit/debug default flows
- **Impact**: how much value it adds when selected
- **Selection Reliability**: how safely it can be auto-selected without misrouting
- **Misroute Risk**: risk of distracting the runtime from the right path
- **Maintenance Cost**: governance/docs/test burden to keep it active
- **Substitutability**: whether another skill/package already covers the same need
- **Operational Criticality**: rare-but-important recovery/security/incident value

### Tier Model
- **default**: eligible for default routing in planning/audit/debug core scenarios
- **manual**: available only when explicitly requested or via targeted profile
- **dormant**: intentionally parked with documented reactivation criteria
- **candidate-prune**: likely removable, but retained until migration/rollback review completes

### Hard Gates
- No skill/package enters `default` without rubric score, owner, rationale, and review date.
- No new skill/package is added during this refactor without immediate tier assignment.
- No demotion is final unless rollback/re-enable instructions exist.
- No docs update is complete unless inventory matches actual workspace/registry state.
- No governance update is complete unless default-flow scenario tests prove manual/dormant isolation.

### Migration Phases
1. **Inventory**
2. **Score + provisional tiering**
3. **Scenario validation against planning/audit/debug core**
4. **Governance/control-plane alignment**
5. **Docs and lifecycle policy alignment**
6. **Rollback proof + lock-in**

---

## TODOs

- [ ] 1. Establish the baseline ecosystem inventory and measurement model

  **What to do**:
  - Record current counts for: registered skills, enabled/default skills, skill categories, workspace packages, packages with CLI entrypoints, packages with MCP wrappers, dormant package surfaces, and governance gates.
  - Capture current “must-have” assumptions encoded in `.sisyphus/skill-manifest.json`.
  - Define baseline metrics that later tasks must improve: default surface size, docs drift, false activation risk, governance assumptions.

  **Must NOT do**:
  - Do not change routing/config yet.
  - Do not start demoting/removing assets before the baseline is captured.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: inventory + synthesis across multiple repo surfaces.
  - **Skills**: `codebase-auditor`, `writing-plans`
    - `codebase-auditor`: needed for evidence-first inventory and drift ranking.
    - `writing-plans`: needed to encode metrics and outputs clearly for downstream execution.
  - **Skills Evaluated but Omitted**:
    - `websearch`: not needed because this task is internal-repo only.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: 3, 4, 5
  - **Blocked By**: None

  **References**:
  - `.sisyphus/skill-manifest.json` - current import-era priority assumptions that overstate breadth as “must-have”.
  - `opencode-config/compound-engineering.json` - active enabled/default skill surface and categories.
  - `opencode-config/skills/registry.json` - authoritative registered skill metadata and categories.
  - `package.json` - workspace package declarations.
  - `packages/` - actual package inventory to compare against docs.
  - `opencode-config/mcp-dormant-policy.json` - evidence of existing dormant-surface governance.
  - `scripts/run-skill-routing-gates.mjs` - current gate stack to baseline before changes.

  **Acceptance Criteria**:
  - [ ] Baseline metrics artifact exists with current counts and mismatch notes.
  - [ ] Inventory includes both skill and package surfaces.
  - [ ] At least one explicit metric is defined for default-surface reduction and false-activation control.

- [ ] 2. Define the scenario taxonomy and target capability layer model

  **What to do**:
  - Create the canonical scenario taxonomy centered on planning, audit, and debug.
  - Define how secondary scenarios relate to the core (for example browser QA, architecture deep-dive, incident response, specialist framework work).
  - Formalize the 4-tier model (`default`, `manual`, `dormant`, `candidate-prune`) and write tier entry/exit criteria.

  **Must NOT do**:
  - Do not classify individual assets yet.
  - Do not let the taxonomy become a generic universal ontology.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: structural design task with medium-high architectural impact.
  - **Skills**: `architecture-design`, `writing-plans`
    - `architecture-design`: needed for coherent tier/scenario model design.
    - `writing-plans`: needed to document precise contracts and migration gates.
  - **Skills Evaluated but Omitted**:
    - `c4-architecture`: intentionally omitted because user does not want architecture-heavy domain tooling first-class in the default path.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: 3, 4, 5
  - **Blocked By**: None

  **References**:
  - `.sisyphus/drafts/ecosystem-audit-cohesion.md` - captured user decisions and strategic framing.
  - `opencode-config/compound-engineering.json` - current category grouping to replace or refine.
  - `scripts/tests/skill-implied-full-coverage.test.mjs` - evidence of current breadth-biased assumptions.
  - `docs/architecture/cli-mcp-surface-policy.md` - example of an existing explicit tier/surface policy pattern.

  **Acceptance Criteria**:
  - [ ] Each tier has a written definition, default-activation rule, and reactivation/demotion condition.
  - [ ] Scenario taxonomy clearly distinguishes core default flows from specialist/manual flows.
  - [ ] The taxonomy is specific enough to drive later classification decisions.

- [ ] 3. Classify every skill family against the new rubric and tiers

  **What to do**:
  - Score skills/families for scenario frequency, impact, overlap, misroute risk, maintenance cost, and substitutability.
  - Produce keep/default, manual, dormant, and candidate-prune recommendations.
  - Explicitly document rationale for user-cited low-priority items and adjacent families.
  - Identify dependency chains where default skills implicitly rely on demoted/manual ones.

  **Must NOT do**:
  - Do not physically delete skills in this phase.
  - Do not classify based only on intuition; every decision needs repo or workflow evidence.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: many-asset classification with overlap and edge-case analysis.
  - **Skills**: `codebase-auditor`, `architecture-design`
    - `codebase-auditor`: needed for evidence-backed comparison and prioritization.
    - `architecture-design`: needed to prevent inconsistent tier decisions.
  - **Skills Evaluated but Omitted**:
    - `product-management`: unnecessary; this is ecosystem governance, not market packaging.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: 6, 7, 8
  - **Blocked By**: 1, 2

  **References**:
  - `opencode-config/skills/registry.json` - full registered skill catalog and metadata.
  - `opencode-config/compound-engineering.json` - currently enabled skill subset.
  - `.sisyphus/skill-manifest.json` - import assumptions that may require demotion.
  - `scripts/check-skill-coverage.mjs` and `scripts/tests/skill-implied-full-coverage.test.mjs` - current coverage expectations that may conflict with tighter default selection.
  - `.sisyphus/drafts/ecosystem-audit-cohesion.md` - user guidance on what should not be first-class.

  **Acceptance Criteria**:
  - [ ] Every skill/family in scope has a proposed tier and rationale.
  - [ ] User-cited example skills are explicitly evaluated rather than ignored.
  - [ ] Cross-skill dependency risks are identified.

- [ ] 4. Classify package surfaces and build the package↔skill cohesion map

  **What to do**:
  - Map package surfaces as CLI-first, MCP-first, hybrid, or library-only according to existing policy.
  - Align package roles with skill tiers/scenarios so default skills do not point at incoherent package surfaces.
  - Identify orphan skills, orphan package surfaces, and stale docs/policies.
  - Note where package taxonomy drift creates misleading routing or discoverability.

  **Must NOT do**:
  - Do not turn this into a package implementation refactor.
  - Do not reopen the deferred CLI-vs-MCP strategy debate beyond noting future-work hooks.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: topology/cohesion analysis across packages, docs, and skills.
  - **Skills**: `codebase-auditor`, `architecture-design`
    - `codebase-auditor`: needed for package/docs/runtime drift detection.
    - `architecture-design`: needed for coherent surface-role mapping.
  - **Skills Evaluated but Omitted**:
    - `websearch`: omitted because repo policy and internal evidence are primary here.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: 6, 8
  - **Blocked By**: 1, 2

  **References**:
  - `docs/architecture/cli-mcp-surface-policy.md` - canonical package surface policy and current matrix.
  - `opencode-config/mcp-dormant-policy.json` - existing dormant package surface policy.
  - `setup-instructions.md` - confirms which internal MCPs are currently active.
  - `packages/README.md` - stale package inventory doc needing reconciliation.
  - `packages/opencode-context-governor/src/cli.mjs` and `src/mcp-server.mjs` - concrete dual-surface example.
  - `packages/opencode-memory-graph/src/cli.js` and `src/mcp-server.mjs` - hybrid surface example.
  - `packages/opencode-runbooks/src/mcp-server.mjs` - MCP-first structured tool example.

  **Acceptance Criteria**:
  - [ ] Every package/surface in scope has a role classification or explicit out-of-scope note.
  - [ ] A cohesion map exists showing which skills depend on which package surfaces.
  - [ ] Documentation drift is explicitly enumerated.

- [ ] 5. Define migration semantics for demotion, dormancy, and candidate pruning

  **What to do**:
  - Specify what “manual” means operationally: discoverable but not default-ranked, explicitly requested only, or profile-only.
  - Specify what “dormant” means operationally for skills and packages.
  - Specify thresholds and evidence required for `candidate-prune` recommendations.
  - Define rollback metadata requirements for any tier change.

  **Must NOT do**:
  - Do not let candidate-prune imply immediate deletion.
  - Do not leave tier semantics ambiguous.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: policy design with downstream implementation impact.
  - **Skills**: `architecture-design`, `writing-plans`
    - `architecture-design`: needed for clean state transitions and lifecycle rules.
    - `writing-plans`: needed for crisp operational definitions.
  - **Skills Evaluated but Omitted**:
    - `task-orchestrator`: omitted because this task defines governance, not runtime orchestration behavior itself.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: 6, 7, 9
  - **Blocked By**: 1, 2

  **References**:
  - `scripts/skills-manage.mjs` - existing enable/disable/audit/sync control plane that tier semantics should reuse.
  - `opencode-config/mcp-dormant-policy.json` - example of dormant-state policy shape.
  - `opencode-config/learning-updates/*.json` related to skill activation/drift - prior evidence of additive expansion and cleanup behavior.

  **Acceptance Criteria**:
  - [ ] Manual/dormant/candidate-prune states each have explicit operator semantics.
  - [ ] Every state transition has rollback instructions.
  - [ ] Promotion/demotion evidence requirements are written.

- [ ] 6. Update governance and routing assumptions to support a narrow default core

  **What to do**:
  - Change routing/governance expectations so default routing is allowlist-driven for planning/audit/debug scenarios.
  - Replace or adapt tests/gates that currently assume every on-disk skill must have equal dynamic selection evidence.
  - Define new fixtures/scenarios proving the default core works without breadth leakage.
  - Add failure conditions for untiered additions or manual/dormant leakage.

  **Must NOT do**:
  - Do not silently weaken quality checks; replace broad checks with more accurate tier-aware checks.
  - Do not preserve breadth-biased assumptions for convenience.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: high-risk governance and routing policy changes.
  - **Skills**: `codebase-auditor`, `writing-plans`
    - `codebase-auditor`: needed to identify exact failing assumptions in current gate stack.
    - `writing-plans`: needed to translate policy into concrete update steps and acceptance rules.
  - **Skills Evaluated but Omitted**:
    - `systematic-debugging`: useful if failures occur during execution, but not primary for the planning task.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 8)
  - **Blocks**: 9
  - **Blocked By**: 3, 4, 5

  **References**:
  - `scripts/run-skill-routing-gates.mjs` - current governance sequence and fail-fast behavior.
  - `scripts/tests/skill-implied-full-coverage.test.mjs` - explicit broad-coverage assumption that likely needs redesign.
  - `scripts/check-skill-coverage.mjs`, `scripts/check-skill-consistency.mjs`, `scripts/skill-routing-evaluator.mjs` - surrounding gate stack to update coherently.
  - `opencode-config/compound-engineering.json` - source of enabled/default skill set.

  **Acceptance Criteria**:
  - [ ] Governance no longer requires all on-disk skills to behave as default candidates.
  - [ ] Default-flow fixtures pass using only approved core capabilities.
  - [ ] New untiered assets cause governance failure.

- [ ] 7. Update the control plane and lifecycle governance for ongoing anti-bloat enforcement

  **What to do**:
  - Extend the control-plane expectations so `skills-manage`-style operations are tier-aware.
  - Define review cadence, owner fields, rationale fields, and promotion/demotion criteria for ongoing governance.
  - Add lifecycle policy covering admission, graduation, demotion, dormancy, and sunset review.
  - Guard against learning-driven re-inflation of the default set.

  **Must NOT do**:
  - Do not rely on undocumented tribal knowledge.
  - Do not allow future additions to bypass tier assignment and review metadata.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: governance/policy/control-plane alignment task.
  - **Skills**: `architecture-design`, `writing-plans`
    - `architecture-design`: needed for lifecycle and ownership model integrity.
    - `writing-plans`: needed to specify control-plane behavior concretely.
  - **Skills Evaluated but Omitted**:
    - `github-actions`: not primary unless execution later chooses CI-specific enforcement work.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 8)
  - **Blocks**: 9
  - **Blocked By**: 3, 5

  **References**:
  - `scripts/skills-manage.mjs` - existing operational control point for enabling/disabling/auditing skills.
  - `opencode-config/learning-updates/` - evidence of how activation drift has occurred historically.
  - `opencode-config/skills/registry.json` - likely location for richer tier/ownership metadata.
  - `opencode-config/compound-engineering.json` - currently stores enabled set that must be reconciled with tiering.

  **Acceptance Criteria**:
  - [ ] Tier metadata contract is defined and attached to ongoing governance.
  - [ ] Lifecycle rules include owner, rationale, review date, and promotion evidence.
  - [ ] Anti-bloat policy explicitly addresses learning-update drift.

- [ ] 8. Repair documentation and taxonomy drift across packages, skills, and policy artifacts

  **What to do**:
  - Update stale docs so they reflect the actual workspace/package ecosystem.
  - Add or update canonical docs describing the new tier model, default-path philosophy, and scenario taxonomy.
  - Ensure docs clearly explain why some capabilities are manual/dormant/candidate-prune rather than missing.
  - Add a future-work section explicitly deferring MCP-vs-CLI expansion.

  **Must NOT do**:
  - Do not leave multiple contradictory “sources of truth”.
  - Do not bury the deferred MCP-vs-CLI work inside the main migration scope.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: documentation coherence and policy articulation.
  - **Skills**: `writing-plans`, `codebase-auditor`
    - `writing-plans`: needed for structured, execution-oriented docs updates.
    - `codebase-auditor`: needed to ensure docs match repo truth.
  - **Skills Evaluated but Omitted**:
    - `stakeholder-communication`: not necessary for repo-internal policy docs.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 7)
  - **Blocks**: 10
  - **Blocked By**: 3, 4

  **References**:
  - `packages/README.md` - high-signal stale package documentation.
  - `docs/architecture/cli-mcp-surface-policy.md` - package surface policy that should remain aligned with future taxonomy.
  - Any new tier/taxonomy docs created during execution - should become canonical reference artifacts.
  - `.sisyphus/drafts/ecosystem-audit-cohesion.md` - source of user intent and deferred future-work note.

  **Acceptance Criteria**:
  - [ ] Package documentation reflects actual workspace/package reality.
  - [ ] Tier model and scenario taxonomy are documented in one canonical place.
  - [ ] Deferred CLI-vs-MCP work is captured explicitly as future expansion.

- [ ] 9. Validate migration safety, rollback paths, and default-path behavior

  **What to do**:
  - Run the updated governance suite and all relevant Bun tests.
  - Validate rollback instructions for tier changes and dormant/manual transitions.
  - Run scenario fixtures proving planning/audit/debug paths succeed with only default capabilities.
  - Run negative checks proving manual/dormant capabilities do not leak into default routing.

  **Must NOT do**:
  - Do not declare success based only on file edits.
  - Do not skip negative/leakage testing.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: verification-heavy closing task with governance sensitivity.
  - **Skills**: `verification-before-completion`, `codebase-auditor`
    - `verification-before-completion`: needed to force evidence before claims.
    - `codebase-auditor`: needed to compare expected vs actual end state.
  - **Skills Evaluated but Omitted**:
    - `test-driven-development`: not primary because verification here is migration/gate validation after policy implementation.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: 10
  - **Blocked By**: 6, 7

  **References**:
  - `scripts/run-skill-routing-gates.mjs` - final governance runner.
  - Updated tier-aware coverage/routing tests - must be exercised as proof.
  - Any rollback instructions introduced in config/docs/policy artifacts.

  **Acceptance Criteria**:
  - [ ] All updated governance/tests pass.
  - [ ] Rollback instructions were exercised or validated in a dry-runable way.
  - [ ] Default-path fixtures pass and leakage fixtures stay under threshold.

- [ ] 10. Produce the final ecosystem report and future-work appendix

  **What to do**:
  - Summarize the new default core, manual tier, dormant tier, and candidate-prune set.
  - Record before/after metrics, risks accepted, and known follow-up work.
  - Include a bounded future-work appendix for the deferred MCP-vs-CLI topic.
  - Make sure the final report is execution- and review-friendly.

  **Must NOT do**:
  - Do not hide unresolved risks.
  - Do not blur executed scope with deferred research topics.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: synthesis and handoff task.
  - **Skills**: `writing-plans`, `verification-before-completion`
    - `writing-plans`: needed for precise final structure and traceability.
    - `verification-before-completion`: needed so the report only states verified outcomes.
  - **Skills Evaluated but Omitted**:
    - `requesting-code-review`: optional downstream, not required for the plan itself.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: None
  - **Blocked By**: 8, 9

  **References**:
  - All updated policy, governance, and doc artifacts from Tasks 1-9.
  - Baseline metrics artifact from Task 1.
  - Final validation evidence from Task 9.

  **Acceptance Criteria**:
  - [ ] Final report contains before/after metrics and tier summary.
  - [ ] Future-work appendix clearly isolates deferred MCP-vs-CLI analysis.
  - [ ] Remaining risks and ownership expectations are documented.

---

## Commit Strategy

| After Task Group | Message | Verification |
|------------------|---------|--------------|
| Wave 1 | `refactor(skills): define ecosystem baseline and tier model` | inventory artifact + taxonomy review |
| Wave 2 | `refactor(skills): classify skills and package surfaces` | rubric outputs + cohesion map |
| Wave 3 | `refactor(governance): enforce tier-aware routing and docs` | governance/test passes |
| Wave 4 | `docs(ecosystem): finalize validation and handoff report` | final validation suite |

---

## Success Criteria

### Verification Commands
```bash
bun scripts/run-skill-routing-gates.mjs --full-report
# Expected: all updated gates pass; no broad-coverage false failures

bun test scripts/tests/skill-implied-full-coverage.test.mjs
# Expected: replaced or updated tier-aware equivalent passes

bun test
# Expected: relevant workspace tests continue to pass after governance/config updates
```

### Final Checklist
- [ ] Default skill surface is materially smaller and scenario-justified.
- [ ] Planning/audit/debug default flows work without specialist leakage.
- [ ] Manual/dormant/candidate-prune semantics are explicit and reversible.
- [ ] Skills and packages share a coherent taxonomy and ownership model.
- [ ] Governance blocks future untiered or breadth-inflating additions.
- [ ] Package docs and ecosystem docs match actual repo state.
- [ ] Deferred MCP-vs-CLI work is preserved as future scope, not mixed into this migration.
