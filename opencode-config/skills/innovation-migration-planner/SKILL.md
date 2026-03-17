---
name: innovation-migration-planner
description: >
  Synthesis-focused skill for identifying high-leverage innovation opportunities, 
  evaluating alternative approaches, and designing migration strategies. Complements 
  codebase-auditor (yang to auditor's yin) by finding what *could be built* vs. what's 
  *broken and incomplete*. Produces execution-ready migration plans.

version: 2.0.0
category: planning
tags: [innovation, migration, planning, opportunity-scoring, strategy, synthesis]

dependencies: ["codebase-auditor"]
synergies: ["codebase-auditor", "writing-plans", "sequential-thinking", "adaptive-journey-driven-swarm"]
conflicts: []

outputs:
  - type: artifact
    name: hotspot-analysis
    location: "./.sisyphus/audits/innovation-hotspots.md"
  - type: artifact
    name: migration-plan
    location: "./.sisyphus/plans/"

inputs:
  - type: context
    name: codebase-audit
    required: false
    description: "Optional output from codebase-auditor for prerequisite analysis"
  - type: context
    name: innovation-scope
    required: false
    description: "Specific domains or capabilities to innovate on"
  - type: context
    name: strategic-constraints
    required: false
    description: "Business constraints, timeline, risk appetite"
---

## Overview

Create a **rigorous synthesis workflow** that identifies high-leverage innovation opportunities 
using weighted opportunity scoring, evaluates alternative migration strategies, and iterates with 
the user until a **feasible, execution-ready migration plan** is finalized.

This skill is the **yang** to codebase-auditor's **yin**: while auditor diagnoses *what's broken*, 
innovation-planner synthesizes *what could be built*. Both skills are fully independent yet 
strengthen each other—auditor flags prerequisites that unlock innovation opportunities.

## When to Use

Use this skill when requests include:

- "Find the highest-leverage innovation areas"
- "Push boundaries" or "find unconventional opportunities"
- "Design a migration strategy before implementation"
- "Evaluate alternative architectures for [subsystem]"
- "Rank opportunities by uncertainty, upside, and feasibility"
- "Identify where investment would have disproportionate impact"

Do NOT use this skill for:
- Direct bugfix-only tasks (use code-doctor)
- Routine maintenance (use codebase-auditor's remediation roadmap)
- Simple one-file edits
- Tactical decisions without strategic scope

## Yin-Yang Integration with codebase-auditor

**Audit → Innovation Flow**:
1. **Codebase-auditor** identifies integration debt, blind spots, and areas with high complexity + low investment
2. Auditor's findings become **input signals** for opportunity scoring (high innovation potential)
3. Auditor flags "innovation prerequisites" (what must be fixed before new features can be safely built)
4. Innovation-planner uses audit findings to score IHS and propose migration paths that address prerequisites

**Innovation → Audit Flow**:
1. **Innovation-planner** proposes a new architecture or feature direction
2. Auditor re-scans to assess feasibility: "Is this direction architecturally sound? What hidden coupling will we create?"
3. Audit produces "innovation readiness assessment": prerequisites, hidden risks, required refactoring
4. Results feed back into innovation convergence (Phase 3) for refinement

## Inputs Required

Collect or infer the following inputs before scoring:

- **Scope boundary**: repo, package, subsystem, or flow
- **Candidate domains**: modules, capabilities, workflows, or integration seams (can come from auditor's blind spot analysis)
- **Current investment signals**: architecture depth, prior experiments, ADRs, docs, tests, PR volume
- **Expected value vectors**: reliability, UX, velocity, cost, strategic differentiation, risk reduction
- **Evidence sources**: concrete `file:line` references, metrics, incidents, observed friction
- **Prerequisite signals**: Integration gaps or blind spots flagged by codebase-auditor (if available)

If any input is missing, mark `insufficient evidence` for that dimension and request targeted discovery.

## Enhanced Hotspot Scoring Model (IHS v2)

Compute a weighted product score per candidate domain:

```text
Innovation Hotspot Score (IHS)
= (VarianceNuance ^ wv) * (PotentialValue ^ wp) * (InverseAttention ^ wa) * 
  (PrerequisiteCoverage ^ wpc) * (FeasibilityScore) * Confidence
```

Use normalized values in the range 0.0-1.0:

| Dimension | Definition | Source |
|-----------|-----------|--------|
| **VarianceNuance** | Complexity, contextual nuance, architecture branching, unresolved tradeoffs | Manual analysis + auditor findings |
| **PotentialValue** | Expected impact across product, engineering velocity, cost, strategic differentiation | Stakeholder input + metrics |
| **InverseAttention** | `1 - AttentionDepth`; high when area is underexplored or lacks tests/docs | Auditor's "blind spot analysis" |
| **PrerequisiteCoverage** | What % of auditor's flagged prerequisites are addressed in the plan? (0.0-1.0) | Cross-reference with audit findings |
| **FeasibilityScore** | Can we build this safely? (considers coupling, existing patterns, team capacity) | Sequential Thinking + dependency map |
| **Confidence** | Evidence quality multiplier; default 0.85; lower for anecdotal evidence | 0.50-1.0 scale |

Default weights:
- `wv = 1.20` (complexity multiplier)
- `wp = 1.50` (value multiplier)
- `wa = 1.35` (attention/blind spot multiplier)
- `wpc = 1.10` (prerequisite coverage bonus)

Calibration guidance:
- **Raise `wp`**: When business/strategic upside dominates (e.g., new revenue stream)
- **Raise `wa`**: When innovation debt and blind spots dominate (e.g., technical debt unlock)
- **Raise `wpc`**: When fixing prerequisites is part of the innovation plan (not blocking)
- **Lower `Confidence`**: To 0.50-0.70 when evidence is mostly anecdotal or auditor hasn't scanned that subsystem

Ranking guidance:
- **Prioritize top 3-5 hotspots** by IHS
- **Break ties** using: (1) lower FeasibilityScore risk, (2) stronger cross-domain leverage, (3) prerequisite alignment
- **Flag unexpectedly low IHS**: If an area feels important but scores low, investigate—might indicate missing evidence or poor weighting calibration

## Feasibility Scoring Checklist

Before finalizing FeasibilityScore (0.0-1.0 scale), verify:

- [ ] **No hidden coupling**: Does proposal introduce circular dependencies or tightly couple components?
- [ ] **Prerequisite alignment**: Does codebase-auditor flag this as requiring prerequisite fixes? If yes, are they in the plan?
- [ ] **Pattern consistency**: Does this approach use existing architectural patterns or require new ones?
- [ ] **Test feasibility**: Can the new architecture be adequately tested? (Consider test infrastructure gaps)
- [ ] **Rollback safety**: Can we safely roll back intermediate migration phases?
- [ ] **Team expertise**: Do we have or can we acquire the domain knowledge needed?

Lower FeasibilityScore if:
- Proposal requires novel architecture (unproven in codebase)
- Multiple prerequisite fixes needed that aren't in the plan
- High risk of silent failures or regression
- Tight coupling to multiple subsystems

## Workflow

### Phase 0 - Audit Integration (Optional but Recommended)

1. If codebase-auditor findings are available, import `AUDIT_FINDINGS.json`
2. Extract "innovation prerequisite" flags and blind spot analysis
3. Use audit findings to seed candidate domains and weighting adjustments
4. Note areas where prerequisite work could unlock high-leverage opportunities

### Phase 1 - Discovery

1. **Enumerate candidate domains**: Map each to concrete evidence
   - Use auditor's blind spot analysis as seed
   - Identify existing solution overlap and prior attention depth
2. **Build hotspot table**: Dimensions, weights, confidence notes, prerequisite flags
3. **Tag for prerequisite alignment**: Which candidates have auditor prerequisites? Which unlock auditor recommendations?

### Phase 2 - Divergence

1. For each top hotspot, propose 2-4 innovation directions:
   - **Conservative extension**: Safe, incremental, low risk
   - **Adjacent leap**: Moderate innovation, some architectural change
   - **Boundary-pushing redesign**: Bold, high-upside, higher risk
2. For each direction:
   - Capture expected value, key risks, migration blast radius
   - Identify which auditor prerequisites are needed
   - Assess feasibility using FeasibilityScore checklist
3. **Explicitly challenge** default assumptions and stale architecture boundaries
4. **Surface hidden coupling**: Use Sequential Thinking to map ripple effects

### Phase 3 - Convergence (User Collaboration Loop)

Repeat until convergence:

1. **Present current plan slice**: Hotspot findings, direction options, unresolved decisions
2. **Ask for targeted feedback**: Tradeoffs, risk appetite, migration pace, feasibility concerns
3. **Run Sequential Thinking**: Trace how each direction affects other subsystems
4. **Re-check prerequisites**: Does auditor flag show this is feasible? Any NEW prerequisites discovered?
5. **Revise scoring** or sequencing as new constraints emerge

Stop loop when:
- [ ] Direction is unambiguous (user agrees on approach)
- [ ] Feasibility is validated (no hidden coupling, prerequisites identified)
- [ ] Risk is acceptable (rollback safety confirmed)
- [ ] Success metrics are measurable

### Phase 4 - Plan Finalization

1. Create a concrete plan artifact in `.sisyphus/plans/<plan-name>.md`
2. Ensure each step is atomic, testable, tied to exact files/components
3. **Embed prerequisite work**: If auditor flagged prerequisites, incorporate them into the plan's early phases
4. **Define verification gates**: How will we know each phase is complete?
5. **Confirm ownership**: Who owns each phase? What's the escalation path?
6. **Define rollback points**: Where can we safely halt if things go wrong?
7. **Obtain explicit user confirmation**: "Plan is ready to execute" sign-off

## Collaborative Refinement Loop (Mandatory)

Repeat until convergence:

1. Present current plan slice and unresolved decisions.
2. Ask for targeted feedback on tradeoffs, risk appetite, and migration pace.
3. Revise scoring or sequencing as new constraints emerge.
4. Re-check for hidden coupling, neglected consumers, and failure modes.

Treat "perfect" as: unambiguous scope, validated tradeoffs, measurable outcomes, and rollback safety.

## Output Contract

Produce, in order:

1. Hotspot ranking table (with IHS dimensions and confidence)
2. Chosen innovation direction per hotspot
3. Final migration plan document in `.sisyphus/plans/<plan-name>.md`
4. Execution handoff statement

Execution handoff statement format:

```text
Innovation migration plan finalized at .sisyphus/plans/<plan-name>.md.
All critical decisions are resolved and verification gates are defined.
Invoke /start-work to begin execution.
If this environment uses workflow aliases, invoke /workflows:work with the same plan path.
```

## Must Do

- **Use concrete evidence** and cite `file:line` where available
- **Keep ranking transparent**: Show weights, assumptions, confidence, and where auditor findings feed into scoring
- **Bias toward high-leverage opportunities**, not novelty for novelty's sake
- **Surface naive assumptions** and integration risks before plan lock-in
- **Cross-reference auditor findings**: Explicitly note where codebase-auditor flagged prerequisites or blind spots
- **Keep user collaboration active** through each convergence cycle
- **Validate feasibility**: Use Sequential Thinking to trace multi-step ripple effects
- **Show prerequisite alignment**: How does this plan address (or work around) auditor's findings?

## Must Not Do

- Do NOT jump into implementation during innovation planning
- Do NOT hide uncertainty; mark low-confidence calls explicitly
- Do NOT finalize plan while critical decisions remain unresolved
- Do NOT ignore auditor findings: If auditor flags prerequisites, either incorporate them or explicitly justify why you're working around them
- Do NOT assume "someone will fix prerequisites later"—embed them or mark them as blocker/risk
- Do NOT invoke `/start-work` before explicit user confirmation
- Do NOT skip feasibility validation—rushing to "ideas" without technical grounding leads to un-buildable plans

## Hotspot Analysis Output Schema

```json
{
  "analysis_version": "2.0",
  "timestamp": "2026-03-17T10:00:00Z",
  "audit_integration": {
    "audit_source": "./.sisyphus/audits/AUDIT_FINDINGS.json",
    "prerequisites_addressed": 3,
    "total_prerequisites": 5,
    "blind_spots_leveraged": 2
  },
  "hotspots": [
    {
      "id": "hs_001",
      "name": "Adaptive Journey-Driven Swarm Design System",
      "ihs_score": 8.7,
      "variance_nuance": 0.8,
      "potential_value": 0.9,
      "inverse_attention": 0.85,
      "prerequisite_coverage": 0.6,
      "feasibility_score": 0.8,
      "confidence": 0.85,
      "directions": [
        {
          "name": "Conservative: Extend existing design skill infrastructure",
          "risk": "low",
          "upside": "medium",
          "blast_radius": "2 packages"
        }
      ],
      "related_audit_findings": ["multi-agent-coordination", "isolation-patterns"],
      "suggested_phases": 3,
      "estimated_weeks": 4
    }
  ]
}
```

## Quick Start

1. Optionally import codebase-auditor findings (Phase 0)
2. Build candidate-domain inventory (Phase 1)
3. Score candidates with enhanced IHS model (Phase 1)
4. Rank top 3-5 hotspots and propose directions (Phase 2)
5. Co-refine migration plan with user until complete (Phase 3)
6. Embed prerequisites and finalize plan (Phase 4)
7. Persist plan in `.sisyphus/plans/` and prepare handoff to `/start-work`
