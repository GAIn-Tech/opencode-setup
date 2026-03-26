# OpenCode Workspace Packages

Canonical inventory for the `packages/` workspace in this monorepo.

- **Total workspace packages:** 36
- **Source of truth for package surface posture:**
  - `.sisyphus/evidence/package-surface-classification.json`
  - `docs/architecture/cli-mcp-surface-policy.md`

## Surface Role Summary

The current package surface distribution (Wave 2 Task 4) is:

- **CLI-first:** 7
- **MCP-first:** 2
- **Hybrid:** 1
- **Library-only:** 26

This distribution is intentional. Library-only packages are not missing wrappers by default; many are internal orchestration or shared library cores where public CLI/MCP contracts are either unnecessary or intentionally deferred.

## Package Inventory (36)

### CLI-first (7)

- `opencode-codebase-memory`
- `opencode-dashboard-launcher`
- `opencode-eval-harness`
- `opencode-fallback-doctor`
- `opencode-graphdb-bridge`
- `opencode-plugin-healthd`
- `opencode-proofcheck`

### MCP-first (2)

- `opencode-context-governor`
- `opencode-runbooks`

### Hybrid (1)

- `opencode-memory-graph`

### Library-only (26)

- `opencode-backup-manager`
- `opencode-circuit-breaker`
- `opencode-config-loader`
- `opencode-crash-guard`
- `opencode-dashboard`
- `opencode-errors`
- `opencode-event-bus`
- `opencode-feature-flags`
- `opencode-health-check`
- `opencode-integration-layer`
- `opencode-learning-engine`
- `opencode-logger`
- `opencode-mcp-utils`
- `opencode-model-benchmark`
- `opencode-model-manager`
- `opencode-model-router-x`
- `opencode-plugin-lifecycle`
- `opencode-plugin-preload-skills`
- `opencode-registry-bridge`
- `opencode-safe-io`
- `opencode-showboat-wrapper`
- `opencode-sisyphus-state`
- `opencode-skill-rl-manager`
- `opencode-test-utils`
- `opencode-tool-usage-tracker`
- `opencode-validator`

## Notes on Discoverability and Policy

- Some exposed package surfaces are intentionally package-only (no skill namespace), and some skills are intentionally not default-tier. This is governance posture, not a missing integration bug.
- Dormant MCP wrappers are governed by `opencode-config/mcp-dormant-policy.json` and should not be treated as active public surfaces unless explicitly reactivated.
- For capability tier semantics (default/manual/dormant/candidate-prune), use `docs/architecture/ecosystem-tier-model.md` as the canonical documentation.
