# OpenCode CLI Migration Plan

## TL;DR

**Objective:** Create new greenfield `opencode-cli` repository with complete migration of all 36 packages, 12 plugins, 93 scripts, maintaining full backward compatibility with existing OpenCode ecosystem.

**Approach:** Greenfield repository with:
- Bun/TypeScript stack (preserving OpenCode's strength)
- CLI patterns inspired by hermes-cli and swe-agent
- Purpose-built for multi-agent orchestration
- Full backward compatibility via adapter layers

**Timeline:** 66 weeks (6+ months)
**Parallel Execution:** 10 phases with dependencies
**Critical Path:** Phase 0 → Phase 1 → Phase 2 → Phase 4 → Phase 7 → Phase 10

---

## Context

### Research Findings

**Hermes-cli (github.com/alexandruluca/hermes-cli):**
- TypeScript-based (96.5% JavaScript)
- Command-subcommand pattern: `hermes <command> <subcommand> [options]`
- Deployment/CI-focused, NOT agent-orchestration
- Good CLI structure to borrow, but wrong focus

**SWE-agent (github.com/SWE-agent/SWE-agent):**
- Python-based (94.8% Python)
- YAML config-driven with trajectory recording
- Single-agent focused (issue fixing), NOT multi-agent
- **CRITICAL:** In maintenance-only mode
- Great patterns (inspector, trajectories, config-driven) but wrong stack

**Decision:** Neither is suitable as base. Create new repo borrowing best patterns from both.

### Current OpenCode Architecture

**36 Packages:**
- Core: opencode-sisyphus-state (347 files!), opencode-model-router-x, opencode-context-governor
- Support: opencode-dashboard (Next.js), opencode-learning-engine, etc.

**12 Plugins:**
- oh-my-opencode (multi-agent orchestration)
- antigravity-auth (account rotation)
- opencode-dcp (context pruning)
- safety-net, rate-limit-fallback, notifier, langfuse, preload-skills, security-plugin, token-monitor, antigravity-quota, opencode-pty

**93 Infrastructure Scripts:**
- Governance gates, deployment automation, health checks

**6 Config Files to Migrate:**
- opencode.json (116KB), antigravity.json, oh-my-opencode.json, compound-engineering.json, config.yaml, .opencode.config.json

**Backward Compatibility Requirement:**
- Full compatibility - all existing configs must work
- Migration scripts required
- Adapter layers for config formats

---

## Work Objectives

### Core Objective
Create production-ready `opencode-cli` that fully replaces existing OpenCode ecosystem while maintaining 100% backward compatibility.

### Concrete Deliverables
1. New `opencode-cli` repository with complete monorepo
2. 36 migrated packages with improved architecture
3. 12 migrated plugins using new SDK
4. 93 migrated/replaced infrastructure scripts
5. Unified config system with migration tools
6. Complete test suite (253+ tests)
7. Documentation and migration guides
8. Published npm package

### Definition of Done
- [ ] All 36 packages functionally equivalent
- [ ] All 12 plugins work in new system
- [ ] All 93 scripts replaced or migrated
- [ ] All 253 tests pass
- [ ] Existing configs work via adapters
- [ ] Performance equal or better
- [ ] Documentation complete
- [ ] Published to npm

### Must Have
- Multi-agent orchestration (Sisyphus)
- Model routing with context budget
- Skill system (90+ skills)
- MCP server integrations (15+)
- Plugin SDK
- Trajectory recording
- Agent inspector web UI
- Full backward compatibility

### Must NOT Have (Guardrails)
- Breaking changes without migration path
- Performance degradation
- Reduced feature set
- Dropped plugin support

---

## Verification Strategy

### Agent-Executed QA (Universal)
All tasks include Agent-Executed QA Scenarios using:
- **CLI/TUI**: `interactive_bash` (tmux)
- **Frontend**: `playwright` (browser automation)
- **API**: `Bash` (curl/httpie)
- **Config**: File system assertions

### Test Strategy
- **Unit Tests**: 253 tests migrated
- **Integration Tests**: All package integrations
- **E2E Tests**: Full workflow scenarios
- **Migration Tests**: Config/script compatibility

---

## Execution Strategy

### Parallel Execution Waves

```
Phase 0 (Foundation):         Weeks 1-4
├── 0.1: Create repo
├── 0.2: Architecture spec
└── 0.3: Monorepo setup

Phase 1 (CLI Framework):        Weeks 5-8
├── 1.1: Entry point
├── 1.2: Config system
└── 1.3: Command infrastructure

Phase 2 (Orchestrator):       Weeks 9-14  [Depends: Phase 1]
├── 2.1: Sisyphus state
├── 2.2: Task queue
└── 2.3: Inspector UI

Phase 3 (Model/Context):      Weeks 15-20 [Depends: Phase 2]
├── 3.1: Model router
└── 3.2: Context governor

Phase 4 (Skills):             Weeks 21-28 [Depends: Phase 3]
├── 4.1: Skill loader
└── 4.2: Dev tools

Phase 5 (MCP):                Weeks 29-32 [Depends: Phase 4]
└── 5.1: MCP bridge

Phase 6 (Plugins):            Weeks 33-40 [Depends: Phase 5]
├── 6.1: Plugin SDK
└── 6.2-6.13: Individual plugins

Phase 7 (Scripts):            Weeks 41-48 [Depends: Phase 6]
├── 7.1: Categorize scripts
└── 7.2-7.7: Migrate categories

Phase 8 (Dashboard):          Weeks 49-54 [Depends: Phase 7]
└── 8.1: Port dashboard

Phase 9 (Testing):            Weeks 55-60 [Depends: Phase 8]
├── 9.1: Port tests
└── 9.2: Migration tests

Phase 10 (Docs/Cutover):      Weeks 61-66 [Depends: Phase 9]
├── 10.1: Documentation
├── 10.2: Migration tools
└── 10.3: Announce & support
```

---

## TODOs

### Phase 0: Foundation (Weeks 1-4)

#### TODO 0.1: Create New Repository
**What to do:**
- Create GitHub repository `opencode-cli`
- Add README, LICENSE, CONTRIBUTING
- Set up CI/CD pipeline (GitHub Actions)
- Configure branch protection
- Set up issue templates

**Recommended Agent Profile:**
- **Category**: `quick`
- **Skills**: `github-actions`, `ci-cd-automation`

**Parallelization:**
- **Can Run In Parallel**: YES (Wave 0)
- **Blocks**: All subsequent tasks
- **Blocked By**: None

**Acceptance Criteria:**
- [ ] Repository exists at github.com/[org]/opencode-cli
- [ ] CI/CD pipeline runs on PR/push
- [ ] Initial commit with basic structure
- [ ] Issue templates configured
- [ ] Branch protection rules active

**Agent-Executed QA:**
```
Scenario: Repository created
Tool: Bash
Steps:
1. Run: git clone https://github.com/[org]/opencode-cli.git
   Assert: Clone succeeds
2. Run: cd opencode-cli && ls
   Assert: Shows README.md, LICENSE, etc.
3. Check GitHub Actions
   Assert: Workflow runs on push
Evidence: Terminal output, GitHub UI
```

**Commit**: YES
- Message: `chore(repo): initial setup`
- Files: All repo setup files

---

#### TODO 0.2: Define Architecture Specification
**What to do:**
- Create comprehensive architecture document
- Map all 36 packages to new architecture
- Define unified config schema (backward compatible)
- Design adapter layers for existing configs
- Specify CLI command structure
- Define plugin SDK/API

**Recommended Agent Profile:**
- **Category**: `unspecified-high`
- **Skills**: `architecture-design`, `system-design`

**Parallelization:**
- **Can Run In Parallel**: YES (with 0.1)
- **Blocks**: Phase 1+
- **Blocked By**: None

**Acceptance Criteria:**
- [ ] Architecture doc at `docs/ARCHITECTURE.md`
- [ ] Package mapping table complete
- [ ] Config adapter specifications defined
- [ ] Plugin interface defined
- [ ] CLI command specification complete

**Agent-Executed QA:**
```
Scenario: Architecture docs exist
Tool: Bash
Steps:
1. Run: ls docs/ARCHITECTURE.md
   Assert: File exists
2. Run: cat docs/ARCHITECTURE.md | head -20
   Assert: Shows architecture overview
3. Run: ls docs/package-mapping.md
   Assert: File exists
Evidence: File system check
```

**Commit**: YES
- Message: `docs(architecture): comprehensive migration spec`
- Files: `docs/ARCHITECTURE.md`, `docs/package-mapping.md`, `docs/config-migration.md`

---

#### TODO 0.3: Set Up Monorepo Infrastructure
**What to do:**
- Configure Bun-based monorepo with workspace support
- Create root `package.json` with workspace config
- Add shared TypeScript config
- Set up ESLint + Prettier
- Add Husky pre-commit hooks
- Create `packages/` directory structure
- Add CI/CD for monorepo

**Recommended Agent Profile:**
- **Category**: `unspecified-high`
- **Skills**: `ci-cd-automation`, `docker-containerization`

**Parallelization:**
- **Can Run In Parallel**: YES (with 0.1, 0.2)
- **Blocks**: Phase 1+
- **Blocked By**: None

**Acceptance Criteria:**
- [ ] `bun install` works at root
- [ ] `bun run build` builds all packages
- [ ] `bun run test` runs all tests
- [ ] `bun run lint` passes
- [ ] Pre-commit hooks run on git commit

**Agent-Executed QA:**
```
Scenario: Monorepo setup
Tool: Bash
Steps:
1. Run: bun install
   Assert: Installs dependencies
2. Run: bun run build
   Assert: Builds successfully
3. Run: bun run lint
   Assert: No lint errors
4. Create test commit
   Assert: Pre-commit hooks run
Evidence: Terminal output
```

**Commit**: YES
- Message: `chore(infra): monorepo setup with Bun workspaces`
- Files: `package.json`, `bunfig.toml`, `tsconfig.json`, `.eslintrc.js`, `.prettierrc`, `.husky/`

---

### Phase 1: Core CLI Framework (Weeks 5-8)

#### TODO 1.1: Implement CLI Entry Point
**What to do:**
- Create `packages/cli/src/index.ts` - main entry
- Implement command router
- Add `--version`, `--help` flags
- Create `packages/cli/src/commands/` directory
- Implement base command class

**Recommended Agent Profile:**
- **Category**: `unspecified-high`
- **Skills**: `clean-architecture`

**Parallelization:**
- **Can Run In Parallel**: NO (sequential within phase)
- **Blocks**: 1.2, 1.3
- **Blocked By**: 0.3

**Acceptance Criteria:**
- [ ] `opencode --version` returns version
- [ ] `opencode --help` shows commands
- [ ] `opencode <unknown>` shows error with suggestions
- [ ] Commands load dynamically

**Agent-Executed QA:**
```
Scenario: CLI basic functionality
Tool: Bash
Steps:
1. Run: opencode --version
   Assert: Output matches package.json version
2. Run: opencode --help
   Assert: Shows available commands
3. Run: opencode unknown-command
   Assert: Error with suggestions
Evidence: Terminal output capture
```

**Commit**: YES
- Message: `feat(cli): entry point with command routing`
- Files: `packages/cli/src/index.ts`, `packages/cli/src/commands/base.ts`

---

#### TODO 1.2: Implement Unified Config System
**What to do:**
- Create `packages/config/src/index.ts`
- Define unified config schema (Zod)
- Implement config loader with format detection
- Create adapters for existing configs (6 files)
- Add config validation
- Create migration script

**Recommended Agent Profile:**
- **Category**: `unspecified-high`

**Parallelization:**
- **Can Run In Parallel**: YES (with 1.1)
- **Blocks**: Phase 2+
- **Blocked By**: 0.3

**Acceptance Criteria:**
- [ ] Loads all 6 existing config formats
- [ ] Validates configs against schema
- [ ] Helpful error messages
- [ ] Migration script converts to unified format
- [ ] Environment variable overrides work

**Agent-Executed QA:**
```
Scenario: Config loading
Tool: Bash
Steps:
1. Run: opencode config validate
   Assert: Validates ~/.config/opencode/*.json
2. Run: opencode config migrate --dry-run
   Assert: Shows migration preview
3. Run: opencode config migrate
   Assert: Creates ~/.config/opencode-cli/config.yaml
4. Run: opencode config get models.default
   Assert: Returns configured default model
Evidence: Config files, terminal output
```

**Commit**: YES
- Message: `feat(config): unified config system with migration`
- Files: `packages/config/src/`, `scripts/migrate-config.mjs`

---

#### TODO 1.3: Implement Command Framework
**What to do:**
- Create command base class
- Add subcommand support
- Implement command registration
- Create command discovery
- Implement 7 base commands

**Recommended Agent Profile:**
- **Category**: `unspecified-high`

**Parallelization:**
- **Can Run In Parallel**: YES (with 1.1, 1.2)
- **Blocks**: Phase 2+
- **Blocked By**: 0.3

**Acceptance Criteria:**
- [ ] All 7 base commands exist (run, agent, skill, plan, session, config, task)
- [ ] Commands have `--help` output
- [ ] Subcommands work: `opencode agent list`
- [ ] Command aliases work
- [ ] Options validation works

**Agent-Executed QA:**
```
Scenario: Command structure
Tool: Bash
Steps:
1. Run: opencode agent --help
   Assert: Shows agent subcommands
2. Run: opencode agent list
   Assert: Shows running agents
3. Run: opencode a list
   Assert: Same as 'agent list'
4. Run: opencode agent spawn --type prom --task "test"
   Assert: Spawns new agent
Evidence: Terminal output, agent list
```

**Commit**: YES
- Message: `feat(cli): command framework with subcommands`
- Files: `packages/cli/src/commands/*.ts`

---

### Phase 2: Agent Orchestrator (Weeks 9-14)

#### TODO 2.1: Port Sisyphus State Management
**What to do:**
- Analyze existing Sisyphus (347 files)
- Extract core state machine logic
- Create `packages/agent-orchestrator/src/`
- Port state transitions
- Port agent lifecycle
- Add event sourcing for trajectories

**Recommended Agent Profile:**
- **Category**: `ultrabrain`
- **Skills**: `event-sourcing`

**Parallelization:**
- **Can Run In Parallel**: NO
- **Blocks**: 2.2, 2.3, Phase 3+
- **Blocked By**: Phase 1

**Acceptance Criteria:**
- [ ] Agent states: pending, running, paused, completed, failed
- [ ] State transitions work
- [ ] Trajectories recorded to `.sisyphus/trajectories/`
- [ ] Event sourcing for replay
- [ ] Agent cleanup on completion

**Agent-Executed QA:**
```
Scenario: Agent lifecycle
Tool: interactive_bash
Steps:
1. Run: opencode agent spawn --type prom --task "echo hello"
   Assert: Returns agent ID
2. Run: opencode agent status <id>
   Assert: Shows "running"
3. Wait for completion
4. Run: opencode agent status <id>
   Assert: Shows "completed"
5. Run: opencode agent replay <id>
   Assert: Replays trajectory
Evidence: Terminal output, trajectory files
```

**Commit**: YES
- Message: `feat(orchestrator): Sisyphus state management`
- Files: `packages/agent-orchestrator/src/`

---

#### TODO 2.2: Implement Task Queue
**What to do:**
- Create task queue data structure
- Implement task prioritization
- Add task scheduling
- Create task dependency graph
- Add task cancellation
- Implement task retry logic

**Recommended Agent Profile:**
- **Category**: `unspecified-high`

**Parallelization:**
- **Can Run In Parallel**: YES (with 2.1)
- **Blocks**: Phase 3+
- **Blocked By**: Phase 1

**Acceptance Criteria:**
- [ ] Tasks can be queued
- [ ] Tasks execute in priority order
- [ ] Task dependencies respected
- [ ] Tasks can be cancelled
- [ ] Failed tasks can retry

**Agent-Executed QA:**
```
Scenario: Task queue
Tool: Bash
Steps:
1. Run: opencode task queue "task1" --priority high
2. Run: opencode task queue "task2" --priority low
3. Run: opencode task queue "task3" --priority high
4. Run: opencode task list
   Assert: task1 and task3 first
5. Run: opencode task run-all
   Assert: Executes in priority order
Evidence: Task execution order verification
```

**Commit**: YES
- Message: `feat(orchestrator): task queue and scheduling`
- Files: `packages/agent-orchestrator/src/queue.ts`

---

#### TODO 2.3: Create Agent Inspector Web UI
**What to do:**
- Create Next.js app in `packages/inspector/`
- Implement trajectory viewer
- Add agent status dashboard
- Create real-time log streaming
- Add trajectory replay controls
- Implement agent comparison view

**Recommended Agent Profile:**
- **Category**: `visual-engineering`
- **Skills**: `react-patterns`, `tailwind-css`

**Parallelization:**
- **Can Run In Parallel**: YES (with 2.1, 2.2)
- **Blocks**: Phase 3+
- **Blocked By**: Phase 1

**Acceptance Criteria:**
- [ ] Web UI starts on `opencode inspector`
- [ ] Shows list of agents/trajectories
- [ ] Can view trajectory step-by-step
- [ ] Real-time logs update
- [ ] Can replay trajectories

**Agent-Executed QA:**
```
Scenario: Inspector UI
Tool: Playwright
Steps:
1. Run: opencode inspector --port 3000
2. Navigate to http://localhost:3000
3. Assert: Shows agent list
4. Click on completed agent
5. Assert: Shows trajectory timeline
6. Click "Replay"
7. Assert: Replays agent actions
Evidence: Screenshots at each step
```

**Commit**: YES
- Message: `feat(inspector): web-based agent inspector`
- Files: `packages/inspector/`

---

### Phase 3: Model & Context Management (Weeks 15-20)

#### TODO 3.1: Port Model Router
**What to do:**
- Port model resolution logic
- Port provider abstraction
- Port model selection algorithms
- Port rate limiting
- Port fallback logic
- Add context budget awareness

**Recommended Agent Profile:**
- **Category**: `ultrabrain`

**Parallelization:**
- **Can Run In Parallel**: NO
- **Blocks**: 3.2, Phase 4+
- **Blocked By**: Phase 2

**Acceptance Criteria:**
- [ ] Model routing works for all providers
- [ ] Rate limits respected
- [ ] Fallbacks trigger correctly
- [ ] Context budget affects model selection
- [ ] All existing models supported

**Agent-Executed QA:**
```
Scenario: Model routing
Tool: Bash
Steps:
1. Run: opencode model list
   Assert: Shows all configured models
2. Run: opencode run --model claude-sonnet "test"
   Assert: Uses specified model
3. Run: opencode run "test"
   Assert: Uses default model
4. Trigger rate limit
   Assert: Falls back to alternative
Evidence: Logs show model selection
```

**Commit**: YES
- Message: `feat(models): model router with budget awareness`
- Files: `packages/model-router/src/`

---

#### TODO 3.2: Port Context Governor
**What to do:**
- Port context governor
- Port context bridge
- Integrate MCP servers (distill, context7)
- Add budget tracking
- Port compression recommendations
- Port alert system

**Recommended Agent Profile:**
- **Category**: `ultrabrain`

**Parallelization:**
- **Can Run In Parallel**: YES (with 3.1)
- **Blocks**: Phase 4+
- **Blocked By**: Phase 2

**Acceptance Criteria:**
- [ ] Token budgets tracked per session
- [ ] 75% warning, 80% critical alerts
- [ ] Compression recommendations at 65%
- [ ] Context7 lookups work
- [ ] Distill integration works

**Agent-Executed QA:**
```
Scenario: Context budget
Tool: Bash
Steps:
1. Start long-running task
2. Monitor context usage
3. Assert: Warning at 75%
4. Assert: Critical at 80%
5. Assert: Compression recommendation at 65%
Evidence: Logs, alerts
```

**Commit**: YES
- Message: `feat(context): token budget management with MCP`
- Files: `packages/context-manager/src/`

---

### Phase 4: Skill System (Weeks 21-28)

#### TODO 4.1: Port Skill Loader
**What to do:**
- Port skill discovery
- Port skill loading
- Port skill execution
- Port contextual skill loading
- Add skill versioning

**Recommended Agent Profile:**
- **Category**: `unspecified-high`

**Parallelization:**
- **Can Run In Parallel**: NO
- **Blocks**: 4.2, Phase 5+
- **Blocked By**: Phase 3

**Acceptance Criteria:**
- [ ] Discovers skills from `~/.config/opencode/skills/`
- [ ] Loads skills dynamically
- [ ] Executes skill code safely
- [ ] Contextual loading works
- [ ] All 90+ skills loadable

**Agent-Executed QA:**
```
Scenario: Skill loading
Tool: Bash
Steps:
1. Run: opencode skill list
   Assert: Shows all 90+ skills
2. Run: opencode skill info git-master
   Assert: Shows skill description
3. Run: opencode run --skill git-master "status"
   Assert: Loads and executes skill
Evidence: Skill loading logs
```

**Commit**: YES
- Message: `feat(skills): skill loader and executor`
- Files: `packages/skill-system/src/`

---

#### TODO 4.2: Create Skill Development Tools
**What to do:**
- Create skill template generator
- Add skill validation tools
- Create skill test framework
- Add skill documentation generator
- Create skill publishing tools

**Recommended Agent Profile:**
- **Category**: `unspecified-high`

**Parallelization:**
- **Can Run In Parallel**: YES (with 4.1)
- **Blocks**: Phase 5+
- **Blocked By**: Phase 3

**Acceptance Criteria:**
- [ ] `opencode skill create` generates template
- [ ] `opencode skill validate` checks skill
- [ ] `opencode skill test` runs tests
- [ ] `opencode skill publish` publishes skill

**Agent-Executed QA:**
```
Scenario: Skill development
Tool: Bash
Steps:
1. Run: opencode skill create my-skill
   Assert: Creates skill template
2. Run: opencode skill validate my-skill
   Assert: Validates skill structure
3. Run: opencode skill test my-skill
   Assert: Runs skill tests
Evidence: Generated files, test results
```

**Commit**: YES
- Message: `feat(skills): skill development tools`
- Files: `packages/skill-system/src/dev-tools/`

---

### Phase 5: MCP Integration (Weeks 29-32)

#### TODO 5.1: Port MCP Bridge
**What to do:**
- Port MCP client
- Port server configurations
- Add dynamic MCP loading
- Port tool discovery
- Port tool execution
- Add MCP health checks

**Recommended Agent Profile:**
- **Category**: `ultrabrain`

**Parallelization:**
- **Can Run In Parallel**: NO
- **Blocks**: Phase 6+
- **Blocked By**: Phase 4

**Acceptance Criteria:**
- [ ] All 15+ MCP servers connect
- [ ] Tools discovered and available
- [ ] Tool execution works
- [ ] Health checks work
- [ ] Fallback if MCP unavailable

**Agent-Executed QA:**
```
Scenario: MCP integration
Tool: Bash
Steps:
1. Run: opencode mcp list
   Assert: Shows all configured MCPs
2. Run: opencode mcp status tavily
   Assert: Shows connection status
3. Run: opencode mcp test tavily
   Assert: Tests MCP connection
Evidence: MCP status, tool execution
```

**Commit**: YES
- Message: `feat(mcp): MCP server integration`
- Files: `packages/mcp-bridge/src/`

---

### Phase 6: Plugin Migration (Weeks 33-40)

#### TODO 6.1: Create Plugin SDK
**What to do:**
- Design plugin interface
- Create plugin base class
- Define plugin lifecycle hooks
- Add plugin configuration schema
- Create plugin template
- Write plugin documentation

**Recommended Agent Profile:**
- **Category**: `unspecified-high`

**Parallelization:**
- **Can Run In Parallel**: NO
- **Blocks**: 6.2-6.13
- **Blocked By**: Phase 5

**Acceptance Criteria:**
- [ ] Plugin interface documented
- [ ] Plugin template exists
- [ ] Plugin lifecycle defined
- [ ] Configuration schema documented
- [ ] Example plugin works

**Commit**: YES
- Message: `feat(plugins): plugin SDK and architecture`
- Files: `packages/plugin-sdk/`

---

#### TODO 6.2-6.13: Migrate Individual Plugins
**What to do:**
Migrate each of 12 plugins:
- 6.2: oh-my-opencode (Critical)
- 6.3: antigravity-auth (Critical)
- 6.4: opencode-dcp (Critical)
- 6.5: safety-net (High)
- 6.6: rate-limit-fallback (High)
- 6.7: notifier (Medium)
- 6.8: langfuse (Medium)
- 6.9: preload-skills (High)
- 6.10: security-plugin (High)
- 6.11: token-monitor (Low)
- 6.12: antigravity-quota (Medium)
- 6.13: opencode-pty (Medium)

**Recommended Agent Profile:**
- **Category**: `unspecified-high` per plugin

**Parallelization:**
- **Can Run In Parallel**: Plugins 6.3-6.13 can parallel with 6.2
- **Blocks**: Phase 7
- **Blocked By**: 6.1

**Acceptance Criteria (per plugin):**
- [ ] Plugin loads in new system
- [ ] Plugin functionality works
- [ ] Tests pass
- [ ] Documentation updated

**Commit**: YES (one per plugin)
- Message: `feat(plugins): migrate [plugin-name]`

---

### Phase 7: Script Migration (Weeks 41-48)

#### TODO 7.1: Categorize Scripts
**What to do:**
- Analyze all 93 scripts
- Categorize: Governance, Deployment, Health, Model, State, Utility
- Map dependencies
- Assign migration priority
- Mark for consolidation

**Recommended Agent Profile:**
- **Category**: `quick`

**Parallelization:**
- **Can Run In Parallel**: NO
- **Blocks**: 7.2-7.7
- **Blocked By**: Phase 6

**Acceptance Criteria:**
- [ ] All 93 scripts categorized
- [ ] Dependencies mapped
- [ ] Migration priority assigned
- [ ] Scripts marked for consolidation

**Commit**: YES
- Message: `docs(scripts): script inventory and migration plan`
- Files: `docs/script-migration.md`

---

#### TODO 7.2-7.7: Migrate Script Categories
**What to do:**
- Week 41-42: Governance scripts
- Week 43-44: Deployment scripts
- Week 45-46: Health scripts
- Week 47-48: Remaining scripts

**Recommended Agent Profile:**
- **Category**: `unspecified-high` per category

**Parallelization:**
- **Can Run In Parallel**: Within category
- **Blocks**: Phase 8
- **Blocked By**: 7.1

**Acceptance Criteria:**
- [ ] All scripts migrated or replaced
- [ ] Functionality preserved
- [ ] Tests pass

---

### Phase 8: Dashboard & UI (Weeks 49-54)

#### TODO 8.1: Port Dashboard
**What to do:**
- Analyze existing dashboard
- Port pages to new structure
- Port components
- Port data fetching
- Port real-time updates
- Add new opencode-cli integration

**Recommended Agent Profile:**
- **Category**: `visual-engineering`
- **Skills**: `react-patterns`, `tailwind-css`

**Parallelization:**
- **Can Run In Parallel**: NO
- **Blocks**: Phase 9
- **Blocked By**: Phase 7

**Acceptance Criteria:**
- [ ] All pages work
- [ ] All components render
- [ ] Data fetching works
- [ ] Real-time updates work
- [ ] Responsive design maintained

**Agent-Executed QA:**
```
Scenario: Dashboard
Tool: Playwright
Steps:
1. Start dashboard: opencode dashboard
2. Navigate to localhost:3000
3. Assert: Home page loads
4. Navigate to /observability
5. Assert: Context budget widget visible
6. Navigate to /agents
7. Assert: Agent list visible
Evidence: Screenshots of each page
```

**Commit**: YES
- Message: `feat(dashboard): migrate Next.js dashboard`
- Files: `packages/dashboard/`

---

### Phase 9: Testing & Validation (Weeks 55-60)

#### TODO 9.1: Port Existing Tests
**What to do:**
- Port 253 unit tests
- Port integration tests
- Port E2E tests
- Ensure 1,676 assertions pass
- Add new tests for new features

**Recommended Agent Profile:**
- **Category**: `unspecified-high`
- **Skills**: `e2e-testing`

**Parallelization:**
- **Can Run In Parallel**: Test suites
- **Blocks**: 9.2
- **Blocked By**: Phase 8

**Acceptance Criteria:**
- [ ] All 253 tests pass
- [ ] Code coverage >80%
- [ ] E2E tests pass
- [ ] CI/CD runs tests on PR

**Agent-Executed QA:**
```
Scenario: Test suite
Tool: Bash
Steps:
1. Run: bun test
   Assert: All 253 tests pass
2. Run: bun test --coverage
   Assert: Coverage >80%
3. Run E2E tests
   Assert: All pass
Evidence: Test output, coverage report
```

**Commit**: YES
- Message: `test(all): complete test suite migration`
- Files: `**/tests/**/*.test.ts`

---

#### TODO 9.2: Create Migration Tests
**What to do:**
- Test config migration
- Test backward compatibility
- Test data migration
- Test rollback scenarios

**Recommended Agent Profile:**
- **Category**: `unspecified-high`

**Parallelization:**
- **Can Run In Parallel**: YES
- **Blocks**: Phase 10
- **Blocked By**: 9.1

**Acceptance Criteria:**
- [ ] Config migration tested
- [ ] Backward compatibility verified
- [ ] Data migration tested
- [ ] Rollback works

---

### Phase 10: Documentation & Cutover (Weeks 61-66)

#### TODO 10.1: Write Documentation
**What to do:**
- README with quick start
- Architecture documentation
- Migration guide
- API reference
- Plugin development guide
- Troubleshooting guide
- Contributing guide

**Recommended Agent Profile:**
- **Category**: `writing`

**Parallelization:**
- **Can Run In Parallel**: YES
- **Blocks**: 10.2
- **Blocked By**: Phase 9

**Acceptance Criteria:**
- [ ] All docs written
- [ ] Code examples work
- [ ] Screenshots current
- [ ] Docs published

---

#### TODO 10.2: Create Migration Tools
**What to do:**
- Config migration script
- Data migration script
- Compatibility checker
- Rollback script

**Recommended Agent Profile:**
- **Category**: `unspecified-high`

**Parallelization:**
- **Can Run In Parallel**: YES
- **Blocks**: 10.3
- **Blocked By**: 10.1

**Acceptance Criteria:**
- [ ] Migration script works
- [ ] Compatibility checker works
- [ ] Rollback script works
- [ ] Documentation complete

---

#### TODO 10.3: Announce & Support
**What to do:**
- Publish to npm
- Create GitHub release
- Write announcement blog post
- Update existing repo with deprecation notice
- Set up support channels

**Recommended Agent Profile:**
- **Category**: `unspecified-low`

**Parallelization:**
- **Can Run In Parallel**: NO
- **Blocks**: None (final)
- **Blocked By**: 10.2

**Acceptance Criteria:**
- [ ] Package published
- [ ] Release notes published
- [ ] Announcement made
- [ ] Support channels active

---

## Success Criteria

### Final Verification Commands
```bash
# Basic functionality
opencode --version
opencode --help

# Config
opencode config validate
opencode config migrate

# Agents
opencode agent list
opencode agent spawn --type prom --task "test"

# Tasks
opencode task list
opencode task queue "test task"

# Skills
opencode skill list
opencode skill info git-master

# Models
opencode model list
opencode run --model claude-sonnet "test"

# MCP
opencode mcp list
opencode mcp status tavily

# Inspector
opencode inspector

# Tests
bun test
bun test --coverage

# Dashboard
opencode dashboard
```

### Final Checklist
- [ ] All 36 packages migrated
- [ ] All 12 plugins migrated
- [ ] All 93 scripts migrated
- [ ] All 253 tests pass
- [ ] Full backward compatibility
- [ ] Documentation complete
- [ ] Migration tools working
- [ ] Performance equal or better
- [ ] No critical bugs
- [ ] Community transitioned

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Full compatibility too hard | Start with 95% compatibility, document edge cases |
| Timeline slips | Phase-gate reviews, cut scope if needed |
| Breaking changes | Extensive testing, gradual rollout |
| Plugin breakage | Test each plugin thoroughly |
| Performance regression | Benchmark at each phase |
| User confusion | Clear documentation, migration guide |
| Maintenance burden | Two parallel systems during transition |

---

## Next Steps

1. Run `/start-work` to begin execution
2. Start with Phase 0 (TODO 0.1)
3. Progress through phases sequentially
4. Review at each phase gate
5. Adjust scope/timeline as needed

**Plan Location:** `.sisyphus/plans/opencode-cli-migration.md`
