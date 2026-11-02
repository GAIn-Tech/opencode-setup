# Wave 11: Performance Optimization & Context Management Activation

> **Status**: COMPLETED (all 25/25 tasks validated and closure artifacts reconciled)
> **Scope**: 5 tracks, 25 tasks across 4 phases
> **Dependencies**: Wave 10 (System Hardening) COMPLETE

> **Reconciliation Update (2026-03-26)**
> - ✅ Task 9 complete: `opencode-config/agents/librarian.md` added with explicit Context7-first workflow.
> - ✅ Task 11 complete: WAL pragmas + prepared-statement cache path added in `packages/opencode-model-manager/src/monitoring/metrics-collector.js`.
> - ✅ Task 24 complete: `.sisyphus/boulder.json` now tracks Wave11 as active (`completed: 24`, `current_task: Task 25`).
> - ✅ Task 25 complete: targeted Wave11 suite passed (117/117), governance gates passed (6/6), health-check has 0 failures (1 non-blocking warning), and full `bun test` passes after metrics shape normalization fix in `packages/opencode-tool-usage-tracker/src/index.js`.

## Goal

Two convergent objectives:
1. **Activate context management tools** — distill, context7, context-governor, and DCP are configured but dormant. Wire them into runtime so they actually fire, are observable, and save tokens.
2. **Performance optimization** — cache hot paths (model routing, pattern matching, skill-RL), enable SQLite WAL, add startup instrumentation, fix memory leaks.

## Motivation

User observation: "We're still not seeing distill, context7, or any of our context management/pruning tools being used visibly." All four MCPs/plugins are configured but none execute at runtime. Governor thresholds (75% WARN, 80% CRITICAL) exist but trigger zero automatic actions. Token savings are hypothetical.

## Tracks

### Track A: Context Governor Activation
### Track B: Distill & DCP Integration
### Track C: Context7 & Librarian Wiring
### Track D: Performance Hot-Path Optimization
### Track E: Observability & Validation

## DO NOT

- Add vector databases, embeddings, RAG, or semantic search
- Make distill or context-governor a hard dependency that crashes on absence
- Change Governor budget thresholds (75%/80% are correct)
- Change TokenCostCalculator pricing table format
- Break backward compatibility in any public API
- Remove null-safe Governor fallback in TokenBudgetManager — add alongside it
- Auto-prune context without user visibility (always log before pruning)

---

## Phase 1: Foundation — Enable the Plumbing (Tasks 1-7)

### Task 1: Enable context-governor MCP server
- **File**: `opencode-config/opencode.json` (line ~719)
- **Current state**: context-governor MCP registered but `enabled: false`
- **Do**: Set `enabled: true`
- **Do**: Verify the command (`node packages/opencode-context-governor/src/index.js`) works as MCP server — if not, create a minimal MCP wrapper that exposes `checkBudget`, `consumeTokens`, `getRemainingBudget` as MCP tools
- **Do NOT**: Change the Governor class internals — only the MCP registration
- **Acceptance**: `enabled: true` in opencode.json, MCP server starts without errors

### Task 2: Create context-governor skill file
- **File**: `opencode-config/skills/context-governor/SKILL.md`
- **Current state**: No skill file exists — agents don't know how to invoke budget checking
- **Do**: Create SKILL.md following the exact pattern of `skills/distill/SKILL.md` (frontmatter, overview, when to use, workflow, must do/must not do, handoff protocol, output contract)
- **Do**: Define calling conventions: `mcp_context_governor_check_budget`, `mcp_context_governor_get_remaining`
- **Do**: Add to `opencode-config/skills/registry.json` with category `optimization`, synergies `["distill", "budget-aware-router"]`
- **Do**: Add `"context-governor"` to `compound-engineering.json` enabled skills list
- **Acceptance**: SKILL.md exists, registered in registry.json, enabled in compound-engineering.json

