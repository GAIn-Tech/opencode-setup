---
name: innovation-migration-planner
description: This skill should be used when identifying underexplored, high-upside innovation opportunities in a codebase, collaboratively refining a migration plan, and preparing a finalized plan artifact for /start-work execution.
---

## Overview

Create a rigorous innovation workflow that prioritizes codebase hotspots using a weighted opportunity score, then iterate with the user until a migration plan is execution-ready.

Keep this skill in planning mode. Do not implement code changes inside this skill flow.

## When to Use

Use this skill when requests include:

- "Find the highest-leverage innovation areas"
- "Push boundaries" or "find unconventional opportunities"
- "Draft a migration plan before implementation"
- Any request to rank opportunity by uncertainty, upside, and under-investment

Do not use this skill for direct bugfix-only tasks, routine maintenance, or simple one-file edits.

## Inputs Required

Collect or infer the following inputs before scoring:

- Scope boundary: repo, package, subsystem, or flow
- Candidate domains: modules, capabilities, workflows, or integration seams
- Current investment signals: architecture depth, prior experiments, ADRs, docs, tests, PR volume
- Expected value vectors: reliability, UX, velocity, cost, strategic differentiation
- Evidence sources: concrete `file:line` references, metrics, incidents, and observed friction

If any input is missing, mark `insufficient evidence` for that dimension and request targeted discovery.

## Hotspot Scoring Model

Compute a weighted product score per candidate domain:

```text
Innovation Hotspot Score (IHS)
= (VarianceNuance ^ wv) * (PotentialValue ^ wp) * (InverseAttention ^ wa) * Confidence
```

Use normalized values in the range 0.0-1.0:

- `VarianceNuance`: complexity, contextual nuance, architecture branching, unresolved tradeoffs
- `PotentialValue`: expected impact if solved well across product and engineering outcomes
- `InverseAttention`: `1 - AttentionDepth`; high when area is underexplored or lacks overlap with existing solutions
- `Confidence`: evidence quality multiplier, default 0.85; drop when evidence is weak

Default weights:

- `wv = 1.20`
- `wp = 1.50`
- `wa = 1.35`

Calibration guidance:

- Raise `wp` when business upside dominates
- Raise `wa` when innovation debt and blind spots dominate
- Lower `Confidence` to 0.50-0.70 when evidence is mostly anecdotal

Ranking guidance:

- Prioritize top 3-5 hotspots by IHS
- Break ties with lower implementation risk and stronger cross-domain leverage

Use `references/scoring-rubric.md` to score consistently.

## Workflow

### Phase 1 - Discovery

1. Enumerate candidate domains and map each to concrete evidence.
2. Identify existing solution overlap and prior attention depth.
3. Build a hotspot table with dimensions, weights, and confidence notes.

### Phase 2 - Divergence

1. For each top hotspot, propose 2-4 innovation directions:
   - conservative extension
   - adjacent leap
   - boundary-pushing redesign
2. Capture expected value, key risks, and migration blast radius.
3. Explicitly challenge default assumptions and stale architecture boundaries.

### Phase 3 - Convergence

1. Select target direction(s) with the user.
2. Draft migration strategy with phases, milestones, rollback points, and verification gates.
3. Run a refinement loop until no unresolved concerns remain.

### Phase 4 - Plan Finalization

1. Create a concrete plan artifact in `.sisyphus/plans/`.
2. Ensure each step is atomic, testable, and tied to exact files/components.
3. Confirm ownership, dependencies, risk controls, and success metrics.
4. Obtain explicit user confirmation that the plan is "ready to execute".

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

- Use concrete evidence and cite `file:line` where available
- Keep ranking transparent (show weights, assumptions, and confidence)
- Bias toward high-leverage opportunities, not novelty for novelty's sake
- Surface naive assumptions and integration risks before plan lock-in
- Keep user collaboration active through each convergence cycle

## Must Not Do

- Do not jump into implementation during innovation planning
- Do not hide uncertainty; mark low-confidence calls explicitly
- Do not finalize plan while critical decisions remain unresolved
- Do not invoke `/start-work` (or `/workflows:work`) before explicit user confirmation

## Quick Start

1. Build candidate-domain inventory.
2. Score candidates with `references/scoring-rubric.md`.
3. Rank top 3-5 hotspots and propose directions.
4. Co-refine migration plan until complete.
5. Persist plan in `.sisyphus/plans/` and hand off to `/start-work`.
