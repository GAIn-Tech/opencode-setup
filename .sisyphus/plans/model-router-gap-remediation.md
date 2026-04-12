# Model Router Gap Remediation Plan

## TL;DR

> **Quick Summary**: Fix two critical gaps in model-router-x: integrate response validation and close learning feedback loop
> 
> **Deliverables**:
> - validateResponse() called in routing pipeline for early failure detection
> - learnFromOutcome() integration connecting routing outcomes to skill-RL
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: NO - sequential (validation first, then learning)
> **Critical Path**: Integrate validateResponse → Add learnFromOutcome

---

## Context

### Original Request
User requested systematic gap analysis of the OpenCode system. Two gaps identified:

1. **Response Validator Not Integrated**: `validateResponse()` exists but never called
2. **No Learning Feedback Loop**: Router doesn't learn from routing decisions

### Research Findings

**Finding 1 - Response Validator Gap**:
- File: `packages/opencode-model-router-x/src/response-validator.js` (163 lines)
- Validates for: NULL_RESPONSE, EMPTY_RESPONSE, RATE_LIMITED, MODEL_UNAVAILABLE, TRUNCATED, MALFORMED, TIMEOUT, AUTH_ERROR
- Exported at line 27 of index.js but grep shows 0 usages
- Impact: Failed model outputs aren't caught early → cascading failures

**Finding 2 - Learning Loop Gap**:
- Router has `recordOutcome()` for per-model tuning
- No `learnFromOutcome()` to feed routing decisions back to learning engine
- skillRLManager exists (line 848-876) but only used for skill selection, not model routing outcomes
- Impact: Routing mistakes repeated across sessions

---

## Work Objectives

### Core Objective
Fix two architectural gaps in model-router-x to enable early failure detection and continuous routing improvement

### Concrete Deliverables

1. **Response Validation Integration**
   - Call validateResponse() in routing output path
   - Integration point: after model receives response, before returning to caller
   - Should trigger fallback on validation failure

2. **Learning Feedback Loop**
   - Add learnFromOutcome() call connecting routing decisions
   - Capture: context + selected model + outcome (success/failure)
   - Feed to skillRLManager for routing pattern learning

### Definition of Done
- [ ] validateResponse called in routing pipeline
- [ ] learnFromOutcome integrated with skillRLManager
- [ ] Tests pass for both integrations

### Must Have
- validateResponse() in critical path
- Routing outcomes recorded for learning

### Must NOT Have
- Breaking changes to existing API
- Performance regression in model selection

---

## Execution Strategy

### Sequential Flow

```
Task 1 (Integration):
├── Validate response-validator.js API
├── Find integration point in routing pipeline
├── Add validateResponse() call
└── Handle validation failures (trigger fallback)

Task 2 (Learning Loop):
├── Define routing outcome schema
├── Add learnFromOutcome() call point
├── Connect to skillRLManager.learnFromOutcome()
└── Test learning integration
```

### Discovery: Router Architecture Correction

**CRITICAL**: model-router-x is a MODEL SELECTOR, not an executor. It picks models but never sees LLM responses. Integration points are DIFFERENT than initially planned.

**Correct Architecture**:
1. Router selects model → returns model selection
2. **Caller** (oh-my-opencode delegate-task) executes model → receives response
3. Caller validates response with validateResponse()
4. Router records outcome via learnFromOutcome() WITH CONTEXT from caller

**Task 1 Corrections** (validateResponse):
- NOT in model-router-x - in the EXECUTION LAYER (oh-my-opencode)
- Integration point: after LLM response received, before returning to user
- Must find: oh-my-opencode delegate-task execution file

**Task 2 Corrections** (learnFromOutcome):
- STILL in model-router-x - router has decision context
- But needs new method: recordRoutingDecision(context, selectedModel)
- Called by execution layer AFTER response validation
- Schema: { context, selectedModel, validationResult, latency }

---

## TODOs (Revised)

- [ ] 1. (COMPLETED) Execution layer found and cloned

  **Discovery**: Local oh-my-opencode cloned to `local/oh-my-opencode/` v3.16.0
  
  **Execution Chain** (local/oh-my-opencode/src/tools/delegate-task/):
  - sync-task.ts → sync-session-creator.ts → sync-prompt-sender.ts → sync-session-poller.ts → sync-result-fetcher.ts
  
  **Integration Point** (FOUND):
  - File: `sync-result-fetcher.ts` - receives final response
  - Add: validateResponse(response) before returning to caller
  - On validation failure: signal back for retry/fallback
  
  **Files to Modify**:
  - `local/oh-my-opencode/src/tools/delegate-task/sync-result-fetcher.ts`

- [ ] 2. Add routing outcome recording in both layers

  **What to do**:
  - Task 2A: In model-router-x: add recordRoutingDecision(context, modelId, outcome)
  - Task 2B: In oh-my-opencode: call recordRoutingDecision() via integration layer after validation
  - Stores context + model + validation result + latency for learning
  
  **Files to Modify**:
  - Task 2A: `packages/opencode-model-router-x/src/index.js` - add method
  - Task 2B: `local/oh-my-opencode/src/tools/delegate-task/sync-result-fetcher.ts` - call recordRoutingDecision()

---

## Execution Locations (Final)

| Task | File | Location |
|------|------|----------|
| 1 | sync-result-fetcher.ts | local/oh-my-opencode/src/tools/delegate-task/ |
| 2A | index.js | packages/opencode-model-router-x/src/ |
| 2B | sync-result-fetcher.ts | local/oh-my-opencode/src/tools/delegate-task/ |

---

## Commit Strategy

| After Task | Message | Files |
|-----------|--------|-------|
| 1 | fix(omo-delegate): integrate validateResponse for early failure detection | sync-result-fetcher.ts |
| 2 | feat(omo-delegate): add recordRoutingDecision for routing pattern learning | sync-result-fetcher.ts, index.js |

---

## Success Criteria

### Final Checklist
- [ ] validateResponse called in sync-result-fetcher.ts
- [ ] recordRoutingDecision integrated in both layers
- [ ] All tests pass