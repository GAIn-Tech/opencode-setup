# Troubleshooting Guide

**Common issues and fixes for OpenCode setup.**

---

## 🔴 Plugin Issues

### Plugin Not Loading
**Symptoms:** Plugin appears in config but not active

**Fix:**
```bash
# 1. Verify plugin installed
npm list -g opencode-[plugin-name]

# 2. If missing, install manually
npm install -g opencode-[plugin-name]@[version]

# 3. Verify config syntax
jq . ~/.config/opencode/opencode.json

# 4. Restart OpenCode
```

### Duplicate Plugin Error
**Symptoms:** "Duplicate plugin detected" warning

**Fix:**
```bash
# Check for duplicates
npm list -g | grep -i opencode | sort | uniq -d

# Uninstall duplicate
npm uninstall -g opencode-[plugin-name]

# Reinstall correct version
npm install -g opencode-[plugin-name]@[correct-version]
```

### Plugin Startup Timeout
**Symptoms:** Plugin takes >5s to start, or times out

**Fix:**
1. Check plugin health:
   ```bash
   npm run health-check
   npm start opencode-plugin-healthd
   ```
2. For slow plugins, enable lazy loading:
   ```json
   {
     "plugins": ["plugin-name@version"],
     "pluginConfig": { "lazy": true }
   }
   ```
3. Check system resources (CPU, memory)

---

## 🔴 MCP Server Issues

### MCP Command Not Found
**Symptoms:** "command not found: npx -y @modelcontextprotocol/..."

**Fix:**
```bash
# 1. Install NPX
npm install -g npx

# 2. Verify MCP package
npm list -g @modelcontextprotocol/server-[name]

# 3. Test command manually
npx -y @modelcontextprotocol/server-sequential-thinking

# 4. Check PATH
echo $PATH
which npx
```

### MCP Connection Refused
**Symptoms:** "Error: connect ECONNREFUSED 127.0.0.1:7687"

**Fix (for goraphdb):**
1. Verify goraphdb running:
   ```bash
   curl http://localhost:7687/api/health
   # Should return {"status":"ok"}
   ```
2. Start goraphdb if not running:
   ```bash
   docker run -p 7687:7687 -v ~/goraphdb-data:/data goraphdb:latest
   ```
3. Update config to disable MCP if goraphdb not needed:
   ```json
   {
     "mcpServers": {
       "goraphdb": { "enabled": false }
     }
   }
   ```

### Authentication Failed (tavily, github, supermemory)
**Symptoms:** "Authentication failed" or "invalid API key"

**Fix:**
```bash
# 1. Set environment variable
setx TAVILY_API_KEY "your_key_here"
# or
setx GITHUB_TOKEN "ghp_your_token"
# or
setx SUPERMEMORY_API_KEY "your_key"

# 2. Verify it's set
echo %TAVILY_API_KEY%

# 3. Restart terminal/OpenCode

# 4. Check config has MCP enabled
jq .mcpServers ~/.config/opencode/opencode.json | grep tavily
```

**For Windows Environment Variables:**
- Settings → System → Environment Variables
- Add new "User variable"
- Restart all terminals/IDE

---

## 🔴 Agent & Skill Issues

### Agent Not Responding
**Symptoms:** Task hangs or agent doesn't route correctly

**Fix:**
1. Check agent config:
   ```bash
   cat ~/.config/opencode/oh-my-opencode.json | jq '.agents'
   ```
2. Verify model is available:
   ```bash
   opencode run "ping"  # Tests default model
   ```
3. Check model fallback chain:
   ```bash
   cat ~/.config/opencode/rate-limit-fallback.json | jq '.fallbackChain'
   ```
4. If stuck, trigger fallback:
   - Press Ctrl+C to cancel
   - Next request uses fallback model

### Skill Not Found
**Symptoms:** "/orchestrate" or skill command returns "Skill not found"

**Fix:**
1. List available skills:
   ```bash
   cat ~/.config/opencode/compound-engineering.json | jq '.skills | keys'
   ```
2. Check if skill is enabled:
   ```bash
   cat ~/.config/opencode/compound-engineering.json | jq '.skillsGlobal'
   ```
3. Enable skill:
   ```json
   {
     "skillsGlobal": ["existing-skills", "my-skill"]
   }
   ```
4. Restart OpenCode

---

## 🔴 Memory & Context Issues

### Out of Memory / Context Exceeded
**Symptoms:** "Token limit exceeded" or "memory error"

**Fix:**
1. Check token budget:
   ```js
   const Governor = require('opencode-context-governor');
   const gov = new Governor();
   const remaining = gov.getRemainingBudget('ses_current', 'claude-opus-4-6');
   ```
2. Use distill-mcp to compress:
   ```js
   const distill = require('distill-mcp');
   const compressed = await distill.compress(largeFile);
   ```
3. Start new session:
   - Token budget resets per session
   - Use `opencode new-session` (if available)
4. Disable heavy MCPs temporarily

### Graph-Memory Not Activating
**Symptoms:** "Graph not active" or backfill fails

**Fix:**
1. Check graph status:
   ```js
   const MemoryGraph = require('opencode-memory-graph');
   const graph = new MemoryGraph();
   const status = await graph.activationStatus();
   console.log(status);
   ```
2. Activate with backfill:
   ```js
   await graph.activate();  // Scans ~/.opencode/messages/
   ```
