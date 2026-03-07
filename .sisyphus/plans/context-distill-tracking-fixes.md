# Context7 / Distill / Skill Tracking Fixes

## TL;DR

> **Quick Summary**: Fix four interconnected gaps found during a deep audit: resurrect dead telemetry infrastructure (tool-usage-tracker has zero consumers and logInvocation isn't exported), create a production lifecycle for SkillRLManager (it only runs in tests) and standardize its path, expand RL tracking from 5 to all 29 registered skills, and add explicit MCP calling conventions to the skill files agents actually read.
>
> **Deliverables**:
> - `tool-usage-tracker.js` verified functional, `logInvocation` exported, module wired to first consumer
> - SkillRLManager instantiated in production (oh-my-opencode plugin hook), unified path `~/.opencode/skill-rl.json`
> - SkillRLManager seeded with all 29 registry.json skills additively on startup
> - `tool-execute-after.ts` hook calls `logInvocation` for MCP tool calls (fire-and-forget)
> - `research-builder/SKILL.md` and `budget-aware-router/SKILL.md` updated with explicit tool-call steps
> - All integration tests green, zero stale path references remain
>
> **Estimated Effort**: Medium–Large (3–5 hours execution)
> **Parallel Execution**: YES — Tasks 4 and 5 run in parallel in Wave 3
> **Critical Path**: Task 1 → Task 2 → Task 3 + Task 4 → Task 5 (tests)

---

## Context

### Original Request
Full audit revealed Context7 and Distill MCP servers are registered and enabled but never invoked. Deeper investigation exposed that the skill RL tracking system has no production consumers, tracks only 5 of 29 registered skills, and has a three-way file path fragmentation. The telemetry function (`logInvocation`) exists but is dead code.

### Key Audit Findings (pre-planning research)

**Issue 1 — No calling conventions in skill files**:
- `research-builder/SKILL.md:51` says "Use Context7 for library docs" — no method names
- Zero SKILL.md files mention `browse_tools`, `run_tool`, or any Distill methods
- `create-agent-skills` (compound-engineering plugin) already has correct context7 syntax — propagate it
- Distill runs `--lazy` — cold start ~2s on first call; skill must warn agents

**Issue 2 — RL tracking covers only 5/29 skills**:
- `skill-rl-state.json` has 5 skills: systematic-debugging (count:0), brainstorming (count:0), test-driven-development (count:3), verification-before-completion (count:3), incremental-implementation (count:3)
- `opencode-config/skills/registry.json` defines **29 skills** (not 22 — Metis correction)
- Seedbank is a static array in `packages/opencode-skill-rl-manager/src/skill-bank.js` — never synced with registry

**Issue 3 — RL state path fragmentation (3 divergent paths)**:

| Component | Path Used | Status |
|-----------|-----------|--------|
| `opencode-skill-rl-manager/src/index.js:130` (WRITER) | `./skill-rl-state.json` | ❌ relative |
| `packages/opencode-dashboard/src/app/api/rl/route.ts:218` | `~/.opencode/skill-rl.json` | ✅ canonical |
| `packages/opencode-dashboard/src/app/api/memory-graph/route.ts` | `~/.opencode/skill-rl.json` | ✅ canonical |
| `packages/opencode-dashboard/src/app/api/models/route.ts:156` | `~/.opencode/skill-rl-state.json` | ❌ wrong suffix |
| `packages/opencode-dashboard/src/app/api/events/route.ts` | `~/.opencode/skill-rl-state.json` | ❌ wrong suffix |
| `integration-tests/skillrl-api-regression.test.js:10` | `~/.opencode/skill-rl.json` | ✅ canonical |

**CRITICAL — Metis correction**: SkillRLManager is ONLY imported by 5 test files. No production code instantiates it. The path mismatch doesn't matter if nothing runs. Fix 3 must also create a production entry point.

**Issue 4 — MCP invocation tracking is dead code**:
- `logInvocation()` exists at `tool-usage-tracker.js:167` but is NOT in `module.exports` (line 614)
- `tool-usage-tracker.js` is imported by **zero files** in the entire codebase
- `readJsonAsync()` and `initAsync()` are called inside `logInvocation` but their definitions are unverified — may be broken
- `AVAILABLE_TOOLS` already correctly registers `context7_resolve_library_id`, `context7_query_docs`, and `distill` (lines 65–66, 75) — correct intent, broken execution

### Corrected Dependency Order (Metis recommendation)

```
Original (WRONG):  Fix1 → Fix3 → Fix2 → Fix4
Corrected (RIGHT): smoke-test → Fix4-resurrect → Fix3+entry-point → Fix2-seed → Fix1-docs → tests
```

Rationale: can't wire tracking (Fix 4) onto dead code; can't expand seedbank (Fix 2) without a production consumer (Fix 3); calling conventions (Fix 1) are most independent, do last.

---

## Work Objectives

### Core Objective
Resurrect and connect the skill tracking pipeline — starting from broken infrastructure (dead code, test-only consumers, fragmented paths) up through populated RL state — then document Context7 and Distill usage for agents.

### Concrete Deliverables
1. `packages/opencode-learning-engine/src/tool-usage-tracker.js` — `logInvocation` exported; module verified functional
2. `local/oh-my-opencode/src/plugin.ts` or equivalent — SkillRLManager instantiated in production with canonical path
3. `packages/opencode-skill-rl-manager/src/index.js` — default path fixed + migration logic + `syncWithRegistry()` method
4. `packages/opencode-dashboard/src/app/api/models/route.ts` — path corrected to `skill-rl.json`
5. `packages/opencode-dashboard/src/app/api/events/route.ts` — watcher path corrected to `skill-rl.json`
6. `packages/opencode-skill-rl-manager/src/skill-bank.js` or `index.js` — seeds 29 registry skills additively
7. `local/oh-my-opencode/src/plugin/tool-execute-after.ts` — fires `logInvocation` for MCP tool calls
8. `opencode-config/skills/research-builder/SKILL.md` — explicit context7 workflow steps
9. `opencode-config/skills/budget-aware-router/SKILL.md` — explicit distill invocation steps
10. `opencode-config/system-prompts.md` — global distill threshold rule

### Definition of Done
- [ ] `node -e "const t = require('./packages/opencode-learning-engine/src/tool-usage-tracker.js'); console.log(typeof t.logInvocation)"` → `function`
- [ ] `grep -rn "skill-rl-state" packages/ integration-tests/ --include="*.ts" --include="*.js" | grep -v node_modules | grep -v ".next"` → zero matches
- [ ] `cat ~/.opencode/skill-rl.json | jq '.skillBank.general | length'` → ≥ 29
- [ ] `bun test` → all tests pass (≥253)
- [ ] `grep -n "resolve-library-id" opencode-config/skills/research-builder/SKILL.md` → match found
- [ ] `grep -n "browse_tools" opencode-config/skills/budget-aware-router/SKILL.md` → match found

### Must Have
- `readJsonAsync` and `initAsync` inside `tool-usage-tracker.js` verified to exist/work before any wiring
- SkillRLManager instantiated in at least ONE production entry point using the canonical path
- Migration: if `./skill-rl-state.json` exists and canonical path doesn't, copy data before first write
- RL seeding is additive: existing usage_count/success_rate values are PRESERVED
- `logInvocation` wired fire-and-forget (never blocks agent execution)
- Tool method names verified against actual MCP tool descriptions before documenting in skill files

### Must NOT Have (Guardrails — Metis-derived)
- Do NOT redesign SkillRLManager, EvolutionEngine, or SkillBank classes
- Do NOT add calling conventions to more than 3 skill files (scope explosion risk)
- Do NOT seed compound-engineering plugin skills (~18) — only the 29 from `opencode-config/skills/registry.json`
- Do NOT build new MCP-specific latency metrics, dashboards, or sync mechanisms
- Do NOT modify `/api/rl/route.ts` or `/api/memory-graph/route.ts` — they already use the correct path
- Do NOT wire preload-skills → SkillRL (out of scope; never existed)
- Do NOT delete `./skill-rl-state.json` at repo root — leave as migration backup
- Do NOT rewrite `readJsonAsync`/`initAsync` if they're simply missing — ask/check before adding them

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (bun test, packages have test dirs)
- **Automated tests**: Tests-after for code changes; skill file changes via grep assertions
- **Framework**: bun test

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 — Sequential foundation:
└── Task 1: Smoke-test + resurrect tool-usage-tracker
             (verify loads, confirm readJsonAsync/initAsync, export logInvocation)

Wave 2 — Path + production entry point:
└── Task 2: Standardize RL state path + create production SkillRLManager entry point
             (depends on Task 1 being verified clean)

Wave 3 — Parallel implementation (both depend on Task 2):
├── Task 3: Seed SkillRLManager with all 29 registry skills
└── Task 4: Wire logInvocation into tool-execute-after MCP hook

Wave 4 — Documentation (independent, can start early but logically last):
└── Task 5: Add calling conventions to skill files (research-builder, budget-aware-router, system-prompts)

Wave 5 — Verification:
└── Task 6: Integration tests + regression sweep + stale doc cleanup

Critical Path: Task 1 → Task 2 → Task 3 → Task 6
Parallel Speedup: ~30% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Notes |
|------|------------|--------|-------|
| 1 | None | 2, 4 | Foundation — verify before building on it |
| 2 | 1 | 3, 4 | Must establish production lifecycle |
| 3 | 2 | 6 | Needs production path to exist |
| 4 | 1, 2 | 6 | Needs logInvocation exported + production consumer |
| 5 | None | 6 | Most independent; only needs tool name verification |
| 6 | 3, 4, 5 | None | Final verification sweep |

---

## TODOs

---

- [ ] 1. Smoke-test and resurrect tool-usage-tracker

  **What to do**:

  This task is a prerequisite for everything else. The tool-usage-tracker module may have broken internals and is currently dead code (never imported). Verify it first, fix if needed, then export `logInvocation`.

  **Step 1 — Verify the module loads cleanly**:
  ```bash
  node -e "require('./packages/opencode-learning-engine/src/tool-usage-tracker.js'); console.log('OK')"
  ```
  If this throws, read the error and trace the broken require/undefined function.

  **Step 2 — Locate `readJsonAsync` and `initAsync`**:
  These functions are called inside `logInvocation` (`await initAsync()` at line ~168, `readJsonAsync(INVOCATIONS_FILE, ...)` at line ~191). Search the file:
  ```bash
  grep -n "function readJsonAsync\|function initAsync\|const readJsonAsync\|const initAsync\|readJsonAsync =\|initAsync =" packages/opencode-learning-engine/src/tool-usage-tracker.js
  ```
  - **If they exist**: no action needed — the module is internally complete.
  - **If they are missing**: check if they're provided by `opencode-safe-io` (the only import: `const { safeJsonReadSync } = require('opencode-safe-io')`). If not there, implement minimal versions:
    ```js
    // Minimal readJsonAsync — reads file, returns parsed JSON or default
    async function readJsonAsync(filePath, defaultValue = {}) {
      try {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        const raw = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(raw);
      } catch (_) { return defaultValue; }
    }

    // Minimal initAsync — ensures DATA_DIR exists
    async function initAsync() {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
    }
    ```
    `DATA_DIR` and `INVOCATIONS_FILE` are already defined in the file (line ~28–30).

  **Step 3 — Export `logInvocation`**:
  Add to the existing `module.exports` block at the end of the file:
  ```js
  module.exports = {
    detectUnderUse,
    getUsageReport,
    startSession,
    endSession,
    logInvocation,    // ← ADD
    AVAILABLE_TOOLS,
    TOOL_APPROPRIATENESS_RULES
  };
  ```

  **Step 4 — Verify the export works**:
  ```bash
  node -e "const t = require('./packages/opencode-learning-engine/src/tool-usage-tracker.js'); console.log(typeof t.logInvocation);"
  # Expected: function
  ```

  **Step 5 — Smoke-test `logInvocation` actually writes**:
  ```bash
  node -e "
    const { logInvocation } = require('./packages/opencode-learning-engine/src/tool-usage-tracker.js');
    logInvocation('mcp_context7_resolve-library-id', {libraryName:'react'}, {libraryId:'npm:react'}, {source:'smoke-test'})
      .then(() => console.log('WRITE OK'))
      .catch(e => console.error('WRITE FAIL', e));
  "
  ```

  **Must NOT do**:
  - Do NOT rewrite the `logInvocation` function itself — only implement missing helpers if they are genuinely missing
  - Do NOT change the function signature of `logInvocation`
  - Do NOT modify AVAILABLE_TOOLS, TOOL_APPROPRIATENESS_RULES, or any other exported names

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires careful forensic investigation before touching anything; undefined functions could be a sign of missing requires or incomplete implementation
  - **Skills**: [`systematic-debugging`]
    - `systematic-debugging`: Read the error fully, trace the dependency chain before writing any code

  **Parallelization**:
  - **Can Run In Parallel**: NO — must complete before Tasks 2 and 4
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 4
  - **Blocked By**: Nothing

  **References**:

  **Primary file**:
  - `packages/opencode-learning-engine/src/tool-usage-tracker.js:1–30` — imports and constants
  - `packages/opencode-learning-engine/src/tool-usage-tracker.js:167–239` — `logInvocation` implementation
  - `packages/opencode-learning-engine/src/tool-usage-tracker.js:614–622` — current exports block

  **Dependency**:
  - `packages/opencode-safe-io/src/index.js` — check if `readJsonAsync` or `initAsync` is exported from here

  **Pattern reference** (fire-and-forget for future wiring):
  - `packages/opencode-learning-engine/src/orchestration-advisor.js` — `setImmediate(() => { bus.write(...).catch(() => {}); })` — replicate this pattern in Task 4

  **Acceptance Criteria**:

  ```
  Scenario: Module loads without errors
    Tool: Bash
    Steps:
      1. node -e "require('./packages/opencode-learning-engine/src/tool-usage-tracker.js'); console.log('OK')"
    Expected Result: "OK" printed, exit code 0
    Evidence: stdout

  Scenario: logInvocation is exported
    Tool: Bash
    Steps:
      1. node -e "const t = require('./packages/opencode-learning-engine/src/tool-usage-tracker.js'); console.log(typeof t.logInvocation);"
    Expected Result: "function"
    Evidence: stdout

  Scenario: logInvocation successfully writes an invocation record
    Tool: Bash
    Steps:
      1. node -e "const { logInvocation } = require('./packages/opencode-learning-engine/src/tool-usage-tracker.js'); logInvocation('mcp_context7_resolve-library-id', {libraryName:'react'}, {ok:true}, {source:'smoke-test'}).then(() => console.log('WRITE OK')).catch(e => console.error('FAIL', e.message));"
    Expected Result: "WRITE OK"
    Evidence: stdout

  Scenario: Learning engine tests still pass
    Tool: Bash
    Steps:
      1. bun test packages/opencode-learning-engine/
    Expected Result: all tests pass, 0 failures
    Evidence: bun test summary output
  ```

  **Commit**: YES
  - Message: `fix(telemetry): resurrect tool-usage-tracker — export logInvocation, verify internal helpers`
  - Files: `packages/opencode-learning-engine/src/tool-usage-tracker.js`

---

- [ ] 2. Standardize RL state path + create production SkillRLManager entry point

  **What to do**:

  Two things must happen together: fix all divergent path references, AND ensure SkillRLManager is actually instantiated somewhere in production (currently only in test files).

  **Sub-task A — Fix SkillRLManager default path**:

  In `packages/opencode-skill-rl-manager/src/index.js:130`:
  ```js
  // BEFORE:
  this.persistencePath = options.stateFile || './skill-rl-state.json'; // FIX: was setting stateFile but checking persistencePath

  // AFTER (remove the FIX comment too):
  const _defaultRLPath = path.join(os.homedir(), '.opencode', 'skill-rl.json');
  this.persistencePath = options.stateFile || _defaultRLPath;
  ```
  Verify `const os = require('os')` is present at the top (add if missing).

  **Sub-task B — Add migration logic** (in constructor, before `_loadState()` call):
  ```js
  // One-time migration: old ./skill-rl-state.json → canonical ~/.opencode/skill-rl.json
  const _legacyPath = path.join(process.cwd(), 'skill-rl-state.json');
  if (fs.existsSync(_legacyPath) && !fs.existsSync(this.persistencePath)) {
    try {
      fs.mkdirSync(path.dirname(this.persistencePath), { recursive: true });
      fs.copyFileSync(_legacyPath, this.persistencePath);
    } catch (_) { /* non-fatal */ }
  }
  ```

  **Sub-task C — Fix dashboard models API** (`packages/opencode-dashboard/src/app/api/models/route.ts:156`):
  ```ts
  // BEFORE:
  const rlStatePath = path.join(os.homedir(), '.opencode', 'skill-rl-state.json');
  // AFTER:
  const rlStatePath = path.join(os.homedir(), '.opencode', 'skill-rl.json');
  ```

  **Sub-task D — Fix dashboard events/file watcher** (`packages/opencode-dashboard/src/app/api/events/route.ts`):
  Find the `rlState` entry in the `watchPaths` object — change `skill-rl-state.json` → `skill-rl.json`.
  After editing, run `bun run build` from `packages/opencode-dashboard/` to regenerate compiled routes.

  **Sub-task E — Create production SkillRLManager entry point** (CRITICAL — Metis correction):
  SkillRLManager is currently only in test files. It must be instantiated in production.

  The best hook is `local/oh-my-opencode/src/plugin.ts` (the plugin entry point) or the `onStart` hook in `oh-my-opencode.json`. Read the oh-my-opencode plugin interface first to understand where plugin initialization code runs.

  Add to the appropriate lifecycle hook:
  ```typescript
  import { SkillRLManager } from '../../../packages/opencode-skill-rl-manager/src/index.js';
  // or: const { SkillRLManager } = require('../../../packages/opencode-skill-rl-manager/src/index.js');

  // In plugin init / onStart:
  const skillRL = new SkillRLManager();
  // Store on plugin context if needed for Task 4 wiring
  ```

  > Note to executor: Read `local/oh-my-opencode/src/plugin.ts` and `local/oh-my-opencode/src/plugin-interface.ts` fully before choosing the entry point. The plugin has a well-defined lifecycle. Find where other singletons (like the existing crash guard or context governor) are instantiated for guidance on the right pattern.

  **Must NOT do**:
  - Do NOT touch `/api/rl/route.ts` or `/api/memory-graph/route.ts` — they already use the correct path
  - Do NOT add SkillRLManager to multiple production files — one entry point only
  - Do NOT add a UI or API endpoint for manual RL management (scope creep)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-file change; production lifecycle wiring requires reading plugin architecture carefully
  - **Skills**: [`systematic-debugging`, `verification-before-completion`]
    - `systematic-debugging`: Trace all path references before touching anything; use `grep -rn "skill-rl"` sweep
    - `verification-before-completion`: Final grep sweep before commit to confirm no stale references remain

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential foundation)
  - **Blocks**: Tasks 3, 4, 6
  - **Blocked By**: Task 1

  **References**:

  **Files to edit**:
  - `packages/opencode-skill-rl-manager/src/index.js:130` — default path + migration block
  - `packages/opencode-dashboard/src/app/api/models/route.ts:156` — path correction
  - `packages/opencode-dashboard/src/app/api/events/route.ts` — watcher path correction
  - `local/oh-my-opencode/src/plugin.ts` (or equivalent) — production instantiation

  **Files to read before editing** (architecture):
  - `local/oh-my-opencode/src/plugin-interface.ts:59` — where tool hooks are registered
  - `local/oh-my-opencode/src/plugin/tool-execute-before.ts:20` — existing hook pattern
  - `packages/opencode-skill-rl-manager/src/index.js:216–290` — save/load state methods

  **Pattern reference**:
  - `packages/opencode-dashboard/src/app/api/rl/route.ts:218` — `path.join(os.homedir(), '.opencode', 'skill-rl.json')` — copy exactly

  **Acceptance Criteria**:

  ```
  Scenario: Zero stale path references in source files
    Tool: Bash
    Steps:
      1. grep -rn "skill-rl-state" packages/ integration-tests/ local/ --include="*.ts" --include="*.js" | grep -v node_modules | grep -v ".next"
    Expected Result: no output (zero matches)
    Evidence: grep output (empty = pass)

  Scenario: SkillRLManager resolves to canonical path
    Tool: Bash
    Steps:
      1. node -e "
           const p = require('path'), os = require('os');
           const { SkillRLManager } = require('./packages/opencode-skill-rl-manager/src/index.js');
           const m = new SkillRLManager();
           const expected = p.join(os.homedir(), '.opencode', 'skill-rl.json');
           console.log(m.persistencePath === expected ? 'PASS' : 'FAIL: ' + m.persistencePath);
         "
    Expected Result: PASS
    Evidence: stdout

  Scenario: Migration copies existing data
    Tool: Bash
    Preconditions: ./skill-rl-state.json exists at repo root
    Steps:
      1. node -e "new (require('./packages/opencode-skill-rl-manager/src/index.js').SkillRLManager)()"
      2. node -e "const f=require('fs'),os=require('os'),p=require('path'); console.log(f.existsSync(p.join(os.homedir(),'.opencode','skill-rl.json'))?'FILE EXISTS':'MISSING');"
    Expected Result: FILE EXISTS
    Evidence: stdout

  Scenario: SkillRL integration tests pass with new path
    Tool: Bash
    Steps:
      1. bun test integration-tests/skillrl-api-regression.test.js
    Expected Result: all tests PASS
    Evidence: bun test output
  ```

  **Commit**: YES
  - Message: `fix(skill-rl): standardize path to ~/.opencode/skill-rl.json + create production entry point`
  - Files: `packages/opencode-skill-rl-manager/src/index.js`, `packages/opencode-dashboard/src/app/api/models/route.ts`, `packages/opencode-dashboard/src/app/api/events/route.ts`, `local/oh-my-opencode/src/plugin.ts`
  - Pre-commit: `bun run build` in `packages/opencode-dashboard/`

