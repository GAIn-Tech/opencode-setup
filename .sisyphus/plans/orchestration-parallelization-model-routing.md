# Orchestration Parallelization and Dynamic Model Routing Refinement

## TL;DR

> **Quick Summary**: Introduce a global orchestration policy layer that increases practical parallelization and upgrades model delegation from static paths to balanced dynamic selection, with fail-open behavior and category-first rollout.
>
> **Deliverables**:
> - Global policy module for adaptive fan-out/concurrency
> - Dynamic routing policy using combined budget score (context + cost)
> - Category-gated rollout (deep/architecture/research first)
> - Telemetry and guardrails for quality/cost/latency
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Policy abstraction -> integration seams -> rollout flags -> validation

---

## Context

### Original Request
Refine orchestration behavior so parallelization is used more effectively as a global behavior (with forethought before/after), and improve model delegation from linear static mapping to a more intelligent multi-factor selector.

### Interview Summary
**Key Discussions**:
- Category-first rollout selected (not immediate global default).
- Dynamic selector objective selected: balanced score (quality first, then latency/cost within constraints).
- Parallel safety selected: adaptive cap by budget.
- Primary budget signal selected: combined score (context pressure + dollar-cost pressure).
- Cap policy selected: no extra fixed hard cap; verify existing adaptive/spec-memory-aware logic first, add only if missing.
- Test strategy selected: TDD.
- Constraint selected: avoid Claude-based delegation for this planning run.

**Research Findings**:
- `packages/opencode-sisyphus-state/src/executor.js` already supports host-derived parallel defaults + per-step override.
- `packages/opencode-model-router-x/src/index.js` already has multi-factor scoring seams (`_scoreModel`, `_applyBudgetPenalty`, learning advice adapter).
- `packages/opencode-integration-layer/src/index.js` already performs budget-aware routing with fail-open behavior.
- `packages/opencode-learning-engine/src/index.js` already provides `adviceGenerated` hook seam.
- Gap: primitives exist but parallelization/routing policy is still localized rather than globally coordinated.

### Gap Review (Metis-equivalent due model constraint)
Because Anthropic delegation is currently disallowed, this plan includes local gap analysis with the same guardrails:
- Missing explicit global policy precedence across executor/integration/router.
- Risk of scope creep into broad architecture rewrites.
- Need explicit acceptance criteria for behavior changes (not just config changes).
- Need deterministic fail-open semantics for all new dynamic logic.

---

## Work Objectives

### Core Objective
Create a policy-driven orchestration layer that applies adaptive parallelization and dynamic model selection consistently across core execution paths, while preserving fail-open reliability and keeping rollout controlled by category.

### Concrete Deliverables
- `packages/opencode-integration-layer/src/orchestration-policy.js` (new global decision layer)
- Integration wiring in `packages/opencode-integration-layer/src/index.js`
- Policy-aware concurrency wiring in `packages/opencode-sisyphus-state/src/executor.js`
- Dynamic budget/quality routing integration in `packages/opencode-model-router-x/src/index.js`
- Rollout configuration in `opencode-config/oh-my-opencode.json`
- Test suites across integration-layer/sisyphus-state/model-router

### Definition of Done
- [x] Category-first rollout active for agreed categories only.
- [x] Combined budget score influences both concurrency/fan-out and model selection.
- [x] No new hard failures introduced (all new logic fail-open).
- [x] TDD tests pass for policy decisions and integration behavior.

### Must Have
- Balanced dynamic selector (quality -> latency/cost under constraints)
- Adaptive parallelization policy using combined budget score
- Deterministic policy precedence and explainable routing decisions

### Must NOT Have (Guardrails)
- No rewrite of router/executor architecture
- No hard blocking on advisory/budget service failures
- No hidden write side effects in read-only paths
- No single static per-category model lock-in as the final behavior

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD
- **Framework**: Bun test

### If TDD Enabled
Each task follows RED -> GREEN -> REFACTOR with task-local tests first, then targeted suite pass.

### Agent-Executed QA Scenarios (MANDATORY)

Scenario: Dynamic policy adjusts parallelization under budget pressure
  Tool: Bash
  Preconditions: Test harness can invoke policy function with synthetic runtime contexts
  Steps:
    1. Execute policy with healthy budget context
    2. Capture `parallel.maxFanout` and `parallel.maxConcurrency`
    3. Execute policy with high pressure combined budget context
    4. Assert resulting fanout/concurrency values are lower than healthy case
  Expected Result: Adaptive throttling is applied
  Failure Indicators: Equal or higher fanout under higher pressure
  Evidence: Terminal output snapshot

Scenario: Model routing balances quality and cost
  Tool: Bash
  Preconditions: Route function test fixture contains at least 3 candidate models with varied quality/cost/latency
  Steps:
    1. Run routing test with neutral budget and quality-sensitive task type
    2. Assert higher-quality model selected
    3. Run with high budget pressure context
    4. Assert lower-cost acceptable model selected or score gap reduced
  Expected Result: Balanced objective behavior observed
  Failure Indicators: Always selecting same model regardless of context
  Evidence: Test output + assertion logs

Scenario: Fail-open on missing advisory inputs
  Tool: Bash
  Preconditions: Mock context-governor/model signals unavailable
  Steps:
    1. Run integration test with missing advisory dependencies
    2. Assert execution continues with default policy output
    3. Assert warning emitted once
  Expected Result: No crash, deterministic fallback result
  Failure Indicators: Throw, rejection, or undefined routing result
  Evidence: Test output

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Start Immediately):
- Task 1: Policy contract + scoring design
- Task 2: Baseline telemetry envelope for policy decisions

