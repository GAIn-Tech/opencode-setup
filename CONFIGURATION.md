# OpenCode Configuration Guide

**Last Updated:** 2026-02-13

## Overview

OpenCode now uses a centralized configuration system to manage all performance, memory, and feature settings. This makes it easy to tune the system without editing code.

## Quick Start

### View Current Settings

```bash
cat .opencode.config.json
```

### Adjust Settings

Edit `.opencode.config.json` in the project root, or create `~/.opencode/config.json` for user-level defaults.

### Override with Environment Variables

```bash
export OPENCODE_PERFORMANCE_CONCURRENCY_DEFAULTLIMIT=10
export OPENCODE_PERFORMANCE_BATCHSIZE_SESSIONPROCESSING=20
```

## Configuration Files

| File | Priority | Scope |
|------|----------|-------|
| Environment variables (`OPENCODE_*`) | Highest | Current process |
| `.opencode.config.json` (project root) | High | Current project |
| `~/.opencode/config.json` | Medium | All projects for user |
| Built-in defaults | Lowest | Fallback values |

## Settings Reference

### 🚀 Performance Settings

#### Concurrency Control

**Path:** `performance.concurrency.defaultLimit`  
**Default:** `5`  
**Description:** Maximum concurrent operations for `Promise.all()` patterns

```json
{
  "performance": {
    "concurrency": {
      "defaultLimit": 5
    }
  }
}
```

**When to adjust:**
- **Increase (10-20):** Powerful machine, fast disk, need throughput
- **Decrease (2-3):** Memory-constrained, slower disk, stability over speed

#### Batch Processing

**Path:** `performance.batchSize.sessionProcessing`  
**Default:** `10`  
**Description:** Number of sessions to process in each batch

**Path:** `performance.batchSize.graphEntries`  
**Default:** `10`  
**Description:** Number of graph entries to load per batch

```json
{
  "performance": {
    "batchSize": {
      "sessionProcessing": 10,
      "graphEntries": 10
    }
  }
}
```

**When to adjust:**
- **Increase (20-50):** More RAM available, faster processing needed
- **Decrease (5-10):** Running out of memory, need stability

#### LRU Cache

**Path:** `performance.lruCache.maxEntries`  
**Default:** `10000`  
**Description:** Maximum entries before LRU eviction kicks in

```json
{
  "performance": {
    "lruCache": {
      "maxEntries": 10000
    }
  }
}
```

**When to adjust:**
- **Increase (50000+):** Large projects, lots of RAM, need cache hits
- **Decrease (1000-5000):** Memory-constrained environment

### 💾 Database Settings

#### WAL Checkpointing

**Path:** `database.wal.checkpointInterval`  
**Default:** `1000`  
**Description:** Checkpoint SQLite WAL every N writes

**Path:** `database.wal.cleanupIntervalMs`  
**Default:** `300000` (5 minutes)  
**Description:** How often to run WAL TRUNCATE cleanup

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

**When to adjust:**
- **Decrease checkpoint interval (100-500):** High write volume, prevent WAL growth
- **Increase cleanup interval (600000):** Lower I/O overhead on slow disks

### 📝 Logging Settings

#### Log Rotation

**Path:** `logging.rotation.maxFiles`  
**Default:** `5`  
**Description:** Keep last N log files

**Path:** `logging.rotation.maxSizeMb`  
**Default:** `10`  
**Description:** Maximum size per log file before rotation

```json
{
  "logging": {
    "rotation": {
      "maxFiles": 5,
      "maxSizeMb": 10
    }
  }
}
```

**Total log disk usage:** `maxFiles × maxSizeMb` = 50MB default

#### Health Daemon

**Path:** `logging.healthd.checkIntervalMs`  
**Default:** `300000` (5 minutes)  
**Description:** How often healthd runs system checks

```json
{
  "logging": {
    "healthd": {
      "checkIntervalMs": 300000
    }
  }
}
```

### 🕒 Session Management

#### TTL Cleanup

**Path:** `sessions.ttl.defaultMs`  
**Default:** `86400000` (24 hours)  
**Description:** Session time-to-live for automatic cleanup

```json
{
  "sessions": {
    "ttl": {
      "defaultMs": 86400000
    }
  }
}
```

**When to adjust:**
- **Increase (604800000 = 7 days):** Need longer session history
- **Decrease (3600000 = 1 hour):** Aggressive memory cleanup

### 🏗️ Runtime Settings

#### Bun Memory

**Path:** `runtime.bun.heapLimit`  
**Default:** `"4096mb"`  
**Description:** Bun heap memory limit (also set in `bunfig.toml`)

```json
{
  "runtime": {
    "bun": {
      "heapLimit": "4096mb"
    }
  }
}
```

**When to adjust:**
- **Increase (8192mb):** Large projects, high concurrency, available RAM
- **Decrease (2048mb):** Running in containers with limited memory

### 🎛️ Feature Flags

#### Auto Cleanup

**Path:** `features.autoCleanup.enabled`  
**Default:** `true`  
**Description:** Enable automatic cleanup mechanisms (WAL, logs, sessions)

```json
{
  "features": {
    "autoCleanup": {
      "enabled": true
    }
  }
}
```

