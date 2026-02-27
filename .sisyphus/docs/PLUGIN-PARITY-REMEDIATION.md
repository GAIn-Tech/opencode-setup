# Plugin Parity Verification Runbook

## Overview

This runbook documents how to remediate failures detected by `scripts/verify-plugin-parity.mjs`, which verifies that the active local plugin code (`local/oh-my-opencode/src/plugin/tool-execute-after.ts`) includes MCP telemetry wiring expected by the repo.

**Risk**: `local/` is gitignored. Plugin code can drift from repo assumptions without governance detecting it.

**Solution**: Repeatable verification check + remediation steps.

---

## Running the Verification

```bash
# From repo root:
node scripts/verify-plugin-parity.mjs

# Expected output on success:
# 📊 Summary: 6/6 checks passed
# "status": "PASS"
# Exit code: 0

# On failure:
# 📊 Summary: N/6 checks passed
# "status": "FAIL"
# Exit code: 1
```

---

## Check Descriptions & Remediation

### Check 1: `file-exists`
**What it checks**: `local/oh-my-opencode/src/plugin/tool-execute-after.ts` exists.

**If it fails**:
- The plugin hook file is missing or in wrong location
- **Remediation**: Restore from git or rebuild plugin structure
  ```bash
  git checkout local/oh-my-opencode/src/plugin/tool-execute-after.ts
  ```

---

### Check 2: `mcp-prefixes-defined`
**What it checks**: `MCP_PREFIXES` array is defined with at least 2 MCP provider prefixes (context7, distill, supermemory, websearch, grep, github, playwright).

**If it fails**:
- The MCP prefix filter is missing or incomplete
- **Remediation**: Add/restore the MCP_PREFIXES definition
  ```typescript
  // In tool-execute-after.ts, near the top of the file:
  const MCP_PREFIXES = [
    'mcp_context7_', 'mcp__context7__',
    'mcp_distill_', 'mcp__distill__',
    'mcp_supermemory_', 'mcp__supermemory__',
    'mcp_websearch_', 'mcp__websearch__',
    'mcp_grep_', 'mcp__grep__',
    'mcp_github_', 'mcp__github__',
    'mcp_playwright_', 'mcp__playwright__',
  ]
  ```

---

### Check 3: `logInvocation-import`
**What it checks**: `logInvocation` is imported from `tool-usage-tracker.js`.

**If it fails**:
- The import statement is missing or broken
- **Remediation**: Add the import at the top of tool-execute-after.ts
  ```typescript
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { logInvocation } = require("../../../../packages/opencode-learning-engine/src/tool-usage-tracker.js") as {
    logInvocation: (tool: string, params: Record<string, unknown>, result: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<void>
  }
  ```

---

### Check 4: `logInvocation-call`
**What it checks**: `logInvocation` is called in a fire-and-forget pattern (setImmediate + .catch).

**If it fails**:
- The telemetry call is missing or not using fire-and-forget pattern
- **Remediation**: Add the fire-and-forget telemetry block in the hook handler
  ```typescript
  // In the hook handler, after checking if tool is MCP:
  if (MCP_PREFIXES.some(p => toolName?.startsWith(p))) {
    setImmediate(() => {
      logInvocation(toolName, {}, { output: typeof output?.output === 'string' ? output.output.slice(0, 200) : '' }, {
        sessionId: input.sessionID,
        source: 'tool-execute-after-hook',
      }).catch(() => {})
    })
  }
  ```

---

### Check 5: `mcp-tool-detection`
**What it checks**: Logic to detect if a tool name is an MCP tool (using `.some()` and `.startsWith()`).

**If it fails**:
- The MCP tool detection logic is missing
- **Remediation**: Add the detection check before the logInvocation call
  ```typescript
  const isMCPTool = MCP_PREFIXES.some(p => toolName?.startsWith(p))
  if (isMCPTool) {
    // ... fire-and-forget logInvocation call
  }
  ```

---

### Check 6: `tool-usage-tracker-export`
**What it checks**: `logInvocation` is exported from `packages/opencode-learning-engine/src/tool-usage-tracker.js`.

