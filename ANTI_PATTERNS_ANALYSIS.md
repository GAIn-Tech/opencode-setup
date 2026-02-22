# Critical Anti-Patterns Analysis: Model Routing & Key Rotation

## Executive Summary
Analyzed 3 packages (opencode-model-router-x, opencode-circuit-breaker, opencode-sisyphus-state) and identified 10 critical anti-patterns that could cause cascading failures in frontier orchestration platform.

**Top 3 CRITICAL Risks:**
1. **Race condition in key rotation** - concurrent getNextKey() calls return same key
2. **Missing locks on recordFailure/recordSuccess** - state mutations race
3. **Unhandled promise rejections** - async calls not awaited

## Key Findings

### Risk #1: RACE CONDITION IN KEY ROTATION (CRITICAL)
- **File**: key-rotator.js lines 53-77, 379
- **Issue**: getNextKey() is async but callers don't await it
- **Impact**: Same key returned to multiple concurrent requests → 429 cascades
- **Fix**: Make route() async, await all key operations

### Risk #2: MISSING LOCKS ON SHARED STATE (CRITICAL)
- **File**: key-rotator.js lines 315-371
- **Issue**: recordFailure() and recordSuccess() have no locks
- **Impact**: Concurrent success/failure calls race, state corrupted
- **Fix**: Wrap both methods in _acquireLock()

### Risk #3: UNHANDLED PROMISE REJECTIONS (HIGH)
- **File**: index.js lines 379, 405, 461, 480
- **Issue**: getNextKey() promises not awaited or caught
- **Impact**: Silent failures, TypeError on key.value access
- **Fix**: Add .catch() handlers, make callers async

### Risk #4: MEMORY LEAK - WAL CHECKPOINT (HIGH)
- **File**: database.js lines 126-146
- **Issue**: setInterval() created but not cleaned up on close()
- **Impact**: 10K+ intervals accumulate, memory grows unbounded
- **Fix**: Add guard in _setupWALCheckpoint(), call close() on exit

### Risk #5: INCONSISTENT ERROR HANDLING (HIGH)
- **File**: executor.js lines 62-82
- **Issue**: Promise.all() only catches first error, others lost
- **Impact**: Parallel batch failures not fully reported
- **Fix**: Use Promise.allSettled(), aggregate all errors

### Risk #6: MISSING TIMEOUTS (HIGH)
- **File**: key-rotator.js lines 62-77
- **Issue**: Lock acquisition has no timeout
- **Impact**: Deadlock if callback hangs
- **Fix**: Add Promise.race() with timeout

### Risk #7: HARDCODED VALUES (MEDIUM)
- **File**: key-rotator.js lines 35-38, 301-302, 342, 347
- **Issue**: Cooldowns, thresholds hardcoded (60000ms, 10000 tokens, etc)
- **Impact**: Inflexible deployments, provider-specific failures
- **Fix**: Move to config.json with env overrides

### Risk #8: RACE IN FALLBACK LAYER (MEDIUM)
- **File**: fallback-layer-strategy.js lines 198-218
- **Issue**: currentLayer++ can race in concurrent calls
- **Impact**: Layer skipped, fallback chain broken
- **Fix**: Use atomic increment, add state validation

### Risk #9: STATS PERSISTENCE NOT ATOMIC (MEDIUM)
- **File**: index.js lines 546-560
- **Issue**: Rename not atomic on Windows/NFS
- **Impact**: Stats corrupted on crash between write and rename
- **Fix**: Add checksum validation, backup/recovery

### Risk #10: LEARNING ENGINE REJECTIONS (MEDIUM)
- **File**: index.js lines 802-829
- **Issue**: learnFromOutcome() not awaited, rejections lost
- **Impact**: Learning data lost, model tuning degrades
- **Fix**: Await learning ops, add retry logic

## Immediate Actions Required

1. **TODAY**: Fix Race Conditions (#1, #2)
   - Make route() async
   - Add locks to recordFailure/recordSuccess
   - Add tests for concurrent key requests

2. **THIS WEEK**: Fix Async Safety (#3, #5, #6)
   - Add .catch() handlers
   - Use Promise.allSettled()
   - Add timeouts to locks

3. **THIS SPRINT**: Fix Remaining Issues (#4, #7, #8, #9, #10)
   - Clean up intervals
   - Move hardcoded values to config
   - Add atomicity to stats persistence
   - Add retry logic to learning engine

## Testing Strategy

- Add concurrent key rotation tests
- Add parallel execution failure tests
- Add memory leak detection tests
- Add timeout tests
- Add atomicity tests for stats persistence

## Monitoring

- Track lock contention
- Monitor promise rejections
- Track memory growth
- Monitor stats persistence failures
- Track learning engine errors
