# Fix Model Persistence After Tool/Continuation Messages

## TL;DR

**Problem**: The main session's selected model is being reset to the default "oh-my-opencode" model after continuation messages and tool usage summary messages (like DCP activations).

**Root Cause**: In `model-persistence.ts`, the hook saves the model when `!existingModel || agent`, meaning tool messages can initialize the model storage with the default model if no user model was previously saved.

**Solution**: Modify the persistence logic to ONLY save models from user-initiated messages (those with `agent` field present), NEVER from tool/continuation/DCP messages.

**Deliverables**:
- Fixed model-persistence.ts hook
- Updated unit tests
- New integration tests for tool/continuation scenarios
- All tests passing

**Estimated Effort**: Short (1-2 hours)
**Parallel Execution**: NO - Sequential
**Critical Path**: Task 1 (Fix hook) → Task 2 (Update tests) → Task 3 (New integration tests)

---

## Context

### Original Request
Fix issue where selected main session model resets to default oh-my-opencode model after continuation messages and tool usage summaries like DCP activations. The selected model should only change on manual user selection.

### Code Location
- **Hook**: `local/oh-my-opencode/src/hooks/model-persistence.ts`
- **State Module**: `local/oh-my-opencode/src/shared/session-model-state.ts`
- **Existing Tests**: `local/oh-my-opencode/src/features/claude-code-session-state/state.model-persistence.test.ts`
- **Integration Tests**: `local/oh-my-opencode/src/tools/delegate-task/model-persistence.integration.test.ts`

### Current Logic (lines 23-36)
```typescript
if (model && sessionID) {
  // Only save if no model already stored OR if this is a user message (has agent)
  // Tool usage messages should not overwrite user-selected model
  const existingModel = getSessionModel(sessionID)
  if (!existingModel || agent) {
    setSessionModel(sessionID, model)
  }
}
```

### Problem Analysis
The current condition `if (!existingModel || agent)` allows tool messages to initialize session model storage:
1. First message is a tool/DCP/continuation message with default model
2. `!existingModel` is true (nothing stored yet)
3. Model gets saved with default "oh-my-opencode"
4. User's subsequent model selection is ignored because model already exists

### Metis Review Findings
**Guardrails Applied**:
- MUST: Persist ONLY on user-originated messages (those with `agent` field)
- MUST NOT: Allow tool/DCP/continuation events to write session model
- MUST NOT: Use `!existingModel` as a save trigger
- MUST: Add explicit predicate for model persistence decisions
- SHOULD: Separate user-selected model from tool-rendered model

**Risk Identified**: The `agent` field indicates the assistant/agent name, but based on code analysis, it's only present on user messages in this context.

---

## Work Objectives

### Core Objective
Fix the model persistence hook to ensure only user-selected models are persisted, preventing tool/continuation/DCP messages from initializing or overwriting the session model.

### Concrete Deliverables
1. Fixed `model-persistence.ts` hook with corrected persistence logic
2. Updated unit tests in `state.model-persistence.test.ts`
3. New integration tests for tool/continuation scenarios
4. All tests passing (`bun test`)

### Definition of Done
- [ ] Tool messages with default model cannot initialize session model storage
- [ ] Continuation messages cannot reset model to default
- [ ] DCP activation messages cannot affect stored model
- [ ] User messages with `agent` field correctly persist selected model
- [ ] Model persists correctly across continuation cycles
- [ ] All existing tests pass
- [ ] New integration tests pass

### Must Have
- Simple, focused fix to the persistence condition
- Comprehensive test coverage for edge cases
- No breaking changes to existing functionality

### Must NOT Have (Guardrails)
- Complex state machines or over-engineered solutions
- Changes to session-model-state.ts (core storage module)
- Breaking changes to hook interface
- Side effects in other hooks or tools

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD (Tests-first to verify fix)
- **Framework**: bun test (Bun test framework)

### Agent-Executed QA Scenarios

**Task 1 Verification**:
```
Scenario: Tool message cannot initialize model storage
Tool: Bun test runner
Preconditions: Fresh test environment, no model stored for session
Steps:
  1. Create test session with ID "tool-test-session"
  2. Simulate tool message with model={providerID:"openai", modelID:"gpt-4o"} and NO agent field
  3. Call model-persistence hook "chat.message" handler
  4. Call getSessionModel("tool-test-session")
Expected Result: getSessionModel returns undefined (no model stored)
Failure Indicators: getSessionModel returns gpt-4o
Evidence: bun test output showing test failure

Scenario: User message with agent field correctly persists model
Tool: Bun test runner
Preconditions: Fresh test environment
Steps:
  1. Create test session with ID "user-test-session"
  2. Simulate user message with model={providerID:"anthropic", modelID:"claude-3"}, agent="user"
  3. Call model-persistence hook "chat.message" handler
  4. Call getSessionModel("user-test-session")
Expected Result: getSessionModel returns claude-3 model
Failure Indicators: getSessionModel returns undefined or different model
Evidence: bun test output showing test pass

Scenario: Existing model not overwritten by tool message
Tool: Bun test runner
Preconditions: Session has stored model from user selection
Steps:
  1. Set session model to {providerID:"anthropic", modelID:"claude-3"}
  2. Simulate tool message with model={providerID:"openai", modelID:"gpt-4o"}
  3. Call model-persistence hook "chat.message" handler
  4. Call getSessionModel
Expected Result: Model remains claude-3 (not changed to gpt-4o)
Failure Indicators: Model changed to gpt-4o
Evidence: bun test output showing model unchanged
```

