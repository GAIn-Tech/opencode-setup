# Innovation Hotspot Inventory - OpenCode System

## Scope Boundary
- **Target**: OpenCode monorepo (36 packages) for AI agent orchestration
- **Focus Areas**: Performance, robustness, flexibility, extensibility improvements
- **Exclusions**: Pure bug fixing, routine maintenance, cosmetic changes

## Candidate Domains Identified

### 1. Learning Engine Orchestration System
- **Location**: `packages/opencode-learning-engine/`
- **Evidence**: 
  - CLI-first package with sophisticated pattern extraction, meta-awareness tracking
  - Orchestration advisor with anti-pattern detection (shotgun_debug, repeated_mistake, etc.)
  - Feedback loop: advise() → learnFromOutcome()
  - Governance system that makes learning GOVERN routing
  - File: `packages/opencode-learning-engine/src/orchestration-advisor.js` (763 lines)
  - File: `packages/opencode-learning-engine/src/anti-patterns.js`
  - File: `packages/opencode-learning-engine/src/positive-patterns.js`
- **Current Investment Signals**:
  - High architecture depth (multiple interconnected systems)
  - Prior experiments evident in pattern detection systems
  - Extensive tests and documentation
  - High PR volume indicated by active development
- **Complexity/Nuance Indicators**:
  - Asymmetric weighting (anti-patterns STRONG, positives SOFT)
  - Multi-dimensional context awareness (task_type, files, error_type, attempt_number, quota_signal)
  - Economic resilience integration (quota-aware-routing)
  - Telemetry and observability features

### 2. Model Manager Lifecycle System
- **Location**: `packages/opencode-model-manager/`
- **Evidence**:
  - SQLite-backed audit.db with hash chain integrity
  - 5-state lifecycle machine: detected→assessed→approved→selectable→default
  - Risk-based approval: 0-50 auto, 50-80 manual, >80 block
  - Two-tier caching (L1: 5min, L2: 1hr)
  - Parallel discovery engine (<10s)
  - Real benchmark assessment (HumanEval, MBPP, latency)
  - PR automation for catalog updates
  - File: `packages/opencode-model-manager/src/lifecycle/state-machine.js`
  - File: `packages/opencode-model-manager/src/lifecycle/audit-logger.js`
  - File: `packages/opencode-model-manager/src/assessment/model-assessor.js`
- **Current Investment Signals**:
  - Very high architecture depth (6 provider adapters, discovery engine, cache layer, snapshot store, etc.)
  - Extensive test suite (320 tests, 1,845 assertions)
  - Automation focus (PR generator, operational automation)
  - Monitoring and metrics collection
- **Complexity/Nuance Indicators**:
  - Multi-provider normalization complexity
  - State transition guards preventing illegal transitions
  - Immutable audit log with tamper detection
  - Snapshot-based diff engine with 100% accuracy
  - Risk factor modeling in auto-approval rules

### 3. Context Governor System
- **Location**: `packages/opencode-context-governor/`
- **Evidence**:
  - Active token budget controller for OpenCode sessions
  - Tracks per-model, per-session token consumption
  - Configurable warn(75%)/error(80%) thresholds
  - MCP server and CLI interfaces
  - Persistence to `~/.opencode/session-budgets.json`
  - Model-specific budgets (claude-opus-4-6: 180k, claude-sonnet-4-5: 200k, etc.)
  - File: `packages/opencode-context-governor/src/index.js`
  - File: `packages/opencode-context-governor/src/mcp-server.mjs`
- **Current Investment Signals**:
  - Moderate architecture depth (governor core + MCP integration)
  - Focus on session management and resource protection
  - Integration with learning engine via quota_signal
  - Evidence of active use in orchestration advisor
- **Complexity/Nuance Indicators**:
  - Per-model, per-session tracking complexity
  - Economic signal integration (quota risk calculation)
  - Fallback application detection as risk multiplier
  - Threshold-based alerting system

