# System Priorities Cascading Catalyzation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve the next five highest-priority system issues in an order that converts uncertainty into signal, hardens release controls, and then improves operator experience and learning quality.

**Architecture:** Start by replacing synthetic performance confidence with real measurements, then harden governance and CI so later improvements are automatically protected. Once the release path is trustworthy, improve runtime remediation UX for context budgets and then eliminate SkillRL cold-start degradation so fresh installs surface meaningful learning data immediately.

**Tech Stack:** Bun, Node.js scripts (`.mjs`), Next.js 14 App Router, GitHub Actions, workspace packages (`opencode-learning-engine`, `opencode-context-governor`, `opencode-model-manager`, `opencode-dashboard`, `opencode-skill-rl-manager`)

---

## Problem Set

1. **Autosave has no real measurement** — `scripts/perf/fg02-hotpath-io.mjs` uses synthetic timing floors and does not establish actual I/O overhead.
2. **Governance gates need explicit verification/hardening** — `learning-gate.mjs` and `deployment-state.mjs` exist and run in CI, but the behavior and failure modes need first-class validation and developer-facing confidence.
3. **Performance baseline is not enforced as a first-class CI signal** — `scripts/perf-baseline.mjs` exists, but the regression signal is still too manual.
4. **Context budget alerts tell operators there is a problem, but not what to do next** — thresholds exist across Governor, ContextBridge, AlertManager, and dashboard, but remediation guidance is fragmented.
5. **SkillRL cold-start experience degrades to demo/fallback behavior** — fresh installs have no seeded state, so `/api/skills` and `/api/rl` begin with low-fidelity data.

---

## Workstream 1: Replace Synthetic Autosave Confidence with Real Measurement

**Intent:** Turn fg02 from a “can measure in theory” harness into a trustworthy, repeatable real-I/O benchmark for autosave behavior.

**Files:**
- Modify: `scripts/perf/fg02-hotpath-io.mjs`
- Create: `scripts/perf/lib/measure-autosave-io.mjs`
- Modify: `packages/opencode-learning-engine/src/index.js` (only if a non-invasive timing hook is needed)
- Test: `packages/opencode-learning-engine/test/autosave-debounce.test.js`
- Test: `integration-tests/context-management.test.js` (only if cross-package verification is needed)

### Discovery / design tasks

**Step 1: Confirm the benchmark target**

Decide whether fg02 measures:
- only `LearningEngine` autosave, or
- both `LearningEngine` and `Governor` persistence paths.

Expected output: a short benchmark contract documenting the scope and what counts as “autosave overhead.”

**Step 2: Identify the true timing window**

Measure separately:
- mutation loop time with autosave off,
- mutation loop time with autosave on,
- post-debounce flush latency,
- total wall-clock time until writes settle.

Expected output: one timing model that explains where overhead actually occurs.

### Implementation tasks

**Step 3: Write failing benchmark assertions first**

Add a benchmark helper that records:
- baseline mutation time,
- autosave mutation time,
- flush completion time,
- overhead ratio,
- absolute added latency.

The initial assertion should fail if the script still reports `synthetic: true` or if it still relies on `Math.max(elapsed, BASELINE_ELAPSED_MS)`.

**Step 4: Replace the synthetic baseline logic**

Remove hardcoded synthetic timing floors in `scripts/perf/fg02-hotpath-io.mjs`.

Use real file-system timing with:
- isolated temp directory,
- controlled debounce interval,
- explicit wait for persistence completion,
- repeated runs to smooth variance.

**Step 5: Add stable tolerance rules**

Define thresholds that are meaningful in CI:
- relative threshold (ratio vs. baseline),
- absolute threshold (added milliseconds),
- variance tolerance across runs,
- optional warm-up discard.

**Step 6: Add focused regression tests**

Add a test that verifies debouncing coalesces many rapid mutations into a bounded number of persistence operations.

If instrumentation is needed, keep it opt-in via env var or internal hook so runtime behavior does not change.

### Acceptance criteria

- `scripts/perf/fg02-hotpath-io.mjs` no longer emits `synthetic: true`.
- The benchmark reports real baseline, flush, and overhead numbers from actual I/O.
- The benchmark is deterministic enough to run in CI without flapping.
- There is at least one non-benchmark test proving debounce coalescing behavior.

### Risks / constraints

- Real I/O benchmarks can flap in GitHub Actions if thresholds are too aggressive.
- Instrumentation can distort the measurement if it is always on.
- Do not silently broaden scope into a full performance suite rewrite.

### Verification

Run:
- `bun run scripts/perf/fg02-hotpath-io.mjs`
- `bun run scripts/perf-baseline.mjs --check --verbose`
- `bun test packages/opencode-learning-engine/test/autosave-debounce.test.js`

