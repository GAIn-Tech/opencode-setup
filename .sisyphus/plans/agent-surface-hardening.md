# Agent Surface Hardening

## Goal
Make plugin-managed agent surfaces and host-facing MCP surfaces durable by fixing runtime config sync, removing stale on-disk agent mirrors, and adding regression coverage so phantom agent options cannot silently return.

## Architecture
Treat `opencode-config/oh-my-opencode.json` as the canonical source for named agents and `opencode-config/opencode.json` as the canonical source for host-facing MCPs. Stop mirroring repo `agents/` into `~/.config/opencode`, explicitly purge deprecated repo-managed agent prompt files from runtime config, then align tests and docs with that architecture before moving on to MCP boundary refinements.

## Phase 1
1. Remove stale repo-managed agent prompt remnants:
   - delete `opencode-config/agents/librarian.md`
   - update `scripts/tests/mcp-inventory-regression.test.js`
   - update `scripts/check-agents-drift.mjs`
2. Harden runtime config sync:
   - modify `scripts/copy-config.mjs`
   - add regression coverage in `scripts/tests/copy-config.test.js`
   - remove repo `agents/` from wholesale sync
   - purge only deprecated repo-managed prompt file names from `~/.config/opencode/agents`
   - preserve unknown user custom agent files
3. Align docs:
   - update `README.md`
   - update `agents-list.md`

## Phase 1 Verification
- `bun test scripts/tests/copy-config.test.js scripts/tests/mcp-inventory-regression.test.js scripts/tests/mcp-audit-classification.test.js scripts/tests/skill-surface-regression.test.js`
- `node scripts/check-agents-drift.mjs --json`

## Phase 2
Reconcile MCP boundary docs/configs (`mcp-servers/opencode-mcp-config.json`, `mcp-servers/server-list.md`, `docs/architecture/cli-mcp-surface-policy.md`) with current wrapper/dormant-policy reality.

## Phase 3
Verify actual host runtime startup for wrapped internal MCPs, then choose the next major backlog wave from `docs/model-management/HARDENING-BACKLOG.md` or `.sisyphus/plans/dynamic-model-learning-assessment-plan.md`.
