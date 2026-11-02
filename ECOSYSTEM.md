# OpenCode Ecosystem Documentation

**Generated:** 2026-02-24 | **Packages:** 34 | **Plugins:** 14

## OVERVIEW

OpenCode-setup is a Bun-native monorepo containing 34 workspace packages, 14 external plugins, and comprehensive infrastructure for AI agent orchestration, model management, and learning systems.

## PACKAGE DEPENDENCY MAP

### Core Infrastructure (No Dependencies)

**Foundational packages with zero external dependencies:**

| Package | Purpose | Dependents |
|---------|---------|------------|
| `opencode-logger` | Logging utilities | All packages (implicit) |
| `opencode-errors` | Error handling | All packages (implicit) |
| `opencode-backup-manager` | State backup/restore | opencode-sisyphus-state |
| `opencode-circuit-breaker` | Fault tolerance | opencode-model-router-x |
| `opencode-config-loader` | Config loading | opencode-dashboard-launcher, opencode-model-router-x |
| `opencode-context-governor` | Token budget management | opencode-model-router-x |
| `opencode-crash-guard` | Crash recovery | opencode-feature-flags |
| `opencode-health-check` | Health monitoring | opencode-model-router-x |
| `opencode-fallback-doctor` | Fallback validation | opencode-model-router-x |
| `opencode-feature-flags` | A/B testing | opencode-model-router-x |
| `opencode-shared-orchestration` | Orchestration utilities | opencode-integration-layer (peer) |
| `opencode-learning-engine` | Learning system | opencode-model-router-x, opencode-integration-layer (peer) |
| `opencode-skill-rl-manager` | Skill RL management | opencode-integration-layer (peer) |
| `opencode-validator` | Validation utilities | Multiple packages |
| `opencode-model-sync` | Model synchronization | CI/CD workflows |
| `opencode-plugin-lifecycle` | Plugin lifecycle | Plugin system |
| `opencode-plugin-preload-skills` | Skill preloading | Plugin system |
| `opencode-plugin-healthd` | Health daemon | Plugin system |
| `opencode-proofcheck` | Code verification | Development workflow |
| `opencode-runbooks` | Automated runbooks | Operations |
| `opencode-showboat-wrapper` | Showboat integration | External integrations |
| `opencode-eval-harness` | Evaluation framework | Testing |
| `opencode-test-utils` | Test utilities | All test suites |

### Mid-Level Packages (1-2 Dependencies)

| Package | Dependencies | Purpose |
|---------|--------------|---------|
| `opencode-goraphdb-bridge` | node-fetch | Graph database bridge |
| `opencode-graphdb-bridge` | node-fetch | Graph database bridge (alternative) |
| `opencode-memory-graph` | opencode-goraphdb-bridge | Memory graph visualization |
| `opencode-model-benchmark` | sqlite3 | Model benchmarking |
| `opencode-sisyphus-state` | better-sqlite3, uuid | State machine persistence |
| `opencode-dashboard-launcher` | opencode-config-loader | Dashboard launcher |
| `opencode-feature-flags` | opencode-crash-guard | Feature flag system |

### High-Level Packages (3+ Dependencies)

| Package | Dependencies | Purpose |
|---------|--------------|---------|
| `opencode-model-router-x` | 7 internal packages + uuid, zod | Policy-based model routing |
| `opencode-dashboard` | 10 external packages | Next.js monitoring dashboard |
| `opencode-integration-layer` | 3 peer dependencies (optional) | Integration testing |

### Special Cases

| Package | Type | Notes |
|---------|------|-------|
| `opencode-model-manager` | No package.json | Internal library, not published |
| `opencode-integration-layer` | Peer dependencies only | Optional integration with learning/orchestration |

## DEPENDENCY GRAPH

```
┌─────────────────────────────────────────────────────────────┐
│                    CORE INFRASTRUCTURE                       │
│  (logger, errors, config-loader, crash-guard, etc.)         │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌───────────────────────────┴─────────────────────────────────┐
│                    MID-LEVEL PACKAGES                        │
│  (memory-graph, sisyphus-state, model-benchmark, etc.)      │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌───────────────────────────┴─────────────────────────────────┐
│                   HIGH-LEVEL PACKAGES                        │
│  (model-router-x, dashboard, integration-layer)             │
└─────────────────────────────────────────────────────────────┘
```

