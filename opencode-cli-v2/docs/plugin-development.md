# Plugin Development Guide

This guide explains how to build plugins aligned with the `opencode-cli-v2` plugin contracts.

## Plugin Model

Plugin behavior is defined by the plugins port (`src/ports/plugins.ts`):

- manifest schema (`PluginManifest`)
- lifecycle states (`PluginState`)
- hook event/result contracts (`HookEvent`, `HookResult`)
- health contract (`PluginHealth`)

Even when plugin runtime implementations vary, these contracts stay stable.

## Creating a Plugin

At minimum, define a manifest with:

- `id`
- `name`
- `version`
- `entrypoint`

Optional but recommended:

- `description`
- `hooks` (supported hook names)
- `capabilities` (declared feature surface)
- `requiredPermissions` (for governance and policy checks)

Example manifest shape:

```json
{
  "id": "example-plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "entrypoint": "./dist/index.js",
  "hooks": ["before.task", "after.task"],
  "capabilities": ["telemetry"],
  "requiredPermissions": ["read:config"]
}
```

## Hook System

Hooks are event-driven:

- Runtime emits `HookEvent`:
  - `name`: hook/event name
  - `payload`: event data
  - `context`: optional metadata
- Plugin returns `HookResult`:
  - `pluginId`
  - `handled`
  - optional `output`
  - optional `error`
  - optional `durationMs`

Design recommendations:

- Hooks should be idempotent where possible.
- Return structured outputs for downstream processing.
- Treat errors as data (`error` field), not only thrown exceptions.

## Lifecycle Expectations

A healthy plugin progresses through states:

`discovered -> installed -> loaded -> enabled`

Transitions to handle explicitly:

- `enabled -> disabled`
- any state -> `error`

Implement graceful cleanup for unload/disable paths to avoid resource leaks.

## Health Reporting

Expose plugin health through `PluginHealth`:

- `pluginId`
- `status`: `healthy | degraded | unhealthy`
- optional `details`
- `checkedAt`

Use health checks to make failures visible in CI and runtime diagnostics.

## Best Practices

1. **Keep contracts strict**
   - Validate inputs/outputs against port schemas.

2. **Minimize side effects in hooks**
   - Keep hook handlers fast and predictable.

3. **Emit actionable errors**
   - Include retriable vs non-retriable guidance where possible.

4. **Design for extraction**
   - Avoid hidden dependency on monorepo-only internals.

5. **Test plugin adapters thoroughly**
   - Follow patterns in `tests/adapters/plugins/*.test.ts`.

6. **Use explicit permission declarations**
   - Keep `requiredPermissions` narrow and auditable.

7. **Track version compatibility**
   - Make manifest and runtime changes semver-aware.

## Validation Workflow

Recommended checks before release:

```bash
# Validate plugin compatibility and parity checks
bun run src/cli/index.ts validate plugin-compatibility
bun run src/cli/index.ts verify plugin-readiness
bun run src/cli/index.ts verify plugin-parity
```

## Adapter Integration Notes

`opencode-cli-v2` includes plugin adapter modules under `src/adapters/plugins/*`.

When adding a new plugin adapter:

1. implement adapter + mapping layer
2. register adapter in adapter bootstrap/registry paths
3. add adapter unit tests in `tests/adapters/plugins/`
4. ensure behavior is reflected in command-level verification flows
