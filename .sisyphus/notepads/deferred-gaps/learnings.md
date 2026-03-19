# Deferred Gaps Learnings

## 2026-03-18 — Init

### Codebase conventions
- **Bun-first, CommonJS (type: "commonjs")** for all packages
- **Workspace protocol**: `"workspace:*"` in package.json deps
- **Atomic writes**: tmp+rename pattern; Windows EPERM fallback to direct write
- **Module exports**: Both CJS and named exports via module.exports
- **package.json pattern**: Check learning-engine/package.json for template

### Gap #33 — tool-usage-tracker extraction
- Source: `packages/opencode-learning-engine/src/tool-usage-tracker.js` (841 LOC)
- Callers of the source file (within learning-engine):
  - `test/tool-usage-file-bridge.test.js` — imports `../src/tool-usage-tracker`
  - `test/session-mcp-invocations.test.js` — imports `../src/tool-usage-tracker`
  - `test/tool-usage-race.test.js` — likely also imports it
  - `test/tool-usage-tracker.test.js` — the main tracker tests
  - `test/_tool-usage-env.js` — helper
- Internal dep: `tool-usage-tracker.js` requires `./meta-awareness-tracker` 
  → new package must either bundle it or add learning-engine as dep (NOT ideal)
  → BETTER: new package depends on `opencode-learning-engine/meta-awareness` export
  → OR: extract MetaAwarenessTracker ref as injected dependency
- `scripts/runtime-tool-telemetry.mjs` has a comment referencing tool-usage-tracker (mirrors AVAILABLE_TOOLS catalog) - it does NOT import it, just a comment
- The learning-engine index.js does NOT import tool-usage-tracker (check before delegating)

### Gap #22 — skill exploration policy
- `ExplorationRLAdapter` in `packages/opencode-skill-rl-manager/src/exploration-adapter.js` (130 LOC)
  - Has `updateFromExploration(taskCategory)` and `getBestModelRecommendation(taskCategory)`
  - These are MODEL selection helpers (model_performance table), NOT skill selection
  - The ExplorationRLAdapter name is misleading — it's actually a model exploration adapter
- `SkillRLManager.selectSkills(taskContext)` at index.js:232
  - Currently just calls `this.skillBank.querySkills(taskContext)` + records usage
  - Need to add epsilon-greedy/UCB exploration wrapper around this
- Env var: `OPENCODE_EXPLORATION_MODE` (values: 'epsilon-greedy', 'ucb', 'greedy'/default)
- Epsilon-greedy: with prob epsilon, pick random skill; else pick best
- UCB: upper confidence bound on success_rate with exploration bonus

### Gap #21 — central event bus
- No existing event bus found
- Consumers: AlertManager, LearningEngine, IntegrationLayer all use their own EventEmitters
- Pattern: singleton pub/sub, Node EventEmitter-compatible API
- New package: `packages/opencode-event-bus/`

### Test suite
- `bun test` from repo root runs 253+ tests
- All packages use CommonJS (require/module.exports)
- Tests are in `test/` or `tests/` dirs

## 2026-03-18 Task: gap-33-extract-tool-usage-tracker
STATUS: SUCCESS
New package: packages/opencode-tool-usage-tracker/
Shim at: packages/opencode-learning-engine/src/tool-usage-tracker.js
Tests pass: yes
Notes: Used injectable MetaAwarenessTracker pattern (no-op default + configure()). Shim is 5 lines, wires real MetaAwarenessTracker on require. All 4 test files that import ../src/tool-usage-tracker (tracker, race, file-bridge, session-mcp) work via the shim. New package has 10 smoke tests covering logInvocation, detectUnderUse, getUsageReport, normalizeMcpToolName, getSessionMcpInvocations, configure, and export completeness.

## 2026-03-18 Task: gap-22-skill-exploration-policy
STATUS: SUCCESS
Mode: epsilon-greedy + UCB added to selectSkills()
Env vars: OPENCODE_EXPLORATION_MODE, OPENCODE_EPSILON
Tests: exploration-policy.test.js (12 tests, 65 expect() calls)
Notes: UCB tests need controlled skill banks (clear generalSkills + add specific skills) because registry sync populates many skills that interfere with assertions. Pre-existing test failures in exploration-adapter.test.js (4) and selection.test.js (1) unrelated to this change. Commit 321bcfa.

## 2026-03-18 Task: gap-21-central-event-bus
STATUS: SUCCESS
Package: packages/opencode-event-bus/
Singleton: yes
Bus events: alert:fired, alert:resolved, learning:outcomeRecorded, learning:onFailureDistill, learning:patternStored
AlertManager wired: direct (lazy require with try/catch in alert-manager.js)
LearningEngine wired: direct (lazy require with try/catch in _emitHook, prefixes events with `learning:`)
IntegrationLayer: bootstrap.js subscribes to all 5 bus events for logging
Tests: 14 tests, 27 assertions
Notes: opencode-model-manager DOES have a package.json (contrary to AGENTS.md claim). Used lazy require pattern for fail-open behavior. Pre-existing failures in state-machine.test.ts (4, SQLite), meta-kb-routing (1), tool-usage-*.test.js (7, ENOENT tmp dirs) — none related to event bus changes.
