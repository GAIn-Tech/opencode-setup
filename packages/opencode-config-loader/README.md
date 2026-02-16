# opencode-config-loader

Centralized configuration loader for OpenCode plugins. Provides a single source of truth for all performance, memory, and feature settings.

## Installation

```bash
npm install ./packages/opencode-config-loader
# or link globally
npm link
```

## Usage

### Basic Usage

```js
const { getConfig } = require('opencode-config-loader');

const config = getConfig();

// Get specific values
const concurrencyLimit = config.get('performance.concurrency.defaultLimit'); // 5
const batchSize = config.get('performance.batchSize.sessionProcessing'); // 10
const lruMax = config.get('performance.lruCache.maxEntries'); // 10000

// Get with default fallback
const customValue = config.get('custom.setting', 'default-value');

// Get entire config
const allConfig = config.getAll();
```

### Advanced Usage

```js
const { ConfigLoader } = require('opencode-config-loader');

// Create custom instance with specific config file
const config = new ConfigLoader('/path/to/custom-config.json');
const settings = config.load();

// Reload configuration from disk
config.reload();
```

## Configuration Hierarchy

Settings are loaded with the following precedence (highest to lowest):

1. **Environment Variables** - `OPENCODE_*` prefix
2. **Project Config** - `.opencode.config.json` in project root
3. **User Config** - `~/.opencode/config.json`
4. **Defaults** - Built-in defaults

### Environment Variable Overrides

Override any setting using environment variables with `OPENCODE_` prefix:

```bash
# Override concurrency limit
export OPENCODE_PERFORMANCE_CONCURRENCY_DEFAULTLIMIT=10

# Override batch size
export OPENCODE_PERFORMANCE_BATCHSIZE_SESSIONPROCESSING=20

# Enable/disable features
export OPENCODE_FEATURES_AUTOCLEANUP_ENABLED=false
```

Nested paths use underscores. The loader will attempt to parse values as JSON, falling back to strings.

## Configuration Options

### Runtime Settings

```json
{
  "runtime": {
    "bun": {
      "heapLimit": "4096mb"
    }
  }
}
```

### Performance Settings

```json
{
  "performance": {
    "concurrency": {
      "defaultLimit": 5
    },
    "batchSize": {
      "sessionProcessing": 10,
      "graphEntries": 10
    },
    "lruCache": {
      "maxEntries": 10000
    }
  }
}
```

### Database Settings

```json
{
  "database": {
    "wal": {
      "checkpointInterval": 1000,
      "cleanupIntervalMs": 300000
    }
  }
}
```

### Logging Settings

```json
{
  "logging": {
    "rotation": {
      "maxFiles": 5,
      "maxSizeMb": 10
    },
    "healthd": {
      "checkIntervalMs": 300000
    }
  }
}
```

### Session Settings

```json
{
  "sessions": {
    "ttl": {
      "defaultMs": 86400000
    }
  }
}
```

### Feature Flags

```json
{
  "features": {
    "autoCleanup": {
      "enabled": true
    },
    "memoryOptimizations": {
      "enabled": true,
      "streamingEnabled": true,
      "batchingEnabled": true,
      "lruEnabled": true
    }
  }
}
```

### Path Settings

```json
{
  "paths": {
    "opencodeDir": "~/.opencode",
    "logsDir": "~/.opencode",
    "databaseDir": "~/.opencode"
  }
}
```

## Creating a Project Config

Create `.opencode.config.json` in your project root:

```json
{
  "version": "1.0.0",
  "performance": {
    "concurrency": {
      "defaultLimit": 10
    },
    "batchSize": {
      "sessionProcessing": 20
    }
  }
}
```

The loader automatically finds and merges this with defaults.

## Schema Validation

The project includes `opencode-config-schema.json` for IDE autocomplete and validation. In VS Code, this enables IntelliSense when editing `.opencode.config.json`.

## API Reference

### `getConfig()`

Returns singleton `ConfigLoader` instance.

```js
const config = getConfig();
```

### `ConfigLoader`

#### `constructor(configPath?)`

Create new ConfigLoader instance.

- `configPath` (optional): Path to specific config file

#### `load()`

Load and merge all configuration sources. Returns merged config object.

#### `get(path, defaultValue?)`

Get configuration value by dot-notation path.

- `path`: Dot-notation path (e.g., `'performance.concurrency.defaultLimit'`)
- `defaultValue`: Value to return if path not found

#### `getAll()`

Get entire merged configuration object.

#### `reload()`

Reload configuration from disk, discarding cached values.

## Migration Guide

To use centralized config in existing plugins:

```js
// OLD (hardcoded)
const BATCH_SIZE = 10;

// NEW (configurable)
const { getConfig } = require('opencode-config-loader');
const config = getConfig();
const BATCH_SIZE = config.get('performance.batchSize.sessionProcessing', 10);
```

## Examples

### Memory-Intensive Operation

```js
const { getConfig } = require('opencode-config-loader');
const config = getConfig();

async function processLargeDataset(items) {
  const batchSize = config.get('performance.batchSize.graphEntries', 10);
  const concurrency = config.get('performance.concurrency.defaultLimit', 5);

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processBatchWithConcurrency(batch, concurrency);
  }
}
```

### Conditional Features

```js
const { getConfig } = require('opencode-config-loader');
const config = getConfig();

function cleanupIfEnabled() {
  if (config.get('features.autoCleanup.enabled', true)) {
    performCleanup();
  }
}
```

### Dynamic Tuning

```bash
# In development: increase concurrency
export OPENCODE_PERFORMANCE_CONCURRENCY_DEFAULTLIMIT=20

# In production: conservative settings
export OPENCODE_PERFORMANCE_CONCURRENCY_DEFAULTLIMIT=3
export OPENCODE_PERFORMANCE_BATCHSIZE_SESSIONPROCESSING=5
```
