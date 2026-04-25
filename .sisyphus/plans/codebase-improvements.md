# Codebase Improvement Plan — OpenCode Setup Monorepo

## TL;DR

> **Quick Summary**: Execute 18 prioritized codebase improvements across the OpenCode monorepo — remove tracked artifacts, consolidate fragmented configs, fix dead plugin architecture, standardize module system, and establish guardrails against regression.
>
> **Deliverables**:
> - Clean git repo (0 tracked `.db`/`.next` artifacts)
> - Consolidated config layer (6→3 JSON configs with clear ownership)
> - Working pre-commit hooks preventing artifact re-introduction
> - Shared threshold constants across packages
> - Standardized model naming format across all configs
> - Shotgun debugging guard in learning engine
> - Organized scripts directory structure
> - Consistent test organization pattern
> - Canonical skill registry (1 source, not 2)
> - Resolved plugin loading path for @jackoatmon/ packages
> - ESM-migrated packages where safe
> - AGENTS.md consolidation strategy
>
> **Estimated Effort**: Large (18 findings, 6 waves)
> **Parallel Execution**: YES — 6 waves with parallelizable tasks
> **Critical Path**: Task 1 (baseline) → Task 2 (artifacts) → Task 4 (pre-commit) → Task 5 (config validation) → remaining tasks

---

## Context

### Original Request

User requested a full codebase improvement analysis executed directly (no subagents), then approved proceeding with an executable work plan covering all 18 findings.

### Interview Summary

**Key Discussions**:
- Full audit was executed by Prometheus directly — no subagents used
- 6 Critical + 8 High + 4 Medium findings identified and ranked
- User approved all findings with "proceed"
- No TDD — infrastructure/config remediation, not feature code
- Windows platform, Bun 1.3.10 runtime

**Research Findings**:
- 6+ overlapping JSON configs in `opencode-config/` with no single source of truth
- 100+ SQLite `.db` files tracked in git under `packages/opencode-model-manager/tests/`
- 8 `@jackoatmon/` plugins built but can't load (OpenCode runs `npm install`, they're not published)
- Mixed CJS/ESM — root is `commonjs`, ~10 packages are `module`
- `orchestration-advisor.js:441` has shotgun debugging anti-pattern (`attempt_number >= 3`)
- `audit.db` production database in source tree
- 30+ AGENTS.md files across codebase
- 93 scripts in flat directory with no subdirectory structure
- Skill definitions duplicated across 2 registries
- Model naming inconsistencies between configs
- Context thresholds hardcoded in 4+ packages
- No pre-commit hooks to prevent artifact re-introduction

### Metis Review

