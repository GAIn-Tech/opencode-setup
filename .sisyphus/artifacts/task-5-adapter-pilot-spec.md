# Task 5: Adapter Pilot Specification

## 1. Adapter Boundary Definition

The AutoOpenCode adapter will operate as a plugin within the OpenCode monorepo, adhering to a strict governance-first plugin architecture. It will integrate at three primary layers:

1.  **Configuration Authority**: Registration in `opencode-config/opencode.json` and `scripts/bootstrap-manifest.json`.
2.  **Governance Gates**: Must pass all validation and readiness checks defined in `scripts/*.mjs`.
3.  **Runtime Integration**: Utilize the `packages/opencode-integration-layer` for plugin lifecycle management, event bus communication, and context sharing.

The adapter will be isolated within its own `plugins/autoopencode-adapter/` directory and an optional `packages/opencode-autoopencode-adapter/` workspace package. It will not directly modify core control-plane logic or bypass any existing governance mechanisms.

## 2. Allowed Interfaces (from Task 2 contract map)

Based on the Integration Surface Contract Map (Task 2), the following interfaces are explicitly allowed for adapter interaction:

### Plugin Registration
-   **Action**: Add a new plugin entry for the adapter in `opencode-config/opencode.json` (plugin array).
-   **Action**: Add a new plugin entry for the adapter in `scripts/bootstrap-manifest.json` (officialPlugins array).
-   **Requirement**: Provide `plugins/<adapter-id>/info.md` and `opencodePluginSpec`.
-   **Requirement**: Implement `init()` and `destroy()` lifecycle hooks via `IntegrationLayer.register()`.

### MCP Server Addition
-   **Action**: Add a new MCP server entry in `opencode-config/opencode.json` (mcp object) with `enabled: false` (feature-flagged).
-   **Requirement**: Implement the MCP server following existing patterns.

### Event Bus Interaction
-   **Action**: Subscribe to existing system events (e.g., `context.budget.warning`, `context.budget.critical`, `plugin.loaded`, `plugin.error`).
-   **Action**: Emit custom, namespaced events.
-   **Constraint**: CANNOT emit system events or block event propagation.

### Context Budget Monitoring
-   **Action**: Read context budget status via `ContextBridge.evaluateAndCompress()`.
-   **Action**: React to budget warnings (e.g., reduce adapter activity).
-   **Constraint**: MUST respect compression recommendations and CANNOT modify context governance logic.

## 3. Data Flow Rules

1.  **Configuration Data**: Adapter configuration will be managed through its entries in `opencode-config/opencode.json` and `scripts/bootstrap-manifest.json`. Feature flags will control activation.
2.  **Runtime Data**: The adapter will receive data primarily through event subscriptions from the `IntegrationLayer` event bus.
3.  **External Data**: Any external data fetched or processed by the adapter will be handled internally within the adapter's boundaries and not directly exposed to the core control plane without explicit interfaces.
4.  **Context Data**: The adapter can read context budget status from the `ContextBridge` but cannot modify it.
5.  **Logging/Metrics**: Adapter will integrate with existing logging and monitoring systems (if available via `IntegrationLayer` or dedicated MCP) for observability.

## 4. Feature Flag Configuration

All adapter behavior, especially during the pilot phase, will be controlled by feature flags.

-   **Location**: `plugins/autoopencode-adapter/feature-flags.json` (or similar dedicated config).
-   **Mechanism**: A simple JSON-based configuration file read by the adapter's `init()` function.
-   **Granularity**: Flags will control:
    -   Overall adapter activation.
    -   Activation of any optional MCP servers introduced by the adapter.
    -   Enabling/disabling specific adapter functionalities.
-   **Default State**: All feature flags will default to `false` (disabled) in production environments.

## 5. Kill-Switch Mechanism (Instant Disable)

A kill-switch mechanism will be implemented to instantly disable the adapter.

-   **Mechanism**: The primary kill-switch will be the feature flag for overall adapter activation. Setting this flag to `false` will immediately prevent the adapter's `init()` function from executing its core logic.
-   **Emergency Override**: In addition to the feature flag, the `opencode-config/opencode.json` plugin registration can be removed or commented out to prevent the plugin from loading entirely.
-   **Impact**: Disabling the adapter via the feature flag or removing its registration will stop all adapter-related processes and prevent any further interaction with the OpenCode system.

## 6. Rollback Procedure (Tested Steps)

A clear and tested rollback procedure will be in place for the adapter.

1.  **Disable Feature Flag**: Set the main adapter activation feature flag to `false`. Verify that the adapter ceases operation.
2.  **Remove Plugin Registration**: Remove the adapter's entry from `opencode-config/opencode.json` and `scripts/bootstrap-manifest.json`.
3.  **Remove Adapter Files**: Delete the `plugins/autoopencode-adapter/` directory and the `packages/opencode-autoopencode-adapter/` workspace package (if created).
4.  **Revert Git Changes**: Revert the git commit(s) that introduced the adapter.
5.  **Verify System Integrity**: Run `bun run setup` and `bun run governance:check` to ensure the core OpenCode system is stable and all governance gates pass without the adapter.

This procedure will be documented and tested in a staging environment before any pilot deployment.

## 7. Non-Goals (Explicit: No Core Control-Plane Merge)

The following are explicitly out of scope for the adapter pilot:

-   **No Core Control-Plane Modification**: The adapter will NOT modify any existing core OpenCode control-plane files, scripts, or packages (e.g., `opencode-config/opencode.json` schema, `scripts/*.mjs` logic, `packages/opencode-integration-layer/src/bootstrap.js`).
-   **No Bypass of Governance**: The adapter will NOT attempt to bypass or alter any governance gates or validation checks.
-   **No Direct Database Access**: The adapter will NOT directly access or modify any core OpenCode databases (e.g., `audit.db`).
-   **No New Top-Level Commands/APIs**: The adapter will NOT introduce new top-level CLI commands or public APIs that are not mediated through the `IntegrationLayer` or a dedicated, feature-flagged MCP server.

## 8. Control-Plane Integrity Checklist

Before, during, and after the adapter pilot, the following checklist will be used to ensure control-plane integrity:

-   [ ] `opencode-config/opencode.json` schema remains unchanged.
-   [ ] `scripts/bootstrap-manifest.json` only contains the adapter's registration, no other modifications.
-   [ ] All `scripts/*.mjs` governance gates pass with zero failures.
-   [ ] `packages/opencode-integration-layer/src/bootstrap.js` remains untouched.
-   [ ] No new, unapproved dependencies are introduced into core packages.
-   [ ] No unexpected network traffic or external calls from core components.
-   [ ] System performance metrics (CPU, memory, latency) remain within baseline.
-   [ ] Audit logs show no unauthorized access attempts or modifications.
-   [ ] Rollback procedure successfully tested and verified.
