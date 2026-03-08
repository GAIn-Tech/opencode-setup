# Wave 9: Meta-Knowledge-Base Closed-Loop System

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a closed-loop meta-knowledge-base that connects the 166 write-only learning-updates, 7 drifting AGENTS.md files, and the unused LearningEngine hook system into a bidirectional system where skills and orchestration both read from and write to institutional knowledge.

**Architecture:** 3 validated phases. Phase 1 builds the synthesis layer + read path (MVP). Phase 2 wires read hooks into OrchestrationAdvisor and SkillRL. Phase 3 adds write-back, dashboard integration, and model-router integration. Each phase must be validated before the next begins.

**Tech Stack:** Bun-native ESM scripts (.mjs), CommonJS packages (opencode-learning-engine), flat JSON index (no vector DB, no embeddings, no RAG).

---

## Planning Philosophy

**Problem Statement:** Three parallel knowledge systems exist and don't communicate:
1. **166 Learning-Update JSONs** — governance audit trail, validated by `learning-gate.mjs`, read by **nothing**
2. **Runtime Learning Engine** — reads from `~/.opencode/learning/`, ignores learning-updates entirely
3. **7 AGENTS.md files** — manually maintained, single commit, significant drift from reality

**Additionally:** The LearningEngine has a fully-built hook system (`registerHook`, `preOrchestrate`, `adviceGenerated`, `patternStored`, `outcomeRecorded`) with **zero consumers** anywhere in the codebase.

**Design Decisions (from Metis analysis):**
- Store meta-KB index as flat JSON: `opencode-config/meta-knowledge-index.json`
- Synthesis script follows existing `.mjs` infrastructure pattern
- Reuse the EXISTING hook infrastructure in LearningEngine — do NOT build new hooks
- Meta-KB reads are non-blocking and fail-open (if unavailable, execution proceeds)
- Max 200 tokens of meta-context injected per skill prompt
- Write-back uses `source: "meta-kb-auto"` discriminator to prevent governance bypass
- AGENTS.md drift generates proposals (not auto-commits)

**DO NOT:**
- Introduce vector databases, embeddings, RAG pipelines, or semantic search
- Auto-modify AGENTS.md content (Phase 1-2: detection only; Phase 3: proposals only)
- Build a new MCP server, REST API, or daemon for the meta-KB
- Write to meta-KB on every `advise()` call — batch at commit-time only
- Unify learning-update schema with anti-pattern schema — cross-reference, don't merge
- Inject more than 200 tokens of meta-KB context into any single skill prompt

**CRITICAL FAILURE MODES TO AVOID:**
1. **Circular write amplification**: Meta-KB write-back → creates learning-update → triggers learning-gate → triggers another write-back. Mitigation: `source: "meta-kb-auto"` field; synthesis script skips auto-generated records.
2. **Governance escape hatch**: Auto-generated records rubber-stamping the gate. Mitigation: Separate `auto-generated` category with review flag.
3. **Token budget crowding**: Meta-context eating into skill prompt caps. Mitigation: Hard 200-token ceiling, relevance-ranked.
4. **Hook injection performance death**: File I/O at every hook. Mitigation: In-memory index loaded once, refreshed on synthesis.

---

## Phase 1: Synthesis + Read (MVP)

### Task 1: Build `synthesize-meta-kb.mjs` Script

**Files:**
- Create: `scripts/synthesize-meta-kb.mjs`
- Output: `opencode-config/meta-knowledge-index.json`
- Reference: `scripts/learning-gate.mjs` (ESM pattern, `resolveRoot`, `parseArgs`)
- Reference: `scripts/resolve-root.mjs` (shared root resolver)

**Step 1: Create the synthesis script**

The script reads all 166 `opencode-config/learning-updates/*.json` files and all `**/AGENTS.md` files, then produces a single indexed JSON file.

