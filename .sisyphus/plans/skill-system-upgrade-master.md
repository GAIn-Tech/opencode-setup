# Skill System Upgrade Master Plan

## TL;DR

> **Quick Summary**: Upgrade the skill ecosystem with a compatibility-first contract layer, stronger interoperability enforcement, and workflow quality gates, while preserving existing usage patterns and minimizing cognitive friction.
>
> **Deliverables**:
> - Skill Contract v2 schema (additive, backward compatible)
> - Canonical skill source-of-truth alignment
> - Runtime interoperability enforcement (dependencies/conflicts/trigger routing)
> - Workflow handoff contract + verification gates
> - Regression and contract test coverage for upgraded flow
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Schema unblock -> Canonical registry alignment -> Runtime routing/enforcement -> Verification gates

---

## Context

### Original Request
Perform a complete upgrade of the setup's skill/workflow system to improve one-pass correctness, reasoning adaptability, and multi-skill interoperability, without drastic disruption to existing workflows.

### Interview Summary
**Key Decisions**:
- Canonical runtime target: **both CLI and dashboard API**.
- Upgrade style: **compatibility-first, additive migration**.
- Wave 1 priority: **interoperability foundations first**.
- Test strategy: **tests-after** (with mandatory agent-executed QA scenarios for all tasks).

**Research Findings**:
- Existing metadata foundations exist in `opencode-config/skills/registry.json` and loader logic in `scripts/skill-profile-loader.mjs`.
- Composition guidance exists in `docs/skills/COMPOSITION.md`, but machine-readable contracts and runtime handoff validation are incomplete.
- Metis found blockers: schema extensibility constraint (`additionalProperties: false`), registry/source divergence, dangling skill references, and missing loader tests.

### Metis Review (Addressed in this plan)
- Blocker-first sequencing to avoid schema and source-of-truth drift.
- Explicit scope walls to prevent config-unification rabbit holes.
- Concrete command-based acceptance criteria only (zero manual verification dependency).

---

## Work Objectives

### Core Objective
Upgrade the skill system into a contract-driven, machine-composable, compatibility-safe workflow layer that improves routing quality and execution reliability while preserving established user mental models.

### Concrete Deliverables
- `opencode-config/skills/registry.schema.json` upgraded for additive v2 contract fields.
- `opencode-config/skills/registry.json` reconciled and aligned with canonical skill inventory.
- `scripts/skill-profile-loader.mjs` covered by dedicated tests and extended validation checks.
- `packages/opencode-learning-engine/src/orchestration-advisor.js` skill mapping aligned with canonical registry.
- `docs/skills/COMPOSITION.md` and `docs/skills/PROFILES.md` synchronized with machine-visible standards.

### Definition of Done
- [x] Registry validation passes with upgraded schema and metadata.
- [x] Skill profile loader tests cover dependency, conflict, and recommendation behavior.
- [x] Orchestration advisor references only valid, registered skills.
- [x] All acceptance criteria are agent-executable and pass.

### Must Have
- Additive migration; no disruptive removal of legacy behavior in this wave.
- Reversible rollout through scoped commits and compatibility preservation.
- Explicit interoperability contracts for dependencies/conflicts/handoffs.

### Must NOT Have (Guardrails)
- No broad config unification outside `registry.json` and `compound-engineering.json` for this plan.
- No module-system rewrites (CJS/ESM migration out of scope for this upgrade wave).
- No new watcher-heavy runtime mechanics that increase threadlock/race risk.

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> All verification must be executable by agents via commands/tools. No criterion may require a person to manually inspect behavior.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: Bun test (+ targeted node/bun command assertions)

### Agent-Executed QA Scenarios (Applies to all tasks)

Scenario: Registry and loader integrity baseline
  Tool: Bash
  Preconditions: Repository checkout clean enough to run tests
  Steps:
    1. Run `bun scripts/skill-profile-loader.mjs validate`
    2. Run `bun test`
    3. Parse exit codes and stderr
  Expected Result: Validation and tests complete without new failures
  Failure Indicators: non-zero exit, unknown skill/dependency errors
  Evidence: terminal output captured per task

Scenario: Negative regression signal
  Tool: Bash
  Preconditions: Same as above
  Steps:
    1. Run task-specific command expected to fail on bad schema/reference (intentionally malformed fixture)
    2. Assert error includes explicit validation reason
  Expected Result: deterministic, actionable error message
  Failure Indicators: silent pass or opaque stacktrace with no contract hint
  Evidence: terminal output captured per task

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Foundation; start first):
- Task 1: Schema v2 additive contract extension
- Task 2: Canonical source-of-truth alignment
- Task 3: Baseline tests for profile loader

