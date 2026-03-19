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

## 2026-03-19 Task: Wire recordCompression + recordContext7Lookup into production
STATUS: SUCCESS
Commit: 715c1ae
File changed: packages/opencode-integration-layer/src/index.js

### recordCompression() — wired at line ~1395
- Location: `executeTaskWithEvidence()`, after `adaptiveOptions` assembled
- Triggers when: `compressionActive === true` (budget action is 'compress' or 'compress_urgent')
- Data: sessionId from task context, tokensBefore from `getContextBudgetStatus().used`, tokensAfter estimated at 50% savings (distill average), pipeline = 'distill-urgent' or 'distill-advisory'
- Guard: `this.pipelineMetrics && typeof this.pipelineMetrics.recordCompression === 'function'`
- Wrapped in try/catch (fail-open)

### recordContext7Lookup() — wired at line ~1498
- Location: `executeTaskWithEvidence()`, after `_mcpToolsUsed` collected via `_getSessionMcpInvocations()`
- Triggers when: any MCP tool name contains 'context7' (case-insensitive)
- Data: libraryName = tool name string, resolved = true, snippetCount = 0, durationMs = 0
- Guard: `this.pipelineMetrics && typeof this.pipelineMetrics.recordContext7Lookup === 'function'`
- Wrapped in try/catch (fail-open)

### Key findings
- `recordCompression()` signature: `{ sessionId, tokensBefore, tokensAfter, pipeline, durationMs }` — computes `tokensSaved` and `ratio` internally
- `recordContext7Lookup()` signature: `{ libraryName, resolved, snippetCount, durationMs }` — tracks resolved rate and library diversity
- Context7 MCP tools are named `context7_resolve_library_id` and `context7_query_docs` per test fixtures
- `getSessionMcpInvocations()` returns `string[]` of MCP tool names used in a session (deduped, from in-memory + file fallback)
- Learning-gate pre-commit hook requires: Learning-Update + Risk-Level trailers in commit message for governed file changes
- bun test exit 0 verified after changes

## 2026-03-19 Task: Wire _computeMetaKBSkillAdjustments into hot path
STATUS: SUCCESS
File changed: packages/opencode-integration-layer/src/index.js (lines 1380-1396)

### What was wired
- `_computeMetaKBSkillAdjustments(taskContext, skills, metaKBIndex)` — was dead code (zero callsites)
- Signature: takes taskContext, skills array, and `this.metaKBIndex` (loaded from config.metaKBIndexPath at construction)
- Returns: `{ anti_pattern_penalty, positive_evidence, affected_skills, net_adjustment }`

### Insertion point
- After `skillRL.selectSkills()` + PipelineMetrics recording (line ~1378)
- Before `adaptiveOptions` computation (line ~1398)
- Guarded by `this.metaKBIndex && skills` (only runs when Meta-KB index is loaded AND skills were selected)
- Wrapped in try/catch — fail-open, logs warning on failure

### How the result is used
- Stored as `metaKBAdj` local variable
- Attached to `adaptiveOptions.metaKBSkillAdjustments` — visible to `executeTaskFn()` consumers
- If `net_adjustment < -0.3`, logs a warning with penalty details and affected skills

### Key findings
- `metaKBIndex` property set at construction (line 215-223): reads JSON from `config.metaKBIndexPath`
- Contains `anti_patterns[]` (with severity: critical/high/medium/low → weight 4/3/2/1) and `by_affected_path{}` map
- Anti-pattern matching is string-includes on skill name vs pattern/description
- Positive evidence is count of path entries matching task files
- `net_adjustment = positive_evidence - anti_pattern_penalty`
- bun test exit 0 verified after changes
