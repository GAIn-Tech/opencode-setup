# Wave 5 — Systemic Naivete Remediation

## TL;DR

> **Quick Summary**: Fix 7 systemic design naivete categories discovered in deep codebase audit: shared utility fragmentation (3 separate implementations), dashboard sync I/O (32 blocking calls), unguarded JSON.parse (50+ file-I/O calls), resource lifecycle leaks (timers, listeners, Maps), error swallowing (.catch(()=>{})), unwired modules (getSchedulerTelemetry, tool-usage-tracker), and security gaps (command injection, env validation).
>
> **Deliverables**:
> - New `opencode-safe-io` shared utility package (safeJsonParse, safeJsonRead, managedInterval, managedListener)
> - 50+ JSON.parse file-I/O calls migrated to safeJsonParse
> - 32 dashboard sync I/O calls converted to async (write paths first)
> - 3 setInterval .unref() fixes + rate-limit.ts bounded Map
> - 12 child process listener leaks fixed (.once() pattern)
> - getSchedulerTelemetry implemented + tool-usage-tracker exported
> - pr-generator.js command injection fixed (3 vectors)
>
> **Estimated Effort**: Large (20-30 hours across 10 tasks)
> **Parallel Execution**: YES — 3 waves (5A foundation, 5B dashboard+listeners, 5C cleanup)
> **Critical Path**: Task 0 → Task 1 (safe-io) → Task 2 (JSON.parse migration) → Task 3 (dashboard async)
> **Risk Reduction**: ~250+ points across all naivete categories

---

## Context

### Original Request
"I want you to do another review of all design aspects in which our system is lacking. Where are we being naive? Where do we need to transform or add?"

### Interview Summary
**Key Discussions**:
- Scope: All 7 naivete categories, prioritized by cascade impact
- Architecture: New `opencode-safe-io` package (Option A) — clean separation, solves ESM/CJS split
- Dashboard: Follow lowest-failure-risk path (write paths first, then reads)
- Test strategy: Tests-after (matches Wave 1-4 pattern)

**Research Findings**:
- 5 parallel explore agents (error handling, resource management, concurrency, security, integration completeness)
- Direct grep/ast-grep/file reads across all 34 packages
- Cross-referenced with Wave 1-4 supermemory findings

### Metis Review (Key Findings)
**Incorporated into plan:**
1. **Dashboard sync I/O count is 32 in src/app + src/lib** — verified by direct grep. Metis's "121" included files outside dashboard src/ and already-converted files.
2. **Most .catch(()=>{}) are INTENTIONAL** — Wave 4 fire-and-forget (5), model-manager write queues (4), dashboard safe-fallback (5) = 14 intentional. Only ~2 genuinely problematic.
3. **MetaAwarenessTracker IS already exported** from learning-engine (line 768). Removed from orphan scope.
4. **tool-usage-tracker has 1 caller** (orchestration-advisor.js) — not zero. Still needs re-export from learning-engine/index.js for external access.
5. **Proofcheck exec() uses hardcoded strings** — NOT vulnerable. Only pr-generator.js has 3 real injection vectors.
6. **write-json-atomic.ts verification read is INTENTIONAL** — JSON.parse(readFileSync(tempPath)) validates write integrity. MUST NOT be converted to async.
7. **JSON.parse calls need classification** — ~95 total but only ~50 are file-I/O. Others are deep-clones (5), client-side (8), deserialization (10), verification (2). Only target file-I/O.
8. **CJS format for opencode-safe-io** — config-loader and learning-engine (biggest consumers) are CJS. Provide CJS primary with ESM re-export wrapper.

### Test Infrastructure
- **Framework**: bun test
- **Existing tests**: ~450+ across all packages (must pass before and after)
- **Strategy**: Tests-after (match Wave 1-4 pattern)
- **Agent QA**: All tasks include tool-executed verification scenarios

---

## Work Objectives

### Core Objective
Eliminate 7 systemic design naivete categories discovered in deep codebase audit, creating shared infrastructure (opencode-safe-io) that cascades fixes across 87+ call sites and establishing patterns that prevent recurrence.

### Concrete Deliverables
- `packages/opencode-safe-io/` — New shared utility package
- 50+ files updated to use safeJsonParse from opencode-safe-io
- 9 dashboard files converted from sync to async I/O
- 3 timer leaks fixed (.unref())
- 3 files with listener leaks fixed (.once())
- `health-check/index.js` — getSchedulerTelemetry implemented + exported
- `learning-engine/index.js` — tool-usage-tracker re-exported
- `pr-generator.js` — 3 command injection vectors fixed

### Definition of Done
- [ ] `opencode-safe-io` package exists and is importable from both CJS and ESM
- [ ] Zero unguarded `JSON.parse(fs.readFileSync(...))` patterns remain in non-test production code (excluding intentional verification in write-json-atomic.ts)
- [ ] Zero sync I/O calls remain in dashboard API route handlers (excluding write-json-atomic.ts verification read)
- [ ] All setInterval calls have .unref() applied
- [ ] All child process listeners use .once() or explicit removeListener
- [ ] getSchedulerTelemetry exported from health-check
- [ ] tool-usage-tracker re-exported from learning-engine/index.js
- [ ] Zero string-interpolated execSync calls in pr-generator.js
- [ ] All ~450+ existing tests still pass (`bun test`)
- [ ] New regression tests added for each task

### Must Have
- Shared safeJsonParse with labeled logging (which file failed to parse)
- Async I/O wrappers for dashboard routes
- .unref() on all timers preventing process exit
- .once() pattern for child process event handlers
- Command injection prevention in pr-generator.js

