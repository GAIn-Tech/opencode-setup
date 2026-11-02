---
# REQUIRED FIELDS
name: dcp
description: >
  Dynamic Context Pruning — prunes irrelevant context segments to reduce token usage.
  Works alongside distill for complementary compression strategies.

# OPTIONAL METADATA
version: 1.0.0
category: optimization

# COMPOSITION METADATA
dependencies: []
synergies: ["distill", "context-governor", "budget-aware-router"]
conflicts: []
outputs:
  - type: action
    name: context-pruning
    location: runtime
inputs:
  - type: signal
    name: budget-advisory
    required: false
  - type: context
    name: conversation-context
    required: true
---

# Dynamic Context Pruning (DCP)

## Overview

DCP is a plugin-based context optimization skill that reduces token consumption by pruning conversation segments that are no longer relevant to the active task. Unlike distill (which compresses code via AST analysis), DCP operates on conversational context — removing stale tool outputs, completed task discussions, and resolved debugging traces.

## When to Use

Use DCP when:
- Context budget reaches **65%+** (ContextBridge returns `action: 'compress'`)
- Long conversation with many completed sub-tasks
- Before dispatching subagents (to give them lean context)
- Tool outputs from previous steps are no longer needed
- Multiple debugging iterations have been resolved

Do NOT use DCP when:
- Context budget is healthy (< 65%)
- Active debugging trace is still needed
- User explicitly referenced earlier context
- Short conversation with few turns

## How DCP Works

1. **Relevance Scoring**: Each context segment gets a relevance score (0-1) based on:
   - Recency: newer segments score higher
   - Task alignment: segments matching current task keywords score higher
   - Reference count: segments referenced by later messages score higher
   - Tool output decay: tool results decay faster than user messages

2. **Pruning Decision**: Segments below the relevance threshold are marked for pruning
   - Default threshold: 0.3 (configurable)
   - Never prunes: user's original request, current task context, active errors

3. **Token Reclamation**: Pruned segments are replaced with brief summaries
   - Preserves key decisions and outcomes
   - Maintains conversation coherence

## Integration with Context Management Stack

```
┌─────────────────────────────────────────────┐
│  Context Governor (budget tracking)         │
│    └── ContextBridge (advisory signals)     │
│          ├── DCP (conversational pruning)   │
│          └── Distill (AST code compression) │
└─────────────────────────────────────────────┘
```

### Signal Flow

1. Governor tracks token usage per session/model
2. ContextBridge evaluates budget % and returns advisory:
   - `action: 'none'` → no pruning needed
   - `action: 'compress'` → DCP prunes low-relevance segments
   - `action: 'compress_urgent'` → DCP aggressively prunes + distill compresses code
3. DCP and distill are complementary — DCP handles conversation, distill handles code

## Configuration

DCP is enabled as a plugin in `opencode.json`:

```json
{
  "plugin": ["@tarquinen/opencode-dcp@latest"]
}
```

## Must Do

- Always log what was pruned and why (user visibility before pruning)
- Preserve the user's original request and current task context
- Work alongside distill — don't duplicate code compression
- Respect the `compress_urgent` vs `compress` distinction from ContextBridge

## Must NOT Do

- Auto-prune without logging (violates Wave 11 constraint)
- Prune segments the user explicitly referenced in recent messages
- Remove active error traces or debugging context
- Replace distill for code compression — DCP is for conversation only
