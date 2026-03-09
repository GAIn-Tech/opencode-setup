# AGENTS.md

## OVERVIEW
Central configuration hub for agents, skills, models, commands, and learning updates. 259 files across 7 subdirectories.

## STRUCTURE
```
opencode-config/
├── agents/              # Empty (agents managed by oh-my-opencode plugin)
├── skills/              # 12 skill directories (budget-aware-router, code-doctor, superpowers/*, etc.)
├── commands/            # Custom commands
├── models/              # Model configurations
├── learning-updates/    # Learning state and updates
├── docs/                # Configuration documentation
├── supermemory/         # SuperMemory integration
├── opencode.json        # Main config (116KB)
├── central-config.json  # Schema-validated config (12KB)
├── oh-my-opencode.json  # Agent model overrides
└── compound-engineering.json  # Skills, commands, categories
```

## WHERE TO LOOK
| If you need... | Look in... |
|----------------|------------|
| Agent definitions | agents/ (empty, managed by oh-my-opencode plugin) |
| Skill definitions | skills/ (12 dirs, superpowers/ has 14 sub-skills) |
| Model config | models/, opencode.json |
| Learning updates | learning-updates/ |
| Main config | opencode.json (116KB) |
| Agent overrides | oh-my-opencode.json |

## CONVENTIONS
- **Config Fragmentation**: 6+ config files with different purposes
- **Large Main Config**: opencode.json is 116KB (comprehensive)
- **Schema Validation**: central-config.json has schema enforcement
- **Skill Hierarchy**: skills/superpowers/* for advanced patterns
- **Learning Governance**: learning-updates/ tracks all governed changes

## ANTI-PATTERNS
None specific to config

## UNIQUE STYLES
- **Multi-File Config**: opencode.json (main), central-config.json (schema), oh-my-opencode.json (overrides), compound-engineering.json (skills/commands)
- **12 Skill Dirs**: 11 standalone + superpowers/ (14 sub-skills) on disk
- **0 Agents on disk**: Agent definitions managed by oh-my-opencode plugin (8 agents)
- **Learning Updates**: Governed file changes tracked in learning-updates/

## CONTEXT MANAGEMENT (Wave 11)
Skills and configuration for context-aware token management:

| Skill/Config | Location | Purpose |
|--------------|----------|---------|
| context-governor SKILL.md | skills/context-governor/ | Enables Governor MCP with auto-recommendation triggers |
| dcp SKILL.md | skills/dcp/ | Dynamic Context Pruning skill for distill MCP integration |
| Context7 auto-recommend | opencode.json (librarian prompt) | Triggers Context7 lookups for unfamiliar library questions |
| Budget-aware routing | opencode.json (model-router config) | Penalizes expensive models when token budget >=80% |

### Related Packages
- `packages/opencode-context-governor/` — Governor: budget tracking, session management
- `packages/opencode-integration-layer/src/context-bridge.js` — ContextBridge: compression advisory
- `packages/opencode-model-manager/src/monitoring/` — Metrics + AlertManager for budget alerts

## COMMANDS
| Command | Purpose |
|---------|---------|
| bun run governance:check | Validate config coherence and learning updates |
| scripts/validate-config-coherence.mjs | Check config file consistency |
| scripts/consolidate-skills.mjs | Consolidate skill definitions |
