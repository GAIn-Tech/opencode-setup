# OpenCode Setup Export Checklist

Use this checklist when setting up OpenCode on a new machine.

## Pre-Setup

- [ ] Install Node.js v18+ and npm
- [ ] Install Git
- [ ] Install OpenCode CLI: `npm install -g opencode`
- [ ] Verify: `opencode --version`
- [ ] Install uv/uvx: `pip install uv` (needed for grep MCP)

## Environment Variables

- [ ] Set `GITHUB_TOKEN` (personal access token with `repo` scope)
- [ ] Set `TAVILY_API_KEY` (from https://tavily.com)
- [ ] Add both to shell profile (`~/.bashrc` or `~/.zshrc`)

## Configuration Files

- [ ] Create directories:
  ```bash
  mkdir -p ~/.config/opencode ~/.opencode/global-rules
  ```
- [ ] Copy configs:
  ```bash
  cp opencode-config/opencode.json ~/.config/opencode/
  cp opencode-config/antigravity.json ~/.config/opencode/
  cp opencode-config/oh-my-opencode.json ~/.config/opencode/
  cp opencode-config/compound-engineering.json ~/.config/opencode/
  cp opencode-config/config.yaml ~/.opencode/
  ```
- [ ] Update `opencode.json` with YOUR API keys:
  - [ ] `mcp.supermemory.headers.Authorization` — your supermemory bearer token
  - [ ] `mcp.tavily.environment.TAVILY_API_KEY` — or use `{env:TAVILY_API_KEY}` reference

## Authenticate Accounts

- [ ] Start OpenCode: `opencode`
- [ ] Complete Google OAuth flow for each account (antigravity plugin prompts automatically)
- [ ] Verify accounts: `cat ~/.config/opencode/antigravity-accounts.json`
- [ ] **DO NOT** copy `antigravity-accounts.json` from another machine

## Verify Plugins Load (12 total)

- [ ] oh-my-opencode — check startup message
- [ ] opencode-antigravity-auth — check OAuth prompt
- [ ] opencode-supermemory — check memory tools available
- [ ] @tarquinen/opencode-dcp — check context pruning active
- [ ] cc-safety-net — check destructive command blocking
- [ ] @azumag/opencode-rate-limit-fallback — check fallback config
- [ ] @mohak34/opencode-notifier — check OS notification on completion
- [ ] opencode-plugin-langfuse — check tracing active
- [ ] opencode-plugin-preload-skills — check dynamic skill loading
- [ ] @symbioticsec/opencode-security-plugin — check security scan hooks
- [ ] opencode-token-monitor — check token/spend tracking output
- [ ] envsitter-guard — check .env read blocking
- [ ] rate-limit-fallback config exists at `~/.config/opencode/rate-limit-fallback.json`
- [ ] fallback list includes Anthropic + `haiku` before Gemini backups

## Verify MCP Servers Connect (9 total)

- [ ] tavily — web search tools available
- [ ] supermemory — memory/recall tools available
- [ ] context7 — resolve-library-id/query-docs tools available
- [ ] playwright — browser tools available
- [ ] sequentialthinking — sequential_thinking tool available
- [ ] websearch — search tool available
- [ ] grep — grep_query tool available
- [ ] github — GitHub tools available
- [ ] distill — context compression tools available

## Run Automated Health Check

- [ ] Run: `bash scripts/health-check.sh`

## Test Run

- [ ] Test default model:
  ```bash
  opencode run "ping" --model=google/antigravity-gemini-3-pro
  ```
- [ ] Test workflow command:
  ```
  /workflows:brainstorm test feature
  ```
- [ ] Test agent delegation:
  ```python
  task(subagent_type="explore", run_in_background=True,
       load_skills=[], description="Test",
       prompt="List files in current directory")
  ```

## Optional

- [ ] Set up Supermemory account at https://supermemory.ai
- [ ] Configure Langfuse dashboard for LLM observability
- [ ] Create project-specific `.opencode.yaml` from template
- [ ] Create custom skills in `~/.config/opencode/skills/`
- [ ] Create custom agents in `~/.config/opencode/agents/`

## Troubleshooting

- [ ] Plugin issues: `rm -rf ~/.config/opencode/node_modules` → restart
- [ ] MCP issues: Test individual server (e.g., `npx -y tavily-mcp@latest`)
- [ ] Auth issues: Delete account entry in `antigravity-accounts.json` → restart
- [ ] Model not found: Check `opencode.json` → `provider.google.models` + use `google/` prefix

---

**Last Updated**: February 11, 2026
**Platform**: OpenCode CLI