3. Check goraphdb is running (if enabled):
   ```bash
   curl http://localhost:7687/api/health
   ```
4. Verify bridge is installed:
   ```bash
   npm list -g opencode-goraphdb-bridge
   ```

---

## 🔴 Configuration Issues

### Config File Syntax Error
**Symptoms:** "SyntaxError: JSON parsing" or config not loading

**Fix:**
```bash
# 1. Validate JSON syntax
jq . ~/.config/opencode/opencode.json

# 2. If error, find line number
# Use online JSON validator: https://jsonlint.com

# 3. Fix syntax error (missing comma, bracket, quote)

# 4. Restart OpenCode
```

### Config Drift Between Local & Template
**Symptoms:** Changes not syncing between ~/.config/opencode/ and ~/opencode-setup/

**Fix:**
```bash
# 1. Check differences
diff ~/.config/opencode/opencode.json ~/opencode-setup/opencode-config/opencode.json

# 2. Sync local → template (recommended)
cp ~/.config/opencode/*.json ~/opencode-setup/opencode-config/

# 3. Or sync template → local (if template is newer)
cp ~/opencode-setup/opencode-config/*.json ~/.config/opencode/

# 4. Commit synced changes
cd ~/opencode-setup && git add . && git commit -m "Sync config"
```

---

## 🔴 Learning Engine Issues

### Anti-Pattern Warnings Too Aggressive
**Symptoms:** "WARNING: repeated mistake detected" blocks progress

**Fix:**
1. Adjust weighting:
   ```json
   {
     "learningConfig": {
       "antiPatternWeight": 1.0,  // Reduce from 2.0
       "positivePatternWeight": 1.0
     }
   }
   ```
2. Ignore specific pattern:
   ```js
   const engine = require('opencode-learning-engine');
   engine.ignoreAntiPattern('repeated_mistake', {reason: 'intentional retry'});
   ```
3. Clear learning catalog (reset):
   ```bash
   rm ~/.opencode/learning/anti-patterns.json
   npm run learning-engine reset
   ```

### Learning Engine Not Ingesting Sessions
**Symptoms:** "No sessions ingested" or empty catalog

**Fix:**
```bash
# 1. Verify sessions exist
ls ~/.opencode/messages/ | wc -l
# Should show > 0

# 2. Manually ingest
node -e "const E = require('opencode-learning-engine'); new E().ingestAllSessions().then(() => console.log('done'))"

# 3. Check results
cat ~/.opencode/learning/anti-patterns.json | jq '.length'
```

---

## 🔴 Deployment & Git Issues

### Proofcheck Blocking Commit
**Symptoms:** "git clean check failed" or "tests not passing"

**Fix:**
```bash
# 1. Check what proofcheck is blocking
npm run proofcheck verify

# 2. Fix issues
# - Unstaged files: git add . && git commit
# - Failing tests: npm test (fix errors)
# - Lint errors: npm run lint --fix

# 3. Force commit (if necessary)
git commit -m "message" --force  # Use sparingly!
```

### Fallback Doctor Validation Fails
**Symptoms:** "Fallback chain invalid" warning before deployment

**Fix:**
```bash
# 1. Run diagnostic
fallback-doctor diagnose ~/.config/opencode/rate-limit-fallback.json

# 2. Fix issues
# - Add missing models
# - Reorder to Anthropic-first
# - Remove duplicates

# 3. Verify
fallback-doctor diagnose ~/.config/opencode/rate-limit-fallback.json
# Should show: "✓ Chain valid"
```

---

## 🔴 Performance Issues

### High Token Usage
**Symptoms:** Tokens consumed faster than expected

**Fix:**
1. Enable distill-mcp:
   ```json
   {
     "mcpServers": {
       "distill": { "enabled": true }
     }
   }
   ```
2. Use smart file reading:
   ```js
   const distill = require('distill-mcp');
   const summary = await distill.smartRead(file, 'summary');
   ```
3. Check Governor budget:
   ```js
   const gov = require('opencode-context-governor');
   console.log(gov.getRemainingBudget());
   ```
4. Disable expensive MCPs (sequentialthinking, playwright)

### Slow Agent Response
**Symptoms:** Tasks take >5s to start

**Fix:**
1. Check system resources:
   ```bash
   # Windows
   tasklist | grep node
   # macOS
   ps aux | grep node
   ```
2. Disable lazy MCPs:
   ```json
   {
     "pluginConfig": { "lazy": false }
   }
   ```
3. Profile agent:
   ```bash
   opencode run "debug agent sisyphus"
   ```
4. Use faster model:
   ```json
   {
     "agents": {
       "sisyphus": { "model": "claude-haiku-4-5" }
     }
   }
   ```

---

## 📞 Get Help

1. **Check logs:**
   ```bash
   tail -f ~/.opencode/logs/system.log
   tail -f ~/.opencode/healthd.log
   ```

2. **Search supermemory:**
   ```bash
   opencode supermemory search "error keyword"
   ```

3. **File issue:**
   - GitHub: https://github.com/GAIn-Tech/opencode-setup/issues
   - Include: error message, config file (sanitized), steps to reproduce

4. **View previous solutions:**
   - `LEARNING-ENGINE.md` — Anti-pattern catalog
   - `runbooks.json` — 7+ error patterns with remedies

