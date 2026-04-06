# OpenCode Ecosystem Resilience and Delegation Hardening Plan

## TL;DR

> **Quick Summary**: Harden the OpenCode control plane by making runtime authority coherent, degraded behavior explicit, routing thresholds invariant across packages, delegation stalls detectable, and telemetry/metadata trustworthy enough to drive routing and learning.
>
> **Deliverables**:
> - Single runtime authority contract for agent/category/model resolution
> - Explicit degraded-mode state and containment for critical orchestration/routing seams
> - Cross-loop routing/budget/alerting invariants with regression coverage
> - Task-level no-progress detection for delegations
> - Observability/explainability hardening for telemetry and metadata
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 5 → Task 7

---

## Context

### Original Request
Deeply analyze the ecosystem around subagents, `oh-my-opencode`, orchestration, learning, delegation, and related runtime behavior; identify improvements that increase UX, resilience, intelligence, efficiency, and speed; produce a ranked audit, a review report, and then derive a single implementation work plan.

### Interview Summary
**Key Discussions**:
- Findings must be ranked primarily by **operational severity**.
- The user prioritized: outage resilience, better tool/package/skill utilization, early stalled-delegation detection, and consistently correct dynamic model routing.
- External runtime/plugin surfaces are in scope.
- Compatibility with upstream/external surfaces is a **strong preference**, but not a hard constraint.
- Default verification posture for the execution plan is **TDD**.

**Research Findings**:
- Runtime authority is fragmented across `opencode-config/oh-my-opencode.json`, home-directory config, plugin hooks, mirrored telemetry maps, and fail-open runtime seams.
- `packages/opencode-learning-engine/src/orchestration-advisor.js` can degrade silently by falling back to stubbed orchestration helpers.
- `packages/opencode-integration-layer/src/context-bridge.js`, `packages/opencode-context-governor/src/index.js`, `packages/opencode-model-manager/src/monitoring/alert-manager.js`, and `packages/opencode-integration-layer/src/orchestration-policy.js` encode overlapping but non-identical threshold semantics.
- Plugin-level heartbeat/quarantine exists, but current evidence does **not** show strong per-delegation no-progress detection.
- Historical audit docs already identify external-agent auditability gaps and incomplete metadata coverage.

### Metis Review
**Identified Gaps** (addressed in this plan):
- Missing severity rubric → Added explicit operational-severity-oriented success criteria and sequencing.
- Undefined routing correctness → Fixed by making runtime authority, threshold semantics, and fallback containment first-class deliverables.
- Undefined stalled-delegation semantics → Added dedicated liveness workstream with progress signals and time-bounded detection.
- Risk of scope creep into broad platform rewrites → Guardrails now constrain work to the control plane relevant to routing, delegation, resilience, telemetry, and explainability.
- Missing edge cases → Added outage, ENOENT, partial-config, clock-skew, concurrent-session, and brownout coverage.

---

## Work Objectives

### Core Objective
Make the OpenCode ecosystem provably coherent under normal and degraded conditions by unifying runtime authority, surfacing degraded behavior, enforcing cross-loop invariants, detecting stalled delegations early, and ensuring telemetry/metadata can support trustworthy routing and learning decisions.

### Concrete Deliverables
- A documented and executable runtime authority contract for agent/category/model resolution
- Regression-tested degraded-mode behavior for orchestration/routing seams
- Shared cross-module threshold and policy invariants used by router, governor, context bridge, and alerting
- A task-level delegation liveness detector with operator-visible stalled/no-progress states
- Hardened telemetry and metadata surfaces that explain why delegation/routing decisions occurred

### Definition of Done
- [ ] Runtime authority precedence is documented and machine-verified by tests/governance.
- [ ] Critical degraded paths emit explicit structured state instead of warning-only silent fallback.
- [ ] Routing/budget/alerting semantics are covered by invariant tests spanning threshold bands.
- [ ] Delegation no-progress detection exists with category-specific timing semantics and automated verification.
- [ ] Telemetry and metadata surfaces expose enough provenance to explain routing/delegation choices.
- [ ] `bun test` passes.
- [ ] `bun run governance:check` passes.
- [ ] `node scripts/health-check.mjs` completes without new control-plane regressions.

### Must Have
- Preserve Bun-first conventions and existing governance structure.
- Prefer compatibility-preserving changes for `oh-my-opencode` / external-plugin surfaces where feasible.
- Use TDD for all code changes.
- Keep verification agent-executable only.

