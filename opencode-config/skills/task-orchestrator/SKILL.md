---
# REQUIRED FIELDS
name: task-orchestrator
description: >
  Dynamic workflow selection across skills, tools, MCP servers, and subagents for
  multi-step or ambiguous requests. Use when the right execution shape is not obvious.

# OPTIONAL METADATA
version: 1.0.0
category: meta
tags: [orchestration, workflow, routing, planning, execution]

# COMPOSITION METADATA
dependencies: []
synergies: ["brainstorming", "writing-plans", "executing-plans", "dispatching-parallel-agents"]
conflicts: []
outputs:
  - type: decision
    name: execution-strategy
    location: runtime
inputs:
  - type: context
    name: task-request
    required: true
---

# Task Orchestrator

## Overview

Task Orchestrator is the meta-skill for choosing how to approach complex work when the
correct combination of tools, skills, and subagents is not immediately obvious. It is
for workflow selection, not direct implementation.

## When to Use

Use this skill when:
- The request spans research, planning, implementation, and verification
- The task is multi-step or cross-cutting and needs orchestration instead of a single skill
- The right mix of tools, MCPs, or subagents is unclear
- You need to decompose a large task into phases before execution

Do NOT use this skill for:
- A single obvious file edit
- A task with an already specified workflow
- Narrow requests where a clear domain skill already applies directly

## Workflow

### Phase 1: Classify the task

1. Determine whether the request is exploratory, planning-heavy, implementation-heavy, or verification-heavy
2. Identify which skills are direct matches and which are supporting skills

### Phase 2: Choose execution shape

1. If the task is ambiguous, start with `brainstorming`
2. If the task is multi-step, hand off to `writing-plans`
3. If a written plan exists, hand off to `executing-plans` or `subagent-driven-development`
4. If independent workstreams exist, include `dispatching-parallel-agents`

### Phase 3: Verify completion path

1. Ensure the selected workflow ends with `verification-before-completion`
2. Prefer explicit review and verification checkpoints for long tasks

## Must Do

- Pick the smallest workflow that safely handles the task
- Prefer planning before implementation for complex or ambiguous work
- End orchestration with an explicit verification step

## Must Not Do

- Do NOT replace direct domain skills when the task is already obvious
- Do NOT over-orchestrate trivial tasks
- Do NOT treat orchestration as implementation by itself

## Quick Start

```
1. classify request shape
2. choose primary workflow skill (brainstorming / writing-plans / executing-plans)
3. add supporting skills and review gates
4. execute with explicit checkpoints
```
