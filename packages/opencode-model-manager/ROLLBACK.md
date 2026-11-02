# Rollback System Guide

This document describes how to rollback model catalog changes in case of issues.

## Quick Rollback

If you need to rollback immediately:

```bash
# Rollback to last known good state
cd packages/opencode-model-manager
node scripts/rollback.js --to-last-good

# Rollback to specific timestamp
node scripts/rollback.js --to-timestamp "2026-02-24T00:00:00Z"

# Preview changes without applying
node scripts/rollback.js --to-last-good --dry-run
```

## When to Rollback

Rollback when:

- ✅ New models cause system instability
- ✅ Incorrect model metadata was deployed
- ✅ Provider API changes break integration
- ✅ Performance degradation after update
- ✅ Security vulnerability discovered

## Rollback Methods

### Method 1: Automated Rollback (Recommended)

Use the rollback script for automated, validated rollback:

```bash
cd packages/opencode-model-manager
node scripts/rollback.js --to-last-good
```

**Features**:
- Automatic validation after rollback
- Audit log entry created
- Snapshot comparison
- Safety checks

### Method 2: Git Revert

Revert the specific commit that introduced the issue:

```bash
# Find the commit
git log --oneline opencode-config/models/catalog-2026.json

# Revert it
git revert <commit-hash>

# Push
git push origin main
```

**Use when**:
- Automated rollback fails
- Need to preserve history
- Multiple files affected

### Method 3: Manual Restore

Manually restore from snapshot:

```bash
# List available snapshots
cd packages/opencode-model-manager
node -e "
const { SnapshotStore } = require('./src/snapshot/snapshot-store');
const store = new SnapshotStore();
store.getByTimeRange('openai', Date.now() - 86400000, Date.now())
  .then(snapshots => console.log(JSON.stringify(snapshots, null, 2)));
"

# Copy snapshot data to catalog
# Edit opencode-config/models/catalog-2026.json manually
```

**Use when**:
- Automated methods fail
- Need fine-grained control
- Partial rollback required

## Rollback Script Usage

### Basic Usage

```bash
# Rollback to last good state
node scripts/rollback.js --to-last-good

# Rollback to specific time
node scripts/rollback.js --to-timestamp "2026-02-24T00:00:00Z"

# Dry run (preview only)
node scripts/rollback.js --to-last-good --dry-run

# Verbose output
node scripts/rollback.js --to-last-good --verbose
```

### Options

| Option | Description | Example |
|--------|-------------|---------|
| `--to-last-good` | Rollback to last known good state | `--to-last-good` |
| `--to-timestamp` | Rollback to specific timestamp | `--to-timestamp "2026-02-24T00:00:00Z"` |
| `--dry-run` | Preview changes without applying | `--dry-run` |
| `--verbose` | Show detailed output | `--verbose` |
| `--force` | Skip confirmation prompts | `--force` |

## Validation After Rollback

After rollback, the system automatically:

1. ✅ Validates catalog structure
2. ✅ Checks for duplicates
3. ✅ Verifies required fields
4. ✅ Runs test suite
5. ✅ Creates audit log entry

### Manual Validation

If you need to validate manually:

```bash
# Validate catalog
cd packages/opencode-model-manager
node -e "
const { CatalogValidator } = require('./src/validation/catalog-validator');
const validator = new CatalogValidator();
validator.validate().then(result => {
  console.log(validator.formatResults(result));
  process.exit(result.valid ? 0 : 1);
});
"

# Run tests
bun test packages/opencode-model-manager/test/
```

## Rollback Scenarios

### Scenario 1: Bad Model Metadata

**Problem**: New model has incorrect context window

**Solution**:
```bash
# Rollback to before the bad update
node scripts/rollback.js --to-timestamp "2026-02-23T23:59:59Z"

# Verify
node scripts/validate-catalog.js
```

### Scenario 2: Provider API Change

**Problem**: Provider changed API format, breaking discovery

**Solution**:
```bash
# Rollback catalog
node scripts/rollback.js --to-last-good

# Fix adapter code
# Update provider adapter in src/adapters/

# Re-run discovery
node scripts/discover.js
```

### Scenario 3: Performance Degradation

**Problem**: System slow after model update

**Solution**:
```bash
# Rollback immediately
node scripts/rollback.js --to-last-good

# Investigate
# Check metrics, logs, profiling

# Fix and redeploy
```

## Audit Trail

All rollbacks are logged in the audit system:

```bash
# View rollback history
cd packages/opencode-model-manager
node -e "
const { AuditLogger } = require('./src/lifecycle/audit-logger');
const logger = new AuditLogger();
logger.getByTimeRange(Date.now() - 86400000, Date.now())
  .then(entries => {
    const rollbacks = entries.filter(e => e.reason.includes('rollback'));
    console.log(JSON.stringify(rollbacks, null, 2));
  });
"
```

## Recovery Time Objective (RTO)

Target rollback times:

| Method | RTO | Complexity |
|--------|-----|------------|
| Automated Script | < 5 minutes | Low |
| Git Revert | < 10 minutes | Medium |
| Manual Restore | < 30 minutes | High |

## Prevention

Prevent the need for rollbacks:

### Pre-Deployment

- ✅ Run validation pipeline
- ✅ Review PR changes carefully
- ✅ Test in staging environment
- ✅ Check risk assessment scores

### Post-Deployment

- ✅ Monitor metrics dashboard
- ✅ Watch for error rate spikes
- ✅ Check performance metrics
- ✅ Review audit logs

## Emergency Contacts

If rollback fails or issues persist:

1. **Check documentation**: This file and `TROUBLESHOOTING.md`
2. **Review logs**: `.sisyphus/logs/` and CI workflow logs
3. **Check audit trail**: Audit logger entries
4. **Escalate**: Contact system administrator

## Testing Rollback

Test rollback procedure regularly:

```bash
# 1. Create test snapshot
node scripts/create-test-snapshot.js

# 2. Make test change
# Edit catalog manually

# 3. Test rollback
node scripts/rollback.js --to-last-good --dry-run

# 4. Verify
node scripts/validate-catalog.js
```

## Rollback Checklist

Before rollback:

- [ ] Identify the issue and root cause
- [ ] Determine target rollback point
- [ ] Notify team of rollback
- [ ] Take current snapshot for reference

During rollback:

- [ ] Run rollback command
- [ ] Monitor output for errors
- [ ] Verify validation passes
- [ ] Check audit log entry created

After rollback:

- [ ] Test system functionality
- [ ] Monitor metrics for 1 hour
- [ ] Document incident
- [ ] Plan fix for root cause

---

**Last Updated**: 2026-02-24  
**Maintained By**: Model Management Team