## EXTERNAL DEPENDENCIES

### Production Dependencies

| Dependency | Used By | Purpose |
|------------|---------|---------|
| `better-sqlite3` | dashboard, sisyphus-state | SQLite database |
| `sqlite3` | model-benchmark | SQLite database (alternative) |
| `node-fetch` | goraphdb-bridge, graphdb-bridge | HTTP requests |
| `uuid` | model-router-x, sisyphus-state | UUID generation |
| `zod` | model-router-x, dashboard | Schema validation |
| `next` | dashboard | Next.js framework |
| `react` | dashboard | React framework |
| `react-dom` | dashboard | React DOM |
| `@xyflow/react` | dashboard | Flow diagrams |
| `chokidar` | dashboard | File watching |
| `lucide-react` | dashboard | Icons |
| `clsx` | dashboard | Class name utilities |
| `tailwind-merge` | dashboard | Tailwind utilities |

### Development Dependencies

| Dependency | Used By | Purpose |
|------------|---------|---------|
| `bun-types` | sisyphus-state | Bun TypeScript types |
| `@types/*` | dashboard | TypeScript type definitions |
| `autoprefixer` | dashboard | CSS autoprefixer |
| `eslint` | dashboard | Linting |
| `postcss` | dashboard | CSS processing |
| `tailwindcss` | dashboard | CSS framework |

## CUSTOM PACKAGE DEEP DIVES

### 1. opencode-model-manager (NEW - Wave 8)

**Purpose:** Automated model lifecycle management with discovery, assessment, approval workflow, and monitoring.

**Structure:**
```
src/
├── adapters/          # 6 provider adapters (OpenAI, Anthropic, Google, Groq, Cerebras, NVIDIA)
├── discovery/         # Parallel discovery engine (<10s)
├── cache/             # Two-tier caching (L1: 5min, L2: 1hr)
├── snapshot/          # Snapshot store + diff engine (100% accuracy)
├── assessment/        # Real benchmark assessor (HumanEval, MBPP, latency)
├── lifecycle/         # 5-state machine (detected→assessed→approved→selectable→default)
├── metrics/           # 4-pillar metrics (accuracy, latency, cost, robustness)
├── monitoring/        # Metrics collector + alert manager
├── events/            # Change event system
├── validation/        # Catalog validator (12 checks)
└── pr/                # PR generator for catalog updates
```

**Key Features:**
- **No package.json**: Internal library, not published
- **SQLite Persistence**: audit.db with tamper-evident hash chain
- **5-State Lifecycle**: detected→assessed→approved→selectable→default (no skipping)
- **Risk-Based Approval**: 0-50 auto, 50-80 manual, >80 block
- **Immutable Audit Logs**: Hash chain integrity, append-only
- **Monitoring Metrics**: Discovery success rate, cache hit/miss, state transitions, PR creation rate

**Tests:** 320 tests, 1,845 assertions, 0 failures

**Documentation:**
- `packages/opencode-model-manager/README.md` — Overview
- `packages/opencode-model-manager/ROLLBACK.md` — Rollback procedures
- `packages/opencode-model-manager/SECRETS.md` — Secrets management
- `docs/model-management/ARCHITECTURE.md` — System architecture
- `docs/model-management/API-REFERENCE.md` — API documentation
- `docs/model-management/OPERATIONS.md` — Operations guide
- `docs/model-management/TROUBLESHOOTING.md` — Troubleshooting guide

### 2. opencode-sisyphus-state (347 files)

**Purpose:** State machine for workflow orchestration with SQLite persistence.

**Structure:**
```
src/                   # 13 code files
test-*.db              # 244 test database files (cleanup needed)
tests/                 # Test suite
```

