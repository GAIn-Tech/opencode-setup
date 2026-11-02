# Skill Ecosystem Cohesion Migration Plan

**Plan ID**: skill-ecosystem-cohesion
**Created**: 2026-02-19
**Status**: COMPLETE - Core Scope Delivered
**Risk Level**: Medium
**Estimated Duration**: 3-4 sessions

---

## Executive Summary

Transform the fragmented skillbase (43+ skills across 4 locations) into a cohesive, composable ecosystem with:
1. **Skill Profiles** for multi-skill synergy
2. **New code-doctor skill** for diagnostic/healing workflows
3. **New research-builder skill** for research→implementation pipelines
4. **Consolidated skill registry** in opencode-config/skills/

---

## Current State Analysis

### Skill Inventory (43+ total)

| Location | Count | Notes |
|----------|-------|-------|
| opencode-config/skills/ | 7 | 4 builtin + 3 custom |
| ~/.config/opencode/superpowers/skills/ | 14 | Full superpowers installation |
| ~/.config/opencode/agents/ | 29 | Custom agents (different format) |
| local/oh-my-opencode/.opencode/skills/ | 1 | github-triage |

### Key Problems

1. **No composition system** - Skills are isolated; can't chain or synergize
2. **No diagnostic skill** - Manual debugging only, no self-healing
3. **No research→build pipeline** - Disconnected research and implementation
4. **Fragmented locations** - Skills scattered across 4+ directories
5. **Inconsistent structure** - No standard SKILL.md format

---

## Phase 1: Foundation (Session 1)

### 1.1 Create Skill Template Standard

**File**: `opencode-config/skills/SKILL-TEMPLATE.md`

```markdown
---
name: skill-name
version: 1.0.0
category: [planning|implementation|verification|observability]
complexity: [low|medium|high]
token_estimate: ~500
---

# Skill Name

> One-line description

## Triggers

- "trigger phrase 1"
- "trigger phrase 2"

## Input Contract

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| field1 | string | yes | Description |

## Output Contract

| Field | Type | Description |
|-------|------|-------------|
| result | object | Description |

## When to Use

- Use case 1
- Use case 2

## When NOT to Use

- Anti-pattern 1

## Synergies

| Skill | Relationship | Handoff |
|-------|--------------|---------|
| git-master | chains-after | Commit changes after this skill |
| systematic-debugging | chains-before | Debug before this skill fixes |

## Workflow

1. Step 1
2. Step 2

## Constraints

- MUST DO: requirement
- MUST NOT: anti-pattern
```

**Success Criteria**:
- [x] Template file created
- [x] All required sections documented
- [x] Example values for each field

### 1.2 Create Skill Registry

**File**: `opencode-config/skills/registry.json`

```json
{
  "version": "1.0.0",
  "skills": {
    "git-master": {
      "path": "git-master/SKILL.md",
      "category": "vcs",
      "complexity": "high",
      "synergies": ["frontend-ui-ux", "code-doctor"],
      "chains_after": ["*"],
      "chains_before": []
    }
  },
  "profiles": {
    "deep-refactoring": {
      "skills": ["systematic-debugging", "test-driven-development", "git-master"],
      "description": "Full TDD + debugging + atomic commits workflow"
    }
  },
  "composition_rules": {
    "max_skills_per_task": 5,
    "conflict_pairs": [["dev-browser", "agent-browser"]]
  }
}
```

**Success Criteria**:
- [x] Registry schema defined
- [x] All existing skills cataloged
- [x] At least 3 profiles defined
- [x] Conflict detection rules added

### 1.3 Consolidate Superpowers Skills

**Migration**: Copy from ~/.config/opencode/superpowers/skills/ to opencode-config/skills/

Skills to migrate (14):
- brainstorming
- dispatching-parallel-agents
- executing-plans
- finishing-a-development-branch
- receiving-code-review
- requesting-code-review
- subagent-driven-development
- systematic-debugging
- test-driven-development
- using-git-worktrees
- using-superpowers
- verification-before-completion
- writing-plans
- writing-skills

**Success Criteria**:
- [x] All 14 skills copied
- [x] Each updated to match template structure
- [x] Registry updated with all 14
- [x] Original superpowers retained for rollback during burn-in window

---

## Phase 2: Skill Composition System (Session 2)

### 2.1 Implement Skill Profile Loader

**Location**: Extend oh-my-opencode or create opencode-config/lib/skill-profiles.ts

