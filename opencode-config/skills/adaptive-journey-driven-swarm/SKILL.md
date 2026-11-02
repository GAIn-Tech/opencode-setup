---
name: adaptive-journey-driven-swarm
description: >
  Multi-agent swarm orchestration for high-fidelity, persona-validated UX/product design 
  and implementation specs. From source code or product brief → design implementation via 
  Clean Room isolation, Exa research, Sequential Thinking, Stitch MCP, and Blind Vote consensus.

version: 2.0.0
category: design
tags: [design, ux, swarm, personas, journey-mapping, implementation-specs, multi-agent]

dependencies: ["sequential-thinking", "research-builder"]
synergies: ["codebase-auditor", "innovation-migration-planner", "frontend-design", "task-orchestrator"]
conflicts: []

outputs:
  - type: artifact
    name: design-system
    location: "./.swarm-artifacts/"
  - type: artifact
    name: feature-registry
    location: "./FEATURE_REGISTRY.json"
  - type: artifact
    name: implementation-spec
    location: "./implementation-spec.md"

inputs:
  - type: context
    name: source-material
    required: true
    description: Source code, UI screenshots, or product brief
  - type: context
    name: persona-preferences
    required: false
    description: Custom persona matrix or use Five Pillar defaults
---

# Adaptive Journey-Driven Design Swarm (v2)

## Overview

This skill defines how to orchestrate a multi-agent swarm to produce high-fidelity, persona-validated UX designs and implementation specs. Use it when you need to go from raw source code or a product brief all the way through to screen-level UI generation and a dependency-aware implementation plan.

The core principle is **Strict Agent Isolation** — each subagent receives only the Minimum Viable Context (MVC) for its role, preventing context poisoning and hallucination cascades.

## When to Use This Skill

Trigger this skill when the user asks to:

- Redesign or audit a mobile/web app's UX using AI agents
- Generate validated UI screens via a Stitch MCP subagent
- Run persona-based feature prioritization
- Produce a structured journey map from source code or a product spec
- Set up a multi-agent "swarm" workflow for design or product work

Do NOT use this skill for:
- Single-screen tweaks or minor CSS fixes
- Accessibility audits without design iteration (use accessibility-focused skill instead)
- Brand audits without UX redesign component

## Core Philosophy: Clean Room Orchestration

The foundational principle is **Strict Agent Isolation** to prevent context poisoning — where one agent's biased output skews all subsequent reasoning.

### Key Principles

1. **Isolation**: Every subagent receives only the Minimum Viable Context (MVC) for its role. Agents never see each other's raw reasoning.
2. **Statelessness**: The Orchestrator does not carry subagent conversation history. It only ingests their structured outputs (JSON or Markdown) written to a shared registry.
3. **Aggregation**: Before passing data between phases, outputs from multiple agents are mathematically combined (means, standard deviations) to neutralize individual hallucinations.
4. **Verification**: All generated UIs and specs are validated against the original source material before finalization.

## Methodological Tools

### 1. The Exa Hermeneutic Circle

An iterative research loop — understanding the whole informs the parts, and the parts deepen understanding of the whole.

| Wave | Step | Action |
|------|------|--------|
| Wave 0 | Pre-understanding | Broad Exa search: industry standards & best-in-class UX for the niche (e.g., "Dating app gamification retention loops") |
| Wave 1 | The Parts | Decompose the app into atomic features, identify personas, extract user journeys |
| Wave 3 | Re-contextualization | Hyper-specific Exa queries based on extracted features (e.g., "UX edge cases for music-based matching algorithms") |
| Wave 4 | Design | Stitch-generated screens emphasizing high-variance persona needs |
| Wave 7 | Synthesis | Combine findings into a final journey that is internally consistent and externally competitive |

### 2. Sequential Thinking Protocol

Used by the Orchestrator and Architect agents to validate complex logic before committing to a path.

