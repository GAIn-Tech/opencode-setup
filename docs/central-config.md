# Central Configuration System

The Central Configuration System provides a unified, dashboard-editable configuration layer for OpenCode with built-in support for Reinforcement Learning (RL) boundaries.

## Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│    Defaults     │ --> │  Central Config  │ --> │  RL State   │ --> Final Value
│ (code defaults) │     │ (dashboard edit) │     │ (learned)   │
└─────────────────┘     └──────────────────┘     └─────────────┘
                                │                       │
                                v                       v
                        ┌───────────────────────────────────────┐
                        │          Hard Bounds Clamp            │
                        │    (immutable safety boundaries)      │
                        └───────────────────────────────────────┘
```

## Key Concepts

### Layered Configuration
Values are resolved in order of precedence:
1. **Defaults** - Built-in code defaults
2. **Central Config** - Dashboard-editable values (`central-config.json`)
3. **RL State** - Learned optimizations (`~/.opencode/rl-state.json`)
4. **Hard Bounds** - Immutable clamp (always enforced)

### Bounds System

Each parameter can have:

- **Soft Bounds** (`soft.min`, `soft.max`): RL can override these when confident
- **Hard Bounds** (`hard.min`, `hard.max`): Immutable, never overridden

```json
{
  "request_timeout_ms": {
    "value": 60000,
    "soft": { "min": 5000, "max": 60000 },
    "hard": { "min": 1000, "max": 120000 },
    "locked": false,
    "rl_allowed": true
  }
}
```

### RL Override Threshold

The global `rl.override_min_confidence` (default: 0.85) determines when RL can override dashboard values:

- If RL confidence >= threshold: RL value used (clamped to soft bounds)
- If RL confidence < threshold: Dashboard value used
- Hard bounds are **always** enforced regardless of confidence

### Parameter Controls

- **`locked`**: When true, RL cannot modify this parameter
- **`rl_allowed`**: When false, RL ignores this parameter entirely

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| Schema | `opencode-config/central-config.schema.json` | JSON Schema validation |
| Config | `opencode-config/central-config.json` | Dashboard-editable config |
| RL State | `~/.opencode/rl-state.json` | Learned values + confidence |
| Audit Log | `~/.opencode/audit/central-config.log` | Change history (JSONL) |

## Configuration Sections

### `routing`
Model routing and retry behavior:
- `request_timeout_ms` - Request timeout
- `retry_max_attempts` - Maximum retry count
- `retry_base_delay_ms` - Base delay between retries
- `retry_max_delay_ms` - Maximum delay cap
- `retry_strategy` - Retry strategy (exponential, linear)
- `jitter_enabled` - Add randomness to delays
- `jitter_factor` - Jitter amount (0-1)

### `fallback`
Rate limit fallback configuration:
- `enabled` - Enable fallback system
- `fallback_mode` - Mode (cycle, ordered, random)
- `cooldown_ms` - Cooldown between fallbacks
- `circuit_breaker_*` - Circuit breaker settings
- `enable_subagent_fallback` - Fallback for subagents
- `max_subagent_depth` - Maximum subagent nesting

### `providers`
Provider configuration (all locked, RL disabled):
- API key environment variables
- Base URLs

### `governance`
Governance settings (RL disabled):
- `daily_budget_usd` - Daily spend limit
- `cost_alert_threshold_percent` - Alert threshold
- `minimum_test_coverage_percent` - Code quality gate
- `escalation_*` - Escalation settings

### `operational`
Operational toggles:
- `cost_tracking_enabled` - Track costs
- `batching_enabled` - Batch similar tasks
- `max_batch_size` - Maximum batch size
- `max_concurrent_tasks` - Parallelism limit
- `context_preservation_enabled` - Preserve context

### `subagent_retry`
Subagent failure handling and retry behavior:
- `max_retries` - Maximum retry attempts before giving up (default: 3)
- `failure_threshold` - Failures before marking model unstable (default: 5)
- `unstable_window_ms` - How long a model stays marked unstable (default: 5 min / 300000ms)
- `early_timeout_ms` - Faster timeout for known-unstable models (default: 30s / 30000ms)
- `validate_responses` - Enable response validation for early failure detection (default: true)
- `min_response_length` - Minimum response length to consider valid (default: 10 chars)

The subagent retry system automatically:
1. **Redirects raw Gemini models** to antigravity versions via model aliasing
2. **Validates responses** for empty content, rate limits, and service errors
3. **Tracks model stability** and marks models as unstable after repeated failures
4. **Selects category-appropriate fallbacks** when retrying failed requests

### `meta_awareness`
Meta-awareness scoring and RL guardrails for orchestration intelligence:
- `max_update_delta` - Maximum per-event score shift to prevent learning spikes
- `min_samples_for_signal` - Minimum evidence before exposing RL signal
- `signal_max_influence` - Hard cap on meta-signal contribution in routing
- `confidence_threshold` - Minimum confidence for RL signal acceptance
- `anomaly_z_threshold` - Spike sensitivity for anomaly detection
- `exploration_floor` - Minimum exploration probability to avoid collapse

This section is designed to prevent both learning explosion and learning collapse:
1. **Bounded updates** cap any single event impact
2. **Confidence gating** blocks weak/uncertain meta-signals
3. **Anomaly detection** flags unusual score swings
4. **Exploration floor** preserves adaptation and prevents lock-in

## API Usage

### Loading Configuration

```javascript
const { loadCentralConfig, mergeCentralConfig, loadRlState } = require('opencode-config-loader');

