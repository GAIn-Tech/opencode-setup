# Parallel Agent Limits & Delegation Diversity Work Plan

## TL;DR

> **Objective**: Enable 20-30 parallel subagents on 96GB machine + restore intelligent delegation variety via fallback chains and Thompson Sampling integration

> **Deliverables**:
> - Increased category concurrency limits (deep=30, ultrabrain=25, default=15, quick=10)
> - Category fallback chains in oh-my-opencode.json
> - Thompson Sampling integration for category→model selection
> - Modernized fallback matrix in tier-router.js

> **Estimated Effort**: Medium  
> **Parallel Execution**: YES - independent tasks  
> **Critical Path**: Categories config → Policy limits → Fallback matrix → Thompson integration

---

## Context

### Original Problem
User observed: "our delegation range seems to have narrowed a lot" - previously more varied and jittered, now static.

### Investigation Findings

**Issue 1: Parallel Limits**
- Memory formula (executor.js:28-40): 96GB → 47 possible agents
- Hard cap: 100 (executor.js:266)  
- Category policy (orchestration-policy.js:16-24) CAUSES THE LIMIT:
  ```javascript
  const CATEGORY_BASE_CAPS = Object.freeze({
    deep: { fanout: 8, concurrency: 6 },
    ultrabrain: { fanout: 7, concurrency: 5 },
    default: { fanout: 4, concurrency: 3 },
    quick: { fanout: 3, concurrency: 2 },
  });
  ```

**Issue 2: Delegation Narrowing**
- Root cause: `opencode-config/oh-my-opencode.json` lines 67-92
- Each category maps to ONE fixed model (no fallback):
  ```json
  "categories": {
    "ultrabrain": { "model": "openai/gpt-5.3-codex" },
    "deep": { "model": "z-ai/glm-5" },
    "quick": { "model": "google/gemini-2.5-flash" }
  }
  ```
- Thompson Sampling router exists (`thompson-sampling-router.js`) but NOT wired into category selection

**Fallback Matrix Location**:
- `packages/opencode-model-router-x/src/tier-router.js` lines 78-84: `FALLBACK_TIER_MAP`
- `packages/opencode-model-router-x/src/tier-router.js` lines 89-103: `MODEL_CAPABILITIES` registry

---

## Work Objectives

### Core Objective
Enable high-parallelism agent dispatch while restoring intelligent, varied delegation through fallback chains and probabilistic model selection.

### Concrete Deliverables
- [ ] Updated CATEGORY_BASE_CAPS in orchestration-policy.js
- [ ] Fallback chains added to each category in oh-my-opencode.json  
- [ ] MODEL_CAPABILITIES registry modernized with current models
- [ ] Thompson Sampling integrated into category selection flow

### Definition of Done
- [ ] Can spawn 25+ parallel agents without hitting category caps
- [ ] Category selection uses probabilistic sampling (not static)
- [ ] Fallback chain used when primary model fails
- [ ] All configs valid JSON

### Must Have
- Tiered concurrency: deep=30, ultrabrain=25, default=15, quick=10
- 2-3 fallback models per category
- Thompson Sampling applied to category→model selection

### Must NOT Have
- Hard-coded single-model categories (current state)
- Removed or broken fallback logic

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (bun test framework)
- **Automated tests**: Tests-after (add tests for new behavior)
- **Framework**: bun test

### Agent-Executed QA Scenarios

**Scenario: Category concurrency limit increased**  
Tool: Bash  
Preconditions: Test file modified  
Steps:
1. Read orchestration-policy.js CATEGORY_BASE_CAPS
2. Assert deep.fanout >= 30
3. Assert ultrabrain.fanout >= 25
4. Assert default.fanout >= 15  
5. Assert quick.fanout >= 10
Expected Result: All values meet threshold

**Scenario: Fallback chain exists for category**  
Tool: Bash  
Preconditions: oh-my-opencode.json modified  
Steps:
1. Parse categories section
2. For each category, check for "fallbacks" array with 2+ models
3. Assert primary model != fallback[0]
Expected Result: All categories have fallback arrays

