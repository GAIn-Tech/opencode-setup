# MCP Server Reference & Toggle Guide

**Model Context Protocol (MCP) Servers** — Available tools for querying, compressing, searching, and integrating data.

---

## 📋 All 9 MCP Servers

### ✅ Enabled by Default (6)

#### 1. **context7** — RAG Knowledge Base
**Status:** ✅ Enabled  
**Type:** Local (stdio)  
**Command:** `npx -y context7 serve`  
**Purpose:** Query official documentation, code examples, framework guides

**Use Cases:**
- "How do I authenticate with JWT in Express?"
- "Find React hooks best practices"
- Search API documentation

**Configuration:**
```json
{
  "mcpServers": {
    "context7": {
      "type": "local",
      "command": "npx -y context7 serve",
      "enabled": true
    }
  }
}
```

**Toggle Off:** Set `"enabled": false` in opencode.json

---

#### 2. **sequentialthinking** — Deep Reasoning
**Status:** ✅ Enabled  
**Type:** Local (stdio)  
**Command:** `npx -y @modelcontextprotocol/server-sequential-thinking`  
**Purpose:** Extended reasoning with thinking chains (similar to o1)

**Use Cases:**
- Complex logic problems
- Multi-step debugging
- Architecture decisions

**Configuration:**
```json
{
  "mcpServers": {
    "sequentialthinking": {
      "type": "local",
      "command": "npx -y @modelcontextprotocol/server-sequential-thinking",
      "enabled": true
    }
  }
}
```

**When to Use:** `task(subagent_type="oracle", ...)` automatically uses this

**Toggle Off:** Set `"enabled": false`

---

#### 3. **websearch** — Real-Time Web Search
**Status:** ✅ Enabled  
**Type:** Local (stdio)  
**Command:** `npx -y @ignidor/web-search-mcp serve`  
**Purpose:** Search current web content, no API key required

**Use Cases:**
- "What's the latest security vulnerability in X?"
- "Find current best practices for Y"
- "Search for recent tutorials on Z"

**Configuration:**
```json
{
  "mcpServers": {
    "websearch": {
      "type": "local",
      "command": "npx -y @ignidor/web-search-mcp serve",
      "enabled": true
    }
  }
}
```

**No Auth Required:** Uses public search APIs

**Toggle Off:** Set `"enabled": false`

---

#### 4. **grep** — Fast Code Pattern Search
**Status:** ✅ Enabled  
**Type:** Local (stdio)  
**Command:** `npx -y @modelcontextprotocol/server-grep`  
**Purpose:** Search codebase for patterns, exact strings, regex

**Use Cases:**
- Find all error handlers
- Locate specific function calls
- Search for TODO comments

**Configuration:**
```json
{
  "mcpServers": {
    "grep": {
      "type": "local",
      "command": "npx -y @modelcontextprotocol/server-grep",
      "enabled": true
    }
  }
}
```

**Prerequisites:** ripgrep (`rg`) must be installed

**Toggle Off:** Set `"enabled": false`

---

#### 5. **distill-mcp** — Token Optimization
**Status:** ✅ Enabled  
**Type:** Local (stdio)  
**Command:** `npx -y distill-mcp@0.8.1 serve --lazy`  
**Purpose:** Compress code, optimize file reading, reduce token overhead

