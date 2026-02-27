# Skill Composition

This document describes how to compose multiple skills safely and how to express interoperability contracts in machine-readable form.

## Composition Model

1. Start from a profile, not ad-hoc skills.
2. Resolve dependencies transitively.
3. Detect known conflicts.
4. Execute in resolved order.
5. Verify outputs before handing off.

## Handoff Contract

Each skill MUST declare its handoff in the registry entry and SKILL.md frontmatter. This replaces prose-only handoff descriptions with machine-readable fields.

### Machine-Readable Fields (registry.json + SKILL.md frontmatter)

#### `inputs` / `outputs` — canonical format

Both use the same structure — an array of typed field descriptors:

```yaml
inputs:
  - name: "task_context"
    type: "object"
    description: "The task type and description passed from the orchestrator"
    required: true
  - name: "prior_artifacts"
    type: "array"
    description: "Artifacts produced by preceding skills"
    required: false
outputs:
  - name: "result_summary"
    type: "string"
    description: "Human-readable completion summary"
    required: false
  - name: "artifact_path"
    type: "string"
    description: "Path to produced file or spec"
    required: false
```

Field rules:
- `name` — required; snake_case identifier
- `type` — optional; one of `string`, `number`, `boolean`, `object`, `array`
- `description` — optional; human-readable explanation
- `required` — optional boolean; defaults to `false`

> **Single canonical format**: Use the structured object form above. Do NOT use a flat string array for inputs/outputs.

#### `handoff` — composition routing cues

```yaml
handoff:
  receives_from: ["brainstorming", "writing-plans"]
  hands_off_to: ["executing-plans", "verification-before-completion"]
  context_preserved: ["task_context", "spec_artifact"]
```

- `receives_from` — skill names that pass context to this skill
- `hands_off_to` — skill names this skill should naturally route to next
- `context_preserved` — context key names that must survive the handoff boundary

#### `compositionRules` — execution policy

```yaml
compositionRules:
  canRunInParallel: false
  canChain: true
  executionPhase: "implementation"
  maxRetries: 3
```

- `canRunInParallel` — whether this skill is safe to run concurrently with others
- `canChain` — whether output feeds naturally into another skill's input
- `executionPhase` — one of: `pre-analysis`, `analysis`, `implementation`, `verification`, `post-process`
- `maxRetries` — bounded retry cap for self-healing flows (integer ≥ 0)

#### `version` — skill versioning

```yaml
version: "1.0.0"
```

Follows semantic versioning. Increment MINOR for new features; PATCH for fixes; MAJOR only for breaking changes. Profiles also support `deprecated: true`.

---

## Composition Cues

Use `hands_off_to` to drive skill chain suggestions in task prompts:

```
# Example: research-builder SKILL.md
handoff:
  receives_from: ["brainstorming", "innovation-migration-planner"]
  hands_off_to: ["executing-plans", "verification-before-completion"]
```

When an agent finishes with `research-builder`, it should announce: "Handing off to `executing-plans` — implementation plan is ready."

Use `executionPhase` to validate that skill chains respect natural workflow order:
- `pre-analysis` → `analysis` → `implementation` → `verification` → `post-process`

---

## Conflict Handling

Current known conflict pattern:
- `dev-browser` conflicts with `agent-browser` (pick one automation stack per run).

Conflict strategy:
1. Prefer profile defaults.
2. If equal priority, choose the lower-cost stack.
3. If still ambiguous, choose deterministic fallback and log reason.

## Recommended Chains

These chains use registered profile IDs only:

- **Debug chain**: `diagnostic-healing` → `review-cycle`
- **Feature chain**: `research-to-code` → `review-cycle`
- **Refactor chain**: `deep-refactoring` → `review-cycle`
- **Research chain**: `planning-cycle` → `research-to-code` → `review-cycle`

> All profile IDs above are defined in `registry.json`. If a chain reference is not a valid profile key, the composition is invalid.

## Acceptance Gate for New Skills

Any net-new skill added to the composition graph **must** pass the routing governance gates:

```bash
node scripts/run-skill-routing-gates.mjs --fixture scripts/evals/skill-routing-byzantine-fixtures.json
```

Quantitative requirements before acceptance:

| Metric | Requirement |
|--------|-------------|
| One-pass correctness | **+2pp** vs baseline (absolute) |
| Switch rate | **−20%** vs baseline (relative) |
| Ambiguity rate | Must not exceed `maxAmbiguityRate` in `scripts/skill-routing-thresholds.json` |
| Median routing latency | Must not exceed `maxMedianRoutingMs` threshold |

Skills that degrade any threshold are **rejected** regardless of qualitative benefit claims. Baseline metrics are tracked in `.sisyphus/evidence/skill-routing-governance/release-summary.md`.

## Operational Guardrails

- Cap retries for self-healing flows (use `compositionRules.maxRetries`).
- Keep one source of truth for dependency/conflict metadata (`registry.json`).
- Validate registry before using profile resolution.
- Run `scripts/run-skill-routing-gates.mjs` before merging skill changes.
- `hands_off_to` is advisory — agents may deviate with justification.
- Never add `hands_off_to` references to skills that are not in the registry.

## Troubleshooting

- **Unexpected conflict output**
  - Check `conflicts` in registry for both involved skills.

- **Wrong execution order**
  - Verify dependency direction; parent skill should depend on prerequisite skill.
  - Check `compositionRules.executionPhase` — skills should advance phase monotonically.

- **Profile too broad for a simple task**
  - Use recommendations and pick the smallest sufficient profile.

- **Handoff context lost between skills**
  - Check `context_preserved` in `handoff` for the source skill.
  - Ensure the receiving skill lists the context key in its `inputs`.