---

- [ ] 3. Seed SkillRLManager with all 29 registry skills (additive merge)

  **What to do**:

  Add a `syncWithRegistry(registryPath)` method to SkillRLManager and call it on startup. The method merges all skills from `opencode-config/skills/registry.json` into the RL bank — preserving existing data, adding only missing entries.

  **Step 1 — Understand SkillBank's Map structure**:
  Read `packages/opencode-skill-rl-manager/src/skill-bank.js` carefully:
  - The `general` bank is a `Map<name, entry>` (serialized as `[[name, entry], ...]` in JSON)
  - Find whether there's a `getGeneral(name)` or `has(name)` method — use it if present; add `getGeneral(name)` if not

  **Step 2 — Add `getGeneral(name)` to SkillBank** (if missing):
  ```js
  getGeneral(name) {
    return this.general.get(name) ?? null;
  }
  ```

  **Step 3 — Add `syncWithRegistry(registryPath)` to SkillRLManager**:
  ```js
  /**
   * Additively seed skill bank from registry.json.
   * Preserves existing usage_count and success_rate. Adds missing skills only.
   * @param {string} registryPath — absolute path to registry.json
   */
  syncWithRegistry(registryPath) {
    if (!fs.existsSync(registryPath)) return;
    let registry;
    try {
      registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    } catch (_) { return; }

    const skills = registry.skills || {};
    let mutated = false;

    for (const [skillName, meta] of Object.entries(skills)) {
      // Normalize: strip any path prefix (superpowers/, etc.), use base name only
      const baseName = skillName.includes('/') ? skillName.split('/').pop() : skillName;

      // Check if already tracked — preserve existing entry
      if (this.skillBank.getGeneral(baseName)) continue;

      this.skillBank.addGeneral({
        name: baseName,
        principle: meta.description || '',
        application_context: (meta.triggers || []).join(', '),
        success_rate: 0.75,  // Conservative neutral default
        usage_count: 0,
        last_updated: Date.now(),
        tags: meta.tags || [],
        source: meta.source || 'registry',
        category: meta.category || 'general',
      });
      mutated = true;
    }

    if (mutated) this._saveState();
  }
  ```

  **Step 4 — Wire in constructor** (after `this._loadState()`):
  ```js
  // Sync with skill registry on startup — additive, never overwrites
  const _registryPath = path.resolve(__dirname, '../../../opencode-config/skills/registry.json');
  this.syncWithRegistry(_registryPath);
  ```

  > `__dirname` for `packages/opencode-skill-rl-manager/src/index.js` resolves to `<root>/packages/opencode-skill-rl-manager/src`. Path `../../../opencode-config/skills/registry.json` reaches `<root>/opencode-config/skills/registry.json`. Verify with a quick `console.log(path.resolve(__dirname, '../../../opencode-config/skills/registry.json'))` during dev.

  **Step 5 — Handle the `superpowers/` naming question**:
  The `opencode-config/skills/superpowers/` subdirectory has its own SKILL.md files (e.g., `superpowers/brainstorming`). Meanwhile, `registry.json` uses flat names like `brainstorming`. These are the SAME skills. The seedbank should use flat base names (strip the `superpowers/` prefix) so they match how agents invoke them via `load_skills`.

  **Must NOT do**:
  - Do NOT seed compound-engineering plugin skills (~18 additional) — only the 29 from `opencode-config/skills/registry.json`
  - Do NOT overwrite existing usage_count or success_rate values
  - Do NOT add a `superpowers/brainstorming` entry AND a `brainstorming` entry — one per base name only
  - Do NOT hardcode skill names in the manager — always read from registry.json dynamically

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Must preserve existing RL state data; seeding logic must be merge-not-replace
  - **Skills**: [`test-driven-development`, `verification-before-completion`]
    - `test-driven-development`: Write tests for syncWithRegistry covering the 4 critical cases before implementing
    - `verification-before-completion`: Verify existing 5 skills' usage_count values are unchanged after sync

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Task 4
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 6
  - **Blocked By**: Task 2

  **References**:

  **Files to read before editing**:
  - `packages/opencode-skill-rl-manager/src/skill-bank.js:1–120` — SkillBank class structure and methods
  - `packages/opencode-skill-rl-manager/src/skill-bank.js:281` — `recordUsage()` method (understand Map entry shape)
  - `packages/opencode-skill-rl-manager/src/index.js:192–240` — `selectSkills()` and `_saveState()` methods
  - `opencode-config/skills/registry.json:1–455` — full 29-skill registry with all metadata fields

  **Files to edit**:
  - `packages/opencode-skill-rl-manager/src/skill-bank.js` — add `getGeneral(name)` if missing
  - `packages/opencode-skill-rl-manager/src/index.js` — add `syncWithRegistry()` + wire in constructor

  **Test file** (create):
  - `packages/opencode-skill-rl-manager/test/sync-registry.test.js` — 4 test cases:
    1. Empty bank + sync → 29 skills present, all with usage_count 0
    2. Bank has 5 skills with usage_count 3 + sync → 5 keep count 3; 24 new have count 0
    3. Registry has `superpowers/brainstorming` → stored as `brainstorming` (no prefix)
    4. sync() called twice → idempotent (still 29 skills, not 58)

  **Acceptance Criteria**:

  ```
  Scenario: All 29 registry skills appear in RL state after startup
    Tool: Bash
    Steps:
      1. node -e "
           const {SkillRLManager} = require('./packages/opencode-skill-rl-manager/src/index.js');
           const m = new SkillRLManager();
           m.syncWithRegistry('./opencode-config/skills/registry.json');
           const state = JSON.parse(require('fs').readFileSync(m.persistencePath, 'utf-8'));
           console.log(state.skillBank.general.length);
         "
    Expected Result: ≥ 29
    Evidence: stdout

  Scenario: Existing usage_count values are NOT overwritten
    Tool: Bash
    Steps:
      1. bun test packages/opencode-skill-rl-manager/test/sync-registry.test.js
    Expected Result: all 4 test cases PASS
    Evidence: bun test output

  Scenario: Dashboard RL API returns all skills
    Tool: Bash
    Preconditions: Dashboard running on localhost:3000, skill-rl.json populated
    Steps:
      1. curl -s http://localhost:3000/api/rl | jq '.skill_bank.total'
    Expected Result: ≥ 29
    Evidence: jq output
  ```

  **Commit**: YES
  - Message: `feat(skill-rl): seed all 29 registry skills additively on startup`
  - Files: `packages/opencode-skill-rl-manager/src/index.js`, `packages/opencode-skill-rl-manager/src/skill-bank.js`, `packages/opencode-skill-rl-manager/test/sync-registry.test.js`

