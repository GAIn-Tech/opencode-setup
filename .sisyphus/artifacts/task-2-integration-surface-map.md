# Task 2: Integration Surface Contract Map
**Repository**: OpenCode monorepo
**Collected**: 2026-04-03

## Executive Summary

The OpenCode monorepo has a **strict governance-first plugin architecture** with three layers of integration boundaries:

1. **Configuration Authority** (`opencode-config/opencode.json`) - Canonical registration
2. **Governance Gates** (`scripts/*.mjs`) - Validation and readiness checks
3. **Runtime Integration** (`packages/opencode-integration-layer`) - Plugin lifecycle and event bus

**Adapter Integration Posture**: Any adapter MUST honor all three layers without bypassing governance checks.

---

## 1. Registration Contract (Configuration Authority)

### Source of Truth
**File**: `opencode-config/opencode.json` (116KB)

### Plugin Registration Schema

```json
{
  "plugin": [
    "oh-my-opencode@3.5.2",
    "opencode-antigravity-auth@1.4.6",
    ...
  ]
}
```

**Schema Rules**:
- **Type**: Array of strings
- **Format**: `<package-name>@<version>` or `<package-name>@latest`
- **Required**: Yes (must be present, can be empty array)
- **Validation**: Each entry must be a valid npm package specifier

**Risk Level**: 🔴 **HIGH**

**Why High Risk**:
- Direct modification of this file affects all plugin loading
- No schema changes allowed without governance approval
- Version pinning is enforced by governance checks

**Adapter Constraints**:
- ✅ CAN: Add new plugin entry for adapter
- ❌ CANNOT: Modify existing plugin entries
- ❌ CANNOT: Change schema structure
- ❌ CANNOT: Bypass version validation

### MCP Registration Schema

```json
{
  "mcp": {
    "<server-name>": {
      "enabled": true|false,
      "config": { ... }
    }
  }
}
```

**Schema Rules**:
- **Type**: Object with boolean `enabled` property
- **Required**: `enabled` property MUST exist
- **Validation**: `validate-plugin-compatibility.mjs` enforces structure

**Risk Level**: 🟡 **MEDIUM**

**Adapter Constraints**:
- ✅ CAN: Add new MCP server entry (feature-flagged)
- ❌ CANNOT: Disable existing MCP servers
- ❌ CANNOT: Modify `enabled` property of existing entries

---

## 2. Governance Gates (Validation Layer)

### Gate 1: Bootstrap Manifest Parity
**File**: `scripts/bootstrap-manifest.json`
**Validator**: `scripts/verify-bootstrap-manifest.mjs`

**Contract**:
- Official plugins listed in manifest MUST match `opencode.json` registration
- Each plugin MUST have:
  - `id`: Unique identifier
  - `package`: npm package specifier
  - `loadChecks.requiredFiles`: At minimum, `info.md` in plugin directory
  - `loadChecks.entryPoints`: Metadata file path
  - `ownership.failureAction`: `block-bootstrap` | `warn-and-block-ci`

**Risk Level**: 🔴 **HIGH**

**What Gets Checked**:
- Plugin specifiers match between manifest and config
- Required metadata files exist in `plugins/<plugin-id>/`
- No orphaned plugins (in manifest but not config, or vice versa)

**Adapter Requirements**:
- Adapter MUST be registered in BOTH:
  - `opencode-config/opencode.json` (plugin array)
  - `scripts/bootstrap-manifest.json` (officialPlugins array)
- Adapter MUST provide `plugins/<adapter-id>/info.md`
- Adapter MUST pass ownership checks

### Gate 2: Plugin Readiness
**File**: `scripts/verify-plugin-readiness.mjs`

**Checks Performed**:
1. `PLUGIN_MISSING_INFO_MD`: Plugin directory exists but missing `info.md`
2. `PLUGIN_MISSING_SPEC`: Plugin directory exists but missing spec file
3. `PLUGIN_NOT_IN_CONFIG`: Plugin in manifest but not in `opencode.json`

**Risk Level**: 🟡 **MEDIUM**

**Adapter Requirements**:
- MUST have `info.md` in plugin directory
- MUST have valid spec (either `opencodePluginSpec` file or in manifest)
- MUST be registered in config