- **Logic Branching**: Explore 3–5 alternative journey paths, weighing friction vs. conversion before committing.
- **Dependency Mapping**: Trace how a Wave 1 feature change (e.g., "Age Verification") ripples into Wave 4 designs and Wave 7 implementation.
- **Error Correction**: When a Quality Gate fails, use Sequential Thinking to backtrack and find where logic diverged from Persona needs.

## MCP Tool Configuration

### 1. Stitch MCP — UI Generation

**Role**: Designer Subagents

**Tool**: `npx @_davideast/stitch-mcp` (or internal tool access)

**Prompting Framework (Zoom-Out → Zoom-In)**:

| Layer | What to Define |
|-------|---|
| Context (Zoom-Out) | Product ecosystem and target user |
| Goal (Zoom-In) | Screen's primary objective (e.g., "Reduce friction in age verification") |
| Layout & Hierarchy | Specific components (e.g., "Sticky header, primary CTA at bottom, list items for selection") |
| Constraints | Visual style, accessibility requirements, one-hand usage optimization |

**Required Outputs**:
- `get_screen_image` → save visual asset to `./screenshots/stitch_redesign/`
- `get_screen_code` → save implementation spec (React/Vue/Kotlin)

### 2. Exa MCP — Semantic Research

**Role**: Librarian Subagents

**Capability**: Neural/semantic search (not just keyword matching)

| Method | Use Case |
|--------|----------|
| `web_search_exa` | Broad industry benchmarking |
| `web_search_advanced_exa` | Filtered by domain (e.g., medium.com, nngroup.com) and date (last 90 days) |

**Hermeneutic Instruction**: Subagents must actively seek contradictory UX patterns (e.g., "Why swiping is dying" vs. "Why swiping is essential") to give the Orchestrator a balanced dataset.

### 3. Context7 MCP — Documentation Resolution

**Role**: Architect & Implementation Subagents

**Anti-Hallucination Rule**: Subagents are forbidden from writing implementation code without first querying Context7 for current API versions.

**Workflow**:
1. `resolve-library-id` — Map dependency name (e.g., "React Native Reanimated") to a Context7 ID
2. `query-docs` — Retrieve version-specific code snippets for the implementation plan

### 4. Sequential Thinking MCP — Orchestration Logic

**Role**: Orchestrator & Synthesis Agents

**Key Parameters**:
- `thought`: The current logic step
- `thought_number`: Position tracker in the sequence
- `next_thought_needed`: Boolean to maintain the chain
- `branch_from_thought`: For "What If" scenarios (e.g., "What if we remove social auth?")

## Phased Consensus Mechanism — The Blind Vote

A three-stage protocol to produce high-fidelity, bias-resistant design decisions.

### Stage 1: Blind Independent Voting

1. **Dispatch**: Launch 5 Persona Agents simultaneously
2. **Context given**: Feature Spec + User Journey Stage only
3. **Strictly forbidden**: Seeing other personas' scores or feedback
4. **Output**: Each agent writes to `votes/round1_{persona_id}_{feature_id}.json`

Voting JSON format:
```json
{
  "persona_id": "power_user",
  "feature_id": "age_verification",
  "scores": {
    "utility": 8.5,
    "friction": 2.0,
    "accessibility": 7.0,
    "emotional_resonance": 5.5
  },
  "notes": "Power users hate friction but appreciate transparent verification"
}
```

### Stage 2: Orchestrator-Driven Aggregation

The Orchestrator reads all Stage 1 files and calculates:

| Metric | Formula | Meaning |
|--------|---------|---------|
| Mean Score | Average of all votes | Aggregate priority |
| Variance (σ²) | Spread of votes | Level of disagreement |
| Conflict Flag | TRUE if σ > 2.0 | Triggers deliberation phase |

If a Conflict Flag is raised, the Orchestrator surfaces the specific points of contention **without revealing which agent said what**.

### Stage 3: Deliberation & Refinement (if triggered)

