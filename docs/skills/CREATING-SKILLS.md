# Creating Skills

Use this guide when adding or updating skills under `opencode-config/skills/`.

## Authoring Checklist

1. Copy `opencode-config/skills/SKILL-TEMPLATE.md`.
2. Fill YAML frontmatter:
   - `name`, `description`, `version`, `category`, `tags`
   - `dependencies`, `synergies`, `conflicts`
   - `inputs`, `outputs`
3. Write clear `When to Use` and `Must NOT Do` sections.
4. Define a strict output contract.
5. Add quick-start examples.

## Registry Updates

Every new skill must be added to `opencode-config/skills/registry.json` with:
- description/category/source
- dependencies/synergies/conflicts
- triggers

Run validation:

```bash
node scripts/skill-profile-loader.mjs validate
```

## Profile Wiring

If the skill should be used in common flows:
- Add it to one or more `profiles` entries in `registry.json`.
- Ensure dependency order and conflict assumptions are explicit.

## Example: Add a New Skill

```bash
# 1) Create folder and SKILL.md
mkdir -p opencode-config/skills/my-skill

# 2) Update registry
# add opencode-config/skills/registry.json entry for "my-skill"

# 3) Validate
node scripts/skill-profile-loader.mjs validate
```

## Troubleshooting

- **Unknown dependency**
  - Add dependency skill to registry, or remove invalid reference.

- **Cyclic dependency error**
  - Break cycle by moving shared setup into one common dependency skill.

- **Profile references unknown skill**
  - Ensure skill key in `profiles[*].skills` exactly matches registry skill key.