---

- [ ] 4. Wire MCP tool invocations into tool-usage-tracker (fire-and-forget)

  **What to do**:

  Task 1 exports `logInvocation`. This task wires it into the agent's tool execution lifecycle so that every MCP tool call is telemetered.

  **Step 1 — Determine the actual MCP tool name format**:
  Before wiring, run this to see what tool names the hook actually receives:
  ```bash
  grep -n "toolName\|tool_name\|tool\.name\|args\.tool" local/oh-my-opencode/src/plugin/tool-execute-after.ts | head -20
  ```
  MCP tools may appear as `mcp_context7_resolve-library-id` (single underscore) or `mcp__context7__resolve-library-id` (double underscore) depending on the runtime. Identify the format before writing the prefix filter.

  **Step 2 — Add MCP logging to `tool-execute-after.ts`**:

  Read the full file first (`local/oh-my-opencode/src/plugin/tool-execute-after.ts`). Locate the hook handler. The hook receives parameters representing the tool call. After any existing logic, append:

  ```typescript
  // Import at top of file (adjust path depth as needed):
  // CJS interop: const { logInvocation } = require('../../../packages/opencode-learning-engine/src/tool-usage-tracker.js');

  // In hook body — after existing logic:
  const MCP_PREFIXES = ['mcp_context7_', 'mcp__context7__', 'mcp_distill_', 'mcp__distill__', 'mcp_supermemory_', 'mcp_websearch_', 'mcp_grep_'];
  const isMCPTool = MCP_PREFIXES.some(p => toolName?.startsWith(p));

  if (isMCPTool) {
    setImmediate(() => {
      logInvocation(toolName, params ?? {}, result ?? {}, {
        sessionId: context?.sessionId ?? 'unknown',
        source: 'tool-execute-after-hook',
      }).catch(() => {}); // Never crash the agent
    });
  }
  ```

  > Note to executor: The `params`, `result`, `context`, and `toolName` variable names are assumptions — match them to the actual parameter names in the file. The handler signature may be `(toolName, args, result, ctx)` or similar.

  > The double-prefix variants (`mcp__context7__`) are included as a defensive fallback. Once you confirm the actual format from Step 1, you can remove whichever variant doesn't apply.

  **Must NOT do**:
  - Do NOT await `logInvocation` in the hook — always fire-and-forget via `setImmediate`
  - Do NOT log non-MCP tools (read, write, edit, bash, etc.) — only MCP prefix tools
  - Do NOT modify `logInvocation`'s internals (done in Task 1)
  - Do NOT attempt to feed this data into the RL state directly (RL state tracks skills, not individual tool calls)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: TypeScript + CJS boundary; must read hook interface before writing; fire-and-forget pattern must be exact
  - **Skills**: [`systematic-debugging`]
    - `systematic-debugging`: Verify the import resolves and the module boundary (TS→CJS) works before wiring the actual call

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Task 3
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1 and 2

  **References**:

  **Files to read before editing**:
  - `local/oh-my-opencode/src/plugin/tool-execute-after.ts:1–60` — full hook implementation + parameter names
  - `local/oh-my-opencode/src/plugin-interface.ts:59` — how hooks are registered
  - `packages/opencode-learning-engine/src/orchestration-advisor.js` — fire-and-forget `setImmediate` pattern to replicate

  **Files to edit**:
  - `local/oh-my-opencode/src/plugin/tool-execute-after.ts` — add MCP logging block

  **Acceptance Criteria**:

  ```
  Scenario: MCP tool prefix list is present in hook
    Tool: Bash
    Steps:
      1. grep -n "mcp_context7_\|mcp_distill_" local/oh-my-opencode/src/plugin/tool-execute-after.ts
    Expected Result: match found (at least one prefix in the file)
    Evidence: grep output

  Scenario: logInvocation is imported in the hook file
    Tool: Bash
    Steps:
      1. grep -n "logInvocation" local/oh-my-opencode/src/plugin/tool-execute-after.ts
    Expected Result: match found (import + call)
    Evidence: grep output

  Scenario: After simulated call, invocation record is created
    Tool: Bash
    Steps:
      1. node -e "
           const { logInvocation } = require('./packages/opencode-learning-engine/src/tool-usage-tracker.js');
           logInvocation('mcp_context7_resolve-library-id', {q:'react'}, {id:'npm:react'}, {source:'test'})
             .then(() => {
               const fs = require('fs'), os = require('os'), path = require('path');
               const inv = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.opencode', 'tool-usage', 'invocations.json'), 'utf-8'));
               const last = inv.invocations[inv.invocations.length - 1];
               console.log(last.toolName === 'mcp_context7_resolve-library-id' ? 'PASS' : 'FAIL: ' + last.toolName);
             })
             .catch(e => console.error('FAIL', e.message));
         "
    Expected Result: PASS
    Evidence: stdout

  Scenario: oh-my-opencode plugin still loads after changes
    Tool: Bash
    Steps:
      1. node -e "require('./local/oh-my-opencode/dist/index.js'); console.log('LOADED')" 2>&1 | head -3
    Expected Result: LOADED (or graceful initialization without errors)
    Evidence: stdout
  ```

  **Commit**: YES
  - Message: `feat(telemetry): wire MCP tool calls into tool-usage-tracker via tool-execute-after hook`
  - Files: `local/oh-my-opencode/src/plugin/tool-execute-after.ts`

