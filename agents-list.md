# oh-my-claudecode Agents

Complete list of 32 specialized agents in oh-my-claudecode v3.10.3

## Base Agents (12)

### architect
- **Model**: Opus
- **Purpose**: Architecture, debugging, root cause analysis
- **When to use**: Complex debugging, multi-system tradeoffs, architectural decisions
- **Tiers**: architect-low (Haiku), architect-medium (Sonnet), architect (Opus)

### researcher
- **Model**: Sonnet
- **Purpose**: Documentation, external API research
- **When to use**: Unfamiliar libraries, SDK documentation, external references
- **Tiers**: researcher-low (Haiku), researcher (Sonnet)

### explore
- **Model**: Haiku
- **Purpose**: Fast codebase pattern search
- **When to use**: Finding patterns, understanding code structure
- **Tiers**: explore (Haiku), explore-medium (Sonnet), explore-high (Opus)

### executor
- **Model**: Sonnet
- **Purpose**: Focused task implementation
- **When to use**: File changes, feature implementation
- **Tiers**: executor-low (Haiku), executor (Sonnet), executor-high (Opus)

### designer
- **Model**: Sonnet
- **Purpose**: UI/UX, component design
- **When to use**: Frontend work, styling, component architecture
- **Tiers**: designer-low (Haiku), designer (Sonnet), designer-high (Opus)

### writer
- **Model**: Haiku
- **Purpose**: Technical documentation
- **When to use**: Documentation generation, writing tasks

### vision
- **Model**: Sonnet
- **Purpose**: Image/screenshot analysis
- **When to use**: Visual analysis, design feedback

### critic
- **Model**: Opus
- **Purpose**: Critical plan review
- **When to use**: Planning validation, plan critique

### analyst
- **Model**: Opus
- **Purpose**: Pre-planning requirements analysis
- **When to use**: Ambiguous requests, requirements clarification

### planner
- **Model**: Opus
- **Purpose**: Strategic planning with interviews
- **When to use**: Broad requests, planning interviews

### qa-tester
- **Model**: Sonnet
- **Purpose**: Interactive CLI/service testing
- **When to use**: Testing workflows, QA verification
- **Tiers**: qa-tester (Sonnet), qa-tester-high (Opus)

### scientist
- **Model**: Sonnet
- **Purpose**: Data analysis, hypothesis testing
- **When to use**: Data analysis, statistical work
- **Tiers**: scientist-low (Haiku), scientist (Sonnet), scientist-high (Opus)

## Specialized Agents (4)

### security-reviewer
- **Model**: Opus
- **Purpose**: Security vulnerability detection and audits
- **When to use**: Security reviews, vulnerability scanning
- **Tiers**: security-reviewer-low (Haiku), security-reviewer (Opus)

### build-fixer
- **Model**: Sonnet
- **Purpose**: Build/type error resolution (multi-language)
- **When to use**: Compilation errors, type errors
- **Tiers**: build-fixer-low (Haiku), build-fixer (Sonnet)

### tdd-guide
- **Model**: Sonnet
- **Purpose**: Test-driven development workflow
- **When to use**: TDD implementation, test-first development
- **Tiers**: tdd-guide-low (Haiku), tdd-guide (Sonnet)

### code-reviewer
- **Model**: Opus
- **Purpose**: Expert code review and quality assessment
- **When to use**: Code review, quality checks
- **Tiers**: code-reviewer-low (Haiku), code-reviewer (Opus)

## Agent Tiers

### LOW Tier (Haiku) - 9 agents
Fast, cost-effective for simple tasks:
- architect-low
- executor-low
- researcher-low
- designer-low
- scientist-low
- security-reviewer-low
- build-fixer-low
- tdd-guide-low
- code-reviewer-low

### MEDIUM Tier (Sonnet) - 2 agents
Balanced performance:
- architect-medium
- explore-medium

### HIGH Tier (Opus) - 5 agents
Maximum reasoning power:
- executor-high
- designer-high
- explore-high
- qa-tester-high
- scientist-high

## Model Selection Guide

| Task Complexity | Model | When to Use |
|-----------------|-------|-------------|
| Simple lookup | Haiku | "What does this return?", "Find definition of X" |
| Standard work | Sonnet | "Add error handling", "Implement feature" |
| Complex reasoning | Opus | "Debug race condition", "Refactor architecture" |

## Agent Invocation

Always use `oh-my-claudecode:` prefix:

```
Task(subagent_type="oh-my-claudecode:executor",
     model="sonnet",
     prompt="Edit src/file.ts to add validation...")

Task(subagent_type="oh-my-claudecode:architect",
     model="opus",
     prompt="Review the authentication flow for security issues...")
```

## MCP Tools Available to Agents

### LSP Tools
- `lsp_hover` - Type info at position
- `lsp_goto_definition` - Jump to definition
- `lsp_find_references` - Find all usages
- `lsp_document_symbols` - File outline
- `lsp_workspace_symbols` - Cross-workspace search
- `lsp_diagnostics` - File errors/warnings
- `lsp_diagnostics_directory` - Project-wide checking
- `lsp_prepare_rename` - Check rename validity
- `lsp_rename` - Multi-file rename
- `lsp_code_actions` - Available refactorings
- `lsp_code_action_resolve` - Action details
- `lsp_servers` - List available LSP servers

### AST Tools
- `ast_grep_search` - Structural code search
- `ast_grep_replace` - AST-aware transformation

### Other Tools
- `python_repl` - Python code execution for data analysis
- All standard Claude Code tools (Read, Write, Edit, Bash, etc.)

## Agent Capabilities Matrix

| Agent | LSP | AST | REPL | Browser | Git |
|-------|-----|-----|------|---------|-----|
| architect | ✅ | ✅ | ✅ | - | ✅ |
| executor | ✅ | ✅ | - | - | ✅ |
| researcher | - | - | - | ✅ | - |
| designer | ✅ | ✅ | - | ✅ | - |
| security-reviewer | ✅ | ✅ | - | - | - |
| build-fixer | ✅ | ✅ | - | - | - |
| code-reviewer | ✅ | ✅ | - | - | - |
| scientist | - | - | ✅ | - | - |
| qa-tester | ✅ | - | ✅ | ✅ | - |

## Total: 32 Agents

12 base agents + 16 tiered variants + 4 specialized agents = 32 total
