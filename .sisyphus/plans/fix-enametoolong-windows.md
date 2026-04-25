# Fix ENAMETOOLONG: uv_spawn Error on Windows Prompt Submit

## TL;DR
> **Issue**: `ENAMETOOLONG: name too long, uv_spawn` occurs when submitting any prompt on Windows due to expanded command strings exceeding Windows' ~32,767 character limit for spawn arguments.
>
> **Root Cause**: Hook command execution expands `$CLAUDE_PROJECT_DIR` to full Windows paths, creating excessively long command strings when combined with prompt data.
>
> **Fix Strategy**: 
> 1. Truncate/validate commands before spawn in hook executor
> 2. Wire Windows-safe directory resolver to all session creation paths
> 3. Add command length guards to openclaw gateway dispatcher
>
> **Estimated Effort**: Medium (~4-6 hours)
> **Parallel Execution**: NO - Sequential (dependencies exist)
> **Critical Path**: Hook fix → Session resolver → Gateway fix → Tests → Verification

---

## Context

### Original Request
User reports ENAMETOOLONG error when submitting prompts to newest sessions on Windows. Any prompt triggers the issue. This is an urgent blocker.

### Root Cause Analysis
**Primary Culprit**: `local/oh-my-opencode/src/shared/command-executor/execute-hook-command.ts`

The spawn call at lines 56-61:
```typescript
const proc = spawn(finalCommand, {
  cwd,
  shell: true,
  detached: !isWin32,
  env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: cwd },
});
```

**Chain of events causing failure**:
1. User submits prompt
2. `user-prompt-submit.ts` (line 91) calls `dispatchHook` with JSON-ified prompt data
3. `dispatch-hook.ts` (line 21-26) calls `executeHookCommand` with expanded command
4. `execute-hook-command.ts` (line 30-34) expands `$CLAUDE_PROJECT_DIR` to full path
5. `execute-hook-command.ts` (line 56) spawns with `shell: true`
6. On Windows, command line exceeds 32,767 char limit → ENAMETOOLONG

**Secondary Issues**:
- Session creation bypasses Windows-safe resolver in 4 locations
- Openclaw gateway dispatcher doesn't validate command length before spawn

### Windows Path Context
- Windows command-line limit: 32,767 characters
- Windows path limit: 260 characters (MAX_PATH) unless long path support enabled
- AppData paths are notoriously long: `C:\Users\Username\AppData\Local\...`

---

## Work Objectives

### Core Objective
Fix ENAMETOOLONG error on Windows by ensuring all spawn operations stay within Windows command-line limits, with comprehensive testing to prevent regression.

### Concrete Deliverables
1. Modified `execute-hook-command.ts` with command length validation
2. Modified 4 session creation files to use Windows-safe directory resolver
3. Modified `openclaw/dispatcher.ts` with command length guards
4. New test suite for long path handling
5. Verified fix working on Windows

### Definition of Done
- [ ] Any prompt can be submitted on Windows without ENAMETOOLONG error
- [ ] Commands exceeding limit are handled gracefully (truncated or error with clear message)
- [ ] Session creation always uses safe directory paths
- [ ] All tests pass including new long-path tests
- [ ] Fix verified with actual Windows prompt submission

### Must Have
- Command length check before every spawn
- Windows-safe directory resolution in all session creation paths
- Graceful error handling when limits exceeded
- Comprehensive test coverage

### Must NOT Have (Guardrails)
- Breaking changes to existing spawn behavior on non-Windows platforms
- Removal of existing functionality - only add safeguards
- Assuming long path support is enabled on Windows
- AI-generated "clever" solutions that add complexity

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Bun test framework)
- **Automated tests**: TDD - Write tests first, then implementation
- **Framework**: bun test (existing)

### If TDD Enabled

**Task Structure per Fix:**
1. **RED**: Write failing test first - Test command length validation
2. **GREEN**: Implement minimum code to pass
3. **REFACTOR**: Clean up while keeping green

### Agent-Executed QA Scenarios (MANDATORY)

**Scenario: Submit prompt with long path on Windows**
Tool: Playwright/Bash (simulated)
Preconditions: Windows environment, long project path (>200 chars)
Steps:
1. Create session with long path: `C:\Users\...\very\long\nested\path\...\project`
2. Submit any prompt: "Hello"
3. Assert: No ENAMETOOLONG error
4. Assert: Prompt processed successfully
Expected Result: Prompt submits without error
Evidence: `.sisyphus/evidence/prompt-submit-long-path.png`

