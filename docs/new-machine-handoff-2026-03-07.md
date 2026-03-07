# New Machine Handoff - 2026-03-07

## Current Repository State

- Branch: `master`
- Upstream: `origin/master`
- Sync status: clean and fully synced (`git status -sb` shows `## master...origin/master`)
- Latest merge: PR #7 merged at `737d9ec`
- Previous merge: PR #6 merged at `55e1673`

Recent relevant commits now on `master`:

- `56edb47` test(sisyphus-state): cover auto-wired budget enforcer behavior
- `6ba3cf5` feat(sisyphus-state): wire budget enforcer into executor options
- `a041957` fix(health): validate MCP servers by enabled and type semantics
- `e9debd5` fix(router-x): serialize quota signal propagation under rotator lock
- `2975d21` docs(telemetry): record pass-2 addendum completion and B6 gate
- `a82f6ea` feat(telemetry): persist structured outcomes and prune hook coverage
- `727cc48` fix(context): align governor critical threshold and supermemory compaction

## What Was Completed

1. Telemetry/context hardening
   - Structured invocation outcomes persisted.
   - Direct `distill`/`prune` hook tracking added.
   - Context thresholds aligned (governor/supermemory policy values).

2. Reliability and runtime safety
   - Router quota signal updates serialized under lock.
   - MCP health check semantics tightened (enabled/type-aware checks).
   - Distill setup command documented in MCP setup helper.

3. Sisyphus state integration
   - `BudgetEnforcer` wired into `WorkflowExecutor` via `options.budget`.
   - `BudgetEnforcer` exported from package index.
   - Integration tests added for auto-wired budget behavior.

## Key Files Changed in This Wave

- `packages/opencode-learning-engine/src/tool-usage-tracker.js`
- `integration-tests/telemetry-contract.test.js`
- `packages/opencode-context-governor/src/budgets.json`
- `packages/opencode-context-governor/README.md`
- `opencode-config/supermemory.json`
- `packages/opencode-model-router-x/src/key-rotator.js`
- `packages/opencode-model-router-x/test/quota-signal-lock.test.js`
- `scripts/health-check.mjs`
- `mcp-servers/mcp-setup-commands.sh`
- `packages/opencode-sisyphus-state/src/budget-enforcer.js`
- `packages/opencode-sisyphus-state/src/executor.js`
- `packages/opencode-sisyphus-state/src/index.js`
- `packages/opencode-sisyphus-state/tests/basic.test.js`

Governance/learning update records added under:

- `opencode-config/learning-updates/`

## New Machine Bootstrap Checklist

1. Clone and enter repo

```bash
git clone https://github.com/GAIn-Tech/opencode-setup.git
cd opencode-setup
```

2. Install/runtime setup

```bash
bun install
bun run setup
```

3. Validate baseline health/governance

```bash
bun run governance:check
node scripts/health-check.mjs
```

4. Verify critical tests for this wave

```bash
bun test integration-tests/telemetry-contract.test.js
node packages/opencode-model-router-x/test/quota-signal-lock.test.js
bun test packages/opencode-sisyphus-state/tests
```

## Notes for Cross-Machine Continuation

- This repo is Bun-first; use Bun commands by default.
- Governance hooks enforce learning-gate metadata on governed file commits.
- If governance hash mismatch appears after approved config changes, run:

```bash
node scripts/learning-gate.mjs --generate-hashes
```

- A local safety branch exists on this machine only:
  - `backup/master-pre-align-20260307-193001`
  - It is not required on new machine unless you need local forensic history.

## Ready State

The system is in a portable handoff state on `master` with no pending local changes and no unpushed commits.
