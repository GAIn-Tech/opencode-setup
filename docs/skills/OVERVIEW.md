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

## Troubleshooting

- **Unknown skill in profile**
  - Run: `node scripts/skill-profile-loader.mjs validate`
  - Fix missing skill entry in `registry.json`.

- **Conflicts reported**
  - Example: `dev-browser` vs `agent-browser`.
  - Keep only one browser automation skill in the selected chain.

- **Recommendation quality is weak**
  - Add/adjust `triggers` in relevant skills and profiles.
