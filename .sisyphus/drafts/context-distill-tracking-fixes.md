# Draft: Context7 / Distill / Skill Tracking Fixes

## Requirements (confirmed)

### Issue 1 — Context7 + Distill Have No Calling Convention
- Both MCP servers are ENABLED in `opencode-config/opencode.json` (lines 631, 682)
- `distill` runs `--lazy` so it only starts on first explicit call
- ZERO skill files contain method-level invocation instructions
- `research-builder/SKILL.md:51` says "Use Context7 for library docs" — vague, no tool names
- `tool-usage-tracker.js:65-75` already registers `context7_resolve_library_id`, `context7_query_docs`, `distill` as known tools
- `tool-usage-tracker.js:134` lists `shouldUse: ['distill', 'prune']` showing intent exists
- `tool-tiers.json` lists context7 in Tier 1 for documentation/ai_ml/ruby_rails/search_research and distill in Tier 0 — but no enforcement

### Issue 2 — RL Tracking Covers Only 5 of 22+ Skills
- `skill-rl-state.json` has: systematic-debugging (0), test-driven-development (3), verification-before-completion (3), brainstorming (0), incremental-implementation (3)
- `opencode-config/skills/registry.json` defines 22+ skills across categories
- Missing from tracking: all superpowers/* skills, budget-aware-router, code-doctor, evaluation-harness-builder, incident-commander, innovation-migration-planner, research-builder, skill-orchestrator-runtime, token-reporter, task-orchestrator + others
- SkillRLManager at `packages/opencode-skill-rl-manager/src/skill-bank.js` has `recordUsage()` and `updateSuccessRate()` methods
- preload-skills plugin has its own tracking (`_onDemandTracker`, `_usageTracker` Maps) but disconnected from RL state

### Issue 3 — File Path Mismatch (Writer ≠ Readers)
- **Writer** (`opencode-skill-rl-manager/src/index.js:130`): `./skill-rl-state.json` — even has comment `// FIX: was setting stateFile but checking persistencePath`
- **Most Readers**:
  - `packages/opencode-dashboard/src/app/api/rl/route.ts:218` → `~/.opencode/skill-rl.json`
  - `packages/opencode-dashboard/src/app/api/memory-graph/...` → `~/.opencode/skill-rl.json`
  - `integration-tests/skillrl-api-regression.test.js:10` → `~/.opencode/skill-rl.json`
- **Mixed Reader** (`packages/opencode-dashboard/src/app/api/models/route.ts`): `~/.opencode/skill-rl-state.json` (with `-state` suffix!)
- **Dashboard File Watcher** (`events/route - rlState field`): `~/.opencode/skill-rl-state.json` (with `-state` suffix!)
- **Canonical target**: `~/.opencode/skill-rl.json` (majority of readers, integration tests)

### Issue 4 — No MCP Tool Invocation Tracking
- `tool-usage-tracker.js:167` has `logInvocation()` function that writes to `~/.opencode/tool-usage/invocations.json`
- This data is siloed — not fed into RL state or skill usage metrics
- MCP calls (context7, distill, supermemory, websearch, grep) generate zero tracking data
- No hook in oh-my-opencode to intercept MCP tool calls specifically

## Technical Decisions

### Fix 1: Where to add context7/distill calling conventions
- Update `opencode-config/skills/research-builder/SKILL.md` with explicit steps
- Update `opencode-config/skills/superpowers/*/` relevant skills that do research/investigation
- Add dedicated section to `tool-tiers.json` with explicit invocation documentation
- Consider adding a short `context-tools-guide` agent note or updating the librarian agent definition

### Fix 3: Canonical path
- Standardize on `~/.opencode/skill-rl.json` (no `-state` suffix)
- Files to update: SkillRLManager default + models API + dashboard watcher
- Need migration: copy existing `./skill-rl-state.json` data → `~/.opencode/skill-rl.json`

### Fix 4: Scope
- Wire `logInvocation()` outputs into RL state OR create new MCP-usage tracking bucket
- Lighter approach: emit event from tool-usage-tracker that SkillRLManager subscribes to
- Must be non-blocking (fire-and-forget), same pattern as memory-bus write

## Scope Boundaries
- INCLUDE: Files in `packages/opencode-skill-rl-manager/`, `packages/opencode-dashboard/src/app/api/`, `opencode-config/skills/`, `integration-tests/`
- INCLUDE: Dashboard file watcher path references
- EXCLUDE: Changing how MCP servers themselves work (no modifications to distill-mcp or context7)
- EXCLUDE: Full re-architecture of learning engine
- EXCLUDE: Adding new MCP servers

## Research Findings
- `tool-usage-tracker.js` already has context7 + distill in its known-tools registry
- The RL bug even has a comment `// FIX:` acknowledging the problem
- dashboard watcher uses DIFFERENT suffix (`skill-rl-state.json`) vs RL API (`skill-rl.json`)
- preload-skills has promotion/demotion logic that's disconnected from RL state
- All 22 skills in registry.json could be seeded into RL bank with initial success_rate defaults

