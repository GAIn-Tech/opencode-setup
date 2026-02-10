# OpenCode Quick Reference

## Installation One-Liner

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code-cli

# Authenticate
claude auth login

# Setup MCP servers
bash mcp-servers/mcp-setup-commands.sh

# Install plugin marketplaces
claude plugin marketplace add omc https://github.com/Yeachan-Heo/oh-my-claudecode.git
claude plugin marketplace add superpowers-marketplace github:obra/superpowers-marketplace
claude plugin marketplace add every-marketplace https://github.com/EveryInc/compound-engineering-plugin.git
claude plugin marketplace add thedotmack github:thedotmack/claude-mem

# Install plugins
claude plugin install oh-my-claudecode@omc
claude plugin install superpowers@superpowers-marketplace
claude plugin install elements-of-style@superpowers-marketplace
claude plugin install superpowers-chrome@superpowers-marketplace
claude plugin install compound-engineering@every-marketplace
claude plugin install claude-mem@thedotmack
```

## Essential Commands

### MCP Servers
```bash
claude mcp list              # List all MCP servers
claude mcp add <name> <cmd>  # Add MCP server
claude mcp remove <name>     # Remove MCP server
```

### Plugins
```bash
claude plugin list           # List installed plugins
claude plugin install <name> # Install plugin
claude plugin update --all   # Update all plugins
claude plugin marketplace list # List marketplaces
```

### oh-my-claudecode Skills

```bash
# In Claude chat, use slash commands:
/oh-my-claudecode:help           # Show all skills
/oh-my-claudecode:omc-setup      # Configure OMC
/oh-my-claudecode:doctor         # Diagnose issues
/oh-my-claudecode:hud setup      # Install status line

# Magic keywords (no slash needed):
autopilot: build a todo app      # Full autonomous execution
ralph: refactor authentication   # Persistence mode
ulw fix all type errors          # Maximum parallelism
eco optimize performance         # Token-efficient mode
plan the new API                 # Planning interview
```

## Execution Modes Quick Guide

| Mode | Trigger | Best For |
|------|---------|----------|
| **autopilot** | "autopilot", "build me" | Full project from idea to tests |
| **ralph** | "ralph", "don't stop" | Must complete tasks, no matter what |
| **ultrawork** | "ulw", "ultrawork" | Fast parallel execution |
| **ecomode** | "eco", "budget" | Save tokens, efficient execution |
| **ultrapilot** | "ultrapilot" | Parallel autopilot (3-5x faster) |
| **swarm** | "swarm N agents" | N coordinated agents |
| **pipeline** | "pipeline" | Sequential agent chain |

## Agent Quick Reference

### When to Delegate

| Need | Agent | Model |
|------|-------|-------|
| Fix code | executor / executor-low | sonnet / haiku |
| Debug complex issue | architect | opus |
| Search codebase | explore / explore-medium | haiku / sonnet |
| UI/frontend | designer | sonnet |
| Research library | researcher | sonnet |
| Security review | security-reviewer | opus |
| Code review | code-reviewer | opus |
| Fix build errors | build-fixer | sonnet |
| TDD workflow | tdd-guide | sonnet |

### Delegation Example

```javascript
Task(subagent_type="oh-my-claudecode:executor",
     model="sonnet",
     prompt="Add input validation to the login form...")
```

## File Organization

```
~/.claude/
├── CLAUDE.md              # Global instructions
├── settings.json          # Main settings
├── settings.local.json    # Permissions
├── .credentials.json      # OAuth tokens (DO NOT COPY)
└── plugins/
    ├── config.json
    ├── installed_plugins.json
    ├── known_marketplaces.json
    ├── cache/             # Plugin installations
    └── marketplaces/      # Plugin sources

<project>/
└── CLAUDE.md              # Project instructions
```

## MCP Servers

| Server | Purpose | Command |
|--------|---------|---------|
| sequential-thinking | Enhanced reasoning | `npx -y @modelcontextprotocol/server-sequential-thinking` |
| filesystem | File access | `npx -y @modelcontextprotocol/server-filesystem ~/work` |
| claude-flow | SPARC/swarm | `npx claude-flow@alpha mcp start` |
| ruv-swarm | Coordination | `npx ruv-swarm@latest mcp start` |
| context7 | Documentation | (via compound-engineering plugin) |
| chrome | Browser | (via superpowers-chrome plugin) |
| mcp-search | Memory | (via claude-mem plugin) |

## Common Issues & Solutions

### MCP Server Not Connected
```bash
# Check debug logs
cat ~/.claude/debug/*.txt | grep ERROR

# Remove and re-add
claude mcp remove <server-name>
claude mcp add <server-name> <command>

# Restart Claude
```

### Plugin Not Working
```bash
# Verify installation
claude plugin list

# Reinstall
claude plugin uninstall <plugin-name>
claude plugin install <plugin-name>

# Clear cache
rm -rf ~/.claude/plugins/cache/<plugin-name>
```

### oh-my-claudecode Issues
```bash
# Run diagnostics
/oh-my-claudecode:doctor

# Reconfigure
/oh-my-claudecode:omc-setup

# Check state files
ls -la .omc/state/
```

### Can't Stop Execution Mode
```bash
# Force cancel
/oh-my-claudecode:cancel --force

# Manually clear state
rm -rf .omc/state/*.json
```

## Environment Variables

```bash
# Add to ~/.bashrc or ~/.zshrc
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# Optional: Set default execution mode
# (or use /oh-my-claudecode:omc-setup)
echo '{"defaultExecutionMode":"ultrawork"}' > ~/.claude/.omc-config.json
```

## Key Concepts

### Delegation-First
- **Always delegate** substantive work to specialized agents
- **Never code directly** - use executor agent
- **Always verify** - use architect agent after completion

### Magic Keywords
- Autopilot activates automatically on "build me", "I want a"
- Ralph activates on "don't stop", "must complete"
- Ultrawork activates on "ulw", "fast parallel"
- Ecomode activates on "eco", "budget", "efficient"

### Hooks
- Automatic context injection via `<system-reminder>` tags
- Can't be invoked directly - they fire on events
- Control execution modes (autopilot, ralph, ultrawork)
- Block premature stopping - use `/cancel` to exit cleanly

### Session Continuity
- Use `session_id` parameter when resuming subagent work
- Preserves full context, saves tokens
- Critical for follow-up tasks

## Performance Tips

1. **Use LOW tier agents** for simple tasks (Haiku models)
2. **Parallel execution** for independent tasks
3. **Background tasks** (`run_in_background: true`) for long operations
4. **Ecomode** for token-efficient execution
5. **Session continuity** to avoid redundant context loading

## Resources

- **Claude Code Docs**: https://docs.anthropic.com/claude/docs/claude-code
- **oh-my-claudecode**: https://github.com/Yeachan-Heo/oh-my-claudecode
- **superpowers**: https://github.com/obra/superpowers
- **compound-engineering**: https://github.com/EveryInc/compound-engineering-plugin
- **claude-mem**: https://github.com/thedotmack/claude-mem
- **Claude Flow**: https://github.com/ruvnet/claude-flow

## Version Info

- Claude Code CLI: v2.0.28
- oh-my-claudecode: v3.10.3
- superpowers: v4.1.1
- compound-engineering: v2.28.0
- elements-of-style: v1.0.0
- superpowers-chrome: v1.3.0
- claude-mem: v9.0.12
