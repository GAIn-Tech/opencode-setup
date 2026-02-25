# Model Management Troubleshooting Guide

Common issues and solutions for the OpenCode Model Management System.

## Table of Contents

- [Discovery Failures](#discovery-failures)
- [Validation Errors](#validation-errors)
- [State Transition Errors](#state-transition-errors)
- [PR Creation Failures](#pr-creation-failures)
- [Cache Issues](#cache-issues)
- [Database Problems](#database-problems)
- [CI/CD Issues](#cicd-issues)
- [Performance Problems](#performance-problems)

---

## Discovery Failures

### Provider API Authentication Failure

**Symptoms:**
```
Error: 401 Unauthorized
Provider: openai
```

**Diagnosis:**
```bash
# Check if API key is set
echo $OPENAI_API_KEY

# Test API key directly
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Solutions:**
1. Verify API key is set in environment
2. Check key hasn't expired
3. Verify key has correct permissions
4. Rotate key if compromised

**Prevention:**
- Use GitHub Secrets for CI/CD
- Set up key rotation reminders
- Monitor for 401 errors in logs

---

### Provider Rate Limiting

**Symptoms:**
```
Error: 429 Too Many Requests
Provider: anthropic
```

**Diagnosis:**
```bash
# Check recent discovery frequency
node -e "
const { PipelineMetricsCollector } = require('./src/monitoring/metrics-collector');
const metrics = new PipelineMetricsCollector();
const rates = metrics.getDiscoveryRates(3600000); // Last hour
console.log(rates.anthropic);
"
```

**Solutions:**
1. Reduce discovery frequency in CI workflow
2. Implement exponential backoff (already built-in)
3. Use cache more aggressively
4. Contact provider for rate limit increase

**Prevention:**
- Schedule discoveries during off-peak hours
- Use cache with longer TTL
- Monitor rate limit headers

---

### Network Timeout

**Symptoms:**
```
Error: ETIMEDOUT
Provider: google
```

**Diagnosis:**
```bash
# Test network connectivity
curl -I https://generativelanguage.googleapis.com/v1beta/models

# Check timeout settings
node -e "
const { GoogleAdapter } = require('./src/adapters/google');
const adapter = new GoogleAdapter();
console.log('Timeout:', adapter.timeout);
"
```

**Solutions:**
1. Increase timeout in adapter config
2. Check network/firewall settings
3. Retry with exponential backoff
4. Use different network if possible

**Prevention:**
- Set reasonable timeouts (30s+)
- Monitor network latency
- Use circuit breaker (already implemented)

---

### Circuit Breaker Open

**Symptoms:**
```
Error: Circuit breaker is OPEN for provider: groq
```

**Diagnosis:**
```bash
# Check circuit breaker status
node -e "
const { CircuitBreaker } = require('./src/circuit-breaker');
const cb = new CircuitBreaker();
console.log('State:', cb.getState());
console.log('Failures:', cb.getFailureCount());
"
```

**Solutions:**
1. Wait for circuit breaker timeout (60s default)
2. Manually reset circuit breaker
3. Fix underlying provider issue
4. Check provider status page

**Prevention:**
- Monitor provider health
- Set appropriate failure thresholds
- Implement fallback strategies

---

## Validation Errors

### Schema Validation Failure

**Symptoms:**
```
Validation Error: Missing required field 'contextTokens'
Model: gpt-4-turbo
```

**Diagnosis:**
```bash
# Run validator with verbose output
node scripts/validate-models.mjs

# Check specific model
node -e "
const catalog = require('./opencode-config/models/catalog-2026.json');
const model = catalog.models['openai/gpt-4-turbo'];
console.log(JSON.stringify(model, null, 2));
"
```

**Solutions:**
1. Update model metadata in catalog
2. Re-run discovery to fetch latest data
3. Manually add missing fields
4. Update schema if field is optional

**Prevention:**
- Keep schema up to date
- Validate before committing
- Use automated validation in CI

---

### Duplicate Model Detection

**Symptoms:**
```
Validation Error: Duplicate model ID: gpt-4
Providers: openai, groq
```

**Diagnosis:**
```bash
# Find duplicates
node -e "
const catalog = require('./opencode-config/models/catalog-2026.json');
const ids = Object.keys(catalog.models || {});
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
console.log('Duplicates:', duplicates);
"
```

**Solutions:**
1. Use provider-prefixed IDs (e.g., `openai/gpt-4`)
2. Remove duplicate entries
3. Update normalization logic
4. Check provider adapter implementation

**Prevention:**
- Always use provider prefix
- Validate during discovery
- Check for duplicates in PR reviews

---

### Forbidden Pattern Detected

**Symptoms:**
```
Validation Error: Forbidden pattern detected: 'test-model'
```

**Diagnosis:**
```bash
# Check forbidden patterns
node -e "
const schema = require('./opencode-config/models/schema.json');
console.log('Forbidden patterns:', schema.forbiddenPatterns);
"
```

**Solutions:**
1. Remove test/development models
2. Update forbidden patterns if legitimate
3. Filter models during discovery
4. Contact provider about naming

**Prevention:**
- Filter test models in adapters
- Maintain forbidden pattern list
- Review new models before approval

---

## State Transition Errors

### Invalid Transition

**Symptoms:**
```
StateTransitionError: Invalid transition from 'detected' to 'selectable'
Model: gpt-4
```

**Diagnosis:**
```bash
# Check current state
node -e "
const { StateMachine } = require('./src/lifecycle/state-machine');
const sm = new StateMachine();
sm.getState('gpt-4').then(state => console.log('Current state:', state));
"

# Check valid transitions
node -e "
const { StateMachine } = require('./src/lifecycle/state-machine');
const sm = new StateMachine();
console.log('Valid transitions:', sm.getValidTransitions('detected'));
"
```

**Solutions:**
1. Follow correct transition path:
   - `detected` → `assessed` → `approved` → `selectable`
2. Check state machine configuration
3. Review audit log for state history
4. Manually fix state if corrupted

**Prevention:**
- Use state machine API only
- Don't modify database directly
- Validate transitions before executing

---

### Missing Assessment Data

**Symptoms:**
```
StateTransitionError: Cannot transition to 'approved' without assessment
Model: claude-3-opus
```

**Diagnosis:**
```bash
# Check assessment status
node -e "
const { ModelAssessor } = require('./src/assessment/model-assessor');
const assessor = new ModelAssessor();
assessor.getAssessment('claude-3-opus').then(result => {
  console.log('Assessment:', result ? 'exists' : 'missing');
});
"
```

**Solutions:**
1. Run assessment before approval
2. Use auto-assessment in discovery pipeline
3. Manually trigger assessment
4. Skip assessment for trusted providers (configure)

**Prevention:**
- Always assess before approval
- Automate assessment in pipeline
- Monitor assessment completion

---

## PR Creation Failures

### GitHub Authentication Failure

**Symptoms:**
```
Error: Bad credentials
GitHub API: 401
```

**Diagnosis:**
```bash
# Test GitHub token
gh auth status

# Test API access
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/user
```

**Solutions:**
1. Regenerate GitHub token
2. Update token in GitHub Secrets
3. Verify token has `repo` scope
4. Check token expiration

**Prevention:**
- Use fine-grained tokens
- Set expiration reminders
- Monitor for 401 errors

---

### Branch Already Exists

**Symptoms:**
```
Error: Branch 'auto/model-update-20260224' already exists
```

**Diagnosis:**
```bash
# List auto-generated branches
git branch -r | grep auto/model-update

# Check if PR exists
gh pr list --head auto/model-update-20260224
```

**Solutions:**
1. Delete old branch if PR merged
2. Use unique branch names (timestamp)
3. Clean up stale branches
4. Merge or close existing PR

**Prevention:**
- Auto-delete branches after merge
- Use millisecond timestamps
- Clean up weekly

---

### Merge Conflict

**Symptoms:**
```
Error: Merge conflict in catalog-2026.json
```

**Diagnosis:**
```bash
# Check for conflicts
git diff main...auto/model-update-20260224

# View conflicting changes
git show auto/model-update-20260224:opencode-config/models/catalog-2026.json
```

**Solutions:**
1. Rebase branch on latest main
2. Resolve conflicts manually
3. Re-run discovery on latest main
4. Use 3-way merge strategy

**Prevention:**
- Keep main branch up to date
- Merge PRs quickly
- Use atomic updates

---

## Cache Issues

### Cache Corruption

**Symptoms:**
```
Error: Invalid JSON in cache file
Cache key: provider:openai
```

**Diagnosis:**
```bash
# Check cache files
ls -lh ./.cache/

# Validate JSON
node -e "
const fs = require('fs');
const files = fs.readdirSync('./.cache');
files.forEach(f => {
  try {
    JSON.parse(fs.readFileSync(\`./.cache/\${f}\`, 'utf8'));
    console.log(\`✓ \${f}\`);
  } catch (err) {
    console.log(\`✗ \${f}: \${err.message}\`);
  }
});
"
```

**Solutions:**
1. Delete corrupted cache files
2. Clear entire cache
3. Re-run discovery
4. Check disk space

**Prevention:**
- Use atomic writes
- Validate before caching
- Monitor disk space

---

### Cache Miss Rate High

**Symptoms:**
```
Cache L1 hit rate: 15%
Cache L2 hit rate: 20%
```

**Diagnosis:**
```bash
# Check cache metrics
curl http://localhost:3000/api/monitoring?section=cache

# Check TTL settings
node -e "
const { CacheLayer } = require('./src/cache/cache-layer');
const cache = new CacheLayer();
console.log('L1 TTL:', cache.l1Ttl);
console.log('L2 TTL:', cache.l2Ttl);
"
```

**Solutions:**
1. Increase cache TTL
2. Warm cache on startup
3. Reduce discovery frequency
4. Check cache invalidation logic

**Prevention:**
- Set appropriate TTLs
- Monitor hit rates
- Use stale-while-revalidate

---

## Database Problems

### Database Locked

**Symptoms:**
```
Error: SQLITE_BUSY: database is locked
Database: audit.db
```

**Diagnosis:**
```bash
# Check for open connections
lsof audit.db

# Check database integrity
sqlite3 audit.db "PRAGMA integrity_check;"
```

**Solutions:**
1. Close all connections
2. Use WAL mode (already enabled)
3. Increase busy timeout
4. Restart process

**Prevention:**
- Use connection pooling
- Close connections properly
- Enable WAL mode

---

### Database Corruption

**Symptoms:**
```
Error: database disk image is malformed
Database: lifecycle.db
```

**Diagnosis:**
```bash
# Check integrity
sqlite3 lifecycle.db "PRAGMA integrity_check;"

# Dump and restore
sqlite3 lifecycle.db ".dump" > backup.sql
```

**Solutions:**
1. Restore from backup
2. Rebuild from audit log
3. Re-run discovery
4. Check disk health

**Prevention:**
- Regular backups
- Use WAL mode
- Monitor disk health
- Graceful shutdowns

---

## CI/CD Issues

### Workflow Fails to Start

**Symptoms:**
```
Workflow: model-catalog-sync.yml
Status: Skipped
```

**Diagnosis:**
```bash
# Check workflow status
gh workflow view model-catalog-sync.yml

# Check if disabled
gh workflow list
```

**Solutions:**
1. Enable workflow: `gh workflow enable model-catalog-sync.yml`
2. Check workflow syntax
3. Verify triggers are correct
4. Check repository settings

**Prevention:**
- Don't disable workflows manually
- Use workflow_dispatch for testing
- Monitor workflow runs

---

### Secrets Not Available

**Symptoms:**
```
Error: OPENAI_API_KEY is not set
Environment: GitHub Actions
```

**Diagnosis:**
```bash
# List secrets
gh secret list

# Check workflow permissions
gh api repos/:owner/:repo/actions/permissions
```

**Solutions:**
1. Add missing secrets
2. Update secret values
3. Check secret names match
4. Verify repository access

**Prevention:**
- Document required secrets
- Use secret scanning
- Rotate secrets regularly

---

## Performance Problems

### Discovery Takes Too Long

**Symptoms:**
```
Discovery duration: 45s
Target: < 10s
```

**Diagnosis:**
```bash
# Check per-provider timing
curl http://localhost:3000/api/monitoring?section=discovery

# Profile discovery
node --prof -e "
const { DiscoveryEngine } = require('./src/discovery/discovery-engine');
const engine = new DiscoveryEngine();
engine.discover();
"
```

**Solutions:**
1. Enable parallel execution (already enabled)
2. Increase timeouts
3. Use cache more aggressively
4. Reduce number of providers

**Prevention:**
- Monitor discovery time
- Optimize slow providers
- Use circuit breakers

---

### High Memory Usage

**Symptoms:**
```
Memory usage: 2GB
Process: discovery
```

**Diagnosis:**
```bash
# Check memory usage
node -e "
console.log('Memory:', process.memoryUsage());
"

# Profile memory
node --inspect -e "
const { DiscoveryEngine } = require('./src/discovery/discovery-engine');
const engine = new DiscoveryEngine();
engine.discover();
"
```

**Solutions:**
1. Reduce cache size
2. Clean up old snapshots
3. Stream large responses
4. Increase Node.js heap size

**Prevention:**
- Monitor memory usage
- Set memory limits
- Clean up regularly

---

## Getting Help

### Collect Diagnostic Information

```bash
# System info
node --version
bun --version
sqlite3 --version

# Package info
cat packages/opencode-model-manager/package.json | grep version

# Recent errors
tail -100 discovery.log

# Monitoring snapshot
curl http://localhost:3000/api/monitoring > diagnostics.json

# Audit trail
node -e "
const { AuditLogger } = require('./src/lifecycle/audit-logger');
const logger = new AuditLogger();
logger.getRecent(50).then(entries => {
  console.log(JSON.stringify(entries, null, 2));
});
" > audit-recent.json
```

### Report an Issue

Include:
1. Error message and stack trace
2. Steps to reproduce
3. Diagnostic information (above)
4. Expected vs actual behavior
5. Environment details

### Emergency Contacts

- **GitHub Issues**: https://github.com/your-org/your-repo/issues
- **Slack**: #model-management
- **On-call**: See PagerDuty rotation

---

## See Also

- [Architecture](./ARCHITECTURE.md) - System design
- [API Reference](./API-REFERENCE.md) - Detailed API docs
- [Operations Guide](./OPERATIONS.md) - Operational procedures
- [README](../../packages/opencode-model-manager/README.md) - Quick start