**Use Cases:**
- Compress large files before context injection
- Smart file loading (only load what's needed)
- Code diffing with token savings

**Configuration:**
```json
{
  "mcpServers": {
    "distill": {
      "type": "local",
      "command": "npx -y distill-mcp@0.8.1 serve --lazy",
      "enabled": true
    }
  }
}
```

**Token Savings:** 50-70% for large files, 98% for code execution

**Toggle Off:** Set `"enabled": false`

---

#### 6. **supermemory** — Cross-Session Memory
**Status:** ✅ Enabled (but disabled by connection default)  
**Type:** Remote  
**Purpose:** Persist memories across sessions with relevance filtering

**Use Cases:**
- Remember project decisions
- Store error patterns and solutions
- Save architectural insights

**Configuration:**
```json
{
  "mcpServers": {
    "supermemory": {
      "type": "remote",
      "endpoint": "https://api.supermemory.ai/mcp",
      "enabled": true
    }
  }
}
```

**Requires:** `SUPERMEMORY_API_KEY` environment variable

**Setup:**
```bash
# Set API key (Windows)
setx SUPERMEMORY_API_KEY "your_key_here"

# Verify
echo %SUPERMEMORY_API_KEY%
```

**Toggle Off:** Set `"enabled": false` or unset env var

---

### ❌ Disabled by Default (3)

#### 1. **tavily** — Web Search with Analytics
**Status:** ❌ Disabled  
**Type:** Local  
**Command:** `npx -y @tavily/mcp serve`  
**Purpose:** Advanced web search with result rankings, analytics

**When to Enable:** Need search ranking + relevance scoring

**Requirements:** `TAVILY_API_KEY` from https://tavily.com

**Enable:**
1. Get API key: https://tavily.com → sign up → copy key
2. Set env var:
   ```bash
   setx TAVILY_API_KEY "your_key_here"
   ```
3. Update opencode.json:
   ```json
   {
     "mcpServers": {
       "tavily": {
         "type": "local",
         "command": "npx -y @tavily/mcp serve",
         "enabled": true
       }
     }
   }
   ```
4. Restart OpenCode

---

#### 2. **playwright** — Browser Automation
**Status:** ❌ Disabled (Heavy)  
**Type:** Local  
**Command:** `npx -y @modelcontextprotocol/server-playwright`  
**Purpose:** Automate browser tasks, take screenshots, scrape web pages

**When to Enable:** Web testing, page scraping, screenshot verification

**Requirements:** Chromium/Firefox (auto-installed by Playwright)

**Enable:**
1. Update opencode.json:
   ```json
   {
     "mcpServers": {
       "playwright": {
         "type": "local",
         "command": "npx -y @modelcontextprotocol/server-playwright",
         "enabled": true
       }
     }
   }
   ```
2. Restart OpenCode

**Warning:** Uses significant memory. Disable after use.

---

#### 3. **github** — GitHub API Access
**Status:** ❌ Disabled  
**Type:** Local  
**Command:** `npx -y @modelcontextprotocol/server-github`  
**Purpose:** Query repos, issues, PRs, create commits, manage workflows

**When to Enable:** Need GitHub API access for automation

**Requirements:** `GITHUB_TOKEN` with repo scope

**Enable:**
1. Generate token: https://github.com/settings/tokens → New token (classic)
   - Scopes: `repo`, `read:user`, `gist`
2. Set env var:
   ```bash
   setx GITHUB_TOKEN "ghp_your_token_here"
   ```
3. Update opencode.json:
   ```json
   {
     "mcpServers": {
       "github": {
         "type": "local",
         "command": "npx -y @modelcontextprotocol/server-github",
         "enabled": true
       }
     }
   }
   ```
4. Restart OpenCode

---

## 🔄 How to Toggle MCPs

### Method 1: Direct Config Edit

**File:** `~/.config/opencode/opencode.json`

```json
{
  "mcpServers": {
    "websearch": { "enabled": true },      // ✅ On
    "tavily": { "enabled": false },        // ❌ Off
    "playwright": { "enabled": false }
  }
}
```

**Restart OpenCode** for changes to take effect.

### Method 2: CLI Command (Future)

```bash
opencode mcp enable tavily
opencode mcp disable playwright
opencode mcp status
```

*(Currently requires manual config edit)*

---

## 📊 MCP Selection Guide

| Task | Recommended MCPs |
|------|-----------------|
| **Search code patterns** | grep |
| **Query framework docs** | context7 |
| **Search web** | websearch (free) or tavily (ranked) |
| **Deep reasoning** | sequentialthinking |
| **Compress context** | distill-mcp |
| **Remember data** | supermemory |
| **Test web pages** | playwright |
| **GitHub automation** | github |

---

## ⚡ Performance Impact

| MCP | Startup | Memory | Token Cost |
|-----|---------|--------|------------|
| context7 | ~500ms | Low | None (indexed) |
| sequentialthinking | ~1s | Medium | High (thinking chains) |
| websearch | ~200ms | Low | None (external API) |
| grep | ~100ms | Low | None (local search) |
| distill-mcp | ~300ms | Medium | **Saves 50-70%** |
| supermemory | ~1s | Low | Depends on results |
| tavily | ~500ms | Low | Paid API |
| playwright | ~2s | High | None (direct API) |
| github | ~300ms | Low | Paid API |

**Optimization Tips:**
- Keep expensive MCPs (playwright, sequentialthinking) disabled by default
- Use grep for local searches (faster than websearch)
- Use distill-mcp for large file context
- Lazy-load expensive MCPs: enable → use → disable

---

## 🔧 Troubleshooting MCPs

### MCP Not Loading
1. Check if enabled: `cat ~/.config/opencode/opencode.json | jq '.mcpServers'`
2. Verify command works: `npx -y [mcp-command]`
3. Check logs: `tail -f ~/.opencode/logs/system.log`

### Authentication Errors
1. Set required env vars (TAVILY_API_KEY, GITHUB_TOKEN, SUPERMEMORY_API_KEY)
2. Verify: `echo $ENV_VAR_NAME`
3. Restart OpenCode after setting env vars

### Slow Performance
1. Disable heavy MCPs (playwright)
2. Check system resources: `htop` or Task Manager
3. Enable lazy loading: `"command": "... serve --lazy"`

### Command Not Found
1. Install globally: `npm install -g [mcp-package]`
2. Verify: `which [mcp-command]`
3. Update PATH if needed

---

## 🚀 Advanced MCP Usage

### Custom MCP Server
Create your own MCP server:

```js
// my-mcp/server.js
const { Server } = require('@modelcontextprotocol/sdk/server');
const server = new Server();

server.setRequestHandler(/* ... */);
server.start();
```

Add to opencode.json:
```json
{
  "mcpServers": {
    "my-custom-mcp": {
      "type": "local",
      "command": "node ~/my-mcp/server.js",
      "enabled": true
    }
  }
}
```

See `MCP-DEVELOPMENT.md` for detailed guide.

---

## 📚 MCP Documentation Links

- **Context7:** https://docs.anthropic.com/claude/reference/models-overview
- **Playwright:** https://playwright.dev/docs/api/class-browser
- **GitHub API:** https://docs.github.com/en/rest
- **Tavily:** https://docs.tavily.com/
- **Supermemory:** https://supermemory.ai/docs
- **MCP Spec:** https://modelcontextprotocol.io/

