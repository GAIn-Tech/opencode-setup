# OpenCode-Setup Codebase Architecture Overview

**Generated**: 2026-03-16  
**Status**: 10/11 backlog items complete (model-management-protocol in progress)  
**Working Directory**: `C:\Users\jack\work\opencode-setup`

---

## Executive Summary

OpenCode-setup is a **Bun-native monorepo** (33 packages, 12 external plugins, 46+ infrastructure scripts) implementing a sophisticated AI agent orchestration system with:

- **Wave-based development** (8 completed waves, Wave 12 in progress)
- **Context-aware token budgeting** (75% WARNING, 80% CRITICAL thresholds)
- **Automated model management** (discovery, lifecycle, PR generation)
- **Learning engine** with anti-pattern detection
- **Disaster recovery** system (Python 3 stdlib + Bash only)
- **Governance-heavy CI** (46 validation scripts)

**Maximum ROI opportunities**: Model Management Protocol completion, Dashboard file-watcher fix, Config coherence migration, Plugin npm publishing.

---

## System Scale & Composition

### Packages (33 total)

| Category | Count | Examples |
|----------|-------|----------|
| **Core Infrastructure** | 8 | logger, errors, config-loader, crash-guard, health-check |
| **Model Management** | 3 | model-manager, model-router-x, model-benchmark |
| **State & Persistence** | 3 | sisyphus-state, backup-manager, memory-graph |
| **Learning & Orchestration** | 3 | learning-engine, skill-rl-manager, integration-layer |
| **Safety & Governance** | 3 | proofcheck, runbooks, validator |
| **Dashboard & UI** | 2 | dashboard, dashboard-launcher |
| **Utilities & Bridges** | 8 | circuit-breaker, feature-flags, graphdb-bridge, etc. |

### External Plugins (12 total)

| Plugin | Version | Purpose |
|--------|---------|---------|
| `oh-my-opencode` | 3.5.2 | 8 agents + 46 skills + orchestration |
| `opencode-antigravity-auth` | 1.4.6 | Google OAuth rotation (3 accounts) |
| `opencode-supermemory` | 2.0.1 | Cross-session persistent memory |
| `@tarquinen/opencode-dcp` | 2.1.1 | Dynamic context pruning |
| `cc-safety-net` | 0.7.1 | Blocks destructive commands |
| `@azumag/opencode-rate-limit-fallback` | 1.67.0 | Auto-fallback on rate limit |
| `@mohak34/opencode-notifier` | 0.1.18 | OS notifications |
| `opencode-plugin-langfuse` | 0.1.8 | LLM tracing & observability |
| `opencode-plugin-preload-skills` | 1.8.0 | Smart contextual skill loading |
| `envsitter-guard` | 0.0.4 | Blocks .env reads |
| `opencode-antigravity-quota` | 0.1.6 | Quota visibility |
| `opencode-pty` | 0.2.1 | Interactive/background process control |

### MCP Servers (9 total)

| Server | Type | Status | Purpose |
|--------|------|--------|---------|
| `context7` | local | ✅ Enabled | RAG knowledge base queries |
| `sequentialthinking` | local | ✅ Enabled | Deep reasoning with think chains |
| `websearch` | local | ✅ Enabled | Real-time web search (no API key) |
| `grep` | local | ✅ Enabled | Fast code pattern search |
| `distill-mcp` | local | ✅ Enabled | Token optimization via compression |
| `supermemory` | remote | ✅ Enabled | Cross-session memory persistence |
| `tavily` | local | ❌ Disabled | Requires `TAVILY_API_KEY` |
| `playwright` | local | ❌ Disabled | Heavy (browser automation) |
| `github` | local | ❌ Disabled | Requires `GITHUB_TOKEN` |

### Agents (8 total)

| Agent | Model | Role |
|-------|-------|------|
| `sisyphus` | claude-opus-4-6 | Primary orchestrator |
| `oracle` | claude-opus-4-6 | High-IQ consultant |
| `atlas` | claude-sonnet-4-5 | Mapping/exploration |
| `metis` | claude-sonnet-4-5 | Pre-planning analyst |
| `momus` | claude-sonnet-4-5 | Plan reviewer |
| `librarian` | antigravity-gemini-3-flash | Reference search |
| `hephaestus` | antigravity-gemini-3-flash | Builder |
| `prometheus` | antigravity-gemini-3-flash | Planner |

