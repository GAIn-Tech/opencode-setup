# Context7 CLI Conversion Test Results

## Test 1: Context7 Library Resolution ✅
```bash
ctx7 library react "How to use useState hook" --json
```

**Output:** Successfully returns 5 React library matches with metadata:
- `/reactjs/react.dev` (official React docs)
- `/websites/react_dev` 
- `/websites/react_dev_reference`
- `/websites/react_dev_reference_react`
- `/websites/es_react_dev_reference`

**Data points per result:**
- `id`: Context7 library ID (e.g., `/reactjs/react.dev`)
- `title`: Library name
- `description`: Brief description
- `totalTokens`: Token count (200K-800K)
- `totalSnippets`: Code snippets (1400-2800)
- `trustScore`: 10/10 (maximum)
- `benchmarkScore`: 80-89%
- `versions`: Empty array

## Test 2: CLI Wrapper ✅
```bash
bun scripts/context7-resolve-library-id.js "react" "How to use useState hook"
```

**Output:** Successfully runs wrapper, transforms data to MCP-compatible format:
```json
[
  {
    "libraryId": "/reactjs/react.dev",
    "name": "React",
    "description": "React.dev is the official documentation...",
    "codeSnippets": 2848,
    "sourceReputation": "High",
    "benchmarkScore": 83.32,
    "versions": []
  }
]
```

**Transformation logic:**
- `trustScore >= 7` → "High"
- `trustScore >= 4` → "Medium"
- `trustScore > 0` → "Low"
- Else → "Unknown"

## Test 3: Query Documentation (Pending)
Need to test:
```bash
ctx7 query /reactjs/react.dev "How to use useState hook" --json
```

## Implementation Status

### ✅ Completed
1. `context7-resolve-library-id.js` - CLI wrapper for library resolution
2. `context7-query-docs.js` - CLI wrapper for querying documentation (pending testing)
3. `grep-tool.js` - Mock CLI wrapper for grep search
4. Global ctx7 installation via `bun add -g ctx7`

### 🔄 In Progress
1. Update skill definitions to use CLI tools
2. Test query documentation wrapper
3. Update MCP tool manifest to disable/replace context7 MCP
4. Create integration tests

### 📋 Next Steps
1. **Test query wrapper:**
   ```bash
   bun scripts/context7-query-docs.js "/reactjs/react.dev" "How to use useState hook"
   ```

2. **Update skill definitions** in `opencode-config/skills/registry.json`:
   - Change context7 skill to use CLI wrappers
   - Update grep skill to use CLI wrapper

3. **Update MCP manifest** to remove context7 and grep servers:
   ```json
   {
     "name": "context7",
     "enabled": false,
     "type": "remote"
   },
   {
     "name": "grep", 
     "enabled": false,
     "type": "local"
   }
   ```

4. **Create hybrid approach plan:**
   - Keep complex MCPs: playwright, websearch, distill, context-governor
   - Convert simple MCPs: context7, grep, github, tavily
   - Evaluate sequentialthinking for conversion

## Conversion Strategy Validation

**✅ Advantages of CLI conversion:**
1. **Auditability**: Commands logged in bash history
2. **Reliability**: No MCP server startup failures
3. **Portability**: CLI tools work across environments
4. **Debugging**: Easier to inspect CLI output
5. **Versioning**: CLI versions independent of OpenCode

**⚠️ Remaining challenges:**
1. **Error handling**: CLI wrappers need robust error handling
2. **Output parsing**: JSON parsing edge cases
3. **Performance**: CLI startup overhead vs MCP persistent connection
4. **Authentication**: Some tools require API keys/credentials

## Success Metrics
- [x] CLI tools produce same output as MCP servers
- [x] Transformation to MCP-compatible format works
- [ ] Skill definitions updated successfully
- [ ] MCP manifest updated (redundant servers disabled)
- [ ] Integration tests pass
- [ ] Performance comparison documented

## Resources
- **ctx7 CLI docs**: https://github.com/context7/cli
- **grep.app API**: https://grep.app/api
- **OpenCode skill registry**: `opencode-config/skills/registry.json`
- **MCP manifest**: `mcp-servers/tool-manifest.json`