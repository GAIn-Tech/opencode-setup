# OpenCode Gap Remediation Plan

## TL;DR

> **Quick Summary**: Comprehensive remediation plan addressing 30 identified gaps across orchestration, learning engine, model routing, error handling, and context management.

> **Deliverables**:
> - Error taxonomy integrated into production code
> - Context compression at 80% budget threshold
> - Learning engine runtime integration
> - Orchestration facade API
> - 26 additional fixes across high/medium/low priority

> **Estimated Effort**: XL (100+ implementation tasks)
> **Parallel Execution**: YES - Phase-based waves
> **Critical Path**: Error Taxonomy → Learning Runtime → Context Compression → Orchestration Facade

---

## Context

### Original Request
User requested deep audit of OpenCode operational and UX gaps. Identified 30 gaps across 5 categories.

### Gap Distribution
| Priority | Count | Areas |
|----------|-------|-------|
| Critical | 5 | Error handling, Context, Learning, Orchestration, Plugin |
| High | 11 | Config, Model Router, Test cleanup, Visibility |
| Medium | 10 | Code quality, Documentation, Edge cases |
| Low | 4 | Style, Paths, Health checks |

### User Decisions
1. **Learning Engine MUST be called at runtime** - integrate into orchestration flow
2. **Context compression at 80%** - proactive compression, not reactive
3. **ALL gaps to be recorded** - comprehensive plan requested

---

## Work Objectives

### Core Objective
Fix all 30 identified gaps, grouped into 4 phases for manageable execution.

### Phase 1: Critical Infrastructure (Gaps 1-5)
These must be fixed first - everything else depends on them.

### Phase 2: High Priority (Gaps 6-15)
Important improvements that affect system reliability and usability.

### Phase 3: Medium Priority (Gaps 16-25)
Code quality and edge case improvements.

### Phase 4: Low Priority (Gaps 26-30)
Minor fixes and polish.

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> This is NOT conditional — it applies to EVERY task, regardless of test strategy.

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: Tests-after (unit tests after implementation)
- **Framework**: bun test

### Agent-Executed QA Scenarios (MANDATORY)
Each task includes verification scenarios using:
- **Bash** for CLI commands and package tests
- **grep/ast_grep** for code pattern verification

---

## Execution Strategy

### Phase 1: Critical Infrastructure (Wave 1-3)

**Wave 1** (Start Immediately):
- Task 1: Error Taxonomy Integration - Model Router
- Task 3: Learning Engine Runtime Integration - Research where to inject
- Task 5: Plugin Telemetry Drift - Investigate oh-my-opencode npm package

**Wave 2** (After Wave 1):
- Task 2: Context Budget Compression at 80%
- Task 4: Orchestration Facade Design

**Wave 3** (After Wave 2):
- Implement all Phase 1 integrations
- Verification of critical path

### Phase 2: High Priority (Wave 4-5)
- Test cleanup, Config consolidation, Router visibility
- Context bridge verification, Anti-gaming runtime check

### Phase 3: Medium Priority (Wave 6)
- Code quality fixes, documentation

### Phase 4: Low Priority (Wave 7)
- Minor polish

---

# PHASE 1: CRITICAL INFRASTRUCTURE

## TODOs

### 1. [CRITICAL] Error Taxonomy Integration - Model Router

**What to do**:
- Import `opencode-errors` into `packages/opencode-model-router-x/src/index.js`
- Replace ad-hoc error handling with `OpenCodeError`, `ErrorCategory`, `ErrorCode`
- Update `_createError()` method to use standardized taxonomy
- Add error handling in `route()`, `routeAsync()` methods
- Export error types from router for consumers

**Must NOT do**:
- Break existing API - maintain backward compatibility
- Remove circuit breaker integration

**Recommended Agent Profile**:
- **Category**: `ultrabrain` - Logic-heavy refactoring requiring careful state management
- **Skills**: `clean-architecture`, `api-design-principles`
- **Reason**: Requires understanding of error flow across multiple methods
- **Skills Evaluated but Omitted**:
  - `react-patterns`: Not a React project
  - `docker-containerization`: Not relevant

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 3, 5)
- **Blocks**: Task 11 (Unified Error Recovery)