```javascript
#!/usr/bin/env node
// scripts/synthesize-meta-kb.mjs
//
// Synthesizes learning-updates + AGENTS.md into a queryable meta-knowledge index.
// Produces: opencode-config/meta-knowledge-index.json
//
// Usage:
//   node scripts/synthesize-meta-kb.mjs              # Full synthesis
//   node scripts/synthesize-meta-kb.mjs --dry-run    # Preview without writing
//   node scripts/synthesize-meta-kb.mjs --stats      # Print stats only

import fs from 'fs';
import path from 'path';
import { resolveRoot } from './resolve-root.mjs';

const ROOT = resolveRoot();
const UPDATES_DIR = path.join(ROOT, 'opencode-config', 'learning-updates');
const OUTPUT_PATH = path.join(ROOT, 'opencode-config', 'meta-knowledge-index.json');
```

**Index output schema:**
```json
{
  "generated_at": "2026-03-08T...",
  "schema_version": 1,
  "total_records": 166,
  "source_files": { "learning_updates": 166, "agents_md": 7 },
  "by_category": {
    "configuration": [{ "id": "...", "summary": "...", "risk_level": "low", "affected_paths": [...], "timestamp": "..." }],
    "tooling": [...],
    "skill-activation": [...]
  },
  "by_risk_level": { "low": [...], "medium": [...], "high": [...] },
  "by_affected_path": {
    "packages/opencode-learning-engine": [{ "id": "...", "summary": "..." }],
    "packages/opencode-dashboard": [...]
  },
  "anti_patterns": [
    { "source": "agents.md", "file": "AGENTS.md", "pattern": "Bun v1.3.x ENOENT Segfault", "severity": "critical", "description": "..." },
    { "source": "learning-update", "id": "...", "pattern": "...", "description": "..." }
  ],
  "conventions": [
    { "source": "agents.md", "file": "AGENTS.md", "convention": "Bun-First", "description": "bunfig.toml, .bun-version..." }
  ],
  "commands": [
    { "source": "agents.md", "file": "AGENTS.md", "command": "bun test", "purpose": "Run all tests" }
  ]
}
```

**Synthesis logic:**
1. Read all `*.json` files in `opencode-config/learning-updates/`
2. Parse each, validate against learning-update-policy required fields
3. Index by category, risk_level, and affected_paths
4. Find all `**/AGENTS.md` files via glob
5. Extract anti-patterns, conventions, and commands sections from each AGENTS.md (regex-based section extraction)
6. Merge into single index
7. Write to `opencode-config/meta-knowledge-index.json`

**Step 2: Run the script**

Run: `node scripts/synthesize-meta-kb.mjs`
Expected: Exit code 0, creates `opencode-config/meta-knowledge-index.json`

**Step 3: Verify output**

Run: `node -e "const idx = JSON.parse(require('fs').readFileSync('opencode-config/meta-knowledge-index.json','utf-8')); console.log('records:', idx.total_records, 'categories:', Object.keys(idx.by_category).length, 'paths:', Object.keys(idx.by_affected_path).length)"`
Expected: `records: 166 categories: N paths: N` (N > 0)

**Step 4: Commit**

```bash
node scripts/learning-gate.mjs --generate-hashes
git add scripts/synthesize-meta-kb.mjs opencode-config/meta-knowledge-index.json opencode-config/learning-updates/wave9-meta-kb-synthesis-*.json opencode-config/.governance-hashes.json
git commit -m "feat: add meta-KB synthesis script and initial index

Aggregates 166 learning-updates and 7 AGENTS.md files into
opencode-config/meta-knowledge-index.json for downstream consumption.

Learning-Update: opencode-config/learning-updates/wave9-meta-kb-synthesis-YYYYMMDD.json
Risk-Level: low
Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 2: Build `check-agents-drift.mjs` Script

**Files:**
- Create: `scripts/check-agents-drift.mjs`
- Output: `.sisyphus/proposals/agents-drift-report-YYYY-MM-DD.md` (when drift found)
- Reference: `scripts/learning-gate.mjs` (script pattern)

**Step 1: Create the drift detection script**

The script compares claims in each AGENTS.md against filesystem reality.

**Detection checks:**
1. Package count: AGENTS.md claims N packages → count dirs in `packages/`
2. Script count: AGENTS.md claims N scripts → count `.mjs` files in `scripts/`
3. Agent count: AGENTS.md claims N agents → count files in `opencode-config/agents/`
4. Skill count: AGENTS.md claims N skills → count dirs in `opencode-config/skills/`
5. Directory structure: AGENTS.md lists dirs → verify they exist
6. Command table: AGENTS.md lists commands → verify referenced files exist

**Output format (when drift found):**
```markdown
# AGENTS.md Drift Report — 2026-03-08