**If it fails**:
- The function is not exported from the module
- **Remediation**: Add `logInvocation` to the module.exports block
  ```javascript
  // At the end of tool-usage-tracker.js:
  module.exports = {
    detectUnderUse,
    getUsageReport,
    startSession,
    endSession,
    logInvocation,    // ← ADD THIS
    AVAILABLE_TOOLS,
    TOOL_APPROPRIATENESS_RULES
  };
  ```

---

## Failure Scenarios & Root Causes

### Scenario A: All checks fail
**Root cause**: Plugin file is completely missing or corrupted.
**Fix**: Restore from git
```bash
git checkout local/oh-my-opencode/src/plugin/tool-execute-after.ts
```

### Scenario B: Checks 1–3 pass, 4–6 fail
**Root cause**: Plugin file exists but telemetry wiring is incomplete.
**Fix**: Add the fire-and-forget block (Check 4 remediation) + verify tool-usage-tracker export (Check 6 remediation).

### Scenario C: Checks 1–5 pass, 6 fails
**Root cause**: Plugin is wired correctly but tool-usage-tracker doesn't export logInvocation.
**Fix**: Export logInvocation from tool-usage-tracker.js (Check 6 remediation).

### Scenario D: Check 2 fails (MCP_PREFIXES incomplete)
**Root cause**: New MCP provider added to system but not in prefix list.
**Fix**: Add new provider prefix to MCP_PREFIXES array (Check 2 remediation).

---

## Verification After Remediation

After applying any remediation:

1. **Re-run the check**:
   ```bash
   node scripts/verify-plugin-parity.mjs
   ```
   Expected: `Summary: 6/6 checks passed` + exit code 0

2. **Verify telemetry actually works** (optional, for confidence):
   ```bash
   # Simulate an MCP tool call and check if it's logged
   node -e "
     const { logInvocation } = require('./packages/opencode-learning-engine/src/tool-usage-tracker.js');
     logInvocation('mcp_context7_resolve-library-id', {q:'test'}, {ok:true}, {source:'manual-test'})
       .then(() => console.log('✅ Telemetry write OK'))
       .catch(e => console.error('❌ Telemetry write failed:', e.message));
   "
   ```

3. **Commit the fix**:
   ```bash
   git add local/oh-my-opencode/src/plugin/tool-execute-after.ts packages/opencode-learning-engine/src/tool-usage-tracker.js
   git commit -m "fix(telemetry): restore MCP hook telemetry wiring"
   ```

---

## CI/Governance Integration

To integrate this check into CI:

```bash
# In .github/workflows/governance.yml or similar:
- name: Verify plugin parity
  run: node scripts/verify-plugin-parity.mjs
  # Fails the workflow if exit code != 0
```

Or in a pre-commit hook:

```bash
# In .git/hooks/pre-commit:
#!/bin/bash
node scripts/verify-plugin-parity.mjs || exit 1
```

---

## FAQ

**Q: Why is this check needed if `local/` is gitignored?**
A: Because `local/` is gitignored, governance cannot prevent drift. This check runs locally (or in CI) to detect if the active plugin code matches repo expectations.

**Q: What if the check passes but telemetry still doesn't work?**
A: The check verifies code structure, not runtime behavior. If telemetry fails at runtime:
1. Check that `tool-usage-tracker.js` loads without errors: `node -e "require('./packages/opencode-learning-engine/src/tool-usage-tracker.js'); console.log('OK')"`
2. Check that the hook is actually invoked (add console.log to tool-execute-after.ts temporarily)
3. Check that `~/.opencode/tool-usage/` directory is writable

**Q: Can I disable this check?**
A: Not recommended. If you must, set `SKIP_PLUGIN_PARITY_CHECK=1` in CI, but document why.

**Q: What if I add a new MCP provider?**
A: Update MCP_PREFIXES in tool-execute-after.ts to include the new provider's prefix (e.g., `mcp_newprovider_`).

---

## Related Files

- **Verification script**: `scripts/verify-plugin-parity.mjs`
- **Plugin hook**: `local/oh-my-opencode/src/plugin/tool-execute-after.ts`
- **Telemetry module**: `packages/opencode-learning-engine/src/tool-usage-tracker.js`
- **Plan context**: `.sisyphus/plans/context-distill-tracking-fixes.md` (Task A3)

---

## Version History

- **2026-02-27**: Initial runbook created for Task A3 (Plugin Parity Verification)