**Key Features:**
- **Test-Heavy**: 244 test database artifacts (not cleaned up)
- **Unique DB Naming**: `${TEST_DB_BASE}-${Date.now()}-${Math.random()}.db` per test
- **Low Code Ratio**: 13 code files / 347 total = 4%

**Dependencies:**
- `better-sqlite3` — SQLite database
- `uuid` — UUID generation

**Gotcha:** Test databases accumulate (244 files). Run `find . -name 'test-*.db*' -delete` to clean up.

### 3. opencode-dashboard (Next.js 14)

**Purpose:** Monitoring dashboard for OpenCode with 40+ API routes.

**Structure:**
```
src/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Root page
│   └── api/                    # 40+ API routes
│       ├── monitoring/         # Metrics + alerts (Prometheus format)
│       ├── models/             # Lifecycle, audit, transition
│       ├── orchestration/      # Policy sim, status
│       ├── learning/           # Learning engine integration
│       ├── memory-graph/       # Memory graph visualization
│       ├── providers/          # Provider status
│       └── health/             # System health checks
├── components/
│   └── lifecycle/              # LifecycleBadge, StateTransitionModal, AuditLogViewer
└── lib/
    └── data-sources/           # Data fetching utilities
```

**Key Features:**
- **Only Package with Build Step**: `.next/` build output
- **40+ API Routes**: Comprehensive monitoring and management
- **Prometheus Format**: Metrics exposed in both JSON and Prometheus format
- **Lifecycle UI Components**: LifecycleBadge, StateTransitionModal, AuditLogViewer

**Dependencies:**
- `next` — Next.js framework
- `react`, `react-dom` — React
- `better-sqlite3` — Database
- `@xyflow/react` — Flow diagrams
- `chokidar` — File watching
- `lucide-react` — Icons
- `zod` — Schema validation
- `tailwindcss` — Styling

### 4. opencode-model-router-x (Policy-Based Router)

**Purpose:** Dynamic model selection based on task complexity with live outcome tuning.

**Dependencies (7 internal packages):**
- `opencode-learning-engine` — Learning system
- `opencode-circuit-breaker` — Fault tolerance
- `opencode-context-governor` — Token budget management
- `opencode-health-check` — Health monitoring
- `opencode-fallback-doctor` — Fallback validation
- `opencode-feature-flags` — A/B testing
- `opencode-config-loader` — Config loading

**External Dependencies:**
- `uuid` — UUID generation
- `zod` — Schema validation

**Key Features:**
- **Policy-Based Routing**: Dynamic model selection
- **Live Outcome Tuning**: Continuous optimization
- **7 Internal Dependencies**: Most interconnected package

### 5. opencode-integration-layer (Test-Heavy)

**Purpose:** Integration testing layer with optional peer dependencies.

**Structure:**
```
src/                   # 5 code files
tests/                 # 138 test files
```

**Key Features:**
- **Test-Heavy**: 138 test files / 140 total = 99%
- **Peer Dependencies Only**: Optional integration with learning/orchestration
- **27:1 Test-to-Code Ratio**: Comprehensive coverage

**Peer Dependencies (all optional):**
- `opencode-skill-rl-manager`
- `opencode-learning-engine`
- `opencode-shared-orchestration`

## METADATA REPRESENTATION

### Package Metadata Schema

```json
{
  "name": "string",
  "version": "semver",
  "type": "module | commonjs",
  "main": "string (entry point)",
  "dependencies": {
    "package-name": "version | workspace:* | file:../path"
  },
  "peerDependencies": {
    "package-name": "version"
  },
  "peerDependenciesMeta": {
    "package-name": { "optional": true }
  },
  "keywords": ["array", "of", "strings"],
  "author": "string",
  "license": "string"
}
```

### Workspace Dependency Types

| Type | Format | Example | Purpose |
|------|--------|---------|---------|
| Workspace | `workspace:*` | `"opencode-goraphdb-bridge": "workspace:*"` | Monorepo internal |
| File | `file:../path` | `"opencode-logger": "file:../opencode-logger"` | Local development |
| NPM | `^version` | `"next": "14.2.3"` | External package |
| Peer | `peerDependencies` | `"opencode-learning-engine": "*"` | Optional integration |