### Skills (46 total)

- **14 globally enabled**: brainstorming, git-master, playwright, requesting-code-review, superpowers/*, etc.
- **32 on-demand**: Available via task-orchestrator skill for dynamic selection

### Infrastructure Scripts (46+ .mjs files)

**Core governance**:
- `learning-gate.mjs` - Anti-pattern detection
- `deployment-state.mjs` - Workflow validation
- `health-check.mjs` - System diagnostics
- `integrity-guard.mjs` - File/config validation

**Model management**:
- `validate-models.mjs` - Cross-file validation (12 files, forbidden patterns)
- `weekly-model-sync.mjs` - Weekly validation + schema age check
- `model-rollback.mjs` - Timestamp/hash-based recovery

**Setup & verification**:
- `setup-resilient.mjs` - 6-step setup (install, config, validation, health, learning, state)
- `verify-setup.mjs` - Comprehensive verification
- `verify-portability.mjs` - Portability audit

---

## Core Architectural Patterns

### 1. Wave-Based Development

Features organized by "Wave" with dedicated plans:

| Wave | Status | Focus | Key Deliverables |
|------|--------|-------|------------------|
| Wave 5 | ✅ Complete | Disaster Recovery | backup.sh, validate.sh, recover.sh |
| Wave 6 | ✅ Complete | Safety & Governance | proofcheck, runbooks, safety-net |
| Wave 7 | ✅ Complete | Model Router & Fallback | model-router-x, 16-model chain |
| Wave 8 | ✅ Complete | Dashboard & State Machine | dashboard (Next.js), sisyphus-state |
| Wave 9 | ✅ Complete | Learning Engine | learning-engine, skill-rl-manager |
| Wave 10 | ✅ Complete | System Hardening | crash-guard, circuit-breaker |
| Wave 11 | ✅ Complete | Context Management | context-governor, distill, context7 |
| Wave 12 | 🔄 In Progress | Model Management Protocol | adapters, discovery, state machine, PR automation |

**Plan Location**: `.sisyphus/plans/wave*.md`

### 2. Bun-First Monorepo

- **Runtime**: Bun 1.3.10 (NOT Node.js compatible without adaptation)
- **Config**: `bunfig.toml`, `.bun-version`
- **Workspaces**: `packages/*` (33 packages)
- **Build**: No build step (source consumed directly except dashboard/.next/)
- **Module Mix**: ESM (type: "module") and CJS (type: "commonjs") inconsistently

### 3. Config Fragmentation (6+ files)

| File | Purpose | Size |
|------|---------|------|
| `opencode.json` | Plugins + MCPs + models | 116KB |
| `oh-my-opencode.json` | Agents + model overrides | - |
| `compound-engineering.json` | Skills + commands + categories | - |
| `config.yaml` | Global rules, delegation standards | - |
| `central-config.json` | NEW (Wave 12) - unified schema | - |
| `.opencode.config.json` | Legacy | - |

**Issue**: Multiple truth sources, drift detection needed

### 4. Governance-Heavy CI

46 .mjs scripts are **core infrastructure** (not utilities):

- **Learning gate**: Blocks commits with anti-patterns
- **Deployment state**: Validates workflow transitions
- **Health checks**: System diagnostics (11KB script)
- **Integrity guard**: File/config validation
- **Skill routing**: Dynamic skill selection gates

---

## Major Components & Integration Points

### A. Model Management System (Wave 12 - FINAL BACKLOG ITEM)

**Status**: Plan complete (957 lines), implementation in progress  
**Location**: `packages/opencode-model-manager/src/`  
**Estimated Effort**: 40-60 hours across 8 waves  
**Blocker**: None (depends on #5+#10, both done)

#### Deliverables

| Component | Location | Status |
|-----------|----------|--------|
| Provider Adapters (6) | `adapters/` | Planned |
| Discovery Engine | `discovery/` | Planned |
| Cache Layer (2-tier) | `cache/` | Planned |
| State Machine (5-state) | `lifecycle/` | Planned |
| Diff Engine | `diff/` | Planned |
| PR Automation | `pr/` | Planned |
| Dashboard Integration | `opencode-dashboard/src/app/models/` | Planned |
| CI Workflow | `.github/workflows/model-catalog-sync.yml` | Disabled |
| Documentation | `docs/model-management/` | Planned |

#### Critical Gaps

1. **Discovery-to-catalog pipeline incomplete**
   - Detection exists (ModelDiscovery.js)
   - Auto-update doesn't exist
   - Manual intervention required

2. **Multiple truth sources**
   - `policies.json` (routing policies)
   - `opencode.json` (model defaults)
   - `catalog-2026.json` (19 models)
   - `strategies` (provider-specific)

3. **Static metadata drifts quickly**
   - Pricing tables outdated
   - Anthropic uses hardcoded list (no API polling)
   - No automated PR creation

4. **CI workflow disabled**
   - `.github/workflows-disabled/model-catalog-sync.yml`
   - Needs enablement + testing

#### Lifecycle State Machine

```
detected → assessed → approved → selectable → default
```

**Transitions**:
- detected: New model discovered from provider
- assessed: 5-phase assessment (simulated benchmarks)
- approved: Human approval via PR
- selectable: Available for routing policies
- default: Recommended for new tasks

#### Provider Adapters (6)

| Provider | API | Polling Interval | Notes |
|----------|-----|------------------|-------|
| OpenAI | REST | 60m | Hardcoded list |
| Anthropic | REST | 30m | Hardcoded list |
| Google | REST | 30m | Gemini family |
| Groq | REST | 30m | Fast inference |
| Cerebras | REST | 30m | Wafer-scale |
| NVIDIA | REST | 30m | NIM platform |

#### Two-Tier Caching

- **L1 (In-Memory)**: 5m TTL, stale-while-revalidate
- **L2 (Persistent)**: 1h TTL, SQLite backend
- **Pattern**: Immediate return + background refresh

#### Audit Trail

Every transition signed with:
- Source endpoint
- Timestamp
- Payload hash
- Approver (for approved → selectable)

### B. Context Management System (Wave 11 - COMPLETE)

**Location**: `packages/opencode-context-governor/`, `packages/opencode-integration-layer/src/context-bridge.js`

#### Components

| Component | Purpose | Thresholds |
|-----------|---------|-----------|
| Context Governor | Token budget tracking per session+model | 75% WARNING, 80% CRITICAL |
| ContextBridge | Advisory bridge (budget → compression recommendation) | 65% compress, 80% compress_urgent |
| Distill (DCP) | AST-based compression | 50-70% token savings |
| Context7 | Up-to-date library documentation | On-demand |
| Budget Penalty | Deprioritizes expensive models | >=80% consumed |
| Metrics Collector | Tracks compression events, Context7 lookups | Real-time |
| AlertManager | BUDGET_THRESHOLD alerts | 75%/80%/95% |
| Dashboard Widget | Context Budget panel | Color-coded bars |

#### Data Flow

```
Session tokens → Governor.consumeTokens() 
  → ContextBridge.evaluateAndCompress()
  → "none" (healthy) | "compress" (>=65%) | "compress_urgent" (>=80%)
  → Dashboard widget / AlertManager.evaluateBudget()
```

#### Key Thresholds

- **65%**: Proactive compression recommended (ContextBridge)
- **75%**: WARNING alert (AlertManager, Governor)
- **80%**: CRITICAL alert + budget-aware model penalty (Governor, ModelRouter)
- **95%**: Emergency alert (AlertManager)

### C. Learning Engine & Orchestration (Wave 9 - COMPLETE)

**Location**: `packages/opencode-learning-engine/`, `packages/opencode-skill-rl-manager/`

#### Components

| Component | Purpose |
|-----------|---------|
| LearningEngine | Anti-pattern catalog + orchestration advisor |
| OrchestrationAdvisor | Routing/skill recommendations |
| PatternExtractor | Session log analysis |
| AntiPatternCatalog | Anti-pattern storage |
| PositivePatternTracker | Positive pattern storage |
| SkillRL Manager | Hierarchical skill orchestration (arXiv:2602.08234) |

#### Integration Points

1. **task-orchestrator skill**
   - Queries SkillBank for skill selection
   - Workflow: Normalize → Inventory → Classify → Select Skills → Plan → Execute

2. **Learning gate (learning-gate.mjs)**
   - Blocks commits with anti-patterns
   - Runs before every commit

3. **Shotgun debugging prevention**
   - Triggered when attempt_number >= 3 on same file
   - Recommends systematic-debugging skill

#### Anti-Pattern Detection

**Critical Patterns**:
- Bun v1.3.x ENOENT Segfault (spawn operations)
- Core Learning Decay (weight always 1.0 if persistence === 'core')
- Atomic Write Verification (file integrity after writes)

**High Patterns**:
- Shotgun Debugging (attempt_number >= 3)

### D. Dashboard & Observability (Wave 8 - COMPLETE)

**Location**: `packages/opencode-dashboard/` (Next.js)  
**Status**: Working, missing 'chokidar' module in file-watcher.ts  
**Start**: `cd packages/opencode-dashboard && bun run dev`

#### Features

- Model matrix UI with 30s polling
- Context Budget panel (color-coded bars)
- Lifecycle badges for models
- Approval UI for new models
- Agent monitoring
- Real-time metrics

#### Known Issues

- **File-watcher.ts**: Missing 'chokidar' dependency (compilation error)
- **Impact**: Blocks Playwright testing + observability features
- **Effort to Fix**: 2-4 hours

### E. State Machine & Persistence (Wave 8 - COMPLETE)

**Location**: `packages/opencode-sisyphus-state/` (347 files)

#### Features

- Durable workflow execution with SQLite event sourcing
- Crash-resume capability
- Immutable audit logs with hash chain integrity
- Rollback system (timestamp/hash-based recovery)
- Workflow state persistence

#### Database

- **Backend**: SQLite (better-sqlite3)
- **Location**: `packages/opencode-sisyphus-state/audit.db`
- **Pattern**: Event sourcing (immutable append-only log)

### F. Model Router & Fallback System (Wave 7 - COMPLETE)

**Location**: `packages/opencode-model-router-x/`

#### Features

- Policy-based model selection by task complexity
- 16-model fallback chain (rate-limit-fallback.json)
- Circuit breaker for fault tolerance
- Live outcome tracking and optimization
- Risk-based auto-approval (0-50 auto, 50-80 manual, >80 block)

#### Fallback Chain

```
Primary → Fallback 1 → Fallback 2 → ... → Fallback 16
```

**Triggers**:
- Rate limit (429)
- Timeout
- API error (5xx)
- Context overflow

### G. Safety & Governance (Wave 6 - COMPLETE)

**Location**: `packages/opencode-proofcheck/`, `packages/opencode-runbooks/`

#### Features

- Deployment gate (git clean + tests before commit)
- Automated runbooks for 7+ error patterns
- Destructive command blocking (safety-net plugin)
- Type-safety enforcement
- Secrets protection (envsitter-guard)

#### Proofcheck Checks

- `checkGitStatus`: No uncommitted changes
- `checkTests`: All tests pass
- `checkLint`: No linting errors
- `checkSecurity`: No security vulnerabilities
- `checkBranchSync`: Branch in sync with remote

### H. Disaster Recovery System (Wave 5 - COMPLETE)

**Location**: `~/.opencode-dr/` (Python 3 stdlib + Bash only)

#### Components

| Component | Purpose |
|-----------|---------|
| `backup.sh` | 7-rotation, tar+gzip, SHA256 manifests |
| `validate.sh` | 5 Python health checks |
| `recover.sh` | Interactive menu: list/restore/emergency-reset/diagnose/quarantine |
| `test-recovery.sh` | 5 integration tests |

#### Features

- **Rotation**: 7-day backup rotation
- **Integrity**: SHA256 manifests for verification
- **Emergency Config**: Google provider (gemini-2.5-flash) + supermemory/context7 MCPs only
- **Compatibility**: Git-Bash compatible for Windows
- **Dependencies**: Python 3 stdlib + Bash only (no Bun/opencode deps)

---

## High-ROI Improvement Opportunities

### TIER 1: CRITICAL (Blocks Completion)

#### 1. Model Management Protocol Completion (Wave 12)

**Impact**: Enables automated model discovery + PR generation  
**Effort**: 40-60 hours  
**ROI**: Eliminates manual model catalog updates, enables continuous provider sync  
**Blocker**: None (depends on #5+#10, both done)  
**Status**: Plan complete, implementation in progress

**Next Steps**:
1. Implement 6 provider adapters (OpenAI, Anthropic, Google, Groq, Cerebras, NVIDIA)
2. Build discovery engine with circuit breakers
3. Implement 2-tier cache (L1: 5m, L2: 1h)
4. Build state machine (5-state lifecycle)
5. Implement diff engine + PR automation
6. Integrate with dashboard
7. Enable CI workflow
8. Document + test

**Critical Path**: Wave 1 (Adapters) → Wave 2 (Discovery) → Wave 5 (State Machine) → Wave 7 (PR Automation) → Wave 8 (Integration)

#### 2. Dashboard File-Watcher Module Fix

**Impact**: Unblocks dashboard development  
**Effort**: 2-4 hours  
**ROI**: Enables Playwright testing + observability features  
**Root Cause**: Missing 'chokidar' dependency in file-watcher.ts  
**Status**: Known issue, needs resolution

**Next Steps**:
1. Add 'chokidar' to dashboard package.json
2. Update file-watcher.ts imports
3. Test dashboard startup
4. Run Playwright tests

### TIER 2: HIGH (Improves Reliability)

#### 3. Config Coherence & Central Config Migration

**Impact**: Reduces config fragmentation (6+ files → unified schema)  
**Effort**: 20-30 hours  
**ROI**: Eliminates drift, simplifies onboarding, enables config validation  
**Current**: central-config.json exists, migration script (migrate-central-config.mjs) in progress  
**Status**: Wave 12 tasks 6-8 in progress

**Next Steps**:
1. Complete central-config.json schema
2. Implement migrate-central-config.mjs
3. Add verify-setup.mjs check
4. Document central-config.md
5. Implement rollback + validateIntegrity in central-config-state.js

#### 4. Plugin Publishing to npm

**Impact**: Enables auto-loading of custom plugins (currently symlinked but not loaded)  
**Effort**: 8-12 hours (one-time setup + CI automation)  
**ROI**: Portability, auto-installation on new machines, proper versioning  
**Current**: 8 custom plugins available but not loaded (STATUS.md documents options)  
**Status**: Blocked on npm automation token setup

**Plugins to Publish**:
1. `@jackoatmon/opencode-model-router-x@0.1.0`
2. `@jackoatmon/opencode-plugin-healthd@0.1.0`
3. `@jackoatmon/opencode-eval-harness@0.1.0`
4. `@jackoatmon/opencode-context-governor@0.1.0`
5. `@jackoatmon/opencode-runbooks@0.1.0`
6. `@jackoatmon/opencode-proofcheck@0.1.0`
7. `@jackoatmon/opencode-memory-graph@0.1.0`
8. `@jackoatmon/opencode-fallback-doctor@0.1.0`

**Next Steps**:
1. Create npm automation token
2. Configure npm registry auth
3. Publish each package
4. Update opencode.json with published versions
5. Test auto-loading

#### 5. MCP Server Wiring Completion

**Impact**: Enables tavily, playwright, github MCPs (currently disabled)  
**Effort**: 6-10 hours  
**ROI**: Unlocks web search, browser automation, GitHub API access  
**Current**: 6/9 enabled, 3 disabled (tavily, playwright, github)  
**Status**: Requires env var setup + config updates

**Disabled MCPs**:
1. **tavily**: Requires `TAVILY_API_KEY`
2. **playwright**: Heavy (browser automation)
3. **github**: Requires `GITHUB_TOKEN`

**Next Steps**:
1. Set up API keys (TAVILY_API_KEY, GITHUB_TOKEN)
2. Update opencode.json to enable MCPs
3. Test each MCP
4. Document setup instructions

### TIER 3: MEDIUM (Improves Observability)

#### 6. Metrics & Observability Expansion

**Impact**: Real-time visibility into model routing, skill selection, context usage  
**Effort**: 15-20 hours  
**ROI**: Enables data-driven optimization, faster debugging  
**Current**: metrics-collector.js + alert-manager.js exist but incomplete  
**Status**: Partial implementation

**Next Steps**:
1. Expand metrics collection (model routing, skill selection)
2. Add real-time dashboard widgets
3. Implement alerting for anomalies
4. Document metrics schema

#### 7. Integration Test Coverage

**Impact**: Regression prevention, confidence in changes  
**Effort**: 20-30 hours  
**ROI**: Reduces bugs, enables faster iteration  
**Current**: 138 test files in packages/opencode-integration-layer/tests/  
**Status**: Partial coverage, needs expansion

**Next Steps**:
1. Audit test coverage (identify gaps)
2. Add tests for critical paths
3. Implement regression test harness
4. Document test strategy

#### 8. Documentation Coherence

**Impact**: Reduces onboarding friction, improves maintainability  
**Effort**: 10-15 hours  
**ROI**: Faster contributor ramp-up, fewer support questions  
**Current**: 20+ markdown files at root, some stale  
**Status**: Needs consolidation + versioning

**Next Steps**:
1. Consolidate docs into `docs/` directory
2. Create table of contents
3. Version documentation
4. Add examples for each component

### TIER 4: LOW (Nice-to-Have)

#### 9. Performance Optimization (Wave 11 Phase 1)

**Impact**: Faster execution, reduced latency  
**Effort**: 10-15 hours  
**ROI**: Better user experience  
**Status**: Partial implementation

**Optimizations**:
- Model ID resolution cache: O(1) Map lookup
- Skill-RL memoization: 10-min TTL, 200-entry max
- Advice cache: 5-min TTL, 500-entry max
- Binary insertion sort in perf tracker
- Stale session cleanup with 1-hour TTL

#### 10. Skill System Upgrade

**Impact**: Better skill selection, reduced cognitive load  
**Effort**: 15-20 hours  
**ROI**: Improved task execution  
**Status**: Planned

**Next Steps**:
1. Consolidate 46 skills into hierarchical taxonomy
2. Implement skill affinity scoring
3. Enable dynamic skill loading based on task context
4. Document skill hierarchy

---

## Anti-Patterns & Critical Constraints

### CRITICAL (Must Avoid)

1. **Bun v1.3.x ENOENT Segfault**
   - **Issue**: spawn operations crash on ENOENT
   - **Solution**: ALWAYS check command existence first
   - **Location**: `packages/opencode-crash-guard/src/spawn-guard.js`

2. **Core Learning Decay**
   - **Issue**: If learning.persistence === 'core', weight is ALWAYS 1.0 (never decays)
   - **Solution**: Use 'session' or 'project' persistence for decaying weights
   - **Location**: `packages/opencode-learning-engine/src/index.js:134`

3. **Atomic Write Verification**
   - **Issue**: File corruption after atomic writes
   - **Solution**: ALWAYS verify file integrity after atomic writes
   - **Pattern**: Read-back verification + hash comparison

### HIGH (Forbidden)

1. **Shotgun Debugging**
   - **Issue**: Multiple failed attempts on same file without systematic approach
   - **Trigger**: attempt_number >= 3 on same file
   - **Solution**: Use systematic-debugging skill
   - **Location**: `packages/opencode-learning-engine/src/orchestration-advisor.js:441`

### SQL

1. **ON CONFLICT DO NOTHING**
   - **Issue**: Intentional for idempotent logging
   - **Solution**: Do NOT change to UPDATE
   - **Location**: `packages/opencode-model-manager/src/lifecycle/audit-logger.js:295`

### WARNINGS

1. **Context Budget**
   - 75% = WARNING
   - 80% = CRITICAL
   - **Location**: `packages/opencode-context-governor/src/index.js:86,90`

2. **Crash Frequency**
   - >N crashes/hour triggers WARNING
   - **Location**: `packages/opencode-crash-guard/src/crash-recovery.js:153`

---

## Execution Modes & Workflows

### Ralph Loop
- Persistence until completion
- Use for long-running tasks
- Auto-resume on failure

### Ultrawork Loop
- Maximum parallel execution
- Use for independent tasks
- Coordinated multi-agent

### Background Tasks
- Async subagent dispatch
- Non-blocking execution
- Result polling

### Swarm
- Coordinated multi-agent execution
- Shared state management
- Consensus-based decisions

### Pipeline
- Sequential agent chaining
- Output → Input flow
- Dependency management

---

## Key Commands

| Command | Purpose |
|---------|---------|
| `bun run setup` | 6-step setup (install, config, validation, health, learning, state) |
| `bun run setup:base` | Base setup without resilience wrapper |
| `bun run verify` | Comprehensive verification |
| `bun run verify:strict` | Strict verification (portability + compliance) |
| `bun run governance:check` | Run governance gates (learning-gate, deployment-state, integrity-guard) |
| `bun run models:sync` | Weekly model catalog synchronization |
| `bun run models:validate` | Validate model catalog (12 checks, 5-min timeout) |
| `bun run health` | Comprehensive system health check |
| `bun run health:system` | System health check (verbose) |
| `bun run integrity:check` | File/config integrity validation |
| `bun run config:migrate` | Migrate to central config |
| `bun run config:coherence` | Validate config coherence |
| `bun test` | Run all tests (253 tests, 1,676 assertions) |
| `cd packages/opencode-dashboard && bun run dev` | Start dashboard (Next.js) |
| `bun run skills` | List all skills |
| `bun run skills:audit` | Audit skill consistency |
| `bun run meta-kb:check` | Check meta-knowledge base drift |

---

## Configuration Files Reference

| File | Location | Purpose |
|------|----------|---------|
| `opencode.json` | `~/.config/opencode/` | Plugins + MCPs + models |
| `oh-my-opencode.json` | `~/.config/opencode/` | 8 agents + model overrides |
| `compound-engineering.json` | `~/.config/opencode/` | Skills + commands + categories |
| `config.yaml` | `~/.opencode/` | Global rules + delegation standards |
| `central-config.json` | `~/.config/opencode/` | NEW (Wave 12) - unified schema |
| `supermemory.json` | `~/.config/opencode/` | Memory filters + keyword patterns |
| `antigravity.json` | `~/.config/opencode/` | 3-account OAuth rotation |
| `rate-limit-fallback.json` | `~/.config/opencode/` | 16-model fallback chain |

---

## Disaster Recovery

### Location
`~/.opencode-dr/`

### Components

| Component | Purpose |
|-----------|---------|
| `backup.sh` | 7-rotation, tar+gzip, SHA256 manifests |
| `validate.sh` | 5 Python health checks |
| `recover.sh` | Interactive menu: list/restore/emergency-reset/diagnose/quarantine |
| `test-recovery.sh` | 5 integration tests |

### Features

- **Rotation**: 7-day backup rotation
- **Integrity**: SHA256 manifests for verification
- **Emergency Config**: Google provider (gemini-2.5-flash) + supermemory/context7 MCPs only
- **Compatibility**: Git-Bash compatible for Windows
- **Dependencies**: Python 3 stdlib + Bash only (no Bun/opencode deps)

### Usage

```bash
# Backup
~/.opencode-dr/backup.sh

# Validate
~/.opencode-dr/validate.sh

# Recover
~/.opencode-dr/recover.sh

# Test recovery
~/.opencode-dr/test-recovery.sh
```

---

## Next Steps for Maximum ROI

### Immediate (This Week)

1. **Fix Dashboard File-Watcher** (2-4 hours)
   - Add 'chokidar' dependency
   - Test dashboard startup
   - Unblocks observability features

2. **Start Model Management Protocol** (Wave 12)
   - Implement provider adapters
   - Build discovery engine
   - Critical path item

### Short-Term (This Month)

3. **Migrate to Central Config** (20-30 hours)
   - Complete central-config.json schema
   - Implement migration script
   - Reduces fragmentation

4. **Publish Custom Plugins to npm** (8-12 hours)
   - Set up npm automation token
   - Publish 8 packages
   - Enables portability

5. **Enable Remaining MCPs** (6-10 hours)
   - Set up API keys
   - Update opencode.json
   - Unlocks web search, browser automation, GitHub API

### Medium-Term (Next Quarter)

6. **Expand Metrics & Observability** (15-20 hours)
   - Real-time visibility into model routing
   - Skill selection tracking
   - Context usage analytics

7. **Improve Integration Test Coverage** (20-30 hours)
   - Regression prevention
   - Confidence in changes
   - Faster iteration

8. **Consolidate Documentation** (10-15 hours)
   - Reduce onboarding friction
   - Improve maintainability
   - Faster contributor ramp-up

---

## Related Documentation

- **AGENTS.md**: System overview, conventions, anti-patterns
- **COMPLETE-INVENTORY.md**: Detailed component inventory
- **ECOSYSTEM.md**: Dependency map, package relationships
- **STATUS.md**: Current status, plugin configuration
- **Model Management Plan**: `.sisyphus/plans/model-management-protocol.md` (957 lines)
- **Integration Map**: `docs/architecture/integration-map.md`
- **CLI vs MCP Policy**: `docs/architecture/cli-mcp-surface-policy.md`

---

**Last Updated**: 2026-03-16  
**Backlog Progress**: 10/11 items complete  
**Next Milestone**: Model Management Protocol completion (Wave 12)
