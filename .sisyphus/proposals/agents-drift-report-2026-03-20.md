# AGENTS.md Drift Report — 2026-03-20

## Summary
Found 33 drift issues across 5 AGENTS.md files.

## Drift Details

### AGENTS.md
| Claim | Documented | Actual | Delta |
|-------|-----------|--------|-------|
| Package count | 32 | 35 | +3 |
| Package count | 32 | 35 | +3 |
| Script count | 59 | 86 | +27 |

- Missing directories declared in STRUCTURE:
  - .worktrees/ -> expected at .worktrees

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
| Script count | 32 | 86 | +54 |
| Script count | 32 | 86 | +54 |

## Proposed Fixes

### AGENTS.md
```diff
- OpenCode ecosystem: Bun-native monorepo (32 packages) for AI agent orchestration, model management, learning engine, and dashboard. NOT Node.js-compatible without adaptation.
+ OpenCode ecosystem: Bun-native monorepo (35 packages) for AI agent orchestration, model management, learning engine, and dashboard. NOT Node.js-compatible without adaptation.
- ├── packages/              # 32 workspace packages (opencode-*)
+ ├── packages/              # 35 workspace packages (opencode-*)
- ├── scripts/               # 59 .mjs infrastructure scripts (governance, deployment, validation)
+ ├── scripts/               # 86 .mjs infrastructure scripts (governance, deployment, validation)
```
- Remove or correct missing STRUCTURE entry `.worktrees/`.

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
- Remove or correct missing STRUCTURE entry `app/`.
- Remove or correct missing STRUCTURE entry `api/`.
- Remove or correct missing STRUCTURE entry `monitoring/`.
- Remove or correct missing STRUCTURE entry `models/`.
- Remove or correct missing STRUCTURE entry `orchestration/`.
- Remove or correct missing STRUCTURE entry `learning/`.
- Remove or correct missing STRUCTURE entry `memory-graph/`.
- Remove or correct missing STRUCTURE entry `providers/`.
- Remove or correct missing STRUCTURE entry `health/`.
- Remove or correct missing STRUCTURE entry `components/`.
- Remove or correct missing STRUCTURE entry `lifecycle/`.
- Remove or correct missing STRUCTURE entry `lib/`.
- Remove or correct missing STRUCTURE entry `data-sources/`.

### packages/opencode-model-manager/AGENTS.md
- Remove or correct missing STRUCTURE entry `adapters/`.
- Remove or correct missing STRUCTURE entry `discovery/`.
- Remove or correct missing STRUCTURE entry `cache/`.
- Remove or correct missing STRUCTURE entry `snapshot/`.
- Remove or correct missing STRUCTURE entry `assessment/`.
- Remove or correct missing STRUCTURE entry `lifecycle/`.
- Remove or correct missing STRUCTURE entry `metrics/`.
- Remove or correct missing STRUCTURE entry `monitoring/`.
- Remove or correct missing STRUCTURE entry `events/`.
- Remove or correct missing STRUCTURE entry `validation/`.
- Remove or correct missing STRUCTURE entry `pr/`.

### scripts/AGENTS.md
```diff
- 32 infrastructure scripts (.mjs) for governance, deployment, validation, and automation. Core infrastructure, not utilities.
+ 86 infrastructure scripts (.mjs) for governance, deployment, validation, and automation. Core infrastructure, not utilities.
- - **Governance-Heavy**: 32 scripts for validation/governance (unusual for typical projects)
+ - **Governance-Heavy**: 86 scripts for validation/governance (unusual for typical projects)
```
