# Browser Skill Selection Guidance

## Overview
There are three browser-related skills listed in the registry, but only one (`playwright`) has a proper skill definition. This creates confusion about when to use each.

## Current State

### Available Browser Skills

1. **playwright** ✅ (Properly defined)
   - Location: `opencode-config/skills/playwright/SKILL.md`
   - Description: Direct browser automation via Playwright MCP
   - Status: Fully implemented and documented

2. **dev-browser** ❓ (Listed but missing)
   - Listed in: `compound-engineering.json` line 19
   - Category: "browser"
   - No skill definition found
   - Likely a placeholder or external dependency

3. **agent-browser** ❓ (Listed but missing)
   - Listed in: `compound-engineering.json` line 18
   - Category: "browser"
   - No skill definition found
   - Likely a placeholder or external dependency

## Decision Framework

### When to Use Playwright

**USE Playwright when:**
- You need direct browser control via Playwright MCP
- Screenshots or visual verification required
- Multi-step browser flows with real page state
- Clear mapping to Playwright MCP in telemetry

**DO NOT use Playwright when:**
- Static page fetches without browser interaction
- Pure codebase questions
- CLI/ref-specific browser behavior needed (use appropriate alternative)

### Missing Skill Resolution

Since `dev-browser` and `agent-browser` don't have skill definitions:

1. **Option 1**: Remove from registry (cleanup)
2. **Option 2**: Create placeholder definitions
3. **Option 3**: Assume they're handled by external plugins

## Recommendation

### Short-term (Immediate)
1. Use `playwright` for all browser automation tasks
2. Add a note to playwright SKILL.md clarifying it's the primary browser skill

### Medium-term
1. Investigate source of `dev-browser` and `agent-browser` references
2. Determine if they should be removed from registry or defined
3. Update registry to reflect actual browser skill availability

### Long-term
1. Standardize on single browser skill (`playwright`) with clear use cases
2. Remove ambiguous references from configuration
3. Ensure all browser-related functionality flows through documented skill

## Integration Impact

Current integration score impact: **-5 points**
- Missing skill definitions create confusion
- Unclear triggering between browser options
- Potential for incorrect skill selection

Fix impact: **+5 points**
- Clear, single browser skill path
- Reduced cognitive overhead
- Improved skill selection accuracy

## Action Items

1. ✅ Created this guidance document
2. Update `playwright/SKILL.md` to acknowledge it's the primary browser skill
3. Consider removing `dev-browser` and `agent-browser` from registry
4. Verify with oh-my-opencode plugin if these are external dependencies

## Verification

Run browser skill audit:
```bash
bun run opencode-config/agents/audit-agent-integration.js
```

Check browser skill status:
- Only `playwright` should be active browser skill
- All browser automation should route through playwright skill
- No references to undefined browser skills in runtime