---
# REQUIRED FIELDS
name: github-triage
description: >
  Parallel GitHub issue and PR triage using background tasks. Use when you need
  to categorize, label, prioritize, or respond to multiple GitHub issues or PRs
  at once — dispatches one background agent per item for maximum throughput.

# OPTIONAL METADATA
version: 1.0.0
category: review
tags: [github, issues, pr, triage, parallel]

# COMPOSITION METADATA
dependencies: []
synergies: ["requesting-code-review", "receiving-code-review", "dispatching-parallel-agents"]
conflicts: []
outputs:
  - type: report
    name: triage-summary
    location: runtime
inputs:
  - type: user-input
    name: repository
    required: true
  - type: user-input
    name: triage-scope
    required: true
---

# GitHub Triage

## Overview

Batch-triages GitHub issues and pull requests using parallel background agents —
one agent per item. Handles labeling, prioritization, response drafting, and
stale-item cleanup efficiently without blocking on each item sequentially.

## When to Use

Use this skill when:
- Reviewing a backlog of open GitHub issues (5+ items)
- Processing PR review queue in parallel
- Cleaning up stale issues or PRs across a repository
- Categorizing and labeling issues by type/severity
- Drafting initial responses to multiple new issues

Do NOT use this skill for:
- Single issue or PR review (use `requesting-code-review` instead)
- Deep code review requiring full context (use the review workflow)
- Repositories you don't have write access to (labeling requires write)

## Inputs Required

- **Repository**: `owner/repo` format (e.g., `GAIn-Tech/opencode-setup`)
- **Triage Scope**: What to triage — `issues`, `prs`, `stale`, or `all`
- **Filter** (optional): Label, milestone, or assignee to narrow scope

## Workflow

### Phase 1: Enumerate Items

1. Use `gh issue list` or `gh pr list` to get open items:
   ```bash
   gh issue list --repo owner/repo --state open --json number,title,labels,createdAt
   gh pr list --repo owner/repo --state open --json number,title,labels,createdAt,draft
   ```
2. Filter to items needing triage (no labels, or explicitly unlabeled)
3. Create a manifest of items to process

### Phase 2: Parallel Dispatch

1. For each item, spawn a background `task()` agent:
   ```
   task(category="quick", run_in_background=true, prompt="
     Triage GitHub issue #N in owner/repo:
     - Assign appropriate labels (bug/feature/docs/question)
     - Assess priority (critical/high/medium/low)
     - Draft a brief acknowledgment comment if unanswered for >3 days
     - Identify if duplicate or can be closed as wontfix
   ")
   ```
2. All agents run in parallel — collect task_ids
3. Continue to next phase while agents work

### Phase 3: Collect and Apply

1. Gather results from all background agents via `background_output(task_id=...)`
2. Apply labels and comments via `gh issue edit` / `gh issue comment`
3. Close any confirmed duplicates or wontfix items
4. Generate triage summary report

### Phase 4: Stale Item Cleanup (if scope includes stale)

1. Find issues/PRs with no activity in >30 days:
   ```bash
   gh issue list --repo owner/repo --state open --json number,title,updatedAt | jq '[.[] | select(.updatedAt < (now - 2592000 | todate))]'
   ```
2. Add `stale` label and comment requesting status update
3. Close items with no response after warning period

## Must Do

- Dispatch one background agent per item — never process items sequentially
- Collect all background_output results before applying changes
- Use `gh` CLI for all GitHub operations
- Cancel all background tasks when done: `background_cancel(all=true)`

## Must Not Do

- Don't close issues without clear justification
- Don't apply labels without reading issue/PR content
- Don't process more than 50 items in a single triage run (split into batches)
- Don't use GraphQL directly when `gh` CLI covers the use case

## Handoff Protocol

### Receives From
- User: Repository name + scope of triage
- `dispatching-parallel-agents`: Coordination pattern for batch dispatch

### Hands Off To
- `requesting-code-review`: Items identified as ready for full review
- User: Triage summary report with actions taken

## Output Contract

1. **Triage Summary**: Count of issues/PRs processed, labeled, closed, commented
2. **Label Report**: Which labels were applied to which items
3. **Action Log**: List of `gh` commands executed (for auditability)

## Quick Start

```bash
# List items needing triage
gh issue list --repo owner/repo --label "" --state open

# Triage a single item (for testing)
gh issue edit 42 --repo owner/repo --add-label "bug"

# Check current labels available
gh label list --repo owner/repo
```