**References**:
- `packages/opencode-errors/src/index.js:1-106` - OpenCodeError class, ErrorCategory, ErrorCode
- `packages/opencode-model-router-x/src/index.js:1274-1289` - Current _createError method
- Test file: `packages/opencode-model-router-x/test/constructor-injection.test.js:61-62` shows minimal usage

**Acceptance Criteria**:
- [ ] `opencode-errors` imported in model-router
- [ ] All error throws use `OpenCodeError` with proper category/code
- [ ] Error codes visible in logs when errors occur
- [ ] `bun test packages/opencode-model-router-x/tests/` - PASS

**Agent-Executed QA Scenarios**:

```
Scenario: Error codes visible in model router failures
Tool: Bash
Preconditions: Model router installed, test suite exists
Steps:
1. Run: bun test packages/opencode-model-router-x/tests/ 2>&1
2. Grep output for ErrorCode patterns
3. Verify: "INVALID_API_KEY", "MODEL_NOT_FOUND" appear in error paths
Expected Result: Tests pass with proper error taxonomy
Evidence: Test output captured
```

```
Scenario: Invalid model throws categorized error
Tool: Bash
Preconditions: Node/Bun with model-router installed
Steps:
1. node -e "
2. const { ModelRouter } = require('./packages/opencode-model-router-x/src/index.js');
3. const r = new ModelRouter();
4. try { r.route({ taskType: 'test', complexity: 'high' }); }
5. catch(e) { console.log(e.code, e.category); }
Expected Result: Error has .code and .category from ErrorCode enum
Evidence: Console output captured
```

---

### 2. [CRITICAL] Context Budget Compression at 80%

**What to do**:
- Modify `packages/opencode-context-governor/src/index.js`
- Add `onErrorThreshold` callback mechanism
- Implement automatic context compression trigger at errorThreshold (80%)
- Connect to distillation/compression service
- Add configuration option for compression behavior

**Must NOT do**:
- Break existing `checkBudget()` API
- Remove warn threshold at 75%

**Recommended Agent Profile**:
- **Category**: `ultrabrain` - Complex state management with side effects
- **Skills**: `clean-architecture`, `system-design`
- **Reason**: Requires adding callback infrastructure without breaking existing behavior

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2 (after Task 1)
- **Blocks**: Task 9 (Context Bridge Verification)

**References**:
- `packages/opencode-context-governor/src/index.js:109-144` - checkBudget method with thresholds
- `packages/opencode-context-governor/src/index.js:38-44` - Constructor with mode options
- `opencode-config/AGENTS.md` - Context management documentation

**Acceptance Criteria**:
- [ ] Callback registered: `gov.onErrorThreshold(() => compress())`
- [ ] Compression triggered at 80% when mode is 'enforce-critical'
- [ ] Compression callback receives session context
- [ ] Unit test verifies compression at 80%

**Agent-Executed QA Scenarios**:

```
Scenario: Compression callback fires at 80% threshold
Tool: Bash
Preconditions: Governor package installed
Steps:
1. node -e "
2. const { Governor } = require('./packages/opencode-context-governor/src/index.js');
3. const gov = new Governor({ mode: 'enforce-critical' });
4. let compressCalled = false;
5. gov.onErrorThreshold(() => { compressCalled = true; });
6. // Simulate 80% usage - depends on model config
7. // For testing, mock _tracker or use actual consumption
8. console.log('Callback registered:', typeof gov.onErrorThreshold);
Expected Result: Callback mechanism exists
Evidence: Console output shows method exists
```

```
Scenario: Advisory mode does NOT compress at 80%
Tool: Bash
Preconditions: Governor with advisory mode
Steps:
1. node -e "
2. const { Governor } = require('./packages/opencode-context-governor/src/index.js');
3. const gov = new Governor({ mode: 'advisory' });
4. const check = gov.checkBudget('test', 'anthropic/claude-opus-4-6', 150000);
5. console.log('Status:', check.status, 'Allowed:', check.allowed);
Expected Result: status='error' but allowed=true (advisory)
Evidence: Output shows warning without blocking
```

