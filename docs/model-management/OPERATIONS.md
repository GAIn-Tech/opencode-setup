# Model Management Operations Guide

Operational procedures for managing the OpenCode model catalog.

## Table of Contents

- [Manual Discovery](#manual-discovery)
- [Model Approval](#model-approval)
- [Model Rejection](#model-rejection)
- [Catalog Rollback](#catalog-rollback)
- [Health Checks](#health-checks)
- [Monitoring](#monitoring)
- [CI/CD Operations](#cicd-operations)
- [Emergency Procedures](#emergency-procedures)

---

## Manual Discovery

### Run Discovery Locally

```bash
# Navigate to model-manager package
cd packages/opencode-model-manager

# Run discovery
node -e "
const { DiscoveryEngine } = require('./src/discovery/discovery-engine');
const engine = new DiscoveryEngine();
engine.discover().then(result => {
  console.log('Models discovered:', result.models.length);
  console.log('Errors:', result.errors);
});
"
```

### Run Discovery for Single Provider

```bash
node -e "
const { OpenAIAdapter } = require('./src/adapters/openai');
const adapter = new OpenAIAdapter();
adapter.list().then(models => {
  console.log('OpenAI models:', models.length);
  models.forEach(m => console.log('-', m.id));
});
"
```

### Save Discovery Results

```bash
node -e "
const { DiscoveryEngine } = require('./src/discovery/discovery-engine');
const { SnapshotStore } = require('./src/snapshot/snapshot-store');
const engine = new DiscoveryEngine();
const store = new SnapshotStore();

engine.discover().then(async result => {
  for (const [provider, data] of Object.entries(result.providers)) {
    if (data.success) {
      const models = result.models.filter(m => m.provider === provider);
      await store.save(provider, models, data);
      console.log(\`Saved snapshot for \${provider}: \${models.length} models\`);
    }
  }
});
"
```

---

## Model Approval

### Approve Model Manually

```bash
node -e "
const { StateMachine } = require('./src/lifecycle/state-machine');
const sm = new StateMachine();

sm.transition('gpt-4', 'approved', {
  actor: 'admin@example.com',
  reason: 'Manual approval after review',
  metadata: { reviewedBy: 'John Doe', reviewDate: new Date().toISOString() }
}).then(() => {
  console.log('Model approved');
});
"
```

### Approve Multiple Models

```bash
node -e "
const { StateMachine } = require('./src/lifecycle/state-machine');
const sm = new StateMachine();

const models = ['gpt-4', 'claude-3-opus', 'gemini-pro'];
const context = {
  actor: 'admin@example.com',
  reason: 'Batch approval',
  metadata: { batch: true }
};

Promise.all(models.map(id => sm.transition(id, 'approved', context)))
  .then(() => console.log('All models approved'));
"
```

### Make Model Selectable

```bash
node -e "
const { StateMachine } = require('./src/lifecycle/state-machine');
const sm = new StateMachine();

sm.transition('gpt-4', 'selectable', {
  actor: 'admin@example.com',
  reason: 'Adding to catalog',
  metadata: { catalogVersion: '2026' }
}).then(() => {
  console.log('Model is now selectable');
});
"
```

---

## Model Rejection

### Reject Model

```bash
node -e "
const { StateMachine } = require('./src/lifecycle/state-machine');
const sm = new StateMachine();

// Transition back to previous state
sm.transition('gpt-4', 'assessed', {
  actor: 'admin@example.com',
  reason: 'Approval revoked due to performance issues',
  metadata: { issue: 'High latency in production' }
}).then(() => {
  console.log('Model approval revoked');
});
"
```

### Remove from Catalog

```bash
node -e "
const { StateMachine } = require('./src/lifecycle/state-machine');
const sm = new StateMachine();

// Transition from selectable back to approved
sm.transition('gpt-4', 'approved', {
  actor: 'admin@example.com',
  reason: 'Removing from catalog',
  metadata: { reason: 'Deprecated by provider' }
}).then(() => {
  console.log('Model removed from catalog');
});
"
```

---

## Catalog Rollback

### Rollback to Last Good State

```bash
# Preview rollback
node scripts/model-rollback.mjs --to-last-good --dry-run

# Execute rollback
node scripts/model-rollback.mjs --to-last-good
```

### Rollback to Specific Timestamp

```bash
# Rollback to specific time
node scripts/model-rollback.mjs --to-timestamp 2026-02-24T10:00:00Z

# Preview first
node scripts/model-rollback.mjs --to-timestamp 2026-02-24T10:00:00Z --dry-run
```

### Verify Rollback

```bash
# Run validation after rollback
node scripts/validate-models.mjs

# Check catalog version
node -e "
const catalog = require('./opencode-config/models/catalog-2026.json');
console.log('Catalog version:', catalog.version);
console.log('Last updated:', catalog.lastUpdated);
console.log('Model count:', Object.keys(catalog.models || {}).length);
"
```

---

## Health Checks

### Check Provider Connectivity

```bash
# Test all providers
node -e "
const providers = ['openai', 'anthropic', 'google', 'groq', 'cerebras', 'nvidia'];
const adapters = {
  openai: require('./src/adapters/openai').OpenAIAdapter,
  anthropic: require('./src/adapters/anthropic').AnthropicAdapter,
  google: require('./src/adapters/google').GoogleAdapter,
  groq: require('./src/adapters/groq').GroqAdapter,
  cerebras: require('./src/adapters/cerebras').CerebrasAdapter,
  nvidia: require('./src/adapters/nvidia').NVIDIAAdapter
};

Promise.all(providers.map(async (name) => {
  try {
    const Adapter = adapters[name];
    const adapter = new Adapter();
    const models = await adapter.list();
    console.log(\`✓ \${name}: \${models.length} models\`);
  } catch (err) {
    console.log(\`✗ \${name}: \${err.message}\`);
  }
}));
"
```

### Check Cache Status

```bash
node -e "
const { CacheLayer } = require('./src/cache/cache-layer');
const cache = new CacheLayer();

// Check L1 cache
console.log('L1 cache size:', cache._l1Cache?.size || 0);

// Check L2 cache
const fs = require('fs');
const l2Path = './.cache';
if (fs.existsSync(l2Path)) {
  const files = fs.readdirSync(l2Path);
  console.log('L2 cache files:', files.length);
} else {
  console.log('L2 cache: empty');
}
"
```

### Check Database Status

```bash
# Check lifecycle database
node -e "
const Database = require('better-sqlite3');
const db = new Database('./lifecycle.db', { readonly: true });
const count = db.prepare('SELECT COUNT(*) as count FROM lifecycle').get();
console.log('Lifecycle records:', count.count);
db.close();
"

# Check audit database
node -e "
const Database = require('better-sqlite3');
const db = new Database('./audit.db', { readonly: true });
const count = db.prepare('SELECT COUNT(*) as count FROM audit_log').get();
console.log('Audit records:', count.count);
db.close();
"
```

---

## Monitoring

### Query Monitoring Metrics

```bash
# Get all metrics (JSON)
curl http://localhost:3000/api/monitoring

# Get Prometheus format
curl http://localhost:3000/api/monitoring?format=prometheus

# Get specific section
curl http://localhost:3000/api/monitoring?section=discovery

# Get with custom time window (1 hour)
curl http://localhost:3000/api/monitoring?window=3600000
```

### Check Active Alerts

```bash
curl http://localhost:3000/api/monitoring?section=alerts | jq '.alerts.active'
```

### View Discovery Rates

```bash
node -e "
const { PipelineMetricsCollector } = require('./src/monitoring/metrics-collector');
const metrics = new PipelineMetricsCollector();

const rates = metrics.getDiscoveryRates();
Object.entries(rates).forEach(([provider, data]) => {
  console.log(\`\${provider}: \${data.rate * 100}% success (\${data.successes}/\${data.total})\`);
});
"
```

### View Cache Performance

```bash
node -e "
const { PipelineMetricsCollector } = require('./src/monitoring/metrics-collector');
const metrics = new PipelineMetricsCollector();

const cache = metrics.getCacheMetrics();
console.log('L1 hit rate:', (cache.L1.rate * 100).toFixed(1) + '%');
console.log('L2 hit rate:', (cache.L2.rate * 100).toFixed(1) + '%');
"
```

---

## CI/CD Operations

### Trigger Manual Discovery

```bash
# Via GitHub CLI
gh workflow run model-catalog-sync.yml

# Via GitHub UI
# Navigate to: Actions → Model Catalog Sync → Run workflow
```

### Check Workflow Status

```bash
# List recent workflow runs
gh run list --workflow=model-catalog-sync.yml --limit 5

# View specific run
gh run view <run-id>

# View logs
gh run view <run-id> --log
```

### Review Auto-Generated PRs

```bash
# List PRs created by automation
gh pr list --author "github-actions[bot]" --label "auto-model-update"

# View specific PR
gh pr view <pr-number>

# Approve and merge
gh pr review <pr-number> --approve
gh pr merge <pr-number> --squash
```

---

## Emergency Procedures

### Disable Automated Discovery

```bash
# Disable GitHub Actions workflow
gh workflow disable model-catalog-sync.yml

# Or rename workflow file
mv .github/workflows/model-catalog-sync.yml .github/workflows-disabled/
```

### Emergency Rollback

```bash
# 1. Rollback catalog
node scripts/model-rollback.mjs --to-last-good

# 2. Verify
node scripts/validate-models.mjs

# 3. Commit if valid
git add opencode-config/models/catalog-2026.json
git commit -m "emergency: rollback catalog to last good state"
git push
```

### Clear All Caches

```bash
# Clear L1 (in-memory) - restart process
# Clear L2 (persistent)
rm -rf ./.cache

# Clear snapshots (use with caution!)
rm -rf ./.snapshots

# Rebuild from scratch
node -e "
const { DiscoveryEngine } = require('./src/discovery/discovery-engine');
const engine = new DiscoveryEngine();
engine.discover().then(() => console.log('Discovery complete'));
"
```

### Reset Lifecycle State

```bash
# WARNING: This clears all lifecycle data
rm ./lifecycle.db

# Reinitialize
node -e "
const { StateMachine } = require('./src/lifecycle/state-machine');
const sm = new StateMachine();
console.log('Lifecycle database reinitialized');
"
```

### Suppress Alerts

```bash
node -e "
const { AlertManager } = require('./src/monitoring/alert-manager');
const am = new AlertManager();

// Suppress specific alert type
am.suppress('provider_failure');
am.suppress('stale_catalog');

console.log('Alerts suppressed');
"
```

---

## Routine Maintenance

### Weekly Tasks

1. **Review Auto-Generated PRs**
   ```bash
   gh pr list --label "auto-model-update"
   ```

2. **Check Provider Health**
   ```bash
   curl http://localhost:3000/api/monitoring?section=discovery
   ```

3. **Review Audit Log**
   ```bash
   node -e "
   const { AuditLogger } = require('./src/lifecycle/audit-logger');
   const logger = new AuditLogger();
   logger.getRecent(50).then(entries => {
     entries.forEach(e => console.log(\`\${e.timestamp}: \${e.modelId} \${e.fromState}→\${e.toState}\`));
   });
   "
   ```

### Monthly Tasks

1. **Clean Old Snapshots**
   ```bash
   # Snapshots older than 30 days are auto-cleaned
   # Manual cleanup if needed:
   node -e "
   const { SnapshotStore } = require('./src/snapshot/snapshot-store');
   const store = new SnapshotStore();
   store.cleanup().then(deleted => console.log('Deleted snapshots:', deleted));
   "
   ```

2. **Verify Audit Chain**
   ```bash
   node -e "
   const { AuditLogger } = require('./src/lifecycle/audit-logger');
   const logger = new AuditLogger();
   logger.verifyChain().then(result => {
     console.log('Chain valid:', result.valid);
     if (!result.valid) console.error('Broken at:', result.brokenAt);
   });
   "
   ```

3. **Review Metrics Trends**
   ```bash
   curl http://localhost:3000/api/monitoring?window=2592000000 > metrics-monthly.json
   ```

---

## Best Practices

### Before Making Changes

1. Always run `--dry-run` first
2. Check current state with health checks
3. Review recent audit log
4. Ensure backups exist

### After Making Changes

1. Run validation: `node scripts/validate-models.mjs`
2. Check monitoring for errors
3. Review audit log for confirmation
4. Test in staging before production

### Security

1. Never commit API keys
2. Rotate keys quarterly
3. Review audit log for unauthorized changes
4. Use GitHub Secrets for CI/CD

### Performance

1. Monitor cache hit rates (target > 80%)
2. Keep discovery time < 10s
3. Review provider latency trends
4. Clean old data regularly

---

## See Also

- [Architecture](./ARCHITECTURE.md) - System design
- [API Reference](./API-REFERENCE.md) - Detailed API docs
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues
- [README](../../packages/opencode-model-manager/README.md) - Quick start
