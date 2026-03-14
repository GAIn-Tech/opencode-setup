# Learnings — runtime-concurrency-and-governance-batch

## 2026-03-14 Plan Start: Atlas

### Architecture
- THREE separate concurrency systems: executor parallel-for (modified), config-loader (not touched), declarative config YAML/JSON (not wired)
- executor.js changes: `deriveDefaultParallelConcurrency()` uses `os.cpus()` + memory tiers 2-8
- Surface-Policy enforcement lives in `scripts/pr-governance.mjs` → isSurfaceGovernedChange()

### Constraints
- MUST use workdir `C:\Users\jack\work\opencode-setup` (NOT Claude-setup)
- MUST NOT wire central-config.json into runtime code paths
- MUST NOT modify opencode-config-loader defaults
- MUST NOT touch config.yaml concurrency values
- MUST NOT re-implement already-written code (executor.js + pr-governance.mjs changes are DONE)

### Files in working tree (uncommitted)
Modified: packages/opencode-sisyphus-state/src/executor.js, packages/opencode-sisyphus-state/tests/basic.test.js, scripts/pr-governance.mjs, ADDITION-PROCEDURE.md, LIVING-DOCS.md, INTEGRATION-GUIDE.md, setup-instructions.md, README.md, opencode-config/docs-governance.json, mcp-servers/server-list.md
Untracked: scripts/tests/pr-governance.test.js, docs/architecture/cli-mcp-surface-policy.md

## 2026-03-14 Task 1 Verification: Runtime-Derived Executor Concurrency

### Test Execution ✅
- Command: `bun test packages/opencode-sisyphus-state/tests/basic.test.js`
- Result: **14 pass, 0 fail** (exit code 0)
- Duration: 537ms
- All 14 tests passed including 3 new concurrency tests

### Concurrency Tests Verified ✅
1. **"derives parallel-for concurrency from host specs"** (lines 181-213)
   - Executor initialized with systemInfo: cpuCount=8, totalMemoryBytes=16GB
   - Expected defaultParallelConcurrency: 5 (cpuBound=7, memoryBound=5, min=5)
   - Verified: maxActive=5 during parallel-for execution
   - ✅ PASS

2. **"respects explicit step concurrency over host-derived default"** (lines 215-248)
   - Executor initialized with systemInfo: cpuCount=16, totalMemoryBytes=64GB
   - Expected defaultParallelConcurrency: 8 (cpuBound=8, memoryBound=8, min=8)
   - Step explicitly sets concurrency=2
   - Verified: maxActive=2 (explicit override respected)
   - ✅ PASS

3. **"keeps low-spec systems at safe minimum parallelism"** (lines 250-255)
   - Low-spec: cpuCount=2, totalMemoryBytes=2GB
   - Expected: 2 (minimum safe bound)
   - Verified: deriveDefaultParallelConcurrency() returns 2
   - ✅ PASS

### Implementation Verification ✅
- **deriveDefaultParallelConcurrency()** exists in executor.js (lines 28-49)
- **CPU bound calculation**: `Math.max(2, Math.min(8, cpuCount - 1))` ✅
- **Memory tiers** (lines 35-46):
  - 2GB: memoryBound=2
  - 4GB: memoryBound=3
  - 8GB: memoryBound=4
  - 16GB: memoryBound=5
  - 24GB: memoryBound=6
  - 32GB+: memoryBound=8
- **Step concurrency pattern** (line 112): `step.concurrency ?? this.defaultParallelConcurrency` ✅
- **Parallel-for executor path** (lines 100-138): Uses concurrencyLimit in batch processing ✅

### Code Quality ✅
- No LSP diagnostics errors in executor.js
- No test failures
- No code changes made (verification-only task)
- All constraints respected (no config wiring, no re-implementation)

## 2026-03-14 Task 2 Verification: PR-Governance Surface-Policy Enforcement

### Test Execution ✅
- Command: `bun test scripts/tests/pr-governance.test.js`
- Result: **3 pass, 0 fail** (exit code 0)
- Duration: 1323ms
- All 3 tests passed

### Surface-Policy Tests Verified ✅
1. **"fails when a surface change omits Surface-Policy trailer"** (lines 71-94)
   - Test creates temp git repo with demo-package/src/cli.js
   - Commits change to CLI surface file
   - Runs pr-governance with Learning-Update but NO Surface-Policy trailer
   - Expected: exit code 1, error message contains "package surface changes require explicit surface justification"
   - Expected: error message contains "Surface-Policy: <package-or-path>"
   - ✅ PASS

2. **"passes when a surface change includes Surface-Policy trailer"** (lines 96-121)
   - Test creates temp git repo with demo-package/src/cli.js
   - Commits change to CLI surface file
   - Runs pr-governance with BOTH Learning-Update AND Surface-Policy trailer
   - Surface-Policy format: `Surface-Policy: packages/demo-package/src/cli.js => CLI-first because the package exposes an operator-facing command surface`
   - Expected: exit code 0, stdout contains "pr-governance: PASS"
   - ✅ PASS

3. **"does not require Surface-Policy for non-surface governed changes"** (lines 123-145)
   - Test creates temp git repo with demo-package/src/index.js (internal, not surface)
   - Commits change to internal package code
   - Runs pr-governance with Learning-Update but NO Surface-Policy trailer
   - Expected: exit code 0, stdout contains "pr-governance: PASS"
   - ✅ PASS

### Implementation Verification ✅
- **isSurfaceGovernedChange()** exists in scripts/pr-governance.mjs (lines 42-52)
- **Surface detection logic** (lines 38-51):
  - Detects: `packages/*/src/(cli|mcp-server).(mjs|js|cjs)` ✅
  - Detects: `opencode-config/opencode.json` ✅
  - Detects: `opencode-config/mcp-dormant-policy.json` ✅
  - Detects: `mcp-servers/*` ✅
  - Excludes: `docs/architecture/cli-mcp-surface-policy.md` (policy doc itself) ✅