### Must NOT Have (Guardrails from Metis)
- **MUST NOT** replace `.catch(() => {})` in tool-usage-tracker.js — these are intentional Wave 4 fire-and-forget patterns
- **MUST NOT** replace `.catch(() => {})` in model-manager write queues (audit-logger, change-event-system, snapshot-store, cache-layer) — intentional
- **MUST NOT** replace `.catch(() => fallback)` patterns in dashboard components — these ARE error handling
- **MUST NOT** convert `JSON.parse(fs.readFileSync(tempPath))` in write-json-atomic.ts — intentional verification for atomic write integrity
- **MUST NOT** touch proofcheck for command injection — all exec() calls use hardcoded strings
- **MUST NOT** convert client-side JSON.parse calls (React components, hooks, SSE handlers) to server-side utilities
- **MUST NOT** change `JSON.parse(JSON.stringify())` deep-clone patterns in ConfigViewer.tsx, graph-v3.js
- **MUST NOT** add dependencies FROM opencode-safe-io TO other workspace packages (leaf-only package)
- **MUST NOT** change module.exports shapes of any modified file (backward compatibility)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks verifiable WITHOUT any human action. Every criterion has an exact command and expected output.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (match Wave 1-4 pattern)
- **Framework**: bun test

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **New package** | Bash (bun -e) | Import, call functions, verify return types |
| **JSON.parse migration** | Bash (ast_grep_search/grep) | Verify zero unguarded patterns remain |
| **Async conversion** | Bash (grep) | Verify zero sync fs calls in target files |
| **Timer fixes** | Bash (grep) | Verify .unref() present after all setInterval |
| **Listener fixes** | Bash (grep) | Verify .once() replaces .on() for one-shot handlers |
| **Security fixes** | Bash (grep) | Verify zero string-interpolated execSync |
| **Test suite** | Bash (bun test) | Run full suite, assert 0 failures |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Prerequisite — Must Complete First):
└── Task 0: Commit Wave 4 uncommitted files + baseline verification

Wave 5A (Foundation — After Wave 0):
├── Task 1: Create opencode-safe-io package [no dependencies]
├── Task 4: Fix 3 setInterval .unref() + rate-limit bounded Map [no dependencies]
└── Task 5: Fix 12 child process listener leaks [no dependencies]

Wave 5B (Migration — After Task 1):
├── Task 2: Migrate 50+ JSON.parse file-I/O calls to safeJsonParse [depends: Task 1]
├── Task 3: Convert 32 dashboard sync I/O to async [depends: Task 1 for safeJsonRead]
└── Task 7: Wire orphan modules (getSchedulerTelemetry + tool-usage-tracker) [no dependencies]

Wave 5C (Cleanup — After Wave 5B):
├── Task 6: Fix ~2 genuinely problematic empty catch blocks [no dependencies]
├── Task 8: Security hardening (pr-generator command injection) [no dependencies]
└── Task 9: Add env var validation to dashboard security-critical routes [no dependencies]

Critical Path: Task 0 → Task 1 → Tasks 2+3 (parallel) → Wave 5C
Parallel Speedup: ~40% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 0 | None | All | None (prerequisite) |
| 1 | 0 | 2, 3 | 4, 5 |
| 2 | 1 | None | 3, 7 |
| 3 | 1 | None | 2, 7 |
| 4 | 0 | None | 1, 5 |
| 5 | 0 | None | 1, 4 |
| 6 | 0 | None | 8, 9 |
| 7 | 0 | None | 2, 3 |
| 8 | 0 | None | 6, 9 |
| 9 | 0 | None | 6, 8 |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 0 | Baseline | task(category="quick", load_skills=["git-master"], ...) |
| 5A | 1, 4, 5 | task(category="unspecified-high", ...) for 1; task(category="quick", ...) for 4, 5 |
| 5B | 2, 3, 7 | task(category="unspecified-high", ...) for 2, 3; task(category="quick", ...) for 7 |
| 5C | 6, 8, 9 | task(category="quick", ...) for all three |

---

## TODOs

### Task 0: Commit Wave 4 Uncommitted Files + Baseline Verification

