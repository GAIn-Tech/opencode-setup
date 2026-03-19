# OpenCode Agents - Local Audit Mirror

This directory contains local copies of agent definitions and prompts for auditability and transparency.

## Background
The oh-my-opencode plugin manages 8+ agents externally. This creates an auditability black box where:
- Agent prompts are not visible locally
- Integration patterns cannot be verified
- Changes to agent behavior are opaque

## Agent Definitions

### Enabled Agents (from oh-my-opencode.json)
1. **atlas** - Orchestration and planning agent
   - Model: anthropic/claude-sonnet-4-6
   
2. **hephaestus** - Builder and implementation agent
   - Model: openai/gpt-5.3-codex (medium variant)
   
3. **librarian** - Research and documentation agent
   - Model: anthropic/claude-sonnet-4-6
   
4. **metis** - Strategic and architectural agent
   - Model: anthropic/claude-opus-4-6 (max variant)
   
5. **momus** - Critique and review agent
   - Model: openai/gpt-5.2 (medium variant)
   
6. **oracle** - Analysis and prediction agent
   - Model: openai/gpt-5.2 (high variant)
   
7. **prometheus** - Innovation and discovery agent
   - Model: anthropic/claude-opus-4-6 (max variant)
   
8. **sisyphus** - Persistence and execution agent
   - Model: anthropic/claude-opus-4-6 (max variant)

### Utility Agents
9. **explore** - Exploration and search agent
   - Model: anthropic/claude-haiku-4-5
   
10. **multimodal-looker** - Visual and multimodal analysis
    - Model: antigravity/antigravity-gemini-3-flash

## Integration Patterns

### Skill ↔ Agent Wiring
Each skill should specify which agent(s) it works best with in its `SKILL.md`:
- `recommended_agents: []` - Suggested agents for this skill
- `compatible_agents: []` - Compatible agents (fallback)

### MCP ↔ Agent Wiring
MCP tools have affinity patterns with agents:
- Context7 → librarian (primary), oracle (secondary)
- Distill → atlas (orchestration context), sisyphus (execution context)
- Playwright → hephaestus (implementation), momus (testing)

## Known Issues

### Audit Gap
Agent prompts are defined in the oh-my-opencode npm package (not in this repo). To audit:
1. Clone oh-my-opencode repo locally
2. Extract agent prompts from `src/agents/`
3. Store copies here for reference

### Integration Verification
Current verification method:
1. Check `opencode-config/oh-my-opencode.json` for enabled agents
2. Check MCP server configurations in `opencode.json`
3. Check skill registry in `compound-engineering.json`
4. Verify runtime wiring in logs

## Future Improvements

1. **Local Mirroring**: Automatically sync agent prompts from npm package
2. **Integration Tests**: Verify agent↔skill↔MCP wiring
3. **Monitoring Dashboard**: Track agent invocation patterns
4. **Fallback Analysis**: Document when agents fall back to defaults