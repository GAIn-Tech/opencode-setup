---
# REQUIRED FIELDS
name: codebase-auditor
description: >
  Systematic codebase audit skill for inventorying architecture, identifying drift,
  finding high-signal health issues, and producing prioritized remediation guidance.

# OPTIONAL METADATA
version: 1.0.0
category: analysis
tags: [audit, codebase, inventory, architecture, health, drift]

# COMPOSITION METADATA
dependencies: []
synergies: ["innovation-migration-planner", "code-doctor", "evaluation-harness-builder", "research-builder"]
conflicts: []
outputs:
  - type: artifact
    name: audit-report
    location: runtime
inputs:
  - type: context
    name: repo-state
    required: true
---

# Codebase Auditor

## Overview

Codebase Auditor is the first-class skill for systematic repo health audits. Use it to inventory
 the current system, locate disconnected or incomplete integrations, identify stale documentation,
 and prioritize remediation based on impact instead of guesswork.

## When to Use

Use this skill when:
- You want a comprehensive audit of architecture, skills, MCP wiring, or observability
- You need to identify stale docs, drift, or incomplete integration paths
- You want a ranked remediation plan instead of ad hoc cleanup
- A system has gone through many incremental changes and needs a coherence pass

Do NOT use this skill for:
- Single-file bug fixes
- Simple code searches with obvious targets
- External library API questions better handled by Context7

## Workflow

### Phase 1: Inventory

1. Map the relevant repo surfaces (packages, configs, skills, agents, scripts, docs)
2. Identify the canonical sources of truth for the subsystem under audit

### Phase 2: Compare Reality vs Intent

1. Check runtime/config wiring against docs and tests
2. Identify where features are enabled but passive, documented but unwired, or implemented but unsurfaced

### Phase 3: Rank Findings

1. Separate real integration gaps from low-value style issues
2. Prioritize by user impact, runtime correctness, and future-maintenance risk

### Phase 4: Report

1. Return concrete file paths and failure modes
2. Recommend the smallest safe next fixes in execution order

## Must Do

- Prefer repo evidence over intuition
- Distinguish current truth from historical artifacts
- Separate runtime bugs from reporting/documentation gaps
- Produce prioritized findings, not raw dumps

## Must Not Do

- Do NOT mix solved issues with open issues unless a regression remains
- Do NOT report low-signal nits as top priorities
- Do NOT speculate about architecture without reading the actual wiring paths

## Quick Start

```
1. inventory the subsystem
2. compare runtime/config/docs/tests
3. rank highest-signal gaps
4. propose smallest safe remediation path
```
