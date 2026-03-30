# Ecosystem Tier Model (Canonical)

**Status:** Active guidance  
**Last Updated:** 2026-03-25  
**Primary Evidence Inputs:**

- `.sisyphus/evidence/scenario-taxonomy-model.json`
- `.sisyphus/evidence/skill-classification-recommendations.json`
- `.sisyphus/evidence/package-surface-classification.json`
- `docs/architecture/cli-mcp-surface-policy.md`

---

## 1) Purpose

This document is the canonical narrative source for:

1. Scenario taxonomy (core and secondary scenarios)
2. Capability tier semantics (`default`, `manual`, `dormant`, `candidate-prune`)
3. How skill/package posture should be interpreted in governance and docs

It exists to prevent documentation drift across policy, package inventory, and tier evidence artifacts.

---

## 2) Scenario Taxonomy

### Core default runtime spine

OpenCode default operation is anchored on a 3-scenario loop:

1. **planning-core** (entry)
2. **audit-core** (control loop)
3. **debug-core** (stabilization loop)

Default-layer capabilities should materially improve routine execution of this loop.

### Secondary overlays (manual-first)

Secondary scenarios extend core workflows and are intentionally **manual-first** unless repeated evidence justifies promotion:

- `browser-qa-secondary`
- `architecture-deep-dive-secondary`
- `incident-response-secondary`
- `specialist-framework-secondary`

Secondary capabilities are not “missing defaults”; they are preserved specialist overlays to avoid false activation and default-surface bloat.

---

## 3) Capability Tier Semantics

### Tier definitions

### `default`

- Auto-available baseline for routine planning/audit/debug execution.
- Requires recurring core-loop necessity and low routing noise.

### `manual`

- Discoverable and available, but not baseline first-pass default routing.
- Activated by explicit user intent or strong specialist context.

### `dormant`

- Retained but inactive capability for fallback, compatibility, or migration safety.
- Reactivated only with concrete evidence.

### `candidate-prune`

- Low-value/redundant capability staged for review/removal workflow.
- Not auto-enabled; recommendation queue, not immediate deletion.

### Transition policy

- Preferred demotion: `default -> manual -> dormant -> candidate-prune`
- Preferred reactivation: `candidate-prune -> dormant -> manual -> default`

Direct jumps are discouraged unless strongly justified.

---

## 4) Current Tier and Surface Snapshot (Wave 2)

### Skill tier recommendation snapshot

- **default:** 9
- **manual:** 83
- **dormant:** 5
- **candidate-prune:** 10
- **total skills:** 107

### Package surface snapshot

- **CLI-first:** 7
- **MCP-first:** 2
- **Hybrid:** 1
- **Library-only:** 26
- **total workspace packages:** 36

These counts are intentionally asymmetrical: a narrow default capability core with broad specialist/manual depth.

---

## 5) Interpreting "manual/dormant/candidate-prune" Correctly

Capabilities in non-default tiers are not inherently broken or missing.

- **Manual** means intentionally opt-in specialist capability.
- **Dormant** means retained contingency/fallback capability.
- **Candidate-prune** means review-stage low-signal capability, pending explicit lifecycle decision.

This posture is required to keep the default runtime aligned to planning -> audit -> debug, while preserving optionality and avoiding noisy routing.

---

## 6) Relationship to Other Policy Artifacts

- `docs/architecture/cli-mcp-surface-policy.md` governs **transport posture** (CLI-first, MCP-first, hybrid, library-only).
- This document governs **capability tier posture** and scenario alignment.
- `.sisyphus/evidence/*.json` artifacts remain auditable evidence snapshots and recommendation inputs.

When conflicts appear, reconcile by updating evidence artifacts and this canonical doc together; do not create parallel policy docs with divergent tier semantics.

---

## 7) Explicit Deferred Work: CLI-vs-MCP Expansion

The following is **intentionally deferred** and not part of the current migration/documentation fix scope:

1. Expanding CLI/MCP wrappers for additional library-only packages.
2. Promoting package-only command surfaces into skill-routable namespaces.
3. Reopening broad transport strategy debates outside existing policy criteria.

Future expansion can be evaluated after governance cycles validate current tier posture and discoverability outcomes. Any expansion must follow existing surface policy and tier transition evidence requirements.

---

## 8) Canonical Source-of-Truth Statement

For taxonomy and tier semantics, use this file as canonical narrative guidance:

- `docs/architecture/ecosystem-tier-model.md`

For computed evidence and review inputs, use:

- `.sisyphus/evidence/scenario-taxonomy-model.json`
- `.sisyphus/evidence/skill-classification-recommendations.json`
- `.sisyphus/evidence/package-surface-classification.json`

For package inventory and role listing, use:

- `packages/README.md`
