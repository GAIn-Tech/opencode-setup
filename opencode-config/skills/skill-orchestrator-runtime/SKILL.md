---
# REQUIRED FIELDS
name: skill-orchestrator-runtime
description: >
  Runtime skill orchestration that dynamically selects and chains skills based on context analysis.

# OPTIONAL METADATA
version: 1.0.0
category: meta

# COMPOSITION METADATA
dependencies: []
synergies: ["systematic-debugging", "test-driven-development", "brainstorming", "incident-commander"]
conflicts: []
outputs:
  - type: decision
    name: skill-selection
    location: runtime
inputs:
  - type: context
    name: task-context
    required: true
  - type: context
    name: available-skills
    required: true
---

# Skill Orchestrator Runtime

## Overview

A meta-skill that orchestrates skill selection at runtime by analyzing task context and selecting optimal skill combinations. Uses registry data to make intelligent skill chaining decisions.

## When to Use

Use this skill when:
- Complex multi-step task requires multiple skills
- Unclear which skill to use - need intelligent recommendation
- Task spans multiple domains (debugging + testing + review)
- Want to optimize skill selection based on synergies

Do NOT use this skill for:
- Simple single-step tasks that have obvious skill
- When user explicitly specifies desired skills
- Time-critical tasks where orchestration overhead is unacceptable

## Inputs Required

- **Task Context**: The user's request, parsed into intent signals
- **Available Skills**: List of registered skills from registry.json
- **Session History**: Previous skills used in this session (for chaining)

## Workflow

### Phase 1: Context Analysis

1. Parse user request into intent signals
2. Extract task category, complexity, and domain signals
3. Identify explicit skill mentions in request
4. Check session history for skill chaining opportunities

### Phase 2: Skill Discovery

1. Query registry for matching skills by:
   - Trigger phrase matching
   - Category alignment
   - Tag overlap with task signals
2. Score each candidate by:
   - Direct trigger match (weight: 0.4)
   - Category relevance (weight: 0.3)
   - Synergy with session history (weight: 0.3)
3. Apply conflict filtering - remove skills that conflict with used skills

### Phase 3: Skill Chaining

1. If single skill sufficient, return that recommendation
2. If multiple skills needed, determine optimal order:
   - Skills with dependencies execute first
   - Planning skills before implementation skills
   - Verification skills at end
3. Build execution chain with handoff protocols

### Phase 4: Recommendation Generation

1. Return top 3 skill recommendations with scores
2. Include execution order if chaining needed
3. Provide reasoning for each recommendation

## Must Do

- Use registry.json for skill discovery
- Respect skill dependencies - load dependent skills first
- Consider synergies - recommend complementary skills
- Filter conflicts - never recommend conflicting skills together

## Must Not Do

- Hard-code skill names - always use registry
- Ignore skill dependencies in chaining
- Recommend more than 5 skills (cognitive overload)
- Skip conflict checking

## Handoff Protocol

### Receives From
- Any skill: Task context as input

### Hands Off To
- Selected skills: Passes necessary context and signals

## Output Contract

1. **Primary Recommendation**: Top skill with confidence score
2. **Alternatives**: Up to 2 backup recommendations
3. **Execution Order**: If chaining needed, ordered skill list
4. **Reasoning**: Brief explanation for each recommendation

## Profile-Based Loading

The registry defines **profiles** — curated skill subsets for common task patterns. When the task matches a profile trigger, load ONLY those skills instead of the full set. This keeps context lean and avoids cognitive overload.

### Available Profiles

| Profile | Trigger phrases | Skills |
|---------|----------------|--------|
| `deep-refactoring` | "refactor", "clean up code", "improve architecture" | test-driven-development, systematic-debugging, git-master, verification-before-completion |
| `planning-cycle` | "plan feature", "design system", "architect" | brainstorming, writing-plans, executing-plans |
| `review-cycle` | "code review", "PR review", "review cycle" | requesting-code-review, receiving-code-review, verification-before-completion |
| `parallel-implementation` | "parallel work", "divide and conquer", "complex implementation" | dispatching-parallel-agents, subagent-driven-development, executing-plans |
| `browser-testing` | "test UI", "browser test", "visual verification" | playwright, frontend-ui-ux, verification-before-completion |
| `diagnostic-healing` | "diagnose", "fix bug", "heal code", "auto-fix", "incident" | code-doctor, systematic-debugging, incident-commander, git-master |
| `research-to-code` | "research and build", "investigate then implement", "deep dive" | research-builder, context7, writing-plans, executing-plans |

### Profile Resolution Algorithm

```
1. Scan task for trigger phrases → match profile
2. If profile matched → load ONLY profile.skills (ignore rest)
3. If no profile matched → fall through to full skill scoring (Phase 2)
4. If 2+ profiles match → union the skill lists (deduplicated)
```

### When to Use Profiles vs Full Scoring

- **Profile match**: load the profile directly — no need for Phase 2 scoring
- **Ambiguous task**: run full scoring (Phase 2) to find best-fit skills
- **Explicit user request**: honor explicit skill mentions over profile auto-selection

