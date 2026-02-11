# Complete OpenCode System Inventory

**Last Updated:** February 11, 2026  
**Total System Components:** 41 (13 custom packages + 13 external plugins + 9 MCPs + 8 agents + 46 skills)

---

## 🔧 Custom Packages (13)

All installed globally via `npm install -g` and located in `~/packages/`

| Package | Version | Purpose | Status |
|---------|---------|---------|--------|
| **opencode-context-governor** | 1.0.0 | Token budget controller per-session/model | ✅ Active |
| **opencode-eval-harness** | 0.1.0 | Benchmarker with 10 test cases | ✅ Active |
| **opencode-fallback-doctor** | 1.0.0 | Validates 16-model fallback chain | ✅ Active |
| **opencode-goraphdb-bridge** | 1.0.0 | REST wrapper over goraphdb HTTP API | ✅ Active |
| **opencode-learning-engine** | 1.0.0 | Anti-pattern catalog + orchestration advisor (with SkillRL hooks) | ✅ Active |
| **opencode-memory-graph** | 2.1.0 | Graph activation + retroactive backfill | ✅ Active |
| **opencode-model-router-x** | 0.1.0 | Policy-based model selection | ✅ Active |
| **opencode-plugin-healthd** | 1.0.0 | Daemon health checker (5min intervals) | ✅ Active |
| **opencode-proofcheck** | 1.0.0 | Deployment gate (with Showboat evidence hooks) | ✅ Active |
| **opencode-runbooks** | 2.0.0 | Auto-remediation for 7+ error patterns | ✅ Active |
| **opencode-skill-rl-manager** | 1.0.0 | Hierarchical skill orchestration via SkillRL principles | ✅ Active |
| **opencode-showboat-wrapper** | 1.0.0 | High-impact evidence capture with Playwright assertions | ✅ Active |
| **opencode-integration-layer** | 1.0.0 | Wires SkillRL + Showboat into existing packages | ✅ Active |

---

## 🔌 External Plugins (13)

Installed globally via npm, configured in `~/.config/opencode/opencode.json`

| Plugin | Version | Purpose | Status |
|--------|---------|---------|--------|
| **oh-my-opencode** | 3.5.2 | 8 agents + 46 skills + orchestration | ✅ Primary |
| **opencode-antigravity-auth** | 1.4.6 | Google OAuth rotation (3 accounts) | ✅ Active |
| **opencode-supermemory** | 2.0.1 | Cross-session persistent memory | ✅ Active |
| **@tarquinen/opencode-dcp** | 2.1.1 | Dynamic context pruning | ✅ Active |
| **cc-safety-net** | 0.7.1 | Blocks destructive commands | ✅ Active |
| **@azumag/opencode-rate-limit-fallback** | 1.67.0 | Auto-fallback on rate limit | ✅ Active |
| **@mohak34/opencode-notifier** | 0.1.18 | OS notifications | ✅ Active |
| **opencode-plugin-langfuse** | 0.1.8 | LLM tracing & observability | ✅ Active |
| **opencode-plugin-preload-skills** | 1.8.0 | Smart contextual skill loading | ✅ Active |
| **@symbioticsec/opencode-security-plugin** | 0.0.1-beta.9 | Security guardrails | ✅ Active |
| **envsitter-guard** | 0.0.4 | Blocks .env reads | ✅ Active |
| **opencode-antigravity-quota** | 0.1.6 | Quota visibility | ✅ Active |
| **opencode-pty** | 0.2.1 | Interactive/background process control | ✅ Active |

---

## 🔗 MCP Servers (9 Total)

Configured in `~/.config/opencode/opencode.json` under `mcpServers`

### Enabled (6) — Default On
| Server | Type | Command | Purpose |
|--------|------|---------|---------|
| **context7** | local | `npx -y context7 serve` | RAG knowledge base queries |
| **sequentialthinking** | local | `npx -y @modelcontextprotocol/server-sequential-thinking` | Deep reasoning with think chains |
| **websearch** | local | `npx -y @ignidor/web-search-mcp serve` | Real-time web search (no API key) |
| **grep** | local | `npx -y @modelcontextprotocol/server-grep` | Fast code pattern search |
| **distill-mcp** | local | `npx -y distill-mcp@0.8.1 serve --lazy` | Token optimization via compression |
| **supermemory** | remote | MCP endpoint (disabled by default in connection) | Cross-session memory persistence |

