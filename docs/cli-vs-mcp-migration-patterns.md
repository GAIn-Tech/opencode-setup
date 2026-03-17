# CLI vs MCP Migration Patterns

## Overview
This document provides guidelines for migrating MCP servers to CLI tools and establishing a hybrid architecture pattern for OpenCode.

## Why Migrate from MCP to CLI?

### Benefits of CLI Tools
1. **Auditability**: CLI commands are logged in bash history
2. **Reliability**: No MCP server startup failures or connection issues
3. **Portability**: CLI tools work across Windows/Linux/macOS without adaptation
4. **Debugging**: Easier to inspect CLI output and error messages
5. **Versioning**: Independent of OpenCode's MCP system version
6. **Maintenance**: Simpler installation and dependency management
7. **Performance**: No persistent connection overhead for infrequent use

### When to Keep MCP Servers
1. **Complex State**: Tools requiring persistent state (browser sessions, memory)
2. **Real-time Interaction**: Tools needing bidirectional communication
3. **Warm Cache**: Tools benefiting from persistent cache (AST compression)
4. **Complex Logic**: Tools with sophisticated processing logic
5. **Integration Dependencies**: Tools tightly integrated with OpenCode internals

## Migration Strategy

### Three-Step Process

1. **Remove Redundant MCPs** → Simple tools with clear CLI alternatives
2. **Convert Easy Targets** → Straightforward API wrappers
3. **Evaluate Hybrid Approach** → Keep complex MCPs, convert simple ones

### Completed Conversions

| Tool | CLI Replacement | Status | Notes |
|------|-----------------|--------|-------|
| **context7** | `ctx7` command + wrapper scripts | ✅ | Uses npx ctx7 or bun scripts/context7-*.js |
| **grep** | CLI wrapper with mock/API fallback | ✅ | Future: integrate with grep.app API |
| **github** | `gh` CLI + GitHub API wrapper | ✅ | Uses gh command or direct API calls |
| **tavily** | Tavily API CLI wrapper | ✅ | Direct API calls with mock fallback |

### MCPs Kept (Hybrid Architecture)

| Tool | Reason to Keep | Complexity Level |
|------|----------------|------------------|
| **playwright** | Browser automation requires stateful sessions | High |
| **websearch** | Complex crawling/extraction logic | Medium |
| **distill** | AST-based compression with warm cache | High |
| **context-governor** | Session-based token budget tracking | High |
| **supermemory** | Persistent memory storage | Medium |
| **sequentialthinking** | Structured reasoning workflows | Medium |

## Implementation Patterns

### Pattern 1: CLI Wrapper Script
```javascript
// scripts/context7-resolve-library-id.js
const child = spawn('npx', ['ctx7', 'library', libraryName, '--json']);
// Transform output to MCP-compatible format
```

**Use when**: External CLI tool exists, needs output transformation

### Pattern 2: Direct API Call
```javascript
// scripts/tavily-tool.js
const response = await fetch('https://api.tavily.com/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, api_key })
});
```

**Use when**: Simple API, no CLI tool available

