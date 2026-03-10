# MCP Wiring Plan (Downstream)

> Superseded historical wiring plan from Mar 8, 2026. The core passive-MCP activation work was completed on Mar 10, 2026. Keep this as the original plan artifact, not the current source of truth.

## Context

Audit completed Mar 8, 2026 revealed 4 PASSIVE MCPs (supermemory, sequentialthinking, websearch, grep) that were configured but never auto-invoked.

## Pattern to Follow

All LIVE MCPs (distill, context7) follow this 3-part pattern:

1. **Skill Definition** (opencode-config/skills/{name}/SKILL.md)
   - Describes when to use the MCP
   - Lists explicit MCP tool calls (mcp_{name}_*)
   - Provides usage examples

2. **Agent Reference** (opencode-config/agents/{name}.md)
   - Agent prompt that calls MCP tools
   - Example: librarian agent calls context7 tools

3. **Skill-Orchestrator Trigger** (opencode-config/skills/skill-orchestrator-runtime/SKILL.md)
   - Detection keywords that auto-recommend the skill
   - Example: "how do I use [library]" → context7 skill

## Wiring Tasks

### Task 1: Wire supermemory
- [x] Create opencode-config/skills/supermemory/SKILL.md
  - Tool calls: mcp_supermemory_* (check MCP docs for available tools)
  - Use case: Cross-session memory, persistent context
- [x] Create opencode-config/agents/memory-keeper.md
  - Agent that calls supermemory tools
- [x] Add supermemory trigger to skill-orchestrator-runtime.md
  - Keywords: "remember", "recall", "persistent memory", "across sessions"

### Task 2: Wire sequentialthinking
- [x] Create opencode-config/skills/sequentialthinking/SKILL.md
  - Tool calls: mcp_sequentialthinking_* (check MCP docs)
  - Use case: Step-by-step reasoning, complex problem solving
- [x] Create opencode-config/agents/thinker.md
  - Agent that calls sequentialthinking tools
- [x] Add sequentialthinking trigger to skill-orchestrator-runtime.md
  - Keywords: "step by step", "break down", "think through", "reasoning"

### Task 3: Wire websearch
- [x] Create opencode-config/skills/websearch/SKILL.md
  - Tool calls: mcp_websearch_* (check MCP docs)
  - Use case: Web research, current information lookup
- [x] Create opencode-config/agents/researcher.md
  - Agent that calls websearch tools
- [x] Add websearch trigger to skill-orchestrator-runtime.md
  - Keywords: "search the web", "find information", "current news", "latest"

### Task 4: Wire grep
- [x] Create opencode-config/skills/grep/SKILL.md
  - Tool calls: mcp_grep_* (check MCP docs)
  - Use case: Code search across GitHub repos
- [x] Create opencode-config/agents/code-searcher.md
  - Agent that calls grep tools
- [x] Add grep trigger to skill-orchestrator-runtime.md
  - Keywords: "search code", "find in repo", "grep", "code pattern"

### Task 5: Clean up DEAD MCPs
- [x] Remove tavily from opencode.json (disabled, no references)
- [x] Remove github from opencode.json (github-triage skill remains, MCP removed)
- [x] Rehabilitate playwright instead of removing it (enabled in canonical config)

## Validation Checklist

For each wired MCP, verify:
- [ ] Skill definition exists and has explicit MCP tool calls
- [ ] Agent definition exists and calls MCP tools
- [ ] Skill-orchestrator trigger added with detection keywords
- [ ] MCP is enabled in opencode.json
- [ ] No test files reference the MCP (skip test files in audit)
- [ ] Documentation is clear and follows distill/context7 pattern

## Files to Modify

1. opencode-config/skills/{name}/SKILL.md (create 4 new)
2. opencode-config/agents/{name}.md (create 4 new)
3. opencode-config/skills/skill-orchestrator-runtime/SKILL.md (add 4 triggers)
4. opencode-config/opencode.json (remove 2 dead MCPs)

## Success Criteria

After wiring:
- All 9 enabled MCPs have at least one invocation path (skill + agent + trigger)
- No PASSIVE MCPs remain
- Dead MCPs are removed from config
- Audit re-run shows 9 LIVE MCPs
