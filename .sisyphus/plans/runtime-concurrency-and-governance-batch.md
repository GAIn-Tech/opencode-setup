# Runtime Concurrency and Governance Batch

## TL;DR

> **Quick Summary**: Finish the current in-flight concurrency and governance work as one bounded execution batch. Verify the already-started runtime-derived executor concurrency change, verify and retain the `Surface-Policy:` PR-governance enforcement plus its regression harness, then run a final regression sweep and land the batch cleanly.
>
> **Deliverables**:
> - Verified host-derived default concurrency in `packages/opencode-sisyphus-state/src/executor.js`
> - Verified regression coverage in `packages/opencode-sisyphus-state/tests/basic.test.js`
> - Verified `Surface-Policy:` enforcement in `scripts/pr-governance.mjs`
> - Verified regression harness in `scripts/tests/pr-governance.test.js`
> - Clean, scoped commits and final regression evidence
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 -> Task 2 -> Task 4

---

## Context

### Original Request
The user wants to stop the incremental back-and-forth and instead fully plan the remaining work so it can be executed in one pass. The user specifically asked that the agent/task concurrency value be derived from the host machine specs rather than staying hardcoded, and also asked to continue the regression harness work.

### Interview Summary
**Key Discussions**:
- The hardcoded runtime value the user cared about was believed to be `5`.
- Recent work already introduced host-derived concurrency in the workflow executor and added a `Surface-Policy:` regression harness, but the batch still needs to be verified and landed cleanly.
- The user prefers justified decisions and fewer interruption loops.

**Research Findings**:
- `packages/opencode-sisyphus-state/src/executor.js` was the real runtime hardcode (`step.concurrency ?? 5`) and is the correct place for the host-derived fix.
- `scripts/pr-governance.mjs` now enforces `Surface-Policy:` for package-surface changes.
- `scripts/tests/pr-governance.test.js` exists as the focused regression harness for that governance rule.
- `opencode-config/central-config.json` and `opencode-config/config.yaml` still contain static concurrency-related policy values, but Metis flagged them as declarative/non-runtime in the current architecture.

### Metis Review
**Identified Gaps** (addressed):
- Workspace root ambiguity: execution must target `C:\Users\jack\work\opencode-setup` explicitly.
- Scope inflation risk: do not turn declarative config values into new runtime code paths in this batch.
- Acceptance criteria gap: add explicit verification for the executor tests, PR-governance tests, and final regression/clean tree checks.

---

## Work Objectives

### Core Objective
Finish and validate the current concurrency/governance batch without expanding scope into unrelated config architecture changes.

### Concrete Deliverables
- Verified host-derived default parallel concurrency in `packages/opencode-sisyphus-state/src/executor.js`
- Verified executor regression tests in `packages/opencode-sisyphus-state/tests/basic.test.js`
- Verified `Surface-Policy:` PR-body enforcement in `scripts/pr-governance.mjs`
- Verified PR-governance regression harness in `scripts/tests/pr-governance.test.js`
- Clean commit set and final verification evidence

### Definition of Done
- [ ] `bun test packages/opencode-sisyphus-state/tests/basic.test.js` exits 0
- [ ] `bun test scripts/tests/pr-governance.test.js` exits 0
- [ ] `bun test` exits 0
- [ ] `git status --short` shows no leftover work from this batch after commits

### Must Have
- Use `C:\Users\jack\work\opencode-setup` as the workdir for all execution commands
- Preserve explicit `step.concurrency` overrides while using host-derived defaults only when no override is set
- Keep the `Surface-Policy:` enforcement and its regression harness in sync
- Verify before claiming completion

### Must NOT Have (Guardrails)
- Do not wire `opencode-config/central-config.json` operational values into new runtime code paths in this batch
- Do not modify `opencode-config/config.yaml`
- Do not modify config-loader defaults as part of this batch
- Do not broaden the work into a general concurrency architecture redesign

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: Bun test

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| Library/module | Bash | Run targeted `bun test` and inspect exit code/output |
| Governance script | Bash | Run focused test harness and inspect exit code/output |
| Final integration | Bash | Run full `bun test` and `git status --short` |

---

## Execution Strategy

### Parallel Execution Waves

