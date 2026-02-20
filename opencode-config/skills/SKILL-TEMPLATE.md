---
# REQUIRED FIELDS
name: skill-name-here
description: >
  One-line description for skill discovery and auto-recommendation.
  Should answer: "Use this skill when..."

# OPTIONAL METADATA (for composition system)
version: 1.0.0
category: planning | debugging | testing | implementation | review | research | browser | git
tags: [tag1, tag2]

# COMPOSITION METADATA
dependencies: []          # Skills that MUST be loaded before this one
synergies: []             # Skills that work well together (recommendations)
conflicts: []             # Skills that should NOT be combined
outputs:                  # What this skill produces
  - type: artifact        # artifact | decision | code | report
    name: plan.md
    location: .sisyphus/plans/
inputs:                   # What this skill expects
  - type: context         # context | artifact | user-input
    name: scope-boundary
    required: true
---

This document follows the opencode-setup Documentation Style Guide (docs/documentation-style-guide.md). Use consistent heading levels, code block syntax highlighting, and visual hierarchy principles.

# Skill Name

## Overview

Brief description of what this skill does and its core philosophy.
Maximum 3-4 sentences.

## When to Use

Use this skill when:
- Trigger phrase 1
- Trigger phrase 2
- Trigger phrase 3

Do NOT use this skill for:
- Anti-pattern 1
- Anti-pattern 2

## Inputs Required

List specific inputs the skill needs to operate:

- **Input 1**: Description and how to obtain
- **Input 2**: Description and how to obtain

## Workflow

### Phase 1: [Phase Name]

1. Step 1
2. Step 2
3. Step 3

### Phase 2: [Phase Name]

1. Step 1
2. Step 2
3. Step 3

## Must Do

- Mandatory behavior 1
- Mandatory behavior 2
- Mandatory behavior 3

## Must Not Do

- Forbidden behavior 1
- Forbidden behavior 2
- Forbidden behavior 3

## Handoff Protocol

### Receives From
- `skill-name`: What input this skill accepts

### Hands Off To
- `skill-name`: What output this skill provides

## Output Contract

Describe exact deliverables:

1. **Deliverable 1**: Description
2. **Deliverable 2**: Description

## Quick Start

1. Step 1
2. Step 2
3. Step 3

---

## Directory Structure

```
opencode-config/skills/skill-name/
├── SKILL.md           # This file (required)
├── references/        # Supporting docs (optional)
│   └── examples.md
└── scripts/           # Helper scripts (optional)
    └── validate.mjs
```
