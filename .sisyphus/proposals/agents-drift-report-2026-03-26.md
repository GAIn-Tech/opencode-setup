# AGENTS.md Drift Report — 2026-03-26

## Summary
Found 32 drift issues across 5 AGENTS.md files.

## Drift Details

### AGENTS.md
| Claim | Documented | Actual | Delta |
|-------|-----------|--------|-------|
| Package count | 32 | 36 | +4 |
| Package count | 32 | 36 | +4 |
| Script count | 59 | 91 | +32 |

### opencode-config/AGENTS.md
| Claim | Documented | Actual | Delta |
|-------|-----------|--------|-------|
| Skill definitions | 21 | 77 | +56 |
| Skill definitions | 12 | 77 | +65 |
| Agent definitions | 0 | 1 | +1 |

### packages/opencode-dashboard/AGENTS.md
- Missing directories declared in STRUCTURE:
  - app/ -> expected at packages/opencode-dashboard/app
  - api/ -> expected at packages/opencode-dashboard/api
  - monitoring/ -> expected at packages/opencode-dashboard/monitoring
  - models/ -> expected at packages/opencode-dashboard/models
  - orchestration/ -> expected at packages/opencode-dashboard/orchestration
  - learning/ -> expected at packages/opencode-dashboard/learning
  - memory-graph/ -> expected at packages/opencode-dashboard/memory-graph
  - providers/ -> expected at packages/opencode-dashboard/providers
  - health/ -> expected at packages/opencode-dashboard/health
  - components/ -> expected at packages/opencode-dashboard/components
  - lifecycle/ -> expected at packages/opencode-dashboard/lifecycle
  - lib/ -> expected at packages/opencode-dashboard/lib
  - data-sources/ -> expected at packages/opencode-dashboard/data-sources

### packages/opencode-model-manager/AGENTS.md
- Missing directories declared in STRUCTURE:
  - adapters/ -> expected at packages/opencode-model-manager/adapters
  - discovery/ -> expected at packages/opencode-model-manager/discovery
  - cache/ -> expected at packages/opencode-model-manager/cache
  - snapshot/ -> expected at packages/opencode-model-manager/snapshot
  - assessment/ -> expected at packages/opencode-model-manager/assessment
  - lifecycle/ -> expected at packages/opencode-model-manager/lifecycle
  - metrics/ -> expected at packages/opencode-model-manager/metrics
  - monitoring/ -> expected at packages/opencode-model-manager/monitoring
  - events/ -> expected at packages/opencode-model-manager/events
  - validation/ -> expected at packages/opencode-model-manager/validation
  - pr/ -> expected at packages/opencode-model-manager/pr

### scripts/AGENTS.md
| Claim | Documented | Actual | Delta |
|-------|-----------|--------|-------|
| Script count | 32 | 91 | +59 |
| Script count | 32 | 91 | +59 |

## Proposed Fixes

### AGENTS.md
```diff
- OpenCode ecosystem: Bun-native monorepo (32 packages) for AI agent orchestration, model management, learning engine, and dashboard. NOT Node.js-compatible without adaptation.
+ OpenCode ecosystem: Bun-native monorepo (36 packages) for AI agent orchestration, model management, learning engine, and dashboard. NOT Node.js-compatible without adaptation.
- ├── packages/              # 32 workspace packages (opencode-*)
+ ├── packages/              # 36 workspace packages (opencode-*)
- ├── scripts/               # 59 .mjs infrastructure scripts (governance, deployment, validation)
+ ├── scripts/               # 91 .mjs infrastructure scripts (governance, deployment, validation)
```

### opencode-config/AGENTS.md
```diff
- ├── skills/              # 21 skill directories (budget-aware-router, code-doctor, superpowers/*, etc.)
+ ├── skills/              # 77 skill directories (budget-aware-router, code-doctor, superpowers/*, etc.)
- - **12 Skill Dirs**: 11 standalone + superpowers/ (14 sub-skills) on disk
+ - **77 Skill Dirs**: 11 standalone + superpowers/ (14 sub-skills) on disk
- - **0 Agents on disk**: Agent definitions managed by oh-my-opencode plugin (8 agents)
+ - **1 Agents on disk**: Agent definitions managed by oh-my-opencode plugin (8 agents)
```

