# Skill Selection Architecture Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve one-pass correctness and routing consistency by adding measurable selection quality signals, hierarchical routing, overlap governance, and release gates without disruptive rewrites.

**Architecture:** Add a scoring and telemetry layer around existing routing (`skill-profile-loader` + `orchestration-advisor`) instead of replacing them. Introduce explicit process/domain metadata in registry, compute ambiguity and switch metrics, and enforce add/retire gates through scripts and tests. Keep rollout reversible with feature flags and bounded schema additions.

**Tech Stack:** Bun, Node.js scripts (`.mjs`), JSON registry/schema, existing integration tests, learning engine (CommonJS)

---

### Task 1: Baseline Metrics Contract and Feature Flags

**Files:**
- Modify: `opencode-config/skills/registry.schema.json`
- Modify: `opencode-config/skills/registry.json`
- Create: `scripts/skill-routing-thresholds.json`
- Test: `scripts/tests/skill-profile-loader.test.js`

**Step 1: Write failing tests for new metadata and thresholds loading**

Add tests in `scripts/tests/skill-profile-loader.test.js` for:
- missing process/domain metadata handling
- thresholds file parse/validation behavior

**Step 2: Run test subset to verify failures**

Run: `bun test scripts/tests/skill-profile-loader.test.js`
Expected: FAIL on new metadata/threshold cases

**Step 3: Add additive schema fields**

In `opencode-config/skills/registry.schema.json`, add optional skill fields:
- `processPhase` (enum: pre-analysis, analysis, implementation, verification, post-process)
- `domain` (string)
- `selectionHints` object (`useWhen`, `avoidWhen` arrays)

Do not make them required in this wave.

**Step 4: Seed registry metadata for current skills**

In `opencode-config/skills/registry.json`, add `processPhase`, `domain`, and short `selectionHints` for all skills touched by routing:
- planning/meta: `brainstorming`, `writing-plans`, `executing-plans`, `task-orchestrator`, `skill-orchestrator-runtime`
- debugging/testing: `systematic-debugging`, `code-doctor`, `incident-commander`, `test-driven-development`, `verification-before-completion`

**Step 5: Add thresholds file**

Create `scripts/skill-routing-thresholds.json`:
- `maxAmbiguityRate`: 0.15
- `maxSwitchRate`: 0.10
- `minOnePassCorrectness`: 0.85
- `maxMedianRoutingMs`: 200
- `maxContextBudgetOverhead`: 0.05

**Step 6: Re-run tests and validator**

Run:
- `bun test scripts/tests/skill-profile-loader.test.js`
- `node scripts/skill-profile-loader.mjs validate`

Expected: PASS

**Step 7: Commit**

```bash
git add opencode-config/skills/registry.schema.json opencode-config/skills/registry.json scripts/skill-routing-thresholds.json scripts/tests/skill-profile-loader.test.js
git commit -m "chore(skills): add routing metadata and threshold config"
```

### Task 2: Hierarchical Router (Process -> Domain -> Skill)

**Files:**
- Modify: `scripts/skill-profile-loader.mjs`
- Create: `scripts/skill-routing-evaluator.mjs`
- Test: `scripts/tests/skill-profile-loader.test.js`

**Step 1: Write failing tests for hierarchical selection**

Add tests asserting:
- process phase chosen before domain
- single top skill is selected with runner-up score captured
- deterministic tie-break behavior

**Step 2: Run tests to confirm fail**

Run: `bun test scripts/tests/skill-profile-loader.test.js`
Expected: FAIL for new hierarchical expectations

**Step 3: Implement hierarchical scoring helpers**

In `scripts/skill-profile-loader.mjs`, add pure functions:
- `scoreProcessPhase(taskText, registry)`
- `scoreDomain(taskText, phase, registry)`
- `scoreSkills(taskText, phase, domain, registry)`

Return winner and runner-up with score margin.

**Step 4: Preserve compatibility for existing commands**

Keep existing CLI commands unchanged:
- `profile`
- `recommend`
- `validate`

Add optional output fields only for richer diagnostics (no breaking shape for existing consumers).

**Step 5: Add evaluator script for offline scoring**

Create `scripts/skill-routing-evaluator.mjs` to read tasks from fixture JSON and output:
- one-pass correctness estimate
- ambiguity rate (low-margin winner)
- median routing latency

**Step 6: Run tests and command checks**

