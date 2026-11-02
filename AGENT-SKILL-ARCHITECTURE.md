# Oh-My-OpenCode Agent-Skill Architecture Analysis

**Generated:** 2026-02-19  
**Scope:** Agent definitions, skill loading, composition patterns, task() dispatch  
**Purpose:** Inform skill chaining/synergy system design

---

## EXECUTIVE SUMMARY

The oh-my-opencode plugin implements a **hierarchical agent system** where:

1. **Agents** are specialized LLM configurations with distinct roles (Sisyphus, Hephaestus, Oracle, etc.)
2. **Skills** are reusable prompt templates that extend agent capabilities
3. **Categories** are task-scoped agent configurations with custom models/temperatures
4. **task()** is the dispatch mechanism that routes work to agents with loaded skills

**Key insight**: Skills are **stateless prompt injections** — agents don't retain skill knowledge across calls unless explicitly passed via `load_skills` parameter.

---

## AGENT INVENTORY & ROLES

| Agent | Model | Mode | Purpose | Skill Integration |
|-------|-------|------|---------|-------------------|
| **Sisyphus** | claude-opus-4-6 | primary | Main orchestrator, plans + delegates | Receives available skills list for delegation decisions |
| **Hephaestus** | gpt-5.3-codex | primary | Autonomous deep worker, end-to-end execution | Loads skills via `load_skills` parameter in task() |
| **Atlas** | claude-sonnet-4-6 | primary | Todo-list orchestrator, multi-agent coordination | Builds dynamic prompt with available skills/agents/categories |
| **Oracle** | gpt-5.2 | subagent | Read-only consultation, architecture advice | Receives skill context for informed recommendations |
| **Librarian** | glm-4.7 | subagent | External docs/code search | Stateless, no skill loading needed |
| **Explore** | grok-code-fast-1 | subagent | Contextual grep, codebase search | Stateless, no skill loading needed |
| **Metis** | claude-opus-4-6 | subagent | Pre-planning consultant, intent analysis | Receives skill context for pattern discovery |
| **Momus** | gpt-5.2 | subagent | Plan reviewer, quality assurance | Receives skill context for validation |
| **Multimodal-Looker** | gemini-3-flash | subagent | PDF/image analysis | Stateless, no skill loading needed |

---

## SKILL LOADING ARCHITECTURE

### 1. Skill Resolution Pipeline

Agent receives task() call with load_skills parameter → resolveMultipleSkills() → Extract templates → Prepend to prompt

**Key Files:**
- `/local/oh-my-opencode/src/agents/agent-builder.ts` — buildAgent() function
- `/local/oh-my-opencode/src/features/opencode-skill-loader/skill-template-resolver.ts` — resolveMultipleSkills()

### 2. Skill Discovery & Registration

buildAvailableSkills() combines builtin + discovered skills → Maps to AvailableSkill[] → Passed to agents for delegation

**Key Files:**
- `/local/oh-my-opencode/src/agents/builtin-agents/available-skills.ts` — buildAvailableSkills()

### 3. Skill Injection Points

**A. Agent-Level (Static):** Skills defined in agent config, loaded at agent creation
**B. Task-Level (Dynamic):** Skills passed via load_skills parameter in task() call
**C. Category-Level (Configuration):** Skills defined in .opencode.config.json categories

---

## TASK() DISPATCH MECHANISM

task(category="X", load_skills=[...], prompt="...") → Resolve category → Merge skills → Spawn Sisyphus-Junior → Execute

**Statelessness Note:** Subagents are stateless — they lose all custom skill knowledge unless explicitly passed via load_skills

---

## SKILL COMPOSITION PATTERNS (CURRENT)

1. **Sequential Skill Loading:** Multiple skills concatenated in order
2. **Category-Based Composition:** Category defines base skills + task() adds more
3. **Conditional Skill Loading:** Custom skills highlighted in prompt
4. **Skill Filtering:** Disabled skills excluded from loading

---

## MULTI-SKILL COMPOSITION OPPORTUNITIES

### 1. Skill Dependency Chains
Define skill dependencies and auto-load transitive dependencies

### 2. Skill Synergy Scoring
Score skill combinations for task types and recommend high-synergy sets

### 3. Skill Composition Profiles
Define reusable skill profiles (e.g., "deep-refactoring", "feature-build")

### 4. Skill Context Preservation
Store skill context in session and preserve across task() calls

### 5. Skill Conflict Detection
Warn when conflicting skills are loaded together

### 6. Skill Ordering Optimization
Optimize skill order in prompt for efficiency

---

## KEY FINDINGS FOR SKILL CHAINING DESIGN

1. **Statelessness is Fundamental** — Skills are prompt templates, not persistent objects
2. **Composition Happens at Dispatch Time** — Skills resolved when task() is called
3. **No Built-in Skill Ordering** — Skills concatenated in order provided
4. **Skill Metadata is Available** — Agents can make informed delegation decisions
5. **Categories Provide Composition Baseline** — Categories define base skills + model/temperature
6. **Custom Skills Are High Priority** — Must be evaluated for every delegation

---

## RECOMMENDED SKILL CHAINING ARCHITECTURE

### Phase 1: Skill Profiles (Low Complexity)
Define reusable skill combinations and use in task() calls

### Phase 2: Skill Dependencies (Medium Complexity)
Define skill dependencies and auto-resolve transitive dependencies

### Phase 3: Skill Synergy Scoring (High Complexity)
Score skill combinations and recommend high-synergy sets

---

## FILES TO REFERENCE

**Agent Definitions:**
- `/local/oh-my-opencode/src/agents/sisyphus.ts`
- `/local/oh-my-opencode/src/agents/hephaestus.ts`
- `/local/oh-my-opencode/src/agents/atlas/agent.ts`
- `/local/oh-my-opencode/src/agents/metis.ts`

**Skill Loading:**
- `/local/oh-my-opencode/src/agents/agent-builder.ts`
- `/local/oh-my-opencode/src/features/opencode-skill-loader/skill-template-resolver.ts`
- `/local/oh-my-opencode/src/agents/builtin-agents/available-skills.ts`

**Task Dispatch:**
- `/local/oh-my-opencode/src/agents/atlas/default.ts`
- `/local/oh-my-opencode/src/agents/atlas/gpt.ts`

**Dynamic Prompt Building:**
- `/local/oh-my-opencode/src/agents/dynamic-agent-prompt-builder.ts`
- `/local/oh-my-opencode/src/agents/atlas/prompt-section-builder.ts`

