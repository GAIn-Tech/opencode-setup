# OpenCode Learning Engine Integration Plan

## TL;DR

> **Summary**: Integrate LearningEngine into orchestration flow so it provides advice BEFORE each task execution.
>
> **Problem**: LearningEngine exists (1357 lines) but is NEVER called in production - only in tests.
>
> **Solution**: Add `advise()` call into task delegation pipeline.

---

## Current State

### What LearningEngine Provides
- `engine.advise(taskContext)` → returns warnings, suggestions, routing (agent/skills)
- `should_pause` flag when risk_score > 15
- Anti-pattern detection (STRONG warnings)
- Positive pattern suggestions (SOFT)

### Where It Should Integrate
The orchestration flow in oh-my-opencode needs to call `advise()` BEFORE delegating a task:

```
User Task → Orchestration → learningEngine.advise() → [should_pause? warnings?] → Delegate to Agent
```

---

## Integration Points

### 1. Pre-Task Advice (HIGH PRIORITY)
Add to task delegation in oh-my-opencode:
```javascript
const { LearningEngine } = require('opencode-learning-engine');
const engine = new LearningEngine();

// Before each task
const advice = engine.advise({
  task_type: derivedFromPrompt,
  description: userPrompt,
  files: inferredFiles,
  complexity: estimatedComplexity,
});

if (advice.should_pause) {
  // Show warnings to user, require acknowledgment
}
```

### 2. Post-Task Learning (MEDIUM)
After task completes:
```javascript
engine.learnFromOutcome(advice.advice_id, {
  success: taskSucceeded,
  failure_reason: error || null,
  tokens_used: totalTokens,
});
```

### 3. Skill Routing Enhancement (MEDIUM)
Use `advice.routing.skills` when delegating:
```javascript
const skills = advice.routing.skills || [];
task(category, { load_skills: skills, ... });
```

---

## Files to Modify

| Priority | File | Change |
|----------|------|--------|
| HIGH | oh-my-opencode orchestration | Add pre-task advise() call |
| MEDIUM | Task delegation | Pass skills from advice.routing |
| MEDIUM | Task completion | Call learnFromOutcome() |

---

## Success Criteria

- [ ] LearningEngine instantiated in orchestration
- [ ] advise() called before task delegation
- [ ] warnings displayed to user when should_pause=true
- [ ] learnFromOutcome() called after task completion
- [ ] Tests pass

---

## Effort

**Estimated**: Medium - requires understanding oh-my-opencode orchestration flow.
