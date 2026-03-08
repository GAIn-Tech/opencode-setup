---
# REQUIRED FIELDS
name: context-governor
description: >
  Context window budget management via the context-governor MCP. Tracks token
  consumption per session and model, warns at 75%/80% thresholds, and provides
  budget status for routing decisions. Fail-open: never blocks work if unavailable.

# OPTIONAL METADATA
version: 1.0.0
category: optimization
tags: [context, budget, tokens, governor, thresholds]

# COMPOSITION METADATA
dependencies: []
synergies: ["budget-aware-router", "distill", "token-reporter"]
conflicts: []
outputs:
  - type: signal
    name: budget-status
    location: runtime
inputs:
  - type: context
    name: session-id
    required: true
  - type: context
    name: model-id
    required: true
---

# Context Governor

## Overview

The context-governor manages token budget tracking per session and model. It enforces
two thresholds (75% WARNING, 80% ERROR) and provides budget status to the model router
for cost-aware scoring. It operates fail-open: if the governor is unavailable, all
operations return safe defaults that allow work to continue.

## When to Use

Use this skill when:
- You need to check remaining token budget before a large operation
- The model router needs budget status for cost-aware model selection
- You want to record token consumption after a model call
- Context usage is approaching budget limits and you need status visibility

Do NOT use this skill for:
- Actively compressing context (use `distill` instead)
- Changing budget thresholds (75%/80% are fixed by design)
- Blocking operations based on budget (governor is advisory, not blocking)

## Inputs Required

- **Session ID**: Current session identifier
- **Model ID**: Model being used (determines budget limit from budgets.json)
- **Proposed Tokens** (optional): Token count for pre-check operations

## Workflow

### Phase 1: Check Budget Before Operation

1. Call `checkContextBudget(sessionId, modelId, proposedTokens)` via IntegrationLayer
2. Response includes: `{ allowed, status, remaining, message }`
3. If `status === 'warn'` (75-80%): Consider using a cheaper model or compressing context
4. If `status === 'error'` (>80%): Strongly consider compression or model downgrade

### Phase 2: Record Token Usage After Operation

1. After a model call completes, call `recordTokenUsage(sessionId, modelId, tokensUsed)`
2. Response includes updated: `{ used, remaining, pct, status }`
3. Log any threshold crossings for observability

### Phase 3: Query Current Status

1. Call `getContextBudgetStatus(sessionId, modelId)` for current snapshot
2. Returns: `{ remaining, used, max, pct, status }`
3. Feed into dashboard widgets or routing decisions

## Must Do

- Always pass the correct session ID and model ID
- Record token usage after every model call for accurate tracking
- React to 'warn' status by considering cheaper alternatives
- Let the model router use budget status for scoring (T4 budget penalty)

## Must Not Do

- Do NOT change the 75%/80% thresholds (they are correct by design)
- Do NOT make the governor a hard dependency that crashes on absence
- Do NOT auto-prune context without user visibility (always log before pruning)
- Do NOT block operations based on budget alone (fail-open always)

## Handoff Protocol

### Receives From
- Model router: Session and model context for budget checks
- Main agent: Token counts after model calls

### Hands Off To
- `budget-aware-router`: Budget status for model scoring penalty
- `distill`: Signal to compress when approaching thresholds
- `token-reporter`: Budget data for dashboard tracking

## Output Contract

1. **Budget Check**: `{ allowed, status, remaining, urgency, message }`
2. **Token Recording**: `{ used, remaining, pct, status }` or null
3. **Budget Status**: `{ remaining, used, max, pct, status }` or null

## Budget Limits (from budgets.json)

| Model | Budget | 75% Warn | 80% Error |
|-------|--------|----------|-----------|
| Claude Opus | 180K | 135K | 144K |
| Claude Sonnet | 200K | 150K | 160K |
| Claude Haiku | 90K | 67.5K | 72K |
| GPT-5 | 400K | 300K | 320K |
| Gemini | 1M | 750K | 800K |

## Quick Reference

```
1. checkContextBudget(sid, mid, tokens)  -> pre-check before operation
2. recordTokenUsage(sid, mid, count)     -> record after model call
3. getContextBudgetStatus(sid, mid)      -> query current snapshot
```
