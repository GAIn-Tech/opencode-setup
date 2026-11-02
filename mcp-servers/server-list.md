# MCP Servers Configuration

All MCP servers are defined in `~/.config/opencode/opencode.json` under the `"mcp"` key. They connect automatically when OpenCode starts.

`opencode-config/opencode.json` is the canonical repo source for active runtime MCPs. `mcp-servers/opencode-mcp-config.json` is a reference mirror for the internal `opencode-*` wrappers and should stay aligned with the canonical enabled/disabled policy.

## Active MCP Servers (10)

### 1. supermemory
- **Type**: remote
- **URL**: `https://mcp.supermemory.ai/mcp`
- **Purpose**: Persistent cross-session memory, user profile, knowledge base
- **Requires**: `SUPERMEMORY_API_KEY` env var via `Bearer {env:SUPERMEMORY_API_KEY}`
- **Tools**: `memory` (save/forget), `recall` (search), `listProjects`, `whoAmI`

### 2. context7
- **Type**: remote
- **URL**: `https://mcp.context7.com/mcp`
- **Purpose**: Up-to-date library documentation and code examples
- **Requires**: Nothing (public)
- **Tools**: `resolve-library-id`, `query-docs`

### 3. playwright
- **Type**: local
- **Command**: `npx @playwright/mcp@0.0.64`
- **Purpose**: Browser automation, screenshots, form filling, testing
- **Requires**: Nothing (auto-installs browser)
- **Tools**: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot`, `browser_evaluate`, `browser_fill_form`, and more

### 4. sequentialthinking
- **Type**: local
- **Command**: `npx -y @modelcontextprotocol/server-sequential-thinking`
- **Purpose**: Enhanced step-by-step reasoning for complex problems
- **Requires**: Nothing
- **Tools**: `sequential_thinking`

### 5. websearch
- **Type**: local
- **Command**: `npx -y @ignidor/web-search-mcp`
- **Purpose**: Web search (backup/alternative to Tavily)
- **Requires**: Nothing
- **Tools**: `google_search`

### 6. grep
- **Type**: local
- **Command**: `uvx grep-mcp`
- **Purpose**: Search code patterns across GitHub repositories
- **Requires**: `uv`/`uvx` installed (`pip install uv`)
- **Tools**: `grep_query`

### 7. distill
- **Type**: local
- **Command**: `node scripts/run-distill-mcp.mjs serve --lazy`
- **Purpose**: AST-aware context compression and token reduction
- **Requires**: Nothing
- **Tools**: provider-specific distill tools

### 8. opencode-memory-graph
- **Type**: local
- **Command**: `node packages/opencode-memory-graph/src/mcp-server.mjs`
- **Purpose**: Query and build session/error memory graphs from runtime logs
- **Requires**: Nothing
- **Tools**: `buildMemoryGraph`, `getMemoryGraph`, `getMemoryGraphErrorFrequency`, `getMemoryGraphSessionPath`, `getMemoryGraphSessions`, `getMemoryGraphSessionErrors`, `getMemoryGraphActivationStatus`, `activateMemoryGraph`

### 9. opencode-context-governor
- **Type**: local
- **Command**: `node packages/opencode-context-governor/src/mcp-server.mjs`
- **Purpose**: Token budget checks and usage tracking per session/model
- **Requires**: Nothing
- **Tools**: `checkContextBudget`, `recordTokenUsage`, `getContextBudgetStatus`, `listBudgetSessions`, `resetBudgetSession`, `getModelBudgets`

### 10. opencode-runbooks
- **Type**: local
- **Command**: `node packages/opencode-runbooks/src/mcp-server.mjs`
- **Purpose**: Structured runbook matching, diagnosis, and remedy lookup
- **Requires**: Nothing
- **Tools**: `matchRunbookError`, `matchAllRunbookErrors`, `getRunbookRemedy`, `diagnoseRunbookError`, `executeRunbookRemedy`, `listRunbookPatterns`

## Dormant Internal MCP Entries

These remain intentionally disabled in `opencode-config/opencode.json` until they have the right public operator contract:

- `opencode-dashboard-launcher` — CLI-first; keep dashboard lifecycle operations out of the host-facing MCP pool by default

`opencode-model-router-x` has been removed from the host-facing MCP registry and is retained as an internal runtime routing library.

## Configuration Format

MCP servers are defined in `opencode.json`:

```json
{
  "mcp": {
    "server-name": {
      "type": "local",
      "command": ["npx", "-y", "package-name@x.y.z"],
      "environment": {
        "API_KEY": "{env:ENV_VAR_NAME}"
      },
      "enabled": true
    },
    "remote-server": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer {env:SERVICE_TOKEN}"
      },
      "enabled": true
    }
  }
}
```

## Prerequisites

| Dependency | Required For | Install |
|------------|-------------|---------|
| Node.js v18+ | All local MCP servers | https://nodejs.org |
| npx | All npm-based servers | Comes with Node.js |
| uv/uvx | grep MCP server | `pip install uv` |
| Supermemory token | supermemory MCP server | https://supermemory.ai |

## Troubleshooting

### Server not connecting
1. Test the server directly: `node packages/opencode-context-governor/src/mcp-server.mjs`
2. Check environment variables are set for any remote MCPs you rely on
3. Restart OpenCode

### Adding new MCP servers
Add to `opencode.json` → `mcp` section, then restart OpenCode.

Before adding an MCP wrapper for an internal `opencode-*` package, review `docs/architecture/cli-mcp-surface-policy.md` and justify whether the package should be MCP-first, CLI-first, hybrid, or remain library-only.
