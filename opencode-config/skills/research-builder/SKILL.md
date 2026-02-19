---
name: research-builder
description: Deep research skill that gathers information from multiple sources, synthesizes into a spec artifact, enforces quality gates, and then implements the feature.
version: 1.0.0
category: research
tags: [research, implementation, spec, feature-building, multi-source]
dependencies: [brainstorming, writing-plans]
synergies: [executing-plans, verification-before-completion, test-driven-development]
conflicts: []
outputs: [research-report, spec-artifact, implementation, verification-report]
inputs: [feature-request, research-question, problem-statement]
---

## Overview

research-builder bridges the gap between "I need to build X" and "here's working code for X" by enforcing a research-first approach. It prevents premature implementation by requiring comprehensive research and a validated spec artifact before any code is written.

## When to Use

- Building features using unfamiliar libraries or APIs
- Implementing patterns you haven't used before
- Creating integrations with external services
- Any feature where "how to do it right" isn't immediately clear
- When you want to avoid rework from incomplete understanding

## When NOT to Use

- Simple changes with well-known patterns
- Bug fixes (use code-doctor instead)
- Refactoring existing code (use systematic-debugging)
- When user explicitly says "just implement it"

## Inputs Required

| Input | Required | Description |
|-------|----------|-------------|
| feature_request | Yes | What needs to be built |
| constraints | No | Technical constraints, deadlines, compatibility |
| existing_context | No | Relevant existing code or patterns to follow |
| quality_bar | No | Acceptance criteria for the research quality |

## Workflow

### Phase 1: Research

**Goal**: Gather comprehensive information from multiple sources.

#### Source Types (Priority Order)

1. **Official Documentation** (highest priority)
   - Use Context7 for library docs
   - Check API references
   - Read migration guides if upgrading

2. **Existing Codebase**
   - Search for similar patterns in project
   - Check how related features are implemented
   - Identify conventions to follow

3. **GitHub Examples**
   - Search high-quality repos (1000+ stars)
   - Look for production-ready patterns
   - Use grep.app for specific code patterns

4. **Web Search**
   - Stack Overflow for common issues
   - Blog posts for best practices
   - Avoid outdated tutorials (check dates)

#### Research Protocol

```
FOR each aspect of the feature:
  1. Query multiple sources in parallel
  2. Grade each source (A/B/C/D)
  3. Resolve conflicts using Source Priority Matrix
  4. Document uncertainties for spec review
```

**Source Priority Matrix**:
| Conflict Type | Resolution |
|---------------|------------|
| Official docs vs blog | Trust official docs |
| New tutorial vs old | Trust newer, verify still works |
| Codebase vs external | Follow codebase conventions |
| Multiple valid approaches | Document all, recommend one |

**Output**: Research report with sourced findings and confidence levels.

### Phase 2: Spec Artifact

**Goal**: Synthesize research into actionable specification.

#### Spec Structure

```markdown
# Feature: <name>

## Summary
<1-2 sentence description>

## Research Findings
<Key discoveries with source citations>

## Technical Approach
<Chosen implementation strategy with rationale>

## API/Interface Design
<Public interfaces, types, function signatures>

## Dependencies
<Libraries, services, existing code to use>

## Implementation Steps
<Ordered list of atomic steps>

## Edge Cases & Error Handling
<Known edge cases and how to handle>

## Testing Strategy
<What tests to write, coverage targets>

## Open Questions
<Unresolved items needing decision>
```

**Output**: Spec artifact at `.sisyphus/specs/<feature-name>.md`

### Phase 3: Quality Gate

**Goal**: Validate spec before implementation proceeds.

#### Gate Criteria (ALL must pass)

| Criterion | Requirement |
|-----------|-------------|
| Source Coverage | ≥3 sources consulted |
| Confidence Level | ≥80% on core approach |
| Open Questions | 0 blocking questions |
| Testability | Testing strategy defined |
| Reversibility | Rollback approach identified |

#### Gate Process

1. Self-review spec against criteria
2. Score each criterion (pass/fail)
3. If ANY fail → return to Phase 1 or 2
4. If ALL pass → proceed to Phase 4
5. Log gate result in spec artifact

**Gate Failed Response**:
```
QUALITY GATE: FAILED
Failing Criteria:
- Source Coverage: 2/3 (need more sources)
- Open Questions: 1 blocking question remains

Action: Returning to Research phase for:
1. <specific research needed>
```

**Gate Passed Response**:
```
QUALITY GATE: PASSED
All criteria met. Proceeding to implementation.
Spec artifact: .sisyphus/specs/<feature-name>.md
```

### Phase 4: Build

**Goal**: Implement feature following the validated spec.

#### Implementation Protocol

1. **Setup**:
   - Create feature branch if not exists
   - Load spec artifact for reference
   - Identify first atomic step

2. **Build Loop**:
   ```
   FOR each step in spec.implementation_steps:
     1. Implement step following spec exactly
     2. Run incremental tests
     3. If deviation needed → document why
     4. Mark step complete in spec
   ```

3. **Testing**:
   - Follow testing strategy from spec
   - Ensure edge cases covered
   - Run full test suite

4. **Verification**:
   - Compare implementation to spec
   - Document any deviations with rationale
   - Handoff to verification-before-completion

**Output**: Working implementation + updated spec with completion notes.

## Handoff Protocol

### Receives From
- User request for new feature
- `brainstorming` → After ideation, needs research
- `innovation-migration-planner` → For implementing planned innovations

### Hands Off To
- `executing-plans` → If implementation is complex multi-step
- `test-driven-development` → For TDD-style implementation
- `verification-before-completion` → For final verification
- `git-master` → For atomic commits

## Must Do

- Research BEFORE implementing (no exceptions)
- Cite sources in research report
- Create spec artifact before coding
- Pass quality gate before building
- Follow spec during implementation
- Document deviations from spec

## Must NOT Do

- Skip research for "simple" features (use judgment)
- Implement without a spec artifact
- Proceed with failing quality gate
- Ignore open questions
- Deviate from spec without documenting why
- Use outdated sources without verification

## Conflict Detection

If research reveals conflicting approaches:

1. Document all approaches with pros/cons
2. Check codebase for existing convention
3. If no convention, recommend approach with strongest evidence
4. Flag for user decision if approaches are equally valid

## Output Contract

### Research Complete
```
RESEARCH COMPLETE
Sources Consulted: <count>
Confidence: <percentage>%
Key Findings:
- <finding 1>
- <finding 2>

Proceeding to Spec creation...
```

### Spec Ready
```
SPEC ARTIFACT CREATED
Location: .sisyphus/specs/<feature-name>.md
Implementation Steps: <count>
Open Questions: <count>

Proceeding to Quality Gate...
```

### Implementation Complete
```
FEATURE BUILT
Spec: .sisyphus/specs/<feature-name>.md
Files Changed: <list>
Tests Added: <count>
Deviations: <count or "none">

Handoff: verification-before-completion
```

## Quick Start

1. Receive feature request
2. Research: multi-source parallel investigation
3. Spec: synthesize into structured artifact
4. Gate: validate quality criteria
5. Build: implement following spec exactly
6. Verify: confirm implementation matches spec