### Must NOT Have (Guardrails)
- No broad monorepo-wide config standardization outside the authority chain relevant to routing/delegation/budget/alerting.
- No generic observability replatforming or new telemetry stack unless required by Sev0/Sev1 evidence.
- No learning-engine re-architecture unrelated to routing/liveness resilience.
- No dashboard redesign beyond minimal explainability/liveness/degraded-state surfaces needed for this work.
- No silent fallback on critical routing/orchestration seams once degraded-mode contract is introduced.

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> The executing agent must run commands, tests, scripts, or browser/CLI/API scenarios directly.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD
- **Framework**: Bun test + existing governance/health scripts

### If TDD Enabled
Each implementation task follows RED-GREEN-REFACTOR:
1. **RED**: Add or update failing tests for the targeted control-plane behavior.
2. **GREEN**: Implement the minimum coherent change to pass.
3. **REFACTOR**: Consolidate helpers/config surfaces without changing behavior.

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| Policy/config/runtime modules | Bash | Run targeted tests, snapshot commands, governance checks |
| CLI/diagnostic surfaces | interactive_bash | Run commands, observe state transitions, capture output |
| Dashboard/API explainability surfaces | Playwright or Bash | Query endpoint / page, assert degraded/liveness/provenance fields |

**Global Evidence Paths**
- Test output: `.sisyphus/evidence/ecosystem-plan-tests/`
- Governance output: `.sisyphus/evidence/ecosystem-plan-governance/`
- Snapshot outputs: `.sisyphus/evidence/ecosystem-plan-snapshots/`

---

## Execution Strategy

### Parallel Execution Waves

```text
Wave 1 (Start Immediately)
├── Task 1: Establish runtime authority contract
└── Task 4: Audit delegation liveness surfaces and add failing tests/specs

Wave 2 (After Wave 1)
├── Task 2: Make degraded-mode explicit in orchestration/routing seams
├── Task 3: Unify threshold/policy invariants across control-loop packages
└── Task 6: Harden telemetry/metadata explainability surfaces

Wave 3 (After Wave 2)
├── Task 5: Implement no-progress detection and operator-visible stalled state
└── Task 7: Add runtime authority snapshot + cross-loop integration checks

Wave 4 (After Wave 3)
└── Task 8: Final regression, governance, health, and evidence sweep
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 7 | 4 |
| 2 | 1 | 7, 8 | 3, 6 |
| 3 | 1 | 7, 8 | 2, 6 |
| 4 | None | 5 | 1 |
| 5 | 4, 6 | 8 | 7 |
| 6 | 1 | 5, 8 | 2, 3 |
| 7 | 1, 2, 3 | 8 | 5 |
| 8 | 2, 3, 5, 6, 7 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 4 | `task(category="deep"/"unspecified-high", load_skills=["test-driven-development","architecture-design","systematic-debugging"])` |
| 2 | 2, 3, 6 | dispatch in parallel after Wave 1 |
| 3 | 5, 7 | dispatch in parallel after Wave 2 |
| 4 | 8 | final integration / verification task |

---

## TODOs

- [ ] 1. Establish a single runtime authority contract for agent/category/model resolution

  **What to do**:
  - Identify the exact precedence chain among repo config, home-directory config, plugin/runtime overrides, and mirrored telemetry/runtime consumers.
  - Create failing tests for precedence resolution and provenance reporting.
  - Refactor consuming surfaces to read one authoritative resolver/contract instead of duplicating static maps where possible.
  - Add machine-readable provenance output for resolved agent/category/model values.

  **Must NOT do**:
  - Do not broaden this into generic config unification outside routing/delegation authority.
  - Do not break compatibility with upstream plugin surfaces unless necessary to remove Sev0/Sev1 ambiguity.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: authority resolution cuts across config, runtime, telemetry, and governance seams.
  - **Skills**: [`architecture-design`, `test-driven-development`, `systematic-debugging`]
    - `architecture-design`: needed to define stable precedence and merge rules.
    - `test-driven-development`: required for authority-resolution regression tests.
    - `systematic-debugging`: needed because split-brain behavior is seam-heavy and easy to misdiagnose.
  - **Skills Evaluated but Omitted**:
    - `github-actions`: not primary; CI updates are downstream of contract definition.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 4)
  - **Blocks**: 2, 3, 6, 7
  - **Blocked By**: None

  **References**:
  - `opencode-config/oh-my-opencode.json` - primary repo config surface for enabled agents, category routing, and model overrides.
  - `agents-list.md` - documents runtime named-agent source of truth at `~/.config/opencode/oh-my-opencode.json`; use to reconcile documented vs runtime authority.
  - `README.md` - root documentation also calling `oh-my-opencode.json` canonical; compare docs against implementation.
  - `scripts/runtime-tool-telemetry.mjs` - mirrored `CATEGORY_TO_MODEL` / `AGENT_TO_MODEL` maps that currently act like shadow authority.
  - `scripts/check-agents-drift.mjs` - existing governance surface for drift detection; likely extension point for runtime-authority checks.
  - `opencode-config/docs/agent-integration-summary.md` - prior evidence of external-agent auditability gap.

  **Acceptance Criteria**:
  - [ ] Failing tests added first for authority precedence and provenance reporting.
  - [ ] A single resolver/contract exists for effective agent/category/model authority.
  - [ ] Mirrored runtime consumers either consume the shared authority directly or are generated/validated against it.
  - [ ] `bun test` for the affected packages passes.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Runtime authority snapshot shows resolved source per field
    Tool: Bash
    Preconditions: Relevant packages installed; test fixtures for conflicting config inputs exist
    Steps:
      1. Run the new/updated authority snapshot command or targeted Bun test covering precedence resolution.
      2. Assert output includes resolved values for agent, category, and model.
      3. Assert each resolved value includes provenance/source (repo config, home config, runtime override, generated mirror).
      4. Save output to .sisyphus/evidence/ecosystem-plan-snapshots/task-1-authority-snapshot.txt
    Expected Result: Effective runtime truth is explainable and deterministic.
    Evidence: .sisyphus/evidence/ecosystem-plan-snapshots/task-1-authority-snapshot.txt

  Scenario: Conflicting config fixtures resolve deterministically
    Tool: Bash
    Preconditions: RED test fixtures model conflicting repo/home/runtime values
    Steps:
      1. Run targeted Bun tests for precedence fixtures.
      2. Assert tests cover at least repo-only, repo-vs-home, and runtime-override cases.
      3. Assert no fixture result is ambiguous or warning-only.
      4. Save output to .sisyphus/evidence/ecosystem-plan-tests/task-1-precedence.txt
    Expected Result: Conflict resolution is locked by tests.
    Evidence: .sisyphus/evidence/ecosystem-plan-tests/task-1-precedence.txt
  ```

  **Commit**: YES
  - Message: `feat(control-plane): unify runtime authority resolution`
  - Files: authority resolver + tests + governance updates
  - Pre-commit: `bun test`

