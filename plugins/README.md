# Plugins

External OpenCode plugins installed via npm. These are **not** workspace packages — they are npm-distributed and configured separately.

## Architecture

Each subdirectory contains an `info.md` describing the plugin, its npm package name, source repository, and configuration. The actual plugin code is installed globally or locally via npm/bun — these directories only hold metadata and documentation.

## Setup on New Machine

```bash
# Install all plugins (run from repo root)
bun install -g oh-my-opencode@latest
bun install -g opencode-antigravity-auth@latest

# Or use the setup script which handles this:
bun run setup
```

## Plugin List

| Plugin | Package | Purpose |
|--------|---------|---------|
| oh-my-opencode | `oh-my-opencode@latest` | Multi-agent orchestration framework |
| antigravity-auth | `opencode-antigravity-auth@latest` | Multi-account Google OAuth rotation for Gemini |
| antigravity-quota | — | Quota monitoring for antigravity |
| compound-engineering | — | Compound AI engineering patterns |
| envsitter-guard | — | Environment variable validation |
| langfuse | — | LLM observability and tracing |
| notifier | — | Notification system |
| opencode-dcp | — | Dynamic Context Pruning |
| preload-skills | — | Skill preloading on session start |
| pty | — | PTY session management |
| rate-limit-fallback | — | Rate limit detection and fallback |
| safety-net | — | Safety guardrails |

## Adding a New Plugin

1. Create a directory under `plugins/` with the plugin name
2. Add an `info.md` with package name, source URL, version, features, and configuration
3. If the plugin requires configuration files, document them in `info.md` and add to `opencode-config/` if they should be synced across machines
4. Run `bun run setup` to verify the plugin is picked up

## Prerequisites

Some plugins have external dependencies:
- **antigravity-auth**: Requires Google OAuth credentials (`antigravity-accounts.json` — auto-generated, never committed)
- **langfuse**: Requires Langfuse API keys in environment
- **oh-my-opencode**: Requires compatible OpenCode CLI version
