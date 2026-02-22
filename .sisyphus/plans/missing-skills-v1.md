# Missing Skills v1 Migration Plan

Date: 2026-02-19
Scope: Skill-suite control plane and high-leverage missing operational/depth skills
Status: COMPLETE - All phases executed

## Evidence Snapshot

- Profiles and composition metadata exist, but are mostly config-level declarations in `opencode-config/skills/registry.json:219`.
- Registry declares a schema reference (`$schema`) without a corresponding schema file present in `opencode-config/skills/registry.json:2`.
- Architecture notes confirm stateless skill loading and no built-in ordering/optimizer in current flow (`AGENT-SKILL-ARCHITECTURE.md:18`, `AGENT-SKILL-ARCHITECTURE.md:106`).
- Conflict detection and synergy optimization are documented as opportunities, not enforced runtime behavior (`AGENT-SKILL-ARCHITECTURE.md:94`).
- Consolidation script claims registry updates but currently only copies/validates skill directories (`scripts/consolidate-skills.mjs:9`, `scripts/consolidate-skills.mjs:67`).

## 1) Hotspot Ranking (IHS)

Formula:
`IHS = (VarianceNuance^1.20) * (PotentialValue^1.50) * (InverseAttention^1.35) * Confidence`

| Rank | Hotspot | VarianceNuance | PotentialValue | InverseAttention | Confidence | IHS |
|---|---|---:|---:|---:|---:|---:|
| 1 | Skill Orchestrator Runtime | 0.90 | 0.95 | 0.90 | 0.90 | 0.64 |
| 2 | Skill Governance Auditor | 0.78 | 0.88 | 0.92 | 0.90 | 0.49 |
| 3 | Incident Commander Skill | 0.82 | 0.87 | 0.85 | 0.82 | 0.42 |
| 4 | Budget-Aware Router Skill | 0.84 | 0.83 | 0.88 | 0.80 | 0.41 |
| 5 | Evaluation Harness Builder | 0.76 | 0.86 | 0.86 | 0.84 | 0.39 |

Scoring assumptions:
- PotentialValue weighted highest (1.50) because user goal is adaptability + efficiency + depth.
- InverseAttention elevated where capability exists in agents/commands but not in standardized skill composition.
- Confidence reduced when behavior is inferred from docs/config rather than runtime-enforced paths.

## 2) Chosen Innovation Direction Per Hotspot

### Hotspot 1: Skill Orchestrator Runtime
- Chosen direction: Adjacent leap
- Decision: Build a profile runtime that resolves dependencies/conflicts/order/fallback before dispatch.
- Why: Highest leverage with manageable blast radius; converts metadata into actual behavior.

### Hotspot 2: Skill Governance Auditor
- Chosen direction: Adjacent leap
- Decision: Add schema + registry/skill cross-validation and drift checks into governance pipeline.
- Why: Prevents ecosystem entropy and portability regressions.

### Hotspot 3: Incident Commander Skill
- Chosen direction: Adjacent leap
- Decision: Add operational incident workflow skill (severity triage, containment, comms, recovery, postmortem handoff).
- Why: Current debugging depth does not fully cover production incident command patterns.

### Hotspot 4: Budget-Aware Router Skill
- Chosen direction: Conservative extension
- Decision: Add routing policies (light/medium/deep chains) constrained by token/time/cost budgets.
- Why: Immediate efficiency gain and reduced context-window failure probability.

### Hotspot 5: Evaluation Harness Builder
- Chosen direction: Adjacent leap
- Decision: Standardize skill/profile scenario tests with pass/fail gates and regression snapshots.
- Why: Needed to maintain quality as composition complexity rises.

## 3) Migration Strategy (Atomic, Testable)

### Phase A: Control Plane Foundation (P0)

#### A1. Add registry schema and validator
- Files:
  - `opencode-config/skills/registry.schema.json` (new)
  - `scripts/validate-skill-registry.mjs` (new)
  - `scripts/verify-integration.mjs` (update to call validator)
- Checks:
  - Validate shape/types for skills/profiles/categories
  - Validate references: dependency/synergy/conflict/profile members exist
  - Fail on orphaned skills and unknown references

#### A2. Make consolidation deterministic and registry-aware
- Files:
  - `scripts/consolidate-skills.mjs` (update)
  - `opencode-config/skills/registry.json` (managed update path)
