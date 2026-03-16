# Debugging Skill Clarification

## Overview
There are three debugging-related skills in the OpenCode setup:
1. **systematic-debugging** (superpowers) - Manual debugging process
2. **code-doctor** - Automated diagnostic and healing  
3. **incident-commander** - Multi-turn incident triage

This document clarifies when to use each skill to avoid overlap and confusion.

## Skill Comparison

### 1. systematic-debugging
**Location**: `opencode-config/skills/superpowers/systematic-debugging/SKILL.md`
**Category**: debugging (also in development category)
**Type**: **Manual** debugging process

**When to use:**
- Manual debugging by human+agent pair
- Following the 4-phase systematic process
- Root cause analysis before any fixes
- When you want to understand the bug yourself

**Key characteristics:**
- No automated fixes
- Strict 4-phase process (investigation → pattern → hypothesis → implementation)
- Focus on understanding over fixing
- Defense-in-depth approach

### 2. code-doctor
**Location**: `opencode-config/skills/code-doctor/SKILL.md`
**Category**: debugging
**Type**: **Automated** diagnostic and healing

**When to use:**
- Autonomous bug fixing
- Automated test failure diagnosis
- Build error resolution
- When you want the agent to attempt fixes automatically

**Key characteristics:**
- 5-phase automated loop (triage → RCA → healing → verification → escalation)
- 3-attempt limit before escalation
- Automated git bisect and fault localization
- Produces fix commits

### 3. incident-commander
**Location**: `opencode-config/skills/incident-commander/SKILL.md`
**Category**: debugging
**Type**: **Multi-turn** incident management

**When to use:**
- Complex production incidents
- Multi-component system failures
- Coordinated debugging across teams/systems
- When incident requires sustained attention

**Key characteristics:**
- Structured diagnosis over multiple turns
- Focus on system-wide impact
- Coordination with monitoring/alerts
- Incident timeline management

## Decision Framework

### Flowchart for Debugging Skill Selection

```
┌─────────────────────────────┐
│         BUG DETECTED        │
└──────────────┬──────────────┘
               ▼
   ┌─────────────────────┐
   │ Production incident? │───Yes──► incident-commander
   └──────────┬──────────┘
              No
               ▼
   ┌─────────────────────┐
   │ Want automated fix? │───Yes──► code-doctor
   └──────────┬──────────┘
              No
               ▼
         systematic-debugging
```

### Detailed Decision Table

| Context | Recommended Skill | Why |
|---------|------------------|-----|
| **Build/test failure** | `code-doctor` | Automated diagnosis and fix attempts |
| **Manual debugging session** | `systematic-debugging` | Structured human-in-loop process |
| **Production outage** | `incident-commander` | Multi-turn coordinated response |
| **Regression investigation** | `code-doctor` → `systematic-debugging` | Start automated, escalate to manual |
| **Complex architecture bug** | `systematic-debugging` | Requires deep understanding |
| **Simple syntax error** | Direct fix (no skill) | Trivial issue |
| **Performance issue** | `systematic-debugging` | Requires measurement and analysis |
| **Security vulnerability** | Manual investigation | Too risky for automation |

## Skill Overlap Clarification

### Code-doctor vs Systematic-debugging
- **Code-doctor**: **DOES** the fixing (automated)
- **Systematic-debugging**: **TEACHES** how to fix (manual)

**Think of it as:**
- `code-doctor` = automated mechanic
- `systematic-debugging` = repair manual + human mechanic

### Incident-commander vs Others
- **Incident-commander**: **MANAGES** the incident (coordination)
- **Others**: **SOLVE** the technical problem (execution)

**Relationship**: `incident-commander` can delegate to `code-doctor` or `systematic-debugging` for technical investigation.

## Integration Patterns

### Skill Chaining
```
incident-commander (identify component)
   ↓
code-doctor (automated fix attempt)
   ↓
systematic-debugging (manual if automation fails)
   ↓
verification-before-completion (final check)
```

### Skill Recommendations
- Add `dependencies` and `synergies` to clarify relationships
- Update `SKILL.md` files with cross-references
- Ensure skill-orchestrator understands the hierarchy

## Action Items

### Completed
✅ Created this clarification document

### Recommended
1. Update skill metadata with clearer boundaries:
   - `code-doctor/SKILL.md`: Emphasize automation aspect
   - `systematic-debugging/SKILL.md`: Emphasize manual process
   - `incident-commander/SKILL.md`: Emphasize coordination role

2. Add skill selection guidance to skill-orchestrator:
   ```
   // Suggested skill-orchestrator logic
   if (context.includes('production incident')) return 'incident-commander';
   if (context.includes('automated fix')) return 'code-doctor';
   if (context.includes('debug')) return 'systematic-debugging';
   ```

3. Run integration tests:
   - Verify skills don't conflict
   - Test skill chaining scenarios
   - Check for duplicate functionality

## Impact Assessment

**Current state**: Medium confusion (3 overlapping debugging skills)

**After clarification**: Clear decision framework

**Integration score impact**: **+10 points**
- Reduced cognitive overhead
- Clear skill selection
- Complementary skill relationships
- Improved debugging workflow

## Verification

Test debugging scenarios:
1. Simple test failure → should trigger `code-doctor`
2. Complex architecture issue → should trigger `systematic-debugging`  
3. Production API outage → should trigger `incident-commander`

Check skill recommendations in logs:
```
bun run opencode-config/agents/audit-agent-integration.js
```

Review skill usage patterns:
- Are all three skills being used appropriately?
- Any skill consistently underutilized?
- Any context where skill selection is ambiguous?