# MCP Lifecycle Report

Generated: 2026-03-13T20:36:58.486Z

| MCP | Status | Enabled | Type | Skill | Agent | Orchestrator | Telemetry | Recently Exercised |
|-----|--------|---------|------|-------|-------|--------------|-----------|-------------------|
| supermemory | LIVE | yes | remote | yes | yes | yes | 24 | yes (0d) |
| context7 | LIVE | yes | remote | yes | yes | yes | 0 | no |
| playwright | LIVE | yes | local | yes | yes | yes | 0 | yes (0d) |
| sequentialthinking | LIVE | yes | local | yes | yes | yes | 9 | yes (0d) |
| websearch | LIVE | yes | local | yes | yes | yes | 25 | yes (0d) |
| grep | LIVE | yes | local | yes | yes | yes | 116 | yes (0d) |
| distill | LIVE | yes | local | yes | yes | yes | 0 | yes (0d) |
| opencode-dashboard-launcher | DORMANT | no | local | no | no | no | 0 | no |
| opencode-memory-graph | DORMANT | no | local | no | no | no | 0 | no |
| opencode-model-router-x | DORMANT | no | local | no | no | no | 0 | no |
| opencode-context-governor | LIVE | yes | local | yes | no | yes | 0 | yes (0d) |
| opencode-runbooks | LIVE | yes | local | no | yes | yes | 0 | yes (0d) |

## supermemory
- Status: LIVE
- Enabled: true
- Skill file: present
- Agents: opencode-config/agents/memory-keeper.md
- Orchestrator mention: yes
- Direct integration mention: no
- Telemetry hits: 24
- Last invocation: 2026-03-13T20:34:29.365Z
- Days since last use: 0

## context7
- Status: LIVE
- Enabled: true
- Skill file: present
- Agents: opencode-config/agents/code-searcher.md, opencode-config/agents/librarian.md, opencode-config/agents/researcher.md
- Orchestrator mention: yes
- Direct integration mention: no
- Telemetry hits: 0
- Last invocation: never
- Days since last use: N/A

## playwright
- Status: LIVE
- Enabled: true
- Skill file: present
- Agents: opencode-config/agents/playwright-browser.md
- Orchestrator mention: yes
- Direct integration mention: no
- Telemetry hits: 0
- Last invocation: never
- Days since last use: N/A

## sequentialthinking
- Status: LIVE
- Enabled: true
- Skill file: present
- Agents: opencode-config/agents/thinker.md
- Orchestrator mention: yes
- Direct integration mention: no
- Telemetry hits: 9
- Last invocation: 2026-03-13T17:14:38.062Z
- Days since last use: 0

## websearch
- Status: LIVE
- Enabled: true
- Skill file: present
- Agents: opencode-config/agents/librarian.md, opencode-config/agents/researcher.md
- Orchestrator mention: yes
- Direct integration mention: no
- Telemetry hits: 25
- Last invocation: 2026-03-13T19:50:46.086Z
- Days since last use: 0

## grep
- Status: LIVE
- Enabled: true
- Skill file: present
- Agents: opencode-config/agents/code-searcher.md, opencode-config/agents/codebase-auditor.md
- Orchestrator mention: yes
- Direct integration mention: no
- Telemetry hits: 116
- Last invocation: 2026-03-13T20:36:13.135Z
- Days since last use: 0

## distill
- Status: LIVE
- Enabled: true
- Skill file: present
- Agents: opencode-config/agents/distill-compressor.md
- Orchestrator mention: yes
- Direct integration mention: no
- Telemetry hits: 0
- Last invocation: never
- Days since last use: N/A

## opencode-dashboard-launcher
- Status: DORMANT
- Enabled: false
- Skill file: missing
- Agents: none
- Orchestrator mention: no
- Direct integration mention: no
- Telemetry hits: 0
- Last invocation: never
- Days since last use: N/A
- Reactivation Reason: Disabled until a dedicated MCP wrapper and startup path exist for launching the dashboard intentionally.
- Reactivation Criteria: Enable only after a supported launcher wrapper and verification flow are implemented.
- Owner: dashboard

## opencode-memory-graph
- Status: DORMANT
- Enabled: false
- Skill file: missing
- Agents: none
- Orchestrator mention: no
- Direct integration mention: no
- Telemetry hits: 0
- Last invocation: never
- Days since last use: N/A
- Reactivation Reason: Disabled until the memory graph package exposes a stable MCP wrapper and persistence contract.
- Reactivation Criteria: Enable only after a supported memory-graph MCP entrypoint and smoke verification are implemented.
- Owner: memory

## opencode-model-router-x
- Status: DORMANT
- Enabled: false
- Skill file: missing
- Agents: none
- Orchestrator mention: no
- Direct integration mention: no
- Telemetry hits: 0
- Last invocation: never
- Days since last use: N/A
- Reactivation Reason: Disabled as a standalone MCP until model-router-x has an explicit operator-facing MCP wrapper beyond internal integration paths.
- Reactivation Criteria: Enable only after an operator-facing MCP wrapper and runtime smoke verification exist.
- Owner: routing

## opencode-context-governor
- Status: LIVE
- Enabled: true
- Skill file: present
- Agents: none
- Orchestrator mention: yes
- Direct integration mention: yes
- Telemetry hits: 0
- Last invocation: never
- Days since last use: N/A

## opencode-runbooks
- Status: LIVE
- Enabled: true
- Skill file: missing
- Agents: opencode-config/agents/codebase-auditor.md
- Orchestrator mention: yes
- Direct integration mention: yes
- Telemetry hits: 0
- Last invocation: never
- Days since last use: N/A

## Heuristic Notes
- opencode-runbooks: classified via alias/indirect wiring because no direct MCP skill file exists.