## Documentation Task Detection (Context7 Auto-Recommendation)

When the task involves library/framework documentation lookups, the orchestrator MUST recommend the **context7** skill (and optionally the **librarian** agent) before any implementation skills.

### Detection Keywords

If the user request contains any of these patterns, recommend context7:
- "how do I use [library]", "API for [package]", "correct syntax for"
- "library docs", "framework documentation", "package reference"
- "what version of [lib]", "latest API", "migration guide"
- Import/require statements referencing unfamiliar packages
- Questions about function signatures, parameters, or return types

### Recommendation Rule

```
IF task contains documentation_keywords:
  1. Recommend context7 as PRIMARY skill (score: 0.9)
  2. If research-builder is also recommended, chain: context7 → research-builder
  3. Log: "Documentation task detected — context7 recommended for up-to-date API reference"
```

### Integration with Research Profile

The `research-to-code` profile should include context7 for documentation-heavy research:
- Profile skills: `["research-builder", "context7", "writing-plans", "executing-plans"]`
- context7 runs first to gather accurate API references before spec writing

## Persistent Memory Task Detection (Supermemory Auto-Recommendation)

When the task involves recall, durable project knowledge, or cross-session memory, the
orchestrator MUST recommend the **supermemory** skill before implementation or repeated research.

### Detection Keywords

If the user request contains any of these patterns, recommend supermemory:
- "remember this", "save this for later", "store this decision"
- "what did we decide", "recall previous", "across sessions"
- "project memory", "persistent memory", "user preference"

### Recommendation Rule

```
IF task contains memory_keywords:
  1. Recommend supermemory as PRIMARY skill (score: 0.9)
  2. If writing-plans is also recommended, chain: supermemory → writing-plans
  3. Log: "Persistent memory task detected - supermemory recommended"
```

## Structured Reasoning Task Detection (Sequential Thinking Auto-Recommendation)

When the task explicitly needs step-by-step reasoning, branching analysis, or hypothesis testing,
the orchestrator MUST recommend **sequentialthinking** before implementation skills.

### Detection Keywords

If the user request contains any of these patterns, recommend sequentialthinking:
- "think step by step", "reason through", "break this down"
- "analyze carefully", "multiple hypotheses", "work through the logic"

### Recommendation Rule

```
IF task contains reasoning_keywords:
  1. Recommend sequentialthinking as PRIMARY skill (score: 0.85)
  2. If systematic-debugging is also recommended, chain: sequentialthinking → systematic-debugging
  3. Log: "Structured reasoning task detected - sequentialthinking recommended"
```

## Live Web Research Task Detection (Websearch Auto-Recommendation)

When the task depends on current web information, live page content, or non-library web research,
the orchestrator MUST recommend **websearch** before implementation.

### Detection Keywords

If the user request contains any of these patterns, recommend websearch:
- "search the web", "find current information", "latest update"
- "scrape this site", "take a screenshot", "youtube transcript"
- "current status", "what does this page say today"

### Recommendation Rule

```
IF task contains websearch_keywords:
  1. Recommend websearch as PRIMARY skill (score: 0.9)
  2. If research-builder is also recommended, chain: websearch → research-builder
  3. Log: "Live web research task detected - websearch recommended"
```

## External Code Example Detection (Grep Auto-Recommendation)

When the task asks for real-world code examples from public repositories, the orchestrator MUST
recommend **grep** before implementation.

### Detection Keywords

If the user request contains any of these patterns, recommend grep:
- "find GitHub example", "search code", "public repo example"
- "how do other repos do this", "grep github", "code pattern example"

### Recommendation Rule

```
IF task contains code_example_keywords:
  1. Recommend grep as PRIMARY skill (score: 0.85)
  2. If context7 is also recommended, chain: context7 → grep
  3. Log: "External code example task detected - grep recommended"
```

## Context Compression Detection (Distill Auto-Recommendation)

When the task is about reclaiming context budget, compressing long histories, or preparing
for large multi-step work, the orchestrator MUST recommend **distill** before implementation.

### Detection Keywords

If the user request contains any of these patterns, recommend distill:
- "compress context", "context too long", "prune conversation"
- "reclaim tokens", "context budget", "too much history"
- "before long task", "compress logs", "distill this"

### Recommendation Rule

```
IF task contains distill_keywords:
  1. Recommend distill as PRIMARY skill (score: 0.9)
  2. If context-governor is also relevant, chain: context-governor → distill
  3. Log: "Context compression task detected - distill recommended"
```

## Quick Start

1. Check task against profile trigger phrases first
2. Check for documentation keywords → recommend context7 if matched
3. Check for memory/reasoning/web/code-example/compression keywords → recommend supermemory, sequentialthinking, websearch, grep, or distill when matched
4. If profile matched → load profile skills and skip to Phase 3 (chaining)
5. Otherwise: load registry.json, parse intent signals, score all skills
6. Filter by conflicts and dependencies
7. Return top recommendations with chaining order