- [ ] 0. Commit modified files from Wave 4 and verify baseline

  **What to do**:
  1. Run `git status` to see all modified/untracked files
  2. Review each modified file to confirm changes are Wave 4 related and stable:
     - `packages/opencode-backup-manager/src/index.js` — pre-existing modification
     - `packages/opencode-context-governor/src/index.js` — pre-existing modification
     - `packages/opencode-crash-guard/src/crash-recovery.js` — pre-existing modification
     - `packages/opencode-learning-engine/src/positive-patterns.js` — pre-existing modification
     - `packages/opencode-memory-graph/src/activator.js` — pre-existing modification
     - `packages/opencode-plugin-lifecycle/src/index.js` — pre-existing modification
  3. Run `bun test` to verify all tests pass with current state
  4. If tests pass, commit the stable modifications as a housekeeping commit
  5. Record test count as Wave 5 baseline

  **Must NOT do**:
  - Do not modify any code — only commit existing changes
  - Do not fix pre-existing test failures — only report them

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: Needed for proper commit message format with trailers

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 0 (prerequisite)
  - **Blocks**: All other tasks
  - **Blocked By**: None

  **References**:
  - `.sisyphus/plans/tech-debt-wave4.md` — Previous plan's commit pattern
  - Wave 4 commits: `e12b001`, `29224f3`, `ee87a2a`

  **Acceptance Criteria**:
  - [ ] `bun test` passes (exit code 0)
  - [ ] Test count recorded as baseline (~450+)
  - [ ] Modified files committed or explicitly excluded with rationale
  - [ ] `git status` shows clean working tree (or only intentionally-excluded files)

  **Agent-Executed QA Scenarios:**
  ```
  Scenario: Full test suite passes as baseline
    Tool: Bash
    Steps:
      1. Run: bun test
      2. Assert: exit code 0
      3. Record: total test count
    Expected Result: All tests pass
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `chore: commit pre-existing modifications before Wave 5`
  - Trailers: `Learning-Update: wave5-baseline`, `Risk-Level: low`

---

### Task 1: Create `opencode-safe-io` Shared Utility Package

- [ ] 1. Create `opencode-safe-io` package with shared safe I/O utilities

  **What to do**:
  1. **Create package directory**: `packages/opencode-safe-io/`
  2. **Create `package.json`**:
     ```json
     {
       "name": "opencode-safe-io",
       "version": "0.1.0",
       "type": "commonjs",
       "main": "src/index.js",
       "exports": {
         ".": {
           "require": "./src/index.js",
           "import": "./src/index.mjs"
         }
       }
     }
     ```
  3. **Create `src/index.js` (CJS primary)**:
     - `safeJsonParse(str, fallback, label)` — Parse JSON string with try/catch, log warning with label on failure, return fallback. Match config-loader's `safe-json-parse.js` signature but add: non-string input guard, max-size guard (reject strings > 50MB), console.warn with `[safeJsonParse]` prefix.
     - `safeJsonRead(filePath, fallback, label)` — Async: `await fs.promises.readFile(filePath, 'utf8')` → `safeJsonParse(content, fallback, label || filePath)`. Return fallback if file doesn't exist (ENOENT).
     - `safeJsonReadSync(filePath, fallback, label)` — Sync equivalent for constructors that can't use async. Marked `@deprecated` in JSDoc.
     - `SafeJSON.parse(str, fallback)` — Match crash-guard's `safe-json.js` API for drop-in replacement. Handles circular references.
     - `SafeJSON.stringify(obj, fallback)` — Safe stringify with circular reference detection. Match crash-guard's implementation.
     - `managedInterval(fn, ms, options)` — Wrapper around setInterval that: stores interval ID, calls `.unref()`, returns `{ id, stop() }` object. Options: `{ label: string }` for debugging.
     - `managedListener(emitter, event, handler, options)` — Wrapper that uses `.once()` by default. Options: `{ persistent: true }` for `.on()` with tracked cleanup. Returns `{ remove() }`.
  4. **Create `src/index.mjs` (ESM re-export wrapper)**:
     ```javascript
     import mod from './index.js';
     export const { safeJsonParse, safeJsonRead, safeJsonReadSync, SafeJSON, managedInterval, managedListener } = mod;
     export default mod;
     ```
  5. **Add to workspace**: Verify Bun workspace in root `package.json` includes `packages/*` glob
  6. **Create regression tests**: `packages/opencode-safe-io/test/index.test.js`:
     - safeJsonParse: valid JSON, broken JSON, empty string, null input, returns fallback
     - safeJsonRead: existing file, missing file (ENOENT), corrupted file
     - SafeJSON.parse: valid, broken, circular references
     - SafeJSON.stringify: normal object, circular reference
     - managedInterval: creates interval, .unref() is called, stop() clears interval
     - managedListener: .once() by default, persistent mode, remove() works
  7. **Run full test suite**: `bun test` must pass

  **Must NOT do**:
  - Do not add any dependencies on other workspace packages (leaf-only)
  - Do not add external npm dependencies (only Node.js built-ins: fs, path)
  - Do not add caching or memoization (keep it simple)
  - Do not add async initialization or singleton patterns (stateless utilities only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New package creation, multiple utility functions, comprehensive test suite
  - **Skills**: [`systematic-debugging`]
    - `systematic-debugging`: Verify CJS/ESM dual export works correctly across module systems

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 0)
  - **Parallel Group**: Wave 5A (with Tasks 4, 5)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: Task 0

  **References**:

  **Pattern References** (existing code to follow):
  - `packages/opencode-config-loader/src/safe-json-parse.js` — CJS safeJsonParse with labeled logging (lines 2-12). Copy this signature exactly for safeJsonParse.
  - `packages/opencode-crash-guard/src/safe-json.js` — ESM SafeJSON with circular ref handling (lines 51-122). Copy SafeJSON.parse and SafeJSON.stringify implementations.
  - `packages/opencode-config-loader/package.json` — Example CJS package.json structure to follow

  **Test References**:
  - `packages/opencode-config-loader/test/safe-json-parse.test.js` — Existing test pattern for safeJsonParse (4 tests, exact signatures to match)
  - `packages/opencode-crash-guard/tests/safe-json.test.js` — Existing test pattern for SafeJSON (8 tests)

  **Acceptance Criteria**:
  - [ ] Package exists: `ls packages/opencode-safe-io/package.json` → found
  - [ ] CJS importable: `bun -e "const s = require('./packages/opencode-safe-io/src/index.js'); console.log(typeof s.safeJsonParse)"` → `function`
  - [ ] ESM importable: `bun -e "import { safeJsonParse } from './packages/opencode-safe-io/src/index.mjs'; console.log(typeof safeJsonParse)"` → `function`
  - [ ] safeJsonParse handles broken JSON: `bun -e "const {safeJsonParse} = require('./packages/opencode-safe-io/src/index.js'); console.log(safeJsonParse('{broken', 'fallback'))"` → `fallback`
  - [ ] safeJsonRead handles missing file: `bun -e "const {safeJsonRead} = require('./packages/opencode-safe-io/src/index.js'); safeJsonRead('/nonexistent', {}).then(r => console.log(JSON.stringify(r)))"` → `{}`
  - [ ] managedInterval returns stoppable: `bun -e "const {managedInterval} = require('./packages/opencode-safe-io/src/index.js'); const t = managedInterval(()=>{}, 1000); console.log(typeof t.stop); t.stop()"` → `function`
  - [ ] Regression tests pass: `bun test packages/opencode-safe-io/` → all pass
  - [ ] Full suite passes: `bun test` → ~450+ tests, 0 failures

  **Agent-Executed QA Scenarios:**
  ```
  Scenario: CJS import works from another package
    Tool: Bash (bun -e)
    Steps:
      1. bun -e "const s = require('./packages/opencode-safe-io/src/index.js'); console.log(Object.keys(s).sort().join(','))"
      2. Assert: Output contains "SafeJSON,managedInterval,managedListener,safeJsonParse,safeJsonRead,safeJsonReadSync"
    Expected Result: All utilities exported
    Evidence: Terminal output captured

  Scenario: ESM import works
    Tool: Bash (bun -e)
    Steps:
      1. bun -e "import s from './packages/opencode-safe-io/src/index.mjs'; console.log(typeof s.safeJsonParse)"
      2. Assert: Output is "function"
    Expected Result: ESM re-export works
    Evidence: Terminal output captured

  Scenario: Broken JSON returns fallback with warning
    Tool: Bash (bun -e)
    Steps:
      1. bun -e "const {safeJsonParse} = require('./packages/opencode-safe-io/src/index.js'); console.log(safeJsonParse('{invalid', {ok:true}, 'test-label'))"
      2. Assert: Output is { ok: true }
      3. Assert: stderr contains "[safeJsonParse]" warning with "test-label"
    Expected Result: Fallback returned, warning logged with label
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `feat(safe-io): create opencode-safe-io shared utility package`
  - Files: `packages/opencode-safe-io/**`
  - Pre-commit: `bun test`
  - Trailers: `Learning-Update: opencode-safe-io-created`, `Risk-Level: low`

---

### Task 2: Migrate JSON.parse File-I/O Calls to safeJsonParse

- [ ] 2. Replace ~50 unguarded JSON.parse file-I/O calls with safeJsonParse/safeJsonRead

  **What to do**:

  **Phase A — Classification (MANDATORY before any changes):**
  1. Run `ast_grep_search` for all `JSON.parse` calls across packages/
  2. Classify each into categories:
     - **FILE-I/O** (~50): `JSON.parse(fs.readFileSync(...))` or `JSON.parse(content)` where content came from file read → **TARGET for migration**
     - **DEEP-CLONE** (~5): `JSON.parse(JSON.stringify(...))` → **SKIP** (not error-prone)
     - **CLIENT-SIDE** (~8): In React components, hooks, SSE handlers → **SKIP** (browser, not Node)
     - **DESERIALIZATION** (~10): Parsing API responses, DB columns → **CASE-BY-CASE** (already in try/catch = skip)
     - **VERIFICATION** (~2): In write-json-atomic.ts → **SKIP** (intentional integrity check)
  3. Record classification in task notes for audit trail

  **Phase B — Migration of double-danger patterns first:**
  4. Target the 11 `JSON.parse(fs.readFileSync(...))` double-danger patterns:
     - `feature-flags/index.js:18`
     - `plugin-lifecycle/index.js:111`
     - `thompson-sampling-router.js:37`
     - `meta-awareness-tracker.js:51`
     - `tool-usage-tracker.js:215` (deprecated sync path)
     - `plugin-healthd/checks.js:203`
     - `proofcheck/checks.js:45`
     - `positive-patterns.js:246, 262`
     - `runbooks/remedies.js:37`
     - `tier-resolver.js:45`
     - `dynamic-exploration-controller.js:264`
  5. For each: `const { safeJsonParse } = require('opencode-safe-io');` at top, then replace `JSON.parse(fs.readFileSync(path, 'utf8'))` with `safeJsonParse(fs.readFileSync(path, 'utf8'), fallbackValue, 'descriptive-label')`
  6. Choose appropriate fallback: `{}` for config objects, `[]` for arrays, `null` for optional data

  **Phase C — Migration of remaining file-I/O JSON.parse:**
  7. Target remaining ~40 `JSON.parse(content)` where content came from file read but in separate statement
  8. Same pattern: add import, replace with safeJsonParse, add label
  9. For files that already use a local safeJsonParse (meta-awareness-tracker.js, sqlite-reader.ts), replace local implementation with import from opencode-safe-io

  **Phase D — Tests and verification:**
  10. Run `ast_grep_search` for remaining `JSON.parse(fs.readFileSync` patterns — expect 0 (excluding write-json-atomic.ts)
  11. Add regression test verifying safeJsonParse is importable from at least 3 consumer packages
  12. Run full test suite

  **Must NOT do**:
  - Do not replace `JSON.parse(JSON.stringify(...))` deep-clone patterns
  - Do not replace JSON.parse in client-side React components
  - Do not replace JSON.parse in write-json-atomic.ts (intentional verification)
  - Do not replace JSON.parse that is already inside a try/catch with proper error handling
  - Do not change function signatures or return types

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 50+ files to modify, needs classification pass, risk of breaking consumer code
  - **Skills**: [`systematic-debugging`]
    - `systematic-debugging`: Verify each migration doesn't change behavior

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1)
  - **Parallel Group**: Wave 5B (with Tasks 3, 7)
  - **Blocks**: None
  - **Blocked By**: Task 1 (opencode-safe-io must exist)

  **References**:

  **Pattern References:**
  - `packages/opencode-config-loader/src/index.js:146` — Existing safeJsonParse usage pattern: `return safeJsonParse(content, {}, configFile)`
  - `packages/opencode-crash-guard/src/crash-recovery.js:56` — Existing SafeJSON.parse usage: `this.crashes = SafeJSON.parse(data, [])`

  **Target Files (Phase B — double-danger patterns):**
  - `packages/opencode-feature-flags/src/index.js:18` — `this.flags = JSON.parse(data)` → `this.flags = safeJsonParse(data, {}, 'feature-flags')`
  - `packages/opencode-plugin-lifecycle/src/index.js:111` — `JSON.parse(fs.readFileSync(this.statePath, 'utf8'))` → `safeJsonParse(fs.readFileSync(this.statePath, 'utf8'), {}, 'plugin-lifecycle-state')`
  - `packages/opencode-model-router-x/src/thompson-sampling-router.js:37` — config parse
  - `packages/opencode-learning-engine/src/meta-awareness-tracker.js:51` — rollups parse
  - `packages/opencode-learning-engine/src/tool-usage-tracker.js:215` — deprecated readJsonSync
  - `packages/opencode-plugin-healthd/src/checks.js:203` — config parse
  - `packages/opencode-proofcheck/src/checks.js:45` — package.json parse
  - `packages/opencode-learning-engine/src/positive-patterns.js:246,262` — pattern data
  - `packages/opencode-runbooks/src/remedies.js:37` — remediation config
  - `packages/opencode-plugin-preload-skills/src/tier-resolver.js:45` — tier config
  - `packages/opencode-model-router-x/src/dynamic-exploration-controller.js:264` — exploration config

  **Acceptance Criteria**:
  - [ ] Zero double-danger patterns: `bun -e "const {execSync} = require('child_process'); const r = execSync('grep -r \"JSON.parse(fs.readFileSync\" packages/ --include=\"*.js\" --include=\"*.ts\" -l', {encoding:'utf8'}).trim(); const files = r.split('\\n').filter(f => !f.includes('write-json-atomic') && !f.includes('test') && !f.includes('.next') && !f.includes('node_modules')); console.log(files.length)"` → `0`
  - [ ] opencode-safe-io imported in target files: `grep -r "require.*opencode-safe-io\\|from.*opencode-safe-io" packages/ --include="*.js" --include="*.ts" | grep -v test | grep -v node_modules | wc -l` → ≥ 10
  - [ ] Full suite passes: `bun test` → 0 failures

  **Agent-Executed QA Scenarios:**
  ```
  Scenario: Zero unguarded JSON.parse(fs.readFileSync) in production code
    Tool: Bash (grep + filter)
    Steps:
      1. grep -rn "JSON.parse(fs.readFileSync" packages/ --include="*.js" --include="*.ts" | grep -v "write-json-atomic" | grep -v "test" | grep -v ".next" | grep -v "node_modules"
      2. Assert: No output (empty = all migrated)
    Expected Result: Zero double-danger patterns remain
    Evidence: grep output captured

  Scenario: Corrupted config file doesn't crash feature-flags
    Tool: Bash (bun -e)
    Steps:
      1. Create temp file with broken JSON
      2. Import feature-flags, point to broken file
      3. Assert: No throw, returns default flags
    Expected Result: Graceful degradation on corrupt config
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `fix(safe-io): migrate 50+ unguarded JSON.parse to safeJsonParse`
  - Pre-commit: `bun test`
  - Trailers: `Learning-Update: json-parse-migration`, `Risk-Level: medium`

---

### Task 3: Convert Dashboard Sync I/O to Async

- [ ] 3. Convert 32 sync I/O calls in dashboard API routes to async

  **What to do**:

  **Phase A — Write paths first (highest failure risk):**
  1. **`event-store.js`** (6 sync calls): Convert `atomicWrite()` to async. Replace `writeFileSync` → `await fsPromises.writeFile`, `renameSync` → `await fsPromises.rename`, `existsSync` → `await fsPromises.access().then(()=>true).catch(()=>false)`, `unlinkSync` → `await fsPromises.unlink`. Add write queue (`_writePromise` chain pattern from tool-usage-tracker Wave 4) to prevent concurrent write corruption. Update all callers to await.
  2. **`write-json-atomic.ts`** (3 sync calls to convert, 1 to KEEP): Convert `mkdirSync` → `await fsPromises.mkdir`, `writeFileSync(tempPath)` → `await fsPromises.writeFile(tempPath)`, `renameSync` → `await fsPromises.rename`. **KEEP** `JSON.parse(fs.readFileSync(tempPath))` as sync — this is intentional verification that the write succeeded before rename. Make function async, update all callers.

  **Phase B — Read paths (route handlers):**
  3. **`learning/route.ts`** (4 sync calls): Replace `existsSync` → async check, `readFileSync` → `await fsPromises.readFile`
  4. **`rl/route.ts`** (4 sync calls): Same pattern
  5. **`frontier-status/route.ts`** (2 sync calls): Same pattern
  6. **`policy-review/route.ts`** (2 sync calls): Same pattern
  7. **`retrieval-quality/route.ts`** (2 sync calls): Same pattern

  **Phase C — Library files:**
  8. **`meta-awareness.ts`** (4 sync calls): Convert to async, update all importers
  9. **`data-sources/index.ts`** (1 sync call): Convert existsSync to async

  **Phase D — Tests and verification:**
  10. Run grep to verify zero sync I/O in dashboard API routes (excluding write-json-atomic.ts verification read)
  11. Add regression tests for event-store.js async atomicWrite
  12. Run full test suite

  **Must NOT do**:
  - Do not convert `JSON.parse(fs.readFileSync(tempPath))` in write-json-atomic.ts — intentional verification
  - Do not add caching to any route (route-level caching already exists where needed)
  - Do not change API response shapes
  - Do not touch route.ts files in orchestration/ (already converted in Wave 4)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 9 files, write-path requires write queue, must preserve atomicity guarantees
  - **Skills**: [`systematic-debugging`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1)
  - **Parallel Group**: Wave 5B (with Tasks 2, 7)
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:

  **Pattern References:**
  - `packages/opencode-dashboard/src/app/api/orchestration/lib/correlation.js` — Wave 4 async conversion gold standard. Shows `fsPromises.readdir`, `fsPromises.stat`, `fsPromises.readFile` pattern.
  - `packages/opencode-learning-engine/src/tool-usage-tracker.js:238-260` — Wave 4 `writeJsonAsync()` with atomic tmp+rename and `_writePromise` queue

  **Target Files:**
  - `packages/opencode-dashboard/src/app/api/orchestration/lib/event-store.js` — Primary: atomicWrite (lines 34-58) → async with write queue
  - `packages/opencode-dashboard/src/app/api/_lib/write-json-atomic.ts` — 3 of 4 sync calls converted; line 13 verification read STAYS sync
  - `packages/opencode-dashboard/src/app/api/learning/route.ts` — 4 sync calls (lines 109, 118, 171-182)
  - `packages/opencode-dashboard/src/app/api/rl/route.ts` — 4 sync calls (lines 159, 164, 216, 225)
  - `packages/opencode-dashboard/src/app/api/frontier-status/route.ts` — 2 sync calls (lines 11-12)
  - `packages/opencode-dashboard/src/app/api/policy-review/route.ts` — 2 sync calls (lines 29-30)
  - `packages/opencode-dashboard/src/app/api/retrieval-quality/route.ts` — 2 sync calls (lines 28, 39)
  - `packages/opencode-dashboard/src/lib/meta-awareness.ts` — 4 sync calls (lines 20, 24, 32, 36)
  - `packages/opencode-dashboard/src/lib/data-sources/index.ts` — 1 sync call (line 11)

  **Acceptance Criteria**:
  - [ ] Zero sync I/O in API routes: `grep -rn "readFileSync\|writeFileSync\|readdirSync\|statSync\|mkdirSync\|renameSync\|unlinkSync\|existsSync" packages/opencode-dashboard/src/app/api/ --include="*.ts" --include="*.js" | grep -v "write-json-atomic.ts:13" | grep -v node_modules | wc -l` → `0`
  - [ ] Zero sync I/O in lib: `grep -rn "readFileSync\|writeFileSync\|existsSync" packages/opencode-dashboard/src/lib/ --include="*.ts" | wc -l` → `0`
  - [ ] event-store has write queue: `grep -c "_writePromise\|writeQueue" packages/opencode-dashboard/src/app/api/orchestration/lib/event-store.js` → ≥ 1
  - [ ] write-json-atomic verification read preserved: `grep "JSON.parse(fs.readFileSync(tempPath" packages/opencode-dashboard/src/app/api/_lib/write-json-atomic.ts` → match found
  - [ ] Full suite passes: `bun test` → 0 failures

  **Agent-Executed QA Scenarios:**
  ```
  Scenario: Zero sync I/O in dashboard API routes
    Tool: Bash (grep)
    Steps:
      1. grep -rn "readFileSync\|writeFileSync\|readdirSync\|renameSync\|unlinkSync\|mkdirSync\|existsSync" packages/opencode-dashboard/src/app/api/ --include="*.ts" --include="*.js" | grep -v "write-json-atomic.ts:13" | grep -v node_modules
      2. Assert: No output (or only the intentional verification read)
    Expected Result: All sync I/O converted to async
    Evidence: grep output captured

  Scenario: event-store atomicWrite is now async
    Tool: Bash (grep)
    Steps:
      1. grep "async.*atomicWrite\|await.*fsPromises" packages/opencode-dashboard/src/app/api/orchestration/lib/event-store.js
      2. Assert: Matches found (async keyword + fsPromises usage)
    Expected Result: atomicWrite converted to async
    Evidence: grep output captured
  ```

  **Commit**: YES
  - Message: `perf(dashboard): convert 32 sync I/O calls to async in API routes`
  - Pre-commit: `bun test`
  - Trailers: `Learning-Update: dashboard-async-migration`, `Risk-Level: medium`

---

### Task 4: Fix setInterval .unref() + Rate-Limit Bounded Map

- [ ] 4. Add .unref() to 3 setInterval calls and bound rate-limit Map

  **What to do**:
  1. **`memory-guard.js:214`**: Add `this.interval.unref();` after the setInterval call
  2. **`crash-recovery.js:40`**: Add `this.saveInterval.unref();` after the setInterval call
  3. **`rate-limit.ts:22`**: Add `.unref()` to the cleanup interval. Also:
     - Add `MAX_ENTRIES = 10000` constant
     - Before `requestCounts.set(key, ...)`, check `requestCounts.size >= MAX_ENTRIES` and evict oldest entries
     - This prevents unbounded Map growth under diverse traffic
  4. Add regression tests for each fix
  5. Run full test suite

  **Must NOT do**:
  - Do not change memory-guard check logic or thresholds
  - Do not change crash-recovery save logic
  - Do not change rate-limit algorithm or window calculations

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`systematic-debugging`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5A (with Tasks 1, 5)
  - **Blocks**: None
  - **Blocked By**: Task 0

  **References**:
  - `packages/opencode-health-check/src/index.js:141-143` — Wave 4 .unref() pattern
  - `packages/opencode-model-manager/src/monitoring/metrics-collector.js:480` — .unref() on cleanup timer

  **Target Files:**
  - `packages/opencode-crash-guard/src/memory-guard.js:214` — setInterval without .unref()
  - `packages/opencode-crash-guard/src/crash-recovery.js:40` — setInterval without .unref()
  - `packages/opencode-dashboard/src/app/api/_lib/rate-limit.ts:2,22` — unbounded Map + setInterval without .unref()

  **Acceptance Criteria**:
  - [ ] All setInterval have .unref(): `grep -A2 "setInterval" packages/opencode-crash-guard/src/memory-guard.js packages/opencode-crash-guard/src/crash-recovery.js packages/opencode-dashboard/src/app/api/_lib/rate-limit.ts | grep "unref" | wc -l` → `3`
  - [ ] Rate-limit has max size: `grep -c "MAX_ENTRIES\|maxSize\|max_entries" packages/opencode-dashboard/src/app/api/_lib/rate-limit.ts` → ≥ 1
  - [ ] Full suite passes: `bun test` → 0 failures

  **Commit**: YES
  - Message: `fix(lifecycle): add .unref() to 3 setInterval calls, bound rate-limit Map`
  - Trailers: `Learning-Update: timer-unref-fixes`, `Risk-Level: low`

---

### Task 5: Fix Child Process Listener Leaks

- [ ] 5. Replace .on() with .once() for child process event handlers

  **What to do**:
  1. **`spawn-guard.js`** (lines 90, 96, 101, 124): Replace `proc.stdout.on('data', ...)` → keep as `.on()` (streaming data, multiple events). Replace `proc.on('error', ...)` → `.once('error', ...)`. Replace `proc.on('close', ...)` → `.once('close', ...)`. In the `.once('close')` handler, add `proc.stdout.removeAllListeners('data'); proc.stderr.removeAllListeners('data');` to clean up data listeners.
  2. **`process-isolation.js`** (lines 71, 75, 79, 108): Same pattern — keep `.on('data')` for stdout/stderr streaming, change `child.on('close')` → `.once('close')`, `child.on('error')` → `.once('error')`. Clean up data listeners in close handler.
  3. **`model-assessor.js`** (lines 559, 563, 567, 571): Same pattern.
  4. Add regression tests verifying listener cleanup
  5. Run full test suite

  **Must NOT do**:
  - Do not change stdout/stderr `.on('data')` to `.once()` — these receive multiple events during streaming
  - Do not change spawn options or process behavior
  - Do not add timeout handling (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`systematic-debugging`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5A (with Tasks 1, 4)
  - **Blocks**: None
  - **Blocked By**: Task 0

  **References**:
  - `packages/opencode-model-manager/src/adapters/base-adapter.js:713` — Correct pattern: `addEventListener('abort', onAbort, { once: true })`
  - `packages/opencode-crash-guard/src/shutdown-manager.js:224-230` — process.on for uncaughtException (these are intentional permanent listeners — SKIP)

  **Target Files:**
  - `packages/opencode-crash-guard/src/spawn-guard.js:90,96,101,124`
  - `packages/opencode-crash-guard/src/process-isolation.js:71,75,79,108`
  - `packages/opencode-model-manager/src/assessment/model-assessor.js:559,563,567,571`

  **Acceptance Criteria**:
  - [ ] close/error use .once(): `grep "\.on('close'\|\.on('error'" packages/opencode-crash-guard/src/spawn-guard.js packages/opencode-crash-guard/src/process-isolation.js packages/opencode-model-manager/src/assessment/model-assessor.js | wc -l` → `0`
  - [ ] data listeners cleaned up: `grep "removeAllListeners\|removeListener" packages/opencode-crash-guard/src/spawn-guard.js packages/opencode-crash-guard/src/process-isolation.js packages/opencode-model-manager/src/assessment/model-assessor.js | wc -l` → ≥ 3
  - [ ] Full suite passes: `bun test` → 0 failures

  **Commit**: YES
  - Message: `fix(lifecycle): replace .on() with .once() for child process close/error handlers`
  - Trailers: `Learning-Update: listener-leak-fixes`, `Risk-Level: low`

---

### Task 6: Fix Genuinely Problematic Empty Catch Blocks

- [ ] 6. Add error logging to the ~2 genuinely problematic empty catch blocks

  **What to do**:
  1. **Identify truly problematic catches** — NOT the intentional fire-and-forget patterns. Target ONLY:
     - `event-store.js:44` — `catch {}` swallowing cleanup error after write failure
     - `event-store.js:55` — `catch {}` swallowing cleanup error after rename failure
  2. Replace with: `catch (cleanupErr) { console.warn('[event-store] cleanup failed:', cleanupErr.message); }`
  3. Run full test suite

  **Must NOT do**:
  - Do not replace `.catch(() => {})` in tool-usage-tracker.js (Wave 4 intentional)
  - Do not replace `.catch(() => {})` in model-manager write queues (intentional)
  - Do not replace `.catch(() => {})` in dashboard safe-fallback patterns (intentional)
  - Do not replace `catch (_) {}` in test cleanup (test-only, low risk)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5C (with Tasks 8, 9)
  - **Blocks**: None
  - **Blocked By**: Task 0

  **References**:
  - `packages/opencode-dashboard/src/app/api/orchestration/lib/event-store.js:44,55` — Target catch blocks

  **Acceptance Criteria**:
  - [ ] event-store catches log errors: `grep -c "console.warn\|console.error" packages/opencode-dashboard/src/app/api/orchestration/lib/event-store.js` → ≥ 2 (new warnings)
  - [ ] Full suite passes: `bun test` → 0 failures

  **Commit**: YES (groups with Task 3 if same file)
  - Message: `fix(dashboard): add error logging to event-store catch blocks`
  - Trailers: `Learning-Update: error-observability`, `Risk-Level: low`

---

### Task 7: Wire Orphan Modules

- [ ] 7. Implement getSchedulerTelemetry + export tool-usage-tracker from learning-engine

  **What to do**:
  1. **`health-check/index.js`** — Implement `getSchedulerTelemetry()` function. This should return telemetry data about health check scheduling: interval counts, last check times, check durations. Check what `scripts/perf/fg08-poll-coordination.mjs` expects from it. Add to module.exports.
  2. **`learning-engine/src/index.js`** — Add `const toolUsageTracker = require('./tool-usage-tracker');` and add to module.exports: `toolUsageTracker` (or re-export individual functions). This makes tool-usage-tracker accessible to external consumers.
  3. Add regression tests for getSchedulerTelemetry
  4. Run full test suite

  **Must NOT do**:
  - Do not modify tool-usage-tracker.js itself (already converted in Wave 4)
  - Do not modify orchestration-advisor.js (already uses tool-usage-tracker internally)
  - Do not change existing learning-engine API contract (only ADD exports)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5B (with Tasks 2, 3)
  - **Blocks**: None
  - **Blocked By**: Task 0

  **References**:
  - `scripts/perf/fg08-poll-coordination.mjs` — Consumer of getSchedulerTelemetry (check expected signature/return shape)
  - `packages/opencode-health-check/src/index.js` — Current exports (11 functions, line ~389)
  - `packages/opencode-learning-engine/src/index.js:768` — Current module.exports

  **Acceptance Criteria**:
  - [ ] getSchedulerTelemetry exported: `grep "getSchedulerTelemetry" packages/opencode-health-check/src/index.js | grep -c "export\|module.exports"` → ≥ 1
  - [ ] tool-usage-tracker accessible: `bun -e "const le = require('./packages/opencode-learning-engine/src/index.js'); console.log(typeof le.toolUsageTracker?.logInvocation)"` → `function`
  - [ ] Full suite passes: `bun test` → 0 failures

  **Commit**: YES
  - Message: `feat(wiring): implement getSchedulerTelemetry, export tool-usage-tracker`
  - Trailers: `Learning-Update: orphan-module-wiring`, `Risk-Level: low`

---

### Task 8: Security Hardening — Command Injection Prevention

- [ ] 8. Fix 3 command injection vectors in pr-generator.js

  **What to do**:
  1. **`pr-generator.js:64`** — Replace `execSync(\`git checkout -b ${branchName}\`)` with `execFileSync('git', ['checkout', '-b', branchName], { cwd: this.repoPath })`
  2. **`pr-generator.js:135`** — Replace `execSync(\`git commit -m "${commitMessage}"\`)` with `execFileSync('git', ['commit', '-m', commitMessage], { cwd: this.repoPath })`
  3. **`pr-generator.js:146`** — Replace `execSync(\`git push -u origin ${branchName}\`)` with `execFileSync('git', ['push', '-u', 'origin', branchName], { cwd: this.repoPath })`
  4. Import `execFileSync` from `child_process`
  5. Add regression test verifying shell metacharacters in branch names don't execute
  6. Run full test suite

  **Must NOT do**:
  - Do not touch proofcheck/checks.js — its exec() calls use hardcoded strings (Metis verified)
  - Do not change git add command at line 132 (uses hardcoded file path, not user input)
  - Do not add input validation/sanitization (the execFileSync array form IS the fix)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5C (with Tasks 6, 9)
  - **Blocks**: None
  - **Blocked By**: Task 0

  **References**:
  - `packages/opencode-model-manager/src/automation/pr-generator.js:64,132,135,146` — Target injection vectors

  **Acceptance Criteria**:
  - [ ] Zero string-interpolated execSync: `grep -c "execSync.*\\\${" packages/opencode-model-manager/src/automation/pr-generator.js` → `0`
  - [ ] Uses execFileSync: `grep -c "execFileSync" packages/opencode-model-manager/src/automation/pr-generator.js` → ≥ 3
  - [ ] Full suite passes: `bun test` → 0 failures

  **Commit**: YES
  - Message: `security(model-manager): fix command injection in pr-generator execSync calls`
  - Trailers: `Learning-Update: command-injection-fix`, `Risk-Level: medium`

---

### Task 9: Environment Variable Validation

- [ ] 9. Add startup validation for security-critical env vars in dashboard

  **What to do**:
  1. **`policy-sim/route.ts`** — Add validation for `OPENCODE_EVENT_SIGNING_KEY`: if in production mode (`NODE_ENV=production`) and signing mode requires valid signatures, warn if key is empty
  2. **`write-access.ts`** — Add validation: if `WRITE_TOKEN_ENV` resolves to empty string, log warning at import time (not per-request)
  3. Run full test suite

  **Must NOT do**:
  - Do not throw errors on missing env vars (would break development environments)
  - Do not add env var requirements for non-security vars
  - Do not modify the rate-limit or auth logic itself

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5C (with Tasks 6, 8)
  - **Blocks**: None
  - **Blocked By**: Task 0

  **References**:
  - `packages/opencode-dashboard/src/app/api/orchestration/policy-sim/route.ts:66,106` — OPENCODE_EVENT_SIGNING_KEY usage
  - `packages/opencode-dashboard/src/app/api/_lib/write-access.ts:115,142` — WRITE_TOKEN_ENV usage

  **Acceptance Criteria**:
  - [ ] Env var validation exists: `grep -c "warn.*SIGNING_KEY\|warn.*WRITE_TOKEN\|warn.*missing\|warn.*empty" packages/opencode-dashboard/src/app/api/_lib/write-access.ts packages/opencode-dashboard/src/app/api/orchestration/policy-sim/route.ts` → ≥ 2
  - [ ] Full suite passes: `bun test` → 0 failures

  **Commit**: YES
  - Message: `security(dashboard): add env var validation for signing key and write token`
  - Trailers: `Learning-Update: env-validation`, `Risk-Level: low`

---

## Commit Strategy

| After Task | Message | Key Files | Verification |
|------------|---------|-----------|--------------|
| 0 | `chore: commit pre-existing modifications before Wave 5` | 6+ modified files | `bun test` |
| 1 | `feat(safe-io): create opencode-safe-io shared utility package` | packages/opencode-safe-io/** | `bun test` |
| 2 | `fix(safe-io): migrate 50+ unguarded JSON.parse to safeJsonParse` | 11+ files across packages | `bun test` |
| 3 | `perf(dashboard): convert 32 sync I/O calls to async in API routes` | 9 dashboard files | `bun test` |
| 4 | `fix(lifecycle): add .unref() to 3 setInterval calls, bound rate-limit Map` | 3 files | `bun test` |
| 5 | `fix(lifecycle): replace .on() with .once() for child process close/error` | 3 files | `bun test` |
| 6 | `fix(dashboard): add error logging to event-store catch blocks` | event-store.js | `bun test` |
| 7 | `feat(wiring): implement getSchedulerTelemetry, export tool-usage-tracker` | health-check, learning-engine | `bun test` |
| 8 | `security(model-manager): fix command injection in pr-generator execSync` | pr-generator.js | `bun test` |
| 9 | `security(dashboard): add env var validation for signing key and write token` | 2 dashboard files | `bun test` |

All commits use Wave 1-4 trailer format: `Learning-Update:` + `Risk-Level:`.

---

## Success Criteria

### Verification Commands
```bash
# 1. All tests pass
bun test
# Expected: ~460+ tests (baseline + new regression tests), 0 failures

# 2. opencode-safe-io importable
bun -e "const s = require('./packages/opencode-safe-io/src/index.js'); console.log(typeof s.safeJsonParse)"
# Expected: function

# 3. Zero unguarded JSON.parse(fs.readFileSync) in production code
grep -rn "JSON.parse(fs.readFileSync" packages/ --include="*.js" --include="*.ts" | grep -v "write-json-atomic" | grep -v test | grep -v .next | grep -v node_modules | wc -l
# Expected: 0

# 4. Zero sync I/O in dashboard API routes
grep -rn "readFileSync\|writeFileSync\|readdirSync\|statSync\|mkdirSync\|renameSync\|unlinkSync\|existsSync" packages/opencode-dashboard/src/app/api/ --include="*.ts" --include="*.js" | grep -v "write-json-atomic.ts:13" | grep -v node_modules | wc -l
# Expected: 0

# 5. All setInterval have .unref()
grep -B1 -A2 "setInterval" packages/opencode-crash-guard/src/ packages/opencode-dashboard/src/app/api/_lib/rate-limit.ts --include="*.js" --include="*.ts" | grep "unref" | wc -l
# Expected: >= 3

# 6. Zero string-interpolated execSync
grep -c "execSync.*\${" packages/opencode-model-manager/src/automation/pr-generator.js
# Expected: 0

# 7. getSchedulerTelemetry exported
grep "getSchedulerTelemetry" packages/opencode-health-check/src/index.js | wc -l
# Expected: >= 2 (definition + export)
```

### Final Checklist
- [ ] All "Must Have" present (shared utility, async I/O, timer cleanup, listener cleanup, security fixes)
- [ ] All "Must NOT Have" absent (no replacing intentional catch patterns, no converting verification reads, no touching proofcheck)
- [ ] All existing tests pass (baseline preserved)
- [ ] New regression tests added for each task
- [ ] Commits follow Wave 1-4 pattern with Learning-Update trailers
