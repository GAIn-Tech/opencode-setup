# Learning Engine Integration Implementation Plan

## TL;DR

> **Summary**: Integrate LearningEngine into oh-my-opencode orchestration flow so every task gets pre-execution advice and post-execution learning.
>
> **Current State**: 
> - LearningEngine EXISTS in packages (1357 lines)
> - IntegrationLayer NOW HAS hooks (`getLearningAdvice()`, `learnFromOutcome()`)
> - But NEVER CALLED in actual orchestration flow
>
> **Deliverables**:
> 1. Add `getLearningAdvice()` call BEFORE task delegation
> 2. Add `learnFromOutcome()` call AFTER task completion
> 3. Show warnings when `should_pause === true`

---

## What's Done (This Session)

### Phase 1: Integration Layer Hooks ✅
Added to `packages/opencode-integration-layer/src/index.js`:
- LearningEngine import (fail-open)
- `getLearningAdvice(taskContext)` method - calls `engine.advise()`
- `learnFromOutcome(adviceId, outcome)` method - calls `engine.learnFromOutcome()`
- `isLearningAdviceEnabled()` check
- 5-minute advice caching

---

## What's Next (In oh-my-opencode)

### Phase 2: Wire into Orchestration ⚠️
**Location**: oh-my-opencode npm package (not in this repo)

The orchestration code that dispatches tasks needs to call the hooks:

```javascript
// PRE-TASK: Get advice before delegating
const advice = integrationLayer.getLearningAdvice({
  task_type: derivedFromUserPrompt(),
  description: userPrompt,
  files: inferredFiles,
  complexity: estimatedComplexity,
});

if (advice?.should_pause) {
  // Show warnings to user before proceeding
  for (const warning of advice.warnings) {
    console.warn(`[${warning.severity}] ${warning.type}: ${warning.description}`);
  }
  // Optionally require acknowledgment
}

// Use routing.skills from advice
const recommendedSkills = advice?.routing?.skills || [];
await task(category, { load_skills: recommendedSkills, ... });

// POST-TASK: Record outcome
integrationLayer.learnFromOutcome(advice?.advice_id, {
  success: taskSucceeded,
  failure_reason: errorMessage || null,
  tokens_used: totalTokensConsumed,
});
```

---

## Files to Modify

| Phase | File | Change |
|-------|------|--------|
| ✅ DONE | `packages/opencode-integration-layer/src/index.js` | Added hooks |
| ⚠️ TODO | oh-my-opencode orchestration | Add pre-task `getLearningAdvice()` |
| ⚠️ TODO | oh-my-opencode orchestration | Add post-task `learnFromOutcome()` |
| ⚠️ TODO | oh-my-opencode orchestration | Show warnings when `should_pause` |

---

## Success Criteria

- [x] IntegrationLayer has `getLearningAdvice()` method
- [x] IntegrationLayer has `learnFromOutcome()` method
- [ ] oh-my-opencode calls `getLearningAdvice()` before each task
- [ ] oh-my-opencode calls `learnFromOutcome()` after each task
- [ ] Warnings displayed when `should_pause === true`
- [ ] Tests pass

---

## Notes

### Why not in this repo?
The orchestration flow (where tasks are dispatched to agents) lives in the oh-my-opencode npm package, not in opencode-setup. This repo contains:
- packages/ - internal libraries
- opencode-config/ - configuration
- scripts/ - infrastructure
- local/ - gitignored development checkout

The actual task delegation logic is in the published npm package.

### Fallback
The hooks are fail-open - if LearningEngine unavailable, they return null/empty and orchestration continues normally.

---

## Effort

**Estimated**: Medium - requires modifying the oh-my-opencode npm package.
**Blocker**: Need local copy of oh-my-opencode source to modify.