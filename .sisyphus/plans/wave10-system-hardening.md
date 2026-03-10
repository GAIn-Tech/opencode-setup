# Wave 10: System Hardening & Intelligence

> **Status**: COMPLETE
> **Scope**: 5 tracks, ~25 tasks across 4 phases
> **Dependencies**: Wave 9 (meta-KB closed loop) COMPLETE

## Goal

Harden the monorepo for production readiness: expand test coverage, enable CI/CD automation, strengthen plugins, add observability, and make the model router cost-aware.

## Tracks

### Track A: Test Coverage Expansion
### Track B: CI/Deployment Pipeline
### Track C: Plugin Hardening
### Track D: Observability & Metrics
### Track E: Model Router Intelligence

---

## Phase 1: Foundations (Tasks 1-7)

### Task 1: Add tests for opencode-validator (0 → bun:test suite)
- **Package**: `packages/opencode-validator/`
- **Current state**: 0 tests, has src/index.js with Validator, ValidationResult, validate() exports
- **API surface**: required(), type(), min(), max(), pattern(), schema(), plus utility fns (isObject, isArray, isString, isNumber, isBoolean, isFunction, sanitizeString, sanitizeHtml, isValidJson, isValidEmail, isValidUrl)
- **Do**: Create `test/validator.test.js` using `describe/it/expect` from bun:test
- **Do**: Cover: ValidationResult class, all Validator methods, chaining, utility functions, edge cases (NaN, null, empty string, boundary values)
- **Do NOT**: Use custom test runners — must use bun:test `describe/it/expect`
- **Acceptance**: `bun test packages/opencode-validator/` passes, ≥20 test cases

### Task 2: Add tests for opencode-memory-bus (0 → bun:test suite)
- **Package**: `packages/opencode-memory-bus/`
- **Current state**: 0 tests, has `spike/` dir with SQLite experiments, minimal package.json
- **Do**: Create `test/spike.test.js` using bun:test with `bun:sqlite` Database
- **Do**: Test: in-memory SQLite operations, table creation, FTS5 virtual tables, prepared statements, transactions
- **Do NOT**: Test non-existent production code — test the spike patterns only
- **Acceptance**: `bun test packages/opencode-memory-bus/` passes, ≥8 test cases

### Task 3: Expand opencode-learning-engine tests (8 → 15+)
- **Package**: `packages/opencode-learning-engine/`
- **Current state**: 8 test files covering meta-KB reader, integration, routing
- **Gaps**: Core decay invariant edge cases, advise() with various input patterns, concurrency
- **Do**: Add tests for: core learning persistence (weight=1.0 always), advise() with empty/malformed inputs, meta-KB reader cache invalidation
- **Acceptance**: ≥15 test cases total, core-decay invariant tested with multiple persistence levels

### Task 4: Re-enable governance-gate.yml GitHub Actions workflow
- **File**: `.github/workflows-disabled/governance-gate.yml` → `.github/workflows/governance-gate.yml`
- **Current state**: Disabled. Runs learning-gate, commit-governance, pr-governance, docs governance
- **Do**: Move to workflows/, verify it references `bun` correctly, add `bun test` step
- **Do**: Add `paths` filter so it only triggers on governed paths (packages/, opencode-config/, scripts/)
- **Do NOT**: Add new workflow features — just re-enable the existing one
- **Acceptance**: Workflow file in `.github/workflows/`, valid YAML, triggers on push/PR to governed paths

### Task 5: Re-enable opencode-ci.yml GitHub Actions workflow
- **File**: `.github/workflows-disabled/opencode-ci.yml` → `.github/workflows/opencode-ci.yml`
- **Current state**: Disabled. Runs preflight, policy validation, tests, env parity
- **Do**: Move to workflows/, verify Bun setup step, ensure `bun test` runs
- **Do NOT**: Add container-parity (leave that disabled for now)
- **Acceptance**: Workflow in `.github/workflows/`, runs `bun test` on push/PR

### Task 6: Add error handling to plugin-healthd daemon.js
- **Package**: `packages/opencode-plugin-healthd/src/daemon.js`
- **Current state**: Has signal handlers (SIGTERM, SIGINT, SIGHUP) and exception handlers, but no timeout protection for health checks and no crash logging
- **Do**: Add `runCheckWithTimeout()` wrapper (30s max per check), add crash recovery logging to `~/.opencode/healthd-crashes.json` (keep last 10)
- **Do NOT**: Change the daemon's architecture or signal handling
- **Acceptance**: Timeout protection works, crash log file written on uncaught exceptions

### Task 7: Add error handling to plugin-lifecycle _save() and evaluateMany()
- **Package**: `packages/opencode-plugin-lifecycle/src/index.js`
- **Current state**: try/catch in _load() but NOT in _save() (async file write) or evaluateMany()
- **Do**: Wrap _save() in try/catch with temp file cleanup on failure, wrap evaluateMany() with per-plugin error handling
- **Do**: Add `validateState()` method for state integrity checks (required fields, valid status values)
- **Do NOT**: Change the public API or break backward compatibility
- **Acceptance**: _save() catches write errors, evaluateMany() catches per-plugin errors, validateState() method exists

