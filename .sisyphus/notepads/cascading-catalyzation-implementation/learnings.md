# Cascading Catalyzation — Learnings

## Wave 1, Item 1: PEV Contract (2026-04-05)

### What was built
- `packages/opencode-pev-contract/` — PEV (Planner/Executor/Verifier/Critic) contract interfaces
- 41 tests, 104 expect calls, all passing
- Classes: Plan, Result, Verification, Planner, Executor, Verifier, Critic, PEVContract
- Enums: PEVRole, PEVLifecycleEvent
- Validation: validatePlan, validateResult, validateVerification

### Key design decisions
- Abstract-like base classes (throw "must be implemented by subclass" if not overridden)
- PEVContract orchestrator with role registration and lifecycle event emission
- isReady() checks that planner + executor + verifier are all registered (critic is optional)
- Event listeners are fail-open (listener errors don't break orchestration)

### Integration paths identified
- OrchestrationAdvisor → Planner (via AdvisorPlanner adapter)
- WorkflowExecutor → Executor (via WorkflowExecutorAdapter)
- ShowboatWrapper → Verifier (via ShowboatVerifier adapter)

### Delegation lessons
- `subagent_type` and `category` are mutually exclusive — use one or the other
- Valid subagent_type values: oracle, librarian, explore, multimodal-looker, metis, momus
- `category` auto-spawns Sisyphus-Junior with domain config
- When delegation fails, implement directly rather than retrying

## Wave 1, Item 2: Context Budget Enforcement (2026-04-05)

### What was built
- Added `mode` option to Governor: `'advisory'` (default) | `'enforce-critical'`
- In `enforce-critical` mode: `checkBudget()` returns `allowed: false` when status is `'error'` (80%+) or `'exceeded'` (100%)
- Mode configurable via `opts.mode` constructor param or `OPENCODE_BUDGET_MODE` env var
- Exported `BUDGET_MODES` enum: `{ ADVISORY: 'advisory', ENFORCE_CRITICAL: 'enforce-critical' }`
- 12 new tests in `test/enforcement.test.js` — all passing

### Key design decisions
- Backward compatible: default mode is `'advisory'` (current behavior preserved)
- Enforce-critical blocks at error threshold (80%), not warn threshold (75%)
- Warn threshold (75%) still allowed in enforce-critical mode (gives room for compression)

## Wave 1, Item 3: Eval-Driven Tool Optimization (2026-04-05)

### What was built
- Added `evaluateTool(toolName, testCases, executor)` method to Harness class
- Metrics: success_rate, avg_tokens, avg_latency_ms, latency_p50_ms, latency_p95_ms, error_rate, confusion_rate
- confusion_rate: how often tool uses 2x+ expected tokens (indicates misuse)
- 5 new tests in `test/tool-eval.test.js` — all passing

### Key design decisions
- Tool eval is independent of model eval — measures tool behavior, not model quality
- confusion_rate uses 2x expected token threshold as heuristic for misuse
- Empty test suites return zeroed metrics (no crash)
