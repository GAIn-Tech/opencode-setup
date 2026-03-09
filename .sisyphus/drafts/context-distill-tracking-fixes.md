# Draft: Context7 / Distill / Skill Tracking Fixes

## Status: ✅ ALL ISSUES RESOLVED (verified 2026-03-09)

All 4 original issues and their fixes have been verified as implemented in the codebase.

---

## Issue 1 — Context7 + Distill Have No Calling Convention → ✅ RESOLVED

**Evidence:**
- `opencode-config/skills/context7/SKILL.md` — Full invocation protocol with `mcp_context7_resolve-library-id` and `mcp_context7_query-docs` steps (lines 66-87)
- `opencode-config/skills/distill/SKILL.md` — Full invocation protocol with `mcp_distill_browse_tools` and `mcp_distill_run_tool` steps (lines 66-77)
- `opencode-config/skills/dcp/SKILL.md` — Complete integration diagram and signal flow
- `opencode-config/skills/research-builder/SKILL.md` — Explicit Context7 steps (lines 51-54)
- `opencode-config/agents/librarian.md` — Explicit Context7 invocation in agent prompt

## Issue 2 — RL Tracking Covers Only 5 of 22+ Skills → ✅ RESOLVED

**Evidence:**
- `packages/opencode-skill-rl-manager/src/index.js:241` — `syncWithRegistry()` reads `registry.json` (30+ skills) and additively seeds all missing skills into the skill bank
- Called in constructor at line 150 — runs on every SkillRLManager instantiation
- `opencode-config/skills/registry.json` — Contains 30+ skills across 11 categories with full metadata

## Issue 3 — File Path Mismatch (Writer ≠ Readers) → ✅ RESOLVED

**Evidence:**
- `packages/opencode-skill-rl-manager/src/index.js:131` — Writer uses `path.join(os.homedir(), '.opencode', 'skill-rl.json')` (canonical path)
- `packages/opencode-dashboard/src/app/api/rl/route.ts:218` — Reader uses `path.join(os.homedir(), '.opencode', 'skill-rl.json')` (same path)
- `packages/opencode-skill-rl-manager/src/index.js:136-143` — One-time migration from legacy `./skill-rl-state.json` to canonical path
- Confirmed in `opencode-config/meta-knowledge-index.json` with 5 separate learning-update entries documenting this fix

## Issue 4 — No MCP Tool Invocation Tracking → ✅ RESOLVED

**Evidence:**
- `packages/opencode-learning-engine/src/tool-usage-tracker.js:194` — `logInvocation()` function with MCP tool normalization
- `packages/opencode-learning-engine/src/tool-usage-tracker.js:307-339` — `normalizeMcpToolName()` correctly maps `mcp_context7_resolve-library-id` → `context7_resolve_library_id`
- `packages/opencode-learning-engine/src/tool-usage-tracker.js:739,750` — Both `logInvocation` and `normalizeMcpToolName` exported
- `local/oh-my-opencode/src/plugin/tool-execute-after.ts` — Calls `logInvocation` for MCP-prefixed tools
- `packages/opencode-learning-engine/src/tool-usage-tracker.js:712-731` — `resolveSessionKey()` and `migrateSessionKeys()` handle session ID join

---

## Remaining Enhancement Opportunities (Non-Blocking)

These are future improvements, not critical gaps:

1. **MCP telemetry → SkillRL bridge**: Tool invocation logs and SkillRL outcomes remain in separate data stores. A future enhancement could map "which MCP tools were used during a skill's execution" back to the skill's success_rate.

2. **`local/` gitignore drift**: Hook telemetry in `local/oh-my-opencode` is gitignored in this repo. Changes there can diverge from the shipped npm plugin build. Not a code bug — an operational concern.

3. **Shallow MCP telemetry**: `tool-execute-after.ts` logs empty params (`{}`) and truncated output (`slice(0,200)`) for MCP calls. Richer telemetry would improve diagnostics.

---

## Audit Trail

- **Original draft**: 2026-02-27
- **Pass 2 audit**: 2026-02-27
- **Final verification**: 2026-03-09 — All 4 issues confirmed resolved in current codebase
- **AGENTS.md drift**: Fixed 259→291 files, 12→14 skills (2026-03-09)
