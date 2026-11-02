# Migration Guide (v1/scripts -> v2 CLI)

This guide covers migration to the extracted `opencode-cli-v2` workflow.

## Scope

Migration includes:

- Configuration migration to unified v2 schema
- Script entrypoint migration to `opencode <command> <subcommand>`
- Validation and troubleshooting steps

## Config Migration

`opencode-cli-v2` supports both:

- **Unified config** (`version: "2.x"`)
- **Legacy formats** migrated through adapters

Legacy files recognized by the loader/migrator:

- `opencode.json`
- `antigravity.json`
- `oh-my-opencode.json`
- `compound-engineering.json`
- `config.yaml`
- `.opencode.config.json`

### How migration works

1. Parse file as YAML or JSON by extension.
2. Detect format from filename and content markers.
3. Convert legacy format via format-specific adapter.
4. Merge with default v2 schema.
5. Validate final config with Zod schema.
6. Track legacy sources in `legacy.sources`.

## Breaking Changes

1. **Single CLI surface replaces direct script execution**
   - Old: `bun scripts/xyz.mjs`
   - New: `opencode <domain> <subcommand>`

2. **Unified config precedence is explicit**
   - defaults -> global config -> project config -> legacy discovered -> env -> CLI overrides

3. **Strict bootstrap behavior is enforced**
   - missing required capabilities fail in strict mode unless degraded mode is explicitly used.

4. **Command help/usage is standardized**
   - each command class extends shared `BaseCommand` parsing/help behavior.

## Migration Checklist

- [ ] Install dependencies in `opencode-cli-v2` (`bun install`)
- [ ] Validate baseline config (`opencode validate config`)
- [ ] Run config migration (`opencode config migrate`)
- [ ] Re-run config validation (`opencode validate config --json`)
- [ ] Replace script invocations in CI and local docs with equivalent CLI commands
- [ ] Run bootstrap verification (`opencode verify bootstrap-prereqs --strict`)
- [ ] Run health checks (`opencode health --env-profile strict`)
- [ ] Run integration verification (`bun test`)
- [ ] Confirm no direct dependency on monorepo `packages/*` internals

## Troubleshooting

### Config fails validation

Symptoms:

- `opencode validate config` returns non-zero

Actions:

1. Run JSON output for details: `opencode validate config --json`
2. Inspect `legacy.raw` and `legacy.sources` to identify problematic source files.
3. Remove invalid keys or map them to supported unified fields.

### Unknown command or subcommand

Symptoms:

- `Unknown command: ...` or `Missing <domain> subcommand`

Actions:

1. Check root help: `opencode --help`
2. Check command help: `opencode <command> --help`
3. Update scripts/CI to current command map.

### Strict bootstrap failures

Symptoms:

- bootstrap fails due to missing required capability

Actions:

1. Run with diagnostic commands: `opencode verify bootstrap-prereqs --strict`
2. Ensure required providers/adapters are configured.
3. Use degraded mode only for non-production workflows.

### Migration parity concerns

If behavior differs from legacy scripts:

1. Compare old script arguments to new command/subcommand options.
2. Use `--json` outputs where available for deterministic diffing.
3. Run adapter and plugin verification checks before rollout.
