# MCP Audit Summary (Mar 8, 2026)

> Superseded by follow-up work completed on Mar 10, 2026. Current state: the formerly passive MCPs are now activated through skills/agents/orchestrator wiring, `github` and `tavily` were removed from canonical config, and `playwright` is enabled again.

## Quick Facts

- Total MCPs in config: 9 enabled + 3 disabled = 12 total
- LIVE MCPs at time of audit: 2 (distill, context7)
- PASSIVE MCPs at time of audit: 4 (supermemory, sequentialthinking, websearch, grep)
- DEAD MCPs at time of audit: 3 (playwright, github, tavily)
- Current status: this summary is historical only; see Mar 10 follow-up commits for the current inventory

## Audit Methodology

Exhaustive search across:
1. packages/ (*.js files) - 0 MCP invocations found
2. opencode-config/agents/ (*.md files) - 4 context7 calls found
3. opencode-config/skills/ (*.md files) - 6 explicit MCP tool calls found
4. scripts/ (*.mjs files) - 0 MCP invocations found
5. opencode-config/opencode.json - MCP configuration (lines 611-728)
6. opencode-config/oh-my-opencode.json - MCP toggles (lines 52-62)

## LIVE MCPs (2)

### 1. distill
- Configuration: enabled: true (line 692 in opencode.json)
- Invocations: 2 explicit tool calls
  - mcp_distill_browse_tools (distill SKILL.md line 66)
  - mcp_distill_run_tool (distill SKILL.md line 72)
- References: distill SKILL.md, dcp SKILL.md, context-governor SKILL.md, context-bridge.js, metrics-collector.js
- Verdict: LIVE - actively used for context compression

### 2. context7
- Configuration: enabled: true (line 635 in opencode.json)
- Invocations: 4 explicit tool calls
  - mcp_context7_resolve-library-id (context7 SKILL.md line 66, librarian.md line 20)
  - mcp_context7_query-docs (context7 SKILL.md line 79, librarian.md line 28)
- References: context7 SKILL.md, librarian agent, skill-orchestrator-runtime.md, metrics-collector.js
- Verdict: LIVE - actively used for documentation lookup

## PASSIVE MCPs (4)

### 1. supermemory
- Configuration: enabled: true (line 630 in opencode.json)
- Invocations: 0 found
- References: None
- Verdict: PASSIVE - configured but never invoked

### 2. sequentialthinking
- Configuration: enabled: true (line 652 in opencode.json)
- Invocations: 0 found
- References: None
- Verdict: PASSIVE - configured but never invoked

### 3. websearch
- Configuration: enabled: true (line 661 in opencode.json)
- Invocations: 0 found
- References: None
- Verdict: PASSIVE - configured but never invoked

### 4. grep
- Configuration: enabled: true (line 669 in opencode.json)
- Invocations: 0 found
- References: None
- Verdict: PASSIVE - configured but never invoked

## DEAD MCPs (3)

### 1. playwright
- Configuration: enabled: false (line 643 in opencode.json)
- Invocations: 0 found
- References: None
- Verdict: DEAD - disabled, no references

### 2. github
- Configuration: enabled: false (line 681 in opencode.json)
- Invocations: 0 found
- References: github-triage SKILL.md exists but doesn't call MCP tools
- Verdict: DEAD - disabled, skill exists but doesn't use MCP

### 3. tavily
- Configuration: enabled: false (line 622 in opencode.json)
- Invocations: 0 found
- References: None
- Verdict: DEAD - disabled, no references

## Wiring Plan (Downstream)

### Passive MCPs to Wire Up (4 tasks)

Status on Mar 10, 2026: completed.

1. supermemory: Create skill + agent + orchestrator trigger
2. sequentialthinking: Create skill + agent + orchestrator trigger
3. websearch: Create skill + agent + orchestrator trigger
4. grep: Create skill + agent + orchestrator trigger

### Dead MCPs to Clean Up (3 tasks)

Status on Mar 10, 2026:
- `github`: removed
- `tavily`: removed
- `playwright`: retained and enabled

1. playwright: Remove from opencode.json (disabled, no references)
2. github: Clarify intent (skill exists but doesn't call MCP)
3. tavily: Remove from opencode.json (disabled, no references)

## Success Criteria

After wiring:
- All 9 enabled MCPs have at least one invocation path
- No PASSIVE MCPs remain
- Dead MCPs are removed from config
- Audit re-run shows 9 LIVE MCPs
- Each skill has explicit MCP tool calls
- Each agent has MCP tool references
- Skill-orchestrator has detection keywords for each MCP

## Artifacts

- Audit Report: opencode-config/supermemory/mcp-audit-20260308.md
- Wiring Plan: opencode-config/supermemory/mcp-wiring-plan-20260308.md
- This Summary: opencode-config/supermemory/mcp-audit-summary-20260308.md