## PACKAGE CATEGORIES

### By Purpose

| Category | Packages | Count |
|----------|----------|-------|
| **Infrastructure** | logger, errors, config-loader, crash-guard, health-check | 5 |
| **State Management** | sisyphus-state, backup-manager | 2 |
| **Model Management** | model-manager, model-router-x, model-benchmark, model-sync | 4 |
| **Monitoring** | dashboard, dashboard-launcher, plugin-healthd | 3 |
| **Testing** | test-utils, eval-harness, integration-layer, proofcheck | 4 |
| **Orchestration** | shared-orchestration, learning-engine, skill-rl-manager | 3 |
| **Resilience** | circuit-breaker, fallback-doctor, feature-flags | 3 |
| **Database** | goraphdb-bridge, graphdb-bridge, memory-graph | 3 |
| **Plugins** | plugin-lifecycle, plugin-preload-skills, plugin-healthd | 3 |
| **Utilities** | validator, context-governor, runbooks, showboat-wrapper | 4 |

### By Dependency Count

| Level | Packages | Count |
|-------|----------|-------|
| **Zero Dependencies** | 23 packages | 23 |
| **1-2 Dependencies** | 8 packages | 8 |
| **3+ Dependencies** | 3 packages (model-router-x, dashboard, integration-layer) | 3 |

### By Module Type

| Type | Packages | Count |
|------|----------|-------|
| **ESM** (`type: "module"`) | 11 packages | 11 |
| **CommonJS** (`type: "commonjs"`) | 5 packages | 5 |
| **Unspecified** (defaults to CommonJS) | 17 packages | 17 |

## EXTERNAL PLUGINS (14)

Located in `plugins/` directory:

| Plugin | Purpose |
|--------|---------|
| `oh-my-opencode` | Multi-agent orchestration (8 agents, 46 skills, 22 commands) |
| `antigravity-auth` | Google account rotation (3 accounts, hybrid strategy) |
| `opencode-dcp` | Dynamic context pruning |
| `safety-net` | Destructive command blocking |
| `rate-limit-fallback` | Auto model fallback on rate limit |
| `notifier` | OS notifications |
| `langfuse` | LLM observability & tracing |
| `compound-engineering` | AI dev tools & workflows |
| `preload-skills` | Contextual skill loading |
| `security-plugin` | Security guardrails & vuln scanning |
| `token-monitor` | Token usage analytics |
| `envsitter-guard` | Secrets protection |
| `antigravity-quota` | Antigravity quota visibility |
| `opencode-pty` | Interactive/background process control |

## SCRIPTS (32 Infrastructure Scripts)

Located in `scripts/` directory:

### Governance & Validation

| Script | Purpose |
|--------|---------|
| `learning-gate.mjs` | Learning governance checks |
| `deployment-state.mjs` | Deployment state management |
| `pr-governance.mjs` | PR governance checks |
| `docs-governance-check.mjs` | Documentation governance |
| `validate-config-coherence.mjs` | Config file consistency |
| `validate-models.mjs` | Model catalog validation (12 checks) |
| `validate-policies-structure.mjs` | Policy structure validation |
| `validate-plugin-compatibility.mjs` | Plugin compatibility checks |
| `validate-control-plane-schema.mjs` | Control plane schema validation |
| `validate-fallback-consistency.mjs` | Fallback consistency checks |

### Model Management

| Script | Purpose |
|--------|---------|
| `model-rollback.mjs` | Rollback model catalog (26KB, complex logic) |
| `weekly-model-sync.mjs` | Weekly model discovery (CI) |
| `sync-model-ids.js` | Sync model IDs |

### Setup & Installation

| Script | Purpose |
|--------|---------|
| `setup.sh` | 6-step setup (install, config, validation, health, learning, state) |
| `verify-setup.mjs` | Verify setup completion |
| `install-git-hooks.mjs` | Install git hooks |
| `install-git-hooks.sh` | Install git hooks (shell) |
| `link-packages.mjs` | Link workspace packages |
| `link-packages.sh` | Link workspace packages (shell) |
| `preflight-versions.mjs` | Preflight version checks |

