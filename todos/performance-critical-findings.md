# Performance Critical Findings (P1)

**Created**: Sun Mar 22 2026  
**Agent**: Performance Oracle (bg_9ffbc8ab) + Ultra-Thinking Analysis  
**Severity**: P1 (Critical - blocks merge)

## 1. ContextBridge Unbounded Audit Trail Memory Leak
**File**: `packages/opencode-integration-layer/src/context-bridge.js`

**Issue**: `_auditTrail` array grows indefinitely without caps in long-running processes.

**Impact**: Memory leak that can lead to OOM crashes under load.

**Code References**:
- `evaluateAndEnforce()` allocates + logs on every call
- `_generateOperationId()` does `sha256` per veto (avoidable on hot path)

**Fix**:
```javascript
// Add ring buffer cap
this._auditTrail = [];
this._maxAuditTrailEntries = 1000; // Configurable
```

## 2. ModelRouter Spread Operator Stack Overflow Risk
**File**: `packages/opencode-model-router-x/src/index.js`

**Issue**: `_computePolicyScoreAdjustments()` uses `Math.min(...qualityValues)` / `Math.max(...qualityValues)` with spread on potentially large candidate lists.

**Impact**: "too many arguments" runtime exception under load, tail-latency spikes.

**Code References**:
- `_computePolicyScoreAdjustments()` lines with spread operators
- Candidate lists can grow to 10k+ entries

**Fix**:
```javascript
// Replace spread with loop
let minQuality = Infinity;
for (const q of qualityValues) {
  if (q < minQuality) minQuality = q;
}
```

## 3. Provider Pressure Scanning O(totalModels) Overhead
**File**: `packages/opencode-model-router-x/src/index.js`

**Issue**: `_ingestProviderPressureSignals()` calls `_selectBudgetPressureProviders()` which scans ALL models, invoked from `_filterByHealth()` on routing hot path.

**Impact**: O(totalModels) overhead per routing decision, scalability bottleneck.

**Fix**:
- Precompute budget-pressure provider sets
- Cache results with TTL/LRU
- Move to background periodic updates

## 4. Meta-KB Nested Loop CPU Explosion
**File**: `packages/opencode-integration-layer/src/index.js`

**Issue**: `_computeMetaKBSignalForSkill()` and `_applyMetaKBSkillPromotionScores()` devolve into nested loops over `metaKBIndex.anti_patterns` and `metaKBIndex.by_affected_path`.

**Impact**: Measurable CPU hit and tail-latency amplifier with large `opencode-config/meta-knowledge-index.json`.

**Fix**:
- Index by file path prefixes
- Cache penalty results per normalized context (TTL/LRU)
- Implement bloom filters for anti-pattern scanning

## 5. Metrics Collector Unconditional Debug Logs
**File**: `packages/opencode-model-manager/src/monitoring/metrics-collector.js`

**Issue**: Multiple unconditional debug logs (`getDiscoveryRates()`, `recordCompression()`, `getCompressionStats()`, `getPackageExecutionStats()`, `_createSqliteClient()`).

**Impact**: Console I/O dominates CPU under frequent calls/polling, major performance regression.

**Fix**:
```javascript
// Gate behind debug flag
if (process.env.DEBUG_METRICS) {
  console.debug('...');
}
```

## 6. TelemetryQualityGate Synchronous Disk I/O
**File**: `packages/opencode-model-manager/src/monitoring/telemetry-quality.js`

**Issue**: If enabled, `validate()` performs `fs.appendFileSync()` for every event → synchronous disk I/O on main thread.

**Impact**: High tail latency under load, blocking event loop.

**Fix**:
- Use buffered async writes
- Batch telemetry events
- Make file writes opt-in with sampling

## Priority Order
1. ContextBridge memory leak (highest risk - OOM)
2. ModelRouter spread exception (runtime crash)
3. Telemetry synchronous I/O (blocking event loop)
4. Metrics debug logs (CPU waste)
5. Meta-KB nested loops (CPU waste)
6. Provider pressure scanning (scalability)

**Estimated Fix Time**: 1-2 days (Medium effort)