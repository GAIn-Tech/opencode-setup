# OpenCode Configuration Precedence

> Document explaining the relationship between configuration files in `opencode-config/`

## Config Files Overview

| File | Purpose | Priority |
|------|---------|----------|
| `opencode.json` | Main configuration (116KB) - all settings | 1 (highest) |
| `central-config.json` | Schema-validated config (12KB) | 2 |
| `oh-my-opencode.json` | Agent model overrides | 3 |
| `compound-engineering.json` | Skills, commands, categories | 4 |
| `central-config.schema.json` | JSON schema for validation | N/A (reference) |

## Precedence Order

When multiple configs define the same key, the order is:

1. **oh-my-opencode.json** - User/agent overrides (applied last)
2. **compound-engineering.json** - Active skills and commands
3. **central-config.json** - Validated core settings
4. **opencode.json** - Base configuration (fallback)

## Key Configurations

### Agents
- Defined in: `opencode.json` → `agents` section
- Overridden by: `oh-my-opencode.json` → `agents` section

### Skills
- Defined in: `opencode-config/skills/` (77 skill directories)
- Activated via: `compound-engineering.json` → `skills.enabled`

### Models
- Defined in: `opencode-config/models/`
- Referenced by: `opencode.json` → `models` section

### Learning
- Updates tracked in: `opencode-config/learning-updates/`
- Policy in: `learning-update-policy.json`

## Usage

```bash
# Validate config coherence
bun run governance:check

# Check specific config
cat opencode-config/central-config.json | jq '.agents'
```

## Adding New Config

1. Add to `opencode.json` for base settings
2. Add validation rule to `central-config.schema.json`
3. Document in this file