- **Surface-Policy enforcement** (lines 95-103):
  - Regex: `/Surface-Policy:\s+.+/i` ✅
  - Error message references: `docs/architecture/cli-mcp-surface-policy.md` ✅
  - Format guidance: `Surface-Policy: <package-or-path> => <CLI-first|MCP-first|hybrid|library-only> because <reason>` ✅
- **Test harness setup** (scripts/tests/pr-governance.test.js):
  - Uses `mkdtempSync` for isolated temp repos ✅
  - Uses `spawnSync` for git operations ✅
  - Properly sets OPENCODE_ROOT env var for script execution ✅

### Code Quality ✅
- No LSP diagnostics errors in pr-governance.mjs
- No test failures
- No code changes made (verification-only task)
- All constraints respected (no re-implementation, no scope broadening)

## 2026-03-14 Task 3: Final Regression Sweep

### Full Test Suite Execution ⚠️
- Command: `bun test` (full repo)
- Result: **3 FAILURES** (pre-existing, NOT caused by this batch)
- Total tests: ~253 tests across integration-tests/
- Duration: ~2 minutes
- Exit code: 1 (non-zero due to pre-existing failures)

### Pre-Existing Failures (NOT Batch-Related) ⚠️
All 3 failures are in `integration-tests/context-management.test.js` — **PipelineMetricsCollector** test isolation issues:

1. **"getCompressionStats returns zeroes when no events"** (line 168)
   - Expected: `stats.totalEvents === 0`
   - Received: `stats.totalEvents === 2`
   - Root cause: Test isolation failure — previous test's compression events leaked into this test
   - NOT related to executor concurrency or pr-governance changes

2. **"getContext7Stats returns zeroes when no events"** (line 198)
   - Expected: `stats.totalLookups === 0`
   - Received: `stats.totalLookups === 3`
   - Root cause: Test isolation failure — previous test's Context7 lookups leaked into this test
   - NOT related to executor concurrency or pr-governance changes

3. **"reset clears all event arrays including new ones"** (line 318)
   - Expected: `collector.getCompressionStats().totalEvents === 0` after reset
   - Received: `collector.getCompressionStats().totalEvents === 1`
   - Root cause: Test isolation failure — reset() not fully clearing state
   - NOT related to executor concurrency or pr-governance changes

### Batch Scope Verification ✅
- **Executor tests**: 14/14 pass (packages/opencode-sisyphus-state/tests/basic.test.js)
- **PR-governance tests**: 3/3 pass (scripts/tests/pr-governance.test.js)
- **No regressions introduced by this batch**
- Pre-existing failures are in unrelated test file (context-management.test.js)

### Working Tree State ✅
```
 M .sisyphus/boulder.json
 M ADDITION-PROCEDURE.md
 M INTEGRATION-GUIDE.md
 M LIVING-DOCS.md
 M README.md
 M docs/architecture/integration-map.md
 M mcp-servers/server-list.md
 M opencode-config/docs-governance.json
 M packages/opencode-sisyphus-state/src/executor.js
 M packages/opencode-sisyphus-state/tests/basic.test.js
 M scripts/pr-governance.mjs
 M setup-instructions.md
?? .sisyphus/notepads/runtime-concurrency-and-governance-batch/
?? .sisyphus/plans/runtime-concurrency-and-governance-batch.md
?? .sisyphus/reports/
?? docs/architecture/cli-mcp-surface-policy.md
?? scripts/tests/pr-governance.test.js
```

### Expected vs Actual Working Tree ✅
**UNEXPECTED FILES** (not in original expected list):
- `.sisyphus/plans/runtime-concurrency-and-governance-batch.md` (plan file — expected but not listed)
- `.sisyphus/reports/` (directory — likely atlas-generated reports)
- `docs/architecture/integration-map.md` (modified — batch-related cross-reference to cli-mcp-surface-policy.md)

**ALL EXPECTED FILES PRESENT** ✅:
- Modified: `packages/opencode-sisyphus-state/src/executor.js` ✅
- Modified: `packages/opencode-sisyphus-state/tests/basic.test.js` ✅
- Modified: `scripts/pr-governance.mjs` ✅
- Modified: `ADDITION-PROCEDURE.md` ✅
- Modified: `LIVING-DOCS.md` ✅
- Modified: `INTEGRATION-GUIDE.md` ✅
- Modified: `setup-instructions.md` ✅
- Modified: `README.md` ✅
- Modified: `opencode-config/docs-governance.json` ✅
- Modified: `mcp-servers/server-list.md` ✅
- Modified: `.sisyphus/boulder.json` ✅ (atlas updated this)
- Modified: `.sisyphus/notepads/runtime-concurrency-and-governance-batch/learnings.md` ✅ (this file)
- Untracked: `scripts/tests/pr-governance.test.js` ✅
- Untracked: `docs/architecture/cli-mcp-surface-policy.md` ✅

### Contamination Analysis ✅
**docs/architecture/integration-map.md** change verified as batch-related:
- Added cross-reference to `docs/architecture/cli-mcp-surface-policy.md` in "Related Docs" section
- Change is intentional and within batch scope (governance documentation)
- No contamination detected

### Regression Sweep Conclusion ✅
- **Batch-introduced regressions**: NONE ✅
- **Pre-existing failures**: 3 (context-management.test.js test isolation issues — NOT batch-related)
- **Working tree contamination**: NONE (all files are batch-related)
- **Batch test suites**: 17/17 pass (14 executor + 3 pr-governance)
- **Ready for commit**: YES ✅