```text
Wave 1 (Start Immediately):
- Task 1: Verify executor concurrency implementation and targeted tests
- Task 2: Verify PR-governance Surface-Policy harness and targeted tests

Wave 2 (After Wave 1):
- Task 3: Run full regression sweep and inspect working tree state
- Task 4: Create clean commits from the verified batch

Critical Path: Task 1 -> Task 3 -> Task 4
Parallel Speedup: Moderate; the two focused verification tracks can run independently first.
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 4 | 2 |
| 2 | None | 3, 4 | 1 |
| 3 | 1, 2 | 4 | None |
| 4 | 3 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2 | `task(category="quick", load_skills=["verification-before-completion"], run_in_background=false)` |
| 2 | 3, 4 | Sequential executor after Wave 1 verification passes |

---

## TODOs

- [ ] 1. Verify runtime-derived executor concurrency behavior

  **What to do**:
  - Review the current `packages/opencode-sisyphus-state/src/executor.js` changes without re-implementing them
  - Confirm the default `parallel-for` concurrency is derived from host CPU/memory only when `step.concurrency` is absent
  - Run the focused state-machine test file and confirm the new concurrency cases pass

  **Must NOT do**:
  - Do not replace the new host-derived logic with a new design
  - Do not wire `central-config.json` or `config.yaml` into executor runtime behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: bounded verification and small-scope runtime logic review
  - **Skills**: [`verification-before-completion`]
    - `verification-before-completion`: ensures evidence-backed confirmation before advancing
  - **Skills Evaluated but Omitted**:
    - `writing-plans`: planning already complete for this execution batch

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3, Task 4
  - **Blocked By**: None

  **References**:
  - `packages/opencode-sisyphus-state/src/executor.js` - Current host-derived concurrency logic and `parallel-for` batching path
  - `packages/opencode-sisyphus-state/tests/basic.test.js` - Regression coverage for derived default, explicit override, and low-spec minimum behavior
  - `packages/opencode-sisyphus-state/src/index.js` - Public export surface for `WorkflowExecutor`
  - `packages/opencode-sisyphus-state/README.md` - Package role and expected workflow-execution responsibilities
  - `.sisyphus/drafts/runtime-concurrency-and-governance-batch.md` - Scope boundaries and planning rationale for this batch

  **Acceptance Criteria**:
  - [ ] `bun test packages/opencode-sisyphus-state/tests/basic.test.js` -> exit code 0
  - [ ] Test output includes the new concurrency-related cases and no failures
  - [ ] No code changes are made here unless verification exposes a real defect

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Executor regression file passes with host-derived concurrency coverage
    Tool: Bash
    Preconditions: Workdir is C:\Users\jack\work\opencode-setup
    Steps:
      1. Run: bun test packages/opencode-sisyphus-state/tests/basic.test.js
      2. Assert: process exits with code 0
      3. Assert: stdout contains pass counts and no failed tests
    Expected Result: The state-machine regression file passes cleanly
    Failure Indicators: Non-zero exit, failed test counts, or thrown runtime errors
    Evidence: Terminal output capture from the command
  ```

  **Commit**: NO

- [ ] 2. Verify PR-governance Surface-Policy enforcement and regression harness

  **What to do**:
  - Review the current `scripts/pr-governance.mjs` rule and ensure it still matches the documented `Surface-Policy:` workflow
  - Run the focused regression harness in `scripts/tests/pr-governance.test.js`
  - Confirm the test coverage includes fail/pass/non-surface cases

  **Must NOT do**:
  - Do not broaden the regex or governance scope beyond the current batch unless a failing test proves it is necessary
  - Do not add unrelated governance rules in this pass

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: tightly scoped governance verification task
  - **Skills**: [`verification-before-completion`]
    - `verification-before-completion`: keeps governance changes evidence-first
  - **Skills Evaluated but Omitted**:
    - `systematic-debugging`: only needed if the focused harness fails

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3, Task 4
  - **Blocked By**: None

  **References**:
  - `scripts/pr-governance.mjs` - Current `Surface-Policy:` enforcement logic
  - `scripts/tests/pr-governance.test.js` - Focused regression harness with temp repo setup
  - `ADDITION-PROCEDURE.md` - Contributor-facing checklist entry that documents the PR-body requirement
  - `docs/architecture/cli-mcp-surface-policy.md` - Source-of-truth policy referenced by the governance failure message
  - `.sisyphus/drafts/runtime-concurrency-and-governance-batch.md` - Planned scope and exclusions

  **Acceptance Criteria**:
  - [ ] `bun test scripts/tests/pr-governance.test.js` -> exit code 0
  - [ ] The focused harness covers failing, passing, and non-surface cases
  - [ ] No additional governance drift is introduced

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: PR-governance harness validates Surface-Policy enforcement
    Tool: Bash
    Preconditions: Workdir is C:\Users\jack\work\opencode-setup and git is available in PATH
    Steps:
      1. Run: bun test scripts/tests/pr-governance.test.js
      2. Assert: process exits with code 0
      3. Assert: stdout reports 3 passing tests and 0 failures
    Expected Result: The governance harness passes cleanly
    Failure Indicators: Non-zero exit, temp-repo setup failure, or missing expected test coverage
    Evidence: Terminal output capture from the command
  ```

  **Commit**: NO

- [ ] 3. Run final regression sweep and inspect working tree state

  **What to do**:
  - After Tasks 1 and 2 pass, run the full test suite
  - Inspect the working tree and ensure only the intended batch remains to be committed
  - If regressions appear, fix only issues directly caused by this batch before continuing

  **Must NOT do**:
  - Do not start unrelated cleanup just because tests surface pre-existing noise outside this batch
  - Do not alter declarative concurrency config values in `opencode-config/central-config.json` or `opencode-config/config.yaml`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: broad verification sweep but still bounded
  - **Skills**: [`verification-before-completion`]
    - `verification-before-completion`: final evidence gate before commit
  - **Skills Evaluated but Omitted**:
    - `dispatching-parallel-agents`: the regression sweep depends on earlier pass/fail outcomes

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 4
  - **Blocked By**: Task 1, Task 2

  **References**:
  - `package.json` - Top-level test command behavior (`bun test`)
  - `scripts/tests/` - Script regression suite location
  - `packages/opencode-sisyphus-state/tests/` - Package regression location
  - `.sisyphus/drafts/runtime-concurrency-and-governance-batch.md` - Scope boundaries to apply when triaging failures

  **Acceptance Criteria**:
  - [ ] `bun test` -> exit code 0
  - [ ] `git status --short` clearly identifies the intended batch contents
  - [ ] No unresolved failures remain before commit work begins

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Full regression and working tree inspection succeed
    Tool: Bash
    Preconditions: Tasks 1 and 2 have already passed
    Steps:
      1. Run: bun test
      2. Assert: process exits with code 0
      3. Run: git status --short
      4. Assert: output contains only intended files for this batch or is clean after commits
    Expected Result: The repository is regression-safe and ready to commit
    Failure Indicators: Any failing test or unexpected unrelated batch contamination
    Evidence: Terminal output captures for both commands
  ```

  **Commit**: NO

