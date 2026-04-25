# Fix Main Session Tracking Bug

## TL;DR

**Problem**: `setMainSession()` is NEVER called in production code, so `getMainSessionID()` always returns `undefined`. This causes the `isMainSession()` function to treat ALL sessions as main sessions.

**Root Cause**: In `isMainSession()`, when `getMainSessionID()` returns undefined, the function falls through to `return true`, assuming any session without a tracked main is the main session.

**Solution**: Change the logic in `isMainSession()` to return `false` for unknown sessions instead of assuming they're main sessions.

---

## Context

### The Bug Flow
1. `setMainSession()` is **never called** in production
2. `getMainSessionID()` always returns `undefined`
3. In `isMainSession()`:
   ```typescript
   if (subagentSessions.has(sessionID)) return false  // OK
   if (backgroundSessions.has(sessionID)) return false  // OK
   
   const mainSessionID = getMainSessionID()  // Always undefined!
   if (mainSessionID) {
     return sessionID === mainSessionID
   }
   
   // BUG: Unknown sessions treated as main!
   return true
   ```
4. Result: Every session is treated as main session

### Where setMainSession Should Be Called
Looking at the code, `setMainSession()` should probably be called:
- When a new session starts and it's the first/primary session
- Or we should change the logic to not require explicit tracking

### The Fix
Change line 24-26 in `model-persistence.ts`:

**Before:**
```typescript
// If no main session is tracked yet, assume this is the main session
return true
```

**After:**
```typescript
// If no main session is tracked, unknown sessions are NOT main
return false
```

This way:
- Sessions explicitly in `subagentSessions` or `backgroundSessions` → not main
- Sessions explicitly tracked as main → main
- Unknown sessions → NOT main (conservative approach)

---

## Changes Required

**File**: `local/oh-my-opencode/src/hooks/model-persistence.ts`

**Change**:
```typescript
// Line 24-26, change from:
// If no main session is tracked yet, assume this is the main session
// (first session to send a message with an agent field)
return true

// To:
// If no main session is tracked, unknown sessions are NOT main
return false
```

---

## Success Criteria

- [ ] Line 26 changed from `return true` to `return false`
- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] Model persistence only works for explicitly tracked sessions