### 4. Dashboard Monitoring System
- **Location**: `packages/opencode-dashboard/`
- **Evidence**:
  - Next.js 14 dashboard for OpenCode monitoring
  - Read-only monitoring interface (live monitoring, workflow tree, evidence viewer)
  - 40+ API routes under src/app/api/
  - Uses better-sqlite3 for data access
  - Reads from `.sisyphus/state/sisyphus.db`
  - File: `packages/opencode-dashboard/src/app/layout.tsx`
  - File: `packages/opencode-dashboard/src/app/api/monitoring/route.ts`
  - File: `packages/opencode-dashboard/src/app/api/models/lifecycle/route.ts`
- **Current Investment Signals**:
  - High architecture depth (Next.js App Router with 40+ API routes)
  - Monitoring-focused design
  - Integration with model manager and learning engine
  - Evidence visualization capabilities
- **Complexity/Nuance Indicators**:
  - Multi-source support (SQLite state stores and filesystem logs)
  - Dual format APIs (JSON + Prometheus metrics)
  - Workflow tree visualization complexity
  - Evidence viewer for detailed inspection

### 5. Sisyphus State Machine System
- **Location**: `packages/opencode-sisyphus-state/`
- **Evidence**:
  - Durable execution state machine for Sisyphus agents
  - SQLite-backed workflow state with checkpoint/resume
  - Exponential backoff retries for failed steps
  - Parallel execution support (fan-out/fan-in)
  - Built-in integrations: Governor, Router-X, SkillRL, Showboat
  - File: `packages/opencode-sisyphus-state/src/index.js`
  - File: `packages/opencode-sisyphus-state/src/workflow-loader.js`
  - File: `packages/opencode-sisyphus-state/src/workflow-registry.js`
- **Current Investment Signals**:
  - Moderate-high architecture depth (state machine + integrations)
  - Focus on durability and resilience
  - Test database artifacts indicate extensive testing (244 test-*.db files)
  - Event sourcing capabilities
- **Complexity/Nuance Indicators**:
  - Checkpoint/resume mechanism complexity
  - Parallel execution fan-out/fan-in logic
  - Integration point management (multiple subsystem wrappers)
  - Audit event logging and transitions

### 6. Cross-System Integration Points
- **Location**: Throughout system (learning engine → model manager, context governor → orchestrator, etc.)
- **Evidence**:
  - Learning engine's quota_signal integration with context governor
  - Orchestration advisor's agent/skill recommendations feeding into oh-my-opencode
  - Model manager's metadata potentially informing orchestration decisions
  - Dashboard consuming data from multiple subsystems
  - Sisyphus state integrating with governor, router, skill rl, showboat
  - File references showing cross-package dependencies
- **Current Investment Signals**:
  - Emerging integration patterns (workspace:* dependencies)
  - Event-based communication (learning engine hooks)
  - Shared context passing between systems
  - Evidence of intentional integration design
- **Complexity/Nuance Indicators**:
  - Coupling vs cohesion trade-offs
  - Data consistency challenges across systems
  - Integration point failure modes
  - Versioning and compatibility concerns

## Innovation Hotspot Scoring Model Preparation

For each candidate domain, I will assess:
1. **VarianceNuance** (complexity, contextual nuance, architecture branching, unresolved tradeoffs) - 0.0-1.0
2. **PotentialValue** (expected impact if solved well across product and engineering outcomes) - 0.0-1.0  
3. **InverseAttention** (1 - AttentionDepth; high when area is underexplored or lacks overlap with existing solutions) - 0.0-1.0
4. **Confidence** (evidence quality multiplier, default 0.85; drop when evidence is weak)

Using weights: wv=1.20, wp=1.50, wa=1.35

Formula: IHS = (VarianceNuance ^ wv) * (PotentialValue ^ wp) * (InverseAttention ^ wa) * Confidence

## Next Steps
1. Score each domain on the four dimensions using concrete evidence
2. Calculate Innovation Hotspot Scores
3. Rank domains by IHS
4. For top 3-5 domains, propose 2-4 innovation directions each
5. Enter divergence phase to capture expected value, risks, migration blast radius