# MCP Servers Configuration

This document lists all MCP servers configured in the OpenCode setup.

## Active MCP Servers

### 1. sequential-thinking
- **Command**: `npx -y @modelcontextprotocol/server-sequential-thinking`
- **Status**: ✅ Connected
- **Purpose**: Enhanced reasoning and step-by-step thinking
- **Package**: `@modelcontextprotocol/server-sequential-thinking`

### 2. filesystem
- **Command**: `npx -y @modelcontextprotocol/server-filesystem ~/work`
- **Status**: ✅ Connected
- **Purpose**: File system access for the work directory
- **Package**: `@modelcontextprotocol/server-filesystem`
- **Configured Path**: `~/work` (adjust as needed)

### 3. claude-flow
- **Command**: `npx claude-flow@alpha mcp start`
- **Status**: ✅ Connected
- **Purpose**: SPARC methodology, agent orchestration, swarm coordination
- **Package**: `claude-flow@alpha`
- **Features**:
  - Swarm initialization and coordination
  - Agent spawning and management
  - Task orchestration
  - Memory management
  - Neural patterns
  - Performance tracking
  - GitHub integration

### 4. ruv-swarm
- **Command**: `npx ruv-swarm@latest mcp start`
- **Status**: ✅ Connected
- **Purpose**: Enhanced swarm coordination and distributed agents
- **Package**: `ruv-swarm@latest`

### 5. github (Optional)
- **Command**: `https://api.githubcopilot.com/mcp/` (HTTP)
- **Status**: ❌ Not Connected (requires GitHub Copilot subscription)
- **Purpose**: GitHub repository integration
- **Requirements**: GitHub Copilot subscription

### 6. postgres (Optional)
- **Command**: `npx -y @modelcontextprotocol/server-postgres`
- **Status**: ❌ Not Connected (requires database configuration)
- **Purpose**: PostgreSQL database access
- **Requirements**: Database connection string

## Plugin-Provided MCP Servers

These MCP servers are automatically configured when their respective plugins are installed:

### 7. plugin:superpowers-chrome:chrome
- **Command**: `node <plugin-path>/mcp/dist/index.js`
- **Status**: ✅ Connected
- **Purpose**: Chrome browser automation via DevTools Protocol
- **Plugin**: superpowers-chrome@superpowers-marketplace

### 8. plugin:compound-engineering:context7
- **Command**: `https://mcp.context7.com/mcp` (HTTP)
- **Status**: ✅ Connected
- **Purpose**: Up-to-date library documentation and code examples
- **Plugin**: compound-engineering@every-marketplace

### 9. plugin:claude-mem:mcp-search
- **Command**: `<plugin-path>/scripts/mcp-server.cjs`
- **Status**: ✅ Connected
- **Purpose**: Persistent memory and context search
- **Plugin**: claude-mem@thedotmack

### 10. plugin:oh-my-claudecode:t
- **Command**: `node <plugin-path>/bridge/mcp-server.cjs`
- **Status**: ✅ Connected
- **Purpose**: oh-my-claudecode MCP bridge for tools and features
- **Plugin**: oh-my-claudecode@omc

## MCP Server Tools

### sequential-thinking Tools
- `create_artifact`
- `sequential_thinking`

### filesystem Tools
- `read_file`
- `write_file`
- `list_directory`
- `create_directory`
- `move_file`
- `search_files`
- `get_file_info`

### claude-flow Tools
- `swarm_init`
- `agent_spawn`
- `task_orchestrate`
- `swarm_status`
- `agent_list`
- `agent_metrics`
- `task_status`
- `task_results`
- `memory_usage`
- `neural_status`
- `neural_train`
- `neural_patterns`
- `github_swarm`
- `repo_analyze`
- `pr_enhance`
- `issue_triage`
- `code_review`
- `benchmark_run`
- `features_detect`
- `swarm_monitor`

### ruv-swarm Tools
- Additional swarm coordination tools (varies by version)

### context7 Tools
- `resolve-library-id`
- `query-docs`

### superpowers-chrome Tools
- `use_browser` (single unified tool for all browser operations)

### claude-mem Tools
- `search_memory`
- `store_memory`
- `retrieve_context`

### oh-my-claudecode Tools
- Various LSP, AST, and custom tools
- See oh-my-claudecode documentation for complete list

## Installation Commands

```bash
# Install all core MCP servers
bash mcp-servers/mcp-setup-commands.sh

# Or install individually
claude mcp add sequential-thinking npx -y @modelcontextprotocol/server-sequential-thinking
claude mcp add filesystem npx -y @modelcontextprotocol/server-filesystem ~/work
claude mcp add claude-flow npx claude-flow@alpha mcp start
claude mcp add ruv-swarm npx ruv-swarm@latest mcp start

# Verify installation
claude mcp list
```

## Troubleshooting

### Server Not Connected

1. **Check if npx package is accessible**:
   ```bash
   npx -y @modelcontextprotocol/server-sequential-thinking --help
   ```

2. **Check debug logs**:
   ```bash
   cat ~/.claude/debug/*.txt | grep -A 5 "server-name"
   ```

3. **Restart Claude**:
   ```bash
   # Exit current Claude session and restart
   claude
   ```

### Update MCP Servers

```bash
# Remove and re-add to update
claude mcp remove sequential-thinking
claude mcp add sequential-thinking npx -y @modelcontextprotocol/server-sequential-thinking

# Verify
claude mcp list
```

## Notes

- MCP servers using `npx` will automatically download and run the latest version
- Plugin-provided MCP servers are managed by their respective plugins
- HTTP-based MCP servers (github, context7) require network connectivity
- The filesystem server path can be adjusted to any directory you need access to