- [ ] 2. Replace silent degraded behavior with explicit degraded-mode contracts on critical orchestration/routing seams

  **What to do**:
  - Add failing tests for missing/shared-dependency cases currently handled by warning-only fallback.
  - Introduce explicit degraded-mode state/events around `orchestration-advisor` fallback and related fail-open control-plane paths.
  - Define containment rules for which failures may continue in degraded mode versus must hard-fail.
  - Prevent polluted learning/routing decisions when a critical dependency is stubbed or unavailable.

  **Must NOT do**:
  - Do not hard-fail every dependency issue indiscriminately.
  - Do not preserve warning-only fallback on critical authority/routing logic.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: seam hardening across resilience and learning paths, but still bounded by known files.
  - **Skills**: [`test-driven-development`, `systematic-debugging`, `architecture-design`]
    - `test-driven-development`: required to lock degraded-state behavior before implementation.
    - `systematic-debugging`: necessary for optional-import/fallback chains.
    - `architecture-design`: needed to define containment boundaries.
  - **Skills Evaluated but Omitted**:
    - `incident-commander`: useful later for incidents, but not primary for implementing the contract.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3 and 6)
  - **Blocks**: 7, 8
  - **Blocked By**: 1

  **References**:
  - `packages/opencode-learning-engine/src/orchestration-advisor.js` - current stub fallback chain and warning-only degradation.
  - `packages/opencode-integration-layer/src/index.js` - broad fail-open integration seams and startup degraded-state logging.
  - `packages/opencode-integration-layer/src/orchestration-policy.js` - `failOpen` / `allowFailOpen` semantics that need explicit containment.
  - `packages/opencode-model-router-x/src/index.js` - large optional import surface where degraded mode must become explicit.
  - `opencode-config/docs/agent-integration-summary.md` - historical evidence of weak MCP/skill integration and hidden external behavior.

  **Acceptance Criteria**:
  - [ ] Failing tests added first for critical dependency-unavailable cases.
  - [ ] Critical degraded paths emit structured degraded-mode state, not warning-only console output.
  - [ ] Learning/routing decisions are gated or contained when degraded assumptions would make them unsafe.
  - [ ] Targeted package tests pass.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Missing orchestration helper enters explicit degraded mode
    Tool: Bash
    Preconditions: Test harness can simulate unavailable orchestration helper dependency
    Steps:
      1. Run targeted RED/GREEN tests that inject missing helper conditions.
      2. Assert system emits degraded-mode state/event rather than only console warning.
      3. Assert event includes severity and containment decision.
      4. Save output to .sisyphus/evidence/ecosystem-plan-tests/task-2-degraded-mode.txt
    Expected Result: Dependency loss is observable and bounded.
    Evidence: .sisyphus/evidence/ecosystem-plan-tests/task-2-degraded-mode.txt

  Scenario: Unsafe learning/routing path is contained during degraded execution
    Tool: Bash
    Preconditions: Test case models stubbed helper + routing/learning request
    Steps:
      1. Run targeted Bun tests for degraded containment.
      2. Assert routing either falls back through approved path or hard-fails with explicit reason.
      3. Assert unsafe learning update is skipped or marked degraded.
      4. Save output to .sisyphus/evidence/ecosystem-plan-tests/task-2-containment.txt
    Expected Result: Fail-open behavior no longer silently corrupts decision quality.
    Evidence: .sisyphus/evidence/ecosystem-plan-tests/task-2-containment.txt
  ```

  **Commit**: YES
  - Message: `fix(orchestration): make degraded control paths explicit`
  - Files: degraded-mode contract + tests
  - Pre-commit: `bun test`

- [ ] 3. Define and enforce cross-loop threshold and policy invariants

  **What to do**:
  - Add failing tests covering budget/threshold semantics across governor, context bridge, alert manager, and orchestration policy.
  - Decide whether threshold centralization is direct shared config or generated derived semantics, then implement it.
  - Lock invariant behavior for bands covering healthy, warn, urgent, block, and escalation states.
  - Ensure routing, compression, blocking, and alerting do not disagree silently.

  **Must NOT do**:
  - Do not overstate current differences as automatically buggy in every runtime path.
  - Do not leave thresholds duplicated without generation/validation.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: cross-module invariants and threshold semantics affect multiple control loops.
  - **Skills**: [`architecture-design`, `test-driven-development`, `systematic-debugging`]
    - `architecture-design`: choose invariant representation and ownership model.
    - `test-driven-development`: required to prove threshold bands and anti-thrash behavior.
    - `systematic-debugging`: needed for subtle split-brain/oscillation cases.
  - **Skills Evaluated but Omitted**:
    - `performance-testing`: useful later, but invariants come first.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2 and 6)
  - **Blocks**: 7, 8
  - **Blocked By**: 1

  **References**:
  - `packages/opencode-integration-layer/src/context-bridge.js` - current `65/80/85` semantics and `block`/`compress` enforcement.
  - `packages/opencode-context-governor/src/index.js` and `packages/opencode-context-governor/src/budgets.json` - warn/error/exceeded semantics sourced from budget config.
  - `packages/opencode-model-manager/src/monitoring/alert-manager.js` - alert thresholds at `75/80/95`.
  - `packages/opencode-integration-layer/src/orchestration-policy.js` - budget bands and adaptive scaling.
  - `packages/opencode-model-router-x/src/index.js` - router behavior that must consume consistent semantics.
  - `AGENTS.md` - documented threshold expectations and anti-pattern warnings.

  **Acceptance Criteria**:
  - [ ] Failing tests added first for each threshold band and anti-thrash behavior.
  - [ ] A shared invariant source or generated contract covers the participating packages.
  - [ ] Routing/compression/blocking/alerting outputs agree for the same budget input bands.
  - [ ] Threshold regression tests pass.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Threshold bands produce consistent control-loop outputs
    Tool: Bash
    Preconditions: Fixture inputs exist for <65, 65-75, 75-80, 80-85, 85-95, >=95 bands (or final chosen equivalents)
    Steps:
      1. Run targeted invariant tests across the participating packages.
      2. Assert each band yields consistent routing, compression/blocking, and alert outputs.
      3. Assert no adjacent-band fixture causes oscillation/thrashing in expected outputs.
      4. Save output to .sisyphus/evidence/ecosystem-plan-tests/task-3-thresholds.txt
    Expected Result: Shared semantics replace split-brain behavior.
    Evidence: .sisyphus/evidence/ecosystem-plan-tests/task-3-thresholds.txt

  Scenario: Router and alerts agree during critical budget state
    Tool: Bash
    Preconditions: Critical-budget fixture exists
    Steps:
      1. Run targeted tests or snapshot command for critical-budget state.
      2. Assert router fallback/penalty decision matches the same severity seen by alerting and context bridge.
      3. Save output to .sisyphus/evidence/ecosystem-plan-snapshots/task-3-critical-band.txt
    Expected Result: Control loops converge on the same severity interpretation.
    Evidence: .sisyphus/evidence/ecosystem-plan-snapshots/task-3-critical-band.txt
  ```

  **Commit**: YES
  - Message: `fix(control-loop): enforce shared routing thresholds`
  - Files: threshold contract + tests
  - Pre-commit: `bun test`