---

- [ ] 5. Add explicit Context7 and Distill calling conventions to skill files

  **What to do**:

  Add actionable invocation steps to the three most impactful files: `research-builder/SKILL.md`, `budget-aware-router/SKILL.md`, and `system-prompts.md`. Use the naming convention already established by `create-agent-skills` in the compound-engineering plugin.

  **Step 0 — Verify exact MCP tool method names** (before writing anything):
  ```bash
  # Check the create-agent-skills reference
  grep -n "context7\|resolve-library\|query-docs\|get-library" local/oh-my-opencode/skills/create-agent-skills/SKILL.md 2>/dev/null || grep -rn "resolve-library-id\|query-docs\|get-library-docs" local/ opencode-config/ --include="*.md" | grep -v node_modules | head -10
  ```
  Also cross-check against `mcp-servers/server-list.md:26` which says tools are `resolve-library-id` and `query-docs`. Use whatever matches the actual MCP tool names visible in the tool list.

  **In `opencode-config/skills/research-builder/SKILL.md`**:

  Replace line 51 (`- Use Context7 for library docs`) with:
  ```markdown
  - **Context7** (for any unfamiliar external library or API):
    1. Call `mcp_context7_resolve-library-id` → `{"libraryName": "<library>", "query": "<what you need"}`
    2. Take the returned `libraryId`, then call `mcp_context7_query-docs` → `{"libraryId": "<id>", "query": "<specific API question>"}`
    3. If library not found, fall back to websearch
  ```

  **In `opencode-config/skills/budget-aware-router/SKILL.md`**:

  After Phase 3: Budget Tracking (around line 74), add:
  ```markdown
  ### Phase 3a: Context Compression via Distill

  When context usage is approaching ~65% of the model's limit, OR before dispatching
  a long multi-file subagent task:

  1. Call `mcp_distill_browse_tools` — lists available compression pipelines
  2. Select the `compress` pipeline (or appropriate variant from the response)
  3. Call `mcp_distill_run_tool` → `{"name": "compress", "args": {"target": "context"}}`
  4. **Cold-start note**: Distill runs `--lazy` — the first call in a session takes ~2–3s to start. This is normal.
  ```

  **In `opencode-config/system-prompts.md`**:

  Append a new section at the end:
  ```markdown
  ## Context Management MCP Tools

  **When to use Context7**: Before implementing against any external library API you're not certain about,
  call `mcp_context7_resolve-library-id` then `mcp_context7_query-docs`. Prevents hallucinated APIs.

  **When to use Distill**: When context is at ~65%+ of capacity, call `mcp_distill_browse_tools` then
  `mcp_distill_run_tool`. Do not wait until 90%+ — compress early. Distill starts lazy (~2–3s cold start).
  ```

  **Must NOT do**:
  - Do NOT add calling conventions to any other skill files (max 3 files for this task)
  - Do NOT invent tool method names — verify from `mcp-servers/server-list.md` first
  - Do NOT add these to compound-engineering plugin skills (external dependency)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure markdown edits, zero code risk
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit after all 3 files updated together

  **Parallelization**:
  - **Can Run In Parallel**: Can start in Wave 1 (fully independent), but commit after Tasks 3+4 for clean history
  - **Parallel Group**: Can overlap with any wave; logically Wave 4
  - **Blocks**: Task 6 (tests)
  - **Blocked By**: Nothing technically (but do Step 0 verification first)

  **References**:

  **Files to edit**:
  - `opencode-config/skills/research-builder/SKILL.md:48–53` — Phase 1 Official Documentation bullet block
  - `opencode-config/skills/budget-aware-router/SKILL.md:74–86` — after Phase 3, add Phase 3a
  - `opencode-config/system-prompts.md` — append at end

  **Naming verification sources** (check before editing):
  - `mcp-servers/server-list.md:21–26` — lists `resolve-library-id` and `query-docs` as context7 tools
  - `local/oh-my-opencode/skills/create-agent-skills/SKILL.md` — already has working context7 example (check it)

  **Acceptance Criteria**:

  ```
  Scenario: Context7 tool call steps in research-builder
    Tool: Bash
    Steps:
      1. grep -n "resolve-library-id" opencode-config/skills/research-builder/SKILL.md
    Expected Result: line number with tool call text returned
    Evidence: grep output

  Scenario: Distill tool call steps in budget-aware-router
    Tool: Bash
    Steps:
      1. grep -n "browse_tools\|mcp_distill" opencode-config/skills/budget-aware-router/SKILL.md
    Expected Result: match found
    Evidence: grep output

  Scenario: Global context management rule in system-prompts
    Tool: Bash
    Steps:
      1. grep -n "mcp_distill_browse_tools\|mcp_context7" opencode-config/system-prompts.md
    Expected Result: both tool names found (2+ matches)
    Evidence: grep output
  ```

  **Commit**: YES
  - Message: `docs(skills): add explicit context7 and distill invocation conventions`
  - Files: `opencode-config/skills/research-builder/SKILL.md`, `opencode-config/skills/budget-aware-router/SKILL.md`, `opencode-config/system-prompts.md`

