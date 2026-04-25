# AGENTS.md

## OVERVIEW
Central configuration hub for agents, skills, models, commands, and learning updates. 453 files across 7 subdirectories.

## STRUCTURE
```
opencode-config/
├── agents/              # Canonical agent prompts (librarian.md)
├── skills/              # 77 skill directories (budget-aware-router, code-doctor, superpowers/*, etc.)
├── commands/            # Custom commands
├── models/              # Model configurations
├── learning-updates/    # Learning state and updates
├── docs/                # Configuration documentation
├── supermemory/         # SuperMemory integration
├── opencode.json        # Main config (116KB)
├── central-config.json # RL-governed config: soft/hard bounds + rl_allowed flags per field (749 lines)
├── oh-my-opencode.json  # Agent model overrides
└── compound-engineering.json  # Skills, commands, categories
```

## WHERE TO LOOK
| If you need... | Look in... |
|----------------|------------|
| Agent definitions | agents/ (librarian.md canonical prompt) |
| Skill definitions | skills/ (77 dirs, includes superpowers/ namespace) |
| Model config | models/, opencode.json |
| Learning updates | learning-updates/ |
| Main config | opencode.json (116KB) |
| Agent overrides | oh-my-opencode.json |

## CONVENTIONS
- **Config Fragmentation**: 6+ config files with different purposes (see Config Loading Map below)
- **Large Main Config**: opencode.json is 632 lines (plugins, models, providers, MCPs)
- **Schema Validation**: central-config.json has soft/hard bounds + RL governance per field
- **Skill Hierarchy**: skills/superpowers/* for advanced patterns
- **Learning Governance**: learning-updates/ tracks all governed changes

## ANTI-PATTERNS
None specific to config

## UNIQUE STYLES
- **Multi-File Config**: opencode.json (main), central-config.json (RL governance), oh-my-opencode.json (agent overrides), compound-engineering.json (skills/commands)
- **77 Skill Dirs**: broad on-disk skill catalog including superpowers/ namespace and domain skills
- **1 Agent prompt on disk**: `agents/librarian.md` is retained as canonical governed deliverable
- **Learning Updates**: Governed file changes tracked in learning-updates/

## CONFIG LOADING MAP
Each config is loaded by a specific system. They are NOT redundant — they serve different layers.

| Config File | Loaded By | Purpose |
|-------------|-----------|---------|
| `opencode.json` | OpenCode CLI (runtime, `~/.config/opencode/`) | Plugins, models, providers, agent prompts, MCPs, permissions |
| `oh-my-opencode.json` | oh-my-opencode plugin (external) | Named-agent model overrides, MCP toggles, category routing |
| `compound-engineering.json` | superpowers plugin (external) | Skills registry, command definitions, category groupings |
| `config.yaml` | OpenCode user-level (`~/.opencode/config.yaml`) | Global rules, delegation standards, coordination protocols, dev standards |
| `central-config.json` | `opencode-config-loader` package (packages/) | RL-governed params: retry, fallback, batching, exploration (soft/hard bounds) |
| `.opencode.config.json` | `ConfigLoader` class in `opencode-config-loader` | Package-level tunables: bun heap, concurrency, batchSize, LRU, WAL, logging |
| `opencode-config-schema.json` | IDE (JSON Schema auto-discovery) | IDE autocomplete for `.opencode.config.json` fields |

**Config precedence** (highest → lowest):
1. Environment variables (`OPENCODE_*` prefix)
2. `.opencode.config.json` (project root, found by walking up directory tree)
3. `~/.opencode/config.json` (user-level)
4. Defaults (built into `ConfigLoader`)

**What is NOT loaded by packages/ code:**
- `opencode.json`, `oh-my-opencode.json`, `compound-engineering.json` are loaded by OpenCode CLI or external plugins at runtime — not by packages in this repo
- `opencode-config-loader` is a plugin library, not the canonical config system for the whole setup

**Schema URIs:**
- `opencode.json` → `https://opencode.ai/config.json`
- `oh-my-opencode.json` → `https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json`
- `.opencode.config.json` → no `$schema` (relative path breaks outside repo root; IDEs auto-discover via adjacent file)

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

## KNOWN ARCHITECTURAL CONSTRAINTS

### `local/` is gitignored
The `local/oh-my-opencode/` directory contains a development checkout of the oh-my-opencode plugin with hook telemetry (e.g., `src/plugin/tool-execute-after.ts`). Because `local/` is gitignored, changes there diverge from the npm-published plugin build. Consequences:

- **MCP telemetry params are shallow**: `tool-execute-after.ts` passes `params: {}` to `logInvocation()`. Richer param telemetry requires updating the oh-my-opencode npm plugin source directly, not this repo.
- **Hook drift**: Any local modifications to telemetry hooks, agent wiring, or MCP interception will not propagate to other machines via git. The governed fix path is to publish changes through the oh-my-opencode npm package.

### MCP → SkillRL affinity bridge
The `tool_affinities` field on skills (added in Wave 12) records which MCP tools co-occur with each skill. This data flows from `tool-usage-tracker.getSessionMcpInvocations()` through `IntegrationLayer.executeTaskWithEvidence()` into `SkillRLManager.learnFromOutcome()`. The bridge is fail-open — if the learning-engine package is unavailable, affinity tracking silently degrades.

### Runtime telemetry hook
The learning-engine's `tool-usage-tracker.js` only runs in-process during `bun test`. At runtime, opencode loads plugins from bun's npm cache — our `packages/` code is not on the runtime load path. To bridge this gap, `scripts/runtime-tool-telemetry.mjs` is registered as a PostToolUse hook in `~/.claude/settings.json`. The oh-my-opencode plugin fires `tool.execute.after` after every tool call, which invokes the script via stdin JSON. The script reverse-maps PascalCase tool names back to snake_case keys, then appends to `~/.opencode/tool-usage/invocations.json` in the same format as `logInvocation()`.

- **Hook config**: `~/.claude/settings.json` → `hooks.PostToolUse[0].hooks[0].command`
- **Script**: `scripts/runtime-tool-telemetry.mjs` (ESM, standalone, no dependencies)
- **Data flow**: oh-my-opencode PostToolUse → stdin JSON → pascalToSnake() → invocations.json
- **Silent exit**: The script exits 0 with no stdout (= "allow" decision for PostToolUse pipeline)

## COMMANDS
| Command | Purpose |
|---------|---------|
| bun run governance:check | Validate config coherence and learning updates |
| scripts/validate-config-coherence.mjs | Check config file consistency |
| scripts/consolidate-skills.mjs | Consolidate skill definitions |
