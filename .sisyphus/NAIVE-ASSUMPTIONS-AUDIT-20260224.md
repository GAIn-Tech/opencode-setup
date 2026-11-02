# Naive Assumptions Audit — OpenCode Setup (2026-02-24)

## Executive Summary

Found **10 critical naive assumptions** that can cause data loss, security issues, and system failures:

1. **Dual Database Location Mismatch** (Score: 25) — model-manager uses ./lifecycle.db, dashboard uses ~/.opencode/model-manager/lifecycle.db
2. **Auth Key Missing Validation** (Score: 23) — process.env[key] not validated, discovery silently fails
3. **Snapshot Load Silent Failure** (Score: 22) — corrupted snapshots.json becomes empty array, no detection
4. **Learning Gate Governance Bypass** (Score: 21) — manual file edits bypass learning updates
5. **Weekly Sync Validation Timeout Deadlock** (Score: 20) — no outer timeout, CI can hang indefinitely
6. **Config Fragmentation No Atomic Sync** (Score: 19) — 6 config files read independently, no coordination
7. **Dashboard-Model-Manager Deep Coupling** (Score: 18) — internal imports, breaking changes undetected
8. **Cross-Process Race: State + Audit Split** (Score: 17) — two separate DB writes, audit trail can be incomplete
9. **Auto-Approval Config File Missing Check** (Score: 16) — readFileSync without existence check
10. **Audit Logger No Write Verification** (Score: 15) — SQLite COMMIT doesn't guarantee persistence

## Critical Issues (Score ≥ 20)

### 1. Dual Database Location Mismatch (Score: 25)

**Files**:
- `packages/opencode-model-manager/src/lifecycle/state-machine.js:6`
- `packages/opencode-dashboard/src/app/api/models/lifecycle/route.ts:11`

**Problem**: 
- state-machine.js defaults to `./lifecycle.db` (relative to package root)
- Dashboard hardcodes `~/.opencode/model-manager/lifecycle.db`
- When model-manager runs in scripts/ context, creates DB in wrong location
- Dashboard reads stale/missing data

**Impact**: Dashboard shows no model lifecycle data, rollback script reads wrong DB, audit logs split

**Fix**:
1. Update state-machine.js: `path.join(os.homedir(), '.opencode', 'model-manager', 'lifecycle.db')`
2. Update audit-logger.js: same pattern
3. Update snapshot-store.js: same pattern
4. Add env var override: `OPENCODE_MODEL_MANAGER_DB_PATH`

---

### 2. Auth Key Missing Validation (Score: 23)

**File**: `packages/opencode-model-manager/src/adapters/base-adapter.js:459`

**Problem**:
```javascript
const raw = process.env[this.config.envKey];
// No validation that raw exists or is non-empty
```

**Impact**: Discovery silently skips providers with missing keys, catalog becomes stale

**Fix**:
1. Validate envKey exists and is non-empty before requests
2. Throw AdapterError with code 'MISSING_AUTH' if missing
3. Log which provider/key is missing
4. Add fallback to keyRotator if configured

---

### 3. Snapshot Load Silent Failure (Score: 22)

**File**: `packages/opencode-model-manager/src/snapshot/snapshot-store.js:133-149`

**Problem**:
```javascript
async _loadSnapshots() {
  try {
    const raw = await fs.readFile(this.storageFilePath, 'utf8');
    const parsed = JSON.parse(raw);
  } catch (error) {
    this.snapshots = [];  // Silent fallback!
  }
}
```

**Impact**: Corrupted snapshots.json becomes empty array, diff engine produces wrong diffs, false auto-approvals

**Fix**:
1. Add integrity check: hash snapshots.json on load
2. If hash mismatch, move to `.rollback-backups/snapshots-corrupted-<timestamp>.json`
3. Log error with severity CRITICAL
4. Emit event 'snapshot:corrupted' for monitoring

---

### 4. Learning Gate Governance Bypass (Score: 21)

**File**: `scripts/learning-gate.mjs:34-57`

**Problem**: Only runs on git changes (--staged, --base), manual file edits bypass learning updates

**Impact**: Governed files modified without audit trail, learning updates not created

**Fix**:
1. Add pre-commit hook that runs learning-gate unconditionally
2. Add file watcher for manual edits to governed paths
3. Require learning update file before allowing commit

---

### 5. Weekly Sync Validation Timeout Deadlock (Score: 20)

**File**: `scripts/weekly-model-sync.mjs:53`

**Problem**: No timeout wrapper around validate-models.mjs, CI can deadlock indefinitely

**Impact**: CI pipeline hangs every week, model discovery blocked

**Fix**:
1. Wrap with timeout: `timeout 10m node scripts/validate-models.mjs`
2. Add timeout to runStep function
3. Add health check monitoring CI job duration

---

## High Priority Issues (Score 15-19)

### 6. Config Fragmentation No Atomic Sync (Score: 19)
- Reads 6 files independently with no atomic sync
- Fix: Create atomic config snapshot, all readers use snapshot

### 7. Dashboard-Model-Manager Deep Coupling (Score: 18)
- Direct internal imports, breaking changes undetected
- Fix: Add package.json exports, update imports, add integration tests

### 8. Cross-Process Race: State + Audit Split (Score: 17)
- Two separate DB writes, audit trail can be incomplete
- Fix: Wrap in single transaction or use 2-phase commit

### 9. Auto-Approval Config File Missing Check (Score: 16)
- readFileSync without existence check
- Fix: Check file existence, fallback to DEFAULT_CONFIG

### 10. Audit Logger No Write Verification (Score: 15)
- SQLite COMMIT doesn't guarantee persistence
- Fix: Verify entry written after COMMIT, add fsync

---

## Remediation Priority

**Immediate (This Week)**:
1. Fix database path mismatch — establish ~/.opencode/model-manager/ as single source
2. Add auth key validation in base-adapter.js
3. Implement snapshot integrity check

**High Priority (Next 2 Weeks)**:
1. Add pre-commit hook for learning-gate
2. Wrap validate-models.mjs with timeout
3. Implement atomic config snapshot

**Medium Priority (Next Month)**:
1. Add package exports to model-manager
2. Implement cross-process transaction coordination
3. Add monitoring for config coherence

---

## Evidence Files

- Config fragmentation: `scripts/validate-config-coherence.mjs:63-65`
- Dashboard coupling: `packages/opencode-dashboard/src/app/api/models/lifecycle/route.ts:2`
- Learning gate bypass: `scripts/learning-gate.mjs:34-57`
- Timeout deadlock: `scripts/weekly-model-sync.mjs:53-55`
- Database mismatch: state-machine.js:6 vs route.ts:11
- Snapshot failure: snapshot-store.js:133-149
- Auth validation: base-adapter.js:459
- Config missing check: auto-approval-rules.js:403
- Write verification: audit-logger.js:95-96
- Race condition: transition/route.ts:44-91