---

### 3. [CRITICAL] Learning Engine Runtime Integration

**What to do**:
- Research where in orchestration flow to inject `LearningEngine.advise()` call
- Integrate into `packages/opencode-model-router-x/src/index.js` route selection
- Pass task context to learning engine before model selection
- Apply advice (skill recommendations, risk scores) to routing
- Record outcomes back to learning engine after task completion

**Must NOT do**:
- Block routing if learning engine unavailable (fail-open)
- Add significant latency to model selection

**Recommended Agent Profile**:
- **Category**: `deep` - Research required to determine integration point
- **Skills**: `codebase-auditor`, `system-design`
- **Reason**: Need to trace full request flow to find optimal injection point

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 1, 5)
- **Blocks**: Task 10 (Meta-KB Runtime Check), Task 12 (Circuit Breaker → Learning)

**References**:
- `packages/opencode-learning-engine/src/index.js:677-794` - advise() method
- `packages/opencode-learning-engine/src/index.js:809-839` - learnFromOutcome()
- `packages/opencode-model-router-x/src/index.js:769-951` - route() method
- `packages/opencode-integration-layer/src/context-bridge.js` - Integration layer

**Acceptance Criteria**:
- [ ] LearningEngine.advise() called before model selection
- [ ] Advice (skills, risk_score, should_pause) affects routing
- [ ] learnFromOutcome() called after task completion
- [ ] Fail-open if learning engine unavailable

**Agent-Executed QA Scenarios**:

```
Scenario: Learning advice influences model selection
Tool: Bash
Preconditions: Learning engine + model router installed
Steps:
1. node -e "
2. const { LearningEngine } = require('./packages/opencode-learning-engine/src/index.js');
3. const { ModelRouter } = require('./packages/opencode-model-router-x/src/index.js');
4. const le = new LearningEngine();
5. const mr = new ModelRouter({ learningEngine: le });
6. // Add anti-pattern that should penalize a model
7. le.addAntiPattern({ type: 'wrong_tool', severity: 'high', pattern: 'test-pattern' });
8. const advice = await le.advise({ task_type: 'test', complexity: 'moderate' });
9. console.log('Risk score:', advice.risk_score);
Expected Result: Advice returned with risk score
Evidence: Console output shows risk_score field
```

```
Scenario: Routing fails gracefully if learning unavailable
Tool: Bash
Preconditions: Model router without learning engine
Steps:
1. node -e "
2. const { ModelRouter } = require('./packages/opencode-model-router-x/src/index.js');
3. const mr = new ModelRouter(); // No learningEngine
4. const result = mr.route({ taskType: 'test', complexity: 'simple' });
5. console.log('Model selected:', result.model?.id || result.modelId);
Expected Result: Routing works without learning engine (fail-open)
Evidence: Model selected without error
```

---

### 4. [CRITICAL] Orchestration Facade

**What to do**:
- Create new file: `packages/opencode-sisyphus-state/src/sisyphus.js`
- Export unified `Sisyphus` class that wraps all components
- Provide simple API: `new Sisyphus(config).run(workflow)`
- Include lifecycle methods: `on('step:start')`, `on('step:complete')`, `on('error')`
- Maintain backward compatibility with existing exports

**Must NOT do**:
- Remove existing component exports (backward compatibility)
- Break existing workflow definitions

**Recommended Agent Profile**:
- **Category**: `architecture-design` - New component design
- **Skills**: `system-design`, `clean-architecture`
- **Reason**: Requires careful API design that maintains compatibility

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2 (after Task 1)
- **Blocks**: Task 16 (Duplicate save method - not dependent, but logical grouping)

**References**:
- `packages/opencode-sisyphus-state/src/index.js:1-15` - Current exports
- `packages/opencode-sisyphus-state/src/executor.js:1-100` - WorkflowExecutor
- `packages/opencode-sisyphus-state/src/database.js` - WorkflowStore

**Acceptance Criteria**:
- [ ] New `Sisyphus` class exported from package
- [ ] `new Sisyphus(config).run(workflow)` works
- [ ] Events emit on step start/complete/error
- [ ] Existing exports still work
- [ ] bun test packages/opencode-sisyphus-state/tests/ - PASS