**Scenario: Thompson Sampling selects varied models**  
Tool: Bash (node)  
Preconditions: Thompson router integrated  
Steps:
1. Import ThompsonSamplingRouter
2. Call select() 10 times for same category
3. Collect unique models selected
4. Assert unique models >= 3
Expected Result: Variety in selection over 10 calls

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Update CATEGORY_BASE_CAPS in orchestration-policy.js
├── Task 2: Add fallback chains to oh-my-opencode.json categories
└── Task 3: Modernize MODEL_CAPABILITIES in tier-router.js

Wave 2 (After Wave 1):
├── Task 4: Integrate Thompson Sampling into category selection
└── Task 5: Add verification tests

Wave 3 (After Wave 2):
└── Task 6: Validate full integration
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 4 | 2, 3 |
| 2 | None | 4 | 1, 3 |
| 3 | None | None | 1, 2 |
| 4 | 1, 2 | 5 | None |
| 5 | 4 | 6 | None |
| 6 | 5 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2, 3 | quick (config changes) |
| 2 | 4, 5 | ultrabrain (integration logic) |
| 3 | 6 | quick (validation) |

---

## TODOs

### Task 1: Update CATEGORY_BASE_CAPS in orchestration-policy.js

**What to do**:
- Read `packages/opencode-integration-layer/src/orchestration-policy.js`
- **IMPORTANT**: Metis identified category name mismatch risk:
  - Policy uses: `deep, ultrabrain, research, architecture, unspecified-high, quick, default`
  - oh-my-opencode.json uses: `visual-engineering, ultrabrain, deep, artistry, quick, unspecified-low, unspecified-high, writing`
- Verify which categories are ACTUALLY used at runtime (check task classification)
- Add any missing categories from oh-my-opencode.json to the caps
- Modify CATEGORY_BASE_CAPS (lines 16-24):
  ```javascript
  const CATEGORY_BASE_CAPS = Object.freeze({
    deep: { fanout: 30, concurrency: 25 },
    ultrabrain: { fanout: 25, concurrency: 20 },
    research: { fanout: 20, concurrency: 15 },
    architecture: { fanout: 20, concurrency: 15 },
    'unspecified-high': { fanout: 15, concurrency: 12 },
    'unspecified-low': { fanout: 15, concurrency: 12 },
    quick: { fanout: 10, concurrency: 8 },
    default: { fanout: 15, concurrency: 12 },
    // Add categories from oh-my-opencode.json not in policy
    'visual-engineering': { fanout: 20, concurrency: 15 },
    artistry: { fanout: 20, concurrency: 15 },
    writing: { fanout: 10, concurrency: 8 },
  });
  ```

**Must NOT do**:
- Remove any category entries
- Set values below requested thresholds

**Recommended Agent Profile**:
- **Category**: quick
- Reason: Simple config file edit, no complex logic
- **Skills**: []
- **Skills Evaluated but Omitted**: N/A

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 2, 3)
- **Blocks**: Task 4
- **Blocked By**: None (can start immediately)

**References**:
- `packages/opencode-sisyphus-state/src/executor.js:262-263` - Shows where defaultParallelConcurrency comes from policy
- `packages/opencode-integration-layer/src/orchestration-policy.js:108-151` - Shows how policy resolves maxFanout/maxConcurrency

**Acceptance Criteria**:
- [ ] File `packages/opencode-integration-layer/src/orchestration-policy.js` modified
- [ ] CATEGORY_BASE_CAPS.deep.fanout >= 30
- [ ] CATEGORY_BASE_CAPS.ultrabrain.fanout >= 25
- [ ] CATEGORY_BASE_CAPS.default.fanout >= 15
- [ ] CATEGORY_BASE_CAPS.quick.fanout >= 10
- [ ] All categories from oh-my-opencode.json are present in caps (including visual-engineering, artistry, writing, unspecified-low)

**Agent-Executed QA Scenarios**:

```
Scenario: Verify category caps increased
Tool: Bash
Preconditions: None
Steps:
1. grep -A 10 "CATEGORY_BASE_CAPS" packages/opencode-integration-layer/src/orchestration-policy.js
2. Parse the JSON-like object
3. Assert deep.fanout >= 30
4. Assert ultrabrain.fanout >= 25
5. Assert default.fanout >= 15
6. Assert quick.fanout >= 10
Expected Result: All assertions pass, no errors
Evidence: grep output captured
```

**Commit**: YES
- Message: `perf: increase category parallel concurrency limits for 96GB machine`
- Files: `packages/opencode-integration-layer/src/orchestration-policy.js`
- Pre-commit: None required

---

### Task 2: Add fallback chains to oh-my-opencode.json categories

**What to do**:
- Read `opencode-config/oh-my-opencode.json`
- Modify each category to include "fallbacks" array:
  ```json
  "categories": {
    "ultrabrain": {
      "model": "openai/gpt-5.3-codex",
      "fallbacks": [
        "anthropic/claude-opus-4-6",
        "antigravity/antigravity-claude-opus-4-6-thinking"
      ]
    },
    "deep": {
      "model": "z-ai/glm-5",
      "fallbacks": [
        "anthropic/claude-opus-4-6",
        "openai/gpt-5.3-codex"
      ]
    },
    "visual-engineering": {
      "model": "openai/gpt-5.2",
      "fallbacks": [
        "google/gemini-2.5-pro",
        "anthropic/claude-sonnet-4-5"
      ]
    },
    "artistry": {
      "model": "openai/gpt-5.2",
      "fallbacks": [
        "google/gemini-2.5-pro",
        "anthropic/claude-opus-4-6"
      ]
    },
    "quick": {
      "model": "google/gemini-2.5-flash",
      "fallbacks": [
        "moonshotai/kimi-k2.5-free",
        "anthropic/claude-haiku-4-5"
      ]
    },
    "default": {
      "model": "antigravity/antigravity-gemini-3-flash",
      "fallbacks": [
        "google/gemini-2.5-flash",
        "moonshotai/kimi-k2.5"
      ]
    },
    "unspecified-low": {
      "model": "moonshotai/kimi-k2.5",
      "fallbacks": [
        "google/gemini-2.5-flash",
        "antigravity/antigravity-gemini-3-flash"
      ]
    },
    "unspecified-high": {
      "model": "openai/gpt-5.3-codex",
      "fallbacks": [
        "anthropic/claude-opus-4-6",
        "z-ai/glm-5"
      ]
    },
    "writing": {
      "model": "google/gemini-2.5-flash",
      "fallbacks": [
        "anthropic/claude-sonnet-4-5",
        "openai/gpt-5.2"
      ]
    }
  }
  ```
- Ensure JSON is valid after changes

**Must NOT do**:
- Remove primary model field
- Make fallbacks array empty
- Duplicate primary model in fallbacks

**Recommended Agent Profile**:
- **Category**: quick
- Reason: JSON config modification, straightforward
- **Skills**: []
- **Skills Evaluated but Omitted**: N/A

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 1, 3)
- **Blocks**: Task 4
- **Blocked By**: None (can start immediately)

**References**:
- `packages/opencode-model-router-x/src/strategies/model-selection-config.js` - Shows how model config is loaded
- `packages/opencode-model-router-x/src/tier-router.js:78-84` - FALLBACK_TIER_MAP for reference pattern

**Acceptance Criteria**:
- [ ] File `opencode-config/oh-my-opencode.json` modified
- [ ] All 9 categories have "fallbacks" array with 2+ models
- [ ] Primary model != any fallback model
- [ ] Valid JSON after modification

**Agent-Executed QA Scenarios**:

```
Scenario: Validate category fallback chains
Tool: Bash
Preconditions: oh-my-opencode.json modified
Steps:
1. node -e "const c = require('./opencode-config/oh-my-opencode.json'); const cats = c.categories; Object.keys(cats).forEach(k => { if (!cats[k].fallbacks || cats[k].fallbacks.length < 2) throw new Error(k + ' missing fallbacks'); if (cats[k].fallbacks.includes(cats[k].model)) throw new Error(k + ' fallback duplicates primary'); }); console.log('All categories have valid fallbacks')"
Expected Result: "All categories have valid fallbacks" printed
Evidence: None (pass/fail)

Scenario: Verify JSON is valid
Tool: Bash
Preconditions: None
Steps:
1. node -e "JSON.parse(require('fs').readFileSync('opencode-config/oh-my-opencode.json'))"
2. Assert exit code 0
Expected Result: No errors
Evidence: None
```

