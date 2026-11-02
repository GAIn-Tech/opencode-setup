# ADR: Exception Governance Policy

- Status: Accepted
- Date: 2026-03-31
- Owners: Security Governance, Architecture Council

## Exception Governance

Strict-mode portability gates are release-blocking controls. Exceptions are permitted only as explicit, audited governance actions with deterministic metadata emitted in verification output.

## Exception Path Contract

All approved exceptions must include the contract fields below:

- `approvalId`: unique immutable approval identifier
- `approvedBy`: accountable approver identity (team or individual)
- `reason`: explicit risk acceptance rationale
- `expiresAt`: ISO-8601 expiration timestamp
- `ticket`: governance/change ticket reference

## Approval and Audit Policy

1. Exception metadata must be valid JSON and all contract fields must be non-empty.
2. `expiresAt` must parse as a valid timestamp and must be in the future at evaluation time.
3. Policy violations (missing fields, invalid timestamp, expired approval) must fail the gate in strict mode.
4. Approved exceptions must emit deterministic audit metadata in report payloads.