Run:
- `bun test scripts/tests/skill-profile-loader.test.js`
- `node scripts/skill-profile-loader.mjs recommend "debug flaky integration tests" 3`
- `node scripts/skill-routing-evaluator.mjs --dry-run`

Expected: PASS and machine-readable report output

**Step 7: Commit**

```bash
git add scripts/skill-profile-loader.mjs scripts/skill-routing-evaluator.mjs scripts/tests/skill-profile-loader.test.js
git commit -m "feat(skills): add hierarchical process-domain-skill routing"
```

### Task 3: Routing Telemetry and Switch/Ambiguity Signals

**Files:**
- Modify: `packages/opencode-learning-engine/src/orchestration-advisor.js`
- Modify: `packages/opencode-learning-engine/README.md`
- Test: `integration-tests/skillrl-api-regression.test.js`
- Test: `integration-tests/skillrl-showboat-e2e.test.js`

**Step 1: Write failing integration assertions**

Add assertions for telemetry fields in advice/evidence payloads:
- `routing.ambiguity_margin`
- `routing.runner_up_skill`
- `routing.skill_switch_count` (or equivalent outcome metric)

**Step 2: Run integration tests to confirm fail**

Run:
- `bun test integration-tests/skillrl-api-regression.test.js`
- `bun test integration-tests/skillrl-showboat-e2e.test.js`

Expected: FAIL due to missing telemetry fields

**Step 3: Implement telemetry enrichment**

In `orchestration-advisor.js`:
- compute and attach ambiguity margin and runner-up details
- increment switch metric when task changes recommended skill category across attempts
- keep existing `advise()` base shape backward-compatible

**Step 4: Document metrics in learning-engine README**

Update `packages/opencode-learning-engine/README.md` with telemetry field meanings and thresholds.

**Step 5: Re-run integration tests**

Run:
- `bun test integration-tests/skillrl-api-regression.test.js`
- `bun test integration-tests/skillrl-showboat-e2e.test.js`

Expected: PASS

**Step 6: Commit**

```bash
git add packages/opencode-learning-engine/src/orchestration-advisor.js packages/opencode-learning-engine/README.md integration-tests/skillrl-api-regression.test.js integration-tests/skillrl-showboat-e2e.test.js
git commit -m "feat(learning): add routing ambiguity and switch telemetry"
```

### Task 4: Overlap Governance and Canonical Entry Points

**Files:**
- Modify: `opencode-config/skills/registry.json`
- Create: `scripts/check-skill-overlap-governance.mjs`
- Modify: `docs/skills/OVERVIEW.md`
- Test: `scripts/tests/skill-profile-loader.test.js`

**Step 1: Write failing governance tests**

Add tests for overlap policy:
- overlapping skills must include canonical entrypoint annotation
- conflict pairs must be symmetric where required

**Step 2: Run tests to confirm fail**

Run: `bun test scripts/tests/skill-profile-loader.test.js`
Expected: FAIL for missing policy metadata

**Step 3: Add canonical overlap metadata**

In `registry.json`, annotate overlap clusters:
- browser cluster (`dev-browser`, `agent-browser`)
- debugging cluster (`systematic-debugging`, `code-doctor`, `incident-commander`)
- orchestration cluster (`task-orchestrator`, `skill-orchestrator-runtime`)

Define preferred entry skill per cluster.

**Step 4: Implement overlap checker script**

Create `scripts/check-skill-overlap-governance.mjs` to fail when:
- overlap cluster has no canonical skill
- unresolved conflict metadata exists
- skill in cluster has no `avoidWhen` guidance

**Step 5: Update docs**

In `docs/skills/OVERVIEW.md`, document:
- merge/retire rule (>30 days low usage and no eval coverage)
- head-to-head merge trigger (neither skill wins >70%)

**Step 6: Run checks**

Run:
- `node scripts/check-skill-overlap-governance.mjs`
- `node scripts/skill-profile-loader.mjs validate`

Expected: PASS

**Step 7: Commit**

```bash
git add opencode-config/skills/registry.json scripts/check-skill-overlap-governance.mjs docs/skills/OVERVIEW.md scripts/tests/skill-profile-loader.test.js
git commit -m "chore(skills): add overlap governance and canonical entrypoints"
```

### Task 5: Release Gates for Add/Retire Decisions

