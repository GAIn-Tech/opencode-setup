# Decisions — Total Portability P0 Remediation

## Session: 2026-03-31

### Architectural Decisions

#### ADR-001: Zero-Waiver Enforcement Strategy
- **Context**: Current `verify-portability.mjs` maps `exception-approved` to pass
- **Decision**: Remove all exception/waiver pathways from release verdict logic
- **Rationale**: User policy mandates TOTAL replicability with zero waivers
- **Consequences**: Any P0 gap blocks release; no approval board or time-boxed exceptions

#### ADR-002: Full-Surface Trigger Coverage
- **Context**: CI workflows omit `plugins/**` and `local/**` from triggers
- **Decision**: Expand triggers to cover all source-controlled portability-relevant surfaces
- **Rationale**: Entire-surface policy requires gates run on any relevant change
- **Consequences**: More CI runs, but guarantees no bypass paths

#### ADR-003: Universal Deterministic Proof
- **Context**: Current probe coverage threshold is 50%; MCP proof is telemetry-based
- **Decision**: Require 100% required-surface same-run attestations
- **Rationale**: Total replicability cannot rely on partial or recency-based evidence
- **Consequences**: Longer CI runs, stronger guarantees

#### ADR-004: Signed Evidence Admissibility
- **Context**: No cryptographic binding for portability verdict artifacts
- **Decision**: Enforce CI-only keyless OIDC signing for all release evidence
- **Rationale**: Prevents tampering and ensures same-run provenance
- **Consequences**: Additional CI infrastructure; local runs produce diagnostics only

#### ADR-005: Local-Dependency Elimination
- **Context**: `verify-plugin-parity.mjs` depends on gitignored `local/` paths
- **Decision**: Remove all gitignored dependencies from P0 release decision paths
- **Rationale**: Repo-only reproducibility cannot depend on local-only state
- **Consequences**: Parity checks must use source-controlled or deterministically generated inputs

### Policy Decisions

#### POL-001: Evidence Freshness
- Same-run, same-commit evidence only
- No prior-run reuse, even for same commit
- Timeout = automatic fail, no retries in release pipeline

#### POL-002: Failure Artifacts
- Mandatory bundle on any P0 gate failure
- Missing bundle = policy violation (hard fail)
- Bundle includes: gate JSON, stdout/stderr, runtime trace, sanitized env, commit+run manifest

#### POL-003: Reason Codes
- Machine-readable codes required for all failures
- Free-text explanation required alongside codes
- Standard taxonomy: `EXEC_MISSING_PROOF`, `WIRE_DECLARED_NOT_EXERCISED`, etc.
