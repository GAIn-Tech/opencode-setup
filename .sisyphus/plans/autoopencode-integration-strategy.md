# Autoopencode Integration Strategy (Adapter-First)

## TL;DR

> **Quick Summary**: Evaluate `GAIn-Tech/autoopencode` on `develop` using a strict adapter-first pilot, with hard gates for security/supply chain, no second control plane, and measurable ROI.
>
> **Deliverables**:
> - Evidence-backed due-diligence dossier for `autoopencode`
> - Architecture fit/gap map against current OpenCode plugin/integration contracts
> - Pilot adapter specification with kill-switch/rollback design
> - Final go/no-go decision memo with explicit decision rule
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 7

---

## Context

### Original Request
Evaluate this repo and determine the best approach for integrating it, if at all: `https://github.com/GAIn-Tech/autoopencode`.

### Interview Summary
**Key Decisions**:
- Baseline branch: **most recent** (resolved to default remote `develop`)
- Preferred strategy: **Adapter pilot first**
- Hard non-negotiable gates:
  - Security + supply-chain
  - No second control plane
  - Measurable ROI threshold (>=15% uplift)

**Observed Signals**:
- Unauthenticated web/API checks returned 404 for target repo.
- Authenticated git access succeeded (`git ls-remote`) and exposed branch/tag topology.
- Internal monorepo has strict plugin/config/governance contracts that any integration must not bypass.

### Metis Review (Applied)
Guardrails and gaps incorporated:
- Added explicit no-second-control-plane guardrail
- Added kill-switch and rollback requirements
- Added measurable ROI acceptance threshold
- Added edge-case checks: Bun ENOENT/spawn assumptions, ESM/CJS mismatch, config drift
- Added explicit no-go criteria if any hard gate fails

---

## Work Objectives

### Core Objective
Produce a decision-grade integration strategy for `autoopencode` that prioritizes low coupling and reversibility, and only permits deeper integration if pilot evidence proves value.

### Concrete Deliverables
- `.sisyphus/artifacts/autoopencode-due-diligence.md`
- `.sisyphus/artifacts/autoopencode-fit-gap-map.md`
- `.sisyphus/artifacts/autoopencode-adapter-pilot-spec.md`
- `.sisyphus/artifacts/autoopencode-go-no-go.md`

### Definition of Done
- [ ] All hard gates evaluated with evidence
- [ ] Adapter pilot spec includes strict boundary, feature flag, rollback path
- [ ] Go/no-go memo contains a binary recommendation and decision rule

### Must Have
- Use `develop` as baseline unless overridden by newer authoritative branch signal
- Keep existing governance and plugin authority intact
- Quantified ROI threshold before proceeding beyond pilot

### Must NOT Have (Guardrails)
- No direct deep integration into core orchestration/state layers in pilot phase
- No schema/control-plane takeover of existing config/governance system
- No policy waivers for security/supply-chain gate failures

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> Every acceptance criterion must be executable by agent-run commands/tools.

### Test Decision
- **Infrastructure exists**: YES (repo has extensive validation/test command ecosystem)
- **Automated tests**: None required for this planning/due-diligence track
- **Primary verification method**: Agent-executed QA scenarios + command evidence capture

### Agent-Executed QA Scenarios (Applies to all tasks)

Scenario: Remote accessibility and branch baseline confirmation
  Tool: Bash (git)
  Preconditions: Network access + repo credentials available
  Steps:
    1. `git ls-remote --symref "https://github.com/GAIn-Tech/autoopencode.git" HEAD`
    2. Assert output contains `ref: refs/heads/develop`
    3. Capture stdout to `.sisyphus/evidence/task-1-remote-head.txt`
  Expected Result: Remote default branch and HEAD are machine-verifiable
  Failure Indicators: command auth failure, empty refs, non-zero exit
  Evidence: `.sisyphus/evidence/task-1-remote-head.txt`

Scenario: Governance boundary integrity after planning artifacts created
  Tool: Bash
  Preconditions: Artifacts/specs created
  Steps:
    1. Run `bun run governance:check`
    2. Assert process exit code is 0
    3. Capture output to `.sisyphus/evidence/task-6-governance-check.txt`
  Expected Result: Existing governance gates remain uncompromised
  Failure Indicators: any failed governance gate
  Evidence: `.sisyphus/evidence/task-6-governance-check.txt`

