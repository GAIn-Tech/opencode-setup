# Ecosystem Skill Package Audit — Decisions

## 2026-03-24 — Wave 1 Task 2: Scenario Taxonomy + Capability Tier Model

### Decision 1: Canonical default runtime spine is planning -> audit -> debug

- We will treat **planning**, **audit**, and **debug** as the only core default-flow scenarios.
- Default-layer assets must directly improve routine completion of this loop, not just be generally useful.
- This intentionally narrows the default surface relative to current breadth-biased assumptions.

### Decision 2: Secondary scenarios are overlays, not parallel default tracks

- Defined secondary scenarios:
  - browser QA,
  - architecture deep-dive,
  - incident response,
  - specialist framework/domain work.
- These scenarios inherit from and extend core flows, and are **manual-first** by default.
- Secondary capabilities can only move toward default with explicit evidence of recurring core-loop necessity.

### Decision 3: Adopt a 4-tier capability model for activation posture

- **default**: always-on baseline for routine planning/audit/debug.
- **manual**: opt-in specialist capabilities for secondary workflows.
- **dormant**: retained but inactive fallback/migration-safe capabilities.
- **candidate-prune**: low-value/redundant capabilities staged for removal.

Each tier now has explicit:
- definition,
- default-activation rule,
- entry criteria,
- exit criteria,
- demotion condition,
- reactivation condition.

### Decision 4: Transitions should be staged and evidence-based

- Preferred demotion path: `default -> manual -> dormant -> candidate-prune`.
- Preferred reactivation path: `candidate-prune -> dormant -> manual -> default`.
- Direct jumps to/from default are discouraged unless strongly justified by current scenario evidence.

### Decision 5: Task 3 classification must use explicit evidence fields

- The taxonomy model includes minimum fields required per asset in Task 3:
  - primary scenario,
  - secondary scenario (if any),
  - core-loop necessity,
  - activation-noise risk,
  - redundancy assessment,
  - recommended tier,
  - promotion/demotion trigger.
- This is intended to prevent category-label-only classification and reduce false activation drift.

### Evidence

- `.sisyphus/evidence/scenario-taxonomy-model.json`

### Note on source availability

- Required reference `.sisyphus/drafts/ecosystem-audit-cohesion.md` was not present at execution time.
- Model was anchored to available baseline and policy inputs plus explicit task context.

## 2026-03-24 — Wave 2 Task 5: Migration Semantics for Demotion, Dormancy, and Candidate-Prune

### Decision 1: "manual" is discoverable but not baseline default-ranked

- **Skills** in manual tier stay registered/discoverable, but baseline posture is disabled (`skills-manage disable`) so they are not first-pass default runtime selections.
- Manual activation is explicit only: user-requested, task-context requested, or profile/session overlay activation.
- **Packages** in manual tier are explicit invocation surfaces (CLI/MCP) and not part of default runtime spine.

### Decision 2: "dormant" is retained/inactive with policy-gated reactivation

- **Skills** in dormant tier remain disabled and require reactivation evidence before enable.
- **Package surfaces** in dormant tier must carry explicit dormant metadata (`reason`, `reactivation_criteria`, `owner`) in `opencode-config/mcp-dormant-policy.json`.
- Dormant is intentionally reversible and used as a safety buffer before candidate-prune.

### Decision 3: "candidate-prune" is a recommendation queue, not deletion

- Candidate-prune does **not** imply immediate removal.
- Recommendation requires explicit low-value evidence (low core-loop necessity/frequency + overlap/redundancy + substitutability + sustained review-cycle inactivity).
- Removal (if later approved) is a separate workflow from tier recommendation.

### Decision 4: Tier transitions must reuse existing skills control plane

- Tier activation semantics for skills reuse existing `scripts/skills-manage.mjs` operations:
  - `enable`, `disable`, `list`, `audit`, `sync --dry-run`.
- No new migration control-plane is introduced.
- `remove` is explicitly out-of-scope for candidate-prune recommendation transitions.