- [ ] 4. Define delegation progress signals and add failing liveness tests

  **What to do**:
  - Audit existing task/session/delegation state surfaces for progress markers.
  - Define what counts as progress for subagents, tool invocations, long-running scripts, and waiting states.
  - Add failing tests/specs for no-progress detection latency and classification (`slow`, `stalled`, `failed`, `waiting-on-human` if applicable).
  - Model edge cases: long-running quiet tasks, brownouts, rate limits, and concurrent sessions.

  **Must NOT do**:
  - Do not assume plugin heartbeat equals delegation progress.
  - Do not pick one global timeout for all task categories.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: liveness is a behavioral contract spanning state, telemetry, and orchestration.
  - **Skills**: [`test-driven-development`, `architecture-design`, `systematic-debugging`]
    - `test-driven-development`: required to capture absent behavior safely.
    - `architecture-design`: needed to define progress taxonomy.
    - `systematic-debugging`: liveness bugs are timing- and edge-case-heavy.
  - **Skills Evaluated but Omitted**:
    - `incident-commander`: helpful operationally but not primary implementation guidance.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: 5
  - **Blocked By**: None

  **References**:
  - `packages/opencode-plugin-lifecycle/src/index.js` - plugin health model; use as contrast, not as sufficient task liveness.
  - `packages/opencode-dashboard/API.md` - heartbeat/fidelity surfaces already exposed for plugin/runtime summaries.
  - `packages/opencode-learning-engine/src/orchestration-advisor.js` - orchestration signal generation that may inform progress semantics.
  - `packages/opencode-integration-layer/src/index.js` - execution telemetry and bridge surfaces.
  - `scripts/runtime-tool-telemetry.mjs` - current tool event logging that may become one progress input.

  **Acceptance Criteria**:
  - [ ] Failing tests/specs added first for progress/no-progress classification.
  - [ ] Progress signals are defined per task/tool category.
  - [ ] Edge cases include quiet long-running work, rate limits, and brownouts.
  - [ ] Targeted tests fail for missing liveness behavior before implementation begins.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Quiet long-running task is classified slow, not stalled, before timeout
    Tool: Bash
    Preconditions: Test harness can simulate expected-silent work with bounded duration
    Steps:
      1. Run targeted RED tests for a long-running quiet task category.
      2. Assert classification is not immediately stalled.
      3. Assert state remains distinguishable from healthy progress.
      4. Save output to .sisyphus/evidence/ecosystem-plan-tests/task-4-slow-vs-stalled.txt
    Expected Result: Liveness model distinguishes slow from stuck.
    Evidence: .sisyphus/evidence/ecosystem-plan-tests/task-4-slow-vs-stalled.txt

  Scenario: No-progress fixture fails within category-specific timeout
    Tool: Bash
    Preconditions: Test harness simulates missing progress signals
    Steps:
      1. Run targeted RED tests for no-progress detection.
      2. Assert the expected failure demonstrates absence of implemented liveness handling.
      3. Save output to .sisyphus/evidence/ecosystem-plan-tests/task-4-red-liveness.txt
    Expected Result: RED test suite clearly defines required stalled-detection behavior.
    Evidence: .sisyphus/evidence/ecosystem-plan-tests/task-4-red-liveness.txt
  ```

  **Commit**: YES
  - Message: `test(delegation): define liveness and no-progress expectations`
  - Files: liveness specs/tests
  - Pre-commit: `bun test`

- [ ] 5. Implement task-level no-progress detection and operator-visible stalled state

  **What to do**:
  - Implement progress tracking using the taxonomy/tests introduced in Task 4.
  - Surface stalled/no-progress state distinctly from plugin-health degradation.
  - Add remediation hints or diagnostic context appropriate to the detected failure mode.
  - Ensure detection works under long-running tasks, brownouts, rate limits, and concurrent-session scenarios.

  **Must NOT do**:
  - Do not collapse stalled, slow, rate-limited, and dependency-degraded into one generic error state.
  - Do not require manual operator observation to notice a stall.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: bounded but operationally critical behavior spanning detection and explainability.
  - **Skills**: [`test-driven-development`, `systematic-debugging`, `architecture-design`]
    - `test-driven-development`: drive implementation from Task 4 RED tests.
    - `systematic-debugging`: required for timing and state-transition issues.
    - `architecture-design`: ensure clear state model and operator semantics.
  - **Skills Evaluated but Omitted**:
    - `monitoring-observability`: useful if deep telemetry changes are needed, but not necessary as primary workflow.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: 8
  - **Blocked By**: 4, 6

  **References**:
  - Task 4 test suite/specs - source of truth for required liveness behavior.
  - `packages/opencode-plugin-lifecycle/src/index.js` - plugin state taxonomy to avoid conflating plugin health with task progress.
  - `packages/opencode-dashboard/API.md` - candidate operator surface for exposing stalled/no-progress states.
  - `scripts/runtime-tool-telemetry.mjs` - possible event source for progress observations.
  - `packages/opencode-integration-layer/src/index.js` - integration/event bridge where task progress may need wiring.

  **Acceptance Criteria**:
  - [ ] RED liveness tests from Task 4 now pass.
  - [ ] Stalled/no-progress state is distinct and queryable.
  - [ ] Detection latency is bounded by category-specific timeouts in tests.
  - [ ] Remediation context is included in emitted state/events.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Delegated task with no progress transitions to stalled state
    Tool: Bash
    Preconditions: Implemented liveness detector and fixture for no-progress task
    Steps:
      1. Run targeted Bun tests for no-progress detection.
      2. Assert state transitions from running/slow to stalled within configured category timeout.
      3. Assert emitted state includes remediation hint or reason code.
      4. Save output to .sisyphus/evidence/ecosystem-plan-tests/task-5-stalled.txt
    Expected Result: Quiet stalls become explicit and actionable.
    Evidence: .sisyphus/evidence/ecosystem-plan-tests/task-5-stalled.txt

  Scenario: Rate-limited task is not misclassified as generic stall
    Tool: Bash
    Preconditions: Rate-limit fixture exists
    Steps:
      1. Run targeted tests for rate-limit/brownout classification.
      2. Assert classification differs from true no-progress stall.
      3. Save output to .sisyphus/evidence/ecosystem-plan-tests/task-5-rate-limit.txt
    Expected Result: Operator signal stays precise under partial outages.
    Evidence: .sisyphus/evidence/ecosystem-plan-tests/task-5-rate-limit.txt
  ```

  **Commit**: YES
  - Message: `feat(delegation): detect and surface stalled work`
  - Files: liveness implementation + tests
  - Pre-commit: `bun test`

