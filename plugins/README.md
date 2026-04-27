# Plugins

External OpenCode plugins installed via npm. These are **not** workspace packages — they are npm-distributed and configured separately.

## Architecture

Each subdirectory contains an `info.md` describing the plugin, its npm package name, source repository, and configuration. The actual plugin code is installed globally or locally via npm/bun — these directories only hold metadata and documentation.

## Setup on New Machine

```bash
# Install all plugins (run from repo root)
bun install -g oh-my-opencode@3.16.0
bun install -g opencode-antigravity-auth@1.4.6

# Or use the setup script which handles this:
bun run setup
```

## Plugin List

| Plugin | Package | Purpose |
|--------|---------|---------|
| oh-my-opencode | `oh-my-opencode@3.16.0` | Multi-agent orchestration framework |
| antigravity-auth | `opencode-antigravity-auth@1.4.6` | Multi-account Google OAuth rotation for Gemini |
| antigravity-quota | `opencode-antigravity-quota@0.1.6` | Quota monitoring for antigravity |
| compound-engineering | — | Compound AI engineering patterns |
| envsitter-guard | `envsitter-guard@1.0.0` | Environment variable validation |
| langfuse | `opencode-plugin-langfuse@0.1.8` | LLM observability and tracing |
| notifier | `@mohak34/opencode-notifier@1.0.0` | Notification system |
| opencode-dcp | `@tarquinen/opencode-dcp@1.0.0` | Dynamic Context Pruning |
| opencode-multi-auth-codex | `@guard22/opencode-multi-auth-codex@1.4.2` | Multi-auth provider support for Codex workflows |
| preload-skills | `opencode-plugin-preload-skills@1.8.0` | Skill preloading on session start |
| pty | `opencode-pty@0.2.1` | PTY session management |
| rate-limit-fallback | `opencode-rate-limit-fallback@1.2.0` | Rate limit detection and fallback |
| safety-net | `cc-safety-net@1.0.0` | Safety guardrails |

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
