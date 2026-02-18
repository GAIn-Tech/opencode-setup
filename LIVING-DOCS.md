# Living Documentation System

This repository treats central documentation as continuously maintained system interfaces, not static prose.

## Source-of-Truth Model

- Runtime/template behaviors are defined in code and config.
- Central docs describe those behaviors and operational workflows.
- Drift is blocked by `scripts/docs-gate.mjs` using `opencode-config/docs-governance.json`.

## Central Docs

- `README.md`
- `INTEGRATION-GUIDE.md`
- `setup-instructions.md`
- `TROUBLESHOOTING.md`
- `PORTABILITY.md`

## Governance Rules

See `opencode-config/docs-governance.json`.

Rules currently enforce documentation updates for:

- core config changes (`opencode-config/**` excluding learning update records)
- skills/commands/agent system changes
- plugin and MCP behavior changes
- bootstrap and governance script changes

## Workflow

1. Make the system change.
2. Update at least one required central doc for each impacted rule.
3. Run `npm run gate:docs` locally.
4. Push only after `npm run governance:check` passes.

## Keep It Lean

- Update existing central docs first; avoid adding new docs unless needed.
- Prefer short, accurate operational guidance over duplicated narrative.
- Remove or rewrite stale sections instead of appending contradictory notes.
