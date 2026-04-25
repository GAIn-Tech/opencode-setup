# Fix Auto-Continuation Model Persistence

## TL;DR
Fix the model switching issue during auto-continuation by persisting the selected model in session state and retrieving it on continuation.

## Root Cause Analysis

### The Problem
When auto-continuation triggers (after an incomplete task), the system loses track of the user's selected model and falls back to a default.

### The Chain
1. **User selects model** via UI (Ctrl+P, Tab, or dropdown)
2. **Initial message** includes `info.model` with `{providerID, modelID}`
3. **Auto-continuation triggers** (todo-continuation-enforcer)
4. **`resolve-message-info.ts`** walks backwards looking for model in message metadata
5. **If not found** in recent messages → returns `undefined`
6. **`idle-event.ts`** falls back to `getSessionAgent(sessionID)`
7. **`state.ts`** only stores **agent names**, not **models**
8. **Result**: Agent uses its default model, not user's selection

### Evidence
File: `local/oh-my-opencode/src/hooks/todo-continuation-enforcer/resolve-message-info.ts`
```typescript
// Lines 34-44: Walks backwards through messages
for (const message of reversed) {
  const info = message.info
  if (info?.model?.providerID && info?.model?.modelID) {
    return {
      agent: info.agent,
      model: { providerID: info.model.providerID, modelID: info.model.modelID, variant: info.model.variant },
      tools: info.tools,
    }
  }
}
// Returns undefined if not found in recent messages
return undefined
```

File: `local/oh-my-opencode/src/hooks/todo-continuation-enforcer/idle-event.ts`
```typescript
// Lines 168-171: Falls back to agent, not model
let agentName = resolvedInfo?.agent ?? getSessionAgent(sessionID)
let model = resolvedInfo?.model
// model is undefined here!
```

File: `local/oh-my-opencode/src/features/claude-code-session-state/state.ts`
```typescript
// Only stores agent names, NOT models
const sessionAgentMap = new Map<string, string>()
// Missing: sessionModelMap!
```

## Implementation Plan

### Task 1: Add Model Persistence to Session State
**File**: `local/oh-my-opencode/src/features/claude-code-session-state/state.ts`

Add after line 47:
```typescript
// Model persistence for auto-continuation
const sessionModelMap = new Map<string, { providerID: string; modelID: string; variant?: string }>()

export function setSessionModel(sessionID: string, model: { providerID: string; modelID: string; variant?: string }): void {
  sessionModelMap.set(sessionID, model)
}

export function getSessionModel(sessionID: string): { providerID: string; modelID: string; variant?: string } | undefined {
  return sessionModelMap.get(sessionID)
}

export function updateSessionModel(sessionID: string, model: { providerID: string; modelID: string; variant?: string }): void {
  sessionModelMap.set(sessionID, model)
}

export function clearSessionModel(sessionID: string): void {
  sessionModelMap.delete(sessionID)
}
```

### Task 2: Save Model When Selected
**File**: `local/oh-my-opencode/src/hooks/todo-continuation-enforcer/idle-event.ts`

After resolving model (around line 170), add:
```typescript
// Save model to session state for persistence
if (model && sessionID) {
  setSessionModel(sessionID, model)
} else if (!model && sessionID) {
  // Try to get from session state
  const savedModel = getSessionModel(sessionID)
  if (savedModel) {
    model = savedModel
  }
}
```

Also need to import `setSessionModel` and `getSessionModel` from state.ts.

### Task 3: Update resolve-message-info to Check Session State
**File**: `local/oh-my-opencode/src/hooks/todo-continuation-enforcer/resolve-message-info.ts`

Modify the function to accept sessionID and check session state:
```typescript
export function resolveMessageInfo(
  messages: Array<{ role: string; content: unknown; info?: unknown }>,
  sessionID?: string
): ResolvedInfo {
  // ... existing code ...
  
  // If no model found in messages, check session state
  if (!model && sessionID) {
    const savedModel = getSessionModel(sessionID)
    if (savedModel) {
      model = savedModel
    }
  }
  
  return { agent, model, tools }
}
```

### Task 4: Export New Functions
**File**: `local/oh-my-opencode/src/features/claude-code-session-state/index.ts`

Add exports:
```typescript
export {
  // ... existing exports ...
  setSessionModel,
  getSessionModel,
  updateSessionModel,
  clearSessionModel,
} from './state'
```

### Task 5: Clear Model on Session Delete
**File**: `local/oh-my-opencode/src/hooks/todo-continuation-enforcer/handler.ts`

In the `session.deleted` handler (line 86-91), add:
```typescript
if (event.type === "session.deleted") {
  const sessionInfo = props?.info as { id?: string } | undefined
  if (sessionInfo?.id) {
    clearContinuationMarker(ctx.directory, sessionInfo.id)
    clearSessionModel(sessionInfo.id)  // Add this
  }
}
```

## Verification Steps

1. Select a model via UI (Ctrl+P or Tab)
2. Start a task
3. Let auto-continuation trigger
4. Verify model persists (doesn't switch to default)
5. Check `sessionModelMap` contains the model

## Success Criteria
- [ ] Model persists across auto-continuation
- [ ] No more switching to default/fallback models
- [ ] Session state correctly stores and retrieves models
- [ ] Model cleared when session deleted

## Related Files
- `local/oh-my-opencode/src/features/claude-code-session-state/state.ts`
- `local/oh-my-opencode/src/features/claude-code-session-state/index.ts`
- `local/oh-my-opencode/src/hooks/todo-continuation-enforcer/idle-event.ts`
- `local/oh-my-opencode/src/hooks/todo-continuation-enforcer/resolve-message-info.ts`
- `local/oh-my-opencode/src/hooks/todo-continuation-enforcer/handler.ts`