Scenario: No-go enforcement when hard gate fails (negative case)
  Tool: Bash
  Preconditions: A simulated failed gate row exists in go/no-go matrix
  Steps:
    1. Parse `.sisyphus/artifacts/autoopencode-go-no-go.md`
    2. Assert decision rule states: any hard gate fail => NO-GO
    3. Capture assertion output to `.sisyphus/evidence/task-7-no-go-rule.txt`
  Expected Result: Decision rule is explicit and deterministic
  Failure Indicators: ambiguous or discretionary language
  Evidence: `.sisyphus/evidence/task-7-no-go-rule.txt`

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Start Immediately):
- Task 1: Establish authoritative remote baseline (`develop`, refs, tags)
- Task 2: Build internal integration surface map from local contracts

Wave 2 (After Wave 1):
- Task 3: Produce due-diligence packet (security/supply-chain/license/runtime)
- Task 4: Produce fit-gap matrix against internal plugin/integration contracts
- Task 6: Define ROI model and thresholds

Wave 3 (After Wave 2):
- Task 5: Draft adapter pilot spec with strict boundaries
- Task 7: Produce go/no-go decision memo using hard decision rule

Critical Path: 1 → 3 → 5 → 7

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|----------------------|
| 1 | None | 3, 5, 7 | 2 |
| 2 | None | 4, 5 | 1 |
| 3 | 1 | 5, 7 | 4, 6 |
| 4 | 2 | 5, 7 | 3, 6 |
| 5 | 1,3,4 | 7 | None |
| 6 | 1 | 7 | 3, 4 |
| 7 | 3,4,5,6 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|--------------------|
| 1 | 1,2 | `task(category="unspecified-high", load_skills=["codebase-auditor"])` + `task(category="deep", load_skills=["architecture-design"])` |
| 2 | 3,4,6 | `task(category="unspecified-high", load_skills=["security-auditing"])`, `task(category="deep", load_skills=["architecture-design"])`, `task(category="writing", load_skills=["product-management"])` |
| 3 | 5,7 | `task(category="deep", load_skills=["architecture-design"])` + `task(category="writing", load_skills=["stakeholder-communication"])` |

---

## TODOs

- [ ] 1. Verify remote baseline and recency for `autoopencode`

  **What to do**:
  - Confirm default branch and HEAD commit via authenticated git commands
  - Capture branch/tag topology for maintenance-signal context

  **Must NOT do**:
  - Do not assume web/API visibility implies lack of access

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: bounded command-only evidence gathering
  - **Skills**: `git-master`
    - `git-master`: required for reliable git-based provenance checks

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: 3,5,7
  - **Blocked By**: None

  **References**:
  - `scripts/bootstrap-manifest.json` - local governance expectations and plugin policy context
  - `opencode-config/opencode.json` - canonical plugin configuration authority

  **Acceptance Criteria**:
  - [ ] `git ls-remote --symref <repo> HEAD` output captured with default branch identified
  - [ ] Branch/tag summary artifact created with evidence file references

- [ ] 2. Build internal integration-surface contract map

  **What to do**:
  - Map where plugin discovery/registration/validation occurs
  - Document runtime contract boundaries that adapter must honor

  **Must NOT do**:
  - Do not propose contract bypasses

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `codebase-auditor`, `architecture-design`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: 4,5
  - **Blocked By**: None

  **References**:
  - `opencode-config/opencode.json` - plugin + MCP registration source of truth
  - `scripts/verify-plugin-readiness.mjs` - readiness gate behavior
  - `scripts/verify-bootstrap-manifest.mjs` - manifest/config parity gate
  - `packages/opencode-integration-layer/src/index.js` - integration runtime contract entrypoints
  - `packages/opencode-plugin-preload-skills/src/index.js` - tool-selection plugin contract

  **Acceptance Criteria**:
  - [ ] Fit-surface map identifies registration, validation, and runtime contract seams
  - [ ] High-risk boundaries are labeled with explicit “do-not-cross” notes

