# Learnings - Portability/Replicability Hardening

## Conventions
- All path resolution must go through shared resolver (OPENCODE_DATA_HOME > XDG_DATA_HOME > ~/.opencode)
- Fail-closed policy: zero unauthorized skips/fallbacks in strict mode
- Launcher ownership must be explicit per entrypoint (Node-only, Bun-only, dual)

## Patterns Discovered
- Hardcoded `.opencode` paths remain in: init-kb, skill-rl-manager, memory-graph, dashboard health API, integrity-guard, sisyphus-state
- spawnSync usage across scripts carries cross-OS shell/locator edge cases
- CI matrix currently Linux-only; needs Windows/macOS coverage

## Gotchas
- `rg` not available on this machine - use grep/ast-grep instead
- LSP diagnostics partially unavailable on Windows (typescript-language-server missing)
- bun.lock must be excluded from stale-lock detection (already handled in doctor/repair)

## Decisions
- Gate posture: fail-closed
- Next tranche priority: path/runtime determinism first
- Verification policy: TDD + fail-closed CI

## Wave F/J+ - Data-home normalization findings
- Core packages should define/use `resolveDataHome()` with strict precedence: `OPENCODE_DATA_HOME` > `XDG_DATA_HOME/opencode` > `~/.opencode` (`HOME || USERPROFILE || os.homedir()`).
- Hardcoded `path.join(os.homedir(), '.opencode', ...)` and HOME/USERPROFILE order drift were normalized in core runtime packages to remove portability violations without changing subpath structures.
- Existing `.opencode` subpaths were preserved (`dashboard.lock`, `dashboard.log`, `tool-usage`, `telemetry`, MCP config lookup paths) while switching only the base data-home resolver.

## Wave F/J+ - Dashboard API route normalization
- Updated dashboard API routes (`skills`, `orchestration`, `models`, `models/transition`, `models/lifecycle`, `models/audit`, `memory-graph`, `health`, `docs`) to use local `resolveDataHome()` with canonical precedence (`OPENCODE_DATA_HOME` > `XDG_DATA_HOME/opencode` > `HOME || USERPROFILE || os.homedir()/.opencode`).
- Preserved all existing subpath semantics while replacing base resolution only (`messages`, `model-manager/*.db`, `orchestration-events.json`, `skill-rl.json`, `healthd.log`, `PLUGINS-LOCAL.md`, etc.).
- `node scripts/check-hardcoded-paths.mjs` now reports no dashboard API route violations; remaining failures are isolated to integration tests and should be handled in test hardening scope.

## Wave F/J+ - Script path hardening findings
- Script-level `.opencode` joins were normalized to shared resolver utilities from `scripts/resolve-root.mjs` (`userDataDir` / `resolveUserDataPath`) to enforce canonical precedence consistently across ESM entrypoints.
- Updated script surfaces: `ingest-sessions.mjs`, `integrity-guard.mjs`, `mcp-exercise-harness.mjs`, `report-mcp-lifecycle.mjs`, `security/fg04-ingestion-integrity.mjs`, `evals/fg11-retrieval-quality.mjs`.
- Path topology was preserved exactly (e.g., `tool-usage/*`, `messages/<sessionId>`, `delegation-log.json`, `retrieval-quality.json`); only base data-home resolution changed.