Wave 2 (Interop enforcement; after Wave 1):
- Task 4: Register/reconcile missing skill metadata and references
- Task 5: Runtime routing alignment in orchestration advisor

Wave 3 (Contracts + docs; after Wave 2):
- Task 6: Machine-readable handoff/interop docs + schema-backed rules
- Task 7: Profile and composition synchronization

Wave 4 (Verification and release gates; after Wave 3):
- Task 8: Full acceptance suite, stability gate, rollback proof

Critical Path: 1 -> 2 -> 5 -> 8

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|----------------------|
| 1 | None | 2,4 | 3 |
| 2 | 1 | 4,5 | 3 |
| 3 | None | 8 | 1,2 |
| 4 | 1,2 | 5,7 | 6 |
| 5 | 2,4 | 8 | 6,7 |
| 6 | 4 | 7 | 5 |
| 7 | 4,6 | 8 | 5 |
| 8 | 3,5,7 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|--------------------|
| 1 | 1,2,3 | quick + writing-skills; unspecified-high + codebase-auditor; quick + test-driven-development |
| 2 | 4,5 | unspecified-high + task-orchestrator + codebase-auditor |
| 3 | 6,7 | writing + writing-skills + verification-before-completion |
| 4 | 8 | unspecified-high + verification-before-completion + systematic-debugging |

---

## TODOs

- [x] 1. Extend skill registry schema to additive v2 contract fields

  **What to do**:
  - Add optional v2 fields for machine-visible interoperability (`inputs`, `outputs`, `handoff`, `versioning`, `compositionRules`) in `opencode-config/skills/registry.schema.json`.
  - Preserve all v1 required fields and compatibility semantics.

  **Must NOT do**:
  - Do not remove/rename any existing schema fields.
  - Do not enforce mandatory v2 fields in this wave.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: focused single-file schema evolution with tight constraints.
  - **Skills**: `writing-skills`, `verification-before-completion`
    - `writing-skills`: precise schema authoring and constraints language.
    - `verification-before-completion`: hard gate before claiming compatibility.
  - **Skills Evaluated but Omitted**:
    - `test-driven-development`: schema-first change can be validated with immediate command checks and then test tasks later.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 3)
  - **Blocks**: 2,4
  - **Blocked By**: None

  **References**:
  - `opencode-config/skills/registry.schema.json` - canonical validation contract; must be expanded safely.
  - `opencode-config/skills/registry.json` - real data shape to preserve.
  - `scripts/skill-profile-loader.mjs` - loader assumptions that schema changes must not break.

  **Acceptance Criteria**:
  - [ ] `bun scripts/skill-profile-loader.mjs validate` exits 0 on existing registry.
  - [ ] New optional v2 fields validate when added to at least one skill entry fixture.
  - [ ] Existing profile resolution behavior unchanged for current profiles.

  **Agent-Executed QA Scenarios**:

  ```bash
  Scenario: Schema remains backward compatible
    Tool: Bash
    Preconditions: schema file updated; registry unchanged
    Steps:
      1. Run: bun scripts/skill-profile-loader.mjs validate
      2. Assert: exit code 0
      3. Assert: stdout contains "Registry validation passed"
    Expected Result: v1 data passes v2 schema
    Evidence: .sisyphus/evidence/task-1-schema-backward.txt

  Scenario: Invalid v2 field rejected deterministically
    Tool: Bash
    Preconditions: temporary malformed fixture prepared in test context
    Steps:
      1. Run schema validation against malformed fixture
      2. Assert: non-zero exit
      3. Assert: stderr includes failing field name
    Expected Result: clear failure signal, no silent pass
    Evidence: .sisyphus/evidence/task-1-schema-negative.txt
  ```