### packages/opencode-dashboard/AGENTS.md
```diff
- ├── app/
+ (remove this STRUCTURE entry; directory missing at packages/opencode-dashboard/app)
```
```diff
- │   └── api/                    # 40+ API routes
+ (remove this STRUCTURE entry; directory missing at packages/opencode-dashboard/api)
```
```diff
- │       ├── monitoring/         # Metrics + alerts (Prometheus format)
+ (remove this STRUCTURE entry; directory missing at packages/opencode-dashboard/monitoring)
```
```diff
- │       ├── models/             # Lifecycle, audit, transition
+ (remove this STRUCTURE entry; directory missing at packages/opencode-dashboard/models)
```
```diff
- │       ├── orchestration/      # Policy sim, status
+ (remove this STRUCTURE entry; directory missing at packages/opencode-dashboard/orchestration)
```
```diff
- │       ├── learning/           # Learning engine integration
+ (remove this STRUCTURE entry; directory missing at packages/opencode-dashboard/learning)
```
```diff
- │       ├── memory-graph/       # Memory graph visualization
+ (remove this STRUCTURE entry; directory missing at packages/opencode-dashboard/memory-graph)
```
```diff
- │       ├── providers/          # Provider status
+ (remove this STRUCTURE entry; directory missing at packages/opencode-dashboard/providers)
```
```diff
- │       └── health/             # System health checks
+ (remove this STRUCTURE entry; directory missing at packages/opencode-dashboard/health)
```
```diff
- ├── components/
+ (remove this STRUCTURE entry; directory missing at packages/opencode-dashboard/components)
```
```diff
- │   └── lifecycle/              # LifecycleBadge, StateTransitionModal, AuditLogViewer
+ (remove this STRUCTURE entry; directory missing at packages/opencode-dashboard/lifecycle)
```
```diff
- └── lib/
+ (remove this STRUCTURE entry; directory missing at packages/opencode-dashboard/lib)
```
```diff
- └── data-sources/           # Data fetching utilities
+ (remove this STRUCTURE entry; directory missing at packages/opencode-dashboard/data-sources)
```

### packages/opencode-model-manager/AGENTS.md
```diff
- ├── adapters/          # 6 provider adapters (OpenAI, Anthropic, Google, Groq, Cerebras, NVIDIA)
+ (remove this STRUCTURE entry; directory missing at packages/opencode-model-manager/adapters)
```
```diff
- ├── discovery/         # Parallel discovery engine (<10s)
+ (remove this STRUCTURE entry; directory missing at packages/opencode-model-manager/discovery)
```
```diff
- ├── cache/             # Two-tier caching (L1: 5min, L2: 1hr)
+ (remove this STRUCTURE entry; directory missing at packages/opencode-model-manager/cache)
```
```diff
- ├── snapshot/          # Snapshot store + diff engine
+ (remove this STRUCTURE entry; directory missing at packages/opencode-model-manager/snapshot)
```
```diff
- ├── assessment/        # Real benchmark assessor (HumanEval, MBPP, latency)
+ (remove this STRUCTURE entry; directory missing at packages/opencode-model-manager/assessment)
```
```diff
- ├── lifecycle/         # 5-state machine (detected→assessed→approved→selectable→default)
+ (remove this STRUCTURE entry; directory missing at packages/opencode-model-manager/lifecycle)
```
```diff
- ├── metrics/           # 4-pillar metrics (accuracy, latency, cost, robustness)
+ (remove this STRUCTURE entry; directory missing at packages/opencode-model-manager/metrics)
```
```diff
- ├── monitoring/        # Metrics collector + alert manager
+ (remove this STRUCTURE entry; directory missing at packages/opencode-model-manager/monitoring)
```
```diff
- ├── events/            # Change event system
+ (remove this STRUCTURE entry; directory missing at packages/opencode-model-manager/events)
```
```diff
- ├── validation/        # Catalog validator (12 checks)
+ (remove this STRUCTURE entry; directory missing at packages/opencode-model-manager/validation)
```
```diff
- └── pr/                # PR generator for catalog updates
+ (remove this STRUCTURE entry; directory missing at packages/opencode-model-manager/pr)
```

### scripts/AGENTS.md
```diff
- 32 infrastructure scripts (.mjs) for governance, deployment, validation, and automation. Core infrastructure, not utilities.
+ 91 infrastructure scripts (.mjs) for governance, deployment, validation, and automation. Core infrastructure, not utilities.
- - **Governance-Heavy**: 32 scripts for validation/governance (unusual for typical projects)
+ - **Governance-Heavy**: 91 scripts for validation/governance (unusual for typical projects)
```
