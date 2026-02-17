# OpenCode Complete Setup Guide

Configuration files, plugins, MCP servers, and system prompts to reproduce the full OpenCode setup on any machine.

## Directory Structure

```
opencode-setup/
├── README.md                    (this file)
├── opencode-config/
│   ├── opencode.json            (main config — models, plugins, MCPs, permissions)
│   ├── antigravity.json         (multi-account rotation config)
│   ├── oh-my-opencode.json      (agent orchestration & model overrides)
│   ├── compound-engineering.json (skills, commands, categories)
│   └── config.yaml              (global rules, delegation standards, profiles)
├── mcp-servers/
│   ├── server-list.md
│   └── mcp-reference.sh
├── plugins/
│   ├── oh-my-opencode/          (multi-agent orchestration)
│   ├── antigravity-auth/        (Google account rotation)
│   ├── opencode-dcp/            (dynamic context pruning)
│   ├── safety-net/              (destructive command blocking)
│   ├── rate-limit-fallback/     (auto model fallback on rate limit)
│   ├── notifier/                (OS notifications)
│   ├── langfuse/                (LLM observability & tracing)
│   ├── compound-engineering/    (AI dev tools & workflows)
│   ├── preload-skills/          (contextual skill loading)
│   ├── security-plugin/         (security guardrails & vuln scanning)
│   ├── token-monitor/           (token usage analytics)
│   └── envsitter-guard/         (secrets protection)
├── project-templates/
│   └── project-config.yaml
├── setup-instructions.md
├── system-prompts.md
├── QUICK-REFERENCE.md
├── agents-list.md
└── export-checklist.md
```

## Quick Start

### Automated Setup (Recommended)

```bash
# 1. Clone this repo
git clone https://github.com/GAIn-Tech/opencode-setup.git
cd opencode-setup

# 2. Run the setup script (installs and links all custom plugins)
./setup.sh

# 3. Start OpenCode
opencode
```

### Manual Setup

1. **Install OpenCode**: `npm install -g opencode-ai`
2. **Install Bun**: `npm install -g bun`
3. **Clone this repo**: `git clone https://github.com/GAIn-Tech/opencode-setup.git`
4. **Run setup script**: `cd opencode-setup && ./setup.sh`
5. **Authenticate accounts**: `opencode` → antigravity plugin handles OAuth

See [INSTALL.md](INSTALL.md) for detailed installation instructions.

## Current Stack

### Plugins (12)
| Plugin | Purpose |
|--------|---------|
| `oh-my-opencode@latest` | Multi-agent orchestration (8 named agents, 46 skills, 22 commands) |
| `opencode-antigravity-auth@latest` | Google account rotation (3 accounts, hybrid strategy) |
| `opencode-supermemory@latest` | Persistent cross-session memory |
| `@tarquinen/opencode-dcp@latest` | Dynamic context pruning — reduces token usage |
| `cc-safety-net@latest` | Blocks destructive git/filesystem commands |
| `@azumag/opencode-rate-limit-fallback@latest` | Auto-switches models on rate limit |
| `@mohak34/opencode-notifier@latest` | OS notifications for task completion/errors |
| `opencode-plugin-langfuse@latest` | LLM tracing, prompt versioning, cost tracking |
| `opencode-plugin-preload-skills@latest` | Contextual skill loading — only loads relevant skills per task |
| `@symbioticsec/opencode-security-plugin@latest` | Security guardrails & vulnerability scanning |
| `envsitter-guard@latest` | Prevents reading .env files — secrets protection |
| `opencode-antigravity-quota@latest` | Antigravity quota visibility |
| `opencode-pty@latest` | Interactive/background process control |

### MCP Servers (9)
| Server | Type | Purpose |
|--------|------|---------|
| `tavily` | local | Web search, extraction, crawling, research |
| `supermemory` | remote | Persistent memory across sessions |
| `context7` | remote | Up-to-date library documentation |
| `playwright` | local | Browser automation & testing |
| `sequentialthinking` | local | Enhanced step-by-step reasoning |
| `websearch` | local | Web search (backup) |
| `grep` | local | Code search across GitHub repos |
| `github` | local | GitHub API (issues, PRs, repos) |
| `distill` | local | AST-based intelligent context compression (50-70% token savings) |

### Models (Current Stack)
| Model | Provider | Status |
|-------|----------|--------|
| `kimi-k2.5-free` | Moonshot | Default / free-tier |
| `gemini-3-flash` | Google | Active - Current budget model |
| `antigravity-gemini-3-flash` | Antigravity | Active - Multi-account rotation |
| `claude-sonnet-4-5` | Anthropic | Active |
| `claude-sonnet-4-5-thinking` | Anthropic | Active - Deep reasoning |
| `claude-opus-4-6` | Anthropic | Active - Frontier |
| `claude-opus-4-6-thinking` | Anthropic | Active - Max reasoning |

### Execution Modes
- **Ralph Loop**: Persistence until completion
- **Ultrawork Loop**: Maximum parallel execution
- **Background tasks**: Async subagent dispatch
- **Swarm**: Coordinated multi-agent execution
- **Pipeline**: Sequential agent chaining

## Key File Locations

| File | Location | Purpose |
|------|----------|---------|
| `opencode.json` | `~/.config/opencode/` | Main config (models, plugins, MCPs) |
| `antigravity.json` | `~/.config/opencode/` | Account rotation settings |
| `oh-my-opencode.json` | `~/.config/opencode/` | Agent model overrides |
| `compound-engineering.json` | `~/.config/opencode/` | Skills, commands, categories |
| `config.yaml` | `~/.opencode/` | Global rules & delegation standards |
| `global-rules/*.mdc` | `~/.opencode/` | Model delegation, coordination, dev standards |
| `agents/*.md` | `~/.config/opencode/` | 29 specialized agent definitions |
| `skills/*/SKILL.md` | `~/.config/opencode/` | 46 skill definitions |

## Setup on New Machine

See `setup-instructions.md` for detailed step-by-step instructions.

## Updating from Remote

If your local machine is behind the remote and you need to sync up:

```bash
# 1. Stash any local changes you want to keep
git stash

# 2. Pull latest from remote (using rebase to keep history clean)
git fetch origin
git rebase origin/main

# 3. Restore your local changes if any
git stash pop
```

### After Pulling (Critical)

**Always run the setup script again** to ensure all package links and dependencies are updated:

```bash
# Run from the opencode-setup directory
cd opencode-setup

# Re-run setup to reinstall/relink all plugins and dependencies
./setup.sh

# Or manually if needed:
npm install
cd packages/* && npm link  # Re-link each custom plugin
```

### What the Setup Script Does

The `setup.sh` script performs these critical tasks:
1. Installs root dependencies (`npm install`)
2. Links all custom plugins (`npm link` in each package)
3. Copies config files to `~/.config/opencode/` if needed
4. Ensures all package dependencies are installed

### Troubleshooting After Update

If you experience issues after pulling:

```bash
# Clear node_modules and reinstall from scratch
rm -rf node_modules
rm -rf packages/*/node_modules
npm install

# Re-run setup
./setup.sh

# If crashes persist, check the crash guard is initialized
# (should see "[WorkflowExecutor] Crash guard initialized" in logs)
```

### Verifying Crash Guards Active

After updating, verify crash guards are working:

```bash
# Run a simple workflow and check logs for:
# - "[WorkflowExecutor] Crash guard initialized"
# - "[CrashRecovery] Initialized"
# - "[MemoryGuard] Starting memory monitoring"
```
