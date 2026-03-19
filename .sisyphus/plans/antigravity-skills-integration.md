# Antigravity Skills Integration: Selective Import with Semantic Matching & Full Synergy Wiring

## TL;DR

> **Quick Summary**: Selectively import 54 high-quality skills from the antigravity-awesome-skills repository (1,272 total) into our 25-skill ecosystem, fixing 5 architectural blockers first, adding a semantic matching layer to eliminate keyword-only triggering gaps, and fully wiring interconnections (synergies, dependencies, conflicts, workflow profiles).
> 
> **Deliverables**:
> - 5 architectural blocker fixes in SkillRL/SkillBank/LearningEngine
> - Synonym/domain-heuristic semantic matching layer (zero runtime cost, no ML)
> - 54 new skills imported with full registry.json wiring
> - Updated workflow profiles and bundle-based role profiles
> - Updated governance scripts for scale
> - Full regression test suite
> 
> **Estimated Effort**: XL (16 tasks, 4 waves)
> **Parallel Execution**: YES — 4 waves with internal parallelism
> **Critical Path**: Task 1 → Task 3 → Task 7 → Task 8 → Task 10 → Task 11 → Task 12

---

## Context

### Original Request
User requested deep analysis of the antigravity-awesome-skills repository (https://github.com/sickn33/antigravity-awesome-skills.git, 1,272 skills, v8.2.0, MIT) for integration into the opencode-setup monorepo. Key requirements: (1) determine wholesale vs selective integration, (2) ensure full synergy and multi-skill workflow linkage, (3) upgrade skill triggering beyond keyword-only to include abstracted semantic recognition.

### Interview Summary
**Key Discussions**:
- **Scope**: Selective — 54 must-have skills (not wholesale 1,272). Audit identified 14 exact duplicates, 45-60 functional duplicates, 10-15 irrelevant.
- **Semantic matching**: Synonym lookup tables + domain heuristics (zero runtime cost, deterministic, no ML/embeddings/API).
- **Interconnections**: Auto-infer from category/tag similarity + manual override for critical paths.
- **Cold start**: Tiered success_rate defaults (not flat 0.75) to prevent match-all fallback.
- **Testing**: TDD (RED-GREEN-REFACTOR) for architectural fixes and matching logic.
- **Bundles**: Import relevant bundles from antigravity's `data/bundles.json` as new workflow profiles.
- **Format**: Convert antigravity SKILL.md (YAML frontmatter) → our SKILL.md + registry.json entries.

**Research Findings**:
- Oracle: 1,272 wholesale is BLOCKER. Max safe = 50-100 for quality. 54 aligns perfectly.
- Oracle: 5 architectural blockers must be fixed BEFORE any import.
- Explore: 54 must-have skills across 10 domains (architecture, security, devops, data/AI, frontend, backend, database, product, testing, code quality).
- Metis: Identified SKILL_AFFINITY hardcoding as 5th blocker, UCB cold-start explosion, toxic combination of flat success_rate + fallback, YAML parser fragility, profile blindness, seed name collisions, and avoidWhen non-enforcement.

### Metis Review
**Identified Gaps** (all addressed in plan):
1. **SKILL_AFFINITY hardcoded routing** → Task 5: Make registry-sourced
2. **UCB cold-start explosion** → Task 3: Dampening for new skills
3. **Toxic combination** (0.75 default + >0.7 fallback) → Tasks 1 & 2: Remove fallback + tiered defaults
4. **YAML parser fragility** → Task 10: Proper YAML parser
5. **Profile blindness** → Task 9: Update profiles with new skills
6. **Seed name collisions** → Task 2: Handle in syncWithRegistry
7. **avoidWhen not enforced** → Task 1: Add to _matchesContext

---

## Work Objectives

### Core Objective
Transform the skill ecosystem from a 25-skill keyword-matched system into a 79-skill semantically-aware system with full synergy wiring, without regressing proven skill selection quality.

### Concrete Deliverables
- Fixed `_matchesContext()` with semantic matching layer
- Fixed `syncWithRegistry()` with tiered defaults + seed collision handling
- Fixed UCB with cold-start dampening
- Configurable `querySkills()` cap (raised to 10)
- Registry-sourced `SKILL_AFFINITY` routing
- `opencode-config/skills/semantic-matching/synonyms.json` — concept synonym table
- `opencode-config/skills/semantic-matching/domain-signals.json` — domain heuristic signals
- 54 new `opencode-config/skills/{name}/SKILL.md` files
- Updated `opencode-config/skills/registry.json` with 54 new entries + interconnections
- Updated `skill-orchestrator-runtime/SKILL.md` with new skill references in profiles
- Updated governance scripts for 79-skill scale
- New import validator script
- Full test coverage for all changes

### Definition of Done
- [ ] `bun test` passes with 0 failures
- [ ] `node scripts/check-skill-overlap-governance.mjs` exits 0 with 79 skills
- [ ] `_matchesContext({description: "fix intermittent test failures"})` matches debugging skills (semantic gap closed)
- [ ] `advise({task_type: "security"})` returns at least 1 imported skill in routing.skills
- [ ] No imported skill matches ALL tasks via fallback (toxic combination eliminated)
- [ ] UCB does not push proven skills below rank 5 after 54 imports at usage_count=0

### Must Have
- All 5 blockers fixed before any skill import
- Semantic matching as additive layer (existing keyword matching preserved)
- TDD for all architectural changes
- Governance pass after each wave
- Full interconnection wiring (synergies, dependencies, conflicts) for all 54 skills
- Workflow profile updates

### Must NOT Have (Guardrails)
- No ML models, embeddings, vector search, or external API calls for matching
- No changes to persistence format (export/import in skill-bank.js:364-386)
- No removal of querySkills cap — make configurable, not unlimited
- No new governance scripts beyond updating existing 3 + max 1 new import validator
- No wholesale 1,272 skill import — 54 curated only
- No dynamic profile generation — add to existing 7 profiles only
- No separate data store for interconnection graph — registry.json fields only
- No changes to SKILL_AFFINITY algorithm — same structure, just data-driven source

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
> ALL verification is agent-executed using bun test, Bash commands, and file assertions.

### Test Decision
- **Infrastructure exists**: YES (bun test, 253 tests, 1,676 assertions)
- **Automated tests**: TDD (RED-GREEN-REFACTOR)
- **Framework**: bun test (Bun's built-in test framework)

### Test File Locations
- SkillRL tests: `packages/opencode-skill-rl-manager/test/` (existing: `exploration-adapter.test.js`, `exploration-policy.test.js`) + `packages/opencode-skill-rl-manager/tests/` (existing: `tool-affinities.test.js`)
- Integration tests: `integration-tests/bootstrap-e2e.test.js`
- **NEW test file to create**: `packages/opencode-skill-rl-manager/test/selection.test.js` — Created in Task 1 for all selection/matching tests (fallback removal, avoidWhen, tiered defaults, UCB dampening, configurable cap, semantic matching)

### Agent-Executed QA (MANDATORY — ALL tasks)
Every task includes specific bun test assertions + Bash verification commands. No human testing.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1a (Start Immediately — Fix Blockers, Independent):
├── Task 1: Fix _matchesContext() fallback + avoidWhen
├── Task 2: Fix syncWithRegistry() defaults + seed collisions
├── Task 4: Fix querySkills() cap — configurable top-K
└── Task 5: Fix SKILL_AFFINITY — registry-sourced routing

Wave 1b (After Wave 1a — Dependent Fixes):
├── Task 3: Fix UCB cold-start dampening [depends: 2]
└── Task 6: Fix epsilon-greedy weighted injection [depends: 4]

Wave 2 (After Wave 1 — Semantic Layer, Sequential):
├── Task 7: Build synonym tables + domain heuristic data [depends: 1]
├── Task 8: Integrate semantic matching into _matchesContext() [depends: 7]
└── Task 9: Update orchestrator profiles + scoring [depends: 8]

Wave 3 (After Wave 2 — Import Pipeline, Sequential):
├── Task 10: Build robust YAML frontmatter parser [depends: none in wave]
├── Task 11: Build format converter + import pipeline [depends: 10]
├── Task 12: Import 54 skills + wire interconnections [depends: 11]
└── Task 13: Import bundles as workflow profiles [depends: 12]

Wave 4 (After Wave 3 — Governance & Validation):
├── Task 14: Update governance scripts + import validator [depends: 12]
├── Task 15: Fix ExplorationRLAdapter field mismatch [depends: none]
└── Task 16: Full regression suite + performance benchmarks [depends: 14, 15]

Critical Path: Task 1 → Task 7 → Task 8 → Task 10 → Task 11 → Task 12 → Task 16
Parallel Speedup: ~35% faster than fully sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 7 | 2, 4, 5 |
| 2 | None | 3 | 1, 4, 5 |
| 3 | 1, 2 | 7 | 6 |
| 4 | None | 6 | 1, 2, 5 |
| 5 | None | 9 | 1, 2, 4 |
| 6 | 4 | 7 | 3 |
| 7 | Wave 1 done | 8 | None |
| 8 | 7 | 9 | None |
| 9 | 5, 8 | 12 | None |
| 10 | None | 11 | (can start during Wave 2) |
| 11 | 10 | 12 | None |
| 12 | 9, 11 | 13, 14 | None |
| 13 | 12 | 16 | 14, 15 |
| 14 | 12 | 16 | 13, 15 |
| 15 | None | 16 | 13, 14 |
| 16 | 13, 14, 15 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Dispatch |
|------|-------|---------------------|
| 1a | 1, 2, 4, 5 | 4 parallel agents: category="quick", load_skills=["superpowers/test-driven-development"] |
| 1b | 3, 6 | 2 parallel agents: category="quick", load_skills=["superpowers/test-driven-development"] |
| 2 | 7, 8, 9 | Sequential: category="unspecified-high", load_skills=["superpowers/test-driven-development"] |
| 3 | 10-13 | Sequential: category="unspecified-high", load_skills=["superpowers/verification-before-completion"] |
| 4 | 14, 15, 16 | 14+15 parallel, then 16: category="unspecified-high" |

---

## TODOs

### WAVE 1a: Fix Architectural Blockers (Parallel)

---

- [ ] 1. Fix `_matchesContext()` — Remove fallback + enforce avoidWhen

  **What to do**:
  - **RED**: Write failing test that asserts: (a) skill with success_rate=0.75 but NO tag/keyword match does NOT match a task context, (b) skill with avoidWhen condition matching task context does NOT match
  - **GREEN**: In `_matchesContext()`, remove the `success_rate > 0.7` fallback at line 277. Add avoidWhen enforcement: if `skill.selectionHints?.avoidWhen` array contains any term matching the task context, return `false` before other checks
  - **REFACTOR**: Extract avoidWhen check into private method `_isAvoidContext(skill, taskContext)`
  - The function currently has 3 match paths: (1) tag exact match (253-262), (2) application_context keyword match (266-273), (3) success_rate fallback (277). Remove path 3 entirely. Add avoidWhen as a pre-filter before paths 1-2.

  **Must NOT do**:
  - Do NOT change the tag matching logic (lines 253-262)
  - Do NOT change the application_context matching logic (lines 266-273)
  - Do NOT add any external dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function fix in one file, well-scoped
  - **Skills**: [`superpowers/test-driven-development`]
    - `superpowers/test-driven-development`: TDD cycle required for this fix
  - **Skills Evaluated but Omitted**:
    - `code-doctor`: Not a diagnostic task, fix is known
    - `systematic-debugging`: Not debugging, implementing a known fix

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1a (with Tasks 2, 4, 5)
  - **Blocks**: Tasks 3, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/opencode-skill-rl-manager/src/skill-bank.js:244-278` — `_matchesContext()` function. Line 277 is the fallback: `return skill.success_rate > 0.7`. Lines 253-262 are tag matching. Lines 266-273 are application_context matching. These MUST remain intact.
  - `packages/opencode-skill-rl-manager/src/skill-bank.js:190-215` — `querySkills()` which calls `_matchesContext()`. Shows how results flow downstream.

  **API/Type References**:
  - `opencode-config/skills/registry.json` — `selectionHints.avoidWhen[]` field per skill. Example: `"avoidWhen": ["simple fix", "typo"]` means skill should NOT match when task matches these phrases.

  **Test References**:
  - `packages/opencode-skill-rl-manager/test/exploration-adapter.test.js` — Existing test file. Follow its test structure and assertion patterns for new tests.
  - `packages/opencode-skill-rl-manager/test/exploration-policy.test.js` — Existing test file. Follow bun test `describe`/`test` patterns.
  - **NOTE**: `selection.test.js` does NOT exist yet. This task CREATES it as a new test file.

  **Acceptance Criteria**:
  - [ ] Test file CREATED: `packages/opencode-skill-rl-manager/test/selection.test.js` (NEW file — does not exist yet)
  - [ ] NEW TEST: Skill with success_rate=0.80 but no tag/keyword match → `_matchesContext()` returns false
  - [ ] NEW TEST: Skill with avoidWhen=["simple fix"] + task description "simple fix typo" → returns false
  - [ ] NEW TEST: Skill WITH matching tag + avoidWhen mismatch → returns true (avoidWhen doesn't block legitimate matches)
  - [ ] EXISTING TESTS: All pass unchanged
  - [ ] `bun test packages/opencode-skill-rl-manager/test/selection.test.js` → PASS

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Fallback removal prevents match-all behavior
    Tool: Bash (bun test)
    Preconditions: skill-bank.js modified, test file updated
    Steps:
      1. Run: bun test packages/opencode-skill-rl-manager/test/selection.test.js
      2. Assert: All tests pass including new fallback-removal tests
      3. Run: bun test (full suite)
      4. Assert: Exit code 0, no regressions
    Expected Result: No skill matches purely via success_rate fallback
    Evidence: Test output captured

  Scenario: avoidWhen enforcement blocks inappropriate matches
    Tool: Bash (bun test)
    Preconditions: avoidWhen logic added to _matchesContext()
    Steps:
      1. Run: bun test packages/opencode-skill-rl-manager/test/selection.test.js --filter "avoidWhen"
      2. Assert: avoidWhen test passes
    Expected Result: Skills with matching avoidWhen conditions are excluded
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `fix(skill-rl): remove success_rate>0.7 fallback and enforce avoidWhen in _matchesContext()`
  - Files: `packages/opencode-skill-rl-manager/src/skill-bank.js`, `packages/opencode-skill-rl-manager/test/selection.test.js`
  - Pre-commit: `bun test`

---

- [ ] 2. Fix `syncWithRegistry()` — Tiered defaults + seed collision handling

  **What to do**:
  - **RED**: Write failing tests: (a) imported skill gets success_rate based on category tier, not flat 0.75, (b) skill matching a seed name gets UPDATED with registry metadata (triggers, tags) instead of being skipped
  - **GREEN**: In `syncWithRegistry()`, replace flat `success_rate: 0.75` (line 343) with tiered defaults: `0.65` for general skills (below 0.7 fallback threshold even before Task 1 fix), `0.70` for category-relevant, `0.50` for experimental/niche. For seed collisions: change the `if (existing)` block (line 337) to MERGE registry metadata (triggers, tags, description) into existing entry instead of skipping entirely.
  - **REFACTOR**: Extract tier assignment to `_getDefaultSuccessRate(registryEntry)` and merge logic to `_mergeRegistryMetadata(existing, registryEntry)`.

  **Must NOT do**:
  - Do NOT change the persistence format (export/import at lines 364-386)
  - Do NOT modify _seedGeneralSkills() itself
  - Do NOT change success_rate of already-persisted skills (only new imports)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function modification, well-scoped
  - **Skills**: [`superpowers/test-driven-development`]
    - `superpowers/test-driven-development`: TDD cycle required

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1a (with Tasks 1, 4, 5)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/opencode-skill-rl-manager/src/index.js:322-357` — `syncWithRegistry()` function. Line 337: `if (existing) return` (skip). Line 341: `description → principle`. Line 342: `triggers → application_context`. Line 343: `success_rate: 0.75` (the flat default). Line 344-346: tags, category, source.
  - `packages/opencode-skill-rl-manager/src/index.js:141-167` — `_seedGeneralSkills()`. Creates 5 seeds: systematic-debugging (0.85), test-driven-development (0.90), verification-before-completion (0.80), brainstorming (0.85), incremental-implementation (0.80). These names will collide with registry imports.

  **API/Type References**:
  - `opencode-config/skills/registry.json` — Each skill entry has `category` field. Use category to determine tier: "debugging"/"testing" → 0.70, "general"/"meta" → 0.65, niche categories → 0.50.

  **Test References**:
  - `packages/opencode-skill-rl-manager/test/selection.test.js` — Created in Task 1. Add sync-related tests to this file.
  - `packages/opencode-skill-rl-manager/test/exploration-adapter.test.js` — Existing test patterns to follow.

  **Acceptance Criteria**:
  - [ ] NEW TEST: syncWithRegistry() with category="debugging" skill → success_rate = 0.70
  - [ ] NEW TEST: syncWithRegistry() with category="general" skill → success_rate = 0.65
  - [ ] NEW TEST: syncWithRegistry() with skill name matching seed → metadata merged (triggers present)
  - [ ] NEW TEST: syncWithRegistry() preserves existing success_rate for already-tracked skills
  - [ ] `bun test packages/opencode-skill-rl-manager/test/selection.test.js` → PASS

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Tiered defaults prevent toxic match-all combination
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/opencode-skill-rl-manager/test/selection.test.js --filter "syncWithRegistry"
      2. Assert: Tests pass showing tiered success_rate assignment
      3. Verify no imported skill gets success_rate >= 0.75
    Expected Result: All imported skills below former fallback threshold
    Evidence: Test output captured

  Scenario: Seed collision merges metadata
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/opencode-skill-rl-manager/test/selection.test.js --filter "seed"
      2. Assert: Skill with seed name has BOTH seed success_rate AND registry triggers/tags
    Expected Result: No metadata loss on name collision
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `fix(skill-rl): tiered success_rate defaults and seed collision metadata merge in syncWithRegistry()`
  - Files: `packages/opencode-skill-rl-manager/src/index.js`, `packages/opencode-skill-rl-manager/test/selection.test.js`
  - Pre-commit: `bun test`

---

- [ ] 3. Fix UCB cold-start — Dampening for registry-sourced skills

  **What to do**:
  - **RED**: Write failing test: 54 new skills at usage_count=0 do NOT push proven skill (usage=50, rate=0.85) below rank 5 in selectSkills() output
  - **GREEN**: In `_applyUCB()` (index.js:262-273), add a dampening factor for skills with `source: 'registry'` and `usage_count < 5`. Formula adjustment: `ucb_score = success_rate + exploration_bonus * dampening_factor` where `dampening_factor = min(1.0, usage_count / 5)`. This means brand-new imports (usage_count=0) get exploration_bonus × 0 = just their success_rate. After 5 uses, dampening disappears.
  - **REFACTOR**: Extract dampening logic to `_getUCBDampeningFactor(skill)`.

  **Must NOT do**:
  - Do NOT change the UCB formula for skills with usage_count >= 5
  - Do NOT remove UCB exploration entirely — only dampen for cold-start
  - Do NOT change the `.slice(0, 5)` cap in querySkills (that's Task 4)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small math change in one function
  - **Skills**: [`superpowers/test-driven-development`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1b (with Task 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `packages/opencode-skill-rl-manager/src/index.js:262-273` — `_applyUCB()`. Line 269: `const ucbScore = skill.success_rate + Math.sqrt(2 * Math.log(totalUsage + 1) / (skill.usage_count + 1))`. The exploration bonus `sqrt(...)` is ~3.04 when usage_count=0 and totalUsage=100.
  - `packages/opencode-skill-rl-manager/src/index.js:322-357` — `syncWithRegistry()` sets `source: 'registry'` on imported skills (line 346). Use this field to identify registry-sourced skills.

  **Test References**:
  - `packages/opencode-skill-rl-manager/test/selection.test.js` — Created in Task 1. Add UCB dampening tests here.

  **Acceptance Criteria**:
  - [ ] NEW TEST: 54 skills at usage_count=0 + 5 proven skills (usage=50) → proven skills all appear in top 10
  - [ ] NEW TEST: After 5 uses of a new skill, dampening factor = 1.0 (full UCB)
  - [ ] NEW TEST: Dampening only applies to source='registry' skills
  - [ ] EXISTING TESTS: All pass unchanged
  - [ ] `bun test packages/opencode-skill-rl-manager/test/selection.test.js` → PASS

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: UCB cold-start suppression preserves proven skill ranking
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/opencode-skill-rl-manager/test/selection.test.js --filter "cold-start"
      2. Assert: Test passes — proven skills remain in top 10 after 54 imports
    Expected Result: No regression from cold-start skill flooding
    Evidence: Test output captured
  ```

  **Commit**: YES (groups with Task 6)
  - Message: `fix(skill-rl): UCB cold-start dampening for registry-sourced skills`
  - Files: `packages/opencode-skill-rl-manager/src/index.js`, `packages/opencode-skill-rl-manager/test/selection.test.js`
  - Pre-commit: `bun test`

---

- [ ] 4. Fix `querySkills()` cap — Configurable top-K parameter

  **What to do**:
  - **RED**: Update existing test at selection.test.js:300 (`limits selection to top 5 skills`) to expect configurable cap. Write new test: querySkills with `maxResults` option returns up to N results.
  - **GREEN**: Add `maxResults` parameter to `querySkills(taskContext, { maxResults = 10 } = {})`. Replace hardcoded `.slice(0, 3)` per-source (lines 197, 206) with `.slice(0, Math.ceil(maxResults * 0.6))` (60% per source). Replace `.slice(0, 5)` overall (line 214) with `.slice(0, maxResults)`. Default 10 (up from 5).
  - **REFACTOR**: Extract cap logic to constants: `DEFAULT_MAX_RESULTS = 10`, `SOURCE_RATIO = 0.6`.

  **Must NOT do**:
  - Do NOT remove the cap entirely — always enforce a maximum
  - Do NOT change the sorting logic within querySkills
  - Do NOT exceed maxResults=20 as absolute ceiling

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small parameter addition, well-scoped
  - **Skills**: [`superpowers/test-driven-development`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1a (with Tasks 1, 2, 5)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/opencode-skill-rl-manager/src/skill-bank.js:190-215` — `querySkills()`. Line 197: `.slice(0, 3)` (general pool cap). Line 206: `.slice(0, 3)` (task-specific pool cap). Line 214: `.slice(0, 5)` (overall cap).

  **Test References**:
  - `packages/opencode-skill-rl-manager/test/selection.test.js` — Created in Task 1. Add configurable-cap tests here. NOTE: There is no pre-existing "limits selection to top 5 skills" test — write new cap tests from scratch.

  **Acceptance Criteria**:
  - [ ] NEW TEST: `limits selection to configurable top N skills` (default 10)
  - [ ] NEW TEST: querySkills with maxResults=5 → max 5 results
  - [ ] NEW TEST: querySkills with maxResults=15 → max 15 results
  - [ ] NEW TEST: querySkills with maxResults=25 → capped at 20 (absolute ceiling)
  - [ ] `bun test packages/opencode-skill-rl-manager/test/selection.test.js` → PASS

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Configurable cap respected
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/opencode-skill-rl-manager/test/selection.test.js --filter "top"
      2. Assert: All cap-related tests pass with configurable maxResults
    Expected Result: querySkills returns up to maxResults skills, capped at 20
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `feat(skill-rl): configurable querySkills cap with DEFAULT_MAX_RESULTS=10`
  - Files: `packages/opencode-skill-rl-manager/src/skill-bank.js`, `packages/opencode-skill-rl-manager/test/selection.test.js`
  - Pre-commit: `bun test`

---

- [ ] 5. Fix SKILL_AFFINITY — Registry-sourced routing table

  **What to do**:
  - **RED**: Write failing test: `advise({task_type: 'security'})` returns at least one skill from the "security" category in registry.json, not just the hardcoded 17.
  - **GREEN**: In `orchestration-advisor.js`, replace the hardcoded `SKILL_AFFINITY` object (lines 71-83) with a function `_buildSkillAffinity(registry)` that reads `registry.json` and builds the affinity map from each skill's `category` and `triggers` fields. Load registry once at construction time. Fall back to current hardcoded map if registry load fails.
  - **REFACTOR**: Move `_buildSkillAffinity()` to a separate utility if it exceeds 30 lines.

  **Must NOT do**:
  - Do NOT change the advise() output format
  - Do NOT change how SKILL_AFFINITY is consumed — same structure, different source
  - Do NOT make registry loading asynchronous (advise() is synchronous)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single constant replacement with registry-sourced data
  - **Skills**: [`superpowers/test-driven-development`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1a (with Tasks 1, 2, 4)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/opencode-learning-engine/src/orchestration-advisor.js:71-83` — `SKILL_AFFINITY` constant. 11 keyword categories → 17 unique skill names. Used by `advise()` method for `routing.skills` output.
  - `opencode-config/skills/registry.json` — Each skill has `category` and `triggers[]` fields. Build affinity from: `{[category]: [skills in that category]}` + `{[trigger_keyword]: [skills with that trigger]}`.

  **API/Type References**:
  - `packages/opencode-learning-engine/src/orchestration-advisor.js` — `advise()` method returns `{ routing: { skills: [...] } }`. The skills array must continue to work the same way.

  **Test References**:
  - `packages/opencode-learning-engine/test/` — Check for existing advisor tests. If none, create new test file following bun test patterns.

  **Acceptance Criteria**:
  - [ ] NEW TEST: advise({task_type: 'debug'}) returns skills including 'systematic-debugging' (existing)
  - [ ] NEW TEST: After adding security skills to registry, advise({task_type: 'security'}) returns security skills
  - [ ] NEW TEST: Registry load failure → falls back to hardcoded map (fail-open)
  - [ ] EXISTING behavior preserved: All 11 original keyword categories still return appropriate skills
  - [ ] `bun test` → PASS (full suite)

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Registry-sourced SKILL_AFFINITY includes imported skills
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/opencode-learning-engine/test/ --filter "affinity"
      2. Assert: New skills appear in affinity routing for their categories
      3. Run: bun test (full suite)
      4. Assert: Exit code 0
    Expected Result: Imported skills reachable through advise() routing
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `fix(learning-engine): replace hardcoded SKILL_AFFINITY with registry-sourced routing`
  - Files: `packages/opencode-learning-engine/src/orchestration-advisor.js`, `packages/opencode-learning-engine/test/orchestration-advisor.test.js`
  - Pre-commit: `bun test`

---

- [ ] 6. Fix epsilon-greedy — Weighted random injection

  **What to do**:
  - **RED**: Write failing test: epsilon-greedy random injection prefers skills in relevant category over completely random selection.
  - **GREEN**: In `_applyEpsilonGreedy()` (index.js:280-297), replace uniform random selection from `generalSkills` with weighted random that considers category match. If task has `task_type`, filter `generalSkills` to same category first. Only fall back to full pool if category filter returns empty. This prevents irrelevant skill injection as pool grows from 25 to 79.
  - **REFACTOR**: Extract weighted selection to `_weightedRandomSkill(skills, taskContext)`.

  **Must NOT do**:
  - Do NOT remove epsilon-greedy exploration — it's valuable for discovery
  - Do NOT change the epsilon parameter (exploration rate)
  - Do NOT make this deterministic — randomness is the point

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small function modification
  - **Skills**: [`superpowers/test-driven-development`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1b (with Task 3)
  - **Blocks**: Task 7
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `packages/opencode-skill-rl-manager/src/index.js:280-297` — `_applyEpsilonGreedy()`. Line 289: `const randomIndex = Math.floor(Math.random() * this.skillBank.generalSkills.length)`. This is uniform random across ALL skills. With 79 skills, relevance = 1/79 vs current 1/25.

  **API/Type References**:
  - Each skill in SkillBank has `category` field set by `syncWithRegistry()`. Use this for weighted selection.

  **Acceptance Criteria**:
  - [ ] NEW TEST: Epsilon-greedy with task_type="debugging" preferentially selects debugging-category skills (statistical test over 100 runs)
  - [ ] NEW TEST: Empty category filter → falls back to full pool (no crash)
  - [ ] `bun test packages/opencode-skill-rl-manager/test/selection.test.js` → PASS

  **Commit**: YES (groups with Task 3)
  - Message: `fix(skill-rl): weighted epsilon-greedy injection by category relevance`
  - Files: `packages/opencode-skill-rl-manager/src/index.js`, `packages/opencode-skill-rl-manager/test/selection.test.js`
  - Pre-commit: `bun test`

---

### WAVE 2: Semantic Matching Layer (Sequential)

---

- [ ] 7. Build synonym tables + domain heuristic data files

  **What to do**:
  - Create `opencode-config/skills/semantic-matching/synonyms.json` — Map of concept clusters where each key is a canonical term and value is array of synonyms/related terms. Cover at minimum: debugging (fix, troubleshoot, diagnose, investigate, resolve, repair), testing (test, spec, assertion, coverage, TDD, QA, validate), security (vulnerability, OWASP, audit, CVE, pentest, hardening), deployment (deploy, release, ship, CI/CD, pipeline), refactoring (refactor, restructure, clean up, reorganize, simplify), performance (optimize, speed, latency, throughput, benchmark), documentation (docs, README, guide, tutorial, reference), architecture (design, structure, patterns, system design, DDD).
  - Create `opencode-config/skills/semantic-matching/domain-signals.json` — Map of domain categories to signal words that indicate that domain. Example: `{"security": ["vulnerability", "OWASP", "audit", "CVE", "XSS", "SQL injection", "authentication", "authorization"], "devops": ["deploy", "container", "kubernetes", "terraform", "docker", "pipeline", "CI/CD", "infrastructure"]}`.
  - Create `opencode-config/skills/semantic-matching/README.md` — Brief documentation of format and how to add new entries.
  - **RED**: Write test that loads both JSON files, validates schema, and confirms key concept clusters exist.
  - **GREEN**: Create the files with comprehensive coverage.

  **Must NOT do**:
  - No ML models, embeddings, or vector databases
  - No external API calls for synonym generation
  - No more than 500 entries per file (keep manageable)
  - Do NOT create a separate npm package for this — just config files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires domain expertise to build comprehensive synonym tables
  - **Skills**: [`superpowers/test-driven-development`]
    - `superpowers/test-driven-development`: Test-first for schema validation

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 2 start)
  - **Blocks**: Task 8
  - **Blocked By**: Wave 1 complete

  **References**:

  **Pattern References**:
  - `opencode-config/skills/registry.json` — Existing JSON config pattern. Follow same directory structure.
  - `opencode-config/skills/registry.schema.json` — Example of schema validation approach.

  **Documentation References**:
  - `opencode-config/skills/SKILL-TEMPLATE.md` — Shows existing skill categories and terminology to include in synonyms.

  **External References**:
  - Antigravity repo `data/aliases.json` — Contains alias mappings that can inform synonym table content. Clone from https://github.com/sickn33/antigravity-awesome-skills.git if not present.

  **Acceptance Criteria**:
  - [ ] File created: `opencode-config/skills/semantic-matching/synonyms.json`
  - [ ] File created: `opencode-config/skills/semantic-matching/domain-signals.json`
  - [ ] Both files are valid JSON (parseable without error)
  - [ ] synonyms.json has >= 8 concept clusters (debugging, testing, security, deployment, refactoring, performance, documentation, architecture)
  - [ ] domain-signals.json covers all 14 existing registry categories
  - [ ] NEW TEST: JSON schema validation passes for both files
  - [ ] NEW TEST: synonyms.json["debugging"] includes ["fix", "troubleshoot", "diagnose"]
  - [ ] `bun test` → PASS

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Synonym tables are valid and comprehensive
    Tool: Bash (bun test + JSON validation)
    Steps:
      1. Run: bun test packages/opencode-skill-rl-manager/test/ --filter "synonym"
      2. Assert: Schema validation passes
      3. Run: node -e "const s = require('./opencode-config/skills/semantic-matching/synonyms.json'); console.log(Object.keys(s).length)"
      4. Assert: Output >= 8
    Expected Result: Synonym tables loadable and comprehensive
    Evidence: Test output + key count captured
  ```

  **Commit**: YES
  - Message: `feat(skills): add synonym tables and domain heuristic data for semantic matching`
  - Files: `opencode-config/skills/semantic-matching/synonyms.json`, `opencode-config/skills/semantic-matching/domain-signals.json`, `opencode-config/skills/semantic-matching/README.md`
  - Pre-commit: `bun test`

---

- [ ] 8. Integrate semantic matching into `_matchesContext()` as additive layer

  **What to do**:
  - **RED**: Write failing test: `_matchesContext(debugSkill, {description: "fix intermittent test failures"})` returns true. Currently fails because "fix" ≠ "debug" and "intermittent" ≠ any tag.
  - **GREEN**: Load synonym tables and domain signals at SkillBank construction (once). In `_matchesContext()`, BEFORE existing tag/keyword matching (not replacing it):
    1. Expand task description words through synonym table → get canonical terms
    2. Match canonical terms against skill tags and triggers (expanded via same table)
    3. Check domain signals → if task matches a domain, boost skills in that category
    4. Return true if synonym-expanded match score > threshold (0.5)
  - The semantic layer is ADDITIVE: if existing keyword matching already returns true, skip synonym check. If keyword matching returns false, try synonym matching before giving up.
  - **REFACTOR**: Create `SemanticMatcher` class in `packages/opencode-skill-rl-manager/src/semantic-matcher.js` with `match(skillTags, taskContext)` method. SkillBank holds instance.

  **Must NOT do**:
  - Do NOT replace existing keyword matching — only ADD synonym layer
  - Do NOT make synonym lookup async
  - Do NOT add external dependencies
  - Do NOT exceed O(n) per skill match (n = description word count)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core matching logic, needs careful design
  - **Skills**: [`superpowers/test-driven-development`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 9
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - `packages/opencode-skill-rl-manager/src/skill-bank.js:244-278` — `_matchesContext()` function (post Task 1 fixes). Add semantic layer BEFORE the tag matching at line 253.
  - `packages/opencode-skill-rl-manager/src/skill-bank.js:1-20` — Module imports and constructor. Load synonym/domain-signal files here.

  **API/Type References**:
  - `opencode-config/skills/semantic-matching/synonyms.json` — Created in Task 7. Format: `{"canonical_term": ["synonym1", "synonym2", ...]}`.
  - `opencode-config/skills/semantic-matching/domain-signals.json` — Created in Task 7. Format: `{"domain": ["signal1", "signal2", ...]}`.

  **Test References**:
  - `packages/opencode-skill-rl-manager/test/selection.test.js` — Add semantic matching tests here.

  **Acceptance Criteria**:
  - [ ] File created: `packages/opencode-skill-rl-manager/src/semantic-matcher.js`
  - [ ] NEW TEST: "fix intermittent test failures" matches skill with tag "debugging" → true (synonym: fix→debugging)
  - [ ] NEW TEST: "deploy to kubernetes cluster" matches skill with tag "devops" → true (domain signal)
  - [ ] NEW TEST: "write a poem about cats" does NOT match debugging skill → false (no synonym match)
  - [ ] NEW TEST: Existing keyword match still works independently of synonym layer
  - [ ] NEW TEST: Performance: _matchesContext() with 79 skills completes in < 1ms (100 iterations)
  - [ ] `bun test packages/opencode-skill-rl-manager/test/selection.test.js` → PASS

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Semantic gap closure — synonym matching bridges keyword gaps
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/opencode-skill-rl-manager/test/selection.test.js --filter "semantic"
      2. Assert: All semantic matching tests pass
      3. Verify: "fix intermittent test failures" → matches debugging skills
      4. Verify: "troubleshoot connection issues" → matches debugging skills
      5. Verify: "audit security vulnerabilities" → matches security skills
    Expected Result: Synonym-based matching closes semantic gaps
    Evidence: Test output captured

  Scenario: Performance regression check
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/opencode-skill-rl-manager/test/selection.test.js --filter "performance"
      2. Assert: _matchesContext() < 1ms for 79 skills
    Expected Result: No performance regression from semantic layer
    Evidence: Test timing output captured
  ```

  **Commit**: YES
  - Message: `feat(skill-rl): additive semantic matching layer with synonym tables and domain heuristics`
  - Files: `packages/opencode-skill-rl-manager/src/semantic-matcher.js`, `packages/opencode-skill-rl-manager/src/skill-bank.js`, `packages/opencode-skill-rl-manager/test/selection.test.js`
  - Pre-commit: `bun test`

---

- [ ] 9. Update skill-orchestrator-runtime profiles + scoring

  **What to do**:
  - Update `opencode-config/skills/skill-orchestrator-runtime/SKILL.md` to reference relevant imported skills in the 7 existing workflow profiles:
    - `deep-refactoring`: Add architecture/design skills (e.g., c4-architecture, ddd-strategic-design)
    - `planning-cycle`: Add product/business skills (e.g., competitive-analysis, gtm-strategy)
    - `review-cycle`: Add code-quality skills (e.g., tech-debt-assessment, linting-standards)
    - `diagnostic-healing`: Add security audit skills (e.g., security-auditing, vulnerability-scanning)
    - `browser-testing`: Add frontend testing skills (e.g., accessibility-testing, e2e-testing)
    - `research-to-code`: Add data/AI skills (e.g., rag-implementation, prompt-engineering)
    - `parallel-implementation`: Add devops skills (e.g., docker-containerization, terraform-iac)
  - Update `opencode-config/skills/registry.json` workflow profiles section to include new skill names in each profile's `skills[]` array.
  - Update the 8 auto-recommendation rules in `skill-orchestrator-runtime/SKILL.md` to include relevant new skills.

  **Must NOT do**:
  - Do NOT create new profile types — only update existing 7
  - Do NOT change the scoring formula (trigger 0.4 + category 0.3 + synergy 0.3)
  - Do NOT change the orchestrator's process flow

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding of all 54 imported skills to assign to profiles
  - **Skills**: [`superpowers/verification-before-completion`]
    - `superpowers/verification-before-completion`: Need to verify profile updates are correct

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (end of Wave 2)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 5, 8

  **References**:

  **Pattern References**:
  - `opencode-config/skills/skill-orchestrator-runtime/SKILL.md` — Current profiles and auto-recommendation rules. Find the 7 profiles (deep-refactoring, planning-cycle, etc.) and their skill lists.
  - `opencode-config/skills/registry.json` — Workflow profiles section with `skills[]` arrays.

  **Documentation References**:
  - `.sisyphus/drafts/antigravity-skills-integration.md` — Section "Must-Have Skills by Domain" lists 54 skills organized by domain. Use this to assign skills to profiles.

  **Acceptance Criteria**:
  - [ ] Each of the 7 profiles references at least 2 new imported skills
  - [ ] registry.json profile.skills[] arrays updated with new skill names
  - [ ] skill-orchestrator-runtime/SKILL.md updated with new skills in profiles
  - [ ] No new profile types created
  - [ ] `node scripts/check-skill-overlap-governance.mjs` → exit 0

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Profiles reference imported skills
    Tool: Bash (grep + governance)
    Steps:
      1. Run: node -e "const r = require('./opencode-config/skills/registry.json'); Object.entries(r.profiles).forEach(([k,v]) => console.log(k, v.skills.length))"
      2. Assert: Each profile has more skills than before (baseline: check current counts)
      3. Run: node scripts/check-skill-overlap-governance.mjs
      4. Assert: Exit code 0
    Expected Result: Profiles enriched with new skills, governance passes
    Evidence: Profile skill counts + governance output captured
  ```

  **Commit**: YES
  - Message: `feat(skills): update workflow profiles and orchestrator with imported skill references`
  - Files: `opencode-config/skills/skill-orchestrator-runtime/SKILL.md`, `opencode-config/skills/registry.json`
  - Pre-commit: `bun test && node scripts/check-skill-overlap-governance.mjs`

---

### WAVE 3: Import Pipeline & Skill Integration (Sequential)

---

- [ ] 10. Build robust YAML frontmatter parser

  **What to do**:
  - **RED**: Write failing test: parser correctly extracts multi-line YAML arrays, quoted strings, and nested structures from antigravity SKILL.md files.
  - **GREEN**: Replace regex-based frontmatter extraction in `scripts/consolidate-skills.mjs` (lines 62-86) with a proper YAML parser. Use `js-yaml` (already available in Bun ecosystem) or implement a focused parser for the frontmatter subset. Must handle: single-line arrays `[tag1, tag2]`, multi-line arrays (`- tag1\n- tag2`), quoted strings with special chars, block scalars (`|` and `>`).
  - **REFACTOR**: Extract parser to `scripts/lib/yaml-frontmatter-parser.mjs`. Export `parseFrontmatter(content)` → `{name, description, tags, risk, source, date_added, ...}`.

  **Must NOT do**:
  - Do NOT add heavy dependencies — use js-yaml (lightweight) or custom parser
  - Do NOT change the output format of consolidate-skills.mjs
  - Do NOT break existing SKILL.md files that work with current regex

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Parser implementation needs careful edge case handling
  - **Skills**: [`superpowers/test-driven-development`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (but can start during Wave 2 if resources available)
  - **Parallel Group**: Wave 3 start
  - **Blocks**: Task 11
  - **Blocked By**: None (within wave)

  **References**:

  **Pattern References**:
  - `scripts/consolidate-skills.mjs:62-86` — Current regex-based parser. `nameMatch = frontmatter.match(/^name:\s*(.+)$/m)`, `tagsMatch = frontmatter.match(/^tags:\s*\[(.+)\]/m)`. These fail on multi-line arrays and quoted strings.
  - Antigravity SKILL.md format example (clone repo first):
    ```yaml
    ---
    name: "Security Auditing"
    description: "Comprehensive security audit skill"
    risk: medium
    source: community
    date_added: "2025-01-15"
    tags:
      - security
      - audit
      - OWASP
    ---
    ```

  **External References**:
  - Antigravity repo: `https://github.com/sickn33/antigravity-awesome-skills.git` — Clone to `.sisyphus/analysis/antigravity-awesome-skills/` if not present. Test parser against files in `skills/` directory.

  **Acceptance Criteria**:
  - [ ] File created: `scripts/lib/yaml-frontmatter-parser.mjs`
  - [ ] NEW TEST: Multi-line YAML array tags parsed correctly
  - [ ] NEW TEST: Quoted strings with special characters preserved
  - [ ] NEW TEST: Existing SKILL.md files (from opencode-config/skills/) still parse correctly
  - [ ] NEW TEST: All 54 antigravity SKILL.md files parse without error
  - [ ] `bun test` → PASS

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Parser handles all antigravity SKILL.md formats
    Tool: Bash
    Preconditions: Antigravity repo cloned to .sisyphus/analysis/antigravity-awesome-skills/
    Steps:
      1. Run: node scripts/lib/yaml-frontmatter-parser.mjs --test-dir .sisyphus/analysis/antigravity-awesome-skills/skills/ --sample 54
      2. Assert: 54/54 files parsed successfully
      3. Assert: Each parsed result has name, description, and at least 1 tag
    Expected Result: Zero parse failures across all target files
    Evidence: Parse results captured
  ```

  **Commit**: YES
  - Message: `feat(scripts): robust YAML frontmatter parser replacing regex extraction`
  - Files: `scripts/lib/yaml-frontmatter-parser.mjs`, `scripts/consolidate-skills.mjs`
  - Pre-commit: `bun test`

---

- [ ] 11. Build skill format converter + import pipeline

  **What to do**:
  - Create `scripts/import-antigravity-skills.mjs` — Pipeline that: (1) reads antigravity SKILL.md using the parser from Task 10, (2) converts to our SKILL.md format (matching SKILL-TEMPLATE.md structure), (3) generates registry.json entries with proper fields (description, category, tags, triggers, synergies, dependencies, conflicts, selectionHints), (4) auto-infers interconnections from category/tag overlap.
  - **Interconnection auto-inference rules**:
    - Synergies: Skills in same category OR sharing 2+ tags → add to synergies[]
    - Dependencies: Skills with explicit prerequisite mentions in their content → add to dependencies[]
    - Conflicts: Skills with overlapping purpose but different approaches → add to conflicts[]
  - The script should output: list of SKILL.md files to create + registry.json patch (additive).
  - Support `--dry-run` flag to preview without writing.

  **Must NOT do**:
  - Do NOT auto-import all 1,272 — script takes a manifest file listing the 54 selected skills
  - Do NOT modify existing skills in registry.json
  - Do NOT create a separate data store for interconnections — registry.json fields only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex pipeline with format conversion and inference logic
  - **Skills**: [`superpowers/verification-before-completion`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 12
  - **Blocked By**: Task 10

  **References**:

  **Pattern References**:
  - `scripts/consolidate-skills.mjs` — Existing skill consolidation script. Follow its directory traversal and metadata extraction pattern.
  - `opencode-config/skills/SKILL-TEMPLATE.md` — Our target SKILL.md format. Imported skills must match this structure.
  - `opencode-config/skills/registry.json` — Target registry format. Each new entry needs: description, category, tags[], triggers[], synergies[], dependencies[], conflicts[], selectionHints{useWhen[], avoidWhen[]}, recommended_agents[], source.

  **External References**:
  - Antigravity `skills_index.json` — Master index with skill names, paths, categories for all 1,272 skills.
  - Antigravity `data/aliases.json` — Alias mappings that can inform trigger generation.

  **Acceptance Criteria**:
  - [ ] File created: `scripts/import-antigravity-skills.mjs`
  - [ ] `--dry-run` shows 54 skills with converted format (no files written)
  - [ ] Each converted skill has: name, description, category, tags[], triggers[], synergies[], dependencies[], conflicts[]
  - [ ] Interconnection auto-inference produces non-empty synergies for >= 80% of skills
  - [ ] Output registry.json patch is valid JSON and merges cleanly with existing registry
  - [ ] `bun test` → PASS

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Dry-run produces valid conversion for all 54 skills
    Tool: Bash
    Steps:
      1. Run: node scripts/import-antigravity-skills.mjs --manifest .sisyphus/skill-manifest.json --source .sisyphus/analysis/antigravity-awesome-skills/skills/ --dry-run
      2. Assert: Output shows 54 skills converted
      3. Assert: Each skill has non-empty description, category, tags
      4. Assert: >= 43 skills (80%) have non-empty synergies[]
    Expected Result: Full conversion preview without side effects
    Evidence: Dry-run output captured
  ```

  **Commit**: YES
  - Message: `feat(scripts): antigravity skill format converter and import pipeline`
  - Files: `scripts/import-antigravity-skills.mjs`, `.sisyphus/skill-manifest.json`
  - Pre-commit: `bun test`

---

- [ ] 12. Import 54 must-have skills + wire interconnections

  **What to do**:
  - Run the import pipeline (Task 11) WITHOUT `--dry-run` to:
    1. Create 54 SKILL.md files under `opencode-config/skills/{skill-name}/SKILL.md`
    2. Add 54 entries to `opencode-config/skills/registry.json` with full interconnection wiring
    3. Run `node scripts/check-skill-overlap-governance.mjs` to validate
  - Create `.sisyphus/skill-manifest.json` listing the 54 selected skills (if not created in Task 11)
  - Review and manually adjust auto-inferred interconnections for critical paths:
    - Ensure security skills have proper synergies (security-auditing ↔ vulnerability-scanning ↔ owasp-compliance)
    - Ensure devops pipeline skills have proper dependencies (docker → kubernetes → terraform)
    - Ensure frontend skills don't conflict with backend skills unnecessarily
  - Verify: `syncWithRegistry()` will pick up new entries with tiered success_rates (from Task 2 fix)

  **Must NOT do**:
  - Do NOT import skills not in the manifest (54 only)
  - Do NOT modify existing 25 skill entries
  - Do NOT skip governance validation after import

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Large-scale import with manual review of interconnections
  - **Skills**: [`superpowers/verification-before-completion`, `codebase-auditor`]
    - `superpowers/verification-before-completion`: Must verify import completeness and governance pass
    - `codebase-auditor`: Audit interconnection quality across 79 skills

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Tasks 13, 14
  - **Blocked By**: Tasks 9, 11

  **References**:

  **Pattern References**:
  - `opencode-config/skills/playwright/SKILL.md` — Example of our SKILL.md format to match.
  - `opencode-config/skills/registry.json` — Existing 25 entries. New entries append after existing.
  - `scripts/import-antigravity-skills.mjs` — The import pipeline from Task 11.

  **Documentation References**:
  - `.sisyphus/drafts/antigravity-skills-integration.md` — "Must-Have Skills by Domain" section lists all 54 skills with domains.

  **Acceptance Criteria**:
  - [ ] 54 new SKILL.md files created under `opencode-config/skills/`
  - [ ] registry.json contains 79 total skills (25 existing + 54 new)
  - [ ] Each new entry has non-empty: description, category, tags[], triggers[]
  - [ ] >= 43 skills (80%) have non-empty synergies[]
  - [ ] >= 10 skills have non-empty dependencies[]
  - [ ] `node scripts/check-skill-overlap-governance.mjs` → exit 0
  - [ ] No existing 25 skill entries modified
  - [ ] `bun test` → PASS

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: 54 skills imported with governance pass
    Tool: Bash
    Steps:
      1. Run: node scripts/import-antigravity-skills.mjs --manifest .sisyphus/skill-manifest.json --source .sisyphus/analysis/antigravity-awesome-skills/skills/
      2. Assert: "54 skills imported" in output
      3. Run: node -e "const r = require('./opencode-config/skills/registry.json'); console.log(Object.keys(r.skills).length)"
      4. Assert: Output is 79
      5. Run: node scripts/check-skill-overlap-governance.mjs
      6. Assert: Exit code 0
      7. Run: bun test
      8. Assert: Exit code 0
    Expected Result: Full import with governance validation
    Evidence: Import output + governance output + test results captured

  Scenario: Interconnections wired correctly
    Tool: Bash
    Steps:
      1. Run: node -e "const r = require('./opencode-config/skills/registry.json'); const withSynergies = Object.values(r.skills).filter(s => s.synergies && s.synergies.length > 0).length; console.log(withSynergies)"
      2. Assert: Output >= 63 (80% of 79)
      3. Run: node -e "const r = require('./opencode-config/skills/registry.json'); const secSkills = Object.entries(r.skills).filter(([k,v]) => v.category === 'security').map(([k]) => k); const s = r.skills[secSkills[0]]; console.log(s.synergies.filter(x => secSkills.includes(x)).length)"
      4. Assert: Output >= 1 (security skills synergize with each other)
    Expected Result: Interconnection graph is connected and domain-coherent
    Evidence: Synergy counts captured
  ```

  **Commit**: YES
  - Message: `feat(skills): import 54 antigravity skills with full interconnection wiring`
  - Files: `opencode-config/skills/` (54 new directories), `opencode-config/skills/registry.json`, `.sisyphus/skill-manifest.json`
  - Pre-commit: `bun test && node scripts/check-skill-overlap-governance.mjs`

---

- [ ] 13. Import bundles as workflow profiles

  **What to do**:
  - Read antigravity's `data/bundles.json` (20+ role-based collections like "Web Wizard", "Security Engineer", "DevOps Master").
  - Select bundles whose member skills overlap with our 54 imported skills.
  - For each relevant bundle, create a new workflow profile entry in `registry.json`'s `profiles` section.
  - Map bundle members to our skill names (using manifest mapping from Task 12).
  - Add triggers for each bundle profile based on role keywords.

  **Must NOT do**:
  - Do NOT import bundles for skills we didn't import
  - Do NOT create more than 5 new profiles (keep manageable)
  - Do NOT modify existing 7 profiles (those were updated in Task 9)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: JSON mapping task, straightforward once imports are done
  - **Skills**: [`superpowers/verification-before-completion`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 end (with Task 14 if ready)
  - **Blocks**: Task 16
  - **Blocked By**: Task 12

  **References**:

  **Pattern References**:
  - `opencode-config/skills/registry.json` — `profiles` section. Existing profiles have: `skills[]`, `triggers[]`, description. Follow this structure.

  **External References**:
  - Antigravity `data/bundles.json` — Role-based skill collections. Clone from https://github.com/sickn33/antigravity-awesome-skills.git.

  **Acceptance Criteria**:
  - [ ] 3-5 new workflow profiles added to registry.json
  - [ ] Each profile references only skills that exist in registry (no dangling references)
  - [ ] Each profile has triggers[] for activation
  - [ ] `node scripts/check-skill-overlap-governance.mjs` → exit 0

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Bundle profiles reference valid skills
    Tool: Bash
    Steps:
      1. Run: node -e "const r = require('./opencode-config/skills/registry.json'); Object.entries(r.profiles).forEach(([k,v]) => { const invalid = v.skills.filter(s => !r.skills[s]); if (invalid.length) console.log('INVALID:', k, invalid); else console.log('OK:', k, v.skills.length); })"
      2. Assert: No "INVALID" lines in output
      3. Assert: >= 10 total profiles (7 existing + 3-5 new)
    Expected Result: All profile skill references resolve to valid registry entries
    Evidence: Validation output captured
  ```

  **Commit**: YES
  - Message: `feat(skills): import antigravity bundles as workflow profiles`
  - Files: `opencode-config/skills/registry.json`
  - Pre-commit: `bun test && node scripts/check-skill-overlap-governance.mjs`

---

### WAVE 4: Governance, Fixes & Validation (Partial Parallel)

---

- [ ] 14. Update governance scripts + create import validator

  **What to do**:
  - Update `scripts/check-skill-overlap-governance.mjs`:
    - Add circular dependency detection (A→B→A cycles in dependencies[])
    - Add transitive conflict detection (A conflicts B, B conflicts C → warn about A+C chains)
    - Ensure it handles 79 skills without performance issues
  - Update `scripts/consolidate-skills.mjs`:
    - Use the YAML parser from Task 10 instead of regex
    - Support incremental mode (don't full-copy/delete at 79 skills)
  - Update `scripts/normalize-superpowers-skills.mjs`:
    - Extend to validate imported skills too (not just superpowers/)
  - Create `scripts/validate-skill-import.mjs` (NEW — max 1 new script per guardrail):
    - Validates: all registry.json entries have matching SKILL.md files, all SKILL.md files have registry entries, no orphans, synergy references are bidirectional, dependency references are acyclic

  **Must NOT do**:
  - Do NOT create more than 1 new governance script
  - Do NOT change governance script exit codes or output format
  - Do NOT make governance scripts async (they're currently sync)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple script updates with graph algorithm (cycle detection)
  - **Skills**: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4a (with Task 15)
  - **Blocks**: Task 16
  - **Blocked By**: Task 12

  **References**:

  **Pattern References**:
  - `scripts/check-skill-overlap-governance.mjs` — Current governance script. Checks: canonical entrypoint uniqueness, selection hints completeness, conflict reference resolution.
  - `scripts/consolidate-skills.mjs` — Current consolidation script. Lines 62-86: regex parser (replace with Task 10 parser).
  - `scripts/normalize-superpowers-skills.mjs` — Current normalization script. Enforces frontmatter + required sections.

  **Acceptance Criteria**:
  - [ ] `node scripts/check-skill-overlap-governance.mjs` → exit 0 with 79 skills
  - [ ] Circular dependencies detected and reported (if any exist)
  - [ ] `node scripts/validate-skill-import.mjs` → exit 0 (no orphans, all references valid)
  - [ ] `scripts/consolidate-skills.mjs` uses YAML parser from Task 10
  - [ ] `bun test` → PASS

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Governance suite passes with 79 skills
    Tool: Bash
    Steps:
      1. Run: node scripts/check-skill-overlap-governance.mjs
      2. Assert: Exit code 0
      3. Run: node scripts/validate-skill-import.mjs
      4. Assert: Exit code 0
      5. Run: node scripts/consolidate-skills.mjs --dry-run
      6. Assert: 79 skills processed without error
    Expected Result: Full governance pass at scale
    Evidence: All script outputs captured
  ```

  **Commit**: YES
  - Message: `feat(governance): update scripts for 79-skill scale + import validator`
  - Files: `scripts/check-skill-overlap-governance.mjs`, `scripts/consolidate-skills.mjs`, `scripts/normalize-superpowers-skills.mjs`, `scripts/validate-skill-import.mjs`
  - Pre-commit: `bun test`

---

- [ ] 15. Fix ExplorationRLAdapter field mismatch

  **What to do**:
  - **RED**: Write failing test: ExplorationRLAdapter passes `skill_used` (singular string) to SkillRL's `learnFromOutcome()`, matching the expected field name.
  - **GREEN**: In `packages/opencode-skill-rl-manager/src/exploration-adapter.js:68-69`, the adapter currently calls `learnFromOutcome({ skills: ["model:X"], ... })` — passing `skills` (plural, array with "model:" prefix). But `learnFromOutcome()` expects `skill_used` (singular string, no prefix) — see `tests/tool-affinities.test.js:22-24` where the contract is `{ skill_used: skillName, ... }`. Fix: change `skills: ["model:${row.model_id}"]` → `skill_used: "model:${row.model_id}"` (singular string, matching the expected contract).
  - **REFACTOR**: Add clear field mapping documentation at the top of the adapter explaining the contract: `learnFromOutcome()` expects `{ skill_used: string, success: boolean, ... }`.

  **Must NOT do**:
  - Do NOT change the model_performance table schema
  - Do NOT change SkillRL's learnFromOutcome() signature
  - Do NOT change the "model:" prefix convention — just fix the field name

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple field name fix
  - **Skills**: [`superpowers/test-driven-development`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4a (with Task 14)
  - **Blocks**: Task 16
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/opencode-skill-rl-manager/src/exploration-adapter.js:68-69` — Currently calls `learnFromOutcome({ skills: ["model:${row.model_id}"], ... })`. The `skills` (plural, array) field does not match the expected contract.
  - `packages/opencode-skill-rl-manager/tests/tool-affinities.test.js:22-27` — Shows the real contract: `learnFromOutcome({ skill_used: skillName, success: true, ... })` — expects `skill_used` (singular string).

  **Test References**:
  - `packages/opencode-skill-rl-manager/test/exploration-adapter.test.js` — Existing tests (4 pass). Add field mapping test.

  **Acceptance Criteria**:
  - [ ] NEW TEST: Adapter passes `skill_used` (singular string) to `learnFromOutcome()`, not `skills` (array)
  - [ ] EXISTING TESTS: All 4 pass unchanged
  - [ ] `bun test packages/opencode-skill-rl-manager/test/exploration-adapter.test.js` → PASS

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Field mismatch fixed
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/opencode-skill-rl-manager/test/exploration-adapter.test.js
      2. Assert: All tests pass (5 total — 4 existing + 1 new)
    Expected Result: Adapter correctly maps between field conventions
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `fix(skill-rl): ExplorationRLAdapter field mapping skills → skill_used`
  - Files: `packages/opencode-skill-rl-manager/src/exploration-adapter.js`, `packages/opencode-skill-rl-manager/test/exploration-adapter.test.js`
  - Pre-commit: `bun test`

---

- [ ] 16. Full regression test suite + performance benchmarks

  **What to do**:
  - Run the FULL test suite: `bun test` from repo root
  - Run ALL governance scripts in sequence
  - Run integration tests: `bun test integration-tests/bootstrap-e2e.test.js`
  - Create performance benchmark test: `packages/opencode-skill-rl-manager/test/performance.test.js`
    - `_matchesContext()` with 79 skills: < 1ms per call (100 iterations)
    - `querySkills()` with 79 skills: < 5ms per call
    - `selectSkills()` with 79 skills: < 10ms per call
    - `syncWithRegistry()` with 79-entry registry: < 100ms
    - `advise()` cache miss: < 50ms
    - `advise()` cache hit: < 1ms
  - Verify semantic matching closes target gaps:
    - "fix intermittent test failures" → matches debugging skills ✓
    - "troubleshoot connection issues" → matches debugging skills ✓
    - "audit security vulnerabilities" → matches security skills ✓
    - "deploy to kubernetes cluster" → matches devops skills ✓
    - "optimize database queries" → matches database/performance skills ✓

  **Must NOT do**:
  - Do NOT skip any existing tests
  - Do NOT modify tests to make them pass (fix code instead)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive validation across entire system
  - **Skills**: [`superpowers/verification-before-completion`]
    - `superpowers/verification-before-completion`: Final verification before declaring done

  **Parallelization**:
  - **Can Run In Parallel**: NO (final task)
  - **Parallel Group**: Wave 4b (after 14, 15)
  - **Blocks**: None
  - **Blocked By**: Tasks 13, 14, 15

  **References**:

  **Pattern References**:
  - `integration-tests/bootstrap-e2e.test.js` — E2E tests (4 scenarios). Must all pass.
  - All test files in `packages/opencode-skill-rl-manager/test/` — Unit tests for SkillRL system.

  **Acceptance Criteria**:
  - [ ] `bun test` → exit 0 (ALL tests pass)
  - [ ] `bun test integration-tests/bootstrap-e2e.test.js` → 4/4 pass
  - [ ] `node scripts/check-skill-overlap-governance.mjs` → exit 0
  - [ ] `node scripts/validate-skill-import.mjs` → exit 0
  - [ ] Performance benchmark: all thresholds met
  - [ ] Semantic gap test: all 5 target phrases match expected skills
  - [ ] registry.json has 79 skills, 10+ workflow profiles
  - [ ] No warnings or errors in test output

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Full regression — zero failures
    Tool: Bash
    Steps:
      1. Run: bun test
      2. Assert: Exit code 0
      3. Parse output for failure count → assert 0 failures
      4. Run: bun test integration-tests/bootstrap-e2e.test.js
      5. Assert: 4/4 pass
    Expected Result: Complete test suite green
    Evidence: Full test output captured to .sisyphus/evidence/task-16-regression.txt

  Scenario: Governance suite at scale
    Tool: Bash
    Steps:
      1. Run: node scripts/check-skill-overlap-governance.mjs 2>&1
      2. Assert: Exit code 0
      3. Run: node scripts/validate-skill-import.mjs 2>&1
      4. Assert: Exit code 0
    Expected Result: All governance checks pass with 79 skills
    Evidence: Governance output captured

  Scenario: Performance benchmarks
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/opencode-skill-rl-manager/test/performance.test.js
      2. Assert: All timing assertions pass
      3. Assert: _matchesContext < 1ms, querySkills < 5ms, selectSkills < 10ms
    Expected Result: No performance regression at 79-skill scale
    Evidence: Performance test output captured

  Scenario: Semantic gap closure verification
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/opencode-skill-rl-manager/test/selection.test.js --filter "semantic"
      2. Assert: All 5 semantic gap tests pass
    Expected Result: Synonym-based matching closes all target gaps
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `test(skill-rl): full regression suite + performance benchmarks for 79-skill system`
  - Files: `packages/opencode-skill-rl-manager/test/performance.test.js`
  - Pre-commit: `bun test`

---

## Commit Strategy

| After Task | Message | Key Files | Verification |
|------------|---------|-----------|--------------|
| 1 | `fix(skill-rl): remove success_rate fallback, enforce avoidWhen` | skill-bank.js | bun test |
| 2 | `fix(skill-rl): tiered defaults + seed collision merge` | index.js | bun test |
| 3+6 | `fix(skill-rl): UCB cold-start dampening + weighted epsilon-greedy` | index.js | bun test |
| 4 | `feat(skill-rl): configurable querySkills cap` | skill-bank.js | bun test |
| 5 | `fix(learning-engine): registry-sourced SKILL_AFFINITY` | orchestration-advisor.js | bun test |
| 7 | `feat(skills): synonym tables + domain heuristic data` | semantic-matching/*.json | bun test |
| 8 | `feat(skill-rl): additive semantic matching layer` | semantic-matcher.js, skill-bank.js | bun test |
| 9 | `feat(skills): update profiles + orchestrator with imported skills` | registry.json, SKILL.md | governance |
| 10 | `feat(scripts): robust YAML frontmatter parser` | yaml-frontmatter-parser.mjs | bun test |
| 11 | `feat(scripts): antigravity import pipeline` | import-antigravity-skills.mjs | bun test |
| 12 | `feat(skills): import 54 skills with interconnections` | registry.json, 54 SKILL.md | governance |
| 13 | `feat(skills): bundle-based workflow profiles` | registry.json | governance |
| 14 | `feat(governance): scale to 79 skills + import validator` | governance scripts | governance |
| 15 | `fix(skill-rl): ExplorationRLAdapter skills → skill_used` | exploration-adapter.js | bun test |
| 16 | `test(skill-rl): regression suite + performance benchmarks` | performance.test.js | bun test |

---

## Success Criteria

### Verification Commands
```bash
# Full test suite
bun test                                              # Expected: exit 0, all tests pass

# E2E tests
bun test integration-tests/bootstrap-e2e.test.js      # Expected: 4/4 pass

# Governance
node scripts/check-skill-overlap-governance.mjs       # Expected: exit 0
node scripts/validate-skill-import.mjs                # Expected: exit 0

# Skill count
node -e "const r = require('./opencode-config/skills/registry.json'); console.log(Object.keys(r.skills).length)"
# Expected: 79

# Semantic matching
bun test packages/opencode-skill-rl-manager/test/selection.test.js --filter "semantic"
# Expected: all pass

# Performance
bun test packages/opencode-skill-rl-manager/test/performance.test.js
# Expected: all timing assertions pass

# Profile count
node -e "const r = require('./opencode-config/skills/registry.json'); console.log(Object.keys(r.profiles).length)"
# Expected: >= 10
```

### Final Checklist
- [ ] All "Must Have" present:
  - [ ] 5 blockers fixed
  - [ ] Semantic matching layer operational
  - [ ] TDD for all changes
  - [ ] Governance pass after each wave
  - [ ] Full interconnection wiring
  - [ ] Workflow profiles updated
- [ ] All "Must NOT Have" absent:
  - [ ] No ML/embeddings/vector search
  - [ ] No persistence format changes
  - [ ] No querySkills cap removal
  - [ ] No more than 1 new governance script
  - [ ] No wholesale import (54 only)
  - [ ] No new profile types (only updates to existing + bundle profiles)
- [ ] All tests pass: `bun test` → exit 0
- [ ] Governance passes: all scripts → exit 0
- [ ] Semantic gaps closed: 5 target phrases match expected skills
- [ ] Performance: all benchmarks within thresholds
- [ ] 79 total skills in registry (25 existing + 54 imported)
- [ ] 10+ workflow profiles (7 existing updated + 3-5 bundle profiles)