**Set to `false` to disable all automatic cleanup** (useful for debugging)

#### Memory Optimizations

**Path:** `features.memoryOptimizations.*`  
**Default:** All `true`  
**Description:** Enable/disable specific memory optimization features

```json
{
  "features": {
    "memoryOptimizations": {
      "enabled": true,
      "streamingEnabled": true,
      "batchingEnabled": true,
      "lruEnabled": true
    }
  }
}
```

## Environment Variable Reference

All settings can be overridden via environment variables using the `OPENCODE_` prefix and underscores for nesting:

| Setting Path | Environment Variable |
|--------------|---------------------|
| `performance.concurrency.defaultLimit` | `OPENCODE_PERFORMANCE_CONCURRENCY_DEFAULTLIMIT` |
| `performance.batchSize.sessionProcessing` | `OPENCODE_PERFORMANCE_BATCHSIZE_SESSIONPROCESSING` |
| `database.wal.checkpointInterval` | `OPENCODE_DATABASE_WAL_CHECKPOINTINTERVAL` |
| `logging.rotation.maxFiles` | `OPENCODE_LOGGING_ROTATION_MAXFILES` |
| `features.autoCleanup.enabled` | `OPENCODE_FEATURES_AUTOCLEANUP_ENABLED` |

**Example:**

```bash
# Development: Aggressive performance
export OPENCODE_PERFORMANCE_CONCURRENCY_DEFAULTLIMIT=20
export OPENCODE_PERFORMANCE_BATCHSIZE_SESSIONPROCESSING=50

# Production: Conservative and stable
export OPENCODE_PERFORMANCE_CONCURRENCY_DEFAULTLIMIT=3
export OPENCODE_PERFORMANCE_BATCHSIZE_SESSIONPROCESSING=5
export OPENCODE_FEATURES_AUTOCLEANUP_ENABLED=true
```

## Recommended Configurations

### High-Performance Workstation

```json
{
  "runtime": { "bun": { "heapLimit": "8192mb" } },
  "performance": {
    "concurrency": { "defaultLimit": 20 },
    "batchSize": { "sessionProcessing": 50, "graphEntries": 50 },
    "lruCache": { "maxEntries": 50000 }
  }
}
```

### Memory-Constrained Environment

```json
{
  "runtime": { "bun": { "heapLimit": "2048mb" } },
  "performance": {
    "concurrency": { "defaultLimit": 2 },
    "batchSize": { "sessionProcessing": 5, "graphEntries": 5 },
    "lruCache": { "maxEntries": 1000 }
  }
}
```

### Container/CI Environment

```json
{
  "runtime": { "bun": { "heapLimit": "2048mb" } },
  "performance": {
    "concurrency": { "defaultLimit": 3 },
    "batchSize": { "sessionProcessing": 10, "graphEntries": 10 }
  },
  "features": {
    "autoCleanup": { "enabled": true }
  }
}
```

## Using Configuration in Code

### Basic Usage

```javascript
const { getConfig } = require('opencode-config-loader');
const config = getConfig();

const concurrency = config.get('performance.concurrency.defaultLimit', 5);
const batchSize = config.get('performance.batchSize.sessionProcessing', 10);
```

### Full Example

```javascript
const { getConfig } = require('opencode-config-loader');
const config = getConfig();

async function processLargeDataset(items) {
  // Get tunable settings
  const batchSize = config.get('performance.batchSize.graphEntries', 10);
  const concurrency = config.get('performance.concurrency.defaultLimit', 5);
  const optimizationsEnabled = config.get('features.memoryOptimizations.enabled', true);

  // Use settings to control behavior
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    if (optimizationsEnabled) {
      await processBatchWithConcurrencyLimit(batch, concurrency);
    } else {
      await Promise.all(batch.map(processSingle));
    }
  }
}
```

## Troubleshooting

### Still Running Out of Memory?

1. **Check bunfig.toml:** Ensure heap limit matches config
2. **Reduce batch sizes:** Try 5 instead of 10
3. **Lower concurrency:** Try 2-3 instead of 5
4. **Enable cleanup:** Set `features.autoCleanup.enabled: true`
5. **Check environment:** Ensure no env vars override your settings

### Performance Too Slow?

1. **Increase concurrency:** Try 10-20 if you have RAM
2. **Increase batch sizes:** Try 20-50 for faster processing
3. **Check disk I/O:** Slow disk may need lower concurrency
4. **Monitor memory:** Use `top`/`htop` to check headroom

### Configuration Not Loading?

1. **Check file location:** Must be `.opencode.config.json` in project root or `~/.opencode/config.json`
2. **Validate JSON:** Use `jq . < .opencode.config.json` to check syntax
3. **Check logs:** Look for config load errors in healthd.log
4. **Reload config:** Restart services to pick up changes

## Schema Validation

VS Code and other IDEs can provide autocomplete using the included schema:

```json
{
  "$schema": "./opencode-config-schema.json",
  "version": "1.0.0",
  ...
}
```

## See Also

- `packages/opencode-config-loader/README.md` - Loader API documentation
- `bunfig.toml` - Bun-specific runtime configuration
- `TROUBLESHOOTING.md` - General troubleshooting guide
