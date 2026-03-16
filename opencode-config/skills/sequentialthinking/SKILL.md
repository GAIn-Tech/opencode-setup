---
# REQUIRED FIELDS
name: sequentialthinking
description: >
  Structured step-by-step reasoning via the Sequential Thinking MCP. Use when a task
  needs explicit decomposition, branching analysis, or iterative hypothesis testing.

# OPTIONAL METADATA
version: 1.0.0
category: reasoning
tags: [reasoning, decomposition, analysis, planning, hypotheses]

# COMPOSITION METADATA
dependencies: []
synergies: ["systematic-debugging", "writing-plans", "research-builder", "task-orchestrator", "incident-commander"]
conflicts: []
recommended_agents: ["oracle", "metis"]
compatible_agents: ["atlas", "prometheus"]
auto_triggers:
  - context: "complex-debugging-needed"
    description: "When debugging complex failures with multiple potential causes"
    threshold: "high-confidence"
  - context: "architecture-tradeoff-analysis"
    description: "During architectural decisions requiring explicit tradeoff analysis"
    threshold: "medium-confidence"
  - context: "multi-hypothesis-testing"
    description: "When testing multiple competing hypotheses systematically"
    threshold: "medium-confidence"
tool_affinities:
  sequentialthinking: 0.95
  supermemory: 0.5
  grep: 0.4
  websearch: 0.3
outputs:
  - type: decision
    name: reasoning-trace
    location: runtime
inputs:
  - type: context
    name: problem-statement
    required: true
---

# Sequential Thinking

## Overview

Sequential Thinking is for explicit multi-step reasoning with branches, revisions, and
 verification loops. Use it when a problem is hard enough that hidden chain-of-thought
 is not sufficient and the reasoning process itself needs structure.

## When to Use

Use this skill when:
- The task needs careful decomposition across multiple competing explanations
- You are debugging a difficult issue with branching hypotheses
- A design decision has several tradeoffs that need explicit comparison
- You need a traceable reasoning sequence before proposing a fix or plan

Do NOT use this skill for:
- Trivial one-step questions
- Direct file edits with obvious implementation
- Situations where existing repo patterns already determine the answer

## Workflow

1. Call `sequentialthinking_sequentialthinking` with the current reasoning step
2. Start with a small estimate for `totalThoughts`
3. Expand, revise, or branch only when the problem demands it
4. Stop when the reasoning is sufficient to make a concrete decision or plan

## Must Do

- Keep each thought focused on one analytical step
- Revise earlier thoughts explicitly when the hypothesis changes
- Use it for genuinely non-trivial reasoning, not ceremony

## Must Not Do

- Do NOT dump vague filler thoughts
- Do NOT use it for simple file lookups or obvious edits
- Do NOT keep extending thoughts once a clear answer exists

## Quick Start

```
sequentialthinking_sequentialthinking {
  thought: "Break the failure into producer, persistence, and consumer paths",
  thoughtNumber: 1,
  totalThoughts: 4,
  nextThoughtNeeded: true
}
```
