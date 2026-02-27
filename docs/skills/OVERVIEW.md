# Skills Overview

This directory documents the cohesive skill ecosystem for OpenCode setup.

## Goals

- Keep skills composable and predictable.
- Make multi-skill workflows explicit and reusable.
- Reduce drift between skill files, registry metadata, and runtime usage.

## Core Building Blocks

1. **Skill contracts**
   - Every skill has a `SKILL.md` with metadata and handoff expectations.
2. **Registry**
   - `opencode-config/skills/registry.json` is the source of truth for skills, profiles, and categories.
3. **Profiles**
   - Profiles are curated skill chains for common task archetypes.
4. **Loader**
   - `scripts/skill-profile-loader.mjs` resolves dependencies, surfaces conflicts, and recommends profiles.

## Common Workflow

1. Describe the task.
2. Ask for profile recommendations.
3. Load selected profile.
4. Execute with resolved skills.
5. Verify and iterate.

## Canonical Ownership Rule

`opencode-config/skills/registry.json` is the **single source of truth** for all skill
metadata and the complete skill inventory.

**Consumer files** (such as `opencode-config/compound-engineering.json`) reference skills
by name but do not define them. Their `skills.enabled[]` arrays **must be a strict subset**
of `registry.json` skill keys.

| File | Role | Authoritative? |
|------|------|----------------|
| `opencode-config/skills/registry.json` | Canonical skill definitions, profiles, categories | **Yes** |
| `opencode-config/compound-engineering.json` | Consumer — lists enabled skills and commands | No |
| `opencode-config/oh-my-opencode.json` | Consumer — agent model overrides | No |

**Adding a new skill:**

1. Create the skill's `SKILL.md` in `opencode-config/skills/<name>/`.
2. Add the skill entry to `registry.json` with full metadata.
3. Run `node scripts/skill-profile-loader.mjs validate` — must pass.
4. Only then reference the skill in consumer configs (e.g. `compound-engineering.json`).
5. Run `node scripts/check-skill-consistency.mjs` — must pass.

**Invariant:** Any skill name referenced outside `registry.json` must already exist as a
key in `registry.json`. The consistency checker (`scripts/check-skill-consistency.mjs`)
enforces this and should be run in CI.

## Troubleshooting

- **Unknown skill in profile**
  - Run: `node scripts/skill-profile-loader.mjs validate`
  - Fix missing skill entry in `registry.json`.

- **Conflicts reported**
  - Example: `dev-browser` vs `agent-browser`.
  - Keep only one browser automation skill in the selected chain.

- **Recommendation quality is weak**
  - Add/adjust `triggers` in relevant skills and profiles.