If conflict detected:
1. Identify the split (e.g., "Power Users want 1-step; Newbies want 5-step guided flow")
2. Propose micro-interactions that satisfy both (e.g., "Quick path with optional help overlay")
3. Rerun voting on refined direction
4. Proceed when σ < 1.5 (consensus achieved)

## Persona Engineering — Parameter Matrix

Personas must be high-contrast to avoid "monoculture" consensus failures.

### The Five Pillar Roles

| Persona | Core Value | Hates |
|---------|------------|-------|
| The Skeptic | Utility, low friction | Feature bloat, aesthetics-over-function |
| The Power User | Efficiency, shortcuts, customization | Locked-down flows |
| The Aestheticist | Visual polish, emotional resonance | Ugly or dense UIs |
| The Newbie | Clarity, explicit guidance | Assumed knowledge |
| The Social Catalyst | Community, connectivity, sharing | Siloed experiences |

### Persona Variable Scales (1–10)

| Variable | Low (1) | High (10) |
|----------|---------|-----------|
| Tech Literacy | Uses basic apps | Debugs code |
| Impatience | Willing to browse | Demands instant results |
| Visual Sensitivity | Utility focus | Spots pixel misalignment |
| Risk Tolerance | Sticks to familiar paths | Tries every new feature |
| Social Preference | Individualistic | Highly collaborative |

## Data Schemas

### FEATURE_REGISTRY.json

Stores the atomic "Parts" from the Hermeneutic Circle. Includes average scores, variance, and per-persona feedback excerpts for each feature.

```json
{
  "features": [
    {
      "id": "age_verification",
      "name": "Age Verification Flow",
      "avg_utility_score": 7.8,
      "variance_utility": 0.9,
      "implementation_priority": 1,
      "persona_feedback": {
        "skeptic": "Clear validation rules appreciated",
        "newbie": "Too many assumptions about ID formats"
      }
    }
  ]
}
```

### SWARM_MANIFEST.json

The Orchestrator's state machine. Tracks every task's:
- Status: `pending | in_progress | complete | failed`
- Input context path
- Output artifact path
- Wave number
- Subagent assignments

```json
{
  "manifest_version": "2.0",
  "created_at": "2026-03-17T10:00:00Z",
  "tasks": [
    {
      "id": "task_1",
      "name": "Exa Research (Wave 0)",
      "status": "complete",
      "assigned_to": "Librarian-1",
      "input": "Feature spec: gamification retention",
      "output": "research-summary.md",
      "wave": 0
    }
  ]
}
```

## Context Segregation — The "Need-to-Know" Silo

| Agent Type | Gets | Does NOT Get |
|------------|------|-------------|
| Decomposition Agents | Raw source code + UI screenshots | Persona data |
| Persona Agents | Feature descriptions + visual mocks | Source code |
| Designer Agents (Stitch) | Prioritized feature list + Persona "Desire Lines" | Project history |
| Orchestrator | All outputs (in aggregated form) + conflict flags | Raw agent reasoning |

**File-Based State**: The Orchestrator uses `SWARM_MANIFEST.json` as the single source of truth to prevent context window saturation across long swarm runs.

## Wave Execution Reference

| Wave | Name | Tool | Agent | Key Instruction |
|------|------|------|-------|-----------------|
| 0 | Hermeneutic Research | Exa | Librarian | "Find 5 top UX patterns for [Niche] and 3 common failure modes." |
| 1 | Feature Extraction | — | Architect | Catalogue components by intent. No fixing allowed. |
| 2.2 | Deliberation (if triggered) | Sequential Thinking | Orchestrator | Resolve conflicts flagged by QG-1 |
| 3 | Dependency Synthesis | Sequential Thinking | Orchestrator | Map Parts back to Whole; identify which features unlock which journey stages |
| 4 | Design Generation | Stitch MCP | Designer | "Generate a screen emphasizing [Persona Need] using features with Avg > 7.5" |
| 7 | Final Synthesis | Exa + Sequential Thinking | Orchestrator | Produce a journey that is internally consistent and externally competitive |

