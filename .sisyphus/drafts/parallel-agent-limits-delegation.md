# Draft: Parallel Agent Limits + Delegation Diversity

## Issue 1: Parallel Agent Limits

**Current state:**
- Memory formula (executor.js:28-40): 96GB RAM → 47 possible
- Hard cap: 100 (executor.js:266)
- Category policy caps (orchestration-policy.js:16-24):
  - deep: 8 fanout, 6 concurrency
  - ultrabrain: 7 fanout, 5 concurrency
  - default: 4 fanout, 3 concurrency
  - quick: 3 fanout, 2 concurrency

**Files to modify:**
1. `packages/opencode-integration-layer/src/orchestration-policy.js` - Increase CATEGORY_BASE_CAPS

## Issue 2: Delegation Range Narrowed

**Root cause identified:**
- `opencode-config/oh-my-opencode.json` lines 67-92: Each category maps to **ONE fixed model**
- Example: `ultrabrain` → always `openai/gpt-5.3-codex`
- Thompson Sampling router exists (`packages/opencode-model-router-x/src/thompson-sampling-router.js`) but is NOT integrated into category-based selection

**The system was more varied before because:**
- Previously may have used fallback chains or randomization
- Now: static 1:1 category→model mapping

**Files to investigate/modify:**
1. `opencode-config/oh-my-opencode.json` - Add fallback chains per category
2. Investigate why Thompson Sampling isn't being used for category selection

## Requirements Clarification Needed
1. What specific fanout/concurrency values for each category?
2. Should delegation use Thompson Sampling for category→model selection?
3. Or add fallback chains to categories?
4. Any specific models to include in fallbacks?