### Gate 3: Plugin Compatibility
**File**: `scripts/validate-plugin-compatibility.mjs`

**Checks Performed**:
1. No duplicate plugin entries in config
2. No duplicate MCP server names
3. MCP entries have required `enabled` property
4. Runtime state file (if exists) is valid object

**Risk Level**: 🟢 **LOW**

**Adapter Requirements**:
- No duplicate registration
- MCP servers must follow schema

### Gate Execution Flow

```
bun run governance:check
  ├── learning-gate.mjs
  ├── deployment-state.mjs
  └── validate-plugin-compatibility.mjs

setup-resilient.mjs
  └── verify-plugin-readiness.mjs (transitive)
```

**Adapter Constraint**: All gates MUST pass with zero failures before adapter activation.

---

## 3. Runtime Integration Boundaries

### Entry Point: `packages/opencode-integration-layer/src/index.js`

**Primary Exports**:
- `IntegrationLayer` class
- Plugin registration API: `register(plugin)`
- Event bus: `on()`, `emit()`
- Context sharing: `getContext()`

**Risk Level**: 🟡 **MEDIUM**

### Integration Points

#### 3.1 Plugin Loading
```javascript
await layer.register({
  name: 'adapter-name',
  init: () => { /* initialization */ },
  destroy: () => { /* cleanup */ }
});
```

**Adapter Constraints**:
- ✅ CAN: Register adapter as plugin
- ✅ CAN: Implement `init()` and `destroy()` lifecycle hooks
- ❌ CANNOT: Access other plugins' internal state
- ❌ CANNOT: Modify event bus behavior

#### 3.2 Context Bridge
**File**: `packages/opencode-integration-layer/src/context-bridge.js`

**Purpose**: Advisory bridge for context governance → distill compression

**Data Flow**:
```
Session tokens → Governor.consumeTokens()
  → ContextBridge.evaluateAndCompress()
  → "none" | "compress" | "compress_urgent"
```

**Risk Level**: 🟡 **MEDIUM**

**Adapter Constraints**:
- ✅ CAN: Read context budget status
- ❌ CANNOT: Modify context governance logic
- ❌ CANNOT: Bypass compression recommendations

#### 3.3 Bootstrap Wiring
**File**: `packages/opencode-integration-layer/src/bootstrap.js`

**Purpose**: Internal package wiring and dependency injection

**Risk Level**: 🔴 **HIGH**

**Adapter Constraints**:
- ❌ CANNOT: Modify bootstrap wiring
- ❌ CANNOT: Inject dependencies into existing packages
- ❌ CANNOT: Access internal package APIs not exposed through IntegrationLayer

### Event Bus Contract

**Events**:
- `plugin.loaded` - Plugin successfully loaded
- `plugin.error` - Plugin initialization failed
- `context.budget.warning` - Token budget at 75%+
- `context.budget.critical` - Token budget at 80%+

**Adapter Constraints**:
- ✅ CAN: Subscribe to events
- ✅ CAN: Emit custom events (namespaced)
- ❌ CANNOT: Emit system events
- ❌ CANNOT: Block event propagation

---

## 4. High-Risk Boundaries (Do-Not-Cross)

### 🔴 CRITICAL: Configuration Authority
- `opencode-config/opencode.json` - Modification requires governance approval
- `scripts/bootstrap-manifest.json` - Plugin registry authority
- **Why**: These are the source of truth. Any bypass breaks governance.

### 🔴 CRITICAL: Governance Gate Logic
- `scripts/verify-*.mjs` - Validation scripts
- `scripts/validate-*.mjs` - Compatibility checks
- **Why**: Gates enforce policy. Bypassing them violates security posture.

### 🔴 CRITICAL: Bootstrap Wiring
- `packages/opencode-integration-layer/src/bootstrap.js`
- **Why**: Controls package dependency injection. Tampering creates second control plane.

### 🟡 WARNING: Event Bus
- `packages/opencode-integration-layer` event system
- **Why**: Shared communication channel. Must not pollute or block.

