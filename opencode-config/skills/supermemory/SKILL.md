---
# REQUIRED FIELDS
name: supermemory
description: >
  Persistent memory retrieval and storage via the Supermemory MCP. Use when you need
  to save reusable project knowledge, recall prior decisions, or inspect long-lived
  preferences across sessions.

# OPTIONAL METADATA
version: 1.0.0
category: memory
tags: [memory, persistence, recall, project-knowledge, preferences]

# COMPOSITION METADATA
dependencies: []
synergies: ["writing-plans", "research-builder", "verification-before-completion", "task-orchestrator", "codebase-auditor"]
conflicts: []
recommended_agents: ["librarian", "oracle"]
compatible_agents: ["atlas", "sisyphus"]
auto_triggers:
  - context: "project-knowledge-recall-needed"
    description: "When user asks about previous decisions or known solutions"
    threshold: "high-confidence"
  - context: "complex-task-start"
    description: "At beginning of multi-step tasks for historical context"
    threshold: "medium-confidence"
  - context: "architecture-decision-point"
    description: "During architectural discussions or system design"
    threshold: "medium-confidence"
tool_affinities:
  supermemory: 0.9
  sequentialthinking: 0.4
  context7: 0.3
outputs:
  - type: artifact
    name: persisted-memory
    location: runtime
inputs:
  - type: user-input
    name: memory-query
    required: false
  - type: context
    name: project-knowledge
    required: false
---

# Supermemory

## Overview

Supermemory provides persistent memory across sessions. Use it to recall established
 project knowledge before repeating work, and to save durable findings like architecture
 decisions, preferences, or resolved failure patterns.

## When to Use

Use this skill when:
- You want to recall prior project decisions before implementing or debugging
- A discovery or fix should be saved for reuse across future sessions
- You need to inspect recent project memories or user preferences
- A task depends on long-lived context that is not reliably present in the current chat

Do NOT use this skill for:
- Ephemeral scratch notes that do not matter after the current session
- Secrets, credentials, tokens, or private keys
- Large raw logs or generated output dumps

## Inputs Required

- **Query** (optional): What memory to search for
- **Scope**: `project` for repo knowledge, `user` for cross-project preferences
- **Type** (for writes): `project-config`, `architecture`, `error-solution`, `preference`, `learned-pattern`, or `conversation`

## Workflow

### Phase 1: Search Existing Memory

1. Call `supermemory` with `mode: "search"`
2. Use `scope: "project"` by default for repo work
3. Review returned memories before doing duplicate research or re-documenting the same issue

### Phase 2: Inspect Broader Context

1. Call `supermemory` with `mode: "list"` to inspect recent memories when the right query is unclear
2. Call `supermemory` with `mode: "profile"` when user-level preferences may affect implementation choices

### Phase 3: Save Durable Knowledge

1. Call `supermemory` with `mode: "add"`
2. Store only concise, reusable knowledge
3. Pick the narrowest accurate `type` and scope

### Phase 4: Correct or Remove Bad Memory

1. If a memory is wrong or obsolete, call `supermemory` with `mode: "forget"`
2. Prefer updating with a replacement memory when the knowledge still matters

## Must Do

- Search before adding new memory when duplicate knowledge is likely
- Default to `project` scope for repository-specific decisions
- Store concise conclusions, not raw transcripts or logs
- Use structured memory types so later recall stays useful

## Must Not Do

- Do NOT store secrets, credentials, or sensitive tokens
- Do NOT save noisy one-off outputs that are not reusable
- Do NOT use `user` scope for repo-only implementation details
- Do NOT forget memories casually without being sure they are obsolete or wrong

## Handoff Protocol

### Receives From
- Main agent: Need for persistent context, recall, or durable knowledge capture
- `research-builder`: Findings that should survive beyond the current session
- `writing-plans`: Architectural or workflow decisions worth preserving

### Hands Off To
- Main agent: Recalled memory results for immediate task use
- Future sessions: Durable project or user knowledge

## Output Contract

1. **Search Results**: Relevant stored memories for the active task
2. **Persisted Memory**: Durable project or user knowledge saved for later recall
3. **Memory Hygiene**: Obsolete entries removed when needed

## Quick Start

```
1. supermemory { mode: "search", query: "context7 telemetry", scope: "project" }
2. supermemory { mode: "add", content: "Runtime hook records failed Context7 lookups", type: "learned-pattern", scope: "project" }
3. supermemory { mode: "list", scope: "project", limit: 10 }
```