---

- [ ] 6. Integration tests, regression sweep, stale doc cleanup

  **What to do**:

  1. **Run SkillRL regression test**:
     ```bash
     bun test integration-tests/skillrl-api-regression.test.js
     ```
     Should pass with the new path. If the test has a fixture JSON with hardcoded `general` array length of 5 — update it to `>= 29`.

  2. **Run all SkillRL-related tests**:
     ```bash
     bun test packages/opencode-skill-rl-manager/
     bun test packages/opencode-learning-engine/
     ```

  3. **Run full test suite**:
     ```bash
     bun test
     ```
     Expected: ≥ 253 pass + new Task 3 tests, 0 failures.

  4. **Zero stale path references sweep**:
     ```bash
     grep -rn "skill-rl-state" packages/ integration-tests/ local/ opencode-config/ --include="*.ts" --include="*.js" --include="*.json" --include="*.md" | grep -v node_modules | grep -v ".next"
     ```
     Expected: no output.

  5. **Dashboard build succeeds** (if events/route.ts was edited):
     ```bash
     # workdir: packages/opencode-dashboard
     bun run build
     ```

  6. **Fix stale documentation** (secondary — update counts):
     - `mcp-servers/mcp-setup-commands.sh` — change `"Current servers (8)"` → `(9)` (distill was missing)
     - `system-prompts.md` — change `"8 MCPs"` → `"9 MCPs"` if present
     - `mcp-servers/tool-manifest.json` — add `opencode-dashboard-launcher` entry to match `opencode-mcp-config.json`

  **Must NOT do**:
  - Do NOT loosen test assertions to make failing tests pass — fix the root cause
  - Do NOT skip the full `bun test` run

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-package test runs with judgment calls about fixture updates
  - **Skills**: [`verification-before-completion`, `systematic-debugging`]
    - `verification-before-completion`: Evidence before claiming any test passes
    - `systematic-debugging`: For any test failure — full root cause before fixing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (final)
  - **Blocks**: Nothing
  - **Blocked By**: Tasks 3, 4, 5

  **References**:
  - `integration-tests/skillrl-api-regression.test.js` — primary; may need fixture count update
  - `integration-tests/skillrl-showboat-e2e.test.js` — secondary; check for hard-coded skill count assertions
  - `mcp-servers/mcp-setup-commands.sh` — stale server count
  - `mcp-servers/tool-manifest.json` — missing `opencode-dashboard-launcher` entry
  - `package.json:27` — `"test:skillrl-api"` shorthand

  **Acceptance Criteria**:

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. bun test 2>&1 | tail -10
    Expected Result: output shows pass count ≥ 253, 0 failures
    Evidence: bun test summary

  Scenario: Zero stale path references
    Tool: Bash
    Steps:
      1. grep -rn "skill-rl-state" packages/ integration-tests/ --include="*.ts" --include="*.js" | grep -v node_modules | grep -v ".next" | wc -l
    Expected Result: 0
    Evidence: wc -l output

  Scenario: Dashboard builds without errors
    Tool: Bash (workdir: packages/opencode-dashboard)
    Steps:
      1. bun run build 2>&1 | tail -5
    Expected Result: no TypeScript errors, exit code 0
    Evidence: build output tail

  Scenario: Tool manifest is up to date
    Tool: Bash
    Steps:
      1. grep "opencode-dashboard-launcher" mcp-servers/tool-manifest.json
    Expected Result: match found
    Evidence: grep output
  ```

  **Commit**: YES
  - Message: `test(skill-rl): regression sweep after pipeline fixes; update stale docs`
  - Files: `integration-tests/skillrl-api-regression.test.js` (if fixture updated), `mcp-servers/mcp-setup-commands.sh`, `mcp-servers/tool-manifest.json`

---

## Commit Strategy

| After Task | Message |
|------------|---------|
| 1 | `fix(telemetry): resurrect tool-usage-tracker — export logInvocation, verify internal helpers` |
| 2 | `fix(skill-rl): standardize path to ~/.opencode/skill-rl.json + create production entry point` |
| 3 | `feat(skill-rl): seed all 29 registry skills additively on startup` |
| 4 | `feat(telemetry): wire MCP tool calls into tool-usage-tracker via tool-execute-after hook` |
| 5 | `docs(skills): add explicit context7 and distill invocation conventions` |
| 6 | `test(skill-rl): regression sweep after pipeline fixes; update stale docs` |

---

## Success Criteria

```bash
# 1. logInvocation exported and functional
node -e "const t = require('./packages/opencode-learning-engine/src/tool-usage-tracker.js'); console.log(typeof t.logInvocation);"
# Expected: function