// Load raw config
const central = loadCentralConfig();

// Load RL state
const rlState = loadRlState();

// Get effective (merged) config
const effective = mergeCentralConfig({
  central,
  rlState,
  globalConfidence: central.rl.override_min_confidence
});

// Access effective value
const timeout = effective.sections.routing.request_timeout_ms.value;
```

### Dashboard API

```bash
# Get all configs (including centralConfig)
GET /api/config

# Get effective config only
GET /api/config?view=effective

# Save central config (with optimistic concurrency)
POST /api/config
{
  "configKey": "centralConfig",
  "data": { ... },
  "config_version": 1
}
```

## Concurrency Control

The system uses optimistic concurrency via `config_version`:

1. Read config, note `config_version`
2. Make changes
3. POST with same `config_version`
4. If version mismatch: 409 Conflict (reload and retry)
5. On success: `config_version` incremented automatically

## Audit Logging

All changes are logged to `~/.opencode/audit/central-config.log` in JSONL format:

```json
{"timestamp":"2026-02-23T22:30:00.000Z","action":"update","section":"routing","param":"request_timeout_ms","oldValue":60000,"newValue":45000,"source":"dashboard","user":"system"}
```

Query the audit log:
```javascript
const { readAuditLog } = require('opencode-config-loader');

// Get recent entries
const entries = readAuditLog({ limit: 100 });

// Filter by time range
const entries = readAuditLog({
  since: '2026-02-01T00:00:00Z',
  until: '2026-02-28T23:59:59Z'
});
```

## Migration

To migrate from existing configuration files:

```bash
# Preview changes (dry run)
node scripts/migrate-central-config.mjs --dry-run

# Compare central-config to source files
node scripts/migrate-central-config.mjs --shadow

# Apply migration
node scripts/migrate-central-config.mjs
```

## Rollback

The system maintains snapshots for recovery:

```javascript
const { createSnapshot, restoreSnapshot, listSnapshots } = require('opencode-config-loader');

// Create snapshot before risky change
await createSnapshot('pre-experiment');

// List available snapshots
const snapshots = await listSnapshots();

// Restore if needed
await restoreSnapshot('pre-experiment');
```

## Best Practices

1. **Set appropriate hard bounds** - These are your safety limits
2. **Start with conservative soft bounds** - Expand as RL proves itself
3. **Lock governance parameters** - Don't let RL adjust budgets
4. **Monitor the audit log** - Track what's changing and why
5. **Use shadow mode** - Validate before migrating
6. **Test RL threshold changes** - Start at 0.85, adjust carefully

## Troubleshooting

### Config not loading
```bash
bun run verify  # Check central-config.json exists and is valid
```

### RL not applying
- Check `rl_allowed: true` on the parameter
- Check `locked: false`
- Verify RL confidence >= `rl.override_min_confidence`

### Version conflicts
- Reload config before editing
- Check for other processes modifying config
- Review audit log for recent changes

### Dashboard not showing central config
- Ensure API route is updated (check `/api/config`)
- Verify config-loader modules are accessible
- Check browser console for errors