### Decision 5: Every transition requires rollback metadata and instructions

- Mandatory rollback metadata includes: `from_tier`, `to_tier`, evidence refs, pre/post snapshots, command list, rollback command list, validation commands, and review deadline.
- Every allowed transition in the policy now has explicit rollback instructions (including exception-only direct jumps).

### Decision 6: Promotion and demotion evidence requirements are now explicit

- Demotions require evidence of diminished necessity, rising activation noise, or sustained inactivity.
- Promotions require fresh scenario evidence plus non-redundancy and validation checks.
- Strongest evidence burden is reserved for transitions affecting default posture.

### Evidence

- `.sisyphus/evidence/migration-semantics-policy.json`
- `scripts/skills-manage.mjs`
- `opencode-config/mcp-dormant-policy.json`
- `.sisyphus/evidence/scenario-taxonomy-model.json`
- `.sisyphus/evidence/skill-classification-recommendations.json`
- `.sisyphus/evidence/package-surface-classification.json`

## 2026-03-25 — Wave 2 Task 7: Control-Plane + Lifecycle Governance for Ongoing Anti-Bloat

### Decision 1: `skills-manage` operations are now policy-interpreted as tier-aware

- Existing control-plane semantics remain unchanged and authoritative: `enable`, `disable`, `list`, `audit`, `sync --dry-run`.
- `Registered but NOT enabled` is now interpreted as **expected** for `manual`, `dormant`, and `candidate-prune` tiers.
- The same audit finding is a **violation** for `default` and `untiered` skills.
- `sync` write-path is explicitly excluded from routine governance because it can auto-enable discovered skills and re-inflate runtime surface.

### Decision 2: Tier metadata contract is mandatory for lifecycle governance

- Governance metadata contract is defined for `opencode-config/skills/registry.json#skills.<skill>.governance`.
- Required fields per governed skill:
  - `tier`,
  - `owner`,
  - `rationale`,
  - `review_date_utc`,
  - `promotion_evidence_refs`.
- Future additions are not considered admitted unless all required fields exist.

### Decision 3: Lifecycle model now explicitly covers admission, graduation, demotion, dormancy, and sunset review

- Defined lifecycle stages and command patterns using existing control-plane operations only.
- Review cadence is now tier-scoped:
  - `default`: 30 days,
  - `manual`: 45 days,
  - `dormant`: 30 days,
  - `candidate-prune`: 21 days.
- Promotion transitions require non-empty promotion evidence and refreshed review date metadata.
- Candidate-prune remains non-destructive and does not authorize remove/deletion by itself.

### Decision 4: Anti-bloat policy now explicitly guards against learning-update drift

- Learning-update changes that touch skill registry or enabled sets must carry tier metadata and transition rationale for each impacted skill.
- Default-surface expansion requires explicit core-loop necessity evidence (planning -> audit -> debug alignment).
- Untiered skill activation is rejected.
- Empty promotion evidence on upward tier transitions is rejected.

### Decision 5: Tier metadata is attached to ongoing governance cadence

- Pre-change checks: `list --all` + `sync --dry-run`.
- Post-change check: `audit`.
- Scheduled governance checks include review-date freshness and learning-update metadata completeness.
- Policy dependency chain is explicit: depends on Task 3 tier recommendations and Task 5 migration semantics, and blocks Task 9 validation.

### Evidence

- `.sisyphus/evidence/control-plane-lifecycle-policy.json`
- `scripts/skills-manage.mjs`
- `opencode-config/skills/registry.json`
- `opencode-config/compound-engineering.json`
- `opencode-config/learning-updates/full-skill-activation-20260308.json`
- `opencode-config/learning-updates/distill-context7-config-wiring-20260308.json`
- `opencode-config/learning-updates/passive-mcp-registry-orchestration-20260310.json`
- `opencode-config/learning-updates/enable-browser-and-dcp-skills-20260310.json`
- `.sisyphus/evidence/skill-classification-recommendations.json`
- `.sisyphus/evidence/migration-semantics-policy.json`
