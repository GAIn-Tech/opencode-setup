# Complete Setup Instructions

## Prerequisites

1. **Windows with WSL** or **Linux/macOS**
2. **Node.js** v18+ and npm
3. **Git**

## Step 1: Install Claude Code CLI

```bash
# Follow official installation guide
# https://docs.anthropic.com/en/docs/build-with-claude/computer-use#getting-started

# Or use npm (if available)
npm install -g @anthropic-ai/claude-code-cli

# Verify installation
claude --version  # Should show 2.0.28 or later
```

## Step 2: Authenticate Claude

```bash
# Login to Claude
claude auth login

# This will open a browser for OAuth authentication
# Complete the authentication flow
```

## Step 3: Copy Configuration Files

### Global Claude Configuration

```bash
# Create .claude directory if it doesn't exist
mkdir -p ~/.claude

# Copy settings files
cp claude-config/settings.json ~/.claude/settings.json
cp claude-config/settings.local.json ~/.claude/settings.local.json
cp claude-config/global-CLAUDE.md ~/.claude/CLAUDE.md
```

### Credentials (IMPORTANT)

**DO NOT** copy the `.credentials.json` file from another machine. Each machine needs its own OAuth tokens.

```bash
# After running 'claude auth login', your credentials will be at:
# ~/.claude/.credentials.json
```

## Step 4: Install MCP Servers

```bash
# Run the MCP setup script
bash mcp-servers/mcp-setup-commands.sh

# Or manually add each server:
claude mcp add sequential-thinking npx -y @modelcontextprotocol/server-sequential-thinking
claude mcp add filesystem npx -y @modelcontextprotocol/server-filesystem ~/work
claude mcp add claude-flow npx claude-flow@alpha mcp start
claude mcp add ruv-swarm npx ruv-swarm@latest mcp start

# Optional (may require additional setup):
# claude mcp add github https://api.githubcopilot.com/mcp/
# claude mcp add postgres npx -y @modelcontextprotocol/server-postgres

# Verify MCP servers
claude mcp list
```

## Step 5: Install Plugin Marketplaces

```bash
# Install oh-my-claudecode marketplace
claude plugin marketplace add omc https://github.com/Yeachan-Heo/oh-my-claudecode.git

# Install superpowers marketplace
claude plugin marketplace add superpowers-marketplace github:obra/superpowers-marketplace

# Install compound-engineering marketplace
claude plugin marketplace add every-marketplace https://github.com/EveryInc/compound-engineering-plugin.git

# Install claude-mem marketplace
claude plugin marketplace add thedotmack github:thedotmack/claude-mem
```

## Step 6: Install Plugins

```bash
# oh-my-claudecode (multi-agent orchestration)
claude plugin install oh-my-claudecode@omc

# superpowers (core skills)
claude plugin install superpowers@superpowers-marketplace

# elements-of-style (writing)
claude plugin install elements-of-style@superpowers-marketplace

# superpowers-chrome (browser automation)
claude plugin install superpowers-chrome@superpowers-marketplace

# compound-engineering (AI development tools)
claude plugin install compound-engineering@every-marketplace

# claude-mem (persistent memory)
claude plugin install claude-mem@thedotmack

# Verify plugins
claude plugin list
```

## Step 7: Enable Plugins

Edit `~/.claude/settings.json` and ensure `enabledPlugins` section contains:

```json
{
  "enabledPlugins": {
    "superpowers@superpowers-marketplace": true,
    "elements-of-style@superpowers-marketplace": true,
    "superpowers-chrome@superpowers-marketplace": true,
    "compound-engineering@every-marketplace": true,
    "claude-mem@thedotmack": true,
    "oh-my-claudecode@omc": true
  }
}
```

## Step 8: Project-Level Configuration

For each project you work on:

```bash
# Copy project CLAUDE.md template
cp project-templates/work-CLAUDE.md ~/your-project/CLAUDE.md

# Edit as needed for your project
```

## Step 9: Configure oh-my-claudecode

```bash
# Start Claude in any directory
cd ~/your-project
claude

# In Claude chat, run setup:
/oh-my-claudecode:omc-setup

# Follow the interactive setup wizard
```

## Step 10: Verify Installation

```bash
# Start Claude
claude

# Test that everything is working:
# - Type: "/oh-my-claudecode:help"
# - Should see list of all OMC skills

# Check MCP servers
claude mcp list

# All should show "✓ Connected"
```

## Troubleshooting

### MCP Server Connection Issues

```bash
# Check debug logs
cat ~/.claude/debug/*.txt | grep ERROR

# Restart Claude
# Exit current session and restart
```

### Plugin Installation Issues

```bash
# Clear plugin cache
rm -rf ~/.claude/plugins/cache

# Reinstall plugins
claude plugin install [plugin-name]
```

### oh-my-claudecode Issues

```bash
# Run diagnostic
/oh-my-claudecode:doctor

# Repair HUD if needed
/oh-my-claudecode:hud setup
```

## Environment Variables

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

## Additional Resources

- **oh-my-claudecode**: https://github.com/Yeachan-Heo/oh-my-claudecode
- **superpowers**: https://github.com/obra/superpowers
- **compound-engineering**: https://github.com/EveryInc/compound-engineering-plugin
- **claude-mem**: https://github.com/thedotmack/claude-mem
- **Claude Flow**: https://github.com/ruvnet/claude-flow

## Notes

- The `.credentials.json` file is machine-specific and should NOT be copied
- MCP servers may need Node.js packages installed (handled automatically via npx)
- Some plugins may require additional dependencies (browser automation, database access, etc.)
- Always update to latest versions: `claude plugin update --all`