**Commit**: YES
- Message: `feat: add fallback chains to category model selection`
- Files: `opencode-config/oh-my-opencode.json`
- Pre-commit: None required

---

### Task 3: Modernize MODEL_CAPABILITIES in tier-router.js

**What to do**:
- Read `packages/opencode-model-router-x/src/tier-router.js`
- Update MODEL_CAPABILITIES (lines 89-103) to include current models from oh-my-opencode.json:
  ```javascript
  const MODEL_CAPABILITIES = {
    // Anthropic
    'claude-opus-4-6': { vision: true, tools: true, reasoning: true, large_context: true },
    'claude-opus-4-6-thinking': { vision: true, tools: true, reasoning: true, large_context: true },
    'claude-sonnet-4-5': { vision: true, tools: true, reasoning: true, large_context: true },
    'claude-haiku-4-5': { vision: false, tools: true, reasoning: false, large_context: false },
    // OpenAI
    'gpt-5': { vision: true, tools: true, reasoning: true, large_context: true },
    'gpt-5.2': { vision: true, tools: true, reasoning: true, large_context: true },
    'gpt-5.3-codex': { vision: true, tools: true, reasoning: true, large_context: true },
    // Google
    'gemini-2.5-flash': { vision: true, tools: true, reasoning: true, large_context: true },
    'gemini-2.5-pro': { vision: true, tools: true, reasoning: true, large_context: true },
    'gemini-3-flash': { vision: true, tools: true, reasoning: true, large_context: true },
    // Moonshot
    'kimi-k2.5': { vision: false, tools: true, reasoning: true, large_context: true },
    'kimi-k2.5-free': { vision: false, tools: true, reasoning: true, large_context: true },
    // Z-ai
    'glm-5': { vision: false, tools: true, reasoning: true, large_context: true },
    // Antigravity (proxied)
    'antigravity-gemini-3-flash': { vision: true, tools: true, reasoning: true, large_context: true },
    'antigravity-claude-opus-4-6-thinking': { vision: true, tools: true, reasoning: true, large_context: true },
  };
  ```

**Must NOT do**:
- Remove existing capability definitions
- Set capabilities to incorrect values
- Use model IDs that don't exist in opencode.json (normalization issue from Metis)

**IMPORTANT**: Model ID normalization
- oh-my-opencode.json uses: `openai/gpt-5.3-codex`, `z-ai/glm-5`, etc.
- tier-router uses: `gpt-5.3-codex`, `glm5`, etc.
- Add helper function to normalize IDs between formats:
  ```javascript
  function normalizeModelId(id) {
    // Remove provider prefix: openai/gpt-5.3-codex → gpt-5.3-codex
    // Remove org prefix: z-ai/glm-5 → glm-5
    // Standardize: antigravity-gemini-3-flash → gemini-3-flash (if antigravity proxy)
    return id?.split('/').pop() || id;
  }
  ```

**Recommended Agent Profile**:
- **Category**: quick
- Reason: Simple capability registry update
- **Skills**: []
- **Skills Evaluated but Omitted**: N/A

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 1, 2)
- **Blocks**: None (validation only)
- **Blocked By**: None (can start immediately)

**References**:
- `opencode-config/oh-my-opencode.json` - Current model list
- `packages/opencode-model-router-x/src/tier-router.js:89-103` - Existing capability format

**Acceptance Criteria**:
- [ ] File `packages/opencode-model-router-x/src/tier-router.js` modified
- [ ] MODEL_CAPABILITIES includes all models from oh-my-opencode.json categories
- [ ] Each model has vision/tools/reasoning/large_context flags

**Agent-Executed QA Scenarios**:

```
Scenario: Verify MODEL_CAPABILITIES completeness
Tool: Bash
Preconditions: tier-router.js modified
Steps:
1. node -e "const tr = require('./packages/opencode-model-router-x/src/tier-router.js'); const caps = Object.keys(tr.MODEL_CAPABILITIES || {}); const expected = ['claude-opus-4-6','gpt-5.3-codex','gemini-2.5-flash','kimi-k2.5','glm-5']; expected.forEach(m => { if (!caps.includes(m)) throw new Error('Missing: ' + m); }); console.log('All key models present');"
Expected Result: "All key models present"
Evidence: None
```

**Commit**: YES
- Message: `feat: modernize MODEL_CAPABILITIES registry with current models`
- Files: `packages/opencode-model-router-x/src/tier-router.js`
- Pre-commit: None required

---

### Task 4: Integrate Thompson Sampling into category selection

**What to do**:
- Read `packages/opencode-model-router-x/src/index.js` - find where category model selection happens
- Read `packages/opencode-model-router-x/src/thompson-sampling-router.js` - understand the API
- **CRITICAL FIX**: Metis found Thompson could collapse to single model without proper initialization
  - Problem: `select()` returns random model only when NO posterior data exists
  - Once any model gets updates, it dominates
  - **Solution**: Initialize priors for ALL candidate models in fallback chain BEFORE selection
- Modify the category selection flow to:
  1. Load ThompsonSamplingRouter  
  2. Get category config including primary + fallbacks
  3. **Initialize priors for ALL candidates** (alpha=1, beta=1 for each)
  4. Use Thompson Sampling to pick from [primary, ...fallbacks]
  5. Update posterior on success/failure

Key integration point - find where categories are resolved to models:
- Search for "categories" in index.js
- Find where `context.category` or similar drives model selection

Alternative approach if direct integration complex:
- Create wrapper function `selectModelForCategory(category)` that:
  1. Gets category config from oh-my-opencode.json (including fallbacks)
  2. **Initializes priors for all candidates** (uniform exploration)
  3. Uses Thompson Sampling to pick from [primary, ...fallbacks]
  4. Returns selected model

**Must NOT do**:
- Break existing model selection for non-category tasks
- Remove fallback chain usage

**Recommended Agent Profile**:
- **Category**: ultrabrain
- Reason: Integration logic requires understanding both components
- **Skills**: []
- **Skills Evaluated but Omitted**: N/A

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: N/A
- **Blocks**: Task 5
- **Blocked By**: Tasks 1, 2 (need category config and fallbacks)

**References**:
- `packages/opencode-model-router-x/src/thompson-sampling-router.js:53-84` - select() method
- `packages/opencode-model-router-x/src/thompson-sampling-router.js:92-114` - update() method for learning

**Acceptance Criteria**:
- [ ] Category selection uses Thompson Sampling
- [ ] Selection includes fallback models (not just primary)
- [ ] Thompson Sampling state updates on model outcomes

**Agent-Executed QA Scenarios**:

```
Scenario: Thompson Sampling provides varied selection
Tool: Bash (node)
Preconditions: Integration complete
Steps:
1. node -e "
const TSR = require('./packages/opencode-model-router-x/src/thompson-sampling-router.js');
const router = new TSR();
const results = new Set();
for (let i = 0; i < 20; i++) results.add(router.select('ultrabrain'));
console.log('Unique models selected:', results.size);
if (results.size < 3) throw new Error('Insufficient variety');
"
Expected Result: "Unique models selected: 3" or more
Evidence: None
```

**Commit**: YES
- Message: `feat: integrate Thompson Sampling for category model selection`
- Files: `packages/opencode-model-router-x/src/index.js`
- Pre-commit: None required

---

### Task 5: Add verification tests

**What to do**:
- Create test file `packages/opencode-integration-layer/tests/category-caps.test.js`:
  ```javascript
  const { describe, test, expect } = require('bun:test');
  const { CATEGORY_BASE_CAPS } = require('../src/orchestration-policy');
  
  describe('Category Concurrency Limits', () => {
    test('deep category has adequate fanout', () => {
      expect(CATEGORY_BASE_CAPS.deep.fanout).toBeGreaterThanOrEqual(30);
    });
    test('ultrabrain category has adequate fanout', () => {
      expect(CATEGORY_BASE_CAPS.ultrabrain.fanout).toBeGreaterThanOrEqual(25);
    });
    // ... etc
  });
  ```