```typescript
interface SkillProfile {
  name: string;
  skills: string[];
  description: string;
  auto_recommend_for?: string[]; // task types
}

function loadProfile(profileName: string): string[] {
  const registry = loadRegistry();
  const profile = registry.profiles[profileName];
  return resolveSkillsWithDependencies(profile.skills);
}

function recommendProfile(taskDescription: string): SkillProfile | null {
  // Keyword matching against auto_recommend_for
}
```

**Success Criteria**:
- [x] Profile loader function implemented
- [x] Dependency resolution (transitive loading) works
- [x] Conflict detection warns on incompatible skills
- [x] Recommendation engine suggests profiles

### 2.2 Define Core Profiles

| Profile | Skills | Use Case |
|---------|--------|----------|
| **deep-refactoring** | systematic-debugging, test-driven-development, git-master | Major code changes with TDD |
| **planning-cycle** | brainstorming, writing-plans, executing-plans | Full planning workflow |
| **review-cycle** | requesting-code-review, receiving-code-review, verification-before-completion | PR review workflow |
| **parallel-implementation** | dispatching-parallel-agents, subagent-driven-development | Multi-agent execution |
| **browser-testing** | dev-browser, frontend-ui-ux, git-master | UI testing and refinement |
| **diagnostic-healing** | code-doctor, systematic-debugging, git-master | Bug diagnosis and fixing |
| **research-to-code** | research-builder, writing-plans, executing-plans | Research → implementation |

**Success Criteria**:
- [x] All 7 profiles defined in registry
- [x] Each profile tested with sample task
- [x] Documentation explains when to use each

### 2.3 Auto-Recommendation System

**File**: `opencode-config/lib/skill-recommender.ts`

```typescript
const TASK_KEYWORDS = {
  'deep-refactoring': ['refactor', 'redesign', 'rewrite', 'overhaul'],
  'planning-cycle': ['plan', 'brainstorm', 'design', 'architect'],
  'review-cycle': ['review', 'PR', 'pull request', 'feedback'],
  'diagnostic-healing': ['bug', 'fix', 'broken', 'failing', 'error'],
  'research-to-code': ['research', 'investigate', 'explore', 'build feature']
};

function recommendProfiles(taskDescription: string): string[] {
  // Return top 2-3 matching profiles with confidence scores
}
```

**Success Criteria**:
- [x] Keyword matching implemented
- [x] Returns top 3 recommendations with scores
- [x] Optional dispatch integration intentionally deferred (non-blocking)

---

## Phase 3: New Skills (Session 3)

### 3.1 Create code-doctor Skill

**File**: `opencode-config/skills/code-doctor/SKILL.md`

**Core Capabilities**:
1. **Fault Localization** - Use LSP diagnostics, git-bisect, stack traces
2. **Root Cause Analysis** - Correlate errors with recent changes
3. **Self-Healing Loop** - Attempt fix → test → analyze → retry (max 3)
4. **Escalation** - After 3 failures, handoff to architect/oracle
5. **Triage** - Categorize: Flaky, Consistent, New, Regression

**Workflow**:
```
1. DIAGNOSE: Collect symptoms (error messages, failing tests, logs)
2. LOCALIZE: Find probable fault location (LSP + git-bisect)
3. ANALYZE: Determine root cause (diff analysis, stack correlation)
4. HEAL: Attempt minimal fix
5. VERIFY: Run specific failing tests
6. ITERATE: If failed, analyze error, retry (max 3)
7. ESCALATE: If still failing, generate detailed report for human/oracle
```

**Synergies**:
- Chains with: systematic-debugging (provides diagnostic framework)
- Chains after: test-driven-development (when tests fail)
- Handoff to: git-master (commit the fix)

**Success Criteria**:
- [x] SKILL.md created with full contract
- [x] Self-healing loop logic documented
- [x] Escalation criteria defined
- [x] Integration with LSP diagnostics specified
- [x] Added to registry with synergies

### 3.2 Create research-builder Skill

**File**: `opencode-config/skills/research-builder/SKILL.md`

**Core Capabilities**:
1. **Multi-Source Research** - Docs, GitHub, web, codebase
2. **Spec Artifact** - Research produces structured spec document
3. **Quality Gate** - Spec must be "Ready" before implementation
4. **Graded Sources** - Priority: Official docs > GitHub examples > Web
5. **Implementation Bridge** - Spec feeds directly to executor

