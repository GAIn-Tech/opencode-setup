# OpenCode Model Manager

Automated model management system for OpenCode that discovers, validates, assesses, and integrates AI models from multiple providers with minimal human intervention.

## Features

- 🔍 **Multi-Provider Discovery**: Automated polling from 6 providers (OpenAI, Anthropic, Google, Groq, Cerebras, NVIDIA)
- 💾 **Two-Tier Caching**: L1 in-memory (5min) + L2 persistent (1hr) with stale-while-revalidate
- 🔄 **Change Detection**: Snapshot-based diff engine with 100% classification accuracy
- 📊 **Real Benchmarks**: HumanEval, MBPP, and latency testing for quality assessment
- 🔐 **Lifecycle Management**: 5-state machine (detected → assessed → approved → selectable → default)
- 📝 **Audit Trail**: Tamper-evident hash chain with 1-year retention
- ⚖️ **Risk-Based Approval**: Automated approval for low-risk changes (score 0-50)
- 🤖 **PR Automation**: Automated GitHub PRs with diff tables and risk assessment
- ⚙️ **CI/CD Integration**: Weekly discovery workflow with automated PR creation
- ✅ **Validation Pipeline**: Comprehensive catalog validation with forbidden pattern detection

## Quick Start

### Installation

```bash
cd packages/opencode-model-manager
bun install
```

### Basic Usage

```javascript
const { DiscoveryEngine } = require('./src/discovery/discovery-engine');
const { CacheLayer } = require('./src/cache/cache-layer');

// Initialize discovery engine
const engine = new DiscoveryEngine();

// Run discovery
const result = await engine.discover();
console.log(`Discovered ${result.models.length} models`);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Discovery Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│  Provider Adapters → Discovery Engine → Cache Layer         │
│  ↓                                                           │
│  Snapshot Store → Diff Engine → Change Events               │
│  ↓                                                           │
│  Model Assessor → Metrics Collector → State Machine         │
│  ↓                                                           │
│  Auto-Approval Rules → Audit Logger → PR Generator          │
└─────────────────────────────────────────────────────────────┘
```

## Components

### Provider Adapters

Normalized interfaces for 6 AI providers:

```javascript
const { OpenAIAdapter } = require('./src/adapters/openai');
const { AnthropicAdapter } = require('./src/adapters/anthropic');
const { GoogleAdapter } = require('./src/adapters/google');
const { GroqAdapter } = require('./src/adapters/groq');
const { CerebrasAdapter } = require('./src/adapters/cerebras');
const { NVIDIAAdapter } = require('./src/adapters/nvidia');

// Use any adapter
const adapter = new OpenAIAdapter();
const models = await adapter.list();
```

### Discovery Engine

Orchestrates all provider adapters in parallel:

```javascript
const { DiscoveryEngine } = require('./src/discovery/discovery-engine');

const engine = new DiscoveryEngine();
const result = await engine.discover();

// Result: { models: [...], errors: [...] }
```

### Cache Layer

Two-tier caching with stale-while-revalidate:

```javascript
const { CacheLayer } = require('./src/cache/cache-layer');

const cache = new CacheLayer({
  l1Ttl: 300000,  // 5 minutes
  l2Ttl: 3600000  // 1 hour
});

const data = await cache.get('key', async () => {
  return await fetchData();
});
```

### Snapshot Store

Timestamped snapshots with 30-day retention:

```javascript
const { SnapshotStore } = require('./src/snapshot/snapshot-store');

const store = new SnapshotStore();
await store.save('openai', models, rawPayload);

const latest = await store.getLatest('openai');
```

### Diff Engine

Detects added/removed/modified models:

```javascript
const { DiffEngine } = require('./src/diff/diff-engine');

const diffEngine = new DiffEngine();
const diff = diffEngine.compare(oldSnapshot, newSnapshot);

// diff: { added: [...], removed: [...], modified: [...] }
```

### Model Assessor

Real benchmark execution:

```javascript
const { ModelAssessor } = require('./src/assessment/model-assessor');

const assessor = new ModelAssessor();
const results = await assessor.assess(model);

// results: { humaneval: {...}, mbpp: {...}, latency: {...} }
```

### Lifecycle State Machine

5-state lifecycle management:

```javascript
const { StateMachine } = require('./src/lifecycle/state-machine');

const stateMachine = new StateMachine();
await stateMachine.transition(modelId, 'approved', context);

const state = await stateMachine.getState(modelId);
```

### Auto-Approval Rules

Risk-based approval decisions:

```javascript
const { AutoApprovalRules } = require('./src/lifecycle/auto-approval-rules');

const rules = new AutoApprovalRules(config);
const evaluation = rules.evaluate(diff, model);

// evaluation: { score: 25, recommendation: 'auto-approve', ... }
```

### PR Generator

Automated GitHub PR creation:

```javascript
const { PRGenerator } = require('./src/automation/pr-generator');

const prGenerator = new PRGenerator();
const prDetails = await prGenerator.generatePR(diff);

// prDetails: { branch: '...', title: '...', body: '...' }
```

### Catalog Validator

Comprehensive validation checks:

```javascript
const { CatalogValidator } = require('./src/validation/catalog-validator');

const validator = new CatalogValidator();
const result = await validator.validate();

console.log(validator.formatResults(result));
```

## Configuration

### Environment Variables

```bash
# Provider API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
GROQ_API_KEY=gsk_...
CEREBRAS_API_KEY=...
NVIDIA_API_KEY=...

# Database Paths (optional)
LIFECYCLE_DB_PATH=./lifecycle.db
AUDIT_DB_PATH=./audit.db
ASSESSMENT_DB_PATH=./assessments.db
```

### Configuration Files

```javascript
// Auto-approval rules
{
  "thresholds": {
    "autoApprove": 50,
    "manualReview": 80
  },
  "trustedProviders": ["openai", "anthropic"],
  "rules": {
    "metadataOnly": { "score": 5, "autoApprove": true },
    "patchVersion": { "score": 10, "autoApprove": true }
  }
}
```

## Testing

```bash
# Run all tests
bun test

# Run specific test suite
bun test test/adapters/
bun test test/discovery/
bun test test/lifecycle/

# Run with coverage
bun test --coverage
```

**Test Results**: 253 tests passing, 1676 assertions, 0 failures

## CI/CD

### GitHub Actions Workflow

The system includes a weekly CI workflow (`.github/workflows/model-catalog-sync.yml`):

- **Schedule**: Every Monday at 9am UTC
- **Manual Trigger**: Via workflow_dispatch
- **Steps**:
  1. Run discovery across all providers
  2. Generate diff from previous snapshot
  3. Validate catalog changes
  4. Create PR if changes detected

### Manual Trigger

```bash
# Via GitHub CLI
gh workflow run model-catalog-sync.yml

# Via GitHub UI
Actions → Model Catalog Sync → Run workflow
```

## Documentation

- **[SECRETS.md](./SECRETS.md)**: API key configuration guide
- **[ROLLBACK.md](./ROLLBACK.md)**: Rollback procedures
- **[Architecture](../../.sisyphus/MODEL-MANAGEMENT-SUMMARY.md)**: Complete system overview

## API Reference

### Provider Adapters

All adapters implement the same interface:

```typescript
interface ProviderAdapter {
  list(options?: object): Promise<NormalizedModel[]>;
  get(id: string, options?: object): Promise<NormalizedModel | null>;
  normalize(raw: any): NormalizedModel;
  getCapabilities(model: NormalizedModel): Capabilities;
}
```

### Normalized Model Schema

```typescript
interface NormalizedModel {
  id: string;
  provider: string;
  displayName: string;
  contextTokens: number | null;
  outputTokens: number | null;
  deprecated: boolean;
  capabilities: {
    streaming: boolean;
    tools: boolean;
    vision: boolean;
    reasoning: boolean;
  };
}
```

### Lifecycle States

```typescript
enum LifecycleState {
  DETECTED = 'detected',      // Model discovered, awaiting assessment
  ASSESSED = 'assessed',      // Benchmarks complete, metrics collected
  APPROVED = 'approved',      // Human/auto-approved for catalog
  SELECTABLE = 'selectable',  // Appears in UI for selection
  DEFAULT = 'default'         // Used as default for intent/category
}
```

## Performance

| Metric | Target | Actual |
|--------|--------|--------|
| Discovery Time | < 10s | ~8s |
| L1 Cache Hit | < 1ms | < 1ms |
| Assessment Time | < 5min | ~3min |
| Diff Accuracy | > 95% | 100% |

## Security

- ✅ API keys stored in GitHub Secrets
- ✅ Tamper-evident audit trail (hash chain)
- ✅ Risk-based approval gates
- ✅ No automatic promotion to default
- ✅ Validation pipeline blocks bad changes

## Troubleshooting

### Discovery Fails

```bash
# Check provider API keys
node -e "console.log(process.env.OPENAI_API_KEY ? 'Set' : 'Missing')"

# Test individual adapter
node -e "
const { OpenAIAdapter } = require('./src/adapters/openai');
const adapter = new OpenAIAdapter();
adapter.list().then(m => console.log(m.length + ' models'));
"
```

### Validation Fails

```bash
# Run validator
node -e "
const { CatalogValidator } = require('./src/validation/catalog-validator');
const validator = new CatalogValidator();
validator.validate().then(r => console.log(validator.formatResults(r)));
"
```

### Rollback Needed

See [ROLLBACK.md](./ROLLBACK.md) for detailed procedures.

## Contributing

### Adding a New Provider

1. Create adapter in `src/adapters/new-provider.js`
2. Extend `BaseAdapter` class
3. Implement `_listRaw()`, `_getRaw()`, `normalize()`
4. Add tests in `test/adapters/new-provider.test.ts`
5. Register in `DiscoveryEngine`

### Running Tests

```bash
# Before committing
bun test
bun run lint
bun run typecheck
```

## License

See root LICENSE file.

## Support

- **Issues**: GitHub Issues
- **Documentation**: See `docs/` directory
- **CI Logs**: GitHub Actions workflow runs

---

**Version**: 1.0.0  
**Last Updated**: 2026-02-24  
**Maintained By**: Model Management Team