## Summary
Found 4 drift issues across 3 AGENTS.md files.

## Drift Details

### AGENTS.md (root)
| Claim | Documented | Actual | Delta |
|-------|-----------|--------|-------|
| Package count | 34 | 36 | +2 |
| Script count | 32 | 42 | +10 |

### opencode-config/AGENTS.md
| Claim | Documented | Actual | Delta |
|-------|-----------|--------|-------|
| Agent definitions | 29 | 0 | -29 |
| Skill definitions | 46 | 15 | -31 |

## Proposed Fixes
(markdown diff for each drifted AGENTS.md)
```

**Step 2: Run the script**

Run: `node scripts/check-agents-drift.mjs`
Expected: Exit code 0, outputs drift report (may also write proposal file if drift found)

**Step 3: Commit**

```bash
node scripts/learning-gate.mjs --generate-hashes
git add scripts/check-agents-drift.mjs opencode-config/learning-updates/wave9-agents-drift-*.json opencode-config/.governance-hashes.json
git commit -m "feat: add AGENTS.md drift detection script

Compares documented package/script/agent/skill counts against
filesystem reality. Generates proposed diffs in .sisyphus/proposals/.

Learning-Update: opencode-config/learning-updates/wave9-agents-drift-YYYYMMDD.json
Risk-Level: low
Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 3: Wire Meta-KB Index into OrchestrationAdvisor via `preOrchestrate` Hook

**Files:**
- Create: `packages/opencode-learning-engine/src/meta-kb-reader.js`
- Modify: `packages/opencode-learning-engine/src/index.js:54-56` (autoLoad block)
- Test: `packages/opencode-learning-engine/test/meta-kb-reader.test.js`

**Step 1: Create the meta-KB reader module**

```javascript
// packages/opencode-learning-engine/src/meta-kb-reader.js
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_INDEX_PATH = path.join(
  __dirname, '..', '..', '..', 'opencode-config', 'meta-knowledge-index.json'
);

const MAX_META_CONTEXT_TOKENS = 200; // Hard ceiling per Metis directive
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_META_CONTEXT_TOKENS * APPROX_CHARS_PER_TOKEN;

class MetaKBReader {
  constructor(indexPath = DEFAULT_INDEX_PATH) {
    this.indexPath = indexPath;
    this.index = null;
    this.loadedAt = null;
  }

  /**
   * Load the meta-KB index into memory. Fail-open: returns false if unavailable.
   * @returns {boolean} true if loaded successfully
   */
  load() { /* ... */ }

  /**
   * Query the meta-KB for entries relevant to a task context.
   * @param {Object} taskContext - Same shape as OrchestrationAdvisor.advise() input
   * @returns {{ warnings: Object[], suggestions: Object[], conventions: Object[] }}
   */
  query(taskContext) { /* ... */ }

  /**
   * Check if index is stale (> 24h old).
   * @returns {boolean}
   */
  isStale() { /* ... */ }
}
```

**Query logic:**
1. Match `taskContext.files` against `index.by_affected_path` keys (path prefix match)
2. Match `taskContext.task_type` against `index.anti_patterns[].pattern` (keyword match)
3. Collect matching entries, rank by recency and risk_level
4. Truncate output to MAX_CHARS (~200 tokens)
5. Return `{ warnings, suggestions, conventions }` or empty arrays if no matches

**Step 2: Write the failing test**

```javascript
// packages/opencode-learning-engine/test/meta-kb-reader.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MetaKBReader } = require('../src/meta-kb-reader');
```

**Test cases:**
1. `load()` returns false when index file doesn't exist (fail-open)
2. `load()` returns true when valid index file exists
3. `query()` returns empty arrays when no index loaded
4. `query()` returns matching entries for affected_path match
5. `query()` returns matching anti-patterns for task_type match
6. `query()` output is truncated to MAX_CHARS
7. `isStale()` returns true when index > 24h old
8. `isStale()` returns false when index is fresh

**Step 3: Run tests to verify they fail**

Run: `node --test packages/opencode-learning-engine/test/meta-kb-reader.test.js`
Expected: FAIL (module not yet implemented)