### Disabled (3) — Off by Default
| Server | Type | Reason | Enable Command |
|--------|------|--------|-----------------|
| **tavily** | local | Requires `TAVILY_API_KEY` | Enable in opencode.json, set env var |
| **playwright** | local | Heavy (browser automation) | Enable only for web testing tasks |
| **github** | local | Requires `GITHUB_TOKEN` | Enable for GitHub API access |

---

## 👥 Agents (8)

Configured in `~/.config/opencode/oh-my-opencode.json`

| Agent | Model | Role | Use Case |
|-------|-------|------|----------|
| **sisyphus** | claude-opus-4-6 | Primary orchestrator | Main task routing, complex logic |
| **oracle** | claude-opus-4-6 | High-IQ consultant | Architecture, debugging, reasoning |
| **atlas** | claude-sonnet-4-5 | Mapping/exploration | Context gathering, exploration |
| **metis** | claude-sonnet-4-5 | Pre-planning analyst | Task analysis before execution |
| **momus** | claude-sonnet-4-5 | Plan reviewer | Critique & validation |
| **librarian** | antigravity-gemini-3-flash | Reference search | External docs, GitHub examples |
| **hephaestus** | antigravity-gemini-3-flash | Builder | Implementation, coding |
| **prometheus** | antigravity-gemini-3-flash | Planner | High-level planning |

---

## 🎯 Skills (46 Total)

Configured in `~/.config/opencode/compound-engineering.json`

### Global Enabled (14)
- brainstorming
- compound-docs
- create-agent-skills
- dhh-rails-style
- frontend-design
- git-master
- playwright
- requesting-code-review
- superpowers/brainstorming
- superpowers/test-driven-development
- superpowers/using-git-worktrees
- superpowers/using-superpowers
- superpowers/verification-before-completion
- superpowers/writing-plans

### Available on Demand (32)
All 46 skills from oh-my-opencode + custom skills. Use `/orchestrate <task>` to invoke task-orchestrator skill for dynamic selection.

---

## 📊 System Statistics

| Category | Count |
|----------|-------|
| **Custom packages** | 10 |
| **External plugins** | 13 |
| **Total plugins** | 21 |
| **MCP servers** | 9 (6 enabled, 3 disabled) |
| **Agents** | 8 |
| **Skills available** | 46 |
| **Skills globally enabled** | 14 |

---

## 🚀 Key Features by Category

### 🧠 Intelligence & Orchestration
- 8 specialized agents for different task types
- 46 skills for domain-specific work
- task-orchestrator for workflow selection
- Learning engine for anti-pattern detection

### 📈 Performance & Optimization
- Context pruning (DCP)
- Token budgeting (context-governor)
- Rate-limit fallback (16-model chain)
- Model routing by complexity
- Lazy MCP loading

### 💾 Memory & Persistence
- Cross-session supermemory
- Graph-memory (retroactive backfill, OFF by default)
- Learning engine (pattern catalog)
- Session tracking

### 🔒 Safety & Governance
- Type-safety enforcement
- Destructive command blocking (safety-net)
- Security guardrails
- Proof-checking (git clean + tests)

### 🔧 Troubleshooting & Automation
- Health daemon (5min checks)
- Runbooks (auto-remediation for 7+ errors)
- Fallback doctor (model chain validation)
- Learning engine (anti-pattern warnings)

---

## 🔗 Configuration Files Reference

| File | Purpose | Location |
|------|---------|----------|
| **opencode.json** | Plugin + MCP list, model default | `~/.config/opencode/` |
| **oh-my-opencode.json** | 8 agents, model overrides, MCPs | `~/.config/opencode/` |
| **compound-engineering.json** | Skills, commands, enabled list | `~/.config/opencode/` |
| **config.yaml** | 7-tier delegation, cost mapping | `~/.opencode/` |
| **supermemory.json** | Memory filters, keyword patterns | `~/.config/opencode/` |
| **antigravity.json** | 3-account OAuth rotation | `~/.config/opencode/` |
| **rate-limit-fallback.json** | 16-model fallback chain | `~/.config/opencode/` |

---

## 📝 Usage

See individual package READMEs in `~/packages/*/README.md` for detailed usage of each custom package.

For integration instructions, see `INTEGRATION.md` (links to deployment guides for each component).
