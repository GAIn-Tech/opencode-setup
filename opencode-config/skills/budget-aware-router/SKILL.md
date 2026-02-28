---
# REQUIRED FIELDS
name: budget-aware-router
description: >
  Token and cost-aware model routing. Optimizes cost/performance tradeoffs by selecting appropriate models.

# OPTIONAL METADATA
version: 1.0.0
category: optimization

# COMPOSITION METADATA
dependencies: []
synergies: ["skill-orchestrator-runtime", "dynamic-model-selection"]
conflicts: []
outputs:
  - type: decision
    name: model-selection
    location: runtime
  - type: metrics
    name: cost-savings
    location: session
inputs:
  - type: context
    name: task-requirements
    required: true
  - type: context
    name: available-models
    required: true
---

# Budget-Aware Router

## Overview

A meta-skill that routes tasks to appropriate models based on cost, performance, and task requirements. Maintains budget tracking across sessions and optimizes token usage.

## When to Use

Use this skill when:
- Need to optimize cost/performance tradeoff
- Working with multiple model providers
- Have budget constraints to consider
- Want to use cheaper models for simple tasks

Do NOT use this skill for:
- Tasks requiring specific model capabilities
- When user explicitly specifies model
- Very complex reasoning requiring best model

## Inputs Required

- **Task Requirements**: Complexity, reasoning needs, code generation, etc.
- **Available Models**: List of models with pricing

## Workflow

### Phase 1: Task Analysis

1. Analyze task for complexity signals:
   - Code complexity (file count, dependencies)
   - Reasoning depth (debugging vs. simple edits)
   - Quality requirements (production vs. draft)
2. Map to required capabilities

### Phase 2: Model Selection

1. Filter models by capability requirements
2. Score remaining models by:
   - Capability match (weight: 0.4)
   - Cost efficiency (weight: 0.3)
   - Latency (weight: 0.3)
3. Select optimal model

### Phase 3: Budget Tracking

1. Query session token usage
2. Check remaining budget
3. Adjust selection if near limit

### Phase 3a: Context Compression via Distill

When context usage is approaching ~65% of the model's limit, OR before dispatching
a long multi-file subagent task:

1. Call `mcp_distill_browse_tools` — lists available compression pipelines
2. Select the `compress` pipeline (or appropriate variant from the response)
3. Call `mcp_distill_run_tool` → `{"name": "compress", "args": {"target": "context"}}`
4. **Cold-start note**: Distill runs `--lazy` — the first call in a session takes ~2–3s to start. This is normal.

### Phase 4: Execution Monitoring

1. Track actual token usage
2. Compare to estimate
3. Update budget state
4. Report savings

## Must Do

- Consider task complexity when selecting
- Track token usage across session
- Provide cost estimates before execution
- Alert when approaching budget limits

## Must Not Do

- Use expensive models for simple tasks
- Ignore capability requirements
- Exceed budget without warning
- Skimp on quality for critical tasks

## Handoff Protocol

### Receives From
- skill-orchestrator-runtime: Task context
- User: Explicit budget constraints

### Hands Off To
- Selected model provider: Task execution
- verification-before-completion: Usage tracking (via output metrics)

## Output Contract

1. **Selected Model**: Recommended model with justification
2. **Cost Estimate**: Expected token usage and cost
3. **Budget State**: Remaining budget after execution
4. **Savings Report**: Comparison to non-optimized routing

## Quick Start

1. Analyze task requirements
2. Filter available models
3. Score and rank by cost/performance
4. Select optimal model
5. Track execution cost