Expected:
- real timing values,
- stable pass/fail behavior,
- no synthetic marker in fg02 output.

---

## Workstream 2: Verify and Harden Governance Gates

**Intent:** Make governance checks trustworthy, explainable, and hard to bypass accidentally.

**Files:**
- Modify: `scripts/learning-gate.mjs`
- Modify: `scripts/deployment-state.mjs`
- Modify: `.github/workflows/governance-gate.yml`
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/tests/learning-gate.test.mjs`
- Create: `scripts/tests/deployment-state.test.mjs`
- Create: `docs/architecture/governance-gate-contract.md`

### Discovery / design tasks

**Step 1: Enumerate gate outcomes**

Document what should happen for:
- clean branch,
- governed config drift,
- missing hash refresh,
- invalid deployment promotion,
- malformed deployment state,
- no-op change set.

**Step 2: Compare local vs CI invocation**

Verify whether local `bun run governance:check` and GitHub Actions invoke the same logic, same base SHA behavior, and same failure semantics.

### Implementation tasks

**Step 3: Write failure-mode tests first**

Add tests for:
- bad `--base` input sanitization in `learning-gate.mjs`,
- changed governed file with stale hashes,
- invalid environment transitions in `deployment-state.mjs`,
- corrupt or missing deployment state file.

**Step 4: Make failure output actionable**

Improve script output so failures tell developers exactly how to recover:
- which file changed,
- why it violates policy,
- what command to run next,
- what artifact to refresh.

**Step 5: Unify gate entrypoints**

Ensure there is one authoritative path for:
- local developer verification,
- CI verification,
- PR verification.

Avoid duplicated-but-drifting shell logic between workflows.

**Step 6: Add explicit contract documentation**

Document:
- when each gate runs,
- what it validates,
- what can fail,
- what developers do to resolve each class of failure.

### Acceptance criteria

- Governance scripts have automated tests covering the main failure modes.
- Workflow invocation path is documented and consistent.
- A failed governance run tells the user exactly how to recover.
- CI and local execution produce compatible pass/fail behavior.

### Risks / constraints

- Over-hardening can make legitimate config updates painful.
- Git SHA assumptions can differ between PR and push workflows.
- Do not weaken governed-path enforcement to reduce noise.

### Verification

Run:
- `bun run governance:check`
- `bun test scripts/tests/learning-gate.test.mjs`
- `bun test scripts/tests/deployment-state.test.mjs`

Expected:
- local governance path passes,
- negative tests fail for the right reason,
- workflow logic remains aligned with local command behavior.

---

## Workstream 3: Promote Performance Baselines into First-Class CI Gates

**Intent:** Convert performance regression checks from a manual safety net into an always-on guardrail.

**Files:**
- Modify: `scripts/perf-baseline.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/governance-gate.yml` (only if perf belongs there too)
- Create: `.github/workflows/perf-regression.yml` (if a dedicated workflow is cleaner than growing `ci.yml`)
- Modify: `scripts/perf/baselines/current.json` (only when intentionally refreshing the canonical baseline)
- Create: `docs/architecture/performance-regression-policy.md`

### Discovery / design tasks

**Step 1: Decide enforcement shape**

Choose one of:
- perf runs in the main CI workflow,
- perf runs in a dedicated workflow required by branch protection,
- perf runs only on selected path changes.

The decision should optimize signal quality over raw coverage.

**Step 2: Define baseline ownership**

Document:
- who is allowed to refresh `current.json`,
- what evidence is required before refresh,
- when a regression should fail vs warn.

### Implementation tasks

**Step 3: Add machine-friendly output mode**

If needed, extend `scripts/perf-baseline.mjs` with CI-friendly output:
- clear exit codes,
- explicit warn/fail counts,
- optional JSON summary artifact.

**Step 4: Wire the workflow**

Add a CI job that:
- installs Bun,
- runs the perf baseline check,
- uploads a comparison artifact on failure,
- clearly labels the failure as performance regression rather than generic script failure.

**Step 5: Prevent accidental baseline drift**

Require intentional baseline refreshes.

Suggested rule:
- baseline file changes must be accompanied by a note in PR body or a changelog/plan reference.

### Acceptance criteria

- CI fails when perf metrics regress beyond approved tolerances.
- CI artifacts show which metric regressed and by how much.
- Baseline refresh is explicit, reviewable, and documented.
- Manual local usage still works the same for developers.

### Risks / constraints

- Perf CI can become flaky if Workstream 1 thresholds are not stable first.
- Over-enforcement can train developers to refresh baselines casually.
- Under-enforcement makes the whole job decorative.

### Verification

Run locally:
- `bun run scripts/perf-baseline.mjs --check --verbose`

Verify in workflow:
- a deliberate regression causes the perf job to fail,
- a clean run passes,
- the artifact or log clearly names the regressed metric.

---

## Workstream 4: Add Actionable Remediation Guidance to Context Budget Alerts

**Intent:** When the system says budget is at 75%, 80%, 85%, or 95%, it should also say exactly what action is required next.

**Files:**
- Modify: `packages/opencode-model-manager/src/monitoring/alert-manager.js`
- Modify: `packages/opencode-integration-layer/src/context-bridge.js`
- Modify: `packages/opencode-context-governor/src/index.js`
- Modify: `packages/opencode-dashboard/src/app/api/budget/route.ts`
- Modify: `packages/opencode-dashboard/src/app/observability/page.tsx`
- Create: `packages/opencode-model-manager/test/monitoring/alert-manager-budget-guidance.test.js`
- Create: `packages/opencode-dashboard/tests/api/budget-route.test.ts`
- Create: `docs/architecture/context-budget-remediation-policy.md`

### Discovery / design tasks

**Step 1: Normalize thresholds across layers**

Reconcile the current thresholds:
- ContextBridge proactive compression at 65%,
- dashboard warn at 75%,
- Governor / AlertManager critical at 80%,
- ContextBridge block at 85%,
- AlertManager emergency at 95%.

Produce one threshold table with one meaning per threshold.

**Step 2: Define operator actions per threshold**

For each threshold, specify:
- whether work may continue,
- whether compression is recommended or mandatory,
- whether model downgrading is recommended,
- whether the operation must be blocked,
- what to do if compression fails.

### Implementation tasks

**Step 3: Enrich alert payloads**

Add structured guidance fields to budget alerts, e.g.:
- `recommended_action`,
- `must_compress`,
- `must_block`,
- `next_step`,
- `grace_period_ms`,
- `remediation_steps`.

**Step 4: Surface the same guidance in dashboard budget summaries**

Extend `/api/budget` so the dashboard gets the same normalized guidance the runtime uses.

Do not leave the UI to reverse-engineer remediation from raw percentages.

**Step 5: Update observability UI**

Show guidance inline:
- warning cards for 75%,
- mandatory compression card for 80%,
- blocked-state UI for 85%+, 
- emergency recovery guidance for 95%.

**Step 6: Add policy documentation**

Document what each threshold means operationally and how it maps to the UI and runtime actions.

### Acceptance criteria

- Every budget alert includes actionable remediation metadata.
- Dashboard budget rows/cards show the next action, not just raw percentages.
- Threshold semantics are consistent across runtime, API, and UI.
- Tests cover warning, critical, block, and recovery states.

### Risks / constraints

- Threshold drift across packages will confuse users if not unified first.
- UI-only guidance without runtime metadata will rot.
- Runtime-only guidance without UI surfacing will remain invisible.

### Verification

Run:
- `bun test packages/opencode-model-manager/test/monitoring/alert-manager-budget-guidance.test.js`
- `bun test packages/opencode-dashboard/tests/api/budget-route.test.ts`
- `bun test integration-tests/context-management.test.js`
- `bun run build` in `packages/opencode-dashboard`

Expected:
- consistent guidance across alert payloads and dashboard,
- build passes,
- threshold behavior is test-covered.

---

## Workstream 5: Improve SkillRL Cold-Start Experience

**Intent:** Fresh installs should show useful, honest starter learning state instead of falling back to low-fidelity demo or unavailable data.

**Files:**
- Modify: `packages/opencode-skill-rl-manager/src/index.js`
- Modify: `packages/opencode-skill-rl-manager/src/skill-bank.js`
- Create: `opencode-config/skill-rl-seed.json`
- Modify: `packages/opencode-dashboard/src/app/api/skills/route.ts`
- Modify: `packages/opencode-dashboard/src/app/api/rl/route.ts`
- Modify: `integration-tests/skillrl-api-regression.test.js`
- Create: `packages/opencode-skill-rl-manager/test/fresh-state-seed.test.js`
- Create: `docs/architecture/skillrl-cold-start-policy.md`

### Discovery / design tasks

**Step 1: Decide seed philosophy**

Pick one explicit model:
- static curated seed from repo,
- generated seed from canonical repo telemetry snapshot,
- empty-but-valid live schema with no demo data.

Recommendation: use a curated starter seed plus explicit provenance metadata.

**Step 2: Define honesty rules**

Cold-start data must be truthful.

Differentiate clearly between:
- `seeded`,
- `live`,
- `degraded`,
- `demo`,
- `unavailable`.

### Implementation tasks

**Step 3: Add fresh-state initialization path**

On first initialization, if no `skill-rl.json` exists:
- create a valid starter state from `opencode-config/skill-rl-seed.json`,
- annotate it with metadata like `seeded_at`, `seed_source`, and `data_fidelity: seeded`.

**Step 4: Tighten API contracts**

Update `/api/skills` and `/api/rl` so they:
- prefer live state,
- fall back to seeded state,
- only fall back to demo when the seed path is unavailable or corrupt.

**Step 5: Expand regression coverage**

Cover:
- missing file,
- malformed file,
- valid seeded file,
- later live-updated file.

### Acceptance criteria

- Fresh install produces a valid seeded SkillRL state automatically.
- Dashboard APIs report `seeded` fidelity instead of generic demo/fallback where possible.
- Demo mode becomes a true last-resort fallback, not the default cold-start experience.
- Tests cover seed creation, upgrade to live data, and malformed state fallback.

### Risks / constraints

- Seeded data must not be misrepresented as learned-from-user behavior.
- Seed initialization must stay cross-process safe with existing lock behavior.
- Do not create hidden coupling to one machine’s local telemetry.

### Verification

Run:
- `bun test integration-tests/skillrl-api-regression.test.js`
- `bun test packages/opencode-skill-rl-manager/test/fresh-state-seed.test.js`
- manually remove `~/.opencode/skill-rl.json` and confirm a fresh valid state is created on init.

Expected:
- first-run state is seeded and valid,
- APIs expose honest fidelity metadata,
- malformed-state fallback still works.

---

## Meta-Plan: Order of Cascading Catalyzation

This is the recommended implementation order if the goal is to maximize enabling value, reduce rework, and make later work safer.

### Phase 0: Preflight capture

Before touching code:
- run `bun test`
- run `bun run governance:check`
- run `bun run scripts/perf-baseline.mjs --check --verbose`
- capture current behavior of `/api/budget`, `/api/skills`, and `/api/rl`

This gives a clean “before” snapshot.

### Phase 1: Real autosave measurement (Workstream 1)

**Why first:** it converts a false signal into a true signal.

Without this, any CI perf gate will be enforcing synthetic confidence rather than real performance. This phase sharpens the truth that later phases depend on.

### Phase 2: Governance verification and hardening (Workstream 2)

**Why second:** it hardens the release path before we add more required checks.

Once perf and runtime guidance changes start landing, governance has to be trusted. Otherwise later improvements can still be merged through ambiguous or weak controls.

### Phase 3: CI perf enforcement (Workstream 3)

**Why third:** once measurement is real and governance is trusted, make regression protection automatic.

This is the point where performance work becomes self-defending.

### Phase 4: Context budget remediation guidance (Workstream 4)

**Why fourth:** now that the system’s signals and gates are reliable, improve runtime operator behavior.

This phase increases operational clarity and reduces wasted debugging/decision time in active sessions.

### Phase 5: SkillRL cold-start improvement (Workstream 5)

**Why fifth:** high value, but not as safety-critical as the earlier phases.

This is the right moment to improve first-run quality because the surrounding observability, governance, and CI controls are already stronger.

---

## Sequencing Rules

1. **Do not start Workstream 3 before Workstream 1 is complete.** Otherwise CI will encode synthetic performance assumptions.
2. **Do not call governance “done” without local + CI parity.** Local-only confidence is insufficient.
3. **Do not implement budget guidance only in the UI.** The runtime/API contract must own the truth.
4. **Do not seed SkillRL with misleading pseudo-live data.** Seeded must remain explicitly seeded.

---

## Cross-Workstream Verification Matrix

At the end of the full sequence, run all of the following:

- `bun test`
- `bun run governance:check`
- `bun run scripts/perf-baseline.mjs --check --verbose`
- `bun test integration-tests/`
- `bun run build` in `packages/opencode-dashboard`

And verify manually:
- dashboard observability page still loads,
- budget cards show next-step guidance,
- `/api/skills` and `/api/rl` expose honest fidelity on fresh state,
- CI workflow graph shows the new perf gate in the intended place.

---

## Suggested Delivery Milestones

1. **Milestone A:** real autosave benchmark + stable thresholds
2. **Milestone B:** governance hardening + documented recovery paths
3. **Milestone C:** perf baseline enforced in CI
4. **Milestone D:** context budget remediation surfaced runtime→API→UI
5. **Milestone E:** seeded SkillRL cold start with honest fidelity metadata

---

## Definition of Done for the Full Program

The full plan is complete when:

- performance regression detection uses real measurement,
- governance behavior is tested and locally/CI consistent,
- perf regressions fail automatically in CI,
- budget alerts prescribe specific next actions,
- fresh installs no longer degrade to empty/demo learning state by default.