**Workflow**:
```
1. RESEARCH: Fan-out to multiple sources (librarian + web + codebase)
2. SYNTHESIZE: Merge findings, resolve conflicts using source priority
3. SPEC: Produce structured spec artifact (.sisyphus/specs/<name>.md)
4. GRADE: Self-assess spec completeness (Ready | Needs More | Blocked)
5. GATE: Cannot proceed until graded "Ready"
6. BUILD: Execute implementation based on spec
7. VERIFY: Confirm implementation matches spec
```

**Spec Artifact Template**:
```markdown
# Feature Spec: <name>

## Research Summary
- Source 1 (Official Docs): Finding
- Source 2 (GitHub): Finding

## Implementation Plan
1. Step with file:line reference
2. Step with file:line reference

## Verification Criteria
- Criterion 1
- Criterion 2

## Grade: [Ready | Needs More | Blocked]
```

**Success Criteria**:
- [x] SKILL.md created with full contract
- [x] Spec artifact template defined
- [x] Quality gate logic documented
- [x] Source priority matrix specified
- [x] Added to registry with synergies

---

## Phase 4: Integration & Verification (Session 4)

### 4.1 Update setup.sh for Skill Migration

Ensure setup.sh copies consolidated skills to ~/.config/opencode/skills/

**Changes**:
```bash
# Copy consolidated skills
cp -r opencode-config/skills/* ~/.config/opencode/skills/

# Copy registry
cp opencode-config/skills/registry.json ~/.config/opencode/skills/
```

**Success Criteria**:
- [x] setup.sh updated
- [x] Migration tested on clean environment
- [x] Verification script confirms all skills present

### 4.2 Update ADDITION-PROCEDURE.md

Add skill-specific guidance:
- How to add new skills following template
- How to register in registry.json
- How to define synergies
- How to add to profiles

**Success Criteria**:
- [x] Procedure updated
- [x] Examples for each scenario
- [x] Verification integration updated

### 4.3 End-to-End Testing

Test each profile with real task:

| Profile | Test Task | Expected Outcome |
|---------|-----------|------------------|
| deep-refactoring | Refactor a module | TDD + debugging + atomic commits |
| diagnostic-healing | Fix a failing test | Diagnose + heal + verify + commit |
| research-to-code | Build unfamiliar feature | Research + spec + implement + verify |

**Success Criteria**:
- [x] Each profile tested
- [x] Synergy chains work correctly
- [x] No conflicts between skills
- [x] Token usage reasonable

### 4.4 Documentation

Create comprehensive docs:
- `docs/skills/OVERVIEW.md` - Skill ecosystem overview
- `docs/skills/PROFILES.md` - Available profiles and usage
- `docs/skills/CREATING-SKILLS.md` - How to create new skills
- `docs/skills/COMPOSITION.md` - How skill composition works

**Success Criteria**:
- [x] All 4 docs created
- [x] Examples for common workflows
- [x] Troubleshooting section

---

## Rollback Plan

If issues arise:
1. Skills are additive - no existing functionality removed
2. Original superpowers remain in ~/.config/opencode/superpowers/ until confirmed
3. Registry can be disabled (skills still work individually)
4. Each phase is independent - can stop after any phase

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Skill count (consolidated) | 25+ | Count in registry.json |
| Profiles defined | 7+ | Count in registry.json |
| Skill template compliance | 100% | Lint check against template |
| Composition conflicts | 0 | Conflict detection passes |
| E2E profile tests | 100% pass | Test suite results |

---

## Dependencies

- oh-my-opencode source (for composition system)
- Existing superpowers skills (for migration)
- LSP tools (for code-doctor)
- librarian agent (for research-builder)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Skill conflicts during composition | Medium | Medium | Conflict detection rules |
| Token bloat from multi-skill loading | Medium | High | Progressive disclosure (metadata first) |
| Breaking existing workflows | Low | High | Additive changes only |
| Complexity overwhelming users | Medium | Medium | Good defaults, clear docs |

---

## Execution Handoff

Once confirmed, invoke:
```
/start-work .sisyphus/plans/skill-ecosystem-cohesion.md
```

Or if using workflow aliases:
```
/workflows:work .sisyphus/plans/skill-ecosystem-cohesion.md
```

---

**EXECUTION NOTE (2026-02-19)**

Execution complete for core migration scope.
Notes:
1. Original superpowers source remains intentionally for rollback safety.
2. Optional dispatch integration remains deferred by design.