### Task 3: Wire Governor into IntegrationLayer actively
- **File**: `packages/opencode-integration-layer/src/index.js`
- **Current state**: Lines 56-59 import contextGovernor, line 130 exposes it, but no code calls checkBudget() or consumeTokens()
- **Do**: Add `checkContextBudget(sessionId, model, proposedTokens)` method that delegates to Governor.checkBudget() and returns the status
- **Do**: Add `recordTokenUsage(sessionId, model, count)` method that delegates to Governor.consumeTokens()
- **Do**: Add `getContextBudgetStatus(sessionId, model)` method for dashboard/CLI queries
- **Do**: Log budget warnings (WARN at 75%, ERROR at 80%) via the structured logger
- **Do NOT**: Make Governor mandatory — keep fail-open pattern, return `{ allowed: true, status: 'unknown' }` if Governor is null
- **Acceptance**: Three new public methods on IntegrationLayer, budget warnings logged at thresholds, existing tests still pass

### Task 4: Add budget-aware model selection to ModelRouter
- **File**: `packages/opencode-model-router-x/src/index.js`
- **Current state**: TokenBudgetManager only used for exploration checks (shouldExplore). Main `_scoreModel()` doesn't consider remaining budget.
- **Do**: In `_scoreModel()`, after existing scoring signals, add budget-aware penalty: if session budget is ≥80% consumed, penalize high-cost models by -0.10 to -0.15 (encouraging cheaper alternatives)
- **Do**: Use TokenBudgetManager.governor.checkBudget() with the current session context
- **Do NOT**: Change scoring weights for existing signals — this is a NEW supplementary signal, same pattern as T12/T13 in Wave 10
- **Do NOT**: Block model selection based on budget — only adjust scores
- **Acceptance**: Budget penalty applied in _scoreModel(), high-cost models deprioritized when budget >80%, test coverage for the new signal

### Task 5: Model ID resolution optimization (O(n) → O(1))
- **File**: `packages/opencode-model-router-x/src/index.js` (lines ~415-466)
- **Current state**: `_resolveModelId()` iterates sequentially through provider prefixes for every model lookup
- **Do**: Build a static Map of `modelId → resolvedModel` on construction or first use (lazy)
- **Do**: Fall back to current sequential scan for unknown models (backward compat)
- **Do NOT**: Remove the sequential scan — keep it as fallback for dynamically added models
- **Acceptance**: Map-based lookup on known models, O(1) resolution, sequential fallback for unknown

### Task 6: Pattern matching cache for LearningEngine.advise()
- **File**: `packages/opencode-learning-engine/src/index.js` (lines ~581-668) and `src/orchestration-advisor.js`
- **Current state**: Every advise() call scans all anti-patterns with no caching
- **Do**: Add a Map-based cache keyed by `taskType + complexity` with 5-minute TTL and 500-entry max
- **Do**: Cache the advisor response (anti-pattern matches + skill recommendations), invalidate on learning update
- **Do**: Use a lightweight hash function (not JSON.stringify) for cache keys
- **Do NOT**: Cache if the task context contains session-specific signals (quotaSignal, rotator risk) — only cache stable task-type patterns
- **Acceptance**: Cached responses on repeated task types, ≤5ms for cache hits, existing advise() tests still pass

### Task 7: Skill-RL memoization in ModelRouter
- **File**: `packages/opencode-model-router-x/src/index.js` (lines ~612-631)
- **Current state**: `skillRLManager.selectSkills()` called synchronously on every `route()` call with no caching
- **Do**: Add a Map-based memo keyed by `taskType` with 10-minute TTL and 200-entry max
- **Do**: Invalidate on SkillRL evolution events (if observable) or on TTL expiry
- **Do NOT**: Cache if skillRL is null (already handled by null-safe check)
- **Acceptance**: selectSkills() called once per task type per 10 minutes, memoized result returned on subsequent calls

---

## Phase 2: Automatic Triggering — Make Tools Fire (Tasks 8-14)

### Task 8: Create budget-triggered distill invocation bridge
- **File**: NEW `packages/opencode-integration-layer/src/context-bridge.js`
- **Current state**: No code triggers distill based on budget thresholds. Distill skill exists but requires manual invocation.
- **Do**: Create a `ContextBridge` class that:
  - Accepts a Governor instance and a distill MCP client reference
  - Exposes `evaluateAndCompress(sessionId, model)` — checks budget, if ≥65% returns `{ action: 'compress', reason: '...' }`, if ≥80% returns `{ action: 'compress_urgent', reason: '...' }`
  - Logs all decisions via structured logger
  - Does NOT call distill directly (that's the agent's job) — returns advisory signals