**Step 4: Implement MetaKBReader**

Implement the full module following the spec above.

**Step 5: Run tests to verify they pass**

Run: `node --test packages/opencode-learning-engine/test/meta-kb-reader.test.js`
Expected: All 8 tests pass

**Step 6: Commit**

```bash
node scripts/learning-gate.mjs --generate-hashes
git add packages/opencode-learning-engine/src/meta-kb-reader.js packages/opencode-learning-engine/test/meta-kb-reader.test.js opencode-config/learning-updates/wave9-meta-kb-reader-*.json opencode-config/.governance-hashes.json
git commit -m "feat(learning-engine): add MetaKBReader for meta-KB index consumption

Fail-open reader that loads opencode-config/meta-knowledge-index.json
into memory. Queries by affected_path and task_type with 200-token cap.

Learning-Update: opencode-config/learning-updates/wave9-meta-kb-reader-YYYYMMDD.json
Risk-Level: low
Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 4: Wire MetaKBReader into LearningEngine via `preOrchestrate` Hook

**Files:**
- Modify: `packages/opencode-learning-engine/src/index.js:28-56` (constructor)
- Modify: `packages/opencode-learning-engine/src/index.js` (advise method — find it)
- Test: `packages/opencode-learning-engine/test/meta-kb-integration.test.js`

**Step 1: Write the failing integration test**

```javascript
// packages/opencode-learning-engine/test/meta-kb-integration.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { LearningEngine } = require('../src/index');

