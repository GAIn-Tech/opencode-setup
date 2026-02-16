# Configuration Precedence Rules

## Overview

The opencode-setup system uses a **4-tier hierarchical configuration system** with clear precedence rules to enable portability, user customization, and runtime overrides.

## Precedence Hierarchy (Highest to Lowest)

### 1. Environment Variables (Highest Priority)
- **Pattern**: `OPENCODE_*` prefix with underscore nesting
- **Example**: `OPENCODE_PERFORMANCE_CONCURRENCY_DEFAULTLIMIT=10`
- **Use case**: Runtime overrides, CI/CD, containerized deployments
- **Scope**: Process-specific, ephemeral
- **Format**: Attempts JSON parse, falls back to string
- **Applied by**: `config-loader` during merge phase

### 2. Local Project Configuration
- **File**: `.opencode.config.json` in project root
- **Use case**: Project-specific settings (e.g., different concurrency limits per repo)
- **Scope**: Single project/repository
- **Format**: JSON object with same structure as defaults
- **Merged with**: Deep merge over user config and defaults

### 3. User Configuration
- **File**: `~/.opencode/config.json`
- **Use case**: User preferences across all projects
- **Scope**: User-wide (all projects on this machine)
- **Format**: JSON object with same structure as defaults
- **Merged with**: Deep merge over defaults

### 4. Built-in Defaults (Lowest Priority)
- **Location**: `packages/opencode-config-loader/src/index.js` (hardcoded)
- **Use case**: Fallback values, initial setup
- **Scope**: System-wide baseline
- **Format**: JavaScript object literal

---

## Domain-Specific Precedence

### Model Routing (`opencode-model-router-x`)

**Configuration Layers** (highest to lowest):

1. **Runtime request overrides** - Per-request model selection, temperature, max_tokens
2. **Environment quota overrides** - `QUOTA_{PROVIDER}_LIMIT`, `QUOTA_{PROVIDER}_WARNING`, `QUOTA_{PROVIDER}_CRITICAL`
3. **Custom provider config** - Loaded via `loadProviderQuotas(customConfig)`
4. **Provider defaults** - `packages/opencode-sisyphus-state/src/config/providers.js`
5. **Policies** - `packages/opencode-model-router-x/src/policies.json` (intent routing, complexity scoring, fallback chains)

**Critical Rule**: ENV quota vars override file-based configs but policies define routing logic (intent maps, complexity scoring, fallback chains).

### Quota Signals (Rate Limiting)

**Propagation Chain** (linear flow, **NEEDS LOCKING**):

1. **API Response** → Rate limit headers (`x-ratelimit-*`) or 429 status
2. **Key Rotator** → Updates key state (exhausted, cooldown period)
3. **Provider Status** → Updates provider-level health (atomic write to `provider-status.json`)
4. **Rate Limit Store** → Updates global rate limit state (atomic write to `rate-limits.json`)
5. **Fallback Strategy** → Selects next provider in fallback chain

**Critical Gap**: No lock on quota signal propagation → concurrent 429s can cascade incorrectly. **FIX REQUIRED**.

---

## Configuration Merge Algorithm

### Deep Merge Rules

```javascript
// Simplified from config-loader
function deepMerge(target, source) {
  for (const key in source) {
    if (isObject(source[key]) && isObject(target[key])) {
      target[key] = deepMerge(target[key], source[key]);  // Recursive
    } else {
      target[key] = source[key];  // Source wins
    }
  }
  return target;
}

// Application order
const config = deepMerge(
  deepMerge(
    deepMerge({}, defaults),           // (4) Defaults
    userConfig                          // (3) User config
  ),
  projectConfig                         // (2) Project config
);
applyEnvOverrides(config);              // (1) ENV vars (highest)
```

### Environment Variable Parsing