- [ ] 3. Produce hard-gate due-diligence packet (security/supply-chain/runtime/license)

  **What to do**:
  - Compile evidence for each hard gate
  - Mark unknowns as blockers (not assumptions)

  **Must NOT do**:
  - No “pass by default” if evidence missing

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `security-auditing`, `vulnerability-scanning`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with 4,6)
  - **Blocks**: 5,7
  - **Blocked By**: 1

  **References**:
  - `.sisyphus/drafts/autoopencode-integration-eval.md` - prior evidence and access caveats
  - `scripts/supply-chain-guard.mjs` - local supply-chain policy patterns
  - `docs/adr/bootstrap-governance-policy.md` - governance policy expectations

  **Acceptance Criteria**:
  - [ ] Each gate marked Pass/Fail/Unknown with evidence link
  - [ ] Any Fail or Unknown gate automatically flagged as blocking

- [ ] 4. Produce architecture fit-gap matrix against local contracts

  **What to do**:
  - Compare target capabilities vs local integration surfaces
  - Identify overlap, unique value, and incompatibilities

  **Must NOT do**:
  - No premature solutioning beyond adapter boundary

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `architecture-design`, `system-design`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 5,7
  - **Blocked By**: 2

  **References**:
  - `packages/opencode-integration-layer/src/bootstrap.js` - internal wiring and injection points
  - `integration-tests/critical-plugin-contracts.test.js` - contract expectations
  - `scripts/validate-plugin-compatibility.mjs` - compatibility enforcement logic

  **Acceptance Criteria**:
  - [ ] Matrix includes at least: adapter-compatible, extract-only, incompatible categories
  - [ ] Incompatibilities include explicit rationale and impact level

- [ ] 5. Draft adapter pilot specification (strictly reversible)

  **What to do**:
  - Define adapter boundary, interfaces, allowed data flow, feature flag, rollback
  - State explicit non-goals (no core control-plane merge)

  **Must NOT do**:
  - No irreversible coupling decisions

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `architecture-design`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: 7
  - **Blocked By**: 1,3,4

  **References**:
  - `scripts/bootstrap-manifest.json` - governance alignment constraints
  - `scripts/verify-plugin-readiness.mjs` - readiness checks that must remain green

  **Acceptance Criteria**:
  - [ ] Spec includes kill-switch, rollback, and failure handling
  - [ ] Spec clearly forbids second control-plane behavior

- [ ] 6. Define ROI threshold and measurement method

  **What to do**:
  - Choose KPI(s) and baseline capture method
  - Define minimum uplift required to continue

  **Must NOT do**:
  - No subjective “seems better” criteria

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: `product-management`, `stakeholder-communication`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 7
  - **Blocked By**: 1

  **References**:
  - `packages/opencode-model-manager/src/monitoring/metrics-collector.js` - available metrics patterns
  - `packages/opencode-model-manager/src/monitoring/alert-manager.js` - thresholding patterns

  **Acceptance Criteria**:
  - [ ] KPI formula, baseline method, and threshold are explicit
  - [ ] Decision table maps KPI outcomes to continue/stop
  - [ ] Continue condition explicitly set to: observed uplift >= 15%; otherwise NO-GO

- [ ] 7. Publish final go/no-go decision memo

  **What to do**:
  - Consolidate evidence from tasks 3/4/5/6
  - Apply deterministic rule: any hard-gate fail => NO-GO

  **Must NOT do**:
  - No ambiguous recommendation language

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: `stakeholder-communication`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: 3,4,5,6

  **References**:
  - `.sisyphus/artifacts/autoopencode-due-diligence.md` - gate results
  - `.sisyphus/artifacts/autoopencode-fit-gap-map.md` - technical fit
  - `.sisyphus/artifacts/autoopencode-adapter-pilot-spec.md` - pilot boundary

  **Acceptance Criteria**:
  - [ ] Memo contains one of: Proceed with adapter pilot / No-Go
  - [ ] Rationale maps directly to gate outcomes and ROI threshold
  - [ ] Includes explicit revisit conditions if No-Go

---

## Commit Strategy

| After Task | Commit | Notes |
|------------|--------|-------|
| 1-2 | NO | Research artifacts only; defer to implementation session policy |
| 3-7 | NO | Decision/planning outputs under `.sisyphus/artifacts` |

---

## Success Criteria

### Verification Commands
```bash
git ls-remote --symref "https://github.com/GAIn-Tech/autoopencode.git" HEAD
bun run governance:check
```

### Final Checklist
- [ ] Hard gates evaluated with evidence
- [ ] Adapter boundary is explicit, reversible, and feature-flagged
- [ ] No second control plane introduced in pilot design
- [ ] ROI threshold is quantified as >=15% uplift and decision-usable
- [ ] Final decision memo is binary and reproducible