### Health & Monitoring

| Script | Purpose |
|--------|---------|
| `health-check.mjs` | Comprehensive health check (11KB) |
| `health-check.sh` | Health check (shell) |
| `api-sanity.mjs` | API sanity checks |
| `smoke-pipeline.mjs` | Smoke test pipeline |

### Configuration

| Script | Purpose |
|--------|---------|
| `copy-config.mjs` | Copy config files |
| `generate-mcp-config.mjs` | Generate MCP config |
| `migrate-central-config.mjs` | Migrate central config |
| `consolidate-skills.mjs` | Consolidate skill definitions |
| `normalize-superpowers-skills.mjs` | Normalize superpowers skills |

### Utilities

| Script | Purpose |
|--------|---------|
| `opencode-with-dashboard.mjs` | Launch OpenCode with dashboard |
| `rebuild-q-runtime.mjs` | Rebuild Q runtime |
| `resolve-root.mjs` | Resolve project root |
| `fix-bun-path.ps1` | Fix Bun path (PowerShell) |

### Subdirectories

| Directory | Purpose |
|-----------|---------|
| `scripts/governance/` | Governance checks |
| `scripts/ops/` | Operations automation |
| `scripts/security/` | Security validation |
| `scripts/evals/` | Evaluation harnesses |
| `scripts/fault/` | Fault injection |
| `scripts/frontier/` | Frontier model tracking |
| `scripts/perf/` | Performance monitoring |
| `scripts/replay/` | Replay utilities |

## CONFIGURATION FILES

### Primary Configuration

| File | Size | Purpose |
|------|------|---------|
| `opencode-config/opencode.json` | 116KB | Main config (models, plugins, MCPs, permissions) |
| `opencode-config/central-config.json` | 12KB | Schema-validated config |
| `opencode-config/oh-my-opencode.json` | — | Agent model overrides |
| `opencode-config/compound-engineering.json` | — | Skills, commands, categories |
| `opencode-config/config.yaml` | — | Global rules & delegation standards |
| `.opencode.config.json` | — | Root-level config |

### Configuration Hierarchy

```
User Config (~/.config/opencode/)
  ├── opencode.json (main)
  ├── oh-my-opencode.json (agent overrides)
  └── antigravity.json (account rotation)
        ▼
Project Config (.opencode/)
  ├── opencode.json (project-specific)
  └── oh-my-opencode.json (project overrides)
        ▼
Central Config (opencode-config/)
  ├── opencode.json (116KB main)
  ├── central-config.json (schema)
  ├── oh-my-opencode.json (defaults)
  └── compound-engineering.json (skills/commands)
```

## TESTING INFRASTRUCTURE

### Test Framework

**Bun Test** (built-in, version 1.3.9 pinned)

### Test Statistics

| Metric | Value |
|--------|-------|
| Total Tests | 253 |
| Total Assertions | 1,676 |
| Failures | 0 |
| Test Files | 45 |

### Test Utilities

**Package:** `opencode-test-utils`

**Features:**
- Mock injection with call tracking
- Unique DB naming per test: `${TEST_DB_BASE}-${Date.now()}-${Math.random()}.db`
- Custom test utilities for all packages

### Test Coverage by Package

| Package | Test Files | Notes |
|---------|------------|-------|
| `opencode-model-manager` | 67 | 320 tests, 1,845 assertions |
| `opencode-integration-layer` | 138 | 27:1 test-to-code ratio |
| `opencode-sisyphus-state` | Multiple | 244 test DB artifacts |
| `opencode-dashboard` | Multiple | UI component tests |

## BUILD & CI/CD

### Build Commands

| Command | Purpose |
|---------|---------|
| `bun run build` | Build dashboard (Next.js only) |
| `bun test` | Run all tests (253 tests) |
| `bun run setup` | 6-step setup |
| `bun run verify` | Verify setup |
| `bun run governance:check` | Run governance gates |

### CI Workflows

