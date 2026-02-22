---
# REQUIRED FIELDS
name: incident-commander
description: >
  Multi-turn incident triage and debugging orchestration. Manages complex issues through structured diagnosis.

# OPTIONAL METADATA
version: 1.0.0
category: debugging

# COMPOSITION METADATA
dependencies: ["systematic-debugging"]
synergies: ["systematic-debugging", "test-driven-development", "receiving-code-review"]
conflicts: []
outputs:
  - type: artifact
    name: incident-report
    location: session
  - type: decision
    name: root-cause
    location: session
inputs:
  - type: context
    name: error-context
    required: true
  - type: context
    name: affected-systems
    required: false
---

# Incident Commander

## Overview

A structured multi-turn debugging skill that orchestrates incident response. Maintains incident state, tracks investigation progress, and coordinates between different diagnostic approaches.

## When to Use

Use this skill when:
- Complex bugs that require multiple investigation approaches
- Errors with unclear root causes
- Multi-file or multi-service debugging required
- Need to track what has been tried

Do NOT use this skill for:
- Simple, obvious bugs (use systematic-debugging directly)
- Known issues with clear reproduction steps
- When user wants quick fix without investigation

## Inputs Required

- **Error Context**: The error message, stack trace, or unexpected behavior
- **Affected Systems**: Optional - which files/modules are involved

## Workflow

### Phase 1: Incident Initialization

1. Parse error into structured incident facts:
   - Error type/category
   - Affected files/modules
   - Error message and stack trace
   - Recent changes (git log)
2. Create incident timeline (in-memory)
3. Set initial hypotheses based on error type

### Phase 2: Hypothesis-Driven Investigation

1. For each hypothesis:
   - Design diagnostic test
   - Execute diagnostic
   - Record result in timeline
   - Refine or eliminate hypothesis
2. Track what's been tried to avoid loops

### Phase 3: Root Cause Determination

1. When hypothesis confirmed:
   - Document root cause
   - Create fix recommendation
   - Identify similar patterns to check

### Phase 4: Resolution Verification

1. Propose fix approach
2. Guide through fix implementation
3. Verify resolution works

## Must Do

- Maintain incident timeline with all diagnostic steps
- Track hypotheses and their status
- Avoid repeating failed approaches
- Document findings in incident report

## Must Not Do

- Jump to conclusions without evidence
- Try random fixes without hypothesis
- Forget what has been tried
- Ignore related issues found during investigation

## Handoff Protocol

### Receives From
- systematic-debugging: Complex issues escalated
- User: Direct incident reports

### Hands Off To
- systematic-debugging: For specific diagnostic steps
- test-driven-development: For verification tests

## Output Contract

1. **Incident State**: Current hypotheses and their status
2. **Investigation Log**: What has been tried and results
3. **Root Cause**: Determined cause (if found)
4. **Fix Recommendation**: Suggested approach

## Quick Start

1. Parse error into facts
2. Generate initial hypotheses
3. Design first diagnostic test
4. Execute and record result
5. Iterate until root cause found
