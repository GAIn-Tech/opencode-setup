# MCP Servers Configuration

All MCP servers are defined in `~/.config/opencode/opencode.json` under the `"mcp"` key. They connect automatically when OpenCode starts.

## Active MCP Servers (9)

### 1. tavily
- **Type**: local
- **Command**: `npx -y tavily-mcp@0.2.16`
- **Purpose**: Web search, content extraction, website crawling, deep research
- **Requires**: `TAVILY_API_KEY` environment variable
- **Tools**: `tavily_search`, `tavily_extract`, `tavily_crawl`, `tavily_map`, `tavily_research`

### 2. supermemory
- **Type**: remote
- **URL**: `https://mcp.supermemory.ai/mcp`
- **Purpose**: Persistent cross-session memory, user profile, knowledge base
- **Requires**: `SUPERMEMORY_API_KEY` env var via `Bearer {env:SUPERMEMORY_API_KEY}`
- **Tools**: `memory` (save/forget), `recall` (search), `listProjects`, `whoAmI`

### 3. context7
- **Type**: remote
- **URL**: `https://mcp.context7.com/mcp`
- **Purpose**: Up-to-date library documentation and code examples
- **Requires**: Nothing (public)
- **Tools**: `resolve-library-id`, `query-docs`

### 4. playwright
- **Type**: local
- **Command**: `npx @playwright/mcp@0.0.64`
- **Purpose**: Browser automation, screenshots, form filling, testing
- **Requires**: Nothing (auto-installs browser)
- **Tools**: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot`, `browser_evaluate`, `browser_fill_form`, and more

### 5. sequentialthinking
- **Type**: local
- **Command**: `npx -y @modelcontextprotocol/server-sequential-thinking`
- **Purpose**: Enhanced step-by-step reasoning for complex problems
- **Requires**: Nothing
- **Tools**: `sequential_thinking`

### 6. websearch
- **Type**: local
- **Command**: `npx -y @ignidor/web-search-mcp`
- **Purpose**: Web search (backup/alternative to Tavily)
- **Requires**: Nothing
- **Tools**: `google_search`

### 7. grep
- **Type**: local
- **Command**: `uvx grep-mcp`
- **Purpose**: Search code patterns across GitHub repositories
- **Requires**: `uv`/`uvx` installed (`pip install uv`)
- **Tools**: `grep_query`

### 8. github
- **Type**: local
- **Command**: `npx -y @modelcontextprotocol/server-github@2025.4.8`
- **Purpose**: GitHub API — issues, PRs, repos, code search, file contents
- **Requires**: `GITHUB_TOKEN` environment variable
- **Tools**: `create_repository`, `search_repositories`, `create_issue`, `create_pull_request`, `get_file_contents`, `push_files`, `list_commits`, `search_code`, and more

### 9. distill
- **Type**: local
- **Command**: `npx -y distill-mcp@0.8.1`
- **Purpose**: AST-aware context compression and token reduction
- **Requires**: Nothing
- **Tools**: provider-specific distill tools

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
| GITHUB_TOKEN | github MCP server | GitHub Settings → Developer Settings → PAT |
| TAVILY_API_KEY | tavily MCP server | https://tavily.com |
| Supermemory token | supermemory MCP server | https://supermemory.ai |

## Troubleshooting

### Server not connecting
1. Test the server directly: `npx -y tavily-mcp@0.2.16`
2. Check environment variables are set: `echo $GITHUB_TOKEN`
3. Restart OpenCode

### Adding new MCP servers
Add to `opencode.json` → `mcp` section, then restart OpenCode.
