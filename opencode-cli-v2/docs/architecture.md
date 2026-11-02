# Architecture

## Overview

`opencode-cli-v2` uses a **kernel-first** architecture with explicit ports and adapter boundaries.
The CLI surface is intentionally thin: commands parse input, then delegate to script runners, kernel services, or adapters.

## Kernel-First Design

The kernel is the composition root (`src/kernel/index.ts`):

- Creates and owns `KernelState`, `KernelHealth`, and `KernelBootstrap`.
- Accepts dependency-injected capability providers.
- Exposes three core operations:
  - `bootstrap(options)`
  - `getState()`
  - `healthCheck()`

Bootstrap flow (`src/kernel/bootstrap.ts`):

1. Normalize bootstrap mode (`strict` or `degraded`).
2. Resolve capability providers through the registry.
3. Load and initialize capabilities.
4. Track missing required/optional capabilities.
5. Enforce strict-mode policy (`enforceStrictMode`).
6. Run kernel health checks.
7. Mark runtime state ready/failure.

This ensures consistent behavior across local development, CI, and extracted repo deployments.

## Adapter Pattern

Adapters encapsulate integration logic and isolate external/runtime dependencies.

- **Adapter Registry** (`src/adapters/registry.ts`)
  - Register/unregister adapters
  - Discover adapters dynamically
  - Query required vs optional adapters
- **Adapter lifecycle contracts** are enforced by typed base interfaces and error classes in `src/adapters/*`.

Two major adapter groups are present:

1. **Package adapters** (`src/adapters/packages/*`): model-router, sisyphus, skills, context-governor, etc.
2. **Plugin adapters** (`src/adapters/plugins/*`): oh-my-opencode, antigravity-auth, token-monitor, notifier, safety-net, and others.

This makes extraction safe: implementation can change per adapter without rewriting kernel/ports.

## Port Interfaces

Ports define stable contracts for capabilities and integrations (`src/ports/*`).

Examples:

- `routing.ts` - model/provider routing contracts
- `learning.ts` - learning lifecycle contracts
- `budget.ts` - context budget governance contracts
- `skills.ts` - skill discovery/execution contracts
- `mcp.ts` - MCP interaction contracts
- `plugins.ts` - plugin manifest, lifecycle, hook, and health contracts

Port-first development keeps domain logic independent from concrete tooling.

## Plugin System

The plugin port (`src/ports/plugins.ts`) defines:

- **Manifest schema** (`PluginManifestSchema`)
  - `id`, `name`, `version`, `entrypoint`
  - optional `hooks`, `capabilities`, `requiredPermissions`
- **Lifecycle states**
  - `discovered`, `installed`, `loaded`, `enabled`, `disabled`, `error`
- **Hook contracts**
  - `HookEvent` input
  - `HookResult` output (handled/error/duration)
- **Health contracts**
  - per-plugin status (`healthy`, `degraded`, `unhealthy`)

This keeps plugin behavior observable and testable while allowing independent plugin evolution.

## CLI Layer Design

The CLI entrypoint (`src/cli/index.ts`) provides:

- global option parsing (`--help`, `--version`, `--config`)
- command resolution with aliases
- uniform help rendering
- clean in-memory output model for testability (`executeCli`)

Command classes extend `BaseCommand` and share standardized option parsing and help generation (`src/cli/commands/base.ts`).

## Extraction-Oriented Boundaries

Architecture constraints to preserve:

- No dependency on `../packages/*` internals.
- Keep kernel and ports free of script-specific assumptions.
- Keep adapters and command wrappers modular.
- Keep configuration migration logic local to `src/config/*`.

These constraints are what allow `opencode-cli-v2` to be copied into a new repository with minimal changes.