---

## Phase 2: Integration (Tasks 8-14)

### Task 8: Create CI test matrix for all 35 packages
- **File**: New or updated `.github/workflows/opencode-ci.yml`
- **Do**: Add matrix strategy that runs `bun test packages/<name>/` for each package with tests
- **Do**: Group by category: core (learning-engine, model-router-x, model-manager), plugins (preload-skills, healthd, lifecycle), infra (all others)
- **Do NOT**: Run tests that don't exist — skip packages without test/ dirs
- **Acceptance**: CI runs tests for all 33+ packages with tests, reports per-package pass/fail

### Task 9: Wire Langfuse tracing into opencode-logger
- **Package**: `packages/opencode-logger/`
- **Current state**: Has correlation ID propagation via AsyncLocalStorage, structured logging. Langfuse plugin installed (`opencode-plugin-langfuse@0.1.8`) but not wired
- **Do**: Add optional Langfuse trace/span creation in logger when `LANGFUSE_SECRET_KEY` is set
- **Do**: Map correlation IDs to Langfuse trace IDs, emit spans for log events at WARN+ level
- **Do NOT**: Make Langfuse a required dependency — must be opt-in
- **Acceptance**: When env vars set, logs create Langfuse traces; when unset, no behavior change

### Task 10: Consolidate dashboard test structure
- **Package**: `packages/opencode-dashboard/`
- **Current state**: Tests split across `test/` (6 files) and `tests/` (3 files: correlation-async, event-store-async, meta-kb-route + fixtures/)
- **Do**: Move all `tests/` contents into `test/`, delete empty `tests/` dir
- **Do**: Update any import paths referencing `tests/`
- **Acceptance**: All tests in `test/`, `bun test packages/opencode-dashboard/` passes

### Task 11: Add integration tests for critical external plugins
- **Dir**: `integration-tests/`
- **Do**: Create `critical-plugins.test.js` with bun:test that validates plugin contracts:
  - safety-net: verify destructive command patterns are blocked
  - envsitter-guard: verify .env file patterns are blocked
  - rate-limit-fallback: verify fallback chain activation
- **Do**: Use mock/stub patterns — don't require actual plugin npm packages
- **Do NOT**: Test internal implementation — test contracts only
- **Acceptance**: 6+ integration tests pass

### Task 12: Integrate benchmark data into model router scoring
- **Package**: `packages/opencode-model-router-x/src/index.js`
- **Current state**: Composite scoring (25% provider + 20% tier + 25% preference + 20% success + 10% strength). NewModelAssessor runs benchmarks but results not fed into scoring
- **Do**: Add `_applyBenchmarkBonus()` that reads benchmark results (HumanEval pass@1, MBPP pass@1) and applies 0-0.15 bonus to composite score
- **Do**: Source data from `packages/opencode-model-benchmark/` results
- **Do NOT**: Change existing scoring weights — add as supplementary signal
- **Acceptance**: Models with benchmark data get bonus, models without get 0 bonus, tests verify