## Open Questions
None — all requirements clear enough to plan.

## Parallelization Notes
- Fix 1 (skill files) is fully independent — can parallelize with everything
- Fix 3 (path fix) should complete before Fix 2 + Fix 4 (so new data lands in right location)
- Fix 2 + Fix 4 can run in parallel after Fix 3

## Pass 2 Audit Request (2026-02-27)

### New User Request
- Perform another exhaustive audit pass to discover overlooked gaps in:
  - skills / MCPs / plugins tracking
  - distribution and hook wiring
  - invocation protocols and actual utilization in runtime paths
- Use maximum search effort: parallel explore/librarian agents + direct grep/rg/ast-grep scans.

### Additional Preference Captured
- User prefers exhaustive, multi-source verification before conclusions on tracking/utilization health.

## Pass 2 Findings (In Progress Synthesis)

### Confirmed (current code, high confidence)
- `local/oh-my-opencode/src/plugin/tool-execute-after.ts` now calls `logInvocation` for MCP-prefixed tools, but logs empty params (`{}`) and only truncated output (`slice(0,200)`) — telemetry is present but shallow.
- `packages/opencode-learning-engine/src/tool-usage-tracker.js` `AVAILABLE_TOOLS` uses snake-case keys like `context7_resolve_library_id` and `distill`, while runtime invocation logs use hyphenated MCP-prefixed names like `mcp_context7_resolve-library-id` and `mcp_distill_browse_tools`.
- Because of name mismatch, usage metrics / breadth / appropriateness logic may classify MCP calls as unknown and undercount advanced docs/context tool utilization.
- `opencode-config/opencode.json` still has several MCP servers disabled (`tavily`, `playwright`, `github`) while protocol docs/skills assume broad MCP usage; this creates expectation-vs-runtime drift in “utilization” audits.
- `local/oh-my-opencode/src/plugin/tool-execute-after.ts` telemetry change exists under `local/` (gitignored in this repo), so main repo governance/commits cannot guarantee deployment parity for that hook.

### Likely gaps needing deeper validation (medium confidence)
- MCP telemetry is logged, but not yet joined to skill outcome/evolution metrics (no clear bridge from invocation log → SkillRL success/failure learning loop).
- Dashboard/file-watcher emits event classes (e.g. session updates) but downstream consumer semantics for RL-specific changes are still weakly typed.

### Stale claims from subagents rejected
- Prior subagent claim that `logInvocation` is not exported is outdated for current branch state (now exported).

### Oracle sanity-check (top additional blind spots)
- Runtime-vs-repo drift: `local/` is gitignored, so hook telemetry changes in `local/oh-my-opencode` can diverge from shipped plugin builds.
- Session join mismatch risk: hook sends `sessionId`, tracker analytics often join on `context.session`.
- Tool-name normalization risk: MCP-prefixed/hyphenated runtime names may not match canonical tracker keys.
- Config-vs-health-check drift: enabled/disabled/remote MCP config may not align with binary-based health assumptions.
- Missing integration join tests: no explicit end-to-end test that links tool telemetry rows to skill outcomes using a canonical id.

## User Check Before /start-work
- User asked whether any other context management/compression tools are being left out.
- Confirmed additional context controls beyond Distill/Prune that should be considered in scope:
  - `opencode-context-governor` (token budget controller)
  - `preemptiveCompaction` and `contextWindowMonitor` hooks in `tool.execute.after` chain
  - `supermemory` config has `compactionThreshold` and context injection knobs
