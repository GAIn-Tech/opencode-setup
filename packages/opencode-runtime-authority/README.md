# opencode-runtime-authority

Single source of truth for runtime agent/category/model resolution with provenance tracking.

## Purpose

This package provides a unified authority resolver for determining which model should be used for a given agent or category. It replaces the fragmented and duplicated model mappings that existed across:

- `scripts/runtime-tool-telemetry.mjs` (hardcoded `CATEGORY_TO_MODEL` and `AGENT_TO_MODEL`)
- `opencode-config/oh-my-opencode.json` (canonical config)
- `~/.config/opencode/oh-my-opencode.json` (runtime config)

## Installation

```bash
cd packages/opencode-runtime-authority
bun install
```

## Usage

### Resolve Agent Model

```javascript
const { resolveAgentModel } = require('opencode-runtime-authority');

const result = resolveAgentModel('atlas');
console.log(result);
// {
//   modelId: 'kimi-k2.5',
//   provider: 'moonshotai',
//   source: 'repo-config',
//   provenance: 'file:/path/to/oh-my-opencode.json:agents.atlas.model'
// }
```

### Resolve Category Model

```javascript
const { resolveCategoryModel } = require('opencode-runtime-authority');

const result = resolveCategoryModel('deep');
console.log(result);
// {
//   modelId: 'glm-5',
//   provider: 'z-ai',
//   source: 'repo-config',
//   provenance: 'file:/path/to/oh-my-opencode.json:categories.deep.model'
// }
```

### Get Effective Config Snapshot

```javascript
const { getEffectiveConfig } = require('opencode-runtime-authority');

const snapshot = getEffectiveConfig();
console.log(snapshot);
// {
//   timestamp: '2026-04-04T...',
//   homeConfigPath: '/home/user/.config/opencode/oh-my-opencode.json',
//   repoConfigPath: '/path/to/repo/opencode-config/oh-my-opencode.json',
//   agents: { atlas: {...}, librarian: {...}, ... },
//   categories: { deep: {...}, quick: {...}, ... }
// }
```

### Get Telemetry Maps (Backwards Compatibility)

```javascript
const { getTelemetryMaps } = require('opencode-runtime-authority');

const { CATEGORY_TO_MODEL, AGENT_TO_MODEL } = getTelemetryMaps();
// These maps are compatible with runtime-tool-telemetry.mjs format
```

## Precedence Chain

Resolution follows this precedence (highest to lowest):

1. **Environment Variables** - `OPENCODE_AGENT_{NAME}_MODEL`, `OPENCODE_CATEGORY_{NAME}_MODEL`
2. **Home Config** - `~/.config/opencode/oh-my-opencode.json`
3. **Repo Config** - `opencode-config/oh-my-opencode.json`
4. **Defaults** - Hardcoded fallbacks in this package

## Source Identifiers

Each resolution includes a `source` field indicating where the value came from:

- `env-override` - Environment variable override
- `home-config` - Home directory config file
- `repo-config` - Repository config file
- `default` - Hardcoded default
- `not-found` - No configuration found

## Provenance Tracking

Every resolution includes a `provenance` string that explains exactly where the value was determined:

- `env:OPENCODE_AGENT_ATLAS_MODEL` - Environment variable
- `file:/path/to/config.json:agents.atlas.model` - Config file with JSON path
- `default:agents.atlas` - Default fallback

## API Reference

### `resolveAgentModel(agentName, options?)`

Resolve model for a named agent.

- `agentName` (string): Agent name (e.g., 'atlas', 'librarian')
- `options.repoConfigPath` (string): Override repo config path
- `options.homeConfigPath` (string): Override home config path

Returns: `{ modelId, provider, source, provenance, error? }`

### `resolveCategoryModel(category, options?)`

Resolve model for a category.

- `category` (string): Category name (e.g., 'deep', 'quick')
- `options.repoConfigPath` (string): Override repo config path
- `options.homeConfigPath` (string): Override home config path

Returns: `{ modelId, provider, source, provenance, error? }`

### `getEffectiveConfig(options?)`

Get snapshot of all agent and category resolutions.

Returns: `{ timestamp, homeConfigPath, repoConfigPath, agents, categories }`

### `getTelemetryMaps(options?)`

Get CATEGORY_TO_MODEL and AGENT_TO_MODEL maps for backwards compatibility.

Returns: `{ CATEGORY_TO_MODEL, AGENT_TO_MODEL }`

## Testing

```bash
bun test
```

## Related

- Task 1 of ecosystem-audit-improvements.md
- `scripts/runtime-tool-telemetry.mjs` - Consumer of this resolver
- `opencode-config/oh-my-opencode.json` - Canonical config source