- [x] 2. Align canonical skill source-of-truth across registry and compound config

  **What to do**:
  - Reconcile skill inventory between `opencode-config/skills/registry.json` and `opencode-config/compound-engineering.json`.
  - Define and document canonical ownership rule (registry primary; compound references canonical set).

  **Must NOT do**:
  - No broad multi-config refactor beyond these two files.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: cross-file contract decision with downstream impact.
  - **Skills**: `task-orchestrator`, `verification-before-completion`
    - `task-orchestrator`: phase-safe sequencing and scope control.
    - `verification-before-completion`: config coherence proof.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 3)
  - **Blocks**: 4,5
  - **Blocked By**: 1

  **References**:
  - `opencode-config/skills/registry.json` - authoritative skill taxonomy and metadata.
  - `opencode-config/compound-engineering.json` - currently enabled skill subset and command wiring.
  - `docs/skills/OVERVIEW.md` - operational expectation for composition source-of-truth.

  **Acceptance Criteria**:
  - [ ] Every enabled compound skill exists in registry.
  - [ ] A scripted consistency check passes with zero missing skills.
  - [ ] Documented canonical ownership rule added to skills docs.

  **Agent-Executed QA Scenarios**:

  ```bash
  Scenario: Canonical inventory consistency pass
    Tool: Bash
    Preconditions: registry + compound config updated
    Steps:
      1. Run consistency check script comparing enabled skills to registry keys
      2. Assert: missing list length is 0
      3. Assert: exit code 0
    Expected Result: no drift between canonical and enabled skill lists
    Evidence: .sisyphus/evidence/task-2-inventory-pass.txt

  Scenario: Unknown enabled skill fails check
    Tool: Bash
    Preconditions: test fixture with one fake enabled skill
    Steps:
      1. Run same consistency check against fixture
      2. Assert: non-zero exit
      3. Assert: stderr contains fake skill name
    Expected Result: deterministic guard against drift regressions
    Evidence: .sisyphus/evidence/task-2-inventory-negative.txt
  ```

- [x] 3. Add dedicated test coverage for skill-profile loader behavior

  **What to do**:
  - Add tests for dependency resolution order, conflict detection, trigger-based recommendation ranking, and invalid registry handling.
  - Include negative cases for unknown dependency and cyclic dependency.

  **Must NOT do**:
  - Do not alter production behavior unless test failures expose real defects.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: focused test file addition with deterministic assertions.
  - **Skills**: `test-driven-development`, `verification-before-completion`
    - `test-driven-development`: robust test case structure.
    - `verification-before-completion`: ensures test relevance and pass conditions.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: 8
  - **Blocked By**: None

  **References**:
  - `scripts/skill-profile-loader.mjs` - functions under test.
  - `docs/skills/PROFILES.md` - expected profile semantics.

  **Acceptance Criteria**:
  - [ ] Tests cover success and failure paths for loader functions.
  - [ ] `bun test` includes the new suite and passes.

  **Agent-Executed QA Scenarios**:

  ```bash
  Scenario: Loader tests execute and pass
    Tool: Bash
    Preconditions: new test file committed in working tree
    Steps:
      1. Run: bun test [loader-test-file]
      2. Assert: all cases pass
      3. Assert: cycle/unknown dependency cases are present in output
    Expected Result: loader behavior covered for both positive and negative paths
    Evidence: .sisyphus/evidence/task-3-loader-tests.txt

  Scenario: Deliberate cycle fixture triggers failure path
    Tool: Bash
    Preconditions: cycle fixture defined in test scope
    Steps:
      1. Execute cycle test case only
      2. Assert: thrown error includes "Cyclic dependency"
    Expected Result: deterministic failure mode and error text
    Evidence: .sisyphus/evidence/task-3-loader-negative.txt
  ```

- [x] 4. Reconcile missing/phantom skill metadata and conflict/dependency consistency

  **What to do**:
  - Register or explicitly deprecate skill directories currently not represented in registry.
  - Ensure each referenced dependency/conflict/trigger points to valid known skills.

  **Must NOT do**:
  - No semantic rewrites of skill behavior text in this step.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `codebase-auditor`, `writing-skills`
    - `codebase-auditor`: mismatch and drift detection.
    - `writing-skills`: clean metadata contract editing.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 sequential
  - **Blocks**: 5,7
  - **Blocked By**: 1,2

  **References**:
  - `opencode-config/skills/` - actual skill directories and SKILL.md files.
  - `opencode-config/skills/registry.json` - metadata inventory to reconcile.
  - `scripts/skill-profile-loader.mjs` - runtime consumer that fails on unknown skills.

  **Acceptance Criteria**:
  - [ ] No unknown dependency/conflict references remain.
  - [ ] Directory-to-registry skill inventory check passes.
  - [ ] Conflict pair integrity check passes deterministically.

  **Agent-Executed QA Scenarios**:

  ```bash
  Scenario: Registry reconciliation passes integrity checks
    Tool: Bash
    Preconditions: registry entries reconciled with skill directories
    Steps:
      1. Run dependency/conflict integrity checker
      2. Run directory-to-registry key checker
      3. Assert: both exit 0
    Expected Result: zero unknown references and complete registration
    Evidence: .sisyphus/evidence/task-4-reconcile-pass.txt

  Scenario: Injected unknown dependency is caught
    Tool: Bash
    Preconditions: negative fixture with fake dependency
    Steps:
      1. Run same integrity checker on fixture
      2. Assert: non-zero exit and error includes unknown dependency id
    Expected Result: strict guard against metadata corruption
    Evidence: .sisyphus/evidence/task-4-reconcile-negative.txt
  ```

