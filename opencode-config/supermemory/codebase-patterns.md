---
type: codebase-analysis
scope: project
priority: high
date: 2026-02-16
---

# Codebase Pattern Analysis & Consolidation Roadmap

## Critical Findings

### Inconsistent Patterns (Need Immediate Unification)
1. **Logging**: 16+ different console.log/error/warn approaches
   - Files: backup-manager, crash-guard, sqlite-reader, learning API, skills API
   - Solution: Create unified logger package

2. **Error Handling**: 58 try-catch blocks with varying strategies
   - Files: provider-status-store (8), sqlite-reader (6), learning API (7)
   - Solution: Standardize error handling pattern

3. **JSON I/O**: 42 fs.readFileSync + JSON.parse scattered across 8+ files
   - Files: dashboard-launcher, plugin-healthd, proofcheck, runbooks, skill-rl-manager, learning/skills/health APIs
   - Solution: Create opencode-file-utils package

4. **Directory Operations**: 78 fs.mkdirSync/existsSync calls inconsistent
   - Solution: Create ensureDir utility

### Duplicate Implementations
1. **Provider Health Check** (2 implementations)
   - opencode-dashboard/src/app/api/providers/route.ts
   - opencode-health-check/src/index.js

2. **State Persistence** (4 implementations)
   - opencode-skill-rl-manager/src/index.js
   - opencode-learning-engine/src/anti-patterns.js
   - opencode-learning-engine/src/positive-patterns.js
   - opencode-memory-graph/src/activator.js

3. **Configuration Loading** (2 implementations)
   - opencode-config-loader/src/index.js
   - opencode-dashboard/src/app/api/config/route.ts

### DRY Violations
1. Model name formatting repeated 3+ times
2. Rate limit calculations duplicated across files
3. File path resolution repeated in multiple API routes

## Well-Implemented Patterns (Keep & Reuse)
✅ Atomic file write pattern (temp file + rename) - crash-guard, context-governor, provider-status-store
✅ Circuit breaker pattern - well-encapsulated, reusable
✅ Safe JSON handling - prevents circular reference crashes

## Consolidation Roadmap

### Priority 1 (High Impact, Low Effort)
- [ ] Create opencode-file-utils package (JSON read/write) - saves ~40 lines
- [ ] Standardize logging with unified logger - saves ~20 lines
- [ ] Extract path utilities - resolve project root consistently

### Priority 2 (Medium Impact, Medium Effort)
- [ ] Consolidate health check logic
- [ ] Create state persistence package
- [ ] Extract validation utilities

### Priority 3 (Lower Priority)
- [ ] Consolidate config loading
- [ ] Create retry utilities
- [ ] Extract metric calculations

## Metrics
- Total Packages: 30+
- Try-catch blocks: 58 (inconsistent)
- JSON operations: 185
- fs.readFileSync calls: 42
- fs.mkdirSync/existsSync calls: 78
- Logging statements: 16+ (inconsistent)
- Duplicate implementations: 3 major
- DRY violations: 5+
- Potential lines saved: 100+

## Implementation Notes
- Atomic write pattern is production-ready and should be standardized
- SafeJSON handling prevents crashes - should be in shared utility
- Circuit breaker is well-designed - good reference implementation
- All consolidation should maintain backward compatibility
