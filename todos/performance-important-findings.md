# Performance Important Findings (P2)

**Created**: Sun Mar 22 2026  
**Agent**: Performance Oracle (bg_9ffbc8ab) + Ultra-Thinking Analysis  
**Severity**: P2 (Important - should fix)

## 1. Metrics Collector Unbounded Event Arrays
**File**: `packages/opencode-model-manager/src/monitoring/metrics-collector.js`

**Issue**: `recordPackageExecution()` and `recordPolicyDecision()` don't enforce `_maxEvents` and store `{ ...details }` (potentially large objects) per event.

**Impact**: Memory inflation between cleanup ticks in high-throughput sessions.

**Code References**:
- Arrays: `_packageExecutionEvents`, `_policyDecisionEvents`
- Cleanup is time-based only

**Fix**:
```javascript
// Add hard caps
if (this._packageExecutionEvents.length >= this._maxEvents) {
  this._packageExecutionEvents.shift();
}
```

## 2. SecurityVeto Crypto Overhead & Memory Leak
**File**: `packages/opencode-validator/src/security-veto.js`

**Issue**: `evaluate()` does `JSON.stringify(operation)` + `sha256` per call and keeps `activeVetoes` without expiry strategy.

**Impact**: Increased CPU per operation, potential memory leak if wired into frequent operations.

**Code References**:
- Line 358-363: `generateOperationId()` with crypto SHA256
- Line 89-95: `activeVetoes.set()` without cleanup

**Fix**:
- Cache operation ID generation
- Add TTL expiry to `activeVetoes`
- Consider sampling for high-frequency operations

## 3. Meta-KB Penalty Extraction Without Caching
**File**: `packages/opencode-model-router-x/src/index.js`

**Issue**: `_extractMetaKBPenalties()` tokenizes context and scans `anti_patterns` without caching.

**Impact**: Per-route CPU proportional to Meta-KB size, repeated work for similar contexts.

**Fix**:
```javascript
// Cache penalties by normalized context
const cacheKey = `${normalizedContext}_${modelId}`;
if (this._penaltyCache.has(cacheKey)) {
  return this._penaltyCache.get(cacheKey);
}
```

## 4. EnhancedSandbox Resource Monitoring Overhead
**File**: `packages/opencode-crash-guard/src/enhanced-sandbox.js`

**Issue**: ESM imports and intensive resource monitoring with policy checks that could be misinterpreted as violations.

**Impact**: Heavy if enabled for all operations, policy misinterpretation leads to false positives.

**Fix**:
- Make sandbox opt-in with explicit enablement
- Optimize policy evaluation with early returns
- Add sampling for non-critical operations

## 5. Integration Layer Meta-KB Loading Cost
**File**: `packages/opencode-integration-layer/src/index.js`

**Issue**: Large `opencode-config/meta-knowledge-index.json` (14k lines) parsed on load, potentially at runtime.

**Impact**: Startup latency, memory overhead for large JSON structures.

**Fix**:
- Lazy load meta-KB index
- Implement incremental parsing
- Consider binary format for production

## 6. Dashboard Route Performance Improvements
**File**: `packages/opencode-dashboard/src/app/api/meta-kb/route.ts`

**Positive Change**: Removed background `exec(...)` drift checks, now uses directory scan + `statSync`.

**Impact**: Reduces worst-case seconds latency to milliseconds.

**Recommendation**: Apply similar optimization pattern to other dashboard routes.

## Priority Order
1. Metrics Collector unbounded arrays (memory risk)
2. SecurityVeto crypto overhead (CPU waste)
3. Meta-KB penalty caching (CPU optimization)
4. EnhancedSandbox optimization (resource usage)
5. Meta-KB loading optimization (startup time)

**Estimated Fix Time**: 4-8 hours (Short-Medium effort)