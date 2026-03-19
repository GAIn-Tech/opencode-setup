# Registry Validation - 2026-03-19

Scope: Prompt 6 registry integrity audit across `opencode-config/skills/registry.json`, `opencode-config/skills/registry.schema.json`, `opencode-config/tool-tiers.json`, `opencode-config/compound-engineering.json`, and skill implementations under `opencode-config/skills/**/SKILL.md`.

## Integrity Issues

| Registry Entry | Status | Issue Type | Location |
|---|---|---|---|
| `learning-engine` -> `dependencies["opencode-tool-usage-tracker"]` | FAIL | A (broken reference) | `opencode-config/skills/registry.json:3895` |
| `beads` -> `synergies["file-todos"]` | FAIL | A (broken reference) | `opencode-config/skills/registry.json:4190` |
| `source` enum vs live registry values (`plugin`, `antigravity`) | FAIL | A (schema/reference drift) | `opencode-config/skills/registry.schema.json:28`, `opencode-config/skills/registry.json:52`, `opencode-config/skills/registry.json:1384` |

## Severity Ranking

- **A (broken reference): 3**
- **B (phantom): 0**
- **C (duplicate): 0**

## Trigger Pattern Validation

- Tier 1 routing regex patterns in `opencode-config/tool-tiers.json` compile successfully both per-pattern and category-joined (`new RegExp(config.patterns.join('|'), 'i')` behavior in `packages/opencode-plugin-preload-skills/src/tier-resolver.js:73`).
- No syntactically invalid trigger patterns found.
- Registry trigger arrays exist for all 107 registry entries; no empty-trigger registry entries found.

## Cross-Reference Results

- **Total registry entries:** 107
- **Implemented skill definitions found (`SKILL.md`, normalized superpowers names):** 88
- **Missing registry entries (implemented but not registered):** 0
- **Phantom registry entries (registered but no implementation):** 0
- **Duplicate registrations:** 0

Notes:
- Superpowers are implemented under `opencode-config/skills/superpowers/*/SKILL.md` and normalize to flat names (for example `writing-plans`) during skill discovery.
- Builtin/package-backed entries (for example `learning-engine`, `model-router-x`, `tool-usage-tracker`) were validated against workspace package/plugin presence.

## Recommended Cleanup Actions

1. Fix reference consistency in registry metadata:
   - Change `learning-engine.dependencies` from `opencode-tool-usage-tracker` to `tool-usage-tracker` (or register/package-map dependency names explicitly and document that convention).
   - Replace or register `file-todos` if it is intended to be a real skill synergy.
2. Resolve schema drift:
   - Extend `source` enum in `registry.schema.json` to include current values (`plugin`, `antigravity`) or normalize registry sources to schema-supported values.
3. Add a CI guard:
   - Validate all `dependencies`/`synergies`/`conflicts`/profile/category refs against `registry.skills` (with explicit allowlist for non-skill package IDs if desired).
