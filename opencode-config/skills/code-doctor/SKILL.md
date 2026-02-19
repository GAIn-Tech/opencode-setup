---
name: code-doctor
description: Agentic diagnostic and self-healing skill for codebases. Performs fault localization, root cause analysis, automated repair attempts, and intelligent escalation.
version: 1.0.0
category: diagnostic
tags: [debugging, healing, rca, automated-repair, fault-localization]
dependencies: [systematic-debugging, git-master]
synergies: [test-driven-development, verification-before-completion]
conflicts: []
outputs: [diagnosis-report, fix-commit, escalation-request]
inputs: [error-message, stack-trace, failing-test, symptoms]
---

## Overview

code-doctor is an agentic skill for diagnosing and healing code issues autonomously. Unlike manual debugging, code-doctor follows a structured 5-phase healing loop with automatic escalation when self-repair fails.

## When to Use

- Build failures with unclear root cause
- Test failures that need automated diagnosis
- Runtime errors requiring fault localization
- "It worked yesterday" scenarios needing git bisect
- Any error where you want autonomous fix attempts before manual intervention

## When NOT to Use

- Simple typos or obvious syntax errors (just fix directly)
- Architecture redesign (use planning skills instead)
- Performance optimization (use profiling tools)
- Security vulnerabilities (use security-focused review)

## Inputs Required

| Input | Required | Description |
|-------|----------|-------------|
| error_message | Yes | The error text, build output, or failure message |
| stack_trace | No | Full stack trace if available |
| failing_test | No | Specific test file/name that fails |
| symptoms | No | Behavioral description ("API returns 500 on login") |
| recent_changes | No | Files changed recently (git diff context) |

## Workflow

### Phase 1: Triage

**Goal**: Classify the issue and determine investigation path.

1. Parse error message for error type (compile, runtime, test, lint)
2. Extract file:line references from stack trace
3. Check recent git history for related changes
4. Categorize: `flaky`, `consistent`, `new`, `regression`
5. Assign severity: `critical`, `high`, `medium`, `low`

**Output**: Triage report with category, severity, and investigation plan.

### Phase 2: Root Cause Analysis (RCA)

**Goal**: Identify the exact cause of the failure.

1. **Fault Localization**:
   - Use `lsp_diagnostics` on referenced files
   - Run `git bisect` if regression suspected
   - Correlate error timing with commits

2. **Evidence Collection**:
   - Gather all error contexts (logs, stack traces, state)
   - Identify affected code paths
   - Map dependencies that could contribute

3. **Hypothesis Formation**:
   - Formulate 1-3 hypotheses for root cause
   - Rank by likelihood based on evidence
   - Identify verification method for each

**Output**: RCA report with ranked hypotheses and evidence links.

### Phase 3: Healing Attempt

**Goal**: Attempt automated repair with verification.

```
HEALING LOOP (max 3 attempts):
  1. Generate minimal fix for top hypothesis
  2. Apply fix to codebase
  3. Run verification (test, build, lint)
  4. If PASS → commit fix, goto Phase 4
  5. If FAIL → analyze new error
     - If same error → hypothesis wrong, try next
     - If different error → fix caused regression, revert
  6. After 3 failures → goto Phase 5 (Escalation)
```

**Critical Rules**:
- Each fix attempt must be minimal and targeted
- Always verify before committing
- Revert immediately if fix causes new issues
- Log each attempt for escalation context

### Phase 4: Verification & Commit

**Goal**: Ensure fix is complete and properly committed.

1. Run full test suite (not just failing test)
2. Check for regressions in related areas
3. Run linter and type checker
4. Create atomic commit with clear message:
   ```
   fix(<scope>): <description>
   
   Root cause: <brief RCA summary>
   Verification: <what was tested>
   ```
5. Handoff to `verification-before-completion` skill

### Phase 5: Escalation

**Goal**: Provide maximum context for human intervention.

Triggered when:
- 3 healing attempts failed
- RCA confidence below 50%
- Issue requires architecture changes
- Security implications detected

Escalation report includes:
- Original error and full context
- All hypotheses considered (ranked)
- All fix attempts and their results
- Recommended next steps for human
- Suggested expert to consult (if known)

## Handoff Protocol

### Receives From
- `systematic-debugging` → When manual debugging needs automation
- `test-driven-development` → When tests fail unexpectedly
- Any skill → When errors occur during execution

### Hands Off To
- `git-master` → For atomic commit creation
- `verification-before-completion` → For final verification
- Human → On escalation with full context

## Must Do

- Always verify fixes before committing
- Keep fixes minimal and targeted
- Log all attempts for escalation context
- Revert immediately if fix causes regression
- Include RCA summary in commit messages
- Respect the 3-attempt limit before escalating

## Must NOT Do

- Make speculative changes without verification
- Suppress errors with empty catch blocks
- Delete failing tests to "fix" the issue
- Continue attempting fixes after 3 failures
- Make architectural changes (escalate instead)
- Commit without running verification

## Output Contract

### On Success (Phase 4)
```
DIAGNOSIS COMPLETE
Status: HEALED
Root Cause: <summary>
Fix Applied: <commit hash>
Verification: All tests passing, no regressions

Handoff: verification-before-completion
```

### On Escalation (Phase 5)
```
DIAGNOSIS COMPLETE  
Status: ESCALATION REQUIRED
Root Cause: <best hypothesis with confidence %>
Attempts: 3/3 failed
Blocking Issue: <why automation failed>

Recommended Actions:
1. <specific suggestion>
2. <specific suggestion>

Full context preserved in: .sisyphus/diagnostics/<issue-id>.md
```

## Quick Start

1. Receive error context (message, trace, symptoms)
2. Triage: classify and prioritize
3. RCA: identify root cause with evidence
4. Heal: attempt fix with verification loop
5. Commit or Escalate based on outcome
