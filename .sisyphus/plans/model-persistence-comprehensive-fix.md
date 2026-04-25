# Comprehensive Model Persistence Fix

## TL;DR

**Problem**: Model is still switching to default "oh-my-opencode" in new shells/sessions. Multiple vectors found beyond the hook fix.

**Critical Vectors Identified**:
1. **rate-limit-fallback.ts**: Directly assigns fallback models to sessions when rate limits hit
2. **model-resolution-pipeline.ts**: May resolve to default model during failures
3. **Session initialization**: May set default model on new sessions
4. **Model validation failures**: May fall back to default

**Solution**: Comprehensive audit and fix of ALL model assignment/switching paths

**Estimated Effort**: Medium (3-4 hours)
**Parallel Execution**: NO - Sequential, high coordination needed

---

## Context

### Original Request
Fix issue where selected main session model resets to default oh-my-opencode model. The hook fix (Task 1) was insufficient - model still switches in new shells/sessions.

### Critical Finding: Rate-Limit-Fallback Plugin
**File**: `opencode-cli-v2/src/adapters/plugins/rate-limit-fallback.ts`

**Problem Code** (lines 250-280):
```typescript
// When rate limit is hit
const nextModel = await getNextAvailableModel(sessionID, currentModel);
sessionAssignments.set(sessionID, nextModel); // <-- DIRECT MODEL SWITCHING
```

**Impact**: When ANY model hits rate limit, session is automatically switched to fallback model. This completely bypasses user selection.

### Other Potential Vectors
1. **model-resolution-pipeline.ts**: May resolve to default on failures
2. **Session initialization**: New sessions may get default model
3. **Model validation**: Invalid models may fall back to default

---

## Work Objectives

### Core Objective
Audit and fix ALL paths that can cause model switching or fallback to default "oh-my-opencode" model.

### Concrete Deliverables
1. Fixed rate-limit-fallback.ts to NOT switch session models
2. Audit model-resolution-pipeline.ts for fallback behavior
3. Audit session initialization for default model assignment
4. Audit all model validation for fallback behavior
5. Comprehensive test coverage
6. All tests passing

### Definition of Done
- [ ] Rate-limit-fallback.ts no longer assigns models to sessions
- [ ] No automatic model switching on rate limits
- [ ] No automatic model switching on failures
- [ ] No automatic model switching on session init
- [ ] User-selected model persists across all scenarios
- [ ] All tests pass

---

## Execution Strategy

### Sequential Execution (No Parallelization)
```
Task 1 (Audit rate-limit-fallback.ts)
    ↓
Task 2 (Fix rate-limit-fallback.ts)
    ↓
Task 3 (Audit model-resolution-pipeline.ts)
    ↓
Task 4 (Fix model-resolution-pipeline.ts if needed)
    ↓
Task 5 (Audit session initialization)
    ↓
Task 6 (Fix session initialization if needed)
    ↓
Task 7 (Run full test suite)
```

---

## TODOs

- [ ] 1. Audit rate-limit-fallback.ts for model switching vectors

**What to do**:
- Read `opencode-cli-v2/src/adapters/plugins/rate-limit-fallback.ts` completely
- Identify all places where session model is assigned/switched
- Document the `sessionAssignments` Map usage
- Identify the `onRateLimit` handler logic
- Identify any other model switching paths

**Must NOT do**:
- Don't make any changes yet (audit only)
- Don't skip any code paths

**Acceptance Criteria**:
- [ ] Complete audit of rate-limit-fallback.ts
- [ ] Document all model switching vectors found
- [ ] Identify specific lines where model assignment happens

---

- [ ] 2. Fix rate-limit-fallback.ts to prevent model switching

**What to do**:
- Modify rate-limit-fallback.ts to NOT assign models to sessions
- The plugin should track rate limits but NOT switch models
- Remove or disable `sessionAssignments.set(sessionID, nextModel)`
- Ensure rate limit tracking still works
- Ensure fallback models are still tracked but not auto-assigned

**Must NOT do**:
- Don't break rate limit tracking functionality
- Don't remove the plugin entirely
- Don't change the plugin interface

**Acceptance Criteria**:
- [ ] `sessionAssignments.set(sessionID, model)` removed or disabled
- [ ] Rate limit tracking still functional
- [ ] No automatic model switching on rate limits
- [ ] TypeScript compiles without errors

---

- [ ] 3. Audit model-resolution-pipeline.ts for fallback behavior

**What to do**:
- Read `local/oh-my-opencode/src/shared/model-resolution-pipeline.ts`
- Identify fallback behavior when model resolution fails
- Check if it defaults to "oh-my-opencode" on failures
- Document any automatic model switching

**Acceptance Criteria**:
- [ ] Complete audit of model-resolution-pipeline.ts
- [ ] Document fallback behavior
- [ ] Identify if it causes model switching

---

- [ ] 4. Fix model-resolution-pipeline.ts if needed

**What to do**:
- If pipeline has fallback to default model, fix it
- Ensure pipeline respects user-selected model
- Ensure failures don't cause model switching

**Acceptance Criteria**:
- [ ] No automatic fallback to default model
- [ ] User-selected model preserved on failures
- [ ] TypeScript compiles without errors

---

- [ ] 5. Audit session initialization

**What to do**:
- Find where new sessions are initialized
- Check if default model is assigned on session creation
- Identify session creation code paths
- Document any automatic model assignment

**Acceptance Criteria**:
- [ ] Identify session initialization code
- [ ] Document default model assignment
- [ ] Identify all session creation paths

---

- [ ] 6. Fix session initialization if needed

**What to do**:
- If sessions get default model on creation, fix it
- Ensure sessions start without model (user must select)
- Or ensure sessions inherit model from context

**Acceptance Criteria**:
- [ ] No automatic default model assignment
- [ ] Sessions respect user selection
- [ ] TypeScript compiles without errors

---

- [ ] 7. Run full test suite

**What to do**:
- Run complete test suite
- Verify no regressions
- Verify model persistence tests pass

**Acceptance Criteria**:
- [ ] All tests pass OR unrelated failures documented
- [ ] Model persistence tests pass
- [ ] No new test failures introduced

---

## Success Criteria

### Verification Commands
```bash
# Type check
cd local/oh-my-opencode && bun run typecheck
cd opencode-cli-v2 && bun run typecheck

# Tests
bun test
```

### Final Checklist
- [ ] rate-limit-fallback.ts no longer assigns models to sessions
- [ ] No automatic model switching on rate limits
- [ ] No automatic model switching on failures
- [ ] No automatic model switching on session init
- [ ] User-selected model persists across all scenarios
- [ ] All tests pass