# 2. Zero stale path references
grep -rn "skill-rl-state" packages/ integration-tests/ --include="*.ts" --include="*.js" | grep -v node_modules | grep -v ".next"
# Expected: no output

# 3. All 29 skills in RL state
cat ~/.opencode/skill-rl.json | jq '.skillBank.general | length'
# Expected: ≥ 29

# 4. Context7 convention in research-builder
grep -n "resolve-library-id" opencode-config/skills/research-builder/SKILL.md
# Expected: match found

# 5. Distill convention in budget-aware-router
grep -n "browse_tools" opencode-config/skills/budget-aware-router/SKILL.md
# Expected: match found

# 6. Full test suite
bun test
# Expected: ≥ 253 pass, 0 fail
```

### Final Checklist
- [x] `tool-usage-tracker.js` loads without errors
- [x] `logInvocation` in `module.exports` of tool-usage-tracker
- [x] `readJsonAsync`/`initAsync` verified functional (or implemented if missing)
- [x] SkillRLManager instantiated in at least one production entry point
- [x] SkillRLManager default path = `~/.opencode/skill-rl.json`
- [x] Migration logic preserves existing data from `./skill-rl-state.json`
- [x] Dashboard models API uses canonical path
- [x] Dashboard file watcher uses canonical path
- [x] `syncWithRegistry()` seeds all 29 skills additively
- [x] Existing usage_count/success_rate values preserved after sync
- [x] MCP prefix filter in `tool-execute-after.ts` covers context7 and distill
- [x] tool-execute-after fires `logInvocation` fire-and-forget (never blocks)
- [x] Context7 explicit tool call steps in research-builder skill
- [x] Distill explicit invocation steps in budget-aware-router skill
- [x] Global distill threshold rule in system-prompts.md
- [x] `bun test` — all tests pass
- [x] Zero `skill-rl-state` references in non-legacy source files
- [x] Stale doc counts updated (9 MCPs, tool-manifest complete)

---

## Pass 2 Addendum — Overlooked Gaps (Second Audit)

### Addendum Objective
Harden the tracking pipeline beyond basic wiring by fixing telemetry contract mismatches, improving observability depth, and eliminating repo/runtime drift risks for plugin hook behavior.

### Addendum Scope (IN)
- Tool name normalization between runtime MCP names and tracker canonical names
- MCP invocation payload quality (params/result/error taxonomy)
- Runtime parity checks for `local/oh-my-opencode` hook deployment
- Integration tests for end-to-end tracking contracts

### Addendum Scope (OUT)
- No redesign of SkillRL core algorithms
- No new dashboards or UI work
- No new MCP servers

### Addendum TODOs

- [x] A1. Canonical Tool Name Normalization Contract

  **What to do**:
  - Create a single normalization mapping for MCP tool names before metrics updates.
  - Ensure names like `mcp_context7_resolve-library-id` and `mcp_distill_browse_tools` map to canonical keys recognized by `AVAILABLE_TOOLS`.
  - Apply mapping in tracker ingestion path before `metrics.toolCounts[toolName]++`.

  **Acceptance Criteria**:
  - [x] `context7` and `distill` calls increment expected canonical tool keys in metrics
  - [x] No unknown-tool inflation caused by hyphen/prefix format differences
  - [x] Backward compatibility preserved for existing stored invocation records

  **References**:
  - `packages/opencode-learning-engine/src/tool-usage-tracker.js:65`
  - `packages/opencode-learning-engine/src/tool-usage-tracker.js:75`
  - `local/oh-my-opencode/src/plugin/tool-execute-after.ts:10`
  - `local/oh-my-opencode/src/plugin/tool-execute-after.ts:11`

- [x] A2. MCP Telemetry Depth Upgrade (non-blocking)

  **What to do**:
  - Extend MCP logging payload to include sanitized params and structured error outcome, not only `{}` and truncated output.
  - Keep fire-and-forget behavior (never block tool execution).
  - Add lightweight error-class tagging (timeout, protocol_error, tool_error, unknown).

  **Acceptance Criteria**:
  - [x] Invocation records include sanitized params for MCP calls
  - [x] Invocation records include structured outcome fields (`success`, `errorClass`, `errorCode?`)
  - [x] Telemetry failure does not interrupt hook chain execution

  **References**:
  - `local/oh-my-opencode/src/plugin/tool-execute-after.ts:39`
  - `local/oh-my-opencode/src/plugin/tool-execute-after.ts:42`
  - `packages/opencode-learning-engine/src/tool-usage-tracker.js:269`

- [x] A3. Runtime Parity Guard (repo vs local plugin)

  **What to do**:
  - Add a verification task/script/checklist that compares expected hook signatures and key telemetry behavior between repo assumptions and active local plugin code.
  - Explicitly detect if MCP hook telemetry is absent in active runtime copy.

  **Acceptance Criteria**:
  - [x] A repeatable check confirms active `tool.execute.after` includes MCP telemetry call path
  - [x] Check output is machine-readable (pass/fail + reason)
  - [x] Runbook documents remediation when parity fails

  **References**:
  - `local/oh-my-opencode/src/plugin/tool-execute-after.ts:1`
  - `.sisyphus/plans/context-distill-tracking-fixes.md` (Task 4 notes)

- [x] A4. End-to-End Tracking Contract Tests

  **What to do**:
  - Add integration tests for full path: tool hook -> invocation log write -> metrics update -> consumer read path.
  - Include one Context7 case and one Distill case.
  - Add negative case: malformed tool name still normalizes or is safely categorized.

  **Acceptance Criteria**:
  - [x] Test proves Context7 call is visible in invocation log and metrics under canonical key
  - [x] Test proves Distill call is visible in invocation log and metrics under canonical key
  - [x] Test proves malformed/unknown MCP name does not crash tracker pipeline

  **References**:
  - `packages/opencode-learning-engine/src/tool-usage-tracker.js:285`
  - `integration-tests/telemetry-contract.test.js`

### Addendum Execution Order

```
Wave A: A1 (normalization contract)
Wave B: A2 + A3 (parallel)
Wave C: A4 (depends on A1/A2)
```

### Addendum Verification Commands

```bash
# 1) Confirm canonical tool key increments for context7/distill
bun test integration-tests/telemetry-contract.test.js

