# Complete Setup Instructions

## Prerequisites

- **Operating System**: Windows (with Git Bash) or Linux/macOS
- **Node.js**: v18+
- **npm**: Package manager for Node.js
- **Git**: Version control system
- **bun**: Required, version 1.2.23
- **uv/uvx**: Required for grep MCP server

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

# Supermemory relevance-focused memory behavior
cp opencode-config/supermemory.json ~/.config/opencode/supermemory.json

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
    "oh-my-opencode@3.5.2",
    "opencode-antigravity-auth@1.4.6",
    "opencode-supermemory@2.0.1",
    "@tarquinen/opencode-dcp@2.1.1",
    "cc-safety-net@0.7.1",
    "@azumag/opencode-rate-limit-fallback@1.67.0",
    "@mohak34/opencode-notifier@0.1.18",
    "opencode-plugin-langfuse@0.1.8",
    "opencode-plugin-preload-skills@1.8.0",
    "@symbioticsec/opencode-security-plugin@0.0.1-beta.9",
    "envsitter-guard@0.0.4",
    "opencode-antigravity-quota@0.1.6",
    "opencode-pty@0.2.1"
  ]
}
```

No manual installation needed — just have them listed in `opencode.json`.

## Step 5: MCP Servers

MCP servers are also defined in `opencode.json` under `"mcp"`. They connect automatically on startup:

| Server | Type | Requires |
|--------|------|----------|
| tavily | local | `TAVILY_API_KEY` env var |
| supermemory | remote | `SUPERMEMORY_API_KEY` env var |
| context7 | remote | Nothing (public) |
| playwright | local | Nothing |
| sequentialthinking | local | Nothing |
| websearch | local | Nothing |
| grep | local | `uvx` (install via `pip install uv`) |
| github | local | `GITHUB_TOKEN` env var |
| distill | local | Nothing |

### Supermemory Setup

1. Create account at https://supermemory.ai
2. Get your API bearer token
3. Export `SUPERMEMORY_API_KEY` and keep config as `Bearer {env:SUPERMEMORY_API_KEY}`

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

## Step 6b: Configure Rate-Limit Fallback Models (Required)

`@azumag/opencode-rate-limit-fallback` requires explicit model configuration.

Create `~/.config/opencode/rate-limit-fallback.json` (or copy `opencode-config/rate-limit-fallback.json`) so fallback works when providers are rate-limited.

Recommended order is Anthropic-first with Haiku included, then OpenAI, then Google/Antigravity and Kimi backups:

```json
{
  "fallbackModels": [
    { "providerID": "anthropic", "modelID": "claude-opus-4-6-thinking" },
    { "providerID": "anthropic", "modelID": "claude-opus-4-6" },
    { "providerID": "anthropic", "modelID": "claude-sonnet-4-5-thinking" },
    { "providerID": "anthropic", "modelID": "claude-sonnet-4-5" },
    { "providerID": "anthropic", "modelID": "claude-haiku-4-5" },
    { "providerID": "openai", "modelID": "gpt-5" },
    { "providerID": "openai", "modelID": "gpt-5-mini" },
    { "providerID": "google", "modelID": "antigravity-gemini-3-pro" },
    { "providerID": "google", "modelID": "antigravity-gemini-3-flash" },
    { "providerID": "moonshot", "modelID": "kimi-k2.5-free" },
    { "providerID": "google", "modelID": "gemini-2.5-flash" }
  ]
}
```

## Step 7: Verify Installation

```bash
# Start OpenCode
opencode

# Test with antigravity model
opencode run "ping" --model=google/antigravity-gemini-3-pro

# Check startup logs for:
#   - "oh-my-opencode loaded with 8 agents and 3 MCP toggles + Antigravity account rotation"
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
npx -y tavily-mcp@0.2.16  # Should start without errors

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