**Active:**
- `model-catalog-sync.yml` — Weekly model discovery

**Disabled:**
- 3 workflows in `.github/workflows-disabled/`

### Governance Gates

**Pre-Deployment:**
1. `learning-gate.mjs --staged` — Learning governance
2. `deployment-state.mjs check-flow` — Deployment state

**Pre-Commit:**
- Git hooks installed via `install-git-hooks.mjs`

## DOCUMENTATION STRUCTURE

### Root Documentation

| File | Purpose |
|------|---------|
| `README.md` | Project overview |
| `INSTALL.md` | Installation guide |
| `STATUS.md` | Project status |
| `COMPLETE-INVENTORY.md` | Complete inventory |
| `MODEL_AUDIT_REPORT.md` | Model audit report |
| `LEARNING_ENGINE_ANALYSIS.md` | Learning engine analysis |
| `MOLTBOT-ADOPTION-PLAN.md` | Moltbot adoption plan |
| `AGENTS.md` | Root knowledge base (NEW) |
| `ECOSYSTEM.md` | This file |

### Package Documentation

| Package | Documentation |
|---------|---------------|
| `opencode-model-manager` | README.md, ROLLBACK.md, SECRETS.md, AGENTS.md |
| `opencode-dashboard` | README.md, AGENTS.md |
| `opencode-sisyphus-state` | README.md, AGENTS.md |
| `packages/` | README.md (overview) |

### Specialized Documentation

| Directory | Purpose |
|-----------|---------|
| `docs/model-management/` | Model management system (4 guides) |
| `docs/architecture/` | Architecture documentation |
| `docs/skills/` | Skill documentation |
| `.sisyphus/docs/` | Sisyphus workflow documentation |

### AGENTS.md Hierarchy

| Location | Lines | Purpose |
|----------|-------|---------|
| `./AGENTS.md` | 119 | Root knowledge base |
| `packages/opencode-model-manager/AGENTS.md` | 80 | Model lifecycle system |
| `packages/opencode-dashboard/AGENTS.md` | 50 | Next.js dashboard |
| `packages/opencode-sisyphus-state/AGENTS.md` | 30 | State management |
| `scripts/AGENTS.md` | 60 | Infrastructure scripts |
| `opencode-config/AGENTS.md` | 50 | Central config hub |
| `packages/opencode-integration-layer/AGENTS.md` | 25 | Integration tests |
| `local/oh-my-opencode/AGENTS.md` | 119 | Oh-my-opencode plugin |
| `local/oh-my-opencode/src/**/AGENTS.md` | 30+ files | Subdirectory knowledge bases |

## QUICK REFERENCE

### Find a Package

| Need | Package |
|------|---------|
| Logging | `opencode-logger` |
| Error handling | `opencode-errors` |
| Config loading | `opencode-config-loader` |
| State management | `opencode-sisyphus-state` |
| Model routing | `opencode-model-router-x` |
| Model lifecycle | `opencode-model-manager` |
| Dashboard | `opencode-dashboard` |
| Testing | `opencode-test-utils` |
| Learning | `opencode-learning-engine` |
| Monitoring | `opencode-plugin-healthd` |

### Find Documentation

| Need | Location |
|------|----------|
| Package overview | `packages/{name}/README.md` |
| Package knowledge base | `packages/{name}/AGENTS.md` |
| Model management | `docs/model-management/` |
| Architecture | `docs/architecture/` |
| Skills | `docs/skills/` |
| Ecosystem | `ECOSYSTEM.md` (this file) |
| Root knowledge base | `AGENTS.md` |

### Find Scripts

| Need | Script |
|------|--------|
| Setup | `scripts/setup.sh` |
| Health check | `scripts/health-check.mjs` |
| Model validation | `scripts/validate-models.mjs` |
| Model rollback | `scripts/model-rollback.mjs` |
| Governance | `scripts/learning-gate.mjs` |
| Config validation | `scripts/validate-config-coherence.mjs` |

---

**Next:** See `KNOWLEDGE-GRAPH.json` for navigable graph structure of the entire ecosystem.
