---
# REQUIRED FIELDS
name: codebase-auditor
description: >
  Diagnostic-focused codebase audit skill for identifying root causes, architecture gaps, 
  integration debt, stale documentation, and high-signal health issues. Produces prioritized 
  remediation guidance and structural insights for innovation planning (yin to 
  innovation-migration-planner's yang).

# OPTIONAL METADATA
version: 2.0.0
category: analysis
tags: [audit, codebase, inventory, architecture, health, drift, diagnosis, integration-debt]

# COMPOSITION METADATA
dependencies: []
synergies: ["innovation-migration-planner", "code-doctor", "evaluation-harness-builder", "research-builder", "codebase-memory"]
conflicts: []

outputs:
  - type: artifact
    name: audit-report
    location: "./.sisyphus/audits/"
  - type: artifact
    name: findings-registry
    location: "AUDIT_FINDINGS.json"
  - type: artifact
    name: remediation-roadmap
    location: "./.sisyphus/audits/remediation-roadmap.md"

inputs:
  - type: context
    name: repo-state
    required: true
  - type: context
    name: audit-scope
    required: false
    description: "Specific subsystem (packages/, docs/, skills/, etc.) or full codebase"
  - type: context
    name: innovation-candidates
    required: false
    description: "Optional findings from innovation-migration-planner to cross-reference"
---

# Codebase Auditor (v2)

## Overview

Codebase Auditor is the **diagnostic** skill for systematic repo health analysis. Use it to 
systematically inventory architecture, locate root causes of integration debt, identify stale 
documentation, surface hidden coupling, and produce **prioritized remediation guidance**. 

This skill is the **yin** to innovation-migration-planner's **yang**: while innovation finds 
*what could be built*, auditor finds *what's broken or incomplete*. Both skills are fully 
independent yet strengthen each other when used in sequence.

## When to Use

Use this skill when:
- You want a **root-cause diagnostic** of architecture, integration, or health issues
- You need to identify stale docs, drift, **incomplete wiring**, or hidden coupling
- You want a **ranked remediation plan** with structural insights for downstream innovation
- A system has gone through many incremental changes and needs a **coherence pass**
- You want to cross-reference with innovation opportunities (before/after pairing with innovation-migration-planner)
- You need to understand why certain areas are "blind spots" or underinvested

Do NOT use this skill for:
- Single-file bug fixes (use code-doctor instead)
- Simple code searches with obvious targets
- External library API questions (use Context7 or research-builder)
- High-level opportunity discovery (use innovation-migration-planner instead)

## Workflow

### Phase 1: Boundary Definition & Inventory

1. **Define audit scope**: Full codebase, specific subsystem (packages/), or cross-cutting concern (skills, MCP wiring)
2. **Map repo surfaces**: packages, configs, skills, agents, scripts, docs, integration points
3. **Identify canonical sources of truth**: Where should this component's configuration live? What's the source-of-truth split?
4. **Document current coverage**: What's intentionally out-of-scope? Why?

### Phase 2: Compare Reality vs Intent (Root Cause Analysis)

1. **Check wiring completeness**: Feature implemented but not wired? Wired but disabled? Documented but missing?
2. **Identify hidden coupling**: Which changes to Component A ripple unexpectedly to Component B?
3. **Surface stale artifacts**: Docs vs. code divergence, deprecated code paths still active, dead imports
4. **Find integration seams**: Where do systems leak assumptions about each other?
5. **Detect incomplete onboarding**: Are new developers getting lost in specific subsystems?

### Phase 3: Classify & Rank Findings

1. **Separate signal from noise**: Real integration gaps vs. low-value style issues
2. **Classify by root cause**: Missing wiring, stale docs, architectural coupling, incomplete testing, insufficient observability
3. **Score by impact dimensions**:
   - **User impact**: Does this affect end-user experience or reliability?
   - **Runtime correctness**: Does this cause bugs, crashes, or silent failures?
   - **Maintenance friction**: How much does this slow down future changes?
   - **Scalability debt**: Does this make the system harder to grow?
4. **Identify cascading risks**: Which gaps, if unfixed, will create 3-5 downstream problems?

### Phase 4: Generate Insights for Innovation

1. **Highlight blind spots**: Areas with low investment + high complexity = high innovation potential
2. **Surface hidden assumptions**: Where the code bakes in constraints that could be relaxed
3. **Map integration opportunities**: Components that almost fit together but need synthesis
4. **Document prerequisite work**: What must be fixed *before* innovation can proceed safely?

### Phase 5: Produce Remediation Roadmap

1. **Return concrete file paths** and failure modes
2. **Recommend smallest safe next fixes** in execution order
3. **Estimate effort tiers**: Quick fixes vs. medium refactors vs. architectural changes
4. **Flag for innovation-migration-planner**: Mark findings that unlock high-leverage opportunities

## Yin-Yang Integration with innovation-migration-planner

**Audit → Innovation Flow**:
1. Auditor identifies integration debt and blind spots
2. Auditor flags areas with **high complexity + low attention** as "innovation prerequisites"
3. Innovation-migration-planner uses audit findings to score opportunities (higher IHS for low-attention areas)
4. Innovation plan explicitly calls out what must be fixed before new features can be safely built

**Innovation → Audit Flow**:
1. Innovation-migration-planner proposes a new architecture/direction
2. Auditor re-scans the codebase to verify whether the proposal introduces NEW coupling, is actually feasible, or requires prerequisite fixes
3. Audit produces a "innovation readiness assessment" (can we safely build this? what's missing?)

## Must Do

- **Prefer repo evidence over intuition**: Every finding must be traceable to code, config, or tests
- **Distinguish current truth from historical artifacts**: Mark deprecated but still-active code separately from working code
- **Separate runtime bugs from documentation gaps**: A wrong doc is a different class of problem than a wrong implementation
- **Produce prioritized findings**, not raw dumps: Rank by user impact × maintenance friction
- **Surface root causes**, not just symptoms: "MCP X is unwired" matters less than "why hasn't MCP X been wired?"
- **Document blind spot reasoning**: Explain what conditions led to this area being underinvested
- **Flag for innovation**: Mark findings that unlock or require high-leverage opportunities

## Must Not Do

- Do NOT mix solved issues with open issues unless a regression remains
- Do NOT report low-signal nits as top priorities
- Do NOT speculate about architecture without reading the actual wiring paths
- Do NOT skip the "innovation flag" step — auditor should actively suggest what innovation-planner should examine
- Do NOT assume developers "should know" about blind spots — document the context that led to underinvestment

## Output Schemas

### AUDIT_FINDINGS.json

Structured findings for cross-referencing with innovation opportunities.

```json
{
  "audit_version": "2.0",
  "scope": "packages/",
  "timestamp": "2026-03-17T10:00:00Z",
  "findings": [
    {
      "id": "integration-debt-001",
      "category": "incomplete-wiring",
      "severity": "high",
      "subsystem": "packages/opencode-context-governor",
      "description": "Governor MCP server exported but no CLI wrapper exists",
      "root_cause": "MCP wrapper pattern not established in codebase at time of implementation",
      "affected_files": [
        "packages/opencode-context-governor/package.json",
        "opencode-config/opencode.json"
      ],
      "runtime_impact": "Governor unavailable at host level, only in-process",
      "maintenance_friction": "medium",
      "scalability_debt": "high (blocks other packages from similar wrapping)",
      "innovation_prerequisite": true,
      "innovation_unlock_potential": "Establishes MCP wrapper pattern, enables 3+ other packages",
      "remediation_effort": "medium",
      "estimated_hours": 4
    }
  ]
}
```

### Audit Report Template

1. **Executive Summary**: Overall system health score, top 3 findings, strategic recommendations
2. **Findings by Category**: Grouped by root cause (wiring, docs, coupling, testing, observability)
3. **Blind Spot Analysis**: Areas with high complexity + low test/doc coverage
4. **Remediation Roadmap**: Ordered by: (1) blocks other work, (2) user impact, (3) effort
5. **Innovation Opportunities**: Explicit cross-reference to areas innovation-planner should examine
6. **Health Metrics**: Coverage scores, coupling ratios, documentation freshness, integration completeness

## Quick Start

```
1. Define audit scope and boundaries
2. Inventory subsystem, identify sources of truth
3. Compare reality vs. intent (root cause analysis)
4. Classify findings and score by impact
5. Flag innovation opportunities and prerequisite work
6. Produce findings registry + remediation roadmap
7. Output for cross-reference with innovation-migration-planner
```