**Files:**
- Create: `scripts/run-skill-routing-gates.mjs`
- Modify: `scripts/check-skill-consistency.mjs`
- Modify: `opencode-config/learning-updates/README.md` (or nearest governance doc)
- Create: `.sisyphus/evidence/skill-routing-governance/` (artifacts)

**Step 1: Write failing gate harness tests**

Add tests for `run-skill-routing-gates.mjs` exit behavior when thresholds breach.

**Step 2: Run tests to verify fail**

Run: `bun test scripts/tests/skill-profile-loader.test.js`
Expected: FAIL for missing gate command or threshold logic

**Step 3: Implement gate runner script**

Create `scripts/run-skill-routing-gates.mjs` to execute:
- `node scripts/skill-profile-loader.mjs validate`
- `node scripts/check-skill-consistency.mjs`
- `node scripts/check-skill-overlap-governance.mjs`
- `node scripts/skill-routing-evaluator.mjs`

Fail non-zero if any metric breaches thresholds.

**Step 4: Capture evidence outputs**

Run:
- `node scripts/run-skill-routing-gates.mjs > .sisyphus/evidence/skill-routing-governance/gate-pass.txt 2>&1`

Expected: exit 0 and threshold summary in output.

**Step 5: Commit**

```bash
git add scripts/run-skill-routing-gates.mjs scripts/check-skill-consistency.mjs .sisyphus/evidence/skill-routing-governance/
git commit -m "chore(release): enforce skill routing quality gates"
```

### Task 6: Evaluation-Driven Skill Expansion (No Blind Additions)

**Files:**
- Modify: `docs/skills/CREATING-SKILLS.md`
- Modify: `docs/skills/COMPOSITION.md`
- Create: `scripts/evals/skill-routing-byzantine-fixtures.json`
- Test: `scripts/skill-routing-evaluator.mjs`

**Step 1: Add byzantine fixture set**

Create evaluation fixture with hard ambiguous tasks across overlap clusters.

**Step 2: Add policy docs for accepting new skills**

In docs, require one of:
- +2pp one-pass correctness improvement
- 20% relative switch-rate reduction

for introducing net-new skills.

**Step 3: Run evaluator against byzantine fixtures**

Run:
- `node scripts/skill-routing-evaluator.mjs --fixture scripts/evals/skill-routing-byzantine-fixtures.json`

Expected: machine-readable score report with pass/fail against thresholds.

**Step 4: Commit**

```bash
git add docs/skills/CREATING-SKILLS.md docs/skills/COMPOSITION.md scripts/evals/skill-routing-byzantine-fixtures.json
git commit -m "docs(skills): require eval gains for adding new skills"
```

### Task 7: Final Verification and Rollback Proof

**Files:**
- Modify: `.sisyphus/plans/2026-02-27-skill-selection-architecture-upgrade.md` (checklist state if tracked)
- Create: `.sisyphus/evidence/skill-routing-governance/release-summary.md`

**Step 1: Run full gate suite**

Run:
- `node scripts/run-skill-routing-gates.mjs`
- `bun test`

Expected: PASS with exit 0

**Step 2: Rehearse rollback boundary**

Run (dry run first):
- `node scripts/model-rollback.mjs --help`
- `git log --oneline -10`

Document exact rollback target commit and recovery command path in summary.

**Step 3: Capture release evidence**

Create `.sisyphus/evidence/skill-routing-governance/release-summary.md` including:
- gate outputs
- thresholds status
- rollback boundary

**Step 4: Commit**

```bash
git add .sisyphus/evidence/skill-routing-governance/ docs/plans/2026-02-27-skill-selection-architecture-upgrade.md
git commit -m "chore(release): verify skill selection architecture upgrade"
```

---

## Verification Checklist

- `node scripts/skill-profile-loader.mjs validate` passes
- `node scripts/check-skill-consistency.mjs` passes
- `node scripts/check-skill-overlap-governance.mjs` passes
- `node scripts/skill-routing-evaluator.mjs --fixture scripts/evals/skill-routing-byzantine-fixtures.json` passes thresholds
- `node scripts/run-skill-routing-gates.mjs` passes end-to-end
- `bun test` passes or reports only pre-existing unrelated failures

## Success Criteria

- Ambiguity rate <= 15%
- Skill switch rate <= 10%
- One-pass correctness >= 85%
- Median routing latency <= 200ms
- Context overhead from skill-loading <= 5%
- Net-new skill proposals require measured gain (+2pp one-pass or -20% switch rate)