### Task 13: Add cost-per-success as routing signal
- **Package**: `packages/opencode-model-router-x/src/`
- **Current state**: TokenCostCalculator has pricing table. ModelPerformanceTracker tracks cost-per-success. But router doesn't use cost in selection
- **Do**: Add cost factor to composite scoring (5% weight, taken from existing 25% provider → 20% provider + 5% cost)
- **Do**: Lower cost-per-success = higher score. Normalize across models
- **Do NOT**: Change pricing table format or add dynamic pricing (that's Phase 3)
- **Acceptance**: Cost-aware routing works, cheaper models get slight preference when quality is equal, tests verify

### Task 14: Add pipeline metrics persistence
- **Package**: `packages/opencode-model-manager/src/monitoring/metrics-collector.js`
- **Current state**: In-memory only (24h retention, auto-cleanup). No historical data
- **Do**: Add SQLite-backed persistence for daily metric summaries (append to `metrics-history.db`)
- **Do**: Keep in-memory for live metrics, flush daily summaries to SQLite
- **Do NOT**: Add complex query API — just persist raw daily aggregates
- **Acceptance**: Daily metrics survive restart, queryable via SQL, bounded growth (auto-prune >90 days)

---

## Phase 3: Polish (Tasks 15-20)

### Task 15: Add dashboard observability page
- **Package**: `packages/opencode-dashboard/`
- **Do**: Add `/observability` page showing: pipeline metrics (discovery, cache, transitions), alert status, meta-KB health
- **Do**: Read from existing `/api/monitoring` and `/api/meta-kb` endpoints
- **Do NOT**: Build real-time streaming — polling at 30s intervals is fine
- **Acceptance**: Page renders, shows current metrics, auto-refreshes

### Task 16: Create deployment automation workflow
- **File**: `.github/workflows/deployment.yml`
- **Do**: Workflow that reads `deployment-state` and runs appropriate scripts
- **Do**: stages: dev (auto on push) → staging (on manual trigger) → prod (on approval)
- **Do NOT**: Actually deploy to cloud — just run governance checks and update state
- **Acceptance**: Workflow runs, reads/updates deployment state, requires approval for prod

### Task 17: Expand model router tests for cost-awareness and benchmarks
- **Package**: `packages/opencode-model-router-x/test/`
- **Do**: Add tests for: _applyBenchmarkBonus(), cost factor in scoring, cost-per-success normalization, budget constraints
- **Do NOT**: Duplicate existing tests
- **Acceptance**: ≥6 new tests covering cost and benchmark integration

### Task 18: Add provider capability routing
- **Package**: `packages/opencode-model-router-x/src/`
- **Current state**: Routes by complexity tier only. No capability-based filtering
- **Do**: Add capability flags to model config (vision, tools, reasoning, large_context)
- **Do**: Filter models by required capabilities before scoring (e.g., vision task → only models with vision=true)
- **Do NOT**: Change tier system — add as pre-filter
- **Acceptance**: Capability filtering works, tests verify, backward compatible

### Task 19: Add security scanning to CI
- **File**: `.github/workflows/opencode-ci.yml`
- **Do**: Add npm audit / bun audit step for dependency vulnerabilities
- **Do**: Add `scripts/integrity-guard.mjs` to CI pipeline
- **Do NOT**: Add DAST or complex SAST — just dependency audit + integrity check
- **Acceptance**: CI reports dependency vulnerabilities, integrity-guard passes

### Task 20: Add agent execution tracing
- **Packages**: `packages/opencode-logger/`, model-router-x, integration-layer
- **Do**: Add trace spans for: agent task dispatch, model selection decision, skill loading, tool invocations
- **Do**: Emit to Langfuse when available, to structured log when not
- **Do NOT**: Trace every function call — only high-level execution boundaries
- **Acceptance**: Agent execution creates traceable spans, visible in Langfuse dashboard

---

## Phase 4: Validation (Tasks 21-25)

### Task 21: Validate Phase 1 — all acceptance criteria pass
- Run `bun test` (full suite, exit 0)
- Verify new test counts: validator ≥20, memory-bus ≥8, learning-engine ≥15
- Verify CI workflows are valid YAML
- Verify plugin error handling with targeted tests

### Task 22: Validate Phase 2 — all acceptance criteria pass
- Run full CI pipeline locally (`bun test`, governance checks)
- Verify Langfuse integration (opt-in, no behavior change when unset)
- Verify dashboard test consolidation
- Verify model router scoring changes don't regress existing behavior
- Verify metrics persistence with restart test

### Task 23: Validate Phase 3 — all acceptance criteria pass
- Run full CI pipeline
- Verify dashboard observability page renders
- Verify deployment workflow YAML
- Verify capability routing with edge cases
- Verify security scanning in CI

### Task 24: Final regression run
- `bun test` exit 0
- `node scripts/health-check.mjs` passes
- `node scripts/check-agents-drift.mjs` shows 0 drift
- All governance scripts pass

### Task 25: Update boulder.json and AGENTS.md
- Update `.sisyphus/boulder.json` with wave10 completion
- Run `check-agents-drift.mjs` and fix any new drift (test counts, etc.)
- Update AGENTS.md test count, CI references

---

## DO NOT

- Add vector databases, embeddings, RAG, or semantic search
- Auto-modify AGENTS.md content (only update counts/references)
- Build new MCP servers or REST APIs for observability
- Make Langfuse a required dependency
- Change model pricing table format
- Break backward compatibility in any public API
- Commit `# Model Provider API Keys` file
- Skip governance trailers on governed commits

## Success Criteria

1. **Test coverage**: 35/35 packages have bun:test suites (currently 33/35)
2. **CI pipeline**: 2+ GitHub Actions workflows active (currently 1)
3. **Plugin safety**: All 3 local plugins have error handling for async operations
4. **Observability**: Langfuse traces emitted when configured
5. **Cost-aware routing**: Model router considers cost-per-success in selection
6. **Zero regressions**: `bun test` exit 0 at every phase boundary

## Estimated Effort

| Phase | Tasks | Complexity | Estimated Commits |
|-------|-------|-----------|-------------------|
| Phase 1 | 7 | Low-Medium | 7-8 |
| Phase 2 | 7 | Medium-High | 7-10 |
| Phase 3 | 6 | Medium | 6-8 |
| Phase 4 | 4 | Low | 3-4 |
| **Total** | **25** | | **23-30** |
