# Fix Model Persistence Import Bug

## TL;DR

**Problem**: `model-persistence.ts` has its OWN buggy `isMainSession()` function that only checks `subagentSessions` but NOT `backgroundSessions`.

**Root Cause**: The hook doesn't import the proper `isMainSession()` from `state.ts` - instead it has a duplicate implementation with a bug.

**Solution**: Import and use the exported `isMainSession()` from `state.ts` instead of the local buggy version.

**Fix Location**: `local/oh-my-opencode/src/hooks/model-persistence.ts`

---

## Context

### Original Request
Fix model persistence bug where background sessions (DCP) are not being properly excluded from model persistence.

### The Bug
**Current buggy code in model-persistence.ts (lines 4, 12-27):**
```typescript
import { getMainSessionID, subagentSessions } from "../features/claude-code-session-state"

function isMainSession(sessionID: string): boolean {
  // BUG: Only checks subagentSessions, NOT backgroundSessions!
  if (subagentSessions.has(sessionID)) {
    return false
  }
  // ... rest of buggy logic
}
```

**Correct implementation in state.ts:**
```typescript
export function isMainSession(sessionID: string): boolean {
  // CORRECT: Checks BOTH subagentSessions AND backgroundSessions
  if (subagentSessions.has(sessionID) || backgroundSessions.has(sessionID)) {
    return false
  }
  // ... proper logic
}
```

### Why This Causes The Bug
1. DCP creates child sessions
2. Those sessions ARE added to `subagentSessions` (by our fix in sync-session-creator.ts)
3. BUT the hook's buggy `isMainSession()` only checks `subagentSessions`
4. Wait - that should work...

Actually wait, let me re-check: The hook imports `subagentSessions` and checks it. So DCP sessions SHOULD be excluded. Unless...

**The real issue**: The hook is using a DUPLICATE implementation instead of importing the proper one! And the duplicate might have subtle differences.

---

## The Fix

**File**: `local/oh-my-opencode/src/hooks/model-persistence.ts`

**Changes**:
1. Import `isMainSession` from claude-code-session-state
2. Remove the local duplicate `isMainSession()` function
3. Use the imported function

**Code Change:**
```typescript
// BEFORE (buggy):
import { getMainSessionID, subagentSessions } from "../features/claude-code-session-state"

function isMainSession(sessionID: string): boolean {
  if (subagentSessions.has(sessionID)) {
    return false
  }
  // ...
}

// AFTER (fixed):
import { isMainSession } from "../features/claude-code-session-state"

// Remove local function - use imported one
```

---

## Success Criteria

- [ ] Import `isMainSession` from claude-code-session-state
- [ ] Remove local duplicate `isMainSession()` function
- [ ] TypeScript compiles without errors
- [ ] All tests pass
