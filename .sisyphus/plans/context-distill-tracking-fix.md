# Context-Distill Tracking Fixes Plan

## TL;DR
> **Quick Summary**: Fix broken Context7/Distill MCP tracking + SkillRL production integration
> 
> **Deliverables**:
> - logInvocation exported from tool-usage-tracker
> - SkillRLManager wired in production (oh-my-opencode)
> - Fix path fragmentation (skill-rl-state.json vs skill-rl.json)
> - Context7/Distill calling conventions documented
>
> **Critical Path**: Verify exports → Wire production → Fix paths → Document

---

## Pre-Flight

### What Exists
- `packages/opencode-tool-usage-tracker/` - 934 lines (NOT opencode-learning-engine/)
- `packages/opencode-skill-rl-manager/` - exists but only in tests  
- Context7 + Distill MCPs registered but never called

### Analysis Findings (confirmed)
1. **logInvocation**: Exists at line ~167 in tool-usage-tracker but NOT exported (line 930 shows exports)
2. **SkillRLManager**: Only instantiated in test files, 0 production consumers
3. **Path fragmentation**: Mix of `skill-rl.json` and `skill-rl-state.json`

---

## TODOs

- [ ] 1. Verify and export logInvocation

  **What to do**:
  - Check line ~167 for logInvocation in tool-usage-tracker
  - Add to module.exports if missing
  - Test: `node -e "require('./packages/opencode-tool-usage-tracker').logInvocation"`

- [ ] 2. Wire SkillRLManager in production

  **What to do**:
  - Add instantiation to oh-my-opencode plugin hooks
  - Use canonical path: `~/.opencode/skill-rl.json`

- [ ] 3. Fix path fragmentation

  **What to do**:
  - Standardize on `skill-rl.json` (not `skill-rl-state.json`)
  - Add migration logic for existing data
  - grep for path mismatches

- [ ] 4. Add Context7/Distill calling conventions

  **What to do**:
  - Update SKILL.md files with explicit MCP method calls
  - Document: resolve_library_id, query_docs, browse_tools, run_tool

- [ ] 5. Integration test

  **What to do**:
  - bun test → all pass
  - Verify no stale path references

---

## Execution

### Wave 1 (Immediate)
- Task 1: Verify logInvocation export

### Wave 2
- Task 2: Wire SkillRLManager to production

### Wave 3  
- Task 3: Fix paths
- Task 4: Document calling conventions

---

## Commit Strategy
| After | Message |
|--------|---------|
| 1 | fix(tracker): export logInvocation function |
| 2 | feat(skill-rl): wire SkillRLManager in production |
| 3 | fixpaths: standardize skill-rl.json path |
| 4 | docs: add Context7/Distill calling conventions |

---

## Success Criteria
```bash
node -e "const t = require('./packages/opencode-tool-usage-tracker'); console.log(typeof t.logInvocation)"
# → function

grep -rn "skill-rl-state" packages/ --include="*.js" | grep -v node_modules
# → zero matches
```