### 🟡 WARNING: Context Bridge
- `packages/opencode-integration-layer/src/context-bridge.js`
- **Why**: Advisory system. Must not interfere with compression recommendations.

---

## 5. Adapter-Compatible Seams

### ✅ SAFE: Plugin Registration
- Add entry to `opencode.json` plugin array
- Add entry to `bootstrap-manifest.json` officialPlugins
- Provide `plugins/<adapter-id>/info.md`
- Implement `init()` and `destroy()` lifecycle hooks

### ✅ SAFE: MCP Server Addition
- Add new MCP entry with `enabled: false` (feature-flagged)
- Implement MCP server following existing patterns
- Toggle via feature flag during pilot

### ✅ SAFE: Event Subscription
- Subscribe to context budget events
- Subscribe to plugin lifecycle events
- Emit namespaced custom events

### ✅ SAFE: Context Budget Monitoring
- Read context governor status
- React to budget warnings (e.g., reduce activity)
- Respect compression recommendations

---

## 6. Recommended Adapter Architecture

### Pilot Phase Structure
```
plugins/
  └── autoopencode-adapter/
      ├── info.md                    # Required metadata
      ├── opencodePluginSpec         # Version spec
      ├── adapter.js                 # Adapter implementation
      └── feature-flags.json         # Feature toggle config

packages/
  └── opencode-autoopencode-adapter/  # Adapter package
      ├── src/
      │   ├── index.js               # Entry point
      │   ├── adapter.js             # Core adapter logic
      │   └── mcp-server.js          # Optional MCP integration
      └── package.json
```

### Integration Pattern
```javascript
// In plugins/autoopencode-adapter/adapter.js
import { IntegrationLayer } from 'opencode-integration-layer';

export async function init() {
  const layer = IntegrationLayer.getInstance();

  // Subscribe to events (SAFE)
  layer.on('context.budget.warning', (data) => {
    // Reduce adapter activity when budget is tight
  });

  // Register MCP server if enabled (SAFE)
  if (isFeatureEnabled('autoopencode-mcp')) {
    await registerMcpServer();
  }
}

export async function destroy() {
  // Cleanup
}
```

---

## 7. Validation Checklist for Adapter Integration

### Pre-Integration
- [ ] Adapter registered in `opencode.json`
- [ ] Adapter registered in `bootstrap-manifest.json`
- [ ] `info.md` created in plugin directory
- [ ] Version spec provided

### Governance Gates
- [ ] `bun run governance:check` passes
- [ ] `verify-plugin-readiness.mjs` passes
- [ ] `validate-plugin-compatibility.mjs` passes

### Runtime Integration
- [ ] Adapter implements `init()` and `destroy()`
- [ ] No direct access to internal packages
- [ ] Event bus usage is read-only or namespaced
- [ ] Feature flag controls all adapter behavior

### Security Posture
- [ ] No modification of governance scripts
- [ ] No bypass of validation gates
- [ ] No second control plane introduced
- [ ] Rollback path tested

---

## 8. Evidence References

### Files Analyzed
- `opencode-config/opencode.json` (lines 1-100)
- `scripts/bootstrap-manifest.json` (lines 1-150)
- `scripts/verify-plugin-readiness.mjs` (lines 1-100)
- `scripts/validate-plugin-compatibility.mjs` (lines 1-100)
- `packages/opencode-integration-layer/src/index.js` (lines 1-150)

### Documentation Referenced
- `opencode-config/AGENTS.md`
- `scripts/AGENTS.md`
- `packages/opencode-integration-layer/AGENTS.md`
- `packages/opencode-integration-layer/README.md`

---

## Conclusion

**Integration Posture**: ⚠️ **ADAPTER-FIRST PILOT VIABLE**

The OpenCode monorepo provides well-defined seams for adapter integration:
- ✅ Plugin registration contract is clear
- ✅ Governance gates are automated and enforceable
- ✅ Runtime boundaries are explicit

**Critical Requirements**:
1. MUST register in both config and manifest
2. MUST pass all governance gates
3. MUST NOT bypass validation scripts
4. MUST NOT introduce second control plane
5. MUST use feature flags for all pilot behavior

**Next Step**: Proceed to Task 3 (due diligence) with integration surface constraints documented.