**Task 2 Verification**:
```
Scenario: Updated unit tests pass
Tool: Bun test runner
Preconditions: Modified state.model-persistence.test.ts
Steps:
  1. Run bun test src/features/claude-code-session-state/state.model-persistence.test.ts
  2. Verify all test assertions pass
Expected Result: All tests pass with 0 failures
Evidence: bun test output
```

**Task 3 Verification**:
```
Scenario: Integration tests for tool/continuation scenarios pass
Tool: Bun test runner
Preconditions: New integration tests added
Steps:
  1. Run bun test src/tools/delegate-task/model-persistence.integration.test.ts
  2. Verify all new scenarios pass
Expected Result: All tests pass with 0 failures
Evidence: bun test output
```

---

## Execution Strategy

### Sequential Execution (No Parallelization)
```
Task 1 (Fix hook logic)
    ↓
Task 2 (Update unit tests)
    ↓
Task 3 (Add integration tests)
    ↓
Task 4 (Run full test suite)
```

### Dependency Matrix
| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 4 | None |
| 2 | 1 | 4 | None |
| 3 | 1 | 4 | None |
| 4 | 2, 3 | None | None |

### Agent Dispatch Summary
| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1 | task(category="quick", load_skills=["typescript", "debugging"]) |
| 2 | 2 | task(category="quick", load_skills=["testing", "typescript"]) |
| 3 | 3 | task(category="quick", load_skills=["testing", "typescript"]) |
| 4 | 4 | task(category="quick", load_skills=["testing"]) |

---

## TODOs

- [ ] 1. Fix model-persistence.ts hook logic

**What to do**:
- Change the condition from `if (!existingModel || agent)` to `if (agent)`
- This ensures ONLY user messages (with `agent` field) can persist models
- Tool/DCP/continuation messages (without `agent`) cannot initialize or overwrite

**Must NOT do**:
- Don't change session-model-state.ts storage API
- Don't add complex conditional logic
- Don't modify other hooks

**Recommended Agent Profile**:
- **Category**: `quick` - Simple bug fix, single file change
- **Skills**: TypeScript, debugging
- **Skills Evaluated but Omitted**: N/A - straightforward fix

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: Tasks 2, 3, 4
- **Blocked By**: None (can start immediately)

**References**:
- `local/oh-my-opencode/src/hooks/model-persistence.ts:23-36` - Hook logic to fix
- `local/oh-my-opencode/src/shared/session-model-state.ts:5-7` - setSessionModel function
- `local/oh-my-opencode/src/shared/session-model-state.ts:9-11` - getSessionModel function

**Acceptance Criteria**:
- [ ] Line 27 condition changed from `if (!existingModel || agent)` to `if (agent)`
- [ ] Comment on line 24-25 updated to reflect new logic
- [ ] TypeScript compiles without errors: `bun run typecheck` passes
- [ ] File passes linting

**Agent-Executed QA Scenarios**:
```
Scenario: Verify hook logic change
Tool: Read tool + Bash
Preconditions: Hook file exists
Steps:
  1. Read local/oh-my-opencode/src/hooks/model-persistence.ts
  2. Verify line 27 contains: if (agent) {
  3. Run: cd local/oh-my-opencode && bun run typecheck
Expected Result: Typecheck passes, no errors
Evidence: Typecheck output showing success
```

**Commit**: YES
- Message: `fix(hooks): only persist model from user messages`
- Files: `local/oh-my-opencode/src/hooks/model-persistence.ts`
- Pre-commit: `bun run typecheck`

---

- [ ] 2. Update unit tests for new persistence behavior

**What to do**:
- Update `state.model-persistence.test.ts` to test new behavior
- Add test: tool messages without agent field do NOT persist model
- Add test: tool messages with existing model do NOT overwrite
- Update existing tests if they relied on `!existingModel` behavior

**Must NOT do**:
- Don't change test framework or structure
- Don't remove existing valid tests
- Don't add tests for unrelated functionality

**Recommended Agent Profile**:
- **Category**: `quick` - Test updates
- **Skills**: Testing, TypeScript
- **Skills Evaluated but Omitted**: N/A

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: Task 4
- **Blocked By**: Task 1

**References**:
- `local/oh-my-opencode/src/features/claude-code-session-state/state.model-persistence.test.ts` - Test file to update
- `local/oh-my-opencode/src/shared/session-model-state.ts` - Functions being tested

**Acceptance Criteria**:
- [ ] New test: "should not persist model from tool message without agent field"
- [ ] New test: "should not overwrite existing model from tool message"
- [ ] Existing tests updated if needed
- [ ] All tests pass: `bun test src/features/claude-code-session-state/state.model-persistence.test.ts`

