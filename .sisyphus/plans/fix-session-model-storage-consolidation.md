# Fix: Consolidate Session Model Storage Systems

## Problem Summary

**ROOT CAUSE IDENTIFIED**: We have **TWO separate session model storage systems** that don't share data:

1. **`chat-message.ts`** saves to: `src/shared/session-model-state.ts` (line 6)
2. **`continuation-injection.ts`** reads from: `src/features/claude-code-session-state/state.ts` (our new code)

**They have separate Maps:**
- `sessionModels` in `src/shared/session-model-state.ts` (line 3)
- `sessionModelMap` in `src/features/claude-code-session-state/state.ts` (line 89)

When user sends a message, it saves to one Map. When continuation retrieves, it looks in a different Map. They never see each other!

## JSONL Investigation Results

- **Only 1 JSONL file found**: `.sisyphus/analysis/antigravity-awesome-skills/skills/loki-mode/benchmarks/datasets/humaneval.jsonl`
- This is just a **benchmark dataset** - not config, not affecting model selection
- **NO JSONL config files exist** that would affect model persistence

## The Fix

Consolidate to ONE storage system. Since `chat-message.ts` already uses `src/shared/session-model-state.ts`, we need to:

1. **Update existing** `src/shared/session-model-state.ts` to add variant support
2. **Remove duplicate** functions from `src/features/claude-code-session-state/state.ts`
3. **Update all imports** to use `src/shared/session-model-state.ts`

## Implementation Tasks

### Task 1: Update Session Model State Type

**File**: `src/shared/session-model-state.ts`

**Current**:
```typescript
export type SessionModel = { providerID: string; modelID: string }
```

**Change to**:
```typescript
export type SessionModel = { providerID: string; modelID: string; variant?: string }
```

Also add `updateSessionModel` function for consistency.

### Task 2: Remove Duplicate Functions

**File**: `src/features/claude-code-session-state/state.ts`

**Remove** lines 88-105 (the entire sessionModelMap block and functions):
```typescript
// Model persistence for auto-continuation
const sessionModelMap = new Map<string, { providerID: string; modelID: string; variant?: string }>()

export function setSessionModel(...)
export function getSessionModel(...)
export function updateSessionModel(...)
export function clearSessionModel(...)
```

### Task 3: Update Imports in idle-event.ts

**File**: `src/hooks/todo-continuation-enforcer/idle-event.ts`

**Current import** (line 3):
```typescript
import { getSessionAgent, getSessionModel, setSessionModel } from "../../features/claude-code-session-state"
```

**Change to**:
```typescript
import { getSessionAgent } from "../../features/claude-code-session-state"
import { getSessionModel, setSessionModel } from "../../shared/session-model-state"
```

### Task 4: Update Imports in continuation-injection.ts

**File**: `src/hooks/todo-continuation-enforcer/continuation-injection.ts`

**Current import** (lines 4-7):
```typescript
import {
  getSessionAgent,
  resolveRegisteredAgentName,
} from "../../features/claude-code-session-state"
```

**Change to**:
```typescript
import {
  getSessionAgent,
  resolveRegisteredAgentName,
} from "../../features/claude-code-session-state"
import { getSessionModel } from "../../shared/session-model-state"
```

### Task 5: Update Imports in resolve-message-info.ts

**File**: `src/hooks/todo-continuation-enforcer/resolve-message-info.ts`

**Current import** (line 5):
```typescript
import { getSessionModel } from "../../features/claude-code-session-state"
```

**Change to**:
```typescript
import { getSessionModel } from "../../shared/session-model-state"
```

### Task 6: Update Imports in handler.ts

**File**: `src/hooks/todo-continuation-enforcer/handler.ts`

**Current import** (lines 4-7):
```typescript
import {
  clearContinuationMarker,
} from "../../features/run-continuation-state"
import { clearSessionModel } from "../../features/claude-code-session-state"
```

**Change to**:
```typescript
import {
  clearContinuationMarker,
} from "../../features/run-continuation-state"
import { clearSessionModel } from "../../shared/session-model-state"
```

### Task 7: Update Test File

**File**: `src/features/claude-code-session-state/state.model-persistence.test.ts`

Update imports to use `src/shared/session-model-state` instead.

### Task 8: Delete model-persistence.ts Hook (Optional)

**File**: `src/hooks/model-persistence.ts`

This hook may be redundant since `chat-message.ts` already saves the model. Evaluate if needed.

### Task 9: Update Hook Registration

If keeping the model-persistence hook, update its import:

**File**: `src/hooks/model-persistence.ts`

**Current import**:
```typescript
import { setSessionModel, clearSessionModel } from "../features/claude-code-session-state"
```

**Change to**:
```typescript
import { setSessionModel, clearSessionModel } from "../shared/session-model-state"
```

## Verification Steps

1. Run TypeScript compilation: `bun run typecheck`
2. Run tests: `bun test`
3. Manually test: Start session with GLM-5, trigger continuation, verify model persists

## Expected Behavior After Fix

```
User selects GLM-5 → Sends message
    ↓
chat-message.ts saves to sessionModels (shared/session-model-state.ts)
    ↓
Auto-continuation triggers
    ↓
continuation-injection.ts reads from sessionModels (shared/session-model-state.ts)
    ↓
Uses GLM-5 (SAME Map!)
```

## Files Modified Summary

| File | Change |
|------|--------|
| `src/shared/session-model-state.ts` | Add variant to type, add updateSessionModel |
| `src/features/claude-code-session-state/state.ts` | Remove duplicate sessionModelMap block |
| `src/hooks/todo-continuation-enforcer/idle-event.ts` | Update imports |
| `src/hooks/todo-continuation-enforcer/continuation-injection.ts` | Update imports |
| `src/hooks/todo-continuation-enforcer/resolve-message-info.ts` | Update imports |
| `src/hooks/todo-continuation-enforcer/handler.ts` | Update imports |
| `src/hooks/model-persistence.ts` | Update imports (if keeping) |
| `src/features/claude-code-session-state/state.model-persistence.test.ts` | Update imports |
