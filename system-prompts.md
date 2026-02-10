# System Prompts and Instructions

This document describes where system prompts and instructions are defined in the OpenCode setup.

## Global Instructions

### ~/.claude/CLAUDE.md
Location of global instructions that apply to ALL Claude sessions.

**Current content:**
```markdown
- dont ever burn tokens on documentstion writing unless specifically asked to - nebver produce md files or any form of docuemntation, summary or anbalysis unless explicitly directed to do so
```

**Purpose**: Short, persistent instructions that modify Claude's behavior globally.

## Project-Level Instructions

### <project>/CLAUDE.md
Location of project-specific instructions.

**Example (SPARC Development Environment):**
- See: `project-templates/work-CLAUDE.md`
- Contains project methodology, agent lists, MCP tool categories
- Defines execution flow and coordination protocols

**Purpose**: Guide Claude's behavior for specific project context.

## Plugin System Prompts

### oh-my-claudecode

**Main instruction file:**
- `plugins/oh-my-claudecode/CLAUDE.md`
- 531 lines of orchestration instructions
- Defines delegation-first philosophy
- Execution modes (autopilot, ralph, ultrawork, etc.)
- Agent selection and model routing

**Key sections:**
1. Core Protocol (delegation rules)
2. User Experience (autopilot, magic keywords)
3. Complete Reference (skills, agents, modes)
4. Shared Documentation (tiers, hierarchy, verification)
5. Internal Protocols (planning, parallelization, persistence)
6. Announcements
7. Setup

**Architecture documentation:**
- `plugins/oh-my-claudecode/AGENTS.md`
- Project structure, file relationships
- Agent summary (32 agents)
- Skill system (37 skills)
- Hook system (31 hooks)

### Agent Prompts

**Location**: `~/.claude/plugins/marketplaces/omc/agents/`

Each agent has its own markdown prompt file:
- `architect.md`, `architect-low.md`, `architect-medium.md`
- `executor.md`, `executor-low.md`, `executor-high.md`
- `designer.md`, `researcher.md`, `explore.md`
- etc. (32 total agent files)

**Template system:**
- `agents/templates/base-agent.md` - Base template
- `agents/templates/tier-instructions.md` - Tier-specific instructions

### Skill Prompts

**Location**: `~/.claude/plugins/marketplaces/omc/skills/*/SKILL.md`

Each skill directory contains:
- `SKILL.md` - Skill prompt and instructions
- Supporting files

**Examples:**
- `skills/autopilot/SKILL.md`
- `skills/ralph/SKILL.md`
- `skills/ultrawork/SKILL.md`
- `skills/frontend-ui-ux/SKILL.md`
- `skills/git-master/SKILL.md`
- etc. (37 skills total)

### Command Definitions

**Location**: `~/.claude/plugins/marketplaces/omc/commands/*.md`

Slash command definitions that mirror skills:
- `autopilot.md`
- `ralph.md`
- `ultrawork.md`
- etc. (31 command files)

## Plugin-Specific Instructions

### compound-engineering
- Focus on AI-powered development tools
- 28 agents for code review, research, design
- Context7 MCP integration for documentation

### superpowers
- Core skills library
- TDD, debugging, collaboration patterns
- Proven techniques and workflows

### elements-of-style
- Writing guidance
- Based on William Strunk Jr.'s work
- Grammar, composition, clarity

### superpowers-chrome
- Browser automation via DevTools Protocol
- 17 CLI commands
- Single `use_browser` MCP tool

### claude-mem
- Persistent memory system
- Cross-session context preservation
- Memory search and retrieval

## Hook System

**Location**: `~/.claude/plugins/marketplaces/omc/src/hooks/`

Hooks inject context via `<system-reminder>` tags at specific events:
- `SessionStart` - Priority context, mode restoration
- `UserPromptSubmit` - Magic keyword detection
- `PreToolUse:{Tool}` - Guidance, warnings
- `PostToolUse:{Tool}` - Delegation audit
- `Stop` - Continuation prompts
- `SubagentStart/Stop` - Agent tracking

**Key hooks:**
- `autopilot/` - Autonomous execution
- `ralph/` - Persistence mode
- `ultrawork/` - Parallel execution
- `learner/` - Skill extraction
- `recovery/` - Error recovery
- `rules-injector/` - Rule file injection
- `think-mode/` - Enhanced reasoning

## Prompt Hierarchy

From most specific to most general:

1. **Hook injections** - Runtime context via system reminders
2. **Skill prompts** - Activated when skill is invoked
3. **Agent prompts** - Subagent-specific instructions
4. **Project CLAUDE.md** - Project-specific rules
5. **Plugin CLAUDE.md** - Plugin orchestration rules
6. **Global CLAUDE.md** - Universal instructions
7. **Base system prompt** - Claude's core instructions (built-in)

## Template System

### Rule Templates

**Location**: `~/.claude/plugins/marketplaces/omc/templates/rules/`

Optional rule files that can be injected:
- `coding-style.md` - Code style conventions
- `testing.md` - Testing standards
- `security.md` - Security requirements
- `performance.md` - Performance guidelines
- `git-workflow.md` - Git conventions

**Usage**: Create in project root to auto-inject during sessions.

## Customization Guide

### To modify global behavior:
1. Edit `~/.claude/CLAUDE.md`
2. Keep it short and directive

### To modify project behavior:
1. Create/edit `<project>/CLAUDE.md`
2. Define project-specific patterns and requirements

### To modify oh-my-claudecode:
1. Edit `~/.claude/plugins/marketplaces/omc/docs/CLAUDE.md`
2. Changes affect all projects using OMC

### To modify agent behavior:
1. Edit `~/.claude/plugins/marketplaces/omc/agents/<agent-name>.md`
2. Affects that specific agent across all invocations

### To create custom skills:
1. Create new directory: `~/.claude/plugins/marketplaces/omc/skills/<skill-name>/`
2. Add `SKILL.md` with skill prompt
3. Create matching command file: `commands/<skill-name>.md`
4. Register in skills index

## Best Practices

1. **Keep global prompts minimal** - Only universal rules
2. **Use project CLAUDE.md for context** - Project-specific patterns
3. **Leverage skills for behaviors** - Reusable workflows
4. **Use hooks for automation** - Event-driven enhancements
5. **Document agent responsibilities** - Clear delegation patterns

## Version Control

**What to commit:**
- ✅ Project CLAUDE.md
- ✅ Custom rule templates
- ✅ Project-specific skills

**What NOT to commit:**
- ❌ Global ~/.claude/CLAUDE.md (machine-specific)
- ❌ Plugin source (managed by Claude CLI)
- ❌ .credentials.json (machine-specific OAuth)

## Resources

- **oh-my-claudecode docs**: https://github.com/Yeachan-Heo/oh-my-claudecode
- **Agent templates**: `omc/agents/templates/`
- **Skill examples**: `omc/skills/`
- **Hook system**: `omc/src/hooks/`
