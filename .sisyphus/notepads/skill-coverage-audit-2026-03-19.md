# Skill Coverage Audit - 2026-03-19

## Scope
- Config files scanned: `opencode-config/skills/registry.json`, `opencode-config/skills/registry.backup.json`, `opencode-config/skills/registry.schema.json`
- Implementation directories scanned: `packages/opencode-skill-*`
- Comparison basis: config skill keys in `registry.json` vs package-derived skill names (`opencode-skill-<x>` -> `skill-<x>`)

## Findings Table

| Skill Name | Config File | Package Dir | Status | Issue |
|---|---|---|---|---|
| `skill-rl-manager` | `opencode-config/skills/registry.json` | `packages/opencode-skill-rl-manager` | OK | Config entry exists and `version` matches package (`1.0.0`). |
| `learning-engine` | `opencode-config/skills/registry.json` | N/A | Broken Reference (B) | `dependencies` contains `opencode-tool-usage-tracker`, but no such skill key exists in registry. |
| `beads` | `opencode-config/skills/registry.json` | N/A | Broken Reference (B) | `synergies` contains `file-todos`, but no such skill key exists in registry. |
| `106 configured skills` (all except `skill-rl-manager`) | `opencode-config/skills/registry.json` | N/A | Orphan Config (A) | Configured skills have no corresponding `packages/opencode-skill-*` implementation directory. |
| `registry.backup.json` snapshot | `opencode-config/skills/registry.backup.json` | N/A | Stale Backup (C) | Backup contains 38 skills while active registry contains 107; snapshot is not current runtime truth. |

## Severity Ranking
- **A (critical gap)**: 106 orphan configured skills without `opencode-skill-*` package implementations.
- **B (mismatch/broken linkage)**: 2 broken inter-skill references in active registry (`learning-engine` -> `opencode-tool-usage-tracker`, `beads` -> `file-todos`).
- **C (minor)**: `registry.backup.json` is stale relative to active `registry.json`.

## Summary Counts
- Total configured skills (`registry.json`): **107**
- Total implementation packages (`packages/opencode-skill-*`): **1**
- Matched config <-> implementation pairs: **1** (`skill-rl-manager`)
- Orphan configured skills (no implementation package): **106**
- Implementation packages missing config entries: **0**
- Version mismatches (config `version` vs package.json): **0**
- Broken skill references: **2**

## Remediation Steps
1. **A-level**: Decide canonical source for skill implementations. If package-backed skills are required, add missing `packages/opencode-skill-*` packages for orphaned entries, or mark non-package skills explicitly in config metadata (e.g., `implementation: "external"|"builtin"|"plugin"`) and exempt from package parity checks.
2. **B-level**: Fix broken references in `registry.json`:
   - Replace/remove `learning-engine.dependencies: ["opencode-tool-usage-tracker"]` with a valid skill key.
   - Replace/remove `beads.synergies: ["file-todos"]` with a valid skill key.
3. **C-level**: Regenerate or archive `registry.backup.json` with clear non-runtime labeling to avoid audit noise.
4. Add a CI audit script to enforce: (a) broken reference detection, (b) version parity for package-backed skills, and (c) explicit implementation-type annotations.

## Orphan Configured Skills (A)
`accessibility-audit`, `accessibility-testing`, `agent-browser`, `angular-development`, `api-design-principles`, `api-security`, `architecture-design`, `aws-cloud`, `beads`, `brainstorming`, `budget-aware-router`, `c4-architecture`, `ci-cd-automation`, `clean-architecture`, `code-doctor`, `codebase-auditor`, `codebase-memory`, `competitive-analysis`, `context-governor`, `context7`, `data-pipelines`, `database-design`, `database-migration`, `dcp`, `ddd-context-mapping`, `ddd-database-patterns`, `ddd-strategic-design`, `dev-browser`, `dispatching-parallel-agents`, `distill`, `django-development`, `docker-containerization`, `e2e-testing`, `eval-harness`, `evaluation-harness-builder`, `event-sourcing`, `executing-plans`, `fastapi-development`, `finishing-a-development-branch`, `frontend-ui-ux`, `git-master`, `github-actions`, `github-triage`, `go-development`, `graphdb-bridge`, `grep`, `gtm-strategy`, `incident-commander`, `innovation-migration-planner`, `integration-layer`, `kubernetes-orchestration`, `laravel-development`, `learning-engine`, `linting-standards`, `llm-ops`, `load-testing`, `memory-graph`, `microservices-patterns`, `ml-engineering`, `model-benchmark`, `model-router-x`, `monitoring-observability`, `pentesting`, `performance-testing`, `playwright`, `plugin-preload-skills`, `postgresql-optimization`, `pricing-strategy`, `product-management`, `prompt-engineering`, `proofcheck`, `rag-implementation`, `react-patterns`, `receiving-code-review`, `requesting-code-review`, `research-builder`, `responsive-design`, `runbooks`, `rust-development`, `screen-reader-testing`, `secure-coding`, `security-auditing`, `sequentialthinking`, `showboat-wrapper`, `skill-orchestrator-runtime`, `stakeholder-communication`, `subagent-driven-development`, `supermemory`, `system-design`, `systematic-debugging`, `tailwind-css`, `task-orchestrator`, `tech-debt-assessment`, `terraform-iac`, `test-driven-development`, `threat-modeling`, `token-reporter`, `tool-usage-tracker`, `using-git-worktrees`, `using-superpowers`, `vector-databases`, `verification-before-completion`, `vulnerability-scanning`, `websearch`, `writing-plans`, `writing-skills`
