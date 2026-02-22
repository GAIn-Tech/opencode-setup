# OpenCode Quick Reference

## Setup One-Liner

```bash
npm install -g opencode
git clone https://github.com/GAIn-Tech/opencode-setup.git
cd opencode-setup
bun run setup
bun run verify
opencode  # Plugins auto-install, MCP servers auto-connect
```

## Workflow Commands

```bash
# In OpenCode chat, use slash commands:
/workflows:brainstorm        # Explore requirements before planning
/workflows:plan              # Create structured implementation plan
/workflows:deepen-plan       # Enhance plan with parallel research
/workflows:work              # Execute plan with quality gates
/workflows:review            # Multi-agent code review
/workflows:compound          # Document solved problems
/workflows:resolve-todos     # Parallel TODO resolution
/workflows:test-browser      # Browser tests on PR-affected pages
/workflows:feature-video     # Record feature walkthrough video

# Loop modes:
/ralph-loop                  # Persistence until completion
/ulw-loop                    # Maximum parallel execution
```

## Agent Quick Reference

### When to Delegate

| Need | Agent | Model |
|------|-------|-------|
| Orchestrate work | sisyphus | claude-opus-4-6 |
| Architecture consultation | oracle | claude-opus-4-6 |
| Execute tasks | atlas / hephaestus | sonnet-4-5 / gemini-flash |
| Pre-planning analysis | metis | claude-sonnet-4-5 |
| Plan review / QA | momus | claude-sonnet-4-5 |
| Research (internal) | explore | gemini-flash (background) |
| Research (external) | librarian | gemini-flash (background) |
| Create plans | prometheus | gemini-flash |

### Delegation Examples

```python
# Background exploration (cheap, async)
task(subagent_type="explore", run_in_background=True,
     load_skills=[], description="Find auth patterns",
     prompt="Find authentication middleware in src/...")

# Quick fix with git skill
task(category="quick", load_skills=["git-master"],
     run_in_background=False, description="Fix typo",
     prompt="Fix the typo in README.md line 5...")

# Complex task with multiple skills
task(category="deep", load_skills=["systematic-debugging", "test-driven-development"],
     run_in_background=False, description="Debug race condition",
     prompt="Debug the race condition in the WebSocket handler...")
```

## Model Tiers

| Complexity | Model | Cost Cap | Use Case |
|------------|-------|----------|----------|
| mechanical | `kimi-k2.5-free` | $0.00 | Typos, renames, single-line fixes |
| trivial | `gemini-2.5-flash` | $0.01 | File lookups, grep, simple edits |
| routine | `antigravity-gemini-3-flash` | $0.05 | Feature impl, bug fixes |
| complex | `claude-sonnet-4-5` | $0.20 | Refactors, multi-file changes |
| advanced | `claude-sonnet-4-5-thinking` | $0.50 | Debugging, perf optimization |
| architectural | `claude-opus-4-6` | $1.00 | System design, novel problems |
| critical | `claude-opus-4-6-thinking` | $2.00 | Security audits, high-stakes |

## File Organization

```
~/.config/opencode/
├── opencode.json              # Main config (models, plugins, MCPs)
├── antigravity.json           # Account rotation settings
├── antigravity-accounts.json  # OAuth tokens (DO NOT COPY)
├── oh-my-opencode.json        # Agent model overrides
├── compound-engineering.json  # Skills, commands, categories
├── agents/*.md                # 29 specialized agent definitions
├── skills/*/SKILL.md          # 46 skill definitions
└── node_modules/              # Plugin installations (auto-managed)

~/.opencode/
├── config.yaml                # Global rules & delegation standards
└── global-rules/
    ├── model-delegation-standards.mdc
    ├── coordination-protocol.mdc
    └── development-standards.mdc

<project>/
└── .opencode.yaml             # Project-specific overrides
```

## Plugins (12)

| Plugin | Purpose |
|--------|---------|
| oh-my-opencode | Multi-agent orchestration (8 agents, 46 skills, 22 commands) |
| opencode-antigravity-auth | Google account rotation (3 accounts) |
| opencode-supermemory | Persistent cross-session memory |
| @tarquinen/opencode-dcp | Dynamic context pruning (token savings) |
| cc-safety-net | Blocks destructive commands |
| @azumag/opencode-rate-limit-fallback | Auto model fallback on rate limit |
| @mohak34/opencode-notifier | OS notifications |
| opencode-plugin-langfuse | LLM tracing & cost tracking |
| opencode-plugin-preload-skills | Contextual skill loading |
| @symbioticsec/opencode-security-plugin | Security guardrails and scanning |
| envsitter-guard | Blocks reading env/secret files |
| opencode-antigravity-quota | Antigravity quota visibility |
| opencode-pty | Interactive/background process control |

## MCP Servers (9)

| Server | Type | Purpose |
|--------|------|---------|
| tavily | local | Web search, research, crawling |
| supermemory | remote | Persistent memory |
| context7 | remote | Library documentation |
| playwright | local | Browser automation |
| sequentialthinking | local | Step-by-step reasoning |
| websearch | local | Web search (backup) |
| grep | local | GitHub code search |
| github | local | GitHub API |
| distill | local | AST-aware context compression |

## Common Issues

### Plugin Issues
```bash
rm -rf ~/.config/opencode/node_modules  # Clear
opencode  # Reinstalls automatically
```

### MCP Server Issues
```bash
npx -y tavily-mcp@0.2.16  # Test individual server
npx -y distill-mcp@0.8.1  # Test distill MCP
pip install uv             # Needed for grep MCP
echo $GITHUB_TOKEN         # Verify env vars set
```

### Antigravity Auth Issues
```bash
cat ~/.config/opencode/antigravity-accounts.json  # Check accounts
# Delete account entry + restart to re-auth
```

### Model Not Found
Ensure model is defined in `opencode.json` → `provider.google.models` and referenced as `google/model-name`.

## Key Concepts

### Delegation-First
- **Always delegate** substantive work to specialized agents
- **Verify results** after every delegation
- Use `session_id` for follow-ups (preserves full context)

### Skill Loading
- Subagents are STATELESS — pass skills via `load_skills=[...]`
- User-installed skills get PRIORITY over built-in
- Always evaluate ALL skills before delegating

### Background Tasks
- `run_in_background=True` for explore/librarian agents
- Collect results with `background_output(task_id="...")`
- Cancel all before final answer: `background_cancel(all=True)`

## Resources

- **OpenCode**: https://opencode.ai
- **oh-my-opencode**: https://github.com/Yeachan-Heo/oh-my-opencode
- **antigravity-auth**: https://github.com/NoeFabris/opencode-antigravity-auth
- **supermemory**: https://supermemory.ai
- **Tavily**: https://tavily.com
- **Context7**: https://context7.com