- Checks:
  - Sync copied skills against registry entries
  - Emit actionable diff report (added/removed/mismatched)
  - Non-zero exit on drift unless explicitly acknowledged

#### A3. Create orchestrator runtime skill
- Files:
  - `opencode-config/skills/skill-orchestrator-runtime/SKILL.md` (new)
  - `opencode-config/skills/registry.json` (add entry)
- Behavior contract:
  - Input: task intent + constraints (risk, budget, urgency)
  - Output: ordered skill chain + conflict decisions + fallback ladder
  - Mandatory handoff envelope: assumptions, evidence, unresolved risks

Rollback point A:
- Disable profile auto-resolution path and revert to explicit `load_skills` only.

### Phase B: Missing Depth Skills (P1)

#### B1. Add incident-commander skill
- Files:
  - `opencode-config/skills/incident-commander/SKILL.md` (new)
  - `opencode-config/skills/registry.json` (add entry + synergies)
- Workflow stages:
  - Detect/classify severity
  - Contain blast radius
  - Coordinate mitigation and verification
  - Drive postmortem artifact handoff

#### B2. Add budget-aware-router skill
- Files:
  - `opencode-config/skills/budget-aware-router/SKILL.md` (new)
  - `opencode-config/skills/registry.json` (add profile routing synergies)
- Workflow stages:
  - Estimate budget band (light/medium/deep)
  - Choose profile chain with cost guardrails
  - Trigger fallback chain on budget breach

Rollback point B:
- Keep routing recommendations advisory-only (no hard auto-apply) until metrics stabilize.

### Phase C: Quality and Regression Safety (P1)

#### C1. Add evaluation-harness-builder skill
- Files:
  - `opencode-config/skills/evaluation-harness-builder/SKILL.md` (new)
  - `opencode-config/skills/registry.json` (add entry)
  - `scripts/verify-skill-composition.mjs` (new)
- Checks:
  - Scenario tests for each core profile
  - Expected chain output snapshots
  - Regression diff on skill routing decisions

#### C2. Integrate governance docs and procedure updates
- Files:
  - `ADDITION-PROCEDURE.md` (update with schema + composition checks)
  - `docs-governance.json` (if policy mapping changes required)
- Checks:
  - Ensure all new skills covered in procedure and governance surfaces

Rollback point C:
- Mark failing profile tests as non-blocking warnings for one release cycle, then promote to hard gate.

## 4) Sequencing and Ownership

Recommended order:
1. A1 -> A2 -> A3
2. B1 -> B2
3. C1 -> C2

Ownership model:
- Control plane (A*): skill governance owner
- Ops depth (B*): reliability/incident workflow owner
- Validation (C*): quality governance owner

Dependencies:
- B* depends on A1/A2 for stable registry contracts
- C1 depends on A3/B* to produce evaluable composition behavior

## 5) Verification Gates

Gate 1 (Foundation):
- `registry.schema.json` exists and validates `registry.json`
- Consolidation + validation run clean in CI/local

Gate 2 (Composition):
- Orchestrator runtime emits deterministic ordered chains
- Conflict handling documented and test-covered

Gate 3 (Depth):
- Incident and budget skills produce structured handoff outputs
- Fallback ladder behavior verified on simulated constraint failures

Gate 4 (Regression):
- Profile scenario suite passes
- No unreviewed drift between skill filesystem and registry metadata

## 6) Success Metrics

- Adaptability:
  - >=80% of complex requests map to a profile or generated chain without manual rework.
- Efficiency:
  - >=25% reduction in retries caused by skill ordering/conflict mistakes.
  - >=20% reduction in high-cost deep-chain invocations via budget routing.
- Depth:
  - Incident workflows complete with severity/containment/recovery/postmortem artifacts in one pass.
  - Profile regression suite catches routing drift before merge.

## 7) Risks and Controls

- Risk: Over-automation creates brittle routing.
  - Control: advisory mode first, promote gradually.
- Risk: Registry drift due to manual edits.
  - Control: schema + sync validator in governance gate.
- Risk: New skills duplicate command/agent capability without alignment.
  - Control: require skill-to-agent/command mapping notes in each new SKILL.md.

## 8) Definition of Done

- Top 5 missing capabilities exist as governed skills with registry entries.
- Profile orchestration behavior is deterministic, validated, and documented.
- Governance prevents contract drift across skill files, registry metadata, and CI checks.