**Agent-Executed QA Scenarios**:
```
Scenario: Unit tests pass with new behavior
Tool: Bun test runner
Preconditions: Tests updated per spec
Steps:
  1. Run: cd local/oh-my-opencode && bun test src/features/claude-code-session-state/state.model-persistence.test.ts
  2. Verify: All tests pass (no failures)
Expected Result: 10+ tests passing, 0 failures
Evidence: bun test output showing pass
```

**Commit**: YES
- Message: `test: update unit tests for user-only model persistence`
- Files: `local/oh-my-opencode/src/features/claude-code-session-state/state.model-persistence.test.ts`
- Pre-commit: `bun test src/features/claude-code-session-state/state.model-persistence.test.ts`

---

- [ ] 3. Add integration tests for tool/continuation scenarios

**What to do**:
- Add integration tests in `model-persistence.integration.test.ts`
- Test: DCP tool execution doesn't affect main session model
- Test: Continuation messages don't reset model
- Test: Multiple tool messages in sequence don't affect model
- Test: Rapid successive tool calls don't affect model

**Must NOT do**:
- Don't modify existing integration test structure
- Don't test implementation details (test behavior, not code)
- Don't add unrelated scenarios

**Recommended Agent Profile**:
- **Category**: `quick` - Integration test additions
- **Skills**: Testing, TypeScript
- **Skills Evaluated but Omitted**: N/A

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: Task 4
- **Blocked By**: Task 1

**References**:
- `local/oh-my-opencode/src/tools/delegate-task/model-persistence.integration.test.ts` - Integration tests
- `local/oh-my-opencode/src/hooks/model-persistence.ts` - Hook being tested

**Acceptance Criteria**:
- [ ] New test: "should not persist model from DCP tool execution"
- [ ] New test: "should not reset model after continuation message"
- [ ] New test: "should maintain model across multiple tool messages"
- [ ] All tests pass: `bun test src/tools/delegate-task/model-persistence.integration.test.ts`

**Agent-Executed QA Scenarios**:
```
Scenario: Integration tests pass
Tool: Bun test runner
Preconditions: Integration tests added
Steps:
  1. Run: cd local/oh-my-opencode && bun test src/tools/delegate-task/model-persistence.integration.test.ts
  2. Verify: All tests pass
Expected Result: All integration tests passing, 0 failures
Evidence: bun test output showing pass
```

**Commit**: YES
- Message: `test: add integration tests for tool/continuation model persistence`
- Files: `local/oh-my-opencode/src/tools/delegate-task/model-persistence.integration.test.ts`
- Pre-commit: `bun test src/tools/delegate-task/model-persistence.integration.test.ts`

---

- [ ] 4. Run full test suite

**What to do**:
- Run the complete test suite for oh-my-opencode
- Verify no regressions in other areas
- Confirm all model-persistence related tests pass

**Must NOT do**:
- Don't fix unrelated test failures (document them only)
- Don't skip failing tests
- Don't modify test configuration

**Recommended Agent Profile**:
- **Category**: `quick` - Test execution
- **Skills**: Testing
- **Skills Evaluated but Omitted**: N/A

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: None
- **Blocked By**: Tasks 1, 2, 3

**References**:
- `local/oh-my-opencode/package.json` - Test configuration
- `local/oh-my-opencode/bunfig.toml` - Bun test setup

**Acceptance Criteria**:
- [ ] Run: `bun test` in local/oh-my-opencode
- [ ] All tests pass OR only unrelated failures documented
- [ ] Model persistence tests specifically pass

**Agent-Executed QA Scenarios**:
```
Scenario: Full test suite passes
Tool: Bun test runner
Preconditions: All changes committed
Steps:
  1. Run: cd local/oh-my-opencode && bun test
  2. Wait for completion
  3. Parse results: Check for failures
Expected Result: All tests pass OR failures are unrelated to model persistence
Evidence: bun test output summary
```

**Commit**: NO (verification step only)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `fix(hooks): only persist model from user messages` | model-persistence.ts | `bun run typecheck` |
| 2 | `test: update unit tests for user-only model persistence` | state.model-persistence.test.ts | `bun test [file]` |
| 3 | `test: add integration tests for tool/continuation model persistence` | model-persistence.integration.test.ts | `bun test [file]` |

---

## Success Criteria

### Verification Commands
```bash
# Type check
cd local/oh-my-opencode && bun run typecheck

# Unit tests
bun test src/features/claude-code-session-state/state.model-persistence.test.ts

# Integration tests
bun test src/tools/delegate-task/model-persistence.integration.test.ts

# Full test suite
bun test
```

### Final Checklist
- [ ] Hook logic changed from `if (!existingModel || agent)` to `if (agent)`
- [ ] Tool messages cannot initialize session model storage
- [ ] Continuation messages cannot reset model to default
- [ ] DCP messages don't affect stored model
- [ ] User messages with `agent` field correctly persist model
- [ ] Model persists across continuation cycles
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Full test suite passes OR no model-persistence regressions
