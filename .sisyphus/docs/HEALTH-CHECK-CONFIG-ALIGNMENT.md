# Health Check Config Alignment - Task B4 Completion

## Problem Statement
Health checks were making **binary-only assumptions** about MCP servers:
- Assumed all MCPs required local binaries on PATH
- Ignored `enabled` flag in MCP configuration
- Didn't distinguish between remote URL servers and local binary servers
- Caused false FAIL signals for disabled MCPs and remote MCPs

## Solution Implemented

### Files Modified
1. **`packages/opencode-plugin-healthd/src/checks.js`**
   - Added `isLocalBinaryServer(serverConfig)` function to distinguish server types
   - Updated `checkMCPs()` to accept MCP config and respect `enabled` flag
   - Added `loadMcpConfig()` to load MCP configuration from standard locations
   - Updated `runAllChecks()` to load and pass config to `checkMCPs()`

2. **`packages/opencode-plugin-healthd/src/index.js`**
   - Updated imports to include `loadMcpConfig`
   - Updated `checkMCPs()` method to load and pass config

### Key Changes

#### 1. Server Type Detection
```javascript
function isLocalBinaryServer(serverConfig) {
  // Remote URL servers have 'url' or 'endpoint' properties
  if (serverConfig.url || serverConfig.endpoint) {
    return false;
  }
  // Local binary servers have 'command' property
  if (serverConfig.command) {
    return true;
  }
  return true; // Default: assume local if unclear
}
```

#### 2. Config-Aware MCP Checks
```javascript
function checkMCPs(mcpList, mcpConfig) {
  // ... for each MCP:
  
  // Skip disabled MCPs
  if (mcpConfig && mcpConfig[mcp]) {
    if (serverConfig.enabled === false) {
      continue; // Don't check disabled MCPs
    }
    // Skip remote URL servers
    if (!isLocalBinaryServer(serverConfig)) {
      continue; // Don't check remote MCPs
    }
  }
  
  // Only check local binary MCPs that are enabled
  // ... rest of check logic
}
```

#### 3. Config Loading
```javascript
function loadMcpConfig() {
  // Searches standard OpenCode config locations:
  // - ~/.opencode/mcp.json
  // - ~/.opencode/config/mcp.json
  // Returns mcpServers object or null
}
```

## Behavior Changes

### Before
- ❌ Disabled MCPs (e.g., `tavily`, `playwright`, `github`) caused WARN/FAIL
- ❌ Remote URL MCPs caused WARN/FAIL if binary not on PATH
- ❌ No distinction between server types

### After
- ✅ Disabled MCPs are skipped (no false failures)
- ✅ Remote URL MCPs are skipped (no false failures)
- ✅ Only enabled local binary MCPs are checked
- ✅ Config-driven health reporting

## Test Coverage

### New Tests Added
File: `packages/opencode-plugin-healthd/test/config-aware.test.js`

1. **isLocalBinaryServer identifies local binary servers** ✅
2. **isLocalBinaryServer identifies remote URL servers** ✅
3. **isLocalBinaryServer handles null/undefined** ✅
4. **checkMCPs respects enabled flag** ✅
5. **checkMCPs skips remote URL servers** ✅

### Test Results
```
7 pass, 0 fail
- smoke.test.js: 2 tests
- config-aware.test.js: 5 tests
```

## Acceptance Criteria Met

- [x] Health status for each MCP server is derived from config-accurate checks
- [x] No false FAIL for remote MCPs without local binaries
- [x] No false FAIL for disabled MCPs
- [x] File modified: `packages/opencode-plugin-healthd/src/checks.js`
- [x] Tests verify config-aware behavior
- [x] Existing tests still pass

## Backward Compatibility

- ✅ Existing health check API unchanged
- ✅ `checkMCPs()` accepts optional `mcpConfig` parameter (defaults to null)
- ✅ `runAllChecks()` automatically loads config
- ✅ All existing tests pass
- ✅ No breaking changes to Healthd class

## Related Issues Resolved

- Oracle finding: `tavily`, `playwright`, `github` disabled in config but docs assume broad MCP usage
- False health failures from config/health check mismatch
- Binary-only assumptions in health check logic