### Pattern 3: Shell Command Fallback
```javascript
// scripts/github-tool.js
try {
  // Try gh CLI first
  const output = execSync(`gh issue list --repo ${repo} --limit ${limit} --json`);
} catch {
  // Fallback to direct API
  const response = await fetch(`https://api.github.com/repos/${repo}/issues`);
}
```

**Use when**: Multiple options available, prioritize CLI then API

### Pattern 4: Mock Fallback
```javascript
// scripts/grep-tool.js
if (process.env.NODE_ENV === 'test' || !apiKey) {
  return mockResults; // Graceful degradation
}
```

**Use when**: External dependencies optional, provide basic functionality

## Skill Integration

### Updated Skill Patterns

**Before (MCP-centric)**:
```markdown
Workflow:
1. Use Context7 MCP tool `context7_resolve-library-id`
2. Call `context7_query-docs` with resolved library ID
```

**After (CLI-centric)**:
```markdown
Workflow:
1. Use CLI wrapper: `bun scripts/context7-resolve-library-id.js <library> <query>`
2. Or direct command: `ctx7 library <library> <query> --json`
```

### Registry Updates
- `opencode-config/skills/registry.json`: Updated descriptions and triggers
- Skill descriptions changed from "via Context7 MCP" to "via Context7 CLI"
- Added CLI-specific triggers: "ctx7 library", "gh command", etc.

## Testing Strategy

### Unit Tests
- Test CLI wrapper scripts directly
- Verify output transformation to MCP-compatible format
- Test fallback mechanisms

### Integration Tests
- End-to-end workflow testing
- Verify CLI commands produce same results as MCP servers
- Test hybrid MCP+CLI workflows

### Performance Tests
- Compare startup time: CLI vs MCP persistent connection
- Measure response time for common operations
- Evaluate memory usage differences

## Configuration Changes

### MCP Manifest Updates
```json
{
  "name": "context7",
  "enabled": false,
  "type": "remote",
  "notes": "Replaced by CLI wrapper: bun scripts/context7-*.js or ctx7 command"
}
```

### Skill Definition Updates
- Updated `opencode-config/skills/context7/SKILL.md`
- Updated `opencode-config/skills/grep/SKILL.md`
- Updated `opencode-config/skills/github-triage/SKILL.md`

## Common Migration Issues & Solutions

### Issue: Missing CLI Tool
**Solution**: Install globally or provide fallback
```bash
bun add -g ctx7  # Global installation
# OR use wrapper with npm exec fallback
```

### Issue: Output Format Mismatch
**Solution**: Transform CLI output to MCP-compatible format
```javascript
const transformed = result.map(lib => ({
  libraryId: lib.id,
  name: lib.title,
  description: lib.description,
  // ... MCP-compatible fields
}));
```

### Issue: Authentication Required
**Solution**: Read from environment variables
```javascript
const apiKey = process.env.TAVILY_API_KEY || '';
if (!apiKey) {
  console.warn('Using mock data - set TAVILY_API_KEY for real results');
  return mockResults;
}
```

## Best Practices

### 1. Prioritize CLI Tools
- Use existing CLI tools when available (gh, ctx7, etc.)
- Create wrapper scripts only when necessary
- Keep wrappers thin - just transformation logic

### 2. Maintain Compatibility
- Transform output to match MCP tool signatures
- Preserve existing skill workflows
- Provide clear error messages

### 3. Document Dependencies
- List required CLI tools in README
- Document API key requirements
- Provide installation instructions

### 4. Support Hybrid Workflows
- Some tasks use CLI tools
- Others use MCP servers
- Clear guidance on when to use each

## Future Directions

### Planned Enhancements
1. **Unified CLI Tool Registry**: Central configuration for all CLI tools
2. **Automated Migration Tool**: Convert MCP configs to CLI wrappers
3. **Performance Monitoring**: Track CLI vs MCP performance metrics
4. **Skill Auto-detection**: Detect CLI availability and adjust skill behavior

### Long-term Vision
- **Gradual Migration**: Convert more MCPs as CLI alternatives mature
- **Architecture Guidelines**: Clear criteria for CLI vs MCP selection
- **Community Patterns**: Share successful migration patterns
- **Tool Ecosystem**: Rich CLI tool ecosystem integrated with OpenCode

## Success Metrics

### Quantitative
- Reduced MCP server startup failures
- Decreased memory usage (fewer persistent connections)
- Faster response times for simple operations
- Increased auditability (CLI commands in history)

### Qualitative
- Improved debugging experience
- Simplified installation process
- Better cross-platform compatibility
- Reduced complexity for new users

## Conclusion
The CLI vs MCP migration represents a strategic shift toward simpler, more reliable tool integration. By converting simple MCPs to CLI tools while keeping complex ones, we achieve:

1. **Improved Reliability**: Fewer moving parts, fewer failure points
2. **Enhanced Auditability**: All tool calls logged and inspectable
3. **Better Portability**: Works across environments without adaptation
4. **Reduced Complexity**: Simpler installation and maintenance

The hybrid approach balances the benefits of both worlds: CLI simplicity for simple tools, MCP sophistication for complex tasks.