- **Do**: Wire into IntegrationLayer constructor as optional `contextBridge` property
- **Do NOT**: Make distill calls from code — the bridge produces signals that the agent/orchestrator acts on
- **Do NOT**: Auto-compress without logging — every compression decision must be logged
- **Acceptance**: ContextBridge class with evaluateAndCompress(), IntegrationLayer exposes it, unit tests for threshold logic

### Task 9: Create librarian agent prompt with context7 instructions
- **File**: `opencode-config/agents/librarian.md` (NEW) or appropriate location for agent prompt configuration
- **Current state**: Librarian agent is assigned a model in oh-my-opencode.json but has NO dedicated prompt file instructing it to use context7
- **Do**: Create agent prompt file that explicitly instructs librarian to:
  - ALWAYS call `mcp_context7_resolve-library-id` when looking up library documentation
  - ALWAYS call `mcp_context7_query-docs` after resolving
  - Prefer Context7 results over training data for library APIs
  - Fall back to web search only if Context7 has no results
- **Do**: Reference the context7 skill calling conventions from `skills/context7/SKILL.md`
- **Do NOT**: Change the librarian's assigned model — only add instructions
- **Acceptance**: Librarian prompt file exists with explicit context7 tool calling instructions

### Task 10: Add context7 auto-recommendation to skill-orchestrator-runtime
- **File**: `opencode-config/skills/skill-orchestrator-runtime/SKILL.md` (or equivalent config)
- **Current state**: skill-orchestrator-runtime doesn't explicitly recommend context7 for library/documentation tasks
- **Do**: Add logic/instructions to detect "library", "documentation", "API reference", "framework", "package" keywords in task context and auto-recommend context7 skill
- **Do**: Add context7 to synergies list for research-builder and writing-plans skills
- **Acceptance**: Skill orchestrator recommends context7 for documentation-related tasks

### Task 11: SQLite WAL mode and prepared statement caching
- **File**: `packages/opencode-memory-bus/spike/sqlite-compatibility.js` and any production SQLite usage
- **Current state**: No evidence of WAL mode, connection pooling, or prepared statement caching in SQLite usage
- **Do**: Enable WAL mode (`PRAGMA journal_mode=WAL`) on all SQLite database connections
- **Do**: Add prepared statement caching for frequently-used queries (budget checks, metric inserts)
- **Do**: Apply to `packages/opencode-model-manager/src/monitoring/metrics-collector.js` (daily_metrics persistence)
- **Do NOT**: Change the SQLite schema — only add performance pragmas
- **Acceptance**: WAL mode enabled, prepared statements cached, `bun test` still passes

### Task 12: Latency history insertion sort (ModelPerformanceTracker)
- **File**: `packages/opencode-model-router-x/src/model-performance-tracker.js` (line ~41)
- **Current state**: Full O(n log n) sort on every track() call
- **Do**: Replace with binary insertion sort — O(log n) for maintaining sorted order on each insert
- **Do**: Keep array length capped (existing behavior) — just change the sort mechanism
- **Do NOT**: Change the public API of ModelPerformanceTracker
- **Acceptance**: Insertion sort on track(), existing tests pass, equivalent results

