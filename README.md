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

# 2. Run setup (installs and links all custom plugins)
bun run setup

# 3. Start OpenCode
opencode
```

### Manual Setup

1. **Install OpenCode**: `npm install -g opencode`
2. **Install Bun**: install Bun `1.2.23` (must match `.bun-version`)
3. **Clone this repo**: `git clone https://github.com/GAIn-Tech/opencode-setup.git`
4. **Run setup**: `cd opencode-setup && bun run setup`
5. **Authenticate accounts**: `opencode` → antigravity plugin handles OAuth

See [INSTALL.md](INSTALL.md) for detailed installation instructions.

## Dev Container (Optional)

If you use VS Code Dev Containers/Codespaces, a baseline config is available in `.devcontainer/devcontainer.json`.

- `postCreateCommand` runs `bun run setup`.
- `postStartCommand` runs `bun run verify` (non-strict env profile).
- Runtime secrets are passed from host env via `remoteEnv` (`GITHUB_TOKEN`, `TAVILY_API_KEY`, `SUPERMEMORY_API_KEY`).
- On Windows, keep dependencies on the named volume (`node_modules` mount) to avoid bind-mount performance issues.
- The container enforces LF line endings for workspace files.

## Current Stack

### Plugins
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

### MCP Servers
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

### Models
| Model | Provider | Use Case |
|-------|----------|----------|
| `kimi-k2.5-free` | Moonshot | Default / free-tier mechanical tasks |
| `gemini-2.5-flash` | Google | Trivial tasks, fast lookups |
| `antigravity-gemini-3-flash` | Antigravity | Routine dev work, exploration, research |
| `claude-sonnet-4-5` | Anthropic | Complex reasoning, multi-file refactors |
| `claude-sonnet-4-5-thinking` | Anthropic | Deep analysis, debugging, optimization |
| `claude-opus-4-6` | Anthropic | Architectural decisions, system design |
| `claude-opus-4-6-thinking` | Anthropic | Critical/high-stakes, security audits |

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
