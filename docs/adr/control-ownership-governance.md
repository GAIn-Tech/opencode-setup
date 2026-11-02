# ADR: Control Ownership Governance

- Status: Accepted
- Date: 2026-03-31
- Owners: Platform Engineering, Security Governance

## Context

Portability trust gates now include multiple release-critical controls (support floor, supply-chain trust, observability integrity, privilege governance, hermeticity, determinism, restore drill). Governance must make ownership explicit so each control has a deterministic accountable team and clear escalation route.

## Control Ownership

| Control | Primary owner | Secondary owner | Accountability artifact |
|---------|---------------|-----------------|-------------------------|
| Support floor contract | Platform Engineering | Release Engineering | `.bun-version`, portability matrix |
| Supply-chain trust gate | Security Engineering | Platform Engineering | `supplyChainReport` |
| Observability integrity gate | Observability Team | Security Engineering | `observabilityIntegrityReport` |
| Privilege governance gate | Security Governance | SRE | `privilegeGovernanceReport` |
| Hermeticity gate | Platform Engineering | SRE | `hermeticityReport` |
| Determinism gate | Platform Engineering | Release Engineering | `determinismReport` |
| Restore-drill gate | SRE | Security Governance | `restoreDrillReport` evidence |
| ADR governance gate | Architecture Council | Security Governance | `adrGovernanceReport` |

## Exception Paths

1. An exception can only be approved when a release-critical gate would otherwise fail and release blocking impact is documented.
2. Exception requests are created in the governance ticket system and escalated to the owning control team.
3. Exception reviewers must validate expiration, scope, and compensating controls before approval.
4. Expired or incomplete exceptions are treated as invalid and the gate remains fail-closed.

## Governance Policies

- Fail-closed by default: any missing ownership artifact or malformed exception metadata blocks strict release verification.
- Time-bound approvals only: every exception must include explicit expiry and be rejected on/after expiration.
- Immutable audit trail: decisions must be represented in deterministic JSON report output for machine aggregation and post-incident review.
- No silent downgrade: control failures cannot be transformed into warning-only outcomes in strict mode.
