# Skill Composition

This document describes how to compose multiple skills safely.

## Composition Model

1. Start from a profile, not ad-hoc skills.
2. Resolve dependencies transitively.
3. Detect known conflicts.
4. Execute in resolved order.
5. Verify outputs before handing off.

## Handoff Contract

Each skill handoff should include:
- **inputs used**
- **assumptions made**
- **artifacts produced**
- **open risks**
- **next expected step**

## Conflict Handling

Current known conflict pattern:
- `dev-browser` conflicts with `agent-browser` (pick one automation stack per run).

Conflict strategy:
1. Prefer profile defaults.
2. If equal priority, choose the lower-cost stack.
3. If still ambiguous, choose deterministic fallback and log reason.

## Recommended Chains

- **Debug chain**: `diagnostic-healing` -> `review-cycle`
- **Feature chain**: `research-to-code` -> `review-cycle`
- **Refactor chain**: `deep-refactoring` -> `review-cycle`

## Operational Guardrails

- Cap retries for self-healing flows.
- Keep one source of truth for dependency/conflict metadata (`registry.json`).
- Validate registry before using profile resolution.

## Troubleshooting

- **Unexpected conflict output**
  - Check `conflicts` in registry for both involved skills.

- **Wrong execution order**
  - Verify dependency direction; parent skill should depend on prerequisite skill.

- **Profile too broad for a simple task**
  - Use recommendations and pick the smallest sufficient profile.
