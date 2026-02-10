# OpenCode Complete Setup Guide

This directory contains all configuration files, plugins, skills, and system prompts needed to reproduce your OpenCode setup on another machine.

## Directory Structure

```
opencode-setup/
├── README.md (this file)
├── claude-config/
│   ├── settings.json
│   ├── settings.local.json
│   └── global-CLAUDE.md
├── mcp-servers/
│   ├── mcp-setup-commands.sh
│   └── server-list.md
├── plugins/
│   ├── oh-my-claudecode/
│   │   ├── plugin.json
│   │   ├── CLAUDE.md
│   │   ├── AGENTS.md
│   │   └── skills-list.md
│   ├── compound-engineering/
│   │   └── plugin.json
│   ├── superpowers/
│   │   └── plugin.json
│   ├── elements-of-style/
│   │   └── plugin.json
│   ├── superpowers-chrome/
│   │   └── plugin.json
│   └── claude-mem/
│       └── plugin.json
├── project-templates/
│   └── work-CLAUDE.md
└── setup-instructions.md
```

## Quick Start

1. **Install Claude Code CLI**: Follow https://docs.anthropic.com/en/docs/build-with-claude/computer-use#getting-started
2. **Run setup script**: `bash mcp-servers/mcp-setup-commands.sh`
3. **Install plugins**: Follow instructions in `setup-instructions.md`
4. **Copy configuration**: See `setup-instructions.md` for file placement

## Version Information

- **Claude Code CLI**: v2.0.28
- **oh-my-claudecode**: v3.10.3
- **superpowers**: v4.1.1
- **compound-engineering**: v2.28.0
- **elements-of-style**: v1.0.0
- **superpowers-chrome**: v1.3.0
- **claude-mem**: v9.0.12

## Key Features

### Enabled Plugins
- ✅ superpowers (core skills library)
- ✅ elements-of-style (writing guidance)
- ✅ superpowers-chrome (browser automation)
- ✅ compound-engineering (AI development tools)
- ✅ claude-mem (persistent memory)
- ✅ oh-my-claudecode (multi-agent orchestration)

### MCP Servers
- sequential-thinking
- filesystem
- claude-flow
- ruv-swarm
- github (configured but not connected)
- postgres (configured but not connected)
- context7 (via compound-engineering)
- chrome (via superpowers-chrome)
- mcp-search (via claude-mem)
- oh-my-claudecode MCP bridge

### Execution Modes
- **Autopilot**: Full autonomous execution
- **Ralph Loop**: Persistence until completion
- **Ultrawork**: Maximum parallel execution
- **Ecomode**: Token-efficient parallel execution
- **Ultrapilot**: Parallel autopilot
- **Swarm**: N coordinated agents
- **Pipeline**: Sequential agent chaining

## Setup on New Machine

See `setup-instructions.md` for detailed step-by-step instructions.

## Environment Variables

Your setup uses:
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`

## Permissions

See `claude-config/settings.local.json` for approved bash commands and web fetch domains.
