# OpenCode Additional Gaps - Deep Analysis

## Summary

Comprehensive gap analysis across 45+ packages. Identified critical gaps in multiple categories.

---

## CRITICAL GAPS (Fix Immediately)

### 1. Subagent Delegation Failure (SYSTEM)
**Issue**: Background explore agents consistently fail - spawn but produce no output
**Evidence**: 5+ agents launched in session showed:
- Task ID created, status "running"
- 3+ minutes runtime
- Only initial prompt visible, no exploration results
- Repeats across sessions

**Impact**: Cannot leverage parallel exploration for gap analysis
**Root Cause**: Likely `load_skills: []` parameter handling or explore agent not returning results properly
**Fix Required**: Debug task delegation system

---

### 2. Context Budget Compression - Not Triggering
**Location**: `packages/opencode-context-governor/src/index.js`
**Issue**: Added `onErrorThreshold()` callback but callback is NEVER called externally
**Evidence**: 
- Callback fires at 80% threshold internally
- But no external system calls this to trigger actual compression
- ContextBridge has `onCompress` callback but also not connected

**Fix**: Wire callbacks into actual compression pipeline

---

### 3. Learning Engine Runtime - Partial Integration
**Location**: `packages/opencode-model-router-x/src/index.js:247-296`
**Issue**: `getLearningAdvice()` exists but only returns metaKB penalties
**Missing**:
- `risk_score` field not being computed
- `skill_recommendations` not passed to routing
- `should_pause` not checked before execution

---

## HIGH PRIORITY GAPS

### 4. Memory Leaks - Unbounded Caches
| File | Line | Issue |
|------|------|-------|
| `packages/opencode-codebase-memory/src/parser.js` | 60 | `new Map()` - no maxSize |
| `packages/opencode-model-router-x/src/subagent-retry-manager.js` | 65-66 | `#failureCounts = new Map()` - unbounded |
| `packages/opencode-model-router-x/src/token-budget-manager.js` | 17 | `new Map()` - velocityMap |

### 5. Hardcoded Paths
**Location**: `packages/opencode-model-router-x/src/index.js:1106`
```javascript
const configPath = path.resolve(__dirname, '../../../opencode-config/oh-my-opencode.json');
```
**Issue**: Fragile relative path assumption

### 6. Console.log in Production
| File | Line | Issue |
|------|------|-------|
| `packages/opencode-event-bus/src/telemetry-observer.js` | 32 | `console.log(logEntry)` |
| `packages/opencode-model-manager/src/monitoring/metrics-collector.js` | 306 | Debug output |
| `packages/opencode-model-router-x/src/subagent-retry-manager.js` | 174 | Debug output |

### 7. Governor Cleanup Interval Memory
**Location**: `packages/opencode-context-governor/src/index.js:64-72`
```javascript
this._cleanupInterval = setInterval(() => {
  const removed = this._tracker.cleanupStaleSessions();
}, 60 * 60 * 1000);
if (this._cleanupInterval.unref) {
  this._cleanupInterval.unref();
}
```
**Issue**: `unref()` prevents keeping process alive BUT interval still runs. If `shutdown()` called, interval not cleared.

---

## MEDIUM PRIORITY GAPS

### 8. Error Handling Gaps
- `packages/opencode-model-router-x/src/new-model-assessor.js:135` - Throws without graceful handling
- Multiple `catch (e) {}` empty blocks scattered

### 9. JSON.parse Without Protection
- `packages/opencode-learning-engine/src/meta-kb-reader.js:382` - Single try/catch exists but verify it's sufficient

### 10. Package.json Inconsistencies
- 45 packages but no unified version strategy visible
- Some use `bun:test`, some use `node:test`

---

## CONFIGURATION GAPS

### 11. Config Fragmentation (From Previous Analysis)
- 19 JSON files in `opencode-config/`
- No clear precedence documentation (though we added CONFIG_PRECEDENCE.md)
- Many config files lack schema validation

### 12. Environment Variable Inconsistency
- Mix of `OPENCODE_*`, `OPENCODE_*-*`, different naming conventions
- No centralized env validation

---

## SECURITY GAPS

### 13. Secrets in Code
- `packages/opencode-logger/src/index.js:33-34` - `process.env.LANGFUSE_SECRET_KEY` directly in code
- Should use env validation at startup

### 14. Path Traversal Potential
- Multiple `path.resolve()` calls without validation
- `packages/opencode-codebase-memory/src/indexer.js` - file path handling

---

## TESTING GAPS

### 15. Test Coverage Uneven
- Some packages have 138 test files (`opencode-integration-layer`)
- Some have 0 tests

### 16. Test Artifacts
- Previous: 244 test-*.db files in sisyphus-state (now cleaned?)
- No automated cleanup after tests

---

## DOCUMENTATION GAPS

### 17. API Documentation Missing
- Many internal methods lack JSDoc
- Error codes not documented
- Callback signatures unclear

### 18. Migration Guides Missing
- Config changes between versions not tracked
- Breaking changes not documented

---

## ARCHITECTURE GAPS

### 19. No Unified Error Taxonomy Usage
- Only 1 test file uses `opencode-errors` package
- Production code still uses ad-hoc errors

### 20. Plugin System Opacity
- oh-my-opencode is external npm package
- local/ changes don't propagate (gitignored)
- Telemetry hooks drift

### 21. Integration Points Not Versioned
- Packages reference each other without version locks
- API changes in one package break others silently

---

## ROI PRIORITIZATION

### Quick Wins (High ROI)
1. Fix subagent delegation (system issue blocking all analysis)
2. Add bounds to Maps (memory leak fix)
3. Remove console.log from production
4. Wire compression callbacks

### Medium Effort (High ROI)
1. Create unified error handling wrapper
2. Add environment validation at startup
3. Document API surfaces

### Long-term (Architecture)
1. Config consolidation
2. Package version locking
3. Plugin sync mechanism

---

## NOTES

- Previous gap remediation plan: `.sisyphus/plans/opencode-gap-remediation.md`
- This is ADDITIONAL gaps found through deeper analysis
- Background agents failing is BLOCKING effective exploration

---

*Generated: 2026-04-09*
*Context: Direct grep/glob analysis across 45 packages*