```javascript
// OPENCODE_PERFORMANCE_CONCURRENCY_DEFAULTLIMIT=10
// Becomes: config.performance.concurrency.defaultLimit = 10

const envKey = 'OPENCODE_PERFORMANCE_CONCURRENCY_DEFAULTLIMIT';
const path = envKey
  .replace(/^OPENCODE_/, '')
  .toLowerCase()
  .split('_');  // ['performance', 'concurrency', 'defaultlimit']

let value = process.env[envKey];
try {
  value = JSON.parse(value);  // Attempt parse
} catch {
  // Keep as string
}

setByPath(config, path, value);  // Deep set
```

---

## Override Examples

### Example 1: Increase Concurrency for High-Memory Project

**User default** (~/.opencode/config.json):
```json
{
  "performance": {
    "concurrency": {
      "defaultLimit": 5
    }
  }
}
```

**Project override** (.opencode.config.json):
```json
{
  "performance": {
    "concurrency": {
      "defaultLimit": 20
    }
  }
}
```

**Result**: Project uses 20 concurrent operations, all other projects use 5.

---

### Example 2: Temporary Quota Increase via ENV

```bash
# Temporary increase for this run
QUOTA_ANTHROPIC_LIMIT=5000000 \
QUOTA_ANTHROPIC_WARNING=0.7 \
  bun run generate-docs.js
```

**Result**: This process uses 5M token quota with 70% warning threshold. File-based configs untouched.

---

### Example 3: Full Precedence Stack

**Built-in default**:
```javascript
defaults.performance.concurrency.defaultLimit = 5
```

**User config** (~/.opencode/config.json):
```json
{
  "performance": {
    "concurrency": {
      "defaultLimit": 10
    }
  }
}
```

**Project config** (.opencode.config.json):
```json
{
  "performance": {
    "concurrency": {
      "defaultLimit": 15
    }
  }
}
```

**Environment variable**:
```bash
OPENCODE_PERFORMANCE_CONCURRENCY_DEFAULTLIMIT=25
```

**Final value**: `25` (ENV wins)

---

## Critical Production Rules

### DO

✅ Use ENV vars for deployment-specific overrides (Docker, CI/CD)  
✅ Use project config for repo-specific needs (different concurrency per codebase)  
✅ Use user config for personal preferences (editor integration, log levels)  
✅ Reload config after manual edits: `getConfig().reload()`  
✅ Use atomic writes for all JSON config persistence (temp file + rename)

### DON'T

❌ Hardcode paths or secrets in code (use ENV or config files)  
❌ Mutate the returned config object (it's cached - mutations affect all consumers)  
❌ Bypass precedence by directly reading files (always use `getConfig()`)  
❌ Write to config files without atomic rename pattern (risk corruption)  
❌ Assume ENV vars are always present (provide defaults)

---

## Implementation Checklist

- [x] Config-loader implements 4-tier precedence
- [x] ENV var parsing with dot-notation support
- [x] Deep merge algorithm
- [x] Singleton pattern for config access
- [x] Atomic writes for provider-status.json
- [x] Atomic writes for rate-limits.json
- [ ] **Add quota signal propagation lock** (prevents 429 cascade race conditions)
- [ ] Document quota ENV var format in .env.example
- [ ] Add config validation on load (schema check)
- [ ] Add config migration on version upgrades

---

## Related Files

- `packages/opencode-config-loader/src/index.js` - Main config loader implementation
- `packages/opencode-sisyphus-state/src/config/providers.js` - Provider quota defaults
- `packages/opencode-model-router-x/src/policies.json` - Model routing policies
- `packages/opencode-dashboard/src/app/api/providers/route.ts` - Atomic writes for rate-limits.json
- `packages/opencode-sisyphus-state/src/stores/provider-status-store.ts` - Atomic writes for provider-status.json

---

## See Also

- [Portability Guide](./portability.md) - Cross-machine setup transfer
- [Model Validation](./model-validation.md) - Model catalog management
- [Provider Health](./provider-health.md) - Quota tracking and health monitoring
