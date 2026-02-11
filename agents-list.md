# OpenCode Agents

## oh-my-opencode Named Agents (8)

Core orchestration agents with model overrides via `oh-my-opencode.json`:

| Agent | Model | Role |
|-------|-------|------|
| **sisyphus** | claude-opus-4-6 | Main orchestrator — delegates, coordinates, verifies |
| **oracle** | claude-opus-4-6 | Read-only consultant — architecture, debugging, tradeoffs |
| **atlas** | claude-sonnet-4-5 | Task execution — implementation and code changes |
| **metis** | claude-sonnet-4-5 | Pre-planning analysis — scope clarification, ambiguity detection |
| **momus** | claude-sonnet-4-5 | Plan review & QA — catches gaps, ambiguities, missing context |
| **hephaestus** | antigravity-gemini-3-flash | Builder/executor — focused task implementation |
| **librarian** | antigravity-gemini-3-flash | Research — docs, OSS examples, web search, Context7 |
| **prometheus** | antigravity-gemini-3-flash | Planning — strategic plans, interviews, brainstorming |

### Model Distribution Rationale
- **Opus** (2 agents): sisyphus + oracle — top-tier orchestration and consultation via Anthropic primary sub
- **Sonnet** (3 agents): atlas, metis, momus — complex reasoning, execution, review via Anthropic
- **Flash** (3 agents): hephaestus, librarian, prometheus — high-throughput exploration/research via Antigravity Gemini

## Specialized Agent Definitions (29)

Located in `~/.config/opencode/agents/*.md`, these are invoked by oh-my-opencode as subagents:

### Code Review Agents (8)
| Agent | Focus |
|-------|-------|
| `dhh-rails-reviewer` | Rails code in DHH/37signals style |
| `kieran-python-reviewer` | Python code quality |
| `kieran-rails-reviewer` | Rails conventions and patterns |
| `kieran-typescript-reviewer` | TypeScript best practices |
| `julik-frontend-races-reviewer` | Frontend race conditions and async bugs |
| `code-simplicity-reviewer` | Complexity reduction, KISS principle |
| `agent-native-reviewer` | Agent architecture patterns |
| `design-implementation-reviewer` | Design pattern correctness |

### Security & Performance (2)
| Agent | Focus |
|-------|-------|
| `security-sentinel` | Vulnerability detection, OWASP compliance |
| `performance-oracle` | Bottleneck identification, optimization strategies |

### Research & Learning (5)
| Agent | Focus |
|-------|-------|
| `best-practices-researcher` | Industry standards and patterns |
| `framework-docs-researcher` | Framework-specific documentation |
| `learnings-researcher` | Extract patterns from past sessions |
| `repo-research-analyst` | Repository structure and pattern analysis |
| `pattern-recognition-agent` | Cross-session pattern detection |

### Data & Architecture (4)
| Agent | Focus |
|-------|-------|
| `data-integrity-guardian` | Data validation and consistency |
| `data-migration-expert` | Migration planning and execution |
| `schema-drift-detector` | Schema change detection and alerting |
| `architecture-strategist` | System design and tradeoff analysis |

### Additional Specialized Agents (10)
Various other agents for specific domains — see `~/.config/opencode/agents/` for the full set.

## Delegation Model

### Task Categories → Agent Selection

| Category | Agent Type | Model Tier |
|----------|-----------|------------|
| `quick` | hephaestus | Gemini Flash (antigravity) |
| `unspecified-low` | hephaestus / atlas | Flash / Sonnet |
| `unspecified-high` | atlas / oracle | Sonnet / Opus |
| `deep` | oracle | Opus |
| `ultrabrain` | oracle | Opus (thinking variant) |
| `visual-engineering` | atlas + frontend skills | Sonnet |
| `writing` | prometheus | Gemini Flash (antigravity) |

### Delegation Complexity → Model Mapping

From `config.yaml` — Anthropic for heavy lifting, Antigravity Gemini for routine, free for trivial:

| Complexity | Model | Provider | Cost Cap |
|------------|-------|----------|----------|
| mechanical | `kimi-k2.5-free` | Moonshot (free) | $0.00 |
| trivial | `gemini-2.5-flash` | Google | $0.01 |
| routine | `antigravity-gemini-3-flash` | Antigravity | $0.05 |
| complex | `claude-sonnet-4-5` | Anthropic | $0.20 |
| advanced | `claude-sonnet-4-5-thinking` | Anthropic | $0.50 |
| architectural | `claude-opus-4-6` | Anthropic | $1.00 |
| critical | `claude-opus-4-6-thinking` | Anthropic | $2.00 |

## Agent Invocation

```python
# Background exploration (cheap, fast)
task(subagent_type="explore", run_in_background=True,
     load_skills=[], description="Find auth patterns",
     prompt="Find all authentication middleware in src/...")

# Background research (external docs)
task(subagent_type="librarian", run_in_background=True,
     load_skills=[], description="JWT best practices",
     prompt="Find OWASP JWT security guidelines...")

# Synchronous implementation (with skills)
task(category="quick", load_skills=["git-master"],
     run_in_background=False, description="Fix type error",
     prompt="Fix the type error in auth.ts line 42...")

# Architecture consultation
task(subagent_type="oracle", run_in_background=False,
     load_skills=[], description="Review auth design",
     prompt="Review the authentication flow for security...")
```

## Tools Available to All Agents

### LSP Tools
`lsp_goto_definition`, `lsp_find_references`, `lsp_symbols`, `lsp_diagnostics`, `lsp_prepare_rename`, `lsp_rename`

### AST Tools
`ast_grep_search`, `ast_grep_replace`

### Standard Tools
Read, Write, Edit, Bash, Grep, Glob, WebFetch, Task, TodoWrite, Skill, Question
