# Fix DCP Session Tracking Bug

## TL;DR

**Problem**: When DCP (or any subagent) creates a child session, it's NOT tracked in `subagentSessions`. This causes the model-persistence hook to treat DCP sessions as main sessions and save the default "oh-my-opencode" model.

**Root Cause**: `createSyncSession` in `sync-session-creator.ts` creates child sessions but doesn't add them to `subagentSessions`.

**Solution**: Add `subagentSessions.add(sessionID)` after creating child sessions.

**Deliverables**:
- Fixed sync-session-creator.ts
- All tests passing

**Estimated Effort**: Quick (30 minutes)

---

## Context

### Original Request
Fix issue where selected main session model resets to default oh-my-opencode model after DCP summary messages.

### Root Cause Analysis
1. DCP tool creates a child session via `createSyncSession`
2. Child session has `parentID` but is NOT in `subagentSessions`
3. Model-persistence hook checks `isMainSession()` which returns `true` (not in subagentSessions)
4. Hook saves DCP's default model to "main session"
5. User's actual main session model gets overwritten

### Code Location
- **Bug Location**: `local/oh-my-opencode/src/tools/delegate-task/sync-session-creator.ts`
- **Fix Location**: Line 33 (after session creation)

---

## Work Objectives

### Core Objective
Fix the session tracking bug so child sessions (DCP/subagents) are properly registered as subagents.

### Concrete Deliverables
1. Fixed sync-session-creator.ts to track child sessions
2. All existing tests pass
3. Model persistence works correctly

### Definition of Done
- [ ] Child sessions are added to `subagentSessions`
- [ ] DCP sessions don't affect main session model
- [ ] All tests pass

---

## Execution Strategy

### Sequential Execution
```
Task 1 (Fix sync-session-creator.ts)
    ↓
Task 2 (Run tests)
```

---

## TODOs

- [ ] 1. Fix sync-session-creator.ts to track child sessions

**What to do**:
- Import `subagentSessions` from claude-code-session-state
- After successful session creation, add sessionID to subagentSessions
- This ensures child sessions are tracked as subagents

**Code Change**:
```typescript
// Add import
import { subagentSessions } from "../../features/claude-code-session-state"

// After line 33, add:
subagentSessions.add(createResult.data.id)
```

**Acceptance Criteria**:
- [ ] Import added at top of file
- [ ] subagentSessions.add() called after session creation
- [ ] TypeScript compiles without errors

---

- [ ] 2. Run tests to verify fix

**What to do**:
- Run oh-my-opencode tests
- Verify model persistence tests pass
- Verify DCP-related tests pass

**Acceptance Criteria**:
- [ ] All tests pass
- [ ] No regressions

---

## Success Criteria

### Verification Commands
```bash
# Build
cd local/oh-my-opencode && bun run build

# Test
cd local/oh-my-opencode && bun test
```

### Final Checklist
- [ ] sync-session-creator.ts imports subagentSessions
- [ ] Child sessions added to subagentSessions
- [ ] TypeScript compiles
- [ ] All tests pass
- [ ] DCP no longer affects main session model