- [ ] 6. Harden telemetry and metadata for routing/delegation explainability

  **What to do**:
  - Add failing tests/checks for telemetry completeness and metadata presence on the critical routing/delegation path.
  - Reduce or validate mirrored assumptions in `runtime-tool-telemetry.mjs` against the authority contract from Task 1.
  - Normalize minimum metadata needed for skill/agent/tool explainability where current coverage is incomplete.
  - Ensure runtime events include enough provenance to explain why routing/delegation choices happened.

  **Must NOT do**:
  - Do not turn this into a full metadata/backfill program for every skill in the repo.
  - Do not introduce hidden hook dependencies without visibility/health checks.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: cross-cutting explainability work spanning telemetry and metadata surfaces.
  - **Skills**: [`test-driven-development`, `architecture-design`, `systematic-debugging`]
    - `test-driven-development`: needed to define minimum explainability guarantees.
    - `architecture-design`: needed to keep telemetry aligned with authority/liveness contracts.
    - `systematic-debugging`: hidden hook paths and metadata gaps are easy to paper over.
  - **Skills Evaluated but Omitted**:
    - `codebase-auditor`: already used for planning; execution needs implementation-focused skills now.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2 and 3)
  - **Blocks**: 5, 8
  - **Blocked By**: 1

  **References**:
  - `scripts/runtime-tool-telemetry.mjs` - current mirrored maps and external PostToolUse dependency.
  - `opencode-config/AGENTS.md` - documents external hook dependency for telemetry.
  - `opencode-config/docs/agent-integration-summary.md` - previous MCP/skill/tool metadata gaps and recommended metadata fields.
  - Relevant skill metadata files under `opencode-config/skills/` - examples of `recommended_agents`, `compatible_agents`, `tool_affinities` patterns.
  - `packages/opencode-integration-layer/src/index.js` - MCP→learning bridge and execution telemetry flow.

  **Acceptance Criteria**:
  - [ ] Failing tests/checks added for telemetry completeness and metadata presence.
  - [ ] Telemetry resolves authority/provenance through the shared contract or validated generated data.
  - [ ] Minimum explainability metadata exists for critical routing/delegation surfaces.
  - [ ] Targeted tests/checks pass.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Telemetry event includes routing/delegation provenance
    Tool: Bash
    Preconditions: Test fixture emits routing/delegation event
    Steps:
      1. Run targeted tests or snapshot command for telemetry payload generation.
      2. Assert payload includes resolved source/provenance and decision reason.
      3. Save output to .sisyphus/evidence/ecosystem-plan-snapshots/task-6-telemetry.txt
    Expected Result: Operators can trace a decision back to authority and policy inputs.
    Evidence: .sisyphus/evidence/ecosystem-plan-snapshots/task-6-telemetry.txt

  Scenario: Missing critical metadata fails validation
    Tool: Bash
    Preconditions: Validation fixture omits required metadata fields
    Steps:
      1. Run targeted RED/GREEN validation tests.
      2. Assert missing metadata is surfaced as validation failure or structured warning according to contract.
      3. Save output to .sisyphus/evidence/ecosystem-plan-tests/task-6-metadata.txt
    Expected Result: Explainability requirements are enforced, not implied.
    Evidence: .sisyphus/evidence/ecosystem-plan-tests/task-6-metadata.txt
  ```

  **Commit**: YES
  - Message: `feat(observability): harden routing explainability signals`
  - Files: telemetry + metadata validations + tests
  - Pre-commit: `bun test`

- [ ] 7. Add cross-loop integration snapshots and outage-path regression coverage

  **What to do**:
  - Build integration tests/snapshots covering critical outage and drift scenarios: missing dependency, provider outage/brownout, catalog/model mismatch, partial config corruption, ENOENT spawn path, concurrent-session pressure.
  - Assert coherence across authority snapshot, degraded-mode state, threshold semantics, and liveness classification.
  - Extend governance checks if needed so drift/invariant failures are caught before runtime.

  **Must NOT do**:
  - Do not depend on manual log inspection as the acceptance mechanism.
  - Do not limit coverage to happy-path routing.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: integration-level proof across multiple control loops.
  - **Skills**: [`test-driven-development`, `systematic-debugging`, `architecture-design`]
    - `test-driven-development`: integration invariants must be test-first.
    - `systematic-debugging`: outage-path regressions are seam-heavy.
    - `architecture-design`: ensures the snapshot/reporting surface stays coherent.
  - **Skills Evaluated but Omitted**:
    - `load-testing`: not primary; correctness precedes scale.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 5)
  - **Blocks**: 8
  - **Blocked By**: 1, 2, 3

  **References**:
  - `packages/opencode-model-router-x/src/index.js` - central router seam.
  - `packages/opencode-integration-layer/src/context-bridge.js` - enforcement semantics.
  - `packages/opencode-context-governor/src/index.js` - budget state semantics.
  - `packages/opencode-model-manager/src/monitoring/alert-manager.js` - alerting semantics.
  - `packages/opencode-crash-guard/src/spawn-guard.js` - ENOENT crash-risk path explicitly called out in repo guidance.
  - `scripts/check-agents-drift.mjs` and `scripts/health-check.mjs` - governance and health surfaces to extend or verify.

  **Acceptance Criteria**:
  - [ ] Integration tests/snapshots exist for outage, brownout, config corruption, ENOENT, and concurrent-session scenarios.
  - [ ] Each scenario asserts authority coherence, degraded-mode visibility, threshold agreement, and appropriate liveness classification.
  - [ ] Governance/health checks incorporate the new invariants where appropriate.
  - [ ] Integration test suite passes.

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Provider outage snapshot stays coherent across control loops
    Tool: Bash
    Preconditions: Outage fixture or mocked provider failure exists
    Steps:
      1. Run targeted integration tests for provider outage.
      2. Assert authority snapshot remains deterministic.
      3. Assert degraded-mode state is emitted.
      4. Assert router, context bridge, and alerting agree on severity semantics.
      5. Save output to .sisyphus/evidence/ecosystem-plan-tests/task-7-provider-outage.txt
    Expected Result: Outage behavior is explicit and coherent.
    Evidence: .sisyphus/evidence/ecosystem-plan-tests/task-7-provider-outage.txt

  Scenario: ENOENT spawn path is contained and observable
    Tool: Bash
    Preconditions: Test harness can simulate missing binary/spawn ENOENT path
    Steps:
      1. Run targeted integration test for ENOENT path.
      2. Assert system does not silently continue with incorrect assumptions.
      3. Assert emitted state/events classify the failure correctly.
      4. Save output to .sisyphus/evidence/ecosystem-plan-tests/task-7-enoent.txt
    Expected Result: Known Bun ENOENT risk is explicitly handled.
    Evidence: .sisyphus/evidence/ecosystem-plan-tests/task-7-enoent.txt
  ```

  **Commit**: YES
  - Message: `test(integration): cover control-plane outage invariants`
  - Files: integration tests + governance/health checks
  - Pre-commit: `bun test && bun run governance:check`