# 2) Confirm no tracker crash on unknown MCP name
bun test integration-tests/telemetry-contract.test.js -t "unknown MCP"

# 3) Confirm runtime parity check passes
bun run <runtime-parity-check-script>
```

### Addendum Guardrails
- Preserve fire-and-forget semantics for telemetry
- Do not add heavy synchronous I/O to hook path
- Do not couple tracker format tightly to one MCP provider naming convention

### Pass 2 Implementation Mini-Plan (Top 5 Risks)

- [x] B1. Resolve runtime-vs-repo drift for plugin telemetry wiring

  **Goal**: Ensure MCP telemetry hook logic is verifiably present in the active runtime plugin, not only in local gitignored paths.

  **Steps**:
  1. Add a parity check command/script that inspects active plugin source path and validates presence of MCP telemetry call site.
  2. Emit pass/fail output with exact missing symbol/path details.
  3. Document remediation path if parity fails (copy/sync/rebuild plugin artifact).

  **Acceptance**:
  - [x] Parity check returns deterministic pass/fail
  - [x] Output includes checked path + required markers (`MCP_PREFIXES`, `logInvocation` call)

  **Outcome**:
  - `scripts/verify-plugin-parity.mjs` is present and emits deterministic JSON + exit codes (0 pass / 1 fail / 2 fatal).
  - Verified markers in active hook path: `MCP_PREFIXES`, `logInvocation` import/call, fire-and-forget (`setImmediate` + `.catch`).

- [x] B2. Fix session join contract mismatch (`sessionId` vs `context.session`)

  **Goal**: Make telemetry rows joinable with downstream session analytics.

  **Steps**:
  1. Define canonical session key contract in tracker ingestion (`context.session` as source of truth).
  2. Ensure hook payload populates canonical key (or tracker maps aliases safely).
  3. Add compatibility handling for old rows.

  **Acceptance**:
  - [x] New invocation rows contain canonical session key used by report queries
  - [x] Existing report/session analytics show non-default session attribution for MCP calls

  **Outcome**:
  - `logInvocation()` now resolves canonical session via `resolveSessionKey(context)` before writing invocation rows/events.
  - Alias compatibility (`session`, `sessionId`, `session_id`) remains supported, and B5 E2E join assertions pass.

- [x] B3. Normalize tool names before metrics/categorization

  **Goal**: Prevent unknown-category inflation caused by MCP-prefixed/hyphenated runtime names.

  **Steps**:
  1. Add normalization function in tracker ingestion path.
  2. Map MCP runtime names to canonical names used by `AVAILABLE_TOOLS`.
  3. Apply normalization before `toolCounts`/`categoryCounts` updates.

  **Acceptance**:
  - [x] Context7 and Distill invocations increment canonical tool keys
  - [x] Unknown-category rate decreases in telemetry smoke test

  **Outcome**:
  - `normalizeMcpToolName()` is applied at ingestion start in `logInvocation()` before category/tool count updates.
  - Context7/Distill telemetry-contract tests confirm canonical-key increments and safe malformed-name handling.

- [x] B4. Align MCP health checks with config reality (enabled/disabled/remote/local)

  **Goal**: Eliminate false health signals from binary-only assumptions.

  **Steps**:
  1. Audit health check logic against `opencode-config/opencode.json` MCP definitions.
  2. Distinguish remote URL servers from local binary servers.
  3. Respect `enabled` flag in health reporting expectations.

  **Acceptance**:
  - [x] Health status for each MCP server is derived from config-accurate checks
  - [x] No false FAIL for remote MCPs without local binaries

  **Outcome**:
  - `scripts/health-check.mjs` now evaluates MCP entries per-server with `enabled` + `type` semantics.
  - Enabled `remote` servers validate URL shape only (no local binary requirement).
  - Enabled `local` servers validate command executable presence.
  - Disabled servers are reported as skipped without false failures.

- [x] B5. Add end-to-end telemetry join integration test

  **Goal**: Prove full chain works: hook -> invocation log -> metrics -> joinable analytics context.

  **Steps**:
  1. Add one Context7 and one Distill test case.
  2. Assert invocation row contains canonical tool + canonical session key.
  3. Assert metrics reflect categorized increments.
  4. Add negative case for malformed MCP name (safe handling, no crash).

  **Acceptance**:
  - [x] E2E test passes for Context7 and Distill
  - [x] Malformed name path handled gracefully
  - [x] Join assertions validate session linkage

  **Outcome**:
  - Added `B5 E2E: Context7 + Distill rows are joinable by canonical session key` test in `integration-tests/telemetry-contract.test.js`.
  - Added malformed MCP-name negative-path telemetry test to confirm safe handling without crash.
  - Updated `logInvocation()` in `packages/opencode-learning-engine/src/tool-usage-tracker.js` to derive canonical session key via `resolveSessionKey()` (supports `session`, `sessionId`, `session_id`) before invocation row + telemetry event emission.

- [x] B6. Context Management Surface Completeness Check (pre-start gate)

  **Goal**: Ensure we are not leaving out non-MCP context controls before execution.

  **Steps**:
  1. Validate `opencode-context-governor` integration assumptions (token budget behavior and alert thresholds).
  2. Verify `tool.execute.after` compaction-related hooks are present and ordered as expected (`preemptiveCompaction`, `contextWindowMonitor`).
  3. Verify `supermemory` context settings (`contextInjection`, `compactionThreshold`) are aligned with compression policy.
  4. Confirm both `distill` and `prune` are included in normalization/telemetry scope (not Distill-only).

  **Acceptance**:
  - [x] Checklist report exists with pass/fail for all 4 surfaces
  - [x] Any mismatch is captured as explicit follow-up TODO (not implicit)
  - [x] Start-work readiness call includes B6 outcome summary

  **Outcome summary**:
  - Report artifact: `B6-CONTEXT-MANAGEMENT-COMPLETENESS-GATE.md`
  - Surface results: S1 FAIL (75/90 vs AGENTS 75/80 expectation), S2 PASS (hook ordering present), S3 FAIL (supermemory 0.85 vs early compression guidance), S4 PARTIAL (distill+prune normalized in tracker; prune telemetry path needs explicit runtime verification).
  - Follow-up TODOs are documented in the report and should be resolved before final start-work readiness signoff.

  **References**:
  - `packages/opencode-context-governor/README.md:1`
  - `local/oh-my-opencode/src/plugin/tool-execute-after.ts:58`
  - `local/oh-my-opencode/src/plugin/tool-execute-after.ts:59`
  - `opencode-config/supermemory.json:5`
  - `opencode-config/supermemory.json:22`
  - `opencode-config/tool-tiers.json:10`