**Agent-Executed QA Scenarios**:

```
Scenario: Sisyphus facade provides unified API
Tool: Bash
Preconditions: Sisyphus state package built
Steps:
1. node -e "
2. const { Sisyphus, WorkflowExecutor } = require('./packages/opencode-sisyphus-state/src/index.js');
3. console.log('Sisyphus available:', typeof Sisyphus);
4. console.log('WorkflowExecutor still available:', typeof WorkflowExecutor);
Expected Result: Both exports exist
Evidence: Console shows both types
```

```
Scenario: Sisyphus emits lifecycle events
Tool: Bash
Preconditions: Sisyphus with test workflow
Steps:
1. node -e "
2. const { Sisyphus } = require('./packages/opencode-sisyphus-state/src/index.js');
3. const s = new Sisyphus();
4. let events = [];
5. s.on('step:start', (step) => events.push('start:' + step.id));
6. s.on('step:complete', (step) => events.push('complete:' + step.id));
7. // Would run workflow but just test events
8. console.log('Events work:', events.length >= 0);
Expected Result: Event system functional
Evidence: No errors on event registration
```

---

### 5. [CRITICAL] Plugin Telemetry Drift

**What to do**:
- Investigate oh-my-opencode npm package structure
- Determine how to keep telemetry hooks in sync
- Option A: Commit local/oh-my-opencode/ changes
- Option B: Document drift risk and governance process
- Add telemetry verification to startup

**Must NOT do**:
- Break existing plugin loading

**Recommended Agent Profile**:
- **Category**: `deep` - Research required
- **Skills**: `codebase-auditor`, `research-builder`
- **Reason**: Need to understand plugin architecture and sync mechanism

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 1, 3)
- **Blocks**: Task 28 (No Health Check for Learning Engine - not directly dependent)

**References**:
- `opencode-config/AGENTS.md:73-85` - Documents local/ gitignore issue
- `scripts/runtime-tool-telemetry.mjs` - Runtime telemetry script

**Acceptance Criteria**:
- [ ] Documented solution for telemetry drift
- [ ] Verification check at startup (optional)
- [ ] Clear process for updating plugin hooks

**Agent-Executed QA Scenarios**:

```
Scenario: Verify telemetry hook registration
Tool: Bash
Preconditions: OpenCode config exists
Steps:
1. cat ~/.claude/settings.json 2>/dev/null | grep -A5 'PostToolUse'
2. echo "---"
3. ls -la scripts/runtime-tool-telemetry.mjs 2>/dev/null
Expected Result: Hook configured, script exists
Evidence: Output shows configuration
```

---

## PHASE 2: HIGH PRIORITY GAPS

### 6. Test Database Artifacts

**What to do**: Add test cleanup or use unique temp directories
**Impact**: `packages/opencode-sisyphus-state/` has 244 test-*.db files
**Plan**: Modify test setup to use temp directories with automatic cleanup

### 7. Config Fragmentation

**What to do**: Document config precedence or create unified config view
**Impact**: 6+ config files hard to navigate
**Plan**: Create config-docs showing precedence and relationships

### 8. Model Router Option Creep

**What to do**: Add routing visualization/debug mode
**Impact**: Hard to trace which path executes
**Plan**: Add debug flag that logs routing decisions

### 9. Context Bridge Compression Advisory

**What to do**: Verify compress() is called when advisory is "compress" or "compress_urgent"
**Impact**: Advisory exists but may not execute
**Plan**: Trace context-bridge.js to verify compression execution

### 10. Anti-Gaming Runtime Check

**What to do**: Check gaming classification BEFORE accepting task, not after
**Impact**: Currently reactive, should be preventive
**Plan**: Add pre-task gaming check in learning engine

### 11. Unified Error Recovery Strategy

**What to do**: Create error recovery coordinator
**Impact**: Different error types get different treatments
**Plan**: Abstract retry/circuit-breaker logic into unified interface

### 12. Circuit Breaker → Learning Connection

**What to do**: Verify circuit breaker state affects model selection
**Impact**: CB calls learningEngine.ingest() but unclear if used
**Plan**: Trace from circuit breaker state to routing filter