- [ ] 8. Run final regression, governance, and health verification sweep

  **What to do**:
  - Run full targeted and repo-level verification.
  - Capture evidence for tests, governance, and health outputs.
  - Confirm no Must-Have / Must-NOT-Have regressions remain.

  **Must NOT do**:
  - Do not claim completion without captured outputs.
  - Do not skip governance/health because package-level tests passed.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: final integration verification and evidence capture.
  - **Skills**: [`verification-before-completion`, `systematic-debugging`]
    - `verification-before-completion`: required before claiming readiness.
    - `systematic-debugging`: required if any regression appears in final sweep.
  - **Skills Evaluated but Omitted**:
    - `requesting-code-review`: review can happen later; this task is verification.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: None
  - **Blocked By**: 2, 3, 5, 6, 7

  **References**:
  - Root `AGENTS.md` - canonical verification commands and known anti-patterns.
  - `scripts/health-check.mjs` - final health signal.
  - All evidence directories under `.sisyphus/evidence/ecosystem-plan-*` - expected artifact destinations.

  **Acceptance Criteria**:
  - [ ] `bun test` → PASS
  - [ ] `bun run governance:check` → PASS
  - [ ] `node scripts/health-check.mjs` → PASS or clearly documented expected warnings with no new control-plane failures
  - [ ] Evidence files captured for all major scenario families

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Full verification sweep passes
    Tool: Bash
    Preconditions: All prior tasks merged in working branch
    Steps:
      1. Run `bun test` and capture output to .sisyphus/evidence/ecosystem-plan-governance/task-8-bun-test.txt
      2. Run `bun run governance:check` and capture output to .sisyphus/evidence/ecosystem-plan-governance/task-8-governance.txt
      3. Run `node scripts/health-check.mjs` and capture output to .sisyphus/evidence/ecosystem-plan-governance/task-8-health.txt
      4. Assert all commands exit successfully, or any expected warning is explicitly known and non-regressive.
    Expected Result: Final state is verifiably coherent.
    Evidence: .sisyphus/evidence/ecosystem-plan-governance/task-8-bun-test.txt, .sisyphus/evidence/ecosystem-plan-governance/task-8-governance.txt, .sisyphus/evidence/ecosystem-plan-governance/task-8-health.txt
  ```

  **Commit**: NO
  - Message: N/A
  - Files: N/A
  - Pre-commit: N/A

---

## Commit Strategy

| After Task | Message | Verification |
|------------|---------|--------------|
| 1 | `feat(control-plane): unify runtime authority resolution` | `bun test` |
| 2 | `fix(orchestration): make degraded control paths explicit` | `bun test` |
| 3 | `fix(control-loop): enforce shared routing thresholds` | `bun test` |
| 4 | `test(delegation): define liveness and no-progress expectations` | `bun test` |
| 5 | `feat(delegation): detect and surface stalled work` | `bun test` |
| 6 | `feat(observability): harden routing explainability signals` | `bun test` |
| 7 | `test(integration): cover control-plane outage invariants` | `bun test && bun run governance:check` |

---

## Success Criteria

### Verification Commands
```bash
bun test
bun run governance:check
node scripts/health-check.mjs
```

### Final Checklist
- [ ] Runtime authority is deterministic and explainable.
- [ ] Critical degraded paths are explicit, structured, and bounded.
- [ ] Threshold/routing/alert semantics are shared and regression-tested.
- [ ] Delegation stalls are detected early with category-aware semantics.
- [ ] Telemetry/metadata support trustworthy routing/delegation explainability.
- [ ] Outage-path and ENOENT-path regressions are covered.
- [ ] Governance and health checks confirm no new control-plane drift.