**Scenario: Command length validation triggers**
Tool: Bash (bun test)
Preconditions: Test environment with mock long command
Steps:
1. Run: `bun test src/shared/command-executor/execute-hook-command.test.ts`
2. Assert: Tests for command length validation pass
3. Assert: Commands >32,000 chars are handled
Expected Result: All tests pass
Evidence: Test output captured

**Scenario: Windows-safe session creation**
Tool: Bash (bun test)
Preconditions: Mock Windows AppData directory
Steps:
1. Run: `bun test src/tools/delegate-task/sync-session-creator.test.ts`
2. Assert: Session directory is resolved to safe path
3. Assert: Not using raw AppData path
Expected Result: All tests pass
Evidence: Test output captured

**Scenario: Openclaw command length guard**
Tool: Bash (bun test)
Preconditions: Mock gateway with long interpolated command
Steps:
1. Run: `bun test src/openclaw/dispatcher.test.ts`
2. Assert: Long commands are rejected/truncated
3. Assert: Clear error message provided
Expected Result: All tests pass
Evidence: Test output captured

---

## Execution Strategy

### Sequential Execution (NO Parallel - dependencies exist)

```
Phase 1: Tests First
├── Task 1: Write test for command length validation
└── Task 2: Write test for Windows-safe session creation

Phase 2: Core Fixes
├── Task 3: Fix execute-hook-command.ts (depends: 1)
├── Task 4: Fix session creation paths (depends: 2)
└── Task 5: Fix openclaw dispatcher (independent)

Phase 3: Integration & Verification
├── Task 6: Run all tests (depends: 3, 4, 5)
└── Task 7: Manual verification on Windows (depends: 6)
```

### Critical Path
Task 1 (test) → Task 3 (hook fix) → Task 6 (integration test) → Task 7 (manual verify)

---

## TODOs

### Task 1: Write failing test for command length validation
**What to do**:
- Create `local/oh-my-opencode/src/shared/command-executor/execute-hook-command.test.ts`
- Test that commands exceeding Windows limit throw clear error
- Test that commands near limit work correctly
- Test command length calculation includes expanded variables

**Must NOT do**:
- Skip tests for non-Windows platforms (test behavior should be same)
- Mock spawn incorrectly - use actual spawn behavior

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: [`test-driven-development`]
- `test-driven-development`: Write comprehensive tests first before implementation

**Parallelization**: Sequential (Task 1 must complete before Task 3)

**References**:
- `local/oh-my-opencode/src/shared/command-executor/execute-hook-command.ts:56-61` - Spawn location to test
- `local/oh-my-opencode/src/shared/command-executor/` - Existing executor patterns
- `bun test` - Test runner documentation

