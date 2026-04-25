# API Reference

## CLI Entrypoint

```bash
opencode <command> [options]
```

During development in this workspace, run via:

```bash
bun run src/cli/index.ts <command> [options]
```

## Global Options

- `--help, -h` Show help output
- `--version, -v` Show CLI version
- `--config, -c <path>` Global config file

---

## Commands

### `api`
- **Usage**: `opencode api <subcommand> [options]`
- **Subcommands**:
  - `sanity`
- **Options**:
  - `--base-url <url>`
  - `--timeout-ms <n>`
  - `--help, -h`

### `run` (aliases: `r`, `execute`)
- **Usage**: `opencode run [subcommand] [options]`
- **Subcommands**:
  - `package-smokes`
- **Options**:
  - `--task, -t <text>`
  - `--config, -c <path>`
  - `--trajectory, -T <path>`
  - `--dry-run`
  - `--json` (package-smokes)
  - `--help, -h`
- **Examples**:
  - `opencode run --config agent.yaml --task "Implement auth"`
  - `opencode run --trajectory task.json`
  - `opencode run package-smokes --json`

### `run-batch` (alias: `batch`)
- **Usage**: `opencode run-batch [options]`
- **Options**:
  - `--config, -c <path>`
  - `--tasks <path>`
  - `--trajectory, -T <path>`
  - `--help, -h`
- **Example**:
  - `opencode run-batch --config batch.yaml --tasks tasks.txt`

### `runtime`
- **Usage**: `opencode runtime <subcommand> [options]`
- **Subcommands**:
  - `telemetry`
  - `tool-surface`
  - `skill-tracker`
  - `workflow-scenarios`
  - `report-mcp-lifecycle`
- **Options**:
  - `--output <path>` (tool-surface)
  - `--prompt <text>` (tool-surface)
  - `--stdin-file <path>` (skill-tracker)
  - `--help, -h`

### `replay` (alias: `rp`)
- **Usage**: `opencode replay <trajectory> [options]`
- **Options**:
  - `--step <number>`
  - `--help, -h`
- **Example**:
  - `opencode replay my-task.json --step 5`

### `agent` (alias: `agents`)
- **Usage**: `opencode agent <subcommand> [options]`
- **Subcommands**:
  - `list`
  - `spawn [options]`
  - `kill <id>`
- **Spawn options**:
  - `--type <name>`
  - `--task <text>`
  - `--config, -c <path>`

### `task` (alias: `tasks`)
- **Usage**: `opencode task <subcommand> [options]`
- **Subcommands**:
  - `list`
  - `queue [task]`
  - `cancel <id>`

### `skills` (alias: `skill`)
- **Usage**: `opencode skills <subcommand> [options]`
- **Subcommands**:
  - `list`
  - `info <name>`
  - `evaluate-routing`
  - `routing-gates`
  - `check-coverage`
  - `check-consistency`
  - `validate-import`
  - `manage`
  - `check-overlap`
  - `consolidate`
  - `import-antigravity`
  - `normalize-superpowers`
- **Options**:
  - `--help, -h`

### `repair`
- **Usage**: `opencode repair [options]`
- **Options**:
  - `--safe`
  - `--unsafe`
  - `--rollback <backup-id>`
  - `--help, -h`

### `mcp`
- **Usage**: `opencode mcp <subcommand> [options]`
- **Subcommands**:
  - `mirror-coherence`
  - `smoke-harness`
- **Options**:
  - `--write` (mirror-coherence)
  - `--json` (smoke-harness)
  - `--output <path>` (smoke-harness)
  - `--days <n>` (smoke-harness)
  - `--help, -h`

### `ingest`
- **Usage**: `opencode ingest <subcommand> [options]`
- **Subcommands**:
  - `sessions`
- **Options**:
  - `--help, -h`

### `test`
- **Usage**: `opencode test <subcommand> [options]`
- **Subcommands**:
  - `fault-injection`
- **Options**:
  - `--help, -h`

### `doctor`
- **Usage**: `opencode doctor [options]`
- **Options**:
  - `--json`
  - `--help, -h`

### `ci`
- **Usage**: `opencode ci <subcommand> [options]`
- **Subcommands**:
  - `warning-budget`
- **Options**:
  - `--capture` (warning-budget)
  - `--help, -h`

### `commit`
- **Usage**: `opencode commit <subcommand> [options]`
- **Subcommands**:
  - `governance`
- **Options**:
  - `--base <ref>`
  - `--head <ref>`
  - `--staged`
  - `--message-file <path>`
  - `--help, -h`

### `config` (alias: `cfg`)
- **Usage**: `opencode config <subcommand> [options]`
- **Subcommands**:
  - `get <key>`
  - `set <key> <value>`
  - `copy`
  - `validate`
  - `migrate`

### `governance`
- **Usage**: `opencode governance <subcommand> [options]`
- **Subcommands**:
  - `docs-check`
  - `docs-gate`
- **Options**:
  - `--help, -h`

### `launch`
- **Usage**: `opencode launch <subcommand> [options]`
- **Subcommands**:
  - `with-dashboard`
- **Options**:
  - `--help, -h`
  - `-- <args...>` (forwards args to opencode process)

### `link`
- **Usage**: `opencode link <subcommand> [options]`
- **Subcommands**:
  - `packages`
- **Options**:
  - `--help, -h`

### `release`
- **Usage**: `opencode release <subcommand> [options]`
- **Subcommands**:
  - `portability-verdict`
- **Options**:
  - `--help, -h`

### `report`
- **Usage**: `opencode report <subcommand> [options]`
- **Subcommands**:
  - `portability`