- [x] 5. Align orchestration advisor skill routing to canonical registry set

  **What to do**:
  - Remove dangling skill names from skill affinity mapping.
  - Ensure routing suggestions reference only valid registered skills; use compatibility-safe fallback if registry read fails.

  **Must NOT do**:
  - Do not change `advise()` output shape.
  - Do not refactor unrelated anti-pattern learning logic.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `task-orchestrator`, `systematic-debugging`
    - `task-orchestrator`: precise scope-limited change.
    - `systematic-debugging`: safe handling for fallback/error modes.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 6)
  - **Blocks**: 8
  - **Blocked By**: 2,4

  **References**:
  - `packages/opencode-learning-engine/src/orchestration-advisor.js` - routing and affinity logic.
  - `opencode-config/skills/registry.json` - canonical valid skill names.
  - `docs/architecture/integration-map.md` - advisor role within orchestration flow.

  **Acceptance Criteria**:
  - [ ] All advisor-referenced skills are resolvable in registry.
  - [ ] Negative test: unknown skill reference triggers explicit warning/fallback path.
  - [ ] Existing advisor integration tests pass.

  **Agent-Executed QA Scenarios**:

  ```bash
  Scenario: Advisor affinity map references only valid skills
    Tool: Bash
    Preconditions: advisor mapping updated
    Steps:
      1. Run check that flattens SKILL_AFFINITY values
      2. Compare each to registry skill keys
      3. Assert: zero dangling references
    Expected Result: advisor emits only valid skill suggestions
    Evidence: .sisyphus/evidence/task-5-advisor-pass.txt

  Scenario: Registry load failure triggers safe fallback
    Tool: Bash
    Preconditions: test harness simulates registry read failure
    Steps:
      1. Execute advisor recommendation path under simulated failure
      2. Assert: process does not crash
      3. Assert: fallback warning is logged once
    Expected Result: resilient behavior under config read fault
    Evidence: .sisyphus/evidence/task-5-advisor-negative.txt
  ```

- [x] 6. Introduce machine-readable handoff/interoperability contract documentation and schema alignment

  **What to do**:
  - Update docs to specify structured handoff fields and composition cues that map directly to schema fields.
  - Define canonical format for `inputs` and `outputs` metadata.

  **Must NOT do**:
  - No broad rewrite of all historical skill docs in this wave.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: `writing-skills`, `verification-before-completion`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: 7
  - **Blocked By**: 4

  **References**:
  - `docs/skills/COMPOSITION.md` - current prose-only handoff model.
  - `opencode-config/skills/registry.schema.json` - target machine-readable contract fields.

  **Acceptance Criteria**:
  - [ ] Docs define a single structured handoff contract format.
  - [ ] Every new contract field in docs maps to an existing schema field.
  - [ ] No ambiguous free-form handoff requirement remains in the updated doc.

  **Agent-Executed QA Scenarios**:

  ```bash
  Scenario: Contract docs are schema-aligned
    Tool: Bash
    Preconditions: docs and schema updated
    Steps:
      1. Run doc-schema mapping checker
      2. Assert: each documented contract key exists in schema
    Expected Result: machine-visible docs and schema stay synchronized
    Evidence: .sisyphus/evidence/task-6-doc-schema-pass.txt

  Scenario: Unknown documented key fails mapping check
    Tool: Bash
    Preconditions: negative fixture adds invalid doc key
    Steps:
      1. Run mapping checker on fixture
      2. Assert: non-zero exit and explicit unknown key output
    Expected Result: documentation drift blocked early
    Evidence: .sisyphus/evidence/task-6-doc-schema-negative.txt
  ```

