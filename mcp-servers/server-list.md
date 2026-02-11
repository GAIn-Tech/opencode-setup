# MCP Servers Configuration

All MCP servers are defined in `~/.config/opencode/opencode.json` under the `"mcp"` key. They connect automatically when OpenCode starts.

## Active MCP Servers (8)

### 1. tavily
- **Type**: local
- **Command**: `npx -y tavily-mcp@latest`
- **Purpose**: Web search, content extraction, website crawling, deep research
- **Requires**: `TAVILY_API_KEY` environment variable
- **Tools**: `tavily_search`, `tavily_extract`, `tavily_crawl`, `tavily_map`, `tavily_research`

### 2. supermemory
- **Type**: remote
- **URL**: `https://mcp.supermemory.ai/mcp`
- **Purpose**: Persistent cross-session memory, user profile, knowledge base
- **Requires**: Bearer token in config headers
- **Tools**: `memory` (save/forget), `recall` (search), `listProjects`, `whoAmI`

### 3. context7
- **Type**: remote
- **URL**: `https://mcp.context7.com/mcp`
- **Purpose**: Up-to-date library documentation and code examples
- **Requires**: Nothing (public)
- **Tools**: `resolve-library-id`, `query-docs`

### 4. playwright
- **Type**: local
- **Command**: `npx @playwright/mcp@latest`
- **Purpose**: Browser automation, screenshots, form filling, testing
- **Requires**: Nothing (auto-installs browser)
- **Tools**: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot`, `browser_evaluate`, `browser_fill_form`, and more

### 5. sequentialthinking
- **Type**: local
- **Command**: `npx -y @modelcontextprotocol/server-sequentialthinking`
- **Purpose**: Enhanced step-by-step reasoning for complex problems
- **Requires**: Nothing
- **Tools**: `sequential_thinking`

### 6. websearch
- **Type**: local
- **Command**: `npx -y @mrkrsl/web-search-mcp`
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
- **Command**: `npx -y @modelcontextprotocol/server-github`
- **Purpose**: GitHub API — issues, PRs, repos, code search, file contents
- **Requires**: `GITHUB_TOKEN` environment variable
- **Tools**: `create_repository`, `search_repositories`, `create_issue`, `create_pull_request`, `get_file_contents`, `push_files`, `list_commits`, `search_code`, and more

## Configuration Format

MCP servers are defined in `opencode.json`:

```json
{
  "mcp": {
    "server-name": {
      "type": "local",
      "command": ["npx", "-y", "package-name@latest"],
      "environment": {
        "API_KEY": "{env:ENV_VAR_NAME}"
      },
      "enabled": true
    },
    "remote-server": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer TOKEN"
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
1. Test the server directly: `npx -y tavily-mcp@latest`
2. Check environment variables are set: `echo $GITHUB_TOKEN`
3. Restart OpenCode

### Adding new MCP servers
Add to `opencode.json` → `mcp` section, then restart OpenCode.
