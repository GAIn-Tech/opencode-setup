# Complete Setup Instructions

## Prerequisites

1. **Windows** (with Git Bash) or **Linux/macOS**
2. **Node.js** v18+ and npm
3. **Git**
4. **bun** (optional, used by some plugins)
5. **uv/uvx** (needed for grep MCP server)

## Step 1: Install OpenCode CLI

```bash
npm install -g opencode

# Verify installation
opencode --version
```

## Step 2: Create Configuration Directories

```bash
mkdir -p ~/.config/opencode
mkdir -p ~/.opencode/global-rules
```

## Step 3: Copy Configuration Files

```bash
# Main OpenCode config (models, plugins, MCPs, permissions)
cp opencode-config/opencode.json ~/.config/opencode/opencode.json

# Antigravity account rotation
cp opencode-config/antigravity.json ~/.config/opencode/antigravity.json

# oh-my-opencode agent overrides
cp opencode-config/oh-my-opencode.json ~/.config/opencode/oh-my-opencode.json

# Compound engineering (skills, commands)
cp opencode-config/compound-engineering.json ~/.config/opencode/compound-engineering.json

# Global config (delegation standards, rules, profiles)
cp opencode-config/config.yaml ~/.opencode/config.yaml
```

### API Keys & Environment Variables

Add to your `~/.bashrc`, `~/.zshrc`, or Windows environment:

```bash
# Required for GitHub MCP server
export GITHUB_TOKEN="your-github-personal-access-token"

# Required for Tavily search
export TAVILY_API_KEY="your-tavily-api-key"
```

**DO NOT** copy `antigravity-accounts.json` from another machine — each machine needs its own OAuth tokens.

## Step 4: Plugins

Plugins are npm packages defined in `opencode.json` under `"plugin"`. They auto-install when OpenCode starts:

```json
{
  "plugin": [
    "oh-my-opencode@latest",
    "opencode-antigravity-auth@latest",
    "opencode-supermemory@latest",
    "@tarquinen/opencode-dcp@latest",
    "cc-safety-net@latest",
    "@azumag/opencode-rate-limit-fallback@latest",
    "@mohak34/opencode-notifier@latest",
    "opencode-plugin-langfuse@latest"
  ]
}
```

No manual installation needed — just have them listed in `opencode.json`.

## Step 5: MCP Servers

MCP servers are also defined in `opencode.json` under `"mcp"`. They connect automatically on startup:

| Server | Type | Requires |
|--------|------|----------|
| tavily | local | `TAVILY_API_KEY` env var |
| supermemory | remote | Bearer token in config |
| context7 | remote | Nothing (public) |
| playwright | local | Nothing |
| sequentialthinking | local | Nothing |
| websearch | local | Nothing |
| grep | local | `uvx` (install via `pip install uv`) |
| github | local | `GITHUB_TOKEN` env var |

### Supermemory Setup

1. Create account at https://supermemory.ai
2. Get your API bearer token
3. Update `opencode.json` → `mcp.supermemory.headers.Authorization`

## Step 6: Authenticate Antigravity Accounts

```bash
# Start OpenCode — antigravity plugin prompts for Google OAuth
opencode

# Follow the OAuth flow for each Google account you want to rotate
# Accounts stored in ~/.config/opencode/antigravity-accounts.json
```

Key `antigravity.json` settings:
- `account_selection_strategy`: `"hybrid"` — balances load across accounts
- `quota_fallback`: `true` — **CRITICAL** — enables fallback when quota exhausted
- `switch_on_first_rate_limit`: `true` — immediate switch on rate limit
- `soft_quota_threshold_percent`: `90` — switch before hitting hard limit

## Step 7: Verify Installation

```bash
# Start OpenCode
opencode

# Test with antigravity model
opencode run "ping" --model=google/antigravity-gemini-3-pro

# Check startup logs for:
#   - "oh-my-opencode loaded with 8 agents and 4 MCPs + Antigravity account rotation"
#   - MCP server connection confirmations
#   - Plugin load confirmations
```

## Step 8: Project-Level Configuration

For each project:

```bash
cp project-templates/project-config.yaml ~/your-project/.opencode.yaml
# Customize for your project
```

## Troubleshooting

### Plugin Issues
```bash
# Clear and reinstall
rm -rf ~/.config/opencode/node_modules
# Restart OpenCode — plugins will reinstall
```

### MCP Server Issues
```bash
# Test individual server
npx -y tavily-mcp@latest  # Should start without errors

# Check if uvx installed (needed for grep)
pip install uv

# Verify GitHub token
echo $GITHUB_TOKEN
```

### Antigravity Auth Issues
```bash
# Check account status
cat ~/.config/opencode/antigravity-accounts.json

# Re-authenticate: delete account entry, restart OpenCode
```

### Model Not Found
Ensure model is defined in `opencode.json` → `provider.google.models` and referenced as `google/model-name`.

## Resources

- **OpenCode**: https://opencode.ai
- **oh-my-opencode**: https://github.com/Yeachan-Heo/oh-my-opencode
- **antigravity-auth**: https://github.com/NoeFabris/opencode-antigravity-auth
- **supermemory**: https://supermemory.ai
- **compound-engineering**: https://github.com/EveryInc/compound-engineering-plugin
- **Tavily**: https://tavily.com
- **Context7**: https://context7.com
- **Playwright MCP**: https://github.com/microsoft/playwright-mcp