### Task 13: Task context and session budget eviction
- **Files**: `packages/opencode-integration-layer/src/index.js` (taskContextMap), `packages/opencode-context-governor/src/session-tracker.js`
- **Current state**: IntegrationLayer taskContextMap grows unbounded. SessionTracker has cleanupStaleSessions() but it's never called automatically.
- **Do**: Add TTL-based eviction to taskContextMap (1-hour expiry, check on setTaskContext)
- **Do**: Wire SessionTracker.cleanupStaleSessions() into Governor — call it on a 1-hour interval (with unref'd timer)
- **Do NOT**: Change eviction behavior of SessionTracker.cleanupStaleSessions() — just call it
- **Acceptance**: Task contexts expire after 1 hour, stale sessions cleaned every hour, no memory leaks

### Task 14: DCP plugin documentation and skill file
- **File**: `plugins/opencode-dcp/info.md` (expand), NEW `opencode-config/skills/dcp/SKILL.md`
- **Current state**: DCP has 7-line info.md only. No skill file. No documented API.
- **Do**: Research @tarquinen/opencode-dcp from npm to understand its actual API and capabilities
- **Do**: Expand info.md with: what DCP does, how it hooks into the system, configuration options
- **Do**: Create SKILL.md for DCP following standard skill template — when to use, calling conventions, handoff protocol
- **Do**: Add to registry.json and compound-engineering.json enabled list
- **Do**: Document relationship between DCP (automatic pruning plugin) and distill (manual compression MCP)
- **Acceptance**: Expanded info.md, SKILL.md exists, registered in skill system

---

## Phase 3: Observability — Make It All Visible (Tasks 15-20)

### Task 15: Token budget dashboard widget
- **File**: `packages/opencode-dashboard/src/app/observability/page.tsx` (extend existing observability page from Wave 10)
- **Current state**: Observability page exists (Wave 10 T15) but has no token budget section
- **Do**: Add a "Context Budget" section showing: current session budget usage (%), model budgets, warn/error thresholds, compression history
- **Do**: Wire data from Governor.getRemainingBudget() via API route
- **Do**: Show color-coded status: green (<75%), yellow (75-80%), red (>80%)
- **Do NOT**: Build a new page — extend the existing observability page
- **Acceptance**: Budget widget visible on observability page, shows real-time data, color-coded

### Task 16: Distill compression metrics tracking
- **File**: `packages/opencode-model-manager/src/monitoring/metrics-collector.js` (extend)
- **Current state**: PipelineMetricsCollector tracks discovery/cache/state metrics but NOT token compression
- **Do**: Add `recordCompression({ sessionId, tokensBefore, tokensAfter, pipeline, durationMs })` method
- **Do**: Persist compression events to a new `compression_history` table in metrics-history.db
- **Do**: Add `getCompressionStats()` for dashboard queries (total savings, avg compression ratio, call frequency)
- **Do NOT**: Change existing metric recording — this is additive
- **Acceptance**: Compression events recorded, queryable via getCompressionStats(), persisted to SQLite

### Task 17: Context7 hit/miss tracking
- **File**: `packages/opencode-model-manager/src/monitoring/metrics-collector.js` (extend)
- **Current state**: No tracking of context7 usage
- **Do**: Add `recordContext7Lookup({ libraryName, resolved: boolean, snippetCount, durationMs })` method
- **Do**: Track: total lookups, resolution success rate, avg snippet count, libraries queried
- **Do**: Persist to metrics-history.db
- **Acceptance**: Context7 lookups tracked, success rate queryable, data persisted

### Task 18: AlertManager budget threshold alerts
- **File**: `packages/opencode-model-manager/src/monitoring/alert-manager.js`
- **Current state**: Alerts on provider failures, stale catalog, PR failures — NOT on token budget
- **Do**: Add budget threshold alert rules: WARN at 75%, ERROR at 80%, CRITICAL at 95%
- **Do**: Wire into Governor — check budget status on each consumeTokens() call
- **Do**: Include session ID, model, current %, and remaining tokens in alert payload
- **Do NOT**: Change existing alert rules — additive only
- **Acceptance**: Budget alerts fire at thresholds, alert payloads include budget details

### Task 19: Startup time instrumentation
- **File**: `packages/opencode-integration-layer/src/index.js`, `packages/opencode-model-router-x/src/index.js`, `packages/opencode-learning-engine/src/index.js`
- **Current state**: No startup time measurement in any package
- **Do**: Add `performance.now()` markers at: IntegrationLayer construction, ModelRouter construction, LearningEngine initialization, Governor loading, meta-KB index loading
- **Do**: Log startup timing via structured logger: `[Startup] IntegrationLayer: 45ms, ModelRouter: 120ms, LearningEngine: 80ms`
- **Do**: Export timing data for health-check.mjs consumption
- **Do NOT**: Add complex profiling frameworks — just `performance.now()` deltas
- **Acceptance**: Startup times logged on initialization, visible in health-check output

### Task 20: Context management integration tests
- **Files**: NEW `integration-tests/context-management.test.js`
- **Current state**: No integration tests for the governor → distill → context7 pipeline
- **Do**: Test the full flow:
  1. Governor tracks token consumption → reaches 75% → status changes to `warn`
  2. ContextBridge.evaluateAndCompress() returns `{ action: 'compress' }` at ≥65%
  3. IntegrationLayer.checkContextBudget() returns correct status at all thresholds
  4. Governor.resetSession() brings budget back to 0
- **Do**: Test context7 skill registry integration (resolve + query docs with mock MCP)
- **Do**: Test compression metrics recording
- **Do NOT**: Call real MCP servers — mock the MCP layer
- **Acceptance**: ≥10 integration tests, covers governor → bridge → metrics pipeline, `bun test` passes

---

## Phase 4: Consolidation & Validation (Tasks 21-25)

### Task 21: Tests for Phase 1 optimizations
- **Files**: `packages/opencode-model-router-x/test/`, `packages/opencode-learning-engine/test/`
- **Do**: Add tests for:
  - Model ID resolution Map (hit + miss + fallback)
  - Pattern matching cache (hit, miss, TTL expiry, invalidation)
  - Skill-RL memoization (hit, TTL expiry)
  - Budget-aware scoring penalty (≥80% → penalty applied, <80% → no penalty)
- **Do**: Use isolation pattern (same as Wave 10 T17) — extract logic into testable functions
- **Acceptance**: ≥15 tests covering all Phase 1 optimizations, `bun test` passes

### Task 22: Tests for Phase 2 components
- **Files**: `packages/opencode-integration-layer/tests/`, `integration-tests/`
- **Do**: Add tests for:
  - ContextBridge threshold logic (evaluateAndCompress at 50%, 65%, 75%, 80%, 95%)
  - IntegrationLayer.checkContextBudget() (with Governor, without Governor)
  - IntegrationLayer.recordTokenUsage() (recording + persistence trigger)
  - Task context eviction (TTL expiry)
  - Session budget auto-cleanup
- **Acceptance**: ≥12 tests covering Phase 2 components, `bun test` passes

### Task 23: Update AGENTS.md with context management documentation
- **File**: `opencode-config/AGENTS.md`, `AGENTS.md` (root)
- **Current state**: Neither AGENTS.md documents context management tools or their usage patterns
- **Do**: Add "Context Management" section to opencode-config/AGENTS.md documenting:
  - Governor (budget tracking, thresholds, persistence)
  - Distill (compression, when to use, skill reference)
  - Context7 (documentation lookup, librarian agent integration)
  - DCP (automatic pruning)
  - ContextBridge (automatic triggering bridge)
- **Do**: Update root AGENTS.md "WHERE TO LOOK" table with context management entries
- **Do NOT**: Rewrite existing content — only add the new section
- **Acceptance**: Context management documented in both AGENTS.md files

### Task 24: Update boulder.json and archive Wave 10
- **File**: `.sisyphus/boulder.json`
- **Do**: Move wave10 from `active_plan` to `completed_plans` array
- **Do**: Set `active_plan` to `.sisyphus/plans/wave11-perf-and-context-management.md`
- **Do**: Initialize wave11 progress tracker
- **Acceptance**: boulder.json reflects Wave 11 as active, Wave 10 archived

### Task 25: End-to-end validation and health check
- **Do**: Run `bun test` — must exit 0 with all new tests passing
- **Do**: Run `node scripts/health-check.mjs` — must have 0 failures
- **Do**: Run `node scripts/check-agents-drift.mjs` — document any drift from new files
- **Do**: Verify dashboard observability page renders budget widget
- **Do**: Verify Governor MCP starts and responds to checkBudget call
- **Do**: Verify startup timing is logged
- **Acceptance**: All validation commands pass, context management visible in dashboard and logs
