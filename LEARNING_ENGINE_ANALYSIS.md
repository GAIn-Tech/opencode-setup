# OpenCode Learning Engine - Deep Technical Analysis

## Executive Summary
The learning engine has **16 identified issues** across 4 severity levels. Critical issues include unbounded pattern weight growth, missing JSON corruption recovery, and session log memory leaks. The system is production-ready but needs hardening for scale.

## Critical Issues (Must Fix)

### 1. Unbounded Pattern Weight Growth (anti-patterns.js:83)
- Weight capped at 50, but multiplied by log2(occurrences)
- With 1000+ occurrences, old patterns dominate new ones
- **Fix**: Use `weight = base_weight * (1 + log2(occurrences))` instead

### 2. Pattern Matching Loop No Timeout (anti-patterns.js:177-258)
- Loops through all patterns without timeout
- 10K+ patterns can block event loop for 100ms+
- **Fix**: Implement early exit or async chunking

### 3. Corrupted JSON Silent Failure (anti-patterns.js:324-338)
- If JSON corrupted, all patterns lost silently
- No backup or recovery mechanism
- **Fix**: Implement backup rotation + error events

### 4. Session Log Unbounded Growth (index.js:329-335)
- sessionLog array grows indefinitely
- Memory leak after 1000+ sessions
- **Fix**: Cap at 1000 entries, implement circular buffer

### 5. Pattern Extractor Memory Exhaustion (pattern-extractor.js:581-614)
- Batching is per-file, not per-message
- Large files (>10MB) load entirely into memory
- **Fix**: Stream JSON parsing or line-by-line processing

## High Severity Issues

### 6. No Deduplication on Pattern Creation
- Same issue tracked 5 different ways
- Pattern explosion with similar descriptions
- **Fix**: Use fuzzy matching or hash-based deduplication

### 7. Outcome Learning Doesn't Check Duplicates
- Same failure recorded multiple times
- Inflated pattern weights
- **Fix**: Check if pattern exists before adding

### 8. Positive Pattern Success Rate Naive
- Rolling average doesn't account for recency
- System doesn't adapt to changing conditions
- **Fix**: Use exponential moving average

### 9. No Validation on Pattern Context
- Malformed context not caught
- Matching logic fails silently
- **Fix**: Validate context schema before storing

## Medium Severity Issues

### 10. Orchestration Advisor Fallback Chain Swallows Errors
- Missing dependency silently uses stubs
- Quota risk computation always returns 0
- **Fix**: Emit error event, add health check

### 11. Pattern Matching Doesn't Handle Null Context
- Crashes on corrupted patterns
- **Fix**: Add null checks with optional chaining

### 12. No Metrics on Pattern Accuracy
- Can't distinguish true positives from false positives
- **Fix**: Track TP, FP, TN, FN separately

### 13. Hooks Can Throw and Break Advice
- Hook errors caught but advice corruption silent
- **Fix**: Validate advice schema after hook execution

## Low Severity Issues

### 14. ID Generation Not Unique
- Date.now() has 1ms resolution
- Collision risk with high-frequency creation
- **Fix**: Use crypto.randomUUID()

### 15. No Persistence for Outcome Log
- Lost on restart
- Can't analyze long-term trends
- **Fix**: Persist to ~/.opencode/learning/outcomes.json

### 16. Pattern Extractor Doesn't Handle Symlinks
- Symlinked sessions skipped
- **Fix**: Add followSymlinks option

## Data Flow Summary

```
Session Logs → PatternExtractor → AntiPatternCatalog/PositivePatternTracker
                                          ↓
                                    Persistence (JSON)
                                          ↓
                                  advise(taskContext)
                                          ↓
                          learnFromOutcome(adviceId, outcome)
                                          ↓
                                  Update Patterns
```

## Performance Characteristics

- Pattern matching: O(n) where n = pattern count
- With 10K patterns: ~100ms per advise() call
- Memory per pattern: ~500 bytes (with contexts)
- 10K patterns = ~5MB memory

## Recommendations

1. **Immediate** (this week):
   - Cap sessionLog at 1000
   - Add null checks to pattern matching
   - Implement JSON backup rotation

2. **Short term** (next sprint):
   - Implement fuzzy deduplication
   - Add outcome log persistence
   - Implement exponential moving average

3. **Long term** (next quarter):
   - Consider pattern database (SQLite) for scale
   - Implement pattern pruning strategy
   - Add pattern accuracy metrics dashboard