## Quality Gates

| Gate | Metric | Threshold | Action on Failure |
|------|--------|-----------|-------------------|
| **QG-1** | Semantic Variance | σ < 1.5 | Trigger Deliberation Phase (Wave 2.2) |
| **QG-2** | Cultural Vibe (Kai Score) | > 45 | Immediate re-roll of Stitch prompt |
| **QG-3** | UI Density | Component count ≤ 12 | Force decomposition via Sequential Thinking check |
| **QG-4** | Accessibility Conformance | WCAG AA minimum | Stitch regenerate with a11y constraints |
| **QG-5** | Dependency Completeness | All APIs resolved in Context7 | Block implementation spec until resolved |

**Kai Score** measures how well the generated screen resonates with the target cultural/emotional context defined in the Persona matrix. Scores are generated by the Aestheticist and Social Catalyst personas during Stage 2 aggregation.

## Orchestrator Kill Switch

If `FEATURE_REGISTRY.json` or `SWARM_MANIFEST.json` becomes corrupted or out of sync:

1. Stop all active subagents immediately
2. Re-scan the `./.swarm-artifacts/` directory to rebuild state from raw artifacts
3. Inform the user of the state-sync operation and which wave will resume from
4. Provide a rollback option to the last known-good manifest checkpoint

## Workflow Steps (Quick Start)

1. **Initialize**: Create `.swarm-artifacts/` directory, populate source material
2. **Wave 0**: Launch Librarian agents for research (Exa Hermeneutic Circle)
3. **Wave 1**: Architect decomposes features, builds dependency graph
4. **Vote (Stage 1)**: Dispatch 5 Persona agents in parallel with feature specs
5. **Aggregate (Stage 2)**: Orchestrator calculates means, variances, conflict flags
6. **Deliberate (if needed)**: Run Wave 2.2 to resolve conflicts
7. **Design (Wave 4)**: Stitch generates screens for top-priority features
8. **Synthesize (Wave 7)**: Produce final journey spec and implementation plan
9. **Validate**: Cross-check against source material, QG gates, and user acceptance
10. **Output**: Deliver design system, feature registry, implementation spec

## Must Do

- Keep agent isolation strict—no subagent sees another's raw reasoning
- Use mathematical aggregation (mean, variance, confidence intervals) for consensus
- Document all Quality Gate failures with timestamps and reasoning
- Maintain `SWARM_MANIFEST.json` as the canonical orchestration state
- Validate UI outputs against the original source material before finalization
- Support image-based design references (clipboard paste, file import)
- Provide interactive journey visualization with clickable persona annotations

## Must Not Do

- Do NOT share voting results with other agents until Stage 2 aggregation is complete
- Do NOT skip Quality Gate checks to accelerate the process
- Do NOT use default personas without considering domain-specific variants
- Do NOT generate implementation code without Context7 API verification
- Do NOT finalize journey without explicit user validation of persona alignments
- Do NOT lose orchestration state—always persist `SWARM_MANIFEST.json` after each wave

## Advanced: Custom Personas

To replace or extend the Five Pillar roles:

1. Define new personas with explicit parameter matrices (Tech Literacy, Impatience, Visual Sensitivity, Risk Tolerance, Social Preference)
2. Create persona JSON files in `./.swarm-artifacts/personas/`
3. Update `SWARM_MANIFEST.json` with persona_count and persona IDs
4. Re-run voting with custom personas
5. Validate Kai Score still exceeds 45

## Advanced: Extending to Video/Animation

The design swarm can generate motion design specs by:
1. Creating "keyframe personas" (extremes of animation preference)
2. Having Stitch generate animation code alongside static mockups
3. Adding "motion density" to QG-3 (component animations ≤ 3 per screen)
4. Using Sequential Thinking to map animation timing to user journey stages
