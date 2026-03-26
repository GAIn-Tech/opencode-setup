# Skill Coverage Test Plan (74 Skills)

> **Status**: COMPLETED (reconciled 2026-03-26)
> **Scope**: Ensure every skill has implied/dynamic coverage evidence
> **Test Strategy**: TDD

> **Reconciliation Note (2026-03-26)**:
> Execution evidence is captured in `.sisyphus/reports/skill-coverage-gap-report.json` (`88/88` pass) and current governance gates (`bun scripts/run-skill-routing-gates.mjs --full-report`: 6/6 pass in this working tree).

## TL;DR

> **Quick Summary**: Build a coverage-audit harness that proves each of the 74 skills has at least one test file and at least one **implied** (non-explicit) invocation path through existing routing/orchestration behavior.
>
> **User Constraints (locked)**:
> - At least one test file per skill
> - Implied tests (not explicit direct skill calls)
> - Automated script-based verification
> - TDD workflow
>
> **Primary Deliverable**: Automated report with pass/fail for all 74 skills and clear gap list.

---

## Context

This plan continues the monorepo analysis already completed:
- 74 skills in `opencode-config/skills/*/SKILL.md`
- Dynamic loading and routing via registry/profile/orchestration components
- Tests already distributed across `packages/*/test/`

The remaining task is to formalize and enforce complete skill test coverage.

---

## Objectives

1. Produce deterministic coverage criteria that match user intent.
2. Create automated tooling to evaluate all 74 skills.
3. Add/adjust tests where coverage is missing.
4. Keep tests implied/dynamic (no brittle direct-skill-call assertions as primary evidence).

## Non-Goals

- Do not redesign the skill architecture.
- Do not import new skill catalogs.
- Do not rely on manual checklist-only verification.

---

## Coverage Contract (Definition of Done)

A skill is **covered** only when all conditions below are true:

1. Skill exists in `opencode-config/skills/*/SKILL.md`.
2. At least one test file exists that maps to this skill.
3. At least one test assertion proves **implied selection/invocation**, such as:
   - recommendation/routing picks the skill for qualifying context,
   - profile composition includes it under expected triggers,
   - orchestrator/runtime selects it through metadata/triggers/synergies.
4. Coverage script marks skill as PASS.

Global DoD:
- 74/74 skills pass coverage script
- `bun test` passes
- Coverage report artifact generated

---

## Execution Strategy (TDD)

### Task 1 — Build coverage inventory (RED)

**What to do**
- Implement/extend a coverage script that reads all skill IDs from `opencode-config/skills/*/SKILL.md`.
- Script scans tests for implied usage patterns and emits missing-skill failures.

**Likely files**
- `scripts/` new checker (e.g. `scripts/check-skill-coverage.mjs`)
- optional fixtures under `integration-tests/` or relevant package test folders

**Acceptance criteria**
- Script exits non-zero when any skill lacks mapped implied coverage.
- Report includes exact missing skill IDs.

### Task 2 — Add implied coverage tests for uncovered skills (GREEN)

**What to do**
- For each uncovered skill, add at least one test file proving implied dynamic selection.
- Prefer existing test locations in packages that already own routing behavior.

**Patterns to use**
- trigger/context -> recommended skills assertions
- profile resolution assertions
- orchestrator selection assertions

**Acceptance criteria**
- Each previously missing skill is covered by at least one test file.
- Tests avoid explicit direct-call-only verification as sole evidence.

### Task 3 — Refactor and stabilize mapping rules (REFACTOR)

**What to do**
- Normalize mapping logic so future skills are auto-detected.
- Add guardrails for alias/synonym and renamed-skill handling.

**Acceptance criteria**
- Coverage script robust against false positives/false negatives.
- Deterministic output across repeated runs.

### Task 4 — CI/Governance integration

**What to do**
- Add coverage check to validation/governance path.
- Ensure failure blocks regressions when new skills are added without tests.

**Acceptance criteria**
- CI step fails on <100% skill coverage.
- Error output is actionable.

---

## Guardrails

- No `as any`, `@ts-ignore`, `@ts-expect-error`.
- No deleting tests to make suite pass.
- No explicit one-off direct invocation tests as primary coverage proof.
- No manual-only verification gates.

---

## Edge Cases to Handle

1. Skills with aliases/synonyms but different canonical IDs.
2. Skills represented only via profile chains.
3. Meta skills that appear in composition docs but are selected indirectly.
4. Skills with sparse trigger language requiring semantic/implied matching.
5. New skills added after baseline (regression prevention).

---

## Verification Commands

```bash
bun run test
# or repository equivalent that executes package tests

bun scripts/check-skill-coverage.mjs
# expected: 74/74 PASS, exit 0
```

---

## Deliverables

1. Coverage checker script + report output.
2. Added/updated implied test files for uncovered skills.
3. CI/governance hook for ongoing enforcement.
4. Final coverage summary (74/74) with evidence paths.

---

## Parallelization Notes

- Inventory/checker implementation can run in parallel with gap-test authoring prep.
- Skill gap closure can be split by category:
  - core-workflow + task-management
  - development + debugging
  - browser + research + reasoning
  - optimization + memory + meta

---

## Completion Checklist

- [ ] Coverage script implemented
- [ ] Missing skills identified
- [ ] Implied tests added for all gaps
- [ ] Coverage script returns 74/74 PASS
- [ ] Full tests pass
- [ ] CI/governance gate added