**Identified Gaps** (addressed):
- Missing traceability: Each task now maps to exactly one finding ID (C#/H#/M#)
- No baseline verification: Added Task 1 (baseline suite) and post-wave verification
- No rollback strategy: Added rollback boundary per wave
- Risk of behavior change during cleanup: Added behavior-preservation rule
- Windows edge cases: All acceptance commands validated for Windows
- Worktree safety: Tasks must not assume single working directory
- SQLite locking on Windows: Cleanup steps avoid mid-run deletion

---

## Work Objectives

### Core Objective

Systematically remediate 18 codebase health findings across the OpenCode monorepo, prioritizing mechanical/reversible changes first, then semantic consolidation, with full regression verification after each wave.

### Concrete Deliverables

- Zero tracked artifact files (`.db`, `.next/`) in git
- Pre-commit hooks blocking artifact re-introduction
- Config consolidation with clear ownership per domain
- Shared threshold constants replacing hardcoded values
- Shotgun debugging guard in learning engine
- Organized scripts directory with subdirectories
- Standardized test organization pattern documented in AGENTS.md
- Single canonical skill registry
- Consistent model naming format across all configs
- AGENTS.md consolidation strategy implemented
- @jackoatmon/ plugin loading resolution
- ESM migration for safe-to-convert packages

### Definition of Done

- [ ] `git ls-files "**/*.db"` returns empty (or allowlisted production schemas only)
- [ ] `git ls-files ".next/**"` returns empty
- [ ] `bun test` passes with 0 failures
- [ ] `bun run governance:check` exits 0
- [ ] `bun run setup` exits 0
- [ ] All 18 findings have traceable remediation tasks marked complete

### Must Have

- Every task references exactly one finding ID
- Behavior-preservation: no runtime behavior changes unless the finding explicitly requires it
- Baseline verification suite runs before Wave 1 and after every wave
- Rollback boundary: if any wave fails verification, revert that wave's commits before proceeding
- All acceptance criteria executable on Windows via Bun or bash

### Must NOT Have (Guardrails)

- MUST NOT combine unrelated remediations in one task
- MUST NOT convert module systems repo-wide without per-package verification
- MUST NOT remove governance scripts without measurable acceptance target and deprecation plan
- MUST NOT unify thresholds across packages if it changes runtime behavior — only introduce shared constants where consumers are proven equivalent
- MUST NOT reorganize scripts directory without updating all npm script references in package.json
- MUST NOT delete AGENTS.md files — only consolidate shared sections
- MUST NOT touch `.db` files while tests are running (Windows SQLite locking)
- MUST NOT make aesthetic-only changes (formatting, ordering) that increase diff noise

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision

- **Infrastructure exists**: YES (bun test framework)
- **Automated tests**: Tests-after (infrastructure remediation, not feature code)
- **Framework**: Bun test (bunfig.toml)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

Every task includes at least one Agent-Executed QA Scenario using Bash (the primary verification tool for this infrastructure-focused plan). UI-related tasks use Playwright where applicable.

---

## Execution Strategy

### Baseline Verification Suite (MUST run before Wave 1 and after each wave)

```bash
# B1: Tests pass
bun test

# B2: Setup succeeds
bun run setup

# B3: Governance gates pass
bun run governance:check

# B4: No tracked artifacts
git ls-files "**/*.db" | wc -l
git ls-files "**/.next/**" | wc -l

# B5: Dashboard builds (if applicable)
cd packages/opencode-dashboard && bun run build && cd ../..
```

### Parallel Execution Waves

```
Wave 0 (Baseline — Start Immediately):
└── Task 1: Capture baseline verification suite

Wave 1 (Quick Wins — Mechanical, Reversible):
├── Task 2: Remove tracked artifacts (C2, C6, M1)
├── Task 3: Fix shotgun debugging guard (C5)
├── Task 4: Add pre-commit hooks (H8)
└── Task 5: Extract shared threshold constants (H7)

Wave 2 (Config & Naming — Semantic but Bounded):
├── Task 6: Standardize model naming format (H5)
├── Task 7: Create config overlap validation script (C1 prep)
└── Task 8: Deduplicate skill registry (H4)

Wave 3 (Organization — Structural Changes):
├── Task 9: Reorganize scripts directory (H2)
├── Task 10: Standardize test organization pattern (H3, M3)
└── Task 11: Consolidate AGENTS.md shared sections (H1, M4)

Wave 4 (Architecture — Requires Design Decisions):
├── Task 12: Consolidate config files (C1)
└── Task 13: Resolve @jackoatmon/ plugin loading (C3)

Wave 5 (Migration — Highest Risk):
├── Task 14: Migrate safe packages to ESM (C4)
└── Task 15: Audit governance scripts (H6)

Wave 6 (Cleanup):
└── Task 16: Remove stale test .db fixtures and add schema migrations (C6 follow-up)
```

### Dependency Matrix

| Task | Finding | Depends On | Blocks | Can Parallelize With |
|------|---------|------------|--------|---------------------|
| 1 | — | None | All (Wave 1+) | None (must complete first) |
| 2 | C2,C6,M1 | 1 | 4, 16 | 3, 5 |
| 3 | C5 | 1 | None | 2, 4, 5 |
| 4 | H8 | 2 | None | 3, 5 |
| 5 | H7 | 1 | None | 2, 3 |
| 6 | H5 | 1 | 7 | 7, 8 |
| 7 | C1-prep | 6 | 12 | 8 |
| 8 | H4 | 1 | None | 6, 7 |
| 9 | H2 | 1 | None | 10, 11 |
| 10 | H3,M3 | 1 | None | 9, 11 |
| 11 | H1,M4 | 1 | None | 9, 10 |
| 12 | C1 | 7 | None | 13 |
| 13 | C3 | 1 | None | 12 |
| 14 | C4 | 1 | None | 15 |
| 15 | H6 | 1 | None | 14 |
| 16 | C6-followup | 2 | None | None |

### Rollback Boundaries

| Wave | Rollback Trigger | Rollback Action |
|------|------------------|-----------------|
| 1 | Any baseline check fails after wave | `git revert HEAD~N` (N = wave commits), re-run baseline |
| 2 | Model naming or config validation breaks | Revert wave commits, re-validate |
| 3 | Scripts or test reorganization breaks CI | Revert wave commits, verify package.json scripts work |
| 4 | Config consolidation breaks runtime | Revert wave commits, verify `bun run setup` |
| 5 | ESM migration breaks imports | Revert per-package, verify each individually |
| 6 | Schema migration breaks audit logging | Revert, verify audit.db still works |

---

## Finding → Task Traceability Matrix

| Finding ID | Title | Task(s) | Priority |
|------------|-------|---------|----------|
| C1 | Config Fragmentation — No Single Source of Truth | 7 (prep), 12 (consolidation) | Critical |
| C2 | Tracked Artifacts in Git — 100+ SQLite DBs + Build Output | 2 | Critical |
| C3 | Dead Plugin Architecture — 8 Custom Plugins Can't Load | 13 | Critical |
| C4 | Mixed Module System — CJS Root, ESM Packages | 14 | Critical |
| C5 | Shotgun Debugging Anti-Pattern in Learning Engine | 3 | Critical |
| C6 | Production SQLite DB in Source Tree | 2 (remove), 16 (schema migration) | Critical |
| H1 | 30+ AGENTS.md Files — Documentation Maintenance Burden | 11 | High |
| H2 | Script Directory — Flat 93 Files, No Organization | 9 | High |
| H3 | Test Organization Inconsistency | 10 | High |
| H4 | Skill Definition Duplication | 8 | High |
| H5 | Model Naming Inconsistencies Across Configs | 6 | High |
| H6 | Over-Engineered Governance Layer | 15 | High |
| H7 | Context Budget Thresholds Scattered Across Packages | 5 | High |
| H8 | No Pre-Commit Hooks for Artifact Prevention | 4 | High |
| M1 | Dashboard Build Artifacts in Source | 2 | Medium |
| M2 | No Package Dependency Version Consolidation | (deferred — low impact) | Medium |
| M3 | Missing Test Infrastructure in Several Packages | 10 | Medium |
| M4 | Documentation Sprawl — 20+ Root-Level Markdown Files | 11 | Medium |

---

## TODOs

- [ ] 1. Capture Baseline Verification Suite
  **Finding**: N/A (enabler for all waves)
  **What to do**:
  - Run `bun test` and capture exit code + test count
  - Run `bun run setup` and capture exit code
  - Run `bun run governance:check` and capture exit code
  - Run `git ls-files "**/*.db"` and count tracked `.db` files
  - Run `git ls-files "**/.next/**"` and count tracked `.next` files
  - Run `cd packages/opencode-dashboard && bun run build` and capture exit code
  - Save all results to `.sisyphus/evidence/baseline.txt`
  **Must NOT do**:
  - Must NOT modify any files
  - Must NOT skip any baseline check even if it fails
  **Recommended Agent Profile**:
  - **Category**: `quick`
  - Reason: Simple command execution with output capture
  - **Skills**: []
  **Parallelization**:
  - **Can Run In Parallel**: NO — must complete before any other task
  - **Blocks**: All Wave 1+ tasks
  - **Blocked By**: None
  **References**:
  - `package.json` — npm scripts for test, setup, governance:check
  - `bunfig.toml` — Bun test configuration
  - `packages/opencode-dashboard/package.json` — build command
  **Acceptance Criteria**:
  - [ ] File `.sisyphus/evidence/baseline.txt` exists with all 6 baseline check results
  - [ ] Each check has a clear PASS/FAIL status and output summary
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Baseline capture completes with all checks
  Tool: Bash
  Preconditions: Repo is in current state, no pending changes
  Steps:
  1. mkdir -p .sisyphus/evidence
  2. echo "=== BASELINE VERIFICATION ===" > .sisyphus/evidence/baseline.txt
  3. echo "--- bun test ---" >> .sisyphus/evidence/baseline.txt && bun test >> .sisyphus/evidence/baseline.txt 2>&1; echo "EXIT: $?" >> .sisyphus/evidence/baseline.txt
  4. echo "--- bun run setup ---" >> .sisyphus/evidence/baseline.txt && bun run setup >> .sisyphus/evidence/baseline.txt 2>&1; echo "EXIT: $?" >> .sisyphus/evidence/baseline.txt
  5. echo "--- bun run governance:check ---" >> .sisyphus/evidence/baseline.txt && bun run governance:check >> .sisyphus/evidence/baseline.txt 2>&1; echo "EXIT: $?" >> .sisyphus/evidence/baseline.txt
  6. echo "--- tracked .db files ---" >> .sisyphus/evidence/baseline.txt && git ls-files "**/*.db" >> .sisyphus/evidence/baseline.txt; echo "COUNT: $(git ls-files '**/*.db' | wc -l)" >> .sisyphus/evidence/baseline.txt
  7. echo "--- tracked .next files ---" >> .sisyphus/evidence/baseline.txt && git ls-files "**/.next/**" >> .sisyphus/evidence/baseline.txt; echo "COUNT: $(git ls-files '**/.next/**' | wc -l)" >> .sisyphus/evidence/baseline.txt
  8. cat .sisyphus/evidence/baseline.txt
  Expected Result: All 6 baseline checks produce output with exit codes, file is non-empty
  Evidence: .sisyphus/evidence/baseline.txt
  ```
  **Commit**: NO (read-only, no changes)

---

- [ ] 2. Remove Tracked Artifacts from Git (C2, C6, M1)
  **Finding**: C2 (100+ SQLite DBs tracked), C6 (audit.db in source), M1 (.next/ build artifacts)
  **What to do**:
  - Run `git rm --cached` on all tracked `.db` files under `packages/opencode-model-manager/tests/`
  - Run `git rm --cached` on `packages/opencode-model-manager/audit.db`
  - Run `git rm --cached -r` on all tracked `packages/opencode-dashboard/.next/` files
  - Verify `.gitignore` already covers `*.db` and `.next/` (add rules if missing)
  - Run `git status` to confirm files are marked as deleted-from-tracking but still exist on disk
  - Create `packages/opencode-model-manager/audit-schema.sql` with CREATE TABLE statements extracted from the current `audit.db` schema
  **Must NOT do**:
  - Must NOT delete files from disk (only from git tracking)
  - Must NOT modify the actual `.db` files
  - Must NOT run this while `bun test` is executing (SQLite locking on Windows)
  - Must NOT add `audit.db` to the repo as a fixture — only the schema `.sql` file
  **Recommended Agent Profile**:
  - **Category**: `quick`
  - Reason: Mechanical git operations with clear steps
  - **Skills**: [`git-master`]
  - `git-master`: Git operations (git rm --cached, status verification)
  - **Skills Evaluated but Omitted**:
  - `clean-architecture`: Not a code design task
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 3, 5 (no file overlap)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4 (needs clean state before hooks), Task 16
  - **Blocked By**: Task 1 (baseline)
  **References**:
  - `packages/opencode-model-manager/tests/` — contains 100+ `.db` test artifacts
  - `packages/opencode-model-manager/audit.db` — production database in source tree
  - `packages/opencode-model-manager/src/lifecycle/audit-logger.js` — creates/writes audit.db, contains schema definition (CREATE TABLE statements)
  - `packages/opencode-dashboard/.next/` — Next.js build output
  - `.gitignore` — verify `*.db` and `.next` rules exist
  **Acceptance Criteria**:
  - [ ] `git ls-files "**/*.db"` returns empty output
  - [ ] `git ls-files "**/.next/**"` returns empty output
  - [ ] Files still exist on disk (not deleted, just untracked)
  - [ ] `.gitignore` contains `*.db` and `.next` rules
  - [ ] `packages/opencode-model-manager/audit-schema.sql` exists with CREATE TABLE statements
  - [ ] `bun test` still passes after changes
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: No .db files tracked in git after cleanup
  Tool: Bash
  Preconditions: Task 1 baseline captured, no tests currently running
  Steps:
  1. git ls-files "**/*.db" > .sisyphus/evidence/task-2-db-check.txt
  2. Assert: file is empty (0 lines) or contains only allowlisted schemas
  3. git ls-files "**/.next/**" > .sisyphus/evidence/task-2-next-check.txt
  4. Assert: file is empty (0 lines)
  5. test -f packages/opencode-model-manager/audit.db && echo "audit.db exists on disk: OK" || echo "audit.db missing from disk: FAIL"
  6. test -f packages/opencode-model-manager/audit-schema.sql && echo "audit-schema.sql exists: OK" || echo "audit-schema.sql missing: FAIL"
  7. bun test 2>&1 | tail -5
  Expected Result: No tracked .db or .next files, audit.db still on disk, audit-schema.sql exists, tests pass
  Evidence: .sisyphus/evidence/task-2-db-check.txt, .sisyphus/evidence/task-2-next-check.txt

  Scenario: .gitignore properly covers artifact patterns
  Tool: Bash
  Preconditions: .gitignore updated
  Steps:
  1. grep -c "\.db" .gitignore && echo "HAS .db rule: OK"
  2. grep -c "\.next" .gitignore && echo "HAS .next rule: OK"
  3. Create a test .db file: touch test-artifact.db
  4. git status test-artifact.db | grep -q "untracked\|not currently tracked" && echo "gitignore working: OK" || echo "gitignore NOT working: FAIL"
  5. rm test-artifact.db
  Expected Result: Both rules present in .gitignore, new .db files are untracked
  Evidence: Terminal output captured
  ```
  **Commit**: YES
  - Message: `chore(repo): remove tracked .db and .next artifacts from git`
  - Files: (all untracked .db files), (all untracked .next files), `packages/opencode-model-manager/audit-schema.sql`
  - Pre-commit: verify `git ls-files "**/*.db"` is empty

---

- [ ] 3. Fix Shotgun Debugging Guard in Learning Engine (C5)
  **Finding**: C5 (attempt_number >= 3 triggers shotgun debugging instead of systematic analysis)
  **What to do**:
  - Read `packages/opencode-learning-engine/src/orchestration-advisor.js` around line 441
  - Identify the exact condition where `attempt_number >= 3` triggers blind retries
  - Replace the blind retry with a cool-down mechanism that:
    1. Logs a warning: "Shotgun debugging detected (attempt N). Switching to systematic analysis."
    2. Pauses automated fixes for that file
    3. Returns a diagnostic object with the error context for human/systematic review
  - Ensure the learning engine records failed attempts for future learning
  **Must NOT do**:
  - Must NOT remove the attempt tracking — it's valuable for learning
  - Must NOT change the interface/return type of the orchestration advisor
  - Must NOT add new dependencies
  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - Reason: Requires understanding of learning engine internals, but bounded scope
  - **Skills**: [`systematic-debugging`]
  - `systematic-debugging`: The skill's methodology should be encoded into the guard
  - **Skills Evaluated but Omitted**:
  - `clean-architecture`: Not a design overhaul, just a guard mechanism
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 2, 4, 5 (no file overlap)
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: Task 1 (baseline)
  **References**:
  - `packages/opencode-learning-engine/src/orchestration-advisor.js:441` — the shotgun debugging trigger point
  - `packages/opencode-learning-engine/src/index.js` — learning engine main entry, persistence
  - `AGENTS.md` "ANTI-PATTERNS → HIGH → Shotgun Debugging" — documents the expected behavior
  **Acceptance Criteria**:
  - [ ] `orchestration-advisor.js` no longer performs blind retries after `attempt_number >= 3`
  - [ ] A warning log is emitted when the threshold is reached
  - [ ] A diagnostic object is returned instead of a blind retry
  - [ ] `bun test packages/opencode-learning-engine/` passes
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Shotgun debugging guard activates at attempt 3
  Tool: Bash
  Preconditions: Learning engine code modified
  Steps:
  1. grep -n "attempt_number" packages/opencode-learning-engine/src/orchestration-advisor.js
  2. Assert: the condition at line ~441 now returns a diagnostic object, not a blind retry
  3. grep -c "systematic" packages/opencode-learning-engine/src/orchestration-advisor.js
  4. Assert: at least 1 occurrence of "systematic" in the file (indicating the guard logic)
  5. bun test packages/opencode-learning-engine/ 2>&1 | tail -10
  Expected Result: Guard logic present, no blind retry after threshold, tests pass
  Evidence: .sisyphus/evidence/task-3-guard.txt

  Scenario: Learning engine still records failed attempts
  Tool: Bash
  Preconditions: Guard mechanism implemented
  Steps:
  1. grep -n "attempt" packages/opencode-learning-engine/src/orchestration-advisor.js | head -20
  2. Assert: attempt tracking still exists (not removed)
  3. Assert: attempt_number is still incremented/logged
  Expected Result: Attempt tracking preserved, guard is additive not subtractive
  Evidence: grep output captured
  ```
  **Commit**: YES
  - Message: `fix(learning-engine): add shotgun debugging guard at attempt threshold`
  - Files: `packages/opencode-learning-engine/src/orchestration-advisor.js`
  - Pre-commit: `bun test packages/opencode-learning-engine/`

---

- [ ] 4. Add Pre-Commit Hooks for Artifact Prevention (H8)
  **Finding**: H8 (nothing prevents re-introducing tracked artifacts)
  **What to do**:
  - Install husky: `bun add -d husky`
  - Initialize husky: `bunx husky init`
  - Create pre-commit hook `.husky/pre-commit` that:
    1. Blocks any `.db` files from being committed
    2. Blocks any `.next/` directory files from being committed
    3. Blocks any `audit.db` from being committed
  - Add lint-staged configuration to `package.json` for additional file-type checks
  - Test the hook by attempting to stage a `.db` file and verifying it's blocked
  **Must NOT do**:
  - Must NOT add linting/formatting to the pre-commit hook (separate concern)
  - Must NOT modify any existing git hooks
  - Must NOT block commits for file types that are legitimately tracked
  **Recommended Agent Profile**:
  - **Category**: `quick`
  - Reason: Standard tool setup with clear steps
  - **Skills**: [`git-master`]
  - `git-master`: Git hook setup and verification
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 3, 5 (no file overlap)
  - **Parallel Group**: Wave 1 (but depends on Task 2 completing first)
  - **Blocks**: None
  - **Blocked By**: Task 2 (need clean git state before adding hooks)
  **References**:
  - `package.json` — add husky devDependency and lint-staged config
  - `.husky/` — hook directory (will be created by husky init)
  - `.gitignore` — reference for which patterns should be blocked
  **Acceptance Criteria**:
  - [ ] `.husky/pre-commit` file exists and is executable
  - [ ] Hook blocks `.db` file commits
  - [ ] Hook blocks `.next/` file commits
  - [ ] Normal commits (non-artifact) are not affected
  - [ ] `bun test` still passes
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Pre-commit hook blocks .db file
  Tool: Bash
  Preconditions: Husky initialized, hook installed, Task 2 completed
  Steps:
  1. touch test-block.db
  2. git add test-block.db
  3. git commit -m "test: should be blocked" 2>&1 | tee .sisyphus/evidence/task-4-hook-block.txt
  4. Assert: commit fails with message about .db files
  5. git reset HEAD test-block.db
  6. rm test-block.db
  Expected Result: Commit blocked, error message mentions .db artifacts
  Evidence: .sisyphus/evidence/task-4-hook-block.txt

  Scenario: Normal commit succeeds
  Tool: Bash
  Preconditions: Hook installed
  Steps:
  1. echo "# test" > test-normal.txt
  2. git add test-normal.txt
  3. git commit -m "test: hook allows normal files" 2>&1 | tee .sisyphus/evidence/task-4-hook-allow.txt
  4. Assert: commit succeeds (exit code 0)
  5. git reset --soft HEAD~1
  6. git reset HEAD test-normal.txt
  7. rm test-normal.txt
  Expected Result: Commit succeeds for non-artifact files
  Evidence: .sisyphus/evidence/task-4-hook-allow.txt
  ```
  **Commit**: YES
  - Message: `chore(ci): add husky pre-commit hooks to prevent artifact tracking`
  - Files: `.husky/pre-commit`, `package.json` (husky + lint-staged config)
  - Pre-commit: verify hook fires on test commit

---

- [ ] 5. Extract Shared Threshold Constants (H7)
  **Finding**: H7 (context budget thresholds hardcoded in 4+ packages)
  **What to do**:
  - Create `packages/opencode-context-governor/src/thresholds.js` with all context budget threshold constants:
    - `THRESHOLD_PROACTIVE_COMPRESS = 0.65` (from context-bridge.js)
    - `THRESHOLD_WARNING = 0.75` (from governor.js, alert-manager.js)
    - `THRESHOLD_CRITICAL = 0.80` (from governor.js, alert-manager.js, model-router-x)
    - `THRESHOLD_EMERGENCY = 0.95` (from alert-manager.js)
  - Update each consuming package to import from the shared source:
    - `packages/opencode-context-governor/src/index.js` — import WARNING/CRITICAL
    - `packages/opencode-integration-layer/src/context-bridge.js` — import PROACTIVE_COMPRESS
    - `packages/opencode-model-manager/src/monitoring/alert-manager.js` — import WARNING/CRITICAL/EMERGENCY
    - `packages/opencode-model-router-x/src/index.js` — import CRITICAL
  - Verify no behavior change: the numeric values must be identical to what was hardcoded
  **Must NOT do**:
  - Must NOT change any threshold values — this is a refactoring, not a tuning exercise
  - Must NOT change the threshold cascade order or logic
  - Must NOT add new thresholds that don't already exist
  **Recommended Agent Profile**:
  - **Category**: `quick`
  - Reason: Mechanical refactoring with clear pattern
  - **Skills**: [`clean-architecture`]
  - `clean-architecture`: Ensures clean constant extraction and import patterns
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 2, 3 (no file overlap with those)
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: Task 1 (baseline)
  **References**:
  - `packages/opencode-context-governor/src/index.js:86,90` — WARNING 75%, CRITICAL 80%
  - `packages/opencode-integration-layer/src/context-bridge.js` — 65% proactive compression
  - `packages/opencode-model-manager/src/monitoring/alert-manager.js` — 75%/80%/95% alerts
  - `packages/opencode-model-router-x/src/index.js` (T4) — 80% budget penalty
  - `AGENTS.md` "Context Management (Wave 11)" — documents the threshold cascade
  **Acceptance Criteria**:
  - [ ] `packages/opencode-context-governor/src/thresholds.js` exists with 4 exported constants
  - [ ] All 4 consuming packages import from shared source instead of hardcoding
  - [ ] `grep -r "0\\.75\|0\\.80\|0\\.65\|0\\.95" packages/opencode-context-governor/src/ packages/opencode-integration-layer/src/ packages/opencode-model-manager/src/monitoring/ packages/opencode-model-router-x/src/` only finds the `thresholds.js` file
  - [ ] `bun test` passes (no behavior change)
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Thresholds consolidated to single source
  Tool: Bash
  Preconditions: Refactoring complete
  Steps:
  1. test -f packages/opencode-context-governor/src/thresholds.js && echo "thresholds.js exists: OK" || echo "MISSING: FAIL"
  2. grep -c "THRESHOLD_" packages/opencode-context-governor/src/thresholds.js
  3. Assert: 4 or more threshold constants defined
  4. grep -rn "0\\.75\|0\\.80\|0\\.65\|0\\.95" packages/opencode-context-governor/src/ packages/opencode-integration-layer/src/ packages/opencode-model-manager/src/monitoring/ packages/opencode-model-router-x/src/ --include="*.js" | grep -v thresholds.js
  5. Assert: no hardcoded thresholds remain outside thresholds.js
  6. bun test 2>&1 | tail -5
  Expected Result: Single thresholds.js file, no hardcoded values elsewhere, tests pass
  Evidence: .sisyphus/evidence/task-5-thresholds.txt

  Scenario: Import paths work correctly
  Tool: Bash
  Preconditions: Imports updated
  Steps:
  1. grep -rn "from.*thresholds" packages/opencode-context-governor/src/ packages/opencode-integration-layer/src/ packages/opencode-model-manager/src/monitoring/ packages/opencode-model-router-x/src/ --include="*.js"
  2. Assert: 4+ import statements found
  3. bun test 2>&1 | tail -5
  Expected Result: All 4 packages import from thresholds.js, tests pass
  Evidence: grep output captured
  ```
  **Commit**: YES
  - Message: `refactor(context): extract shared threshold constants to single source`
  - Files: `packages/opencode-context-governor/src/thresholds.js`, `packages/opencode-context-governor/src/index.js`, `packages/opencode-integration-layer/src/context-bridge.js`, `packages/opencode-model-manager/src/monitoring/alert-manager.js`, `packages/opencode-model-router-x/src/index.js`
  - Pre-commit: `bun test`

---

- [ ] 6. Standardize Model Naming Format (H5)
  **Finding**: H5 (inconsistent model names across configs — short vs versioned)
  **What to do**:
  - Read all model references in `opencode-config/central-config.json`, `opencode-config/models.json`, `opencode-config/oh-my-opencode.json`
  - Establish canonical format: `provider/model-name` for current models, `provider/model-name@version` when version pinning is needed
  - Create a model ID mapping table in a new file `opencode-config/model-id-map.json`:
    ```json
    {
      "canonical": "openai/gpt-4o",
      "aliases": ["gpt-4o", "gpt-4o-2024-05-13"],
      "provider": "openai"
    }
    ```
  - Update all config files to use canonical model IDs
  - Create validation script `scripts/validate-model-ids.mjs` that checks all configs for non-canonical model IDs
  **Must NOT do**:
  - Must NOT change runtime model routing logic
  - Must NOT remove model aliases from the mapping (they may be needed for backward compatibility)
  - Must NOT change the actual API calls — only the config references
  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - Reason: Requires understanding model routing and config relationships
  - **Skills**: [`api-design-principles`]
  - `api-design-principles`: Naming convention design for API identifiers
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 7, 8
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7 (config validation needs canonical IDs)
  - **Blocked By**: Task 1 (baseline)
  **References**:
  - `opencode-config/central-config.json` — model routing tiers with model IDs
  - `opencode-config/models.json` — model catalog
  - `opencode-config/oh-my-opencode.json` — agent configs referencing models
  - `MODEL_AUDIT_REPORT.md` — documents naming inconsistencies and 39 models across 7 providers
  - `scripts/validate-models.mjs` — existing model validation (12 checks, can be extended)
  **Acceptance Criteria**:
  - [ ] `opencode-config/model-id-map.json` exists with canonical IDs for all 39 models
  - [ ] All config files use canonical model IDs
  - [ ] `scripts/validate-model-ids.mjs` exists and exits 0 when all IDs are canonical
  - [ ] `bun run setup` passes
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: All model IDs are canonical across configs
  Tool: Bash
  Preconditions: Model IDs standardized
  Steps:
  1. bun scripts/validate-model-ids.mjs 2>&1 | tee .sisyphus/evidence/task-6-model-ids.txt
  2. Assert: exit code 0, no non-canonical IDs found
  3. grep -c "canonical" opencode-config/model-id-map.json
  4. Assert: 39+ canonical entries (one per model)
  Expected Result: All model IDs canonical, mapping table complete, validation passes
  Evidence: .sisyphus/evidence/task-6-model-ids.txt

  Scenario: Model routing still works with canonical IDs
  Tool: Bash
  Preconditions: Configs updated with canonical IDs
  Steps:
  1. bun run setup 2>&1 | tail -5
  2. Assert: exit code 0
  3. bun test 2>&1 | tail -5
  4. Assert: exit code 0
  Expected Result: Setup and tests pass with new model IDs
  Evidence: Terminal output captured
  ```
  **Commit**: YES
  - Message: `refactor(models): standardize model naming format across all configs`
  - Files: `opencode-config/model-id-map.json`, `opencode-config/central-config.json`, `opencode-config/models.json`, `opencode-config/oh-my-opencode.json`, `scripts/validate-model-ids.mjs`
  - Pre-commit: `bun scripts/validate-model-ids.mjs`

---

- [ ] 7. Create Config Overlap Validation Script (C1 Prep)
  **Finding**: C1 (prep work — detect overlaps before consolidation)
  **What to do**:
  - Create `scripts/validate-config-overlaps.mjs` that:
    1. Reads all 6 JSON configs in `opencode-config/`
    2. Detects duplicate keys across configs (e.g., model IDs in both central-config.json and models.json)
    3. Detects agent definitions in both oh-my-opencode.json and agents.json
    4. Reports overlaps with severity (exact duplicate = ERROR, partial overlap = WARNING)
    5. Exits 0 if no overlaps, 1 if errors found
  - Run the script and capture the initial overlap report to `.sisyphus/evidence/task-7-overlaps.txt`
  - This report will inform Task 12 (config consolidation)
  **Must NOT do**:
  - Must NOT modify any config files — this is read-only analysis
  - Must NOT add new config validation to CI yet (that's Task 12's job)
  **Recommended Agent Profile**:
  - **Category**: `quick`
  - Reason: Script creation with clear input/output
  - **Skills**: []
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Task 8
  - **Parallel Group**: Wave 2 (but depends on Task 6 for canonical model IDs)
  - **Blocks**: Task 12 (needs overlap report)
  - **Blocked By**: Task 6 (canonical model IDs needed for accurate overlap detection)
  **References**:
  - `opencode-config/central-config.json` — model routing, budgets, agent categories
  - `opencode-config/oh-my-opencode.json` — plugin registry, skills, agent configs
  - `opencode-config/compound-engineering.json` — engineering workflow config
  - `opencode-config/models.json` — model catalog
  - `opencode-config/agents.json` — agent definitions
  - `opencode-config/learning-updates.json` — learning engine updates
  - `scripts/validate-models.mjs` — existing validation script pattern to follow
  **Acceptance Criteria**:
  - [ ] `scripts/validate-config-overlaps.mjs` exists and is executable
  - [ ] Script reads all 6 configs and reports overlaps
  - [ ] `.sisyphus/evidence/task-7-overlaps.txt` contains the overlap report
  - [ ] Script exits non-zero if exact duplicates found
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Config overlap script detects known overlaps
  Tool: Bash
  Preconditions: All config files present
  Steps:
  1. bun scripts/validate-config-overlaps.mjs 2>&1 | tee .sisyphus/evidence/task-7-overlaps.txt
  2. Assert: script runs without crashing
  3. grep -c "OVERLAP\|DUPLICATE\|ERROR" .sisyphus/evidence/task-7-overlaps.txt
  4. Assert: at least 1 overlap detected (we know they exist from the audit)
  5. echo "Exit code: $?"
  Expected Result: Script runs, detects known overlaps, reports them clearly
  Evidence: .sisyphus/evidence/task-7-overlaps.txt
  ```
  **Commit**: YES
  - Message: `chore(config): add config overlap validation script`
  - Files: `scripts/validate-config-overlaps.mjs`, `.sisyphus/evidence/task-7-overlaps.txt`
  - Pre-commit: `bun scripts/validate-config-overlaps.mjs`

---

- [ ] 8. Deduplicate Skill Registry (H4)
  **Finding**: H4 (skill definitions duplicated across opencode-config/skills/ and local/oh-my-opencode/skills/)
  **What to do**:
  - Inventory all skill files in both `opencode-config/skills/` and `local/oh-my-opencode/skills/`
  - For each duplicate skill name:
    1. Compare content — determine which is more current/complete
    2. If `local/oh-my-opencode/skills/` is the source of truth (plugin ecosystem), create symlinks from `opencode-config/skills/` to the canonical versions
    3. If `opencode-config/skills/` is the source of truth (loaded by OpenCode directly), mark the `local/` copies as secondary
  - Document which registry is canonical in AGENTS.md
  - Create `scripts/validate-skill-duplicates.mjs` to detect future drift
  **Must NOT do**:
  - Must NOT delete skill files — only deduplicate via symlinks or clear ownership
  - Must NOT change skill content — only establish which copy is authoritative
  - Must NOT break OpenCode's skill loading path
  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - Reason: Requires understanding skill loading order and OpenCode internals
  - **Skills**: []
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 6, 7
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 1 (baseline)
  **References**:
  - `opencode-config/skills/` — ~35+ active skill YAML/MD definitions
  - `local/oh-my-opencode/skills/` — ~40+ plugin ecosystem skill definitions
  - `opencode-config/oh-my-opencode.json` — plugin registry that defines skill loading
  - `AGENTS.md` — need to add canonical registry documentation
  **Acceptance Criteria**:
  - [ ] Duplicate skill names identified and documented
  - [ ] Canonical registry designated (documented in AGENTS.md)
  - [ ] `scripts/validate-skill-duplicates.mjs` exists and detects drift
  - [ ] `bun run setup` passes (skill loading still works)
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Skill deduplication validation
  Tool: Bash
  Preconditions: Skill registry deduplicated
  Steps:
  1. bun scripts/validate-skill-duplicates.mjs 2>&1 | tee .sisyphus/evidence/task-8-skills.txt
  2. Assert: script runs and reports 0 duplicate conflicts
  3. grep -c "canonical" AGENTS.md
  4. Assert: AGENTS.md mentions which skill registry is canonical
  5. bun run setup 2>&1 | tail -5
  6. Assert: exit code 0
  Expected Result: No skill duplicates, canonical registry documented, setup passes
  Evidence: .sisyphus/evidence/task-8-skills.txt
  ```
  **Commit**: YES
  - Message: `refactor(skills): deduplicate skill registry and designate canonical source`
  - Files: skill symlinks/deletions, `scripts/validate-skill-duplicates.mjs`, `AGENTS.md`
  - Pre-commit: `bun scripts/validate-skill-duplicates.mjs`

---

- [ ] 9. Reorganize Scripts Directory (H2)
  **Finding**: H2 (93 scripts in flat directory with no organization)
  **What to do**:
  - Create subdirectory structure under `scripts/`:
    - `scripts/governance/` — all `governance-*.mjs`, `learning-gate.mjs`, `deployment-state.mjs`
    - `scripts/models/` — `model-*.mjs`, `validate-models.mjs`
    - `scripts/deployment/` — `deploy-*.mjs`, `state-*.mjs`
    - `scripts/health/` — `health-*.mjs`, `check-*.mjs`
    - `scripts/validation/` — `validate-*.mjs` (general), `config-*.mjs`
    - `scripts/plugins/` — `plugin-*.mjs`, `install-*.mjs`
    - `scripts/utils/` — shared utilities
  - Move scripts to appropriate subdirectories
  - Update ALL npm script references in `package.json` to use new paths
  - Create `scripts/README.md` with a table of all scripts and their locations
  - Verify `bun run governance:check`, `bun run setup`, and all commonly-used scripts still work
  **Must NOT do**:
  - Must NOT change script content — only move files and update references
  - Must NOT move scripts that are imported by other scripts (check for relative imports first)
  - Must NOT break CI workflows that reference script paths
  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - Reason: Requires careful reference tracking across package.json and CI
  - **Skills**: [`git-master`]
  - `git-master`: Safe file moves with git mv, reference tracking
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 10, 11
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 1 (baseline)
  **References**:
  - `scripts/` — 93 .mjs files to organize
  - `package.json` — npm scripts referencing `scripts/*.mjs` paths (70+ scripts section)
  - `.github/workflows/` — CI workflows that may reference script paths
  **Acceptance Criteria**:
  - [ ] All scripts moved to subdirectories
  - [ ] `package.json` npm scripts updated with new paths
  - [ ] `scripts/README.md` exists with complete table
  - [ ] `bun run governance:check` works
  - [ ] `bun run setup` works
  - [ ] `bun run models:sync` works (if it references scripts)
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Script reorganization preserves all npm commands
  Tool: Bash
  Preconditions: Scripts moved, package.json updated
  Steps:
  1. bun run governance:check 2>&1 | tail -3
  2. Assert: exit code 0
  3. bun run setup 2>&1 | tail -3
  4. Assert: exit code 0
  5. ls scripts/governance/ scripts/models/ scripts/health/ 2>&1 | tee .sisyphus/evidence/task-9-scripts.txt
  6. Assert: subdirectories contain scripts
  7. test -f scripts/README.md && echo "README exists: OK" || echo "MISSING: FAIL"
  8. bun test 2>&1 | tail -5
  Expected Result: All npm commands work, subdirectories populated, README exists, tests pass
  Evidence: .sisyphus/evidence/task-9-scripts.txt
  ```
  **Commit**: YES
  - Message: `refactor(scripts): reorganize scripts directory into subdirectories`
  - Files: `scripts/` (moved files), `package.json` (updated paths), `scripts/README.md`
  - Pre-commit: `bun run governance:check`

---

- [ ] 10. Standardize Test Organization Pattern (H3, M3)
  **Finding**: H3 (inconsistent test patterns), M3 (missing test infrastructure in some packages)
  **What to do**:
  - Define canonical test pattern: `__tests__/` directory adjacent to source files (consistent with Bun test conventions)
  - Document this pattern in AGENTS.md under "CONVENTIONS"
  - For packages with existing tests in non-standard locations:
    1. Move `*.test.js` files from source level to `__tests__/` directory
    2. Update test imports if needed
  - For packages without tests:
    1. Add `__tests__/` directory with a smoke test file
    2. Smoke test should at minimum: import the package's main export and verify it's not undefined
  - Focus on packages with zero tests first: `opencode-dashboard`, `opencode-crash-guard`, and other small packages
  **Must NOT do**:
  - Must NOT rewrite existing tests — only relocate them
  - Must NOT add comprehensive test coverage (that's a separate effort)
  - Must NOT change test framework (stick with Bun test)
  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - Reason: Multiple packages to update, import path adjustments
  - **Skills**: [`clean-architecture`]
  - `clean-architecture`: Test organization and import patterns
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 9, 11
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 1 (baseline)
  **References**:
  - `packages/opencode-model-manager/` — has tests (use as reference pattern)
  - `packages/opencode-context-governor/` — has tests (use as reference pattern)
  - `packages/opencode-dashboard/` — NO tests (add smoke test)
  - `packages/opencode-crash-guard/` — likely no tests (add smoke test)
  - `bunfig.toml` — Bun test configuration
  - `AGENTS.md` — add test pattern documentation
  **Acceptance Criteria**:
  - [ ] AGENTS.md documents canonical `__tests__/` test pattern
  - [ ] All existing test files relocated to `__tests__/` directories
  - [ ] At least 3 packages that had zero tests now have smoke tests
  - [ ] `bun test` passes with all relocated and new tests
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Test standardization preserves existing test results
  Tool: Bash
  Preconditions: Tests relocated, new smoke tests added
  Steps:
  1. bun test 2>&1 | tee .sisyphus/evidence/task-10-tests.txt
  2. Assert: exit code 0, test count >= previous baseline count
  3. grep -c "__tests__" .sisyphus/evidence/task-10-tests.txt
  4. Assert: test runner finds __tests__ directories
  5. grep -rn "test pattern\|__tests__" AGENTS.md | head -5
  6. Assert: AGENTS.md documents the canonical pattern
  Expected Result: Tests pass, count preserved or increased, AGENTS.md updated
  Evidence: .sisyphus/evidence/task-10-tests.txt
  ```
  **Commit**: YES
  - Message: `refactor(tests): standardize test organization to __tests__ pattern`
  - Files: test file moves, new smoke tests, `AGENTS.md`
  - Pre-commit: `bun test`

---

- [ ] 11. Consolidate AGENTS.md Shared Sections (H1, M4)
  **Finding**: H1 (30+ AGENTS.md files — maintenance burden), M4 (20+ root-level markdown files)
  **What to do**:
  - Identify sections that appear in 5+ AGENTS.md files (e.g., Bun version, test commands, anti-patterns)
  - Extract shared sections into `AGENTS.shared.md` at the repo root
  - Update each AGENTS.md to use a reference: `> See [AGENTS.shared.md](../../AGENTS.shared.md) for shared conventions`
  - Only keep package-specific information in subdirectory AGENTS.md files
  - Move non-essential root-level markdown files to `docs/` directory:
    - Move: `STATUS.md`, `COMPLETE-INVENTORY.md`, `MODEL_AUDIT_REPORT.md`, and other status/report docs
    - Keep at root: `README.md`, `AGENTS.md`, `AGENTS.shared.md`
  **Must NOT do**:
  - Must NOT delete any AGENTS.md files — only consolidate shared content
  - Must NOT remove package-specific information from subdirectory AGENTS.md files
  - Must NOT move files that are referenced by CI scripts without updating references
  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - Reason: Multi-file consolidation with reference tracking
  - **Skills**: [`writing`]
  - `writing`: Documentation organization and restructuring
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 9, 10
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 1 (baseline)
  **References**:
  - `AGENTS.md` (root) — primary convention document
  - `local/oh-my-opencode/AGENTS.md` — plugin ecosystem conventions
  - Various subdirectory AGENTS.md files (~30 total)
  - Root-level `.md` files (20+ to evaluate for moving)
  - `scripts/` — may reference some markdown files in governance scripts
  **Acceptance Criteria**:
  - [ ] `AGENTS.shared.md` exists at repo root with shared convention sections
  - [ ] Subdirectory AGENTS.md files reference `AGENTS.shared.md` for shared content
  - [ ] Non-essential root `.md` files moved to `docs/`
  - [ ] `bun run setup` passes (no broken markdown references)
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: AGENTS.md consolidation reduces duplication
  Tool: Bash
  Preconditions: Consolidation complete
  Steps:
  1. test -f AGENTS.shared.md && echo "AGENTS.shared.md exists: OK" || echo "MISSING: FAIL"
  2. grep -rn "AGENTS.shared.md" --include="AGENTS.md" . 2>/dev/null | wc -l
  3. Assert: 5+ AGENTS.md files reference the shared file
  4. ls docs/ 2>/dev/null | wc -l
  5. Assert: docs/ directory has moved files
  6. bun run setup 2>&1 | tail -5
  7. Assert: exit code 0
  Expected Result: Shared conventions file exists, sub-AGENTS.md files reference it, docs moved, setup passes
  Evidence: .sisyphus/evidence/task-11-agents.txt
  ```
  **Commit**: YES
  - Message: `docs(agents): consolidate shared AGENTS.md sections and reorganize root docs`
  - Files: `AGENTS.shared.md`, subdirectory AGENTS.md updates, moved root `.md` files
  - Pre-commit: `bun run setup`

---

- [ ] 12. Consolidate Config Files (C1)
  **Finding**: C1 (6+ overlapping JSON configs with no single source of truth)
  **What to do**:
  - Based on overlap report from Task 7, consolidate configs:
    1. **Merge `agents.json` INTO `oh-my-opencode.json`** — agents and plugins belong together
    2. **Merge `models.json` INTO `central-config.json`** — model routing and catalog belong together
    3. **Keep `compound-engineering.json` separate** — engineering workflow is a distinct domain
    4. **Keep `learning-updates.json` separate** — learning engine updates are distinct
  - After merging:
    - `central-config.json` = models + routing + budgets + agent categories
    - `oh-my-opencode.json` = plugins + skills + agent definitions
    - `compound-engineering.json` = engineering workflows (unchanged)
    - `learning-updates.json` = learning updates (unchanged)
  - Update all code that reads from `agents.json` or `models.json` to read from the consolidated files
  - Add schema versioning to `central-config.json` and `oh-my-opencode.json`
  - Delete `agents.json` and `models.json` after migration is verified
  - Update `scripts/validate-config-overlaps.mjs` to check the new structure
  **Must NOT do**:
  - Must NOT change any runtime behavior — only move config data between files
  - Must NOT change the JSON structure of individual entries (only their location)
  - Must NOT delete config files until all consumers are verified
  - Must NOT merge `compound-engineering.json` or `learning-updates.json` — they're already distinct
  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
  - Reason: Complex config consolidation with multiple consumers, needs careful dependency tracking
  - **Skills**: [`architecture-design`]
  - `architecture-design`: Config architecture decisions and trade-off evaluation
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Task 13
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Task 7 (needs overlap report)
  **References**:
  - `opencode-config/central-config.json` — target for model catalog merge
  - `opencode-config/oh-my-opencode.json` — target for agent definitions merge
  - `opencode-config/agents.json` — source to merge into oh-my-opencode.json
  - `opencode-config/models.json` — source to merge into central-config.json
  - `opencode-config/compound-engineering.json` — keep separate
  - `opencode-config/learning-updates.json` — keep separate
  - `scripts/validate-config-overlaps.mjs` — update for new structure
  - `.sisyphus/evidence/task-7-overlaps.txt` — overlap analysis from Task 7
  **Acceptance Criteria**:
  - [ ] `opencode-config/agents.json` no longer exists (merged into oh-my-opencode.json)
  - [ ] `opencode-config/models.json` no longer exists (merged into central-config.json)
  - [ ] All code that previously read from deleted configs now reads from consolidated files
  - [ ] Schema versioning added to `central-config.json` and `oh-my-opencode.json`
  - [ ] `bun scripts/validate-config-overlaps.mjs` exits 0 (no overlaps remaining)
  - [ ] `bun test` passes
  - [ ] `bun run setup` passes
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Config consolidation eliminates overlaps
  Tool: Bash
  Preconditions: Configs merged, consumers updated
  Steps:
  1. test -f opencode-config/agents.json && echo "agents.json still exists: FAIL" || echo "agents.json removed: OK"
  2. test -f opencode-config/models.json && echo "models.json still exists: FAIL" || echo "models.json removed: OK"
  3. bun scripts/validate-config-overlaps.mjs 2>&1 | tee .sisyphus/evidence/task-12-configs.txt
  4. Assert: exit code 0, no overlaps
  5. grep "version" opencode-config/central-config.json | head -1
  6. Assert: version field present
  7. bun test 2>&1 | tail -5
  8. bun run setup 2>&1 | tail -5
  Expected Result: Old configs gone, no overlaps, versioning present, tests and setup pass
  Evidence: .sisyphus/evidence/task-12-configs.txt
  ```
  **Commit**: YES
  - Message: `refactor(config): consolidate agents.json and models.json into primary configs`
  - Files: `opencode-config/central-config.json`, `opencode-config/oh-my-opencode.json`, consumer updates
  - Pre-commit: `bun scripts/validate-config-overlaps.mjs && bun test`

---

- [ ] 13. Resolve @jackoatmon/ Plugin Loading (C3)
  **Finding**: C3 (8 custom plugins built but can't load — OpenCode tries npm install for unpublished packages)
  **What to do**:
- **Strategy chosen: Local path resolution (Option A)** — User confirmed
- Investigate OpenCode's plugin loading mechanism to find where `npm install` is triggered
- Modify the plugin loader to support `file:` protocol or local paths for @jackoatmon/ packages
- Map each @jackoatmon/ package name to its local directory via workspaces config
- Add local path resolution logic: if package exists in workspaces, resolve locally instead of npm install
- Verify the 8 @jackoatmon/ plugins load successfully after modification
**Must NOT do**:
- Must NOT break the 12 working npm plugins
- Must NOT fall back to npm publish or symlinks — local path resolution is the committed strategy
- Must NOT modify plugin loader in a way that affects non-@jackoatmon/ packages
  **Recommended Agent Profile**:
  - **Category**: `deep`
  - Reason: Requires deep investigation of OpenCode's plugin loader internals before choosing strategy
  - **Skills**: [`architecture-design`]
  - `architecture-design`: Plugin architecture decision with trade-offs
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Task 12
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Task 1 (baseline)
  **References**:
  - `opencode-config/oh-my-opencode.json` — plugin registry listing @jackoatmon/ plugins
  - `STATUS.md` — documents the known issue (8 plugins can't load)
  - `plugins/` — external plugin directory
  - `local/oh-my-opencode/` — plugin source code
  - `package.json` — workspaces config showing local/* inclusion
**Acceptance Criteria**:
- [ ] Plugin loader modified to support local path resolution for @jackoatmon/ packages
- [ ] The 8 @jackoatmon/ plugins load successfully via local path resolution
- [ ] The 12 npm plugins still load correctly
- [ ] `bun run setup` passes
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Plugin loading resolution works
  Tool: Bash
  Preconditions: Strategy implemented
  Steps:
  1. bun run setup 2>&1 | tee .sisyphus/evidence/task-13-plugins.txt
  2. Assert: exit code 0
  3. grep -c "jackoatmon\|plugin.*loaded\|plugin.*error" .sisyphus/evidence/task-13-plugins.txt
  4. Assert: either plugins loaded successfully, or properly removed from registry
  5. Verify 12 npm plugins still work by checking their entries in the plugin registry
  Expected Result: Plugin loading issue resolved or properly mitigated, setup passes
  Evidence: .sisyphus/evidence/task-13-plugins.txt
  ```
  **Commit**: YES
  - Message: `fix(plugins): resolve @jackoatmon/ custom plugin loading path`
  - Files: depends on chosen strategy
  - Pre-commit: `bun run setup`

---

- [ ] 14. Migrate Safe Packages to ESM (C4)
  **Finding**: C4 (mixed CJS/ESM — root is commonjs, ~10 packages are module)
  **What to do**:
  - Identify packages currently using `"type": "commonjs"` or no type field
  - For each CJS package:
    1. Add `"type": "module"` to package.json
    2. Convert `require()` → `import`, `module.exports` → `export`
    3. Add `.js` extensions to relative imports (required for ESM)
    4. Run `bun test <package>` to verify
  - Start with the simplest packages (fewest imports) and work toward more complex ones
  - Do NOT change root package.json yet — that requires all packages to be ESM first
  - Document each migration in the commit message
  **Must NOT do**:
  - Must NOT migrate packages that have CJS-specific dependencies that break with ESM
  - Must NOT change the root package.json to `"type": "module"` until ALL packages are verified ESM
  - Must NOT use `.mjs`/`.cjs` extensions as a workaround — clean migration or none
  - Must NOT migrate `opencode-sisyphus-state` (347 files, too risky for this pass)
  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
  - Reason: Careful module system migration with per-package verification
  - **Skills**: [`clean-architecture`]
  - `clean-architecture`: Module system consistency, import patterns
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Task 15
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: Task 1 (baseline)
  **References**:
  - `package.json` (root) — currently `"type": "commonjs"`
  - `packages/opencode-context-governor/package.json` — may already be ESM (verify)
  - `packages/opencode-model-manager/package.json` — likely CJS (verify)
  - `packages/opencode-learning-engine/package.json` — check type field
  - `packages/opencode-sisyphus-state/` — DO NOT MIGRATE (too large, skip)
  - `AGENTS.md` — documents mixed module system as known issue
  **Acceptance Criteria**:
  - [ ] At least 3 CJS packages successfully migrated to ESM
  - [ ] Each migrated package: `bun test <package>` passes
  - [ ] Root package.json still `"type": "commonjs"` (not changed yet)
  - [ ] `opencode-sisyphus-state` NOT migrated (explicitly excluded)
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: ESM migration preserves package functionality
  Tool: Bash
  Preconditions: Package migrated
  Steps:
  1. For each migrated package: grep '"type": "module"' packages/<name>/package.json
  2. Assert: type field is "module"
  3. bun test packages/<name>/ 2>&1 | tail -5
  4. Assert: tests pass
  5. grep -rn "require(" packages/<name>/src/ --include="*.js" | head -5
  6. Assert: no require() calls remain (fully ESM)
  Expected Result: Packages use ESM, no require() calls, tests pass
  Evidence: .sisyphus/evidence/task-14-esm.txt
  ```
  **Commit**: YES (one commit per package migrated)
  - Message: `refactor(<package>): migrate from CJS to ESM module system`
  - Files: package.json + all .js files in migrated package
  - Pre-commit: `bun test <package>`

---

- [ ] 15. Audit Governance Scripts (H6)
  **Finding**: H6 (44 governance/validation scripts — likely over-engineered)
  **What to do**:
  - Create `scripts/governance/audit-governance.mjs` that:
    1. Runs each governance script and records: exit code, execution time, and output
    2. Classifies scripts by function: validation, enforcement, reporting, deprecated
    3. Identifies scripts that always pass (no-op) or always fail (broken)
    4. Identifies scripts with overlapping checks
  - Based on audit results, create a deprecation plan:
    1. Mark no-op scripts as deprecated (add `// DEPRECATED: reason` header)
    2. Document which scripts are essential vs optional
    3. Update `bun run governance:check` to only run essential scripts by default
  **Must NOT do**:
  - Must NOT delete any governance scripts — only deprecate and document
  - Must NOT change governance script behavior
  - Must NOT remove scripts from CI without a measurable justification
  **Recommended Agent Profile**:
  - **Category**: `deep`
  - Reason: Requires running and analyzing 44 scripts systematically
  - **Skills**: []
  **Parallelization**:
  - **Can Run In Parallel**: YES — with Task 14
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: Task 1 (baseline)
  **References**:
  - `scripts/` — 44 governance/validation .mjs files
  - `package.json` — `governance:check` npm script
  - `.github/workflows/ci.yml` — CI workflow that may run governance scripts
  **Acceptance Criteria**:
  - [ ] `scripts/governance/audit-governance.mjs` exists and produces a report
  - [ ] Governance scripts classified: essential / optional / deprecated
  - [ ] `bun run governance:check` still works after any changes
  - [ ] At least 3 scripts marked as deprecated with justification
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Governance audit produces actionable report
  Tool: Bash
  Preconditions: Audit script created
  Steps:
  1. bun scripts/governance/audit-governance.mjs 2>&1 | tee .sisyphus/evidence/task-15-governance.txt
  2. Assert: script runs and produces a report
  3. grep -c "essential\|optional\|deprecated\|no-op" .sisyphus/evidence/task-15-governance.txt
  4. Assert: at least 10 classifications
  5. bun run governance:check 2>&1 | tail -5
  6. Assert: exit code 0
  Expected Result: Governance audit report produced, scripts classified, governance:check still works
  Evidence: .sisyphus/evidence/task-15-governance.txt
  ```
  **Commit**: YES
  - Message: `chore(governance): audit governance scripts and deprecate no-ops`
  - Files: `scripts/governance/audit-governance.mjs`, deprecated script headers
  - Pre-commit: `bun run governance:check`

---

- [ ] 16. Replace audit.db with Schema-First Approach (C6 Follow-up)
  **Finding**: C6 (follow-up — production database replaced with schema migration)
  **What to do**:
  - Verify `audit-schema.sql` exists from Task 2
  - Create `packages/opencode-model-manager/scripts/init-audit-db.mjs`:
    1. Reads `audit-schema.sql`
    2. Creates `audit.db` if it doesn't exist
    3. Runs schema migration if DB schema is outdated
  - Update `packages/opencode-model-manager/src/lifecycle/audit-logger.js`:
    1. On startup, check if `audit.db` exists
    2. If not, call init script to create it
    3. Verify hash chain integrity on existing DBs
  - Add `audit.db` to `.gitignore` (if not already there after Task 2)
  - Test by deleting `audit.db`, running the system, and verifying it's recreated
  **Must NOT do**:
  - Must NOT delete the existing `audit.db` from disk during this task
  - Must NOT change the audit log schema (only extract and operationalize it)
  - Must NOT break the hash chain integrity of existing audit logs
  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - Reason: Database initialization logic, but bounded scope
  - **Skills**: [`database-design`]
  - `database-design`: Schema migration and initialization patterns
  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 2
  - **Parallel Group**: Wave 6 (final)
  - **Blocks**: None
  - **Blocked By**: Task 2 (artifact removal must complete first)
  **References**:
  - `packages/opencode-model-manager/audit-schema.sql` — created in Task 2
  - `packages/opencode-model-manager/src/lifecycle/audit-logger.js` — audit log writer, creates tables
  - `AGENTS.md` "SQLite in Packages" — documents the anti-pattern
  **Acceptance Criteria**:
  - [ ] `packages/opencode-model-manager/scripts/init-audit-db.mjs` exists
  - [ ] Deleting `audit.db` and running the system recreates it from schema
  - [ ] `audit.db` is in `.gitignore`
  - [ ] `bun test packages/opencode-model-manager/` passes
  **Agent-Executed QA Scenarios**:
  ```
  Scenario: audit.db auto-creates from schema on first run
  Tool: Bash
  Preconditions: Task 2 completed, audit-schema.sql exists
  Steps:
  1. mv packages/opencode-model-manager/audit.db packages/opencode-model-manager/audit.db.bak
  2. bun packages/opencode-model-manager/scripts/init-audit-db.mjs 2>&1 | tee .sisyphus/evidence/task-16-schema.txt
  3. Assert: exit code 0
  4. test -f packages/opencode-model-manager/audit.db && echo "audit.db created: OK" || echo "audit.db not created: FAIL"
  5. mv packages/opencode-model-manager/audit.db.bak packages/opencode-model-manager/audit.db
  6. bun test packages/opencode-model-manager/ 2>&1 | tail -5
  Expected Result: audit.db created from schema, original restored, tests pass
  Evidence: .sisyphus/evidence/task-16-schema.txt
  ```
  **Commit**: YES
  - Message: `feat(model-manager): add schema-first audit.db initialization`
  - Files: `packages/opencode-model-manager/scripts/init-audit-db.mjs`, `packages/opencode-model-manager/src/lifecycle/audit-logger.js`
  - Pre-commit: `bun test packages/opencode-model-manager/`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | (no commit — read-only) | — | — |
| 2 | `chore(repo): remove tracked .db and .next artifacts from git` | untracked .db/.next files, audit-schema.sql | `git ls-files "**/*.db"` empty |
| 3 | `fix(learning-engine): add shotgun debugging guard at attempt threshold` | orchestration-advisor.js | `bun test packages/opencode-learning-engine/` |
| 4 | `chore(ci): add husky pre-commit hooks to prevent artifact tracking` | .husky/pre-commit, package.json | Hook blocks .db commit |
| 5 | `refactor(context): extract shared threshold constants to single source` | thresholds.js + 4 consumers | `bun test` |
| 6 | `refactor(models): standardize model naming format across all configs` | model-id-map.json, configs, validate-model-ids.mjs | `bun scripts/validate-model-ids.mjs` |
| 7 | `chore(config): add config overlap validation script` | validate-config-overlaps.mjs | `bun scripts/validate-config-overlaps.mjs` |
| 8 | `refactor(skills): deduplicate skill registry and designate canonical source` | skill symlinks, validate-skill-duplicates.mjs, AGENTS.md | `bun scripts/validate-skill-duplicates.mjs` |
| 9 | `refactor(scripts): reorganize scripts directory into subdirectories` | scripts/ moves, package.json, scripts/README.md | `bun run governance:check` |
| 10 | `refactor(tests): standardize test organization to __tests__ pattern` | test moves, smoke tests, AGENTS.md | `bun test` |
| 11 | `docs(agents): consolidate shared AGENTS.md sections and reorganize root docs` | AGENTS.shared.md, AGENTS.md updates, moved docs | `bun run setup` |
| 12 | `refactor(config): consolidate agents.json and models.json into primary configs` | central-config.json, oh-my-opencode.json, consumers | `bun scripts/validate-config-overlaps.mjs && bun test` |
| 13 | `fix(plugins): resolve @jackoatmon/ custom plugin loading path` | depends on strategy | `bun run setup` |
| 14 | `refactor(<pkg>): migrate from CJS to ESM module system` | package + package.json per package | `bun test <package>` |
| 15 | `chore(governance): audit governance scripts and deprecate no-ops` | audit-governance.mjs, deprecated headers | `bun run governance:check` |
| 16 | `feat(model-manager): add schema-first audit.db initialization` | init-audit-db.mjs, audit-logger.js | `bun test packages/opencode-model-manager/` |

---

## Success Criteria

### Verification Commands

```bash
# V1: No tracked artifacts
git ls-files "**/*.db"          # Expected: empty output
git ls-files "**/.next/**"       # Expected: empty output

# V2: All tests pass
bun test                         # Expected: exit code 0

# V3: Setup succeeds
bun run setup                    # Expected: exit code 0

# V4: Governance passes
bun run governance:check         # Expected: exit code 0

# V5: No config overlaps
bun scripts/validate-config-overlaps.mjs  # Expected: exit code 0

# V6: Model IDs canonical
bun scripts/validate-model-ids.mjs        # Expected: exit code 0

# V7: No skill duplicates
bun scripts/validate-skill-duplicates.mjs # Expected: exit code 0

# V8: Pre-commit hooks active
test -f .husky/pre-commit        # Expected: file exists
```

### Final Checklist

- [ ] All 6 Critical findings remediated (C1-C6)
- [ ] All 8 High findings remediated (H1-H8)
- [ ] 3 of 4 Medium findings remediated (M1, M3, M4; M2 deferred)
- [ ] Zero tracked artifact files in git
- [ ] Pre-commit hooks prevent artifact re-introduction
- [ ] Config layer consolidated from 6→4 files with clear ownership
- [ ] Shared threshold constants replace all hardcoded values
- [ ] Shotgun debugging guard active in learning engine
- [ ] Scripts directory organized with subdirectories
- [ ] Test organization standardized across packages
- [ ] Skill registry has single canonical source
- [ ] Model naming consistent across all configs
- [ ] AGENTS.md shared sections consolidated
- [ ] All baseline verification commands pass