describe('LearningEngine meta-KB integration', () => {
  it('advise() output includes meta_context field', () => {
    const engine = new LearningEngine({ autoLoad: false });
    const advice = engine.advise({ task_type: 'debug', files: ['packages/opencode-learning-engine/src/index.js'] });
    assert.ok('meta_context' in advice, 'advice should have meta_context field');
  });

  it('meta_context is empty object when no index loaded', () => {
    const engine = new LearningEngine({ autoLoad: false, metaKBPath: '/nonexistent' });
    const advice = engine.advise({ task_type: 'debug' });
    assert.deepStrictEqual(advice.meta_context, { warnings: [], suggestions: [], conventions: [] });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test packages/opencode-learning-engine/test/meta-kb-integration.test.js`
Expected: FAIL (meta_context not in advice)

**Step 3: Wire MetaKBReader into LearningEngine**

In `packages/opencode-learning-engine/src/index.js`:

1. Add require at top: `const { MetaKBReader } = require('./meta-kb-reader');`
2. In constructor, after `this.hooks = {}` (line 40):
   ```javascript
   this.metaKB = new MetaKBReader(options.metaKBPath);
   this.metaKB.load(); // fail-open
   ```
3. In the `advise()` method, register a `preOrchestrate` hook handler that queries metaKB:
   ```javascript
   // In advise(), before calling this.advisor.advise():
   const metaContext = this.metaKB.index ? this.metaKB.query(taskContext) : { warnings: [], suggestions: [], conventions: [] };
   ```
4. In the `advise()` return object, add `meta_context: metaContext`
5. If `this.metaKB.isStale()`, add a soft warning to the advice about stale index

**Step 4: Run test to verify it passes**

Run: `node --test packages/opencode-learning-engine/test/meta-kb-integration.test.js`
Expected: PASS

**Step 5: Run full test suite**

Run: `bun test`
Expected: Exit code 0 (no regressions)

**Step 6: Commit**

```bash
node scripts/learning-gate.mjs --generate-hashes
git add packages/opencode-learning-engine/src/index.js packages/opencode-learning-engine/test/meta-kb-integration.test.js opencode-config/learning-updates/wave9-meta-kb-wiring-*.json opencode-config/.governance-hashes.json
git commit -m "feat(learning-engine): wire MetaKBReader into advise() via preOrchestrate

LearningEngine.advise() now includes meta_context field with relevant
warnings, suggestions, and conventions from the meta-knowledge-index.
Fail-open: proceeds normally if index is unavailable.

Learning-Update: opencode-config/learning-updates/wave9-meta-kb-wiring-YYYYMMDD.json
Risk-Level: medium
Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 5: Add `package.json` Script Entries and Validate Phase 1

**Files:**
- Modify: `package.json` (root)
- Run: Full validation suite

**Step 1: Add npm scripts**

Add to root `package.json` scripts:
```json
{
  "meta-kb:synthesize": "node scripts/synthesize-meta-kb.mjs",
  "meta-kb:drift": "node scripts/check-agents-drift.mjs",
  "meta-kb:check": "node scripts/synthesize-meta-kb.mjs && node scripts/check-agents-drift.mjs"
}
```

**Step 2: Run Phase 1 acceptance criteria**

```bash
# Synthesis script runs without error
node scripts/synthesize-meta-kb.mjs
# Assert: exit code 0

# Meta-KB index file exists and is valid JSON
node -e "const idx = JSON.parse(require('fs').readFileSync('opencode-config/meta-knowledge-index.json','utf-8')); console.log('records:', idx.total_records, 'schema:', idx.schema_version)"
# Assert: records > 100, schema: 1

# Drift report runs
node scripts/check-agents-drift.mjs
# Assert: exit code 0

# OrchestrationAdvisor includes meta-KB context
node -e "const {LearningEngine} = require('./packages/opencode-learning-engine/src/index'); const e = new LearningEngine({autoLoad:false}); const a = e.advise({task_type:'debug',files:['packages/opencode-learning-engine/src/index.js']}); console.log('meta_context' in a)"
# Assert: true

# Full test suite passes
bun test
# Assert: exit code 0
```

**Step 3: Commit**

```bash
node scripts/learning-gate.mjs --generate-hashes
git add package.json opencode-config/learning-updates/wave9-phase1-validation-*.json opencode-config/.governance-hashes.json
git commit -m "chore: add meta-KB script entries and validate Phase 1

Adds meta-kb:synthesize, meta-kb:drift, meta-kb:check npm scripts.
Phase 1 validated: synthesis runs, index is queryable, drift detected,
advise() includes meta_context. All tests pass.

Learning-Update: opencode-config/learning-updates/wave9-phase1-validation-YYYYMMDD.json
Risk-Level: low
Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Phase 2: Read Hooks + SkillRL Integration

> **Gate:** Phase 1 acceptance criteria MUST pass before starting Phase 2.

### Task 6: Enrich Skill Routing with Meta-KB Relevance via `adviceGenerated` Hook

**Files:**
- Modify: `packages/opencode-learning-engine/src/orchestration-advisor.js:116-200` (advise method)
- Test: `packages/opencode-learning-engine/test/meta-kb-routing.test.js`

**What this does:** After `OrchestrationAdvisor.advise()` generates routing advice, the `adviceGenerated` hook enriches it with meta-KB relevance scores. If the meta-KB has anti-patterns related to the suggested skill, the confidence is adjusted downward. If it has positive patterns, confidence goes up.

**Step 1: Write the failing test**

Test cases:
1. Routing confidence is adjusted when meta-KB has anti-patterns matching the suggested skill
2. Routing confidence is unchanged when meta-KB has no relevant entries
3. Skill recommendations are augmented with meta-KB evidence

**Step 2: Implement the adviceGenerated hook wiring**

In `LearningEngine.advise()`:
```javascript
// After getting advisor advice, before returning:
this._runHooks('adviceGenerated', { task_context: taskContext, advice });

// The meta-KB enrichment happens as a registered hook:
this.registerHook('adviceGenerated', ({ task_context, advice }) => {
  if (!this.metaKB.index) return;
  const metaContext = this.metaKB.query(task_context);
  // Adjust routing confidence based on meta-KB evidence
  if (metaContext.warnings.length > 0) {
    advice.routing.confidence *= 0.9; // Reduce confidence when anti-patterns detected
    advice.routing.meta_kb_warnings = metaContext.warnings.length;
  }
});
```

**Step 3: Run tests, verify pass**

**Step 4: Commit** with governance trailers

---

### Task 7: Inject Meta-Context into Skill Loading (Max 200 Tokens)

**Files:**
- Modify: `packages/opencode-plugin-preload-skills/src/index.js` (selectTools method)
- Create: `packages/opencode-plugin-preload-skills/src/meta-context-injector.js`
- Test: `packages/opencode-plugin-preload-skills/test/meta-context-injector.test.js`

**What this does:** When Tier 1 skills are loaded, inject a `<!-- META-KB CONTEXT -->` block at the top of the skill prompt with the top-3 most relevant meta-KB entries (by path match). Hard-capped at 200 tokens (~800 chars).

**Step 1: Create meta-context-injector module**

```javascript
// Generates a markdown block of relevant meta-KB context for skill prompts.
// Returns empty string if no relevant context or meta-KB unavailable.
function generateMetaContext(metaKBIndex, taskContext, maxChars = 800) {
  // 1. Find entries matching taskContext.files via by_affected_path
  // 2. Rank by recency (timestamp) and risk_level (high > medium > low)
  // 3. Take top 3
  // 4. Format as markdown block
  // 5. Truncate to maxChars
}
```

**Step 2: Write failing tests** (injector returns empty when no index, returns formatted block when matches exist, respects maxChars cap)

**Step 3: Implement**

**Step 4: Wire into selectTools()** — after Tier 1 classification, if meta-KB index is available, call injector and attach `meta_context` to tool metadata

**Step 5: Run tests, verify pass**

**Step 6: Commit** with governance trailers

---

### Task 8: SkillRL Integration — Meta-KB Informs Promotion/Demotion

**Files:**
- Modify: `packages/opencode-integration-layer/src/index.js` (where SkillRL is wired)
- Test: `packages/opencode-integration-layer/tests/meta-kb-skillrl.test.js`

**What this does:** SkillRL currently promotes/demotes skills based purely on usage frequency. This task adds meta-KB outcome data as a second signal: if the meta-KB records that a skill was involved in a high-risk anti-pattern, SkillRL weights it lower in promotion decisions.

**Step 1: Write failing tests**

Test cases:
1. Skills with anti-patterns in meta-KB get lower promotion scores
2. Skills with positive patterns in meta-KB get higher promotion scores
3. SkillRL works unchanged when meta-KB is unavailable (fail-open)

**Step 2: Implement meta-KB signal injection into SkillRL scoring**

**Step 3: Run tests, verify pass**

**Step 4: Run full test suite: `bun test`**

**Step 5: Commit** with governance trailers

---

### Task 9: Validate Phase 2

**Run Phase 2 acceptance criteria:**

```bash
# advise() routing confidence adjusts based on meta-KB
node -e "const {LearningEngine} = require('./packages/opencode-learning-engine/src/index'); const e = new LearningEngine({autoLoad:false}); const a = e.advise({task_type:'debug',files:['packages/opencode-learning-engine/src/index.js']}); console.log('meta_kb_warnings' in a.routing || a.meta_context)"

# Skill loading includes meta-context when available
# (manual verification via test)

# SkillRL respects meta-KB signals
# (verified via test)

# Full test suite passes
bun test
```

**Commit** with governance trailers marking Phase 2 complete

---

## Phase 3: Write-Back + Dashboard + Model-Router

> **Gate:** Phase 2 acceptance criteria MUST pass before starting Phase 3.

### Task 10: Post-Commit Synthesis Hook

**Files:**
- Modify: `scripts/learning-gate.mjs` (add synthesis trigger after validation passes)
- Alternatively: Create `.githooks/post-commit` that runs `node scripts/synthesize-meta-kb.mjs`

**What this does:** After a governed commit passes learning-gate validation, automatically re-run `synthesize-meta-kb.mjs` to keep the index fresh. This ensures the meta-KB is always up-to-date with the latest learning-updates.

**Guard:** Skip synthesis if the commit itself was a meta-KB synthesis update (`source: "meta-kb-auto"`) to prevent circular amplification.

**Step 1: Add post-commit trigger**
**Step 2: Test with a sample governed commit**
**Step 3: Commit** with governance trailers

---

### Task 11: Dashboard API Endpoint for Meta-KB Health

**Files:**
- Create: `packages/opencode-dashboard/src/app/api/meta-kb/route.ts`
- Test: `packages/opencode-dashboard/tests/meta-kb-route.test.ts`

**What this does:** Exposes a read-only API endpoint at `/api/meta-kb` that returns:
- Meta-KB index age (generated_at vs now)
- Total records, breakdown by category and risk level
- AGENTS.md drift status (runs check-agents-drift and returns results)
- Staleness warning if index > 24h old

**Step 1: Write failing test**
**Step 2: Implement route handler**
**Step 3: Run tests, verify pass**
**Step 4: Commit** with governance trailers

---

### Task 12: Model-Router Integration — Meta-KB Informs Model Selection

**Files:**
- Modify: `packages/opencode-model-router-x/src/index.js` (getLearningAdvice method, ~line 91)
- Test: `packages/opencode-model-router-x/test/meta-kb-routing.test.js`

**What this does:** Extends the existing `getLearningAdvice()` hook in model-router to also consult the meta-KB. If the meta-KB has entries about model-specific anti-patterns (e.g., "model X fails on long-context tasks"), adjust the model score.

**Step 1: Write failing test**
**Step 2: Extend getLearningAdvice() to query meta-KB**
**Step 3: Run tests, verify pass**
**Step 4: Run full test suite: `bun test`**
**Step 5: Commit** with governance trailers

---

### Task 13: AGENTS.md Drift Auto-Proposals

**Files:**
- Modify: `scripts/check-agents-drift.mjs` (add diff generation)
- Output: `.sisyphus/proposals/agents-drift-YYYY-MM-DD.md`

**What this does:** When drift is detected, generate a proposed markdown diff showing what AGENTS.md SHOULD say based on filesystem reality. Store in `.sisyphus/proposals/` for human review. Never auto-apply.

**Step 1: Extend drift script to generate proposed diffs**
**Step 2: Test by running against current (known-drifted) AGENTS.md files**
**Step 3: Commit** with governance trailers

---

### Task 14: Validate Phase 3 and Update Tracking

**Run Phase 3 acceptance criteria:**

```bash
# Post-commit synthesis works
# (verified via commit flow test)

# Dashboard meta-KB endpoint returns data
# (verified via route test)

# Model-router consults meta-KB
# (verified via unit test)

# Drift proposals generated
node scripts/check-agents-drift.mjs
ls .sisyphus/proposals/
# Assert: agents-drift-*.md file exists

# Full test suite passes
bun test
```

**Update tracking files:**
- Mark all tasks complete in this plan
- Update `.sisyphus/boulder.json` with wave9 completion
- Run final `bun test` to confirm

**Commit** with governance trailers

---

## Success Metrics

| Phase | Tasks | Deliverable | Verification |
|-------|-------|-------------|--------------|
| 1 | 5 | Synthesis script + reader + advisor integration | `meta-knowledge-index.json` exists, `advise()` has `meta_context` |
| 2 | 4 | Read hooks in advisor + skill loading + SkillRL | Routing adjusts based on meta-KB, skills get context |
| 3 | 5 | Write-back + dashboard + model-router + proposals | Post-commit synthesis, `/api/meta-kb`, drift proposals |

**Total Tasks:** 14
**Estimated Risk Points Reduced:** ~300

---

## Execution Strategy

**Sequential Phases:**
- Phase 1 (Tasks 1-5) → Validate → Phase 2 (Tasks 6-9) → Validate → Phase 3 (Tasks 10-14)

**Within phases, some parallelism:**
- Phase 1: Tasks 1-2 can run in parallel (independent scripts)
- Phase 2: Tasks 6-7 can run in parallel (different packages)
- Phase 3: Tasks 11-12 can run in parallel (dashboard and model-router are independent)

**Dependencies:**
- Task 3 depends on Task 1 (needs meta-knowledge-index.json to exist)
- Task 4 depends on Task 3 (needs MetaKBReader module)
- Task 6 depends on Task 4 (needs meta-KB wired into LearningEngine)
- Task 7 depends on Task 1 (needs index file)
- Task 8 depends on Task 4 (needs MetaKBReader)
- Task 10 depends on Task 1 (triggers synthesis script)

---

## Notes

**Acceptance Criteria per Task:**
- [ ] Implementation matches spec
- [ ] Tests added/regression tests pass
- [ ] `bun test` full suite passes
- [ ] Commit with Learning-Update trailer
- [ ] LSP diagnostics clean

---

## Plan Metadata

**Created:** 2026-03-08
**Based on:** Metis pre-planning analysis + 3 explore agent reports
**Total Tasks:** 14
**Estimated Duration:** 4-6 hours
**Estimated Risk Points:** ~300
**Phases:** 3 (validated gates between each)
