# Plan: Fix Model Persistence - Part 2 (The Real Bug)

## TL;DR
The model is still being overwritten because there are TWO locations calling `setSessionModel`:
1. `chat-message.ts` (already fixed)
2. `src/hooks/model-persistence.ts` (lines 22-23) - **STILL UNCONDITIONAL**

The `model-persistence.ts` hook has its own `chat.message` handler that calls `setSessionModel` without checking for existing models, overwriting the user's selection.

**Estimated Effort**: Quick (5 minutes)
**Parallel Execution**: No
**Critical Path**: Single task

---

## Context

### Problem
User-selected model persists in `chat-message.ts` but gets overwritten by the `model-persistence.ts` hook which runs separately and unconditionally saves `input.model`.

### Root Cause
In `src/hooks/model-persistence.ts:22-23`:
```typescript
if (model && sessionID) {
  setSessionModel(sessionID, model)  // NO CHECK! Overwrites every time!
}
```

### What Was Already Done
- Modified `chat-message.ts` with conditional logic (lines 196-203)
- But `model-persistence.ts` hook still overwrites unconditionally

### What Needs To Be Done
Apply the same conditional logic to `model-persistence.ts` that was applied to `chat-message.ts`.

---

## Work Objectives

### Core Objective
Prevent `model-persistence.ts` hook from overwriting existing session models.

### Concrete Deliverables
- [ ] Modified `src/hooks/model-persistence.ts` with conditional save logic
- [ ] Import `getSessionModel` in the file
- [ ] All tests pass

### Definition of Done
- [ ] User model persists after tool usage
- [ ] No TypeScript errors
- [ ] All existing tests pass

---

## Execution Strategy

### Single Task
```
Task 1: Fix model-persistence.ts hook
├── Import getSessionModel
├── Modify chat.message handler
├── Add conditional check before setSessionModel
└── Run tests
```

---

## TODOs

### Task 1: Fix model-persistence.ts hook
**What to do**:
- [ ] Add import: `getSessionModel` from `"../shared/session-model-state"`
- [ ] Modify lines 13-31 from:
  ```typescript
  "chat.message": async (
    input: {
      sessionID: string
      model?: { providerID: string; modelID: string; variant?: string }
    },
    _output: unknown
  ): Promise<void> => {
    const { sessionID, model } = input

    if (model && sessionID) {
      setSessionModel(sessionID, model)
      log(`[${HOOK_NAME}] Model saved for session`, {
        sessionID,
        providerID: model.providerID,
        modelID: model.modelID,
        variant: model.variant,
      })
    }
  },
  ```
- [ ] To:
  ```typescript
  "chat.message": async (
    input: {
      sessionID: string
      model?: { providerID: string; modelID: string; variant?: string }
      agent?: string
    },
    _output: unknown
  ): Promise<void> => {
    const { sessionID, model, agent } = input

    if (model && sessionID) {
      // Only save if no model already stored OR if this is a user message (has agent)
      // Tool usage messages should not overwrite user-selected model
      const existingModel = getSessionModel(sessionID)
      if (!existingModel || agent) {
        setSessionModel(sessionID, model)
        log(`[${HOOK_NAME}] Model saved for session`, {
          sessionID,
          providerID: model.providerID,
          modelID: model.modelID,
          variant: model.variant,
        })
      }
    }
  },
  ```

**Must NOT do**:
- Don't remove the event handler (lines 33-42)
- Don't change the clearSessionModel call
- Don't change the HOOK_NAME constant

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: `clean-architecture`
- Reason: Simple conditional logic change matching existing pattern

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: Task 2
- **Blocked By**: None

**References**:
- `src/hooks/model-persistence.ts:1-44` - Current hook implementation
- `src/plugin/chat-message.ts:196-203` - Same fix pattern already applied
- `src/shared/session-model-state.ts:29-36` - getSessionModel function

**Acceptance Criteria**:
- [ ] Code compiles without errors
- [ ] Logic matches chat-message.ts pattern
- [ ] Tests pass

**Commit**: YES
- Message: `fix(model-persistence): prevent overwriting existing session models`
- Files: `src/hooks/model-persistence.ts`

---

### Task 2: Run tests and verify
**What to do**:
- [ ] Run: `bun test src/hooks/model-persistence.test.ts` (if exists)
- [ ] Run: `bun test src/plugin/chat-message.test.ts`
- [ ] Verify all tests pass

**Acceptance Criteria**:
- [ ] All tests pass

**Commit**: NO (part of Task 1)

---

## Success Criteria

### Verification Commands
```bash
# Run tests
bun test src/plugin/chat-message.test.ts
bun test src/shared/session-model-state.test.ts

# Expected: All pass
```

### Final Checklist
- [ ] model-persistence.ts has conditional save logic
- [ ] getSessionModel is imported
- [ ] All tests pass
- [ ] User model persists after tool usage
