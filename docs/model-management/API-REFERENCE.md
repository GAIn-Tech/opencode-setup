# Model Management API Reference

Complete API documentation for the OpenCode Model Management System.

## Table of Contents

- [Provider Adapters](#provider-adapters)
- [Discovery Engine](#discovery-engine)
- [Cache Layer](#cache-layer)
- [Snapshot Store](#snapshot-store)
- [Diff Engine](#diff-engine)
- [Model Assessor](#model-assessor)
- [Lifecycle State Machine](#lifecycle-state-machine)
- [Audit Logger](#audit-logger)
- [Auto-Approval Rules](#auto-approval-rules)
- [PR Generator](#pr-generator)
- [Catalog Validator](#catalog-validator)
- [Pipeline Metrics Collector](#pipeline-metrics-collector)
- [Alert Manager](#alert-manager)
- [Monitoring API](#monitoring-api)

---

## Provider Adapters

All provider adapters implement the same interface defined by `BaseAdapter`.

### Base Adapter Interface

```javascript
class BaseAdapter {
  /**
   * List all available models from the provider
   * @param {object} [options] - Provider-specific options
   * @returns {Promise<NormalizedModel[]>}
   * @throws {Error} If API call fails after retries
   */
  async list(options = {})

  /**
   * Get a specific model by ID
   * @param {string} id - Model identifier
   * @param {object} [options] - Provider-specific options
   * @returns {Promise<NormalizedModel|null>}
   */
  async get(id, options = {})

  /**
   * Normalize raw provider data to standard schema
   * @param {object} raw - Raw model data from provider
   * @returns {NormalizedModel}
   */
  normalize(raw)

  /**
   * Extract capabilities from model metadata
   * @param {NormalizedModel} model - Normalized model
   * @returns {Capabilities}
   */
  getCapabilities(model)
}
```

### Normalized Model Schema

```typescript
interface NormalizedModel {
  id: string;                    // Unique identifier
  provider: string;              // Provider name (lowercase)
  displayName: string;           // Human-readable name
  contextTokens: number | null;  // Max context window
  outputTokens: number | null;   // Max output tokens
  deprecated: boolean;           // Deprecation status
  capabilities: {
    streaming: boolean;          // Supports streaming
    tools: boolean;              // Supports function calling
    vision: boolean;             // Supports image inputs
    reasoning: boolean;          // Extended thinking mode
  };
}
```

### Provider-Specific Adapters

#### OpenAIAdapter

```javascript
const { OpenAIAdapter } = require('./src/adapters/openai');

const adapter = new OpenAIAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
  timeout: 30000,
  maxRetries: 3
});

const models = await adapter.list();
```

#### AnthropicAdapter

```javascript
const { AnthropicAdapter } = require('./src/adapters/anthropic');

const adapter = new AnthropicAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.anthropic.com/v1',
  timeout: 30000,
  maxRetries: 3
});

const models = await adapter.list({ limit: 100 });
```

#### GoogleAdapter

```javascript
const { GoogleAdapter } = require('./src/adapters/google');

const adapter = new GoogleAdapter({
  apiKey: process.env.GOOGLE_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta',
  timeout: 30000,
  maxRetries: 3
});

const models = await adapter.list();
```

---

## Discovery Engine

Orchestrates discovery across all providers in parallel.

```javascript
const { DiscoveryEngine } = require('./src/discovery/discovery-engine');

const engine = new DiscoveryEngine({
  providers: ['openai', 'anthropic', 'google', 'groq', 'cerebras', 'nvidia'],
  timeout: 30000,
  parallel: true
});

/**
 * Run discovery across all providers
 * @returns {Promise<DiscoveryResult>}
 */
const result = await engine.discover();
```

### DiscoveryResult

```typescript
interface DiscoveryResult {
  models: NormalizedModel[];     // All discovered models
  errors: ProviderError[];       // Errors by provider
  duration: number;              // Total duration (ms)
  timestamp: number;             // Discovery timestamp
  providers: {
    [provider: string]: {
      success: boolean;
      modelCount: number;
      duration: number;
      error?: string;
    };
  };
}
```

---

## Cache Layer

Two-tier caching with stale-while-revalidate.

```javascript
const { CacheLayer } = require('./src/cache/cache-layer');

const cache = new CacheLayer({
  l1Ttl: 300000,      // L1 TTL: 5 minutes
  l2Ttl: 3600000,     // L2 TTL: 1 hour
  l2Path: './.cache'  // L2 storage path
});

/**
 * Get value from cache or fetch
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Async function to fetch data
 * @returns {Promise<any>}
 */
const data = await cache.get('provider:openai', async () => {
  return await fetchFromProvider();
});

/**
 * Invalidate cache entry
 * @param {string} key - Cache key
 */
cache.invalidate('provider:openai');

/**
 * Clear all cache
 */
cache.clear();
```

---

## Snapshot Store

Timestamped snapshots with retention management.

```javascript
const { SnapshotStore } = require('./src/snapshot/snapshot-store');

const store = new SnapshotStore({
  storagePath: './.snapshots',
  retentionDays: 30
});

/**
 * Save a snapshot
 * @param {string} provider - Provider name
 * @param {NormalizedModel[]} models - Normalized models
 * @param {object} rawPayload - Original API response
 * @returns {Promise<Snapshot>}
 */
const snapshot = await store.save('openai', models, rawPayload);

/**
 * Get latest snapshot for provider
 * @param {string} provider - Provider name
 * @returns {Promise<Snapshot|null>}
 */
const latest = await store.getLatest('openai');

/**
 * Get snapshots in time range
 * @param {string} provider - Provider name
 * @param {number} startTime - Start timestamp (ms)
 * @param {number} endTime - End timestamp (ms)
 * @returns {Promise<Snapshot[]>}
 */
const snapshots = await store.getByTimeRange('openai', startTime, endTime);
```

### Snapshot Schema

```typescript
interface Snapshot {
  id: string;                    // Unique snapshot ID
  provider: string;              // Provider name
  timestamp: number;             // Creation timestamp (ms)
  modelCount: number;            // Number of models
  models: NormalizedModel[];     // Normalized models
  payloadHash: string;           // SHA-256 of raw payload
  rawPayload: object;            // Original API response
}
```

---

## Diff Engine

Detects changes between snapshots.

```javascript
const { DiffEngine } = require('./src/diff/diff-engine');

const diffEngine = new DiffEngine();

/**
 * Compare two snapshots
 * @param {Snapshot} oldSnapshot - Previous snapshot
 * @param {Snapshot} newSnapshot - Current snapshot
 * @returns {DiffResult}
 */
const diff = diffEngine.compare(oldSnapshot, newSnapshot);
```

### DiffResult

```typescript
interface DiffResult {
  added: NormalizedModel[];      // New models
  removed: NormalizedModel[];    // Removed models
  modified: ModelChange[];       // Modified models
  unchanged: number;             // Count of unchanged models
  classification: {
    major: number;               // Major changes
    minor: number;               // Minor changes
    patch: number;               // Patch changes
  };
}

interface ModelChange {
  id: string;
  provider: string;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
    severity: 'major' | 'minor' | 'patch';
  }[];
}
```

---

## Model Assessor

Runs real benchmarks on models.

```javascript
const { ModelAssessor } = require('./src/assessment/model-assessor');

const assessor = new ModelAssessor({
  humanevalProblems: 10,
  mbppProblems: 10,
  latencyPrompts: 5,
  timeout: 300000
});

/**
 * Assess a model
 * @param {NormalizedModel} model - Model to assess
 * @returns {Promise<AssessmentResult>}
 */
const results = await assessor.assess(model);
```

### AssessmentResult

```typescript
interface AssessmentResult {
  modelId: string;
  timestamp: number;
  humaneval: {
    score: number;               // 0-100
    passed: number;
    total: number;
    duration: number;
  };
  mbpp: {
    score: number;               // 0-100
    passed: number;
    total: number;
    duration: number;
  };
  latency: {
    mean: number;                // ms
    p50: number;
    p95: number;
    p99: number;
  };
  overall: {
    accuracy: number;            // 0-100
    latency: number;             // 0-100 (inverted)
    cost: number;                // 0-100 (estimated)
    robustness: number;          // 0-100
  };
}
```

---

## Lifecycle State Machine

Manages model lifecycle states.

```javascript
const { StateMachine } = require('./src/lifecycle/state-machine');

const stateMachine = new StateMachine({
  dbPath: './lifecycle.db'
});

/**
 * Transition model to new state
 * @param {string} modelId - Model identifier
 * @param {LifecycleState} toState - Target state
 * @param {TransitionContext} context - Transition context
 * @returns {Promise<void>}
 * @throws {Error} If transition is invalid
 */
await stateMachine.transition(modelId, 'approved', {
  actor: 'auto-approval',
  reason: 'Low risk score (25)',
  metadata: { riskScore: 25 }
});

/**
 * Get current state
 * @param {string} modelId - Model identifier
 * @returns {Promise<LifecycleState|null>}
 */
const state = await stateMachine.getState(modelId);

/**
 * Get state history
 * @param {string} modelId - Model identifier
 * @returns {Promise<StateTransition[]>}
 */
const history = await stateMachine.getHistory(modelId);
```

### Lifecycle States

```typescript
enum LifecycleState {
  DETECTED = 'detected',         // Model discovered
  ASSESSED = 'assessed',         // Benchmarks complete
  APPROVED = 'approved',         // Approved for catalog
  SELECTABLE = 'selectable',     // Available in UI
  DEFAULT = 'default'            // Default for category
}
```

### Valid Transitions

```
detected → assessed
assessed → approved
approved → selectable
selectable → default

assessed → detected (rollback)
approved → assessed (revoke)
selectable → approved (remove)
default → selectable (demote)
```

---

## Audit Logger

Tamper-evident audit trail with hash chain.

```javascript
const { AuditLogger } = require('./src/lifecycle/audit-logger');

const logger = new AuditLogger({
  dbPath: './audit.db',
  retentionDays: 365
});

/**
 * Log a state transition
 * @param {AuditEntry} entry - Audit entry
 * @returns {Promise<void>}
 */
await logger.log({
  modelId: 'gpt-4',
  fromState: 'assessed',
  toState: 'approved',
  actor: 'auto-approval',
  reason: 'Low risk score',
  diffHash: 'sha256:abc123...',
  metadata: { riskScore: 25 }
});

/**
 * Get audit trail for model
 * @param {string} modelId - Model identifier
 * @returns {Promise<AuditEntry[]>}
 */
const trail = await logger.getTrail(modelId);

/**
 * Verify hash chain integrity
 * @returns {Promise<VerificationResult>}
 */
const verification = await logger.verifyChain();
```

---

## Auto-Approval Rules

Risk-based approval decisions.

```javascript
const { AutoApprovalRules } = require('./src/lifecycle/auto-approval-rules');

const rules = new AutoApprovalRules({
  thresholds: {
    autoApprove: 50,
    manualReview: 80
  },
  trustedProviders: ['openai', 'anthropic']
});

/**
 * Evaluate change for approval
 * @param {DiffResult} diff - Change diff
 * @param {NormalizedModel} model - Model being evaluated
 * @returns {ApprovalEvaluation}
 */
const evaluation = rules.evaluate(diff, model);
```

### ApprovalEvaluation

```typescript
interface ApprovalEvaluation {
  score: number;                 // 0-100 risk score
  recommendation: 'auto-approve' | 'manual-review' | 'block';
  reasons: string[];             // Explanation
  breakdown: {
    [rule: string]: number;      // Score contribution
  };
}
```

---

## PR Generator

Automated GitHub PR creation.

```javascript
const { PRGenerator } = require('./src/automation/pr-generator');

const prGenerator = new PRGenerator({
  owner: 'your-org',
  repo: 'your-repo',
  token: process.env.GITHUB_TOKEN
});

/**
 * Generate PR for changes
 * @param {DiffResult} diff - Model changes
 * @returns {Promise<PRDetails>}
 */
const prDetails = await prGenerator.generatePR(diff);
```

### PRDetails

```typescript
interface PRDetails {
  branch: string;                // Branch name
  title: string;                 // PR title
  body: string;                  // PR description (markdown)
  files: {
    path: string;
    content: string;
  }[];
  riskScore: number;
  url?: string;                  // PR URL (if created)
}
```

---

## Catalog Validator

Comprehensive validation checks.

```javascript
const { CatalogValidator } = require('./src/validation/catalog-validator');

const validator = new CatalogValidator({
  catalogPath: './opencode-config/models/catalog-2026.json',
  schemaPath: './opencode-config/models/schema.json'
});

/**
 * Validate catalog
 * @returns {Promise<ValidationResult>}
 */
const result = await validator.validate();

/**
 * Format results for display
 * @param {ValidationResult} result - Validation result
 * @returns {string}
 */
const formatted = validator.formatResults(result);
```

---

## Pipeline Metrics Collector

Operational health metrics.

```javascript
const { PipelineMetricsCollector } = require('./src/monitoring/metrics-collector');

const metrics = new PipelineMetricsCollector({
  retentionMs: 86400000,         // 24 hours
  autoCleanup: true
});

/**
 * Record discovery attempt
 * @param {string} provider - Provider name
 * @param {boolean} success - Success status
 * @param {object} details - Additional details
 */
metrics.recordDiscovery('openai', true, {
  modelCount: 38,
  durationMs: 1250
});

/**
 * Record cache access
 * @param {string} tier - 'L1' or 'L2'
 * @param {boolean} hit - Cache hit status
 */
metrics.recordCacheAccess('L1', true);

/**
 * Record state transition
 * @param {string} fromState - Source state
 * @param {string} toState - Target state
 */
metrics.recordTransition('assessed', 'approved');

/**
 * Get discovery rates
 * @param {number} [windowMs] - Time window
 * @returns {object}
 */
const rates = metrics.getDiscoveryRates();

/**
 * Export as Prometheus format
 * @returns {string}
 */
const prometheus = metrics.toPrometheus();
```

---

## Alert Manager

Threshold-based alerting.

```javascript
const { AlertManager } = require('./src/monitoring/alert-manager');

const alertManager = new AlertManager();

/**
 * Evaluate metrics and fire alerts
 * @param {object} metrics - Current metrics
 * @returns {Alert[]}
 */
const alerts = alertManager.evaluate(metrics);

/**
 * Get active alerts
 * @returns {Alert[]}
 */
const active = alertManager.getActiveAlerts();

/**
 * Suppress alert type
 * @param {string} type - Alert type
 */
alertManager.suppress('provider_failure');

// Listen for alerts
alertManager.on('alert:fired', (alert) => {
  console.log('Alert fired:', alert);
});

alertManager.on('alert:resolved', (alert) => {
  console.log('Alert resolved:', alert);
});
```

---

## Monitoring API

Dashboard API endpoints.

### GET /api/monitoring

Query monitoring metrics.

**Query Parameters:**
- `format`: `json` (default) | `prometheus`
- `window`: Time window in ms (default: 86400000)
- `section`: `all` | `discovery` | `cache` | `transitions` | `pr` | `alerts`

**Response (JSON):**
```json
{
  "discovery": {
    "openai": {
      "total": 10,
      "successes": 9,
      "failures": 1,
      "rate": 0.9,
      "consecutiveFailures": 0
    }
  },
  "cache": {
    "L1": { "hits": 150, "misses": 10, "rate": 0.9375 },
    "L2": { "hits": 8, "misses": 2, "rate": 0.8 }
  },
  "transitions": {
    "detected->assessed": 5,
    "assessed->approved": 3
  },
  "pr": {
    "successes": 2,
    "failures": 0,
    "rate": 1.0
  },
  "alerts": {
    "active": [],
    "suppressed": []
  }
}
```

### POST /api/monitoring

Ingest metrics from external sources.

**Request Body:**
```json
{
  "type": "discovery",
  "provider": "openai",
  "success": true,
  "details": {
    "modelCount": 38,
    "durationMs": 1250
  }
}
```

---

## Error Handling

All async methods may throw errors. Common error types:

```typescript
class ProviderError extends Error {
  provider: string;
  statusCode?: number;
  retryable: boolean;
}

class ValidationError extends Error {
  field: string;
  value: any;
  constraint: string;
}

class StateTransitionError extends Error {
  modelId: string;
  fromState: string;
  toState: string;
  reason: string;
}
```

---

## Type Definitions

For TypeScript users, type definitions are available:

```bash
npm install --save-dev @types/better-sqlite3
```

---

## See Also

- [Architecture](./ARCHITECTURE.md) - System architecture
- [Operations Guide](./OPERATIONS.md) - Operational procedures
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues
- [README](../../packages/opencode-model-manager/README.md) - Quick start