- Create test file `packages/opencode-model-router-x/test/category-fallbacks.test.js`:
  ```javascript
  const { describe, test, expect } = require('bun:test');
  const config = require('../../opencode-config/oh-my-opencode.json');
  
  describe('Category Fallbacks', () => {
    test('each category has fallbacks array', () => {
      Object.entries(config.categories).forEach(([name, cat]) => {
        expect(cat.fallbacks).toBeDefined();
        expect(cat.fallbacks.length).toBeGreaterThanOrEqual(2);
      });
    });
  });
  ```

- Run tests to verify

**Must NOT do**:
- Add tests that will fail with current implementation
- Skip existing test suites

**Recommended Agent Profile**:
- **Category**: quick
- Reason: Test file creation, straightforward
- **Skills**: []
- **Skills Evaluated but Omitted**: N/A

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: N/A
- **Blocks**: Task 6
- **Blocked By**: Task 4

**References**:
- `packages/opencode-integration-layer/tests/orchestration-policy.test.js` - Existing policy tests
- `packages/opencode-model-router-x/test/tier-router.test.js` - Existing router tests

**Acceptance Criteria**:
- [ ] Test file created for category caps
- [ ] Test file created for category fallbacks
- [ ] All new tests pass

**Agent-Executed QA Scenarios**:

```
Scenario: Run new tests
Tool: Bash
Preconditions: Test files created
Steps:
1. bun test packages/opencode-integration-layer/tests/category-caps.test.js
2. bun test packages/opencode-model-router-x/test/category-fallbacks.test.js
Expected Result: All tests pass
Evidence: Test output captured
```

**Commit**: YES
- Message: `test: add category caps and fallback verification tests`
- Files: New test files
- Pre-commit: None required

---

### Task 6: Validate full integration

**What to do**:
- Run full test suite to ensure no regressions:
  ```bash
  bun test packages/opencode-integration-layer/tests/
  bun test packages/opencode-model-router-x/test/
  ```
- Verify JSON configs are valid:
  ```bash
  node -e "JSON.parse(require('fs').readFileSync('opencode-config/oh-my-opencode.json'))"
  ```
- Manual verification: Check that orchestration policy resolves correctly with new limits

**Must NOT do**:
- Skip test runs
- Ignore failures

**Recommended Agent Profile**:
- **Category**: quick
- Reason: Validation tasks
- **Skills**: []
- **Skills Evaluated but Omitted**: N/A

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: N/A
- **Blocks**: None (final task)
- **Blocked By**: Task 5

**References**:
- N/A

**Acceptance Criteria**:
- [ ] All integration-layer tests pass
- [ ] All model-router tests pass
- [ ] JSON config valid

**Agent-Executed QA Scenarios**:

```
Scenario: Full test suite passes
Tool: Bash
Preconditions: All tasks complete
Steps:
1. bun test packages/opencode-integration-layer/tests/ 2>&1 | tail -5
2. bun test packages/opencode-model-router-x/test/ 2>&1 | tail -5
Expected Result: No failures shown
Evidence: Test output
```

**Commit**: YES (if changes since last commit)
- Message: `chore: complete parallel agent limits and delegation diversity work`
- Files: Any remaining modified files
- Pre-commit: None required

---

## Success Criteria

### Verification Commands

```bash
# Verify category caps
grep -A 10 "CATEGORY_BASE_CAPS" packages/opencode-integration-layer/src/orchestration-policy.js

# Verify fallback chains
node -e "const c = require('./opencode-config/oh-my-opencode.json'); console.log(Object.keys(c.categories).map(k => k + ': ' + c.categories[k].fallbacks?.length))"

# Verify Thompson integration (requires runtime test)
# Run actual tasks and observe model variety
```

### Final Checklist
- [ ] All "Must Have" present (concurrency limits, fallbacks, Thompson)
- [ ] All "Must NOT Have" absent (static single-model categories)
- [ ] All tests pass