Wave 2 (After Wave 1):
- Task 3: Integration-layer wiring to central policy
- Task 4: Executor wiring to adaptive parallel policy
- Task 5: Model-router wiring to central policy outputs

Wave 3 (After Wave 2):
- Task 6: Category rollout config + feature flags
- Task 7: End-to-end validation + regression suite

Critical Path: 1 -> 3 -> 5 -> 6 -> 7

---

## TODOs

- [x] 1. Define orchestration policy contract (TDD)
  - What to do:
    - Add policy module with explicit inputs/outputs for routing + parallel caps.
    - Define combined budget score function (context + cost pressure).
    - Add RED tests for scoring and precedence.
  - Recommended Agent Profile:
    - Category: `unspecified-high`
    - Skills: `superpowers/test-driven-development`, `superpowers/systematic-debugging`
  - Parallelization: Can run in parallel with Task 2
  - References:
    - `packages/opencode-integration-layer/src/index.js`
    - `packages/opencode-sisyphus-state/src/executor.js`
    - `packages/opencode-model-router-x/src/index.js`

- [x] 2. Add policy telemetry schema (TDD)
  - What to do:
    - Define normalized decision event payload (inputs, score components, outputs, fallback reason).
    - Ensure low-overhead logging path and sampling option.
    - Add tests for event shape stability.
  - Recommended Agent Profile:
    - Category: `quick`
    - Skills: `superpowers/test-driven-development`
  - Parallelization: Can run in parallel with Task 1
  - References:
    - `packages/opencode-model-manager/src/monitoring/metrics-collector.js`
    - `packages/opencode-integration-layer/src/index.js`

- [x] 3. Wire integration-layer to global policy (TDD)
  - What to do:
    - Route runtime context through policy module before model/router invocation.
    - Preserve existing fail-open semantics.
    - Add tests for policy-on/policy-off parity and fallback behavior.
  - Recommended Agent Profile:
    - Category: `unspecified-high`
    - Skills: `superpowers/test-driven-development`, `superpowers/verification-before-completion`
  - Parallelization: Wave 2
  - References:
    - `packages/opencode-integration-layer/src/index.js`
    - `packages/opencode-integration-layer/tests/execute-task-runtime-context.test.js`

- [x] 4. Wire executor adaptive parallel controls (TDD)
  - What to do:
    - Connect `parallel-for` fan-out/concurrency derivation to policy outputs.
    - Reuse existing host-aware baseline, then adapt by combined budget signal.
    - Add tests for healthy vs pressured budget contexts.
  - Recommended Agent Profile:
    - Category: `unspecified-high`
    - Skills: `superpowers/test-driven-development`
  - Parallelization: Wave 2
  - References:
    - `packages/opencode-sisyphus-state/src/executor.js`

- [x] 5. Wire model-router balanced objective (TDD)
  - What to do:
    - Feed policy outputs into score weighting path without removing current factors.
    - Keep adapter/fallback behavior deterministic and fail-open.
    - Add tests for quality-priority + budget-pressure transitions.
  - Recommended Agent Profile:
    - Category: `unspecified-high`
    - Skills: `superpowers/test-driven-development`, `superpowers/systematic-debugging`
  - Parallelization: Wave 2
  - References:
    - `packages/opencode-model-router-x/src/index.js`
    - `packages/opencode-model-router-x/test/meta-kb-routing.test.js`

- [x] 6. Implement category-first rollout controls (TDD)
  - What to do:
    - Add config-gated enablement for selected categories (`deep`, `ultrabrain`, `unspecified-high` first).
    - Ensure non-enabled categories preserve existing behavior.
    - Add tests for rollout gates.
  - Recommended Agent Profile:
    - Category: `quick`
    - Skills: `superpowers/test-driven-development`
  - Parallelization: Wave 3
  - References:
    - `opencode-config/oh-my-opencode.json`
    - `packages/opencode-integration-layer/src/index.js`

- [x] 7. Validate end-to-end behavior and regressions
  - What to do:
    - Run targeted suites for integration-layer, router, executor.
    - Run smoke flow for fail-open behavior when advisory dependencies unavailable.
    - Document before/after telemetry deltas.
  - Recommended Agent Profile:
    - Category: `deep`
    - Skills: `superpowers/verification-before-completion`
  - Parallelization: Final sequential
  - References:
    - Existing tests in touched packages

---

## Commit Strategy

| After Task | Message | Verification |
|------------|---------|--------------|
| 1-2 | `feat(orchestration): add global policy contract and telemetry schema` | bun test (policy tests) |
| 3-5 | `feat(routing): wire adaptive parallelization and balanced model scoring` | bun test (integration/router/executor) |
| 6-7 | `feat(rollout): add category-gated enablement and validation` | bun test + targeted smoke checks |

---

## Success Criteria

### Verification Commands
```bash
bun test packages/opencode-integration-layer/tests
bun test packages/opencode-model-router-x/test
bun test packages/opencode-sisyphus-state/test
```

### Final Checklist
- [x] Policy decisions are explainable and logged
- [x] Parallelization is adaptively increased/decreased by combined budget score
- [x] Model selection varies by context rather than static linear mapping
- [x] Category-first rollout is enforced
- [x] Fail-open behavior preserved across all new seams
