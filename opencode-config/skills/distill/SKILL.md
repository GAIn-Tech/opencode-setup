---
# REQUIRED FIELDS
name: distill
description: >
  AST-aware context compression via the distill MCP. Use when context is filling up,
  before long subagent tasks, or after reading large files/logs to reclaim 50-70% of
  token budget without losing meaning.

# OPTIONAL METADATA
version: 1.0.0
category: optimization
tags: [context, compression, tokens, budget, distill]

# COMPOSITION METADATA
dependencies: []
synergies: ["budget-aware-router", "token-reporter", "dispatching-parallel-agents"]
conflicts: []
outputs:
  - type: decision
    name: compressed-context
    location: runtime
inputs:
  - type: context
    name: current-context-usage
    required: true
---

# Distill

## Overview

Distill is an AST-aware context compression MCP that reduces token usage by 50–70%
without losing semantic meaning. It runs lazily (first call in a session takes ~2–3s
to spin up). Use it proactively whenever context is getting full or before spawning
large parallel subagent tasks.

## When to Use

Use this skill when:
- Context usage is approaching **65% or more** of the model's context limit
- About to dispatch a long multi-file subagent task (pre-compress to give the agent headroom)
- After reading large log files, test outputs, or large diffs that are now processed
- After a long multi-turn debugging session where early turns are no longer needed
- Feeling sluggish responses or seeing context-window warnings

Do NOT use this skill for:
- Active short sessions where context is <50% full
- When the full conversation history is actively needed for the current task
- Compressing context that contains uncommitted work-in-progress notes needed immediately

## Inputs Required

- **Context usage level**: Visible from model UI or estimated from session length
- **Compression target**: Usually `"context"` (full conversation); can be narrowed

## Workflow

### Phase 1: Check Context Level

1. Estimate or observe current context usage (token count or % of limit)
2. If usage is ≥65%, proceed to compression
3. If about to dispatch a large parallel subagent task, proceed regardless of current level

### Phase 2: Discover Available Pipelines

1. Call `mcp_distill_browse_tools` with no category argument — returns available compression pipelines
2. Identify the `compress` pipeline (or `logs` for log-heavy contexts, `code` for code-heavy)
3. Note: response lists categories and tool names

### Phase 3: Compress

1. Call `mcp_distill_run_tool`:
   ```json
   { "name": "compress", "args": { "target": "context" } }
   ```
2. **Cold-start**: If this is the first distill call this session, expect ~2–3s delay. This is normal — distill starts with `--lazy`.
3. Confirm compression completed and note token savings reported

### Phase 4: Resume Work

1. Continue the task with the now-compressed context
2. If using `budget-aware-router`, update budget state with new token count

## Must Do

- Call `mcp_distill_browse_tools` FIRST to confirm available pipelines before running
- Use at ≥65% context usage proactively — don't wait until the model errors
- Pre-compress before dispatching large parallel subagent tasks
- Accept the 2–3s cold-start delay on first call as normal

## Must Not Do

- Don't skip `browse_tools` and hardcode pipeline names — pipelines can change
- Don't compress when context is <50% full (unnecessary overhead)
- Don't compress in the middle of an active tool call chain that needs full history
- Don't call compress multiple times in rapid succession (once per 20–30% context growth is enough)

## Handoff Protocol

### Receives From
- `budget-aware-router`: Token budget threshold signal
- Main agent: Observation that context is getting full

### Hands Off To
- Main agent: Compressed context, ready to continue
- `token-reporter`: Post-compression token count for usage tracking

## Output Contract

1. **Compressed Context**: Conversation trimmed to essential semantic content
2. **Token Savings**: Reported by distill (typically 50–70% reduction)
3. **Session Continuity**: No loss of active task state or working memory

## Quick Start

```
1. mcp_distill_browse_tools          → see available pipelines
2. mcp_distill_run_tool              → {"name": "compress", "args": {"target": "context"}}
3. Wait 2-3s if first call           → normal cold-start
4. Continue working with reclaimed context budget
```

## Pipeline Reference

| Pipeline | Best For | Notes |
|----------|----------|-------|
| `compress` | General conversation history | Default choice |
| `logs` | Log-heavy contexts | Strips repetitive log lines |
| `code` | Code-review or diff-heavy sessions | Preserves code structure |
| `analyze` | Pre-analysis before compression | Dry-run to see what would be removed |