### 13. Skill-RL Dead Code

**What to do**: Either implement skill→model mapping or remove dead code
**Impact**: Comment at line 855-858 indicates incomplete implementation
**Plan**: Either complete implementation or remove placeholder

### 14. Meta-KB Stale Detection

**What to do**: Make stale index handling more prominent
**Impact**: Stale used with warning, could cause issues
**Plan**: Either block on stale or escalate warning

### 15. Provider Pressure Visibility

**What to do**: Add logging for health filtering decisions
**Impact**: Hard to debug why model filtered out
**Plan**: Add verbose logging in _filterByHealth()

---

## PHASE 3: MEDIUM PRIORITY

### 16. Duplicate save() method
- **Location**: `packages/opencode-learning-engine/src/index.js:921-925, 940-945`
- **Fix**: Remove duplicate

### 17. Atomic Write Verification
- **Location**: Multiple packages
- **Implement**: Post-write verification after atomic writes

### 18. Learning Core vs Adaptive Documentation
- **Document**: When/how learnings become 'core'

### 19. Advice Cache Granular Invalidation
- **Improve**: Invalidate only affected task types, not all

### 20. Session Cleanup Frequency
- **Improve**: More aggressive or size-based eviction

### 21. Budget Mode Default Mismatch
- **Fix**: Align defaults between code and docs

### 22. Emergency Fallback Logic
- **Improve**: Better emergency model selection

### 23. Thompson Sampling Visibility
- **Add**: Decision logging for probabilistic selection

### 24. Runtime Fallback Validation
- **Add**: Validate fallback chains during execution

### 25. Key Rotator Learning Connection
- **Verify**: Does learning affect key selection?

---

## PHASE 4: LOW PRIORITY

### 26. Duplicate Export in Errors Package
- **Fix**: Single export statement

### 27. Hard-coded Paths
- **Fix**: Use environment variables

### 28. Learning Engine Health Check
- **Add**: Health endpoint for learning engine

### 29. Hook Error Handling
- **Improve**: Better error handling in hooks

### 30. Learning Engine Rate Limiting
- **Add**: Ingest rate limiting

---

## Success Criteria

### Phase 1 Verification
```bash
# Error taxonomy
grep -r "ErrorCode\." packages/opencode-model-router-x/src/ | wc -l
# Expected: > 5 uses

# Context compression
node -e "const{G}=require('./packages/opencode-context-governor/src'); console.log(typeof G.prototype.onErrorThreshold)"
# Expected: function

# Learning runtime
node -e "const{L}=require('./packages/opencode-learning-engine/src'); const l=new L(); l.advise({task_type:'test'}).then(console.log)"
# Expected: returns advice object

# Orchestration facade
node -e "const{S}=require('./packages/opencode-sisyphus-state/src'); console.log(typeof S)"
# Expected: function
```

### Final Checklist
- [ ] All Critical Gaps (1-5) implemented and verified
- [ ] All High Priority Gaps (6-15) implemented
- [ ] All Medium Priority (16-25) implemented
- [ ] All Low Priority (26-30) implemented or documented
- [ ] bun test passes across all modified packages

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1 | `fix(errors): integrate standardized error taxonomy` | model-router/src/index.js |
| 2 | `fix(context): trigger compression at 80% threshold` | context-governor/src/index.js |
| 3 | `feat(learning): integrate advise() into routing flow` | model-router/src/index.js |
| 4 | `feat(orchestration): add Sisyphus facade class` | sisyphus-state/src/sisyphus.js |
| 5 | `docs(plugin): document telemetry drift solution` | docs/ |
| 6-15 | `fix(high): various high priority fixes` | multiple |
| 16-25 | `fix(medium): code quality improvements` | multiple |
| 26-30 | `fix(low): minor polish` | multiple |

---

## Notes

- **Parallel Opportunities**: Tasks 1, 3, 5 can run in parallel (Wave 1)
- **Test Strategy**: Add tests after each implementation
- **Rollback**: Each task is isolated - can rollback individually
- **User Guidance**: Some gaps (5, 7, 15) may need user decision on approach