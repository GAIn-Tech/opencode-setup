# System Prompts and Configuration Hierarchy

How system prompts, instructions, and configuration cascade in the OpenCode setup.

## Configuration Hierarchy (highest to lowest precedence)

```
1. Hook injections          → Runtime context via <system-reminder> tags
2. Skill prompts            → Activated when skill is invoked (SKILL.md)
3. Agent prompts            → Subagent-specific instructions (agents/*.md)
4. Project .opencode.yaml   → Project-specific rules and overrides
5. oh-my-opencode.json      → Agent model overrides, MCP toggles
6. opencode.json            → Main config (models, plugins, MCPs)
7. config.yaml              → Global rules, delegation standards
8. global-rules/*.mdc       → Always-on rules (delegation, coordination, dev standards)
```

## Global Configuration

### ~/.opencode/config.yaml
Global rules and delegation standards applied to ALL sessions.

**Key sections:**
- `delegation.complexity_mapping` — 7-tier model routing (free → thinking)
- `global_rules.always_apply` — model-delegation-standards, coordination-protocol, development-standards
- `profiles` — Pre-configured settings for web_app, ml_system, api_service, cli_tool, library

### ~/.opencode/global-rules/*.mdc
Rule files automatically injected into every session:
- `model-delegation-standards.mdc` — Which model for which complexity
- `coordination-protocol.mdc` — Multi-agent communication format
- `development-standards.mdc` — Code quality gates, testing, git conventions

## Main Config

### ~/.config/opencode/opencode.json
The primary configuration file containing:

- **`model`** — Default model (`google/antigravity-gemini-3-pro`)
- **`plugin`** — Array of 8 npm plugin packages
- **`provider.google`** — npm package (`@ai-sdk/google`) + 7 model definitions with context limits, modalities, and thinking variants
- **`mcp`** — 8 MCP server definitions (type, command, environment, enabled)
- **`command`** — 9 workflow commands (brainstorm, plan, work, review, compound, etc.)
- **`permission`** — All tools allowed (read, write, edit, bash, task, etc.)
- **`tools`** — All tools enabled

### ~/.config/opencode/antigravity.json
Multi-account rotation configuration:
- `account_selection_strategy`: `"hybrid"`
- `quota_fallback`: `true`
- `switch_on_first_rate_limit`: `true`
- `soft_quota_threshold_percent`: `90`

### ~/.config/opencode/oh-my-opencode.json
Agent orchestration and model overrides:
- 8 named agents with model assignments
- Pro models: atlas, metis, momus, oracle, sisyphus
- Flash models: hephaestus, librarian, prometheus
- 4 MCP server toggles (exa, context7, grep, websearch)

### ~/.config/opencode/compound-engineering.json
Skills, commands, and categories:
- 14 skills definitions
- 22 command definitions
- 6 task categories

## Agent Prompts

**Location**: `~/.config/opencode/agents/*.md` (29 files)

Each agent has a dedicated markdown prompt file defining its role, capabilities, and constraints:

### Review Agents
- `dhh-rails-reviewer.md` — Rails code review in DHH style
- `kieran-python-reviewer.md` — Python code review
- `kieran-rails-reviewer.md` — Rails code review
- `kieran-typescript-reviewer.md` — TypeScript code review
- `julik-frontend-races-reviewer.md` — Frontend race condition detection
- `code-simplicity-reviewer.md` — Complexity reduction
- `agent-native-reviewer.md` — Agent architecture review
- `design-implementation-reviewer.md` — Design pattern review

### Security & Performance
- `security-sentinel.md` — Security vulnerability detection
- `performance-oracle.md` — Performance optimization

### Research & Learning
- `best-practices-researcher.md` — Industry best practices
- `framework-docs-researcher.md` — Framework documentation
- `learnings-researcher.md` — Pattern extraction from sessions
- `repo-research-analyst.md` — Repository analysis
- `pattern-recognition-agent.md` — Cross-session pattern detection

### Data & Architecture
- `data-integrity-guardian.md` — Data validation
- `data-migration-expert.md` — Migration planning
- `schema-drift-detector.md` — Schema change detection
- `architecture-strategist.md` — System architecture

## Skill Prompts

**Location**: `~/.config/opencode/skills/*/SKILL.md` (46 files)

Each skill directory contains a `SKILL.md` defining specialized workflows:

### Core Workflow Skills
- `brainstorming/` — Feature exploration before planning
- `writing-plans/` — Implementation plan creation
- `executing-plans/` — Plan execution with checkpoints
- `test-driven-development/` — TDD workflow
- `systematic-debugging/` — Structured debugging
- `verification-before-completion/` — Evidence-based completion checks

### Agent Coordination Skills
- `dispatching-parallel-agents/` — Parallel task dispatch
- `orchestrating-swarms/` — Multi-agent swarm coordination
- `subagent-driven-development/` — Implementation via subagents
- `task-orchestrator/` — Dynamic workflow selection

### Development Skills
- `git-master/` — Git operations (commits, rebase, history)
- `git-worktree/` — Isolated parallel development
- `finishing-a-development-branch/` — Branch completion workflow
- `requesting-code-review/` — Pre-merge review
- `receiving-code-review/` — Review feedback handling
- `resolve_pr_parallel/` — Parallel PR comment resolution

### Specialized Skills
- `frontend-ui-ux/` — UI/UX design and implementation
- `frontend-design/` — Production-grade frontend interfaces
- `dhh-rails-style/` — Ruby/Rails in 37signals style
- `andrew-kane-gem-writer/` — Ruby gem authoring
- `dspy-ruby/` — LLM application development
- `gemini-imagegen/` — Image generation via Gemini API
- `agent-native-architecture/` — Agent-first app design
- `create-agent-skills/` — Skill authoring guidance

### Utility Skills
- `compound-docs/` — Solution documentation
- `document-review/` — Document refinement
- `every-style-editor/` — Copy editing
- `rclone/` — Cloud storage management
- `playwright/` — Browser automation
- `dev-browser/` — Persistent browser state
- `agent-browser/` — Vercel agent-browser CLI

## Workflow Commands

**Location**: Defined in `opencode.json` → `command` section (9 commands)

| Command | Purpose |
|---------|---------|
| `workflows:brainstorm` | Explore requirements through collaborative dialogue |
| `workflows:plan` | Transform feature descriptions into structured plans |
| `workflows:deepen-plan` | Enhance plans with parallel research agents |
| `workflows:work` | Execute work plans with quality gates |
| `workflows:review` | Multi-agent code review with worktrees |
| `workflows:compound` | Document solved problems for knowledge compounding |
| `workflows:resolve-todos` | Parallel TODO resolution |
| `workflows:feature-video` | Record feature walkthrough videos |
| `workflows:test-browser` | Browser tests on PR-affected pages |

## Customization Guide

### To modify global behavior:
Edit `~/.opencode/config.yaml` — delegation tiers, rules, profiles

### To add global rules:
Create `.mdc` files in `~/.opencode/global-rules/`

### To modify agent behavior:
Edit `~/.config/opencode/agents/<agent-name>.md`

### To modify model routing:
Edit `~/.config/opencode/oh-my-opencode.json` → `agents` section

### To create custom skills:
1. Create `~/.config/opencode/skills/<skill-name>/SKILL.md`
2. Skill auto-registers via oh-my-opencode

### To add workflow commands:
Add to `opencode.json` → `command` section with description and template
