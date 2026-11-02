# Model References Audit Report
Date: 2026-02-15
Scope: All configuration files, strategy files, and API routes across 7 providers
Status: AUDIT ONLY - No modifications made

## CRITICAL FINDINGS

OPENAI: Multiple non-existent models (gpt-5, gpt-5.2, gpt-5.3-*) - OBSOLETE
GOOGLE: Using gemini-2.0-flash (deprecated) instead of gemini-2.5-* - INCONSISTENT
ANTHROPIC: Health check uses claude-3-haiku-20240307 (deprecated)
GROQ: Correctly using llama-3.3-70b-versatile (decommissioned llama-3.1 removed)
NVIDIA: Valid models (llama-3.1-405b, llama-3.3-70b)
CEREBRAS: Valid models (llama-3.3-70b)
SAMBANOVA: Orphaned definition in policies.json, not integrated

## OPENAI - CRITICAL ISSUES

Non-existent Models Found:
- gpt-5 (policies.json lines 32, 56, 71)
- gpt-5-mini (rate-limit-fallback.json line 12)
- gpt-4.1 (rate-limit-fallback.json line 13)
- gpt-5.2 (token-cost-calculator.js lines 35-37)
- gpt-5.3-codex (fallback-layer-strategy.js lines 91-97)
- gpt-5.3-pro (fallback-layer-strategy.js lines 95-97)

Valid Models:
- gpt-4o (rate-limit-fallback.json line 11) ✓
- gpt-4o-mini (rate-limit-fallback.json line 12) ✓
- o1 (rate-limit-fallback.json line 13) ✓

## GOOGLE - INCONSISTENCY ISSUES

Outdated Models:
- gemini-2.0-flash (providers/route.ts lines 76, 79) - should be gemini-2.5-flash
- gemini-3-* (fallback-layer-strategy.js lines 64-72) - not in main config
- gemini-3-*-thinking (token-cost-calculator.js lines 24-31) - not in main config

Valid Models:
- gemini-2.5-flash (opencode.json line 66) ✓
- gemini-2.5-pro (opencode.json line 71) ✓
- antigravity-gemini-3-* (opencode.json) ✓

## ANTHROPIC - MINOR ISSUES

Deprecated Models:
- claude-3-haiku-20240307 (providers/route.ts line 64) - should be claude-haiku-4-5

Valid Models:
- claude-opus-4-6 ✓
- claude-sonnet-4-5 ✓
- claude-haiku-4-5 ✓

## GROQ - VALID

Current Models:
- llama-3.3-70b-versatile (opencode.json line 104) ✓

Outdated in Health Check:
- llama-3.1-70b-versatile (providers/route.ts line 86) - should be llama-3.3-70b-versatile

## FILES REQUIRING UPDATES

Priority 1 (CRITICAL):
1. packages/opencode-model-router-x/src/policies.json
   - Lines 32, 56, 71: Replace gpt-5 with gpt-4o

2. rate-limit-fallback.json
   - Lines 11-13: Replace gpt-5, gpt-5-mini, gpt-4.1 with valid models

3. packages/opencode-model-router-x/src/strategies/token-cost-calculator.js
   - Lines 35-39: Remove gpt-5.2 variants, add gpt-4o/o1

4. packages/opencode-model-router-x/src/strategies/fallback-layer-strategy.js
   - Lines 91-97: Replace gpt-5.3-* with gpt-4o

Priority 2 (MEDIUM):
5. packages/opencode-dashboard/src/app/api/providers/route.ts
   - Line 64: claude-3-haiku-20240307 → claude-haiku-4-5
   - Lines 76, 79: gemini-2.0-flash → gemini-2.5-flash
   - Line 86: llama-3.1-70b-versatile → llama-3.3-70b-versatile

6. packages/opencode-model-router-x/src/strategies/fallback-layer-strategy.js
   - Lines 64-72: gemini-3-* → gemini-2.5-*

7. packages/opencode-model-router-x/src/strategies/token-cost-calculator.js
   - Lines 24-31: gemini-3-* → gemini-2.5-*

Priority 3 (LOW):
8. packages/opencode-model-router-x/src/policies.json
   - Lines 161-169: Remove SambaNova or integrate into opencode.json