- [x] 7. Synchronize profile documentation and composition chains with registry reality

  **What to do**:
  - Update profile docs so skill lists, ordering guidance, and troubleshooting mirror actual registry/profile definitions.
  - Ensure recommended chains reference existing profiles and skills only.

  **Must NOT do**:
  - Do not invent new profile names without corresponding registry entries.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: `writing-skills`, `codebase-auditor`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: 8
  - **Blocked By**: 4,6

  **References**:
  - `docs/skills/PROFILES.md` - profile user-facing source.
  - `opencode-config/skills/registry.json` - canonical profile definitions.
  - `docs/skills/COMPOSITION.md` - chain expectations.

  **Acceptance Criteria**:
  - [ ] Profile docs and registry profiles are one-to-one consistent.
  - [ ] Referenced chains contain only valid profile IDs and skills.

  **Agent-Executed QA Scenarios**:

  ```bash
  Scenario: Profile docs consistency check passes
    Tool: Bash
    Preconditions: profile docs updated
    Steps:
      1. Run profile-doc consistency script against registry
      2. Assert: no missing/extra profile IDs
      3. Assert: documented skill lists match registry
    Expected Result: user-facing profile guidance equals runtime metadata
    Evidence: .sisyphus/evidence/task-7-profiles-pass.txt

  Scenario: Invalid profile link is detected
    Tool: Bash
    Preconditions: negative fixture with fake profile name
    Steps:
      1. Run same consistency script on fixture
      2. Assert: non-zero exit and fake profile ID reported
    Expected Result: chain references cannot silently drift
    Evidence: .sisyphus/evidence/task-7-profiles-negative.txt
  ```

- [x] 8. Run release-gate verification suite and rollback-readiness proof

  **What to do**:
  - Execute full validation/test suite and contract-specific checks.
  - Capture evidence logs and confirm rollback path from latest commit boundary.

  **Must NOT do**:
  - No promotion claims without command output evidence.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `verification-before-completion`, `systematic-debugging`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 final
  - **Blocks**: None
  - **Blocked By**: 3,5,7

  **References**:
  - `scripts/skill-profile-loader.mjs` - validation path.
  - `packages/opencode-learning-engine/src/orchestration-advisor.js` - runtime routing integrity.
  - `AGENT-SKILL-ARCHITECTURE.md` - expected skill loading semantics.

  **Acceptance Criteria**:
  - [ ] `bun scripts/skill-profile-loader.mjs validate` passes.
  - [ ] `bun test` passes.
  - [ ] Contract checks for unknown skills/dependencies/conflicts return zero errors.
  - [ ] Evidence artifacts stored under `.sisyphus/evidence/skill-system-upgrade/`.

  **Agent-Executed QA Scenarios**:

  ```bash
  Scenario: Full release gate pass
    Tool: Bash
    Preconditions: tasks 1-7 complete
    Steps:
      1. Run: bun scripts/skill-profile-loader.mjs validate
      2. Run: bun test
      3. Run contract integrity checks (skills/dependencies/conflicts)
      4. Assert: all exits 0
    Expected Result: upgrade wave is verifiably stable
    Evidence: .sisyphus/evidence/task-8-release-pass.txt

  Scenario: Rollback rehearsal after forced check failure
    Tool: Bash
    Preconditions: latest commit boundary available
    Steps:
      1. Simulate failure in a contract integrity fixture
      2. Execute rollback command path for latest logical unit
      3. Re-run release gate commands
      4. Assert: system returns to previous passing state
    Expected Result: reversibility guarantee proven
    Evidence: .sisyphus/evidence/task-8-release-negative.txt
  ```

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `chore(skills): extend registry schema for v2 contracts` | registry schema | loader validate |
| 2 | `chore(skills): align canonical registry and compound config` | registry + compound config | consistency check |
| 3 | `test(skills): add profile loader coverage` | loader tests | bun test |
| 4-5 | `fix(orchestration): reconcile metadata and advisor references` | registry + advisor | validation + tests |
| 6-7 | `docs(skills): sync composition and profiles with schema` | docs/skills | docs consistency checks |
| 8 | `chore(release): run upgrade verification gates` | evidence + minor scripts/docs | full suite |

---

## Success Criteria

### Verification Commands

```bash
bun scripts/skill-profile-loader.mjs validate
# Expected: Registry validation passed

bun test
# Expected: all tests pass (including new loader tests)

node scripts/skill-profile-loader.mjs recommend "refactor and add tests" 3
# Expected: deterministic profile recommendations with valid skill sets
```

### Final Checklist
- [x] All required interoperability metadata is present and schema-valid.
- [x] All registered skills/dependencies/conflicts resolve without unknown references.
- [x] Advisor skill affinity references only canonical registered skills.
- [x] Composition and profile docs are synchronized with runtime metadata.
- [x] Validation and tests pass with captured evidence.
