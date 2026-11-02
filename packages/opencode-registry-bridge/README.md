# opencode-registry-bridge

Codegen tool that auto-generates `registry.json` skill entries from opencode infrastructure packages. Bridges the gap between `packages/` (implementation) and `registry.json` (skill discovery).

## What it does

Reads `package.json` + main entry file for 14 infrastructure packages and emits registry-compatible skill entries conforming to `opencode-config/skills/registry.schema.json`.

## Mapping rules

| Package field | Registry field |
|---|---|
| `package.json description` | `description` |
| `package.json keywords[]` | `tags[]` |
| `package.json keywords + name` | `triggers[]` (natural-language variants) |
| `package.json dependencies[]` | `synergies[]` (intersection with other target packages) |
| `main export class names` | `inputs[].name` |
| `keyword domain inference` | `category` |
| internal package | `source: "builtin"` |

## Workflow

```bash
# 1. Generate entries (safe — writes to generated/ only)
node src/generate-entries.mjs

# 2. Preview what would change (dry-run)
node src/merge-to-registry.mjs --dry-run

# 3. Actually merge into registry.json (idempotent — only adds new entries)
node src/merge-to-registry.mjs --apply
```

## Target packages

| Package | Category | Key Triggers |
|---------|----------|---|
| learning-engine | orchestration | anti-pattern, task routing advice, skill selection |
| skill-rl-manager | orchestration | orchestrate skills, hierarchical selection |
| memory-graph | memory | session error history, graph builder |
| runbooks | debugging | auto-remediation, fix error, runbook for |
| proofcheck | verification | pre-deployment gate, verify before deploy |
| eval-harness | evaluation | benchmark model, evaluate AI quality |
| tool-usage-tracker | observability | tool metrics, track usage |
| model-router-x | routing | select optimal model, cost-aware routing |
| integration-layer | orchestration | orchestrate plugins, plugin event bus |
| showboat-wrapper | verification | evidence capture, deterministic verification |
| codebase-memory | utility | index codebase, search structure |
| model-benchmark | evaluation | HumanEval, compare model performance |
| plugin-preload-skills | orchestration | skill preloading, RL-driven promotion |
| graphdb-bridge | debugging | graph database, cypher query |

## Safety

- **Idempotent**: merge script only **adds** new entries — never overwrites existing ones
- **Dry-run first**: always preview with `--dry-run` before `--apply`
- **Schema-validated**: all generated entries pass `registry.schema.json` validation

## Adding new packages

Edit `TARGET_PACKAGES` in `src/generate-entries.mjs` and re-run:

```bash
node src/generate-entries.mjs
node src/merge-to-registry.mjs --dry-run
```