- **Options**:
  - `--help, -h`

### `sync`
- **Usage**: `opencode sync <subcommand> [options]`
- **Subcommands**:
  - `reconcile`
  - `project-learnings`
- **Options**:
  - `--project <path>` (project-learnings)
  - `--dry-run` (project-learnings)
  - `--help, -h`

### `state`
- **Usage**: `opencode state <subcommand> [options]`
- **Subcommands**:
  - `preload-persist`
  - `init-kb`
  - `meta-super-cycle`
  - `synthesize-meta-kb`
  - `skill-profile-loader`
- **Options**:
  - `--export` (preload-persist)
  - `--import` (preload-persist)
  - `--sync` (preload-persist)
  - `--dry-run` (preload-persist)
  - `--apply` (preload-persist)
  - `--clear` (preload-persist)
  - `--help, -h`

### `system`
- **Usage**: `opencode system <subcommand> [options]`
- **Subcommands**:
  - `health`
- **Options**:
  - `--json` (health)
  - `--verbose` (health)
  - `--help, -h`

### `verify`
- **Usage**: `opencode verify <subcommand> [options]`
- **Subcommands**:
  - `setup`
  - `integrity`
  - `bootstrap-prereqs`
  - `bootstrap-manifest`
  - `supply-chain`
  - `portability`
  - `plugin-readiness`
  - `plugin-parity`
  - `no-hidden-exec`
- **Options**:
  - `--required-bun-version <v>` (setup)
  - `--bun-path <path>` (setup)
  - `--plugin-scope <scope>` (setup)
  - `--strict` (bootstrap-prereqs | supply-chain | portability)
  - `--json` (bootstrap-prereqs | portability)
  - `--probe-mcp` (portability)
  - `--release` (supply-chain)
  - `--release-mode` (supply-chain)
  - `--help, -h`

### `validate`
- **Usage**: `opencode validate <subcommand> [options]`
- **Subcommands**:
  - `config`
  - `models`
  - `launcher-contract`
  - `policies-structure`
  - `plugin-compatibility`
  - `fallback-consistency`
  - `control-plane-schema`
  - `legacy-config`
  - `legacy-skills`
  - `legacy-agents`
  - `legacy-plugins`
  - `legacy-models`
  - `legacy-routing`
  - `legacy-state`
  - `legacy-context`
  - `legacy-learning`
  - `legacy-health`
  - `legacy-telemetry`
  - `legacy-security`
  - `legacy-governance`
  - `legacy-docs`
  - `legacy-tests`
  - `legacy-ci`
- **Options**:
  - `--file <path>` (config)
  - `--json` (config)
  - `--quiet` (config)
  - `--no-warnings` (config)
  - `--write` (launcher-contract)
  - `--help, -h`

### `check`
- **Usage**: `opencode check <subcommand> [options]`
- **Subcommands**:
  - `runtime-compliance`
  - `env-contract`
  - `hardcoded-paths`
  - `learning-gate`
  - `agents-drift`
- **Options**:
  - `--json` (runtime-compliance)
  - `--output <path>` (runtime-compliance)
  - `--write-allowlist` (hardcoded-paths)
  - `--staged` (learning-gate)
  - `--base <ref>` (learning-gate)
  - `--verify-hashes` (learning-gate)
  - `--generate-hashes` (learning-gate)
  - `--dry-run` (agents-drift)
  - `--help, -h`

### `setup`
- **Usage**: `opencode setup <subcommand> [options]`
- **Subcommands**:
  - `resilient`
- **Options**:
  - `--offline`
  - `--allow-global-writes`
  - `--report-file <path>`
  - `--help, -h`

### `resolve`
- **Usage**: `opencode resolve <subcommand> [options]`
- **Subcommands**:
  - `root`
- **Options**:
  - `--help, -h`

### `bootstrap`
- **Usage**: `opencode bootstrap [subcommand] [options]`
- **Subcommands**:
  - `runtime` (default)
  - `cache-guard`
- **Options**:
  - `--status` (runtime)
  - `--offline` (cache-guard)
  - `--help, -h`
- **Examples**:
  - `opencode bootstrap`
  - `opencode bootstrap runtime --status`
  - `opencode bootstrap cache-guard --offline`

### `model` (alias: `models`)
- **Usage**: `opencode model <subcommand> [options]`
- **Subcommands**:
  - `rollback`
  - `weekly-sync`
- **Options**:
  - `--to-last-good` (rollback)
  - `--to-timestamp <ISO-8601>` (rollback)
  - `--dry-run` (rollback)
  - `--help, -h`

### `health` (alias: `doctor`)
- **Usage**: `opencode health [options]`
- **Options**:
  - `--env-profile <profile>` (`none|core|mcp|strict`)
  - `--help, -h`
- **Examples**:
  - `opencode health`
  - `opencode health --env-profile strict`

### `inspect` (alias: `inspector`)
- **Usage**: `opencode inspect [options]`
- **Options**:
  - `--trajectory, -T <path>`
  - `--step <number>`
  - `--help, -h`
- **Example**:
  - `opencode inspect --trajectory my-task.json`

### `trajectory` (alias: `traj`)
- **Usage**: `opencode trajectory <subcommand> [options]`
- **Subcommands**:
  - `list`
  - `save <path>`
  - `load <path>`
- **Options**:
  - `--config, -c <path>`

---

## Notes

- Command help is implemented by command classes extending `BaseCommand`.
- For script-backed commands, option support maps directly to corresponding script arguments.
- For latest details, run `opencode <command> --help`.
