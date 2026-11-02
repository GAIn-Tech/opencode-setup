# OpenCode CLI v2 Documentation

This folder contains the Phase 6 documentation for the extracted `opencode-cli-v2` workspace.

## Quick Start

### Installation

```bash
cd opencode-cli-v2
bun install
```

### Basic Usage

```bash
# Show root help
bun run src/cli/index.ts --help

# Show version
bun run src/cli/index.ts --version

# Execute a runtime task
bun run src/cli/index.ts run --task "Analyze config migration"

# Run setup and health checks
bun run src/cli/index.ts setup resilient
bun run src/cli/index.ts health --env-profile strict
```

## Key Features

- **Kernel-first runtime**: strict/degraded bootstrap with capability validation and health gating.
- **Adapter isolation**: package and plugin adapters are registered/discovered through typed registries.
- **Unified configuration**: supports v2 schema plus legacy format migration.
- **Script-surface parity**: CLI subcommands wrap existing governance/infra scripts without tight coupling.
- **Extractable workspace**: no imports from `../packages/*`, enabling standalone repository extraction.

## Migration From the Old System

`opencode-cli-v2` replaces ad hoc script entry points with a single CLI surface:

- Old style: `bun scripts/<tool>.mjs`
- New style: `opencode <domain> <subcommand> [options]`

Examples:

```bash
# Old
bun scripts/validate-config.mjs --json

# New
bun run src/cli/index.ts validate config --json

# Old
bun scripts/model-rollback.mjs --to-last-good

# New
bun run src/cli/index.ts model rollback --to-last-good
```

## Documentation Index

- [architecture.md](./architecture.md) - kernel, adapters, ports, plugin architecture
- [migration-guide.md](./migration-guide.md) - config migration, breaking changes, checklist, troubleshooting
- [api-reference.md](./api-reference.md) - command and option reference
- [plugin-development.md](./plugin-development.md) - plugin contracts, hooks, practices