**Acceptance Criteria**:
- [ ] Test file created: `execute-hook-command.test.ts`
- [ ] Test covers: Commands >32,767 chars throw error
- [ ] Test covers: Commands <32,767 chars execute normally
- [ ] Test covers: Variable expansion increases command length
- [ ] `bun test execute-hook-command.test.ts` → FAIL (implementation doesn't exist yet)

**Evidence to Capture**:
- [ ] Test file path: `local/oh-my-opencode/src/shared/command-executor/execute-hook-command.test.ts`
- [ ] Screenshot: Test failure showing expected behavior

**Commit**: YES
- Message: `test(command-executor): add command length validation tests`
- Files: `execute-hook-command.test.ts`

---

### Task 2: Write failing test for Windows-safe session creation
**What to do**:
- Create `local/oh-my-opencode/src/shared/session-directory-resolver.test.ts` (if doesn't exist)
- Test that AppData paths are resolved to safe alternatives
- Test that non-AppData paths pass through unchanged
- Test integration with session creators

**Must NOT do**:
- Test only the resolver in isolation - test actual session creation paths
- Skip Windows-specific path handling

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: [`test-driven-development`]

**Parallelization**: Sequential (Task 2 must complete before Task 4)

**References**:
- `local/oh-my-opencode/src/shared/session-directory-resolver.ts:32-40` - Resolver implementation
- `local/oh-my-opencode/src/tools/delegate-task/sync-session-creator.ts:11,20` - Session creation path
- `local/oh-my-opencode/src/tools/call_omo_agent/session-creator.ts:36,44` - Another session creation path

**Acceptance Criteria**:
- [ ] Test file created/updated: `session-directory-resolver.test.ts`
- [ ] Test covers: AppData paths resolved to cwd
- [ ] Test covers: Normal paths pass through
- [ ] Test covers: All 4 session creation locations use resolver
- [ ] `bun test session-directory-resolver.test.ts` → FAIL (integration not done)

**Evidence to Capture**:
- [ ] Test file path: `local/oh-my-opencode/src/shared/session-directory-resolver.test.ts`
- [ ] Screenshot: Test failure showing expected behavior

**Commit**: YES
- Message: `test(session): add Windows-safe directory resolution tests`
- Files: `session-directory-resolver.test.ts`, related test files

---

### Task 3: Fix execute-hook-command.ts command length validation
**What to do**:
- Modify `local/oh-my-opencode/src/shared/command-executor/execute-hook-command.ts`
- Add command length check BEFORE spawn (line 56)
- Windows limit: 32,767 characters
- If exceeded: throw clear error with truncated command preview
- Consider using `spawn` with args array instead of `shell: true` for long commands
- Add helper function to calculate command length with expansion

**Implementation approach**:
```typescript
// Add constant at top
const WINDOWS_MAX_COMMAND_LENGTH = 32767;

// Add validation before spawn (around line 56)
if (isWin32 && finalCommand.length > WINDOWS_MAX_COMMAND_LENGTH) {
  const truncatedCommand = finalCommand.substring(0, 100) + "... [truncated]";
  throw new Error(
    `Command exceeds Windows maximum length (${finalCommand.length} > ${WINDOWS_MAX_COMMAND_LENGTH}). ` +
    `Command starts with: ${truncatedCommand}. ` +
    `Consider using a shorter project path or enabling Windows Long Path support.`
  );
}
```

**Alternative approach** (if common):
Instead of throwing, use spawn with args array which has higher limits:
```typescript
const [cmd, ...args] = parseCommand(finalCommand);
const proc = spawn(cmd, args, { ... }); // No shell: true for long commands
```

**Must NOT do**:
- Silently truncate commands (data loss)
- Remove `shell: true` without testing (may break existing behavior)
- Use different behavior on non-Windows (keep consistent)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: [`clean-architecture`]
- `clean-architecture`: Ensure fix is clean, readable, follows existing patterns

**Parallelization**: Sequential (depends on Task 1, blocks Task 6)

**References**:
- `local/oh-my-opencode/src/shared/command-executor/execute-hook-command.ts:30-61` - Target file
- `local/oh-my-opencode/src/shared/command-executor/` - Directory context

**Acceptance Criteria**:
- [ ] Command length validation added
- [ ] Clear error message when limit exceeded
- [ ] Tests from Task 1 now pass: `bun test execute-hook-command.test.ts` → PASS
- [ ] Existing functionality preserved on non-Windows
- [ ] Edge cases handled: exact limit, limit-1, limit+1

**Evidence to Capture**:
- [ ] Modified file: `execute-hook-command.ts`
- [ ] Test output: `bun test execute-hook-command.test.ts` showing PASS
- [ ] Screenshot: Error message when limit exceeded (if testable)

**Commit**: YES
- Message: `fix(command-executor): add command length validation for Windows`
- Files: `execute-hook-command.ts`
- Pre-commit: `bun test execute-hook-command.test.ts`

---

### Task 4: Fix session creation to use Windows-safe directory resolver
**What to do**:
Modify 4 files to use `session-directory-resolver.ts` instead of raw parent directory:

1. `local/oh-my-opencode/src/tools/delegate-task/sync-session-creator.ts` (line 11, 20)
2. `local/oh-my-opencode/src/tools/call_omo_agent/session-creator.ts` (line 36, 44)
3. `local/oh-my-opencode/src/features/background-agent/spawner.ts` (line 93, 102)
4. `local/oh-my-opencode/src/features/background-agent/manager.ts` (line 460, 470)

**Implementation**:
```typescript
// Import resolver
import { resolveSessionDirectory } from "../../shared/session-directory-resolver";

// Replace direct usage:
// OLD: const parentDirectory = parentSession?.data?.directory ?? input.defaultDirectory
// NEW: 
const rawParentDirectory = parentSession?.data?.directory ?? input.defaultDirectory;
const parentDirectory = resolveSessionDirectory(rawParentDirectory, input.defaultDirectory);
```

**Must NOT do**:
- Change behavior on non-Windows platforms (resolver should be no-op there)
- Skip any of the 4 locations
- Break existing session creation logic

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: [`clean-architecture`]

**Parallelization**: Sequential (depends on Task 2, blocks Task 6)

**References**:
- `local/oh-my-opencode/src/shared/session-directory-resolver.ts:32-40` - Resolver to use
- `local/oh-my-opencode/src/tools/delegate-task/sync-session-creator.ts:11,20` - Location 1
- `local/oh-my-opencode/src/tools/call_omo_agent/session-creator.ts:36,44` - Location 2
- `local/oh-my-opencode/src/features/background-agent/spawner.ts:93,102` - Location 3
- `local/oh-my-opencode/src/features/background-agent/manager.ts:460,470` - Location 4

**Acceptance Criteria**:
- [ ] All 4 files modified to use resolver
- [ ] Tests from Task 2 now pass: `bun test session-directory-resolver.test.ts` → PASS
- [ ] Import statements added correctly
- [ ] No TypeScript errors
- [ ] Existing tests still pass

**Evidence to Capture**:
- [ ] Modified files list with line numbers
- [ ] Test output: `bun test session-directory-resolver.test.ts` showing PASS

**Commit**: YES
- Message: `fix(session): use Windows-safe directory resolver in all creation paths`
- Files: 4 session creation files
- Pre-commit: `bun test session-directory-resolver.test.ts`

---

### Task 5: Fix openclaw gateway dispatcher command length validation
**What to do**:
Modify `local/oh-my-opencode/src/openclaw/dispatcher.ts` (line 198-204):
- Add command length validation before spawn
- Windows limit: 32,767 characters
- If exceeded: throw error or truncate with warning

**Implementation**:
```typescript
// Around line 198-204
const interpolated = gatewayConfig.command.replace(/\{\{(\w+)\}\}/g, ...);

// Add validation
if (isWin32 && interpolated.length > WINDOWS_MAX_COMMAND_LENGTH) {
  throw new Error(
    `Gateway command exceeds Windows maximum length (${interpolated.length} > ${WINDOWS_MAX_COMMAND_LENGTH}). ` +
    `Gateway: ${gatewayName}`
  );
}

const proc = spawn(["sh", "-c", interpolated], { ... });
```

**Must NOT do**:
- Skip validation here because it's "secondary"
- Break existing gateway functionality

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: [`clean-architecture`]

**Parallelization**: Independent (can run in parallel with Tasks 3-4, but blocks Task 6)

**References**:
- `local/oh-my-opencode/src/openclaw/dispatcher.ts:198-204` - Target location
- `local/oh-my-opencode/src/openclaw/` - Openclaw directory context

**Acceptance Criteria**:
- [ ] Command length validation added to dispatcher
- [ ] New test: `bun test src/openclaw/dispatcher.test.ts` → PASS
- [ ] Clear error message when limit exceeded
- [ ] Existing tests still pass

**Evidence to Capture**:
- [ ] Modified file: `dispatcher.ts`
- [ ] Test output: `bun test dispatcher.test.ts` showing PASS

**Commit**: YES
- Message: `fix(openclaw): add command length validation to gateway dispatcher`
- Files: `dispatcher.ts`
- Pre-commit: `bun test dispatcher.test.ts`

---

### Task 6: Run full test suite and fix any regressions
**What to do**:
- Run complete test suite: `bun test`
- Fix any failing tests
- Ensure no regressions in existing functionality
- Verify all new tests pass

**Must NOT do**:
- Skip tests that are "unrelated"
- Ignore flaky tests without investigation

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: [`verification-before-completion`]
- `verification-before-completion`: Rigorous verification before marking complete

**Parallelization**: Sequential (depends on Tasks 3, 4, 5)

**References**:
- All modified files from previous tasks
- `bun test` - Test runner

**Acceptance Criteria**:
- [ ] `bun test` runs without errors
- [ ] All new tests pass (Tasks 1-5)
- [ ] All existing tests pass (no regressions)
- [ ] Test coverage maintained or improved

**Evidence to Capture**:
- [ ] Test output showing all tests pass
- [ ] Coverage report (if available)

**Commit**: NO (tests are part of feature commits)

---

### Task 7: Manual verification on Windows
**What to do**:
- Create a new session with a long path (or use existing problematic one)
- Submit a prompt: "Hello, can you help me?"
- Verify no ENAMETOOLONG error
- Verify prompt processes correctly
- Test edge cases: very long prompt, special characters

**Preconditions**:
- Windows environment available
- Long project path (e.g., in AppData or deeply nested)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: [`playwright`, `verification-before-completion`]
- `playwright`: Automated verification if possible
- `verification-before-completion`: Manual verification with evidence

**Parallelization**: Sequential (final verification step)

**Acceptance Criteria**:
- [ ] Successfully submit prompt on Windows
- [ ] No ENAMETOOLONG error
- [ ] Prompt response received
- [ ] Evidence captured (screenshots, logs)

**Evidence to Capture**:
- [ ] Screenshot: Session creation with long path
- [ ] Screenshot: Prompt submission success
- [ ] Screenshot: Response received
- [ ] Log: No errors in console/output

**Commit**: NO (manual verification)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `test(command-executor): add command length validation tests` | execute-hook-command.test.ts | bun test execute-hook-command.test.ts (fail expected) |
| 2 | `test(session): add Windows-safe directory resolution tests` | session-directory-resolver.test.ts | bun test session-directory-resolver.test.ts (fail expected) |
| 3 | `fix(command-executor): add command length validation for Windows` | execute-hook-command.ts | bun test execute-hook-command.test.ts (pass) |
| 4 | `fix(session): use Windows-safe directory resolver in all creation paths` | 4 session files | bun test session-directory-resolver.test.ts (pass) |
| 5 | `fix(openclaw): add command length validation to gateway dispatcher` | dispatcher.ts | bun test dispatcher.test.ts (pass) |

---

## Success Criteria

### Verification Commands
```bash
# Run all tests
bun test

# Expected: All tests pass, including new ones

# Test specific files
bun test src/shared/command-executor/execute-hook-command.test.ts
bun test src/shared/session-directory-resolver.test.ts
bun test src/openclaw/dispatcher.test.ts

# Expected: All PASS
```

### Final Checklist
- [ ] ENAMETOOLONG error no longer occurs on Windows
- [ ] All 7 tasks completed
- [ ] All tests pass
- [ ] Manual verification successful
- [ ] No regressions in existing functionality
- [ ] Clear error messages when limits approached
- [ ] Documentation/comments added explaining limits

---

## Notes

### Critical Windows Limitations
- `CreateProcess` API limit: 32,767 characters
- Individual argument limit: 8,191 characters on some Windows versions
- Path limit (MAX_PATH): 260 characters unless long path support enabled

### Why Not Just Enable Long Path Support?
- Requires registry modification + application manifest
- Not all applications support it
- Better to handle gracefully than require system changes

### Alternative Approaches Considered
1. **Use response files**: Write args to file, pass file path - REJECTED: Requires shell support
2. **Split into multiple spawns**: Complex, error-prone
3. **Use different spawn method**: Already considered (args array vs shell)
4. **Environment variable for long data**: Worth considering for future

### Files Modified
- `local/oh-my-opencode/src/shared/command-executor/execute-hook-command.ts`
- `local/oh-my-opencode/src/tools/delegate-task/sync-session-creator.ts`
- `local/oh-my-opencode/src/tools/call_omo_agent/session-creator.ts`
- `local/oh-my-opencode/src/features/background-agent/spawner.ts`
- `local/oh-my-opencode/src/features/background-agent/manager.ts`
- `local/oh-my-opencode/src/openclaw/dispatcher.ts`
- New test files (created in Tasks 1-2)

### Estimated Timeline
- Tasks 1-2 (Tests): 1-1.5 hours
- Tasks 3-5 (Implementation): 2-3 hours
- Task 6 (Integration): 30 minutes
- Task 7 (Manual verify): 30 minutes
- **Total**: 4-6 hours