- [ ] 4. Create atomic commits for the verified batch

  **What to do**:
  - Stage only the verified files for this batch
  - Create clean atomic commits following repo commit style
  - Re-run `git status --short` after commits to confirm no unintended leftovers

  **Must NOT do**:
  - Do not commit unrelated workspace changes
  - Do not amend or squash unless explicitly required by verification tooling after a successful commit

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: bounded git hygiene and commit creation after verification
  - **Skills**: [`git-master`, `verification-before-completion`]
    - `git-master`: required for safe staging/commit workflow
    - `verification-before-completion`: ensures commits happen only after evidence-backed checks
  - **Skills Evaluated but Omitted**:
    - `finishing-a-development-branch`: this batch stops at a clean local finish unless later integration steps are requested

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:
  - `scripts/pr-governance.mjs` - Governance script change to include in commit scope
  - `scripts/tests/pr-governance.test.js` - Governance regression harness to include in commit scope
  - `packages/opencode-sisyphus-state/src/executor.js` - Runtime concurrency implementation to include in commit scope
  - `packages/opencode-sisyphus-state/tests/basic.test.js` - Regression coverage to include in commit scope
  - `ADDITION-PROCEDURE.md` - Supporting doc change already aligned with governance behavior

  **Acceptance Criteria**:
  - [ ] Verified files are staged intentionally
  - [ ] Commit messages follow `type(scope): desc`
  - [ ] `git status --short` after commit shows no accidental leftovers from this batch

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Batch commits are created cleanly
    Tool: Bash
    Preconditions: Targeted tests and full regression have passed
    Steps:
      1. Run: git status --short
      2. Stage only verified files for this batch
      3. Create commit(s) with repo-style message(s)
      4. Run: git status --short
      5. Assert: no unintended modified or untracked files remain from this batch
    Expected Result: The batch is committed cleanly and remains regression-safe
    Failure Indicators: Commit rejection, hook failure, or unintended staged leftovers
    Evidence: Terminal output capture from git status and commit commands
  ```

  **Commit**: YES
  - Message: `fix(sisyphus-state): derive default parallel concurrency from host specs`
  - Message: `test(governance): cover surface-policy pr enforcement`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 4 | `fix(sisyphus-state): derive default parallel concurrency from host specs` | `packages/opencode-sisyphus-state/src/executor.js`, `packages/opencode-sisyphus-state/tests/basic.test.js` | `bun test packages/opencode-sisyphus-state/tests/basic.test.js` |
| 4 | `test(governance): cover surface-policy pr enforcement` | `scripts/pr-governance.mjs`, `scripts/tests/pr-governance.test.js`, `ADDITION-PROCEDURE.md` | `bun test scripts/tests/pr-governance.test.js` |

---

## Success Criteria

### Verification Commands

```bash
bun test packages/opencode-sisyphus-state/tests/basic.test.js
# Expected: exit 0, all targeted state-machine tests pass

bun test scripts/tests/pr-governance.test.js
# Expected: exit 0, all 3 governance harness tests pass

bun test
# Expected: exit 0, no regressions across the repo test suite

git status --short
# Expected: clean or only intentionally known post-commit state
```

### Final Checklist
- [ ] Host-derived executor concurrency behavior is verified
- [ ] `Surface-Policy:` governance enforcement is verified
- [ ] Focused regression harnesses pass
- [ ] Full test suite passes
- [ ] Scope stayed bounded; no config-runtime redesign was introduced
