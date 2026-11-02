# Context7 MCP → CLI Conversion Audit (2026-03-15)

## Executive Summary

**Total Skills Affected: 6**
- **Direct Usage (Explicit Tool Calls): 3 skills**
- **Synergy References: 3 skills**
- **Total MCP Tool Calls Found: 6 unique invocations**

## Skills Using Context7 MCP Tools (Direct)

### 1. context7/SKILL.md (Primary Definition)
**File:** opencode-config/skills/context7/SKILL.md

**Tool Calls:**
- Line 66: mcp_context7_resolve-library-id
  Parameters: { libraryName: string, query: string }
  Example: { "libraryName": "react", "query": "useEffect hook cleanup function" }
  
- Line 79: mcp_context7_query-docs
  Parameters: { libraryId: string, query: string }
  Example: { "libraryId": "/facebook/react", "query": "useEffect cleanup function with event listeners" }

**Workflow:** Two-phase (resolve → query)
**API Limits:** Max 3 calls per tool per question
**Error Handling:** None specified (should fallback to websearch)

### 2. research-builder/SKILL.md
**File:** opencode-config/skills/research-builder/SKILL.md

**Tool Calls (Indirect - via context7 skill):**
- Lines 51-54: Recommends context7 for unfamiliar external libraries
  Phase 1 (Research): Call mcp_context7_resolve-library-id
  Then: call mcp_context7_query-docs
  Fallback: If library not found, fall back to websearch

**Workflow:** Multi-source research protocol
**Integration:** Part of Phase 1 (Research) before spec creation
**Fallback:** websearch if library not found

### 3. skill-orchestrator-runtime/SKILL.md
**File:** opencode-config/skills/skill-orchestrator-runtime/SKILL.md

**Auto-Recommendation Logic (Lines 149-175):**
- Line 151: When task involves library/framework documentation lookups, recommend context7
- Lines 155-160: Detection keywords for auto-recommendation
- Line 166: Recommendation score: 0.9 (PRIMARY)
- Line 167: Chaining rule: context7 → research-builder
- Line 174: Profile integration: research-to-code includes context7 as first skill

## Skills Referencing Context7 (Synergies)

4. websearch/SKILL.md - Line 15: synergies include context7
5. grep/SKILL.md - Line 15: synergies include context7
6. supermemory/SKILL.md - Line 33: tool_affinities context7: 0.3

## Summary Table

| Skill | File | Direct Calls | Update Required | Priority |
|-------|------|--------------|-----------------|----------|
| context7 | skills/context7/SKILL.md | 2 (resolve, query) | YES | HIGH |
| research-builder | skills/research-builder/SKILL.md | 2 (indirect) | YES | HIGH |
| skill-orchestrator-runtime | skills/skill-orchestrator-runtime/SKILL.md | 0 (auto-recommend) | MAYBE | MEDIUM |
| websearch | skills/websearch/SKILL.md | 0 (synergy) | NO | - |
| grep | skills/grep/SKILL.md | 0 (synergy) | NO | - |
| supermemory | skills/supermemory/SKILL.md | 0 (affinity) | NO | - |
