# oh-my-claudecode Skills

Complete list of skills available in oh-my-claudecode v3.10.3

## Execution Modes

### autopilot
- **Trigger**: "autopilot", "build me", "I want a"
- **Purpose**: Full autonomous execution from idea to tested code
- **Features**: Planning, parallel execution, verification, self-correction

### ralph
- **Trigger**: "ralph", "don't stop until"
- **Purpose**: Persistence mode - continues until completion
- **Features**: Includes ultrawork parallelism, architect verification

### ultrawork
- **Trigger**: "ulw", "ultrawork"
- **Purpose**: Maximum parallel agent execution
- **Features**: Parallel task execution, smart model routing

### ultrapilot
- **Trigger**: "ultrapilot", "parallel build"
- **Purpose**: Parallel autopilot with file ownership
- **Features**: 3-5x faster than standard autopilot

### ecomode
- **Trigger**: "eco", "efficient", "budget", "save-tokens"
- **Purpose**: Token-efficient parallel execution
- **Features**: Smart model routing to minimize costs

### swarm
- **Trigger**: "swarm N agents"
- **Purpose**: N coordinated agents with SQLite task claiming
- **Features**: Distributed task pool, atomic task claiming

### pipeline
- **Trigger**: "pipeline"
- **Purpose**: Sequential agent chaining with data passing
- **Features**: Waterfall execution, context preservation

### ultraqa
- **Trigger**: Internal, activated by autopilot
- **Purpose**: QA cycling until all tests pass
- **Features**: Automated testing and fixing

## Planning & Analysis

### plan
- **Trigger**: "plan this", broad/vague requests
- **Purpose**: Planning interview for requirements gathering
- **Features**: Interactive questions, AskUserQuestion tool

### ralplan
- **Trigger**: "ralplan"
- **Purpose**: Iterative planning with consensus building
- **Features**: Multi-round refinement, critic review

### analyze
- **Trigger**: "analyze", "debug", "investigate"
- **Purpose**: Deep code analysis and debugging
- **Features**: Delegates to architect agent

### review
- **Trigger**: "review", after completion
- **Purpose**: Code review and quality assessment
- **Features**: Architect verification

## Search & Research

### deepsearch
- **Trigger**: "search", "find in codebase"
- **Purpose**: Advanced codebase search
- **Features**: Pattern matching, semantic search

### deepinit
- **Trigger**: "setup deepsearch"
- **Purpose**: Initialize search index
- **Features**: Index generation, configuration

### research
- **Trigger**: "research", "analyze data"
- **Purpose**: External research and data analysis
- **Features**: Delegates to researcher agent

## Domain-Specific

### frontend-ui-ux
- **Trigger**: UI/component/styling work (silent activation)
- **Purpose**: Frontend development with design sensibility
- **Features**: Component design, styling, UX patterns

### git-master
- **Trigger**: Git/commit work (silent activation)
- **Purpose**: Git operations and commit management
- **Features**: Atomic commits, rebase, history search

### tdd
- **Trigger**: "tdd", "test first", "red green"
- **Purpose**: Test-driven development workflow
- **Features**: Red-green-refactor cycle

### security-review
- **Trigger**: "security review"
- **Purpose**: Security vulnerability detection
- **Features**: Delegates to security-reviewer agent

### code-review
- **Trigger**: "code review"
- **Purpose**: Expert code review
- **Features**: Delegates to code-reviewer agent

### build-fix
- **Trigger**: Build/type errors
- **Purpose**: Fix compilation and type errors
- **Features**: Multi-language support

## Utilities

### cancel
- **Trigger**: "cancelomc", "stopomc"
- **Purpose**: Stop current execution mode
- **Features**: Smart mode detection, state cleanup

### note
- **Trigger**: "/oh-my-claudecode:note"
- **Purpose**: Session memory management
- **Features**: Priority context, working memory, manual notes

### learner
- **Trigger**: Automatic during execution
- **Purpose**: Extract learnings and patterns
- **Features**: Notepad wisdom capture

### writer-memory
- **Trigger**: Internal
- **Purpose**: Documentation generation
- **Features**: Technical writing

## Setup & Diagnostics

### omc-setup
- **Trigger**: "setup omc", first time setup
- **Purpose**: Configure oh-my-claudecode
- **Features**: Interactive setup wizard

### mcp-setup
- **Trigger**: "setup mcp"
- **Purpose**: Configure MCP servers
- **Features**: Server configuration

### doctor
- **Trigger**: "/oh-my-claudecode:doctor"
- **Purpose**: Diagnose and fix issues
- **Features**: Health checks, repairs

### hud
- **Trigger**: "/oh-my-claudecode:hud"
- **Purpose**: Status line configuration
- **Features**: HUD setup and repair

### help
- **Trigger**: "/oh-my-claudecode:help"
- **Purpose**: Show all skills and usage
- **Features**: Complete reference

## Always Active

### orchestrate
- **Purpose**: Core orchestration logic
- **Features**: Delegation routing, skill activation

## Total: 37 Skills

All skills use the prefix `/oh-my-claudecode:` when invoked as slash commands.

Example: `/oh-my-claudecode:autopilot` or `/oh-my-claudecode:help`
